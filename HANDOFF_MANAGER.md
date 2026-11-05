# Manager交接（简版）

更新：2026-11-05。新会话第一句：**先读HANDOFF_MANAGER.md，接续Manager。**

- **分工：** 本会话是Manager，负责需求、派工、交付审查和验收，独立维护本文件。Engineer负责实现、验证、打包及`HANDOFF_ENGINEER.md`；`HANDOFF.md`仅导航。另一个GPT仅教用户操作，不是新Manager。
- **仓库：** `Tianyao1234567/job-application-assistant`。Manager文档分支`dev/pm9-demo-windows-readiness`；当前工程实现分支`engineer/profile-import-usability`。PR #5保持draft，不合并、不强推，不覆盖其他写入者。
- **核心目标：** 实际缺项→平台记录原题→本人直接回答确认→持久保存→同任务继续→适用事实复用。普通补答无需JSON、工程师或另一GPT中转。JSON仅用于首次导入、大改、批量维护或内部交换。

## 当前工程检查点：继续开发，尚未交付验收

原任务提交`5c8b638`，执行[核心补答闭环与中文资料返工](docs/PROFILE_IMPORT_USABILITY_REWORK_001.md)。**用户已经实际导入JSON并明确不满意，不再按“没有文件/尚未导入”处理。** 诉求包括中文紧凑草稿一次确认、在读学位、项目四段独立保存、当前三个项目角色为核心成员、技能分类及旧资料保留修复；首要验收仍是核心补答闭环。

Engineer明确接续原任务，最新交接`84134e0095ba15fdf3353195fe1c54fab57d2772`，已验证源码`353c53de52596281d2aeb1c2096d92bddd538abf`，均在工程分支。Manager文档分支上的旧Engineer交接不能替代该检查点。Manager本次从`9194c98`接续，未修改Engineer源码或其交接。

Manager已核对[CI41962909038](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41962909038)公开摘要为同源码Success，以及相关工作流、测试和改动；未取得详细日志/artifact，未重跑测试。补答页面使用真实DOM/后台HTTP，但**执行器受控，不是实际MV3验收**。资料页面覆盖新导入和旧项目修复。

按[Manager检查点与续办要求](docs/PROFILE_USABILITY_CHECKPOINT_001.md)继续同一任务：

1. **附件阻塞：** 真实Greenhouse最终附件引用尚未可靠绑定到实际出网请求，当前代码对真实/原生协议提交整体暂停。先在实际MV3和随包浏览器验证发送前核验方案；错误引用须有服务端收到0次申请的证据。非阻塞webRequest观察和事后unknown不代替阻止发送。没有证据表明已发生真实错误投递。
2. **核心闭环：** 真实扩展跑通必填/选填、留空、动态问题、持久保存及同任务继续；补齐稳定事实进入资料、必要再确认和后续适用任务复用的页面证据。复用原附件，unknown不重投。
3. **已有资料：** 当前修复入口仅覆盖项目，尚须核对旧学位/在读与综合技能的恢复路径，在平台生成草稿或询问最小缺项。不能要求用户重导整份JSON；歧义须能就地看到并修改。
4. **升级交付：** candidate.8/.10实际更新验证尚待完成；保留资料、答案、任务、附件、浏览器/扩展身份和账本，检查新增`baseVersion`要求的旧页面恢复。最后核对新单文件更新包及下载摘要。

工程师已明确未提交本轮Manager验收，**没有新update.cmd，本轮尚未验收、未发布、未授权真实投递**。不让用户试投排障，不催其在旧界面手工重填。资料修复与升级准备可并行，不必全部等待附件调查。已有未受影响证据继续复用，不重跑无关全套。

## 历史验收及用户状态

此前唯一R1目标记忆返工已随candidate.10定点验收关闭，与当前核心工程分开记录。源码`46a28d3ee7402dad992c0fa721e6e01f676cff1e`，交付`bd74c28`；详见[Manager R1验收](docs/PROFILE_FILE_IMPORT_R1_ACCEPTANCE_001.md)。相同解析文件及条目复用本人确认的目标，重复导入不新增记录/版本，冲突、过期及目标删除保护保留；改文件或重排不会按名称猜合并。

历史发布[candidate.10 update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.10-update/update.cmd)：285351字节，SHA-256 `f347642c603115533762e803289158bd562b1c663d8151f5efaa9919f029eddd`，核验兼容candidate.8并保留数据和浏览器。这是旧R1更新，**不含当前返工成果**。用户确认曾安装candidate.8；目前精确安装版本未独立核对，已实际导入JSON这一反馈为准。

历史R1检查依据为[CI41442677046](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/41442677046)16项定点检查/1条实际页面场景及包源码核对；不扩称新代码或真实站通过。旧42项/5场景、PDF、Windows、MV3不因本次检查点自动重算。

## 下一责任人与使用边界

Engineer完成同一任务，回报最终源码、分层验证和更新包，独立维护其交接；Manager收到完整交付后定点验收，再安排用户一次升级、平台核对本人资料和首个真实岗位。首次真实申请必须由本人确认岗位、资料、附件和提交动作；目前没有真实申请完成证据。支持范围仍限已适配Greenhouse，不宣称任意网站通用。

首次使用引导任务`d19794e`仅为从属，不另开多页向导。过去原私有JSON不在本云工作区，不伪造个人资料、不用虚构样例冒充用户文件；该事实不阻塞用同结构虚构数据开发，也不把找回文件重新列为当前前置。

每次完成经理任务后提供一个可复制“发给 Engineer”块。提交不等于对方已读，GitHub不会自动唤醒另一个会话。公开仓库不放私人数据；不重装用户环境、不清空`.runtime`、不在用户电脑跑开发套件。保留已有写入者，按实际工作区使用当前检出，不机械套用历史隔离目录指令。GitHub API曾Forbidden，Git fetch/push及公开摘要可用。
