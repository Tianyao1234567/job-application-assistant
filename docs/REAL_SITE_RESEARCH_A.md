# 真实招聘站只读准备：美卡曼德、斯坦德、众行

首轮核查日期：2026-10-20（北京时间）；第二轮补证：2026-10-21（Asia/Shanghai，北京时间）。范围：公开页面与官方招聘出链，只读，不注册、不登录、不提交资料，不绕过验证码。候选域名不等于已核实官方入口；下面区分已读取的官方出链、目标页实际响应及尚未验证的申请流程。五家集中结论、首站建议和一次性准备清单见[REAL_SITE_PREPARATION.md](../REAL_SITE_PREPARATION.md)。

## 当前 Cloud 网络实证

当前执行环境使用 HTTPS 代理。以下独立首次 GET 在建立目标隧道时即返回 `Tunnel connection failed: 403 Forbidden`，没有拿到目标站响应，不能将它记成企业官网的 HTTP 403：

| 目标主机 | 目的 | 实际结果 |
| --- | --- | --- |
| www.mech-mind.com.cn | 美卡曼德候选中文官网 | 代理 CONNECT 403；官网正文未读 |
| www.mech-mind.com | 美卡曼德候选官网 | 代理 CONNECT 403；官网正文未读 |
| www.standard-robots.com | 斯坦德候选官网 | 代理 CONNECT 403；官网正文未读 |
| www.standarobots.com | 另一拼写候选，身份未确认 | 代理 CONNECT 403；不认作官方入口 |
| www.bing.com、www.google.com、www.baidu.com | 定位公开招聘来源 | 代理 CONNECT 403；搜索正文未读 |

没有围绕上述错误反复重试。已改由本轮单独的 GitHub 托管 Linux GET-only 采集验证官网与招聘链；受限 Cloud 与托管 runner 的证据分列，不能混称本地已打开网站。

