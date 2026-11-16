/* Complete device recovery. Never discard photos to fit localStorage.
   Coalesce rapid edits, retain the previous snapshot and seven daily copies. */
(()=>{'use strict';
 const key='jj_full_proto',dbName='jj_full_backup_v1';
 let db=null,opened=false,revision=0,latest=null,queued=null,running=false;
 const clone=v=>JSON.parse(JSON.stringify(v));
 const day=at=>{const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 function localRecord(){try{
  let value=JSON.parse(localStorage.getItem(key)||'null');if(!value)return null;
  if(value.jjBackupEncoding==='lz-string-utf16-v1')value=JSON.parse(LZString.decompressFromUTF16(value.data));
  const at=Number(value.__jjLocalSavedAt)||0,base=value.__jjRecoveryBase;
  delete value.__jjLocalSavedAt;delete value.__jjRecoveryBase;
  return {at,state:value,base};
 }catch(e){console.warn('Local backup could not be read',e);return null;}}
 latest=localRecord();
 const ready=new Promise(resolve=>{
  let finished=false;const finish=()=>{if(!finished){finished=true;opened=true;resolve();}};
  const timer=setTimeout(finish,4000);
  try{
   const request=indexedDB.open(dbName,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
   request.onerror=request.onblocked=()=>{clearTimeout(timer);finish();};
   request.onsuccess=()=>{
    db=request.result;db.onversionchange=()=>{db.close();db=null;};
    const tx=db.transaction('snapshots','readonly'),get=tx.objectStore('snapshots').get('current');
    get.onsuccess=()=>{const r=get.result;if(!finished&&revision===0&&r?.state?.projects&&(!latest||r.at>latest.at))latest=r;};
    const done=()=>{clearTimeout(timer);finish();};tx.oncomplete=tx.onerror=tx.onabort=done;
   };
  }catch(e){clearTimeout(timer);finish();}
 });
 function store(record){return new Promise((resolve,reject)=>{
  if(!db)return reject(Error('Device backup storage is unavailable'));
  try{
   const tx=db.transaction('snapshots','readwrite'),s=tx.objectStore('snapshots'),old=s.get('current');
   old.onsuccess=()=>{
    if(old.result)s.put(old.result,'previous');s.put(record,'current');
    s.put({at:record.at,state:record.state},'day:'+day(record.at));
    const keys=s.getAllKeys();keys.onsuccess=()=>{
     const daily=keys.result.filter(k=>String(k).startsWith('day:')).sort();
     daily.slice(0,Math.max(0,daily.length-7)).forEach(k=>s.delete(k));
    };
   };
   tx.oncomplete=()=>resolve(true);tx.onabort=()=>reject(tx.error||Error('Device backup failed'));tx.onerror=()=>{};
  }catch(e){reject(e);}
 });}
 function fallback(record){try{
  const data=JSON.stringify({...record.state,__jjLocalSavedAt:record.at,__jjRecoveryBase:record.base});
  // Compression is a fallback only; don't block every keystroke compressing photos.
  localStorage.setItem(key,JSON.stringify({jjBackupEncoding:'lz-string-utf16-v1',data:LZString.compressToUTF16(data)}));return true;
 }catch(e){console.error('Full device backup failed',e);return false;}}
 async function drain(){
  if(running)return;running=true;await ready;
  while(queued){
   const job=queued;queued=null;let ok;
   try{ok=await store(job.record);}catch(e){ok=fallback(job.record);}
   job.waiters.forEach(resolve=>resolve(ok));
   if(job.seq===revision)window.dispatchEvent(new CustomEvent('jj-backup-status',{detail:{ok}}));
  }
  running=false;
 }
 const api=window.JJLocalBackup={ready,pending:Promise.resolve(false),
  read:()=>latest?clone(latest.state):null,
  recovery:()=>latest?.base?{base:clone(latest.base)}:null,
  write(value,{base=null}={}){
   const record={at:Math.max(Date.now(),(latest?.at||0)+1),state:clone(value),base};
   latest=record;const seq=++revision,waiters=queued?.waiters||[];
   api.pending=new Promise(resolve=>waiters.push(resolve));queued={record,seq,waiters};void drain();return false;
  },
  async writeFull(value,options){await ready;api.write(value,options);if(!await api.pending)throw Error('Could not save the complete device backup. Keep this page open and export a backup.');return true;},
  async list(){await ready;if(!db)return [];return new Promise((resolve,reject)=>{const q=db.transaction('snapshots').objectStore('snapshots').getAllKeys();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});},
  async snapshot(id){await ready;if(!db)throw Error('Device history unavailable');return new Promise((resolve,reject)=>{const q=db.transaction('snapshots').objectStore('snapshots').get(id);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);});}
 };
})();
