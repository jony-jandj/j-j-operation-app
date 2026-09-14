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
      .jj-selection-group-badge{display:inline-flex;align-items:center;gap:5px;margin:7px 0 0;padding:5px 8px;border-radius:999px;background:#EEF3F7;color:#40566A;font-size:10px;font-weight:850}
      .jj-selection-group-btn{border:1px solid var(--line,#dfe4ea);background:#fff;color:var(--navy,#14234A);border-radius:8px;padding:8px 10px;font-size:11px;font-weight:800}
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
      @media(max-width:600px){.jj-group-row-head{display:grid}.jj-group-row-head>div:last-child{justify-content:flex-start}.jj-selection-top-actions .btn{flex:1}.jj-group-foot .btn{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function enhanceRenderedSelections(){
    const root=document.getElementById('selections');
    if(!root)return;
    const p=project();
    ensureGroups(p);

    const heading=root.querySelector('.selection-heading');
    if(heading && !root.querySelector('.jj-selection-top-actions')){
      const actions=document.createElement('div');
      actions.className='jj-selection-top-actions';
      actions.innerHTML=`
        <button class="btn btn-gold" type="button" onclick="openSelectionEditor()">+ Add Selection</button>
        <button class="btn btn-light" type="button" onclick="window.JJSelectionGroups.create()">Create Group</button>
        <button class="btn btn-light" type="button" onclick="window.JJSelectionGroups.manage()">Manage Groups</button>`;
      heading.insertAdjacentElement('afterend',actions);
    }

    // Hide the duplicate old "Add manually" button now that Add Selection is prominent.
    root.querySelectorAll('.selection-toolbar button').forEach(btn=>{
      if(/add manually/i.test(btn.textContent||''))btn.style.display='none';
    });

    // Hide the old direct-linking fields in the editor if it is currently open.
    ['selectionEditGroup','selectionEditGroupName'].forEach(id=>{
      const node=document.getElementById(id);
      const wrap=node?.closest('label')||node?.parentElement;
      if(wrap)wrap.style.display='none';
    });

    // Group badge on every assigned card.
    root.querySelectorAll('.selection-card').forEach((card,cardIndex)=>{
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
  }

  function hideOldGroupFields(){
    setTimeout(()=>{
      ['selectionEditGroup','selectionEditGroupName'].forEach(id=>{
        const node=document.getElementById(id);
        const wrap=node?.closest('label')||node?.parentElement;
        if(wrap)wrap.style.display='none';
      });
    },0);
  }

  function install(){
    if(window.__jjSelectionGroupsInstalled)return;
    window.__jjSelectionGroupsInstalled=true;
    injectStyles();

    // Do nothing on the homeowner page except preserve shared option-group data.
    if(typeof window.renderSelections!=='function' || typeof window.selectedProject!=='function')return;

    const oldRender=window.renderSelections;
    const oldCard=window.selectionCard;
    const oldOpenEditor=window.openSelectionEditor;
    const oldOpenFromLink=window.openSelectionEditorFromLink;

    window.selectionGroupSelect=(item,index)=>groupControlHTML(item,index);

    if(typeof oldCard==='function'){
      window.selectionCard=function(item,index){
        return oldCard(item,index);
      };
    }

    window.renderSelections=function(){
      ensureGroups(project());
      oldRender();
      enhanceRenderedSelections();
    };

    if(typeof oldOpenEditor==='function'){
      window.openSelectionEditor=function(...args){
        const result=oldOpenEditor.apply(this,args);
        hideOldGroupFields();
        return result;
      };
    }

    if(typeof oldOpenFromLink==='function'){
      window.openSelectionEditorFromLink=function(...args){
        const result=oldOpenFromLink.apply(this,args);
        hideOldGroupFields();
        return result;
      };
    }

    // Migrate groups and redraw once after all original app scripts are loaded.
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
    ensure:ensureGroups
  };

  if(document.readyState==='complete')setTimeout(install,0);
  else window.addEventListener('load',install,{once:true});
})();
