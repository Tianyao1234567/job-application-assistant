import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise shipped dashboard forms and their actual mutation handlers. This is
// UI boundary coverage, distinct from real browser/extension acceptance.
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const startup='setInterval(() => refresh(), 1000);\nawait refresh(true);';
assert.ok(source.includes(startup));
const executable=source.replace(/^import .*from '\/schema\.js';\n/,'').replace(startup,`globalThis.dashboard={
  taskConfirmationForm,answerForm,answerMemoryCard,renderSettingsSite,questionInput,taskActions,siteControls,
  setState(value){state=value;},setSettings(value){settingsDraft=value;},
  quiet(){refresh=async()=>{};render=()=>{};}
};`);

function harness(snapshot){
  const nodes=[],ids=new Map(),calls=[];
  class Element {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.events={};this.checked=false;this.disabled=false;this.required=false;this.value='';this._text='';this.classList={toggle(){},add(){},remove(){}};nodes.push(this);}
    set textContent(value){this._text=String(value);this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
    set innerHTML(value){throw new Error('UI must not render untrusted HTML');}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;this._text='';}
    setAttribute(name,value){this.attributes[name]=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);}
    removeAttribute(name){delete this.attributes[name];}
    addEventListener(name,handler){this.events[name]=handler;}
    querySelector(selector){return walk(this).find(node=>selector==='.form-error'&&node.className==='form-error')||null;}
    scrollIntoView(){}
    contains(){return false;}
    close(){}
  }
  const get=selector=>{if(!ids.has(selector))ids.set(selector,new Element());return ids.get(selector);};
  get('meta[name="local-key"]').content='fictional-key';
  const document={querySelector:get,querySelectorAll:()=>[],createElement:tag=>new Element(tag),createTextNode:text=>{const node=new Element('#text');node.textContent=text;return node;}};
  const context=vm.createContext({document,Node:Element,window:{addEventListener(){},postMessage(){}},location:{origin:'http://127.0.0.1:17321',hash:'',search:''},URLSearchParams,AbortController,structuredClone,Intl,Date,console,
    fetch:async(path,options)=>{calls.push({path,body:options.body?JSON.parse(options.body):undefined});return {ok:true,status:200,json:async()=>({ok:true})};},setTimeout:()=>1,clearTimeout(){},setInterval(){throw new Error('Polling must not start in focused UI tests');}});
  vm.runInContext(executable,context,{filename:'dashboard-app.js'});
  context.dashboard.setState(snapshot);context.dashboard.quiet();
  return {app:context.dashboard,calls,nodes,snapshot};
}
function walk(root){return [root,...root.children.flatMap(walk)];}
const find=(root,predicate)=>walk(root).find(predicate);
const inputs=root=>walk(root).filter(node=>node.tagName==='INPUT');
const submit=form=>form.events.submit({preventDefault(){}});
const question=()=>({key:'question_1',text:'Why are you interested in this role at Fictional Company?',scope:'greenhouse:fictional:123:question_1:version-a',version:'version-a',source:'http://127.0.0.1:17322/greenhouse/fictional/jobs/123',type:'textarea',options:[],optionsComplete:true,purpose:'company-motivation'});
function state(){
  const task={id:'fictional-task',siteId:'fictional-site',title:'Fictional Engineer',company:'Fictional Company',jobId:'123',url:'https://job-boards.greenhouse.io/fictional/jobs/123',status:'waiting_user',needsConfirmation:true,question:question()};
  return {tasks:[task],sites:[{id:task.siteId,adapter:'greenhouse-v1',company:'Fictional Company',expectedAccount:'fictional@example.invalid'}],connection:{connected:true,profileId:'fictional-execution-profile'},profile:{version:3,mode:'real',data:{personal:{name:{zh:'Fictional Applicant',confirmed:true}}}},resume:{version:4,name:'fictional.txt',size:41,sha256:'a'.repeat(64)},answers:[]};
}

test('rendering a task never confirms it; four deliberate checks bind exact job and versions',async()=>{
  const s=state(),h=harness(s),form=h.app.taskConfirmationForm(s.tasks[0]);
  assert.equal(h.calls.length,0);const checks=inputs(form).filter(node=>node.attributes.type==='checkbox');
  assert.equal(checks.length,4);assert.ok(checks.every(node=>!node.checked&&node.required));
  await submit(form);assert.equal(h.calls.length,0);assert.match(form.textContent,/请本人逐项核对/);
  for(const control of checks)control.checked=true;
  await submit(form);assert.equal(h.calls.length,1);
  assert.deepEqual(h.calls[0],{path:'/api/action',body:{action:'task-confirm',taskId:s.tasks[0].id,jobId:'123',profileVersion:3,resumeVersion:4,profileId:s.connection.profileId,submitConfirmed:true}});
  assert.match(form.textContent,/fictional\.txt/);assert.match(form.textContent,/a{64}/);assert.match(form.textContent,/提交一次申请/);
});

test('stale profile, attachment, or execution-profile confirmations never send a mutation',async()=>{
  for(const mutate of [s=>s.profile.version++,s=>s.resume.version++,s=>s.resume.sha256='b'.repeat(64),s=>s.connection.profileId='different-profile',s=>s.tasks[0].url+='?changed=1']){
    const s=state(),h=harness(s),form=h.app.taskConfirmationForm(s.tasks[0]);
    for(const control of inputs(form))control.checked=true;
    mutate(s);await submit(form);assert.equal(h.calls.length,0);assert.match(form.textContent,/已经变化/);
    const current=h.app.taskConfirmationForm(s.tasks[0]);assert.ok(inputs(current).every(control=>!control.checked),'a changed binding must require fresh deliberate checks');
  }
});

