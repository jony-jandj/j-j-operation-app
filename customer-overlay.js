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
   onAdd(id,update){
    const base=getItems().find(i=>String(i.id)===id);if(!base)return;
    const dialog=document.createElement('dialog');dialog.className='jj-customer-view';
    dialog.style.cssText='width:min(560px,calc(100% - 24px));border:1px solid #d9e0e8;border-radius:14px;padding:24px;max-height:90dvh;overflow:auto';
    dialog.innerHTML=`<form><h2>Add Option</h2><p>${E(base.optionGroupTitle||base.title)}</p><label>Product name<input name="title" required maxlength="200"></label><label>Product link<input name="url" type="url" maxlength="2000"></label><label>Vendor<input name="vendor" maxlength="200"></label><label>Model / SKU<input name="model" maxlength="200"></label><label>Description / finish / color<textarea name="description" maxlength="4000"></textarea></label><label>Photo URL<input name="image" type="url"></label><label>Quantity<input name="quantity" type="number" min="1" max="10000" value="1" required></label><p>Pricing is set by J&J. New options are added without a price.</p><p role="status"></p><button type="button" data-cancel>Cancel</button> <button type="submit">Add Option</button></form>`;
    dialog.querySelectorAll('input,textarea').forEach(el=>el.style.cssText='display:block;width:100%;box-sizing:border-box;margin:6px 0 14px;padding:10px;border:1px solid #bbc2ce;border-radius:6px');
    document.body.appendChild(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=event=>{
     event.preventDefault();const target=current(),parent=target?.selections?.find(i=>String(i.id)===id);if(!parent){dialog.querySelector('[role=status]').textContent='This selection changed. Close and try again.';return;}
     const values=Object.fromEntries(new FormData(event.target));
     if(['url','image'].some(k=>values[k]&&!/^https?:\/\//i.test(values[k]))){dialog.querySelector('[role=status]').textContent='Use an http or https link.';return;}
     target.selections.push({...values,id:crypto.randomUUID(),quantity:Number(values.quantity),room:parent.room||'',category:parent.category||'',optionGroupId:parent.optionGroupId||parent.id,optionGroupTitle:parent.optionGroupTitle||parent.title,optionLabel:'Another option',status:'Pending',unitPrice:'',addTax:false,purchasedBy:'Not assigned'});
     window.saveState(false);window.renderSelections();dialog.close();update();
    };
    dialog.showModal();
   }
  });
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape')window.closeHomeownerOverlay()});
  overlay.querySelector('[data-close-customer]').focus();
 };
})();

