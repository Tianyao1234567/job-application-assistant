// PM-0008 C: bounded real browser persistence and preparation acceptance.
// Real-browser assertions: no expected-failure masking, Chrome API doubles or storage writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createAcceptance,BASE,FIXTURE,delay,until} from './acceptance-runtime.mjs';

const h=await createAcceptance('c');
await h.run(async()=>{
  await h.start();await h.action('demo');
  const seeded=await h.state();
  await h.api('/settings',{settings:{...seeded.settings,dailyLimit:10},sites:seeded.sites});
  const expectedSettings=(await h.state()).settings;
  const alphaQuestion=(await h.action('add',{url:FIXTURE+'/site/alpha/jobs/cpp-001'})).task.id;
  const alphaNormal=(await h.action('add',{url:FIXTURE+'/site/alpha/jobs/cpp-002'})).task.id;
  const betaNormal=(await h.action('add',{url:FIXTURE+'/site/beta/jobs/web-001'})).task.id;
  const task=(value,id)=>value.tasks.find(task=>task.id===id);
  const site=(value,id)=>value.sites.find(site=>site.id===id);
  const idle=()=>until('real command has completed',h.state,()=>!h.app.store.command,75_000);
  const checkSite=async(siteId,expected)=>{
    const before=site(await h.state(),siteId).login.checkedAt;
    await h.action('site-check',{siteId});
    const value=await until('fresh site page check: '+siteId+'/'+expected,h.state,value=>site(value,siteId).login.checkedAt!==before&&site(value,siteId).login.status===expected);
    await idle();return value;
  };
  const records=(value,tenant,jobId)=>value.submitRequests.filter(request=>request.tenant===tenant&&request.jobId===jobId);
  const receiptRows=(value,tenant,jobId)=>value.receipts.filter(receipt=>receipt.tenant===tenant&&receipt.jobId===jobId);
  const verifyPinned=async(taskId,version)=>{
    const stored=h.app.store.task(taskId),target=h.app.store.site(stored.siteId);
    assert.equal(stored.profileVersion,version);assert.equal(stored.resumeVersion,version);
    const actual=await h.fixture(),requests=records(actual,target.tenant,stored.jobId),receipts=receiptRows(actual,target.tenant,stored.jobId);
    assert.equal(h.posts(target.tenant,stored.jobId).length,1);assert.equal(requests.length,1);assert.equal(requests[0].accepted,true);assert.equal(receipts.length,1);
    const pinned=stored.resumeSnapshot,receipt=receipts[0];
    assert.equal(receipt.fileName,pinned.name);assert.equal(receipt.fileSize,pinned.size);assert.equal(receipt.sha256,pinned.sha256);
    const bytes=await fs.readFile(path.join(h.dataDir,'fixture','uploads',receipt.id+'.bin'));
    assert.equal(bytes.length,pinned.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),pinned.sha256);
    return receipt;
  };
  const unchangedCounts=async(count)=>{
    const value=await h.fixture();assert.equal(h.posts().length,count);assert.equal(value.submitRequests.length,count);assert.equal(value.receipts.length,count);return value;
  };
  // Call reload on the actual native result document. Never navigate to a fresh GET
  // first: that would miss browser-driven POST replay on a POST response document.
  const refreshNativeResult=async(page,{receipt=false,expectedTask,expectedStatus})=>{
    assert.ok(page&&!page.isClosed(),'the real task result page must still exist');
    const before=h.posts().length,fixtureBefore=await h.fixture();let dialogSeen=false;
    const dialog=async dialog=>{
      dialogSeen=true;
      // Dismiss only to release the automation; the assertion below still fails.
      // Dismissal must never be counted as a successfully refreshed document.
      await dialog.dismiss();
    };
    page.on('dialog',dialog);
    try{
      const response=await page.reload({waitUntil:'domcontentloaded'});
      assert.equal(h.posts().length,before,'refresh must not issue another native application POST');
      assert.equal(response.request().method(),'GET','the native result must reload as a read-only document');
      await page.locator('[data-session-status]').waitFor();
      if(receipt)await page.locator('[data-receipt-id]').waitFor();
      await delay(400);
      assert.equal(dialogSeen,false,'a resubmission/confirmation dialog is not successful refresh evidence');
      assert.equal(h.posts().length,before,'refresh must not issue another native application POST');
      const after=await h.fixture();assert.equal(after.submitRequests.length,fixtureBefore.submitRequests.length);assert.equal(after.receipts.length,fixtureBefore.receipts.length);
      assert.equal(task(await h.state(),expectedTask).status,expectedStatus);
    }finally{page.off('dialog',dialog);}
  };
  await h.launch('execution');
  const executionProfile=(await h.state()).connection.profileId;
  let originalIssue,betaPage,unknownTask,unknownPage;

  await h.check('整站暂跳保留原因，beta执行中刷新后台和申请页仍锁定旧版本',async()=>{
    const waiting=await checkSite('local-alpha','login');
    assert.equal(task(waiting,alphaQuestion).status,'waiting_user');assert.equal(task(waiting,alphaNormal).status,'waiting_user');
    const issue=waiting.issues.find(issue=>issue.siteId==='local-alpha'&&issue.status==='open'&&issue.kind==='login');assert.ok(issue);
    originalIssue={id:issue.id,title:issue.title,detail:issue.detail};
    assert.equal(waiting.issues.filter(issue=>issue.siteId==='local-alpha'&&issue.status==='open'&&issue.kind==='login').length,1);
    await h.dashboard.locator('nav [data-view="sites"]').click();
    await h.dashboard.locator('.site-card').filter({hasText:site(waiting,'local-alpha').name}).getByRole('button',{name:'暂时跳过本站',exact:true}).click();
    await until('alpha site skip is persisted',h.state,value=>site(value,'local-alpha').skipped===true);
    await checkSite('local-beta','ready');
    let hit=false,release;const released=new Promise(resolve=>{release=resolve;});
    const sessionRoute=async route=>{
      if(!hit&&h.app.store.command?.taskId===betaNormal&&h.app.store.command.op==='upload'){
        hit=true;await released;
      }
      try{await route.continue();}catch{
        // A real document refresh may abort its old pending session request.
      }
    };
    await h.context.route(FIXTURE+'/site/beta/session',sessionRoute);
    try{
      await h.action('resume');
      const locked=await until('actual beta upload preflight is pending',h.state,value=>hit&&task(value,betaNormal).status==='running'&&h.app.store.command?.op==='upload');
      assert.equal(task(locked,betaNormal).profileVersion,1);assert.equal(task(locked,betaNormal).resumeVersion,1);assert.equal(h.posts().length,0);
      const edited=structuredClone(seeded.profile.data);edited.personal.name.zh='第二版虚构申请人，仅用于C组验收';edited.personal.name.confirmed=true;edited.personal.name.source='C组虚构测试';
      h.protect(edited.personal.name.zh);
      await h.api('/profile',{data:edited,mode:'demo',confirmed:true});
      const replacement=Buffer.from('Fictional C acceptance replacement resume v2 only.\n');h.protect(replacement.toString());
      await h.api('/resume',{name:'fictional-c-v2.txt',mime:'text/plain',base64:replacement.toString('base64'),mode:'demo'});
      const updated=await h.state();assert.equal(updated.profile.version,2);assert.equal(updated.resume.version,2);
      assert.equal(task(updated,betaNormal).profileVersion,1);assert.equal(task(updated,betaNormal).resumeVersion,1);
      betaPage=h.context.pages().find(page=>page.url()===FIXTURE+'/site/beta/apply/web-001');assert.ok(betaPage);
      // Both refreshes happen while the real upload command is still running.
      await h.dashboard.reload({waitUntil:'domcontentloaded'});await h.dashboard.locator('meta[name="local-key"]').waitFor({state:'attached'});
      assert.equal(task(await h.state(),betaNormal).status,'running');
      await betaPage.reload({waitUntil:'domcontentloaded'});await betaPage.locator('[data-application-form]').waitFor();
      // Stop after the actual refresh, not before it, so subsequent authorization
      // cannot race the evidence inspection. Do not alter task or ledger storage.
      await h.action('pause');release();await idle();
      const refreshed=await h.state();assert.deepEqual(refreshed.settings,expectedSettings);
      assert.equal(task(refreshed,betaNormal).id,betaNormal);assert.equal(task(refreshed,betaNormal).profileVersion,1);assert.equal(task(refreshed,betaNormal).resumeVersion,1);
      assert.equal(h.posts().length,0);assert.equal(h.app.store.task(betaNormal).submissionStarted,undefined);
      const retained=refreshed.issues.find(issue=>issue.id===originalIssue.id);assert.ok(retained);
      assert.equal(retained.title,originalIssue.title);assert.equal(retained.detail,originalIssue.detail);assert.equal(retained.status,'skipped');
      assert.equal(site(refreshed,'local-alpha').skipped,true);
      if(task(refreshed,betaNormal).canResume)await h.action('task-resume',{taskId:betaNormal});
      await h.action('resume');
      const done=await until('same beta task completes with its pinned old versions',h.state,value=>task(value,betaNormal).status==='submitted');
      const receipt=await verifyPinned(betaNormal,1);assert.equal(receipt.fields['personal.name'],seeded.profile.data.personal.name.zh);
      assert.equal(done.profile.version,2);assert.equal(done.resume.version,2);assert.equal(site(done,'local-alpha').skipped,true);
      assert.equal(h.posts('alpha').length,0);await unchangedCounts(1);
      h.evidence.facts.inProgressRefresh={realUploadWindowReached:true,dashboardRefreshed:true,applicationRefreshed:true,sameTask:true,pinnedProfileVersion:1,pinnedResumeVersion:1,currentProfileVersion:2,currentResumeVersion:2,oldFileBytesVerified:true,betaContinuedWhileAlphaSkipped:true,httpPosts:1};
    }finally{release?.();await h.context.unroute(FIXTURE+'/site/beta/session',sessionRoute);}
  });

  await h.check('submitted和unknown的实际原生结果页及执行页刷新均不产生第二次申请',async()=>{
    await idle();await refreshNativeResult(betaPage,{receipt:true,expectedTask:betaNormal,expectedStatus:'submitted'});await unchangedCounts(1);
    await h.fixture('/scenario',{tenant:'beta',jobId:'design-001',loseReceipt:true,expireSessionOnSubmit:true});
    unknownTask=(await h.action('add',{url:FIXTURE+'/site/beta/jobs/design-001'})).task.id;
    const unknown=await until('actual accepted beta submission has an unknown visible result',h.state,value=>task(value,unknownTask).status==='unknown');await idle();
    assert.equal(task(unknown,unknownTask).canResume,false);assert.equal(task(unknown,unknownTask).canVerify,true);await verifyPinned(unknownTask,2);await unchangedCounts(2);
    const boundary={day:h.app.store.task(unknownTask).submitDay,started:h.app.store.task(unknownTask).submissionStarted};assert.equal(boundary.started,true);
    unknownPage=h.context.pages().find(page=>{
      const url=new URL(page.url());return url.origin===FIXTURE&&['/site/beta/apply/design-001','/site/beta/receipt/design-001'].includes(url.pathname);
    });assert.ok(unknownPage);
    await refreshNativeResult(unknownPage,{expectedTask:unknownTask,expectedStatus:'unknown'});await unchangedCounts(2);
    const runner=h.context.pages().find(page=>/\/runner\/index\.html$/.test(page.url()));assert.ok(runner);
    const previousClient=h.app.store.connection.clientId;await runner.reload({waitUntil:'domcontentloaded'});
    const reconnected=await until('refreshed runner has a new actual heartbeat',h.state,value=>value.connection.connected&&h.app.store.connection?.clientId!==previousClient,75_000);
    assert.equal(reconnected.connection.profileId,executionProfile);
    await h.dashboard.reload({waitUntil:'domcontentloaded'});
    const after=await h.state();assert.equal(task(after,betaNormal).status,'submitted');assert.equal(task(after,unknownTask).status,'unknown');
    assert.equal(h.app.store.task(unknownTask).submissionStarted,boundary.started);assert.equal(h.app.store.task(unknownTask).submitDay,boundary.day);
    assert.equal(task(after,unknownTask).canResume,false);await unchangedCounts(2);
    h.evidence.facts.outcomeRefresh={submittedNativeResultReloaded:true,unknownNativeResultReloaded:true,runnerReloaded:true,dashboardReloaded:true,sameProfile:true,submittedRetained:true,unknownRetained:true,submissionHistoryRetained:true,httpPosts:2,receipts:2};
  });

  await h.check('服务重启保留整站跳过和原原因，正常恢复后alpha原任务继续',async()=>{
    await idle();await h.closeBrowser();await until('closed browser is actually disconnected',h.state,value=>!value.connection.connected,15_000);
    await h.closeApp();await h.start();await h.launch('execution');
    const restored=await h.state();assert.equal(restored.connection.profileId,executionProfile);assert.deepEqual(restored.settings,expectedSettings);assert.equal(restored.paused,true);assert.equal(restored.running,false);
    assert.equal(restored.profile.version,2);assert.equal(restored.resume.version,2);assert.equal(site(restored,'local-alpha').skipped,true);
    assert.equal(task(restored,alphaQuestion).id,alphaQuestion);assert.equal(task(restored,alphaNormal).id,alphaNormal);
    assert.equal(task(restored,betaNormal).profileVersion,1);assert.equal(task(restored,betaNormal).resumeVersion,1);assert.equal(task(restored,betaNormal).status,'submitted');
    assert.equal(task(restored,unknownTask).status,'unknown');assert.equal(h.app.store.task(unknownTask).submissionStarted,true);
    const cause=restored.issues.find(issue=>issue.id===originalIssue.id);assert.ok(cause);assert.equal(cause.title,originalIssue.title);assert.equal(cause.detail,originalIssue.detail);assert.equal(cause.status,'skipped');
    await delay(500);await unchangedCounts(2);
    await h.dashboard.locator('nav [data-view="sites"]').click();
    await h.dashboard.locator('.site-card').filter({hasText:site(restored,'local-alpha').name}).getByRole('button',{name:'恢复并检查',exact:true}).click();
    const checked=await until('restored alpha requires real login rather than a checkmark',h.state,value=>!site(value,'local-alpha').skipped&&site(value,'local-alpha').login.status==='login');await idle();
    assert.equal(task(checked,alphaQuestion).id,alphaQuestion);assert.equal(task(checked,alphaNormal).id,alphaNormal);assert.equal(h.posts('alpha').length,0);
    await (await h.login('alpha','demo')).close();await checkSite('local-alpha','ready');await h.action('resume');
    const resumed=await until('same alpha tasks resume after actual login and reinspection',h.state,value=>task(value,alphaNormal).status==='submitted'&&task(value,alphaQuestion).status==='waiting_answer');
    assert.equal(task(resumed,alphaNormal).id,alphaNormal);assert.equal(task(resumed,alphaQuestion).id,alphaQuestion);assert.equal(h.posts('alpha','cpp-001').length,0);
    await verifyPinned(alphaNormal,2);await unchangedCounts(3);
    const archived=resumed.issues.find(issue=>issue.id===originalIssue.id);assert.ok(archived);assert.equal(archived.title,originalIssue.title);assert.equal(archived.detail,originalIssue.detail);assert.equal(archived.status,'skipped');
    assert.equal(task(resumed,unknownTask).status,'unknown');
    h.evidence.facts.siteSkip={sameTasks:true,originalCauseRetained:true,skipSurvivedRestart:true,otherSiteCompletedWhileSkipped:true,restoreRequiresActualLogin:true,normalTaskSubmittedOnce:true,questionTaskStillWaitsForAnswer:true,httpPosts:3,receipts:3};
  });

  await h.check('unknown在刷新和重启后仍禁止重投，重新登录只读核对恢复同任务',async()=>{
    const refused=await h.action('task-resume',{taskId:unknownTask},{allowFailure:true});assert.equal(refused.ok,false);assert.equal(refused.status,400);await unchangedCounts(3);
    await (await h.login('beta','demo')).close();await checkSite('local-beta','ready');
    await h.action('verify',{taskId:unknownTask});
    const verified=await until('unknown original task resolves through a read-only receipt lookup',h.state,value=>task(value,unknownTask).status==='submitted');
    assert.equal(task(verified,unknownTask).id,unknownTask);assert.equal(h.app.store.task(unknownTask).submissionStarted,true);
    await verifyPinned(unknownTask,2);await unchangedCounts(3);
    assert.deepEqual(verified.settings,expectedSettings);assert.equal(verified.profile.version,2);assert.equal(verified.resume.version,2);
    assert.equal(verified.tasks.filter(task=>task.status==='submitted').length,3);assert.equal(task(verified,alphaQuestion).status,'waiting_answer');
    h.evidence.facts.readOnlyRecovery={sameTask:true,retryRejected:true,readonlyVerify:true,submissionHistoryRetained:true,httpPosts:3,uniqueReceipts:3,submittedTasks:3,waitingAnswerTasks:1};
    // Only this fictional isolated context is inspected; never return Cookie values.
    h.protect(...(await h.context.cookies(FIXTURE)).map(cookie=>cookie.value),JSON.stringify(seeded.profile.data),'FICTIONAL_C_PRIVATE_\"ESCAPED\\MARKER');
    await h.verifyPrivateEvidence();
    h.evidence.facts.controlledTimeEvidence={tier:'Node',tests:[
      '未知结果消耗当日尝试额度，核对不受额度限制，跨日只执行一次计划',
      '未手动暂停的新数据可以等待计划，重启后只触发当日一次',
      'pause 持久阻止到点计划，改设置与跨日重启不会解除',
      'stop 持久阻止到点计划，改设置与跨日重启不会解除',
      '手动暂停保留上次计划记录；失败的继续不会解除暂停'
    ]};
  });
  assert.equal(h.evidence.results.length,4,'all four selected C acceptance stages must execute');
});
