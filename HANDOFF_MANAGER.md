# Manager交接（简版）

更新：2026-11-03（北京时间）。新会话第一句：**先读HANDOFF_MANAGER.md，接续Manager。**

- **职责与分工：** Manager负责需求、派工、验收和推进；只维护本文件。Engineer维护`HANDOFF_ENGINEER.md`，`HANDOFF.md`仅导航，不互相覆盖。
- **仓库与分支：** `Tianyao1234567/job-application-assistant`，`dev/pm9-demo-windows-readiness`。PR #5保持draft，未经授权不合并、不强推。
- **目标：** 现有简历/配置自动预填，只问真正缺项；用户回答由AI生成固定JSON，本机核对保存、后续适用时复用。最终完成首个真实招聘网站完整申请。

## 当前状态

用户已成功安装candidate.8；candidate.9其余范围已分项验收，**唯一P2返工R1现已随candidate.10通过Manager定点验收，关闭本次返工**。修复/打包源码`46a28d3ee7402dad992c0fa721e6e01f676cff1e`，交付文档`bd74c28`。最新结论见[Manager R1验收](docs/PROFILE_FILE_IMPORT_R1_ACCEPTANCE_001.md)。

R1已持久记住未知增量项首次明确匹配/新建的目标；同一文件重载、重复确认复用原目标，不增经历或资料版本，冲突、过期和目标删除保护保留。只识别相同解析文件及条目；改动/重排的文件重新匹配，不按名称猜测合并。

Manager已审源码及定点测试，核对[CI41442677046](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41442677046)成功和同源码16项/1场景证据，并解包逐项核对发布文件与源码。未重跑这些检查或旧42项/5场景、PDF、Windows、MV3。原任务和历史R1依据保留在[原验收](docs/PROFILE_FILE_IMPORT_ACCEPTANCE_001.md)及[原任务](docs/ENGINEER_TASK_PROFILE_UPDATE_001.md)，其“R1待修复”状态由本次验收取代。

放行[单个candidate.10 update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.10-update/update.cmd)：285351字节，SHA-256 `f347642c603115533762e803289158bd562b1c663d8151f5efaa9919f029eddd`；精确兼容candidate.8，保留原数据和浏览器。用户尚未确认安装10或完成本人资料导入。本会话经用户明确切换为Manager；Engineer继续独立维护其交接，不另开R1实现或重复派工。

## 下一步

1. Manager指导用户从已装candidate.8一次更新10：正常“停止.cmd”后把新单文件放到实际“启动.cmd”同级运行，看到`UPDATE_COMPLETE`再用原入口启动；保留完整目录及隐藏`.runtime`，不先装9、不重装浏览器。
2. 用户核对原资料、附件、答案和任务，在“资料与简历／选择资料文件”选择已有JSON，预览并核对保存。Engineer只修这一实际使用中暴露的具体阻塞，不重做已验收范围或重发相同包。
3. Manager跟进本机结果，再选真实岗位并确认资料、附件和首次提交。**本人完整资料尚未确认导入，真实企业闭环尚未验证/授权。** 当前真实适配仅限Mattermost Greenhouse相关范围，不宣称通用。

## 不再踩坑

不让用户重抄简历或解释技术格式；协议、虚构样例均已在仓库，Engineer已收到。PDF普通排版解析覆盖有限，本轮优先配置导入，不另开OCR/扩站。生成文件不等于写入用户电脑，受控测试不等于真实投递；unknown只核对、不重投。

不重装、不清空`.runtime`、不重跑无关全套。GitHub API曾Forbidden，但Git fetch/push正常。旧Manager本地仓库有未提交产品改动，使用隔离worktree，不reset覆盖。真实资料不进公开Git。

每次Manager回复提供一个可复制“发给 Engineer”块；Engineer回复“发给 Manager”。提交不等于对方已读。需要历史细节时再读[完整历史经理交接](https://github.com/Tianyao1234567/job-application-assistant/blob/75fa20b95942a817328e8ffbd2e2c917fc50e29c/HANDOFF_MANAGER.md)，不重新调查全项目。
