/* Durable add-only outbox. No private link tokens are stored. */
(()=>{'use strict';
 const dbReady=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error('Your browser cannot keep an upload safely. Keep this window open and try another browser.'));return;}
  const request=indexedDB.open('jj-homeowner-add-outbox',2);
  request.onupgradeneeded=()=>{const store=request.result.objectStoreNames.contains('adds')?request.transaction.objectStore('adds'):request.result.createObjectStore('adds',{keyPath:'key'});if(!store.indexNames.contains('scope'))store.createIndex('scope','scope');};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Could not keep your upload on this device.'));
 });
 dbReady.catch(()=>{});
 async function transaction(mode,run){const db=await dbReady;return new Promise((resolve,reject)=>{
  const tx=db.transaction('adds',mode),store=tx.objectStore('adds');let result;
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Could not keep your upload on this device.'));
  run(store,value=>{result=value;});
 });}
 const put=record=>transaction('readwrite',(store,done)=>{store.put(record);done(record);});
 const list=scope=>transaction('readonly',(store,done)=>{const r=store.index('scope').getAll(scope);r.onsuccess=()=>done(r.result.sort((a,b)=>a.created-b.created));});
 function retryable(e){return e instanceof TypeError||[408,425,429,500,502,503,504].includes(e.status)||['57014','55P03','40001','40P01','PGRST000','PGRST001','PGRST003'].includes(e.code)||/timeout|timed out|network|fetch|connection|load failed/i.test(e.message||'');}
 async function create({scope,send,enrich,onChange=()=>{},canSend=()=>true}){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope));
  scope=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  await dbReady;let records=await list(scope),running=false,closed=false,timer,activeId=null;const listeners=new Set([onChange]);
  const notify=async()=>{records=await list(scope);for(const listener of listeners)listener(records.map(x=>({...x,active:x.id===activeId})));};
  const schedule=delay=>{if(closed)return;clearTimeout(timer);timer=setTimeout(pump,delay);};
  async function prepare(record){
   if(record.prepared)return record;
   let extra={};if(enrich)try{extra=await enrich(record.payload)||{};}catch{}
   // Competing tabs must send the same immutable payload for the same request ID.
   return transaction('readwrite',(store,done)=>{const get=store.get(record.key);get.onsuccess=()=>{
    const latest=get.result;if(!latest){done(null);return;}
    if(!latest.prepared){latest.payload={...latest.payload,...extra};latest.prepared=true;store.put(latest);}done(latest);
   };});
  }
  async function drain(){
   while(!closed&&navigator.onLine!==false&&canSend()){
    records=await list(scope);const record=records.find(x=>['queued','retry'].includes(x.status)&&(x.next||0)<=Date.now());if(!record)break;
    activeId=record.id;await notify();
    try{
     const ready=await prepare(record);if(!ready)continue;
     await send(structuredClone(ready.payload),ready.id);
     // Keep only a receipt after cloud confirmation; release the photo storage.
     await put({...ready,status:'saved',payload:null,error:'',saved:Date.now(),next:0});
    }catch(e){
     const attempts=(record.attempts||0)+1,auto=retryable(e)&&attempts<4;
     const latest=(await list(scope)).find(x=>x.id===record.id)||record;
     await put({...latest,status:auto?'retry':'failed',attempts,error:e.message||'Could not confirm upload.',next:auto?Date.now()+Math.min(30000,2000*2**(attempts-1)):0});
    }finally{activeId=null;await notify();}
   }
  }
  async function pump(){
   if(running||closed)return;running=true;
   try{if(navigator.locks)await navigator.locks.request('jj-adds:'+scope,{ifAvailable:true},lock=>lock?drain():undefined);else await drain();}
   catch(e){onChange(records,{storageError:e.message});}
   finally{running=false;if(!closed){await notify();if(records.some(x=>['queued','retry'].includes(x.status)))schedule(2000);}}
  }
  const wake=()=>{notify().catch(()=>{});schedule(0);};
  window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
  const beforeUnload=e=>{if(records.some(x=>x.status!=='saved')){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  const api={subscribe(listener){listeners.add(listener);notify().catch(()=>{});return ()=>listeners.delete(listener);},async enqueue(payload,id=crypto.randomUUID()){
   if(closed)throw Error('Reopen this page to add a selection.');
   const existing=(await list(scope)).find(x=>x.id===id);if(existing)return {queued:true};
   const record={key:scope+':'+id,scope,id,title:payload.title||'New selection',payload:structuredClone(payload),prepared:false,created:Date.now(),status:'queued',attempts:0};
   await put(record);await notify();schedule(0);return {queued:true};
  },async retry(id){const record=(await list(scope)).find(x=>x.id===id);if(record&&record.status!=='saved'){await put({...record,status:'queued',attempts:0,next:0});await notify();schedule(0);}},async dismiss(id){const record=(await list(scope)).find(x=>x.id===id);if(record?.status==='saved'){await transaction('readwrite',(store)=>store.delete(record.key));await notify();}},hasPending(){return records.some(x=>x.status!=='saved');},close(){closed=true;clearTimeout(timer);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake);window.removeEventListener('beforeunload',beforeUnload);}};
  await notify();schedule(0);return api;
 }
 function panel(host,{onSaved=()=>{}}={}){
  const box=document.createElement('section');box.className='jj-upload-progress';box.setAttribute('aria-label','Your uploads');host.append(box);let queue,knownSaved=new Set();
  if(!document.getElementById('jjUploadProgressStyle')){const style=document.createElement('style');style.id='jjUploadProgressStyle';style.textContent='.jj-upload-progress{margin:16px 0;padding:16px;border:1px solid #b59a62;border-radius:12px;background:#fff8e9;color:#14234a;overflow-wrap:anywhere}.jj-upload-progress h2{font-size:18px;margin:0 0 8px;color:inherit!important}.jj-upload-progress p{margin:4px 0;color:inherit!important}.jj-upload-progress article{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 0;border:0;border-radius:0;border-top:1px solid #d6c8a5;background:transparent;color:inherit}.jj-upload-progress article>div{flex:1;min-width:160px}.jj-upload-progress small{display:block;color:#46566c!important}.jj-upload-progress button{min-height:44px;padding:10px 14px;background:#f5eddd!important;color:#14234a!important;border:1px solid #aa9667!important;border-radius:8px}.jj-upload-progress[hidden]{display:none!important}';document.head.append(style);}
  const onChange=(records,info={})=>{
   if(!box.isConnected)return;box.replaceChildren();box.hidden=!records.length&&!info.storageError;if(box.hidden)return;
   const saved=records.filter(x=>x.status==='saved');box.dataset.savedCount=String(saved.length);
   const title=document.createElement('h2');title.textContent='Your uploads';box.append(title);
   const note=document.createElement('p');note.setAttribute('role','status');note.setAttribute('aria-live','polite');note.textContent=info.storageError?'Device storage needs attention. Keep this page open.':navigator.onLine===false?'Offline. Your entries are kept on this device and will retry when connected.':records.some(x=>x.status!=='saved')?'You can keep browsing and adding. Uploads save in the background while this page is open.':'Your uploads are saved.';box.append(note);
   if(saved.length){const summary=document.createElement('p');summary.textContent='Saved to J&J: '+saved.length;const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='Dismiss saved';dismiss.onclick=()=>Promise.all(saved.map(x=>queue?.dismiss(x.id))).catch(()=>{});summary.append(' ',dismiss);box.append(summary);}
   for(const record of records){
    if(record.status==='saved'){if(!knownSaved.has(record.id)){knownSaved.add(record.id);onSaved();}continue;}
    const row=document.createElement('article'),text=document.createElement('div'),name=document.createElement('strong'),state=document.createElement('small');name.textContent=record.title;state.textContent=record.active?'Uploading…':record.status==='failed'?'Needs retry — entry kept on this device':record.status==='retry'?'Connection slow — retrying automatically':'Waiting to upload';text.append(name,state);row.append(text);
    if(record.status==='failed'){const detail=document.createElement('small');detail.textContent=record.error||'';text.append(detail);const retry=document.createElement('button');retry.type='button';retry.textContent='Retry upload';retry.onclick=()=>queue?.retry(record.id).catch(()=>{});row.append(retry);}
    box.append(row);
   }
  };
  return {onChange,setQueue(value){queue=value;},remove(){box.remove();}};
 }
 window.JJBackgroundAdds={create,panel};
})();
