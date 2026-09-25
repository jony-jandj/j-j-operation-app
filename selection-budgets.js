/* Group budgets are job-owned metadata; totals never change accounting records. */
(()=>{
'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
function summary(group,items){
 const budget=Number.isSafeInteger(group?.budgetCents)&&group.budgetCents>=0?group.budgetCents:null;
 const chosen=items.filter(i=>['Selected','Ordered','Received'].includes(i.status));
 let total=0,unpriced=0;
 for(const i of chosen){const price=Number(i.unitPrice);if(i.unitPrice==null||i.unitPrice===''||!Number.isFinite(price)){unpriced++;continue}total+=Math.round(price*Math.max(1,Number(i.quantity)||1)*(i.addTax?1.0825:1)*100)}
 return {budget,total,unpriced,over:budget===null?0:Math.max(0,total-budget)};
}
function html(group,items){
 const s=summary(group,items);
 return `<div class="jj-group-budget ${s.over?'over-budget':''}" role="status">${s.budget===null?'Budget not set':`Budget <strong>${money(s.budget)}</strong>`} · Selected total <strong>${money(s.total)}</strong>${s.budget!==null?` · <strong>${s.over?`${money(s.over)} over budget`:`${money(s.budget-s.total)} remaining`}</strong>`:''}${s.unpriced?` · ${s.unpriced} selected item(s) still need pricing`:''}</div>`;
}
function edit(projectId,groupId,name){
 const project=state.projects.find(p=>String(p.id)===projectId);if(!project)return;
 const existing=groupId==='ungrouped'?project.selectionUngroupedBudget:(project.selectionGroups||[]).find(g=>String(g.id)===groupId);
 const dialog=document.createElement('dialog');dialog.className='jj-budget-dialog';
 dialog.innerHTML=`<form><h2>Group budget</h2><p>${E(name)}</p><label>Budget ($)<input name="budget" type="number" min="0" step="0.01" max="999999999" value="${existing?.budgetCents==null?'':existing.budgetCents/100}" placeholder="No budget" inputmode="decimal"></label><p>Includes quantities and applied tax for Selected, Ordered, and Received items. Leave blank to remove the budget.</p><p role="alert"></p><footer><button type="button" data-cancel>Cancel</button><button type="submit" class="btn-gold">Save Budget</button></footer></form>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=e=>{
  e.preventDefault();const raw=dialog.querySelector('input').value.trim(),value=raw===''?null:Math.round(Number(raw)*100);
  if(value!==null&&(!Number.isSafeInteger(value)||value<0)){dialog.querySelector('[role=alert]').textContent='Enter a valid budget of $0 or more.';return}
  const target=state.projects.find(p=>String(p.id)===projectId);if(!target){dialog.querySelector('[role=alert]').textContent='This job is no longer available.';return}
  target.selectionGroups=target.selectionGroups||[];
  let group=groupId==='ungrouped'?(target.selectionUngroupedBudget??={}):target.selectionGroups.find(g=>String(g.id)===groupId);
  if(!group){group={id:groupId,name};target.selectionGroups.push(group)}
  if(value===null)delete group.budgetCents;else group.budgetCents=value;
  saveState(false);dialog.close();window.renderSelections();
 };
 dialog.showModal();
}
function decorate(){
 const project=typeof selectedProject==='function'?selectedProject():null;if(!project)return;
 document.querySelectorAll('#selections .named-selection-group').forEach(section=>{
  if(section.querySelector('.jj-budget-tools'))return;
  const id=section.dataset.selectionGroupId,items=(project.selections||[]).filter(i=>String(i.optionGroupId||'ungrouped')===id);
  const group=id==='ungrouped'?project.selectionUngroupedBudget:(project.selectionGroups||[]).find(g=>String(g.id)===id);
  const name=group?.name||items[0]?.optionGroupTitle||'Ungrouped selections';
  const tools=document.createElement('div');tools.className='jj-budget-tools';tools.innerHTML=html(group,items)+'<button type="button" data-edit-budget>Set / Edit Budget</button>';
  section.querySelector('.selection-room-heading')?.after(tools);
  tools.querySelector('button').onclick=()=>edit(String(project.id),id,name);
 });
}
function install(){const original=window.renderSelections;if(!original||original.__budgets)return;function wrapped(){const result=original.apply(this,arguments);decorate();return result}wrapped.__budgets=true;window.renderSelections=wrapped;decorate()}
window.JJGroupBudgets={summary,html};
window.addEventListener('jj-selections-v82-ready',install);if(window.__JJ_SELECTIONS_V82_READY__)install();
})();
