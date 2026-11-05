# Manager验收：candidate.9资料文件导入

2026-11-02（北京时间）发布。代码/证据审核及定点复现于10月29日完成；11月2日核对远端仍为`e562ef8`，无新增功能或修复提交。本次不重复测试。

运行源码：`812a92d1adc947d6c3152dd926718ff7dd3d652a`。有效分支：`dev/pm9-demo-windows-readiness`，PR #5保持draft。

**结论：分项通过；唯一P2返工R1未通过，整体尚未完全验收。** 已通过部分直接接收，不重做。R1是未知增量记录首次明确匹配/新建后没有记住目标，同一文件再次导入仍显示未匹配，再次明确新建会重复经历。不是默认保存就自动重复，不是旧插件v3重复导入失败，也未发现本次功能导致资料回滚或越权提交。

用户目前只确认安装candidate.8。先完成这一项修复，再一次交付最终单文件更新，避免让用户先装9后又更新。用户尚未确认完整资料已导入，首次真实企业申请仍未完成或授权。

## 已接收范围与证据

对照[原任务](ENGINEER_TASK_PROFILE_UPDATE_001.md)，读取实际源码差异、相关测试代码及[交付报告](PROFILE_FILE_IMPORT_DELIVERY_001.md)。

| 范围 | 验收结论 |
| --- | --- |
| 旧插件v3本机选择、预览、一次核对保存 | 通过：主要字段映射、四段项目描述保全、未支持内容留存、旧记录稳定映射及重复幂等 |
| 明确目标的增量与编辑保护 | 通过：未列出不动、null不删、冲突默认保留、预计/在读待处理、dirty编辑保护、版本/摘要绑定及过期拒绝 |
| 岗位答案与提交边界 | 通过：匹配实际等待补答任务/原题/选项；完整批次保存后等待本人继续，部分批次仅草稿；unknown、原附件和提交边界保留 |
| 本机HTTP与保存 | 通过：原Key/Origin/POST保护；确认时克隆状态后一次原子保存，失败不部分覆盖 |
| 单文件包与candidate.8支持 | 通过本次变化范围：实际下载并核对摘要、嵌入引擎、27项变化内容和73文件清单，对应812a92d且包含candidate.8基线 |
| 未知增量记录的重复导入 | R1待修复，见下 |

复用[CI 40818637375](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/40818637375)与[VERIFICATION.json](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.9-update/VERIFICATION.json)：同源码42项检查、5个实际后台文件选择场景通过。Manager已读取公开CI成功状态、验证文件及相关测试代码，**没有重跑42项或5场景**。

Manager实际下载的candidate.9 `update.cmd`为280379字节；SHA-256 `2a2054135ed3687f1242550e2959fdc2d6c1e6fd27801efc3d64da280745387f`。包内容核验不等于用户电脑已更新。未改变的Greenhouse/PDF/更新器保护沿用已有验收。

仅新增一次虚构数据的双导入纯函数复现。**没有新增R1实际浏览器复现、Windows/MV3或真实企业测试**，不混淆证据层次。

## 发给Engineer：唯一返工R1

负责人：用户已经开启并确认接手的新Engineer。Manager继续审核，不另开功能实现。任务基线812a92d及有效分支最新文档；协议保持不变。请先回复已读本文提交、接续状态；若已有未推送修复，保留后继续，不重复实现。

### 触发条件与原因

1. 增量项`field:null`，本人首次明确新建项目并将内容匹配到该记录的title后保存。
2. 再导入同一文件，预览仍为`target:null`，首次确认的目标未被记住。
3. 用户因此再次点击“为未匹配内容新建经历”，选择新目标并接受，产生第二条相同项目。**第二次只按默认“保留”保存不会重复。**

代码依据：`local-app/profile-update.mjs:129,142–155`仅记忆带`recordKey`的记录映射，delta没有此key；`local-app/public/profile-file-import.js:153`每次新建生成新UUID；`local-app/model.mjs:304`只持久化返回的recordMappings。已有重复导入证据覆盖legacy，没有覆盖这个组合。违反原任务“缺ID由本人匹配/创建；重复导入同一内容不得重复新增经历”。

### 最小复现

在对应源码仓库根执行。全部虚构，只操作内存；Manager已运行过一次，无需重跑旧套件确认此问题。

```bash
node --input-type=module <<'JS'
import {parseProfileImport,previewProfileImport,applyProfileImport} from './local-app/profile-update.mjs';
import {emptyProfile} from './autofill-extension/shared/schema.js';
const doc={format:'job-application-assistant.profile-update',format_version:1,base_profile_version:null,profile_changes:[{field:null,target_hint:'新项目名称：示例项目',previous_value:null,value:{zh:'示例项目',en:null},source_text:'本人补充新的示例项目',qualifier:null,confirmed:false}],job_answers:[],unmapped_notes:[],questions:[]};
let profile=emptyProfile(),mappings={};
for(const [attempt,id] of [[1,'import-first'],[2,'import-second']]){
 const draft=previewProfileImport(parseProfileImport(doc),profile,attempt-1,{recordMappings:mappings});
 const applied=applyProfileImport(profile,draft,[{id:draft.changes[0].id,action:'apply',target:`projects.${id}.title`}],{createRecords:[{kind:'projects',id}]});
 profile=applied.data;mappings={...mappings,...applied.recordMappings};
 console.log({attempt,target:draft.changes[0].target,count:applied.count,recordMappings:applied.recordMappings,projectCount:profile.projects.length});
}
JS
```

实测两次fingerprint相同；第一次`target:null,count:1,recordMappings:{},projectCount:1`，第二次仍`target:null,count:1,recordMappings:{},projectCount:2`。

### 修复与验收要求

1. 持久记住未知增量项经过本人明确确认的目标。再次导入相同文件/条目及服务重载后，预览复用该关系；覆盖明确匹配已有记录和新建记录。沿用现有资料系统，不凭同名学校/公司/项目猜测合并，不混淆独立记录。
2. 相同内容重复确认不增经历或无故提升资料版本。目标后来修改时仍显示真实当前值并走原冲突/过期保护，不能凭旧映射覆盖新资料；目标已不存在则待匹配，不暗中重建或猜另一个记录。
3. 只补本缺口及实际受影响检查；给出一条实际界面“field:null→本人新建保存→重载/重选同一文件→复用原目标且不重复”的证据。未受影响的42项/5场景、旧PDF/Windows/MV3不重跑；不改协议、不扩PDF/OCR/站点、不重做UI。
4. 提交修复源码SHA、定点结果、下一未占用候选版本的单个`update.cmd`及摘要，继续支持用户已安装candidate.8、保留数据/浏览器。不移动candidate.9固定tag或覆盖旧资产。修复验收后让用户一次升级；以后普通资料变动只导入JSON。

修复后最有价值的下一步仍是用户本机导入已有完整配置、一次核对，再选真实岗位及附件并确认首次提交。没有已选岗位，不安排虚构目标的真实申请。

经理维护[HANDOFF_MANAGER.md](../HANDOFF_MANAGER.md)，工程师维护[HANDOFF_ENGINEER.md](../HANDOFF_ENGINEER.md)；[HANDOFF.md](../HANDOFF.md)只作导航。技术材料均在GitHub，不再要求用户解释格式或重复上传技术文档。工程师回复用一个完整“发给 Manager”代码块。
