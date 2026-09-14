const CACHE_NAME = 'jj-operations-v59-homeowner-qr-photo-drop';
const APP_SHELL = ['./','./index.html','./qrcode.min.js','./jj-original-logo.png','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('jj-operations-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  // Cache only this app's static shell, never authentication or cloud records.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!APP_SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)).catch(()=>{}));}
    return response;
  }).catch(async()=>await caches.match(event.request)||Response.error()));
});
