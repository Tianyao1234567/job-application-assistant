// Explicitly requested fictional product demonstration. Normal tests never capture media.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createAcceptance,BASE,FIXTURE,delay,until} from './acceptance-runtime.mjs';
import {evidenceRoot,removeTestDirectory} from '../../autofill-extension/tests/runtime.mjs';

if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||process.env.CLOUD_DEMO_CAPTURE!=='reviewed-fictional')throw new Error('Demo capture requires the explicitly selected fictional hosted Linux demonstration job.');
assert.match(process.env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
const h=await createAcceptance('demo');
const review=path.join(h.isolated,'demo-review'),destination=path.join(evidenceRoot,'demo-reviewed');
const captures=[],privateValues=new Set(),resourceSamples=[];
const answer='这是经确认的虚构演示答案：希望参与本地测试站展示的机器人测试开发。';
let watchdog,resourceTimer,currentStage='prepare',succeeded=false,publicSummary;
await fs.mkdir(review,{recursive:true});

function notice(title,value){
  const text=JSON.stringify(value);assert.ok(text.length<11000);
  for(const marker of privateValues)assert.ok(!text.includes(marker),'Private bindings must not enter a demo notice');
  console.error('::notice title='+title+'::'+text.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
}
const task=value=>value.tasks.find(item=>item.jobId==='cpp-001');
const idle=()=>until('demonstration command has completed',h.state,()=>!h.app.store.command);
async function waitTask(status){return until('actual demonstration task is '+status,h.state,value=>task(value)?.status===status);}
async function show(view){
  await h.dashboard.locator(`nav [data-view="${view}"]`).click();
  await h.dashboard.locator(`nav [data-view="${view}"][aria-current="page"]`).waitFor();
  await delay(250);
}
async function rememberPrivateBindings(){
  const state=await h.state();
  for(const value of [await h.dashboard.locator('meta[name="local-key"]').getAttribute('content'),state.connection.profileId,...state.tasks.map(item=>item.id),...state.tasks.map(item=>item.result?.receiptId),...(await h.context.cookies()).map(cookie=>cookie.value)])if(typeof value==='string'&&value.length>8)privateValues.add(value);
  h.protect(...privateValues);
}
function pngMetadata(bytes){
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Only actual PNG screenshots may be published');
  let offset=8,width,height,ended=false;
  while(offset<bytes.length){
    const length=bytes.readUInt32BE(offset),type=bytes.subarray(offset+4,offset+8).toString('ascii');
    assert.ok(['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs','iCCP'].includes(type),'Demo screenshots must exclude text, EXIF and arbitrary metadata');
    assert.ok(offset+12+length<=bytes.length);
    if(type==='IHDR'){width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);}
    offset+=12+length;if(type==='IEND'){ended=true;break;}
  }
  assert.equal(ended,true);assert.equal(offset,bytes.length);assert.ok(width>200&&width<=1600&&height>100&&height<12000);
  for(const marker of privateValues)assert.ok(!bytes.includes(Buffer.from(marker)),'Screenshot metadata must not contain private bindings');
  return {width,height};
}
async function capture(file,caption,page,selector='body',extraMask=[]){
  currentStage='capture '+file;await rememberPrivateBindings();
  // Privacy tags only alter masking, never task state, labels, form data or progress.
  await page.evaluate(markers=>{
    document.querySelectorAll('[data-demo-private]').forEach(node=>node.removeAttribute('data-demo-private'));
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))if(markers.some(marker=>node.textContent.includes(marker)))node.parentElement.setAttribute('data-demo-private','true');
    document.querySelectorAll('input,textarea,select').forEach(node=>{if(markers.some(marker=>node.value.includes(marker)))node.setAttribute('data-demo-private','true');});
  },[...privateValues]);
  const privacy=await page.locator(selector).evaluate((root,{markers,extraMask})=>{
    const masked=node=>node.closest('[data-demo-private],p[data-session-status]')||extraMask.some(selector=>node.matches(selector)||node.closest(selector));
    let safe=true;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
      const parent=node.parentElement;if(!parent||masked(parent)||!parent.getClientRects().length||getComputedStyle(parent).visibility==='hidden')continue;
      if(markers.some(marker=>node.textContent.includes(marker)))safe=false;
    }
    for(const node of root.querySelectorAll('input,textarea,select'))if(!masked(node)&&node.getClientRects().length&&markers.some(marker=>node.value.includes(marker)))safe=false;
    return {privateValuesMasked:safe,noCredentialInputs:[...root.querySelectorAll('input[type=password],input[autocomplete=one-time-code]')].every(masked),profileJSONExcluded:!root.querySelector('[data-focus="profile-json"]')};
  },{markers:[...privateValues],extraMask});
  assert.ok(Object.values(privacy).every(Boolean),'Visible demo content failed the pre-capture privacy review');
  const filePath=path.join(review,file);
  // Dynamic text locators remain effective if a normal dashboard poll rerenders
  // the tagged nodes between the DOM review and the browser screenshot.
  await page.locator(selector).screenshot({path:filePath,animations:'disabled',mask:[page.locator('[data-demo-private]'),page.locator('p[data-session-status]'),...[...privateValues].map(marker=>page.getByText(marker,{exact:false})),...extraMask.map(selector=>page.locator(selector))],maskColor:'#cbd5e1'});
  const bytes=await fs.readFile(filePath),dimensions=pngMetadata(bytes);
  captures.push({file,caption,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,...dimensions,review:{...privacy,pngMetadataChecked:true},sourceSHA:process.env.GITHUB_SHA});
}
async function sampleResources(){
  try{
    const rows=[];
    for(const entry of await fs.readdir('/proc')){
      if(!/^\d+$/.test(entry))continue;
      try{const value=await fs.readFile('/proc/'+entry+'/status','utf8');rows.push({pid:Number(entry),parent:Number(value.match(/^PPid:\s+(\d+)/m)?.[1]),rssKiB:Number(value.match(/^VmRSS:\s+(\d+)/m)?.[1]||0)});}catch{}
    }
    const tree=new Set([process.pid]);let changed=true;
    while(changed){changed=false;for(const row of rows)if(tree.has(row.parent)&&!tree.has(row.pid)){tree.add(row.pid);changed=true;}}
    const descendants=rows.filter(row=>tree.has(row.pid)&&row.pid!==process.pid);
    resourceSamples.push({descendantProcesses:descendants.length,descendantRssKiB:descendants.reduce((sum,row)=>sum+row.rssKiB,0),nodeRssKiB:Math.round(process.memoryUsage().rss/1024)});
  }catch{}
}
const escape=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
async function demonstrate(){
  await h.start();await h.launch('demonstration');
  await h.dashboard.setViewportSize({width:1440,height:1050});
  h.dashboard.once('dialog',dialog=>dialog.accept());
  await h.dashboard.getByRole('button',{name:'准备虚构演示资料',exact:true}).click();
  const initial=await until('real dashboard saved explicitly fictional demonstration data',h.state,value=>value.profile.version===1&&value.resume?.version===1);
  await h.api('/settings',{settings:initial.settings,sites:initial.sites.map(site=>({...site,enabled:site.id==='local-alpha'}))});
  await rememberPrivateBindings();await sampleResources();resourceTimer=setInterval(()=>sampleResources(),1000);
  await show('overview');await capture('01-dashboard.png','01 · 真实后台与已连接扩展；全部是虚构本地演示',h.dashboard);
  const created=await h.action('add',{url:FIXTURE+'/site/alpha/jobs/cpp-001'}),id=created.task.id;
  await h.action('resume');await waitTask('waiting_user');await idle();
  assert.equal(h.posts().length,0);await show('issues');await h.dashboard.getByText('请在实际执行的同一投递浏览器中处理，然后重新检查。页面打开或自行勾选完成不会被当作已登录。',{exact:true}).waitFor();
  await capture('02-login-reason.png','02 · 尚未登录时实际停止，集中显示需要处理的原因；零申请',h.dashboard);
  await (await h.login('alpha','demo')).close();await h.action('site-check',{siteId:'local-alpha'});
  await waitTask('waiting_answer');await idle();
  const page=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/apply/cpp-001');assert.ok(page);
  await page.setViewportSize({width:1100,height:1000});
  assert.ok(await page.locator('[name="education.0.school"]').inputValue());assert.ok(await page.locator('[name="education.1.school"]').inputValue());
  assert.equal(await page.locator('[name="experience.0.company"]').inputValue(),'虚构机器人实验室');assert.equal(await page.locator('[name="experience.1.company"]').inputValue(),'虚构软件工作室');
  const pinned=h.app.store.task(id).resumeSnapshot;
  assert.equal(await page.locator('[type="file"]').evaluate(node=>node.files[0]?.name),pinned.name);assert.equal(await page.locator('[type="file"]').evaluate(node=>node.files[0]?.size),pinned.size);
  assert.equal(await page.locator('[name="motivation"]').inputValue(),'');assert.equal(h.posts().length,0);
  await capture('03-filled-application.png','03 · 扩展实际填写多段教育/经历并附上虚构文件；个人联系字段已遮罩，缺答前未提交',page,'[data-application-form]',['input[name^="personal."],textarea[name^="personal."]']);
  await show('issues');await h.dashboard.getByRole('button',{name:'确认答案并继续原任务',exact:true}).waitFor();
  await capture('04-question.png','04 · 真实原问题与限定用途，等待用户确认答案，系统不猜测',h.dashboard);
  await show('queue');await h.dashboard.getByRole('button',{name:'查看详情',exact:true}).click();
  await h.dashboard.getByRole('button',{name:'暂停并接管',exact:true}).click();
  await waitTask('paused');await idle();
  assert.equal(task(await h.state()).pauseReason,'用户暂停并接管');
  await h.dashboard.locator('#task-dialog').getByText('用户暂停',{exact:true}).waitFor();
  await h.dashboard.locator('#task-dialog').getByText('用户暂停',{exact:true}).scrollIntoViewIfNeeded();
  await capture('05-paused-task.png','05 · 用户暂停后保留原任务和真实执行记录，停止后续自动动作',h.dashboard,'#task-dialog');
  await h.dashboard.getByRole('button',{name:'重新检查并继续',exact:true}).click();
  await waitTask('waiting_answer');await idle();
  await h.dashboard.keyboard.press('Escape');await show('issues');
  await h.dashboard.getByRole('textbox',{name:'确认答案',exact:true}).fill(answer);
  await h.dashboard.getByRole('button',{name:'确认答案并继续原任务',exact:true}).click();
  const submitted=await waitTask('submitted');await idle();
  assert.equal(task(submitted).id,id);assert.equal(task(submitted).submissionStarted,true);assert.equal(h.posts().length,1);
  const actual=await h.fixture();assert.equal(actual.submitRequests.length,1);assert.equal(actual.receipts.length,1);assert.equal(actual.submitRequests[0].accepted,true);
  const receipt=actual.receipts[0];assert.equal(receipt.fileName,pinned.name);assert.equal(receipt.fileSize,pinned.size);assert.equal(receipt.sha256,pinned.sha256);assert.equal(receipt.fields.motivation,answer);
  const received=await fs.readFile(path.join(h.dataDir,'fixture','uploads',receipt.id+'.bin'));assert.equal(createHash('sha256').update(received).digest('hex'),pinned.sha256);
  const resultPage=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/receipt/cpp-001');assert.ok(resultPage);
  await capture('06-receipt.png','06 · 原生申请收到可靠回执；实际文件大小与SHA-256一致，回执标识已遮罩',resultPage,'.receipt');
  await show('queue');await h.dashboard.getByText('已核实提交',{exact:true}).first().waitFor();
  await capture('07-result.png','07 · 后台依据站点实际回执更新原任务；一次HTTP申请、一次接收、一份回执',h.dashboard);
  await sampleResources();
  return {sameTask:true,profileVersion:1,resumeVersion:1,actualMultiEntryFill:true,actualFileUpload:true,missingAnswerStopped:true,pauseAndResume:true,confirmedAnswerUsed:true,observedHttpApplicationPosts:h.posts().length,actualMultipartRequests:actual.submitRequests.length,acceptedReceipts:actual.receipts.length,fileBytesVerified:true,submissionBoundaryRetained:true};
}
try{
  const facts=await Promise.race([demonstrate(),new Promise((_,reject)=>{watchdog=setTimeout(()=>{const error=new Error('Bounded demonstration timed out');error.code='DEMO_TIMEOUT';reject(error);},240000);})]);
  clearInterval(resourceTimer);assert.equal(captures.length,7);assert.ok(resourceSamples.length>0,'Linux resource sampling must actually execute');
  await h.verifyPrivateEvidence();await h.closeBrowser();await h.closeApp();
  const resource={scope:'Sampled Linux hosted runner process tree only; not a Windows/user-machine promise.',samplingIntervalMs:1000,samples:resourceSamples.length,maxSampledDescendantProcesses:Math.max(...resourceSamples.map(item=>item.descendantProcesses)),maxSampledDescendantRssMiB:Math.round(Math.max(...resourceSamples.map(item=>item.descendantRssKiB))/1024),maxSampledNodeRssMiB:Math.round(Math.max(...resourceSamples.map(item=>item.nodeRssKiB))/1024),sharedPagesMayBeCountedMoreThanOnce:true,maxConcurrentBrowserInstances:1};
  const manifest={version:'0.2.0-pm9-demo',status:'PASS',sourceSHA:process.env.GITHUB_SHA,acceptedBaseline:'b6cfdee0bbded79010bb97866fd1ad538275270f',runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,generatedAt:new Date().toISOString(),environment:{platform:process.platform,node:process.version,image:process.env.CLOUD_PLAYWRIGHT_IMAGE,browser:h.evidence.environment.browser},scope:'Actual extension and isolated fictional local fixture. No real recruiting website, real account or Windows browser acceptance.',privacy:{mode:'explicit-opt-in-fictional-media',automatedDOMAndPNGReview:true,keysCookiesProfileAndSessionIdentifiersMasked:true,rawProfileOrBrowserDirectoryExcluded:true,manualVisualReview:'not-performed-by-script'},facts,resource,captures};
  const encoded=JSON.stringify(manifest,null,2);for(const marker of privateValues)assert.ok(!encoded.includes(marker),'Published demo manifest must exclude private bindings');
  await fs.writeFile(path.join(review,'manifest.json'),encoded);
  const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>求职助手 · 云端虚构站真实演示</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#182333}header{background:#eef4ff;padding:24px;border-radius:12px}figure{margin:38px 0}img{max-width:100%;height:auto;border:1px solid #ccd4df}figcaption{font-weight:600}code{overflow-wrap:anywhere}</style><header><h1>求职助手：云端虚构站真实演示</h1><p>以下7张图来自实际加载的扩展和真实本地HTTP站点，不是动画或模拟进度。全部资料均为虚构；个人联系字段、会话与内部标识已遮罩。</p><p>这是安装前查看材料，不代表Windows安装或真实招聘站已经验收。</p><p>来源代码：<code>'+escape(manifest.sourceSHA)+'</code> · 申请POST / 接收 / 唯一回执：1 / 1 / 1</p></header>'+captures.map(item=>'<figure><figcaption>'+escape(item.caption)+'</figcaption><img src="'+escape(item.file)+'" alt="'+escape(item.caption)+'" loading="lazy"><p>SHA-256：<code>'+item.sha256+'</code></p></figure>').join('')+'<p>细节见同目录manifest.json。此artifact短期保留；PNG为实际截图，页面只负责浏览和说明，没有外部资源、脚本或表单。</p></html>';
  await fs.writeFile(path.join(review,'index.html'),html);
  await fs.rm(destination,{recursive:true,force:true});await fs.mkdir(destination,{recursive:true});
  for(const entry of await fs.readdir(review)){assert.ok(/^(?:0[1-7]-[a-z-]+\.png|manifest\.json|index\.html)$/.test(entry));await fs.copyFile(path.join(review,entry),path.join(destination,entry));}
  succeeded=true;
  publicSummary={status:'PASS',sourceSHA:manifest.sourceSHA,captures:captures.length,facts,privacy:manifest.privacy,resource};
}catch(error){
  process.exitCode=1;
  await fs.rm(destination,{recursive:true,force:true});
  notice('Fictional demonstration failure',{status:'FAIL',stage:currentStage,errorType:error.name,code:typeof error.code==='string'&&/^[A-Z_]+$/.test(error.code)?error.code:null,frames:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,5),httpPosts:h.posts().length});
}finally{
  clearTimeout(watchdog);clearInterval(resourceTimer);
  await h.closeBrowser();await h.closeApp();await removeTestDirectory(h.isolated);
  try{await fs.lstat(h.isolated);throw new Error('Demonstration isolation cleanup did not finish');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(succeeded){
    publicSummary.cleanup={onlyIsolatedTarget:true,targetRemoved:true};
    notice('Fictional demonstration reviewed result',publicSummary);
    console.log('Reviewed fictional demonstration: 7 PNGs, index.html and manifest.json; isolated browser/data removed.');
  }
}
