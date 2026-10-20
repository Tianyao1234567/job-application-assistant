# PM-0008 · 最低验收补证（A→B→C）

状态：开发分组交付，完整产品待产品经理验收，PR #4保持draft/WIP。沿用`dev/local-workflow-foundation`，没有从main重做。上一轮9cfe168的虚构招聘站12段已由[PM-0008](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6285637106)阶段验收，PM-0007两项返工已关闭；其失败历史和最终证据保留在`DEV_REPORT_002.md`。本报告记录后续新增证据，不扩大原验收。

开发在Cloud `/workspace/job-application-assistant`、Node v24.19.0/Linux x86_64；浏览器仅在GitHub托管runner、固定Playwright 1.58.2镜像和隔离目录中执行。每组同时只有一个真实浏览器进程，多profile串行切换，不伪造Chrome API/profileId或写入Chrome storage。仅使用虚构账号、资料和本地测试站。未使用用户电脑代跑。

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

开发证据已完成，待PM分组复核；继续已授权C组。

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

进行中，尚未声明浏览器通过。进行中/提交后页面刷新、整站跳过/恢复、其他站继续、隔离目录与证据保密；跨日/错过计划/手动暂停将引用已经实际执行的明确Node测试，不等待一天、不重复无关浏览器组合。

## 16项当前对照

| 项 | 最新实际范围与状态 |
| --- | --- |
| 1 连接/断线/重连 | 原12段阶段验收；A实际跨profile新client、断线与重连通过；其他启动异常主要VM |
| 2 发现/筛选/去重 | 原12段已验收；未适配完整query/hash保留另有Node |
| 3 填写/附件/唯一提交 | 原12段已验收；A恢复后同任务、实际字节摘要及唯一POST/回执再次通过 |
| 4 缺答/补答 | 原12段已验收；B实际原文/scope变化不复用旧答案、纠正同任务提交通过 |
| 5 暂停/接管 | 原12段已验收；B保护负例停止通过，其余异步窗口主要VM |
| 6 未知结果不重投 | 原12段已验收；刷新序列待C |
| 7 持久化/进行中刷新 | 原12段重启已验收；进行中及结果页刷新待C |
| 8 计划/额度 | 原12段额度/手动hold已验收；受控时钟已有Node，C列具体引用 |
| 9 演示/未适配/变化页 | B真实结构/410/人工验证停止、入口adapter/mode拒绝、可控外端所有请求0通过；真实站点未验证 |
| 10 资料/敏感/原值/通用填写 | B真实扩展隔离世界scan/fill不采集凭据值、拒绝敏感映射、保留人工值；问题变化保护通过 |
| 11 登录复查 | A真实未登录3次检查、零写入/上传/提交，登录后原任务恢复通过 |
| 12 profile/会话 | A真实多profile不误认、自然ID切换、有效Cookie保留与主动清除丢失两分支通过 |
| 13 聚合/继续/跳过 | 原12段聚合/任务跳过已验收；整站跳过/恢复待C |
| 14 执行中失效 | 原12段提交后失效只核对已验收；A提交前失效、重新登录同任务唯一提交通过 |
| 15 身份/状态区分 | A账号/unknown/租户/断线/切profile及B未适配/人工验证原因通过 |
| 16 凭据/清理 | B真实虚构凭据标记未采集/填入、未出后台；C补输出及清理路径证据，不冒称真实凭据或生产profile已测试 |

## 边界与下一步

A/B组代码与结果是开发交付，不冒充PM已验收。继续C组，按组记录实际SHA、运行与失败；Windows使用入口、真实招聘站适配、个人账号和真实投递均属后续阶段。GitHub API/Checks可用；日志/ZIP下载域名的旧限制不阻止本轮开发，不要求用户重建环境或本机代跑。CLOUD_HANDOFF第3/4节已标历史并指向最新报告/快照，保留16项原要求。
