import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ROOT} from '../paths.mjs';
import {extensionId,runUpdate,unpackedExtensionId} from '../../scripts/update-install.mjs';
import {canonical,migrateStorage,persistentStorage} from '../../autofill-extension/shared/migration.js';

// These small, explicitly fictional installations exercise the real transaction
// writer and recovery entry point without downloading dependencies or a browser.
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const key='Fictional-recovery-key-12345678901234567890';
const profileId='fictional-recovery-profile';
const originalManifest={manifest_version:3,name:'Fictional recovery extension',version:'0.2.5'};
const nextManifest={...originalManifest,version:'0.2.8',key:Buffer.from('Fictional fixed extension key').toString('base64')};
const names=['启动.cmd','autofill-extension/manifest.json','scripts/update-install.mjs',...Array.from({length:39},(_,i)=>'fixture-source/file-'+i+'.txt')];
const originals=Object.fromEntries(names.map(name=>[name,Buffer.from(name==='autofill-extension/manifest.json'?JSON.stringify(originalManifest):'Original fictional program: '+name+'\n')]));
const targets=Object.fromEntries(names.map(name=>[name,Buffer.from(name==='autofill-extension/manifest.json'?JSON.stringify(nextManifest):'Updated fictional program: '+name+'\n')]));
const records=files=>Object.entries(files).map(([name,bytes])=>({path:name,bytes:bytes.length,sha256:hash(bytes)}));
const bundle={format:1,target:{source:'f'.repeat(40),version:'0.2.8-fictional-recovery',files:records(targets)},baselines:[5,6].map(n=>({source:String(n).repeat(40),version:'0.2.'+n+'-fictional-recovery',files:records(originals)})),changes:Object.fromEntries(Object.entries(targets).map(([name,bytes])=>[name,bytes.toString('base64')]))};
const originalData={localBridge:{key,profileId},profile:{personal:{name:'Original fictional applicant'}},mappings:{fictional:[{field:'fictional-name',source:'personal.name'}]},localSubmissionAttempts:{'fictional|job':{taskId:'fictional-task',commandId:'fictional-command',profileId,at:1}}};
const write=async(file,bytes)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);};
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));

