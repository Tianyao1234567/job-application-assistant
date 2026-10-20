// UI integration with a mocked Chrome API. This is not extension installation acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserOptions,resultsRoot} from './runtime.mjs';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const {server,url}=await startServer();let browser,browserVersion=null;const data={},results=[],sent=[];
try{
  browser=await chromium.launch(browserOptions());browserVersion=browser.version();
  const context=await browser.newContext({viewport:{width:1600,height:1100}}),fixture=await context.newPage();await fixture.goto(url+'/fixtures/generic.html');
  const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await context.exposeBinding('__get',(_,keys)=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]])));
  await context.exposeBinding('__set',(_,object)=>{Object.assign(data,object);});
  await context.exposeBinding('__remove',(_,keys)=>{for(const key of keys)delete data[key];});
  await context.exposeBinding('__exec',async(_,request)=>{
    if(request.files){for(const file of request.files) await fixture.addScriptTag({path:path.join(root,file)});return [{result:null}];}
    sent.push(request.args);
    const result=await fixture.evaluate(({source,args})=>{
      // Only test-runner function text is evaluated, never webpage text or profile values.
      const run=new Function('return ('+source+')')();return run(...args);
    },request);
    return [{result}];
  });
  await context.addInitScript(()=>{
    globalThis.chrome={storage:{local:{get:keys=>__get(keys),set:object=>__set(object),remove:keys=>__remove(keys),setAccessLevel:async()=>{}},onChanged:{addListener:()=>{}}},runtime:{openOptionsPage:async()=>{}},tabs:{update:async()=>{}},scripting:{executeScript:request=>__exec({...request,source:request.func?.toString()})}};
  });
  const options=await context.newPage();await options.goto(url+'/options/index.html');await options.waitForSelector('#editor .card');
  await options.locator('#import').setInputFiles(path.join(root,'profile.example.json'));await options.waitForFunction(()=>document.getElementById('status').textContent.includes('已导入'));
  assert.equal(data.profile.personal.name.zh,'测试同学');const original=structuredClone(data.profile);
  await options.locator('details summary').click();await options.locator('#raw').fill('{"schemaVersion":2}');await options.click('#rawSave');await options.waitForFunction(()=>document.getElementById('status').textContent.includes('旧资料未改变'));assert.deepEqual(data.profile,original);
  results.push({name:'资料管理真实页面导入、错误导入保留旧数据（存储API模拟）',status:'PASS'});
  await options.screenshot({path:path.join(resultsRoot,'options-preview.png')});
  const workspace=await context.newPage();await workspace.goto(url+'/workspace/index.html?tab=7');await workspace.waitForSelector('#rows tr');
  assert.equal(await workspace.locator('#fill').isDisabled(),true);
  const protectedRows=workspace.locator('#rows tr').filter({hasText:'敏感问题或声明'});assert.ok(await protectedRows.count()>=12);
  assert.equal(await protectedRows.first().locator('select').isDisabled(),true);
  const school1=workspace.locator('#rows tr').filter({hasText:'本科教育经历'}).filter({has:workspace.locator('strong', {hasText:'学校名称'})});
  assert.equal(await school1.locator('input[type=checkbox]').first().isChecked(),false);
  assert.equal(await school1.locator('select').inputValue(),'education.edu-bachelor.school');
  await workspace.screenshot({path:path.join(resultsRoot,'workspace-preview.png')});
  await workspace.locator('#ack').check();assert.equal(await workspace.locator('#fill').isEnabled(),true);await workspace.click('#fill');await workspace.waitForFunction(()=>document.getElementById('status').textContent.includes('姓名：已填'));
  assert.equal(await fixture.inputValue('#name'),'测试同学');assert.equal(await fixture.inputValue('#school1'),'');
  const payload=sent.find(args=>args?.[0]==='fill')?.[1];assert.ok(payload);assert.ok(!('profile'in payload));assert.ok(payload.approvals.every(a=>Object.keys(a).sort().join(',')==='overwrite,signature,token,value'));
  assert.equal(await fixture.isChecked('#agreement'),false);assert.deepEqual(await fixture.evaluate(()=>fixtureCounters),{submit:0,enter:0});
  results.push({name:'实际工作台确认流程、低置信不勾选、敏感映射禁用、只传批准字段子集（scripting API模拟）',status:'PASS'});
  await workspace.click('#saveMapping');await workspace.waitForFunction(()=>document.getElementById('status').textContent.includes('映射已保存'));await workspace.click('#rescan');await workspace.waitForFunction(()=>document.getElementById('status').textContent.startsWith('扫描'));
  assert.equal(await workspace.locator('#rows input[type=checkbox]:checked').count(),0);
  assert.deepEqual(errors,[]);results.push({name:'保存映射复扫不自动确认；页面无脚本错误（Chrome API模拟）',status:'PASS'});
  console.log(JSON.stringify(results,null,2));
}catch(error){results.push({status:'FAIL',error:error.message});throw error;}
finally{await browser?.close();server.close();await fs.writeFile(path.join(resultsRoot,'legacy-ui.json'),JSON.stringify({environment:{platform:process.platform,arch:process.arch,node:process.version,browserVersion},scope:'Actual Chromium DOM and extension page JavaScript; Chrome extension APIs mocked',results},null,2));}
