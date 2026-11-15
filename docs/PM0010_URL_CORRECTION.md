# PM-0010：招聘链接访问与公开摘要补正

日期：2026-10-21（Asia/Shanghai，北京时间）。本项是链接语义修复与来源补正，不重写前两轮托管观测，也不声称本次重新访问了五家公司。

[PM-0010](https://github.com/Tianyao1234567/job-application-assistant/issues/1#issuecomment-6309088895)复核[第四范式官方人才页](https://www.4paradigm.com/about/hr.html)时给出的实际校招href为：

```text
https://app.mokahr.com/campus-recruitment/4paradigm/58145?edit=1&hireMode=2
```

此前公开调研摘要和文档展示的是删去query后的地址，不能称为完整实际href；旧运行及其公开记录仍保留。以上完整链接的本次补正依据为PM-0010的独立读取，不冒称开发者本轮新GET了该目标，亦不据此宣布校招目标页可读、无需登录或已适配。

修复将通过安全检查后的完整解析href用于访问、重定向跟随和链接去重，保留普通query、hash路由和长链接。公开日志/Checks/artifact另用脱敏、受限显示值；显示值可能删参数或截短，因此不得用于导航或去重。未知query不会仅因不在公开白名单内而改写访问目标；凭据参数、URL内账号密码及不合适目标仍会在访问前拒绝，拒绝链接的原始值不写公开摘要。

纯URL验证覆盖完整校招query、相对hash路由、query/hash差异、长链接、公开脱敏及凭据/不合适目标拒绝。第四范式单浏览器只读预研将使用同一URL模块，分别报告实际页面、完整安全目标与公开摘要；本项未注册、登录、提交资料或调用申请接口。
