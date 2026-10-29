import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {emptyProfile} from '../../autofill-extension/shared/schema.js';
import {parseProfileImport,previewProfileImport,applyProfileImport} from '../profile-update.mjs';
const fixture=name=>JSON.parse(fs.readFileSync(new URL('../../docs/examples/'+name+'.json',import.meta.url),'utf8'));
const delta=(changes=[],extra={})=>({format:'job-application-assistant.profile-update',format_version:1,base_profile_version:null,profile_changes:changes,job_answers:[],unmapped_notes:[],questions:[],...extra});
const change=(field='personal.desiredCity',value={zh:'Fictional City',en:null},extra={})=>({field,target_hint:'Fictional ordinary fact',previous_value:null,value,source_text:'Fictional applicant supplied this ordinary fact.',qualifier:null,confirmed:false,...extra});
const fact=(zh,en=null)=>({zh,en,source:'Fictional existing fact',confirmed:true});
const preview=(document,profile=emptyProfile(),version=1,options)=>previewProfileImport(parseProfileImport(document),profile,version,options);
const accept=v=>v.changes.map(row=>({id:row.id,action:'apply'}));

test('complete documented v3 maps every supported source and preserves all four distinct project description fragments',()=>{
 const doc=fixture('PROFILE_LEGACY_V3_FICTIONAL'),p=parseProfileImport(doc);assert.equal(p.kind,'legacy-v3');assert.equal(p.changes.length,34);assert.equal(p.records.length,6);
 const v=previewProfileImport(p,emptyProfile(),0),map=Object.fromEntries(v.records.map(r=>[r.key,'new'])),applied=applyProfileImport(emptyProfile(),v,accept(v),{recordMappings:map});
 assert.equal(applied.count,32);assert.equal(applied.data.education.length,2);assert.equal(applied.data.experience.length,1);assert.equal(applied.data.projects.length,3);
 for(const [i,project]of applied.data.projects.entries())for(const key of ['项目描述','职责','项目中职责','描述And职责'])assert.ok(project.description.zh.includes(doc.config.projectList[i][key]),key);
 assert.equal(applied.data.projects[0].role,undefined,'long duty text never becomes a fabricated role name');
 const notes=JSON.stringify(p.notes);for(const label of ['学院名称','奖项名称','语言能力','自我描述','其他信息'])assert.ok(notes.includes(label));
 assert.equal(applied.data.education[0].degree,undefined);assert.equal(applied.data.education[0].endDate,undefined);assert.equal(applied.data.education[1].endDate.zh,'2025-06-30');
 assert.equal(applied.pendingChanges.length,2);for(const row of applied.pendingChanges){assert.equal(row.qualifier,'in_progress');assert.ok(row.source_text.includes('硕士研究生（在读）'));}
});

test('record identity uses old kind and ID, never a same-school/company guess; repeat import has no new records or writes',()=>{
 const doc=fixture('PROFILE_LEGACY_V3_FICTIONAL'),parsed=parseProfileImport(doc),profile=emptyProfile();profile.experience=[{id:'existing-period',company:fact(doc.config.workList[0]['公司名称']),role:fact('Another period')}];
 const p=previewProfileImport(parsed,profile,4);assert.equal(p.records.find(r=>r.kind==='experience').suggestedTarget,'');
 const mappings=Object.fromEntries(p.records.map(r=>[r.key,'new'])),applied=applyProfileImport(profile,p,accept(p),{recordMappings:mappings});assert.equal(applied.data.experience.length,2);assert.deepEqual(applied.data.experience[0],profile.experience[0]);
 const again=previewProfileImport(parseProfileImport(doc),applied.data,5,{recordMappings:applied.recordMappings});
 const repeated=applyProfileImport(applied.data,again,accept(again),{recordMappings:applied.recordMappings});assert.equal(repeated.count,0);assert.deepEqual(repeated.data,applied.data);
 assert.equal(new Set(parsed.records.map(r=>r.proposedId)).size,6);assert.ok(parsed.records.every(r=>/^[a-zA-Z][\w-]{0,63}$/.test(r.proposedId)));
});

test('a newly proposed legacy record is created only after explicit record mapping; unresolved records stay pending',()=>{
 const p=preview(fixture('PROFILE_LEGACY_V3_FICTIONAL')),result=applyProfileImport(emptyProfile(),p,accept(p));
 assert.equal(result.data.education.length,0);assert.equal(result.data.experience.length,0);assert.equal(result.data.projects.length,0);assert.ok(result.pendingChanges.some(c=>c.recordKey));
 const work=p.records.find(r=>r.kind==='experience'),profile=emptyProfile();profile.experience=[{id:'chosen-exp',company:fact('Different old employer')}];
 const mapped=previewProfileImport(parseProfileImport(fixture('PROFILE_LEGACY_V3_FICTIONAL')),profile,1);
 const decisions=mapped.changes.map(c=>({id:c.id,action:c.recordKey===work.key?'apply':'keep',replace:true}));
 const applied=applyProfileImport(profile,mapped,decisions,{recordMappings:{[work.key]:'chosen-exp'}});assert.equal(applied.data.experience.length,1);assert.equal(applied.data.experience[0].role.zh,'示例开发实习生');assert.equal(applied.recordMappings[work.key],'chosen-exp');
});

