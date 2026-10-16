import {definitions,emptyProfile,emptyField,validateProfile} from '../shared/schema.js';
import {loadProfile,saveProfile,clearData} from '../shared/storage.js';
import {el,download} from '../shared/ui.js';
let profile=emptyProfile(), inputs=[];
const titles={personal:'个人信息',education:'教育经历',experience:'工作 / 实习经历',projects:'项目经历',skills:'技能',links:'链接'};
const status=document.getElementById('status');
function message(text,error=false) {status.textContent=text;status.className=error?'error':'success';}
function collect() {
  const candidate=structuredClone(profile);
  for (const entry of inputs) {
    const target=entry.id ? candidate[entry.kind].find(item=>item.id===entry.id) : candidate[entry.kind];
    const zh=entry.zh.value.trim(),en=entry.en.value.trim();
    if (!zh && !en) {delete target[entry.key];continue;}
    target[entry.key]={zh:zh || null,en:en || null,source:entry.source.value.trim(),confirmed:entry.confirmed.checked};
  }
  return validateProfile(candidate);
}
function fields(parent,kind,target) {
  for (const [key,title] of Object.entries(definitions[kind])) {
    const value=target[key] || emptyField(),row=el('div',null,{class:'form-row'});
    const zh=el('textarea',null,{'aria-label':title+' 中文',placeholder:'中文 / 日期 YYYY-MM'});zh.value=value.zh || '';
    const en=el('textarea',null,{'aria-label':title+' English',placeholder:'English / date YYYY-MM'});en.value=value.en || '';
    const source=el('input',null,{'aria-label':title+' 来源',maxlength:'200'});source.value=value.source;
    const confirmed=el('input',null,{type:'checkbox','aria-label':title+' 已确认'});confirmed.checked=value.confirmed;
    const confirmLabel=el('label','已确认 ');confirmLabel.append(confirmed);
    row.append(el('div',title),zh,en,source,confirmLabel);parent.append(row);
    inputs.push({kind,id:target.id,key,zh,en,source,confirmed});
  }
}
function render() {
  const editor=document.getElementById('editor');editor.replaceChildren();inputs=[];
  for (const kind of Object.keys(definitions)) {
    const card=el('section',null,{class:'card'});card.append(el('h2',titles[kind]));
    const array=Array.isArray(profile[kind]);
    if (array) {
      const add=el('button','添加'+titles[kind],{type:'button'});
      add.addEventListener('click',()=>{
        try {profile=collect();profile[kind].push({id:kind+'-'+crypto.randomUUID()});render();}
        catch(error) {message(error.message,true);}
      });card.append(add);
      profile[kind].forEach((entry,index)=>{
        const group=el('div',null,{class:'section'}),remove=el('button','删除此条',{type:'button'});
        remove.addEventListener('click',()=>{try {profile=collect();profile[kind]=profile[kind].filter(item=>item.id!==entry.id);render();}catch(error){message(error.message,true);}});
        const header=el('div',null,{class:'bar'});header.append(el('strong',`${index+1} · ${entry.id}`),remove);group.append(header);fields(group,kind,entry);card.append(group);
      });
    } else fields(card,kind,profile[kind]);
    editor.append(card);
  }
  document.getElementById('raw').value=JSON.stringify(profile,null,2);
}
document.getElementById('save').addEventListener('click',async()=>{
  try {const next=collect();await saveProfile(next);profile=next;render();message('已保存。扫描工作台请重新扫描，加载最新资料。');}catch(error){message(error.message,true);}
});
document.getElementById('rawSave').addEventListener('click',async()=>{
  try {const next=validateProfile(JSON.parse(document.getElementById('raw').value));await saveProfile(next);profile=next;render();message('JSON 校验成功，已保存。');}catch(error){message('导入失败，旧资料未改变：'+error.message,true);}
});
document.getElementById('import').addEventListener('change',async event=>{
  try {
    const file=event.target.files[0];if (!file) return;
    if (file.size>500000) throw new Error('文件超过500KB');
    const next=validateProfile(JSON.parse(await file.text()));
    await saveProfile(next);profile=next;render();message('已导入。请核对每项值、来源和“已确认”。');
  }catch(error){message('导入失败，旧资料未改变：'+error.message,true);}finally{event.target.value='';}
});
document.getElementById('export').addEventListener('click',()=>{
  try {download('profile.private.json',collect());message('已导出当前编辑内容。此文件含私人资料，请自行保管。');}catch(error){message(error.message,true);}
});
document.getElementById('clear').addEventListener('click',async()=>{
  if (!confirm('清空本机资料及所有站点映射？已导出的文件不会被删除。')) return;
  try {await clearData();profile=emptyProfile();render();message('已清空。请关闭已打开的扫描工作台，清除其内存预览。');}catch {message('清空失败，请重试。',true);}
});
try {profile=await loadProfile() || emptyProfile();render();}catch(error){render();message(error.message,true);}
