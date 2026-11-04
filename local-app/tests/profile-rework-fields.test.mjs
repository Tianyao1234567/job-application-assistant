import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProfile} from '../../autofill-extension/shared/schema.js';
import {parseProfileImport,parseProjectRepair,previewProfileImport,applyProfileImport} from '../profile-update.mjs';
const value=zh=>({zh,en:null,source:'本人核对',confirmed:true});
const doc={version:'3.0.0',exportTime:'2026-01-01',config:{projectList:[{id:'fictional',项目名称:'项目一',项目描述:'原文一',职责:'原文二',项目中职责:'原文三',描述And职责:'原文四'}]}};
const mapping=p=>Object.fromEntries(p.records.map(r=>[r.key,'new']));
test('project fragments are independent and editable, with stable identity on repeat import',()=>{
 const data=emptyProfile(),parsed=parseProfileImport(doc),p=previewProfileImport(parsed,data,0),decisions=p.changes.map(c=>({id:c.id,action:'apply',...(c.field.endsWith('.responsibility')?{editedValue:'本人修改的职责'}:{})}));
 const a=applyProfileImport(data,p,decisions,{recordMappings:mapping(p)}),project=a.data.projects[0];
 assert.equal(project.description.zh,'原文一');assert.equal(project.responsibility.zh,'本人修改的职责');assert.equal(project.projectDuty.zh,'原文三');assert.equal(project.descriptionAndDuty.zh,'原文四');
 const again=previewProfileImport(parsed,a.data,1,{recordMappings:a.recordMappings});assert.equal(again.records[0].suggestedTarget,project.id);assert.equal(again.changes.find(c=>c.field.endsWith('.responsibility')).conflict,true);
 assert.throws(()=>applyProfileImport(a.data,again,again.changes.map(c=>({id:c.id,action:'apply'})),{recordMappings:a.recordMappings}),/冲突/);
});
test('edited imported values are validated atomically',()=>{
 const data=emptyProfile(),parsed=parseProfileImport(doc),p=previewProfileImport(parsed,data,0),decisions=p.changes.map(c=>({id:c.id,action:'apply',editedValue:'密码：secret'}));
 assert.throws(()=>applyProfileImport(data,p,decisions,{recordMappings:mapping(p)}),/敏感/);assert.deepEqual(data,emptyProfile());
});
test('old combined project description remains protected when importing separated fields',()=>{
 const parsed=parseProfileImport(doc),id=parsed.records[0].proposedId,data=emptyProfile();data.projects=[{id,description:value('项目描述：原文一\n\n职责：原文二\n\n项目中职责：原文三\n\n描述And职责：原文四')}];
 const p=previewProfileImport(parsed,data,1,{recordMappings:{[parsed.records[0].key]:id}});assert.equal(p.changes.find(c=>c.field.endsWith('.description')).conflict,true);
 const selections=p.changes.map(c=>({id:c.id,action:c.field.endsWith('.description')?'keep':'apply'}));const a=applyProfileImport(data,p,selections,{recordMappings:{[parsed.records[0].key]:id}});
 assert.equal(a.data.projects[0].description.zh,data.projects[0].description.zh);assert.equal(a.data.projects[0].responsibility.zh,'原文二');assert.equal(a.data.projects.length,1);
});
test('repair preview splits verified legacy fragments without replacing later edits',()=>{
 const data=emptyProfile(),original='项目描述：原文一\n\n职责：原文二\n\n项目中职责：原文三\n\n描述And职责：原文四';
 data.projects=[{id:'existing',description:{zh:original,en:null,source:original.slice(0,200),confirmed:true},responsibility:value('后续本人编辑')}];
 const parsed=parseProjectRepair(data),p=previewProfileImport(parsed,data,1);assert.equal(p.changes.length,4);
 assert.ok(p.changes.find(c=>c.field.endsWith('.description')).conflict);assert.ok(p.changes.find(c=>c.field.endsWith('.responsibility')).conflict);
 const result=applyProfileImport(data,p,p.changes.map(c=>({id:c.id,action:c.conflict?'keep':'apply'})));
 assert.equal(result.data.projects[0].description.zh,original);assert.equal(result.data.projects[0].responsibility.zh,'后续本人编辑');assert.equal(result.data.projects[0].projectDuty.zh,'原文三');assert.equal(result.data.projects[0].id,'existing');
 const edited=structuredClone(data);edited.projects[0].description.zh+='用户补充';assert.equal(parseProjectRepair(edited).changes.length,0);
});
test('editing Chinese cannot silently retain a potentially stale English value',()=>{
 const data=emptyProfile();data.personal.name={zh:'原中文',en:'Original English',source:'本人填写',confirmed:true};
 const doc={format:'job-application-assistant.profile-update',format_version:1,base_profile_version:null,profile_changes:[{field:'personal.name',target_hint:'姓名',previous_value:null,value:{zh:'原中文',en:null},source_text:'本人提供',qualifier:null,confirmed:false}],job_answers:[],unmapped_notes:[],questions:[]};
 const p=previewProfileImport(parseProfileImport(doc),data,1);
 assert.throws(()=>applyProfileImport(data,p,[{id:p.changes[0].id,action:'apply',replace:true,editedValue:'修改后'}]),/旧英文/);assert.equal(data.personal.name.en,'Original English');
 const result=applyProfileImport(data,p,[{id:p.changes[0].id,action:'apply',replace:true,editedValue:'修改后',retireEnglish:true}]);
 assert.equal(result.data.personal.name.zh,'修改后');assert.equal(result.data.personal.name.en,null);assert.equal(result.pendingChanges[0].value.en,'Original English');
});
