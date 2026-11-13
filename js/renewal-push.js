(() => {
 'use strict';
 const storageKey = 'insurance-v23-push-test';
 const status = text => { $('renewalPushStatus').textContent = text; };
 let settings, registration, running, dirty = false, disabling = false;

 function readSettings() {
  try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); }
  catch { return null; }
 }

 function testPolicyId() { return 'push-test-' + settings.device; }

 async function request(action, subscription, extra = {}) {
  const result = await fetch(settings.url, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', 'X-Renewal-Key': settings.key },
   body: JSON.stringify({ action, device: settings.device, subscription, ...extra }),
   signal: AbortSignal.timeout(12000)
  });
  if (!result.ok) {
   throw new Error(result.status === 401 ? '測試授權或網站設定不正確。' : '通知服務暫時無法處理（' + result.status + '）。');
  }
  return result.json();
 }

 function keyBytes(key) {
  if (!/^[A-Za-z0-9_-]{87}$/.test(key)) throw new Error('請輸入通知公開金鑰。');
  return Uint8Array.from(atob(key.replaceAll('-', '+').replaceAll('_', '/') + '='), character => character.charCodeAt(0));
 }

 async function currentPolicies() {
  await ensureDatabase();
  return new Promise((resolve, reject) => {
   const read = transaction('readonly').get(testPolicyId());
   read.onsuccess = () => resolve(read.result ? [read.result] : []);
   read.onerror = () => reject(read.error);
  });
 }

 function buildReminders(policies, today) {
  return renewalEvents(policies).filter(event => event.date >= today).map(event => ({
   id: event.policy.id, date: event.date, title: event.title, expiry: event.policy.end
  }));
 }

 function sync() {
  if (!settings || !registration || disabling) return Promise.resolve(false);
  dirty = true;
  if (running) return running;
  const run = async () => {
   do {
    dirty = false;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) throw new Error('通知訂閱不存在，請重新開啟通知。');
    const reminders = buildReminders(await currentPolicies(), renewalToday());
    await request('sync', sub.toJSON(), {reminders});
    status(reminders.length ? '已同步測試保單提醒。' : '目前沒有待發送的測試保單提醒。');
   } while (dirty && !disabling);
   return true;
  };
  running = (navigator.locks ? navigator.locks.request(storageKey, run) : run())
   .catch(error => { status('同步未完成。' + error.message + ' 請連線後再試。'); return false; })
   .finally(() => { running = null; });
  return running;
 }

 async function enable() {
  try {
   if (!registration) throw new Error('請從支援通知的主畫面 App 開啟測試版。');
   const url = new URL($('renewalPushUrl').value.trim());
   if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)
      || url.port || url.username || url.password || url.pathname !== '/functions/v1/renewal-push'
      || url.search || url.hash) throw new Error('請輸入正確的 Supabase 通知服務網址。');
   const key = $('renewalPushKey').value.trim();
   const publicKey = $('renewalPushPublicKey').value.trim();
   if (key.length < 32) throw new Error('請輸入測試授權碼。');
   if (settings && (settings.url !== url.href || settings.key !== key || settings.publicKey !== publicKey))
    throw new Error('請先停用原有通知，再設定新的通知服務。');
   const applicationServerKey = keyBytes(publicKey);
   // Subscribe directly from the button handler so iOS can use the tap to show its permission prompt.
   await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey});
   settings = {url:url.href, key, publicKey, device:settings?.device || crypto.randomUUID()};
   localStorage.setItem(storageKey, JSON.stringify(settings));
   updateControls();
   await sync();
  } catch (error) { status('未能開啟通知。' + error.message); }
 }

 async function createPolicy() {
  if (!settings) return;
  try {
   const existing = await currentPolicies();
   if (existing.length) { edit(testPolicyId()); return; }
   const today = calendarDay(renewalToday());
   const expiry = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth()+2, 1)).toISOString().slice(0,10);
   await save({id:testPolicyId(), created:new Date().toISOString(), customer:'通知測試保單', company:'其他',
    type:'強制險', plate:'TEST-123', number:'', status:'待續保', end:expiry});
   refresh();
   status('已建立測試保單，可開啟保單修改到期日或狀態。');
  } catch (error) { status('未能建立測試保單。' + error.message); }
 }

 async function test() {
  if (!settings) return;
  try {
   if (!(await currentPolicies()).length) throw new Error('請先建立測試保單。');
   const sub = await registration.pushManager.getSubscription();
   if (!sub) throw new Error('請重新開啟通知。');
   await request('test', sub.toJSON());
   status('推播服務已接受測試通知，請在 iPhone 確認通知是否出現。');
  } catch (error) { status('測試通知未能送出。' + error.message); }
 }

 async function disable() {
  if (!settings || disabling) return;
  disabling = true;
  try {
   await running;
   await request('disable', null);
   const sub = await registration?.pushManager.getSubscription();
   if (sub) await sub.unsubscribe().catch(() => false);
   localStorage.removeItem(storageKey);
   settings = null;
   $('renewalPushKey').value = '';
   updateControls();
   status('已取消這部裝置的通知排程。');
  } catch (error) { status('未確認停用。' + error.message + ' 請連線後再試。'); }
  finally { disabling = false; }
 }

 function updateControls() {
  $('renewalPushEnable').disabled = !registration;
  $('renewalPushTest').disabled = $('renewalPushPolicy').disabled = !settings || !registration;
  $('renewalPushDisable').disabled = !settings;
 }

 async function init() {
  settings = readSettings();
  if (new URL(location.href).searchParams.has('pushPolicy')) refresh();
  if (settings) {
   $('renewalPushUrl').value = settings.url;
   $('renewalPushPublicKey').value = settings.publicKey;
   $('renewalPushKey').value = settings.key;
  }
  $('renewalPushEnable').onclick = enable;
  $('renewalPushTest').onclick = test;
  $('renewalPushPolicy').onclick = createPolicy;
  $('renewalPushDisable').onclick = disable;
  window.addEventListener('online', sync);
  window.addEventListener('pageshow', sync);
  updateControls();
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
   status('請使用支援通知的瀏覽器。iPhone 請從主畫面開啟。');
   return;
  }
  try {
   await navigator.serviceWorker.register('./sw.js');
   registration = await navigator.serviceWorker.ready;
   updateControls();
   if (settings) await sync();
  } catch (error) { status('通知元件無法啟動。' + error.message); }
 }

 function openLinkedPolicy() {
  const url = new URL(location.href);
  const id = url.searchParams.get('pushPolicy');
  if (id === null) return;
  url.searchParams.delete('pushPolicy');
  history.replaceState(null, '', url);
  if (records.some(policy => policy.id === id)) edit(id);
  else msg('找不到通知對應的保單。');
 }

 window.RenewalPush = { sync, openLinkedPolicy };
 window.addEventListener('load', init);
})();
