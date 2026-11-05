# Engineer交接（简版）

更新：2026-11-04（北京时间）。新工程师第一句：**先读HANDOFF_ENGINEER.md，接续Engineer。**

## 当前接续（进行中，尚未交付）

2026-11-06 已读 Manager 续办 `5afcd67`，继续原任务 `5c8b638`。有效工程分支仍为 `engineer/profile-import-usability`；未合并 PR #5、未发布更新或执行真实投递。

- [托管运行 42087321711](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/42087321711)对应 `403168a`：源码/定点、旧学历及技能修复页面、真实 MV3 虚构补答与跨任务事实复用通过；Windows 虚构 candidate.8/.10 实际更新、扩展身份/数据/附件和 unknown 不重投检查通过，但未覆盖更新后实际资料修复及待答继续。调试器断开时错误请求仍到达；DNR 请求头匹配在随包 Chromium 中不受支持。真实原生 Greenhouse 仍暂停，新包尚未发布。
- 正在补充 Windows 两条旧版本更新后的平台修复与原待答任务排队检查；另用虚构站实验 DNR URL 标记及标记重放风险。实验只用于判断机制，不改产品扩展权限，未通过前不解除原生提交暂停。
- [托管运行 42088279646](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/42088279646)对应 `1e0ce37`：Windows 中 candidate.8/.10 更新后实际完成旧学历/技能平台修复、保存原待答并重新排队，重启后数据保留；尚未证明原任务在真实扩展中继续完成。真实 MV3 虚构补答通过。DNR URL 标记实验默认拦截和错误引用拦截通过，但正确引用也未放行；初版规则未覆盖任意查询串，正在修正规则后重试，不能据此放行产品。

- [托管运行 42071609819](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/42071609819)对应 `d7caa6e`，真实 MV3 加载与原虚构补答页面场景通过；跨任务事实复用新增测试另行验证，不能把前次结果当作通过。
- [托管运行 42086198637](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/42086198637)因容器内 Git 元数据访问导致打包回归失败，浏览器复制未执行；附件拦截实验因此没有启动浏览器，不能作为可行性结论。正在修复 CI 工作目录信任并重跑。
- 正在验证真实 MV3 发送前核验；调试器断开可能释放暂停请求，需独立证明失效时服务端收到零次申请。原生真实站提交暂停仍保留。旧学历/在读及综合技能的既有资料修复、candidate.8/.10 升级兼容均为开发中，须以新提交托管测试为准；尚无可交付 update.cmd。
- [托管运行 42086683549](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/42086683549)的源码及旧资料页面检查通过；实际 MV3 的跨任务补答在资料更新后重复询问另一项已确认事实，已定位并准备修复。虚构 MV3 调试器实验中正确引用到达一次、错误引用正常拦截，但暂停时断开导致错误请求到达一次，故单靠调试器不安全。Windows 旧版更新测试因假设扩展 ID 改变而失败；candidate.8/.10 的固定 ID 实际相同，已改为核验 ID 保留，后续步骤尚待重跑。

已读Manager任务 `5c8b638`；远端有效分支起点 `9194c9857c210731513b92850997b6aa45a38c05`，本次在隔离云工作区接续。candidate.10 和 R1 已验收，不重复开发。下面是实现前的补答设计，实际完成情况和证据仍待验证：

- 问题归属原任务及网站，沿用原题、来源、用途、结构版本和 scope 标识及任务级待办去重；动态表单重新检查时匹配已确认答案，不以题目名称猜测其他问题。
- 复用现有待答、已确认及需人工处理状态；未确认草稿不参与填写。选填的明确留空须另作确认并限定原任务，必填不得留空。稳定个人事实仅在本人确认后存入资料；其他答案按本人选择限任务或原站点原题范围复用。
- 整批保存前校验问题版本、选项和资料版本；失败保留界面输入并显示原因，不标记完成。成功后原子持久化，恢复同一任务并重新检查页面、授权和提交边界；资料版本变化时保留答案并要求必要的申请确认。提交结果未知只核对，不重新提交。
- 中文资料返工及旧数据修复同时进行；不清除旧记录、身份、附件或提交账本。以上为设计，不能视作实现或验收通过。
- 当前工程分支 `engineer/profile-import-usability` 是未完成的开发检查点，不是候选包或交付。初稿涉及选填留空、动态问题再检查、中文草稿、教育/项目/技能字段及旧项目修复；旧英文可明确停用并备份，标签不明确的旧项目保留原文待核对。不得用初稿覆盖或发布旧候选包。
- 本机曾运行 7 个新增局部测试并通过，但仓库要求 GitHub 托管 runner，此结果不代表托管验证。[首次托管运行](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41786432564)在源码与定点检查步骤失败，浏览器步骤未运行；当时公开日志端点返回404，正在补充失败注释以定位。仍需真实资料页面、同站虚构表单、保存与重启、升级兼容和 update.cmd 验收，Manager 尚未验收。
- [第二次托管运行](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41786681670)失败：旧项目拼接断言、旧英文确认、导入HTTP断言不符，浏览器未执行；已根据新语义与数据保护修订，等待新运行验证。补答附件恢复及网页已填资料的实际值核验也有未验证改动。`/api/profile` 新要求 `baseVersion`，旧客户端若不带版本将收到409，升级兼容须核验。托管浏览器测试使用受控执行器，不能单独证明真实 MV3 提交账本。
- [第三次托管运行](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41787011205)有四项失败：一项网页原值泄露保护及三项旧英文保护测试初始化；浏览器未运行。已编写修复，待新一轮托管验证；不得把这些改动视作已交付。
- [第四次托管运行](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41808469190)源码及定点回归通过，虚构 Greenhouse 页面场景失败；公开日志不可读取，已准备通过失败注释输出原因。另已编写虚构资料页面测试，尚未执行。此阶段仍不满足交付。
- [第六次托管运行](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41962456858)对应源码 `f742d32`，源码/定点检查和两条虚构页面场景均通过；补答使用受控执行器而非真实MV3。后续旧资料修复及附件保护改动另行验证，不能把旧运行算作后续源码通过。
- 原生 Greenhouse 的实际提交附件引用当前不能在点击前由已有证据可靠核实。开发中补丁会对此安全暂停，真实站自动提交因此不可用；虚构页面通过不能视作完整真实站闭环。不得据此发布候选包或宣称本轮完成。
- [第七次托管运行](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41962678604)中源码和定点检查、虚构补答页面两项通过；扩展的旧资料修复页面测试因为同一提示在不同区域出现两次而定位报错，其后续保存和重复导入步骤未运行。已修正为验证可见提示，待重新验证。
- [第八次托管运行](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41962909038)对应源码 `353c53d`，源码/定点检查及虚构补答、资料页面通过，覆盖旧项目修复、保存后重启和重复导入。补答场景仍为受控执行器，未验证真实 MV3；没有发布新 update.cmd，也没有 Manager 验收。
- 阻塞：原生 Greenhouse 由页面在点击后构造 `resume_url`，现有 `webRequest` 监听无法在请求发出前拦截并核实引用；先前上传证明和页面文件信息不能证明实际提交引用。当前草稿对此保持暂停，真实站自动提交未完成。需要另行设计可在出网前核验实际请求的机制，验证其权限、失败保护和真实扩展测试，再完成兼容性验证与打包；不得用事后标记 unknown 代替阻止错误附件。

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

上一轮交接时尚未开始新任务；本轮已从 `9194c98` 接续，正在实现，交付和验收尚未完成。角色、任务、样例和证据都在GitHub，不让用户搬运技术材料。

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
