import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Store,FIXTURE,hash} from '../model.mjs';
import {ROOT} from '../paths.mjs';

// These tests use only fictional local records. No employer is contacted, even
// when testing the production-mode authorization and unknown-result branches.
const client={clientId:'greenhouse-client',profileId:'greenhouse-profile',extensionId:'b'.repeat(32)};
const company='Fictional Mattermost Replay',tenant='mattermost-replay',jobId='5381946008';
function setup(t,{production=false}={}){
  const directory=path.join(ROOT,'.runtime','tests');fs.mkdirSync(directory,{recursive:true});
  const data=fs.mkdtempSync(path.join(directory,'greenhouse-model-'));t.after(()=>fs.rmSync(data,{force:true,recursive:true}));
  let now=Date.parse('2026-10-22T01:00:00Z');
  const paths={data},store=new Store(paths,{now:()=>now});store.demo();
  if(production){
    const profile=structuredClone(store.state.profile.data);
    for(const value of Object.values(profile.personal)){value.source='Synthetic local-only unit record';if(value.zh)value.zh=value.zh.replace(/虚构|测试|example\.invalid/g,'synthetic');}
    profile.personal.name.zh='Synthetic Applicant';profile.personal.email.zh='applicant@example.test';
    store.setProfile({data:profile,mode:'real',confirmed:true});
    store.setResume({name:'synthetic-resume.txt',mode:'real',mime:'text/plain',base64:Buffer.from('SYNTHETIC LOCAL UNIT RECORD. NEVER SEND TO AN EMPLOYER.').toString('base64')});
  }
  const origin=production?'https://job-boards.greenhouse.io':FIXTURE,prefix=production?'':'/greenhouse',activeTenant=production?'mattermost':tenant,activeCompany=production?'Mattermost':company,board=origin+prefix+'/'+activeTenant;
  const site={id:'greenhouse-fixture',name:activeCompany,company:activeCompany,adapter:production?'greenhouse-v1':'greenhouse-replay-v1',origin,tenant:activeTenant,expectedAccount:store.state.profile.data.personal.email.zh,mode:production?'real':'demo',enabled:true,skipped:false,listUrl:board,loginUrl:board};
  store.setSettings({settings:{...store.state.settings,mode:site.mode},sites:[site]});store.heartbeat(client);
  const task=store.manual(board+'/jobs/'+jobId).task;
  const take=()=>store.poll(client).command,send=(command,result)=>store.result({clientId:client.clientId,commandId:command.id,result});
  const confirm=(extra={})=>store.action({action:'task-confirm',taskId:task.id,jobId,profileVersion:store.state.profile.version,resumeVersion:store.state.resume.version,profileId:client.profileId,submitConfirmed:true,...extra});
  const login={status:'ready',account:site.expectedAccount,tenant:site.tenant,identitySource:'confirmed-anonymous-applicant'};
  return {store,task,site,paths,clock:()=>now,advance:ms=>now+=ms,take,send,confirm,login,board};
}
function question(env,key='question_1',extra={}){
  const version=hash(Buffer.from(key+JSON.stringify(extra)));
  return {key,text:key==='question_1'?'Why are you interested in this role at Mattermost?*':'How did you hear about Mattermost?*',scope:`greenhouse-v1:${env.site.tenant}:${jobId}:${key}:${version}`,version,purpose:'company-motivation',source:env.task.url,options:[],optionsComplete:true,required:true,type:'textarea',...extra};
}
function upload(env,questions=[]){
  const inspect=env.take();assert.equal(inspect.op,'inspect');env.send(inspect,{ok:true,layout:'observed-layout',questions,login:env.login});
  const fill=env.take();assert.equal(fill.op,'fill');env.send(fill,{ok:true,filled:3,layout:'observed-layout'});
  const command=env.take();assert.equal(command.op,'upload');const file=command.payload.file;
  env.send(command,{ok:true,layout:'observed-layout',fileName:file.name,fileSize:file.size,sha256:file.sha256});
}
function begin(env){env.confirm();env.store.run(false);}
function submit(env){upload(env);const check=env.take();assert.equal(check.op,'preflight');env.send(check,{ok:true});const command=env.take();assert.equal(command.op,'submit');return command;}
const receipt=env=>({kind:'greenhouse-replay',tenant:env.site.tenant,jobId,id:'synthetic-receipt',account:env.site.expectedAccount,fileName:env.task.resumeSnapshot.name,fileSize:env.task.resumeSnapshot.size,sha256:env.task.resumeSnapshot.sha256});

