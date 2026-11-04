/* Shared homeowner add dialog. Existing adapters own persistence and grouping. */
(()=>{'use strict';
const http=value=>{try{let v=String(value||'').trim();if(!v)return '';if(!/^[a-z][a-z0-9+.-]*:/i.test(v))v='https://'+v;const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&u.hostname.includes('.')&&!u.username&&!u.password&&!/\s/.test(v)?u.href:''}catch{return ''}};
window.JJSimpleAdd={open({onSave,onClose,title='Add Selection'}){
 const existing=document.querySelector('.jj-simple-add[open]');if(existing){existing.querySelector('input').focus();return existing;}
 const d=document.createElement('dialog');d.className='jj-simple-add';
 d.innerHTML=`<style>.jj-simple-add{width:min(520px,calc(100% - 24px))!important;max-height:90dvh!important;overflow:auto!important;padding:24px!important;border:1px solid #c6b78f!important;border-radius:18px!important;background:#fffaf0!important;color:#14234a!important;box-sizing:border-box!important}.jj-simple-add::backdrop{background:#061523b8}.jj-simple-add,.jj-simple-add *{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif!important;box-sizing:border-box}.jj-simple-add h2,.jj-simple-add p,.jj-simple-add label{color:#14234a!important}.jj-simple-add h2{font-size:24px!important;margin:0 0 8px!important}.jj-simple-add p{font-size:16px!important;line-height:1.5!important}.jj-simple-add input[name=url]{display:block!important;width:100%!important;padding:14px!important;margin:8px 0 18px!important;background:white!important;color:#14234a!important;border:1px solid #8796a8!important;border-radius:10px!important;font-size:16px!important}.jj-simple-add button{min-height:48px!important;padding:12px 16px!important;border:1px solid #a8b2bf!important;border-radius:10px!important;background:#fff!important;color:#14234a!important;font-size:16px!important;font-weight:750!important;cursor:pointer}.jj-simple-add button[type=submit]{background:#d5b66f!important;border-color:#b59a62!important;flex:1}.jj-simple-add button:disabled{opacity:.6!important}.jj-simple-add [data-drop]{padding:24px 14px!important;border:2px dashed #a99972!important;border-radius:12px!important;text-align:center;background:#f5eddd!important}.jj-simple-add [data-drop].dragging{border-color:#14234a!important;background:#e6d6af!important}.jj-simple-add img{display:block;max-width:100%;max-height:180px;margin:0 auto 12px;object-fit:contain}.jj-simple-add footer{display:flex!important;gap:10px!important;margin-top:16px!important;position:static!important}.jj-simple-add [hidden]{display:none!important}.jj-simple-add :focus-visible{outline:3px solid #14234a!important;outline-offset:3px}</style><form novalidate><h2></h2><p>Paste a link or add a photo. Then tap Add.</p><label>Product link<input type="text" inputmode="url" autocapitalize="off" autocomplete="url" spellcheck="false" name="url" placeholder="https://…" maxlength="2000"></label><div data-drop><img alt="Your photo" hidden><p>Or drop a photo here</p><input type="file" accept="image/*" hidden><button type="button" data-file>Choose photo</button> <button type="button" data-remove hidden>Remove photo</button></div><p role="status" aria-live="polite"></p><footer><button type="button" data-cancel>Cancel</button><button type="submit">Add</button></footer></form>`;
 document.body.append(d);d.querySelector('h2').textContent=title;
 const form=d.querySelector('form'),url=form.elements.url,file=d.querySelector('[type=file]'),drop=d.querySelector('[data-drop]'),preview=d.querySelector('img'),status=d.querySelector('[role=status]'),remove=d.querySelector('[data-remove]');let photo='',photoName='',photoError=false,loading=false,saving=false,version=0,prepared=null;const requestId=crypto.randomUUID();const submit=form.querySelector('[type=submit]');
 const lock=value=>{d.querySelectorAll('button,input').forEach(e=>e.disabled=value)};
 const close=()=>{if(!saving){version++;d.close()}};
 d.addEventListener('close',()=>{version++;d.remove();onClose?.()},{once:true});d.addEventListener('cancel',e=>{if(saving)e.preventDefault()});d.querySelector('[data-cancel]').onclick=close;
 d.querySelector('[data-file]').onclick=()=>file.click();remove.onclick=()=>{version++;loading=false;photo='';photoName='';photoError=false;preview.hidden=true;preview.removeAttribute('src');remove.hidden=true;file.value='';status.textContent=''};
 async function readPhoto(f){if(!f||saving||prepared)return;const v=++version;loading=true;photo='';photoName='';photoError=false;preview.hidden=true;preview.removeAttribute('src');remove.hidden=false;status.textContent='Loading photo…';try{if(!f.type.startsWith('image/')&&!/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name))throw Error('Choose an image file.');if(f.size>25000000)throw Error('Choose a photo smaller than 25 MB.');const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('Could not read photo.'));r.readAsDataURL(f)});const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('Try a JPG, PNG or WebP photo.'));i.src=data});const scale=Math.min(1,1200/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);let image=c.toDataURL('image/jpeg',.78);for(const quality of [.66,.54,.42]){if(image.length<=800000)break;image=c.toDataURL('image/jpeg',quality)}if(image.length>850000)throw Error('Please choose a smaller photo.');if(v!==version||!d.open)return;photo=image;photoName=f.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').slice(0,180);preview.src=photo;preview.hidden=false;remove.hidden=false;status.textContent='Photo ready. Tap Add.'}catch(e){if(v===version){photoError=true;status.textContent=e.message+' Choose another photo or tap Remove photo.'}}finally{if(v===version)loading=false}}
 file.onchange=()=>readPhoto(file.files[0]);for(const name of ['dragenter','dragover'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('dragging')});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');if(e.dataTransfer.files.length!==1){status.textContent='Add one photo at a time.';return}readPhoto(e.dataTransfer.files[0])});
 form.addEventListener('paste',e=>{if(saving||prepared)return;const files=[...(e.clipboardData?.files||[])];if(files.length===1){e.preventDefault();readPhoto(files[0])}});
 form.onsubmit=async e=>{
  e.preventDefault();if(saving)return;
  if(loading){status.textContent='Please wait for your photo.';return}
  if(photoError){status.textContent='Choose another photo or tap Remove photo before adding.';return}
  const raw=url.value.trim(),link=http(raw);
  if(raw&&!link){status.textContent='Paste a product website link, like homedepot.com/…';url.focus();return}
  if(!link&&!photo&&!prepared){status.textContent='Add a link or choose a photo first.';url.focus();return}
  saving=true;lock(true);submit.textContent=prepared?'Checking…':'Adding…';status.textContent=prepared?'Checking your saved item…':'Adding your selection…';
  try{
   if(!prepared){
    let details={};
    if(link){
     url.value=link;
     try{details=window.JJProduct?.guess(link)||{};
      const metadata=await Promise.race([Promise.resolve(window.JJProduct?.lookup(link)).catch(()=>null),new Promise(r=>setTimeout(()=>r(null),5000))]);
      for(const [k,v] of Object.entries(metadata||{}))if(v!==null&&v!==undefined&&v!=='')details[k]=v;
     }catch{}
    }
    prepared={url:link,title:String(details.title||photoName||(link?'Product from '+new URL(link).hostname:'New selection')).slice(0,200),vendor:String(details.vendor||'').slice(0,200),model:String(details.model||'').slice(0,200),description:String(details.description||'').slice(0,4000),category:String(details.category||'').slice(0,100),image:photo||http(details.image||''),quantity:1,status:'Pending'};
   }
   const result=await onSave({...prepared},{requestId});
   if(result===false)throw Error('Could not confirm the save.');
   saving=false;d.close();
  }catch(e){
   status.textContent=(e.message||'Could not confirm the save.')+' Your link/photo is kept here. Tap Retry to check and finish this same item.';
  }finally{
   saving=false;
   if(d.isConnected){
    lock(false);
    if(prepared){url.disabled=true;file.disabled=true;d.querySelector('[data-file]').disabled=true;remove.disabled=true;submit.textContent='Retry';}
   }
  }
 };

 d.showModal();url.focus();return d;
}};
})();
