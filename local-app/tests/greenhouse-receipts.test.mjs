import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {receiptScope,boundApplication,networkReceipt,registerGreenhouseReceipts} from '../../autofill-extension/greenhouse-receipts.js';
import {validNetworkReceipt} from '../greenhouse.mjs';
const bytes=Buffer.from('Fictional applicant attachment only.');
const spec={taskId:'task-fixture',profileId:'profile-fixture',tabId:7,tenant:'mattermost',jobId:'5381946008',account:'fictional@example.invalid',source:'https://job-boards.greenhouse.io/mattermost/jobs/5381946008',submitUrl:'https://boards.greenhouse.io/mattermost/jobs/5381946008',confirmationUrl:'https://job-boards.greenhouse.io/mattermost/jobs/5381946008/confirmation',replay:false,file:{name:'fictional.txt',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
const application=()=>({job_application:{email:spec.account,resume:{filename:spec.file.name,content:bytes.toString('base64')}}});
const session=()=>({spec,request:{id:'browser-request-1',startedAt:100,status:200,bound:true},confirmedAt:200});
test('production evidence can only be armed for a fixed tenant, job, applicant and file',()=>{
 assert.equal(receiptScope(spec),true);
 for(const change of [s=>s.source='https://evil.invalid/mattermost/jobs/5381946008',s=>s.submitUrl='https://boards.greenhouse.io/other/jobs/5381946008',s=>s.confirmationUrl=spec.source,s=>s.file.sha256='unknown']){const s=structuredClone(spec);change(s);assert.equal(receiptScope(s),false);}
});
test('request proof verifies actual JSON applicant and resume bytes without retaining the request body',async()=>{
 assert.equal(await boundApplication(spec,application()),true);
 const email=application();email.job_application.email='other@example.invalid';assert.equal(await boundApplication(spec,email),false);
 const changed=application();changed.job_application.resume.content=Buffer.from('Different bytes').toString('base64');assert.equal(await boundApplication(spec,changed),false);
 const renamed=application();renamed.job_application.resume.filename='other.txt';assert.equal(await boundApplication(spec,renamed),false);
 assert.equal(await boundApplication(spec,{job_application:{email:spec.account,resume:{filename:spec.file.name,url:'https://storage.invalid/unverified-reference'}}}),false);
});
test('preloaded prose, navigation, errors and unobserved status cannot become an accepted receipt',()=>{
 const valid=session();assert.ok(networkReceipt(valid));
 for(const change of [s=>s.request.status=undefined,s=>s.request.status=422,s=>s.request.bound=false,s=>s.request.error=true,s=>s.confirmedAt=null,s=>s.confirmedAt=10,s=>s.ambiguous=true]){const s=structuredClone(valid);change(s);assert.equal(networkReceipt(s),null);}
});
test('backend accepts only transport proof bound to this exact task and execution profile',()=>{
 const site={adapter:'greenhouse-v1',origin:'https://job-boards.greenhouse.io',tenant:'mattermost'},task={id:spec.taskId,jobId:spec.jobId,url:spec.source,executionProfileId:spec.profileId};
 const receipt=networkReceipt(session());assert.equal(validNetworkReceipt(site,task,receipt),true);
 for(const change of [r=>r.evidence.taskId='other',r=>r.evidence.profileId='other',r=>r.evidence.status=422,r=>r.evidence.fixture=true,r=>r.evidence.confirmationObserved=false,r=>r.evidence.submitUrl='https://boards.greenhouse.io/other/jobs/5381946008']){const r=structuredClone(receipt);change(r);assert.equal(validNetworkReceipt(site,task,r),false);}
 assert.equal(JSON.stringify(receipt).includes(bytes.toString('base64')),false);
 assert.equal(JSON.stringify(receipt).includes('g-recaptcha'),false);
});
test('real listener ordering binds a task request, excludes tokens from storage and rejects a second attempt',async()=>{
 const events={};const event=name=>({addListener:fn=>events[name]=fn});let stored={runnerTabId:1};
 const id='a'.repeat(32),url='chrome-extension://'+id+'/runner/index.html';
 const chrome={runtime:{id,getURL:()=>url,onMessage:event('message')},storage:{local:{async get(key){return {[key]:structuredClone(stored[key])};},async set(value){stored={...stored,...structuredClone(value)};}}},webRequest:{onBeforeRequest:event('before'),onCompleted:event('complete'),onErrorOccurred:event('error')},tabs:{onUpdated:event('tab')}};
 registerGreenhouseReceipts(chrome);
 const sender={id,url,tab:{id:1}},send=message=>new Promise(resolve=>events.message(message,sender,resolve));
 assert.equal((await send({type:'greenhouse-receipt-arm',spec})).ok,true);
 const app=application();app['g-recaptcha-enterprise-token']='FICTIONAL_PROVIDER_SECRET';
 const raw=new TextEncoder().encode(JSON.stringify(app)).buffer,now=Date.now()+1;
 events.before({method:'POST',tabId:8,url:spec.submitUrl,requestId:'unrelated',timeStamp:now,requestBody:{raw:[{bytes:raw}]}});
 events.before({method:'POST',tabId:7,url:spec.submitUrl,requestId:'actual',timeStamp:now,requestBody:{raw:[{bytes:raw}]}});
 events.complete({method:'POST',url:spec.submitUrl,requestId:'actual',statusCode:200});
 assert.equal((await send({type:'greenhouse-receipt-read',taskId:spec.taskId,profileId:spec.profileId})).receipt,null,'no matching confirmation navigation yet');
 events.tab(7,{url:spec.confirmationUrl},{});
 const receipt=(await send({type:'greenhouse-receipt-read',taskId:spec.taskId,profileId:spec.profileId})).receipt;
 assert.equal(receipt.id,'gh-network:actual');assert.equal(JSON.stringify(stored).includes('FICTIONAL_PROVIDER_SECRET'),false);assert.equal(JSON.stringify(stored).includes(bytes.toString('base64')),false);
 events.before({method:'POST',tabId:7,url:spec.submitUrl,requestId:'second',timeStamp:now+1,requestBody:{raw:[{bytes:raw}]}});
 assert.equal((await send({type:'greenhouse-receipt-read',taskId:spec.taskId,profileId:spec.profileId})).receipt,null);
});

test('official uploaded-reference protocol requires our completed upload, exact filename and a bounded safe URL',async()=>{
 const body={job_application:{email:spec.account,resume_url_filename:spec.file.name,resume_url:'https://boards-fixture.s3.amazonaws.com/private-fictional-resume'}};
 assert.equal(await boundApplication(spec,body),false);
 const uploaded={...spec,uploadedResumeConfirmed:true};assert.equal(await boundApplication(uploaded,body),true);
 for(const url of ['https://attacker.invalid/resume','https://user@boards-fixture.s3.amazonaws.com/resume','http://boards-fixture.s3.amazonaws.com/resume','https://boards-fixture.s3.amazonaws.com/resume?secret=value'])assert.equal(await boundApplication(uploaded,{job_application:{...body.job_application,resume_url:url}}),false);
 assert.equal(await boundApplication(uploaded,{job_application:{...body.job_application,resume_url_filename:'other.txt'}}),false);
});
