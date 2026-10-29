import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Store, FIXTURE, scheduleDecision} from '../model.mjs';
import {ROOT} from '../paths.mjs';

const client={clientId:'runner-one',profileId:'profile-one',extensionId:'a'.repeat(32)};
const second={clientId:'runner-two',profileId:'profile-two',extensionId:'a'.repeat(32)};
const login=(account='demo',tenant='beta')=>({status:'ready',account,tenant});
const field=zh=>({zh,en:null,source:'虚构云端测试',confirmed:true});
function fresh(t){
  const base=path.join(ROOT,'.runtime','tests');fs.mkdirSync(base,{recursive:true});
  const data=fs.mkdtempSync(path.join(base,'model-'));
  t.after(()=>fs.rmSync(data,{recursive:true,force:true}));
  let now=Date.parse('2026-10-16T01:00:00Z');
  const paths={data};const store=new Store(paths,{now:()=>now});store.demo();
  return {store,paths,advance:ms=>now+=ms,clock:()=>now};
}
function setup(t,entry='jobs'){
  const env=fresh(t),{store}=env;
  store.heartbeat(client);store.loginResult(store.site('local-beta'),login());
  const task=store.manual(`${FIXTURE}/site/beta/${entry}/web-001`).task;
  store.run(false);
  const send=(command,result)=>store.result({clientId:client.clientId,commandId:command.id,result});
  const take=()=>store.poll(client).command;
  return {...env,task,take,send};
}
function reachUpload(env,question=null){
  const inspected=env.take();assert.equal(inspected.op,'inspect');
  env.send(inspected,{ok:true,layout:'fixture-layout',question,login:login()});
  const fill=env.take();assert.equal(fill.op,'fill');
  env.send(fill,{ok:true,layout:'fixture-layout',filled:2});
  const upload=env.take();assert.equal(upload.op,'upload');return upload;
}
function uploaded(env,command){const f=command.payload.file;return env.send(command,{ok:true,layout:'fixture-layout',fileName:f.name,fileSize:f.size,sha256:f.sha256});}
function reachSubmit(env){uploaded(env,reachUpload(env));const preflight=env.take();assert.equal(preflight.op,'preflight');env.send(preflight,{ok:true});const submit=env.take();assert.equal(submit.op,'submit');return submit;}
function receipt(task,extra={}){const f=task.resumeSnapshot;return {id:'fictional-receipt',jobId:task.jobId,account:'demo',fileName:f.name,fileSize:f.size,sha256:f.sha256,...extra};}
function settings(store,change={},sites=store.state.sites){return {settings:{...store.state.settings,...change},sites:structuredClone(sites)};}
const question=task=>({key:'motivation',text:'请说明你对该测试岗位的兴趣。',scope:`local-v1:beta:${task.jobId}:motivation:v1`});

test('手动详情、申请页和带参链接按稳定岗位去重',t=>{
  const {store,task}=setup(t);
  assert.equal(store.manual(`${FIXTURE}/site/beta/apply/web-001?from=manual`).task.id,task.id);
  assert.equal(store.manual(`${FIXTURE}/site/beta/jobs/web-001?source=list#top`).duplicate,true);
  assert.equal(store.state.tasks.length,1);
  assert.throws(()=>store.manual(`${FIXTURE}/site/beta/jobs/../login`));
  assert.throws(()=>store.manual('https://outside.example/jobs/web-001'));
});

