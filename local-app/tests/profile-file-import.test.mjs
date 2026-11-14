import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Store,hash} from '../model.mjs';
import {createApp} from '../server.mjs';
import {ROOT} from '../paths.mjs';
import {fictionalPDF} from './pdf-fixture.mjs';
import {client,demoStore,taskEnvironment,temporary} from './profile-test-runtime.mjs';

// Complete Manager-provided fixtures are fictional. No public site or personal
// profile is read, and these tests never authorize an application submission.
const example=name=>JSON.parse(fs.readFileSync(path.join(ROOT,'docs/examples',name),'utf8'));
const legacy=()=>example('PROFILE_LEGACY_V3_FICTIONAL.json');
const delta=()=>example('PROFILE_UPDATE_FICTIONAL.json');
const empty=()=>example('PROFILE_UPDATE_EMPTY.json');
const field=(zh,en=null)=>({zh,en,confirmed:true,source:'Fictional local import test'});
function preview(store,document){return store.previewProfileFile({document,mode:'demo',profileVersion:store.state.profile.version});}
function decisions(draft,select=()=>false){return draft.changes.map(row=>({id:row.id,action:select(row)?'apply':'keep',...(select(row)?{replace:true}:{})}));}
function confirm(store,draft,body={}){
  return store.confirmProfileFile({id:draft.id,profileVersion:draft.profileVersion,mode:'demo',confirmed:true,decisions:decisions(draft),recordMappings:{},createRecords:[],answerSelections:[],...body});
}
function scalarDocument(fieldName='personal.desiredCity',value='Fictional new city'){
  const document=empty();document.profile_changes=[{field:fieldName,target_hint:'Fictional personal fact',previous_value:null,value:{zh:value,en:null},source_text:'Explicit fictional local answer',qualifier:null,confirmed:false}];return document;
}
function originalPDF(store){
  const bytes=fictionalPDF(['Name: Fictional File Import Applicant','No real application data.']);
  store.setResume({name:'fictional-original.pdf',mime:'application/pdf',base64:bytes.toString('base64'),mode:'demo'});
  return {bytes,resume:structuredClone(store.state.resume)};
}
function assertPDF(store,original){assert.deepEqual(store.state.resume,original.resume);assert.deepEqual(fs.readFileSync(store.state.resume.file),original.bytes);assert.equal(store.state.resume.sha256,hash(original.bytes));}
function waitingTask(env,id='1001'){
  const task=env.add(id),question=env.q(task,'motivation','Why this fictional company?','company-motivation');
  env.confirm(task);env.store.run(false);env.prepare(task,[question]);assert.equal(task.status,'waiting_answer');return {task,question};
}
function unknownTask(env,id='1002'){
  const task=env.add(id);env.confirm(task);env.store.run(false);env.prepare(task,[]);
  const preflight=env.take();assert.equal(preflight.op,'preflight');env.send(preflight,{ok:true});
  const submit=env.take();assert.equal(submit.op,'submit');env.send(submit,{ok:false,kind:'unknown',message:'Fictional response timeout'});
  assert.equal(task.status,'unknown');assert.equal(task.submissionStarted,true);return task;
}
function answerDocument(env,task,question,answer='Fictional answer for this exact role'){
  const document=empty();document.job_answers=[{task_id:task.id,site_url:env.site.origin,company:env.site.company,job_url:task.url,question:question.text,answer,source_text:'Explicit fictional answer for the observed original question',confirmed:false}];return document;
}
function answerSelections(draft,select=()=>false){return draft.jobAnswers.map(row=>({id:row.id,action:select(row)?'apply':'keep'}));}

