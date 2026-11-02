import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProfile} from '../../autofill-extension/shared/schema.js';
import {parseProfileImport,previewProfileImport,applyProfileImport} from '../profile-update.mjs';

const fact=zh=>({zh,en:null,source:'Fictional confirmed applicant fact',confirmed:true});
const row=(extra={})=>({field:null,target_hint:'Fictional independent project title',previous_value:null,value:{zh:'Fictional project',en:null},source_text:'Fictional applicant explicitly supplied this project.',qualifier:null,confirmed:false,...extra});
const document=(rows=[row()],extra={})=>({format:'job-application-assistant.profile-update',format_version:1,base_profile_version:null,profile_changes:rows,job_answers:[],unmapped_notes:[],questions:[],...extra});
const preview=(doc,profile=emptyProfile(),mappings={},version=0)=>previewProfileImport(parseProfileImport(doc),profile,version,{recordMappings:mappings});
const decisions=(draft,extra={})=>draft.changes.map(change=>({id:change.id,action:'apply',...extra}));
const roundTrip=value=>JSON.parse(JSON.stringify(value));

test('null-field and missing-record delta targets survive serialization and repeated import without new records or writes',()=>{
 for(const field of [null,'projects.source-missing.title']){
  const doc=document([row({field})]),profile=emptyProfile(),first=preview(doc,profile);
  assert.equal(first.changes[0].target,null);
  const chosen='projects.chosen-project.title';
  const saved=applyProfileImport(profile,first,decisions(first,{target:chosen}),{createRecords:[{kind:'projects',id:'chosen-project'}]});
  assert.equal(saved.count,1);assert.equal(saved.data.projects.length,1);
  assert.deepEqual(Object.values(saved.recordMappings),[chosen]);
  const reloaded=roundTrip({profile:saved.data,mappings:saved.recordMappings});
  const again=preview(roundTrip(doc),reloaded.profile,reloaded.mappings,1);
  assert.equal(again.changes[0].target,chosen);
  // Store confirmation passes the server-owned draft, without resending its
  // persisted delta mapping through the legacy record-selection options.
  const repeated=applyProfileImport(reloaded.profile,again,decisions(again));
  assert.equal(repeated.count,0);assert.equal(repeated.pendingChanges.length,0);
  assert.deepEqual(repeated.data,reloaded.profile);
  assert.deepEqual(repeated.recordMappings,saved.recordMappings);
 }
});

test('explicitly matching an identical existing target saves memory even when the accepted value is already confirmed',()=>{
 const profile=emptyProfile();profile.projects=[{id:'existing-project',title:fact('Fictional project')}];
 const doc=document(),first=preview(doc,profile),target='projects.existing-project.title';
 const saved=applyProfileImport(profile,first,decisions(first,{target}));
 assert.equal(saved.count,0);assert.deepEqual(saved.data,profile);
 assert.deepEqual(Object.values(saved.recordMappings),[target]);
 const again=preview(doc,roundTrip(profile),roundTrip(saved.recordMappings),7);
 assert.equal(again.changes[0].target,target);
 assert.equal(applyProfileImport(profile,again,decisions(again)).count,0);
});

