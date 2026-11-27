CREATE OR REPLACE FUNCTION public.sync_renewal_live(device uuid, sub jsonb, reminders jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('renewal-live-single-device'));
  if sub is null then
    delete from public.renewal_live_devices where id = device;
    return;
  end if;

  if exists(select 1 from public.renewal_live_devices where id <> device) then
    raise unique_violation using message = 'Another device is already active';
  end if;
  insert into public.renewal_live_devices(id, subscription) values(device, sub)
  on conflict (id) do update set subscription = excluded.subscription;

  if sub is not null then
    select coalesce(jsonb_agg(expanded.item), '[]'::jsonb) into reminders
    from jsonb_array_elements(reminders) source(item)
    cross join lateral (
      select coalesce(source.item->'payload'->>'expiry',
        substring(source.item->'payload'->>'body' from '[0-9]{4}/[0-9]{2}/[0-9]{2}')) as expiry_text
    ) expiry
    cross join lateral (
      select source.item
      union all
      select jsonb_build_object(
        'id', 'seven-days:' || (source.item->>'id'),
        'dueAt', ((replace(expiry.expiry_text,'/','-')::date - 7) + time '09:00') at time zone 'Asia/Taipei',
        'payload', (source.item->'payload') || jsonb_build_object(
          'body', '保單將於 ' || replace(expiry.expiry_text,'-','/') || ' 到期，距到期剩 7 天。請確認續保進度。',
          'reminderStage','seven-days'
        )
      )
      where expiry.expiry_text is not null
    ) expanded(item);
  end if;

  delete from public.renewal_live_jobs j where j.device_id = device
    and not exists (select 1 from jsonb_array_elements(reminders) e where e->>'id' = j.policy_id);

  insert into public.renewal_live_jobs as current_job(device_id, policy_id, due_at, payload)
  select device, e->>'id', (e->>'dueAt')::timestamptz, e->'payload'
  from jsonb_array_elements(reminders) e
  on conflict (device_id, policy_id) do update set
    sent_at = case when current_job.due_at = excluded.due_at then current_job.sent_at end,
    lease_until = null, claim = null, due_at = excluded.due_at, payload = excluded.payload
  where current_job.due_at is distinct from excluded.due_at
     or current_job.payload is distinct from excluded.payload;
end;
$function$
