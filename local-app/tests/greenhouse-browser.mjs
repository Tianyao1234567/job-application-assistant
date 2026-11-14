// Real DOM/native multipart + HTTP task chain replay. The default controlled
// driver substitutes Chrome dispatch; extension mode is separately explicit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';
import {createApp} from '../server.mjs';
import {startGreenhouseFixture,GREENHOUSE_REPLAY} from '../greenhouse-fixture.mjs';

const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const BASE='http://127.0.0.1:17321',FIXTURE='http://127.0.0.1:17322';
const isolated=await testDirectory('greenhouse'),dataDir=path.join(isolated,'data');
const testKey=randomBytes(24).toString('base64url'),results=[],blockedExternal=[],pageErrors=[],applicationPosts=[];
const CV=Buffer.from('Fictional Greenhouse replay resume. No actual applicant.\n\x00\xff','latin1');
const SHA=createHash('sha256').update(CV).digest('hex');
const mode=process.env.GREENHOUSE_BROWSER_MODE||'page-driver';
assert.ok(['page-driver','extension'].includes(mode),'Choose page-driver or extension explicitly');
const evidence={startedAt:new Date().toISOString(),scope:'Actual Chromium isolated-world DOM, real dashboard/bridge HTTP API and native multipart. Controlled Chrome dispatch is synthetic unless mode=extension. All data/options/receipts are fictional.',environment:{platform:process.platform,node:process.version,mode},limitations:['Production custom options/attachment group requiredness and receipts remain unobserved.','No employer application or personal data used.',...(mode==='page-driver'?['MV3 loading is disabled by this cloud image administrator; the controlled driver substitutes Chrome tab/storage dispatch, not form/backend logic.']:[])],results};
let fixture,app,context,dashboard,key,worker;
let driverRunning=false,driverLoop,driverHeartbeat;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const jobURL=id=>`${FIXTURE}/greenhouse/${GREENHOUSE_REPLAY.tenant}/jobs/${id}`;
const task=(state,id)=>state.tasks.find(value=>value.jobId===id);
const redact=value=>String(value).replaceAll(key||'__unused_key__','[redacted]').replaceAll(testKey,'[redacted]');
async function until(name,read,predicate,timeout=45000){
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){try{last=await read();if(predicate(last))return last;}catch{}await delay(120);}
  const diagnostic=last?.tasks?{paused:last.paused,running:last.running,connection:last.connection,tasks:last.tasks.map(t=>({jobId:t.jobId,status:t.status,phase:t.phase,question:t.question?.key,issue:t.issue?.title,steps:t.steps.slice(-3)}))}:last;
  throw new Error(`Timed out ${name}; last=${redact(JSON.stringify(diagnostic)).slice(-2500)}`);
}
async function check(name,fn){const start=Date.now();try{await fn();results.push({name,status:'PASS',durationMs:Date.now()-start});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',message:redact(error.message),durationMs:Date.now()-start});throw error;}}
async function api(route='/state',body,{allowFailure=false}={}){
  const response=await fetch(BASE+'/api'+route,{method:body?'POST':'GET',headers:{'X-Local-Key':key,...(body?{'Content-Type':'application/json',Origin:BASE}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)}),value=await response.json();
  if(!allowFailure&&(!response.ok||value.ok===false))throw new Error('Dashboard '+route+': '+response.status+' '+(value.error||'request failed'));
  return {status:response.status,...value};
}
const action=(name,details={},options)=>api('/action',{action:name,...details},options);
const state=()=>api();
const counts=id=>{const value=fixture.state(),posts=applicationPosts.filter(item=>item.jobId===id).length;assert.equal(posts,value.submitRequests.filter(item=>item.jobId===id).length,'Raw incoming multipart attempts and persisted fixture attempts must agree');return {posts,receipts:value.receipts.filter(item=>item.jobId===id).length};};
async function restartBackend(){
  const closing=app.close();
  // This controlled restart explicitly drops this test server's browser HTTP
  // keep-alive connections; it does not retest Windows process lifecycle.
  await delay(0);app.server.closeAllConnections();await closing;
  app=await createApp({dataDir,startFixture:false,testMode:true,testKey});
}
async function confirm(id){const current=await state(),item=task(current,id);return action('task-confirm',{taskId:item.id,jobId:id,profileVersion:current.profile.version,resumeVersion:current.resume.version,profileId:current.connection.profileId,submitConfirmed:true});}
async function configure(){
  const profile=JSON.parse(await fs.readFile(path.join(projectRoot,'autofill-extension/profile.example.json'),'utf8'));
  profile.personal.email.zh=profile.personal.email.en='fictional@example.invalid';
  profile.personal.location.zh=profile.personal.location.en='Fictional Test City';
  await api('/profile',{data:profile,mode:'demo',confirmed:true});
  await api('/resume',{name:'fictional-greenhouse-resume.txt',mime:'text/plain',base64:CV.toString('base64'),mode:'demo'});
  await api('/settings',{settings:{mode:'demo',scheduleEnabled:false,time:'09:00',dailyLimit:5,keywords:['Fictional'],cities:['Fictional Test City'],visual:true},sites:[{id:'greenhouse-replay',name:'Fictional Greenhouse replay',company:GREENHOUSE_REPLAY.company,adapter:'greenhouse-replay-v1',origin:FIXTURE,listUrl:`${FIXTURE}/greenhouse/${GREENHOUSE_REPLAY.tenant}`,loginUrl:`${FIXTURE}/greenhouse/${GREENHOUSE_REPLAY.tenant}`,tenant:GREENHOUSE_REPLAY.tenant,expectedAccount:'fictional@example.invalid',mode:'demo',enabled:true}]});
}
async function answerRequired(id,{expectUnknown=false,rememberMotivation=false}={}){
  const answered=[];
  for(let count=0;count<12;count++){
    const current=await until('next exact Greenhouse question/result',state,value=>{const t=task(value,id);return ['waiting_answer','submitted','unknown','waiting_user','failed'].includes(t?.status);}),item=task(current,id);
    if(['submitted','unknown'].includes(item.status)){if(expectUnknown)assert.equal(item.status,'unknown');else assert.equal(item.status,'submitted');return {item,answered};}
    assert.equal(item.status,'waiting_answer','Unexpected wait: '+JSON.stringify({status:item.status,issue:item.issue,steps:item.steps.slice(-2)}));
    const q=item.question;assert.ok(q);assert.equal(q.source,jobURL(id));assert.ok(q.scope.startsWith(`greenhouse-v1:${GREENHOUSE_REPLAY.tenant}:${id}:${q.key}:`));assert.match(q.version,/^[a-f0-9]{64}$/);assert.equal(item.profileVersion,1);assert.equal(item.resumeVersion,1);
    const answers={first_name:'Fictional',last_name:'Applicant',country:GREENHOUSE_REPLAY.syntheticCountryChoices[0],question_1:'I confirm this fictional local-only role motivation.',question_2:GREENHOUSE_REPLAY.syntheticSourceChoices[0]};
    assert.ok(Object.hasOwn(answers,q.key),'Unexpected unconfirmed question '+q.key);
    if(q.options?.length)assert.ok(q.options.some(option=>option.text===answers[q.key]&&!option.disabled));
    answered.push({key:q.key,text:q.text,scope:q.scope});
    await action('answer',{taskId:item.id,answer:answers[q.key],save:rememberMotivation&&q.key==='question_1'});
    // Wait until the pending question changes; an old state read must not answer it twice.
    await until('confirmed answer advances same task',state,value=>{const t=task(value,id);return t.status!=='waiting_answer'||t.question?.scope!==q.scope;});
  }
  throw new Error('Too many repeated Greenhouse questions');
}
async function applicationPage(id){return until('retained application tab',async()=>context.pages().find(page=>page.url().split('?')[0]===jobURL(id)),Boolean);}

// This deliberately labelled driver is test infrastructure, not a production
// fallback. It uses the actual adapter in a separate CDP execution world, the
// actual backend lease/authorize/result HTTP routes and native browser form POST.
async function startPageDriver(){
  const client={clientId:'fictional-greenhouse-client',profileId:'fictional-greenhouse-profile',extensionId:'a'.repeat(32)};
  const tabs=new Map(),taskTabs=new Map(),worlds=new WeakMap(),ledger=new Map();let nextTab=1;
  const source=await fs.readFile(path.join(projectRoot,'autofill-extension/runner/greenhouse-adapter.js'),'utf8');
  async function bridge(op,body){
    const response=await fetch(BASE+'/api/bridge/'+op,{method:'POST',headers:{Origin:'chrome-extension://'+client.extensionId,'X-Local-Key':key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('Controlled bridge '+op+' HTTP '+response.status);return response.json();
  }
  async function world(page){
    let record=worlds.get(page);
    if(record)try{await record.session.send('Runtime.evaluate',{expression:'typeof JobGreenhouse',contextId:record.contextId,returnByValue:true});return record;}catch{}
    const session=record?.session||await context.newCDPSession(page),tree=await session.send('Page.getFrameTree');
    const created=await session.send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'controlled-greenhouse-replay'});
    record={session,contextId:created.executionContextId};worlds.set(page,record);
    const injected=await session.send('Runtime.evaluate',{expression:source,contextId:record.contextId,returnByValue:true});
    if(injected.exceptionDetails)throw new Error('Controlled adapter injection failed');return record;
  }
  async function invoke(page,method,args){
    const current=await world(page),result=await current.session.send('Runtime.callFunctionOn',{functionDeclaration:'async function(method,args){return await globalThis.JobGreenhouse[method](...args)}',executionContextId:current.contextId,arguments:[{value:method},{value:args}],returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error('Controlled adapter call failed: '+result.exceptionDetails.text);return result.result.value;
  }
  async function pageFor(command,url,force=false){
    let id=command.task?.tabId||taskTabs.get(command.task?.id),page=tabs.get(id);
    if(!page||page.isClosed()){page=await context.newPage();id=nextTab++;tabs.set(id,page);if(command.task)taskTabs.set(command.task.id,id);}
    if(url&&(force||page.url()!==url)){assert.equal(new URL(url).origin,FIXTURE);await page.goto(url);}
    return {page,id};
  }
  const authorize=async command=>(await bridge('authorize',{clientId:client.clientId,commandId:command.id})).allowed===true;
  async function execute(command){
    const site=command.site,task=command.task,payload=command.payload||{};
    assert.equal(site.adapter,'greenhouse-replay-v1');assert.equal(site.origin,FIXTURE);assert.equal(site.mode,'demo');
    const mapping={'personal.email':'email','personal.phone':'phone','personal.location':'candidate-location'};
    const expected={origin:FIXTURE,replay:true,tenant:site.tenant,company:site.company,expectedAccount:site.expectedAccount,jobId:task?.jobId,applicantConfirmed:task?.applicantConfirmed===true&&task.executionProfileId===client.profileId,profileFields:(task?.confirmedProfileKeys||[]).map(key=>mapping[key]).filter(Boolean),confirmedAnswers:task?.confirmedAnswers||[]};
    if(['discover','check','open'].includes(command.op)){
      if(!await authorize(command))return {ok:false,kind:'paused'};
      const tab=await pageFor(command,command.op==='discover'?site.listUrl:site.loginUrl);
      return {...await invoke(tab.page,'read',[command.op==='open'?'check':command.op,expected]),tabId:tab.id,url:tab.page.url()};
    }
    assert.ok(task);
    let tab;
    if(command.op==='verify'){
      tab=await pageFor(command,jobURL(task.jobId)+'/receipt',true);return {...await invoke(tab.page,'read',['verify',expected]),tabId:tab.id,url:tab.page.url()};
    }
    if(ledger.has(task.id))return {ok:false,kind:'unknown',message:'Controlled durable ledger forbids another submission'};
    if(command.op==='inspect'){
      const temp=await context.newPage();
      try{await temp.goto(jobURL(task.jobId)+'/receipt');const received=await invoke(temp,'read',['verify',expected]);if(!received.ok||received.receipt)return received;}finally{await temp.close();}
      tab=await pageFor(command,task.url);return {...await invoke(tab.page,'read',['inspect',expected]),tabId:tab.id,url:tab.page.url()};
    }
    tab=await pageFor(command);
    const mutate=async(method,args)=>{
      const prepared=await invoke(tab.page,'prepare',[method,expected,args]);if(!prepared.ok||!prepared.token)return prepared;
      if(!await authorize(command))return {ok:false,kind:'paused'};
      return invoke(tab.page,'commit',[expected,prepared.token]);
    };
    const detail=result=>({...result,tabId:tab.id,url:tab.page.url()});
    if(command.op==='fill'){
      let filled=0;
      for(const entry of payload.entries){const target=mapping[entry.key];if(!target||entry.confirmed!==true)continue;const result=await mutate('fillField',[payload.layout,target,entry.value]);if(!result.ok)return detail(result);filled+=Number(result.filled)||0;}
      return detail({ok:true,filled,layout:payload.layout});
    }
    if(command.op==='upload')return detail(await mutate('upload',[payload.layout,payload.file]));
    if(command.op==='answer')return detail(await mutate('answer',[payload]));
    if(command.op==='preflight')return detail(await invoke(tab.page,'validateSubmit',[expected,payload.layout,payload.file]));
    if(command.op==='submit'){
      const prepared=await invoke(tab.page,'prepare',['submit',expected,[payload.layout,payload.file]]);if(!prepared.ok||!prepared.token)return detail(prepared);
      ledger.set(task.id,{commandId:command.id,jobId:task.jobId});await fs.writeFile(path.join(isolated,'controlled-submission-ledger.json'),JSON.stringify([...ledger]));
      if(!await authorize(command))return detail({ok:false,kind:'unknown',attempted:false});
      try{const committed=await invoke(tab.page,'commit',[expected,prepared.token]);if(committed?.receipt||committed?.attempted===false)return detail(committed);}catch{}
      for(let count=0;count<12;count++){
        try{await tab.page.waitForLoadState('domcontentloaded',{timeout:1500});const received=await invoke(tab.page,'read',['verify',expected]);if(received.ok&&received.receipt)return detail(received);}catch{}
        await delay(180);
      }
      return detail({ok:false,kind:'unknown',message:'Native POST result has no reliable synthetic receipt'});
    }
    throw new Error('Unexpected controlled command '+command.op);
  }
  await bridge('heartbeat',client);driverRunning=true;
  driverHeartbeat=setInterval(()=>{if(driverRunning)bridge('heartbeat',client).catch(()=>{});},1000);
  driverLoop=(async()=>{while(driverRunning){try{const next=await bridge('poll',client);if(next.command){let result;try{result=await execute(next.command);}catch(error){result={ok:false,kind:next.command.op==='submit'?'unknown':'failure',message:redact(error.message)};}await bridge('result',{clientId:client.clientId,commandId:next.command.id,result});}}catch{}await delay(75);}})();
}

try{
  fixture=await startGreenhouseFixture({root:path.join(isolated,'fixture'),port:17322,testMode:true,testKey});
  fixture.server.on('request',request=>{const url=new URL(request.url,FIXTURE),match=/^\/greenhouse\/([a-z0-9_-]+)\/jobs\/(\d+)$/.exec(url.pathname);if(request.method==='POST'&&match)applicationPosts.push({tenant:match[1],jobId:match[2]});});
  app=await createApp({dataDir,startFixture:false,testMode:true,testKey});
  const extension=path.join(projectRoot,'autofill-extension');
  context=await chromium.launchPersistentContext(path.join(isolated,'browser-profile'),browserOptions({headless:true,...(mode==='extension'?{args:['--disable-extensions-except='+extension,'--load-extension='+extension]}:{})}));
  evidence.environment.browser=context.browser().version();
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(['http:','https:'].includes(url.protocol)&&![BASE,FIXTURE].includes(url.origin)){blockedExternal.push({origin:url.origin,method:route.request().method()});return route.abort('blockedbyclient');}
    return route.continue();
  });
  context.on('page',page=>page.on('pageerror',error=>pageErrors.push(redact(error.message))));
  if(mode==='extension'){
    worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
    assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);evidence.environment.extensionId=new URL(worker.url()).hostname;
  }
  dashboard=context.pages()[0]||await context.newPage();
  await dashboard.goto(BASE);key=await dashboard.locator('meta[name="local-key"]').getAttribute('content');
  assert.ok(key);
  if(mode==='extension')await dashboard.locator('#connect-button').click();else await startPageDriver();
  await until('execution client heartbeat',state,value=>value.connection.connected&&value.connection.profileId);
  await configure();

  const first=GREENHOUSE_REPLAY.jobs[0].id;
  fixture.setScenario(first,{sourceQuestion:true});
  await check('unconfirmed Greenhouse task cannot fill or attach; manual links deduplicate stable job identity',async()=>{
    await action('discover');
    const discovered=await until('actual tenant-scoped DOM discovery',state,value=>task(value,first)&&value.sites[0].lastDiscoveryCount===3);
    assert.equal(task(discovered,first).location,'Fictional Test City');assert.equal(task(discovered,first).company,GREENHOUSE_REPLAY.company);assert.equal(task(discovered,first).source,'自动发现');
    const added=await action('add',{url:jobURL(first)+'?source=fictional'}),duplicate=await action('add',{url:jobURL(first)+'?other=fictional'});
    assert.equal(duplicate.duplicate,true);assert.equal(added.task.id,duplicate.task.id);
    await action('resume');await delay(1500);
    const current=await state(),item=task(current,first);assert.equal(item.status,'waiting_user');assert.equal(item.needsConfirmation,true);assert.deepEqual(counts(first),{posts:0,receipts:0});
    assert.equal(context.pages().some(page=>page.url().split('?')[0]===jobURL(first)),false);
  });
  let originalTaskId,originalProfileId;
  await check('isolated-world adapter fills confirmed facts and File, then persists original scoped question and task across backend restart',async()=>{
    await confirm(first);
    const waiting=await until('first required question',state,value=>task(value,first)?.status==='waiting_answer'),item=task(waiting,first),page=await applicationPage(first);
    originalTaskId=item.id;originalProfileId=waiting.connection.profileId;
    assert.equal(item.question.key,'first_name');assert.equal(await page.inputValue('#email'),'fictional@example.invalid');assert.equal(await page.inputValue('#phone'),'10000000000');assert.equal(await page.inputValue('#candidate-location'),'Fictional Test City');
    assert.equal(await page.locator('#resume').evaluate(node=>node.files[0]?.name),'fictional-greenhouse-resume.txt');
    assert.equal(await page.locator('#resume').evaluate(async node=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await node.files[0].arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('')),SHA);
    assert.equal(item.profileVersion,1);assert.equal(item.resumeVersion,1);assert.ok(item.questions.length>=5);assert.deepEqual(counts(first),{posts:0,receipts:0});
    const originalScope=item.question.scope;
    await restartBackend();
    const recovered=await until('same execution profile reconnects',state,value=>value.connection.connected&&value.connection.profileId===originalProfileId),same=task(recovered,first);
    assert.equal(same.id,originalTaskId);assert.equal(same.status,'waiting_answer');assert.equal(same.question.scope,originalScope);assert.equal(same.profileVersion,1);assert.equal(same.resumeVersion,1);
    assert.equal(await page.inputValue('#email'),'fictional@example.invalid');assert.equal(await page.locator('#resume').evaluate(node=>node.files.length),1);
    assert.equal(recovered.paused,true,'Graceful backend shutdown preserves an explicit hold');await action('resume');
  });
  await check('multiple exact questions resume the same task; one multipart receives locked bytes and a distinct synthetic receipt',async()=>{
    const {item,answered}=await answerRequired(first,{rememberMotivation:true});
    assert.equal(item.id,originalTaskId);assert.deepEqual(answered.map(value=>value.key),['first_name','last_name','country','question_1','question_2']);
    assert.deepEqual(counts(first),{posts:1,receipts:1});
    const received=fixture.state().receipts.find(value=>value.jobId===first);
    assert.equal(received.sha256,SHA);assert.equal(received.fileSize,CV.length);assert.equal(received.fields.question_1,'I confirm this fictional local-only role motivation.');
    assert.equal(item.result.sha256,SHA);assert.match(item.result.evidence,/合成回执/);
    const current=await state();assert.equal(current.answers.length,1);assert.equal(current.answers[0].key,'question_1');assert.equal(current.answers[0].source,jobURL(first));
    const page=context.pages().find(page=>page.url().startsWith(jobURL(first)+'/receipt'));assert.ok(page);await page.reload();await action('verify',{taskId:item.id});
    await until('read-only receipt recheck',state,value=>task(value,first)?.status==='submitted');
    assert.deepEqual(counts(first),{posts:1,receipts:1});
  });
  await check('remembered answer can be viewed, edited and revoked without replaying a submitted application',async()=>{
    let current=await state(),memory=current.answers[0];assert.ok(memory);
    await action('memory-update',{scope:memory.scope,answer:'Edited explicitly fictional scoped answer.'});
    current=await state();assert.equal(current.answers[0].value,'Edited explicitly fictional scoped answer.');
    await action('memory-revoke',{scope:memory.scope});current=await state();assert.equal(current.answers.length,0);assert.deepEqual(counts(first),{posts:1,receipts:1});
  });

  const second=GREENHOUSE_REPLAY.jobs[1].id;
  fixture.setScenario(second,{loseReceipt:true,hideReceipt:true});
  await check('accepted application with lost receipt remains unknown across reconnect and cannot resend',async()=>{
    await action('add',{url:jobURL(second)});await confirm(second);
    const {item}=await answerRequired(second,{expectUnknown:true});assert.equal(item.submissionStarted,true);assert.equal(item.canResume,false);assert.deepEqual(counts(second),{posts:1,receipts:1});
    const cannotResume=await action('task-resume',{taskId:item.id},{allowFailure:true});assert.equal(cannotResume.ok,false);
    await action('pause');await restartBackend();
    await until('profile heartbeat after unknown restart',state,value=>value.connection.connected&&value.connection.profileId===originalProfileId);
    await action('verify',{taskId:item.id});await delay(2200);
    const unknown=task(await state(),second);assert.equal(unknown.status,'unknown');assert.equal(unknown.canResume,false);assert.deepEqual(counts(second),{posts:1,receipts:1});
    fixture.setScenario(second,{hideReceipt:false});await action('verify',{taskId:item.id});
    await until('canonical synthetic receipt resolves unknown',state,value=>task(value,second)?.status==='submitted');
    assert.deepEqual(counts(second),{posts:1,receipts:1});
  });
  const third=GREENHOUSE_REPLAY.jobs[2].id;
  await check('actual browser company, original-value, changed-question and version guards stop unsafe continuation',async()=>{
    fixture.setScenario(third,{wrongIdentity:true});
    await action('add',{url:jobURL(third)});await confirm(third);await action('resume');
    let current=await until('wrong company is held',state,value=>task(value,third)?.status==='waiting_user'&&task(value,third)?.issue?.kind==='account'),item=task(current,third),page=await applicationPage(third);
    assert.equal(await page.inputValue('#email'),'');assert.deepEqual(counts(third),{posts:0,receipts:0});
    fixture.setScenario(third,{wrongIdentity:false});await page.reload();
    await page.fill('#phone','19999999999');await action('task-resume',{taskId:item.id});
    current=await until('original phone is preserved',state,value=>task(value,third)?.status==='waiting_user'&&task(value,third)?.issue?.kind==='manual');
    assert.equal(await page.inputValue('#phone'),'19999999999');assert.deepEqual(counts(third),{posts:0,receipts:0});
    await page.fill('#phone','');await action('task-resume',{taskId:item.id});
    current=await until('unchanged first-name question',state,value=>task(value,third)?.status==='waiting_answer');item=task(current,third);
    const originalScope=item.question.scope;assert.equal(item.question.key,'first_name');
    await page.locator('label[for="first_name"]').evaluate(node=>{node.textContent='First Name changed on fixture*';});
    await action('answer',{taskId:item.id,answer:'Fictional'});
    current=await until('changed question requires a new exact confirmation',state,value=>task(value,third)?.status==='waiting_answer'&&task(value,third)?.question?.scope!==originalScope);item=task(current,third);
    assert.equal(item.question.key,'first_name');assert.match(item.question.text,/changed on fixture/);assert.equal(await page.inputValue('#first_name'),'');
    assert.equal(item.id,task(current,third).id);assert.deepEqual(counts(third),{posts:0,receipts:0});
    await api('/profile',{data:current.profile.data,mode:'demo',confirmed:true});
    await api('/resume',{name:'fictional-greenhouse-resume-v2.txt',mime:'text/plain',base64:Buffer.concat([CV,Buffer.from(' revised fixture version')]).toString('base64'),mode:'demo'});
    const staleAnswer=await action('answer',{taskId:item.id,answer:'Fictional'},{allowFailure:true});assert.equal(staleAnswer.ok,false);
    current=await until('changed profile and attachment require reconfirmation',state,value=>task(value,third)?.status==='waiting_user'&&task(value,third)?.needsConfirmation===true);item=task(current,third);
    assert.equal(current.profile.version,2);assert.equal(current.resume.version,2);assert.equal(item.profileVersion,1);assert.equal(item.resumeVersion,1);assert.equal(item.issue.kind,'confirmation');
    assert.equal(await page.inputValue('#first_name'),'');assert.deepEqual(counts(third),{posts:0,receipts:0});
  });
  assert.deepEqual(blockedExternal,[],'No real-site requests should be needed for local replay');
  assert.deepEqual(pageErrors,[]);evidence.finishedAt=new Date().toISOString();evidence.fixture={receipts:fixture.state().receipts.length,actualApplicationPosts:applicationPosts.length,persistedAttempts:fixture.state().submitRequests.length};
}catch(error){
  evidence.error=redact(error.stack||error.message);throw error;
}finally{
  evidence.finishedAt ||= new Date().toISOString();evidence.pageErrors=pageErrors;evidence.blockedExternal=blockedExternal;evidence.applicationPosts=applicationPosts;
  if(app?.store)evidence.finalTasks=app.store.snapshot().tasks.map(value=>({id:value.id,jobId:value.jobId,status:value.status,phase:value.phase,issue:value.issue?.title,steps:value.steps.slice(-4)}));
  await fs.writeFile(path.join(evidenceRoot,'greenhouse-browser.json'),JSON.stringify(evidence,null,2));
  driverRunning=false;clearInterval(driverHeartbeat);await context?.close();await driverLoop;await app?.close();await fixture?.close();await removeTestDirectory(isolated);
}
