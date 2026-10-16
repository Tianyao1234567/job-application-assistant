import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const runtime=path.join(root,'.runtime');
process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(runtime,'tmp');
process.env.npm_config_cache=path.join(runtime,'cache');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(runtime,'browsers');
await fs.mkdir(process.env.TEMP,{recursive:true});
function run(args,timeout=120_000){
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:process.env,timeout});
  if(result.error) throw result.error;
  if(result.status!==0) process.exit(result.status || 1);
}
if(process.argv[2]==='browser'){
  if(process.env.GITHUB_ACTIONS!=='true' || process.platform!=='linux') throw new Error('Browser regression is limited to the Linux hosted Actions job.');
  const selected={generic:'autofill-extension/tests/browser.mjs','ui-mocked':'autofill-extension/tests/ui.mjs',extension:'autofill-extension/tests/extension.mjs',workflow:'local-app/tests/workflow-browser.mjs'}[process.env.CLOUD_BROWSER_CHECK];
  if(!selected) throw new Error('Choose one supported browser regression.');
  // One child and one browser at a time. Only workflow covers the integrated local journey.
  run([selected],process.env.CLOUD_BROWSER_CHECK==='workflow'?240_000:120_000);
}else{
  const excluded=new Set(['node_modules','.runtime','.git','test-results','test-results-001','playwright-report','coverage']);
  let checked=0;
  async function inspect(directory){
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      if(excluded.has(entry.name)) continue;
      const absolute=path.join(directory,entry.name);
      if(entry.isSymbolicLink()) throw new Error('Unexpected source symlink: '+path.relative(root,absolute));
      if(entry.isDirectory()) {await inspect(absolute);continue;}
      if(!/\.(m?js|json)$/.test(entry.name)) continue;
      const source=await fs.readFile(absolute);
      if(source.includes(0)) throw new Error('NUL bytes in source: '+path.relative(root,absolute));
      if(entry.name.endsWith('.json')) JSON.parse(source.toString('utf8'));
      else run(['--check',absolute]);
      checked++;
    }
  }
  for(const directory of ['autofill-extension','local-app','scripts']) await inspect(path.join(root,directory));
  console.log('Syntax/JSON files checked: '+checked+'. No browser or application server started.');
}
