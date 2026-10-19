// Service-worker VM evidence only. Real extension acceptance remains separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../../autofill-extension/background.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
const id='a'.repeat(32),url=`chrome-extension://${id}/runner/index.html`;
function harness(){
  let listener;const storage={},contexts=new Map([[7,{tabId:7,contextType:'TAB',documentUrl:url}]]);
  const event={addListener(){}};
  const context=vm.createContext({lockStorage:async()=>{},crypto:globalThis.crypto,chrome:{
    runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,onInstalled:event,onStartup:event,onMessage:{addListener:fn=>listener=fn},
      async getContexts(filter){return [...contexts.values()].filter(c=>filter.documentUrls.includes(c.documentUrl)&&(!filter.tabIds||filter.tabIds.includes(c.tabId)));}},
    alarms:{onAlarm:event},storage:{local:{async get(){return {...storage};},async set(value){Object.assign(storage,value);}}}
  }});vm.runInContext(source,context);
  return {storage,contexts,send:(tabId=7,sender={id,url})=>new Promise(resolve=>listener({type:'local-runner-register',tabId},sender,resolve))};
}
test('first runner registers using own-document context without a Tab.url permission',async()=>{
  const h=harness();assert.equal((await h.send()).reason,'registered');assert.equal(h.storage.runnerTabId,7);
  assert.equal((await h.send()).ok,true,'same tab registration is idempotent');
});
test('stale saved tab can be replaced but a live second runner is rejected',async()=>{
  const h=harness();h.storage.runnerTabId=99;assert.equal((await h.send()).ok,true);
  h.contexts.set(8,{tabId:8,contextType:'TAB',documentUrl:url});
  assert.equal((await h.send(8)).reason,'runner-conflict');assert.equal(h.storage.runnerTabId,7);
});
test('simultaneous first registrations elect exactly one runner',async()=>{
  const h=harness();h.contexts.set(8,{tabId:8,contextType:'TAB',documentUrl:url});
  const results=await Promise.all([h.send(7),h.send(8)]);assert.equal(results.filter(r=>r.ok).length,1);
});
test('registration distinguishes sender, context and API failures',async()=>{
  const h=harness();assert.equal((await h.send(7,{id})).reason,'sender-url-unavailable');
  assert.equal((await h.send(7,{id,url:'https://example.test/'})).reason,'sender-url-mismatch');
  assert.equal((await h.send(7,{id:'b'.repeat(32),url})).reason,'sender-id-mismatch');
  assert.equal((await h.send(99)).reason,'missing-runner-context');
  h.contexts.values=()=>{throw Error('API unavailable');};assert.equal((await h.send()).reason,'registration-api-error');
});
