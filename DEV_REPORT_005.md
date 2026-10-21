# PM-0010 修复与第四范式只读预研

日期：2026-10-21（北京时间）。接续`dev/pm9-demo-windows-readiness` / PR #5；base仍为`dev/local-workflow-foundation`，PR #4/#5未合并，开发交付待PM验收。需求依据：[PM-0010](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6309088895)，开工记录DEV-0033。

PM已接收旧候选完整性、Windows后台9项和公开入口准备，已独立核实旧演示真实性；原云端虚构站16项验收继续有效。本报告只补本轮改动，不把既有通过数改称本轮重跑。

## 修复范围

- **F1**：管理台、直接Windows后台与CMD共用受管理的浏览器入口、启动锁、归属PID与关闭机制。依赖检测保留；就绪须实际扩展profile与新鲜心跳，停止期间禁止新开浏览器。关闭后台会回收项目执行浏览器，错误PID不结束其他程序。管理台显式打开等待45秒、有界且不自动重放。新增托管Windows实际可见浏览器与扩展的UI/CMD两条测试路径。
- **F2**：从实际详情标记读取标题、公司、城市，校验同租户/岗位/详情来源后仅合并白名单字段。同任务补答、结果、重启保留资料；手动后发现补充同任务，不重置提交边界。恢复时临时只读详情页不触碰保留的申请表、原值或File；未知资料继续未知。更新演示与最终PNG像素遮罩验证。
- **F3**：安全检查后的完整URL供导航和去重；公开摘要单独脱敏/截断。query/hash/长链接保留完整身份，凭据或不合适目标拒绝。校招完整href补正出处见[校正说明](docs/PM0010_URL_CORRECTION.md)，不倒改1118d9f的历史观测。

## 当前源码构建时的验证记录

Cloud工作区为`/workspace/job-application-assistant`，Linux / Node24.19.0；没有使用用户电脑安装、下载或运行测试。Cloud上本轮基础检查为61项源码/JSON、165项Node应用测试、20项原schema/保护测试，全部通过；源检查与测试计数分别报告。托管运行、候选来源和最终结果在本报告后续交付更新中补充；这个源码快照不预先宣布尚未发生的Windows或演示通过。

第一次真实公开浏览器：[39587500605](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39587500605)，来源`80ca5b91f1947b853e4d4d354a3d50ef4a0b3601`。workflow/browser success表示观察脚本完成，实际发现结果为STOPPED/NAVIGATION_TIMEOUT。实际已取得官网人才页200、正确标题、1958字符正文及Moka出链；脚本等待DOMContentLoaded超时却提前停止，属于需要修复的等待条件，不能据此声称官网不可读或列表验证完成。

## 候选、演示与未验证边界

本轮版本`0.2.0-candidate.2`，须使用本轮Git来源生成的新包；candidate.1旧摘要只作历史，不证明修复代码。只打包allowlist Git源码与SOURCE，不含依赖、runtime、资料、会话或图像。短期演示图仍只在显式选择的独立artifact，普通自动检查不截图。

旧演示图05漏出隔离任务UUID的事实保留，PM曾逐张查看旧7张图。旧artifact不改称遮罩通过。新演示必须校验最终PNG实际遮罩区域像素；脚本自动检查不等于开发者逐张人工视觉复核，也不代替PM验收。

真实站只读观察不注册、不填表、不上传、不投递。公开列表、详情、稳定岗位ID与自动申请分别报告；未经观察的页面不猜API或构造解析器。真实账号、本人Windows现场与真实投递未验证。当前无需用户配合；众行机器人身份待确认、不追问、不替换近名公司、不阻塞其余工作。后续若实际需要本人登录，由PM一次性组织同执行profile的必要步骤，不索要密码/验证码/Cookie。

## 托管Windows首轮：后台通过，浏览器测试辅助进程失败

运行[39588110817](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39588110817)，来源`e7d5d5b1d6e968adc5de1e4962c4d1234178906f`。source-and-unit与candidate-package成功；[candidate-windows 119183469665](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39588110817/job/119183469665)后台9项全部通过，实际59个源码文件经Windows原生解包逐项摘要核验。

候选candidate.2 ZIP 434624字节，SHA-256 `ca7f817bd747eb6b8744958892215b06b9df3753fb6b3e8c8008769c0facaf38`，与Cloud独立生成值相同。此轮为真实失败历史，后续最终候选应以最新实际运行来源为准。

托管Windows实际安装锁定Playwright与Chromium145.0.7632.6/revision1208后，第一条场景在外层Node等待PowerShell辅助进程管道关闭时达到100秒`HELPER_TIMEOUT`；尚无已完成的可见浏览器场景，不能把脚本声明的headed/realExtension字段当实际通过。问题定位为背景后台继承外层输出管道，等待`close`仍依赖EOF。修复为受控普通文件捕获输出、等待辅助进程自身`exit`和有界快照读取，补固定操作/耗时诊断后再实际运行。后台9项不受此测试辅助问题推翻。最终`managedCleanup=true`、`cleanup=true`，保留失败事实，不报整轮成功。
