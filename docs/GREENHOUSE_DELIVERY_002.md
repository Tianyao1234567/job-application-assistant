# Greenhouse 生产缺口交付 002（待 Manager 验收）

任务：[Manager 分项验收及后续唯一任务](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6335447669)。沿原开发分支及 draft PR #5，未合并。用户真实企业完整申请尚未执行或验收。

## 代码与可用入口

运行代码与安装包来源：`ff528ecb4535fc5d9d0d3ed75edf6485a9c923e0`。主要检查点：`92d42d7` 自定义选择/人工验证恢复；`b2f995a` 网络受理核验；`62d03f4` 同区号国家区分；`fd48ee6` 原生上传完成后输入框移除及引用协议；`ff528ec` 未确认附件阻断。

[candidate.4 下载入口](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39750254547/artifacts/12413073425)（GitHub 登录后下载，2026-10-29 08:46:41 UTC 到期）。外层 artifact 中包含实际源码 ZIP、`SOURCE.json`、`SHA256SUMS.txt`；先解压外层，再解压内层 ZIP。内层 ZIP 551593 字节，SHA-256：

`207f2cf505f5de499f7d7578642e1aec68411e6746cc70db2031878aed11786c`

62 个允许清单内文件，无个人资料、运行数据或测试依赖。包按已提交 Git blob 构建并逐文件回读核验；构建后文档提交不改变此来源绑定。不是免安装二进制，也没有常驻公网后台。

运行入口：按 [Windows 启动说明](../WINDOWS_START_001.md)，准备 Node.js 24（x64），将内层目录解压到独立短路径；只查看后台可运行 `启动.cmd -BackendOnly`，访问 `http://127.0.0.1:17321/`。执行投递需要锁定的 Playwright 1.58.2 / Chromium：一次运行 `安装运行环境.cmd` 准备运行依赖，再运行 `启动.cmd`，使用专用浏览器，后台须显示已连接。停止使用 `停止.cmd`，保留 `.runtime`。这些是产品安装/使用步骤，不要求用户运行云端开发测试。其他平台可用 Node 启动后台，专用浏览器见现有运行文档。

## 本轮实际实现

- 读取同租户/岗位的官方页面公开 loader schema，有限自定义选择仅匹配完整原选项；打开菜单与点击选项各自授权、提交前复核。动态国家/城市由本人先选，再确认当前精确值，仍标记选项全集未知。国家使用实际国旗 ISO 码区分共享区号，不将搜索框文字当成已选值。未覆盖原值，未猜测目录。
- 公开 schema 区分 Resume/CV 必填与 Cover Letter 可选。原生上传完成后观察文件名；官网移除 `#resume` 时，在同一页面的扩展隔离世界保留已校验 File 对象、字段结构及对应上传分组。后续恢复/重新注入仍核对名字、大小、摘要、分组、schema；移除、替换、额外未确认附件均阻断。页面重载会丢失这个内存证明，须重新核对/选择附件，不能假装网站保存了草稿。
- 活跃人工验证暂停；本人完成后同一任务/执行 profile 恢复，重新核对表单、答案及文件。只观察完成状态，不求解、不写入、不传出 provider token。已知 invisible enterprise anchor 不当成待人工挑战；失效响应重新阻断。生产站验证码实际完成及服务端拒绝后的安全码路径仍须本人首次真实使用核实，不能由本地模拟替代。
- 新增扩展 `webRequest` 只读观察，限已有 Greenhouse 两个主机及本地虚构站；仅注册执行器为已确认任务/岗位/邮箱/附件/标签页预置核验。不持久保存请求体、验证码或上传签名 URL。
- 成功须同时观测该任务的实际 POST 2xx 和精确对应 confirmation 导航。预加载 `confirmation_message`、页面“感谢”文字、单独跳转、其他标签页、非 2xx、第二个不同请求、错误及缺失证据均不能算成功。提交边界先持久保存，未知仅核对，不重投。
- 附件证据明确区分：请求内字节模式核对实际字节摘要；官网 `resume_url` 模式要求本扩展校验过源 File、实际上传完成标记、精确文件名及受限无签名参数的 S3 引用。后者是客户端上传/引用绑定，**不是回读生产服务端附件字节，也不是企业申请编号**。不符合已知引用规则时保留未知结果，不放宽成任意 URL。

## 验证与依据

本地新增/受影响 89 项通过（Greenhouse 模型、UI、页面适配、HTTP、网络观察、执行器与执行器注册）；实际 Chromium 单项 DOM 检查验证上传后输入移除、重新注入仍保持源 File、上传文件名变化阻断。它不是 MV3 证据。

托管 MV3/必要测试/包：[Cloud checks 39750254547](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39750254547)，来源严格为上述 SHA。全部通过：必要单元/安全检查 20 项 + 本轮相关 89 项（109 项）；实际加载 MV3 Chromium 145.0.7632.6 的两个新增场景均通过，未使用 dispatcher 替代。正常场景经过手选动态控件、有限选项授权写入、原生上传输入移除、人工验证补答与同任务恢复，取得网络受理证据；异常场景实际请求附件字节不符，即使服务端 2xx/确认页也保留 unknown，核对后无第二次 POST。两个岗位各一次申请请求：原始 HTTP 2、持久尝试 2、虚构服务端回执 2，外部请求 0。后一个服务端回执不被产品判作任务成功。

[真实 MV3 证据 artifact](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39750254547/artifacts/12412599648) 包含 `greenhouse-production-browser.json`，2026-10-29 08:48:03 UTC 到期；浏览器检查与包构建同 SHA。没有 production 企业申请，也不把此 MV3 回放当成真实企业验收。

公开生产依据：本次仅验证 HTTPS GET，未填真实企业表单/上传文件/操作 CAPTCHA/提交。实际公开表单 schema 白名单见 [Mattermost 表单依据](greenhouse-mattermost-form.json)。[公开模块只读取证](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39749293061) 获得官方 `entry.client-DnzCgKgt.js`（161149 字节，SHA-256 `378c96ee0ba18cc20667ed84f7822c0d78d833296d843097040c47e2dfba2728`）：`Na.uploadFile` 原生上传、`La` 的 `resume_url` / `resume_url_filename`，`to` POST JSON，`response.ok` 后原生 `confirmationPath` 导航。匿名上传 origin 元数据 GET 返回 HTTP 错误，没有上传或探测真实附件；实际 S3 引用规则仍需首次本人使用验证。

历史已验收 184 项及 6 场景沿用原 SHA/CI 证据，未以本轮新浏览器脚本重跑；PR 规则自动触发的普通检查独立记录。未新增 Windows 验证、录像或真实投递。

## 尚未通过的验收

真实岗位匹配、本人资料与附件、真实 CAPTCHA、S3 接收行为及生产完整投递回执，须在 Manager 提供本版本并组织用户逐项确认后验证。Mattermost 只作为已限制的技术样本，不代表岗位适合本人。新增真实来源出现不支持的控件/附件/安全码时暂停，沿同任务核对；不为云端验证向企业试投。
