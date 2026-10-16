import {loadProfile,getMappings,saveMappings} from '../shared/storage.js';
import {flattenProfile} from '../shared/schema.js';
import {matchFields} from '../shared/match.js';
import {adapterStatus} from '../adapters/status.js';
import {el,download} from '../shared/ui.js';
const tabId=Number(new URL(location.href).searchParams.get('tab'));
let scan=null,entries=[],rows=[],lastResults=[],busy=false;
const status=document.getElementById('status');
function message(text,error=false){status.textContent=text;status.className=error?'error':'success';}
function availability(){document.getElementById('fill').disabled=busy || !scan || !document.getElementById('ack').checked || !rows.some(row=>row.confirm.checked && row.select.value && (!row.field.existing || row.overwrite.checked));}
function setBusy(value){busy=value;for(const id of ['rescan','undo','saveMapping','language']) document.getElementById(id).disabled=value;availability();}
async function inject(){
  if (!Number.isInteger(tabId) || tabId<=0) throw new Error('请通过招聘页上的插件按钮打开工作台');
  await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files:['content/guard.js','content/scan.js','content/fill.js'],world:'ISOLATED'});
}
async function call(action,payload=null){
  const results=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:async(action,payload)=>{
    const api=globalThis.JobFill;if (!api) return {error:'页面已刷新，请重扫'};
    if (action==='scan') return api.scan();
    if (action==='fill') return await api.apply(payload);
    if (action==='undo') return await api.undo();
  },args:[action,payload]});
  return results[0].result;
}
function render(matches){
  const body=document.getElementById('rows');body.replaceChildren();rows=[];
  for (const match of matches){
    const {field}=match,tr=el('tr'),first=el('td');
    const confirm=el('input',null,{type:'checkbox','aria-label':'确认 '+field.label});confirm.checked=match.checked;confirm.disabled=Boolean(field.blocked);
    const overwrite=el('input',null,{type:'checkbox','aria-label':'覆盖 '+field.label});overwrite.disabled=!field.existing || Boolean(field.blocked);
    const cl=el('label','确认 ');cl.prepend(confirm);first.append(cl);
    if (field.existing){const ol=el('label',' 覆盖原值');ol.prepend(overwrite);first.append(el('br'),ol,el('div','已有内容，默认保留',{class:'muted'}));}
    const fieldCell=el('td');fieldCell.append(el('strong',field.label),el('div',field.section || '无明确 section',{class:'muted'}));
    const select=el('select',null,{'aria-label':'对应键 '+field.label});select.append(el('option','需手填 / 跳过',{value:''}));select.disabled=Boolean(field.blocked);
    if (!field.blocked) for (const entry of entries.filter(entry=>entry.confirmed)) select.append(el('option',`${entry.key} · ${entry.label}`,{value:entry.key}));
    select.value=match.key;
    const mappingCell=el('td');mappingCell.append(select);
    const valueCell=el('td'),reasonCell=el('td'),reason=el('div',match.confidence+'置信 · '+match.reason);
    const result=el('div',field.blocked ? '待手填' : !match.key ? '待手填 / 跳过' : field.existing ? '保留已有值' : '待确认',{class:'muted'});reasonCell.append(reason,result);
    function update(){
      valueCell.replaceChildren();const entry=entries.find(entry=>entry.key===select.value);
      if (entry){valueCell.append(el('div',entry.value,{class:'value'}),el('div',`${entry.source} · ${entry.lang} · 已确认`,{class:'muted'}));}
      else valueCell.append(el('span',field.blocked || '需手填',{class:'muted'}));
      availability();
    }
    select.addEventListener('change',()=>{confirm.checked=false;reason.textContent='手动映射：请核对拟填值，然后勾选确认';update();});
    confirm.addEventListener('change',availability);overwrite.addEventListener('change',()=>{confirm.checked=false;availability();});
    tr.append(first,fieldCell,mappingCell,valueCell,reasonCell);body.append(tr);rows.push({field,confirm,overwrite,select,result});update();
  }
  availability();
}
async function rescan(){
  setBusy(true);document.getElementById('ack').checked=false;
  try{
    const profile=await loadProfile();if (!profile) throw new Error('请先在“管理资料”导入或填写并保存资料');
    entries=flattenProfile(profile,document.getElementById('language').value);
    await inject();scan=await call('scan');if (!scan?.fields) throw new Error('扫描失败，请在招聘网页重新点击插件');
    document.getElementById('site').textContent=scan.site;
    document.getElementById('adapter').textContent=adapterStatus(scan.hostname);
    render(matchFields(scan,entries,await getMappings(scan.site)));lastResults=[];
    message(`扫描 ${scan.fields.length} 个可见字段；已忽略 ${scan.secretCount} 个登录/验证/证件字段和 ${scan.excluded} 个不可编辑字段。iframe ${scan.frames} 个（未读取），自定义控件 ${scan.custom} 个（需手填）。请逐项检查。`);
  }catch(error){scan=null;rows=[];document.getElementById('rows').replaceChildren();message(error.message,true);}
  finally{setBusy(false);}
}
function showResults(response){
  lastResults=response.results || [];
  for(const result of lastResults){const row=rows.find(row=>row.field.token===result.token);if(row){row.result.textContent=result.status+' · '+result.reason;row.confirm.checked=false;}}
  message(response.error || lastResults.map(result=>result.label+'：'+result.status).join('\n') || '没有修改',Boolean(response.error));
}
document.getElementById('rescan').addEventListener('click',rescan);
document.getElementById('language').addEventListener('change',rescan);
document.getElementById('manage').addEventListener('click',()=>chrome.runtime.openOptionsPage());
document.getElementById('ack').addEventListener('change',availability);
document.getElementById('fill').addEventListener('click',async()=>{
  if(busy || !scan || !document.getElementById('ack').checked) return;
  const approvals=rows.filter(row=>row.confirm.checked && row.select.value && !row.field.blocked && (!row.field.existing || row.overwrite.checked)).map(row=>{
    const entry=entries.find(entry=>entry.key===row.select.value && entry.confirmed);
    return entry ? {token:row.field.token,signature:row.field.signature,value:entry.value,overwrite:row.overwrite.checked} : null;
  }).filter(Boolean);
  if(!approvals.length) return;
  setBusy(true);
  try{showResults(await call('fill',{site:scan.site,layout:scan.layout,approvals}));}
  catch{message('页面不可操作或已离开。请返回招聘页检查后重扫。',true);}
  finally{document.getElementById('ack').checked=false;setBusy(false);}
});
document.getElementById('undo').addEventListener('click',async()=>{
  if(busy) return;setBusy(true);
  try{showResults(await call('undo'));}catch{message('撤销失败：原页可能已刷新或关闭，请人工检查。',true);}finally{setBusy(false);}
});
document.getElementById('saveMapping').addEventListener('click',async()=>{
  if(!scan || busy) return;
  try{await saveMappings(scan.site,rows.filter(row=>row.select.value && !row.field.blocked).map(row=>({signature:row.field.signature,layout:scan.layout,key:row.select.value})));message('本站映射已保存。重扫后需重新核对和勾选；页面结构变化后不会复用。');}catch{message('映射保存失败。',true);}
});
document.getElementById('diagnostic').addEventListener('click',()=>{
  if(!scan) return;
  // Strip labels, IDs, sources, values, signatures, path and timestamps by default.
  download('diagnostic.redacted.json',{version:'0.1.0',hostname:scan.hostname,fields:scan.fields.map((f,index)=>({index,tag:f.tag,type:f.type,hasValue:f.existing,protected:Boolean(f.blocked),group:f.group,optionCount:f.choices.length})),frames:scan.frames,excluded:scan.excluded,secretCount:scan.secretCount,results:lastResults.map(result=>({status:result.status,reason:result.reason}))});
  message('已导出脱敏诊断（不含字段文字、个人值、资料键、来源、URL路径或选择器）。');
});
document.getElementById('return').addEventListener('click',async()=>{try{await chrome.tabs.update(tabId,{active:true});}catch{message('原标签页已关闭。',true);}});
// Invalidate cached previews immediately when local data changes in another context.
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.profile){scan=null;entries=[];rows=[];document.getElementById('rows').replaceChildren();document.getElementById('ack').checked=false;availability();message('资料已更新或清空，请重新扫描。');}});
await rescan();
