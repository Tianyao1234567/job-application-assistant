// Read-only browser network evidence, armed only by our registered runner for
// one confirmed task. Request bodies/tokens never enter storage or diagnostics.
export function receiptScope(spec) {
  if(!spec||typeof spec.taskId!=='string'||typeof spec.profileId!=='string'||!/^\d{1,30}$/.test(spec.jobId)||!/^[a-z0-9_-]{1,80}$/.test(spec.tenant)||!/^\S+@\S+\.\S+$/.test(spec.account||'')||!/^[a-f0-9]{64}$/.test(spec.file?.sha256||'')||!Number.isInteger(spec.file?.size)||spec.file.size<1||spec.file.size>8388608||typeof spec.file.name!=='string'||!spec.file.name||/[\\/\x00-\x1f]/.test(spec.file.name)||!Number.isInteger(spec.tabId)||spec.tabId<0)return false;
  try{
    const source=new URL(spec.source),submit=new URL(spec.submitUrl),confirmation=new URL(spec.confirmationUrl);
    const prefix=(spec.replay?'/greenhouse':'')+'/'+spec.tenant+'/jobs/'+spec.jobId;
    const allowed=spec.replay?source.origin==='http://127.0.0.1:17322':source.origin==='https://job-boards.greenhouse.io'&&spec.tenant==='mattermost';
    return allowed&&source.pathname===prefix&&!source.username&&!source.password&&submit.pathname===prefix&&!submit.username&&!submit.password&&(submit.origin===source.origin||!spec.replay&&submit.origin==='https://boards.greenhouse.io')&&confirmation.origin===source.origin&&confirmation.pathname===prefix+'/confirmation';
  }catch{return false;}
}
const hex=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function boundApplication(spec,body) {
  if(!receiptScope(spec)||!body||typeof body!=='object')return false;
  const application=body.job_application;
  if(application?.resume&&application.resume_url||application?.cover_letter_url||application?.attachments&&Object.keys(application.attachments).length)return false;
  if(!application||typeof application.email!=='string'||application.email.trim().toLowerCase()!==spec.account.toLowerCase())return false;
  // Official La() serializes an already uploaded file as a URL and filename.
  // This is a client file/accepted-upload binding, not a server byte readback.
  if(spec.uploadedResumeConfirmed===true&&application.resume_url_filename===spec.file.name&&typeof application.resume_url==='string'&&application.resume_url.length<=2048&&!application.resume){
    try{
      const url=new URL(application.resume_url);
      const allowed=spec.replay?url.origin==='http://127.0.0.1:17322'&&/^\/greenhouse-upload\/[a-z0-9-]+$/.test(url.pathname):url.protocol==='https:'&&/^(?:[a-z0-9.-]+\.)?s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname);
      return allowed&&!url.username&&!url.password&&!url.hash&&!url.search;
    }catch{return false;}
  }
  const resume=application.resume;
  if(!resume||typeof resume!=='object')return false;
  const name=resume.filename??resume.name;
  let content=resume.content??resume.data;
  if(name!==spec.file.name||typeof content!=='string'||content.length>12000000)return false;
  content=content.replace(/^data:[^;,]+;base64,/,'');
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(content))return false;
  try{const bytes=Uint8Array.from(atob(content),c=>c.charCodeAt(0));return bytes.length===spec.file.size&&await hex(bytes)===spec.file.sha256;}catch{return false;}
}
export function networkReceipt(session) {
  const {spec,request}=session||{};
  if(request?.fileBinding==='native-upload-reference'&&spec?.uploadedResumeConfirmed!==true)return null;
  if(request?.fileBinding&&!['request-bytes','native-upload-reference'].includes(request.fileBinding))return null;
  if(!receiptScope(spec)||!request?.bound||!Number.isInteger(request.status)||!Number.isFinite(request.startedAt)||request.status<200||request.status>=300||request.error||session.ambiguous||!session.confirmedAt||session.confirmedAt<request.startedAt)return null;
  return {kind:spec.replay?'greenhouse-network-replay':'greenhouse-production',id:'gh-network:'+request.id,tenant:spec.tenant,jobId:spec.jobId,account:spec.account,fileName:spec.file.name,fileSize:spec.file.size,sha256:spec.file.sha256,
    evidence:{rule:'greenhouse-response-ok-v1',source:spec.source,submitUrl:spec.submitUrl,confirmationUrl:spec.confirmationUrl,requestId:request.id,status:request.status,requestBound:true,confirmationObserved:true,profileId:spec.profileId,taskId:spec.taskId,fixture:spec.replay===true,fileBinding:request.fileBinding||'request-bytes'}};
}

