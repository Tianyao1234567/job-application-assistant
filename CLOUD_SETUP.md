# 云端开发与检查入口（开发中快照）

本文件只交付已保存的配置。尚未有可核验的远端仓库、Codex Cloud 任务或 Actions 成功运行时，不代表迁移已完成。实际状态以 `GITHUB_MIGRATION_STATUS.md` 为准。

## 自动检查

`.github/workflows/cloud-checks.yml` 使用 GitHub 托管的 `ubuntu-24.04`、Node.js 24，每个仓库同一时刻仅一个工作流运行，后来的运行取消旧运行；每个作业最长 10 分钟，基础检查与按需浏览器作业依次执行。没有 self-hosted runner、测试矩阵、真实账号、生产会话或用户资料。仓库令牌只有读取代码权限，不持久化到 checkout。

push 和 PR 默认仅执行以下必要检查，不安装测试依赖、不下载浏览器：

```sh
node scripts/cloud-check.mjs
cd autofill-extension
npm test
cd ..
node --test local-app/tests/*.test.mjs
```

源码检查不启动服务。扩展单元检查资料校验、匹配和保护；`local-app/tests/*.test.mjs` 检查模型、HTTP 鉴权、真实 multipart 接收和执行器异步预检边界。这些 Node 检查不能代替真实扩展流程；实际结果须注明执行地点、提交与 Actions 链接。

## 云端启动开发服务

使用现有 checkout，不需要另建 worktree。执行扩展需要 Chromium 116+（以精确扩展页面上下文注册，不增加宽泛 tabs 权限）。Node.js 24，在仓库根目录执行：

```sh
node local-app/server.mjs --data-dir .runtime/dev-data
```

后台仅监听 `127.0.0.1:17321`，虚构招聘测试站监听 `127.0.0.1:17322`；Ctrl+C 同时关闭服务，数据保留。配对密钥在数据目录内生成，不写进版本库或日志。`/` 应返回包含配对 meta 的后台 HTML；未经配对的 `/api/state` 必须返回 401。这不代表插件已连接。后台显示实际连接和任务状态；演示资料只能显式初始化到没有任务的新数据目录。

云端自动化浏览器仅使用 GitHub 托管 Actions 的隔离 profile；不要启动或清空 `.runtime/browser/production` 来跑测试。Windows 原有启动入口保留给未来本机验收，本轮没有在 Windows 执行验证。真实网站仍待适配。

## 按需的一项浏览器回归

仅在 GitHub 的 Actions 页面手动选择 `Cloud checks` → `Run workflow`，将 `browser` 从 `none` 改为一项。工作流先完成默认检查，再启动官方 Playwright 1.58.2 Noble 镜像中的浏览器作业，从锁文件安装测试包。镜像固定为已核对的 amd64 digest `sha256:65cefd09a5e943921ecd3a6e5414c603db2eb161e9eb48f2e2ccc63486dc7dc0`，只在手动浏览器请求时拉取；普通 push/PR 不拉镜像。镜像已有 Chromium 与系统依赖，不重复下载或 apt 安装。按选择执行一个脚本，不并行运行：

- `generic`：真实 DOM 通用填写、原值保护和结构变化回归，不是安装扩展验收。
- `ui-mocked`：实际页面、模拟 Chrome API 的旧管理界面回归。
- `extension`：实际加载扩展、旧资料导入导出和独立测试配置重启。它不覆盖新本地后台完整投递，也不证明真实招聘站兼容。
- `workflow`：实际后台按钮配对、真实加载扩展、本地虚构岗位、多段填写、真实 multipart 附件、补答、暂停接管、会话失效及未知结果重启核对；它不证明真实招聘网站兼容或 Windows 安装通过。

可以通过已授权的 GitHub CLI 调度开发分支，例如：

```sh
gh workflow run cloud-checks.yml --repo Tianyao1234567/job-application-assistant --ref dev/local-workflow-foundation -f browser=workflow
```

容器作业先执行 `node scripts/cloud-check.mjs container-browser`，校验包版本、镜像环境与 Chromium revision，只把镜像的 Chromium 复制到 checkout 的 `.runtime/browsers`，逐文件核对 SHA-256 和执行权限，拒绝外逸符号链接。它保存复制校验证据。随后在虚拟显示中运行 `xvfb-run --auto-servernum node scripts/cloud-check.mjs browser`，具体单项由作业的 `CLOUD_BROWSER_CHECK` 指定。`workflow` 实际加载扩展，使用有界面 Chromium；其他旧单项维持原有模式。浏览器独立启动失败时先定位运行环境，不能把未进入的产品检查报为通过。

同一份checkout额外挂载到容器短路径 `/workspace`，作业验证它与原工作区是同一目录。脚本从该路径解析项目根，临时文件仍在仓库的 `.runtime/tmp`。这是为避免 Chromium 的临时 Unix socket 路径达到 Linux 的108字节限制；启动预检按UTF-8字节计算，并在超限时给出明确错误。不要将临时目录改成长的默认 runner 路径，也不要把运行数据挪到用户目录或生产profile。

