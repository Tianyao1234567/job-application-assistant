// Actual dashboard/file chooser acceptance for the new v3/delta import only.
// The complete Manager fixtures are fictional; no PDF or employer is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createApp} from '../server.mjs';
import {definitions} from '../../autofill-extension/shared/schema.js';
import {testDirectory,removeTestDirectory,browserOptions,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';

const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const isolated=await testDirectory('profile-file-import'),results=[],pageErrors=[],externalRequests=[],importRequests=[];
const examples=path.join(projectRoot,'docs/examples');
const legacyPath=path.join(examples,'PROFILE_LEGACY_V3_FICTIONAL.json');
const deltaPath=path.join(examples,'PROFILE_UPDATE_FICTIONAL.json');
const legacy=JSON.parse(await fs.readFile(legacyPath,'utf8'));
const evidence={scope:'Actual shipped dashboard, local JSON file chooser, authenticated preview/confirm HTTP and persistent Store. Manager-provided fictional v3/delta fixtures only; no PDF rerun, MV3, Windows or employer claim.',source:process.env.GITHUB_SHA||null,results};
let app,browser,page,key,originalAttachment;
const wait=async(name,predicate,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,80));}throw new Error('Timed out: '+name);};
const check=async(name,fn)=>{const start=Date.now();try{await fn();results.push({name,passed:true,durationMs:Date.now()-start});console.log('PASS '+name);}catch(error){results.push({name,passed:false,durationMs:Date.now()-start});throw error;}};
const importForm=()=>page.getByRole('form',{name:'核对资料文件变更',exact:true});
const editor=()=>page.getByRole('form',{name:'确认申请资料',exact:true,includeHidden:true});
const rows=()=>Object.fromEntries(['education','experience','projects'].map(kind=>[kind,app.store.state.profile.data[kind].map(row=>row.id)]));
const previewCount=()=>importRequests.filter(request=>request.path==='/api/profile/import/preview').length;
async function viewProfile(){await page.goto(app.url+'/?profile-file-test='+Date.now()+'#profile');await page.getByLabel('选择资料文件（JSON）',{exact:true}).waitFor();}
async function chooseFile(file){
  await wait('JSON chooser enabled',()=>page.getByLabel('选择资料文件（JSON）',{exact:true}).isEnabled());
  const previous=app.store.profileFileDraft?.id;
  await page.getByLabel('选择资料文件（JSON）',{exact:true}).setInputFiles(file);
  await wait('real local file preview response',()=>app.store.profileFileDraft?.status==='ready'&&app.store.profileFileDraft.id!==previous);
  await importForm().waitFor();return structuredClone(app.store.profileFileDraft);
}
async function confirmPreview(){
  const form=importForm();assert.equal(await form.locator('input[type=checkbox]').count(),1,'Import has one batch confirmation');
  await form.getByLabel('我已核对本次资料文件变更',{exact:true}).check();
  const response=page.waitForResponse(reply=>new URL(reply.url()).pathname==='/api/profile/import/confirm'&&reply.request().method()==='POST');
  await form.getByRole('button',{name:'确认保存所选资料变更',exact:true}).click();
  const saved=await response;assert.equal(saved.status(),200,'Actual UI confirmation must reach authenticated backend');
  const result=await saved.json();assert.equal(result.ok,true);
  await wait('saved import state',()=>app.store.profileFileDraft?.status==='saved');
  await page.getByText('资料文件已核对保存',{exact:true}).waitFor();
  return result;
}
async function assertAttachment(){
  assert.deepEqual(app.store.state.resume,originalAttachment.record,'JSON import must not replace attachment metadata or versions');
  assert.deepEqual(await fs.readFile(app.store.state.resume.file),originalAttachment.bytes,'JSON import must preserve attachment bytes');
}
function assertNoApplication(){
  assert.equal(app.store.state.tasks.length,0);assert.equal(app.store.state.answers.length,0);
  assert.equal(app.store.command,null);assert.deepEqual(app.store.queue,[]);
  assert.equal(app.store.state.running,false);assert.equal(app.store.connection,null);
}

