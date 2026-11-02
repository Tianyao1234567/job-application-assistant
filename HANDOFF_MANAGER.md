# Manager（项目经理）交接 — HANDOFF_MANAGER.md

更新时间：**2026-11-02（北京时间）**。身份：Manager。用户明确要求本Manager继续任职，已另开新Engineer；不是等待用户再开经理会话。以后新Manager第一句：**先读HANDOFF_MANAGER.md，接续Manager。**

Manager只维护本文件；Engineer维护[HANDOFF_ENGINEER.md](HANDOFF_ENGINEER.md)；[HANDOFF.md](HANDOFF.md)只作导航。沿用Engineer提交`e562ef8`完成的拆分，不再建立另一套同义文件或覆盖对方交接。

## 当前结论与下一步

**candidate.9分项验收通过，唯一P2返工R1尚未解决；整体未完全验收。** 完整结论、代码依据、可直接执行的虚构最小复现及明确任务见[PROFILE_FILE_IMPORT_ACCEPTANCE_001.md](docs/PROFILE_FILE_IMPORT_ACCEPTANCE_001.md)。本次已完成实际代码及已有证据审核，不再以“尚未审核”重复开工。

- 通过：旧插件v3预填与重复幂等、明确目标的增量合并、dirty/冲突/过期保护、岗位答案归属、原子保存与本机授权、原附件/unknown边界、单文件包与candidate.8支持。
- **R1：未知增量项首次本人明确匹配/新建后未记住目标。** 同一文件再次导入仍显示未匹配；用户再次新建并接受会产生重复经历。仅默认保留保存不会重复。修复应复用首次确认的稳定目标，保护后来编辑的值和已删除目标，不按名称猜测合并。
- 用户已确认安装candidate.8；没有安装9或本人完整配置已导入的证据。先修R1再交最终单文件，避免连续升级；不要再让用户重装或下载浏览器。
- 最高目标仍是**首个真实招聘网站完整申请**，目前没有真实企业闭环成功或首次提交授权；选定本人真实目标、资料、附件及提交动作后才执行。

接下来由新Engineer按R1接续，交修复SHA、受影响定点证据、一条实际界面重复未知记录导入证据及新单文件更新。其他已验收范围直接沿用，不重跑旧全套。Manager定点复核后指导用户本机导入现有JSON、一次核对；再选真实岗位推进完整申请。遇实际阻碍才修，不扩站、OCR、云平台或重做UI。

## 身份、分支与执行状态

