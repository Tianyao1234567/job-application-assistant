// Real MV3 feasibility test, fictional loopback only. The application POST
// stays under a static default-deny DNR rule throughout. No temporary allow
// rule, marker, page-origin forgery, proxy, or real recruiting site is used.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot} from '../../autofill-extension/tests/runtime.mjs';

const {chromium}=createRequire(new URL('../../autofill-extension/package.json',import.meta.url))('playwright');
const dir=await testDirectory('isolated-origin'),extension=path.join(dir,'extension');
const origin='http://127.0.0.1:17322',pageURL=origin+'/greenhouse/fictional/jobs/12345',probe=origin+'/origin-probe';
const cookie=randomBytes(16).toString('hex'),csrf=randomBytes(16).toString('hex'),probes=[],applications=[];
let context,server,worker;
const evidence={scope:'Actual MV3 isolated-world versus page-origin network behavior on fictional loopback only; no production guard',checks:[],ok:false};
function background(){
 globalThis.events=[];
 chrome.webRequest.onBeforeRequest.addListener(details=>{
  if(details.method==='POST')globalThis.events.push({url:details.url,initiator:details.initiator||null,tabId:details.tabId,type:details.type});
 },{urls:['http://127.0.0.1/*']});
}
await fs.mkdir(extension,{recursive:true});
await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Fictional isolated origin experiment',version:'0.0.1',permissions:['scripting','tabs','webRequest','declarativeNetRequestWithHostAccess'],host_permissions:[origin+'/*'],background:{service_worker:'background.js'},declarative_net_request:{rule_resources:[{id:'page-block',enabled:true,path:'rules.json'}]}}));
await fs.writeFile(path.join(extension,'background.js'),'('+background.toString()+')();');
await fs.writeFile(path.join(extension,'rules.json'),JSON.stringify([{id:1,priority:1,action:{type:'block'},condition:{regexFilter:'^http://127[.]0[.]0[.]1:17322/greenhouse/fictional/jobs/12345([?].*)?$',initiatorDomains:['127.0.0.1'],resourceTypes:['xmlhttprequest','main_frame','sub_frame','ping','csp_report','other'],requestMethods:['post']}}]));
server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,origin);
 if(req.method==='GET'&&url.pathname==='/greenhouse/fictional/jobs/12345'){
  res.writeHead(200,{'Content-Type':'text/html','Set-Cookie':`fictional_session=${cookie}; HttpOnly; SameSite=Strict; Path=/`});
  res.end(`<meta charset="utf-8"><meta name="csrf-token" content="${csrf}"><script>window.probe=async target=>fetch(target,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':document.querySelector('meta[name=csrf-token]').content},body:JSON.stringify({source:'fictional'})}).then(r=>r.status).catch(()=>0)</script>`);return;
 }
 if(req.method==='POST'&&url.pathname==='/origin-probe'){
  const chunks=[];for await(const part of req)chunks.push(part);
  const result={origin:req.headers.origin||null,sessionPresent:!!req.headers.cookie?.includes('fictional_session='+cookie),csrfPresent:req.headers['x-csrf-token']===csrf};probes.push(result);
  const valid=result.origin===origin&&result.sessionPresent&&result.csrfPresent;
  res.writeHead(valid?200:403,{'Content-Type':'application/json'}).end(JSON.stringify({ok:valid}));return;
 }
 if(req.method==='POST'&&url.pathname==='/greenhouse/fictional/jobs/12345'){
  const chunks=[];for await(const part of req)chunks.push(part);applications.push({bytes:Buffer.concat(chunks).length});res.writeHead(403).end();return;
 }
 res.writeHead(404).end();
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(17322,'127.0.0.1',resolve));
try{
 context=await chromium.launchPersistentContext(path.join(dir,'browser'),browserOptions({headless:false,args:['--disable-extensions-except='+extension,'--load-extension='+extension]}));
 worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);
 const page=await context.newPage();await page.goto(pageURL);const tabId=await worker.evaluate(async u=>(await chrome.tabs.query({url:u}))[0]?.id,pageURL);assert.ok(Number.isInteger(tabId));
 assert.equal(await page.evaluate(u=>window.probe(u),probe),200);assert.equal(probes.length,1);
 const frames=await worker.evaluate(async({tabId,probe})=>chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:async url=>fetch(url,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':document.querySelector('meta[name=csrf-token]').content},body:JSON.stringify({source:'fictional'})}).then(r=>r.status).catch(()=>0),args:[probe]}),{tabId,probe});
 assert.equal(frames[0]?.result,200);assert.equal(probes.length,2);assert.deepEqual(probes[0],probes[1]);assert.deepEqual(probes[0],{origin,sessionPresent:true,csrfPresent:true});
 const events=await worker.evaluate(()=>globalThis.events.filter(e=>e.url.endsWith('/origin-probe')));assert.equal(events.length,2);assert.deepEqual(events[0],events[1]);assert.equal(events[0].initiator,origin);assert.equal(events[0].tabId,tabId);
 evidence.checks.push('page and isolated-world probe have identical origin, session, CSRF, initiator and tab');
 assert.equal(await page.evaluate(u=>window.probe(u),pageURL),0);
 const blocked=await worker.evaluate(async({tabId,pageURL})=>chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:async url=>fetch(url,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':document.querySelector('meta[name=csrf-token]').content},body:JSON.stringify({source:'fictional'})}).then(r=>r.status).catch(()=>0),args:[pageURL]}),{tabId,pageURL});
 assert.equal(blocked[0]?.result,0);assert.equal(applications.length,0);evidence.checks.push('both application requests remain blocked with zero server arrivals');
 await page.evaluate(url=>{navigator.sendBeacon(url+'?beacon=1',new Blob(['fictional'],{type:'text/plain'}));const frame=document.createElement('iframe');frame.name='fictional-post-target';frame.hidden=true;document.body.append(frame);const form=document.createElement('form');form.method='post';form.action=url+'?form=1';form.target=frame.name;document.body.append(form);form.submit();},pageURL);
 await page.waitForTimeout(1200);assert.equal(applications.length,0,'beacon and native iframe form must stay blocked');evidence.checks.push('page beacon and native iframe form remain blocked with zero server arrivals');
 evidence.observed={probeCount:probes.length,applicationRequests:applications.length,pageOrigin:probes[0].origin,isolatedOrigin:probes[1].origin,initiator:events[0].initiator,sameTab:true,sessionPresent:true,csrfPresent:true};evidence.ok=true;
}catch(error){evidence.error=String(error.stack||error).slice(0,4000);evidence.probes=probes;evidence.applicationRequests=applications.length;if(worker)try{evidence.events=await worker.evaluate(()=>globalThis.events);}catch{}process.exitCode=1;}
finally{await context?.close();await new Promise(resolve=>server.close(resolve));await fs.mkdir(evidenceRoot,{recursive:true});await fs.writeFile(path.join(evidenceRoot,'greenhouse-isolated-origin.json'),JSON.stringify(evidence,null,2));await removeTestDirectory(dir);console.log('::notice title=Fictional isolated origin experiment::'+JSON.stringify(evidence).replaceAll('%','%25').replaceAll('\n','%0A'));if(!evidence.ok)console.error('::error title=Fictional isolated origin failure::'+String(evidence.error).replaceAll('%','%25').replaceAll('\n','%0A'));}
