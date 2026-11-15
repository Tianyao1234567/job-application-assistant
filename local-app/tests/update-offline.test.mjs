import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from '../paths.mjs';
import {extensionId,holdOfflineState,verifyInventory,projectProcess,runUpdate,unpackedExtensionId} from '../../scripts/update-install.mjs';
import {canonical,migrateStorage,persistentStorage} from '../../autofill-extension/shared/migration.js';

// Fictional files and injected process/profile locks keep this test independent
// of Windows, the user's installation and any installed browser or dependencies.
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const key='Fictional-offline-key-12345678901234567890',profileId='fictional-offline-profile';
const oldManifest={manifest_version:3,name:'Fictional offline extension',version:'0.2.5'};
const nextManifest={...oldManifest,version:'0.2.8',key:Buffer.from('Fictional offline fixed key').toString('base64')};
const names=['启动.cmd','autofill-extension/manifest.json','scripts/update-install.mjs',...Array.from({length:39},(_,i)=>'fictional-source/file-'+i+'.txt')];
const filesFor=(manifest,version)=>Object.fromEntries(names.map(name=>[name,Buffer.from(name==='autofill-extension/manifest.json'?JSON.stringify(manifest):version+' fictional file '+name+'\n')]));
const oldFiles=filesFor(oldManifest,'Original'),newFiles=filesFor(nextManifest,'Updated');
const records=files=>Object.entries(files).map(([name,bytes])=>({path:name,bytes:bytes.length,sha256:hash(bytes)}));
const bundle={format:1,target:{source:'f'.repeat(40),version:'0.2.8-fictional-offline',files:records(newFiles)},baselines:[5,6].map(n=>({source:String(n).repeat(40),version:'0.2.'+n+'-fictional-offline',files:records(oldFiles)})),changes:Object.fromEntries(Object.entries(newFiles).map(([name,bytes])=>[name,bytes.toString('base64')]))};
const originalStorage={localBridge:{key,profileId},profile:{personal:{name:'Fictional offline applicant'}},mappings:{fictional:[{field:'fictional-name',source:'personal.name'}]},localSubmissionAttempts:{'fictional|job':{taskId:'fictional-unknown',profileId,commandId:'fictional-attempt',at:1}}};
const write=async(file,bytes)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);};
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const absent=async file=>assert.equal(await fs.stat(file).then(()=>false,error=>error.code==='ENOENT'),true);

function sampleState(){return {schema:2,version:'fictional-offline',manualPaused:false,paused:true,running:false,settings:{mode:'demo',scheduleEnabled:false},sites:[{id:'fictional-site',login:{status:'unknown'}}],profile:{version:2,mode:'demo',data:{personal:{name:{zh:'Fictional offline applicant',confirmed:true}}}},resume:null,answers:[{scope:'fictional-answer',value:'Keep the fictional offline answer'}],tasks:[
 {id:'fictional-unknown',siteId:'fictional-site',jobId:'fictional-job',status:'unknown',phase:'verify',submissionStarted:true,executionProfileId:profileId,steps:[]},
 {id:'fictional-running',siteId:'fictional-site',jobId:'fictional-other-job',status:'running',phase:'fill',executionProfileId:profileId,steps:[]}
],issues:[]};}

