/* Copy reviewed selections into another job through the existing cloud save queue. */
(()=>{
'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
const chosenFields=['title','vendor','category','room','quality','model','upc','identifiers','image','description','unitPrice','quantity','addTax','purchasedBy','leadTimeValue','leadTimeUnit','inStock','notes','url','additionalLinks','optionLabel','budget'];
function stableCopyId(prefix,parts){return prefix+encodeURIComponent(JSON.stringify(parts));}
function plan(source,destination,ids,rules){
 if(!source||!destination||String(source.id)===String(destination.id))throw Error('Choose a different destination job.');
 const selected=(source.selections||[]).filter(i=>ids.has(String(i.id)));
 if(!selected.length)throw Error('Choose at least one selection.');
 if(selected.length!==ids.size)throw Error('Some source selections changed. Close this screen and reopen it.');
 const groups=[],mapping=new Map(),settings=[];
 const items=selected.map(item=>{
  const out={};for(const key of chosenFields)if(item[key]!==undefined)out[key]=clone(item[key]);
  out.id=stableCopyId('copy-',[source.id,destination.id,item.id]);out.status='Pending';out.homeownerSelected=false;out.homeownerSelectedAt=null;
  out.copiedFromJobId=String(source.id);out.copiedFromSelectionId=String(item.id);
  // An ungrouped parent with alternatives uses its item ID as the group key.
  const key=String(item.optionGroupId||item.id);
  const grouped=!!item.optionGroupId||(source.selections||[]).some(i=>String(i.optionGroupId||'')===key);
  if(grouped){
   if(!mapping.has(key)){
    const original=(source.selectionGroups||[]).find(g=>String(g.id)===key);
    const group={...(original?clone(original):{}),id:stableCopyId('copy-group-',[source.id,destination.id,key]),name:original?.name||item.optionGroupTitle||item.title||'Selections'};
    mapping.set(key,group);groups.push(group);
    if(rules?.[key]?.allowMultiple===true)settings.push(group.id);
   }
   const group=mapping.get(key);out.optionGroupId=group.id;out.optionGroupTitle=group.name;
  }
  return out;
 });
 return {sourceId:String(source.id),destinationId:String(destination.id),items,groups,settings};
}
function append(destination,copy){
 destination.selections??=[];destination.selectionGroups??=[];destination.selectionRooms??=[];
 for(const group of copy.groups)if(!destination.selectionGroups.some(g=>String(g.id)===String(group.id)))destination.selectionGroups.push(clone(group));
 for(const item of copy.items){if(!destination.selections.some(i=>String(i.id)===String(item.id)))destination.selections.push(clone(item));if(item.room&&!destination.selectionRooms.includes(item.room))destination.selectionRooms.push(item.room);}
}
const project=id=>state.projects.find(p=>String(p.id)===String(id));
const confirmationFields=[...chosenFields,'status','optionGroupId','optionGroupTitle','copiedFromJobId','copiedFromSelectionId'];
function confirmed(copy){
 const saved=typeof cloudBaseState==='undefined'?null:cloudBaseState?.projects?.find(p=>String(p.id)===copy.destinationId);
 const same=(a,b)=>(a==null&&b==null)||JSON.stringify(a)===JSON.stringify(b);
 return !!saved&&copy.items.every(item=>{const found=saved.selections?.find(s=>String(s.id)===String(item.id));return !!found&&confirmationFields.every(key=>same(found[key],item[key]));})&&copy.groups.every(group=>saved.selectionGroups?.some(s=>String(s.id)===String(group.id)&&s.name===group.name));
}
function open(){
 const source=selectedProject();if(!source)return;
 document.getElementById('jjCopySelections')?.remove();
 const sourceId=String(source.id),initial=clone(source),selected=new Set();let operation=null,busy=false,complete=false;
 const dialog=document.createElement('dialog');dialog.id='jjCopySelections';dialog.setAttribute('aria-labelledby','jjCopyTitle');
 const targets=state.projects.filter(p=>String(p.id)!==sourceId).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 const buckets=new Map();for(const item of initial.selections||[]){const key=String(item.optionGroupId||((initial.selections||[]).some(i=>String(i.optionGroupId||'')===String(item.id))?item.id:'ungrouped'));if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(item);}
 const order=new Map((initial.selectionGroups||[]).map((g,n)=>[String(g.id),n]));
 dialog.innerHTML=`<header><div><small>Copy from ${E(initial.name)}</small><h2 id="jjCopyTitle">Choose selections</h2></div><button type="button" data-close aria-label="Close copy selections">×</button></header><div class="copy-body"><p>Choose the groups or products to copy. Copies start as <b>Pending</b>; homeowner choices and favorites stay with the original job.</p><label class="copy-destination" for="jjCopyDestination">Choose destination<select id="jjCopyDestination"><option value="">Choose a job…</option>${targets.map(p=>`<option value="${E(p.id)}">${E(p.name)}</option>`).join('')}</select></label><div class="copy-controls"><button type="button" data-all>Choose all</button><button type="button" data-clear>Clear choices</button><span data-count role="status">0 selections chosen</span></div><div class="copy-groups">${[...buckets].sort(([a],[b])=>(order.get(a)??Infinity)-(order.get(b)??Infinity)).map(([key,items])=>{const group=initial.selectionGroups?.find(g=>String(g.id)===key);return `<section><label class="copy-group"><input type="checkbox" data-group="${E(key)}"><strong>${E(group?.name||items[0].optionGroupTitle||(key==='ungrouped'?'Ungrouped selections':items[0].title))}</strong><span>${items.length} item${items.length===1?'':'s'}</span></label>${items.map(i=>`<label class="copy-item"><input type="checkbox" data-item="${E(i.id)}"><span><b>${E(i.title||'Untitled selection')}</b><small>${E(i.vendor||i.category||'')}${i.unitPrice!=null&&i.unitPrice!==''?' · $'+E(Number(i.unitPrice).toFixed(2)):''}</small></span></label>`).join('')}</section>`;}).join('')||'<p>This job has no selections to copy.</p>'}</div><p data-review>Existing selections in the destination will stay as they are. Copied groups are added as new groups, with their allowances and multiple-choice settings.</p><p data-result role="status" aria-live="polite"></p></div><footer><button type="button" data-close>Cancel</button><button type="button" data-copy disabled>Copy selections</button></footer>`;
 document.body.append(dialog);const dest=dialog.querySelector('select'),result=dialog.querySelector('[data-result]'),copyButton=dialog.querySelector('[data-copy]');
 function update(){
  dialog.querySelectorAll('[data-item]').forEach(n=>n.checked=selected.has(n.dataset.item));
  dialog.querySelectorAll('[data-group]').forEach(n=>{const list=buckets.get(n.dataset.group)||[],nSelected=list.filter(i=>selected.has(String(i.id))).length;n.checked=nSelected===list.length&&list.length>0;n.indeterminate=nSelected>0&&nSelected<list.length;});
  dialog.querySelector('[data-count]').textContent=`${selected.size} selection${selected.size===1?'':'s'} chosen`;
  copyButton.disabled=busy||complete||(!operation&&(!selected.size||!dest.value));
  copyButton.textContent=busy?'Copying…':complete?'Copied':operation?'Retry confirmation':`Copy ${selected.size||''} selection${selected.size===1?'':'s'}`;
 }
 function lock(value){busy=value;dialog.querySelectorAll('input,select,[data-all],[data-clear]').forEach(n=>n.disabled=value||!!operation);dialog.querySelectorAll('[data-close]').forEach(n=>n.disabled=value&&!operation);update();}
 dialog.addEventListener('change',e=>{if(e.target.matches('[data-item]'))e.target.checked?selected.add(e.target.dataset.item):selected.delete(e.target.dataset.item);if(e.target.matches('[data-group]'))for(const i of buckets.get(e.target.dataset.group)||[])e.target.checked?selected.add(String(i.id)):selected.delete(String(i.id));update();});
 dialog.querySelector('[data-all]').onclick=()=>{for(const i of initial.selections||[])selected.add(String(i.id));update();};
 dialog.querySelector('[data-clear]').onclick=()=>{selected.clear();update();};
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());
 copyButton.onclick=async()=>{
  if(busy||complete)return;lock(true);result.textContent='Preparing your copy…';
  try{
   if(typeof cloudClient==='undefined'||!cloudClient||!cloudLoadedForUser)throw Error('Sign in and let your jobs finish syncing before copying.');
   if(!operation){
    const sourceNow=project(sourceId),target=project(dest.value);if(!sourceNow||!target)throw Error('A job changed. Close and reopen this screen.');
    const r=await cloudClient.rpc('jj_selection_rules',{p_job:sourceId});if(r.error)throw r.error;
    operation=plan(sourceNow,target,selected,r.data||{});
   }
   const target=project(operation.destinationId);if(!target)throw Error('The destination job is unavailable.');
   append(target,operation);saveState(false);
   if(cloudSaveQueued&&!cloudSaveInFlight){clearTimeout(cloudSaveTimer);Promise.resolve(pushCloudState()).catch(error=>console.warn('Copied selections are still syncing',error));}
   result.textContent='Copied on this device; syncing to the cloud now. You can close this window and keep working.';
   dialog.querySelectorAll('[data-close]').forEach(button=>button.disabled=false);
   const continueButton=dialog.querySelector('footer [data-close]');if(continueButton)continueButton.textContent='Continue';
   const deadline=Date.now()+45000;
   while(!confirmed(operation)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,250));
   if(!confirmed(operation))throw Error('Copies are kept on this device, but cloud saving is not confirmed yet. Retry confirmation here; it will not add them twice.');
   await Promise.all(operation.settings.map(async groupId=>{
    result.textContent='Saving copied group settings…';
    const r=await cloudClient.rpc('jj_selection_rules',{p_job:operation.destinationId,p_group:groupId,p_allow:true,p_expected:false});
    if(r.error){const check=await cloudClient.rpc('jj_selection_rules',{p_job:operation.destinationId});if(check.error||check.data?.[groupId]?.allowMultiple!==true)throw Error('Products are copied. Some group settings still need confirmation. Tap Retry confirmation.');}
   }));
   complete=true;const message='Copied '+operation.items.length+' selections in '+operation.groups.length+' groups to '+target.name+'. They are Pending and ready to review.';result.textContent=message;toast(message);
   dialog.querySelector('footer [data-close]').textContent='Done';renderSelections();
  }catch(e){const message=e.message||'Could not copy. Please try again.';if(dialog.isConnected)result.textContent=message;else toast('The copy was added locally, but cloud confirmation is still pending. Reopen Copy selections and tap Retry confirmation.');}finally{lock(false);}
 };
 update();dialog.showModal();dialog.querySelector('[data-all]').focus();
}
window.JJSelectionCopy={open,plan,append};
const style=document.createElement('style');style.textContent=`#jjCopySelections{width:min(760px,94vw);max-height:90dvh;padding:0;border:1px solid var(--line,#d3dce6);border-radius:16px;background:var(--card,#fff);color:var(--text,#202633);box-shadow:0 20px 70px #0005}#jjCopySelections::backdrop{background:#09152bb3}#jjCopySelections header,#jjCopySelections footer{position:static;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;height:auto;background:var(--card,#fff);color:inherit}#jjCopySelections header{border-bottom:1px solid var(--line,#ddd)}#jjCopySelections h2{margin:4px 0;font-size:23px}#jjCopySelections .copy-body{padding:0 22px 16px;max-height:64dvh;overflow:auto}#jjCopySelections p{font-size:14px;line-height:1.5}#jjCopySelections button{border:1px solid var(--line,#d3dce6);border-radius:9px;padding:10px 14px;background:var(--card,#fff);color:inherit;cursor:pointer;font-weight:750}#jjCopySelections button:disabled{opacity:.55;cursor:default}#jjCopySelections [data-copy]{background:var(--gold,#b59a62);color:#14234a}#jjCopySelections .copy-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0}#jjCopySelections .copy-controls span{font-size:13px}#jjCopySelections section{border:1px solid var(--line,#d3dce6);border-radius:10px;overflow:hidden;margin:12px 0}#jjCopySelections label{display:flex;align-items:center;gap:12px;font-size:14px;cursor:pointer}#jjCopySelections input[type=checkbox]{width:20px;height:20px;min-width:20px;accent-color:var(--gold,#b59a62)}#jjCopySelections .copy-group{padding:12px;background:var(--bg,#f4f6f9)}#jjCopySelections .copy-group span{margin-left:auto;font-size:12px}#jjCopySelections .copy-item{padding:12px 16px;border-top:1px solid var(--line,#e3e7ed)}#jjCopySelections .copy-item small{display:block;opacity:.75;margin-top:3px}#jjCopySelections .copy-destination{display:block;font-weight:800;margin-top:22px}#jjCopySelections select{display:block;width:100%;padding:12px;border:1px solid var(--line,#d3dce6);border-radius:9px;margin-top:8px;background:var(--card,#fff);color:inherit;font:inherit}#jjCopySelections footer{border-top:1px solid var(--line,#ddd)}#jjCopySelections [data-result]{font-weight:750}#jjCopySelections button:focus-visible,#jjCopySelections input:focus-visible,#jjCopySelections select:focus-visible{outline:3px solid #4a8ba1;outline-offset:2px}@media(max-width:520px){#jjCopySelections header,#jjCopySelections footer{padding:14px}#jjCopySelections .copy-body{padding:0 14px 14px}#jjCopySelections h2{font-size:20px}}`;document.head.append(style);
})();
