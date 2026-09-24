/* -------------------------------------------------------------------------
   J&J Selection Data Safety v73
   Emergency protection against homeowner portal sync replacing the whole app
   state with an older/incomplete snapshot.

   Key rule:
   - Homeowner sync may ADD missing selections.
   - It may fill blank fields.
   - It NEVER deletes an app selection.
   - It NEVER replaces the entire app state.
   ------------------------------------------------------------------------- */
(() => {
  if (window.__jjSelectionDataSafetyV73) return;
  window.__jjSelectionDataSafetyV73 = true;

  let safeRpc = null;
  let safeSyncBusy = false;
  let rpcPatched = false;

  const clone = value => {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  };

  function currentState(){
    try { return state; } catch { return null; }
  }

  function saveRecoverySnapshot(reason='before-sync'){
    const s=currentState();
    if(!s?.projects) return;

    try{
      // Keep a lightweight recovery copy so product names/links/groups survive
      // even when photos are large base64 strings.
      const snapshot={
        at:new Date().toISOString(),
        reason,
        selectedProjectId:s.selectedProjectId,
        projects:s.projects.map(p=>({
          id:p.id,
          name:p.name,
          jobNo:p.jobNo,
          selectionRooms:clone(p.selectionRooms||[]),
          selectionGroups:clone(p.selectionGroups||[]),
          selections:(p.selections||[]).map(item=>({
            ...clone(item),
            image:typeof item.image==='string' && item.image.startsWith('data:image/')
              ? ''
              : item.image
          }))
        }))
      };

      const key='jj_selection_recovery_history_v73';
      let history=[];
      try{ history=JSON.parse(localStorage.getItem(key)||'[]'); }catch{}
      history.unshift(snapshot);
      history=history.slice(0,3);
      localStorage.setItem(key,JSON.stringify(history));
    }catch(err){
      console.warn('Selection recovery snapshot could not be saved:',err);
    }
  }

  function projectMatch(localProjects,remoteProject){
    return localProjects.find(p=>String(p.id)===String(remoteProject.id))
      || localProjects.find(p=>remoteProject.jobNo && p.jobNo===remoteProject.jobNo)
      || localProjects.find(p=>remoteProject.name && p.name===remoteProject.name);
  }

  function meaningful(value){
    return value !== undefined && value !== null && value !== '';
  }

  function mergeOneSelection(localItem,remoteItem){
    // Local/app record wins by default. Only fill information that is missing
    // locally. This prevents older homeowner snapshots from rolling products
    // backward while still allowing recovery of incomplete records.
    const merged={...localItem};

    const fillIfBlank=[
      'url','title','vendor','category','room','quality','model','image',
      'unitPrice','quantity','purchasedBy','optionGroupId','optionGroupTitle',
      'optionLabel','description','notes','leadTimeValue','leadTimeUnit'
    ];

    fillIfBlank.forEach(key=>{
      if(!meaningful(merged[key]) && meaningful(remoteItem[key])){
        merged[key]=clone(remoteItem[key]);
      }
    });

    // Homeowner may positively select something. Accept that positive action,
    // but never downgrade Ordered/Received/Approved or delete the local record.
    if(remoteItem.homeownerSelected===true){
      merged.homeownerSelected=true;
      if(remoteItem.homeownerSelectedAt) merged.homeownerSelectedAt=remoteItem.homeownerSelectedAt;
      if((merged.status||'Pending')==='Pending') merged.status='Selected';
    }

    if(remoteItem.inStock===true && !merged.inStock) merged.inStock=true;

    return merged;
  }

  function safeMergeRemoteState(remoteState,source='homeowner'){
    const s=currentState();
    if(!s?.projects || !remoteState?.projects) return {added:0,filled:0};

    saveRecoverySnapshot('before-'+source);

    let added=0;
    let filled=0;

    remoteState.projects.forEach(remoteProject=>{
      const localProject=projectMatch(s.projects,remoteProject);
      if(!localProject) return;

      if(!Array.isArray(localProject.selections)) localProject.selections=[];
      if(!Array.isArray(localProject.selectionRooms)) localProject.selectionRooms=[];
      if(!Array.isArray(localProject.selectionGroups)) localProject.selectionGroups=[];

      // Never remove rooms/groups from the app. Union only.
      for(const room of remoteProject.selectionRooms||[]){
        if(room && !localProject.selectionRooms.includes(room)){
          localProject.selectionRooms.push(room);
        }
      }

      const localGroups=new Map(localProject.selectionGroups.map(g=>[String(g.id),g]));
      for(const group of remoteProject.selectionGroups||[]){
        if(!group?.id) continue;
        if(!localGroups.has(String(group.id))){
          localProject.selectionGroups.push(clone(group));
          localGroups.set(String(group.id),group);
        }
      }

      const byId=new Map(
        localProject.selections
          .filter(item=>item?.id!==undefined && item?.id!==null)
          .map(item=>[String(item.id),item])
      );

      for(const remoteItem of remoteProject.selections||[]){
        if(!remoteItem) continue;
        const key=remoteItem.id!==undefined && remoteItem.id!==null
          ? String(remoteItem.id)
          : '';

        if(key && byId.has(key)){
          const localItem=byId.get(key);
          const before=JSON.stringify(localItem);
          const merged=mergeOneSelection(localItem,remoteItem);
          Object.assign(localItem,merged);
          if(JSON.stringify(localItem)!==before) filled++;
          continue;
        }

        // If an older portal record lacks a stable id, avoid duplicate recovery
        // by checking a product fingerprint first.
        const fingerprint = x => [
          String(x.title||'').trim().toLowerCase(),
          String(x.url||'').trim().toLowerCase(),
          String(x.model||'').trim().toLowerCase(),
          String(x.room||'').trim().toLowerCase()
        ].join('|');

        const fp=fingerprint(remoteItem);
        const existing=localProject.selections.find(item=>fingerprint(item)===fp && fp!=='|||');
        if(existing){
          const before=JSON.stringify(existing);
          Object.assign(existing,mergeOneSelection(existing,remoteItem));
          if(JSON.stringify(existing)!==before) filled++;
        }else{
          localProject.selections.push(clone(remoteItem));
          added++;
        }
      }
    });

    // Persist the merged/union state. This intentionally pushes the union back
    // to cloud so an incomplete portal copy cannot remain authoritative.
    try{
      localStorage.setItem('jj_full_proto',JSON.stringify(s));
      if(typeof saveState==='function') saveState(false);
      if(typeof renderAll==='function') renderAll();
    }catch(err){
      console.error('Safe selection merge save failed:',err);
    }

    return {added,filled};
  }

  async function safeManualSync(){
    if(safeSyncBusy) return;
    if(!safeRpc){
      try{ toast('Cloud is still connecting'); }catch{}
      return;
    }

    let project=null;
    try{ project=selectedProject(); }catch{}
    if(!project) return;

    safeSyncBusy=true;
    try{
      const {data,error}=await safeRpc('jj_portal_sync',{p_job:String(project.id)});
      if(error) throw error;
      if(!data){
        try{ toast('No new homeowner updates'); }catch{}
        return;
      }

      const result=safeMergeRemoteState(data,'manual-homeowner-sync');
      try{
        toast(result.added
          ? `Recovered ${result.added} missing selection${result.added===1?'':'s'}`
          : 'Homeowner updates merged safely');
      }catch{}
    }catch(err){
      console.error('Safe homeowner sync error:',err);
      try{ toast('Homeowner sync unavailable'); }catch{}
    }finally{
      safeSyncBusy=false;
    }
  }

  async function safeAutoSync(){
    if(safeSyncBusy || document.hidden || !safeRpc) return;

    // Avoid changing state while the user is editing.
    if(document.querySelector('.selection-modal-backdrop.open')
      || document.querySelector('dialog[open]')
      || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
      return;
    }

    safeSyncBusy=true;
    try{
      const {data,error}=await safeRpc('jj_portal_sync_pending');
      if(!error && data){
        safeMergeRemoteState(data,'auto-homeowner-sync');
      }
    }catch(err){
      console.warn('Safe auto homeowner sync:',err);
    }finally{
      safeSyncBusy=false;
    }
  }

  function installRpcGuard(){
    let client=null;
    try{ client=cloudClient; }catch{}
    if(!client?.rpc || rpcPatched) return false;

    rpcPatched=true;
    safeRpc=client.rpc.bind(client);

    // The original app created an 8-second interval using the old destructive
    // autoSyncHomeownerSelections function. We cannot recover that interval id,
    // so guard the RPC it uses. Returning null prevents that old callback from
    // replacing the entire app state.
    client.rpc=function(functionName,args,options){
      if(functionName==='jj_portal_sync_pending' && !window.__jjSafePortalRpcPass){
        return Promise.resolve({data:null,error:null});
      }
      return safeRpc(functionName,args,options);
    };

    // Replace the manual Refresh Homeowner Updates action with safe union merge.
    window.syncHomeownerSelections=safeManualSync;

    // Our safe interval performs union-only recovery.
    setInterval(safeAutoSync,8000);

    console.info('J&J selection data safety v73 active');
    return true;
  }

  // cloudClient is initialized asynchronously after this shared file loads.
  const installer=setInterval(()=>{
    if(installRpcGuard()){
      clearInterval(installer);
      // Run a safe recovery pass once after cloud is connected.
      setTimeout(safeAutoSync,1200);
    }
  },500);

  // Public emergency helper for console/debug use.
  window.JJSelectionRecovery={
    syncNow:safeManualSync,
    merge:safeMergeRemoteState,
    snapshot:()=>saveRecoverySnapshot('manual')
  };
})();

