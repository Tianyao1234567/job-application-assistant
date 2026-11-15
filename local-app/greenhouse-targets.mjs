import {createHash} from 'node:crypto';
import {greenhouseJob} from './greenhouse.mjs';
import '../autofill-extension/runner/greenhouse-public-controls.js';

export const TARGET_LIMIT=40;
export const BOARD_ORIGINS=['https://job-boards.greenhouse.io','https://boards.greenhouse.io'];
const aliases=new Map([
  ['公司','company'],['公司名称','company'],['company','company'],['岗位','title'],['岗位名称','title'],['岗位或方向','title'],['title','title'],
  ['地点','location'],['location','location'],['官方链接','url'],['官方岗位链接','url'],['官方申请链接','url'],['url','url'],
  ['来源','source'],['source','source'],['核实时间','checkedAt'],['verified_at','checkedAt'],
  ['有效状态','reportedStatus'],['status','reportedStatus'],['原因','note'],['reason','note']
]);

export function parseTargetCSV(csv){
  if(typeof csv!=='string'||!csv.trim()||Buffer.byteLength(csv)>128000||csv.includes('\ufffd')||csv.includes('\0'))
    throw new Error('请选择不超过 128 KB 的 UTF-8 CSV 目标表');
  const cells=[];
  let values=[],value='',quoted=false,ended=false;
  const field=()=>{values.push(value.trim());value='';ended=false;};
  const row=()=>{field();if(values.some(Boolean))cells.push(values);values=[];};
  const source=csv.replace(/^\ufeff/,'').replaceAll('\r\n','\n').replaceAll('\r','\n');
  for(let i=0;i<source.length;i++){
    const character=source[i];
    if(quoted){
      if(character==='"'&&source[i+1]==='"'){value+='"';i++;}
      else if(character==='"'){quoted=false;ended=true;}
      else value+=character;
    }else if(character===',')field();
    else if(character==='\n')row();
    else if(character==='"'&&!value&&!ended)quoted=true;
    else if(character==='"'||ended)throw new Error('CSV 引号格式不正确');
    else value+=character;
    if(value.length>2048||values.length>8||cells.length>TARGET_LIMIT+1)
      throw new Error('目标表最多 40 行、8 列，单个值不能超过 2048 字符');
  }
  if(quoted)throw new Error('CSV 有未闭合的引号');
  row();
  const header=cells.shift()?.map(name=>aliases.get(name.toLowerCase()));
  if(!header||header.some(name=>!name)||new Set(header).size!==header.length||
     !['company','title','url'].every(name=>header.includes(name)))throw new Error('表头需要公司、岗位、官方链接。可加地点、来源、核实时间、有效状态、原因');
  if(!cells.length||cells.length>TARGET_LIMIT)throw new Error('目标表需要 1 至 40 条岗位');
  return cells.map((record,index)=>{
    if(record.length!==header.length)throw new Error('第 '+(index+1)+' 条记录与表头列数不一致');
    const fields=Object.fromEntries(header.map((name,column)=>[name,record[column]]));
    return {id:index+1,...fields};
  });
}

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pending=reason=>({status:'unverified',reason});
export async function checkOfficialTarget(site,identity,{fetchPage=fetch,signal=AbortSignal.timeout(4500)}={}){
  // Request only the validated canonical detail URL. No cookies, redirects or table data go to the site.
  if(site.adapter!=='greenhouse-v1'||site.tenant!=='mattermost'||!BOARD_ORIGINS.includes(site.origin)||
     greenhouseJob(site,identity.url).url!==identity.url)return {status:'unsupported',reason:'当前公司或网站未适配'};
  try{
    const response=await fetchPage(identity.url,{redirect:'manual',signal,headers:{Accept:'text/html'}});
    if([404,410].includes(response.status)){await response.body?.cancel();return {status:'closed',reason:'官网岗位页已移除或未公开'};}
    if(response.status>=300&&response.status<400){
      await response.body?.cancel();
      const destination=new URL(response.headers.get('location')||identity.url,identity.url);
      if(BOARD_ORIGINS.includes(destination.origin)&&destination.pathname.replace(/\/$/,'')==='/'+site.tenant)
        return {status:'closed',reason:'官网岗位链接已转回招聘列表'};
      return pending('官网岗位链接发生跳转，需搜集方重新核实');
    }
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html')||!response.body){
      await response.body?.cancel();
      return pending('官网暂时无法核实（HTTP '+response.status+'）');
    }
    let bytes=0;
    const parts=[];
    for await(const part of response.body){
      bytes+=part.length;
      if(bytes>250000)return pending('官网岗位页超出可核实的范围');
      parts.push(Buffer.from(part));
    }
    const html=Buffer.concat(parts).toString('utf8');
    const json=html.match(/<script[^>]*>\s*window\.__remixContext\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)?.[1];
    const loader=json&&JSON.parse(json).state?.loaderData;
    const detail=loader?.['routes/$url_token_.jobs_.$job_post_id'],job=detail?.jobPost;
    if(!job||detail.urlToken!==site.tenant||String(detail.jobPostId)!==identity.jobId||job.public_url!==identity.url||
       job.company_name!==site.company||typeof job.title!=='string'||!job.title.trim())
      return pending('官网无法确认此公司及岗位身份');
    const deadline=Date.parse(job.application_deadline);
    if(Number.isFinite(deadline)&&deadline<Date.now())return {status:'closed',reason:'官网申请期限已过'};
    const controls=globalThis.JobGreenhousePublic;
    const renderer=Object.keys(controls.clients).some(name=>html.includes('https://job-boards.cdn.greenhouse.io/assets/'+name));
    if(!renderer||job.language!=='en'||!Array.isArray(job.questions)||!Array.isArray(job.eeoc_sections)||
       digest(job.questions)!==controls.questionsSha||digest(job.eeoc_sections.map(section=>section.questions))!==controls.eeocSha||
       job.demographic_questions?.questions?.length||typeof loader.root?.boardConfiguration?.disable_captcha!=='boolean')
      return {status:'unsupported',reason:'官网申请表版本或题型当前未适配'};
    return {status:'ready',title:job.title.trim().slice(0,200),location:String(job.job_post_location||'').trim().slice(0,200)};
  }catch{
    return pending('官网暂时无法核实，请稍后重新预览');
  }
}
