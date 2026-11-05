import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProfile} from '../../autofill-extension/shared/schema.js';
import {parseProjectRepair,previewProfileImport,applyProfileImport} from '../profile-update.mjs';
import {Store} from '../model.mjs';
import {temporary} from './profile-test-runtime.mjs';

// The shape models the persisted candidate.10 import history; no original
// uploaded JSON is available or needed. Every value is fictional.
const field=zh=>({zh,en:null,source:'本人核对的虚构资料',confirmed:true});
const recordKey='legacy:education:0123456789abcdef01234567';
const legacyId='legacy-education-0123456789abcdef01234567';
const currentId='fictional-current-education';
function savedProfile(){
 const data=emptyProfile();
 data.education=[{id:currentId,school:field('虚构大学'),major:field('虚构专业')}];
 return data;
}
function historyRows(){
 const base={recordKey,qualifier:'in_progress',target:null,previous_value:null,blocked:true,pendingReason:'预计/在读限定当前字段无法准确表达，保留待处理'};
 return [{kind:'legacy-v3',fingerprint:'fictional-old-import',notes:[{label:'personalInfo / 最高学历',text:'硕士研究生（在读）',confirmed:false}],pendingChanges:[
  {...base,id:'old-degree',field:`education.${legacyId}.degree`,value:{zh:'硕士',en:null},source_text:'学历：硕士；最高学历：硕士研究生（在读）'},
  {...base,id:'old-end',field:`education.${legacyId}.endDate`,value:{zh:'2028-06',en:null},source_text:'结束就读时间：2028-06；最高学历：硕士研究生（在读）'}
 ]}];
}
function preview(data,history=historyRows(),mappings={[recordKey]:currentId}){
 const parsed=parseProjectRepair(data,{history,mappings});
 return previewProfileImport(parsed,data,1,{recordMappings:mappings});
}
const target=(draft,suffix)=>draft.changes.find(row=>row.field===`education.${currentId}.${suffix}`);
const decisions=draft=>draft.changes.map(row=>({id:row.id,action:row.conflict||row.requiresUserValue?'keep':'apply'}));

test('已保存历史明确指向同一教育记录时，生成学位、在读和预计结束的待确认草稿',()=>{
 const data=savedProfile(),before=structuredClone(data),draft=preview(data);
 assert.equal(target(draft,'degree')?.value.zh,'硕士');
 assert.equal(target(draft,'studyStatus')?.value.zh,'在读');
 assert.equal(target(draft,'expectedEndDate')?.value.zh,'2028-06');
 assert.equal(target(draft,'endDate'),undefined,'预计日期不能写为已完成日期');
 assert.deepEqual(data,before,'预览必须无副作用');
 assert.throws(()=>applyProfileImport(data,draft,[]),/选择|遗漏|唯一/);
 const applied=applyProfileImport(data,draft,decisions(draft));
 const education=applied.data.education[0];
 assert.equal(education.id,currentId);assert.equal(education.degree.zh,'硕士');
 assert.equal(education.studyStatus.zh,'在读');assert.equal(education.expectedEndDate.zh,'2028-06');
 assert.equal(education.endDate,undefined);
});

test('后续本人修改的学历或预计日期须明确选择，不能因为原值未确认而覆盖',()=>{
 const data=savedProfile();data.education[0].degree={...field('博士'),confirmed:false};data.education[0].expectedEndDate=field('2030-06');
 const draft=preview(data);
 assert.equal(target(draft,'degree')?.conflict,true);assert.equal(target(draft,'expectedEndDate')?.conflict,true);
 const result=applyProfileImport(data,draft,decisions(draft));
 assert.equal(result.data.education[0].degree.zh,'博士');assert.equal(result.data.education[0].expectedEndDate.zh,'2030-06');
});

