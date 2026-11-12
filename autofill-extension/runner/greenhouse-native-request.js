import {receiptScope,verifiedUpload,boundApplication} from '../greenhouse-receipts.js';

export const sha256=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const equal=(a,b)=>canonical(a)===canonical(b);
const fail=reason=>{throw new Error('OFFLINE_NATIVE_'+reason);};
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};

export function expectedBody(expected) {
  const body={job_application:expected.application};
  if(expected.csrfToken){
    const {key,value}=expected.csrfToken;
    if(typeof key!=='string'||!key||['job_application','fingerprint','security_code','g-recaptcha-enterprise-token','captcha_retried','request_token','__proto__','constructor','prototype'].includes(key)||typeof value!=='string'||!value)fail('CSRF_SCOPE');
    body[key]=value;
  }
  const verification=expected.verification;
  if(!verification||!['none','security-code','enterprise'].includes(verification.kind))fail('VERIFICATION_SCOPE');
  if(verification.kind!=='none'){
    if(typeof verification.value!=='string'||!verification.value)fail('VERIFICATION_SCOPE');
    body[verification.kind==='security-code'?'security_code':'g-recaptcha-enterprise-token']=verification.value;
  }
  if(expected.captchaFailed===true)body.captcha_retried=true;
  if(expected.requestToken)body.request_token=expected.requestToken;
  body.fingerprint=expected.fingerprint;
  return JSON.parse(JSON.stringify(body));
}

function requestView(request) {
  if(!request||typeof request.body!=='string'||new TextEncoder().encode(request.body).length>12582912)fail('BODY');
  const headers=request.headers;
  if(!headers||Object.keys(headers).length!==1||headers['content-type']!=='application/json')fail('HEADERS');
  if(request.method!=='POST'||request.credentials!=='same-origin'||request.redirect!=='follow'||typeof request.requestId!=='string'||!request.requestId)fail('TRANSPORT');
  return {requestId:request.requestId,url:request.url,method:request.method,headers:{...headers},credentials:request.credentials,redirect:request.redirect,body:request.body};
}

export function createNativeCapture({spec,expected,scope,bindReferenceByDigest=false}) {
  ({spec,expected}=deepFreeze(structuredClone({spec,expected})));
  if(!receiptScope(spec)||!verifiedUpload(spec)||
    !['authorizationId','stateVersion','schemaSha256'].every(key=>typeof spec[key]==='string'&&!!spec[key])||
    !['profileVersion','resumeVersion'].every(key=>Number.isInteger(spec[key])&&spec[key]>0))fail('AUTHORIZATION');
  const body=expectedBody(expected);
  let reserved=false;
  const snapshots=new WeakMap();
  async function inspect(request,current) {
    if(!equal(current,spec))fail('CONTEXT_CHANGED');
    const view=requestView(request);
    if(view.url!==spec.submitUrl)fail('TARGET');
    let actual;
    try{actual=JSON.parse(view.body);}catch{fail('JSON');}
    // The pinned client's JSON.stringify representation disallows duplicate keys.
    if(JSON.stringify(actual)!==view.body)fail('STATE_OR_PROTOCOL_CHANGED');
    const comparison=bindReferenceByDigest&&actual?.job_application?
      {...actual,job_application:{...actual.job_application}}:actual;
    if(bindReferenceByDigest&&comparison?.job_application)delete comparison.job_application.resume_url;
    if(!equal(comparison,body))fail('STATE_OR_PROTOCOL_CHANGED');
    if(!await boundApplication(spec,actual)||bindReferenceByDigest&&typeof actual.job_application.resume_url!=='string')fail('UPLOAD_BINDING');
    return view;
  }
  return Object.freeze({
    async freeze(request,current) {
      if(reserved)fail('CAPTURE_ALREADY_USED');
      reserved=true;
      const view=await inspect(request,current);
      const frozen=deepFreeze({scope,context:structuredClone(spec),request:view,bodySha256:await sha256(view.body),requestSha256:await sha256(canonical(view))});
      snapshots.set(frozen,frozen.requestSha256);
      return frozen;
    },
    async revalidate(frozen,request,current) {
      if(!snapshots.has(frozen))fail('UNKNOWN_SNAPSHOT');
      const view=await inspect(request,current);
      if(await sha256(canonical(view))!==snapshots.get(frozen))fail('REQUEST_CHANGED');
      return true;
    },
    summary(frozen) {
      if(!snapshots.has(frozen))fail('UNKNOWN_SNAPSHOT');
      return {scope:frozen.scope,bodySha256:frozen.bodySha256,requestSha256:frozen.requestSha256,clientSha256:spec.clientSha256,schemaSha256:spec.schemaSha256,bytes:new TextEncoder().encode(frozen.request.body).length};
    }
  });
}