/* -------------------------------------------------------------------------
   J&J Smart Selection PDF Import v79
   Built around the actual J&J PDF layouts:
   - 3-column comparison sheets (Alyssa / Ashley style)
   - vertical product-card sheets (Adam / Tracey style)
   Pulls: product photo crop, all product links, Model/SKU/UPC/Internet/Item IDs,
   price, budget, vendor, description, selection status, and option group.
   SAFETY:
   - Rejects unrelated/non-J&J-selection PDFs.
   - Review-first only; nothing imports until confirmed.
   - Never deletes/replaces existing selections.
   - Dedupes within the upload and against the current project.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjSmartPdfImportV79) return;
  window.__jjSmartPdfImportV79 = true;

  const PDFJS_SRC='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const STYLE_ID='jj-smart-pdf-import-v79';

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #jjUploadSelectionPdfV76{display:none!important}
      .jj-smart-upload-help{
        margin:-4px 0 12px;color:#667386;font-size:10px;line-height:1.4
      }
      .jj-v79-review{
        width:min(1100px,calc(100% - 20px));max-height:92dvh;border:0;border-radius:16px;
        padding:0;color:#202633;box-shadow:0 24px 70px rgba(12,28,45,.35)
      }
      .jj-v79-review::backdrop{background:rgba(7,18,31,.6)}
      .jj-v79-head,.jj-v79-foot{
        position:sticky;z-index:4;display:flex;align-items:center;justify-content:space-between;
        gap:12px;padding:15px 17px;background:#fff
      }
      .jj-v79-head{top:0;border-bottom:1px solid #E2E6EC}
      .jj-v79-foot{bottom:0;border-top:1px solid #E2E6EC;justify-content:flex-end;flex-wrap:wrap}
      .jj-v79-head small{display:block;color:#B59A62;font-size:9px;font-weight:950;letter-spacing:.9px}
      .jj-v79-head h3{margin:2px 0 0;color:#14234A}
      .jj-v79-body{padding:16px;background:#F6F8FA;overflow:auto}
      .jj-v79-file-report{display:grid;gap:8px;margin-bottom:12px}
      .jj-v79-file-row{
        display:flex;justify-content:space-between;gap:12px;align-items:center;
        padding:9px 11px;border:1px solid #DCE2E9;border-radius:9px;background:#fff;font-size:11px
      }
      .jj-v79-file-row strong{color:#14234A}
      .jj-v79-file-row.good span{color:#246441;font-weight:850}
      .jj-v79-file-row.skip span{color:#A43A2A;font-weight:850}
      .jj-v79-summary{
        display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:11px 13px;
        border:1px solid #DCE2E9;border-radius:10px;background:#fff;color:#596779;font-size:11px
      }
      .jj-v79-summary b{color:#14234A}
      .jj-v79-safety{
        width:100%;padding-top:4px;color:#246441;font-weight:850
      }
      .jj-v79-list{display:grid;gap:10px}
      .jj-v79-item{
        display:grid;grid-template-columns:auto 105px minmax(0,1fr);gap:11px;
        padding:12px;border:1px solid #DCE2E9;border-radius:12px;background:#fff
      }
      .jj-v79-item.duplicate{opacity:.62;background:#FAFAFA}
      .jj-v79-item.review{border-style:dashed;background:#FFFDF7}
      .jj-v79-check input{width:18px;height:18px;margin-top:4px}
      .jj-v79-photo{
        width:105px;height:92px;object-fit:contain;border:1px solid #E1E6EC;border-radius:8px;background:#fff
      }
      .jj-v79-photo-empty{
        display:grid;place-items:center;width:105px;height:92px;border:1px dashed #D0D7E0;border-radius:8px;
        color:#8A95A2;font-size:9px;text-align:center
      }
      .jj-v79-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:7px}
      .jj-v79-title strong{color:#14234A;font-size:13px}
      .jj-v79-chip{
        display:inline-flex;padding:4px 7px;border-radius:999px;background:#EEF3F7;color:#536174;
        font-size:9px;font-weight:850
      }
      .jj-v79-chip.good{background:#EAF5EE;color:#246441}
      .jj-v79-chip.warn{background:#FFF1D9;color:#865E0A}
      .jj-v79-grid{display:grid;grid-template-columns:1.35fr .8fr .9fr .85fr;gap:8px}
      .jj-v79-grid label{font-size:9px;font-weight:850;color:#667386;text-transform:uppercase;letter-spacing:.4px}
      .jj-v79-grid input,.jj-v79-grid select{
        width:100%;margin-top:4px;padding:8px 9px;border:1px solid #C9D1DB;border-radius:7px;
        background:#fff;color:#202633;font-size:11px;text-transform:none;letter-spacing:0
      }
      .jj-v79-meta{margin-top:7px;color:#6B7787;font-size:10px;line-height:1.45}
      .jj-v79-progress{
        position:fixed;z-index:99999;left:50%;top:50%;transform:translate(-50%,-50%);
        width:min(460px,calc(100% - 30px));padding:18px;border-radius:14px;background:#14234A;color:#fff;
        box-shadow:0 20px 65px rgba(0,0,0,.35);font-size:12px
      }
      .jj-v79-progress b{display:block;margin-bottom:6px;font-size:14px}
      .jj-v79-extra-links{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}
      .jj-v79-extra-links a{font-size:10px!important}
      @media(max-width:760px){
        .jj-v79-item{grid-template-columns:auto 80px minmax(0,1fr)}
        .jj-v79-photo,.jj-v79-photo-empty{width:80px;height:76px}
        .jj-v79-grid{grid-template-columns:1fr 1fr}
      }
      @media(max-width:520px){
        .jj-v79-item{grid-template-columns:auto minmax(0,1fr)}
        .jj-v79-photo,.jj-v79-photo-empty{grid-column:2;width:100%;height:150px}
        .jj-v79-main{grid-column:1/-1}
        .jj-v79-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function currentProject(){
    try{return typeof window.selectedProject==='function'?window.selectedProject():null}catch{return null}
  }

  function loadPdfJs(){
    if(window.pdfjsLib){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
      return Promise.resolve(window.pdfjsLib);
    }
    if(window.__jjV79PdfPromise)return window.__jjV79PdfPromise;
    window.__jjV79PdfPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=PDFJS_SRC;
      script.async=true;
      script.onload=()=>{
        if(!window.pdfjsLib){reject(new Error('PDF reader did not load'));return}
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      script.onerror=()=>reject(new Error('PDF reader could not load. Check your connection.'));
      document.head.appendChild(script);
    });
    return window.__jjV79PdfPromise;
  }

  function ensureInput(){
    let input=document.getElementById('jjSmartPdfInputV79');
    if(input)return input;
    input=document.createElement('input');
    input.id='jjSmartPdfInputV79';
    input.type='file';
    input.accept='application/pdf,.pdf';
    input.multiple=true;
    input.hidden=true;
    input.addEventListener('change',async()=>{
      const files=[...input.files||[]];
      input.value='';
      if(files.length)await parseFiles(files);
    });
    document.body.appendChild(input);
    return input;
  }

  function ensureButton(){
    const root=document.getElementById('selections');
    if(!root)return;
    const actions=root.querySelector('.selection-heading-actions') || root.querySelector('.selection-toolbar');
    if(!actions)return;

    if(!actions.querySelector('#jjSmartPdfUploadV79')){
      const btn=document.createElement('button');
      btn.id='jjSmartPdfUploadV79';
      btn.type='button';
      btn.className='btn btn-light';
      btn.textContent='Upload File';
      btn.title='Upload J&J selections PDF(s), review detected products, then import';
      btn.addEventListener('click',()=>ensureInput().click());
      actions.appendChild(btn);

      const help=document.createElement('div');
      help.className='jj-smart-upload-help';
      help.textContent='PDF import: Upload → automatic reading → review every product → Import Selected. Existing selections are never replaced.';
      (actions.closest('.selection-heading')||actions).insertAdjacentElement('afterend',help);
    }
  }

  function showProgress(text){
    let box=document.getElementById('jjV79Progress');
    if(!box){
      box=document.createElement('div');
      box.id='jjV79Progress';
      box.className='jj-v79-progress';
      box.innerHTML='<b>Reading selections PDF</b><span></span>';
      document.body.appendChild(box);
    }
    box.querySelector('span').textContent=text;
  }

  function hideProgress(){
    document.getElementById('jjV79Progress')?.remove();
  }

  function textItemRect(item,viewport){
    const t=item.transform||[1,0,0,1,0,0];
    const [vx,vy]=viewport.convertToViewportPoint(Number(t[4]||0),Number(t[5]||0));
    const fontH=Math.max(5,Math.abs(Number(item.height||t[3]||8))*viewport.scale);
    const width=Math.max(1,Number(item.width||0)*viewport.scale);
    return {
      text:clean(item.str),
      x:vx,
      y:vy-fontH,
      w:width,
      h:fontH,
      right:vx+width,
      bottom:vy
    };
  }

  function annotationRect(annotation,viewport){
    if(!Array.isArray(annotation.rect)||annotation.rect.length<4)return null;
    const r=viewport.convertToViewportRectangle(annotation.rect);
    const x=Math.min(r[0],r[2]),y=Math.min(r[1],r[3]);
    return {
      x,y,w:Math.abs(r[2]-r[0]),h:Math.abs(r[3]-r[1]),
      right:Math.max(r[0],r[2]),bottom:Math.max(r[1],r[3]),
      url:clean(annotation.url||annotation.unsafeUrl||'')
    };
  }

  function nearbyText(rect,texts,maxDistance=28){
    let best=null,bestDistance=Infinity;
    for(const item of texts){
      const dx=Math.max(0,Math.max(item.x-rect.right,rect.x-item.right));
      const dy=Math.max(0,Math.max(item.y-rect.bottom,rect.y-item.bottom));
      const d=Math.hypot(dx,dy);
      if(d<bestDistance){best=item;bestDistance=d}
    }
    return bestDistance<=maxDistance?best:null;
  }

  function validProductLinks(annotations,texts,viewport){
    return (annotations||[])
      .map(a=>annotationRect(a,viewport))
      .filter(Boolean)
      .filter(link=>/^https?:\/\//i.test(link.url))
      .map(link=>{
        const near=nearbyText(link,texts,34);
        return {...link,label:clean(near?.text||'VIEW PRODUCT')};
      })
      .filter(link=>/VIEW\s+(PRODUCT|TRIM|ROUGH|ROUGH-IN)/i.test(link.label));
  }

  function pageIsJJSelections(text){
    const s=norm(text);
    return /j j home renovations/.test(s) &&
      /(selection|bathroom|fixture|vanity|shower|toilet|flooring|door|lighting)/.test(s);
  }

  function clusterByY(links,tolerance=18){
    const clusters=[];
    [...links].sort((a,b)=>a.y-b.y).forEach(link=>{
      let cluster=clusters.find(c=>Math.abs(c.y-link.y)<=tolerance);
      if(!cluster){
        cluster={y:link.y,links:[]};
        clusters.push(cluster);
      }
      cluster.links.push(link);
      cluster.y=cluster.links.reduce((s,l)=>s+l.y,0)/cluster.links.length;
    });
    return clusters.sort((a,b)=>a.y-b.y);
  }

  function isHeadingText(text){
    const s=clean(text);
    if(!s||s.length>50)return false;
    if(/J\s*&\s*J|HOME RENOVATIONS|BATHROOM SELECTIONS|\d+\s+OF\s+\d+/i.test(s))return false;
    return /^[A-Z0-9 &/+.-]+$/.test(s) &&
      /(TOILET|SHOWER|VANITY|FAUCET|LIGHT|ENCLOSURE|DOOR|FLOOR|TILE|MIRROR|FAN|HARDWARE|CROWN|BASEBOARD|CASING|RAIN HEAD|ARM|FIXTURE|VALVE)/i.test(s);
  }

  function headingAbove(texts,y,maxGap=95){
    const candidates=texts.filter(t=>t.bottom<y && y-t.bottom<=maxGap && isHeadingText(t.text));
    return candidates.sort((a,b)=>b.bottom-a.bottom)[0]||null;
  }

  function groupNameFromHeading(value){
    let s=clean(value)
      .replace(/\s*-\s*OPTION\s*\d+.*$/i,'')
      .replace(/\s+OPTION\s*\d+.*$/i,'')
      .replace(/\s*\(HEAD ONLY\)\s*$/i,'')
      .trim();
    return s.replace(/\b\w/g,c=>c.toUpperCase());
  }

  function linesInRegion(texts,region){
    const chosen=texts.filter(t=>{
      const cx=t.x+t.w/2,cy=t.y+t.h/2;
      return cx>=region.x && cx<=region.right && cy>=region.y && cy<=region.bottom;
    });

    const rows=[];
    chosen.sort((a,b)=>Math.abs(a.y-b.y)>3?a.y-b.y:a.x-b.x).forEach(item=>{
      let row=rows.find(r=>Math.abs(r.y-item.y)<=3.5);
      if(!row){row={y:item.y,items:[]};rows.push(row)}
      row.items.push(item);
    });

    return rows.sort((a,b)=>a.y-b.y).map(row=>({
      y:row.y,
      text:clean(row.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' '))
    })).filter(r=>r.text);
  }

  function metadata(blockText){
    const get=re=>{
      const m=blockText.match(re);
      return clean(m?.[1]||'');
    };
    const priceRaw=
      get(/\bPRICE\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i) ||
      get(/\$\s*([0-9,]+(?:\.\d{1,2})?)\s+CURRENT PRICE/i) ||
      get(/\bCURRENT PRICE\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i) ||
      get(/\bADDITIONAL COST\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i);

    const budgetRaw=get(/\bBUDGET\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const model=get(/\bModels?\s+([A-Za-z0-9._/-]+(?:\s*\+\s*[A-Za-z0-9._/-]+)?)/i);
    const storeSku=get(/\bStore\s*SKU\s*#?\s*([A-Za-z0-9._/-]+)/i);
    const upc=get(/\bUPC(?:\s*Code)?\s*#?\s*([A-Za-z0-9._/-]+)/i);
    const internet=get(/\bInternet\s*#?\s*([A-Za-z0-9._/-]+)/i);
    const itemId=get(/\bItem\s*#?\s*([A-Za-z0-9._/-]+)/i);
    const vendor=get(/\bVendor\s*:\s*([A-Za-z0-9 '&.+-]+?)(?=\s+(?:Store|Internet|Item|Model|UPC|BUDGET|PRICE|CURRENT|AT BUDGET|OVER BUDGET|VIEW)|$)/i);

    return {
      price:priceRaw?Number(priceRaw.replace(/,/g,'')):null,
      budget:budgetRaw?Number(budgetRaw.replace(/,/g,'')):null,
      model,storeSku,upc,internet,itemId,vendor
    };
  }

  function inferStatus(blockText){
    if(/CURRENT SELECTION/i.test(blockText))return 'Selected';
    if(/\bRECOMMENDED\b/i.test(blockText))return 'Recommended';
    return 'Recommended';
  }

  function categoryFromHeading(heading,title){
    const s=(heading+' '+title).toLowerCase();
    if(/toilet|faucet|shower|valve|rain head|arm|plumbing/.test(s))return 'Plumbing';
    if(/vanity/.test(s)&&!/light|faucet/.test(s))return 'Vanity';
    if(/light|fan|electrical/.test(s))return 'Electrical';
    if(/mirror/.test(s))return 'Mirror';
    if(/floor|tile/.test(s))return 'Flooring / Tile';
    if(/door|hardware|casing|baseboard|crown/.test(s))return 'Doors / Trim';
    return groupNameFromHeading(heading)||'Selection';
  }

  function cleanDescription(lines,title){
    return lines
      .map(r=>r.text)
      .filter(s=>
        clean(s)!==clean(title) &&
        !isHeadingText(s) &&
        !/^VIEW\s+/i.test(s) &&
        !/\bVendor\s*:/i.test(s) &&
        !/\b(?:Store SKU|UPC|Internet|Item|Model)\s*#?/i.test(s) &&
        !/^(BUDGET|PRICE|CURRENT PRICE|CURRENT SELECTION|AT BUDGET|OVER BUDGET|PRICE PENDING|WILL NOT MATCH)/i.test(s)
      )
      .join(' | ')
      .replace(/\s*\|\s*\|\s*/g,' | ')
      .trim();
  }

  function titleFromLines(lines,heading,layout){
    const filtered=lines.filter(row=>{
      const s=row.text;
      if(!s||/^VIEW\s+/i.test(s)||isHeadingText(s))return false;
      if(/\b(BUDGET|PRICE|CURRENT PRICE|CURRENT SELECTION|AT BUDGET|OVER BUDGET|Vendor:|Store SKU|UPC|Internet|Item #|Model)\b/i.test(s))return false;
      if(/J\s*&\s*J|HOME RENOVATIONS|BATHROOM SELECTIONS/i.test(s))return false;
      return true;
    });
    if(!filtered.length)return '';
    // Product titles in both J&J layouts are the first meaningful text line/card block.
    return clean(filtered[0].text);
  }

  function cardLinksForRegion(allLinks,region){
    return allLinks.filter(link=>{
      const cx=link.x+link.w/2,cy=link.y+link.h/2;
      return cx>=region.x && cx<=region.right && cy>=region.y && cy<=region.bottom;
    });
  }

  function nearestTitleX(texts,region,title){
    const t=texts.find(item=>{
      const cx=item.x+item.w/2,cy=item.y+item.h/2;
      return cx>=region.x&&cx<=region.right&&cy>=region.y&&cy<=region.bottom &&
        norm(item.text)===norm(title);
    });
    return t?.x ?? null;
  }

  function imageDataFromRegion(pageCanvas,region,titleX,layout){
    const scaleX=pageCanvas.width/region.pageWidth;
    const scaleY=pageCanvas.height/region.pageHeight;

    let crop={x:region.x,y:region.y,w:region.w,h:region.h};

    if(layout==='grid'){
      // Image is above the product title. Find a conservative upper-card crop.
      const titleY=region.titleY||region.y+region.h*.46;
      crop={
        x:region.x+7,
        y:region.y+5,
        w:Math.max(30,region.w-14),
        h:Math.max(30,titleY-region.y-8)
      };
    }else{
      // Horizontal cards place the photo to the left of the text column.
      const right=Math.max(region.x+50,(titleX||region.x+region.w*.33)-12);
      crop={
        x:region.x+8,
        y:region.y+7,
        w:Math.max(30,right-region.x-14),
        h:Math.max(30,region.h-14)
      };
    }

    const sx=Math.max(0,Math.floor(crop.x*scaleX));
    const sy=Math.max(0,Math.floor(crop.y*scaleY));
    const sw=Math.min(pageCanvas.width-sx,Math.max(1,Math.floor(crop.w*scaleX)));
    const sh=Math.min(pageCanvas.height-sy,Math.max(1,Math.floor(crop.h*scaleY)));

    if(sw<30||sh<30)return '';

    const maxW=460,maxH=320;
    const ratio=Math.min(1,maxW/sw,maxH/sh);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(sw*ratio));
    canvas.height=Math.max(1,Math.round(sh*ratio));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(pageCanvas,sx,sy,sw,sh,0,0,canvas.width,canvas.height);

    try{return canvas.toDataURL('image/jpeg',.78)}catch{return ''}
  }

  async function renderPage(page,viewport){
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);
    canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    return canvas;
  }

  async function parsePage(page,fileName,pageNumber,project){
    const viewport=page.getViewport({scale:1.6});
    const [textContent,annotations]=await Promise.all([
      page.getTextContent(),
      page.getAnnotations({intent:'display'}).catch(()=>[])
    ]);

    const texts=(textContent.items||[])
      .map(item=>textItemRect(item,viewport))
      .filter(item=>item.text);
    const pageText=texts.map(t=>t.text).join(' ');

    if(!pageIsJJSelections(pageText))return {accepted:false,items:[]};

    const allLinks=validProductLinks(annotations,texts,viewport);
    if(!allLinks.length)return {accepted:true,items:[]};

    const rows=clusterByY(allLinks,22);
    const denseRows=rows.filter(row=>row.links.length>=2).length;
    const layout=denseRows>=Math.ceil(rows.length/2)?'grid':'horizontal';

    const canvas=await renderPage(page,viewport);
    const items=[];

    if(layout==='grid'){
      for(const row of rows){
        if(row.links.length<2)continue; // filters stray duplicate hyperlink rows
        const sorted=[...row.links].sort((a,b)=>a.x-b.x);

        for(let i=0;i<sorted.length;i++){
          const link=sorted[i];
          const heading=headingAbove(texts,link.y,130);
          const left=Math.max(0,link.x-8);
          const right=i<sorted.length-1?Math.max(left+80,sorted[i+1].x-12):viewport.width-38;
          const top=heading?heading.bottom+14:Math.max(0,link.y-245);
          const bottom=Math.min(viewport.height,link.bottom+18);
          const region={x:left,y:top,right,bottom,w:right-left,h:bottom-top,pageWidth:viewport.width,pageHeight:viewport.height};

          const lines=linesInRegion(texts,region);
          const headingText=heading?.text||'Selection';
          const title=titleFromLines(lines,headingText,layout);
          if(!title)continue;

          const titleItem=texts.find(t=>
            t.x>=region.x&&t.x<=region.right&&t.y>=region.y&&t.y<=region.bottom&&
            norm(t.text)===norm(title)
          );
          region.titleY=titleItem?.y||region.y+region.h*.46;

          const blockText=lines.map(r=>r.text).join(' ');
          const meta=metadata(blockText);
          const links=cardLinksForRegion(allLinks,region);
          const group=groupNameFromHeading(headingText);

          items.push(makeCandidate({
            fileName,pageNumber,project,headingText,title,lines,blockText,meta,links,group,
            image:imageDataFromRegion(canvas,region,titleItem?.x,layout)
          }));
        }
      }
    }else{
      // Each link row corresponds to one vertical product card. Multiple links
      // on the same y row remain attached to the same selection.
      const rowCenters=rows.map(r=>r.y);

      for(let r=0;r<rows.length;r++){
        const row=rows[r];
        const y=row.y;
        const previous=rowCenters[r-1];
        const next=rowCenters[r+1];
        const top=r===0?Math.max(95,y-125):(previous+y)/2+6;
        const bottom=r===rows.length-1?Math.min(viewport.height,y+38):(y+next)/2-6;

        // Use almost full page width; the header above is excluded by vertical bounds.
        const region={x:38,y:top,right:viewport.width-38,bottom,w:viewport.width-76,h:bottom-top,pageWidth:viewport.width,pageHeight:viewport.height};
        const lines=linesInRegion(texts,region);

        // Product label is the first all-caps selection heading within this card.
        const headingRow=lines.find(line=>isHeadingText(line.text));
        const headingText=headingRow?.text||'Selection';
        const title=titleFromLines(lines,headingText,layout);
        if(!title)continue;

        const titleItem=texts.find(t=>
          t.x>=region.x&&t.x<=region.right&&t.y>=region.y&&t.y<=region.bottom&&
          norm(t.text)===norm(title)
        );
        const blockText=lines.map(r=>r.text).join(' ');
        const meta=metadata(blockText);
        const group=/OPTION\s*\d+/i.test(headingText)?groupNameFromHeading(headingText):'';
        const links=cardLinksForRegion(allLinks,region);

        items.push(makeCandidate({
          fileName,pageNumber,project,headingText,title,lines,blockText,meta,links,group,
          image:imageDataFromRegion(canvas,region,titleItem?.x,layout)
        }));
      }
    }

    return {accepted:true,items};
  }

  function makeCandidate({fileName,pageNumber,project,headingText,title,lines,blockText,meta,links,group,image}){
    const primary=links[0]?.url||'';
    const additional=links.slice(1).map((link,index)=>({
      label:/ROUGH/i.test(link.label)?'View Rough-In':/TRIM/i.test(link.label)?'View Trim':`View Product ${index+2}`,
      url:link.url
    }));

    const identifiers=[
      meta.model?`Model ${meta.model}`:'',
      meta.storeSku?`Store SKU ${meta.storeSku}`:'',
      meta.upc?`UPC ${meta.upc}`:'',
      meta.internet?`Internet #${meta.internet}`:'',
      meta.itemId?`Item #${meta.itemId}`:''
    ].filter(Boolean);

    const notes=[
      identifiers.length?identifiers.join(' · '):'',
      meta.budget!==null?`PDF Budget: $${meta.budget.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}`:'',
      `Imported from PDF: ${fileName} · page ${pageNumber}`
    ].filter(Boolean).join('\n');

    return {
      sourceFile:fileName,
      sourcePage:pageNumber,
      label:headingText,
      title:clean(title),
      room:project?.selectionActiveRoom||project?.selectionRooms?.[0]||'Primary Bathroom',
      category:categoryFromHeading(headingText,title),
      group,
      vendor:meta.vendor||'',
      model:meta.model||meta.storeSku||meta.upc||meta.internet||meta.itemId||'',
      identifiers:{
        model:meta.model||'',
        storeSku:meta.storeSku||'',
        upc:meta.upc||'',
        internet:meta.internet||'',
        itemId:meta.itemId||''
      },
      description:cleanDescription(lines,title),
      notes,
      status:inferStatus(blockText),
      purchasedBy:'',
      unitPrice:meta.price,
      budget:meta.budget,
      url:primary,
      additionalLinks:additional,
      image:image||''
    };
  }

  function fingerprint(item){
    if(item.identifiers?.model)return 'model|'+norm(item.identifiers.model);
    if(item.identifiers?.storeSku)return 'sku|'+norm(item.identifiers.storeSku);
    if(item.identifiers?.upc)return 'upc|'+norm(item.identifiers.upc);
    if(item.url)return 'url|'+clean(item.url).toLowerCase();
    return 'title|'+norm(item.title)+'|'+norm(item.vendor)+'|'+norm(item.room);
  }

  async function parseFiles(files){
    const project=currentProject();
    if(!project){window.toast?.('Open a project first');return}

    const pdfjs=await loadPdfJs();
    const all=[];
    const report=[];

    try{
      for(let f=0;f<files.length;f++){
        const file=files[f];
        showProgress(`${file.name} · opening ${f+1} of ${files.length}`);
        const bytes=new Uint8Array(await file.arrayBuffer());
        const pdf=await pdfjs.getDocument({data:bytes}).promise;

        let acceptedPages=0;
        let fileItems=[];

        for(let p=1;p<=pdf.numPages;p++){
          showProgress(`${file.name} · reading page ${p} of ${pdf.numPages}`);
          const page=await pdf.getPage(p);
          const result=await parsePage(page,file.name,p,project);
          if(result.accepted)acceptedPages++;
          fileItems.push(...result.items);
        }

        if(!acceptedPages){
          report.push({name:file.name,status:'Skipped — not recognized as a J&J selections PDF',accepted:false,count:0});
        }else{
          all.push(...fileItems);
          report.push({name:file.name,status:`Read ${fileItems.length} product${fileItems.length===1?'':'s'}`,accepted:true,count:fileItems.length});
        }
      }
    }catch(err){
      console.error('Smart PDF import failed',err);
      hideProgress();
      alert(`PDF import stopped.\n\n${err?.message||'Please try again.'}`);
      return;
    }

    hideProgress();

    const existing=new Set((project.selections||[]).map(item=>{
      const identifiers={
        model:item.identifiers?.model||item.model||'',
        storeSku:item.identifiers?.storeSku||'',
        upc:item.identifiers?.upc||'',
        internet:item.identifiers?.internet||'',
        itemId:item.identifiers?.itemId||''
      };
      return fingerprint({...item,identifiers});
    }));

    const seen=new Set();
    all.forEach(item=>{
      const key=fingerprint(item);
      item.duplicateExisting=existing.has(key);
      item.duplicateUpload=seen.has(key);
      item.duplicate=item.duplicateExisting||item.duplicateUpload;
      seen.add(key);
    });

    openReview(all,files,report);
  }

  function statusOptions(current){
    return ['Pending','Recommended','Selected']
      .map(v=>`<option ${v===current?'selected':''}>${v}</option>`).join('');
  }

  function roomOptions(project,current){
    const rooms=[...(project.selectionRooms||[])];
    if(current&&!rooms.includes(current))rooms.push(current);
    return rooms.map(v=>`<option ${v===current?'selected':''}>${esc(v)}</option>`).join('');
  }

  function purchasedOptions(current){
    return ['','J&J','Homeowner'].map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${v||'Not assigned'}</option>`).join('');
  }

  function openReview(items,files,report){
    document.getElementById('jjV79Review')?.remove();
    const project=currentProject();
    const unique=items.filter(i=>!i.duplicate);

    const dialog=document.createElement('dialog');
    dialog.id='jjV79Review';
    dialog.className='jj-v79-review';

    dialog.innerHTML=`
      <div class="jj-v79-head">
        <div><small>SMART PDF IMPORT</small><h3>Review Everything Before Import</h3></div>
        <button type="button" class="jj-group-icon" data-close aria-label="Close">×</button>
      </div>
      <div class="jj-v79-body">
        <div class="jj-v79-file-report">
          ${report.map(file=>`<div class="jj-v79-file-row ${file.accepted?'good':'skip'}">
            <strong>${esc(file.name)}</strong><span>${esc(file.status)}</span>
          </div>`).join('')}
        </div>

        <div class="jj-v79-summary">
          <span><b>${items.length}</b> products detected</span>
          <span><b>${unique.length}</b> ready to review/import</span>
          <span><b>${items.filter(i=>i.duplicate).length}</b> duplicates skipped</span>
          <span><b>${items.filter(i=>i.image).length}</b> photos captured</span>
          <span><b>${items.filter(i=>i.url).length}</b> product links captured</span>
          <div class="jj-v79-safety">Nothing has been added yet. Only checked rows are appended when you press Import Selected.</div>
        </div>

        ${items.length?`<div class="jj-v79-list">
          ${items.map((item,index)=>`
            <section class="jj-v79-item ${item.duplicate?'duplicate':''}" data-v79-row="${index}">
              <div class="jj-v79-check"><input type="checkbox" data-v79-check="${index}" ${item.duplicate?'':'checked'}></div>
              <div>${item.image?`<img class="jj-v79-photo" src="${esc(item.image)}" alt="">`:'<div class="jj-v79-photo-empty">No photo detected</div>'}</div>
              <div class="jj-v79-main">
                <div class="jj-v79-title">
                  <strong>${esc(item.title)}</strong>
                  <span class="jj-v79-chip">${esc(item.sourceFile)} · p.${item.sourcePage}</span>
                  ${item.group?`<span class="jj-v79-chip">Group: ${esc(item.group)}</span>`:''}
                  ${item.duplicate?'<span class="jj-v79-chip warn">Duplicate — unchecked</span>':'<span class="jj-v79-chip good">Ready</span>'}
                </div>
                <div class="jj-v79-grid">
                  <label>Product name<input data-v79-title="${index}" value="${esc(item.title)}"></label>
                  <label>Room<select data-v79-room="${index}">${roomOptions(project,item.room)}</select></label>
                  <label>Category<input data-v79-category="${index}" value="${esc(item.category)}"></label>
                  <label>Status<select data-v79-status="${index}">${statusOptions(item.status)}</select></label>
                  <label>Group<input data-v79-group="${index}" value="${esc(item.group)}" placeholder="Standalone"></label>
                  <label>Purchased by<select data-v79-purchased="${index}">${purchasedOptions(item.purchasedBy)}</select></label>
                  <label>Vendor<input data-v79-vendor="${index}" value="${esc(item.vendor)}"></label>
                  <label>Model / SKU<input data-v79-model="${index}" value="${esc(item.model)}"></label>
                  <label>Price<input data-v79-price="${index}" type="number" step=".01" min="0" value="${item.unitPrice===null?'':item.unitPrice}"></label>
                </div>
                <div class="jj-v79-meta">
                  ${item.identifiers.model?`Model ${esc(item.identifiers.model)} · `:''}
                  ${item.identifiers.storeSku?`SKU ${esc(item.identifiers.storeSku)} · `:''}
                  ${item.identifiers.upc?`UPC ${esc(item.identifiers.upc)} · `:''}
                  ${item.identifiers.internet?`Internet #${esc(item.identifiers.internet)} · `:''}
                  ${item.identifiers.itemId?`Item #${esc(item.identifiers.itemId)} · `:''}
                  ${item.url?`${item.additionalLinks.length+1} link${item.additionalLinks.length?'s':''} captured · `:''}
                  ${item.budget!==null?`Budget $${item.budget.toLocaleString('en-US')} · `:''}
                  ${esc(item.description||'')}
                </div>
              </div>
            </section>`).join('')}
        </div>`:`<div class="jj-pdf-import-empty"><strong>No selection products detected.</strong><span>Unrelated PDFs are skipped instead of creating bad selections.</span></div>`}
      </div>
      <div class="jj-v79-foot">
        <button type="button" class="btn btn-light" data-close>Cancel</button>
        ${items.length?'<button type="button" class="btn btn-gold" id="jjV79ImportSelected">Import Selected</button>':''}
      </div>`;

    document.body.appendChild(dialog);
    const close=()=>dialog.close();
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('#jjV79ImportSelected')?.addEventListener('click',()=>importSelected(dialog,items,files));
    dialog.showModal();
  }

  function ensureGroup(project,name){
    name=clean(name);
    if(!name)return null;
    if(!Array.isArray(project.selectionGroups))project.selectionGroups=[];
    let group=project.selectionGroups.find(g=>norm(g.name)===norm(name));
    if(!group){
      group={id:'group-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),name};
      project.selectionGroups.push(group);
    }
    return group;
  }

  function importSelected(dialog,items,files){
    const project=currentProject();
    if(!project)return;
    if(!Array.isArray(project.selections))project.selections=[];
    if(!Array.isArray(project.selectionRooms))project.selectionRooms=[];
    if(!Array.isArray(project.selectionImports))project.selectionImports=[];

    const added=[];
    items.forEach((item,index)=>{
      if(!dialog.querySelector(`[data-v79-check="${index}"]`)?.checked)return;

      const title=clean(dialog.querySelector(`[data-v79-title="${index}"]`)?.value);
      if(!title)return;

      const room=clean(dialog.querySelector(`[data-v79-room="${index}"]`)?.value)||project.selectionRooms[0]||'Primary Bathroom';
      const category=clean(dialog.querySelector(`[data-v79-category="${index}"]`)?.value)||'Selection';
      const status=clean(dialog.querySelector(`[data-v79-status="${index}"]`)?.value)||'Recommended';
      const groupName=clean(dialog.querySelector(`[data-v79-group="${index}"]`)?.value);
      const purchasedBy=clean(dialog.querySelector(`[data-v79-purchased="${index}"]`)?.value);
      const vendor=clean(dialog.querySelector(`[data-v79-vendor="${index}"]`)?.value);
      const model=clean(dialog.querySelector(`[data-v79-model="${index}"]`)?.value);
      const rawPrice=dialog.querySelector(`[data-v79-price="${index}"]`)?.value;
      const unitPrice=rawPrice===''?null:Number(rawPrice);

      if(!project.selectionRooms.includes(room))project.selectionRooms.push(room);
      const group=ensureGroup(project,groupName);

      added.push({
        id:Date.now()+added.length+Math.floor(Math.random()*1000),
        url:item.url||'',
        additionalLinks:item.additionalLinks||[],
        title,
        vendor,
        category,
        room,
        quality:'Standard',
        model,
        identifiers:item.identifiers||{},
        budget:item.budget,
        image:item.image||'',
        unitPrice:Number.isFinite(unitPrice)?unitPrice:null,
        quantity:1,
        addTax:false,
        purchasedBy,
        optionLabel:group?'PDF Option':undefined,
        optionGroupId:group?.id,
        optionGroupTitle:group?.name,
        status,
        homeownerSelected:false,
        homeownerSelectedAt:null,
        inStock:false,
        leadTimeValue:1,
        leadTimeUnit:'Day(s)',
        description:item.description||'',
        notes:item.notes||''
      });
    });

    if(!added.length){
      window.toast?.('Choose at least one product to import');
      return;
    }

    project.selections.push(...added);
    project.selectionImports.push({
      id:'pdf-import-'+Date.now(),
      importedAt:new Date().toISOString(),
      files:files.map(f=>f.name),
      count:added.length,
      importer:'v79-smart'
    });

    try{window.JJSelectionRecovery?.snapshot?.()}catch{}
    try{window.saveState?.(false)}catch{}
    try{window.renderAll?.()}catch{}
    try{window.go?.('selections')}catch{}
    dialog.close();
    window.toast?.(`${added.length} selection${added.length===1?'':'s'} imported`);
  }

  /*
    IMPORTANT v82.6:
    Do NOT wrap selectionCard here.
    The old v79 PDF helper used to wrap selectionCard every time its timer ran so
    imported additional links could be displayed. v82 also wraps selectionCard to
    add the bulk checkbox. The two wrappers could alternate forever:
      v79 -> v82 -> v79 -> v82 ...
    That is what created the repeated Select checkboxes seen in the screen recording
    and eventually made the page lag/freeze.

    Additional product links are now rendered by the single v82 card wrapper.
  */

  function boot(){
    injectStyles();
    ensureInput();
    ensureButton();

    /* Keep only the lightweight Upload File button recovery. No card wrappers,
       subtree observers, or repeating timers are needed here. */
    const root=document.getElementById('selections');
    if(root&&!window.__jjV79ButtonObserver){
      const observer=new MutationObserver(()=>{
        if(!document.getElementById('jjSmartPdfUploadV79')) ensureButton();
      });
      observer.observe(root,{childList:true,subtree:false});
      window.__jjV79ButtonObserver=observer;
    }
  }

  window.JJSmartPdfImportV79={
    open:()=>ensureInput().click(),
    parse:files=>parseFiles([...files||[]])
  };

  if(document.readyState==='complete')setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();


/* -------------------------------------------------------------------------
   J&J Selections Native Integration v82
   CLEAN CONSOLIDATION FOR CURRENT index.html / homeowner.html

   Replaces the old v63-v81 patch stack with one controller built around the
   CURRENT app structure:
   - current selectionNamedGroups / selection-room-group markup
   - current selectionCard (which had no bulk checkbox)
   - current Edit Selection modal
   - current standalone homeowner.html

   No project selections are replaced or deleted during installation.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjSelectionsNativeV82) return;
  window.__jjSelectionsNativeV82 = true;

  const STYLE_ID='jj-selections-native-v82';
  const bulkByProject=new Map();
  let editContext={index:null,original:null,pendingGroupId:''};
  let bulkDeleteArmed=false;
  let appInstalled=false;
  let hoInstalled=false;
  let appObserver=null;
  let hoObserver=null;
  let enhancingHO=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function p(){
    try{return typeof window.selectedProject==='function'?window.selectedProject():null}
    catch{return null}
  }

  function save(message=''){
    try{window.saveState?.(false)}catch{}
    try{window.renderSelections?.()}catch{}
    if(message)try{window.toast?.(message)}catch{}
  }

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* Current app: readable cards */
      #selections .selection-card-meta{font-size:12px!important;line-height:1.4!important}
      #selections .selection-card h3{font-size:17px!important;line-height:1.35!important}
      #selections .selection-vendor{font-size:12px!important;line-height:1.45!important}
      #selections .selection-card-body{font-size:13px!important;line-height:1.48!important}
      #selections .selection-price{font-size:18px!important}
      #selections .selection-price small{font-size:11px!important}
      #selections .selection-purchased{font-size:11px!important}
      #selections .selection-card-actions a,
      #selections .selection-card-actions button{font-size:11px!important}

      /* Group heading: visually clearer */
      #selections .named-selection-group{
        border:1px solid #D8DFE7!important;
        border-radius:13px!important;
        overflow:hidden!important;
        background:#fff!important;
        box-shadow:0 3px 10px rgba(20,35,74,.055)!important;
        margin-bottom:13px!important;
      }
      #selections .named-selection-group .selection-room-heading{
        min-height:58px!important;
        padding:12px 14px!important;
        border-left:5px solid #B59A62!important;
        background:linear-gradient(90deg,#F8F3E9 0,#FFFFFF 45%)!important;
        box-shadow:inset 0 -1px 0 #E5E9EE!important;
      }
      #selections .named-selection-group .selection-room-toggle b{
        color:#14234A!important;
        font-size:14px!important;
        font-weight:950!important;
        letter-spacing:.28px!important;
        text-transform:uppercase!important;
      }

      /* Bulk checkbox on every card */
      #selections .jj-bulk-card-select{
        display:flex!important;align-items:center!important;gap:7px!important;
        position:absolute!important;left:10px!important;bottom:10px!important;top:auto!important;z-index:8!important;
        margin:0!important;padding:7px 9px!important;border:1px solid #D5DDE6!important;
        border-radius:8px!important;background:rgba(255,255,255,.96)!important;color:#14234A!important;
        box-shadow:0 2px 8px rgba(20,35,74,.10)!important;
        font-size:10px!important;font-weight:900!important;cursor:pointer!important;
      }
      #selections .selection-photo{position:relative!important}
      #selections .jj-bulk-card-select input{
        display:block!important;appearance:auto!important;-webkit-appearance:checkbox!important;
        width:18px!important;height:18px!important;min-width:18px!important;margin:0!important;
        accent-color:#B59A62!important;opacity:1!important;visibility:visible!important;
      }
      #selections .selection-list .jj-bulk-card-select{
        position:static!important;width:max-content!important;margin:8px 10px!important;
      }

      /* Bulk action bar */
      #jjBulkBarV82{
        display:flex;align-items:center;gap:8px;flex-wrap:wrap;
        margin:10px 0 14px;padding:10px 12px;border:1px solid #D9E0E8;
        border-radius:11px;background:#F8FAFC;
      }
      #jjBulkBarV82 .count{min-width:88px;color:#14234A;font-size:11px;font-weight:900}
      #jjBulkBarV82 button{min-height:36px!important;padding:8px 11px!important;font-size:11px!important}
      #jjBulkBarV82 button:disabled{opacity:.45}
      #jjBulkBarV82 .delete{background:#FFF2F0!important;color:#A43A2A!important;border:1px solid #E6C2BC!important}
      #jjBulkBarV82 .confirm-delete{background:#A43A2A!important;color:#fff!important;border:1px solid #A43A2A!important;font-weight:900!important}

      /* App group management buttons */
      .jj-native-group-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
      .jj-native-group-actions button{min-height:36px;padding:8px 10px;font-size:11px}

      /* Editor additions */
      .jj-editor-group-field{margin-top:8px}
      .jj-editor-group-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}
      .jj-v82-instock{
        margin-top:8px;padding:10px 11px;border:1px solid #D7DEE7;border-radius:9px;background:#F8FAFC
      }
      .jj-v82-instock-line{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .jj-v82-instock strong{color:#14234A;font-size:11px}
      .jj-v82-instock small{display:block;margin-top:4px;color:#687587;font-size:10px;line-height:1.35}
      #selectionEditInStock{
        min-width:104px!important;min-height:36px!important;padding:8px 11px!important;
        border:1px solid #C9D1DB!important;border-radius:8px!important;background:#fff!important;
        color:#14234A!important;font-size:11px!important;font-weight:900!important
      }
      #selectionEditInStock[aria-pressed="true"]{
        border-color:#9DC8AE!important;background:#EAF5EE!important;color:#246441!important
      }

      /* Dialog shared by group/bulk actions */
      .jj-v82-dialog{
        width:min(560px,calc(100% - 24px));max-height:88dvh;border:0;border-radius:15px;padding:0;
        color:#202633;box-shadow:0 24px 70px rgba(12,28,45,.34)
      }
      .jj-v82-dialog::backdrop{background:rgba(7,18,31,.58)}
      .jj-v82-head,.jj-v82-foot{
        position:sticky;z-index:3;display:flex;align-items:center;justify-content:space-between;
        gap:12px;padding:15px 17px;background:#fff
      }
      .jj-v82-head{top:0;border-bottom:1px solid #E2E6EC}
      .jj-v82-foot{bottom:0;border-top:1px solid #E2E6EC;justify-content:flex-end;flex-wrap:wrap}
      .jj-v82-head h3{margin:2px 0 0;color:#14234A}
      .jj-v82-head small{display:block;color:#B59A62;font-size:9px;font-weight:950;letter-spacing:.9px}
      .jj-v82-body{padding:17px;background:#F6F8FA}
      .jj-v82-body label{display:block;margin-bottom:12px;color:#526174;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.4px}
      .jj-v82-body select,.jj-v82-body input{
        width:100%;margin-top:5px;padding:10px;border:1px solid #C9D1DB;border-radius:8px;
        background:#fff;color:#202633;font-size:12px;text-transform:none;letter-spacing:0
      }
      .jj-v82-choice{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;margin:0 0 7px;
        padding:11px 12px;border:1px solid #D8DFE7;border-radius:9px;background:#fff;color:#14234A;text-align:left}
      .jj-v82-note{padding:10px 11px;border:1px solid #DCE2E9;border-radius:9px;background:#fff;color:#657184;font-size:11px;line-height:1.45}

      /* ACTUAL sidebar classes from current index */
      .operations-app .project-side-wrap.active .project-side-open,
      .operations-app .project-side-wrap.active .project-side-open b{
        color:#FFFFFF!important;
      }
      .operations-app .project-side-wrap.active .project-side-open small,
      .operations-app .project-side-wrap.active .project-side-status span{
        color:#B8C8D6!important;
      }
      .operations-app .project-side-wrap.active .project-side-status strong{
        color:#FFFFFF!important;
      }

      /* Homeowner current page */
      #jjHOGroupToolbarV82{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 16px}
      #jjHOGroupToggleV82{min-width:118px;font-weight:850}
      #items>.option-group{
        grid-column:1/-1!important;border:1px solid #D8DFE7!important;border-radius:13px!important;
        overflow:hidden!important;background:#F8FAFB!important;box-shadow:0 3px 10px rgba(20,35,74,.055)!important
      }
      #items>.option-group>summary{
        display:flex!important;align-items:center!important;gap:10px!important;min-height:56px!important;
        padding:12px 14px!important;border-left:5px solid #B59A62!important;
        background:linear-gradient(90deg,#F8F3E9 0,#FFFFFF 45%)!important;color:#14234A!important;
        list-style:none!important
      }
      #items>.option-group>summary::-webkit-details-marker{display:none}
      #items>.option-group>summary .jj-ho-title{min-width:0;flex:1;font-size:13px;font-weight:950;letter-spacing:.25px;text-transform:uppercase}
      #items>.option-group>summary .jj-ho-count{color:#657080;font-size:11px;font-weight:800;white-space:nowrap}
      #items>.option-group>summary .jj-ho-add{min-height:34px!important;padding:7px 10px!important;font-size:10px!important}
      #items>.option-group>.option-group-items{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))!important;gap:16px!important;padding:14px!important}
      #items article h2{font-size:17px!important;line-height:1.35!important}
      #items article .detail{font-size:13px!important;line-height:1.5!important}
      #items article .card-body{font-size:13px!important;line-height:1.48!important}
      #cardView,#listView{width:44px;min-width:44px;padding:10px!important;font-size:19px!important;line-height:1!important}

      @media(max-width:620px){
        #jjBulkBarV82{display:grid;grid-template-columns:1fr 1fr}
        #jjBulkBarV82 .count{grid-column:1/-1}
        #jjBulkBarV82 button{width:100%}
        #items>.option-group>summary{flex-wrap:wrap!important;align-items:flex-start!important}
        #items>.option-group>summary .jj-ho-title{white-space:normal}
      }
    `;
    document.head.appendChild(style);
  }

  /* ==================== GROUPS ==================== */
  function groups(){
    const project=p();
    if(!project)return [];
    if(!Array.isArray(project.selectionGroups))project.selectionGroups=[];
    (project.selections||[]).forEach(item=>{
      if(!item?.optionGroupId)return;
      if(!project.selectionGroups.some(g=>String(g.id)===String(item.optionGroupId))){
        project.selectionGroups.push({
          id:item.optionGroupId,
          name:item.optionGroupTitle||item.title||'Selection Group'
        });
      }
    });
    return project.selectionGroups;
  }

  function groupId(){
    return 'group-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
  }

  function createGroup(name){
    const project=p();
    if(!project)return null;
    name=String(name||'').trim();
    if(!name)return null;
    const list=groups();
    let existing=list.find(g=>String(g.name||'').trim().toLowerCase()===name.toLowerCase());
    if(existing)return existing;
    const group={id:groupId(),name};
    list.push(group);
    return group;
  }

  function openCreateGroup(assignIndex=null){
    if(!p())return;
    openDialog('Add Group',
      '<label>Group name<input id="jjNewGroupName" maxlength="120" placeholder="For example: Shower fixtures" autocomplete="off"></label><p id="jjNewGroupError" role="alert"></p>',
      dialog=>{
        const input=dialog.querySelector('#jjNewGroupName'),name=input.value.trim();
        if(!name){dialog.querySelector('#jjNewGroupError').textContent='Enter a group name.';input.focus();return false;}
        const group=createGroup(name),project=p();if(!group)return false;
        project.selectionActiveGroup=group.id;
        if(assignIndex!==null && project?.selections?.[assignIndex]){
          const item=project.selections[assignIndex];item.optionGroupId=group.id;item.optionGroupTitle=group.name;item.optionLabel=item.optionLabel||'Option';
        }
        save('Selection group created');
      },'Create Group');
    const dialog=document.getElementById('jjV82Dialog'),input=dialog?.querySelector('#jjNewGroupName');
    if(dialog)dialog.querySelector('.jj-v82-head small').textContent='SELECTION GROUP';
    if(input){input.focus();input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();dialog.querySelector('#jjV82Apply').click()}}}
  }

  function deleteGroup(id){
    const project=p();
    if(!project)return;
    const list=groups();
    const group=list.find(g=>String(g.id)===String(id));
    if(!group)return;
    const count=(project.selections||[]).filter(i=>String(i.optionGroupId||'')===String(id)).length;
    if(!confirm(`Delete group "${group.name}"? ${count} selection${count===1?'':'s'} will stay and become standalone.`))return;
    project.selectionGroups=list.filter(g=>String(g.id)!==String(id));
    (project.selections||[]).forEach(item=>{
      if(String(item.optionGroupId||'')===String(id)){
        delete item.optionGroupId;
        delete item.optionGroupTitle;
        delete item.optionLabel;
      }
    });
    save('Group deleted — selections kept');
  }

  function reorderGroup(id,targetIndex){
    const project=p();
    if(!project)return false;
    const list=groups();
    const from=list.findIndex(g=>String(g.id)===String(id));
    if(from<0)return false;
    targetIndex=Math.max(0,Math.min(list.length-1,Number(targetIndex)));
    if(from===targetIndex)return false;
    const [moved]=list.splice(from,1);
    list.splice(targetIndex,0,moved);
    project.selectionGroups=list;
    try{window.saveState?.(false)}catch{}
    try{window.renderSelections?.()}catch{}
    return true;
  }

  function manageGroups(){
    const project=p();
    if(!project)return;
    document.getElementById('jjV82Dialog')?.remove();
    const list=groups();
    const dialog=document.createElement('dialog');
    dialog.id='jjV82Dialog';
    dialog.className='jj-v82-dialog';
    dialog.innerHTML=`
      <div class="jj-v82-head"><div><small>SELECTIONS</small><h3>Manage Groups</h3></div><button class="btn btn-light" data-close>×</button></div>
      <div class="jj-v82-body">
        ${list.length?`<div class="jj-v82-note" style="margin-bottom:10px">Drag groups into the order you want, or use the ↑ ↓ buttons. This order is used in Selections and Customer View.</div>`:''}
        <div id="jjGroupOrderList">
        ${list.length?list.map((g,index)=>{
          const count=(project.selections||[]).filter(i=>String(i.optionGroupId||'')===String(g.id)).length;
          return `<div class="jj-v82-choice jj-group-order-row" draggable="true" data-group-row="${esc(g.id)}" style="cursor:grab">
            <span style="display:flex;align-items:center;gap:10px;min-width:0"><span title="Drag to reorder" style="font-size:18px;color:#8A95A5;cursor:grab">≡</span><span style="min-width:0"><b>${esc(g.name)}</b><br><small>${count} selection${count===1?'':'s'}</small></span></span>
            <span style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
              <button class="btn btn-light" title="Move up" data-up="${esc(g.id)}" ${index===0?'disabled':''}>↑</button>
              <button class="btn btn-light" title="Move down" data-down="${esc(g.id)}" ${index===list.length-1?'disabled':''}>↓</button>
              <button class="btn btn-light" data-rename="${esc(g.id)}">Rename</button>
              <button class="btn btn-danger" data-delete="${esc(g.id)}">Delete</button>
            </span></div>`;
        }).join(''):'<div class="jj-v82-note">No groups yet.</div>'}
        </div>
      </div>
      <div class="jj-v82-foot"><button class="btn btn-light" id="jjV82CreateGroup">+ Create Group</button><button class="btn btn-gold" data-close>Done</button></div>`;
    document.body.appendChild(dialog);
    const close=()=>dialog.close();
    const reopen=()=>{dialog.close();setTimeout(manageGroups,30)};
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',close));
    dialog.querySelector('#jjV82CreateGroup').addEventListener('click',()=>{dialog.close();setTimeout(()=>openCreateGroup(null),30)});
    dialog.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.delete;dialog.close();setTimeout(()=>deleteGroup(id),30)}));
    dialog.querySelectorAll('[data-up]').forEach(btn=>btn.addEventListener('click',()=>{
      const index=groups().findIndex(g=>String(g.id)===String(btn.dataset.up));
      if(index>0&&reorderGroup(btn.dataset.up,index-1))reopen();
    }));
    dialog.querySelectorAll('[data-down]').forEach(btn=>btn.addEventListener('click',()=>{
      const current=groups();const index=current.findIndex(g=>String(g.id)===String(btn.dataset.down));
      if(index>=0&&index<current.length-1&&reorderGroup(btn.dataset.down,index+1))reopen();
    }));
    dialog.querySelectorAll('[data-rename]').forEach(btn=>btn.addEventListener('click',()=>{
      const g=list.find(x=>String(x.id)===String(btn.dataset.rename));
      if(!g)return;
      const name=prompt('Rename selection group',g.name);
      if(name===null||!name.trim())return;
      g.name=name.trim();
      (project.selections||[]).forEach(item=>{if(String(item.optionGroupId||'')===String(g.id))item.optionGroupTitle=g.name});
      dialog.close();
      save('Group renamed');
    }));

    let draggedId='';
    dialog.querySelectorAll('[data-group-row]').forEach(row=>{
      row.addEventListener('dragstart',e=>{
        draggedId=row.dataset.groupRow||'';
        row.style.opacity='.45';
        try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedId)}catch{}
      });
      row.addEventListener('dragend',()=>{row.style.opacity='';draggedId=''});
      row.addEventListener('dragover',e=>{
        e.preventDefault();
        try{e.dataTransfer.dropEffect='move'}catch{}
      });
      row.addEventListener('drop',e=>{
        e.preventDefault();
        const source=draggedId||(()=>{try{return e.dataTransfer.getData('text/plain')}catch{return ''}})();
        const target=row.dataset.groupRow||'';
        if(!source||!target||source===target)return;
        const current=groups();
        const from=current.findIndex(g=>String(g.id)===String(source));
        let to=current.findIndex(g=>String(g.id)===String(target));
        if(from<0||to<0)return;
        const rect=row.getBoundingClientRect();
        if(e.clientY>rect.top+rect.height/2)to++;
        if(from<to)to--;
        if(reorderGroup(source,to))reopen();
      });
    });

    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  function addOption(groupIdValue){
    const project=p();
    if(!project)return;
    if(groupIdValue==='ungrouped'){
      editContext.pendingGroupId='';
      window.openSelectionEditor?.(null,'');
      return;
    }
    const group=groups().find(g=>String(g.id)===String(groupIdValue));
    if(!group)return;
    editContext.pendingGroupId=group.id;
    window.openSelectionEditor?.(null,'');
  }

  /* ==================== EDITOR ==================== */
  function editorGroupHTML(selected){
    const list=groups();
    return `<option value="">No group / Standalone</option>${list.map(g=>
      `<option value="${esc(g.id)}" ${String(g.id)===String(selected||'')?'selected':''}>${esc(g.name)}</option>`
    ).join('')}`;
  }

  function enhanceEditor(){
    const project=p();
    const lead=document.getElementById('selectionLeadTime');
    const status=document.getElementById('selectionEditStatus');
    if(!lead||!status)return;

    // Recommended status, current native save accepts whatever select contains.
    if(![...status.options].some(o=>o.value==='Recommended')){
      const option=document.createElement('option');
      option.value='Recommended'; option.textContent='Recommended';
      const selected=[...status.options].find(o=>o.value==='Selected');
      if(selected)selected.insertAdjacentElement('beforebegin',option); else status.appendChild(option);
    }
    const desiredStatus=editContext.original?.status;
    if(desiredStatus && [...status.options].some(o=>o.value===desiredStatus))status.value=desiredStatus;

    // Month(s) option.
    const unit=document.getElementById('selectionEditLeadUnit');
    if(unit && ![...unit.options].some(o=>o.value==='Month(s)')){
      const opt=document.createElement('option');opt.value='Month(s)';opt.textContent='Month(s)';unit.appendChild(opt);
      if(editContext.original?.leadTimeUnit==='Month(s)')unit.value='Month(s)';
    }

    // In Stock is real and persistent via save wrapper below.
    let stock=document.getElementById('selectionEditInStock');
    if(!stock){
      stock=document.createElement('button');
      stock.type='button';stock.id='selectionEditInStock';
      stock.addEventListener('click',e=>{
        e.preventDefault();
        const next=stock.getAttribute('aria-pressed')!=='true';
        stock.setAttribute('aria-pressed',String(next));
        stock.textContent=next?'In Stock ✓':'Mark In Stock';
      });
    }
    const stockValue=!!editContext.original?.inStock;
    stock.setAttribute('aria-pressed',String(stockValue));
    stock.textContent=stockValue?'In Stock ✓':'Mark In Stock';

    let stockRow=document.querySelector('.jj-v82-instock');
    if(!stockRow){
      stockRow=document.createElement('div');
      stockRow.className='jj-v82-instock';
      stockRow.innerHTML='<div class="jj-v82-instock-line"><strong>Availability</strong></div><small>Mark this when the product is available now. Cards show In Stock instead of lead time.</small>';
      lead.insertAdjacentElement('afterend',stockRow);
    }
    stockRow.querySelector('.jj-v82-instock-line').appendChild(stock);

    // Group dropdown inside Edit Selection.
    let field=document.querySelector('.jj-editor-group-field');
    if(!field){
      field=document.createElement('div');
      field.className='selection-field jj-editor-group-field';
      field.innerHTML=`<label>Selection Group</label><select id="jjEditGroupV82"></select>
        <div class="jj-editor-group-actions">
          <button type="button" class="btn btn-light" id="jjEditCreateGroupV82">+ Create Group</button>
          <button type="button" class="btn btn-danger" id="jjEditDeleteGroupV82">Delete Group</button>
        </div>`;
      const statusField=status.closest('.selection-field');
      statusField?.insertAdjacentElement('afterend',field);
    }
    const groupSelect=field.querySelector('#jjEditGroupV82');
    const current=editContext.pendingGroupId || editContext.original?.optionGroupId || '';
    groupSelect.innerHTML=editorGroupHTML(current);
    groupSelect.value=String(current||'');

    field.querySelector('#jjEditCreateGroupV82').onclick=()=>{
      const name=prompt('New selection group name');
      if(name===null||!name.trim())return;
      const g=createGroup(name);
      groupSelect.innerHTML=editorGroupHTML(g.id);
      groupSelect.value=g.id;
      try{window.saveState?.(false)}catch{}
    };
    field.querySelector('#jjEditDeleteGroupV82').onclick=()=>{
      const id=groupSelect.value;
      if(!id)return;
      deleteGroup(id);
      groupSelect.innerHTML=editorGroupHTML('');
      groupSelect.value='';
    };
  }

  function installEditorWrappers(){
    if(typeof window.openSelectionEditor==='function' && !window.openSelectionEditor.__v82){
      const original=window.openSelectionEditor;
      const wrapped=function(index=null,prefillUrl=''){
        const project=p();
        editContext.index=Number.isInteger(index)?index:null;
        editContext.original=editContext.index===null?null:JSON.parse(JSON.stringify(project?.selections?.[editContext.index]||null));
        if(editContext.index!==null)editContext.pendingGroupId='';
        else if(prefillUrl)editContext.pendingGroupId=project?.selectionActiveGroup||'';
        const result=original.apply(this,arguments);
        setTimeout(enhanceEditor,0);
        return result;
      };
      wrapped.__v82=true;
      window.openSelectionEditor=wrapped;
    }

    if(typeof window.saveSelectionEditor==='function' && !window.saveSelectionEditor.__v82){
      const original=window.saveSelectionEditor;
      const wrapped=function(){
        const project=p();
        const before=editContext.original?JSON.parse(JSON.stringify(editContext.original)):null;
        const index=editContext.index;
        const groupIdValue=document.getElementById('jjEditGroupV82')?.value||'';
        const inStock=document.getElementById('selectionEditInStock')?.getAttribute('aria-pressed')==='true';

        const preserved=before?{
          additionalLinks:before.additionalLinks,
          identifiers:before.identifiers,
          budget:before.budget,
          homeownerSelected:before.homeownerSelected,
          homeownerSelectedAt:before.homeownerSelectedAt
        }:{};

        const previousItems=project?.selections||[];
        const previousCount=previousItems.length;
        const previousItem=index!==null?previousItems[index]:null;
        const result=original.apply(this,arguments);
        const savedItems=project?.selections||[];
        // A rejected native save must leave the editor and other selections untouched.
        const saved=index!==null?savedItems[index]!==previousItem:savedItems.length>previousCount;
        if(!saved)return result;

        // Native save replaces the object; restore/attach fields native editor does not know.
        const targetProject=p();
        let item=null;
        if(index!==null) item=targetProject?.selections?.[index];
        else item=targetProject?.selections?.[targetProject.selections.length-1];

        if(item){
          item.inStock=inStock;
          Object.entries(preserved).forEach(([key,value])=>{
            if(value!==undefined)item[key]=value;
          });

          if(groupIdValue){
            const g=groups().find(x=>String(x.id)===String(groupIdValue));
            if(g){
              item.optionGroupId=g.id;
              item.optionGroupTitle=g.name;
              item.optionLabel=item.optionLabel||'Option';
            }
          }else{
            delete item.optionGroupId;
            delete item.optionGroupTitle;
            delete item.optionLabel;
          }
          try{window.saveState?.(false)}catch{}
          try{window.renderSelections?.()}catch{}
        }

        editContext={index:null,original:null,pendingGroupId:''};
        return result;
      };
      wrapped.__v82=true;
      window.saveSelectionEditor=wrapped;
    }
  }

  /* ==================== BULK SELECTION ==================== */
  function bulkSet(){
    const project=p();
    if(!project)return new Set();
    const key=String(project.id);
    if(!bulkByProject.has(key))bulkByProject.set(key,new Set());
    return bulkByProject.get(key);
  }

  function selectedItems(){
    const project=p(),set=bulkSet();
    return (project?.selections||[]).filter(item=>set.has(String(item.id)));
  }

  function installCardWrapper(){
    if(typeof window.selectionCard!=='function'||window.selectionCard.__v82)return;
    const original=window.selectionCard;
    const wrapped=function(item,index){
      let html=original.apply(this,arguments);
      const checked=bulkSet().has(String(item.id));
      const select=`<label class="jj-bulk-card-select" title="Select for bulk edit">
        <input type="checkbox" aria-label="Select ${esc(item.title||'selection')} for bulk edit" data-jj-bulk-id="${esc(item.id)}" ${checked?'checked':''}>
        <span>${checked?'Selected':'Select'}</span>
      </label>`;
      html=html.replace('<div class="selection-photo">',`<div class="selection-photo">${select}`);
      return html;
    };
    wrapped.__v82=true;
    window.selectionCard=wrapped;
  }

  function openDialog(title,body,onApply,label='Apply'){
    const sourceProjectId=String(p()?.id??'');
    document.getElementById('jjV82Dialog')?.remove();
    const dialog=document.createElement('dialog');
    dialog.id='jjV82Dialog';dialog.className='jj-v82-dialog';
    dialog.innerHTML=`<div class="jj-v82-head"><div><small>BULK EDIT</small><h3>${esc(title)}</h3></div><button class="btn btn-light" data-close>×</button></div>
      <div class="jj-v82-body">${body}</div>
      <div class="jj-v82-foot"><button class="btn btn-light" data-close>Cancel</button><button class="btn btn-gold" id="jjV82Apply">${esc(label)}</button></div>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>dialog.close());
    dialog.querySelector('#jjV82Apply').onclick=()=>{if(String(p()?.id??'')!==sourceProjectId){dialog.close();return}if(onApply(dialog)!==false)dialog.close()};
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  function bulkStatus(){
    const items=selectedItems(); if(!items.length)return;
    openDialog(`Change Status · ${items.length} selected`,
      `<label>Status<select id="jjV82Status"><option>Pending</option><option>Recommended</option><option>Selected</option><option>Ordered</option><option>Received</option></select></label>
       <div class="jj-v82-note">Only the checked selections will change.</div>`,
      dialog=>{
        const value=dialog.querySelector('#jjV82Status').value;
        items.forEach(item=>{
          item.status=value;
          if(value!=='Selected'){item.homeownerSelected=false;item.homeownerSelectedAt=null}
        });
        bulkSet().clear();save(`${items.length} selection${items.length===1?'':'s'} changed to ${value}`);
      });
  }

  function bulkGroup(){
    const project=p(),items=selectedItems();if(!project||!items.length)return;
    openDialog(`Change Group · ${items.length} selected`,
      `<label>Group<select id="jjV82Group"><option value="">No group / Standalone</option>${groups().map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}<option value="__new__">＋ Create New Group…</option></select></label>
       <div id="jjV82NewGroup" hidden><label>New group name<input id="jjV82NewGroupName" placeholder="Shower Fixtures…"></label></div>
       <div class="jj-v82-note">This moves the checked selections without duplicating them.</div>`,
      dialog=>{
        let id=dialog.querySelector('#jjV82Group').value,g=null;
        if(id==='__new__'){
          const name=dialog.querySelector('#jjV82NewGroupName').value.trim();
          if(!name)return false;
          g=createGroup(name);id=g.id;
        }else if(id)g=groups().find(x=>String(x.id)===String(id));
        items.forEach(item=>{
          if(!id){delete item.optionGroupId;delete item.optionGroupTitle;delete item.optionLabel}
          else{item.optionGroupId=g.id;item.optionGroupTitle=g.name;item.optionLabel=item.optionLabel||'Option'}
        });
        bulkSet().clear();save(id?`${items.length} moved to ${g.name}`:`${items.length} removed from groups`);
      });
    setTimeout(()=>{
      const d=document.getElementById('jjV82Dialog'),s=d?.querySelector('#jjV82Group'),w=d?.querySelector('#jjV82NewGroup');
      if(s&&w)s.onchange=()=>{w.hidden=s.value!=='__new__'};
    },0);
  }

  function bulkLead(){
    const items=selectedItems();if(!items.length)return;
    openDialog(`Change Lead Time · ${items.length} selected`,
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label>Lead time<input id="jjV82LeadValue" type="number" min="1" value="1"></label>
        <label>Unit<select id="jjV82LeadUnit"><option>Day(s)</option><option>Week(s)</option><option>Month(s)</option></select></label>
       </div>
       <label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0"><input id="jjV82LeadStock" type="checkbox" style="width:auto;margin:0"> Mark In Stock</label>`,
      dialog=>{
        const value=Math.max(1,Number(dialog.querySelector('#jjV82LeadValue').value||1));
        const unit=dialog.querySelector('#jjV82LeadUnit').value;
        const stock=dialog.querySelector('#jjV82LeadStock').checked;
        items.forEach(item=>{item.leadTimeValue=value;item.leadTimeUnit=unit;item.inStock=stock});
        bulkSet().clear();save(`${items.length} lead time${items.length===1?'':'s'} updated`);
      });
  }

  function bulkApprove(){
    const items=selectedItems();if(!items.length)return;
    openDialog(`Approve · ${items.length} selected`,
      '<p>Mark the checked selections as Selected. Ordered and Received items keep their current status.</p>',
      ()=>{
        items.forEach(item=>{if(!['Ordered','Received'].includes(item.status))item.status='Selected'});
        bulkSet().clear();bulkDeleteArmed=false;save(`${items.length} selections approved`);
      },'Approve selections');
  }

  let bulkRenderedProjectId=null;
  function renderBulkBar(){
    const projectId=String(p()?.id??'');
    if(projectId!==bulkRenderedProjectId){bulkDeleteArmed=false;bulkRenderedProjectId=projectId}
    const root=document.getElementById('selections');
    if(!root)return;
    const toolbar=root.querySelector('.selection-toolbar');
    if(!toolbar)return;
    let bar=root.querySelector('#jjBulkBarV82');
    if(!bar){
      bar=document.createElement('div');bar.id='jjBulkBarV82';
      toolbar.insertAdjacentElement('afterend',bar);
    }
    // Limit bulk actions to this project's current category, including collapsed groups.
    const visibleIds=new Set([...root.querySelectorAll('[data-jj-bulk-id]')].map(n=>n.dataset.jjBulkId));
    for(const id of bulkSet())if(!visibleIds.has(id)){bulkSet().delete(id);bulkDeleteArmed=false}
    const count=selectedItems().length;
    bar.innerHTML=`<span class="count">${count} of ${visibleIds.size} selected</span>
      <button class="btn btn-light" data-action="all" ${visibleIds.size?'':'disabled'}>Select All</button>
      <button class="btn btn-light" data-action="clear" ${count?'':'disabled'}>Clear</button>
      <button class="btn btn-light" data-action="approve" ${count?'':'disabled'}>Approve</button>
      <button class="btn btn-light" data-action="status" ${count?'':'disabled'}>Status</button>
      <button class="btn btn-light" data-action="group" ${count?'':'disabled'}>Group</button>
      <button class="btn btn-light" data-action="lead" ${count?'':'disabled'}>Lead Time</button>
      ${bulkDeleteArmed&&count
        ? `<button class="btn confirm-delete" data-action="confirm-delete">Confirm Delete (${count})</button><button class="btn btn-light" data-action="cancel-delete">Cancel</button>`
        : `<button class="btn delete" data-action="delete" ${count?'':'disabled'}>Delete</button>`}`;
    bar.onclick=e=>{
      const action=e.target.closest('button')?.dataset.action;if(!action)return;
      if(action==='all'){bulkSet().clear();visibleIds.forEach(id=>bulkSet().add(id));bulkDeleteArmed=false;window.renderSelections?.()}
      if(action==='approve')bulkApprove();
      if(action==='clear'){bulkSet().clear();bulkDeleteArmed=false;window.renderSelections?.()}
      if(action==='status')bulkStatus();
      if(action==='group')bulkGroup();
      if(action==='lead')bulkLead();
      if(action==='delete'){bulkDeleteArmed=true;renderBulkBar()}
      if(action==='cancel-delete'){bulkDeleteArmed=false;renderBulkBar()}
      if(action==='confirm-delete'){
        if(!bulkDeleteArmed||String(p()?.id??'')!==projectId)return;
        const project=p(),ids=new Set(bulkSet()),count=ids.size;
        project.selections=(project.selections||[]).filter(item=>!ids.has(String(item.id)));
        bulkSet().clear();bulkDeleteArmed=false;save(`${count} selection${count===1?'':'s'} deleted`);
      }
    };
  }

  function renderGroupActions(){
    const root=document.getElementById('selections');
    const host=root?.querySelector('.selection-group-controls');
    if(!host)return;
    if(host.querySelector('.jj-native-group-actions'))return;
    const actions=document.createElement('span');
    actions.className='jj-native-group-actions';
    actions.innerHTML='<button class="btn btn-light" type="button" data-create>+ Group</button><button class="btn btn-light" type="button" data-manage>Manage</button>';
    host.appendChild(actions);
    actions.querySelector('[data-create]').onclick=()=>openCreateGroup(null);
    actions.querySelector('[data-manage]').onclick=manageGroups;
  }

  function postRenderApp(){
    installCardWrapper();
    renderBulkBar();
    renderGroupActions();
  }

  function installRenderWrapper(){
    if(typeof window.renderSelections==='function' && !window.renderSelections.__v82){
      const original=window.renderSelections;
      const wrapped=function(){
        installCardWrapper();
        const result=original.apply(this,arguments);
        setTimeout(postRenderApp,0);
        return result;
      };
      wrapped.__v82=true;
      window.renderSelections=wrapped;
    }
  }

  /* ==================== HOMEOWNER ==================== */
  function hoItems(){
    try{return typeof items!=='undefined'&&Array.isArray(items)?items:[]}catch{return []}
  }
  function hoGroups(){return [...document.querySelectorAll('#items details.option-group')]}

  function updateHOToggle(){
    const btn=document.getElementById('jjHOGroupToggleV82');if(!btn)return;
    const list=hoGroups();
    btn.disabled=!list.length;
    btn.textContent=list.length&&list.every(d=>d.open)?'Show Groups':'View All';
  }

  function stabilizeHO(){
    const root=document.getElementById('items');
    const view=document.querySelector('.actions[aria-label="Selections view"]');
    if(!root||!view||enhancingHO)return false;
    enhancingHO=true;
    try{
      // Remove every old injected toolbar from legacy builds.
      document.querySelectorAll('#jjHOGroupToolbar,#jjHOViewAll,#jjHOShowGroups,#jjHOGroupToggle').forEach(node=>node.remove());

      let toolbar=document.getElementById('jjHOGroupToolbarV82');
      if(!toolbar){
        toolbar=document.createElement('div');toolbar.id='jjHOGroupToolbarV82';
        toolbar.innerHTML='<button type="button" id="jjHOGroupToggleV82" class="secondary">View All</button>';
        view.insertAdjacentElement('afterend',toolbar);
        toolbar.querySelector('button').onclick=e=>{
          e.preventDefault();
          const list=hoGroups();if(!list.length)return;
          const open=!list.every(d=>d.open);
          list.forEach(d=>d.open=open);
          updateHOToggle();
        };
      }

      // Symbols match app.
      const card=document.getElementById('cardView'),list=document.getElementById('listView');
      if(card){card.textContent='▦';card.title='Card view';card.setAttribute('aria-label','Card view')}
      if(list){list.textContent='☰';list.title='List view';list.setAttribute('aria-label','List view')}

      const data=hoItems();

      // Single-item named groups: native homeowner renderer makes them standalone.
      [...root.querySelectorAll(':scope > article')].forEach(article=>{
        const optionBtn=article.querySelector('[data-option]');
        const id=optionBtn?.dataset.option;
        const item=data.find(row=>String(row.id)===String(id));
        if(!item?.optionGroupId)return;
        const details=document.createElement('details');
        details.className='option-group';details.dataset.jjGroup=String(item.optionGroupId);
        details.innerHTML=`<summary></summary><div class="option-group-items"></div>`;
        article.replaceWith(details);details.querySelector('.option-group-items').appendChild(article);
      });

      // Improve every group header and move Add Option to the header.
      hoGroups().forEach(details=>{
        const summary=details.querySelector(':scope > summary');
        const firstButton=details.querySelector('.option-group-items [data-option]');
        if(!summary||!firstButton)return;
        const firstId=firstButton.dataset.option;
        const item=data.find(row=>String(row.id)===String(firstId));
        const sameGroup=item?.optionGroupId
          ? data.filter(row=>String(row.optionGroupId||'')===String(item.optionGroupId)).length
          : details.querySelectorAll('.option-group-items article').length;
        const title=item?.optionGroupTitle||summary.textContent.replace(/\d+\s+options?.*$/i,'').trim()||item?.title||'Selection Group';

        // Remove per-card Another option controls.
        details.querySelectorAll('.option-group-items [data-option]').forEach(btn=>btn.remove());

        summary.classList.add('jj-ho-summary');
        summary.innerHTML=`<span class="jj-ho-title">${esc(title)}</span><span class="jj-ho-count">${sameGroup} option${sameGroup===1?'':'s'} · tap to compare</span><button type="button" class="secondary jj-ho-add">+ Add Option</button>`;
        summary.querySelector('.jj-ho-add').onclick=e=>{
          e.preventDefault();e.stopPropagation();
          try{addAnotherOption(firstId)}catch{}
        };
        if(details.dataset.jjV82Toggle!=='1'){
          details.dataset.jjV82Toggle='1';
          details.addEventListener('toggle',()=>setTimeout(updateHOToggle,0));
        }
      });

      // Standalone items should not keep per-card Another Option.
      root.querySelectorAll(':scope > article [data-option]').forEach(btn=>btn.remove());
      updateHOToggle();
    }finally{
      enhancingHO=false;
    }
    return true;
  }

  function installHO(){
    if(hoInstalled)return true;
    const root=document.getElementById('items');
    if(!root)return false;
    hoInstalled=true;
    stabilizeHO();
    hoObserver=new MutationObserver(()=>setTimeout(stabilizeHO,0));
    hoObserver.observe(root,{childList:true,subtree:false});
    return true;
  }

  /* ==================== BOOT ==================== */
  function installApp(){
    if(appInstalled)return;
    if(typeof window.renderSelections!=='function'||typeof window.selectionCard!=='function')return;
    appInstalled=true;

    installCardWrapper();
    installEditorWrappers();
    installRenderWrapper();

    // API expected by the CURRENT native index.html group header.
    window.JJSelectionGroups={
      ...(window.JJSelectionGroups||{}),
      addOption,
      create:()=>openCreateGroup(null),
      manage:manageGroups,
      delete:deleteGroup
    };

    document.addEventListener('change',e=>{
      const box=e.target?.closest?.('#selections [data-jj-bulk-id]');
      if(!box)return;
      const id=String(box.dataset.jjBulkId);
      if(box.checked)bulkSet().add(id);else bulkSet().delete(id);
      bulkDeleteArmed=false;
      const label=box.closest('.jj-bulk-card-select')?.querySelector('span');
      if(label)label.textContent=box.checked?'Selected':'Select';
      renderBulkBar();
    });

    // IMPORTANT PERFORMANCE FIX:
    // Do NOT observe the entire Selections subtree. renderBulkBar() changes the
    // subtree itself, which previously retriggered the observer and created a
    // render -> mutation -> render loop. That loop is what caused Chrome's
    // "Page Unresponsive" warning and delayed clicks.
    // renderSelections() is already wrapped by installRenderWrapper(), so every
    // legitimate Selections render receives its bulk bar/group controls there.
    if(appObserver?.disconnect){
      try{appObserver.disconnect()}catch{}
      appObserver=null;
    }

    // Re-render once so the wrapped selectionCard produces real checkboxes.
    try{window.renderSelections()}catch{}
  }

  function boot(){
    injectStyles();
    // homeowner.html has #items; index.html has renderSelections.
    if(installHO())return;
    installApp();
  }

  if(document.readyState==='complete')setTimeout(boot,0);
  else window.addEventListener('load',()=>setTimeout(boot,0),{once:true});
})();

