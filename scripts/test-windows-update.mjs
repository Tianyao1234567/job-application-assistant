// Narrow hosted Windows acceptance: actual old installs, move, one CMD update,
// actual extension/storage/heartbeat, restart and the relevant failure paths.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import syncFS from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {buildUpdate,baselineManifest,UPDATE_BASELINES} from './package-update.mjs';
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw new Error('HOSTED_WINDOWS_REQUIRED');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),parent=path.join(root,'.runtime/windows-update'),cache=path.join(parent,'cache'),BASE='http://127.0.0.1:17321';
const subject=gitSubject();
const candidateFlow=subject.includes('[native-full-flow]');
const checkPurpose=subject.includes('[confirmation-purpose]');
const dynamic=subject.includes('[dynamic-controls]');
function gitSubject(){const result=spawnSync('git',['log','-1','--format=%s'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0);return result.stdout;}
const evidence={source:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,scope:'Single CMD, candidate8/10, fictional stopped old installation moved to a short path; actual Windows Chromium and extension. No employer requests or personal data.',scenarios:[],status:'RUNNING'};
let phase='build',activeRoot,managed;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(args)=>{const result=spawnSync('git',args,{cwd:root,maxBuffer:8*1024*1024});assert.equal(result.status,0);return result.stdout;};
const write=async(file,bytes)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);};
function run(command,args,options={}){const result=spawnSync(command,args,{encoding:'utf8',timeout:120000,...options});if(result.error||result.status!==0)throw new Error('COMMAND_FAILED '+phase+' '+String(result.output?.join(' ')||'').slice(-2200));return result.stdout;}
async function until(name,read,predicate,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(predicate(value))return value;await new Promise(r=>setTimeout(r,150));}throw new Error('WAIT '+name);}
const cmd=(directory,name='更新.cmd',mode='')=>spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','""'+path.join(directory,name)+'"'+(mode?' '+mode:'')+'"'],{windowsVerbatimArguments:true,cwd:directory,env:{...process.env,JOB_ASSISTANT_NONINTERACTIVE:'1'},encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
let sequence=0;
function service(directory,entry){const stem=path.join(parent,'helper-'+(++sequence)),out=syncFS.openSync(stem+'.stdout','w'),err=syncFS.openSync(stem+'.stderr','w');let reply;try{reply=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/test-windows-browser.ps1'),'-CandidateRoot',directory,'-CommandOnly','-Entry',entry],{stdio:['ignore',out,err],timeout:100000,env:{...process.env,JOB_ASSISTANT_NONINTERACTIVE:'1',JOB_ASSISTANT_BROWSER_TEST:'1'}});}finally{syncFS.closeSync(out);syncFS.closeSync(err);}const output=syncFS.readFileSync(stem+'.stdout','utf8');assert.equal(reply.status,0,'SERVICE_HELPER '+entry+' '+output.slice(-1000));const result=JSON.parse(output.trim());assert.equal(result.exitCode,0,'SERVICE_'+entry+' '+JSON.stringify(result.markers));return result;}
async function api(directory,route='/state',body,expectedStatus=200){const key=(await fs.readFile(path.join(directory,'.runtime/data/local-key'),'utf8')).trim();const response=await fetch(BASE+'/api'+route,{method:body?'POST':'GET',headers:{'X-Local-Key':key,...(body?{Origin:BASE,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(response.status,expectedStatus);return response.json();}
async function connect(directory){const require=createRequire(path.join(directory,'runtime-deps/package.json')),{chromium}=require('playwright');managed=await chromium.connectOverCDP('http://127.0.0.1:17323');const context=managed.contexts()[0];const runner=await until('runner',()=>Promise.resolve(context.pages().find(p=>/^chrome-extension:\/\/[a-p]{32}\/runner\/index.html$/.test(p.url()))),Boolean);return {context,runner};}
async function installOld(source,index){
 const manifest=await baselineManifest(root,source),directory=path.join(parent,'version '+index+' ! 中文','outer','inner','job-application-assistant');
 for(const file of manifest.files)await write(path.join(directory,file.path),git(['show',source+':'+file.path]));
 await write(path.join(directory,'SOURCE.json'),JSON.stringify({source:{commit:source},version:manifest.version,files:manifest.files}));
 await fs.cp(path.join(cache,'runtime-deps/node_modules'),path.join(directory,'runtime-deps/node_modules'),{recursive:true});await fs.cp(path.join(cache,'.runtime/browsers'),path.join(directory,'.runtime/browsers'),{recursive:true});
 const {Store}=await import(pathToFileURL(path.join(directory,'local-app/model.mjs')).href);const store=new Store({data:path.join(directory,'.runtime/data')});store.demo();store.pause();store.save();return directory;
}
try{
 if(checkPurpose||dynamic)run(process.execPath,['--test','local-app/tests/profile-update-package.test.mjs']);
 await fs.mkdir(parent,{recursive:true});const {report}=await buildUpdate({projectRoot:root}),updateFile=path.join(report.directory,'更新.cmd');evidence.update={...report,directory:undefined};
 assert.equal(report.source,process.env.GITHUB_SHA);
 const bytes=await fs.readFile(updateFile);assert.equal(bytes.length,report.bytes);assert.equal(hash(bytes),report.sha256);
 phase='prepare-existing-browser';
 for(const name of ['package.json','package-lock.json'])await write(path.join(cache,'runtime-deps',name),git(['show',UPDATE_BASELINES[0]+':runtime-deps/'+name]));
 const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');const env={...process.env,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',PLAYWRIGHT_BROWSERS_PATH:path.join(cache,'.runtime/browsers'),npm_config_cache:path.join(parent,'npm-cache'),TEMP:path.join(parent,'tmp'),TMP:path.join(parent,'tmp'),TMPDIR:path.join(parent,'tmp')};await fs.mkdir(env.TEMP,{recursive:true});
 run(process.execPath,[npm,'ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(cache,'runtime-deps'),env});
 run(process.execPath,[path.join(cache,'runtime-deps/node_modules/playwright/cli.js'),'install','--no-shell','chromium'],{cwd:cache,env:{...env,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'',PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT:'45000'},timeout:180000});
 for(const [index,source]of UPDATE_BASELINES.slice(2).entries()){
  const baselineVersion=(await baselineManifest(root,source)).version;
  phase='old-'+baselineVersion+'-start';let directory=await installOld(source,index);activeRoot=directory;service(directory,'start');const {context,runner}=await connect(directory);
  const oldId=new URL(runner.url()).hostname,originalBridge=await runner.evaluate(async()=>(await chrome.storage.local.get('localBridge')).localBridge);assert.ok(originalBridge.profileId);
  await context.addCookies([{name:'fictional_migration_cookie',value:'preserve-fixture-session',url:BASE,httpOnly:true,sameSite:'Lax',expires:Math.floor(Date.now()/1000)+86400}]);
  // Stop the runner tab before seeding an unacknowledged historical outbox.
  const options=await context.newPage();await options.goto('chrome-extension://'+oldId+'/options/index.html');await runner.close();
  const records={localSubmissionAttempts:{'fictional|unchanged-job':{taskId:'fictional-task',commandId:'old-command',profileId:originalBridge.profileId,at:1}},localResultOutbox:{clientId:'old-client',commandId:'old-command',result:{ok:false,kind:'unknown'}},greenhouseReceiptSessions:{'fictional-task':{taskId:'fictional-task',profileId:originalBridge.profileId,tabId:1,documentId:'old-document',requestId:'old-request',source:'https://job-boards.greenhouse.io/mattermost/jobs/5381946008',confirmationUrl:'https://job-boards.greenhouse.io/mattermost/jobs/5381946008/confirmation',armedAt:1}},greenhouseUploadProofs:{'fictional-task':{taskId:'fictional-task',documentId:'old-document',tabId:1}},localTaskTabs:{'fictional-task':1},fictionalUpdateUserData:{value:'preserve this private fixture'}};
  await options.evaluate(value=>chrome.storage.local.set(value),records);assert.deepEqual(await options.evaluate(()=>chrome.storage.local.get('localSubmissionAttempts')), {localSubmissionAttempts:records.localSubmissionAttempts});
  phase='old-normal-stop';service(directory,'stop');managed=undefined;
  const stateFile=path.join(directory,'.runtime/data/state.json'),state=JSON.parse(await fs.readFile(stateFile,'utf8'));
  state.profile.data.projects.push({id:'fictional-stable-project',title:{zh:'虚构本人修改项目',en:null,source:'本人确认',confirmed:true}});
  const value=zh=>({zh,en:null,source:'虚构本人确认',confirmed:true});
  state.profile.data.education=[{id:'fictional-master',school:value('虚构大学'),major:value('虚构专业')}];
  state.profile.data.skills={description:value('编程：熟练 Python、C++；工具：Git；熟悉虚构模块。')};
  if(source===UPDATE_BASELINES[3]){
   const recordKey='legacy:education:0123456789abcdef01234567',oldId='legacy-education-0123456789abcdef01234567';
   state.profileImportMappings={'legacy:projects:0123456789abcdef01234567':'fictional-stable-project',[recordKey]:'fictional-master'};
   state.profileImportHistory=[{id:'fictional-old-import',kind:'legacy-v3',fingerprint:'fictional',notes:[],pendingChanges:[
    {id:'degree',recordKey,field:`education.${oldId}.degree`,target:null,qualifier:'in_progress',value:{zh:'硕士',en:null},source_text:'学历：硕士；最高学历：硕士研究生（在读）'},
    {id:'date',recordKey,field:`education.${oldId}.endDate`,target:null,qualifier:'in_progress',value:{zh:'2028-06',en:null},source_text:'结束就读时间：2028-06；最高学历：硕士研究生（在读）'}
   ]}];
  }
  const task={id:'fictional-task',jobId:'cpp-002',siteId:state.sites[0].id,title:'Fictional relocation task',url:'http://127.0.0.1:17322/site/alpha/jobs/cpp-002',company:'Fictional company',location:'Fictional city',mode:'demo',status:'unknown',phase:'verify',steps:[],executionProfileId:originalBridge.profileId,submissionStarted:true,resumeSnapshot:structuredClone(state.resume),profileSnapshot:structuredClone(state.profile),profileVersion:state.profile.version,resumeVersion:state.resume.version};
  const pending={id:'fictional-pending',jobId:'cpp-001',siteId:state.sites[0].id,title:'Fictional pending task',url:'http://127.0.0.1:17322/site/alpha/jobs/cpp-001',company:'Fictional company',location:'Fictional city',mode:'demo',status:'waiting_answer',phase:'answer',steps:[],executionProfileId:originalBridge.profileId,profileSnapshot:structuredClone(state.profile),resumeSnapshot:structuredClone(state.resume),profileVersion:state.profile.version,resumeVersion:state.resume.version,question:{key:'motivation',text:'为什么希望申请这个岗位？',scope:`local-v1:${state.sites[0].tenant}:cpp-001:motivation:v1`}};
  state.tasks=[task,pending];state.answers=[{scope:'fictional-memory',value:'Preserve the answer'}];
  let legacyReal,legacyUnknown;
  if(checkPurpose||dynamic){
   const origin='https://job-boards.greenhouse.io',url=origin+'/mattermost/jobs/900000002';
   const site={id:'fictional-old-real-site',adapter:'greenhouse-v1',mode:'real',origin,tenant:'mattermost',
     company:'Mattermost',name:'Fictional upgrade record',expectedAccount:'fictional-old@example.test',enabled:true,skipped:false,
     listUrl:origin+'/mattermost',loginUrl:origin+'/mattermost'};
   state.sites.push(site);
   legacyReal={...structuredClone(task),id:'fictional-old-real-consent',jobId:'900000002',siteId:site.id,url,
     company:site.company,mode:'real',status:'queued',phase:'inspect',submissionStarted:false,
     answers:{fictional:{value:'Preserve original fictional answer',confirmed:true}},
     confirmation:{jobId:'900000002',url,company:site.company,expectedAccount:site.expectedAccount,
       profileId:originalBridge.profileId,profileVersion:state.profile.version,resumeVersion:state.resume.version,
       resumeSha256:state.resume.sha256,confirmedAt:new Date().toISOString(),...(baselineVersion.endsWith('.12')?{purpose:'inspect'}:{submitConfirmed:true})}};
   legacyReal.profileSnapshot.mode='real';legacyReal.resumeSnapshot.mode='real';
   legacyUnknown={...structuredClone(legacyReal),id:'fictional-old-real-unknown',status:'unknown',phase:'verify',submissionStarted:true};
   state.tasks.push(legacyReal,legacyUnknown);
  }
  await fs.writeFile(stateFile,JSON.stringify(state,null,2));
  const before=structuredClone(state),originalPDF=await fs.readFile(state.resume.file),browserDirectory=(await fs.readdir(path.join(directory,'.runtime/browsers'))).find(name=>/^chromium-[0-9]+$/.test(name)),browserRelative=path.join('.runtime/browsers',browserDirectory,'chrome-win64/chrome.exe'),browserHash=hash(await fs.readFile(path.join(directory,browserRelative)));
  phase='move-and-update';const shorter=path.join(parent,'short-'+index);await fs.rename(directory,shorter);directory=shorter;activeRoot=directory;await fs.copyFile(updateFile,path.join(directory,'更新.cmd'));
  if(!candidateFlow){
 const invalidBytes=await fs.readFile(path.join(directory,'更新.cmd'));const bad=Buffer.from(invalidBytes);const position=bad.lastIndexOf(Buffer.from('# JA_BODY '))+12;bad[position]=bad[position]===65?66:65;await fs.writeFile(path.join(directory,'broken.cmd'),bad);assert.notEqual(cmd(directory,'broken.cmd').status,0);assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory,'.runtime/data/state.json'),'utf8')),before);
  // A stale PID pointing at a real unrelated Node process must never authorize killing it.
  const pidFile=path.join(directory,'.runtime/server.pid'),savedPid=await fs.readFile(pidFile).catch(()=>null),foreign=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
  try{await fs.writeFile(pidFile,String(foreign.pid));const refused=cmd(directory);assert.notEqual(refused.status,0);assert.ok((refused.stdout+refused.stderr).includes('UPDATE_OLD_PROCESS_ACTIVE'));process.kill(foreign.pid,0);assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory,'.runtime/data/state.json'),'utf8')),before);}finally{foreign.kill();if(savedPid)await fs.writeFile(pidFile,savedPid);else await fs.rm(pidFile,{force:true});}
  }
  const updated=cmd(directory);if(updated.status!==0)throw new Error('UPDATE_CMD_FAILED '+String(updated.stdout+updated.stderr).slice(-2400));assert.ok(updated.stdout.includes('UPDATE_COMPLETE'));
  if(candidateFlow){
   const sourceManifest=JSON.parse(await fs.readFile(path.join(directory,'SOURCE.json'),'utf8'));
   assert.equal(sourceManifest.source.commit,process.env.GITHUB_SHA);
   for(const name of ['greenhouse-native-gate.js','greenhouse-native-request.js',...(dynamic?['greenhouse-public-controls.js']:[])]){
    const relative='autofill-extension/runner/'+name,entry=sourceManifest.files.find(file=>file.path===relative);
    assert.ok(entry,'Installed manifest must include '+relative);
    assert.equal(hash(await fs.readFile(path.join(directory,relative))),entry.sha256);
   }
  }
  const movedState=JSON.parse(await fs.readFile(path.join(directory,'.runtime/data/state.json'),'utf8'));assert.deepEqual(movedState.profile,before.profile);assert.deepEqual(movedState.answers,before.answers);assert.deepEqual(movedState.profileImportMappings,before.profileImportMappings);const expectedPending=structuredClone(before.tasks[1]);expectedPending.resumeSnapshot.file=path.join(directory,'.runtime/data/resumes',path.basename(before.tasks[1].resumeSnapshot.file));assert.deepEqual(movedState.tasks[1],expectedPending);assert.deepEqual(await fs.readFile(movedState.tasks[1].resumeSnapshot.file),originalPDF);assert.equal(movedState.tasks[0].status,'unknown');assert.equal(movedState.tasks[0].submissionStarted,true);assert.equal(movedState.manualPaused,true);assert.deepEqual(await fs.readFile(movedState.resume.file),originalPDF);assert.equal(hash(await fs.readFile(movedState.tasks[0].resumeSnapshot.file)),before.resume.sha256);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory,'runtime-deps/node_modules/pdfjs-dist/package.json'),'utf8')).version,'5.4.296');
  const installation=JSON.parse(await fs.readFile(path.join(directory,'.runtime/installation.json'),'utf8'));assert.equal(installation.migration.pending,true);assert.equal(installation.migration.profileId,originalBridge.profileId);assert.equal(installation.migration.extensionId,oldId,'candidate.8 and candidate.10 already use the pinned extension identity');
  if(index===0&&!candidateFlow){
   phase='restore-new-extension-data';const {chromium}=createRequire(path.join(directory,'runtime-deps/package.json'))('playwright');
   const edit=async(remove=false)=>{const profile=await chromium.launchPersistentContext(path.join(directory,'.runtime/browser/production'),{headless:true,executablePath:path.join(directory,browserRelative),downloadsPath:path.join(directory,'.runtime/downloads'),artifactsDir:path.join(directory,'.runtime/tmp'),env:{...process.env,TEMP:path.join(directory,'.runtime/tmp'),TMP:path.join(directory,'.runtime/tmp')},args:['--disable-extensions-except='+path.join(directory,'autofill-extension'),'--load-extension='+path.join(directory,'autofill-extension'),'--no-first-run']});try{const worker=profile.serviceWorkers().find(w=>w.url()==='chrome-extension://'+installation.migration.extensionId+'/background.js')||await profile.waitForEvent('serviceworker',{predicate:w=>w.url()==='chrome-extension://'+installation.migration.extensionId+'/background.js',timeout:15000});if(remove){assert.equal((await worker.evaluate(()=>chrome.storage.local.get('fictionalRestoreNewData'))).fictionalRestoreNewData,'New fictional extension profile');await worker.evaluate(()=>chrome.storage.local.remove('fictionalRestoreNewData'));}else await worker.evaluate(()=>chrome.storage.local.set({fictionalRestoreNewData:'New fictional extension profile'}));}finally{await profile.close();}};
   await edit();const refused=cmd(directory,'更新.cmd','--restore');assert.notEqual(refused.status,0);assert.ok((refused.stdout+refused.stderr).includes('UPDATE_RESTORE_HAS_NEW_DATA'),String(refused.stdout+refused.stderr).slice(-3000));assert.equal(JSON.parse(await fs.readFile(path.join(directory,'SOURCE.json'),'utf8')).source.commit,process.env.GITHUB_SHA);await edit(true);
  }
  phase='new-real-start';service(directory,'start');const fresh=await connect(directory);const newId=new URL(fresh.runner.url()).hostname,actual=await fresh.runner.evaluate(()=>chrome.storage.local.get(null));assert.equal(newId,installation.migration.extensionId);assert.equal(actual.localBridge.profileId,originalBridge.profileId);assert.deepEqual(actual.localSubmissionAttempts,records.localSubmissionAttempts);assert.deepEqual(actual.fictionalUpdateUserData,records.fictionalUpdateUserData);const archive=Object.values(actual.localMigrationArchives).at(-1);assert.deepEqual(archive.localResultOutbox,records.localResultOutbox);assert.deepEqual(archive.greenhouseReceiptSessions,records.greenhouseReceiptSessions);assert.deepEqual(actual.greenhouseReceiptSessions,{});assert.deepEqual(actual.greenhouseUploadProofs,{});assert.equal(actual.localResultOutbox,undefined);assert.equal(actual.localMigrationHold,undefined);
  const current=await api(directory);assert.equal(current.connection.profileId,originalBridge.profileId);assert.equal(current.connection.extensionId,newId);assert.equal(current.manualPaused,true);assert.equal(current.tasks[0].canResume,false);assert.equal(current.tasks[0].status,'unknown');assert.equal(JSON.parse(await fs.readFile(path.join(directory,'.runtime/installation.json'),'utf8')).migration.pending,false);
  assert.ok((await fresh.context.cookies(BASE)).some(c=>c.name==='fictional_migration_cookie'&&c.value==='preserve-fixture-session'));
  assert.match((await api(directory,'/action',{action:'task-resume',taskId:'fictional-task'},400)).error,/已记录过提交阶段/);assert.equal((await api(directory)).tasks[0].status,'unknown');
  if(candidateFlow){
   phase='candidate-imports-after-update';
   assert.equal(await fresh.runner.evaluate(async()=>{
    const gate=await import(chrome.runtime.getURL('runner/greenhouse-native-gate.js'));
    const request=await import(chrome.runtime.getURL('runner/greenhouse-native-request.js'));
    return typeof gate.installNativeGate==='function'&&typeof request.createNativeCapture==='function';
   }),true);
   if(checkPurpose||dynamic){
    phase='legacy-real-consent-after-update';
    const saved=JSON.parse(await fs.readFile(path.join(directory,'.runtime/data/state.json'),'utf8'));
    for(const old of [legacyReal,legacyUnknown]){
     const migrated=saved.tasks.find(t=>t.id===old.id),exposed=current.tasks.find(t=>t.id===old.id);
     const {submitConfirmed,...scope}=old.confirmation;
     assert.deepEqual(migrated.confirmation,{...scope,purpose:old.confirmation.purpose==='inspect'?'inspect':'unverified'});
     assert.deepEqual(migrated.answers,old.answers);
     assert.equal(migrated.executionProfileId,originalBridge.profileId);
     assert.equal(migrated.resumeSnapshot.sha256,old.resumeSnapshot.sha256);
     assert.deepEqual(await fs.readFile(migrated.resumeSnapshot.file),originalPDF);
     assert.equal(exposed.submissionStarted,old.submissionStarted);
     assert.equal(exposed.canVerify,old.status==='unknown');
     assert.equal(exposed.needsConfirmation,old.status!=='unknown');
     assert.equal(migrated.confirmation.submitConfirmed,undefined);
    }
    assert.match((await api(directory,'/action',{action:'task-resume',taskId:legacyUnknown.id},400)).error,/只能核对|不可重新/);
   }
   service(directory,'stop');managed=undefined;activeRoot=undefined;
   assert.equal(hash(await fs.readFile(path.join(directory,browserRelative))),browserHash);
   evidence.scenarios.push({baseline:baselineVersion,baselineSource:source,passed:true,installedNativeImports:true,
    profileEditsIdsMappingsAnswersAndTasksPreserved:true,attachmentBytesAndHashMatch:true,unknownCannotResume:true,
    originalProfileIdAndLedgersPreserved:true,extensionIdPreserved:true,freshActualHeartbeat:true,existingBrowserBinaryUnchanged:true,
    ...(checkPurpose||dynamic?{legacyRealConsentUnverified:!baselineVersion.endsWith('.12'),realInspectionConsentPreserved:baselineVersion.endsWith('.12'),legacyRealUnknownPreserved:true}:{})});
   continue;
  }
  phase='repair-existing-and-answer';
  const version=(await api(directory)).profile.version,{draft}=await api(directory,'/profile/import/repair-preview',{mode:'demo',profileVersion:version});
  const decisions=draft.changes.map(change=>({id:change.id,action:change.blocked||change.conflict||change.requiresUserValue&&change.field!=='education.fictional-master.degree'?'keep':'apply',...(change.requiresUserValue&&change.field==='education.fictional-master.degree'?{editedValue:'硕士'}:{})}));
  await api(directory,'/profile/import/confirm',{id:draft.id,profileVersion:version,mode:'demo',confirmed:true,decisions,recordMappings:{},createRecords:[],answerSelections:[]});
  const repaired=await api(directory);assert.equal(repaired.profile.data.education[0].id,'fictional-master');assert.equal(repaired.profile.data.education[0].degree.zh,'硕士');
  if(source===UPDATE_BASELINES[3]){assert.equal(repaired.profile.data.education[0].studyStatus.zh,'在读');assert.equal(repaired.profile.data.education[0].expectedEndDate.zh,'2028-06');}
  assert.equal(repaired.profile.data.skills.programming.zh,'编程：熟练 Python、C++；');assert.equal(repaired.profile.data.skills.description.zh,'编程：熟练 Python、C++；工具：Git；熟悉虚构模块。');
  await api(directory,'/action',{action:'answer',taskId:'fictional-pending',answer:'Fictional confirmed answer',save:false});
  const queued=(await api(directory)).tasks.find(t=>t.id==='fictional-pending');assert.equal(queued.status,'queued');assert.equal(queued.phase,'inspect');
  phase='new-stop-restart';service(directory,'stop');managed=undefined;service(directory,'start');const again=await connect(directory);assert.equal((await again.runner.evaluate(async()=>(await chrome.storage.local.get('localBridge')).localBridge.profileId)),originalBridge.profileId);assert.equal((await api(directory)).manualPaused,true);
  const restored=JSON.parse(await fs.readFile(path.join(directory,'.runtime/data/state.json'),'utf8'));assert.equal(restored.tasks.find(t=>t.id==='fictional-pending').answer.value,'Fictional confirmed answer');assert.equal(restored.tasks.find(t=>t.id==='fictional-task').status,'unknown');assert.equal(restored.profile.data.education[0].degree.zh,'硕士');
  phase='continue-original-fictional-task';
  // Use the upgraded installation's actual persistent Chromium profile and
  // actual extension runner. The local site only accepts fictional accounts.
  const posts=[];const track=request=>{const u=new URL(request.url());if(request.method()==='POST'&&u.origin==='http://127.0.0.1:17322'&&/^\/site\/alpha\/apply\//.test(u.pathname))posts.push(u.pathname);};
  again.context.on('request',track);
  const login=await again.context.newPage();await login.goto('http://127.0.0.1:17322/site/alpha/login');await login.locator('select[name="account"]').selectOption('demo');
  await Promise.all([login.waitForNavigation({waitUntil:'domcontentloaded'}),login.locator('button[type="submit"]').click()]);
  await login.locator('[data-session-status="ready"][data-account="demo"]').waitFor();await login.close();
  await api(directory,'/action',{action:'site-check',siteId:state.sites[0].id});
  await until('upgraded actual extension checks fictional login',()=>api(directory),s=>s.sites.find(site=>site.id===state.sites[0].id)?.login?.status==='ready');
  await api(directory,'/action',{action:'resume'});
  const completed=await until('same upgraded task receives fictional receipt',()=>api(directory),s=>{const t=s.tasks.find(item=>item.id==='fictional-pending');if(['failed','waiting_user','waiting_answer','unknown'].includes(t?.status))throw new Error('ORIGINAL_TASK_DID_NOT_CONTINUE '+JSON.stringify({status:t.status,phase:t.phase,issue:t.issue?.title,steps:t.steps?.slice(-3).map(step=>step.label)}));return t?.status==='submitted';},90000);
  assert.equal(completed.tasks.find(t=>t.id==='fictional-pending').jobId,'cpp-001');assert.equal(completed.tasks.find(t=>t.id==='fictional-task').status,'unknown');
  const fixtureFile=path.join(directory,'.runtime/data/fixture/fixture-state.json');
  const fixture=JSON.parse(await fs.readFile(fixtureFile,'utf8'));
  const attempts=fixture.submitRequests.filter(item=>item.tenant==='alpha'&&item.jobId==='cpp-001');
  const receipts=Object.values(fixture.receipts).filter(item=>item.tenant==='alpha'&&item.jobId==='cpp-001');
  assert.equal(fixture.submitRequests.length,1,'no other fictional task may send an application');assert.equal(attempts.length,1,'fixture must receive exactly one actual request');assert.equal(attempts[0].accepted,true);assert.equal(receipts.length,1);
  assert.deepEqual(posts,['/site/alpha/apply/cpp-001'],'browser must make exactly one application POST');
  assert.equal(receipts[0].fields.motivation,'Fictional confirmed answer');assert.equal(receipts[0].sha256,hash(originalPDF));assert.equal(receipts[0].fileSize,originalPDF.length);
  assert.deepEqual(await fs.readFile(path.join(directory,'.runtime/data/fixture/uploads',receipts[0].id+'.bin')),originalPDF);
  assert.match((await api(directory,'/action',{action:'task-resume',taskId:'fictional-task'},400)).error,/已记录过提交阶段/);
  await new Promise(resolve=>setTimeout(resolve,1200));const finalFixture=JSON.parse(await fs.readFile(fixtureFile,'utf8'));assert.equal(finalFixture.submitRequests.length,1);assert.equal(finalFixture.submitRequests.filter(item=>item.tenant==='alpha'&&item.jobId==='cpp-001').length,1);
  assert.deepEqual((await again.runner.evaluate(()=>chrome.storage.local.get('localSubmissionAttempts'))).localSubmissionAttempts['fictional|unchanged-job'],records.localSubmissionAttempts['fictional|unchanged-job']);
  again.context.off('request',track);service(directory,'stop');managed=undefined;
  const repeated=cmd(directory);assert.equal(repeated.status,0);assert.ok(repeated.stdout.includes('UPDATE_CURRENT'));
  assert.equal(hash(await fs.readFile(path.join(directory,browserRelative))),browserHash);
  evidence.scenarios.push({baseline:baselineVersion,baselineSource:source,passed:true,extensionIdPreserved:true,oldEducationSkillsRepaired:true,pendingAnswerSavedAndRequeued:true,originalTaskCompletedWithRealMV3:true,fixtureReceivedExactlyOne:true,fictionalAnswerAndAttachmentMatched:true,originalProfileIdAndLedgersPreserved:true,pdfDependencyInstalledOrReused:true,freshActualHeartbeat:true,attachmentBytesAndHashMatch:true,cookieRetained:true,unknownCannotResume:true,manualPausePreserved:true,restartPassed:true,repeatedUpdatePassed:true,restoreRejectsNewExtensionData:index===0?true:undefined,corruptPackageRejected:true,unrelatedLivePidRefusedWithoutKilling:true,existingBrowserBinaryUnchanged:true,fullBrowserReinstall:false});
  if(index===0){await fs.rm(path.join(cache,'runtime-deps/node_modules'),{recursive:true,force:true});await fs.cp(path.join(directory,'runtime-deps/node_modules'),path.join(cache,'runtime-deps/node_modules'),{recursive:true});}
  // The old and new program/test paths never enter public evidence.
  assert.ok(await fs.stat(path.join(directory,'.runtime/browsers')));activeRoot=undefined;
 }
 evidence.status='PASS';
}catch(error){evidence.status='FAIL';evidence.phase=phase;evidence.error=String(error.stack||error.message).slice(-3500);console.error('::error title=Single update relocation::'+('phase='+phase+' '+evidence.error).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));process.exitCode=1;}
finally{if(activeRoot)try{service(activeRoot,'stop');}catch{}await fs.mkdir(path.join(root,'.runtime/tests/evidence'),{recursive:true});await fs.writeFile(path.join(root,'.runtime/tests/evidence/windows-update.json'),JSON.stringify(evidence,null,2));console.log('::notice title=Windows update acceptance::'+JSON.stringify({status:evidence.status,source:evidence.source,update:evidence.update,phase,scenarios:evidence.scenarios}));}
