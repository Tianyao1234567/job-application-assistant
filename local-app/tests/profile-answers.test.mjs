import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../model.mjs';
import {profileFactAnswer,stableProfileKey} from '../../autofill-extension/shared/profile-facts.js';
import {demoStore,taskEnvironment} from './profile-test-runtime.mjs';
const first=(env,t,extra={})=>env.q(t,'first_name','First Name*','confirmed-profile-fact',extra);
function begin(env,task,questions){env.confirm(task);env.store.run(false);env.prepare(task,questions);}
function batchBody(store,t,answers){const batch=store.answerBatch(t);return {action:'answers',taskId:t.id,batchVersion:batch.version,answers:batch.questions.map((q,i)=>({scope:q.scope,version:q.version,answer:answers[i],save:q.key==='first_name'?'profile':'scope'}))};}
test('task A batch saves once, re-confirms its new profile version, resumes without retyping; task B only asks new scoped questions',t=>{
 const store=demoStore(t),env=taskEnvironment(store),a=env.add('101'),qa=[first(env,a),env.q(a,'motivation','Why this fictional company?','company-motivation')];
 begin(env,a,qa);assert.equal(a.status,'waiting_answer');assert.equal(store.snapshot().tasks[0].answerBatch.questions.length,2);
 const result=store.action(batchBody(store,a,['Fictional','Fictional motivation A']));assert.equal(result.saved,2);assert.equal(result.profileChanged,true);assert.equal(a.status,'waiting_user');assert.equal(store.state.profile.data.personal.firstName.zh,'Fictional');
 const restored=new Store(store.paths);assert.equal(restored.task(a.id).answers[qa[1].scope].value,'Fictional motivation A');assert.equal(restored.state.answers.length,1);
 env.confirm(a);env.prepare(a,qa);for(const answer of ['Fictional','Fictional motivation A']){const c=env.take();assert.equal(c.op,'answer');assert.equal(c.task.id,a.id);assert.equal(c.payload.answer,answer);env.send(c,{ok:true,layout:'fictional-profile-layout'});}
 assert.equal(a.phase,'preflight');store.action({action:'task-pause',taskId:a.id});
 const b=env.add('102'),qb=[first(env,b),env.q(b,'motivation','Why this fictional company?','company-motivation'),env.q(b,'new_fact','Which fictional project?')];
 env.confirm(b);env.prepare(b,qb);const reuse=env.take();assert.equal(reuse.op,'answer');assert.equal(reuse.payload.answer,'Fictional');env.send(reuse,{ok:true,layout:'fictional-profile-layout'});
 assert.equal(b.status,'waiting_answer');assert.deepEqual(store.answerBatch(b).questions.map(q=>q.key),['motivation','new_fact']);assert.equal(store.applicableAnswer(b,qb[1]),null);assert.equal(store.hasSubmissionBoundary(a),false);assert.equal(store.hasSubmissionBoundary(b),false);
});
test('stale batch, changed options, omitted/duplicate questions and forbidden stable-save reject the entire batch',t=>{
 const store=demoStore(t),env=taskEnvironment(store),task=env.add('201'),questions=[first(env,task),env.q(task,'choices','Choose an observed option','site-specific-question',{type:'select-one',options:[{text:'Observed A',disabled:false},{text:'Disabled',disabled:true}]})];begin(env,task,questions);
 const body=batchBody(store,task,['Fictional','Observed A']),before=structuredClone(store.state);
 const invalid=[{...body,batchVersion:'stale'},{...body,answers:body.answers.slice(0,1)},{...body,answers:[body.answers[0],body.answers[0]]},{...body,answers:[body.answers[0],{...body.answers[1],answer:'Disabled'}]},{...body,answers:[body.answers[0],{...body.answers[1],save:'profile'}]}];
 for(const candidate of invalid){assert.throws(()=>store.action(candidate));assert.deepEqual(store.state,before);}
 task.questions[1].options[0].text='Changed option';assert.throws(()=>store.action(body),/变化/);assert.equal(store.state.profile.data.personal.firstName,undefined);assert.equal(store.state.answers.length,0);
});
test('existing page value conflicts do not silently reuse a profile fact or replace a confirmed translation',t=>{
 const store=demoStore(t),data=structuredClone(store.state.profile.data);data.personal.firstName={zh:'Old fictional',en:'Old English',confirmed:true,source:'Fictional fixture'};store.setProfile({data,mode:'demo',confirmed:true});
 const env=taskEnvironment(store),task=env.add('301'),q=first(env,task,{alreadyPopulated:true,currentValue:'Human-entered original'});begin(env,task,[q]);assert.equal(task.status,'waiting_answer');
 const body=batchBody(store,task,['New fictional']);assert.throws(()=>store.action(body),/冲突/);assert.equal(store.state.profile.data.personal.firstName.en,'Old English');
 store.action({...body,answers:[{...body.answers[0],replace:true}]});assert.equal(store.state.profile.data.personal.firstName.zh,'New fictional');assert.equal(store.state.profile.data.personal.firstName.en,null);
});
test('stable fact mapping requires observed identity key and purpose, never motivation/country/time/authorization by label',t=>{
 const store=demoStore(t),env=taskEnvironment(store),task=env.add('401');const q=first(env,task);
 assert.equal(stableProfileKey(q),'personal.firstName');
 for(const extra of [{key:'custom_first_name'},{purpose:'company-motivation'},{text:'First Name at this company'},{type:'select-one',options:[{text:'Fictional'}]},{unresolved:true}])assert.equal(stableProfileKey({...q,...extra}),null);
 for(const label of ['Country','Work authorization','Salary','Available start date','Why this company?'])assert.equal(stableProfileKey({...q,text:label}),null);
 const profile=structuredClone(store.state.profile.data);profile.personal.firstName={zh:'Fictional',en:null,source:'Fixture',confirmed:true};
 assert.equal(profileFactAnswer(q,profile),'Fictional');assert.equal(profileFactAnswer({...q,alreadyPopulated:true,currentValue:'Other'},profile),null);assert.equal(profileFactAnswer({...q,alreadyPopulated:true,currentValue:'Fictional'},profile),'Fictional');profile.personal.firstName.confirmed=false;assert.equal(profileFactAnswer(q,profile),null);
});
test('stable facts can be removed and scoped memories edited/revoked; submission boundary forbids new answers',t=>{
 const store=demoStore(t),env=taskEnvironment(store),task=env.add('501'),q=[first(env,task),env.q(task,'motivation','Why this fictional role?','company-motivation')];begin(env,task,q);
 store.action(batchBody(store,task,['Fictional','Motivation A']));env.confirm(task);
 store.action({action:'memory-update',scope:q[1].scope,answer:'Edited fictional motivation'});assert.equal(store.state.answers[0].value,'Edited fictional motivation');
 store.action({action:'memory-revoke',scope:q[1].scope});assert.equal(store.state.answers.length,0);assert.equal(task.answers[q[1].scope],undefined);
 const profile=structuredClone(store.state.profile.data);delete profile.personal.firstName;store.setProfile({data:profile,mode:'demo',confirmed:true});assert.equal(profileFactAnswer(q[0],store.state.profile.data),null);
 task.submissionStarted=true;task.status='unknown';task.phase='verify';const before=structuredClone(store.state);assert.throws(()=>store.action(batchBody(store,task,['Other'])));assert.deepEqual(store.state,before);assert.equal(store.canResumeTask(task),false);
});
test('later conditional batch preserves earlier task-only answers across explicit profile supplement confirmation',t=>{
 const store=demoStore(t),env=taskEnvironment(store),task=env.add('601'),motivation=env.q(task,'motivation','Why this fictional role?','company-motivation');begin(env,task,[motivation]);
 const body=batchBody(store,task,['Task-only original']);body.answers[0].save='task';store.action(body);
 const fact=first(env,task);env.prepare(task,[fact]);assert.equal(task.status,'waiting_answer');store.action(batchBody(store,task,['Fictional']));env.confirm(task);
 assert.equal(task.answers[motivation.scope].value,'Task-only original');assert.equal(store.state.answers.length,0);assert.equal(store.applicableAnswer(task,motivation),'Task-only original');
});
test('saved own/memory answers with a different current page value remain in the conflict batch',t=>{
 const store=demoStore(t),env=taskEnvironment(store),task=env.add('701'),original=env.q(task,'motivation','Why this fictional role?','company-motivation');begin(env,task,[original]);store.action(batchBody(store,task,['Saved answer']));
 const conflict={...original,alreadyPopulated:true,currentValue:'Manually changed answer'};env.prepare(task,[conflict]);assert.equal(task.status,'waiting_answer');assert.equal(store.answerBatch(task).questions.length,1);assert.equal(store.applicableAnswer(task,conflict),null);
});
