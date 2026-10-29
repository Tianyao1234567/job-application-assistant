import crypto from 'node:crypto';
import {definitions,emptyProfile,validateProfile,validDate} from '../autofill-extension/shared/schema.js';
import {profileValue,setProfileValue} from './profile-draft.mjs';
const kinds=['education','experience','projects'], forbidden=new Set(['__proto__','prototype','constructor']);
const own=(o,k)=>Object.hasOwn(o,k), clone=v=>structuredClone(v);
const digest=v=>crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');
function stable(v){return Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);}
function object(v){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw new Error('导入结构必须为普通JSON对象');return v;}
function keys(v,allowed,required=allowed){object(v);if(Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!own(v,k)))throw new Error('导入格式包含未知字段或缺少必要字段');}
function text(v,max=10000,empty=false){if(typeof v!=='string'||v.length>max||!empty&&!v.trim()||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))throw new Error('导入文字为空、过长或包含无效字符');return v.trim();}
function safe(v,depth=0){if(depth>25)throw new Error('导入结构过深');if(v===null||['string','boolean'].includes(typeof v))return;if(typeof v==='number'&&Number.isFinite(v))return;if(Array.isArray(v)){for(const item of v)safe(item,depth+1);return;}object(v);for(const [k,item]of Object.entries(v)){if(forbidden.has(k))throw new Error('导入不能包含原型或执行元数据');safe(item,depth+1);}}
const sensitiveLabel=/(?:password|passwd|passcode|cookie|captcha|verification.?code|\botp\b|\btoken\b|secret|credential|api.?key|身份证|证件|护照|验证码|密码|口令|密钥)/i;
const secretContent=/(?:password|passwd|passcode|cookie|api.?key|access.?token|passport(?:\s*(?:number|no\.?))?|national.?id|social.?security(?:\s*number)?|\bssn\b|verification.?code|one.?time.?code|\botp\b|护照(?:号码)?|身份证(?:号码)?|证件号码|密码|口令|验证码|密钥)\s*(?:[:=：]|为|是|is\b)\s*\S+/i;
function sensitive(label,...values){return sensitiveLabel.test(label)||values.some(v=>typeof v==='string'&&secretContent.test(v));}
function pair(v,required=true){keys(v,['zh','en']);const result={zh:null,en:null};for(const lang of ['zh','en'])if(v[lang]!==null)result[lang]=text(v[lang]);if(required&&!result.zh&&!result.en)throw new Error('更新值至少有一种语言的非空内容；null不是删除');return result;}
function pathInfo(path){
 if(typeof path!=='string'||path.length>200)return null;const p=path.split('.');if(p.some(k=>forbidden.has(k)))return null;
 if(p.length===2&&['personal','skills','links'].includes(p[0])&&own(definitions[p[0]],p[1]))return {kind:p[0],field:p[1]};
 if(p.length===3&&kinds.includes(p[0])&&/^[a-zA-Z][\w-]{0,63}$/.test(p[1])&&own(definitions[p[0]],p[2]))return {kind:p[0],id:p[1],field:p[2]};return null;
}
function targetExists(profile,path){const p=pathInfo(path);return !!p&&(!p.id?(p.kind!=='customAnswers'||own(profile.customAnswers,p.field)):profile[p.kind].some(e=>e.id===p.id));}
function targets(profile,extra=[]){const rows=[];for(const kind of ['personal','skills','links'])for(const field of Object.keys(definitions[kind]))rows.push({path:kind+'.'+field,key:kind+'.'+field,label:definitions[kind][field]});for(const kind of kinds)for(const entry of [...profile[kind],...extra.filter(r=>r.kind===kind&&!profile[kind].some(e=>e.id===r.id))])for(const field of Object.keys(definitions[kind]))rows.push({path:kind+'.'+entry.id+'.'+field,key:kind+'.'+entry.id+'.'+field,label:`${kind} · ${entry.id} · ${definitions[kind][field]}`});return rows;}
function result(kind){return {kind,baseProfileVersion:null,changes:[],records:[],notes:[],jobAnswers:[],questions:[]};}
function excluded(out){if(!out.notes.some(n=>n.label==='已排除敏感内容'))out.notes.push({label:'已排除敏感内容',text:'证件或凭据内容已排除，未保留原值，也不会用于自动填写。',source_text:'本机导入保护',confirmed:false});}
function note(out,label,value,source=label){if(value===null||value===undefined||value==='')return;if(sensitive(label,typeof value==='string'?value:'')){excluded(out);return;}if(typeof value==='object'){if(Array.isArray(value))value.forEach((v,i)=>note(out,label+' '+(i+1),v,source));else for(const [k,v]of Object.entries(value))if(k!=='id')note(out,label+' / '+k,v,source);return;}out.notes.push({label:String(label).slice(0,200),text:String(value),source_text:String(source).slice(0,10000),confirmed:false});}
function add(out,change,identity){out.changes.push({id:'change-'+digest(identity).slice(0,24),field:null,target_hint:'',previous_value:null,qualifier:null,...change});}
function parseDelta(doc){
 keys(doc,['format','format_version','base_profile_version','profile_changes','job_answers','unmapped_notes','questions']);
 if(doc.format_version!==1||doc.base_profile_version!==null&&(!Number.isInteger(doc.base_profile_version)||doc.base_profile_version<0))throw new Error('不支持的增量版本或基准资料版本');
 for(const key of ['profile_changes','job_answers','unmapped_notes','questions'])if(!Array.isArray(doc[key]))throw new Error('增量清单必须为数组');
 if(doc.profile_changes.length+doc.job_answers.length+doc.unmapped_notes.length+doc.questions.length>300)throw new Error('导入清单最多300项');
 const out=result('profile-update');out.baseProfileVersion=doc.base_profile_version;
 for(const [i,row]of doc.profile_changes.entries()){
  keys(row,['field','target_hint','previous_value','value','source_text','qualifier','confirmed']);
  if(row.confirmed!==false||![null,'expected','in_progress'].includes(row.qualifier))throw new Error('AI更新必须未确认，限定语义不受支持');
  if(row.field!==null&&(typeof row.field!=='string'||row.field.split('.').some(k=>forbidden.has(k))))throw new Error('未知或不安全的资料路径，请使用null并注明待匹配目标');
  const value=pair(row.value),previous=row.previous_value===null?null:pair(row.previous_value,false),hint=text(row.target_hint,500,row.field!==null),source=text(row.source_text);
  if(sensitive([row.field,hint].join(' '),source,value.zh,value.en)){excluded(out);continue;}
  if(row.field!==null&&!pathInfo(row.field))throw new Error('未知或不安全的资料路径，请使用null并注明待匹配目标');
  add(out,{field:row.field,target_hint:hint,previous_value:previous,value,source_text:source,qualifier:row.qualifier},['delta',i,row]);
 }
 for(const row of doc.job_answers){
  keys(row,['task_id','site_url','company','job_url','question','answer','source_text','confirmed']);if(row.confirmed!==false)throw new Error('文件不能代替本人确认岗位答案');
  const answer={};for(const key of ['task_id','site_url','company','job_url'])answer[key]=row[key]===null?null:text(row[key],key.endsWith('url')?2000:200);
  answer.question=text(row.question,2000);answer.answer=text(row.answer,5000);answer.source_text=text(row.source_text);answer.confirmed=false;
  let secretURL=false;for(const key of ['site_url','job_url'])if(answer[key]){let url;try{url=new URL(answer[key]);}catch{throw new Error('岗位上下文URL无效');}if(!['http:','https:'].includes(url.protocol))throw new Error('岗位地址只能作为HTTP(S)数据');if(url.username||url.password)secretURL=true;}
  if(secretURL||sensitive(answer.question,answer.answer,answer.source_text)){excluded(out);continue;}out.jobAnswers.push(answer);
 }
 for(const row of doc.unmapped_notes){keys(row,['label','text','source_text','confirmed']);if(row.confirmed!==false)throw new Error('未映射信息必须未确认');const label=text(row.label,200),value=text(row.text),source=text(row.source_text);if(sensitive(label,value,source)){excluded(out);continue;}out.notes.push({label,text:value,source_text:source,confirmed:false});}
 for(const q of doc.questions){const value=text(q,1000);if(sensitive(value)){excluded(out);continue;}out.questions.push(value);}return out;
}
const legacyMaps={personalInfo:{姓名:'personal.name',手机号码:'personal.phone',邮箱:'personal.email',所在地:'personal.location',期望城市:'personal.desiredCity'},educationList:{学校名称:'school',学历:'degree',专业名称:'major',开始就读时间:'startDate',结束就读时间:'endDate'},workList:{公司名称:'company',所在部门:'department',职位名称:'role',工作开始时间:'startDate',工作结束时间:'endDate',工作职责:'description'},projectList:{项目名称:'title',项目开始时间:'startDate',项目结束时间:'endDate'}};
function parseLegacy(doc){
 keys(doc,['version','exportTime','config']);if(doc.version!=='3.0.0')throw new Error('仅支持旧插件3.0.0导出');text(doc.exportTime,100);const config=object(doc.config),out=result('legacy-v3');
 const highest=typeof config.personalInfo?.['最高学历']==='string'?config.personalInfo['最高学历']:'';
 const educationRows=Array.isArray(config.educationList)?config.educationList:[];
 const hasInProgress=/在读|进行中|in.progress|currently|ongoing/i.test(highest);
 const degreeMatches=hasInProgress?educationRows.filter(row=>typeof row?.['学历']==='string'&&row['学历'].trim().length>1&&highest.includes(row['学历'].trim().replace(/[（(].*$/,''))):[];
 const inProgressIDs=new Set((degreeMatches.length?degreeMatches:hasInProgress?educationRows:[]).map(row=>row?.id));
 const scalar=(group,values,map={})=>{object(values);for(const [key,raw]of Object.entries(values)){if(raw===null||raw==='')continue;if(sensitive(key,typeof raw==='string'?raw:'')){excluded(out);continue;}if(!own(map,key)){note(out,group+' / '+key,raw,typeof raw==='string'?raw:group+' / '+key);continue;}const value=text(raw),field=map[key];add(out,{field,target_hint:key,value:{zh:value,en:null},source_text:key+'：'+value},['legacy',group,key]);}};
 if(config.personalInfo)scalar('personalInfo',config.personalInfo,legacyMaps.personalInfo);
 for(const [list,kind]of [['educationList','education'],['workList','experience'],['projectList','projects']]){
  if(config[list]===undefined)continue;if(!Array.isArray(config[list])||config[list].length>30)throw new Error('旧经历列表无效或超过30条');const ids=new Set();
  for(const row of config[list]){
   object(row);const oldID=text(row.id,200);if(ids.has(oldID))throw new Error('旧经历ID重复，无法安全识别');ids.add(oldID);
   const hash=digest([kind,oldID]).slice(0,24),id='legacy-'+kind+'-'+hash,key='legacy:'+kind+':'+hash;
   const labelKey=kind==='education'?'学校名称':kind==='experience'?'公司名称':'项目名称';
   out.records.push({key,kind,proposedId:id,label:typeof row[labelKey]==='string'&&!sensitive('',row[labelKey])?row[labelKey].slice(0,200):kind});
   const descriptions=[];
   for(const [oldField,raw]of Object.entries(row)){
    if(oldField==='id'||raw===null||raw==='')continue;if(sensitive(oldField,typeof raw==='string'?raw:'')){excluded(out);continue;}
    if(list==='projectList'&&['项目描述','职责','项目中职责','描述And职责'].includes(oldField)){descriptions.push(oldField+'：'+text(raw));continue;}
    const field=legacyMaps[list][oldField];if(!field){note(out,list+' / '+oldField,raw,typeof raw==='string'?raw:list+' / '+oldField);continue;}
    const value=text(raw);let qualifier=null;
    if(kind==='education'&&['degree','endDate'].includes(field)&&inProgressIDs.has(row.id))qualifier='in_progress';
    else if(field==='endDate'&&(/在读|进行中|至今|预计|expected|present|ongoing|current/i.test(value)))qualifier=/预计|expected/i.test(value)?'expected':'in_progress';
    else if(kind==='education'&&field==='endDate'&&validDate(value)&&/^\d{4}-\d{2}-\d{2}/.test(doc.exportTime)&&value>doc.exportTime.slice(0,10))qualifier='expected';
    add(out,{field:kind+'.'+id+'.'+field,target_hint:labelKey+' / '+oldField,value:{zh:value,en:null},source_text:oldField+'：'+value+(qualifier==='in_progress'&&hasInProgress?'；最高学历：'+highest:''),qualifier,recordKey:key},['legacy',key,oldField]);
   }
   if(descriptions.length){const combined=descriptions.join('\n\n');add(out,{field:'projects.'+id+'.description',target_hint:'项目描述与职责（保留全部原段）',value:{zh:combined,en:null},source_text:combined,recordKey:key},['legacy',key,'description']);if(combined.length>10000)note(out,'项目描述超出当前字段长度，全部原文待整理',combined,'旧插件项目描述及职责原文，未写入长度不足的资料字段');}
  }
 }
 if(config.selfDescription)scalar('selfDescription',config.selfDescription,{专业技能:'skills.description'});
 for(const [key,value]of Object.entries(config))if(!['fieldOrder','fieldTypes','customModules','personalInfo','educationList','workList','projectList','selfDescription'].includes(key))note(out,key,value);
 return out;
}
function parseFull(doc){
 const proposal=clone(doc),out=result('profile');
 if(proposal.customAnswers)for(const [key,value]of Object.entries(proposal.customAnswers))if(sensitive(key,value?.zh,value?.en,value?.source)){delete proposal.customAnswers[key];excluded(out);}
 const profile=validateProfile(proposal);
 for(const kind of ['personal','skills','links'])for(const [field,value]of Object.entries(profile[kind])){
  if(sensitive(field,value.zh,value.en,value.source)){excluded(out);continue;}if(!value.zh&&!value.en)continue;
  add(out,{field:kind+'.'+field,target_hint:definitions[kind][field],value:{zh:value.zh,en:value.en},source_text:value.source},['profile',kind,field]);
 }
 for(const [key,value]of Object.entries(profile.customAnswers))for(const lang of ['zh','en'])if(value[lang])note(out,'旧资料自定义答案 / '+key+' / '+lang,value[lang],value.source);
 for(const kind of kinds)for(const entry of profile[kind]){
  const key='profile:'+kind+':'+entry.id,label=entry.school?.zh||entry.company?.zh||entry.title?.zh||entry.id;
  out.records.push({key,kind,proposedId:entry.id,label:sensitive('',label)?kind:label});
  for(const [field,value]of Object.entries(entry))if(field!=='id'){
   if(sensitive(field,value.zh,value.en,value.source)){excluded(out);continue;}if(!value.zh&&!value.en)continue;
   add(out,{field:kind+'.'+entry.id+'.'+field,target_hint:definitions[kind][field],value:{zh:value.zh,en:value.en},source_text:value.source,recordKey:key},['profile',key,field]);
  }
 }
 return out;
}
export function parseProfileImport(document){
 if(typeof document==='string'){if(Buffer.byteLength(document)>500000)throw new Error('资料导入超过500KB');try{document=JSON.parse(document);}catch{throw new Error('请选择有效的UTF-8 JSON资料文件');}}
 safe(document);if(Buffer.byteLength(JSON.stringify(document))>500000)throw new Error('资料导入超过500KB');object(document);
 let out;if(own(document,'format')){if(document.format!=='job-application-assistant.profile-update')throw new Error('未知资料更新格式');out=parseDelta(document);}else if(own(document,'version')||own(document,'config'))out=parseLegacy(document);else if(document.schemaVersion===1)out=parseFull(document);else throw new Error('无法识别资料格式或版本');
 if(out.changes.length+out.notes.length+out.jobAnswers.length+out.questions.length>300)throw new Error('导入清单最多300项');out.fingerprint=digest(out);return out;
}
function mappingFor(record,profile,mappings,{suggest=false}={}){const choice=mappings?.[record.key];if(choice==='new')return {id:record.proposedId,choice:profile[record.kind].some(e=>e.id===record.proposedId)?record.proposedId:'new'};if(typeof choice==='string'&&choice&&profile[record.kind].some(e=>e.id===choice))return {id:choice,choice};if(suggest&&profile[record.kind].length===0)return {id:record.proposedId,choice:'new'};return null;}
function rowState(change,target,profile,parsed,version){
 const existing=target?clone(profileValue(profile,target)||null):null,reasons=[];let conflict=false,blocked=false;
 if(!target)reasons.push('目标字段或记录尚未匹配');
 if(parsed.baseProfileVersion!==null&&parsed.baseProfileVersion!==version){conflict=true;reasons.push('文件基准资料版本与本机当前版本不一致');}
 if(change.previous_value&&['zh','en'].some(lang=>change.previous_value[lang]!==null&&change.previous_value[lang]!==existing?.[lang])){conflict=true;reasons.push('文件声明的旧值与当前资料不一致');}
 if(existing?.confirmed&&['zh','en'].some(lang=>change.value[lang]!==null&&existing[lang]!==null&&change.value[lang]!==existing[lang])){conflict=true;reasons.push('将替换已有已确认值，须明确选择替换');}
 if(['zh','en'].some(lang=>typeof change.value[lang]==='string'&&change.value[lang].length>10000)){blocked=true;reasons.push('完整原文超过当前资料字段长度，保留待整理，不截断或丢弃');}
 const info=target?pathInfo(target):change.field?pathInfo(change.field):null;
 const qualified=change.qualifier&&(!info||/Date$/.test(info.field)||['zh','en'].some(lang=>change.value[lang]!==null&&!(change.qualifier==='expected'?/预计|预期|expected/i:/在读|进行中|至今|in.progress|ongoing|currently|present/i).test(change.value[lang])));
 if(qualified){blocked=true;reasons.push('预计/在读限定当前字段无法准确表达，保留待处理');}
 if(info&&/Date$/.test(info.field)&&['zh','en'].some(lang=>change.value[lang]!==null&&!validDate(change.value[lang]))){blocked=true;reasons.push('原日期不能无损转换为当前日期字段，保留待处理');}
 return {...clone(change),target,existing,conflict,reasons,blocked};
}
export function previewProfileImport(parsed,profile,profileVersion,{recordMappings={}}={}){
 validateProfile(profile);object(recordMappings);const records=parsed.records.map(record=>({...clone(record),suggestedTarget:mappingFor(record,profile,recordMappings,{suggest:true})?.choice||''}));
 const extra=records.filter(r=>r.suggestedTarget==='new').map(r=>({kind:r.kind,id:r.proposedId}));
 const changes=parsed.changes.map(change=>{let target=change.field;if(change.recordKey){const record=parsed.records.find(r=>r.key===change.recordKey),mapped=mappingFor(record,profile,recordMappings,{suggest:true});target=mapped?record.kind+'.'+mapped.id+'.'+pathInfo(change.field).field:null;}else if(target&&!targetExists(profile,target))target=null;return rowState(change,target,profile,parsed,profileVersion);});
 return {...clone(parsed),profileVersion,profileFingerprint:digest(profile),records,targets:targets(profile,extra),changes};
}
export function applyProfileImport(profile,preview,decisions,{recordMappings={},createRecords=[]}={}){
 validateProfile(profile);object(recordMappings);if(preview.profileFingerprint!==digest(profile))throw new Error('预览后的资料已变化，请重新核对');
 if(!Array.isArray(decisions)||decisions.length!==preview.changes.length||new Set(decisions.map(d=>d.id)).size!==decisions.length)throw new Error('请为每项变更提供唯一的接受或保留选择');
 if(!Array.isArray(createRecords)||createRecords.length>90)throw new Error('新记录清单无效');
 const creation=new Map();for(const record of createRecords){keys(record,['kind','id']);if(!kinds.includes(record.kind)||!/^[a-zA-Z][\w-]{0,63}$/.test(record.id)||forbidden.has(record.id))throw new Error('新经历类别或稳定ID无效');creation.set(record.kind+'.'+record.id,record);}
 const next=clone(profile),pendingChanges=[],savedMappings={},written=new Map();let count=0;
 for(const decision of decisions){
  keys(decision,['id','action','target','replace'],['id','action']);const change=preview.changes.find(c=>c.id===decision.id);if(!change||!['apply','keep'].includes(decision.action))throw new Error('变更选择已失效');
  if(decision.action==='keep'){pendingChanges.push({...clone(change),pendingReason:'本人保留或稍后处理'});continue;}
  let target=decision.target||null;
  if(change.recordKey){const record=preview.records.find(r=>r.key===change.recordKey),mapped=mappingFor(record,profile,recordMappings);if(!mapped){pendingChanges.push({...clone(change),pendingReason:'记录尚未明确匹配或创建'});continue;}target=record.kind+'.'+mapped.id+'.'+pathInfo(change.field).field;if(decision.target&&decision.target!==target)throw new Error('同一旧记录的字段必须通过记录匹配一起归属');if(mapped.choice==='new')creation.set(record.kind+'.'+mapped.id,{kind:record.kind,id:mapped.id});savedMappings[record.key]=mapped.id;
  }else target ||= change.target||change.field;
  if(!target){pendingChanges.push({...clone(change),target:null,pendingReason:change.qualifier?'预计/在读限定及记录归属尚未明确，保留待处理':'目标字段或记录尚未明确，保留待处理'});continue;}
  const info=pathInfo(target);if(!info)throw new Error('请选择有效资料字段，不能写入未知路径');
  if(!targetExists(profile,target)&&(!info.id||!creation.has(info.kind+'.'+info.id))){pendingChanges.push({...clone(change),target,pendingReason:'指定记录不存在，须明确匹配或创建'});continue;}
  const row=rowState(change,target,profile,preview,preview.profileVersion);
  if(row.blocked){pendingChanges.push({...row,pendingReason:row.reasons.join('；')});continue;}
  if(row.conflict&&decision.replace!==true)throw new Error('基准、旧值或已确认内容有冲突，请明确选择替换；整批未保存');
  const old=profileValue(next,target),value={zh:change.value.zh??old?.zh??null,en:change.value.en??old?.en??null};
  const assigned=written.get(target)||{};for(const lang of ['zh','en'])if(change.value[lang]!==null){if(assigned[lang]!==undefined&&assigned[lang]!==change.value[lang])throw new Error('同一字段出现不同变更值，请保留其中一项后重试');assigned[lang]=change.value[lang];}written.set(target,assigned);
  if(old?.confirmed===true&&old.zh===value.zh&&old.en===value.en)continue;
  setProfileValue(next,target,{...value,source:change.source_text.slice(0,200)||'本人核对的资料导入',confirmed:true});count++;
 }
 return {data:validateProfile(next),count,pendingChanges,recordMappings:savedMappings};
}
