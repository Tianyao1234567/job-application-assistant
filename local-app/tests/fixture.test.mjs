import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createFixture} from '../fixture.mjs';
import {RUNTIME} from '../paths.mjs';

const TEST_KEY='fixture-unit-test-key-'+randomUUID();
const RESUME=Buffer.from('Fictional applicant resume only.\n\x00\xff binary fixture', 'latin1');
const DIGEST=createHash('sha256').update(RESUME).digest('hex');

async function setup(t,{testMode=true}={}) {
  const dataDir=path.join(RUNTIME,'tests','fixture-'+randomUUID());
  const fixture=await createFixture({dataDir,port:0,testMode,testKey:TEST_KEY});
  t.after(async()=>{await fixture.close();fs.rmSync(dataDir,{recursive:true,force:true});});
  return fixture;
}
async function session(fixture,tenant='beta') {
  const response=await fetch(fixture.url+`/site/${tenant}/session`);
  assert.equal(response.status,200);
  return {cookie:response.headers.get('set-cookie').split(';',1)[0],login:(await response.json()).login};
}
async function login(fixture,cookie,tenant='alpha',account='demo') {
  const response=await fetch(fixture.url+`/site/${tenant}/login`,{method:'POST',redirect:'manual',headers:{Cookie:cookie,Origin:fixture.url,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({account})});
  assert.equal(response.status,303);
}
function form(tenant='beta',jobId='web-001',account='demo') {
  const value=new FormData();
  for(const [key,text] of Object.entries({tenant,jobId,account,'personal.name':'Fictional Applicant','personal.email':'fixture@example.test','personal.phone':'+8613800000000','education.0.school':'Fictional University One','education.1.school':'Fictional University Two','experience.0.company':'Fictional Company One','experience.1.company':'Fictional Company Two','projects.0.title':'Fictional Project'}))value.set(key,text);
  if(jobId==='cpp-001')value.set('motivation','This is a confirmed fictional test answer.');
  value.set('resume',new File([RESUME],'fictional-resume.txt',{type:'text/plain'}));
  return value;
}
async function submit(fixture,cookie,{tenant='beta',jobId='web-001',account='demo',body=form(tenant,jobId,account),redirect='follow'}={}) {
  return fetch(fixture.url+`/site/${tenant}/apply/${jobId}`,{method:'POST',redirect,headers:{Cookie:cookie,Origin:fixture.url},body});
}
async function testApi(fixture,route,body,key=TEST_KEY) {
  const response=await fetch(fixture.url+'/__test/'+route,{method:body?'POST':'GET',headers:{'X-Fixture-Test-Key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}

test('loopback fixture exposes real session, list, detail, form and question markers',async t=>{
  const fixture=await setup(t);
  assert.equal(fixture.server.address().address,'127.0.0.1');
  const alpha=await session(fixture,'alpha');
  assert.deepEqual(alpha.login,{status:'login',account:'',tenant:'alpha'});
  const beta=await session(fixture,'beta');
  assert.deepEqual(beta.login,{status:'ready',account:'demo',tenant:'beta'});
  const list=await (await fetch(fixture.url+'/site/alpha/jobs',{headers:{Cookie:alpha.cookie}})).text();
  assert.match(list,/data-job-id="cpp-001"/);
  assert.match(list,/data-job-id="cpp-002"/);
  const detail=await (await fetch(fixture.url+'/site/beta/jobs/web-001')).text();
  assert.match(detail,/data-apply-link href="\/site\/beta\/apply\/web-001"/);
  let html=await (await fetch(fixture.url+'/site/alpha/apply/cpp-001',{headers:{Cookie:alpha.cookie}})).text();
  assert.doesNotMatch(html,/data-application-form/);
  await login(fixture,alpha.cookie);
  html=await (await fetch(fixture.url+'/site/alpha/apply/cpp-001',{headers:{Cookie:alpha.cookie}})).text();
  assert.match(html,/data-application-form data-job-id="cpp-001" data-tenant="alpha" data-account="demo"/);
  assert.match(html,/enctype="multipart\/form-data"/);
  for(const name of ['education.0.school','education.1.school','experience.0.company','experience.1.company','projects.0.title','resume'])assert.ok(html.includes(`name="${name}"`),name);
  assert.match(html,/data-question-scope="local-v1:alpha:cpp-001:motivation:v1"/);
  assert.match(html,/name="motivation" required/);
  assert.match(html,/data-submit-application/);
  const loginPage=await (await fetch(fixture.url+'/site/alpha/login',{headers:{Cookie:alpha.cookie}})).text();
  assert.doesNotMatch(loginPage,/type="password"/);
});

test('detail metadata is sourced from the identified job and remains public before alpha login',async t=>{
  const fixture=await setup(t);
  for(const job of [
    {tenant:'alpha',id:'cpp-001',title:'C++ 开发工程师',company:'虚构甲公司',location:'上海'},
    {tenant:'beta',id:'design-001',title:'平面设计师',company:'虚构乙公司',location:'深圳'}
  ]){
    const response=await fetch(fixture.url+`/site/${job.tenant}/jobs/${job.id}`);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.ok(html.includes(`<section data-job-detail data-tenant="${job.tenant}" data-job-id="${job.id}" data-title="${job.title}" data-company="${job.company}" data-location="${job.location}">`));
    for(const [field,value] of [['title',job.title],['company',job.company],['location',job.location]])assert.ok(html.includes(`<span data-job-${field}>${value}</span>`));
    assert.ok(html.includes(`<a data-apply-link href="/site/${job.tenant}/apply/${job.id}">`));
    assert.doesNotMatch(html,/data-application-form/);
    if(job.tenant==='alpha')assert.match(html,/data-session-status="login"/);
  }
  const state=(await testApi(fixture,'state')).body;
  assert.equal(state.submitRequests.length,0);assert.equal(state.receipts.length,0);
});

test('actual multipart bytes, multi-entry fields and a SHA-256 receipt persist across restart',async t=>{
  const fixture=await setup(t);
  const {cookie}=await session(fixture);
  const response=await submit(fixture,cookie);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/data-receipt-id="[a-f0-9-]+"/);
  assert.ok(html.includes(`data-sha256="${DIGEST}"`));
  let evidence=(await testApi(fixture,'state')).body;
  assert.equal(evidence.submitRequests.length,1);
  assert.equal(evidence.submitRequests[0].accepted,true);
  assert.equal(evidence.receipts.length,1);
  const receipt=evidence.receipts[0];
  assert.equal(receipt.sha256,DIGEST);
  assert.equal(receipt.fileSize,RESUME.length);
  assert.equal(receipt.fields['education.1.school'],'Fictional University Two');
  assert.equal(receipt.fields['experience.1.company'],'Fictional Company Two');
  assert.equal(receipt.fields['projects.0.title'],'Fictional Project');
  assert.deepEqual(fs.readFileSync(path.join(fixture.dataDir,'uploads',receipt.id+'.bin')),RESUME);
  await fixture.close();
  const restored=await createFixture({dataDir:fixture.dataDir,port:0,testMode:true,testKey:TEST_KEY});
  // setup's cleanup owns the directory; close the replacement before that cleanup runs.
  t.after(()=>restored.close());
  evidence=(await testApi(restored,'state')).body;
  assert.equal(evidence.submitRequests.length,1);
  assert.equal(evidence.receipts[0].id,receipt.id);
  const check=await fetch(restored.url+'/site/beta/session',{headers:{Cookie:cookie}});
  assert.deepEqual((await check.json()).login,{status:'ready',account:'demo',tenant:'beta'});
  assert.equal(check.headers.get('set-cookie'),null);
  const verified=await (await fetch(restored.url+'/site/beta/receipt/web-001',{headers:{Cookie:cookie}})).text();
  assert.ok(verified.includes(`data-receipt-id="${receipt.id}"`));
});

test('unique tenant/job/account records reject simultaneous duplicate requests and reveal every POST',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture);
  const results=await Promise.all([submit(fixture,cookie),submit(fixture,cookie)]);
  assert.deepEqual(results.map(response=>response.status).sort(),[200,409]);
  let state=(await testApi(fixture,'state')).body;
  assert.equal(state.submitRequests.length,2);
  assert.equal(state.submitRequests.filter(request=>request.accepted).length,1);
  assert.equal(state.receipts.length,1);
  await login(fixture,cookie,'beta','other');
  assert.equal((await submit(fixture,cookie,{account:'other'})).status,200);
  state=(await testApi(fixture,'state')).body;
  assert.equal(state.submitRequests.length,3);
  assert.deepEqual(state.receipts.map(receipt=>receipt.account).sort(),['demo','other']);
});

test('lost visible receipt is backed by accepted bytes; read-only verification never adds a POST',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture);
  assert.equal((await testApi(fixture,'scenario',{tenant:'beta',jobId:'web-001',loseReceipt:true})).status,200);
  const response=await submit(fixture,cookie);
  assert.equal(response.status,200);
  assert.doesNotMatch(await response.text(),/data-receipt-id/);
  const verified=await (await fetch(fixture.url+'/site/beta/receipt/web-001',{headers:{Cookie:cookie}})).text();
  assert.match(verified,/data-receipt-id/);
  let evidence=(await testApi(fixture,'state')).body;
  assert.equal(evidence.submitRequests.length,1);
  assert.equal(evidence.receipts[0].sha256,DIGEST);
  assert.equal((await testApi(fixture,'scenario',{tenant:'beta',jobId:'web-001',hideReceipt:true})).status,200);
  assert.doesNotMatch(await (await fetch(fixture.url+'/site/beta/receipt/web-001',{headers:{Cookie:cookie}})).text(),/data-receipt-id/);
  evidence=(await testApi(fixture,'state')).body;
  assert.equal(evidence.submitRequests.length,1);
  assert.equal(evidence.receipts.length,1);
});

