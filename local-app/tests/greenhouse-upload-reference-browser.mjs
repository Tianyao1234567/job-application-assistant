// Focused native-XHR object-binding check only. This is not a rerun of MV3 or
// enterprise acceptance. No external connection, applicant or employer writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {captureUploadReference,boundApplication,networkReceipt} from '../../autofill-extension/greenhouse-receipts.js';
import {Store} from '../model.mjs';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot,projectRoot} from '../../autofill-extension/tests/runtime.mjs';
const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url)),{chromium}=require('playwright');
const origin='http://127.0.0.1:17322',source=origin+'/greenhouse/reference-test/jobs/1234567';
const bytes=Buffer.from('Fictional native upload object binding. No actual applicant.');
const file={name:'fictional.txt',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
const directory=await testDirectory('greenhouse-object'),uploads=[],external=[],results=[];
const mode=process.env.GREENHOUSE_REFERENCE_MODE||'page-eval';assert.ok(['page-eval','extension'].includes(mode));
let browser,context,worker,runnerPage;const hash=value=>createHash('sha256').update(value).digest('hex');
const server=http.createServer(async(req,res)=>{
 if(req.method==='POST'&&req.url==='/greenhouse-upload'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const form=await new Request(origin,{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();
  const blob=form.get('file');uploads.push({key:form.get('key'),sha256:hash(Buffer.from(await blob.arrayBuffer()))});
  res.writeHead(204);res.end();return;
 }
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><input id="resume" type="file"><script>window.nativeOpen=XMLHttpRequest.prototype.open;window.nativeSend=XMLHttpRequest.prototype.send;document.querySelector("input").onchange=e=>{const xhr=new XMLHttpRequest(),data=new FormData();data.append("key","object-a");data.append("file",e.target.files[0]);xhr.open("POST","'+origin+'/greenhouse-upload");xhr.send(data);};</script>');
});
await new Promise(resolve=>server.listen(17322,'127.0.0.1',resolve));
try{
 if(mode==='extension'){
  const extension=path.join(projectRoot,'autofill-extension');
  context=await chromium.launchPersistentContext(path.join(directory,'browser'),browserOptions({headless:false,args:['--disable-extensions-except='+extension,'--load-extension='+extension]}));
  browser=context.browser();worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
  assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);
 }else{browser=await chromium.launch(browserOptions());context=await browser.newContext();}
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
 if(mode==='extension'){runnerPage=await context.newPage();await runnerPage.goto(new URL('runner/index.html',worker.url()).href);}
 const page=await context.newPage();await page.goto(source);
 const capture=options=>mode==='extension'?runnerPage.evaluate(async options=>{
   const {captureUploadReference}=await import(chrome.runtime.getURL('greenhouse-receipts.js'));
   const tab=(await chrome.tabs.query({url:'http://127.0.0.1/*'})).find(t=>t.url==='http://127.0.0.1:17322/greenhouse/reference-test/jobs/1234567');
   const frames=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:captureUploadReference,args:[options]});
   return {...frames[0],tabId:tab.id};
 },options):page.evaluate(captureUploadReference,options).then(result=>({result,documentId:'focused-browser-document',tabId:7}));
 const options={file,replay:true,nonce:'focused-native-upload'};
 const pending=capture(options);
 await page.waitForFunction(nonce=>document.documentElement.hasAttribute('data-job-upload-'+nonce),options.nonce);
 await page.locator('#resume').setInputFiles({name:file.name,mimeType:'text/plain',buffer:bytes});
 const captured=await pending,observed=captured.result;assert.ok(captured.documentId);assert.equal(observed.ok,true);assert.equal(observed.sha256,file.sha256);
 assert.equal(observed.referenceSha256,hash(origin+'/greenhouse-upload/object-a'));
 assert.deepEqual(uploads,[{key:'object-a',sha256:file.sha256}]);
 assert.equal(await page.evaluate(()=>XMLHttpRequest.prototype.open===nativeOpen&&XMLHttpRequest.prototype.send===nativeSend),true);
 results.push('native XHR captures actual sent Blob, exact key and trusted 204; hooks restored');
 const uploadProof={...observed,rule:'greenhouse-upload-object-v1',taskId:'task-reference',profileId:'profile-reference',tabId:captured.tabId,source,documentId:captured.documentId};
 const spec={taskId:uploadProof.taskId,profileId:uploadProof.profileId,tabId:captured.tabId,source,tenant:'reference-test',jobId:'1234567',account:'fictional@example.invalid',replay:true,file,submitUrl:source,confirmationUrl:source+'/confirmation',documentId:uploadProof.documentId,uploadProof};
 const resultFor=async reference=>({spec,request:{id:'request-reference',startedAt:100,status:200,bound:await boundApplication(spec,{job_application:{email:spec.account,resume_url_filename:file.name,resume_url:reference}}),fileBinding:'native-upload-reference',referenceSha256:hash(reference)},confirmedAt:200});
 const correct=networkReceipt(await resultFor(origin+'/greenhouse-upload/object-a'));
 assert.ok(correct);const wrong=networkReceipt(await resultFor(origin+'/greenhouse-upload/different-object-b'));assert.equal(wrong,null);
 const store=new Store({data:directory});store.demo();store.state.sites=[{id:'site-reference',adapter:'greenhouse-replay-v1',tenant:spec.tenant,origin,expectedAccount:spec.account}];
 const task={id:spec.taskId,siteId:'site-reference',jobId:spec.jobId,url:source,executionProfileId:spec.profileId,tabId:captured.tabId,resumeSnapshot:file,status:'unknown',phase:'verify',steps:[]};store.state.tasks.push(task);
 const substituted=structuredClone(correct);substituted.evidence.referenceSha256=hash(origin+'/greenhouse-upload/different-object-b');
 assert.equal(store.receipt(task,substituted),false);assert.equal(task.status,'unknown');assert.equal(task.result,undefined);
 assert.equal(store.receipt(task,correct),true);assert.equal(task.status,'submitted');
 results.push('same filename/different object after 2xx cannot produce persisted success; exact captured object can');
 await page.reload();const badPending=capture({...options,nonce:'wrong-bytes'});
 await page.waitForFunction(()=>document.documentElement.hasAttribute('data-job-upload-wrong-bytes'));
 await page.locator('#resume').setInputFiles({name:file.name,mimeType:'text/plain',buffer:Buffer.from('X'.repeat(bytes.length))});assert.equal((await badPending).result.ok,false);
 results.push('same name/size but different uploaded Blob bytes cannot produce an object proof');
 await page.reload();const cancelled=capture({...options,nonce:'cancel-probe'});
 await page.waitForFunction(()=>document.documentElement.hasAttribute('data-job-upload-cancel-probe'));
 await page.evaluate(()=>document.dispatchEvent(new Event('job-upload-cancel-cancel-probe')));assert.equal((await cancelled).result.ok,false);
 assert.equal(await page.evaluate(()=>XMLHttpRequest.prototype.open===nativeOpen&&XMLHttpRequest.prototype.send===nativeSend),true);
 results.push('abandoned upload observation fails closed and restores native methods');
 assert.deepEqual(external,[]);
 const evidence={scope:'Focused native upload/object binding only; no rerun of accepted MV3 scenarios or production acceptance',mode,browser:browser.version(),results,uploads:uploads.length,externalRequests:external.length};
 await fs.writeFile(evidenceRoot+'/greenhouse-upload-reference-browser.json',JSON.stringify(evidence,null,2));
 console.log('::notice title=Greenhouse exact upload reference::'+JSON.stringify(evidence));
}catch(error){
 const diagnostic={mode,results,message:String(error.stack||error).slice(0,3500)};
 await fs.writeFile(evidenceRoot+'/greenhouse-upload-reference-browser.json',JSON.stringify(diagnostic,null,2));
 console.error('::error title=Greenhouse upload reference diagnostic::'+JSON.stringify(diagnostic));throw error;
}finally{await context?.close();await browser?.close();await new Promise(resolve=>server.close(resolve));await removeTestDirectory(directory);}
