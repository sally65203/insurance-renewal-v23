(() => {
 'use strict';
 const storageKey='insurance-v24-live-push';
 const endpoint='https://mcjhnwlsgiwmmnlakakg.supabase.co/functions/v1/renewal-live';
 let registration, running, dirty=false, busy=false;

 function settings(){
  try{return JSON.parse(localStorage.getItem(storageKey)||'null')}catch{return null}
 }
 function status(text){$('renewalPushStatus').textContent=text}
 function updateControls(){
  const config=settings();
  $('renewalPushEnable').disabled=!registration||busy||!!config;
  $('renewalPushTest').disabled=!registration||busy||!config;
  $('renewalPushActivate').disabled=!registration||busy||!config||config.active||!config.tested;
  $('renewalPushDisable').disabled=busy||!config;
  $('renewalPushKey').disabled=busy||!!config;
 }
 async function request(config,action,subscription,reminders){
  const response=await fetch(endpoint,{
   method:'POST',headers:{'Content-Type':'application/json','X-Renewal-Key':config.key},
   body:JSON.stringify({action,device:config.device,subscription,reminders}),
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok){
   if(response.status===401)throw Error('開通碼無效。');
   if(response.status===409)throw Error('另一部裝置已啟用續保推播，請先在原裝置停用。');
   throw Error('通知服務暫時無法處理（'+response.status+'）。');
  }
  return response.json();
 }
 async function subscription(){
  const sub=await registration?.pushManager.getSubscription();
  if(!sub)throw Error('找不到通知訂閱，請停用並重新開通。');
  return sub.toJSON();
 }
 async function currentPolicies(){
  await ensureDatabase();
  return new Promise((resolve,reject)=>{
   const read=transaction('readonly').getAll();
   read.onsuccess=()=>resolve(read.result);
   read.onerror=()=>reject(read.error);
  });
 }
 function buildReminders(policies,today){
  return renewalEvents(policies).filter(event=>event.date>=today&&!String(event.policy.id).startsWith('push-test-')).map(event=>({
   id:event.policy.id,date:event.date,title:event.title.slice(0,140),expiry:event.policy.end
  }));
 }
 async function publish(config){
  const sub=await subscription();
  const reminders=buildReminders(await currentPolicies(),renewalToday());
  const result=await request(config,'sync',sub,reminders);
  status('正式保單推播已同步 · '+result.scheduled+' 筆提醒');
 }
 const lock=work=>navigator.locks?navigator.locks.request(storageKey,work):work();
 function sync(){
  if(!settings()?.active||!registration)return Promise.resolve();
  dirty=true;
  if(busy)return Promise.resolve();
  if(running)return running;
  running=lock(async()=>{
   do{
    dirty=false;
    const config=settings();
    if(!config?.active||busy)return;
    await publish(config);
   }while(dirty&&!busy);
  }).catch(error=>status('推播排程未同步：'+error.message+' 請連線後重新開啟本頁。'))
    .finally(()=>{running=null});
  return running;
 }
 async function perform(work){
  if(busy)return;
  busy=true;updateControls();
  try{await work()}
  catch(error){status(error.message)}
  finally{busy=false;updateControls();if(dirty&&settings()?.active)sync()}
 }
 function enable(){
  return perform(async()=>{
   const key=$('renewalPushKey').value.trim();
   if(!/^[a-f0-9]{64}$/i.test(key))throw Error('請貼上正式通知開通碼。');
   const publicKey=$('renewalPushPublicKey').value;
   const applicationServerKey=Uint8Array.from(atob(publicKey.replaceAll('-','+').replaceAll('_','/')+'='),c=>c.charCodeAt(0));
   await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
   const config={key,device:crypto.randomUUID(),active:false,tested:false};
   localStorage.setItem(storageKey,JSON.stringify(config));
   $('renewalPushKey').value='';
   status('已取得通知權限，請先傳送測試通知。');
  });
 }
 function test(){
  return perform(async()=>{
   const config=settings();
   await request(config,'test',await subscription());
   localStorage.setItem(storageKey,JSON.stringify({...config,tested:true}));
   status('測試通知已送出。收到後，即可設定正式保單推播。');
  });
 }
 function activate(){
  const config=settings();
  if(!config?.tested||config.active)return;
  if(!confirm('確認已收到測試通知，且已關閉 iPhone 上「產險續保提醒」日曆的事件提示。啟用後會將車牌、險種、日期和本機紀錄識別碼送到 Supabase 排程。確定啟用？'))return;
  return perform(()=>lock(async()=>{
   const pending={...config,activationPending:true};
   localStorage.setItem(storageKey,JSON.stringify(pending));
   await publish(pending);
   localStorage.setItem(storageKey,JSON.stringify({...pending,active:true,activationPending:false}));
  }));
 }
 function disable(){
  return perform(async()=>{
   await running;
   await lock(async()=>{
    const config=settings();
    if(!config)return;
    if(config.active||config.activationPending)await request(config,'disable',null);
    const sub=await registration?.pushManager.getSubscription();
    if(sub)await sub.unsubscribe().catch(()=>false);
    localStorage.removeItem(storageKey);
    status('已停用這部裝置的推播。如要使用 Google 日曆提醒，請重新開啟該日曆的事件提示。');
   });
  });
 }
 function openLinkedPolicy(){
  const url=new URL(location.href),id=url.searchParams.get('pushPolicy');
  if(id===null)return;
  url.searchParams.delete('pushPolicy');
  history.replaceState(null,'',url);
  if(records.some(policy=>policy.id===id))edit(id);
  else msg('找不到通知對應的保單。');
 }
 async function init(){
  $('renewalPushEnable').onclick=enable;
  $('renewalPushTest').onclick=test;
  $('renewalPushActivate').onclick=activate;
  $('renewalPushDisable').onclick=disable;
  window.addEventListener('online',sync);
  window.addEventListener('pageshow',sync);
  window.addEventListener('storage',event=>{if(event.key===storageKey)updateControls()});
  if(new URL(location.href).searchParams.has('pushPolicy'))refresh();
  updateControls();
  if(!('serviceWorker' in navigator)||!('PushManager' in window)){
   status('iPhone 請從主畫面圖示開啟，才能啟用通知。');return;
  }
  try{
   await navigator.serviceWorker.register('./sw.js');
   registration=await navigator.serviceWorker.ready;
   updateControls();
   const config=settings();
   if(config?.active)await sync();
   else if(config)status(config.tested?'請確認收到測試通知，再啟用正式保單推播。':'已取得通知權限，請先傳送測試通知。');
  }catch(error){status('通知元件無法啟動：'+error.message)}
 }
 window.RenewalPush={sync,openLinkedPolicy};
 window.addEventListener('load',init);
})();
