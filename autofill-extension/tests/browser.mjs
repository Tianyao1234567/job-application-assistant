import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserOptions,resultsRoot} from './runtime.mjs';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {flattenProfile} from '../shared/schema.js';
import {matchFields} from '../shared/match.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const profile=JSON.parse(await fs.readFile(path.join(root,'profile.example.json'),'utf8'));
const entries=flattenProfile(profile),results=[];
const {server,url}=await startServer();let browser,browserVersion=null;
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
async function inject(page){for(const file of ['guard.js','scan.js','fill.js']) await page.addScriptTag({path:path.join(root,'content',file)});}
async function scan(page){return await page.evaluate(()=>JobFill.scan());}
async function fill(page,s,values){return await page.evaluate(payload=>JobFill.apply(payload),{site:s.site,layout:s.layout,approvals:values});}
function approvals(s,ids){return matchFields(s,entries).filter(m=>ids ? ids.includes(JSON.parse(m.field.signature.slice(0,m.field.signature.lastIndexOf(':')))[4]) : m.key && !m.field.blocked).map(m=>({token:m.field.token,signature:m.field.signature,value:entries.find(entry=>entry.key===m.key)?.value || 'TEST',overwrite:false}));}
try{
  browser=await chromium.launch(browserOptions());browserVersion=browser.version();const page=await browser.newPage();await page.goto(url+'/fixtures/generic.html');await inject(page);
  const requests=[];page.on('request',request=>requests.push(request.url()));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await check('真实 DOM 中不返回登录/密码/验证码内容，忽略隐藏与不可编辑字段',async()=>{
    const s=await scan(page),str=JSON.stringify(s);for(const marker of ['do-not-read@example.invalid','never-read-test','NEVER-READ','loginEmail','password','otp','honeypot']) assert.ok(!str.includes(marker),marker);
    assert.equal(s.secretCount,3);assert.ok(s.excluded>=4);assert.equal(s.frames,1);
  });
  await check('中文文本、textarea、原生 select、两条教育和年月正确；已有值保留；日精度不猜',async()=>{
    const s=await scan(page),response=await fill(page,s,approvals(s));assert.ok(response.results.some(r=>r.status==='已填'));
    assert.equal(await page.inputValue('#name'),'测试同学');assert.equal(await page.inputValue('#email'),'student@example.invalid');assert.equal(await page.inputValue('#phone'),'10000000000');
    assert.equal(await page.inputValue('#current'),'保留的用户内容');assert.equal(await page.inputValue('#desired'),'HZ');assert.equal(await page.inputValue('#school1'),'虚构工科大学');assert.equal(await page.inputValue('#school2'),'虚构研究大学');assert.equal(await page.inputValue('#degree1'),'学士');assert.equal(await page.inputValue('#degree2'),'硕士');assert.equal(await page.inputValue('#start1'),'2021-09');assert.equal(await page.inputValue('#end2'),'');assert.ok((await page.inputValue('#description')).includes('虚构传感器'));
  });
  await check('敏感字段手动映射尝试被拒绝、协议/文件/提交/回车保持不变',async()=>{
    const s=await scan(page),blocked=s.fields.filter(f=>f.blocked);
    const response=await fill(page,s,blocked.map(f=>({token:f.token,signature:f.signature,value:'TEST',overwrite:true})));
    assert.ok(response.results.every(r=>r.status==='跳过'));
    for(const id of ['salary','gender','visa','work','criminal','disability','ethnic','veteran','move','notice','legal','conflict']) assert.equal(await page.inputValue('#'+id),'');
    assert.equal(await page.isChecked('#agreement'),false);assert.equal(await page.inputValue('#resume'),'');assert.deepEqual(await page.evaluate(()=>fixtureCounters),{submit:0,enter:0});
  });
  await check('复扫填写幂等，用户修改后撤销不覆盖；其余原值恢复',async()=>{
    const s=await scan(page);assert.ok((await fill(page,s,approvals(s))).results.every(r=>r.status==='跳过'));
    await page.fill('#name','用户手动修改');const response=await page.evaluate(()=>JobFill.undo());assert.ok(response.results.some(r=>r.status==='已撤销'));
    assert.equal(await page.inputValue('#name'),'用户手动修改');assert.equal(await page.inputValue('#email'),'');assert.equal(await page.inputValue('#current'),'保留的用户内容');
  });
  await check('明确覆盖确认可写入并撤销恢复已有内容',async()=>{
    const s=await scan(page),a=approvals(s,['current']);assert.equal(a.length,1);a[0].overwrite=true;await fill(page,s,a);assert.equal(await page.inputValue('#current'),'测试城');await page.evaluate(()=>JobFill.undo());assert.equal(await page.inputValue('#current'),'保留的用户内容');
  });
  await check('动态新增后旧扫描拒绝，新扫描可以手动映射；不自行点击新增',async()=>{
    const s=await scan(page);assert.equal(await page.locator('#dynamicProject').count(),0);await page.click('#dynamic');const r=await fill(page,s,approvals(s));assert.equal(r.stale,true);
    const newer=await scan(page),f=newer.fields.find(f=>f.hints.includes('dynamicProject'));assert.ok(f);await fill(page,newer,[{token:f.token,signature:f.signature,value:'用户确认的第二项目',overwrite:false}]);assert.equal(await page.inputValue('#dynamicProject'),'用户确认的第二项目');
  });
  await check('扫描后修改字段文字为敏感问题，旧确认不得继续写入',async()=>{
    const s=await scan(page),f=s.fields.find(f=>f.label==='姓名');await page.locator('label[for="name"]').evaluate(node=>node.textContent='工作许可 Work authorization');const r=await fill(page,s,[{token:f.token,signature:f.signature,value:'do not write',overwrite:true}]);assert.equal(r.stale,true);assert.equal(await page.inputValue('#name'),'用户手动修改');
  });
  await check('英文匹配、React 18.3.1 与 Vue 3.5.13 状态真正同步，观察期不回滚',async()=>{
    assert.deepEqual(requests,[],'ordinary field writes must not make network requests');
    await page.goto(url+'/fixtures/controlled.html');await page.waitForSelector('#reactName');await inject(page);
    requests.length=0;
    const s=await scan(page),targets=s.fields.filter(f=>f.label==='Full name');assert.equal(targets.length,2);
    for(const f of targets) await fill(page,await scan(page),[{token:f.token,signature:f.signature,value:'Fictional Student',overwrite:false}]);
    assert.equal(await page.inputValue('#reactName'),'Fictional Student');assert.equal(await page.textContent('#reactState'),'Fictional Student');assert.equal(await page.inputValue('#vueName'),'Fictional Student');assert.equal(await page.textContent('#vueState'),'Fictional Student');
  });
  await check('控件回滚与可见校验提示报告失败',async()=>{
    const s=await scan(page),rollback=s.fields.find(f=>f.hints.includes('rollback')),invalid=s.fields.find(f=>f.hints.includes('invalid'));
    const response=await fill(page,s,[{token:rollback.token,signature:rollback.signature,value:'10000000000'},{token:invalid.token,signature:invalid.signature,value:'test@example.invalid'}]);assert.deepEqual(response.results.map(r=>r.status),['校验失败','校验失败']);
  });
  await check('扫描/填写/撤销不发网络请求，页面无脚本错误',async()=>{
    const s=await scan(page);await fill(page,s,[]);await page.evaluate(()=>JobFill.undo());assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  });
}catch(error){results.push({status:'FAIL',error:error.message});throw error;}
finally{await browser?.close();server.close();await fs.writeFile(path.join(resultsRoot,'legacy-browser.json'),JSON.stringify({environment:{platform:process.platform,arch:process.arch,node:process.version,browserVersion},scope:'Actual DOM with content scripts injected; not production extension acceptance',results},null,2));}
