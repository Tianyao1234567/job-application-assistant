// Fictional MV3 network-isolation experiment. It does not implement the
// product sender or contact recruiting sites. A static rule blocks every
// initiator except the exact temporary extension identity; no URL/header
// marker or tab-scoped temporary release is used.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';

const {chromium}=createRequire(new URL('../../autofill-extension/package.json',import.meta.url))('playwright');
const dir=await testDirectory('global-deny'),ext=path.join(dir,'extension'),origin='http://127.0.0.1:17322',external='http://127.0.0.2:17323',target=origin+'/greenhouse/fictional/jobs/12345';
const product=JSON.parse(await fs.readFile(path.join(projectRoot,'autofill-extension/manifest.json'),'utf8'));
const hash=createHash('sha256').update(Buffer.from(product.key,'base64')).digest('hex').slice(0,32);
const id=[...hash].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
const requests=[],checks=[];let server,externalServer,context,worker;
const evidence={scope:'Fictional MV3 static global POST block with fixed-extension initiator exception; network separation and Origin only, not product integration or session/CSRF validation',checks,ok:false};
function background(){
 chrome.runtime.onConnect.addListener(port=>{if(port.name!=='fictional-runner'||port.sender?.url!==chrome.runtime.getURL('runner.html')){port.disconnect();return;}});
 globalThis.trustedFetch=url=>fetch(url,{method:'POST',credentials:'include',headers:{'content-type':'text/plain'},body:'fictional'}).then(r=>r.status).catch(()=>0);
}
await fs.mkdir(ext,{recursive:true});
await fs.writeFile(path.join(ext,'manifest.json'),JSON.stringify({manifest_version:3,name:'Fictional global deny experiment',version:'0.0.1',key:product.key,permissions:['storage','tabs','declarativeNetRequestWithHostAccess'],host_permissions:[origin+'/*'],background:{service_worker:'background.js'},declarative_net_request:{rule_resources:[{id:'deny',enabled:true,path:'rules.json'}]}}));
const condition={regexFilter:'^http://127[.]0[.]0[.]1:17322/greenhouse/fictional/jobs/12345([?].*)?$',resourceTypes:['xmlhttprequest','main_frame','sub_frame','ping','csp_report','other'],requestMethods:['post']};
await fs.writeFile(path.join(ext,'rules.json'),JSON.stringify([{id:1,priority:1,action:{type:'block'},condition},{id:2,priority:2,action:{type:'allow'},condition:{...condition,initiatorDomains:[id]}}]));
await fs.writeFile(path.join(ext,'background.js'),'('+background.toString()+')();');await fs.writeFile(path.join(ext,'runner.html'),'<meta charset="utf-8"><title>fictional runner</title>');
server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,origin);
 if(req.method==='GET'&&u.pathname==='/greenhouse/fictional/jobs/12345'){res.writeHead(200,{'Content-Type':'text/html'}).end('<title>fictional</title>');return;}
 if(req.method==='POST'&&u.pathname==='/greenhouse/fictional/jobs/12345'){const chunks=[];for await(const c of req)chunks.push(c);requests.push({origin:req.headers.origin||null,bytes:Buffer.concat(chunks).length});res.writeHead(req.headers.origin===origin?200:403).end('fictional origin check');return;}
 res.writeHead(404).end();
});
externalServer=http.createServer((req,res)=>res.writeHead(200,{'Content-Type':'text/html'}).end('<title>fictional external origin</title>'));
await Promise.all([new Promise((resolve,reject)=>server.once('error',reject).listen(17322,'127.0.0.1',resolve)),new Promise((resolve,reject)=>externalServer.once('error',reject).listen(17323,'127.0.0.2',resolve))]);
async function attempts(page,url){
 await page.evaluate(url=>{
  fetch(url+'?fetch=1',{method:'POST',mode:'no-cors',body:'fictional'}).catch(()=>{});
  navigator.sendBeacon(url+'?beacon=1',new Blob(['fictional'],{type:'text/plain'}));
  const frame=document.createElement('iframe');frame.name='fixture-post-'+crypto.randomUUID();frame.hidden=true;document.body.append(frame);
  const form=document.createElement('form');form.method='post';form.action=url+'?form=1';form.target=frame.name;document.body.append(form);form.submit();
  const sandbox=document.createElement('iframe');sandbox.sandbox='allow-scripts';sandbox.hidden=true;sandbox.srcdoc='<script>navigator.sendBeacon('+JSON.stringify(url+'?opaque=1')+',"fictional")<\/script>';document.body.append(sandbox);
 },url);
 await page.waitForTimeout(1200);
}
try{
 context=await chromium.launchPersistentContext(path.join(dir,'browser'),browserOptions({headless:false,args:['--disable-extensions-except='+ext,'--load-extension='+ext]}));
 worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});assert.equal(new URL(worker.url()).hostname,id);
 const page=await context.newPage();await page.goto(target);const outsider=await context.newPage();await outsider.goto(external);
 await attempts(page,target);await attempts(outsider,target);assert.equal(requests.length,0,'same-origin, external, opaque, beacon and iframe form POST must all stay blocked');checks.push('all tested page initiators and POST transports blocked');
 const runner=await context.newPage();await runner.goto('chrome-extension://'+id+'/runner.html');await runner.evaluate(()=>{window.p=chrome.runtime.connect({name:'fictional-runner'});window.p.disconnect();});
 await attempts(page,target);await attempts(outsider,target);assert.equal(requests.length,0,'runner port disconnect must not unblock page requests');checks.push('page POST remains blocked after runner disconnect');
 const status=await worker.evaluate(url=>globalThis.trustedFetch(url),target);assert.equal(status,403);assert.equal(requests.length,1,'only the precise extension initiator should reach the server');
 assert.equal(requests[0].origin,'chrome-extension://'+id);checks.push('extension-origin request reaches strict fixture but is rejected without page Origin');
 // During extension reload the static rule must not leave a window in which
 // an unrelated page POST escapes. These bodies are fictional; the server
 // counts every arrival before applying its Origin check.
 const before=requests.length;const wave=outsider.evaluate(async url=>{for(let i=0;i<40;i++){fetch(url+'?reload='+i,{method:'POST',mode:'no-cors',body:'fictional'}).catch(()=>{});await new Promise(r=>setTimeout(r,25));}},target);
 await worker.evaluate(()=>{chrome.runtime.reload();}).catch(()=>{});await wave;await outsider.waitForTimeout(700);assert.equal(requests.length,before,'unverified page request escaped during extension reload');checks.push('page requests remain blocked during extension reload');evidence.ok=true;
}catch(error){evidence.error=String(error.stack||error).slice(0,4000);process.exitCode=1;}
finally{evidence.applicationRequests=requests;await context?.close();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>externalServer.close(resolve))]);await fs.mkdir(evidenceRoot,{recursive:true});await fs.writeFile(path.join(evidenceRoot,'greenhouse-global-deny.json'),JSON.stringify(evidence,null,2));await removeTestDirectory(dir);console.log('::notice title=Fictional global deny experiment::'+JSON.stringify(evidence).replaceAll('%','%25').replaceAll('\n','%0A'));if(!evidence.ok)console.error('::error title=Fictional global deny failure::'+String(evidence.error).replaceAll('%','%25').replaceAll('\n','%0A'));}