test('session expiry blocks submission, isolates tenants and preserves accepted result through login',async t=>{
  const fixture=await setup(t),alpha=await session(fixture,'alpha'),beta=await session(fixture);
  assert.equal((await submit(fixture,alpha.cookie,{tenant:'alpha',jobId:'cpp-002'})).status,401);
  await login(fixture,alpha.cookie);
  assert.equal((await testApi(fixture,'scenario',{tenant:'alpha',jobId:'cpp-002',expireSessionOnSubmit:true})).status,200);
  const accepted=await submit(fixture,alpha.cookie,{tenant:'alpha',jobId:'cpp-002'});
  assert.equal(accepted.status,200);
  assert.doesNotMatch(await accepted.text(),/data-receipt-id/);
  let state=await (await fetch(fixture.url+'/site/alpha/session',{headers:{Cookie:alpha.cookie}})).json();
  assert.equal(state.login.status,'expired');
  state=await (await fetch(fixture.url+'/site/beta/session',{headers:{Cookie:beta.cookie}})).json();
  assert.equal(state.login.status,'ready');
  await login(fixture,alpha.cookie);
  const receipt=await (await fetch(fixture.url+'/site/alpha/receipt/cpp-002',{headers:{Cookie:alpha.cookie}})).text();
  assert.match(receipt,/data-receipt-id/);
  const evidence=(await testApi(fixture,'state')).body;
  assert.equal(evidence.submitRequests.length,2);
  assert.equal(evidence.receipts.length,1);
  assert.equal(evidence.submitRequests[0].accepted,false);
  assert.equal(evidence.submitRequests[1].accepted,true);
});