const jobMetadata=(extra={})=>({tenant:'beta',jobId:'web-001',url:`${FIXTURE}/site/beta/jobs/web-001`,title:'Web 前端工程师',company:'虚构乙公司',location:'上海',...extra});
test('手动申请页读取真实岗位资料，仅白名单字段进入同一任务并跨重启保留',t=>{
  const env=setup(t,'apply'),original=env.task.id,command=env.take();
  env.send(command,{ok:true,layout:'fixture-layout',login:login(),jobMetadata:jobMetadata({id:'page-task',status:'submitted',phase:'done',dedupeKey:'page-key',submissionStarted:true,submitDay:'2026-10-16'})});
  assert.equal(env.task.id,original);assert.equal(env.task.status,'running');assert.equal(env.task.phase,'fill');assert.equal(env.task.submissionStarted,undefined);assert.equal(env.task.submitDay,undefined);
  assert.equal(env.task.title,'Web 前端工程师');assert.equal(env.task.company,'虚构乙公司');assert.equal(env.task.location,'上海');assert.equal(env.task.jobMetadata.source,'detail');
  assert.equal(env.task.jobMetadata.status,undefined);assert.equal(env.task.jobMetadata.id,undefined);assert.notEqual(env.task.dedupeKey,'page-key');
  assert.equal(env.store.manual(`${FIXTURE}/site/beta/apply/web-001`).task.id,original);assert.equal(env.task.title,'Web 前端工程师');
  env.store.action({action:'pause'});const restored=new Store(env.paths,{now:env.clock}),task=restored.task(original);
  assert.equal(task.title,'Web 前端工程师');assert.equal(task.company,'虚构乙公司');assert.equal(task.location,'上海');assert.equal(task.jobMetadata.url,`${FIXTURE}/site/beta/jobs/web-001`);
});
for(const [label,extra] of [['tenant',{tenant:'alpha'}],['job',{jobId:'design-001'}],['source',{url:`${FIXTURE}/site/alpha/jobs/web-001`}],['credentials',{url:'http://user:secret@127.0.0.1:17322/site/beta/jobs/web-001'}]])test(`未核实的${label}详情资料不能污染任务或推进填写`,t=>{
  const env=setup(t),command=env.take(),identity=env.task.id;
  env.send(command,{ok:true,layout:'fixture-layout',login:login(),jobMetadata:jobMetadata(extra)});
  assert.equal(env.task.id,identity);assert.equal(env.task.title,'待读取岗位');assert.equal(env.task.location,'');assert.equal(env.task.status,'waiting_user');assert.equal(env.task.phase,'inspect');assert.equal(env.task.issue.kind,'structure');assert.equal(env.task.jobMetadata,undefined);
});
test('没有来源城市时不借用申请资料城市，后续补答和结果保留岗位资料',t=>{
  const env=setup(t),command=env.take();env.send(command,{ok:true,layout:'fixture-layout',question:question(env.task),login:login(),jobMetadata:jobMetadata({location:''})});
  assert.equal(env.task.location,'');assert.equal(env.task.company,'虚构乙公司');
  const fill=env.take();env.send(fill,{ok:true,layout:'fixture-layout',filled:2});uploaded(env,env.take());
  assert.equal(env.task.status,'waiting_answer');env.store.action({action:'answer',taskId:env.task.id,answer:'仅用于当前虚构岗位的普通回答'});
  uploaded(env,reachUpload(env,question(env.task)));
  const answer=env.take();assert.equal(answer.op,'answer');env.send(answer,{ok:true,layout:'fixture-layout'});
  const preflight=env.take();env.send(preflight,{ok:true});const submit=env.take();env.send(submit,{ok:true,receipt:receipt(env.task)});
  assert.equal(env.task.status,'submitted');assert.equal(env.task.location,'');assert.equal(env.task.title,'Web 前端工程师');assert.equal(env.task.company,'虚构乙公司');
  const restored=new Store(env.paths,{now:env.clock});assert.equal(restored.task(env.task.id).title,'Web 前端工程师');assert.equal(restored.task(env.task.id).location,'');
});
for(const outcome of ['submitted','unknown'])test(`discover为${outcome}的同一手动任务补资料但不清除提交边界或重排投递`,t=>{
  const env=setup(t),submit=reachSubmit(env);env.send(submit,outcome==='submitted'?{ok:true,receipt:receipt(env.task)}:{ok:false,kind:'unknown'});
  const before={id:env.task.id,dedupeKey:env.task.dedupeKey,status:env.task.status,phase:env.task.phase,submitDay:env.task.submitDay,result:structuredClone(env.task.result)},steps=env.task.steps.length;
  env.store.enqueueControl('discover',env.store.site('local-beta'));const discover=env.take();assert.equal(discover.op,'discover');
  env.send(discover,{ok:true,login:login(),jobs:[jobMetadata({status:'queued',id:'page-task',submissionStarted:false}),jobMetadata({title:'',company:'',location:''}),jobMetadata({tenant:'alpha',title:'跨租户污染'})]});
  assert.equal(env.store.state.tasks.length,1);for(const [key,value] of Object.entries(before))assert.deepEqual(env.task[key],value,key);
  assert.equal(env.task.submissionStarted,true);assert.equal(env.task.title,'Web 前端工程师');assert.equal(env.task.company,'虚构乙公司');assert.equal(env.task.location,'上海');assert.equal(env.task.jobMetadata.source,'list');assert.ok(env.task.steps.length>steps);
  assert.equal(env.take(),null);assert.match(env.store.site('local-beta').lastDiscoveryError,/结构/);assert.equal(env.store.manual(`${FIXTURE}/site/beta/apply/web-001`).task.id,before.id);
  const restored=new Store(env.paths,{now:env.clock});assert.equal(restored.task(before.id).submissionStarted,true);assert.equal(restored.task(before.id).title,'Web 前端工程师');assert.equal(restored.task(before.id).status,outcome);
});

test('已有任务或活动命令时演示初始化不能重置用户配置',t=>{
  const env=setup(t),before=structuredClone(env.store.state);
  assert.throws(()=>env.store.demo(),/全新数据目录/);assert.deepEqual(env.store.state,before);
  env.store.state.tasks=[];env.store.enqueueControl('check',env.store.site('local-beta'));
  assert.throws(()=>env.store.demo(),/全新数据目录/);
  env.take();assert.throws(()=>env.store.demo(),/全新数据目录/);
});

test('暂停的discover不阻塞显式登录检查或未知结果核对',t=>{
  const env=setup(t),submit=reachSubmit(env);env.send(submit,{ok:false,kind:'unknown'});
  env.store.enqueueControl('discover',env.store.site('local-alpha'));
  env.store.action({action:'pause'});
  env.store.action({action:'site-check',siteId:'local-beta'});
  const check=env.take();assert.equal(check.op,'check');env.send(check,{ok:true,login:login()});
  env.store.action({action:'verify',taskId:env.task.id});assert.equal(env.take().op,'verify');
});

test('同站多任务的登录/账号待办合并且其他就绪站点继续',t=>{
  const env=setup(t);
  env.store.manual(`${FIXTURE}/site/alpha/jobs/cpp-001`);
  env.store.manual(`${FIXTURE}/site/alpha/jobs/cpp-002`);
  const alpha=env.store.site('local-alpha');env.store.loginResult(alpha,{status:'login',tenant:'alpha'});
  env.store.loginResult(alpha,login('other','alpha'));
  const pending=env.store.state.issues.filter(i=>i.siteId===alpha.id&&i.status==='open');
  assert.equal(pending.length,1);assert.equal(pending[0].kind,'account');
  assert.equal(env.take().site.tenant,'beta');
  env.store.loginResult(alpha,login('demo','alpha'));
  assert.equal(env.store.state.tasks.filter(t=>t.siteId===alpha.id&&t.status==='queued').length,2);
  assert.equal(env.store.state.issues.filter(i=>i.siteId===alpha.id&&i.status==='open').length,0);
});