test('remembered targets expose later real values and retain conflict, old-value and stale-preview protection',()=>{
 const doc=document(),profile=emptyProfile();profile.projects=[{id:'chosen-project'}];
 const first=preview(doc,profile),saved=applyProfileImport(profile,first,decisions(first,{target:'projects.chosen-project.title'}));
 const changed=roundTrip(saved.data);changed.projects[0].title=fact('Later confirmed project title');
 const again=preview(doc,changed,saved.recordMappings,2);
 assert.equal(again.changes[0].target,'projects.chosen-project.title');
 assert.equal(again.changes[0].existing.zh,'Later confirmed project title');
 assert.equal(again.changes[0].conflict,true);
 assert.throws(()=>applyProfileImport(changed,again,decisions(again)),/冲突/);
 assert.equal(changed.projects[0].title.zh,'Later confirmed project title');
 const replaced=applyProfileImport(changed,again,decisions(again,{replace:true}));
 assert.equal(replaced.data.projects[0].title.zh,'Fictional project');
 const stale=roundTrip(changed);stale.personal.location=fact('A newly confirmed city');
 assert.throws(()=>applyProfileImport(stale,again,decisions(again,{replace:true})),/变化/);

 const previousDoc=document([row({previous_value:{zh:'Expected old title',en:null}})]);
 const previous=preview(previousDoc,profile),accepted=applyProfileImport(profile,previous,decisions(previous,{target:'projects.chosen-project.title',replace:true}));
 const previousAgain=preview(previousDoc,accepted.data,accepted.recordMappings,1);
 assert.equal(previousAgain.changes[0].target,'projects.chosen-project.title');
 assert.equal(previousAgain.changes[0].conflict,true);
 assert.ok(previousAgain.changes[0].reasons.some(reason=>reason.includes('旧值')));

 const baseDoc=document([row()],{base_profile_version:0}),base=preview(baseDoc,profile);
 const baseSaved=applyProfileImport(profile,base,decisions(base,{target:'projects.chosen-project.title'}));
 const baseAgain=preview(baseDoc,baseSaved.data,baseSaved.recordMappings,1);
 assert.equal(baseAgain.changes[0].target,'projects.chosen-project.title');
 assert.equal(baseAgain.changes[0].conflict,true);
 assert.ok(baseAgain.changes[0].reasons.some(reason=>reason.includes('基准资料版本')));
 assert.throws(()=>applyProfileImport(baseSaved.data,baseAgain,decisions(baseAgain)),/冲突/);
 assert.equal(applyProfileImport(baseSaved.data,baseAgain,decisions(baseAgain,{replace:true})).count,0);
});

test('a deleted remembered target stays unmatched without recreation, same-name inference or source-path fallback',()=>{
 for(const field of [null,'projects.source-missing.title']){
  const doc=document([row({field})]),profile=emptyProfile(),first=preview(doc,profile);
  const saved=applyProfileImport(profile,first,decisions(first,{target:'projects.chosen-project.title'}),{createRecords:[{kind:'projects',id:'chosen-project'}]});
  const changed=emptyProfile();changed.projects=[{id:'same-name-project',title:fact('Fictional project')}];
  if(field)changed.projects.push({id:'source-missing',title:fact('Fictional project')});
  const again=preview(doc,changed,saved.recordMappings,2);
  assert.equal(again.changes[0].target,null);
  const result=applyProfileImport(changed,again,decisions(again));
  assert.equal(result.count,0);assert.equal(result.pendingChanges.length,1);
  assert.deepEqual(result.recordMappings,{});assert.deepEqual(result.data,changed);
 }
});

test('a remembered missing-source mapping remains authoritative if the original source record later appears',()=>{
 const doc=document([row({field:'projects.source-missing.title'})]),profile=emptyProfile(),first=preview(doc,profile);
 const saved=applyProfileImport(profile,first,decisions(first,{target:'projects.chosen-project.title'}),{createRecords:[{kind:'projects',id:'chosen-project'}]});
 const changed=roundTrip(saved.data);changed.projects.push({id:'source-missing',title:fact('Different independent project')});
 const again=preview(doc,changed,saved.recordMappings,2);
 assert.equal(again.changes[0].target,'projects.chosen-project.title');
 const repeated=applyProfileImport(changed,again,decisions(again));
 assert.equal(repeated.count,0);assert.deepEqual(repeated.data,changed);
});

