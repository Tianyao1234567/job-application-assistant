# 候选源码包与文件校验

本轮候选版本为 `0.2.0-candidate.2`，包含PM-0010修复；来源SHA、实际生成包和本轮Windows浏览器结果以DEV_REPORT_005为准，不能沿用candidate.1旧包。这是待复核的源码候选包，不含已安装的 Node、浏览器、运行依赖或个人数据。能解压和通过文件校验不代表 Windows 可见浏览器已安装、真实招聘站已接入或已经可以真实投递。当前无需在用户电脑运行旧“安装运行环境.cmd”；先查看演示及本轮报告，由 PM 组织后续轻量试用。

本轮实际交付：[source-candidate artifact12342167482](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39591700007/artifacts/12342167482)，来源`a605bb1be89250a48a027e94134bf82c49d6debc`，59个源码文件加SOURCE。内层ZIP444113字节，SHA-256 `46b46ce813bc92ad772dd9a422d3b5f7051b0c2f958b3494426d523edc5c0305`，北京时间2026-10-28 19:24:39到期。实际Windows原生解包核验、后台9项及可见浏览器4项均通过，待PM验收。包内文档为打包时快照，构建后结论见仓库最新报告；研究脚本与测试工具仍只在完整开发仓库，不在运行源码候选中。

## 来源与内容

生成入口是 `node scripts/package-candidate.mjs build`，只从当前已提交 `HEAD` 的明确文件清单读取 Git blob，不打包工作树修改或未跟踪文件。来源必须延续 PM-0009 已验收 head `b6cfdee0bbded79010bb97866fd1ad538275270f`；CI 需要取得该祖先对象，不能只取一个无历史的浅提交。缺少已提交的 `WINDOWS_START_001.md` 等必需文件会直接失败，不生成“说明以后补”的包。

包内包含实际扩展、后台及其本地虚构招聘站、管理界面、Windows 入口、直接运行 Node 的跨平台入口、中文说明及本校验脚本。`profile.example.json` 是产品演示所需的仓库虚构样例，不是用户资料。候选安装只使用 `runtime-deps` 的锁定运行依赖。原扩展 `package.json` 保留其 `type:module`；其中 React/Vue 等旧测试依赖不参与候选安装。

这是清单内的运行源码候选，不是完整开发checkout；Cloud测试命令、旧开发测试依赖及未包含的历史材料应在完整仓库中使用。

清单排除 `.runtime`、`node_modules`、测试目录/输出、缓存、日志、截图/录像、真实资料、密钥及浏览器配置目录；即使这些路径被意外加入 Git，也不在候选 allowlist 内。不会通过归档整个仓库把运行数据一起带入。演示图像是另一份短期托管 artifact，不在本包或源码 Git 历史中。

输出目录为 `.runtime/delivery/0.2.0-candidate.2-<来源SHA前12位>/`：

- `job-application-assistant-0.2.0-candidate.2-<来源SHA前12位>.zip`：UTF-8 源码 ZIP，内部单个 `job-application-assistant/` 目录。
- `SOURCE.json`：与 ZIP 内同名文件完全一致，记录完整来源 SHA、验收基线 SHA、候选版本、依赖边界，以及每个源文件的相对路径、字节数和 SHA-256。生成的 SOURCE 本身不递归计入自身清单。
- `SHA256SUMS.txt`：ZIP 与 SOURCE 的独立 SHA-256。浏览器下载后可据报告中同来源 SHA 的 CI 校验值核对。

同一 Git 来源生成相同字节的 ZIP。生成后会回读 ZIP，逐项检查文件名、CRC、文件大小、SHA-256 和完整清单，再报告通过。不会因此启动后台、安装依赖或浏览器。

## 云端核验

在仓库中使用 Node 24：

```sh
node scripts/package-candidate.mjs verify <候选ZIP路径> --source <完整来源SHA>
```

需要供托管 runner 做进一步实际启动检查时，可以增加 `--extract <仓库内.runtime/delivery/下不存在的新目录>`。校验全部通过后才解压；拒绝路径穿越、未知文件、符号链接条目和已有目标目录，避免覆盖运行状态。校验结果检查的是所给包与其清单、来源标记的一致性；对应发布者和源码的依据仍是报告中实际 CI 来源及公开提交，不把内部摘要当成独立签名。

## 运行依赖与试用边界

- 后台只需要 Node.js 24；在候选根目录执行 `node local-app/server.mjs`，服务仅监听本机 17321/17322。Node 命令可跨平台，Windows 日常入口见实际存在的 [WINDOWS_START_001.md](WINDOWS_START_001.md)。
- 可见执行浏览器需要 `runtime-deps/package-lock.json` 锁定的 Playwright **1.58.2** 及其固定 Chromium revision。首次准备需要 npm 下载锁定包、再由 Playwright 下载对应平台的 Chromium；候选 ZIP 不含这些下载。上游 `fsevents` 只是 macOS 可选依赖，Windows 不安装它。
- 依赖放在 `runtime-deps/node_modules`，下载的 Chromium、临时目录、任务数据及专用 profile 均在项目 `.runtime`。不会修改全局 npm 或清理用户已有浏览器。
- 日常执行需要本地后台与一个专用执行浏览器保持运行。关闭浏览器不等于停止后台；停止入口保留任务、设置和专用登录目录。停止时未知结果仍只核对，不重投。
- 托管 Windows 的路径、依赖检测和服务启停证据，与用户电脑可见浏览器/真实账号验收分别记录。云端演示进程和内存只作该 runner 的参考，不承诺用户机器相同占用。

实际包、演示、Windows 验证与未验证项目以本轮 [DEV_REPORT_005.md](DEV_REPORT_005.md) 和独立 PR 的运行链接为准；此文件不预先声称尚未完成的运行通过。