test('未知提交只核对；暂停、跳过站点和用尽额度均允许只读核对',t=>{
  const env=setup(t),submit=reachSubmit(env);
  assert.equal(env.task.status,'submitting');
  const persisted=JSON.parse(fs.readFileSync(env.store.file,'utf8'));
  assert.equal(persisted.tasks[0].status,'submitting');
  env.send(submit,{ok:false,kind:'unknown',message:'回执丢失'});
  env.store.action({action:'pause'});env.store.action({action:'site-skip',siteId:'local-beta'});
  assert.throws(()=>env.store.action({action:'task-resume',taskId:env.task.id}));
  env.store.action({action:'verify',taskId:env.task.id});
  const verify=env.take();assert.equal(verify.op,'verify');
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:verify.id}).allowed,true);
  env.send(verify,{ok:true,receipt:receipt(env.task),login:login()});
  assert.equal(env.task.status,'submitted');assert.equal(env.take(),null);
});

test('提交租约到期的迟到结果被拒绝，并持久保留未知边界',t=>{
  const env=setup(t),submit=reachSubmit(env);env.advance(60000);
  assert.equal(env.send(submit,{ok:true,receipt:receipt(env.task)}).ok,false);
  assert.equal(env.task.status,'unknown');
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:submit.id}).allowed,false);
  assert.equal(env.store.heartbeat(second),true);
  assert.equal(env.store.site('local-beta').login.status,'unknown');
  assert.equal(env.store.poll(second).command,null);
  assert.equal(JSON.parse(fs.readFileSync(env.store.file,'utf8')).tasks[0].status,'unknown');
});

test('活动命令固定client、profile和extension；另一profile不能偷换登录归属',t=>{
  const env=setup(t),command=env.take();env.advance(7000);
  assert.equal(env.store.heartbeat(second),false);
  assert.equal(env.store.heartbeat({...client,profileId:second.profileId}),false);
  assert.equal(env.store.heartbeat({...client,extensionId:'b'.repeat(32)}),false);
  env.send(command,{ok:true,layout:'fixture-layout',login:login()});
  assert.equal(env.store.site('local-beta').login.profileId,client.profileId);
  assert.equal(env.store.heartbeat(second),true);
  assert.equal(env.store.site('local-beta').login.status,'unknown');
  assert.equal(env.store.site('local-beta').login.profileId,second.profileId);
  assert.equal(env.store.poll(second).command.op,'check');
});

test('普通命令过期后的迟到结果不能跳过重新检查',t=>{
  const env=setup(t);env.send(env.take(),{ok:true,layout:'fixture-layout'});
  const fill=env.take();env.advance(60000);
  assert.equal(env.send(fill,{ok:true,filled:5,layout:'fixture-layout'}).ok,false);
  assert.equal(env.task.status,'queued');assert.equal(env.task.phase,'inspect');
  assert.equal(env.take().op,'inspect');
});

for(const action of ['task-pause','pause','task-skip','site-skip'])test(`${action} 后迟到上传结果不恢复任务、不跳过重检`,t=>{
  const env=setup(t),upload=reachUpload(env,question(env.task));
  env.store.action({action,taskId:env.task.id,siteId:'local-beta'});
  if(action==='task-pause')env.store.action({action:'task-resume',taskId:env.task.id});
  if(action==='pause')env.store.action({action:'resume'});
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:upload.id}).allowed,false);
  assert.equal(uploaded(env,upload).ignored,true);
  assert.equal(env.task.phase,'inspect');
  assert.equal(env.task.status,action==='task-skip'?'skipped':'queued');
  if(!['task-skip','site-skip'].includes(action))assert.equal(env.take().op,'inspect');
  else assert.equal(env.take(),null);
});

for(const observed of [login('other'),login('demo','alpha')])test(`ready 但账号/租户不符不可推进任务：${observed.account}/${observed.tenant}`,t=>{
  const env=setup(t);env.send(env.take(),{ok:true,layout:'fixture-layout',login:observed});
  assert.equal(env.store.site('local-beta').login.status,'account');
  assert.equal(env.task.status,'waiting_user');assert.equal(env.task.phase,'inspect');
  assert.equal(env.take(),null);
});

test('已有任务的站点身份不可被设置改写；无副作用拒绝删除和换账号',t=>{
  const {store,task}=setup(t),before=structuredClone(store.state);
  for(const mutate of [sites=>sites.filter(s=>s.id!=='local-beta'),sites=>sites.map(s=>s.id==='local-beta'?{...s,expectedAccount:'other'}:s),sites=>sites.map(s=>s.id==='local-beta'?{...s,tenant:'alpha',listUrl:`${FIXTURE}/site/alpha/jobs`,loginUrl:`${FIXTURE}/site/alpha/login`}:s)]){
    assert.throws(()=>store.setSettings(settings(store,{},mutate(structuredClone(store.state.sites)))),/已有任务/);
    assert.deepEqual(store.state,before);
  }
  assert.match(task.dedupeKey,/beta\|web-001\|demo$/);
  const renamed=store.state.sites.map(s=>({...s,name:s.name+'（已编辑）'}));
  store.setSettings(settings(store,{},renamed));assert.match(store.site('local-beta').name,/已编辑/);
});

