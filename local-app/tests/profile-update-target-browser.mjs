// One real dashboard regression for R1 only. All inputs are fictional and local.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createApp} from '../server.mjs';
import {testDirectory,removeTestDirectory,browserOptions,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';

const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const isolated=await testDirectory('profile-target-browser'),dataDir=path.join(isolated,'data');
const results=[],pageErrors=[],externalRequests=[],confirmations=[];
const source=process.env.GITHUB_SHA||spawnSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).stdout.trim();
const evidence={source,scope:'R1 only: actual JSON chooser, explicit new target, authenticated confirmation, server restart and repeated identical file import. Fictional local data; no employer, PDF, Windows or MV3 test.',results};
const document={format:'job-application-assistant.profile-update',format_version:1,base_profile_version:null,profile_changes:[{field:null,target_hint:'虚构R1项目名称',previous_value:null,value:{zh:'虚构R1独立项目',en:null},source_text:'本人提供的虚构R1新增项目名称',qualifier:null,confirmed:false}],job_answers:[],unmapped_notes:[],questions:[]};
const file={name:'fictional-r1-target.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))};
let app,browser,page;
const form=()=>page.getByRole('form',{name:'核对资料文件变更',exact:true});
const wait=async(label,fn)=>{const deadline=Date.now()+15000;while(Date.now()<deadline){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,80));}throw new Error('Timed out: '+label);};
async function open(){await page.goto(app.url+'/#profile');await page.getByLabel('选择资料文件（JSON）',{exact:true}).waitFor();}
async function choose(){
 const old=app.store.profileFileDraft?.id;
 await page.getByLabel('选择资料文件（JSON）',{exact:true}).setInputFiles(file);
 await wait('new real file preview',()=>app.store.profileFileDraft?.status==='ready'&&app.store.profileFileDraft.id!==old);
 await form().waitFor();
}
async function confirm(){
 await form().getByLabel('我已核对本次资料文件变更',{exact:true}).check();
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/profile/import/confirm'&&response.request().method()==='POST');
 await form().getByRole('button',{name:'确认保存所选资料变更',exact:true}).click();
 const response=await pending;assert.equal(response.status(),200);const result=await response.json();assert.equal(result.ok,true);
 confirmations.push({count:result.count,profileChanged:result.profileChanged});
 await wait('saved real confirmation',()=>app.store.profileFileDraft?.status==='saved');
 await page.getByText('资料文件已核对保存',{exact:true}).waitFor();return result;
}
function noApplication(){assert.equal(app.store.state.tasks.length,0);assert.equal(app.store.state.answers.length,0);assert.equal(app.store.state.running,false);assert.equal(app.store.command,null);assert.deepEqual(app.store.queue,[]);assert.equal(app.store.connection,null);}

try{
 app=await createApp({dataDir,port:0,startFixture:false,testMode:true});
 const bytes=Buffer.from('Fictional attachment retained across the R1 target-memory regression.');
 app.store.setResume({name:'fictional-r1-attachment.txt',mime:'text/plain',base64:bytes.toString('base64'),mode:'demo'});
 const attachment=structuredClone(app.store.state.resume);
 browser=await chromium.launch(browserOptions());evidence.environment={platform:process.platform,node:process.version,browser:browser.version(),githubActions:process.env.GITHUB_ACTIONS==='true'};
 const context=await browser.newContext();
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===app.url)return route.continue();externalRequests.push('nonlocal request blocked');return route.abort();});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>pageErrors.push(error.message));
 const started=Date.now();
 await open();await page.getByLabel('资料文件用途',{exact:true}).selectOption('demo');await choose();
 assert.equal(app.store.profileFileDraft.changes[0].target,null);
 assert.equal(await form().getByLabel('变更 1：目标字段',{exact:true}).inputValue(),'');
 await form().getByLabel('新建经历类型',{exact:true}).selectOption('projects');
 await form().getByRole('button',{name:'为未匹配内容新建经历',exact:true}).click();
 const target=await form().getByLabel('变更 1：目标字段',{exact:true}).locator('option').evaluateAll(options=>options.map(option=>option.value).find(value=>/^projects\.import-[\w-]+\.title$/.test(value)));
 assert.ok(target);await form().getByLabel('变更 1：目标字段',{exact:true}).selectOption(target);
 await form().getByLabel('变更 1：处理',{exact:true}).selectOption('apply');
 const first=await confirm();assert.equal(first.count,1);assert.equal(first.profileChanged,true);
 const before=structuredClone(app.store.state.profile),mappings=structuredClone(app.store.state.profileImportMappings);
 assert.equal(before.data.projects.length,1);assert.equal(before.version,1);assert.ok(Object.values(mappings).includes(target));
 noApplication();
 // Restart the real service and Store, not merely the page or an in-memory mock.
 await page.goto('about:blank');await app.close();app=await createApp({dataDir,port:0,startFixture:false,testMode:true});
 assert.deepEqual(app.store.state.profileImportMappings,mappings);
 await open();await choose();
 assert.equal(app.store.profileFileDraft.changes[0].target,target);
 assert.equal(await form().getByLabel('变更 1：目标字段',{exact:true}).inputValue(),target);
 assert.equal(await form().getByLabel('变更 1：处理',{exact:true}).inputValue(),'apply');
 const second=await confirm();assert.equal(second.count,0);assert.equal(second.profileChanged,false);
 assert.deepEqual(app.store.state.profile,before);assert.equal(app.store.state.profile.data.projects.length,1);
 assert.equal(app.store.state.profileImportHistory.length,1);
 const disk=JSON.parse(await fs.readFile(app.store.file,'utf8'));assert.deepEqual(disk.profile,before);assert.deepEqual(disk.profileImportMappings,mappings);
 assert.deepEqual(app.store.state.resume,attachment);assert.deepEqual(await fs.readFile(attachment.file),bytes);
 noApplication();assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);
 results.push({name:'field:null via real chooser -> explicit new project -> confirm -> service restart -> reselect identical file -> exact original target and no extra record/version',passed:true,durationMs:Date.now()-started});
 evidence.ok=true;evidence.noExternalRequests=true;evidence.applicationAuthorizationGenerated=false;evidence.serviceRestarts=1;
 evidence.confirmations=confirmations;evidence.projectCount=1;evidence.profileVersion=before.version;
 console.log('PASS '+results[0].name);
}catch(error){
 evidence.ok=false;evidence.failure=String(error.stack||error.message).slice(0,3500);
 if(!results.length)results.push({name:'R1 actual chooser and restart regression',passed:false});
 console.error(evidence.failure);process.exitCode=1;
}finally{
 await browser?.close();await app?.close();await fs.mkdir(evidenceRoot,{recursive:true});
 await fs.writeFile(path.join(evidenceRoot,'profile-update-target-browser.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({ok:evidence.ok,scenarios:results.length,scope:evidence.scope}));
 await removeTestDirectory(isolated);
}
