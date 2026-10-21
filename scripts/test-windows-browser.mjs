// Explicit hosted Windows test of the actual managed, visible extension browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32'||process.env.JOB_ASSISTANT_BROWSER_TEST!=='1')throw new Error('HOSTED_WINDOWS_BROWSER_REQUIRED');
const sourceRoot=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const args=process.argv.slice(2),candidate=path.resolve(args[0]||''),evidenceFile=path.join(sourceRoot,'.runtime','tests','evidence','windows-browser.json');
const relative=path.relative(path.join(sourceRoot,'.runtime'),candidate);
assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'CONTROLLED_CANDIDATE_REQUIRED');
const runtime=path.join(candidate,'.runtime'),BASE='http://127.0.0.1:17321',CDP='http://127.0.0.1:17323';
process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(runtime,'tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(runtime,'browsers');
const require=createRequire(path.join(candidate,'runtime-deps','package.json'));
const {chromium}=require('playwright');
const helper=path.join(sourceRoot,'scripts','test-windows-browser.ps1');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const result={status:'RUNNING',sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,platform:process.platform,node:process.version,headed:true,realExtension:true,managedBrowserInstalled:true,candidateArchiveInput:true,scenarios:[],resources:{maxConcurrentExecutionBrowsers:1,initialUIController:'Transient headed UI controller without extensions; closed after real browser-open response confirms readiness. Overlaps managed browser startup; only the managed browser executes the extension.'}};
let key,taskId,current='prepare',controller,managed,watchdog,helperSequence=0;
async function until(name,read,predicate,timeout=60_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(predicate(value))return value;await delay(200);}
  const error=new Error('BOUND_CONDITION');error.code='WAIT_TIMEOUT';error.condition=name;throw error;
}
async function helperCall(extra,timeout=100_000){
  const entryIndex=extra.indexOf('-Entry'),operation=extra.includes('-CommandOnly')?'command-'+extra[entryIndex+1]+(extra.includes('-BackendOnly')?'-backend-only':''):'process-status';
  const started=Date.now(),directory=path.join(runtime,'browser-test-helpers'),sequence=++helperSequence;
  await fs.mkdir(directory,{recursive:true});
  let stdoutFile,stderrFile,stdout='',stderr='',code,failure;
  result.lastHelper={operation,status:'RUNNING'};
  console.log('Windows browser helper: '+operation);
  try{
    stdoutFile=await fs.open(path.join(directory,sequence+'.stdout.log'),'w+');
    stderrFile=await fs.open(path.join(directory,sequence+'.stderr.log'),'w+');
    // A long-lived server launched through CMD can inherit PowerShell's output
    // handles. Wait for this finite helper's process exit, never pipe EOF. Both
    // output levels use controlled regular files, which remain privately ignored.
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-CandidateRoot',candidate,...extra],{cwd:candidate,windowsHide:true,stdio:['ignore',stdoutFile.fd,stderrFile.fd],env:process.env});
    try{
      code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();const error=new Error('HELPER_TIMEOUT');error.code='HELPER_TIMEOUT';reject(error);},timeout);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',value=>{clearTimeout(timer);resolve(value);});});
    }catch(error){failure=error;}
    async function snapshot(file,limit){const buffer=Buffer.alloc(limit),{bytesRead}=await file.read(buffer,0,limit,0);return buffer.subarray(0,bytesRead).toString('utf8');}
    stdout=await snapshot(stdoutFile,16_000);stderr=await snapshot(stderrFile,1000);
  }finally{await stdoutFile?.close();await stderrFile?.close();}
  result.lastHelper={operation,status:failure?'TIMEOUT_OR_ERROR':code===0?'PASS':'FAIL',exitCode:code??null,elapsedMs:Date.now()-started};
  const markers=[...new Set((stdout+'\n'+stderr).match(/\b[A-Z][A-Z0-9_]+(?=:)/g)||[])].slice(0,6);
  if(failure){failure.command=operation;failure.markers=markers;throw failure;}
  if(code!==0){const error=new Error('FIXED_HELPER_FAILED');error.code='HELPER_FAILED';error.command=operation;error.markers=markers;throw error;}
  const lines=stdout.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const value=lines.reverse().find(line=>line.startsWith('{')&&line.endsWith('}'));assert.ok(value,'HELPER_RESULT_REQUIRED');return JSON.parse(value);
}
const command=async(entry,backend=false)=>{const value=await helperCall(['-CommandOnly','-Entry',entry,...(backend?['-BackendOnly']:[])]);if(value.exitCode!==0){const error=new Error('FIXED_COMMAND_FAILED');error.code='CMD_FAILED';error.command=entry;error.markers=value.markers?.slice(0,6)||[];throw error;}return value;};
const processState=()=>helperCall(['-StatusOnly']);
async function api(route='/state',body){
  if(!key){const response=await fetch(BASE,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);key=(await response.text()).match(/name="local-key" content="([A-Za-z0-9_-]+)"/)?.[1];assert.match(key,/^[A-Za-z0-9_-]{32,256}$/);}
  const response=await fetch(BASE+'/api'+route,{method:body===undefined?'GET':'POST',headers:{'X-Local-Key':key,...(body===undefined?{}:{Origin:BASE,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90_000)});
  const value=await response.json();assert.equal(response.ok,true,'ACTUAL_DASHBOARD_API_REFUSED');return value;
}
async function attach(){
  await until('managed CDP endpoint',async()=>{try{return (await fetch(CDP+'/json/version',{signal:AbortSignal.timeout(1200)})).ok;}catch{return false;}},Boolean,75_000);
  managed=await chromium.connectOverCDP(CDP,{timeout:15_000});result.browserVersion=managed.version();
  const inspector=await managed.newBrowserCDPSession();const launch=await inspector.send('Browser.getBrowserCommandLine');await inspector.detach();
  assert.ok(Array.isArray(launch.arguments));assert.equal(launch.arguments.some(arg=>/^--headless(?:=|$)/.test(arg)),false,'REAL_HEADED_CHROMIUM_REQUIRED');
  assert.ok(launch.arguments.some(arg=>arg==='--load-extension='+path.join(candidate,'autofill-extension')),'REAL_EXTENSION_LAUNCH_REQUIRED');
  const context=managed.contexts()[0];assert.ok(context);
  const page=context.pages().find(page=>page.url().startsWith(BASE))||await until('actual managed dashboard',async()=>context.pages().find(page=>page.url().startsWith(BASE)),Boolean);
  return {context,page};
}
async function connected(){return until('actual extension heartbeat',()=>api(),state=>state.connection.connected&&typeof state.connection.profileId==='string'&&state.connection.profileId.length>8,75_000);}
async function assertStopped(captured){
  await until('owned browser and launcher leave',processState,state=>state.ownedLaunchers.length===0&&state.ownedChrome.length===0);
  const gone=await helperCall(['-StatusOnly',...(captured.length?['-RememberedPids',captured.join(',')]:[])]);assert.equal(gone.rememberedAlive,0,'CAPTURED_PROJECT_PROCESSES_REMAIN');assert.equal(gone.ownedServers.length,0,'MANAGED_SERVER_REMAINS');
  for(const port of [17321,17322,17323]){
    const open=await new Promise(resolve=>{import('node:net').then(({connect})=>{const socket=connect({host:'127.0.0.1',port});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});});
    assert.equal(open,false,'PROJECT_PORT_REMAINS');
  }
  managed=null;
}
async function scenario(name,body){current=name;await body();result.scenarios.push({name,status:'PASS'});console.log('PASS '+name);}
async function run(){
  await scenario('backend-only to real management UI opens one connected managed execution browser',async()=>{
    const started=await command('start',true);assert.equal(started.exitCode,0);
    await api('/action',{action:'demo'});const added=await api('/action',{action:'add',url:'http://127.0.0.1:17322/site/alpha/jobs/cpp-002'});taskId=added.task.id;await api('/action',{action:'pause'});
    const before=await processState();assert.equal(before.ownedLaunchers.length,0);assert.equal(before.ownedChrome.length,0);
    controller=await chromium.launch({headless:false,channel:'chromium',args:['--no-first-run']});
    const context=await controller.newContext(),page=await context.newPage();await page.goto(BASE);
    assert.equal(context.serviceWorkers().length,0,'INITIAL_CONTROLLER_MUST_NOT_HAVE_EXTENSION');
    const response=page.waitForResponse(response=>response.url()===BASE+'/api/action'&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='browser-open',{timeout:50_000});
    await page.getByRole('button',{name:'打开投递浏览器',exact:true}).click();const opened=await response;assert.equal(opened.ok(),true);assert.deepEqual(await opened.json(),{ok:true,ready:true});
    await controller.close();controller=null;
    const live=await connected();assert.equal(live.tasks.find(task=>task.id===taskId)?.id,taskId);
    const {context:execution,page:dashboard}=await attach();
    assert.ok(execution.pages().some(page=>/^chrome-extension:\/\/[a-p]{32}\/runner\/index\.html$/.test(page.url())),'ACTUAL_EXTENSION_RUNNER_REQUIRED');
    await dashboard.locator('#connect-button').waitFor();
    const owned=await processState();assert.equal(owned.ownedLaunchers.length,1);assert.ok(owned.ownedChrome.length>=1);assert.equal(owned.chromeRoots.length,1,'ONE_EXECUTION_BROWSER_ROOT_REQUIRED');
    const ready=await until('managed browser ready marker',async()=>{try{return JSON.parse(await fs.readFile(path.join(runtime,'browser.ready.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}},value=>value?.ready===true,10_000);assert.equal(ready.pid,owned.ownedLaunchers[0]);
    result.uiFirstOpen={actualUIButton:true,initialControllerWithoutExtension:true,extensionConnected:true,managedLauncherCount:1,actualReadyMarker:true};
  });
  await scenario('UI-owned browser stops fully and backend restart preserves original task and safe pause',async()=>{
    // Resume an idle, explicitly skipped fictional task so stop must CREATE a
    // durable manual hold, rather than merely retaining the earlier API pause.
    // No runnable task remains and resume does not enqueue list discovery.
    await api('/action',{action:'task-skip',taskId});await api('/action',{action:'resume'});
    const active=await api();assert.equal(active.tasks.find(task=>task.id===taskId)?.status,'skipped');assert.equal(active.manualPaused,false);assert.equal(active.running,true);
    const owned=await processState(),captured=owned.ownedAll;assert.ok(captured.length>1);
    const stopped=await command('stop');assert.equal(stopped.exitCode,0);await assertStopped(captured);
    const stored=JSON.parse(await fs.readFile(path.join(runtime,'data','state.json'),'utf8'));assert.equal(stored.tasks.find(task=>task.id===taskId)?.id,taskId);assert.equal(stored.paused,true);assert.equal(stored.running,false);assert.equal(stored.manualPaused,true);
    await command('start',true);const restarted=await api();assert.equal(restarted.tasks.find(task=>task.id===taskId)?.id,taskId);assert.equal(restarted.paused,true);assert.equal(restarted.manualPaused,true);assert.equal(restarted.profile.version,1);assert.equal(restarted.resume.version,1);
    await command('stop');await assertStopped([]);
    result.uiStopRestart={managedProcessesGone:true,portsReleased:true,sameTask:true,safePause:true,stopCreatedManualHold:true,idleResumeHadNoRunnableTasks:true,versionsRetained:true};
  });
  await scenario('CMD starts actual managed browser and repeated real UI opening reuses the same instance',async()=>{
    const started=await command('start');assert.equal(started.exitCode,0);await connected();const {page}=await attach();
    const before=await processState();assert.equal(before.ownedLaunchers.length,1);assert.ok(before.ownedChrome.length>=1);assert.equal(before.chromeRoots.length,1,'ONE_EXECUTION_BROWSER_ROOT_REQUIRED');
    const response=page.waitForResponse(response=>response.url()===BASE+'/api/action'&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='browser-open');
    await page.getByRole('button',{name:'打开投递浏览器',exact:true}).click();assert.equal((await response).ok(),true);
    await delay(1000);const after=await processState();assert.deepEqual(after.ownedLaunchers,before.ownedLaunchers);assert.deepEqual(after.chromeRoots,before.chromeRoots);assert.equal(after.ownedLaunchers.length,1);
    const state=await connected();assert.equal(state.tasks.find(task=>task.id===taskId)?.id,taskId);assert.equal(state.paused,true);
    result.cmdRepeat={actualCMDStart:true,actualUIRepeat:true,sameLauncher:true,sameChromiumRoot:true,managedLauncherCount:1,extensionConnected:true};
  });
  await scenario('CMD-owned managed browser and launcher close without project survivors',async()=>{
    const owned=await processState(),captured=owned.ownedAll;const stopped=await command('stop');assert.equal(stopped.exitCode,0);await assertStopped(captured);
    const stored=JSON.parse(await fs.readFile(path.join(runtime,'data','state.json'),'utf8'));assert.equal(stored.tasks.find(task=>task.id===taskId)?.id,taskId);assert.equal(stored.paused,true);assert.equal(stored.running,false);
    // This lifecycle journey never visits a fixture page. The fixture creates
    // its persisted ledger only when it creates a session or receives a write,
    // so an absent ledger is valid. Do not manufacture one or claim HTTP counts.
    let fixtureLedger='absent';
    try{
      const fixture=JSON.parse(await fs.readFile(path.join(runtime,'data','fixture','fixture-state.json'),'utf8'));
      assert.equal(fixture.submitRequests.length,0);assert.equal(Object.keys(fixture.receipts).length,0);fixtureLedger='present-empty';
    }catch(error){if(error.code!=='ENOENT')throw error;}
    assert.equal(stored.tasks.some(task=>task.submissionStarted===true),false);
    result.cmdStop={managedProcessesGone:true,portsReleased:true,sameTask:true,safePause:true,persistedFixtureLedger:fixtureLedger,storedSubmissionFlagsClear:true};
  });
  result.status='PASS';
}
try{await Promise.race([run(),new Promise((_,reject)=>{watchdog=setTimeout(()=>{const error=new Error('WINDOWS_BROWSER_GROUP_TIMEOUT');error.code='GROUP_TIMEOUT';reject(error);},420_000);})]);}
catch(error){result.status='FAIL';process.exitCode=1;result.failure={scenario:current,type:error.name,code:error.code||null,condition:error.condition||null,command:error.command||null,helper:result.lastHelper,markers:error.markers||[],frames:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)};}
finally{
  clearTimeout(watchdog);try{await controller?.close();}catch{}
  try{await command('stop');const remaining=await processState();assert.equal(remaining.ownedLaunchers.length,0);assert.equal(remaining.ownedChrome.length,0);result.managedCleanup=true;}catch{result.managedCleanup=false;result.status='FAIL';process.exitCode=1;}
  await fs.mkdir(path.dirname(evidenceFile),{recursive:true});await fs.writeFile(evidenceFile,JSON.stringify(result,null,2));
  const publicResult=JSON.stringify(result).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');assert.ok(Buffer.byteLength(publicResult)<3750);
  console.log('::'+(result.status==='PASS'?'notice':'error')+' title=Windows managed browser scenarios::'+publicResult);
}
