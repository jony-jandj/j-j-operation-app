/* Optional conditional reads. Old database deployments safely keep their read path. */
(()=>{'use strict';
 const versions=new Map();let supported=true,active=null,observer=null,photoFlight=null;
 const wanted=new Set();let photoTimer;
 async function request(client,name,args,timeout=20000){
  const controller=new AbortController();let timer,query=client.rpc(name,args);
  if(query.abortSignal)query=query.abortSignal(controller.signal);
  try{return await Promise.race([Promise.resolve(query),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('The connection timed out. Keep this window open and retry.'));},timeout);})]);}
  finally{clearTimeout(timer);}
 }
 window.JJPortalRead={request,async read(client,token,{force=false}={}){
  if(supported){
   const r=await request(client,'jj_portal_read_if_changed',{p_token:token,p_version:force?null:versions.get(token)?.version||null});
   if(!r.error){
    const d=r.data;
    if(!d||typeof d.version!=='string'||(!d.unchanged&&!Array.isArray(d.payload?.items)))throw Error('The selections response was incomplete. Retry Refresh selections.');
    if(d.unchanged){const cached=versions.get(token);if(!cached?.data)throw Error('Refresh selections to reload this job.');return {unchanged:true,data:cached.data};}
    const deferred=new Set((d.deferredPhotos||[]).map(String)),prior=versions.get(token);
    for(const item of d.payload.items){const id=String(item.id);if(deferred.has(id)&&d.photoVersions?.[id]&&prior?.photoVersions?.[id]===d.photoVersions[id]){
     const old=prior.data.items.find(i=>String(i.id)===id);if(old?.image){item.image=old.image;deferred.delete(id);}
    }}
    wanted.clear();
    versions.set(token,{version:d.version,data:d.payload,deferred,photoVersions:d.photoVersions||{}});active={client,token,record:versions.get(token)};
    return {data:d.payload};
   }
   if(['PGRST202','42883'].includes(r.error.code))supported=false;else throw r.error;
  }
  const r=await request(client,'jj_portal_read',{p_token:token});if(r.error)throw r.error;
  return {data:r.data};
 },async ensurePhoto(id){
  id=String(id);const current=active;if(!current?.record.deferred.has(id))return;
  const r=await request(current.client,'jj_portal_photos',{p_token:current.token,p_ids:[id]});if(r.error)throw r.error;
  if(current!==active)throw Error('The selections changed while loading this photo. Try opening the editor again.');
  const image=r.data?.[id];if(typeof image!=='string')throw Error('Could not load this photo. Retry before editing.');
  const item=current.record.data.items.find(i=>String(i.id)===id);if(item)item.image=image;
  current.record.deferred.delete(id);
 },hydrateImages(host){
  if(!active)return;observer?.disconnect();
  const paint=(box,id)=>{
   const item=active.record.data.items.find(i=>String(i.id)===id);
   if(item?.image){
    if(!box.querySelector('img')){const im=document.createElement('img');im.loading='lazy';im.decoding='async';im.alt=item.title||'Product photo';im.src=item.image;box.querySelector('.jj830-placeholder')?.remove();box.append(im);}
    return true;
   }return !active.record.deferred.has(id);
  };
  observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){const box=e.target,id=box.dataset.itemId;observer.unobserve(box);if(!paint(box,id)){wanted.add(id);clearTimeout(photoTimer);photoTimer=setTimeout(loadVisible,30);}}},{rootMargin:'200px'});
  host.querySelectorAll('.jj830-photo[data-item-id]').forEach(box=>{
   const id=box.dataset.itemId;if(!paint(box,id)){const label=box.querySelector('.jj830-placeholder');if(label)label.textContent='Loading photo…';observer.observe(box);}
  });
  async function loadVisible(){
   if(photoFlight)return;const current=active,ids=[...wanted].slice(0,6);if(!ids.length)return;
   ids.forEach(id=>wanted.delete(id));
   photoFlight=(async()=>{
    try{
     const r=await request(current.client,'jj_portal_photos',{p_token:current.token,p_ids:ids});if(r.error)throw r.error;
     if(current!==active)return;
     for(const id of ids){
      const image=r.data?.[id];if(typeof image!=='string')throw Error('Incomplete photo response');
      const item=current.record.data.items.find(i=>String(i.id)===id);if(item)item.image=image;current.record.deferred.delete(id);
     }
     host.querySelectorAll('.jj830-photo[data-item-id]').forEach(box=>{if(ids.includes(box.dataset.itemId)){paint(box,box.dataset.itemId);const label=box.querySelector('.jj830-placeholder');if(label)label.textContent='No product photo';}});
    }catch(e){
     if(current!==active)return;
     host.querySelectorAll('.jj830-photo[data-item-id]').forEach(box=>{
      if(!ids.includes(box.dataset.itemId))return;const label=box.querySelector('.jj830-placeholder');if(!label)return;
      label.textContent='Photo did not load. ';const retry=document.createElement('button');retry.type='button';retry.textContent='Retry photo';retry.onclick=()=>{label.textContent='Loading photo…';wanted.add(box.dataset.itemId);void loadVisible();};label.append(retry);
     });
    }
   })().finally(()=>{photoFlight=null;if(wanted.size)void loadVisible();});
   await photoFlight;
  }
 }};
})();
