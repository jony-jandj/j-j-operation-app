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
  const view=window.JJCustomerView.mount(host,{getItems,getGroups:()=>current()?.selectionGroups||[],
   onSelect(id,update){
    const all=getItems(),item=all.find(i=>String(i.id)===id);
    if(!item||!['Pending','Recommended','Selected'].includes(item.status||'Pending'))return;
    if(item.status!=='Selected'&&all.some(i=>String(i.id)!==id&&String(i.optionGroupId||i.id)===String(item.optionGroupId||item.id)&&i.status==='Selected'))return;
    item.status=item.status==='Selected'?'Pending':'Selected';item.homeownerSelected=item.status==='Selected';item.homeownerSelectedAt=item.homeownerSelected?new Date().toISOString():null;
    window.saveState(false);window.renderSelections();update();
   },
   onAddLink(update){this.onAdd(null,update);},
   onAdd(id,update){
    const base=id===null?{}:getItems().find(i=>String(i.id)===id);if(!base)return;
    window.JJSimpleAdd.open({title:id===null?'Add Selection':'Add Option',onSave(values){
     const target=current(),parent=id===null?null:target?.selections?.find(i=>String(i.id)===String(id));
     if(!target||(id!==null&&!parent))throw Error('This selection changed. Close and try again.');
     target.selections.push({...values,id:crypto.randomUUID(),room:parent?.room||'',category:parent?.category||values.category||'',...(parent?{optionGroupId:parent.optionGroupId||parent.id,optionGroupTitle:parent.optionGroupTitle||parent.title,optionLabel:'Another option'}:{}),status:'Pending',unitPrice:'',addTax:false,purchasedBy:'Not assigned'});
     window.saveState(false);window.renderSelections();update();return true;
    }});
   }
  });
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape')window.closeHomeownerOverlay()});
  overlay.querySelector('[data-close-customer]').focus();
 };
})();