export function registerGreenhouseReceipts(chrome) {
  const key='greenhouseReceiptSessions';let serial=Promise.resolve();
  const update=fn=>{serial=serial.catch(()=>{}).then(async()=>{const data=(await chrome.storage.local.get(key))[key]||{};const value=await fn(data);await chrome.storage.local.set({[key]:data});return value;});return serial;};
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!['greenhouse-receipt-arm','greenhouse-receipt-read'].includes(message?.type))return;
    if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('runner/index.html')){respond({ok:false});return;}
    (async()=>{
      const {runnerTabId}=await chrome.storage.local.get('runnerTabId');
      if(sender.tab?.id!==runnerTabId)return {ok:false};
      if(message.type==='greenhouse-receipt-arm'){
        const spec=message.spec;if(!receiptScope(spec))return {ok:false};
        return update(sessions=>{
          const old=sessions[spec.taskId];
          if(old&&JSON.stringify(old.spec)!==JSON.stringify(spec))return {ok:false};
          sessions[spec.taskId] ||= {spec,armedAt:Date.now()};return {ok:true};
        });
      }
      return update(sessions=>{
        const session=sessions[message.taskId];
        return {ok:true,receipt:session?.spec.profileId===message.profileId?networkReceipt(session):null};
      });
    })().then(respond,()=>respond({ok:false}));return true;
  });
  const filter={urls:['https://job-boards.greenhouse.io/*','https://boards.greenhouse.io/*','http://127.0.0.1/greenhouse/*']};
  chrome.webRequest.onBeforeRequest.addListener(details=>{
    if(details.method!=='POST'||details.tabId<0)return;
    const pending=update(async sessions=>{
      for(const session of Object.values(sessions)){
        const spec=session.spec;
        if(details.tabId!==spec.tabId||details.url!==spec.submitUrl||details.timeStamp<session.armedAt||Date.now()-session.armedAt>900000)continue;
        if(session.request&&session.request.id!==details.requestId){session.ambiguous=true;continue;}
        session.request={id:details.requestId,startedAt:details.timeStamp,bound:false};
        const chunks=details.requestBody?.raw||[];let size=0;
        for(const chunk of chunks)size+=chunk.bytes?.byteLength||0;
        if(!size||size>12582912)continue;
        const bytes=new Uint8Array(size);let offset=0;
        for(const chunk of chunks){if(!chunk.bytes)continue;bytes.set(new Uint8Array(chunk.bytes),offset);offset+=chunk.bytes.byteLength;}
        try{const body=JSON.parse(new TextDecoder().decode(bytes));session.request.bound=await boundApplication(spec,body);session.request.fileBinding=body.job_application?.resume_url?'native-upload-reference':'request-bytes';}catch{}
      }
    });
    pending.catch(()=>{});
  },filter,['requestBody']);
  chrome.webRequest.onCompleted.addListener(details=>{
    if(details.method!=='POST')return;
    update(sessions=>{for(const session of Object.values(sessions))if(session.request?.id===details.requestId&&details.url===session.spec.submitUrl)session.request.status=details.statusCode;});
  },filter);
  chrome.webRequest.onErrorOccurred.addListener(details=>{
    update(sessions=>{for(const session of Object.values(sessions))if(session.request?.id===details.requestId)session.request.error=true;});
  },filter);
  chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{
    const value=change.url||(change.status==='complete'?tab.url:null);if(!value)return;
    update(sessions=>{for(const session of Object.values(sessions)){
      if(session.spec.tabId!==tabId||!session.request)continue;
      try{const url=new URL(value),expected=new URL(session.spec.confirmationUrl);if(url.origin===expected.origin&&url.pathname===expected.pathname)session.confirmedAt=Date.now();}catch{}
    }});
  });
}
