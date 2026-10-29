// Only the moved-installation offline repair branch. Historical update/restart
// acceptance remains separate; this does not import or execute that suite.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import syncFS from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {buildUpdate,baselineManifest,UPDATE_BASELINES} from './package-update.mjs';

if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.JOB_ASSISTANT_BROWSER_TEST!=='1')throw new Error('EXPLICIT_HOSTED_WINDOWS_REQUIRED');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const preferredParent=path.join(root,'.runtime/windows-update-repair');
const probePath=base=>path.join(base,'n0','.runtime/updates/txn-'+'a'.repeat(36),'probe-profile/Default/Local Extension Settings','a'.repeat(32),'MANIFEST-000001');
const parent=probePath(preferredParent).length<250?preferredParent:path.join(root,'.runtime/wur');
assert.ok(probePath(parent).length<260,'HOSTED_REPAIR_PATH_TOO_LONG');
const cache=path.join(parent,'c'),BASE='http://127.0.0.1:17321';
const evidence={source:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,status:'RUNNING',scope:'Candidate5/6 diagnosed offline move repair; isolated fictional data, actual Windows Chromium, extension and CMD. No real employer application or historical suite rerun.',scenarios:[]};
let phase='build',activeRoot,managed,sequence=0,lastChild;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const exists=async file=>{try{await fs.lstat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const write=async(file,bytes)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);};
const tail=value=>String(value||'').slice(-2600);
function failedChild(label,result){
  lastChild={phase,label,status:result.status,signal:result.signal||null,error:result.error?.code,stdout:tail(result.stdout),stderr:tail(result.stderr)};
  return new Error(label+' '+JSON.stringify(lastChild));
}
function run(command,args,options={}){
  const result=spawnSync(command,args,{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,...options});
  if(result.error||result.status!==0)throw failedChild('CHILD_COMMAND_FAILED',result);
  return result.stdout;
}
function git(args){return Buffer.from(run('git',args,{cwd:root,encoding:null,maxBuffer:8*1024*1024}));}
async function until(name,read,predicate,timeout=45000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await read();if(predicate(value))return value;await pause(150);}
  throw new Error('WAIT_FAILED '+name);
}
function cmd(directory){
  return spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','""'+path.join(directory,'更新.cmd')+'""'],{windowsVerbatimArguments:true,cwd:directory,env:{...process.env,JOB_ASSISTANT_NONINTERACTIVE:'1'},encoding:'utf8',timeout:180000,maxBuffer:3*1024*1024});
}
async function commandLogs(directory){
  const folder=path.join(directory,'.runtime/browser-test-commands');
  if(!await exists(folder))return '';
  const files=await Promise.all((await fs.readdir(folder)).filter(name=>/\.(?:stdout|stderr)\.log$/.test(name)).map(async name=>({name,at:(await fs.stat(path.join(folder,name))).mtimeMs})));
  return (await Promise.all(files.sort((a,b)=>b.at-a.at).slice(0,2).map(async file=>tail(await fs.readFile(path.join(folder,file.name),'utf8'))))).join('\n');
}
async function service(directory,entry){
  const stem=path.join(parent,'h'+(++sequence)),out=syncFS.openSync(stem+'.stdout','w'),err=syncFS.openSync(stem+'.stderr','w');
  let result;
  try{result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/test-windows-browser.ps1'),'-CandidateRoot',directory,'-CommandOnly','-Entry',entry],{stdio:['ignore',out,err],timeout:100000,env:{...process.env,JOB_ASSISTANT_NONINTERACTIVE:'1',JOB_ASSISTANT_BROWSER_TEST:'1'}});}
  finally{syncFS.closeSync(out);syncFS.closeSync(err);}
  const stdout=await fs.readFile(stem+'.stdout','utf8'),stderr=await fs.readFile(stem+'.stderr','utf8');
  let value;try{value=JSON.parse(stdout.trim());}catch{}
  if(result.error||result.status!==0||value?.exitCode!==0)throw failedChild('SERVICE_'+entry,{...result,stdout:stdout+'\n'+await commandLogs(directory),stderr});
  return value;
}
async function api(directory,route='/state',body,expectedStatus=200){
  const key=(await fs.readFile(path.join(directory,'.runtime/data/local-key'),'utf8')).trim();
  const response=await fetch(BASE+'/api'+route,{method:body?'POST':'GET',headers:{'X-Local-Key':key,...(body?{Origin:BASE,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
  assert.equal(response.status,expectedStatus,'FIXTURE_API_STATUS');return response.json();
}
async function connect(directory){
  const {chromium}=createRequire(path.join(directory,'runtime-deps/package.json'))('playwright');
  managed=await chromium.connectOverCDP('http://127.0.0.1:17323');
  const context=managed.contexts()[0];
  await context.route('https://**/*',route=>route.abort());
  const runner=await until('actual-extension-runner',()=>Promise.resolve(context.pages().find(page=>/^chrome-extension:\/\/[a-p]{32}\/runner\/index\.html$/.test(page.url()))),Boolean);
  return {context,runner};
}
async function tree(directory){
  const entries=[];
  async function visit(current,prefix=''){
    for(const entry of await fs.readdir(current,{withFileTypes:true})){
      assert.ok(!entry.isSymbolicLink(),'FIXTURE_LINK_REFUSED');
      if(entry.name==='lockfile'&&!prefix)continue;
      const name=prefix+entry.name,file=path.join(current,entry.name);
      if(entry.isDirectory())await visit(file,name+'/');
      else entries.push({name,sha256:hash(await fs.readFile(file))});
    }
  }
  await visit(directory);return entries.sort((a,b)=>a.name.localeCompare(b.name));
}
async function protectedState(directory,oldId){
  const stateFile=path.join(directory,'.runtime/data/state.json'),state=JSON.parse(await fs.readFile(stateFile,'utf8'));
  return {state:hash(await fs.readFile(stateFile)),source:hash(await fs.readFile(path.join(directory,'SOURCE.json'))),attachment:hash(await fs.readFile(path.join(directory,'.runtime/data/resumes',state.resume.sha256+'.bin'))),storage:await tree(path.join(directory,'.runtime/browser/production/Default/Local Extension Settings',oldId))};
}
async function noTransactions(directory){
  const folder=path.join(directory,'.runtime/updates');
  if(await exists(folder))assert.equal((await fs.readdir(folder)).filter(name=>/^txn-/.test(name)).length,0,'NEGATIVE_CREATED_TRANSACTION');
}
async function expectRefusal(directory,oldId,before,code){
  const result=cmd(directory);
  if(result.error||result.status===0||!String(result.stdout+result.stderr).includes(code))throw failedChild('EXPECTED_'+code,result);
  assert.deepEqual(await protectedState(directory,oldId),before,'REFUSAL_CHANGED_PROTECTED_DATA');
  assert.equal(await exists(path.join(directory,'.runtime/server.stopped')),false,'REFUSAL_FAKED_NORMAL_STOP');
  await noTransactions(directory);
}
async function helper(command,args,options={}){
  const child=spawn(command,args,{windowsHide:true,stdio:['pipe','pipe','pipe'],...options});
  let stdout='',stderr='',ended=false;
  const finished=new Promise(resolve=>{const finish=()=>{ended=true;resolve();};child.once('close',finish);child.once('error',finish);});
  child.stdout.on('data',bytes=>{stdout=tail(stdout+bytes.toString());});child.stderr.on('data',bytes=>{stderr=tail(stderr+bytes.toString());});child.stdin.on('error',()=>{});
  try{await until('negative-helper-ready',async()=>{if(ended)throw failedChild('HELPER_EXITED',{status:child.exitCode,signal:child.signalCode,stdout,stderr});return stdout.includes('READY');},Boolean,15000);}
  catch(error){child.kill();await finished;throw error;}
  return {child,alive(){assert.equal(child.exitCode,null,'UPDATER_KILLED_UNRELATED_OR_OLD_PROCESS');process.kill(child.pid,0);},async close(){if(!ended){child.stdin.end('\n');child.kill();}let timer;try{await Promise.race([finished,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('HELPER_CLEANUP_TIMEOUT')),8000);})]);}finally{clearTimeout(timer);}}};
}
async function installOld(source,index){
  const manifest=await baselineManifest(root,source),directory=path.join(parent,'o'+index);
  assert.equal(await exists(directory),false,'FIXTURE_DIRECTORY_ALREADY_EXISTS');
  for(const file of manifest.files)await write(path.join(directory,file.path),git(['show',source+':'+file.path]));
  await write(path.join(directory,'SOURCE.json'),JSON.stringify({source:{commit:source},version:manifest.version,files:manifest.files}));
  await fs.cp(path.join(cache,'runtime-deps/node_modules'),path.join(directory,'runtime-deps/node_modules'),{recursive:true});
  await fs.cp(path.join(cache,'.runtime/browsers'),path.join(directory,'.runtime/browsers'),{recursive:true});
  const {Store}=await import(pathToFileURL(path.join(directory,'local-app/model.mjs')).href);
  const store=new Store({data:path.join(directory,'.runtime/data')});store.demo();store.pause();store.save();
  return directory;
}

try{
  await fs.mkdir(parent,{recursive:true});
  const {report}=await buildUpdate({projectRoot:root}),updateFile=path.join(report.directory,'更新.cmd');
  evidence.source=report.source;evidence.update={source:report.source,version:report.version,bytes:report.bytes,sha256:report.sha256,files:report.files};
  evidence.updateReportSha256=hash(await fs.readFile(path.join(report.directory,'UPDATE.json')));
  phase='prepare-existing-locked-browser';
  for(const name of ['package.json','package-lock.json'])await write(path.join(cache,'runtime-deps',name),git(['show',UPDATE_BASELINES[0]+':runtime-deps/'+name]));
  const env={...process.env,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',PLAYWRIGHT_BROWSERS_PATH:path.join(cache,'.runtime/browsers'),npm_config_cache:path.join(parent,'npm-cache'),TEMP:path.join(parent,'tmp'),TMP:path.join(parent,'tmp'),TMPDIR:path.join(parent,'tmp')};await fs.mkdir(env.TEMP,{recursive:true});
  const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  run(process.execPath,[npm,'ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(cache,'runtime-deps'),env});
  run(process.execPath,[path.join(cache,'runtime-deps/node_modules/playwright/cli.js'),'install','--no-shell','chromium'],{cwd:cache,env:{...env,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'',PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT:'45000'},timeout:180000});
  for(const [index,source]of UPDATE_BASELINES.entries()){
    const baseline=index+5;
    phase='candidate'+baseline+'-old-pairing-fixture';
    let directory=await installOld(source,index);activeRoot=directory;
    await service(directory,'start');
    const old=await connect(directory),oldId=new URL(old.runner.url()).hostname;
    const bridge=await old.runner.evaluate(async()=>(await chrome.storage.local.get('localBridge')).localBridge);
    assert.ok(bridge?.profileId,'OLD_REAL_PAIRING_REQUIRED');
    const options=await old.context.newPage();await options.goto('chrome-extension://'+oldId+'/options/index.html');await old.runner.close();
    const records={localSubmissionAttempts:{'fictional|unchanged-job':{taskId:'fictional-offline-task',commandId:'old-command',profileId:bridge.profileId,at:1}},localResultOutbox:{clientId:'old-client',commandId:'old-command',result:{ok:false,kind:'unknown'}},greenhouseReceiptSessions:{'fictional-offline-task':{profileId:bridge.profileId,tabId:1,documentId:'old-document',requestId:'old-request',armedAt:1}},greenhouseUploadProofs:{'fictional-offline-task':{documentId:'old-document',tabId:1}},localTaskTabs:{'fictional-offline-task':1},fictionalRepairUserData:{value:'preserve offline fixture'}};
    await options.evaluate(value=>chrome.storage.local.set(value),records);
    await service(directory,'stop');managed=undefined;
    const stateFile=path.join(directory,'.runtime/data/state.json'),state=JSON.parse(await fs.readFile(stateFile,'utf8'));
    state.tasks=[{id:'fictional-offline-task',jobId:'fictional-job',siteId:state.sites[0].id,title:'Fictional offline repair',url:'http://127.0.0.1:17322/site/alpha/jobs/cpp-001',company:'Fictional company',location:'Fictional city',mode:'demo',status:'unknown',phase:'verify',steps:[],executionProfileId:bridge.profileId,submissionStarted:true,resumeSnapshot:structuredClone(state.resume),profileSnapshot:structuredClone(state.profile),profileVersion:state.profile.version,resumeVersion:state.resume.version}];
    state.answers=[{scope:'fictional-memory',value:'Preserve this confirmed fixture answer'}];
    state.manualPaused=false;state.paused=true;state.running=false;
    await fs.writeFile(stateFile,JSON.stringify(state,null,2));await fs.rm(path.join(directory,'.runtime/server.stopped'),{force:true});await noTransactions(directory);
    const before=structuredClone(state),attachment=await fs.readFile(state.resume.file);
    const browserDirectory=(await fs.readdir(path.join(directory,'.runtime/browsers'))).find(name=>/^chromium-[0-9]+$/.test(name));assert.ok(browserDirectory,'EXISTING_BROWSER_REQUIRED');
    const browserRelative=path.join('.runtime/browsers',browserDirectory,'chrome-win64/chrome.exe'),browserHash=hash(await fs.readFile(path.join(directory,browserRelative)));
    const oldRoot=directory;directory=path.join(parent,'n'+index);assert.equal(await exists(directory),false,'FIXTURE_DIRECTORY_ALREADY_EXISTS');await fs.rename(oldRoot,directory);activeRoot=directory;
    assert.equal(await exists(oldRoot),false,'OLD_ROOT_MUST_BE_ABSENT');await fs.copyFile(updateFile,path.join(directory,'更新.cmd'));
    const protectedBefore=await protectedState(directory,oldId);

    phase='candidate'+baseline+'-reject-live-deleted-old-script';
    const deletedScript=path.join(oldRoot,'scripts/windows-service.mjs');await write(deletedScript,"console.log('READY');setInterval(()=>{},1000);\n");
    const stale=await helper(process.execPath,[deletedScript]);
    try{await fs.rm(oldRoot,{recursive:true});assert.equal(await exists(oldRoot),false,'DELETED_SCRIPT_OLD_ROOT_PRESENT');await expectRefusal(directory,oldId,protectedBefore,'UPDATE_OLD_PROCESS_ACTIVE');stale.alive();}
    finally{await stale.close();await fs.rm(oldRoot,{recursive:true,force:true});}

    phase='candidate'+baseline+'-reject-unrelated-port';
    const foreign=await helper(process.execPath,['-e',"require('node:net').createServer().listen(17321,'127.0.0.1',()=>console.log('READY'))"]);
    try{await expectRefusal(directory,oldId,protectedBefore,'UPDATE_PORT_BUSY');foreign.alive();}finally{await foreign.close();}

    phase='candidate'+baseline+'-reject-actual-profile-lock';
    const lockCode="$ErrorActionPreference='Stop';$f=[IO.File]::Open($env:JOB_REPAIR_PROFILE_LOCK,'OpenOrCreate','Write','Read');try{[Console]::WriteLine('READY');[Console]::ReadLine()|Out-Null}finally{$f.Dispose()}";
    const locked=await helper('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(lockCode,'utf16le').toString('base64')],{env:{...process.env,JOB_REPAIR_PROFILE_LOCK:path.join(directory,'.runtime/browser/production/lockfile')}});
    try{await expectRefusal(directory,oldId,protectedBefore,'UPDATE_PROFILE_BUSY');locked.alive();}finally{await locked.close();}

    phase='candidate'+baseline+'-offline-cmd-repair';
    assert.equal(await exists(oldRoot),false,'OLD_ROOT_RECREATED');
    const updated=cmd(directory);if(updated.error||updated.status!==0)throw failedChild('OFFLINE_UPDATE_CMD_FAILED',updated);
    assert.ok(updated.stdout.includes('UPDATE_COMPLETE'),'UPDATE_SUCCESS_MARKER_REQUIRED');
    assert.equal(await exists(path.join(directory,'.runtime/server.stopped')),false,'UPDATER_FAKED_NORMAL_STOP');
    const moved=JSON.parse(await fs.readFile(path.join(directory,'.runtime/data/state.json'),'utf8'));
    assert.deepEqual(moved.profile,before.profile,'PROFILE_CHANGED');assert.deepEqual(moved.answers,before.answers,'ANSWERS_CHANGED');
    assert.equal(moved.manualPaused,true);assert.equal(moved.paused,true);assert.equal(moved.running,false);
    assert.equal(moved.tasks[0].id,before.tasks[0].id);assert.equal(moved.tasks[0].executionProfileId,before.tasks[0].executionProfileId);assert.equal(moved.tasks[0].status,'unknown');assert.equal(moved.tasks[0].submissionStarted,true);
    assert.deepEqual(moved.tasks[0].profileSnapshot,before.tasks[0].profileSnapshot);
    assert.equal(moved.tasks[0].profileVersion,before.tasks[0].profileVersion);assert.equal(moved.tasks[0].resumeVersion,before.tasks[0].resumeVersion);
    assert.deepEqual(await fs.readFile(moved.resume.file),attachment);assert.equal(hash(await fs.readFile(moved.tasks[0].resumeSnapshot.file)),before.resume.sha256);
    assert.equal(hash(await fs.readFile(path.join(directory,browserRelative))),browserHash,'EXISTING_BROWSER_REPLACED');
    const installation=JSON.parse(await fs.readFile(path.join(directory,'.runtime/installation.json'),'utf8'));
    assert.equal(installation.migration.pending,true);assert.ok(installation.migration.profileId===bridge.profileId,'MIGRATED_PROFILE_CHANGED');assert.notEqual(installation.migration.extensionId,oldId);
    const journal=JSON.parse(await fs.readFile(path.join(directory,'.runtime/updates',installation.backup,'journal.json'),'utf8'));
    assert.equal(journal.phase,'committed');assert.equal(journal.quiescence?.kind,'verified-offline');
    assert.equal(hash(Buffer.from(journal.backup['.runtime/data/state.json'],'base64')),protectedBefore.state,'ORIGINAL_STATE_BACKUP_CHANGED');

    phase='candidate'+baseline+'-new-real-extension-heartbeat';
    const started=Date.now();await service(directory,'start');const fresh=await connect(directory),newId=new URL(fresh.runner.url()).hostname;
    let applicationPosts=0;fresh.context.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).origin==='http://127.0.0.1:17322')applicationPosts++;});
    const actual=await fresh.runner.evaluate(()=>chrome.storage.local.get(null));
    assert.equal(newId,installation.migration.extensionId);assert.ok(actual.localBridge?.profileId===bridge.profileId,'ACTUAL_PROFILE_CHANGED');
    assert.deepEqual(actual.localSubmissionAttempts,records.localSubmissionAttempts);assert.deepEqual(actual.fictionalRepairUserData,records.fictionalRepairUserData);
    const archive=Object.values(actual.localMigrationArchives||{}).at(-1);assert.ok(archive,'MIGRATION_ARCHIVE_REQUIRED');
    assert.deepEqual(archive.localResultOutbox,records.localResultOutbox);assert.deepEqual(archive.greenhouseReceiptSessions,records.greenhouseReceiptSessions);assert.deepEqual(archive.greenhouseUploadProofs,records.greenhouseUploadProofs);
    assert.deepEqual(actual.greenhouseReceiptSessions,{});assert.deepEqual(actual.greenhouseUploadProofs,{});assert.equal(actual.localResultOutbox,undefined);assert.equal(actual.localMigrationHold,undefined);
    const current=await api(directory);assert.ok(current.connection.profileId===bridge.profileId,'HEARTBEAT_PROFILE_CHANGED');assert.equal(current.connection.extensionId,newId);assert.ok(Date.parse(current.connection.lastSeen)>=started,'HEARTBEAT_NOT_FRESH');assert.equal(current.connection.connected,true);
    assert.equal(current.manualPaused,true);assert.equal(current.paused,true);assert.equal(current.running,false);assert.equal(current.tasks[0].canResume,false);assert.equal(current.tasks[0].status,'unknown');
    assert.match((await api(directory,'/action',{action:'task-resume',taskId:'fictional-offline-task'},400)).error,/已记录过提交阶段/);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory,'.runtime/installation.json'),'utf8')).migration.pending,false);
    const fixtureFile=path.join(directory,'.runtime/data/fixture/fixture-state.json');
    const fixtureState=await exists(fixtureFile)?JSON.parse(await fs.readFile(fixtureFile,'utf8')):{receipts:{},submitRequests:[]};
    assert.equal(Object.keys(fixtureState.receipts||{}).length,0,'UNEXPECTED_FIXTURE_RECEIPT');assert.equal(fixtureState.submitRequests.length,0,'UNEXPECTED_PERSISTED_APPLICATION_POST');assert.equal(applicationPosts,0,'UNEXPECTED_APPLICATION_POST');
    await service(directory,'stop');managed=undefined;activeRoot=undefined;
    evidence.scenarios.push({baseline,baselineSource:source,passed:true,diagnosedOfflineState:true,oldRootAbsent:true,noTransactionBeforeRepair:true,deletedOldScriptProcessRefusedWithoutKilling:true,unrelatedPortRefusedWithoutKilling:true,actualWindowsProfileLockRefusedWithoutKilling:true,rejectionsPreserveData:true,verifiedOfflineBranch:true,noFakeNormalStopMarker:true,originalStateBackedUp:true,profileAnswersAttachmentsAndVersionsPreserved:true,oldAndNewExtensionIdsDiffer:true,actualOriginalProfileIdAndLedgersPreserved:true,historicalOutboxAndProofsArchived:true,freshActualExtensionHeartbeat:true,manualHoldPreserved:true,unknownCannotResume:true,applicationPosts:0,existingBrowserBinaryUnchanged:true,oldSuiteRerun:false});
    if(index===0){await fs.rm(path.join(cache,'runtime-deps/node_modules'),{recursive:true,force:true});await fs.cp(path.join(directory,'runtime-deps/node_modules'),path.join(cache,'runtime-deps/node_modules'),{recursive:true});}
  }
  evidence.status='PASS';
}catch(error){
  evidence.status='FAIL';evidence.phase=phase;evidence.error=tail(error.stack||error.message);if(lastChild)evidence.child=lastChild;
  console.error('::error title=Windows offline update repair::'+('phase='+phase+' '+evidence.error).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));process.exitCode=1;
}finally{
  if(activeRoot)try{await service(activeRoot,'stop');managed=undefined;}catch{}
  await fs.mkdir(path.join(root,'.runtime/tests/evidence'),{recursive:true});await fs.writeFile(path.join(root,'.runtime/tests/evidence/windows-update-repair.json'),JSON.stringify(evidence,null,2));
  console.log('::notice title=Windows offline update repair::'+JSON.stringify({status:evidence.status,source:evidence.source,update:evidence.update,updateReportSha256:evidence.updateReportSha256,phase,scenarios:evidence.scenarios}));
}
