importScripts('./request-work-push-sw.js?v=20261026-descriptive');
const CACHE_NAME = 'jj-live-20261111-workflow-speed';
const APP_SHELL = [
 './homeowner-app.js','./homeowner-ready.js',
 './whole-number-controls.js','./staff-favorites.js',
 './mobile-print.js',
 './customer-simple-add.js',
 './selection-group-order.js',
 './po-work-preview.js',
 './selection-print.js',
 './request-work-push.js','./request-work-push-sw.js',
 './request-work.js','./request-work.css',
  './selection-budgets.js',
 './selections-navigation.js',
  "./qrcode.min.js","./work-pay.js","./release-environment.js","./customer-view.js","./parity-features.js","./estimate-full-parser.js","./redesign.css","./ical.js","./design-alignment.css","./homeowner-view-v829.js","./selections-runtime.js","./night-complete.css","./parity-features.css","./redesign.js","./customer-overlay.js","./selections-metadata.js","./calendar-engine.js",
  './work-pay.js','./estimate-full-parser.js',
  './','./index.html','./homeowner.html','./customer-view.js','./customer-overlay.js','./qrcode.min.js','./selections-metadata.js',
  './jj-original-logo.png','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png',
  ...Array.from({length:18},(_,i)=>`./selections-v82/part-${String(i+1).padStart(2,'0')}.txt`)
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.allSettled([...new Set(APP_SHELL)].map(path=>cache.add(path)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith('jj-live-')&&key!==CACHE_NAME).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!APP_SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))return;
  // A slow connection must not hold an already installed app on a blank screen.
  const cached=()=>caches.open(CACHE_NAME).then(async cache=>await cache.match(event.request)||await cache.match(event.request,{ignoreSearch:true}));
  const network=fetch(event.request).then(async response=>{
    if(response.ok){try{const cache=await caches.open(CACHE_NAME);await cache.put(event.request,response.clone());}catch{}}
    return response;
  });
  event.waitUntil(network.then(()=>{},()=>{}));
  event.respondWith((async()=>{
    let timer;
    try{
      const response=await Promise.race([network,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),4000);})]);
      if(response)return response;
      const saved=await cached();return saved||await network;
    }catch{return await cached()||Response.error();}
    finally{clearTimeout(timer);}
  })());
});
