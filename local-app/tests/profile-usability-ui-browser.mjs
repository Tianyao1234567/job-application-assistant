// Real dashboard and HTTP store, exclusively fictional data. Run on hosted Linux CI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createApp} from '../server.mjs';
import {parseProfileImport} from '../profile-update.mjs';
import {emptyProfile} from '../../autofill-extension/shared/schema.js';
import {testDirectory,removeTestDirectory,browserOptions,evidenceRoot} from '../../autofill-extension/tests/runtime.mjs';

const {chromium}=createRequire(new URL('../../autofill-extension/package.json',import.meta.url))('playwright');
const isolated=await testDirectory('profile-usability-ui'),dataDir=path.join(isolated,'data');
const results=[],errors=[],external=[],localOrigins=new Set();
const evidence={scope:'Fictional v3 file through actual profile dashboard and local HTTP store; no real applicant, employer or extension.',source:process.env.GITHUB_SHA||null,results};
const skills='编程：熟练 Python、C++；机器人与视觉：使用 ROS 和 OpenCV；嵌入式：熟悉 STM32；工具：Git；硬件：电路原型；熟悉示例控制模块。';
const projects=[1,2,3].map(i=>({id:`fictional-${i}`,项目名称:`虚构项目${i}`,项目描述:`项目描述${i}`,职责:`职责${i}`,项目中职责:`项目职责${i}`,描述And职责:`描述与职责${i}`}));
const document={version:'3.0.0',exportTime:'2026-01-01',config:{personalInfo:{'最高学历':'硕士研究生（在读）'},educationList:[{id:'master','学校名称':'虚构大学','专业名称':'虚构专业','学历':'硕士','结束就读时间':'2028-06'}],projectList:projects,selfDescription:{专业技能:skills}}};
let app,browser,page;
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name);}catch(error){results.push({name,passed:false});throw error;}};
const form=()=>page.getByRole('form',{name:'核对资料文件变更',exact:true});
const editor=()=>page.getByRole('form',{name:'确认申请资料',exact:true});
const responseFor=pathname=>page.waitForResponse(r=>new URL(r.url()).pathname===pathname&&r.request().method()==='POST');
async function open(){await page.goto(app.url+'/#profile');await page.getByLabel('选择资料文件（JSON）',{exact:true}).waitFor();}
try{
 app=await createApp({dataDir,port:0,startFixture:false,testMode:true});localOrigins.add(app.url);
 browser=await chromium.launch(browserOptions());const context=await browser.newContext();
 await context.route('**/*',route=>{if(localOrigins.has(new URL(route.request().url()).origin))return route.continue();external.push(new URL(route.request().url()).origin);return route.abort();});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await open();await page.getByLabel('资料文件用途',{exact:true}).selectOption('demo');
 const previewResponse=responseFor('/api/profile/import/preview');
 await page.getByLabel('选择资料文件（JSON）',{exact:true}).setInputFiles({name:'fictional-profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))});
 assert.equal((await previewResponse).status(),200);await form().waitFor();
 const draft=structuredClone(app.store.profileFileDraft);assert.equal(draft.kind,'legacy-v3');assert.equal(app.store.state.profile.version,0);
 await check('实际文件预览可编辑且不提前保存',async()=>{
  for(const record of draft.records)if(!record.suggestedTarget)await form().getByLabel('记录归属：'+(record.label||record.key),{exact:true}).selectOption('new');
  const edited=draft.changes.find(c=>c.recordKey===draft.records.find(r=>r.kind==='projects').key&&c.field.endsWith('.responsibility'));
  assert.ok(edited);await form().locator(`[data-import-change-id="${edited.id}"] textarea`).fill('本人修改的职责1');
  for(let i=1;i<=3;i++)await form().getByLabel(`选择项目 ${i} 的角色`,{exact:true}).check();
  await form().getByRole('button',{name:'将选中项目的角色设为核心成员',exact:true}).click();
  assert.equal(app.store.state.profile.version,0);
  assert.equal(await form().getByRole('button',{name:'确认并保存资料',exact:true}).count(),1);
 });
 await check('一次确认保存硕士、三个项目及分类技能',async()=>{
  const response=responseFor('/api/profile/import/confirm');await form().getByRole('button',{name:'确认并保存资料',exact:true}).click();
  const saved=await response;assert.equal(saved.status(),200,JSON.stringify(await saved.json()));
  const profile=app.store.state.profile.data;assert.equal(app.store.state.profile.version,1);
  const education=profile.education[0];assert.equal(education.school.zh,'虚构大学');assert.equal(education.major.zh,'虚构专业');assert.equal(education.degree.zh,'硕士');assert.equal(education.studyStatus.zh,'在读');assert.equal(education.expectedEndDate.zh,'2028-06');assert.equal(education.endDate,undefined);
  assert.equal(profile.projects.length,3);
  for(let i=0;i<3;i++){const p=profile.projects[i];assert.equal(p.role.zh,'核心成员');assert.equal(p.description.zh,`项目描述${i+1}`);assert.equal(p.responsibility.zh,i===0?'本人修改的职责1':`职责${i+1}`);assert.equal(p.projectDuty.zh,`项目职责${i+1}`);assert.equal(p.descriptionAndDuty.zh,`描述与职责${i+1}`);}
  assert.equal(profile.skills.programming.zh,'编程：熟练 Python、C++；');assert.equal(profile.skills.robotics.zh,'机器人与视觉：使用 ROS 和 OpenCV；');assert.equal(profile.skills.embedded.zh,'嵌入式：熟悉 STM32；');assert.equal(profile.skills.tools.zh,'工具：Git；');assert.equal(profile.skills.hardware.zh,'硬件：电路原型；');assert.equal(profile.skills.description.zh,'熟悉示例控制模块。');
  assert.ok(app.store.state.profileImportHistory.some(item=>item.notes?.some(note=>note.label==='技能分类待确认')));
 });
 const ids=app.store.state.profile.data.projects.map(p=>p.id);
 await check('服务重启后实际资料页载入、修改并保存',async()=>{
  await app.close();app=await createApp({dataDir,port:0,startFixture:false,testMode:true});localOrigins.add(app.url);await open();
  assert.deepEqual(app.store.state.profile.data.projects.map(p=>p.id),ids);
  await page.getByText('查看或修改完整资料（可选）',{exact:true}).click();
  const responsibility=editor().locator(`[data-focus="profile-projects-${ids[0]}-responsibility-zh"]`);assert.equal(await responsibility.count(),1);
  await responsibility.fill('重启后本人再次修改');
  const save=responseFor('/api/profile');await editor().getByRole('button',{name:'确认并保存资料',exact:true}).click();assert.equal((await save).status(),200);
  await page.reload();await page.getByText('查看或修改完整资料（可选）',{exact:true}).click();
  assert.equal(await editor().locator(`[data-focus="profile-projects-${ids[0]}-responsibility-zh"]`).inputValue(),'重启后本人再次修改');
  assert.deepEqual(app.store.state.profile.data.projects.map(p=>p.id),ids);
 });
 await check('旧版已导入项目的真实页面修复、冲突保护和重复导入',async()=>{
  // Seed the persisted shape produced by the accepted older importer. The
  // attachment and all project contents are deliberately fictional.
  await page.goto('about:blank');await app.close();
  const oldDir=path.join(isolated,'old-import');app=await createApp({dataDir:oldDir,port:0,startFixture:false,testMode:true});localOrigins.add(app.url);
  const oldProjects=[1,2,3].map(i=>({id:`legacy-${i}`,项目名称:`虚构旧项目${i}`,项目描述:`虚构描述${i}第一段\n\n第二段`,职责:`虚构职责${i}`,项目中职责:`虚构项目职责${i}`,描述And职责:`虚构描述与职责${i}`}));
  const oldDocument={version:'3.0.0',exportTime:'2026-01-01',config:{projectList:oldProjects}};
  const parsed=parseProfileImport(oldDocument),profile=emptyProfile(),mappings={};
  const value=(zh,source=zh)=>({zh,en:null,source:source.slice(0,200),confirmed:true});
  for(let i=0;i<oldProjects.length;i++){
   const row=oldProjects[i],record=parsed.records[i];mappings[record.key]=record.proposedId;
   const combined=['项目描述','职责','项目中职责','描述And职责'].map(label=>label+'：'+row[label]).join('\n\n');
   profile.projects.push({id:record.proposedId,title:value(row.项目名称),description:value(combined),...(i===0?{projectDuty:value('本人后来修改的项目职责')}: {})});
  }
  const ambiguous='项目描述：待本人核对\n\n职责：第一段\n\n职责：第二段';
  profile.projects.push({id:'ambiguous-project',title:value('虚构需核对项目'),role:value('既有角色'),description:value(ambiguous)});
  app.store.state.profile={version:1,data:profile,mode:'demo',updatedAt:new Date().toISOString()};app.store.state.profileImportMappings=mappings;app.store.save();
  const bytes=Buffer.from('Fictional attachment retained during old profile repair');app.store.setResume({name:'fictional-repair.txt',mime:'text/plain',base64:bytes.toString('base64'),mode:'demo'});
  const attachment=structuredClone(app.store.state.resume),oldIds=profile.projects.map(row=>row.id);
  await open();const pending=responseFor('/api/profile/import/repair-preview');await page.getByRole('button',{name:'检查已有资料是否需要修复',exact:true}).click();assert.equal((await pending).status(),200);await form().waitFor();
  const repair=structuredClone(app.store.profileFileDraft);assert.equal(repair.kind,'project-repair');
  assert.equal(app.store.state.profile.version,1);assert.ok(repair.notes.some(note=>note.label==='项目内容待核对'));
  assert.equal(await form().getByText('请核对项目内容',{exact:true}).isVisible(),true);
  assert.equal(await form().getByText('草稿按当前保存的项目原文尝试分段；请逐项核对。无法确认时保留原内容。',{exact:true}).isVisible(),true);
  assert.equal(await form().getByText('虚构需核对项目：原有项目内容无法可靠拆分，请保留原文并核对缺少的字段。',{exact:true}).isVisible(),true);
  for(let i=1;i<=3;i++)await form().getByLabel(`选择项目 ${i} 的角色`,{exact:true}).check();
  await form().getByRole('button',{name:'将选中项目的角色设为核心成员',exact:true}).click();
  for(const id of oldIds.slice(0,3)){
   const item=repair.changes.find(change=>change.field===`projects.${id}.description`);assert.ok(item);
   await form().locator(`[data-import-change-id="${item.id}"]`).getByLabel('项目描述冲突处理',{exact:true}).selectOption('apply');
  }
  const edited=repair.changes.find(change=>change.field===`projects.${oldIds[0]}.projectDuty`);assert.ok(edited);
  assert.equal(await form().locator(`[data-import-change-id="${edited.id}"]`).getByLabel('项目中职责冲突处理',{exact:true}).inputValue(),'keep');
  const confirmation=responseFor('/api/profile/import/confirm');await form().getByRole('button',{name:'确认并保存资料',exact:true}).click();assert.equal((await confirmation).status(),200);
  let saved=app.store.state.profile;assert.equal(saved.version,2);assert.deepEqual(saved.data.projects.map(row=>row.id),oldIds);
  for(let i=0;i<3;i++){const row=saved.data.projects[i];assert.equal(row.role.zh,'核心成员');assert.equal(row.description.zh,oldProjects[i].项目描述);assert.equal(row.responsibility.zh,oldProjects[i].职责);assert.equal(row.projectDuty.zh,i===0?'本人后来修改的项目职责':oldProjects[i].项目中职责);assert.equal(row.descriptionAndDuty.zh,oldProjects[i].描述And职责);}
  assert.equal(saved.data.projects[3].description.zh,ambiguous);assert.deepEqual(app.store.state.resume,attachment);
  await page.goto('about:blank');await app.close();app=await createApp({dataDir:oldDir,port:0,startFixture:false,testMode:true});localOrigins.add(app.url);await open();
  assert.deepEqual(app.store.state.profile.data.projects.map(row=>row.id),oldIds);assert.equal(app.store.state.profile.data.projects[0].projectDuty.zh,'本人后来修改的项目职责');
  const preview=responseFor('/api/profile/import/preview');await page.getByLabel('选择资料文件（JSON）',{exact:true}).setInputFiles({name:'fictional-old-profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldDocument))});assert.equal((await preview).status(),200);await form().waitFor();
  const repeated=structuredClone(app.store.profileFileDraft);assert.ok(repeated.records.every(record=>record.suggestedTarget===mappings[record.key]));
  const conflict=repeated.changes.find(change=>change.field===`projects.${oldIds[0]}.projectDuty`);assert.ok(conflict);
  assert.equal(await form().locator(`[data-import-change-id="${conflict.id}"]`).getByLabel('项目中职责冲突处理',{exact:true}).inputValue(),'keep');
  const reConfirm=responseFor('/api/profile/import/confirm');await form().getByRole('button',{name:'确认并保存资料',exact:true}).click();assert.equal((await reConfirm).status(),200);
  saved=app.store.state.profile;assert.equal(saved.version,2);assert.deepEqual(saved.data.projects.map(row=>row.id),oldIds);assert.equal(saved.data.projects[0].projectDuty.zh,'本人后来修改的项目职责');assert.equal(saved.data.projects[3].description.zh,ambiguous);assert.deepEqual(app.store.state.resume,attachment);assert.deepEqual(await fs.readFile(attachment.file),bytes);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(app.store.state.tasks.length,0);evidence.ok=true;
}catch(error){evidence.ok=false;evidence.failure=String(error.stack||error).slice(0,3500);console.error(evidence.failure);process.exitCode=1;}
finally{await browser?.close();await app?.close();await fs.mkdir(evidenceRoot,{recursive:true});await fs.writeFile(path.join(evidenceRoot,'profile-usability-ui-browser.json'),JSON.stringify(evidence,null,2));await removeTestDirectory(isolated);}
