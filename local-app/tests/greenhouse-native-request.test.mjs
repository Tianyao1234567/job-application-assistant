import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildApplication,nativeSubmit} from './fixtures/greenhouse-native-client.js';
import {CLIENT_SHA256,createOfflineCapture,sha256} from '../experiments/greenhouse-native-request.mjs';

// Fictional values only. These tests validate an in-memory offline capture;
// they do not send, certify server acceptance or exercise a production gate.
const schema=JSON.parse(await fs.readFile(new URL('../../docs/greenhouse-mattermost-form.json',import.meta.url),'utf8'));
const clone=value=>structuredClone(value);
async function setup(verification={kind:'enterprise',value:'fictional-enterprise-assessment'}) {
  const source='http://127.0.0.1:17322/greenhouse/reference-test/jobs/1234567';
  const reference='http://127.0.0.1:17322/greenhouse-upload/exact-fictional-object';
  const file={name:'fictional.txt',size:47,sha256:await sha256('fictional attachment bytes, not actual applicant')};
  const state={first_name:'Fictional',last_name:'Applicant',email:'fictional@example.invalid',phone:'10000000000',resume:{name:file.name,url:reference}};
  for(const question of schema.questions){
    const field=question.fields[0];
    if(field.name.startsWith('question_'))state[field.name]=field.type==='multi_value_single_select'?0:'Confirmed fictional answer for '+field.name;
  }
  const application=buildApplication(schema,state,[],{},[],[],new URLSearchParams('gh_src=fictional-source&ccuid=fictional-click'));
  const expected={application,csrfToken:{key:'csrf_dynamic_fictional_43',value:'fictional-csrf-private-value'},verification,captchaFailed:true,requestToken:'fictional-request-private-value',fingerprint:'fictional-fingerprint-private-value'};
  const spec={taskId:'fictional-task',profileId:'fictional-profile',tabId:7,source,submitUrl:source,confirmationUrl:source+'/confirmation',tenant:'reference-test',jobId:'1234567',account:state.email,replay:true,file,documentId:'fictional-document',profileVersion:3,resumeVersion:4,authorizationId:'fictional-authorization',stateVersion:'fictional-state-1',clientSha256:CLIENT_SHA256,schemaSha256:await sha256(JSON.stringify(schema))};
  spec.uploadProof={rule:'greenhouse-upload-object-v1',taskId:spec.taskId,profileId:spec.profileId,tabId:spec.tabId,source,documentId:spec.documentId,fileName:file.name,fileSize:file.size,sha256:file.sha256,status:204,referenceSha256:await sha256(reference)};
  // Execute the pinned native client's real JSON constructor. The fetch stub
  // only records its arguments, never substitutes a server success response.
  let arguments_,assessments=0;
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=async(...args)=>{arguments_=args;return {offline:true};};
    const result=await nativeSubmit({application,submitPath:source,csrfToken:expected.csrfToken,fingerprint:expected.fingerprint,securityCode:verification.kind==='security-code'?verification.value:undefined,recaptchaClient:verification.kind==='enterprise'?{performAssessment:async()=>{assessments++;return verification.value;}}:undefined,captchaFailed:expected.captchaFailed,jobApplicationRequestToken:expected.requestToken});
    assert.deepEqual(result,{offline:true});
  }finally{globalThis.fetch=originalFetch;}
  const [url,init]=arguments_;
  const request={requestId:'fictional-request-1',url,method:init.method,headers:{'content-type':init.headers['Content-Type']},credentials:'same-origin',redirect:'follow',body:init.body};
  return {spec,expected,request,state,reference,assessments,create:()=>createOfflineCapture({spec,schema,expected})};
}

test('pinned native state builds the complete JSON request with dynamic CSRF, questions and enterprise verification',async()=>{
  const f=await setup();const capture=await f.create(),frozen=await capture.freeze(f.request,f.spec);
  assert.equal(f.assessments,1);
  const body=JSON.parse(frozen.request.body);
  assert.equal(body[f.expected.csrfToken.key],f.expected.csrfToken.value);
  assert.equal(body['g-recaptcha-enterprise-token'],f.expected.verification.value);
  assert.equal(body.request_token,f.expected.requestToken);assert.equal(body.fingerprint,f.expected.fingerprint);assert.equal(body.captcha_retried,true);
  assert.equal(body.job_application.resume_url,f.reference);
  assert.equal(body.job_application.answers_attributes['18195692008'].boolean_value,0);
  assert.equal(body.job_application.answers_attributes['18195689008'].text_value,f.state.question_18195689008);
  assert.deepEqual(body.job_application,f.expected.application);
  assert.equal(frozen.bodySha256,await sha256(f.request.body));
  assert.equal(await capture.revalidate(frozen,f.request,f.spec),true);
});

