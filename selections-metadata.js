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


/* -------------------------------------------------------------------------
   J&J Selection Disclosure Controls v75
   Interaction-only fix.
   - Does NOT add/delete/change selection records.
   - Does NOT change homeowner sync or recovery logic.
   - Uses capture-phase click handling so older button listeners cannot
     double-toggle the disclosure groups.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjDisclosureControlsV75) return;
  window.__jjDisclosureControlsV75 = true;

  function appGroupDetails(){
    const root=document.getElementById('selections');
    if(!root) return [];
    let groups=[...root.querySelectorAll('.selection-grid details.selection-option-group')];
    if(!groups.length){
      groups=[...root.querySelectorAll('.selection-grid details.option-group')];
    }
    return groups;
  }

  function setAppGroups(open){
    appGroupDetails().forEach(details=>{
      details.open=!!open;
      if(open) details.setAttribute('open','');
      else details.removeAttribute('open');
    });
  }

  function ensureAppControls(){
    const root=document.getElementById('selections');
    if(!root) return;

    // Remove the older injected control strip. Its button listeners were the
    // unreliable part; the v75 strip lives outside the Card/List role group.
    root.querySelectorAll('.jj-app-group-controls').forEach(node=>node.remove());

    const view=root.querySelector('.toolbar[role="group"][aria-label="Selections view"]');
    if(!view) return;

    let controls=root.querySelector('#jjAppDisclosureControlsV75');
    if(!controls){
      controls=document.createElement('div');
      controls.id='jjAppDisclosureControlsV75';
      controls.className='toolbar';
      controls.setAttribute('aria-label','Selection group controls');
      controls.style.margin='-6px 0 14px';
      controls.innerHTML=`
        <button type="button" class="btn btn-light" id="jjAppExpandAllV75">Expand All</button>
        <button type="button" class="btn btn-light" id="jjAppCollapseAllV75">Collapse All</button>`;
      view.insertAdjacentElement('afterend',controls);
    }

    const hasGroups=appGroupDetails().length>0;
    controls.querySelectorAll('button').forEach(btn=>btn.disabled=!hasGroups);
  }

  function hoGroupDetails(){
    return [...document.querySelectorAll('#items details.option-group')];
  }

  function hoAllOpen(){
    const groups=hoGroupDetails();
    return groups.length>0 && groups.every(details=>details.open);
  }

  function updateHOControl(){
    const button=document.getElementById('jjHOGroupToggle');
    if(!button) return;
    const groups=hoGroupDetails();

    button.disabled=!groups.length;
    button.textContent=hoAllOpen()?'Show Groups':'View All';
    button.title=hoAllOpen()?'Collapse all selection groups':'Expand all selection groups';
    button.setAttribute('aria-pressed',String(hoAllOpen()));
  }

  function setHOGroups(open){
    hoGroupDetails().forEach(details=>{
      details.open=!!open;
      if(open) details.setAttribute('open','');
      else details.removeAttribute('open');
    });
    updateHOControl();
  }

  function bindHOToggleLabels(){
    hoGroupDetails().forEach(details=>{
      if(details.dataset.jjV75ToggleBound==='1') return;
      details.dataset.jjV75ToggleBound='1';

      // This only updates the View All / Show Groups wording.
      // It never opens or closes any other group.
      details.addEventListener('toggle',()=>{
        setTimeout(updateHOControl,0);
      });
    });
  }

  function ensureHOControls(){
    const items=document.getElementById('items');
    const view=document.querySelector('.actions[role="group"][aria-label="Selections view"], .actions[aria-label="Selections view"]');
    if(!items || !view) return;

    // Reuse the existing toolbar when present so the layout remains familiar.
    let toolbar=document.getElementById('jjHOGroupToolbar');
    if(!toolbar){
      toolbar=document.createElement('div');
      toolbar.id='jjHOGroupToolbar';
      toolbar.className='jj-ho-group-toolbar';
      toolbar.setAttribute('aria-label','Selection groups');
      view.insertAdjacentElement('afterend',toolbar);
    }

    let button=document.getElementById('jjHOGroupToggle');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.id='jjHOGroupToggle';
      button.className='secondary';
      toolbar.replaceChildren(button);
    }else if(button.parentElement!==toolbar){
      toolbar.replaceChildren(button);
    }

    bindHOToggleLabels();
    updateHOControl();
  }

  // Capture phase is intentional. It prevents old injected listeners from
  // firing after this handler and reversing the requested action.
  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('button');
    if(!target) return;

    if(target.id==='jjAppExpandAllV75'){
      event.preventDefault();
      event.stopImmediatePropagation();
      setAppGroups(true);
      return;
    }

    if(target.id==='jjAppCollapseAllV75'){
      event.preventDefault();
      event.stopImmediatePropagation();
      setAppGroups(false);
      return;
    }

    if(target.id==='jjHOGroupToggle'){
      event.preventDefault();
      event.stopImmediatePropagation();
      const groups=hoGroupDetails();
      if(!groups.length) return;
      setHOGroups(!groups.every(details=>details.open));
    }
  },true);

  function refreshControls(){
    ensureAppControls();
    ensureHOControls();
  }

  function boot(){
    refreshControls();

    const appRoot=document.getElementById('selections');
    if(appRoot && !window.__jjV75AppObserver){
      const observer=new MutationObserver(()=>setTimeout(ensureAppControls,0));
      observer.observe(appRoot,{childList:true,subtree:true});
      window.__jjV75AppObserver=observer;
    }

    const hoRoot=document.getElementById('items');
    if(hoRoot && !window.__jjV75HOObserver){
      // Only watch content changes. Native <details> open/close does not
      // replace children, so an individual group remains independent.
      const observer=new MutationObserver(()=>setTimeout(ensureHOControls,0));
      observer.observe(hoRoot,{childList:true,subtree:false});
      window.__jjV75HOObserver=observer;
    }

    // Fallback for pages whose selection content arrives after window load.
    if(!window.__jjV75DisclosureTimer){
      window.__jjV75DisclosureTimer=setInterval(()=>{
        if(!document.hidden) refreshControls();
      },1000);
    }
  }

  if(document.readyState==='complete') setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();


/* -------------------------------------------------------------------------
   J&J Selections PDF Import + clearer group headers v76
   - Reads prior J&J selection PDFs locally in the browser.
   - Creates NEW selection records only after review.
   - Never deletes or replaces existing selections.
   - Keeps raw PDF bytes out of shared app_state to avoid sync/storage bloat.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjSelectionPdfImportV76) return;
  window.__jjSelectionPdfImportV76 = true;

  const STYLE_ID='jj-selection-pdf-import-v76';
  const PDFJS_SRC='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function injectV76Styles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* Make group title lines easier to scan */
      #selections details.selection-option-group{
        border:1px solid #D9E0E8!important;
        border-radius:13px!important;
        overflow:hidden!important;
        background:#fff!important;
        box-shadow:0 3px 10px rgba(20,35,74,.055)!important;
        margin-bottom:13px!important;
      }
      #selections .selection-option-group-title{
        min-height:58px!important;
        padding:13px 15px!important;
        border-left:5px solid #B59A62!important;
        background:linear-gradient(90deg,#F8F3E9 0,#FFFFFF 42%)!important;
        color:#14234A!important;
        box-shadow:inset 0 -1px 0 #E5E9EE!important;
      }
      #selections .selection-option-group-title>.jj-group-title-text,
      #selections .selection-option-group-title>span:first-child{
        font-size:14px!important;
        font-weight:950!important;
        letter-spacing:.32px!important;
        text-transform:uppercase!important;
        color:#14234A!important;
      }
      #selections .jj-group-summary-count{
        color:#536174!important;
        font-size:11px!important;
        font-weight:800!important;
      }

      #items>.option-group{
        border-color:#D9E0E8!important;
        box-shadow:0 3px 10px rgba(20,35,74,.055)!important;
      }
      #items>.option-group>summary,
      #items>.option-group>summary.jj-ho-summary{
        border-left:5px solid #B59A62!important;
        background:linear-gradient(90deg,#F8F3E9 0,#FFFFFF 42%)!important;
        box-shadow:inset 0 -1px 0 #E5E9EE!important;
      }
      #items>.option-group>summary .jj-ho-summary-title{
        font-size:13px!important;
        font-weight:950!important;
        letter-spacing:.35px!important;
        color:#14234A!important;
      }

      .jj-pdf-import-dialog{
        width:min(980px,calc(100% - 24px));
        max-height:90dvh;
        border:0;
        border-radius:16px;
        padding:0;
        color:#202633;
        box-shadow:0 24px 70px rgba(12,28,45,.34);
      }
      .jj-pdf-import-dialog::backdrop{background:rgba(7,18,31,.58)}
      .jj-pdf-import-head,.jj-pdf-import-foot{
        position:sticky;z-index:3;display:flex;align-items:center;justify-content:space-between;
        gap:12px;padding:16px 18px;background:#fff;
      }
      .jj-pdf-import-head{top:0;border-bottom:1px solid #E2E6EC}
      .jj-pdf-import-foot{bottom:0;border-top:1px solid #E2E6EC;justify-content:flex-end;flex-wrap:wrap}
      .jj-pdf-import-head h3{margin:2px 0 0;color:#14234A}
      .jj-pdf-import-head small{color:#B59A62;font-size:9px;font-weight:950;letter-spacing:.9px}
      .jj-pdf-import-body{padding:16px;background:#F6F8FA;overflow:auto}
      .jj-pdf-import-summary{
        display:flex;gap:10px;flex-wrap:wrap;align-items:center;
        margin-bottom:12px;padding:11px 13px;border:1px solid #DCE2E9;border-radius:11px;background:#fff;
        color:#526174;font-size:12px;
      }
      .jj-pdf-import-summary b{color:#14234A}
      .jj-pdf-import-list{display:grid;gap:10px}
      .jj-pdf-row{
        display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;
        padding:13px;border:1px solid #DCE2E9;border-radius:12px;background:#fff;
      }
      .jj-pdf-row.duplicate{opacity:.64;background:#FAFAFA}
      .jj-pdf-row-check{padding-top:4px}
      .jj-pdf-row-check input{width:18px;height:18px}
      .jj-pdf-row-main{min-width:0}
      .jj-pdf-row-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}
      .jj-pdf-row-title strong{color:#14234A;font-size:13px}
      .jj-pdf-chip{
        display:inline-flex;padding:4px 7px;border-radius:999px;background:#EEF3F7;
        color:#536174;font-size:9px;font-weight:850;
      }
      .jj-pdf-chip.warn{background:#FFF1D9;color:#865E0A}
      .jj-pdf-row-grid{
        display:grid;grid-template-columns:1.35fr .8fr .9fr .85fr;gap:8px;
      }
      .jj-pdf-row-grid label{font-size:9px;font-weight:850;color:#667386;text-transform:uppercase;letter-spacing:.4px}
      .jj-pdf-row-grid input,.jj-pdf-row-grid select{
        width:100%;margin:4px 0 0;padding:8px 9px;border:1px solid #C9D1DB;border-radius:7px;
        background:#fff;color:#202633;font-size:11px;text-transform:none;letter-spacing:0;
      }
      .jj-pdf-row-meta{margin-top:7px;color:#6B7787;font-size:10px;line-height:1.45}
      .jj-pdf-import-empty{
        padding:28px 18px;border:1px dashed #C9D1DB;border-radius:12px;background:#fff;text-align:center;
      }
      .jj-pdf-import-empty strong{display:block;color:#14234A;margin-bottom:6px}
      .jj-pdf-import-progress{
        display:none;margin:0 0 12px;padding:11px 13px;border-radius:10px;background:#14234A;color:#fff;font-size:12px;
      }
      .jj-pdf-import-progress.show{display:block}
      @media(max-width:760px){
        .jj-pdf-row-grid{grid-template-columns:1fr 1fr}
      }
      @media(max-width:520px){
        .jj-pdf-row{grid-template-columns:1fr}
        .jj-pdf-row-check{padding:0}
        .jj-pdf-row-grid{grid-template-columns:1fr}
        .jj-pdf-import-foot .btn{flex:1}
      }
    `;
    document.head.appendChild(style);
  }

  function currentProject(){
    try{return typeof window.selectedProject==='function'?window.selectedProject():null}
    catch{return null}
  }

  function toastV76(message){
    try{window.toast?.(message)}catch{}
  }

  function ensurePdfInput(){
    let input=document.getElementById('jjSelectionPdfInputV76');
    if(input)return input;
    input=document.createElement('input');
    input.id='jjSelectionPdfInputV76';
    input.type='file';
    input.accept='application/pdf,.pdf';
    input.multiple=true;
    input.hidden=true;
    input.addEventListener('change',async()=>{
      const files=[...input.files||[]];
      input.value='';
      if(files.length) await readSelectionPdfs(files);
    });
    document.body.appendChild(input);
    return input;
  }

  function ensureUploadButton(){
    const root=document.getElementById('selections');
    if(!root)return;

    const top=root.querySelector('.jj-selection-top-actions');
    if(!top)return;

    if(!top.querySelector('#jjUploadSelectionPdfV76')){
      const button=document.createElement('button');
      button.id='jjUploadSelectionPdfV76';
      button.type='button';
      button.className='btn btn-light';
      button.textContent='Upload File';
      button.title='Import selections from a J&J PDF';
      button.addEventListener('click',()=>ensurePdfInput().click());
      top.appendChild(button);
    }
  }

  function loadPdfJs(){
    if(window.pdfjsLib){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
      return Promise.resolve(window.pdfjsLib);
    }
    if(window.__jjPdfJsPromise)return window.__jjPdfJsPromise;

    window.__jjPdfJsPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=PDFJS_SRC;
      script.async=true;
      script.onload=()=>{
        if(!window.pdfjsLib){
          reject(new Error('PDF reader did not load.'));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      script.onerror=()=>reject(new Error('PDF reader could not load. Check your internet connection.'));
      document.head.appendChild(script);
    });
    return window.__jjPdfJsPromise;
  }

  function groupTextItems(textContent){
    const raw=(textContent?.items||[])
      .filter(item=>clean(item.str))
      .map(item=>({
        text:clean(item.str),
        x:Number(item.transform?.[4]||0),
        y:Number(item.transform?.[5]||0),
        h:Number(item.height||Math.abs(item.transform?.[3]||0)||0)
      }))
      .sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);

    const lines=[];
    for(const item of raw){
      let line=lines.find(existing=>Math.abs(existing.y-item.y)<=2.3);
      if(!line){
        line={y:item.y,h:item.h,items:[]};
        lines.push(line);
      }
      line.items.push(item);
      line.h=Math.max(line.h,item.h);
    }

    return lines
      .sort((a,b)=>b.y-a.y)
      .map(line=>({
        y:line.y,
        h:line.h,
        text:clean(line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' '))
      }))
      .filter(line=>line.text);
  }

  function annotationLinks(annotations){
    return (annotations||[]).map(a=>{
      const url=clean(a.url||a.unsafeUrl||a.action||'');
      const rect=Array.isArray(a.rect)?a.rect:[];
      return {
        url:/^https?:\/\//i.test(url)?url:'',
        y:rect.length>=4?(Number(rect[1])+Number(rect[3]))/2:NaN
      };
    }).filter(a=>a.url);
  }

  const exactProductLabels=[
    'TOILET','SHOWER FAUCET','TUB FAUCET','VANITY','VANITY FAUCET','VANIRTY FAUCET',
    'VANITY LIGHT','LIGHT FIXTURE','SCONCE','EXHAUST FAN','MIRROR','SHOWER DOOR',
    'SHOWER BASE','SHOWER PAN','SHOWER BENCH','BENCH TOP','THRESHOLD','FLOOR VENT',
    'INTERIOR DOOR','BI-FOLD DOOR','BIFOLD DOOR','DOOR HARDWARE','DOOR CASING',
    'BASEBOARD','FLOORING','FLOOR TILE','SHOWER TILE','WALL TILE','SHOWER FLOOR TILE',
    'BATHROOM FLOOR TILE','HARDWARE','TOWEL BAR','TOILET PAPER HOLDER','ROBE HOOK'
  ];

  function isProductLabel(text){
    const upper=clean(text).toUpperCase();
    if(exactProductLabels.includes(upper))return true;
    if(upper==='EXISTING MATERIALS')return true;

    if(
      upper.length<=34 &&
      /^[A-Z0-9 &/+-]+$/.test(upper) &&
      /(FAUCET|VANITY|TOILET|TILE|MIRROR|LIGHT|FAN|DOOR|FLOOR|BASEBOARD|CASING|HARDWARE|VENT|BENCH|THRESHOLD|FIXTURE)/.test(upper) &&
      !/(SELECTIONS|ALLOWANCE|OPTION ONLY|FINAL SELECTION|J ?& ?J|HOME RENOVATIONS)/.test(upper)
    )return true;

    return false;
  }

  function isOptionMarker(text){
    return /^OPTION ONLY\s*-\s*NOT SELECTED$/i.test(clean(text));
  }

  function isNoise(text){
    const s=clean(text);
    return !s ||
      /^J\s*&\s*J\s+HOME\s+RENOVATIONS/i.test(s) ||
      /^J\s*&\s*J\s+H\s*O\s*M\s*E/i.test(s) ||
      /\|\s*\d+\s+OF\s+\d+$/i.test(s) ||
      /^PAGE\s+\d+$/i.test(s) ||
      /^VIEW PRODUCT$/i.test(s) ||
      /^ALLOWANCE$/i.test(s) ||
      /^FINAL SELECTION NEEDED$/i.test(s) ||
      /^Selections shown are for project coordination/i.test(s) ||
      /^Pricing and availability may change/i.test(s) ||
      /^The products below are included for comparison only/i.test(s);
  }

  function isMetaLine(text){
    return /(Vendor\s*:|Store SKU|Internet\s*#|Internet\s+\d|UPC(?: Code)?\s*#?|Product ID\s*:|Model\s*#?)/i.test(text);
  }

  function detectRoom(lines,project){
    const joined=lines.map(l=>l.text).join(' | ');
    const roomPatterns=[
      /Primary Bathroom/i,/First Floor Bathroom/i,/Guest Bathroom/i,/Hall Bathroom/i,
      /Powder Room/i,/Master Bathroom/i,/Basement Bathroom/i,/Basement/i,/Kitchen/i,
      /Laundry Room/i,/Garage/i
    ];
    for(const pattern of roomPatterns){
      const found=joined.match(pattern);
      if(found)return found[0].replace(/\b\w/g,c=>c.toUpperCase());
    }
    return project?.selectionActiveRoom||project?.selectionRooms?.[0]||'Primary Bathroom';
  }

  function looksLikeOptionHeading(text){
    const s=clean(text);
    return s.length<80 &&
      /(Options?|Alternates?|Choices?)$/i.test(s) &&
      !/^Option\s+\d+/i.test(s) &&
      !/^OPTION ONLY/i.test(s);
  }

  function pageSectionHeading(lines){
    const candidates=lines.slice(0,12).filter(line=>{
      const s=line.text;
      if(isNoise(s)||isProductLabel(s)||isOptionMarker(s)||isMetaLine(s))return false;
      if(/^ALYSSA|^MARY|^RAYMOND|^\w+\s*&\s*\w+\s*\|/i.test(s))return false;
      return /(Bathroom|Lighting|Ventilation|Doors|Hardware|Trim|Flooring|Fixtures|Vanity|Accessories|Tile|Plumbing|Electrical|Mirrors|Selections|Options)/i.test(s);
    });
    return clean(candidates[0]?.text||'');
  }

  function categoryFor(label,title){
    const s=(clean(label)+' '+clean(title)).toLowerCase();
    if(/toilet|faucet|shower|tub|valve|drain/.test(s))return 'Plumbing';
    if(/vanity/.test(s) && !/light|faucet/.test(s))return 'Vanity';
    if(/light|sconce|fan|electrical/.test(s))return 'Electrical';
    if(/mirror/.test(s))return 'Mirror';
    if(/tile|flooring|lvp|floor/.test(s))return 'Flooring / Tile';
    if(/door|hardware|casing|baseboard/.test(s))return 'Doors / Trim';
    if(/existing/.test(s))return 'Existing Materials';
    return clean(label).replace(/\b\w/g,c=>c.toUpperCase())||'Selection';
  }

  function inferStatus(blockText,pageText){
    const s=blockText+' '+pageText;
    if(/OPTION ONLY\s*-\s*NOT SELECTED|NOT YET SELECTED|FINAL SELECTION NEEDED|OPTIONAL/i.test(s))return 'Pending';
    if(/\bSELECTED\b/i.test(blockText) && !/\bNOT SELECTED\b/i.test(blockText))return 'Selected';
    return 'Pending';
  }

  function inferPurchasedBy(blockText){
    if(/Purchased by\s*(?:H\.?O\.?|Homeowner)/i.test(blockText))return 'Homeowner';
    if(/Purchased by\s*J\s*&\s*J/i.test(blockText))return 'J&J';
    return '';
  }

  function metadataFromText(blockText){
    const vendor=(blockText.match(/Vendor\s*:\s*([^|]+?)(?=\s+(?:Product ID|Store SKU|Internet|UPC|Model)\b|\||$)/i)||[])[1]||'';
    const model=(blockText.match(/\bModel\s*#?\s*([A-Za-z0-9._/-]+)/i)||[])[1]||
      (blockText.match(/\b(?:Store SKU|SKU)\s*#?\s*([A-Za-z0-9._/-]+)/i)||[])[1]||
      (blockText.match(/\bUPC(?: Code)?\s*#?\s*([A-Za-z0-9._/-]+)/i)||[])[1]||
      (blockText.match(/\bInternet\s*#?\s*([A-Za-z0-9._/-]+)/i)||[])[1]||'';
    const allowance=(blockText.match(/\bALLOWANCE\b[\s:$]*\$?\s*([0-9,]+(?:\.\d{2})?)/i)||[])[1]||'';
    return {vendor:clean(vendor),model:clean(model),allowance:clean(allowance)};
  }

  function nearbyOptionHeading(lines,startIndex){
    for(let i=startIndex-1;i>=Math.max(0,startIndex-8);i--){
      const s=lines[i].text;
      if(looksLikeOptionHeading(s))return clean(s);
      if(isProductLabel(s))break;
    }
    return '';
  }

  function linkForBlock(blockLines,links,usedLinks){
    if(!links.length||!blockLines.length)return '';
    const viewLine=blockLines.find(line=>/^VIEW PRODUCT$/i.test(line.text));
    const targetY=viewLine?.y ?? blockLines[Math.floor(blockLines.length/2)]?.y ?? 0;
    let bestIndex=-1,bestDistance=Infinity;
    links.forEach((link,index)=>{
      if(usedLinks.has(index)||!Number.isFinite(link.y))return;
      const distance=Math.abs(link.y-targetY);
      if(distance<bestDistance){bestDistance=distance;bestIndex=index;}
    });
    if(bestIndex>=0 && bestDistance<95){
      usedLinks.add(bestIndex);
      return links[bestIndex].url;
    }
    return '';
  }

  function parsePageCandidates(lines,links,fileName,pageNumber,project){
    const results=[];
    const usedLinks=new Set();
    const pageText=lines.map(l=>l.text).join(' ');
    const room=detectRoom(lines,project);
    const section=pageSectionHeading(lines);

    const starts=[];
    lines.forEach((line,index)=>{
      if(isProductLabel(line.text)){
        starts.push({index,type:'label'});
      }else if(isOptionMarker(line.text)){
        starts.push({index,type:'option'});
      }
    });

    // Handle simple pages where the PDF uses "Shower Fixture Option" as the
    // product marker instead of an all-caps product label.
    lines.forEach((line,index)=>{
      if(
        looksLikeOptionHeading(line.text) &&
        !starts.some(s=>Math.abs(s.index-index)<=1) &&
        index+1<lines.length &&
        !isNoise(lines[index+1].text)
      ){
        const after=lines[index+1].text;
        if(isOptionMarker(after) || (!isMetaLine(after) && !isProductLabel(after))){
          starts.push({index,type:'optionHeading'});
        }
      }
    });

    starts.sort((a,b)=>a.index-b.index);

    starts.forEach((start,startPos)=>{
      const nextIndex=starts[startPos+1]?.index ?? lines.length;
      const block=lines.slice(start.index,nextIndex);
      const marker=block[0]?.text||'';
      const isExisting=/^EXISTING MATERIALS$/i.test(marker);
      const isOption=start.type!=='label' || isOptionMarker(marker);

      let cursor=1;
      if(start.type==='optionHeading' && isOptionMarker(block[1]?.text||''))cursor=2;
      if(start.type==='option')cursor=1;

      const useful=block.slice(cursor).filter(line=>!isNoise(line.text) && !isOptionMarker(line.text));
      const titleLine=useful.find(line=>!isMetaLine(line.text) && !/^\$[\d,.]+$/.test(line.text));

      let title='';
      if(isExisting){
        title='Existing Materials';
      }else if(start.type==='optionHeading' && titleLine){
        title=titleLine.text;
      }else if(start.type==='option' && titleLine){
        title=titleLine.text;
      }else{
        title=titleLine?.text||'';
      }
      title=clean(title);
      if(!title)return;

      const titleIndex=block.findIndex(line=>line.text===title);
      const descriptionLines=block
        .slice(Math.max(1,titleIndex+1))
        .map(line=>line.text)
        .filter(text=>
          !isNoise(text) &&
          !isMetaLine(text) &&
          !/^OPTION ONLY/i.test(text) &&
          !/^\$[\d,.]+$/.test(text) &&
          !/^SELECTED$/i.test(text) &&
          !/^PRE-SELECTED$/i.test(text) &&
          !/^PARTIAL$/i.test(text)
        );

      const blockText=block.map(line=>line.text).join(' ');
      const meta=metadataFromText(blockText);
      const optionGroup= isOption
        ? (nearbyOptionHeading(lines,start.index) || (start.type==='optionHeading'?clean(marker):'') || section || clean(marker))
        : '';

      const pdfLink=linkForBlock(block,links,usedLinks);

      results.push({
        id:`pdf-${Date.now()}-${pageNumber}-${results.length}-${Math.random().toString(36).slice(2,7)}`,
        sourceFile:fileName,
        sourcePage:pageNumber,
        label:clean(marker),
        title,
        room,
        category:categoryFor(marker,title),
        group:optionGroup,
        vendor:meta.vendor,
        model:meta.model,
        description:clean(descriptionLines.join(' | ')),
        notes:[
          `Imported from PDF: ${fileName} · page ${pageNumber}`,
          meta.allowance?`PDF allowance: $${meta.allowance}`:''
        ].filter(Boolean).join('\n'),
        status:inferStatus(blockText,pageText),
        purchasedBy:inferPurchasedBy(blockText),
        url:pdfLink,
        duplicate:false
      });
    });

    // Avoid accidental duplicate blocks caused by both an option heading and
    // the status marker immediately below it describing the same product.
    const seen=new Set();
    return results.filter(item=>{
      const key=[norm(item.title),norm(item.model),norm(item.group),item.sourcePage].join('|');
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }

  function selectionFingerprint(item){
    return [
      norm(item.title),
      norm(item.model),
      clean(item.url||'').toLowerCase(),
      norm(item.room)
    ].join('|');
  }

  async function readSelectionPdfs(files){
    const project=currentProject();
    if(!project){
      toastV76('Open a project first');
      return;
    }

    openImportProgress(files.length);
    try{
      const pdfjs=await loadPdfJs();
      const imported=[];

      for(let fileIndex=0;fileIndex<files.length;fileIndex++){
        const file=files[fileIndex];
        updateImportProgress(`Reading ${file.name} · ${fileIndex+1} of ${files.length}`);

        const bytes=new Uint8Array(await file.arrayBuffer());
        const pdf=await pdfjs.getDocument({data:bytes}).promise;

        for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
          updateImportProgress(`Reading ${file.name} · page ${pageNumber} of ${pdf.numPages}`);
          const page=await pdf.getPage(pageNumber);
          const [textContent,annotations]=await Promise.all([
            page.getTextContent(),
            page.getAnnotations({intent:'display'}).catch(()=>[])
          ]);
          const lines=groupTextItems(textContent);
          const links=annotationLinks(annotations);
          imported.push(...parsePageCandidates(lines,links,file.name,pageNumber,project));
        }
      }

      const existing=new Set((project.selections||[]).map(selectionFingerprint));
      imported.forEach(item=>{
        item.duplicate=existing.has(selectionFingerprint(item));
      });

      closeImportProgress();
      openImportReview(imported,files);
    }catch(err){
      console.error('PDF selection import failed',err);
      closeImportProgress();
      alert(`Could not read the PDF selection file.\n\n${err?.message||'Please try a J&J selection PDF with selectable text.'}`);
    }
  }

  function progressDialog(){
    let dialog=document.getElementById('jjPdfProgressV76');
    if(dialog)return dialog;
    dialog=document.createElement('dialog');
    dialog.id='jjPdfProgressV76';
    dialog.className='jj-pdf-import-dialog';
    dialog.innerHTML=`
      <div class="jj-pdf-import-head">
        <div><small>SELECTIONS</small><h3>Reading PDF</h3></div>
      </div>
      <div class="jj-pdf-import-body">
        <div class="jj-pdf-import-progress show" id="jjPdfProgressTextV76">Preparing PDF reader…</div>
        <div style="color:#647184;font-size:12px">The PDF is read on this device. The file itself is not added to shared project state.</div>
      </div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function openImportProgress(count){
    const dialog=progressDialog();
    document.getElementById('jjPdfProgressTextV76').textContent=`Preparing ${count} PDF${count===1?'':'s'}…`;
    if(!dialog.open)dialog.showModal();
  }

  function updateImportProgress(text){
    const node=document.getElementById('jjPdfProgressTextV76');
    if(node)node.textContent=text;
  }

  function closeImportProgress(){
    const dialog=document.getElementById('jjPdfProgressV76');
    if(dialog?.open)dialog.close();
    dialog?.remove();
  }

  function roomOptions(project,current){
    const rooms=[...(project.selectionRooms||[])];
    if(current && !rooms.includes(current))rooms.push(current);
    return rooms.map(room=>`<option ${room===current?'selected':''}>${esc(room)}</option>`).join('');
  }

  function purchaseOptions(current){
    const values=['','J&J','Homeowner'];
    return values.map(value=>`<option value="${esc(value)}" ${value===current?'selected':''}>${value||'Not assigned'}</option>`).join('');
  }

  function statusOptions(current){
    return ['Pending','Selected'].map(value=>`<option ${value===current?'selected':''}>${value}</option>`).join('');
  }

  function openImportReview(candidates,files){
    document.getElementById('jjPdfImportReviewV76')?.remove();
    const project=currentProject();

    const dialog=document.createElement('dialog');
    dialog.id='jjPdfImportReviewV76';
    dialog.className='jj-pdf-import-dialog';

    const uniqueCount=candidates.filter(item=>!item.duplicate).length;
    dialog.innerHTML=`
      <div class="jj-pdf-import-head">
        <div>
          <small>PDF IMPORT</small>
          <h3>Review Selections</h3>
        </div>
        <button type="button" class="jj-group-icon" data-close aria-label="Close">×</button>
      </div>
      <div class="jj-pdf-import-body">
        <div class="jj-pdf-import-summary">
          <span><b>${candidates.length}</b> found</span>
          <span><b>${uniqueCount}</b> ready to import</span>
          <span><b>${files.length}</b> PDF${files.length===1?'':'s'}</span>
          ${candidates.some(item=>item.duplicate)?'<span>Duplicates are unchecked automatically.</span>':''}
        </div>
        ${candidates.length?`
          <div class="jj-pdf-import-list">
            ${candidates.map((item,index)=>`
              <section class="jj-pdf-row ${item.duplicate?'duplicate':''}" data-import-row="${index}">
                <div class="jj-pdf-row-check">
                  <input type="checkbox" data-import-check="${index}" ${item.duplicate?'':'checked'} aria-label="Import ${esc(item.title)}">
                </div>
                <div class="jj-pdf-row-main">
                  <div class="jj-pdf-row-title">
                    <strong>${esc(item.title)}</strong>
                    <span class="jj-pdf-chip">${esc(item.sourceFile)} · p.${item.sourcePage}</span>
                    ${item.group?`<span class="jj-pdf-chip">Option group: ${esc(item.group)}</span>`:''}
                    ${item.duplicate?'<span class="jj-pdf-chip warn">Possible duplicate</span>':''}
                  </div>
                  <div class="jj-pdf-row-grid">
                    <label>Product name
                      <input data-import-title="${index}" value="${esc(item.title)}">
                    </label>
                    <label>Room
                      <select data-import-room="${index}">${roomOptions(project,item.room)}</select>
                    </label>
                    <label>Category
                      <input data-import-category="${index}" value="${esc(item.category)}">
                    </label>
                    <label>Status
                      <select data-import-status="${index}">${statusOptions(item.status)}</select>
                    </label>
                    <label>Option group
                      <input data-import-group="${index}" value="${esc(item.group)}" placeholder="Standalone">
                    </label>
                    <label>Purchased by
                      <select data-import-purchased="${index}">${purchaseOptions(item.purchasedBy)}</select>
                    </label>
                    <label>Vendor
                      <input data-import-vendor="${index}" value="${esc(item.vendor)}">
                    </label>
                    <label>Model / SKU / UPC
                      <input data-import-model="${index}" value="${esc(item.model)}">
                    </label>
                  </div>
                  <div class="jj-pdf-row-meta">
                    ${item.url?`Product link detected · `:''}${esc(item.description||'No description detected')}
                  </div>
                </div>
              </section>`).join('')}
          </div>`:
          `<div class="jj-pdf-import-empty">
            <strong>No selection products were detected.</strong>
            <span>This importer is designed for the J&J selection PDFs we have used before. PDFs that are only scanned images may need to be recreated or converted to searchable text first.</span>
          </div>`}
      </div>
      <div class="jj-pdf-import-foot">
        <button type="button" class="btn btn-light" data-close>Cancel</button>
        ${candidates.length?`<button type="button" class="btn btn-gold" id="jjPdfImportSaveV76">Import Selected</button>`:''}
      </div>`;

    document.body.appendChild(dialog);
    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('#jjPdfImportSaveV76')?.addEventListener('click',()=>{
      importReviewedCandidates(dialog,candidates,files);
    });
    dialog.showModal();
  }

  function ensureGroupByName(project,name){
    const cleanName=clean(name);
    if(!cleanName)return null;
    if(!Array.isArray(project.selectionGroups))project.selectionGroups=[];
    let group=project.selectionGroups.find(g=>norm(g.name)===norm(cleanName));
    if(!group){
      group={
        id:'group-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),
        name:cleanName
      };
      project.selectionGroups.push(group);
    }
    return group;
  }

  function importReviewedCandidates(dialog,candidates,files){
    const project=currentProject();
    if(!project)return;
    if(!Array.isArray(project.selections))project.selections=[];
    if(!Array.isArray(project.selectionRooms))project.selectionRooms=[];
    if(!Array.isArray(project.selectionImports))project.selectionImports=[];

    const chosen=[];
    candidates.forEach((item,index)=>{
      if(!dialog.querySelector(`[data-import-check="${index}"]`)?.checked)return;

      const title=clean(dialog.querySelector(`[data-import-title="${index}"]`)?.value);
      if(!title)return;

      const room=clean(dialog.querySelector(`[data-import-room="${index}"]`)?.value)||project.selectionRooms[0]||'Primary Bathroom';
      const category=clean(dialog.querySelector(`[data-import-category="${index}"]`)?.value)||'Selection';
      const groupName=clean(dialog.querySelector(`[data-import-group="${index}"]`)?.value);
      const status=clean(dialog.querySelector(`[data-import-status="${index}"]`)?.value)||'Pending';
      const purchasedBy=clean(dialog.querySelector(`[data-import-purchased="${index}"]`)?.value);
      const vendor=clean(dialog.querySelector(`[data-import-vendor="${index}"]`)?.value);
      const model=clean(dialog.querySelector(`[data-import-model="${index}"]`)?.value);

      if(!project.selectionRooms.includes(room))project.selectionRooms.push(room);

      const group=ensureGroupByName(project,groupName);
      chosen.push({
        id:Date.now()+chosen.length+Math.floor(Math.random()*1000),
        url:item.url||'',
        title,
        vendor,
        category,
        room,
        quality:'Standard',
        model,
        image:'',
        unitPrice:null,
        quantity:1,
        addTax:false,
        purchasedBy:purchasedBy||'',
        optionLabel:group?'PDF option':undefined,
        optionGroupId:group?.id,
        optionGroupTitle:group?.name,
        status,
        homeownerSelected:false,
        homeownerSelectedAt:null,
        inStock:false,
        leadTimeValue:1,
        leadTimeUnit:'Day(s)',
        description:item.description||'',
        notes:item.notes||''
      });
    });

    if(!chosen.length){
      toastV76('Choose at least one selection to import');
      return;
    }

    // Add only. Never replace/remove existing selections.
    project.selections.push(...chosen);
    project.selectionImports.push({
      id:'pdf-import-'+Date.now(),
      importedAt:new Date().toISOString(),
      files:files.map(file=>file.name),
      count:chosen.length
    });

    try{window.JJSelectionRecovery?.snapshot?.()}catch{}
    try{window.saveState?.(false)}catch{}
    try{window.renderAll?.()}catch{}
    try{window.go?.('selections')}catch{}
    dialog.close();
    toastV76(`${chosen.length} selection${chosen.length===1?'':'s'} imported from PDF`);
  }

  function bootV76(){
    injectV76Styles();
    ensurePdfInput();
    ensureUploadButton();

    const root=document.getElementById('selections');
    if(root && !window.__jjV76SelectionsObserver){
      const observer=new MutationObserver(()=>setTimeout(()=>{
        ensureUploadButton();
        injectV76Styles();
      },0));
      observer.observe(root,{childList:true,subtree:true});
      window.__jjV76SelectionsObserver=observer;
    }

    if(!window.__jjV76Timer){
      window.__jjV76Timer=setInterval(()=>{
        if(!document.hidden)ensureUploadButton();
      },1000);
    }
  }

  window.JJSelectionPdfImporter={
    open:()=>ensurePdfInput().click(),
    read:files=>readSelectionPdfs([...files||[]])
  };

  if(document.readyState==='complete')setTimeout(bootV76,0);
  else window.addEventListener('load',()=>setTimeout(bootV76,0),{once:true});
})();


/* -------------------------------------------------------------------------
   J&J Selections Import Polish v77
   - Adds Recommended status in the contractor selection editor/import review.
   - Makes PDF import clearer and safer: confidence filter, cross-file duplicate
     detection, clear "review first" workflow, and stronger false-positive rules.
   - Slightly increases card/list typography on app + homeowner side.
   - Does NOT delete/replace existing selections.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjSelectionImportPolishV77) return;
  window.__jjSelectionImportPolishV77 = true;

  const STYLE_ID='jj-selection-import-polish-v77';
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function injectV77Styles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* Slightly larger, easier-to-read selection cards */
      #selections .selection-card-meta{font-size:12px!important;line-height:1.4!important}
      #selections .selection-card h3{font-size:17px!important;line-height:1.35!important}
      #selections .selection-vendor{font-size:12px!important;line-height:1.45!important}
      #selections .selection-card-body{font-size:13px!important;line-height:1.48!important}
      #selections .selection-price{font-size:18px!important}
      #selections .selection-price small{font-size:11px!important}
      #selections .selection-status{font-size:11px!important;line-height:1.35!important}
      #selections .selection-card-actions a,
      #selections .selection-card-actions button,
      #selections .selection-group-inline{font-size:11px!important}

      #items article .card-body{font-size:13px!important;line-height:1.48!important}
      #items article .card-body>small:first-child{font-size:11px!important}
      #items article h2{font-size:17px!important;line-height:1.36!important}
      #items article .detail{font-size:13px!important;line-height:1.5!important}
      #items article .price{font-size:19px!important}
      #items article p{font-size:13px!important;line-height:1.45!important}
      #items.list article .card-body{font-size:13px!important}

      .jj-pdf-import-step{
        display:flex;align-items:flex-start;gap:10px;padding:11px 12px;margin-bottom:12px;
        border:1px solid #D8E0E8;border-radius:10px;background:#FFF;
        color:#526174;font-size:11px;line-height:1.45;
      }
      .jj-pdf-import-step b{color:#14234A}
      .jj-pdf-import-step-number{
        display:grid;place-items:center;flex:0 0 24px;width:24px;height:24px;border-radius:50%;
        background:#14234A;color:#fff;font-size:11px;font-weight:900;
      }
      .jj-pdf-import-summary .jj-pdf-import-safe{
        width:100%;padding-top:5px;color:#246441;font-weight:800;
      }
      .jj-pdf-row.low-confidence{
        border-style:dashed!important;
        background:#FFFDF7!important;
      }
      .jj-pdf-chip.review{background:#FFF1D9!important;color:#865E0A!important}
      .jj-pdf-chip.good{background:#EAF5EE!important;color:#246441!important}
    `;
    document.head.appendChild(style);
  }

  function ensureRecommendedOption(){
    const select=document.getElementById('selectionEditStatus');
    if(!select) return;

    if(![...select.options].some(opt=>opt.value==='Recommended')){
      const option=document.createElement('option');
      option.value='Recommended';
      option.textContent='Recommended';
      const selectedOpt=[...select.options].find(opt=>opt.value==='Selected');
      if(selectedOpt) selectedOpt.insertAdjacentElement('afterend',option);
      else select.appendChild(option);
    }
  }

  function patchRecommendedEditor(){
    ensureRecommendedOption();

    const backdrop=document.getElementById('selectionModalBackdrop');
    if(backdrop && !backdrop.dataset.jjRecommendedObserved){
      backdrop.dataset.jjRecommendedObserved='1';
      new MutationObserver(()=>setTimeout(ensureRecommendedOption,0))
        .observe(backdrop,{childList:true,subtree:true});
    }
  }

  function existingProject(){
    try{return typeof window.selectedProject==='function'?window.selectedProject():null}
    catch{return null}
  }

  function candidateKey(item){
    const title=norm(item.title);
    const model=norm(item.model);
    const vendor=norm(item.vendor);
    const room=norm(item.room);
    const url=clean(item.url||'').toLowerCase();
    // Use stable product identifiers first; fall back to title/vendor/room.
    if(model) return `model|${model}|${vendor}`;
    if(url) return `url|${url}`;
    return `title|${title}|${vendor}|${room}`;
  }

  function looksLikeSectionHeading(text){
    const s=norm(text);
    return [
      'bathroom fixtures vanity',
      'lighting ventilation',
      'doors hardware',
      'trim flooring',
      'accessories existing items',
      'fixture options not yet selected',
      'vanity faucet options',
      'shower fixture options',
      'bathroom selections',
      'project selections'
    ].some(x=>s===x || s.startsWith(x+' '));
  }

  function likelyFalsePositive(item){
    const title=clean(item.title);
    const label=clean(item.label);
    if(!title) return true;
    if(looksLikeSectionHeading(title)||looksLikeSectionHeading(label)) return true;
    if(/^(allowance|view product|final selection needed|option only|selected|pending)$/i.test(title)) return true;
    if(/\bpage\s+\d+\b/i.test(title)) return true;
    if(/^\d+\s+of\s+\d+$/i.test(title)) return true;
    if(/selections shown are for project coordination/i.test(title)) return true;
    return false;
  }

  function confidenceScore(item){
    let score=0;
    const label=clean(item.label).toUpperCase();

    // Known product/category markers are strong evidence.
    if(/^(TOILET|SHOWER FAUCET|TUB FAUCET|VANITY|VANITY FAUCET|VANIRTY FAUCET|VANITY LIGHT|LIGHT FIXTURE|SCONCE|EXHAUST FAN|MIRROR|SHOWER DOOR|SHOWER BASE|SHOWER PAN|SHOWER BENCH|BENCH TOP|THRESHOLD|FLOOR VENT|INTERIOR DOOR|BI-FOLD DOOR|BIFOLD DOOR|DOOR HARDWARE|DOOR CASING|BASEBOARD|FLOORING|FLOOR TILE|SHOWER TILE|WALL TILE|SHOWER FLOOR TILE|BATHROOM FLOOR TILE|HARDWARE|TOWEL BAR|TOILET PAPER HOLDER|ROBE HOOK|EXISTING MATERIALS)$/.test(label)) score+=3;
    else if(/(FAUCET|VANITY|TOILET|TILE|MIRROR|LIGHT|FAN|DOOR|FLOOR|BASEBOARD|CASING|HARDWARE|VENT|BENCH|THRESHOLD|FIXTURE)/.test(label)) score+=1;

    if(clean(item.vendor)) score+=1;
    if(clean(item.model)) score+=1;
    if(clean(item.url)) score+=1;
    if(clean(item.description).length>=8) score+=1;
    if(clean(item.group)) score+=1;
    if(/OPTION ONLY|NOT SELECTED/i.test(clean(item.notes)+' '+clean(item.description))) score+=1;

    if(likelyFalsePositive(item)) score-=5;
    return score;
  }

  function normalizeCandidateSet(candidates){
    const project=existingProject();
    const existingKeys=new Set((project?.selections||[]).map(item=>candidateKey(item)));
    const seenUpload=new Set();

    return candidates.map(item=>{
      const key=candidateKey(item);
      const duplicateExisting=existingKeys.has(key);
      const duplicateUpload=seenUpload.has(key);
      if(key) seenUpload.add(key);

      const confidence=confidenceScore(item);
      const lowConfidence=confidence<3;

      return {
        ...item,
        duplicateExisting,
        duplicateUpload,
        duplicate:duplicateExisting||duplicateUpload,
        confidence,
        lowConfidence
      };
    }).filter(item=>{
      // Hide obvious section headings / footer text completely.
      return item.confidence>=1 && !likelyFalsePositive(item);
    });
  }

  // Replaces the v76 review window with a clearer review-first workflow.
  function openReviewV77(candidates,files){
    document.getElementById('jjPdfImportReviewV76')?.remove();

    const project=existingProject();
    if(!project) return;

    const normalized=normalizeCandidateSet(candidates);
    const unique=normalized.filter(item=>!item.duplicate);
    const ready=unique.filter(item=>!item.lowConfidence);
    const needsReview=unique.filter(item=>item.lowConfidence);
    const duplicates=normalized.filter(item=>item.duplicate);

    const dialog=document.createElement('dialog');
    dialog.id='jjPdfImportReviewV76';
    dialog.className='jj-pdf-import-dialog';

    const roomOptions=(current)=>{
      const rooms=[...(project.selectionRooms||[])];
      if(current&&!rooms.includes(current))rooms.push(current);
      return rooms.map(room=>`<option ${room===current?'selected':''}>${esc(room)}</option>`).join('');
    };
    const purchaseOptions=(current)=>{
      const values=['','J&J','Homeowner'];
      return values.map(value=>`<option value="${esc(value)}" ${value===current?'selected':''}>${value||'Not assigned'}</option>`).join('');
    };
    const statusOptions=(current)=>{
      return ['Pending','Recommended','Selected']
        .map(value=>`<option ${value===current?'selected':''}>${value}</option>`)
        .join('');
    };

    dialog.innerHTML=`
      <div class="jj-pdf-import-head">
        <div>
          <small>PDF IMPORT</small>
          <h3>Review Before Import</h3>
        </div>
        <button type="button" class="jj-group-icon" data-close aria-label="Close">×</button>
      </div>
      <div class="jj-pdf-import-body">
        <div class="jj-pdf-import-step">
          <span class="jj-pdf-import-step-number">1</span>
          <div><b>PDF read complete.</b><br>${files.map(file=>esc(file.name)).join(' · ')}</div>
        </div>
        <div class="jj-pdf-import-step">
          <span class="jj-pdf-import-step-number">2</span>
          <div><b>Review what was detected.</b><br>Nothing has been added to the job yet. Duplicates and lower-confidence items are unchecked automatically.</div>
        </div>
        <div class="jj-pdf-import-step">
          <span class="jj-pdf-import-step-number">3</span>
          <div><b>Click Import Selected.</b><br>Only the checked rows will be appended to the current job.</div>
        </div>

        <div class="jj-pdf-import-summary">
          <span><b>${normalized.length}</b> possible selections</span>
          <span><b>${ready.length}</b> ready</span>
          <span><b>${needsReview.length}</b> need review</span>
          <span><b>${duplicates.length}</b> duplicate${duplicates.length===1?'':'s'} skipped</span>
          <span><b>${files.length}</b> PDF${files.length===1?'':'s'}</span>
          <div class="jj-pdf-import-safe">Nothing imports until you click “Import Selected.” Existing selections will not be replaced.</div>
        </div>

        ${normalized.length?`
          <div class="jj-pdf-import-list">
            ${normalized.map((item,index)=>{
              const checked=!item.duplicate&&!item.lowConfidence;
              const confidenceLabel=item.lowConfidence?'Needs review':'Looks good';
              return `
              <section class="jj-pdf-row ${item.duplicate?'duplicate':''} ${item.lowConfidence?'low-confidence':''}" data-import-row="${index}">
                <div class="jj-pdf-row-check">
                  <input type="checkbox" data-import-check="${index}" ${checked?'checked':''} aria-label="Import ${esc(item.title)}">
                </div>
                <div class="jj-pdf-row-main">
                  <div class="jj-pdf-row-title">
                    <strong>${esc(item.title)}</strong>
                    <span class="jj-pdf-chip">${esc(item.sourceFile)} · p.${item.sourcePage}</span>
                    ${item.group?`<span class="jj-pdf-chip">Option group: ${esc(item.group)}</span>`:''}
                    ${item.duplicate?'<span class="jj-pdf-chip warn">Duplicate — skipped</span>':
                      item.lowConfidence?'<span class="jj-pdf-chip review">Needs review</span>':
                      '<span class="jj-pdf-chip good">Looks good</span>'}
                  </div>

                  <div class="jj-pdf-row-grid">
                    <label>Product name
                      <input data-import-title="${index}" value="${esc(item.title)}">
                    </label>
                    <label>Room
                      <select data-import-room="${index}">${roomOptions(item.room)}</select>
                    </label>
                    <label>Category
                      <input data-import-category="${index}" value="${esc(item.category)}">
                    </label>
                    <label>Status
                      <select data-import-status="${index}">${statusOptions(item.status)}</select>
                    </label>
                    <label>Option group
                      <input data-import-group="${index}" value="${esc(item.group)}" placeholder="Standalone">
                    </label>
                    <label>Purchased by
                      <select data-import-purchased="${index}">${purchaseOptions(item.purchasedBy)}</select>
                    </label>
                    <label>Vendor
                      <input data-import-vendor="${index}" value="${esc(item.vendor)}">
                    </label>
                    <label>Model / SKU / UPC
                      <input data-import-model="${index}" value="${esc(item.model)}">
                    </label>
                  </div>
                  <div class="jj-pdf-row-meta">
                    ${item.url?'Product link detected · ':''}${esc(item.description||'No description detected')}
                  </div>
                </div>
              </section>`;
            }).join('')}
          </div>`:
          `<div class="jj-pdf-import-empty">
            <strong>No real selection products were detected.</strong>
            <span>The importer ignored page titles, section headings, footer text, and other non-selection content.</span>
          </div>`
        }
      </div>
      <div class="jj-pdf-import-foot">
        <button type="button" class="btn btn-light" data-close>Cancel</button>
        ${normalized.length?'<button type="button" class="btn btn-gold" id="jjPdfImportSaveV76">Import Selected</button>':''}
      </div>`;

    document.body.appendChild(dialog);

    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.addEventListener('close',()=>dialog.remove());

    dialog.querySelector('#jjPdfImportSaveV76')?.addEventListener('click',()=>{
      // Translate normalized rows back into the original v76 import function.
      if(typeof window.__jjV77ImportReviewed==='function'){
        window.__jjV77ImportReviewed(dialog,normalized,files);
      }else{
        alert('Import helper is still loading. Please close and reopen the review window.');
      }
    });

    dialog.showModal();
  }

  function installImportHooks(){
    // v76 keeps its import helper functions inside a closure, so we hook the
    // visible global importer and temporarily intercept the v76 review dialog.
    if(!window.JJSelectionPdfImporter || window.JJSelectionPdfImporter.__v77) return false;

    const originalRead=window.JJSelectionPdfImporter.read?.bind(window.JJSelectionPdfImporter);
    if(!originalRead) return false;

    // Capture the v76 import function by watching for the generated review
    // dialog and replacing only the review UI after parsing is complete.
    const bodyObserver=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        for(const node of mutation.addedNodes||[]){
          if(!(node instanceof HTMLElement)) continue;
          if(node.id!=='jjPdfImportReviewV76') continue;

          // Extract candidate information already rendered by v76, if needed.
          // Normally v77 patches the global function below before this point.
        }
      }
    });
    bodyObserver.observe(document.body,{childList:true});

    window.JJSelectionPdfImporter.__v77=true;
    return true;
  }

  function patchV76ReviewFunctions(){
    // The v76 functions live in the same shared global script scope/closure, but
    // openImportReview/importReviewedCandidates are not exported. We can safely
    // wrap them only if they are globals in this build.
    if(typeof window.openImportReview==='function' && !window.openImportReview.__v77){
      const originalImport=window.importReviewedCandidates;
      window.__jjV77ImportReviewed=originalImport;
      const wrapped=function(candidates,files){ return openReviewV77(candidates,files); };
      wrapped.__v77=true;
      window.openImportReview=wrapped;
      return true;
    }
    return false;
  }

  // Fallback: if v76 functions remain lexical/private, replace the review UI
  // immediately after it appears by reconstructing candidates from its rows.
  function observeV76Review(){
    if(window.__jjV77ReviewObserver) return;
    window.__jjV77ReviewObserver=new MutationObserver(()=>{
      const dialog=document.getElementById('jjPdfImportReviewV76');
      if(!dialog || dialog.dataset.jjV77==='1') return;

      const rows=[...dialog.querySelectorAll('[data-import-row]')];
      if(!rows.length) return;

      const candidates=rows.map((row,index)=>({
        sourceFile:clean(row.querySelector('.jj-pdf-chip')?.textContent?.replace(/\s*·\s*p\.\d+.*/,'')||'PDF'),
        sourcePage:Number((row.querySelector('.jj-pdf-chip')?.textContent||'').match(/p\.(\d+)/i)?.[1]||1),
        title:clean(row.querySelector(`[data-import-title="${index}"]`)?.value),
        room:clean(row.querySelector(`[data-import-room="${index}"]`)?.value),
        category:clean(row.querySelector(`[data-import-category="${index}"]`)?.value),
        status:clean(row.querySelector(`[data-import-status="${index}"]`)?.value)||'Pending',
        group:clean(row.querySelector(`[data-import-group="${index}"]`)?.value),
        purchasedBy:clean(row.querySelector(`[data-import-purchased="${index}"]`)?.value),
        vendor:clean(row.querySelector(`[data-import-vendor="${index}"]`)?.value),
        model:clean(row.querySelector(`[data-import-model="${index}"]`)?.value),
        description:clean(row.querySelector('.jj-pdf-row-meta')?.textContent),
        label:'',
        url:'',
        notes:''
      }));

      // Keep v76 import function available by clicking its original button.
      const oldSave=dialog.querySelector('#jjPdfImportSaveV76');
      const originalClick=oldSave?.onclick;

      dialog.dataset.jjV77='1';

      // We cannot recover hidden link/notes from DOM-only fallback, so instead
      // leave the v76 dialog intact but improve status choices/labels and default
      // check state using the safer v77 duplicate/confidence rules.
      const normalized=normalizeCandidateSet(candidates);
      normalized.forEach((item,index)=>{
        const checkbox=dialog.querySelector(`[data-import-check="${index}"]`);
        const row=dialog.querySelector(`[data-import-row="${index}"]`);
        const status=dialog.querySelector(`[data-import-status="${index}"]`);
        if(status && ![...status.options].some(o=>o.value==='Recommended')){
          const opt=document.createElement('option');
          opt.value='Recommended';
          opt.textContent='Recommended';
          const sel=[...status.options].find(o=>o.value==='Selected');
          if(sel) sel.insertAdjacentElement('beforebegin',opt);
          else status.appendChild(opt);
        }
        if(checkbox && (item.duplicate || item.lowConfidence)) checkbox.checked=false;
        if(row && item.lowConfidence) row.classList.add('low-confidence');
      });

      const summary=dialog.querySelector('.jj-pdf-import-summary');
      if(summary){
        summary.innerHTML+=`<div class="jj-pdf-import-safe">Review first — nothing is added until you click “Import Selected.” Duplicates and questionable rows are unchecked.</div>`;
      }
    });
    window.__jjV77ReviewObserver.observe(document.body,{childList:true,subtree:true});
  }

  function relabelUploadButton(){
    const btn=document.getElementById('jjUploadSelectionPdfV76');
    if(!btn) return;
    btn.textContent='Upload File';
    btn.title='Upload a J&J selections PDF → review detected products → import only the checked selections';
  }

  function boot(){
    injectV77Styles();
    patchRecommendedEditor();
    patchV76ReviewFunctions();
    installImportHooks();
    observeV76Review();
    relabelUploadButton();

    setInterval(()=>{
      if(document.hidden) return;
      patchRecommendedEditor();
      patchV76ReviewFunctions();
      relabelUploadButton();
    },900);
  }

  if(document.readyState==='complete') setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();


/* -------------------------------------------------------------------------
   J&J Selections Bulk Actions v78
   Multi-select existing selections to:
   - Change Status
   - Change Group / Remove from Group
   - Change Lead Time
   - Delete, followed by an explicit Confirm Delete button
   This patch never changes anything until the user presses Apply/Confirm.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjSelectionBulkActionsV78) return;
  window.__jjSelectionBulkActionsV78 = true;

  const STYLE_ID='jj-selection-bulk-actions-v78';
  let deleteArmed=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function injectStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .jj-bulk-actions-v78{
        display:flex;align-items:center;gap:8px;flex-wrap:wrap;
        margin:10px 0 14px;padding:10px 12px;
        border:1px solid #D9E0E8;border-radius:11px;background:#F8FAFC;
      }
      .jj-bulk-actions-v78 .jj-bulk-count{
        min-width:94px;color:#14234A;font-size:11px;font-weight:900;
      }
      .jj-bulk-actions-v78 .jj-bulk-divider{
        width:1px;height:28px;background:#D9E0E8;margin:0 2px;
      }
      .jj-bulk-actions-v78 button{
        min-height:36px!important;padding:8px 11px!important;font-size:11px!important;
      }
      .jj-bulk-actions-v78 button:disabled{opacity:.45;cursor:not-allowed}
      .jj-bulk-actions-v78 .jj-danger{
        background:#FFF2F0!important;color:#A43A2A!important;border:1px solid #E6C2BC!important;
      }
      .jj-bulk-actions-v78 .jj-confirm-delete{
        background:#A43A2A!important;color:#fff!important;border:1px solid #A43A2A!important;
        font-weight:900!important;
      }
      .jj-bulk-menu-v78{
        width:min(520px,calc(100% - 24px));max-height:86dvh;
        border:0;border-radius:15px;padding:0;color:#202633;
        box-shadow:0 24px 70px rgba(12,28,45,.34);
      }
      .jj-bulk-menu-v78::backdrop{background:rgba(7,18,31,.58)}
      .jj-bulk-head,.jj-bulk-foot{
        position:sticky;z-index:3;display:flex;align-items:center;justify-content:space-between;
        gap:12px;padding:15px 17px;background:#fff;
      }
      .jj-bulk-head{top:0;border-bottom:1px solid #E2E6EC}
      .jj-bulk-foot{bottom:0;border-top:1px solid #E2E6EC;justify-content:flex-end}
      .jj-bulk-head h3{margin:2px 0 0;color:#14234A}
      .jj-bulk-head small{color:#B59A62;font-size:9px;font-weight:950;letter-spacing:.9px}
      .jj-bulk-body{padding:17px;background:#F6F8FA}
      .jj-bulk-body label{display:block;margin-bottom:12px;color:#526174;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.4px}
      .jj-bulk-body select,.jj-bulk-body input{
        width:100%;margin-top:5px;padding:10px;border:1px solid #C9D1DB;border-radius:8px;
        background:#fff;color:#202633;font-size:12px;text-transform:none;letter-spacing:0;
      }
      .jj-bulk-note{
        padding:10px 11px;border-radius:9px;background:#fff;border:1px solid #DCE2E9;
        color:#657184;font-size:11px;line-height:1.45;
      }
      @media(max-width:620px){
        .jj-bulk-actions-v78{display:grid;grid-template-columns:1fr 1fr}
        .jj-bulk-actions-v78 .jj-bulk-count{grid-column:1/-1}
        .jj-bulk-actions-v78 .jj-bulk-divider{display:none}
        .jj-bulk-actions-v78 button{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function project(){
    try{return typeof window.selectedProject==='function'?window.selectedProject():null}
    catch{return null}
  }

  function selectedSet(){
    const p=project();
    if(!p) return new Set();
    try{
      if(typeof window.selectionBulkSet==='function') return window.selectionBulkSet(p);
      if(typeof selectionBulkSet==='function') return selectionBulkSet(p);
    }catch{}
    return new Set();
  }

  function selectedItems(){
    const p=project();
    if(!p) return [];
    const set=selectedSet();
    return (p.selections||[]).filter(item=>set.has(item));
  }

  function saveAndRefresh(message=''){
    deleteArmed=false;
    try{window.saveState?.(false)}catch{}
    try{window.renderSelections?.()}catch{}
    if(message) try{window.toast?.(message)}catch{}
  }

  function clearSelection(){
    try{selectedSet().clear()}catch{}
    deleteArmed=false;
    try{window.renderSelections?.()}catch{}
  }

  function selectVisible(){
    const p=project();
    if(!p) return;
    const set=selectedSet();

    // Use currently rendered checkboxes so filters are respected.
    document.querySelectorAll('#selections .selection-card input[type="checkbox"]').forEach(input=>{
      const card=input.closest('.selection-card');
      if(!card) return;
      const cards=[...document.querySelectorAll('#selections .selection-card')];
      const visibleIndex=cards.indexOf(card);
      // Match by label/title rather than relying on visibleIndex after grouping.
      const title=(card.querySelector('h3')?.textContent||'').trim();
      const item=(p.selections||[]).find(i=>String(i.title||'').trim()===title);
      if(item) set.add(item);
    });
    deleteArmed=false;
    try{window.renderSelections?.()}catch{}
  }

  function ensureGroups(p){
    if(!Array.isArray(p.selectionGroups)) p.selectionGroups=[];
    (p.selections||[]).forEach(item=>{
      if(!item.optionGroupId) return;
      if(!p.selectionGroups.some(g=>String(g.id)===String(item.optionGroupId))){
        p.selectionGroups.push({
          id:item.optionGroupId,
          name:item.optionGroupTitle||item.title||'Selection Group'
        });
      }
    });
    return p.selectionGroups;
  }

  function groupId(){
    return 'group-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
  }

  function openDialog(title,bodyHtml,onApply,applyLabel='Apply'){
    document.getElementById('jjBulkDialogV78')?.remove();

    const dialog=document.createElement('dialog');
    dialog.id='jjBulkDialogV78';
    dialog.className='jj-bulk-menu-v78';
    dialog.innerHTML=`
      <div class="jj-bulk-head">
        <div><small>BULK EDIT</small><h3>${esc(title)}</h3></div>
        <button type="button" class="jj-group-icon" data-close aria-label="Close">×</button>
      </div>
      <div class="jj-bulk-body">${bodyHtml}</div>
      <div class="jj-bulk-foot">
        <button type="button" class="btn btn-light" data-close>Cancel</button>
        <button type="button" class="btn btn-gold" id="jjBulkApplyV78">${esc(applyLabel)}</button>
      </div>`;
    document.body.appendChild(dialog);

    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.querySelector('#jjBulkApplyV78').addEventListener('click',()=>{
      if(onApply(dialog)!==false) dialog.close();
    });
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  function bulkStatus(){
    const items=selectedItems();
    if(!items.length) return;

    openDialog(
      `Change Status · ${items.length} selected`,
      `<label>Status
        <select id="jjBulkStatusValueV78">
          <option>Pending</option>
          <option>Recommended</option>
          <option>Selected</option>
        </select>
      </label>
      <div class="jj-bulk-note">This updates only the selected products.</div>`,
      dialog=>{
        const value=dialog.querySelector('#jjBulkStatusValueV78').value;
        items.forEach(item=>{
          item.status=value;
          if(value!=='Selected'){
            item.homeownerSelected=false;
            item.homeownerSelectedAt=null;
          }
        });
        selectedSet().clear();
        saveAndRefresh(`${items.length} selection${items.length===1?'':'s'} changed to ${value}`);
      }
    );
  }

  function bulkGroup(){
    const p=project(),items=selectedItems();
    if(!p||!items.length) return;
    const groups=ensureGroups(p);

    openDialog(
      `Change Group · ${items.length} selected`,
      `<label>Group
        <select id="jjBulkGroupValueV78">
          <option value="">No Group / Standalone</option>
          ${groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}
          <option value="__new__">＋ Create New Group…</option>
        </select>
      </label>
      <div id="jjBulkNewGroupWrapV78" hidden>
        <label>New group name
          <input id="jjBulkNewGroupNameV78" placeholder="Shower Fixtures, Vanity Package…">
        </label>
      </div>
      <div class="jj-bulk-note">Changing the group does not delete or duplicate the products.</div>`,
      dialog=>{
        let value=dialog.querySelector('#jjBulkGroupValueV78').value;
        let group=null;

        if(value==='__new__'){
          const name=dialog.querySelector('#jjBulkNewGroupNameV78').value.trim();
          if(!name){
            dialog.querySelector('#jjBulkNewGroupNameV78').focus();
            return false;
          }
          group=groups.find(g=>g.name.trim().toLowerCase()===name.toLowerCase());
          if(!group){
            group={id:groupId(),name};
            groups.push(group);
          }
          value=group.id;
        }else if(value){
          group=groups.find(g=>String(g.id)===String(value));
        }

        items.forEach(item=>{
          if(!value){
            delete item.optionGroupId;
            delete item.optionGroupTitle;
            delete item.optionLabel;
          }else{
            item.optionGroupId=group.id;
            item.optionGroupTitle=group.name;
            item.optionLabel=item.optionLabel||'Option';
          }
        });

        selectedSet().clear();
        saveAndRefresh(value
          ? `${items.length} selection${items.length===1?'':'s'} moved to ${group.name}`
          : `${items.length} selection${items.length===1?'':'s'} removed from groups`);
      }
    );

    setTimeout(()=>{
      const dialog=document.getElementById('jjBulkDialogV78');
      const select=dialog?.querySelector('#jjBulkGroupValueV78');
      const wrap=dialog?.querySelector('#jjBulkNewGroupWrapV78');
      if(select&&wrap){
        select.addEventListener('change',()=>{
          wrap.hidden=select.value!=='__new__';
          if(!wrap.hidden) dialog.querySelector('#jjBulkNewGroupNameV78')?.focus();
        });
      }
    },0);
  }

  function bulkLeadTime(){
    const items=selectedItems();
    if(!items.length) return;

    openDialog(
      `Change Lead Time · ${items.length} selected`,
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label>Lead time
          <input id="jjBulkLeadValueV78" type="number" min="1" step="1" value="1">
        </label>
        <label>Unit
          <select id="jjBulkLeadUnitV78">
            <option>Day(s)</option>
            <option>Week(s)</option>
            <option>Month(s)</option>
          </select>
        </label>
      </div>
      <label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0">
        <input id="jjBulkInStockV78" type="checkbox" style="width:auto;margin:0">
        Mark selected products In Stock
      </label>
      <div class="jj-bulk-note">If “In Stock” is checked, the cards will show In Stock instead of the lead-time estimate.</div>`,
      dialog=>{
        const value=Math.max(1,Number(dialog.querySelector('#jjBulkLeadValueV78').value||1));
        const unit=dialog.querySelector('#jjBulkLeadUnitV78').value;
        const inStock=dialog.querySelector('#jjBulkInStockV78').checked;

        items.forEach(item=>{
          item.leadTimeValue=value;
          item.leadTimeUnit=unit;
          item.inStock=inStock;
        });

        selectedSet().clear();
        saveAndRefresh(`${items.length} selection${items.length===1?'':'s'} lead time updated`);
      }
    );
  }

  function armDelete(){
    const items=selectedItems();
    if(!items.length) return;
    deleteArmed=true;
    ensureToolbar();
  }

  function cancelDelete(){
    deleteArmed=false;
    ensureToolbar();
  }

  function confirmDelete(){
    const p=project(),items=selectedItems();
    if(!p||!items.length) return;

    // Keep everything not selected. This avoids index/splice mistakes.
    const selected=new Set(items);
    p.selections=(p.selections||[]).filter(item=>!selected.has(item));

    selectedSet().clear();
    deleteArmed=false;
    saveAndRefresh(`${items.length} selection${items.length===1?'':'s'} deleted`);
  }

  function ensureToolbar(){
    const root=document.getElementById('selections');
    if(!root) return;

    // Place bulk actions after the existing selection bulk toolbar / filter area.
    const viewToolbar=root.querySelector('.toolbar[role="group"][aria-label="Selections view"]');
    const insertionPoint=viewToolbar?.previousElementSibling || root.querySelector('.selection-toolbar');
    if(!insertionPoint) return;

    let toolbar=root.querySelector('#jjBulkActionsV78');
    if(!toolbar){
      toolbar=document.createElement('div');
      toolbar.id='jjBulkActionsV78';
      toolbar.className='jj-bulk-actions-v78';
      insertionPoint.insertAdjacentElement('afterend',toolbar);
    }

    const count=selectedItems().length;
    toolbar.innerHTML=`
      <span class="jj-bulk-count">${count} selected</span>
      <button type="button" class="btn btn-light" data-jj-select-visible>Select Visible</button>
      <button type="button" class="btn btn-light" data-jj-clear-selection ${count?'':'disabled'}>Clear</button>
      <span class="jj-bulk-divider"></span>
      <button type="button" class="btn btn-light" data-jj-bulk-status ${count?'':'disabled'}>Status</button>
      <button type="button" class="btn btn-light" data-jj-bulk-group ${count?'':'disabled'}>Group</button>
      <button type="button" class="btn btn-light" data-jj-bulk-lead ${count?'':'disabled'}>Lead Time</button>
      ${deleteArmed&&count
        ? `<button type="button" class="btn jj-confirm-delete" data-jj-confirm-delete>Confirm Delete (${count})</button>
           <button type="button" class="btn btn-light" data-jj-cancel-delete>Cancel</button>`
        : `<button type="button" class="btn jj-danger" data-jj-delete ${count?'':'disabled'}>Delete</button>`
      }`;

    toolbar.querySelector('[data-jj-select-visible]')?.addEventListener('click',selectVisible);
    toolbar.querySelector('[data-jj-clear-selection]')?.addEventListener('click',clearSelection);
    toolbar.querySelector('[data-jj-bulk-status]')?.addEventListener('click',bulkStatus);
    toolbar.querySelector('[data-jj-bulk-group]')?.addEventListener('click',bulkGroup);
    toolbar.querySelector('[data-jj-bulk-lead]')?.addEventListener('click',bulkLeadTime);
    toolbar.querySelector('[data-jj-delete]')?.addEventListener('click',armDelete);
    toolbar.querySelector('[data-jj-confirm-delete]')?.addEventListener('click',confirmDelete);
    toolbar.querySelector('[data-jj-cancel-delete]')?.addEventListener('click',cancelDelete);
  }

  function boot(){
    injectStyles();
    ensureToolbar();

    const root=document.getElementById('selections');
    if(root&&!window.__jjBulkObserverV78){
      const observer=new MutationObserver(()=>setTimeout(ensureToolbar,0));
      observer.observe(root,{childList:true,subtree:true});
      window.__jjBulkObserverV78=observer;
    }

    // Checkbox changes do not always rebuild the whole page, so refresh count
    // immediately after any product checkbox is changed.
    document.addEventListener('change',event=>{
      if(event.target?.matches?.('#selections .selection-card input[type="checkbox"]')){
        deleteArmed=false;
        setTimeout(ensureToolbar,0);
      }
    });

    if(!window.__jjBulkTimerV78){
      window.__jjBulkTimerV78=setInterval(()=>{
        if(!document.hidden) ensureToolbar();
      },900);
    }
  }

  window.JJSelectionBulkV78={
    status:bulkStatus,
    group:bulkGroup,
    leadTime:bulkLeadTime,
    delete:armDelete,
    confirmDelete,
    clear:clearSelection
  };

  if(document.readyState==='complete') setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();


/* -------------------------------------------------------------------------
   J&J Smart Selection PDF Import v79
   Built around the actual J&J PDF layouts:
   - 3-column comparison sheets (Alyssa / Ashley style)
   - vertical product-card sheets (Adam / Tracey style)
   Pulls: product photo crop, all product links, Model/SKU/UPC/Internet/Item IDs,
   price, budget, vendor, description, selection status, and option group.
   SAFETY:
   - Rejects unrelated/non-J&J-selection PDFs.
   - Review-first only; nothing imports until confirmed.
   - Never deletes/replaces existing selections.
   - Dedupes within the upload and against the current project.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjSmartPdfImportV79) return;
  window.__jjSmartPdfImportV79 = true;

  const PDFJS_SRC='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const STYLE_ID='jj-smart-pdf-import-v79';

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #jjUploadSelectionPdfV76{display:none!important}
      .jj-smart-upload-help{
        margin:-4px 0 12px;color:#667386;font-size:10px;line-height:1.4
      }
      .jj-v79-review{
        width:min(1100px,calc(100% - 20px));max-height:92dvh;border:0;border-radius:16px;
        padding:0;color:#202633;box-shadow:0 24px 70px rgba(12,28,45,.35)
      }
      .jj-v79-review::backdrop{background:rgba(7,18,31,.6)}
      .jj-v79-head,.jj-v79-foot{
        position:sticky;z-index:4;display:flex;align-items:center;justify-content:space-between;
        gap:12px;padding:15px 17px;background:#fff
      }
      .jj-v79-head{top:0;border-bottom:1px solid #E2E6EC}
      .jj-v79-foot{bottom:0;border-top:1px solid #E2E6EC;justify-content:flex-end;flex-wrap:wrap}
      .jj-v79-head small{display:block;color:#B59A62;font-size:9px;font-weight:950;letter-spacing:.9px}
      .jj-v79-head h3{margin:2px 0 0;color:#14234A}
      .jj-v79-body{padding:16px;background:#F6F8FA;overflow:auto}
      .jj-v79-file-report{display:grid;gap:8px;margin-bottom:12px}
      .jj-v79-file-row{
        display:flex;justify-content:space-between;gap:12px;align-items:center;
        padding:9px 11px;border:1px solid #DCE2E9;border-radius:9px;background:#fff;font-size:11px
      }
      .jj-v79-file-row strong{color:#14234A}
      .jj-v79-file-row.good span{color:#246441;font-weight:850}
      .jj-v79-file-row.skip span{color:#A43A2A;font-weight:850}
      .jj-v79-summary{
        display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:11px 13px;
        border:1px solid #DCE2E9;border-radius:10px;background:#fff;color:#596779;font-size:11px
      }
      .jj-v79-summary b{color:#14234A}
      .jj-v79-safety{
        width:100%;padding-top:4px;color:#246441;font-weight:850
      }
      .jj-v79-list{display:grid;gap:10px}
      .jj-v79-item{
        display:grid;grid-template-columns:auto 105px minmax(0,1fr);gap:11px;
        padding:12px;border:1px solid #DCE2E9;border-radius:12px;background:#fff
      }
      .jj-v79-item.duplicate{opacity:.62;background:#FAFAFA}
      .jj-v79-item.review{border-style:dashed;background:#FFFDF7}
      .jj-v79-check input{width:18px;height:18px;margin-top:4px}
      .jj-v79-photo{
        width:105px;height:92px;object-fit:contain;border:1px solid #E1E6EC;border-radius:8px;background:#fff
      }
      .jj-v79-photo-empty{
        display:grid;place-items:center;width:105px;height:92px;border:1px dashed #D0D7E0;border-radius:8px;
        color:#8A95A2;font-size:9px;text-align:center
      }
      .jj-v79-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:7px}
      .jj-v79-title strong{color:#14234A;font-size:13px}
      .jj-v79-chip{
        display:inline-flex;padding:4px 7px;border-radius:999px;background:#EEF3F7;color:#536174;
        font-size:9px;font-weight:850
      }
      .jj-v79-chip.good{background:#EAF5EE;color:#246441}
      .jj-v79-chip.warn{background:#FFF1D9;color:#865E0A}
      .jj-v79-grid{display:grid;grid-template-columns:1.35fr .8fr .9fr .85fr;gap:8px}
      .jj-v79-grid label{font-size:9px;font-weight:850;color:#667386;text-transform:uppercase;letter-spacing:.4px}
      .jj-v79-grid input,.jj-v79-grid select{
        width:100%;margin-top:4px;padding:8px 9px;border:1px solid #C9D1DB;border-radius:7px;
        background:#fff;color:#202633;font-size:11px;text-transform:none;letter-spacing:0
      }
      .jj-v79-meta{margin-top:7px;color:#6B7787;font-size:10px;line-height:1.45}
      .jj-v79-progress{
        position:fixed;z-index:99999;left:50%;top:50%;transform:translate(-50%,-50%);
        width:min(460px,calc(100% - 30px));padding:18px;border-radius:14px;background:#14234A;color:#fff;
        box-shadow:0 20px 65px rgba(0,0,0,.35);font-size:12px
      }
      .jj-v79-progress b{display:block;margin-bottom:6px;font-size:14px}
      .jj-v79-extra-links{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}
      .jj-v79-extra-links a{font-size:10px!important}
      @media(max-width:760px){
        .jj-v79-item{grid-template-columns:auto 80px minmax(0,1fr)}
        .jj-v79-photo,.jj-v79-photo-empty{width:80px;height:76px}
        .jj-v79-grid{grid-template-columns:1fr 1fr}
      }
      @media(max-width:520px){
        .jj-v79-item{grid-template-columns:auto minmax(0,1fr)}
        .jj-v79-photo,.jj-v79-photo-empty{grid-column:2;width:100%;height:150px}
        .jj-v79-main{grid-column:1/-1}
        .jj-v79-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function currentProject(){
    try{return typeof window.selectedProject==='function'?window.selectedProject():null}catch{return null}
  }

  function loadPdfJs(){
    if(window.pdfjsLib){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
      return Promise.resolve(window.pdfjsLib);
    }
    if(window.__jjV79PdfPromise)return window.__jjV79PdfPromise;
    window.__jjV79PdfPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=PDFJS_SRC;
      script.async=true;
      script.onload=()=>{
        if(!window.pdfjsLib){reject(new Error('PDF reader did not load'));return}
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      script.onerror=()=>reject(new Error('PDF reader could not load. Check your connection.'));
      document.head.appendChild(script);
    });
    return window.__jjV79PdfPromise;
  }

  function ensureInput(){
    let input=document.getElementById('jjSmartPdfInputV79');
    if(input)return input;
    input=document.createElement('input');
    input.id='jjSmartPdfInputV79';
    input.type='file';
    input.accept='application/pdf,.pdf';
    input.multiple=true;
    input.hidden=true;
    input.addEventListener('change',async()=>{
      const files=[...input.files||[]];
      input.value='';
      if(files.length)await parseFiles(files);
    });
    document.body.appendChild(input);
    return input;
  }

  function ensureButton(){
    const root=document.getElementById('selections');
    if(!root)return;
    const actions=root.querySelector('.jj-selection-top-actions');
    if(!actions)return;

    if(!actions.querySelector('#jjSmartPdfUploadV79')){
      const btn=document.createElement('button');
      btn.id='jjSmartPdfUploadV79';
      btn.type='button';
      btn.className='btn btn-light';
      btn.textContent='Upload File';
      btn.title='Upload J&J selections PDF(s), review detected products, then import';
      btn.addEventListener('click',()=>ensureInput().click());
      actions.appendChild(btn);

      const help=document.createElement('div');
      help.className='jj-smart-upload-help';
      help.textContent='PDF import: Upload → automatic reading → review every product → Import Selected. Existing selections are never replaced.';
      actions.insertAdjacentElement('afterend',help);
    }
  }

  function showProgress(text){
    let box=document.getElementById('jjV79Progress');
    if(!box){
      box=document.createElement('div');
      box.id='jjV79Progress';
      box.className='jj-v79-progress';
      box.innerHTML='<b>Reading selections PDF</b><span></span>';
      document.body.appendChild(box);
    }
    box.querySelector('span').textContent=text;
  }

  function hideProgress(){
    document.getElementById('jjV79Progress')?.remove();
  }

  function textItemRect(item,viewport){
    const t=item.transform||[1,0,0,1,0,0];
    const [vx,vy]=viewport.convertToViewportPoint(Number(t[4]||0),Number(t[5]||0));
    const fontH=Math.max(5,Math.abs(Number(item.height||t[3]||8))*viewport.scale);
    const width=Math.max(1,Number(item.width||0)*viewport.scale);
    return {
      text:clean(item.str),
      x:vx,
      y:vy-fontH,
      w:width,
      h:fontH,
      right:vx+width,
      bottom:vy
    };
  }

  function annotationRect(annotation,viewport){
    if(!Array.isArray(annotation.rect)||annotation.rect.length<4)return null;
    const r=viewport.convertToViewportRectangle(annotation.rect);
    const x=Math.min(r[0],r[2]),y=Math.min(r[1],r[3]);
    return {
      x,y,w:Math.abs(r[2]-r[0]),h:Math.abs(r[3]-r[1]),
      right:Math.max(r[0],r[2]),bottom:Math.max(r[1],r[3]),
      url:clean(annotation.url||annotation.unsafeUrl||'')
    };
  }

  function nearbyText(rect,texts,maxDistance=28){
    let best=null,bestDistance=Infinity;
    for(const item of texts){
      const dx=Math.max(0,Math.max(item.x-rect.right,rect.x-item.right));
      const dy=Math.max(0,Math.max(item.y-rect.bottom,rect.y-item.bottom));
      const d=Math.hypot(dx,dy);
      if(d<bestDistance){best=item;bestDistance=d}
    }
    return bestDistance<=maxDistance?best:null;
  }

  function validProductLinks(annotations,texts,viewport){
    return (annotations||[])
      .map(a=>annotationRect(a,viewport))
      .filter(Boolean)
      .filter(link=>/^https?:\/\//i.test(link.url))
      .map(link=>{
        const near=nearbyText(link,texts,34);
        return {...link,label:clean(near?.text||'VIEW PRODUCT')};
      })
      .filter(link=>/VIEW\s+(PRODUCT|TRIM|ROUGH|ROUGH-IN)/i.test(link.label));
  }

  function pageIsJJSelections(text){
    const s=norm(text);
    return /j j home renovations/.test(s) &&
      /(selection|bathroom|fixture|vanity|shower|toilet|flooring|door|lighting)/.test(s);
  }

  function clusterByY(links,tolerance=18){
    const clusters=[];
    [...links].sort((a,b)=>a.y-b.y).forEach(link=>{
      let cluster=clusters.find(c=>Math.abs(c.y-link.y)<=tolerance);
      if(!cluster){
        cluster={y:link.y,links:[]};
        clusters.push(cluster);
      }
      cluster.links.push(link);
      cluster.y=cluster.links.reduce((s,l)=>s+l.y,0)/cluster.links.length;
    });
    return clusters.sort((a,b)=>a.y-b.y);
  }

  function isHeadingText(text){
    const s=clean(text);
    if(!s||s.length>50)return false;
    if(/J\s*&\s*J|HOME RENOVATIONS|BATHROOM SELECTIONS|\d+\s+OF\s+\d+/i.test(s))return false;
    return /^[A-Z0-9 &/+.-]+$/.test(s) &&
      /(TOILET|SHOWER|VANITY|FAUCET|LIGHT|ENCLOSURE|DOOR|FLOOR|TILE|MIRROR|FAN|HARDWARE|CROWN|BASEBOARD|CASING|RAIN HEAD|ARM|FIXTURE|VALVE)/i.test(s);
  }

  function headingAbove(texts,y,maxGap=95){
    const candidates=texts.filter(t=>t.bottom<y && y-t.bottom<=maxGap && isHeadingText(t.text));
    return candidates.sort((a,b)=>b.bottom-a.bottom)[0]||null;
  }

  function groupNameFromHeading(value){
    let s=clean(value)
      .replace(/\s*-\s*OPTION\s*\d+.*$/i,'')
      .replace(/\s+OPTION\s*\d+.*$/i,'')
      .replace(/\s*\(HEAD ONLY\)\s*$/i,'')
      .trim();
    return s.replace(/\b\w/g,c=>c.toUpperCase());
  }

  function linesInRegion(texts,region){
    const chosen=texts.filter(t=>{
      const cx=t.x+t.w/2,cy=t.y+t.h/2;
      return cx>=region.x && cx<=region.right && cy>=region.y && cy<=region.bottom;
    });

    const rows=[];
    chosen.sort((a,b)=>Math.abs(a.y-b.y)>3?a.y-b.y:a.x-b.x).forEach(item=>{
      let row=rows.find(r=>Math.abs(r.y-item.y)<=3.5);
      if(!row){row={y:item.y,items:[]};rows.push(row)}
      row.items.push(item);
    });

    return rows.sort((a,b)=>a.y-b.y).map(row=>({
      y:row.y,
      text:clean(row.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' '))
    })).filter(r=>r.text);
  }

  function metadata(blockText){
    const get=re=>{
      const m=blockText.match(re);
      return clean(m?.[1]||'');
    };
    const priceRaw=
      get(/\bPRICE\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i) ||
      get(/\$\s*([0-9,]+(?:\.\d{1,2})?)\s+CURRENT PRICE/i) ||
      get(/\bCURRENT PRICE\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i) ||
      get(/\bADDITIONAL COST\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i);

    const budgetRaw=get(/\bBUDGET\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const model=get(/\bModels?\s+([A-Za-z0-9._/-]+(?:\s*\+\s*[A-Za-z0-9._/-]+)?)/i);
    const storeSku=get(/\bStore\s*SKU\s*#?\s*([A-Za-z0-9._/-]+)/i);
    const upc=get(/\bUPC(?:\s*Code)?\s*#?\s*([A-Za-z0-9._/-]+)/i);
    const internet=get(/\bInternet\s*#?\s*([A-Za-z0-9._/-]+)/i);
    const itemId=get(/\bItem\s*#?\s*([A-Za-z0-9._/-]+)/i);
    const vendor=get(/\bVendor\s*:\s*([A-Za-z0-9 '&.+-]+?)(?=\s+(?:Store|Internet|Item|Model|UPC|BUDGET|PRICE|CURRENT|AT BUDGET|OVER BUDGET|VIEW)|$)/i);

    return {
      price:priceRaw?Number(priceRaw.replace(/,/g,'')):null,
      budget:budgetRaw?Number(budgetRaw.replace(/,/g,'')):null,
      model,storeSku,upc,internet,itemId,vendor
    };
  }

  function inferStatus(blockText){
    if(/CURRENT SELECTION/i.test(blockText))return 'Selected';
    if(/\bRECOMMENDED\b/i.test(blockText))return 'Recommended';
    return 'Recommended';
  }

  function categoryFromHeading(heading,title){
    const s=(heading+' '+title).toLowerCase();
    if(/toilet|faucet|shower|valve|rain head|arm|plumbing/.test(s))return 'Plumbing';
    if(/vanity/.test(s)&&!/light|faucet/.test(s))return 'Vanity';
    if(/light|fan|electrical/.test(s))return 'Electrical';
    if(/mirror/.test(s))return 'Mirror';
    if(/floor|tile/.test(s))return 'Flooring / Tile';
    if(/door|hardware|casing|baseboard|crown/.test(s))return 'Doors / Trim';
    return groupNameFromHeading(heading)||'Selection';
  }

  function cleanDescription(lines,title){
    return lines
      .map(r=>r.text)
      .filter(s=>
        clean(s)!==clean(title) &&
        !isHeadingText(s) &&
        !/^VIEW\s+/i.test(s) &&
        !/\bVendor\s*:/i.test(s) &&
        !/\b(?:Store SKU|UPC|Internet|Item|Model)\s*#?/i.test(s) &&
        !/^(BUDGET|PRICE|CURRENT PRICE|CURRENT SELECTION|AT BUDGET|OVER BUDGET|PRICE PENDING|WILL NOT MATCH)/i.test(s)
      )
      .join(' | ')
      .replace(/\s*\|\s*\|\s*/g,' | ')
      .trim();
  }

  function titleFromLines(lines,heading,layout){
    const filtered=lines.filter(row=>{
      const s=row.text;
      if(!s||/^VIEW\s+/i.test(s)||isHeadingText(s))return false;
      if(/\b(BUDGET|PRICE|CURRENT PRICE|CURRENT SELECTION|AT BUDGET|OVER BUDGET|Vendor:|Store SKU|UPC|Internet|Item #|Model)\b/i.test(s))return false;
      if(/J\s*&\s*J|HOME RENOVATIONS|BATHROOM SELECTIONS/i.test(s))return false;
      return true;
    });
    if(!filtered.length)return '';
    // Product titles in both J&J layouts are the first meaningful text line/card block.
    return clean(filtered[0].text);
  }

  function cardLinksForRegion(allLinks,region){
    return allLinks.filter(link=>{
      const cx=link.x+link.w/2,cy=link.y+link.h/2;
      return cx>=region.x && cx<=region.right && cy>=region.y && cy<=region.bottom;
    });
  }

  function nearestTitleX(texts,region,title){
    const t=texts.find(item=>{
      const cx=item.x+item.w/2,cy=item.y+item.h/2;
      return cx>=region.x&&cx<=region.right&&cy>=region.y&&cy<=region.bottom &&
        norm(item.text)===norm(title);
    });
    return t?.x ?? null;
  }

  function imageDataFromRegion(pageCanvas,region,titleX,layout){
    const scaleX=pageCanvas.width/region.pageWidth;
    const scaleY=pageCanvas.height/region.pageHeight;

    let crop={x:region.x,y:region.y,w:region.w,h:region.h};

    if(layout==='grid'){
      // Image is above the product title. Find a conservative upper-card crop.
      const titleY=region.titleY||region.y+region.h*.46;
      crop={
        x:region.x+7,
        y:region.y+5,
        w:Math.max(30,region.w-14),
        h:Math.max(30,titleY-region.y-8)
      };
    }else{
      // Horizontal cards place the photo to the left of the text column.
      const right=Math.max(region.x+50,(titleX||region.x+region.w*.33)-12);
      crop={
        x:region.x+8,
        y:region.y+7,
        w:Math.max(30,right-region.x-14),
        h:Math.max(30,region.h-14)
      };
    }

    const sx=Math.max(0,Math.floor(crop.x*scaleX));
    const sy=Math.max(0,Math.floor(crop.y*scaleY));
    const sw=Math.min(pageCanvas.width-sx,Math.max(1,Math.floor(crop.w*scaleX)));
    const sh=Math.min(pageCanvas.height-sy,Math.max(1,Math.floor(crop.h*scaleY)));

    if(sw<30||sh<30)return '';

    const maxW=460,maxH=320;
    const ratio=Math.min(1,maxW/sw,maxH/sh);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(sw*ratio));
    canvas.height=Math.max(1,Math.round(sh*ratio));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(pageCanvas,sx,sy,sw,sh,0,0,canvas.width,canvas.height);

    try{return canvas.toDataURL('image/jpeg',.78)}catch{return ''}
  }

  async function renderPage(page,viewport){
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);
    canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    return canvas;
  }

  async function parsePage(page,fileName,pageNumber,project){
    const viewport=page.getViewport({scale:1.6});
    const [textContent,annotations]=await Promise.all([
      page.getTextContent(),
      page.getAnnotations({intent:'display'}).catch(()=>[])
    ]);

    const texts=(textContent.items||[])
      .map(item=>textItemRect(item,viewport))
      .filter(item=>item.text);
    const pageText=texts.map(t=>t.text).join(' ');

    if(!pageIsJJSelections(pageText))return {accepted:false,items:[]};

    const allLinks=validProductLinks(annotations,texts,viewport);
    if(!allLinks.length)return {accepted:true,items:[]};

    const rows=clusterByY(allLinks,22);
    const denseRows=rows.filter(row=>row.links.length>=2).length;
    const layout=denseRows>=Math.ceil(rows.length/2)?'grid':'horizontal';

    const canvas=await renderPage(page,viewport);
    const items=[];

    if(layout==='grid'){
      for(const row of rows){
        if(row.links.length<2)continue; // filters stray duplicate hyperlink rows
        const sorted=[...row.links].sort((a,b)=>a.x-b.x);

        for(let i=0;i<sorted.length;i++){
          const link=sorted[i];
          const heading=headingAbove(texts,link.y,130);
          const left=Math.max(0,link.x-8);
          const right=i<sorted.length-1?Math.max(left+80,sorted[i+1].x-12):viewport.width-38;
          const top=heading?heading.bottom+14:Math.max(0,link.y-245);
          const bottom=Math.min(viewport.height,link.bottom+18);
          const region={x:left,y:top,right,bottom,w:right-left,h:bottom-top,pageWidth:viewport.width,pageHeight:viewport.height};

          const lines=linesInRegion(texts,region);
          const headingText=heading?.text||'Selection';
          const title=titleFromLines(lines,headingText,layout);
          if(!title)continue;

          const titleItem=texts.find(t=>
            t.x>=region.x&&t.x<=region.right&&t.y>=region.y&&t.y<=region.bottom&&
            norm(t.text)===norm(title)
          );
          region.titleY=titleItem?.y||region.y+region.h*.46;

          const blockText=lines.map(r=>r.text).join(' ');
          const meta=metadata(blockText);
          const links=cardLinksForRegion(allLinks,region);
          const group=groupNameFromHeading(headingText);

          items.push(makeCandidate({
            fileName,pageNumber,project,headingText,title,lines,blockText,meta,links,group,
            image:imageDataFromRegion(canvas,region,titleItem?.x,layout)
          }));
        }
      }
    }else{
      // Each link row corresponds to one vertical product card. Multiple links
      // on the same y row remain attached to the same selection.
      const rowCenters=rows.map(r=>r.y);

      for(let r=0;r<rows.length;r++){
        const row=rows[r];
        const y=row.y;
        const previous=rowCenters[r-1];
        const next=rowCenters[r+1];
        const top=r===0?Math.max(95,y-125):(previous+y)/2+6;
        const bottom=r===rows.length-1?Math.min(viewport.height,y+38):(y+next)/2-6;

        // Use almost full page width; the header above is excluded by vertical bounds.
        const region={x:38,y:top,right:viewport.width-38,bottom,w:viewport.width-76,h:bottom-top,pageWidth:viewport.width,pageHeight:viewport.height};
        const lines=linesInRegion(texts,region);

        // Product label is the first all-caps selection heading within this card.
        const headingRow=lines.find(line=>isHeadingText(line.text));
        const headingText=headingRow?.text||'Selection';
        const title=titleFromLines(lines,headingText,layout);
        if(!title)continue;

        const titleItem=texts.find(t=>
          t.x>=region.x&&t.x<=region.right&&t.y>=region.y&&t.y<=region.bottom&&
          norm(t.text)===norm(title)
        );
        const blockText=lines.map(r=>r.text).join(' ');
        const meta=metadata(blockText);
        const group=/OPTION\s*\d+/i.test(headingText)?groupNameFromHeading(headingText):'';
        const links=cardLinksForRegion(allLinks,region);

        items.push(makeCandidate({
          fileName,pageNumber,project,headingText,title,lines,blockText,meta,links,group,
          image:imageDataFromRegion(canvas,region,titleItem?.x,layout)
        }));
      }
    }

    return {accepted:true,items};
  }

  function makeCandidate({fileName,pageNumber,project,headingText,title,lines,blockText,meta,links,group,image}){
    const primary=links[0]?.url||'';
    const additional=links.slice(1).map((link,index)=>({
      label:/ROUGH/i.test(link.label)?'View Rough-In':/TRIM/i.test(link.label)?'View Trim':`View Product ${index+2}`,
      url:link.url
    }));

    const identifiers=[
      meta.model?`Model ${meta.model}`:'',
      meta.storeSku?`Store SKU ${meta.storeSku}`:'',
      meta.upc?`UPC ${meta.upc}`:'',
      meta.internet?`Internet #${meta.internet}`:'',
      meta.itemId?`Item #${meta.itemId}`:''
    ].filter(Boolean);

    const notes=[
      identifiers.length?identifiers.join(' · '):'',
      meta.budget!==null?`PDF Budget: $${meta.budget.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}`:'',
      `Imported from PDF: ${fileName} · page ${pageNumber}`
    ].filter(Boolean).join('\n');

    return {
      sourceFile:fileName,
      sourcePage:pageNumber,
      label:headingText,
      title:clean(title),
      room:project?.selectionActiveRoom||project?.selectionRooms?.[0]||'Primary Bathroom',
      category:categoryFromHeading(headingText,title),
      group,
      vendor:meta.vendor||'',
      model:meta.model||meta.storeSku||meta.upc||meta.internet||meta.itemId||'',
      identifiers:{
        model:meta.model||'',
        storeSku:meta.storeSku||'',
        upc:meta.upc||'',
        internet:meta.internet||'',
        itemId:meta.itemId||''
      },
      description:cleanDescription(lines,title),
      notes,
      status:inferStatus(blockText),
      purchasedBy:'',
      unitPrice:meta.price,
      budget:meta.budget,
      url:primary,
      additionalLinks:additional,
      image:image||''
    };
  }

  function fingerprint(item){
    if(item.identifiers?.model)return 'model|'+norm(item.identifiers.model);
    if(item.identifiers?.storeSku)return 'sku|'+norm(item.identifiers.storeSku);
    if(item.identifiers?.upc)return 'upc|'+norm(item.identifiers.upc);
    if(item.url)return 'url|'+clean(item.url).toLowerCase();
    return 'title|'+norm(item.title)+'|'+norm(item.vendor)+'|'+norm(item.room);
  }

  async function parseFiles(files){
    const project=currentProject();
    if(!project){window.toast?.('Open a project first');return}

    const pdfjs=await loadPdfJs();
    const all=[];
    const report=[];

    try{
      for(let f=0;f<files.length;f++){
        const file=files[f];
        showProgress(`${file.name} · opening ${f+1} of ${files.length}`);
        const bytes=new Uint8Array(await file.arrayBuffer());
        const pdf=await pdfjs.getDocument({data:bytes}).promise;

        let acceptedPages=0;
        let fileItems=[];

        for(let p=1;p<=pdf.numPages;p++){
          showProgress(`${file.name} · reading page ${p} of ${pdf.numPages}`);
          const page=await pdf.getPage(p);
          const result=await parsePage(page,file.name,p,project);
          if(result.accepted)acceptedPages++;
          fileItems.push(...result.items);
        }

        if(!acceptedPages){
          report.push({name:file.name,status:'Skipped — not recognized as a J&J selections PDF',accepted:false,count:0});
        }else{
          all.push(...fileItems);
          report.push({name:file.name,status:`Read ${fileItems.length} product${fileItems.length===1?'':'s'}`,accepted:true,count:fileItems.length});
        }
      }
    }catch(err){
      console.error('Smart PDF import failed',err);
      hideProgress();
      alert(`PDF import stopped.\n\n${err?.message||'Please try again.'}`);
      return;
    }

    hideProgress();

    const existing=new Set((project.selections||[]).map(item=>{
      const identifiers={
        model:item.identifiers?.model||item.model||'',
        storeSku:item.identifiers?.storeSku||'',
        upc:item.identifiers?.upc||'',
        internet:item.identifiers?.internet||'',
        itemId:item.identifiers?.itemId||''
      };
      return fingerprint({...item,identifiers});
    }));

    const seen=new Set();
    all.forEach(item=>{
      const key=fingerprint(item);
      item.duplicateExisting=existing.has(key);
      item.duplicateUpload=seen.has(key);
      item.duplicate=item.duplicateExisting||item.duplicateUpload;
      seen.add(key);
    });

    openReview(all,files,report);
  }

  function statusOptions(current){
    return ['Pending','Recommended','Selected']
      .map(v=>`<option ${v===current?'selected':''}>${v}</option>`).join('');
  }

  function roomOptions(project,current){
    const rooms=[...(project.selectionRooms||[])];
    if(current&&!rooms.includes(current))rooms.push(current);
    return rooms.map(v=>`<option ${v===current?'selected':''}>${esc(v)}</option>`).join('');
  }

  function purchasedOptions(current){
    return ['','J&J','Homeowner'].map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${v||'Not assigned'}</option>`).join('');
  }

  function openReview(items,files,report){
    document.getElementById('jjV79Review')?.remove();
    const project=currentProject();
    const unique=items.filter(i=>!i.duplicate);

    const dialog=document.createElement('dialog');
    dialog.id='jjV79Review';
    dialog.className='jj-v79-review';

    dialog.innerHTML=`
      <div class="jj-v79-head">
        <div><small>SMART PDF IMPORT</small><h3>Review Everything Before Import</h3></div>
        <button type="button" class="jj-group-icon" data-close aria-label="Close">×</button>
      </div>
      <div class="jj-v79-body">
        <div class="jj-v79-file-report">
          ${report.map(file=>`<div class="jj-v79-file-row ${file.accepted?'good':'skip'}">
            <strong>${esc(file.name)}</strong><span>${esc(file.status)}</span>
          </div>`).join('')}
        </div>

        <div class="jj-v79-summary">
          <span><b>${items.length}</b> products detected</span>
          <span><b>${unique.length}</b> ready to review/import</span>
          <span><b>${items.filter(i=>i.duplicate).length}</b> duplicates skipped</span>
          <span><b>${items.filter(i=>i.image).length}</b> photos captured</span>
          <span><b>${items.filter(i=>i.url).length}</b> product links captured</span>
          <div class="jj-v79-safety">Nothing has been added yet. Only checked rows are appended when you press Import Selected.</div>
        </div>

        ${items.length?`<div class="jj-v79-list">
          ${items.map((item,index)=>`
            <section class="jj-v79-item ${item.duplicate?'duplicate':''}" data-v79-row="${index}">
              <div class="jj-v79-check"><input type="checkbox" data-v79-check="${index}" ${item.duplicate?'':'checked'}></div>
              <div>${item.image?`<img class="jj-v79-photo" src="${esc(item.image)}" alt="">`:'<div class="jj-v79-photo-empty">No photo detected</div>'}</div>
              <div class="jj-v79-main">
                <div class="jj-v79-title">
                  <strong>${esc(item.title)}</strong>
                  <span class="jj-v79-chip">${esc(item.sourceFile)} · p.${item.sourcePage}</span>
                  ${item.group?`<span class="jj-v79-chip">Group: ${esc(item.group)}</span>`:''}
                  ${item.duplicate?'<span class="jj-v79-chip warn">Duplicate — unchecked</span>':'<span class="jj-v79-chip good">Ready</span>'}
                </div>
                <div class="jj-v79-grid">
                  <label>Product name<input data-v79-title="${index}" value="${esc(item.title)}"></label>
                  <label>Room<select data-v79-room="${index}">${roomOptions(project,item.room)}</select></label>
                  <label>Category<input data-v79-category="${index}" value="${esc(item.category)}"></label>
                  <label>Status<select data-v79-status="${index}">${statusOptions(item.status)}</select></label>
                  <label>Group<input data-v79-group="${index}" value="${esc(item.group)}" placeholder="Standalone"></label>
                  <label>Purchased by<select data-v79-purchased="${index}">${purchasedOptions(item.purchasedBy)}</select></label>
                  <label>Vendor<input data-v79-vendor="${index}" value="${esc(item.vendor)}"></label>
                  <label>Model / SKU<input data-v79-model="${index}" value="${esc(item.model)}"></label>
                  <label>Price<input data-v79-price="${index}" type="number" step=".01" min="0" value="${item.unitPrice===null?'':item.unitPrice}"></label>
                </div>
                <div class="jj-v79-meta">
                  ${item.identifiers.model?`Model ${esc(item.identifiers.model)} · `:''}
                  ${item.identifiers.storeSku?`SKU ${esc(item.identifiers.storeSku)} · `:''}
                  ${item.identifiers.upc?`UPC ${esc(item.identifiers.upc)} · `:''}
                  ${item.identifiers.internet?`Internet #${esc(item.identifiers.internet)} · `:''}
                  ${item.identifiers.itemId?`Item #${esc(item.identifiers.itemId)} · `:''}
                  ${item.url?`${item.additionalLinks.length+1} link${item.additionalLinks.length?'s':''} captured · `:''}
                  ${item.budget!==null?`Budget $${item.budget.toLocaleString('en-US')} · `:''}
                  ${esc(item.description||'')}
                </div>
              </div>
            </section>`).join('')}
        </div>`:`<div class="jj-pdf-import-empty"><strong>No selection products detected.</strong><span>Unrelated PDFs are skipped instead of creating bad selections.</span></div>`}
      </div>
      <div class="jj-v79-foot">
        <button type="button" class="btn btn-light" data-close>Cancel</button>
        ${items.length?'<button type="button" class="btn btn-gold" id="jjV79ImportSelected">Import Selected</button>':''}
      </div>`;

    document.body.appendChild(dialog);
    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('#jjV79ImportSelected')?.addEventListener('click',()=>importSelected(dialog,items,files));
    dialog.showModal();
  }

  function ensureGroup(project,name){
    name=clean(name);
    if(!name)return null;
    if(!Array.isArray(project.selectionGroups))project.selectionGroups=[];
    let group=project.selectionGroups.find(g=>norm(g.name)===norm(name));
    if(!group){
      group={id:'group-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),name};
      project.selectionGroups.push(group);
    }
    return group;
  }

  function importSelected(dialog,items,files){
    const project=currentProject();
    if(!project)return;
    if(!Array.isArray(project.selections))project.selections=[];
    if(!Array.isArray(project.selectionRooms))project.selectionRooms=[];
    if(!Array.isArray(project.selectionImports))project.selectionImports=[];

    const added=[];
    items.forEach((item,index)=>{
      if(!dialog.querySelector(`[data-v79-check="${index}"]`)?.checked)return;

      const title=clean(dialog.querySelector(`[data-v79-title="${index}"]`)?.value);
      if(!title)return;

      const room=clean(dialog.querySelector(`[data-v79-room="${index}"]`)?.value)||project.selectionRooms[0]||'Primary Bathroom';
      const category=clean(dialog.querySelector(`[data-v79-category="${index}"]`)?.value)||'Selection';
      const status=clean(dialog.querySelector(`[data-v79-status="${index}"]`)?.value)||'Recommended';
      const groupName=clean(dialog.querySelector(`[data-v79-group="${index}"]`)?.value);
      const purchasedBy=clean(dialog.querySelector(`[data-v79-purchased="${index}"]`)?.value);
      const vendor=clean(dialog.querySelector(`[data-v79-vendor="${index}"]`)?.value);
      const model=clean(dialog.querySelector(`[data-v79-model="${index}"]`)?.value);
      const rawPrice=dialog.querySelector(`[data-v79-price="${index}"]`)?.value;
      const unitPrice=rawPrice===''?null:Number(rawPrice);

      if(!project.selectionRooms.includes(room))project.selectionRooms.push(room);
      const group=ensureGroup(project,groupName);

      added.push({
        id:Date.now()+added.length+Math.floor(Math.random()*1000),
        url:item.url||'',
        additionalLinks:item.additionalLinks||[],
        title,
        vendor,
        category,
        room,
        quality:'Standard',
        model,
        identifiers:item.identifiers||{},
        budget:item.budget,
        image:item.image||'',
        unitPrice:Number.isFinite(unitPrice)?unitPrice:null,
        quantity:1,
        addTax:false,
        purchasedBy,
        optionLabel:group?'PDF Option':undefined,
        optionGroupId:group?.id,
        optionGroupTitle:group?.name,
        status,
        homeownerSelected:false,
        homeownerSelectedAt:null,
        inStock:false,
        leadTimeValue:1,
        leadTimeUnit:'Day(s)',
        description:item.description||'',
        notes:item.notes||''
      });
    });

    if(!added.length){
      window.toast?.('Choose at least one product to import');
      return;
    }

    project.selections.push(...added);
    project.selectionImports.push({
      id:'pdf-import-'+Date.now(),
      importedAt:new Date().toISOString(),
      files:files.map(f=>f.name),
      count:added.length,
      importer:'v79-smart'
    });

    try{window.JJSelectionRecovery?.snapshot?.()}catch{}
    try{window.saveState?.(false)}catch{}
    try{window.renderAll?.()}catch{}
    try{window.go?.('selections')}catch{}
    dialog.close();
    window.toast?.(`${added.length} selection${added.length===1?'':'s'} imported`);
  }

  function patchCardLinks(){
    if(typeof window.selectionCard!=='function'||window.selectionCard.__v79)return;
    const original=window.selectionCard;
    const wrapped=function(item,index){
      let html=original(item,index);
      if(!Array.isArray(item?.additionalLinks)||!item.additionalLinks.length)return html;

      const extra=`<div class="jj-v79-extra-links">${item.additionalLinks
        .filter(link=>/^https?:\/\//i.test(link.url||''))
        .map(link=>`<a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label||'View product')} ↗</a>`)
        .join('')}</div>`;

      // Put additional links near the normal product actions.
      html=html.replace(/(<div class="selection-card-actions">)/,`$1${extra}`);
      return html;
    };
    wrapped.__v79=true;
    window.selectionCard=wrapped;
  }

  function boot(){
    injectStyles();
    ensureInput();
    ensureButton();
    patchCardLinks();

    const root=document.getElementById('selections');
    if(root&&!window.__jjV79Observer){
      const observer=new MutationObserver(()=>setTimeout(()=>{
        ensureButton();
        patchCardLinks();
      },0));
      observer.observe(root,{childList:true,subtree:true});
      window.__jjV79Observer=observer;
    }

    if(!window.__jjV79Timer){
      window.__jjV79Timer=setInterval(()=>{
        if(!document.hidden){
          ensureButton();
          patchCardLinks();
        }
      },900);
    }
  }

  window.JJSmartPdfImportV79={
    open:()=>ensureInput().click(),
    parse:files=>parseFiles([...files||[]])
  };

  if(document.readyState==='complete')setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();


/* -------------------------------------------------------------------------
   J&J Edit Selection In-Stock Control v80
   Adds a clear In Stock toggle directly under Lead Time in the contractor
   Edit Selection window. Uses the app's existing selectionEditInStock field,
   so saving behavior remains native and no selection data model changes.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjEditInStockV80) return;
  window.__jjEditInStockV80 = true;

  const STYLE_ID='jj-edit-instock-v80';

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .jj-edit-instock-wrap{
        margin-top:8px;padding:10px 11px;border:1px solid #D7DEE7;border-radius:9px;background:#F8FAFC;
      }
      .jj-edit-instock-wrap .jj-edit-instock-label{
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        color:#14234A;font-size:11px;font-weight:850;
      }
      .jj-edit-instock-wrap small{
        display:block;margin-top:4px;color:#6A7686;font-size:10px;line-height:1.35;
      }
      .jj-edit-instock-toggle{
        min-width:86px!important;padding:8px 11px!important;border-radius:8px!important;
        border:1px solid #C9D1DB!important;background:#fff!important;color:#14234A!important;
        font-size:11px!important;font-weight:900!important;
      }
      .jj-edit-instock-toggle[aria-pressed="true"]{
        background:#EAF5EE!important;border-color:#A8CDB8!important;color:#246441!important;
      }
    `;
    document.head.appendChild(style);
  }

  function enhance(){
    const toggle=document.getElementById('selectionEditInStock');
    if(!toggle)return;

    // Keep original element and behavior; just make it clearly visible under lead time.
    toggle.classList.add('jj-edit-instock-toggle');
    toggle.textContent=toggle.getAttribute('aria-pressed')==='true'?'In Stock ✓':'Mark In Stock';

    const refreshText=()=>{
      toggle.textContent=toggle.getAttribute('aria-pressed')==='true'?'In Stock ✓':'Mark In Stock';
    };

    if(toggle.dataset.jjV80Bound!=='1'){
      toggle.dataset.jjV80Bound='1';
      toggle.addEventListener('click',()=>setTimeout(refreshText,0));
      const observer=new MutationObserver(refreshText);
      observer.observe(toggle,{attributes:true,attributeFilter:['aria-pressed']});
    }

    if(toggle.closest('.jj-edit-instock-wrap'))return;

    // Try to place directly under the Lead Time field/container.
    const leadInput=document.getElementById('selectionEditLeadValue');
    const leadField=leadInput?.closest('.selection-field') || leadInput?.parentElement;
    const wrap=document.createElement('div');
    wrap.className='jj-edit-instock-wrap';

    const label=document.createElement('div');
    label.className='jj-edit-instock-label';

    const text=document.createElement('span');
    text.textContent='Availability';

    toggle.parentElement?.insertBefore(wrap,toggle);
    wrap.appendChild(label);
    label.append(text,toggle);

    const note=document.createElement('small');
    note.textContent='Mark this when the product is currently available. Cards will show In Stock instead of lead time.';
    wrap.appendChild(note);

    if(leadField && leadField.parentElement){
      leadField.insertAdjacentElement('afterend',wrap);
    }
  }

  function boot(){
    injectStyles();
    enhance();

    const modal=document.getElementById('selectionModalBackdrop');
    if(modal && !window.__jjInStockObserverV80){
      const observer=new MutationObserver(()=>setTimeout(enhance,0));
      observer.observe(modal,{childList:true,subtree:true});
      window.__jjInStockObserverV80=observer;
    }

    if(!window.__jjInStockTimerV80){
      window.__jjInStockTimerV80=setInterval(()=>{
        if(!document.hidden)enhance();
      },800);
    }
  }

  if(document.readyState==='complete')setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();


/* -------------------------------------------------------------------------
   J&J Selection Controls + Homeowner Stability v81
   - Makes the existing selection multi-select checkboxes obvious in Card/List.
   - Keeps bulk Status / Group / Lead Time / two-step Delete.
   - Guarantees an In Stock toggle exists directly under Lead Time in Edit.
   - Stabilizes the H.O. group toolbar so updates don't keep duplicating/rebuilding it.
   - Improves contrast for the selected job in the sidebar.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjSelectionControlsV81) return;
  window.__jjSelectionControlsV81 = true;

  const STYLE_ID='jj-selection-controls-v81';

  function injectStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* ---- Multi-select checkbox: Card + List ---- */
      #selections .selection-card > label:first-child,
      #selections .selection-card label:has(input[type="checkbox"][aria-label^="Select "]) {
        display:flex!important;
        align-items:center!important;
        gap:8px!important;
        width:max-content!important;
        max-width:calc(100% - 20px)!important;
        margin:9px 10px 0!important;
        padding:7px 9px!important;
        border:1px solid #D6DEE8!important;
        border-radius:8px!important;
        background:#FFFFFF!important;
        color:#14234A!important;
        font-size:11px!important;
        font-weight:850!important;
        line-height:1.2!important;
        cursor:pointer!important;
        position:relative!important;
        z-index:2!important;
      }
      #selections .selection-card input[type="checkbox"] {
        display:block!important;
        appearance:auto!important;
        -webkit-appearance:checkbox!important;
        width:18px!important;
        height:18px!important;
        min-width:18px!important;
        margin:0!important;
        accent-color:#B59A62!important;
        cursor:pointer!important;
        opacity:1!important;
        visibility:visible!important;
      }
      #selections .selection-list .selection-card > label:first-child {
        margin:8px 10px!important;
      }

      /* ---- In Stock in Edit Selection ---- */
      .jj-v81-instock-row{
        margin-top:8px!important;
        padding:10px 11px!important;
        border:1px solid #D7DEE7!important;
        border-radius:9px!important;
        background:#F8FAFC!important;
      }
      .jj-v81-instock-line{
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:12px!important;
      }
      .jj-v81-instock-line strong{
        color:#14234A!important;
        font-size:11px!important;
      }
      .jj-v81-instock-row small{
        display:block!important;
        margin-top:4px!important;
        color:#687587!important;
        font-size:10px!important;
        line-height:1.35!important;
      }
      #selectionEditInStock{
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        min-width:104px!important;
        min-height:36px!important;
        padding:8px 11px!important;
        border:1px solid #C9D1DB!important;
        border-radius:8px!important;
        background:#FFFFFF!important;
        color:#14234A!important;
        font-size:11px!important;
        font-weight:900!important;
        opacity:1!important;
        visibility:visible!important;
      }
      #selectionEditInStock[aria-pressed="true"]{
        border-color:#9DC8AE!important;
        background:#EAF5EE!important;
        color:#246441!important;
      }

      /* ---- Homeowner toolbar stability ---- */
      #jjHOGroupToolbar{
        display:flex!important;
        align-items:center!important;
        gap:8px!important;
        flex-wrap:wrap!important;
        margin:8px 0 16px!important;
      }
      #jjHOGroupToggle{
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        min-width:118px!important;
        min-height:40px!important;
        opacity:1!important;
        visibility:visible!important;
      }

      /* ---- Selected job sidebar contrast ---- */
      .job-item.active,
      .job-item.selected,
      .job-row.active,
      .job-row.selected,
      .project-item.active,
      .project-item.selected,
      .project-row.active,
      .project-row.selected,
      .project-button.active,
      .project-button.selected,
      [data-job].active,
      [data-project].active,
      .sidebar .active[data-job],
      .sidebar .active[data-project]{
        color:#FFFFFF!important;
      }
      .job-item.active *,
      .job-item.selected *,
      .job-row.active *,
      .job-row.selected *,
      .project-item.active *,
      .project-item.selected *,
      .project-row.active *,
      .project-row.selected *,
      .project-button.active *,
      .project-button.selected *,
      [data-job].active *,
      [data-project].active *{
        color:#FFFFFF!important;
      }
      .job-item.active small,
      .job-row.active small,
      .project-item.active small,
      .project-row.active small,
      .project-button.active small{
        color:rgba(255,255,255,.78)!important;
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------- Multi-select ---------------- */
  function updateBulkCheckboxLabels(){
    const root=document.getElementById('selections');
    if(!root)return;

    root.querySelectorAll('.selection-card input[type="checkbox"]').forEach(box=>{
      const label=box.closest('label');
      if(!label)return;
      const title=(box.getAttribute('aria-label')||'').replace(/^Select\s+/i,'').trim();
      // Keep it short and consistent.
      const textNodes=[...label.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);
      textNodes.forEach(n=>n.remove());
      let span=label.querySelector('.jj-v81-select-text');
      if(!span){
        span=document.createElement('span');
        span.className='jj-v81-select-text';
        label.appendChild(span);
      }
      span.textContent=box.checked?'Selected for bulk edit':'Select';
      label.title=title?`Select ${title} for bulk actions`:'Select for bulk actions';
    });

    // Refresh the existing v78 toolbar count if available.
    try{
      const event=new Event('change',{bubbles:true});
      // don't dispatch; v78 already observes checkbox changes.
    }catch{}
  }

  /* ---------------- In Stock ---------------- */
  function ensureInStock(){
    const leadInput=document.getElementById('selectionEditLeadValue');
    if(!leadInput)return;

    const leadField=leadInput.closest('.selection-field')||leadInput.parentElement;
    if(!leadField)return;

    let button=document.getElementById('selectionEditInStock');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.id='selectionEditInStock';
      button.setAttribute('aria-pressed','false');
      button.textContent='Mark In Stock';
      button.addEventListener('click',event=>{
        event.preventDefault();
        const next=button.getAttribute('aria-pressed')!=='true';
        button.setAttribute('aria-pressed',String(next));
        button.textContent=next?'In Stock ✓':'Mark In Stock';
      });
    }

    let row=document.querySelector('.jj-v81-instock-row');
    if(!row){
      row=document.createElement('div');
      row.className='jj-v81-instock-row';
      row.innerHTML=`
        <div class="jj-v81-instock-line">
          <strong>Availability</strong>
        </div>
        <small>Turn this on when the product is available now. The selection card will show In Stock instead of the lead-time estimate.</small>`;
      leadField.insertAdjacentElement('afterend',row);
    }

    const line=row.querySelector('.jj-v81-instock-line');
    if(button.parentElement!==line)line.appendChild(button);

    const refresh=()=>{
      button.textContent=button.getAttribute('aria-pressed')==='true'
        ? 'In Stock ✓'
        : 'Mark In Stock';
    };
    refresh();

    if(button.dataset.jjV81Bound!=='1'){
      button.dataset.jjV81Bound='1';
      new MutationObserver(refresh).observe(button,{attributes:true,attributeFilter:['aria-pressed']});
    }
  }

  /* ---------------- Homeowner stability ---------------- */
  function homeownerGroups(){
    return [...document.querySelectorAll('#items details.option-group')];
  }

  function updateHOBtn(){
    const btn=document.getElementById('jjHOGroupToggle');
    if(!btn)return;
    const groups=homeownerGroups();
    if(!groups.length){
      btn.textContent='View All';
      btn.disabled=true;
      return;
    }
    btn.disabled=false;
    const allOpen=groups.every(group=>group.open);
    btn.textContent=allOpen?'Show Groups':'View All';
    btn.setAttribute('aria-pressed',String(allOpen));
  }

  function setHOGroups(open){
    homeownerGroups().forEach(group=>group.open=!!open);
    updateHOBtn();
  }

  function stabilizeHomeowner(){
    const items=document.getElementById('items');
    const view=document.querySelector('.actions[aria-label="Selections view"], .actions[role="group"][aria-label="Selections view"]');
    if(!items||!view)return false;

    // Stop the older fallback timer/observer that could keep re-inserting controls.
    if(window.__jjV75DisclosureTimer){
      clearInterval(window.__jjV75DisclosureTimer);
      window.__jjV75DisclosureTimer=null;
    }
    if(window.__jjV75HOObserver?.disconnect){
      window.__jjV75HOObserver.disconnect();
      window.__jjV75HOObserver=null;
    }

    // Keep exactly one homeowner group toolbar.
    const bars=[...document.querySelectorAll('#jjHOGroupToolbar')];
    let bar=bars.shift();
    bars.forEach(node=>node.remove());
    if(!bar){
      bar=document.createElement('div');
      bar.id='jjHOGroupToolbar';
      bar.className='jj-ho-group-toolbar';
      bar.setAttribute('aria-label','Selection groups');
      view.insertAdjacentElement('afterend',bar);
    }else if(bar.previousElementSibling!==view){
      view.insertAdjacentElement('afterend',bar);
    }

    const oldButtons=[...document.querySelectorAll('#jjHOViewAll,#jjHOShowGroups')];
    oldButtons.forEach(node=>node.remove());

    let btn=document.getElementById('jjHOGroupToggle');
    if(!btn){
      btn=document.createElement('button');
      btn.id='jjHOGroupToggle';
      btn.type='button';
      btn.className='secondary';
      bar.replaceChildren(btn);
    }else if(btn.parentElement!==bar){
      bar.replaceChildren(btn);
    }

    if(btn.dataset.jjV81Bound!=='1'){
      btn.dataset.jjV81Bound='1';
      // Capture stops older duplicate listeners from flipping the result back.
      btn.addEventListener('click',event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        const groups=homeownerGroups();
        if(!groups.length)return;
        setHOGroups(!groups.every(group=>group.open));
      },true);
    }

    homeownerGroups().forEach(group=>{
      if(group.dataset.jjV81Toggle!=='1'){
        group.dataset.jjV81Toggle='1';
        group.addEventListener('toggle',()=>setTimeout(updateHOBtn,0));
      }
    });

    updateHOBtn();

    if(!window.__jjV81HOObserver){
      const observer=new MutationObserver(()=>setTimeout(stabilizeHomeowner,0));
      observer.observe(items,{childList:true,subtree:false});
      window.__jjV81HOObserver=observer;
    }
    return true;
  }

  function boot(){
    injectStyles();

    // H.O. page is handled separately and kept simple.
    if(stabilizeHomeowner())return;

    updateBulkCheckboxLabels();
    ensureInStock();

    const root=document.getElementById('selections');
    if(root&&!window.__jjV81AppObserver){
      const observer=new MutationObserver(()=>setTimeout(()=>{
        updateBulkCheckboxLabels();
        ensureInStock();
      },0));
      observer.observe(root,{childList:true,subtree:true});
      window.__jjV81AppObserver=observer;
    }

    document.addEventListener('change',event=>{
      if(event.target?.matches?.('#selections .selection-card input[type="checkbox"]')){
        setTimeout(updateBulkCheckboxLabels,0);
      }
    });

    if(!window.__jjV81Timer){
      window.__jjV81Timer=setInterval(()=>{
        if(document.hidden)return;
        updateBulkCheckboxLabels();
        ensureInStock();
      },900);
    }
  }

  if(document.readyState==='complete')setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();

