// Node VM regression: real runner orchestration + local adapter + generic fill engine.
// DOM, Chrome APIs and HTTP are explicit doubles; this is not browser/extension acceptance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import {definitions} from '../../autofill-extension/shared/schema.js';

const runnerSource=await readFile(new URL('../../autofill-extension/runner/runner.js',import.meta.url),'utf8');
const adapterSource=await readFile(new URL('../../autofill-extension/runner/local-adapter.js',import.meta.url),'utf8');
const fillSource=await readFile(new URL('../../autofill-extension/content/fill.js',import.meta.url),'utf8');
const fileBytes=new TextEncoder().encode('Fictional test resume only');
const sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',fileBytes)).toString('hex');
const file={name:'fictional.txt',mime:'text/plain',base64:Buffer.from(fileBytes).toString('base64'),size:fileBytes.length,sha256};
const expected={tenant:'beta',jobId:'web-001',expectedAccount:'demo'};
const layout='fixture-layout-v1';
function gate(){let enter,release;const entered=new Promise(resolve=>enter=resolve),ready=new Promise(resolve=>release=resolve);return {entered,release,async wait(){enter();await ready;}};}
function harness(options={}){
  const h={allowed:true,writes:0,uploads:0,clicks:0,authorizations:0,receipt:false,layout,blocked:false,afterAuthorize:null,createdTabs:[],closedTabs:[],updatedTabs:[],storage:{localTaskTabs:{task:7},localSubmissionAttempts:{}}};
  class Input {
    constructor(name,type='text'){Object.assign(this,{name,type,tagName:'INPUT',_value:'',isConnected:true,maxLength:-1,validity:{valid:true},dataset:{},_files:[]});}
    get value(){return this._value;}
    set value(value){this._value=value;h.writes++;}
    get files(){return this._files;}
    set files(files){this._files=files;h.uploads++;}
    getAttribute(){return null;}
    closest(){return null;}
    dispatchEvent(){}
    matches(){return true;}
  }
  h.field=new Input('personal.name');h.answer=new Input('motivation');h.upload=new Input('resume','file');
  h.upload._files=[new File([fileBytes],file.name)];
  h.answer.dataset={questionText:'Why this role?',questionScope:'local-v1:beta:web-001:motivation:v1'};
  const button={type:'submit',isConnected:true,click(){h.clicks++;h.receipt=!options.loseReceipt;}};
  const marker={dataset:{sessionStatus:'ready',account:'demo',tenant:'beta'}};
  const form={dataset:{jobId:'web-001',tenant:'beta',account:'demo'},elements:[h.field,h.answer,h.upload],checkValidity:()=>true,
    querySelector(selector){if(selector==='input[name="jobId"]')return {value:'web-001'};if(selector==='[data-question-key="motivation"]')return h.answer;return null;},
    querySelectorAll(selector){if(selector==='input[type="file"][name="resume"]')return [h.upload];if(selector==='[data-submit-application]')return [button];return [];}};
  h.form=form;
  const receipt={dataset:{receiptId:'receipt-1',jobId:'web-001',tenant:'beta',account:'demo',fileName:file.name,fileSize:String(file.size),sha256}};
  class DataTransfer{constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}}
  const page=vm.createContext({console,URL,Date,Map,Uint8Array,Array,File,Event,atob,AbortSignal,queueMicrotask,
    DataTransfer,
    setTimeout:callback=>{queueMicrotask(callback);return 1;},
    location:{origin:'http://127.0.0.1:17322',pathname:'/site/beta/apply/web-001'},
    HTMLInputElement:Input,HTMLTextAreaElement:Input,HTMLSelectElement:Input,
    crypto:{randomUUID:()=>webcrypto.randomUUID(),subtle:{async digest(...args){if(options.hashGate)await options.hashGate.wait();return webcrypto.subtle.digest(...args);}}},
    document:{getElementById:()=>null,querySelector(selector){if(selector==='[data-session-status]')return marker;if(selector==='[data-application-form]')return form;if(selector==='[data-receipt-id]')return h.receipt?receipt:null;return null;}},
    getComputedStyle:()=>({display:'block'}),
    async fetch(){if(options.sessionGate)await options.sessionGate.wait();return {ok:true,json:async()=>({login:{status:'ready',tenant:'beta',account:'demo'}})};},
    JobFill:{nodes:new Map([['name',{node:h.field}],['answer',{node:h.answer}]]),undoBatches:[],editable:node=>node?.isConnected===true,
      norm:value=>String(value).trim().toLowerCase(),fieldGuard:()=>h.blocked?'protected':null,guardText:()=>null,evidence:node=>({label:node.name}),
      scan:()=>({site:'http://127.0.0.1:17322/site/beta/apply/web-001',layout:h.layout,fields:[{token:'name',signature:'name-signature',blocked:h.blocked},{token:'answer',signature:'answer-signature',blocked:h.blocked}]})}});
  const tab={id:7,status:'complete',url:'http://127.0.0.1:17322/site/beta/apply/web-001'};
  const tabs=new Map([[7,tab]]);
  const runner=vm.createContext({console,URL,Date,AbortSignal,definitions,crypto:webcrypto,document:{getElementById:()=>({textContent:''})},setTimeout:callback=>{queueMicrotask(callback);return 1;},
    async fetch(url){assert.equal(url,'http://127.0.0.1:17321/api/bridge/authorize');h.authorizations++;h.afterAuthorize?.();if(options.authFailure)throw new Error('Disconnected');return {ok:true,json:async()=>({allowed:h.allowed})};},
    chrome:{runtime:{id:'test-extension'},tabs:{
      get:async id=>{assert.ok(tabs.has(id),'tab must remain open');return tabs.get(id);},
      async create(details){const created={id:8,status:'complete',...details};tabs.set(created.id,created);h.createdTabs.push(created);return created;},
      async remove(id){h.closedTabs.push(id);tabs.delete(id);},
      async update(id,details){h.updatedTabs.push(id);Object.assign(tabs.get(id),details);return tabs.get(id);}},storage:{local:{
      async get(){return structuredClone(h.storage);},async set(value){if(value.localSubmissionAttempts && Object.keys(value.localSubmissionAttempts).length && options.storageGate)await options.storageGate.wait();Object.assign(h.storage,structuredClone(value));}}},
      scripting:{async executeScript(request){assert.equal(request.world,'ISOLATED');assert.ok([7,8].includes(request.target.tabId));assert.ok(!JSON.stringify(request.args || []).includes('fictional-key'),'bridge key must remain in extension runner');
        if(request.target.tabId===8){
          if(request.files)return [{result:null}];
          assert.equal(request.args[0],'verify','temporary tab may only inspect the receipt');
          return [{result:{ok:true,receipt:options.existingReceipt?receipt.dataset:null,login:{status:'ready',tenant:'beta',account:'demo'}}}];
        }
        if(request.files){vm.runInContext(fillSource,page);vm.runInContext(adapterSource,page);return [{result:null}];}
        const func=vm.runInContext('('+request.func.toString()+')',page);
        return [{result:await func(...structuredClone(request.args))}];}}}});
  vm.runInContext(runnerSource.replace(/^import[^\n]+\n/,'').replace(/start\(\)\.catch\([\s\S]*$/,'globalThis.runCommand=execute;'),runner);
  vm.runInContext("bridge={key:'fictional-key',profileId:'isolated-test'};",runner);
  h.run=(op)=>runner.runCommand({id:'command-'+op,op,site:{adapter:'local-v1',origin:'http://127.0.0.1:17322',mode:'demo',tenant:'beta',expectedAccount:'demo'},
    task:{id:'task',jobId:'web-001',mode:'demo'},payload:op==='fill'?{layout,entries:[{key:'personal.name',value:'Fictional Applicant',confirmed:true}]}:op==='upload'?{layout,file}:op==='answer'?{layout,key:'motivation',text:'Why this role?',scope:'local-v1:beta:web-001:motivation:v1',answer:'Fictional confirmed answer'}:{layout,file}});
  h.page=page;
  return h;
}
async function pauseWhile(op,gateName){
  const waiting=gate(),h=harness({[gateName]:waiting});
  const pending=h.run(op).then(result=>result,error=>({ok:false,kind:error.kind}));
  await Promise.race([waiting.entered,pending.then(()=>{throw new Error('operation ended before reaching the expected asynchronous gate');})]);h.allowed=false;waiting.release();
  const result=await pending;
  assert.equal(result.kind,'paused');assert.equal(h.writes,0);assert.equal(h.uploads,0);assert.equal(h.clicks,0);
  assert.equal(h.authorizations,1,'authorization must occur after the asynchronous prerequisite');
  if(op==='submit')assert.ok(h.storage.localSubmissionAttempts['beta:web-001:demo'],'submission history remains monotonic after safe denial');
}
for(const op of ['fill','upload','answer','submit'])test(`pause during ${op} session fetch prevents the subsequent DOM mutation`,()=>pauseWhile(op,'sessionGate'));
test('pause while hashing the resume prevents file assignment',()=>pauseWhile('upload','hashGate'));
test('pause during durable submission marker storage prevents the click',()=>pauseWhile('submit','storageGate'));
test('manual field edits between preparation and final mutation remain intact',async()=>{
  const h=harness();h.afterAuthorize=()=>{h.field._value='Manual takeover';};
  const result=await h.run('fill');assert.equal(result.kind,'manual');assert.equal(h.field.value,'Manual takeover');assert.equal(h.writes,0);
});
test('manual replacement of an attachment during hashing remains intact',async()=>{
  const waiting=gate(),h=harness({hashGate:waiting}),pending=h.run('upload');
  await waiting.entered;const manualFile=new File(['Manual'],'manual.txt');h.upload._files=[manualFile];waiting.release();
  const result=await pending;assert.equal(result.kind,'manual');assert.equal(h.upload.files[0],manualFile);assert.equal(h.uploads,0);
});
test('a changed form layout after authorization prevents the write',async()=>{
  const h=harness();h.afterAuthorize=()=>{h.layout='changed-layout';};
  assert.equal((await h.run('fill')).kind,'structure');assert.equal(h.writes,0);
});
test('a question scope change after authorization prevents answer reuse',async()=>{
  const h=harness();h.afterAuthorize=()=>{h.answer.dataset.questionScope='different-purpose';};
  assert.equal((await h.run('answer')).kind,'structure');assert.equal(h.writes,0);
});
test('an authorized field commit uses the original generic fill engine once',async()=>{
  const h=harness();const result=await h.run('fill');assert.equal(result.ok,true);assert.equal(result.filled,1);assert.equal(h.writes,1);assert.equal(h.field.value,'Fictional Applicant');
});
test('a failed final authorization request cannot mutate the page',async()=>{
  const h=harness({authFailure:true});await assert.rejects(h.run('fill'),error=>error.kind==='paused');assert.equal(h.writes,0);
});
test('an authorized upload assigns the verified File once',async()=>{
  const h=harness();h.upload._files=[];const result=await h.run('upload');assert.equal(result.ok,true);assert.equal(result.sha256,sha256);assert.equal(h.uploads,1);
  assert.equal(Buffer.from(await h.upload.files[0].arrayBuffer()).toString(),Buffer.from(fileBytes).toString());
});
test('submission persists its marker before a single click and refuses a repeated command',async()=>{
  const h=harness();h.afterAuthorize=()=>assert.ok(h.storage.localSubmissionAttempts['beta:web-001:demo']);
  assert.equal((await h.run('submit')).ok,true);assert.equal(h.clicks,1);
  assert.equal((await h.run('submit')).kind,'unknown');assert.equal(h.clicks,1);
});
test('a lost receipt retains the durable marker and never clicks again',async()=>{
  const h=harness({loseReceipt:true});assert.equal((await h.run('submit')).kind,'unknown');assert.equal(h.clicks,1);
  assert.ok(h.storage.localSubmissionAttempts['beta:web-001:demo']);assert.equal((await h.run('submit')).kind,'unknown');assert.equal(h.clicks,1);
});
test('reinspection checks receipts separately and preserves the live form and attachment',async()=>{
  const h=harness(),manualFile=new File(['Manual fictional resume'],'manual.txt');h.field._value='Manual takeover';h.upload._files=[manualFile];
  const result=await h.run('inspect');assert.equal(result.ok,true);assert.equal(result.tabId,7);assert.equal(result.layout,layout);
  assert.equal(h.field.value,'Manual takeover');assert.equal(h.upload.files[0],manualFile);assert.equal(h.writes,0);assert.equal(h.uploads,0);
  assert.deepEqual(h.updatedTabs,[]);assert.deepEqual(h.closedTabs,[8]);assert.equal(h.createdTabs.length,1);
  assert.equal(h.createdTabs[0].url,'http://127.0.0.1:17322/site/beta/receipt/web-001');assert.equal(h.createdTabs[0].active,true);assert.equal(h.storage.localTaskTabs.task,7);
});
test('a receipt found during reinspection returns without editing the retained form',async()=>{
  const h=harness({existingReceipt:true});h.field._value='Manual takeover';
  const result=await h.run('inspect');assert.equal(result.ok,true);assert.ok(result.receipt);assert.equal(result.tabId,7);
  assert.equal(h.field.value,'Manual takeover');assert.deepEqual(h.updatedTabs,[]);assert.deepEqual(h.closedTabs,[8]);assert.equal(h.clicks,0);
});
test('prepared tokens are one-use and commit performs its write before returning',async()=>{
  const h=harness();vm.runInContext(fillSource,h.page);vm.runInContext(adapterSource,h.page);
  const prepared=await h.page.JobLocal.prepare('fillField',expected,[layout,'personal.name','Fictional Applicant']);
  const pending=h.page.JobLocal.commit(expected,prepared.token);assert.equal(h.writes,1,'no asynchronous suspension may precede the field write');
  assert.equal((await pending).ok,true);assert.equal(h.page.JobLocal.commit(expected,prepared.token).ok,false);assert.equal(h.writes,1);
});

test('submit rejects a same-name same-size resume with different bytes before any click',async()=>{
  const h=harness();h.upload._files=[new File([new Uint8Array(file.size)],file.name)];
  const result=await h.run('submit');assert.equal(result.ok,false);assert.equal(h.clicks,0);assert.equal(h.authorizations,0);
});
for(const stage of ['session','hash','authorization'])test(`submit stops attachment replacement during ${stage}`,async()=>{
  const waiting=gate(),h=harness(stage==='session'?{sessionGate:waiting}:stage==='hash'?{hashGate:waiting}:{});
  const replace=()=>{h.upload._files=[new File([stage==='session'?new Uint8Array(file.size):fileBytes],file.name)];};
  if(stage==='authorization')h.afterAuthorize=replace;
  const pending=h.run('submit');
  if(stage!=='authorization'){await waiting.entered;replace();waiting.release();}
  const result=await pending;assert.equal(result.ok,false);assert.equal(h.clicks,0);
});
