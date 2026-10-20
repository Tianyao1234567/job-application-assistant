# PM-0008 · 最低验收补证（A→B→C）

状态：开发分组交付，完整产品待产品经理验收，PR #4保持draft/WIP。沿用`dev/local-workflow-foundation`，没有从main重做。上一轮9cfe168的虚构招聘站12段已由[PM-0008](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6285637106)阶段验收，PM-0007两项返工已关闭；其失败历史和最终证据保留在`DEV_REPORT_002.md`。本报告记录后续新增证据，不扩大原验收。

开发在Cloud `/workspace/job-application-assistant`、Node v24.19.0/Linux x86_64；浏览器仅在GitHub托管runner、固定Playwright 1.58.2镜像和隔离目录中执行。每组同时只有一个真实浏览器实例，多profile串行切换，不伪造Chrome API/profileId或写入Chrome storage。仅使用虚构账号、资料和本地测试站。未使用用户电脑代跑。

## A组：登录、身份和会话

开发证据已完成，待PM分组复核。

- **被测代码SHA**：`ca7e31a628a4172014cfd954c249b4a0c1d09631`。
- **实际运行**：[39387099009](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39387099009)，workflow_dispatch，`browser=acceptance-a`；source-and-unit和browser均success，直接检出该分支SHA，不是PR合并预览。
- **基础结果**：44个源码/JSON检查另计；20原扩展+127 Node，共147项通过，0失败/取消/跳过。Cloud同一Node命令实际147/147通过。
- **真实扩展结果**：6/6段执行通过，最终Checks汇总已实际读取。组内独立HTTP申请POST共1、fixture接收记录1、唯一回执1；名称/大小/SHA-256及实际接收文件字节均与任务锁定版本一致。报告提交不代称另一SHA已跑过浏览器。

| 实际场景 | 已核实结果 |
| --- | --- |
| 另一隔离profile已原生登录 | 真实独立持久目录先登录alpha并关闭，实际执行profile仍需登录；两者没有会话串用 |
| 未登录反复检查 | 实际后台按钮连续检查3次，实际页面仍login，任务waiting_user，fill/upload/submit授权0、HTTP POST/接收/回执均0 |
| 切换执行profile | 真实浏览器依次切换，扩展自然生成不同profileId；切换后状态unknown，必须重新检测。另一profile可ready，原执行profile仍login；未修改ID或storage |
| 会话保留与丢失两分支 | alpha有效登录在同一持久profile关闭重启后真实复查仍ready；仅清当前隔离profile的fixture_alpha Cookie，关闭重启后真实复查报告login，身份仍是原profile。不是用beta公开会话代替Cookie保留证明 |
| 身份与断线原因 | 错误账号、unknown账号、错误租户的实际页面/JSON分别显示固定安全原因；关执行浏览器可检测断线。正常原生登录清除错误标记后仍是原任务，无提交历史被清除 |
| 提交前实际失效 | 真正到达upload前的会话请求后，fixture会话失效；页面没有附加文件，无提交边界、HTTP POST0。原生重新登录并复查后，先检查原页面/已有结果，再以同taskId完成，恰好1次HTTP POST/1份回执，保留提交历史 |

A组同时修复了实现缺口：后台不再把verification、unknown、expired一律覆写为普通login；依据真实观测字段派生账号/租户不符的固定原因码和中文说明，不接收页面任意自述消息。`/__test/session`新增受key与testMode保护的reportedTenant，用来生成实际错误租户页面/会话JSON；Cookie、路由和回执的真实租户不变，生产模式忽略覆盖，正常原生登录会清除它。相应Node回归已运行。

原12段中“提交发出后失效仍只核对、不重投”的已验收证据继续保留；A组没有删除提交账本、生产状态或修改每日限额。

## B组：真实保护负例

开发证据已完成，待PM分组复核。

- **被测代码SHA**：`ffd0b283a2eacb3f6372e6ee1b0d859a8ba116f6`。
- **实际运行**：[39388225056](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39388225056)，workflow_dispatch，`browser=acceptance-b`；source-and-unit及browser均success，实际检出该SHA。
- **基础结果**：45源码/JSON检查另计；20原扩展+131 Node，共151项通过，无失败/跳过。Cloud同命令亦实际通过。
- **真实扩展结果**：8/8段PASS，最终Checks汇总已读取；所有负例分别0 HTTP申请POST/接收/回执，最后纠正后同任务1次HTTP POST/1份接收与唯一回执，锁定附件实际字节与摘要一致。