test('unknown target can be explicitly matched or created, while qualified dates remain pending even when apply is requested',()=>{
 const doc=fixture('PROFILE_UPDATE_FICTIONAL'),p=preview(doc),result=applyProfileImport(emptyProfile(),p,accept(p));assert.equal(result.count,1);assert.equal(result.pendingChanges.length,1);assert.equal(result.pendingChanges[0].value.zh,'2028-06-30');assert.equal(result.pendingChanges[0].qualifier,'expected');
 const v=preview(delta([change(null,{zh:'Fictional Major',en:null})]));
 const unknown=applyProfileImport(emptyProfile(),v,[{id:v.changes[0].id,action:'apply'}]);assert.equal(unknown.count,0);assert.equal(unknown.pendingChanges.length,1);
 const created=applyProfileImport(emptyProfile(),v,[{id:v.changes[0].id,action:'apply',target:'education.edu-explicit.major'}],{createRecords:[{kind:'education',id:'edu-explicit'}]});assert.equal(created.data.education[0].major.zh,'Fictional Major');
 assert.throws(()=>applyProfileImport(emptyProfile(),v,[{id:v.changes[0].id,action:'apply',target:'__proto__.polluted'}]),/字段|路径/);assert.equal({}.polluted,undefined);
});

test('fixed delta preserves every unlisted value and incoming null languages, with no deletion or whole-profile replacement',()=>{
 const profile=emptyProfile();profile.personal.name=fact('Original Fictional Name');profile.personal.desiredCity=fact('Old City','Existing English');profile.skills.description=fact('Unlisted original skills');profile.customAnswers.savedFact=fact('Kept ordinary fact');
 const original=structuredClone(profile),v=preview(delta([change('personal.desiredCity',{zh:'New City',en:null})]),profile,2);
 assert.equal(v.changes[0].conflict,true);assert.throws(()=>applyProfileImport(profile,v,accept(v)),/冲突/);assert.deepEqual(profile,original);
 const applied=applyProfileImport(profile,v,[{id:v.changes[0].id,action:'apply',replace:true}]);assert.equal(applied.count,1);assert.equal(applied.data.personal.desiredCity.zh,'New City');assert.equal(applied.data.personal.desiredCity.en,'Existing English');assert.deepEqual(applied.data.personal.name,original.personal.name);assert.deepEqual(applied.data.customAnswers,original.customAnswers);assert.deepEqual(applied.data.skills,original.skills);
 const keep=applyProfileImport(profile,v,[{id:v.changes[0].id,action:'keep',target:''}]);assert.equal(keep.count,0);assert.deepEqual(keep.data,profile);
});

test('known base version and previous-value mismatch require explicit conflict acceptance; changed preview is rejected',()=>{
 const profile=emptyProfile();profile.personal.desiredCity=fact('Current City');
 for(const document of [delta([change()],{base_profile_version:0}),delta([change(undefined,undefined,{previous_value:{zh:'Different City',en:null}})])]){
  const p=preview(document,profile,4);assert.equal(p.changes[0].conflict,true);assert.throws(()=>applyProfileImport(profile,p,accept(p)),/冲突/);
  assert.equal(applyProfileImport(profile,p,[{id:p.changes[0].id,action:'apply',replace:true}]).count,1);
 }
 const p=preview(delta([change()]),profile,4),newer=structuredClone(profile);newer.personal.name=fact('New unrelated fact');assert.throws(()=>applyProfileImport(newer,p,accept(p)),/变化/);
});

test('validation is atomic across all selected changes and rejects duplicate rows or conflicting assignments',()=>{
 const profile=emptyProfile(),p=preview(delta([change(),change('personal.email',{zh:'not-an-email',en:null})]),profile),before=structuredClone(profile);
 assert.throws(()=>applyProfileImport(profile,p,accept(p)),/邮箱/);assert.deepEqual(profile,before);
 assert.throws(()=>applyProfileImport(profile,p,[accept(p)[0],accept(p)[0]]),/唯一/);
 const duplicate=preview(delta([change('personal.name',{zh:'First value',en:null}),change('personal.name',{zh:'Different value',en:null})]));assert.throws(()=>applyProfileImport(profile,duplicate,accept(duplicate)),/不同变更/);assert.deepEqual(profile,before);
});

test('strict format/version/shape/path budgets reject instructions or invalid values rather than guessing another format',()=>{
 const invalid=[delta([],{format_version:2}),delta([],{base_profile_version:-1}),{...delta(),command:'run'},delta([change('personal.unknown')]),delta([change('__proto__.polluted')]),delta([change('personal.name',{zh:null,en:null})]),delta([change(undefined,undefined,{confirmed:true})]),delta([change(undefined,undefined,{qualifier:'graduated'})]),{format:'unknown',schemaVersion:1}];
 for(const value of invalid)assert.throws(()=>parseProfileImport(value));assert.throws(()=>parseProfileImport('{"__proto__":{"polluted":true}}'),/原型/);
 assert.throws(()=>parseProfileImport(delta(Array.from({length:301},()=>change()))),/300/);
 assert.throws(()=>parseProfileImport(' '.repeat(500001)),/500KB/);
 assert.throws(()=>parseProfileImport({format:'bad',value:()=>{}}));assert.equal({}.polluted,undefined);
});

