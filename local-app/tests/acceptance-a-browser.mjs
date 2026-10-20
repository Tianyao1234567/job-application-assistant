import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createAcceptance,BASE,FIXTURE,delay,until} from './acceptance-runtime.mjs';

const h=await createAcceptance('a');
await h.run(async()=>{
  await h.start();await h.action('demo');
  const initial=await h.state();
  await h.api('/settings',{settings:{...initial.settings,dailyLimit:10},sites:initial.sites.map(site=>({...site,enabled:site.id==='local-alpha'}))});
  const added=await h.action('add',{url:FIXTURE+'/site/alpha/jobs/cpp-002'}),taskId=added.task.id;
  const task=value=>value.tasks.find(task=>task.id===taskId),site=value=>value.sites.find(site=>site.id==='local-alpha');
  let firstProfile,writeAuthorizations=0;
  h.app.server.on('request',request=>{
    if(request.url==='/api/bridge/authorize' && h.app.store.command?.taskId===taskId && ['fill','upload','answer','submit'].includes(h.app.store.command.op))writeAuthorizations++;
  });
  const idle=()=>until('previous real command finished',h.state,()=>!h.app.store.command);
  const checkSite=async(expected)=>{
    const before=site(await h.state()).login.checkedAt;
    await h.action('site-check',{siteId:'local-alpha'});
    const value=await until('fresh alpha browser identity check: '+expected,h.state,value=>site(value).login.checkedAt!==before&&site(value).login.status===expected);
    await idle();return value;
  };
  const noApplication=async()=>{
    assert.equal(h.posts().length,0);const actual=await h.fixture();
    assert.equal(actual.submitRequests.length,0);assert.equal(actual.receipts.length,0);
    assert.equal(task(await h.state()).id,taskId);assert.equal(h.app.store.task(taskId).submissionStarted,undefined);
  };
  const closeDisconnected=async()=>{
    await h.closeBrowser();const snapshot=await until('closed execution browser is disconnected',h.state,value=>!value.connection.connected,15_000);
    assert.equal(snapshot.connection.connected,false);
  };
  await h.check('另一个真实隔离profile已原生登录，关闭后不向执行profile转移会话',async()=>{
    await h.launch('separate',{pair:false});const page=await h.login('alpha','demo');
    assert.equal(await page.locator('[data-session-status]').getAttribute('data-session-status'),'ready');
    await page.close();await h.closeBrowser();await noApplication();
    h.evidence.facts.separateProfileNativeLogin=true;
  });
  await h.check('执行profile未登录时连续三次后台重新检查仍需登录且零填写上传提交',async()=>{
    await h.launch('execution');firstProfile=(await h.state()).connection.profileId;
    assert.notEqual(h.profiles.get('execution'),h.profiles.get('separate'));
    await h.action('resume');await until('unlogged execution profile waits for login',h.state,value=>task(value).status==='waiting_user'&&site(value).login.status==='login');await idle();
    await h.dashboard.locator('nav [data-view="sites"]').click();
    for(let count=0;count<3;count++){
      const before=site(await h.state()).login.checkedAt;
      await h.dashboard.locator('.site-card').filter({hasText:site(await h.state()).name}).getByRole('button',{name:'重新检查页面',exact:true}).click();
      const value=await until('actual repeated unlogged page check',h.state,value=>site(value).login.checkedAt!==before&&site(value).login.status==='login');
      assert.equal(task(value).status,'waiting_user');await idle();
    }
    const page=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/login');assert.ok(page);
    assert.equal(await page.locator('[data-session-status]').getAttribute('data-session-status'),'login');
    assert.equal(writeAuthorizations,0,'login checks must never authorize field/file/submission writes');await noApplication();
    await h.action('pause');h.evidence.facts.unloggedChecks={count:3,stillLogin:true,writeAuthorizations:0,httpPosts:0};
  });
  await h.check('切换真实执行profile重新检测身份，另一个profile就绪不能遗留为当前就绪',async()=>{
    await closeDisconnected();await h.launch('separate');
    assert.notEqual((await h.state()).connection.profileId,firstProfile);
    assert.equal(site(await h.state()).login.status,'unknown');
    await checkSite('ready');await noApplication();
    await closeDisconnected();await h.launch('execution');
    assert.equal((await h.state()).connection.profileId,firstProfile);
    assert.equal(site(await h.state()).login.status,'unknown');
    await checkSite('login');await noApplication();
    h.evidence.facts.profileSwitch={naturalDistinctIds:true,resetOnSwitch:true,executionStillUnlogged:true,disconnectionDetected:true};
  });
  await h.check('同一持久profile重启保留有效alpha登录；仅清测试会话后重启实际报告丢失',async()=>{
    await (await h.login('alpha','demo')).close();await checkSite('ready');
    await closeDisconnected();await h.launch('execution');await checkSite('ready');
    assert.equal((await h.state()).connection.profileId,firstProfile);
    const retained=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/login');assert.ok(retained);
    assert.equal(await retained.locator('[data-session-status]').getAttribute('data-account'),'demo');
    // This API operates only on the currently open isolated test profile.
    assert.ok(h.profiles.get('execution').startsWith(h.isolated+path.sep));
    await h.context.clearCookies({name:'fixture_alpha'});
    await closeDisconnected();await h.launch('execution');await checkSite('login');
    assert.equal((await h.state()).connection.profileId,firstProfile);await noApplication();
    h.evidence.facts.sessionRestart={validAlphaCookieRetained:true,onlyTestCookieCleared:true,clearedCookieReportedLost:true,sameProfileIdentity:true};
  });
  await h.check('未知账号、错误账号和租户不符分别显示原因，纠正后仍是原任务',async()=>{
    await h.fixture('/session',{tenant:'alpha',status:'unknown',allSessions:true});let value=await checkSite('unknown');
    assert.equal(site(value).login.reason,'unknown');
    await (await h.login('alpha','other')).close();value=await checkSite('account');
    assert.equal(site(value).login.reason,'account-mismatch');
    await h.fixture('/session',{tenant:'alpha',status:'ready',account:'demo',reportedTenant:'beta',allSessions:true});value=await checkSite('account');
    assert.equal(site(value).login.reason,'tenant-mismatch');
    const wrong=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/login');assert.ok(wrong);
    assert.equal(await wrong.locator('[data-session-status]').getAttribute('data-tenant'),'beta');
    await h.dashboard.locator('nav [data-view="sites"]').click();
    await h.dashboard.locator('.site-card').filter({hasText:site(value).name}).getByText(site(value).login.message,{exact:false}).waitFor();
    await noApplication();
    await (await h.login('alpha','demo')).close();value=await checkSite('ready');
    assert.equal(task(value).id,taskId);assert.equal(h.app.store.task(taskId).submissionStarted,undefined);
    h.evidence.facts.identityReasons={unknown:true,accountMismatch:true,tenantMismatch:true,actualWrongTenantMarker:true,correctedSameTask:true,httpPosts:0};
  });
  await h.check('提交边界前实际会话失效阻止上传，再登录先复查原任务且只申请一次',async()=>{
    let expired=false;
    const routeSession=async route=>{
      if(!expired&&h.app.store.command?.taskId===taskId&&h.app.store.command.op==='upload'){
        expired=true;await h.fixture('/session',{tenant:'alpha',status:'expired',allSessions:true});
      }
      await route.continue();
    };
    await h.context.route(FIXTURE+'/site/alpha/session',routeSession);await h.action('resume');
    const stopped=await until('actual pre-boundary session expiry pauses original task',h.state,value=>expired&&task(value).status==='waiting_user'&&site(value).login.status==='expired');await idle();
    assert.equal(site(stopped).login.reason,'expired');await noApplication();
    const form=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/apply/cpp-002');assert.ok(form);
    assert.equal(await form.locator('input[type="file"]').evaluate(node=>node.files.length),0);
    const stoppedSteps=task(stopped).steps.length;
    await h.context.unroute(FIXTURE+'/site/alpha/session',routeSession);
    await (await h.login('alpha','demo')).close();await h.action('site-check',{siteId:'local-alpha'});
    const completed=await until('same task submits once after actual login recovery',h.state,value=>task(value).status==='submitted');
    assert.equal(task(completed).id,taskId);assert.equal(h.posts('alpha','cpp-002').length,1);
    const actual=await h.fixture(),receipts=actual.receipts.filter(receipt=>receipt.tenant==='alpha'&&receipt.jobId==='cpp-002');
    assert.equal(actual.submitRequests.length,1);assert.equal(receipts.length,1);
    const pinned=h.app.store.task(taskId).resumeSnapshot,receipt=receipts[0];
    assert.equal(receipt.fileName,pinned.name);assert.equal(receipt.fileSize,pinned.size);assert.equal(receipt.sha256,pinned.sha256);
    const received=await fs.readFile(path.join(h.dataDir,'fixture','uploads',receipt.id+'.bin'));
    assert.equal(createHash('sha256').update(received).digest('hex'),pinned.sha256);
    const recovery=task(completed).steps.slice(stoppedSteps).map(step=>step.label);
    assert.ok(recovery.indexOf('登录检查通过')>=0);assert.ok(recovery.indexOf('已读取申请表')>recovery.indexOf('登录检查通过'));
    assert.equal(task(completed).submissionStarted,true);
    h.evidence.facts.preBoundaryRecovery={uploadSessionReached:true,expiredBeforeBoundary:true,noFileUploadAtExpiry:true,sameTask:true,reinspectedBeforeResume:true,httpPosts:1,receipts:1,pinnedFileVerified:true,submissionHistoryRetained:true};
  });
});