test('a session that expires while multipart bytes arrive cannot accept an application',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture);
  const serialized=new Request(fixture.url+'/site/beta/apply/web-001',{method:'POST',body:form()});
  const bytes=Buffer.from(await serialized.arrayBuffer());
  const started=new Promise(resolve=>fixture.server.once('request',resolve));
  let request;
  const status=new Promise((resolve,reject)=>{
    request=http.request(serialized.url,{method:'POST',headers:{Cookie:cookie,Origin:fixture.url,'Content-Type':serialized.headers.get('content-type'),'Content-Length':bytes.length}},response=>{response.resume();resolve(response.statusCode);});
    request.on('error',reject);request.setTimeout(5000,()=>request.destroy(new Error('Multipart test timed out.')));
    request.write(bytes.subarray(0,50));
  });
  await started;
  try {
    assert.equal((await testApi(fixture,'session',{tenant:'beta',status:'expired',allSessions:true})).status,200);
    request.end(bytes.subarray(50));
    assert.equal(await status,401);
    const evidence=(await testApi(fixture,'state')).body;
    assert.equal(evidence.submitRequests.length,1);
    assert.equal(evidence.receipts.length,0);
  } finally {request.destroy();}
});

test('application identity, required ordinary answer, file bytes and multipart structure are validated',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture,'alpha');
  await login(fixture,cookie);
  assert.equal((await submit(fixture,cookie,{tenant:'alpha',jobId:'cpp-001',account:'other'})).status,409);
  const missingAnswer=form('alpha','cpp-001');missingAnswer.delete('motivation');
  assert.equal((await submit(fixture,cookie,{tenant:'alpha',jobId:'cpp-001',body:missingAnswer})).status,400);
  const noFile=form('alpha','cpp-001');noFile.delete('resume');
  assert.equal((await submit(fixture,cookie,{tenant:'alpha',jobId:'cpp-001',body:noFile})).status,400);
  const duplicate=form('alpha','cpp-001');duplicate.append('jobId','cpp-001');
  assert.equal((await submit(fixture,cookie,{tenant:'alpha',jobId:'cpp-001',body:duplicate})).status,400);
  const malformed=await fetch(fixture.url+'/site/alpha/apply/cpp-001',{method:'POST',headers:{Cookie:cookie,'Content-Type':'multipart/form-data; boundary=missing'},body:'not multipart'});
  assert.equal(malformed.status,400);
  let evidence=(await testApi(fixture,'state')).body;
  assert.equal(evidence.receipts.length,0);
  assert.equal(evidence.submitRequests.length,5);
  assert.equal((await submit(fixture,cookie,{tenant:'alpha',jobId:'cpp-001'})).status,200);
  evidence=(await testApi(fixture,'state')).body;
  assert.equal(evidence.receipts.length,1);
  assert.equal(evidence.receipts[0].fields.motivation,'This is a confirmed fictional test answer.');
});

