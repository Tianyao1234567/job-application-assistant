# 012 补答保存及候选

2026-11-14（北京时间）。Manager 指定提交 `c68a4c79cb6345d17763949e9f88751de9c604cb`，原任务 `5c8b638`。工程起点 `5498b772d47ace6fd035ee5ae035121d7d690e15`，窄修验证及打包源码 `620dbb8ea8f06233b5a81f0d299c8d62e45e2571`。

- **产品变化**　真实只读检查分别比较确认时网页基线与现在观察到的选择，本地选择意图独立保存。旧答案沿用保存时记录的网页选择为基线。页面后续变化会列出原本地答案和可识别的当前选择。实际执行路径继续检查真实选值和确认值。结构化动态选项不参与普通事实映射，保存用途仅当前任务，后台仍拒绝其他用途。
- **通过**　本机受影响模型、界面、适配器及资料补答共 74 项。实际 APP 和 MV3 在隔离 HTTPS 先观察 US，再仅在 APP 保存 CA，独立后端及浏览器重启、重新配对后同一任务仍显示保存完成，原网页仍 US。随后隔离页手动改为 JP，只重新核对国家，原答及其他内容保留。空资料地点的候选按唯一默认用途保存，模拟一次保存失败后保留城市和国家草稿，普通事实可按默认用途进入个人资料。页面两次 GET，未填写邮箱或上传附件，无提交边界、额度或账本新增。 [实际 APP/MV3](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43571972486/job/132378102740)
- **通过**　同源码 Windows 执行 candidate.8/.10/.12 更新至 .14，保留任务、答案、附件、原浏览器身份、提交账本及 `unknown`。candidate.12 的 inspect 确认保留。 [Windows](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43571972509/job/132378124530)
- **早期失败及未执行**　最初 MV3 的 APP 断言完成，作业尾部检测到试验页面的 CDN 预加载请求提示而失败，最终测试明确禁用该域名解析后通过。初次 Windows 作业被替换取消。未重跑 011 已接收的控件来源、真实公开页、完整原生回放和无关全套。未实施真实企业发送。 [首轮](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43571835869)
- **交付**　candidate.14 审查草稿实下载单文件 `update.cmd`，363247 字节，SHA-256 `99987c553d4aa33de4a245850b7c4540cf3e067450cd3b6c4590480c04a80cd0`。Manager 在隔离安装运行原 `停止.cmd`，将 `update.cmd` 放到 `启动.cmd` 同目录执行，出现 `UPDATE_COMPLETE` 后原方式启动。下载需仓库权限。candidate.13 草稿和 .12 预发布保留。 [下载](https://github.com/Tianyao1234567/job-application-assistant/releases/download/untagged-900b66b9e0daf39cf4e0/update.cmd) · [草稿](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/untagged-900b66b9e0daf39cf4e0)

下一责任人为 Manager 审查修复候选，Engineer 沿 012 在独立源码继续隔离真实执行准备。候选源码已冻结。真实企业提交暂停，PR #5 保持 draft。
