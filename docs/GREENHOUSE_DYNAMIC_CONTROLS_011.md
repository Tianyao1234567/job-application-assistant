# 011 Greenhouse 动态控件来源及原生映射

以下来源来自实际公开岗位。测试只使用公开数据与虚构确认，源客户端片段仅用于隔离回放。

- 电话目录来自页面 vendor 的 intl-tel-input 25.10.0 中 `getCountryData()`。使用页面英语本地化和客户端默认名称组成原文标签，再按原渲染器将美国置首。共 244 条。美国 `us` 与加拿大 `ca` 共享 `+1`。原生构造发送经号码控件规范化的 `phone`。国家 ISO 作为本地选择及回放表单核对依据，原生协议无独立的电话国家字段。
- 地点仅查询当前页面公开配置的 Pelias `v1/autocomplete` 城市候选。验证时无公开配置值 HTTP 401，有公开配置值 HTTP 200。Springfield 返回多个城市，例 Missouri 的 `85971363` 与 Massachusetts 的 `85950393`。APP 绑定本次搜索返回的 ID、原显示名、纬度、经度和国家。地点进入原生 `location`、`latitude`、`longitude`、`country_short_name`。编号仅用于本地选择保护。
- 实际客户端从本地化生成 Hispanic/Latino；Yes 对应 Race `4`，No 清空并显示排除 `4` 的 Race 菜单，拒绝披露对应 Race `8`。本地留空无需推定属性。Race 答案绑定同一任务的已确认 No 分支，分支变化时此前答复保留为历史并失效。
- 当前入口 `entry.client-HYmR2EDs.js` 源码 SHA-256 `d28b23c702a0466c9ebdd0ecd15d9d8548ac30a3000c2b1683f56353552b0d6c`。岗位模块 `_url_token_.jobs_._job_post_id-CleMz2rH.js` SHA-256 `6e5a93d3cfd706f945627e0b012b42b7ccb62acfd85e7b91f734e8294275a047`。测试使用当前构造器 `Zo` 含依赖及发送函数 `la` 的原样片段，固定 UTF-8 字节范围和摘要见测试来源清单。共享适配器独立比较请求，继续验证岗位、动态字段及精确附件。旧归档回放沿用原固定版本及结构摘要。 [实际申请页](https://job-boards.greenhouse.io/mattermost/jobs/5381946008) · [当前公开客户端](https://job-boards.cdn.greenhouse.io/assets/entry.client-HYmR2EDs.js)

## 产品与验证

2026-11-14（北京时间），继续原任务 `5c8b638`。已读取 Manager `6f3d7bb02ca3859acc4c8be6764669e143258678` 的交接和 011。接续基线 `c9a6a97e58a3690d3855004503f4bea42cab937a`，源码 `d649586b54d006ee86e4fbd5367c500bd482532f`。

- 三个控件进入既有待处理和保存路径。旧题照原版本复用。区号和地点必须确认本次候选，条件题仅随已确认的对应分支保存。原题版本摘要进入可展开详情。真实页保持 `inspect` 及原任务的 010 保护。
- 本机受影响 86 项通过。另用当前客户端原样片段和现有冻结比较验证坐标、Race、手机号码、国家字段等五种请求变更会被拒绝。初次本机字节校验因旧归档 fixture 的 Windows 换行转换失败，随后对照 Git 版本的换行和源码片段完成核对。
- 实际公开页的结构会在客户端渲染后从 DOM 移除。只读适配在必要时获取同一公开岗位 HTML，并继续校验公司、岗位、可见标题和匹配版本。早期作业分别暴露结构时序、浏览器试验定位器及旧普通资料填写路径的冲突，已按这些断点修正。一次修改工作流超时时长的推送被 GitHub 凭据权限拒绝，已恢复原工作流并沿其时限验证。
- 未执行真实企业填写、附件上传或发送，未重启生产去重调查。旧大套件和已接收的其他生命周期场景未重跑。当前支持范围是固定的公开英文渲染器和已观察结构。隔离回放使用当前官方构造和发送函数，控件事件和企业响应由虚构服务控制。

## 托管结果与候选

- **公开页实际 MV3 通过。** 直接访问同一公开岗位，重启前后各一次申请页主导航 GET 200。APP 共保存 14 项，其中 5 项明确留空。包括电话国家 ISO `us`、Springfield Missouri 的地点 ID `85971363` 和上述坐标，以及在隔离 APP 明确留空 Hispanic/Latino。独立后台与隔离浏览器重启并重新配对后，同任务复用，无重复问题、页面填写、上传、申请写请求、提交边界、额度或新增提交账本。测试层拦截两次公开页追踪 POST，记录八条公开页自身脚本错误。 [最终实际 MV3](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43544483191/job/132292444119)
- **当前官方原生构造的隔离回放通过。** APP 明确选加拿大 `ca/+1`、同名候选之一及 No 后新出现的 Race。原生号码、地点名称/坐标/国家和所选 Race 值与独立冻结比较一致。另一个场景明确选择拒绝披露，原生 Race 为 `8`，没有补答隐藏 Race。正常到达/接受/确认 1/1/1，错附件 0 到达。服务接受后丢响应，独立进程和浏览器重启并重新配对后到达数 2→2，仍为 `unknown`。一次有效接受依赖虚构服务去重。Yes 的隐藏映射来自当前官方代码，已在模型定点验证换分支使旧 Race 失效，本轮实际 MV3 回放提交覆盖 No 和直接拒绝披露。 [托管原生回放](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43544483191/job/132292444119)
- **最终 Windows 升级通过。** 同源码从 candidate.8、.10、.12 实际执行单文件更新至 candidate.13，保留任务、答案、附件字节、浏览器身份和提交账本，旧 `unknown` 禁止重投。candidate.12 的只读确认继续为 `inspect`。支持清单保留 .5/.6/.8/.10 并新增 .12。两项打包定点在托管运行中通过。 [Windows 作业](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43544483308/job/132292445685)
- **先前失败和取消。** 首轮 MV3 未识别部分公开选项，Windows 的旧断言漏列 .12。后续作业修正后，公开页先后到达输入搜索和结果选择，遇测试控件定位与原生下拉不可见断言。继续修正后公开页补答及恢复通过，随后修复虚构回放中旧普通填表尝试写入结构化地点的断点。中间部分 Windows 作业被替换运行取消。最终同源码两条作业均通过。 [首轮 MV3](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43543123121) · [首轮 Windows](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43543123118) · [修复前回放](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43543819806)
- **审查草稿。** `0.2.0-candidate.13` 包含 010 和 011，实际回下载 `update.cmd` 为 **362783 字节**，SHA-256 `63651d9293ef76eb501aeb070f925b09829ac68a8a6b8d49425dfbb92ad4540c`。Manager 在隔离安装目录复核可先运行 `停止.cmd`，将单文件放到 `启动.cmd` 同目录运行，看到 `UPDATE_COMPLETE` 后以原方式启动。下载需仓库权限。candidate.12 保留原预发布。 [candidate.13 草稿](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/untagged-e51eb5125a18b220e9da) · [下载 update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/untagged-e51eb5125a18b220e9da/update.cmd)

下一责任人为 Manager 审查。真实企业提交仍暂停，PR #5 保持 draft。用户无需重导资料、重装或试投。