test('没有岗位但有登录检查租约时也不能删除或换目标站点',t=>{
  const env=setup(t);env.store.state.tasks=[];
  env.store.enqueueControl('check',env.store.site('local-beta'));
  const changed=env.store.state.sites.map(s=>s.id==='local-beta'?{...s,expectedAccount:'other'}:s);
  assert.throws(()=>env.store.setSettings(settings(env.store,{},changed)),/已有任务/);
  const check=env.take();assert.equal(check.op,'check');
  assert.throws(()=>env.store.setSettings(settings(env.store,{},env.store.state.sites.filter(s=>s.id!=='local-beta'))),/已有任务/);
  env.send(check,{ok:true,login:login()});assert.equal(env.store.site('local-beta').login.status,'ready');
});

test('切换运行模式或停用站点撤销旧任务授权和迟到结果',t=>{
  const env=setup(t),upload=reachUpload(env);
  env.store.setSettings(settings(env.store,{mode:'real'}));
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:upload.id}).allowed,false);
  assert.equal(uploaded(env,upload).ignored,true);assert.equal(env.task.phase,'inspect');
  assert.equal(env.take(),null);
  env.store.setSettings(settings(env.store,{mode:'demo'}));
  assert.equal(env.take().op,'inspect');
});

test('已锁定资料/附件跨编辑、暂停和重启仍使用原版本',t=>{
  const env=setup(t);env.send(env.take(),{ok:true,layout:'fixture-layout'});
  const locked={profile:env.task.profileVersion,resume:env.task.resumeVersion,hash:env.task.resumeSnapshot.sha256};
  const profile=structuredClone(env.store.state.profile.data);profile.personal.name=field('第二位虚构测试者');
  env.store.setProfile({data:profile,mode:'demo',confirmed:true});
  env.store.setResume({name:'fictional-new.txt',mime:'text/plain',base64:Buffer.from('new fictional file').toString('base64'),mode:'demo'});
  const fill=env.take();assert.equal(fill.payload.entries.find(e=>e.key==='personal.name').value,env.task.profileSnapshot.data.personal.name.zh);
  env.send(fill,{ok:true,filled:2,layout:'fixture-layout'});const upload=env.take();
  assert.equal(upload.payload.file.sha256,locked.hash);
  env.store.action({action:'pause'});env.store.save();
  const restored=new Store(env.paths,{now:env.clock});const task=restored.task(env.task.id);
  assert.equal(task.profileVersion,locked.profile);assert.equal(task.resumeVersion,locked.resume);
  assert.equal(task.resumeSnapshot.sha256,locked.hash);assert.equal(task.phase,'inspect');
  assert.equal(restored.state.profile.version,locked.profile+1);
});

test('重启时 submitting 转 unknown；不重投并保留额度、资料、设置',t=>{
  const env=setup(t);reachSubmit(env);const restored=new Store(env.paths,{now:env.clock});
  const task=restored.task(env.task.id);assert.equal(task.status,'unknown');assert.equal(task.phase,'verify');
  assert.equal(restored.dailyUsed(),1);assert.equal(task.profileVersion,1);assert.equal(task.resumeVersion,1);
  assert.equal(restored.state.settings.dailyLimit,3);assert.equal(restored.poll(client).command,null);
  assert.throws(()=>restored.action({action:'task-resume',taskId:task.id}));
});

test('未知结果消耗当日尝试额度，核对不受额度限制，跨日只执行一次计划',t=>{
  const env=setup(t);env.store.setSettings(settings(env.store,{dailyLimit:1,scheduleEnabled:true,time:'09:00'}));
  env.store.tick();env.store.queue=[]; // This unit test supplies an already discovered task.
  env.send(reachSubmit(env),{ok:false,kind:'unknown'});
  env.store.manual(`${FIXTURE}/site/beta/jobs/web-002`);
  assert.equal(env.store.dailyUsed(),1);assert.equal(env.take(),null);
  env.store.action({action:'verify',taskId:env.task.id});const verify=env.take();assert.equal(verify.op,'verify');
  env.send(verify,{ok:true,receipt:null,login:login()});assert.equal(env.task.status,'unknown');
  env.advance(86400000);env.store.tick();assert.equal(env.store.dailyUsed(),0);
  const last=structuredClone(env.store.state.lastSchedule);const queued=env.store.queue.length;
  env.store.tick();assert.deepEqual(env.store.state.lastSchedule,last);assert.equal(env.store.queue.length,queued);
  assert.equal(scheduleDecision(env.store.state.settings,last,env.clock()).due,false);
  assert.equal(scheduleDecision(env.store.state.settings,last,env.clock()+5*86400000).due,true);
});

