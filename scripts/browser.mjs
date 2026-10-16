import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const runtime=path.join(root,'.runtime');
for(const name of ['tmp','downloads','browsers','browser/production']) await fs.mkdir(path.join(runtime,name),{recursive:true});
process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(runtime,'tmp');
process.env.npm_config_cache=path.join(runtime,'cache');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(runtime,'browsers');
const require=createRequire(path.join(root,'autofill-extension','package.json'));
const {chromium}=require('playwright');
const extension=path.join(root,'autofill-extension');
const stopFile=path.join(runtime,'browser.stop');
await fs.rm(stopFile,{force:true});
const context=await chromium.launchPersistentContext(path.join(runtime,'browser','production'),{
  headless:false,channel:'chromium',downloadsPath:path.join(runtime,'downloads'),
  artifactsDir:path.join(runtime,'tmp'),env:{...process.env},
  args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--no-first-run','--disable-breakpad','--disable-crash-reporter'],
});
context.on('page',page=>page.on('download',download=>download.saveAs(path.join(runtime,'downloads',path.basename(download.suggestedFilename()))).catch(()=>{})));
let closed=false;
context.once('close',()=>{closed=true});
const page=context.pages()[0] || await context.newPage();
await page.goto('http://127.0.0.1:17321/?autoconnect=1');
// Keep the launcher alive so stop can close the exact dedicated browser gracefully.
while(!closed){
  try { await fs.access(stopFile); await context.close(); break; } catch {}
  await new Promise(resolve=>setTimeout(resolve,500));
}
await fs.rm(stopFile,{force:true});
