import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';

// Browser installation and execution belong to the explicitly selected hosted job.
if(process.env.GITHUB_ACTIONS!=='true' || process.platform!=='linux') {
  throw new Error('Run the workflow browser regression only in the manual GitHub-hosted Linux Actions job.');
}
const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const {createApp}=await import('../server.mjs');
const BASE='http://127.0.0.1:17321',FIXTURE='http://127.0.0.1:17322';
const isolated=await testDirectory('workflow'),dataDir=path.join(isolated,'data'),profileDir=path.join(isolated,'browser-profile');
const testKey=randomBytes(24).toString('base64url'),results=[],pageErrors=[],consoleErrors=[],bridgeEvents=[],fixtureEvents=[],applicationHttpPosts=[];
const evidence={startedAt:new Date().toISOString(),environment:{platform:process.platform,architecture:process.arch,os:os.release(),node:process.version,githubActions:process.env.GITHUB_ACTIONS==='true',runId:process.env.GITHUB_RUN_ID||null,runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,commit:process.env.GITHUB_SHA||null,containerImage:process.env.CLOUD_PLAYWRIGHT_IMAGE||null},scope:'Real loaded extension, dashboard HTTP API, actual fixture DOM and native multipart requests; fictional data only.',limitations:['No real recruiting website or personal account tested.','No Windows production browser or toolbar acceptance.','Controlled-time and missed-day schedule decisions are covered by the separate Node tests; this journey also checks a due schedule respects manual pause.'],results,applicationHttpPosts};
let app,context,dashboard,key,releaseApply;
const watchedPages=new WeakSet();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function safeDiagnostic(value) {
  let text=String(value);for(const secret of [key,testKey])if(secret)text=text.replaceAll(secret,'[redacted]');
  return text.replace(/[A-Za-z0-9_-]{32,256}/g,'[opaque]');
}
function notice(title,value) {
  let detail=safeDiagnostic(JSON.stringify(value));
  if(detail.length>3800)detail=JSON.stringify({truncated:true,detail:detail.slice(0,3550)});
  console.error('::notice title='+title+'::'+detail.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
}
function urlType(url) {
  try {const parsed=new URL(url);if(parsed.origin===BASE)return 'dashboard';if(parsed.origin===FIXTURE)return 'fixture';if(parsed.protocol==='chrome-extension:')return parsed.pathname==='/runner/index.html'?'runner':'extension';return parsed.protocol==='about:'?'blank':'other';}catch{return 'unknown';}
}
function observePage(page) {
  if(watchedPages.has(page))return;watchedPages.add(page);
  page.on('pageerror',error=>pageErrors.push(safeDiagnostic(error.message).slice(0,600)));
  page.on('console',message=>{if(message.type()==='error'&&consoleErrors.length<30)consoleErrors.push({page:urlType(page.url()),message:safeDiagnostic(message.text()).slice(0,600)});});
}
function recordBridge(source,url,headers,status=null) {
  let route;try {const parsed=new URL(url);if(parsed.origin!==BASE)return;route=parsed.pathname;}catch{return;}
  if(!['/api/bridge/poll','/api/bridge/heartbeat','/api/bridge/authorize','/api/bridge/result'].includes(route)||bridgeEvents.length>=100)return;
  const origin=headers.origin||'';
  bridgeEvents.push({source,route,status,originPresent:!!origin,extensionOrigin:/^chrome-extension:\/\/[a-p]{32}$/.test(origin),hasKey:!!headers['x-local-key']});
}
async function pairingDiagnostic(worker) {
  const snapshot={workerPresent:!!worker,metaKeyPresent:!!key,extensionMessages:null,storage:null,runners:[],dashboardToast:null,pageErrors:pageErrors.slice(-3),consoleErrors:consoleErrors.slice(-3),bridgeEvents:bridgeEvents.slice(-10)};
  if(worker)try {snapshot.storage=await worker.evaluate(async()=>{const {localBridge,runnerTabId}=await chrome.storage.local.get(['localBridge','runnerTabId']);return {keyPresent:typeof localBridge?.key==='string'&&localBridge.key.length>0,profilePresent:typeof localBridge?.profileId==='string'&&localBridge.profileId.length>0,runnerTabPresent:Number.isInteger(runnerTabId)};});}catch{snapshot.storage={readFailed:true};}
  if(dashboard&&!dashboard.isClosed())try {
    snapshot.extensionMessages=await dashboard.evaluate(()=>({readySeen:globalThis.__jobLocalTestEvents?.some(event=>event.type==='extension-ready')===true,connectedSeen:globalThis.__jobLocalTestEvents?.some(event=>event.type==='connected')===true,connectedOK:globalThis.__jobLocalTestEvents?.some(event=>event.type==='connected'&&event.ok===true)===true}));
    snapshot.dashboardToast=safeDiagnostic(await dashboard.locator('#toast').textContent()).slice(0,250);
  }catch{snapshot.dashboardReadFailed=true;}
  for(const page of context?.pages()||[])if(urlType(page.url())==='runner') {
    try {snapshot.runners.push({urlType:'runner',status:safeDiagnostic(await page.locator('#status').textContent({timeout:1000})).slice(0,200)});}catch{snapshot.runners.push({urlType:'runner',statusReadFailed:true});}
  }
  (evidence.pairingDiagnostics||=[]).push(snapshot);notice('Real extension pairing diagnosis',snapshot);
}
async function until(name,read,predicate,timeout=45_000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline) {const value=await read();if(predicate(value))return value;await delay(150);}
  throw new Error('Timed out: '+name);
}
async function check(name,fn) {
  const started=Date.now();
  try {await fn();const result={name,status:'PASS',durationMs:Date.now()-started};results.push(result);console.log('PASS '+name);notice('Fictional workflow stage passed',result);}
  catch(error){results.push({name,status:'FAIL',error:error.message,durationMs:Date.now()-started});throw error;}
}
async function api(route='/state',body,{allowFailure=false}={}) {
  const response=await fetch(BASE+'/api'+route,{method:body?'POST':'GET',headers:{'X-Local-Key':key,...(body?{'Content-Type':'application/json',Origin:BASE}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
  const value=await response.json();
  if(!allowFailure && (!response.ok || value.ok===false))throw new Error('Dashboard '+route+': '+response.status+' '+(value.error||'request failed'));
  return {status:response.status,...value};
}
const action=(action,details={},options)=>api('/action',{action,...details},options);
const state=()=>api();
async function fixture(route='/state',body) {
  const response=await fetch(FIXTURE+'/__test'+route,{method:body?'POST':'GET',headers:{'X-Fixture-Test-Key':testKey,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200,'Fixture control route '+route);return response.json();
}
const task=(snapshot,jobId)=>snapshot.tasks.find(item=>item.jobId===jobId);
const requests=(snapshot,tenant,jobId)=>snapshot.submitRequests.filter(item=>item.tenant===tenant&&item.jobId===jobId);
const observedPosts=(tenant,jobId)=>applicationHttpPosts.filter(item=>item.tenant===tenant&&item.jobId===jobId);
async function start() {
  app=await createApp({dataDir,testMode:true,testKey});assert.equal(app.url,BASE);
  app.fixture.server.on('request',(request,response)=>{
    const parsed=new URL(request.url,FIXTURE);
    const application=/^\/site\/(alpha|beta)\/apply\/([a-zA-Z0-9_-]{1,80})$/.exec(parsed.pathname);
    // Observe every HTTP application POST independently of fixture validation.
    // Rejected Origin/Fetch-Metadata requests never enter fixture.submitRequests.
    // Keep only fictional tenant/job identity; no body, URL query or headers.
    if(request.method==='POST' && application)applicationHttpPosts.push({tenant:application[1],jobId:application[2]});
    if(!/^\/site\/(alpha|beta)\/(jobs|apply|login|receipt|session)(?:\/[\w-]+)?$/.test(parsed.pathname))return;
    response.once('finish',()=>{
      if(response.statusCode>=400 && fixtureEvents.length<12)fixtureEvents.push({method:request.method,path:parsed.pathname,status:response.statusCode,
        origin:request.headers.origin==='null'?'null':!request.headers.origin?'none':request.headers.origin===FIXTURE?'fixture':/^chrome-extension:\/\/[a-p]{32}$/.test(request.headers.origin)?'extension':'other',
        site:request.headers['sec-fetch-site']||'absent',mode:request.headers['sec-fetch-mode']||'absent',destination:request.headers['sec-fetch-dest']||'absent'});
    });
  });
  app.server.on('request',(request,response)=>{
    const url=BASE+request.url;recordBridge('server-request',url,request.headers);
    response.once('finish',()=>recordBridge('server-response',url,request.headers,response.statusCode));
  });
}
async function launch() {
  if(process.env.CLOUD_PLAYWRIGHT_IMAGE) {
    const proof=JSON.parse(await fs.readFile(path.join(evidenceRoot,'container-browser.json'),'utf8'));
    assert.equal(proof.image,process.env.CLOUD_PLAYWRIGHT_IMAGE);assert.equal(proof.playwright,'1.58.2');assert.equal(proof.copiedAndVerified,true);
    evidence.environment.imageBrowser=proof;
  }
  const binary=chromium.executablePath();
  const version=spawnSync(binary,['--version'],{encoding:'utf8',timeout:10_000});
  evidence.environment.browserBinary={version:version.stdout?.trim(),exitCode:version.status,signal:version.signal,diagnostic:version.stderr?.trim().slice(-1000)};
  assert.equal(version.status,0,'Installed Chromium --version failed: '+JSON.stringify(evidence.environment.browserBinary));
  try {
    context=await chromium.launchPersistentContext(profileDir,browserOptions({headless:false,channel:'chromium',args:['--disable-extensions-except='+path.join(projectRoot,'autofill-extension'),'--load-extension='+path.join(projectRoot,'autofill-extension')]}));
  } catch(error) {
    // The extension browser has exited. A sequential bare-browser diagnostic
    // distinguishes a browser/runner failure from an extension launch failure.
    let diagnostic;
    try {
      const bare=await chromium.launch(browserOptions({channel:'chromium'}));
      try {diagnostic={bareBrowser:'PASS',version:bare.version()};}finally{await bare.close();}
    } catch(bareError) {diagnostic={bareBrowser:'FAIL',error:String(bareError.message).split('\n').filter(line=>line.length<800).join('\n').slice(-2200)};}
    evidence.startupDiagnostic={...evidence.environment.browserBinary,...diagnostic};
    const annotation=JSON.stringify(evidence.startupDiagnostic).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
    console.error('::notice title=Chromium startup isolation::'+annotation);
    if(diagnostic.bareBrowser==='FAIL'){
      // Use a fixed blank document and a fresh isolated profile. This checks
      // whether the executable can render without Playwright's default flags.
      const minimal=spawnSync(binary,['--headless','--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+path.join(isolated,'minimal-browser'),'--dump-dom','about:blank'],{encoding:'utf8',timeout:10_000,maxBuffer:1024*1024});
      const detail={exitCode:minimal.status,signal:minimal.signal,errorCode:minimal.error?.code||null,renderedBlank:minimal.status===0&&/<html[\s>]/i.test(minimal.stdout||''),diagnostic:(minimal.stderr||'').split('\n').filter(line=>line.length<800).join('\n').slice(-1800)};
      evidence.startupDiagnostic.directBinary=detail;
      const directAnnotation=JSON.stringify(detail).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
      console.error('::notice title=Direct Chromium blank-page isolation::'+directAnnotation);
    }
    throw error;
  }
  evidence.environment.browser=context.browser().version();
  context.on('page',observePage);for(const page of context.pages())observePage(page);
  context.on('request',request=>recordBridge('browser-request',request.url(),request.headers()));
  context.on('response',response=>recordBridge('browser-response',response.url(),response.request().headers(),response.status()));
  let worker;
  try {
    worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10_000});
    assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);
    evidence.environment.extensionId=new URL(worker.url()).host;
    dashboard=context.pages()[0]||await context.newPage();observePage(dashboard);
    // Install a passive document-start observer before the real content script emits ready.
    await dashboard.addInitScript(()=>{
      globalThis.__jobLocalTestEvents=[];
      window.addEventListener('message',event=>{
        if(event.source===window&&event.origin==='http://127.0.0.1:17321'&&event.data?.channel==='job-local'&&['extension-ready','connected'].includes(event.data.type))globalThis.__jobLocalTestEvents.push({type:event.data.type,ok:event.data.ok===true});
      });
    });
    await dashboard.goto(BASE);await dashboard.locator('meta[name="local-key"]').waitFor({state:'attached'});
    key=await dashboard.locator('meta[name="local-key"]').getAttribute('content');assert.match(key,/^[A-Za-z0-9_-]{32,256}$/);
    await dashboard.waitForFunction(()=>globalThis.__jobLocalTestEvents?.some(event=>event.type==='extension-ready'),{},{timeout:10_000});
    // This remains the actual dashboard button -> content script -> service worker pairing.
    await dashboard.locator('#connect-button').click();
    await until('actual extension pairing',state,value=>value.connection.connected&&value.connection.profileId);
    const runner=context.pages().find(page=>urlType(page.url())==='runner');assert.ok(runner);
    const repeated=await runner.evaluate(async()=>chrome.runtime.sendMessage({type:'local-runner-register',tabId:(await chrome.tabs.getCurrent()).id}));
    assert.equal(repeated.ok,true,'same real runner can register twice');
    const duplicate=await context.newPage();
    try{
      await duplicate.goto(runner.url());
      await duplicate.getByText('已有一个执行端运行，此页不会重复处理任务。',{exact:true}).waitFor();
      assert.equal((await state()).connection.connected,true);
      const beforeRecovery=await fixture(),beforeRecoveryHttpPosts=applicationHttpPosts.length,previousClient=app.store.connection.clientId;
      // Retain the rejected B document, remove active A, then use the actual
      // dashboard pairing path to recover B. Do not write extension storage.
      await runner.close();
      await dashboard.locator('#connect-button').click();
      await until('retained rejected runner recovers a real backend heartbeat',state,value=>value.connection.connected&&app.store.connection.clientId!==previousClient);
      const probes=await worker.evaluate(async()=>{
        const contexts=await chrome.runtime.getContexts({contextTypes:['TAB'],documentUrls:[chrome.runtime.getURL('runner/index.html')]});
        return Promise.all(contexts.map(async context=>{
          const reply=await chrome.runtime.sendMessage({type:'local-runner-probe',tabId:context.tabId});
          return {tabId:context.tabId,running:reply?.running===true};
        }));
      });
      assert.equal(probes.filter(probe=>probe.running).length,1,'exactly one real registered polling loop survives recovery');
      const selected=await duplicate.evaluate(async()=>(await chrome.tabs.getCurrent()).id);
      assert.equal(probes.find(probe=>probe.running).tabId,selected,'retained B is the recovered runner');
      const afterRecovery=await fixture();assert.equal(afterRecovery.submitRequests.length,beforeRecovery.submitRequests.length);
      assert.equal(applicationHttpPosts.length,beforeRecoveryHttpPosts,'runner recovery must not send any additional HTTP application POST');
      assert.equal(afterRecovery.receipts.length,beforeRecovery.receipts.length);
      evidence.runnerRecovery={retainedRejectedPage:true,recoveredThroughDashboard:true,activeRunners:1,noAdditionalPosts:true};
    }catch(error){await duplicate.close();throw error;}
  }catch(error){await pairingDiagnostic(worker);throw error;}
}
async function loginAlpha() {
  // A normal fictional native login in the exact same persistent execution profile.
  const page=await context.newPage();await page.goto(FIXTURE+'/site/alpha/login');
  await page.locator('select[name="account"]').selectOption('demo');
  await Promise.all([page.waitForURL(FIXTURE+'/site/alpha/login'),page.locator('button[type="submit"]').click()]);
  await page.locator('[data-session-status="ready"][data-account="demo"]').waitFor();
  await page.close();await action('site-check',{siteId:'local-alpha'});
  await until('real alpha login checked',state,value=>value.sites.find(item=>item.id==='local-alpha')?.login?.status==='ready');
}
async function verifyReceipt(tenant,jobId,resume) {
  const actual=await fixture(),received=actual.receipts.filter(item=>item.tenant===tenant&&item.jobId===jobId);
  assert.equal(received.length,1);assert.equal(requests(actual,tenant,jobId).length,1);
  assert.equal(observedPosts(tenant,jobId).length,1,'exactly one HTTP application POST, including any rejected attempts');
  assert.equal(requests(actual,tenant,jobId)[0].accepted,true);
  const receipt=received[0];
  assert.equal(receipt.account,'demo');assert.equal(receipt.fileName,resume.name);assert.equal(receipt.fileSize,resume.size);assert.equal(receipt.sha256,resume.sha256);
  const bytes=await fs.readFile(path.join(dataDir,'fixture','uploads',receipt.id+'.bin'));
  assert.equal(bytes.length,resume.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),resume.sha256);
  return receipt;
}
async function workflow() {
  await start();
  await check('真实 Manifest V3 加载、工作台按钮配对和执行端心跳',launch);
  const originalProfileId=(await state()).connection.profileId;
  dashboard.once('dialog',dialog=>dialog.accept());
  await dashboard.getByRole('button',{name:'准备虚构演示资料',exact:true}).click();
  const initial=await until('fictional demo configuration saved',state,value=>value.profile.version===1&&value.resume?.version===1);assert.deepEqual(initial.readiness,[]);
  const resume=initial.resume;
  await check('管理台六个页面可用，轮询保留未保存资料和所选虚构文件',async()=>{
    for(const view of ['overview','queue','issues','sites','profile','settings']) {
      await dashboard.locator(`nav [data-view="${view}"]`).click();
      await dashboard.locator(`nav [data-view="${view}"][aria-current="page"]`).waitFor();
      assert.ok((await dashboard.locator('#view-content').textContent()).trim().length>0);
    }
    await dashboard.locator('nav [data-view="profile"]').click();
    const name=dashboard.locator('[data-focus="profile-personal-base-name-zh"]');
    await name.fill('尚未保存的虚构资料');
    await dashboard.getByLabel('选择本机简历文件',{exact:true}).setInputFiles({name:'fictional-unsaved.txt',mimeType:'text/plain',buffer:Buffer.from('Fictional unsaved browser-test file.\n')});
    await delay(1200);assert.equal(await name.inputValue(),'尚未保存的虚构资料');
    assert.equal(await dashboard.getByLabel('选择本机简历文件',{exact:true}).evaluate(node=>node.files[0]?.name),'fictional-unsaved.txt');
    assert.equal((await state()).profile.version,initial.profile.version);assert.equal((await state()).resume.version,resume.version);
    await dashboard.locator('nav [data-view="overview"]').click();
    const before=await state(),healthResponse=dashboard.waitForResponse(response=>response.url()===BASE+'/api/health'&&response.request().method()==='GET');
    await dashboard.locator('#health-button').click();
    const health=await (await healthResponse).json();assert.ok(Number.isFinite(Date.parse(health.checkedAt)));
    assert.ok(health.checks.length>=5);assert.ok(health.checks.every(item=>['pass','warning','fail'].includes(item.status)));
    for(const id of ['backend','fixture','extension'])assert.equal(health.checks.find(item=>item.id===id)?.status,'pass');
    await dashboard.locator('#health-dialog').waitFor();
    await until('actual self-check rendered',()=>dashboard.locator('#health-dialog .health-check').count(),count=>count===health.checks.length);
    const after=await state();assert.equal(after.tasks.length,before.tasks.length);assert.equal(after.paused,before.paused);assert.equal(after.running,before.running);
    await dashboard.keyboard.press('Escape');
  });
  let reachedApply;const reached=new Promise(resolve=>{reachedApply=resolve;});
  const release=new Promise(resolve=>{releaseApply=resolve;});let gated=false,betaPage;
  // Gate one real GET only; continue it to the actual server without substituting any response.
  await context.route(FIXTURE+'/site/beta/apply/web-001',async route=>{
    if(!gated&&route.request().method()==='GET') {gated=true;betaPage=route.request().frame().page();reachedApply();await release;}
    await route.continue();
  });
  await action('run');
  await check('真实列表发现、筛选、稳定岗位去重、同站点登录事项聚合',async()=>{
    await Promise.race([reached,delay(45_000).then(()=>{throw new Error('Beta application was not opened by the actual extension');})]);
    const snapshot=await state();assert.equal(snapshot.tasks.length,5);
    assert.equal(snapshot.tasks.filter(item=>item.status==='skipped').length,2);
    for(const id of ['cpp-001','cpp-002'])assert.equal(task(snapshot,id).status,'waiting_user');
    assert.equal(snapshot.issues.filter(item=>item.siteId==='local-alpha'&&item.kind==='login'&&item.status==='open').length,1);
    const first=await action('add',{url:FIXTURE+'/site/beta/jobs/web-001?source=fictional-first'});
    const second=await action('add',{url:FIXTURE+'/site/beta/apply/web-001?source=fictional-second'});
    assert.equal(first.duplicate,true);assert.equal(second.duplicate,true);assert.equal(first.task.id,second.task.id);
    assert.equal((await state()).tasks.length,5);
    // Keep the second alpha job for the later submission-boundary and session-expiry check.
    await action('task-pause',{taskId:task(snapshot,'cpp-002').id});
  });
  let betaTask;
  await check('全局暂停阻止后续写入；接管已有值受保护，明确恢复原任务',async()=>{
    await action('pause');releaseApply();
    const paused=await until('paused inspection invalidated without advancing',state,value=>value.paused&&!app.store.command&&task(value,'web-001')?.phase==='inspect'&&task(value,'web-001')?.status==='queued');
    assert.equal(paused.manualPaused,true);
    betaTask=task(paused,'web-001');
    await betaPage.locator('[data-application-form]').waitFor();
    assert.equal(await betaPage.locator('[name="personal.name"]').inputValue(),'');
    assert.equal(await betaPage.locator('input[type="file"]').evaluate(node=>node.files.length),0);
    // Midnight is due on the actual current day. A manual hold must neither run
    // nor consume that daily trigger; the Node clock tests cover multiple days.
    await api('/settings',{settings:{...initial.settings,scheduleEnabled:true,time:'00:00'},sites:paused.sites});
    await delay(1250);
    const scheduled=await state();
    assert.equal(scheduled.paused,true);assert.equal(scheduled.manualPaused,true);
    assert.deepEqual(scheduled.lastSchedule,paused.lastSchedule);assert.equal(scheduled.nextRun,null);
    assert.equal(scheduled.running,false);assert.equal(task(scheduled,'web-001').status,'queued');
    await dashboard.getByText('手动暂停，计划不会自动恢复',{exact:true}).waitFor();
    await api('/settings',{settings:initial.settings,sites:scheduled.sites});
    await betaPage.locator('[name="personal.name"]').fill('用户接管的虚构姓名');
    await delay(800);assert.equal((await fixture()).submitRequests.length,0);assert.equal(applicationHttpPosts.length,0);
    await action('resume');
    await until('original value blocks automatic overwrite',state,value=>task(value,'web-001')?.status==='waiting_user');
    assert.equal(await betaPage.locator('[name="personal.name"]').inputValue(),'用户接管的虚构姓名');
    assert.equal((await fixture()).submitRequests.length,0);assert.equal(applicationHttpPosts.length,0);
    await dashboard.locator('nav [data-view="queue"]').click();
    const betaRow=dashboard.locator('tbody tr').filter({hasText:betaTask.title});
    await betaRow.getByRole('button',{name:'查看详情',exact:true}).click();
    await dashboard.locator('#task-dialog').getByRole('button',{name:'跳过此任务',exact:true}).click();
    const skipped=await until('same beta task skipped',state,value=>task(value,'web-001')?.status==='skipped');
    assert.equal(task(skipped,'web-001').id,betaTask.id);assert.equal(task(skipped,'web-001').canResume,true);
    assert.equal(requests(await fixture(),'beta','web-001').length,0);assert.equal(observedPosts('beta','web-001').length,0);
    await betaPage.locator('[name="personal.name"]').fill('');
    await dashboard.locator('#task-dialog').getByRole('button',{name:'重新检查并排队',exact:true}).click();
    await dashboard.keyboard.press('Escape');
  });
  await check('其他站点等待时 beta 真正填写多段经历、上传并只提交一次',async()=>{
    const snapshot=await until('beta reliable receipt',state,value=>task(value,'web-001')?.status==='submitted');
    assert.equal(task(snapshot,'web-001').id,betaTask.id);
    assert.equal(task(snapshot,'cpp-001').status,'waiting_user');
    const receipt=await verifyReceipt('beta','web-001',resume),profile=initial.profile.data;
    for(const kind of ['education','experience'])for(let slot=0;slot<2;slot++)for(const [field,value]of Object.entries(profile[kind][slot])) {
      if(field==='id'||field==='department'||!value.confirmed||!value.zh)continue;
      assert.equal(receipt.fields[`${kind}.${slot}.${field}`],value.zh,`${kind} ${slot} ${field}`);
    }
    assert.equal(receipt.fields['personal.name'],profile.personal.name.zh);
  });
  let alphaTask,question;
  await check('同一执行 profile 实际登录后原任务缺答暂停，单项暂停和恢复不提交',async()=>{
    await loginAlpha();
    const waiting=await until('original alpha question',state,value=>task(value,'cpp-001')?.status==='waiting_answer');
    alphaTask=task(waiting,'cpp-001');question=alphaTask.question;
    assert.equal(question.key,'motivation');assert.equal(question.scope,'local-v1:alpha:cpp-001:motivation:v1');assert.ok(question.text.includes('为什么'));
    assert.equal(waiting.issues.find(item=>item.taskId===alphaTask.id&&item.kind==='answer'&&item.status==='open')?.question.text,question.text);
    await action('task-pause',{taskId:alphaTask.id});await delay(800);
    assert.equal(task(await state(),'cpp-001').status,'paused');assert.equal(requests(await fixture(),'alpha','cpp-001').length,0);assert.equal(observedPosts('alpha','cpp-001').length,0);
    await action('task-resume',{taskId:alphaTask.id});
    const repeated=await until('same question after task recovery',state,value=>task(value,'cpp-001')?.status==='waiting_answer');
    assert.equal(task(repeated,'cpp-001').id,alphaTask.id);assert.deepEqual(task(repeated,'cpp-001').question,question);
  });
  await check('经确认的普通问题补答继续同一岗位，真实 multipart 保留限定答案',async()=>{
    const answer='这是一份虚构演示答案：希望参与本地测试项目，不代表任何真实个人经历。';
    await dashboard.locator('nav [data-view="issues"]').click();
    const input=dashboard.getByRole('textbox',{name:'确认答案',exact:true});
    await input.fill(answer);await delay(1200);assert.equal(await input.inputValue(),answer);
    await dashboard.getByLabel('保存为本站相同原文、相同限定用途的确认答案',{exact:true}).check();
    await dashboard.getByRole('button',{name:'确认答案并继续原任务',exact:true}).click();
    const snapshot=await until('alpha answer submitted',state,value=>task(value,'cpp-001')?.status==='submitted');
    assert.equal(task(snapshot,'cpp-001').id,alphaTask.id);
    assert.equal((await verifyReceipt('alpha','cpp-001',resume)).fields.motivation,answer);
  });
  let unknownTask;
  await check('接收后丢失回执并使会话失效，真实请求仍只有一次且拒绝重投',async()=>{
    await fixture('/scenario',{tenant:'alpha',jobId:'cpp-002',loseReceipt:true,expireSessionOnSubmit:true});
    const before=await state();await action('task-resume',{taskId:task(before,'cpp-002').id});
    const snapshot=await until('persisted unknown submission',state,value=>task(value,'cpp-002')?.status==='unknown');
    unknownTask=task(snapshot,'cpp-002');assert.equal(unknownTask.phase,'verify');
    assert.equal(unknownTask.canResume,false);assert.equal(unknownTask.canVerify,true);
    await verifyReceipt('alpha','cpp-002',resume);
    const forbidden=await action('task-resume',{taskId:unknownTask.id},{allowFailure:true});
    assert.equal(forbidden.ok,false);assert.equal(forbidden.status,400);
    await dashboard.locator('nav [data-view="queue"]').click();
    await dashboard.locator('tbody tr').filter({hasText:unknownTask.title}).getByRole('button',{name:'查看详情',exact:true}).click();
    const detail=dashboard.locator('#task-dialog');await detail.getByRole('button',{name:'核对接收记录',exact:true}).waitFor();
    assert.equal(await detail.getByRole('button',{name:/重新检查并(继续|排队)/}).count(),0);
    await dashboard.keyboard.press('Escape');
    const verificationCount=task(await state(),'cpp-002').steps.filter(step=>step.label==='核对接收结果').length;
    await action('verify',{taskId:unknownTask.id});
    await until('expired-session verification was actually processed',state,value=>task(value,'cpp-002').steps.filter(step=>step.label==='核对接收结果').length>verificationCount);
    assert.equal(task(await state(),'cpp-002').status,'unknown');assert.equal(requests(await fixture(),'alpha','cpp-002').length,1);assert.equal(observedPosts('alpha','cpp-002').length,1);
  });
  await check('关闭浏览器可见断线；服务和隔离持久 profile 重启保留版本与提交边界',async()=>{
    await context.close();context=null;
    const disconnected=await until('real runner disconnected',state,value=>!value.connection.connected,10_000);
    assert.equal(task(disconnected,'cpp-002').status,'unknown');
    await app.close();app=null;await start();await launch();
    const recovered=await state();
    assert.equal(recovered.connection.profileId,originalProfileId);assert.equal(recovered.profile.version,initial.profile.version);assert.equal(recovered.resume.version,resume.version);
    assert.deepEqual(recovered.settings,initial.settings);assert.equal(recovered.tasks.length,5);
    assert.equal(task(recovered,'cpp-002').id,unknownTask.id);assert.equal(task(recovered,'cpp-002').status,'unknown');
    assert.equal(task(recovered,'cpp-001').status,'submitted');assert.equal(task(recovered,'web-001').status,'submitted');
    await action('resume');await delay(1000);assert.equal((await fixture()).submitRequests.length,3);assert.equal(applicationHttpPosts.length,3);
  });
  await check('重新实际登录后只读核对恢复未知结果，重启和重连没有重复申请',async()=>{
    await loginAlpha();await action('verify',{taskId:unknownTask.id});
    const recovered=await until('read-only receipt recovery',state,value=>task(value,'cpp-002')?.status==='submitted');
    assert.equal(task(recovered,'cpp-002').id,unknownTask.id);
    for(const [tenant,id]of [['beta','web-001'],['alpha','cpp-001'],['alpha','cpp-002']])await verifyReceipt(tenant,id,resume);
    const actual=await fixture();assert.equal(actual.submitRequests.length,3);assert.equal(actual.receipts.length,3);assert.equal(applicationHttpPosts.length,3);
    assert.deepEqual(pageErrors,[],'No dashboard, fixture, or extension page script errors');
    evidence.summary={actualMultipartRequests:actual.submitRequests.length,observedHttpApplicationPosts:applicationHttpPosts.length,acceptedReceipts:actual.receipts.length,submittedTasks:recovered.stats.demo.submitted,profileVersion:recovered.profile.version,resumeVersion:recovered.resume.version};
    assert.equal(evidence.summary.submittedTasks,3);
  });
  await check('附件同名同大小内容被换在预检前拦截；最终授权等待再换仍为零POST',async()=>{
    const target=task(await state(),'design-001');assert.ok(target);
    let gated=false;
    const sessionRoute=async route=>{
      if(!gated && app.store.command?.taskId===target.id && app.store.command.op==='preflight'){
        gated=true;
        const page=context.pages().find(page=>page.url()===FIXTURE+'/site/beta/apply/design-001');assert.ok(page);
        await page.locator('input[type="file"]').setInputFiles({name:resume.name,mimeType:'text/plain',buffer:Buffer.alloc(resume.size,65)});
      }
      await route.continue();
    };
    await context.route(FIXTURE+'/site/beta/session',sessionRoute);
    const exhausted=await state();
    assert.equal(exhausted.settings.dailyLimit,3);assert.equal(exhausted.stats.demo.today,3);
    assert.equal(app.store.dailyUsed(),3,'the original three submission boundaries exhaust the configured allowance');
    await action('task-resume',{taskId:target.id});
    await delay(1250);
    const held=await state();
    assert.equal(task(held,'design-001').status,'queued');assert.equal(task(held,'design-001').phase,'inspect');
    assert.equal(gated,false,'an exhausted allowance must not reach attachment preflight');
    assert.equal(app.store.command,null);assert.equal((await fixture()).submitRequests.length,3);assert.equal(applicationHttpPosts.length,3);
    // Keep the real quota-exhaustion evidence, then configure enough allowance for
    // the two additional fictional boundaries through the public settings API.
    await api('/settings',{settings:{...held.settings,dailyLimit:5},sites:held.sites});
    const extended=await state();assert.equal(extended.settings.dailyLimit,5);
    assert.equal(app.store.dailyUsed(),3,'changing allowance does not delete prior boundaries');
    evidence.allowance={originalLimit:3,exhaustedBoundaries:3,blockedQueuedTask:true,extendedLimit:5};
    await until('attachment preflight refusal',state,value=>gated&&task(value,'design-001')?.status==='waiting_user');
    await context.unroute(FIXTURE+'/site/beta/session',sessionRoute);
    assert.equal(requests(await fixture(),'beta','design-001').length,0);assert.equal(observedPosts('beta','design-001').length,0);
    assert.equal(app.store.task(target.id).submissionStarted,undefined);
    const page=context.pages().find(page=>page.url()===FIXTURE+'/site/beta/apply/design-001');
    await page.locator('input[type="file"]').setInputFiles([]);
    let replaced=false;
    const authorizationRoute=async route=>{
      if(!replaced && app.store.command?.taskId===target.id && app.store.command.op==='submit'){
        replaced=true;
        // Same bytes but a different File identity must also invalidate a prepared click.
        const bytes=await fs.readFile(app.store.task(target.id).resumeSnapshot.file);
        await page.locator('input[type="file"]').setInputFiles({name:resume.name,mimeType:'text/plain',buffer:bytes});
      }
      await route.continue();
    };
    await context.route(BASE+'/api/bridge/authorize',authorizationRoute);
    await action('task-resume',{taskId:target.id});
    await until('attachment swap during final authorization',state,value=>replaced&&task(value,'design-001')?.status==='unknown');
    await context.unroute(BASE+'/api/bridge/authorize',authorizationRoute);
    assert.equal(requests(await fixture(),'beta','design-001').length,0);assert.equal(observedPosts('beta','design-001').length,0);
    assert.equal(task(await state(),'design-001').canResume,false);
    assert.equal(gated,true);assert.equal(replaced,true,'the real final-authorization request must be intercepted');
    assert.equal(app.store.task(target.id).submissionStarted,true);
    assert.equal(app.store.dailyUsed(),4,'safe attachment abort preserves its submission boundary');
  });
  await check('提交派发后单项暂停撤销最终授权，实际POST为零且历史不清除',async()=>{
    const target=task(await state(),'sales-001');assert.ok(target);let paused=false;
    const pauseRoute=async route=>{
      if(!paused && app.store.command?.taskId===target.id && app.store.command.op==='submit'){
        paused=true;const response=await action('task-pause',{taskId:target.id});
        assert.equal(response.pauseOutcome,'authorization-revoked');assert.equal(response.verificationOnly,true);
      }
      await route.continue();
    };
    await context.route(BASE+'/api/bridge/authorize',pauseRoute);
    await action('task-resume',{taskId:target.id});
    await until('submit pause acknowledged by runner',state,value=>paused&&!app.store.command&&task(value,'sales-001')?.status==='unknown');
    await context.unroute(BASE+'/api/bridge/authorize',pauseRoute);
    assert.equal(requests(await fixture(),'alpha','sales-001').length,0);assert.equal(observedPosts('alpha','sales-001').length,0);
    assert.equal(task(await state(),'sales-001').canResume,false);
    assert.equal(app.store.task(target.id).submissionStarted,true);
    assert.equal(paused,true,'the real final-authorization request must reach the pause gate');
    assert.equal(app.store.dailyUsed(),5,'safe pause retains the fifth boundary without posting an application');
    const actual=await fixture();assert.equal(actual.submitRequests.length,3);assert.equal(actual.receipts.length,3);assert.equal(applicationHttpPosts.length,3);
    evidence.safetyScenarios={attachmentPreflightReached:true,attachmentFinalAuthorizationReached:true,pauseFinalAuthorizationReached:true,attachmentPosts:0,pausePosts:0,attachmentHttpPosts:observedPosts('beta','design-001').length,pauseHttpPosts:observedPosts('alpha','sales-001').length,totalHttpApplicationPosts:applicationHttpPosts.length,retainedSubmissionBoundaries:5};
  });
}
let watchdog;
try {
  await Promise.race([workflow(),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(new Error('Workflow browser regression exceeded 180 seconds')),180_000);})]);
  evidence.status='PASS';
} catch(error) {
  evidence.status='FAIL';evidence.error=error.message;process.exitCode=1;console.error(error.stack);
  // Only explicitly fictional fixture identities and status codes are exposed.
  // No applicant fields, keys, URLs, cookies, storage values or session data.
  try{
    const snapshot=await state();
    evidence.failureState={connected:snapshot.connection.connected,running:snapshot.running,paused:snapshot.paused,
      command:app.store.command?{op:app.store.command.op,jobId:app.store.command.taskId?app.store.task(app.store.command.taskId).jobId:null}:null,
      queued:app.store.queue.map(command=>({op:command.op,siteId:command.siteId})),
      sites:snapshot.sites.map(site=>({id:site.id,login:site.login?.status,discoveryError:site.lastDiscoveryError||null})),
      tasks:snapshot.tasks.map(task=>({jobId:task.jobId,status:task.status,phase:task.phase,issue:task.issue?.kind||null,lastStep:task.steps.at(-1)?.label||null,reason:['manual','unknown'].includes(task.issue?.kind)?safeDiagnostic(task.steps.at(-1)?.detail || task.issue.detail).slice(0,150):null})),
      fixtureEvents,applicationHttpPosts,pageErrors:pageErrors.slice(-3),consoleErrors:consoleErrors.slice(-3)};
    const actual=await fixture();
    evidence.failureState.fixtureSummary={requests:actual.submitRequests.length,receipts:actual.receipts.map(receipt=>{
      const task=app.store.state.tasks.find(task=>task.jobId===receipt.jobId&&app.store.site(task.siteId).tenant===receipt.tenant);
      const locked=task?.resumeSnapshot;
      return {jobId:receipt.jobId,nameMatches:receipt.fileName===locked?.name,sizeMatches:receipt.fileSize===locked?.size,hashMatches:receipt.sha256===locked?.sha256};
    })};
    notice('Fictional workflow state at failure',evidence.failureState);
    await pairingDiagnostic(context?.serviceWorkers()[0]);
  }catch{notice('Fictional workflow state at failure',{readFailed:true});}

  // Keep the concrete failure visible through the Checks API as well as log storage.
  // This suite contains fictional data only; do not emit browser storage or API keys.
  // Launch command lines are very long; preserve the exit signal and stack tail
  // within GitHub's annotation limit rather than truncating them away.
  const detail=String(error.stack||error.message).split('\n').filter(line=>line.length<800).join('\n').slice(-3800);
  const annotation=detail.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
  console.error('::error title=Fictional workflow browser regression::'+annotation);
}
finally {
  clearTimeout(watchdog);releaseApply?.();
  try {await context?.close();}catch(error){evidence.cleanupError=error.message;process.exitCode=1;}
  try {await app?.close();}catch(error){evidence.cleanupError=error.message;process.exitCode=1;}
  evidence.finishedAt=new Date().toISOString();
  // No screenshots, cookies, pairing keys, or raw applicant profiles in evidence.
  await fs.writeFile(path.join(evidenceRoot,'workflow-browser.json'),JSON.stringify(evidence,null,2));
  await removeTestDirectory(isolated);
}
