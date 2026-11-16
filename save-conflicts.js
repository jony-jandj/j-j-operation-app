/* Keep both versions when two devices change the same field. */
(()=>{'use strict';
 let pending=[],pendingRemote=null,dialog=null;
 const styles=document.createElement('style');styles.textContent=`
 #jj-save-conflict-dialog{box-sizing:border-box}#jj-save-conflict-dialog::backdrop{background:#040c16b8}
 #jj-save-conflict-dialog h2{font-size:22px;line-height:1.25;margin:0 0 12px}
 html[data-preview-theme=night] #jj-save-conflict-dialog{background:#172f47!important;color:#e6edf4!important}
 #jj-save-conflict-dialog label{color:inherit}#jj-save-conflict-dialog input{margin-right:8px}
 `;document.head.append(styles);
 const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
 const equal=(a,b)=>cloudValuesEqual(a,b);
 const keyed=a=>Array.isArray(a)&&a.every(x=>x&&typeof x==='object'&&x.id!=null);
 function find(base,local,remote,path=[],out=[]){
  if(equal(local,base)||equal(remote,base)||equal(local,remote))return out;
  if((base===undefined||keyed(base))&&keyed(local)&&keyed(remote)){
   const maps=[base||[],local,remote].map(a=>new Map(a.map(v=>[String(v.id),v])));
   for(const id of new Set(maps.flatMap(m=>[...m.keys()])))find(...maps.map(m=>m.get(id)),[...path,{id}],out);
  }else if(local&&remote&&typeof local==='object'&&typeof remote==='object'&&!Array.isArray(local)&&!Array.isArray(remote)){
   const b=base&&typeof base==='object'?base:{};
   for(const k of new Set([...Object.keys(b),...Object.keys(local),...Object.keys(remote)])){
    if(k!=='currentUser'&&k!=='selectedProjectId')find(b[k],local[k],remote[k],[...path,k],out);
   }
  }else out.push({path,base:copy(base),local:copy(local),remote:copy(remote)});
  return out;
 }
 function valueAt(root,path){for(const k of path){if(root==null)return undefined;root=typeof k==='object'?root.find?.(v=>String(v.id)===k.id):root[k];}return root;}
 function put(root,path,value){
  let node=root;
  for(let i=0;i<path.length-1;i++){
   const k=path[i];node=typeof k==='object'?node?.find?.(v=>String(v.id)===k.id):node?.[k];
   if(node==null)throw Error('This item changed again. Reopen the review before saving.');
  }
  const k=path.at(-1);
  if(typeof k==='object'){
   const at=node.findIndex(v=>String(v.id)===k.id);
   if(value===undefined){if(at>=0)node.splice(at,1);}
   else if(at>=0)node[at]=copy(value);else node.push(copy(value));
  }else if(value===undefined)delete node[k];else node[k]=copy(value);
 }
 function title(c){
  const labels=[];let at=[];
  for(const key of c.path){at.push(key);if(typeof key==='object'){
   const item=valueAt(state,at)||valueAt(cloudBaseState,at)||c.remote;
   const name=item?.name||item?.title||item?.description;
   if(name)labels.push(String(name).slice(0,90));
  }}
  const last=c.path.at(-1);if(typeof last==='string')labels.push(last.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' '));
  return labels.join(' · ')||'Shared information';
 }
 function preview(v){
  if(v===undefined)return 'Removed';if(v===null||v==='')return 'Blank';
  if(typeof v==='string'&&/^data:|^blob:/.test(v))return 'Photo or file changed';
  if(Array.isArray(v))return v.slice(0,8).map(x=>typeof x==='object'?(x?.name||x?.title||'Item details'):String(x)).join(', ').slice(0,500);
  if(typeof v==='object')return 'Item details changed — '+String(v.title||v.name||v.description||'review this item').slice(0,160);
  return String(v).slice(0,500);
 }
 function button(text,action){const b=document.createElement('button');b.type='button';b.className='btn btn-light';b.textContent=text;b.onclick=action;return b;}
 function paint(){
  let b=document.getElementById('jj-review-save-conflicts');
  if(!b){const target=document.body;if(!target)return;b=button('Review changes',review);b.id='jj-review-save-conflicts';b.style.cssText='position:fixed;right:18px;bottom:88px;z-index:2000;max-width:calc(100vw - 36px);background:#b59a58;color:#142b3c;border:1px solid #826b30;border-radius:10px;min-height:44px;padding:10px 16px;font-weight:700';target.append(b);}
  b.hidden=!pending.length;b.style.display=pending.length?'':'none';b.textContent=`Review changes (${pending.length})`;
 }
 function check(base,local,remote){pending=find(base,local,remote);pendingRemote=copy(remote);paint();return !pending.length;}
 function review(){
  if(!pending.length||dialog?.open)return;
  const choices=new Map(),captured=pending;
  dialog=document.createElement('dialog');dialog.id='jj-save-conflict-dialog';
  dialog.style.cssText='width:min(640px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #b59a58;border-radius:16px;padding:22px;background:var(--card,#fff);color:var(--text,#203247)';
  const heading=document.createElement('h2');heading.textContent='Review changes from another device';dialog.append(heading);
  const hint=document.createElement('p');hint.textContent='Both versions are kept here. Choose which value to save for each item. Other changes will still merge.';dialog.append(hint);
  const save=button('Save choices',()=>{
   try{
    if(captured!==pending)throw Error('Newer changes need review. Close and reopen this window.');
    if(cloudSaveInFlight)throw Error('Wait for the current save to finish, then try again.');
    // Prepare both copies before assigning either, so a stale path cannot partly apply choices.
    const draft=Object.assign(copy(state),mergeCloudValues(cloudBaseState,sharedCloudState(state),pendingRemote)),baseline=copy(pendingRemote);
    if(!baseline)throw Error('Reconnect before saving your choices.');
    captured.forEach((c,i)=>put(draft,c.path,choices.get(i)==='local'?c.local:c.remote));
    state=draft;cloudBaseState=baseline;pending=[];dialog.close();dialog.remove();dialog=null;
    persistStateLocally();renderAll();paint();cloudRetryCount=0;queueCloudSave();
   }catch(e){toast(e.message);}
  });save.disabled=true;
  captured.forEach((c,i)=>{
   const box=document.createElement('fieldset');box.style.cssText='margin:14px 0;padding:12px;border:1px solid #8797a8;border-radius:10px';
   const legend=document.createElement('legend');legend.textContent=title(c);box.append(legend);
   for(const [key,label,val] of [['local','This device',c.local],['remote','Already saved',c.remote]]){
    const row=document.createElement('label');row.style.cssText='display:block;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere;cursor:pointer';
    const radio=document.createElement('input');radio.type='radio';radio.name=`conflict-${i}`;radio.value=key;radio.onchange=()=>{choices.set(i,key);save.disabled=choices.size!==captured.length;};
    row.append(radio,document.createTextNode(' '+label+': '+preview(val)));box.append(row);
   }dialog.append(box);
  });
  const footer=document.createElement('div');footer.style.cssText='display:flex;gap:10px;justify-content:flex-end';
  footer.append(button('Decide later',()=>{dialog.close();dialog.remove();dialog=null;}),save);dialog.append(footer);
  dialog.addEventListener('cancel',()=>{dialog.remove();dialog=null;});document.body.append(dialog);dialog.showModal();
 }
 window.JJSaveConflicts={find,check,review,hasPending:()=>pending.length>0};
 window.addEventListener('load',paint);paint();
})();
