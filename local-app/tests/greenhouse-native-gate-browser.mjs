// Real product MV3, loopback native XHR/fetch and real local task service.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';
import {createApp} from '../server.mjs';
import {flowAnswers} from './fixtures/greenhouse-native-full-form.mjs';
import {fixtureOrigin,fixtureTenant,fixtureCompany,fixtureAccount,fixtureAnswers,fixtureJobs,fixtureFaultJobs,jobURL,startNativeFixture} from './fixtures/greenhouse-native-gate-fixture.mjs';

const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const BASE='http://127.0.0.1:17321';
const lifecycle=process.env.GREENHOUSE_NATIVE_GATE_LIFECYCLE==='1';
const full=process.env.GREENHOUSE_NATIVE_FULL_FLOW==='1';
const directory=await testDirectory('native-gate');
const testKey=randomBytes(24).toString('base64url');
const resume={name:'fictional-native.txt',bytes:Buffer.from('Fictional native application fixture. No actual applicant.\n')};
const sha256=createHash('sha256').update(resume.bytes).digest('hex');
const evidence={mode:'actual-product-MV3',node:process.version,checks:[],externalRequests:[],workerStarts:[]};
const workerErrors=[];
let dashboard;
if(full)evidence.flow=[];
let context,app,fixture,key,worker,revocations=0,revoked=false;
const extension=path.join(projectRoot,'autofill-extension');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const task=(state,id)=>state.tasks.find(item=>item.jobId===id);
const redact=value=>String(value).replaceAll(testKey,'[redacted]').replaceAll(key||'unused-test-key','[redacted]');
async function waitFor(label,read,ready,timeout=40000){
  const end=Date.now()+timeout;
  let value;
  while(Date.now()<end){
    value=await read();
    if(ready(value))return value;
    await delay(100);
  }
  const progress=value?.tasks?.map(item=>({jobId:item.jobId,status:item.status,phase:item.phase,issue:item.issue?.detail,steps:item.steps.slice(-3)}));
  throw new Error('Timed out '+label+' '+JSON.stringify(progress??value));
}
async function api(route,body,expectedStatus=200){
  const headers={'X-Local-Key':key,...(body?{'Content-Type':'application/json',Origin:BASE}:{})};
  const response=await fetch(BASE+'/api'+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
  const value=await response.json();
  assert.equal(response.status,expectedStatus,route+' '+(value.error||''));
  return value;
}
const state=()=>api('/state');
const action=(name,data={},status=200)=>api('/action',{action:name,...data},status);
async function connect(){
  const options=browserOptions({headless:false,timezoneId:'UTC',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  context=await chromium.launchPersistentContext(path.join(directory,'browser-profile'),options);
  const observedWorkers=[];
  context.on('serviceworker',value=>observedWorkers.push(value.url()));
  try{worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});}
  catch(error){
    evidence.workerStartup={observedWorkers,current:context.serviceWorkers().map(value=>value.url()),pages:context.pages().map(page=>page.url())};
    throw error;
  }
  assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
  evidence.workerStarts.push(new URL(worker.url()).hostname);
  evidence.chromium=context.browser().version();
  // Keep the HTTP fixture out of Playwright request interception. Its
  // application POST must use the browser's own connection and retry logic.
  context.on('request',request=>{
    const url=new URL(request.url());
    if(['http:','https:'].includes(url.protocol)&&![BASE,fixtureOrigin].includes(url.origin))
      evidence.externalRequests.push(url.origin);
  });
  await context.route('https://**/*',route=>route.abort('blockedbyclient'));
  context.on('page',page=>page.on('pageerror',error=>workerErrors.push(redact(error.message))));
  dashboard=context.pages()[0]||await context.newPage();
  await dashboard.goto(BASE);
  key=await dashboard.locator('meta[name="local-key"]').getAttribute('content');
  assert.ok(key);
  await dashboard.locator('#connect-button').click();
  return (await waitFor('actual extension pairing',state,value=>value.connection.connected&&value.connection.profileId)).connection.profileId;
}
async function configure(){
  const profile=JSON.parse(await fs.readFile(path.join(projectRoot,'autofill-extension/profile.example.json'),'utf8'));
  profile.personal.email.zh=profile.personal.email.en=fixtureAccount;
  profile.personal.location.confirmed=full;
  if(full)profile.personal.location.zh=profile.personal.location.en='Fictional Test City';
  const current=await state();
  await api('/profile',{data:profile,mode:'demo',confirmed:true,baseVersion:current.profile.version});
  await api('/resume',{name:resume.name,mime:'text/plain',base64:resume.bytes.toString('base64'),mode:'demo'});
  const board=fixtureOrigin+'/greenhouse/'+fixtureTenant;
  await api('/settings',{settings:{mode:'demo',scheduleEnabled:false,time:'09:00',dailyLimit:8,keywords:['Fictional'],cities:['Fictional Test City'],visual:true},
    sites:[{id:'native-replay',name:fixtureCompany,company:fixtureCompany,adapter:'greenhouse-replay-v1',origin:fixtureOrigin,listUrl:board,
      loginUrl:board,tenant:fixtureTenant,expectedAccount:fixtureAccount,mode:'demo',enabled:true}]});
}
async function confirm(id,expectedStatus=200){
  const current=await state(),item=task(current,id);
  return action('task-confirm',{taskId:item.id,jobId:id,profileVersion:current.profile.version,resumeVersion:current.resume.version,
    profileId:current.connection.profileId,submitConfirmed:true},expectedStatus);
}
async function run(id,afterAnswers){
  await action('add',{url:jobURL(id)});
  await confirm(id);
  await action('resume');
  const seen=[];
  for(let n=0;n<8;n++){
    const current=await waitFor('task question or result '+id,state,value=>['waiting_answer','waiting_user','failed','unknown','submitted'].includes(task(value,id)?.status));
    const item=task(current,id);
    if(item.status!=='waiting_answer'){
      assert.ok(['unknown','submitted'].includes(item.status),JSON.stringify({status:item.status,issue:item.issue,steps:item.steps.slice(-6)}));
      assert.deepEqual(seen.sort(),['first_name','last_name','question_123']);
      return item;
    }
    const question=item.question;
    assert.equal(question.source,jobURL(id));
    assert.ok(Object.hasOwn(fixtureAnswers,question.key),question.key);
    seen.push(question.key);
    await action('answer',{taskId:item.id,answer:fixtureAnswers[question.key],save:false});
    await waitFor('answer advanced',state,value=>task(value,id).status!=='waiting_answer'||task(value,id).question?.scope!==question.scope);
    if(afterAnswers&&seen.length===Object.keys(fixtureAnswers).length)return afterAnswers();
  }
  assert.fail('Repeated question '+id);
}
async function runFullForm(id){
  const url=jobURL(id);
  await dashboard.goto(BASE+'/#queue');
  await dashboard.getByLabel('岗位链接',{exact:true}).fill(url);
  await dashboard.getByRole('button',{name:'加入队列',exact:true}).click();
  const added=await waitFor('job added from the dashboard',state,value=>!!task(value,id));
  const original=task(added,id);
  await dashboard.getByRole('row').filter({hasText:original.title}).getByRole('button',{name:'查看详情',exact:true}).click();
  const approval=dashboard.getByRole('form',{name:/确认投递/});
  for(const box of await approval.getByRole('checkbox').all())await box.check();
  await approval.getByRole('button',{name:'确认本次申请并继续',exact:true}).click();
  await waitFor('job confirmed through the dashboard',state,value=>!task(value,id).needsConfirmation);
  const dialog=dashboard.locator('dialog[open]');
  if(await dialog.count())await dashboard.keyboard.press('Escape');
  await dashboard.goto(BASE+'/#overview');
  if(!(await state()).running){
    const start=dashboard.getByRole('button',{name:/^(开始投递|继续投递)$/});
    await start.click();
  }
  evidence.flow.push({id,stage:'added-and-confirmed',taskId:original.id});
  const discovered=await waitFor('full form questions or specific hold',state,value=>
    ['waiting_answer','waiting_user','failed','unknown'].includes(task(value,id)?.status));
  const current=task(discovered,id);
  evidence.flow.push({id,stage:'inspected',status:current.status,issue:current.issue?.detail,questions:current.answerBatch?.questions?.map(q=>q.key)});
  assert.equal(current.status,'waiting_answer',JSON.stringify(current.issue));
  assert.equal(current.id,original.id);
  assert.ok(!current.answerBatch.questions.some(q=>['phone','email','candidate-location','resume_text'].includes(q.key)));
  await dashboard.goto(BASE+'/#issues');
  const form=dashboard.getByRole('form',{name:'集中补充答案：'+current.title});
  await form.waitFor();
  await dashboard.reload();
  await form.waitFor();
  for(const q of current.answerBatch.questions){
    await form.getByText(q.text,{exact:true}).waitFor();
    if(!q.required&&!Object.hasOwn(flowAnswers,q.key)){
      await form.getByLabel(q.text+'：保存用途',{exact:true}).selectOption('task');
      await form.getByLabel(q.text+'：本次留空',{exact:true}).check();
      continue;
    }
    assert.ok(Object.hasOwn(flowAnswers,q.key),'Unmapped question: '+q.key);
    const control=form.getByLabel(q.text+'：答案',{exact:true});
    if(q.options.length){
      assert.deepEqual(await control.locator('option').allTextContents(),['请选择已核实的原文选项',...q.options.map(option=>option.text)]);
      await control.selectOption({label:flowAnswers[q.key]});
    }else await control.fill(flowAnswers[q.key]);
    await form.getByLabel(q.text+'：保存用途',{exact:true}).selectOption('task');
  }
  await form.getByRole('button',{name:'一次保存以上答案并继续原任务',exact:true}).click();
  const after=await waitFor('same application completes or reports a hold',state,value=>
    ['submitted','unknown','failed','waiting_user'].includes(task(value,id)?.status));
  const item=task(after,id);
  assert.equal(item.id,original.id);
  const saved=JSON.parse(await fs.readFile(path.join(directory,'data','state.json'),'utf8'));
  const savedTask=task(saved,id);
  assert.equal(savedTask.id,original.id);
  for(const question of current.answerBatch.questions){
    const answer=savedTask.answers[question.scope];
    assert.equal(answer.confirmed,true);
    assert.equal(answer.value,flowAnswers[question.key]??'');
    if(!Object.hasOwn(flowAnswers,question.key))assert.equal(answer.leaveBlank,true);
  }
  await dashboard.goto(BASE+'/#queue');
  await dashboard.reload();
  await dashboard.getByRole('row').filter({hasText:current.title}).getByRole('button',{name:'查看详情',exact:true}).click();
  const details=dashboard.getByRole('dialog');
  await details.getByText(item.status==='submitted'?'已核实提交':'结果待核实',{exact:true}).first().waitFor();
  if(item.status==='submitted')await details.getByText('提交结果依据',{exact:true}).waitFor();
  else await details.getByText('只核对，不重新提交',{exact:true}).waitFor();
  await dashboard.keyboard.press('Escape');
  const result=await waitFor('same result after dashboard refresh',state,value=>task(value,id)?.status===item.status);
  assert.equal(task(result,id).id,original.id);
  evidence.flow.push({id,stage:'saved-and-continued',status:item.status,issue:item.issue?.detail,steps:item.steps.slice(-6).map(step=>step.label)});
  return item;
}

const storage=keys=>worker.evaluate(keys=>chrome.storage.local.get(keys),keys);
function record(name,id,item){
  const counts=fixture.counts(id);
  evidence.checks.push({name,status:item.status,counts});
  console.log('PASS '+name+' '+JSON.stringify(counts));
}
async function startBackend(){
  const dataDir=path.join(directory,'data');
  if(!lifecycle&&!full)return createApp({dataDir,startFixture:false,testMode:true,testKey});
  const child=fork(fileURLToPath(new URL('./fixtures/greenhouse-native-gate-backend.mjs',import.meta.url)),[dataDir,testKey],
    {cwd:projectRoot,stdio:['ignore','inherit','inherit','ipc']});
  const handle={child,events:[],exit:null};
  child.on('message',event=>handle.events.push(event));
  child.once('exit',(code,signal)=>{handle.exit={code,signal};});
  child.once('error',error=>{handle.exit={error:error.message};});
  app=handle;
  handle.ready=await backendEvent('ready');
  assert.equal(handle.ready.pid,child.pid);
  return handle;
}
async function backendEvent(type,jobId){
  return waitFor('backend '+type,async()=>{
    assert.equal(app.exit,null,JSON.stringify(app.exit));
    return app.events.find(event=>event.type===type&&event.jobId===jobId);
  },Boolean,10000);
}
async function closeApp(){
  if(!lifecycle&&!full){
    const closing=app.close();
    app.server.closeAllConnections();
    await closing;
    app=null;
    return;
  }
  const handle=app;
  try{
    if(!handle.exit){
      handle.child.send({type:'stop'});
      await waitFor('backend process exit',async()=>handle.exit,Boolean,10000);
    }
    assert.deepEqual(handle.exit,{code:0,signal:null});
    return handle.exit;
  }finally{
    if(!handle.exit)handle.child.kill('SIGKILL');
    app=null;
  }
}

const emptyCounts={posts:0,accepted:0,confirmations:0,responseDropped:0};
async function beforeRelease(id){
  const held=await backendEvent('authorization-held',id);
  const {localSubmissionAttempts,greenhouseReceiptSessions}=await storage(['localSubmissionAttempts','greenhouseReceiptSessions']);
  const session=greenhouseReceiptSessions[held.taskId];
  const ledger=Object.values(localSubmissionAttempts).find(attempt=>attempt.taskId===held.taskId);
  const item=task(await state(),id);
  const page=context.pages().find(page=>page.url()===jobURL(id));
  assert.ok(ledger);
  assert.equal(ledger.commandId,held.commandId);
  assert.equal(item.submissionStarted,true);
  assert.equal(item.status,'submitting');
  assert.match(session.spec.nativeRequestSha256,/^[0-9a-f]{64}$/);
  assert.ok(session.spec.documentId);
  assert.equal(session.request,undefined);
  assert.equal(await page.locator('form').getAttribute('data-native-submit-calls'),'1');
  assert.deepEqual(fixture.counts(id),emptyCounts);
  return {item,page,tabId:session.spec.tabId,documentId:session.spec.documentId,bodySha256:session.spec.nativeRequestSha256};
}
async function deliverAuthorization(jobId){
  app.child.send({type:'deliver-authorization',jobId});
  return backendEvent('authorization-finished',jobId);
}
async function verifyFaults(){
  const id=fixtureFaultJobs.replaced;
  await run(id,async()=>{
    const old=await beforeRelease(id);
    await old.page.reload();
    const current=await worker.evaluate(async({tabId,documentId})=>{
      const [frame]=await chrome.scripting.executeScript({target:{tabId},func:()=>location.href});
      let oldTargetRejected=false;
      try{await chrome.scripting.executeScript({target:{tabId,documentIds:[documentId]},func:()=>location.href});}
      catch{oldTargetRejected=true;}
      return {documentId:frame.documentId,url:frame.result,oldTargetRejected};
    },{tabId:old.tabId,documentId:old.documentId});
    assert.equal(current.url,jobURL(id));
    assert.notEqual(current.documentId,old.documentId);
    assert.equal(current.oldTargetRejected,true);
    const delivered=await deliverAuthorization(id);
    assert.equal(delivered.clientDisconnected,false);
    const item=task(await waitFor('document replacement returns unknown',state,value=>task(value,id).status==='unknown'),id);
    assert.equal(await old.page.locator('form').getAttribute('data-native-submit-calls'),null);
    assert.deepEqual(fixture.counts(id),emptyCounts);
    evidence.faults.documentReplacement={sameTab:true,sameUrl:true,oldDocumentId:old.documentId,
      newDocumentId:current.documentId,oldTargetRejected:current.oldTargetRejected,authorizationDelivered:true};
    record('captured request cannot release into a replaced document',id,item);
  });

  const extensions=await context.newPage();
  await extensions.goto('chrome://extensions/');
  const extensionId=evidence.workerStarts.at(-1);
  const toggle=extensions.locator('extensions-item#'+extensionId+' #enableToggle');
  await toggle.waitFor({timeout:10000});
  assert.equal(await toggle.evaluate(element=>element.checked),true);
  await run(fixtureFaultJobs.disabled,async()=>{
    const id=fixtureFaultJobs.disabled;
    const held=await beforeRelease(id);
    const runnerUrl='chrome-extension://'+extensionId+'/runner/index.html';
    assert.ok(context.pages().some(page=>page.url()===runnerUrl),'The MV3 runner must be active before disable');
    await Promise.all([worker.waitForEvent('close',{timeout:10000}),toggle.click()]);
    await waitFor('extension is disabled and runner unloaded',async()=>
      !await toggle.evaluate(element=>element.checked)&&!context.pages().some(page=>page.url()===runnerUrl),Boolean,10000);
    const delivered=await deliverAuthorization(id);
    await held.page.bringToFront();
    await held.page.locator('form[data-native-submit-outcome="rejected"]').waitFor({timeout:22000});
    assert.equal(await held.page.locator('form').getAttribute('data-native-submit-calls'),'1');
    const item=task(await state(),id);
    assert.equal(item.submissionStarted,true);
    assert.deepEqual(fixture.counts(id),emptyCounts);
    evidence.faults.extensionDisable={enabledBefore:true,enabledAfter:false,workerClosed:true,runnerUnloaded:true,
      clientDisconnected:delivered.clientDisconnected,heldFetchRejected:true,submissionStarted:item.submissionStarted};
    record('captured request stays blocked when Chrome disables the MV3 extension',id,item);
  });
}

try{
  fixture=await startNativeFixture(directory,resume,{full});
  app=await startBackend();
  const profileId=await connect();
  await configure();
  const [normal,wrong,revokedJob,lost]=fixtureJobs;
  if(!lifecycle){
    const submitted=await (full?runFullForm(normal):run(normal));
    assert.equal(submitted.status,'submitted',JSON.stringify(submitted.steps.slice(-6)));
    assert.equal(submitted.result.sha256,sha256);
    assert.match(submitted.result.receiptId,/^gh-network:/);
    assert.deepEqual(fixture.counts(normal),{posts:1,accepted:1,confirmations:1,responseDropped:0});
    const accepted=fixture.accepted(normal),stored=await storage(['greenhouseReceiptSessions','greenhouseUploadProofs']);
    const session=stored.greenhouseReceiptSessions[submitted.id],proof=stored.greenhouseUploadProofs[submitted.id];
    assert.ok(proof.documentId);
    assert.equal(proof.tabId,submitted.tabId);
    assert.equal(proof.referenceSha256,accepted.referenceSha256);
    assert.equal(proof.sha256,sha256);
    assert.equal(session.spec.documentId,proof.documentId);
    assert.equal(session.request.nativeRequestSha256,accepted.bodySha256);
    assert.equal(session.spec.nativeRequestSha256,accepted.bodySha256);
    assert.equal(session.nativeResponse.status,200);
    assert.ok(session.confirmedAt>=session.request.startedAt);
    assert.equal(JSON.stringify(stored).includes(fixtureAccount+'-fictional-csrf'),false);
    record('one accepted native request, exact XHR File and official response/confirmation',normal,submitted);

    const denied=await (full?runFullForm(wrong):run(wrong));
    assert.equal(denied.status,'unknown');
    const deniedPage=context.pages().find(page=>page.url()===jobURL(wrong));
    assert.equal(await deniedPage.locator('form').getAttribute('data-native-submit-calls'),'1');
    assert.deepEqual(fixture.counts(wrong),{posts:0,accepted:0,confirmations:0,responseDropped:0});
    record('same-name different object rejected before native fetch release',wrong,denied);

    if(!full){
    const authorize=app.store.authorize.bind(app.store);
    app.store.authorize=body=>{
      const command=app.store.command;
      if(command?.op==='submit'&&app.store.task(command.taskId).jobId===revokedJob&&++revocations===2){
        const pause=app.store.action({action:'task-pause',taskId:command.taskId});
        assert.equal(pause.pauseOutcome,'authorization-revoked');
        revoked=true;
      }
      return authorize(body);
    };
    const paused=await run(revokedJob);
    assert.equal(paused.status,'unknown');
    assert.equal(revoked,true,'the second authorize request must reach the normal backend');
    assert.deepEqual(fixture.counts(revokedJob),{posts:0,accepted:0,confirmations:0,responseDropped:0});
    record('revoked after native request capture and before release',revokedJob,paused);
    }
  }


  const failures=[];
  context.on('requestfailed',request=>{
    if(request.method()==='POST'&&request.url()===jobURL(lost))failures.push(request.failure()?.errorText);
  });
  const unknown=await (full?runFullForm(lost):run(lost));
  assert.equal(unknown.status,'unknown');
  assert.equal(unknown.submissionStarted,true);
  const beforeRestart=fixture.counts(lost),trace=fixture.trace(lost);
  evidence.lostResponse={beforeRestart,trace,browserFailures:failures.length};
  assert.ok(beforeRestart.posts>=1);
  assert.deepEqual(beforeRestart,{posts:trace.length,accepted:1,confirmations:0,responseDropped:1});
  assert.equal(failures.length,1);
  const lostPage=context.pages().find(page=>page.url()===jobURL(lost));
  assert.equal(await lostPage.locator('form').getAttribute('data-native-submit-calls'),'1');
  const acceptedOnDisk=JSON.parse(await fs.readFile(fixture.acceptanceFile,'utf8'))[lost];
  assert.equal(acceptedOnDisk.sha256,sha256);
  assert.equal(new Set(trace.map(entry=>entry.connectionId)).size,trace.length);
  assert.ok(trace.every(entry=>entry.bodySha256===acceptedOnDisk.bodySha256));
  await context.close();
  context=null;
  const beforeBackend=app.ready;
  const exit=await closeApp();
  if(lifecycle||full){
    await assert.rejects(fetch(BASE,{signal:AbortSignal.timeout(2000)}),error=>error.cause?.code==='ECONNREFUSED');
    const saved=JSON.parse(await fs.readFile(path.join(directory,'data','state.json'),'utf8'));
    const savedTask=task(saved,lost);
    assert.equal(savedTask.id,unknown.id);
    assert.equal(savedTask.submissionStarted,true);
    assert.equal(savedTask.status,'unknown');
    evidence.backend={before:beforeBackend,exit,listenerClosed:true,sameDataDir:true,stateReadFromDisk:true};
  }
  app=await startBackend();
  if(lifecycle||full){
    assert.notEqual(app.ready.pid,beforeBackend.pid);
    assert.notEqual(app.ready.bootId,beforeBackend.bootId);
    evidence.backend.after=app.ready;
  }
  assert.equal(await connect(),profileId);
  assert.equal(evidence.workerStarts[0],evidence.workerStarts[1]);
  const {localSubmissionAttempts}=await storage('localSubmissionAttempts');
  assert.ok(Object.values(localSubmissionAttempts).some(attempt=>attempt.taskId===unknown.id&&attempt.profileId===profileId));
  await confirm(lost,400);
  await action('task-resume',{taskId:unknown.id},400);
  await action('resume');
  await action('verify',{taskId:unknown.id});
  await waitFor('verification stays unknown',state,value=>task(value,lost).steps.at(-1)?.label==='核对接收结果');
  assert.equal(task(await state(),lost).status,'unknown');
  assert.deepEqual(fixture.counts(lost),beforeRestart);
  evidence.lostResponse.afterRestart=fixture.counts(lost);
  record(lifecycle||full?'accepted response lost, independent backend/browser restart and reauthorization forbid resubmit':
    'accepted response lost, same-process backend instance rebuilt and browser restarted without resubmit',lost,unknown);
  if(lifecycle){
    evidence.faults={};
    await verifyFaults();
  }
  assert.deepEqual(evidence.externalRequests,[]);
  assert.deepEqual(workerErrors,[]);
}catch(error){
  if(worker){
    try{
      const {greenhouseReceiptSessions={}}=await storage('greenhouseReceiptSessions');
      evidence.receiptDiagnostics=Object.values(greenhouseReceiptSessions).map(session=>({
        request:session.request,confirmedAt:session.confirmedAt,nativeResponse:session.nativeResponse,ambiguous:session.ambiguous
      }));
    }catch{}
  }
  evidence.error=redact(error.stack||error.message);
  console.error(evidence.error);
  process.exitCode=1;
}finally{
  const jobs=lifecycle?[fixtureJobs[3],...Object.values(fixtureFaultJobs)]:fixtureJobs;
  if(fixture)evidence.fixture=Object.fromEntries(jobs.map(id=>[id,fixture.counts(id)]));
  evidence.pageErrors=workerErrors;
  await fs.writeFile(path.join(evidenceRoot,'greenhouse-native-gate-mv3.json'),JSON.stringify(evidence,null,2));
  await context?.close();
  if(app)await closeApp();
  await fixture?.close();
  await removeTestDirectory(directory);
}
