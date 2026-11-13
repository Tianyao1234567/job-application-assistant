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

// The existing hosted startup job runs this entry point. Select a separate
// fictional suite only when its pushed commit explicitly requests it.
if(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_WORKFLOW==='Fictional MV3 answer startup diagnostic'){
  const {execFileSync}=await import('node:child_process');
  const subject=execFileSync('git',['log','-1','--format=%s'],{cwd:projectRoot,encoding:'utf8'});
  if(subject.includes('[native-gate]')||subject.includes('[native-gate-lifecycle]')||subject.includes('[native-full-flow]')){
    if(subject.includes('[native-gate-lifecycle]'))process.env.GREENHOUSE_NATIVE_GATE_LIFECYCLE='1';
    if(subject.includes('[native-full-flow]'))process.env.GREENHOUSE_NATIVE_FULL_FLOW='1';
    if(subject.includes('[confirmation-purpose]'))process.env.GREENHOUSE_CONFIRMATION_PURPOSE='1';
    await import('./greenhouse-native-gate-browser.mjs');
    const report=JSON.parse(await fs.readFile(path.join(evidenceRoot,'greenhouse-native-gate-mv3.json'),'utf8'));
    const summary={environment:{mode:report.mode,node:report.node,browser:report.chromium},results:report.checks,
      fixture:report.fixture,lostResponse:report.lostResponse,backend:report.backend,faults:report.faults,flow:report.flow,inspection:report.inspection,
      error:report.error,receiptDiagnostics:report.receiptDiagnostics};
    console.log('Native gate evidence '+JSON.stringify(summary));
    await fs.writeFile(path.join(evidenceRoot,'greenhouse-answer-mv3-browser.json'),JSON.stringify(summary,null,2));
    process.exit(process.exitCode??0);
  }
}

