# 真实站适配阶段一：公开岗位与空白申请表

状态：已取得实际公开页面证据，交产品经理分阶段复核；**完整真实站适配尚未完成**。当前生产执行器仍只支持虚构站 `local-v1`。本阶段没有向真实企业填写、上传、注册或投递，也不要求用户安装或处理账号。

## 官方来源与实际观察

实际运行 [39632928709](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39632928709)，来源 [`fd383e866a54484833b84934df408a0903ab622c`](https://github.com/Tianyao1234567/job-application-assistant/commit/fd383e866a54484833b84934df408a0903ab622c)。[browser 作业 119335797698](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39632928709/job/119335797698)于北京时间 **2026-10-22 00:14:21–00:15:04** success；业务结果为 `PUBLIC_FORM_OBSERVED`。已读取该作业的[分组 Checks 原始摘要](https://api.github.com/repos/Tianyao1234567/job-application-assistant/check-runs/119335797698/annotations)，没有以 workflow success 代替页面观察。

| 项目 | 实际证据与边界 |
| --- | --- |
| 企业来源 | [Mattermost 官方 careers](https://mattermost.com/careers/)实际出链到该企业的 Greenhouse 岗位 |
| 实际岗位／申请页 | https://job-boards.greenhouse.io/mattermost/jobs/5381946008 |
| 企业／租户／稳定 ID | Mattermost／`mattermost`／`5381946008`，来自官方出链和实际岗位 URL |
| 页面原始标题 | `Job Application for Technical Sales Engineer/ Lead at Mattermost` |
| 空白申请结构 | 实际观察 27 个控件，包含原生附件控件和自定义选择控件的辅助输入；**不是 27 个独立业务问题** |
| 附件 | `resume`、`cover_letter`，实际 `accept` 均为 `.pdf,.doc,.docx,.txt,.rtf`；没有选择文件或上传 |
| 人工验证 | 可见 CAPTCHA／验证组件，未点击、未求解、未绕过；同时仍能读取公开岗位和申请控件 |
| 真实写入 | 零填表、零文件选择／上传、零申请 POST；非 GET/HEAD 方法在发出前阻止 |
| 隔离 | 单个匿名云端浏览器，清理完成；没有使用用户 profile、凭据或真实资料 |

这是开发选取的可观察流程样本，**不是对用户岗位匹配或投递意向的推荐**。岗位问题涉及日本工作资格及语言能力，不把样本选择当成这些个人条件已满足。

独立短期证据为 [public-browser-readonly artifact 12360286911](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39632928709/artifacts/12360286911)，ZIP 1877 字节，过期时间为**北京时间 2026-10-29 00:15:01**（UTC 2026-10-28 16:15:01）。本报告实际核对的是 Checks 和 artifact 元数据，未声称下载并审查 ZIP 正文。

## 原始问题、必填与选项仍须分别核实

| 已观察的原文／字段 | 本阶段处理原则 |
| --- | --- |
| `First Name*`、`Last Name*`、`Email*`、`Country*`、`Phone*`、`Location (City)*`，另有 `Preferred First Name` | 记录字段与来源；未来仅匹配用户确认过的同义事实，当前没有写入 |
| `Why are you interested in this role at Mattermost?*`、`How did you hear about Mattermost?*`、`LinkedIn Profile` | 保留企业和问题限定用途，不猜求职动机、来源或个人链接 |
| `Are you legally authorized to work in Japan?*`及关于现在／未来是否需要雇主赞助的原问题 | 工作资格和赞助属于敏感个人事实，须本人针对原问题确认；本次赞助问题公开摘要被截短，不把摘要当完整原文 |
| `Are you a native Japanese speaker? *`、`Do you have strong English proficiency for business reading and writing?*` | 不从简历语言或虚构演示资料推断实际能力 |
| `Have you directly served defense, national security, or critical infrastructure customers in a technical capacity?*` | 不猜工作经历，不将其他岗位的答案自动套用 |
| `Gender`、`Are you Hispanic/Latino?`、`Veteran Status` | 保留为敏感／自愿信息观察，不默认选择或代填 |

观察中存在标签带 `*`、对应输入的原生 `required=false`，旁边辅助输入却 `required=true` 的情况；不能据单个 DOM 属性断言该业务问题可选。后续描述分别保留原生 required、ARIA required 与标签星号来源，再标注尚未解决的对应关系。

本轮未展开自定义下拉选择，没有核实完整选项集合；不能根据常见 Greenhouse 表单补猜 Yes/No、国家、语言能力或敏感选项。可见空控件也不是已验证的账号身份、提交条件或完整多段经历支持。

## 只读准备模块与执行边界

正在交付的 [`greenhouse-readonly.mjs`](../scripts/greenhouse-readonly.mjs)用于把**当次实际 DOM 快照**整理为准备记录：

- 固定并复核 HTTPS origin、企业租户、岗位 ID 与页面企业标题；不把另一个企业或岗位的问题合并。
- 保存观察到的问题原文、选项、附件接受类型及必填证据，区分原生选择与尚未展开的自定义控件；缺标签、缺身份或选项不完整继续标待核实。
- 为字段记录来源 URL、结构版本和限定 `scope`，绑定站点、租户、岗位及字段版本；默认不记忆答案，不返回输入值、隐藏 token 或会话。
- 输出 `executionEnabled=false`、`productionSupported=false`，没有网络写入、填写、附件上传或提交能力。

这是只读适配准备，不能由模块存在或其后单元测试通过推导真实填写／提交支持。本轮历史 artifact 的 27 控件摘要也不会被改称新模块已实际完整读取问题原文与选项；增强记录的实际云端结果须在后续运行中单列。

## 保留的失败事实与接续验收

首次运行 [39631757636](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39631757636)，来源 `d13c54bdc88ab9dddcc72c28fdde8af46b57c0b7`，把可见 CAPTCHA 信号直接判为 `LOGIN_OR_MANUAL_VERIFICATION`，对 Mattermost／Tailscale 提前停止。这是观察器将“存在验证组件”扩大为“当前公开内容不可读”的误判；旧运行与停止记录保留，不改称当时已完成申请表观察。

修正后本轮 Mattermost 实际公开表单可读。**可见 CAPTCHA 不等于全站阻断，也不证明必须登录**；更不代表提交时无需人工验证。当前未操作验证组件，未验证账号、附件接收、真实提交、可靠回执和未知结果恢复。

第四范式已有独立的实际 5 项公开列表、岗位详情和稳定 ID 证据，见[第四范式只读报告](4PARADIGM_READONLY.md)；它与 Mattermost 申请结构观察分开交付，不合并成任意真实站完整支持。

下一阶段先补实际原文／选项／必填对应与结构版本证据，再实现和验证原值保护、受限问题确认、附件核验、暂停恢复、持久提交边界及可靠回执。真实企业执行与提交仍须另行明确授权和验收，不使用虚构资料试投。当前用户配合清单为**零项**；若真实流程确需本人登录或验证，由 PM 集中组织同一执行 profile 的最小操作，不接收密码、验证码或 Cookie。众行机器人继续待确认、不追问、不阻塞。

本阶段交付待产品经理复核，未宣布产品整体验收或首个真实站完整适配通过。
