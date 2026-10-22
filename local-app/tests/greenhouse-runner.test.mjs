// Chrome/page doubles exercise the actual runner's authorization and ledger order.
// Real DOM/extension/multipart behavior has its own local browser replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const source=await readFile(new URL('../../autofill-extension/runner/runner.js',import.meta.url),'utf8');
const layout='observed-greenhouse-form';
const file={name:'fictional.txt',mime:'text/plain',base64:'ZmljdGlvbmFs',size:9,sha256:'a'.repeat(64)};
function gate(){let enter,release;return {entered:new Promise(resolve=>enter=resolve),ready:new Promise(resolve=>release=resolve),enter:()=>enter(),release:()=>release()};}
function harness({replay=true,storageGate,prepareGate,receipt=false}={}){
  const origin=replay?'http://127.0.0.1:17322':'https://job-boards.greenhouse.io';
  const tenant=replay?'fictional':'mattermost',company=replay?'Fictional Company':'Mattermost';
  const prefix=(replay?'/greenhouse':'')+'/'+tenant;
  const h={allowed:true,clicks:0,writes:0,authorizations:0,created:[],updated:[],removed:[],prepared:[],storage:{localTaskTabs:{task:7},localSubmissionAttempts:{}}};
  const tabs=new Map([[7,{id:7,status:'complete',url:origin+prefix+'/jobs/1234567'}]]);
  const page={JobGreenhouse:{
    async read(op){return {ok:true,layout,receipt:op==='verify'&&receipt?{id:'fictional-receipt'}:null};},
    async prepare(method,expected,args){h.prepared.push({method,expected,args});if(prepareGate){prepareGate.enter();await prepareGate.ready;}return {ok:true,token:method};},
    commit(expected,token){if(token==='submit')h.clicks++;else h.writes++;return {ok:token!=='submit',attempted:token==='submit',filled:1};}
  }};
  const context=vm.createContext({URL,Date,AbortSignal,definitions:{},crypto:webcrypto,console,
    document:{getElementById:()=>({textContent:''})},setTimeout:callback=>{queueMicrotask(callback);return 1;},
    async fetch(url){assert.equal(url,'http://127.0.0.1:17321/api/bridge/authorize');h.authorizations++;return {ok:true,json:async()=>({allowed:h.allowed})};},
    chrome:{runtime:{id:'fictional-extension',onMessage:{addListener(){}}},tabs:{
      get:async id=>tabs.get(id),
      async create(options){const tab={id:8,status:'complete',...options};tabs.set(8,tab);h.created.push(tab.url);return tab;},
      async update(id,options){Object.assign(tabs.get(id),options);h.updated.push(options.url);return tabs.get(id);},
      async remove(id){tabs.delete(id);h.removed.push(id);}
    },storage:{local:{async get(){return structuredClone(h.storage);},async set(values){
      if(values.localSubmissionAttempts&&storageGate){storageGate.enter();await storageGate.ready;}
      Object.assign(h.storage,structuredClone(values));
    }}},scripting:{async executeScript(request){
      assert.equal(request.world,'ISOLATED');
      if(request.files){assert.equal(request.files.at(-1),'runner/greenhouse-adapter.js');return [{result:null}];}
      const fn=vm.runInNewContext('('+request.func.toString()+')',page);
      return [{result:await fn(...request.args)}];
    }}}
  });
  vm.runInContext(source.replace(/^import[^\n]+\n/,'').replace(/start\(\)\.catch\([\s\S]*$/,'globalThis.run=execute;globalThis.policy={expected,greenhouseUrl,greenhouseEntries};'),context);
  vm.runInContext("bridge={key:'fictional-bridge-key',profileId:'fictional-profile'};",context);
  h.command=op=>({id:'command-'+op,op,site:{adapter:replay?'greenhouse-replay-v1':'greenhouse-v1',origin,tenant,company,expectedAccount:'fictional@example.invalid',mode:replay?'demo':'real',listUrl:origin+prefix,loginUrl:origin+prefix},
    task:{id:'task',jobId:'1234567',url:origin+prefix+'/jobs/1234567',mode:replay?'demo':'real',applicantConfirmed:true,executionProfileId:'fictional-profile',confirmedProfileKeys:['personal.email','personal.phone']},
    payload:op==='fill'?{layout,entries:[{key:'personal.email',value:'fictional@example.invalid',confirmed:true}]}:{layout,file}});
  h.run=op=>context.run(h.command(op));h.policy=context.policy;
  return h;
}

test('Greenhouse execution pins host, mode, tenant, company, job and execution profile',()=>{
  const h=harness(),good=h.command('fill');assert.equal(h.policy.expected(good).applicantConfirmed,true);
  for(const change of [c=>c.site.origin='https://evil.invalid',c=>c.site.tenant='../other',c=>c.site.company='',c=>c.task.jobId='../other',c=>c.task.mode='real',c=>c.task.applicantConfirmed=false,c=>c.task.executionProfileId='another-profile']){
    const command=structuredClone(good);change(command);assert.throws(()=>h.policy.expected(command));
  }
  const real=harness({replay:false});assert.equal(real.policy.expected(real.command('fill')).replay,false);
});
test('Greenhouse navigation refuses other tenants, jobs, origins and invented production receipts',()=>{
  const h=harness({replay:false}),expected=h.policy.expected(h.command('inspect'));
  for(const url of ['https://job-boards.greenhouse.io/other/jobs/1234567','https://job-boards.greenhouse.io/mattermost/jobs/999','https://job-boards.greenhouse.io/mattermost/jobs/1234567/receipt','https://evil.invalid/mattermost/jobs/1234567','https://user:secret@job-boards.greenhouse.io/mattermost/jobs/1234567'])assert.throws(()=>h.policy.greenhouseUrl(url,expected));
});
test('only exact confirmed profile facts map; full names and unscoped custom answers are not guessed',()=>{
  const h=harness();const entries=h.policy.greenhouseEntries([
    {key:'personal.name',value:'Never Split This Name',confirmed:true},
    {key:'customAnswers.country',value:'A guessed country',confirmed:true},
    {key:'personal.email',value:'fictional@example.invalid',confirmed:true},
    {key:'personal.phone',value:'10000000000',confirmed:false}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(entries)),[{name:'email',value:'fictional@example.invalid'}]);
});
test('pause during Greenhouse asynchronous preparation prevents the DOM write',async()=>{
  const pending=gate(),h=harness({prepareGate:pending}),operation=h.run('fill');
  await pending.entered;h.allowed=false;pending.release();
  await assert.rejects(operation,error=>error.kind==='paused');assert.equal(h.writes,0);assert.equal(h.clicks,0);assert.equal(h.authorizations,1);
});
test('pause during durable Greenhouse ledger storage prevents click and retains attempt',async()=>{
  const pending=gate(),h=harness({storageGate:pending}),operation=h.run('submit');
  await pending.entered;h.allowed=false;pending.release();
  await assert.rejects(operation,error=>error.kind==='paused');assert.equal(h.clicks,0);assert.equal(Object.keys(h.storage.localSubmissionAttempts).length,1);
});
test('unknown Greenhouse result is never clicked twice or returned as success',async()=>{
  const h=harness({replay:false});const result=await h.run('submit');
  assert.equal(result.ok,false);assert.equal(result.kind,'unknown');assert.equal(h.clicks,1);assert.equal(Object.keys(h.storage.localSubmissionAttempts).length,1);
  assert.equal((await h.run('submit')).kind,'unknown');assert.equal(h.clicks,1);
  assert.equal((await h.run('inspect')).kind,'unknown');assert.equal(h.clicks,1);
  const verified=await h.run('verify');assert.equal(verified.receipt,null);assert.equal(h.created.length,0);assert.equal(h.updated.length,0);
});
test('Greenhouse recovery checks replay receipts separately and preserves the live application',async()=>{
  const h=harness();assert.equal((await h.run('inspect')).ok,true);
  assert.equal(h.created.length,1);assert.match(h.created[0],/\/jobs\/1234567\/receipt$/);assert.deepEqual(h.removed,[8]);assert.equal(h.updated.length,0);assert.equal(h.writes,0);
});
