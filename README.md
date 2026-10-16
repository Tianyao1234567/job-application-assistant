# Job Application Assistant（开发中）

浏览器插件负责可见的招聘页面操作，本机管理后台管理岗位、计划、资料、问题与结果。目标包括每天自动发现岗位和投递、缺答案时暂停、补答后恢复同一任务。

当前 v0.2.0 仍在开发：已补本地 HTTP 服务、虚构招聘测试站和管理界面交互，正在云端联调与验证。完整流程的实际证据见开发报告，不将单元测试通过当作产品验收。没有真实招聘网站支持或真实申请成功的结论。

- [产品规格](SPEC.md)
- [开发进度与缺项](DEVELOPMENT_SNAPSHOT.md)
- [协作规范](AGENTS.md)
- [云端检查配置](CLOUD_SETUP.md)
- [云端接续任务](CLOUD_HANDOFF.md)
- [迁移状态和协作入口](GITHUB_MIGRATION_STATUS.md)

源码使用原生 JavaScript、HTML、CSS，后台方案为 Node.js 24 的本机 HTTP 服务。`autofill-extension/` 保存 Manifest V3 插件与通用填写引擎；`local-app/` 保存任务模型和初步界面；`scripts/` 保存平台入口；`.github/workflows/` 保存托管检查配置。

Node.js 24，在仓库根目录执行 `node local-app/server.mjs --data-dir .runtime/dev-data` 可启动后台及虚构招聘测试站；安装依赖、检查和隔离浏览器规则见 [CLOUD_SETUP.md](CLOUD_SETUP.md)。

开发与自动测试应在云端继续。本机仅保留未来必要的插件安装、本人登录与真实网站验收。公开仓库不包含个人资料、真实简历、求职表、会话、运行数据或依赖。
