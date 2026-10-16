# 云端开发与检查入口（开发中快照）

本文件只交付已保存的配置。尚未有可核验的远端仓库、Codex Cloud 任务或 Actions 成功运行时，不代表迁移已完成。实际状态以 `GITHUB_MIGRATION_STATUS.md` 为准。

## 自动检查

`.github/workflows/cloud-checks.yml` 使用 GitHub 托管的 `ubuntu-latest`、Node.js 24，每个仓库同一时刻仅一个工作流运行，后来的运行取消旧运行，单次最长 10 分钟。没有 self-hosted runner、测试矩阵、真实账号、生产会话或用户资料。仓库令牌只有读取代码权限，不持久化到 checkout。

push 和 PR 默认仅执行以下必要检查，不安装测试依赖、不下载浏览器：

```sh
node scripts/cloud-check.mjs
cd autofill-extension
npm test
```

第一步按源码目录逐个检查 JS 语法、JSON 及 NUL 损坏，不启动服务。第二步只运行现有资料校验、匹配和保护单元测试。初始快照的本地服务与测试站尚未集成，单元通过不能证明完整投递通过。实际结果必须引用 Actions 运行链接和提交 SHA。

## 按需的一项浏览器回归

仅在 GitHub 的 Actions 页面手动选择 `Cloud checks` → `Run workflow`，将 `browser` 从 `none` 改为一项。工作流先完成默认检查，再从锁文件安装 Playwright 1.58.2 等现有测试依赖，仅在云端下载完整 Chromium，按选择执行一个脚本，不并行运行：

- `generic`：真实 DOM 通用填写、原值保护和结构变化回归，不是安装扩展验收。
- `ui-mocked`：实际页面、模拟 Chrome API 的旧管理界面回归。
- `extension`：实际加载扩展、旧资料导入导出和独立测试配置重启。它不覆盖新本地后台完整投递，也不证明真实招聘站兼容。

浏览器步骤的云端命令为：

```sh
cd autofill-extension
npm ci --ignore-scripts --no-audit --no-fund
node node_modules/playwright/cli.js install chromium --no-shell
cd ..
CLOUD_BROWSER_CHECK=generic node scripts/cloud-check.mjs browser
```

最后一个命令仅允许在 Linux Actions 环境执行，`generic` 可以替换为其他单项。项目生成的缓存、临时文件、下载、测试浏览器配置位于 checkout 内 `.runtime/`；结果 JSON 位于 `test-results-001/`。这些内容不提交回仓库。默认工作流不上传任何浏览器会话或整目录产物；需要证据时只选取检查过且仅含虚构数据的结果。

## 继续开发的位置

完成仓库连接后，在 Codex 的云端工作入口选择该仓库和分支，并记录真实云端任务入口、提交及运行结果。Windows 启停脚本只保留为将来本机验收入口，Linux 云端不调用 PowerShell、Win32_Process 或 node.exe。不能因为 GitHub 已有代码就声称本机对话已变成云端任务。Codex Cloud 连接操作由迁移负责人按当前实际可用界面核实。

真实 Windows 插件安装、可见执行浏览器、本人登录与真实网站行为仍待按需本机验收。真实投递运行地点没有随开发迁移自动改变。

## 配置依据

2026-10-16 轻量核对了官方 [checkout v6](https://github.com/actions/checkout/tree/v6)、[setup-node v6](https://github.com/actions/setup-node/tree/v6) 和 [并发控制说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。本快照使用官方 v6 标签；未冒充已固定不可变提交 SHA。后续可在云端核验官方标签对应的提交后固定 SHA。工作流写入不等于已运行成功。
