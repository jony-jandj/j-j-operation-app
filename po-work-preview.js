/* Recipient-only print document. Receives no builder costs or payout percentages. */
(()=>{'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isSafeInteger(n)&&n>=0?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100):'Not set';
function documentHTML(data,recipient,showOthers){
 const name=data.rows.flatMap(r=>r.assignments).find(a=>a.id===recipient)?.name||'';
 const cards=data.rows.map(r=>{
  const mine=r.assignments.filter(a=>a.id===recipient),amount=mine.reduce((s,a)=>s+a.amount,0);
  if(!mine.length&&!r.hasUnassigned&&!showOthers)return '';
  const status=mine.length?'Proposed for '+name:r.hasUnassigned?'Unassigned':'Assigned to another crew';
  return `<article><div class="heading"><div><small>P.O. ${E(r.po)}${r.split?' · Split line':''}</small><h2>${E(r.title||'Untitled work')}</h2></div>${mine.length?`<div class="amount"><small>Your payout</small><b>${money(amount)}</b></div>`:r.hasUnassigned?`<div class="amount"><small>Unassigned payout</small><b>${money(r.unassigned)}</b></div>`:''}</div><p>${E(r.description||'Description not entered.')}</p>${mine.length&&r.hasUnassigned?`<p class="remaining">Unassigned payout: ${money(r.unassigned)}</p>`:''}<div class="status"><span>${E(status)}</span><span>Pending approval</span></div></article>`;
 }).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>J&J Work Preview</title><style>*{box-sizing:border-box}body{font:13px/1.45 Arial,sans-serif;margin:0;padding:22px;color:#203044;background:white}header{border-bottom:2px solid #b49a61;padding-bottom:12px;margin-bottom:14px}h1{font-size:20px;margin:0 0 5px}.meta{font-size:12px;margin-top:7px;color:#526273}.notice{font-size:12px;padding:8px 10px;background:#f8f5ec;margin-bottom:14px}article{border:1px solid #b7c4d0;border-radius:6px;margin-bottom:12px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.heading{display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap;padding:11px 12px 7px}h2{font-size:15px;margin:3px 0;overflow-wrap:anywhere}small{font-size:11px;color:#566778}.amount small{display:block}.amount{text-align:right}.amount b{font-size:18px}p{margin:0;padding:0 12px 11px;white-space:pre-wrap;overflow-wrap:anywhere}.remaining{font-size:12px}.status{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;background:#f0f3f6;border-top:1px solid #dce2e8;padding:7px 12px;font-size:11px}@page{size:letter;margin:.45in}@media print{body{padding:0}}@media(max-width:450px){body{padding:12px}.amount{text-align:left}}</style></head><body><header><h1>J&J Home Renovations</h1><div>Work preview${name?' · '+E(name):' · Unassigned work'}</div><div class="meta">${E(data.job)}${data.jobNo?' · '+E(data.jobNo):''} · ${new Date().toLocaleDateString('en-US')}</div></header><div class="notice">Pending approval · Review work and proposed payouts before scheduling.</div>${cards||'<p>No work for this view.</p>'}</body></html>`;
}
function open(data){
 document.getElementById('jj-draft-work-preview')?.remove();
 const dialog=document.createElement('dialog');dialog.id='jj-draft-work-preview';dialog.className='jj-bulk-payout';dialog.style.width='min(900px,calc(100% - 24px))';
 const people=[...new Map(data.rows.flatMap(r=>r.assignments).map(a=>[a.id,a])).values()];
 dialog.innerHTML=`<h2>Preview selected work</h2><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end"><label>Preview for<select data-recipient>${people.map(a=>`<option value="${E(a.id)}">${E(a.name)}</option>`).join('')}<option value="">Unassigned work</option></select></label><label style="display:flex;align-items:center;min-height:44px"><input type="checkbox" data-others style="width:auto"> Show work assigned to others</label></div><p>${data.rows.length} unapproved line(s)${data.excluded?` · ${data.excluded} approved / active-work line(s) excluded`:''}. Preview only; no approvals or payouts are changed.</p><iframe title="Draft work print preview" style="width:100%;height:60dvh;border:1px solid #bac5d0;background:white"></iframe><footer><button data-close>Close</button><button data-print>Print / Save PDF</button></footer>`;
 document.body.append(dialog);dialog.showModal();
 const frame=dialog.querySelector('iframe'),recipient=dialog.querySelector('[data-recipient]'),others=dialog.querySelector('[data-others]'),print=dialog.querySelector('[data-print]');
 function render(){print.disabled=true;frame.srcdoc=documentHTML(data,recipient.value,others.checked)}
 frame.onload=()=>print.disabled=false;recipient.onchange=render;others.onchange=render;
 print.onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print()};dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();render();
}
window.JJDraftWorkPreview={open,documentHTML};
})();
