import {Worker} from 'node:worker_threads';
import {emptyProfile,validateProfile} from '../autofill-extension/shared/schema.js';
const labels={name:'personal.name',姓名:'personal.name',phone:'personal.phone',电话:'personal.phone',手机:'personal.phone',email:'personal.email',邮箱:'personal.email','first name':'personal.firstName','given name':'personal.firstName','last name':'personal.lastName','family name':'personal.lastName',现居城市:'personal.location',现居地:'personal.location','current city':'personal.location','preferred city':'personal.desiredCity',期望城市:'personal.desiredCity',github:'links.github',linkedin:'links.linkedin',website:'links.website',个人网站:'links.website',学校:'education.school',school:'education.school',university:'education.school',学位:'education.degree',degree:'education.degree',专业:'education.major',major:'education.major',公司:'experience.company',company:'experience.company',职位:'experience.role',role:'experience.role',部门:'experience.department',department:'experience.department',项目名称:'projects.title','project name':'projects.title',项目角色:'projects.role',技能:'skills.description',skills:'skills.description'};
const normalize=value=>value.normalize('NFKC').trim();
export function resumeCandidates(pages,sha256) {
 const candidates=new Map(),draft=emptyProfile(),skillLines=[];let section=null,indexes={education:0,experience:0,projects:0};
 const add=(key,value,record)=>{
  value=normalize(value).replace(/[\x00-\x1f]/g,' ').trim();if(!value||value.length>5000)return;
  const parts=key.split('.');let object=draft[parts[0]],field=parts.at(-1);
  if(Array.isArray(object)){const id=parts[1];let entry=object.find(e=>e.id===id);if(!entry){entry={id};object.push(entry);}object=entry;}
  const prior=object[field];object[field]={zh:value,en:null,source:'PDF 第'+record.page+'页',confirmed:false};
  try{validateProfile(draft);}catch{if(prior)object[field]=prior;else delete object[field];return;}
  const candidate=candidates.get(key)||{key,label:field,values:[]};
  if(!candidate.values.some(v=>v.value===value))candidate.values.push({value,page:record.page,evidence:record.text.slice(0,300)});
  candidates.set(key,candidate);
 };
 const entryKey=(kind,field)=>`${kind}.pdf-${sha256.slice(0,10)}-${kind}-${indexes[kind]}.${field}`;
 const lines=pages.flatMap(p=>p.lines.flatMap(text=>normalize(text).split(/\s*[|｜;；]\s*|\s+(?=(?:姓名|手机|电话|邮箱|email|phone|github|linkedin)\s*[:：])/i).map(part=>({page:p.page,text:part}))));
 for(const record of lines){
  const line=record.text;
  if(/^(?:education|教育经历|教育背景)\s*[:：]?$/i.test(line)){section='education';continue;}
  if(/^(?:experience|work experience|工作经历|实习经历|工作与实习经历)\s*[:：]?$/i.test(line)){section='experience';continue;}
  if(/^(?:projects|project experience|项目经历)\s*[:：]?$/i.test(line)){section='projects';continue;}
  if(/^(?:skills|技能|专业技能)\s*[:：]?$/i.test(line)){section='skills';continue;}
  const labelled=/^([^:：]{1,30})[:：]\s*(.+)$/.exec(line);
  if(labelled){
   const target=labels[labelled[1].trim().toLowerCase()];
   if(target){const [kind,field]=target.split('.');let key=target;
    if(Object.hasOwn(indexes,kind)){section=kind;key=entryKey(kind,field);if(candidates.has(key)&&['school','company','title'].includes(field)){indexes[kind]++;key=entryKey(kind,field);}}
    if(key==='skills.description'){skillLines.push({...record,text:labelled[2]});continue;}
    if(key==='personal.email'){for(const value of labelled[2].match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi)||[])add(key,value,record);continue;}
    add(key,labelled[2],record);continue;
   }
  }
  for(const email of line.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi)||[])add('personal.email',email,record);
  const phone=line.match(/\+\d[\d ()-]{6,25}\d|\b1[3-9]\d{9}\b/g)||[];
  for(const value of phone)if(value.replace(/\D/g,'').length>=10&&value.replace(/\D/g,'').length<=15)add('personal.phone',value,record);
  for(const url of line.match(/https?:\/\/[^\s<>]+/g)||[]){try{const parsed=new URL(url.replace(/[),;，；。]+$/,''));if(/(^|\.)github\.com$/.test(parsed.hostname))add('links.github',parsed.href,record);else if(/(^|\.)linkedin\.com$/.test(parsed.hostname))add('links.linkedin',parsed.href,record);}catch{}}
  if(section==='education'&&/(?:university|大学|学院)/i.test(line)){const school=line.split(/[|｜]/)[0].trim();if(school.length<140)add(entryKey(section,'school'),school,record);}
  if(section==='skills'&&line.length<1000)skillLines.push(record);
 }
 if(!candidates.has('personal.name')){
  const top=lines[0],nearContact=lines.slice(0,6).some(r=>/@|\+\d|\b1[3-9]\d{9}\b/.test(r.text));
  if(top&&nearContact&&!/简历|resume|engineer|工程师|curriculum|education|大学|university/i.test(top.text)&&(/^[\p{Script=Han}]{2,6}$/u.test(top.text)||/^[A-Z][a-z]+(?: [A-Z][a-z]+){1,3}$/.test(top.text)))add('personal.name',top.text,top);
 }
 if(skillLines.length)add('skills.description',skillLines.map(r=>r.text).join('\n'),skillLines[0]);
 // Several plausible values stay unknown in the draft until the user chooses.
 for(const candidate of candidates.values())if(candidate.values.length>1){const parts=candidate.key.split('.');const object=parts.length===3?draft[parts[0]].find(e=>e.id===parts[1]):draft[parts[0]];delete object[parts.at(-1)];}
 return {candidates:[...candidates.values()],draft:validateProfile(draft),pageCount:pages.length};
}
export async function extractResume(bytes,sha256) {
 if(!Buffer.from(bytes).subarray(0,1024).includes(Buffer.from('%PDF-')))return {status:'invalid',message:'这不是可识别的PDF，原附件已保留，资料未改动。'};
 const result=await new Promise(resolve=>{
  const worker=new Worker(new URL('./pdf-worker.mjs',import.meta.url),{workerData:bytes,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256,stackSizeMb:4}});let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);worker.terminate().catch(()=>{});resolve(value);};
  const timer=setTimeout(()=>finish({ok:false,reason:'budget'}),15000);
  worker.once('message',finish);worker.once('error',()=>finish({ok:false,reason:'invalid'}));worker.once('exit',()=>finish({ok:false,reason:'invalid'}));
 });
 if(!result.ok){const messages={dependency:'尚未安装本机PDF解析组件，请使用新版的升级/依赖准备入口；原附件及资料已保留。',encrypted:'PDF已加密，请选择本人可读取的文字型PDF；原附件已保留。',budget:'PDF超出本机解析预算，请选择较短的文字型简历；原附件已保留。',invalid:'无法可靠解析这份PDF，原附件已保留，资料未改动。'};return {status:result.reason,message:messages[result.reason]||messages.invalid};}
 if(!result.pages.some(p=>p.lines.join('').trim()))return {status:'no-text',message:'未提取到可用文字，可能是扫描PDF；当前不支持OCR。原附件已保留，可仅补当前申请的缺项。'};
 const parsed=resumeCandidates(result.pages,sha256);
 if(!parsed.candidates.length)return {status:'unmapped',pageCount:parsed.pageCount,message:'PDF有文字，但未识别到可直接映射的资料字段。原附件及资料已保留，可只补当前申请缺项。'};
 return {status:'ready',...parsed,message:'已生成未确认草稿，请一次核对提取结果；空白项保持未知。'};
}
