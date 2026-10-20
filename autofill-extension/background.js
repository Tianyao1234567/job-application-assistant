import {lockStorage} from './shared/storage.js';
// Restrict the profile database to extension-owned contexts.
lockStorage();
chrome.runtime.onInstalled.addListener(() => lockStorage());
chrome.runtime.onStartup.addListener(() => lockStorage());

const DASHBOARD = 'http://127.0.0.1:17321';
const runnerUrl = chrome.runtime.getURL('runner/index.html');
let opening;
let registering=Promise.resolve();
// Own extension documents are not covered by the fixture host permission. Query
// extension contexts instead of treating a redacted Tab.url as a conflicting runner.
async function runnerContexts(tabId) {
  return chrome.runtime.getContexts({contextTypes:['TAB'],documentUrls:[runnerUrl],...(Number.isInteger(tabId)?{tabIds:[tabId]}:{})});
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runnerRunning(tabId) {
  let timer;
  try {
    // This is a read-only, extension-internal liveness query. A document alone
    // may be a stopped runner rejected during a previous registration attempt.
    const reply=await Promise.race([chrome.runtime.sendMessage({type:'local-runner-probe',tabId}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1000);})]);
    return reply?.tabId===tabId && reply?.running===true;
  }catch{return false;}finally{clearTimeout(timer);}
}
async function waitRunner(tabId) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
    if(await runnerRunning(tabId))return;
    await delay(100);
  }
  throw new Error('runner-startup-timeout');
}
async function ensureRunner() {
  if (opening) return opening;
  opening = (async () => {
    const {localBridge,runnerTabId} = await chrome.storage.local.get(['localBridge','runnerTabId']);
    if (!localBridge?.key) return;
    const contexts=await runnerContexts();
    for(const context of contexts){
      if(await runnerRunning(context.tabId)){
        await chrome.storage.local.set({runnerTabId:context.tabId});
        return chrome.tabs.get(context.tabId);
      }
    }
    const selected=contexts.find(context=>context.tabId===runnerTabId) || contexts[0];
    let tab;
    if(selected){
      tab=await chrome.tabs.get(selected.tabId);
      // Reload only this extension's selected inactive document, never task pages
      // or a production browser profile. Durable attempts/outbox remain intact.
      await chrome.storage.local.set({runnerTabId:tab.id});
      await chrome.tabs.reload(tab.id);
    }else{
      tab=await chrome.tabs.create({url:runnerUrl,active:false});
      await chrome.storage.local.set({runnerTabId:tab.id});
    }
    await waitRunner(tab.id);
    return tab;
  })();
  try {return await opening;} finally {opening = null;}
}
async function recover() {
  await lockStorage();
  // This alarm only restores the execution tab. Daily schedules belong to the local server.
  await chrome.alarms.create('local-runner-recovery',{periodInMinutes:1});
  await ensureRunner();
}
chrome.runtime.onInstalled.addListener(() => recover().catch(() => {}));
chrome.runtime.onStartup.addListener(() => recover().catch(() => {}));
chrome.alarms.onAlarm.addListener(alarm => {if (alarm.name === 'local-runner-recovery') ensureRunner().catch(() => {});});
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (message?.type === 'local-pair') {
    if (sender.frameId !== 0 || sender.origin !== DASHBOARD || !sender.url?.startsWith(DASHBOARD+'/') || typeof message.key !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(message.key)) {
      respond({ok:false}); return;
    }
    (async () => {
      await lockStorage();
      const {localBridge} = await chrome.storage.local.get('localBridge');
      await chrome.storage.local.set({localBridge:{key:message.key,profileId:localBridge?.profileId || crypto.randomUUID()}});
      await chrome.alarms.create('local-runner-recovery',{periodInMinutes:1});
      await ensureRunner(); respond({ok:true});
    })().catch(() => respond({ok:false}));
    return true;
  }
  if (message?.type === 'local-runner-register') {
    if(sender.id!==chrome.runtime.id){respond({ok:false,reason:'sender-id-mismatch'});return;}
    if(!sender.url){respond({ok:false,reason:'sender-url-unavailable'});return;}
    if(sender.url!==runnerUrl){respond({ok:false,reason:'sender-url-mismatch'});return;}
    if(!Number.isInteger(message.tabId)){respond({ok:false,reason:'invalid-tab-id'});return;}
    registering=registering.catch(()=>{}).then(async()=>{
      if((await runnerContexts(message.tabId)).length!==1){respond({ok:false,reason:'missing-runner-context'});return;}
      const {runnerTabId}=await chrome.storage.local.get('runnerTabId');
      if(Number.isInteger(runnerTabId) && runnerTabId!==message.tabId && (await runnerContexts(runnerTabId)).length){
        respond({ok:false,reason:'runner-conflict'});return;
      }
      await chrome.storage.local.set({runnerTabId:message.tabId});respond({ok:true,reason:'registered'});
    }).catch(()=>respond({ok:false,reason:'registration-api-error'}));
    return true;
  }
});
