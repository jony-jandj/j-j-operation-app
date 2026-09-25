const CACHE_NAME = 'jj-live-redesign-20260925-group-budgets';
const APP_SHELL = [
  './selection-budgets.js',
 './selections-navigation.js',
  "./qrcode.min.js","./work-pay.js","./release-environment.js","./customer-view.js","./parity-features.js","./estimate-full-parser.js","./redesign.css","./ical.js","./design-alignment.css","./homeowner-view-v829.js","./selections-runtime.js","./night-complete.css","./parity-features.css","./redesign.js","./customer-overlay.js","./selections-metadata.js","./calendar-engine.js",
  './work-pay.js','./estimate-full-parser.js',
  './','./index.html','./homeowner.html','./customer-view.js','./customer-overlay.js','./qrcode.min.js','./selections-metadata.js',
  './jj-original-logo.png','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png',
  ...Array.from({length:18},(_,i)=>`./selections-v82/part-${String(i+1).padStart(2,'0')}.txt`)
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith('jj-live-redesign-')&&key!==CACHE_NAME).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!APP_SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
    }
    return response;
  }).catch(async()=>{const cache=await caches.open(CACHE_NAME);return await cache.match(event.request)||await cache.match(event.request,{ignoreSearch:true})||Response.error()}));
});
