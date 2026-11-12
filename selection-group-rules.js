(()=>{
let job='',rules={},ready=false,loading=false;
function validate(projectId,items){
 if(!ready||job!==String(projectId))return 'Group settings are loading. Please try again.';
 const counts=new Map();
 for(const item of items){if(!item.optionGroupId||!['Selected','Ordered','Received'].includes(item.status))continue;const key=String(item.optionGroupId);counts.set(key,(counts.get(key)||0)+1);}
 for(const [key,count] of counts)if(count>1&&rules[key]?.allowMultiple!==true)return 'Choose one item per group, or enable Allow multiple selections for that group.';
 return '';
}
window.JJGroupRules={validate,ready:id=>ready&&job===String(id),getRules:()=>rules,reload:async()=>{ready=false;await load();},multiple:id=>rules[String(id)]?.allowMultiple===true};
async function load(){const p=selectedProject();if(!p||!cloudClient||loading)return;if(job===String(p.id)&&ready)return;loading=true;ready=false;job=String(p.id);const requested=job;try{const r=await cloudClient.rpc('jj_selection_rules',{p_job:job});if(r.error)throw r.error;if(String(selectedProject()?.id)!==requested)return;rules=r.data||{};ready=true;paint();}catch(e){console.warn('Selection group settings unavailable',e.message);}finally{loading=false;if(String(selectedProject()?.id)!==requested)load();}}
function paint(){document.querySelectorAll('[data-jj-multi]').forEach(n=>n.remove());document.querySelectorAll('#selections [data-selection-group-id]').forEach(section=>{const id=section.dataset.selectionGroupId;if(id==='ungrouped')return;const head=section.querySelector('.selection-room-heading');if(!head)return;const label=document.createElement('label');label.dataset.jjMulti='';label.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;font-size:14px';const input=document.createElement('input');input.type='checkbox';input.checked=rules[id]?.allowMultiple===true;input.disabled=!ready;label.append(input,document.createTextNode('Allow multiple selections'));head.append(label);input.onchange=async()=>{const desired=input.checked,expected=!desired;input.disabled=true;try{const r=await cloudClient.rpc('jj_selection_rules',{p_job:job,p_group:id,p_allow:desired,p_expected:expected});if(r.error)throw r.error;rules=r.data||{};toast(desired?'Group allows multiple selections.':'Group allows one selection.');}catch(e){toast(e.message||'Could not save group setting.');}finally{paint();}};});}
function install(){if(typeof renderSelections!=='function')return;const old=renderSelections;renderSelections=function(){const result=old.apply(this,arguments);if(job!==String(selectedProject()?.id)){ready=false;}paint();load();return result;};paint();load();}
if(window.__JJ_SELECTIONS_V82_READY__)install();else window.addEventListener('jj-selections-v82-ready',install,{once:true});
})();
