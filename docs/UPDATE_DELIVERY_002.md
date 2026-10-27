# 更新交付002：中断数据保护与已搬迁安装修复

Engineer于2026-10-27交付，**已通过[Manager验收](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6436876477)，本轮无新增返工**。针对[自动恢复P1](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6409613028)及[用户Windows诊断](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6435687994)，沿用原分支、PR #5和已接收功能，不重新建设更新平台。

## 新下载

[直接下载新版update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.8-update/update.cmd)，[发布页及UPDATE.json](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/v0.2.0-candidate.8-update)。旧candidate.7的240077字节更新文件继续停用，由本文件取代。

- 运行及更新文件来源：`bdd06e8aa17aa0e6dd433691cbbe399bebe41d7b`，`0.2.0-candidate.8`。
- 单文件247007字节；SHA-256：`d32f5f22069649ca97b36cc398d457e57f4aa6406c6a9eb31b467f462ffcf13e`。
- 支持已知candidate.5 / `3856a49a78852c4729a6be4d64f01f19acdcd1c3`和candidate.6 / `38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac`。差异并集25个程序文件，目标71文件；相对两个基线分别25、13项变化。无浏览器、依赖、运行数据或私人资料进入下载文件。
- 一次下载，无需解压、安装更新器、重装环境或手动合并程序目录。下载名为`update.cmd`，直接使用，不必改中文名。

## 已搬迁用户的步骤

保留当前完整目录及隐藏`.runtime`、`runtime-deps`、浏览器配置与全部剩余文件。将新版`update.cmd`放到实际“启动.cmd”同一级，双击；无需回到已删除的旧目录或启动旧版补停止标记。更新器会在本机核对剩余进程归属、端口、浏览器配置及附件完整性，证据完整后冷备份、安全暂停并更新。看到`UPDATE_COMPLETE`后，再由用户正常启动原入口并核对资料和执行端。详见[具体操作及失败处理](../UPGRADE_001.md)。

已收到的state布尔值和无事务诊断被直接用于修复设计，没有重复要求用户收集。它们不证明旧进程已退出或全部资料完整，因此仍须本机核验；发现原进程存活、端口/配置被占、必要文件缺失或身份不明会保留原数据并明确报错，不按旧PID杀程序、不猜测重建个人资料。无须提供真实PDF、Cookie或完整私人日志。

## 自动中断恢复的数据保护

所有自动prepared/writing恢复及当前失败回滚，均在写入前比较活动全state、完整浏览器/扩展配置，以及程序/SOURCE/安装标记与原始或事务明确记录的目标快照。目标state、profile文件树在相应生产写入前持久保存；不是仅凭phase判断。旧日志缺少新字段时，只允许能由原始备份证明的未变化状态。新增后台资料、答案、扩展profile/mappings/attempts、Cookie或不明变化均拒绝覆盖，保留活动数据、事务及备份。

未变化的prepared/writing中断可正常恢复并重试。恢复过程中profile暂存或已恢复但日志未完成的既有路径保持有效；备份损坏仍拒绝写入。来自不同更新来源、无法核验的旧事务安全拒绝，不进行猜测性恢复。

## 离线静止证明与安全暂停

正常停止路径继续保留。对本次已知`manualPaused=false / paused=true / running=false`、无server.stopped、无事务的搬迁状态，新增verified-offline分支：

1. 核对已知程序基线、原附件路径及新文件大小/SHA、原扩展路径ID和存储归属。
2. 完整CIM进程核验：排除新旧根存活进程，拒绝不完整字段/无法确认归属；不同Node安装位置仍按精确项目入口识别。独占核对17321/17322端口。
3. 持有更新及启动锁，并持有Chromium实际production/lockfile的写锁；CIM成功/空端口不足以代替浏览器配置锁。所有核验结果在事务quiescence中记录为verified-offline，不伪造正常退出标记。
4. 核验原始state和完整浏览器冷备份，再事务化设置安全暂停。普通running任务回inspect，已有提交边界保持或转unknown/verify，taskId/profileId、版本、答案及提交尝试不重写。
5. 离线失败恢复原程序和浏览器，保留暂停并恢复原附件/扩展归属的配对，允许同一文件再次核验重试；不能因rollback重新解除hold。显式restore也忽略本次已知安全暂停差异，但仍拒绝真正新增的后台或扩展资料。

原扩展数据迁移、旧页面证据归档、新固定ID实际心跳、PDF组件补充和原浏览器复用机制沿用已接收实现。未知结果不重投，不自动启动申请，不改变筛选或额度。

## 定点证据

[最终CI 40466396284](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/40466396284)，来源与下载文件同为`bdd06e8aa17aa0e6dd433691cbbe399bebe41d7b`，全部通过。

- 23项新增定点检查：10项自动prepared/writing恢复（新增后台/扩展数据、旧日志、未变化正常恢复），13项离线证明/暂停/缺证拒绝/失败保护/搬迁失败后重试/显式恢复/不完整进程信息检查。真正中断场景由独立Node进程在实际事务边界退出产生日志。
- 3项受影响回归：写入/依赖失败恢复、profile还原中断后继续、损坏备份拒绝。未跑旧14项全套。
- 两条GitHub-hosted Windows 2025实际新增分支，candidate.5/6各一条：旧实际配对作为虚构fixture准备；设置上述诊断状态、删除正常停止标记、无事务、完整移至新根且旧根不存在；运行真实单文件→核对原资料/答案/附件字节与摘要/版本/原state备份→正常启动新实际扩展、原profileId/账本及fresh heartbeat。两条各自通过旧路径脚本已删除但Node仍活、无关程序占端口、真实Chrome配置锁三项拒绝，辅助进程未被终止，数据无变化。
- 更新器不造server.stopped，journal实际记录verified-offline；安全暂停保留，unknown的恢复请求实际HTTP400，旧outbox/上传/回执证据保留在归档。原浏览器二进制SHA不变，申请POST为0。公开证据仅虚构数据、布尔结果和包摘要。
- Windows输出文件摘要与交付工作区重建结果一致。[托管发布40467023410](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/40467023410)从同一已测SHA重建并校验固定大小和摘要后上传；GitHub资产服务端digest与上述SHA-256一致。CI artifact `update-repair-evidence`含新单文件、UPDATE.json及windows-update-repair.json，Checks注释含无私人路径的场景结果。

沿用candidate.7已接收正常搬迁/再次启动、candidate.6的43项/6场景及Greenhouse历史证据，未重跑旧两条完整流程、旧全套、MV3或录屏。没有使用本人资料或向企业提交申请。用户本机未由本会话操作；实际删除范围尚未知，已被删除而无备份的个人资料不能由更新器重建。PR #5继续draft，不合并。
