import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped dashboard transport/polling functions with controllable I/O.
// This VM boundary is not a browser or extension acceptance test.
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const startup='setInterval(() => refresh(), 1000);\nawait refresh(true);';
assert.ok(source.includes(startup),'dashboard startup boundary changed; update the VM loader');
const executable=source.replace(/^import .*from '\/schema\.js';\n/,'').replace(startup,`globalThis.dashboard={api,refresh,runHealthCheck,taskActions,render,connect,
  quietRender(){render=()=>{};},quietHeader(){header=()=>{};},
  get fetching(){return fetching;},get state(){return state;},get drafts(){return drafts;},
  get healthBusy(){return healthBusy;},get healthResult(){return healthResult;},
  get pairingPending(){return Boolean(pairingIntent);},
  editing(value,ime=false){state={};renderedView='profile';location.hash='#profile';composing=ime;document.activeElement=value;},
  setState(value){state=value;},
  seedDrafts(){drafts.set('answer-test','尚未提交的虚构答案');profileDraft={fictional:'未保存'};settingsDraft={fictional:'未保存'};selectedResumeFile={name:'fictional-unsaved.txt'};},
  draftSnapshot(){return JSON.stringify([Array.from(drafts),profileDraft,settingsDraft,selectedResumeFile]);}
};`);

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
function harness(fetcher,{search=''}={}){
  const nodes=[],ids=new Map(),timers=new Map(),events=new Map(),posts=[];let nextTimer=1;
  class Element{
    constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.disabled=false;this.hidden=false;this.open=false;this.replacements=0;this._text='';this.classList={add(){},remove(){},toggle(){}};nodes.push(this);}
    set textContent(value){this._text=String(value);this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.replacements++;this.children=children;this._text='';}
    setAttribute(name,value){this.attributes[name]=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);}
    removeAttribute(name){delete this.attributes[name];}
    addEventListener(name,handler){this.events[name]=handler;}
    contains(node){return Boolean(node&&node.insideContent);}
    matches(){return Boolean(this.editable);}
    querySelector(){return null;}
    querySelectorAll(){return [];}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const get=selector=>{if(!ids.has(selector))ids.set(selector,new Element());return ids.get(selector);};
  get('meta[name="local-key"]').content='fictional-dashboard-key';get('#health-button').dataset.health='';
  const document={activeElement:null,querySelector:get,querySelectorAll(selector){const attribute=selector.match(/^\[data-([\w-]+)\]$/)?.[1];return attribute?nodes.filter(node=>Object.hasOwn(node.dataset,attribute.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()))):[];},createElement:tag=>new Element(tag),createTextNode:text=>{const node=new Element('#text');node.textContent=text;return node;}};
  const window={addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},postMessage(data,origin){posts.push({data,origin});}};
  const context=vm.createContext({document,Node:Element,window,location:{origin:'http://127.0.0.1:17321',hash:'',search},URLSearchParams,AbortController,structuredClone,Intl,Date,console,
    fetch:fetcher,setTimeout(fn,delay){const id=nextTimer++;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),setInterval(){throw new Error('VM tests must not start browser polling');}});
  vm.runInContext(executable,context,{filename:'dashboard-app.js'});
  return {app:context.dashboard,get,timers,Element,posts,message(data){for(const handler of events.get('message')||[])handler({source:window,origin:'http://127.0.0.1:17321',data});},async deadline(delay){const found=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(found,`missing ${delay}ms request deadline`);timers.delete(found[0]);found[1].fn();await flush();}};
}
const response=data=>({ok:true,status:200,json:async()=>data});
const snapshot=now=>({now});