test('补答保存限原问题和原用途；同任务恢复并保持版本',t=>{
  const env=setup(t),q=question(env.task);uploaded(env,reachUpload(env,q));
  assert.equal(env.task.status,'waiting_answer');const id=env.task.id;
  env.store.action({action:'answer',taskId:id,answer:'  我已确认的虚构测试答案。  ',save:true});
  assert.equal(env.task.status,'queued');assert.equal(env.task.phase,'inspect');
  assert.equal(env.store.state.answers.length,1);
  const inspect=env.take();assert.equal(inspect.task.id,id);env.send(inspect,{ok:true,layout:'fixture-layout',question:q,login:login()});
  assert.equal(env.task.answer.value,'我已确认的虚构测试答案。');
  const fill=env.take();env.send(fill,{ok:true,layout:'fixture-layout',filled:2});uploaded(env,env.take());
  const answer=env.take();assert.equal(answer.op,'answer');assert.equal(answer.payload.scope,q.scope);
  env.send(answer,{ok:true,layout:'fixture-layout'});
  env.store.action({action:'task-pause',taskId:id});env.store.action({action:'task-resume',taskId:id});
  env.send(env.take(),{ok:true,layout:'fixture-layout',question:{...q,text:q.text+'（已修改）'},login:login()});
  assert.equal(env.task.answer,undefined);assert.equal(env.task.id,id);
});

test('敏感或错用途问题不能进入补答库；超长答案不能静默截断',t=>{
  const env=setup(t),q=question(env.task);const inspect=env.take();
  env.send(inspect,{ok:true,layout:'fixture-layout',question:{...q,text:'请填写 OTP 验证码'},login:login()});
  assert.equal(env.task.status,'waiting_user');assert.equal(env.task.question,undefined);
  for(const invalid of [{...q,scope:'local-v1:beta:other:motivation:v1'},{...q,key:'password'},{...q,text:'Expected salary'}])assert.equal(env.store.validQuestion(env.task,invalid),false);
  env.task.status='waiting_answer';env.task.question=q;
  assert.throws(()=>env.store.action({action:'answer',taskId:env.task.id,answer:'x'.repeat(5001),save:true}));
  assert.equal(env.store.state.answers.length,0);
  const profile=structuredClone(env.store.state.profile.data);profile.customAnswers.password=field('must never store');
  assert.throws(()=>env.store.setProfile({data:profile,mode:'demo',confirmed:true}));
});

test('未确认字段不会发往执行器，回执摘要不符不能记为已提交',t=>{
  const env=setup(t);const profile=structuredClone(env.store.state.profile.data);profile.personal.phone.confirmed=false;
  env.store.setProfile({data:profile,mode:'demo',confirmed:true});
  // Keep required readiness confirmed while testing an optional unconfirmed field.
  profile.personal.phone.confirmed=true;profile.personal.location={...field('未知城市'),confirmed:false};
  env.store.setProfile({data:profile,mode:'demo',confirmed:true});
  env.send(env.take(),{ok:true,layout:'fixture-layout'});const fill=env.take();
  assert.equal(fill.payload.entries.some(e=>e.key==='personal.location'),false);
  env.send(fill,{ok:true,filled:2,layout:'fixture-layout'});uploaded(env,env.take());const preflight=env.take();env.send(preflight,{ok:true});const submit=env.take();
  env.send(submit,{ok:true,receipt:receipt(env.task,{sha256:'0'.repeat(64)})});assert.equal(env.task.status,'unknown');
  env.store.action({action:'verify',taskId:env.task.id});env.send(env.take(),{ok:true,receipt:receipt(env.task),login:login()});
  const first=env.task.submittedAt;env.advance(86400000);
  env.store.action({action:'verify',taskId:env.task.id});env.send(env.take(),{ok:true,receipt:receipt(env.task),login:login()});
  assert.equal(env.task.submittedAt,first);assert.equal(env.store.snapshot().stats.demo.today,0);
});

test('未手动暂停的新数据可以等待计划，重启后只触发当日一次',t=>{
  const env=fresh(t);env.store.setSettings(settings(env.store,{scheduleEnabled:true,time:'09:01'}));
  assert.equal(env.store.state.paused,true);assert.equal(env.store.state.manualPaused,false);
  assert.equal(env.store.snapshot().nextRun,'2026-10-16T01:01:00.000Z');
  const restored=new Store(env.paths,{now:env.clock});restored.tick();
  assert.equal(restored.state.running,false);assert.equal(restored.state.lastSchedule,null);
  env.advance(60000);restored.tick();
  assert.equal(restored.state.running,true);assert.equal(restored.state.paused,false);
  assert.equal(restored.state.manualPaused,false);assert.equal(restored.queue.length,2);
  const checkpoint=structuredClone(restored.state.lastSchedule);restored.tick();
  assert.deepEqual(restored.state.lastSchedule,checkpoint);assert.equal(restored.queue.length,2);
  env.advance(5*86400000);
  const afterGap=new Store(env.paths,{now:env.clock});afterGap.tick();
  assert.equal(afterGap.state.lastSchedule.day,'2026-10-21');assert.equal(afterGap.queue.length,2);
  afterGap.tick();assert.equal(afterGap.queue.length,2);
});

