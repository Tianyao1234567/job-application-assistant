// Controlled local analogue of the observed Greenhouse application. All accounts,
// options and receipts are synthetic. This module never contacts Greenhouse.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import {RUNTIME} from './paths.mjs';

export const GREENHOUSE_REPLAY = Object.freeze({
  tenant:'mattermost-replay', company:'Fictional Mattermost Replay',
  jobs:[{id:'5381946008',title:'Fictional Software Engineer',location:'Fictional Test City'},
    {id:'5381946009',title:'Fictional Software Engineer Recovery',location:'Fictional Test City'},
    {id:'5381946010',title:'Fictional Software Engineer Safeguards',location:'Fictional Test City'}],
  source:'https://job-boards.greenhouse.io/mattermost/jobs/5381946008',
  observedLabels:['First Name*','Last Name*','Email*','Country*','Phone*','Location (City)*',
    'Why are you interested in this role at Mattermost?*','How did you hear about Mattermost?*'],
  fixtureOnly:true,
  // Production custom choices and attachment group requiredness were not observed.
  syntheticCountryChoices:['Fictional Test Country','Fictional Alternate Country'],
  syntheticSourceChoices:['Fictional test referral','Fictional test careers page']
});
const MAX_BODY=9*1024*1024, MAX_FILE=8*1024*1024;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class RequestError extends Error {constructor(status,message){super(message);this.status=status;}}
function directory(value){
  const root=path.resolve(value||path.join(RUNTIME,'greenhouse-replay'));
  const relative=path.relative(RUNTIME,root);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Replay data must stay inside .runtime');
  fs.mkdirSync(RUNTIME,{recursive:true});
  if(fs.realpathSync(RUNTIME)!==RUNTIME)throw new Error('Replay runtime must not be a symlink');
  let ancestor=root;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  const realRelative=path.relative(RUNTIME,fs.realpathSync(ancestor));
  if(realRelative==='..'||realRelative.startsWith('..'+path.sep)||path.isAbsolute(realRelative))throw new Error('Replay data must not escape .runtime through a symlink');
  fs.mkdirSync(root,{recursive:true,mode:0o700});return root;
}
async function readBody(request,maximum=MAX_BODY){
  let length=0;const parts=[];
  for await(const part of request){length+=part.length;if(length>maximum)throw new RequestError(413,'Replay request is too large');parts.push(part);}
  return Buffer.concat(parts);
}
const send=(response,status,body,type='text/html; charset=utf-8',headers={})=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});response.end(body);};
const json=(response,status,value)=>send(response,status,JSON.stringify(value),'application/json; charset=utf-8');
function documentPage(title,content){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 20px}label,legend{display:block;font-weight:600}input:not([type=file]),select,textarea{display:block;width:95%;padding:8px}fieldset,.field{margin:15px 0;padding:10px}textarea{min-height:60px}button{padding:12px}</style></head><body><aside data-fixture-only>Fictional local replay only. Country/source options and receipt markers are synthetic, not observed production evidence.</aside>${content}</body></html>`;}
const identity=(tenant,jobId,account)=>`${tenant}:${jobId}:${account}`;

export async function startGreenhouseFixture({port=17322,host='127.0.0.1',root,testMode=false,testKey}={}){
  if(host!=='127.0.0.1'||!Number.isInteger(port)||port<0||port>65535)throw new Error('Replay fixture must use IPv4 loopback');
  if(testMode&&(typeof testKey!=='string'||testKey.length<16))throw new Error('Explicit replay test mode requires a test key');
  const dataDir=directory(root),stateFile=path.join(dataDir,'greenhouse-state.json'),uploads=path.join(dataDir,'uploads');
  fs.mkdirSync(uploads,{recursive:true,mode:0o700});
  let persisted;
  try{persisted=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const state=persisted||{receipts:{},submitRequests:[]},scenarios=new Map(),stagedUploads=new Map();
  if(!state.receipts||!Array.isArray(state.submitRequests))throw new Error('Invalid replay persisted state');
  let actualPort=port;
  const origin=()=>`http://127.0.0.1:${actualPort}`;
  const persist=()=>{const temporary=path.join(dataDir,'state-'+randomUUID()+'.tmp');fs.writeFileSync(temporary,JSON.stringify(state),{mode:0o600,flag:'wx'});fs.renameSync(temporary,stateFile);};
  const getState=()=>structuredClone({fixtureOnly:true,receipts:Object.values(state.receipts),submitRequests:state.submitRequests});
  function setScenario(jobId,value){
    if(!testMode)throw new Error('Replay scenario hooks are disabled');
    if(!GREENHOUSE_REPLAY.jobs.some(job=>job.id===jobId)||!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid replay scenario');
    const allowed=new Set(['loseReceipt','hideReceipt','structureChange','wrongIdentity','verification','customIncomplete','sourceQuestion','productionControls','badWire']);
    if(Object.entries(value).some(([key,entry])=>!allowed.has(key)||typeof entry!=='boolean'))throw new Error('Invalid replay scenario');
    scenarios.set(jobId,{...scenarios.get(jobId),...value});
  }
  function validOrigin(request,pathname){
    if(request.headers.host!==`127.0.0.1:${actualPort}`)throw new RequestError(403,'Replay Host mismatch');
    if(request.headers.origin&&request.headers.origin!==origin())throw new RequestError(403,'Replay Origin mismatch');
    const navigation=request.method==='GET'&&!request.headers.origin&&request.headers['sec-fetch-mode']==='navigate'&&request.headers['sec-fetch-dest']==='document'&&/^\/greenhouse\/[a-z0-9_-]+(?:\/jobs\/\d+(?:\/receipt)?)?$/.test(pathname);
    if(request.headers['sec-fetch-site']==='cross-site'&&!navigation)throw new RequestError(403,'Replay cross-site request rejected');
  }
  function receiptPage(receipt){
    return documentPage(`Application received at ${GREENHOUSE_REPLAY.company}`,`<h1>Synthetic replay receipt</h1><section data-greenhouse-replay-receipt data-receipt-id="${escape(receipt.id)}" data-tenant="${escape(receipt.tenant)}" data-job-id="${escape(receipt.jobId)}" data-account="${escape(receipt.account)}" data-file-name="${escape(receipt.fileName)}" data-file-size="${receipt.fileSize}" data-sha256="${receipt.sha256}"><p>Actual local multipart received once. This is not a production Greenhouse receipt.</p><p>${escape(receipt.id)}</p></section>`);
  }
  function formPage(job,scenario){
    const company=scenario.wrongIdentity?'Other Fictional Company':GREENHOUSE_REPLAY.company;
    const input=(id,label,type='text',required=true)=>`<div class="field"><label for="${id}">${escape(label)}</label><input id="${id}" name="${id}" type="${type}"${required?' required':''}></div>`;
    const source=scenario.sourceQuestion?`<div class="field"><label for="question_2">How did you hear about Mattermost?*</label><select id="question_2" name="question_2" required><option value="">Select a fictional fixture choice</option>${GREENHOUSE_REPLAY.syntheticSourceChoices.map(value=>`<option value="${escape(value)}">${escape(value)}</option>`).join('')}</select></div>`:'';
    const custom=scenario.customIncomplete?'<div class="field"><label for="question_custom">Unobserved fixture-only custom choice*</label><input id="question_custom" name="question_custom" role="combobox" aria-expanded="false" aria-haspopup="listbox" required><div id="custom_choices" hidden></div></div>':'';
    return documentPage(`Job Application for ${job.title} at ${company}`,`<h1>${escape(job.title)}</h1><p class="company-name">${escape(company)}</p><p class="job-location">${escape(job.location)}</p><form id="application_form" data-greenhouse-replay data-tenant="${GREENHOUSE_REPLAY.tenant}" data-job-id="${job.id}" method="post" enctype="multipart/form-data" action="/greenhouse/${GREENHOUSE_REPLAY.tenant}/jobs/${job.id}"><input type="hidden" name="tenant" value="${GREENHOUSE_REPLAY.tenant}"><input type="hidden" name="jobId" value="${job.id}">${input('first_name','First Name*')}${input('last_name','Last Name*')}${input('preferred_name','Preferred First Name','text',false)}${input('email','Email*','email')}<div class="field"><label for="country">Country*</label><select id="country" name="country" required><option value="">Select a fictional country</option>${GREENHOUSE_REPLAY.syntheticCountryChoices.map(value=>`<option value="${escape(value)}">${escape(value)}</option>`).join('')}</select></div>${input('phone','Phone*','tel')}${input('candidate-location','Location (City)*')}<fieldset data-fixture-only-required><legend>Resume/CV*</legend><label for="resume">Attach</label><input id="resume" name="resume" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" required></fieldset><fieldset data-fixture-only-required><legend>Cover Letter (optional)</legend><label for="cover_letter">Attach</label><input id="cover_letter" name="cover_letter" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"></fieldset><div class="field"><label for="question_1">Why are you interested in this role at Mattermost?${scenario.structureChange?' — changed fixture question':''}*</label><textarea id="question_1" name="question_1" required></textarea></div>${source}${custom}${scenario.verification?'<p data-manual-verification>Human verification required in this synthetic fixture</p><iframe title="Fixture-only manual CAPTCHA" src="/fixture-captcha" style="width:250px;height:60px"></iframe>':''}<button id="submit_app" type="submit">Submit application</button></form>`);
  }
  async function parsedForm(request,production=false){
    const type=request.headers['content-type']||'';
    if(production&&/^application\/json/.test(type)){
      const app=JSON.parse((await readBody(request)).toString()).job_application;
      if(!app||typeof app.email!=='string'||typeof app.resume?.content!=='string'&&!stagedUploads.has(app.resume_url))throw new RequestError(400,'Invalid synthetic JSON');
      const fields=Object.fromEntries(Object.entries(app).filter(([key,value])=>key!=='resume'&&typeof value==='string'));
      fields.tenant=GREENHOUSE_REPLAY.tenant;fields.jobId=new URL(request.url,origin()).pathname.split('/').at(-1);
      return {fields,files:{resume:app.resume?{name:app.resume.filename,type:'text/plain',bytes:Buffer.from(app.resume.content,'base64')}:{name:app.resume_url_filename,type:'text/plain',bytes:stagedUploads.get(app.resume_url)}}};
    }
    if(!/^multipart\/form-data;\s*boundary=/i.test(type))throw new RequestError(415,'Replay application requires native multipart');
    const bytes=await readBody(request);
    let form;try{form=await new Request(origin(),{method:'POST',headers:{'Content-Type':type},body:bytes}).formData();}catch{throw new RequestError(400,'Invalid replay multipart');}
    const fields=Object.create(null),files=Object.create(null),allowed=new Set(['tenant','jobId','first_name','last_name','preferred_name','email','country','phone','candidate-location','question_1','question_2','question_custom','resume','cover_letter']);
    for(const [name,value]of form){
      if(!allowed.has(name)||Object.hasOwn(fields,name)||Object.hasOwn(files,name))throw new RequestError(400,'Invalid or repeated replay field');
      if(typeof value==='string'){
        if(value.length>10000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw new RequestError(400,'Invalid replay field text');fields[name]=value;
      }else{
        if(!['resume','cover_letter'].includes(name))throw new RequestError(400,'Unexpected replay file');
        if(!value.name&&!value.size)continue;
        if(!value.name||value.name.length>200||/[\\/\x00-\x1f\x7f]/.test(value.name)||value.size<1||value.size>MAX_FILE)throw new RequestError(400,'Invalid replay attachment');
        files[name]={name:value.name,type:value.type,bytes:Buffer.from(await value.arrayBuffer())};
      }
    }
    return {fields,files};
  }
  const server=http.createServer(async(request,response)=>{
    try{
      const parsed=new URL(request.url,origin()),pathname=parsed.pathname;validOrigin(request,pathname);
      if(pathname.startsWith('/__greenhouse_test/')){
        if(!testMode)throw new RequestError(404,'Replay hooks are disabled');
        const supplied=Buffer.from(request.headers['x-fixture-test-key']||''),expected=Buffer.from(testKey);
        if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new RequestError(403,'Replay test authorization failed');
        if(request.method==='GET'&&pathname==='/__greenhouse_test/state')return json(response,200,getState());
        if(request.method==='POST'&&pathname==='/__greenhouse_test/scenario'){
          if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||''))throw new RequestError(415,'Replay scenario requires JSON');
          let body;try{body=JSON.parse((await readBody(request,4096)).toString());setScenario(body.jobId,body.scenario);}catch{throw new RequestError(400,'Invalid replay scenario');}
          return json(response,200,{ok:true});
        }
        throw new RequestError(404,'Unknown replay test hook');
      }
      if(testMode&&request.method==='POST'&&/^\/greenhouse-upload\/[a-z0-9-]+$/.test(pathname)){
        const bytes=await readBody(request),url=origin()+pathname;
        if(!bytes.toString().includes('Fictional Greenhouse replay resume.'))throw new RequestError(400,'Fictional upload only');
        stagedUploads.set(url,bytes);return json(response,200,{url});
      }
      if(pathname==='/fixture-captcha'&&request.method==='GET')return send(response,200,'Synthetic manual verification. No challenge solving supported.');
      const match=/^\/greenhouse\/([a-z0-9_-]+)(?:\/jobs\/(\d+)(\/(?:receipt|confirmation))?)?$/.exec(pathname);
      if(!match||match[1]!==GREENHOUSE_REPLAY.tenant)throw new RequestError(404,'Unknown replay tenant or path');
      const [,tenant,jobId,isReceipt]=match,job=GREENHOUSE_REPLAY.jobs.find(value=>value.id===jobId),scenario=scenarios.get(jobId)||{};
      if(!jobId&&request.method==='GET')return send(response,200,documentPage(`Careers at ${GREENHOUSE_REPLAY.company}`,`<h1>${GREENHOUSE_REPLAY.company}</h1>${GREENHOUSE_REPLAY.jobs.map(value=>`<section><a href="/greenhouse/${tenant}/jobs/${value.id}">${escape(value.title)}</a><p class="job-location">${escape(value.location)}</p></section>`).join('')}`));
      if(!job)throw new RequestError(404,'Unknown replay job');
      if(request.method==='GET'){
        if(scenario.productionControls&&isReceipt==='/confirmation')return send(response,200,documentPage(`Application received at ${GREENHOUSE_REPLAY.company}`,'<h1>Synthetic confirmation document without receipt markers</h1>'));
        // A cookie binds the rendered synthetic receipt to this browser's applicant.
        const cookie=/(?:^|;\s*)greenhouse_replay=([a-f0-9-]{36})(?:;|$)/.exec(request.headers.cookie||'')?.[1];
        const receipt=Object.values(state.receipts).find(value=>value.tenant===tenant&&value.jobId===jobId&&value.browserId===cookie);
        if(receipt&&!scenario.hideReceipt&&!(scenario.loseReceipt&&parsed.searchParams.get('pending')==='1'))return send(response,200,receiptPage(receipt));
        if(isReceipt||receipt)return send(response,200,documentPage(`Application status at ${GREENHOUSE_REPLAY.company}`,'<h1>Application result unverified</h1><p>No reliable receipt is visible. Do not submit again.</p>'));
        if(scenario.productionControls){const {productionReplay}=await import('./tests/greenhouse-production-fixture.mjs');return send(response,200,productionReplay(formPage(job,{...scenario,verification:false}),{job,scenario,origin:origin(),tenant}));}
        return send(response,200,formPage(job,scenario));
      }
      if(request.method!=='POST'||isReceipt)throw new RequestError(405,'Replay method is not allowed');
      const attempt={id:randomUUID(),tenant,jobId,at:new Date().toISOString(),accepted:false,outcome:'pending'};state.submitRequests.push(attempt);persist();
      try{
        const {fields,files}=await parsedForm(request,scenario.productionControls);
        if(fields.tenant!==tenant||fields.jobId!==jobId)throw new RequestError(409,'Replay tenant or job identity changed');
        if(!/^[^\s@]+@example\.(?:invalid|test)$/.test(fields.email||''))throw new RequestError(400,'Only explicitly fictional applicant email is accepted');
        const key=identity(tenant,jobId,fields.email);
        if(state.receipts[key])throw new RequestError(409,'Replay applicant already submitted; duplicate is not accepted');
        if(!['first_name','last_name','phone','candidate-location','question_1'].every(name=>fields[name]?.trim())||!GREENHOUSE_REPLAY.syntheticCountryChoices.includes(fields.country)||scenario.sourceQuestion&&!GREENHOUSE_REPLAY.syntheticSourceChoices.includes(fields.question_2))throw new RequestError(400,'Replay required fields or exact synthetic options are missing');
        if(scenario.verification)throw new RequestError(403,'Synthetic manual verification is still pending');
        if(!files.resume)throw new RequestError(400,'Replay resume is required by this fixture, not a production conclusion');
        const existingBrowser=/(?:^|;\s*)greenhouse_replay=([a-f0-9-]{36})(?:;|$)/.exec(request.headers.cookie||'')?.[1];
        const file=files.resume,id=randomUUID(),browserId=existingBrowser||randomUUID(),receipt={id,tenant,jobId,account:fields.email,browserId,fileName:file.name,fileSize:file.bytes.length,sha256:createHash('sha256').update(file.bytes).digest('hex'),receivedAt:new Date().toISOString(),fixtureOnly:true,fields:{...fields}};
        fs.writeFileSync(path.join(uploads,id+'.bin'),file.bytes,{mode:0o600,flag:'wx'});state.receipts[key]=receipt;
        attempt.accepted=true;attempt.outcome='accepted';attempt.account=fields.email;
        try{persist();}catch(error){delete state.receipts[key];attempt.accepted=false;fs.unlinkSync(path.join(uploads,id+'.bin'));throw error;}
        if(scenario.productionControls)return json(response,200,{accepted:true,fixtureOnly:true});
        return send(response,303,'','text/html; charset=utf-8',{'Set-Cookie':`greenhouse_replay=${browserId}; Path=/greenhouse/${tenant}; HttpOnly; SameSite=Strict`,Location:`/greenhouse/${tenant}/jobs/${jobId}/receipt${scenario.loseReceipt?'?pending=1':''}`});
      }catch(error){attempt.outcome=error instanceof RequestError?'rejected':'storage-failure';persist();throw error;}
    }catch(error){if(!response.headersSent)json(response,error instanceof RequestError?error.status:500,{ok:false,error:error instanceof RequestError?error.message:'Replay fixture failed'});else response.end();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});
  actualPort=server.address().port;persist();
  return {server,url:origin(),port:actualPort,dataDir,state:getState,setScenario,close:()=>new Promise((resolve,reject)=>{if(!server.listening)return resolve();server.close(error=>error?reject(error):resolve());server.closeIdleConnections();})};
}