async function fixture(t){
 const parent=path.join(ROOT,'.runtime/tests');await fs.mkdir(parent,{recursive:true});
 const root=await fs.mkdtemp(path.join(parent,'offline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const [name,bytes]of Object.entries(oldFiles))await write(path.join(root,name),bytes);
 await write(path.join(root,'SOURCE.json'),JSON.stringify({source:{commit:bundle.baselines[0].source},version:bundle.baselines[0].version,files:bundle.baselines[0].files}));
 const bytes=Buffer.from('%PDF-1.4\nOnly fictional offline fixture bytes\n%%EOF\n'),sha256=hash(bytes),attachment=path.join(root,'.runtime/data/resumes',sha256+'.bin');await write(attachment,bytes);
 const state=sampleState();state.resume={file:attachment,name:'fictional-offline.pdf',size:bytes.length,sha256,version:3,mode:'demo'};
 for(const task of state.tasks){task.resumeSnapshot=structuredClone(state.resume);task.profileSnapshot=structuredClone(state.profile);}
 const stateFile=path.join(root,'.runtime/data/state.json');await write(stateFile,JSON.stringify(state,null,2));await write(path.join(root,'.runtime/data/local-key'),key);
 const production=path.join(root,'.runtime/browser/production'),oldId=unpackedExtensionId(path.join(root,'autofill-extension')),newId=extensionId(nextManifest);
 await write(path.join(production,'Default/Preferences'),JSON.stringify({extensions:{settings:{[oldId]:{location:8,path:path.join(root,'autofill-extension')}}}}));
 await write(path.join(production,'Default/Local Extension Settings',oldId,'fictional-storage.json'),JSON.stringify(originalStorage));
 await write(path.join(production,'fictional-session'),'Keep the fictional offline session');
 const stopFile=path.join(root,'.runtime/server.stopped');await absent(stopFile);await absent(path.join(root,'.runtime/updates'));
 return {root,stateFile,production,oldId,newId,attachment,stopFile,bytes};
}

async function moveFixture(t,env){
 const root=env.root+'-moved';await fs.rename(env.root,root);t.after(()=>fs.rm(root,{recursive:true,force:true}));
 // Move the complete installation while retaining the old absolute references
 // and Chromium path-derived identity, as in the affected real installation.
 return {...env,root,stateFile:path.join(root,'.runtime/data/state.json'),production:path.join(root,'.runtime/browser/production'),attachment:path.join(root,path.relative(env.root,env.attachment)),stopFile:path.join(root,'.runtime/server.stopped')};
}

function lockGate(profileHeld=true){
 let held=profileHeld,released=false;
 return {get profileHeld(){return held;},requireHeld(){assert.equal(released,false,'the launch lock must remain held');},async releaseProfile(){held=false;},async acquireProfile(){held=true;},async release(){released=true;held=false;}};
}

function options({proof={verified:true},profileHeld=true,fail}={}){
 const gate=lockGate(profileHeld);
 return {checkStopped:async()=>proof,acquireLocks:async()=>gate,dependencies:async()=>{if(fail==='dependency')throw new Error('FICTIONAL_OFFLINE_DEPENDENCY_FAILURE');},extensionPrepare:async(_root,txn,_bundle,owner)=>{
  if(fail==='extension')throw new Error('FICTIONAL_OFFLINE_EXTENSION_FAILURE');
  const original=await readJSON(path.join(owner.storage,'fictional-storage.json'));
  const data=migrateStorage(original,{id:path.basename(txn),fromExtensionId:owner.id,toExtensionId:extensionId(nextManifest),at:'2026-10-27T00:00:00.000Z'});
  const stageStorage=path.join(txn,'fictional-storage');await write(path.join(stageStorage,'fictional-storage.json'),JSON.stringify(data));
  return {extensionId:extensionId(nextManifest),profileId,pending:true,sourceId:owner.id,storageHash:hash(canonical(persistentStorage(data))),stageStorage,destination:path.join(owner.production,'Default/Local Extension Settings',extensionId(nextManifest))};
 }};
}

async function activeBytes(env){
 const files={};async function visit(directory,prefix=''){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const name=prefix+entry.name,target=path.join(directory,entry.name);if(entry.isDirectory())await visit(target,name+'/');else files['profile/'+name]=(await fs.readFile(target)).toString('base64');}}
 await visit(env.production);
 for(const name of [...names,'SOURCE.json','.runtime/data/state.json','.runtime/data/local-key'])files[name]=(await fs.readFile(path.join(env.root,name))).toString('base64');
 files.attachment=(await fs.readFile(env.attachment)).toString('base64');return files;
}

async function journals(env){const updates=path.join(env.root,'.runtime/updates');return Promise.all((await fs.readdir(updates)).filter(name=>name.startsWith('txn-')).map(name=>readJSON(path.join(updates,name,'journal.json'))));}

function preservedUserData(after,before){
 assert.deepEqual(after.profile,before.profile);assert.deepEqual(after.answers,before.answers);assert.deepEqual(after.resume,before.resume);assert.deepEqual(after.sites,before.sites);assert.deepEqual(after.settings,before.settings);
 for(const [index,task]of after.tasks.entries()){assert.deepEqual(task.resumeSnapshot,before.tasks[index].resumeSnapshot);assert.deepEqual(task.profileSnapshot,before.tasks[index].profileSnapshot);assert.equal(task.executionProfileId,before.tasks[index].executionProfileId);}
 assert.equal(after.tasks[0].status,'unknown');assert.equal(after.tasks[0].phase,'verify');assert.equal(after.tasks[0].submissionStarted,true);
 assert.equal(after.manualPaused,true);assert.equal(after.paused,true);assert.equal(after.running,false);
}

test('offline hold is pure, pauses execution and preserves the unknown submission boundary',()=>{
 const state=sampleState(),before=structuredClone(state),held=holdOfflineState(state);
 assert.deepEqual(state,before);assert.notEqual(held,state);preservedUserData(held,before);
 assert.equal(held.tasks[1].status,'queued');assert.equal(held.tasks[1].phase,'inspect');
});

test('offline hold never requeues a running task with a persisted submission attempt',()=>{
 const state=sampleState();state.tasks[1].submissionStarted=true;
 const held=holdOfflineState(state);assert.equal(held.tasks[1].status,'unknown');assert.equal(held.tasks[1].phase,'verify');assert.equal(held.tasks[1].submissionStarted,true);assert.equal(state.tasks[1].status,'running');
});

for(const [name,proof,profileHeld]of [['missing process proof',undefined,true],['unverified process proof',{},true],['explicitly rejected process proof',{verified:false},true],['missing production profile lock',{verified:true},false]]){
 test('offline update refuses '+name+' without altering active files',async t=>{
  const env=await fixture(t),before=await activeBytes(env),config=options({proof,profileHeld});
  // Explicitly retain undefined instead of allowing options()'s default proof.
  config.checkStopped=async()=>proof;
  await assert.rejects(()=>runUpdate(bundle,env.root,config),/UPDATE_NORMAL_STOP_REQUIRED/);
  assert.deepEqual(await activeBytes(env),before);await absent(env.stopFile);
 });
}

test('verified offline update preserves exact data and records its hold without fabricating a normal-stop marker',async t=>{
 const env=await fixture(t),before=await readJSON(env.stateFile),keyBytes=await fs.readFile(path.join(env.root,'.runtime/data/local-key'));
 assert.equal((await runUpdate(bundle,env.root,options())).updated,true);
 const state=await readJSON(env.stateFile);preservedUserData(state,before);assert.equal(state.tasks[1].status,'queued');assert.equal(state.tasks[1].phase,'inspect');
 assert.deepEqual(await fs.readFile(env.attachment),env.bytes);assert.deepEqual(await fs.readFile(path.join(env.root,'.runtime/data/local-key')),keyBytes);await absent(env.stopFile);
 const history=await journals(env);assert.equal(history.length,1);assert.equal(history[0].phase,'committed');assert.equal(history[0].quiescence.kind,'verified-offline');
 const storage=await readJSON(path.join(env.production,'Default/Local Extension Settings',env.newId,'fictional-storage.json'));
 assert.deepEqual(storage.localBridge,originalStorage.localBridge);assert.deepEqual(storage.profile,originalStorage.profile);assert.deepEqual(storage.mappings,originalStorage.mappings);assert.deepEqual(storage.localSubmissionAttempts,originalStorage.localSubmissionAttempts);assert.equal(storage.localMigrationHold,true);
});

for(const fail of ['extension','dependency'])test('offline '+fail+' failure keeps the safe hold while restoring original program and preserving user data',async t=>{
 const env=await fixture(t),before=await readJSON(env.stateFile),original=await activeBytes(env);
 await assert.rejects(()=>runUpdate(bundle,env.root,options({fail})),new RegExp('FICTIONAL_OFFLINE_'+fail.toUpperCase()+'_FAILURE'));
 const state=await readJSON(env.stateFile);preservedUserData(state,before);assert.equal(state.tasks[1].status,'queued');assert.equal(state.tasks[1].phase,'inspect');
 const actual=await activeBytes(env);delete actual['.runtime/data/state.json'];delete original['.runtime/data/state.json'];assert.deepEqual(actual,original);
 const history=await journals(env);assert.equal(history.length,1);assert.equal(history[0].phase,'rolled-back');assert.equal(history[0].quiescence.kind,'verified-offline');await absent(env.stopFile);
});

for(const fail of ['extension','dependency'])test('moved offline '+fail+' failure keeps the old ownership references paused and permits a safe update retry',async t=>{
 const env=await moveFixture(t,await fixture(t)),before=await readJSON(env.stateFile),original=await activeBytes(env);
 assert.notEqual(before.resume.file,env.attachment);
 await assert.rejects(()=>runUpdate(bundle,env.root,options({fail})),new RegExp('FICTIONAL_OFFLINE_'+fail.toUpperCase()+'_FAILURE'));
 const held=await readJSON(env.stateFile);preservedUserData(held,before);assert.equal(held.resume.file,before.resume.file);assert.equal(held.tasks[0].resumeSnapshot.file,before.tasks[0].resumeSnapshot.file);
 assert.equal(held.tasks[1].status,'queued');assert.equal(held.tasks[1].phase,'inspect');
 const actual=await activeBytes(env);delete actual['.runtime/data/state.json'];delete original['.runtime/data/state.json'];assert.deepEqual(actual,original);await absent(env.stopFile);
 assert.equal((await runUpdate(bundle,env.root,options())).updated,true);
 const retried=await readJSON(env.stateFile),expected=structuredClone(before);expected.resume.file=env.attachment;for(const task of expected.tasks)task.resumeSnapshot.file=env.attachment;
 preservedUserData(retried,expected);assert.equal(retried.tasks[1].status,'queued');assert.equal(retried.tasks[1].phase,'inspect');assert.deepEqual(await fs.readFile(retried.resume.file),env.bytes);await absent(env.stopFile);
 const storage=await readJSON(path.join(env.production,'Default/Local Extension Settings',env.newId,'fictional-storage.json'));assert.deepEqual(storage.localSubmissionAttempts,originalStorage.localSubmissionAttempts);assert.deepEqual(storage.localBridge,originalStorage.localBridge);
 const history=await journals(env);assert.equal(history.length,2);assert.deepEqual(history.map(journal=>journal.phase).sort(),['committed','rolled-back']);
});

test('verified offline update can explicitly restore unchanged data while retaining its safe hold',async t=>{
 const env=await moveFixture(t,await fixture(t)),before=await readJSON(env.stateFile),original=await activeBytes(env);
 assert.equal((await runUpdate(bundle,env.root,options())).updated,true);
 let inspections=0;
 const config={...options(),restore:true,extensionInspect:async(_root,_txn,_bundle,migration)=>{
  inspections++;assert.equal(migration.profileId,profileId);assert.equal(migration.extensionId,env.newId);
  const storage=await readJSON(path.join(env.production,'Default/Local Extension Settings',env.newId,'fictional-storage.json'));
  assert.equal(hash(canonical(persistentStorage(storage))),migration.storageHash,'restore must inspect the unchanged current persistent storage');
 }};
 assert.equal((await runUpdate(bundle,env.root,config)).restored,true);assert.equal(inspections,1);
 const held=await readJSON(env.stateFile);preservedUserData(held,before);assert.equal(held.tasks[1].status,'queued');assert.equal(held.tasks[1].phase,'inspect');
 const actual=await activeBytes(env);delete actual['.runtime/data/state.json'];delete original['.runtime/data/state.json'];assert.deepEqual(actual,original);
 await absent(env.stopFile);await absent(path.join(env.root,'.runtime/installation.json'));
 const history=await journals(env);assert.equal(history.length,1);assert.equal(history[0].phase,'rolled-back');assert.equal(history[0].quiescence.kind,'verified-offline');
});

test('incomplete process inventories refuse proof and alternate Node executables still identify project entries',()=>{
 const row={ProcessId:1234,ExecutablePath:'/fictional/alternate/node.exe',CommandLine:'node.exe /fictional/project/scripts/windows-service.mjs'};
 assert.deepEqual(verifyInventory([row]),[row]);for(const incomplete of [{...row,CommandLine:null},{...row,ExecutablePath:null},{...row,ProcessId:0}])assert.throws(()=>verifyInventory([incomplete]),/PROCESS_UNVERIFIED/);
 assert.equal(projectProcess(row,'/fictional/project'),true);assert.equal(projectProcess(row,'/fictional/different'),false);
});