for(const action of ['pause','stop'])test(`${action} 持久阻止到点计划，改设置与跨日重启不会解除`,t=>{
  const env=setup(t);env.store.setSettings(settings(env.store,{scheduleEnabled:true,time:'09:01'}));
  const inspect=env.take();env.store.action({action});
  assert.equal(env.store.state.manualPaused,true);assert.equal(env.store.snapshot().nextRun,null);
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:inspect.id}).allowed,false);
  env.advance(60000);env.store.tick();
  assert.equal(env.store.state.lastSchedule,null);assert.equal(env.store.state.running,false);
  assert.throws(()=>env.store.run(true,{scheduled:true}),/全局暂停/);
  assert.equal(env.send(inspect,{ok:true,layout:'fixture-layout'}).ok,false);
  const restored=new Store(env.paths,{now:env.clock});
  assert.equal(restored.state.manualPaused,true);assert.equal(restored.poll(client).command,null);
  restored.setSettings(settings(restored,{scheduleEnabled:false}));
  restored.setSettings(settings(restored,{scheduleEnabled:true,time:'08:00'}));
  env.advance(3*86400000);restored.tick();
  assert.equal(restored.state.manualPaused,true);assert.equal(restored.state.paused,true);
  assert.equal(restored.state.running,false);assert.equal(restored.state.lastSchedule,null);
  assert.equal(restored.snapshot().nextRun,null);
  const disk=JSON.parse(fs.readFileSync(restored.file,'utf8'));assert.equal(disk.manualPaused,true);
  restored.action({action:'resume'});assert.equal(restored.state.manualPaused,false);
  restored.tick();assert.equal(restored.state.lastSchedule.day,'2026-10-19');
  assert.equal(restored.state.running,true);assert.equal(restored.queue.length,2);
});

test('手动暂停保留上次计划记录；失败的继续不会解除暂停',t=>{
  const env=setup(t);env.store.setSettings(settings(env.store,{scheduleEnabled:true,time:'09:00'}));
  env.store.tick();const checkpoint=structuredClone(env.store.state.lastSchedule);
  env.store.action({action:'pause'});env.advance(86400000);env.store.tick();
  assert.deepEqual(env.store.state.lastSchedule,checkpoint);
  env.store.setSettings(settings(env.store,{mode:'real'}));
  assert.throws(()=>env.store.action({action:'resume'}),/不一致|尚待适配/);
  assert.equal(env.store.state.manualPaused,true);assert.equal(env.store.state.paused,true);
  const restored=new Store(env.paths,{now:env.clock});restored.tick();
  assert.deepEqual(restored.state.lastSchedule,checkpoint);assert.equal(restored.state.manualPaused,true);
});

for(const legacyPaused of [true,false])test(`旧状态缺暂停来源时保守迁移：paused=${legacyPaused}`,t=>{
  const env=setup(t);env.store.setSettings(settings(env.store,{scheduleEnabled:true,time:'09:01'}));
  // Write the previous schema's actual fields; no task, settings or evidence is cleared.
  const legacy=JSON.parse(fs.readFileSync(env.store.file,'utf8'));
  delete legacy.manualPaused;legacy.paused=legacyPaused;legacy.running=!legacyPaused;
  fs.writeFileSync(env.store.file,JSON.stringify(legacy));env.advance(60000);
  const restored=new Store(env.paths,{now:env.clock});restored.tick();
  assert.equal(restored.state.manualPaused,legacyPaused);
  assert.equal(restored.state.running,!legacyPaused);
  assert.equal(restored.state.lastSchedule?.day||null,legacyPaused?null:'2026-10-16');
  assert.equal(restored.state.tasks[0].id,env.task.id);assert.equal(restored.state.profile.version,1);
  assert.equal(JSON.parse(fs.readFileSync(restored.file,'utf8')).manualPaused,legacyPaused);
});

test('从未执行的跳过任务恢复同ID并重新inspect，不绕过去重',t=>{
  const env=setup(t);env.store.action({action:'task-skip',taskId:env.task.id});
  assert.equal(env.store.snapshot().tasks[0].canResume,true);
  assert.equal(env.store.snapshot().tasks[0].canVerify,false);
  assert.equal(env.store.manual(env.task.url+'?source=again').task.id,env.task.id);
  env.store.action({action:'task-resume',taskId:env.task.id});
  assert.equal(env.task.status,'queued');assert.equal(env.task.phase,'inspect');
  assert.equal(env.task.profileVersion,null);assert.equal(env.task.resumeVersion,null);
  assert.equal(env.store.state.tasks.length,1);assert.equal(env.take().task.id,env.task.id);
});

test('跳过与恢复期间的迟到结果失效，已锁资料和附件版本不被后续编辑替换',t=>{
  const env=setup(t),upload=reachUpload(env),locked=structuredClone(env.task);
  env.store.action({action:'task-skip',taskId:env.task.id});
  const edited=structuredClone(env.store.state.profile.data);edited.personal.name=field('后来编辑的虚构申请人');
  env.store.setProfile({data:edited,mode:'demo',confirmed:true});
  env.store.setResume({name:'fictional-replacement.txt',mime:'text/plain',base64:Buffer.from('replacement fictional bytes').toString('base64'),mode:'demo'});
  env.store.action({action:'task-resume',taskId:env.task.id});
  assert.equal(uploaded(env,upload).ignored,true);assert.equal(env.task.phase,'inspect');
  const inspect=env.take();assert.equal(inspect.op,'inspect');assert.equal(inspect.task.id,locked.id);
  assert.equal(env.task.dedupeKey,locked.dedupeKey);assert.equal(env.task.profileVersion,locked.profileVersion);
  assert.equal(env.task.resumeVersion,locked.resumeVersion);assert.deepEqual(env.task.resumeSnapshot,locked.resumeSnapshot);
  env.send(inspect,{ok:true,layout:'fixture-layout',login:login()});
  const fill=env.take();assert.equal(fill.payload.entries.find(e=>e.key==='personal.name').value,locked.profileSnapshot.data.personal.name.zh);
  assert.equal(env.store.state.tasks.length,1);
});

