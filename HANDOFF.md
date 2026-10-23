# HANDOFF — 新 Manager 从这里接手

更新时间：**2026-10-23（北京时间）**。这是唯一交接入口，面向完全没有聊天上下文的新会话。用户结束旧 Manager 会话，准备稍后继续；新会话第一句只需：**先读HANDOFF.md**。

**Engineer最新待验收交付（2026-10-23）**：[单文件更新交付001](docs/UPDATE_DELIVERY_001.md)，candidate.7来源`ffc18124fb12405d395c6a5e28460d11a83ad80d`。[直接下载单个更新脚本update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.7-update/update.cmd)，240077字节，摘要见交付文档。[最终CI](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39934626712)：14项必要检查、candidate.5/6两条实际Windows完整搬迁/真实扩展/再次启动场景，以及新扩展资料拒绝恢复负例。先在原位置正常停止，按需整体移动含隐藏.runtime的最内项目，再将一个更新文件放到启动.cmd同级运行；完成后由用户正常启动。保留原资料/附件/答案/任务/提交账本及浏览器，首次新心跳核验前保持暂停，unknown不重投。Engineer交付待Manager验收，不代表用户本机已更新；PR #5仍draft，真实申请未授权。

**Engineer最新交付（2026-10-23，Manager已验收）**：[PDF交付001](docs/PROFILE_IMPORT_DELIVERY_001.md)。candidate.6来源`38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac`，[CI](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39817261833)的43项必要检查、6场景实际后台UI和构建全部通过；[下载](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39817261833/artifacts/12442547605)北京时间10月30日00:50:02到期。本机PDF提取/一次核对、集中补答、稳定事实保存与后续复用已实现；按[原目录升级步骤](UPGRADE_001.md)保留资料、答案、任务、附件路径、登录和已有浏览器，只补必要PDF组件。原Engineer已完成本轮交付且通过Manager验收，现进入保留数据升级与本人使用；不要再要求用户手填整份资料、重装环境或另起并行实现。未使用本人资料、未向企业提交，旧109/MV3/Windows/录屏未重跑；PR #5仍draft。

**当前唯一开发任务（2026-10-23，用户明确恢复并修改方案）**：[单文件更新＋搬迁路径修复](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6360792701)。用户要求只下载一个更新.cmd，放到实际启动.cmd同级并双击，更新完成后再正常启动；还计划完整移出最内项目文件夹，使用固定短路径。此任务替代此前完整包更新方案并解除暂停，仍由原Engineer接续，不另启并行实现；发布不代表已接单。candidate.6验收保持有效，用户尚未确认本机升级/搬迁完成。验收必须覆盖Windows旧安装移动后实际附件可读、真实扩展身份/心跳与提交账本、原数据/暂停/unknown保留、再次启动；不能只以网页打开为成功，不能承诺百分百永不出错。单文件候选入口已由上述交付001提供，待Manager核对新增范围；不让用户手改state.json。

Engineer本轮实现与必要验证已完成，14项新增/受影响检查和上述两条托管Windows场景见交付001。更新/搬迁、扩展归属与身份、原账本及附件保护、失败/中断恢复已有实际代码；恢复旧版也核对扩展中新增的资料，避免只比较后台状态。下一负责人为Manager，核对交付新增范围后记录验收，再按用户节奏教学；Engineer只接续实际返工，不重跑已接收旧测试。全部测试使用虚构数据。

**此前完整包更新方案（已被上述单文件任务替代，保留历史）**：[Windows双击更新、免手工覆盖](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6359636510)。candidate.6已验收，用户进一步反馈手工合并文件太麻烦；下一项交原Engineer提供独立更新助手，操作缩为“下载→解压一次→双击更新.cmd→选择旧安装目录”，自动校验/停止/更新/补必要依赖/启动，保留数据、浏览器、暂停和unknown状态，并有失败恢复。必须支持candidate.5/6首次升级，无需先手动覆盖安装更新器。当前入口尚未实现/交付，任务已发布不代表已接单；不另启并行写入者、不建设在线更新平台或迁云。验收新入口后再带用户升级及继续首个真实申请，不能把规划说成现有功能。

