# 可靠性与自检优化阶段报告

PM-0008已阶段验收本报告的12段虚构站点闭环；后续A→B→C补证及最新16项对照见 [DEV_REPORT_003.md](DEV_REPORT_003.md)。本报告保留原阶段历史。

最新交付见文末“PM-0007 返工与真实扩展交付（DEV-0025）”；前面记录保留各阶段真实失败与当时限制，不代表最新状态。

状态：开发中，沿用 WIP [PR #4](https://github.com/Tianyao1234567/job-application-assistant/pull/4)，由产品经理验收。接续 `07457419c021fb3bbe665dbcaed7acee166aab47` 和 Issue #1 的 DEV-0018/DEV-0019。前阶段真实浏览器失败证据保留在 DEV_REPORT_001.md；不得将本轮计划当作通过结果。

本轮改动：

- 明确区分等待计划与手动暂停，手动暂停跨时间、跨日和重启保留，只能明确继续；旧暂停状态保守迁移。
- 允许未进入提交边界的跳过任务重新检查并排队，保留原任务、资料版本及去重。后端提供恢复/核对能力标记；有任何提交边界历史仍禁止重投，旧误标状态也只允许核对。
- 增加只读组件自检，分别报告后台响应、虚构本地站、扩展心跳、当前执行 profile 的已有登录检查、配置缺项及手动暂停。自检不访问真实网站、不推进任务或解除暂停。
- 后台请求增加超时，后续状态读取可恢复；保存与投递动作在超时后不自动重试。界面保留草稿和已选文件，提供明确操作提示。
- 使用与锁文件 Playwright 版本匹配的官方浏览器环境尝试解决原 Chromium 启动问题；普通 push/PR 检查保持轻量，浏览器仅在 GitHub 托管 runner 手动单项执行，有全仓库并发限制和超时。

首轮Cloud实际检查：40 个源码/JSON 文件通过；原扩展单元 20/20、Node 回归 85/85，通过且失败/跳过均为0。Node 回归包含模型42项、服务10项、后台VM6项、fixture9项、执行器VM18项；VM证据与真实扩展证据分列。请求卡住、JSON响应卡住、超时后轮询恢复和写操作只发送一次均有针对性回归。后续另加浏览器临时路径的4项边界检查，验证107/108字节、UTF-8及原CI路径长度。

官方浏览器镜像路径已核对固定digest、锁文件/包1.58.2及Chromium revision；首轮真实容器拉取、字节复制校验已通过，10段产品流程仍未通过，具体排查如下。没有在Cloud工作区下载或执行浏览器，也不扩大为 Windows、真实招聘网站或个人账户验收。

## 浏览器启动排查

[官方镜像首轮](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39067615765)，提交 `efa7ead6459b1ed399684c3008283849d9579bc5`：基础作业成功；官方镜像初始化与复制校验成功；扩展和后续裸Chromium仍在启动时SIGTRAP。说明单独换镜像未解决问题。

进一步核对 Chromium 145.0.7632.6 的 `process_singleton_posix.cc`：启动会在临时目录创建 Unix socket，`SetupSocket` 对超过长度上限的路径执行 CHECK。原容器 checkout 的 TMPDIR 为69字节，按源码两种构建前缀拼接后为110/114字节，超过Linux `sockaddr_un.sun_path` 的108字节容量。宿主原路径更长。因此不能把此前“裸浏览器也失败”直接解释为外部平台能力不足；我们配置的临时路径是需要验证的具体原因。

修正方向是把同一份CI checkout额外挂载到容器内短路径 `/workspace`，所有运行数据仍在该checkout的 `.runtime/`；不外移用户数据、不借外部临时目录规避仓库约束。将增加按UTF-8字节计算的启动预检，超过限制时显示明确错误。真实修复效果以接下来的Actions结果为准。

[短路径修正验证](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39068037200)，提交 `c00a45c6877c6d94912d788bac1a2e1170db50e7`：基础作业成功，41项源码检查、20项扩展单元与89项Node回归通过；官方镜像准备及浏览器启动成功，不再复现SIGTRAP。真实扩展测试进入下一阶段后在配对等待超时，尚未证明后续填写/提交流程通过。该阶段随后加入真实worker、配对消息和桥接响应诊断，并修正较晚就绪时配对意图丢失；这些改动并未解决下述实际执行端注册失败。


## 2026-10-20（北京时间）· DEV-0023 接续 PM-0005 / PM-0006

状态：已完成下列代码修正和 Cloud Node/HTTP 验证；真实扩展仍待托管执行，产品待验收，PR #4 保持 WIP。代码提交 `89d35a44f831fd6ca83b92b096ceea305b281528`（包含首轮修复 `736e11491bb10cbe0e2c83444bf830e7291dc09b`），接续远端 `90978cb3c86e86afa91a923e1078c209d0a50f7f`，没有从 main 重新开发。工作区 `/workspace/job-application-assistant`，Linux x86_64 / Node v24.19.0；首次只读 `pwd` 成功。环境发布、新任务快照恢复没有独立验证，不公开平台会话私链。

已实际读取 AGENTS.md、CLOUD_HANDOFF.md、SPEC.md、DEVELOPMENT_SNAPSHOT.md、local-app/CONTRACT.md 和 Issue #1 全部19条评论，包括 PM-0005、PM-0006；结束前再次核对最新两条仍是这两项 PM 要求。Git HTTPS 读取可用。GitHub API 在代理 CONNECT 阶段返回403，CLI的GraphQL及REST均不可用；匿名公开Issue网页可读，不代表 API 写权限可用。未索要令牌、未提取代理凭据。

### 修复范围

- 执行端：用 Chrome 116+ `runtime.getContexts` 的精确自身扩展文档和 tabId 判断存活，避免依赖可能被权限裁剪的 `Tab.url`；保持 sender扩展身份和精确URL校验。注册串行，覆盖首次、同tab幂等、过期tab、第二实例与并发注册。诊断区分来源id、来源URL缺失/不符、文档缺失、活实例冲突和API异常。没有新增 tabs 或宽泛主机权限。此诊断方向尚未由本轮真实浏览器证实，不能宣布注册已真实通过。
- 附件：`preflight` / `submit`均携带任务锁定名称、大小和SHA-256。页面预检哈希实际File，最终同步点击前重新检查input和同一不可变File对象；会话、哈希或授权等待中被替换即停止。新增VM断言同名同大小内容不符、哈希期间换文件、授权等待换文件均为零点击；真实HTTP零POST断言已加入待运行浏览器脚本，尚未执行。
- 暂停：submitting期间不再静默返回普通暂停成功。最终授权未发出时撤销后续授权；已发出时明确提示不可保证撤回。两种结果保留全部提交边界、进入只核对状态，后台和UI使用相同结果语义。若请求迟到时已是unknown/submitted，明确拒绝普通暂停确认，避免再次伪报成功。单元测试覆盖暂停结果、后续授权拒绝和禁止恢复投递；真实扩展零POST场景已编写，未执行。
- 提交阶段：独立可恢复的preflight放在持久提交边界之前，检查登录、表单、附件和必填项。正式submit仍先记录边界和本地账本、再最终授权、唯一点击。安全中止不再删除本地提交账本；后端历史不清除，不因attempted:false重投。
- 未适配链接：保留完整URL query/hash，仅同一完整href去重；稳定ID归一化仍由具体适配器负责。公开测试只用虚构域名。
- 浏览器证据：只读核对等待改为比较本次操作前后的新增事件数量；保留既有短路径镜像方案，补真实重复注册/第二实例及附件、暂停零POST断言，不绕过UI配对、不写入配对storage。

### 本轮实际结果（与历史运行分开）

执行 `node scripts/cloud-check.mjs`：42个源码/JSON文件通过。执行 `node --test autofill-extension/tests/unit.test.js local-app/tests/*.test.mjs`：125项通过，0失败、0取消、0跳过。测试使用虚构资料。没有下载依赖或浏览器，没有在用户电脑运行任何检查。

真实启动 `node local-app/server.mjs --data-dir .runtime/onboarding-dev-data` 后，GET后台200、未配对API401、已鉴权health200且fixture检查pass、实际本地岗位列表200并含web-001。没有提交申请；检查后仅停止本轮启动的服务，未清理生产profile或用户文件。

托管浏览器本轮未执行：GitHub API访问被代理403阻断，无法workflow_dispatch。新脚本只通过语法检查，不能算真实扩展通过；不伪造GITHUB_ACTIONS来在其他机器绕过仓库执行限制。环境草稿保存了`api.github.com`自定义放行及`start_skill`启动/验证说明；保留原有包管理器预设，没有新增秘密要求。草稿保存未应用到当前运行时或发布。需要在环境设置审阅保存网络变化，按产品要求发布；变更用途仅GitHub API协作与托管调度。应用后应重新测试API，然后执行同一分支的 `Cloud checks`、`browser=workflow` 并继续修复。无需用户电脑代跑。

上一轮 [39068392015](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39068392015) 已结束：基础112项通过，browser失败于`Timed out: actual extension pairing`，不是排队中。PM-0005记录worker/meta/ready/connected为true，唯一runner却拒绝注册且bridgeEvents为空；当前未以新运行取代该失败证据。新基础CI及真实扩展结果均应以新提交对应的实际运行补充，不沿用旧数。

### CLOUD_HANDOFF 16项证据对照

以下“Node/VM”仅指本轮对应回归通过；所有真实扩展项本轮均未执行，不把现有10段脚本或新增场景当作已通过。

| 项 | 本轮证据范围 | 真实扩展状态 |
| --- | --- | --- |
| 1 配对/断线/重连 | 注册VM、HTTP鉴权；实际UI配对脚本待跑 | 未验证 |
| 2 发现/筛选/去重 | 模型去重和完整URL保留 | 未验证 |
| 3 多段填写/附件/唯一提交 | VM填写、文件哈希/身份；fixture真实multipart单元 | 未验证 |
| 4 缺答/同任务恢复 | 模型限定问题、VM答案保护 | 未验证 |
| 5 暂停/人工接管 | 模型授权撤销、VM异步等待保护 | 未验证 |
| 6 回执丢失不重投 | 模型提交历史、VM持久账本 | 未验证 |
| 7 刷新/重启保留 | Node持久化、状态恢复 | 未验证 |
| 8 时间/额度/错过计划 | Node受控时钟调度 | 未验证 |
| 9 演示/未适配/结构变化 | 模型模式限制、VM结构校验 | 未验证 |
| 10 资料/敏感/原值/通用填写 | 原扩展20项及相关VM回归 | 未验证 |
| 11 实际登录复查 | fixture会话/模型登录，非真实浏览器 | 未验证 |
| 12 其他profile/会话保存丢失 | Node身份与租约；完整浏览器两种重启场景未覆盖 | 未验证 |
| 13 聚合/其他站继续/跳过 | Node模型聚合与恢复 | 未验证 |
| 14 会话失效/未知结果再登录 | 模型、VM、fixture会话边界 | 未验证 |
| 15 账号/租户/profile/断线区分 | Node模型与HTTP来源身份限制 | 未验证 |
| 16 凭据隔离/非生产清理 | 仅虚构数据，Node测试隔离目录；未启生产profile | 未验证 |

Issue追加DEV-0023及PR正文更新被API403阻断；本报告通过同一分支提交保存供复核，不声称已在Issue发表评论或已触发产品经理。下一步责任人仍为开发者，在API可用后完成回写、调度和实际修复；只有产品经理可验收。Windows、真实网站、个人账号和真实申请均未验证。

## 2026-10-20 · PM-0007 返工与真实扩展交付（DEV-0025）

状态：开发交付待产品经理验收，PR #4 保持 WIP。接续原分支，没有从 main 重做；本轮执行地点仍为 Cloud `/workspace/job-application-assistant`，Node v24.19.0 / Linux x86_64。浏览器仅在 GitHub 托管 runner、已固定的官方 Playwright 1.58.2 镜像及隔离 profile 内执行。没有使用用户电脑安装或代跑，也未使用真实申请资料。

### 最新被测版本与结果

被测提交：`9cfe16883a0500e78960a6cbf18662f844449f4d`。实际 `workflow_dispatch`：[39373798995](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39373798995)，输入 `browser=workflow`。此事件检出上述开发分支 SHA，不是 PR 合并预览。本报告的后续提交仅更新文档，不能代称另一代码版本已跑过浏览器。

已通过Checks API核对本轮事件、完整head SHA、两个作业结论及唯一最终结果通知：

- `source-and-unit`成功：42个源码/JSON文件检查；原扩展20项 + local-app Node 118项，共138项通过，0失败、0取消、0跳过。Cloud同一测试命令也实际138/138通过。文件检查不混入测试数。
- `browser`成功，完整12/12段执行且全部通过，失败通知0。不是重跑旧SHA或重跑skipped作业。具体12段名称保存在最终Checks通知和结果artifact中。
- 独立HTTP观察器共记录3次申请POST；fixture实际multipart记录3、唯一回执3、已核实任务3。每个岗位的接收文件名称、大小、SHA-256及实际文件字节摘要均经脚本逐项核对。
- 保留被拒B页、关闭A、实际后台按钮恢复后，运行执行器恰好1个，恢复不增加POST。真实关浏览器断线、服务/profile重启、原任务和版本保留均通过。
- 额度3耗尽确实阻止第四任务；正常设为5后，附件预检、附件最终授权、暂停最终授权三个目标点均被真实触达。附件换文件场景和单项暂停场景各0 HTTP POST、0 fixture申请记录，最终仍只有3份接收，五个提交边界保留。
- 当前结果不等于产品验收；下表保留16项中仅Node/VM及未覆盖的分支。

此前 PM-0007 复核的 [39296539584](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39296539584) 是 PR 事件：head `cdf39b9c15dd3907bf5208fc1fbe1395e5986981`，实际合并预览 `4e12e9ba71fa430e4601d5011e560d66d0e39a0f`（main `a6e9f1b`）。该轮125项通过、browser skipped，不能替代本轮真实扩展结果。此前报告中的89d35a4是当时代码提交；此处明确给出本轮完整被测 SHA 与事件类型。

### 本轮修复

- 执行页恢复先用精确文档、目标 tabId 和扩展内部只读 probe 确认已经注册并启动循环；busy或后台暂时断线不被误判为停止。优先复用实际运行页；只在没有活循环时重载选中的停止页或创建新页，并有界等待启动。被拒B保留、关闭A、通过真实后台按钮恢复B后，实际仅有一个执行器和新的后台心跳，申请POST没有增加。启动超时/探测API异常/并发恢复另有VM回归，不冒充这些异常都已在Chrome复现。
- 保留额度3、三个提交边界耗尽后第四任务确实不能派发的证据，再经正常`/api/settings`把额度设为5执行后两段安全场景；未删任务历史、未改submitDay、未放宽产品限额。
- 真实请求表明扩展`tabs.update`导航被浏览器标记为无Origin的`cross-site/navigate/document`。fixture仅对已识别招聘页面的这种顶层GET导航例外；Host和显式Origin校验、跨站fetch/iframe/POST/session/测试接口限制、无CORS及SameSite均保留。HTTP安全矩阵13项fixture测试通过，所有拒绝请求前后fixture状态不变。
- fixture改用`Referrer-Policy: same-origin`，继续拒绝null/外部Origin。之前同源原生POST被拒的实际证据为Origin类别other，不能倒写为已捕获具体null值；[WHATWG Fetch的Origin处理规则](https://github.com/whatwg/fetch/blob/main/fetch.bs#L3703)支持no-referrer会使非CORS原生POST的Origin变为null的诊断。改响应策略后原POST403消失，没有把null列入白名单；后台的no-referrer策略未修改。
- 原生表单跳转可能让`scripting.executeScript`丢失提交返回值；原代码把缺失结果包装为failure后提前退出，跳过只读回执恢复。现仅在可靠成功或明确attempted:false时提前返回，其余沿既有只读核对路径读取结果页。不再次点击、不删除账本；缺回执仍unknown。新增VM验证一次点击后丢返回值、只读读取可靠回执；无回执时仍只点击一次并保留账本。
- 浏览器证据现在独立观察fixture HTTP层的每一个申请POST，包括Origin guard之前被拒的请求；观察器跨服务重启累计，仅存虚构tenant/jobId。零POST及重复投递断言同时核对HTTP观察数、fixture请求数组和唯一回执，避免403/409掩盖已发出的请求。
- 12段全部完成后显式断言执行数量，输出一条字段受限的最终Checks汇总，并保留结果JSON artifact。解决GitHub每步通知数量上限只呈现前10段、后两段缺少可读汇总的问题；没有减少断言或模拟插件配对。

### 运行历史与失败保留

| 运行 | 被测提交 | 真实结果 |
| --- | --- | --- |
| [39371931843](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39371931843) | 40ad984 | 基础132项通过；配对/B页恢复及UI通过，第三段等待beta申请页超时 |
| [39372227014](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39372227014) | 12224d1 | 加入安全状态诊断；发现5任务成功，beta检查因fixture403暂停 |
| [39372468396](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39372468396) | 237ca1c | 取得GET alpha/login、beta/jobs/web-001的精确导航元数据403证据 |
| [39372803353](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39372803353) | c02a1a4 | 前4段通过；beta已到原生POST，但来源检查403导致unknown |
| [39373098990](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39373098990) | c6f73bd | POST403消失；提交返回值丢失后提前退出，仍未核实回执 |
| [39373382690](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39373382690) | b77e476 | source-and-unit与browser整体成功；Checks只有前10条阶段通知，继续补完整最终汇总 |
| [39373798995](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39373798995) | 9cfe168 | 基础138项及浏览器12/12通过，最终汇总确认3次HTTP POST、3份回执、两安全场景0POST、5个提交边界 |

### CLOUD_HANDOFF 16项证据对照

“实际扩展”仅指本地虚构fixture和本轮固定脚本；不扩展为真实招聘网站、Windows或产品经理已验收。

| 项 | 实际扩展已验证范围 | 仍仅Node/VM或未覆盖 |
| --- | --- | --- |
| 1 连接/断线/重连 | 按钮配对、实际心跳；保留B关A后唯一执行器恢复；浏览器关闭断线及重启 | 其他启动API异常/超时主要VM |
| 2 发现/筛选/去重 | 真实列表；详情/申请页带参链接仍为同一任务 | 未适配完整query/hash归一化仅Node |
| 3 填写/附件/唯一提交 | 多段教育/经历、实际multipart字节、附件摘要、独立HTTP计数和唯一回执 | Windows/真实站点未验证 |
| 4 缺答/补答 | 后台原问题、确认答案后同任务完成，POST一次 | 不同原文/用途的负例主要Node/VM |
| 5 暂停/接管 | 全局/单项暂停、人工原值保留、最终授权前暂停零POST | 其他异步暂停窗口主要VM |
| 6 未知结果不重投 | 已接收后丢回执且会话失效；重启、再登录和只读核对无额外POST | 其他崩溃/租约竞态主要Node/VM |
| 7 持久化 | 浏览器和服务重启后任务、设置、资料/附件版本、边界保留 | 进行中任务单独刷新全过程未覆盖 |
| 8 计划/额度 | 到期计划尊重手动暂停；额度3用尽、正常设5；历史边界保留 | 受控时钟、跨日、错过计划/恢复策略仅Node |
| 9 演示/未适配/变化页 | 本轮全部申请只访问本地fixture；换附件会停止 | 拒绝真实网站、未适配、失效页、结构变化、人工验证的真实浏览器负例未覆盖 |
| 10 资料/敏感/原值/通用填写 | 通用引擎多段填写、人工原值、附件变更保护 | schema、敏感/凭据字段、结构变化负例主要Node/VM；独立generic浏览器套件未运行 |
| 11 登录复查 | alpha未登录等待；同执行profile实际登录、复查恢复原任务 | 未登录反复点重新检查仍不ready的明确负例未覆盖 |
| 12 profile/会话 | 同一profileId跨重启；失效alpha会话再登录恢复 | 其他profile登录不误认未覆盖；有效cookie跨重启保留与主动清除后的丢失两分支未分别覆盖。beta公开会话不算cookie保留证据 |
| 13 聚合/继续/跳过 | alpha两任务一个登录待办；beta继续；任务跳过同ID恢复 | 整站跳过/恢复及原因保留主要Node |
| 14 执行中失效 | 提交发出后失效保持unknown，再登录只核对不重投 | 提交前执行中失效、登录后继续尚未真实覆盖 |
| 15 身份/状态区分 | 实际断线/重连可见 | unknown账号、账号/租户不符、未适配、切profile重新检测主要Node/VM，真实负例未覆盖 |
| 16 凭据/清理 | 仅虚构数据；不采截图/录像；证据字段受限；仅清理隔离目录 | 未输入真实密码/OTP，不能声称真实凭据泄漏负例已验收；路径保护另有Node证据 |

### 协作与环境限制

当前实例已实际通过GitHub API读取、workflow_dispatch、Issue回写；旧API403不再作为当前障碍。源码及报告在同一开发分支和PR #4交付；Issue实际接手记录为[DEV-0023](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6283665244)、[DEV-0024](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6283740720)，不能把之前仅仓库报告误称早已发过Issue。

日志/产物下载仍在重定向到`results-receiver.actions.githubusercontent.com`及`productionresultssa8.blob.core.windows.net`时403。已保存这两个精确域名的放行草稿，保留api.github.com和原包管理器预设；需在环境设置审阅保存并发布，保存草稿没有证明运行时已应用或新任务已恢复。当前已通过Checks API核对运行事件、完整SHA、作业结论和最终执行汇总；artifact元数据可读，下载正文未验证。不把此下载限制代称产品功能失败，也未要求用户电脑代跑。

12段通过是本地虚构流程的开发证据，不等于16项全部完成或产品验收。后续由产品经理复核本PR及上述缺口；Windows、真实招聘站、个人账号和真实申请仍未验收。没有合入PR或声称另一对话已被自动唤起。
