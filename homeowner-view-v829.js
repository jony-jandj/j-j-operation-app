/* J&J Homeowner / Customer View v82.9
   Customer page only. Does not touch the contractor Selections page. */
(() => {
  if (window.__jjHomeownerView829) return;
  window.__jjHomeownerView829 = true;
  if (!/homeowner\.html$/i.test(location.pathname)) return;

  let mode = localStorage.getItem('jj-ho-group-mode') === 'all' ? 'all' : 'groups';
  let viewMode = localStorage.getItem('jj-ho-view-mode') === 'list' ? 'list' : 'card';
  let activeCategory = 'All selections';

  const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  const SI = u => S(u) || (/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(String(u || '')) ? String(u) : '');
  const M = v => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v || 0));
  const dataItems = () => { try { return Array.isArray(items) ? items : []; } catch { return []; } };

  function category(i){
    const c = String(i?.category || '').trim();
    if (!c) return 'Other';
    if (/tile|flooring/i.test(c)) return 'Tile';
    if (/plumb|faucet|shower|toilet|drain|tub/i.test(c)) return 'Plumbing';
    if (/vanit/i.test(c)) return 'Vanities';
    if (/light|electric/i.test(c)) return 'Lighting';
    if (/door/i.test(c)) return 'Doors / Hardware';
    if (/hardware/i.test(c)) return 'Hardware';
    if (/cabinet|storage/i.test(c)) return 'Cabinetry';
    return c;
  }

  function injectStyles(){
    if (document.getElementById('jjHomeownerView829Style')) return;
    const style = document.createElement('style');
    style.id = 'jjHomeownerView829Style';
    style.textContent = `
      body{background:#F4F6F9!important;color:#14234A!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
      body>header{height:58px!important;display:flex!important;align-items:center!important;padding:0 28px!important;background:#14234A!important;color:#fff!important;font-size:13px!important;font-weight:850!important}
      main{max-width:1280px!important;padding:28px 28px 56px!important}
      #job{margin:0!important;color:#14234A!important;font-size:30px!important;line-height:1.08!important;font-weight:950!important;letter-spacing:-.5px!important}
      #job+p{margin:7px 0 0!important;color:#667386!important;font-size:13px!important;line-height:1.45!important;max-width:760px!important}
      #message{margin:16px 0!important;padding:10px 13px!important;border:1px solid #E0D7C3!important;border-radius:9px!important;background:#FFF8E9!important;color:#65532E!important;font-size:12px!important}
      main>.toolbar{justify-content:flex-end!important;margin:0 0 14px!important;gap:8px!important}
      main>.toolbar button{min-height:38px!important;padding:8px 12px!important;border:1px solid #D8DEE7!important;border-radius:9px!important;font-size:11px!important;font-weight:850!important}
      #newSelection{background:#B59A62!important;color:#14234A!important;border-color:#B59A62!important}#refresh{background:#fff!important;color:#14234A!important}
      main>.actions[aria-label="Selections view"],#jjHOGroupToolbarV82,#jjCustomerControls827{display:none!important}
      #jjCustomerControls829{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:18px 0 16px}
      #jjCustomerControls829 .left,#jjCustomerControls829 .right,#jjCustomerControls829 .cats{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      #jjCustomerControls829 .segment{display:flex;gap:4px;padding:4px;border:1px solid #DDE2E8;border-radius:10px;background:#fff}
      #jjCustomerControls829 button{min-height:36px!important;padding:8px 11px!important;border:1px solid transparent!important;border-radius:8px!important;background:transparent!important;color:#526174!important;font-size:11px!important;font-weight:900!important}
      #jjCustomerControls829 button[aria-pressed="true"]{background:#14234A!important;color:#fff!important;box-shadow:0 2px 6px rgba(20,35,74,.14)!important}
      #jjCustomerControls829 .cat{border:1px solid #DDE2E8!important;border-radius:999px!important;background:#fff!important;color:#526174!important;padding:8px 13px!important}
      #jjCustomerControls829 .cat[aria-pressed="true"]{background:#14234A!important;border-color:#14234A!important;color:#fff!important}
      #jjHOCard829,#jjHOList829{width:38px!important;min-width:38px!important;padding:6px!important;font-size:17px!important;line-height:1!important}
      #items{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(285px,1fr))!important;gap:16px!important;align-items:start!important}
      #items.jj-ho-list{grid-template-columns:1fr!important}
      #items>.option-group{grid-column:1/-1!important;margin:0 0 8px!important;border:1px solid #D9E0E8!important;border-radius:13px!important;background:#fff!important;overflow:hidden!important;box-shadow:0 3px 10px rgba(20,35,74,.05)!important}
      #items>.option-group>summary{display:flex!important;align-items:center!important;gap:10px!important;min-height:58px!important;padding:12px 14px!important;border-left:5px solid #B59A62!important;background:linear-gradient(90deg,#F8F3E9 0,#fff 45%)!important;color:#14234A!important;list-style:none!important;cursor:pointer!important}
      #items>.option-group>summary::-webkit-details-marker{display:none!important}
      .jj-ho-title{flex:1;min-width:0;font-size:13px;font-weight:950;letter-spacing:.25px;text-transform:uppercase}.jj-ho-count{font-size:10px;font-weight:800;color:#6B7788;white-space:nowrap}.jj-ho-chevron{font-size:15px;color:#14234A;transition:transform .18s ease}.option-group[open] .jj-ho-chevron{transform:rotate(180deg)}
      .jj-ho-add{min-height:34px!important;padding:7px 10px!important;border:1px solid #D8DEE7!important;border-radius:8px!important;background:#fff!important;color:#14234A!important;font-size:10px!important;font-weight:900!important}
      .option-group-items{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(285px,1fr))!important;gap:16px!important;padding:14px!important;background:#F8FAFC!important}#items.jj-ho-list .option-group-items{grid-template-columns:1fr!important}
      #items article.jj-ho-card{position:relative!important;display:block!important;min-width:0!important;overflow:hidden!important;border:1px solid #D9E0E8!important;border-radius:12px!important;background:#fff!important;box-shadow:0 2px 8px rgba(20,35,74,.045)!important}
      #items article.jj-ho-card.chosen{border:2px solid #4C8A68!important}.jj-ho-photo{position:relative;height:210px;background:#F0F2F5;overflow:hidden}.jj-ho-photo img{width:100%;height:100%;object-fit:contain;display:block;background:#F0F2F5}.jj-ho-placeholder{height:100%;display:grid;place-items:center;color:#8792A1;font-size:11px}.jj-ho-status{position:absolute;left:10px;top:10px;z-index:2;padding:6px 8px;border:1px solid #E7D8B4;border-radius:999px;background:#FFF9E9;color:#71591E;font-size:9px;font-weight:950}.chosen .jj-ho-status{border-color:#B9D9C6;background:#EDF7F1;color:#2B6D48}
      .jj-ho-body{padding:16px!important}.jj-ho-cat{margin-bottom:7px;color:#6B7788;font-size:9px;font-weight:950;letter-spacing:.7px;text-transform:uppercase}.jj-ho-card h2{margin:0 0 6px!important;color:#14234A!important;font-size:16px!important;line-height:1.3!important;font-weight:900!important}.jj-ho-vendor{margin:0 0 10px!important;color:#687587!important;font-size:10px!important}.jj-ho-detail{margin:0 0 12px!important;color:#4F5B6C!important;font-size:12px!important;line-height:1.45!important;white-space:pre-wrap;overflow-wrap:anywhere}.jj-ho-price-row{display:flex;justify-content:space-between;gap:12px;align-items:end;padding-top:12px;border-top:1px solid #EEF1F4}.jj-ho-price{color:#14234A;font-size:19px;font-weight:950}.jj-ho-price small{margin:2px 0 0!important;color:#7B8796;font-size:9px;font-weight:650}.jj-ho-buyer{text-align:right;color:#6B7788;font-size:9px;line-height:1.3}.jj-ho-buyer b{display:block;color:#14234A;font-size:11px}.jj-ho-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.jj-ho-actions button,.jj-ho-actions a{min-height:34px!important;padding:7px 10px!important;border:1px solid #D8DEE7!important;border-radius:8px!important;background:#fff!important;color:#14234A!important;font-size:10px!important;font-weight:900!important;text-decoration:none!important;display:inline-flex;align-items:center}.jj-ho-actions button[data-select]{background:#14234A!important;color:#fff!important;border-color:#14234A!important}.jj-ho-actions button[disabled]{background:#F1F3F6!important;color:#8B95A3!important;border-color:#E2E6EB!important}.jj-ho-option{display:inline-block;margin-left:4px;color:#B59A62;font-size:9px;font-weight:900}
      #items.jj-ho-list article.jj-ho-card{display:grid!important;grid-template-columns:180px minmax(0,1fr)!important;align-items:stretch!important}#items.jj-ho-list .jj-ho-photo{height:100%!important;min-height:165px!important}
      @media(max-width:720px){main{padding:20px 14px 40px!important}body>header{padding:0 16px!important}#job{font-size:25px!important}#jjCustomerControls829 .cats{width:100%;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}#jjCustomerControls829 .cats button{white-space:nowrap}#jjCustomerControls829 .left,#jjCustomerControls829 .right{width:100%}#jjCustomerControls829 .right{justify-content:space-between}#items{grid-template-columns:1fr!important}.option-group-items{grid-template-columns:1fr!important}#items.jj-ho-list article.jj-ho-card{grid-template-columns:92px minmax(0,1fr)!important}.jj-ho-photo{height:190px}.jj-ho-count{display:none}}
    `;
    document.head.appendChild(style);
  }

  function unavailable(i, all){
    const key = i.optionGroupId || i.id;
    return i.status !== 'Selected' && all.some(o => String(o.id) !== String(i.id) && String(o.optionGroupId || o.id) === String(key) && o.status === 'Selected');
  }

  function card(i, all){
    const selected = i.status === 'Selected';
    const blocked = unavailable(i, all);
    const priced = i.unitPrice !== null && i.unitPrice !== undefined && i.unitPrice !== '' && Number.isFinite(Number(i.unitPrice));
    const total = Number(i.unitPrice || 0) * Number(i.quantity || 1) * (i.addTax ? 1.0825 : 1);
    const image = SI(i.image);
    return `<article class="jj-ho-card ${selected?'chosen':''}">
      <div class="jj-ho-photo"><span class="jj-ho-status">${E(blocked?'Unavailable':i.status||'Pending')}</span>${image?`<img src="${E(image)}" alt="${E(i.title||'Product photo')}" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.querySelector('.jj-ho-placeholder')?.removeAttribute('hidden')">`:''}<div class="jj-ho-placeholder" ${image?'hidden':''}>No product photo</div></div>
      <div class="jj-ho-body"><div class="jj-ho-cat">${E(category(i))}</div><h2>${E(i.title||'Selection')}${i.optionLabel?`<span class="jj-ho-option">${E(i.optionLabel)}</span>`:''}</h2><div class="jj-ho-vendor">${E(i.vendor||'')}${i.model?` · Model/SKU ${E(i.model)}`:''}</div>${i.description?`<p class="jj-ho-detail">${E(i.description)}</p>`:''}
      <div class="jj-ho-price-row"><div class="jj-ho-price">${priced?M(total):'Price not set'}<small>${priced?`${E(i.quantity||1)} item${Number(i.quantity||1)===1?'':'s'}${i.addTax?' · tax included':''}`:'J&J will add pricing'}</small></div><div class="jj-ho-buyer">Purchased by<b>${E(i.purchasedBy||'Not assigned')}</b></div></div>
      <div class="jj-ho-actions">${selected?`<button data-select="${E(i.id)}" aria-pressed="true">Selected</button>`:blocked?`<button disabled>Unavailable</button>`:`<button data-select="${E(i.id)}" aria-pressed="false">Mark Selected</button>`}${S(i.url)?`<a href="${E(S(i.url))}" target="_blank" rel="noopener noreferrer">View product ↗</a>`:''}</div></div></article>`;
  }

  function filtered(){
    const all = dataItems();
    return activeCategory === 'All selections' ? all : all.filter(i => category(i) === activeCategory);
  }

  function groupHTML(group, all){
    const first = group[0];
    const name = first?.optionGroupTitle || first?.title || 'Selection Group';
    return `<details class="option-group" open><summary><span class="jj-ho-title">${E(name)}</span><span class="jj-ho-count">${group.length} option${group.length===1?'':'s'}</span><button type="button" class="jj-ho-add" data-option="${E(first?.id)}">+ Add Option</button><span class="jj-ho-chevron">⌄</span></summary><div class="option-group-items">${group.map(i=>card(i,all)).join('')}</div></details>`;
  }

  function render829(){
    const root = document.getElementById('items');
    if (!root) return;
    const data = filtered();
    root.classList.toggle('jj-ho-list', viewMode === 'list');
    if (!data.length){ root.innerHTML='<p style="grid-column:1/-1;padding:22px;background:#fff;border:1px solid #DDE2E8;border-radius:12px">No selections in this view.</p>'; return; }
    if (mode === 'all'){ root.innerHTML = data.map(i=>card(i,data)).join(''); return; }
    const groups = new Map();
    data.forEach(i=>{ const key=i.optionGroupId?`g:${i.optionGroupId}`:`i:${i.id}`; if(!groups.has(key))groups.set(key,[]); groups.get(key).push(i); });
    root.innerHTML = [...groups.values()].map(g=>g[0]?.optionGroupId?groupHTML(g,data):card(g[0],data)).join('');
  }

  function buildControls(){
    const root=document.getElementById('items'); if(!root)return;
    document.getElementById('jjCustomerControls829')?.remove();
    const all=dataItems(), preferred=['Tile','Plumbing','Vanities','Lighting','Hardware','Doors / Hardware','Cabinetry'];
    const present=[...new Set(all.map(category).filter(Boolean))];
    const cats=['All selections',...preferred.filter(c=>present.includes(c)),...present.filter(c=>!preferred.includes(c))];
    const controls=document.createElement('div'); controls.id='jjCustomerControls829';
    controls.innerHTML=`<div class="left"><div class="segment"><button type="button" id="jjHOAll829" aria-pressed="${mode==='all'}">Show All</button><button type="button" id="jjHOGroups829" aria-pressed="${mode==='groups'}">Show Groups</button></div></div><div class="right"><div class="cats">${cats.map(c=>`<button type="button" class="cat" data-cat="${E(c)}" aria-pressed="${activeCategory===c}">${E(c)}</button>`).join('')}</div><div class="segment"><button type="button" id="jjHOCard829" title="Card view" aria-label="Card view" aria-pressed="${viewMode==='card'}">▦</button><button type="button" id="jjHOList829" title="List view" aria-label="List view" aria-pressed="${viewMode==='list'}">☰</button></div></div>`;
    root.before(controls);
    controls.addEventListener('click',e=>{
      const b=e.target.closest('button'); if(!b)return;
      if(b.id==='jjHOAll829'){mode='all';localStorage.setItem('jj-ho-group-mode','all');}
      else if(b.id==='jjHOGroups829'){mode='groups';localStorage.setItem('jj-ho-group-mode','groups');}
      else if(b.id==='jjHOCard829'){viewMode='card';localStorage.setItem('jj-ho-view-mode','card');}
      else if(b.id==='jjHOList829'){viewMode='list';localStorage.setItem('jj-ho-view-mode','list');}
      else if(b.dataset.cat)activeCategory=b.dataset.cat;
      buildControls(); render829();
    });
  }

  function install(){
    if (!document.getElementById('items')) return;
    injectStyles();
    const nativeRender = window.render;
    if (typeof nativeRender === 'function' && !nativeRender.__jj829){
      const wrapped = function(){ buildControls(); render829(); };
      wrapped.__jj829 = true;
      window.render = wrapped;
    }
    buildControls();
    render829();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});
  else setTimeout(install,0);
})();