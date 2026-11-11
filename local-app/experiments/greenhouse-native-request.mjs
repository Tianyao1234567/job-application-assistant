// Offline investigation only. No send/release method, production integration,
// storage or success receipt. The caller must supply a TRUSTED confirmed
// snapshot and native-upload proof, never a page message/DOM filename as proof.
import {receiptScope, verifiedUpload, boundApplication} from '../../autofill-extension/greenhouse-receipts.js';

export const CLIENT_SHA256='378c96ee0ba18cc20667ed84f7822c0d78d833296d843097040c47e2dfba2728';
export const sha256=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const equal=(a,b)=>canonical(a)===canonical(b);
const fail=reason=>{throw new Error('OFFLINE_NATIVE_'+reason);};
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};

function expectedBody(expected) {
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
  // Compare the JSON representation actually produced by the pinned client,
  // including omitted undefined properties (not invented transport fields).
  return JSON.parse(JSON.stringify(body));
}

function requestView(request) {
  if(!request||typeof request.body!=='string'||new TextEncoder().encode(request.body).length>12582912)fail('BODY');
  const headers=request.headers;
  if(!headers||Object.keys(headers).length!==1||headers['content-type']!=='application/json')fail('HEADERS');
  if(request.method!=='POST'||request.credentials!=='same-origin'||request.redirect!=='follow'||typeof request.requestId!=='string'||!request.requestId)fail('TRANSPORT');
  return {requestId:request.requestId,url:request.url,method:request.method,headers:{...headers},credentials:request.credentials,redirect:request.redirect,body:request.body};
}

// Complete schema/state equality deliberately supports only an exactly reviewed
// request. It does not infer missing answers, tokens or unsupported attachments.
export async function createOfflineCapture({spec,schema,expected}) {
  const approved=structuredClone({spec,schema,expected});
  ({spec,schema,expected}=approved);
  if(!receiptScope(spec)||!verifiedUpload(spec)||spec.clientSha256!==CLIENT_SHA256||await sha256(JSON.stringify(schema))!==spec.schemaSha256||
    !['authorizationId','stateVersion'].every(key=>typeof spec[key]==='string'&&!!spec[key])||
    !['profileVersion','resumeVersion'].every(key=>Number.isInteger(spec[key])&&spec[key]>0))fail('AUTHORIZATION');
  const application=expected.application;
  if(!application||application.resume||application.resume_text||application.cover_letter||application.cover_letter_url||application.cover_letter_text||
    application.attachments&&Object.keys(application.attachments).length||!await boundApplication(spec,{job_application:application}))fail('UPLOAD_BINDING');
  const body=expectedBody(expected);
  deepFreeze(approved);
  let reserved=false;
  const snapshots=new WeakMap();
  async function inspect(request,current) {
    if(!equal(current,spec))fail('CONTEXT_CHANGED');
    const view=requestView(request);
    if(view.url!==spec.submitUrl)fail('TARGET');
    let actual;try{actual=JSON.parse(view.body);}catch{fail('JSON');}
    // The pinned native client uses JSON.stringify. This also rejects duplicate
    // keys instead of silently certifying JSON.parse's last-wins interpretation.
    if(JSON.stringify(actual)!==view.body||!equal(actual,body))fail('STATE_OR_PROTOCOL_CHANGED');
    if(!await boundApplication(spec,actual))fail('UPLOAD_BINDING');
    return view;
  }
  return Object.freeze({
    async freeze(request,current) {
      if(reserved)fail('CAPTURE_ALREADY_USED');
      reserved=true; // Reserve before the first await: no concurrent reuse.
      const view=await inspect(request,current);
      const frozen=deepFreeze({scope:'offline-only',context:structuredClone(spec),request:view,bodySha256:await sha256(view.body),requestSha256:await sha256(canonical(view))});
      snapshots.set(frozen,frozen.requestSha256);
      return frozen;
    },
    async revalidate(frozen,request,current) {
      if(!snapshots.has(frozen))fail('UNKNOWN_SNAPSHOT');
      const view=await inspect(request,current);
      if(await sha256(canonical(view))!==snapshots.get(frozen))fail('REQUEST_CHANGED');
      return true;
    },
    // Safe evidence: deliberately excludes body, CSRF, verification values,
    // fingerprint, account and object URL. Raw snapshots stay in memory only.
    summary(frozen) {
      if(!snapshots.has(frozen))fail('UNKNOWN_SNAPSHOT');
      return {scope:frozen.scope,bodySha256:frozen.bodySha256,requestSha256:frozen.requestSha256,clientSha256:spec.clientSha256,schemaSha256:spec.schemaSha256,bytes:new TextEncoder().encode(frozen.request.body).length};
    }
  });
}