**Manager最新验收（2026-10-23）**：[candidate.6验收通过](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6359418773)，运行源码`38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac`。PDF本机提取/一次核对、集中补答/稳定事实复用、保留数据升级已接收，本轮无阻塞返工项。已核对实际代码、CI状态和包校验，沿用43项/6场景证据，未重复旧验证。下一步按[UPGRADE_001.md](UPGRADE_001.md)指导用户在原目录升级、核对既有数据并在本机导入PDF；原Engineer只处理实际使用阻塞。解析是保守文字/标签提取；选择新PDF会先保存为当前附件，解析失败保留所选文件和旧资料，不恢复上一份活动附件。用户转贴的预填文件记录不证明已写入其本机。真实企业完整申请仍未验证/授权，PR #5保持draft。

## 1. 接手摘要与立即下一步

- 你的角色是 **Manager**：管理需求、安排Engineer任务、审核交付、推进和同步GitHub；Engineer负责实现、必要测试及交付。不要接手就重写代码或重新调查整个项目。
- 项目是个人使用的 **本机求职工作台 + 浏览器扩展**。最高目标：完成真实招聘网站从选岗、填写/附件、缺答暂停、补答恢复到提交和结果核验的完整申请。
- **真实企业完整投递尚未跑通、尚未验收。** 现有受控测试和实际扩展验证不能算真实企业申请成功。当前真实适配仅限 **Mattermost的Greenhouse页面**，不能泛称支持所有Greenhouse公司或其他网站；Mattermost是技术样本，不代表用户想申请。
- **candidate.5的附件精确对象绑定修复已验收通过，P1关闭。** candidate.4继续停用；不要重开旧返工或重跑已通过旧测试。
- 用户已在 **Windows 10/11** 下载依赖并成功打开candidate.5。截图显示后台和执行端已连接，当时为本地演示模式、自动执行暂停、队列为空。不要重新带用户从头安装。未确认其已保存真实简历/资料，未选定真实岗位，未授权首次真实提交。
- **当前已验收任务**：本机PDF自动提取 → 按申请匹配已有资料 → 缺项集中问题清单 → 回答保存 → 同任务恢复 → 下次复用适用信息，并交付保留数据的升级方式。[完整Manager任务](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6345390095)。
- 用户已明确说 **“这个我已经发了”**，即已将上述任务转给原Engineer。原Engineer已交付candidate.6及上述定点证据，Manager已验收通过，本轮无阻塞返工项；不要另启第二位Engineer重复实现。
- 用户此前已暂停实际操作；candidate.6现可按其节奏指导保留数据升级与使用。不要要求重装整套环境、手填整份资料或未经确认真实提交。

## 2. 有效仓库、分支与职责

