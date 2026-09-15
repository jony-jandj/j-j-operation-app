const CACHE_NAME = 'jj-operations-v82-3-sidebar-routing-fix';
const APP_SHELL = [
  './','./index.html','./homeowner.html','./qrcode.min.js','./selections-metadata.js',
  './jj-original-logo.png','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png',
  ...Array.from({length:15},(_,i)=>`./selections-v82/part-${String(i+1).padStart(2,'0')}.txt`)
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith('jj-operations-')&&key!==CACHE_NAME).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  // Network-first for the app shell so GitHub updates win immediately.
  // Cloud/auth/API requests are never cached here.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!APP_SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
    }
    return response;
  }).catch(async()=>await caches.match(event.request)||Response.error()));
});
