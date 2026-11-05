import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {startGreenhouseFixture,GREENHOUSE_REPLAY} from '../greenhouse-fixture.mjs';
import {RUNTIME} from '../paths.mjs';

const TEST_KEY='greenhouse-fictional-test-'+randomUUID();
const CV=Buffer.from('Fictional Greenhouse replay resume only.\n\x00\xff','latin1');
const SHA=createHash('sha256').update(CV).digest('hex');
const TENANT=GREENHOUSE_REPLAY.tenant,JOB=GREENHOUSE_REPLAY.jobs[0].id;
const formPath=job=>`/greenhouse/${TENANT}/jobs/${job||JOB}`;
function form(overrides={}){
  const value=new FormData();
  for(const [key,text]of Object.entries({tenant:TENANT,jobId:JOB,first_name:'Fictional',last_name:'Applicant',email:'fictional@example.invalid',phone:'10000000000',country:GREENHOUSE_REPLAY.syntheticCountryChoices[0],'candidate-location':'Fictional Test City',question_1:'Explicitly confirmed fictional motivation.',...overrides}))value.set(key,text);
  value.set('resume',new File([CV],'fictional-resume.txt',{type:'text/plain'}));return value;
}
async function setup(t,{testMode=true,root}={}){
  const dataDir=root||path.join(RUNTIME,'tests','greenhouse-fixture-'+randomUUID());
  const fixture=await startGreenhouseFixture({root:dataDir,port:0,testMode,testKey:TEST_KEY});
  t.after(async()=>{await fixture.close();fs.rmSync(dataDir,{recursive:true,force:true});});return fixture;
}
const submit=(fixture,body=form(),extra={})=>fetch(fixture.url+formPath(),{method:'POST',redirect:'manual',headers:{Origin:fixture.url,...extra},body});
const rawStatus=(fixture,headers)=>new Promise((resolve,reject)=>{const request=http.get(fixture.url+formPath(),{headers},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);});

test('replay preserves observed control labels and explicitly identifies synthetic choices and requiredness',async t=>{
  const fixture=await setup(t),response=await fetch(fixture.url+formPath()),html=await response.text();
  assert.equal(response.status,200);assert.equal(fixture.server.address().address,'127.0.0.1');
  assert.match(html,/id="application_form" data-greenhouse-replay/);
  for(const id of ['first_name','last_name','email','country','phone','candidate-location','resume','cover_letter','question_1'])assert.ok(html.includes(`id="${id}"`),id);
  assert.ok(html.includes('Why are you interested in this role at Mattermost?*'));
  assert.ok(html.includes('Fictional Test Country'));assert.match(html,/data-fixture-only-required/);
  assert.match(html,/options and receipt markers are synthetic/);assert.match(html,/accept="\.pdf,\.doc,\.docx,\.txt,\.rtf"/);
  assert.deepEqual(fixture.state().submitRequests,[]);
});

test('native multipart stores actual bytes and digest; duplicate requests remain separately visible',async t=>{
  const fixture=await setup(t),submitted=await submit(fixture);
  assert.equal(submitted.status,303);const cookie=submitted.headers.get('set-cookie').split(';',1)[0];
  const location=submitted.headers.get('location');assert.equal(location,formPath()+'/receipt');
  const receipt=await fetch(fixture.url+location,{headers:{Cookie:cookie}}),html=await receipt.text();
  assert.match(html,/data-greenhouse-replay-receipt/);assert.ok(html.includes(`data-sha256="${SHA}"`));
  let state=fixture.state();assert.equal(state.receipts.length,1);assert.equal(state.submitRequests.length,1);assert.equal(state.submitRequests[0].accepted,true);
  assert.equal(state.receipts[0].fileSize,CV.length);assert.equal(state.receipts[0].sha256,SHA);assert.equal(state.receipts[0].fixtureOnly,true);
  assert.deepEqual(fs.readFileSync(path.join(fixture.dataDir,'uploads',state.receipts[0].id+'.bin')),CV);
  const duplicate=await submit(fixture,form(),{Cookie:cookie});assert.equal(duplicate.status,409);
  state=fixture.state();assert.equal(state.receipts.length,1);assert.equal(state.submitRequests.length,2);assert.equal(state.submitRequests[1].accepted,false);
});

test('lost visible result is a stable GET; canonical receipt verification and restart never replay multipart',async t=>{
  const fixture=await setup(t);fixture.setScenario(JOB,{loseReceipt:true});
  const submitted=await submit(fixture),cookie=submitted.headers.get('set-cookie').split(';',1)[0],location=submitted.headers.get('location');
  assert.equal(submitted.status,303);assert.equal(location,formPath()+'/receipt?pending=1');
  for(let count=0;count<2;count++)assert.doesNotMatch(await(await fetch(fixture.url+location,{headers:{Cookie:cookie}})).text(),/data-greenhouse-replay-receipt/);
  assert.match(await(await fetch(fixture.url+formPath()+'/receipt',{headers:{Cookie:cookie}})).text(),/data-greenhouse-replay-receipt/);
  assert.equal(fixture.state().submitRequests.length,1);
  await fixture.close();const restarted=await startGreenhouseFixture({root:fixture.dataDir,port:0,testMode:true,testKey:TEST_KEY});
  t.after(()=>restarted.close());assert.equal(restarted.state().receipts.length,1);assert.equal(restarted.state().submitRequests.length,1);
  assert.match(await(await fetch(restarted.url+formPath()+'/receipt',{headers:{Cookie:cookie}})).text(),/data-greenhouse-replay-receipt/);
  assert.equal(restarted.state().submitRequests.length,1);
});

test('wrong identity, real email and changed file/required structure cannot produce synthetic success',async t=>{
  const fixture=await setup(t);
  for(const overrides of [{jobId:'9999999'},{tenant:'other'},{email:'real-person@company.test'},{first_name:''},{country:'Unobserved real country'}]){
    const response=await submit(fixture,form(overrides));assert.ok([400,409].includes(response.status));
  }
  assert.equal(fixture.state().receipts.length,0);assert.equal(fixture.state().submitRequests.length,5);
  fixture.setScenario(JOB,{verification:true});assert.equal((await submit(fixture)).status,403);
  fixture.setScenario(JOB,{verification:false});
  const incomplete=form();incomplete.delete('resume');assert.equal((await submit(fixture,incomplete)).status,400);
  assert.equal(fixture.state().receipts.length,0);assert.ok(fixture.state().submitRequests.every(value=>!value.accepted));
});

test('Host, Origin, Fetch-Metadata and test hooks are restricted independently',async t=>{
  const fixture=await setup(t);
  assert.equal(await rawStatus(fixture,{Host:'evil.test'}),403);
  assert.equal((await submit(fixture,form(),{Origin:'https://evil.test'})).status,403);
  assert.equal((await submit(fixture,form(),{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal(fixture.state().submitRequests.length,0);
  assert.equal((await fetch(fixture.url+'/__greenhouse_test/state')).status,403);
  assert.equal((await fetch(fixture.url+'/__greenhouse_test/state',{headers:{'X-Fixture-Test-Key':TEST_KEY}})).status,200);
  const ordinary=await setup(t,{testMode:false});
  assert.equal((await fetch(ordinary.url+'/__greenhouse_test/state',{headers:{'X-Fixture-Test-Key':TEST_KEY}})).status,404);
  assert.throws(()=>ordinary.setScenario(JOB,{hideReceipt:true}),/disabled/);
  assert.throws(()=>fixture.setScenario(JOB,{unexpected:true}),/Invalid replay scenario/);
});
