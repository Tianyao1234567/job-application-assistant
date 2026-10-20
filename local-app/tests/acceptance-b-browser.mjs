import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createAcceptance,BASE,FIXTURE,delay,until} from './acceptance-runtime.mjs';

const h=await createAcceptance('b');
await h.run(async()=>{
  let collector;
  try{
    await h.start();await h.action('demo');
    const initial=await h.state();
    await h.api('/settings',{settings:{...initial.settings,dailyLimit:10},sites:initial.sites.map(site=>({...site,enabled:site.id==='local-beta'}))});
    const added=await h.action('add',{url:FIXTURE+'/site/beta/jobs/web-001'}),betaId=added.task.id;
    await h.launch('execution');
    const stateTask=(value,id)=>value.tasks.find(task=>task.id===id);
    const idle=()=>until('real command completed before the next protection case',h.state,()=>!h.app.store.command);
    const pageFor=(tenant,jobId)=>h.context.pages().find(page=>{try{return new URL(page.url()).pathname===`/site/${tenant}/apply/${jobId}`;}catch{return false;}});
    const noApplication=async(id)=>{
      const actual=await h.fixture();assert.equal(h.posts().length,0);assert.equal(actual.submitRequests.length,0);assert.equal(actual.receipts.length,0);
      assert.equal(stateTask(await h.state(),id).id,id);assert.equal(h.app.store.task(id).submissionStarted,undefined);
    };
    const resetBeta=async()=>{
      let page=pageFor('beta','web-001');
      if(!page)page=h.context.pages().find(page=>page.url().startsWith(FIXTURE+'/site/beta/'));
      assert.ok(page);await page.goto(FIXTURE+'/site/beta/apply/web-001');await page.locator('[data-application-form]').waitFor();return page;
    };
    const waitProtected=async(id,kind)=>{
      const value=await until('a dispatched task reports the actual protection condition',h.state,value=>stateTask(value,id)?.status==='waiting_user'&&stateTask(value,id)?.issue?.kind===kind);
      await idle();return stateTask(value,id);
    };
    const routeAuthorize=async(id,operation,mutate)=>{
      let reached=false;
      const route=async request=>{
        const command=h.app.store.command;
        if(!reached&&command?.taskId===id&&command.op===operation){reached=true;await mutate();}
        await request.continue();
      };
      await h.context.route(BASE+'/api/bridge/authorize',route);
      return {get reached(){return reached;},close:()=>h.context.unroute(BASE+'/api/bridge/authorize',route)};
    };
    await h.check('真实填写已预检后页面结构改变，最终同步检查停止且零HTTP申请',async()=>{
      const gate=await routeAuthorize(betaId,'fill',async()=>{
        const page=pageFor('beta','web-001');assert.ok(page);
        await page.locator('label[for="personal.name"]').evaluate(node=>{node.textContent='变更后的普通姓名字段';});
      });
      try{
        await h.action('resume');const task=await waitProtected(betaId,'structure');assert.equal(gate.reached,true);
        assert.match(task.issue.detail,/结构/);
        const page=pageFor('beta','web-001');assert.equal(await page.locator('[name="personal.name"]').inputValue(),'');
        assert.equal(await page.locator('input[type="file"]').evaluate(node=>node.files.length),0);
        await noApplication(betaId);h.evidence.facts.structure={finalAuthorizationReached:true,stopped:true,httpPosts:0};
      }finally{await gate.close();}
      await resetBeta();
    });
    await h.check('实际失效岗位返回HTTP410，扩展明确报告失效而不填写或提交',async()=>{
      await h.fixture('/scenario',{tenant:'beta',jobId:'web-001',unavailable:true});let dispatched410=false;
      const response=reply=>{
        if(reply.status()===410&&reply.url()===FIXTURE+'/site/beta/jobs/web-001'&&h.app.store.command?.taskId===betaId&&h.app.store.command.op==='inspect')dispatched410=true;
      };
      h.context.on('response',response);
      try{
        const page=pageFor('beta','web-001');const navigation=await page.goto(FIXTURE+'/site/beta/jobs/web-001');assert.equal(navigation.status(),410);
        await h.action('task-resume',{taskId:betaId});const task=await waitProtected(betaId,'structure');
        assert.equal(dispatched410,true);assert.match(task.issue.detail,/失效/);
        const invalid=h.context.pages().find(page=>page.url()===FIXTURE+'/site/beta/jobs/web-001');assert.ok(invalid);
        await invalid.locator('[data-page-status="unavailable"]').waitFor();assert.equal(await invalid.locator('[data-application-form]').count(),0);
        await noApplication(betaId);h.evidence.facts.unavailable={actual410DuringInspection:true,clearReason:true,httpPosts:0};
      }finally{h.context.off('response',response);await h.fixture('/scenario',{tenant:'beta',jobId:'web-001',unavailable:false});}
      await resetBeta();
    });
    await h.check('实际人工验证会话在检查时停止，后台保留验证原因且零写入申请',async()=>{
      await h.fixture('/session',{tenant:'beta',status:'verification',allSessions:true});
      await h.action('task-resume',{taskId:betaId});
      const value=await until('actual verification marker is reported by the real runner',h.state,value=>stateTask(value,betaId)?.status==='waiting_user'&&value.sites.find(site=>site.id==='local-beta')?.login?.status==='verification');
      await idle();assert.match(stateTask(value,betaId).issue.title+' '+stateTask(value,betaId).issue.detail,/验证/);
      const page=h.context.pages().find(page=>page.url()===stateTask(value,betaId).currentUrl);
      assert.ok(page);await page.locator('[data-session-status="verification"]').waitFor();
      await noApplication(betaId);await h.action('pause');
      await h.fixture('/session',{tenant:'beta',status:'ready',account:'demo',allSessions:true});
      await h.action('site-check',{siteId:'local-beta'});
      await until('corrected beta session is freshly checked',h.state,value=>value.sites.find(site=>site.id==='local-beta')?.login?.status==='ready');await idle();
      await resetBeta();h.evidence.facts.verification={actualMarker:true,reasonPreserved:true,httpPosts:0};
    });
    await h.check('正常管理接口明确拒绝未适配与真实用途目标，独立可控接收端零请求',async()=>{
      let foreignRequests=0;
      collector=http.createServer((request,response)=>{foreignRequests++;request.resume();response.writeHead(200);response.end('Controlled fictional destination');});
      await new Promise(resolve=>collector.listen(0,'127.0.0.1',resolve));
      const origin='http://127.0.0.1:'+collector.address().port,before=await h.state();
      const unsupported={id:'controlled-unsupported',name:'可控未适配测试入口',origin,listUrl:origin+'/jobs',loginUrl:origin+'/login',tenant:'default',expectedAccount:'fictional',adapter:'unsupported',mode:'real',enabled:true};
      await h.api('/settings',{settings:before.settings,sites:[...before.sites,unsupported]});
      const queued=await h.action('add',{url:origin+'/job?id=fictional-one'});
      assert.equal(queued.task.status,'waiting_user');assert.equal(queued.task.issue.kind,'adapter');
      const rejected=await h.action('site-check',{siteId:unsupported.id},{allowFailure:true});
      assert.equal(rejected.status,400);assert.match(rejected.error,/待适配/);
      assert.equal(h.app.store.queue.some(command=>command.siteId===unsupported.id),false);
      const real=await h.state();await h.api('/settings',{settings:{...real.settings,mode:'real'},sites:real.sites});
      const refusedRun=await h.action('run',{}, {allowFailure:true});assert.equal(refusedRun.status,400);assert.match(refusedRun.error,/模式不一致|尚待适配/);
      await delay(500);assert.equal(foreignRequests,0);await noApplication(betaId);
      const restore=await h.state();await h.api('/settings',{settings:{...restore.settings,mode:'demo'},sites:restore.sites.map(site=>({...site,enabled:site.id==='local-beta'}))});
      h.evidence.facts.unsupported={adapterGuardExercised:true,realModeGuardExercised:true,foreignRequests:0,httpPosts:0};
    });
    await h.check('实际扩展隔离世界的扫描不采集凭据值，敏感映射与人工原值拒绝覆盖',async()=>{
      const password='FICTIONAL_B_PRIVATE_PASSWORD_MARKER',otp='FICTIONAL_B_PRIVATE_OTP_MARKER',sensitive='FICTIONAL_B_PRIVATE_SENSITIVE_MARKER',original='虚构人工接管原值';
      h.protect(password,otp,sensitive,original);
      const page=await h.context.newPage(),url=FIXTURE+'/site/beta/apply/web-001?acceptance=b-protection';await page.goto(url);
      await page.evaluate(({password,otp,sensitive,original})=>{
        const form=document.querySelector('[data-application-form]');
        const add=(id,label,type,value)=>{const row=document.createElement('div');row.className='field';const title=document.createElement('label');title.htmlFor=id;title.textContent=label;const input=document.createElement('input');Object.assign(input,{id,name:id,type,value});row.append(title,input);form.append(row);};
        add('bSecretPassword','登录密码','password',password);add('bSecretOtp','验证码 OTP','text',otp);add('bSensitiveSalary','期望薪资 Salary','text',sensitive);
        form.querySelector('[name="personal.name"]').value=original;
        globalThis.__bProtectionEvents={writes:0,submits:0};
        form.addEventListener('input',()=>globalThis.__bProtectionEvents.writes++);form.addEventListener('change',()=>globalThis.__bProtectionEvents.writes++);
        form.addEventListener('submit',()=>globalThis.__bProtectionEvents.submits++);
      },{password,otp,sensitive,original});
      const worker=h.context.serviceWorkers()[0];assert.ok(worker);
      const actual=await worker.evaluate(async({url,password,otp,sensitive,original})=>{
        const tabs=await chrome.tabs.query({url});if(tabs.length!==1)throw new Error('Expected one controlled protection document');
        const target={tabId:tabs[0].id};
        await chrome.scripting.executeScript({target,world:'ISOLATED',files:['content/guard.js','content/scan.js','content/fill.js']});
        const result=await chrome.scripting.executeScript({target,world:'ISOLATED',func:async(password,otp,sensitive,original)=>{
          const scan=JobFill.scan(),serialized=JSON.stringify(scan),salary=scan.fields.find(field=>field.hints.includes('bSensitiveSalary'));
          const name=scan.fields.find(field=>JobFill.nodes.get(field.token)?.node.name==='personal.name');
          if(!salary||!salary.blocked||!name)throw new Error('Protected and ordinary targets must be visible to the actual engine');
          const outcome=await JobFill.apply({site:scan.site,layout:scan.layout,approvals:[{token:salary.token,signature:salary.signature,value:'FICTIONAL_REQUESTED_VALUE',overwrite:true},{token:name.token,signature:name.signature,value:'虚构自动替换值',overwrite:false}]});
          return {secretCount:scan.secretCount,secretsOmitted:![password,otp,sensitive,'bSecretPassword','bSecretOtp'].some(marker=>serialized.includes(marker)),allSkipped:outcome.results.length===2&&outcome.results.every(item=>item.status==='跳过'),
            valuesPreserved:document.getElementById('bSecretPassword').value===password&&document.getElementById('bSecretOtp').value===otp&&document.getElementById('bSensitiveSalary').value===sensitive&&document.querySelector('[name="personal.name"]').value===original};
        },args:[password,otp,sensitive,original]});return result[0]?.result;
      },{url,password,otp,sensitive,original});
      assert.ok(actual.secretCount>=2);assert.equal(actual.secretsOmitted,true);assert.equal(actual.allSkipped,true);assert.equal(actual.valuesPreserved,true);
      const events=await page.evaluate(()=>globalThis.__bProtectionEvents);assert.equal(events.writes,0);assert.equal(events.submits,0);
      const snapshot=JSON.stringify(await h.state());for(const marker of [password,otp,sensitive])assert.equal(snapshot.includes(marker),false);
      await page.close();await noApplication(betaId);
      h.evidence.facts.genericProtection={realExtensionIsolatedWorld:true,secretsOmitted:true,sensitiveMappingRejected:true,manualValuePreserved:true,domWrites:0,domSubmits:0,httpPosts:0};
    });
    await h.action('task-skip',{taskId:betaId});
    const beforeAlpha=await h.state();await h.api('/settings',{settings:beforeAlpha.settings,sites:beforeAlpha.sites.map(site=>({...site,enabled:site.id==='local-alpha'}))});
    const alpha=await h.action('add',{url:FIXTURE+'/site/alpha/jobs/cpp-001'}),alphaId=alpha.task.id;
    const login=await h.login('alpha','demo');await login.close();await h.action('site-check',{siteId:'local-alpha'});
    await until('alpha real login check is ready',h.state,value=>value.sites.find(site=>site.id==='local-alpha')?.login?.status==='ready');await idle();
    await h.action('resume');
    const waiting=await until('original alpha ordinary question is reached',h.state,value=>stateTask(value,alphaId)?.status==='waiting_answer');await idle();
    const question=stateTask(waiting,alphaId).question,answer='虚构B组经确认的原用途答案';h.protect(answer,question.text);
    const alphaPage=()=>pageFor('alpha','cpp-001');
    const resetQuestion=async()=>{
      await alphaPage().locator('[data-question-key="motivation"]').evaluate((node,question)=>{node.dataset.questionText=question.text;node.dataset.questionScope=question.scope;node.querySelector('label').textContent=question.text;},question);
    };
    await h.check('答案已预检后原问题文字改变，原用途答案不写入且零HTTP申请',async()=>{
      const gate=await routeAuthorize(alphaId,'answer',async()=>{await alphaPage().locator('[data-question-key="motivation"]').evaluate(node=>{node.dataset.questionText='变化后的虚构普通问题';node.querySelector('label').textContent='变化后的虚构普通问题';});});
      try{
        await h.action('answer',{taskId:alphaId,answer,save:true});const task=await waitProtected(alphaId,'structure');assert.equal(gate.reached,true);
        assert.equal(await alphaPage().locator('[name="motivation"]').inputValue(),'');assert.equal(task.id,alphaId);await noApplication(alphaId);
        h.evidence.facts.questionText={answerAuthorizationReached:true,oldAnswerNotWritten:true,httpPosts:0};
      }finally{await gate.close();}
      await h.action('pause');await resetQuestion();
    });
    await h.check('答案已预检后限定用途改变，旧答案不套用且原任务提交历史未新增',async()=>{
      const gate=await routeAuthorize(alphaId,'answer',async()=>{await alphaPage().locator('[data-question-key="motivation"]').evaluate(node=>{node.dataset.questionScope+=':changed';});});
      try{
        await h.action('task-resume',{taskId:alphaId});await h.action('resume');const task=await waitProtected(alphaId,'structure');assert.equal(gate.reached,true);
        assert.equal(await alphaPage().locator('[name="motivation"]').inputValue(),'');assert.match(task.issue.detail,/用途|问题/);await noApplication(alphaId);
        h.evidence.facts.questionScope={answerAuthorizationReached:true,oldAnswerNotWritten:true,newSubmissionBoundary:false,httpPosts:0};
      }finally{await gate.close();}
      await h.action('pause');await resetQuestion();
    });
    await h.check('纠正保护条件后同任务实际提交一次，之后拒绝恢复投递并单调保留历史',async()=>{
      const locked=h.app.store.task(alphaId),profileVersion=locked.profileVersion,resumeVersion=locked.resumeVersion;
      await h.action('task-resume',{taskId:alphaId});await h.action('resume');
      const done=await until('same alpha task has a reliable native receipt',h.state,value=>stateTask(value,alphaId)?.status==='submitted');await idle();
      assert.equal(stateTask(done,alphaId).id,alphaId);assert.equal(stateTask(done,alphaId).profileVersion,profileVersion);assert.equal(stateTask(done,alphaId).resumeVersion,resumeVersion);
      const actual=await h.fixture();assert.equal(h.posts().length,1);assert.equal(actual.submitRequests.length,1);assert.equal(actual.receipts.length,1);
      const receipt=actual.receipts[0],resume=h.app.store.task(alphaId).resumeSnapshot;
      assert.equal(receipt.tenant,'alpha');assert.equal(receipt.jobId,'cpp-001');assert.equal(receipt.fields.motivation,answer);assert.equal(receipt.fileName,resume.name);assert.equal(receipt.fileSize,resume.size);assert.equal(receipt.sha256,resume.sha256);
      const bytes=await fs.readFile(path.join(h.dataDir,'fixture','uploads',receipt.id+'.bin'));assert.equal(createHash('sha256').update(bytes).digest('hex'),resume.sha256);
      const history={submissionStarted:locked.submissionStarted,submitDay:locked.submitDay,submittedAt:locked.submittedAt,receipt:locked.result.receiptId};assert.equal(history.submissionStarted,true);
      await h.action('pause');
      for(const action of ['task-resume','task-skip','task-pause']){const result=await h.action(action,{taskId:alphaId},{allowFailure:true});assert.equal(result.status,400);}
      const before=locked.steps.filter(step=>step.label==='已核对接收记录').length;
      await h.action('verify',{taskId:alphaId});await until('new explicit read-only verification completes',h.state,()=>locked.steps.filter(step=>step.label==='已核对接收记录').length>before);await idle();
      assert.deepEqual({submissionStarted:locked.submissionStarted,submitDay:locked.submitDay,submittedAt:locked.submittedAt,receipt:locked.result.receiptId},history);
      assert.equal(h.posts().length,1);const after=await h.fixture();assert.equal(after.submitRequests.length,1);assert.equal(after.receipts.length,1);
      const persisted=JSON.parse(await fs.readFile(h.app.store.file,'utf8')).tasks.find(task=>task.id===alphaId);assert.equal(persisted.submissionStarted,true);assert.equal(persisted.submitDay,history.submitDay);
      h.evidence.facts.submission={sameTask:true,pinnedVersionsRetained:true,httpPosts:1,receipts:1,fileBytesVerified:true,replayRefused:true,historyRetained:true};
    });
  }finally{if(collector)await new Promise(resolve=>collector.close(resolve));}
});
