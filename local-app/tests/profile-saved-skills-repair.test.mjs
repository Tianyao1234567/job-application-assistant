import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProfile} from '../../autofill-extension/shared/schema.js';
import {parseProjectRepair,previewProfileImport,applyProfileImport} from '../profile-update.mjs';
import {Store} from '../model.mjs';
import {temporary} from './profile-test-runtime.mjs';

// This is a saved profile, not an uploaded file. All values are fictional.
const original='编程：熟练 Python、C++；机器人与视觉：使用 ROS 和 OpenCV；工具：Git；熟悉虚构控制模块。';
const field=(zh,confirmed=true)=>({zh,en:null,source:'本人确认的虚构资料',confirmed});
function savedProfile(){const data=emptyProfile();data.skills.description=field(original);return data;}
function preview(data){return previewProfileImport(parseProjectRepair(data,{history:[],mappings:{}}),data,1);}
const change=(draft,name)=>draft.changes.find(row=>row.field===`skills.${name}`);
const choices=draft=>draft.changes.map(row=>({id:row.id,action:row.conflict||row.requiresUserValue?'keep':'apply'}));

test('已有综合技能生成可编辑分类草稿，保留熟练程度和需要本人核对的原文',()=>{
 const data=savedProfile(),before=structuredClone(data),draft=preview(data);
 assert.equal(change(draft,'programming').value.zh,'编程：熟练 Python、C++；');
 assert.equal(change(draft,'robotics').value.zh,'机器人与视觉：使用 ROS 和 OpenCV；');
 assert.equal(change(draft,'tools').value.zh,'工具：Git；');
 assert.equal(change(draft,'description').value.zh,'熟悉虚构控制模块。');
 assert.equal(change(draft,'description').conflict,true,'原始综合技能与不确定条目不同，须明确选择');
 assert.ok(draft.notes.some(row=>row.label==='技能分类待确认'&&row.text==='熟悉虚构控制模块。'));
 assert.ok(draft.changes.every(row=>row.id&&row.value&&Object.hasOwn(row.value,'zh')));
 assert.deepEqual(data,before,'生成草稿不能修改保存的资料');
 assert.throws(()=>applyProfileImport(data,draft,[]),/选择|遗漏|唯一/);
 const applied=applyProfileImport(data,draft,choices(draft));
 assert.equal(applied.data.skills.description.zh,original,'没有明确选择时原文仍在');
 assert.equal(applied.data.skills.programming.zh,'编程：熟练 Python、C++；');
 assert.equal(applied.data.skills.robotics.zh,'机器人与视觉：使用 ROS 和 OpenCV；');
 assert.equal(applied.data.skills.tools.zh,'工具：Git；');
});

test('保留本人后来修改的分类，包括未确认的值；明确选择后才覆盖',()=>{
 const data=savedProfile();data.skills.programming=field('后来本人填写的编程技能',false);
 const draft=preview(data),programming=change(draft,'programming');assert.equal(programming.conflict,true);
 const guarded=applyProfileImport(data,draft,choices(draft));
 assert.equal(guarded.data.skills.programming.zh,'后来本人填写的编程技能');
 assert.throws(()=>applyProfileImport(data,draft,draft.changes.map(row=>({id:row.id,action:row.id===programming.id?'apply':'keep'}))),/冲突/);
 const accepted=applyProfileImport(data,draft,draft.changes.map(row=>({id:row.id,action:row.id===programming.id?'apply':'keep',...(row.id===programming.id?{replace:true,editedValue:'本人重新确认的 Python'}:{})})));
 assert.equal(accepted.data.skills.programming.zh,'本人重新确认的 Python');
 assert.equal(accepted.data.skills.description.zh,original);
});

test('全为不确定内容仍有可就地修改的草稿；敏感值不进入预览',()=>{
 const uncertain=emptyProfile();uncertain.skills.description=field('熟悉虚构模块；了解示例流程');
 const draft=preview(uncertain),row=change(draft,'description');
 assert.ok(row,'即使全部不确定也要提供可编辑内容');
 assert.equal(row.value.zh,uncertain.skills.description.zh);
 assert.ok(draft.notes.some(note=>note.label==='技能分类待确认'));
 const edited=applyProfileImport(uncertain,draft,[{id:row.id,action:'apply',replace:true,editedValue:'本人确认的虚构模块能力'}]);
 assert.equal(edited.data.skills.description.zh,'本人确认的虚构模块能力');
 const secret=emptyProfile();secret.skills.description=field('密码：fictional-secret-value');
 assert.doesNotMatch(JSON.stringify(parseProjectRepair(secret,{history:[],mappings:{}})),/fictional-secret-value/);
});

test('无需原JSON：保存须本人确认，版本变化拒绝，重启与重复修复保留原文',t=>{
 const paths={data:temporary(t,'saved-skills-repair')},store=new Store(paths),data=savedProfile();
 store.setProfile({data,mode:'demo',confirmed:true});const version=store.state.profile.version;
 const draft=store.previewProjectRepair({mode:'demo',profileVersion:version});
 const body={id:draft.id,profileVersion:version,mode:'demo',confirmed:true,decisions:choices(draft),recordMappings:{},createRecords:[],answerSelections:[]};
 assert.throws(()=>store.confirmProfileFile({...body,confirmed:false}),/确认|变化|版本/);
 const before=structuredClone(store.state.profile);
 store.setProfile({data:before.data,mode:'demo',confirmed:true,baseVersion:version});
 assert.throws(()=>store.confirmProfileFile(body),/版本|变化|过期/);
 const latest=store.previewProjectRepair({mode:'demo',profileVersion:store.state.profile.version});
 store.confirmProfileFile({...body,id:latest.id,profileVersion:latest.profileVersion,decisions:choices(latest)});
 const reopened=new Store(paths),saved=structuredClone(reopened.state.profile);
 assert.equal(saved.data.skills.description.zh,original);
 assert.equal(saved.data.skills.programming.zh,'编程：熟练 Python、C++；');
 assert.equal(reopened.state.profileImportHistory.at(-1).profileBefore.data.skills.description.zh,original);
 const repeat=reopened.previewProjectRepair({mode:'demo',profileVersion:saved.version});
 const again=reopened.confirmProfileFile({...body,id:repeat.id,profileVersion:repeat.profileVersion,decisions:choices(repeat)});
 assert.equal(again.count,0);assert.deepEqual(reopened.state.profile,saved);
});
