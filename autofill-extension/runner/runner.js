import {definitions} from '../shared/schema.js';

const BASE='http://127.0.0.1:17321', FIXTURE='http://127.0.0.1:17322';
const status=document.getElementById('status');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let bridge,clientId=crypto.randomUUID(),busy=false,stopped=false;
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
  if(!site || site.adapter!=='local-v1' || site.origin!==FIXTURE || site.mode!=='demo' || !['alpha','beta'].includes(site.tenant) || !['demo','other'].includes(site.expectedAccount))throw new Stop('manual','此网站尚未适配；本轮只支持本地演示站。');
  if(command.task && (command.task.mode!=='demo' || !/^[a-zA-Z0-9_-]{1,80}$/.test(command.task.jobId)))throw new Stop('manual','任务模式或岗位标识不符合演示站要求。');
  return {tenant:site.tenant,expectedAccount:site.expectedAccount,jobId:command.task?.jobId};
}
function safeUrl(url,expect,kind) {
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
    try {const tab=await chrome.tabs.get(id);if(tab.url && new URL(tab.url).origin===FIXTURE && new URL(tab.url).pathname.startsWith('/site/'+expect.tenant+'/'))return tab;}catch{}
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
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content/guard.js','content/scan.js','content/fill.js','runner/local-adapter.js'],world:'ISOLATED'});
}
async function read(tab,expect,op='inspect') {
  await inject(tab,expect);
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:(operation,context)=>JobLocal.read(operation,context),args:[op,expect]});
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
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:(method,context,args)=>JobLocal.prepare(method,context,args),args:[method,expect,args]});
  return results[0]?.result || fail('failure','页面预检没有返回结果。');
}
async function commitMutation(tab,expect,token) {
  // Only an opaque one-use token crosses worlds; no key is exposed to the page.
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:(context,token)=>JobLocal.commit(context,token),args:[expect,token]});
  return results[0]?.result || fail('failure','执行端没有返回页面处理结果。');
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
async function execute(command) {
  const expect=expected(command),payload=command.payload || {};
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
      let verified;
      try{
        await waitTab(verificationTab.id);
        verified=await read(verificationTab,expect,'verify');
      }finally{await chrome.tabs.remove(verificationTab.id).catch(()=>{});}
      if(!verified.ok || verified.receipt)return {...verified,tabId:tab.id,url:safeUrl((await chrome.tabs.get(tab.id)).url,expect)};
      return read(tab,expect);
    }
    // GET-only receipt check comes before any application editing, including recovery after login.
    tab=await navigate(command,expect,at('receipt/'+expect.jobId),'receipt',tab);
    const verified=await read(tab,expect,'verify');
    if(!verified.ok || verified.receipt)return verified;
    tab=await navigate(command,expect,command.task.url,'detail',tab);
    const detail=await read(tab,expect,'detail');
    if(!detail.ok || detail.receipt)return detail;
    tab=await navigate(command,expect,detail.applyUrl,'apply',tab);
    return read(tab,expect);
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
  if(command.op==='submit'){
    const {localSubmissionAttempts={}}=await chrome.storage.local.get('localSubmissionAttempts');
    const dedupe=expect.tenant+':'+expect.jobId+':'+expect.expectedAccount;
    if(localSubmissionAttempts[dedupe])return {...fail('unknown','此岗位已记录提交尝试，请先核对接收记录。'),tabId:tab.id,url:tab.url};
    const checked=await read(tab,expect);
    if(!checked.ok || checked.receipt)return checked;
    if(checked.layout!==payload.layout)return fail('structure','提交前表单结构发生变化。');
    await inject(tab,expect);
    const prepared=await prepareMutation(tab,expect,'submit',[payload.layout]);
    if(!prepared.ok || !prepared.token)return prepared;
    // Persist before the single click. A lost response or renderer crash can only lead to verification.
    localSubmissionAttempts[dedupe]={commandId:command.id,taskId:command.task.id,at:Date.now()};
    await chrome.storage.local.set({localSubmissionAttempts});
    // Include storage latency in the preflight window: authorize only after it completes.
    try{await authorize(command);}catch(error){
      delete localSubmissionAttempts[dedupe];await chrome.storage.local.set({localSubmissionAttempts});
      return {...fail(error.kind || 'paused',error.message),attempted:false,tabId:tab.id,url:tab.url};
    }
    let clicked;
    try{
      clicked=await commitMutation(tab,expect,prepared.token);
      if(clicked && clicked.kind!=='unknown' && clicked.attempted===false){delete localSubmissionAttempts[dedupe];await chrome.storage.local.set({localSubmissionAttempts});}
      if(clicked?.ok || (clicked && clicked.kind!=='unknown'))return {...clicked,tabId:tab.id,url:safeUrl((await chrome.tabs.get(tab.id)).url,expect)};
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
    const stored=await chrome.storage.local.get(['localBridge','localResultOutbox']);
    if(!stored.localBridge?.key){status.textContent='请先从本地管理后台连接插件。';return;}
    bridge=stored.localBridge;
    if(stored.localResultOutbox){
      await api('result',stored.localResultOutbox);
      await chrome.storage.local.remove('localResultOutbox');
    }
    const reply=await api('poll',identity());
    const command=reply.command;
    status.textContent=command?'正在实际处理招聘页面…':'已连接；等待后台安排。';
    if(!command)return;
    let result;
    try{result=await execute(command);}catch(error){result=fail(error.kind || (command.op==='submit'?'unknown':'failure'),error instanceof Stop?error.message:command.op==='submit'?'提交结果待核实，系统不会重复提交。':'页面操作未完成，请检查当前浏览器页面后恢复。');}
    const outbox={clientId,commandId:command.id,result};
    await chrome.storage.local.set({localResultOutbox:outbox});
    await api('result',outbox);
    await chrome.storage.local.remove('localResultOutbox');
  }catch{status.textContent='本地服务已断开；停止新动作，正在等待重连。';}finally{busy=false;}
}
async function start() {
  const current=await chrome.tabs.getCurrent();
  const registered=await chrome.runtime.sendMessage({type:'local-runner-register',tabId:current.id});
  if(!registered?.ok){stopped=true;status.textContent='已有一个执行端运行，此页不会重复处理任务。';return;}
  const {localBridge}=await chrome.storage.local.get('localBridge');bridge=localBridge;
  // Heartbeats keep the connection visible while a real page action is still running.
  setInterval(()=>{if(bridge?.key&&!stopped)api('heartbeat',identity()).catch(()=>{});},4000);
  while(!stopped){await tick();await delay(500);}
}
start().catch(()=>{status.textContent='执行端未能启动，请从后台重新连接插件。';});
