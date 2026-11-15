/* Recover only matching, existing selections; never restore whole jobs. */
(()=>{'use strict';
 const usable=value=>typeof value==='string'&&(/^(https?:\/\/)/i.test(value)||/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(value));
 const productMatch=(a,b)=>{
  const au=String(a.url||'').trim(),bu=String(b.url||'').trim();
  return au&&bu?au===bu:String(a.title||'').trim()===String(b.title||'').trim();
 };
 function recover(target,source){
  let count=0;const projects=new Map((source?.projects||[]).map(p=>[String(p.id),p]));
  for(const p of target?.projects||[]){
   const old=projects.get(String(p.id));if(!old)continue;
   const items=new Map((old.selections||[]).map(i=>[String(i.id),i]));
   for(const item of p.selections||[]){
    const prior=items.get(String(item.id));
    if(!item.image&&!item.imageRemovedAt&&prior&&usable(prior.image)&&productMatch(item,prior)){
     item.image=prior.image;count++;
    }
   }
  }
  return count;
 }
 window.JJSelectionPhotos={recover,usable};
 window.openSelectionPhotoRecovery=()=>{
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async()=>{
   if(!input.files?.[0])return;
   try{
    const file=JSON.parse(await input.files[0].text()),source=file.data||file;
    if(!Array.isArray(source.projects))throw Error('Choose a J&J photo recovery or backup file.');
    const preview=JSON.parse(JSON.stringify(state));const count=recover(preview,source);
    if(!count){alert('No matching missing photos were found. Existing photos were kept.');return;}
    if(!confirm(`Restore ${count} missing selection photos across your jobs? Current photos, choices, prices and P.O.s will be kept.`))return;
    // Preserve a full copy before recovery. Re-evaluate against current state
    // after the async write so changes made meanwhile are not rolled back.
    await JJLocalBackup.writeFull(state);
    const restored=recover(state,source);
    saveState(false);renderAll();
    const localOK=await JJLocalBackup.pending;
    alert(`${restored} missing photos restored. ${localOK?'Full backup saved on this device.':'Local backup failed—keep this page open and export a backup.'} Wait for the top status to say Saved before closing; that confirms the cloud save for homeowners.`);
   }catch(e){alert('Photo recovery: '+e.message);}
  };
  input.click();
 };
 window.addEventListener('jj-backup-status',event=>{
  let box=document.getElementById('jjPhotoBackupWarning');
  if(event.detail.ok){box?.remove();return;}
  if(!box){box=document.createElement('div');box.id='jjPhotoBackupWarning';box.setAttribute('role','alert');box.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;z-index:99999;padding:16px;background:#fff4db;color:#492e00;border:2px solid #b77c12;border-radius:12px';document.body.appendChild(box);}
  box.textContent='The complete device backup could not save. Keep this page open, export a backup, and retry Save. Photos have not been removed to make space.';
 });
})();
