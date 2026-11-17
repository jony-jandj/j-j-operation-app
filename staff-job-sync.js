/* Staff sync keeps complete jobs/photos, transferring only changed job records. */
(()=>{'use strict';
 const oldRequest=cloudStateRequest,flights=new Map();let db=null,missingUntil=0;
 const memory=new Map(),clone=v=>JSON.parse(JSON.stringify(v));
 const ready=new Promise(resolve=>{
  let done=false;const finish=()=>{if(!done){done=true;resolve()}};const timer=setTimeout(finish,1500);
  try{const r=indexedDB.open('jj-staff-job-sync-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('jobs');r.onerror=r.onblocked=finish;r.onsuccess=()=>{db=r.result;db.onversionchange=()=>{db.close();db=null};clearTimeout(timer);finish()}}catch{finish()}
 });
 function keepMemory(hash,project){memory.set(hash,clone(project));while(memory.size>32)memory.delete(memory.keys().next().value)}
 async function cached(hash){await ready;if(memory.has(hash))return clone(memory.get(hash));if(!db)return null;
  return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value)};
   const timer=setTimeout(()=>{db=null;finish(null)},1500);
   try{const tx=db.transaction('jobs','readonly'),r=tx.objectStore('jobs').get(hash);r.onsuccess=()=>finish(r.result||null);r.onerror=()=>finish(null);tx.onabort=()=>finish(null)}catch{finish(null)}
  });
 }
 async function remember(hash,project){keepMemory(hash,project);if(!db)return;
  await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve()};
   const timer=setTimeout(()=>{db=null;finish()},1500);
   try{const tx=db.transaction('jobs','readwrite');tx.objectStore('jobs').put(project,hash);tx.oncomplete=tx.onerror=tx.onabort=finish}catch{finish()}
  });
 }
 async function prune(hashes){if(!db)return;try{const tx=db.transaction('jobs','readwrite'),store=tx.objectStore('jobs'),r=store.openKeyCursor();r.onsuccess=()=>{const c=r.result;if(c){if(!hashes.has(c.key))store.delete(c.key);c.continue()}}}catch{}}
 const stamp=v=>Date.parse(v)*1000+Number((String(v).match(/\.(\d+)/)?.[1]||'').padEnd(6,'0').slice(3,6));
 const missing=e=>['PGRST202','42883'].includes(e?.code);
 async function rpc(client,name,args,label){const r=await oldRequest(client.rpc(name,args),label,/Load job cloud data/.test(label)?120000:20000);if(r.error)throw r.error;return r.data;}
 async function snapshot(client,expected){
  for(let attempt=0;attempt<3;attempt++){
   const manifest=await rpc(client,'jj_staff_sync_manifest',{p_expected_version:expected},'Check job sync version');
   if(manifest===null)return {data:null,error:null};
   if(!manifest?.updated_at||!Array.isArray(manifest.projects)||!manifest.shared||typeof manifest.shared!=='object')throw Error('Job sync response is incomplete. Your edits remain on this device.');
   const jobs=new Array(manifest.projects.length);let next=0,completed=0;
   const worker=async()=>{while(next<manifest.projects.length){const slot=next++,meta=manifest.projects[slot];
    if(meta.index!==slot||!/^[a-f0-9]{64}$/.test(meta.digest))throw Error('Job sync index is invalid.');
    let project=await cached(meta.digest);
    if(!project||String(project.id)!==String(meta.id)){
     const r=await rpc(client,'jj_staff_sync_project',{p_version:manifest.updated_at,p_index:slot},'Load job cloud data');
     if(!r||stamp(r.updated_at)!==stamp(manifest.updated_at)||r.index!==slot||r.digest!==meta.digest||!r.project||String(r.project.id)!==String(meta.id))throw Error('SYNC_VERSION_CHANGED');
     project=r.project;await remember(meta.digest,project);
    }
    jobs[slot]=project;completed++;
    if(!cloudSaveInFlight&&!cloudApplying)setCloudStatus('Loading jobs '+completed+'/'+manifest.projects.length,'saving');
   }};
   const results=await Promise.allSettled([worker(),worker()]);const failed=results.find(r=>r.status==='rejected');
   if(failed){if(/SYNC_VERSION_CHANGED/.test(String(failed.reason?.message))&&!expected)continue;throw failed.reason}
   // Do not assemble records from different cloud revisions if a save arrived mid-download.
   const r=await oldRequest(client.from('app_state').select('updated_at').eq('org_id',CLOUD_ORG_ID).maybeSingle(),'Confirm job sync version');
   if(r.error)throw r.error;
   if(stamp(r.data?.updated_at)!==stamp(manifest.updated_at)){if(expected)return {data:null,error:null};continue}
   await prune(new Set(manifest.projects.map(p=>p.digest)));
   return {data:{state:{...manifest.shared,projects:jobs},updated_at:manifest.updated_at},error:null};
  }
  throw Error('Jobs changed during syncing. Your edits are kept; please retry.');
 }
 cloudStateRequest=async function(query,label,timeout){
  const read=/^(Load live app data|Read latest cloud data|Refresh cloud data|Verify saved cloud data)$/.test(label);
  if(!read||!cloudClient?.rpc||Date.now()<missingUntil)return oldRequest(query,label,timeout);
  let expected=null;try{const value=query.url?.searchParams?.get('updated_at');if(value?.startsWith('eq.'))expected=value.slice(3)}catch{}
  const client=cloudClient,key=expected||'latest';let flight=flights.get(key);
  if(!flight||flight.client!==client){flight={client,promise:snapshot(client,expected)};flights.set(key,flight);flight.promise.finally(()=>{if(flights.get(key)===flight)flights.delete(key)}).catch(()=>{})}
  try{return clone(await flight.promise)}catch(e){if(missing(e)){missingUntil=Date.now()+60000;return oldRequest(query,label,timeout)}throw e}
 };
 function resume(){if(document.hidden||!cloudLoadedForUser)return;if(typeof cloudAccountChanged!=='undefined'&&cloudAccountChanged){setCloudStatus('Sign-in changed','offline');return;}if(window.JJSaveConflicts?.hasPending()){setCloudStatus('Review changes to finish saving','offline');return;}if(cloudSaveQueued){if(!cloudSaveInFlight){cloudRetryCount=0;queueCloudSave()}}else pollCloudState()}
 window.addEventListener('pageshow',resume);window.addEventListener('focus',resume);
 document.addEventListener('focusout',()=>setTimeout(resume,0));
 let manual=false;
 window.JJSyncLatestJobs=async()=>{
  if(manual||cloudSaveInFlight||cloudPollInFlight){toast('Sync is already running. Please keep the app open.');return}
  if(!cloudLoadedForUser){toast('Sign in before syncing the latest jobs.');return}
  const field=document.activeElement;if(['INPUT','TEXTAREA','SELECT'].includes(field?.tagName))field.blur();
  if(cloudEditorActive()){toast('Finish or close the open editor before syncing. Your edits are kept.');return}
  manual=true;
  try{if(window.JJTestWorkPay?.flushEdits&&!await window.JJTestWorkPay.flushEdits())return;
   if(window.JJSaveConflicts?.hasPending()){window.JJSaveConflicts.review();return}
   clearTimeout(cloudSaveTimer);cloudRetryCount=0;await pushCloudState();
  }finally{manual=false}
 };
 window.JJStaffJobSync={version:'20261116',ready};
})();
