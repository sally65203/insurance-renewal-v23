import { createClient } from 'npm:@supabase/supabase-js@2.98.0';
import webpush from 'npm:web-push@3.6.7';
import { createHash, timingSafeEqual } from 'node:crypto';

const env = name => Deno.env.get(name) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const allowedOrigin = 'https://insurance-renewal-push-test.sally24758.chatgpt.site';
const subject = allowedOrigin;

async function config(keys = null) {
 const {data, error} = await admin.rpc('renewal_push_config', {keys});
 if (error || !data) throw new Error('Push configuration unavailable');
 return data;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(value, expected = '') {
 const digest = text => createHash('sha256').update(text).digest();
 return expected.length >= 32 && timingSafeEqual(digest(value ?? ''), digest(expected));
}

function subscription(value) {
 const endpoint = new URL(value?.endpoint);
 // Only send to known browser push services. Never use a client-provided arbitrary host.
 const validHost = endpoint.hostname.endsWith('.push.apple.com')
  || ['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(endpoint.hostname);
 if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password
   || endpoint.hash || !validHost || endpoint.href.length > 2000
   || !/^[\w-]{87}$/.test(value.keys?.p256dh)
   || !/^[\w-]{22}$/.test(value.keys?.auth)) throw new Error('Invalid subscription');
 return { endpoint: endpoint.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

function reminders(items, device) {
 if (!Array.isArray(items) || items.length > 1) throw new Error('Invalid reminders');
 return items.map(item => {
  const {id, date, title, expiry} = item;
  if (id !== 'push-test-' + device
   || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)
   || typeof title !== 'string' || title.length > 140) throw new Error('Invalid reminder');
  return {id, dueAt: date + 'T01:00:00Z', payload: {id, title, body: '保單將於 ' + expiry.replaceAll('-', '/') + ' 到期'}};
 });
}

async function send(sub, payload, {publicKey, privateKey}) {
 const options = { TTL: 1800, timeout: 8000, vapidDetails: {subject, publicKey, privateKey} };
 // Encryption and VAPID signing use web-push. Fetch with redirects disabled.
 const request = webpush.generateRequestDetails(sub, JSON.stringify(payload), options);
 const response = await fetch(request.endpoint, {
  method: request.method, headers: request.headers, body: request.body,
  redirect: 'error', signal: AbortSignal.timeout(8000)
 });
 return response.status;
}

async function dispatch(keys) {
 const { data, error } = await admin.rpc('claim_renewal_push');
 if (error) throw error;
 const result = await Promise.allSettled(data.map(async job => {
  const pending = admin.from('renewal_push_jobs').update({sent_at: new Date().toISOString()})
   .eq('device_id', job.device_id).eq('policy_id', job.policy_id).eq('claim', job.claim);
  const active = await admin.from('renewal_push_jobs').select('claim')
   .eq('device_id', job.device_id).eq('policy_id', job.policy_id).eq('claim', job.claim).maybeSingle();
  if (active.error) throw active.error;
  if (!active.data) return false;
  const status = await send(job.subscription, job.payload, keys);
  if ([404, 410].includes(status)) {
   const removed = await admin.from('renewal_push_devices').delete().eq('id', job.device_id)
    .filter('subscription->>endpoint', 'eq', job.subscription.endpoint);
   if (removed.error) throw removed.error;
   return false;
  }
  if (status < 200 || status >= 300) throw new Error('Push delivery failed');
  const updated = await pending;
  if (updated.error) throw updated.error;
  return true;
 }));
 return { sent: result.filter(item => item.status === 'fulfilled' && item.value).length,
  failed: result.filter(item => item.status === 'rejected').length };
}

Deno.serve(async request => {
 const origin = request.headers.get('Origin');
 const headers = origin && origin === allowedOrigin ? {
  'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Renewal-Key', 'Vary': 'Origin'
 } : {};
 const respond = (body, status = 200) => Response.json(body, {status, headers});
 if (request.method === 'OPTIONS') return new Response(null, {status: origin === allowedOrigin ? 204 : 403, headers});
 if (request.method !== 'POST') return respond({error:'Method not allowed'}, 405);
 const auth = request.headers.get('X-Renewal-Key');
 if (!auth || auth.length > 128 || (origin && origin !== allowedOrigin)) return respond({error:'Unauthorized'}, 401);
 try {
  let settings = await config();
  const cron = !origin && authorized(auth, settings.renewal_push_cron_key);
  if (!cron && (origin !== allowedOrigin || !authorized(auth, settings.renewal_push_test_key)))
   return respond({error:'Unauthorized'}, 401);

  if (!settings.renewal_push_vapid) settings = await config(webpush.generateVAPIDKeys());
  const keys = JSON.parse(settings.renewal_push_vapid);
  if (cron) return respond(await dispatch(keys));

  const body = await request.text();
  if (body.length > 400000) return respond({error:'Request too large'}, 413);
  let input, sub, jobs;
  try {
   input = JSON.parse(body);
   if (!uuid.test(input.device)) throw new Error('Invalid device');
   if (input.action !== 'disable') sub = subscription(input.subscription);
   if (input.action === 'sync') jobs = reminders(input.reminders, input.device);
  } catch {
   return respond({error:'Invalid request'}, 400);
  }
  if (input.action === 'test') {
   const status = await send(sub, {id: 'push-test-' + input.device, title:'續保提醒｜TEST-123｜強制險',
    body:'這是一則測試通知。點一下可回到續保 App。'}, keys);
   return respond({accepted:status >= 200 && status < 300}, status >= 200 && status < 300 ? 200 : 502);
  }
  if (input.action !== 'sync' && input.action !== 'disable') return respond({error:'Invalid action'}, 400);
  const {error} = await admin.rpc('sync_renewal_push', {device:input.device, sub:sub ?? null, reminders:jobs ?? []});
  if (error) throw error;
  return respond({scheduled:jobs?.length ?? 0});
 } catch {
  return respond({error:'Push operation failed'}, 502);
 }
});
