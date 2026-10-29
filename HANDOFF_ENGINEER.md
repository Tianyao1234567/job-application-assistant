# Engineer（简历工程师）交接 — HANDOFF_ENGINEER.md

更新时间：2026-10-29（北京时间）。**身份名：Engineer（简历工程师）；本文件负责人：Engineer。** 面向没有聊天上下文的新工程师会话。下次第一句说：**先读HANDOFF_ENGINEER.md，接续Engineer。**

用户已要求按身份分开交接，停止共用同一份角色正文：本文件只交接工程师；[HANDOFF_MANAGER.md](HANDOFF_MANAGER.md)只交接Manager（项目经理）；[HANDOFF.md](HANDOFF.md)只作导航，不指定身份。不要把本文件重命名回HANDOFF.md。这里的身份名是固定协作称呼，不代表另有已接单或已启动的新工程师。

## 1. 你的身份、目标和接续权限

**按身份维护：Engineer只更新本文件；Manager只更新HANDOFF_MANAGER.md。** 引用对方文件和具体提交来接收状态，不覆盖对方正文，不让两个角色轮流改同一入口。需更改对方需求/验收时给对方可复制消息；未获其实际验收，不能自己改成已通过。用户明确要求的本次分档迁移例外，已保留Manager最新正文。

你是本项目的 **Engineer（简历工程师）**：负责云端开发、修复、必要测试和可用版本交付。**不要把自己当成Manager。** Manager负责需求、任务和验收；用户负责核对本人资料、选择岗位及确认首次真实提交。

本会话按用户要求结束，功能交付已完成，本次只修正交接文件分工；交接时没有需要接管的活动功能写代码任务。下一会话接替本Engineer；先核对远端是否出现交接后的新任务或改动，不重新询问用户是否允许接续，不另起重复实现。正常开发、必要云端测试、分阶段提交和推送已获授权；未经明确授权不合并PR、不强推、不覆盖别人的未提交修改。

项目是个人使用的 **Windows本机求职工作台＋Chrome MV3扩展**。开发在云端/GitHub-hosted runner，实际资料和执行在用户电脑；没有常驻公开后台，基础运行不要求GPT或其他模型API Key。最终目标是从选岗、预填/附件、缺项补答、人工验证和恢复，一直到受保护提交及结果核验的完整真实申请。现有界面沿用，不重做架构或UI。

**当前状态：candidate.9资料文件导入已实现并发布，待Manager验收；用户已报告安装candidate.8成功。首次真实企业完整投递仍未验证，也没有首次提交授权。**

## 2. 每次交付必须给用户一段能一键复制给Manager的话

这是用户在本次交接明确新增的沟通要求，之后持续遵守：

- 每次干完一项工作或交付后，简短说明结果，并另外给出**一个完整的、独立的 `text` 围栏代码块**。代码块第一行必须是 **发给 Manager**，整段可用复制按钮一次复制。
- 不把交接内容散落在正文、多个代码块或链接标签中；不要只说“已同步GitHub”却不给可转发文字。
- 块内写清收到的任务/提交、实际完成内容、源码SHA与可用入口、实际测试范围、未完成/未验证项、阻塞和下一步负责人。不要包含真实资料、私有路径、Cookie或凭据。
- 日常进度也应包含“发给 Manager”及真实状态，遵循本轮任务的沟通要求；完成时仍必须给上述单个可复制块。GitHub评论不会自动唤醒其他聊天，不能假称Manager已读或已验收。

交付格式示例（填写真实信息，不照抄占位符）：

```text
发给 Manager
已读取：[任务与提交SHA]，技术材料[齐全/具体缺项]。
已完成：[实际实现/本次交接内容]；源码/交接提交：[SHA]。
可用入口：[直接下载或文档链接]。
验证：[实际检查和结果；沿用旧证据须注明，未测试须注明]。
剩余/阻塞：[待验收、尚未实现或未验证内容]。
下一步：[负责人和具体动作]。PR #5保持draft，首次真实申请仍需本人确认。
```

