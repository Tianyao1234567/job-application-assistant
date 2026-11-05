// Feasibility experiment only. A temporary MV3 extension and fictional local
// server exercise CDP + DNR ordering and disconnect behavior. Never load this
// extension against a real recruiting site.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot} from '../../autofill-extension/tests/runtime.mjs';

const {chromium}=createRequire(new URL('../../autofill-extension/package.json',import.meta.url))('playwright');
const directory=await testDirectory('dnr-url-guard'),extension=path.join(directory,'extension');
const origin='http://127.0.0.1:17322',url=origin+'/greenhouse/fictional/jobs/12345',received=[];
let server,context;
const report={scope:'Fictional MV3 DNR + CDP URL-marker experiment; not a production guard',checks:[],ok:false};
function worker(){
 let target,listener,hold=false,paused=false;
 const token=crypto.randomUUID();
 globalThis.isPaused=()=>paused;
 globalThis.install=async()=>{
  const prefix='^http://127[.]0[.]0[.]1:17322/greenhouse/fictional/jobs/12345';
  const match={regexFilter:prefix+'([?].*)?$',resourceTypes:['xmlhttprequest'],requestMethods:['post']};
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[1,2],addRules:[
   {id:1,priority:1,action:{type:'block'},condition:match},
   {id:2,priority:2,action:{type:'allow'},condition:{...match,regexFilter:prefix+'[?]mv3_guard='+token+'$'}}
  ]});
 };
 globalThis.arm=async(tabId,shouldHold)=>{
  target={tabId};hold=shouldHold;paused=false;
  listener=async(source,method,params)=>{
   if(source.tabId!==tabId||method!=='Fetch.requestPaused')return;
   paused=true;if(hold)return;
   try{
    const body=JSON.parse(params.request.postData||'');
    if(params.request.method!=='POST'||params.request.url!==url||body.reference!=='fictional-object-a'){
     await chrome.debugger.sendCommand(target,'Fetch.failRequest',{requestId:params.requestId,errorReason:'BlockedByClient'});return;
    }
    await chrome.debugger.sendCommand(target,'Fetch.continueRequest',{requestId:params.requestId,url:params.request.url+'?mv3_guard='+token});
   }catch{try{await chrome.debugger.sendCommand(target,'Fetch.failRequest',{requestId:params.requestId,errorReason:'BlockedByClient'});}catch{}}
  };
  chrome.debugger.onEvent.addListener(listener);await chrome.debugger.attach(target,'1.3');
  await chrome.debugger.sendCommand(target,'Fetch.enable',{patterns:[{urlPattern:url,requestStage:'Request'}]});
 };
 globalThis.detach=async()=>{await chrome.debugger.detach(target);chrome.debugger.onEvent.removeListener(listener);};
}
await fs.mkdir(extension,{recursive:true});
await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Fictional DNR guard experiment',version:'0.0.1',permissions:['debugger','tabs','declarativeNetRequestWithHostAccess'],host_permissions:[origin+'/*'],background:{service_worker:'background.js'}}));
// Serialize only the fictional fixed URL into the temporary extension.
await fs.writeFile(path.join(extension,'background.js'),`const url=${JSON.stringify(url)};(${worker.toString()})();`);
server=http.createServer(async(req,res)=>{
 if(req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<script>window.apply=reference=>fetch(location.href,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference})}).then(r=>r.status).catch(()=>0)</script>');return;}
 const chunks=[];for await(const c of req)chunks.push(c);received.push({url:req.url,body:Buffer.concat(chunks).toString()});res.writeHead(200).end('ok');
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(17322,'127.0.0.1',resolve));
try{
 context=await chromium.launchPersistentContext(path.join(directory,'browser'),browserOptions({headless:false,args:['--disable-extensions-except='+extension,'--load-extension='+extension]}));
 const sw=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});assert.match(sw.url(),/^chrome-extension:\/\/[a-p]{32}\//);
 const page=await context.newPage();await page.goto(url);const tabId=await sw.evaluate(async u=>(await chrome.tabs.query({url:u}))[0]?.id,url);assert.ok(Number.isInteger(tabId));
 await sw.evaluate(()=>globalThis.install());assert.equal(await page.evaluate(()=>window.apply('wrong')),0);assert.equal(received.length,0);report.checks.push('default block without debugger');
 await sw.evaluate(id=>globalThis.arm(id,false),tabId);assert.equal(await page.evaluate(()=>window.apply('wrong')),0);assert.equal(received.length,0);report.checks.push('wrong reference blocked');
 assert.equal(await page.evaluate(()=>window.apply('fictional-object-a')),200);assert.equal(received.length,1);report.checks.push('verified request allowed once');
 await sw.evaluate(()=>globalThis.detach());await sw.evaluate(id=>globalThis.arm(id,true),tabId);
 const pending=page.evaluate(()=>window.apply('wrong'));const deadline=Date.now()+10000;
 while(Date.now()<deadline&&!await sw.evaluate(()=>globalThis.isPaused()))await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(await sw.evaluate(()=>globalThis.isPaused()),true);await sw.evaluate(()=>globalThis.detach());await Promise.race([pending,new Promise(resolve=>setTimeout(resolve,1500))]);
 await new Promise(resolve=>setTimeout(resolve,250));assert.equal(received.length,1,'unverified request escaped after debugger detached');report.checks.push('detach remains blocked');
 // A recruiting origin can observe its own request URL. If that marker can be
 // replayed after detach, it is not a safe authorization mechanism.
 const replay=origin+received[0].url;await page.evaluate(async u=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:'wrong'})}).catch(()=>{}),replay);
 assert.equal(received.length,1,'server-observed marker replay allowed an unverified request');report.checks.push('observed marker cannot be replayed');report.ok=true;
}catch(error){report.error=String(error.stack||error).slice(0,3500);process.exitCode=1;}
finally{await context?.close();await new Promise(resolve=>server.close(resolve));await fs.mkdir(evidenceRoot,{recursive:true});await fs.writeFile(path.join(evidenceRoot,'greenhouse-dnr-url-guard.json'),JSON.stringify(report,null,2));await removeTestDirectory(directory);console.log('::notice title=Fictional DNR URL guard experiment::'+JSON.stringify(report).replaceAll('%','%25').replaceAll('\n','%0A'));}
