# 原生请求离线冻结检查点（Engineer，待 Manager 审阅）

2026-11-12（北京时间）。接续任务 `5c8b638`；工程起点 `26e206e41294b309aeb4eca13b98108daff20056`，已读 Manager 文档分支 `304ac4bc90ed9e2f1def7614810859a1e66a6966` 与本次用户转达的、更晚的范围纠正。工程与文档仍在 `engineer/profile-import-usability`，不从 main 重做，不修改 Manager 交接，不合并 PR #5，不发布更新包。

## 本次完成的阶段

从公开 [CI39749293061](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39749293061) 的 22 个注释分片重建历史官方客户端，先验证完整 161149 字节及 SHA-256 `378c96ee0ba18cc20667ed84f7822c0d78d833296d843097040c47e2dfba2728`。再逐字节提取 14 个依赖及函数，包含原始 `Da` 应用状态构造和 `to` 请求构造，没有用固定 FormData 或重新实现的构造器替代。切片来源、UTF-8 字节范围、完整源及各片摘要见 [来源清单](../local-app/tests/fixtures/greenhouse-native-client-source.json)，[核验脚本](../local-app/tests/fixtures/verify-greenhouse-native-client.mjs) 对完整源和切片逐一检查。完整公开源仅保存在忽略的 `.runtime/public-source/`。

离线浏览器用真实 React 状态、现有版本化公开岗位 schema 和以上原函数产生实际页面 fetch。捕获 Chromium 准备发出的完整 JSON，同时观察原生 fetch 的 method、URL、显式 Content-Type、credentials 默认 same-origin 和 redirect 默认 follow。**没有认证浏览器附加的 Cookie、Origin、Sec-Fetch 等 HTTP 会话信息，不能称为完整会话身份绑定。**

覆盖范围：

- schema 原函数构造的 `answers_attributes`：文本、0/1选择及按选项 ID 构造的结构；基础资料、附件对象引用、compliance、employment、tracking、time_zone 等完整 application 一并比较。
- 顶层动态 CSRF 键和值、异步 assessment 返回的虚构 enterprise token、security_code 的原生优先关系、captcha_retried、request_token、字符串或对象 fingerprint。测试不解验证码，不取得真实 provider token。
- DOM 中保留不同的诱饵值，只修改 React 应用状态时实际 JSON 随之变化，旧冻结证明被拒绝。同名文件换为另一对象引用也被拒绝。
- 独立的离线冻结模块对完整原始 JSON 字符串及 transport 作摘要，深层复制/冻结；绑定任务、授权、资料/附件/schema/client/state 版本及调用方上下文。重复 JSON key、额外字段/附件、未确认的答案变更、不同 requestId、上下文变化、并发第二次冻结均拒绝。模块没有 send、release、持久化或成功回执接口。

## 真实执行及限制

当前可用云环境 `/workspace/job-application-assistant`，Node `24.22.1`、Playwright `1.58.2` 驱动已有受管 Chromium `156.0.8078.79`，没有下载浏览器或在用户电脑运行开发测试。

| 检查 | 实际结果 |
| --- | --- |
| 完整官方源及 14 段逐字节校验 | 通过；fixture 4308 字节，SHA-256 `17a26bece615b1cf0069d69f793f42ad780575e88d97bd1c332f4bf1fa80fa5a` |
| 新增离线单元 | 10/10 通过 |
| 上述单元 + 既有 runner/receipt 定点 | 30/30 通过；包括原生暂停、unknown 不二次点击、错误附件不形成回执 |
| 单项 Chromium 离线 React 请求场景 | 通过；4 次 POST 意图均由测试 harness abort；独立虚构服务收到 0 次，外部请求 0，确认导航 0 |
| 真实 MV3 tab/document 身份读取（新增可选模式） | 未通过：15 秒等待 worker 超时；worker 事件/当前 worker/扩展列表均为空，当前受管策略 `ExtensionInstallBlocklist: ["*"]`；不修改或绕过策略 |
| 加入既有模型测试的扩大定点 | 44 项：41 通过、3 失败，不能称整组通过 |

三项失败在 `greenhouse-model.test.mjs:73/125/150`，设置旧测试资料时分别触发 `model.mjs:244` 的旧英文显式退役检查，未进入对应业务断言。独立 `git archive 26e206e` 解包原始源码后，原模型文件仍为 14 项中 11 通过、同样 3 失败，临时目录已清理。没有为本次离线实验更改资料保护逻辑或重跑已验收资料/Windows全套；生产模式重启 unknown 的该条测试未执行到断言，不能报告为通过。

浏览器成功证据在 `.runtime/tests/evidence/greenhouse-native-request-browser.json`，MV3 失败诊断在同目录 `greenhouse-native-request-mv3-startup.json`。这些运行输出不入公开 Git；本报告记录真实结果。当前 MV3 失败及策略观察不解释旧托管运行的启动超时，也不推翻既有成功证据。本轮没有新增托管 CI 成功声明。

外部请求计数限测试 browser context 中被 route 观察的页面流量，不能扩称 Chromium 后台所有联网均为零。

## 可复现命令

在仓库根目录，复用现有 Node24 与锁定依赖：

```sh
node local-app/tests/fixtures/verify-greenhouse-native-client.mjs
node --test local-app/tests/greenhouse-native-request.test.mjs local-app/tests/greenhouse-runner.test.mjs local-app/tests/greenhouse-receipts.test.mjs
NATIVE_CAPTURE_CHROMIUM=/usr/lib/chromium/chromium node local-app/tests/greenhouse-native-request-browser.mjs
```

源核验脚本可另传独立获取的完整公开 JS 路径；没有完整源时不能声称重建核验通过。在允许测试扩展的云端，使用仓库既有锁定 Chromium 或显式选择可用二进制，加 `NATIVE_CAPTURE_MODE=extension` 可检查真实 `chrome.tabs` / `executeScript.documentId` 及同标签重载后的旧快照失效；**本环境该模式没有通过**，默认模式的 tabId/documentId 是虚构可信输入，不冒充真实生命周期证据。不得更改受管策略使测试通过。

## 信任边界及下一步

此阶段证明历史原生客户端构造的完整 JSON 能被离线取得、冻结并对可信预期作精确绑定核验。`expected.application` 是调用方的可信确认快照；schema 摘要绑定不独立证明本人授权来源。上传证明也是虚构可信输入，尚未把现有真实 XHR/File 上传观察接入本次冻结流程；不重新认证既有上传绑定。原始 body、CSRF、验证值、fingerprint 仅在内存中，公开证据输出只有摘要/大小，不应将快照序列化进日志或存储。

**测试层禁止出网不等于产品发送前门禁。** 错引用仍产生了被 harness 拦下的请求意图；不能称产品已阻止漏发。当前产品 `runner.js` 的 preflight/submit 暂停仍保留，未新增发送器或改变 manifest。正常成功、官方响应/确认关联、受管失效零漏发、接受后丢响应并完整重启不重发，均未在本轮执行。

接下来仍由 Engineer 接续同一任务：在允许实际 MV3 的环境接通可信 tab/document、本人确认的应用状态与现有精确上传证明，再验证保留页面原生 fetch/确认语义的最小门禁；没有已验证门禁前持续暂停真实 Greenhouse。暂缓 worker 独立发送和新回执体系。正常成功必须绑定本次实际核验请求、目标响应和官方确认流程，不能只凭 2xx 或自行打开感谢页。接受后丢响应允许持久保持 unknown，完整重启和重新授权后不重投；不要求寻找申请查询 API，也不要求必然恢复 submitted。无最终更新包，首次真实岗位、资料、附件及提交动作仍须本人确认。
