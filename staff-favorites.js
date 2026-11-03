/* Shared favorite preferences; never writes the job snapshot or purchase status. */
(() => {
 'use strict';
 const cache=new Map();
 let reading=false,writing=false;
 const current=()=>{try{return selectedProject()}catch{return null}};
 const client=()=>{try{return cloudClient}catch{return null}};
 function entry(id){id=String(id);if(!cache.has(id))cache.set(id,{values:{},ready:false,error:''});return cache.get(id)}
 function label(item,all,values){
  const status=item.status||'Pending';
  if(!['Pending','Recommended'].includes(status))return status;
  const group=String(item.optionGroupId||item.id);
  if(all.some(other=>String(other.id)!==String(item.id)&&String(other.optionGroupId||other.id)===group&&other.status==='Selected'))return 'Unavailable';
  return values[String(item.id)]===true?'Favorite':status;
 }
 function paint(){
  const project=current();if(!project)return;
  const data=entry(project.id),all=project.selections||[];
  document.querySelectorAll('#selections .selection-card').forEach(card=>{
   const id=card.dataset.staffSelection||card.querySelector('[data-jj-bulk-id]')?.dataset.jjBulkId;
   const item=all.find(i=>String(i.id)===String(id));if(!item)return;
   const actions=card.querySelector('.selection-card-actions');if(!actions)return;
   actions.querySelectorAll('a,button').forEach(action=>{
    if(action.hasAttribute('data-staff-favorite'))return;
    const text=action.textContent.trim();
    if(!/^View product/i.test(text)&&text!=='Edit')return;
    action.style.cssText='display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;min-height:32px!important;padding:6px 11px!important;border:1px solid #c9d2de!important;border-radius:8px!important;background:#f4f6f9!important;color:#14234a!important;font-size:12px!important;font-weight:650!important;line-height:1.2!important;text-decoration:none!important;box-shadow:none!important;white-space:nowrap!important;cursor:pointer';
   });
   const photo=card.querySelector('.selection-photo');if(!photo)return;
   photo.style.position='relative';
   let button=card.querySelector('[data-staff-favorite]');
   if(!button){button=document.createElement('button');button.type='button';button.dataset.staffFavorite=String(id);photo.appendChild(button)}
   const yes=data.values[String(id)]===true;
   const text=yes?'★':'☆';if(button.textContent!==text)button.textContent=text;
   button.setAttribute('aria-pressed',String(yes));button.setAttribute('aria-label',(yes?'Remove favorite: ':'Favorite: ')+(item.title||'Selection'));
   button.disabled=!data.ready||reading||writing;
   button.title=data.error||(data.ready?'Shared with homeowner':'Loading shared favorites…');
   button.style.cssText='position:absolute!important;right:10px!important;bottom:10px!important;top:auto!important;z-index:3!important;display:grid!important;place-items:center!important;width:40px!important;height:40px!important;min-height:40px!important;padding:0!important;border:1px solid #b59a62!important;border-radius:50%!important;box-shadow:0 2px 7px #10243724!important;background:'+(yes?'#e1bf6c':'#fffaf0')+'!important;color:#14234a!important;font-size:28px!important;font-weight:650!important;line-height:1!important;cursor:pointer';
   const badge=card.querySelector('.selection-photo-status');
   if(badge&&data.ready){const text=label(item,all,data.values);if(badge.textContent!==text)badge.textContent=text;}
  });
  let message=document.getElementById('jjStaffFavoriteMessage');
  if(!message){const section=document.getElementById('selections');if(!section)return;message=document.createElement('p');message.id='jjStaffFavoriteMessage';message.setAttribute('role','status');section.appendChild(message)}
  const text=data.error||(writing?'Saving favorite…':'');if(message.textContent!==text)message.textContent=text;
 }
 async function refresh(){
  const project=current(),db=client();if(!project||!db||reading||writing||document.hidden)return;
  const id=String(project.id),data=entry(id);reading=true;
  try{const result=await db.rpc('jj_portal_favorites',{p_job:id});if(result.error)throw result.error;data.values=result.data||{};data.ready=true;data.error=''}
  catch(error){data.ready=false;data.error='Shared favorites could not load. Make sure this job has a homeowner link, then refresh.'}
  finally{reading=false;paint()}
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-staff-favorite]');if(!button||button.disabled)return;
  const project=current(),db=client();if(!project||!db||reading||writing)return;
  const id=String(project.id),itemId=button.dataset.staffFavorite,data=entry(id);
  if(!data.ready||!(project.selections||[]).some(i=>String(i.id)===itemId))return;
  const previous=data.values[itemId]===true;writing=true;data.error='';paint();
  try{const result=await db.rpc('jj_portal_favorites',{p_job:id,p_item:itemId,p_favorite:!previous,p_expected:previous});if(result.error)throw result.error;data.values=result.data||{};data.ready=true;}
  catch(error){data.error=error.message||'Favorite did not save. Try again.';}
  finally{writing=false;paint()}
 });
 // Observe only replacement/addition of cards, not our own badge/button updates.
 const observer=new MutationObserver(records=>{
  if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.selection-card,#selections')||n.querySelector?.('.selection-card'))))){paint();refresh()}
 });
 observer.observe(document.body,{childList:true,subtree:true});
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 paint();refresh();setInterval(refresh,8000);
})();
