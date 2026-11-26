/* Keep an open selection editor attached to its original job and item. */
(()=>{'use strict';
 let opened=null;
 const project=()=>window.selectedProject?.();
 const stable=value=>JSON.stringify(sort(value));
 function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
 function inform(text){if(typeof window.toast==='function')window.toast(text);else window.alert(text);}
 function wrap(name,make){const original=window[name];if(typeof original!=='function'||original.__jjSelectionGuard)return;const wrapped=make(original);Object.assign(wrapped,original);wrapped.__jjSelectionGuard=true;window[name]=wrapped;}
 function install(){
  wrap('openSelectionEditor',original=>function(index=null,...args){const p=project(),editing=Number.isInteger(index),item=editing?p?.selections?.[index]:null;
   opened=p?{projectId:String(p.id),index:editing?index:null,itemId:item?.id,snapshot:item?stable(item):null}:null;
   return original.call(this,index,...args);
  });
  wrap('saveSelectionEditor',original=>function(...args){
   if(!opened){inform('Reopen this selection before saving.');return false;}
   const p=project();
   if(!p||String(p.id)!==opened.projectId){inform('This editor belongs to another job. Reopen the selection in its job before saving.');return false;}
   if(opened.index!==null){const item=p.selections?.[opened.index];
    if(!item||String(item.id)!==String(opened.itemId)||stable(item)!==opened.snapshot){inform('This selection changed while you were editing. Reopen it to review the latest details before saving.');return false;}
   }
   return original.apply(this,args);
  });
 }
 install();setInterval(install,1000);
})();
