// Preparation adapter only. No browser writes, networking or production support flag.
import {createHash} from 'node:crypto';

export function greenhouseIdentity(value) {
  let url;try{url=new URL(value);}catch{throw new Error('GREENHOUSE_IDENTITY');}
  const match=/^\/([a-z0-9_-]+)\/jobs\/(\d+)$/.exec(url.pathname);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['job-boards.greenhouse.io','boards.greenhouse.io'].includes(url.hostname)||!match)throw new Error('GREENHOUSE_IDENTITY');
  return {origin:url.origin,tenant:match[1],jobId:match[2],url:url.origin+url.pathname};
}

// Serializable DOM reader: never returns input values, hidden tokens or sessions.
export function readPublicApplication() {
  const visible=node=>!!node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
  const text=node=>(node?.innerText||node?.textContent||'').trim();
  const controls=[...document.querySelectorAll('input,textarea,select')].filter(node=>node.type!=='hidden'&&(visible(node)||node.type==='file'));
  if(controls.length>60)throw new Error('GREENHOUSE_FIELD_BUDGET');
  const fields=controls.map(node=>{
    const labelled=(node.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)).filter(Boolean);
    const label=[...(node.labels||[])].map(text).join('\n')||labelled.map(text).join('\n')||node.getAttribute('aria-label')||'';
    if(label.length>2000||(node.tagName==='SELECT'&&node.options.length>300))throw new Error('GREENHOUSE_QUESTION_BUDGET');
    const options=node.tagName==='SELECT'?[...node.options].map(option=>{const label=text(option);if(label.length>300)throw new Error('GREENHOUSE_OPTION_BUDGET');return {text:label,disabled:option.disabled};}):[];
    return {id:node.id||'',name:node.name||'',tag:node.tagName,type:node.type||'',label,nativeRequired:!!node.required,ariaRequired:node.getAttribute('aria-required')==='true',labelRequired:/\*/.test(label),accept:node.accept||'',empty:!node.value,options,optionsComplete:node.tagName==='SELECT',customControl:node.getAttribute('role')==='combobox'||node.getAttribute('aria-haspopup')==='listbox'};
  });
  return {url:location.href,title:document.title,fields,verificationVisible:[...document.querySelectorAll('iframe[src*=captcha i],iframe[src*=verify i],input[type=password],input[autocomplete=one-time-code]')].some(visible)};
}

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function purpose(field) {
  const value=field.label+' '+field.id+' '+field.name;
  if(/authorized|sponsor|citizen|work permit|工作许可/i.test(value))return 'work-authorization';
  if(/why.*(?:role|company|interested)|motivation|申请原因/i.test(value))return 'company-motivation';
  if(/gender|ethnicity|veteran|disability/i.test(value))return 'voluntary-sensitive';
  if(field.type==='file')return 'attachment';
  if(/^(?:first_name|last_name|preferred_name|email|phone|country|candidate-location)$/.test(field.id))return 'confirmed-profile-fact';
  return 'site-specific-question';
}

export function preparePublicApplication(snapshot,expected) {
  const identity=greenhouseIdentity(snapshot.url);
  if(identity.tenant!==expected.tenant||identity.jobId!==expected.jobId||!snapshot.title.toLowerCase().includes(expected.company.toLowerCase()))throw new Error('GREENHOUSE_SCOPE_CHANGED');
  if(!Array.isArray(snapshot.fields)||snapshot.fields.length===0||snapshot.fields.length>60)throw new Error('GREENHOUSE_FIELDS');
  const fields=snapshot.fields.map(field=>{
    if(typeof field.label!=='string'||field.label.length>2000||!['INPUT','TEXTAREA','SELECT'].includes(field.tag)||!['id','name','type','accept'].every(key=>typeof field[key]==='string'&&field[key].length<=300)||!Array.isArray(field.options)||field.options.length>300)throw new Error('GREENHOUSE_FIELD');
    const options=field.options.map(option=>{if(typeof option.text!=='string'||option.text.length>300)throw new Error('GREENHOUSE_OPTION');return {text:option.text,disabled:option.disabled===true};});
    const descriptor={id:field.id,name:field.name,tag:field.tag,type:field.type,originalQuestion:field.label,requiredEvidence:{native:field.nativeRequired===true,aria:field.ariaRequired===true,labelAsterisk:field.labelRequired===true},accept:field.accept,options,optionsComplete:field.optionsComplete===true,customControl:field.customControl===true};
    const version=digest(descriptor),category=purpose(field);
    return {...descriptor,required:Object.values(descriptor.requiredEvidence).some(Boolean),purpose:category,source:identity.url,version,scope:`greenhouse:${identity.tenant}:${identity.jobId}:${field.id||field.name||'unidentified'}:${version}`,defaultRemember:false,nextAction:category==='confirmed-profile-fact'?'match-confirmed-profile-before-any-write':category==='attachment'?'verify-selected-file-before-any-upload':'pause-for-exact-question-confirmation',unresolved:!field.label||(!field.id&&!field.name)||(field.customControl&&!field.optionsComplete),alreadyPopulated:field.empty!==true};
  });
  return {adapter:'greenhouse-public-preparation-v1',identity,title:snapshot.title,fields,structureVersion:digest(fields.map(({alreadyPopulated,...field})=>field)),verificationVisible:snapshot.verificationVisible===true,executionEnabled:false,productionSupported:false,pending:['Account identity and company/job recheck','Custom choices and required controls','Original-value and attachment protection','Durable pause/resume and exact question confirmation','Submission boundary and reliable receipt'],applicationPostsSent:0};
}
