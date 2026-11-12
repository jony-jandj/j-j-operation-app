const token=new URLSearchParams(location.hash.slice(1)).get('key')||'';
const client=window.supabase?.createClient('https://mrkvspqwqsmlnhrfllpx.supabase.co','sb_publishable_n5w6Q2b1nvsnOEcYZL2fsQ_u0gGltVk',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const $=id=>document.getElementById(id),msg=$('message'),editor=$('editor'),form=$('selectionForm');let lookupGeneration=0,lookupBusy=false;let readTask=null,readEpoch=0;let portalRules={};let portalLoaded=false,portalLoadFailed=false;let busy=false,reading=false,items=[],selectionGroups=[],editingId=null,editingOriginal=null,optionParentId=null,photo='',photoLoading=false,photoVersion=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=u=>/^https?:\/\//i.test(u||'')?u:'';
const safeImage=u=>safe(u)||(/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(u||'')?u:'');
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
function optionGroupKey(i){return i.optionGroupId||i.id}
function optionUnavailable(i){const key=optionGroupKey(i);return portalRules[key]?.allowMultiple!==true&&!['Selected','Ordered','Received'].includes(i.status)&&items.some(other=>other.id!==i.id&&optionGroupKey(other)===key&&['Selected','Ordered','Received'].includes(other.status))}
function renderItem(i){const selected=i.status==='Selected',unavailable=optionUnavailable(i),price=i.unitPrice!==null&&i.unitPrice!==undefined&&i.unitPrice!==''&&Number.isFinite(Number(i.unitPrice)),subtotal=Number(i.unitPrice)*Number(i.quantity||1),total=subtotal*(i.addTax?1.0825:1);return `<article class="${selected?'chosen':''}">${(JJProduct.image(i.image)||/^data:image\//.test(i.image||''))&&safeImage(i.image)?`<img class="photo" onerror="this.remove()" referrerpolicy="no-referrer" src="${esc(safeImage(i.image))}" alt="${esc(i.title)}">`:''}<div class="card-body"><small>${esc(i.room)} · ${esc(i.category)}</small><h2>${esc(i.title)}${i.optionLabel?` <small class="option-label">${esc(i.optionLabel)}</small>`:''}</h2><p class="detail">${esc(i.description)}</p><small>${esc(i.vendor)} ${esc(i.model)}</small><p>Quantity: ${esc(i.quantity||1)}</p><div class="price">${price?money(total):'Price not set'}<small>${price?'Tax included':'J&J will add pricing'}</small></div><p><b>Purchased by:</b> ${esc(i.purchasedBy||'Not assigned')}</p><p class="${selected?'badge':''}">Status: ${unavailable?'Unavailable — another option is selected':esc(i.status||'Pending')}</p>${safe(i.url)?`<p><a href="${esc(safe(i.url))}" target="_blank" rel="noopener noreferrer">View product ↗</a></p>`:''}<div class="actions">${selected?`<button data-select="${esc(i.id)}" aria-pressed="true">Selected</button>`:unavailable?`<button disabled aria-disabled="true">Unavailable</button>`:`<button data-select="${esc(i.id)}" aria-pressed="false">Mark Selected</button>`}<button class="secondary" data-option="${esc(i.id)}">＋ Another option</button></div></div></article>`}

function render(){
 if(!portalLoaded){$('items').innerHTML='<p role="status">'+(portalLoadFailed?'Could not load your choices. Tap Refresh selections to try again.':'Loading your choices…')+'</p>';return;}
 const groups=new Map();items.forEach(i=>{const key=i.optionGroupId||i.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
 $('items').innerHTML=[...groups].map(([key,group])=>group.length>1?`<details class="option-group"><summary>${esc(group[0].optionGroupTitle||group[0].title||'Selection options')} <span>${group.length} options · tap to compare</span></summary><div class="option-group-items">${group.map(renderItem).join('')}</div></details>`:renderItem(group[0])).join('')||'<p>No selections yet. Use + Add Selection to add your first product.</p>';
}
async function refresh(silent=false,afterWrite=false){
 if(busy&&!afterWrite)return false;
 if(readTask)return readTask;
 if(!client){msg.textContent='Unable to connect. Check your connection and refresh.';return false;}
 if(!/^[a-f0-9]{64}$/.test(token)){msg.textContent='Open the private QR code or link provided by J&J.';return false;}
 const epoch=readEpoch;reading=true;portalLoadFailed=false;if(!portalLoaded)render();
 readTask=(async()=>{
 try{const [{data,error},rules]=await Promise.all([client.rpc('jj_portal_read',{p_token:token}),client.rpc('jj_selection_rules',{p_token:token})]);if(error)throw error;if(rules.error)throw rules.error;
 if(epoch!==readEpoch)return false;portalRules=rules.data||{};
 portalLoaded=true;portalLoadFailed=false;items=data.items||[];selectionGroups=data.selectionGroups||[];$('job').textContent=data.jobName+' · Selections';render();
 if(busy)document.querySelectorAll('button').forEach(b=>b.disabled=true);
 msg.textContent=afterWrite?'Saved. Your selections are up to date.':'Your selections are up to date.';$('newSelection').hidden=false;$('refresh').hidden=false;return true;
 }catch(e){portalLoadFailed=true;$('refresh').hidden=false;if(!silent)msg.textContent='Could not confirm the latest selections. Check your connection and refresh.';return false;}
 finally{reading=false;readTask=null;if(!portalLoaded)render();}
 })();return readTask;
}
function showPhoto(){photo=safeImage(photo);$('preview').src=photo;$('preview').hidden=!photo;}
function addAnotherOption(id){const base=items.find(i=>String(i.id)===String(id));if(!base)return;optionParentId=id;openEditor(null);}
function openEditor(id=null){
 if(id===null){const parentId=optionParentId;optionParentId=null;window.JJSimpleAdd.open({title:parentId===null?'Add Selection':'Add Option',onSave:async (data,context)=>{if(parentId!==null){const parent=items.find(i=>String(i.id)===String(parentId));if(!parent)throw Error('This selection changed. Close and try again.');data.optionGroupId=parent.optionGroupId||parent.id;data.optionGroupTitle=parent.optionGroupTitle||parent.title;data.optionLabel='Another option';data.room=parent.room||'';data.category=parent.category||data.category;}return write('add',data,context.requestId);}});return;}

 const item=id===null?{}:items.find(i=>String(i.id)===String(id));if(!item)return;lookupGeneration++;lookupBusy=false;$('lookupMessage').textContent='Update the link to fill product details. Pricing stays with J&J.';editingId=id;editingOriginal=JSON.parse(JSON.stringify(item));form.reset();photoVersion++;photoLoading=false;
 for(const name of ['title','room','category','vendor','model','quantity','url','description'])form.elements[name].value=item[name]??(name==='quantity'?1:'');
 const status=item.status||'Pending';form.elements.status.innerHTML=['Pending','Selected',...(!['Pending','Selected'].includes(status)?[status]:[])].map(s=>`<option>${esc(s)}</option>`).join('');form.elements.status.value=status;form.elements.status.disabled=true;form.elements.status.title='Use Choose this or Undo on the product card to change your choice.';
 photo=item.image||'';$('photoUrl').value=safe(photo);showPhoto();$('editorMessage').textContent='';$('editorTitle').textContent=id===null?'Add Selection':'Edit Selection';$('saveSelection').textContent=id===null?'Add Selection':'Save changes';editor.showModal();form.elements.title.focus();
}
function closeEditor(){if(!busy){photoVersion++;optionParentId=null;editor.close();$('newSelection').focus();}}
async function write(action,item,requestId=null){
 if(busy)return false;busy=true;readEpoch++;
 const disabled=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);
 disabled.forEach(([b])=>b.disabled=true);msg.textContent='Saving your change…';$('editorMessage').textContent='Saving…';
 try{
 if(readTask)await readTask;
 const {error}=action==='add'
  ?await client.rpc('jj_portal_add_once',{p_token:token,p_request_id:requestId||crypto.randomUUID(),p_item:item})
  :action==='select'?await client.rpc('jj_selection_choose',{p_token:token,p_item:item.id,p_expected:item.expectedStatus}):await client.rpc('jj_portal_write',{p_token:token,p_action:action,p_item:item});
 if(error){if(error.code==='PGRST202')throw Error('Adding is being updated. Please contact J&J and keep this window open.');throw error;}
 const confirmed=await refresh(false,true);
 if(!confirmed)msg.textContent='Change sent. Refresh to confirm the saved result before making another choice.';
 return confirmed;
 }catch(e){msg.textContent=e.message||'Could not save. Please try again.';$('editorMessage').textContent=msg.textContent;return false;}
 finally{busy=false;disabled.forEach(([b,wasDisabled])=>{if(b.isConnected)b.disabled=wasDisabled});render();}
}
$('items').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),opt=e.target.closest('[data-option]'),b=e.target.closest('[data-select]');if(edit)openEditor(edit.dataset.edit);if(opt)addAnotherOption(opt.dataset.option);if(b&&!b.disabled&&!busy){const i=items.find(i=>String(i.id)===b.dataset.select);if(i&&['Pending','Recommended','Selected'].includes(i.status||'Pending'))write('select',{id:b.dataset.select,expectedStatus:i.status||'Pending'});}});
form.addEventListener('submit',async e=>{e.preventDefault();if(lookupBusy){$('editorMessage').textContent='Please wait for product details to finish loading.';return;}if(photoLoading){$('editorMessage').textContent='Please wait for the photo to finish loading.';return;}const data=Object.fromEntries(new FormData(form));delete data.purchasedBy;data.status=editingOriginal?.status||'Pending';data.image=photo;if(editingId!==null){data.id=editingId;data.expected=editingOriginal;}else if(optionParentId!==null){const parent=items.find(i=>String(i.id)===String(optionParentId));data.optionGroupId=parent?.optionGroupId||parent?.id;data.optionGroupTitle=parent?.optionGroupTitle||parent?.title;data.optionLabel='Another option';}if(await write(editingId===null?'add':'edit',data)) {optionParentId=null;closeEditor();}});
$('photoFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;const version=++photoVersion;photoLoading=true;$('editorMessage').textContent='Loading photo…';
 try{if(file.size>25000000)throw Error('Choose a photo smaller than 25 MB.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('This photo format could not be opened. Try JPG or PNG.'));im.src=data});const scale=Math.min(1,1200/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const resized=canvas.toDataURL('image/jpeg',.78);if(resized.length>850000)throw Error('Photo is too detailed. Choose a smaller image.');if(version!==photoVersion)return;photo=resized;$('photoUrl').value='';showPhoto();$('editorMessage').textContent='Photo ready.';
 }catch(e){if(version===photoVersion)$('editorMessage').textContent=e.message||'Could not read photo.';}finally{if(version===photoVersion)photoLoading=false;}
};
$('photoUrl').onchange=()=>{photoVersion++;photoLoading=false;photo=safe($('photoUrl').value.trim());showPhoto();};$('removePhoto').onclick=()=>{photoVersion++;photoLoading=false;photo='';$('photoFile').value='';$('photoUrl').value='';showPhoto();};
let view=localStorage.getItem('jj-homeowner-view')==='list'?'list':'cards';
function setView(value){view=value;$('items').classList.toggle('list',value==='list');$('cardView').setAttribute('aria-pressed',value==='cards');$('listView').setAttribute('aria-pressed',value==='list');localStorage.setItem('jj-homeowner-view',value);}
$('cardView').onclick=()=>setView('cards');$('listView').onclick=()=>setView('list');setView(view);
async function fillLink(){
 const url=safe(form.elements.url.value.trim());if(!url){$('lookupMessage').textContent='Enter an http or https product link.';return;}
 const generation=++lookupGeneration;lookupBusy=true;const keys=['title','vendor','model','category','description'];const before=Object.fromEntries(keys.map(k=>[k,form.elements[k].value]));const oldPhoto=photo;
 $('lookupMessage').textContent='Reading product details…';
 const metadata=await JJProduct.lookup(url);if(generation!==lookupGeneration)return;lookupBusy=false;
 if(!editor.open||form.elements.url.value.trim()!==url)return;
 const values={...JJProduct.guess(url)};for(const [key,value] of Object.entries(metadata||{})){if(value!==''&&value!==null&&value!==undefined)values[key]=value;}
 for(const key of keys){if(values[key]&&form.elements[key].value===before[key])form.elements[key].value=values[key];}
 if(metadata?.image&&photo===oldPhoto&&!photoLoading){photo=metadata.image;showPhoto();$('photoUrl').value=photo;}
 $('lookupMessage').textContent=metadata?'Product details filled. Review before saving. Pricing remains unchanged and is managed by J&J.':'Retailer could not be read. Review the details inferred from the link; add missing information manually.';
}
$('fillLink').onclick=fillLink;form.elements.url.addEventListener('change',fillLink);
$('newSelection').onclick=()=>{openEditor();};$('closeEditor').onclick=closeEditor;$('cancelEditor').onclick=closeEditor;editor.addEventListener('cancel',e=>{if(busy)e.preventDefault();});$('refresh').onclick=()=>refresh();setInterval(()=>{if(!document.hidden&&!editor.open&&!document.querySelector('.jj-simple-add[open]')&&!busy)refresh(true)},8000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!editor.open&&!document.querySelector('.jj-simple-add[open]')&&!busy)refresh(true)});refresh();
