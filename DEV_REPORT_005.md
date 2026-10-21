# PM-0010：修复、Windows可见浏览器与第四范式只读预研

2026-10-21（北京时间）。沿`dev/pm9-demo-windows-readiness` / [PR #5](https://github.com/Tianyao1234567/job-application-assistant/pull/5)继续，base仍为`dev/local-workflow-foundation`。PR #4/#5保持draft、未合并；以下是开发实际验证，**交PM验收，不代替PM验收结论**。依据[PM-0010](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6309088895)，接手DEV-0033、阶段回写DEV-0034。

F1 Windows启停、F2岗位资料与新图遮罩已有实际通过证据；F3完整URL语义与受限只读查询策略通过回归。第四范式真实站的来源、岗位列表、详情与稳定ID按下文独立报告，不由workflow success推导。PM此前已接收的candidate.1完整性、后台9项及云端虚构站16项继续有效，历史见DEV_REPORT_003/004。

## 本轮可查看成果及真实来源

| 成果 | 实际运行与结果 | 来源SHA |
| --- | --- | --- |
| 最终Windows候选与可见浏览器 | [39591700007](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39591700007)，workflow success；后台9/9、真实可见浏览器4/4；63源码/JSON另计、20+172=192基础测试通过 | `a605bb1be89250a48a027e94134bf82c49d6debc` |
| 新7图实际扩展演示 | [39590989886 / browser119191683542](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39590989886/job/119191683542)，workflow/browser success；HTTP申请、实际接收、唯一回执各1 | `cd890f2eac6fc12576df7764a3b7dcd47dac6e15` |
| candidate.2源码包 | [source-candidate artifact12342167482](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39591700007/artifacts/12342167482)，59源码+SOURCE=60项；实际Windows下载、原生解包逐项核验 | 同a605bb1 |
| Windows原始JSON证据 | [artifact12341837226](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39591700007/artifacts/12341837226)，后台与浏览器两份独立记录 | 同a605bb1 |
| 新演示PNG/离线index/manifest | [fictional-demo-reviewed artifact12341287042](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39590989886/artifacts/12341287042)，最终像素检查含图05任务标识 | 同cd890f2 |

候选ZIP为**444113字节**，SHA-256：
`46b46ce813bc92ad772dd9a422d3b5f7051b0c2f958b3494426d523edc5c0305`。

Cloud独立构建与托管构建摘要一致；Windows对实际下载的ZIP及59文件再核验，不是只测仓库目录。版本`0.2.0-candidate.2`，不能沿用candidate.1旧包。allowlist Git源码不含依赖、runtime、资料、会话或媒体。候选内报告为构建时进度快照，本仓库最新DEV_REPORT_005补齐构建之后的运行结果；后续报告提交不冒称已运行过该新SHA。cd890f2到a605bb1的变化是关闭持久暂停及其测试、Windows测试与只读观察/报告；F2模型、适配器、演示脚本未改变，演示仍明确标其实际来源。

到期（北京时间）：**演示10月24日19:20**；候选10月28日19:24:39；Windows证据10月28日19:25:42。artifact外层下载ZIP大小与内层候选ZIP大小不同。Cloud读取过完整Checks摘要与artifact元数据；Azure跳转下载403受限，未冒称人工下载审图。PM可通过artifact审查。

## F1：Windows管理台与CMD的统一生命周期

管理台、直接Windows后台和CMD使用同一管理入口，统一依赖检测、启动锁、精确Node入口/PID归属、真实扩展profile与新鲜心跳就绪、关闭。UI显式打开最多等待45秒，失败不自动重放。停止期间拒绝新开浏览器；后台关闭会回收项目浏览器，错误PID与占用端口不结束其他程序。停止持久写入手动暂停，重启或次日计划不能自动解除；重复关闭已暂停状态不反复修改任务版本。

[Windows作业119194157574](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39591700007/job/119194157574)实际运行于Windows2025 / Node24.22.0 / PowerShell5.1.26100.33648 / Chromium145.0.7632.6，候选置于含中文和空格的隔离路径：

1. 后台模式启动，从真实管理台点击打开，实际加载扩展、连接profile并取得ready标记。
2. 安全恢复一个已跳过、无可执行任务的虚构状态（manualPaused=false），停止后确认**创建**持久暂停；项目进程和17321/17322/测试CDP17323端口释放，重启保留同taskId及资料/附件版本。
3. CMD启动实际可见浏览器，再由管理台重复打开，同launcher和Chromium根PID被复用。
4. CMD停止后捕获的项目进程均退出、端口释放，任务及暂停保留；fixture台账合法缺失明确记录absent，不制造空文件或冒称独立HTTP计数。managedCleanup与隔离目录cleanup均true。

初始为了在“尚无执行浏览器”的管理台点击按钮，另有短暂无扩展的可见控制浏览器，响应确认后关闭；它与执行浏览器启动短暂重叠。**仅一个浏览器加载扩展并执行**，不声称所有Chrome根进程始终最多1。CDP仅显式GitHub托管隔离测试双重开关启用并绑定loopback，生产入口不启用。

后台9项保留缺依赖/Node、中文空格路径、重复启动、停止/重启、两个占用端口、错误PID保护。新增服务测试验证运行中明确停止→次日计划到期重启仍暂停、不消耗计划、不下发命令，提交边界仍只能核对；服务测试14项通过。

## F2：来源岗位资料与最终PNG

核实详情租户、岗位稳定ID和详情来源后，仅合并标题/公司/城市白名单；不从简历或演示脚本捏造。手动详情和申请链接进入同一任务，实际读取“C++ 开发工程师 / 虚构甲公司 / 上海”；补答、提交结果及真实服务/profile重启保留资料。来源缺失仍未知。手动后发现同ID补充资料，不换taskId/去重身份，不清空提交边界；恢复用临时只读详情页，不触碰原表单值或File。

实际演示还核对beta手动申请链接的详情资料并在填表授权前暂停，beta为0 POST；alpha缺答、补答、暂停恢复、附件与接收字节摘要均通过，alpha最终POST/接收/回执各1。一次实际列表发现后同任务及提交历史保留；截图07在真实服务和同profile重启后生成。

遮罩使用敏感元素内部CSSOM覆盖层，保留管理台CSP，在原生dialog顶层内生效；先检查计算样式，再解码最终PNG逐像素校验不透明RGB，图05任务标识区域有正向断言。7张新图实际检查通过，manifest有逐图大小/摘要。**没有宣称开发者逐张人工视觉审图**；仍需PM查看新图。旧图05漏出隔离任务UUID的事实不改写，旧artifact不重新标成遮罩通过。

Linux的52次采样最多13个后代进程、RSS求和峰值1906MiB、Node206MiB，可能重复计算共享页；只代表该runner，不承诺用户Windows内存占用。一个浏览器顺序重启，隔离目录回收。

## F3与第四范式：完整URL和实际只读边界

通过安全检查的完整URL用于导航/去重，公开摘要另行脱敏/截短；query/hash/长链接不合并，凭据或不合适目标拒绝。4项URL测试通过；[2026-10-21校招href补正](docs/PM0010_URL_CORRECTION.md)注明PM来源，不倒改1118d9f历史观察。

实际从官网人才页到Moka社招200，标题确认“第四范式（北京）技术有限公司 - 社会招聘”。全POST拦截阻止公开列表查询属于工具自身限制，已据真实页面请求增加精确只读查询门控；仅当次浏览器自行发出的已观察路由，校验4paradigm/102013、JSON键/类型和预算，拒绝未知路由、额外私密字段、登录/上传/申请。9项门控回归通过。没有构造或重放API，没有将虚构资料注册/投递真实站。

最终观察详见[第四范式只读报告](docs/4PARADIGM_READONLY.md)及[集中准备](REAL_SITE_PREPARATION.md)；第六轮[39593353603](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39593353603)，源`179b6f594ba3fde2a2bda8a3a61abd2b1eec1af2`，已实际通过官网→租户→5岗位列表→“大模型系统优化工程师”详情与稳定ID；[完整详情](https://app.mokahr.com/social-recruitment/4paradigm/102013#/job/733c2666-1b8d-4ad4-bf80-5635647f13a9)。真实申请发出0，申请表/上传/提交尚未验证。产品真实站仍显示待适配，不能把研究入口当已支持真实申请。

## 失败历史与验证范围

| 运行 | 实际失败/不足与后续处理 |
| --- | --- |
| 39587500605 / 80ca5b9 | 官网HTTP200/正文/锚点已出现，但DOMContentLoaded等待超时导致误停；改为commit与有界实际DOM等待 |
| 39588110817 / e7d5d5b | 后台9项过、浏览器安装完成，但外层辅助管道EOF等待100秒；改普通文件快照和进程exit，未称浏览器场景通过 |
| 39589216338 / e7d5d5b | 图05最终像素断言失败，0申请POST，失败媒体未发布；定位CSP阻止style标签及原生dialog遮罩，修复后新演示通过 |
| 39588958656 / e7d5d5b、39589796909 / c4255e1 | 官网→Moka成功，但全POST拦截使公开数据查询未完成；hash菜单不是详情，不谎称列表/ID通过，不归咎网站登录 |
| 39590662611 / cd890f2 | 浏览器前三场景通过，第四场景进程/端口检查后读取未生成fixture台账ENOENT；修正合法空状态断言，最终9+4实际通过 |

开发、自动检查、浏览器运行均在Cloud/GitHub托管runner；Cloud工作区`/workspace/job-application-assistant` / Linux Node24.19.0，未提供额外环境ID，不编造。api.github.com实际读写协作/调度成功。开发分支改为PR事件一次检查，main保留push，避免重复CI互相取消；取消作业不计证据。

用户电脑现场、本人账号/登录、真实简历上传与真实投递尚未验证。当前用户配合**0项**：不要求安装、下载、代跑或注册。众行机器人想不起准确身份，列待确认、不追问、不替换近名公司、不阻塞。确实遇到本人登录或人工验证时，由PM一次性组织同执行profile的必要步骤，不接收密码、验证码、Cookie或会话导出。最终验收由PM记录。

## PM-0011补充：真实首站与连续过程演示

阶段读取Issue发现[PM-0011](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6314222151)，替代固定第四范式首样本：允许选择任何官方公开招聘企业，不让一站阻塞；界面已获用户认可，保持现有方向。PM-0010修复继续交PM验收，新的真实站完整适配按公开岗位、表单识别、受控回放、本人确认后实际执行分阶段报告，公开入口调研不是最终产品完成。

正在并行准备1–3分钟隔离虚构站**真实连续录屏**及其他官方招聘样本的岗位/申请表只读观察；尚未生成录屏前不把7张图称为视频。不会向真实企业填入/上传/投递虚构身份。暂停需保存原问题、选项、用途、来源、确认值与资料版本，恢复前核对页面与已有结果；不确定或已越提交边界不得重投。已验收的答案记忆仍是同站点、同岗位scope、同原文且默认不勾选，不能称为跨公司通用理解或模型训练。

**当前没有已常驻部署、可点击运行的公开后台网址。** 产品仍是本机管理网站+插件，GitHub/Cloud开发执行不是产品常驻部署；不提供失效localhost，不把静态index冒充后台，不为演示新建收费服务或公开真实管理端。后续连续录屏会作为可查看过程证据。

当前产品基础路径不调用GPT/其他大模型API，不需要GPT API key；开发使用Codex的消耗另计，也不宣称全部云资源免费。没有新增付费AI或上传完整简历的调用。若以后加入可选AI辅助，由用户先选择用途、数据和费用上限。