test('Greenhouse manual links keep exact tenant/job identity and deduplicate source parameters',t=>{
  const env=setup(t),{store,task}=env;
  assert.equal(store.manual(task.url+'?source=observed#application').task.id,task.id);
  assert.equal(store.state.tasks.length,1);
  for(const url of [env.board.replace(tenant,'other')+'/jobs/'+jobId,env.board+'/jobs/not-a-job',task.url+'/apply','https://job-boards.greenhouse.io.evil.invalid/'+tenant+'/jobs/'+jobId])assert.throws(()=>store.manual(url));
  assert.equal(task.status,'waiting_user');assert.equal(store.snapshot().tasks[0].needsConfirmation,true);
  store.run(false);assert.equal(env.take(),null);
});
test('site config pins company, host, mode and applicant instead of enabling arbitrary sites',t=>{
  const {store,site}=setup(t);
  const change=patch=>({settings:store.state.settings,sites:[{...site,...patch}]});
  assert.throws(()=>store.setSettings(change({origin:'https://evil.invalid'})));
  assert.throws(()=>store.setSettings(change({company:'Other company'})),/已有任务/);
  assert.throws(()=>store.setSettings(change({expectedAccount:'not-email'})));
  assert.throws(()=>store.setSettings(change({mode:'real'})));
});
test('first task confirmation binds exact job, current versions, applicant and execution profile',t=>{
  const env=setup(t);
  for(const patch of [{jobId:'other'},{profileVersion:999},{resumeVersion:999},{profileId:'other-profile'},{submitConfirmed:false}])assert.throws(()=>env.confirm(patch));
  begin(env);const inspect=env.take();assert.equal(inspect.op,'inspect');assert.equal(inspect.task.applicantConfirmed,true);assert.equal(inspect.task.executionProfileId,client.profileId);
  assert.ok(inspect.task.confirmedProfileKeys.includes('personal.email'));assert.equal(inspect.task.confirmation.resumeSha256,env.store.state.resume.sha256);
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:inspect.id}).allowed,true);
  env.store.setProfile({data:env.store.state.profile.data,mode:'demo',confirmed:true});
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:inspect.id}).allowed,false);
  assert.equal(env.store.snapshot().tasks[0].needsConfirmation,true);
});
test('Greenhouse fills only the confirmed applicant email variant when profile languages differ',t=>{
  const env=setup(t),profile=structuredClone(env.store.state.profile.data);
  profile.personal.email.en=profile.personal.email.zh;profile.personal.email.zh='different-fictional-applicant@example.invalid';
  env.store.setProfile({data:profile,mode:'demo',confirmed:true});begin(env);
  const inspect=env.take();env.send(inspect,{ok:true,layout:'email-layout',questions:[],login:env.login});
  const fill=env.take(),email=fill.payload.entries.find(entry=>entry.key==='personal.email');
  assert.equal(fill.op,'fill');assert.equal(email.value,env.site.expectedAccount);assert.equal(email.lang,'en');assert.equal(email.confirmed,true);
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:fill.id}).allowed,true);
  env.task.profileSnapshot.data.personal.email={...profile.personal.email,en:'changed-fictional-applicant@example.invalid'};
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:fill.id}).allowed,false);
});
test('pause persists exact original question, options and versions, then resumes the same task',t=>{
  const env=setup(t);begin(env);
  const q=question(env,'question_1',{type:'select-one',options:[{text:'Observed fictional option A',disabled:false},{text:'Unavailable',disabled:true}]});upload(env,[q]);
  assert.equal(env.task.status,'waiting_answer');assert.deepEqual(env.task.question,q);assert.equal(env.store.state.answers.length,0);
  assert.throws(()=>env.store.action({action:'answer',taskId:env.task.id,answer:'A guessed option'}),/选项/);
  assert.throws(()=>env.store.action({action:'answer',taskId:env.task.id,answer:'Unavailable'}),/选项/);
  const restored=new Store(env.paths,{now:env.clock});assert.deepEqual(restored.task(env.task.id).question,q);
  env.store.action({action:'answer',taskId:env.task.id,answer:'Observed fictional option A'});assert.equal(env.store.state.answers.length,0);
  upload(env,[q]);const answer=env.take();assert.equal(answer.op,'answer');assert.equal(answer.payload.confirmed,true);assert.equal(answer.payload.scope,q.scope);assert.equal(answer.task.id,env.task.id);
  env.send(answer,{ok:true,layout:'observed-layout'});assert.equal(env.take().op,'preflight');
});
test('multiple questions require exact confirmations, scoped memory can be viewed, edited and revoked',t=>{
  const env=setup(t);begin(env);const first=question(env),second=question(env,'question_2');upload(env,[first,second]);
  env.store.action({action:'answer',taskId:env.task.id,answer:'Synthetic first answer',save:true});assert.equal(env.store.snapshot().answers[0].scope,first.scope);
  upload(env,[first,second]);env.send(env.take(),{ok:true,layout:'observed-layout'});
  assert.equal(env.task.status,'waiting_answer');assert.equal(env.task.question.scope,second.scope);
  env.store.action({action:'answer',taskId:env.task.id,answer:'Synthetic second answer'});
  upload(env,[second]);const answer=env.take();assert.equal(answer.payload.answer,'Synthetic second answer');env.send(answer,{ok:true});assert.equal(env.take().op,'preflight');
  env.store.action({action:'memory-update',scope:first.scope,answer:'Changed exact-scoped answer'});assert.equal(env.store.snapshot().answers[0].value,'Changed exact-scoped answer');
  env.store.action({action:'memory-revoke',scope:first.scope});assert.equal(env.store.snapshot().answers.length,0);
});
test('sensitive personal questions require explicit exact-scoped answer but credentials cannot enter memory',t=>{
  const env=setup(t);begin(env);
  const q=question(env,'authorization',{text:'Are you legally authorized to work in Japan?*',purpose:'work-authorization',type:'select-one',options:[{text:'Observed fictional answer',disabled:false}]});upload(env,[q]);
  assert.equal(env.task.status,'waiting_answer');env.store.action({action:'answer',taskId:env.task.id,answer:'Observed fictional answer',save:true});assert.equal(env.store.state.answers[0].confirmed,true);
  const other=setup(t);begin(other);const inspect=other.take();other.send(inspect,{ok:true,layout:'layout',questions:[question(other,'password',{text:'Enter your password'})],login:other.login});
  assert.equal(other.task.status,'waiting_user');assert.equal(other.task.issue.kind,'structure');
});
test('changed question source, scope or unknown choices pauses rather than guessing',t=>{
  for(const change of [{source:'https://evil.invalid/jobs/123'},{scope:'greenhouse-v1:other:123:question:version'},{type:'select-one',optionsComplete:false}]){
    const env=setup(t);begin(env);const inspect=env.take();env.send(inspect,{ok:true,layout:'layout',questions:[question(env,'question_1',change)],login:env.login});
    assert.equal(env.task.status,'waiting_user');assert.equal(env.task.issue.kind,'structure');assert.equal(env.take(),null);
  }
});
test('incomplete custom combobox keeps exact question evidence for manual handling without text-answer fallback',t=>{
  const env=setup(t);begin(env);const inspect=env.take(),q=question(env,'country',{text:'Country*',type:'text',customControl:true,optionsComplete:false,options:[{text:'Only observed option',disabled:false}],requiredEvidence:{native:false,aria:true,labelAsterisk:true,groupAsterisk:true}});
  env.send(inspect,{ok:true,layout:'layout',questions:[q],login:env.login});
  assert.equal(env.task.status,'waiting_user');assert.equal(env.task.question.customControl,true);assert.equal(env.task.question.unresolved,true);assert.equal(env.task.question.requiredEvidence.groupAsterisk,true);
  assert.equal(env.task.question.source,env.task.url);assert.deepEqual(env.task.question.options,q.options);assert.equal(env.task.issue.question.scope,q.scope);
  assert.throws(()=>env.store.action({action:'answer',taskId:env.task.id,answer:'A guessed country'}));assert.equal(env.take(),null);
});
test('production configuration rejects unobserved tenants instead of advertising generic Greenhouse support',t=>{
  const env=setup(t,{production:true}),site={...env.site,id:'different-site',company:'Unobserved Company',tenant:'unobserved',listUrl:'https://job-boards.greenhouse.io/unobserved',loginUrl:'https://job-boards.greenhouse.io/unobserved'};
  assert.throws(()=>env.store.setSettings({settings:env.store.state.settings,sites:[env.site,site]}),/分别验证/);
});
test('revocation clears a cached prior answer while the same task waits at a different question',t=>{
  const env=setup(t);begin(env);const first=question(env),second=question(env,'question_2');upload(env,[first,second]);
  env.store.action({action:'answer',taskId:env.task.id,answer:'Explicit answer to revoke',save:true});upload(env,[first,second]);env.send(env.take(),{ok:true});
  assert.equal(env.task.question.scope,second.scope);assert.ok(env.task.answers[first.scope]);assert.equal(env.task.answer,undefined);
  env.store.action({action:'memory-revoke',scope:first.scope});assert.equal(env.task.answers[first.scope],undefined);assert.equal(env.store.state.answers.length,0);
  env.store.action({action:'answer',taskId:env.task.id,answer:'Second answer'});upload(env,[first,second]);assert.equal(env.task.status,'waiting_answer');assert.equal(env.task.question.scope,first.scope);
});
test('resume after changed attachment requires fresh confirmation; another execution profile cannot inherit',t=>{
  const env=setup(t);begin(env);upload(env,[question(env)]);
  const locked=env.task.resumeVersion;env.store.setResume({name:'new-fictional.txt',mime:'text/plain',base64:Buffer.from('NEW FICTIONAL LOCAL FILE').toString('base64'),mode:'demo'});
  env.store.action({action:'task-resume',taskId:env.task.id});assert.equal(env.task.status,'waiting_user');assert.equal(env.task.resumeVersion,locked);assert.equal(env.take(),null);
  env.confirm();assert.notEqual(env.task.resumeVersion,locked);assert.equal(env.take().op,'inspect');
  env.advance(61000);env.store.poll({...client,clientId:'second-client',profileId:'second-profile'});
  assert.equal(env.task.status,'waiting_user');assert.throws(()=>env.confirm({profileId:'second-profile'}),/原执行浏览器/);
});
test('only exact synthetic replay receipt can mark replay submitted; unknown outcome is never sent again',t=>{
  const env=setup(t);begin(env);const command=submit(env);const persisted=JSON.parse(fs.readFileSync(env.store.file));assert.equal(persisted.tasks[0].submissionStarted,true);
  const forged=receipt(env);forged.tenant='other';env.send(command,{ok:true,receipt:forged});assert.equal(env.task.status,'unknown');assert.equal(env.take(),null);assert.throws(()=>env.confirm());
  env.store.action({action:'pause'});env.store.action({action:'verify',taskId:env.task.id});const verify=env.take();assert.equal(verify.op,'verify');env.send(verify,{ok:true,receipt:receipt(env),login:env.login});
  assert.equal(env.task.status,'submitted');assert.match(env.task.result.evidence,/合成回执/);assert.match(env.task.result.evidence,/不是生产/);
});
test('production submit path requires explicit confirmation and remains unknown without verified production receipt',t=>{
  const env=setup(t,{production:true});begin(env);const command=submit(env);
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:command.id}).allowed,true);
  env.send(command,{ok:true,receipt:receipt(env),login:env.login});assert.equal(env.task.status,'unknown');assert.equal(env.task.submissionStarted,true);assert.equal(env.take(),null);
  const restored=new Store(env.paths,{now:env.clock});assert.equal(restored.task(env.task.id).status,'unknown');assert.equal(restored.task(env.task.id).submissionStarted,true);
  assert.throws(()=>restored.action({action:'task-resume',taskId:env.task.id}),/只能核对/);
});
