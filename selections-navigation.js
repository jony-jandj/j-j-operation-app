/* View-only Selections navigation; uses existing cards, filters and bulk actions. */
(()=>{
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let collapsed=localStorage.getItem('jj_test_groups_collapsed')==='true';
function decorate(){
 const root=document.getElementById('selections'),groups=root?.querySelector('.selection-groups');if(!groups||root.querySelector('.rd-selection-layout'))return;
 const project=selectedProject();if(!project)return;
 const entries=new Map((project.selectionGroups||[]).map(g=>[String(g.id),{name:g.name,count:0}]));
 for(const item of project.selections||[]){const id=String(item.optionGroupId||'ungrouped');if(!entries.has(id))entries.set(id,{name:id==='ungrouped'?'Ungrouped selections':item.optionGroupTitle||item.title||'Selection group',count:0});entries.get(id).count++}
 const layout=document.createElement('div');layout.className='rd-selection-layout';layout.classList.toggle('groups-collapsed',collapsed);groups.before(layout);
 const side=document.createElement('aside');side.className='rd-selection-sidebar';side.setAttribute('aria-label','Selection groups');
 side.innerHTML=`<button class="rd-groups-toggle" aria-expanded="${!collapsed}" title="Expand or collapse groups">${collapsed?'›':'‹'} <span>Groups</span></button><button type="button" class="rd-add-group btn-gold" data-add-group aria-label="Add group" title="Add group">+ <span>Add Group</span></button><div class="rd-group-links"><p>Tap a group to open it. Drag ⠿ or use arrows to reorder.</p><button data-group-all>All groups</button>${[...entries].map(([id,g])=>`<div data-order-group="${E(id)}" style="margin-bottom:8px"><button data-group-jump="${E(id)}" style="width:100%">${E(g.name)} <small>${g.count}</small></button>${id!=='ungrouped'?`<div style="display:flex;gap:6px;margin-top:4px" aria-label="Reorder ${E(g.name)}"><button type="button" data-order-drag draggable="true" aria-label="Drag ${E(g.name)} to reorder" title="Drag to reorder" style="width:auto;min-width:44px;min-height:44px;margin:0;cursor:grab">⠿</button><button type="button" data-order-up aria-label="Move ${E(g.name)} up" title="Move up" style="width:auto;min-width:44px;min-height:44px;margin:0">↑</button><button type="button" data-order-down aria-label="Move ${E(g.name)} down" title="Move down" style="width:auto;min-width:44px;min-height:44px;margin:0">↓</button></div>`:''}</div>`).join('')}</div>`;
 layout.append(side,groups);
 const orderRows=[...side.querySelectorAll('[data-order-group]')].filter(row=>row.dataset.orderGroup!=='ungrouped');
 orderRows.forEach((row,index)=>{
  const id=row.dataset.orderGroup,up=row.querySelector('[data-order-up]'),down=row.querySelector('[data-order-down]'),handle=row.querySelector('[data-order-drag]');
  up.disabled=index===0;down.disabled=index===orderRows.length-1;
  up.onclick=()=>window.JJGroupOrder?.move(id,-1);down.onclick=()=>window.JJGroupOrder?.move(id,1);
  handle.ondragstart=e=>window.JJGroupOrder?.start(e,id);handle.ondragend=()=>window.JJGroupOrder?.end();
  row.ondragover=e=>window.JJGroupOrder?.over(e);row.ondrop=e=>window.JJGroupOrder?.drop(e,id);
 });
 side.querySelector('.rd-groups-toggle').onclick=()=>{collapsed=!collapsed;localStorage.setItem('jj_test_groups_collapsed',String(collapsed));layout.classList.toggle('groups-collapsed',collapsed);const b=side.querySelector('.rd-groups-toggle');b.setAttribute('aria-expanded',String(!collapsed));b.innerHTML=`${collapsed?'›':'‹'} <span>Groups</span>`};
 side.querySelector('[data-add-group]').onclick=()=>window.JJSelectionGroups?.create();
 side.onclick=e=>{const button=e.target.closest('[data-group-jump],[data-group-all]');if(!button)return;const id=button.dataset.groupJump;window.setSelectionFilter('All');requestAnimationFrame(()=>{
 const targets=[...root.querySelectorAll('.named-selection-group')];const target=id?targets.find(g=>g.dataset.selectionGroupId===id):root.querySelector('.selection-groups');
 if(target){target.classList.remove('collapsed');target.querySelector('.selection-room-toggle')?.setAttribute('aria-expanded','true');const top=target.getBoundingClientRect().top+window.scrollY-(document.getElementById('redesignChrome')?.getBoundingClientRect().height||0)-12;window.scrollTo({top:Math.max(0,top),behavior:'smooth'})}
 const selected=[...root.querySelectorAll('[data-group-jump]')].find(b=>b.dataset.groupJump===id);selected?.setAttribute('aria-current','true');
 });};
 for(const card of root.querySelectorAll('.selection-card')){const photo=card.querySelector('.selection-photo');if(!photo)continue;const tools=document.createElement('div');tools.className='rd-selection-card-tools';for(const selector of ['.jj-bulk-card-select','.selection-photo-status','.selection-card-menu']){const node=photo.querySelector(selector);if(node)tools.append(node)}if(tools.childNodes.length)card.prepend(tools)}
}
function install(){const original=window.renderSelections;if(!original||original.__groupsSidebar)return;function wrapped(){const result=original.apply(this,arguments);decorate();return result}wrapped.__groupsSidebar=true;window.renderSelections=wrapped;decorate()}
window.addEventListener('jj-selections-v82-ready',install);if(window.__JJ_SELECTIONS_V82_READY__)install();
})();
