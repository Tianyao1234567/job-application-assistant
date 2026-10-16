export const definitions = {
  personal: {name:'姓名 / Full name', phone:'手机 / Phone', email:'邮箱 / Email', location:'现居城市 / Current city', desiredCity:'期望城市 / Preferred city'},
  education: {school:'学校 / School', degree:'学位 / Degree', major:'专业 / Major', startDate:'开始年月 / Start', endDate:'结束年月 / End'},
  experience: {company:'公司 / Company', department:'部门 / Department', role:'职位 / Role', startDate:'开始年月 / Start', endDate:'结束年月 / End', description:'职责 / Description'},
  projects: {title:'项目名称 / Project title', role:'本人角色 / Role', startDate:'开始年月 / Start', endDate:'结束年月 / End', description:'项目描述 / Description'},
  skills: {programming:'编程技能', robotics:'机器人与视觉', embedded:'嵌入式', tools:'工具', hardware:'硬件', description:'综合技能 / Skills'},
  links: {website:'个人网站', github:'GitHub', linkedin:'LinkedIn'}
};
export function emptyProfile() {
  return {schemaVersion:1, personal:{}, education:[], experience:[], projects:[], skills:{}, links:{}, resumeMetadata:{fileName:null, language:null}, customAnswers:{}};
}
export function emptyField() { return {zh:null, en:null, source:'用户填写', confirmed:false}; }
function object(v, path) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${path} 必须为对象`);
}
function keys(v, allowed, path) {
  for (const key of Object.keys(v)) if (!allowed.includes(key)) throw new Error(`${path}.${key} 是未知或不允许的字段`);
}
export function validDate(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(value)) return false;
  if (value.length === 7) return true;
  const [y,m,d] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(y,m-1,d); date.setUTCHours(0,0,0,0);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d;
}
function field(v, path, key) {
  object(v, path); keys(v,['zh','en','source','confirmed'],path);
  if (typeof v.confirmed !== 'boolean') throw new Error(`${path}.confirmed 必须为 true/false`);
  if (typeof v.source !== 'string' || !v.source.trim() || v.source.length > 200) throw new Error(`${path}.source 必須为1–200字`);
  for (const lang of ['zh','en']) {
    const value = v[lang];
    if (value !== null && (typeof value !== 'string' || value.length > 10000 || !value.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))) throw new Error(`${path}.${lang} 必须为非空文字或 null，最长10000字`);
    if (value !== null && /Date$/.test(key) && !validDate(value)) throw new Error(`${path}.${lang} 日期必须为有效 YYYY-MM 或 YYYY-MM-DD`);
    if (value !== null && key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${path}.${lang} 邮箱格式不正确`);
    if (value !== null && key === 'phone' && !/^\+?[\d ()-]{5,30}$/.test(value)) throw new Error(`${path}.${lang} 手机格式不正确`);
    if (value !== null && ['website','github','linkedin'].includes(key) && !/^https?:\/\/[^\s]+$/i.test(value)) throw new Error(`${path}.${lang} 链接须以 http(s):// 开头`);
  }
}
export function validateProfile(profile) {
  object(profile,'profile');
  keys(profile,['schemaVersion','personal','education','experience','projects','skills','links','resumeMetadata','customAnswers'],'profile');
  if (profile.schemaVersion !== 1) throw new Error('schemaVersion 只支持 1');
  for (const kind of ['personal','skills','links']) {
    object(profile[kind],kind); keys(profile[kind],Object.keys(definitions[kind]),kind);
    for (const [key,v] of Object.entries(profile[kind])) field(v,`${kind}.${key}`,key);
  }
  const ids = new Set();
  for (const kind of ['education','experience','projects']) {
    if (!Array.isArray(profile[kind]) || profile[kind].length > 30) throw new Error(`${kind} 必须为数组，最多30条`);
    profile[kind].forEach((entry,i) => {
      object(entry,`${kind}[${i}]`); keys(entry,['id',...Object.keys(definitions[kind])],kind);
      if (typeof entry.id !== 'string' || !/^[a-zA-Z][\w-]{0,63}$/.test(entry.id) || ids.has(entry.id)) throw new Error(`${kind}[${i}].id 须为唯一稳定ID`);
      ids.add(entry.id);
      for (const [key,v] of Object.entries(entry)) if (key !== 'id') field(v,`${kind}.${entry.id}.${key}`,key);
    });
  }
  object(profile.resumeMetadata,'resumeMetadata'); keys(profile.resumeMetadata,['fileName','language'],'resumeMetadata');
  for (const value of Object.values(profile.resumeMetadata)) if (value !== null && (typeof value !== 'string' || value.length > 200)) throw new Error('简历元数据必须为短文字或 null');
  object(profile.customAnswers,'customAnswers');
  if (Object.keys(profile.customAnswers).length > 50) throw new Error('自定义答案最多50条');
  for (const [key,v] of Object.entries(profile.customAnswers)) {
    if (!/^[a-zA-Z][\w-]{0,63}$/.test(key)) throw new Error('自定义答案ID格式不正确');
    if (/password|passwd|otp|token|cookie|captcha|passport|national.?id|identity|credential|secret/i.test(key)) throw new Error('自定义答案不可存储密码、验证或身份凭据');
    field(v,`customAnswers.${key}`,key);
  }
  if (JSON.stringify(profile).length > 500000) throw new Error('资料超过500KB');
  return JSON.parse(JSON.stringify(profile));
}
export function flattenProfile(profile, lang = 'zh') {
  const rows = [];
  function add(kind,entry,index=null) {
    for (const [key,v] of Object.entries(entry)) {
      if (key === 'id') continue;
      const usedLang = v[lang] !== null ? lang : (lang === 'zh' ? 'en' : 'zh');
      if (!v[usedLang]) continue;
      rows.push({key:kind + '.' + (entry.id ? entry.id + '.' : '') + key, kind, field:key, index, id:entry.id || null, label:definitions[kind]?.[key] || key, value:v[usedLang], lang:usedLang, source:v.source, confirmed:v.confirmed});
    }
  }
  for (const kind of ['personal','skills','links','customAnswers']) add(kind,profile[kind]);
  for (const kind of ['education','experience','projects']) profile[kind].forEach((entry,i)=>add(kind,entry,i));
  return rows;
}
