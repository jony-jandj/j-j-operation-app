/* J&J shared product lookup + selections group UI v77 */
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
  const VERSION='v77';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function injectStyles(){
    if(document.getElementById('jj-selection-groups-v77'))return;
    const style=document.createElement('style');
    style.id='jj-selection-groups-v77';
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
      .jj-qr-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px}.jj-qr-actions button{border:1px solid #d3dae1;border-radius:8px;background:#fff;color:#14234a;padding:8px 12px;font-size:11px;font-weight:900}.jj-qr-actions .primary{border-color:#14234a;background:#14234a;color:#fff}
      .jj-ho-add-backdrop{position:fixed;inset:0;z-index:10130;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,19,31,.7)}
      .jj-ho-add-dialog{width:min(720px,100%);max-height:calc(100dvh - 36px);overflow:auto;border-radius:16px;background:#fff;color:#202633;box-shadow:0 24px 75px rgba(0,0,0,.32)}
      .jj-ho-add-dialog header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #e2e7ec;background:#fff}.jj-ho-add-dialog header small{display:block;color:#9b7a37;font-size:12px;font-weight:900;letter-spacing:.8px}.jj-ho-add-dialog h3{margin:3px 0 0;color:#172248;font-size:22px}.jj-ho-add-dialog header button{width:38px;height:38px;border:1px solid #d5dce3;border-radius:9px;background:#fff;color:#172248;font-size:24px}
      .jj-ho-add-dialog form{padding:20px}.jj-ho-add-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.jj-ho-add-grid label{display:grid;gap:7px;color:#26344a;font-size:14px;font-weight:750}.jj-ho-add-grid input,.jj-ho-add-grid select,.jj-ho-add-grid textarea{width:100%;box-sizing:border-box;border:1px solid #cfd7df;border-radius:8px;background:#fff;color:#202633;padding:11px 12px;font:inherit;font-weight:400}.jj-ho-add-wide{grid-column:1/-1}.jj-ho-lookup{align-self:end;min-height:44px;border:0;border-radius:8px;background:#172248;color:#fff;padding:10px 14px;font-size:14px;font-weight:800}.jj-ho-drop{display:block;padding:18px;border:1.5px dashed #aeb9c4;border-radius:9px;background:#f7f9fb;color:#536171;text-align:center;font-weight:500}.jj-ho-drop.is-dragging{border-color:#172248;background:#eef2f7}.jj-ho-add-note{margin:16px 0 0;padding:12px 14px;border-radius:8px;background:#fff2c9;font-size:14px}.jj-ho-add-message{min-height:21px;margin-top:9px;color:#315f48;font-size:14px}.jj-ho-add-dialog footer{display:flex;justify-content:flex-end;gap:9px;margin-top:16px}.jj-ho-add-dialog footer button{border:1px solid #ccd5de;border-radius:8px;padding:10px 15px;font-size:14px;font-weight:800}.jj-ho-add-dialog footer .secondary{background:#fff;color:#172248}.jj-ho-add-dialog footer .primary{border-color:#172248;background:#172248;color:#fff}
      @media(max-width:620px){.jj-ho-add-backdrop{align-items:stretch;padding:0}.jj-ho-add-dialog{width:100%;max-height:100dvh;border-radius:0}.jj-ho-add-grid{grid-template-columns:1fr}.jj-ho-add-wide{grid-column:auto}.jj-ho-add-dialog form{padding:18px}.jj-ho-lookup{width:100%}}
      .jj-ho-page-backdrop{align-items:stretch;justify-content:stretch;padding:0;background:#f1f3f6}.jj-ho-page-shell{width:100%;min-height:100%;max-height:none;overflow:auto;border-radius:0;background:#f1f3f6;color:#202633}.jj-ho-page-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px clamp(16px,4vw,48px);background:#172248;color:#fff;position:sticky;top:0;z-index:2;font-size:14px}.jj-ho-page-head>div:last-child{display:flex;gap:8px}.jj-ho-page-brand{display:flex;align-items:center;gap:10px;font-weight:500}.jj-ho-page-brand-mark{display:none}.jj-ho-page-head button{border:1px solid rgba(255,255,255,.35);border-radius:7px;background:#fff;color:#14234a;padding:7px 10px;font-size:11px;font-weight:800}.jj-ho-page-body{width:min(1120px,calc(100% - 48px));margin:0 auto;padding:44px 0 60px}.jj-ho-page-title{display:block;margin-bottom:20px}.jj-ho-page-title h2{margin:0;color:#172248;font-size:29px;line-height:1.18}.jj-ho-page-title p{margin:18px 0 0;color:#202633;font-size:17px;line-height:1.4}.jj-ho-page-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:0 0 22px;padding:0;border:0}.jj-ho-page-toolbar button{border:0;border-radius:8px;background:#172248;color:#fff;padding:11px 15px;font-size:14px;font-weight:700}.jj-ho-page-toolbar button[data-ho-view]{min-width:42px;padding:10px 12px;border:1px solid #d2d8df;background:#fff;color:#172248;font-size:18px;line-height:1}.jj-ho-page-toolbar button[data-ho-view].active,.jj-ho-page-toolbar button.primary{background:#172248;color:#fff;border-color:#172248}.jj-ho-page-toolbar .spacer{flex:1}.jj-ho-page-sync{margin:0 0 22px;padding:18px 20px;background:#fff2c9;color:#202633;font-size:15px}.jj-ho-page-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.jj-ho-page-grid.list{grid-template-columns:1fr}.jj-ho-page-grid.list article{display:grid;grid-template-columns:180px minmax(0,1fr);align-items:start}.jj-ho-page-grid.list article .jj-ho-page-card-body{grid-column:2}.jj-ho-page-grid.list article>div:first-child:has(.empty){display:none}.jj-ho-page-card{border:1px solid #d3d5d8;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 1px 4px rgba(19,35,52,.04)}.jj-ho-page-card.is-selected{border:2px solid #39815f}.jj-ho-page-card>div:first-child:empty{display:none}.jj-ho-page-card>div:first-child:has(.empty){display:none}.jj-ho-page-card img{width:100%;height:220px;display:block;object-fit:contain;background:#fff}.jj-ho-page-card .empty{display:none}.jj-ho-page-card-body{padding:18px}.jj-ho-page-card-body .eyebrow{font-size:11px;color:#6b6f76;letter-spacing:0}.jj-ho-page-card-body h4{margin:10px 0 12px;color:#172248;font-size:17px;line-height:1.3}.jj-ho-page-card-body p{margin:7px 0;color:#202633;font-size:14px;line-height:1.4}.jj-ho-page-card-body strong{display:block;margin-top:10px;color:#172248;font-size:16px}.jj-ho-page-card-description{color:#202633!important}.jj-ho-page-card-label{color:#202633!important;font-size:14px!important}.jj-ho-page-status-selected{margin:0 0 12px;color:#317653;font-size:16px;font-weight:800}.jj-ho-page-card .jj-ho-select-button{border:0;border-radius:8px;background:#172248;color:#fff;padding:9px 12px;font-size:14px;font-weight:700}.jj-ho-page-group{margin-top:28px}.jj-ho-page-group>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:0 0 12px;color:#172248;font-size:18px;font-weight:900;list-style:none}.jj-ho-page-group>summary::-webkit-details-marker{display:none}.jj-ho-page-group>summary:before{content:'▸';margin-right:7px;transition:transform .15s}.jj-ho-page-group[open]>summary:before{transform:rotate(90deg)}.jj-ho-page-group>summary span{margin-left:auto;color:#657382;font-size:13px;font-weight:700}@media(max-width:900px){.jj-ho-page-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.jj-ho-page-body{width:calc(100% - 32px);padding:30px 0 42px}.jj-ho-page-head{padding:14px 18px}.jj-ho-page-head>div:last-child button{padding:7px 8px;font-size:10px}.jj-ho-page-title h2{font-size:24px}.jj-ho-page-title p{margin-top:12px;font-size:16px}.jj-ho-page-toolbar{align-items:stretch}.jj-ho-page-toolbar .spacer{display:none}.jj-ho-page-toolbar button[data-ho-view]:first-of-type{margin-left:auto}.jj-ho-page-grid{grid-template-columns:1fr}.jj-ho-page-card img{height:190px}.jj-ho-page-card-body{padding:20px}.jj-ho-page-card-body h4{font-size:18px}.jj-ho-page-card-body p{font-size:15px}.jj-ho-page-grid.list article{display:block}.jj-ho-page-grid.list article>div:first-child:has(.empty){display:none}}
      @media(max-width:620px){.jj-ho-page-toolbar button[data-ho-view="cards"]{margin-left:auto}}
      .jj-ho-page-card .jj-ho-undo-button{margin-top:4px;border:1px solid #8bb09a;background:#fff;color:#246344}
      /* Cohesive homeowner selections */
      .jj-ho-page-backdrop{padding:0;background:#f4f6f8}
      .jj-ho-page-shell{width:100%;min-height:100%;max-height:none;overflow:auto;border-radius:0;background:#f4f6f8;color:#202633}
      .jj-ho-page-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:66px;padding:0 clamp(18px,4vw,52px);background:#172248;color:#fff;border-bottom:1px solid rgba(255,255,255,.12);box-shadow:0 4px 18px rgba(14,31,54,.12)}
      .jj-ho-page-brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:850}
      .jj-ho-page-brand small{padding-left:10px;border-left:1px solid rgba(255,255,255,.28);color:#c8d2e0;font-size:13px;font-weight:650}
      .jj-ho-page-logo{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#f0b742;color:#10223f;font-size:12px;font-weight:950}
      .jj-ho-page-head>button{min-height:38px;border:1px solid rgba(255,255,255,.32);border-radius:8px;background:#fff;color:#172248;padding:8px 13px;font-size:12px;font-weight:850}
      .jj-ho-page-body{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:38px 0 64px}
      .jj-ho-page-title{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:20px}
      .jj-ho-page-title>div>small{display:block;margin-bottom:5px;color:#a7833f;font-size:12px;font-weight:900;letter-spacing:1px}
      .jj-ho-page-title h2{margin:0;color:#172248;font-size:30px;line-height:1.15}
      .jj-ho-page-title p{margin:7px 0 0;color:#657382;font-size:16px;line-height:1.45}
      .jj-ho-page-progress{display:grid;flex:none;grid-template-columns:auto auto;align-items:baseline;gap:6px;padding-bottom:3px;color:#172248;white-space:nowrap}
      .jj-ho-page-progress strong{font-size:25px;line-height:1}
      .jj-ho-page-progress span{color:#687789;font-size:13px;font-weight:700}
      .jj-ho-page-sync{margin:0 0 16px;padding:13px 16px;border:1px solid #d9e7df;border-radius:10px;background:#f3faf6;color:#315f48;font-size:14px}
      .jj-ho-page-sync.is-warning{border-color:#ecd98f;background:#fff5cc;color:#665521}
      .jj-ho-page-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 24px;padding:0;border:0}
      .jj-ho-toolbar-left,.jj-ho-view-switch{display:flex;align-items:center;gap:8px}
      .jj-ho-page-toolbar button{min-height:42px;border:1px solid #172248;border-radius:9px;background:#172248;color:#fff;padding:9px 14px;font-size:14px;font-weight:800}
      .jj-ho-page-toolbar button:hover{filter:brightness(1.08)}
      .jj-ho-page-toolbar button:focus-visible{outline:3px solid rgba(240,183,66,.45);outline-offset:2px}
      .jj-ho-view-switch{margin-left:auto;padding:3px;border:1px solid #d8dee5;border-radius:10px;background:#e9edf1}
      .jj-ho-page-toolbar .jj-ho-view-switch button{width:40px;min-width:40px;min-height:36px;padding:0;border:0;background:transparent;color:#617080;font-size:18px;line-height:1}
      .jj-ho-page-toolbar .jj-ho-view-switch button.active{background:#fff;color:#172248;box-shadow:0 1px 4px rgba(15,32,49,.14)}
      #jjHomeownerItems{display:grid;gap:22px}
      .jj-ho-page-group{margin:0}
      .jj-ho-page-group>summary{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:48px;padding:0 2px 10px;border-bottom:1px solid #dbe1e7;color:#172248;cursor:pointer;font-size:18px;font-weight:900;list-style:none}
      .jj-ho-page-group>summary::-webkit-details-marker{display:none}
      .jj-ho-page-group>summary:before{content:'▸';flex:none;margin-right:-5px;transition:transform .15s}
      .jj-ho-page-group[open]>summary:before{transform:rotate(90deg)}
      .jj-ho-page-group>summary>div{display:flex;min-width:0;flex:1;align-items:baseline;gap:10px}
      .jj-ho-page-group>summary>div strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .jj-ho-page-group>summary>div small{color:#71808e;font-size:12px;font-weight:700;white-space:nowrap}
      .jj-ho-page-group>summary>span{margin-left:auto;color:#71808e;font-size:13px;font-weight:700;white-space:nowrap}
      .jj-ho-page-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,360px));gap:16px;padding-top:15px;align-items:start}
      .jj-ho-page-card{display:flex;min-width:0;flex-direction:column;border:1px solid #d7dde3;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 3px 12px rgba(15,32,49,.06)}
      .jj-ho-page-card.is-selected{border:2px solid #3b805f}
      .jj-ho-page-photo{display:grid;height:210px;place-items:center;overflow:hidden;border-bottom:1px solid #e9edf0;background:#fff}
      .jj-ho-page-card.no-photo .jj-ho-page-photo{display:none}
      .jj-ho-page-photo img{display:block;width:100%;height:100%;object-fit:contain;background:#fff}
      .jj-ho-photo-empty{display:grid;place-items:center;gap:7px;width:100%;height:100%;min-height:150px;background:#f7f9fa;color:#82909d;text-align:center}
      .jj-ho-photo-empty span{font-size:24px}.jj-ho-photo-empty small{font-size:12px;font-weight:750}
      .jj-ho-page-card-body{min-width:0;padding:18px}
      .jj-ho-page-card-body .eyebrow{color:#7b8793;font-size:11px;font-weight:850;letter-spacing:.35px;text-transform:uppercase}
      .jj-ho-page-card-body h4{margin:7px 0 10px;color:#172248;font-size:18px;line-height:1.3}
      .jj-ho-page-status-selected{margin:0 0 10px;color:#317653;font-size:14px;font-weight:850}
      .jj-ho-page-card-description{margin:0 0 14px!important;color:#5c6a78!important;font-size:14px!important;line-height:1.45!important}
      .jj-ho-card-details{display:grid;gap:0;border-top:1px solid #edf0f3}
      .jj-ho-card-details p{display:grid;grid-template-columns:105px minmax(0,1fr);gap:10px;margin:0!important;padding:7px 0;border-bottom:1px solid #edf0f3;color:#263443!important;font-size:14px!important;line-height:1.35!important;overflow-wrap:anywhere}
      .jj-ho-card-details p span{color:#6f7d8b;font-weight:650}
      .jj-ho-card-actions{display:flex;gap:8px;margin-top:14px}
      .jj-ho-card-actions button{min-height:38px;border:0;border-radius:8px;background:#172248;color:#fff;padding:8px 12px;font-size:13px;font-weight:800}
      .jj-ho-card-actions .jj-ho-undo-button{margin:0;border:1px solid #80aa92;background:#f7fbf8;color:#286646}
      .jj-ho-page-grid.list{display:grid;grid-template-columns:1fr;gap:12px}
      .jj-ho-page-grid.list .jj-ho-page-card{display:grid;grid-template-columns:190px minmax(0,1fr);max-width:none}
      .jj-ho-page-grid.list .jj-ho-page-card.no-photo{grid-template-columns:1fr}
      .jj-ho-page-grid.list .jj-ho-page-photo{height:100%;min-height:220px;border-right:1px solid #e9edf0;border-bottom:0}
      .jj-ho-page-grid.list .jj-ho-page-card-body{grid-column:auto;padding:18px 20px}
      .jj-ho-empty-state{display:grid;place-items:center;gap:6px;min-height:220px;border:1px dashed #c8d0d8;border-radius:14px;background:#fff;color:#657382;text-align:center}
      .jj-ho-empty-state strong{color:#172248;font-size:18px}
      @media(max-width:760px){
        .jj-ho-page-head{min-height:60px;padding:0 16px}.jj-ho-page-brand{font-size:14px}.jj-ho-page-brand small{display:none}
        .jj-ho-page-body{width:calc(100% - 28px);padding:26px 0 44px}
        .jj-ho-page-title{display:block}.jj-ho-page-title h2{font-size:25px}.jj-ho-page-title p{font-size:15px}.jj-ho-page-progress{margin-top:12px;justify-content:start}
        .jj-ho-page-toolbar{align-items:flex-start}.jj-ho-toolbar-left{flex:1;flex-wrap:wrap}.jj-ho-view-switch{flex:none;margin-left:auto}
        .jj-ho-page-toolbar button{min-height:40px;padding:8px 11px;font-size:13px}
        .jj-ho-page-grid{grid-template-columns:1fr}.jj-ho-page-photo{height:190px}
        .jj-ho-page-grid.list .jj-ho-page-card{display:flex;flex-direction:column}.jj-ho-page-grid.list .jj-ho-page-card.no-photo{display:flex}.jj-ho-page-grid.list .jj-ho-page-photo{height:190px;min-height:190px;border-right:0;border-bottom:1px solid #e9edf0}
        .jj-ho-page-group>summary{align-items:flex-start;flex-wrap:wrap}.jj-ho-page-group>summary>div{align-items:flex-start;flex-direction:column;gap:2px}.jj-ho-page-group>summary>span{padding-top:3px}
      }
      @media(max-width:460px){
        .jj-ho-page-toolbar{flex-wrap:wrap}.jj-ho-toolbar-left{width:100%;flex-basis:100%}.jj-ho-view-switch{margin-left:0}
        .jj-ho-page-toolbar button{flex:1}.jj-ho-page-toolbar .jj-ho-view-switch button{flex:none}
        .jj-ho-page-title h2{font-size:23px}.jj-ho-page-card-body{padding:16px}.jj-ho-card-details p{grid-template-columns:94px minmax(0,1fr)}
      }
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

      return `<details class="selection-option-group" data-selection-group-id="${escapeHtml(first.optionGroupId)}">
        <summary class="selection-option-group-title">
          <span>${escapeHtml(groupTitle)}</span>
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
        const details=document.createElement('details');details.className='jj-host-selection-group';details.open=false;details.dataset.selectionGroupId=String(item.optionGroupId);
        const group=(project.selectionGroups||[]).find(x=>String(x.id)===String(item.optionGroupId));
        details.innerHTML=`<summary>${escapeHtml(group?.name||item.optionGroupTitle||'Selection Group')}</summary><div class="selection-grid"></div>`;
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
    if(typeof window.isSelectionGroupMode==='function'){
      const grouped=window.isSelectionGroupMode();
      button.textContent=grouped?'Show All':'Show Groups';
      button.title=grouped?'Show all selections':'Show named selection groups';
      button.setAttribute('aria-label',button.title);
      return;
    }
    const groups=appGroupNodes();
    const allOpen=groups.length>0&&groups.every(details=>details.matches('.selection-room-group')?!details.classList.contains('collapsed'):details.open);
    button.textContent=allOpen?'Show Groups':'View All';
    button.title=allOpen?'Collapse all selection groups':'Expand all selection groups';
    button.setAttribute('aria-label',button.title);
  }

  function toggleAppGroups(){
    if(typeof window.setSelectionGroupMode==='function'&&typeof window.isSelectionGroupMode==='function'){
      window.setSelectionGroupMode(!window.isSelectionGroupMode());
      return;
    }
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
    pullHomeownerPortal(p);

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
    root.querySelectorAll('.selection-group-action').forEach(btn=>btn.remove());

    root.querySelectorAll('.selection-card-actions button').forEach(btn=>{
      if(/another option/i.test(btn.textContent||''))btn.remove();
    });

    const viewHost=root.querySelector('.toolbar[role="group"][aria-label="Selections view"],[role="group"][aria-label="Selections view"],.selection-view-controls[aria-label="Selections view"]');
    if(viewHost&&!root.querySelector('#jjAppGroupToggle')){
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
    // The app renderer owns the named-group layout. Do not wrap its cards in
    // room/category containers, which would reintroduce the old grouping.
  }

  function installApp(){
    if(typeof window.renderSelections!=='function'||typeof window.selectedProject!=='function')return false;

    // The app's legacy Customer View buttons should open the same H.O. page
    // as a shared homeowner link, so the preview and QR destination never
    // drift into two different designs.
    window.openHomeownerView=async(project=appProject())=>{if(project){window.JJGuestMode=false;await syncHomeownerPortal(project);renderHomeownerPage(project)}};
    window.openHomeownerShare=(project=window.JJHomeownerProject||appProject())=>{if(project)openHomeownerQR(project)};

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
  function makePortalToken(){
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,char=>{const value=Math.random()*16|0;return (char==='x'?value:(value&3|8)).toString(16)});
  }

  function ensurePortalToken(project){
    if(!project.homeownerPortalToken)project.homeownerPortalToken=makePortalToken();
    return String(project.homeownerPortalToken);
  }

  function homeownerSnapshot(project){
    const allowed=['id','title','vendor','model','sku','upc','gtin','description','url','image','quantity','status','purchasedBy','category','room','optionGroupId','optionGroupTitle','selectedAt','leadTimeValue','leadTimeUnit'];
    return {id:project.id,name:project.name||'Homeowner selections',jobNo:project.jobNo||'',type:project.type||'',selectionGroups:(project.selectionGroups||[]).map(group=>({id:group.id,name:group.name})),selections:(project.selections||[]).map(item=>Object.fromEntries(allowed.filter(key=>item[key]!==undefined).map(key=>[key,item[key]])))};
  }

  function mergeHomeownerPortal(project,portal){
    if(!project||!portal)return false;
    let changed=false;
    if(!Array.isArray(project.selections))project.selections=[];
    const byId=new Map(project.selections.map(item=>[String(item.id),item]));
    (portal.selections||[]).forEach(incoming=>{
      const current=byId.get(String(incoming.id));
      if(current){
        ['status','selectedAt'].forEach(key=>{if(incoming[key]!==undefined&&current[key]!==incoming[key]){current[key]=incoming[key];changed=true}});
      }else{
        project.selections.push({...incoming,unitPrice:0,addTax:false,purchasedBy:incoming.purchasedBy||'Homeowner'});
        changed=true;
      }
    });
    if(!Array.isArray(project.selectionGroups))project.selectionGroups=[];
    (portal.selectionGroups||[]).forEach(group=>{if(group?.id&&!project.selectionGroups.some(current=>String(current.id)===String(group.id))){project.selectionGroups.push({id:group.id,name:group.name||'Selection Group'});changed=true}});
    return changed;
  }

  async function syncHomeownerPortal(project){
    if(!project)return false;
    const token=ensurePortalToken(project);
    window.JJHomeownerToken=token;
    try{window.saveState?.(false)}catch{}
    const client=window.homeownerPortalClient?.(token);
    if(!client)return false;
    const current=await client.from('homeowner_portals').select('data').eq('token',token).maybeSingle();
    if(current?.data?.data&&mergeHomeownerPortal(project,current.data.data))try{window.saveState?.(false)}catch{}
    const result=await client.from('homeowner_portals').upsert({token,project_id:String(project.id),project_name:project.name||'Homeowner selections',data:homeownerSnapshot(project),updated_at:new Date().toISOString()},{onConflict:'token'});
    if(result?.error){console.warn('Homeowner portal could not sync:',result.error);return false}
    return true;
  }

  let portalPulling=false;
  let portalPulledAt=0;
  async function pullHomeownerPortal(project,force=false){
    const token=project?.homeownerPortalToken;
    if(!token||portalPulling||(!force&&Date.now()-portalPulledAt<15000))return false;
    const client=window.homeownerPortalClient?.(token);
    if(!client)return false;
    portalPulling=true;portalPulledAt=Date.now();
    try{
      const result=await client.from('homeowner_portals').select('data').eq('token',String(token)).maybeSingle();
      if(result?.error||!result?.data?.data)return false;
      if(!mergeHomeownerPortal(project,result.data.data))return false;
      try{window.saveState?.(false)}catch{}
      try{window.renderSelections?.()}catch{}
      return true;
    }finally{portalPulling=false}
  }

  async function updateHomeownerPortal(project){
    const token=window.JJHomeownerToken||project?.homeownerPortalToken;
    const client=window.homeownerPortalClient?.(token);
    if(!client||!token)return false;
    const result=await client.from('homeowner_portals').update({project_name:project.name||'Homeowner selections',data:homeownerSnapshot(project),updated_at:new Date().toISOString()}).eq('token',String(token));
    if(result?.error){console.warn('Homeowner change could not sync:',result.error);return false}
    return true;
  }

  function homeownerRoute(){
    const params=new URLSearchParams((location.hash||'').replace(/^#/,''));
    return {id:params.get('homeowner')||'',token:params.get('token')||''};
  }

  function homeownerUrl(project=appProject()){
    const base=(location.href||'').split('#')[0];
    const token=ensurePortalToken(project);
    return `${base}#homeowner=${encodeURIComponent(project?.id??'')}&token=${encodeURIComponent(token)}`;
  }

  function closeQR(){document.getElementById('jjQRBackdrop')?.remove();}

  async function copyHomeownerUrl(){
    const project=window.JJHomeownerProject||appProject();
    const synced=await syncHomeownerPortal(project);
    if(!synced)window.toast?.('Guest portal setup is not complete');
    const url=homeownerUrl(project);
    try{await navigator.clipboard.writeText(url);window.toast?.('Homeowner link copied');}
    catch{window.prompt('Copy this homeowner link:',url)}
  }

  async function createNewHomeownerQR(project){
    if(!project)return;
    const approved=window.confirm('Create a new QR code for this job? Only do this when you want to replace the current printed QR code.');
    if(!approved)return;
    const oldToken=String(project.homeownerPortalToken||'');
    if(oldToken){
      try{await window.homeownerPortalClient?.(oldToken)?.from('homeowner_portals').delete().eq('token',oldToken)}catch(error){console.warn('Old homeowner QR could not be retired:',error)}
    }
    project.homeownerPortalToken=makePortalToken();
    window.JJHomeownerToken=project.homeownerPortalToken;
    try{window.saveState?.(false)}catch{}
    closeQR();
    await openHomeownerQR(project);
    window.toast?.('New homeowner QR code created');
  }

  async function openHomeownerQR(project=appProject()){
    if(!project)return;
    window.JJHomeownerProject=project;
    const synced=await syncHomeownerPortal(project);
    closeQR();
    const url=homeownerUrl(project);
    const backdrop=document.createElement('div');
    backdrop.id='jjQRBackdrop';backdrop.className='jj-qr-backdrop';
    const qr=`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
    backdrop.innerHTML=`<div class="jj-qr-dialog" role="dialog" aria-modal="true" aria-label="Homeowner selections QR code"><h3>Homeowner selections</h3><p>${synced?`Scan this code to view and add selections for ${escapeHtml(project.name||'this job')}. This QR stays the same unless you choose Create New QR Code.`:'Guest access is not connected yet. Run the homeowner guest SQL setup before sharing this code.'}</p><img src="${qr}" alt="Homeowner selections QR code"><span class="jj-qr-link">${escapeHtml(url)}</span><div class="jj-qr-actions"><button type="button" data-new>Create New QR Code</button><button type="button" data-copy>Copy link</button><button type="button" data-close>Close</button><button type="button" class="primary" data-open>Open page</button></div></div>`;
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeQR()});
    backdrop.querySelector('[data-copy]').addEventListener('click',copyHomeownerUrl);
    backdrop.querySelector('[data-new]').addEventListener('click',()=>createNewHomeownerQR(project));
    backdrop.querySelector('[data-close]').addEventListener('click',closeQR);
    backdrop.querySelector('[data-open]').addEventListener('click',()=>{closeQR();renderHomeownerPage(project)});
    document.body.appendChild(backdrop);
  }

  function selectionMoneySafe(item){
    const subtotal=Number(item?.unitPrice||0)*Math.max(1,Number(item?.quantity||1));
    const total=subtotal+(item?.addTax?subtotal*.0825:0);
    return total.toLocaleString('en-US',{style:'currency',currency:'USD'});
  }

  function homeownerGroupBuckets(project,items){
    const buckets=[];
    const byId=new Map();
    (Array.isArray(project?.selectionGroups)?project.selectionGroups:[]).forEach(group=>{
      const id=String(group?.id||'');
      if(!id)return;
      const bucket={id,name:String(group.name||'Selection Group'),items:[]};
      buckets.push(bucket);byId.set(id,bucket);
    });
    const ungrouped=[];
    items.forEach(item=>{
      const id=String(item?.optionGroupId||'');
      const bucket=id&&byId.get(id);
      if(bucket)bucket.items.push(item);
      else if(id&&item?.optionGroupTitle){
        let legacy=buckets.find(group=>group.id===`legacy:${item.optionGroupTitle}`);
        if(!legacy){legacy={id:`legacy:${item.optionGroupTitle}`,name:String(item.optionGroupTitle),items:[]};buckets.push(legacy)}
        legacy.items.push(item);
      }else ungrouped.push(item);
    });
    buckets.filter(group=>group.items.length===0).forEach(group=>{group.empty=true});
    if(ungrouped.length)buckets.push({id:'ungrouped',name:'Ungrouped selections',items:ungrouped});
    return buckets.filter(group=>group.items.length||group.id==='ungrouped');
  }

  function homeownerImage(value){
    const raw=String(value||'').trim();
    return /^https?:\/\//i.test(raw)||/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(raw)?raw:'';
  }

  function closeHomeownerPage(page){
    page?.remove();
    if(/^#homeowner=/.test(location.hash||'')){
      history.replaceState(null,'',location.pathname+location.search);
      installApp();
    }
  }

  async function markHomeownerSelected(project,id){
    const item=(project?.selections||[]).find(entry=>String(entry.id||'')===String(id));
    if(!item)return;
    item.status='Selected';
    item.selectedAt=new Date().toISOString();
    try{window.saveState?.(false)}catch{}
    try{
      const saved=JSON.parse(localStorage.getItem('jj_full_proto')||'null');
      const savedProject=saved?.projects?.find(entry=>String(entry.id)===String(project.id));
      const savedItem=savedProject?.selections?.find(entry=>String(entry.id||'')===String(id));
      if(savedItem)Object.assign(savedItem,item);
      if(saved) localStorage.setItem('jj_full_proto',JSON.stringify(saved));
    }catch{}
    await updateHomeownerPortal(project);
    renderHomeownerPage(project);
  }

  async function undoHomeownerSelected(project,id){
    const item=(project?.selections||[]).find(entry=>String(entry.id||'')===String(id));
    if(!item||item.status!=='Selected')return;
    item.status='Pending';
    delete item.selectedAt;
    try{window.saveState?.(false)}catch{}
    saveHomeownerGuestProject(project);
    await updateHomeownerPortal(project);
    renderHomeownerPage(project);
  }

  function saveHomeownerGuestProject(project){
    try{
      const saved=JSON.parse(localStorage.getItem('jj_full_proto')||'null')||{projects:[],selectedProjectId:project.id,currentUser:''};
      if(!Array.isArray(saved.projects))saved.projects=[];
      const index=saved.projects.findIndex(entry=>String(entry.id)===String(project.id));
      if(index>=0)saved.projects[index]=project;else saved.projects.push(project);
      saved.selectedProjectId=project.id;
      localStorage.setItem('jj_full_proto',JSON.stringify(saved));
      return true;
    }catch(error){console.warn('Homeowner selection could not be saved locally:',error);return false}
  }

  function openHomeownerAddDialog(project,page){
    document.getElementById('jjHOAddDialog')?.remove();
    const groups=Array.isArray(project.selectionGroups)?project.selectionGroups:[];
    const backdrop=document.createElement('div');
    backdrop.id='jjHOAddDialog';backdrop.className='jj-ho-add-backdrop';
    backdrop.innerHTML=`<div class="jj-ho-add-dialog" role="dialog" aria-modal="true" aria-label="Add homeowner selection"><header><div><small>HOMEOWNER SELECTION</small><h3>Add a selection</h3></div><button type="button" data-close aria-label="Close">×</button></header><form><div class="jj-ho-add-grid"><label>Product link (optional)<input name="url" type="url" placeholder="Paste a product link"></label><button type="button" class="jj-ho-lookup" data-lookup>Look up details</button><label>Product name<input name="title" required placeholder="What would you like to add?"></label><label>Room<input name="room" placeholder="Primary bathroom, kitchen…"></label><label>Category<input name="category" placeholder="Tile, plumbing, lighting…"></label><label>Vendor<input name="vendor" placeholder="Store or brand"></label><label>Model / SKU #<input name="model" placeholder="Optional"></label><label>UPC code #<input name="upc" placeholder="Optional"></label><label>Quantity<input name="quantity" type="number" min="1" step="1" value="1"></label><label>Selection group<select name="group"><option value="">Ungrouped selections</option>${groups.map(group=>`<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join('')}</select></label><label class="jj-ho-add-wide">Description / finish / color<textarea name="description" rows="3" placeholder="Notes or product details"></textarea></label><label class="jj-ho-add-wide">Product photo<input name="imageFile" type="file" accept="image/*"><span class="jj-ho-drop" data-drop>Drag and drop an image here, or choose a file</span><input name="image" type="hidden"></label></div><p class="jj-ho-add-note">Prices are not requested or shown for homeowner-added selections.</p><div class="jj-ho-add-message" data-message></div><footer><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Add selection</button></footer></form></div>`;
    document.body.appendChild(backdrop);
    const form=backdrop.querySelector('form');
    const message=backdrop.querySelector('[data-message]');
    const close=()=>backdrop.remove();
    backdrop.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',close));
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)close()});
    const setMessage=text=>{if(message)message.textContent=text||''};
    const imageInput=form.elements.imageFile;
    const imageHidden=form.elements.image;
    const readImage=file=>{if(!file||!file.type.startsWith('image/'))return;const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{const max=1200,scale=Math.min(1,max/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);imageHidden.value=canvas.toDataURL('image/jpeg',.82);backdrop.querySelector('[data-drop]').textContent='Image ready';};image.src=String(reader.result||'');};reader.readAsDataURL(file)};
    imageInput.addEventListener('change',()=>readImage(imageInput.files?.[0]));
    const drop=backdrop.querySelector('[data-drop]');
    ['dragenter','dragover'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('is-dragging')}));
    ['dragleave','drop'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('is-dragging')}));
    drop.addEventListener('drop',event=>readImage(event.dataTransfer?.files?.[0]));
    backdrop.querySelector('[data-lookup]')?.addEventListener('click',async()=>{
      const url=form.elements.url.value.trim();
      if(!url){setMessage('Paste a product link first.');return;}
      if(!window.JJProduct?.lookup){setMessage('Product lookup is unavailable right now.');return;}
      setMessage('Looking up product details…');
      const result=await window.JJProduct.lookup(url);
      if(!result){setMessage('I could not read that page. You can still enter the details manually.');return;}
      ['title','vendor','model','upc','description','category'].forEach(key=>{if(result[key]&&form.elements[key])form.elements[key].value=result[key]});
      if(result.image&&!imageHidden.value){imageHidden.value=result.image;drop.textContent='Product image found';}
      setMessage('Product details added. Review them, then select Add selection.');
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const data=new FormData(form);
      const title=String(data.get('title')||'').trim();
      if(!title){setMessage('Enter a product name.');return}
      const groupId=String(data.get('group')||'');
      const group=groups.find(entry=>String(entry.id)===groupId);
      const item={id:'sel-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),title,vendor:String(data.get('vendor')||'').trim(),model:String(data.get('model')||'').trim(),upc:String(data.get('upc')||'').trim(),description:String(data.get('description')||'').trim(),url:String(data.get('url')||'').trim(),image:String(data.get('image')||'').trim(),quantity:Math.max(1,Number(data.get('quantity')||1)),status:'Pending',purchasedBy:'Homeowner',unitPrice:0,addTax:false,category:String(data.get('category')||'').trim(),room:String(data.get('room')||'').trim()||'Unassigned'};
      if(group){item.optionGroupId=group.id;item.optionGroupTitle=group.name;}
      if(!Array.isArray(project.selections))project.selections=[];
      project.selections.push(item);
      const saved=saveHomeownerGuestProject(project);
      const synced=await updateHomeownerPortal(project);
      setMessage(synced?'Selection added.':(saved?'Selection added on this device.':'Selection added for this session.'));
      setTimeout(()=>{close();renderHomeownerPage(project)},250);
    });
    setTimeout(()=>form.elements.title?.focus(),30);
  }

  function renderHomeownerPage(project){
    document.getElementById('jjHomeownerPage')?.remove();
    const items=Array.isArray(project.selections)?project.selections:[];
    const groups=homeownerGroupBuckets(project,items);
    const page=document.createElement('div');page.id='jjHomeownerPage';page.className='jj-qr-backdrop jj-ho-page-backdrop';
    page.innerHTML=`<div class="jj-ho-page-shell" role="dialog" aria-modal="true" aria-label="Homeowner selections"><header class="jj-ho-page-head"><div class="jj-ho-page-brand">J&J Home Renovations · Homeowner Selections</div><div>${window.JJGuestMode?'':'<button type="button" data-close>Back to app</button>'}</div></header><main class="jj-ho-page-body"><div class="jj-ho-page-title"><h2>${escapeHtml(project.name||'Selections')} · Selections</h2><p>Add product details or mark a Pending product as Selected.</p></div><div class="jj-ho-page-sync">${project.portalUnavailable?'This homeowner link is not connected yet. Please ask J&J to refresh the QR code.':'Your selections are up to date.'}</div><div class="jj-ho-page-toolbar"><button type="button" data-refresh>Refresh selections</button><button type="button" data-ho-toggle>View All</button><button type="button" data-ho-add class="primary">+ Add Selection</button><span class="spacer"></span><button type="button" data-ho-view="cards" class="active" aria-label="Card view" title="Card view">▦</button><button type="button" data-ho-view="list" aria-label="List view" title="List view">☰</button></div><div id="jjHomeownerItems"></div></main></div>`;
    const root=page.querySelector('#jjHomeownerItems');
    if(!items.length){root.innerHTML='<p style="color:#657382">No selections have been added yet.</p>'}
    else root.innerHTML=groups.map(group=>{const complete=group.items.filter(item=>['Selected','Ordered','Received'].includes(item.status)).length;return `<details class="jj-ho-page-group" open><summary><strong>${escapeHtml(group.name)}</strong><span>${complete} of ${group.items.length} selections complete</span></summary><div class="jj-ho-page-grid">${group.items.map(item=>{const img=homeownerImage(item.image);const model=String(item.model||item.sku||'').trim();const upc=String(item.upc||item.gtin||'').trim();const selected=['Selected','Ordered','Received'].includes(item.status);return `<article class="jj-ho-page-card ${selected?'is-selected':''}"><div>${img?`<img src="${escapeHtml(img)}" alt="${escapeHtml(item.title||'Selected product')}" loading="lazy" onerror="this.outerHTML='<div class=\\"empty\\">No product photo</div>'">`:'<div class="empty">No product photo</div>'}</div><div class="jj-ho-page-card-body"><div class="eyebrow">${escapeHtml(group.name)}${item.category?` · ${escapeHtml(item.category)}`:''}</div><h4>${escapeHtml(item.title||'Untitled selection')}</h4>${selected?'<div class="jj-ho-page-status-selected">H.O. has selected</div>':''}${item.description?`<p class="jj-ho-page-card-description">${escapeHtml(item.description)}</p>`:''}${item.vendor?`<p>Vendor - ${escapeHtml(item.vendor)}</p>`:''}${model?`<p>Model / SKU # ${escapeHtml(model)}</p>`:''}${upc?`<p>UPC Code # ${escapeHtml(upc)}</p>`:''}<p>Quantity: ${Math.max(1,Number(item.quantity||1))}</p><p><b>Purchased by:</b> ${escapeHtml(item.purchasedBy||'Not assigned')}</p><p>Status: ${escapeHtml(item.status||'Pending')}</p>${!selected?`<button type="button" class="jj-ho-select-button" data-ho-select="${escapeHtml(item.id||'')}">Mark Selected</button>`:''}</div></article>`}).join('')}</div></details>`}).join('');
    let homeownerCardIndex=0;
    const homeownerCards=[...root.querySelectorAll('.jj-ho-page-card')];
    groups.forEach(group=>group.items.forEach(item=>{
      const card=homeownerCards[homeownerCardIndex++];
      if(item.status!=='Selected'||!card)return;
      const button=document.createElement('button');
      button.type='button';button.className='jj-ho-select-button jj-ho-undo-button';button.dataset.hoUnselect=String(item.id||'');button.textContent='Undo Selection';
      card.querySelector('.jj-ho-page-card-body')?.appendChild(button);
    }));
    const pageGroups=[...page.querySelectorAll('.jj-ho-page-group')];
    const toggle=page.querySelector('[data-ho-toggle]');
    const updateToggle=()=>{const allOpen=pageGroups.length>0&&pageGroups.every(group=>group.open);if(toggle){toggle.textContent=allOpen?'Show Groups':'View All';toggle.title=allOpen?'Collapse all selection groups':'Expand all selection groups'}};
    toggle?.addEventListener('click',()=>{const open=!(pageGroups.length>0&&pageGroups.every(group=>group.open));pageGroups.forEach(group=>group.open=open);updateToggle()});
    pageGroups.forEach(group=>group.addEventListener('toggle',updateToggle));
    page.querySelectorAll('[data-ho-view]').forEach(button=>button.addEventListener('click',()=>{page.querySelectorAll('[data-ho-view]').forEach(other=>other.classList.toggle('active',other===button));page.querySelectorAll('.jj-ho-page-grid').forEach(grid=>grid.classList.toggle('list',button.dataset.hoView==='list'))}));
    page.querySelector('[data-ho-add]')?.addEventListener('click',()=>openHomeownerAddDialog(project,page));
    page.querySelector('[data-refresh]')?.addEventListener('click',async()=>{
      const route=homeownerRoute();
      const fresh=route.token&&window.loadHomeownerProject?await window.loadHomeownerProject(project.id,route.token):null;
      renderHomeownerPage(fresh||project);
    });
    page.querySelectorAll('[data-ho-select]').forEach(button=>button.addEventListener('click',()=>markHomeownerSelected(project,button.dataset.hoSelect)));
    page.querySelectorAll('[data-ho-unselect]').forEach(button=>button.addEventListener('click',()=>undoHomeownerSelected(project,button.dataset.hoUnselect)));
    updateToggle();
    page.addEventListener('click',event=>{if(event.target===page||event.target.closest('[data-close]'))closeHomeownerPage(page)});
    document.body.appendChild(page);
  }
  let homeownerDisplayMode='groups';
  let homeownerDisplayView='cards';

  function homeownerCardMarkup(item,groupName){
    const img=homeownerImage(item.image);
    const model=String(item.model||item.sku||'').trim();
    const upc=String(item.upc||item.gtin||'').trim();
    const selected=['Selected','Ordered','Received'].includes(item.status);
    const canUndo=item.status==='Selected';
    return `<article class="jj-ho-page-card ${selected?'is-selected':''} ${img?'has-photo':'no-photo'}" data-ho-card-id="${escapeHtml(item.id||'')}">
      <div class="jj-ho-page-photo">${img?`<img src="${escapeHtml(img)}" alt="${escapeHtml(item.title||'Selected product')}" loading="lazy">`:'<div class="jj-ho-photo-empty"><span>▧</span><small>No product photo</small></div>'}</div>
      <div class="jj-ho-page-card-body">
        <div class="eyebrow">${escapeHtml(groupName||'Ungrouped selections')}${item.category?` · ${escapeHtml(item.category)}`:''}</div>
        <h4>${escapeHtml(item.title||'Untitled selection')}</h4>
        ${selected?'<div class="jj-ho-page-status-selected">H.O. has selected</div>':''}
        ${item.description?`<p class="jj-ho-page-card-description">${escapeHtml(item.description)}</p>`:''}
        <div class="jj-ho-card-details">
          ${item.vendor?`<p><span>Vendor</span>${escapeHtml(item.vendor)}</p>`:''}
          ${model?`<p><span>Model / SKU</span>${escapeHtml(model)}</p>`:''}
          ${upc?`<p><span>UPC code</span>${escapeHtml(upc)}</p>`:''}
          <p><span>Quantity</span>${Math.max(1,Number(item.quantity||1))}</p>
          <p><span>Purchased by</span>${escapeHtml(item.purchasedBy||'Not assigned')}</p>
          <p><span>Status</span>${escapeHtml(item.status||'Pending')}</p>
        </div>
        <div class="jj-ho-card-actions">${canUndo?`<button type="button" class="jj-ho-undo-button" data-ho-unselect="${escapeHtml(item.id||'')}">Undo Selection</button>`:(!selected?`<button type="button" class="jj-ho-select-button" data-ho-select="${escapeHtml(item.id||'')}">Mark Selected</button>`:'')}</div>
      </div>
    </article>`;
  }

  function renderHomeownerPageCohesive(project){
    document.getElementById('jjHomeownerPage')?.remove();
    const items=Array.isArray(project.selections)?project.selections:[];
    const groups=homeownerGroupBuckets(project,items);
    const page=document.createElement('div');
    page.id='jjHomeownerPage';page.className='jj-qr-backdrop jj-ho-page-backdrop';
    page.innerHTML=`<div class="jj-ho-page-shell" role="dialog" aria-modal="true" aria-label="Homeowner selections">
      <header class="jj-ho-page-head"><div class="jj-ho-page-brand"><span class="jj-ho-page-logo">J&J</span><span>J&J Home Renovations</span><small>Homeowner Selections</small></div>${window.JJGuestMode?'':'<button type="button" data-close>Back to app</button>'}</header>
      <main class="jj-ho-page-body">
        <div class="jj-ho-page-title"><div><small>${escapeHtml(project.jobNo||'YOUR PROJECT')}</small><h2>${escapeHtml(project.name||'Selections')}</h2><p>Review your project selections, add a product, or mark a pending item as selected.</p></div><div class="jj-ho-page-progress"><strong>${items.filter(item=>['Selected','Ordered','Received'].includes(item.status)).length}</strong><span>of ${items.length} complete</span></div></div>
        <div class="jj-ho-page-sync ${project.portalUnavailable?'is-warning':''}">${project.portalUnavailable?'This homeowner link is not connected yet. Please ask J&J to refresh the QR code.':'Your selections are up to date.'}</div>
        <div class="jj-ho-page-toolbar">
          <div class="jj-ho-toolbar-left"><button type="button" data-refresh>Refresh</button><button type="button" data-ho-toggle>${homeownerDisplayMode==='groups'?'View All':'Show Groups'}</button><button type="button" data-ho-add class="primary">+ Add Selection</button></div>
          <div class="jj-ho-view-switch" aria-label="Selections view"><button type="button" data-ho-view="cards" class="${homeownerDisplayView==='cards'?'active':''}" aria-label="Card view" title="Card view">▦</button><button type="button" data-ho-view="list" class="${homeownerDisplayView==='list'?'active':''}" aria-label="List view" title="List view">☰</button></div>
        </div>
        <div id="jjHomeownerItems"></div>
      </main>
    </div>`;

    const root=page.querySelector('#jjHomeownerItems');
    if(!items.length)root.innerHTML='<div class="jj-ho-empty-state"><strong>No selections yet</strong><span>Use Add Selection to add the first product.</span></div>';
    else if(homeownerDisplayMode==='groups')root.innerHTML=groups.map(group=>`<details class="jj-ho-page-group"><summary><div><strong>${escapeHtml(group.name)}</strong></div></summary><div class="jj-ho-page-grid ${homeownerDisplayView==='list'?'list':''}">${group.items.map(item=>homeownerCardMarkup(item,group.name)).join('')}</div></details>`).join('');
    else root.innerHTML=`<div class="jj-ho-page-grid ${homeownerDisplayView==='list'?'list':''}">${items.map(item=>{const group=groups.find(entry=>entry.items.includes(item));return homeownerCardMarkup(item,group?.name||'Ungrouped selections')}).join('')}</div>`;

    root.querySelectorAll('.jj-ho-page-photo img').forEach(image=>image.addEventListener('error',()=>{image.parentElement.innerHTML='<div class="jj-ho-photo-empty"><span>▧</span><small>No product photo</small></div>'}));
    root.querySelectorAll('[data-ho-select]').forEach(button=>button.addEventListener('click',()=>markHomeownerSelected(project,button.dataset.hoSelect)));
    root.querySelectorAll('[data-ho-unselect]').forEach(button=>button.addEventListener('click',()=>undoHomeownerSelected(project,button.dataset.hoUnselect)));
    page.querySelector('[data-ho-add]')?.addEventListener('click',()=>openHomeownerAddDialog(project,page));
    page.querySelector('[data-ho-toggle]')?.addEventListener('click',()=>{homeownerDisplayMode=homeownerDisplayMode==='groups'?'all':'groups';renderHomeownerPageCohesive(project)});
    page.querySelectorAll('[data-ho-view]').forEach(button=>button.addEventListener('click',()=>{homeownerDisplayView=button.dataset.hoView==='list'?'list':'cards';renderHomeownerPageCohesive(project)}));
    page.querySelector('[data-refresh]')?.addEventListener('click',async()=>{const route=homeownerRoute();const fresh=route.token&&window.loadHomeownerProject?await window.loadHomeownerProject(project.id,route.token):null;renderHomeownerPageCohesive(fresh||project)});
    page.addEventListener('click',event=>{if(event.target===page||event.target.closest('[data-close]'))closeHomeownerPage(page)});
    document.body.appendChild(page);
  }

  renderHomeownerPage=renderHomeownerPageCohesive;

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

  async function boot(){
    injectStyles();
    const route=homeownerRoute();
    if(route.id){
      const id=route.id;
      window.JJHomeownerToken=route.token;
      let project=null;
      try{const saved=JSON.parse(localStorage.getItem('jj_full_proto')||'null');project=saved?.projects?.find(item=>String(item.id)===String(id))||null}catch{}
      if(route.token && typeof window.loadHomeownerProject==='function')project=await window.loadHomeownerProject(id,route.token)||project;
      if(!project){const current=appProject();if(current&&String(current.id)===String(id))project=current;}
      if(project){window.JJHomeownerProject=project;window.JJGuestMode=true;setTimeout(()=>renderHomeownerPage(project),0);return;}
      document.getElementById('cloudLoginOverlay')?.classList.add('hidden');
      document.getElementById('loginOverlay')?.classList.add('hidden');
      setTimeout(()=>renderHomeownerPage({id,name:'Homeowner selections',selections:[],selectionGroups:[],portalUnavailable:true}),0);
      return;
    }
    if(installHO())return;
    installApp();
  }

  if(document.readyState==='complete')setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();
