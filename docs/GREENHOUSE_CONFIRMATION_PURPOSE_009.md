# 009 Greenhouse 确认用途修复及 Windows 候选

2026-11-13（北京时间）。原任务 `5c8b638`。已读取 Manager `e96ee18f175cb87420e656992db84903205b82e4` 的交接和 009。工程基线 `4573d1361b54e5180619be017395fa7fbf355dfb`，前一版候选验证源码 `4c990e86ab0c7112c81231799109fca6d79adf2d`，本轮验证和打包源码 `950e9e2fe375868e0e576de7f34fb92a8d70dd02`。

## 缺口和产品修复

- 真实页面原本提示只检查，但确认表单仍向后台传入旧提交标记 `submitConfirmed:true` 并落盘。真实 Greenhouse 确认按钮、请求和持久记录现在统一使用 `purpose: inspect`。后台只授权检查和预检，拒绝真实提交确认以及填表、上传、答题、提交等写入操作，扩展沿用真实提交暂停限制。
- 虚构站明确确认一次提交时使用 `purpose: submit`，沿用原任务、站点账号、资料和附件版本、附件摘要及执行浏览器的绑定。原生发送门禁要求该用途。旧虚构回放确认仍按原有回放范围兼容。
- 启动时保留旧真实确认的岗位、资料、附件及执行配置绑定，将用途不明的记录标为 `unverified` 并删除旧提交标记。待办可重新确认页面检查。已有提交边界或 `unknown` 的任务仍仅能核对，原答案、附件、浏览器身份和提交账本继续保留。

## 通过

- 本机定点 36 项全部通过，覆盖模型、确认界面和扩展运行器。包括写授权与旧标记拒绝、只读状态持久化、升级保护及虚构明确提交。语法检查和 Git 差异检查通过。
- 实际 MV3 托管使用隔离 HTTPS，真实模式域名由测试浏览器定向到本机虚构服务。重启前后原任务均获得只读检查，后台独立进程与浏览器均重启并重新配对。服务共记录两次 GET，没有填表或上传，未跨提交边界且未占用额度。写授权拒绝由模型与授权定点验证。 [实际 MV3 作业](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43419251688/job/131864816756)
- 同一实际 MV3 作业通过虚构站完整流程。原题补答后继续同一任务，正常到达、接受、确认各一次。同名错附件零到达。虚构服务接受后丢响应，独立后台和浏览器重启并重新配对后到达次数 2→2，任务保持 `unknown`。该场景的一次接受依赖虚构服务去重。
- 同一源码的托管 Windows 从 candidate.8 和 candidate.10 运行单文件升级至 candidate.12。两版都验证旧真实确认用途未核实、原 `unknown` 仅可核对，资料、答案、附件字节、浏览器身份和账本保留。包内验证来源 SHA、关键文件和原生请求模块摘要。 [Windows 升级作业](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43419251690/job/131864816511)

## 失败和未执行

- 本机初次定点的 7 个界面用例因旧测试加载器未处理新增导入，在断言前解析失败。更新加载器后，本机最终定点 36 项全部通过。
- 首次托管 MV3 使用了会被真实模式护栏拒绝的虚构附件名称。改用合规的隔离附件名称后，第二次在测试页面接入处失败。最终改用隔离的回环 HTTPS 接入并通过。首轮 Windows 作业被并发调度取消，第二轮和最终同源码 Windows 作业通过。 [首次 MV3](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43418696163/job/131862957377) · [第二次 MV3](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43418872829/job/131863564566)
- 本轮未运行无关全套、旧 44 项、实际企业投递或生产去重调查。旧 44 项历史为 41 通过、3 失败。文档替换、扩展强停及撤权继续引用既有定点证据。实际企业提交继续暂停。 [既有失效检查](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43241981274/job/131264556152)

## 候选及交接

- `0.2.0-candidate.12` 的 `update.cmd` 直接取自上述 Windows 作业。GitHub 独立草稿实下载为 338815 字节，SHA-256 `d23015c9b44cc45a07fd41539de5db74473adf2e1fc0036e5d70647a136290d4`，与托管生成的文件相同。草稿下载需要仓库权限。 [候选草稿](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/untagged-01ee0c2b6354654671be) · [下载 update.cmd](https://github.com/Tianyao1234567/job-application-assistant/releases/download/untagged-01ee0c2b6354654671be/update.cmd)
- Manager 在隔离安装目录复核时，先运行 `停止.cmd`，再将 `update.cmd` 放到 `启动.cmd` 同目录并执行，看到 `UPDATE_COMPLETE` 后运行原 `启动.cmd`。更新后真实任务显示「确认检查原申请页」，已有提交记录仍显示核对入口。用户无需重导 JSON、重装或试投。
- 下一责任人为 Manager 审查发布。candidate.11 原草稿保留，PR #5 保持 draft。 [candidate.11](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/untagged-c50219f1712ef8ccff89) · [PR #5](https://github.com/Tianyao1234567/job-application-assistant/pull/5)
