# PM-0009：真实演示、Windows候选交付与真实站只读准备

日期：2026-10-21（北京时间）。开发交付待PM复核。分支`dev/pm9-demo-windows-readiness`，独立[PR #5](https://github.com/Tianyao1234567/job-application-assistant/pull/5)，base为尚未合并的`dev/local-workflow-foundation`；没有从main重做，没有合并PR #4。

[PM-0009](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6291239731)已接受A/B/C与16项云端虚构站最低闭环。验收代码`3cb6de36da6cc597ecd69040e704ebc1cad5278a`、已验收交付head `b6cfdee0bbded79010bb97866fd1ad538275270f`是本轮基线；既有失败及验收证据保留，不重复打开已关闭缺口。

## 可查看成果

| 成果 | 查看与使用方式 | 来源与保留期 |
| --- | --- | --- |
| [7张真实演示、离线index及manifest](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39469515898/artifacts/12286771234) | 下载独立`fictional-demo-reviewed` artifact，解压后打开index.html或直接查看PNG；无需安装求职助手。页面无外部资源、脚本或表单 | `1118d9f30009141b1fcf0df0877bf2157d71ecd0`；3天，API元数据到期为北京时间2026-10-24 01:51 |
| [候选源码包、SOURCE及SHA256SUMS](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39471366693/artifacts/12287431649) | `source-candidate` artifact内再含源码ZIP，先核对下面的摘要；源码与清单可审查，不代表已经安装 | `17c3efd257b66d1a81e345d54e03edf0cd7f07f9`；7天，到期为北京时间2026-10-28 02:03 |
| [Windows中文使用说明](WINDOWS_START_001.md) | 依赖、首次下载、日常组件、数据目录和未来一页轻量验收步骤 | 当前无需用户运行旧安装CMD |
| [真实站集中准备清单](REAL_SITE_PREPARATION.md) | 五家公司来源、已确认/未知、首站建议与本人准备边界 | 只读；没有注册或投递 |

artifact短期保存且GitHub下载可能要求已有GitHub登录；不在源码Git历史中保存图像、ZIP、运行数据、依赖或浏览器目录。过期后需按同一显式托管入口重新生成，不把临时链接当永久发布版。

## D1：真实演示与候选包

实际演示：[39469515898/browser](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39469515898/job/118789723269)，workflow_dispatch / browser=candidate，实际检出1118d9f，browser作业success。该次整体workflow因Windows初次版本探测失败为failure；不能将整体失败掩盖，也不能把已成功的演示子作业改写成失败。更早的独立演示[39427258181](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39427258181)在771ded6也实际成功；本次不靠旧作业代称新SHA运行。

7张截图来自实际加载的Manifest V3扩展、真实后台和隔离虚构站：后台连接、未登录停止原因、实际多段教育/经历及附件、缺答原问题、UI暂停记录、可靠站点回执、后台结果。通过真实UI补答和恢复原任务。独立HTTP申请POST=1、实际multipart接收=1、唯一回执=1；实际文件名/大小/SHA-256及接收字节一致，同taskId和提交历史保留。没有动画、模拟进度或向真实站提交。

截图是显式手动选择的独立演示，普通push/PR及已有普通浏览器测试继续默认不截图/录像。截图前按真实key、Cookie、profile/task/receipt标识作动态遮罩和可见DOM审查，联系字段与会话标记遮罩；PNG元数据检查及manifest私有值检查通过后，才复制7张PNG、index.html和manifest.json到精确发布目录。隔离浏览器/数据关闭清除，目标消失已验证，未上传整份profile或简历正文。

**审查边界**：以上是脚本实际执行的DOM/遮罩/PNG元数据审查。开发Cloud尝试下载演示artifact时，跳转到`productionresultssa18.blob.core.windows.net`失败，未反复重试；因此没有声称已在本Cloud人工视觉打开PNG或复查未下载ZIP正文。PM可通过上面的独立artifact作视觉复核。这不阻挡API/Checks、候选构建和托管Windows执行；当前不要求用户改环境或本机代跑。

演示真实Linux进程树每秒采样52次：最多11个后代进程，后代RSS求和峰值1488 MiB，控制Node RSS峰值164 MiB，同时只有一个浏览器实例。后代含Playwright驱动/Chromium多进程，RSS共享页可能重复计数，峰值未必同时发生。这只是该runner的参考，不是Windows或用户电脑的内存承诺。候选日常只保留一个专用执行浏览器，不需要安装React/Vue测试框架。

候选版本`0.2.0-candidate.1`，最终源码SHA `17c3efd257b66d1a81e345d54e03edf0cd7f07f9`：

- ZIP：`job-application-assistant-0.2.0-candidate.1-17c3efd257b6.zip`，386210字节、55个源文件，另含生成的SOURCE.json。
- ZIP SHA-256：`13a08ede5fd02f667dd31f6c069d610a0101db5a597b069d4fe2ab9adb17f294`。
- 从明确Git allowlist读已提交blob，来源必须继承b6cfdee；工作树改写和意外跟踪的runtime诱饵均不会入包。包含扩展、后台/虚构站/管理台、Windows入口、实际使用说明及最小运行依赖锁；不带node_modules、Chromium、.runtime、测试输出、Cookie/会话或真实资料。
- `runtime-deps`只锁定Playwright 1.58.2及上游依赖，首次需要另外下载该平台Chromium；Node.js 24另行安装。后台模式只需Node，不下载浏览器。构建后回读ZIP逐项校验路径、CRC、字节和摘要；3项集成测试通过。能解压与文件校验不等于Windows浏览器已经安装。

Cloud本地按同SHA构建/验证的ZIP摘要与托管构建Checks一致。候选命令和验证边界见[CANDIDATE_PACKAGE.md](CANDIDATE_PACKAGE.md)。D1演示源到最终候选源只改变Windows版本探测及Windows测试helper；Linux后台、扩展和演示脚本没有改动。不冒称演示跑过另一SHA，也不为这些修复重复已通过的Linux演示。

## D2：Windows托管验证

初次实际Windows作业[39469515898/candidate-windows](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39469515898/job/118789807911)，1118d9f：Node包校验及PowerShell原生Expand-Archive、55个文件的Get-FileHash比较通过；随后进入copy-candidate阶段，runtime.ps1报NODE_VERSION，9项服务用例尚未开始。保留这次真实失败，不把源码检查或Linux结论当Windows通过。

修复f20df3e改用真实node.exe --version，并在PowerShell正则解析主版本，保留>=24检查，避免PowerShell 5.1原生参数传递中JavaScript内双引号的边界问题。没有删除依赖检查或缩减用例。

版本修复后[39469897587](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39469897587)在f20df3e基础与候选包构建通过，但Windows步骤长时间停滞。定位到测试helper在CMD退出后仍以无期限ReadToEndAsync等管道EOF；开发者取消该次运行，结果是cancelled、未通过，不声称正常清理或9项完成。17c3efd将输出改为本次受控文件的有限快照，保留35秒CMD期限、全部9项断言及第3/6项进度；该次修复仅涉及测试helper，产品runtime保持f20df3e版本。调度39471240534在作业开始前被稍后到达的PR自动检查取消，无任何测试结果；待自动检查结束后，重新以同SHA单独调度。

**最终实际通过**：[39471366693](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39471366693)，workflow_dispatch / browser=windows-candidate，实际检出`17c3efd257b66d1a81e345d54e03edf0cd7f07f9`。source-and-unit、candidate-package、candidate-windows均success；本次browser及site-readiness按选择skipped，未混称重跑。54源码/JSON检查另计，20原扩展+140 Node=160项基础测试通过；最终Windows Checks完整JSON已实际读取，**9/9 PASS，隔离目录清理true**。Windows托管镜像windows-2025、Node v24.21.0、Windows PowerShell 5.1.26100.33438，candidateArchiveInput=true，含空格/中文路径true，browserInstalled=false、browserStarted=false。

| Windows实际用例 | 已核实结果 |
| --- | --- |
| 缺Playwright | 明确依赖原因，未留下半启动后台或占用端口 |
| 真实候选后台启动 | 原生解包/逐文件摘要后，受控含空格/中文路径通过CMD启动；后台、fixture及未配对401均真实响应，虚构任务/版本保存 |
| 重复启动 | 同一服务PID，匹配入口的后台实例恰好一个 |
| 正常停止 | app.close回调实际完成、端口释放，虚构任务、v1及key保留；无强杀正常后台 |
| 重启与再次停止 | 同taskId、设置/额度/模式、资料与简历版本和安全暂停保持；重复停止可用 |
| 17321被占用 | 受控外部进程实际监听，明确该端口，拒绝启动、不停止占用者、不改状态文件 |
| 17322被占用 | 同上，分别实测第二端口 |
| 错误PID | PID指向另一个入口的受控进程，停止命令明确拒绝，外部进程仍在 |
| 缺Node | 实际隔离PATH移除Node，CMD非零退出并说明需要Node，未半启动 |

[Windows证据artifact](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39471366693/artifacts/12286903183)只保存受限布尔/用例/版本JSON，不上传测试state、key、日志或完整profile。

已有入口修正：服务专用wrapper通过app.close正常保存/停机；启动前检查双端口与依赖；支持-BackendOnly；重复启动复用；PID停止必须匹配当前Node executable和完整入口参数，不能用路径前缀停止别的程序；CMD保留退出码，CI非交互不pause；补齐Windows说明。Windows测试使用下载的实际候选包，原生解包并逐项比摘要后，再复制到含空格/中文的受控路径，只用虚构数据。

**未验证**：没有在Windows runner安装/下载或打开可见Chromium，没有验Windows工具栏加载、本人登录、用户电脑内存或真实站投递。后台/脚本通过也不会扩大成这些结论。

## E：真实招聘站只读准备

公开采集来源、逐家公司实际响应与未知详见[集中准备清单](REAL_SITE_PREPARATION.md)及[前三家依据](docs/REAL_SITE_RESEARCH_A.md)、[第四范式/石头依据](docs/REAL_SITE_RESEARCH_B.md)。第二轮托管GET-only运行39469515898/site-readiness实际success；不是把所有站点标为成功。当前Cloud CONNECT拒绝、目标站实际HTTP403、重定向上限、JS空壳与搜索内容不相关分别记录；首轮Checks截断失败历史保留，第二轮改为受限UTF-8摘要后5家公司注释完整可读。

优先建议第四范式官网实际发布的Moka社会招聘入口作为**首个只读适配预研样本**，先取得真实列表/详情、稳定岗位ID与租户证据，再由PM集中安排同执行profile的本人准备。Moka本轮重定向未取得列表，不宣称它已经可自动申请；美/梅卡曼德官方外链目标停在安全加载页，不能猜已确认验证码；斯坦德、众行及石头招聘入口的未知保留，不拼接供应商域名或拿商店登录代替招聘登录。公司/方向/城市均保持配置项，后续仍以真实站完整自动提交为目标，本阶段不注册或投递。

## 当前需要用户配合的最小清单

现在无需安装、下载浏览器、运行开发测试、注册招聘账号或提供真实简历。可以先查看演示与候选清单。

1. 为下一轮识别入口，集中确认“众行机器人”的公司全称或官方主页/招聘链接；不要用众擎等近名公司替代。若手边已有斯坦德、石头的官方招聘链接，可一起给PM；当前不要求注册。
2. 后续由PM一次性约定Windows轻量现场步骤，参考使用说明：确认OS/Node与可用内存、下载同来源候选包，先后台，再在明确安排后准备浏览器，只跑一项虚构任务并启停核对。不是让用户本机代跑测试套件。
3. 真正接入样本站需要本人时，PM集中列出每站注册/验证事项；在实际执行的同一专用profile由本人完成，开发者不接收密码、验证码、Cookie或会话导出。另一浏览器登录不等于执行端ready。

本轮交付待PM复核；原PR #4阶段验收与是否合并分开，当前PR #5为下一阶段draft。最终报告提交与实际演示/候选/Windows被测SHA分列，保留真实失败和未验证项。
