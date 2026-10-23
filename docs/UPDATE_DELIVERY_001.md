# 更新交付001：单个更新.cmd与完整目录搬迁

Engineer交付，**待Manager验收**。任务：[2026-10-23单文件更新＋搬迁修复](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6360792701)。PR #5保持draft，未合并。用户本机尚未由本会话操作；真实企业申请仍未执行或授权。

## 下载与来源

- **直接下载一个[更新.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.7-update/%E6%9B%B4%E6%96%B0.cmd)**；[发布页及校验文件](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/v0.2.0-candidate.7-update)。无需解压源码包或先安装更新器。
- 版本：`0.2.0-candidate.7`。运行/更新文件来源：`ffc18124fb12405d395c6a5e28460d11a83ad80d`。
- 文件：**240077字节**；SHA-256：`305799c1baae7acec48f3d7cb0efe50c8a5d2329a24650a9607903004e6c2111`。
- 两基线差异并集为25个程序文件，目标清单71个文件；相对candidate.5有25项差异，相对candidate.6有13项差异。单文件另含基线/目标清单和更新引擎，不包含完整71文件源码包、浏览器、依赖或个人数据。
- 支持基线：candidate.5 / `3856a49a78852c4729a6be4d64f01f19acdcd1c3`；candidate.6 / `38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac`。未知版本或被改动的基线拒绝更新。

## 一次性操作

1. 在原位置正常运行“停止.cmd”，等待后台及专用执行浏览器关闭。
2. 如要搬迁，整体移动含“启动.cmd”的最内项目文件夹；保留隐藏`.runtime`、`runtime-deps`、浏览器配置及所有原文件。不搬迁则保留原目录。
3. 将单个“更新.cmd”放在实际“启动.cmd”同一级，双击。成功提示`UPDATE_COMPLETE`后，再双击原来的“启动.cmd”。更新器不自动启动或投递。
4. 核对原资料、答案、简历、任务及执行端连接。首次实际扩展心跳与原执行身份/存储核验完成前保持执行暂停；原手动暂停不解除，unknown不能恢复投递。
5. 在“资料与简历”本机导入PDF，核对草稿后保存。聊天里的PDF或预填文件不会自动同步到用户电脑。

详见[升级与失败处理](../UPGRADE_001.md)。不必重跑“安装运行环境.cmd”；已有浏览器和兼容Playwright继续复用，仅补确实缺少的PDF组件。更新不改变筛选条件、计划、模式或额度。

## 实现及保护

更新文件从自身位置确定根目录，先核对嵌入包摘要、精确已知基线、目录边界、附件和进程归属。旧PID不能授权结束未知Node/Chrome；当前目录确属本项目的运行进程只调用正常停止入口，旧路径进程或无法确认停止则拒绝更新。更新锁及Windows启动锁阻止并发启动。

只有旧项目`.runtime/data/resumes/<SHA256>.bin`且新位置字节大小/摘要一致的`state.resume.file`与任务`resumeSnapshot.file`可重定位。保留附件原字节、版本、任务和提交边界；缺失、摘要不符、外部路径或混合根目录不猜测修复。

完整备份程序变化、状态与浏览器配置，先核验冷复制存储，再以真实Chromium读取旧扩展记录。Chromium不缓存unpacked manifest，因此按加载类型、原路径生成的ID、唯一配置归属、配对key及任务profileId核对。新扩展固定manifest公开key，搬迁后仍保留原profileId、提交尝试及私人数据。旧待回传结果、tab/document、上传及网络证明保留在本机迁移归档，不回放为新证据、不自动重投unknown。原Cookie与浏览器配置继续保留。

更新完成只代表文件事务已提交；首次生产启动还须实际固定ID扩展、原身份、逻辑存储摘要和新心跳核验。验证标记原子落盘后才解除迁移hold；标记写入失败时继续hold，标记成功但hold解除失败可在下次核验后接续。全局手动暂停保持不变。

写入/依赖失败先核验备份后恢复；中断可重复执行以恢复。备份损坏时拒绝覆盖有效配置。`更新.cmd --restore`仅用于首次核验尚未完成且没有新增/修改用户事实的本次更新，恢复前会冷读取真实扩展存储并比对迁移摘要；扩展中新增资料或映射也会拒绝恢复，不能仅比较后台状态。不能当常规降级入口；刚搬迁时还原的是旧绝对附件路径，应整体放回原位置再运行旧版。依赖补充不清空node_modules、不下载浏览器；失败恢复不删除已下载依赖。

## 必要验证

[最终CI 39934626712](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39934626712)，来源与下载文件同为`ffc18124fb12405d395c6a5e28460d11a83ad80d`。

- 14项必要检查：11项更新相关＋3项源码包检查。覆盖错目录、未知版本、改动基线、坏包/越界、缺附件/同大小错摘要/错大小/外部与混合路径、事务/依赖失败、中断恢复、备份损坏、扩展路径ID/类型/歧义、账本与旧证明归档；检查使用虚构数据。
- GitHub-hosted Windows 2025、Node 24、Playwright 1.58.2及对应Chromium：candidate.5与candidate.6各一条真实旧安装深目录启动→正常停止→完整移至短目录→运行单个CMD→新真实浏览器/扩展→停止再启动的完整场景。
- 两场景核对原资料/答案/任务、附件字节与摘要、原profileId、提交尝试、旧outbox/回执归档、新实际扩展ID及心跳、Cookie、手动暂停、unknown拒绝恢复、重复更新；缺少的PDF依赖补齐/已安装依赖复用。原浏览器二进制前后SHA-256一致。
- Windows实际负例：candidate.5首次核验前在真实扩展保存新资料，实际运行--restore拒绝并保留新资料；损坏CMD拒绝且不改状态；旧PID指向另一个真实Node进程时拒绝且不结束该进程。unknown恢复实际HTTP 400并核对提交边界拒绝原因。
- Windows构建文件摘要与交付工作区复现结果一致。CI的`single-file-update`附件含CMD、UPDATE.json及`windows-update.json`；检查注释同时保留无私人路径的两场景布尔证据和摘要。

沿用candidate.6的43项/6场景、此前Greenhouse/MV3证据，不重跑旧全套或录屏。此前失败运行是定位及修复记录，不计作本次通过证据。

验证范围是同一Windows用户/机器上的已知candidate.5/6完整目录搬迁；没有验证跨机器Cookie移植、任意Chrome版本或所有损坏状态，不能保证任何情况下永久可启动。未使用本人资料，未访问企业表单提交路径；首次真实申请仍需本人确认岗位、资料、附件与提交动作。