test('跳过任务跨重启恢复仍保留版本，单项恢复不会解除全局手动暂停',t=>{
  const env=setup(t);reachUpload(env);env.store.action({action:'task-skip',taskId:env.task.id});
  env.store.action({action:'pause'});const locked=structuredClone(env.task);
  const restored=new Store(env.paths,{now:env.clock});restored.action({action:'task-resume',taskId:locked.id});
  const task=restored.task(locked.id);assert.equal(task.status,'queued');assert.equal(task.phase,'inspect');
  assert.equal(restored.state.manualPaused,true);assert.equal(restored.poll(client).command,null);
  assert.equal(task.profileVersion,locked.profileVersion);assert.equal(task.resumeVersion,locked.resumeVersion);
  assert.equal(task.dedupeKey,locked.dedupeKey);assert.equal(restored.state.tasks.length,1);
  restored.action({action:'resume'});const check=restored.poll(client).command;assert.equal(check.op,'check');
  restored.result({clientId:client.clientId,commandId:check.id,result:{ok:true,login:login()}});
  const inspect=restored.poll(client).command;assert.equal(inspect.op,'inspect');assert.equal(inspect.task.id,locked.id);
});

const boundaryCases=[
  ['新持久标志',task=>task.submissionStarted=true],
  ['历史submitDay',task=>task.submitDay='2026-10-15'],
  ['未知submitDay值',task=>task.submitDay=null],
  ['历史submittedAt',task=>task.submittedAt='2026-10-15T01:00:00Z'],
  ['旧回执',task=>task.result={receiptId:'fictional-existing-receipt'}],
  ['核对阶段',task=>task.phase='verify'],
  ['完成阶段',task=>task.phase='done'],
  ['提交历史步骤',task=>task.steps.push({at:'2026-10-15T01:00:00Z',label:'提交阶段已记录',detail:'旧版本已保存边界'})],
  ['历史未知结果待办',(task,store)=>store.state.issues.push({id:'old-unknown',taskId:task.id,kind:'unknown',status:'resolved'})]
];
for(const [label,mark] of boundaryCases)test(`旧skipped任务的${label}禁止恢复，重启后仍只能核对`,t=>{
  const env=setup(t);const inspect=env.take();env.send(inspect,{ok:true,layout:'fixture-layout'});
  env.store.action({action:'task-skip',taskId:env.task.id});mark(env.task,env.store);env.store.save();
  assert.equal(env.store.snapshot().tasks[0].canResume,false);assert.equal(env.store.snapshot().tasks[0].canVerify,true);
  assert.throws(()=>env.store.action({action:'task-resume',taskId:env.task.id}),/提交阶段/);
  assert.throws(()=>env.store.action({action:'task-skip',taskId:env.task.id}),/保留提交记录/);
  const restored=new Store(env.paths,{now:env.clock});const task=restored.task(env.task.id);
  assert.equal(task.status,'skipped');assert.equal(task.submissionStarted,true);
  assert.equal(restored.snapshot().tasks[0].canResume,false);
  assert.throws(()=>restored.action({action:'task-resume',taskId:task.id}),/提交阶段/);
  restored.action({action:'pause'});restored.action({action:'verify',taskId:task.id});
  const verify=restored.poll(client).command;assert.equal(verify.op,'verify');
  assert.equal(restored.authorize({clientId:client.clientId,commandId:verify.id}).allowed,true);
  restored.result({clientId:client.clientId,commandId:verify.id,result:{ok:true,receipt:null,login:login()}});
  assert.equal(task.status,'unknown');assert.equal(restored.poll(client).command,null);
});

test('真正派发提交时先保存不可撤销标志，之后即使旧状态变skipped也不能重投',t=>{
  const env=setup(t);const submit=reachSubmit(env);
  assert.equal(env.store.snapshot().tasks[0].canResume,false);assert.equal(env.store.snapshot().tasks[0].canVerify,false);
  assert.equal(JSON.parse(fs.readFileSync(env.store.file,'utf8')).tasks[0].submissionStarted,true);
  env.send(submit,{ok:false,kind:'unknown'});
  // Model an old-version inconsistent status without erasing its real submission history.
  env.task.status='skipped';env.store.save();
  const restored=new Store(env.paths,{now:env.clock});const task=restored.task(env.task.id);
  assert.throws(()=>restored.action({action:'task-resume',taskId:task.id}),/提交阶段/);
  restored.action({action:'verify',taskId:task.id});const verify=restored.poll(client).command;
  restored.result({clientId:client.clientId,commandId:verify.id,result:{ok:true,receipt:receipt(task),login:login()}});
  assert.equal(task.status,'submitted');assert.equal(task.submissionStarted,true);
  assert.throws(()=>restored.action({action:'task-resume',taskId:task.id}),/提交阶段/);
  assert.equal(restored.state.tasks.length,1);
});