test('incomplete custom options pause; complete options keep exact text and reject disabled choices',async()=>{
  const s=state(),h=harness(s);s.tasks[0].status='waiting_answer';
  s.tasks[0].question={...question(),type:'text',customControl:true,optionsComplete:false,options:[]};
  const blocked=h.app.answerForm({question:s.tasks[0].question},s.tasks[0]);assert.match(blocked.textContent,/选项尚未完整核实/);assert.equal(blocked.events.submit,undefined);assert.equal(h.calls.length,0);
  s.tasks[0].question={...question(),type:'select-one',optionsComplete:true,options:[{text:'Observed fictional choice <b>literal</b>',disabled:false},{text:'Unavailable original choice',disabled:true}]};
  const form=h.app.answerForm({question:s.tasks[0].question},s.tasks[0]),select=find(form,node=>node.tagName==='SELECT');
  assert.ok(select);assert.equal(select.value,'');assert.match(form.textContent,/<b>literal<\/b>/);
  select.value='Unavailable original choice';await submit(form);assert.equal(h.calls.length,0);
  select.value='Observed fictional choice <b>literal</b>';await submit(form);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.answer,select.value);assert.equal(h.calls[0].body.save,false);
});

test('changed question scope cannot reuse an unsaved answer or submit an old form',async()=>{
  const s=state(),h=harness(s),original=s.tasks[0].question;
  const old=h.app.answerForm({question:original},s.tasks[0]),oldInput=find(old,node=>node.tagName==='TEXTAREA');
  oldInput.value='Fictional answer for old purpose';oldInput.events.input();
  s.tasks[0].question={...original,scope:'greenhouse:other:123:question_1:version-b',version:'version-b'};
  const current=h.app.answerForm({question:s.tasks[0].question},s.tasks[0]);assert.equal(find(current,node=>node.tagName==='TEXTAREA').value,'');
  await submit(old);assert.equal(h.calls.length,0);assert.match(old.textContent,/当前问题已经变化/);
});

test('saved answers can be viewed, edited and revoked only by their exact scope',async()=>{
  const s=state(),memory={...question(),siteId:'fictional-site',value:'Original fictional answer'};s.answers=[memory];
  const h=harness(s),card=h.app.answerMemoryCard();assert.match(card.textContent,/Original fictional answer/);assert.match(card.textContent,/不会把公司动机跨公司套用/);
  const form=find(card,node=>node.tagName==='FORM'),answer=find(form,node=>node.tagName==='TEXTAREA');
  answer.value='Updated fictional scoped answer';await submit(form);
  assert.deepEqual(h.calls[0].body,{action:'memory-update',scope:memory.scope,answer:answer.value});
  const revoke=find(form,node=>node.dataset.actionToken===`memory-revoke:${memory.scope}`);await revoke.events.click();
  assert.deepEqual(h.calls[1].body,{action:'memory-revoke',scope:memory.scope});
});

test('Greenhouse settings select a restricted adapter and do not turn arbitrary origins into supported sites',()=>{
  const s=state(),h=harness(s),site={id:'new-fictional-site',name:'',origin:'https://unadapted.example.invalid',tenant:'fictional',adapter:'unsupported',mode:'real',enabled:false};
  h.app.setSettings({sites:[site]});const form=h.app.renderSettingsSite(site,0),adapter=find(form,node=>node.tagName==='SELECT');
  adapter.value='greenhouse-v1';adapter.events.change();assert.equal(site.adapter,'greenhouse-v1');assert.equal(site.mode,'real');assert.equal(site.origin,'https://job-boards.greenhouse.io');
  assert.equal(site.listUrl,'');assert.equal(site.loginUrl,'');assert.equal(site.tenant,'fictional');assert.equal(site.company,undefined,'choosing an adapter must not imply consent to the technical sample');
  const rendered=h.app.renderSettingsSite(site,0);assert.match(rendered.textContent,/job-boards\.greenhouse\.io/);assert.match(rendered.textContent,/本人确认的申请邮箱/);assert.match(rendered.textContent,/页面中的公司名称/);assert.match(rendered.textContent,/tenant=mattermost/);assert.match(rendered.textContent,/不代表岗位推荐或本人已同意投递/);
  assert.match(h.app.siteControls(site).textContent,/待适配/);assert.doesNotMatch(h.app.siteControls(site).textContent,/重新检查页面/);
  const actions=h.app.taskActions({...s.tasks[0],needsConfirmation:true,canResume:true});assert.match(actions.textContent,/确认岗位、资料与提交/);assert.doesNotMatch(actions.textContent,/重新检查并继续/);
});
test('a single observed human-selected dynamic option is confirmable without claiming complete choices',()=>{
 const h=harness({});const q={type:'text',customControl:true,optionsComplete:false,manualSelection:true,options:[{text:'Fictional selected city',disabled:false}]};
 const input=h.app.questionInput(q,'manual-observed');assert.notEqual(input.blocked,true);input.node.value='Fictional selected city';assert.equal(input.valid(),true);input.node.value='Unobserved city';assert.equal(input.valid(),false);
});
