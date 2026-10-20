import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {RUNTIME} from './paths.mjs';

const MAX_FILE = 8 * 1024 * 1024;
const TENANTS = new Set(['alpha', 'beta']);
const ACCOUNTS = new Set(['demo', 'other']);
const JOBS = {
  alpha: [
    {id:'cpp-001', title:'C++ 开发工程师', company:'虚构甲公司', location:'上海', question:true},
    {id:'cpp-002', title:'C++ 软件工程师', company:'虚构甲公司', location:'上海'},
    {id:'sales-001', title:'销售专员', company:'虚构甲公司', location:'北京'}
  ],
  beta: [
    {id:'web-001', title:'Web 前端工程师', company:'虚构乙公司', location:'上海'},
    {id:'design-001', title:'平面设计师', company:'虚构乙公司', location:'深圳'}
  ]
};
const PERSONAL = {name:'姓名 / Full name',phone:'手机 / Phone',email:'邮箱 / Email',location:'现居城市 / Current city',desiredCity:'期望城市 / Preferred city'};
const EDUCATION = {school:'学校 / School',degree:'学位 / Degree',major:'专业 / Major',startDate:'开始年月 / Start',endDate:'结束年月 / End'};
const EXPERIENCE = {company:'公司 / Company',role:'职位 / Role',startDate:'开始年月 / Start',endDate:'结束年月 / End',description:'职责 / Description'};
const PROJECT = {title:'项目名称 / Project title',role:'本人角色 / Role',description:'项目描述 / Description'};
const FORM_FIELDS = new Set(['jobId','tenant','account','motivation',...Object.keys(PERSONAL).map(key=>'personal.'+key)]);
for (const [kind,fields,count] of [['education',EDUCATION,2],['experience',EXPERIENCE,2],['projects',PROJECT,1]]) {
  for (let slot=0;slot<count;slot++) for (const key of Object.keys(fields)) FORM_FIELDS.add(`${kind}.${slot}.${key}`);
}
const escape = value => String(value).replace(/[&<>"']/g, character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const keyFor = (tenant,jobId,account) => `${tenant}:${jobId}:${account}`;
class RequestError extends Error {constructor(status,message){super(message);this.status=status;}}

// Runtime state and uploaded bytes must remain under this checkout's ignored .runtime.
function runtimeDirectory(value) {
  const target = path.resolve(value || path.join(RUNTIME,'fixture'));
  const relative = path.relative(RUNTIME,target);
  if (relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) throw new Error('招聘测试站数据必须位于项目 .runtime 内。');
  fs.mkdirSync(RUNTIME,{recursive:true});
  const runtimeReal = fs.realpathSync(RUNTIME);
  if (runtimeReal!==RUNTIME) throw new Error('招聘测试站 .runtime 不能是符号链接。');
  let ancestor=target;
  while(!fs.existsSync(ancestor)) ancestor=path.dirname(ancestor);
  const ancestorReal=fs.realpathSync(ancestor);
  const realRelative=path.relative(runtimeReal,ancestorReal);
  if(realRelative==='..' || realRelative.startsWith('..'+path.sep) || path.isAbsolute(realRelative)) throw new Error('招聘测试站数据路径不能通过符号链接离开 .runtime。');
  fs.mkdirSync(target,{recursive:true,mode:0o700});
  return target;
}

function readBody(request,limit) {
  return new Promise((resolve,reject)=>{
    let size=0,failed=false;const chunks=[];
    request.on('data',chunk=>{
      size+=chunk.length;
      if(size>limit){if(!failed){failed=true;reject(new RequestError(413,'请求内容过大。'));}return;}
      chunks.push(chunk);
    });
    request.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});
    request.on('error',reject);
    request.on('aborted',()=>reject(new RequestError(400,'请求已中断。')));
  });
}
function contentType(request,type) {return (request.headers['content-type'] || '').split(';',1)[0].trim().toLowerCase()===type;}
async function jsonBody(request) {
  if(!contentType(request,'application/json'))throw new RequestError(415,'测试接口只接收 JSON。');
  let value;try{value=JSON.parse((await readBody(request,16384)).toString('utf8'));}catch(error){if(error instanceof RequestError)throw error;throw new RequestError(400,'JSON 无效。');}
  if(!value || typeof value!=='object' || Array.isArray(value))throw new RequestError(400,'请求必须为对象。');
  return value;
}

