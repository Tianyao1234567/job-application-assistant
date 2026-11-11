// One offline browser investigation. Network isolation is a TEST HARNESS, not
// a product pre-send gate. No request is released, no success response invented.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildApplication} from './fixtures/greenhouse-native-client.js';
import {createOfflineCapture,sha256,CLIENT_SHA256} from '../experiments/greenhouse-native-request.mjs';
import {projectRoot,evidenceRoot,testDirectory,removeTestDirectory,browserOptions} from '../../autofill-extension/tests/runtime.mjs';

const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const schema=JSON.parse(await fs.readFile(path.join(projectRoot,'docs/greenhouse-mattermost-form.json'),'utf8'));
const client=await fs.readFile(new URL('./fixtures/greenhouse-native-client.js',import.meta.url),'utf8');
const sourceMetadata=JSON.parse(await fs.readFile(new URL('./fixtures/greenhouse-native-client-source.json',import.meta.url),'utf8'));
assert.equal(await sha256(client),sourceMetadata.fixture.sha256);
const directory=await testDirectory('native-request');
const origin='http://127.0.0.1:17322',source=origin+'/greenhouse/reference-test/jobs/1234567';
const fictionalBytes='Fictional native upload source bytes only.';
const file={name:'fictional.txt',size:Buffer.byteLength(fictionalBytes),sha256:await sha256(fictionalBytes)};
const reference=origin+'/greenhouse-upload/object-a';
const values={first_name:'Fictional',last_name:'Applicant',email:'fictional@example.invalid',phone:'+10000000000',location:'Fictional City',resume:{name:file.name,url:reference}};
for(const question of schema.questions){const field=question.fields[0];if(field.name.startsWith('question_'))values[field.name]=field.type==='input_text'?'Fictional confirmed answer':1;}
const extras={demographics:{},compliance:{},employments:[{companyName:'Fictional Employer',title:'Fictional Role',currentRole:true}],educations:[]};
const params='gh_src=fictional-source&ccuid=fictional-click';
const makeApplication=state=>buildApplication(schema,state,extras.demographics,extras.compliance,extras.employments,extras.educations,new URLSearchParams(params));
// Upload binding here is a trusted FICTIONAL input to the offline unit. Actual
// native XHR/upload proof is independently tested by existing MV3 evidence.
// No employer upload takes place and this test does not recertify that path.
const spec={taskId:'fictional-task',profileId:'fictional-profile',profileVersion:1,resumeVersion:1,authorizationId:'fictional-authorization',stateVersion:'react-state-1',tabId:7,documentId:'fictional-document',source,submitUrl:source,confirmationUrl:source+'/confirmation',tenant:'reference-test',jobId:'1234567',account:values.email,replay:true,file,clientSha256:CLIENT_SHA256,schemaSha256:await sha256(JSON.stringify(schema))};
spec.uploadProof={rule:'greenhouse-upload-object-v1',taskId:spec.taskId,profileId:spec.profileId,tabId:spec.tabId,source,documentId:spec.documentId,fileName:file.name,fileSize:file.size,sha256:file.sha256,status:204,referenceSha256:await sha256(reference)};
const received=[],captures=[],results=[],external=[];
let browser,context;
const extensionMode=process.env.NATIVE_CAPTURE_MODE==='extension';
let worker;
const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'){received.push({method:req.method,path:req.url});res.writeHead(500).end();return;}
  if(req.url==='/react.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js')));return;}
  if(req.url==='/react-dom.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js')));return;}
  if(req.url==='/native-client.js'){res.setHeader('Content-Type','text/javascript');res.end(client);return;}
  if(req.url!==new URL(source).pathname){res.writeHead(404).end();return;}
  res.setHeader('Content-Type','text/html');
  res.end(`<!doctype html><meta charset="utf-8"><div id="root"></div><input id="dom-decoy" name="question_18195689008" value="DOM IS NOT APPLICATION STATE"><script src="/react.js"></script><script src="/react-dom.js"></script><script type="module">
  import {buildApplication,nativeSubmit} from '/native-client.js';
  const schema=${JSON.stringify(schema)},initial=${JSON.stringify(values)},extras=${JSON.stringify(extras)};
  // Observe transport defaults without changing the native fetch arguments.
  const nativeFetch=window.fetch;window.transport=[];
  window.fetch=function(input,init){const request=new Request(input,init);window.transport.push({credentials:request.credentials,redirect:request.redirect,method:request.method,url:request.url,headers:Object.fromEntries(request.headers)});return Reflect.apply(nativeFetch,this,[input,init]);};
  window.assessments=0;window.outcomes=[];
  function App(){const[state,setState]=React.useState(initial);
   window.patchState=patch=>setState(previous=>({...previous,...patch}));
   window.submitNative=async options=>{const application=buildApplication(schema,state,extras.demographics,extras.compliance,extras.employments,extras.educations,new URLSearchParams(${JSON.stringify(params)}));
    try{const response=await nativeSubmit({...options,application,submitPath:location.href,recaptchaClient:options.enterprise?{performAssessment:async()=>{window.assessments++;await new Promise(resolve=>setTimeout(resolve,25));return options.enterprise;}}:undefined});window.outcomes.push({ok:response.ok});}catch{window.outcomes.push({rejected:true});}}
   return React.createElement('div',null,React.createElement('input',{id:'email',value:state.email,onChange:event=>setState({...state,email:event.target.value})}),React.createElement('span',{id:'ready'},'ready'));}
  ReactDOM.createRoot(document.querySelector('#root')).render(React.createElement(App));
  </script>`);
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(17322,'127.0.0.1',resolve));
try{
  // Reuse the available managed Chromium, or the repository's pinned browser in
  // CI. The executable selector must be explicit; no automatic downloads.
  const executable=process.env.NATIVE_CAPTURE_CHROMIUM;
  const launch={...browserOptions(),...(executable?{executablePath:executable}:{})};
  if(extensionMode){
    const extension=path.join(directory,'extension');await fs.mkdir(extension);
    await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Offline native request identity reader',version:'0.0.1',permissions:['tabs','scripting'],host_permissions:[origin+'/*'],background:{service_worker:'background.js'}}));
    await fs.writeFile(path.join(extension,'background.js'),`globalThis.readScope=async source=>{const tabs=await chrome.tabs.query({url:source});if(tabs.length!==1)throw new Error('ambiguous tab');const tabId=tabs[0].id;const frames=await chrome.scripting.executeScript({target:{tabId},func:()=>location.href});if(frames.length!==1||frames[0].result!==source||!frames[0].documentId)throw new Error('document scope');return {tabId,documentId:frames[0].documentId};};`);
    context=await chromium.launchPersistentContext(path.join(directory,'profile'),{...launch,timezoneId:'UTC',ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
    const events=[];context.on('serviceworker',item=>events.push({event:'created',url:item.url()}));
    try{worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});}
    catch(error){
      const diagnostic={scope:'Offline native identity reader startup only; unrelated to historical MV3 timeout',browser:context.browser().version(),events,currentWorkers:context.serviceWorkers().map(item=>item.url())};
      try{
        const page=await context.newPage();await page.goto('chrome://extensions/');
        diagnostic.extensions=await page.evaluate(()=>{
          const manager=document.querySelector('extensions-manager'),list=manager?.shadowRoot?.querySelector('extensions-item-list');
          return [...(list?.shadowRoot?.querySelectorAll('extensions-item')||[])].map(item=>({id:item.id,text:item.shadowRoot?.innerText?.slice(0,800)||''}));
        });await page.close();
      }catch(failure){diagnostic.inspectionError=String(failure.message).slice(0,500);}
      try{const policy=JSON.parse(await fs.readFile('/etc/chromium/policies/managed/extensions.json','utf8'));diagnostic.managedExtensionInstallBlocklist=policy.ExtensionInstallBlocklist;}catch{}
      await fs.writeFile(path.join(evidenceRoot,'greenhouse-native-request-mv3-startup.json'),JSON.stringify(diagnostic,null,2));
      console.error(JSON.stringify(diagnostic));throw error;
    }
    assert.match(worker.url(),/^chrome-extension:\/\/[a-p]{32}\//);
  }else{
    browser=await chromium.launch(launch);
    context=await browser.newContext({timezoneId:'UTC',serviceWorkers:'block'});
  }
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){external.push({method:request.method(),origin:url.origin});await route.abort('blockedbyclient');return;}
    if(request.method()!=='GET'){
      captures.push({url:request.url(),method:request.method(),body:request.postData(),headers:{'content-type':request.headers()['content-type']}});
      await route.abort('blockedbyclient');return;
    }
    await route.continue();
  });
  const page=await context.newPage();await page.goto(source);await page.waitForSelector('#ready');
  if(extensionMode){
    const actual=await worker.evaluate(source=>globalThis.readScope(source),source);
    Object.assign(spec,actual);Object.assign(spec.uploadProof,actual);
  }
  let captureId=0;
  const capture=async options=>{
    const before=captures.length;await page.evaluate(options=>window.submitNative(options),options);
    assert.equal(captures.length,before+1);
    const transport=await page.evaluate(()=>window.transport.at(-1));
    return {...captures.at(-1),...transport,body:captures.at(-1).body,requestId:'offline-'+(++captureId)};
  };
  const options={csrfToken:{key:'fictional_csrf_dynamic_71',value:'fictional-csrf-a'},fingerprint:'fictional-fingerprint-a',enterprise:'fictional-enterprise-a',captchaFailed:true,jobApplicationRequestToken:'fictional-request-token-a'};
  const expected={application:makeApplication(values),csrfToken:options.csrfToken,fingerprint:options.fingerprint,verification:{kind:'enterprise',value:options.enterprise},captchaFailed:true,requestToken:options.jobApplicationRequestToken};
  const request=await capture(options),binder=await createOfflineCapture({spec,schema,expected});
  const frozen=await binder.freeze(request,spec);
  assert.equal(await binder.revalidate(frozen,request,spec),true);
  assert.equal(await page.evaluate(()=>window.assessments),1);
  const body=JSON.parse(request.body);
  assert.equal(body.job_application.answers_attributes['18195689008'].text_value,'Fictional confirmed answer');
  assert.equal(body.job_application.answers_attributes['18195692008'].boolean_value,1);
  assert.equal(body.job_application.resume_url,reference);
  assert.equal(body[options.csrfToken.key],options.csrfToken.value);
  assert.equal(body['g-recaptcha-enterprise-token'],options.enterprise);
  assert.equal(body.request_token,options.jobApplicationRequestToken);
  assert.equal(body.captcha_retried,true);
  assert.equal(await page.inputValue('#dom-decoy'),'DOM IS NOT APPLICATION STATE');
  results.push('Actual Chromium captured the exact pinned Da/to JSON from React state, not the decoy DOM; async verification and dynamic CSRF retained.');

  // State-only change: the DOM decoy is unchanged but the native request differs.
  await page.evaluate(()=>window.patchState({question_18195689008:'Changed React answer'}));
  await page.waitForTimeout(30);
  const changed=await capture(options);
  assert.equal(JSON.parse(changed.body).job_application.answers_attributes['18195689008'].text_value,'Changed React answer');
  await assert.rejects(binder.revalidate(frozen,changed,spec),/STATE_OR_PROTOCOL_CHANGED/);
  await page.evaluate(()=>window.patchState({question_18195689008:'Fictional confirmed answer',resume:{name:'fictional.txt',url:location.origin+'/greenhouse-upload/same-name-wrong-object'}}));
  await page.waitForTimeout(30);
  const wrong=await capture(options),wrongBinder=await createOfflineCapture({spec,schema,expected});
  await assert.rejects(wrongBinder.freeze(wrong,spec),/STATE_OR_PROTOCOL_CHANGED/);
  results.push('Changing React question state or replacing a same-name attachment reference invalidates the authorized snapshot.');

  await page.evaluate(values=>window.patchState(values),values);await page.waitForTimeout(30);
  const securityOptions={csrfToken:{key:'another_dynamic_csrf_92',value:'fictional-csrf-b'},fingerprint:{fictional:'fingerprint-b'},enterprise:'MUST-NOT-BE-REQUESTED',securityCode:'fictional-security-code',jobApplicationRequestToken:'fictional-request-token-b'};
  const security=await capture(securityOptions);
  const secureBody=JSON.parse(security.body);
  assert.equal(secureBody.security_code,'fictional-security-code');assert.equal(secureBody['g-recaptcha-enterprise-token'],undefined);assert.equal(await page.evaluate(()=>window.assessments),3);
  const securityExpected={application:makeApplication(values),csrfToken:securityOptions.csrfToken,fingerprint:securityOptions.fingerprint,verification:{kind:'security-code',value:securityOptions.securityCode},requestToken:securityOptions.jobApplicationRequestToken};
  const securityBinder=await createOfflineCapture({spec:{...spec,authorizationId:'fictional-authorization-b'},schema,expected:securityExpected});
  await securityBinder.freeze(security,{...spec,authorizationId:'fictional-authorization-b'});
  await assert.rejects(binder.revalidate(frozen,request,{...spec,documentId:'new-document'}),/CONTEXT_CHANGED/);
  results.push('Security-code precedence, rotated CSRF key/value, fingerprint object and request token captured without requesting an enterprise token. A changed supplied document context invalidates binding.');
  assert.equal(received.length,0);assert.equal(external.length,0);
  assert.deepEqual(await page.evaluate(()=>window.outcomes),Array.from({length:4},()=>({rejected:true})));
  assert.equal(page.url(),source);
  if(extensionMode){
    await page.reload();await page.waitForSelector('#ready');
    const actual=await worker.evaluate(source=>globalThis.readScope(source),source);
    assert.equal(actual.tabId,spec.tabId);assert.notEqual(actual.documentId,spec.documentId);
    await assert.rejects(binder.revalidate(frozen,request,{...spec,...actual}),/CONTEXT_CHANGED/);
    results.push('Read-only temporary MV3 returned the actual tabId/documentId; same-tab reload changed documentId and invalidated the prior snapshot. This does not prove a product lifecycle gate.');
  }
  const report={scope:'Offline browser capture only; '+(extensionMode?'real MV3 identity reader; ':'')+'not a product gate, production acceptance or receipt validation',clientSha256:CLIENT_SHA256,fixtureSha256:sourceMetadata.fixture.sha256,schemaSha256:spec.schemaSha256,browser:context.browser().version(),node:process.version,actualMV3DocumentBinding:extensionMode,captures:captures.length,applicationRequestsReceived:received.length,externalRequests:external.length,confirmationNavigations:0,results,snapshot:binder.summary(frozen),limitations:['Historical client and schema only; current production compatibility is unknown.','Trusted fictional upload proof supplied; native upload binding is not recertified.','Harness aborts all POSTs. Product pre-send fail-closed mechanism remains unresolved.','No accepted request, response-loss/restart or official confirmation flow executed.','Browser-added HTTP session headers are not certified; the frozen transport is native fetch init plus JSON.']};
  await fs.writeFile(path.join(evidenceRoot,'greenhouse-native-request-browser.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{
  await context?.close();await browser?.close();await new Promise(resolve=>server.close(resolve));await removeTestDirectory(directory);
}
