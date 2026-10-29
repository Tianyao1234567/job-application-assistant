// Self-contained installer engine. The delivery builder embeds this committed
// source into one CMD; no updater has to be installed beforehand.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const equalPath=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
const assert=(ok,code)=>{if(!ok)throw new Error(code);};
const exists=async file=>{try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}':JSON.stringify(value);
function savedFacts(state){const data={...state};delete data.issues;data.sites=state.sites.map(site=>Object.fromEntries(Object.entries(site).filter(([key])=>key!=='login')));data.tasks=state.tasks.map(task=>Object.fromEntries(Object.entries(task).filter(([key])=>!['status','phase','steps','updatedAt','issue'].includes(key))));return data;}
export function holdOfflineState(original){
 const state=structuredClone(original);state.manualPaused=true;state.paused=true;state.running=false;
 for(const task of state.tasks){
  const boundary=task.submissionStarted===true||['submitting','submitted','unknown'].includes(task.status)||Object.hasOwn(task,'submitDay')||Object.hasOwn(task,'submittedAt')||!!task.result?.receiptId||['verify','done'].includes(task.phase)||task.issue?.kind==='unknown'||state.issues?.some(issue=>issue.taskId===task.id&&issue.kind==='unknown')||(task.steps||[]).some(step=>['提交阶段已记录','提交回执未确认','已核对接收记录','核对接收结果'].includes(step.label)||step.label==='重启恢复'&&step.detail?.includes('提交阶段已持久保存'));
  if(boundary){task.submissionStarted=true;if(task.status!=='submitted'){task.status='unknown';task.phase='verify';}}
  else if(task.status==='running'){task.status='queued';task.phase='inspect';}
 }
 return state;
}
export function extensionId(manifest){return [...digest(Buffer.from(manifest.key,'base64')).slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');}
export function unpackedExtensionId(directory,platform=process.platform){const bytes=Buffer.from(platform==='win32'?directory.replace(/^[a-z](?=:)/,c=>c.toUpperCase()):directory,platform==='win32'?'utf16le':'utf8');return [...digest(bytes).slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');}
export function verifyRestorableStorage(persistent,expectedHash){assert(/^[a-f0-9]{64}$/.test(expectedHash||'')&&digest(stable(persistent))===expectedHash,'UPDATE_RESTORE_HAS_NEW_DATA');}
export function safeRelative(name){assert(typeof name==='string'&&name.length<240&&!name.includes('\\')&&!name.includes(':')&&!name.includes('\0')&&name.split('/').every(p=>p&&p!=='.'&&p!=='..')&&!name.startsWith('.runtime/')&&!name.includes('/node_modules/'),'UPDATE_UNSAFE_PATH');return name;}
async function noLinks(root,file){let cursor=path.resolve(root);assert(equalPath(cursor,root),'UPDATE_ROOT_INVALID');const rel=path.relative(cursor,file);assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel),'UPDATE_UNSAFE_PATH');for(const part of rel.split(path.sep)){cursor=path.join(cursor,part);if(await exists(cursor))assert(!(await fs.lstat(cursor)).isSymbolicLink(),'UPDATE_LINK_REFUSED');}}
async function ordinary(root,file){await noLinks(root,file);const stat=await fs.lstat(file);assert(stat.isFile(),'UPDATE_FILE_REQUIRED');return fs.readFile(file);}
async function atomic(file,bytes){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.update-'+crypto.randomUUID();try{await fs.writeFile(temp,bytes,{mode:0o600,flag:'wx'});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}}
async function saveJSON(file,value){await atomic(file,JSON.stringify(value,null,2)+'\n');}
async function treeFiles(root){const records=[];if(!await exists(root))return records;assert(!(await fs.lstat(root)).isSymbolicLink(),'UPDATE_LINK_REFUSED');async function visit(dir,prefix=''){for(const entry of await fs.readdir(dir,{withFileTypes:true})){assert(!entry.isSymbolicLink(),'UPDATE_LINK_REFUSED');const name=prefix+entry.name,target=path.join(dir,entry.name);if(entry.isDirectory())await visit(target,name+'/');else{assert(entry.isFile(),'UPDATE_FILE_REQUIRED');const bytes=await fs.readFile(target);records.push({path:name,bytes:bytes.length,sha256:digest(bytes)});}}}await visit(root);return records.sort((a,b)=>a.path.localeCompare(b.path));}
export function validateBundle(bundle){
 assert(bundle?.format===1&&/^[a-f0-9]{40}$/.test(bundle.target?.source||'')&&Array.isArray(bundle.target.files)&&bundle.target.files.length>40&&bundle.target.files.length<100&&Array.isArray(bundle.baselines)&&bundle.baselines.length>=2&&bundle.baselines.length<=3,'UPDATE_PACKAGE_INVALID');
 const names=new Set();for(const file of bundle.target.files){safeRelative(file.path);assert(!names.has(file.path)&&/^[a-f0-9]{64}$/.test(file.sha256),'UPDATE_PACKAGE_INVALID');names.add(file.path);}
 for(const [name,value]of Object.entries(bundle.changes||{})){assert(names.has(safeRelative(name)),'UPDATE_UNSAFE_PATH');const file=bundle.target.files.find(f=>f.path===name),bytes=Buffer.from(value,'base64');assert(bytes.length===file.bytes&&digest(bytes)===file.sha256,'UPDATE_PAYLOAD_HASH');}
 for(const baseline of bundle.baselines){assert(/^[a-f0-9]{40}$/.test(baseline.source)&&Array.isArray(baseline.files),'UPDATE_PACKAGE_INVALID');for(const file of baseline.files)safeRelative(file.path);}
 assert(bundle.changes['autofill-extension/manifest.json']&&bundle.changes['scripts/update-install.mjs'],'UPDATE_PACKAGE_INVALID');return bundle;
}
export async function installedBaseline(root,bundle){
 const source=await json(path.join(root,'SOURCE.json')).catch(()=>null);assert(source&&source.source,'UPDATE_WRONG_DIRECTORY');
 const sourceCommit=typeof source.source==='string'?source.source:source.source.commit;
 const baseline=[...bundle.baselines,bundle.target].find(b=>b.source===sourceCommit);assert(baseline,'UPDATE_BASELINE_UNSUPPORTED');
 assert(source.version===baseline.version,'UPDATE_BASELINE_UNSUPPORTED');
 for(const file of baseline.files){const bytes=await ordinary(root,path.join(root,file.path));assert(bytes.length===file.bytes&&digest(bytes)===file.sha256,'UPDATE_BASELINE_CHANGED');}
 return baseline;
}
export async function relocateState(root,state){
 assert(state&&state.schema===2&&Array.isArray(state.tasks),'UPDATE_STATE_INVALID');const next=structuredClone(state),roots=new Set();let changed=0;
 for(const record of [next.resume,...next.tasks.map(t=>t.resumeSnapshot)].filter(Boolean)){
  assert(/^[a-f0-9]{64}$/.test(record.sha256||'')&&Number.isInteger(record.size)&&record.size>0&&Number.isInteger(record.version)&&typeof record.file==='string','UPDATE_ATTACHMENT_INVALID');
  const flavor=/^[a-z]:[\\/]|^\\\\/i.test(record.file)?path.win32:path.posix;
  const original=flavor.normalize(record.file),suffix=flavor.join('.runtime','data','resumes',record.sha256+'.bin');
  assert(flavor.isAbsolute(record.file)&&original.endsWith(flavor.sep+suffix)&&record.file===original,'UPDATE_ATTACHMENT_OUTSIDE');
  const oldRoot=original.slice(0,-suffix.length-1);roots.add(process.platform==='win32'?oldRoot.toLowerCase():oldRoot);
  const target=path.join(root,'.runtime/data/resumes',record.sha256+'.bin'),bytes=await ordinary(root,target);
  assert(bytes.length===record.size&&digest(bytes)===record.sha256,'UPDATE_ATTACHMENT_HASH');
  if(!equalPath(record.file,target)){record.file=target;changed++;}
 }
 assert(roots.size<=1,'UPDATE_MIXED_ROOTS');return {state:next,oldRoot:roots.values().next().value||null,changed};
}
export function windowsArguments(text){const args=[];let word='',quote=false,active=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='\\'){let n=0;while(text[i]==='\\'){n++;i++;}if(text[i]==='"'){word+='\\'.repeat(Math.floor(n/2));if(n%2)word+='"';else quote=!quote;active=true;}else{word+='\\'.repeat(n);i--;}continue;}if(c==='"'){quote=!quote;active=true;}else if(/\s/.test(c)&&!quote){if(active||word){args.push(word);word='';active=false;}}else{word+=c;active=true;}}if(active||word)args.push(word);return args;}
export function verifyInventory(rows){assert(Array.isArray(rows)&&rows.every(row=>Number.isInteger(row.ProcessId)&&row.ProcessId>0&&typeof row.CommandLine==='string'&&row.CommandLine.trim()&&typeof row.ExecutablePath==='string'&&row.ExecutablePath),'UPDATE_PROCESS_UNVERIFIED');return rows;}
function inventory(){assert(process.platform==='win32','UPDATE_WINDOWS_REQUIRED');const script="$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='chrome.exe'\" | Select-Object ProcessId,Name,ExecutablePath,CommandLine) | ConvertTo-Json -Compress";const reply=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,timeout:20000});assert(reply.status===0,'UPDATE_PROCESS_UNVERIFIED');const value=JSON.parse(reply.stdout||'[]'),rows=verifyInventory(Array.isArray(value)?value:[value]);assert(rows.some(row=>row.ProcessId===process.pid&&equalPath(row.ExecutablePath,process.execPath)),'UPDATE_PROCESS_UNVERIFIED');return rows;}
export function projectProcess(row,root){const args=windowsArguments(row.CommandLine||'');return ['scripts/windows-service.mjs','scripts/browser.mjs'].some(entry=>args.length===2&&equalPath(args[1],path.join(root,entry))&&row.ExecutablePath)||args.some(a=>a.startsWith('--user-data-dir=')&&equalPath(a.slice(16),path.join(root,'.runtime/browser/production')));}
async function portsFree(){for(const port of [17321,17322])await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(new Error('UPDATE_PORT_BUSY')));server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
export async function requireStopped(root,oldRoots=[],{stop=true}={}){
 let rows=inventory();for(const name of ['server','browser']){const file=path.join(root,'.runtime',name+'.pid');if(await exists(file)){const id=Number((await fs.readFile(file,'utf8')).trim()),row=rows.find(p=>p.ProcessId===id);if(row)assert(projectProcess(row,root),'UPDATE_OLD_PROCESS_ACTIVE');}}
 if(rows.some(r=>projectProcess(r,root))&&stop){const reply=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/stop.ps1')],{windowsHide:true,stdio:'ignore',timeout:80000});assert(reply.status===0,'UPDATE_STOP_FAILED');rows=inventory();}
 assert(!rows.some(row=>[root,...oldRoots.filter(Boolean)].some(owner=>projectProcess(row,owner))),'UPDATE_OLD_PROCESS_ACTIVE');await portsFree();return {verified:true};
}
export async function extensionOwner(root,oldRoot){
 const production=path.join(root,'.runtime/browser/production'),preferences=path.join(production,'Default/Preferences');
 await noLinks(root,preferences);
 if(!await exists(preferences)){assert(!(await exists(path.join(production,'Default/Local Extension Settings'))),'UPDATE_EXTENSION_OWNER');return null;}
 const prefs=[await json(preferences)];const secure=path.join(production,'Default/Secure Preferences');await noLinks(root,secure);if(await exists(secure))prefs.push(await json(secure));
 const current=await json(path.join(root,'autofill-extension/manifest.json'));
 // Chromium deliberately omits cached manifests for unpacked/command-line
 // extensions. The verified baseline supplies the manifest; the cold storage
 // probe must independently match this installation's pairing key and identity.
 const entries=[...new Map(prefs.flatMap(pref=>Object.entries(pref.extensions?.settings||{})).filter(([id,item])=>/^[a-p]{32}$/.test(id)&&[4,8].includes(item.location)&&typeof item.path==='string'&&path.isAbsolute(item.path)&&path.basename(item.path)==='autofill-extension'&&id===(current.key?extensionId(current):unpackedExtensionId(item.path))&&(!item.manifest||Object.keys(item.manifest).length===0||item.manifest.name===current.name&&item.manifest.version===current.version)&&(!oldRoot||[root,oldRoot].some(r=>equalPath(item.path,path.join(r,'autofill-extension')))))).entries()];
 assert(entries.length===1,'UPDATE_EXTENSION_OWNER');const [id,entry]=entries[0];
 const storage=path.join(production,'Default/Local Extension Settings',id);await noLinks(root,storage);assert(await exists(storage),'UPDATE_EXTENSION_STORAGE_MISSING');await treeFiles(storage);
 return {id,storage,production,oldRoot:path.dirname(entry.path)};
}
export async function prepareExtension(root,txn,bundle,owner,state,{inspectHash}={}){
 if(!owner){assert(!state.tasks.some(t=>t.executionProfileId),'UPDATE_EXTENSION_STORAGE_MISSING');return null;}
 const extension=path.join(txn,'extension');for(const file of bundle.target.files.filter(f=>f.path.startsWith('autofill-extension/'))){const bytes=bundle.changes[file.path]?Buffer.from(bundle.changes[file.path],'base64'):await ordinary(root,path.join(root,file.path));await fs.mkdir(path.dirname(path.join(txn,file.path)),{recursive:true});await fs.writeFile(path.join(txn,file.path),bytes);}
 // The staged extension contains exactly the target blobs, at its pinned ID.
 await fs.rename(path.join(txn,'autofill-extension'),extension);
 const manifest=await json(path.join(extension,'manifest.json')),id=extensionId(manifest),profile=path.join(txn,'probe-profile'),target=path.join(profile,'Default/Local Extension Settings',id);
 const destination=path.join(owner.production,'Default/Local Extension Settings',id);
 if(id!==owner.id)assert(!await exists(destination),'UPDATE_EXTENSION_DESTINATION_CONFLICT');
 const originalTree=await treeFiles(owner.storage);await fs.mkdir(path.dirname(target),{recursive:true});await fs.cp(owner.storage,target,{recursive:true});assert(JSON.stringify(await treeFiles(target))===JSON.stringify(originalTree),'UPDATE_STORAGE_COPY_HASH');
 process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.runtime/browsers');process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(root,'.runtime/tmp');
 const require=createRequire(path.join(root,'runtime-deps/package.json'));assert(require('playwright/package.json').version==='1.58.2','UPDATE_BROWSER_DEPENDENCY');const {chromium}=require('playwright');
 let context;try{
  context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chromium',timeout:25000,env:{...process.env},args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--no-first-run']});
  await context.route('https://**/*',route=>route.abort());
  const worker=context.serviceWorkers().find(w=>w.url()==='chrome-extension://'+id+'/background.js')||await context.waitForEvent('serviceworker',{predicate:w=>w.url()==='chrome-extension://'+id+'/background.js',timeout:15000});
  const original=await worker.evaluate(()=>chrome.storage.local.get(null));
  assert(original.localBridge?.profileId&&original.localBridge.key===(await fs.readFile(path.join(root,'.runtime/data/local-key'),'utf8')).trim(),'UPDATE_EXTENSION_IDENTITY');
  assert(state.tasks.every(t=>!t.executionProfileId||t.executionProfileId===original.localBridge.profileId),'UPDATE_EXTENSION_IDENTITY');
  const {migrateStorage,persistentStorage,canonical}=await import(pathToFileURL(path.join(extension,'shared/migration.js')).href);
  if(inspectHash){verifyRestorableStorage(persistentStorage(original),inspectHash);return {inspected:true};}
  const data=migrateStorage(original,{id:path.basename(txn),fromExtensionId:owner.id,toExtensionId:id,at:new Date().toISOString()});
  await worker.evaluate(async data=>{await chrome.storage.local.set({localMigrationHold:true});await chrome.storage.local.clear();await chrome.storage.local.set(data);},data);
  const actual=await worker.evaluate(()=>chrome.storage.local.get(null));assert(canonical(persistentStorage(actual))===canonical(persistentStorage(data)),'UPDATE_STORAGE_LOGICAL_HASH');
  return {extensionId:id,profileId:original.localBridge.profileId,storageHash:digest(canonical(persistentStorage(data))),stageStorage:target,destination,sourceId:owner.id,pending:true};
 }finally{await context?.close();}
}
async function inspectExtensionForRestore(root,txn,bundle,migration,state){
 const manifest=JSON.parse(Buffer.from(bundle.changes['autofill-extension/manifest.json'],'base64'));
 assert(migration.extensionId===extensionId(manifest),'UPDATE_RECOVERY_MISMATCH');
 const production=path.join(root,'.runtime/browser/production'),storage=path.join(production,'Default/Local Extension Settings',migration.extensionId);await noLinks(root,storage);assert(await exists(storage),'UPDATE_EXTENSION_STORAGE_MISSING');
 // Keep Chromium/LevelDB below Windows path limits even when the transaction
 // already lives under a long installation path.
 const probe=await fs.mkdtemp(path.join(root,'.runtime/updates/check-'));
 await prepareExtension(root,probe,bundle,{id:migration.extensionId,production,storage},state,{inspectHash:migration.storageHash});
}
// Recovery may run days after an interruption. A phase name cannot prove that
// the old application has not since saved new facts or extension records.
async function guardAutomaticRecovery(root,txn,journal,bundle){
 assert(journal.source===bundle.target.source&&equalPath(journal.root,root),'UPDATE_RECOVERY_MISMATCH');
 const encoded=journal.backup?.['.runtime/data/state.json'];assert(typeof encoded==='string','UPDATE_RECOVERY_MISMATCH');
 const bytes=Buffer.from(encoded,'base64');assert(digest(bytes)===journal.backupHashes?.['.runtime/data/state.json'],'UPDATE_BACKUP_HASH');
 const prior=JSON.parse(bytes),current=await json(path.join(root,'.runtime/data/state.json'));
 const relocated=await relocateState(root,prior),expected=[prior,relocated.state];if(journal.quiescence?.kind==='verified-offline')expected.push(holdOfflineState(prior));if(journal.expectedState)expected.push(journal.expectedState);
 assert(expected.some(state=>stable(state)===stable(current)),'UPDATE_RECOVERY_HAS_NEW_DATA');
 const production=path.join(root,'.runtime/browser/production');await noLinks(root,production);
 const actual=await treeFiles(await exists(production)?production:path.join(txn,'profile-before-recovery'));
 // This is an updater-held Chromium singleton lock, not user data.
 const normalized=tree=>stable((tree||[]).filter(file=>file.path!=='lockfile'));
 assert([journal.profileTree||[],journal.expectedProfileTree].filter(Boolean).some(tree=>normalized(tree)===normalized(actual)),'UPDATE_RECOVERY_HAS_NEW_DATA');
 for(const [name,original]of Object.entries(journal.backup)){
  if(name==='.runtime/data/state.json')continue;
  assert(bundle.target.files.some(file=>file.path===name)||['SOURCE.json','.runtime/installation.json'].includes(name),'UPDATE_RECOVERY_MISMATCH');await noLinks(root,path.join(root,name));
  const currentHash=await exists(path.join(root,name))?digest(await fs.readFile(path.join(root,name))):null;
  const hashes=[original===null?null:digest(Buffer.from(original,'base64'))];
  const file=bundle.target.files.find(file=>file.path===name);if(file)hashes.push(file.sha256);
  if(name==='SOURCE.json')hashes.push(digest(JSON.stringify(bundle.target.manifest||bundle.target,null,2)+'\n'));
  if(name==='.runtime/installation.json'&&journal.expectedInstallation)hashes.push(digest(JSON.stringify(journal.expectedInstallation,null,2)+'\n'));
  assert(hashes.includes(currentHash),'UPDATE_RECOVERY_HAS_NEW_DATA');
 }
}
async function rollback(root,txn,bundle,{keepOfflineHold=false}={}){
 const file=path.join(txn,'journal.json'),journal=await json(file);assert(journal.source===bundle.target.source&&equalPath(journal.root,root),'UPDATE_RECOVERY_MISMATCH');
 const allowed=new Set([...bundle.target.files.map(f=>f.path),'SOURCE.json','.runtime/data/state.json','.runtime/installation.json']);
 for(const [name,value]of Object.entries(journal.backup)){assert(allowed.has(name),'UPDATE_RECOVERY_MISMATCH');await noLinks(root,path.join(root,name));if(value!==null)assert(digest(Buffer.from(value,'base64'))===journal.backupHashes[name],'UPDATE_BACKUP_HASH');}
 let recovery;
 if(journal.profileBackup){assert(journal.profileBackup==='browser-profile','UPDATE_RECOVERY_MISMATCH');assert(JSON.stringify(await treeFiles(path.join(txn,'browser-profile')))===JSON.stringify(journal.profileTree),'UPDATE_BACKUP_HASH');recovery=path.join(txn,'recovery-profile');await fs.rm(recovery,{recursive:true,force:true});await fs.cp(path.join(txn,'browser-profile'),recovery,{recursive:true});assert(JSON.stringify(await treeFiles(recovery))===JSON.stringify(journal.profileTree),'UPDATE_BACKUP_HASH');}
 for(const [name,value]of Object.entries(journal.backup)){const destination=path.join(root,name);if(keepOfflineHold&&name==='.runtime/data/state.json'){assert(value!==null,'UPDATE_RECOVERY_MISMATCH');await saveJSON(destination,holdOfflineState(JSON.parse(Buffer.from(value,'base64'))));continue;}if(value===null)await fs.rm(destination,{force:true});else await atomic(destination,Buffer.from(value,'base64'));}
 if(recovery){const destination=path.join(root,'.runtime/browser/production');await noLinks(root,destination);const replaced=path.join(txn,'profile-before-recovery');if(await exists(replaced)){if(await exists(destination))assert(JSON.stringify(await treeFiles(destination))===JSON.stringify(journal.profileTree),'UPDATE_RECOVERY_CONFLICT');else await fs.rename(recovery,destination);}else{await fs.rename(destination,replaced);try{await fs.rename(recovery,destination);}catch(error){await fs.rename(replaced,destination);throw error;}}}
 journal.phase='rolled-back';await saveJSON(file,journal);
}
async function runUpdateTransaction(bundle,root,{checkStopped=requireStopped,extensionPrepare=prepareExtension,extensionInspect=inspectExtensionForRestore,dependencies,failAfterWrite=false,restore=false,requireLaunchLock=()=>{},offlineProof=()=>false,beforeProfileRestore=async()=>{},afterProfileRestore=async()=>{}}={}){
 validateBundle(bundle);root=path.resolve(root);assert(!(await fs.lstat(root)).isSymbolicLink(),'UPDATE_LINK_REFUSED');
 const updates=path.join(root,'.runtime/updates');await noLinks(root,updates);
 const restoring=restore?await json(path.join(root,'.runtime/installation.json')).catch(()=>null):null;
 if(restore)assert(restoring?.migration?.pending===true&&!restoring.migration.verifiedAt,'UPDATE_RESTORE_UNAVAILABLE');
 if(await exists(updates))for(const entry of await fs.readdir(updates,{withFileTypes:true})){if(!entry.isDirectory()||!/^txn-[a-f0-9-]+$/.test(entry.name))continue;const txn=path.join(updates,entry.name);if(!await exists(path.join(txn,'journal.json')))continue;const journal=await json(path.join(txn,'journal.json'));if(['prepared','writing'].includes(journal.phase)||restore&&journal.phase==='committed'&&restoring.backup===entry.name){if(restore){const current=await json(path.join(root,'.runtime/data/state.json')),original=JSON.parse(Buffer.from(journal.backup['.runtime/data/state.json'],'base64'));const normalized=await relocateState(root,journal.quiescence?.kind==='verified-offline'?holdOfflineState(original):original);assert(stable(savedFacts(current))===stable(savedFacts(normalized.state)),'UPDATE_RESTORE_HAS_NEW_DATA');}else await guardAutomaticRecovery(root,txn,journal,bundle);await checkStopped(root,[journal.oldRoot],{stop:false});if(restore)await extensionInspect(root,txn,bundle,restoring.migration,await json(path.join(root,'.runtime/data/state.json')));requireLaunchLock();await beforeProfileRestore();await rollback(root,txn,bundle,{keepOfflineHold:journal.quiescence?.kind==='verified-offline'});await afterProfileRestore();if(restore)return {restored:true};}}
 if(restore)throw new Error('UPDATE_RESTORE_UNAVAILABLE');
 const baseline=await installedBaseline(root,bundle),stateFile=path.join(root,'.runtime/data/state.json');
 const prior=await json(stateFile),relocation=await relocateState(root,prior),installationFile=path.join(root,'.runtime/installation.json'),installation=await json(installationFile).catch(()=>null);
 if(baseline.source===bundle.target.source&&installation?.source===bundle.target.source&&equalPath(installation.root,root)&&!relocation.changed)return {alreadyCurrent:true,pending:installation.migration?.pending===true};
 const owner=await extensionOwner(root,relocation.oldRoot);
 await checkStopped(root,[relocation.oldRoot,owner?.oldRoot]);
 const stopped=await json(stateFile),normalStop=stopped.manualPaused===true&&stopped.paused===true&&stopped.running===false&&await exists(path.join(root,'.runtime/server.stopped'));
 const offline=!normalStop;assert(normalStop||stopped.paused===true&&stopped.running===false&&offlineProof(),'UPDATE_NORMAL_STOP_REQUIRED');
 const relocated=await relocateState(root,offline?holdOfflineState(stopped):stopped);
 const txn=path.join(updates,'txn-'+crypto.randomUUID());await fs.mkdir(txn,{recursive:true});
 const journal={format:1,root,oldRoot:relocated.oldRoot,source:bundle.target.source,phase:'prepared',backup:{},backupHashes:{}};
 for(const name of [...Object.keys(bundle.changes),'SOURCE.json','.runtime/data/state.json','.runtime/installation.json']){await noLinks(root,path.join(root,name));journal.backup[name]=await exists(path.join(root,name))?(await fs.readFile(path.join(root,name))).toString('base64'):null;if(journal.backup[name]!==null)journal.backupHashes[name]=digest(Buffer.from(journal.backup[name],'base64'));}
 if(owner){await fs.cp(owner.production,path.join(txn,'browser-profile'),{recursive:true});journal.profileTree=await treeFiles(owner.production);assert(JSON.stringify(journal.profileTree)===JSON.stringify(await treeFiles(path.join(txn,'browser-profile'))),'UPDATE_BACKUP_HASH');journal.profileBackup='browser-profile';}
 if(offline){journal.quiescence={kind:'verified-offline',at:new Date().toISOString(),processesAbsent:true,portsFree:true,profileLocked:true};journal.expectedState=relocated.state;}
 await saveJSON(path.join(txn,'journal.json'),journal);
 try{
  if(offline)await saveJSON(stateFile,relocated.state);
  const migration=await extensionPrepare(root,txn,bundle,owner,relocated.state);requireLaunchLock();journal.expectedState=relocated.state;
  if(migration){const prefix=path.relative(owner.production,migration.destination).split(path.sep).join('/')+'/';journal.expectedProfileTree=[...(journal.profileTree||[]).filter(file=>!file.path.startsWith(prefix)),...(await treeFiles(migration.stageStorage)).map(file=>({...file,path:prefix+file.path}))].sort((a,b)=>a.path.localeCompare(b.path));}
  journal.phase='writing';await saveJSON(path.join(txn,'journal.json'),journal);
  for(const [name,value]of Object.entries(bundle.changes))await atomic(path.join(root,name),Buffer.from(value,'base64'));
  if(failAfterWrite)throw new Error('UPDATE_SIMULATED_FAILURE');
  await saveJSON(path.join(root,'SOURCE.json'),bundle.target.manifest||bundle.target);await saveJSON(stateFile,relocated.state);
  if(migration){await fs.rm(migration.destination,{recursive:true,force:true});await fs.mkdir(path.dirname(migration.destination),{recursive:true});await fs.cp(migration.stageStorage,migration.destination,{recursive:true});assert(JSON.stringify(await treeFiles(migration.stageStorage))===JSON.stringify(await treeFiles(migration.destination)),'UPDATE_STORAGE_COPY_HASH');delete migration.stageStorage;delete migration.destination;}
  if(dependencies)await dependencies(root);else{const {prepareDependencies}=await import(pathToFileURL(path.join(root,'scripts/prepare-deps.mjs')).href+'?update='+path.basename(txn));prepareDependencies({projectRoot:root});}
  journal.expectedInstallation={format:1,id:installation?.id||crypto.randomUUID(),root,source:bundle.target.source,migration,backup:path.basename(txn),updatedAt:new Date().toISOString()};await saveJSON(path.join(txn,'journal.json'),journal);await saveJSON(installationFile,journal.expectedInstallation);
  journal.phase='committed';await saveJSON(path.join(txn,'journal.json'),journal);return {updated:true,attachmentsRelocated:relocated.changed,pending:!!migration};
 }catch(error){await guardAutomaticRecovery(root,txn,await json(path.join(txn,'journal.json')),bundle);await beforeProfileRestore();await rollback(root,txn,bundle,{keepOfflineHold:offline});await afterProfileRestore();throw error;}
}
export async function launchLocks(root){
 if(process.platform!=='win32')return {release:async()=>{},requireHeld:()=>{},releaseProfile:async()=>{},acquireProfile:async()=>{},profileHeld:false};
 const code="$ErrorActionPreference='Stop';function AcquireProfile{$script:c=$null;$p=Join-Path $env:JOB_UPDATE_LOCK_ROOT '.runtime\\browser\\production';if(Test-Path -LiteralPath $p){try{$script:c=[IO.File]::Open((Join-Path $p 'lockfile'),'OpenOrCreate','Write','Read')}catch{[Console]::WriteLine('PROFILE_BUSY');throw}}};try{$a=[IO.File]::Open((Join-Path $env:JOB_UPDATE_LOCK_ROOT '.runtime\\start.lock'),'OpenOrCreate','ReadWrite','None');$b=[IO.File]::Open((Join-Path $env:JOB_UPDATE_LOCK_ROOT '.runtime\\browser-start.lock'),'OpenOrCreate','ReadWrite','None');AcquireProfile;if($c){[Console]::WriteLine('LOCKED_PROFILE')}else{[Console]::WriteLine('LOCKED')};while($null -ne ($line=[Console]::ReadLine())){if($line -eq 'PROFILE_RELEASE'){if($c){$c.Dispose();$c=$null};[Console]::WriteLine('PROFILE_RELEASED')}elseif($line -eq 'PROFILE_ACQUIRE'){AcquireProfile;if($c){[Console]::WriteLine('PROFILE_ACQUIRED')}else{[Console]::WriteLine('PROFILE_ABSENT')}}else{break}}}finally{if($c){$c.Dispose()};if($b){$b.Dispose()};if($a){$a.Dispose()}}";
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,JOB_UPDATE_LOCK_ROOT:root},stdio:['pipe','pipe','ignore']});
 let ended=false,profileHeld=false,buffer='',waiter;
 const finished=new Promise(resolve=>{const end=()=>{ended=true;waiter?.reject(new Error('UPDATE_START_LOCK_LOST'));resolve();};child.once('close',end);child.once('error',end);});child.stdin.on('error',()=>{});
 child.stdout.on('data',data=>{buffer+=data.toString();let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);if(line==='PROFILE_BUSY')waiter?.reject(new Error('UPDATE_PROFILE_BUSY'));else if(waiter?.lines.includes(line)){profileHeld=['LOCKED_PROFILE','PROFILE_ACQUIRED'].includes(line);waiter.resolve();}}});
 const receive=lines=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('UPDATE_START_LOCK')),15000);waiter={lines,resolve:()=>{clearTimeout(timer);waiter=undefined;resolve();},reject:error=>{clearTimeout(timer);waiter=undefined;reject(error);}};if(ended)waiter.reject(new Error('UPDATE_START_LOCK_LOST'));});
 const command=async(text,lines)=>{assert(!ended,'UPDATE_START_LOCK_LOST');const pending=receive(lines);child.stdin.write(text+'\n');await pending;};
 try{await receive(['LOCKED','LOCKED_PROFILE']);}catch(error){child.kill();throw error;}
 return {get profileHeld(){return profileHeld;},requireHeld:()=>assert(!ended&&child.exitCode===null&&child.signalCode===null,'UPDATE_START_LOCK_LOST'),releaseProfile:()=>command('PROFILE_RELEASE',['PROFILE_RELEASED']),acquireProfile:()=>command('PROFILE_ACQUIRE',['PROFILE_ACQUIRED','PROFILE_ABSENT']),release:async()=>{if(!ended&&!child.stdin.destroyed)child.stdin.end('RELEASE\n');let timer;try{await Promise.race([finished,new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill();reject(new Error('UPDATE_START_LOCK'));},5000);})]);}finally{clearTimeout(timer);}}};
}
export async function runUpdate(bundle,root,options={}){
 validateBundle(bundle);root=path.resolve(root);await ordinary(root,path.join(root,'启动.cmd'));await ordinary(root,path.join(root,'SOURCE.json'));
 const updates=path.join(root,'.runtime/updates');await noLinks(root,updates);let recoverable=false;
 if(await exists(updates))for(const entry of await fs.readdir(updates,{withFileTypes:true})){if(!entry.isDirectory()||!/^txn-[a-f0-9-]+$/.test(entry.name))continue;const file=path.join(updates,entry.name,'journal.json');if(!await exists(file))continue;const journal=await json(file);if(journal.source===bundle.target.source&&equalPath(journal.root,root)&&(['prepared','writing'].includes(journal.phase)||options.restore&&journal.phase==='committed'))recoverable=true;}
 let oldRoots=[];
 if(!recoverable){const baseline=await installedBaseline(root,bundle),relocation=await relocateState(root,await json(path.join(root,'.runtime/data/state.json'))),installation=await json(path.join(root,'.runtime/installation.json')).catch(()=>null);if(baseline.source===bundle.target.source&&installation?.source===bundle.target.source&&equalPath(installation.root,root)&&!relocation.changed)return {alreadyCurrent:true,pending:installation.migration?.pending===true};const owner=await extensionOwner(root,relocation.oldRoot);oldRoots=[relocation.oldRoot,owner?.oldRoot];}
 await fs.mkdir(updates,{recursive:true});const lock=path.join(updates,'update.lock');
 if(await exists(lock)){const pid=Number(await fs.readFile(lock,'utf8'));assert(Number.isInteger(pid)&&pid>0,'UPDATE_LOCK_INVALID');let alive=true;try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}assert(!alive,'UPDATE_ALREADY_RUNNING');await fs.rm(lock);}
 const handle=await fs.open(lock,'wx');await handle.writeFile(String(process.pid));
 let gate;
 try{const check=options.checkStopped||requireStopped;await check(root,oldRoots);gate=await (options.acquireLocks||launchLocks)(root);const proof=await check(root,oldRoots,{stop:false});gate.requireHeld();return await runUpdateTransaction(bundle,root,{...options,requireLaunchLock:gate.requireHeld,offlineProof:()=>proof?.verified===true&&(!gate.profileHeld?false:true),beforeProfileRestore:gate.releaseProfile,afterProfileRestore:gate.acquireProfile});}finally{try{await gate?.release();}finally{await handle.close();await fs.rm(lock,{force:true});}}
}
if(globalThis.__JOB_UPDATE_BUNDLE){
 try{const result=await runUpdate(globalThis.__JOB_UPDATE_BUNDLE,process.env.JOB_UPDATE_ROOT,{restore:process.env.JOB_UPDATE_MODE==='--restore'});console.log(result.restored?'UPDATE_RESTORED: 已恢复更新前文件及资料。若此前刚搬目录，可整体放回原位置。':result.alreadyCurrent?'UPDATE_CURRENT: 程序已更新。请使用原“启动.cmd”；迁移待首次真实扩展连接核验。':'UPDATE_COMPLETE: 程序文件更新完成，资料与浏览器保留。请使用原“启动.cmd”，首次启动会核验扩展身份和账本。');}
 catch(error){if(process.env.GITHUB_ACTIONS==='true'&&process.env.JOB_ASSISTANT_BROWSER_TEST==='1'&&path.resolve(process.env.JOB_UPDATE_ROOT).includes(path.sep+'.runtime'+path.sep))console.error('::error title=Isolated updater diagnostic::'+String(error.stack||error).slice(-3000).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));console.error('UPDATE_FAILED: '+(/^[A-Z_]+$/.test(error.message)?error.message:'UPDATE_OPERATION_FAILED')+'。未自动启动或投递。请保留当前完整目录和备份，无需重新安装；不要手改状态、伪造停止标记或盲目恢复。若提示旧进程、端口或浏览器仍占用，先处理对应阻塞；若提示新增资料或完整性不足，不会覆盖这些资料。');process.exitCode=1;}
}
