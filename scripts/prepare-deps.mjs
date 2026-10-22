// Update-time dependency preparation only: never deletes data/node_modules and
// never invokes Playwright's browser download. Compatible packages are reused.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export function dependencyStatus(projectRoot){
 const runtime=path.join(projectRoot,'runtime-deps'),require=createRequire(path.join(runtime,'package.json'));
 const expected=JSON.parse(fs.readFileSync(path.join(runtime,'package.json'),'utf8')).dependencies;
 const versions={};for(const name of Object.keys(expected)){try{versions[name]=JSON.parse(fs.readFileSync(path.join(runtime,'node_modules',name,'package.json'),'utf8')).version;}catch{versions[name]=null;}}
 let browser=null;try{if(versions.playwright===expected.playwright){const executable=require('playwright').chromium.executablePath();if(fs.existsSync(executable))browser=executable;}}catch{}
 return {expected,versions,missing:Object.keys(expected).filter(name=>versions[name]!==expected[name]),browser};
}
export function prepareDependencies({projectRoot=root,run=spawnSync}={}){
 const local=path.join(projectRoot,'.runtime');for(const dir of ['cache','browsers','tmp'])fs.mkdirSync(path.join(local,dir),{recursive:true});
 // Set these before loading Playwright, whose browser registry reads its path.
 process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(local,'browsers');
 const before=dependencyStatus(projectRoot);
 if(!before.missing.length)return {installed:[],reusedBrowser:!!before.browser,browserDownload:false};
 const env={...process.env,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',PLAYWRIGHT_BROWSERS_PATH:path.join(local,'browsers'),npm_config_cache:path.join(local,'cache'),TMPDIR:path.join(local,'tmp'),TEMP:path.join(local,'tmp'),TMP:path.join(local,'tmp')};
 const npm=process.platform==='win32'?process.execPath:'npm';
 const npmCLI=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
 if(process.platform==='win32'&&!fs.existsSync(npmCLI))throw new Error('未找到Node.js自带的npm，请保留原目录并检查Node安装。');
 const args=['install','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(local,'cache')];
 const result=run(npm,process.platform==='win32'?[npmCLI,...args]:args,{cwd:path.join(projectRoot,'runtime-deps'),env,stdio:'inherit',shell:false});
 if(result.error||result.status!==0)throw new Error('必要运行依赖未补齐；原资料、浏览器及任务保留。请检查网络后重试“补充运行依赖”，无需重装浏览器。');
 const after=dependencyStatus(projectRoot);if(after.missing.length)throw new Error('必要运行依赖版本仍不完整，未启动申请；请保留现有目录。');
 return {installed:before.missing,reusedBrowser:!!before.browser&&after.browser===before.browser,browserDownload:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=prepareDependencies();console.log('DEPENDENCIES_READY: '+(result.installed.length?'已补齐 '+result.installed.join('、'):'已复用兼容依赖')+'；未下载或清理浏览器。');if(!dependencyStatus(root).browser)console.log('尚未检测到已下载的执行浏览器；仅查看后台/导入PDF可继续。首次安装浏览器才使用原安装入口。');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
