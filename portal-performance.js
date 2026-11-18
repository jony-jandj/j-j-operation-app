/* Conditional metadata reads and bounded, retryable photo loading. */
(()=>{'use strict';
 const versions=new Map();let supported=true,active=null,observer=null,photoTimer,host=null,writing=false;
 const wanted=new Set(),flights=new Map(),failures=new Map(),retryTimers=new Map(),decodeFailures=new Map();
 const backgroundRequests=new Set();
 async function request(client,name,args,timeout=20000,background=false){
  const controller=new AbortController();let timer,query=client.rpc(name,args);
  if(background)backgroundRequests.add(controller);
  if(query.abortSignal)query=query.abortSignal(controller.signal);
  try{
   const result=await Promise.race([Promise.resolve(query),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('The connection timed out.'));controller.abort();},timeout);})]);
   if(controller.signal.aborted)throw new DOMException('Read interrupted','AbortError');
   return result;
  }finally{clearTimeout(timer);backgroundRequests.delete(controller);}
 }
 const photoKey=(record,id)=>record?.photoVersions?.[id]||'';
 const failureKey=id=>active?.token+':'+id+':'+photoKey(active?.record,id);
 function boxes(id){return [...(host?.querySelectorAll('.jj830-photo[data-item-id]')||[])].filter(b=>!id||b.dataset.itemId===id);}
 function schedule(){clearTimeout(photoTimer);photoTimer=setTimeout(loadVisible,30);}
 function retryPhoto(id){failures.delete(failureKey(id));clearTimeout(retryTimers.get(id));retryTimers.delete(id);wanted.add(id);boxes(id).forEach(b=>placeholder(b,'Loading photo…'));schedule();}
 function placeholder(box,text,retry){
  let p=box.querySelector('.jj830-placeholder');if(!p){p=document.createElement('div');p.className='jj830-placeholder';box.append(p);}p.replaceChildren(document.createTextNode(text));
  if(retry){const b=document.createElement('button');b.type='button';b.textContent='Retry photo';b.onclick=retry;p.append(b);}
 }
 const decodeKey=(box,src)=>failureKey(box.dataset.itemId)+(photoKey(active?.record,box.dataset.itemId)?'':':'+src);
 function bindImage(im,box,src){
  if(im.__jjPhotoBox===box)return;im.__jjPhotoBox=box;im.referrerPolicy='no-referrer';
  const key=decodeKey(box,src);
  im.onload=()=>{decodeFailures.delete(key);box.querySelector('.jj830-placeholder')?.remove();};
  im.onerror=()=>{
   im.remove();const count=(decodeFailures.get(key)||0)+1;decodeFailures.set(key,count);
   const retry=()=>{if(!box.isConnected)return;placeholder(box,'Loading photo…');makeImage(box,src);};
   placeholder(box,count===1?'Retrying photo…':'Photo did not load. ',()=>{decodeFailures.delete(key);retry();});
   if(count===1)setTimeout(retry,800);
  };
  if(im.complete){if(im.naturalWidth===0)im.onerror();else im.onload();}
 }
 function makeImage(box,src){
  if(box.querySelector('img'))return;
  const im=document.createElement('img');im.loading='lazy';im.decoding='async';im.alt=active?.record.data.items.find(i=>String(i.id)===box.dataset.itemId)?.title||'Product photo';
  im.src=src;box.append(im);bindImage(im,box,src);
 }
 function paint(box){
  const id=box.dataset.itemId,item=active?.record.data.items.find(i=>String(i.id)===id);
  if(item?.image){
   const im=box.querySelector('img'),key=decodeKey(box,item.image);
   if((decodeFailures.get(key)||0)>=2){im?.remove();placeholder(box,'Photo did not load. ',()=>{decodeFailures.delete(key);makeImage(box,item.image);});}
   else if(im)bindImage(im,box,item.image);
   else makeImage(box,item.image);return true;
  }
  if(!active?.record.deferred.has(id)){placeholder(box,'No product photo');return true;}return false;
 }
 function acceptPhoto(current,id,image){
  // A status-only refresh must not discard an otherwise valid image download.
  if(active?.token!==current.token||photoKey(active.record,id)!==photoKey(current.record,id))return false;
  const item=active.record.data.items.find(i=>String(i.id)===id);if(!item)return false;
  item.image=image;active.record.deferred.delete(id);failures.delete(failureKey(id));wanted.delete(id);boxes(id).forEach(paint);return true;
 }
 function photoError(current,id){
  if(active?.token!==current.token||photoKey(active.record,id)!==photoKey(current.record,id))return;
  const key=failureKey(id),count=(failures.get(key)||0)+1;failures.set(key,count);
  boxes(id).forEach(box=>placeholder(box,count<2?'Retrying photo…':'Photo did not load. ',()=>retryPhoto(id)));
  if(count<2&&!retryTimers.has(id))retryTimers.set(id,setTimeout(()=>{retryTimers.delete(id);if(active?.token===current.token&&active.record.deferred.has(id)){wanted.add(id);schedule();}},1000));
 }
 async function loadVisible(){
  if(!active||writing||document.hidden||new Set(flights.values()).size>=2)return;
  const current=active,ids=[...wanted].filter(id=>!flights.has(failureKey(id))&&current.record.deferred.has(id)&&!retryTimers.has(id)).slice(0,3);
  if(!ids.length)return;
  const keys=ids.map(failureKey);ids.forEach(id=>wanted.delete(id));
  const flight=(async()=>{
   try{
    const r=await request(current.client,'jj_portal_photos',{p_token:current.token,p_ids:ids},20000,true);if(r.error)throw r.error;
    ids.forEach(id=>{const value=r.data?.[id];if(typeof value==='string')acceptPhoto(current,id,value);else photoError(current,id);});
   }catch(e){if(e.name==='AbortError')ids.forEach(id=>wanted.add(id));else ids.forEach(id=>photoError(current,id));}
   finally{keys.forEach(key=>flights.delete(key));if(wanted.size)schedule();}
  })();keys.forEach(key=>flights.set(key,flight));
  // Each batch holds three IDs; keep at most two batches (six photos) in flight.
  if(new Set(flights.values()).size<2&&wanted.size)schedule();
  await flight;
 }
 window.JJPortalRead={request,imageVersion(id){const item=active?.record.data.items.find(i=>String(i.id)===String(id));return photoKey(active?.record,String(id))||item?.image||'';},setWriting(value){
  writing=!!value;
  if(writing){for(const controller of backgroundRequests)controller.abort();}
  else schedule();
 },async read(client,token,{force=false,background=false}={}){
  if(supported){
   const r=await request(client,'jj_portal_read_if_changed',{p_token:token,p_version:force?null:versions.get(token)?.version||null},20000,background);
   if(!r.error){
    const d=r.data;
    if(!d||typeof d.version!=='string'||(!d.unchanged&&!Array.isArray(d.payload?.items)))throw Error('The selections response was incomplete. Retry Refresh selections.');
    if(d.unchanged){const cached=versions.get(token);if(!cached?.data)throw Error('Refresh selections to reload this job.');return {unchanged:true,data:cached.data};}
    const deferred=new Set((d.deferredPhotos||[]).map(String)),prior=versions.get(token);
    for(const item of d.payload.items){const id=String(item.id);if(deferred.has(id)&&d.photoVersions?.[id]&&prior?.photoVersions?.[id]===d.photoVersions[id]){
     const old=prior.data.items.find(i=>String(i.id)===id);if(old?.image){item.image=old.image;deferred.delete(id);}
    }}
    versions.set(token,{version:d.version,data:d.payload,deferred,photoVersions:d.photoVersions||{}});
    if(active?.token!==token){wanted.clear();failures.clear();retryTimers.forEach(clearTimeout);retryTimers.clear();decodeFailures.clear();}
    active={client,token,record:versions.get(token)};
    return {data:d.payload};
   }
   if(['PGRST202','42883'].includes(r.error.code))supported=false;else throw r.error;
  }
  const r=await request(client,'jj_portal_read',{p_token:token},20000,background);if(r.error)throw r.error;
  active={client,token,record:{data:r.data,deferred:new Set(),photoVersions:{}}};
  return {data:r.data};
 },async ensurePhoto(id){
  id=String(id);const current=active;if(!current?.record.deferred.has(id))return;
  const inFlight=flights.get(failureKey(id));if(inFlight){await inFlight;if(!active?.record.deferred.has(id))return;}
  const r=await request(current.client,'jj_portal_photos',{p_token:current.token,p_ids:[id]});if(r.error)throw r.error;
  const image=r.data?.[id];if(typeof image!=='string'||!acceptPhoto(current,id,image))throw Error('Could not load this photo. Retry before editing.');
 },hydrateImages(nextHost){
  host=nextHost;if(!active)return;observer?.disconnect();
  const visible=box=>{
   const id=box.dataset.itemId;if(paint(box))return;
   if((failures.get(failureKey(id))||0)>=2){placeholder(box,'Photo did not load. ',()=>retryPhoto(id));return;}
   placeholder(box,'Loading photo…');wanted.add(id);schedule();
  };
  if(typeof IntersectionObserver==='function')observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);visible(e.target);}},{rootMargin:'200px'});
  boxes().forEach(box=>{if(!paint(box)){if(observer)observer.observe(box);else visible(box);}});
 }};
 window.addEventListener('online',()=>{if(!host)return;boxes().forEach(b=>{if(active?.record.deferred.has(b.dataset.itemId))retryPhoto(b.dataset.itemId);});});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
})();
