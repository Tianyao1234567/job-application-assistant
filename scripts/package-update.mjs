// Build a single self-contained incremental Windows updater from committed blobs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import vm from 'node:vm';
import {buildCandidate} from './package-candidate.mjs';
import {validateBundle} from './update-install.mjs';
export const UPDATE_BASELINES=['3856a49a78852c4729a6be4d64f01f19acdcd1c3','38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac'];
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function git(directory,args){const r=spawnSync('git',args,{cwd:directory,maxBuffer:8*1024*1024});if(r.status!==0)throw new Error('UPDATE_BUILD_GIT');return r.stdout;}
export async function baselineManifest(projectRoot,source){
 const script=git(projectRoot,['show',source+':scripts/package-candidate.mjs']).toString('utf8');
 const list=script.match(/export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\)/)?.[1];if(!list)throw new Error('UPDATE_BASELINE_MANIFEST');
 const files=vm.runInNewContext(list,{},{timeout:500}),optional=['DEV_REPORT_004.md','DEV_REPORT_005.md','REAL_SITE_PREPARATION.md'];
 const tracked=new Set(git(projectRoot,['ls-tree','-r','--name-only',source]).toString('utf8').split('\n'));
 for(const file of optional)if(tracked.has(file))files.push(file);
 return {source,version:script.match(/export const VERSION='([^']+)'/)[1],files:files.map(file=>{const bytes=git(projectRoot,['show',source+':'+file]);return {path:file,bytes:bytes.length,sha256:sha(bytes)};})};
}
export function renderUpdater(bundle,engine){
 validateBundle(bundle);
 const packed=gzipSync(Buffer.from(JSON.stringify(bundle)),{level:9});
 const code="import {gunzipSync} from 'node:zlib';\nglobalThis.__JOB_UPDATE_BUNDLE=JSON.parse(gunzipSync(Buffer.from('"+packed.toString('base64')+"','base64')).toString('utf8'));\n"+engine;
 const bytes=gzipSync(Buffer.from(code),{level:9}),checksum=sha(bytes);
 const ps=`$ErrorActionPreference='Stop'
try {
  $raw=[IO.File]::ReadAllText($env:JOB_UPDATE_FILE)
  $data=[regex]::Match($raw,'(?m)^# JA_BODY ([A-Za-z0-9+/=]+)\\r?$').Groups[1].Value
  $expected=[regex]::Match($raw,'(?m)^# JA_SHA256 ([a-f0-9]{64})\\r?$').Groups[1].Value
  $bytes=[Convert]::FromBase64String($data)
  $hash=[Security.Cryptography.SHA256]::Create()
  $actual=([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()
  if($actual -ne $expected -or $bytes.Length -gt 2097152){throw 'UPDATE_PACKAGE_HASH'}
  $jobCompressedStream=[IO.MemoryStream]::new($bytes)
  $jobGzipStream=[IO.Compression.GZipStream]::new($jobCompressedStream,[IO.Compression.CompressionMode]::Decompress)
  $jobExpandedStream=[IO.MemoryStream]::new();$jobGzipStream.CopyTo($jobExpandedStream);$jobGzipStream.Dispose()
  if($jobExpandedStream.Length -gt 4194304){throw 'UPDATE_PACKAGE_BUDGET'}
  $node=Get-Command node.exe -ErrorAction Stop
  $version=& $node.Source --version
  if($version -notmatch '^v(2[4-9]|[3-9][0-9])\\.'){throw 'UPDATE_NODE_REQUIRED'}
  $env:JOB_UPDATE_ROOT=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($env:JOB_UPDATE_FILE))
  $OutputEncoding=[Text.UTF8Encoding]::new($false)
  [Text.Encoding]::UTF8.GetString($jobExpandedStream.ToArray()) | & $node.Source --input-type=module -
  exit $LASTEXITCODE
} catch {Write-Host 'UPDATE_FAILED: Package, Node.js or target verification failed. Keep the existing folder; no automatic launch.';exit 1}
`;
 const cmd=`@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "JOB_UPDATE_FILE=%~f0"\r\nset "JOB_UPDATE_MODE=%~1"\r\npowershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:JOB_UPDATE_FILE);$m=[regex]::Match($s,'(?ms)^# JA_PS_BEGIN\\r?\\n(.*?)^# JA_PS_END');& ([scriptblock]::Create($m.Groups[1].Value))"\r\nset "jobUpdateExitCode=%errorlevel%"\r\nif not "%JOB_ASSISTANT_NONINTERACTIVE%"=="1" pause\r\nexit /b %jobUpdateExitCode%\r\n# JA_PS_BEGIN\r\n${ps.replaceAll('\n','\r\n')}# JA_PS_END\r\n# JA_SHA256 ${checksum}\r\n# JA_BODY ${bytes.toString('base64')}\r\n`;
 return Buffer.from(cmd,'utf8');
}
export async function buildUpdate({projectRoot=root}={}){
 const candidate=await buildCandidate({projectRoot}),manifest=JSON.parse(await fs.readFile(path.join(candidate.directory,'SOURCE.json'),'utf8'));
 const baselines=await Promise.all(UPDATE_BASELINES.map(source=>baselineManifest(projectRoot,source))),changes={};
 for(const file of manifest.files)if(baselines.some(b=>b.files.find(old=>old.path===file.path)?.sha256!==file.sha256))changes[file.path]=git(projectRoot,['show',candidate.source+':'+file.path]).toString('base64');
 const bundle={format:1,target:{source:candidate.source,version:manifest.version,files:manifest.files,manifest},baselines,changes};
 const engine=git(projectRoot,['show',candidate.source+':scripts/update-install.mjs']).toString('utf8'),bytes=renderUpdater(bundle,engine);
 const directory=path.join(projectRoot,'.runtime/delivery/update-'+candidate.source.slice(0,12));await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'更新.cmd'),bytes);
 const report={source:candidate.source,version:manifest.version,files:Object.keys(changes).length,targetFiles:manifest.files.length,bytes:bytes.length,sha256:sha(bytes),baselines:baselines.map(b=>({source:b.source,version:b.version,changedFiles:Object.keys(changes).filter(name=>b.files.find(f=>f.path===name)?.sha256!==manifest.files.find(f=>f.path===name).sha256).length})),directory};
 await fs.writeFile(path.join(directory,'UPDATE.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));return {bundle,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildUpdate();
