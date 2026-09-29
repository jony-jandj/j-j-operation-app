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
 return `<div class="jj-group-budget ${s.over?'over-budget':''}" role="status">${s.budget===null?'Budget not set':`Budget <strong>${money(s.budget)}</strong>`}${group?.budgetMode==='unit'&&s.budget!==null?` <small>(${E(group.budgetQuantity)} ${E(group.budgetUnit)} × ${money(group.budgetUnitCents)} / ${E(group.budgetUnit)})</small>`:''} · Selected total <strong>${money(s.total)}</strong>${s.budget!==null?` · <strong>${s.over?`${money(s.over)} over budget`:`${money(s.budget-s.total)} remaining`}</strong>`:''}${s.unpriced?` · ${s.unpriced} selected item(s) still need pricing`:''}</div>`;
}
function edit(projectId,groupId,name){
 const project=state.projects.find(p=>String(p.id)===projectId);if(!project)return;
 const existing=groupId==='ungrouped'?project.selectionUngroupedBudget:(project.selectionGroups||[]).find(g=>String(g.id)===groupId);
 const dialog=document.createElement('dialog');dialog.className='jj-budget-dialog';
 dialog.innerHTML=`<form><h2>Group budget</h2><p>${E(name)}</p><label>Budget type<select name="mode"><option value="total">Total budget</option><option value="unit">Budget per unit</option></select></label><div data-total><label>Budget ($)<input name="budget" type="number" min="0" step="0.01" max="999999999" value="${existing?.budgetCents==null?'':existing.budgetCents/100}" placeholder="No budget" inputmode="decimal"></label></div><div data-unit hidden><label>Quantity<input name="quantity" type="number" min="0.01" step="0.01" max="999999999" value="${E(existing?.budgetQuantity??1)}" inputmode="decimal"></label><label>Unit — type your own<input name="unit" type="text" list="jj-budget-units" maxlength="60" value="${E(existing?.budgetUnit||'each')}" placeholder="e.g. each, sqft, lf, roll, bundle" aria-describedby="jj-budget-unit-help"></label><datalist id="jj-budget-units"><option value="each"><option value="sqft"><option value="lf"><option value="box"><option value="set"></datalist><p id="jj-budget-unit-help" class="jj-budget-help">Type any unit you need, or choose a suggestion.</p><label>Budget per unit ($)<input name="rate" type="number" min="0" step="0.01" max="999999999" value="${existing?.budgetUnitCents==null?'':existing.budgetUnitCents/100}" inputmode="decimal"></label><p data-calculated role="status"></p></div><p>Compared with Selected, Ordered, and Received items, including quantities and applied tax. Leave the budget amount blank to remove it.</p><p role="alert"></p><footer><button type="button" data-cancel>Cancel</button><button type="submit" class="btn-gold">Save Budget</button></footer></form>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 const form=dialog.querySelector('form'),fields=form.elements;fields.mode.value=existing?.budgetMode==='unit'?'unit':'total';
 function values(){const perUnit=fields.mode.value==='unit',raw=(perUnit?fields.rate:fields.budget).value.trim(),rate=raw===''?null:Math.round(Number(raw)*100),quantity=Number(fields.quantity.value),unit=fields.unit.value.trim();return {perUnit,rate,quantity,unit,value:rate===null?null:perUnit?Math.round(rate*quantity):rate}}
 function update(){const v=values();dialog.querySelector('[data-total]').hidden=v.perUnit;dialog.querySelector('[data-unit]').hidden=!v.perUnit;fields.budget.disabled=v.perUnit;for(const k of ['quantity','unit','rate'])fields[k].disabled=!v.perUnit;dialog.querySelector('[data-calculated]').textContent=Number.isSafeInteger(v.value)&&v.value>=0?`Total budget: ${money(v.value)}`:'Enter a quantity and budget per unit.';}
 form.addEventListener('input',update);fields.mode.onchange=update;update();
 form.onsubmit=e=>{
  e.preventDefault();const {perUnit,rate,quantity,unit,value}=values();
  if(value!==null&&(!Number.isSafeInteger(value)||value<0||value>99999999900||perUnit&&(!Number.isFinite(quantity)||quantity<=0||!unit))){dialog.querySelector('[role=alert]').textContent='Enter a valid quantity, unit, and budget of $0 or more.';return}
  const target=state.projects.find(p=>String(p.id)===projectId);if(!target){dialog.querySelector('[role=alert]').textContent='This job is no longer available.';return}
  target.selectionGroups=target.selectionGroups||[];
  let group=groupId==='ungrouped'?(target.selectionUngroupedBudget??={}):target.selectionGroups.find(g=>String(g.id)===groupId);
  if(!group){group={id:groupId,name};target.selectionGroups.push(group)}
  for(const key of ['budgetMode','budgetQuantity','budgetUnit','budgetUnitCents'])delete group[key];
  if(value===null)delete group.budgetCents;else{group.budgetCents=value;if(perUnit)Object.assign(group,{budgetMode:'unit',budgetQuantity:quantity,budgetUnit:unit,budgetUnitCents:rate});}
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
  const tools=document.createElement('div');tools.className='jj-budget-tools';tools.innerHTML=html(group,items)+'<button type="button" class="btn jj-budget-edit" data-edit-budget><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M16 3l5 5M9 15l1-5 8-8a2 2 0 0 1 3 3l-8 8-4 2Z"/></svg><span>Set / Edit Budget</span></button>';
  section.querySelector('.selection-room-heading')?.after(tools);
  tools.querySelector('button').onclick=()=>edit(String(project.id),id,name);
 });
}
function install(){const original=window.renderSelections;if(!original||original.__budgets)return;function wrapped(){const result=original.apply(this,arguments);decorate();return result}wrapped.__budgets=true;window.renderSelections=wrapped;decorate()}
window.JJGroupBudgets={summary,html};
window.addEventListener('jj-selections-v82-ready',install);if(window.__JJ_SELECTIONS_V82_READY__)install();
})();
