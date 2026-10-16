import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ROOT, insideRoot} from './paths.mjs';
import {emptyProfile, validateProfile, flattenProfile} from '../autofill-extension/shared/schema.js';

export const VERSION = '0.2.0';
export const DASHBOARD = 'http://127.0.0.1:17321';
export const FIXTURE = 'http://127.0.0.1:17322';
const terminal = new Set(['submitted','unknown','failed','skipped','cancelled']);
const uid = () => crypto.randomUUID();
const clone = x => structuredClone(x);
const short = (x, max = 200) => typeof x === 'string' ? x.trim().slice(0, max) : '';
const sameTarget = (a,b) => !!a&&!!b&&['origin','tenant','expectedAccount','adapter','mode'].every(key=>a[key]===b[key]);
const sameClient = (a,b) => !!a&&!!b&&['clientId','profileId','extensionId'].every(key=>a[key]===b[key]);
// Ordinary fixture questions only; the browser also applies the original field guard.
const protectedQuestion = /password|passwd|passcode|\botp\b|token|cookie|captcha|verification.?code|密码|口令|验证码|校验码|登录|身份证|passport|salary|薪资|薪酬|work.?authori|work.?permit|工作许可|签证|visa|sponsor|性别|gender|consent|同意|隐私/i;
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function atomicJSON(file, data) {
  insideRoot(file); fs.mkdirSync(path.dirname(file), {recursive:true});
  const tmp = file + '.next'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, file);
}
export function localSite(tenant) {
  return {id:'local-'+tenant,name:tenant==='alpha'?'星河机器人 · 本地测试':'云杉软件 · 本地测试',adapter:'local-v1',origin:FIXTURE,listUrl:`${FIXTURE}/site/${tenant}/jobs`,loginUrl:`${FIXTURE}/site/${tenant}/login`,tenant,expectedAccount:'demo',mode:'demo',enabled:true,skipped:false,login:{status:'unknown'}};
}
function validateSite(site) {
  if (!site || typeof site !== 'object' || !/^[a-zA-Z][\w-]{0,63}$/.test(site.id)) throw new Error('网站标识格式不正确');
  let origin; try {origin = new URL(site.origin).origin;} catch {throw new Error('请填写完整网站地址');}
  if (!/^https?:/.test(origin) || new URL(site.origin).username || new URL(site.origin).password) throw new Error('网站地址不正确');
  const supported = origin===FIXTURE && site.adapter==='local-v1' && ['alpha','beta'].includes(site.tenant);
  const result = {id:site.id,name:short(site.name),origin,tenant:short(site.tenant || 'default',64),expectedAccount:short(site.expectedAccount,80),adapter:supported?'local-v1':'unsupported',mode:supported?'demo':'real',enabled:site.enabled===true,skipped:site.skipped===true};
  if (!result.name || !result.expectedAccount) throw new Error('请填写网站名称和申请账号标识');
  for (const key of ['listUrl','loginUrl']) {
    const value = short(site[key],2000);
    if (!value) {result[key]=''; continue;}
    const parsed = new URL(value); if (parsed.origin!==origin || parsed.username || parsed.password) throw new Error('列表和登录入口必须属于同一网站');
    result[key] = parsed.href;
  }
  if(supported && (result.listUrl!==`${FIXTURE}/site/${result.tenant}/jobs` || result.loginUrl!==`${FIXTURE}/site/${result.tenant}/login`)) throw new Error('本地接入入口与租户不符');
  return result;
}
export function scheduleDecision(settings, lastSchedule, now) {
  const date = new Date(now);
  // Schedules intentionally use the user's documented Asia/Shanghai timezone.
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const day=`${parts.year}-${parts.month}-${parts.day}`, time=`${parts.hour}:${parts.minute}`;
  return {day,due:settings.scheduleEnabled && time>=settings.time && lastSchedule?.day!==day};
}