const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const BASE='http://127.0.0.1:17321',FIXTURE='http://127.0.0.1:17322';
const isolated=await testDirectory('greenhouse-answer-ui'),dataDir=path.join(isolated,'data');
const testKey=randomBytes(24).toString('base64url'),results=[],blockedExternal=[],pageErrors=[],applicationPosts=[],importRequests=[];
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
  const current=await state();
  await api('/profile',{data:profile,mode:'demo',confirmed:true,baseVersion:current.profile.version});
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
    const entries=(task?.confirmedProfileEntries||[]).filter(entry=>mapping[entry.key]);
    const expected={origin:FIXTURE,replay:true,tenant:site.tenant,company:site.company,expectedAccount:site.expectedAccount,jobId:task?.jobId,applicantConfirmed:task?.applicantConfirmed===true&&task.executionProfileId===client.profileId,profileFields:entries.map(entry=>mapping[entry.key]),profileValues:Object.fromEntries(entries.map(entry=>[mapping[entry.key],entry.value])),confirmedAnswers:task?.confirmedAnswers||[]};
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
    if(command.op==='preflight'){
      // Match the production runner's read-before-preflight behavior: a newly
      // visible question returns to inspect before the submission boundary.
      const inspected=await invoke(tab.page,'read',['inspect',expected]);
      if(!inspected.ok)return detail(inspected);
      if(inspected.questions?.length)return detail({ok:false,kind:'questions_changed',message:'申请表出现尚未确认的问题，将重新检查当前任务。'});
      return detail(await invoke(tab.page,'validateSubmit',[expected,payload.layout,payload.file]));
    }
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
  context=await chromium.launchPersistentContext(path.join(isolated,'browser-profile'),browserOptions({headless:mode!=='extension',...(mode==='extension'?{args:['--disable-extensions-except='+extension,'--load-extension='+extension]}:{})}));
  evidence.environment.browser=context.browser().version();
  const workerEvents=[];
  if(mode==='extension'){
    context.on('serviceworker',worker=>workerEvents.push({event:'created',url:worker.url()}));
    workerEvents.push(...context.serviceWorkers().map(worker=>({event:'observed',url:worker.url()})));
  }
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===BASE&&route.request().method()==='POST'&&url.pathname.startsWith('/api/profile/import/'))importRequests.push(url.pathname);
    if(['http:','https:'].includes(url.protocol)&&![BASE,FIXTURE].includes(url.origin)){blockedExternal.push({origin:url.origin,method:route.request().method()});return route.abort('blockedbyclient');}
    return route.continue();
  });
  context.on('page',page=>page.on('pageerror',error=>pageErrors.push(redact(error.message))));
  if(mode==='extension'){
    try{worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});}
    catch(error){
      // Retain the failure: diagnostics must not restart or silently repair the
      // extension. The browser profile and all pages here are fictional tests.
      const diagnostic={browser:evidence.environment.browser,workerEvents,currentWorkers:context.serviceWorkers().map(item=>item.url())};
      try{
        const page=await context.newPage();await page.goto('chrome://extensions/');
        diagnostic.extensions=await page.evaluate(()=>{
          const manager=document.querySelector('extensions-manager');
          const list=manager?.shadowRoot?.querySelector('extensions-item-list');
          return [...(list?.shadowRoot?.querySelectorAll('extensions-item')||[])].map(item=>({id:item.id,text:item.shadowRoot?.innerText?.slice(0,1200)||''}));
        });
        await page.close();
      }catch(diagnosticError){diagnostic.error=String(diagnosticError.message).slice(0,500);}
      console.error('::error title=MV3 startup diagnostic::'+JSON.stringify(diagnostic).replaceAll('%','%25').replaceAll('\n','%0A'));
      throw error;
    }
    assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);evidence.environment.extensionId=new URL(worker.url()).hostname;
  }
  dashboard=context.pages()[0]||await context.newPage();
  await dashboard.goto(BASE);key=await dashboard.locator('meta[name="local-key"]').getAttribute('content');
  assert.ok(key);
  if(mode==='extension')await dashboard.locator('#connect-button').click();else await startPageDriver();
  await until('execution client heartbeat',state,value=>value.connection.connected&&value.connection.profileId);
  await configure();


  // Same-origin fictional replay: actual dashboard UI and browser DOM, with the
  // controlled dispatcher described above. This does not certify MV3 dispatch.
  const first=GREENHOUSE_REPLAY.jobs[0].id;
  fixture.setScenario(first,{sourceQuestion:false});
  await action('add',{url:jobURL(first)});
  await confirm(first);
  await action('resume');
  let originalId, captured;
  await check('visible unanswered required and optional questions survive refresh and server restart',async()=>{
    let current=await until('batch of real fixture questions',state,v=>task(v,first)?.status==='waiting_answer'&&task(v,first)?.answerBatch?.questions?.length);
    let item=task(current,first);originalId=item.id;captured=item.answerBatch.questions;
    const optional=captured.find(q=>q.key==='preferred_name');
    const required=captured.find(q=>q.key==='question_1');
    assert.ok(optional&&!optional.required,'Empty visible optional field must be captured');
    assert.ok(required?.required,'Required original question must be captured');
    assert.ok(!captured.some(q=>q.key==='question_2'),'Conditional question is initially absent');
    assert.ok(!captured.some(q=>q.key==='email'),'Existing confirmed applicable fact must not be asked again');
    assert.equal(await (await applicationPage(first)).inputValue('#email'),'fictional@example.invalid');
    await dashboard.goto(BASE+'/#issues');
    const form=dashboard.getByRole('form',{name:`集中补充答案：${item.title}`});
    await form.getByText(required.text,{exact:true}).waitFor();
    await form.getByText(optional.text,{exact:true}).waitFor();
    await dashboard.reload();
    await dashboard.getByRole('form',{name:`集中补充答案：${item.title}`}).getByText(optional.text,{exact:true}).waitFor();
    await restartBackend();
    current=await until('same persisted pending batch',state,v=>task(v,first)?.status==='waiting_answer'&&task(v,first)?.answerBatch?.questions?.length);
    item=task(current,first);assert.equal(item.id,originalId);
    assert.deepEqual(item.answerBatch.questions.map(q=>[q.scope,q.version]),captured.map(q=>[q.scope,q.version]));
    assert.deepEqual(counts(first),{posts:0,receipts:0});
    await until('execution heartbeat after restart',state,v=>v.connection.connected);
    await action('resume');
    await dashboard.reload();
  });
  await check('actual dashboard answers required questions and explicitly leaves optional blank; same task resumes once',async()=>{
    const current=await until('persisted batch rendered',state,v=>task(v,first)?.status==='waiting_answer'&&task(v,first)?.answerBatch?.questions?.length);
    const item=task(current,first),form=dashboard.getByRole('form',{name:`集中补充答案：${item.title}`});
    await form.waitFor();
    const optional=item.answerBatch.questions.find(q=>q.key==='preferred_name');
    await form.getByLabel(optional.text+'：本次留空',{exact:true}).check();
    await form.getByRole('button',{name:'一次保存以上答案并继续原任务'}).click();
    assert.equal(task(await state(),first).status,'waiting_answer','Empty required questions must not be submitted');
    assert.deepEqual(counts(first),{posts:0,receipts:0});
    const values={first_name:'Fictional',last_name:'Applicant',country:GREENHOUSE_REPLAY.syntheticCountryChoices[0],question_1:'Fictional motivation for this local fixture.',question_2:GREENHOUSE_REPLAY.syntheticSourceChoices[0]};
    for(const q of item.answerBatch.questions){
      if(q.key==='preferred_name'){
        await form.getByLabel(q.text+'：本次留空',{exact:true}).check();
        continue;
      }
      assert.ok(Object.hasOwn(values,q.key),'Unexpected question '+q.key);
      const control=form.getByLabel(q.text+'：答案',{exact:true});
      if(q.options?.length)await control.selectOption({label:values[q.key]});else await control.fill(values[q.key]);
      await form.getByLabel(q.text+'：保存用途',{exact:true}).selectOption(mode==='extension'&&q.key==='first_name'?'profile':'task');
    }
    // The site introduces a conditional question after the original batch was
    // captured. Keep the same live page and enable the fixture's validation.
    fixture.setScenario(first,{sourceQuestion:true});
    const page=await applicationPage(first);
    await page.evaluate(choices=>{
      const group=document.createElement('div');group.className='field';
      const label=document.createElement('label');label.htmlFor='question_2';label.textContent='How did you hear about Mattermost?*';
      const select=document.createElement('select');select.id=select.name='question_2';select.required=true;
      select.add(new Option('Select a fictional fixture choice',''));
      for(const choice of choices)select.add(new Option(choice,choice));
      group.append(label,select);document.querySelector('#submit_app').before(group);
    },GREENHOUSE_REPLAY.syntheticSourceChoices);
    await form.getByRole('button',{name:'一次保存以上答案并继续原任务'}).click();
    if(mode==='extension'){
      const review=await until('updated profile requires confirmation on the same application',state,v=>{const t=task(v,first);return t?.status==='waiting_user'&&t.needsConfirmation;});
      assert.equal(task(review,first).id,originalId);
      assert.equal(review.profile.data.personal.firstName.zh,'Fictional');
      assert.equal(review.profile.data.personal.firstName.confirmed,true);
      assert.deepEqual(counts(first),{posts:0,receipts:0});
      await confirm(first);await action('resume');
    }
    const dynamic=await until('new conditional question without losing original answers',state,v=>{const t=task(v,first);return t?.status==='waiting_answer'&&t.answerBatch?.questions.some(q=>q.key==='question_2');});
    const dynamicTask=task(dynamic,first);assert.equal(dynamicTask.id,originalId);
    assert.deepEqual(dynamicTask.answerBatch.questions.map(q=>q.key),['question_2'],'Already confirmed questions must not be asked again');
    const dynamicQuestion=dynamicTask.answerBatch.questions[0];assert.ok(dynamicQuestion.options.length);
    // Verify the explicitly blank choice and the required answer were actually
    // persisted, including after a second backend restart, before continuing.
    const savedBefore=Object.values(app.store.state.tasks.find(t=>t.id===originalId).answers||{});
    assert.ok(savedBefore.some(a=>a.key==='preferred_name'&&a.confirmed===true&&a.leaveBlank===true&&a.value===''));
    assert.ok(savedBefore.some(a=>a.key==='question_1'&&a.confirmed===true&&a.value===values.question_1));
    assert.deepEqual(counts(first),{posts:0,receipts:0});
    await restartBackend();
    const savedAfter=Object.values(app.store.state.tasks.find(t=>t.id===originalId).answers||{});
    assert.deepEqual(savedAfter,savedBefore);
    const afterRestart=await until('conditional question persisted',state,v=>{const t=task(v,first);return t?.status==='waiting_answer'&&t.answerBatch?.questions.some(q=>q.key==='question_2');});
    assert.equal(task(afterRestart,first).id,originalId);
    await until('execution heartbeat after answer restart',state,v=>v.connection.connected);
    await action('resume');await dashboard.reload();
    const nextForm=dashboard.getByRole('form',{name:`集中补充答案：${dynamicTask.title}`});
    const select=nextForm.getByLabel(dynamicQuestion.text+'：答案',{exact:true});await select.waitFor();
    for(const choice of dynamicQuestion.options.filter(x=>!x.disabled))assert.ok(await select.locator('option').getByText(choice.text,{exact:true}).count());
    await select.selectOption({label:values.question_2});
    await nextForm.getByLabel(dynamicQuestion.text+'：保存用途',{exact:true}).selectOption('task');
    await nextForm.getByRole('button',{name:'一次保存以上答案并继续原任务'}).click();
    const completed=await until('same task completes after direct answers',state,v=>['submitted','unknown','failed','waiting_user'].includes(task(v,first)?.status));
    const finished=task(completed,first);assert.equal(finished.id,originalId);
    assert.equal(finished.status,'submitted',JSON.stringify(finished.issue));
    assert.deepEqual(counts(first),{posts:1,receipts:1});
    const receipt=fixture.state().receipts.find(r=>r.jobId===first);
    assert.equal(receipt.fields.question_1,values.question_1);
    assert.equal(receipt.fields.preferred_name,'');
    assert.equal(receipt.fields.email,'fictional@example.invalid');
    assert.equal(receipt.sha256,SHA);
    await restartBackend();
    await until('same submitted task after restart',state,v=>task(v,first)?.status==='submitted');
    assert.equal(task(await state(),first).id,originalId);
    const retry=await action('task-resume',{taskId:originalId},{allowFailure:true});
    assert.equal(retry.ok,false,'A submitted task cannot be resumed into another submission');
    await action('resume');await delay(1500);
    assert.equal((await state()).tasks.filter(t=>t.jobId===first).length,1);
    assert.deepEqual(counts(first),{posts:1,receipts:1});
  });
  if(mode==='extension')await check('actual MV3 reuses confirmed personal fact on another task without reusing scoped answer or blank',async()=>{
    const second=GREENHOUSE_REPLAY.jobs[1].id;
    fixture.setScenario(second,{sourceQuestion:false});
    await action('add',{url:jobURL(second)});await confirm(second);await action('resume');
    let current=await until('second application batch',state,v=>task(v,second)?.status==='waiting_answer'&&task(v,second)?.answerBatch?.questions?.length);
    let item=task(current,second);const secondId=item.id;
    assert.notEqual(secondId,originalId);
    const questions=item.answerBatch.questions;
    assert.ok(!questions.some(q=>q.key==='first_name'),'Confirmed personal first name must be reused');
    assert.ok(questions.some(q=>q.key==='question_1'),'Prior job-specific motivation must not be reused');
    assert.ok(questions.some(q=>q.key==='preferred_name'),'Prior task-only blank must not be reused');
    await dashboard.goto(BASE+'/#issues');
    const form=dashboard.getByRole('form',{name:`集中补充答案：${item.title}`});await form.waitFor();
    const values={last_name:'Applicant',country:GREENHOUSE_REPLAY.syntheticCountryChoices[0],question_1:'A different fictional reason for the second position.',question_2:GREENHOUSE_REPLAY.syntheticSourceChoices[0]};
    for(const q of questions){
      if(q.key==='preferred_name'){await form.getByLabel(q.text+'：本次留空',{exact:true}).check();continue;}
      assert.ok(Object.hasOwn(values,q.key),'Unexpected second-task question '+q.key);
      const control=form.getByLabel(q.text+'：答案',{exact:true});
      if(q.options?.length)await control.selectOption({label:values[q.key]});else await control.fill(values[q.key]);
      await form.getByLabel(q.text+'：保存用途',{exact:true}).selectOption('task');
    }
    await form.getByRole('button',{name:'一次保存以上答案并继续原任务'}).click();
    current=await until('second task completes',state,v=>['submitted','unknown','failed','waiting_user'].includes(task(v,second)?.status));
    item=task(current,second);assert.equal(item.id,secondId);assert.equal(item.status,'submitted',JSON.stringify(item.issue));
    assert.deepEqual(counts(second),{posts:1,receipts:1});
    const receipt=fixture.state().receipts.find(r=>r.jobId===second);
    assert.equal(receipt.fields.first_name,'Fictional');assert.equal(receipt.fields.question_1,values.question_1);
    assert.equal(receipt.fields.preferred_name,'');assert.equal(receipt.sha256,SHA);
  });
  assert.deepEqual(blockedExternal,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(importRequests,[],'Daily answers do not upload JSON');
  evidence.finishedAt=new Date().toISOString();
  evidence.fixture={receipts:fixture.state().receipts.length,actualApplicationPosts:applicationPosts.length,persistedAttempts:fixture.state().submitRequests.length};
}catch(error){evidence.error=redact(error.stack||error.message);throw error;}
finally{
  evidence.finishedAt ||= new Date().toISOString();evidence.pageErrors=pageErrors;evidence.blockedExternal=blockedExternal;evidence.applicationPosts=applicationPosts;
  if(app?.store)evidence.finalTasks=app.store.snapshot().tasks.map(value=>({id:value.id,jobId:value.jobId,status:value.status,phase:value.phase,issue:value.issue?.title,steps:value.steps.slice(-4)}));
  await fs.writeFile(path.join(evidenceRoot,mode==='extension'?'greenhouse-answer-mv3-browser.json':'greenhouse-answer-ui-browser.json'),JSON.stringify(evidence,null,2));
  driverRunning=false;clearInterval(driverHeartbeat);await context?.close();await driverLoop;await app?.close();await fixture?.close();await removeTestDirectory(isolated);
}