test('hung state request expires, releases polling and recovers without accepting a late response',async()=>{
  const old=deferred(),calls=[];
  const h=harness((path,options)=>{calls.push({path,options});return calls.length===1?old.promise:Promise.resolve(response(snapshot('2026-10-17T02:00:00Z')));});h.app.quietRender();
  const first=h.app.refresh();assert.equal(h.app.fetching,true);await h.app.refresh();assert.equal(calls.length,1);
  await h.deadline(8000);await first;
  assert.equal(h.app.fetching,false);assert.equal(calls[0].options.signal.aborted,true);assert.equal(h.get('#offline-banner').hidden,false);
  await h.app.refresh();assert.equal(h.app.state.now,'2026-10-17T02:00:00Z');assert.equal(h.get('#offline-banner').hidden,true);
  old.resolve(response(snapshot('2026-10-16T00:00:00Z')));await flush();assert.equal(h.app.state.now,'2026-10-17T02:00:00Z');
  assert.equal(calls[1].options.method,'GET');assert.equal(calls[1].options.headers['X-Local-Key'],'fictional-dashboard-key');assert.equal(h.timers.size,0);
});

test('a response with a stuck JSON body is bounded by the same request deadline',async()=>{
  const body=deferred();let signal;
  const h=harness(async(path,options)=>{signal=options.signal;return {ok:true,status:200,json:()=>body.promise};});h.app.quietRender();
  const request=h.app.refresh();await flush();await h.deadline(8000);await request;
  assert.equal(h.app.fetching,false);assert.equal(signal.aborted,true);assert.match(h.get('#offline-banner').textContent,/超时/);assert.equal(h.timers.size,0);
});

test('POST timeout sends once and preserves unsaved answers, profile, settings and selected file',async()=>{
  const calls=[];const h=harness((path,options)=>{calls.push({path,options});return options.method==='POST'?new Promise(()=>{}):Promise.resolve(response(snapshot('2026-10-17T03:00:00Z')));});h.app.quietRender();h.app.seedDrafts();const draft=h.app.draftSnapshot();
  const save=h.app.api('/api/profile',{fictional:true});const rejected=assert.rejects(save,/结果尚未确认/);await h.deadline(20000);await rejected;
  await h.app.refresh();assert.equal(calls.filter(call=>call.options.method==='POST').length,1);assert.deepEqual(calls.map(call=>call.path),['/api/profile','/api/state']);assert.equal(h.app.draftSnapshot(),draft);
});

test('read-only self-check prevents duplicate clicks, shows observed Chinese results and can run again',async()=>{
  const pending=deferred(),calls=[];const result={checkedAt:'2026-10-17T04:00:00Z',checks:[{id:'extension',status:'warning',label:'插件执行端',detail:'尚未连接，未读取实际页面。',action:'请连接投递浏览器。'}]};
  const h=harness((path,options)=>{calls.push({path,options});return calls.length===1?pending.promise:Promise.resolve(response(result));});
  const first=h.app.runHealthCheck();assert.equal(h.app.healthBusy,true);assert.equal(h.get('#health-button').disabled,true);await h.app.runHealthCheck();assert.equal(calls.length,1);
  pending.resolve(response(result));await first;assert.equal(h.app.healthBusy,false);assert.equal(h.get('#health-button').disabled,false);assert.match(h.get('#health-dialog-content').textContent,/尚未连接，未读取实际页面/);assert.match(h.get('#health-dialog-content').textContent,/不会投递或解除暂停/);
  await h.app.runHealthCheck();assert.equal(calls.length,2);assert.ok(calls.every(call=>call.path==='/api/health'&&call.options.method==='GET'&&call.options.body===undefined));assert.equal(h.timers.size,0);
});

test('poll rendering keeps focused editor and IME nodes and all unsaved drafts intact',()=>{
  const h=harness(async()=>response({}));h.app.quietHeader();h.app.seedDrafts();const draft=h.app.draftSnapshot();const input=new h.Element('textarea');input.insideContent=true;input.editable=true;
  h.app.editing(input);h.app.render();assert.equal(h.get('#view-content').replacements,0);
  h.app.editing(null,true);h.app.render(true);assert.equal(h.get('#view-content').replacements,0);assert.equal(h.app.draftSnapshot(),draft);
});