// Parse the native browser multipart payload as bytes; attachment hashes never use form metadata.
function multipart(body,type) {
  const match=/^multipart\/form-data;\s*boundary=(?:"([^"\r\n]{1,70})"|([^\s;]{1,70}))\s*$/i.exec(type || '');
  if(!match)throw new RequestError(415,'申请必须使用 multipart/form-data。');
  const boundary=match[1] || match[2];
  if(!/^[a-zA-Z0-9'()+_,.\/:=? -]+$/.test(boundary))throw new RequestError(400,'multipart 边界无效。');
  const first=Buffer.from('--'+boundary+'\r\n'), divider=Buffer.from('\r\n--'+boundary);
  if(!body.subarray(0,first.length).equals(first))throw new RequestError(400,'multipart 起始边界无效。');
  let offset=first.length,finished=false;const fields=Object.create(null);let file;
  for(let count=0;count<80;count++) {
    const headerEnd=body.indexOf('\r\n\r\n',offset);
    if(headerEnd<0 || headerEnd-offset>8192)throw new RequestError(400,'multipart 头无效。');
    const headers=body.subarray(offset,headerEnd).toString('utf8').split('\r\n');
    const disposition=headers.filter(header=>/^content-disposition:/i.test(header));
    if(disposition.length!==1)throw new RequestError(400,'multipart 字段无效。');
    const descriptor=/^content-disposition:\s*form-data;\s*name="([^"\r\n]+)"(?:;\s*filename="([^"\r\n]*)")?$/i.exec(disposition[0]);
    if(!descriptor)throw new RequestError(400,'multipart 字段描述无效。');
    let partEnd=body.indexOf(divider,headerEnd+4);
    // A byte sequence inside the actual file is a delimiter only with a valid ending.
    while(partEnd>=0 && !['--','\r\n'].includes(body.subarray(partEnd+divider.length,partEnd+divider.length+2).toString('latin1')))partEnd=body.indexOf(divider,partEnd+1);
    if(partEnd<0)throw new RequestError(400,'multipart 结束边界缺失。');
    const bytes=body.subarray(headerEnd+4,partEnd),name=descriptor[1],filename=descriptor[2];
    if(filename!==undefined) {
      if(name!=='resume' || file || !filename || filename.length>200 || /[\\/\x00-\x1f\x7f]/.test(filename) || !bytes.length || bytes.length>MAX_FILE)throw new RequestError(400,'简历附件无效或重复。');
      const mimeHeaders=headers.filter(header=>/^content-type:/i.test(header));
      if(mimeHeaders.length>1)throw new RequestError(400,'附件类型无效。');
      file={name:filename,mime:mimeHeaders[0]?.slice(mimeHeaders[0].indexOf(':')+1).trim() || 'application/octet-stream',bytes};
    } else {
      if(!FORM_FIELDS.has(name) || Object.hasOwn(fields,name) || bytes.length>40000)throw new RequestError(400,'申请字段无效或重复。');
      const value=bytes.toString('utf8');
      if(value.length>10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw new RequestError(400,'申请文字无效。');
      fields[name]=value;
    }
    offset=partEnd+divider.length;
    if(body.subarray(offset,offset+2).toString('latin1')==='--') {
      const trailing=body.subarray(offset+2).toString('latin1');
      if(trailing!=='' && trailing!=='\r\n')throw new RequestError(400,'multipart 包含额外内容。');
      finished=true;break;
    }
    offset+=2;
  }
  if(!finished || !file)throw new RequestError(400,'请提供一份真实简历附件。');
  return {fields,file};
}

function field(name,label,required=false) {
  const textarea=name.endsWith('.description');
  const input=textarea?`<textarea id="${escape(name)}" name="${escape(name)}" maxlength="10000"></textarea>`:`<input id="${escape(name)}" name="${escape(name)}" type="${name==='personal.email'?'email':name==='personal.phone'?'tel':'text'}" maxlength="10000"${required?' required':''}>`;
  return `<div class="field"><label for="${escape(name)}">${escape(label)}</label>${input}</div>`;
}
function page(tenant,login,title,content) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · 本地虚构招聘站</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:850px;margin:24px auto;padding:0 20px}nav{display:flex;gap:18px}fieldset{margin:20px 0;padding:16px}label{display:block}input,select,textarea,button{font:inherit;padding:7px;max-width:100%;box-sizing:border-box}input:not([type=file]),textarea{width:100%}.field{margin:12px 0}textarea{min-height:85px}.notice{padding:12px;background:#eef3ff}a{color:#164fc0}.receipt{border:2px solid #287548;padding:16px}</style></head><body><p class="notice">本页面是虚构本地招聘测试站，只用于演示和受控测试。</p><nav><a href="/site/${tenant}/jobs">岗位列表</a><a href="/site/${tenant}/login">账号准备</a></nav><p data-session-status="${escape(login.status)}" data-account="${escape(login.account)}" data-tenant="${escape(login.tenant)}">当前会话：${escape(login.status)}${login.account?' · '+escape(login.account):''}</p><h1>${escape(title)}</h1>${content}</body></html>`;
}
function receiptHtml(receipt) {
  return `<section class="receipt" data-receipt-id="${escape(receipt.id)}" data-tenant="${escape(receipt.tenant)}" data-job-id="${escape(receipt.jobId)}" data-account="${escape(receipt.account)}" data-file-name="${escape(receipt.fileName)}" data-file-size="${receipt.fileSize}" data-sha256="${receipt.sha256}"><h2>申请已接收</h2><p>回执：${escape(receipt.id)}</p><p>简历：${escape(receipt.fileName)} (${receipt.fileSize} 字节)</p><p>SHA-256：${receipt.sha256}</p></section>`;
}
function applicationHtml(tenant,job,account,scenario) {
  let fields='<fieldset><legend>个人资料</legend>'+Object.entries(PERSONAL).map(([name,label])=>field('personal.'+name,label,['name','email'].includes(name))).join('')+'</fieldset>';
  for(const [kind,labels,count,title] of [['education',EDUCATION,2,'教育经历'],['experience',EXPERIENCE,2,'工作经历'],['projects',PROJECT,1,'项目经历']]) {
    for(let slot=0;slot<count;slot++)fields+=`<fieldset><legend>${title} ${slot+1}</legend>${Object.entries(labels).map(([name,label])=>field(`${kind}.${slot}.${name}`,label)).join('')}</fieldset>`;
  }
  if(job.question)fields+=`<fieldset data-question-key="motivation" data-question-text="为什么希望申请这个岗位？" data-question-scope="local-v1:${tenant}:${job.id}:motivation:v1"><legend>补充问题</legend><label for="motivation">为什么希望申请这个岗位？</label><textarea id="motivation" name="motivation" required maxlength="10000"></textarea></fieldset>`;
  if(scenario.structureChange)fields+=field('unexpected-change','新增待人工核对字段');
  return `<form data-application-form data-job-id="${job.id}" data-tenant="${tenant}" data-account="${account}" method="post" action="/site/${tenant}/apply/${job.id}" enctype="multipart/form-data"><input type="hidden" name="jobId" value="${job.id}"><input type="hidden" name="tenant" value="${tenant}"><input type="hidden" name="account" value="${account}">${fields}<fieldset><legend>简历附件</legend><label for="resume">选择虚构简历（最大8MB）</label><input type="file" id="resume" name="resume" required></fieldset><button type="submit" data-submit-application>提交申请</button></form>`;
}

