/* Confirm saved edits before an app update or an intentional refresh. */
(()=>{'use strict';
let flight=null,reloading=false;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function unfinishedEditor(){return !!document.querySelector('dialog[open] form,.selection-modal-backdrop.open')||!!window.JJRequestWorkSaveGuard?.();}
function pending(){
 try{return !!(cloudSaveInFlight||cloudSaveQueued||window.JJTestWorkPay?.hasPendingEdits?.()||unfinishedEditor()||cloudBaseState&&!cloudValuesEqual(sharedCloudState(state),cloudBaseState));}catch{return false;}
}
function message(text){if(typeof toast==='function')toast(text);}
async function saveThenReload(automatic){
 const button=document.getElementById('jj-save-refresh');
 try{
  if(window.JJSaveConflicts?.hasPending()){window.JJSaveConflicts.review();message('Review the conflicting changes before refreshing.');return false;}
  if(unfinishedEditor()){message('Finish saving or close the open editor, then use Save & refresh.');return false;}
  // Commit fields whose existing save handlers run on blur/change.
  const field=document.activeElement;if(['INPUT','TEXTAREA','SELECT'].includes(field?.tagName))field.blur();
  if(button){button.disabled=true;button.textContent='Saving before refresh…';}
  if(window.JJTestWorkPay?.flushEdits&&!await window.JJTestWorkPay.flushEdits()){message('Refresh stopped. Your P.O. edits are still open; retry saving first.');return false;}
  if(typeof cloudClient==='undefined'||!cloudClient||!cloudLoadedForUser){
   message(automatic?'Update ready. Sign in and use Save & refresh when your work is saved.':'Refresh stopped. Sign in and confirm your cloud save first.');return false;
  }
  const deadline=Date.now()+390000;
  while(cloudSaveInFlight&&Date.now()<deadline)await wait(50);
  if(cloudSaveInFlight)throw Error('A save is still running. Please try again after it finishes.');
  // Flush the normal save path, retaining its merge/revision safeguards.
  saveState(false);clearTimeout(cloudSaveTimer);cloudRetryCount=0;
  do{
   clearTimeout(cloudSaveTimer);
   await pushCloudState();
   if(cloudRetryCount>0)throw Error('The cloud did not confirm saving. Your changes remain here; retry saving.');
   while(cloudSaveInFlight&&Date.now()<deadline)await wait(50);
   if(Date.now()>=deadline)throw Error('Saving is taking too long. Refresh was stopped.');
  }while(cloudSaveQueued);
  if(unfinishedEditor()||window.JJTestWorkPay?.hasPendingEdits?.()||!cloudBaseState||!cloudValuesEqual(sharedCloudState(state),cloudBaseState))throw Error('There are newer unsaved edits. Save them before refreshing.');
  if(window.JJLocalBackup&&!await JJLocalBackup.pending)throw Error('The complete device backup did not save. Export a backup before refreshing.');
  if(window.JJSaveRecovery?.flush)await window.JJSaveRecovery.flush();
  reloading=true;window.location.reload();return true;
 }catch(error){message('Refresh stopped. '+(error.message||'Please retry saving.'));return false;}
 finally{if(button&&!reloading){button.disabled=false;button.textContent='Save & refresh';}}
}
function reload(automatic=false){if(!flight)flight=saveThenReload(automatic).finally(()=>{flight=null});return flight;}
function mount(){
 const actions=document.querySelector('.operations-header .header-actions');if(!actions||document.getElementById('jj-save-refresh'))return;
 const b=document.createElement('button');b.id='jj-save-refresh';b.type='button';b.className='btn btn-light';b.textContent='Save & refresh';b.title='Confirm cloud saves before reloading the app';b.onclick=()=>reload();actions.append(b);
}
window.JJSaveRefresh={reload,pending};
window.addEventListener('beforeunload',event=>{
 if(reloading)return;
 const field=document.activeElement;if(['INPUT','TEXTAREA','SELECT'].includes(field?.tagName))field.blur();
 if(!pending())return;
 // Browsers cannot wait for asynchronous cloud saves during native refresh.
 // Preserve the local snapshot and show the standard unsaved-changes warning.
 try{persistStateLocally();}catch{}
 event.preventDefault();event.returnValue='';
});
window.addEventListener('load',mount);mount();
if(window.jjAppUpdateReady)void reload(true);
})();
