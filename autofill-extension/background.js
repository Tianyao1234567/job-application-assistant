import {lockStorage} from './shared/storage.js';
// Restrict the profile database to extension-owned contexts.
lockStorage();
chrome.runtime.onInstalled.addListener(() => lockStorage());
chrome.runtime.onStartup.addListener(() => lockStorage());

const DASHBOARD = 'http://127.0.0.1:17321';
const runnerUrl = chrome.runtime.getURL('runner/index.html');
let opening;
async function ensureRunner() {
  if (opening) return opening;
  opening = (async () => {
    const {localBridge} = await chrome.storage.local.get('localBridge');
    if (!localBridge?.key) return;
    const {runnerTabId} = await chrome.storage.local.get('runnerTabId');
    if (Number.isInteger(runnerTabId)) {
      try { const tab = await chrome.tabs.get(runnerTabId); if (tab.url === runnerUrl) return tab; } catch {}
    }
    const tabs = await chrome.tabs.query({url:runnerUrl});
    const tab = tabs[0] || await chrome.tabs.create({url:runnerUrl,active:false});
    await chrome.storage.local.set({runnerTabId:tab.id});
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
  if (message?.type === 'local-runner-register' && sender.url === runnerUrl && Number.isInteger(message.tabId)) {
    (async () => {
      const current=await chrome.tabs.get(message.tabId);
      if(current.url!==runnerUrl){respond({ok:false});return;}
      const {runnerTabId} = await chrome.storage.local.get('runnerTabId');
      if (Number.isInteger(runnerTabId) && runnerTabId !== message.tabId) {
        try { const tab=await chrome.tabs.get(runnerTabId); if (tab.url === runnerUrl) {respond({ok:false});return;} } catch {}
      }
      await chrome.storage.local.set({runnerTabId:message.tabId}); respond({ok:true});
    })().catch(() => respond({ok:false}));
    return true;
  }
});