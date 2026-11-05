import {validateProfile} from '../autofill-extension/shared/schema.js';
const copy=value=>structuredClone(value);
export function profileValue(profile,key){
 const [kind,id,field]=key.split('.');return field?profile[kind]?.find?.(entry=>entry.id===id)?.[field]:profile[kind]?.[id];
}
export function setProfileValue(profile,key,value){
 const parts=key.split('.');let target=profile[parts[0]];
 if(Array.isArray(target)){const id=parts[1];let entry=target.find(item=>item.id===id);if(!entry){entry={id};target.push(entry);}target=entry;}
 target[parts.at(-1)]=value;
}
export function importedCandidates(candidates,profile){
 // Same school/company/title can describe several distinct periods. Only
 // identical stable entry IDs merge; do not infer record identity from one name.
 return candidates.map(candidate=>({...copy(candidate),existing:copy(profileValue(profile,candidate.key)||null)}));
}
export function applyProfileDraft(profile,draft,selections){
 if(!Array.isArray(selections)||selections.length!==draft.candidates.length||new Set(selections.map(v=>v.key)).size!==selections.length)throw new Error('请核对当前提取清单后一次保存，不能遗漏或重复字段');
 const next=copy(profile);let count=0;
 for(const selection of selections){
  const candidate=draft.candidates.find(c=>c.key===selection.key);
  if(!candidate||!['keep','skip','import'].includes(selection.action))throw new Error('提取字段或处理选择已变化');
  if(selection.action!=='import')continue;
  if(typeof selection.value!=='string'||!selection.value.trim())throw new Error('接受的提取内容不能为空；未知项请选择保留或略过');
  const old=profileValue(profile,selection.key),oldValue=old?.zh||old?.en;
  if(old?.confirmed&&oldValue&&oldValue!==selection.value.trim()&&selection.replace!==true)throw new Error('已有已确认资料存在冲突，必须明确选择替换，不能静默覆盖');
  const evidence=candidate.values.find(v=>v.value===selection.value.trim());
  setProfileValue(next,selection.key,{zh:selection.value.trim(),en:(old?.zh||old?.en)===selection.value.trim()?old?.en||null:null,confirmed:true,source:evidence?'本人核对PDF第'+evidence.page+'页':'PDF提取草稿经本人修订'});count++;
 }
 return {data:validateProfile(next),count};
}
