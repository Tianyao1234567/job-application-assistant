# 010 真实 Greenhouse 页面原题与 APP 补答接入

2026-11-14（北京时间）。原任务 `5c8b638`。已读取 Manager `628b7b5a05c407bd30dd497938d465231a35b87a` 的交接与 010。工程起点 `a76e79d01f33aa1277c503a2b27b8f8392b0bc7f`，验证源码 `2bbfca4767ea6a7240b0927f54ee7f899e8619b7`。

## 真实页面和版本证据

使用 Mattermost 的 Technical Sales Engineer/ Lead 公开申请页，岗位 `5381946008`，作为技术验证用例。最终托管浏览器在北京时间约 01:23–01:25 直接访问此公开 HTTPS 页面，重启前后各观察到一次 GET、HTTP 200。扩展读取表单中实际可见的控件，并按同公司、同岗位、同规范 URL 对照页面的 Remix loader `routes/$url_token_.jobs_.$job_post_id` 中 `jobPost.questions` 和 `eeoc_sections`。公开 questions API 作交叉核对。本轮以已下载的客户端入口 `entry.client-DUEst_Pv.js`（SHA-256 `ac67bcd84842058d8aa5e503e755ac5bed6b79427d8a77b1a70d086dc8e2f41a`）和岗位模块 `_url_token_.jobs_._job_post_id-BrWKTQyM.js`（SHA-256 `12521377e5c7ac953a3fe9ef0afeb7d345c4884844c47e85865ab2b41e0ca10b`）记录版本。 [公开申请页](https://job-boards.greenhouse.io/mattermost/jobs/5381946008) · [公开问题接口](https://boards-api.greenhouse.io/v1/boards/mattermost/jobs/5381946008?questions=true)

## 产品修复

- 真实 `inspect` 原先保存问题后直接转预检暂停。现在同一任务按原题作用域和版本核对已有资料与答案，可补答的缺项进入现有 `waiting_answer` 和待处理中心。页面未填写时已保存的适用答案也会复用。题目或选项版本变化会重新进入待答，已确认且适用的其余答案继续保留。
- 共享适配器按可见控件和同页公开结构读取有限选项及必填依据。公开页标题仍为翻译占位符 `page_title` 时，只读确认路径要求公开 loader 的租户、岗位 ID、规范地址、公司和可见岗位标题同时匹配。实测页面有简历（必填）和求职信（选填）的文件/手动文本替代组，APP 展示该关系。
- 可回答项可一次保存，选填项可明确本次留空。真实任务从保存恢复时仍只派发 `inspect`，不会产生站点填写、上传或提交命令。已有提交历史仍只允许核对。末端显示「答案已保存，真实投递暂未开放」及仍待核实的控件。

## 验证

- **本机通过**　模型、适配器、APP 界面、运行器和集中补答定点共 84 项通过，含题目变更仅重新提问对应项、占位标题身份保护、保留 `unknown` 及不占用提交额度。变更的 JavaScript 语法及 Git 差异检查通过。
- **托管实际 MV3 通过**　公开岗位进入原 APP，同页收集的工作许可题选项为 Yes / No。已确认的名、姓、邮箱和电话未重复索取。APP 保存 11 项，含 4 项明确留空，读盘核对答案及确认记录。独立后台和隔离浏览器重启、重新配对后，同一任务再次检查。任务总数 1，未出现第二次补答，原网页字段和附件仍为空，提交边界、额度、附件上传证明、扩展提交账本新增均为零。扩展网络观察未见两个申请主机的写请求。测试隔离另外拦截了公开页追踪域名 `c.spl.greenhouse.io` 的两次 POST，公开页自身有 8 条 `false` 脚本错误，APP 与回放的脚本错误断言通过。 [同源码托管作业](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43472248105/job/132046859424)
- **同源码虚构回放通过**　归档完整表单经 APP 补答后沿原任务继续。正常到达、接受、确认各 1，错附件零到达。接受后丢响应，重启和重新配对后原始到达 2→2，仍为 `unknown`。一次接受依赖虚构服务去重。该回放覆盖已有原生请求和附件保护。真实页的新动态控件仍保留各自限制。
- **早期失败**　前两轮分别在首个导航取证与测试未关闭详情弹窗处失败。第三轮实际流程和回放断言均通过，作业因公开页脚本错误计入 APP 错误汇总而失败。随后观察到实际站点首次读取时标题仍为 `page_title` 导致的身份检查失败，修复后同源码最终作业通过。 [首轮](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43470421080) · [第二轮](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43470853409) · [第三轮](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43471224524) · [占位标题失败](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43471867311)

## 剩余和交付

- 电话国家区号来自客户端独立国家目录，完整标签和国家代码绑定待核实。候选地点由搜索供应方动态返回，尚缺选择结果到坐标的可靠绑定。Hispanic/Latino 选择由当前客户端本地化生成，选择可能触发后续 Race 控件，未将未观测的选项加入可答批次。APP 显示这些具体限制，其他题可保存。
- 未执行真实站填写、上传、提交、企业回执验证或生产去重调查。未重跑无关全套、旧 44 项及 candidate.8/.10 更新，复用经理已接收的 009 证据。当前只交验证源码与阶段证据，未另建更新包。 [candidate.12 预发布](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/v0.2.0-candidate.12-consent-review)
- Manager 审阅本轮，Engineer 跟进上述动态控件的可信来源及必要集成。真实企业投递保持暂停，PR #5 保持 draft。用户无需更新、重导资料或试投。 [PR #5](https://github.com/Tianyao1234567/job-application-assistant/pull/5)