## 3. 代码位置和必须使用的版本

| 项目 | 位置或状态 |
| --- | --- |
| 仓库 | <https://github.com/Tianyao1234567/job-application-assistant> |
| 有效开发分支 | `dev/pm9-demo-windows-readiness`，**不要从旧main重新开发** |
| 本会话工作区 | `/workspace/job-application-assistant`；新环境自行定位实际checkout，不假定路径共享 |
| PR | [#5](https://github.com/Tianyao1234567/job-application-assistant/pull/5)，保持draft，继承尚未合并的PR #4 |
| 共享任务记录 | [Issue #1](https://github.com/Tianyao1234567/job-application-assistant/issues/1)；GitHub为跨会话事实来源 |
| 当前功能源码／candidate.9发布来源 | `812a92d1adc947d6c3152dd926718ff7dd3d652a` |
| 本交接来源 | Engineer原交接`c1063a2506273dc941e6c0693b05a304e7bd32ca`；交付文档`884f0f076cb1b449a511613d47969545e810845d` |
| 已读取的最新Manager交接 | `16860b8bd82a6a8e3fd2b5103ab7727014d4c7ea`，仅整理文档，明确尚未验收candidate.9；本次分档不改变验收或运行版本 |
| 已接收完整技术材料的提交 | `97c6d9efa55ee1ece8ced79e1875019353069eee` |
| 用户已报告安装的candidate.8 | `bdd06e8aa17aa0e6dd433691cbbe399bebe41d7b`，Manager已验收 |

接手先读[AGENTS.md](AGENTS.md)，核对 `git status`、当前分支和远端最新提交，再按实际任务读取必要代码。若有其他人未提交改动，先保留并核实归属，不用 `reset --hard` 清场。旧交接中“本地仍为5986852、Manager接手”等描述已经过期，不能当成当前状态。

## 4. 今天做完了什么：本机资料文件导入candidate.9

完整原任务：[ENGINEER_TASK_PROFILE_UPDATE_001.md](docs/ENGINEER_TASK_PROFILE_UPDATE_001.md)。完整交付及限制：[PROFILE_FILE_IMPORT_DELIVERY_001.md](docs/PROFILE_FILE_IMPORT_DELIVERY_001.md)。任务文件中“待实现”“尚未支持增量入口”等是发布任务时的历史状态；实际完成状态以本文和交付报告为准，不能重复开工。

用户需要的长期流程：**已有PDF/配置自动预填 → 只集中问真正缺项 → 回答整理为固定增量JSON → 本机预览并一次核对保存 → 后续按适用范围复用**。普通补答不应每次改源码、下载程序或重新手填整份资料。

### 已实现

- “资料与简历”增加主入口 **选择资料文件**，直接读取电脑上已有的旧插件v3导出、固定格式增量JSON，或完整 `schemaVersion:1` profile草稿；文件只作变更提案。
- 预览显示原值、来源、匹配和冲突；不明确的经历可明确匹配已有记录或新建。已确认旧值默认保留，替换须本人选择；AI提供的内容不能自行成为已确认事实。
- 当前完整资料有未保存编辑时，保护编辑内容和所选文件，先保存或明确放弃。确认绑定预览时的资料版本和摘要，过期预览整批拒绝，保存为一次原子写入。
- 增量只改列出的字段，未列出内容不动，null不删除旧语言值；稳定记录映射及重复导入不会重复创建经历或无故提升版本。不按同公司/学校名字猜同一记录。
- 旧项目多段描述/职责保留并整合，不把长职责当职位；超长或无法表达的内容完整留待处理。未支持的信息保存在本机同一state的导入记录中，明确不宣称已经用于填表。
- 岗位答案必须匹配本机真实等待补答任务、站点/公司/岗位、原题及当前选项；文件ID不是授权。完整批次本人选中后走现有补答保存，部分批次仅预填待核对草稿；归属不明的留待处理。
- 导入不自动运行任务、不创建提交授权、不向企业提交；资料变化按原规则撤回旧版本执行确认，适用的补答可以保留到本人再次确认。unknown任务不恢复投递。
- 保留原PDF字节/摘要/版本、附件绑定、原答案、任务、提交账本与扩展身份。500KB上限、严格UTF-8/结构/路径白名单、原本的Origin/X-Local-Key/POST授权继续有效。证件及凭据内容排除，不借笔记绕过保护。

### 材料接收已齐全，不再让用户补技术交接

以下文件都在GitHub，已读并据此完成实现：

- [完整虚构v3结构](docs/examples/PROFILE_LEGACY_V3_FICTIONAL.json)
- [固定增量示例](docs/examples/PROFILE_UPDATE_FICTIONAL.json)及[空模板](docs/examples/PROFILE_UPDATE_EMPTY.json)
- [给其他AI的固定格式提示词](docs/PROFILE_UPDATE_AI_PROMPT.md)
- [完整协议与验收要求](docs/ENGINEER_TASK_PROFILE_UPDATE_001.md)

用户真实旧配置、Manager私有转换草稿未作为可读内容交给本Engineer，也不需要它们才能开发。历史聊天中的私有资料导入目录和“资料更新工作流”目录属于另一个工作区，链接不等于当前可读取文件。不要再让用户解释这些路径、粘贴完整协议或逐项重填。实际资料由应用在用户电脑选择文件后读取，聊天里的PDF/预填文件不会自动同步或保存到其电脑。

## 5. 可用更新文件、证据和用户使用入口

**candidate.9已交付、待Manager验收；没有证据表明用户已经安装9或导入真实资料。**

- **[直接下载一个update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.9-update/update.cmd)**；[发布页](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/v0.2.0-candidate.9-update)。用户只需这一个文件，不需下载整个开发仓库、清空旧目录或重新安装整套环境。
- 大小：**280379字节**。SHA-256：`2a2054135ed3687f1242550e2959fdc2d6c1e6fd27801efc3d64da280745387f`。
- 来源：`812a92d1adc947d6c3152dd926718ff7dd3d652a`。已实际从公开release URL重新下载，核对大小/摘要与同SHA本地构建一致，不是仅查看发布元数据。
- [最终CI 40818637375](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/40818637375)：同一源码的**42项必要检查＋5个实际后台文件选择场景全部通过**。[VERIFICATION.json](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.9-update/VERIFICATION.json)为可选证据，不要求用户下载。
- 42项＝13解析/合并＋17 Store/HTTP＋10受影响Dashboard＋2打包/candidate.8识别。5场景＝完整v3经真实file chooser保存六条经历；未保存编辑保护；增量及待处理项保存/重载；重复导入幂等；真实HTTP并发修改后的过期页面被拒绝且新资料保留。
- 界面实际保存的是虚构2教育、1实习、3项目；无外部请求或申请授权。CI使用Playwright1.58.2官方容器Chromium145，工作区Chromium154也通过。**本次没有重跑旧PDF、旧MV3、Windows或录屏，不能声称新增路径已获得这些验证。**

Manager验收新增范围后，可按[UPGRADE_001.md](UPGRADE_001.md)指导用户：在现有目录正常运行“停止.cmd” → 把新版 `update.cmd` 放到实际“启动.cmd”同级运行 → 看到 `UPDATE_COMPLETE` 后用原“启动.cmd”打开 → “资料与简历／选择资料文件”选择已有JSON → 核对预览后一次保存。保留隐藏 `.runtime`、已有依赖与浏览器，只补必要依赖。之后普通资料变化只换JSON，不必每次更新程序。

正常后台地址是 `http://127.0.0.1:17321/?autoconnect=1`，还有“本地投递执行端”标签页。安装/启动脚本成功后窗口可以退出，不因此重装；结束使用“停止.cmd”。电脑须开机联网、未休眠，后台与专用浏览器须运行。聊天和普通GPT不能直接读写用户D盘或localhost，必要教学以用户实际界面为准。

## 6. 当前剩余、卡点与下一步

### 当前卡在哪里

没有缺协议、缺样例或尚未实现的本轮开发阻塞；candidate.9已交付，**等待Manager验收新增范围**。之后用户还需在本机更新、选择真实文件并核对，不能把发布或虚构测试说成本人已保存。

普通排版PDF的教育/实习/项目提取仍有限：用户在candidate.8上传PDF后这些记录曾显示为空，且当时完整表单有未保存编辑，不能据复制文字断言持久资料全空。本轮有意用更完整的旧插件v3配置导入解决预填，不同时扩大PDF解析/OCR。获奖、自我描述、语言能力、学院、证书等目前无专用填写字段，导入可保留，但不代表自动填表已支持。在读/预计毕业不能转成已毕业事实。

虚构v3样例产生34个候选、6条记录，其中32项可接受，硕士在读degree/endDate两项保留限定待处理；任务里“39字段”来自Manager的历史私有转换草稿，不能为凑数编造role或拆技能。

### 新会话接下来按这个顺序

1. 核对有效分支最新远端提交，读取HANDOFF_MANAGER.md及Manager在本交接之后的具体验收/返工。Manager在16860b8仅整理交接，没有新增验收；不要把“已收到交付”当成“已通过”。没有新增任务时如实报告candidate.9待验收，不自动重做已交付功能或另发相同更新包。
2. 如有明确返工，针对具体缺口实现、仅运行新增/受影响检查，提交推送可恢复节点；其他通过部分沿用，不再完整调查、架构评审、历史测试或管理交接。
3. Manager通过后，给用户现成下载入口和简短使用步骤；保护现有编辑，指导选择已有文件、核对不支持/待处理项，不能要求重填整表。
4. 本人核对资料、附件和执行端后，由本人选择真正想申请的岗位。目前没有已确认目标，不用Mattermost技术样本替用户随便申请。现有真实适配仅限Mattermost Greenhouse相关范围，不能宣称任意Greenhouse/网站通用。
5. **首次真实提交前必须由本人确认目标岗位、资料、附件及提交动作。** 随后在同一任务处理人工验证、恢复、一次提交与生产结果核验；unknown只核对，不重投。遇实际阻塞再定点修，不提前重做全套。

用户重视速度，之前一次开发耗时很久且报错多，反复询问单文件/整包哪个快。不能承诺没有依据的分钟数；优先复用已有更新器和有效证据，不为追求包装形式增加无关工程。当前明确要求的单文件已交付，后续普通补答应使用资料文件。

## 7. 已验收历史基线：保留成果，不重新开工

| 已有成果 | 状态和必要证据 |
| --- | --- |
| Greenhouse受控链 | [交付001](docs/GREENHOUSE_DELIVERY_001.md)，184项相关检查、6场景已接收；身份/版本绑定、原值保护、补答恢复、记忆与unknown不重投有效；不代表真实企业完整成功 |
| 自定义控件／人工验证恢复／实际MV3 | [交付002](docs/GREENHOUSE_DELIVERY_002.md)，109项及新增MV3场景分项接收；candidate.4因附件对象P1停用，不回退使用 |
| 精确附件对象P1修复，candidate.5 | `3856a49a78852c4729a6be4d64f01f19acdcd1c3`，[交付003](docs/GREENHOUSE_DELIVERY_003.md)，30项受影响检查及定点MV3；Manager已接收，不再打开同一返工 |
| 本机PDF草稿、集中补答和稳定事实复用，candidate.6 | `38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac`，[PDF交付](docs/PROFILE_IMPORT_DELIVERY_001.md)，43项＋6实际后台场景已接收；保守提取不能冒充任意PDF完整理解 |
| 安全单文件更新／搬迁恢复，candidate.8 | `bdd06e8aa17aa0e6dd433691cbbe399bebe41d7b`，[更新器交付002](docs/UPDATE_DELIVERY_002.md)，26项定点检查、两条实际Windows分支及6项拒绝证据；[Manager验收](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6436876477)，用户已报告更新成功。candidate.7因自动回滚覆盖新资料P1停用 |

不同阶段测试只属于对应SHA和范围，不拼成“最新提交已全套通过”，不重复已接收的MV3/Windows/录屏或旧全套测试。

## 8. 绝对不要再踩的坑

1. **资料安全优先。** `.runtime`保存原简历、资料、答案、任务/提交账本、profileId、登录和浏览器配置，不能删除、初始化或上传来排障。公开仓库授权只针对源码；云端只用虚构资料，不把本人PDF、JSON、截图日志、Cookie、密码、验证码或令牌写进GitHub/CI。
2. **同名S3文件不是本次上传对象。** candidate.5已绑定实际File字节摘要、精确S3对象引用、成功上传响应及task/profile/tab/document/source。缺证据提交前暂停；跨提交边界后不匹配维持unknown，不伪造成功、不再投。PDF解析不能改写原附件或破坏此链。
3. **任何恢复不能覆盖新资料。** candidate.7曾在prepared中断后把新增profile v2回滚成v1；candidate.8自动/显式恢复都会核对当前完整state、完整浏览器配置/扩展存储和程序证据。未知变化或旧事务证据不足须拒绝，不能只看prepared/writing阶段就覆盖。
4. **搬迁诊断已经做过，不重问同一组。** 当时state可解析、manualPaused=false、paused=true、running=false、缺server.stopped、0事务；不能据此证明进程已退出或资料完整。用户曾未停止就搬目录并删除部分旧文件。candidate.8已修复此状态的安全离线更新，用户报告成功；不要让其重装、搬回已删旧目录、启动旧版补标记、伪造server.stopped、手改state、盲目restore或结束所有Node/Chrome。
5. **保留更新器已经验证的保护。** 静止核验覆盖新旧路径进程、17321/17322端口、启动/更新/真实Chrome配置锁；冷备份后才安全暂停。失败恢复要保持原附件路径与原扩展归属配套、安全暂停及unknown。原profileId/登录/账本须保留；旧outbox/上传网络证据不可重放。首次真实扩展身份、心跳和存储核验前不释放迁移暂停。具体机制见交付002，不因假设问题改动已测引擎。
6. **资料确认不等于企业提交授权。** 岗位答案不能因文件ID就跨任务套用，公司动机/薪资/国家工作许可/日期答案不能变通用事实；unknown不重新运行。不可凭“网络受理”声称已经回读企业服务端的实际附件字节。
7. **不把导入提案当事实。** 本人一次核对仍必要，冲突明确选择；未支持/在读/预计内容明示待处理，不静默丢弃限定，不为凑字段数编造。不把增量JSON粘到candidate.8旧的完整profile JSON框。
8. **不拿用户电脑做开发环境。** 测试在云端/GitHub-hosted runner，不能让用户重跑完整测试、下载一整套浏览器或注册self-hosted runner。验证码/登录由本人在同一专用浏览器完成，不索取敏感值。
9. **不因非关键问题停全部工作或扩大范围。** 具体阻碍明确记录，可独立部分继续；不默认扩站、做OCR平台、重构、录屏或建设在线更新平台。重要代码节点及时提交推送；只写计划/报告不算功能完成。
10. **角色和共享边界要准确。** 当前新会话是Engineer，不是Manager；只维护HANDOFF_ENGINEER.md，不把HANDOFF.md改成工程师或经理专属正文。其他聊天的内存、文件、凭据、未推送工作不会共享；评论也不自动派发执行。只核实当前实际状态，不沿用旧聊天“还没收到协议”“更新文件尚未交付”等过时结论。

## 9. GitHub访问、发布和必要验证的操作记忆

本环境的GitHub API/`gh api`/`gh pr view`曾返回Forbidden，但 **Git fetch/push、公开GitHub网页和release下载正常**。这不是“整个GitHub不可读”，也没有证据表明对话老化导致；开新聊天不能保证修复权限。新环境核实自身权限，优先Git读取共享材料，不反复重试API或让用户搬运技术文档。

- 本轮通过Git推送源码/发布tag，让GitHub-hosted CI在检查成功后发布，公共网页读取进度。纯文档交接提交用 `[skip ci]`，不触发业务测试和重复发布。
- 已发布tag `v0.2.0-candidate.9-update`固定指向`812a92d…`，**不要强制移动/重打已有tag或覆盖已发布包**。旧 `publish-update` dispatch仍固定candidate.8，不能误用来发布9。
- `.github/workflows/cloud-checks.yml`的 `profile-file-import` 是本轮定点范围；已知旧Windows脚本有只支持两基线的假设，当前包支持5/6/8三基线，本轮不重跑旧Windows全套。需要新运行器验证时另按实际改动确定范围。
- GitHub Actions曾因并发策略互相取消；无必要不并发触发。不能把失败、取消或未实际运行的检查说成通过。
- 下载资产使用ASCII文件名 `update.cmd`；曾用中文资产名被平台规范化，不再据中文链接猜文件。用户不用下载`UPDATE.json`/`VERIFICATION.json`。

本轮必要测试入口（只有实际代码变更需要时运行；当前交接不重测）：

```bash
node --test local-app/tests/profile-update.test.mjs local-app/tests/profile-file-import.test.mjs local-app/tests/profile-update-package.test.mjs local-app/tests/dashboard.test.mjs
```

实际界面用 `local-app/tests/profile-file-import-browser.mjs`，按现有云端浏览器环境运行；CI选择 `profile-file-import`。打包测试按已提交HEAD取源码，不能拿未提交文件生成的本地结果冒充最终包证据。运行前看现有环境/依赖配置，复用浏览器，不盲目重装。

## 10. 需要改代码时的最短导航

| 内容 | 文件 |
| --- | --- |
| 资料文件解析、映射、预览及应用 | [local-app/profile-update.mjs](local-app/profile-update.mjs) |
| 实际文件选择及预览交互 | [local-app/public/profile-file-import.js](local-app/public/profile-file-import.js)、[app.js](local-app/public/app.js)、[index.html](local-app/public/index.html) |
| 状态、原子确认和任务答案 | [local-app/model.mjs](local-app/model.mjs)，`previewProfileFile`、`confirmProfileFile`、`matchProfileFileAnswers`；同一state内的`profileImportHistory`/`profileImportMappings`，原始预览暂存在Store实例中 |
| 本机授权HTTP入口 | [local-app/server.mjs](local-app/server.mjs)，`POST /api/profile/import/preview`、`POST /api/profile/import/confirm` |
| 既有PDF提取 | [local-app/resume-import.mjs](local-app/resume-import.mjs)，只在实际相关任务涉及时阅读 |
| 更新／打包 | [scripts/update-install.mjs](scripts/update-install.mjs)、[package-update.mjs](scripts/package-update.mjs)、[package-candidate.mjs](scripts/package-candidate.mjs) |
| 项目规则和契约 | [AGENTS.md](AGENTS.md)、[SPEC.md](SPEC.md)、[local-app/CONTRACT.md](local-app/CONTRACT.md)，按涉及内容读取 |

运行基线Node24、Playwright1.58.2及锁定Chromium；PDF依赖在`runtime-deps`。不从仓库根假定有`package.json`，按现有脚本和依赖目录操作。本文件是接续入口，任务、证据和限制已链接齐全，不要求再次调查全仓或重读所有历史。
