// Node VM safety coverage of the real adapter. Explicit DOM doubles do not stand
// in for the separate actual-browser replay or production acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,createHash} from 'node:crypto';

const source=await readFile(new URL('../../autofill-extension/runner/greenhouse-adapter.js',import.meta.url),'utf8');
const bytes=Buffer.from('Fictional Greenhouse resume for controlled tests only.');
const file={name:'fictional.txt',mime:'text/plain',base64:bytes.toString('base64'),size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
const expected={origin:'http://127.0.0.1:17322',tenant:'fictional',jobId:'1234567',company:'Fictional Company',expectedAccount:'person@example.invalid',replay:true,applicantConfirmed:true,profileFields:['email','phone','candidate-location']};
function gate(){let entered,release;return {entered:new Promise(resolve=>entered=resolve),ready:new Promise(resolve=>release=resolve),enter:()=>entered(),release:()=>release()};}
function harness(options={}){
  const h={writes:0,uploads:0,clicks:0,receipt:null,captcha:false,validationHook:null,links:[]};
  class Element {
    constructor(id,label,{tag='INPUT',type='text',required=false,value='',group='',accept='',choices=[]}={}){
      Object.assign(this,{id,name:id,tagName:tag,type,required,_value:value,isConnected:true,disabled:false,readOnly:false,maxLength:-1,accept,multiple:false,validity:{valid:true},dataset:{},_files:[],attrs:{},labels:[{innerText:label,textContent:label}]});
      this.options=choices.map(({text,value,disabled=false})=>({textContent:text,innerText:text,value,disabled,parentElement:{disabled:false}}));
      this.group=group?{querySelector:()=>({innerText:group,textContent:group})}:null;
    }
    get value(){return this._value;}
    set value(value){h.writes++;this._value=value;}
    get files(){return this._files;}
    set files(value){h.uploads++;this._files=value;}
    getAttribute(name){return this.attrs[name]??null;}
    getClientRects(){return [1];}
    closest(selector){if(selector.includes('[inert]'))return null;if(selector==='[role="combobox"]')return this.attrs.role==='combobox'?this:null;return this.group;}
    dispatchEvent(event){options.onEvent?.(this,event,h);}
  }
  const inputs=[
    new Element('first_name','First Name*',{required:true,value:'Fictional'}),
    new Element('last_name','Last Name*',{required:true,value:'Student'}),
    new Element('email','Email*',{required:true,type:'email',value:'person@example.invalid'}),
    new Element('phone','Phone*',{required:true,type:'tel',value:'10000000000'}),
    new Element('candidate-location','Location (City)*',{required:true,value:'Fictional Test City'}),
    new Element('country','Country*',{tag:'SELECT',type:'select-one',required:true,value:'test',choices:[{text:'Choose fixture country',value:'',disabled:true},{text:'Fictional Test Country',value:'test'}]}),
    new Element('question_1','Why are you interested in this role at Fictional Company?*',{tag:'TEXTAREA',type:'textarea',required:true}),
    new Element('resume','Attach',{type:'file',required:true,group:'Resume/CV*',accept:'.pdf,.doc,.docx,.txt,.rtf'}),
    new Element('cover_letter','Attach',{type:'file',group:'Cover Letter (optional)',accept:'.pdf,.doc,.docx,.txt,.rtf'})
  ];
  const button=new Element('submit_app','',{type:'submit'});button.innerText='Submit application';button.click=()=>{h.clicks++;options.onSubmit?.(h);};
  h.field=id=>inputs.find(input=>input.id===id);
  const form={id:'application_form',dataset:{},
    getAttribute(name){return name==='action'?'/greenhouse/fictional/jobs/1234567':name==='method'?'post':null;},
    querySelector(selector){return selector.startsWith('#')?h.field(selector.slice(1)):null;},
    querySelectorAll(selector){if(selector==='input,textarea,select')return inputs;if(selector==='input')return inputs.filter(input=>input.tagName==='INPUT');if(selector==='button[type="submit"],input[type="submit"]')return [button];return [];},
    checkValidity(){h.validationHook?.();return inputs.every(input=>!input.required||(input.type==='file'?input.files.length>0:!!input.value.trim()));}};
  h.form=form;
  const document={title:'Job Application for Fictional Engineer at Fictional Company',
    getElementById:id=>h.field(id)||null,
    querySelector(selector){if(selector==='h1')return {innerText:'Fictional Engineer',textContent:'Fictional Engineer'};return null;},
    querySelectorAll(selector){if(selector==='form')return [form];if(selector==='a[href]')return h.links;if(selector.includes('captcha')||selector.includes('verify'))return h.captcha?[{getClientRects:()=>[1],isConnected:true}]:[];if(selector==='[data-greenhouse-replay-receipt]')return h.receipt?[{dataset:h.receipt}]:[];return [];}};
  class DataTransfer{constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}}
  let waitHash=options.hashGate;h.blockNextHash=value=>{waitHash=value;};
  const page=vm.createContext({console,URL,Date,Map,Set,Array,Uint8Array,TextEncoder,File,Event,MouseEvent:Event,atob,DataTransfer,
    HTMLInputElement:Element,HTMLTextAreaElement:Element,HTMLSelectElement:Element,
    setTimeout:callback=>{queueMicrotask(callback);return 1;},
    location:{href:expected.origin+'/greenhouse/fictional/jobs/1234567'},document,
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
    crypto:{randomUUID:()=>webcrypto.randomUUID(),subtle:{async digest(...args){if(waitHash){const pending=waitHash;waitHash=null;pending.enter();await pending.ready;}return webcrypto.subtle.digest(...args);}}},
    JobFill:{guardText:value=>/authoriz|sponsor|gender/i.test(value)?'manual-sensitive':null}});
  vm.runInContext(source,page);
  const raw=page.JobGreenhouse,context=value=>({...value,confirmedAnswers:value?.confirmedAnswers||h.confirmedAnswers||[]});
  const api={read:(op,value)=>raw.read(op,context(value)),prepare:(op,value,args)=>raw.prepare(op,context(value),args),commit:(value,token)=>raw.commit(context(value),token),validateSubmit:(value,...args)=>raw.validateSubmit(context(value),...args)};
  Object.assign(h,{api,page,document,inputs,button});
  h.inspect=async context=>h.api.read('inspect',context||expected);
  h.complete=async()=>{
    h.field('question_1')._value='Confirmed fictional purpose';h.field('resume')._files=[new File([bytes],file.name,{type:file.mime})];
    const inspected=await h.inspect();h.confirmedAnswers=inspected.questions.map(question=>({...question,confirmed:true,value:question.tag==='SELECT'?h.field(question.key).options.find(option=>option.value===h.field(question.key).value).textContent:h.field(question.key).value}));
  };
  return h;
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('scope/tenant/company and applicant checks fail closed without collecting private values',async()=>{
  const h=harness();h.field('phone')._value='FICTIONAL_PRIVATE_VALUE';
  const inspected=await h.inspect();assert.equal(inspected.ok,true);assert.equal(inspected.login.identitySource,'confirmed-anonymous-applicant');
  assert.equal(JSON.stringify(inspected).includes('FICTIONAL_PRIVATE_VALUE'),false);
  assert.equal((await h.inspect({...expected,tenant:'other'})).ok,false);
  h.document.title='Job Application for Fictional Engineer at Other Company';assert.equal((await h.inspect()).kind,'account');
  h.document.title='Job Application for Fictional Engineer at Fictional Company';h.field('email')._value='other@example.invalid';assert.equal((await h.inspect()).kind,'account');
});
test('anonymous form does not become a verified session without explicit applicant confirmation',async()=>{
  const h=harness();h.field('email')._value='';
  const inspected=await h.inspect({...expected,applicantConfirmed:false});assert.equal(inspected.ok,true);assert.equal(inspected.login.status,'unknown');
  const prepared=await h.api.prepare('fillField',{...expected,applicantConfirmed:false},[inspected.layout,'email',expected.expectedAccount]);
  assert.equal(prepared.ok,false);assert.equal(h.writes,0);
});
test('profile filling and scoped answers independently reject a different applicant email before a write',async()=>{
  const h=harness();h.field('email')._value='';const context={...expected,profileFields:[]},inspected=await h.inspect(context),q=inspected.questions.find(q=>q.key==='email');
  const wrong='different@example.invalid';
  assert.equal((await h.api.prepare('fillField',context,[inspected.layout,'email',wrong])).kind,'account');
  assert.equal((await h.api.prepare('answer',context,[{...q,layout:inspected.layout,answer:wrong,confirmed:true}])).kind,'account');
  assert.equal(h.field('email').value,'');assert.equal(h.writes,0);
  assert.equal((await h.api.prepare('fillField',context,[inspected.layout,'email','PERSON@example.invalid'])).ok,true,'case-normalized pinned applicant still matches');
});
test('discovery pairs only visible locations from the same unique job container',async()=>{
  const h=harness();h.page.location.href=expected.origin+'/greenhouse/fictional';
  const location=value=>({innerText:value,textContent:value,isConnected:true,getClientRects:()=>[1]});
  function link(id,title,locations){
    const anchor={href:expected.origin+'/greenhouse/fictional/jobs/'+id,innerText:title,textContent:title};
    const container={querySelectorAll:selector=>selector==='a[href]'?[anchor]:locations};anchor.closest=()=>container;return anchor;
  }
  const withLocation=link('1234567','Fictional Engineer',[location('Fictional Test City')]),withoutLocation=link('1234568','Fictional Researcher',[]);
  const ambiguous=link('1234569','Fictional Department Job',[location('Another job location')]);
  ambiguous.closest=()=>({querySelectorAll:selector=>selector==='a[href]'?[ambiguous,withLocation]:[location('Another job location')]});
  const hidden=location('Hidden city');hidden.getClientRects=()=>[];
  h.links=[withLocation,withoutLocation,ambiguous,link('1234570','Fictional Hidden Location',[hidden])];
  const result=await h.api.read('discover',{...expected,jobId:undefined});assert.equal(result.ok,true);
  assert.deepEqual(plain(result.jobs.map(job=>({id:job.jobId,location:job.location}))),[{id:'1234567',location:'Fictional Test City'},{id:'1234568',location:''},{id:'1234569',location:''},{id:'1234570',location:''}]);
  assert.equal(h.writes,0);assert.equal(h.clicks,0);
});
test('prefilled required answers remain visible for confirmation until exact task ownership matches',async()=>{
  const h=harness(),original=await h.inspect();assert.ok(original.questions.some(q=>q.key==='first_name'&&q.alreadyPopulated));
  await h.complete();assert.equal((await h.inspect()).questions.length,0);
  h.field('last_name')._value='Unconfirmed manual surname';const changed=await h.inspect();assert.ok(changed.questions.some(q=>q.key==='last_name'));
  assert.equal((await h.api.validateSubmit(expected,changed.layout,file)).ok,false);assert.equal(h.clicks,0);
});
test('a populated optional non-profile answer cannot be transmitted without exact confirmation',async()=>{
  const h=harness();await h.complete();
  const Element=h.field('first_name').constructor;h.inputs.push(new Element('question_optional','Voluntary fictional business detail',{value:'Unconfirmed existing answer'}));
  const inspected=await h.inspect();assert.ok(inspected.questions.some(q=>q.key==='question_optional'&&!q.required));
  assert.equal((await h.api.validateSubmit(expected,inspected.layout,file)).ok,false);assert.equal(h.clicks,0);
});
test('exact original question and complete native choices are scoped and versioned',async()=>{
  const h=harness(),first=await h.inspect();
  const question=first.questions.find(question=>question.key==='question_1');
  assert.match(question.version,/^[a-f0-9]{64}$/);assert.equal(question.scope,`greenhouse-v1:fictional:1234567:question_1:${question.version}`);assert.equal(question.defaultRemember,false);
  assert.equal(question.source,expected.origin+'/greenhouse/fictional/jobs/1234567');
  h.field('country')._value='';const choices=(await h.inspect()).questions.find(question=>question.key==='country');assert.equal(choices.optionsComplete,true);assert.equal(choices.options[1].text,'Fictional Test Country');
  h.field('question_1').labels[0].innerText='Changed exact question*';assert.notEqual((await h.inspect()).questions.find(q=>q.key==='question_1').scope,question.scope);
});
test('incomplete custom choices remain manual and are never guessed',async()=>{
  const h=harness();h.field('country').attrs.role='combobox';h.field('country').tagName='INPUT';h.field('country').type='text';h.field('country')._value='';
  const inspected=await h.inspect(),question=inspected.questions.find(question=>question.key==='country');
  assert.equal(question.customControl,true);assert.equal(question.optionsComplete,false);assert.deepEqual(plain(question.options),[]);
  const prepared=await h.api.prepare('answer',expected,[{...question,layout:inspected.layout,answer:'Yes',confirmed:true}]);assert.equal(prepared.ok,false);assert.equal(h.writes,0);
});
test('one-use preparation writes only after commit and preserves edits made during authorization',async()=>{
  const h=harness();h.field('phone')._value='';const inspected=await h.inspect();
  const prepared=await h.api.prepare('fillField',expected,[inspected.layout,'phone','10000000000']);assert.equal(prepared.ok,true);assert.equal(h.writes,0);
  h.field('phone')._value='Manual takeover';assert.equal(h.api.commit(expected,prepared.token).ok,false);assert.equal(h.field('phone').value,'Manual takeover');assert.equal(h.writes,0);
  assert.equal(h.api.commit(expected,prepared.token).ok,false);
});
test('exact confirmed question answers cannot cross original text, source, purpose, or scope',async()=>{
  const h=harness(),inspected=await h.inspect(),question=inspected.questions.find(question=>question.key==='question_1');
  for(const change of [{text:'Different question'},{source:'https://example.invalid'},{purpose:'another-company'},{scope:question.scope+'other'},{confirmed:false}]){
    const prepared=await h.api.prepare('answer',expected,[{...question,layout:inspected.layout,answer:'Fictional confirmed answer',confirmed:true,...change}]);assert.equal(prepared.ok,false);
  }
  const prepared=await h.api.prepare('answer',expected,[{...question,layout:inspected.layout,answer:'Fictional confirmed answer',confirmed:true}]);assert.equal(prepared.ok,true);
  const pending=h.api.commit(expected,prepared.token);assert.equal(h.writes,1,'the authorized write precedes the first await');assert.equal((await pending).ok,true);
});
test('profile auto-fill cannot bypass sensitive question protection',async()=>{
  const h=harness();h.field('phone')._value='';h.field('phone').labels[0].innerText='Work authorization*';
  const inspected=await h.inspect();assert.equal((await h.api.prepare('fillField',expected,[inspected.layout,'phone','10000000000'])).ok,false);assert.equal(h.writes,0);
});
test('structure and option value changes between prepare and commit prevent the write',async()=>{
  const h=harness();h.field('phone')._value='';const inspected=await h.inspect();
  const prepared=await h.api.prepare('fillField',expected,[inspected.layout,'phone','10000000000']);assert.equal(prepared.ok,true);
  h.field('country').options[1].value='different-business-meaning';
  assert.equal(h.api.commit(expected,prepared.token).kind,'structure');assert.equal(h.writes,0);
});
test('upload verifies bytes and preserves an existing or replaced attachment',async()=>{
  const h=harness(),inspected=await h.inspect();
  const bad={...file,base64:Buffer.alloc(file.size).toString('base64')};assert.equal((await h.api.prepare('upload',expected,[inspected.layout,bad])).ok,false);
  const prepared=await h.api.prepare('upload',expected,[inspected.layout,file]);assert.equal(prepared.ok,true);assert.equal(h.uploads,0);
  const manual=new File(['Manual'],'manual.txt');h.field('resume')._files=[manual];
  assert.equal(h.api.commit(expected,prepared.token).ok,false);assert.equal(h.field('resume').files[0],manual);assert.equal(h.uploads,0);
});
test('upload event handlers cannot replace verified bytes and receive a trusted digest',async()=>{
  const h=harness({onEvent(node){if(node.id==='resume')node._files=[new File([Buffer.alloc(file.size)],file.name)];}}),inspected=await h.inspect();
  const prepared=await h.api.prepare('upload',expected,[inspected.layout,file]);const result=h.api.commit(expected,prepared.token);
  assert.equal(result.ok,false);assert.equal(result.sha256,undefined);
});
test('same-name same-size attachment replacement fails digest and immutable File checks',async()=>{
  const h=harness();await h.complete();const inspected=await h.inspect();
  const original=h.field('resume').files[0];h.field('resume')._files=[new File([Buffer.alloc(file.size)],file.name)];
  assert.equal((await h.api.validateSubmit(expected,inspected.layout,file)).ok,false);assert.equal(h.clicks,0);
  h.field('resume')._files=[original];assert.equal((await h.api.validateSubmit(expected,inspected.layout,file)).ok,true);
  const prepared=await h.api.prepare('submit',expected,[inspected.layout,file]);assert.equal(prepared.ok,true);
  h.field('resume')._files=[new File([bytes],file.name)];assert.equal(h.api.commit(expected,prepared.token).ok,false);assert.equal(h.clicks,0);
});
test('attachment replacement during asynchronous digest stops before a submission token exists',async()=>{
  const h=harness();await h.complete();const inspected=await h.inspect(),waiting=gate();h.blockNextHash(waiting);
  const pending=h.api.prepare('submit',expected,[inspected.layout,file]);await waiting.entered;
  h.field('resume')._files=[new File([bytes],file.name)];waiting.release();
  const result=await pending;assert.equal(result.ok,false);assert.equal(result.token,undefined);assert.equal(h.clicks,0);
});
test('a valid ordinary-field edit during attachment hashing invalidates the submission preparation',async()=>{
  const h=harness();await h.complete();const inspected=await h.inspect(),waiting=gate();h.blockNextHash(waiting);
  const pending=h.api.prepare('submit',expected,[inspected.layout,file]);await waiting.entered;
  h.field('first_name')._value='Manually changed person';waiting.release();
  const result=await pending;assert.equal(result.ok,false);assert.equal(result.token,undefined);assert.equal(h.clicks,0);
  assert.equal(JSON.stringify(result).includes('Manually changed person'),false,'private values stay in the isolated preparation');
});
test('a valid confirmed-answer edit during final authorization prevents submission',async()=>{
  const h=harness();await h.complete();const inspected=await h.inspect();
  const prepared=await h.api.prepare('submit',expected,[inspected.layout,file]);assert.equal(prepared.ok,true);
  h.field('question_1')._value='Manual answer after authorization';
  assert.equal(h.api.commit(expected,prepared.token).ok,false);assert.equal(h.clicks,0);
});
test('manual verification and unresolved attachment requiredness prevent preflight',async()=>{
  const h=harness();await h.complete();const inspected=await h.inspect();h.captcha=true;
  assert.equal((await h.api.validateSubmit(expected,inspected.layout,file)).ok,false);assert.equal(h.clicks,0);
  h.captcha=false;h.field('cover_letter').group.querySelector=()=>({innerText:'Cover Letter',textContent:'Cover Letter'});
  const changed=await h.inspect();assert.equal(changed.fields.find(field=>field.key==='cover_letter').attachmentRequirementKnown,false);
  assert.equal((await h.api.validateSubmit(expected,changed.layout,file)).ok,false);
});
test('an existing optional attachment outside the pinned resume version blocks submission',async()=>{
  const h=harness();await h.complete();h.field('cover_letter')._files=[new File(['Unconfirmed extra fictional document'],'extra.txt')];
  const inspected=await h.inspect();assert.equal((await h.api.validateSubmit(expected,inspected.layout,file)).ok,false);assert.equal(h.clicks,0);
});
test('validation handlers cannot alter structure before a submit click',async()=>{
  const h=harness();await h.complete();const inspected=await h.inspect();
  const prepared=await h.api.prepare('submit',expected,[inspected.layout,file]);assert.equal(prepared.ok,true);
  h.validationHook=()=>{h.field('question_1').labels[0].innerText='Changed during validation*';};
  assert.equal(h.api.commit(expected,prepared.token).ok,false);assert.equal(h.clicks,0);
});
test('validation handlers cannot alter confirmed field values before a submit click',async()=>{
  const h=harness();await h.complete();const inspected=await h.inspect();
  const prepared=await h.api.prepare('submit',expected,[inspected.layout,file]);assert.equal(prepared.ok,true);
  h.validationHook=()=>{h.field('first_name')._value='Different valid applicant name';};
  assert.equal(h.api.commit(expected,prepared.token).ok,false);assert.equal(h.clicks,0);
});
test('unknown results retain the form attempt and cannot click twice',async()=>{
  const h=harness();await h.complete();const inspected=await h.inspect();
  const prepared=await h.api.prepare('submit',expected,[inspected.layout,file]);assert.equal(prepared.ok,true);
  const result=await h.api.commit(expected,prepared.token);assert.equal(result.kind,'unknown');assert.equal(h.clicks,1);assert.equal(h.form.dataset.greenhouseSubmissionAttempt,'started');
  assert.equal((await h.api.prepare('submit',expected,[inspected.layout,file])).ok,false);assert.equal(h.clicks,1);
});
test('only explicitly local replay accepts synthetic matching receipts',async()=>{
  const h=harness();h.receipt={receiptId:'synthetic-1',tenant:'fictional',jobId:'1234567',account:expected.expectedAccount,fileName:file.name,fileSize:String(file.size),sha256:file.sha256};
  const result=await h.api.read('verify',expected);assert.equal(result.receipt.kind,'greenhouse-replay');
  h.receipt.jobId='7654321';assert.equal((await h.api.read('verify',expected)).ok,false);
  h.receipt.jobId='1234567';h.page.location.href='https://job-boards.greenhouse.io/fictional/jobs/1234567';
  const production=await h.api.read('verify',{...expected,origin:'https://job-boards.greenhouse.io',replay:false});assert.equal(production.ok,true);assert.equal(production.receipt,null);assert.equal(production.productionReceiptObserved,false);
});

function customControl(h,key,{selected='',values=null}={}) {
  const node=h.field(key),oldClosest=node.closest.bind(node),oldQuery=h.document.querySelectorAll.bind(h.document),oldGet=h.document.getElementById.bind(h.document);
  node.tagName='INPUT';node.type='text';node._value='';node.attrs.role='combobox';node.attrs['aria-controls']='observed-choices';
  const state={selected,opened:false,optionClicks:0};
  const wrapper={querySelector:selector=>selector==='[role="combobox"][id]'?node:null,querySelectorAll:selector=>selector==='.select__single-value'&&state.selected?[{textContent:state.selected}]:[]};
  node.closest=selector=>selector==='.select'?wrapper:oldClosest(selector);
  node.dispatchEvent=()=>{state.opened=true;};
  const choices=(values||[]).map(value=>({textContent:value,isConnected:true,getClientRects:()=>[1],getAttribute:()=>null,click(){state.selected=value;state.optionClicks++;}}));
  h.document.getElementById=id=>id==='observed-choices'&&state.opened?{querySelectorAll:()=>choices}:oldGet(id);
  const question={label:node.labels[0].textContent.replace(/\*\s*$/,''),required:true,fields:[{name:key,type:'multi_value_single_select',values:(values||[]).map((label,value)=>({label,value}))}]};
  const loader={state:{loaderData:{'routes/$url_token_.jobs_.$job_post_id':{urlToken:'fictional',jobPostId:'1234567',jobPost:{public_url:expected.origin+'/greenhouse/fictional/jobs/1234567',questions:[question]}}}}};
  h.document.querySelectorAll=selector=>selector==='script'&&values?[{textContent:'window.__remixContext = '+JSON.stringify(loader)+';'}]:oldQuery(selector);
  return state;
}
test('observed finite React Select choices open and select only after separate one-use authorizations',async()=>{
  const h=harness(),state=customControl(h,'question_1',{values:['Observed choice A','Observed choice B']});
  const inspected=await h.inspect(),q=inspected.questions.find(q=>q.key==='question_1');
  assert.equal(q.optionsComplete,true);assert.deepEqual(plain(q.options.map(o=>o.text)),['Observed choice A','Observed choice B']);
  const payload={...q,layout:inspected.layout,confirmed:true,answer:'Observed choice B'};
  const opened=await h.api.prepare('openChoice',expected,[payload]);assert.equal(opened.ok,true);assert.equal(state.opened,false);
  assert.equal(h.api.commit(expected,opened.token).ok,true);assert.equal(state.opened,true);assert.equal(state.optionClicks,0);
  const prepared=await h.api.prepare('answer',expected,[payload]);assert.equal(prepared.ok,true);assert.equal(state.optionClicks,0);
  const written=await h.api.commit(expected,prepared.token);assert.equal(written.ok,true);assert.equal(state.selected,'Observed choice B');assert.equal(state.optionClicks,1);
  assert.equal(h.api.commit(expected,prepared.token).ok,false);assert.equal(state.optionClicks,1);
});
test('human-selected dynamic country is confirmable without pretending the complete catalog was observed',async()=>{
  const h=harness(),state=customControl(h,'country',{selected:'Actual selected fictional country'}),inspected=await h.inspect();
  const q=inspected.questions.find(q=>q.key==='country');assert.equal(q.optionsComplete,false);assert.equal(q.manualSelection,true);
  assert.deepEqual(plain(q.options),[{text:state.selected,disabled:false}]);
  const payload={...q,layout:inspected.layout,confirmed:true,answer:state.selected};
  const prepared=await h.api.prepare('answer',expected,[payload]);assert.equal(prepared.ok,true);
  assert.equal((await h.api.commit(expected,prepared.token)).filled,0);assert.equal(state.optionClicks,0);
  assert.equal((await h.api.prepare('answer',expected,[{...payload,answer:'Another country'}])).ok,false);
});
test('completed CAPTCHA is observed without exposing its response, and expiry blocks again',async()=>{
  const h=harness();await h.complete();h.captcha=true;
  const before=await h.inspect();assert.equal((await h.api.validateSubmit(expected,before.layout,file)).ok,false);
  const query=h.document.querySelectorAll.bind(h.document),response={value:'FICTIONAL_PROVIDER_RESPONSE'};
  h.document.querySelectorAll=selector=>selector.startsWith('textarea[name="g-recaptcha-response"]')?[response]:query(selector);
  assert.equal((await h.api.validateSubmit(expected,before.layout,file)).ok,true);
  assert.equal(JSON.stringify(await h.inspect()).includes(response.value),false);
  response.value='';assert.equal((await h.api.validateSubmit(expected,before.layout,file)).ok,false);assert.equal(h.clicks,0);
});
