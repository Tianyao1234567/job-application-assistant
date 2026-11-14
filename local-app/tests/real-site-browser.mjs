// Anonymous public-page observation. No filling, uploads, login or application POST.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {browserOptions,testDirectory,removeTestDirectory,evidenceRoot} from '../../autofill-extension/tests/runtime.mjs';
import {acceptResearchUrl,publicResearchUrl} from '../../scripts/research-url.mjs';
import {greenhouseIdentity,readPublicApplication,preparePublicApplication} from '../../scripts/greenhouse-readonly.mjs';
const IMAGE='mcr.microsoft.com/playwright:v1.58.2-noble@sha256:65cefd09a5e943921ecd3a6e5414c603db2eb161e9eb48f2e2ccc63486dc7dc0';
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||process.env.REAL_SITE_READONLY!=='1'||process.env.CLOUD_PLAYWRIGHT_IMAGE!==IMAGE)throw new Error('EXPLICIT_HOSTED_READONLY_REQUIRED');
const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const {chromium}=require('playwright');
const proof=JSON.parse(await fs.readFile(path.join(evidenceRoot,'container-browser.json'),'utf8'));
assert.equal(proof.image,IMAGE);assert.equal(proof.copiedAndVerified,true);
const isolated=await testDirectory('real-site-public');
const result={sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,observedAt:new Date().toISOString(),status:'RUNNING',scope:'One anonymous browser, real official sources and blank application forms only. No registration/fill/upload/application submission.',candidates:[],blockedWrites:[],applicationPostsSent:0};
const sources=[{company:'Mattermost',url:'https://mattermost.com/careers/'},{company:'Tailscale',url:'https://tailscale.com/careers'},{company:'Automattic',url:'https://automattic.com/work-with-us/'}];
const publicUrl=value=>publicResearchUrl(value,{maxLength:500});
const clean=text=>String(text).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\+?\d[\d ()-]{8,}\d/g,'[number]').slice(0,150);
function notice(title,record){const encoded=JSON.stringify(record);assert.ok(Buffer.byteLength(encoded)<=3750);console.log('::notice title='+title+'::'+encoded.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));}
function roleId(href){const url=acceptResearchUrl(href);if(!url)return null;return url.pathname.split('/').find(part=>/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(part)||/^\d{5,}$/.test(part))||null;}
let browser,context,page,watchdog,requests=0;
async function observe(){
  const raw=await page.evaluate(()=>{
    const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
    const text=document.body?.innerText||'';
    return {title:document.title,lines:text.split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,60),links:[...document.querySelectorAll('a[href]')].filter(visible).slice(0,700).map(a=>({text:a.innerText.trim().replace(/\s+/g,' ').slice(0,110),href:a.href})),fields:[...document.querySelectorAll('input,textarea,select')].filter(node=>visible(node)||node.type==='file').slice(0,45).map(node=>({visible:!!visible(node),tag:node.tagName,type:node.type||'',name:node.name||'',id:node.id||'',required:node.required,accept:node.accept||'',label:node.labels?.[0]?.innerText.trim().slice(0,120)||node.getAttribute('aria-label')||'',empty:!node.value})),forms:[...document.forms].map(form=>({method:form.method,action:form.action})).slice(0,5),verification:[...document.querySelectorAll('input[type=password],input[autocomplete=one-time-code],iframe[src*=captcha i],iframe[src*=verify i]')].some(visible)};
  });
  return {...raw,title:clean(raw.title),lines:raw.lines.map(clean),links:raw.links.filter(link=>acceptResearchUrl(link.href)).map(link=>({...link,text:clean(link.text)})),url:page.url()};
}
async function navigate(url){
  assert.ok(acceptResearchUrl(url));
  try{const response=await page.goto(url,{waitUntil:'commit',timeout:15000});await page.waitForFunction(()=>document.body?.innerText.trim().length>80,null,{timeout:12000}).catch(()=>{});await page.waitForTimeout(2000);return response?.status()||null;}
  catch{return 'NAVIGATION_FAILED';}
}
async function run(){
  browser=await chromium.launch(browserOptions({headless:false,downloadsPath:path.join(isolated,'downloads'),artifactsDir:path.join(isolated,'artifacts')}));
  context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',async route=>{
    const request=route.request();requests++;
    if(!['GET','HEAD'].includes(request.method())){if(result.blockedWrites.length<12){let url;try{const parsed=new URL(request.url());url=publicUrl(parsed.origin+parsed.pathname);}catch{url='[refused]';}result.blockedWrites.push({method:request.method(),url});}return route.abort('blockedbyclient');}
    if(requests>350||!acceptResearchUrl(request.url()))return route.abort('blockedbyclient');
    return route.continue();
  });
  page=await context.newPage();context.on('page',popup=>{if(popup!==page)popup.close().catch(()=>{});});page.on('download',download=>download.cancel());
  for(const source of sources){
    const item={company:source.company,officialSource:source.url,stages:[],outcome:'STOPPED'};result.candidates.push(item);
    const status=await navigate(source.url),home=await observe();item.stages.push({phase:'official',url:publicUrl(home.url),status,title:home.title});
    if(status==='NAVIGATION_FAILED'||status>=400||!home.title.toLowerCase().includes(source.company.toLowerCase())){item.stop='OFFICIAL_SOURCE_NOT_VERIFIED';continue;}
    let hiring=home;
    const jobsMenu=home.links.find(link=>new URL(link.href).origin===new URL(home.url).origin&&/^(?:View open jobs|Open jobs|Apply for an open role)$/i.test(link.text));
    if(jobsMenu){await navigate(jobsMenu.href);hiring=await observe();item.stages.push({phase:'observed-official-jobs-menu',url:publicUrl(hiring.url),title:hiring.title});}
    const outbound=hiring.links.find(link=>/^(?:jobs\.lever\.co|jobs\.eu\.lever\.co|job-boards\.greenhouse\.io|boards\.greenhouse\.io)$/.test(new URL(link.href).hostname)&&!/privacy|legal|login/.test(link.href));
    if(!outbound){item.stop='ATS_OUTBOUND_NOT_OBSERVED';item.publicLinks=hiring.links.filter(link=>/career|opening|vacanc|job|position/i.test(link.text+' '+link.href)).slice(0,8).map(link=>({text:link.text,url:publicUrl(link.href)}));continue;}
    item.officialATSHref=publicUrl(outbound.href);
    await navigate(outbound.href);let list=await observe();item.stages.push({phase:'observed-ats',url:publicUrl(list.url),title:list.title,verification:list.verification});
    // A challenge widget on an otherwise public job/application page is a
    // submission boundary, not a reason to hide already readable public fields.
    if(list.verification&&list.fields.length===0&&list.lines.join(' ').length<500){item.stop='BLOCKING_LOGIN_OR_MANUAL_VERIFICATION';continue;}
    // Only actual observed links supply role identifiers and navigation targets.
    const base=new URL(outbound.href),tenant=base.pathname.split('/').filter(Boolean)[0];
    const candidates=[outbound,...list.links].filter(link=>{const url=new URL(link.href);return url.origin===base.origin&&url.pathname.split('/').filter(Boolean)[0]===tenant&&roleId(link.href)&&!/apply|application|login/i.test(url.pathname);});
    const selected=candidates.find(link=>/engineer|developer|software|research|product/i.test(link.text))||candidates[0];
    if(!selected){item.stop='PUBLIC_ROLE_NOT_OBSERVED';item.lines=list.lines.slice(0,15);continue;}
    await navigate(selected.href);const detail=await observe();
    if(new URL(detail.url).origin!==base.origin||new URL(detail.url).pathname.split('/').filter(Boolean)[0]!==tenant){item.stop='TENANT_CHANGED';continue;}
    item.role={id:roleId(detail.url)||roleId(selected.href),url:publicUrl(detail.url),title:detail.title,linkText:selected.text,descriptionLines:detail.lines.filter(line=>!/^apply|^privacy|^cookie/i.test(line)).slice(0,8)};
    item.stages.push({phase:'role-detail',url:publicUrl(detail.url),title:detail.title});
    let form=detail;
    const apply=detail.links.find(link=>{const url=new URL(link.href);return url.origin===base.origin&&url.pathname.includes(item.role.id)&&/apply/i.test(url.pathname)&&/apply|申请/i.test(link.text);});
    if(apply){await navigate(apply.href);form=await observe();}
    item.stages.push({phase:'blank-application',url:publicUrl(form.url),title:form.title,verification:form.verification});
    item.form={url:publicUrl(form.url),verification:form.verification,fields:form.fields,forms:form.forms.map(value=>({...value,action:publicUrl(value.action)})),visibleFieldCount:form.fields.length,uploadObserved:form.fields.some(field=>field.type==='file'),noValuesEntered:true};
    if(/^(?:job-boards|boards)\.greenhouse\.io$/.test(new URL(form.url).hostname)){
      const identity=greenhouseIdentity(item.role.url);
      item.preparation=preparePublicApplication(await page.evaluate(readPublicApplication),{...identity,company:source.company});
    }
    item.outcome=form.fields.some(field=>/name|email/i.test(field.name+' '+field.label))?'PUBLIC_FORM_OBSERVED':form.verification?'MANUAL_VERIFICATION_REQUIRED':'PUBLIC_ROLE_OBSERVED';
    if(item.outcome==='PUBLIC_FORM_OBSERVED')break;
  }
  result.status='OBSERVED';
}
try{await Promise.race([run(),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(new Error('BOUNDED_RESEARCH_TIMEOUT')),210000);})]);}
catch(error){result.status='FAIL';result.failure={type:error.name,frames:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,3)};process.exitCode=1;}
finally{
  clearTimeout(watchdog);await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await removeTestDirectory(isolated);result.cleanup=true;
  await fs.writeFile(path.join(evidenceRoot,'real-site-browser.json'),JSON.stringify(result,null,2));
  notice('Real site public observation',{sourceSHA:result.sourceSHA,status:result.status,applicationPostsSent:0,cleanup:result.cleanup,candidates:result.candidates.map(({company,outcome,stop,officialSource,officialATSHref,role,form})=>({company,outcome,stop,officialSource,officialATSHref,role:role&&{id:role.id,url:role.url,title:role.title},form:form&&{url:form.url,visibleFieldCount:form.visibleFieldCount,uploadObserved:form.uploadObserved,verification:form.verification}}))});
  for(const item of result.candidates){for(let i=0;i<(item.form?.fields.length||0);i+=4)notice('Observed blank application controls',{company:item.company,roleId:item.role.id,fields:item.form.fields.slice(i,i+4)});if(item.publicLinks)notice('Observed official hiring links',{company:item.company,links:item.publicLinks});}
  for(const item of result.candidates)if(item.preparation){const value=item.preparation;notice('Greenhouse preparation scope',{sourceSHA:result.sourceSHA,identity:value.identity,structureVersion:value.structureVersion,executionEnabled:false,productionSupported:false,verificationVisible:value.verificationVisible,fieldCount:value.fields.length,requiredCount:value.fields.filter(field=>field.required).length,unresolvedCount:value.fields.filter(field=>field.unresolved).length,applicationPostsSent:0});for(const field of value.fields){const record=Buffer.byteLength(JSON.stringify(field))<3400?field:{...field,options:[],optionsCount:field.options.length,fullOptionsInArtifact:true};notice('Greenhouse original question preparation',{field:record});}}
}
