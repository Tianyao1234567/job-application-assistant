import fs from 'node:fs/promises';
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
