import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {ROOT} from '../paths.mjs';
import {Store} from '../model.mjs';
import {SOURCE_PATHS,VERSION} from '../../scripts/package-candidate.mjs';
import {baselineManifest,UPDATE_BASELINES,renderUpdater} from '../../scripts/package-update.mjs';
import {validateBundle,runUpdate,relocateState,extensionOwner,windowsArguments,unpackedExtensionId} from '../../scripts/update-install.mjs';
import {migrateStorage,persistentStorage,canonical} from '../../autofill-extension/shared/migration.js';
import {verifiedUpload} from '../../autofill-extension/greenhouse-receipts.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const baselines=await Promise.all(UPDATE_BASELINES.map(source=>baselineManifest(ROOT,source)));
const targetFiles=await Promise.all([...SOURCE_PATHS,'DEV_REPORT_004.md','DEV_REPORT_005.md','REAL_SITE_PREPARATION.md'].map(async name=>{const bytes=await fs.readFile(path.join(ROOT,name));return {path:name,bytes:bytes.length,sha256:hash(bytes),value:bytes.toString('base64')};}));
const changes=Object.fromEntries(targetFiles.filter(f=>baselines.some(b=>b.files.find(old=>old.path===f.path)?.sha256!==f.sha256)).map(f=>[f.path,f.value]));
const bundle={format:1,target:{source:'f'.repeat(40),version:VERSION,files:targetFiles.map(({value,...file})=>file)},baselines,changes};
async function installation(t,index=0){
 const parent=path.join(ROOT,'.runtime/tests');await fs.mkdir(parent,{recursive:true});const tmp=await fs.mkdtemp(path.join(parent,'update-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));
 const original=path.join(tmp,'deep','version files ! 中文','job-application-assistant');await fs.mkdir(original,{recursive:true});const baseline=baselines[index];
 for(const file of baseline.files){const bytes=spawnSync('git',['show',baseline.source+':'+file.path],{cwd:ROOT}).stdout;await fs.mkdir(path.dirname(path.join(original,file.path)),{recursive:true});await fs.writeFile(path.join(original,file.path),bytes);}
 await fs.writeFile(path.join(original,'SOURCE.json'),JSON.stringify({source:{commit:baseline.source},version:baseline.version,files:baseline.files}));
 const store=new Store({data:path.join(original,'.runtime/data')});store.demo();store.state.answers=[{scope:'fictional-answer',value:'Preserve fictional answer'}];
 const task=store.manual('http://127.0.0.1:17322/site/alpha/jobs/cpp-001').task;task.resumeSnapshot=structuredClone(store.state.resume);task.submissionStarted=true;task.status='unknown';task.phase='verify';store.pause();store.save();
 await fs.writeFile(path.join(original,'.runtime/server.stopped'),'closed');await fs.writeFile(path.join(original,'.runtime/data/local-key'),'Fictional-local-key-12345678901234567890');
 const root=path.join(tmp,'short');await fs.rename(original,root);return {root,original,baseline,stateFile:path.join(root,'.runtime/data/state.json')};
}
const fakeOptions={checkStopped:async()=>{},extensionPrepare:async()=>null,dependencies:async()=>{}};
test('candidate5 first update and candidate6 compatibility preserve data/unknown while relocating exact attachment references',async t=>{
 for(const index of [0,1]){const env=await installation(t,index),before=JSON.parse(await fs.readFile(env.stateFile,'utf8')),bytes=await fs.readFile(path.join(env.root,'.runtime/data/resumes',before.resume.sha256+'.bin'));
  const result=await runUpdate(bundle,env.root,fakeOptions);assert.equal(result.updated,true);assert.equal(result.attachmentsRelocated,2);
  const after=JSON.parse(await fs.readFile(env.stateFile,'utf8')),expected=structuredClone(before);expected.resume.file=path.join(env.root,'.runtime/data/resumes',before.resume.sha256+'.bin');expected.tasks[0].resumeSnapshot.file=expected.resume.file;assert.deepEqual(after,expected);assert.equal(after.tasks[0].status,'unknown');assert.equal(after.manualPaused,true);assert.deepEqual(await fs.readFile(after.resume.file),bytes);
  const restored=new Store({data:path.join(env.root,'.runtime/data')});assert.equal(restored.canResumeTask(restored.task(after.tasks[0].id)),false);
  assert.equal((await runUpdate(bundle,env.root,fakeOptions)).alreadyCurrent,true);
 }
});
test('wrong directory, modified baseline, unsafe/corrupt payload fail before program or state changes',async t=>{
 const env=await installation(t),before=await fs.readFile(env.stateFile);const corrupt=structuredClone(bundle);corrupt.changes['local-app/model.mjs']=Buffer.from('changed').toString('base64');assert.throws(()=>validateBundle(corrupt),/HASH/);
 const unsafe=structuredClone(bundle);unsafe.changes['../escape']='YQ==';assert.throws(()=>validateBundle(unsafe),/UNSAFE/);
 await fs.appendFile(path.join(env.root,'local-app/model.mjs'),'\n// local change');await assert.rejects(()=>runUpdate(bundle,env.root,fakeOptions),/BASELINE_CHANGED/);assert.deepEqual(await fs.readFile(env.stateFile),before);assert.equal(await fs.stat(path.join(env.root,'.runtime/updates')).then(()=>true,()=>false),false);
 await assert.rejects(()=>runUpdate(bundle,path.dirname(env.root),fakeOptions));
});
test('missing, wrong-size/hash, mixed and external attachment references reject the entire relocation',async t=>{
 const env=await installation(t),state=JSON.parse(await fs.readFile(env.stateFile,'utf8')),before=structuredClone(state);
 for(const mutate of [s=>s.resume.size++,s=>s.resume.file='/external/other.bin',s=>s.tasks[0].resumeSnapshot.file=s.tasks[0].resumeSnapshot.file.replace('/deep/','/other/')]){const invalid=structuredClone(state);mutate(invalid);await assert.rejects(()=>relocateState(env.root,invalid));assert.deepEqual(state,before);}
 await fs.rm(path.join(env.root,'.runtime/data/resumes',state.resume.sha256+'.bin'));await assert.rejects(()=>relocateState(env.root,state));assert.deepEqual(state,before);
});
test('mid-update/dependency failures restore original files/state and retain the backup and submission boundary',async t=>{
 for(const mode of ['write','dependency']){const env=await installation(t),state=await fs.readFile(env.stateFile),program=await fs.readFile(path.join(env.root,'local-app/model.mjs'));
  await assert.rejects(()=>runUpdate(bundle,env.root,{...fakeOptions,...(mode==='write'?{failAfterWrite:true}:{dependencies:async()=>{throw new Error('PDF_DEPENDENCY_FAILED');}})}));
  assert.deepEqual(await fs.readFile(env.stateFile),state);assert.deepEqual(await fs.readFile(path.join(env.root,'local-app/model.mjs')),program);assert.equal(JSON.parse(state).tasks[0].submissionStarted,true);
  const transactions=await fs.readdir(path.join(env.root,'.runtime/updates'));assert.ok(transactions.some(n=>n.startsWith('txn-')));
 }
});
test('private storage migration preserves identity, attempts and user data; archives stale page evidence/outbox without replay',()=>{
 const old={localBridge:{key:'fictional-key',profileId:'fictional-profile'},localSubmissionAttempts:{job:{commandId:'old-command',at:1}},localResultOutbox:{clientId:'old-client',commandId:'old-command',result:{ok:true}},greenhouseReceiptSessions:{task:{tabId:1,documentId:'old-doc',requestId:'old-request'}},greenhouseUploadProofs:{task:{documentId:'old-doc'}},localTaskTabs:{task:1},runnerTabId:1,profiles:{value:'fictional user data'}};
 const migrated=migrateStorage(old,{id:'migration-one',fromExtensionId:'a'.repeat(32),toExtensionId:'b'.repeat(32),at:'2026-10-23'});assert.deepEqual(migrated.localBridge,old.localBridge);assert.deepEqual(migrated.localSubmissionAttempts,old.localSubmissionAttempts);assert.deepEqual(migrated.profiles,old.profiles);assert.equal(migrated.localMigrationHold,true);assert.equal(migrated.localResultOutbox,undefined);assert.deepEqual(migrated.greenhouseReceiptSessions,{});assert.deepEqual(migrated.localMigrationArchives['migration-one'].localResultOutbox,old.localResultOutbox);assert.deepEqual(migrated.localMigrationArchives['migration-one'].greenhouseReceiptSessions,old.greenhouseReceiptSessions);assert.equal(old.runnerTabId,1);assert.equal(canonical(persistentStorage(migrated)),canonical(persistentStorage({...migrated,runnerTabId:99})));
 assert.equal(verifiedUpload({documentId:'new-doc',taskId:'task',file:{sha256:'a'.repeat(64)}},{rule:'greenhouse-upload-object-v1',documentId:'old-doc',taskId:'task'}),false);
});
test('the one-file CMD contains an integrity checked engine and both baseline deltas, without extracting external files first',async()=>{
 const cmd=renderUpdater(bundle,await fs.readFile(path.join(ROOT,'scripts/update-install.mjs'),'utf8')).toString('utf8');assert.ok(cmd.startsWith('@echo off\r\nsetlocal DisableDelayedExpansion'));assert.ok(cmd.includes('JOB_UPDATE_FILE=%~f0'));assert.equal(cmd.includes('^&'),false);
 const body=Buffer.from(/^# JA_BODY (.+)$/m.exec(cmd)[1].trim(),'base64'),expected=/^# JA_SHA256 (.+)$/m.exec(cmd)[1].trim();assert.equal(hash(body),expected);assert.equal(body[9],255);const code=gunzipSync(body).toString('utf8');assert.ok(code.includes('globalThis.__JOB_UPDATE_BUNDLE'));assert.ok(cmd.includes('pause'));assert.ok(Object.keys(bundle.changes).length<bundle.target.files.length,'delivery contains a delta, not the whole source tree');
});
test('unpacked extension owner without cached manifest is exact; wrong ID/type, ambiguity and linked paths are refused',async t=>{
 const env=await installation(t),manifest=JSON.parse(await fs.readFile(path.join(env.root,'autofill-extension/manifest.json'),'utf8')),production=path.join(env.root,'.runtime/browser/production'),id=unpackedExtensionId(path.join(env.original,'autofill-extension'));await fs.mkdir(path.join(production,'Default/Local Extension Settings',id),{recursive:true});
 await fs.writeFile(path.join(production,'Default/Preferences'),JSON.stringify({extensions:{settings:{[id]:{path:path.join(env.original,'autofill-extension'),location:8}}}}));const owner=await extensionOwner(env.root,null);assert.equal(owner.id,id);assert.equal(owner.oldRoot,env.original);
 const preferenceFile=path.join(production,'Default/Preferences'),entry={path:path.join(env.original,'autofill-extension'),location:8};
 const setPrefs=settings=>fs.writeFile(preferenceFile,JSON.stringify({extensions:{settings}}));
 await setPrefs({[id]:{...entry,location:1}});await assert.rejects(()=>extensionOwner(env.root,null),/OWNER/);
 await setPrefs({['b'.repeat(32)]:entry});await assert.rejects(()=>extensionOwner(env.root,null),/OWNER/);
 const other=path.join(env.original,'other','autofill-extension');await setPrefs({[id]:entry,[unpackedExtensionId(other)]:{path:other,location:8}});await assert.rejects(()=>extensionOwner(env.root,null),/OWNER/);
 await setPrefs({[id]:entry});
 const moved=production+'-original';await fs.rename(production,moved);await fs.symlink(moved,production,'dir');await assert.rejects(()=>extensionOwner(env.root,null),/LINK/);
});
test('Windows argument ownership parser retains quoted Unicode and exclamation-mark paths exactly',()=>{
 assert.deepEqual(windowsArguments('"C:\\Program Files\\nodejs\\node.exe" "C:\\fictional ! 中文\\scripts\\windows-service.mjs"'),['C:\\Program Files\\nodejs\\node.exe','C:\\fictional ! 中文\\scripts\\windows-service.mjs']);
 assert.deepEqual(windowsArguments('chrome.exe --user-data-dir="C:\\fictional ! 中文\\.runtime\\browser\\production"'),['chrome.exe','--user-data-dir=C:\\fictional ! 中文\\.runtime\\browser\\production']);
});
async function fakeOwner(env){const production=path.join(env.root,'.runtime/browser/production'),id=unpackedExtensionId(path.join(env.original,'autofill-extension')),manifest=JSON.parse(await fs.readFile(path.join(env.root,'autofill-extension/manifest.json'),'utf8'));await fs.mkdir(path.join(production,'Default/Local Extension Settings',id),{recursive:true});await fs.writeFile(path.join(production,'Default/Preferences'),JSON.stringify({extensions:{settings:{[id]:{path:path.join(env.original,'autofill-extension'),location:8}}}}));await fs.writeFile(path.join(production,'private-fixture'),'Fictional login bytes');return production;}
test('interrupted rollback resumes after moving the profile aside or after restoring it before journal completion',async t=>{
 for(const layout of ['moved-aside','restored']){const env=await installation(t),production=await fakeOwner(env);await assert.rejects(()=>runUpdate(bundle,env.root,{...fakeOptions,failAfterWrite:true}));const updates=path.join(env.root,'.runtime/updates'),name=(await fs.readdir(updates)).find(n=>n.startsWith('txn-')),txn=path.join(updates,name),journal=JSON.parse(await fs.readFile(path.join(txn,'journal.json'),'utf8'));journal.phase='writing';await fs.writeFile(path.join(txn,'journal.json'),JSON.stringify(journal));
  if(layout==='moved-aside'){await fs.rm(path.join(txn,'profile-before-recovery'),{recursive:true});await fs.rename(production,path.join(txn,'profile-before-recovery'));}
  await runUpdate(bundle,env.root,fakeOptions);assert.equal(await fs.readFile(path.join(production,'private-fixture'),'utf8'),'Fictional login bytes');
 }
});
test('corrupted backup fails recovery before deleting a valid profile and restore never becomes an update',async t=>{
 const env=await installation(t),production=await fakeOwner(env);await assert.rejects(()=>runUpdate(bundle,env.root,{...fakeOptions,failAfterWrite:true}));const updates=path.join(env.root,'.runtime/updates'),name=(await fs.readdir(updates)).find(n=>n.startsWith('txn-')),txn=path.join(updates,name),journal=JSON.parse(await fs.readFile(path.join(txn,'journal.json'),'utf8'));journal.phase='writing';await fs.writeFile(path.join(txn,'journal.json'),JSON.stringify(journal));await fs.writeFile(path.join(txn,'browser-profile/private-fixture'),'Changed backup');await assert.rejects(()=>runUpdate(bundle,env.root,fakeOptions),/BACKUP_HASH/);assert.equal(await fs.readFile(path.join(production,'private-fixture'),'utf8'),'Fictional login bytes');
 const fresh=await installation(t);await assert.rejects(()=>runUpdate(bundle,fresh.root,{...fakeOptions,restore:true}),/RESTORE_UNAVAILABLE/);assert.equal(JSON.parse(await fs.readFile(path.join(fresh.root,'SOURCE.json'),'utf8')).source.commit,fresh.baseline.source);
});
