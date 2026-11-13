(()=>{
  // Large app_state saves can exceed the default request timeout.
  const defaultCloudSaveStep=cloudSaveStep;
  cloudSaveStep=function(operation,label,controller){
    if(label!=='Save cloud data')return defaultCloudSaveStep(operation,label,controller);
    let timer;
    return Promise.race([
      Promise.resolve(operation),
      new Promise((_,reject)=>{
        timer=setTimeout(()=>{
          controller?.abort();
          reject(new Error(label+' timed out. Your changes remain on this device.'));
        },120000);
      })
    ]).finally(()=>clearTimeout(timer));
  };

  let job='',rules={},ready=false,loading=false;
  function validate(projectId,items){
    if(!ready||job!==String(projectId))return 'Group settings are loading. Please try again.';
    const counts=new Map();
    for(const item of items){
      if(!item.optionGroupId||!['Selected','Ordered','Received'].includes(item.status))continue;
      const key=String(item.optionGroupId);
      counts.set(key,(counts.get(key)||0)+1);
    }
    for(const [key,count] of counts){
      if(count>1&&rules[key]?.allowMultiple!==true)return 'Choose one item per group, or enable Allow multiple selections for that group.';
    }
    return '';
  }

  window.JJGroupRules={
    validate,
    ready:id=>ready&&job===String(id),
    getRules:()=>rules,
    reload:async()=>{ready=false;await load();},
    multiple:id=>rules[String(id)]?.allowMultiple===true
  };

  async function waitForProjectCloudSave(projectId,timeoutMs=150000){
    if(!cloudClient||!cloudLoadedForUser)throw new Error('Connect and wait for cloud status to say Live before changing this setting.');
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      const hasProject=Array.isArray(cloudBaseState?.projects)
        &&cloudBaseState.projects.some(project=>String(project.id)===projectId);
      if(hasProject&&!cloudSaveQueued&&!cloudSaveInFlight)return;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw new Error('This job is still syncing. Keep the app open and try again after the cloud status says Live.');
  }

  async function load(){
    const p=selectedProject();
    if(!p||!cloudClient||loading)return;
    if(job===String(p.id)&&ready)return;
    loading=true;
    ready=false;
    job=String(p.id);
    const requested=job;
    try{
      const r=await cloudClient.rpc('jj_selection_rules',{p_job:requested});
      if(r.error)throw r.error;
      if(String(selectedProject()?.id)!==requested)return;
      rules=r.data||{};
      ready=true;
      paint();
    }catch(e){
      console.warn('Selection group settings unavailable',e.message);
    }finally{
      loading=false;
      if(String(selectedProject()?.id)!==requested)load();
    }
  }

  function paint(){
    document.querySelectorAll('[data-jj-multi]').forEach(n=>n.remove());
    document.querySelectorAll('#selections [data-selection-group-id]').forEach(section=>{
      const id=section.dataset.selectionGroupId;
      if(id==='ungrouped')return;
      const head=section.querySelector('.selection-room-heading');
      if(!head)return;
      const label=document.createElement('label');
      label.dataset.jjMulti='';
      label.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;font-size:14px';
      const input=document.createElement('input');
      input.type='checkbox';
      input.checked=rules[id]?.allowMultiple===true;
      input.disabled=!ready;
      label.append(input,document.createTextNode('Allow multiple selections'));
      head.append(label);
      input.onchange=async()=>{
        const desired=input.checked;
        const expected=!desired;
        const projectId=String(job);
        const groupId=String(id);
        input.disabled=true;
        try{
          let r=await cloudClient.rpc('jj_selection_rules',{
            p_job:projectId,p_group:groupId,p_allow:desired,p_expected:expected
          });
          if(r.error&&/job not found/i.test(String(r.error.message||r.error))){
            cloudRetryCount=0;
            saveState(false);
            await waitForProjectCloudSave(projectId);
            r=await cloudClient.rpc('jj_selection_rules',{
              p_job:projectId,p_group:groupId,p_allow:desired,p_expected:expected
            });
          }
          if(r.error)throw r.error;
          if(String(selectedProject()?.id)===projectId){
            rules=r.data||{};
            ready=true;
            toast(desired?'Group allows multiple selections.':'Group allows one selection.');
          }
        }catch(e){
          toast(e.message||'Could not save group setting.');
        }finally{
          paint();
          if(String(selectedProject()?.id)!==job)load();
        }
      };
    });
  }

  function install(){
    if(typeof renderSelections!=='function')return;
    const old=renderSelections;
    renderSelections=function(){
      const result=old.apply(this,arguments);
      if(job!==String(selectedProject()?.id))ready=false;
      paint();
      load();
      return result;
    };
    paint();
    load();
  }
  if(window.__JJ_SELECTIONS_V82_READY__)install();
  else window.addEventListener('jj-selections-v82-ready',install,{once:true});
})();
/* Durable local recovery and automatic cloud-save retry for the J&J app. */
(() => {
  'use strict';
  if (window.__jjSaveReliabilityV1) return;
  window.__jjSaveReliabilityV1 = true;

  const DB_NAME = 'jj-operations-save-recovery';
  const STORE_NAME = 'snapshots';
  const SNAPSHOT_KEY = 'current';
  const PENDING_KEY = 'jj_app_state_pending_v1';
  let dbPromise = null;
  let writeQueue = Promise.resolve();
  let queuedSnapshot = null;
  let snapshotTimer = null;
  let snapshotWritesInFlight = 0;
  let storageWarningShown = false;

  function clone(value) {
    if (value == null) return value;
    try {
      return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function openDatabase() {
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable.'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Could not open local recovery storage.'));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error('Local recovery storage is busy.'));
      };
    });
    return dbPromise;
  }

  function writeRecord(record) {
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record, SNAPSHOT_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not save the local recovery copy.'));
        tx.onabort = () => reject(tx.error || new Error('Local recovery save was interrupted.'));
      });
    });
    return writeQueue;
  }

  async function readRecord() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read the local recovery copy.'));
    });
  }

  function warnStorage(error) {
    console.error('J&J local recovery storage failed:', error);
    if (storageWarningShown) return;
    storageWarningShown = true;
    try { toast('Cloud saving is pending and the extra local recovery copy could not be made. Keep this page open while it retries.'); } catch {}
  }

  function markPending() {
    try { localStorage.setItem(PENDING_KEY, '1'); } catch (error) { warnStorage(error); }
  }

  function clearPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch {}
  }

  function queueSnapshot(pending, sourceState = state, sourceBase = cloudBaseState) {
    queuedSnapshot = {
      version: 1,
      savedAt: Date.now(),
      pending: !!pending,
      state: sourceState,
      base: sourceBase
    };
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => { flushSnapshot().catch(warnStorage); }, 150);
  }

  async function flushSnapshot() {
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = null;
    const queued = queuedSnapshot;
    if (!queued) return writeQueue;
    queuedSnapshot = null;
    const record = {
      version: queued.version,
      savedAt: queued.savedAt,
      pending: queued.pending,
      state: clone(queued.state),
      base: clone(queued.base)
    };
    snapshotWritesInFlight += 1;
    try {
      await writeRecord(record);
    } finally {
      snapshotWritesInFlight = Math.max(0, snapshotWritesInFlight - 1);
    }
    if (queuedSnapshot) await flushSnapshot();
    return writeQueue;
  }

  function mergeWithoutBaseline(local, incoming) {
    if (local === undefined) return clone(incoming);
    if (incoming === undefined) return clone(local);
    if (Array.isArray(local) && Array.isArray(incoming)) {
      const keyed = local.concat(incoming).every(item => item && typeof item === 'object' && item.id != null);
      if (keyed) {
        const localById = new Map(local.map(item => [String(item.id), item]));
        const remoteById = new Map(incoming.map(item => [String(item.id), item]));
        const ids = [...new Set([...localById.keys(), ...remoteById.keys()])];
        return ids.map(id => {
          const localItem = localById.get(id);
          const remoteItem = remoteById.get(id);
          return localItem && remoteItem
            ? mergeWithoutBaseline(localItem, remoteItem)
            : clone(localItem || remoteItem);
        });
      }
      const merged = clone(local);
      for (const item of incoming) {
        if (!merged.some(existing => {
          try { return JSON.stringify(existing) === JSON.stringify(item); } catch { return existing === item; }
        })) merged.push(clone(item));
      }
      return merged;
    }
    if (local && incoming && typeof local === 'object' && typeof incoming === 'object') {
      const merged = clone(incoming);
      for (const key of Object.keys(local)) merged[key] = mergeWithoutBaseline(local[key], incoming[key]);
      return merged;
    }
    // Without a saved baseline, prefer the local value and preserve remote-only fields.
    return clone(local);
  }

  // Normalize IDs when merging records written by different app versions.
  const originalMergeCloudValues = mergeCloudValues;
  mergeCloudValues = function(base, local, incoming) {
    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(incoming)) {
      const keyed = base.concat(local, incoming).every(item => item && typeof item === 'object' && item.id != null);
      if (keyed) {
        const byId = list => new Map(list.map(item => [String(item.id), item]));
        const b = byId(base), l = byId(local), r = byId(incoming);
        const ids = [...new Set([...b.keys(), ...l.keys(), ...r.keys()])];
        return ids.map(id => mergeCloudValues(b.get(id), l.get(id), r.get(id)))
          .filter(item => item !== undefined && item !== null);
      }
    }
    return originalMergeCloudValues(base, local, incoming);
  };

  const originalSaveState = saveState;
  saveState = function(show = true) {
    markPending();
    const result = originalSaveState.apply(this, arguments);
    queueSnapshot(true);
    return result;
  };

  const originalQueueCloudSave = queueCloudSave;
  queueCloudSave = function() {
    if (!cloudApplying) {
      markPending();
      queueSnapshot(true);
    }
    return originalQueueCloudSave.apply(this, arguments);
  };

  const originalPushCloudState = pushCloudState;
  pushCloudState = async function() {
    try {
      return await originalPushCloudState.apply(this, arguments);
    } finally {
      const pending = !!cloudSaveQueued || !cloudBaseState
        || !cloudValuesEqual(sharedCloudState(state), cloudBaseState);
      if (pending) markPending(); else clearPending();
      queueSnapshot(pending, state, cloudBaseState);
      flushSnapshot().catch(warnStorage);
    }
  };

  const originalLoadCloudState = loadCloudState;
  loadCloudState = async function() {
    const localBeforeLoad = clone(state);
    let recovery = null;
    try { recovery = await readRecord(); } catch (error) { console.warn('J&J local recovery read failed:', error); }
    let hasPending = false;
    try { hasPending = localStorage.getItem(PENDING_KEY) === '1' || recovery?.pending === true; }
    catch (error) { warnStorage(error); hasPending = recovery?.pending === true; }
    const localRecovery = Array.isArray(localBeforeLoad?.projects) ? localBeforeLoad : recovery?.state;
    const baseline = Array.isArray(recovery?.base?.projects) ? recovery.base : null;
    const localUser = localBeforeLoad?.currentUser;

    let result;
    try {
      result = await originalLoadCloudState.apply(this, arguments);
    } catch (error) {
      const networkFailure = !navigator.onLine || /timed out|network|failed to fetch|fetch failed|name_not_resolved|offline/i.test(String(error?.message || error));
      if (!hasPending || !Array.isArray(localRecovery?.projects) || !networkFailure) throw error;
      state = clone(localRecovery);
      if (USERS.some(user => user.name === localUser)) state.currentUser = localUser;
      ensureUserData();
      ensurePreconData();
      if (typeof ensureSelectionsData === 'function') ensureSelectionsData();
      persistStateLocally();
      markPending();
      queueSnapshot(true, state, baseline || cloudBaseState);
      await flushSnapshot();
      setCloudStatus('Saved on this device · waiting for connection', 'offline');
      return undefined;
    }
    const cloudState = clone(sharedCloudState(state));

    if (hasPending && Array.isArray(localRecovery?.projects)) {
      const merged = baseline
        ? mergeCloudValues(baseline, sharedCloudState(localRecovery), cloudState)
        : mergeWithoutBaseline(sharedCloudState(localRecovery), cloudState);
      state = merged;
      if (USERS.some(user => user.name === localUser)) state.currentUser = localUser;
      ensureUserData();
      ensurePreconData();
      if (typeof ensureSelectionsData === 'function') ensureSelectionsData();
      if (!state.projects.some(project => String(project.id) === String(state.selectedProjectId))) {
        state.selectedProjectId = state.projects[0]?.id ?? null;
      }
      cloudBaseState = cloudState;
      persistStateLocally();

      const needsSync = !cloudValuesEqual(sharedCloudState(state), cloudState);
      if (needsSync) {
        markPending();
        setCloudStatus('Restored local changes · syncing…', 'saving');
        queueSnapshot(true, state, cloudState);
        await flushSnapshot();
        queueCloudSave();
      } else {
        clearPending();
        queueSnapshot(false, state, cloudState);
        await flushSnapshot();
      }
      return result;
    }

    clearPending();
    queueSnapshot(false, state, cloudState);
    flushSnapshot().catch(warnStorage);
    return result;
  };

  const originalFinishCloudLogin = finishCloudLogin;
  finishCloudLogin = async function() {
    const result = await originalFinishCloudLogin.apply(this, arguments);
    if (localStorage.getItem(PENDING_KEY) === '1' || cloudSaveQueued) {
      setCloudStatus('Saved on this device · syncing…', 'saving');
    }
    return result;
  };

  let retryInFlight = false;
  async function retryPendingSave() {
    if (retryInFlight || !navigator.onLine || !cloudClient || cloudApplying || cloudSaveInFlight) return;
    let isPending = false;
    try { isPending = localStorage.getItem(PENDING_KEY) === '1' || !!cloudSaveQueued; }
    catch (error) { warnStorage(error); isPending = !!cloudSaveQueued; }
    if (!isPending) return;
    retryInFlight = true;
    try {
      if (!cloudLoadedForUser) {
        try { await loadCloudState(); }
        catch (error) { console.warn('J&J cloud reconnect failed:', error); return; }
      }
      if (!cloudLoadedForUser) return;
      cloudRetryCount = 0;
      cloudSaveQueued = true;
      setCloudStatus('Retrying saved changes…', 'saving');
      await pushCloudState();
    } finally {
      retryInFlight = false;
    }
  }

  window.addEventListener('online', retryPendingSave);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) retryPendingSave();
  });
  setInterval(retryPendingSave, 30000);

  // Keep a refresh from interrupting the brief IndexedDB write itself.
  window.addEventListener('beforeunload', event => {
    if (!snapshotTimer && !queuedSnapshot && snapshotWritesInFlight === 0) return;
    event.preventDefault();
    event.returnValue = '';
  });
})();
