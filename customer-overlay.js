/* Staff customer preview. User actions use the app's existing save queue. */
(() => {
 'use strict';
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.openHomeownerView=function(project=window.selectedProject()){
  if(!project)return;
  window.homeownerActiveProject=project;
  document.getElementById('homeownerOverlay')?.remove();
  const overlay=document.createElement('div');overlay.id='homeownerOverlay';overlay.className='homeowner-overlay';
  overlay.innerHTML=`<div class="homeowner-page" role="dialog" aria-modal="true" aria-label="Homeowner selections"><header class="homeowner-top"><div class="homeowner-brand">J&J Home Renovations</div><div class="homeowner-actions"><button type="button" data-close-customer>Back to app</button></div></header><main class="homeowner-body"><h2>${E(project.name)} · Selections</h2><p>Review products and pricing, and compare options.</p><p data-customer-message role="status"></p><div data-customer-items></div></main></div>`;
  document.body.appendChild(overlay);
  const header=overlay.querySelector('header');header.style.cssText='position:static;height:auto;min-height:58px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:16px 24px;background:#14234a;color:white';header.querySelector('.homeowner-brand').style.color='white';


  overlay.querySelector('[data-close-customer]').onclick=()=>window.closeHomeownerOverlay();
  const host=overlay.querySelector('main'),message=host.querySelector('[data-customer-message]');
  // Resolve by the captured project ID, never by whichever job is selected later.
  const current=()=>state.projects.find(p=>String(p.id)===String(project.id));
  const getItems=()=>current()?.selections||[];
  async function saveStaffAdd(values,itemId,userId){
   if(typeof cloudClient==='undefined'||!cloudClient||!cloudLoadedForUser)throw Error('Sign in to finish this upload.');
   if(userId){const result=await cloudClient.auth.getUser();if(result.data?.user?.id!==userId)throw Error('Sign back in to finish this upload.');}
   const target=current();if(!target)throw Error('This job is unavailable.');
   if(values.optionGroupId&&!target.selections.some(i=>String(i.id)===String(values.optionGroupId)||String(i.optionGroupId)===String(values.optionGroupId)))throw Error('The selection group changed. Contact J&J before retrying.');
   if(!target.selections.some(i=>String(i.id)===itemId))target.selections.push({...values,id:itemId,status:'Pending',unitPrice:'',addTax:false,purchasedBy:'Not assigned'});
   window.saveState(false);window.renderSelections();if(host.isConnected)view.update();
   const deadline=Date.now()+20000;
   while(Date.now()<deadline){
    const saved=cloudBaseState?.projects?.find(p=>String(p.id)===String(project.id))?.selections?.find(i=>String(i.id)===itemId);
    if(saved&&saved.title===values.title&&String(saved.image||'')===String(values.image||''))return true;
    await new Promise(resolve=>setTimeout(resolve,250));
   }
   throw Error('Cloud confirmation timed out. Your entry is kept on this device.');
  }
  let staffQueueTask;
  function getStaffQueue(){
   if(staffQueueTask)return staffQueueTask;
   staffQueueTask=(async()=>{
    if(typeof cloudClient==='undefined'||!cloudClient)throw Error('Sign in before adding.');
    const result=await cloudClient.auth.getSession(),userId=result.data?.session?.user?.id;
    if(!userId)throw Error('Sign in before adding. Your link/photo is kept here.');
    const queues=window.JJStaffAddQueues||(window.JJStaffAddQueues=new Map()),scope=userId+':'+project.id;
    if(!queues.has(scope))queues.set(scope,JJBackgroundAdds.create({scope:'staff:'+scope,send:(payload,id)=>saveStaffAdd(payload,id,userId)}).catch(e=>{queues.delete(scope);throw e;}));
    const queue=await queues.get(scope),panel=JJBackgroundAdds.panel(host);panel.setQueue(queue);queue.subscribe(panel.onChange);return queue;
   })().catch(e=>{staffQueueTask=null;throw e;});return staffQueueTask;
  }
  const view=window.JJCustomerView.mount(host,{getItems,getRules:()=>window.JJGroupRules?.getRules()||{},getGroups:()=>current()?.selectionGroups||[],
   favoriteAccess:typeof cloudClient!=='undefined'&&cloudClient?{client:cloudClient,args:{p_job:String(project.id)}}:null,
   async onGroupDone(key,update){
    try{const result=await cloudClient.rpc('jj_selection_rules',{p_job:String(project.id),p_group:key,p_done:true});if(result.error)throw result.error;await window.JJGroupRules.reload();update();}catch(e){message.textContent=e.message||'Could not save. Try again.';}
   },
   onSelect(id,update){
    const all=getItems(),item=all.find(i=>String(i.id)===id);
    if(!item||!['Pending','Recommended','Selected'].includes(item.status||'Pending'))return;
    if(!window.JJGroupRules?.ready(String(project.id))){message.textContent='Group settings are loading. Please try again.';return;}
    if(item.status!=='Selected'&&!window.JJGroupRules.multiple(item.optionGroupId||item.id)&&all.some(i=>String(i.id)!==id&&String(i.optionGroupId||i.id)===String(item.optionGroupId||item.id)&&['Selected','Ordered','Received'].includes(i.status)))return;
    item.status=item.status==='Selected'?'Pending':'Selected';item.homeownerSelected=item.status==='Selected';item.homeownerSelectedAt=item.homeownerSelected?new Date().toISOString():null;
    window.saveState(false);window.renderSelections();update();
   },
   onAddLink(update){this.onAdd(null,update);},
   onAdd(id,update){
    const parent=id===null?null:getItems().find(i=>String(i.id)===String(id));if(id!==null&&!parent)return;
    window.JJSimpleAdd.open({background:!!window.JJBackgroundAdds,title:id===null?'Add Selection':'Add Option',onSave:async(values,context)=>{
     const payload={...values,room:parent?.room||'',category:parent?.category||values.category||'',...(parent?{optionGroupId:parent.optionGroupId||parent.id,optionGroupTitle:parent.optionGroupTitle||parent.title,optionLabel:'Another option'}:{})};
     if(window.JJBackgroundAdds)return (await getStaffQueue()).enqueue(payload,context.requestId);
     return saveStaffAdd(payload,context.requestId);
    }});
   }
  });
  if(window.JJBackgroundAdds)getStaffQueue().catch(()=>{});
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape')window.closeHomeownerOverlay()});
  overlay.querySelector('[data-close-customer]').focus();
 };
})();


