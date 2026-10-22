// Actual shipped dashboard + HTTP PDF worker + persistent task model. Execution
// results below are controlled local inputs; no MV3 or employer claim is made.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createApp} from '../server.mjs';
import {hash} from '../model.mjs';
import {fictionalPDF} from './pdf-fixture.mjs';
import {taskEnvironment,client} from './profile-test-runtime.mjs';
import {testDirectory,removeTestDirectory,browserOptions,evidenceRoot} from '../../autofill-extension/tests/runtime.mjs';
const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url)),{chromium}=require('playwright');
const isolated=await testDirectory('profile-import'),results=[],pageErrors=[],externalRequests=[];
const evidence={scope:'Actual dashboard/file chooser/local PDF extraction and HTTP mutations, with controlled fictional task execution inputs. No real employer, personal data, MV3 rerun, Windows run or recording.',source:process.env.GITHUB_SHA||null,results};
let app,browser,page,heartbeat;
const wait=async(name,predicate)=>{const end=Date.now()+10000;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+name);};
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log('PASS '+name);};
try{
 app=await createApp({dataDir:path.join(isolated,'data'),port:0,startFixture:false,testMode:true});
 browser=await chromium.launch(browserOptions());const context=await browser.newContext();
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===app.url)return route.continue();externalRequests.push('unexpected nonlocal request');return route.abort();});
 page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));page.setDefaultTimeout(10000);
 const view=hash=>page.goto(app.url+'/?profile-test-view='+Date.now()+'#'+hash);
 const upload=async(bytes,name='fictional.pdf')=>{await wait('file chooser released after previous import',()=>page.getByLabel('选择本机简历文件').isEnabled());await page.getByLabel('选择本机简历文件').setInputFiles({name,mimeType:'application/pdf',buffer:bytes});await wait('local extraction response',()=>app.store.state.resume?.sha256===hash(bytes)&&!!app.store.state.resumeImport);await page.getByRole('form',{name:'上传简历文件'}).getByRole('button',{name:'保存文件 / 重新提取PDF'}).waitFor({state:'visible'});await wait('PDF import UI',async()=>await page.getByRole('form',{name:'核对PDF提取草稿'}).count()>0||await page.getByText('PDF未生成可接受的资料草稿',{exact:true}).count()>0);};
 const review=async()=>{const form=page.getByRole('form',{name:'核对PDF提取草稿'});await form.locator('input[type=checkbox]').last().check();await form.getByRole('button',{name:'一次确认并保存提取资料'}).click();await wait('saved review',()=>app.store.state.resumeImport.status==='saved');};
 const original=fictionalPDF(['Name: Fictional Applicant','Email: fictional@example.invalid','Phone: +1 2025550100','Current city: Fictional City','GitHub: https://github.com/fictional-test']);
 await check('PDF selection automatically extracts; one review saves confirmed profile and keeps original SHA/bytes',async()=>{
  await view('profile');await upload(original);const preview=page.getByRole('form',{name:'核对PDF提取草稿'});assert.equal(await preview.getByLabel('姓名 / Full name：提取内容').inputValue(),'Fictional Applicant');assert.equal(app.store.state.profile.version,0);
  await review();assert.equal(app.store.state.profile.data.personal.name.zh,'Fictional Applicant');assert.equal(app.store.state.profile.data.personal.firstName,undefined);assert.deepEqual(await fs.readFile(app.store.state.resume.file),original);assert.equal(app.store.state.resume.sha256,hash(original));
 });
 await check('confirmed conflicts default to keeping old data, then require explicit accept to replace',async()=>{
  const changed=fictionalPDF(['Name: Other Fictional Applicant','Email: fictional@example.invalid','Phone: +1 2025550100']);await upload(changed);const form=page.getByRole('form',{name:'核对PDF提取草稿'});assert.equal(await form.getByLabel('姓名 / Full name：提取处理').inputValue(),'keep');await review();assert.equal(app.store.state.profile.data.personal.name.zh,'Fictional Applicant');assert.deepEqual(await fs.readFile(app.store.state.resume.file),changed);
  // Re-extract the same attachment without changing its version, choose the
  // conflicting candidate and confirm explicitly in the real form.
  const key=await page.locator('meta[name="local-key"]').getAttribute('content');await page.request.post(app.url+'/api/resume/extract',{headers:{'X-Local-Key':key,Origin:app.url},data:{}});await view('profile');const retry=page.getByRole('form',{name:'核对PDF提取草稿'});await retry.getByLabel('姓名 / Full name：提取处理').selectOption('import');await review();assert.equal(app.store.state.profile.data.personal.name.zh,'Other Fictional Applicant');
 });
 await check('scanned and corrupt PDFs show explicit failures without losing profile or original bytes',async()=>{
  const before=structuredClone(app.store.state.profile);
  for(const [bytes,status]of [[fictionalPDF([],{blank:true}),'no-text'],[Buffer.from('%PDF-1.4\ncorrupt fixture'),'invalid']]){await view('profile');await upload(bytes);assert.equal(app.store.state.resumeImport.status,status);assert.deepEqual(app.store.state.profile,before);assert.deepEqual(await fs.readFile(app.store.state.resume.file),bytes);}
  await view('profile');await upload(original);await review();
 });
 const env=taskEnvironment(app.store);heartbeat=setInterval(()=>app.store.heartbeat(client),1000);
 const confirm=async task=>{await view('issues');const form=page.getByRole('form',{name:'确认投递：'+task.title});await form.waitFor();for(const control of await form.locator('input[type=checkbox]').all())await control.check();await form.getByRole('button',{name:'确认本次申请并继续'}).click();await wait('task confirmed',()=>task.status==='queued');};
 const a=env.add('801'),qA=[env.q(a,'first_name','First Name*','confirmed-profile-fact'),env.q(a,'last_name','Last Name*','confirmed-profile-fact'),env.q(a,'motivation','Why this fictional role?','company-motivation'),env.q(a,'question_yes','Available for this fictional schedule?','site-specific-question',{type:'select-one',options:[{text:'Observed Yes',disabled:false},{text:'Unavailable original option',disabled:true}]})];
 await check('task A matches PDF profile and displays all four actual missing questions in one batch',async()=>{
  await confirm(a);app.store.run(false);env.prepare(a,qA);await view('issues');const form=page.getByRole('form',{name:'集中补充答案：'+a.title});await form.waitFor();assert.equal(await form.locator('fieldset').count(),4);
  assert.equal(app.store.applicableAnswer(a,env.q(a,'email','Email*','confirmed-profile-fact')),'fictional@example.invalid');
  await form.getByLabel('First Name*：答案',{exact:true}).fill('Fictional');await form.getByLabel('Last Name*：答案',{exact:true}).fill('Applicant');await form.getByLabel('Why this fictional role?：答案',{exact:true}).fill('Fictional motivation for A');await form.getByLabel('Why this fictional role?：保存用途',{exact:true}).selectOption('scope');await form.getByLabel('Available for this fictional schedule?：答案',{exact:true}).selectOption('Observed Yes');
  await form.getByRole('button',{name:'一次保存以上答案并继续原任务'}).click();await wait('batch saved with version confirmation',()=>a.status==='waiting_user'&&app.store.state.profile.data.personal.firstName?.zh==='Fictional');assert.equal(app.store.state.answers.length,1);assert.equal(a.id,app.store.state.tasks[0].id);
 });
 await check('task A resumes after one new-version confirmation without retyping saved answers',async()=>{
  await confirm(a);env.prepare(a,qA);for(const expected of ['Fictional','Applicant','Fictional motivation for A','Observed Yes']){const command=env.take();assert.equal(command.op,'answer');assert.equal(command.task.id,a.id);assert.equal(command.payload.answer,expected);env.send(command,{ok:true,layout:'fictional-profile-layout'});}assert.equal(a.phase,'preflight');assert.equal(app.store.hasSubmissionBoundary(a),false);app.store.action({action:'task-pause',taskId:a.id});
 });
 const b=env.add('802'),qB=[env.q(b,'first_name','First Name*','confirmed-profile-fact'),env.q(b,'last_name','Last Name*','confirmed-profile-fact'),env.q(b,'motivation','Why this fictional role?','company-motivation'),env.q(b,'new_project','Which new fictional project?')];
 await check('task B reuses stable facts, still asks its own motivation and new question, and supports revoking saved memory',async()=>{
  await confirm(b);env.prepare(b,qB);for(const expected of ['Fictional','Applicant']){const c=env.take();assert.equal(c.op,'answer');assert.equal(c.payload.answer,expected);env.send(c,{ok:true,layout:'fictional-profile-layout'});}
  await view('issues');const form=page.getByRole('form',{name:'集中补充答案：'+b.title});await form.waitFor();assert.equal(await form.locator('fieldset').count(),2);assert.equal(await form.getByLabel('First Name*：答案',{exact:true}).count(),0);assert.equal(await form.getByLabel('Why this fictional role?：答案',{exact:true}).inputValue(),'');assert.equal(await form.getByLabel('Which new fictional project?：答案',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'撤销此答案记忆',exact:true}).click();await wait('memory revoked',()=>app.store.state.answers.length===0);assert.equal(app.store.state.profile.data.personal.firstName.zh,'Fictional');assert.equal(app.store.hasSubmissionBoundary(b),false);
 });
 assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);assert.equal(app.store.state.tasks.length,2);assert.ok(app.store.state.tasks.every(t=>!app.store.hasSubmissionBoundary(t)));evidence.ok=true;evidence.noExternalRequests=true;evidence.submissionBoundaryEntered=false;
}catch(error){evidence.ok=false;evidence.failure=String(error.stack||error.message).slice(0,3500);console.error('::error title=PDF and batch dashboard::'+evidence.failure.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));process.exitCode=1;}
finally{clearInterval(heartbeat);await browser?.close();await app?.close();await fs.mkdir(evidenceRoot,{recursive:true});await fs.writeFile(path.join(evidenceRoot,'profile-import-browser.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:evidence.ok,scenarios:results.length,scope:evidence.scope}));await removeTestDirectory(isolated);}
