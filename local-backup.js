/* Full snapshots, including photos. A failed write never replaces a good backup
   with a reduced copy. IndexedDB is the durable store; localStorage is optional. */
(()=>{'use strict';
 const key='jj_full_proto',dbName='jj_full_backup_v1';
 let db=null,opened=false,revision=0,latest=null,chain=Promise.resolve();
 const clone=v=>JSON.parse(JSON.stringify(v));
 function localRecord(){
  try{
   let value=JSON.parse(localStorage.getItem(key)||'null');if(!value)return null;
   if(value.jjBackupEncoding==='lz-string-utf16-v1')value=JSON.parse(LZString.decompressFromUTF16(value.data));
   const at=Number(value.__jjLocalSavedAt)||0;delete value.__jjLocalSavedAt;
   return {at,state:value};
  }catch(e){console.warn('Local backup could not be read',e);return null;}
 }
 latest=localRecord();
 const ready=new Promise(resolve=>{
  const finish=()=>{opened=true;resolve();};
  try{
   const request=indexedDB.open(dbName,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
   request.onerror=()=>finish();
   request.onblocked=()=>finish();
   request.onsuccess=()=>{
    db=request.result;db.onversionchange=()=>{db.close();db=null;};
    const tx=db.transaction('snapshots','readonly'),get=tx.objectStore('snapshots').get('current');
    get.onsuccess=()=>{const record=get.result;if(revision===0&&record?.state?.projects&&(!latest||record.at>latest.at))latest=record;};
    tx.oncomplete=finish;tx.onerror=finish;tx.onabort=finish;
   };
  }catch(e){finish();}
 });
 function store(record){return new Promise((resolve,reject)=>{
  if(!db){reject(Error('Photo backup storage is unavailable'));return;}
  try{
   const tx=db.transaction('snapshots','readwrite'),s=tx.objectStore('snapshots'),old=s.get('current');
   old.onsuccess=()=>{if(old.result)s.put(old.result,'previous');s.put(record,'current');};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Photo backup could not be saved'));tx.onerror=()=>{};
  }catch(e){reject(e);}
 });}
 const api=window.JJLocalBackup={ready,pending:Promise.resolve(false),read:()=>latest?clone(latest.state):null,
  write(value){
   if(!opened)throw Error('The photo backup is still opening. Please try Save again.');
   const record={at:Math.max(Date.now(),(latest?.at||0)+1),state:clone(value)},seq=++revision;
   latest=record;let localOK=false;
   try{localStorage.setItem(key,JSON.stringify({...record.state,__jjLocalSavedAt:record.at}));localOK=true;}catch(e){/* Keep previous complete copy. */}
   const task=chain.then(()=>store(record)).then(()=>true,error=>{if(!localOK)console.error('Full local backup failed',error);return localOK;});
   chain=task.then(()=>{});api.pending=task;
   task.then(ok=>{if(seq===revision)window.dispatchEvent(new CustomEvent('jj-backup-status',{detail:{ok}}));});
   return localOK;
  },
  async writeFull(value){await ready;api.write(value);if(!await api.pending)throw Error('Could not save the complete backup, including photos. Free device storage and retry.');return true;}
 };
})();
