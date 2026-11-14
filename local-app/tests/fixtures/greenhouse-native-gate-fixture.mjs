import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {archivedSchema,archivedClientSha,fullFields,fullValues,assertFullApplication} from './greenhouse-native-full-form.mjs';

import {currentClient,currentClientSha,currentQuestions,currentFields,currentValues,places,locationResponse,assertCurrentApplication} from './greenhouse-current-form.mjs';

export const fixtureOrigin='http://127.0.0.1:17322',fixtureTenant='native-gate',fixtureCompany='Fictional Native Company';
export const fixtureAccount='fictional@example.invalid';
export const fixtureJobs=['12345671','12345672','12345673','12345674'];
export const fixtureFaultJobs={replaced:'12345675',disabled:'12345676'};
const allJobs=[...fixtureJobs,...Object.values(fixtureFaultJobs)];
export const fixtureAnswers={first_name:'Fictional',last_name:'Applicant',question_123:'I confirm the fictional role motivation.'};
const base='/greenhouse/'+fixtureTenant;
export const jobURL=id=>fixtureOrigin+base+'/jobs/'+id;
const labels={first_name:'First Name',last_name:'Last Name',email:'Email',phone:'Phone',question_123:'Why are you interested in this role?',resume:'Resume/CV'};
const questions=Object.entries(labels).map(([name,label])=>({label,required:true,
  fields:[{name,type:name==='resume'?'input_file':name==='question_123'?'textarea':'input_text'}]}));
const phone='10000000000';
const csrf={key:'fixture_dynamic_csrf',value:fixtureAccount+'-fictional-csrf'};
const requestToken='fictional-request-token',fingerprint='fictional-browser-fingerprint';
const cookie='fictional_native=synthetic-session';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const reference=key=>fixtureOrigin+'/greenhouse-upload/'+key;
const uploadKey=id=>'object-'+id;
const page=(title,body)=>'<!doctype html><meta charset="utf-8"><title>'+title+' at '+fixtureCompany+'</title><body>'+body+'</body>';
const input=(key,type)=>'<p><label for="'+key+'">'+labels[key]+'*</label><input id="'+key+'" name="'+key+'" type="'+type+'" required></p>';