test('legacy preview reads the complete provided v3 structure without changing profile, PDF, answers or task identities',t=>{
  const store=demoStore(t),pdf=originalPDF(store),env=taskEnvironment(store),{task}=waitingTask(env),unknown=unknownTask(env);
  const memory={...env.q(task,'prior','Earlier fictional question'),value:'Prior fictional answer',confirmed:true,siteId:env.site.id};store.state.answers.push(memory);store.save();
  const before={profile:structuredClone(store.state.profile),tasks:structuredClone(store.state.tasks),answers:structuredClone(store.state.answers),connection:structuredClone(store.connection)},document=legacy(),input=structuredClone(document),draft=preview(store,document);
  assert.equal(draft.kind,'legacy-v3');assert.ok(draft.changes.length>=30);assert.equal(draft.records.filter(record=>record.kind==='education').length,2);assert.equal(draft.records.filter(record=>record.kind==='experience').length,1);assert.equal(draft.records.filter(record=>record.kind==='projects').length,3);
  assert.deepEqual(document,input);assert.deepEqual(store.state.profile,before.profile);assert.deepEqual(store.state.tasks,before.tasks);assert.deepEqual(store.state.answers,before.answers);assert.deepEqual(store.connection,before.connection);assert.equal(store.task(unknown.id).status,'unknown');assert.equal(store.state.profileImportHistory?.length||0,0);assertPDF(store,pdf);
  const serialized=JSON.stringify(draft);for(const text of ['示例工程学院','虚构课程项目奖','语言能力待本人核对','具有示例工程课程和项目经验'])assert.ok(serialized.includes(text),text);
  assert.ok(draft.notes.length>0);assert.equal(draft.notes.every(note=>note.confirmed===false),true);assert.equal(store.snapshot().profileImport.id,draft.id);
});
test('one confirmed delta changes only its selected fact, preserves all other data, and stores unsupported notes after confirmation',t=>{
  const store=demoStore(t),pdf=originalPDF(store),before=structuredClone(store.state.profile),beforeAnswers=structuredClone(store.state.answers),draft=preview(store,delta());
  assert.equal(store.state.profileImportHistory?.length||0,0);
  const result=confirm(store,draft,{decisions:decisions(draft,row=>row.target==='personal.desiredCity')});
  assert.equal(result.profileChanged,true);assert.equal(result.count,1);assert.equal(result.answerCount,0);assert.ok(result.pendingCount>=1);
  assert.equal(store.state.profile.version,before.version+1);assert.equal(store.state.profile.data.personal.desiredCity.zh,'示例城市丙');assert.equal(store.state.profile.data.personal.desiredCity.confirmed,true);
  const expected=structuredClone(before.data);expected.personal.desiredCity=store.state.profile.data.personal.desiredCity;assert.deepEqual(store.state.profile.data,expected);assert.deepEqual(store.state.answers,beforeAnswers);assertPDF(store,pdf);
  assert.equal(store.snapshot().profileImportHistory.length,1);assert.ok(JSON.stringify(store.snapshot().profileImportHistory).includes('虚构待核对描述'));
  const restored=new Store(store.paths);assert.deepEqual(restored.state.profile,store.state.profile);assert.deepEqual(restored.snapshot().profileImportHistory,store.snapshot().profileImportHistory);assertPDF(restored,pdf);
});
test('stale preview, mismatched base/previous value and missing or duplicate decisions cannot silently overwrite newer facts',t=>{
  const store=demoStore(t),draft=preview(store,scalarDocument()),before=structuredClone(store.state.profile);
  for(const body of [{confirmed:false},{profileVersion:999},{decisions:[]},{decisions:[...decisions(draft),decisions(draft)[0]]}]){assert.throws(()=>confirm(store,draft,body));assert.deepEqual(store.state.profile,before);}
  const edited=structuredClone(before.data);edited.skills.description=field('Locally edited fictional skill');store.setProfile({data:edited,mode:'demo',confirmed:true});const newer=structuredClone(store.state.profile);
  assert.throws(()=>confirm(store,draft,{profileVersion:newer.version,decisions:decisions(draft,()=>true)}),/版本|变化|过期/);assert.deepEqual(store.state.profile,newer);
  const document=scalarDocument();document.base_profile_version=0;document.profile_changes[0].previous_value={zh:'A different old city',en:null};const conflict=preview(store,document),row=conflict.changes[0];assert.equal(row.conflict,true);
  assert.throws(()=>confirm(store,conflict,{decisions:[{id:row.id,action:'apply'}]}),/冲突|替换|明确/);assert.deepEqual(store.state.profile,newer);
  confirm(store,conflict,{decisions:[{id:row.id,action:'apply',replace:true}]});assert.equal(store.state.profile.data.personal.desiredCity.zh,'Fictional new city');
});
test('null/unknown record and expected education date stay pending rather than erasing facts or claiming graduation',t=>{
  const store=demoStore(t),before=structuredClone(store.state.profile),document=delta(),draft=preview(store,document);
  const unresolved=draft.changes.find(row=>row.qualifier==='expected');assert.ok(unresolved);assert.equal(unresolved.target,null);
  const result=confirm(store,draft,{decisions:decisions(draft,row=>row.id===unresolved.id)});assert.equal(result.profileChanged,false);assert.ok(result.pendingCount>=1);assert.deepEqual(store.state.profile,before);
  assert.ok(JSON.stringify(store.state.profileImportHistory).includes('2028-06-30'));assert.ok(JSON.stringify(store.state.profileImportHistory).includes('expected'));
  const noDelete=scalarDocument();noDelete.profile_changes[0].value={zh:null,en:null};assert.throws(()=>preview(store,noDelete));assert.deepEqual(store.state.profile,before);
});
test('empty proposal is valid and no-op; file confirmation never supplies human confirmation or execution authority',t=>{
  const store=demoStore(t),env=taskEnvironment(store),{task}=waitingTask(env),before={profile:structuredClone(store.state.profile),tasks:structuredClone(store.state.tasks),answers:structuredClone(store.state.answers)},draft=preview(store,empty());
  const result=confirm(store,draft);assert.equal(result.profileChanged,false);assert.equal(result.count,0);assert.equal(result.answerCount,0);assert.deepEqual(store.state.profile,before.profile);assert.deepEqual(store.state.tasks,before.tasks);assert.deepEqual(store.state.answers,before.answers);
  const forged=scalarDocument();forged.profile_changes[0].confirmed=true;assert.throws(()=>preview(store,forged));assert.equal(store.task(task.id).status,'waiting_answer');assert.equal(store.hasSubmissionBoundary(task),false);
});
test('legacy record mapping is explicit and a repeated import preserves stable IDs without duplicate experiences or profile versions',t=>{
  const store=demoStore(t),document=legacy(),profile=structuredClone(store.state.profile.data);
  profile.experience.push({id:'existing-same-company',company:field(document.config.workList[0]['公司名称']),role:field('Different existing fictional role')});store.setProfile({data:profile,mode:'demo',confirmed:true});
  const existing=structuredClone(store.state.profile.data.experience),draft=preview(store,document),work=draft.records.find(record=>record.kind==='experience');assert.ok(work);
  assert.notEqual(work.suggestedTarget,'existing-same-company');
  const select=row=>row.recordKey===work.key,body={decisions:decisions(draft,select),recordMappings:{[work.key]:'new'},createRecords:[{kind:work.kind,id:work.proposedId}]};
  const imported=confirm(store,draft,body);assert.equal(imported.profileChanged,true);assert.equal(store.state.profile.data.experience.length,existing.length+1);assert.deepEqual(store.state.profile.data.experience.slice(0,existing.length),existing);
  const created=store.state.profile.data.experience.find(record=>record.id===work.proposedId);assert.ok(created);assert.equal(created.role.zh,document.config.workList[0]['职位名称']);assert.equal(created.description.zh,document.config.workList[0]['工作职责']);
  const beforeRepeat=structuredClone(store.state.profile),again=preview(store,document),same=again.records.find(record=>record.key===work.key);assert.equal(same.proposedId,work.proposedId);
  const result=confirm(store,again,{decisions:decisions(again,select),recordMappings:{[work.key]:work.proposedId}});
  assert.equal(result.profileChanged,false);assert.deepEqual(store.state.profile,beforeRepeat);assert.equal(store.state.profile.data.experience.filter(record=>record.id===work.proposedId).length,1);
});
test('legacy record can target an explicitly chosen current ID while unrelated rows and original project descriptions remain untouched',t=>{
  const store=demoStore(t),document=legacy(),profile=structuredClone(store.state.profile.data),target=profile.experience[0].id,before=structuredClone(profile),draft=preview(store,document),work=draft.records.find(record=>record.kind==='experience');
  confirm(store,draft,{decisions:decisions(draft,row=>row.recordKey===work.key),recordMappings:{[work.key]:target}});
  assert.equal(store.state.profile.data.experience.length,before.experience.length);assert.equal(store.state.profile.data.experience[0].id,target);assert.equal(store.state.profile.data.experience[0].company.zh,document.config.workList[0]['公司名称']);assert.deepEqual(store.state.profile.data.experience[1],before.experience[1]);assert.deepEqual(store.state.profile.data.projects,before.projects);
  const projectDraft=preview(store,document),project=projectDraft.records.find(record=>record.kind==='projects');
  confirm(store,projectDraft,{decisions:decisions(projectDraft,row=>row.recordKey===project.key),recordMappings:{[project.key]:'new'},createRecords:[{kind:project.kind,id:project.proposedId}]});
  const added=store.state.profile.data.projects.find(record=>record.id===project.proposedId),source=document.config.projectList[0];assert.ok(added);
  for(const key of ['项目描述','职责','项目中职责','描述And职责'])assert.ok(added.description.zh.includes(source[key]),key);
  assert.equal(added.role,undefined);assert.equal(added.title.zh,source['项目名称']);
});
test('complete legacy fixture maps supported fields once while preserving unsupported content and in-progress education semantics',t=>{
  const store=demoStore(t),document=legacy(),draft=preview(store,document),recordMappings=Object.fromEntries(draft.records.map(record=>[record.key,'new'])),createRecords=draft.records.map(record=>({kind:record.kind,id:record.proposedId}));
  const result=confirm(store,draft,{decisions:decisions(draft,()=>true),recordMappings,createRecords});assert.equal(result.profileChanged,true);assert.ok(result.count>=30);
  const profile=store.state.profile.data;
  for(const [key,label]of [['name','姓名'],['phone','手机号码'],['email','邮箱'],['location','所在地'],['desiredCity','期望城市']])assert.equal(profile.personal[key].zh,document.config.personalInfo[label]);
  const education=draft.records.filter(record=>record.kind==='education').map(record=>profile.education.find(entry=>entry.id===record.proposedId));assert.equal(education.length,2);assert.equal(education[0].school.zh,document.config.educationList[0]['学校名称']);assert.equal(education[1].endDate.zh,document.config.educationList[1]['结束就读时间']);assert.equal(education[1].degree.zh,'本科');
  // The source explicitly says in-progress: an unqualified endDate must not
  // silently turn the estimated date into a completed education fact.
  assert.notEqual(education[0].endDate?.zh,'2028-06-30');
  assert.equal(profile.skills.description.zh,document.config.selfDescription['专业技能']);assert.equal(profile.customAnswers['证件号码'],undefined);
  const history=JSON.stringify(store.snapshot().profileImportHistory);for(const text of ['示例工程学院','虚构课程项目奖','语言能力待本人核对','具有示例工程课程和项目经验','在读'])assert.ok(history.includes(text),text);
});
test('confirmed profile change invalidates a waiting task confirmation while unknown history and extension identity remain untouched',t=>{
  const store=demoStore(t),pdf=originalPDF(store),env=taskEnvironment(store),{task}=waitingTask(env),unknown=unknownTask(env),beforeUnknown=structuredClone(unknown),connection=structuredClone(store.connection),pinnedProfile=task.profileVersion,answerScope=task.questions[0].scope;
  const draft=preview(store,scalarDocument());confirm(store,draft,{decisions:decisions(draft,()=>true)});
  const saved=store.task(task.id);assert.equal(saved.status,'waiting_user');assert.equal(saved.profileVersion,pinnedProfile);assert.equal(store.snapshot().tasks.find(item=>item.id===task.id).needsConfirmation,true);assert.equal(saved.questions[0].scope,answerScope);
  assert.deepEqual(store.task(unknown.id),beforeUnknown);assert.equal(store.canResumeTask(store.task(unknown.id)),false);assert.deepEqual(store.connection,connection);assert.equal(store.connection.extensionId,client.extensionId);assertPDF(store,pdf);
});
test('one manual file confirmation saves a generic fact and exact current-task answer while unmatched context remains pending',t=>{
  const store=demoStore(t),pdf=originalPDF(store),env=taskEnvironment(store),{task,question}=waitingTask(env),unknown=unknownTask(env),beforeUnknown=structuredClone(unknown),beforeAnswers=structuredClone(store.state.answers),beforeCustom=structuredClone(store.state.profile.data.customAnswers),document=delta();
  document.job_answers.unshift(answerDocument(env,task,question).job_answers[0]);
  const draft=preview(store,document),matched=draft.jobAnswers.find(row=>row.matched===true);assert.ok(matched);assert.equal(matched.taskId,task.id);assert.equal(matched.scope,question.scope);assert.equal(matched.questionVersion,question.version);assert.ok(matched.batchVersion);
  const result=confirm(store,draft,{decisions:decisions(draft,row=>row.target==='personal.desiredCity'),answerSelections:answerSelections(draft,row=>row.id===matched.id)});
  const saved=store.task(task.id);assert.equal(result.profileChanged,true);assert.equal(result.answerCount,1);assert.ok(result.pendingCount>=1);assert.equal(store.state.profile.data.personal.desiredCity.zh,'示例城市丙');assert.equal(saved.answers[question.scope].value,'Fictional answer for this exact role');assert.equal(saved.answers[question.scope].confirmed,true);
  assert.equal(saved.status,'waiting_user');assert.equal(store.confirmedTask(saved),false);assert.deepEqual(store.state.answers,beforeAnswers);assert.deepEqual(store.state.profile.data.customAnswers,beforeCustom);assert.deepEqual(store.task(unknown.id),beforeUnknown);assert.equal(store.hasSubmissionBoundary(saved),false);assertPDF(store,pdf);
  const history=JSON.stringify(store.snapshot().profileImportHistory);assert.ok(history.includes('https://jobs.example.invalid'));assert.ok(history.includes('虚构本人提供的项目事实'));
  env.confirm(store.task(task.id));assert.equal(store.task(task.id).answers[question.scope].value,'Fictional answer for this exact role','the imported scoped answer survives explicit confirmation of the updated profile version');
});
test('matched imported job answer remains unconfirmed until manually selected and never becomes a generic company-motivation fact',t=>{
  const store=demoStore(t),env=taskEnvironment(store),{task,question}=waitingTask(env),before={profile:structuredClone(store.state.profile),tasks:structuredClone(store.state.tasks),answers:structuredClone(store.state.answers)},draft=preview(store,answerDocument(env,task,question));
  assert.equal(draft.jobAnswers[0].matched,true);assert.equal(draft.jobAnswers[0].confirmed,false);
  const result=confirm(store,draft,{answerSelections:answerSelections(draft)});assert.equal(result.profileChanged,false);assert.equal(result.answerCount,0);assert.ok(result.pendingCount>=1);
  assert.deepEqual(store.state.profile,before.profile);assert.deepEqual(store.state.tasks,before.tasks);assert.deepEqual(store.state.answers,before.answers);assert.equal(store.task(task.id).status,'waiting_answer');
});
test('unmatched task, company, site, job or question context cannot claim another task even when a file knows its ID',t=>{
  for(const patch of [{task_id:'unrelated-task'},{company:'Different fictional company'},{site_url:'https://unmatched.example.invalid'},{job_url:'http://127.0.0.1:17322/greenhouse/mattermost-replay/jobs/9999'},{question:'Different original question'}]){
    const store=demoStore(t),env=taskEnvironment(store),{task,question}=waitingTask(env),document=answerDocument(env,task,question);Object.assign(document.job_answers[0],patch);const before={profile:structuredClone(store.state.profile),tasks:structuredClone(store.state.tasks),answers:structuredClone(store.state.answers)},draft=preview(store,document);
    assert.equal(draft.jobAnswers[0].matched,false);const result=confirm(store,draft,{answerSelections:answerSelections(draft,()=>true)});assert.equal(result.answerCount,0);assert.ok(result.pendingCount>=1);assert.deepEqual(store.state.profile,before.profile);assert.deepEqual(store.state.tasks,before.tasks);assert.deepEqual(store.state.answers,before.answers);
  }
});
test('changed observed options reject the entire selected import without partial profile update or saved answers',t=>{
  const store=demoStore(t),env=taskEnvironment(store),task=env.add('2001'),question=env.q(task,'choice','Choose an observed fictional option','site-specific-question',{type:'select-one',options:[{text:'Observed A',disabled:false},{text:'Observed B',disabled:false}]});env.confirm(task);store.run(false);env.prepare(task,[question]);
  const document=answerDocument(env,task,question,'Observed A');document.profile_changes=scalarDocument().profile_changes;const draft=preview(store,document);assert.equal(draft.jobAnswers[0].matched,true);
  task.questions[0].options[0].text='Changed observed option';const before={profile:structuredClone(store.state.profile),tasks:structuredClone(store.state.tasks),answers:structuredClone(store.state.answers)};
  assert.throws(()=>confirm(store,draft,{decisions:decisions(draft,()=>true),answerSelections:answerSelections(draft,()=>true)}),/变化|版本|选项|原题|过期/);assert.deepEqual(store.state.profile,before.profile);assert.deepEqual(store.state.tasks,before.tasks);assert.deepEqual(store.state.answers,before.answers);assert.equal(store.state.profileImportHistory?.length||0,0);
});
test('partial imported batch is only a bound review hint until the existing complete answer batch is explicitly saved',t=>{
  const store=demoStore(t),env=taskEnvironment(store),task=env.add('3001'),questions=[env.q(task,'motivation','Why this fictional company?','company-motivation'),env.q(task,'experience','Describe an actual fictional project')];env.confirm(task);store.run(false);env.prepare(task,questions);
  const beforeProfile=structuredClone(store.state.profile),document=answerDocument(env,task,questions[0]),draft=preview(store,document);const result=confirm(store,draft,{answerSelections:answerSelections(draft,()=>true)});
  const saved=store.task(task.id);assert.equal(result.profileChanged,false);assert.equal(result.answerCount,0);assert.ok(result.pendingCount>=1);assert.equal(saved.status,'waiting_answer');assert.equal(saved.answers?.[questions[0].scope],undefined);assert.equal(store.state.answers.length,0);assert.deepEqual(store.state.profile,beforeProfile);assert.equal(store.hasSubmissionBoundary(saved),false);
  const batch=store.answerBatch(saved),hint=batch.questions.find(question=>question.scope===questions[0].scope).importedDraft;assert.ok(hint);assert.equal(hint.answer||hint.value,'Fictional answer for this exact role');assert.equal(hint.confirmed,false);assert.equal(batch.questions.length,2);
});
test('unknown task boundary refuses imported answers and preserves old execution and attachment bindings',t=>{
  const store=demoStore(t),pdf=originalPDF(store),env=taskEnvironment(store),unknown=unknownTask(env),question=env.q(unknown,'motivation','Why this fictional company?','company-motivation');unknown.questions=[question];unknown.question=question;store.save();const before=structuredClone(unknown),document=answerDocument(env,unknown,question),draft=preview(store,document);
  assert.equal(draft.jobAnswers[0].matched,false);const result=confirm(store,draft,{answerSelections:answerSelections(draft,()=>true)});assert.equal(result.answerCount,0);assert.ok(result.pendingCount>=1);assert.deepEqual(store.task(unknown.id),before);assert.equal(store.canResumeTask(store.task(unknown.id)),false);assertPDF(store,pdf);
});
test('file preview and confirmation HTTP routes require the existing local key and origin and reject invalid documents without changing saved data',async t=>{
  const app=await createApp({dataDir:temporary(t,'profile-file-auth'),port:0,startFixture:false,testMode:true});t.after(()=>app.close());app.store.demo();
  const html=await(await fetch(app.url)).text(),key=/name="local-key" content="([A-Za-z0-9_-]+)"/.exec(html)[1],before=structuredClone(app.store.state);
  const post=(route,body,headers={})=>fetch(app.url+route,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Key':key,Origin:app.url,...headers},body:JSON.stringify(body)});
  for(const route of ['/api/profile/import/preview','/api/profile/import/confirm']){
    assert.equal((await post(route,{}, {'X-Local-Key':'wrong'})).status,401);assert.equal((await post(route,{}, {Origin:'https://foreign.invalid'})).status,403);
  }
  assert.equal((await post('/api/profile/import/preview',{document:{format:'unknown-format',format_version:1},mode:'demo',profileVersion:app.store.state.profile.version})).status,400);
  assert.deepEqual(app.store.state,before);assert.equal(app.store.snapshot().profileImport,null);
});
test('file preview/confirm HTTP flow saves selected fields once, survives reload, and leaves the chosen PDF byte-identical',async t=>{
  const dataDir=temporary(t,'profile-file-http'),app=await createApp({dataDir,port:0,startFixture:false,testMode:true});t.after(()=>app.close());app.store.demo();const pdf=originalPDF(app.store),profileVersion=app.store.state.profile.version;
  const html=await(await fetch(app.url)).text(),key=/name="local-key" content="([A-Za-z0-9_-]+)"/.exec(html)[1];
  const post=(route,body)=>fetch(app.url+route,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Key':key,Origin:app.url},body:JSON.stringify(body)});
  const response=await post('/api/profile/import/preview',{document:delta(),mode:'demo',profileVersion});assert.equal(response.status,200);const {draft}=await response.json();
  assert.equal(app.store.state.profile.version,profileVersion);assert.equal(draft.status,'ready');
  const confirmed=await post('/api/profile/import/confirm',{id:draft.id,profileVersion,mode:'demo',confirmed:true,decisions:decisions(draft,row=>row.target==='personal.desiredCity'),recordMappings:{},createRecords:[],answerSelections:answerSelections(draft)});assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).count,1);
  const state=await(await fetch(app.url+'/api/state',{headers:{'X-Local-Key':key}})).json();assert.equal(state.profile.version,profileVersion+1);assert.equal(state.profile.data.personal.desiredCity.zh,'示例城市丙');assert.equal(state.profileImport.status,'saved');assert.equal(state.profileImportHistory.length,1);assert.equal(state.resume.file,undefined);assert.equal(JSON.stringify(state).includes(pdf.resume.file),false);assertPDF(app.store,pdf);
  const repeated=await post('/api/profile/import/confirm',{id:draft.id,profileVersion,mode:'demo',confirmed:true,decisions:decisions(draft,()=>true),recordMappings:{},createRecords:[],answerSelections:[]});assert.equal(repeated.status,400);
  const restored=new Store({data:dataDir});assert.deepEqual(restored.state.profile,app.store.state.profile);assert.equal(restored.snapshot().profileImportHistory.length,1);assertPDF(restored,pdf);
});
