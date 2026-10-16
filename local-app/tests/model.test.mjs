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
function setup(t){
  const base=path.join(ROOT,'.runtime','tests');fs.mkdirSync(base,{recursive:true});
  const data=fs.mkdtempSync(path.join(base,'model-'));
  t.after(()=>fs.rmSync(data,{recursive:true,force:true}));
  let now=Date.parse('2026-10-16T01:00:00Z');
  const paths={data};const store=new Store(paths,{now:()=>now});store.demo();
  store.heartbeat(client);store.loginResult(store.site('local-beta'),login());
  const task=store.manual(`${FIXTURE}/site/beta/jobs/web-001`).task;
  store.run(false);
  const send=(command,result)=>store.result({clientId:client.clientId,commandId:command.id,result});
  const take=()=>store.poll(client).command;
  return {store,task,paths,take,send,advance:ms=>now+=ms,clock:()=>now};
}
function reachUpload(env,question=null){
  const inspected=env.take();assert.equal(inspected.op,'inspect');
  env.send(inspected,{ok:true,layout:'fixture-layout',question,login:login()});
  const fill=env.take();assert.equal(fill.op,'fill');
  env.send(fill,{ok:true,layout:'fixture-layout',filled:2});
  const upload=env.take();assert.equal(upload.op,'upload');return upload;
}
function uploaded(env,command){const f=command.payload.file;return env.send(command,{ok:true,layout:'fixture-layout',fileName:f.name,fileSize:f.size,sha256:f.sha256});}
function reachSubmit(env){uploaded(env,reachUpload(env));const submit=env.take();assert.equal(submit.op,'submit');return submit;}
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
  env.send(fill,{ok:true,filled:2,layout:'fixture-layout'});uploaded(env,env.take());const submit=env.take();
  env.send(submit,{ok:true,receipt:receipt(env.task,{sha256:'0'.repeat(64)})});assert.equal(env.task.status,'unknown');
  env.store.action({action:'verify',taskId:env.task.id});env.send(env.take(),{ok:true,receipt:receipt(env.task),login:login()});
  const first=env.task.submittedAt;env.advance(86400000);
  env.store.action({action:'verify',taskId:env.task.id});env.send(env.take(),{ok:true,receipt:receipt(env.task),login:login()});
  assert.equal(env.task.submittedAt,first);assert.equal(env.store.snapshot().stats.demo.today,0);
});
