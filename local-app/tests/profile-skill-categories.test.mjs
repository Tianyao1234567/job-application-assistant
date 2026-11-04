import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProfileImport} from '../profile-update.mjs';

test('legacy skill segments retain proficiency and ambiguous text without inventing abilities',()=>{
 const skills='编程：熟练 Python、C++；机器人与视觉：使用 ROS 和 OpenCV；嵌入式：熟悉 STM32；工具：Git；硬件：电路原型；熟悉示例控制模块。';
 const parsed=parseProfileImport({version:'3.0.0',exportTime:'2026-01-01',config:{selfDescription:{专业技能:skills}}});
 const values=Object.fromEntries(parsed.changes.map(row=>[row.field,row.value.zh]));
 assert.equal(values['skills.programming'],'编程：熟练 Python、C++；');
 assert.equal(values['skills.robotics'],'机器人与视觉：使用 ROS 和 OpenCV；');
 assert.equal(values['skills.embedded'],'嵌入式：熟悉 STM32；');
 assert.equal(values['skills.tools'],'工具：Git；');
 assert.equal(values['skills.hardware'],'硬件：电路原型；');
 assert.equal(values['skills.description'],'熟悉示例控制模块。');
 assert.ok(parsed.notes.some(row=>row.label==='技能分类待确认'&&row.text==='熟悉示例控制模块。'));
 assert.equal(Object.values(values).join(''),skills);
});

test('mixed uncertain skills stay together, and sensitive skills are excluded',()=>{
 const doc={version:'3.0.0',exportTime:'2026-01-01',config:{selfDescription:{专业技能:'Python 与 Git 的协作；未知技术'}}};
 let parsed=parseProfileImport(doc);
 assert.equal(parsed.changes.length,1);
 assert.equal(parsed.changes[0].field,'skills.description');
 assert.equal(parsed.changes[0].value.zh,doc.config.selfDescription.专业技能);
 assert.equal(parsed.notes.filter(n=>n.label==='技能分类待确认').length,2);
 doc.config.selfDescription.专业技能='密码：secret';parsed=parseProfileImport(doc);
 assert.equal(parsed.changes.length,0);
 assert.ok(!JSON.stringify(parsed).includes('secret'));
});
