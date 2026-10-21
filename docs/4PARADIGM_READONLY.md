# 第四范式公开招聘：单浏览器只读预研

更新：2026-10-21（Asia/Shanghai，北京时间）。接续[PM-0010](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6309088895)，只核实官网来源、实际公开列表／详情、租户和稳定岗位ID。本轮不注册、不登录、不填申请、不上传、不提交；真实站自动投递仍是后续目标，目前仍为待适配。

## 第一轮：真实页面已出现，导航等待误停

实际运行[39587500605](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39587500605)，来源[`80ca5b91f1947b853e4d4d354a3d50ef4a0b3601`](https://github.com/Tianyao1234567/job-application-assistant/commit/80ca5b91f1947b853e4d4d354a3d50ef4a0b3601)。[browser作业119180062297](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39587500605/job/119180062297)于2026-10-21 **18:50:40–18:51:50**实际完成；workflow与browser均success，但业务结果为`STOPPED / NAVIGATION_TIMEOUT`，不能称只读岗位发现通过。

已实际读取该作业[Checks完整摘要](https://api.github.com/repos/Tianyao1234567/job-application-assistant/check-runs/119180062297/annotations)。短期JSON证据为[public-browser-readonly artifact 12340511825](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39587500605/artifacts/12340511825)，artifact ZIP为1510字节，保留至2026-10-28 **18:51:45**；未声称下载或人工检查了artifact全文。

| 实际观察 | 结论与边界 |
| --- | --- |
| 单个隔离可见Chromium实际访问`https://www.4paradigm.com/about/hr.html`，主文档HTTP200；标题“第四范式招聘官网-求职找工作-最新招聘信息”，可读正文1958字符 | 官方人才页真实DOM已出现，并非企业网站没有响应；没有真实账号或扩展 |
| 实际可见“查看详情”链接到Moka社招与校招，社招公开摘要为`https://app.mokahr.com/social-recruitment/4paradigm/102013` | 这是实际官网出链；原href另有hash，公开显示删去了hash，因此该摘要不称完整href。完整安全href仍作为内部识别／后续导航值，SHA-256为`8e098669024e917fd744f34046bab92e045d1189ecf2abcf9e4bf6d9a5ade5a5` |
| 校招实际链接的公开摘要带`?edit=1&hireMode=2`，原href亦有hash | 与[PM-0010校招query补正](PM0010_URL_CORRECTION.md)一致；未跟随校招。完整href摘要为`051ae5fa683c50fda26b83925874380575e576b7550e6c23842207629470c52c` |
| 官网正文出现“产品经理”“研发工程师”“架构师” | 只是官网职业方向文本，不是已核实的Moka公开岗位列表或稳定岗位ID |
| 导航仍等`domcontentloaded`至30秒超时，代码先以导航失败返回，没有继续跟随已观察的社招href | 属于采集器误停。原始facts中official/source=false是早返回造成的未置位，不能据此覆盖上面已保存的200、标题与锚点；保留该运行事实，不改称完整预研成功 |
| 拦截器看到GET 71次、POST 2次；两次POST均在发出前中止，公开摘要拒绝展示对应不安全URL | 方法计数含尝试，不等于71次成功网络响应；没有表单操作或真实申请写入。只读方法边界保持，未为让页面加载而放开未知POST |
| 隔离目录回收`targetRemoved=true` | 仅清理本轮隔离浏览器目录，无生产profile／个人数据 |

该观察已经足以修复采集器的等待条件，无需猜测Moka接口：后续导航改为主文档`commit`，在同一30秒总预算内等实际可见标题与正文，同时保留主文档状态、DOM是否就绪、耗时和超时信息。短加载壳仍只能作为停止点，不把它当岗位发现。

## 第二轮：实际进入Moka社招，未取得岗位

应用导航等待修复后，实际运行[39588958656](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39588958656)，来源[`e7d5d5b1d6e968adc5de1e4962c4d1234178906f`](https://github.com/Tianyao1234567/job-application-assistant/commit/e7d5d5b1d6e968adc5de1e4962c4d1234178906f)。[browser作业119184905441](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39588958656/job/119184905441)窗口为2026-10-21 **19:02:32–19:03:14**，workflow与browser均success；业务结果仍为**`STOPPED / DETAIL_OR_STABLE_ID_NOT_VERIFIED`**。这次不再误停在官网，仍未达到PM要求的岗位发现最低证据。

已读取[Checks完整摘要](https://api.github.com/repos/Tianyao1234567/job-application-assistant/check-runs/119184905441/annotations)。[短期public-browser-readonly artifact 12341018773](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39588958656/artifacts/12341018773)的ZIP为2234字节，保留至2026-10-28 **19:03:09**；没有把未下载的ZIP正文称为已审查。

| 实际步骤／证据 | 本轮结论 |
| --- | --- |
| 官网人才页HTTP200，实际DOM就绪，2133毫秒 | 官方来源已核实；第一轮因`domcontentloaded`造成的误停已修复 |
| 使用实际社招锚点的完整安全href导航，主文档302后200，2828毫秒 | 本次真实浏览器能到达Moka社招，不沿用此前无浏览器GET的302上限作为最新停止点；旧观测保留 |
| 实际页面标题“第四范式（北京）技术有限公司 - 社会招聘” | 社招入口上的公司身份得到实际页面支持；`4paradigm/102013`作为观察到的入口路径保留。尚未取得任何岗位详情，因此不能扩张成详情租户／申请账号已核实 |
| 社招页面可读正文96字符，无岗位文本；观察到另一个岗位导航样式hash锚点，跟随后正文171字符 | 该锚点不是已经核实的岗位详情。第二次hash导航没有新主文档HTTP状态（记录null），不能当作详情HTTP200；正文无职责／任职要求，稳定ID为null。公开摘要不发布该hash原文，其完整安全href摘要为`c9b12a0c3306ba00b69f2296022020c4e70abaef6a9cdb8a60444294cdebdf2b` |
| `publicListVerified=false`、`detailVerified=false`、`stableJobIdVerified=false` | 公开列表、至少一个详情及稳定岗位ID仍未通过，未实现该站产品解析器或伪造发现任务 |
| GET尝试100次，POST尝试19次且全部在发出前中止 | 公开GET/HEAD策略保持。已观察的被拦请求包括Moka `POST /api/outer/ats-jc-apply/website/feature-switches`与Sentry envelope；这些不是已证实的列表接口，不根据名称猜接口或解除整站POST拦截。页面配置／数据请求被拦可能影响呈现，不能宣布目标站没有岗位 |
| 实际观察没有可见密码表单、验证码字段或验证iframe；文本有“登录” | 不能据此判定必须登录或要求用户注册；登录文字不等于登录墙，也没有绕过人工验证 |
| 同一隔离浏览器，`applicationRequestsSent=0`，清理`targetRemoved=true` | 没有真实注册、填表、上传或投递，未读取个人会话；同一真实浏览器依次完成来源与社招检查 |

下一步可验证入口仍是官网人才页→当次实际社招href。需要继续观察公开页面实际的只读数据加载方式，先取得可审查的请求语义与DOM，再决定是否允许某个确认为只读的查询请求或编写页面解析；本轮没有取得该证据，不推测供应商API。若之后实际出现登录／人工验证，由PM组织同profile最小操作，不绕过。

## 接入方案与当前验证边界

只读发现入口固定从上述已核实官网人才页开始，读取当次实际社招href，再使用完整安全URL跟随；不手工构造API、不绕过登录或人工验证。URL身份与公开脱敏显示分开，凭据／不合适目的地仍拒绝。只有真正观察到租户与岗位页面后，才据页面实现该站解析。

两轮目前实际核实到官方来源与Moka社招公司身份；公开岗位列表、至少一个真实详情、详情所属租户及稳定岗位ID仍未取得。不能从官网文本、入口段、泛岗位hash导航或workflow success推导这些已通过，也不能用fixture解析器代替真实站适配器。第一轮误停、第二轮只读方法边界造成的未知项分别保留。

当前无需用户配合；众行机器人待确认、不追问、不替换近名公司、不阻塞本预研。只有实际遇到必须本人完成的登录或人工验证，才由PM一次性组织同一执行profile上的操作，不收取密码、验证码或Cookie。
