/* J&J Selection Recovery SAFE v74 — preserves current app selections during homeowner sync */
/* Shared retailer metadata lookup. Never writes selection records or homeowner pricing. */
window.JJProduct = (() => {
 const text=v=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
 const safe=u=>/^https?:\/\//i.test(text(u))?text(u):'';
 function title(v){return text(v).replace(/\s+/g,' ').replace(/\s+[|–—-]\s+(?:The Home Depot|Lowe['’]s|Wayfair|Amazon(?:\.com)?|Floor & Decor).*$/i,'').trim();}
 function goodTitle(v){const s=title(v);return s.length>3&&!/access denied|captcha|robot check|just a moment|page not found|request blocked|verify you are|^error\b/i.test(s)&&! /^(the home depot|lowe['’]s|amazon|wayfair|product|dp|p)$/i.test(s)?s:'';}
 function category(v){return [[/tile|mosaic|porcelain|ceramic/i,'Tile'],[/shower door|hinge|door|lockset/i,'Doors / Hardware'],[/vanity|cabinet/i,'Vanity'],[/mirror/i,'Mirror'],[/faucet|shower|tub|valve|drain|toilet/i,'Plumbing'],[/sconce|light|chandelier|pendant/i,'Electrical'],[/flooring|hardwood|laminate|vinyl/i,'Flooring']].find(([p])=>p.test(v))?.[1]||'';}
 function guess(value){try{const u=new URL(value),host=u.hostname.replace(/^www\./,'');const vendor=({'homedepot.com':'The Home Depot','lowes.com':"Lowe’s",'flooranddecor.com':'Floor & Decor','wayfair.com':'Wayfair','build.com':'Build.com','ferguson.com':'Ferguson','amazon.com':'Amazon'})[host]||host;
 const parts=u.pathname.split('/').filter(Boolean).map(v=>{try{return decodeURIComponent(v)}catch{return v}});
 const candidates=parts.filter(p=>! /^(p|pd|dp|gp|product|products|item|detail|html?)$/i.test(p)&&! /^[0-9]+$/.test(p)&&! /^[a-z0-9]{10}$/i.test(p));
 let slug=candidates.sort((a,b)=>b.length-a.length)[0]||'';slug=slug.replace(/\.(html?|aspx?)$/i,'').replace(/[-_]\d{6,}$/,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
 const name=goodTitle(slug.replace(/\b\w/g,c=>c.toUpperCase()));
 return {title:name,vendor,model:u.searchParams.get('sku')||u.searchParams.get('model')||'',category:category(name)};
 }catch{return {title:'',vendor:'',model:'',category:''}}}
 function price(v){if(typeof v==='number')return Number.isFinite(v)&&v>=0?v:null;const s=text(v).replace(/,/g,'').replace(/^(?:USD\s*|\$)/i,'').trim();return /^\d+(?:\.\d{1,2})?$/.test(s)?Number(s):null;}
 function image(v){const u=safe(typeof v==='object'?v?.url:v);return /placeholder|no[-_]?image|image[-_]?not[-_]?available|missing[-_]?image|\/logo[./_-]|favicon/i.test(u)?'':u;}
 function parse(data){
 const products=[];const walk=(obj,depth=0)=>{if(depth>12||!obj||typeof obj!=='object')return;if(Array.isArray(obj)){obj.forEach(x=>walk(x,depth+1));return;}if([].concat(obj['@type']||[]).some(x=>/^(Product|ProductGroup)$/i.test(x)))products.push(obj);if(obj['@graph'])walk(obj['@graph'],depth+1);if(obj.mainEntity)walk(obj.mainEntity,depth+1);};
 for(const raw of [].concat(data.productJson||[])){try{walk(typeof raw==='string'?JSON.parse(raw):raw)}catch{}}
 const product=products.find(p=>p['@type']==='Product')||products[0]||{};
 const offers=[].concat(product.offers||[]);const exact=offers.filter(o=>!o['@type']||o['@type']==='Offer');let unitPrice=null;
 const amounts=exact.filter(o=>!o.priceCurrency||o.priceCurrency==='USD').map(o=>price(o.price??o.priceSpecification?.price)).filter(p=>p!==null);
 if(amounts.length&&new Set(amounts).size===1)unitPrice=amounts[0];
 if(unitPrice===null&&(!data.currency||text(data.currency).toUpperCase()==='USD'))unitPrice=price(data.price);
 const img=[].concat(product.image||[]).map(image).find(Boolean)||image(data.productImage)||image(data.image);
 return {title:goodTitle(product.name)||goodTitle(data.productName)||goodTitle(data.title),description:text(product.description)||text(data.description),model:text(product.sku)||text(product.mpn)||text(data.sku),image:img,unitPrice,category:category(text(product.name)||text(data.title))};
 }
 function lookupUrl(url){const q=new URLSearchParams({url,'data.productJson.selectorAll':'script[type="application/ld+json"]','data.productJson.attr':'text','data.productName.selector':'h1','data.productName.attr':'text','data.price.selector':'meta[itemprop="price"],meta[property="product:price:amount"],meta[property="og:price:amount"],meta[name="twitter:data1"]','data.price.attr':'content','data.currency.selector':'meta[property="product:price:currency"],meta[itemprop="priceCurrency"]','data.currency.attr':'content','data.sku.selector':'meta[itemprop="sku"],meta[property="product:retailer_item_id"]','data.sku.attr':'content','data.productImage.selector':'meta[property="og:image"]','data.productImage.attr':'content'});return 'https://api.microlink.io?'+q;}
 async function lookup(url){if(!safe(url))return null;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(lookupUrl(url),{signal:controller.signal});if(!r.ok)return null;const p=await r.json();if(p.status==='fail'||p.status==='error'||Number(p.statusCode)>=400)return null;const data=p.data||{};if(data.title&&!goodTitle(data.title))return null;return parse(data);}catch{return null;}finally{clearTimeout(timer)}}
 return {guess,lookup,parse,price,image,title:goodTitle,lookupUrl};
})();

/* -------------------------------------------------------------------------
   J&J Selection Groups UI patch
   - Replaces direct "link selection to selection" workflow with named groups.
   - Uses existing optionGroupId / optionGroupTitle fields so the homeowner portal
     automatically sees the exact same grouping.
   - Project state remains the source of truth and continues through saveState().
   ------------------------------------------------------------------------- */
(() => {
  const PATCH_ID='jj-selection-groups-v63';

  function escLocal(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function project(){
    try{return typeof window.selectedProject==='function' ? window.selectedProject() : null;}
    catch{return null;}
  }

  function ensureGroups(p=project()){
    if(!p)return [];
    if(!Array.isArray(p.selectionGroups))p.selectionGroups=[];

    // Migrate any existing linked-option data into the explicit group registry.
    const found=new Map();
    (p.selections||[]).forEach(item=>{
      if(!item?.optionGroupId)return;
      const id=String(item.optionGroupId);
      const name=String(item.optionGroupTitle||item.title||'Selection Group').trim()||'Selection Group';
      if(!found.has(id))found.set(id,name);
    });
    found.forEach((name,id)=>{
      if(!p.selectionGroups.some(g=>String(g.id)===id)){
        p.selectionGroups.push({id,name});
      }
    });

    // Keep names synchronized from registry -> selection records.
    p.selectionGroups.forEach(group=>{
      (p.selections||[]).forEach(item=>{
        if(String(item.optionGroupId||'')===String(group.id)){
          item.optionGroupTitle=group.name;
        }
      });
    });
    return p.selectionGroups;
  }

  function saveAndRender(message=''){
    try{window.saveState?.(false);}catch{}
    try{window.renderSelections?.();}catch{}
    if(message)try{window.toast?.(message);}catch{}
  }

  function makeGroupId(){
    const random=(crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
    return `group-${Date.now()}-${random}`;
  }

  function removeDialog(id){
    const existing=document.getElementById(id);
    if(existing)existing.remove();
  }

  function openCreateGroup(assignIndex=null){
    removeDialog('jjSelectionGroupCreate');
    const dialog=document.createElement('dialog');
    dialog.id='jjSelectionGroupCreate';
    dialog.className='jj-group-dialog';
    dialog.innerHTML=`
      <form method="dialog" onsubmit="return false">
        <div class="jj-group-head">
          <div>
            <small>SELECTIONS</small>
            <h3>Create Group</h3>
          </div>
          <button type="button" class="jj-group-icon" data-close aria-label="Close">×</button>
        </div>
        <div class="jj-group-body">
          <label class="jj-group-label">Group name
            <input id="jjNewSelectionGroupName" class="input" maxlength="120"
              placeholder="Primary Bathroom, Shower Fixtures, Vanity Package…">
          </label>
          <p class="jj-group-help">Create the group first, then add any selection to it. Groups do not delete or change the products inside them.</p>
        </div>
        <div class="jj-group-foot">
          <button type="button" class="btn btn-light" data-close>Cancel</button>
          <button type="button" class="btn btn-gold" id="jjCreateSelectionGroupSave">Create Group</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('#jjCreateSelectionGroupSave').addEventListener('click',()=>{
      const name=dialog.querySelector('#jjNewSelectionGroupName').value.trim();
      if(!name){dialog.querySelector('#jjNewSelectionGroupName').focus();return;}
      const p=project(),groups=ensureGroups(p);
      if(groups.some(g=>g.name.trim().toLowerCase()===name.toLowerCase())){
        window.toast?.('A group with that name already exists');
        return;
      }
      const group={id:makeGroupId(),name};
      groups.push(group);
      if(assignIndex!==null && p?.selections?.[assignIndex]){
        const item=p.selections[assignIndex];
        item.optionGroupId=group.id;
        item.optionGroupTitle=group.name;
        delete item.optionLabel;
      }
      try{window.saveState?.(false);}catch{}
      dialog.close();
      try{window.renderSelections?.();}catch{}
      window.toast?.(assignIndex===null?'Selection group created':`Added to ${name}`);
    });
    dialog.showModal();
    setTimeout(()=>dialog.querySelector('#jjNewSelectionGroupName')?.focus(),40);
  }

  function assignToGroup(index,groupId){
    const p=project(),item=p?.selections?.[index];
    if(!item)return;
    const group=ensureGroups(p).find(g=>String(g.id)===String(groupId));
    if(!group)return;
    item.optionGroupId=group.id;
    item.optionGroupTitle=group.name;
    delete item.optionLabel;
    saveAndRender(`Added to ${group.name}`);
  }

  function removeFromGroup(index){
    const p=project(),item=p?.selections?.[index];
    if(!item)return;
    delete item.optionGroupId;
    delete item.optionGroupTitle;
    delete item.optionLabel;
    saveAndRender('Selection removed from group');
  }

  function openAssignDialog(index){
    const p=project(),item=p?.selections?.[index];
    if(!item)return;
    const groups=ensureGroups(p);
    removeDialog('jjSelectionGroupAssign');
    const dialog=document.createElement('dialog');
    dialog.id='jjSelectionGroupAssign';
    dialog.className='jj-group-dialog';
    const current=String(item.optionGroupId||'');
    dialog.innerHTML=`
      <div class="jj-group-head">
        <div>
          <small>ADD TO GROUP</small>
          <h3>${escLocal(item.title||'Selection')}</h3>
        </div>
        <button type="button" class="jj-group-icon" data-close aria-label="Close">×</button>
      </div>
      <div class="jj-group-body">
        ${groups.length?`
          <div class="jj-group-choice-list">
            ${groups.map(group=>`
              <button type="button" class="jj-group-choice ${current===String(group.id)?'active':''}" data-group="${escLocal(group.id)}">
                <span>${escLocal(group.name)}</span>
                <small>${(p.selections||[]).filter(i=>String(i.optionGroupId||'')===String(group.id)).length} selection(s)</small>
              </button>`).join('')}
          </div>`:`
          <div class="jj-group-empty">
            <strong>No groups yet</strong>
            <span>Create your first group, then this selection can be added to it.</span>
          </div>`}
      </div>
      <div class="jj-group-foot">
        ${current?'<button type="button" class="btn btn-light" id="jjRemoveSelectionGroup">Remove from Group</button>':''}
        <button type="button" class="btn btn-light" id="jjCreateAndAssignGroup">+ Create Group</button>
        <button type="button" class="btn btn-gold" data-close>Done</button>
      </div>`;
    document.body.appendChild(dialog);
    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.querySelectorAll('[data-group]').forEach(btn=>btn.addEventListener('click',()=>{
      assignToGroup(index,btn.dataset.group);
      dialog.close();
    }));
    dialog.querySelector('#jjRemoveSelectionGroup')?.addEventListener('click',()=>{
      removeFromGroup(index);dialog.close();
    });
    dialog.querySelector('#jjCreateAndAssignGroup')?.addEventListener('click',()=>{
      dialog.close();setTimeout(()=>openCreateGroup(index),60);
    });
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  function renameGroup(groupId){
    const p=project(),groups=ensureGroups(p);
    const group=groups.find(g=>String(g.id)===String(groupId));
    if(!group)return;
    const name=prompt('Rename selection group',group.name);
    if(name===null)return;
    const clean=name.trim();
    if(!clean)return;
    group.name=clean;
    (p.selections||[]).forEach(item=>{
      if(String(item.optionGroupId||'')===String(group.id))item.optionGroupTitle=clean;
    });
    saveAndRender('Group renamed');
  }

  function deleteGroup(groupId){
    const p=project(),groups=ensureGroups(p);
    const group=groups.find(g=>String(g.id)===String(groupId));
    if(!group)return;
    const count=(p.selections||[]).filter(i=>String(i.optionGroupId||'')===String(group.id)).length;
    if(!confirm(`Delete the group "${group.name}"? ${count} selection${count===1?'':'s'} will stay in the job and become standalone.`))return;
    p.selectionGroups=groups.filter(g=>String(g.id)!==String(group.id));
    (p.selections||[]).forEach(item=>{
      if(String(item.optionGroupId||'')===String(group.id)){
        delete item.optionGroupId;
        delete item.optionGroupTitle;
        delete item.optionLabel;
      }
    });
    saveAndRender('Group deleted — selections were kept');
  }

  function openGroupManager(){
    const p=project(),groups=ensureGroups(p);
    removeDialog('jjSelectionGroupManager');
    const dialog=document.createElement('dialog');
    dialog.id='jjSelectionGroupManager';
    dialog.className='jj-group-dialog jj-group-manager';
    dialog.innerHTML=`
      <div class="jj-group-head">
        <div>
          <small>SELECTIONS</small>
          <h3>Manage Groups</h3>
        </div>
        <button type="button" class="jj-group-icon" data-close aria-label="Close">×</button>
      </div>
      <div class="jj-group-body">
        ${groups.length?groups.map(group=>{
          const members=(p.selections||[]).filter(i=>String(i.optionGroupId||'')===String(group.id));
          return `<section class="jj-group-row">
            <div class="jj-group-row-head">
              <div><strong>${escLocal(group.name)}</strong><small>${members.length} selection${members.length===1?'':'s'}</small></div>
              <div>
                <button type="button" class="btn btn-light" data-rename="${escLocal(group.id)}">Rename</button>
                <button type="button" class="btn btn-danger" data-delete="${escLocal(group.id)}">Delete Group</button>
              </div>
            </div>
            <details>
              <summary>View selections</summary>
              <div class="jj-group-member-list">
                ${members.length?members.map(item=>`<div>${escLocal(item.title||'Untitled selection')}</div>`).join(''):'<div class="jj-group-muted">No selections assigned yet.</div>'}
              </div>
            </details>
          </section>`;
        }).join(''):`<div class="jj-group-empty"><strong>No groups yet</strong><span>Create a group to organize selections by room, package, or fixture type.</span></div>`}
      </div>
      <div class="jj-group-foot">
        <button type="button" class="btn btn-light" id="jjManagerCreateGroup">+ Create Group</button>
        <button type="button" class="btn btn-gold" data-close>Done</button>
      </div>`;
    document.body.appendChild(dialog);
    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.querySelectorAll('[data-rename]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.rename;dialog.close();setTimeout(()=>{renameGroup(id);openGroupManager();},80);
    }));
    dialog.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.delete;dialog.close();setTimeout(()=>{deleteGroup(id);openGroupManager();},80);
    }));
    dialog.querySelector('#jjManagerCreateGroup').addEventListener('click',()=>{
      dialog.close();setTimeout(()=>openCreateGroup(null),60);
    });
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  function groupControlHTML(item,index){
    const p=project();
    ensureGroups(p);
    const group=(p?.selectionGroups||[]).find(g=>String(g.id)===String(item.optionGroupId||''));
    const label=group?'Change Group':'Add to Group';
    return `<button type="button" class="jj-selection-group-btn" onclick="window.JJSelectionGroups.openAssign(${index})">${label}</button>`;
  }

  function injectStyles(){
    if(document.getElementById(PATCH_ID))return;
    const style=document.createElement('style');
    style.id=PATCH_ID;
    style.textContent=`
      .jj-selection-top-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
      .jj-app-group-controls{display:inline-flex;gap:7px;align-items:center;margin-left:8px}
      .jj-app-group-controls .btn{min-width:94px!important;font-size:11px!important;line-height:1.1!important;padding:9px 11px!important}
      .jj-selection-group-badge{display:inline-flex;align-items:center;gap:5px;margin:7px 0 0;padding:5px 8px;border-radius:999px;background:#EEF3F7;color:#40566A;font-size:10px;font-weight:850}
      .jj-selection-group-btn{border:1px solid var(--line,#dfe4ea);background:#fff;color:var(--navy,#14234A);border-radius:8px;padding:8px 10px;font-size:11px;font-weight:800}
      .jj-group-summary-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-left:auto}
      .jj-group-summary-count{color:#657083;font-size:11px;font-weight:850;white-space:nowrap}
      .jj-group-add-option{border:1px solid #D9DFE7;background:#fff;color:#14234A;border-radius:8px;padding:7px 10px;font-size:10px;font-weight:900;white-space:nowrap}
      .jj-group-add-option:hover{background:#F7F2E8;border-color:#CDBA8E}
      .selection-option-group-title{gap:12px}
      .selection-option-group-title>.jj-group-title-text{min-width:0;overflow:hidden;text-overflow:ellipsis}
      #selectionEditGroup{display:block!important}
      .jj-editor-group-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
      .jj-ho-group-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 16px}
      .jj-ho-group-toolbar button{min-height:42px}
      #jjHOGroupToggle{min-width:118px;font-weight:800}
      #cardView,#listView{width:44px;min-width:44px;padding:10px!important;font-size:19px;line-height:1}

      /* Homeowner cards mirror the contractor Selections card layout */
      #items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      #items>.option-group{grid-column:1/-1;margin:0;border:1px solid #d9e0e6;border-radius:14px;background:#f8fafb;overflow:hidden;box-shadow:0 3px 12px rgba(19,35,52,.05)}
      #items>.option-group>summary,
      #items>.option-group>summary.jj-ho-summary{
        display:flex!important;
        align-items:center!important;
        gap:12px!important;
        min-height:58px;
        padding:14px 16px!important;
        background:#fff!important;
        color:#14234a!important;
        font-size:12px!important;
        font-weight:900!important;
        letter-spacing:.35px;
        text-transform:uppercase;
        list-style:none;
        overflow:visible!important;
      }
      #items>.option-group>summary::-webkit-details-marker{display:none}
      #items>.option-group>summary:before{content:"▸";flex:none;transition:transform .15s}
      #items>.option-group[open]>summary:before{transform:rotate(90deg)}
      #items>.option-group>summary .jj-ho-summary-title{
        min-width:0;
        flex:1 1 auto;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      #items>.option-group>summary .jj-ho-summary-actions{
        flex:0 0 auto;
        display:flex!important;
        align-items:center;
        gap:10px;
        margin-left:auto!important;
        white-space:nowrap;
      }
      #items>.option-group>summary .jj-ho-summary-count{
        color:#657083!important;
        font-size:11px!important;
        font-weight:800!important;
        text-transform:none;
        letter-spacing:0;
      }
      #items>.option-group .jj-ho-group-add-option{
        flex:none;
        margin:0!important;
        min-height:34px!important;
        padding:7px 10px!important;
        border:1px solid #d9dfe7!important;
        border-radius:8px!important;
        background:#f5f7fa!important;
        color:#14234a!important;
        font-size:10px!important;
        font-weight:900!important;
        text-transform:none;
        white-space:nowrap;
      }
      #items>.option-group>.option-group-items{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:14px!important;
        padding:14px!important;
      }
      #items article{
        overflow:hidden;
        min-width:0;
        background:#fff;
        border:1px solid #e3e7ed;
        border-radius:13px;
        box-shadow:0 2px 8px rgba(19,35,52,.04);
      }
      #items article.chosen{border:2px solid #2e7a55}
      #items article .photo{
        width:100%;
        height:220px;
        object-fit:contain;
        background:#fff;
        margin:0!important;
      }
      #items article .card-body{padding:14px!important;background:#fff;min-width:0;overflow-wrap:anywhere}
      #items article .card-body>small:first-child{
        margin:0 0 6px;
        color:#7a8290;
        font-size:10px;
        font-weight:850;
        letter-spacing:.45px;
        text-transform:uppercase;
      }
      #items article h2{margin:6px 0 5px;color:#202633;font-size:15px;line-height:1.35}
      #items article .detail{color:#536171;font-size:12px;line-height:1.45}
      #items article .price{color:#14234a;font-size:17px;font-weight:900}
      #items article .actions{gap:10px;margin-top:12px}
      #items article .actions button{min-height:36px;padding:8px 11px}
      #items.list{grid-template-columns:1fr!important}
      #items.list>.option-group>.option-group-items{grid-template-columns:1fr!important}
      #items.list article{display:grid!important;grid-template-columns:150px minmax(0,1fr)!important;align-items:start}
      #items.list article .photo{height:140px!important}
      #items.list article .card-body{grid-column:2}
      #items.list article:not(:has(.photo)) .card-body{grid-column:1/-1}
      @media(max-width:900px){
        #items{grid-template-columns:repeat(2,minmax(0,1fr))}
        #items>.option-group>.option-group-items{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      }
      @media(max-width:620px){
        #items{grid-template-columns:1fr}
        #items>.option-group>.option-group-items{grid-template-columns:1fr!important}
        #items>.option-group>summary,
        #items>.option-group>summary.jj-ho-summary{
          align-items:flex-start!important;
          flex-wrap:wrap!important;
        }
        #items>.option-group>summary .jj-ho-summary-title{white-space:normal}
        #items>.option-group>summary .jj-ho-summary-actions{
          width:100%;
          margin-left:22px!important;
          justify-content:space-between;
        }
        #items>.option-group>summary .jj-ho-summary-count{
          white-space:normal;
          line-height:1.25;
        }
        #items.list article{grid-template-columns:90px minmax(0,1fr)!important}
        #items.list article .photo{height:90px!important}
      }
      #selections [aria-label="Selections view"] button,
      #selections .toolbar[role="group"][aria-label="Selections view"] button{min-width:44px;padding:9px 12px;font-size:18px;line-height:1}
      .jj-ho-group-add-option{float:none!important;margin-left:10px;min-height:34px!important;padding:7px 10px!important;border-radius:8px!important;background:#edf0f5!important;color:#14234a!important;font-size:12px!important;font-weight:800!important}
      .option-group>summary.jj-ho-summary{display:flex!important;align-items:center;gap:10px}
      .option-group>summary.jj-ho-summary>.jj-ho-summary-title{min-width:0;flex:1}
      .option-group>summary.jj-ho-summary>.jj-ho-summary-actions{display:flex;align-items:center;gap:8px;margin-left:auto}
      .jj-ho-summary-count{color:#657080;font-size:12px;font-weight:600;white-space:nowrap}
      .jj-group-dialog{width:min(620px,calc(100% - 24px));max-height:88dvh;padding:0;border:0;border-radius:16px;color:#202633;box-shadow:0 24px 70px rgba(12,28,45,.32)}
      .jj-group-dialog::backdrop{background:rgba(7,18,31,.55)}
      .jj-group-head,.jj-group-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;background:#fff;position:sticky;z-index:2}
      .jj-group-head{top:0;border-bottom:1px solid #e3e7ed}.jj-group-foot{bottom:0;border-top:1px solid #e3e7ed;justify-content:flex-end;flex-wrap:wrap}
      .jj-group-head small{display:block;color:#B59A62;font-size:9px;font-weight:900;letter-spacing:.9px}.jj-group-head h3{margin:3px 0 0;color:#14234A}
      .jj-group-icon{width:36px;height:36px;border:1px solid #dce2e9;border-radius:9px;background:#fff;color:#14234A;font-size:22px}
      .jj-group-body{padding:18px;background:#f7f8fa;overflow:auto}
      .jj-group-label{display:block;font-size:12px;font-weight:850;color:#14234A}.jj-group-label input{margin-top:7px}
      .jj-group-help,.jj-group-muted{color:#6d7887;font-size:11px;line-height:1.45}
      .jj-group-choice-list{display:grid;gap:8px}
      .jj-group-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:13px 14px;border:1px solid #dce2e9;border-radius:11px;background:#fff;color:#14234A;text-align:left}
      .jj-group-choice:hover,.jj-group-choice.active{border-color:#B59A62;background:#F7F2E8}.jj-group-choice span{font-weight:850}.jj-group-choice small{color:#6f7a89}
      .jj-group-empty{display:grid;gap:5px;padding:18px;border:1px dashed #cdd5de;border-radius:12px;background:#fff;text-align:center}.jj-group-empty span{color:#6f7a89;font-size:12px}
      .jj-group-row{padding:14px;border:1px solid #dce2e9;border-radius:12px;background:#fff;margin-bottom:10px}.jj-group-row-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.jj-group-row-head strong{display:block;color:#14234A}.jj-group-row-head small{display:block;margin-top:4px;color:#6f7a89}.jj-group-row-head>div:last-child{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .jj-group-row details{margin-top:10px}.jj-group-row summary{cursor:pointer;color:#536171;font-size:11px;font-weight:800}.jj-group-member-list{display:grid;gap:5px;margin-top:8px;padding:9px;border-radius:8px;background:#f6f8fa;color:#405066;font-size:11px}
      @media(max-width:600px){
        .jj-group-row-head{display:grid}
        .jj-group-row-head>div:last-child{justify-content:flex-start}
        .jj-selection-top-actions .btn{flex:1}
        .jj-app-group-controls{display:flex;width:100%;margin-left:0;margin-top:6px}
        .jj-app-group-controls .btn{flex:1!important;min-width:0!important}
        .jj-group-foot .btn{flex:1}
        .selection-option-group-title{align-items:flex-start;flex-wrap:wrap}
        .jj-group-summary-actions{width:100%;justify-content:space-between;margin-left:0}
        .jj-group-add-option{padding:8px 10px}
        .jj-editor-group-actions .btn{flex:1}
        .option-group>summary.jj-ho-summary{flex-wrap:wrap}
        .option-group>summary.jj-ho-summary>.jj-ho-summary-actions{width:100%;justify-content:space-between;margin-left:0}
        .jj-ho-group-add-option{margin-left:0}
      }
    `;
    document.head.appendChild(style);
  }


  function renderExplicitSelectionGroups(filtered,allItems){
    const p=project();
    ensureGroups(p);

    const buckets=new Map();
    filtered.forEach(item=>{
      const grouped=!!item.optionGroupId;
      const key=grouped ? `group:${item.optionGroupId}` : `item:${item.id}`;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(item);
    });

    return [...buckets.values()].map(group=>{
      const first=group[0];
      const firstIndex=allItems.indexOf(first);

      // Standalone products stay as normal cards.
      if(!first.optionGroupId){
        return window.selectionCard(first,firstIndex);
      }

      const registry=(p.selectionGroups||[]).find(g=>String(g.id)===String(first.optionGroupId));
      const title=registry?.name||first.optionGroupTitle||first.title||'Selection Group';
      const count=group.length;

      // A named group always gets a group header, even when it currently
      // contains only one selection. This makes the header the permanent
      // place to add another option.
      return `<details class="selection-option-group" data-selection-group-id="${escLocal(first.optionGroupId)}" open>
        <summary class="selection-option-group-title"
          onclick="if(event.target.closest('button'))return;event.preventDefault();this.parentElement.open=!this.parentElement.open">
          <span class="jj-group-title-text">${escLocal(title)}</span>
          <span class="jj-group-summary-actions">
            <span class="jj-group-summary-count">${count} option${count===1?'':'s'} · tap to compare</span>
            <button type="button" class="jj-group-add-option"
              onclick="event.preventDefault();event.stopPropagation();addSelectionOption(${firstIndex})">
              + Add Another Option
            </button>
          </span>
        </summary>
        <div class="selection-option-grid">
          ${group.map(item=>window.selectionCard(item,allItems.indexOf(item))).join('')}
        </div>
      </details>`;
    }).join('');
  }

  function setAllSelectionGroups(open){
    document.querySelectorAll('#selections details.selection-option-group').forEach(details=>{
      details.open=!!open;
    });
  }

  function configureEditorGroupDropdown(){
    const select=document.getElementById('selectionEditGroup');
    if(!select)return;

    const p=project();
    const groups=ensureGroups(p);
    const current=String(select.value||'');
    const field=select.closest('.selection-field')||select.parentElement;
    const label=field?.querySelector('label');

    if(field)field.style.display='';
    if(label)label.textContent='Selection Group';

    const rebuild=(preferred=current)=>{
      const liveGroups=ensureGroups(p);
      select.innerHTML=
        `<option value="">No group / Standalone</option>`+
        liveGroups.map(group=>{
          const count=(p.selections||[]).filter(item=>String(item.optionGroupId||'')===String(group.id)).length;
          return `<option value="${escLocal(group.id)}">${escLocal(group.name)} · ${count} selection${count===1?'':'s'}</option>`;
        }).join('');
      if(liveGroups.some(group=>String(group.id)===String(preferred)))select.value=String(preferred);
      else select.value='';
    };
    rebuild(current);

    // The original app saves optionGroupTitle from this input. Keep it as a
    // hidden backing field and automatically sync it to the selected group.
    const nameInput=document.getElementById('selectionEditGroupName');
    if(nameInput){
      nameInput.type='hidden';
      nameInput.style.display='none';
    }

    const syncGroupName=()=>{
      const group=ensureGroups(p).find(g=>String(g.id)===String(select.value));
      if(nameInput)nameInput.value=group?.name||'';
      const del=document.getElementById('jjEditorDeleteGroup');
      if(del)del.disabled=!group;
    };
    syncGroupName();
    select.addEventListener('change',syncGroupName);

    if(field && !field.querySelector('.jj-editor-group-actions')){
      const actions=document.createElement('div');
      actions.className='jj-editor-group-actions';
      actions.innerHTML=`
        <button type="button" class="btn btn-light" id="jjEditorCreateGroup">+ Create Group</button>
        <button type="button" class="btn btn-danger" id="jjEditorDeleteGroup">Delete Group</button>`;
      field.appendChild(actions);

      actions.querySelector('#jjEditorCreateGroup').addEventListener('click',()=>{
        const name=prompt('New selection group name');
        if(name===null)return;
        const clean=name.trim();
        if(!clean)return;
        const liveGroups=ensureGroups(p);
        const existing=liveGroups.find(g=>g.name.trim().toLowerCase()===clean.toLowerCase());
        if(existing){
          rebuild(existing.id);
          syncGroupName();
          window.toast?.('That group already exists');
          return;
        }
        const group={id:makeGroupId(),name:clean};
        liveGroups.push(group);
        rebuild(group.id);
        syncGroupName();
        window.toast?.(`Group "${clean}" added`);
      });

      actions.querySelector('#jjEditorDeleteGroup').addEventListener('click',()=>{
        const group=ensureGroups(p).find(g=>String(g.id)===String(select.value));
        if(!group)return;
        const members=(p.selections||[]).filter(item=>String(item.optionGroupId||'')===String(group.id));
        if(!confirm(`Delete the group "${group.name}"? ${members.length} selection${members.length===1?'':'s'} will stay in the job and become standalone.`))return;

        p.selectionGroups=ensureGroups(p).filter(g=>String(g.id)!==String(group.id));
        members.forEach(item=>{
          delete item.optionGroupId;
          delete item.optionGroupTitle;
          delete item.optionLabel;
        });

        rebuild('');
        syncGroupName();
        try{window.saveState?.(false);}catch{}
        window.toast?.('Group deleted — selections were kept');
      });
    }

    syncGroupName();
  }

  function enhanceRenderedSelections(){
    const root=document.getElementById('selections');
    if(!root)return;
    const p=project();
    ensureGroups(p);

    const heading=root.querySelector('.selection-heading');

    // Remove stale selection-group controls from older builds.
    root.querySelectorAll('#jjAppViewAll,#jjAppShowGroups').forEach(btn=>btn.remove());
    if(heading && !root.querySelector('.jj-selection-top-actions')){
      const actions=document.createElement('div');
      actions.className='jj-selection-top-actions';
      actions.innerHTML=`
        <button class="btn btn-gold" type="button" onclick="openSelectionEditor()">+ Add Selection</button>
        <button class="btn btn-light" type="button" onclick="window.JJSelectionGroups.create()">Create Group</button>
        <button class="btn btn-light" type="button" onclick="window.JJSelectionGroups.manage()">Manage Groups</button>`;
      heading.insertAdjacentElement('afterend',actions);
    }

    // Hide the duplicate old "Add manually" button now that Add Selection
    // is prominent near the top.
    root.querySelectorAll('.selection-toolbar button').forEach(btn=>{
      if(/add manually/i.test(btn.textContent||''))btn.style.display='none';
    });

    // "Add Another Option" belongs in the group header now, not on each card.
    root.querySelectorAll('.selection-card-actions button').forEach(btn=>{
      if(/another option/i.test(btn.textContent||''))btn.remove();
    });

    // Group badge on every assigned card.
    root.querySelectorAll('.selection-card').forEach(card=>{
      const titleNode=card.querySelector('h3');
      if(!titleNode)return;
      const title=(titleNode.textContent||'').trim();
      const item=(p?.selections||[]).find(x=>String(x.title||'').trim()===title);
      if(!item?.optionGroupId || card.querySelector('.jj-selection-group-badge'))return;
      const group=(p.selectionGroups||[]).find(g=>String(g.id)===String(item.optionGroupId));
      const name=group?.name||item.optionGroupTitle;
      if(!name)return;
      const badge=document.createElement('div');
      badge.className='jj-selection-group-badge';
      badge.textContent=`Group: ${name}`;
      titleNode.insertAdjacentElement('afterend',badge);
    });

    // Use compact symbols for Card / List view on the contractor app.
    const viewHost=root.querySelector('.toolbar[role="group"][aria-label="Selections view"], [role="group"][aria-label="Selections view"]');
    if(viewHost && !root.querySelector('.jj-app-group-controls')){
      const controls=document.createElement('span');
      controls.className='jj-app-group-controls';
      controls.innerHTML=`
        <button type="button" class="btn btn-light" data-jj-app-expand>Expand All</button>
        <button type="button" class="btn btn-light" data-jj-app-collapse>Collapse All</button>`;
      viewHost.appendChild(controls);

      controls.querySelector('[data-jj-app-expand]').addEventListener('click',()=>{
        setAllSelectionGroups(true);
      });
      controls.querySelector('[data-jj-app-collapse]').addEventListener('click',()=>{
        setAllSelectionGroups(false);
      });
    }

    const viewButtons=[...root.querySelectorAll('[aria-label="Selections view"] button, .toolbar[role="group"][aria-label="Selections view"] button')];
    viewButtons.forEach((btn,idx)=>{
      const txt=(btn.textContent||'').trim().toLowerCase();
      const label=(btn.getAttribute('aria-label')||'').toLowerCase();
      const isCard=txt.includes('card')||label.includes('card')||idx===0;
      const isList=txt.includes('list')||label.includes('list')||idx===1;
      if(isCard){
        btn.textContent='▦';
        btn.title='Card view';
        btn.setAttribute('aria-label','Card view');
      }else if(isList){
        btn.textContent='☰';
        btn.title='List view';
        btn.setAttribute('aria-label','List view');
      }
    });

  }

  function configureEditorAfterOpen(){
    setTimeout(configureEditorGroupDropdown,0);
  }


  function homeownerItemsSafe(){
    try{return Array.isArray(items)?items:[];}catch{return [];}
  }

  const homeownerGroupOpenState=new Map();
  let homeownerMassToggle=false;
  let homeownerEnhancing=false;

  function homeownerItemsSafe(){
    try{return Array.isArray(items)?items:[];}catch{return [];}
  }

  function homeownerGroupKey(details){
    if(!details)return '';
    if(details.dataset.jjGroup)return String(details.dataset.jjGroup);

    const optionNode=details.querySelector('[data-option]');
    const optionId=optionNode?.dataset?.option;
    if(optionId){
      const row=homeownerItemsSafe().find(item=>String(item.id)===String(optionId));
      if(row?.optionGroupId){
        details.dataset.jjGroup=String(row.optionGroupId);
        return String(row.optionGroupId);
      }
    }

    const title=(details.querySelector('.jj-ho-summary-title')?.textContent
      || details.querySelector('summary')?.textContent || '').replace(/\s+/g,' ').trim();
    return title;
  }

  function homeownerGroupsExpanded(){
    const groups=[...document.querySelectorAll('#items details.option-group')];
    return !!groups.length && groups.every(details=>details.open);
  }

  function updateHomeownerGroupToggle(){
    const button=document.getElementById('jjHOGroupToggle');
    if(!button)return;
    const expanded=homeownerGroupsExpanded();
    button.textContent=expanded?'Show Groups':'View All';
    button.setAttribute('aria-pressed',String(expanded));
    button.title=expanded?'Collapse all selection groups':'Expand all selection groups';
  }

  function homeownerGroupMode(open){
    const groups=[...document.querySelectorAll('#items details.option-group')];
    homeownerMassToggle=true;
    groups.forEach(details=>{
      const key=homeownerGroupKey(details);
      details.open=!!open;
      if(key)homeownerGroupOpenState.set(key,!!open);
    });
    homeownerMassToggle=false;
    updateHomeownerGroupToggle();
  }

  function toggleHomeownerGroups(){
    homeownerGroupMode(!homeownerGroupsExpanded());
  }

  function restoreHomeownerGroupState(){
    document.querySelectorAll('#items details.option-group').forEach(details=>{
      const key=homeownerGroupKey(details);
      if(!key)return;

      // If this group has a remembered state, restore only THAT group.
      // Otherwise leave the original renderer's default state alone.
      if(homeownerGroupOpenState.has(key)){
        details.open=homeownerGroupOpenState.get(key);
      }
    });
  }

  function bindHomeownerIndividualGroupToggles(){
    document.querySelectorAll('#items details.option-group').forEach(details=>{
      if(details.dataset.jjToggleBound==='1')return;
      details.dataset.jjToggleBound='1';

      // Give every native multi-option group a stable group id before the
      // card-level option button is removed.
      homeownerGroupKey(details);

      details.addEventListener('toggle',()=>{
        if(homeownerMassToggle||homeownerEnhancing)return;
        const key=homeownerGroupKey(details);
        if(key)homeownerGroupOpenState.set(key,!!details.open);
        updateHomeownerGroupToggle();
      });
    });
  }

  function enhanceHomeownerGroups(){
    const itemsRoot=document.getElementById('items');
    if(!itemsRoot || homeownerEnhancing)return;
    homeownerEnhancing=true;

    try{
      const viewActions=document.querySelector('.actions[aria-label="Selections view"]');

      // Remove any old two-button versions.
      document.querySelectorAll('#jjHOViewAll,#jjHOShowGroups').forEach(node=>node.remove());

      if(viewActions && !document.getElementById('jjHOGroupToolbar')){
        const toolbar=document.createElement('div');
        toolbar.id='jjHOGroupToolbar';
        toolbar.className='jj-ho-group-toolbar';
        toolbar.setAttribute('aria-label','Selection groups');
        toolbar.innerHTML=`
          <button type="button" id="jjHOGroupToggle" class="secondary" aria-pressed="true">Show Groups</button>`;
        viewActions.insertAdjacentElement('afterend',toolbar);
        toolbar.querySelector('#jjHOGroupToggle').addEventListener('click',toggleHomeownerGroups);
      }

      const hoItems=homeownerItemsSafe();

      // Count products by explicit group.
      const counts=new Map();
      hoItems.forEach(item=>{
        if(item?.optionGroupId){
          const id=String(item.optionGroupId);
          counts.set(id,(counts.get(id)||0)+1);
        }
      });

      // The original homeowner renderer makes a 1-item group look standalone.
      // Wrap it so it still has a group header and independent open state.
      [...itemsRoot.querySelectorAll(':scope > article')].forEach(article=>{
        const opt=article.querySelector('[data-option]');
        if(!opt)return;
        const item=hoItems.find(row=>String(row.id)===String(opt.dataset.option));
        if(!item?.optionGroupId)return;

        const id=String(item.optionGroupId);
        const details=document.createElement('details');
        details.className='option-group';
        details.dataset.jjGroup=id;
        details.innerHTML=`
          <summary>
            ${escLocal(item.optionGroupTitle||item.title||'Selection Group')}
            <span>${counts.get(id)||1} option${(counts.get(id)||1)===1?'':'s'} · tap to compare</span>
          </summary>
          <div class="option-group-items"></div>`;
        article.replaceWith(details);
        details.querySelector('.option-group-items').appendChild(article);
      });

      // Stabilize native multi-item groups before removing their card button.
      itemsRoot.querySelectorAll('details.option-group').forEach(details=>{
        homeownerGroupKey(details);
      });

      // Put Add Option in the group header, never on an individual card.
      itemsRoot.querySelectorAll('details.option-group').forEach(details=>{
        const summary=details.querySelector(':scope > summary');
        const optionButton=details.querySelector('.option-group-items [data-option]');
        if(!summary || !optionButton)return;

        const optionId=optionButton.dataset.option;
        details.querySelectorAll('.option-group-items [data-option]').forEach(btn=>btn.remove());

        if(!summary.querySelector('.jj-ho-group-add-option')){
          const existingSpan=summary.querySelector('span');
          const oldCount=existingSpan?.textContent?.trim()||'';
          if(existingSpan)existingSpan.remove();
          const oldText=(summary.textContent||'Selection Group').replace(/\s+/g,' ').trim();
          summary.textContent='';
          summary.classList.add('jj-ho-summary');

          const title=document.createElement('span');
          title.className='jj-ho-summary-title';
          title.textContent=oldText;

          const actions=document.createElement('span');
          actions.className='jj-ho-summary-actions';

          const count=document.createElement('span');
          count.className='jj-ho-summary-count';
          count.textContent=oldCount;

          const add=document.createElement('button');
          add.type='button';
          add.className='jj-ho-group-add-option secondary';
          add.dataset.option=optionId;
          add.textContent='+ Add Option';

          actions.append(count,add);
          summary.append(title,actions);
        }
      });

      itemsRoot.querySelectorAll(':scope > article [data-option]').forEach(btn=>btn.remove());

      // Symbols for Card / List view.
      const card=document.getElementById('cardView');
      const list=document.getElementById('listView');
      if(card){
        card.textContent='▦';
        card.title='Card view';
        card.setAttribute('aria-label','Card view');
        card.style.fontSize='19px';
        card.style.width='44px';
        card.style.padding='10px';
      }
      if(list){
        list.textContent='☰';
        list.title='List view';
        list.setAttribute('aria-label','List view');
        list.style.fontSize='19px';
        list.style.width='44px';
        list.style.padding='10px';
      }

      // Restore each group individually. This is the key fix: the map is NOT
      // overwritten by freshly rendered groups that start closed.
      restoreHomeownerGroupState();
      bindHomeownerIndividualGroupToggles();
      updateHomeownerGroupToggle();
    } finally {
      homeownerEnhancing=false;
    }
  }

  function installHomeownerEnhancements(){
    homeownerEnhancing=false;
    const itemsRoot=document.getElementById('items');
    if(!itemsRoot || document.body.dataset.jjHoGroupsInstalled==='1')return false;
    document.body.dataset.jjHoGroupsInstalled='1';

    // Hook the homeowner's real render() function instead of watching every
    // DOM mutation. Native <details> open/close actions no longer trigger a
    // re-enhancement, so closing one group cannot collapse the others.
    if(typeof window.render==='function'){
      const originalRender=window.render;
      window.render=function(...args){
        const result=originalRender.apply(this,args);
        setTimeout(enhanceHomeownerGroups,0);
        return result;
      };
    }

    setTimeout(enhanceHomeownerGroups,0);
    return true;
  }

  function install(){
    if(window.__jjSelectionGroupsInstalled)return;
    window.__jjSelectionGroupsInstalled=true;
    injectStyles();

    // Homeowner portal: enhance its existing cards/groups without changing
    // authentication or the portal database contract.
    if(installHomeownerEnhancements())return;

    if(typeof window.renderSelections!=='function' || typeof window.selectedProject!=='function')return;

    const oldRender=window.renderSelections;
    const oldOpenEditor=window.openSelectionEditor;
    const oldOpenFromLink=window.openSelectionEditorFromLink;

    // Keep one clear "Add to Group / Change Group" action on each card.
    window.selectionGroupSelect=(item,index)=>groupControlHTML(item,index);

    // Named groups now always render with a header, even with only one item.
    window.renderSelectionOptionGroups=renderExplicitSelectionGroups;

    window.renderSelections=function(){
      ensureGroups(project());
      oldRender();
      enhanceRenderedSelections();
    };

    if(typeof oldOpenEditor==='function'){
      window.openSelectionEditor=function(...args){
        const result=oldOpenEditor.apply(this,args);
        configureEditorAfterOpen();
        return result;
      };
    }

    if(typeof oldOpenFromLink==='function'){
      window.openSelectionEditorFromLink=function(...args){
        const result=oldOpenFromLink.apply(this,args);
        configureEditorAfterOpen();
        return result;
      };
    }

    // Migrate existing linked selections into the explicit registry and redraw.
    ensureGroups(project());
    try{window.saveState?.(false);}catch{}
    try{window.renderSelections();}catch{}
  }

  window.JJSelectionGroups={
    install,
    create:()=>openCreateGroup(null),
    manage:openGroupManager,
    openAssign:openAssignDialog,
    assign:assignToGroup,
    remove:removeFromGroup,
    ensure:ensureGroups,
    expandAll:()=>setAllSelectionGroups(true),
    collapseAll:()=>setAllSelectionGroups(false)
  };
  window.expandAllSelectionGroups=()=>setAllSelectionGroups(true);
  window.collapseAllSelectionGroups=()=>setAllSelectionGroups(false);

  if(document.readyState==='complete')setTimeout(install,0);
  else window.addEventListener('load',install,{once:true});
})();


/* -------------------------------------------------------------------------
   J&J Selection Data Safety v73
   Emergency protection against homeowner portal sync replacing the whole app
   state with an older/incomplete snapshot.

   Key rule:
   - Homeowner sync may ADD missing selections.
   - It may fill blank fields.
   - It NEVER deletes an app selection.
   - It NEVER replaces the entire app state.
   ------------------------------------------------------------------------- */
(() => {
  if (window.__jjSelectionDataSafetyV73) return;
  window.__jjSelectionDataSafetyV73 = true;

  let safeRpc = null;
  let safeSyncBusy = false;
  let rpcPatched = false;

  const clone = value => {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  };

  function currentState(){
    try { return state; } catch { return null; }
  }

  function saveRecoverySnapshot(reason='before-sync'){
    const s=currentState();
    if(!s?.projects) return;

    try{
      // Keep a lightweight recovery copy so product names/links/groups survive
      // even when photos are large base64 strings.
      const snapshot={
        at:new Date().toISOString(),
        reason,
        selectedProjectId:s.selectedProjectId,
        projects:s.projects.map(p=>({
          id:p.id,
          name:p.name,
          jobNo:p.jobNo,
          selectionRooms:clone(p.selectionRooms||[]),
          selectionGroups:clone(p.selectionGroups||[]),
          selections:(p.selections||[]).map(item=>({
            ...clone(item),
            image:typeof item.image==='string' && item.image.startsWith('data:image/')
              ? ''
              : item.image
          }))
        }))
      };

      const key='jj_selection_recovery_history_v73';
      let history=[];
      try{ history=JSON.parse(localStorage.getItem(key)||'[]'); }catch{}
      history.unshift(snapshot);
      history=history.slice(0,3);
      localStorage.setItem(key,JSON.stringify(history));
    }catch(err){
      console.warn('Selection recovery snapshot could not be saved:',err);
    }
  }

  function projectMatch(localProjects,remoteProject){
    return localProjects.find(p=>String(p.id)===String(remoteProject.id))
      || localProjects.find(p=>remoteProject.jobNo && p.jobNo===remoteProject.jobNo)
      || localProjects.find(p=>remoteProject.name && p.name===remoteProject.name);
  }

  function meaningful(value){
    return value !== undefined && value !== null && value !== '';
  }

  function mergeOneSelection(localItem,remoteItem){
    // Local/app record wins by default. Only fill information that is missing
    // locally. This prevents older homeowner snapshots from rolling products
    // backward while still allowing recovery of incomplete records.
    const merged={...localItem};

    const fillIfBlank=[
      'url','title','vendor','category','room','quality','model','image',
      'unitPrice','quantity','purchasedBy','optionGroupId','optionGroupTitle',
      'optionLabel','description','notes','leadTimeValue','leadTimeUnit'
    ];

    fillIfBlank.forEach(key=>{
      if(!meaningful(merged[key]) && meaningful(remoteItem[key])){
        merged[key]=clone(remoteItem[key]);
      }
    });

    // Homeowner may positively select something. Accept that positive action,
    // but never downgrade Ordered/Received/Approved or delete the local record.
    if(remoteItem.homeownerSelected===true){
      merged.homeownerSelected=true;
      if(remoteItem.homeownerSelectedAt) merged.homeownerSelectedAt=remoteItem.homeownerSelectedAt;
      if((merged.status||'Pending')==='Pending') merged.status='Selected';
    }

    if(remoteItem.inStock===true && !merged.inStock) merged.inStock=true;

    return merged;
  }

  function safeMergeRemoteState(remoteState,source='homeowner'){
    const s=currentState();
    if(!s?.projects || !remoteState?.projects) return {added:0,filled:0};

    saveRecoverySnapshot('before-'+source);

    let added=0;
    let filled=0;

    remoteState.projects.forEach(remoteProject=>{
      const localProject=projectMatch(s.projects,remoteProject);
      if(!localProject) return;

      if(!Array.isArray(localProject.selections)) localProject.selections=[];
      if(!Array.isArray(localProject.selectionRooms)) localProject.selectionRooms=[];
      if(!Array.isArray(localProject.selectionGroups)) localProject.selectionGroups=[];

      // Never remove rooms/groups from the app. Union only.
      for(const room of remoteProject.selectionRooms||[]){
        if(room && !localProject.selectionRooms.includes(room)){
          localProject.selectionRooms.push(room);
        }
      }

      const localGroups=new Map(localProject.selectionGroups.map(g=>[String(g.id),g]));
      for(const group of remoteProject.selectionGroups||[]){
        if(!group?.id) continue;
        if(!localGroups.has(String(group.id))){
          localProject.selectionGroups.push(clone(group));
          localGroups.set(String(group.id),group);
        }
      }

      const byId=new Map(
        localProject.selections
          .filter(item=>item?.id!==undefined && item?.id!==null)
          .map(item=>[String(item.id),item])
      );

      for(const remoteItem of remoteProject.selections||[]){
        if(!remoteItem) continue;
        const key=remoteItem.id!==undefined && remoteItem.id!==null
          ? String(remoteItem.id)
          : '';

        if(key && byId.has(key)){
          const localItem=byId.get(key);
          const before=JSON.stringify(localItem);
          const merged=mergeOneSelection(localItem,remoteItem);
          Object.assign(localItem,merged);
          if(JSON.stringify(localItem)!==before) filled++;
          continue;
        }

        // If an older portal record lacks a stable id, avoid duplicate recovery
        // by checking a product fingerprint first.
        const fingerprint = x => [
          String(x.title||'').trim().toLowerCase(),
          String(x.url||'').trim().toLowerCase(),
          String(x.model||'').trim().toLowerCase(),
          String(x.room||'').trim().toLowerCase()
        ].join('|');

        const fp=fingerprint(remoteItem);
        const existing=localProject.selections.find(item=>fingerprint(item)===fp && fp!=='|||');
        if(existing){
          const before=JSON.stringify(existing);
          Object.assign(existing,mergeOneSelection(existing,remoteItem));
          if(JSON.stringify(existing)!==before) filled++;
        }else{
          localProject.selections.push(clone(remoteItem));
          added++;
        }
      }
    });

    // Persist the merged/union state. This intentionally pushes the union back
    // to cloud so an incomplete portal copy cannot remain authoritative.
    try{
      localStorage.setItem('jj_full_proto',JSON.stringify(s));
      if(typeof saveState==='function') saveState(false);
      if(typeof renderAll==='function') renderAll();
    }catch(err){
      console.error('Safe selection merge save failed:',err);
    }

    return {added,filled};
  }

  async function safeManualSync(){
    if(safeSyncBusy) return;
    if(!safeRpc){
      try{ toast('Cloud is still connecting'); }catch{}
      return;
    }

    let project=null;
    try{ project=selectedProject(); }catch{}
    if(!project) return;

    safeSyncBusy=true;
    try{
      const {data,error}=await safeRpc('jj_portal_sync',{p_job:String(project.id)});
      if(error) throw error;
      if(!data){
        try{ toast('No new homeowner updates'); }catch{}
        return;
      }

      const result=safeMergeRemoteState(data,'manual-homeowner-sync');
      try{
        toast(result.added
          ? `Recovered ${result.added} missing selection${result.added===1?'':'s'}`
          : 'Homeowner updates merged safely');
      }catch{}
    }catch(err){
      console.error('Safe homeowner sync error:',err);
      try{ toast('Homeowner sync unavailable'); }catch{}
    }finally{
      safeSyncBusy=false;
    }
  }

  async function safeAutoSync(){
    if(safeSyncBusy || document.hidden || !safeRpc) return;

    // Avoid changing state while the user is editing.
    if(document.querySelector('.selection-modal-backdrop.open')
      || document.querySelector('dialog[open]')
      || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
      return;
    }

    safeSyncBusy=true;
    try{
      const {data,error}=await safeRpc('jj_portal_sync_pending');
      if(!error && data){
        safeMergeRemoteState(data,'auto-homeowner-sync');
      }
    }catch(err){
      console.warn('Safe auto homeowner sync:',err);
    }finally{
      safeSyncBusy=false;
    }
  }

  function installRpcGuard(){
    let client=null;
    try{ client=cloudClient; }catch{}
    if(!client?.rpc || rpcPatched) return false;

    rpcPatched=true;
    safeRpc=client.rpc.bind(client);

    // The original app created an 8-second interval using the old destructive
    // autoSyncHomeownerSelections function. We cannot recover that interval id,
    // so guard the RPC it uses. Returning null prevents that old callback from
    // replacing the entire app state.
    client.rpc=function(functionName,args,options){
      if(functionName==='jj_portal_sync_pending' && !window.__jjSafePortalRpcPass){
        return Promise.resolve({data:null,error:null});
      }
      return safeRpc(functionName,args,options);
    };

    // Replace the manual Refresh Homeowner Updates action with safe union merge.
    window.syncHomeownerSelections=safeManualSync;

    // Our safe interval performs union-only recovery.
    setInterval(safeAutoSync,8000);

    console.info('J&J selection data safety v73 active');
    return true;
  }

  // cloudClient is initialized asynchronously after this shared file loads.
  const installer=setInterval(()=>{
    if(installRpcGuard()){
      clearInterval(installer);
      // Run a safe recovery pass once after cloud is connected.
      setTimeout(safeAutoSync,1200);
    }
  },500);

  // Public emergency helper for console/debug use.
  window.JJSelectionRecovery={
    syncNow:safeManualSync,
    merge:safeMergeRemoteState,
    snapshot:()=>saveRecoverySnapshot('manual')
  };
})();

