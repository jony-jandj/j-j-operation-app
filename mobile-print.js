/* Read-only, user-initiated print pages for mobile browsers and installed apps. */
(()=>{'use strict';
const mobile=()=>navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches;
function open(html){
 const win=window.open('','_blank');
 if(!win){alert('Allow pop-ups for this app, then tap Print / Save PDF again. Your print preview is still open.');return false;}
 const doc=win.document;doc.open();doc.write(html);doc.close();
 const base=doc.createElement('base');base.href=document.baseURI;doc.head.prepend(base);
 const style=doc.createElement('style');style.textContent=`html,body{height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important;color:#203044!important}body{margin:0!important;padding:14px!important}.jj-mobile-print-tools{display:block!important;position:relative!important;background:#edf2f7!important;color:#203044!important;padding:14px!important;margin:0 0 16px!important;border:1px solid #b7c4d0!important;border-radius:12px!important;font:14px/1.5 Arial,sans-serif!important}.jj-mobile-print-tools button{font:700 16px Arial,sans-serif!important;border:1px solid #a58b50!important;border-radius:9px!important;padding:12px 16px!important;min-height:46px!important;margin:0 8px 8px 0!important;background:#b59a62!important;color:#14234a!important;cursor:pointer!important}.jj-mobile-print-tools p{padding:0!important;margin:3px 0!important}.jj-mobile-print-tools button:disabled{opacity:.55!important}@media screen{#printRoot,#jj-wp-print{display:block!important;position:static!important;width:100%!important;max-width:none!important;max-height:none!important;height:auto!important;margin:0!important;padding:0!important;overflow-x:auto!important;border:0!important;background:#fff!important;color:#203044!important}#jj-wp-print .jj-weekly-print-name{display:inline!important}#printRoot table,#jj-wp-print table{width:100%;border-collapse:collapse}#printRoot td,#printRoot th,#jj-wp-print td,#jj-wp-print th{padding:8px;border-bottom:1px solid #d4dbe1;color:#203044!important;background:#fff!important}.jj-description{max-height:none!important;height:auto!important;overflow:visible!important}}@media print{body{padding:0!important}.jj-mobile-print-tools{display:none!important}}`;
 doc.head.append(style);
 const bar=doc.createElement('div');bar.className='jj-mobile-print-tools';
 bar.innerHTML='<button type="button" data-mobile-print disabled>Preparing…</button><button type="button" data-mobile-close>Close print view</button><p>iPhone / iPad: tap Print / Save PDF. To save a copy, use Share in the print preview, then Save to Files.</p><p>Android: choose Save as PDF in the printer list. If printing does not open from the Home Screen app, open the app in Safari or Chrome and try again.</p><p role="status">Loading photos and print styles…</p>';
 doc.body.prepend(bar);const button=bar.querySelector('[data-mobile-print]'),status=bar.querySelector('[role=status]');
 button.onclick=()=>{win.focus();win.print()};bar.querySelector('[data-mobile-close]').onclick=()=>win.close();
 const assets=[...doc.images,...doc.querySelectorAll('link[rel="stylesheet"]')];
 const loaded=el=>el.tagName==='IMG'?el.complete:!!el.sheet;
 Promise.race([Promise.all(assets.map(el=>loaded(el)?Promise.resolve():new Promise(resolve=>{el.addEventListener('load',resolve,{once:true});el.addEventListener('error',resolve,{once:true})}))),new Promise(resolve=>setTimeout(resolve,10000))]).then(()=>{
  if(win.closed)return;button.disabled=false;button.textContent='Print / Save PDF';status.textContent=[...doc.images].some(img=>!img.complete||!img.naturalWidth)?'Some photos could not load. You can still print the product information.':'Ready to print or save.';
 });
 // A child window receives only this prepared document, not the app's scripts or records.
 win.opener=null;return true;
}
function node(root,bodyClass=''){
 const copy=root.cloneNode(true);copy.querySelectorAll('script').forEach(n=>n.remove());
 for(const el of [copy,...copy.querySelectorAll('*')])for(const attr of [...el.attributes])if(/^on/i.test(attr.name))el.removeAttribute(attr.name);
 const head=[...document.head.querySelectorAll('style,link[rel="stylesheet"]')].map(el=>el.outerHTML).join('');
 return open('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>J&J Home Renovations — Print</title>'+head+'</head><body class="'+bodyClass+'">'+copy.outerHTML+'</body></html>');
}
window.JJMobilePrint={mobile,open,node};
})();
