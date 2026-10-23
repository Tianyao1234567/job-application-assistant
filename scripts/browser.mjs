import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {canonical,persistentStorage} from '../autofill-extension/shared/migration.js';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const runtime=path.join(root,'.runtime');
for(const name of ['tmp','downloads','browsers','browser/production']) await fs.mkdir(path.join(runtime,name),{recursive:true});
process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(runtime,'tmp');
process.env.npm_config_cache=path.join(runtime,'cache');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(runtime,'browsers');
const require=createRequire(path.join(root,'runtime-deps','package.json'));
const {chromium}=require('playwright');
const extension=path.join(root,'autofill-extension');
const stopFile=path.join(runtime,'browser.stop'),readyFile=path.join(runtime,'browser.ready.json'),pidFile=path.join(runtime,'browser.pid');
const browserTest=process.env.GITHUB_ACTIONS==='true' && process.env.JOB_ASSISTANT_BROWSER_TEST==='1';
const installationFile=path.join(runtime,'installation.json');
let installation;
try{installation=JSON.parse(await fs.readFile(installationFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
// This debugging endpoint exists only in an explicitly isolated hosted test copy.
if(browserTest && !root.includes(path.sep+'.runtime'+path.sep)) throw new Error('BROWSER_TEST_ISOLATION_REQUIRED');
const testArgs=browserTest ? ['--remote-debugging-address=127.0.0.1','--remote-debugging-port=17323'] : [];
await fs.rm(readyFile,{force:true});
let context,closed=false,closing=false;
async function close(){
  closing=true;
  if(context && !closed) await context.close().catch(()=>{});
}
const stopTimer=setInterval(async()=>{try{await fs.access(stopFile);}catch{return;}await close();},200);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void close();});
try{
  const started=Date.now();
  const readyDeadline=started+30000;
  const remaining=()=>Math.max(1,readyDeadline-Date.now());
  context=await chromium.launchPersistentContext(path.join(runtime,'browser','production'),{
    headless:false,channel:'chromium',timeout:20000,downloadsPath:path.join(runtime,'downloads'),
    artifactsDir:path.join(runtime,'tmp'),env:{...process.env},
    args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--no-first-run','--disable-breakpad','--disable-crash-reporter',...testArgs],
  });
  context.once('close',()=>{closed=true;});
  if(installation?.migration?.pending){
    const migration=installation.migration;
    const worker=context.serviceWorkers().find(w=>w.url()===`chrome-extension://${migration.extensionId}/background.js`)||await context.waitForEvent('serviceworker',{predicate:w=>w.url()===`chrome-extension://${migration.extensionId}/background.js`,timeout:remaining()});
    const data=await worker.evaluate(()=>chrome.storage.local.get(null));
    if(data.localBridge?.profileId!==migration.profileId||createHash('sha256').update(canonical(persistentStorage(data))).digest('hex')!==migration.storageHash)throw new Error('MIGRATION_STORAGE_MISMATCH');
    // Keep task execution held while a new runner establishes a real heartbeat.
    const runner=await context.newPage();await runner.goto(`chrome-extension://${migration.extensionId}/runner/index.html`,{timeout:remaining()});
  }
  const downloads=page=>page.on('download',download=>download.saveAs(path.join(runtime,'downloads',path.basename(download.suggestedFilename()))).catch(()=>{}));
  context.on('page',downloads);
  for(const page of context.pages())downloads(page);
  if(closing) await close();
  else{
    const page=context.pages()[0] || await context.newPage();
    await page.goto('http://127.0.0.1:17321/?autoconnect=1',{timeout:remaining()});
    const isRunner=page=>/^chrome-extension:\/\/[a-p]{32}\/runner\/index\.html$/.test(page.url());
    // A newly-created extension tab may still be about:blank when the page event
    // fires. Observe its eventual URL instead of losing that one event forever.
    let runner;
    while(!runner && Date.now()<readyDeadline && !closing){
      runner=context.pages().find(isRunner);
      if(!runner)await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!runner)throw new Error('EXTENSION_RUNNER_REQUIRED');
    let profileId;
    while(!profileId && Date.now()<readyDeadline){
      profileId=await runner.evaluate(async()=> (await chrome.storage.local.get('localBridge')).localBridge?.profileId).catch(()=>undefined);
      if(!profileId)await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(typeof profileId!=='string' || !profileId)throw new Error('EXTENSION_PROFILE_REQUIRED');
    // A PID or visible window is insufficient: await a fresh real extension heartbeat.
    // The local pairing key stays inside the dashboard and is never printed or saved here.
    await page.waitForFunction(async ({since,profileId})=>{
      const key=document.querySelector('meta[name="local-key"]')?.content;
      if(!key)return false;
      try{
        const response=await fetch('/api/state',{headers:{'X-Local-Key':key},cache:'no-store'});
        if(!response.ok)return false;
        const state=await response.json();
        return state.connection?.connected===true && state.connection.profileId===profileId && Date.parse(state.connection.lastSeen)>=since;
      }catch{return false;}
    },{since:started,profileId},{timeout:remaining()});
    const actualId=new URL(runner.url()).hostname;
    if(installation?.migration){
      if(profileId!==installation.migration.profileId||actualId!==installation.migration.extensionId)throw new Error('MIGRATION_IDENTITY_MISMATCH');
      await page.waitForFunction(async ({id,since,hold})=>{const key=document.querySelector('meta[name="local-key"]').content;const state=await(await fetch('/api/state',{headers:{'X-Local-Key':key},cache:'no-store'})).json();return state.connection.extensionId===id&&(!hold||state.manualPaused===true)&&Date.parse(state.connection.lastSeen)>=since;},{id:actualId,since:started,hold:installation.migration.pending===true},{timeout:remaining()});
      if(installation.migration.pending){const worker=context.serviceWorkers().find(w=>new URL(w.url()).hostname===actualId);await worker.evaluate(()=>chrome.storage.local.remove('localMigrationHold'));installation.migration.pending=false;installation.migration.verifiedAt=new Date().toISOString();await fs.writeFile(installationFile+'.next',JSON.stringify(installation,null,2));await fs.rename(installationFile+'.next',installationFile);}
    }
    if(!closing && !closed)await fs.writeFile(readyFile,JSON.stringify({pid:process.pid,ready:true,extensionConnected:true,profileId,extensionId:actualId,migrationVerified:installation?.migration?.pending===false,headless:false}),{mode:0o600});
    while(!closed && !closing)await new Promise(resolve=>setTimeout(resolve,200));
  }
}catch(error){
  if(!closing){console.error('BROWSER_START_FAILED: 专用浏览器或真实扩展连接未就绪。'+(error?.name==='TimeoutError'?' READY_TIMEOUT':''));process.exitCode=1;}
}finally{
  clearInterval(stopTimer);
  await close();
  try{if(JSON.parse(await fs.readFile(readyFile,'utf8')).pid===process.pid)await fs.rm(readyFile,{force:true});}catch{}
  try{if((await fs.readFile(pidFile,'utf8')).trim()===String(process.pid))await fs.rm(pidFile,{force:true});}catch{}
  await fs.rm(stopFile,{force:true});
}