test('security-code and absent-verification branches retain their distinct native request semantics',async()=>{
  for(const verification of [{kind:'security-code',value:'fictional-security-code'},{kind:'none'}]){
    const f=await setup(verification),capture=await f.create(),frozen=await capture.freeze(f.request,f.spec),body=JSON.parse(frozen.request.body);
    assert.equal(f.assessments,0);assert.equal(Object.hasOwn(body,'g-recaptcha-enterprise-token'),false);
    assert.equal(Object.hasOwn(body,'security_code'),verification.kind==='security-code');
    if(verification.kind==='security-code')assert.equal(body.security_code,verification.value);
  }
});

test('capture requires the exact verified upload object and task/document/file proof',async()=>{
  for(const change of [
    f=>{f.expected.application.resume_url='http://127.0.0.1:17322/greenhouse-upload/same-name-other-object';},
    f=>{f.spec.uploadProof.referenceSha256='0'.repeat(64);},
    f=>{f.spec.uploadProof.documentId='other-document';},
    f=>{f.spec.uploadProof.taskId='other-task';},
    f=>{f.spec.uploadProof.fileSize++;},
    f=>{f.spec.uploadProof.sha256='1'.repeat(64);}
  ]){const f=await setup();change(f);await assert.rejects(f.create(),/OFFLINE_NATIVE_(?:UPLOAD_BINDING|AUTHORIZATION)/);}
});

test('changed references, extra attachments, unknown fields, unconfirmed answers and verification changes are rejected',async()=>{
  const mutations=[
    body=>{body.job_application.resume_url='http://127.0.0.1:17322/greenhouse-upload/other-object';},
    body=>{body.job_application.cover_letter_url='http://127.0.0.1:17322/greenhouse-upload/other-object';},
    body=>{body.job_application.attachments.extra_url='http://127.0.0.1:17322/greenhouse-upload/other-object';},
    body=>{body.job_application.unknown_field='unreviewed';},
    body=>{body.unknown_protocol_field='unreviewed';},
    body=>{body.job_application.answers_attributes['18195692008'].boolean_value=1;},
    body=>{delete body.job_application.answers_attributes['18195689008'];},
    body=>{body['g-recaptcha-enterprise-token']='other-assessment';},
    body=>{delete body.csrf_dynamic_fictional_43;body.csrf_dynamic_other='fictional-csrf-private-value';},
    body=>{body.request_token='other-request-token';}
  ];
  for(const mutate of mutations){const f=await setup(),capture=await f.create(),body=JSON.parse(f.request.body);mutate(body);await assert.rejects(capture.freeze({...f.request,body:JSON.stringify(body)},f.spec),/OFFLINE_NATIVE_STATE_OR_PROTOCOL_CHANGED/);}
});

test('duplicate JSON keys, malformed JSON and unsupported transport cannot produce a frozen snapshot',async()=>{
  const f=await setup();
  const bodies=['{"job_application":{},'+f.request.body.slice(1),f.request.body.slice(0,-1),'{"unexpected":true}',f.request.body+' '];
  for(const body of bodies){const capture=await f.create();await assert.rejects(capture.freeze({...f.request,body},f.spec),/OFFLINE_NATIVE_(?:JSON|STATE_OR_PROTOCOL_CHANGED)/);}
  for(const patch of [{method:'GET'},{credentials:'include'},{redirect:'manual'},{url:f.request.url+'?changed=1'},{headers:{'content-type':'application/json','x-unreviewed':'yes'}},{headers:{'content-type':'application/x-www-form-urlencoded'}},{requestId:''}]){
    const capture=await f.create();await assert.rejects(capture.freeze({...f.request,...patch},f.spec),/OFFLINE_NATIVE_(?:HEADERS|TRANSPORT|TARGET)/);
  }
});

