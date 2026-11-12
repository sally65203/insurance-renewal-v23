create table public.renewal_push_devices (
  id uuid primary key,
  subscription jsonb not null
);

create table public.renewal_push_jobs (
  device_id uuid not null references public.renewal_push_devices(id) on delete cascade,
  policy_id text not null,
  due_at timestamptz not null,
  payload jsonb not null,
  sent_at timestamptz,
  lease_until timestamptz,
  claim uuid,
  primary key (device_id, policy_id)
);

create index renewal_push_due_idx on public.renewal_push_jobs(due_at) where sent_at is null;
alter table public.renewal_push_devices enable row level security;
alter table public.renewal_push_jobs enable row level security;
revoke all on public.renewal_push_devices, public.renewal_push_jobs from anon, authenticated;
grant select, insert, update, delete on public.renewal_push_devices, public.renewal_push_jobs to service_role;

create function public.sync_renewal_push(device uuid, sub jsonb, reminders jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(device::text));
  if sub is null then
    delete from public.renewal_push_devices where id = device;
    return;
  end if;

  insert into public.renewal_push_devices(id, subscription) values(device, sub)
  on conflict (id) do update set subscription = excluded.subscription;

  delete from public.renewal_push_jobs j where j.device_id = device
    and not exists (select 1 from jsonb_array_elements(reminders) e where e->>'id' = j.policy_id);

  insert into public.renewal_push_jobs as current_job(device_id, policy_id, due_at, payload)
  select device, e->>'id', (e->>'dueAt')::timestamptz, e->'payload'
  from jsonb_array_elements(reminders) e
  on conflict (device_id, policy_id) do update set
    sent_at = case when current_job.due_at = excluded.due_at then current_job.sent_at end,
    lease_until = null, claim = null, due_at = excluded.due_at, payload = excluded.payload
  where current_job.due_at is distinct from excluded.due_at
     or current_job.payload is distinct from excluded.payload;
end;
$$;

create function public.claim_renewal_push()
returns table(device_id uuid, policy_id text, claim uuid, payload jsonb, subscription jsonb)
language sql set search_path = '' as $$
  with pending as (
    select j.device_id, j.policy_id from public.renewal_push_jobs j
    where j.due_at <= now() and j.due_at > now() - interval '1 day'
      and j.sent_at is null and (j.lease_until is null or j.lease_until <= now())
    order by j.due_at limit 15 for update skip locked
  ), claimed as (
    update public.renewal_push_jobs j
    set claim = gen_random_uuid(), lease_until = now() + interval '2 minutes'
    from pending p where j.device_id = p.device_id and j.policy_id = p.policy_id
    returning j.device_id, j.policy_id, j.claim, j.payload
  )
  select c.device_id, c.policy_id, c.claim, c.payload, d.subscription
  from claimed c join public.renewal_push_devices d on d.id = c.device_id;
$$;

revoke execute on function public.sync_renewal_push(uuid,jsonb,jsonb), public.claim_renewal_push() from public, anon, authenticated;
grant execute on function public.sync_renewal_push(uuid,jsonb,jsonb), public.claim_renewal_push() to service_role;
create extension if not exists pg_cron;
create extension if not exists pg_net;
revoke usage on schema net from public, anon, authenticated;
create schema renewal_push_private;
revoke all on schema renewal_push_private from public, anon, authenticated;
grant usage on schema renewal_push_private to service_role;

select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'renewal_push_test_key');
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'renewal_push_cron_key');

create function renewal_push_private.config(keys jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  vapid jsonb;
  settings jsonb;
begin
  if keys is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('renewal_push_vapid'));
    select decrypted_secret::jsonb into vapid from vault.decrypted_secrets where name = 'renewal_push_vapid';
    if vapid is null then
      perform vault.create_secret(keys::text, 'renewal_push_vapid');
    end if;
  end if;

  select jsonb_object_agg(name, decrypted_secret) into settings
  from vault.decrypted_secrets
  where name in ('renewal_push_test_key','renewal_push_cron_key','renewal_push_vapid');
  return settings;
end;
$$;

create function public.renewal_push_config(keys jsonb default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select renewal_push_private.config(keys);
$$;

revoke execute on function renewal_push_private.config(jsonb), public.renewal_push_config(jsonb) from public, anon, authenticated;
grant execute on function renewal_push_private.config(jsonb), public.renewal_push_config(jsonb) to service_role;
