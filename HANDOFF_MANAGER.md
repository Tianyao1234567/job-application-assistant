# Manager交接（简版）

更新：2026-11-02。新会话第一句：**先读HANDOFF_MANAGER.md，接续Manager。**

- **职责与分工：** Manager负责需求、派工、验收和推进；只维护本文件。Engineer维护`HANDOFF_ENGINEER.md`，`HANDOFF.md`仅导航，不互相覆盖。
- **仓库与分支：** `Tianyao1234567/job-application-assistant`，`dev/pm9-demo-windows-readiness`。PR #5保持draft，未经授权不合并、不强推。
- **目标：** 现有简历/配置自动预填，只问真正缺项；用户回答由AI生成固定JSON，本机核对保存、后续适用时复用。最终完成首个真实招聘网站完整申请。

## 当前状态

用户已成功安装candidate.8；candidate.9（源码`812a92d1adc947d6c3152dd926718ff7dd3d652a`）**分项验收通过，唯一P2返工R1待完成**。已有42项检查和5个实际后台场景通过，Manager已审代码和下载包，未重跑旧套件。

R1：未知增量项首次明确匹配/新建后未记住目标；同一文件再次导入仍未匹配，用户再次选择新建会重复经历。**默认保留保存不会重复。** 需持久复用首次确认目标，同时保留冲突、过期和目标删除保护。

完整依据、最小复现及验收：[PROFILE_FILE_IMPORT_ACCEPTANCE_001.md](docs/PROFILE_FILE_IMPORT_ACCEPTANCE_001.md)，已随`75fa20b`推送。原任务：[ENGINEER_TASK_PROFILE_UPDATE_001.md](docs/ENGINEER_TASK_PROFILE_UPDATE_001.md)。

新Engineer已由用户开启并确认接手；R1已发布，尚未收到其明确接单/修复交付。Manager不另开并行实现。接续先核对最新提交和Engineer回复，避免重复分配。

## 下一步

1. Engineer只修R1，补受影响检查和一条实际界面重复导入验证，交修复SHA及兼容已装candidate.8的单个`update.cmd`；不覆盖旧tag。
2. Manager定点验收，通过部分不重审。用户暂不必先装9，修好后一次更新，保留原资料、附件、答案、任务和浏览器。
3. 用户本机选择现有旧插件JSON、核对保存，再选真实岗位并确认资料、附件和首次提交。**本人完整资料尚未确认导入，真实企业闭环尚未验证/授权。** 当前真实适配仅限Mattermost Greenhouse相关范围，不宣称通用。

## 不再踩坑

不让用户重抄简历或解释技术格式；协议、虚构样例均已在仓库，Engineer已收到。PDF普通排版解析覆盖有限，本轮优先配置导入，不另开OCR/扩站。生成文件不等于写入用户电脑，受控测试不等于真实投递；unknown只核对、不重投。

不重装、不清空`.runtime`、不重跑无关全套。GitHub API曾Forbidden，但Git fetch/push正常。旧Manager本地仓库有未提交产品改动，使用隔离worktree，不reset覆盖。真实资料不进公开Git。

每次Manager回复提供一个可复制“发给 Engineer”块；Engineer回复“发给 Manager”。提交不等于对方已读。需要历史细节时再读[完整历史经理交接](https://github.com/Tianyao1234567/job-application-assistant/blob/75fa20b95942a817328e8ffbd2e2c917fc50e29c/HANDOFF_MANAGER.md)，不重新调查全项目。