test('test hooks require explicit mode and key; foreign origins and malicious hosts are refused',async t=>{
  const fixture=await setup(t);
  assert.equal((await testApi(fixture,'state',undefined,'wrong')).status,403);
  assert.equal((await testApi(fixture,'scenario',{tenant:'beta',jobId:'web-001',loseReceipt:'true'})).status,400);
  assert.equal((await fetch(fixture.url+'/site/beta/session',{headers:{Origin:'https://untrusted.example'}})).status,403);
  const foreignHostStatus=await new Promise((resolve,reject)=>{const request=http.get(fixture.url+'/site/beta/session',{headers:{Host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
  assert.equal(foreignHostStatus,403);
  const headers=await fetch(fixture.url+'/site/beta/jobs');
  assert.equal(headers.headers.get('access-control-allow-origin'),null);
  assert.equal(headers.headers.get('referrer-policy'),'same-origin','native same-origin form posts must retain their own Origin; cross-origin referrers remain suppressed');
  assert.match(headers.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const production=await setup(t,{testMode:false});
  assert.equal((await testApi(production,'state')).status,404);
  assert.equal((await testApi(production,'session',{tenant:'beta',status:'expired',allSessions:true})).status,404);
  await assert.rejects(()=>createFixture({dataDir:path.join(RUNTIME,'tests','unused'),port:0,testMode:true}),/测试密钥/);
});

test('runtime path restrictions prevent writes outside .runtime or through symlinks',async t=>{
  await assert.rejects(()=>createFixture({dataDir:'/tmp/fixture-must-not-write-'+randomUUID(),port:0}),/\.runtime/);
  const fixture=await setup(t);
  const link=path.join(fixture.dataDir,'external');
  fs.symlinkSync('/tmp',link,'dir');
  await assert.rejects(()=>createFixture({dataDir:path.join(link,'must-not-write-'+randomUUID()),port:0}),/符号链接/);
});


// Native HTTP preserves the exact Fetch Metadata under test; Node fetch may
// supply its own Sec-Fetch-Mode. This is HTTP guard coverage, not a browser run.
function metadataRequest(fixture,pathname,{method='GET',headers={},body}={}) {
  return new Promise((resolve,reject)=>{
    const request=http.request(fixture.url+pathname,{method,headers},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,text:Buffer.concat(chunks).toString('utf8')}));
      response.on('error',reject);
    });
    request.on('error',reject);request.end(body);
  });
}
const navigationHeaders={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
test('origin-less cross-site top-level GET navigation can open only fixture recruiting pages',async t=>{
  const fixture=await setup(t);
  for(const pathname of ['/site/alpha/login','/site/beta/jobs','/site/beta/jobs/web-001','/site/beta/apply/web-001','/site/beta/receipt/web-001']){
    const response=await metadataRequest(fixture,pathname,{headers:navigationHeaders});
    assert.equal(response.status,200,pathname);
    assert.equal(response.headers['access-control-allow-origin'],undefined);
    assert.match(response.headers['content-security-policy'],/frame-ancestors 'none'/);
    assert.match(response.headers['set-cookie'][0],/HttpOnly; SameSite=Strict/);
  }
  const state=(await testApi(fixture,'state')).body;
  assert.equal(state.submitRequests.length,0);assert.equal(state.receipts.length,0);
});
test('navigation exception rejects fetches, subframes, mutations, session JSON and test hooks without side effects',async t=>{
  const fixture=await setup(t),before=(await testApi(fixture,'state')).body;
  const cases=[
    ...['cors','no-cors','same-origin',''].map(mode=>({headers:{...navigationHeaders,'Sec-Fetch-Mode':mode}})),
    ...['iframe','frame','image','empty',''].map(dest=>({headers:{...navigationHeaders,'Sec-Fetch-Dest':dest}})),
    ...['POST','PUT','DELETE','OPTIONS','HEAD'].map(method=>({method,headers:navigationHeaders})),
    ...['/site/beta/session','/__test/state','/__test/session','/site/beta/login/web-001','/site/beta/apply','/site/beta/unrecognized','/'].map(pathname=>({pathname,headers:{...navigationHeaders,'X-Fixture-Test-Key':TEST_KEY}})),
    {pathname:'/__test/session',method:'POST',headers:{...navigationHeaders,'X-Fixture-Test-Key':TEST_KEY,'Content-Type':'application/json'},body:JSON.stringify({tenant:'beta',status:'expired',allSessions:true})}
  ];
  for(const entry of cases){
    const {pathname='/site/beta/jobs/web-001',...options}=entry;
    assert.equal((await metadataRequest(fixture,pathname,options)).status,403,`${options.method || 'GET'} ${pathname} ${options.headers['Sec-Fetch-Mode']}/${options.headers['Sec-Fetch-Dest']}`);
  }
  assert.deepEqual((await testApi(fixture,'state')).body,before,'all refused requests stop before sessions or application state can change');
});
test('navigation exception keeps exact Host and explicit Origin protection including null or extension origins',async t=>{
  const fixture=await setup(t),before=(await testApi(fixture,'state')).body;
  for(const Origin of ['https://untrusted.example','null','chrome-extension://'+'a'.repeat(32),fixture.url,'']){
    const response=await metadataRequest(fixture,'/site/beta/jobs/web-001',{headers:{...navigationHeaders,Origin}});
    assert.equal(response.status,403,'cross-site exception requires an absent Origin header');
  }
  const response=await metadataRequest(fixture,'/site/beta/jobs/web-001',{headers:{...navigationHeaders,Host:'untrusted.example'}});
  assert.equal(response.status,403);
  assert.deepEqual((await testApi(fixture,'state')).body,before);
});
test('same-origin session fetch keeps the actual tenant cookie and does not gain cross-site read access',async t=>{
  const fixture=await setup(t),{cookie,login:current}=await session(fixture,'alpha');
  const response=await metadataRequest(fixture,'/site/alpha/session',{headers:{Cookie:cookie,Origin:fixture.url,'Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty'}});
  assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.text).login,current);
  assert.equal(response.headers['set-cookie'],undefined);assert.equal(response.headers['access-control-allow-origin'],undefined);
  const denied=await metadataRequest(fixture,'/site/alpha/session',{headers:{Cookie:cookie,...navigationHeaders}});
  assert.equal(denied.status,403);
  const state=(await testApi(fixture,'state')).body;
  assert.equal(state.submitRequests.length,0);assert.equal(state.receipts.length,0);
});

test('reported tenant hook changes only actual test page/session observations and native login clears it',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture,'alpha');await login(fixture,cookie);
  const change=body=>testApi(fixture,'session',{tenant:'alpha',status:'ready',account:'demo',allSessions:true,...body});
  assert.equal((await change({reportedTenant:'beta'})).status,200);
  const observed=await fetch(fixture.url+'/site/alpha/session',{headers:{Cookie:cookie}});
  assert.deepEqual((await observed.json()).login,{status:'ready',account:'demo',tenant:'beta'});
  const html=await (await fetch(fixture.url+'/site/alpha/login',{headers:{Cookie:cookie}})).text();
  assert.match(html,/data-session-status="ready" data-account="demo" data-tenant="beta"/);
  assert.match(html,/action="\/site\/alpha\/login"/,'route identity is not retargeted by a reported marker');
  assert.equal((await submit(fixture,cookie,{tenant:'alpha',jobId:'cpp-002'})).status,200);
  const received=(await testApi(fixture,'state')).body.receipts;
  assert.equal(received.length,1);assert.equal(received[0].tenant,'alpha');
  assert.equal((await change({reportedTenant:null})).status,200);
  assert.equal((await (await fetch(fixture.url+'/site/alpha/session',{headers:{Cookie:cookie}})).json()).login.tenant,'alpha');
  await change({reportedTenant:'beta'});await login(fixture,cookie,'alpha','other');
  assert.deepEqual((await (await fetch(fixture.url+'/site/alpha/session',{headers:{Cookie:cookie}})).json()).login,{status:'ready',account:'other',tenant:'alpha'});
});
test('reported tenant controls require authenticated test mode and reject invalid values before changing state',async t=>{
  const fixture=await setup(t);await session(fixture,'alpha');
  const before=(await testApi(fixture,'state')).body;
  const body={tenant:'alpha',status:'ready',account:'demo',allSessions:true,reportedTenant:'beta'};
  assert.equal((await testApi(fixture,'session',body,'wrong')).status,403);
  for(const reportedTenant of ['other','',{},1,false])assert.equal((await testApi(fixture,'session',{...body,reportedTenant})).status,400);
  assert.deepEqual((await testApi(fixture,'state')).body,before);
  const production=await setup(t,{testMode:false});
  assert.equal((await testApi(production,'session',body)).status,404);
});


