/* J&J Selections consolidated build v83.0 — customer view + in-stock card */
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

/* Load the clean v82 selection runtime as one concatenated program. The pieces
   are split only so GitHub updates remain small/reliable; they execute together. */
window.__JJ_SELECTIONS_V82_LOADING__ = Promise.all(
  Array.from({length:18},(_,i)=>`selections-v82/part-${String(i+1).padStart(2,'0')}.txt`)
    .map(path=>fetch(path,{cache:'no-cache'}).then(response=>{
      if(!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
      return response.text();
    }))
).then(parts=>{
  const source=parts.join('')+'\n//# sourceURL=jj-selections-v82-runtime.js';
  (0,eval)(source);
  window.__JJ_SELECTIONS_V82_READY__=true;
  window.dispatchEvent(new CustomEvent('jj-selections-v82-ready'));
}).catch(error=>{
  console.error('J&J selections v82 failed to load',error);
  window.__JJ_SELECTIONS_V82_ERROR__=String(error?.message||error);
});