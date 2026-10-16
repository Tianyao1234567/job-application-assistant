const norm = value => String(value || '').normalize('NFKC').trim().replace(/[\s*:：/]+/g,' ').toLowerCase();
const dictionary = {
  name:/^(姓名|中文姓名|英文姓名|名字|full name|name|your name|applicant name|chinese name|english name|realname|real name|姓名 name)$/,
  phone:/手机|联系电话|电话|mobile|phone|tel/,
  email:/邮箱|电子邮件|电子信箱|email|e mail/,
  desiredCity:/期望城市|意向城市|preferred city|desired city|work city/,
  location:/现居|居住城市|所在地|current city|current location|residence/,
  school:/学校|院校|university|school|college|institution/,
  degree:/学历|学位|degree|qualification/,
  major:/专业|major|field of study/,
  startDate:/开始|入学|起始|start|from|begin/,
  endDate:/结束|毕业|终止|end|to date|graduat/,
  company:/公司|雇主|company|employer|organisation|organization/,
  department:/部门|department/,
  role:/职位|职务|角色|position|job title|role/,
  title:/项目名称|项目标题|project name|project title/,
  description:/描述|职责|工作内容|description|responsibilit|summary/,
  programming:/编程|programming/,
  robotics:/机器人|视觉|robotic|vision/,
  embedded:/嵌入式|embedded/,
  tools:/工具|tools/,
  hardware:/硬件|hardware/,
  website:/个人网站|个人主页|website|portfolio/,
  github:/github/,
  linkedin:/linkedin/
};
function kindOf(field) {
  const section = norm(field.section);
  if (/教育|学历|本科|硕士|博士|education|academic|bachelor|master|phd/.test(section)) return 'education';
  if (/实习|工作经历|工作经验|任职|experience|employment|internship/.test(section)) return 'experience';
  if (/项目|project/.test(section)) return 'projects';
  return null;
}
export function matchFields(scan, entries, saved=[]) {
  const confirmed = entries.filter(entry=>entry.confirmed);
  const grouped = {education:[],experience:[],projects:[]};
  for (const f of scan.fields) {const kind=kindOf(f);if (kind && !grouped[kind].includes(f.group)) grouped[kind].push(f.group);}
  return scan.fields.map(field => {
    const result = {field,key:'',confidence:'低',reason:field.blocked || '未找到唯一可信对应，请手动选择',checked:false};
    if (field.blocked) return result;
    const savedRow = saved.find(row=>row.layout === scan.layout && row.signature === field.signature);
    if (savedRow && confirmed.some(entry=>entry.key === savedRow.key)) return {...result,key:savedRow.key,confidence:'中',reason:'本站保存的映射；完整字段结构一致，请重新核对',checked:false};
    const label=norm(field.label), hints=norm(field.hints);
    if (/联系[人]|紧急|emergency|contact person|referee|reference|first name|last name|given name|surname/.test(label+' '+hints+' '+field.section)) return {...result,reason:'联系人或姓名拆分存在歧义，请手填/手动指定'};
    let candidates = Object.entries(dictionary).filter(([,pattern])=>pattern.test(label)).map(([key])=>key);
    if (!candidates.length) candidates = Object.entries(dictionary).filter(([,pattern])=>pattern.test(hints)).map(([key])=>key);
    if (field.type === 'email' && !candidates.length) candidates=['email'];
    if (field.type === 'tel' && !candidates.length) candidates=['phone'];
    if (/技能|skills/.test(label) && !candidates.length) candidates=['description'];
    if (candidates.includes('desiredCity')) candidates=candidates.filter(key=>key!=='location');
    if (candidates.length !== 1) return result;
    const key=candidates[0], kind=kindOf(field);
    let choices=confirmed.filter(entry=>entry.field === key);
    let repeated=false;
    if (kind) {
      choices=choices.filter(entry=>entry.kind===kind);
      const ordinal=grouped[kind].indexOf(field.group);
      const allIds=[...new Set(confirmed.filter(entry=>entry.kind===kind).map(entry=>entry.id))];
      if (allIds.length > 1 || grouped[kind].length > 1) {
        repeated=true;
        const section=norm(field.section);
        const degree=/硕士|master/.test(section) ? /硕士|master/i : /本科|学士|bachelor/.test(section) ? /学士|本科|bachelor/i : /博士|phd|doctor/.test(section) ? /博士|phd|doctor/i : null;
        const ids=degree && kind==='education' ? [...new Set(confirmed.filter(entry=>entry.kind==='education' && entry.field==='degree' && degree.test(entry.value)).map(entry=>entry.id))] : [];
        const chosen=ids.length===1 ? ids[0] : allIds[ordinal];
        choices=choices.filter(entry=>entry.id===chosen);
      }
    } else {
      const preferred=['name','phone','email','location','desiredCity'].includes(key) ? 'personal' : ['website','github','linkedin'].includes(key) ? 'links' : ['programming','robotics','embedded','tools','hardware'].includes(key) || /技能|skills/.test(label) ? 'skills' : null;
      if (!preferred) return {...result,reason:'缺少教育/实习/项目 section，避免串填，请手动指定'};
      choices=choices.filter(entry=>entry.kind===preferred);
    }
    if (choices.length !== 1) return result;
    const direct = Object.values(dictionary).some(pattern=>pattern.test(label));
    let confidence = !direct || repeated ? '中' : '高';
    if (key==='name' && /英文|english/.test(label) && choices[0].lang!=='en') return {...result,reason:'英文姓名字段没有对应英文版本，请切换语言'};
    if (key==='name' && /中文|chinese/.test(label) && choices[0].lang!=='zh') return {...result,reason:'中文姓名字段没有对应中文版本，请切换语言'};
    return {...result,key:choices[0].key,confidence,reason:repeated ? '重复经历按学位线索/显示顺序建议；必须核对条目' : direct ? '明确标签 + 对应资料类别' : '属性/类型线索，需核对',checked:confidence==='高' && !field.existing};
  });
}
