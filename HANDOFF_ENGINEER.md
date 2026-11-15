# Engineer交接（简版）

更新：2026-11-04（北京时间）。新工程师第一句：**先读HANDOFF_ENGINEER.md，接续Engineer。**

## 身份和工作位置

- 你接替 **Engineer（简历工程师）**，负责开发、修复、必要测试和交付；Manager负责需求、派工与验收，操作教学GPT只教用户本机操作。
- 仓库：`Tianyao1234567/job-application-assistant`；有效分支：`dev/pm9-demo-windows-readiness`，不要从旧main重做。当前任务提交`5c8b638611b32ffbf40a6b8edc3110ad90f5b0f5`，功能源码基线`46a28d3ee7402dad992c0fa721e6e01f676cff1e`。
- 先读[AGENTS.md](AGENTS.md)，核对实际checkout、`git status`和远端最新提交，保留已有修改。每个云任务已有隔离环境，使用现有checkout，不另建worktree，除非用户明确要求。
- Engineer只维护本文件；Manager维护[HANDOFF_MANAGER.md](HANDOFF_MANAGER.md)，[HANDOFF.md](HANDOFF.md)仅导航。PR [#5](https://github.com/Tianyao1234567/job-application-assistant/pull/5)保持draft，未经授权不合并、不强推。

## 已做到哪里

**candidate.10已交付，唯一返工R1已获Manager验收并关闭，没有遗留R1开发任务。**

- 修复：未知增量项首次明确匹配/新建后持久记住目标；同文件重载和重复确认不增加经历或资料版本，原冲突、过期及目标删除保护保留。记忆只作用于相同解析文件及条目，不按名称或改动/重排后的文件猜测归属。
- 修复/发布源码：`46a28d3ee7402dad992c0fa721e6e01f676cff1e`；交付文档`bd74c28`；Manager验收提交`b077a78`。
- [R1交付](docs/PROFILE_FILE_IMPORT_R1_DELIVERY_001.md)、[Manager R1验收](docs/PROFILE_FILE_IMPORT_R1_ACCEPTANCE_001.md)、[CI41442677046](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41442677046)：16项定点/受影响检查、1条实际后台文件选择/服务重启/重复导入场景通过，0失败/跳过。其他已验收42项/5场景、旧PDF/Windows/MV3不重跑。
- [已放行的单个candidate.10 update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.10-update/update.cmd)：285351字节，SHA-256 `f347642c603115533762e803289158bd562b1c663d8151f5efaa9919f029eddd`；精确兼容candidate.8，原数据/浏览器保留，已实际下载并核对同源码构建。不要重发相同包、移动旧tag或重复实现R1。

**用户现在已经实际导入JSON，并对结果提出返工。** 这取代此前“尚未导入/先寻找原文件”的状态；精确安装版本和最终保存状态尚未单独核验，不妨碍用虚构数据开发。不要继续让用户重找JSON、重抄简历或在旧界面手工搬运整份资料；已有导入及后续人工修改必须保留。首次真实企业申请尚未验证或授权。

## 下一位Engineer现在接什么

**唯一当前任务：[PROFILE_IMPORT_USABILITY_REWORK_001.md](docs/PROFILE_IMPORT_USABILITY_REWORK_001.md)，由Manager在`5c8b638`发布。核心是“记录缺项→平台提问→本人回答确认→持久保存→同任务继续→适用复用”，中文资料与字段返工配套完成，不能只交UI或JSON解析。**

本会话按用户要求交接结束，只整理交接，**尚未开始这项新任务的功能实现，没有该任务的未推送代码**。新Engineer先核对远端是否已有后来接单者或交付；没有重复写入时，回复已读`5c8b638`和接续状态，按任务直接推进。角色、任务、样例和证据都在GitHub，不让用户搬运技术材料。

最短范围提示（以原任务完整验收为准）：

1. **先以日常补答闭环为主线**：沿用现有问题/任务版本和答案机制，明确问题归属/去重、状态、适用范围、保存失败及恢复路径。补齐空白选填普通问题被筛掉的实际缺口；用户在平台回答并确认后实际落盘、重启不丢、继续同任务，全程无JSON往返。选填可明确留空，必填/未确认不能伪装完成；动态问题不丢旧答案。
2. 导入直接成为紧凑可编辑中文草稿，去英文副栏/中英双语标签和默认技术证据墙，一次整份核对保存。本人编辑值实际经过服务端白名单/校验/原子保存；原值、dirty草稿、冲突及过期保护保留。
3. 在读硕士的学校/专业/学位可读入，学习状态与预计日期保留，不能变成已毕业或整项阻止。
4. 项目四个源字段独立保存编辑，覆盖旧版已导入数据的无损修复、稳定ID和后续修改保护。本轮三个项目角色按用户明确输入“核心成员”批量预填并核对，不给通用解析器硬编码所有项目的默认角色。
5. 原技能按条提取并归类到对应技能栏，保留原文及熟练程度，歧义就地待确认；不新增用户没提供的能力、模型API或OCR。
6. [前一首次引导任务](docs/WORK_TASK_FIRST_PROFILE_GUIDANCE_001.md)已退为从属，只合并直接相关的一两句文件来源/保存说明，不另做多页向导、另开竞争任务或让日常补答每次生成JSON。
7. 定点验证要有真实资料页面及同站点虚构实际表单：必填＋选填＋已有适用事实，刷新/重启、直接回答/明确留空、保存并继续原任务；不能只交截图、隐藏备注或沿用旧通过数代替核心闭环。新包选下一未占用版本，支持经核实的candidate.8/candidate.10基线，保留已导入数据/浏览器，不改已验收更新器机制凑兼容。

## 最短技术导航

- 导入/中文编辑：[local-app/public/profile-file-import.js](local-app/public/profile-file-import.js)、[app.js](local-app/public/app.js)、[index.html](local-app/public/index.html)；解析和R1：[local-app/profile-update.mjs](local-app/profile-update.mjs)。
- 资料schema/校验：[autofill-extension/shared/schema.js](autofill-extension/shared/schema.js)；持久资料、问题、答案及同任务恢复：[local-app/model.mjs](local-app/model.mjs)；HTTP：[local-app/server.mjs](local-app/server.mjs)。
- 普通问题收集和提交前检查：[autofill-extension/runner/greenhouse-adapter.js](autofill-extension/runner/greenhouse-adapter.js)，留意原`required || alreadyPopulated`过滤。
- 打包：[scripts/package-candidate.mjs](scripts/package-candidate.mjs)、[scripts/package-update.mjs](scripts/package-update.mjs)；先读现有工作流再选受影响检查，打包只读已提交HEAD，交付SHA须对应实际已测/已发源码。
- Node24、Playwright1.58.2；测试依赖在`autofill-extension`，PDF运行依赖在`runtime-deps`。先检查和复用已有环境，不盲目重装/下载浏览器，不假定根目录有package.json。
- GitHub API曾Forbidden，但Git fetch/push、公开网页和release下载可用；不要反复重试API或索要新token。原发布通过Git tag触发托管CI，下载文件名为ASCII `update.cmd`，勿误用旧版本发布入口。

## 保持的边界和沟通

- 云端开发和虚构测试；个人资料、原附件、凭据、浏览器profile、`.runtime`、依赖和运行日志不入公开Git。其他会话的文件、凭据、缓存和未提交修改不自动共享；开发不以取得私人文件为前置。
- 保留原值、dirty编辑、版本/摘要、附件字节与身份绑定、R1稳定映射、原任务及提交账本。unknown只核对、不重投；首次真实提交必须由本人确认岗位、资料、附件和动作。真实适配仅限已实现的Mattermost Greenhouse范围，不宣称通用或已完成真实企业申请。
- 本次交接仅改本文件，不重跑业务测试、不重新发布产品。由新Engineer按Manager最新任务接续，Manager负责验收；不声称新会话已启动或接单。
- 每次完成工作后给用户一个完整可复制的`text`块，首行为“发给 Manager”，写明任务提交、完成内容、源码SHA/可用入口、实际验证、剩余及下一负责人。提交/评论不等于另一会话已读或已接单。

需历史细节再读[精简前完整工程师交接](https://github.com/Tianyao1234567/job-application-assistant/blob/8145597/HANDOFF_ENGINEER.md)和各交付报告；历史“R1待验收”“用户尚未导入JSON”等已过期，不作为重开任务或阻塞的依据。
