// Explicit hosted, single-browser public observation. Never registers, fills or submits.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot} from '../../autofill-extension/tests/runtime.mjs';
import {acceptResearchUrl,researchUrlKey,publicResearchUrl} from '../../scripts/research-url.mjs';

const IMAGE='mcr.microsoft.com/playwright:v1.58.2-noble@sha256:65cefd09a5e943921ecd3a6e5414c603db2eb161e9eb48f2e2ccc63486dc7dc0';
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||process.env.REAL_SITE_READONLY!=='1'||process.env.CLOUD_PLAYWRIGHT_IMAGE!==IMAGE)throw new Error('Use only the explicitly selected hosted Linux public-site observation job.');
const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const isolated=await testDirectory('public-site-readonly');
const proof=JSON.parse(await fs.readFile(path.join(evidenceRoot,'container-browser.json'),'utf8'));
assert.equal(proof.image,IMAGE);assert.equal(proof.playwright,'1.58.2');assert.equal(proof.copiedAndVerified,true);
const digest=value=>createHash('sha256').update(value).digest('hex');
const display=url=>publicResearchUrl(url,{maxLength:650});
const official='https://www.4paradigm.com/about/hr.html';
const evidence={schema:1,status:'RUNNING',sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,observedAt:new Date().toISOString(),timezone:'Asia/Shanghai',scope:'One isolated browser; actual public page observation only. No extension, account, form, upload or application submission.',resources:{maxBrowserInstances:1},requestMethods:{},blockedMethods:[],blockedUnsafeRequests:0,documentResponses:[],observations:[],facts:{officialHiringSourceObserved:false,actualSocialHrefObserved:false,publicListVerified:false,detailVerified:false,stableJobIdVerified:false,fullNavigationIdentityPreserved:true,applicationRequestsSent:0},outcome:'STOPPED',stopReason:null};
let browser,context,page,timer,phase='environment',requestCount=0,documentCount=0;
const repeatedNavigation=new Map();
function linkEvidence(href){const url=acceptResearchUrl(href);return url?{publicUrl:display(url.href),fullUrlSha256:digest(url.href),publicDisplayIsComplete:display(url.href)===url.href,hashPresent:Boolean(url.hash)}:null;}
function notice(value){
  let note={status:evidence.status,sourceSHA:evidence.sourceSHA,outcome:evidence.outcome,stopReason:evidence.stopReason,facts:evidence.facts,requestMethods:evidence.requestMethods,blockedMethods:evidence.blockedMethods.slice(0,4),documents:evidence.documentResponses.slice(-5),observations:evidence.observations.map(item=>({...item,headings:item.headings?.slice(0,2),links:item.links?.slice(0,2),jobLines:item.jobLines?.slice(0,3)})),cleanup:evidence.cleanup};
  if(Buffer.byteLength(JSON.stringify(note))>3600)for(const item of note.observations){delete item.headings;delete item.links;item.jobLines=item.jobLines?.slice(0,1);}
  if(Buffer.byteLength(JSON.stringify(note))>3600)note.documents=note.documents.slice(-2);
  if(Buffer.byteLength(JSON.stringify(note))>3600)note.observations=note.observations.map(({phase,url,title,bodyCharacters,signals,jobLines,stableId})=>({phase,url,title,bodyCharacters,signals,jobLines,stableId}));
  const text=JSON.stringify(note);assert.ok(Buffer.byteLength(text)<=3750,'Public observation notice must remain below platform truncation');
  console.log('::notice title=Public recruitment read-only result::'+text.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
}
async function observe(label){
  const raw=await page.evaluate(()=>{
    const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&getComputedStyle(node).display!=='none';
    const body=document.body?.innerText||'',lines=body.split(/\n+/).map(text=>text.trim()).filter(Boolean);
    const anchors=[...document.querySelectorAll('a[href]')].filter(visible).slice(0,800).map(node=>({href:node.getAttribute('href'),text:node.innerText.trim().replace(/\s+/g,' ').slice(0,130),jobId:node.getAttribute('data-job-id')||node.getAttribute('data-position-id')||null}));
    return {title:document.title.slice(0,160),bodyCharacters:body.length,headings:[...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0,5).map(node=>node.innerText.trim().slice(0,100)),anchors,jobLines:lines.filter(text=>text.length>=3&&text.length<=75&&/工程师|架构师|算法|研究员|实习生|产品经理|开发经理|研发经理|职位描述|岗位职责|任职要求|工作职责/.test(text)&&!/@|邮箱|电话|登录|注册|立即申请|投递简历/.test(text)).slice(0,10),signals:{passwordForm:[...document.querySelectorAll('input[type=password]')].some(visible),verificationField:[...document.querySelectorAll('input[autocomplete=one-time-code],input[name*=captcha i]')].some(visible),verificationFrame:[...document.querySelectorAll('iframe[src*=captcha i],iframe[src*=verify i]')].some(visible),loginText:/登录|sign.?in/i.test(body),verificationText:/验证码|人机验证|安全验证|captcha/i.test(body),detailSections:/职位描述|岗位职责|任职要求|工作职责/.test(body),loadingOnly:body.trim().length<180&&/加载|loading|please wait|请稍候/i.test(body)}};
  });
  const current=acceptResearchUrl(page.url());
  const links=raw.anchors.map(anchor=>{const parsed=acceptResearchUrl(anchor.href,current?.href);return parsed?{...anchor,href:parsed.href}:null;}).filter(Boolean);
  const item={phase:label,url:current?linkEvidence(current.href):{publicUrl:'[not an accepted HTTPS document]'},title:raw.title,bodyCharacters:raw.bodyCharacters,headings:raw.headings,signals:raw.signals,jobLines:raw.jobLines,links:links.filter(anchor=>/招聘|职位|岗位|招贤|社会招聘|mokahr|job|position/i.test(anchor.text+' '+anchor.href)).slice(0,12).map(anchor=>({text:anchor.text,...linkEvidence(anchor.href)}))};
  evidence.observations.push(item);return {...raw,links,current,item};
}
async function navigate(href,label){
  const accepted=acceptResearchUrl(href);assert.ok(accepted,'Only safe full public URLs may be navigated');
  assert.equal(researchUrlKey(accepted.href),accepted.href);phase=label;
  try{const response=await page.goto(accepted.href,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(3500);return {ok:true,status:response?.status()??null};}
  catch(error){return {ok:false,error:/ERR_TOO_MANY_REDIRECTS/.test(String(error.message))?'BROWSER_REDIRECT_LIMIT':error.name==='TimeoutError'?'NAVIGATION_TIMEOUT':'NAVIGATION_FAILED'};}
}
function observedJobId(url,anchorId){
  if(anchorId&&/^[a-zA-Z0-9_-]{2,100}$/.test(anchorId))return {value:anchorId,source:'observed DOM data-job-id/data-position-id'};
  for(const [name,value] of url.searchParams)if(/^(?:job_?id|position_?id|reqid)$/i.test(name)&&/^[a-zA-Z0-9_-]{2,100}$/.test(value))return {value,source:'observed URL query '+name};
  const segments=(url.pathname+'/'+url.hash.replace(/^#/,'')).split(/[/?#]/).filter(Boolean),last=segments.at(-1);
  if(last&&/^(?:[0-9]{3,}|[a-f0-9]{8}-[a-f0-9-]{20,}|[a-f0-9]{16,})$/i.test(last))return {value:last,source:'observed detail URL terminal identifier'};
  return null;
}
async function probe(){
  phase='browser-launch';browser=await chromium.launch(browserOptions({headless:false,downloadsPath:path.join(isolated,'downloads'),artifactsDir:path.join(isolated,'artifacts')}));
  context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:false,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),method=request.method();requestCount++;evidence.requestMethods[method]=(evidence.requestMethods[method]||0)+1;
    const accepted=acceptResearchUrl(request.url());
    if(!['GET','HEAD'].includes(method)){
      if(evidence.blockedMethods.length<12)evidence.blockedMethods.push({method,resourceType:request.resourceType(),url:accepted?display(accepted.href):'[URL refused]'});
      return route.abort('blockedbyclient');
    }
    if(!accepted||requestCount>250){evidence.blockedUnsafeRequests++;return route.abort('blockedbyclient');}
    if(request.isNavigationRequest()&&request.frame()===page?.mainFrame()){
      documentCount++;const count=(repeatedNavigation.get(accepted.href)||0)+1;repeatedNavigation.set(accepted.href,count);
      if(count>6||documentCount>20){evidence.navigationLimitReached=true;return route.abort('blockedbyclient');}
    }
    return route.continue();
  });
  page=await context.newPage();page.on('download',download=>download.cancel());
  context.on('page',popup=>{if(popup!==page)popup.close().catch(()=>{});});
  page.on('response',response=>{if(response.request().isNavigationRequest()&&response.frame()===page.mainFrame()&&evidence.documentResponses.length<16){const safe=acceptResearchUrl(response.url());evidence.documentResponses.push({status:response.status(),url:safe?display(safe.href):'[URL refused]'});}});
  const home=await navigate(official,'official-hiring-page');
  const source=await observe('official-hiring-page');
  if(!home.ok||home.status>=400){evidence.stopReason=home.error||'OFFICIAL_HTTP_'+home.status;return;}
  if(!/第四范式|4Paradigm/i.test(source.title+' '+source.headings.join(' '))){evidence.stopReason='OFFICIAL_IDENTITY_NOT_OBSERVED';return;}
  evidence.facts.officialHiringSourceObserved=true;
  const social=source.links.find(link=>{const url=new URL(link.href);return /(?:^|\.)mokahr\.com$/.test(url.hostname)&&url.pathname.includes('/social-recruitment/')&&url.pathname.split('/').includes('4paradigm');});
  if(!social){evidence.stopReason='OFFICIAL_SOCIAL_HREF_NOT_OBSERVED';return;}
  evidence.officialSocialHref=linkEvidence(social.href);evidence.facts.actualSocialHrefObserved=true;
  const listNavigation=await navigate(social.href,'actual-social-href');
  const list=await observe('actual-social-href');
  if(!listNavigation.ok||listNavigation.status>=400){evidence.stopReason=evidence.navigationLimitReached?'BOUNDED_REPEATED_NAVIGATION':listNavigation.error||'SOCIAL_HTTP_'+listNavigation.status;return;}
  if(list.signals.passwordForm||list.signals.verificationField||list.signals.verificationFrame){evidence.stopReason='LOGIN_OR_MANUAL_VERIFICATION_OBSERVED';return;}
  const baseKey=researchUrlKey(list.current?.href||social.href);
  const jobs=list.links.filter(link=>{const url=new URL(link.href);return url.origin===new URL(social.href).origin&&researchUrlKey(url.href)!==baseKey&&!/apply|application|register|login|passport|resume|privacy|policy|agreement/i.test(url.href+' '+link.text)&&/job|position|工程师|研究员|架构师|算法|实习|经理/i.test(url.href+' '+link.text);});
  const selected=jobs.find(link=>observedJobId(new URL(link.href),link.jobId))||jobs[0];
  evidence.facts.publicListVerified=Boolean(selected&&list.jobLines.length>0);
  if(!selected){evidence.stopReason=list.signals.loadingOnly?'PUBLIC_LOADING_SHELL':evidence.blockedMethods.length?'PUBLIC_LIST_NOT_OBSERVED_WITH_WRITE_METHODS_BLOCKED':'PUBLIC_JOB_LINK_NOT_OBSERVED';return;}
  const detailNavigation=await navigate(selected.href,'observed-job-detail');
  const detail=await observe('observed-job-detail');
  if(!detailNavigation.ok||detailNavigation.status>=400){evidence.stopReason=detailNavigation.error||'DETAIL_HTTP_'+detailNavigation.status;return;}
  if(detail.signals.passwordForm||detail.signals.verificationField||detail.signals.verificationFrame){evidence.stopReason='DETAIL_LOGIN_OR_MANUAL_VERIFICATION_OBSERVED';return;}
  const stable=observedJobId(detail.current||new URL(selected.href),selected.jobId);
  detail.item.stableId=stable;
  evidence.facts.detailVerified=detail.bodyCharacters>250&&detail.signals.detailSections;
  evidence.facts.stableJobIdVerified=Boolean(stable&&evidence.facts.detailVerified);
  evidence.observedDetailHref=linkEvidence(selected.href);
  if(evidence.facts.publicListVerified&&evidence.facts.detailVerified&&evidence.facts.stableJobIdVerified){evidence.outcome='READONLY_DISCOVERY_OBSERVED';evidence.stopReason=null;}
  else evidence.stopReason='DETAIL_OR_STABLE_ID_NOT_VERIFIED';
}
try{
  await Promise.race([probe(),new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('Public browser observation reached its bound');error.code='PROBE_TIMEOUT';reject(error);},150000);})]);
  evidence.status='OBSERVED';
}catch(error){
  evidence.status='FAIL';evidence.stopReason=error.code==='PROBE_TIMEOUT'?'PROBE_TIMEOUT':'HARNESS_FAILURE';evidence.failure={phase,errorType:error.name,frames:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,3)};process.exitCode=1;
}finally{
  clearTimeout(timer);if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});
  await removeTestDirectory(isolated);let removed=false;try{await fs.lstat(isolated);}catch(error){if(error.code==='ENOENT')removed=true;else throw error;}
  assert.equal(removed,true);evidence.cleanup={onlyIsolatedTarget:true,targetRemoved:true};evidence.finishedAt=new Date().toISOString();
  await fs.writeFile(path.join(evidenceRoot,'public-site-browser.json'),JSON.stringify(evidence,null,2));notice(evidence);
}
