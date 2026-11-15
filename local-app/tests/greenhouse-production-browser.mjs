// Actual MV3 integration for the new custom-control, human-verification and
// browser-network receipt paths. No dispatcher substitute or external writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';
import {createApp} from '../server.mjs';
import {startGreenhouseFixture,GREENHOUSE_REPLAY} from '../greenhouse-fixture.mjs';

const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const BASE='http://127.0.0.1:17321',FIXTURE='http://127.0.0.1:17322';
const isolated=await testDirectory('greenhouse'),dataDir=path.join(isolated,'data');
const testKey=randomBytes(24).toString('base64url'),results=[],blockedExternal=[],pageErrors=[],applicationPosts=[];
const CV=Buffer.from('Fictional Greenhouse replay resume. No actual applicant.\n\x00\xff','latin1');
const SHA=createHash('sha256').update(CV).digest('hex');
const mode='extension';
assert.equal(process.env.GREENHOUSE_BROWSER_MODE,'extension','This check requires actual MV3; no controlled dispatcher fallback');
assert.ok(['page-driver','extension'].includes(mode),'Choose page-driver or extension explicitly');
const evidence={startedAt:new Date().toISOString(),scope:'Actual loaded MV3 runner, isolated DOM, bridge HTTP, browser network observation and JSON application requests; fictional local data only.',environment:{platform:process.platform,node:process.version,mode},limitations:['Real enterprise response evidence requires the personally approved first application; local protocol replay is not that acceptance.','No employer application or personal data used.',...(mode==='page-driver'?['MV3 loading is disabled by this cloud image administrator; the controlled driver substitutes Chrome tab/storage dispatch, not form/backend logic.']:[])],results};
let fixture,app,context,dashboard,key,worker;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const jobURL=id=>`${FIXTURE}/greenhouse/${GREENHOUSE_REPLAY.tenant}/jobs/${id}`;
const task=(state,id)=>state.tasks.find(value=>value.jobId===id);
const redact=value=>String(value).replaceAll(key||'__unused_key__','[redacted]').replaceAll(testKey,'[redacted]');
async function until(name,read,predicate,timeout=45000){
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){try{last=await read();if(predicate(last))return last;}catch{}await delay(120);}
  const diagnostic=last?.tasks?{paused:last.paused,running:last.running,connection:last.connection,tasks:last.tasks.map(t=>({jobId:t.jobId,status:t.status,phase:t.phase,question:t.question?.key,issue:t.issue?.title,steps:t.steps.slice(-3)}))}:last;
  throw new Error(`Timed out ${name}; last=${redact(JSON.stringify(diagnostic)).slice(-2500)}`);
}
async function check(name,fn){const start=Date.now();try{await fn();results.push({name,status:'PASS',durationMs:Date.now()-start});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',message:redact(error.message),durationMs:Date.now()-start});throw error;}}
async function api(route='/state',body,{allowFailure=false}={}){
  const response=await fetch(BASE+'/api'+route,{method:body?'POST':'GET',headers:{'X-Local-Key':key,...(body?{'Content-Type':'application/json',Origin:BASE}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)}),value=await response.json();
  if(!allowFailure&&(!response.ok||value.ok===false))throw new Error('Dashboard '+route+': '+response.status+' '+(value.error||'request failed'));
  return {status:response.status,...value};
}
const action=(name,details={},options)=>api('/action',{action:name,...details},options);
const state=()=>api();
const counts=id=>{const value=fixture.state(),posts=applicationPosts.filter(item=>item.jobId===id).length;assert.equal(posts,value.submitRequests.filter(item=>item.jobId===id).length,'Raw incoming multipart attempts and persisted fixture attempts must agree');return {posts,receipts:value.receipts.filter(item=>item.jobId===id).length};};
async function confirm(id){const current=await state(),item=task(current,id);return action('task-confirm',{taskId:item.id,jobId:id,profileVersion:current.profile.version,resumeVersion:current.resume.version,profileId:current.connection.profileId,submitConfirmed:true});}
async function configure(){
  const profile=JSON.parse(await fs.readFile(path.join(projectRoot,'autofill-extension/profile.example.json'),'utf8'));
  profile.personal.email.zh=profile.personal.email.en='fictional@example.invalid';
  profile.personal.location.zh=profile.personal.location.en='Fictional Test City';
  await api('/profile',{data:profile,mode:'demo',confirmed:true});
  await api('/resume',{name:'fictional-greenhouse-resume.txt',mime:'text/plain',base64:CV.toString('base64'),mode:'demo'});
  await api('/settings',{settings:{mode:'demo',scheduleEnabled:false,time:'09:00',dailyLimit:5,keywords:['Fictional'],cities:['Fictional Test City'],visual:true},sites:[{id:'greenhouse-replay',name:'Fictional Greenhouse replay',company:GREENHOUSE_REPLAY.company,adapter:'greenhouse-replay-v1',origin:FIXTURE,listUrl:`${FIXTURE}/greenhouse/${GREENHOUSE_REPLAY.tenant}`,loginUrl:`${FIXTURE}/greenhouse/${GREENHOUSE_REPLAY.tenant}`,tenant:GREENHOUSE_REPLAY.tenant,expectedAccount:'fictional@example.invalid',mode:'demo',enabled:true}]});
}
async function applicationPage(id){return until('retained application tab',async()=>context.pages().find(page=>page.url().split('?')[0]===jobURL(id)),Boolean);}

try{
  fixture=await startGreenhouseFixture({root:path.join(isolated,'fixture'),port:17322,testMode:true,testKey});
  fixture.server.on('request',request=>{const url=new URL(request.url,FIXTURE),match=/^\/greenhouse\/([a-z0-9_-]+)\/jobs\/(\d+)$/.exec(url.pathname);if(request.method==='POST'&&match)applicationPosts.push({tenant:match[1],jobId:match[2]});});
  app=await createApp({dataDir,startFixture:false,testMode:true,testKey});
  const extension=path.join(projectRoot,'autofill-extension');
  context=await chromium.launchPersistentContext(path.join(isolated,'browser-profile'),browserOptions({headless:false,...(mode==='extension'?{args:['--disable-extensions-except='+extension,'--load-extension='+extension]}:{})}));
  evidence.environment.browser=context.browser().version();
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(['http:','https:'].includes(url.protocol)&&![BASE,FIXTURE].includes(url.origin)){blockedExternal.push({origin:url.origin,method:route.request().method()});return route.abort('blockedbyclient');}
    return route.continue();
  });
  context.on('page',page=>page.on('pageerror',error=>pageErrors.push(redact(error.message))));
  if(mode==='extension'){
    worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
    assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);evidence.environment.extensionId=new URL(worker.url()).hostname;
  }
  dashboard=context.pages()[0]||await context.newPage();
  await dashboard.goto(BASE);key=await dashboard.locator('meta[name="local-key"]').getAttribute('content');
  assert.ok(key);
  await dashboard.locator('#connect-button').click();
  await until('execution client heartbeat',state,value=>value.connection.connected&&value.connection.profileId);
  await configure();


  for(const [index,job]of GREENHOUSE_REPLAY.jobs.slice(0,2).entries()){
    fixture.setScenario(job.id,{productionControls:true,badWire:index===1});
    await check(index===0?'actual MV3 confirms human-selected dynamic fields, writes verified finite choice and resumes after human verification':'actual MV3 rejects mismatched wire attachment despite 2xx and confirmation navigation',async()=>{
      await action('add',{url:jobURL(job.id)});await confirm(job.id);await action('resume');
      await until('unknown dynamic choice requires human selection',state,value=>{const t=task(value,job.id);return t?.status==='waiting_user'&&!t.needsConfirmation;});
      const page=await applicationPage(job.id);
      await page.locator('#country').click();await page.getByRole('option',{name:'Fictional Test Country',exact:true}).click();
      await page.locator('#candidate-location').click();await page.getByRole('option',{name:'Fictional Test City',exact:true}).click();
      let current=await state(),item=task(current,job.id),originalId=item.id;await action('task-resume',{taskId:item.id});
      let humanCompleted=false,finished=false,answers=0;
      for(let n=0;n<15;n++){
        current=await until('new production-path step',state,value=>['waiting_answer','waiting_user','submitted','unknown','failed'].includes(task(value,job.id)?.status));item=task(current,job.id);assert.equal(item.id,originalId);
        if(['submitted','unknown'].includes(item.status)){
          assert.equal(item.status,index===0?'submitted':'unknown');finished=true;break;
        }
        if(item.status==='waiting_user'){
          assert.equal(humanCompleted,false,'No repeated manual wait after provider completion: '+JSON.stringify(item.issue));
          assert.notEqual(item.submissionStarted,true);assert.deepEqual(counts(job.id),{posts:0,receipts:0});
          assert.match(item.issue.detail,/验证/);await page.locator('#complete-verification').click();assert.equal(await page.locator('iframe').isVisible(),true);
          humanCompleted=true;await action('task-resume',{taskId:item.id});continue;
        }
        assert.equal(item.status,'waiting_answer','Unexpected task failure: '+JSON.stringify(item.issue));
        const q=item.question,values={first_name:'Fictional',last_name:'Applicant',country:'Fictional Test Country','candidate-location':'Fictional Test City',question_1:'I explicitly confirm this fictional role purpose.',question_yes:'Yes'};
        assert.ok(Object.hasOwn(values,q.key),'Unexpected question '+q.key);
        if(['country','candidate-location'].includes(q.key)){assert.equal(q.manualSelection,true);assert.equal(q.optionsComplete,false);}
        if(q.key==='question_yes')assert.equal(q.optionsComplete,true);
        await action('answer',{taskId:item.id,answer:values[q.key],save:false});answers++;
        await until('confirmed answer proceeds',state,value=>{const t=task(value,job.id);return t.status!=='waiting_answer'||t.question?.scope!==q.scope;});
      }
      assert.equal(finished,true);assert.equal(humanCompleted,true);assert.equal(answers,6);
      assert.equal(applicationPosts.filter(value=>value.jobId===job.id).length,1);assert.deepEqual(counts(job.id),{posts:1,receipts:1});
      if(index===0){assert.match(item.result.evidence,/网络/);assert.match(item.result.receiptId,/^gh-network:/);assert.equal(item.result.sha256,SHA);}
      else{await action('verify',{taskId:item.id});await delay(1500);assert.equal(task(await state(),job.id).status,'unknown');assert.equal(applicationPosts.filter(value=>value.jobId===job.id).length,1);}
    });
  }
  assert.deepEqual(blockedExternal,[]);assert.deepEqual(pageErrors,[]);
  evidence.fixture={rawApplicationPosts:applicationPosts.length,persistedAttempts:fixture.state().submitRequests.length,uniqueReceipts:fixture.state().receipts.length};
  console.log('::notice title=Greenhouse production paths actual MV3::'+JSON.stringify({results,fixture:evidence.fixture,browser:evidence.environment.browser,mode,externalRequests:blockedExternal.length}));
}catch(error){evidence.error=redact(error.stack||error.message);throw error;}
finally{
 evidence.finishedAt=new Date().toISOString();evidence.pageErrors=pageErrors;evidence.blockedExternal=blockedExternal;
 await fs.writeFile(path.join(evidenceRoot,'greenhouse-production-browser.json'),JSON.stringify(evidence,null,2));
 await context?.close();await app?.close();await fixture?.close();await removeTestDirectory(isolated);
}