/* -------------------------------------------------------------------------
   J&J Project ID / Selection Switching Fix v82.1
   Some jobs use string/UUID ids while older navigation coerced ids with Number().
   Number('uuid') becomes NaN, and selectedProject() then fell back to project[0].
   That made Selections appear to work only for the first job.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjProjectIdFixV821) return;
  window.__jjProjectIdFixV821=true;

  function actualProject(id){
    try{return state?.projects?.find(project=>String(project.id)===String(id))||null}catch{return null}
  }

  // Make selectedProject tolerant of number/string id differences everywhere.
  window.selectedProject=function(){
    try{
      return state.projects.find(project=>String(project.id)===String(state.selectedProjectId)) || state.projects[0];
    }catch{return null}
  };

  // Dashboard / project links may pass the id as a string even when the stored id is numeric.
  if(typeof window.openProject==='function' && !window.openProject.__jjIdFixV821){
    const originalOpenProject=window.openProject;
    const wrapped=function(id){
      const project=actualProject(id);
      return originalOpenProject.call(this,project?project.id:id);
    };
    wrapped.__jjIdFixV821=true;
    window.openProject=wrapped;
  }

  // Sidebar behavior needs a direct fix because the native function calls Number(id).
  // Preserve the existing active page, but always keep the project's ORIGINAL id type.
  if(typeof window.openProjectFromSidebar==='function' && !window.openProjectFromSidebar.__jjIdFixV821){
    const originalSidebar=window.openProjectFromSidebar;
    const wrapped=function(id){
      const project=actualProject(id);
      if(!project)return originalSidebar.call(this,id);

      try{ if(typeof isMobileLayout==='function' && isMobileLayout()) closeMobileSidebar?.(); }catch{}
      try{ if(typeof isTabletLayout==='function' && isTabletLayout()) closeJobsDrawer?.(); }catch{}

      const currentPage=document.querySelector('.page.active')?.id;
      state.selectedProjectId=project.id;

      if(currentPage==='selections'){
        try{saveState(false)}catch{}
        try{renderAll()}catch{}
        try{openSelections()}catch{try{renderSelections();go('selections')}catch{}}
        return;
      }

      if(currentPage==='preconstruction'){
        try{openPreconSection=0;openPreconAccordion=null;preconView='overview'}catch{}
        try{ensurePreconData()}catch{}
        try{saveState(false)}catch{}
        try{renderAll()}catch{}
        try{renderPreconstruction()}catch{}
        try{go('preconstruction')}catch{}
        return;
      }

      if(currentPage==='paybyline' || currentPage==='estimates'){
        try{
          const keepView=poHubView==='estimate'?'estimate':'splits';
          poHubView=keepView;
          openPOIds?.clear?.();
          selectedPOIds?.clear?.();
          deletePOIndex=null;
          bulkDeletePending=false;
          saveState(false);
          renderAll();
          openPOHub(keepView);
          return;
        }catch{}
      }

      // For every other page, preserve the selected job id and open the project normally.
      try{saveState(false)}catch{}
      try{return window.openProject(project.id)}catch{return originalSidebar.call(this,project.id)}
    };
    wrapped.__jjIdFixV821=true;
    window.openProjectFromSidebar=wrapped;
  }
})();

/* -------------------------------------------------------------------------
   J&J Project Selection Core v82.5
   One small compatibility layer only. No timers, observers, or rerender loops.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjProjectSelectionCoreV825) return;
  window.__jjProjectSelectionCoreV825=true;

  function findProject(id){
    try{
      return state?.projects?.find(project=>String(project.id)===String(id)) || null;
    }catch{return null}
  }

  // Native selectedProject used strict equality. Cloud/local restores can leave
  // the same id represented as a number on one device and a string on another.
  window.selectedProject=function(){
    try{
      return findProject(state.selectedProjectId) || state.projects?.[0] || null;
    }catch{return null}
  };

  // Keep direct project links tolerant of either numeric or string ids.
  const wrapIdHelper=name=>{
    const original=window[name];
    if(typeof original!=='function' || original.__jjV825) return;
    const wrapped=function(id,...rest){
      const project=findProject(id);
      if(project) state.selectedProjectId=project.id;
      return original.call(this,project?project.id:id,...rest);
    };
    wrapped.__jjV825=true;
    window[name]=wrapped;
  };

  // These helpers are used outside the left sidebar too.
  wrapIdHelper('openProject');
  wrapIdHelper('openPreconstructionForProject');
  wrapIdHelper('setPreconProject');
  wrapIdHelper('openProjectPOHub');

  window.JJProjectSelectionV825={findProject};
})();

/* -------------------------------------------------------------------------
   J&J Sidebar Project Switcher v82.5
   Direct, lightweight project switching with no MutationObserver, no interval,
   no renderAll(), and no cloud save on every click.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjSidebarProjectSwitcherV825) return;
  window.__jjSidebarProjectSwitcherV825=true;

  const normalize=value=>String(value??'').replace(/\s+/g,' ').trim().toLowerCase();

  function projectFromButton(button){
    try{
      const projects=Array.isArray(state?.projects)?state.projects:[];
      if(!projects.length)return null;

      // Name is the most reliable identifier in the currently-rendered sidebar.
      const name=normalize(button.querySelector('b')?.textContent||'');
      if(name){
        const exact=projects.find(project=>normalize(project.name)===name);
        if(exact)return exact;
      }

      // Fallback to the button's position among project cards.
      const wrap=button.closest('.project-side-wrap');
      const wraps=[...document.querySelectorAll('.project-side-wrap')];
      const index=wraps.indexOf(wrap);
      return index>=0?projects[index]||null:null;
    }catch{return null}
  }

  function persistSelectionLocally(){
    // The active UI job does not need a full cloud write. Keep switching fast.
    try{
      if(typeof persistStateLocally==='function'){
        persistStateLocally();
        return;
      }
    }catch{}
    try{localStorage.setItem('jj_full_proto',JSON.stringify(state))}catch{}
  }

  function updateSidebarActive(project){
    try{
      document.querySelectorAll('.project-side-wrap').forEach(wrap=>{
        const button=wrap.querySelector('.project-side-open');
        const name=normalize(button?.querySelector('b')?.textContent||'');
        wrap.classList.toggle('active',name===normalize(project?.name));
      });
    }catch{}
  }

  function renderCurrentPage(project){
    const page=document.querySelector('.page.active')?.id||'';

    if(page==='selections'){
      try{renderSelections()}catch(err){console.error('Selections switch failed',err)}
      try{buildNav()}catch{}
      return;
    }

    if(page==='preconstruction'){
      try{openPreconSection=0;openPreconAccordion=null;preconView='overview'}catch{}
      try{ensurePreconData()}catch{}
      try{renderPreconstruction()}catch(err){console.error('Preconstruction switch failed',err)}
      try{buildNav()}catch{}
      return;
    }

    if(page==='paybyline' || page==='estimates'){
      try{
        const keepView=typeof poHubView!=='undefined'&&poHubView==='estimate'?'estimate':'splits';
        try{openPOIds?.clear?.()}catch{}
        try{selectedPOIds?.clear?.()}catch{}
        try{deletePOIndex=null;bulkDeletePending=false}catch{}
        openPOHub?.(keepView);
      }catch(err){console.error('P.O. project switch failed',err)}
      return;
    }

    if(page==='project'){
      try{projectTab='overview'}catch{}
      try{renderProject()}catch(err){console.error('Project switch failed',err)}
      return;
    }

    // On Dashboard or another page, just change the selected job. The next
    // section opened from navigation will use this project.
  }

  function selectProject(project){
    if(!project)return;
    state.selectedProjectId=project.id;
    updateSidebarActive(project);
    renderCurrentPage(project);

    try{if(typeof closeMobileSidebar==='function')closeMobileSidebar()}catch{}
    try{if(typeof closeJobsDrawer==='function')closeJobsDrawer()}catch{}

    // Persist after the visible UI changes, so the click feels immediate.
    setTimeout(persistSelectionLocally,0);
  }

  // Capture phase intentionally bypasses the old inline onclick, including old
  // Number(id) coercion. No observer is needed; this listener survives rerenders.
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('.project-side-open');
    if(!button)return;
    const project=projectFromButton(button);
    if(!project)return;

    event.preventDefault();
    event.stopImmediatePropagation();
    selectProject(project);
  },true);

  window.JJProjectSwitchV825={
    select:id=>{
      const project=state?.projects?.find(p=>String(p.id)===String(id));
      selectProject(project);
    },
    current:()=>window.selectedProject?.()||null
  };
})();

/* -------------------------------------------------------------------------
   J&J Selections Stable Card Links v82.6
   One-time wrapper only. No timers, no observers, no repeated wrapping.
   Keeps PDF-imported secondary links visible without duplicating Select controls.
   ------------------------------------------------------------------------- */