| 项目 | 有效入口 / 状态 |
| --- | --- |
| 仓库 | [Tianyao1234567/job-application-assistant](https://github.com/Tianyao1234567/job-application-assistant) |
| 开发分支 | `dev/pm9-demo-windows-readiness`；不要从旧`main`重做 |
| 远端统一入口 | [HANDOFF.md](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/HANDOFF.md) |
| 当前PR | [PR #5](https://github.com/Tianyao1234567/job-application-assistant/pull/5)，OPEN / draft，基于未合并的`dev/local-workflow-foundation` / [PR #4](https://github.com/Tianyao1234567/job-application-assistant/pull/4) |
| 当前已验收运行代码 | `38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac` / candidate.6；43项＋6场景，见顶部 |
| 附件P1已验收历史基线 | `3856a49a78852c4729a6be4d64f01f19acdcd1c3` / `0.2.0-candidate.5` |
| 最新待验收运行/更新来源 | `ffc18124fb12405d395c6a5e28460d11a83ad80d` / candidate.7；本次交付文档提交不改变下载文件来源 |
| 共享任务与进展 | [Issue #1](https://github.com/Tianyao1234567/job-application-assistant/issues/1)，先读最新相关评论，不遍历全部历史 |
| 原首站标准 | [docs/MANAGER_TASK_001.md](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/docs/MANAGER_TASK_001.md) |

仅Manager / Engineer两种角色，不恢复旧A/B或四身份方案。用户授权新会话接替 **Manager**，不等于允许覆盖仍在执行的Engineer。很早一轮旧Engineer确曾由用户确认停止，但那次确认不能套用到今天已收到新任务的Engineer。

GitHub是共享代码/状态来源，不共享聊天、凭据、工作区和未推送代码。评论不会自动唤醒另一会话；没有证据不能说对方已接单、已停止或已完成。如确需更换Engineer，先核实当前写入者及未推送工作，明确分支、任务和执行权。

用户已授权重要进展同步GitHub，正常任务/交付评论和文档更新无需重复请求批准。**未经明确授权，不合并PR #4/#5，不强推或重置他人代码。**

## 3. 已完成和已验收的内容

沿用现有Node本地服务、管理界面、持久化数据、MV3扩展、专用浏览器及站点适配，不重做架构。产品目标包括自动找岗与手动链接、可配置公司/方向、每日投递计划、可视执行、任务记录、暂停/补答/恢复和自动提交；旧“只填不提交”已失效，首站不限企业。现有UI已获用户认可，不重新设计，不再追问已澄清的“众行机器人”。基础运行不需要GPT/其他模型API Key。没有常驻公开后台：开发在云端，用户运行与真实资料在本机。

| 阶段 | 来源与证据 | 验收结论 |
| --- | --- | --- |
| Greenhouse交付001 | `cd2e36c17d0185121b27c10314452fd8acd6120d`；184项相关检查、6个受控浏览器场景；[报告001](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/docs/GREENHOUSE_DELIVERY_001.md) | 受控执行阶段已分项通过，后续缺口由002/003处理；[Manager记录](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6335447669) |
| 交付002 / candidate.4 | `ff528ecb4535fc5d9d0d3ed75edf6485a9c923e0`；109项相关检查及实际加载MV3两个新增场景；[报告002](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/docs/GREENHOUSE_DELIVERY_002.md) | 自定义控件、附件操作、人工验证后同任务恢复、相关网络回执路径分项通过；附件精确引用P1阻塞，candidate.4停用；[返工要求](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6340966270) |
| 交付003 / candidate.5 | 最终`3856a49`、核心修复`d4f7851`；30项受影响检查和新增实际扩展定点验证；[报告003](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/docs/GREENHOUSE_DELIVERY_003.md)；[CI 39783058559](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39783058559) | **附件P1关闭，本轮无返工项，可进入本机使用验收**；[正式结论](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6344405151)。不代表首次真实申请已授权或成功 |

**附件P1的教训：** 原代码仅凭S3域名、同名文件和“已上传”标志，可能把另一个对象误认成本次简历。现已核对实际上传File字节摘要、精确对象引用和成功上传响应，经Chrome私有执行结果绑定task/profile/tab/document/source；最终请求引用摘要必须匹配，回执和后台再次核对。缺证提交前暂停；跨提交边界后不匹配保持unknown，不重投。后续PDF解析不能改写投递原文件或破坏绑定。

Manager已审查本轮差异、负例和GitHub Checks证据，没有重跑30项/109项。不同阶段的结果只属于各自SHA，不能拼成最新提交的全套测试。003首次定点CI `39782585591`因service worker不支持动态import失败，后改为实际扩展执行页导入/MAIN注入通过；不要把失败运行当作通过证据。

旧Windows托管检查、虚构站演示和录屏按需引用，不重新审查已通过旧功能，不要求用户跑开发测试或重拍视频。

## 4. 今天确认的新需求：应用维护资料，用户只补真正缺项

用户简历格式是 **PDF**。不希望把真实简历交给Manager聊天或公开GitHub，希望在自己的本机应用上传并处理：

1. PDF已有内容自动提取为资料草稿，用户核对；不手抄整份简历，不以填完完整资料表作为开工前提。
2. 申请具体岗位时，先匹配简历和已确认资料；缺失、歧义或新问题列为集中问题清单。
3. 用户回答后，适合复用的信息保存进本机“资料与简历”或答案库，继续同一任务。
4. 下一次申请优先复用适用信息，只问新的缺项；资料持续维护，可查看、修改、撤销。

**任务发布时的历史缺口（现已由candidate.6实现并验收，下列描述仅解释原需求）：**

- `local-app/model.mjs`的`setResume`仅保存附件字节、SHA和版本，没有PDF解析。
- `local-app/public/app.js`已有JSON导入资料草稿、schema校验、编辑和确认保存，可直接复用，不另造资料库。
- 已保存原问题、选项及来源，但主要逐条处理`t.question`；用户要求的集中补答交互尚缺。
- 现有答案记忆绑定岗位ID及来源/问题版本，不能叫跨岗位通用复用。可沿用查看、修改、撤销；新增“稳定个人事实→现有profile字段”的保存映射供后续岗位使用，其他答案保留限定用途。
- Manager聊天没有直接读写用户Windows资料的通道。“自动维护”由本机应用实现，不能承诺聊天回答已自动写到本机。

### 当前Engineer任务与完成标准

以[2026-10-23任务评论](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6345390095)为正式要求：

- 优先本机解析常见文字型PDF，生成现有资料草稿，显示来源/待核对项，允许一次核对接受，不要求重复抄录。不猜测、编造或静默覆盖已确认资料；冲突由用户选择。扫描、空文本或无法可靠解析要说明，不能空结果冒充成功。此轮不扩成全格式解析、OCR平台或通用聊天系统。
- 将当前申请缺项集中呈现、一次补答，保留原题/选项/来源/结构版本检查和同任务恢复。稳定个人事实可保存到现有profile；保存用途清楚，避免再抄一次。公司动机、岗位专属、国家/时间条件相关答案不能跨范围盲套。
- 不引入要求用户提供模型API Key或将简历送第三方的依赖；开发/测试仅用虚构资料。原PDF、摘要和附件对象绑定不变；资料确认不代替申请授权，unknown不重投。
- 必要验证：虚构PDF“选择→提取→核对保存”；解析失败/资料冲突不丢数据、原附件字节不变；连贯两任务场景（A匹配资料→集中补缺→保存→恢复，B复用适用答案不重复问、专属答案不误用、新缺项仍问）。只验新增/受影响内容，不重跑109项、旧MV3或无关录屏。
- 交付代码SHA、必要证据、可用更新包和保留数据的升级说明，标记“待Manager验收”。既有Greenhouse通过部分不重新开工。

原Engineer已交付源码`38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac`、candidate.6下载及43项/6场景证据；[Manager验收通过](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6359418773)，本轮无阻塞返工项。后续指导原目录升级和本人核对，不重复这次验收。六场景为实际后台/HTTP/本机worker加受控执行端回报，不扩大为新MV3或真实企业成功。

## 5. 用户已安装、启动踩坑与升级要求

**最新变化**：用户计划把最内完整项目移到固定短路径；已告知先在原位置正常停止，保留隐藏.runtime和全部已有依赖，再进行完整移动。新旧实际路径只留本地教学文档，不发公共GitHub。Manager已生成`GPT使用教学提示词.md`供用户交给普通GPT；该文件含用户路径，只在本机交付，不进公共仓库。普通GPT不能直接读取用户D盘或localhost，需按实际反馈逐步教学；可视化执行已存在，但不代表真实投递已跑通。

用户在Windows 10/11完成candidate.5依赖安装和启动。实际截图地址为`http://127.0.0.1:17321/?autoconnect=1`，另有“本地投递执行端”标签页，后台与执行端已连接。用户仍需实际界面教学，不只看技术报告。

已经解决的启动误解：

- `安装运行环境.cmd`成功下载后会自动关闭窗口，不自动打开软件。这是正常成功路径，不要因此重装。
- 接着运行`启动.cmd`。如要保留输出，在解压文件夹地址栏输入`cmd`并回车，再运行`.\启动.cmd`；用户按此步骤已成功。
- `启动.cmd`成功后窗口也可以退出，后台独立运行；旧“必须保留启动窗口”说法不准确。保持服务和执行浏览器运行即可，结束用`停止.cmd`。
- 端口冲突先用旧版本自己的停止入口，不随意结束所有Node/Chrome，不删除`.runtime`排障。

用户问“改完是否每次都得重新下载ZIP、重装环境？”已解释：**当前没有自动更新，需要取得新程序文件，但不应重新录入资料或重新下载整套浏览器。** 同一Engineer任务已包含：

- 交付简单可靠的轻量更新包或现有目录升级步骤，明确“正常停止→更新必要文件→启动”；无需建设自动更新平台。
- 保留`.runtime`中的简历、资料、答案、任务/提交历史及登录配置，复用已下载浏览器和兼容依赖；若PDF解析需要新依赖，只补必要部分并说明。
- 用虚构已有资料验证升级后仍可读取/续用。交付前不让用户随意覆盖、搬移或清空旧目录，不承诺未验证的升级命令。

### candidate.5历史基线入口（用户已安装；升级使用顶部candidate.6链接）

- [candidate.5下载](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39783058559/artifacts/12427069267)：需GitHub登录，**2026-10-29 21:00:40北京时间到期**；解压外层artifact后再解压内层源码ZIP。用户已装，不要求重下。
- 来源`3856a49a78852c4729a6be4d64f01f19acdcd1c3`；内层62个源码文件、560519字节，SHA-256：`7b9fff5a071f3cd2c2e80f65729f189635db9a7b5d68dd125396755ca95cbafb`。
- 运行前提：Node.js 24、锁定Playwright 1.58.2和对应Chromium；源码包不含依赖或私人资料，没有公开在线后台。
- [新增扩展验证证据](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39783058559/artifacts/12427468232)，2026-10-29 21:01:19北京时间到期。过期后按已验收源码补包或提供新入口，不重做全部演示。

## 6. 新Manager下一步顺序

**当前优先项**：跟进顶部已恢复的单文件更新＋目录搬迁修复任务，交付后只验新增路径和保护行为，沿用candidate.6既有证据。用户将自行使用普通GPT教学提示词；先有已验收的实际更新入口，再指导更新/搬迁核对及本人PDF导入。真实企业完整申请仍待用户选择岗位并明确确认。

1. 读本文件，查有效分支最新HEAD、Issue #1最新相关评论和PR #5有无后续变更。candidate.6已验收，直接进入保留数据升级/本人使用，不重复验收或派发同一开发任务；有新交付再按新增范围核对。
2. 正在开发就跟进同一任务；已经交付就审报告、实际差异和必要证据，对照第4/5节验收。通过直接接收；返工只列具体未满足项，沿用可信旧测试。
3. 新功能/升级方式通过后，给实际更新入口，指导用户保留数据升级，再按界面教学“PDF导入→核对→添加岗位→缺项补答→保存/恢复”。用户说稍后再操作，不催其现在继续。
4. 由用户选择真正想申请的岗位。目前没有目标链接、本人资料/附件确认或首次提交授权。仅Mattermost范围已接入；如目标在别处，只为目标补必要适配，不为赶进度引导用户随便申请技术样本。
5. **首次真实提交必须由用户确认目标岗位、个人资料、附件及提交动作。** 然后在同一任务完成填写/上传、必要人工验证与恢复、一次提交、结果核验。顺利完成就验收；遇实际阻塞才定点修，不预先重复一大轮旧测试。

本机自动执行需要电脑开机、联网、未休眠，后台与专用浏览器运行；关机/休眠不能投递，岗位未确认、缺答或验证码会暂停。岗位方向尚未替用户确定；“设置与计划”可改关键词、城市、网站来源、时间和额度，但可配置来源不等于已适配任意网站。用户尚未授权更改其筛选条件、计划或迁移云端。

## 7. 绝对不要再踩的坑与共同规则

1. **测试成功冒充真实投递成功。** 真实生产S3、本人CAPTCHA和企业完整申请未验证；网络受理不等于回读了企业服务端附件字节。
2. **把保守提取冒充任意PDF完整理解，或逼用户手填整表。** candidate.6已支持文字/标签提取和一次核对；未识别项按当前申请集中补充，答案适用才复用。
3. **同名附件冒充精确对象。** P1已修，PDF解析不能破坏原文件/绑定；无证明暂停，不能生成成功记录。
4. **重复分配或覆盖Engineer。** 用户已转发新任务；先核对状态，不把评论当唤醒，不沿用旧一轮停止确认夺取今天的执行权。
5. **丢失资料、暂停状态或提交历史。** 不上传/清空`.runtime`；保存本机任务不代表网站保存草稿。恢复先重查页面与提交状态，unknown只核实不盲目重发，资料/附件修改按版本和确认机制处理。
6. **重复旧调查、测试、演示或过度扩展。** 仅验证新增/受影响内容，不默认录屏、大量截图、重构、扩站、全格式/OCR或自动更新平台；流程正常达标就继续核心目标。用户重视效率、少Token、明确结论。
7. **让用户电脑承担开发。** 开发与自动测试在受控云端或GitHub-hosted runner；用户电脑仅作必要运行安装、实际使用和人工验收，不注册self-hosted runner。登录/验证码由本人在同一专用浏览器完成，不索取密码、验证码、Cookie或令牌。
8. **泄露真实资料。** 公共仓库授权仅针对源码，不包括真实简历、求职记录、资料、答案、会话、运行数据库、私人日志截图或录屏。只用虚构测试数据，不要求用户把PDF发给Manager聊天。
9. **拿错误代码基线开工。** 本Manager云端`/workspace/job-application-assistant`本地HEAD仍是旧`5986852`，有早期未提交原型改动；不能当最新交付验收/打包，也不能`reset --hard`覆盖。本次仅整理HANDOFF，业务改动保留。读代码用远端有效分支/确切SHA，实现时在确认写入权后使用隔离检出。新环境也先核对实际HEAD。
10. **擅自合并、强推或无谓触发验证。** PR #4/#5保持draft，除非用户明确授权。历史CI存在验证互相取消风险，长任务避免无必要并发；纯文档交接不重跑业务测试。

GitHub重要节点记录已完成项、SHA、实际证据、未完成项与下一负责人，状态变化更新本文件，不为每次聊天写报告。旧四身份/逐条聊天记录/默认演示录屏要求已由当前规则替代。

本会话使用`gh api`及Git HTTPS访问并同步GitHub，新环境应核实自身实际工具权限，不要求用户重复授予已具备的权限。云端曾无法下载artifact重定向的Azure blob，但能读取Checks注释和元数据；不声称下载过未下载的包，不反复盲试或输出带签名链接。

## 8. 按需入口，不是全仓调查清单

- [当前Engineer完整任务](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6345390095)：PDF、集中缺项、保存复用、保留数据升级。
- [candidate.5验收结论](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6344405151) / [交付003](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/docs/GREENHOUSE_DELIVERY_003.md)：已关闭附件P1的依据。
- [AGENTS.md](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/AGENTS.md)、[SPEC.md](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/SPEC.md)、[local-app/CONTRACT.md](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/local-app/CONTRACT.md)：按实际涉及内容读取规则、原需求和数据/执行契约。
- [WINDOWS_START_001.md](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/WINDOWS_START_001.md) / [CANDIDATE_PACKAGE.md](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/CANDIDATE_PACKAGE.md)：旧运行说明可参考；其中旧“先演示、暂不安装”或candidate.2状态不能覆盖本文件。
- 旧CLOUD_HANDOFF、开发报告、PM编号仅按需当历史证据；冲突时以用户最新要求、本文件及最新实际交付为准。

新Manager读完先简短说明已接手、当前唯一任务及最新Engineer状态，然后推进；不要要求用户重新解释上述背景。
