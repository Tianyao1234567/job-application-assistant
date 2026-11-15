import {definitions} from '../shared/schema.js';
import {captureUploadReference,verifiedUpload} from '../greenhouse-receipts.js';

const BASE='http://127.0.0.1:17321', FIXTURE='http://127.0.0.1:17322';
const status=document.getElementById('status');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let bridge,clientId=crypto.randomUUID(),busy=false,stopped=false;
let runnerTabId=null,loopStarted=false,heartbeatTimer;
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type==='local-runner-probe' && sender.id===chrome.runtime.id && message.tabId===runnerTabId){
    respond({tabId:runnerTabId,running:loopStarted&&!stopped});
  }
});
const fail=(kind,message)=>({ok:false,kind,message});
class Stop extends Error {constructor(kind,message){super(message);this.kind=kind;}}
async function api(route,body) {
  const response=await fetch(BASE+'/api/bridge/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Key':bridge.key},body:JSON.stringify(body),signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!response.ok)throw new Error('本地服务暂时无法连接');
  return response.json();
}
const identity=()=>({clientId,profileId:bridge.profileId,extensionId:chrome.runtime.id});
async function authorize(command) {
  try {if((await api('authorize',{clientId,commandId:command.id})).allowed===true)return;}catch{}
  throw new Stop('paused','执行已暂停或连接中断；未继续修改页面。');
}
function expected(command) {
  const site=command.site;
  if(['greenhouse-v1','greenhouse-replay-v1'].includes(site?.adapter))return greenhouseExpected(command);
  if(!site || site.adapter!=='local-v1' || site.origin!==FIXTURE || site.mode!=='demo' || !['alpha','beta'].includes(site.tenant) || !['demo','other'].includes(site.expectedAccount))throw new Stop('manual','此网站尚未适配；本轮只支持本地演示站。');
  if(command.task && (command.task.mode!=='demo' || !/^[a-zA-Z0-9_-]{1,80}$/.test(command.task.jobId)))throw new Stop('manual','任务模式或岗位标识不符合演示站要求。');
  return {tenant:site.tenant,expectedAccount:site.expectedAccount,jobId:command.task?.jobId};
}
function safeUrl(url,expect,kind) {
  if(expect.adapter)return greenhouseUrl(url,expect,kind);
  let parsed;try{parsed=new URL(url);}catch{throw new Stop('structure','招聘页面地址无效。');}
  const base='/site/'+expect.tenant+'/';
  if(parsed.origin!==FIXTURE || parsed.username || parsed.password || !parsed.pathname.startsWith(base) || parsed.hash)throw new Stop('structure','页面地址不属于当前本地招聘网站。');
  const suffix=parsed.pathname.slice(base.length);
  const allowed=kind==='jobs'?suffix==='jobs':kind==='login'?suffix==='login':kind==='apply'?suffix==='apply/'+expect.jobId:kind==='receipt'?suffix==='receipt/'+expect.jobId:kind==='detail'?suffix==='jobs/'+expect.jobId:/^(?:jobs|login|(?:jobs|apply|receipt)\/[a-zA-Z0-9_-]+)$/.test(suffix);
  if(!allowed)throw new Stop('structure','页面入口不符合当前岗位接入规则。');
  return parsed.href;
}
async function waitTab(id) {
  for(let count=0;count<150;count++){
    const tab=await chrome.tabs.get(id);
    if(tab.status==='complete')return tab;
    await delay(100);
  }
  throw new Stop('structure','页面加载超时，请检查投递浏览器。');
}
async function getTab(command,expect) {
  const {localTaskTabs={},localSiteTabs={}}=await chrome.storage.local.get(['localTaskTabs','localSiteTabs']);
  const id=command.task?.tabId || localTaskTabs[command.task?.id] || (!command.task && localSiteTabs[expect.tenant]);
  if(Number.isInteger(id)){
    try {const tab=await chrome.tabs.get(id);if(expect.adapter){safeUrl(tab.url,expect);return tab;}if(tab.url && new URL(tab.url).origin===FIXTURE && new URL(tab.url).pathname.startsWith('/site/'+expect.tenant+'/'))return tab;}catch{}
  }
  return null;
}
async function navigate(command,expect,url,kind,existing) {
  const checked=safeUrl(url,expect,kind);
  let tab=existing || await getTab(command,expect);
  await authorize(command);
  if(tab)tab=await chrome.tabs.update(tab.id,{url:checked,active:true});
  else tab=await chrome.tabs.create({url:checked,active:true});
  const {localTaskTabs={},localSiteTabs={}}=await chrome.storage.local.get(['localTaskTabs','localSiteTabs']);
  if(command.task)localTaskTabs[command.task.id]=tab.id;else localSiteTabs[expect.tenant]=tab.id;
  await chrome.storage.local.set({localTaskTabs,localSiteTabs});
  return waitTab(tab.id);
}
async function inject(tab,expect) {
  const current=await waitTab(tab.id);
  safeUrl(current.url,expect);
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content/guard.js','content/scan.js','content/fill.js',expect.adapter?'runner/greenhouse-adapter.js':'runner/local-adapter.js'],world:'ISOLATED'});
}
async function read(tab,expect,op='inspect') {
  await inject(tab,expect);
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:(operation,context,greenhouse)=>greenhouse?JobGreenhouse.read(operation,context):JobLocal.read(operation,context),args:[op,expect,!!expect.adapter]});
  const current=await chrome.tabs.get(tab.id);
  return {...results[0]?.result,tabId:tab.id,url:safeUrl(current.url,expect)};
}
async function mutate(command,tab,expect,method,...args) {
  // Session requests and hashing must finish BEFORE authorization. commit has no await
  // before its one DOM write and rechecks the live form and original value synchronously.
  await inject(tab,expect);
  const prepared=await prepareMutation(tab,expect,method,args);
  if(!prepared.ok || !prepared.token)return prepared;
  await authorize(command);
  return commitMutation(tab,expect,prepared.token);
}
async function prepareMutation(tab,expect,method,args) {
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:(method,context,args,greenhouse)=>greenhouse?JobGreenhouse.prepare(method,context,args):JobLocal.prepare(method,context,args),args:[method,expect,args,!!expect.adapter]});
  return results[0]?.result || fail('failure','页面预检没有返回结果。');
}
async function commitMutation(tab,expect,token) {
  // Only an opaque one-use token crosses worlds; no key is exposed to the page.
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:(context,token,greenhouse)=>greenhouse?JobGreenhouse.commit(context,token):JobLocal.commit(context,token),args:[expect,token,!!expect.adapter]});
  return results[0]?.result || fail('failure','执行端没有返回页面处理结果。');
}
async function uploadProofFor(command,tab,file) {
  const {greenhouseUploadProofs={}}=await chrome.storage.local.get('greenhouseUploadProofs');
  const proof=greenhouseUploadProofs[command.task.id];
  const spec={taskId:command.task.id,profileId:bridge.profileId,tabId:tab.id,source:command.task.url,file};
  if(!verifiedUpload({...spec,documentId:proof?.documentId},proof))return null;
  const frames=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:()=>location.href});
  return frames[0]?.documentId===proof.documentId&&frames[0]?.result===command.task.url?proof:null;
}
async function observedGreenhouseUpload(command,tab,expect,file) {
  const {greenhouseUploadProofs={}}=await chrome.storage.local.get('greenhouseUploadProofs');
  delete greenhouseUploadProofs[command.task.id];await chrome.storage.local.set({greenhouseUploadProofs});
  const nonce=crypto.randomUUID(),metadata={name:file.name,size:file.size,sha256:file.sha256};
  const pending=chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:captureUploadReference,args:[{file:metadata,replay:expect.replay,nonce}]}).catch(()=>[]);
  try{
    const readiness=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:async nonce=>{
      for(let n=0;n<40;n++){if(document.documentElement.hasAttribute('data-job-upload-'+nonce))return true;await new Promise(resolve=>setTimeout(resolve,50));}return false;
    },args:[nonce]});
    if(!readiness[0]?.result)return fail('manual','未能建立本次附件对象核验，未开始自动上传。');
    const uploaded=await mutate(command,tab,expect,'upload',command.payload.layout,file);
    if(!uploaded.ok)return uploaded;
    const frames=await pending,result=frames[0]?.result;
    if(!result?.ok||!frames[0]?.documentId)return fail('manual','无法证明本次上传的精确附件对象，已暂停，未提交申请。');
    const proof={...result,rule:'greenhouse-upload-object-v1',taskId:command.task.id,profileId:bridge.profileId,tabId:tab.id,source:command.task.url,documentId:frames[0].documentId};
    if(!verifiedUpload({...proof,file:metadata},proof))return fail('manual','附件上传证据与锁定源文件不符，未提交申请。');
    const current=(await chrome.storage.local.get('greenhouseUploadProofs')).greenhouseUploadProofs||{};
    current[command.task.id]=proof;await chrome.storage.local.set({greenhouseUploadProofs:current});return uploaded;
  }finally{
    await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:nonce=>document.dispatchEvent(new Event('job-upload-cancel-'+nonce)),args:[nonce]}).catch(()=>{});
    await pending;
  }
}
function fieldEntries(entries) {
  if(!Array.isArray(entries) || entries.length>500)throw new Stop('manual','没有可校验的已确认资料。');
  const slots=new Map(),ids=new Map(),out=[],seen=new Set();
  for(const entry of entries){
    if(entry.confirmed!==true)continue;
    const parts=String(entry.key).split('.'),kind=parts[0],field=parts.at(-1);
    if(!Object.hasOwn(definitions,kind) || !Object.hasOwn(definitions[kind],field) || typeof entry.value!=='string' || !entry.value.trim() || entry.value.length>10000)continue;
    let name;
    if(kind==='personal' && parts.length===2)name=entry.key;
    else if(['education','experience','projects'].includes(kind) && parts.length===3 && /^[a-zA-Z][\w-]{0,63}$/.test(parts[1])){
      const stable=kind+'.'+parts[1];
      if(!ids.has(stable)){
        const index=Number.isInteger(entry.index)?entry.index:[...ids.keys()].filter(k=>k.startsWith(kind+'.')).length;
        if(index<0 || index>=(kind==='projects'?1:2))continue;
        const slot=kind+'.'+index;
        if(slots.has(slot) && slots.get(slot)!==stable)throw new Stop('structure','多段经历的稳定条目标识出现冲突。');
        ids.set(stable,index);slots.set(slot,stable);
      }
      if(Number.isInteger(entry.index) && entry.index!==ids.get(stable))throw new Stop('structure','经历顺序已变化，请重新检查资料。');
      if(kind==='experience' && field==='department')continue;
      if(kind==='projects' && !['title','role','description'].includes(field))continue;
      name=kind+'.'+ids.get(stable)+'.'+field;
    }else continue;
    if(seen.has(name))throw new Stop('structure','存在重复的资料字段，不能自动填写。');
    seen.add(name);out.push({name,value:entry.value});
  }
  return out;
}
// Greenhouse shares the existing lease, last-moment authorization and durable
// submission ledger. Only this pinned adapter may reach the explicitly allowed
// ATS hosts; the local adapter keeps its original demo-only boundary.
function greenhouseExpected(command) {
  const site=command.site,replay=site.adapter==='greenhouse-replay-v1';
  const origin=replay?FIXTURE:site.origin;
  if(replay?site.origin!==FIXTURE||site.mode!=='demo':!['https://job-boards.greenhouse.io','https://boards.greenhouse.io'].includes(origin)||site.mode!=='real')throw new Stop('structure','Greenhouse 来源或运行模式不符合已配置范围。');
  if(!replay&&(site.tenant!=='mattermost'||site.company!=='Mattermost'))throw new Stop('manual','当前仅有 Mattermost 的 Greenhouse 表单观察依据；其他公司须先核实适配。');
  if(!/^[a-z0-9_-]{1,80}$/.test(site.tenant)||typeof site.company!=='string'||!site.company.trim()||site.company.length>200||typeof site.expectedAccount!=='string'||!/^\S+@\S+\.\S+$/.test(site.expectedAccount)||site.expectedAccount.length>254)throw new Stop('structure','Greenhouse 公司、租户或申请人邮箱缺少明确确认。');
  const task=command.task;
  if(task&&(!/^\d{1,30}$/.test(task.jobId)||task.mode!==(replay?'demo':'real')))throw new Stop('structure','Greenhouse 岗位身份或任务模式不符。');
  const applicantConfirmed=!!task&&task.applicantConfirmed===true&&task.executionProfileId===bridge.profileId;
  if(task&&!['inspect','verify'].includes(command.op)&&!applicantConfirmed)throw new Stop('manual','请先在后台确认本岗位、申请资料、附件及提交动作，并使用同一投递浏览器。');
  const profileMap={'personal.email':'email','personal.phone':'phone','personal.location':'candidate-location'};
  return {adapter:site.adapter,origin,replay,tenant:site.tenant,company:site.company,expectedAccount:site.expectedAccount,jobId:task?.jobId,applicantConfirmed,
    profileFields:Array.isArray(task?.confirmedProfileKeys)?task.confirmedProfileKeys.map(key=>profileMap[key]).filter(Boolean):[],
    confirmedAnswers:Array.isArray(task?.confirmedAnswers)?task.confirmedAnswers:[]};
}
function greenhouseUrl(value,expect,kind) {
  let url;try{url=new URL(value);}catch{throw new Stop('structure','Greenhouse 地址无效。');}
  const base=(expect.replay?'/greenhouse/':'/')+expect.tenant;
  const list=url.pathname===base||url.pathname===base+'/';
  const job=expect.jobId&&url.pathname===base+'/jobs/'+expect.jobId;
  const receipt=expect.replay&&expect.jobId&&url.pathname===base+'/jobs/'+expect.jobId+'/receipt';
  const confirmation=expect.jobId&&url.pathname===base+'/jobs/'+expect.jobId+'/confirmation';
  const anyJob=new RegExp('^'+base+'/jobs/\\d{1,30}'+(expect.replay?'(?:/receipt)?':'')+'$').test(url.pathname);
  const allowed=['jobs','login'].includes(kind)?list:kind==='receipt'?receipt:['detail','apply'].includes(kind)?job:list||job||receipt||confirmation||(!expect.jobId&&anyJob);
  if(url.origin!==expect.origin||url.username||url.password||!allowed)throw new Stop('structure','Greenhouse 页面已离开当前公司或岗位范围，停止自动处理。');
  return url.href;
}
function greenhouseEntries(entries) {
  if(!Array.isArray(entries)||entries.length>500)throw new Stop('manual','缺少已确认的申请资料。');
  const mapping={'personal.email':'email','personal.phone':'phone','personal.location':'candidate-location'},seen=new Set(),result=[];
  for(const entry of entries){
    const name=mapping[entry.key];
    if(!name||entry.confirmed!==true)continue;
    if(seen.has(name)||typeof entry.value!=='string'||!entry.value.trim()||entry.value.length>10000)throw new Stop('structure','Greenhouse 资料字段重复或未通过校验。');
    seen.add(name);result.push({name,value:entry.value});
  }
  // A full name is deliberately not split into given/family names. Those fields
  // are answered against their exact observed questions if separately required.
  return result;
}
async function greenReceipt(command) {
  try{const reply=await chrome.runtime.sendMessage({type:'greenhouse-receipt-read',taskId:command.task.id,profileId:bridge.profileId});return reply?.ok?reply.receipt:null;}catch{return null;}
}
async function executeGreenhouse(command,expect,payload) {
  let tab=await getTab(command,expect);
  const base=expect.origin+(expect.replay?'/greenhouse/':'/')+expect.tenant;
  const ledgerKey=[expect.adapter,expect.origin,expect.tenant,expect.jobId,expect.expectedAccount].join(':');
  const previous=(await chrome.storage.local.get('localSubmissionAttempts')).localSubmissionAttempts||{};
  if(command.op==='discover'){
    tab=await navigate(command,expect,command.site.listUrl,'jobs',tab);return read(tab,expect,'discover');
  }
  if(command.op==='check'){
    tab=await navigate(command,expect,command.site.loginUrl,'login',tab);return read(tab,expect,'check');
  }
  if(command.op==='open'){
    tab=await navigate(command,expect,payload.url||command.site.loginUrl,null,tab);return {ok:true,tabId:tab.id,url:tab.url};
  }
  if(!command.task)throw new Stop('structure','Greenhouse 任务缺少固定岗位。');
  if(command.op==='verify'){
    const receipt=await greenReceipt(command);if(receipt)return {ok:true,receipt,tabId:tab?.id};
    // No invented production receipt URL. Inspect the actual retained result
    // document; an unobserved or redirected receipt remains verification-only.
    if(expect.replay)tab=await navigate(command,expect,base+'/jobs/'+expect.jobId+'/receipt','receipt',tab);
    else if(!tab)return fail('unknown','原结果页面不可用，请本人核实站点接收记录；禁止重新提交。');
    return read(tab,expect,'verify');
  }
  if(previous[ledgerKey])return {...fail('unknown','此岗位已有持久提交尝试，只允许核对原结果，不会重新填写或提交。'),tabId:tab?.id};
  if(command.op==='inspect'){
    if(expect.replay){
      // Keep the live application, manual edits and selected File while a
      // separate GET-only tab checks for an already accepted application.
      await authorize(command);
      const checkTab=await chrome.tabs.create({url:safeUrl(base+'/jobs/'+expect.jobId+'/receipt',expect,'receipt'),active:true});
      let checked;
      try{checked=await read(await waitTab(checkTab.id),expect,'verify');}
      finally{await chrome.tabs.remove(checkTab.id).catch(()=>{});}
      if(!checked.ok||checked.receipt)return {...checked,tabId:tab?.id};
    }
    const target=safeUrl(command.task.url,expect,'detail');
    if(!tab||new URL(tab.url).pathname!==new URL(target).pathname)tab=await navigate(command,expect,target,'detail',tab);
    return read(tab,expect,'inspect');
  }
  if(!tab)throw new Stop('structure','原 Greenhouse 表单已关闭，请重新检查原任务。');
  safeUrl(tab.url,expect,'apply');
  if(typeof payload.layout!=='string'||!payload.layout||payload.layout.length>250000)throw new Stop('structure','缺少 Greenhouse 原表单结构版本。');
  if(command.op==='fill'){
    let filled=0;
    const entries=greenhouseEntries(payload.entries);
    if(entries.some(entry=>entry.name==='email'&&entry.value.trim().toLowerCase()!==expect.expectedAccount.toLowerCase()))throw new Stop('account','资料中的邮箱与本岗位确认的申请人不符，未继续填写。');
    const inspected=await read(tab,expect,'inspect');
    if(!inspected.ok)return inspected;
    for(const entry of entries){
      if(inspected.fields?.some(field=>field.key===entry.name&&field.customControl))continue;
      const result=await mutate(command,tab,expect,'fillField',payload.layout,entry.name,entry.value);
      if(!result.ok)return {...result,tabId:tab.id,url:tab.url};
      filled+=Number(result.filled)||0;
    }
    return {ok:true,filled,layout:payload.layout,tabId:tab.id,url:tab.url};
  }
  if(command.op==='upload'){
    const file=payload.file;
    if(!file||typeof file.name!=='string'||!file.name||/[\\/\x00-\x1f]/.test(file.name)||file.name.length>200||typeof file.mime!=='string'||typeof file.base64!=='string'||file.base64.length>12000000||!Number.isInteger(file.size)||file.size<=0||file.size>8*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Stop('manual','简历附件信息或摘要无效。');
    const inspected=await read(tab,expect,'inspect');if(!inspected.ok)return inspected;
    const result=!expect.replay||inspected.submissionProtocol?await observedGreenhouseUpload(command,tab,expect,file):await mutate(command,tab,expect,'upload',payload.layout,file);
    return {...result,tabId:tab.id,url:tab.url};
  }
  if(command.op==='answer'){
    if(payload.customControl&&payload.optionsComplete){
      const observed=await read(tab,expect,'inspect');
      if(!observed.ok)return observed;
      if(observed.questions?.some(question=>question.key===payload.key&&!question.alreadyPopulated)){
        const opened=await mutate(command,tab,expect,'openChoice',payload);if(!opened.ok)return opened;
      }
    }
    return {...await mutate(command,tab,expect,'answer',payload),tabId:tab.id,url:tab.url};
  }
  if(command.op==='preflight'){
    const inspected=await read(tab,expect,'inspect');if(!inspected.ok)return inspected;
    if((!expect.replay||inspected.uploadedResumeConfirmed)&&!await uploadProofFor(command,tab,payload.file))return fail('manual','缺少绑定本任务、执行资料及源文件的精确上传对象证据，已暂停，未提交申请。');
    await inject(tab,expect);
    const prepared=await prepareMutation(tab,expect,'submit',[payload.layout,payload.file]);
    return prepared.ok?{ok:true,tabId:tab.id,url:tab.url}:prepared;
  }
  if(command.op==='submit'){
    const checked=await read(tab,expect,'inspect');
    if(!checked.ok||checked.receipt)return checked;
    if(checked.layout!==payload.layout)return fail('structure','提交前 Greenhouse 表单已变化。');
    const uploadProof=await uploadProofFor(command,tab,payload.file);
    if((!expect.replay||checked.uploadedResumeConfirmed)&&!uploadProof)return fail('manual','本次附件精确对象尚未核实，未进入提交边界；请核对原任务。');
    const prepared=await prepareMutation(tab,expect,'submit',[payload.layout,payload.file]);
    if(!prepared.ok||!prepared.token)return prepared;
    if(checked.submissionProtocol){
      const watched=await chrome.runtime.sendMessage({type:'greenhouse-receipt-arm',spec:{taskId:command.task.id,profileId:bridge.profileId,tabId:tab.id,tenant:expect.tenant,jobId:expect.jobId,account:expect.expectedAccount,file:payload.file,uploadProof,documentId:uploadProof?.documentId,uploadedResumeConfirmed:checked.uploadedResumeConfirmed===true,source:command.task.url,replay:expect.replay,...checked.submissionProtocol}});
      if(!watched?.ok)return fail('manual','本次提交的网络核验尚未就绪，未点击申请。');
    }
    // Store before any click; even a safe denial or lost response never clears it.
    const {localSubmissionAttempts={}}=await chrome.storage.local.get('localSubmissionAttempts');
    if(localSubmissionAttempts[ledgerKey])return fail('unknown','已记录提交尝试，仅允许核对。');
    localSubmissionAttempts[ledgerKey]={commandId:command.id,taskId:command.task.id,profileId:bridge.profileId,at:Date.now()};
    await chrome.storage.local.set({localSubmissionAttempts});
    await authorize(command);
    let clicked;
    try{clicked=await commitMutation(tab,expect,prepared.token);}catch{}
    if(clicked?.receipt||clicked?.attempted===false)return {...clicked,tabId:tab.id};
    for(let index=0;index<10;index++){
      const network=await greenReceipt(command);if(network)return {ok:true,receipt:network,tabId:tab.id};
      try{const receipt=await read(tab,expect,'verify');if(receipt.ok&&receipt.receipt)return receipt;}catch{}
      await delay(300);
    }
    return {...fail('unknown','已保存提交尝试，尚无与本岗位和申请人对应的可靠回执；仅允许核对，不会再次点击。'),tabId:tab.id};
  }
  throw new Stop('manual','此 Greenhouse 操作尚未接入。');
}
async function execute(command) {
  const expect=expected(command),payload=command.payload || {};
  if(expect.adapter)return executeGreenhouse(command,expect,payload);
  let tab=await getTab(command,expect);
  const at=path=>FIXTURE+'/site/'+expect.tenant+'/'+path;
  if(command.op==='discover'){
    tab=await navigate(command,expect,command.site.listUrl,'jobs',tab);
    return read(tab,expect,'discover');
  }
  if(command.op==='check'){
    tab=await navigate(command,expect,command.site.loginUrl,'login',tab);
    return read(tab,expect,'check');
  }
  if(command.op==='open'){
    tab=await navigate(command,expect,payload.url || command.site.loginUrl,null,tab);
    return {ok:true,tabId:tab.id,url:tab.url};
  }
  if(!command.task)throw new Stop('structure','任务缺少可验证的岗位信息。');
  if(command.op==='verify'){
    tab=await navigate(command,expect,at('receipt/'+expect.jobId),'receipt',tab);
    return read(tab,expect,'verify');
  }
  if(command.op==='inspect'){
    // Recovery must not navigate away from a live form and erase manual edits/files.
    // Check existing receipts in a separate visible GET-only tab, then retain the form.
    if(tab && tab.url && new URL(tab.url).origin===FIXTURE && new URL(tab.url).pathname==='/site/'+expect.tenant+'/apply/'+expect.jobId){
      safeUrl(tab.url,expect,'apply');
      await authorize(command);
      const verificationTab=await chrome.tabs.create({url:safeUrl(at('receipt/'+expect.jobId),expect,'receipt'),active:true});
      let verified,detail;
      try{
        await waitTab(verificationTab.id);
        verified=await read(verificationTab,expect,'verify');
        if(verified.ok && !verified.receipt){
          // Read metadata in the temporary tab as well: the retained application
          // keeps the user's fields and selected attachment throughout recovery.
          await authorize(command);
          const detailsTab=await chrome.tabs.update(verificationTab.id,{url:safeUrl(command.task.url,expect,'detail'),active:true});
          detail=await read(detailsTab,expect,'detail');
        }
      }finally{await chrome.tabs.remove(verificationTab.id).catch(()=>{});}
      if(!verified.ok || verified.receipt)return {...verified,tabId:tab.id,url:safeUrl((await chrome.tabs.get(tab.id)).url,expect)};
      if(!detail.ok)return {...detail,tabId:tab.id,url:safeUrl((await chrome.tabs.get(tab.id)).url,expect)};
      return {...await read(tab,expect),jobMetadata:detail.jobMetadata};
    }
    // GET-only receipt check comes before any application editing, including recovery after login.
    tab=await navigate(command,expect,at('receipt/'+expect.jobId),'receipt',tab);
    const verified=await read(tab,expect,'verify');
    if(!verified.ok || verified.receipt)return verified;
    tab=await navigate(command,expect,command.task.url,'detail',tab);
    const detail=await read(tab,expect,'detail');
    if(!detail.ok || detail.receipt)return detail;
    tab=await navigate(command,expect,detail.applyUrl,'apply',tab);
    return {...await read(tab,expect),jobMetadata:detail.jobMetadata};
  }
  if(!tab)throw new Stop('structure','原申请页面已关闭，请重新检查后继续。');
  safeUrl(tab.url,expect,'apply');
  if(typeof payload.layout!=='string' || payload.layout.length>250000)throw new Stop('structure','缺少原申请表的结构确认。');
  if(command.op==='fill'){
    let filled=0;
    for(const entry of fieldEntries(payload.entries)){
      const result=await mutate(command,tab,expect,'fillField',payload.layout,entry.name,entry.value);
      if(!result.ok)return {...result,tabId:tab.id,url:tab.url};
      filled+=result.filled;
    }
    return {ok:true,layout:payload.layout,filled,tabId:tab.id,url:tab.url};
  }
  if(command.op==='upload'){
    const file=payload.file;
    if(!file || typeof file.name!=='string' || !file.name || /[\\/\x00-\x1f]/.test(file.name) || file.name.length>200 || typeof file.mime!=='string' || typeof file.base64!=='string' || file.base64.length>12000000 || !Number.isInteger(file.size) || file.size<=0 || file.size>8*1024*1024 || !/^[a-f0-9]{64}$/.test(file.sha256))throw new Stop('manual','简历附件未通过文件信息校验。');
    return {...await mutate(command,tab,expect,'upload',payload.layout,file),tabId:tab.id,url:tab.url};
  }
  if(command.op==='answer'){
    if(typeof payload.answer!=='string' || !payload.answer.trim() || payload.answer.length>10000)throw new Stop('manual','请补充经确认的普通问题答案。');
    return {...await mutate(command,tab,expect,'answer',payload),tabId:tab.id,url:tab.url};
  }
  if(command.op==='preflight'){
    await inject(tab,expect);
    const prepared=await prepareMutation(tab,expect,'submit',[payload.layout,payload.file]);
    return prepared.ok?{ok:true,tabId:tab.id,url:tab.url}:prepared;
  }
  if(command.op==='submit'){
    const {localSubmissionAttempts={}}=await chrome.storage.local.get('localSubmissionAttempts');
    const dedupe=expect.tenant+':'+expect.jobId+':'+expect.expectedAccount;
    if(localSubmissionAttempts[dedupe])return {...fail('unknown','此岗位已记录提交尝试，请先核对接收记录。'),tabId:tab.id,url:tab.url};
    const checked=await read(tab,expect);
    if(!checked.ok || checked.receipt)return checked;
    if(checked.layout!==payload.layout)return fail('structure','提交前表单结构发生变化。');
    await inject(tab,expect);
    const prepared=await prepareMutation(tab,expect,'submit',[payload.layout,payload.file]);
    if(!prepared.ok || !prepared.token)return prepared;
    // Persist before the single click. A lost response or renderer crash can only lead to verification.
    localSubmissionAttempts[dedupe]={commandId:command.id,taskId:command.task.id,at:Date.now()};
    await chrome.storage.local.set({localSubmissionAttempts});
    // Include storage latency in the preflight window: authorize only after it completes.
    try{await authorize(command);}catch(error){
      return {...fail(error.kind || 'paused',error.message),attempted:false,tabId:tab.id,url:tab.url};
    }
    let clicked;
    try{
      clicked=await commitMutation(tab,expect,prepared.token);
      if(clicked?.ok || clicked?.attempted===false)return {...clicked,tabId:tab.id,url:safeUrl((await chrome.tabs.get(tab.id)).url,expect)};
    }catch{}
    // A normal form navigation destroys the injected world. Only read the resulting browser page.
    for(let i=0;i<10;i++){
      try{const result=await read(tab,expect,'verify');if(result.ok && result.receipt)return result;}catch{}
      await delay(300);
    }
    return {...fail('unknown','提交已尝试，但未取得可靠回执；请核对结果，系统不会再次点击。'),tabId:tab.id,url:safeUrl((await chrome.tabs.get(tab.id)).url,expect)};
  }
  throw new Stop('manual','此操作尚未接入。');
}
async function tick() {
  if(busy || stopped)return;busy=true;
  try{
    const stored=await chrome.storage.local.get(['localBridge','localResultOutbox','localMigrationHold']);
    if(stored.localMigrationHold===true){status.textContent='更新迁移记录正在核验，保持暂停。';return;}
    if(!stored.localBridge?.key){status.textContent='请先从本地管理后台连接插件。';return;}
    bridge=stored.localBridge;
    if(stored.localResultOutbox){
      const acknowledged=await api('result',stored.localResultOutbox);
      if(acknowledged?.ok===true)await chrome.storage.local.remove('localResultOutbox');
      else{const {localUnacknowledgedResults=[]}=await chrome.storage.local.get('localUnacknowledgedResults');await chrome.storage.local.set({localUnacknowledgedResults:[...localUnacknowledgedResults,stored.localResultOutbox]});await chrome.storage.local.remove('localResultOutbox');}
    }
    const reply=await api('poll',identity());
    const command=reply.command;
    status.textContent=command?'正在实际处理招聘页面…':'已连接；等待后台安排。';
    if(!command)return;
    let result;
    try{result=await execute(command);}catch(error){result=fail(error.kind || (command.op==='submit'?'unknown':'failure'),error instanceof Stop?error.message:command.op==='submit'?'提交结果待核实，系统不会重复提交。':'页面操作未完成，请检查当前浏览器页面后恢复。');}
    const outbox={clientId,commandId:command.id,result};
    await chrome.storage.local.set({localResultOutbox:outbox});
    if((await api('result',outbox))?.ok===true)await chrome.storage.local.remove('localResultOutbox');
  }catch{status.textContent='本地服务已断开；停止新动作，正在等待重连。';}finally{busy=false;}
}
async function start() {
  const current=await chrome.tabs.getCurrent();runnerTabId=current.id;
  const registered=await chrome.runtime.sendMessage({type:'local-runner-register',tabId:current.id});
  if(!registered?.ok){stopped=true;status.textContent=registered?.reason==='runner-conflict'?'已有一个执行端运行，此页不会重复处理任务。':'执行端注册失败（'+(registered?.reason || 'no-response')+'），请从后台重新连接。';return;}
  const {localBridge}=await chrome.storage.local.get('localBridge');bridge=localBridge;
  loopStarted=true;
  // Heartbeats keep the connection visible while a real page action is still running.
  heartbeatTimer=setInterval(()=>{if(bridge?.key&&!stopped)api('heartbeat',identity()).catch(()=>{});},4000);
  while(!stopped){await tick();await delay(500);}
}
start().catch(()=>{stopped=true;loopStarted=false;clearInterval(heartbeatTimer);status.textContent='执行端未能启动，请从后台重新连接插件。';});
