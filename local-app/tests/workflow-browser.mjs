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
const testKey=randomBytes(24).toString('base64url'),results=[],pageErrors=[];
const evidence={startedAt:new Date().toISOString(),environment:{platform:process.platform,architecture:process.arch,os:os.release(),node:process.version,githubActions:process.env.GITHUB_ACTIONS==='true',runId:process.env.GITHUB_RUN_ID||null,runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,commit:process.env.GITHUB_SHA||null,containerImage:process.env.CLOUD_PLAYWRIGHT_IMAGE||null},scope:'Real loaded extension, dashboard HTTP API, actual fixture DOM and native multipart requests; fictional data only.',limitations:['No real recruiting website or personal account tested.','No Windows production browser or toolbar acceptance.','Controlled-time and missed-day schedule decisions are covered by the separate Node tests; this journey also checks a due schedule respects manual pause.'],results};
let app,context,dashboard,key,releaseApply;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(name,read,predicate,timeout=45_000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline) {const value=await read();if(predicate(value))return value;await delay(150);}
  throw new Error('Timed out: '+name);
}
async function check(name,fn) {
  const started=Date.now();
  try {await fn();results.push({name,status:'PASS',durationMs:Date.now()-started});console.log('PASS '+name);}
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
async function start() {app=await createApp({dataDir,testMode:true,testKey});assert.equal(app.url,BASE);}
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
    throw error;
  }
  evidence.environment.browser=context.browser().version();
  context.on('page',page=>page.on('pageerror',error=>pageErrors.push(error.message)));
  dashboard=context.pages()[0]||await context.newPage();dashboard.on('pageerror',error=>pageErrors.push(error.message));
  await dashboard.goto(BASE);await dashboard.locator('meta[name="local-key"]').waitFor({state:'attached'});
  key=await dashboard.locator('meta[name="local-key"]').getAttribute('content');
  assert.match(key,/^[A-Za-z0-9_-]{32,256}$/);
  // This is the real dashboard button, content script, service worker and runner pairing.
  await dashboard.locator('#connect-button').click();
  await until('actual extension pairing',state,value=>value.connection.connected&&value.connection.profileId);
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10_000});
  assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);
  evidence.environment.extensionId=new URL(worker.url()).host;
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
    await delay(800);assert.equal((await fixture()).submitRequests.length,0);
    await action('resume');
    await until('original value blocks automatic overwrite',state,value=>task(value,'web-001')?.status==='waiting_user');
    assert.equal(await betaPage.locator('[name="personal.name"]').inputValue(),'用户接管的虚构姓名');
    assert.equal((await fixture()).submitRequests.length,0);
    await dashboard.locator('nav [data-view="queue"]').click();
    const betaRow=dashboard.locator('tbody tr').filter({hasText:betaTask.title});
    await betaRow.getByRole('button',{name:'查看详情',exact:true}).click();
    await dashboard.locator('#task-dialog').getByRole('button',{name:'跳过此任务',exact:true}).click();
    const skipped=await until('same beta task skipped',state,value=>task(value,'web-001')?.status==='skipped');
    assert.equal(task(skipped,'web-001').id,betaTask.id);assert.equal(task(skipped,'web-001').canResume,true);
    assert.equal(requests(await fixture(),'beta','web-001').length,0);
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
    assert.equal(task(await state(),'cpp-001').status,'paused');assert.equal(requests(await fixture(),'alpha','cpp-001').length,0);
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
    await action('verify',{taskId:unknownTask.id});
    await until('expired-session verification was actually processed',state,value=>task(value,'cpp-002').steps.some(step=>step.label==='核对接收结果'));
    assert.equal(task(await state(),'cpp-002').status,'unknown');assert.equal(requests(await fixture(),'alpha','cpp-002').length,1);
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
    await action('resume');await delay(1000);assert.equal((await fixture()).submitRequests.length,3);
  });
  await check('重新实际登录后只读核对恢复未知结果，重启和重连没有重复申请',async()=>{
    await loginAlpha();await action('verify',{taskId:unknownTask.id});
    const recovered=await until('read-only receipt recovery',state,value=>task(value,'cpp-002')?.status==='submitted');
    assert.equal(task(recovered,'cpp-002').id,unknownTask.id);
    for(const [tenant,id]of [['beta','web-001'],['alpha','cpp-001'],['alpha','cpp-002']])await verifyReceipt(tenant,id,resume);
    const actual=await fixture();assert.equal(actual.submitRequests.length,3);assert.equal(actual.receipts.length,3);
    assert.deepEqual(pageErrors,[],'No dashboard, fixture, or extension page script errors');
    evidence.summary={actualMultipartRequests:actual.submitRequests.length,acceptedReceipts:actual.receipts.length,submittedTasks:recovered.stats.demo.submitted,profileVersion:recovered.profile.version,resumeVersion:recovered.resume.version};
    assert.equal(evidence.summary.submittedTasks,3);
  });
}
let watchdog;
try {
  await Promise.race([workflow(),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(new Error('Workflow browser regression exceeded 180 seconds')),180_000);})]);
  evidence.status='PASS';
} catch(error) {
  evidence.status='FAIL';evidence.error=error.message;process.exitCode=1;console.error(error.stack);
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