test('未适配链接完整保留query/hash，仅同一完整链接去重',t=>{
  const {store}=fresh(t);
  store.state.sites.push({id:'unknown-site',name:'Fictional site',origin:'https://jobs.example.test',tenant:'default',expectedAccount:'fictional',adapter:'unsupported',mode:'real',enabled:true});
  const urls=['https://jobs.example.test/job?id=1','https://jobs.example.test/job?id=2','https://jobs.example.test/#/job/1','https://jobs.example.test/#/job/2'];
  const tasks=urls.map(url=>store.manual(url).task);
  assert.equal(new Set(tasks.map(t=>t.id)).size,4);
  assert.deepEqual(tasks.map(t=>t.url),urls);
  for(const task of tasks){assert.equal(store.manual(task.url).task.id,task.id);assert.equal(task.status,'waiting_user');}
});
for(const authorized of [false,true])test(`提交阶段单项暂停：最终授权已发出=${authorized}`,t=>{
  const env=setup(t),submit=reachSubmit(env),request={clientId:client.clientId,commandId:submit.id};
  assert.deepEqual(submit.payload.file,{name:env.task.resumeSnapshot.name,size:env.task.resumeSnapshot.size,sha256:env.task.resumeSnapshot.sha256});
  if(authorized)assert.equal(env.store.authorize(request).allowed,true);
  const result=env.store.action({action:'task-pause',taskId:env.task.id});
  assert.equal(result.pauseOutcome,authorized?'authorization-already-issued':'authorization-revoked');
  assert.equal(result.verificationOnly,true);assert.equal(env.store.authorize(request).allowed,false);
  assert.equal(env.task.status,'unknown');assert.equal(env.task.submissionStarted,true);
  assert.throws(()=>env.store.action({action:'task-resume',taskId:env.task.id}));
});
test('独立预检失败在提交边界前暂停，同任务可重新检查',t=>{
  const env=setup(t);uploaded(env,reachUpload(env));const preflight=env.take();assert.equal(preflight.op,'preflight');
  assert.equal(env.task.submissionStarted,undefined);
  env.send(preflight,{ok:false,kind:'manual',message:'附件不符'});assert.equal(env.task.status,'waiting_user');
  env.store.action({action:'task-resume',taskId:env.task.id});assert.equal(env.take().op,'inspect');
});

test('迟到的暂停请求不能对已未知或已提交任务伪报暂停成功',t=>{
  const env=setup(t),submit=reachSubmit(env);env.send(submit,{ok:false,kind:'unknown'});
  assert.throws(()=>env.store.action({action:'task-pause',taskId:env.task.id}),/不能确认可撤回/);
  env.store.action({action:'verify',taskId:env.task.id});env.send(env.take(),{ok:true,receipt:receipt(env.task)});
  assert.throws(()=>env.store.action({action:'task-pause',taskId:env.task.id}),/不能确认可撤回/);
});

test('login observations derive distinct safe account/tenant/unknown reasons without accepting page messages',t=>{
  const {store,task}=setup(t),site=store.site('local-beta'),sameTask=task.id;
  const cases=[
    [{status:'ready',account:'demo',tenant:'alpha'},'account','tenant-mismatch',/租户范围/],
    [{status:'ready',account:'other',tenant:'beta'},'account','account-mismatch',/切换账号/],
    [{status:'unknown',account:'',tenant:'beta',reason:'ready',message:'UNTRUSTED PAGE TEXT'},'unknown','unknown',/无法可靠识别/],
    [{status:'verification',tenant:'beta'},'verification','verification',/人工验证/],
    [{status:'expired',tenant:'beta'},'expired','expired',/登录已失效/],
    [{status:'login',tenant:'beta'},'login','login',/完成登录/]
  ];
  for(const [observed,status,reason,message]of cases){
    const result=store.loginResult(site,observed);assert.equal(result.status,status);assert.equal(result.reason,reason);assert.match(result.message,message);
    assert.equal(task.id,sameTask);assert.equal(task.status,'waiting_user');assert.equal(task.submissionStarted,undefined);
    assert.equal(JSON.stringify(store.snapshot()).includes('UNTRUSTED PAGE TEXT'),false);
    const issue=store.state.issues.find(issue=>issue.siteId===site.id&&issue.status==='open');assert.match(issue.detail,message);
  }
  store.loginResult(site,login());assert.equal(site.login.reason,'ready');assert.equal(task.status,'queued');assert.equal(task.id,sameTask);
});
for(const observed of [
  {status:'verification',account:'demo',tenant:'beta'},
  {status:'unknown',account:'',tenant:'beta'},
  {status:'expired',account:'demo',tenant:'beta'},
  {status:'account',account:'demo',tenant:'alpha'},
  {status:'account',account:'other',tenant:'beta'}
])test(`failed page action preserves classified login observation ${observed.status}/${observed.tenant}/${observed.account}`,t=>{
  const env=setup(t),command=env.take();
  env.send(command,{ok:false,kind:observed.status==='account'?'account':'login',login:observed});
  const current=env.store.site('local-beta').login;
  assert.equal(current.status,observed.status);
  assert.equal(current.reason,observed.status==='account'?(observed.tenant!=='beta'?'tenant-mismatch':'account-mismatch'):observed.status);
  assert.equal(env.task.status,'waiting_user');assert.equal(env.task.submissionStarted,undefined);
});
test('login classification while a submission is unknown cannot erase its irreversible history',t=>{
  const env=setup(t),command=reachSubmit(env);env.send(command,{ok:false,kind:'unknown'});
  const day=env.task.submitDay,id=env.task.id;
  env.store.loginResult(env.store.site('local-beta'),{status:'ready',account:'demo',tenant:'alpha'});
  assert.equal(env.task.id,id);assert.equal(env.task.status,'unknown');assert.equal(env.task.submissionStarted,true);assert.equal(env.task.submitDay,day);
  env.store.loginResult(env.store.site('local-beta'),login());
  assert.equal(env.task.status,'unknown');assert.equal(env.task.submissionStarted,true);assert.equal(env.task.submitDay,day);
  assert.throws(()=>env.store.action({action:'task-resume',taskId:id}));
});
