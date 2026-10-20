// Real hosted-browser acceptance support. No Chrome API doubles or storage writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';

if(process.env.GITHUB_ACTIONS!=='true' || process.platform!=='linux')throw new Error('Run acceptance groups only in the manual GitHub-hosted Linux browser job.');
const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const {createApp}=await import('../server.mjs');
const IMAGE='mcr.microsoft.com/playwright:v1.58.2-noble@sha256:65cefd09a5e943921ecd3a6e5414c603db2eb161e9eb48f2e2ccc63486dc7dc0';
export const BASE='http://127.0.0.1:17321',FIXTURE='http://127.0.0.1:17322';
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(name,read,predicate,timeout=45_000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await read();if(predicate(value))return value;await delay(150);}
  const error=new Error('Acceptance condition timed out');error.code='WAIT_TIMEOUT';error.acceptanceWait=name;throw error;
}

export async function createAcceptance(group){
  assert.match(group,/^[a-z][a-z0-9-]{0,20}$/);
  const isolated=await testDirectory('acceptance-'+group),dataDir=path.join(isolated,'data');
  const testKey=randomBytes(24).toString('base64url'),privateMarkers=new Set([testKey]);
  const profiles=new Map(),profileIds=new Map(),results=[],httpPosts=[],fixtureEvents=[];
  let key,watchdog,currentStage=null,runFinished=false;
  const h={group,isolated,dataDir,profiles,context:null,dashboard:null,app:null,httpPosts,fixtureEvents,
    evidence:{group,startedAt:new Date().toISOString(),status:'RUNNING',environment:{platform:process.platform,architecture:process.arch,os:os.release(),node:process.version,githubActions:true,runId:process.env.GITHUB_RUN_ID||null,runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,commit:process.env.GITHUB_SHA||null,containerImage:process.env.CLOUD_PLAYWRIGHT_IMAGE||null},scope:'Real extension and isolated fictional fixture; sequential persistent browser profiles.',resources:{maxConcurrentBrowsers:1},results,facts:{}}};
  const scrub=value=>{
    let text=String(value);for(const marker of privateMarkers)if(marker)text=text.replaceAll(marker,'[redacted]');
    return text;
  };
  const notice=(title,value)=>{
    const detail=scrub(JSON.stringify(value));assert.ok(detail.length<=12_000,'Acceptance notice must remain bounded');
    console.error('::notice title='+title+'::'+detail.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
  };
  // Tests may register fictional credential markers without publishing their values.
  h.protect=(...markers)=>{for(const marker of markers)if(typeof marker==='string'&&marker)privateMarkers.add(marker);};
  h.until=until;
  h.posts=(tenant,jobId)=>httpPosts.filter(post=>(tenant===undefined||post.tenant===tenant)&&(jobId===undefined||post.jobId===jobId));
  h.api=async(route='/state',body,{allowFailure=false}={})=>{
    assert.ok(key,'start the application before API requests');
    const response=await fetch(BASE+'/api'+route,{method:body===undefined?'GET':'POST',headers:{'X-Local-Key':key,...(body===undefined?{}:{'Content-Type':'application/json',Origin:BASE})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(7000)});
    const value=await response.json();
    if(!allowFailure && (!response.ok||value.ok===false)){
      const error=new Error('Dashboard API refused the acceptance operation');error.code='DASHBOARD_API';error.acceptanceWait=route;throw error;
    }
    return {status:response.status,...value};
  };
  h.state=()=>h.api('/state');
  h.action=(action,details={},options)=>h.api('/action',{action,...details},options);
  h.fixture=async(route='/state',body)=>{
    const response=await fetch(FIXTURE+'/__test'+route,{method:body===undefined?'GET':'POST',headers:{'X-Fixture-Test-Key':testKey,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(7000)});
    assert.equal(response.status,200,'Fixture test API must succeed');return response.json();
  };
  h.start=async()=>{
    assert.equal(h.app,null,'close the old application before restarting');
    h.app=await createApp({dataDir,testMode:true,testKey});assert.equal(h.app.url,BASE);
    h.app.fixture.server.on('request',(request,response)=>{
      const parsed=new URL(request.url,FIXTURE),match=/^\/site\/(alpha|beta)\/apply\/([a-zA-Z0-9_-]{1,80})$/.exec(parsed.pathname);
      // This is outside the fixture's Origin guard and persists across app restarts.
      if(request.method==='POST'&&match)httpPosts.push({tenant:match[1],jobId:match[2]});
      if(/^\/site\/(alpha|beta)\/(jobs|apply|login|receipt|session)(?:\/[\w-]+)?$/.test(parsed.pathname))response.once('finish',()=>{
        if(response.statusCode>=400&&fixtureEvents.length<12)fixtureEvents.push({method:request.method,path:parsed.pathname,status:response.statusCode,origin:request.headers.origin==='null'?'null':!request.headers.origin?'none':request.headers.origin===FIXTURE?'fixture':'other',site:request.headers['sec-fetch-site']||'absent',mode:request.headers['sec-fetch-mode']||'absent',destination:request.headers['sec-fetch-dest']||'absent'});
      });
    });
    const response=await fetch(BASE,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);
    key=(await response.text()).match(/name="local-key" content="([A-Za-z0-9_-]+)"/)?.[1];
    assert.match(key,/^[A-Za-z0-9_-]{32,256}$/);privateMarkers.add(key);
    return h.app;
  };
  h.closeBrowser=async()=>{
    if(h.context){const context=h.context;h.context=null;h.dashboard=null;await context.close();}
  };
  h.closeApp=async()=>{if(h.app){const app=h.app;h.app=null;await app.close();}};
  h.launch=async(profileName,{pair=true}={})=>{
    assert.match(profileName,/^[a-z][a-z0-9-]{0,24}$/);assert.equal(h.context,null,'only one browser context may run at a time');assert.ok(h.app,'start the application before launching');
    assert.equal(process.env.CLOUD_PLAYWRIGHT_IMAGE,IMAGE,'use the pinned official hosted image');
    const proof=JSON.parse(await fs.readFile(path.join(evidenceRoot,'container-browser.json'),'utf8'));
    assert.equal(proof.image,IMAGE);assert.equal(proof.playwright,'1.58.2');assert.equal(proof.copiedAndVerified,true);
    h.evidence.environment.imageVerified=true;
    if(!profiles.has(profileName))profiles.set(profileName,path.join(isolated,'profile-'+profileName));
    const previousClient=h.app.store.connection?.clientId;
    h.context=await chromium.launchPersistentContext(profiles.get(profileName),browserOptions({headless:false,channel:'chromium',args:['--disable-extensions-except='+path.join(projectRoot,'autofill-extension'),'--load-extension='+path.join(projectRoot,'autofill-extension')]}));
    h.evidence.environment.browser=h.context.browser().version();
    if(!pair)return h.context;
    const worker=h.context.serviceWorkers()[0]||await h.context.waitForEvent('serviceworker',{timeout:15_000});
    assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);
    h.dashboard=h.context.pages().find(page=>page.url()==='about:blank')||await h.context.newPage();
    await h.dashboard.addInitScript(()=>{
      globalThis.__acceptanceExtensionReady=false;
      window.addEventListener('message',event=>{
        if(event.source===window&&event.origin==='http://127.0.0.1:17321'&&event.data?.channel==='job-local'&&event.data.type==='extension-ready')globalThis.__acceptanceExtensionReady=true;
      });
    });
    await h.dashboard.goto(BASE);await h.dashboard.waitForFunction(()=>globalThis.__acceptanceExtensionReady===true,{},{timeout:15_000});
    const pageKey=await h.dashboard.locator('meta[name="local-key"]').getAttribute('content');assert.equal(pageKey,key);
    await h.dashboard.locator('#connect-button').click();
    const snapshot=await until('new real runner heartbeat after dashboard pairing',h.state,value=>{
      if(!value.connection.connected||!value.connection.profileId||h.app.store.connection?.clientId===previousClient)return false;
      return !profileIds.has(profileName)||value.connection.profileId===profileIds.get(profileName);
    },75_000);
    if(!profileIds.has(profileName)){
      for(const existing of profileIds.values())assert.notEqual(snapshot.connection.profileId,existing,'separate persistent directories must have independently generated identities');
      profileIds.set(profileName,snapshot.connection.profileId);privateMarkers.add(snapshot.connection.profileId);
    }
    return h.context;
  };
  h.login=async(tenant='alpha',account='demo')=>{
    assert.ok(h.context,'launch the isolated browser before login');assert.ok(['alpha','beta'].includes(tenant));assert.ok(['demo','other'].includes(account));
    const page=await h.context.newPage(),url=FIXTURE+'/site/'+tenant+'/login';await page.goto(url);
    await page.locator('select[name="account"]').selectOption(account);
    const posted=page.waitForResponse(response=>response.url()===url&&response.request().method()==='POST');
    await page.locator('button[type="submit"]').click();assert.equal((await posted).status(),303);
    await page.locator(`[data-session-status="ready"][data-account="${account}"][data-tenant="${tenant}"]`).waitFor();
    return page;
  };
  h.check=async(name,fn)=>{
    currentStage=name;const started=Date.now();
    try{await fn();results.push({name,status:'PASS',durationMs:Date.now()-started});console.log('PASS '+name);}
    catch(error){results.push({name,status:'FAIL',errorType:error.name||'Error',durationMs:Date.now()-started});throw error;}
    finally{currentStage=null;}
  };
  h.run=async fn=>{
    assert.equal(runFinished,false,'run each acceptance harness once');runFinished=true;
    try{
      await Promise.race([fn(h),new Promise((_,reject)=>{watchdog=setTimeout(()=>{const error=new Error('Acceptance group exceeded its bounded runtime');error.code='GROUP_TIMEOUT';reject(error);},300_000);})]);
      assert.ok(results.length>0,'a zero-stage group is not acceptance evidence');assert.ok(results.every(result=>result.status==='PASS'));
      h.evidence.status='PASS';
    }catch(error){
      h.evidence.status='FAIL';process.exitCode=1;
      const failure={group,status:'FAIL',stage:results.find(result=>result.status==='FAIL')?.name||currentStage,errorType:error.name||'Error',code:typeof error.code==='string'&&/^[A-Z_]+$/.test(error.code)?error.code:null,wait:error.acceptanceWait||null,frames:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,5)};
      try{
        const snapshot=await h.state();failure.state={connected:snapshot.connection.connected,paused:snapshot.paused,running:snapshot.running,command:h.app.store.command?.op||null,sites:snapshot.sites.map(site=>({id:site.id,login:site.login?.status})),tasks:snapshot.tasks.map(task=>({jobId:task.jobId,status:task.status,phase:task.phase,issue:task.issue?.kind||null}))};
      }catch{failure.state={readFailed:true};}
      failure.httpPosts=httpPosts.length;failure.posts=httpPosts;failure.fixtureEvents=fixtureEvents;
      h.evidence.failure=failure;notice('Acceptance '+group+' failure',failure);
    }finally{
      clearTimeout(watchdog);
      try{await h.closeBrowser();}catch{h.evidence.status='FAIL';h.evidence.cleanupFailed=true;process.exitCode=1;}
      try{await h.closeApp();}catch{h.evidence.status='FAIL';h.evidence.cleanupFailed=true;process.exitCode=1;}
      h.evidence.finishedAt=new Date().toISOString();
      await fs.writeFile(path.join(evidenceRoot,'acceptance-'+group+'-browser.json'),scrub(JSON.stringify(h.evidence,null,2)));
      await removeTestDirectory(isolated);
    }
    if(h.evidence.status==='PASS')notice('Acceptance '+group+' final result',{group,status:'PASS',stages:results.length,passed:results.length,names:results.map(result=>result.name),facts:h.evidence.facts,httpPosts:httpPosts.length,posts:httpPosts});
    return h.evidence;
  };
  return h;
}
