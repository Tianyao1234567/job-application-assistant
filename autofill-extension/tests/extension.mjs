import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserOptions,testDirectory,removeTestDirectory,resultsRoot} from './runtime.mjs';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('..',import.meta.url)),userDir=await testDirectory('legacy-extension');
let context,browserVersion=null;const results=[];
async function launch(){return await chromium.launchPersistentContext(userDir,browserOptions({channel:'chromium',args:['--disable-extensions-except='+root,'--load-extension='+root]}));}
try{
  context=await launch();let worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  const page=await context.newPage(),errors=[];const cdp=await context.newCDPSession(page);browserVersion=(await cdp.send('Browser.getVersion')).product;await cdp.detach();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`chrome-extension://${id}/options/index.html`);await page.waitForSelector('#editor .card');
  results.push({name:'原始 Manifest V3 在指定 Chromium 成功加载，选项页无 CSP/脚本错误',status:'PASS'});
  await page.locator('#import').setInputFiles(path.join(root,'profile.example.json'));await page.waitForFunction(()=>document.getElementById('status').textContent.includes('已导入'));
  const before=await page.evaluate(async()=> (await chrome.storage.local.get('profile')).profile);
  assert.equal(before.personal.name.zh,'测试同学');
  await page.locator('details summary').click();await page.locator('#raw').fill('{"schemaVersion":999}');await page.locator('#rawSave').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('旧资料未改变'));
  assert.deepEqual(await page.evaluate(async()=> (await chrome.storage.local.get('profile')).profile),before);
  results.push({name:'真实 chrome.storage.local 导入和错误导入不破坏旧资料',status:'PASS'});
  const exported=new Promise(resolve=>page.once('download',resolve));await page.click('#export');const download=await exported;assert.deepEqual(JSON.parse(await fs.readFile(await download.path(),'utf8')),before);
  results.push({name:'实际 JSON 文件导出与导入无损往返',status:'PASS'});
  assert.deepEqual(errors,[]);
  await context.close();context=await launch();worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');const reopened=await context.newPage();await reopened.goto(`chrome-extension://${new URL(worker.url()).host}/options/index.html`);await reopened.waitForSelector('#editor .card');assert.deepEqual(await reopened.evaluate(async()=> (await chrome.storage.local.get('profile')).profile),before);
  results.push({name:'关闭并重启独立测试浏览器后资料保留',status:'PASS'});
  console.log(JSON.stringify(results,null,2));
}catch(error){results.push({status:'FAIL',error:error.message});throw error;}
finally{await context?.close();await removeTestDirectory(userDir);await fs.writeFile(path.join(resultsRoot,'legacy-extension.json'),JSON.stringify({environment:{platform:process.platform,arch:process.arch,node:process.version,browserVersion,executable:process.env.CHROME_EXECUTABLE || 'Playwright Chromium'},limitation:'Windows Chrome toolbar activeTab workflow remains manual acceptance.',results},null,2));}