async function fixture(t){
 const parent=path.join(ROOT,'.runtime/tests');await fs.mkdir(parent,{recursive:true});
 const root=await fs.mkdtemp(path.join(parent,'recovery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const [name,bytes]of Object.entries(originals))await write(path.join(root,name),bytes);
 await write(path.join(root,'SOURCE.json'),JSON.stringify({source:{commit:bundle.baselines[0].source},version:bundle.baselines[0].version,files:bundle.baselines[0].files}));
 const bytes=Buffer.from('%PDF-1.4\nFictional recovery fixture only\n%%EOF\n'),sha256=hash(bytes),file=path.join(root,'.runtime/data/resumes',sha256+'.bin');
 await write(file,bytes);
 const resume={name:'fictional-recovery.pdf',file,sha256,size:bytes.length,version:1,mode:'demo'};
 const state={schema:2,version:'fictional-recovery',manualPaused:true,paused:true,running:false,settings:{mode:'demo',scheduleEnabled:false},sites:[{id:'fictional-site',login:{status:'unknown'}}],profile:{version:1,mode:'demo',data:{personal:{name:{zh:'Original fictional applicant',confirmed:true}}}},resume,answers:[{scope:'fictional-answer',value:'Original fictional answer'}],tasks:[{id:'fictional-task',siteId:'fictional-site',jobId:'fictional-job',status:'unknown',phase:'verify',steps:[],submissionStarted:true,executionProfileId:profileId,resumeSnapshot:structuredClone(resume),profileSnapshot:{version:1,mode:'demo',data:{personal:{name:{zh:'Original fictional applicant',confirmed:true}}}}}],issues:[]};
 const stateFile=path.join(root,'.runtime/data/state.json');await write(stateFile,JSON.stringify(state,null,2));
 await write(path.join(root,'.runtime/data/local-key'),key);await write(path.join(root,'.runtime/server.stopped'),'closed');
 const production=path.join(root,'.runtime/browser/production'),oldId=unpackedExtensionId(path.join(root,'autofill-extension')),newId=extensionId(nextManifest);
 assert.notEqual(oldId,newId);
 await write(path.join(production,'Default/Preferences'),JSON.stringify({extensions:{settings:{[oldId]:{location:8,path:path.join(root,'autofill-extension')}}}}));
 await write(path.join(production,'Default/Local Extension Settings',oldId,'fictional-storage.json'),JSON.stringify(originalData));
 await write(path.join(production,'fictional-session'),'Preserve fictional browser session');
 const bundleFile=path.join(root,'fictional-bundle.json');await write(bundleFile,JSON.stringify(bundle));
 return {root,stateFile,production,oldId,newId,bundleFile,attachment:file};
}

function options(){return {checkStopped:async()=>{},dependencies:async()=>{},extensionPrepare:async(root,txn,_bundle,owner)=>{
 const original=await readJSON(path.join(owner.storage,'fictional-storage.json'));
 const data=migrateStorage(original,{id:path.basename(txn),fromExtensionId:owner.id,toExtensionId:extensionId(nextManifest),at:'2026-10-27T00:00:00.000Z'});
 const stageStorage=path.join(txn,'fictional-storage');await write(path.join(stageStorage,'fictional-storage.json'),JSON.stringify(data));
 return {extensionId:extensionId(nextManifest),profileId,pending:true,sourceId:owner.id,storageHash:hash(canonical(persistentStorage(data))),stageStorage,destination:path.join(owner.production,'Default/Local Extension Settings',extensionId(nextManifest))};
 }};}

async function interrupt(env,phase){
 // Exit the subprocess at a real injection boundary rather than synthesizing a
 // journal or allowing runUpdate's catch handler to roll the transaction back.
 const script=`import fs from 'node:fs/promises';
 import path from 'node:path';
 import {createHash} from 'node:crypto';
 import {runUpdate,extensionId} from ${JSON.stringify(pathToFileURL(path.join(ROOT,'scripts/update-install.mjs')).href)};
 import {canonical,migrateStorage,persistentStorage} from ${JSON.stringify(pathToFileURL(path.join(ROOT,'autofill-extension/shared/migration.js')).href)};
 const root=process.argv[1],phase=process.argv[2],bundle=JSON.parse(await fs.readFile(path.join(root,'fictional-bundle.json'),'utf8'));
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 await runUpdate(bundle,root,{checkStopped:async()=>{},extensionPrepare:async(_root,txn,_bundle,owner)=>{
  if(phase==='prepared')process.exit(73);
  const manifest=JSON.parse(Buffer.from(bundle.changes['autofill-extension/manifest.json'],'base64')),id=extensionId(manifest);
  const original=JSON.parse(await fs.readFile(path.join(owner.storage,'fictional-storage.json'),'utf8'));
  const data=migrateStorage(original,{id:path.basename(txn),fromExtensionId:owner.id,toExtensionId:id,at:'2026-10-27T00:00:00.000Z'});
  const stageStorage=path.join(txn,'fictional-storage');await fs.mkdir(stageStorage);await fs.writeFile(path.join(stageStorage,'fictional-storage.json'),JSON.stringify(data));
  return {extensionId:id,profileId:${JSON.stringify(profileId)},pending:true,sourceId:owner.id,storageHash:sha(canonical(persistentStorage(data))),stageStorage,destination:path.join(owner.production,'Default/Local Extension Settings',id)};
 },dependencies:async()=>{process.exit(73);}});
 process.exit(74);`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script,env.root,phase],{cwd:ROOT,encoding:'utf8',timeout:30000});
 assert.equal(child.error,undefined);assert.equal(child.status,73,child.stderr||child.stdout);
 const updates=path.join(env.root,'.runtime/updates'),transactions=(await fs.readdir(updates)).filter(name=>name.startsWith('txn-'));
 assert.equal(transactions.length,1);
 const txn=path.join(updates,transactions[0]),journalFile=path.join(txn,'journal.json');
 assert.equal((await readJSON(journalFile)).phase,phase);
 return {txn,journalFile};
}

