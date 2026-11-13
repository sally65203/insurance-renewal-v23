const PREFIX='insurance-preview-v23-'+encodeURIComponent(self.registration.scope)+'-';
const CACHE=PREFIX+'shell-8';
const ASSETS=['./','./index.html','./js/google-calendar-v23.js','./js/excel-import-v23.js','./js/renewal-push.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}).catch(()=>caches.match(event.request)));
});

self.addEventListener('push', event => {
 let payload = {};
 try { payload = event.data?.json() || {}; } catch {}
 const id = typeof payload.id === 'string' ? payload.id : '';
 event.waitUntil(self.registration.showNotification(payload.title || '產險續保', {
  body: payload.body || '請開啟續保 App 查看提醒。',
  icon: new URL('icon-192.png', self.registration.scope).href,
  tag: id ? 'renewal-' + id : 'renewal',
  data: {id}
 }));
});

self.addEventListener('notificationclick', event => {
 event.notification.close();
 const app = new URL(self.registration.scope);
 const id = event.notification.data?.id;
 if (id) app.searchParams.set('pushPolicy', id);
 event.waitUntil((async () => {
  const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client = windows.find(window => {
   const url = new URL(window.url);
   return url.origin === app.origin && [app.pathname, app.pathname + 'index.html'].includes(url.pathname);
  });
  if (client) {
   const moved = await client.navigate(app.href).catch(() => null);
   if (moved) return moved.focus();
  }
  return self.clients.openWindow(app.href);
 })());
});