function applicationPage(id,full,dynamic){
  const url=jobURL(id),submit=new URL(url).pathname,confirmation=submit+'/confirmation';
  const jobPost={public_url:url,...(dynamic?currentQuestions:{questions:full?archivedSchema.questions:questions}),...(full?{fingerprint}: {})};
  const loader={urlToken:fixtureTenant,jobPostId:id,submitPath:submit,confirmationPath:confirmation,jobPost,
    csrfToken:csrf,jobApplicationRequestToken:requestToken,...(full?{clientSha256:dynamic?currentClientSha:archivedClientSha}:{fingerprint})};
  const remix={state:{loaderData:{'routes/$url_token_.jobs_.$job_post_id':loader}}};
  const script=[
    'import {buildApplication,nativeSubmit} from "/native-fixture-client.js";',
    'const loader=window.__remixContext.state.loaderData["routes/$url_token_.jobs_.$job_post_id"];',
    'const form=document.querySelector("form"),input=form.elements.resume;',
    ...(full&&!dynamic?['const location='+JSON.stringify({location:'Fictional Test City',latitude:'35.0001',longitude:'139.0001',country_short_name:'JP'})+';']:[]),
    ...(dynamic?['const places='+JSON.stringify(places)+';',
      'const ethnicity=document.querySelector("#hispanic_ethnicity"),slot=document.querySelector("#race-slot");',
      'ethnicity.addEventListener("change",()=>{slot.replaceChildren();if(ethnicity.value==="0")slot.append(document.querySelector("#race-template").content.cloneNode(true));});',
      'slot.addEventListener("change",event=>{if(event.target.value==="8"){ethnicity.value="2";slot.replaceChildren();}});']:[]),
    'let resume;',
    'input.addEventListener("change",()=>{',
    '  const xhr=new XMLHttpRequest(),body=new FormData(),file=input.files[0],key='+JSON.stringify(uploadKey(id))+';',
    '  body.append("key",key);body.append("file",file);',
    '  xhr.open("POST",window.location.origin+"/greenhouse-upload");',
    '  xhr.addEventListener("load",()=>{if(xhr.status!==204)return;',
    '    resume={name:file.name,url:window.location.origin+"/greenhouse-upload/"+'+(id===fixtureJobs[1]?'"other-fictional-object"':'key')+'};',
    '    const group=input.closest("fieldset"),label=document.createElement("div");',
    '    label.className="file-upload__filename";label.textContent=file.name;',
    '    group.querySelector("label").remove();input.remove();group.append(label);',
    '  });',
    '  xhr.send(body);',
    '});',
    'form.addEventListener("submit",async event=>{',
    '  event.preventDefault();form.dataset.nativeSubmitCalls=String(Number(form.dataset.nativeSubmitCalls||0)+1);',
    '  const values=Object.fromEntries([...form.elements].filter(input=>input.name).map(input=>[input.name,input.value]));',
    '  const application=buildApplication(loader.jobPost,{...'+(dynamic?'('+currentValues.toString()+')(values,places)':full?'('+fullValues.toString()+')(values)':'values')+',resume},[],{},[],[],new URLSearchParams(window.location.search));',
    '  try{const response=await nativeSubmit({application,submitPath:loader.submitPath,csrfToken:loader.csrfToken,',
    '    fingerprint:'+(full?'loader.jobPost.fingerprint':'loader.fingerprint')+',jobApplicationRequestToken:loader.jobApplicationRequestToken});',
    '    if(response.ok)window.location.assign(loader.confirmationPath);',
    '  }catch{form.dataset.nativeSubmitOutcome="rejected";}',
    '});'
  ].join('\n');
  return page('Fictional native vacancy '+id,'<h1>Fictional native vacancy '+id+'</h1><p class="job-location">Fictional Test City</p>'+
    '<form data-greenhouse-replay data-tenant="'+fixtureTenant+'" data-job-id="'+id+'" method="post" action="'+submit+'">'+
    (dynamic?currentFields():full?fullFields():input('first_name','text')+input('last_name','text')+input('email','email')+input('phone','tel')+
    '<fieldset class="file-upload"><legend id="upload-label-resume">Resume/CV*</legend><label for="resume">Attach</label>'+
    '<input id="resume" name="resume" type="file" accept=".txt" required></fieldset>'+
    '<p><label for="question_123">'+labels.question_123+'*</label><textarea id="question_123" name="question_123" required></textarea></p>')+
    '<button type="submit">Submit application</button></form><script>window.__remixContext = '+JSON.stringify(remix)+'</script>'+
    '<script type="module">'+script+'</script>');
}