export async function createFixture({dataDir,port=17322,testMode=false,testKey}={}) {
  if(!Number.isInteger(port) || port<0 || port>65535)throw new Error('测试站端口无效。');
  if(testMode && (typeof testKey!=='string' || testKey.length<16))throw new Error('测试模式必须配置至少16字符的测试密钥。');
  const directory=runtimeDirectory(dataDir),stateFile=path.join(directory,'fixture-state.json'),uploadDir=path.join(directory,'uploads');
  fs.mkdirSync(uploadDir,{recursive:true,mode:0o700});
  if(fs.realpathSync(uploadDir)!==uploadDir)throw new Error('附件目录不能是符号链接。');
  let state={version:1,sessions:{},receipts:{},submitRequests:[]};
  if(fs.existsSync(stateFile)) {
    if(fs.lstatSync(stateFile).isSymbolicLink())throw new Error('测试站状态不能是符号链接。');
    state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    if(state.version!==1 || !state.sessions || !state.receipts || !Array.isArray(state.submitRequests))throw new Error('测试站持久状态无效；未覆盖原文件。');
  }
  const scenarios=new Map();
  function persist() {
    const temp=path.join(directory,`fixture-state-${randomUUID()}.tmp`);
    try {fs.writeFileSync(temp,JSON.stringify(state),{mode:0o600,flag:'wx'});fs.renameSync(temp,stateFile);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  }
  let actualPort=port;
  const origin=()=>`http://127.0.0.1:${actualPort}`;
  function send(response,status,body,type='text/html; charset=utf-8',headers={}) {
    response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",...headers});
    response.end(body);
  }
  const json=(response,status,value)=>send(response,status,JSON.stringify(value),'application/json; charset=utf-8');
  function cookieToken(request,tenant) {
    const name=`fixture_${tenant}=`;
    return String(request.headers.cookie || '').split(';').map(value=>value.trim()).find(value=>value.startsWith(name))?.slice(name.length) || '';
  }
  function getSession(request,response,tenant) {
    let token=cookieToken(request,tenant),session=state.sessions[token];
    if(!session || session.tenant!==tenant) {
      token=randomBytes(24).toString('hex');
      session={tenant,status:tenant==='beta'?'ready':'login',account:tenant==='beta'?'demo':'',createdAt:new Date().toISOString()};
      state.sessions[token]=session;persist();
      response.setHeader('Set-Cookie',`fixture_${tenant}=${token}; Path=/site/${tenant}; HttpOnly; SameSite=Strict; Max-Age=604800`);
    }
    return session;
  }
  const publicLogin=session=>({status:session.status,account:session.account || '',tenant:testMode && TENANTS.has(session.reportedTenant)?session.reportedTenant:session.tenant});
  function validOrigin(request,pathname) {
    if(request.headers.host!==`127.0.0.1:${actualPort}`)throw new RequestError(403,'Host 不属于本地招聘测试站。');
    if(request.headers.origin && request.headers.origin!==origin())throw new RequestError(403,'请求来源不属于本地招聘测试站。');
    // Extension tabs.create/update can produce cross-site top-level navigation
    // metadata without an Origin header. Permit only ordinary fixture pages;
    // session JSON, test hooks, subresources and every mutation stay protected.
    const pageNavigation=request.method==='GET' && request.headers.origin===undefined &&
      request.headers['sec-fetch-mode']==='navigate' && request.headers['sec-fetch-dest']==='document' &&
      /^\/site\/(?:alpha|beta)\/(?:jobs(?:\/[a-zA-Z0-9_-]{1,80})?|(?:apply|receipt)\/[a-zA-Z0-9_-]{1,80}|login)$/.test(pathname);
    if(request.headers['sec-fetch-site']==='cross-site' && !pageNavigation)throw new RequestError(403,'禁止跨站访问。');
  }
  async function testRoute(request,response,pathname) {
    if(!testMode)throw new RequestError(404,'页面不存在。');
    const supplied=Buffer.from(request.headers['x-fixture-test-key'] || ''),expected=Buffer.from(testKey);
    if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))throw new RequestError(403,'测试接口鉴权失败。');
    if(pathname==='/__test/state' && request.method==='GET') {
      return json(response,200,{receipts:Object.values(state.receipts).map(receipt=>({...receipt,fields:{...receipt.fields}})),submitRequests:state.submitRequests.map(attempt=>({...attempt})),sessions:Object.values(state.sessions).map(publicLogin)});
    }
    if(request.method!=='POST')throw new RequestError(405,'请求方法不支持。');
    const body=await jsonBody(request);
    if(!TENANTS.has(body.tenant))throw new RequestError(400,'tenant 无效。');
    if(pathname==='/__test/scenario') {
      if(!JOBS[body.tenant].some(job=>job.id===body.jobId))throw new RequestError(400,'岗位无效。');
      const allowed=['tenant','jobId','loseReceipt','hideReceipt','expireSessionOnSubmit','structureChange'];
      if(Object.keys(body).some(key=>!allowed.includes(key)) || Object.entries(body).some(([key,value])=>!['tenant','jobId'].includes(key) && typeof value!=='boolean'))throw new RequestError(400,'测试场景无效。');
      scenarios.set(body.tenant+':'+body.jobId,{...scenarios.get(body.tenant+':'+body.jobId),...body});
      return json(response,200,{ok:true});
    }
    if(pathname==='/__test/session') {
      if(!['ready','login','expired','verification','unknown'].includes(body.status) || (body.status==='ready' && !ACCOUNTS.has(body.account)))throw new RequestError(400,'会话状态无效。');
      if(body.allSessions!==undefined && typeof body.allSessions!=='boolean')throw new RequestError(400,'allSessions 无效。');
      if(body.reportedTenant!==undefined && body.reportedTenant!==null && !TENANTS.has(body.reportedTenant))throw new RequestError(400,'reportedTenant 无效。');
      const sessions=body.allSessions?Object.values(state.sessions).filter(session=>session.tenant===body.tenant):[getSession(request,response,body.tenant)];
      for(const session of sessions){
        session.status=body.status;session.account=ACCOUNTS.has(body.account)?body.account:session.account;
        // Only an authenticated test hook changes the rendered observation; the
        // cookie/session tenant and application receipt identity stay unchanged.
        if(body.reportedTenant===null)delete session.reportedTenant;
        else if(body.reportedTenant!==undefined)session.reportedTenant=body.reportedTenant;
      }
      persist();return json(response,200,{ok:true,affected:sessions.length});
    }
    throw new RequestError(404,'测试接口不存在。');
  }
  const server=http.createServer(async(request,response)=>{
    try {
      const parsed=new URL(request.url,origin()),pathname=parsed.pathname;
      validOrigin(request,pathname);
      if(pathname.startsWith('/__test/'))return await testRoute(request,response,pathname);
      if(pathname==='/' && request.method==='GET')return send(response,302,'','text/html; charset=utf-8',{Location:'/site/alpha/jobs'});
      const match=/^\/site\/(alpha|beta)\/(jobs|apply|login|receipt|session)(?:\/([a-zA-Z0-9_-]{1,80}))?$/.exec(pathname);
      if(!match)throw new RequestError(404,'页面不存在。');
      const [,tenant,route,jobId]=match;
      const job=jobId && JOBS[tenant].find(item=>item.id===jobId);
      if(jobId && !job || ['apply','receipt'].includes(route) && !jobId || ['login','session'].includes(route) && jobId)throw new RequestError(404,'岗位或页面不存在。');
      const session=getSession(request,response,tenant);
      if(route==='session' && request.method==='GET')return json(response,200,{login:publicLogin(session)});
      const html=(title,content,status=200)=>send(response,status,page(tenant,publicLogin(session),title,content));
      if(route==='login') {
        if(request.method==='POST') {
          if(!contentType(request,'application/x-www-form-urlencoded'))throw new RequestError(415,'登录表单格式无效。');
          const input=new URLSearchParams((await readBody(request,4096)).toString('utf8'));
          if(input.getAll('account').length!==1 || [...input.keys()].some(key=>key!=='account') || !ACCOUNTS.has(input.get('account')))throw new RequestError(400,'只能选择虚构 demo 或 other 账号。');
          session.status='ready';session.account=input.get('account');delete session.reportedTenant;persist();
          return send(response,303,'','text/html; charset=utf-8',{Location:`/site/${tenant}/login`});
        }
        if(request.method==='GET')return html('账号准备',`<p>只选择虚构账号，无需密码、验证码或真实凭据。</p><form method="post" action="/site/${tenant}/login"><label for="account">演示账号</label><select name="account" id="account"><option value="demo"${session.account==='demo'?' selected':''}>demo</option><option value="other"${session.account==='other'?' selected':''}>other</option></select><button type="submit">使用此虚构账号登录</button></form>`);
      }
      if(route==='jobs' && request.method==='GET') {
        if(!jobId)return html('虚构岗位列表','<ul>'+JOBS[tenant].map(item=>`<li><a data-job-id="${item.id}" data-title="${escape(item.title)}" data-company="${escape(item.company)}" data-location="${escape(item.location)}" href="/site/${tenant}/jobs/${item.id}">${escape(item.title)}</a> · ${escape(item.company)} · ${escape(item.location)}</li>`).join('')+'</ul>');
        return html(job.title,`<p>${escape(job.company)} · ${escape(job.location)}</p><p>此岗位和公司均为虚构。</p><a data-apply-link href="/site/${tenant}/apply/${job.id}">申请这个虚构岗位</a>`);
      }
      if(!['apply','receipt'].includes(route))throw new RequestError(405,'请求方法不支持。');
      const scenario=scenarios.get(tenant+':'+job.id) || {};
      const currentReceipt=()=>state.receipts[keyFor(tenant,job.id,session.account)];
      if(route==='apply' && request.method==='POST') {
        // Count actual incoming POSTs independently from the unique accepted record.
        const attempt={id:randomUUID(),tenant,jobId:job.id,account:session.account,at:new Date().toISOString(),accepted:false,outcome:'pending'};
        state.submitRequests.push(attempt);persist();
        try {
          if(session.status!=='ready')throw new RequestError(401,'登录已失效，申请未接收。');
          const {fields,file}=multipart(await readBody(request,MAX_FILE+1024*1024),request.headers['content-type']);
          if(session.status!=='ready')throw new RequestError(401,'接收申请期间登录已失效，申请未接收。');
          if(fields.jobId!==job.id || fields.tenant!==tenant || fields.account!==session.account)throw new RequestError(409,'岗位、租户或账号与当前会话不符。');
          if(!fields['personal.name']?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields['personal.email'] || '') || job.question && !fields.motivation?.trim())throw new RequestError(400,'申请必填字段尚未完成。');
          // A duplicate is rejected visibly; uniqueness never hides a second submit request.
          if(currentReceipt())throw new RequestError(409,'该账号已申请此岗位，未再次接收。');
          const id=randomUUID(),storedFile=path.join(uploadDir,id+'.bin');
          const receipt={id,tenant,jobId:job.id,account:session.account,fileName:file.name,fileSize:file.bytes.length,sha256:createHash('sha256').update(file.bytes).digest('hex'),receivedAt:new Date().toISOString(),fields:{...fields}};
          fs.writeFileSync(storedFile,file.bytes,{mode:0o600,flag:'wx'});
          state.receipts[keyFor(tenant,job.id,session.account)]=receipt;
          attempt.accepted=true;attempt.outcome='accepted';
          if(scenario.expireSessionOnSubmit)session.status='expired';
          try{persist();}catch(error){delete state.receipts[keyFor(tenant,job.id,session.account)];attempt.accepted=false;attempt.outcome='storage-failure';fs.unlinkSync(storedFile);throw error;}
          return html('申请结果',scenario.loseReceipt || scenario.hideReceipt || session.status!=='ready'?'<p>暂未显示可靠回执，请到原岗位核对申请记录，勿重复提交。</p>':receiptHtml(receipt));
        } catch(error) {attempt.outcome=error instanceof RequestError?'rejected':'storage-failure';persist();throw error;}
      }
      if(request.method!=='GET')throw new RequestError(405,'请求方法不支持。');
      if(session.status!=='ready')return html('需要准备账号',`<p>尚未登录、登录失效或需要人工验证。请先在此浏览器处理账号准备。</p><a href="/site/${tenant}/login">打开账号准备</a>`);
      const receipt=currentReceipt();
      if(receipt && !scenario.hideReceipt)return html('申请回执',receiptHtml(receipt));
      if(route==='receipt')return html('核对申请记录','<p>当前未显示可核实的申请回执。没有回执不表示可以再次提交。</p>');
      if(receipt)return html('申请结果待核实','<p>暂未显示可靠回执，请核对申请记录，勿重复提交。</p>');
      return html(job.title+' · 申请',applicationHtml(tenant,job,session.account,scenario));
    } catch(error) {
      const status=error instanceof RequestError?error.status:500;
      if(!response.headersSent)json(response,status,{ok:false,error:status===500?'招聘测试站操作失败；未确认申请成功。':error.message});
      else response.end();
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  actualPort=server.address().port;
  return {server,port:actualPort,url:origin(),dataDir:directory,close:()=>new Promise((resolve,reject)=>{if(!server.listening){resolve();return;}server.close(error=>error?reject(error):resolve());server.closeIdleConnections();})};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const options={};
  try {
    for(let index=2;index<process.argv.length;index++) {
      const arg=process.argv[index];
      if(arg==='--data-dir')options.dataDir=process.argv[++index];
      else if(arg==='--port')options.port=Number(process.argv[++index]);
      else if(arg==='--test-mode')options.testMode=true;
      else throw new Error('未知参数。支持 --data-dir、--port 和 --test-mode。');
    }
    if(options.testMode)options.testKey=process.env.FIXTURE_TEST_KEY;
    const fixture=await createFixture(options);
    console.log(`虚构招聘测试站：${fixture.url}（仅监听 loopback）`);
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>fixture.close().then(()=>process.exit(0)));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