test('authenticated unavailable scenario returns real 410 detail/application pages without a form or application records',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture,'beta');
  const configured=await testApi(fixture,'scenario',{tenant:'beta',jobId:'web-001',unavailable:true});
  assert.equal(configured.status,200);
  for(const route of ['jobs','apply']){
    const response=await fetch(fixture.url+`/site/beta/${route}/web-001`,{headers:{Cookie:cookie}});
    assert.equal(response.status,410,route);
    const html=await response.text();
    assert.match(html,/data-page-status="unavailable"/);
    assert.match(html,/岗位已失效/);
    assert.match(html,/data-session-status="ready" data-account="demo" data-tenant="beta"/);
    assert.doesNotMatch(html,/data-application-form|data-submit-application|data-job-detail/);
    assert.equal(response.headers.get('access-control-allow-origin'),null);
    assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  }
  assert.equal((await fetch(fixture.url+'/site/beta/jobs/design-001',{headers:{Cookie:cookie}})).status,200,'other jobs remain available');
  assert.equal((await fetch(fixture.url+'/site/beta/receipt/web-001',{headers:{Cookie:cookie}})).status,200,'read-only receipt route is not made unavailable');
  assert.deepEqual((await (await fetch(fixture.url+'/site/beta/session',{headers:{Cookie:cookie}})).json()).login,{status:'ready',account:'demo',tenant:'beta'});
  const state=(await testApi(fixture,'state')).body;
  assert.equal(state.submitRequests.length,0);assert.equal(state.receipts.length,0);
  assert.equal((await testApi(fixture,'scenario',{tenant:'beta',jobId:'web-001',unavailable:false})).status,200);
  assert.equal((await fetch(fixture.url+'/site/beta/apply/web-001',{headers:{Cookie:cookie}})).status,200);
});
test('unavailable control requires authenticated test mode and keeps Host/Origin guards',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture,'beta');
  const body={tenant:'beta',jobId:'web-001',unavailable:true};
  const before=(await testApi(fixture,'state')).body;
  assert.equal((await testApi(fixture,'scenario',body,'wrong')).status,403);
  for(const unavailable of ['true',1,{},null])assert.equal((await testApi(fixture,'scenario',{...body,unavailable})).status,400);
  assert.deepEqual((await testApi(fixture,'state')).body,before);
  assert.equal((await testApi(fixture,'scenario',body)).status,200);
  assert.equal((await fetch(fixture.url+'/site/beta/apply/web-001',{headers:{Cookie:cookie,Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await metadataRequest(fixture,'/site/beta/apply/web-001',{headers:{Cookie:cookie,Host:'untrusted.example'}})).status,403);
  assert.deepEqual((await testApi(fixture,'state')).body,before,'rejected page requests do not create sessions or applications');
  const production=await setup(t,{testMode:false});
  assert.equal((await testApi(production,'scenario',body)).status,404);
  const normal=await fetch(production.url+'/site/beta/apply/web-001?unavailable=true');
  assert.equal(normal.status,200);assert.doesNotMatch(await normal.text(),/data-page-status="unavailable"/);
});


test('accepted native POST redirects to a GET result; repeated result GETs never add application POSTs',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture),requests=[];
  fixture.server.on('request',request=>requests.push({method:request.method,url:request.url}));
  const response=await submit(fixture,cookie,{redirect:'manual'});
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/site/beta/receipt/web-001');
  assert.equal(await response.text(),'');
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.match(response.headers.get('content-security-policy'),/form-action 'self'; frame-ancestors 'none'/);
  const before=(await testApi(fixture,'state')).body;
  assert.equal(before.submitRequests.length,1);assert.equal(before.submitRequests[0].accepted,true);assert.equal(before.receipts.length,1);
  for(let count=0;count<3;count++){
    const result=await fetch(fixture.url+response.headers.get('location'),{headers:{Cookie:cookie}});
    assert.equal(result.status,200);assert.match(await result.text(),/data-receipt-id=/);
  }
  const after=(await testApi(fixture,'state')).body;
  assert.deepEqual(after.submitRequests,before.submitRequests);assert.deepEqual(after.receipts,before.receipts);
  assert.equal(requests.filter(request=>request.method==='POST'&&request.url==='/site/beta/apply/web-001').length,1);
  assert.equal(requests.filter(request=>request.method==='GET'&&request.url==='/site/beta/receipt/web-001').length,3);
});