try{
  app=await createApp({dataDir:path.join(isolated,'data'),port:0,startFixture:false,testMode:true});
  // Attachment presence is fixture setup, not a second import mechanism. The
  // JSON delivery path below always goes through the actual file chooser.
  const bytes=Buffer.from('Explicitly fictional existing attachment for JSON import preservation.');
  app.store.setResume({name:'fictional-existing-attachment.txt',mime:'text/plain',base64:bytes.toString('base64'),mode:'demo'});
  originalAttachment={bytes,record:structuredClone(app.store.state.resume)};
  app.server.on('request',(request,response)=>{const pathname=new URL(request.url,app.url).pathname;if(pathname.startsWith('/api/profile/import/'))response.once('finish',()=>importRequests.push({path:pathname,status:response.statusCode,method:request.method}));});
  browser=await chromium.launch(browserOptions());evidence.environment={platform:process.platform,node:process.version,browser:browser.version()};
  const context=await browser.newContext();
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===app.url)return route.continue();externalRequests.push('unexpected nonlocal request');return route.abort();});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>pageErrors.push(error.message));
  await viewProfile();key=await page.locator('meta[name="local-key"]').getAttribute('content');assert.ok(key);
  let importedIds;
  await check('complete fictional v3 file chooser maps six explicit records with one confirmation and retains unsupported/in-progress content',async()=>{
    await page.getByLabel('资料文件用途',{exact:true}).selectOption('demo');
    const draft=await chooseFile(legacyPath);
    assert.equal(app.store.state.profile.version,0);assert.equal(draft.kind,'legacy-v3');
    assert.equal(draft.records.filter(record=>record.kind==='education').length,2);
    assert.equal(draft.records.filter(record=>record.kind==='experience').length,1);
    assert.equal(draft.records.filter(record=>record.kind==='projects').length,3);
    for(const record of draft.records)await importForm().getByLabel('记录归属：'+(record.label||record.key),{exact:true}).selectOption('new');
    let accepted=0;
    for(let index=0;index<draft.changes.length;index++){
      const control=importForm().getByLabel(`变更 ${index+1}：处理`,{exact:true});
      if(await control.isDisabled())continue;
      const target=importForm().getByLabel(`变更 ${index+1}：目标字段`,{exact:true});
      if(await target.inputValue()){await control.selectOption('apply');accepted++;}
    }
    assert.ok(accepted>=30,'Supported legacy rows must be present in the actual UI');
    assertNoApplication();await confirmPreview();
    const profile=app.store.state.profile;assert.equal(profile.version,1);
    assert.equal(profile.data.education.length,2);assert.equal(profile.data.experience.length,1);assert.equal(profile.data.projects.length,3);
    assert.equal(profile.data.personal.name.zh,legacy.config.personalInfo['姓名']);
    assert.equal(profile.data.experience[0].role.zh,legacy.config.workList[0]['职位名称']);
    assert.equal(profile.data.projects[0].role,undefined,'A long duties paragraph must not become a role title');
    for(const label of ['项目描述','职责','项目中职责','描述And职责'])assert.ok(profile.data.projects[0].description.zh.includes(legacy.config.projectList[0][label]));
    const studying=profile.data.education.find(row=>row.school?.zh===legacy.config.educationList[0]['学校名称']);
    assert.ok(studying);assert.notEqual(studying.endDate?.zh,'2028-06-30','In-progress estimated graduation must not become an unconditional fact');
    const history=JSON.stringify(app.store.state.profileImportHistory);
    for(const text of ['示例工程学院','虚构课程项目奖','语言能力待本人核对','具有示例工程课程和项目经验','在读','2028-06-30'])assert.ok(history.includes(text),'Unsupported or qualified source must remain in persisted history');
    importedIds=rows();await assertAttachment();assertNoApplication();
  });
  await check('selecting a delta while local fields are dirty preserves the edit and file until explicit discard',async()=>{
    await page.getByText('查看或修改完整资料（可选）',{exact:true}).click();
    const city=editor().getByLabel(definitions.personal.desiredCity+' 中文',{exact:true}),dirty='尚未保存的虚构新增城市';
    await city.fill(dirty);
    const version=app.store.state.profile.version,oldPreview=app.store.profileFileDraft.id,calls=previewCount();
    await page.getByLabel('选择资料文件（JSON）',{exact:true}).setInputFiles(deltaPath);
    await page.getByText('当前完整资料仍有未保存编辑',{exact:true}).waitFor();
    assert.equal(await editor().getByLabel(definitions.personal.desiredCity+' 中文',{exact:true}).inputValue(),dirty);
    assert.equal(app.store.state.profile.version,version);assert.equal(app.store.profileFileDraft.id,oldPreview);assert.equal(previewCount(),calls);
    await page.getByRole('button',{name:'重新预览所选资料文件',exact:true}).click();
    assert.equal(await editor().getByLabel(definitions.personal.desiredCity+' 中文',{exact:true}).inputValue(),dirty);assert.equal(previewCount(),calls);
    await page.getByRole('button',{name:'明确放弃未保存编辑，保留导入文件',exact:true}).click();
    await page.getByRole('button',{name:'重新预览所选资料文件',exact:true}).click();
    await wait('retained selected file can preview after explicit discard',()=>app.store.profileFileDraft?.status==='ready'&&app.store.profileFileDraft.id!==oldPreview);
    await importForm().waitFor();assert.equal(app.store.state.profile.version,version);assert.equal(previewCount(),calls+1);
    assert.equal(await editor().getByLabel(definitions.personal.desiredCity+' 中文',{exact:true}).inputValue(),legacy.config.personalInfo['期望城市']);
  });
  await check('one delta confirmation changes only the selected fact; unknown education and unmatched job answer remain pending after reload',async()=>{
    const before=structuredClone(app.store.state.profile),draft=app.store.profileFileDraft;
    const fact=draft.changes.find(row=>row.target==='personal.desiredCity');assert.ok(fact);
    const index=draft.changes.findIndex(row=>row.id===fact.id),choice=importForm().getByLabel(`变更 ${index+1}：处理`,{exact:true});
    assert.equal(await choice.inputValue(),'keep','A conflicting existing fact defaults to keeping its old value');
    await choice.selectOption('apply');
    const expected=draft.changes.findIndex(row=>row.qualifier==='expected');assert.ok(expected>=0);
    assert.equal(await importForm().getByLabel(`变更 ${expected+1}：处理`,{exact:true}).isDisabled(),true);
    assert.equal(await importForm().getByLabel('岗位答案 1：处理',{exact:true}).isDisabled(),true);
    const result=await confirmPreview();assert.equal(result.count,1);assert.equal(result.answerCount,0);
    const profile=app.store.state.profile;assert.equal(profile.version,before.version+1);assert.equal(profile.data.personal.desiredCity.zh,'示例城市丙');
    const expectedData=structuredClone(before.data);expectedData.personal.desiredCity=profile.data.personal.desiredCity;assert.deepEqual(profile.data,expectedData);assert.deepEqual(rows(),importedIds);
    const saved=app.store.state.profileImportHistory.find(item=>item.kind!=='legacy-v3');assert.ok(saved);
    assert.ok(saved.pendingChanges.some(row=>row.qualifier==='expected'&&row.value.zh==='2028-06-30'));
    assert.equal(saved.jobAnswers[0].status,'pending');assert.equal(saved.jobAnswers[0].matched,false);
    assert.ok(saved.notes.some(note=>note.text.includes('虚构待核对描述')));
    const disk=JSON.parse(await fs.readFile(app.store.file,'utf8'));assert.deepEqual(disk.profile,profile);
    await page.reload();await page.getByText('已保存的资料导入记录',{exact:true}).waitFor();
    assert.equal(await editor().getByLabel(definitions.personal.desiredCity+' 中文',{exact:true}).inputValue(),'示例城市丙');
    await page.getByText('岗位答案待处理',{exact:true}).first().waitFor();await assertAttachment();assertNoApplication();
  });
  await check('repeating the same legacy file preserves stable record IDs, added facts and profile version',async()=>{
    const before=structuredClone(app.store.state.profile),historyCount=app.store.state.profileImportHistory.length;
    for(let repeat=0;repeat<2;repeat++){
      const draft=await chooseFile(legacyPath);
      for(const record of draft.records){const value=await importForm().getByLabel('记录归属：'+(record.label||record.key),{exact:true}).inputValue();assert.ok(importedIds[record.kind].includes(value),'Repeated import must target its saved stable record ID');}
      const result=await confirmPreview();assert.equal(result.profileChanged,false);assert.equal(result.count,0);
      assert.deepEqual(app.store.state.profile,before);assert.deepEqual(rows(),importedIds);assert.equal(app.store.state.profileImportHistory.length,historyCount);
    }
    await assertAttachment();assertNoApplication();
  });
  await check('stale actual UI preview is rejected after an authenticated concurrent edit and cannot overwrite newer local facts',async()=>{
    const proposal=JSON.parse(await fs.readFile(deltaPath,'utf8'));
    proposal.profile_changes=[{field:'skills.description',target_hint:'虚构技能草稿',previous_value:null,value:{zh:'拟导入但已过期的虚构技能',en:null},source_text:'Fictional proposed update only',qualifier:null,confirmed:false}];
    proposal.job_answers=[];proposal.unmapped_notes=[];proposal.questions=[];
    await chooseFile({name:'fictional-stale-profile-update.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(proposal))});
    await importForm().getByLabel('变更 1：处理',{exact:true}).selectOption('apply');
    await importForm().getByLabel('我已核对本次资料文件变更',{exact:true}).check();
    const stateResponse=await page.request.get(app.url+'/api/state',{headers:{'X-Local-Key':key}});assert.equal(stateResponse.status(),200);
    const oldState=await stateResponse.json(),beforeVersion=app.store.state.profile.version,historyCount=app.store.state.profileImportHistory.length;
    // Model a legitimately stale browser tab while another authenticated local
    // editor saves. Only its state reads are frozen; actual confirm reaches HTTP.
    const freeze=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oldState)});
    await page.route(app.url+'/api/state',freeze);
    const latest=structuredClone(app.store.state.profile.data);latest.skills.description={zh:'本人稍后保存的虚构技能事实',en:null,source:'Fictional concurrent local edit',confirmed:true};
    const edited=await page.request.post(app.url+'/api/profile',{headers:{'X-Local-Key':key,Origin:app.url},data:{data:latest,mode:'demo',confirmed:true}});assert.equal(edited.status(),200);
    const response=page.waitForResponse(reply=>new URL(reply.url()).pathname==='/api/profile/import/confirm'&&reply.request().method()==='POST');
    await importForm().getByRole('button',{name:'确认保存所选资料变更',exact:true}).click();
    const rejected=await response;assert.equal(rejected.status(),400);assert.match((await rejected.json()).error,/变化|版本|过期/);
    assert.equal(app.store.state.profile.version,beforeVersion+1);assert.equal(app.store.state.profile.data.skills.description.zh,latest.skills.description.zh);assert.equal(app.store.state.profileImportHistory.length,historyCount);assert.deepEqual(rows(),importedIds);
    await page.unroute(app.url+'/api/state',freeze);
    await page.getByText('资料版本已经变化',{exact:true}).waitFor();
    assert.equal(await importForm().getByRole('button',{name:'确认保存所选资料变更',exact:true}).isDisabled(),true);
    await page.reload();assert.equal(await editor().getByLabel(definitions.skills.description+' 中文',{exact:true}).inputValue(),latest.skills.description.zh);
    await assertAttachment();assertNoApplication();
  });
  assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);assertNoApplication();
  evidence.ok=true;evidence.noExternalRequests=true;evidence.applicationAuthorizationGenerated=false;
  evidence.savedRecords=Object.fromEntries(Object.entries(rows()).map(([kind,ids])=>[kind,ids.length]));
  evidence.importHTTP={previews:importRequests.filter(item=>item.path.endsWith('/preview')).length,successfulConfirmations:importRequests.filter(item=>item.path.endsWith('/confirm')&&item.status===200).length,staleRejections:importRequests.filter(item=>item.path.endsWith('/confirm')&&item.status===400).length};
}catch(error){evidence.ok=false;evidence.failure=String(error.stack||error.message).slice(0,3500);console.error('::error title=JSON file import dashboard::'+evidence.failure.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));process.exitCode=1;}
finally{
  await browser?.close();await app?.close();await fs.mkdir(evidenceRoot,{recursive:true});await fs.writeFile(path.join(evidenceRoot,'profile-file-import-browser.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({ok:evidence.ok,scenarios:results.length,scope:evidence.scope}));await removeTestDirectory(isolated);
}
