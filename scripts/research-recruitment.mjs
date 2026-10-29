// Explicit, bounded public GET-only research. No account, browser, cookie jar or application API.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptResearchUrl as acceptable,publicResearchUrl as publicUrl} from './research-url.mjs';

if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||process.env.SITE_RESEARCH_READONLY!=='1')throw new Error('Use the explicit hosted Linux read-only research job.');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const directory=path.join(root,'.runtime','research');
await fs.mkdir(directory,{recursive:true});
const deadline=Date.now()+150_000;
const companies=[
  {id:'mech-mind',name:'美卡曼德',identity:'Candidate domain; verify page identity and official hiring links.',roots:['https://www.mech-mind.com.cn/','https://www.mech-mind.com/'],crossReference:'https://github.com/MechMindRobotics'},
  {id:'standard-robots',name:'斯坦德机器人',identity:'Candidate domain; do not conflate similarly named companies.',roots:['https://www.standard-robots.com/'],search:'斯坦德机器人 官网 招聘'},
  {id:'zhongxing-unresolved',name:'众行机器人',identity:'No reliable official root identified; unresolved names must not be substituted.',roots:[],search:'"众行机器人" 官网 招聘'},
  {id:'4paradigm',name:'第四范式',identity:'Candidate root cross-referenced by public GitHub organization blog; verify page identity.',roots:['https://www.4paradigm.com/'],crossReference:'https://github.com/4paradigm'},
  {id:'roborock',name:'石头科技',identity:'Candidate brand roots; verify corporate identity and official hiring links.',roots:['https://www.roborock.com/','https://cn.roborock.com/']}
];
const employment=/招聘|加入我们|招贤|人才|社会招聘|校园招聘|careers?|recruit|join.?us|job(?:s|\/|\.|_|-)|zhaopin|zhiye|mokahr|feishu|beisen|hotjob|moka/i;
function publicEvidence(value,key=''){
  if(typeof value==='string'&&/^(?:url|requestedUrl|finalUrl|from|to|crossReference|roots|scriptSources)$/.test(key))return publicUrl(value);
  if(Array.isArray(value))return value.map(item=>publicEvidence(item,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,publicEvidence(item,name)]));
  return value;
}
const decode=value=>String(value).replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,item=>{
  const named={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};
  if(item[1]!=='#')return named[item.toLowerCase()]||' ';
  const number=item[2].toLowerCase()==='x'?parseInt(item.slice(3,-1),16):parseInt(item.slice(2,-1),10);
  return number>0&&number<=0x10ffff?String.fromCodePoint(number):' ';
});
const plain=value=>decode(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
function extract(html,base){
  const title=plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,180);
  const text=plain(html),links=[],discoveryLinks=[],seen=new Set();
  for(const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const href=match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if(!href)continue;
    const label=plain(match[2]).slice(0,180),url=acceptable(decode(href[1]??href[2]??href[3]),base);
    if(!url)continue;
    const key=url.href;if(seen.has(key))continue;seen.add(key);
    if(employment.test(label+' '+url.href)&&links.length<18)links.push({text:label,url:key});
    else if(/关于|公司简介|About (?:Us|Roborock)|Global Site|中国|China/i.test(label)&&discoveryLinks.length<6)discoveryLinks.push({text:label,url:key});
  }
  const scriptSources=[];
  for(const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)){
    const url=acceptable(decode(match[1]),base);if(url&&scriptSources.length<4)scriptSources.push(url.href);
  }
  const visibleSignals={login:/登录|登入|sign.?in|log.?in/i.test(text),registration:/注册|register|sign.?up/i.test(text),captcha:/验证码|captcha|人机验证/i.test(text),apply:/申请职位|立即申请|立即投递|投递简历|apply.?now/i.test(text),receipt:/申请记录|投递记录|我的申请|application.?status/i.test(text)};
  const identities=[...text.matchAll(/[^。；！？]{0,55}(?:有限公司|股份有限公司|版权所有|Copyright|All Rights Reserved)[^。；！？]{0,90}/gi)].map(match=>match[0].trim().slice(0,180)).slice(-3);
  return {title,textStart:text.slice(0,2200),textEnd:text.length>2200?text.slice(-1000):'',identityExcerpts:identities,visibleSignals,links,discoveryLinks,scriptSources,emptyShell:text.length<180};
}
async function requestPage(url,kind){
  let current=acceptable(url);
  const item={requestedUrl:current?.href??null,kind,redirects:[]};
  if(!current){item.outcome='URL_REFUSED';return item;}
  try{
    for(let count=0;count<5;count++){
      if(Date.now()>=deadline){item.outcome='GLOBAL_DEADLINE';return item;}
      const response=await fetch(current,{method:'GET',redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; public-readiness-research/1.0)','Accept':'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8'},signal:AbortSignal.timeout(Math.min(12_000,deadline-Date.now()))});
      item.status=response.status;item.finalUrl=current.href;
      if([301,302,303,307,308].includes(response.status)){
        const next=acceptable(response.headers.get('location')||'',current.href);
        item.redirects.push({status:response.status,from:item.finalUrl,to:next?.href??null});
        await response.body?.cancel();
        if(!next){item.outcome='REDIRECT_REFUSED';return item;}current=next;continue;
      }
      const type=response.headers.get('content-type')||'';item.contentType=type.split(';')[0].slice(0,80);
      if(!/(?:html|text\/plain|xhtml)/i.test(type)){await response.body?.cancel();item.outcome='NON_HTML';return item;}
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.byteLength;if(size>1_500_000){await response.body?.cancel().catch(()=>{});item.outcome='RESPONSE_TOO_LARGE';return item;}chunks.push(chunk);}
      item.bytes=size;
      const charset=/charset\s*=\s*["']?([^;\s"']+)/i.exec(type)?.[1]||'utf-8';
      let html;try{html=new TextDecoder(charset).decode(Buffer.concat(chunks));}catch{html=new TextDecoder().decode(Buffer.concat(chunks));}
      Object.assign(item,extract(html,current.href));item.outcome=response.ok?'READ':'HTTP_ERROR';return item;
    }
    item.outcome='REDIRECT_LIMIT';return item;
  }catch(error){item.outcome=error?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR';item.errorType=String(error?.name||'Error').slice(0,40);return item;}
}
function annotation(company){
  // GitHub workflow-command annotation messages are limited to 4096 UTF-8
  // bytes, not 12k JavaScript characters. Keep essential source chains intact.
  const pages=publicEvidence(company.pages.map(page=>({url:page.requestedUrl,kind:page.kind,status:page.status||null,finalUrl:page.finalUrl||null,outcome:page.outcome,title:page.title?.slice(0,95),identity:page.identityExcerpts?.slice(-1),redirects:page.redirects?.slice(-1),links:page.links?.slice(0,4),discoveryLinks:page.discoveryLinks?.slice(0,2),signals:page.visibleSignals,emptyShell:page.emptyShell,errorType:page.errorType})));
  const note={company:company.name,id:company.id,pages};
  const bytes=()=>Buffer.byteLength(JSON.stringify(note));
  if(bytes()>3750){note.compact=true;for(const page of pages){delete page.discoveryLinks;delete page.redirects;page.links=page.links?.slice(0,2);page.identity=page.identity?.map(text=>text.slice(0,100));}}
  if(bytes()>3750){for(const page of pages){delete page.signals;delete page.emptyShell;page.title=page.title?.slice(0,65);}}
  if(bytes()>3750){note.omittedSearchPages=true;note.pages=pages.filter(page=>!page.kind.startsWith('search-'));}
  if(bytes()>3750){for(const page of note.pages){delete page.identity;page.links=page.links?.slice(0,1);}}
  if(bytes()>3750)throw new Error('Research source summary exceeded its UTF-8 byte budget');
  const value=JSON.stringify(note);
  console.log('::notice title=Read-only hiring '+company.id+'::'+value.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
}
const evidence={schema:2,sourceSha:process.env.GITHUB_SHA||null,runId:process.env.GITHUB_RUN_ID||null,observedAt:new Date().toISOString(),timezone:'Asia/Shanghai',displayDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',dateStyle:'short'}).format(new Date()),method:'GET only; no cookies, account, form or application API; public HTML signals are observations, not verified login/application capability.',urlPolicy:'Navigation and deduplication use complete accepted hrefs. Published URLs are redacted display values and never reused for navigation.',companies:[]};
// Two company workers bound concurrency and keep the whole job below its deadline.
let index=0;
async function worker(){
  while(index<companies.length){
    const company=companies[index++];company.pages=[];
    for(const url of company.roots)company.pages.push(await requestPage(url,'candidate-root'));
    const visited=new Set(company.pages.map(page=>page.requestedUrl));
    if(!company.pages.some(page=>page.links?.length)){
      const discovery=company.pages.flatMap(page=>page.discoveryLinks||[]).slice(0,2);
      for(const link of discovery){if(visited.has(link.url))continue;visited.add(link.url);company.pages.push(await requestPage(link.url,'official-root-identity-outlink'));}
    }
    const hiring=company.pages.flatMap(page=>page.links||[]).filter(link=>!/(?:facebook|linkedin|twitter|youtube|instagram|weibo|weixin|wechat)\./i.test(new URL(link.url).hostname));
    for(const link of hiring.slice(0,3)){if(visited.has(link.url))continue;visited.add(link.url);company.pages.push(await requestPage(link.url,'official-root-outlink'));}
    if(company.search){const url='https://www.baidu.com/s?wd='+encodeURIComponent(company.search);company.pages.push(await requestPage(url,'search-discovery-only'));}
    evidence.companies.push(company);annotation(company);
  }
}
await Promise.all([worker(),worker()]);
evidence.finishedAt=new Date().toISOString();
await fs.writeFile(path.join(directory,'recruitment-readiness.json'),JSON.stringify(publicEvidence(evidence),null,2));
console.log('Read-only public readiness collection completed: '+evidence.companies.length+' companies. Public identity/ATS conclusions require source review; unsuccessful GETs are retained.');
