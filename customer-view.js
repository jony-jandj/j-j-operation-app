/* Customer-only rendering. Adapters retain the existing save paths. */
(() => {
'use strict';
window.JJCustomerView={mount(host,adapter){
 host.classList.add('jj-customer-view');
  let mode=localStorage.getItem('jj-ho-group-mode')==='all'?'all':'groups';
  let viewMode=localStorage.getItem('jj-ho-view-mode')==='list'?'list':'card';
  let activeCategory='All selections';
  const openGroups=new Set();
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe=u=>/^https?:\/\//i.test(String(u||''))?String(u):'';
  const img=u=>safe(u)||(/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(String(u||''))?String(u):'');
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
  const getItems=adapter.getItems;


  function cat(i){const c=String(i?.category||'').trim();if(!c)return'Other';if(/tile|flooring/i.test(c))return'Tile';if(/plumb|faucet|shower|toilet|drain|tub/i.test(c))return'Plumbing';if(/vanit/i.test(c))return'Vanities';if(/light|electric/i.test(c))return'Lighting';if(/door/i.test(c))return'Doors / Hardware';if(/hardware/i.test(c))return'Hardware';if(/cabinet|storage/i.test(c))return'Cabinetry';return c}
  function unavailable(i,all){const key=String(i.optionGroupId||i.id);return i.status!=='Selected'&&all.some(o=>String(o.id)!==String(i.id)&&String(o.optionGroupId||o.id)===key&&o.status==='Selected')}


  function styles(){if(document.getElementById('jjCustomer830Style'))return;const s=document.createElement('style');s.id='jjCustomer830Style';s.textContent=`.jj-customer-view{background:#f4f6f9!important;color:#14234a!important;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif!important}.jj-customer-view>header{height:58px!important;display:flex!important;align-items:center!important;padding:0 28px!important;background:#14234a!important;color:#fff!important;font-size:13px!important;font-weight:850!important}.jj-customer-view{max-width:1280px!important;padding:28px 28px 56px!important}.jj-customer-view #job{margin:0!important;font-size:30px!important;font-weight:950!important;letter-spacing:-.5px!important}.jj-customer-view #job+p{margin:7px 0 0!important;color:#667386!important;font-size:13px!important;max-width:760px!important}.jj-customer-view #message{margin:16px 0!important;padding:10px 13px!important;border:1px solid #e0d7c3!important;border-radius:9px!important;background:#fff8e9!important;color:#65532e!important;font-size:12px!important}.jj-customer-view .toolbar{justify-content:flex-end!important;margin:0 0 14px!important}.jj-customer-view .toolbar button{min-height:38px!important;padding:8px 12px!important;font-size:11px!important;font-weight:850!important}.jj-customer-view #newSelection{background:#b59a62!important;color:#14234a!important}.jj-customer-view .actions[aria-label="Selections view"],.jj-customer-view #jjHOGroupToolbarV82,.jj-customer-view #jjCustomerControls827,.jj-customer-view #jjCustomerControls829{display:none!important}.jj-customer-view #jjCustomer830{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:18px 0 16px}.jj-customer-view .jj830-left,.jj-customer-view .jj830-right,.jj-customer-view .jj830-cats{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.jj-customer-view .jj830-seg{display:flex;gap:4px;padding:4px;border:1px solid #dce2e9;border-radius:10px;background:#fff}.jj-customer-view #jjCustomer830 button{min-height:36px!important;padding:8px 11px!important;border:1px solid transparent!important;border-radius:8px!important;background:transparen
  @media(max-width:720px){.jj-customer-view{padding:20px 14px 40px!important}.jj-customer-view>header{padding:0 16px!important}.jj-customer-view #job{font-size:25px!important}.jj-customer-view .jj830-cats{width:100%;overflow-x:auto;flex-wrap:nowrap}.jj-customer-view .jj830-cats button{white-space:nowrap}.jj-customer-view .jj830-left,.jj-customer-view .jj830-right{width:100%}.jj-customer-view .jj830-right{justify-content:space-between}.jj-customer-view [data-customer-items]{grid-template-columns:1fr!important}.jj-customer-view .jj830-group-items{grid-template-columns:1fr}.jj-customer-view .jj830-list .jj830-card{grid-template-columns:92px minmax(0,1fr)}.jj-customer-view .jj830-photo{height:190px}.jj-customer-view .jj830-count{display:none}}
  
.jj-customer-view{min-width:0}body.jj-customer-view{margin-left:auto;margin-right:auto}.jj-customer-view .jj830-body{min-width:0;overflow-wrap:anywhere}.jj-customer-view button{cursor:pointer}.jj-customer-view .jj830-group-toggle{overflow-wrap:anywhere}
`;document.head.appendChild(s)}


  function card(i,all){const selected=i.status==='Selected',blocked=unavailable(i,all),locked=!['Pending','Recommended','Selected'].includes(i.status||'Pending'),priced=i.unitPrice!==null&&i.unitPrice!==undefined&&i.unitPrice!==''&&Number.isFinite(Number(i.unitPrice)),total=Number(i.unitPrice||0)*Number(i.quantity||1)*(i.addTax?1.0825:1),image=img(i.image);return `<article class="jj830-card ${selected?'chosen':''}"><div class="jj830-photo"><span class="jj830-status">${E(i.status||'Pending')}</span>${image?`<img src="${E(image)}" alt="${E(i.title||'Product photo')}">`:`<div class="jj830-placeholder">No product photo</div>`}</div><div class="jj830-body"><div class="jj830-catline">${E(cat(i))}</div><h2>${E(i.title||'Selection')}${i.optionLabel?`<span class="jj830-option">${E(i.optionLabel)}</span>`:''}</h2><div class="jj830-vendor">${E(i.vendor||'')}${i.model?` · Model/SKU ${E(i.model)}`:''}</div>${i.description?`<p class="jj830-detail">${E(i.description)}</p>`:''}<div class="jj830-price-row"><div class="jj830-price">${priced?money(total):'Price not set'}<small>${priced?`${E(i.quantity||1)} item${Number(i.quantity||1)===1?'':'s'}${i.addTax?' · tax included':''}`:'J&J will add pricing'}</small></div><div class="jj830-buyer">Purchased by<b>${E(i.purchasedBy||'Not assigned')}</b></div></div><div class="jj830-actions">${selected?`<button data-select="${E(i.id)}" aria-pressed="true">Selected</button>`:blocked?`<button disabled>Unavailable</button>`:locked?`<button disabled>${E(i.status)}</button>`:`<button data-select="${E(i.id)}" aria-pressed="false">Mark Selected</button>`}<button type="button" data-option="${E(i.id)}">+ Add Option</button>${safe(i.url)?`<a href="${E(safe(i.url))}" target="_blank" rel="noopener noreferrer">View product ↗</a>`:''}</div></div></article>`}
  function filtered(){const all=getItems();return activeCategory==='All selections'?all:all.filter(i=>cat(i)===activeCategory)}
  function group(group,all){const first=group[0],id=String(first.optionGroupId||first.id),collapsed=mode!=='all'&&!openGroups.has(id);return `<section class="jj830-group ${collapsed?'collapsed':''}" data-group="${E(id)}"><div class="jj830-group-head"><button type="button" class="jj830-group-toggle" data-toggle-group="${E(id)}" aria-expanded="${!collapsed}">${E(first.optionGroupTitle||first.title||'Selection Group')}</button><span class="jj830-count">${group.length} option${group.length===1?'':'s'}</span><button type="button" class="jj830-add" data-option="${E(first.id)}">+ Add Option</button></div><div class="jj830-group-items">${group.map(i=>card(i,all)).join('')}</div></section>`}


  function render830(){const root=host.querySelector('[data-customer-items]');if(!root)return;const data=filtered();root.classList.toggle('jj830-list',viewMode==='list');root.classList.remove('list');if(!data.length){root.innerHTML='<p style="grid-column:1/-1;padding:22px;background:#fff;border:1px solid #dce2e9;border-radius:12px">No selections in this view.</p>';return}const buckets=new Map();data.forEach(i=>{const k=String(i.optionGroupId||i.id);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i)});root.innerHTML=[...buckets.values()].map(g=>group(g,getItems())).join('');wireImages()}
  function wireImages(){host.querySelectorAll('.jj830-photo img').forEach(im=>{im.onerror=()=>{const p=im.parentElement;if(p){im.remove();const d=document.createElement('div');d.className='jj830-placeholder';d.textContent='No product photo';p.appendChild(d)}}})}


  function controls(){const root=host.querySelector('[data-customer-items]');if(!root)return;host.querySelector('#jjCustomer830')?.remove();const all=getItems(),pref=['Tile','Plumbing','Vanities','Lighting','Hardware','Doors / Hardware','Cabinetry'],present=[...new Set(all.map(cat).filter(Boolean))],cats=['All selections',...pref.filter(c=>present.includes(c)),...present.filter(c=>!pref.includes(c))];if(!cats.includes(activeCategory))activeCategory='All selections';const c=document.createElement('div');c.id='jjCustomer830';c.innerHTML=`<div class="jj830-left"><div class="jj830-seg"><button id="jj830All" aria-pressed="${mode==='all'}">Show All</button><button id="jj830Groups" aria-pressed="${mode==='groups'}">Show Groups</button></div></div><div class="jj830-right"><div class="jj830-cats">${cats.map(x=>`<button class="jj830-cat" data-cat="${E(x)}" aria-pressed="${activeCategory===x}">${E(x)}</button>`).join('')}</div><div class="jj830-seg"><button class="jj830-view" id="jj830Card" title="Card view" aria-label="Card view" aria-pressed="${viewMode==='card'}">▦</button><button class="jj830-view" id="jj830List" title="List view" aria-label="List view" aria-pressed="${viewMode==='list'}">☰</button></div></div>`;root.before(c);c.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='jj830All'){mode='all';localStorage.setItem('jj-ho-group-mode','all')}else if(b.id==='jj830Groups'){mode='groups';localStorage.setItem('jj-ho-group-mode','groups')}else if(b.id==='jj830Card'){viewMode='card';localStorage.setItem('jj-ho-view-mode','card')}else if(b.id==='jj830List'){viewMode='list';localStorage.setItem('jj-ho-view-mode','list')}else if(b.dataset.cat)activeCategory=b.dataset.cat;controls();render830()}}




 function update(){controls();render830()}
 host.addEventListener('click',event=>{
  const toggle=event.target.closest('[data-toggle-group]');
  if(toggle){if(mode==='all'){mode='groups';host.querySelectorAll('[data-toggle-group]').forEach(button=>openGroups.add(button.dataset.toggleGroup));controls();}const id=toggle.dataset.toggleGroup;openGroups.has(id)?openGroups.delete(id):openGroups.add(id);render830();return;}
  if(adapter.onSelect){const button=event.target.closest('[data-select]');if(button&&!button.disabled)adapter.onSelect(button.dataset.select,update);}
  if(adapter.onAdd){const button=event.target.closest('[data-option]');if(button)adapter.onAdd(button.dataset.option,update);}
 });
 styles();update();return {update};
}};
if(/homeowner\.html$/i.test(location.pathname)){
 const root=document.getElementById('items');root.dataset.customerItems='';
 const view=window.JJCustomerView.mount(document.body,{getItems:()=>items});
 window.render=view.update;
}
})();