| 实际场景 | 到达条件及结果 |
| --- | --- |
| 填写前结构变化 | 实际fill最终授权请求处改变标签，执行器同步复核停止；姓名及附件仍空，0 POST |
| 失效岗位 | 已调度inspect实际收到HTTP 410与固定失效标记，无form；后台说明岗位已失效，0 POST |
| 人工验证 | 实际页面verification标记被执行器观察，后台保留验证原因，0 POST |
| 未适配/真实用途隔离 | 正常设置、加入、site-check和run实际触发adapter/mode拒绝；独立可控接收端所有请求0，申请POST0。属于入口保护证据，没有伪造已执行的外站任务 |
| 凭据/敏感/人工原值 | 真实扩展service worker向目标页面ISOLATED世界注入实际guard/scan/fill；凭据值与标识未进入scan结果，敏感映射被拒，人工值保留，DOM写入/submit事件0，HTTP POST0。不是VM或Chrome API替身；没有声称整条投递队列采集了凭据 |
| 问题原文变化 | 实际answer最终授权窗口改变原文，旧答案未写，原任务保留，0 POST |
| 限定用途变化 | 同窗口改变scope，旧答案未套用，无提交边界，0 POST |
| 纠正与历史单调 | 恢复原问题与用途后原任务提交一次，实际附件/答案一致；之后task-resume/skip/pause均拒绝，显式verify只读且不增加POST，磁盘提交历史保留 |

失效页面场景仅受testMode与测试key控制，返回实际410而非模拟执行器结果。执行器据固定页面标记给出明确原因；其余结构、问题及通用填写保护为现有实现的新增真实证据。每一负例均证明已到对应保护入口或授权窗口，未以不调度充数；提交前安全中止可检查恢复，已有提交历史永久只核对。

## C组：刷新、准备事项、时间与隔离

开发新增证据及受提交响应变更影响的原12段必要回归均已通过，待PM分组复核。

已保留真实失败：[39388767251](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39388767251)，被测`9b610699d830d55ae1d505bd25579b78cc245c8e`、browser=acceptance-c。基础作业通过；首段执行中刷新与锁定版本通过后，第二段对实际submitted原生结果页reload触发第二次POST（独立HTTP累计2，同一beta/web-001），站点HTTP400拒绝，等待可靠回执超时。不能因任务仍submitted或唯一回执未增加而称没有重发。

修复`3cb6de36da6cc597ecd69040e704ebc1cad5278a`将成功且持久化完成的原生POST响应改为303到只读回执GET；测试用loseReceipt指向pending GET，仅该场景隐藏当前结果，canonical verify仍可读。hideReceipt与实际会话失效继续生效，来源/Host/CSP及提交账本不变。新增3项真实HTTP Node回归，连同3项清理路径回归，Cloud完整137 Node通过。

- **修复后实际被测SHA**：`3cb6de36da6cc597ecd69040e704ebc1cad5278a`。
- **实际运行**：[39389113681](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39389113681)，workflow_dispatch，`browser=acceptance-c`；source-and-unit/browser均success，直接检出该SHA。47源码/JSON检查另计，20原扩展+137 Node=157项通过，0失败/跳过。
- **真实扩展结果**：4/4段PASS，最终Checks完整汇总已读取；独立HTTP申请POST/fixture接收/唯一回执最终均为3，分别beta/web-001、beta/design-001、alpha/cpp-002各1，3项均核对真实附件字节/摘要。alpha/cpp-001仍缺答、0 POST。

| 实际场景 | 已核实结果 |
| --- | --- |
| 进行中刷新与版本 | 真正到beta upload会话窗口后，通过正常API把当前资料/附件存为v2；命令仍running时刷新后台及申请页，再显式暂停检查。设置、原taskId及锁定v1保持，恢复后实际收到v1姓名和附件字节，当前版本仍v2；0额外POST |
| submitted/unknown实际结果刷新 | 直接对原生提交后所在文档reload，没有先导航GET；刷新响应确为GET。submitted和unknown各保持状态，HTTP/接收/唯一回执不增加；runner和dashboard真实reload、新client同profile心跳也不增加申请 |
| 整站跳过/其他站继续 | alpha两任务保留同一聚合登录事项的ID/标题/原因，UI整站暂跳；beta实际继续完成。服务及profile重启后skip与原原因仍在，alpha任务身份不变 |
| 正常恢复 | 服务关闭保存全局暂停，重启后实际检查paused=true/running=false；UI恢复alpha后仍需真实登录，原生登录并复查后正常resume，原cpp-002以v2完成一次；cpp-001仍等待答案。没有改安全停机行为或强行改运行状态 |
| unknown只读恢复 | unknown跨实际结果页/runner刷新及profile/服务重启仍保留提交边界，task-resume被400拒绝；再登录后显式verify恢复同任务为submitted，仍共3 POST/3回执，未删账本或重投 |
| 私有证据与清理 | 实际key/profile身份及注册虚构凭据、隔离Cookie值/完整虚构资料标记在公开编码中缺席；递归字段过滤、含转义标记编码演练、保存JSON回读全部通过。默认artifact无截图/录像。profile/downloads/artifacts均在本轮隔离目录，关闭后仅清该目标并lstat验证消失。只输出布尔事实，未读取生产profile |

下列具名Node测试在上述同SHA的source-and-unit实际执行通过，Cloud也运行了完整137项。它们是受控时钟/模型证据，未混称真实浏览器等待一天：

