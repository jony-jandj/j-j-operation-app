/* A portable snapshot of jobs/photos plus the separate ledger and R.W. records.
   Read-only: exporting never queues a cloud write or records a payment. */
(()=>{'use strict';let flight=null;
 function download(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function collect(){
  const pendingEditors=!!window.JJTestWorkPay?.hasPendingEdits?.()||!!window.JJRequestWorkSaveGuard?.()||!!document.querySelector('.selection-modal-backdrop.open');
  const data=JSON.parse(JSON.stringify(state)),capturedAt=new Date().toISOString();
  persistStateLocally();
  const packet={type:'jj-complete-operations',version:2,capturedAt,data,sections:{jobs:'included',ledger:'not included',requests:'not included'},errors:[],scope:'Jobs and embedded files visible to the signed-in account; ledger and R.W. are captured at their individual server revisions. This is a records backup, not a database disaster-recovery backup.',exclusions:['Sign-in accounts and credentials','Homeowner private link secrets and unapplied event queue','Push delivery subscriptions','Files hosted outside these embedded records']};
  if(cloudClient&&cloudLoadedForUser){
   const tasks=[
    ['ledger',()=>cloudStateRequest(cloudClient.rpc('jj_work_pay_read'),'Back up payments')],
    ['requests',()=>cloudStateRequest(cloudClient.from('jj_rw_requests').select('*').order('id').range(0,999),'Back up requests')]
   ];
   const results=await Promise.allSettled(tasks.map(async([key,read])=>{
    const result=await read();if(result.error)throw result.error;
    if(key==='ledger'&&(!result.data?.document||result.data.revision==null))throw Error('Incomplete payment backup response');
    if(key==='requests'&&!Array.isArray(result.data))throw Error('Incomplete request backup response');
    if(key==='requests'){
     // PostgREST may cap rows. Continue until an empty page, not a guessed count.
     let rows=result.data,offset=rows.length;
     while(rows.length){
      const next=await cloudStateRequest(cloudClient.from('jj_rw_requests').select('*').order('id').range(offset,offset+999),'Back up remaining requests');
      if(next.error)throw next.error;if(!Array.isArray(next.data))throw Error('Incomplete request page');
      rows=next.data;result.data.push(...rows);offset+=rows.length;
     }
    }
    packet[key]=result.data;packet.sections[key]='included';
   }));
   results.forEach((r,i)=>{if(r.status==='rejected')packet.errors.push(tasks[i][0]+': '+(r.reason?.message||String(r.reason)));});
  }else packet.errors.push('Sign in and reconnect to include payment and R.W. records.');
  if(pendingEditors)packet.errors.push('Some editor changes are not committed yet. This backup contains recorded data; finish saving those editors and export again.');
  packet.complete=packet.errors.length===0;
  const stamp=new Date().toLocaleDateString('en-CA');
  download(packet,`JJ_${packet.complete?'Complete':'PARTIAL'}_Operations_Backup_${stamp}.json`);
  toast(packet.complete?'Full backup exported: jobs, photos, payment records and R.W. files.':'Partial backup exported. Jobs/photos are included; some cloud records could not load.');
  if(!packet.complete)alert('The backup is PARTIAL. Keep it, reconnect, and export again for a complete copy.\n\n'+packet.errors.join('\n'));
  return packet;
 }
 window.JJOperationsBackup={export(){if(!flight)flight=collect().catch(e=>{alert('Could not export: '+e.message);return null;}).finally(()=>{flight=null});return flight;},async exportDeviceHistory(){
  try{
   const keys=await JJLocalBackup.list(),daily=keys.filter(k=>String(k).startsWith('day:')).sort().reverse();
   if(!daily.length){toast('Daily device history will appear after your first successful save.');return;}
   const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Device recovery copies');
   dialog.style.cssText='max-width:480px;width:calc(100% - 32px);max-height:80vh;overflow:auto;padding:24px;border:1px solid #b59a62;border-radius:14px;background:#f8fafc;color:#14234a';
   const heading=document.createElement('h2');heading.textContent='Device recovery copies';dialog.append(heading);
   const text=document.createElement('p');text.textContent='Download a previous job/photo copy from this device. Payment records and R.W. use the operations export. Downloading does not replace current work.';dialog.append(text);
   for(const id of ['previous',...daily].filter(id=>keys.includes(id))){
    const button=document.createElement('button');button.type='button';button.className='btn btn-light';button.style.cssText='display:block;width:100%;margin:8px 0';button.textContent=id==='previous'?'Download previous save':'Download '+id.slice(4);
    button.onclick=async()=>{button.disabled=true;try{const record=await JJLocalBackup.snapshot(id);if(!record)throw Error('This recovery copy is unavailable');download({app:'J&J device recovery',version:1,exportedAt:new Date().toISOString(),data:record.state},'JJ_Device_Recovery_'+id.replace(':','_')+'.json');}catch(e){alert(e.message)}finally{button.disabled=false}};dialog.append(button);
   }
   const close=document.createElement('button');close.type='button';close.className='btn btn-gold';close.textContent='Close';close.onclick=()=>dialog.close();dialog.append(close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }catch(e){alert('Recovery copies could not open: '+e.message);}
 }};
 window.exportAppBackup=()=>JJOperationsBackup.export();
 document.querySelectorAll('button[onclick*="exportAppBackup"]').forEach(anchor=>{
  const button=document.createElement('button');button.type='button';button.className=anchor.className;button.textContent='Recovery copies';button.onclick=()=>{window.closeTabletTools?.();window.closeMobileTools?.();window.closeSidebarAccountMenu?.();void JJOperationsBackup.exportDeviceHistory();};anchor.after(button);
 });
})();