(() => {
  if(window.__jjStableCardLinksV826) return;
  window.__jjStableCardLinksV826=true;

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function install(){
    if(typeof window.selectionCard!=='function') return false;
    if(window.selectionCard.__jjStableLinksV826) return true;

    const original=window.selectionCard;
    const wrapped=function(item,index){
      let html=original.apply(this,arguments);
      const links=Array.isArray(item?.additionalLinks)
        ? item.additionalLinks.filter(link=>/^https?:\/\//i.test(link?.url||''))
        : [];
      if(!links.length) return html;

      const extra=`<div class="jj-v79-extra-links">${links.map(link=>
        `<a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label||'View product')} ↗</a>`
      ).join('')}</div>`;

      return html.replace(/(<div class="selection-card-actions">)/,`$1${extra}`);
    };
    wrapped.__jjStableLinksV826=true;
    // Preserve the v82 marker so no other current code thinks this needs wrapping again.
    wrapped.__v82=original.__v82;
    window.selectionCard=wrapped;
    return true;
  }

  if(!install()){
    window.addEventListener('jj-selections-v82-ready',install,{once:true});
    window.addEventListener('load',install,{once:true});
  }
})();
/* Customer view now loads independently from customer-view.js. */
/* Selection card In Stock visual only. No other behavior changes. */
(() => {
  if(/homeowner\.html$/i.test(location.pathname)) return;
  if(window.__jjInStockCardV830) return;
  window.__jjInStockCardV830=true;
  function install(){
    if(typeof window.selectionCard!=='function')return false;
    if(window.selectionCard.__jjInStockCardV830)return true;
    const original=window.selectionCard;
    const wrapped=function(item,index){
      let html=original.apply(this,arguments);
      if(!item?.inStock)return html;
      html=html.replace(/(<span class="selection-purchased">Purchased by<br><b>.*?<\/b>)(?:<small>.*?<\/small>)?(<\/span>)/,
        '$1<small class="jj-card-instock">In Stock</small>$2');
      return html;
    };
    wrapped.__jjInStockCardV830=true;
    wrapped.__v82=original.__v82;
    window.selectionCard=wrapped;
    if(!document.getElementById('jj-card-instock-style')){
      const s=document.createElement('style');s.id='jj-card-instock-style';
      s.textContent='.jj-card-instock{display:block!important;margin-top:3px!important;color:#2B7A4B!important;font-size:10px!important;font-weight:950!important;letter-spacing:.2px!important}';
      document.head.appendChild(s);
    }
    return true;
  }
  if(!install())window.addEventListener('load',install,{once:true});
})();