export class Store {
  constructor(paths,{now=()=>Date.now()}={}) {
    this.paths=paths;this.clock=now;this.file=insideRoot(path.join(paths.data,'state.json'));this.lastSeen=0;this.connection=null;this.queue=[];this.command=null;this.tickBusy=false;
    this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{schema:2,version:VERSION,paused:true,running:false,settings:{mode:'demo',scheduleEnabled:false,time:'09:00',dailyLimit:3,keywords:[],cities:[],visual:true},sites:[],tasks:[],issues:[],profile:{version:0,data:emptyProfile(),mode:'demo'},resume:null,answers:[],lastSchedule:null};
    for(const t of this.state.tasks){if(t.status==='submitting'){t.status='unknown';t.phase='verify';this.step(t,'重启恢复','提交阶段已持久保存；只允许核对接收记录');this.issue(t,'unknown','提交结果待核实','重启时提交结果不明，系统不会再次提交');}else if(t.status==='running'){t.status='queued';t.phase='inspect';this.step(t,'重启恢复','恢复原任务，先重新检查网页和已有接收记录');}}
    this.save();
  }
  now(){return new Date(this.clock()).toISOString();}
  save(){atomicJSON(this.file,this.state);}
  step(t,label,detail=''){t.steps.push({at:this.now(),label,detail});t.updatedAt=this.now();}
  issue(t,kind,title,detail,question=null){
    const readiness=kind==='login'||kind==='account',key=readiness?`login:${t.siteId}`:`${kind}:${t.id}`;
    let issue=this.state.issues.find(i=>i.status==='open'&&(readiness?i.siteId===t.siteId&&['login','account'].includes(i.kind):i.key===key));
    if(!issue){issue={id:uid(),key,kind,title,detail,siteId:t.siteId,taskId:(kind==='login'||kind==='account')?null:t.id,question,createdAt:this.now(),status:'open'};this.state.issues.push(issue);}
    else if(readiness)Object.assign(issue,{key,kind,title,detail});
    t.issue=issue;return issue;
  }
  resolveTask(t){for(const issue of this.state.issues)if(issue.taskId===t.id&&issue.status==='open')issue.status='resolved';delete t.issue;}
  site(id){const site=this.state.sites.find(s=>s.id===id);if(!site)throw new Error('找不到这个网站');return site;}
  task(id){const t=this.state.tasks.find(t=>t.id===id);if(!t)throw new Error('找不到这个任务');return t;}
  invalidateTask(t){t.revision=(t.revision||0)+1;if(!terminal.has(t.status)&&t.status!=='submitting')t.phase='inspect';}
  pause(){this.state.paused=true;this.state.running=false;for(const t of this.state.tasks)if(['queued','running'].includes(t.status)){this.invalidateTask(t);t.status='queued';}}
  readiness(){
    const s=this.state,missing=[];
    if(!s.sites.some(site=>site.enabled&&!site.skipped))missing.push('请配置并启用至少一个招聘来源');
    if(!s.settings.keywords.length)missing.push('请设置岗位关键词');
    if(!s.settings.cities.length)missing.push('请设置工作城市');
    if(!s.profile.version)missing.push('请保存经确认的申请资料');
    for(const field of ['name','email','phone'])if(!s.profile.data.personal[field]?.confirmed||!s.profile.data.personal[field]?.zh)missing.push(`请确认${{name:'姓名',email:'邮箱',phone:'手机'}[field]}`);
    if(!s.resume)missing.push('请选择简历文件');
    if(s.profile.mode!==s.settings.mode||s.resume&&s.resume.mode!==s.settings.mode)missing.push('资料、简历与当前运行模式不一致');
    if(!s.sites.some(site=>site.enabled&&site.mode===s.settings.mode&&site.adapter==='local-v1'))missing.push(s.settings.mode==='real'?'真实网站尚待适配，本轮不能执行真实投递':'请启用本地测试站');
    return missing;
  }
  snapshot(){
    const s=clone(this.state),connected=this.clock()-this.lastSeen<6000&&this.lastSeen>0;
    for(const t of s.tasks){delete t.profileSnapshot;delete t.resumeSnapshot;delete t.answer;}
    const decision=scheduleDecision(s.settings,s.lastSchedule,this.clock());
    let nextRun=null;if(s.settings.scheduleEnabled){const day=decision.day;let target=new Date(`${day}T${s.settings.time}:00+08:00`);if(target.getTime()<=this.clock()&&s.lastSchedule?.day===day)target=new Date(target.getTime()+86400000);nextRun=target.toISOString();}
    const stats={demo:{submitted:0,today:0},real:{submitted:0,today:0}};
    for(const t of s.tasks){if(t.status==='submitted'){stats[t.mode].submitted++;if(this.day(t.submittedAt)===decision.day)stats[t.mode].today++;}}
    return {...s,now:this.now(),connection:{connected,lastSeen:this.lastSeen?new Date(this.lastSeen).toISOString():null,profileId:this.connection?.profileId||null},nextRun,readiness:this.readiness(),stats};
  }
  day(at=this.now()){return scheduleDecision({scheduleEnabled:false},null,new Date(at).getTime()).day;}
  setSettings({settings,sites}){
    if(!settings||!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time)||!Number.isInteger(settings.dailyLimit)||settings.dailyLimit<1||settings.dailyLimit>100||!['demo','real'].includes(settings.mode)||settings.visual!==true)throw new Error('请填写有效的每日时间、1至100的额度，并启用可视化执行');
    const strings=(items,label)=>{if(!Array.isArray(items)||items.length>30||items.some(x=>typeof x!=='string'||!x.trim()||x.length>100))throw new Error(`${label}格式不正确`);return [...new Set(items.map(x=>x.trim()))];};
    const next={mode:settings.mode,time:settings.time,dailyLimit:settings.dailyLimit,scheduleEnabled:settings.scheduleEnabled===true,visual:true,keywords:strings(settings.keywords,'关键词'),cities:strings(settings.cities,'城市')};
    if(!Array.isArray(sites)||sites.length>30)throw new Error('网站数量不正确');
    const mapped=sites.map(validateSite);if(new Set(mapped.map(x=>x.id)).size!==mapped.length)throw new Error('网站标识不能重复');
    // Dedupe keys and receipts identify an immutable account/tenant. Reconfigure a
    // different target with a new site id instead of retargeting existing tasks.
    for(const old of this.state.sites)if((this.state.tasks.some(t=>t.siteId===old.id)||this.command?.siteId===old.id||this.queue.some(c=>c.siteId===old.id))&&!sameTarget(old,mapped.find(s=>s.id===old.id)))throw new Error('已有任务或待执行操作的网站不能删除或更改账号、租户及接入方式；请使用新的网站标识');
    for(const site of mapped){const old=this.state.sites.find(s=>s.id===site.id);site.login=old&&old.tenant===site.tenant&&old.expectedAccount===site.expectedAccount&&old.origin===site.origin?old.login:{status:'unknown'};}
    for(const t of this.state.tasks){const site=mapped.find(s=>s.id===t.siteId);if(['queued','running'].includes(t.status)&&(next.mode!==t.mode||!site?.enabled||site.skipped)){this.invalidateTask(t);t.status='queued';}}
    this.state.settings=next;this.state.sites=mapped;this.save();
  }
  setProfile({data,mode,confirmed}){
    if(confirmed!==true||!['demo','real'].includes(mode))throw new Error('请先确认资料及用途');
    const validated=validateProfile(data);if(mode==='real'&&Object.values(validated.personal).some(v=>/虚构|测试|example\.invalid/.test((v.zh||'')+' '+v.source)))throw new Error('测试资料不能保存为真实投递资料');
    this.state.profile={version:this.state.profile.version+1,data:validated,mode,updatedAt:this.now()};this.save();
  }
  setResume({name,mime,base64,mode}){
    name=short(name,150);if(!name||!['demo','real'].includes(mode)||typeof base64!=='string'||base64.length>11500000||!/^[\w+/=\s]+$/.test(base64))throw new Error('请选择8MB以内的有效简历文件');
    if(!/\.(pdf|docx?|txt)$/i.test(name))throw new Error('支持 PDF、Word 或测试文本简历');
    if(mode==='real'&&/测试|demo|fictional/i.test(name))throw new Error('测试简历不能用于真实投递');
    const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>8*1024*1024)throw new Error('简历文件为空或超过8MB');
    const sha256=hash(bytes),dir=insideRoot(path.join(this.paths.data,'resumes'));fs.mkdirSync(dir,{recursive:true});const file=insideRoot(path.join(dir,sha256+'.bin'));fs.writeFileSync(file,bytes);
    this.state.resume={version:(this.state.resume?.version||0)+1,name:path.basename(name.replaceAll('\\','/')),mime:short(mime,100)||'application/octet-stream',size:bytes.length,sha256,mode,file,updatedAt:this.now()};this.save();
  }
  demo(){
    if(this.state.tasks.length||this.command||this.queue.length||this.state.running)throw new Error('演示初始化仅适用于全新数据目录；已有任务或运行中的配置不会覆盖');
    this.state.settings={mode:'demo',scheduleEnabled:false,time:'09:00',dailyLimit:3,keywords:['C++','前端'],cities:['杭州','上海'],visual:true};
    this.state.sites=['alpha','beta'].map(localSite);
    const data=JSON.parse(fs.readFileSync(path.join(ROOT,'autofill-extension/profile.example.json'),'utf8'));
    const f=v=>({zh:v,en:null,source:'虚构本地演示',confirmed:true});
    data.experience=[{id:'demo-exp-one',company:f('虚构机器人实验室'),role:f('测试开发实习生'),description:f('编写虚构机器人测试程序。'),startDate:f('2025-01'),endDate:f('2025-06')},{id:'demo-exp-two',company:f('虚构软件工作室'),role:f('测试前端实习生'),description:f('制作仅用于验收的演示界面。'),startDate:f('2025-07'),endDate:f('2025-09')}];
    this.setProfile({data,mode:'demo',confirmed:true});this.setResume({name:'本地演示_虚构简历.txt',mime:'text/plain',base64:Buffer.from('虚构测试简历\n仅供127.0.0.1本地招聘测试站验证附件上传。\n非用户真实简历。\n').toString('base64'),mode:'demo'});
    this.state.paused=true;this.state.running=false;this.save();
  }
  enqueueControl(op,site,payload={}){
    if(site.adapter!=='local-v1'){
      site.login={status:'unknown',checkedAt:this.now(),message:'这个网站尚待适配，不能可靠自动检查登录'};this.save();throw new Error('这个网站尚待适配，请等待接入验证');
    }
    if(!this.queue.some(c=>c.op===op&&c.siteId===site.id)&&!(this.command?.op===op&&this.command.siteId===site.id))this.queue.push({id:uid(),op,siteId:site.id,payload,control:true});
  }
  add(site,job,source='自动发现'){
    if(!job||typeof job.jobId!=='string'||!/^[\w-]{1,100}$/.test(job.jobId))throw new Error('岗位稳定标识无效');
    const parsed=new URL(job.url);if(parsed.origin!==site.origin||parsed.pathname!==`/site/${site.tenant}/jobs/${job.jobId}`)throw new Error('岗位链接与站点租户不符');
    const dedupeKey=[site.origin,site.tenant,job.jobId,site.expectedAccount].join('|');
    const existing=this.state.tasks.find(t=>t.dedupeKey===dedupeKey);if(existing)return {task:existing,duplicate:true};
    const title=short(job.title)||'待读取岗位',city=short(job.location),s=this.state.settings;
    const accepted=source==='手动加入'||s.keywords.some(k=>title.toLowerCase().includes(k.toLowerCase()))&&s.cities.some(c=>city.includes(c));
    const t={id:uid(),jobId:job.jobId,siteId:site.id,title,company:short(job.company)||site.name,location:city,url:parsed.origin+parsed.pathname,source,discoveredAt:this.now(),filterReason:source==='手动加入'?'手动加入，执行时仍检查站点、资料和账号':accepted?'符合关键词和城市筛选':'未符合关键词或城市筛选',dedupeKey,mode:site.mode,status:accepted?(site.adapter==='local-v1'?'queued':'waiting_user'):'skipped',phase:'inspect',steps:[],profileVersion:null,resumeVersion:null};
    this.step(t,'岗位入队',t.filterReason);this.state.tasks.push(t);if(site.adapter!=='local-v1')this.issue(t,'adapter','网站待适配','尚未验证的网站不会自动填写或提交');return {task:t,duplicate:false};
  }
  manual(url){
    let parsed;try{parsed=new URL(url);}catch{throw new Error('请输入完整岗位链接');}
    if(parsed.username||parsed.password||!/^https?:$/.test(parsed.protocol))throw new Error('岗位链接格式不正确');
    const site=this.state.sites.find(s=>s.origin===parsed.origin&&(s.adapter!=='local-v1'||parsed.pathname.startsWith(`/site/${s.tenant}/`)));if(!site)throw new Error('请先在设置中配置该网站');
    if(site.adapter!=='local-v1'){
      const stable=hash(Buffer.from(parsed.origin+parsed.pathname)).slice(0,24);const existing=this.state.tasks.find(t=>t.dedupeKey===`${site.origin}|${site.tenant}|${stable}|${site.expectedAccount}`);if(existing)return {task:existing,duplicate:true};
      const t={id:uid(),jobId:stable,siteId:site.id,title:'待适配岗位',company:site.name,location:'',url:parsed.origin+parsed.pathname,source:'手动加入',discoveredAt:this.now(),filterReason:'未接入的网站；岗位稳定标识须由后续适配器核实',dedupeKey:`${site.origin}|${site.tenant}|${stable}|${site.expectedAccount}`,mode:'real',status:'waiting_user',phase:'inspect',steps:[],profileVersion:null,resumeVersion:null};this.step(t,'手动加入','网站待适配');this.state.tasks.push(t);this.issue(t,'adapter','网站待适配','不能可靠识别岗位身份或执行表单；不会自动投递');this.save();return {task:t,duplicate:false};
    }
    const m=parsed.pathname.match(new RegExp(`^/site/${site.tenant}/(?:jobs|apply)/([a-zA-Z0-9_-]+)$`));if(!m)throw new Error('请加入岗位详情或申请页链接');
    const result=this.add(site,{jobId:m[1],url:`${site.origin}/site/${site.tenant}/jobs/${m[1]}`,title:'待读取岗位',company:site.name,location:''},'手动加入');this.save();return result;
  }
  run(discover=true){
    const missing=this.readiness();if(missing.length)throw new Error(missing.join('；'));
    this.state.paused=false;this.state.running=true;
    if(discover)for(const site of this.state.sites.filter(s=>s.enabled&&!s.skipped&&s.mode===this.state.settings.mode))if(site.adapter==='local-v1')this.enqueueControl('discover',site);
    this.save();
  }
  action(body){
    const action=body?.action;let result={};
    if(action==='demo')this.demo();
    else if(action==='run'||action==='discover')this.run(true);
    else if(action==='pause')this.pause();
    else if(action==='resume')this.run(false);
    else if(action==='add')result=this.manual(body.url);
    else if(['task-pause','task-resume','task-skip','verify','answer'].includes(action)){
      const t=this.task(body.taskId);
      if(action==='task-pause'&&!terminal.has(t.status)&&t.status!=='submitting'){this.invalidateTask(t);t.previousStatus=t.status;t.status='paused';t.pauseReason='用户暂停并接管';this.step(t,'用户暂停','停止后续自动动作；接管后可重新检查并恢复');}
      if(action==='task-resume'){
        if(['unknown','submitting','submitted'].includes(t.status))throw new Error('提交阶段的任务只能核对结果，不可重新投递');
        if(t.status==='paused'||t.status==='waiting_user'||t.status==='failed'){this.invalidateTask(t);t.status='queued';t.phase='inspect';this.resolveTask(t);delete t.pauseReason;this.step(t,'用户继续','重新检查同一个岗位、表单和已有接收记录');}
      }
      if(action==='task-skip'){if(['submitting','unknown','submitted'].includes(t.status))throw new Error('请保留提交记录并核对结果');this.invalidateTask(t);t.status='skipped';this.resolveTask(t);this.step(t,'暂时跳过','用户保留了此任务记录');}
      if(action==='verify'){if(!['unknown','submitted'].includes(t.status))throw new Error('只有已提交或结果待核实的任务可核对');this.queue.push({id:uid(),op:'verify',siteId:t.siteId,taskId:t.id,payload:{},control:true});}
      if(action==='answer'){
        if(t.status!=='waiting_answer'||!t.question)throw new Error('此任务当前没有等待回答的普通问题');
        if(typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>5000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body.answer))throw new Error('请填写5000字以内的确认答案');
        if(!this.validQuestion(t,t.question))throw new Error('问题或限定用途未通过保护检查，不能保存答案');
        const answer=body.answer.trim();
        t.answer={...t.question,value:answer};if(body.save===true){this.state.answers=this.state.answers.filter(a=>a.scope!==t.question.scope);this.state.answers.push({...t.answer,siteId:t.siteId,confirmedAt:this.now()});}
        t.status='queued';t.phase='inspect';this.resolveTask(t);this.step(t,'已补充答案','继续同一任务；仅匹配原问题和限定用途');
      }
    }else if(['site-check','site-open','site-skip','site-resume'].includes(action)){
      const site=this.site(body.siteId);
      if(action==='site-skip'){site.skipped=true;for(const t of this.state.tasks)if(t.siteId===site.id&&!terminal.has(t.status)&&t.status!=='submitting'){this.invalidateTask(t);if(t.status==='running')t.status='queued';}for(const i of this.state.issues)if(i.siteId===site.id&&!i.taskId&&i.status==='open')i.status='skipped';}
      else {if(action==='site-resume')site.skipped=false;this.enqueueControl(action==='site-open'?'open':'check',site,action==='site-open'?{url:site.loginUrl}:{});}
    }else if(action==='stop')this.pause();
    else throw new Error('不支持的操作');
    this.save();return {ok:true,...result};
  }
  heartbeat(client){
    if(!client||!/^[\w-]{8,100}$/.test(client.clientId)||!/^[\w-]{8,100}$/.test(client.profileId)||!/^[a-p]{32}$/.test(client.extensionId))throw new Error('执行端身份格式无效');
    this.expireCommand();
    if(this.command&&!sameClient(this.command,client))return false;
    if(this.connection?.clientId===client.clientId&&!sameClient(this.connection,client))return false;
    if(this.connection&&this.connection.clientId!==client.clientId&&this.clock()-this.lastSeen<6000)return false;
    if(this.connection?.profileId!==client.profileId){for(const s of this.state.sites)s.login={status:'unknown',checkedAt:null,profileId:client.profileId};}
    this.connection={clientId:client.clientId,profileId:client.profileId,extensionId:client.extensionId};this.lastSeen=this.clock();return true;
  }
  tick(){
    const decision=scheduleDecision(this.state.settings,this.state.lastSchedule,this.clock());
    if(decision.due){this.state.lastSchedule={day:decision.day,at:this.now(),result:'已触发一次；错过的往日批次不补跑'};try{this.run(true);}catch(e){this.state.lastSchedule.result='设置未就绪：'+e.message;}this.save();}
    this.expireCommand();
  }
  expireCommand(){
    if(this.command&&this.clock()-this.command.claimedAt>=60000){
      const c=this.command;this.command=null;
      if(c.taskId){const t=this.task(c.taskId);if(c.op==='submit'||t.status==='submitting'){t.status='unknown';t.phase='verify';this.issue(t,'unknown','提交结果待核实','执行端失去连接，系统不会再次点击提交');this.step(t,'执行端断开','保留提交边界，只允许核对结果');}else if(t.status==='running'){t.status='queued';t.phase='inspect';}}
      this.save();
    }
  }
  dailyUsed(){const day=this.day();return this.state.tasks.filter(t=>t.submitDay===day&&t.mode===this.state.settings.mode).length;}
  poll(client){
    if(!this.heartbeat(client))return {command:null,reason:'已有一个执行端连接；请关闭多余的执行器'};
    this.tick();if(this.command)return {command:null};
    // Paused discovery must not block explicit login checks or read-only receipt verification.
    const queued=this.queue.findIndex(c=>c.op!=='discover'||(!this.state.paused&&this.state.sites.some(s=>s.id===c.siteId&&s.enabled&&!s.skipped&&s.mode===this.state.settings.mode)));
    let c=queued<0?null:this.queue.splice(queued,1)[0];
    if(!c&&this.state.running&&!this.state.paused&&this.dailyUsed()<this.state.settings.dailyLimit){
      const t=this.state.tasks.find(t=>['queued','running'].includes(t.status)&&this.state.sites.some(s=>s.id===t.siteId&&s.enabled&&!s.skipped&&s.adapter==='local-v1'&&s.mode===this.state.settings.mode));
      if(t){const site=this.site(t.siteId);
        if(site.login?.status!=='ready'||site.login.profileId!==client.profileId)c={id:uid(),op:'check',siteId:site.id,payload:{},control:true};
        else{
          if(!t.profileSnapshot){t.profileSnapshot=clone(this.state.profile);t.resumeSnapshot=clone(this.state.resume);t.profileVersion=this.state.profile.version;t.resumeVersion=this.state.resume.version;this.step(t,'锁定本次资料版本',`资料 v${t.profileVersion} · 简历 v${t.resumeVersion}`);}
          t.status='running';c={id:uid(),op:t.phase||'inspect',siteId:site.id,taskId:t.id,payload:{}};
          if(c.op==='fill')c.payload={entries:flattenProfile(t.profileSnapshot.data).filter(e=>e.confirmed),layout:t.layout};
          if(c.op==='upload'){const f=t.resumeSnapshot;c.payload={file:{name:f.name,mime:f.mime,size:f.size,sha256:f.sha256,base64:fs.readFileSync(insideRoot(f.file)).toString('base64')},layout:t.layout};}
          if(c.op==='answer')c.payload={...t.question,answer:t.answer.value,layout:t.layout};
          if(c.op==='submit'){c.payload={layout:t.layout};t.status='submitting';t.submitDay=this.day();this.step(t,'提交阶段已记录','先保存提交边界，再允许明确的提交操作；结果不明不重试');}
        }
      }
    }
    if(!c)return {command:null};
    c.clientId=client.clientId;c.profileId=client.profileId;c.extensionId=client.extensionId;c.claimedAt=this.clock();if(c.taskId)c.revision=this.task(c.taskId).revision||0;this.command=c;this.save();
    const site=clone(this.site(c.siteId)),task=c.taskId?this.task(c.taskId):null;
    delete site.login;
    return {command:{id:c.id,op:c.op,site,payload:c.payload,task:task?{id:task.id,jobId:task.jobId,url:task.url,company:task.company,title:task.title,mode:task.mode,tabId:task.tabId}:undefined}};
  }
  authorize({clientId,commandId}){
    this.expireCommand();
    const c=this.command;if(!c||c.id!==commandId||c.clientId!==clientId||!sameClient(c,this.connection))return {allowed:false};
    if(c.op==='verify')return {allowed:!!c.taskId&&['unknown','submitted'].includes(this.task(c.taskId).status)};
    if(!c.taskId){const site=this.site(c.siteId);return {allowed:c.op==='open'||c.op==='check'||(!this.state.paused&&site.enabled&&!site.skipped&&site.mode===this.state.settings.mode)};}
    const t=this.task(c.taskId),site=this.site(t.siteId);
    return {allowed:(t.revision||0)===c.revision&&!this.state.paused&&!site.skipped&&site.enabled&&['running','submitting'].includes(t.status)&&t.mode===this.state.settings.mode&&t.mode==='demo'&&site.origin===FIXTURE&&site.adapter==='local-v1'&&t.profileSnapshot?.mode==='demo'&&t.resumeSnapshot?.mode==='demo'};
  }
  loginResult(site,login,profileId=this.connection?.profileId){
    const valid=['ready','login','expired','verification','unknown','account'];let status=valid.includes(login?.status)?login.status:'unknown';
    if(status==='ready'&&(login.account!==site.expectedAccount||login.tenant!==site.tenant))status='account';
    site.login={status,account:status==='ready'?short(login.account,80):'',tenant:site.tenant,checkedAt:this.now(),profileId};
    if(status==='ready'){
      for(const i of this.state.issues)if(i.siteId===site.id&&['login','account'].includes(i.kind)&&i.status==='open')i.status='resolved';
      for(const t of this.state.tasks)if(t.siteId===site.id&&t.status==='waiting_user'&&['login','account'].includes(t.issue?.kind)){t.status='queued';t.phase='inspect';delete t.issue;this.step(t,'登录检查通过','恢复原任务；先核对岗位及已投记录');}
    }else{
      const labels={login:'需要登录',expired:'登录已失效',verification:'需要人工验证',unknown:'账号状态待核实',account:'申请账号或公司范围不符'};
      for(const t of this.state.tasks)if(t.siteId===site.id&&!terminal.has(t.status)&&!['paused','submitting'].includes(t.status)){
        t.status='waiting_user';this.issue(t,status==='account'?'account':'login',labels[status],'请在投递浏览器处理后重新检查；其他就绪站点仍可继续');
      }
      if(!this.state.issues.some(i=>i.siteId===site.id&&['login','account'].includes(i.kind)&&i.status==='open')){
        const key=`login:${site.id}`;this.state.issues.push({id:uid(),key,kind:status==='account'?'account':'login',siteId:site.id,taskId:null,title:labels[status],detail:'请在指定投递浏览器中处理并重新检查',status:'open',createdAt:this.now()});
      }
    }
    return site.login;
  }
  validQuestion(t,q){const site=this.site(t.siteId);return q?.key==='motivation'&&typeof q.text==='string'&&q.text.trim()&&q.text.length<=2000&&!protectedQuestion.test(q.text)&&q.scope===`local-v1:${site.tenant}:${t.jobId}:motivation:v1`;}
  receipt(t,r){
    if(!r||typeof r.id!=='string'||!r.id||r.jobId!==t.jobId||r.account!==this.site(t.siteId).expectedAccount||r.fileName!==t.resumeSnapshot?.name||Number(r.fileSize)!==t.resumeSnapshot?.size||r.sha256!==t.resumeSnapshot?.sha256)return false;
    t.status='submitted';t.phase='done';t.result={receiptId:r.id,jobId:r.jobId,fileName:r.fileName,fileSize:Number(r.fileSize),sha256:r.sha256,evidence:'来自目标测试站的实际接收记录，文件名称、大小和摘要与任务版本一致'};t.submittedAt ||= this.now();this.resolveTask(t);this.step(t,'已核对接收记录',`回执 ${r.id} · 附件 ${r.fileSize} 字节 · 摘要一致`);return true;
  }
  result({clientId,commandId,result:r}){
    this.expireCommand();
    const c=this.command;if(!c||c.id!==commandId||c.clientId!==clientId||!sameClient(c,this.connection))return {ok:false,error:'操作已过期；不会重新提交'};
    this.command=null;const site=this.site(c.siteId),t=c.taskId?this.task(c.taskId):null;
    if(!r||typeof r!=='object')r={ok:false,kind:'failure',message:'执行端返回格式不正确'};
    if(t&&c.op!=='submit'&&c.op!=='verify'&&(t.revision||0)!==c.revision){this.save();return {ok:true,ignored:true};}
    if(t){if(Number.isInteger(r.tabId))t.tabId=r.tabId;if(typeof r.url==='string'&&r.url.startsWith(site.origin+'/'))t.currentUrl=r.url;}
    if(r.login)r={...r,login:this.loginResult(site,r.login,c.profileId)};
    if(c.op==='check'){
      if(!r.login)this.loginResult(site,{status:r.kind==='login'?'login':'unknown'},c.profileId);
    }else if(c.op==='open'){}else if(c.op==='discover'){
      if(r.ok&&Array.isArray(r.jobs))for(const job of r.jobs.slice(0,200)){try{this.add(site,job);}catch{site.lastDiscoveryError='部分岗位结构不符合已验证接入规则';}}
      site.lastDiscoveredAt=this.now();site.lastDiscoveryCount=Array.isArray(r.jobs)?r.jobs.length:0;
      if(!r.ok)site.lastDiscoveryError=short(r.message)||'无法读取岗位列表';
    }else if(t){
      if(r.receipt&&this.receipt(t,r.receipt)){}
      else if(c.op==='verify'){
        this.step(t,'核对接收结果',r.login?.status==='ready'?'未发现与本次简历一致的可靠回执；保留待核实状态':'需先恢复正确账号登录，再核对结果');
        if(t.status!=='submitted'){t.status='unknown';this.issue(t,'unknown','提交结果待核实','未找到可靠回执；不会自动再次提交');}
      }else if(!r.ok){
        if(c.op==='submit'||r.kind==='unknown'){t.status='unknown';t.phase='verify';this.issue(t,'unknown','提交结果待核实','可能已被网站接收；请核对记录，系统不会再次提交');this.step(t,'提交回执未确认',short(r.message)||'只允许核对，禁止自动重投');}
        else if(r.kind==='paused'||t.status==='paused'||this.state.paused){if(t.status!=='paused')t.status='queued';t.phase='inspect';this.step(t,'自动动作已停止','继续时重新检查当前页面');}
        else if(['login','account'].includes(r.kind)){t.status='waiting_user';this.issue(t,r.kind,r.kind==='login'?'需要登录或验证':'账号范围不符','请在投递浏览器完成后重新检查');site.login={status:r.kind,checkedAt:this.now(),profileId:this.connection?.profileId};}
        else{t.status=r.kind==='failure'?'failed':'waiting_user';this.issue(t,r.kind==='structure'?'structure':'manual',r.kind==='structure'?'页面结构已变化':'需要人工处理',short(r.message,1000)||'请检查当前招聘页面');this.step(t,'执行暂停',short(r.message,300));}
      }else if(t.status==='paused'){
        this.step(t,'接管期间的操作已结束','保留暂停状态；恢复前重新检查页面');
      }else if(r.login&&r.login.status!=='ready'){
        t.status='waiting_user';
      }else if(c.op==='inspect'){
        if(typeof r.layout!=='string'||!r.layout||r.layout.length>250000||r.question&&!this.validQuestion(t,r.question)){t.status='waiting_user';this.issue(t,'structure','申请表或问题未通过保护检查','请检查页面结构、问题原文和限定用途');this.save();return {ok:true};}
        t.layout=r.layout;t.question=r.question||null;
        if(t.question){const saved=t.answer?.scope===t.question.scope&&t.answer.text===t.question.text?t.answer:this.state.answers.find(a=>a.scope===t.question.scope&&a.text===t.question.text&&a.siteId===site.id);if(saved)t.answer=clone(saved);else delete t.answer;}
        t.phase='fill';this.step(t,'已读取申请表','岗位、账号和表单已检查；未发现已有接收记录');
      }else if(c.op==='fill'){t.phase='upload';if(r.layout)t.layout=r.layout;this.step(t,'普通资料已填写',`经确认字段 ${Number(r.filled)||0} 项；保留原值及结构检查`);}
      else if(c.op==='upload'){
        if(r.fileName!==t.resumeSnapshot.name||Number(r.fileSize)!==t.resumeSnapshot.size||r.sha256!==t.resumeSnapshot.sha256){t.status='waiting_user';this.issue(t,'manual','附件校验未通过','请核对所选简历和页面附件');}
        else{if(r.layout)t.layout=r.layout;this.step(t,'简历已附加',`${r.fileName} · ${r.fileSize} 字节；等待站点接收后核对摘要`);
          if(t.question&&!t.answer){t.status='waiting_answer';this.issue(t,'answer','需要补充一个答案',t.question.text,t.question);this.step(t,'等待补充答案',t.question.text);}
          else t.phase=t.question?'answer':'submit';}
      }else if(c.op==='answer'){if(r.layout)t.layout=r.layout;t.phase='submit';this.step(t,'限定用途答案已填写','原问题与用途一致，继续同一任务');}
      else if(c.op==='submit'){t.status='unknown';t.phase='verify';this.issue(t,'unknown','提交结果待核实','没有可靠回执，系统不会自动再次提交');}
    }
    this.save();return {ok:true};
  }
}
