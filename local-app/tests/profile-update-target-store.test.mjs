import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Store} from '../model.mjs';
import {temporary} from './profile-test-runtime.mjs';

const value=zh=>({zh,en:null,confirmed:true,source:'Fictional R1 local confirmation'});
function document(){return {format:'job-application-assistant.profile-update',format_version:1,base_profile_version:null,profile_changes:[{field:null,target_hint:'虚构新增项目的名称',previous_value:null,value:{zh:'虚构R1项目',en:null},source_text:'本人补充的虚构项目名称',qualifier:null,confirmed:false}],job_answers:[],unmapped_notes:[],questions:[]};}
function setup(t){const paths={data:temporary(t,'profile-target-store')};return {paths,store:new Store(paths)};}
const preview=store=>store.previewProfileFile({document:document(),mode:'demo',profileVersion:store.state.profile.version});
function confirm(store,draft,{target=draft.changes[0].target,action='apply',replace=false,createRecords=[]}={}){
 return store.confirmProfileFile({id:draft.id,profileVersion:draft.profileVersion,mode:'demo',confirmed:true,decisions:[{id:draft.changes[0].id,action,target,replace}],recordMappings:{},createRecords,answerSelections:[]});
}
function create(store){const draft=preview(store);assert.equal(draft.changes[0].target,null);confirm(store,draft,{target:'projects.import-r1.title',createRecords:[{kind:'projects',id:'import-r1'}]});}

test('R1 new target survives Store reload and repeat confirmation creates neither record nor profile version',t=>{
 const {paths,store}=setup(t);create(store);
 const before=structuredClone(store.state.profile),mappings=structuredClone(store.state.profileImportMappings);
 assert.ok(Object.values(mappings).includes('projects.import-r1.title'));
 const reloaded=new Store(paths),draft=preview(reloaded);
 assert.equal(draft.changes[0].target,'projects.import-r1.title');
 assert.equal(draft.changes[0].existing.zh,'虚构R1项目');
 const result=confirm(reloaded,draft);assert.equal(result.count,0);assert.equal(result.profileChanged,false);
 assert.deepEqual(reloaded.state.profile,before);assert.equal(reloaded.state.profile.data.projects.length,1);
 assert.deepEqual(reloaded.state.profileImportMappings,mappings);assert.equal(reloaded.state.profileImportHistory.length,1);
 assert.deepEqual(JSON.parse(fs.readFileSync(reloaded.file,'utf8')).profile,before);
});

test('R1 explicitly matching an identical existing value persists memory even when the first save is a no-op',t=>{
 const {paths,store}=setup(t),data=structuredClone(store.state.profile.data);
 data.projects=[{id:'existing-r1',title:value('虚构R1项目')},{id:'same-name-independent',title:value('虚构R1项目')}];
 store.setProfile({data,mode:'demo',confirmed:true});const before=structuredClone(store.state.profile);
 const draft=preview(store);assert.equal(draft.changes[0].target,null,'Never match a record by its title');
 const first=confirm(store,draft,{target:'projects.existing-r1.title'});assert.equal(first.count,0);
 const reloaded=new Store(paths),again=preview(reloaded);assert.equal(again.changes[0].target,'projects.existing-r1.title');
 assert.equal(confirm(reloaded,again).count,0);assert.deepEqual(reloaded.state.profile,before);
});

test('R1 remembered target reads current values and retains explicit conflict protection after later edits',t=>{
 const {paths,store}=setup(t);create(store);
 const edited=structuredClone(store.state.profile.data);edited.projects[0].title=value('本人后来修改的虚构项目');
 store.setProfile({data:edited,mode:'demo',confirmed:true});
 const reloaded=new Store(paths),draft=preview(reloaded),before=structuredClone(reloaded.state);
 assert.equal(draft.changes[0].target,'projects.import-r1.title');assert.equal(draft.changes[0].existing.zh,edited.projects[0].title.zh);assert.equal(draft.changes[0].conflict,true);
 assert.throws(()=>confirm(reloaded,draft),/冲突|替换/);assert.deepEqual(reloaded.state,before);
 confirm(reloaded,draft,{action:'keep'});assert.deepEqual(reloaded.state.profile,before.profile);
 assert.deepEqual(new Store(paths).state.profile,before.profile);
});

test('R1 remembered mapping never makes a stale preview eligible after a concurrent profile save',t=>{
 const {store}=setup(t);create(store);const draft=preview(store),edited=structuredClone(store.state.profile.data);
 edited.skills.description=value('虚构并发新增的技能');store.setProfile({data:edited,mode:'demo',confirmed:true});
 const before=structuredClone(store.state);assert.throws(()=>confirm(store,draft),/变化|版本/);assert.deepEqual(store.state,before);
});

test('R1 deleted remembered target stays unmatched across reload and does not recreate or infer another record',t=>{
 const {paths,store}=setup(t);create(store);const edited=structuredClone(store.state.profile.data);
 edited.projects=[{id:'unrelated-same-name',title:value('虚构R1项目')}];store.setProfile({data:edited,mode:'demo',confirmed:true});
 const reloaded=new Store(paths),before=structuredClone(reloaded.state.profile),draft=preview(reloaded);
 assert.equal(draft.changes[0].target,null);assert.equal(draft.changes[0].existing,null);
 const result=confirm(reloaded,draft,{action:'keep'});assert.equal(result.count,0);assert.deepEqual(reloaded.state.profile,before);
 assert.equal(new Store(paths).state.profile.data.projects.length,1);
});