test('identical independent rows remember distinct user-selected records, never a shared title',()=>{
 const doc=document([row(),row()]),profile=emptyProfile(),first=preview(doc,profile);
 assert.notEqual(first.changes[0].id,first.changes[1].id);
 assert.notEqual(first.changes[0].targetMappingKey,first.changes[1].targetMappingKey);
 const saved=applyProfileImport(profile,first,first.changes.map((change,i)=>({id:change.id,action:'apply',target:`projects.project-${i}.title`})),{createRecords:[0,1].map(i=>({kind:'projects',id:`project-${i}`}))});
 assert.equal(saved.data.projects.length,2);assert.equal(Object.keys(saved.recordMappings).length,2);
 const again=preview(doc,saved.data,saved.recordMappings,1);
 assert.deepEqual(again.changes.map(change=>change.target),['projects.project-0.title','projects.project-1.title']);
 const result=applyProfileImport(saved.data,again,decisions(again));
 assert.equal(result.count,0);assert.deepEqual(result.data,saved.data);
 // Even an identical row in a different import is not proof of record identity.
 const independent=document([row()],{questions:['A different fictional import context']});
 assert.equal(preview(independent,saved.data,saved.recordMappings,1).changes[0].target,null);
});

test('kept, unmatched, missing-record and blocked proposals do not save target memory or create records',()=>{
 const profile=emptyProfile(),first=preview(document(),profile),target='projects.chosen-project.title';
 for(const [choice,options]of [
  [{action:'keep',target},{createRecords:[{kind:'projects',id:'chosen-project'}]}],
  [{},{}],
  [{target},{}]
 ]){
  const result=applyProfileImport(profile,first,decisions(first,choice),options);
  assert.equal(result.count,0);assert.deepEqual(result.recordMappings,{});assert.deepEqual(result.data,profile);
 }
 const qualified=preview(document([row({value:{zh:'2028-06-30',en:null},qualifier:'expected'})]),profile);
 const blocked=applyProfileImport(profile,qualified,decisions(qualified,{target:'education.proposed-edu.endDate'}),{createRecords:[{kind:'education',id:'proposed-edu'}]});
 assert.equal(blocked.count,0);assert.equal(blocked.pendingChanges.length,1);
 assert.deepEqual(blocked.recordMappings,{});assert.deepEqual(blocked.data,profile);
});

test('invalid saved target paths stay unmatched and rejected batches cannot mutate caller-owned mappings',()=>{
 const profile=emptyProfile(),doc=document(),first=preview(doc,profile),key=first.changes[0].targetMappingKey;
 for(const value of ['__proto__.polluted','projects.deleted.title',42]){
  const mappings={[key]:value},again=preview(doc,profile,mappings);
  assert.equal(again.changes[0].target,null);
  assert.deepEqual(applyProfileImport(profile,again,decisions(again)).recordMappings,{});
  assert.deepEqual(mappings,{[key]:value});
 }
 const invalid=document([row(),row({field:'personal.email',value:{zh:'invalid email',en:null}})]),draft=preview(invalid,profile),mappings={'legacy:kept':'kept-record'};
 assert.throws(()=>applyProfileImport(profile,draft,draft.changes.map((change,i)=>({id:change.id,action:'apply',...(i===0?{target:'projects.chosen-project.title'}:{})})),{recordMappings:mappings,createRecords:[{kind:'projects',id:'chosen-project'}]}),/邮箱/);
 assert.deepEqual(mappings,{'legacy:kept':'kept-record'});assert.deepEqual(profile,emptyProfile());assert.equal({}.polluted,undefined);
});

test('legacy record mappings retain their original keys, identities and no-op repeat behavior',()=>{
 const legacy={version:'3.0.0',exportTime:'2026-10-29T00:00:00.000Z',config:{projectList:[{id:'fictional-original',项目名称:'Fictional project'}]}};
 const profile=emptyProfile(),first=preview(legacy,profile),record=first.records[0];
 const saved=applyProfileImport(profile,first,decisions(first),{recordMappings:{[record.key]:'new'}});
 assert.deepEqual(saved.recordMappings,{[record.key]:record.proposedId});
 const again=preview(legacy,saved.data,roundTrip(saved.recordMappings),1);
 assert.equal(again.records[0].suggestedTarget,record.proposedId);
 const repeated=applyProfileImport(saved.data,again,decisions(again),{recordMappings:saved.recordMappings});
 assert.equal(repeated.count,0);assert.deepEqual(repeated.recordMappings,saved.recordMappings);
});