test('credentials are excluded entirely while safe unsupported v3 facts remain and UI configuration is inert',()=>{
 const doc=fixture('PROFILE_LEGACY_V3_FICTIONAL');doc.config.personalInfo['证件号码']='SENSITIVE-DOCUMENT-VALUE';doc.config.otherInfo['cookie']='SENSITIVE-COOKIE-VALUE';doc.config.customModules={command:'UNTRUSTED-UI-INSTRUCTION'};
 const parsed=parseProfileImport(doc),encoded=JSON.stringify(parsed);for(const value of ['SENSITIVE-DOCUMENT-VALUE','SENSITIVE-COOKIE-VALUE','UNTRUSTED-UI-INSTRUCTION'])assert.equal(encoded.includes(value),false);
 assert.ok(parsed.notes.some(n=>n.label==='已排除敏感内容'));assert.ok(encoded.includes(doc.config.personalInfo['出生日期']));
 const hostile=delta([change('customAnswers.password',{zh:'SENSITIVE-PASSWORD',en:null})],{unmapped_notes:[{label:'cookie',text:'SENSITIVE-COOKIE',source_text:'private',confirmed:false}],job_answers:[{task_id:null,site_url:null,company:null,job_url:null,question:'Password',answer:'SENSITIVE-JOB-SECRET',source_text:'private',confirmed:false}]});
 const safe=parseProfileImport(hostile);assert.equal(safe.changes.length,0);assert.equal(safe.jobAnswers.length,0);assert.equal(JSON.stringify(safe).includes('SENSITIVE-'),false);
});

test('customAnswers cannot smuggle conditional answers into reusable changes; optional full-profile input retains them only as notes',()=>{
 assert.throws(()=>parseProfileImport(delta([change('customAnswers.salary',{zh:'Fictional salary for one country',en:null})])),/未知|路径/);
 const document=emptyProfile();document.personal.name=fact('Fictional Full Profile');document.customAnswers.jobMotivation=fact('Fictional motivation for one employer');
 const p=parseProfileImport(document);assert.equal(p.kind,'profile');assert.equal(p.changes.some(c=>c.field.startsWith('customAnswers.')),false);assert.ok(p.notes.some(n=>n.text==='Fictional motivation for one employer'));
 const existing=emptyProfile();existing.customAnswers.kept=fact('Existing answer');const v=previewProfileImport(p,existing,1),applied=applyProfileImport(existing,v,accept(v));assert.deepEqual(applied.data.customAnswers,existing.customAnswers);
});

test('empty template is a no-op and same-kind duplicate legacy IDs are rejected',()=>{
 const p=preview(fixture('PROFILE_UPDATE_EMPTY')),profile=emptyProfile();assert.equal(applyProfileImport(profile,p,[]).count,0);assert.deepEqual(applyProfileImport(profile,p,[]).data,profile);
 const doc=fixture('PROFILE_LEGACY_V3_FICTIONAL');doc.config.educationList[1].id=doc.config.educationList[0].id;assert.throws(()=>parseProfileImport(doc),/ID重复/);
});

test('four long project fragments stay intact in pending data and notes instead of aborting the whole import',()=>{
 const doc=fixture('PROFILE_LEGACY_V3_FICTIONAL'),row=doc.config.projectList[0];
 for(const [i,key]of ['项目描述','职责','项目中职责','描述And职责'].entries())row[key]='Fragment-'+i+' '+String(i).repeat(3000);
 const p=preview(doc),applied=applyProfileImport(emptyProfile(),p,accept(p),{recordMappings:Object.fromEntries(p.records.map(r=>[r.key,'new']))});
 const long=applied.pendingChanges.find(c=>c.target?.endsWith('.description'));assert.ok(long);assert.ok(long.value.zh.length>10000);assert.equal(applied.data.projects[0].description,undefined);
 for(const key of ['项目描述','职责','项目中职责','描述And职责']){assert.ok(long.value.zh.includes(row[key]));assert.ok(p.notes.some(n=>n.text.includes(row[key])));}
 assert.ok(applied.count>0,'unrelated valid fields are still accepted');
});

test('credential assignments embedded under an ordinary note label cannot bypass exclusion',()=>{
 for(const secret of ['passport number: PRIVATE-PASSPORT','verification code: PRIVATE-CODE','SSN: PRIVATE-NUMBER','护照号码：PRIVATE-DOCUMENT']){
  const parsed=parseProfileImport(delta([],{unmapped_notes:[{label:'其他信息',text:secret,source_text:'Fictional source',confirmed:false}]}));
  assert.equal(JSON.stringify(parsed).includes('PRIVATE-'),false);assert.ok(parsed.notes.some(n=>n.label==='已排除敏感内容'));
 }
});
