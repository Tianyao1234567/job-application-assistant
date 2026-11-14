import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Store,FIXTURE,hash} from '../model.mjs';
import {ROOT} from '../paths.mjs';
import {searchGreenhouseLocations} from '../greenhouse-location.mjs';

// These tests use only fictional local records. No employer is contacted, even
// when testing the production-mode authorization and unknown-result branches.
const client={clientId:'greenhouse-client',profileId:'greenhouse-profile',extensionId:'b'.repeat(32)};
const company='Fictional Mattermost Replay',tenant='mattermost-replay',jobId='5381946008';
function setup(t,{production=false}={}){
  const directory=path.join(ROOT,'.runtime','tests');fs.mkdirSync(directory,{recursive:true});
  const data=fs.mkdtempSync(path.join(directory,'greenhouse-model-'));t.after(()=>fs.rmSync(data,{force:true,recursive:true}));
  let now=Date.parse('2026-10-22T01:00:00Z');
  let paths={data},store=new Store(paths,{now:()=>now});store.demo();
  if(production){
    const profile=structuredClone(store.state.profile.data);
    paths={data:path.join(data,'real')};fs.mkdirSync(paths.data);
    store=new Store(paths,{now:()=>now});
    for(const value of Object.values(profile.personal)){value.source='Synthetic local-only unit record';if(value.zh)value.zh=value.zh.replace(/虚构|测试|example\.invalid/g,'synthetic');}
    profile.personal.name.zh='Synthetic Applicant';profile.personal.email.zh='applicant@example.test';
    store.setProfile({data:profile,mode:'real',confirmed:true});
    store.setResume({name:'synthetic-resume.txt',mode:'real',mime:'text/plain',base64:Buffer.from('SYNTHETIC LOCAL UNIT RECORD. NEVER SEND TO AN EMPLOYER.').toString('base64')});
  }
  const origin=production?'https://job-boards.greenhouse.io':FIXTURE,prefix=production?'':'/greenhouse',activeTenant=production?'mattermost':tenant,activeCompany=production?'Mattermost':company,board=origin+prefix+'/'+activeTenant;
  const site={id:'greenhouse-fixture',name:activeCompany,company:activeCompany,adapter:production?'greenhouse-v1':'greenhouse-replay-v1',origin,tenant:activeTenant,expectedAccount:store.state.profile.data.personal.email.zh,mode:production?'real':'demo',enabled:true,skipped:false,listUrl:board,loginUrl:board};
  store.setSettings({settings:{...store.state.settings,mode:site.mode,keywords:['Synthetic'],cities:['Synthetic city']},sites:[site]});store.heartbeat(client);
  const task=store.manual(board+'/jobs/'+jobId).task;
  const take=()=>store.poll(client).command,send=(command,result)=>store.result({clientId:client.clientId,commandId:command.id,result});
  const confirm=(extra={})=>store.action({action:'task-confirm',taskId:task.id,jobId,profileVersion:store.state.profile.version,resumeVersion:store.state.resume.version,profileId:client.profileId,purpose:production?'inspect':'submit',...extra});
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
  const oldAccount=profile.personal.email.zh,newAccount='different-fictional-applicant@example.invalid';
  profile.personal.email={...profile.personal.email,zh:newAccount,en:null};
  env.store.setProfile({data:profile,mode:'demo',confirmed:true,baseVersion:env.store.state.profile.version,retireEnglish:['personal.email']});
  // Pin the site to the alternate language using a freshly confirmed fictional profile.
  profile.personal.email.en=oldAccount;
  env.store.setProfile({data:profile,mode:'demo',confirmed:true});begin(env);
  const inspect=env.take();env.send(inspect,{ok:true,layout:'email-layout',questions:[],login:env.login});
  const fill=env.take(),email=fill.payload.entries.find(entry=>entry.key==='personal.email');
  assert.equal(fill.op,'fill');assert.equal(email.value,env.site.expectedAccount);assert.equal(email.lang,'en');assert.equal(email.confirmed,true);
  assert.equal(env.store.authorize({clientId:client.clientId,commandId:fill.id}).allowed,true);
  env.store.task(env.task.id).profileSnapshot.data.personal.email={...profile.personal.email,en:'changed-fictional-applicant@example.invalid'};
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
test('paused production only inspects, including a previously queued submit phase',t=>{
  const env=setup(t,{production:true});
  for(const patch of [{purpose:'submit'},{purpose:undefined,submitConfirmed:true},{purpose:'inspect',submitConfirmed:true}])
    assert.throws(()=>env.confirm(patch),/明确选择只读检查/);
  begin(env);
  assert.equal(env.task.confirmation.purpose,'inspect');
  assert.equal(Object.hasOwn(env.task.confirmation,'submitConfirmed'),false);
  env.task.phase='submit';
  const inspect=env.take();assert.equal(inspect.op,'inspect');
  const authorize={clientId:client.clientId,commandId:inspect.id};
  assert.equal(env.store.authorize(authorize).allowed,true);
  const lease=env.store.command;
  for(const op of ['fill','upload','answer','submit']){
    env.store.command={...lease,op};
    assert.equal(env.store.authorize(authorize).allowed,false);
    assert.equal(env.store.authorize({...authorize,captureOnly:true}).allowed,false);
  }
  env.store.command=lease;
  env.send(inspect,{ok:true,layout:'observed-layout',questions:[],login:env.login});
  assert.equal(env.task.status,'waiting_user');assert.equal(env.task.phase,'inspect');
  assert.equal(env.task.submissionStarted,undefined);assert.equal(env.task.submitAuthorizedAt,undefined);
  assert.equal(env.store.dailyUsed(),0);assert.equal(env.take(),null);
  const restored=new Store(env.paths,{now:env.clock});assert.equal(restored.task(env.task.id).status,'waiting_user');
  restored.heartbeat(client);
  assert.equal(restored.confirmedTask(restored.task(env.task.id),'inspect'),true);
  assert.equal(restored.confirmedTask(restored.task(env.task.id),'submit'),false);
  assert.equal(restored.canResumeTask(restored.task(env.task.id)),true);
});

test('read-only batch saves exact choices and blanks despite unresolved controls and resumes the same task',t=>{
  const env=setup(t,{production:true});begin(env);
  const choice=question(env,'language',{type:'select-one',options:[{text:'Observed answer',disabled:false}]});
  const optional=question(env,'optional',{required:false});
  const unknown=question(env,'candidate-location',{type:'text',customControl:true,required:true,optionsComplete:false});
  const attachment={...question(env,'resume',{type:'file',text:'Resume/CV / Attach'}),purpose:'attachment',attachmentRequirementKnown:true,manualTextAlternative:true};
  const report=()=>({ok:true,layout:'original layout',login:env.login,questions:[unknown,choice,optional],question:unknown,fields:[attachment]});
  const inspect=env.take();assert.equal(inspect.op,'inspect');env.send(inspect,report());
  const batch=env.store.snapshot().tasks[0].answerBatch;
  assert.deepEqual(batch.questions.map(q=>q.key),['language','optional']);
  assert.equal(env.task.questions[0].unresolved,true);
  assert.equal(env.task.inspectionAttachments[0].manualTextAlternative,true);
  const answers=[{scope:choice.scope,version:choice.version,answer:'Observed answer',save:'task'},
    {scope:optional.scope,version:optional.version,leaveBlank:true,save:'task'}];
  const action={action:'answers',taskId:env.task.id,batchVersion:batch.version,answers};
  assert.throws(()=>env.store.action({...action,answers:[{...answers[0],answer:'Guess'},answers[1]]}),/选项/);
  assert.equal(env.store.action(action).saved,2);
  const restarted=new Store(env.paths,{now:env.clock}),same=restarted.task(env.task.id);
  assert.equal(same.answers[choice.scope].value,'Observed answer');
  assert.equal(same.answers[optional.scope].leaveBlank,true);
  const again=restarted.poll(client).command;
  assert.equal(again.op,'inspect');assert.equal(again.task.id,env.task.id);
  restarted.result({clientId:client.clientId,commandId:again.id,result:report()});
  assert.equal(same.status,'waiting_user');assert.match(same.issue.title,/答案已保存/);
  assert.equal(restarted.snapshot().tasks[0].answerBatch,undefined);
  assert.equal(restarted.state.tasks.length,1);assert.equal(restarted.dailyUsed(),0);
  assert.equal(restarted.hasSubmissionBoundary(same),false);assert.equal(restarted.poll(client).command,null);
  restarted.action({action:'task-resume',taskId:same.id});
  const refresh=restarted.poll(client).command;
  const changed=question(env,'language',{type:'select-one',options:[{text:'Different observed answer',disabled:false}]});
  restarted.result({clientId:client.clientId,commandId:refresh.id,result:{...report(),questions:[unknown,changed,optional]}});
  assert.deepEqual(restarted.snapshot().tasks[0].answerBatch.questions.map(q=>q.scope),[changed.scope]);
});

test('dynamic answers bind exact country and most recent locality candidate rather than their display label',async t=>{
  const env=setup(t,{production:true});begin(env);
  const country=question(env,'country',{controlKind:'phone-country',type:'select-one',options:[
    {id:'us',dial:'1',text:'United States +1'},{id:'ca',dial:'1',text:'Canada +1'}]});
  const location=question(env,'candidate-location',{controlKind:'location',customControl:true,optionsComplete:false});
  env.send(env.take(),{ok:true,layout:'layout',questions:[country,location],login:env.login});
  const batch=env.store.answerBatch(env.task);
  const body={action:'answers',taskId:env.task.id,batchVersion:batch.version,answers:[
    {scope:country.scope,version:country.version,answer:'Canada +1',selectionId:'ca',save:'task'},
    {scope:location.scope,version:location.version,answer:'Twin City',selectionId:'place-2',save:'task'}
  ]};
  assert.equal(batch.questions[1].profileKey,null);
  const request={taskId:env.task.id,batchVersion:batch.version,scope:location.scope,query:'Twin City'};
  const makePlace=(id,latitude)=>({id,label:'Twin City',latitude,longitude:'-75',country:'CA'});
  const one=makePlace('place-1','40'),two=makePlace('place-2','41');
  await env.store.findGreenhouseLocations(request,async()=>[one,two]);
  await env.store.findGreenhouseLocations(request,async()=>[one]);
  assert.throws(()=>env.store.action(body),/过期/);
  await env.store.findGreenhouseLocations(request,async()=>[one,two]);
  assert.throws(()=>env.store.action({...body,answers:[{...body.answers[0],selectionId:'us'},body.answers[1]]}),/实际选项/);
  assert.throws(()=>env.store.action({...body,answers:[body.answers[0],{...body.answers[1],save:'profile'}]}),/仅用于当前任务/);
  assert.equal(env.store.action(body).saved,2);
  const restored=new Store(env.paths,{now:env.clock}),task=restored.task(env.task.id);
  assert.deepEqual(task.answers[location.scope].location,two);
  assert.equal(task.answers[country.scope].selectionId,'ca');
  assert.equal(restored.applicableAnswer(task,{...location,selectedId:'place-1'}),null);
  assert.equal(restored.applicableAnswer(task,{...country,selectedId:'us'}),null);
  assert.equal(restored.applicableAnswer(task,location),'Twin City');
  assert.equal(restored.dailyUsed(),0);
});

test('real saved intention survives the same observed country, but a later page change needs review',t=>{
  const env=setup(t,{production:true});begin(env);
  const q=question(env,'country',{controlKind:'phone-country',type:'select-one',alreadyPopulated:true,selectedId:'us',options:[
    {id:'us',dial:'1',text:'United States +1'},{id:'ca',dial:'1',text:'Canada +1'},{id:'jp',dial:'81',text:'Japan +81'}]});
  const report=question=>({ok:true,layout:'layout',questions:[question],login:env.login});
  env.send(env.take(),report(q));
  const batch=env.store.answerBatch(env.task);
  env.store.action({action:'answers',taskId:env.task.id,batchVersion:batch.version,answers:[
    {scope:q.scope,version:q.version,value:'Canada +1',answer:'Canada +1',selectionId:'ca',save:'task'}
  ]});
  const resumed=new Store(env.paths,{now:env.clock}),task=resumed.task(env.task.id);
  assert.equal(task.answers[q.scope].selectionId,'ca');
  assert.equal(task.answers[q.scope].pageBaselineId,'us');
  const finish=question=>{
    const read=resumed.poll(client).command;assert.equal(read.op,'inspect');
    resumed.result({clientId:client.clientId,commandId:read.id,result:report(question)});
  };
  finish(q);
  assert.equal(task.status,'waiting_user');assert.match(task.issue.title,/答案已保存/);
  resumed.action({action:'task-resume',taskId:task.id});finish({...q,selectedId:'jp'});
  const changed=resumed.answerBatch(task);
  assert.equal(task.status,'waiting_answer');
  assert.equal(changed.questions[0].observedChoice,'Japan +81');
  assert.equal(changed.questions[0].priorAnswer.value,'Canada +1');
  assert.equal(resumed.applicableAnswer(task,{...q,selectedId:undefined,alreadyPopulated:false}),null);
  assert.equal(resumed.dailyUsed(),0);
});

test('changing the confirmed self-identification branch invalidates its earlier Race answer',t=>{
  const env=setup(t,{production:true});begin(env);
  const parent=question(env,'hispanic_ethnicity',{controlKind:'hispanic',type:'select-one',required:false,
    options:[{id:'0',text:'No'},{id:'1',text:'Yes'},{id:'2',text:'Decline'}]});
  const race=question(env,'race',{controlKind:'conditional-race',type:'select-one',required:false,
    options:[{id:'2',text:'Asian'}],parentScope:parent.scope});
  const observe=questions=>env.send(env.take(),{ok:true,layout:'layout',questions,login:env.login});
  const save=(q,selectionId,answer)=>{
    const batch=env.store.answerBatch(env.task);
    assert.deepEqual(batch.questions.map(q=>q.key),[q.key]);
    env.store.action({action:'answers',taskId:env.task.id,batchVersion:batch.version,answers:[{scope:q.scope,version:q.version,selectionId,answer,save:'task'}]});
  };
  observe([parent]);save(parent,'0','No');
  observe([parent,race]);save(race,'2','Asian');
  const changed=question(env,'hispanic_ethnicity',{controlKind:'hispanic',type:'select-one',required:false,
    options:[{id:'0',text:'No'},{id:'1',text:'Yes'}]});
  observe([changed]);save(changed,'1','Yes');
  assert.equal(env.task.answers[race.scope].stale,true);
  assert.equal(env.store.applicableAnswer(env.task,race),null);
  assert.equal(env.store.dailyUsed(),0);
});

test('real location search uses the configuration of the exact task page',async t=>{
  const origin='https://job-boards.greenhouse.io',taskUrl=origin+'/mattermost/jobs/900000011';
  const site={adapter:'greenhouse-v1',tenant:'mattermost',origin};
  const job={urlToken:site.tenant,jobPostId:'900000011',jobPost:{public_url:taskUrl}};
  const config={LOCATION_CONTROL_PROVIDER:'pelias',
    LOCATION_CONTROL_BASE_URL:'https://api-geocode-earth-proxy.greenhouse.io/',LOCATION_CONTROL_API_KEY:'fictional-test'};
  const urls=[];
  t.mock.method(globalThis,'fetch',async (target,options)=>{
    urls.push(String(target));
    if(urls.length===1||urls.length===3){
      const state={loaderData:{root:{ENV:config},'routes/$url_token_.jobs_.$job_post_id':job}};
      return new Response('<script>window.__remixContext = '+JSON.stringify({state})+'</script>',{headers:{'Content-Type':'text/html'}});
    }
    assert.equal(options.headers.Origin,origin);
    assert.equal(target.searchParams.get('api_key'),config.LOCATION_CONTROL_API_KEY);
    assert.equal(target.searchParams.get('text'),'Fictional City');
    return Response.json({features:[{geometry:{type:'Point',coordinates:[-72,46]},
      properties:{id:'site-test',label:'Fictional City, Canada',layer:'locality',country:'Canada',country_code:'CA'}}]});
  });
  assert.deepEqual(await searchGreenhouseLocations('Fictional City',{site,taskUrl}),
    [{id:'site-test',label:'Fictional City, Canada',longitude:'-72',latitude:'46',country:'CA'}]);
  assert.equal(urls[0],taskUrl);
  assert.match(urls[1],/^https:\/\/api-geocode-earth-proxy\.greenhouse\.io\/v1\/autocomplete\?/);
  job.jobPostId='900000012';
  await assert.rejects(searchGreenhouseLocations('Fictional City',{site,taskUrl}),/配置已变化/);
  assert.equal(urls.length,3);
});

test('normal real settings cannot grant the isolated submission purpose',t=>{
  const env=setup(t,{production:true});
  env.confirm();
  const inspect=env.task.confirmation;
  assert.throws(()=>env.confirm({purpose:'isolated-submit',resumeSha256:env.store.state.resume.sha256}),/明确选择只读检查/);
  assert.deepEqual(env.task.confirmation,inspect);
  assert.equal(env.store.snapshot().tasks[0].executionOffer,null);
});

test('legacy real confirmation does not grant either new permission and preserves historical unknown',t=>{
  const env=setup(t,{production:true});begin(env);
  const original=env.task.confirmation;
  const {purpose,...scope}=original;
  env.task.confirmation={...scope,submitConfirmed:true};
  env.task.answers={historical:{value:'Fictional persisted answer'}};
  const unknown={...structuredClone(env.task),id:'old-unknown',status:'unknown',phase:'verify',submissionStarted:true};
  env.store.state.tasks.push(unknown);env.store.save();
  const restored=new Store(env.paths,{now:env.clock});restored.heartbeat(client);
  for(const item of [restored.task(env.task.id),restored.task(unknown.id)]){
    assert.deepEqual(item.confirmation,{...scope,purpose:'unverified'});
    assert.deepEqual(item.answers,env.task.answers);
    assert.deepEqual(item.resumeSnapshot,env.task.resumeSnapshot);
    assert.equal(restored.confirmedTask(item,'inspect'),false);
    assert.equal(restored.confirmedTask(item,'submit'),false);
  }
  assert.equal(restored.snapshot().tasks[0].needsConfirmation,true);
  assert.equal(restored.poll(client).command,null);
  assert.equal(restored.canVerifyTask(restored.task(unknown.id)),true);
  assert.throws(()=>restored.action({action:'task-resume',taskId:unknown.id}),/只能核对/);
});
