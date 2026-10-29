import test from 'node:test';
import assert from 'node:assert/strict';
import {greenhouseQuestion,greenhouseAnswer} from '../greenhouse.mjs';
const site={adapter:'greenhouse-v1',origin:'https://job-boards.greenhouse.io',tenant:'mattermost'};
const task={jobId:'5381946008',url:site.origin+'/mattermost/jobs/5381946008'};
const q={key:'country',text:'Country*',scope:'greenhouse-v1:mattermost:5381946008:country:'+('a'.repeat(64)),version:'a'.repeat(64),source:task.url,purpose:'confirmed-profile-fact',type:'text',customControl:true,optionsComplete:false,required:true,options:[]};
test('dynamic choices remain unresolved until a concrete human-selected option is observed',()=>{
 assert.equal(greenhouseQuestion(site,task,q),null);
 assert.equal(greenhouseQuestion(site,task,{...q,manualSelection:true}),null);
 const observed=greenhouseQuestion(site,task,{...q,manualSelection:true,options:[{text:'Fictional observed country',disabled:false}]});
 assert.equal(observed.manualSelection,true);assert.equal(observed.optionsComplete,false);
 assert.equal(greenhouseAnswer(observed,'Fictional observed country'),'Fictional observed country');
 assert.throws(()=>greenhouseAnswer(observed,'Unobserved country'));
 assert.equal(greenhouseQuestion(site,task,{...q,manualSelection:true,options:[{text:'A'},{text:'B'}]}),null);
});

test('controlled production-protocol fixture accepts actual JSON bytes and uses an unmarked confirmation document',async()=>{
 const {startGreenhouseFixture,GREENHOUSE_REPLAY}=await import('../greenhouse-fixture.mjs');
 const {testDirectory,removeTestDirectory}=await import('../../autofill-extension/tests/runtime.mjs');
 const {createHash}=await import('node:crypto');const root=await testDirectory('greenhouse-json'),key='fictional-test-key-123456';let fixture;
 try{
  fixture=await startGreenhouseFixture({port:0,root,testMode:true,testKey:key});const job=GREENHOUSE_REPLAY.jobs[0].id;fixture.setScenario(job,{productionControls:true});
  const url=fixture.url+'/greenhouse/'+GREENHOUSE_REPLAY.tenant+'/jobs/'+job;
  const html=await(await fetch(url)).text();assert.match(html,/question_yes/);assert.match(html,/window\.__remixContext/);assert.match(html,/complete-verification/);
  const bytes=Buffer.from('Fictional JSON attachment.'),app={first_name:'Fictional',last_name:'Applicant',email:'fictional@example.invalid',country:GREENHOUSE_REPLAY.syntheticCountryChoices[0],phone:'10000000000','candidate-location':'Fictional Test City',question_1:'Fictional confirmed purpose',question_yes:'Yes',resume:{filename:'fictional.txt',content:bytes.toString('base64')}};
  const response=await fetch(url,{method:'POST',headers:{Origin:fixture.url,'Content-Type':'application/json'},body:JSON.stringify({job_application:app})});assert.equal(response.status,200);
  const result=await(await fetch(url+'/confirmation')).text();assert.doesNotMatch(result,/data-greenhouse-replay-receipt/);
  const proof=fixture.state();assert.equal(proof.submitRequests.length,1);assert.equal(proof.receipts.length,1);assert.equal(proof.receipts[0].sha256,createHash('sha256').update(bytes).digest('hex'));
 }finally{await fixture?.close();await removeTestDirectory(root);}
});