浏览器执行仅允许在 Linux Actions 环境。项目生成的缓存、临时文件、测试浏览器配置位于 checkout 内 `.runtime/`；旧回归结果 JSON 位于 `test-results-001/`，新 `workflow` 结果为 `.runtime/tests/evidence/workflow-browser.json`，镜像复制证明为同目录 `container-browser.json`。这些内容不提交回仓库。`workflow` 仅上传这两份经过字段限制的结果 JSON，保留7天；不上传配对密钥、资料正文、会话、截图或整目录产物。

## 继续开发的位置

完成仓库连接后，在 Codex 的云端工作入口选择该仓库和分支，并记录真实云端任务入口、提交及运行结果。Windows 启停脚本只保留为将来本机验收入口，Linux 云端不调用 PowerShell、Win32_Process 或 node.exe。不能因为 GitHub 已有代码就声称本机对话已变成云端任务。Codex Cloud 连接操作由迁移负责人按当前实际可用界面核实。

真实 Windows 插件安装、可见执行浏览器、本人登录与真实网站行为仍待按需本机验收。真实投递运行地点没有随开发迁移自动改变。

## 配置依据

2026-10-16 轻量核对了官方 [checkout v6](https://github.com/actions/checkout/tree/v6)、[setup-node v6](https://github.com/actions/setup-node/tree/v6) 和 [并发控制说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。本快照使用官方 v6 标签；未冒充已固定不可变提交 SHA。后续可在云端核验官方标签对应的提交后固定 SHA。工作流写入不等于已运行成功。

## PM-0008 分组补证

本节为PM-0009已接受的云端虚构站基线；不重复扩大同类测试。下一阶段独立分支及演示/候选/Windows/真实站准备见DEV_REPORT_004，PR #4保持未合并状态。

`browser=acceptance-a` 在同一固定镜像中串行运行真实隔离profile的登录/身份/会话补证，脚本为`local-app/tests/acceptance-a-browser.mjs`。不扩展原12段脚本，不在本机下载或运行浏览器。每组300秒上限，共享仓库并发限制和10分钟作业上限；最终字段受限Checks汇总与`acceptance-a-browser.json`提供独立证据。最新被测SHA、运行与其他组状态见`DEV_REPORT_003.md`。

`browser=acceptance-b` 单独运行`local-app/tests/acceptance-b-browser.mjs`的真实保护负例，限制与A组相同。输出只包含固定场景/布尔事实/计数，不包含scan原始数据、答案、凭据或人工原值；独立可控未适配端统计所有请求，原生申请HTTP计数在fixture来源检查之外观察。最终结果保存`acceptance-b-browser.json`并提供Checks汇总。

`browser=acceptance-c` 单独运行`local-app/tests/acceptance-c-browser.mjs`，覆盖进行中后台/申请页刷新、原生提交结果页实际GET刷新、runner/profile/服务重启、整站跳过恢复与其他站继续。保存`acceptance-c-browser.json`。执行结束关闭浏览器/服务后仅删除本次隔离子目录，并验证目录消失；默认不保存截图/录像。公开JSON递归过滤私有字段、编码前擦除已知key/profile身份及注册的虚构凭据/Cookie/完整资料标记，保存后回读检查。公开Checks只给出布尔审计结果和受限事实，不上传原始profile或目录。

## PM-0009 独立交付选择

同一Cloud checks工作流在已验收head派生的独立分支上提供以下显式手动选择，普通push/PR仍只做源码和必要Node检查，默认不截图、录像或调研外网。

- `browser=demo`：固定Linux镜像中实际加载扩展，明确的虚构演示，最多一个浏览器实例；仅成功审查后上传精简PNG、离线index和manifest到独立`fictional-demo-reviewed` artifact，保留3天。默认测试行为不变。
- `browser=source-package`：从明确Git allowlist构建候选ZIP、SOURCE和校验文件并回读验证，artifact保留7天；不打入运行数据或依赖。
- `browser=windows-candidate`：构建同SHA候选包，然后在GitHub托管Windows runner通过原生Expand-Archive和逐项摘要验证，再实际执行受控副本中的CMD/PowerShell后台检查，证据保留7天。它不安装或启动可见浏览器。
- `browser=site-readiness`：托管Linux上受限公开GET调研，带超时、响应大小和并发限制，不登录、不注册、不投递；来源身份、ATS空壳、重定向或失败须另行人工解释，HTTP200不自动算核实。
- `browser=candidate`：同次有界任务组合上述交付；仅演示子任务会开浏览器。各结果和未执行/skipped作业仍分别报告。

新候选运行依赖单独放`runtime-deps`，只锁定Playwright 1.58.2；源码/JSON检查也覆盖该目录。开发测试仍用完整Git checkout的原依赖。用户当前无需运行本机安装/测试。
