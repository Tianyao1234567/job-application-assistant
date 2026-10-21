# Job Application Assistant

浏览器插件负责可见的招聘页面操作，本机管理后台管理岗位、计划、资料、问题与结果。目标包括每天自动发现岗位和投递、缺答案时暂停、补答后恢复同一任务。

PM-0009 已验收 v0.2.0 在 Linux 云端、实际加载扩展、虚构招聘站的16项最低闭环及 A/B/C 补证。PM-0010修复后，托管Windows可见浏览器4项与后台9项实际通过，新7图演示通过，交PM复核。本人Windows现场、个人登录和真实投递尚未验收；自有测试站的303刷新修复不代表任意真实站已防重放。

现在无需在用户电脑安装、下载浏览器、运行测试或注册账号。先查看本轮独立短期演示 artifact、候选包及清单，由 PM 组织下一次轻量试用。

本轮沿PR #5交付candidate.2：192项基础测试、63项源码检查，Windows后台9/9及实际可见扩展浏览器4/4通过；新演示核实手动岗位资料与重启、图05最终像素遮罩，实际申请/接收/回执各1。第四范式公开招聘只读结果、各自来源SHA、短期artifact及失败历史见 [DEV_REPORT_005.md](DEV_REPORT_005.md)，不把研究或虚构站通过称为真实投递已支持。

- [产品规格](SPEC.md)
- [开发进度与缺项](DEVELOPMENT_SNAPSHOT.md)
- [可靠性与自检优化报告](DEV_REPORT_002.md)
- [已验收云端闭环与16项证据](DEV_REPORT_003.md)
- [演示、Windows候选和真实站准备交付](https://github.com/Tianyao1234567/job-application-assistant/blob/dev/pm9-demo-windows-readiness/DEV_REPORT_004.md)
- [PM-0010修复与云端实证](DEV_REPORT_005.md)
- [Windows候选版中文使用说明](WINDOWS_START_001.md)
- [候选源码包与校验清单](CANDIDATE_PACKAGE.md)
- [协作规范](AGENTS.md)
- [云端检查配置](CLOUD_SETUP.md)
- [云端接续任务](CLOUD_HANDOFF.md)
- [迁移状态和协作入口](GITHUB_MIGRATION_STATUS.md)

源码使用原生 JavaScript、HTML、CSS，后台为 Node.js 24 的本机 HTTP 服务。`autofill-extension/` 保存 Manifest V3 插件与通用填写引擎；`local-app/` 保存任务模型、后台和虚构站；`scripts/` 保存平台入口；`runtime-deps/` 只锁定 Playwright 1.58.2 运行依赖，不安装原 React/Vue 测试框架；`.github/workflows/` 保存托管检查配置。候选源码包不带 Node、依赖或 Chromium。

Node.js 24，在仓库根目录执行 `node local-app/server.mjs --data-dir .runtime/dev-data` 可启动后台及虚构招聘测试站；安装依赖、检查和隔离浏览器规则见 [CLOUD_SETUP.md](CLOUD_SETUP.md)。

开发与自动测试应在云端继续。本机仅保留未来必要的插件安装、本人登录与真实网站验收。公开仓库不包含个人资料、真实简历、求职表、会话、运行数据或依赖。
