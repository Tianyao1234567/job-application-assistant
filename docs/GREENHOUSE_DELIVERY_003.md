# Greenhouse 附件精确对象绑定返工003（待 Manager 验收）

返工依据：[Manager 定点任务](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6340966270)。只修复同名不同 S3 对象被误认的问题，其他已通过部分沿用原证据。运行代码/最终候选来源：`3856a49a78852c4729a6be4d64f01f19acdcd1c3`（核心修复提交 `d4f78513399011006dd5c8f468b9251feaf21228`，后续仅修正新增测试调用入口及诊断）；沿原分支及 draft PR #5，未合并。

## 实际修复

- 本次授权上传前，扩展通过 `chrome.scripting` 在 MAIN 安装有时限的 XHR 观察；实际 `FormData` 中必须恰有一个 file 和一个 key。核对真正发送的 File 名、大小、SHA-256及浏览器真实上传成功响应；用原生上传 URL + 精确 key 生成对象引用 SHA-256。原请求体不修改，观察完成/失败/取消后恢复原生方法。只返回摘要，经 Chrome 私有执行结果通道绑定当前 documentId；页面消息、文件显示名不能提供成功证明。
- 扩展本机保存的证明绑定 taskId、profileId、tabId、原岗位来源、documentId及源文件版本。preflight和进入提交边界前均重查：缺证、换页面/资料/文件先暂停，不点击申请。不能捕获的上传协议不会退回“同名即正确”。原生已上传但证据遗失时，需本人核对网页附件并在原任务恢复，不自动移除/覆盖文件。
- 最终申请请求中的 `resume_url` 必须逐字节匹配本次对象引用摘要；同一 S3 域名下同名的其他 key 不能替代。跨提交边界后的错误引用，即使 POST 2xx 且进入对应确认页，也保持 unknown、只核实不重发。网络回执再次检查引用，后台拒收缺少对象绑定的旧 native-upload-reference 回执；不写“正确简历已受理”。
- 未扩大浏览器权限，未保留原始对象/签名 URL、请求体、验证码或 Cookie；不需要回读生产企业服务端文件字节。公开站当前已观察的原生 XHR/FormData 路径受支持，未知路径缺证暂停，不能声称生产已验收。

## 定点验证

本地受影响测试30项通过：网络/对象回执7、执行器9、注册及模块依赖11、候选包3。核心负例固定同一S3域名、文件名及锁定SHA：正确 `object-a` 可通过，`different-object-b` 的 `boundApplication` 为 false，`networkReceipt` 为 null；即使错误地把 bound 标志置 true，独立引用检查仍拒绝。后台拒绝错引用及旧无绑定证明。缺少/过期页面/错误profile/错误源文件证明均在提交边界前暂停，申请点击和持久提交尝试均为0。

新增实际 Chromium 定点检查核对原生 File/对象 key/真实204响应、同名错对象不能写成功记录、同名同大小但不同字节不能生成上传证明，以及取消后原生方法恢复。全部仅本地虚构资料/HTTP上传，无企业写入或外部请求。托管结果及新包来源见以下补充；此检查不重跑已通过的自定义控件/CAPTCHA/旧MV3完整场景。首次新增托管检查 [39782585591](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39782585591) 未通过：原测试使用service worker不支持的动态import，已在3856a49改为从产品实际扩展执行页导入并调用Chrome MAIN注入，同时补充失败Checks诊断。不将该失败运行或其包当作已验证交付。

沿用已接收109项及两个旧MV3场景；本轮CI按已接收来源和实际变更清单收窄，仅运行上述受影响检查。未重跑109项全套、旧MV3场景、Windows或录屏。旧candidate.4的109/MV3结果不覆盖本P1。

## 版本与放行边界

candidate.4继续不放行首次真实申请。修复候选为 `0.2.0-candidate.5`，62个运行源码文件，不含运行依赖、资料或`.runtime`；运行前提及启动方式沿用 [候选说明](../CANDIDATE_PACKAGE.md) / [Windows说明](../WINDOWS_START_001.md)。candidate.5须经Manager验收本次精确对象修复后，再组织用户确认岗位、资料、附件和首次真实提交。真实S3及真实企业完整投递未在云端执行，不能以本地受控证明替代。

## 最终托管结果与下载

[CI 39783058559](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39783058559) 全部通过，来源严格为 `3856a49a78852c4729a6be4d64f01f19acdcd1c3`。30项受影响检查通过；新增定点浏览器检查从实际加载的扩展执行页，经Chrome MAIN执行及私有结果返回通道取证（`mode=extension`、Chromium145.0.7632.6），以上4项断言通过。仅2次本地虚构附件上传，外部请求0；无真实企业申请，也未运行旧MV3场景。[浏览器证据](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39783058559/artifacts/12427468232) 含 `greenhouse-upload-reference-browser.json`，北京时间2026-10-29 21:01:19到期。

[candidate.5实际下载](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/39783058559/artifacts/12427069267)（需GitHub登录，北京时间2026-10-29 21:00:40到期）。外层artifact内为源码ZIP、SOURCE.json与SHA256SUMS.txt；先解压外层，再解压内层ZIP。内层560519字节、62个运行源码文件，SHA-256：

`7b9fff5a071f3cd2c2e80f65729f189635db9a7b5d68dd125396755ca95cbafb`

包逐文件回读核验通过，来源与上述检查一致。后续HANDOFF/报告提交不改变本包来源，不将文档HEAD冒充运行测试SHA。沿用Node24和锁定运行浏览器依赖的现有安装方式；新候选待Manager验收，不代表本人首次申请已放行。
