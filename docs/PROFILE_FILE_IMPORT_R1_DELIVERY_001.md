# 唯一返工R1交付：未知增量目标记忆

2026-11-02（北京时间）。Engineer接续Manager提交`75fa20b95942a817328e8ffbd2e2c917fc50e29c`的[唯一返工R1](PROFILE_FILE_IMPORT_ACCEPTANCE_001.md)。其余candidate.9已验收范围直接沿用，没有重新实现。

## 源码与当前状态

- 修复/打包源码：`46a28d3ee7402dad992c0fa721e6e01f676cff1e`。
- 分支：`dev/pm9-demo-windows-readiness`；PR #5保持draft，未合并。
- candidate.10固定tag：`v0.2.0-candidate.10-update`；candidate.9原tag及资产保持不变。
- 本地与[同源码托管发布检查41442677046](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41442677046)均通过：16项定点/受影响检查、1条实际界面场景，0失败、0跳过。candidate.10已发布并实际重新下载核验，R1仍待Manager验收。

## 修复范围

`local-app/profile-update.mjs`沿用原state的`profileImportMappings`，为未知增量项记录完整目标路径。内部键由解析后的文件指纹与条目标识构成；条目标识包含原始行位置和内容。相同文件/条目再次导入复用本人明确选定的目标，不根据同名学校、公司或项目猜测归属，不把两个独立条目合并。协议、HTTP保存路径及旧格式记录映射保持原实现。

- 覆盖`field:null`和明确路径中的记录尚不存在两类输入，以及首次匹配已有记录、首次新建记录。
- 只有接受的条目通过目标、限定、冲突与有效值检查后才返回映射；保留、待匹配、被阻止或整批失败不会记住未确认目标。
- 首次选择目标但值已完全相同时，也保存映射；字段变更计数仍为0，不提升profile版本。
- 重载Store/服务后仍读取同一目标；预览显示目标的真实当前值。后续修改仍触发原冲突/旧值/基准版本检查，过期预览仍拒绝整批保存。
- 原目标已删除时保持未匹配，不暗中重建、按名称猜另一个记录，或退回后来出现的原文件路径。本人仍可明确重新匹配。
- 不同文件上下文或不同条目不共享猜测身份；需要重新核对目标。本文没有宣称自动识别被修改、重排或换上下文的文件为同一记录。

## 实际定点验证

源码提交后执行：

```bash
node --test local-app/tests/profile-update-target-memory.test.mjs local-app/tests/profile-update-target-store.test.mjs local-app/tests/profile-update-package.test.mjs
```

**16通过，0失败，0跳过**：9项纯函数、5项真实state持久化/Store重载、2项本次版本实际受影响的打包及精确candidate.8基线识别。覆盖无目标/缺记录、已有值首次无变化确认、独立同名条目、重复幂等、目标修改/删除、基准/旧值/过期保护、无效输入及旧格式键保持。

**1条真实界面场景**：实际后台“选择资料文件”读取虚构`field:null`文件 → 本人点击新建项目、选择title并确认 → 重启真实HTTP服务和Store → 再通过文件选择器选择同一文件 → 界面直接选中原目标 → 再次批量确认。实际POST两次成功，计数分别1、0；项目一直1条，资料版本一直v1，持久映射及原附件字节/元数据保持，申请任务/授权为0。脚本：`local-app/tests/profile-update-target-browser.mjs`；工作区实际Chromium154通过。托管环境使用原锁定Playwright1.58.2/Chromium145，只运行这一条新场景。

已通过的candidate.9同源码42项/5场景，以及未改动的PDF、Greenhouse、Windows、MV3和更新器保护沿用[原验收](PROFILE_FILE_IMPORT_ACCEPTANCE_001.md)及[原交付证据](PROFILE_FILE_IMPORT_DELIVERY_001.md)，没有重跑旧全套、录屏或向真实企业申请。

## 单文件更新及兼容性

候选版本为`0.2.0-candidate.10`，继续沿用candidate.5/6/8三个已知基线及原更新器引擎；没有放宽已安装程序/资料/浏览器核验。对candidate.8变化9文件，变化并集28文件，目标清单73文件，不包含私人资料、依赖、运行数据或浏览器。

发布流程在同一源码的16项检查及唯一界面场景通过后，从固定tag重新构建并发布ASCII文件名`update.cmd`及可选校验元数据。已实际从公开release地址重新下载：

- **[单个update.cmd下载](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.10-update/update.cmd)**；[发布页](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/v0.2.0-candidate.10-update)。
- **285351字节**；SHA-256 **`f347642c603115533762e803289158bd562b1c663d8151f5efaa9919f029eddd`**。
- 下载字节与同一提交的本地构建逐字节一致；[UPDATE.json](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.10-update/UPDATE.json)的来源、大小、摘要及candidate.8基线匹配。
- [VERIFICATION.json](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.10-update/VERIFICATION.json)关联源码`46a28d3`和运行`41442677046`，16项全通过、0跳过，唯一界面场景在Linux / Node24.22.1 / Chromium145.0.7632.6执行；两次真实确认分别变更1项、0项，重启后项目数1、profile版本v1。

用户不用先安装candidate.9。Manager定点验收后，正常运行“停止.cmd”，把本次`update.cmd`放在实际“启动.cmd”同级运行；看到`UPDATE_COMPLETE`后用原“启动.cmd”打开，在“资料与简历／选择资料文件”选择已有JSON核对保存。保留现有完整目录、隐藏`.runtime`、资料、附件、答案、任务和浏览器，无需重装或另下载浏览器。

## 剩余与下一步

R1交付须由Manager定点验收；不冒充验收结论。Manager通过后再让用户一次更新、选择已有JSON核对保存。普通资料变化后续只换JSON，无需再次打程序包。用户目前仅确认安装candidate.8，本次未操作其电脑或确认本人资料已导入。PR #5保持draft；首次真实申请必须由本人确认岗位、资料、附件和提交动作，unknown只核对、不重投。