test('every trusted context and version change invalidates capture and revalidation',async()=>{
  const f=await setup();
  const changes={taskId:'different-task',profileId:'different-profile',tabId:8,documentId:'different-document',profileVersion:4,resumeVersion:5,authorizationId:'different-authorization',stateVersion:'fictional-state-2',clientSha256:'0'.repeat(64),schemaSha256:'1'.repeat(64),jobId:'7654321',tenant:'other-tenant',account:'other@example.invalid',source:f.spec.source+'/other',submitUrl:f.spec.source+'/other',confirmationUrl:f.spec.confirmationUrl+'/other'};
  for(const [key,value] of Object.entries(changes)){
    const capture=await f.create(),frozen=await capture.freeze(f.request,f.spec),current={...f.spec,[key]:value};
    await assert.rejects(capture.revalidate(frozen,f.request,current),/OFFLINE_NATIVE_CONTEXT_CHANGED/);
    const fresh=await f.create();await assert.rejects(fresh.freeze(f.request,current),/OFFLINE_NATIVE_CONTEXT_CHANGED/);
  }
  const capture=await f.create(),frozen=await capture.freeze(f.request,f.spec),current=clone(f.spec);current.uploadProof.referenceSha256='f'.repeat(64);
  await assert.rejects(capture.revalidate(frozen,f.request,current),/OFFLINE_NATIVE_CONTEXT_CHANGED/);
});

test('same body with another request ID is a different request; forged snapshots are not recognized',async()=>{
  const f=await setup(),capture=await f.create(),frozen=await capture.freeze(f.request,f.spec);
  await assert.rejects(capture.revalidate(frozen,{...f.request,requestId:'fictional-request-2'},f.spec),/OFFLINE_NATIVE_REQUEST_CHANGED/);
  await assert.rejects(capture.revalidate(clone(frozen),f.request,f.spec),/OFFLINE_NATIVE_UNKNOWN_SNAPSHOT/);
  assert.throws(()=>capture.summary(clone(frozen)),/OFFLINE_NATIVE_UNKNOWN_SNAPSHOT/);
});

test('one capture reserves before awaits and rejects a concurrent or second freeze, including after failure',async()=>{
  const f=await setup(),capture=await f.create();
  const outcomes=await Promise.allSettled([capture.freeze(f.request,f.spec),capture.freeze(f.request,f.spec)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.match(outcomes.find(x=>x.status==='rejected').reason.message,/OFFLINE_NATIVE_CAPTURE_ALREADY_USED/);
  await assert.rejects(capture.freeze(f.request,f.spec),/OFFLINE_NATIVE_CAPTURE_ALREADY_USED/);
  const failed=await f.create();await assert.rejects(failed.freeze({...f.request,method:'GET'},f.spec),/OFFLINE_NATIVE_TRANSPORT/);
  await assert.rejects(failed.freeze(f.request,f.spec),/OFFLINE_NATIVE_CAPTURE_ALREADY_USED/);
});

test('approval inputs and frozen nested request are copied, immutable and independent of later caller mutation',async()=>{
  const f=await setup(),original=clone(f.spec),request=clone(f.request),capture=await f.create();
  f.expected.application.email='tampered@example.invalid';f.expected.csrfToken.value='tampered';f.spec.profileVersion++;
  const frozen=await capture.freeze(request,original);
  assert.equal(Object.isFrozen(frozen),true);assert.equal(Object.isFrozen(frozen.request),true);assert.equal(Object.isFrozen(frozen.request.headers),true);assert.equal(Object.isFrozen(frozen.context.uploadProof),true);
  assert.throws(()=>{frozen.request.body='tampered';},TypeError);assert.throws(()=>{frozen.context.uploadProof.referenceSha256='tampered';},TypeError);
  request.headers['content-type']='text/plain';request.body='changed';
  assert.equal(frozen.request.body,f.request.body);assert.equal(frozen.request.headers['content-type'],'application/json');
  assert.equal(await capture.revalidate(frozen,f.request,original),true);
});

test('summary exports only bounded byte count and digests, with no application, tokens or object URL',async()=>{
  const f=await setup(),capture=await f.create(),frozen=await capture.freeze(f.request,f.spec),summary=capture.summary(frozen),serialized=JSON.stringify(summary);
  assert.deepEqual(Object.keys(summary).sort(),['scope','bodySha256','requestSha256','clientSha256','schemaSha256','bytes'].sort());
  assert.equal(summary.scope,'offline-only');assert.equal(summary.bytes,new TextEncoder().encode(f.request.body).length);
  for(const key of ['bodySha256','requestSha256','clientSha256','schemaSha256'])assert.match(summary[key],/^[a-f0-9]{64}$/);
  for(const value of [f.spec.account,f.reference,f.expected.csrfToken.value,f.expected.verification.value,f.expected.requestToken,f.expected.fingerprint,f.state.first_name,f.spec.documentId,f.spec.taskId])assert.equal(serialized.includes(value),false);
  assert.equal('send' in capture,false);assert.equal('release' in capture,false);
});
