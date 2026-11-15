# 014 完整官网只读预检与目标表导入

2026-11-15（北京时间）。已 fetch 和读取 Manager `1f927eca6682e7957842b77c3ff9fdf89a5d1d6a` 的交接与 014。原任务 `5c8b638`，范围004、本机005。工程起点 `913c65e7344dfa62119fddfe37ef287f1e7b94a2`；完整官网首轮验证 `f3bd64671d65da0a5a0f4af3b930d19b46ca3ad4`；目标表和候选验证源码 `d07d49776bf57da74c7edc57645018d3cee8fe0e`。

## 完整官网只读预检

正常后台 CLI 启动、真实 APP 和 Chromium MV3。直接访问 Mattermost 的公开技术验证页，浏览器两个主页 GET 均为 200，加载官网实际 loader、路由、root、manifest 和 vendor。客户端 `entry.client-HYmR2EDs.js`，实际加载 `vendor-43TFuiWl.js`。没有替换官网源码或用 fixture 代替页面。验证页仅用于技术取证。 [官网岗位](https://job-boards.greenhouse.io/mattermost/jobs/5381946008) · [首轮完整页](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43700059529/job/132769013539)

APP 保存 14 项、其中 5 项明确留空。后台进程和浏览器独立退出，原数据目录和浏览器身份重启、重新配对后，同任务复用答案。任务详情可打开「确认本次申请」，看到岗位链接、资料版本、文件名与摘要、浏览器身份，四项勾选保持空白，按钮可用。任务仍为 `inspect`；无写指令完成记录、上传证据、提交边界、额度或账本新增，官网字段及文件为空。官网自身的两个追踪 POST 由测试网络拦截，官网记录 8 条脚本错误。申请相关网站的写入为 0。 [同源码 APP 与 MV3](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43700660743/job/132770851741)

## 目标表交接与实际产品入口

用户提供公司与岗位或方向，由负责搜集的 agent 查官方链接并提供 **UTF-8 CSV**，可用 Excel 打开。APP 的「岗位队列 → 目标表导入」选择该文件，点击「预览并核对」，查看逐行状态并勾选已核实的行，点击「将所选岗位加入队列」。用户无需找链接、逐条粘贴或维护 JSON。

建议表头为 `公司,岗位,地点,官方链接,来源,核实时间,有效状态,原因`。必备表头为公司、岗位和官方链接。未找到链接时保留该行，链接字段留空。支持 UTF-8 BOM、带逗号的引号字段和引号转义。每表最多 40 行、128 KB。目标表仅含公开岗位信息。

- 预览核对已启用的公司和租户、稳定岗位、官网状态及当前固定的英文 Mattermost 表单范围。官网已下架、无链接、无效链接、未适配及暂时无法核实的行保留原因，不能勾选。表中方向和官网实际职位不同会分别显示。
- 确认只接受本机后台生成的有效预览中勾选的行。公司、租户、岗位和申请账号去重沿原逻辑。原任务及标识、答案、附件、账本和 `unknown` 保持，新增任务只等待本人确认检查。队列已在运行时导入亦无执行授权。批量导入只覆盖配置且已适配范围。
- 托管实际 APP 六行预览仅一行可选择；其余分别显示缺少链接、未适配、下架、重复和无效链接。预览不入队，选择后入队一个，运行中的队列仍等待只读确认。再次预览同表无可加入行，任务 ID 一致。模型定点同时选择两行批量入队、保留既有 `unknown`，并核对官网直接返回 404 和跳回职位列表的阻断。
- 本机受影响定点 **106 项通过**。没有重跑已接收的执行、回执及未知结果完整隔离旧套。生产验证服务、企业真实上传/发送、企业受理及重复受理语义仍待验证。

## 候选及升级

同源码 Windows 实际将 candidate.15 升级到 candidate.16。保留原任务、资料、答案、附件字节、扩展及浏览器身份、账本和 `unknown`。匹配版本的旧 `inspect` 许可仍可用，旧记录不能直接授权提交。以往受支持基线保留在包中，本阶段只实跑 .15。 [托管 Windows](https://github.com/Tianyao1234567/job-application-assistant/actions/runs/43700660801/job/132770852412)

candidate.16 为独立审查草稿。实下载单文件 `update.cmd` **393975 字节**，SHA-256 `a11a8c1aafb8e3ce2dcdcd8d2f78668040745a86c7a1cb5bbd25bab634a1dfd8`，与托管同源码文件一致。 [下载（需仓库权限）](https://github.com/Tianyao1234567/job-application-assistant/releases/download/untagged-c1a5f280c2b8fd085f3a/update.cmd) · [审查草稿](https://github.com/Tianyao1234567/job-application-assistant/releases/tag/untagged-c1a5f280c2b8fd085f3a)

Manager 在隔离安装审查时可运行原「停止.cmd」，将 `update.cmd` 放到「启动.cmd」同目录执行。看到 `UPDATE_COMPLETE` 后按原方式启动。candidate.15 公开预发布保留。用户本机体验验收可并行，无需重装、重导或试投。

下一责任人为 Manager 审查。真实企业填写、上传及提交继续暂停，首次具体岗位、资料、附件和提交仍须本人明确确认。生产安装未操作，PR #5 保持 draft。
