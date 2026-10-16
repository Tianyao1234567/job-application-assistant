import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {emptyProfile,validateProfile,validDate,flattenProfile} from '../shared/schema.js';
import {matchFields} from '../shared/match.js';
const f=(zh,en=null,confirmed=true)=>({zh,en,source:'虚构测试',confirmed});
const sample=()=>JSON.parse(fs.readFileSync(new URL('../profile.example.json',import.meta.url),'utf8'));
function scan(fields){return {fields,layout:'test-layout'};}
function field(label,extra={}){return {token:'x',signature:'sig',label,hints:'',section:'个人信息',group:0,type:'text',tag:'INPUT',existing:false,blocked:null,...extra};}
test('示例资料有效、导入导出往返无损',()=>assert.deepEqual(validateProfile(sample()),sample()));
test('拒绝未知版本、顶层/个人危险字段',()=>{
  for(const mutation of [p=>p.schemaVersion=2,p=>p.password=f('secret'),p=>p.personal.gender=f('男')]){const p=emptyProfile();mutation(p);assert.throws(()=>validateProfile(p));}
});
test('拒绝不正确字段类型、空来源、确认标志及缺失语言键',()=>{
  for(const value of ['text',null,{zh:'姓名',en:null,source:'',confirmed:true},{zh:'姓名',en:null,source:'test',confirmed:'true'},{zh:'姓名',source:'test',confirmed:true}]){const p=emptyProfile();p.personal.name=value;assert.throws(()=>validateProfile(p));}
});
test('日期保留精度且拒绝不存在的日期',()=>{
  for(const date of ['2026-06','2024-02-29','2026-06-16']) assert.equal(validDate(date),true);
  for(const date of ['2026-02-29','2026-04-31','2026-13','2026-6','2026/06','2026-06-00']) assert.equal(validDate(date),false);
  const p=emptyProfile();p.education=[{id:'e1',startDate:f('2026-02-29')}];assert.throws(()=>validateProfile(p));
});
test('未知值 null 不产生填写候选；年月不补日',()=>{
  const p=emptyProfile();p.education=[{id:'e1',startDate:f('2026-09'),endDate:f(null)}];const entries=flattenProfile(validateProfile(p));assert.equal(entries.length,1);assert.equal(entries[0].value,'2026-09');
});
test('稳定ID不允许重复或特殊路径',()=>{
  for(const id of ['../bad','e.1','__proto__']){const p=emptyProfile();p.education=[{id}];assert.throws(()=>validateProfile(p));}
  const p=emptyProfile();p.education=[{id:'e1'}];p.projects=[{id:'e1'}];assert.throws(()=>validateProfile(p));
});
test('自定义答案不可存密码或身份凭据',()=>{
  for(const key of ['password','otp','access_token','cookie','passport']){const p=emptyProfile();p.customAnswers[key]=f('secret');assert.throws(()=>validateProfile(p));}
});
test('手机号/邮箱/链接/长度校验',()=>{
  for(const [kind,key,value] of [['personal','email','bad'],['personal','phone','abcdef'],['links','website','javascript:alert(1)'],['personal','name','x'.repeat(10001)]]){const p=emptyProfile();p[kind][key]=f(value);assert.throws(()=>validateProfile(p));}
});
test('中英文切换与来源标注',()=>{
  const p=emptyProfile();p.personal.name=f('虚构人','Fictional Person');assert.equal(flattenProfile(p,'en')[0].value,'Fictional Person');assert.equal(flattenProfile(p,'zh')[0].value,'虚构人');
});
test('明确普通字段匹配；未确认资料不进入匹配',()=>{
  const p=emptyProfile();p.personal.name=f('虚构人');p.personal.phone=f('10000000000',null,false);
  const matches=matchFields(scan([field('姓名'),field('手机')]),flattenProfile(p));assert.equal(matches[0].key,'personal.name');assert.equal(matches[0].checked,true);assert.equal(matches[1].key,'');
});
test('已有值默认不勾选',()=>{
  const p=emptyProfile();p.personal.name=f('虚构人');assert.equal(matchFields(scan([field('姓名',{existing:true})]),flattenProfile(p))[0].checked,false);
});
test('两条教育不串填，重复条目默认必须人工确认',()=>{
  const p=sample();const fields=[field('学校名称',{section:'教育经历 / 本科教育经历',group:1}),field('学校名称',{section:'教育经历 / 硕士教育经历',group:2})];
  const matches=matchFields(scan(fields),flattenProfile(p));assert.equal(matches[0].key,'education.edu-bachelor.school');assert.equal(matches[1].key,'education.edu-master.school');assert.ok(matches.every(m=>!m.checked));
});
test('没有 section 的专业/职位/日期不猜测',()=>{
  const matches=matchFields(scan(['专业名称','职位','开始时间'].map(label=>field(label,{section:''}))),flattenProfile(sample()));assert.ok(matches.every(m=>!m.key && !m.checked));
});
test('联系人、拆分姓名、语言歧义不自动填写',()=>{
  const matches=matchFields(scan(['紧急联系人姓名','First name','Last name','英文姓名'].map(label=>field(label))),flattenProfile(sample(),'zh'));assert.ok(matches.every(m=>!m.key && !m.checked));
});
test('期望城市和现居城市区分',()=>{
  const matches=matchFields(scan([field('期望城市'),field('现居城市')]),flattenProfile(sample()));assert.equal(matches[0].key,'personal.desiredCity');assert.equal(matches[1].key,'personal.location');
});
test('保护字段即使有保存映射也不能复用',()=>{
  const target=field('性别',{blocked:'敏感问题'});const matches=matchFields(scan([target]),flattenProfile(sample()),[{signature:'sig',layout:'test-layout',key:'personal.name'}]);assert.equal(matches[0].key,'');assert.equal(matches[0].checked,false);
});
test('保存映射只有完整结构一致才可复用且从不自动勾选',()=>{
  const target=field('未知普通字段'),entries=flattenProfile(sample()),saved=[{signature:'sig',layout:'test-layout',key:'personal.name'}];
  const match=matchFields(scan([target]),entries,saved)[0];assert.equal(match.key,'personal.name');assert.equal(match.checked,false);
  assert.equal(matchFields({fields:[target],layout:'changed'},entries,saved)[0].key,'');
});
test('敏感与登录同义词保护',()=>{
  const sandbox={};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(new URL('../content/guard.js',import.meta.url),'utf8'),sandbox);
  for(const word of ['密码','OTP','登录邮箱','passport','身份令牌 token','性别','Expected salary','Work authorization','Visa sponsorship','犯罪记录','残障','Ethnicity','Veteran','Relocation','Notice period','到岗时间','利益冲突','Legal declaration','合同条款','Privacy consent','身份证号码','user_age','userSex','rightToWork','ssn','ID card','passcode','Expected CTC','permission to work','When can you start','Earliest start date']) assert.ok(sandbox.JobFill.guardText(word),word);
  for(const word of ['Full name','学校名称','现居城市','项目描述','Major','Programming skills','applicationPage','homepage','University of Sussex','Accounting']) assert.equal(sandbox.JobFill.guardText(word),null,word);
});
test('扩展仅授权本机站点；原通用填写内容代码保持无提交与网络调用',()=>{
  const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root),'utf8'));
  assert.deepEqual(manifest.permissions,['activeTab','scripting','storage','alarms']);assert.equal(manifest.manifest_version,3);
  assert.deepEqual(manifest.host_permissions,['http://127.0.0.1/*']);
  assert.equal(manifest.content_security_policy.extension_pages,"script-src 'self'; object-src 'none'; connect-src http://127.0.0.1:17321");
  assert.deepEqual(manifest.content_scripts,[{matches:['http://127.0.0.1/*'],js:['bridge/dashboard.js'],run_at:'document_idle',all_frames:false}]);
  for(const file of ['background.js','popup/index.html','options/index.html','workspace/index.html','content/guard.js','content/scan.js','content/fill.js','bridge/dashboard.js','runner/index.html','runner/runner.js','runner/local-adapter.js']) assert.ok(fs.existsSync(new URL(file,root)),file);
  for(const file of ['content/guard.js','content/scan.js','content/fill.js','workspace/workspace.js']){const code=fs.readFileSync(new URL(file,root),'utf8');assert.doesNotMatch(code,/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|requestSubmit)\s*\(|\.submit\s*\(|KeyboardEvent\s*\(|\.innerHTML\s*=/);}
});
test('本地执行器拒绝真实模式、未适配网站和外部站点命令',()=>{
  const source=fs.readFileSync(new URL('../runner/runner.js',import.meta.url),'utf8');
  const policy=source.slice(source.indexOf('function expected(command)'),source.indexOf('function safeUrl('));
  const sandbox={FIXTURE:'http://127.0.0.1:17322',Stop:class extends Error {constructor(kind,message){super(message);this.kind=kind;}}};
  vm.createContext(sandbox);vm.runInContext(policy,sandbox);
  const good={site:{adapter:'local-v1',origin:'http://127.0.0.1:17322',mode:'demo',tenant:'alpha',expectedAccount:'demo'},task:{id:'test',mode:'demo',jobId:'cpp-001'}};
  assert.equal(sandbox.expected(good).jobId,'cpp-001');
  for(const change of [c=>c.site.mode='real',c=>c.task.mode='real',c=>c.site.adapter='unsupported',c=>c.site.origin='https://example.com',c=>c.site.origin='http://127.0.0.1:17323',c=>c.site.tenant='other',c=>c.task.jobId='../bad']){
    const command=structuredClone(good);change(command);assert.throws(()=>sandbox.expected(command),/./);
  }
});
