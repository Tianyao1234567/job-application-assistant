// Service-worker VM evidence only. Chrome pages, probes and timers are explicit
// doubles; real extension acceptance and actual HTTP requests remain separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../../autofill-extension/background.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
const id='a'.repeat(32),url=`chrome-extension://${id}/runner/index.html`;
function harness(){
  let listener,alarmListener;
  const storage={localBridge:{key:'fictional-pairing-key-'.repeat(2),profileId:'fictional-profile'}};
  const contexts=new Map([[7,{tabId:7,contextType:'TAB',documentUrl:url}]]),states=new Map([[7,{running:false}]]);
  const h={storage,contexts,states,reloads:[],created:[],timerDelays:[],probeCalls:0,clock:0,probeHang:false,probeFailure:false,startOnCreate:true,startOnReload:true};
  const event={addListener(){}};
  const context=vm.createContext({lockStorage:async()=>{},crypto:globalThis.crypto,Date:{now:()=>h.clock},
    // Preserve async ordering while advancing bounded waits without real seconds.
    setTimeout(callback,ms){h.timerDelays.push(ms);return setTimeout(()=>{h.clock+=ms;callback();},Math.min(ms,1));},clearTimeout,
    chrome:{runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,onInstalled:event,onStartup:event,onMessage:{addListener:fn=>listener=fn},
      async getContexts(filter){return [...contexts.values()].filter(c=>filter.documentUrls.includes(c.documentUrl)&&(!filter.tabIds||filter.tabIds.includes(c.tabId)));},
      async sendMessage(message){
        assert.equal(message.type,'local-runner-probe');h.probeCalls++;
        if(h.probeHang)return new Promise(()=>{});
        if(h.probeFailure)throw Error('Probe API unavailable');
        return {tabId:message.tabId,running:states.get(message.tabId)?.running===true};
      }},
      tabs:{
        async get(tabId){assert.ok(contexts.has(tabId));return {id:tabId};},
        async reload(tabId){
          assert.equal(contexts.get(tabId)?.documentUrl,url,'only an exact extension runner may reload');
          h.reloads.push(tabId);states.set(tabId,{running:false});
          if(h.startOnReload)await h.boot(tabId);
        },
        async create(details){
          assert.equal(details.url,url);const tabId=20+h.created.length;
          h.add(tabId);h.created.push(tabId);if(h.startOnCreate)await h.boot(tabId);return {id:tabId};
        }
      },
      alarms:{onAlarm:{addListener:fn=>alarmListener=fn},async create(name,options){assert.equal(name,'local-runner-recovery');assert.equal(options.periodInMinutes,1);}},
      storage:{local:{async get(){return structuredClone(storage);},async set(value){Object.assign(storage,structuredClone(value));}}}
    }});
  vm.runInContext(source,context);
  h.add=tabId=>{contexts.set(tabId,{tabId,contextType:'TAB',documentUrl:url});states.set(tabId,{running:false});};
  h.close=tabId=>{contexts.delete(tabId);states.delete(tabId);};
  const send=(message,sender)=>new Promise(resolve=>listener(message,sender,resolve));
  h.send=(tabId=7,sender={id,url})=>send({type:'local-runner-register',tabId},sender);
  h.boot=async tabId=>{const result=await h.send(tabId);states.set(tabId,{running:result.ok===true});return result;};
  h.ensure=()=>vm.runInContext('ensureRunner()',context);
  h.alarm=async()=>{alarmListener({name:'local-runner-recovery'});await vm.runInContext('opening',context);};
  h.pair=()=>send({type:'local-pair',key:'k'.repeat(40)},{id,frameId:0,origin:'http://127.0.0.1:17321',url:'http://127.0.0.1:17321/'});
  h.running=()=>[...states.entries()].filter(([,state])=>state.running).map(([tabId])=>tabId);
  return h;
}
test('first runner registers using own-document context without a Tab.url permission',async()=>{
  const h=harness();assert.equal((await h.send()).reason,'registered');assert.equal(h.storage.runnerTabId,7);
  assert.equal((await h.send()).ok,true,'same tab registration is idempotent');
});
test('stale saved tab can be replaced but a live second runner is rejected',async()=>{
  const h=harness();h.storage.runnerTabId=99;assert.equal((await h.send()).ok,true);
  h.add(8);assert.equal((await h.send(8)).reason,'runner-conflict');assert.equal(h.storage.runnerTabId,7);
});
test('simultaneous first registrations elect exactly one runner',async()=>{
  const h=harness();h.add(8);
  const results=await Promise.all([h.send(7),h.send(8)]);assert.equal(results.filter(r=>r.ok).length,1);
});
test('registration distinguishes sender, context and API failures',async()=>{
  const h=harness();assert.equal((await h.send(7,{id})).reason,'sender-url-unavailable');
  assert.equal((await h.send(7,{id,url:'https://example.test/'})).reason,'sender-url-mismatch');
  assert.equal((await h.send(7,{id:'b'.repeat(32),url})).reason,'sender-id-mismatch');
  assert.equal((await h.send(99)).reason,'missing-runner-context');
  h.contexts.values=()=>{throw Error('API unavailable');};assert.equal((await h.send()).reason,'registration-api-error');
});
test('recovery alarm restarts retained rejected B after active A closes, preserving durable state',async()=>{
  const h=harness();assert.equal((await h.boot(7)).ok,true);h.add(8);
  assert.equal((await h.boot(8)).reason,'runner-conflict');assert.deepEqual(h.running(),[7]);
  h.storage.localSubmissionAttempts={'fictional:job:demo':{commandId:'old-attempt'}};
  h.storage.localResultOutbox={clientId:'old-runner',commandId:'old-command',result:{ok:false,kind:'unknown'}};
  const attempts=structuredClone(h.storage.localSubmissionAttempts),outbox=structuredClone(h.storage.localResultOutbox);
  h.close(7);await h.alarm();
  assert.deepEqual(h.reloads,[8]);assert.deepEqual(h.created,[]);assert.equal(h.storage.runnerTabId,8);
  assert.deepEqual(h.running(),[8]);assert.ok(h.probeCalls>=2,'recovery must probe actual loop state after reload');
  assert.deepEqual(h.storage.localSubmissionAttempts,attempts);assert.deepEqual(h.storage.localResultOutbox,outbox);
  await h.alarm();assert.deepEqual(h.reloads,[8],'subsequent alarm reuses the running B loop');
});
test('startup timeout followed by explicit dashboard pairing reloads and recovers the same runner',async()=>{
  const h=harness();h.close(7);h.startOnCreate=false;
  assert.equal((await h.pair()).ok,false,'a document without a started loop must not count as startup');
  assert.equal(h.created.length,1);const tabId=h.created[0];assert.deepEqual(h.running(),[]);
  assert.ok(h.probeCalls<=55,'startup wait is bounded');
  assert.equal((await h.pair()).ok,true);
  assert.deepEqual(h.reloads,[tabId]);assert.deepEqual(h.running(),[tabId]);assert.equal(h.storage.runnerTabId,tabId);
});
test('busy or disconnected running loop is reused without reload or new tab',async()=>{
  const h=harness();await h.boot(7);Object.assign(h.states.get(7),{busy:true,connected:false});
  await h.alarm();assert.equal((await h.pair()).ok,true);
  assert.deepEqual(h.reloads,[]);assert.deepEqual(h.created,[]);assert.deepEqual(h.running(),[7]);
});
test('recovery finds the actual running loop when saved tab points at an inactive document',async()=>{
  const h=harness();await h.boot(7);h.add(8);h.storage.runnerTabId=8;
  await h.ensure();assert.deepEqual(h.reloads,[]);assert.equal(h.storage.runnerTabId,7);assert.deepEqual(h.running(),[7]);
});
test('unresponsive probe has a bounded timeout and the next recovery can succeed',async()=>{
  const h=harness();h.probeHang=true;
  await assert.rejects(h.ensure(),/runner-startup-timeout/);
  assert.ok(h.probeCalls<=55,'including a hung probe must not make startup wait unbounded');
  assert.ok(h.timerDelays.includes(1000),'the probe itself needs a response deadline');
  h.probeHang=false;await h.ensure();assert.deepEqual(h.running(),[7]);
});
test('probe API rejection does not poison subsequent recovery',async()=>{
  const h=harness();h.probeFailure=true;
  await assert.rejects(h.ensure(),/runner-startup-timeout/);
  h.probeFailure=false;await h.ensure();assert.deepEqual(h.running(),[7]);
});
test('concurrent recovery shares one creation and registration',async()=>{
  const h=harness();h.close(7);
  await Promise.all([h.ensure(),h.ensure(),h.ensure()]);
  assert.equal(h.created.length,1);assert.deepEqual(h.running(),h.created);
});