test('task recovery and verification use model capability flags, retaining the same task id',()=>{
  const h=harness(async()=>response({}));h.app.setState({connection:{connected:true}});
  const resumable=h.app.taskActions({id:'fictional-original-task',status:'skipped',canResume:true,canVerify:false});assert.match(resumable.textContent,/重新检查并排队/);
  const resume=resumable.children.find(node=>node.dataset.actionToken==='task-resume:fictional-original-task');assert.ok(resume);
  const locked=h.app.taskActions({id:'fictional-original-task',status:'skipped',canResume:false,canVerify:true});assert.match(locked.textContent,/核对接收记录/);assert.doesNotMatch(locked.textContent,/重新检查并/);
  const unknown=h.app.taskActions({id:'fictional-original-task',status:'unknown',canResume:false,canVerify:true});assert.doesNotMatch(unknown.textContent,/重新检查并/);
});

test('an explicit click before extension readiness replays pairing once, then acks without claiming heartbeat connection',()=>{
  const h=harness(async()=>response({}));h.app.quietRender();h.app.setState({connection:{connected:false}});
  h.app.connect();assert.equal(h.posts.length,1);assert.equal(h.app.pairingPending,true);assert.equal(h.get('#connect-button').disabled,true);
  h.app.connect();assert.equal(h.posts.length,1);
  h.message({channel:'job-local',type:'extension-ready'});assert.equal(h.posts.length,2);
  h.message({channel:'job-local',type:'extension-ready'});assert.equal(h.posts.length,2);
  assert.ok(h.posts.every(post=>post.data.type==='connect'&&post.origin==='http://127.0.0.1:17321'));
  h.message({channel:'job-local',type:'connected',ok:true});assert.equal(h.app.pairingPending,false);assert.equal(h.get('#connect-button').disabled,false);assert.equal(h.app.state.connection.connected,false);assert.match(h.get('#toast').textContent,/等待后台确认实际执行端心跳/);
  h.message({channel:'job-local',type:'extension-ready'});h.message({channel:'job-local',type:'connected',ok:true});assert.equal(h.posts.length,2);assert.ok(![...h.timers.values()].some(timer=>timer.delay===15000));
});

test('readiness without a click never pairs, and a failed acknowledgement ends the intent until an explicit retry',()=>{
  const h=harness(async()=>response({}));h.app.quietRender();
  h.message({channel:'job-local',type:'extension-ready'});h.message({channel:'job-local',type:'connected',ok:true});assert.equal(h.posts.length,0);assert.equal(h.app.pairingPending,false);
  h.app.connect();assert.equal(h.posts.length,1);h.message({channel:'job-local',type:'connected',ok:false});assert.equal(h.app.pairingPending,false);assert.match(h.get('#toast').textContent,/插件配对失败/);
  h.message({channel:'job-local',type:'extension-ready'});assert.equal(h.posts.length,1);
  h.app.connect();assert.equal(h.posts.length,2);h.message({channel:'job-local',type:'connected',ok:true});assert.equal(h.app.pairingPending,false);
});

test('pairing timeout ends retries and autoconnect is limited to its explicit URL authorization',async()=>{
  const h=harness(async()=>response({}));h.app.quietRender();h.app.connect();await h.deadline(15000);assert.equal(h.app.pairingPending,false);
  h.message({channel:'job-local',type:'extension-ready'});assert.equal(h.posts.length,1);assert.match(h.get('#toast').textContent,/未收到插件配对回执/);
  const auto=harness(async()=>response({}),{search:'?autoconnect=1'});auto.app.quietRender();await auto.deadline(100);assert.equal(auto.posts.length,1);
  auto.message({channel:'job-local',type:'extension-ready'});assert.equal(auto.posts.length,2);auto.message({channel:'job-local',type:'connected',ok:false});auto.message({channel:'job-local',type:'extension-ready'});assert.equal(auto.posts.length,2);
});
