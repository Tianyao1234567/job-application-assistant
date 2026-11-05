// A narrowly scoped experiment, not the production guard. It uses a real MV3
// service worker and chrome.debugger against a fictional loopback server. The
// server counts received requests independently. Do not use on real sites.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot} from '../../autofill-extension/tests/runtime.mjs';

const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const directory=await testDirectory('cdp-guard'),extension=path.join(directory,'extension');
const origin='http://127.0.0.1:17322',applyURL=origin+'/greenhouse/fictional/jobs/12345';
const fictional=Buffer.from('Fictional resume content for the local guard experiment.');
const hash=value=>createHash('sha256').update(value).digest('hex');
const received=[],uploads=[],results=[];
let context,server;

// This is an experimental extension, loaded by Chromium as an actual MV3
// extension. No Playwright request interception is installed. It deliberately
// does not touch the production extension, ledger, or applicant data.
function serviceWorker(){
  let target,listener,paused,expected,hold;
  globalThis.guardStatus={events:0,allowed:0,blocked:0,errors:0};
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
  globalThis.arm=async(tabId,url,referenceHash,shouldHold=false)=>{
    target={tabId};expected={url,referenceHash};hold=shouldHold;
    listener=async(source,method,params)=>{
      if(source.tabId!==target.tabId||method!=='Fetch.requestPaused')return;
      const requestId=params.requestId;globalThis.guardStatus.events++;paused=requestId;
      if(hold)return;
      try{
        const request=params.request;
        const body=JSON.parse(request.postData||'');
        const application=body.job_application;
        const valid=request.method==='POST'&&request.url===expected.url&&application?.email==='fictional@example.invalid'&&application?.resume_url_filename==='fictional.txt'&&typeof application?.resume_url==='string'&&await digest(application.resume_url)===expected.referenceHash;
        if(valid){globalThis.guardStatus.allowed++;await chrome.debugger.sendCommand(target,'Fetch.continueRequest',{requestId});}
        else {globalThis.guardStatus.blocked++;await chrome.debugger.sendCommand(target,'Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});}
      }catch{
        globalThis.guardStatus.errors++;
        try{await chrome.debugger.sendCommand(target,'Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});}catch{}
      }
    };
    chrome.debugger.onEvent.addListener(listener);
    await chrome.debugger.attach(target,'1.3');
    await chrome.debugger.sendCommand(target,'Fetch.enable',{patterns:[{urlPattern:url,requestStage:'Request'}]});
  };
  globalThis.detach=async()=>{await chrome.debugger.detach(target);chrome.debugger.onEvent.removeListener(listener);};
}

const manifest={manifest_version:3,name:'Fictional pre-send guard experiment',version:'0.0.1',permissions:['debugger','tabs'],host_permissions:['http://127.0.0.1/*'],background:{service_worker:'background.js'}};
await fs.mkdir(extension,{recursive:true});
await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
await fs.writeFile(path.join(extension,'background.js'),'('+serviceWorker.toString()+')();');
server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/greenhouse/fictional/jobs/12345'){
    res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><input id="resume" type="file"><script>
      window.upload=()=>new Promise((resolve,reject)=>{const body=new FormData();body.append('key','fictional-object-a');body.append('file',document.querySelector('#resume').files[0]);const xhr=new XMLHttpRequest();xhr.open('POST','/greenhouse-upload');xhr.onload=()=>resolve(xhr.status);xhr.onerror=reject;xhr.send(body);});
      window.apply=reference=>fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({job_application:{email:'fictional@example.invalid',resume_url_filename:'fictional.txt',resume_url:reference}})}).then(response=>response.status).catch(()=>0);
    </script>`);return;
  }
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
  if(req.method==='POST'&&req.url==='/greenhouse-upload'){
    uploads.push({containsFile:body.includes(fictional),containsKey:body.includes(Buffer.from('fictional-object-a'))});res.writeHead(204).end();return;
  }
  if(req.method==='POST'&&req.url==='/greenhouse/fictional/jobs/12345'){
    received.push(body);res.writeHead(200,{'Content-Type':'application/json'}).end('{"ok":true}');return;
  }
  res.writeHead(404).end();
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(17322,'127.0.0.1',resolve));
try{
  context=await chromium.launchPersistentContext(path.join(directory,'browser'),browserOptions({headless:false,args:['--disable-extensions-except='+extension,'--load-extension='+extension]}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
  assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);
  const page=await context.newPage();await page.goto(applyURL);
  await page.locator('#resume').setInputFiles({name:'fictional.txt',mimeType:'text/plain',buffer:fictional});
  assert.equal(await page.evaluate(()=>window.upload()),204);
  assert.deepEqual(uploads,[{containsFile:true,containsKey:true}]);
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url)?.id,applyURL);
  assert.ok(Number.isInteger(tabId));
  const correct=origin+'/greenhouse-upload/fictional-object-a';
  await worker.evaluate(({tabId,url,digest})=>globalThis.arm(tabId,url,digest),{tabId,url:applyURL,digest:hash(correct)});
  assert.equal(await page.evaluate(ref=>window.apply(ref),origin+'/greenhouse-upload/other-object'),0);
  assert.equal(received.length,0,'Mismatch must not reach the independent server');
  assert.equal(await page.evaluate(ref=>window.apply(ref),correct),200);
  assert.equal(received.length,1,'One correct request must reach the independent server');
  results.push('Actual MV3 intercepted a wrong reference before send; matching reference sent once.');
  await worker.evaluate(()=>globalThis.detach());

  // Probe a dangerous edge case: if detach resumes a paused request, this
  // mechanism alone cannot offer a fail-closed guarantee. The payload and
  // independent server are fictional; no product submission is attempted.
  const baseline=received.length;
  await worker.evaluate(({tabId,url,digest})=>globalThis.arm(tabId,url,digest,true),{tabId,url:applyURL,digest:hash(correct)});
  const pending=page.evaluate(ref=>window.apply(ref),origin+'/greenhouse-upload/other-object');
  const deadline=Date.now()+10000;
  while(Date.now()<deadline&&(await worker.evaluate(()=>globalThis.guardStatus.events))<3)await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok((await worker.evaluate(()=>globalThis.guardStatus.events))>=3,'Held request must be observed before detaching');
  await worker.evaluate(()=>globalThis.detach());
  await Promise.race([pending,new Promise(resolve=>setTimeout(resolve,1500))]);
  await new Promise(resolve=>setTimeout(resolve,250));
  const escaped=received.length-baseline;
  results.push(`Detached debugger while request paused: server received ${escaped} additional fictional request(s).`);
  const report={scope:'MV3 debugger feasibility experiment only; no production guard or external website',results,uploads:uploads.length,applicationRequests:received.length,detachedRequestEscaped:escaped};
  await fs.writeFile(path.join(evidenceRoot,'greenhouse-cdp-guard.json'),JSON.stringify(report,null,2));
  console.log('::notice title=Fictional MV3 pre-send experiment::'+JSON.stringify(report));
  assert.equal(escaped,0,'Debugger detach released an unverified request; fail-closed mechanism is required');
}catch(error){
  const report={scope:'MV3 debugger feasibility experiment only',results,uploads:uploads.length,applicationRequests:received.length,error:String(error.stack||error).slice(0,2500)};
  await fs.writeFile(path.join(evidenceRoot,'greenhouse-cdp-guard.json'),JSON.stringify(report,null,2));
  console.error('::error title=Fictional MV3 pre-send experiment::'+JSON.stringify(report).replaceAll('%','%25').replaceAll('\n','%0A'));
  throw error;
}finally{
  await context?.close();await new Promise(resolve=>server.close(resolve));await removeTestDirectory(directory);
}
