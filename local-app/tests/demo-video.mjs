// Explicit live recording: actual active Chromium viewport, one encoder, no cuts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createAcceptance,BASE,FIXTURE,delay,until} from './acceptance-runtime.mjs';
import {projectRoot,evidenceRoot,removeTestDirectory} from '../../autofill-extension/tests/runtime.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||process.env.CLOUD_DEMO_CAPTURE!=='reviewed-fictional-video')throw new Error('EXPLICIT_HOSTED_VIDEO_REQUIRED');
const h=await createAcceptance('continuous-video');
const output=path.join(evidenceRoot,'demo-video-reviewed'),review=path.join(h.isolated,'review'),video=path.join(review,'continuous-fictional.webm');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=createRequire(new URL('../../autofill-extension/package.json',import.meta.url));
const core=path.dirname(require.resolve('playwright-core/package.json'));
const revision=JSON.parse(await fs.readFile(path.join(core,'browsers.json'),'utf8')).browsers.find(item=>item.name==='ffmpeg').revision;
const imageEncoder=path.join('/ms-playwright','ffmpeg-'+revision,'ffmpeg-linux'),encoderDir=path.join(projectRoot,'.runtime','browsers','ffmpeg-'+revision),encoderPath=path.join(encoderDir,'ffmpeg-linux');
await fs.mkdir(encoderDir,{recursive:true});await fs.copyFile(imageEncoder,encoderPath);await fs.chmod(encoderPath,0o755);
const encoderDigest=hash(await fs.readFile(imageEncoder));assert.equal(hash(await fs.readFile(encoderPath)),encoderDigest);
await fs.mkdir(review,{recursive:true});
const WIDTH=1280,HEIGHT=900,FPS=5,privateValues=new Set(),stages=[],sources=new Set();
let encoder,encoderExit,recording,recordFailure,stopping=false,started=0,frameCount=0,captured=0,duplicates=0,pixelChecks=0,stage='setup',watchdog,finished=false;
const manifest={status:'RUNNING',sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,generatedAt:new Date().toISOString(),scope:'Continuous live capture of the actual active page in one isolated extension browser; fictional local recruiting site only.',recording:{fps:FPS,width:WIDTH,height:HEIGHT,encoderStreams:1,edited:false,waitCompression:false,source:'Actual Chrome active tab sampled live; repeated last reviewed frame preserves wall time if capture is late.'},encoder:{playwright:'1.58.2',revision,officialImage:process.env.CLOUD_PLAYWRIGHT_IMAGE,copiedBytesVerified:true,sha256:encoderDigest},stages};
function notice(title,value){const text=JSON.stringify(value);assert.ok(Buffer.byteLength(text)<=3750);for(const marker of privateValues)assert.ok(!text.includes(marker));console.log('::'+(value.status==='FAIL'?'error':'notice')+' title='+title+'::'+text.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));}
async function step(name){stage=name;stages.push({name,seconds:Math.round((Date.now()-started)/100)/10});}
async function front(page){await page.bringToFront();}
async function show(view){await front(h.dashboard);await h.dashboard.locator(`nav [data-view="${view}"]`).click();await delay(500);}
async function protect(page){
  return page.evaluate(({markers,width,height,label})=>{
    const uuid=/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i;
    globalThis.__videoMarkers=markers;
    const tag=()=>{
      const privateText=value=>uuid.test(value)||globalThis.__videoMarkers.some(marker=>value.includes(marker));
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let text;
      while((text=walker.nextNode()))if(privateText(text.textContent))text.parentElement.setAttribute('data-video-private','');
      for(const node of document.querySelectorAll('input,textarea,select'))if(privateText(node.value)||node.matches('[name^="personal."],input[type=password],input[autocomplete=one-time-code]'))node.setAttribute('data-video-private','');
      for(const node of document.querySelectorAll('.meta-label'))if(['原始岗位页面','当前执行页面','任务标识','去重依据','站点回执'].includes(node.textContent.trim()))node.parentElement.querySelector('.meta-value')?.setAttribute('data-video-private','');
      for(const node of document.querySelectorAll('[data-video-private]')){
        for(const [key,value] of Object.entries({'background-color':'#cbd5e1',color:'transparent','-webkit-text-fill-color':'transparent','text-shadow':'none','border-radius':'0','box-shadow':'none'}))node.style.setProperty(key,value,'important');
        if(['INPUT','TEXTAREA','SELECT'].includes(node.tagName))continue;
        if(getComputedStyle(node).display==='inline')node.style.setProperty('display','inline-block','important');
        if(getComputedStyle(node).position==='static')node.style.setProperty('position','relative','important');
        for(const child of node.children)if(!child.hasAttribute('data-video-cover'))child.style.setProperty('visibility','hidden','important');
        let cover=[...node.children].find(child=>child.hasAttribute('data-video-cover'));
        if(!cover){cover=document.createElement('span');cover.setAttribute('data-video-cover','');cover.setAttribute('aria-hidden','true');node.append(cover);}
        for(const [key,value] of Object.entries({position:'absolute',inset:'0',display:'block',visibility:'visible','background-color':'#cbd5e1','z-index':'2147483647','pointer-events':'none'}))cover.style.setProperty(key,value,'important');
      }
    };
    globalThis.__videoTag=tag;tag();
    if(!globalThis.__videoObserver){globalThis.__videoObserver=new MutationObserver(()=>globalThis.__videoTag());globalThis.__videoObserver.observe(document.body,{subtree:true,childList:true,characterData:true});}
    let banner=document.querySelector('[data-video-banner]');if(!banner){banner=document.createElement('div');banner.setAttribute('data-video-banner','');document.body.append(banner);}
    banner.textContent=label;
    for(const [key,value] of Object.entries({position:'fixed',top:'0',left:'0',right:'0',height:'34px',background:'#172b3a',color:'white','font-size':'12px','line-height':'34px','text-align':'center','z-index':'2147483647','pointer-events':'none'}))banner.style.setProperty(key,value,'important');
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))if((uuid.test(node.textContent)||markers.some(marker=>node.textContent.includes(marker)))&&node.parentElement.getClientRects().length)assertMasked(node.parentElement);
    function assertMasked(node){if(!node.closest('[data-video-private]')&&getComputedStyle(node).visibility!=='hidden')throw new Error('VIDEO_DOM_PRIVACY');}
    return [...document.querySelectorAll('[data-video-private]')].filter(node=>!node.parentElement.closest('[data-video-private]')).flatMap(node=>{
      if(!node.getClientRects().length)return [];
      const box=node.getBoundingClientRect();let left=Math.max(0,box.left),top=Math.max(36,box.top),right=Math.min(width,box.right),bottom=Math.min(height,box.bottom);
      for(let parent=node.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent),bounds=parent.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(style.overflowX)){left=Math.max(left,bounds.left);right=Math.min(right,bounds.right);}if(/hidden|clip|auto|scroll/.test(style.overflowY)){top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom);}}
      const x=Math.ceil(left)+4,y=Math.ceil(top)+4,w=Math.floor(right)-x-4,h=Math.floor(bottom)-y-4;
      return w>0&&h>0?[{x,y,width:w,height:h}]:[];
    });
  },{markers:[...privateValues],width:WIDTH,height:HEIGHT,label:'虚构站连续实况 · '+manifest.generatedAt.slice(0,10)+' · '+manifest.sourceSHA.slice(0,12)+' · 5fps / 无剪辑 / 等待不压缩'});
}
async function reviewedFrame(){
  const worker=h.context.serviceWorkers()[0];let active;
  if(worker)active=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});return tabs[0]?.url;}).catch(()=>null);
  const page=h.context.pages().find(page=>page.url()===active)||h.dashboard;
  if(page.isClosed())throw new Error('ACTIVE_PAGE_CLOSED');
  if(page.viewportSize()?.width!==WIDTH||page.viewportSize()?.height!==HEIGHT)await page.setViewportSize({width:WIDTH,height:HEIGHT});
  const rectangles=await protect(page),jpeg=await page.screenshot({type:'jpeg',quality:85,scale:'css',animations:'disabled'});
  const check=await page.evaluate(async({base64,rectangles,width,height})=>{
    const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0)),image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
    if(image.width!==width||image.height!==height)throw new Error('VIDEO_FRAME_SIZE');
    const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);image.close();let pixels=0;
    for(const rect of rectangles){const values=context.getImageData(rect.x,rect.y,rect.width,rect.height).data;for(let i=0;i<values.length;i+=4){if(Math.abs(values[i]-203)>18||Math.abs(values[i+1]-213)>18||Math.abs(values[i+2]-225)>18||values[i+3]!==255)throw new Error('VIDEO_OPAQUE_PIXEL');pixels++;}}
    return {rectangles:rectangles.length,pixels};
  },{base64:jpeg.toString('base64'),rectangles,width:WIDTH,height:HEIGHT});
  pixelChecks+=check.pixels;captured++;sources.add(page.url().startsWith(BASE)?'dashboard':page.url().startsWith(FIXTURE)?'fictional-recruiting-page':'extension');return jpeg;
}
async function writeFrame(bytes){if(encoder.exitCode!==null)throw new Error('VIDEO_ENCODER_EXIT');if(!encoder.stdin.write(bytes))await Promise.race([once(encoder.stdin,'drain'),delay(5000).then(()=>{throw new Error('VIDEO_ENCODER_BACKPRESSURE');})]);frameCount++;}
async function record(){let previous;
  while(!stopping){
    const target=started+frameCount*1000/FPS;if(Date.now()<target)await delay(target-Date.now());
    let frame;
    try{frame=await reviewedFrame();}catch(error){if(/Execution context was destroyed|navigation|Target closed/i.test(String(error.message))&&previous){await writeFrame(previous);duplicates++;continue;}throw error;}
    const due=Math.floor((Date.now()-started)*FPS/1000);
    while(previous&&frameCount<due){await writeFrame(previous);duplicates++;}
    await writeFrame(frame);previous=frame;
  }
}
async function demonstrate(){
  await h.start();await h.launch('video');await h.dashboard.setViewportSize({width:WIDTH,height:HEIGHT});
  h.dashboard.once('dialog',dialog=>dialog.accept());await h.dashboard.getByRole('button',{name:'准备虚构演示资料',exact:true}).click();
  const initial=await until('fictional profile prepared',h.state,value=>value.profile.version===1&&value.resume?.version===1);
  await h.api('/settings',{settings:{...initial.settings,dailyLimit:1},sites:initial.sites.map(site=>({...site,enabled:site.id==='local-alpha'}))});
  await (await h.login('alpha','demo')).close();
  const added=await h.action('add',{url:FIXTURE+'/site/alpha/jobs/cpp-001'}),id=added.task.id;
  for(const value of [id,(await h.state()).connection.profileId,await h.dashboard.locator('meta[name="local-key"]').getAttribute('content')]){privateValues.add(value);h.protect(value);}
  await show('overview');
  encoder=spawn(encoderPath,['-loglevel','error','-f','image2pipe','-avioflags','direct','-fpsprobesize','0','-probesize','32','-analyzeduration','0','-r',String(FPS),'-c:v','mjpeg','-i','pipe:0','-y','-an','-r',String(FPS),'-c:v','vp8','-qmin','0','-qmax','50','-crf','8','-deadline','realtime','-speed','8','-b:v','1M','-threads','1','-vf',`pad=${WIDTH}:${HEIGHT}:0:0:gray,crop=${WIDTH}:${HEIGHT}:0:0`,video],{stdio:['pipe','ignore','pipe']});
  let encoderErrors=0;encoder.stderr.on('data',()=>encoderErrors++);encoder.stdin.on('error',()=>{});
  encoderExit=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('exit',code=>code===0?resolve():reject(new Error('VIDEO_ENCODER_FAILED')));});encoderExit.catch(()=>{});
  started=Date.now();recording=record().catch(error=>{recordFailure=error;});await until('first reviewed live frame',async()=>frameCount,count=>count>0,15000);await step('真实管理台开始任务');await delay(4000);
  const held=new Set();
  await h.context.route(BASE+'/api/bridge/authorize',async route=>{
    const operation=h.app.store.command?.op;
    if(['fill','upload'].includes(operation)&&!held.has(operation)){
      held.add(operation);const page=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/apply/cpp-001');
      if(page){await front(page);await page.locator(operation==='fill'?'[name="education.0.school"]':'input[type=file]').scrollIntoViewIfNeeded();await delay(2200);}
    }
    await route.continue();
  });
  manifest.recording.authorizationReviewHolds='First actual fill/upload authorization each waits 2.2 seconds for the visible form; no mutation is simulated and waiting stays in the recording.';
  await h.dashboard.getByRole('button',{name:'开始投递',exact:true}).click();
  await until('original task waits for a missing answer',h.state,value=>value.tasks.find(task=>task.id===id)?.status==='waiting_answer');
  const application=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/apply/cpp-001');assert.ok(application);
  await front(application);await application.locator('[name="education.0.school"]').scrollIntoViewIfNeeded();await step('实际填写教育与经历，缺答前暂停');await delay(7000);
  assert.equal(h.posts().length,0);const pinned=h.app.store.task(id).resumeSnapshot;
  await application.locator('input[type=file]').scrollIntoViewIfNeeded();assert.equal(await application.locator('input[type=file]').evaluate(node=>node.files[0]?.size),pinned.size);await step('真实虚构附件已选择，未提交');await delay(7000);
  await show('issues');await h.dashboard.getByRole('button',{name:'确认答案并继续原任务',exact:true}).waitFor();await step('后台显示缺失问题与用途');await delay(7000);
  const checkbox=h.dashboard.getByRole('checkbox',{name:'保存为本站相同原文、相同限定用途的确认答案',exact:true});assert.equal(await checkbox.isChecked(),false);
  await h.dashboard.getByRole('textbox',{name:'确认答案',exact:true}).fill('这是虚构演示操作者确认的答案：希望参与机器人系统测试与可靠性开发。');await delay(4000);
  await step('操作者确认答案并恢复同一任务');await h.dashboard.getByRole('button',{name:'确认答案并继续原任务',exact:true}).click();
  const submitted=await until('reliable receipt on original task',h.state,value=>value.tasks.find(task=>task.id===id)?.status==='submitted');assert.equal(submitted.tasks.find(task=>task.id===id).title,'C++ 开发工程师');
  const fixture=await h.fixture();assert.equal(h.posts().length,1);assert.equal(fixture.submitRequests.length,1);assert.equal(fixture.receipts.length,1);assert.equal(fixture.receipts[0].sha256,pinned.sha256);assert.equal(hash(await fs.readFile(path.join(h.dataDir,'fixture','uploads',fixture.receipts[0].id+'.bin'))),pinned.sha256);
  const receipt=h.context.pages().find(page=>page.url()===FIXTURE+'/site/alpha/receipt/cpp-001');assert.ok(receipt);await front(receipt);await step('站点实际回执，一次接收');await delay(7000);
  await show('queue');await h.dashboard.getByRole('button',{name:'已核实提交',exact:true}).click();await step('后台同任务显示真实结果');
  while(Date.now()-started<80000){if(recordFailure)throw recordFailure;await delay(500);}
  stopping=true;await recording;if(recordFailure)throw recordFailure;encoder.stdin.end();await Promise.race([encoderExit,delay(15000).then(()=>{throw new Error('VIDEO_ENCODER_CLOSE_TIMEOUT');})]);
  assert.equal(encoderErrors,0);assert.ok(captured>=100);assert.ok(pixelChecks>0);assert.ok(frameCount/FPS>=60&&frameCount/FPS<=180);assert.ok(Math.abs(frameCount/FPS-(Date.now()-started)/1000)<3);
  manifest.status='PASS';manifest.recording={...manifest.recording,frames:frameCount,capturedReviewedFrames:captured,repeatedReviewedFrames:duplicates,durationSeconds:frameCount/FPS,wallSeconds:Math.round((Date.now()-started)/100)/10,sources:[...sources]};
  manifest.facts={actualExtension:true,actualMultiEntryFill:true,actualFileUpload:true,originalMissingQuestionPaused:true,answerConfirmedInRealDashboard:true,answerMemoryDefaultUnchecked:true,sameTask:true,sourceTitle:'C++ 开发工程师',sourceCompany:'虚构甲公司',sourceCity:'上海',observedHttpApplicationPosts:1,actualMultipartRequests:1,reliableReceipts:1,receivedFileBytesVerified:true};
  manifest.privacy={everyEncodedSourceFrameDOMReviewed:true,everyEncodedSourceFrameOpaquePixelsReviewed:true,reviewedPixels:pixelChecks,JPEGPixelTolerance:18,maskBeforeEncoding:true,manualVisualReview:'not performed by this script',onlyFictionalData:true,keysSessionIdentifiersAndUUIDsMasked:true,noPrivateBrowserDirectory:true};
}
try{
  await Promise.race([demonstrate(),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(new Error('VIDEO_GROUP_TIMEOUT')),230000);})]);
  await h.verifyPrivateEvidence();await h.closeBrowser();await h.closeApp();
  const bytes=await fs.readFile(video);assert.ok(bytes.length>10000&&bytes.length<80*1024*1024);for(const value of privateValues)assert.ok(!bytes.includes(Buffer.from(value)));
  manifest.file={name:'continuous-fictional.webm',bytes:bytes.length,sha256:hash(bytes)};manifest.cleanup={onlyIsolatedTarget:true};
  await fs.writeFile(path.join(review,'manifest.json'),JSON.stringify(manifest,null,2));
  await fs.writeFile(path.join(review,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; media-src \'self\'; style-src \'unsafe-inline\'"><title>虚构站真实连续演示</title><style>body{font:16px/1.7 system-ui;max-width:1280px;margin:30px auto}video{width:100%}</style><h1>虚构站真实连续演示</h1><p>单个真实执行浏览器当前活动页连续实况，5fps、单段编码、无剪辑、等待未压缩。没有真实企业投递。</p><p>来源 '+manifest.sourceSHA+' · '+manifest.generatedAt+'</p><video controls preload="metadata" src="continuous-fictional.webm"></video><p>自动逐帧隐私检查；人工视觉验收待PM。详情见manifest.json。</p></html>');
  await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});for(const name of ['continuous-fictional.webm','manifest.json','index.html'])await fs.copyFile(path.join(review,name),path.join(output,name));finished=true;
}catch(error){process.exitCode=1;stopping=true;await recording?.catch(()=>{});encoder?.stdin.destroy();if(encoder&&encoder.exitCode===null)encoder.kill();await fs.rm(output,{recursive:true,force:true});notice('Continuous fictional recording failure',{status:'FAIL',sourceSHA:manifest.sourceSHA,stage,type:error.name,frames:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4),captured,encodedFrames:frameCount,httpPosts:h.posts().length});}
finally{clearTimeout(watchdog);stopping=true;await h.closeBrowser();await h.closeApp();await removeTestDirectory(h.isolated);if(finished)notice('Continuous fictional recording result',{status:'PASS',sourceSHA:manifest.sourceSHA,recording:manifest.recording,facts:manifest.facts,privacy:manifest.privacy,file:manifest.file,cleanup:true});}
