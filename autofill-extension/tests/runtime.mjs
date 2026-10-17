import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const projectRoot=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
export const runtimeRoot=path.join(projectRoot,'.runtime');
export const testsRoot=path.join(runtimeRoot,'tests');
export const evidenceRoot=path.join(testsRoot,'evidence');
export const resultsRoot=path.join(projectRoot,'test-results-001');
// Assign before the first await, before Playwright evaluates its browser registry.
process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(runtimeRoot,'tmp');
process.env.npm_config_cache=path.join(runtimeRoot,'cache');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(runtimeRoot,'browsers');
export function insideRoot(candidate){
  const resolved=path.resolve(candidate),relative=path.relative(projectRoot,resolved);
  if(relative.startsWith('..') || path.isAbsolute(relative) || !relative) throw new Error('Unsafe project runtime path');
  return resolved;
}
for(const name of ['tmp','cache','browsers','downloads','tests','tests/evidence']) await fs.mkdir(insideRoot(path.join(runtimeRoot,name)),{recursive:true});
await fs.mkdir(resultsRoot,{recursive:true});
export async function testDirectory(name){
  return await fs.mkdtemp(insideRoot(path.join(testsRoot,name+'-')));
}
export async function removeTestDirectory(directory){
  const resolved=insideRoot(directory),relative=path.relative(testsRoot,resolved);
  if(!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Only isolated test directories may be removed');
  await fs.rm(resolved,{recursive:true,force:true});
}
export function browserOptions(extra={}){
  return {headless:true,channel:'chromium',downloadsPath:path.join(runtimeRoot,'downloads'),artifactsDir:path.join(testsRoot,'artifacts'),
    env:{...process.env},...(process.env.CHROME_EXECUTABLE?{executablePath:insideRoot(process.env.CHROME_EXECUTABLE)}:{}),...extra};
}

const image='mcr.microsoft.com/playwright:v1.58.2-noble@sha256:65cefd09a5e943921ecd3a6e5414c603db2eb161e9eb48f2e2ccc63486dc7dc0';
const within=(parent,candidate)=>{const relative=path.relative(parent,candidate);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
async function fileHash(file) {
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
async function browserManifest(directory,{allowContainedLinks=false}={}) {
  const root=await fs.realpath(directory),files=[],directories=new Set();
  async function visit(absolute,relative='') {
    const entry=await fs.lstat(absolute),real=await fs.realpath(absolute);
    if(!within(root,real)||entry.isSymbolicLink()&&!allowContainedLinks)throw new Error('Browser copy contains an escaping or unexpected symbolic link');
    const followed=entry.isSymbolicLink()?await fs.stat(absolute):entry;
    if(followed.isDirectory()) {
      if(directories.has(real))throw new Error('Browser copy contains repeated linked directories');
      directories.add(real);
      for(const child of (await fs.readdir(absolute)).sort())await visit(path.join(absolute,child),path.join(relative,child));
    }else if(followed.isFile())files.push({path:relative,size:followed.size,executable:!!(followed.mode&0o111),sha256:await fileHash(absolute)});
    else throw new Error('Browser copy contains an unsupported filesystem entry');
  }
  await visit(directory);return files;
}
export async function prepareContainerChromium() {
  if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||process.arch!=='x64'||process.env.CLOUD_PLAYWRIGHT_IMAGE!==image)throw new Error('Image browser preparation requires the pinned hosted Linux x64 container job');
  const packageRoot=path.join(projectRoot,'autofill-extension'),metadata=async file=>JSON.parse(await fs.readFile(path.join(packageRoot,file),'utf8'));
  const lock=await metadata('package-lock.json'),playwright=await metadata('node_modules/playwright/package.json'),core=await metadata('node_modules/playwright-core/package.json');
  if([lock.packages['node_modules/playwright']?.version,lock.packages['node_modules/playwright-core']?.version,playwright.version,core.version].some(version=>version!=='1.58.2'))throw new Error('Playwright package, lockfile, and official image versions must all be 1.58.2');
  const registry=await metadata('node_modules/playwright-core/browsers.json'),chromium=registry.browsers.find(browser=>browser.name==='chromium');
  if(!chromium||!/^\d+$/.test(chromium.revision))throw new Error('Locked Playwright Chromium manifest is invalid');
  const source=path.join('/ms-playwright','chromium-'+chromium.revision),target=insideRoot(path.join(runtimeRoot,'browsers','chromium-'+chromium.revision));
  if(await fs.realpath(source)!==source)throw new Error('Official image browser root must not be a symbolic link');
  const realProject=await fs.realpath(projectRoot),realTargetParent=await fs.realpath(path.dirname(target));
  if(!within(realProject,realTargetParent))throw new Error('Checkout browser directory escapes the workspace');
  const trusted=await browserManifest(source,{allowContainedLinks:true});
  if(!trusted.some(file=>file.path==='chrome-linux64/chrome'&&file.executable))throw new Error('Official image Chromium executable is missing');
  try {await fs.lstat(target);}catch(error){if(error.code!=='ENOENT')throw error;await fs.cp(source,target,{recursive:true,dereference:true,errorOnExist:true,force:false,preserveTimestamps:true});}
  if(await fs.realpath(target)!==target)throw new Error('Copied browser root must not be a symbolic link');
  const copied=await browserManifest(target);
  if(JSON.stringify(trusted)!==JSON.stringify(copied))throw new Error('Image-to-workspace browser copy failed byte and executable-permission verification');
  const proof={image,playwright:playwright.version,chromium:chromium.browserVersion,revision:chromium.revision,files:copied.length,bytes:copied.reduce((sum,file)=>sum+file.size,0),manifestSha256:createHash('sha256').update(JSON.stringify(copied)).digest('hex'),copiedAndVerified:true};
  await fs.writeFile(path.join(evidenceRoot,'container-browser.json'),JSON.stringify(proof,null,2));
  console.log('Verified official image Chromium '+proof.chromium+': '+proof.files+' files copied inside .runtime; no browser download or OS package installation.');
  return proof;
}
