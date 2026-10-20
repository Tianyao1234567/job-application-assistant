# DEV-0015 · 本地闭环开发阶段报告

本文保留前阶段实现与失败证据，后续修正和当前验证状态见 [DEV_REPORT_002.md](DEV_REPORT_002.md)。

日期：2026-10-16（北京时间）。状态：WIP，阶段成果待产品经理验收，真实扩展启动仍未通过。基线 `a6e9f1b5fd374659892dfbdba3cb417f42e89b85`；分支 `dev/local-workflow-foundation`；[PR #4](https://github.com/Tianyao1234567/job-application-assistant/pull/4)。首个实现提交 `76748d4f2fc940564fcadbe356f238fc63bec2d4`。不能把以下测试计划视为已执行通过。

## 本阶段实现

- 新增 Node.js 24 本地服务、精确 Host/Origin/配对密钥验证、插件桥接、固定静态资源和状态持久化；后台与招聘测试站只绑定 loopback。
- 新增虚构招聘站：alpha/beta 两租户、真实浏览器原生表单、真实 multipart 附件落盘、接收字节 SHA-256、tenant/job/account 唯一回执。每个实际 POST 单独计数，不能用唯一约束掩盖重复点击。故障注入只在显式测试模式及测试密钥下可用。
- 补齐后台总览、岗位队列/详情、问题补答、网站准备、友好资料和简历上传、设置计划；轮询实际 API，不生成虚假执行结果，保留正在编辑的草稿。
- 修复未知结果核对被拒绝、租约/profile 归属、过期和迟到结果、暂停/跳过恢复、手动带参链接去重、已有任务站点身份不可改写，以及演示初始化覆盖现有任务的风险。
- 执行器完成异步会话/附件预检后再取得最终授权，同步复查结构/原值并写入；提交账本先持久化再最终授权和单次点击。恢复原申请页保留人工内容和附件，回执核对使用独立临时只读页。
- 浏览器证据不再写死 Windows；记录实际 OS、Node 和 Chromium。CI 新增 `workflow` 单项真实扩展回归，限定托管 Linux、隔离 profile、串行浏览器、超时和只含虚构摘要的证据 JSON。

## 当前真实验证与边界

执行地点：Codex Cloud `/workspace/job-application-assistant`，Linux x86_64、Node.js 24.19.0。没有使用用户电脑安装依赖或运行测试。39 个源码/JSON 检查、原有扩展单元 20/20、模型/服务/fixture/执行器 Node 回归 54/54 均已实际执行通过，失败/跳过为0。对应实现提交 `76748d4f2fc940564fcadbe356f238fc63bec2d4` 的[托管基础检查](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/38864810663)和[PR基础检查](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/38864852417)也实际成功。

已实际启动后台及招聘测试站，检查后台 HTML、静态 app/schema/style、未配对 state 返回 401，以及 beta 岗位列表 HTTP 成功。停止服务后保留状态，重启持久化由服务与模型回归覆盖。配对 key、运行数据库、依赖、浏览器 profile 和上传文件都留在 ignored `.runtime/`，不提交。

| 层级 | 当前证据及限制 |
| --- | --- |
| 源码/JSON、已有扩展单元 | Cloud 实际执行；不代替产品闭环 |
| 模型、HTTP 鉴权、真实 multipart fixture | Node 回归实际执行；包含受控时间的计划/额度和提交未知恢复 |
| 执行器异步边界 | Node VM 加载实际 runner/adapter/通用填写引擎；它模拟 Chrome API，单独列出，不能冒称真实扩展 |
| 后台真实网页与加载扩展 | 已执行 GitHub Actions `workflow`，但测试浏览器启动以 SIGTRAP 退出；10段产品流程未通过，不能认定闭环可用，见下方失败证据 |
| 旧 generic/ui-mocked/extension 浏览器套件 | 本阶段尚未运行，不能挪用旧结果 |
| 真实招聘网站、真实个人资料/登录/投递 | 未实现或未验证；无真实申请成功结论 |
| Windows 工具栏、原有 CMD/PowerShell 入口 | 保留源码，未在 Windows 验证 |

## 已观察到的浏览器失败

- [首轮真实扩展运行](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/38864908406)，提交 `6e972e167040a3089efe1acc83008ad82be65854`：源码、20旧单元、54新Node、依赖和浏览器下载成功；真实扩展步骤失败。用户收到的是这次自动通知，不是用户电脑上的错误。
- [结构化错误诊断](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/38894636021)，提交 `039c56511a076035fa80316af69143f7baff8133`：Chromium 在 launchPersistentContext 中提前退出。
- [虚拟显示诊断](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/38894779413)，提交 `6075491264adfd0399bf44155d15b373b6197516`：Xvfb 下有界面启动仍 SIGTRAP，不能归因于 headless。
- [官方系统依赖及固定Ubuntu诊断](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/38894935938)，提交 `e17a37bc887084d047c0be06483f4521f9c79843`：Chromium `--version` 检查通过、依赖安装成功，实际加载扩展仍启动 SIGTRAP。日志中的 cpufreq 路径缺失不能单独证明根因。

- [裸浏览器对照诊断](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/38895132484)，提交 `716d3a0dee46e5ff3825523b5f3172c24c662802`：Google Chrome for Testing **145.0.7632.6** 的 `--version` 成功；实际扩展有界面启动 SIGTRAP 后，顺序启动**不带插件的裸 Chromium**也 SIGTRAP。该运行的源码/单元/Node/系统依赖和浏览器下载步骤均通过。因此当前阻碍已定位到浏览器与托管执行环境组合，尚不能进一步归因于某个系统调用或 Chromium 缺陷，也不能认定产品流程通过。需要在能够实际启动该浏览器的托管环境继续10段验证；不要让用户电脑代跑或以模拟浏览器替代。

完整日志及artifact存储域名目前受环境网络规则限制，已保存精确域名要求；Checks API 的结构化错误注解可读取，以上失败由实际 job/step 和注解确认。没有跳过浏览器测试、删断言或将失败改成成功。当前10段真实扩展检查尚未执行通过，PR保持WIP，属于未完成验收项目。

## 后续验收与配合

真实扩展回归必须证明：实际配对与六页 UI、真实发现/筛选/去重、alpha 登录等待时 beta 继续、全局暂停接管原值保护、多段填写和真实附件摘要、缺答恢复同一任务、提交已接收但丢回执和会话失效、持久 profile/服务重启后只读核对且每岗位只有一个实际请求。

尚未覆盖完整交接16项的所有排列：错误账号、另一个 profile、结构改变和网络故障的部分证据仍属于 Node 回归，不能扩大为完整真实浏览器验收。真实站点接入仍需后续适配与独立验收；目前不需要用户提供真实账号或简历。持续计划要求本地服务与实际执行浏览器运行；关机不能执行。

开发者通过 PR 交付并在 Issue #1 持续记录 DEV 消息；仅产品经理可给出验收结论。Issue 评论尚无自动唤起保证。环境草稿保存不等于已发布快照或验证新任务恢复；不公开私人 Cloud 访问链接。