| 项目 | 状态 |
| --- | --- |
| 仓库 | [Tianyao1234567/job-application-assistant](https://github.com/Tianyao1234567/job-application-assistant) |
| 有效分支 | `dev/pm9-demo-windows-readiness`，不从旧main重做 |
| PR | [#5](https://github.com/Tianyao1234567/job-application-assistant/pull/5)保持draft；继承未合并PR #4；不合并、不强推 |
| 当前候选源码 | candidate.9 / `812a92d1adc947d6c3152dd926718ff7dd3d652a` |
| 本人已装且已验收基线 | candidate.8 / `bdd06e8aa17aa0e6dd433691cbbe399bebe41d7b` |
| 原任务 | [ENGINEER_TASK_PROFILE_UPDATE_001.md](docs/ENGINEER_TASK_PROFILE_UPDATE_001.md)，历史“尚未实现”不代表现状 |
| 当前交付 | [PROFILE_FILE_IMPORT_DELIVERY_001.md](docs/PROFILE_FILE_IMPORT_DELIVERY_001.md) |
| 当前验收/唯一返工 | [PROFILE_FILE_IMPORT_ACCEPTANCE_001.md](docs/PROFILE_FILE_IMPORT_ACCEPTANCE_001.md) |
| 技术协议与样例 | [AI提示词](docs/PROFILE_UPDATE_AI_PROMPT.md)、[完整v3虚构配置](docs/examples/PROFILE_LEGACY_V3_FICTIONAL.json)、[增量示例](docs/examples/PROFILE_UPDATE_FICTIONAL.json)、[空模板](docs/examples/PROFILE_UPDATE_EMPTY.json) |

旧Engineer已在`c1063a2`交接结束。用户随后明确新Engineer已建立；其转发回复确认读取`16860b8`，当时未修改代码/重跑测试，等待具体反馈。新Engineer又推送`e562ef8`拆分角色交接。11月2日核对远端仍为e562ef8，没有后续功能修复；当前Manager只发布验收和任务，不写产品代码、不另起并行实现。发布R1不等于Engineer已读或已开工，仍待明确回执；之后优先核对最新提交/回复，避免覆盖其未推送工作。

## 已有证据，不能重复跑

candidate.9的[CI 40818637375](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/40818637375)及[VERIFICATION.json](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.9-update/VERIFICATION.json)对应812a92d：42项必要检查＋5个实际后台文件选择场景。Manager已审核源码差异和相关测试、读取CI成功状态、实际下载更新文件核对摘要/内嵌引擎/27项变化/73文件清单。本次只新增一次双导入纯函数复现，不重跑已有检查；没有新增R1浏览器、Windows、MV3或真实企业测试。

candidate.9包为280379字节，SHA-256 `2a2054135ed3687f1242550e2959fdc2d6c1e6fd27801efc3d64da280745387f`；[现有下载](https://github.com/Tianyao1234567/job-application-assistant/releases/download/v0.2.0-candidate.9-update/update.cmd)仅用于证据定位，当前先修R1，不要求用户先升级9。后续包必须支持其已装8；不移动已发布tag或覆盖旧资产。

| 历史成果 | 已有状态 |
| --- | --- |
| Greenhouse受控流程 | [交付001](docs/GREENHOUSE_DELIVERY_001.md)已接收；不是实际企业成功 |
| candidate.4 | 109检查及MV3分项通过后发现同名错误附件对象P1，继续停用 |
| candidate.5 | `3856a49…`精确对象摘要绑定修复；30项受影响检查及定点MV3已接收，[交付003](docs/GREENHOUSE_DELIVERY_003.md) |
| candidate.6 | `38714f7…`PDF局部提取、集中补答和适用复用；43项＋6实际后台场景已接收，[报告](docs/PROFILE_IMPORT_DELIVERY_001.md) |
| candidate.7 | 自动恢复可能覆盖后来保存的资料，继续停用 |
| candidate.8 | `bdd06e8…`修复恢复保护及已搬迁/缺退出标记状态；26项定点检查、两条Windows分支及拒绝路径已通过，[报告](docs/UPDATE_DELIVERY_002.md)、[Manager验收](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6436876477)；用户已更新成功 |

## 用户要的长期流程与本人资料状态

已有简历/旧插件配置自动预填；企业问到已有信息直接复用；真正缺少、冲突或歧义的内容集中问本人。用户回答后可让任何AI按固定协议生成JSON，本机预览并一次核对保存，后续适用时复用。普通数据变化无需再改程序或下载包。个人事实和公司/岗位/国家/时间限定答案分开；不编造学历、公司、日期、成果、证书或许可。

用户已提供完整旧插件v3 JSON，愿意以它作首份基准。Manager已读取并生成兼容完整profile草稿（2教育、1实习、3项目、39映射字段），用candidate.8实际schema校验，未写入其电脑。保留硕士在读、未来结束日期未确认、项目独有事实；未支持字段另存。真实值未交给Engineer作为开发输入，也不需要才能开发；97c6d9e的完整虚构结构/协议已由Engineer确认接收并用于candidate.9。不要再说“没收到配置/协议”或让用户解释路径。

新版虚构v3实际产生34候选、32可接受；在读degree/endDate保留待处理。39是私有历史草稿数量，不是凑数门槛，不编造role或拆技能。获奖、语言、学院、自我描述等无专用自动填写字段，留存不等于自动投递已支持。

用户此前在candidate.8上传PDF后显示资料v1、真实附件v2，但教育/实习/项目仍为空并有dirty编辑。复制文字不含所有input值，不能断言持久资料全空；提取器主要识别固定标签，普通段落覆盖有限，零接受项也能显示saved。不要把“已保存”当全量提取，也不让用户重抄整份简历或盲目放弃编辑。PDF全面解析后移，本轮优先现成配置导入。

用户已授权读取其提供的资料，不重复问许可或泛泛提醒。技术协作统一GitHub，真实资料由本机入口读取；云端不能直接访问其D盘或localhost，生成文件不等于已导入。

## 产品及真实投递限制

本机Node24后台`http://127.0.0.1:17321/?autoconnect=1`＋专用可视Chromium/Playwright1.58.2＋MV3扩展；网页在本机，浏览器可联网。规则/DOM适配执行，不依赖实时视觉AI或必需的模型API Key。电脑须开机、联网、未休眠，后台及专用浏览器运行。登录/验证码本人处理，缺答暂停，同任务恢复。

当前真实适配仅限Mattermost Greenhouse相关范围，不是所有Greenhouse或所有招聘站。用户没有选定真实目标岗位；不能拿技术样本替他申请。首次提交须本人确认岗位、资料、附件和提交动作；unknown只核对结果、不自动重投。

更新方式保留单文件：正常“停止.cmd”后把新`update.cmd`放“启动.cmd”同级运行，见`UPDATE_COMPLETE`再启动。保留`.runtime`、资料、答案、任务、登录及浏览器。用户此前未停止就搬目录导致错误，candidate.8已解决且本人报告成功，不再重装、搬回、重问旧诊断或启动旧版补标记。

## 不能再踩的坑

- 不把本地文件链接当另一个会话可读的交接；任务必须自包含并上GitHub。发布、已读、开工、交付、验收、本人本机成功分别记录。
- GitHub API曾Forbidden，但Git fetch/push和公开release下载可用；不说整个GitHub不可访问，不反复重试失败API让用户搬运材料。
- 自动/显式恢复不得覆盖新资料；附件身份绑定实际字节与精确对象引用，不用文件名替代。导入不改变原PDF字节或授权企业提交。
- 不用旧默认角色覆盖新角色；经理只改HANDOFF_MANAGER，工程师只改HANDOFF_ENGINEER，HANDOFF仅导航。
- 受控站、后台UI、MV3、Windows和真实企业证据不混淆；源码SHA、文档HEAD、工作流HEAD可能不同。
- 不扩大验收、不重做已通过功能、不重跑无关全套；不为了包装反复让用户下载或重装。

## 沟通及发给Engineer的当前任务

每次Manager回复带一个可复制“发给 Engineer”块；Engineer以一个“发给 Manager”块回复，包含实际状态、SHA、证据、剩余及负责人。Manager负责澄清，用户不用做技术解释员。给用户操作一次1—3步和准确入口。

```text
发给 Engineer
candidate.9源码812a92d已完成分项验收。唯一返工R1见docs/PROFILE_FILE_IMPORT_ACCEPTANCE_001.md：持久记住未知增量项首次确认的目标，重复导入复用映射且不重复经历，同时保留后来编辑/已删除目标的保护。只补本缺口及受影响验证，提供一条实际界面重复导入证据；不要重跑旧全套或重做通过部分。交修复SHA和兼容candidate.8的新单文件更新，勿覆盖旧tag。经理维护HANDOFF_MANAGER.md，你维护HANDOFF_ENGINEER.md。请回复已读提交与接续状态。PR #5保持draft，首次真实申请未放行。
```

## 可选本地附录，不是开发依赖

本Manager旧`/workspace/job-application-assistant`保留早期未提交改动，不reset或当作最新源码；通过隔离worktree做文档。11月2日环境恢复后旧`/tmp`工作树已不在；当前工作树`/workspace/manager-review-20261102`基于远端e562ef8。fetch可能只更新FETCH_HEAD，用确切SHA，推送前核对远端；普通快进，不force。

私有`/workspace/USER_LOCAL_SETUP.md`存实际Windows路径；`/workspace/private-import-2026-10-28/`存转换草稿、未接入字段、说明、脚本；原附件在仓库外。不存在也不阻塞Engineer，不能发布私人文件。旧`资料更新工作流`、`PDF_PREFILL_REWORK_001.md`及教学提示词是历史准备稿，以当前仓库任务和实际界面为准。
