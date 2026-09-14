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
      upc:text(product.gtin)||text(product.gtin12)||text(product.gtin13)||text(product.gtin14)||text(data.upc)||text(data.gtin),
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
      'data.sku.selector':'meta[itemprop="sku"],meta[property="product:retailer_item_id"],meta[name="sku"],meta[name="model"],meta[itemprop="mpn"]',
      'data.sku.attr':'content',
      'data.upc.selector':'meta[itemprop="gtin"],meta[itemprop="gtin12"],meta[itemprop="gtin13"],meta[itemprop="gtin14"],meta[itemprop="upc"],meta[property="product:upc"],meta[name="upc"],meta[name="gtin"]',
      'data.upc.attr':'content',
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
      .jj-app-group-controls .btn{min-width:118px!important;font-size:11px!important;padding:9px 11px!important}
      .jj-group-card-button{border:1px solid var(--line,#dfe4ea);background:#fff;color:var(--navy,#14234A);border-radius:8px;padding:8px 10px;font-size:11px;font-weight:800}
      .jj-host-selection-group{grid-column:1/-1;border:1px solid #d9e0e6;border-radius:14px;background:#f8fafb;overflow:hidden;box-shadow:0 3px 12px rgba(19,35,52,.05)}
      .jj-host-selection-group>summary{display:flex;align-items:center;gap:12px;min-height:52px;padding:13px 15px;background:#fff;color:#14234a;font-size:12px;font-weight:900;cursor:pointer;list-style:none}
      .jj-host-selection-group>summary::-webkit-details-marker{display:none}.jj-host-selection-group>summary:before{content:'▸';transition:transform .15s}.jj-host-selection-group[open]>summary:before{transform:rotate(90deg)}
      .jj-host-selection-group>summary span{margin-left:auto;color:#657083;font-size:11px;font-weight:800}.jj-host-selection-group>.selection-grid{padding:14px}
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
      .jj-ho-qr-button{margin-left:auto!important}
      .jj-qr-backdrop{position:fixed;inset:0;z-index:10090;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,19,31,.72)}
      .jj-qr-dialog{width:min(430px,100%);border-radius:16px;background:#fff;padding:22px;box-shadow:0 24px 75px rgba(0,0,0,.34);text-align:center;color:#202633}
      .jj-qr-dialog h3{margin:0;color:#14234a;font-size:19px}.jj-qr-dialog p{margin:7px 0 15px;color:#657382;font-size:12px}
      .jj-qr-dialog img{width:220px;height:220px;display:block;margin:0 auto 14px;border:8px solid #fff;box-shadow:0 3px 14px rgba(9,25,39,.15)}
      .jj-qr-link{display:block;padding:9px;border-radius:8px;background:#f3f6f8;color:#4a5b6b;font-size:10px;word-break:break-all}
      .jj-qr-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.jj-qr-actions button{border:1px solid #d3dae1;border-radius:8px;background:#fff;color:#14234a;padding:8px 12px;font-size:11px;font-weight:900}.jj-qr-actions .primary{border-color:#14234a;background:#14234a;color:#fff}
      .jj-ho-page-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:16px 0 4px}.jj-ho-page-toolbar button{border:1px solid #d3dae1;border-radius:8px;background:#fff;color:#14234a;padding:8px 11px;font-size:11px;font-weight:900}.jj-ho-page-toolbar button.active,.jj-ho-page-toolbar button.primary{border-color:#14234a;background:#14234a;color:#fff}.jj-ho-page-toolbar .spacer{flex:1}.jj-ho-page-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.jj-ho-page-grid.list{grid-template-columns:1fr}.jj-ho-page-grid.list article{display:grid;grid-template-columns:150px 1fr}.jj-ho-page-grid.list article img{height:100%}@media(max-width:900px){.jj-ho-page-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.jj-ho-page-grid{grid-template-columns:1fr}.jj-ho-page-grid.list article{grid-template-columns:90px 1fr}}
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
    document.querySelectorAll('#selections details.jj-host-selection-group').forEach(details=>details.open=!!open);
    document.querySelectorAll('#selections .selection-room-group').forEach(group=>group.classList.toggle('collapsed',!open));
    updateAppGroupToggle();
  }

  function enhanceHostGroupedCards(project){
    const root=document.getElementById('selections');
    root?.querySelectorAll('.selection-room-group .selection-grid:not(.selection-list)').forEach(grid=>{
      if(grid.querySelector('.jj-host-selection-group'))return;
      const cards=[...grid.querySelectorAll(':scope > .selection-card')];
      const groups=new Map();
      cards.forEach(card=>{
        const title=card.querySelector('h3')?.textContent?.trim()||'';
        const item=(project?.selections||[]).find(x=>String(x.title||'').trim()===title);
        if(item?.optionGroupId){const id=String(item.optionGroupId);if(!groups.has(id))groups.set(id,{item,cards:[]});groups.get(id).cards.push(card)}
      });
      groups.forEach(({item,cards:members})=>{
        const details=document.createElement('details');details.className='jj-host-selection-group';details.open=true;details.dataset.selectionGroupId=String(item.optionGroupId);
        const group=(project.selectionGroups||[]).find(x=>String(x.id)===String(item.optionGroupId));
        details.innerHTML=`<summary>${escapeHtml(group?.name||item.optionGroupTitle||'Selection Group')}<span>${members.length} option${members.length===1?'':'s'} · tap to compare</span></summary><div class="selection-grid"></div>`;
        const inner=details.querySelector('.selection-grid');members.forEach(card=>inner.appendChild(card));
        grid.appendChild(details);
      });
    });
  }

  function appGroupNodes(){
    return [...document.querySelectorAll('#selections details.selection-option-group,#selections details.jj-host-selection-group,#selections .selection-room-group')];
  }

  function updateAppGroupToggle(){
    const button=document.getElementById('jjAppGroupToggle');
    if(!button)return;
    const groups=appGroupNodes();
    const allOpen=groups.length>0&&groups.every(details=>details.matches('.selection-room-group')?!details.classList.contains('collapsed'):details.open);
    button.textContent=allOpen?'Show Groups':'View All';
    button.title=allOpen?'Collapse all selection groups':'Expand all selection groups';
    button.setAttribute('aria-label',button.title);
  }

  function toggleAppGroups(){
    const groups=appGroupNodes();
    setAllAppGroups(!(groups.length>0&&groups.every(details=>details.matches('.selection-room-group')?!details.classList.contains('collapsed'):details.open)));
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
    let select=document.getElementById('selectionEditGroup');
    if(!select){
      const room=document.getElementById('selectionEditRoom');
      const roomField=room?.closest('.selection-field');
      if(!roomField)return;
      const field=document.createElement('div');field.className='selection-field';
      field.innerHTML='<label>Selection group</label><select id="selectionEditGroup"><option value="">No group / Standalone</option></select>';
      roomField.insertAdjacentElement('afterend',field);
      select=field.querySelector('#selectionEditGroup');
    }
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
        <button class="btn btn-light" type="button" onclick="window.JJSelectionGroups.manage()">Manage Groups</button>
        <button class="btn btn-light jj-ho-qr-button" type="button" onclick="window.JJSelectionGroups.openQR()">H.O. Selections / QR</button>`;
      heading.insertAdjacentElement('afterend',actions);
    }

    root.querySelectorAll('.selection-toolbar button').forEach(btn=>{
      if(/add manually/i.test(btn.textContent||''))btn.style.display='none';
    });
    root.querySelectorAll('.selection-group-action').forEach(btn=>btn.remove());

    root.querySelectorAll('.selection-card-actions button').forEach(btn=>{
      if(/another option/i.test(btn.textContent||''))btn.remove();
    });

    const viewHost=root.querySelector('.toolbar[role="group"][aria-label="Selections view"],[role="group"][aria-label="Selections view"],.selection-view-controls[aria-label="Selections view"]');
    if(viewHost&&!viewHost.querySelector('.jj-app-group-controls')){
      const controls=document.createElement('span');
      controls.className='jj-app-group-controls';
      controls.innerHTML=`
        <button class="btn btn-light" type="button" id="jjAppGroupToggle">View All</button>`;
      viewHost.appendChild(controls);
      controls.querySelector('#jjAppGroupToggle').addEventListener('click',toggleAppGroups);
    }
    updateAppGroupToggle();

    const viewButtons=[...root.querySelectorAll('[aria-label="Selections view"]>button,.toolbar[role="group"][aria-label="Selections view"]>button,.selection-view-controls[aria-label="Selections view"]>button')];
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

    // Keep group assignment available even when the host renderer uses the
    // older room-card layout instead of the option-group renderer.
    root.querySelectorAll('.selection-card').forEach(card=>{
      const h3=card.querySelector('h3');
      const actions=card.querySelector('.selection-card-actions');
      if(!h3||!actions||actions.querySelector('.jj-group-card-button'))return;
      const index=(p.selections||[]).findIndex(x=>String(x.title||'').trim()===(h3.textContent||'').trim());
      if(index<0)return;
      const button=document.createElement('button');
      button.type='button';button.className='jj-group-card-button';
      button.textContent=p.selections[index].optionGroupId?'Change Group':'Add to Group';
      button.addEventListener('click',()=>openAssign(index));
      actions.appendChild(button);
    });
    enhanceHostGroupedCards(p);
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

    const originalSave=window.saveSelectionEditor;
    if(typeof originalSave==='function'){
      window.saveSelectionEditor=function(...args){
        const groupId=document.getElementById('selectionEditGroup')?.value||'';
        const title=document.getElementById('selectionEditTitle')?.value?.trim()||'';
        const result=originalSave.apply(this,args);
        if(title){
          const p=appProject(),item=(p?.selections||[]).find(x=>String(x.title||'').trim()===title);
          if(item){
            if(groupId){const group=ensureAppGroups(p).find(x=>String(x.id)===String(groupId));if(group){item.optionGroupId=group.id;item.optionGroupTitle=group.name;}}
            else{delete item.optionGroupId;delete item.optionGroupTitle;}
            try{window.saveState?.(false);window.renderSelections?.()}catch{}
          }
        }
        return result;
      };
    }

    ensureAppGroups();
    try{window.renderSelections()}catch{}
    return true;
  }

  /* ---------------- Homeowner link + QR ---------------- */
  function homeownerUrl(project=appProject()){
    const base=(location.href||'').split('#')[0];
    return `${base}#homeowner=${encodeURIComponent(project?.id??'')}`;
  }

  function closeQR(){document.getElementById('jjQRBackdrop')?.remove();}

  async function copyHomeownerUrl(){
    const url=homeownerUrl(window.JJHomeownerProject||appProject());
    try{await navigator.clipboard.writeText(url);window.toast?.('Homeowner link copied');}
    catch{window.prompt('Copy this homeowner link:',url)}
  }

  function openHomeownerQR(project=appProject()){
    if(!project)return;
    window.JJHomeownerProject=project;
    closeQR();
    const url=homeownerUrl(project);
    const backdrop=document.createElement('div');
    backdrop.id='jjQRBackdrop';backdrop.className='jj-qr-backdrop';
    const qr=`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
    backdrop.innerHTML=`<div class="jj-qr-dialog" role="dialog" aria-modal="true" aria-label="Homeowner selections QR code"><h3>Homeowner selections</h3><p>Scan this code to open a read-only selections page for ${escapeHtml(project.name||'this job')}.</p><img src="${qr}" alt="Homeowner selections QR code"><span class="jj-qr-link">${escapeHtml(url)}</span><div class="jj-qr-actions"><button type="button" data-copy>Copy link</button><button type="button" data-close>Close</button><button type="button" class="primary" data-open>Open page</button></div></div>`;
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeQR()});
    backdrop.querySelector('[data-copy]').addEventListener('click',copyHomeownerUrl);
    backdrop.querySelector('[data-close]').addEventListener('click',closeQR);
    backdrop.querySelector('[data-open]').addEventListener('click',()=>{closeQR();renderHomeownerPage(project)});
    document.body.appendChild(backdrop);
  }

  function renderHomeownerPage(project){
    document.getElementById('jjHomeownerPage')?.remove();
    const items=Array.isArray(project.selections)?project.selections:[];
    const rooms=[...new Set(items.map(item=>item.room||'Unassigned'))];
    const page=document.createElement('div');page.id='jjHomeownerPage';page.className='jj-qr-backdrop';
    page.innerHTML=`<div class="jj-qr-dialog" style="width:min(1120px,100%);text-align:left;max-height:92vh;overflow:auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><small style="color:#b59a62;font-weight:900;letter-spacing:.8px">HOMEOWNER SELECTIONS</small><h3 style="margin-top:4px">${escapeHtml(project.name||'Selections')}</h3></div><button type="button" data-close class="primary">Close</button></div><div class="jj-ho-page-toolbar"><button type="button" data-ho-toggle>View All</button><button type="button" data-ho-view="cards" class="active" aria-label="Card view" title="Card view">▦</button><button type="button" data-ho-view="list" aria-label="List view" title="List view">☰</button><span class="spacer"></span><button type="button" data-ho-add class="primary">+ Add Selection</button></div><div id="jjHomeownerItems" style="margin-top:8px"></div></div>`;
    const root=page.querySelector('#jjHomeownerItems');
    if(!items.length){root.innerHTML='<p style="color:#657382">No selections have been added yet.</p>'}
    else root.innerHTML=rooms.map(room=>{const group=items.filter(item=>(item.room||'Unassigned')===room);return `<details class="jj-ho-page-group" open style="margin-top:16px"><summary style="display:flex;justify-content:space-between;gap:8px;cursor:pointer;color:#14234a;font-weight:900;padding:5px 0;list-style:none"><strong>${escapeHtml(room)}</strong><span style="color:#657382;font-size:11px">${group.length} selection${group.length===1?'':'s'}</span></summary><div class="jj-ho-page-grid">${group.map(item=>{const img=String(item.image||'');return `<article style="margin-top:9px;border:1px solid #dce2e9;border-radius:12px;overflow:hidden;background:#fff"><img src="${/^https?:\/\//i.test(img)?escapeHtml(img):''}" alt="" style="width:100%;height:150px;object-fit:cover;background:#f6f8f9" onerror="this.style.display='none'"><div style="padding:11px"><small style="color:#657382;font-weight:850;text-transform:uppercase">${escapeHtml(item.category||'Selection')}</small><div style="margin-top:4px;font-weight:850;color:#14234a">${escapeHtml(item.title||'Untitled selection')}</div><div style="margin-top:4px;color:#657382;font-size:11px">${escapeHtml(item.vendor||'')} ${item.model?`· ${escapeHtml(item.model)}`:''}</div></div></article>`}).join('')}</div></details>`}).join('');
    const groups=[...page.querySelectorAll('.jj-ho-page-group')];
    const toggle=page.querySelector('[data-ho-toggle]');
    const updateToggle=()=>{const allOpen=groups.length>0&&groups.every(group=>group.open);if(toggle){toggle.textContent=allOpen?'Show Groups':'View All';toggle.title=allOpen?'Collapse all selection groups':'Expand all selection groups'}};
    toggle?.addEventListener('click',()=>{const open=!(groups.length>0&&groups.every(group=>group.open));groups.forEach(group=>group.open=open);updateToggle()});
    groups.forEach(group=>group.addEventListener('toggle',updateToggle));
    page.querySelectorAll('[data-ho-view]').forEach(button=>button.addEventListener('click',()=>{page.querySelectorAll('[data-ho-view]').forEach(other=>other.classList.toggle('active',other===button));page.querySelectorAll('.jj-ho-page-grid').forEach(grid=>grid.classList.toggle('list',button.dataset.hoView==='list'))}));
    page.querySelector('[data-ho-add]')?.addEventListener('click',()=>{page.remove();closeQR();if(typeof window.openSelectionEditor==='function')window.openSelectionEditor(null,'');else window.toast?.('Open the app to add a selection')});
    updateToggle();
    page.addEventListener('click',event=>{if(event.target===page||event.target.closest('[data-close]'))page.remove()});
    document.body.appendChild(page);
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
    const view=document.querySelector('.actions[aria-label="Selections view"],[role="group"][aria-label="Selections view"],#items')?.parentElement;
    if(!view)return;
    document.querySelectorAll('#jjHOViewAll,#jjHOShowGroups').forEach(n=>n.remove());

    let bar=document.getElementById('jjHOGroupToolbar');
    if(!bar){
      bar=document.createElement('div');
      bar.id='jjHOGroupToolbar';
      bar.innerHTML='<button type="button" id="jjHOGroupToggle" class="secondary">View All</button><button type="button" id="jjHOAddSelection" class="secondary">+ Add Selection</button><button type="button" id="jjHOCardView" class="secondary" aria-label="Card view" title="Card view">▦</button><button type="button" id="jjHOListView" class="secondary" aria-label="List view" title="List view">☰</button>';
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
    const add=document.getElementById('jjHOAddSelection');
    if(add&&add.dataset.bound!=='1'){
      add.dataset.bound='1';
      add.addEventListener('click',()=>{if(typeof window.openSelectionEditor==='function')window.openSelectionEditor(null,'');else window.toast?.('Open the app to add a selection')});
    }
    const card=document.getElementById('jjHOCardView');
    const list=document.getElementById('jjHOListView');
    card?.addEventListener('click',()=>{document.getElementById('items')?.classList.remove('list');card.classList.add('active');list?.classList.remove('active')});
    list?.addEventListener('click',()=>{document.getElementById('items')?.classList.add('list');list.classList.add('active');card?.classList.remove('active')});
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
    openQR:()=>openHomeownerQR(),
    expandAll:()=>setAllAppGroups(true),
    collapseAll:()=>setAllAppGroups(false)
  };

  function boot(){
    injectStyles();
    const match=(location.hash||'').match(/^#homeowner=(.+)$/);
    if(match){
      const id=decodeURIComponent(match[1]);
      let project=null;
      try{const saved=JSON.parse(localStorage.getItem('jj_full_proto')||'null');project=saved?.projects?.find(item=>String(item.id)===String(id))||null}catch{}
      project=project||appProject();
      if(project){window.JJHomeownerProject=project;setTimeout(()=>renderHomeownerPage(project),0);return;}
    }
    if(installHO())return;
    installApp();
  }

  if(document.readyState==='complete')setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();