async function read(request){
  const chunks=[];let bytes=0;
  for await(const part of request){
    bytes+=part.length;
    if(bytes>65536)throw new Error('Fixture body too large');
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

export async function startNativeFixture(directory,resume,{full=false,dynamic=false}={}){
  const client=dynamic?currentClient:await fs.readFile(new URL('./greenhouse-native-client.js',import.meta.url));
  const uploads=new Map([['other-fictional-object',{name:resume.name,sha256:digest(Buffer.alloc(resume.bytes.length,88)),size:resume.bytes.length}]]);
  const state=Object.fromEntries(allJobs.map(id=>[id,{posts:0,accepted:0,confirmations:0,responseDropped:0}]));
  const connections=new WeakMap(),traces=Object.fromEntries(allJobs.map(id=>[id,[]]));
  let nextConnection=0;
  const accepted={},acceptanceFile=path.join(directory,'accepted.json');
  const respond=(response,status,body='',headers={})=>{
    response.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...headers});
    response.end(body);
  };
  const server=http.createServer(async(request,response)=>{
    try{
      if(!connections.has(request.socket))connections.set(request.socket,{id:++nextConnection,requests:0});
      const connection=connections.get(request.socket);
      const reused=connection.requests++>0;
      const url=new URL(request.url,fixtureOrigin);
      if(dynamic&&url.pathname==='/greenhouse-locations'&&request.method==='GET')
        return respond(response,200,JSON.stringify(locationResponse(url.searchParams.get('q'))),{'Content-Type':'application/json'});
      if(url.pathname==='/native-fixture-client.js'&&request.method==='GET')
        return respond(response,200,client,{'Content-Type':'text/javascript'});
      if(url.pathname==='/greenhouse-upload'&&request.method==='POST'){
        assert.equal(request.headers.origin,fixtureOrigin);
        assert.equal(request.headers.cookie,cookie);
        const form=await new Request(fixtureOrigin,{method:'POST',headers:{'Content-Type':request.headers['content-type']},body:await read(request)}).formData();
        assert.equal(form.getAll('key').length,1);
        assert.equal(form.getAll('file').length,1);
        const key=form.get('key'),file=form.get('file');
        assert.ok(allJobs.some(id=>key===uploadKey(id)));
        assert.ok(file instanceof File);
        const bytes=Buffer.from(await file.arrayBuffer());
        assert.equal(file.name,resume.name);
        assert.deepEqual(bytes,resume.bytes);
        uploads.set(key,{name:file.name,sha256:digest(bytes),size:bytes.length});
        return respond(response,204);
      }
      const match=/^\/greenhouse\/native-gate\/jobs\/(\d+)(\/confirmation|\/receipt)?$/.exec(url.pathname);
      if(!match||!Object.hasOwn(state,match[1]))return respond(response,404,'Fictional path missing');
      const [,id,suffix]=match,counts=state[id];
      if(request.method==='GET'){
        if(suffix==='/confirmation'){
          counts.confirmations++;
          return respond(response,200,page('Fictional confirmation','<h1>Received</h1>'));
        }
        if(suffix)return respond(response,200,page('Fictional status','<h1>Result unavailable</h1>'));
        return respond(response,200,applicationPage(id,full,dynamic),{'Set-Cookie':cookie+'; Path=/; HttpOnly; SameSite=Strict'});
      }
      if(suffix||request.method!=='POST')return respond(response,405);
      counts.posts++;
      assert.equal(request.headers.origin,fixtureOrigin);
      assert.equal(request.headers.cookie,cookie);
      assert.equal(request.headers['content-type'],'application/json');
      const bytes=await read(request),body=JSON.parse(bytes),key=uploadKey(id),file=uploads.get(key);
      assert.ok(file);
      traces[id].push({connectionId:connection.id,reused,bodySha256:digest(bytes)});
      if(full){
        if(dynamic)assertCurrentApplication(body.job_application,reference(key),file,id);
        else assertFullApplication(body.job_application,reference(key),file);
        assert.deepEqual({...body,job_application:null},{job_application:null,[csrf.key]:csrf.value,request_token:requestToken,fingerprint});
      }else assert.deepEqual(body,{
        job_application:{first_name:fixtureAnswers.first_name,last_name:fixtureAnswers.last_name,email:fixtureAccount,phone,
          answers_attributes:{123:{question_id:'123',priority:0,text_value:fixtureAnswers.question_123}},
          demographic_answers:[],data_compliance:{},attachments:{},from_job_board_renderer:true,employments:[],
          resume_url:reference(key),resume_url_filename:file.name,mapped_url_token:null,appcast_click_id:null,time_zone:'UTC'},
        [csrf.key]:csrf.value,request_token:requestToken,fingerprint
      });
      // Keep raw arrivals visible. On this fixture an identical retry after
      // acceptance cannot create a second record, and the reply is still lost.
      if(accepted[id]){
        assert.equal(id,fixtureJobs[3]);
        assert.equal(accepted[id].bodySha256,digest(bytes));
        request.socket.destroy();
        return;
      }
      accepted[id]={...file,referenceSha256:digest(reference(key)),bodySha256:digest(bytes)};
      const temporary=acceptanceFile+'.tmp';
      await fs.writeFile(temporary,JSON.stringify(accepted),{flag:'wx'});
      await fs.rename(temporary,acceptanceFile);
      counts.accepted++;
      if(id===fixtureJobs[3]){
        counts.responseDropped++;
        request.socket.destroy();
        return;
      }
      respond(response,200,'{"accepted":true}',{'Content-Type':'application/json'});
    }catch(error){
      console.error('Fictional receiver rejected request: '+error.message);
      respond(response,400,'Fictional application rejected');
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17322,'127.0.0.1',resolve);});
  return {acceptanceFile,counts:id=>({...state[id]}),accepted:id=>({...accepted[id]}),
    trace:id=>structuredClone(traces[id]),
    close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