async function snapshot(env,journalFile){
 const files={};async function visit(directory,prefix=''){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const name=prefix+entry.name,target=path.join(directory,entry.name);if(entry.isDirectory())await visit(target,name+'/');else files['profile/'+name]=(await fs.readFile(target)).toString('base64');}}
 await visit(env.production);
 for(const name of [...names,'SOURCE.json','.runtime/data/state.json'])files[name]=(await fs.readFile(path.join(env.root,name))).toString('base64');
 files.attachment=(await fs.readFile(env.attachment)).toString('base64');files.journal=(await fs.readFile(journalFile)).toString('base64');
 return files;
}

async function refuseWithoutChanges(env,journalFile){
 const before=await snapshot(env,journalFile);
 await assert.rejects(()=>runUpdate(bundle,env.root,options()),/UPDATE_RECOVERY_HAS_NEW_DATA/);
 assert.deepEqual(await snapshot(env,journalFile),before,'refused recovery must not replace active data, program files or the journal');
 const state=await readJSON(env.stateFile);assert.equal(state.tasks[0].status,'unknown');assert.equal(state.tasks[0].submissionStarted,true);assert.equal(state.manualPaused,true);
}

for(const phase of ['prepared','writing']){
 test(phase+' interruption refuses automatic recovery after newer backend profile/answers are saved',async t=>{
  const env=await fixture(t),{journalFile}=await interrupt(env,phase),state=await readJSON(env.stateFile);
  state.profile.version=2;state.profile.data.personal.name.zh='New fictional applicant';state.answers.push({scope:'fictional-new-answer',value:'Keep this newer fictional answer'});
  await fs.writeFile(env.stateFile,JSON.stringify(state,null,2));await refuseWithoutChanges(env,journalFile);
 });
 test(phase+' interruption refuses automatic recovery after extension profile, mappings or attempts change',async t=>{
  const env=await fixture(t),{journalFile}=await interrupt(env,phase),id=phase==='prepared'?env.oldId:env.newId,file=path.join(env.production,'Default/Local Extension Settings',id,'fictional-storage.json'),data=await readJSON(file);
  data.profile={personal:{name:'New fictional extension profile'}};data.mappings={fictional:[{field:'new-field',source:'new-source'}]};data.localSubmissionAttempts['fictional|new-job']={taskId:'fictional-new-task',at:2};
  await fs.writeFile(file,JSON.stringify(data));await refuseWithoutChanges(env,journalFile);
 });
 for(const changed of ['backend','extension'])test(phase+' legacy journal without new guard fields refuses to overwrite newer '+changed+' data',async t=>{
  const env=await fixture(t),{journalFile}=await interrupt(env,phase),journal=await readJSON(journalFile);
  const oldFields=new Set(['format','root','oldRoot','source','phase','backup','backupHashes','profileBackup','profileTree']);
  for(const name of Object.keys(journal))if(!oldFields.has(name))delete journal[name];
  await fs.writeFile(journalFile,JSON.stringify(journal,null,2));
  if(changed==='backend'){
   const state=await readJSON(env.stateFile);state.profile.version=2;state.answers.push({scope:'fictional-legacy-answer',value:'New fictional answer after interruption'});await fs.writeFile(env.stateFile,JSON.stringify(state,null,2));
  }else{
   const id=phase==='prepared'?env.oldId:env.newId,file=path.join(env.production,'Default/Local Extension Settings',id,'fictional-storage.json'),data=await readJSON(file);
   data.profile={personal:{name:'New fictional profile after interruption'}};await fs.writeFile(file,JSON.stringify(data));
  }
  await refuseWithoutChanges(env,journalFile);
 });
 test(phase+' interruption with unchanged active data safely recovers and preserves unknown history',async t=>{
  const env=await fixture(t);await interrupt(env,phase);
  assert.equal((await runUpdate(bundle,env.root,options())).updated,true);
  const state=await readJSON(env.stateFile);assert.equal(state.profile.version,1);assert.equal(state.tasks[0].status,'unknown');assert.equal(state.tasks[0].submissionStarted,true);assert.equal(state.manualPaused,true);
  const migrated=await readJSON(path.join(env.production,'Default/Local Extension Settings',env.newId,'fictional-storage.json'));
  assert.deepEqual(migrated.localSubmissionAttempts,originalData.localSubmissionAttempts);assert.deepEqual(migrated.profile,originalData.profile);assert.equal(migrated.localMigrationHold,true);
 });
}
