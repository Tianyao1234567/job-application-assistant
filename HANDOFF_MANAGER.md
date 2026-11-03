# Manager交接（简版）

更新：2026-11-03（北京时间）。新会话第一句：**先读HANDOFF_MANAGER.md，接续Manager。**

- **职责与分工：** Manager负责需求、派工、验收和推进；只维护本文件。Engineer维护`HANDOFF_ENGINEER.md`，`HANDOFF.md`仅导航，不互相覆盖。
- **操作教学助手：** 用户另开GPT仅教其本机操作，不是新Manager，不接管派工、验收或角色交接；本会话继续担任Manager。此前给教学GPT的“接续Manager”提示词已由用户明确纠正。
- **仓库与分支：** `Tianyao1234567/job-application-assistant`，`dev/pm9-demo-windows-readiness`。PR #5保持draft，未经授权不合并、不强推。
- **目标：** 首份本人JSON由Manager/资料整理助手根据已有材料准备并交付，用户在平台一次核对导入。之后实际岗位缺项在平台集中填写、保存并继续同一任务，适用事实复用，不要求每次生成JSON或打更新包；AI整理文件只是可选资料维护入口。最终完成首个真实招聘网站完整申请。

## 当前状态

用户已成功安装candidate.8；candidate.9其余范围已分项验收，**唯一P2返工R1现已随candidate.10通过Manager定点验收，关闭本次返工**。修复/打包源码`46a28d3ee7402dad992c0fa721e6e01f676cff1e`，交付文档`bd74c28`。最新结论见[Manager R1验收](docs/PROFILE_FILE_IMPORT_R1_ACCEPTANCE_001.md)。

R1已持久记住未知增量项首次明确匹配/新建的目标；同一文件重载、重复确认复用原目标，不增经历或资料版本，冲突、过期和目标删除保护保留。只识别相同解析文件及条目；改动/重排的文件重新匹配，不按名称猜测合并。

Manager已审源码及定点测试，核对[CI41442677046](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41442677046)成功和同源码16项/1场景证据，并解包逐项核对发布文件与源码。未重跑这些检查或旧42项/5场景、PDF、Windows、MV3。原任务和历史R1依据保留在[原验收](docs/PROFILE_FILE_IMPORT_ACCEPTANCE_001.md)及[原任务](docs/ENGINEER_TASK_PROFILE_UPDATE_001.md)，其“R1待修复”状态由本次验收取代。

放行[单个candidate.10 update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.10-update/update.cmd)：285351字节，SHA-256 `f347642c603115533762e803289158bd562b1c663d8151f5efaa9919f029eddd`；精确兼容candidate.8，保留原数据和浏览器。用户尚未确认安装10或完成本人资料导入。本会话经用户明确切换为Manager；Engineer继续独立维护其交接，不另开R1实现或重复派工。

最新本机反馈（2026-11-03）：用户打开“资料与简历”后看到个人信息为空，并确认尚未导入JSON（可能只上传过PDF）。当前先指导已有资料文件的导入、预览和确认保存；上传附件或PDF草稿不代表完整个人资料已保存。未取得本机state，不能推断持久资料全部为空、已丢失或导入功能失败；当前安装版本与JSON入口是否可见仍待按实际页面确认。此时不认定资料就绪或开始真实投递，不要求重抄整份简历、重装或用仓库虚构样例充当本人资料。

用户进一步明确：不能让其自行寻找一个尚未交付的JSON；Manager须负责首份文件、保存位置、导入验证和后续平台补答全流程。历史私有目录`private-import-2026-10-28`及原文件不在当前工作区，已检查共享附件目录也为空，不能把历史“生成过”说成当前可下载。当前仅缺源文件本身即可准备本人JSON，不缺开发用协议/虚构样例。已发布[Work首次使用引导任务](docs/WORK_TASK_FIRST_PROFILE_GUIDANCE_001.md)补齐已确认的页面/随包帮助及版本显示缺口，不阻塞用户先试现有candidate.10；尚无Work接单或开工证据。

## 下一步

1. Manager先取得原本人JSON文件，校验并交付明确下载文件与一次操作说明；文件保存到本机“下载”等可选择位置即可，无须手动放进程序或`.runtime`。拿不到原文件时只请求转发原附件，不让用户重抄，不生成空/虚构资料冒充可用首份文件。同步确认已安装支持导入的candidate.10；未更新时沿用既有单文件入口保留目录更新，不反复更新或重装浏览器。
2. 教学助手或Manager带用户在“资料与简历／选择资料文件”选择已交付JSON，预览本人字段、接受核实的变更并确认保存，检查真实字段及接受项数。遇未保存编辑先保留处理，不能盲目放弃；若没有入口先核对版本。用户可先试现有版本，不等待引导改进包。
3. 选定受支持的真实岗位、核对附件与执行端；新缺项在平台“待处理”填写，点击“一次保存以上答案并继续原任务”，版本变更时重新核对本次申请。Manager跟进完整流程，Work按限定引导任务或真实具体阻塞实现，不重做已验收功能。**本人完整资料尚未确认导入，真实企业闭环尚未验证/授权。** 当前真实适配仅限Mattermost Greenhouse相关范围，不宣称通用。

## 不再踩坑

不让用户重抄简历或解释技术格式；协议、虚构样例均已在仓库，Engineer已收到。PDF普通排版解析覆盖有限，本轮优先配置导入，不另开OCR/扩站。生成文件不等于写入用户电脑，受控测试不等于真实投递；unknown只核对、不重投。

不重装、不清空`.runtime`、不重跑无关全套。GitHub API曾Forbidden，但Git fetch/push正常。旧Manager本地仓库有未提交产品改动，使用隔离worktree，不reset覆盖。真实资料不进公开Git。

每次Manager回复提供一个可复制“发给 Engineer”块；Engineer回复“发给 Manager”。提交不等于对方已读。需要历史细节时再读[完整历史经理交接](https://github.com/Tianyao1234567/job-application-assistant/blob/75fa20b95942a817328e8ffbd2e2c917fc50e29c/HANDOFF_MANAGER.md)，不重新调查全项目。