- `未知结果消耗当日尝试额度，核对不受额度限制，跨日只执行一次计划`
- `未手动暂停的新数据可以等待计划，重启后只触发当日一次`（包括错过5天只触发一批）
- `pause 持久阻止到点计划，改设置与跨日重启不会解除`
- `stop 持久阻止到点计划，改设置与跨日重启不会解除`
- `手动暂停保留上次计划记录；失败的继续不会解除暂停`

清理路径的3项Node实证分别拒绝tests根/外部/相邻前缀、拒绝生产browser路径、实际清自有目录且保留独立sibling sentinel；拒绝测试在调用删除前设防，不会为了测试去删除受保护路径。B的真实敏感字段证据与本组输出审计互补，不声称已测试真实凭据。

**必要旧流程回归**：[39389485864](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39389485864)，同一`3cb6de36da6cc597ecd69040e704ebc1cad5278a`，workflow_dispatch / browser=workflow，两个作业均success，157基础测试与47源码/JSON检查分别通过。最终Checks实际12/12 PASS：独立HTTP申请POST=3、multipart记录=3、唯一回执=3、submitted任务=3；附件替换与提交授权前暂停均0 HTTP POST，5个提交边界保留。真实被拒执行页通过后台恢复、额度3用尽阻止新增任务后正常设置提高到5的两项既有返工仍通过。此次回归确认303未破坏原缺答、丢回执/实际失效、重启只读核对及提交保护，不重新冒称PM已验收最新SHA。

A、B、C和旧流程回归使用各自全新隔离数据，计数按运行分别报告，不把各组相加当作同一生产状态。C的artifact元数据已通过API读取：`fictional-workflow-evidence`存在、未过期、绑定3cb6de3；公开Checks汇总和源内断言已核实，未把尚未下载的ZIP正文称作已复查。

## 16项当前对照

| 项 | 最新实际范围与状态 |
| --- | --- |
| 1 连接/断线/重连 | 原12段阶段验收；A实际跨profile新client、断线与重连通过；其他启动异常主要VM |
| 2 发现/筛选/去重 | 原12段已验收；未适配完整query/hash保留另有Node |
| 3 填写/附件/唯一提交 | 原12段已验收；A恢复后同任务、实际字节摘要及唯一POST/回执再次通过 |
| 4 缺答/补答 | 原12段已验收；B实际原文/scope变化不复用旧答案、纠正同任务提交通过 |
| 5 暂停/接管 | 原12段已验收；B保护负例停止通过，其余异步窗口主要VM |
| 6 未知结果不重投 | 原12段已验收；C实际unknown结果/runner/profile/服务刷新重启后拒绝重投，只读verify通过 |
| 7 持久化/进行中刷新 | C实际running窗口刷新后台及申请页，设置/taskId/锁定v1正确，当前v2与实际接收v1并存；submitted原生刷新已修复为GET且不重发 |
| 8 计划/额度 | 原12段额度/手动hold已验收；C列具名Node跨日/错过5天/手动暂停，受控时钟通过，未冒称真等一天 |
| 9 演示/未适配/变化页 | B真实结构/410/人工验证停止、入口adapter/mode拒绝、可控外端所有请求0通过；真实站点未验证 |
| 10 资料/敏感/原值/通用填写 | B真实扩展隔离世界scan/fill不采集凭据值、拒绝敏感映射、保留人工值；问题变化保护通过 |
| 11 登录复查 | A真实未登录3次检查、零写入/上传/提交，登录后原任务恢复通过 |
| 12 profile/会话 | A真实多profile不误认、自然ID切换、有效Cookie保留与主动清除丢失两分支通过 |
| 13 聚合/继续/跳过 | C真实UI整站跳过、原任务与原因跨重启保留，beta继续；恢复后alpha原任务实际登录继续、缺答仍等待 |
| 14 执行中失效 | 原12段提交后失效只核对已验收；A提交前失效、重新登录同任务唯一提交通过 |
| 15 身份/状态区分 | A账号/unknown/租户/断线/切profile及B未适配/人工验证原因通过 |
| 16 凭据/清理 | B真实虚构凭据标记未采集/填入；C实际编码/JSON回读审计、默认无截图、隔离清理并确认目标消失，3项Node路径/sibling保护通过；生产profile未读改 |

## 边界与下一步

A/B/C组均有新增实际证据，16项按上表列出适用层级；这是开发交付，不冒充PM已验收完整产品。执行器其他闹钟/启动异常和异步细分窗口主要仍为VM；受控时钟是Node；Windows使用入口、真实招聘站适配、个人账号和真实投递均属后续阶段。GitHub API/Checks读写与调度实际可用；日志/ZIP下载域名的旧限制不阻止本轮开发，未下载ZIP正文不称已复查，不要求用户重建环境或本机代跑。CLOUD_HANDOFF第3/4节已标历史并指向最新报告/快照，保留16项原要求。