可读取的交叉线索：2026-10-20，GitHub API [`/users/MechMindRobotics`](https://api.github.com/users/MechMindRobotics) 实际返回200：组织显示名 `Mech-Mind`，公开 `blog` 字段为 [`https://www.mech-mind.com/`](https://www.mech-mind.com/)。其公开 [`mecheye_ros_interface`](https://github.com/MechMindRobotics/mecheye_ros_interface) 仓库元数据 homepage 为 `http://www.mech-mind.net/`。这只用于定位候选及交叉核对，不以 GitHub 组织自述替代官网招聘链证据。

## 托管采集结果

首轮运行：[39426981512](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39426981512)，源码`30eaea515a6c062a590ca17acad61a82b8852b72`，独立 `site-readiness` 托管Linux只读作业。实际通过Checks API读取公开采集摘要；美卡曼德总注释在4096字节限制处截断，中文首页的第一条完整记录可读，但不能把截断后的英文首页/目标页记录当成已复核。下表保留当时结论；已完成的紧凑第二轮补证见下节，截断历史保留。

| 公司 | 已实际读到的来源与响应 | 当前可下的结论 | 尚不能下的结论 |
| --- | --- | --- | --- |
| 用户举例“美卡曼德” | [`www.mech-mind.com.cn`](https://www.mech-mind.com.cn/) HTTP200，标题“梅卡曼德机器人- 通用智能机器人的AI大脑和3D视觉”；页尾版权“梅卡曼德（雄安）机器人科技股份有限公司”，有冀ICP备2024090971号；官网“加入我们”实际href指向下述BOSS公司页 | 已验证该Mech-Mind品牌官网的公开招聘出链。官网原文是“梅卡曼德”，与用户写法字形不同，保留原文供PM核对，不悄然改公司名 | BOSS目标岗位列表/详情、账号登录、验证码、申请和回执尚待读取或后续profile实测；首页未出现login字样不能证明投递不需登录 |
| 斯坦德机器人 | [`www.standard-robots.com`](https://www.standard-robots.com/) 候选URL托管GET返回HTTP403，HTML110字节且无可见标题/正文/招聘链接 | 只能记该候选入口访问未成功；与当前Cloud的CONNECT拒绝分列 | 未核实官网企业身份、ATS或招聘路径，不能说没有岗位、没有登录或支持自动申请 |
| 众行机器人 | [Bing精确词搜索](https://www.bing.com/search?q=%22%E4%BC%97%E8%A1%8C%E6%9C%BA%E5%99%A8%E4%BA%BA%22%20%E5%AE%98%E7%BD%91%20%E6%8B%9B%E8%81%98) HTTP200，但标题含查询词、实际正文却为Google Translate多语种条目，无公司来源链 | 这份搜索响应与目标不匹配，不能用于公司识别；仍待确认全称/官方入口 | 不将众擎机器人、众行科技或任意名字接近企业替代为众行机器人 |

实际“加入我们”出链为[BOSS直聘公司页](https://www.zhipin.com/gongsi/4187bf5fb5aa26cf1H1409u5.html)。它是官网已发布的招聘平台链接，不是本项目从英文公司名猜出的ATS租户。首轮对该目标的后续记录不在可读的截断摘要内，当时未确定目标页HTTP状态；第二轮的安全加载页补证见下节，申请表结构仍未确认。

斯坦德的同轮Bing查询也返回了与公司不相干的阿语新闻正文。搜索HTTP200与query出现在标题均不能替代相关官方来源。没有据这些不匹配内容继续猜网站。

## 第二轮实际补证（2026-10-21）

运行[39469515898](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39469515898)，源码[`1118d9f30009141b1fcf0df0877bf2157d71ecd0`](https://github.com/Tianyao1234567/job-application-assistant/commit/1118d9f30009141b1fcf0df0877bf2157d71ecd0)。只读 `site-readiness` 作业[118789723234](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39469515898/job/118789723234) 为 success；实际作业窗口为 **2026-10-21 01:50:30–01:50:48 Asia/Shanghai**，即2026-10-20 17:50:30–17:50:48 UTC。这里使用实际作业时间，不把客户端日期当成逐页采集时刻。

已通过[Checks注释API](https://api.github.com/repos/Tianyao1234567/job-application-assistant/check-runs/118789723234/annotations)读取五家完整JSON摘要。本轮脚本将每家公司注释限制在3750 UTF-8字节以内；不依赖受限artifact ZIP，也没有把未下载的正文称为已复查。首轮4096字节截断记录仍保留为历史，上节“尚待读取”的条目以本节补证更新。

| 公司 | 本轮直接来源与响应 | 能确认的范围 | 仍未确认 |
| --- | --- | --- | --- |
| 美／梅卡曼德 Mech-Mind | [中文官网](https://www.mech-mind.com.cn/)200，标题及页脚再次确认“梅卡曼德（雄安）机器人科技股份有限公司”；[英文官网](https://www.mech-mind.com/)200，标题为“Embodied AI & 3D Vision for Robots and More / Mech-Mind Robotics”，版权为Mech-Mind Robotics Technologies Co., Ltd.。中文官网“加入我们”仍指向原[BOSS公司页](https://www.zhipin.com/gongsi/4187bf5fb5aa26cf1H1409u5.html) | 官网→BOSS出链成立。目标本轮302至[BOSS安全加载页](https://www.zhipin.com/web/passport/zp/security.html)，最终200、标题“请稍候 - BOSS直聘”，内容为“正在加载中”页面壳 | 未取得岗位列表、详情、申请或回执入口。没有看到可交互验证码，不能把安全页直接写成“必须验证码／登录”；也不能把200壳页记成岗位公开。用户“美”与官网“梅”的名称仍需最终核对 |
| 斯坦德机器人 | [候选官网](https://www.standard-robots.com/)仍HTTP403，空标题、无公司身份或招聘出链。[百度查询](https://www.baidu.com/s?wd=%E6%96%AF%E5%9D%A6%E5%BE%B7%E6%9C%BA%E5%99%A8%E4%BA%BA%20%E5%AE%98%E7%BD%91%20%E6%8B%9B%E8%81%98)200，摘要出现看准网关于“斯坦德机器人（深圳）有限公司”的片段 | 可报告候选网站返回真实HTTP403。搜索片段仅为第三方发现线索，没有形成官网→招聘系统证据链；它不替代官网身份确认 | 官网身份、招聘平台、列表／详情、登录／验证码、申请／回执均未知；不构造其他拼写域名或ATS租户 |
| 众行机器人 | [百度精确词查询](https://www.baidu.com/s?wd=%22%E4%BC%97%E8%A1%8C%E6%9C%BA%E5%99%A8%E4%BA%BA%22%20%E5%AE%98%E7%BD%91%20%E6%8B%9B%E8%81%98)200；可读摘要的相关搜索出现“众擎机器人”及“深圳市众擎机器人科技有限公司”，未取得“众行机器人”的官网或招聘出链 | 搜索返回近名公司，仍不能识别目标。“众行”与“众擎”保持分别记录 | 全称、官方入口和全部招聘流程未知；不按相似搜索结果替换目标 |

本轮百度搜索URL的查询由源码中固定词产生；采集摘要为去除非保留query的公开URL，因此Checks内显示 `/s`。上表保留原查询词供复核，不把搜索网站本身的登录／注册文本归给目标招聘站。

## 三家公司需要保留的边界

- 美卡曼德：先核实企业官网上的招聘外链，再确认外部 ATS 租户；没有官方来源链时，不凭公司英文拼写构造飞书、北森或 Moka 地址。
- 斯坦德机器人：`standard-robots` 与其他拼写须以官网企业品牌、版权和招聘出链核对；域名读音相近不能证明是同家公司。
- 众行机器人：当前没有可靠官方入口。不能把“众擎机器人”、名称含“众行”的软件公司或招聘聚合页自动替换成用户举例的公司。最小确认项是一条公司全称或其官方主页/招聘链接；在确认前保持待识别，不要求用户现在注册账号。

## 适配前置方案

公司、ATS 租户、岗位方向、城市和账号准备均保持配置项，不将这三家硬编码为唯一支持公司。接入按阶段交付：

1. 公开发现与只读详情：保留原网址；先取得 ATS 的岗位稳定 ID、企业/租户标记、列表分页与详情路径证据，未核实 ID 前不要用删去 query 的 URL 去重。
2. 执行 profile 准备：本人在后续真正执行的专用 profile 完成账号注册/登录/验证码；页面检查必须在同一 profile 重新读取。其他浏览器已登录不能当作执行端 ready。密码、验证码和 Cookie 不进入资料库或报告。
3. 申请结构：只有经用户确认的普通字段、教育/经历条目与限定问题可进入填写计划。未知问答、敏感字段、结构变化、人工验证或原值冲突暂停同一任务，保留原因，不猜答案。
4. 附件与提交：逐站实际核对字段、原生上传、锁定文件字节摘要及唯一提交入口；先持久保存提交边界，再授权点击。无可靠回执时只能只读核对，不因刷新、重新登录或重启清除历史。
5. 回执与刷新：核对真实 ATS 的成功标记、申请记录入口、跳转方法和结果页刷新行为。已验收的303防重发仅在本项目自有 fixture 服务端成立，不代表扩展已能替任意招聘站避免浏览器原生 POST 刷新重放。

本阶段不运行第3至5项的真实站写操作；它们是后续完整自动投递适配目标与验收门槛，没有把产品永久缩为只填表工具。