test('缺少历史归属、记录被删除或多个历史答案冲突时不猜测教育记录',()=>{
 const data=savedProfile();
 for(const mappings of [{},{[recordKey]:'deleted-education'}]){
  const draft=preview(data,historyRows(),mappings);
  const proposed=draft.changes.filter(c=>c.field?.startsWith('education.'));
  assert.ok(proposed.every(c=>c.field.endsWith('.degree')&&c.requiresUserValue===true&&c.value.zh===null&&c.value.en===null),'只允许本人填写的空学历输入，不预填无法归属的旧值');
  assert.equal(target(draft,'studyStatus'),undefined);assert.equal(target(draft,'expectedEndDate'),undefined);
  assert.ok(draft.notes.length||draft.questions.length,'无法安全归属时要提示本人核对');
 }
 const h=historyRows(),ambiguous=structuredClone(h[0].pendingChanges[0]);
 ambiguous.id='old-conflicting-degree';ambiguous.value.zh='博士';ambiguous.source_text='学历：博士；最高学历：博士研究生（在读）';
 h.push({kind:'legacy-v3',fingerprint:'fictional-other',notes:[],pendingChanges:[ambiguous]});
 const draft=preview(data,h);
 const degree=target(draft,'degree');
 assert.ok(!degree||degree.requiresUserValue===true&&degree.value.zh===null,'矛盾学历不能自动选取其一');
 assert.equal(target(draft,'studyStatus'),undefined,'矛盾学历不能自动推断在读');
 assert.equal(target(draft,'expectedEndDate'),undefined,'矛盾学历不能自动归属预计结束日期');
 assert.ok(draft.notes.length||draft.questions.length);
});

test('历史 target 与已保存映射不一致时，两个教育记录均不能预填原记录的学历或状态',()=>{
 const data=savedProfile();data.education.push({id:'fictional-other-education',school:field('另一所虚构大学')});
 const h=historyRows();for(const row of h[0].pendingChanges)row.target=`education.fictional-other-education.${row.field.split('.').at(-1)}`;
 const draft=preview(data,h),proposed=draft.changes.filter(c=>c.field?.startsWith('education.'));
 assert.ok(proposed.every(c=>c.field.endsWith('.degree')&&c.requiresUserValue===true&&c.value.zh===null&&c.value.en===null));
 assert.ok(draft.notes.length||draft.questions.length);
});

test('历史目标字段与原待处理字段不一致时不把其当作可靠归属',()=>{
 const data=savedProfile(),h=historyRows();
 h[0].pendingChanges[0].target=`education.${currentId}.major`;
 h[0].pendingChanges[1].target=`education.${currentId}.major`;
 const draft=preview(data,h,{}),proposed=draft.changes.filter(c=>c.field?.startsWith('education.'));
 assert.ok(proposed.every(c=>c.field.endsWith('.degree')&&c.requiresUserValue===true&&c.value.zh===null));
 assert.ok(draft.notes.length||draft.questions.length);
});

test('只有预计日期而没有在读证据时，不推断学习状态或把日期写成毕业日期',()=>{
 const data=savedProfile(),h=historyRows();
 h[0].notes=[];
 h[0].pendingChanges=[{...h[0].pendingChanges[1],qualifier:'expected',source_text:'预计结束：2028-06'}];
 const draft=preview(data,h);
 assert.equal(target(draft,'studyStatus'),undefined);
 assert.equal(target(draft,'endDate'),undefined);
 assert.equal(target(draft,'expectedEndDate')?.value.zh,'2028-06');
});

test('保存需本人确认，版本变化拒绝过期草稿；保存后重启保留原记录及历史',t=>{
 const paths={data:temporary(t,'saved-education-repair')},store=new Store(paths),data=savedProfile();
 store.setProfile({data,mode:'demo',confirmed:true});
 store.state.profileImportHistory=historyRows();store.state.profileImportMappings={[recordKey]:currentId};store.save();
 const oldVersion=store.state.profile.version,draft=store.previewProjectRepair({mode:'demo',profileVersion:oldVersion});
 const body={id:draft.id,profileVersion:oldVersion,mode:'demo',confirmed:true,decisions:decisions(draft),recordMappings:{},createRecords:[],answerSelections:[]};
 assert.throws(()=>store.confirmProfileFile({...body,confirmed:false}),/确认|变化|版本/);
 const before=structuredClone(store.state.profile);
 store.setProfile({data:before.data,mode:'demo',confirmed:true,baseVersion:oldVersion});
 assert.throws(()=>store.confirmProfileFile(body),/版本|变化|过期/);
 const latest=store.previewProjectRepair({mode:'demo',profileVersion:store.state.profile.version});
 store.confirmProfileFile({...body,id:latest.id,profileVersion:latest.profileVersion,decisions:decisions(latest)});
 const reopened=new Store(paths),education=reopened.state.profile.data.education[0];
 assert.equal(education.id,currentId);assert.equal(education.school.zh,'虚构大学');
 assert.equal(education.degree.zh,'硕士');assert.equal(education.studyStatus.zh,'在读');assert.equal(education.expectedEndDate.zh,'2028-06');
 assert.equal(reopened.state.profileImportMappings[recordKey],currentId);
 assert.ok(reopened.state.profileImportHistory.some(item=>item.fingerprint==='fictional-old-import'));
});
