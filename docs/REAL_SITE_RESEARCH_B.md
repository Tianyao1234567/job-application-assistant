# 真实招聘站只读准备：第四范式、石头科技

首轮调研日期：2026-10-20（北京时间）；第二轮补证：2026-10-21（Asia/Shanghai，北京时间）。范围是公开官网、官网招聘出链和公开页面结构；没有注册、登录、提交简历、调用申请接口或索要密码/验证码。企业、岗位方向和站点仍为配置项，本文不宣布已支持自动投递。五家集中结论、首站建议和一次性准备清单见[REAL_SITE_PREPARATION.md](../REAL_SITE_PREPARATION.md)。

## 初始 Cloud 出站观测与托管补证

当前 Cloud 首轮 GET 下列地址均在 CONNECT 阶段被代理返回 **403 Forbidden**，没有拿到站点 HTML：`www.4paradigm.com`、`www.roborock.com`、`cn.roborock.com`；`www.bing.com` 的两条中文招聘定位查询也同样受限。该结果是执行环境的出站限制，不能写成官网拒绝访问、官网不存在或招聘系统不可用。没有反复重试相同受限地址。

已执行独立托管Linux只读采集[39426981512](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39426981512)，被测`30eaea515a6c062a590ca17acad61a82b8852b72`，site-readiness作业success。脚本只作公开GET，没有Cookie jar、认证或申请API；它记录响应及可读招聘锚点，不因作业成功就将每个网站标为可访问。首轮部分Checks摘要达到平台4096 UTF-8字节上限而截断，下表保留当时结论；已完成的紧凑第二轮补证见下节。未下载的artifact正文不称已复查。

| 公司 | 候选官网与现有出处 | 目前已实际核实 | 仍需托管公开 GET 核实 |
| --- | --- | --- | --- |
| 第四范式 | [官网](https://www.4paradigm.com/)；[公开组织API](https://api.github.com/orgs/4paradigm)的blog亦指向该站 | 托管GET官网200，标题“4Paradigm / 第四范式官网”，页脚“第四范式（北京）技术有限公司”；官网实际“招贤纳士”出链至[Moka公开招聘入口](https://app.mokahr.com/social-recruitment/4paradigm/102013)和[官网人才页](https://www.4paradigm.com/about/hr.html)。入口来源成立，未推测供应商 | 首轮Moka连续302至重定向上限，尚未获得列表/详情HTML；不是登录/验证码必需的证明。官网人才页完整响应、当前迁移新站及申请/回执路径待补证；不能只用ATS供应商常见路径补写 |
| 石头科技 | [品牌入口](https://www.roborock.com/)、[中国入口候选](https://cn.roborock.com/) | 托管GET www实际301至[美国官方商店](https://us.roborock.com/)，200，标题“Roborock US Official Store”；该页是消费商店，未发现招聘出链。cn候选NETWORK_ERROR，没有HTTP响应 | 中国招聘入口与公司身份、ATS、列表/详情和登录/申请/回执路径尚未核实；不能把商店登录或会员注册当招聘账号，也不推测`zhiye`、Moka等供应商域名 |

## 第二轮实际补证（2026-10-21）

运行[39469515898](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39469515898)，源码[`1118d9f30009141b1fcf0df0877bf2157d71ecd0`](https://github.com/Tianyao1234567/job-application-assistant/commit/1118d9f30009141b1fcf0df0877bf2157d71ecd0)。只读 `site-readiness` 作业[118789723234](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39469515898/job/118789723234) success；实际作业窗口 **2026-10-21 01:50:30–01:50:48 Asia/Shanghai**，即2026-10-20 17:50:30–17:50:48 UTC。已读取[Checks注释API](https://api.github.com/repos/Tianyao1234567/job-application-assistant/check-runs/118789723234/annotations)五家公司完整JSON摘要。本轮每家公司摘要限定3750 UTF-8字节以内；未下载artifact ZIP，不宣称其全文已复查。首轮截断和失败观测保留，上节待补证项以本节更新。

| 公司 | 本轮来源与实际响应 | 岗位／登录／申请可见性结论 |
| --- | --- | --- |
| 第四范式 | [官网](https://www.4paradigm.com/)200，标题及版权身份与首轮一致；官网→[Moka社招入口](https://app.mokahr.com/social-recruitment/4paradigm/102013)的出链再次成立。该目标连续302回同一地址，达到采集器重定向上限，未得到招聘HTML | 不能判断社招列表／详情是否公开，也不能从302推出必须登录或验证码；申请和回执路径未知 |
| 第四范式官网人才页 | [about/hr.html](https://www.4paradigm.com/about/hr.html)实际200，标题“第四范式招聘官网-求职找工作-最新招聘信息”；除了相同社招链接，实际“查看详情”锚点为[Moka校园入口](https://app.mokahr.com/campus-recruitment/4paradigm/58145) | 校园入口仅证实为官网人才页href，本轮未跟随读取，不能声称岗位详情或校招流程已打开。人才页文本的login/apply检测为true，未定位具体表单／按钮上下文，不能推定目标ATS登录要求 |
| 石头科技 | [www入口](https://www.roborock.com/)再次301至[美国商店](https://us.roborock.com/)，200；其实际“About us”→[美国商店品牌介绍](https://us.roborock.com/pages/about-us)200，均无采集到的招聘出链。[中国入口](https://cn.roborock.com/)本轮200，标题“石头科技-让生活更有品质感”，但可读正文少于180字符，被标记emptyShell，未提取公司版权身份和招聘链接 | 中国页从首轮网络错误变为本轮200壳页，这两次观测分别保留。当前GET未完成脚本渲染，不能说没有招聘岗位或没有登录。美国商店的登录／注册信号属于电商页面，不能作为招聘账号准备项；招聘系统与列表／详情／申请／回执均未核实 |

官网还实际出现[范式集团官网](https://www.phancygroup.com/)及其[公司简介](https://phancygroup.com/about)链接，本轮未跟随读取；不能据此宣布招聘已迁移到新站。也未从Moka惯用地址补写申请／回执URL。

## 配置化接入与本人准备边界

确认官方出链后，再按每个ATS的独立适配器检查列表分页、稳定岗位ID、租户/公司身份、详情、申请入口、字段/附件、提交响应、回执与原生结果页刷新。自有fixture的303修复不能当作这两家公司真实站的通用防重放能力。

公开 HTML 出现“登录”“注册”或“验证码”只能证明页面有该提示，不能代替执行profile实际就绪。真正需要本人操作时，集中由PM安排：确认招聘入口和目标公司；在将来实际执行使用的同一隔离profile本人登录；不向开发者发送密码、验证码、Cookie或会话导出。当前用户无需注册或安装。

就两家公司现有证据，第四范式Moka有官网直接出链和固定公司入口，可作为优先只读探索候选；但必须先核实实际公开列表/详情、公司租户及登录流程，尚不足以宣布适配或自动提交。石头科技尚无已核实招聘入口，不以美国商店作为样本。五家首站建议与集中准备清单已汇总到[REAL_SITE_PREPARATION.md](../REAL_SITE_PREPARATION.md)。后续目标仍包括真实站自动提交，本轮仅准备只读依据与适配条件。
