// Narrow identity and question contracts shared by the persistent task model.
// This module does not contact an employer or infer application success.
export const isGreenhouse = site => ['greenhouse-v1','greenhouse-replay-v1'].includes(site?.adapter);
export const greenhouseReplay = site => site?.adapter==='greenhouse-replay-v1';
export const greenhousePrefix = site => greenhouseReplay(site)?'/greenhouse':'';
export function greenhouseJob(site,value) {
  const url=new URL(value),prefix=greenhousePrefix(site)+'/'+site.tenant+'/jobs/';
  if(url.origin!==site.origin||url.username||url.password||!url.pathname.startsWith(prefix)||!/^\d{1,30}$/.test(url.pathname.slice(prefix.length)))throw new Error('Greenhouse 岗位链接与已确认公司、租户或稳定标识不符');
  return {jobId:url.pathname.slice(prefix.length),url:url.origin+url.pathname};
}
export function validateGreenhouseSite(site,origin,fixture) {
  const replay=greenhouseReplay(site),url=new URL(site.origin);
  if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(site.tenant||'')||!site.company?.trim()||site.company.length>200||!/^\S+@[^\s@]+\.[^\s@]+$/.test(site.expectedAccount||'')||site.expectedAccount.length>100)throw new Error('Greenhouse 需要固定公司名称、租户及经确认的申请邮箱');
  if(url.href!==origin+'/'||url.username||url.password||url.port&&!(replay&&origin===fixture))throw new Error('Greenhouse 网站地址必须是完整 origin');
  if(replay?(origin!==fixture||site.mode!=='demo'):(!['https://job-boards.greenhouse.io','https://boards.greenhouse.io'].includes(origin)||site.mode!=='real'))throw new Error('Greenhouse 真实站与虚构回放模式或地址不符');
  if(!replay&&(site.tenant!=='mattermost'||site.company.trim()!=='Mattermost'))throw new Error('当前 Greenhouse 仅适配已观察的 Mattermost 范围；其他租户须分别验证后接入');
  const board=origin+(replay?'/greenhouse':'')+'/'+site.tenant;
  for(const key of ['listUrl','loginUrl'])if(site[key]&&site[key]!==board)throw new Error('Greenhouse 入口必须固定为当前租户公开岗位列表');
  return {company:site.company.trim(),tenant:site.tenant,expectedAccount:site.expectedAccount.trim().toLowerCase(),adapter:site.adapter,mode:replay?'demo':'real',listUrl:board,loginUrl:board};
}
const credentials=/password|passwd|passcode|\botp\b|cookie|captcha|verification.?code|\btoken\b|secret|密码|口令|验证码|校验码|身份证|passport/i;
export function greenhouseQuestion(site,task,q,{allowIncomplete=false}={}) {
  if(!q||typeof q.key!=='string'||!/^[\w-]{1,100}$/.test(q.key)||typeof q.text!=='string'||!q.text.trim()||q.text.length>2000||credentials.test(q.text)||!/^([a-f0-9]{64})$/.test(q.version||'')||q.scope!==`greenhouse-v1:${site.tenant}:${task.jobId}:${q.key}:${q.version}`||q.source!==greenhouseJob(site,task.url).url||typeof q.purpose!=='string'||!q.purpose||q.purpose.length>100||!Array.isArray(q.options)||q.options.length>300)return null;
  if(q.options.some(o=>!o||typeof o.text!=='string'||o.text.length>300))return null;
  if(typeof q.type!=='string'||q.type.length>50)return null;
  // A question's observed choices are evidence, never a guessed Yes/No list.
  const choice=q.customControl===true||/select|combobox|radio|checkbox/.test(q.type),unresolved=choice&&q.optionsComplete!==true&&!(q.manualSelection===true&&q.options.length===1&&q.options[0].text.trim());
  if(unresolved&&!allowIncomplete)return null;
  return {key:q.key,text:q.text,scope:q.scope,version:q.version,purpose:q.purpose,source:q.source,options:q.options.map(o=>({text:o.text,disabled:o.disabled===true})),optionsComplete:q.optionsComplete===true,...(q.manualSelection===true?{manualSelection:true}:{}),required:q.required===true,type:q.type,...(q.customControl!==undefined?{customControl:q.customControl===true}:{}),...(unresolved?{unresolved:true}:{}),...(q.requiredEvidence?{requiredEvidence:{native:q.requiredEvidence.native===true,aria:q.requiredEvidence.aria===true,labelAsterisk:q.requiredEvidence.labelAsterisk===true,groupAsterisk:q.requiredEvidence.groupAsterisk===true}}:{})};
}
export function greenhouseAnswer(q,value) {
  if(typeof value!=='string'||!value.trim()||value.length>5000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw new Error('请填写5000字以内的确认答案');
  const answer=value.trim();
  if(q.options?.length&&!q.options.some(o=>!o.disabled&&o.text===answer))throw new Error('答案必须与当次实际观察到的可用选项完全一致');
  return answer;
}

export function validNetworkReceipt(site,task,r) {
  const proof=r?.evidence,source=greenhouseJob(site,task.url).url,replay=greenhouseReplay(site);
  if(r?.kind!==(replay?'greenhouse-network-replay':'greenhouse-production')||r.tenant!==site.tenant||!proof||proof.rule!=='greenhouse-response-ok-v1'||proof.fixture!==replay||proof.source!==source||proof.taskId!==task.id||proof.profileId!==task.executionProfileId||proof.requestBound!==true||proof.confirmationObserved!==true||!Number.isInteger(proof.status)||proof.status<200||proof.status>=300||typeof proof.requestId!=='string'||!proof.requestId||r.id!=='gh-network:'+proof.requestId)return false;
  try {
    const submit=new URL(proof.submitUrl),confirmation=new URL(proof.confirmationUrl),expected=new URL(source);
    return !submit.username&&!submit.password&&submit.pathname===expected.pathname&&(submit.origin===site.origin||!replay&&submit.origin==='https://boards.greenhouse.io')&&confirmation.origin===site.origin&&confirmation.pathname===expected.pathname+'/confirmation';
  }catch{return false;}
}
