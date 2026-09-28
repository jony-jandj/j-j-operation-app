/* Device opt-in. Push payloads never contain job details. */
(()=>{'use strict';
const root=document.createElement('div');root.id='rw-push-settings';root.className='rw-push-settings';
root.addEventListener('click',e=>e.stopPropagation());
let user=null,reg=null,sub=null,enabled=false,working=false,message='',hooked=null,publicKey=null,syncing=false,authChecked=false,syncError='';
const client=()=>typeof cloudClient!=='undefined'?cloudClient:null;
const supported=()=>isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const rpc=async(n,a={})=>{const r=await client().rpc(n,a);if(r.error)throw r.error;return r.data};
function mount(){const inbox=document.getElementById('rw-inbox');if(inbox&&!root.isConnected)inbox.append(root);render()}
function render(){root.replaceChildren();const heading=document.createElement('strong');heading.textContent='Phone notifications';root.append(heading);const info=document.createElement('p');info.setAttribute('role','status');info.textContent=message||syncError||(!authChecked?'Checking your signed-in account…':!user?'Sign in to enable alerts.':ios()&&!installed()?'On iPhone or iPad: add this app to your Home Screen, then open it from its icon.':!supported()?'Open this app in Safari, Chrome, Edge or Firefox to set up notifications.':Notification.permission==='denied'?'This Home Screen app reports permission blocked. In iPhone Settings → Notifications, check this exact test app, allow notifications, then reopen it and tap Check permission.':enabled?'On for this device. Alerts are for R.W. only.':'Get an alert when the app is closed.');root.append(info);
if(!user){const retry=document.createElement('button');retry.textContent='Refresh notification setup';retry.onclick=e=>{e.stopPropagation();safeSync()};root.append(retry);}if(!user||!supported()||(ios()&&!installed()))return;const b=document.createElement('button');b.textContent=enabled?'Turn off on this device':Notification.permission==='denied'?'Check permission':'Enable phone notifications';b.disabled=working;b.onclick=e=>{e.preventDefault();e.stopPropagation();run(enabled?disable:enable)};root.append(b);if(enabled){const t=document.createElement('button');t.textContent='Send test notification';t.disabled=working;t.onclick=()=>run(async()=>{await rpc('jj_rw_push_test',{p_endpoint:sub.endpoint});message='Test queued. Close the app and check your phone within about a minute.'});root.append(t)}}
async function workerOwner(id){if(!reg)return;const sw=reg.active||reg.waiting||reg.installing;if(sw)sw.postMessage({type:'JJ_RW_PUSH_OWNER',userId:id});}
async function run(fn){if(working)return;working=true;message='Setting up notifications…';try{const pending=fn();render();await pending}catch(e){message=e.message||'Could not change notifications. Try again.'}finally{working=false;render()}}
async function enable(){const current=user?.id;if(!current)throw Error('Sign in first.');
// Prepare network data ahead of the tap; Safari requires subscribe itself on the gesture.
if(Notification.permission==='denied')throw Error('This Home Screen app still reports permission blocked. Check Settings → Notifications for this exact test app, then fully close and reopen it.');
if(!reg?.active||!publicKey){await prepare();message='Ready. Tap Enable phone notifications again to allow this phone.';return;}
const subscriptionPromise=sub?Promise.resolve(sub):reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-publicKey.length%4)%4)),c=>c.charCodeAt(0))});
message='Waiting for phone permission…';sub=await subscriptionPromise;
if(user?.id!==current){await sub.unsubscribe();sub=null;throw Error('Account changed. Try again.');}
try{message='Registering this phone…';render();await rpc('jj_rw_push_register',{p_subscription:sub.toJSON()});if(!await rpc('jj_rw_push_state',{p_endpoint:sub.endpoint}))throw Error('Phone registration was not confirmed. Please try again.');await workerOwner(current);enabled=true;message='Phone notifications are on for this device.'}catch(e){await sub.unsubscribe();sub=null;enabled=false;throw e}}
async function disable(){await workerOwner(null);if(sub){await rpc('jj_rw_push_disable',{p_endpoint:sub.endpoint});await sub.unsubscribe();sub=null;}enabled=false;message='Phone notifications are off. The in-app bell still works.'}
async function clearDevice(){enabled=false;user=null;message='';if(reg){await workerOwner(null);const s=await reg.pushManager.getSubscription();if(s)await s.unsubscribe();}sub=null;render()}
async function prepare(){reg=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('The app update is not ready. Close and reopen the Home Screen app, then try again.')),15000))]);publicKey=await rpc('jj_rw_push_key');if(!publicKey)throw Error('Phone notifications are still being set up. Try again shortly.');}
async function sync(){
if(working||syncing)return;const c=client();if(!c)return;syncing=true;
try{
if(hooked!==c){hooked=c;c.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){authChecked=true;clearDevice().catch(()=>{});}else setTimeout(safeSync,0)})}
// Reuse the app's persisted session. Network validation remains enforced by the RPCs.
const result=await c.auth.getSession();if(result.error)throw result.error;
const next=result.data?.session?.user||null;
if(user&&next?.id!==user.id)await clearDevice();user=next;authChecked=true;syncError='';mount();
if(supported()&&user){if(!publicKey)await prepare();reg=await navigator.serviceWorker.getRegistration();if(reg){sub=await reg.pushManager.getSubscription();enabled=!!sub&&await rpc('jj_rw_push_state',{p_endpoint:sub.endpoint});await workerOwner(enabled?user.id:null);}}
}finally{syncing=false;mount()}}
async function safeSync(){try{await sync()}catch(e){syncError='Notification setup could not finish: '+(e.message||'Please try again.');mount()}}
mount();safeSync();setInterval(()=>{if(!document.hidden&&!working)safeSync()},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)safeSync()});
})();
