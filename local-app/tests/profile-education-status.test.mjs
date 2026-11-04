import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProfile,validateProfile} from '../../autofill-extension/shared/schema.js';
import {parseProfileImport,previewProfileImport,applyProfileImport} from '../profile-update.mjs';

const row=(id,degree,date)=>({id,'学校名称':'虚构大学','专业名称':'虚构专业','学历':degree,'结束就读时间':date});
const doc=educationList=>({version:'3.0.0',exportTime:'2026-01-01',config:{personalInfo:{'最高学历':'硕士研究生（在读）'},educationList}});
const run=input=>{const profile=emptyProfile();const preview=previewProfileImport(parseProfileImport(input),profile,0);return applyProfileImport(profile,preview,preview.changes.map(c=>({id:c.id,action:'apply'})),{recordMappings:Object.fromEntries(preview.records.map(r=>[r.key,'new']))});};
test('在读硕士的学历和学习状态分别保留，预计日期不作为已结束日期',()=>{
 const result=run(doc([row('master','硕士','2028-06'),row('bachelor','本科','2024-06')]));
 const [master,bachelor]=result.data.education;
 assert.equal(master.school.zh,'虚构大学');assert.equal(master.major.zh,'虚构专业');assert.equal(master.degree.zh,'硕士');assert.equal(master.studyStatus.zh,'在读');assert.equal(master.expectedEndDate.zh,'2028-06');assert.equal(master.endDate,undefined);
 assert.equal(bachelor.endDate.zh,'2024-06');assert.deepEqual(validateProfile(result.data),result.data);
});
test('无法唯一归属在读记录时日期保持待处理，不猜测已毕业',()=>{
 const result=run(doc([row('a','硕士','2025-06'),row('b','硕士','2026-06')]));
 assert.ok(result.data.education.every(e=>e.degree.zh==='硕士'&&!e.studyStatus&&!e.endDate));
 assert.equal(result.pendingChanges.filter(c=>c.qualifier==='in_progress').length,2);
});
