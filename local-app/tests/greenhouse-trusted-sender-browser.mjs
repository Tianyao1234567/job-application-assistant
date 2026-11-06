// Bounded feasibility experiment. This temporary MV3 extension is not the
// product sender and only talks to a fictional loopback server. Its independent
// server records every application POST, including rejected requests.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';

const {chromium}=createRequire(new URL('../../autofill-extension/package.json',import.meta.url))('playwright');
const dir=await testDirectory('trusted-sender'),ext=path.join(dir,'extension');
const origin='http://127.0.0.1:17322',source=origin+'/greenhouse/reference-test/jobs/1234567';
const bytes=Buffer.from('Fictional resume for trusted sender experiment only.');
const sha=value=>createHash('sha256').update(value).digest('hex');
const file={name:'fictional.txt',size:bytes.length,sha256:sha(bytes)},csrf=randomBytes(16).toString('hex'),session=randomBytes(16).toString('hex');
const count=[],uploads=[],receipts=new Map(),results=[];
let server,context,extensionOrigin,hideReceipt=false;
const evidence={scope:'Temporary real MV3, fictional server and fictional data; not product integration or proof of real-site compatibility',results,ok:false};

function background(){
 let port,proof,spec,pending,sending=false,releaseTestHold;
 // Test-only observation: the production extension is not changed.
 globalThis.experimentState=()=>({connected:!!port,sending,held:!!releaseTestHold});
 const source='http://127.0.0.1:17322/greenhouse/reference-test/jobs/1234567';
 const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
 const valueKeys=['csrf','email','full_name','job_id','question','resume_url','resume_url_filename','task_id','tenant'];
 const nonce=()=>crypto.randomUUID().replaceAll('-','');
 async function read(){
  const frames=await chrome.scripting.executeScript({target:{tabId:spec.tabId},world:'ISOLATED',func:()=>{
   const form=document.querySelector('#application');if(!form||location.href!==form.action)return null;
   const values={};for(const [key,value]of new FormData(form)){if(typeof value!=='string'||Object.hasOwn(values,key))return null;values[key]=value;}
   return {url:location.href,values};
  }});
  return {documentId:frames[0]?.documentId,...frames[0]?.result};
 }
 function shape(values){return !!values&&Object.keys(values).sort().join('|')===valueKeys.join('|');}
 async function snapshot(){
  if(!spec||!proof||!port)return {ok:false,reason:'not-armed'};
  const current=await read(),v=current.values;
  if(current.url!==source||current.documentId!==proof.documentId||!shape(v)||v.csrf!==spec.csrf||v.email!==spec.account||v.full_name!==spec.name||v.job_id!==spec.jobId||v.tenant!==spec.tenant||v.task_id!==spec.taskId||v.question!==spec.question||v.resume_url_filename!==spec.file.name||await digest(v.resume_url)!==proof.referenceSha256)return {ok:false,reason:'mismatch'};
  const bound={...spec,replay:true,submitUrl:source,confirmationUrl:source+'/confirmation',documentId:current.documentId,uploadProof:proof};
  if(!verifiedUpload(bound)||!await boundApplication(bound,{job_application:v}))return {ok:false,reason:'upload-proof'};
  pending={documentId:current.documentId,values:structuredClone(v)};return {ok:true};
 }
 async function submit(){
  if(sending)return {ok:false,reason:'busy'};sending=true;
  try{return await submitOnce();}finally{sending=false;}
 }
 async function submitOnce(){
  if(!port||!pending||!spec||!proof)return {ok:false,reason:'not-ready'};
  const authorizedPort=port;
  const saved=(await chrome.storage.local.get('ledger')).ledger||{};
  if(saved[spec.taskId])return {ok:false,reason:'already-crossed'};
  const current=await read();if(!port||current.documentId!==pending.documentId||current.url!==source||JSON.stringify(current.values)!==JSON.stringify(pending.values))return {ok:false,reason:'changed'};
  // Persist before network dispatch. An aborted response must remain unknown.
  saved[spec.taskId]={status:'unknown',profileId:spec.profileId,profileVersion:spec.profileVersion,resumeVersion:spec.resumeVersion};await chrome.storage.local.set({ledger:saved});
  // Bounded fixture-only hook: the test explicitly disconnects the authorized
  // port after durable boundary write, before dispatch, then releases this hold.
  if(spec.holdBeforeSend===true)await new Promise(resolve=>{releaseTestHold=resolve;setTimeout(resolve,10000);});
  releaseTestHold=null;
  if(port!==authorizedPort)return {ok:false,reason:'disconnected'};
  const taskId=spec.taskId,body={job_application:structuredClone(pending.values)};pending=null;
  try{
   const response=await fetch(source,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':spec.csrf},body:JSON.stringify(body)});
   if(!response.ok)return {ok:false,reason:'unknown'};
   const check=await fetch(source+'/confirmation?task='+encodeURIComponent(taskId),{credentials:'include',cache:'no-store'});
   if(!check.ok)return {ok:false,reason:'unknown'};
   const receipt=await check.json();
   if(receipt.taskId!==taskId||receipt.jobId!==spec.jobId||receipt.account!==spec.account||receipt.referenceSha256!==proof.referenceSha256||!/^receipt-[a-f0-9]+$/.test(receipt.id))return {ok:false,reason:'unknown'};
   const ledger=(await chrome.storage.local.get('ledger')).ledger||{};if(ledger[taskId]?.status!=='unknown')return {ok:false,reason:'unknown'};
   ledger[taskId].status='submitted';ledger[taskId].receipt=receipt.id;await chrome.storage.local.set({ledger});return {ok:true,receipt:receipt.id};
  }catch{return {ok:false,reason:'unknown'};}
 }
 chrome.runtime.onConnect.addListener(p=>{
  if(p.name!=='experiment-runner'||p.sender?.id!==chrome.runtime.id||p.sender?.url!==chrome.runtime.getURL('runner.html')){p.disconnect();return;}
  port=p;p.onDisconnect.addListener(()=>{if(port===p){port=null;pending=null;}});
  p.onMessage.addListener(async message=>{
   let result;
   try{
    if(message.op==='arm'){
     const x=message.spec;if(!x||!Number.isInteger(x.tabId)||x.source!==source||x.tenant!=='reference-test'||x.jobId!=='1234567'||x.account!=='fictional@example.invalid'||x.profileVersion!==1||x.resumeVersion!==1||x.confirmed!==true||!x.taskId||!x.profileId||!x.csrf)throw new Error('invalid authorization');
     spec=structuredClone(x);pending=null;proof=null;result={ok:true};
    }else if(message.op==='capture'){
     if(!spec)throw new Error('not armed');
     const frames=await chrome.scripting.executeScript({target:{tabId:spec.tabId},world:'MAIN',func:captureUploadReference,args:[{file:spec.file,replay:true,nonce:nonce()}]});
     const observed=frames[0]?.result;if(!observed?.ok||!frames[0]?.documentId)throw new Error('upload proof unavailable');
     proof={...observed,rule:'greenhouse-upload-object-v1',taskId:spec.taskId,profileId:spec.profileId,tabId:spec.tabId,source,documentId:frames[0].documentId};result={ok:true};
    }else if(message.op==='prepare')result=await snapshot();
    else if(message.op==='send')result=await submit();
    else if(message.op==='state')result={ok:true,ledger:(await chrome.storage.local.get('ledger')).ledger||{}};
    else if(message.op==='release-test-hold'){if(!releaseTestHold)throw new Error('no hold');releaseTestHold();result={ok:true};}
    else result={ok:false,reason:'unknown-operation'};
   }catch(error){result={ok:false,reason:String(error.message||error)};}
   try{p.postMessage({id:message.id,...result});}catch{}
  });
 });
}

await fs.mkdir(ext,{recursive:true});
const manifest={manifest_version:3,name:'Fictional independent sender experiment',version:'0.0.1',permissions:['storage','scripting','tabs','declarativeNetRequestWithHostAccess'],host_permissions:[origin+'/*'],background:{service_worker:'background.js',type:'module'},declarative_net_request:{rule_resources:[{id:'page-block',enabled:true,path:'rules.json'}]}};
await fs.writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
await fs.writeFile(path.join(ext,'rules.json'),JSON.stringify([{id:1,priority:1,action:{type:'block'},condition:{regexFilter:'^http://127[.]0[.]0[.]1:17322/greenhouse/reference-test/jobs/1234567([?].*)?$',initiatorDomains:['127.0.0.1'],resourceTypes:['xmlhttprequest','main_frame','sub_frame','ping','csp_report','other'],requestMethods:['post']}}]));
await fs.writeFile(path.join(ext,'runner.html'),'<meta charset="utf-8"><title>fictional runner</title>');
// MV3 service workers require static imports; import() is unavailable there.
await fs.writeFile(path.join(ext,'background.js'),"import {captureUploadReference,verifiedUpload,boundApplication} from './greenhouse-receipts.js';\n("+background.toString()+')();');
await fs.copyFile(path.join(projectRoot,'autofill-extension/greenhouse-receipts.js'),path.join(ext,'greenhouse-receipts.js'));
server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,origin);
 if(req.method==='GET'&&u.pathname==='/greenhouse/reference-test/jobs/1234567'){
  res.writeHead(200,{'Content-Type':'text/html','Set-Cookie':`fictional_session=${session}; HttpOnly; SameSite=Strict; Path=/`});res.end(`<!doctype html><input id="resume" type="file"><form id="application" action="${source}" method="post"><input name="csrf" value="${csrf}"><input name="email" value="fictional@example.invalid"><input name="full_name" value="Fictional Applicant"><input name="job_id" value="1234567"><select name="question"><option selected>Fictional option</option></select><input name="resume_url"><input name="resume_url_filename" value="fictional.txt"><input name="task_id" value="task-good"><input name="tenant" value="reference-test"></form><script>document.querySelector('#resume').onchange=()=>{const d=new FormData();d.append('key','object-a');d.append('file',document.querySelector('#resume').files[0]);const x=new XMLHttpRequest();x.open('POST','${origin}/greenhouse-upload');x.onload=()=>{if(x.status===204)document.querySelector('[name=resume_url]').value='${origin}/greenhouse-upload/object-a'};x.send(d)};window.nativeSubmit=()=>fetch(location.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job_application:{task_id:'page-bypass'}})}).then(r=>r.status).catch(()=>0);</script>`);return;
 }
 if(req.method==='POST'&&u.pathname==='/greenhouse-upload'){
  const chunks=[];for await(const c of req)chunks.push(c);const form=await new Request(origin,{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();const uploaded=form.get('file');uploads.push({key:form.get('key'),sha256:sha(Buffer.from(await uploaded.arrayBuffer()))});res.writeHead(204).end();return;
 }
 if(req.method==='POST'&&u.pathname==='/greenhouse/reference-test/jobs/1234567'){
  const chunks=[];for await(const c of req)chunks.push(c);let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{}count.push({origin:req.headers.origin||'',taskId:body?.job_application?.task_id||'',sessionPresent:!!req.headers.cookie?.includes('fictional_session='+session),csrfPresent:req.headers['x-csrf-token']===csrf});
  const app=body?.job_application,expectedKeys=['csrf','email','full_name','job_id','question','resume_url','resume_url_filename','task_id','tenant'];
  // Keep the same page-origin requirement as the existing production replay;
  // the experiment does not forge Origin or relax the session/CSRF checks.
  const valid=req.headers.origin===origin&&req.headers.cookie?.includes('fictional_session='+session)&&req.headers['x-csrf-token']===csrf&&app&&Object.keys(app).sort().join('|')===expectedKeys.join('|')&&app.csrf===csrf&&app.email==='fictional@example.invalid'&&app.full_name==='Fictional Applicant'&&app.job_id==='1234567'&&app.tenant==='reference-test'&&app.question==='Fictional option'&&app.resume_url===origin+'/greenhouse-upload/object-a'&&app.resume_url_filename==='fictional.txt'&&['task-good','task-good-2','task-unknown'].includes(app.task_id);
  // The strictly rejected fictional request is counted, then its response is
  // lost. This does not simulate acceptance or establish a trusted receipt.
  if(app?.task_id==='task-lost-response'&&!valid){req.socket.destroy();return;}
  if(!valid){res.writeHead(403).end('invalid request');return;}
  receipts.set(app.task_id,{id:'receipt-'+randomBytes(8).toString('hex'),taskId:app.task_id,jobId:app.job_id,account:app.email,referenceSha256:sha(app.resume_url)});res.writeHead(200,{'Content-Type':'application/json'}).end('{"ok":true}');return;
 }
 if(req.method==='GET'&&u.pathname==='/greenhouse/reference-test/jobs/1234567/confirmation'){
  const receipt=receipts.get(u.searchParams.get('task'));if(hideReceipt||!receipt||!req.headers.cookie?.includes('fictional_session='+session)){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(receipt));return;
 }
 res.writeHead(404).end();
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(17322,'127.0.0.1',resolve));
try{
 context=await chromium.launchPersistentContext(path.join(dir,'browser'),browserOptions({headless:false,args:['--disable-extensions-except='+ext,'--load-extension='+ext]}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);extensionOrigin='chrome-extension://'+new URL(worker.url()).hostname;
 const page=await context.newPage();await page.goto(source);const runner=await context.newPage();await runner.goto(extensionOrigin+'/runner.html');
 await runner.evaluate(()=>{window.connect=()=>{window.p=chrome.runtime.connect({name:'experiment-runner'});window.pending=new Map();window.p.onMessage.addListener(m=>{window.pending.get(m.id)?.(m);window.pending.delete(m.id);});};window.call=(op,extra={})=>new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{window.pending.delete(id);reject(new Error('runner timeout: '+op));},12000);window.pending.set(id,result=>{clearTimeout(timer);resolve(result);});window.p.postMessage({op,id,...extra});});window.connect();});
 const call=(op,extra={})=>runner.evaluate(([op,extra])=>window.call(op,extra),[op,extra]);
 const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({url}))[0]?.id,source);assert.ok(Number.isInteger(tabId));
 const spec={tabId,source,tenant:'reference-test',jobId:'1234567',account:'fictional@example.invalid',name:'Fictional Applicant',question:'Fictional option',taskId:'task-good',profileId:'fictional-profile',profileVersion:1,resumeVersion:1,confirmed:true,csrf,file,holdBeforeSend:true};
 assert.equal(await page.evaluate(()=>window.nativeSubmit()),0);assert.equal(count.length,0);
 await page.evaluate(url=>{navigator.sendBeacon(url+'?beacon=1',new Blob(['fictional'],{type:'text/plain'}));const frame=document.createElement('iframe');frame.name='fictional-post-target';frame.hidden=true;document.body.append(frame);const form=document.createElement('form');form.method='post';form.action=url+'?form=1';form.target=frame.name;document.body.append(form);form.submit();},source);
 await page.waitForTimeout(1200);assert.equal(count.length,0,'page fetch, beacon and native iframe form must all stay blocked');results.push('native page fetch, beacon and iframe form POST blocked');
 assert.equal((await call('arm',{spec:{...spec,confirmed:false}})).ok,false);assert.equal((await call('send')).ok,false);assert.equal(count.length,0);
 assert.equal((await call('arm',{spec:{...spec,profileId:''}})).ok,false);assert.equal(count.length,0);
 assert.equal((await call('arm',{spec})).ok,true);
 const capture=call('capture');await Promise.race([page.waitForFunction(()=>[...document.documentElement.attributes].some(a=>a.name.startsWith('data-job-upload-')),{},{timeout:10000}),capture.then(result=>{throw new Error('capture ended before upload: '+JSON.stringify(result));})]);
 await page.locator('#resume').setInputFiles({name:file.name,mimeType:'text/plain',buffer:bytes});assert.equal((await capture).ok,true);await page.waitForFunction(()=>!!document.querySelector('[name=resume_url]').value);
 assert.deepEqual(uploads,[{key:'object-a',sha256:file.sha256}]);
 await page.locator('[name=resume_url]').fill(origin+'/greenhouse-upload/same-name-wrong-object');assert.equal((await call('prepare')).ok,false);assert.equal(count.length,0);
 await page.locator('[name=resume_url]').fill(origin+'/greenhouse-upload/object-a');await page.locator('[name=csrf]').fill('wrong');assert.equal((await call('prepare')).ok,false);assert.equal(count.length,0);
 await page.locator('[name=csrf]').fill(csrf);await page.locator('[name=email]').fill('');assert.equal((await call('prepare')).ok,false);assert.equal(count.length,0);
 await page.locator('[name=email]').fill(spec.account);await page.evaluate(()=>{const extra=document.createElement('input');extra.name='unexpected';extra.value='not authorized';document.querySelector('#application').append(extra);});assert.equal((await call('prepare')).ok,false);assert.equal(count.length,0);await page.locator('[name=unexpected]').evaluate(node=>node.remove());
 await page.locator('select[name=question]').evaluate(node=>{node.add(new Option('Unconfirmed','Unconfirmed'));node.value='Unconfirmed';});assert.equal((await call('prepare')).ok,false);assert.equal(count.length,0);await page.locator('select[name=question]').selectOption({label:'Fictional option'});
 assert.equal((await call('prepare')).ok,true);await page.locator('[name=resume_url]').fill(origin+'/greenhouse-upload/changed');assert.equal((await call('send')).ok,false);assert.equal(count.length,0);results.push('wrong object, changed object, missing identity/CSRF, unknown field and unconfirmed option cause zero requests');
 await page.locator('[name=resume_url]').fill(origin+'/greenhouse-upload/object-a');assert.equal((await call('prepare')).ok,true);await runner.evaluate(()=>window.p.disconnect());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.nativeSubmit()),0);
 await page.evaluate(url=>{navigator.sendBeacon(url+'?after-disconnect=1',new Blob(['fictional'],{type:'text/plain'}));const frame=document.createElement('iframe');frame.name='fictional-after-disconnect';frame.hidden=true;document.body.append(frame);const form=document.createElement('form');form.method='post';form.action=url+'?after-disconnect=1';form.target=frame.name;document.body.append(form);form.submit();},source);await page.waitForTimeout(1200);
 assert.equal(count.length,0);await runner.evaluate(()=>window.connect());assert.equal((await call('send')).ok,false);assert.equal(count.length,0);results.push('runner disconnect clears authorization and page fetch, beacon and form remain blocked');
 assert.equal((await call('prepare')).ok,true);const held=call('send').catch(()=>({ok:false}));
 let deadline=Date.now()+8000;while(Date.now()<deadline&&!(await worker.evaluate(()=>globalThis.experimentState())).held)await page.waitForTimeout(25);
 assert.equal((await worker.evaluate(()=>globalThis.experimentState())).held,true);assert.equal((await call('state')).ledger['task-good'].status,'unknown');
 await runner.evaluate(()=>window.p.disconnect());deadline=Date.now()+8000;while(Date.now()<deadline&&(await worker.evaluate(()=>globalThis.experimentState())).connected)await page.waitForTimeout(25);
 assert.equal((await worker.evaluate(()=>globalThis.experimentState())).connected,false);await runner.evaluate(()=>window.connect());assert.equal((await call('release-test-hold')).ok,true);
 deadline=Date.now()+8000;while(Date.now()<deadline&&(await worker.evaluate(()=>globalThis.experimentState())).sending)await page.waitForTimeout(25);
 assert.equal((await worker.evaluate(()=>globalThis.experimentState())).sending,false);assert.equal(count.length,0);assert.equal((await call('state')).ledger['task-good'].status,'unknown');
 results.push('fixture hold proves port disconnect after persisted boundary causes zero dispatch and remains unknown');
 // This deterministic hook does not prove all browser scheduler or process-kill races.
 // A separately identified, rejected request loses its response after reaching
 // the server. Reload the real temporary MV3 and prove the persistent ledger
 // blocks dispatch again even after new authorization and a fresh upload proof.
 await page.locator('[name=task_id]').fill('task-lost-response');const lost={...spec,taskId:'task-lost-response',holdBeforeSend:false};assert.equal((await call('arm',{spec:lost})).ok,true);
 const captureLost=call('capture');await Promise.race([page.waitForFunction(()=>[...document.documentElement.attributes].some(a=>a.name.startsWith('data-job-upload-')),{},{timeout:10000}),captureLost.then(result=>{throw new Error('capture ended before upload: '+JSON.stringify(result));})]);await page.locator('#resume').setInputFiles({name:file.name,mimeType:'text/plain',buffer:bytes});assert.equal((await captureLost).ok,true);
 assert.equal((await call('prepare')).ok,true);const lostResult=await call('send');assert.equal(lostResult.ok,false);assert.equal(lostResult.reason,'unknown');assert.equal(count.length,1);assert.equal((await call('state')).ledger['task-lost-response'].status,'unknown');
 await runner.evaluate(()=>{chrome.runtime.reload();}).catch(()=>{});await page.waitForTimeout(500);await runner.reload();
 await runner.evaluate(()=>{window.connect=()=>{window.p=chrome.runtime.connect({name:'experiment-runner'});window.pending=new Map();window.p.onMessage.addListener(m=>{window.pending.get(m.id)?.(m);window.pending.delete(m.id);});};window.call=(op,extra={})=>new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{window.pending.delete(id);reject(new Error('runner timeout: '+op));},12000);window.pending.set(id,result=>{clearTimeout(timer);resolve(result);});window.p.postMessage({op,id,...extra});});window.connect();});
 assert.equal((await call('arm',{spec:lost})).ok,true);const captureAfterReload=call('capture');await Promise.race([page.waitForFunction(()=>[...document.documentElement.attributes].some(a=>a.name.startsWith('data-job-upload-')),{},{timeout:10000}),captureAfterReload.then(result=>{throw new Error('capture ended before upload: '+JSON.stringify(result));})]);await page.locator('#resume').setInputFiles({name:file.name,mimeType:'text/plain',buffer:bytes});assert.equal((await captureAfterReload).ok,true);
 assert.equal((await call('prepare')).ok,true);const repeated=await call('send');assert.equal(repeated.ok,false);assert.equal(repeated.reason,'already-crossed');assert.equal(count.length,1);assert.equal((await call('state')).ledger['task-lost-response'].status,'unknown');
 results.push('strictly rejected request with lost response remains unknown after extension reload and is not resent');
 await page.locator('[name=task_id]').fill('task-good-2');const good={...spec,taskId:'task-good-2',holdBeforeSend:false};assert.equal((await call('arm',{spec:good})).ok,true);
 const recapture=call('capture');await Promise.race([page.waitForFunction(()=>[...document.documentElement.attributes].some(a=>a.name.startsWith('data-job-upload-')),{},{timeout:10000}),recapture.then(result=>{throw new Error('capture ended before upload: '+JSON.stringify(result));})]);await page.locator('#resume').setInputFiles({name:file.name,mimeType:'text/plain',buffer:bytes});assert.equal((await recapture).ok,true);
 assert.equal((await call('prepare')).ok,true);const attempts=await Promise.all([call('send'),call('send')]);const sent=attempts.find(item=>item.ok);assert.ok(sent,JSON.stringify(attempts));assert.equal(attempts.filter(item=>item.ok).length,1);assert.match(sent.receipt,/^receipt-/);assert.equal(count.length,2);assert.equal((await call('send')).ok,false);assert.equal(count.length,2);results.push('concurrent requests send once and verify independent receipt');
 // A new task uses the same observed upload, but an unavailable confirmation
 // must remain unknown; reloading the extension must not cause another POST.
 await page.locator('[name=task_id]').fill('task-unknown');const next={...spec,taskId:'task-unknown',holdBeforeSend:false};assert.equal((await call('arm',{spec:next})).ok,true);
 const captureAgain=call('capture');await Promise.race([page.waitForFunction(()=>[...document.documentElement.attributes].some(a=>a.name.startsWith('data-job-upload-')),{},{timeout:10000}),captureAgain.then(result=>{throw new Error('capture ended before upload: '+JSON.stringify(result));})]);await page.locator('#resume').setInputFiles({name:file.name,mimeType:'text/plain',buffer:bytes});assert.equal((await captureAgain).ok,true);
 hideReceipt=true;assert.equal((await call('prepare')).ok,true);const unknown=await call('send');assert.equal(unknown.ok,false);assert.equal(unknown.reason,'unknown');assert.equal(count.length,3);
 assert.equal((await call('state')).ledger['task-unknown'].status,'unknown');await runner.evaluate(()=>chrome.runtime.reload());await runner.waitForTimeout(500);
 await runner.reload();await runner.evaluate(()=>{window.p=chrome.runtime.connect({name:'experiment-runner'});window.pending=new Map();window.p.onMessage.addListener(m=>{window.pending.get(m.id)?.(m);window.pending.delete(m.id);});window.call=(op,extra={})=>new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{window.pending.delete(id);reject(new Error('runner timeout: '+op));},12000);window.pending.set(id,result=>{clearTimeout(timer);resolve(result);});window.p.postMessage({op,id,...extra});});});
 const reloaded=await runner.evaluate(()=>window.call('state'));assert.equal(reloaded.ledger['task-unknown'].status,'unknown');assert.equal(count.length,3);assert.equal((await runner.evaluate(()=>window.call('send'))).ok,false);assert.equal(count.length,3);results.push('missing receipt remains unknown across extension reload without resending');
 evidence.ok=true;
}catch(error){evidence.error=String(error.stack||error).slice(0,4500);process.exitCode=1;}
finally{evidence.applicationRequests=count.length;evidence.uploadRequests=uploads.length;evidence.requestChecks=count;await context?.close();await new Promise(resolve=>server.close(resolve));await fs.mkdir(evidenceRoot,{recursive:true});await fs.writeFile(path.join(evidenceRoot,'greenhouse-trusted-sender.json'),JSON.stringify(evidence,null,2));await removeTestDirectory(dir);console.log('::notice title=Fictional trusted sender experiment::'+JSON.stringify(evidence).replaceAll('%','%25').replaceAll('\n','%0A'));if(!evidence.ok)console.error('::error title=Fictional trusted sender failure::'+String(evidence.error).replaceAll('%','%25').replaceAll('\n','%0A'));}
