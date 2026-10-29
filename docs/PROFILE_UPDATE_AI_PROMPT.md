# 求职资料更新助手：固定交付格式

请根据我提供的现有资料、招聘问题和本次回答，生成一个可供工程师处理的UTF-8 JSON文件，文件名为 `资料更新_YYYY-MM-DD.json`。

已有资料优先复用，只记录新增或修改内容。简历或资料已经明确回答的问题，不要再问我；真正缺失或有歧义的事实集中询问。对已有经历的描述可以整理为草稿，但不能编造学历、公司、日期、职务、成果数字、证书或工作许可。

先区分两类：姓名、联系方式、技能等明确的个人事实进入 `profile_changes`；公司动机、薪资、到岗时间、特定国家工作许可、岗位资格和原问题的答案进入 `job_answers`，不可自动跨公司、岗位、国家或时间复用。描述草稿和事实修改均须本人核对；你不要替我确认或声称已写入电脑。

必须使用下列格式和字段名；没有内容的数组保留为空，未知的版本、ID、地址或旧值填null，不猜测。**未列出的旧资料保持原样；null从不表示删除。**

```json
{
  "format": "job-application-assistant.profile-update",
  "format_version": 1,
  "base_profile_version": null,
  "profile_changes": [],
  "job_answers": [],
  "unmapped_notes": [],
  "questions": []
}
```

`profile_changes`中每一项结构：

```json
{
  "field": "personal.desiredCity",
  "target_hint": "期望城市",
  "previous_value": null,
  "value": {"zh": "用户本次明确提供的值", "en": null},
  "source_text": "用户本次回答原文或已提供资料的对应原文",
  "qualifier": null,
  "confirmed": false
}
```

- `field`只能是已有工作台资料路径，如 `personal.email`、`skills.description`。经历字段使用真实已有ID，如 `education.<实际ID>.major`，不要把示例占位符当作真实ID。不知道路径、ID，或需要新建经历时，`field`填null，`target_hint`写明意图，由工程师/本机界面匹配或创建后供本人核对。
- `previous_value`知道时写原字段的 `{"zh":"原值","en":null}`，不知道填null；它不是覆盖许可。
- `value`至少有一个非空字符串，不能以空值清除资料；来源只有中文时英文保持null。没有给出客观事实，不生成事实更新。
- `qualifier`只允许null、`expected`（预计）、`in_progress`（在读/进行中）。涉及预计毕业、至今等含义必须保留，当前目标字段无法准确表达时标记待处理，不能转换成已完成事实。
- 不把不同记录仅凭同公司/学校名字合并；稳定ID或目标匹配不明确时保留待核对。

`job_answers`中每一项结构：

```json
{
  "task_id": null,
  "site_url": null,
  "company": null,
  "job_url": null,
  "question": "招聘页面的原问题",
  "answer": "用户回答或基于已给事实整理的待核对草稿",
  "source_text": "原回答或事实依据",
  "confirmed": false
}
```

岗位答案必须保留原问题和可用的岗位上下文；缺少任务归属时待匹配，不能擅自设为通用答案，也不能据此授权提交。选择题按实际选项保留，不猜页面选项或内部ID。

当前系统没有字段承接的信息放入 `unmapped_notes`，每项为 `{"label":"内容类别","text":"原文或草稿","source_text":"依据","confirmed":false}`。不得丢掉后声称已保存或已支持自动填写；不把证件、密码、验证码、Cookie等内容绕过限制塞进这里。

`questions`为需要我回答的简短问题字符串数组，只问确实缺少、歧义或冲突的信息，不要求重抄简历。

所有 `confirmed` 保持false，由本人在本机核对后确认。文件是资料变更提案，不是脚本：不加入命令、下载地址、自动执行、自动确认或投递指令。真实资料不放进公开仓库/Issue/CI。若我未提供现有资料，你应说明无法查重，不能假称已检查整个资料库。

请交付JSON文件，并用一两句话说明修改了哪些类别、还缺什么。不要输出整份旧资料库，不要声称已经导入或提交申请。

当前产品状态：candidate.8支持完整profile JSON草稿导入，**尚不支持此增量文件直接导入**。本格式需交给原Engineer接入或在本机受控处理，不要指导我把它粘到旧的完整资料JSON框。
