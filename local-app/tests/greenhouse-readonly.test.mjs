import test from 'node:test';
import assert from 'node:assert/strict';
import {greenhouseIdentity,preparePublicApplication} from '../../scripts/greenhouse-readonly.mjs';

// Fictional descriptors exercise the observed React/native-control distinction.
const expected={tenant:'fictional',jobId:'1234567',company:'Fictional Company'};
const field={id:'question_123',name:'question_123',tag:'INPUT',type:'text',label:'Why are you interested in this role?*',nativeRequired:false,ariaRequired:false,labelRequired:true,accept:'',empty:true,options:[],optionsComplete:false,customControl:false};
const snapshot=()=>({url:'https://job-boards.greenhouse.io/fictional/jobs/1234567?source=public',title:'Application at Fictional Company',fields:[{...field}],verificationVisible:true});

test('verified tenant/job identity excludes credentials, other hosts and paths',()=>{
  assert.equal(greenhouseIdentity(snapshot().url).jobId,'1234567');
  for(const url of ['https://job-boards.greenhouse.io.evil.test/fictional/jobs/1234567','https://user:password@job-boards.greenhouse.io/fictional/jobs/1234567','http://job-boards.greenhouse.io/fictional/jobs/1234567','https://job-boards.greenhouse.io/fictional/jobs/1234567/apply'])assert.throws(()=>greenhouseIdentity(url));
  assert.throws(()=>preparePublicApplication({...snapshot(),url:'https://job-boards.greenhouse.io/other/jobs/1234567'},expected));
  assert.throws(()=>preparePublicApplication({...snapshot(),title:'Other employer'},expected));
});
test('label asterisk and ARIA are preserved independently of native required',()=>{
  const result=preparePublicApplication(snapshot(),expected);
  assert.equal(result.fields[0].required,true);assert.equal(result.fields[0].requiredEvidence.native,false);
  const aria=snapshot();aria.fields[0]={...field,label:'Question',labelRequired:false,ariaRequired:true};assert.equal(preparePublicApplication(aria,expected).fields[0].required,true);
});
test('original question/options/source and scope version prevent changed or cross-job memory',()=>{
  const first=preparePublicApplication(snapshot(),expected).fields[0];assert.equal(first.originalQuestion,field.label);assert.equal(first.defaultRemember,false);assert.equal(first.purpose,'company-motivation');
  const changed=snapshot();changed.fields[0].options=[{text:'An observed option',disabled:false}];
  assert.notEqual(preparePublicApplication(changed,expected).fields[0].scope,first.scope);
  const other=snapshot();other.url=other.url.replace('1234567','7654321');assert.notEqual(preparePublicApplication(other,{...expected,jobId:'7654321'}).fields[0].scope,first.scope);
  assert.equal(first.nextAction,'pause-for-exact-question-confirmation');
});
test('unknown choices, unlabeled controls and existing values do not become writable',()=>{
  const input=snapshot();input.fields=[{...field,customControl:true,empty:false},{...field,id:'',name:'',label:''}];
  const result=preparePublicApplication(input,expected);assert.ok(result.fields.every(item=>item.unresolved));assert.equal(result.fields[0].alreadyPopulated,true);
  assert.equal(result.executionEnabled,false);assert.equal(result.productionSupported,false);assert.equal(result.verificationVisible,true);assert.equal(result.applicationPostsSent,0);
  assert.equal('answer' in result.fields[0],false);
});
test('large complete native choices are preserved; oversized evidence stops instead of truncating',()=>{
  const input=snapshot();input.fields[0]={...field,tag:'SELECT',type:'select-one',optionsComplete:true,options:Array.from({length:250},(_,index)=>({text:'Fictional choice '+index,disabled:false}))};
  const result=preparePublicApplication(input,expected);assert.equal(result.fields[0].options.length,250);assert.equal(result.fields[0].optionsComplete,true);
  input.fields[0].options.push(...Array.from({length:51},()=>({text:'Excess',disabled:false})));assert.throws(()=>preparePublicApplication(input,expected));
  const long=snapshot();long.fields[0].label='x'.repeat(2001);assert.throws(()=>preparePublicApplication(long,expected));
});
test('descriptor whitelist excludes input values and option extras',()=>{
  const input=snapshot();input.fields[0].value='FICTIONAL_PRIVATE_VALUE';input.fields[0].options=[{text:'Public option',disabled:false,value:'FICTIONAL_OPTION_VALUE',token:'FICTIONAL_TOKEN'}];
  const output=JSON.stringify(preparePublicApplication(input,expected));assert.equal(output.includes('FICTIONAL_'),false);assert.ok(output.includes('Public option'));
});