test('lost native result redirects to a stable pending GET while canonical verification retains the accepted receipt',async t=>{
  const fixture=await setup(t),{cookie}=await session(fixture);
  await testApi(fixture,'scenario',{tenant:'beta',jobId:'web-001',loseReceipt:true});
  const response=await submit(fixture,cookie,{redirect:'manual'});
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/site/beta/receipt/web-001?pending=1');
  assert.equal(await response.text(),'');
  const before=(await testApi(fixture,'state')).body;
  assert.equal(before.submitRequests.length,1);assert.equal(before.receipts.length,1);assert.equal(before.receipts[0].sha256,DIGEST);
  for(let count=0;count<2;count++){
    const pending=await fetch(fixture.url+response.headers.get('location'),{headers:{Cookie:cookie}});
    assert.equal(pending.status,200);assert.doesNotMatch(await pending.text(),/data-receipt-id=|data-application-form/);
    const canonical=await fetch(fixture.url+'/site/beta/receipt/web-001',{headers:{Cookie:cookie}});
    assert.equal(canonical.status,200);assert.match(await canonical.text(),/data-receipt-id=/);
  }
  const application=await fetch(fixture.url+'/site/beta/apply/web-001?pending=1',{headers:{Cookie:cookie}});
  assert.match(await application.text(),/data-receipt-id=/,'pending only hides the receipt result document, never changes apply semantics');
  const after=(await testApi(fixture,'state')).body;
  assert.deepEqual(after.submitRequests,before.submitRequests);assert.deepEqual(after.receipts,before.receipts);
  assert.equal((await fetch(fixture.url+'/site/beta/receipt/web-001?pending=1',{headers:{Cookie:cookie,Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await metadataRequest(fixture,'/site/beta/receipt/web-001?pending=1',{headers:{Cookie:cookie,Host:'untrusted.example'}})).status,403);
  assert.deepEqual((await testApi(fixture,'state')).body,after);
});

test('PRG keeps hidden receipt and session-expiry protection until their original conditions are corrected',async t=>{
  for(const flag of ['hideReceipt','expireSessionOnSubmit']){
    const fixture=await setup(t),{cookie}=await session(fixture);
    await testApi(fixture,'scenario',{tenant:'beta',jobId:'web-001',[flag]:true});
    const response=await submit(fixture,cookie,{redirect:'manual'});
    assert.equal(response.status,303,flag);assert.equal(response.headers.get('location'),'/site/beta/receipt/web-001',flag);
    for(let count=0;count<2;count++){
      const result=await fetch(fixture.url+response.headers.get('location'),{headers:{Cookie:cookie}});
      assert.equal(result.status,200);const html=await result.text();assert.doesNotMatch(html,/data-receipt-id=|data-application-form/);
      if(flag==='expireSessionOnSubmit')assert.match(html,/data-session-status="expired"/);
    }
    const before=(await testApi(fixture,'state')).body;
    assert.equal(before.submitRequests.length,1);assert.equal(before.receipts.length,1);assert.equal(before.receipts[0].sha256,DIGEST);
    if(flag==='hideReceipt')await testApi(fixture,'scenario',{tenant:'beta',jobId:'web-001',hideReceipt:false});
    else await login(fixture,cookie,'beta');
    const verified=await fetch(fixture.url+'/site/beta/receipt/web-001',{headers:{Cookie:cookie}});
    assert.match(await verified.text(),/data-receipt-id=/);
    const after=(await testApi(fixture,'state')).body;
    assert.deepEqual(after.submitRequests,before.submitRequests);assert.deepEqual(after.receipts,before.receipts);
  }
});
