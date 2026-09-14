/* J&J shared product lookup + selections group UI v72 */
window.JJProduct = (() => {
  const text=v=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
  const safe=u=>/^https?:\/\//i.test(text(u))?text(u):'';

  function title(v){
    return text(v).replace(/\s+/g,' ')
      .replace(/\s+[|–—-]\s+(?:The Home Depot|Lowe['’]s|Wayfair|Amazon(?:\.com)?|Floor & Decor).*$/i,'')
      .trim();
  }

  function goodTitle(v){
    const s=title(v);
    return s.length>3 &&
      !/access denied|captcha|robot check|just a moment|page not found|request blocked|verify you are|^error\b/i.test(s) &&
      !/^(the home depot|lowe['’]s|amazon|wayfair|product|dp|p)$/i.test(s) ? s : '';
  }

  function category(v){
    return [
      [/tile|mosaic|porcelain|ceramic/i,'Tile'],
      [/shower door|hinge|door|lockset/i,'Doors / Hardware'],
      [/vanity|cabinet/i,'Vanity'],
      [/mirror/i,'Mirror'],
      [/faucet|shower|tub|valve|drain|toilet/i,'Plumbing'],
      [/sconce|light|chandelier|pendant/i,'Electrical'],
      [/flooring|hardwood|laminate|vinyl/i,'Flooring']
    ].find(([p])=>p.test(v))?.[1]||'';
  }

  function guess(value){
    try{
      const u=new URL(value);
      const host=u.hostname.replace(/^www\./,'');
      const vendor=({
        'homedepot.com':'The Home Depot',
        'lowes.com':"Lowe’s",
        'flooranddecor.com':'Floor & Decor',
        'wayfair.com':'Wayfair',
        'build.com':'Build.com',
        'ferguson.com':'Ferguson',
        'amazon.com':'Amazon'
      })[host]||host;

      const parts=u.pathname.split('/').filter(Boolean).map(v=>{
        try{return decodeURIComponent(v)}catch{return v}
      });
      const candidates=parts.filter(p=>
        !/^(p|pd|dp|gp|product|products|item|detail|html?)$/i.test(p) &&
        !/^[0-9]+$/.test(p) &&
        !/^[a-z0-9]{10}$/i.test(p)
      );
      let slug=candidates.sort((a,b)=>b.length-a.length)[0]||'';
      slug=slug.replace(/\.(html?|aspx?)$/i,'')
        .replace(/[-_]\d{6,}$/,'')
        .replace(/[-_]+/g,' ')
        .replace(/\s+/g,' ')
        .trim();
      const name=goodTitle(slug.replace(/\b\w/g,c=>c.toUpperCase()));
      return {
        title:name,
        vendor,
        model:u.searchParams.get('sku')||u.searchParams.get('model')||'',
        category:category(name)
      };
    }catch{
      return {title:'',vendor:'',model:'',category:''};
    }
  }

  function price(v){
    if(typeof v==='number')return Number.isFinite(v)&&v>=0?v:null;
    const s=text(v).replace(/,/g,'').replace(/^(?:USD\s*|\$)/i,'').trim();
    return /^\d+(?:\.\d{1,2})?$/.test(s)?Number(s):null;
  }

  function image(v){
    const u=safe(typeof v==='object'?v?.url:v);
    return /placeholder|no[-_]?image|image[-_]?not[-_]?available|missing[-_]?image|\/logo[./_-]|favicon/i.test(u)?'':u;
  }

  function parse(data){
    const products=[];
    const walk=(obj,depth=0)=>{
      if(depth>12||!obj||typeof obj!=='object')return;
      if(Array.isArray(obj)){obj.forEach(x=>walk(x,depth+1));return;}
      if([].concat(obj['@type']||[]).some(x=>/^(Product|ProductGroup)$/i.test(x)))products.push(obj);
      if(obj['@graph'])walk(obj['@graph'],depth+1);
      if(obj.mainEntity)walk(obj.mainEntity,depth+1);
    };

    for(const raw of [].concat(data.productJson||[])){
      try{walk(typeof raw==='string'?JSON.parse(raw):raw)}catch{}
    }

    const product=products.find(p=>p['@type']==='Product')||products[0]||{};
    const offers=[].concat(product.offers||[]);
    const exact=offers.filter(o=>!o['@type']||o['@type']==='Offer');
    let unitPrice=null;
    const amounts=exact.filter(o=>!o.priceCurrency||o.priceCurrency==='USD')
      .map(o=>price(o.price??o.priceSpecification?.price))
      .filter(p=>p!==null);
    if(amounts.length&&new Set(amounts).size===1)unitPrice=amounts[0];
    if(unitPrice===null&&(!data.currency||text(data.currency).toUpperCase()==='USD'))unitPrice=price(data.price);

    const img=[].concat(product.image||[]).map(image).find(Boolean)||image(data.productImage)||image(data.image);
    return {
      title:goodTitle(product.name)||goodTitle(data.productName)||goodTitle(data.title),
      description:text(product.description)||text(data.description),
      model:text(product.sku)||text(product.mpn)||text(data.sku),
      image:img,
      unitPrice,
      category:category(text(product.name)||text(data.title))
    };
  }

  function lookupUrl(url){
    const q=new URLSearchParams({
      url,
      'data.productJson.selectorAll':'script[type="application/ld+json"]',
      'data.productJson.attr':'text',
      'data.productName.selector':'h1',
      'data.productName.attr':'text',
      'data.price.selector':'meta[itemprop="price"],meta[property="product:price:amount"],meta[property="og:price:amount"],meta[name="twitter:data1"]',
      'data.price.attr':'content',
      'data.currency.selector':'meta[property="product:price:currency"],meta[itemprop="priceCurrency"]',
      'data.currency.attr':'content',
      'data.sku.selector':'meta[itemprop="sku"],meta[property="product:retailer_item_id"]',
      'data.sku.attr':'content',
      'data.productImage.selector':'meta[property="og:image"]',
      'data.productImage.attr':'content'
    });
    return 'https://api.microlink.io?'+q;
  }

  async function lookup(url){
    if(!safe(url))return null;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await fetch(lookupUrl(url),{signal:controller.signal});
      if(!r.ok)return null;
      const p=await r.json();
      if(p.status==='fail'||p.status==='error'||Number(p.statusCode)>=400)return null;
      const data=p.data||{};
      if(data.title&&!goodTitle(data.title))return null;
      return parse(data);
    }catch{
      return null;
    }finally{
      clearTimeout(timer);
    }
  }

  return {guess,lookup,parse,price,image,title:goodTitle,lookupUrl};
})();


(() => {
  const VERSION='v72';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function injectStyles(){
    if(document.getElementById('jj-selection-groups-v72'))return;
    const style=document.createElement('style');
    style.id='jj-selection-groups-v72';
    style.textContent=`
      .jj-selection-top-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
      .jj-app-group-controls{display:inline-flex;gap:7px;align-items:center;margin-left:8px}
      .jj-app-group-controls .btn{min-width:94px!important;font-size:11px!important;padding:9px 11px!important}
      .jj-group-card-button{border:1px solid var(--line,#dfe4ea);background:#fff;color:var(--navy,#14234A);border-radius:8px;padding:8px 10px;font-size:11px;font-weight:800}
      .jj-group-badge{display:inline-flex;margin:7px 0 0;padding:5px 8px;border-radius:999px;background:#eef3f7;color:#40566a;font-size:10px;font-weight:850}
      .jj-group-summary-actions{display:flex;align-items:center;gap:10px;margin-left:auto}
      .jj-group-summary-count{color:#657083;font-size:11px;font-weight:800;white-space:nowrap}
      .jj-group-add-option{border:1px solid #d9dfe7!important;background:#fff!important;color:#14234a!important;border-radius:8px!important;padding:7px 10px!important;font-size:10px!important;font-weight:900!important;white-space:nowrap}
      .jj-editor-group-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}

      .jj-group-dialog{width:min(620px,calc(100% - 24px));max-height:88dvh;padding:0;border:0;border-radius:16px;color:#202633;box-shadow:0 24px 70px rgba(12,28,45,.32)}
      .jj-group-dialog::backdrop{background:rgba(7,18,31,.55)}
      .jj-group-head,.jj-group-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;background:#fff;position:sticky;z-index:2}
      .jj-group-head{top:0;border-bottom:1px solid #e3e7ed}.jj-group-foot{bottom:0;border-top:1px solid #e3e7ed;justify-content:flex-end;flex-wrap:wrap}
      .jj-group-head h3{margin:0;color:#14234a}.jj-group-head small{display:block;color:#b59a62;font-size:9px;font-weight:900;letter-spacing:.9px}
      .jj-group-icon{width:36px;height:36px;border:1px solid #dce2e9;border-radius:9px;background:#fff;color:#14234a;font-size:22px}
      .jj-group-body{padding:18px;background:#f7f8fa;overflow:auto}
      .jj-group-choice-list{display:grid;gap:8px}
      .jj-group-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:13px 14px;border:1px solid #dce2e9;border-radius:11px;background:#fff;color:#14234a;text-align:left}
      .jj-group-choice.active{border-color:#b59a62;background:#f7f2e8}.jj-group-choice span{font-weight:850}.jj-group-choice small{color:#6f7a89}
      .jj-group-empty{display:grid;gap:5px;padding:18px;border:1px dashed #cdd5de;border-radius:12px;background:#fff;text-align:center}.jj-group-empty span{color:#6f7a89;font-size:12px}
      .jj-group-row{padding:14px;border:1px solid #dce2e9;border-radius:12px;background:#fff;margin-bottom:10px}
      .jj-group-row-head{display:flex;justify-content:space-between;gap:12px}.jj-group-row-head strong{display:block;color:#14234a}.jj-group-row-head small{display:block;color:#6f7a89;margin-top:4px}
      .jj-group-row-actions{display:flex;gap:6px;flex-wrap:wrap}
      .jj-group-member-list{display:grid;gap:5px;margin-top:8px;padding:9px;border-radius:8px;background:#f6f8fa;color:#405066;font-size:11px}

      /* Homeowner */
      #jjHOGroupToolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 16px}
      #jjHOGroupToggle{min-width:118px;font-weight:850;border:1px solid #cfd6df!important;background:#fff!important;color:#14234a!important}
      #cardView,#listView{width:44px;min-width:44px;padding:10px!important;font-size:19px;line-height:1}
      #items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      #items>.option-group{grid-column:1/-1;margin:0;border:1px solid #d9e0e6;border-radius:14px;background:#f8fafb;overflow:hidden;box-shadow:0 3px 12px rgba(19,35,52,.05)}
      #items>.option-group>summary.jj-ho-summary{display:flex!important;align-items:center!important;gap:12px!important;min-height:58px;padding:14px 16px!important;background:#fff!important;color:#14234a!important;font-size:12px!important;font-weight:900!important;list-style:none}
      #items>.option-group>summary.jj-ho-summary::-webkit-details-marker{display:none}
      #items>.option-group>summary.jj-ho-summary:before{content:"▸";flex:none;transition:transform .15s}
      #items>.option-group[open]>summary.jj-ho-summary:before{transform:rotate(90deg)}
      .jj-ho-summary-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .jj-ho-summary-actions{display:flex;align-items:center;gap:10px;margin-left:auto}
      .jj-ho-summary-count{color:#657083;font-size:11px;font-weight:800;white-space:nowrap}
      .jj-ho-group-add-option{min-height:34px!important;padding:7px 10px!important;border:1px solid #d9dfe7!important;border-radius:8px!important;background:#f5f7fa!important;color:#14234a!important;font-size:10px!important;font-weight:900!important;white-space:nowrap}
      #items>.option-group>.option-group-items{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important;padding:14px!important}
      #items article{min-width:0;border-radius:13px!important;box-shadow:0 2px 8px rgba(19,35,52,.04)}
      #items article .photo{height:220px!important;object-fit:contain!important;background:#fff!important;margin:0!important}
      #items article .card-body{padding:14px!important}
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
        .jj-selection-top-actions .btn{flex:1}
        .jj-app-group-controls{display:flex;width:100%;margin:6px 0 0}
        .jj-app-group-controls .btn{flex:1!important;min-width:0!important}
        .jj-editor-group-actions .btn{flex:1}
        #items{grid-template-columns:1fr}
        #items>.option-group>.option-group-items{grid-template-columns:1fr!important}
        #items>.option-group>summary.jj-ho-summary{align-items:flex-start!important;flex-wrap:wrap!important}
        .jj-ho-summary-title{white-space:normal}
        .jj-ho-summary-actions{width:100%;margin-left:22px;justify-content:space-between}
        .jj-ho-summary-count{white-space:normal}
        #items.list article{grid-template-columns:90px minmax(0,1fr)!important}
        #items.list article .photo{height:90px!important}
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------- Contractor app ---------------- */
  function appProject(){
    try{return typeof window.selectedProject==='function'?window.selectedProject():null}catch{return null}
  }

  function makeGroupId(){
    return 'group-'+Date.now()+'-'+(crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
  }

  function ensureAppGroups(project=appProject()){
    if(!project)return [];
    if(!Array.isArray(project.selectionGroups))project.selectionGroups=[];

    (project.selections||[]).forEach(item=>{
      if(!item?.optionGroupId)return;
      const id=String(item.optionGroupId);
      if(!project.selectionGroups.some(g=>String(g.id)===id)){
        project.selectionGroups.push({
          id,
          name:String(item.optionGroupTitle||item.title||'Selection Group').trim()||'Selection Group'
        });
      }
    });

    project.selectionGroups.forEach(group=>{
      (project.selections||[]).forEach(item=>{
        if(String(item.optionGroupId||'')===String(group.id))item.optionGroupTitle=group.name;
      });
    });
    return project.selectionGroups;
  }

  function saveApp(message=''){
    try{window.saveState?.(false)}catch{}
    try{window.renderSelections?.()}catch{}
    if(message)try{window.toast?.(message)}catch{}
  }

  function appGroupControl(item,index){
    return `<button type="button" class="jj-group-card-button" onclick="window.JJSelectionGroups.openAssign(${index})">${item.optionGroupId?'Change Group':'Add to Group'}</button>`;
  }

  function renderAppGroups(filtered,allItems){
    const p=appProject();
    ensureAppGroups(p);
    const buckets=new Map();

    filtered.forEach(item=>{
      const key=item.optionGroupId?'group:'+item.optionGroupId:'item:'+item.id;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(item);
    });

    return [...buckets.values()].map(group=>{
      const first=group[0];
      const firstIndex=allItems.indexOf(first);
      if(!first.optionGroupId)return window.selectionCard(first,firstIndex);

      const registry=(p.selectionGroups||[]).find(g=>String(g.id)===String(first.optionGroupId));
      const groupTitle=registry?.name||first.optionGroupTitle||first.title||'Selection Group';

      return `<details class="selection-option-group" data-selection-group-id="${escapeHtml(first.optionGroupId)}" open>
        <summary class="selection-option-group-title">
          <span>${escapeHtml(groupTitle)}</span>
          <span class="jj-group-summary-actions">
            <span class="jj-group-summary-count">${group.length} option${group.length===1?'':'s'} · tap to compare</span>
            <button type="button" class="jj-group-add-option"
              onclick="event.preventDefault();event.stopPropagation();addSelectionOption(${firstIndex})">+ Add Option</button>
          </span>
        </summary>
        <div class="selection-option-grid">
          ${group.map(item=>window.selectionCard(item,allItems.indexOf(item))).join('')}
        </div>
      </details>`;
    }).join('');
  }

  function setAllAppGroups(open){
    document.querySelectorAll('#selections details.selection-option-group').forEach(details=>details.open=!!open);
  }

  function openCreateGroup(assignIndex=null){
    document.getElementById('jjSelectionGroupDialog')?.remove();
    const dialog=document.createElement('dialog');
    dialog.id='jjSelectionGroupDialog';
    dialog.className='jj-group-dialog';
    dialog.innerHTML=`
      <div class="jj-group-head">
        <div><small>SELECTIONS</small><h3>Create Group</h3></div>
        <button class="jj-group-icon" type="button" data-close>×</button>
      </div>
      <div class="jj-group-body">
        <label>Group name<input id="jjGroupName" class="input" placeholder="Primary Bathroom, Shower Fixtures…"></label>
      </div>
      <div class="jj-group-foot">
        <button class="btn btn-light" type="button" data-close>Cancel</button>
        <button class="btn btn-gold" type="button" id="jjSaveGroup">Create Group</button>
      </div>`;
    document.body.appendChild(dialog);

    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('#jjSaveGroup').addEventListener('click',()=>{
      const name=dialog.querySelector('#jjGroupName').value.trim();
      if(!name)return;
      const p=appProject(),groups=ensureAppGroups(p);
      const existing=groups.find(g=>g.name.trim().toLowerCase()===name.toLowerCase());
      const group=existing||{id:makeGroupId(),name};
      if(!existing)groups.push(group);

      if(assignIndex!==null&&p.selections?.[assignIndex]){
        const item=p.selections[assignIndex];
        item.optionGroupId=group.id;
        item.optionGroupTitle=group.name;
        delete item.optionLabel;
      }
      try{window.saveState?.(false)}catch{}
      dialog.close();
      try{window.renderSelections?.()}catch{}
      window.toast?.(assignIndex===null?'Selection group created':`Added to ${group.name}`);
    });
    dialog.showModal();
    setTimeout(()=>dialog.querySelector('#jjGroupName')?.focus(),30);
  }

  function openAssign(index){
    const p=appProject(),item=p?.selections?.[index];
    if(!item)return;
    const groups=ensureAppGroups(p);

    document.getElementById('jjSelectionGroupDialog')?.remove();
    const dialog=document.createElement('dialog');
    dialog.id='jjSelectionGroupDialog';
    dialog.className='jj-group-dialog';
    dialog.innerHTML=`
      <div class="jj-group-head">
        <div><small>ADD TO GROUP</small><h3>${escapeHtml(item.title||'Selection')}</h3></div>
        <button class="jj-group-icon" type="button" data-close>×</button>
      </div>
      <div class="jj-group-body">
        ${groups.length?`<div class="jj-group-choice-list">${groups.map(group=>`
          <button type="button" class="jj-group-choice ${String(group.id)===String(item.optionGroupId||'')?'active':''}" data-group="${escapeHtml(group.id)}">
            <span>${escapeHtml(group.name)}</span>
            <small>${(p.selections||[]).filter(i=>String(i.optionGroupId||'')===String(group.id)).length} selection(s)</small>
          </button>`).join('')}</div>`:
          '<div class="jj-group-empty"><strong>No groups yet</strong><span>Create a group first.</span></div>'}
      </div>
      <div class="jj-group-foot">
        ${item.optionGroupId?'<button class="btn btn-light" type="button" id="jjRemoveFromGroup">Remove from Group</button>':''}
        <button class="btn btn-light" type="button" id="jjCreateAssignGroup">+ Create Group</button>
        <button class="btn btn-gold" type="button" data-close>Done</button>
      </div>`;
    document.body.appendChild(dialog);

    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.querySelectorAll('[data-group]').forEach(btn=>btn.addEventListener('click',()=>{
      const group=groups.find(g=>String(g.id)===String(btn.dataset.group));
      if(!group)return;
      item.optionGroupId=group.id;
      item.optionGroupTitle=group.name;
      delete item.optionLabel;
      try{window.saveState?.(false)}catch{}
      dialog.close();
      try{window.renderSelections?.()}catch{}
      window.toast?.(`Added to ${group.name}`);
    }));
    dialog.querySelector('#jjRemoveFromGroup')?.addEventListener('click',()=>{
      delete item.optionGroupId;
      delete item.optionGroupTitle;
      delete item.optionLabel;
      try{window.saveState?.(false)}catch{}
      dialog.close();
      try{window.renderSelections?.()}catch{}
      window.toast?.('Selection removed from group');
    });
    dialog.querySelector('#jjCreateAssignGroup')?.addEventListener('click',()=>{
      dialog.close();
      setTimeout(()=>openCreateGroup(index),40);
    });
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  function deleteGroup(id){
    const p=appProject(),groups=ensureAppGroups(p);
    const group=groups.find(g=>String(g.id)===String(id));
    if(!group)return;
    const members=(p.selections||[]).filter(item=>String(item.optionGroupId||'')===String(group.id));
    if(!confirm(`Delete group "${group.name}"? The ${members.length} selection${members.length===1?'':'s'} will stay and become standalone.`))return;

    p.selectionGroups=groups.filter(g=>String(g.id)!==String(group.id));
    members.forEach(item=>{
      delete item.optionGroupId;
      delete item.optionGroupTitle;
      delete item.optionLabel;
    });
    saveApp('Group deleted — selections kept');
  }

  function manageGroups(){
    const p=appProject(),groups=ensureAppGroups(p);
    document.getElementById('jjSelectionGroupDialog')?.remove();
    const dialog=document.createElement('dialog');
    dialog.id='jjSelectionGroupDialog';
    dialog.className='jj-group-dialog';
    dialog.innerHTML=`
      <div class="jj-group-head">
        <div><small>SELECTIONS</small><h3>Manage Groups</h3></div>
        <button class="jj-group-icon" type="button" data-close>×</button>
      </div>
      <div class="jj-group-body">
        ${groups.length?groups.map(group=>{
          const members=(p.selections||[]).filter(item=>String(item.optionGroupId||'')===String(group.id));
          return `<section class="jj-group-row">
            <div class="jj-group-row-head">
              <div><strong>${escapeHtml(group.name)}</strong><small>${members.length} selection${members.length===1?'':'s'}</small></div>
              <div class="jj-group-row-actions">
                <button class="btn btn-light" type="button" data-rename="${escapeHtml(group.id)}">Rename</button>
                <button class="btn btn-danger" type="button" data-delete="${escapeHtml(group.id)}">Delete</button>
              </div>
            </div>
            <details><summary>View selections</summary>
              <div class="jj-group-member-list">${members.length?members.map(item=>`<div>${escapeHtml(item.title||'Untitled')}</div>`).join(''):'<div>No selections yet.</div>'}</div>
            </details>
          </section>`;
        }).join(''):'<div class="jj-group-empty"><strong>No groups yet</strong><span>Create your first group.</span></div>'}
      </div>
      <div class="jj-group-foot">
        <button class="btn btn-light" type="button" id="jjManageCreate">+ Create Group</button>
        <button class="btn btn-gold" type="button" data-close>Done</button>
      </div>`;
    document.body.appendChild(dialog);

    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.querySelector('#jjManageCreate').addEventListener('click',()=>{dialog.close();setTimeout(()=>openCreateGroup(),40)});
    dialog.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.delete;
      dialog.close();
      setTimeout(()=>deleteGroup(id),40);
    }));
    dialog.querySelectorAll('[data-rename]').forEach(btn=>btn.addEventListener('click',()=>{
      const group=groups.find(g=>String(g.id)===String(btn.dataset.rename));
      if(!group)return;
      const name=prompt('Rename selection group',group.name);
      if(name===null||!name.trim())return;
      group.name=name.trim();
      (p.selections||[]).forEach(item=>{
        if(String(item.optionGroupId||'')===String(group.id))item.optionGroupTitle=group.name;
      });
      try{window.saveState?.(false)}catch{}
      dialog.close();
      try{window.renderSelections?.()}catch{}
      window.toast?.('Group renamed');
    }));
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  function enhanceEditorGroupField(){
    const select=document.getElementById('selectionEditGroup');
    if(!select)return;
    const p=appProject(),groups=ensureAppGroups(p);
    const current=String(select.value||'');
    const field=select.closest('.selection-field')||select.parentElement;

    select.innerHTML='<option value="">No group / Standalone</option>'+
      groups.map(group=>{
        const count=(p.selections||[]).filter(item=>String(item.optionGroupId||'')===String(group.id)).length;
        return `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)} · ${count} selection${count===1?'':'s'}</option>`;
      }).join('');
    if(groups.some(g=>String(g.id)===current))select.value=current;

    const hidden=document.getElementById('selectionEditGroupName');
    if(hidden){hidden.type='hidden';hidden.style.display='none';}
    const sync=()=>{
      const group=groups.find(g=>String(g.id)===String(select.value));
      if(hidden)hidden.value=group?.name||'';
      const del=document.getElementById('jjEditorDeleteGroup');
      if(del)del.disabled=!group;
    };
    select.onchange=sync;
    sync();

    if(field&&!field.querySelector('.jj-editor-group-actions')){
      const actions=document.createElement('div');
      actions.className='jj-editor-group-actions';
      actions.innerHTML=`
        <button class="btn btn-light" type="button" id="jjEditorCreateGroup">+ Create Group</button>
        <button class="btn btn-danger" type="button" id="jjEditorDeleteGroup">Delete Group</button>`;
      field.appendChild(actions);

      actions.querySelector('#jjEditorCreateGroup').addEventListener('click',()=>{
        const name=prompt('New selection group name');
        if(name===null||!name.trim())return;
        const clean=name.trim();
        let group=groups.find(g=>g.name.trim().toLowerCase()===clean.toLowerCase());
        if(!group){
          group={id:makeGroupId(),name:clean};
          groups.push(group);
        }
        const opt=document.createElement('option');
        opt.value=group.id;
        opt.textContent=group.name;
        select.appendChild(opt);
        select.value=group.id;
        sync();
      });

      actions.querySelector('#jjEditorDeleteGroup').addEventListener('click',()=>{
        const group=groups.find(g=>String(g.id)===String(select.value));
        if(!group)return;
        deleteGroup(group.id);
        select.value='';
        sync();
      });
    }
  }

  function enhanceAppSelections(){
    const root=document.getElementById('selections');
    if(!root)return;
    const p=appProject();
    ensureAppGroups(p);

    const heading=root.querySelector('.selection-heading');
    if(heading&&!root.querySelector('.jj-selection-top-actions')){
      const actions=document.createElement('div');
      actions.className='jj-selection-top-actions';
      actions.innerHTML=`
        <button class="btn btn-gold" type="button" onclick="openSelectionEditor()">+ Add Selection</button>
        <button class="btn btn-light" type="button" onclick="window.JJSelectionGroups.create()">Create Group</button>
        <button class="btn btn-light" type="button" onclick="window.JJSelectionGroups.manage()">Manage Groups</button>`;
      heading.insertAdjacentElement('afterend',actions);
    }

    root.querySelectorAll('.selection-toolbar button').forEach(btn=>{
      if(/add manually/i.test(btn.textContent||''))btn.style.display='none';
    });

    root.querySelectorAll('.selection-card-actions button').forEach(btn=>{
      if(/another option/i.test(btn.textContent||''))btn.remove();
    });

    const viewHost=root.querySelector('.toolbar[role="group"][aria-label="Selections view"],[role="group"][aria-label="Selections view"]');
    if(viewHost&&!viewHost.querySelector('.jj-app-group-controls')){
      const controls=document.createElement('span');
      controls.className='jj-app-group-controls';
      controls.innerHTML=`
        <button class="btn btn-light" type="button" data-expand>Expand All</button>
        <button class="btn btn-light" type="button" data-collapse>Collapse All</button>`;
      viewHost.appendChild(controls);
      controls.querySelector('[data-expand]').addEventListener('click',()=>setAllAppGroups(true));
      controls.querySelector('[data-collapse]').addEventListener('click',()=>setAllAppGroups(false));
    }

    const viewButtons=[...root.querySelectorAll('[aria-label="Selections view"]>button,.toolbar[role="group"][aria-label="Selections view"]>button')];
    viewButtons.forEach((btn,idx)=>{
      const label=(btn.getAttribute('aria-label')||btn.textContent||'').toLowerCase();
      if(label.includes('card')||idx===0){
        btn.textContent='▦';btn.title='Card view';btn.setAttribute('aria-label','Card view');
      }else if(label.includes('list')||idx===1){
        btn.textContent='☰';btn.title='List view';btn.setAttribute('aria-label','List view');
      }
    });

    root.querySelectorAll('.selection-card').forEach(card=>{
      const h3=card.querySelector('h3');
      if(!h3||card.querySelector('.jj-group-badge'))return;
      const item=(p.selections||[]).find(x=>String(x.title||'').trim()===(h3.textContent||'').trim());
      if(!item?.optionGroupId)return;
      const group=(p.selectionGroups||[]).find(g=>String(g.id)===String(item.optionGroupId));
      const badge=document.createElement('div');
      badge.className='jj-group-badge';
      badge.textContent='Group: '+(group?.name||item.optionGroupTitle||'Selection Group');
      h3.insertAdjacentElement('afterend',badge);
    });
  }

  function installApp(){
    if(typeof window.renderSelections!=='function'||typeof window.selectedProject!=='function')return false;

    window.selectionGroupSelect=(item,index)=>appGroupControl(item,index);
    window.renderSelectionOptionGroups=renderAppGroups;

    const originalRender=window.renderSelections;
    window.renderSelections=function(...args){
      ensureAppGroups();
      const result=originalRender.apply(this,args);
      setTimeout(enhanceAppSelections,0);
      return result;
    };

    const originalOpen=window.openSelectionEditor;
    if(typeof originalOpen==='function'){
      window.openSelectionEditor=function(...args){
        const result=originalOpen.apply(this,args);
        setTimeout(enhanceEditorGroupField,0);
        return result;
      };
    }

    const originalFromLink=window.openSelectionEditorFromLink;
    if(typeof originalFromLink==='function'){
      window.openSelectionEditorFromLink=function(...args){
        const result=originalFromLink.apply(this,args);
        setTimeout(enhanceEditorGroupField,0);
        return result;
      };
    }

    ensureAppGroups();
    try{window.renderSelections()}catch{}
    return true;
  }


  /* ---------------- Homeowner portal ---------------- */
  const hoState=new Map();
  let hoEnhancing=false;
  let hoMass=false;

  function hoItems(){
    try{
      if(typeof items!=='undefined'&&Array.isArray(items))return items;
    }catch{}
    return [];
  }

  function hoGroupKey(details){
    if(details.dataset.jjGroup)return details.dataset.jjGroup;
    const optionId=details.querySelector('[data-option]')?.dataset.option;
    if(optionId){
      const item=hoItems().find(x=>String(x.id)===String(optionId));
      if(item?.optionGroupId){
        details.dataset.jjGroup=String(item.optionGroupId);
        return details.dataset.jjGroup;
      }
    }
    const title=(details.querySelector('summary')?.textContent||'').replace(/\b\d+\s+options?.*$/i,'').replace(/\s+/g,' ').trim().toLowerCase();
    if(title){details.dataset.jjGroup='title:'+title;return details.dataset.jjGroup;}
    return '';
  }

  function hoGroups(){
    return [...document.querySelectorAll('#items details.option-group')];
  }

  function updateHOToggle(){
    const btn=document.getElementById('jjHOGroupToggle');
    if(!btn)return;
    const groups=hoGroups();
    if(!groups.length){
      btn.textContent='View All';
      btn.disabled=true;
      return;
    }
    btn.disabled=false;
    const allOpen=groups.every(d=>d.open);
    btn.textContent=allOpen?'Show Groups':'View All';
    btn.title=allOpen?'Collapse all selection groups':'Expand all selection groups';
  }

  function setHOGroups(open){
    hoMass=true;
    hoGroups().forEach(details=>{
      const key=hoGroupKey(details);
      details.open=!!open;
      if(key)hoState.set(key,!!open);
    });
    hoMass=false;
    updateHOToggle();
  }

  function ensureHOToolbar(){
    const view=document.querySelector('.actions[aria-label="Selections view"]');
    if(!view)return;
    document.querySelectorAll('#jjHOViewAll,#jjHOShowGroups').forEach(n=>n.remove());

    let bar=document.getElementById('jjHOGroupToolbar');
    if(!bar){
      bar=document.createElement('div');
      bar.id='jjHOGroupToolbar';
      bar.innerHTML='<button type="button" id="jjHOGroupToggle" class="secondary">View All</button>';
      view.insertAdjacentElement('afterend',bar);
    }

    const btn=document.getElementById('jjHOGroupToggle');
    if(btn&&btn.dataset.bound!=='1'){
      btn.dataset.bound='1';
      btn.addEventListener('click',e=>{
        e.preventDefault();
        const groups=hoGroups();
        if(!groups.length)return;
        setHOGroups(!groups.every(d=>d.open));
      });
    }
  }

  function wrapHOSingleGroups(root){
    const data=hoItems();
    if(!data.length)return;

    const counts=new Map();
    data.forEach(item=>{
      if(item.optionGroupId){
        const id=String(item.optionGroupId);
        counts.set(id,(counts.get(id)||0)+1);
      }
    });

    [...root.querySelectorAll(':scope > article')].forEach(article=>{
      const optionId=article.querySelector('[data-option]')?.dataset.option;
      if(!optionId)return;
      const item=data.find(x=>String(x.id)===String(optionId));
      if(!item?.optionGroupId)return;

      const id=String(item.optionGroupId);
      const details=document.createElement('details');
      details.className='option-group';
      details.dataset.jjGroup=id;
      if(hoState.has(id))details.open=hoState.get(id);

      details.innerHTML=`
        <summary>${escapeHtml(item.optionGroupTitle||item.title||'Selection Group')}
          <span>${counts.get(id)||1} option${(counts.get(id)||1)===1?'':'s'} · tap to compare</span>
        </summary>
        <div class="option-group-items"></div>`;
      article.replaceWith(details);
      details.querySelector('.option-group-items').appendChild(article);
    });
  }

  function moveHOAddOption(root){
    hoGroups().forEach(details=>{
      hoGroupKey(details);
      const summary=details.querySelector(':scope > summary');
      const optionButton=details.querySelector('.option-group-items [data-option]');
      if(!summary||!optionButton)return;

      const optionId=optionButton.dataset.option;
      details.querySelectorAll('.option-group-items [data-option]').forEach(btn=>btn.remove());

      if(summary.querySelector('.jj-ho-group-add-option'))return;

      const countSpan=summary.querySelector('span');
      const countText=countSpan?.textContent?.trim()||'';
      if(countSpan)countSpan.remove();
      const titleText=(summary.textContent||'Selection Group').replace(/\s+/g,' ').trim();
      summary.textContent='';
      summary.classList.add('jj-ho-summary');

      const title=document.createElement('span');
      title.className='jj-ho-summary-title';
      title.textContent=titleText;

      const actions=document.createElement('span');
      actions.className='jj-ho-summary-actions';

      const count=document.createElement('span');
      count.className='jj-ho-summary-count';
      count.textContent=countText;

      const add=document.createElement('button');
      add.type='button';
      add.className='jj-ho-group-add-option secondary';
      add.dataset.option=optionId;
      add.textContent='+ Add Option';

      actions.append(count,add);
      summary.append(title,actions);
    });

    root.querySelectorAll(':scope > article [data-option]').forEach(btn=>btn.remove());
  }

  function bindHOToggles(){
    hoGroups().forEach(details=>{
      if(details.dataset.jjBound==='1')return;
      details.dataset.jjBound='1';
      hoGroupKey(details);
      details.addEventListener('toggle',()=>{
        if(hoMass||hoEnhancing)return;
        const key=hoGroupKey(details);
        if(key)hoState.set(key,!!details.open);
        updateHOToggle();
      });
    });
  }

  function restoreHOState(){
    hoGroups().forEach(details=>{
      const key=hoGroupKey(details);
      if(key&&hoState.has(key))details.open=hoState.get(key);
    });
  }

  function enhanceHO(){
    const root=document.getElementById('items');
    if(!root||hoEnhancing)return;
    hoEnhancing=true;
    try{
      ensureHOToolbar();
      wrapHOSingleGroups(root);
      moveHOAddOption(root);
      restoreHOState();
      bindHOToggles();

      const card=document.getElementById('cardView');
      const list=document.getElementById('listView');
      if(card){card.textContent='▦';card.title='Card view';card.setAttribute('aria-label','Card view');}
      if(list){list.textContent='☰';list.title='List view';list.setAttribute('aria-label','List view');}

      updateHOToggle();
    }finally{
      hoEnhancing=false;
    }
  }

  function installHO(){
    const root=document.getElementById('items');
    if(!root)return false;

    ensureHOToolbar();
    enhanceHO();

    const observer=new MutationObserver(()=>{
      if(hoEnhancing)return;
      setTimeout(enhanceHO,25);
    });
    observer.observe(root,{childList:true,subtree:false});

    setInterval(()=>{
      if(!document.hidden)enhanceHO();
    },1000);

    document.body.dataset.jjHomeownerGroups=VERSION;
    return true;
  }

  window.JJSelectionGroups={
    create:()=>openCreateGroup(null),
    manage:manageGroups,
    openAssign,
    expandAll:()=>setAllAppGroups(true),
    collapseAll:()=>setAllAppGroups(false)
  };

  function boot(){
    injectStyles();
    if(installHO())return;
    installApp();
  }

  if(document.readyState==='complete')setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();
