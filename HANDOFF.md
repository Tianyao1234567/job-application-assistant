# 交接导航 — 按身份读取，不在此指定角色

更新时间：2026-10-29（北京时间）。用户要求Engineer与Manager使用独立命名的交接文件，避免互相覆盖。

| 固定身份名 | 专属交接文件 | 维护人 | 新会话第一句 |
| --- | --- | --- | --- |
| Engineer（简历工程师） | [HANDOFF_ENGINEER.md](HANDOFF_ENGINEER.md) | Engineer | 先读HANDOFF_ENGINEER.md，接续Engineer。 |
| Manager（项目经理） | [HANDOFF_MANAGER.md](HANDOFF_MANAGER.md) | Manager | 先读HANDOFF_MANAGER.md，接续Manager。 |

- **本文件只作导航，不是第三份交接正文，也不设置默认身份。** 不再将本文件改成工程师或经理专用交接。
- 按用户指定身份读取对应文件，保留身份名；只更新自己负责的交接正文，引用对方文件和具体提交，不覆盖对方内容。
- 已知身份时直接读对应文件；若用户只说“先读HANDOFF.md”且没有角色上下文，先展示两个入口再确认身份，不擅自接任Manager或Engineer。
- 当前任务、来源、测试证据、阻塞与下一步在各自文件；新的Git提交不代表对方已接单或验收。
- 双方每次完成工作后，提供一个完整可复制的text代码块：Engineer写“发给 Manager”，Manager写“发给 Engineer”。

共同规则见[AGENTS.md](AGENTS.md)。旧CLOUD_HANDOFF及历史HANDOFF正文不指定新会话身份；按有效分支最新的专属文件接续。
