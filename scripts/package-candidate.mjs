// Candidate source delivery only. Read allowlisted Git blobs, never runtime files.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const VERSION='0.2.0-candidate.7';
export const BASELINE='b6cfdee0bbded79010bb97866fd1ad538275270f';
export const PREFIX='job-application-assistant/';
export const SOURCE_PATHS=Object.freeze([
  'README.md','SPEC.md','AGENTS.md','DEVELOPMENT_SNAPSHOT.md','CLOUD_SETUP.md','CLOUD_HANDOFF.md',
  'GITHUB_MIGRATION_STATUS.md','DEV_REPORT_003.md','WINDOWS_START_001.md','CANDIDATE_PACKAGE.md',
  '启动.cmd','停止.cmd','打开投递浏览器.cmd','安装运行环境.cmd','补充运行依赖.cmd','UPGRADE_001.md',
  'scripts/prepare-deps.mjs','scripts/update-install.mjs','scripts/runtime.ps1','scripts/start.ps1','scripts/stop.ps1','scripts/open-browser.ps1','scripts/setup.ps1',
  'scripts/browser.mjs','scripts/windows-service.mjs','scripts/windows-browser-control.mjs','scripts/package-candidate.mjs','runtime-deps/package.json','runtime-deps/package-lock.json',
  'local-app/CONTRACT.md','local-app/server.mjs','local-app/model.mjs','local-app/pdf-worker.mjs','local-app/resume-import.mjs','local-app/profile-draft.mjs','local-app/greenhouse.mjs','local-app/fixture.mjs','local-app/paths.mjs',
  'local-app/public/index.html','local-app/public/app.js','local-app/public/style.css',
  'autofill-extension/package.json','autofill-extension/manifest.json','autofill-extension/profile.example.json',
  'autofill-extension/background.js','autofill-extension/greenhouse-receipts.js','autofill-extension/adapters/status.js','autofill-extension/bridge/dashboard.js',
  'autofill-extension/content/guard.js','autofill-extension/content/scan.js','autofill-extension/content/fill.js',
  'autofill-extension/options/index.html','autofill-extension/options/options.js',
  'autofill-extension/popup/index.html','autofill-extension/popup/popup.js',
  'autofill-extension/runner/index.html','autofill-extension/runner/runner.js','autofill-extension/runner/local-adapter.js','autofill-extension/runner/greenhouse-adapter.js',
  'autofill-extension/shared/schema.js','autofill-extension/shared/profile-facts.js','autofill-extension/shared/migration.js','autofill-extension/shared/match.js','autofill-extension/shared/storage.js',
  'autofill-extension/shared/ui.js','autofill-extension/shared/style.css',
  'autofill-extension/workspace/index.html','autofill-extension/workspace/workspace.js'
]);
const OPTIONAL_PATHS=Object.freeze(['DEV_REPORT_004.md','DEV_REPORT_005.md','REAL_SITE_PREPARATION.md']);
const ALLOWED=new Set([...SOURCE_PATHS,...OPTIONAL_PATHS]);
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const sha256=value=>createHash('sha256').update(value).digest('hex');
const requireTrue=(condition,message)=>{if(!condition)throw new Error(message);};
const within=(parent,target)=>{const relative=path.relative(parent,target);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
function git(directory,args,{allowFailure=false}={}){
  const result=spawnSync('git',args,{cwd:directory,maxBuffer:12*1024*1024,encoding:null});
  if(result.error)throw result.error;
  if(result.status!==0&&!allowFailure)throw new Error('Candidate source Git operation failed: '+args[0]);
  return result;
}
const textGit=(directory,args)=>git(directory,args).stdout.toString('utf8').trim();
const crcTable=Array.from({length:256},(_,index)=>{let current=index;for(let bit=0;bit<8;bit++)current=current&1?0xedb88320^(current>>>1):current>>>1;return current>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function safeArchivePath(name){
  requireTrue(typeof name==='string'&&name.startsWith(PREFIX)&&!name.includes('\\')&&!name.includes('\0'),'Unsafe candidate archive path');
  const relative=name.slice(PREFIX.length);
  requireTrue(relative.length>0&&!relative.startsWith('/')&&relative.split('/').every(part=>part&&part!=='.'&&part!=='..')&&(relative==='SOURCE.json'||ALLOWED.has(relative)),'Candidate contains a non-allowlisted path');
  return relative;
}
function zip(entries){
  let offset=0;const local=[],central=[];
  for(const [relative,bytes] of entries){
    const name=Buffer.from(PREFIX+relative),crc=crc32(bytes),header=Buffer.alloc(30),directory=Buffer.alloc(46);
    safeArchivePath(PREFIX+relative);
    // Stored, UTF-8 ZIP entries with a fixed DOS date make identical Git sources reproducible.
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(0,8);header.writeUInt16LE(33,12);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
    directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(0,10);directory.writeUInt16LE(33,14);
    directory.writeUInt32LE(crc,16);directory.writeUInt32LE(bytes.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
    local.push(header,name,bytes);central.push(directory,name);offset+=header.length+name.length+bytes.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
function parseZip(bytes){
  requireTrue(bytes.length>=22&&bytes.length<=16*1024*1024,'Candidate ZIP size is outside its bound');
  const end=bytes.length-22;
  requireTrue(bytes.readUInt32LE(end)===0x06054b50&&bytes.readUInt16LE(end+4)===0&&bytes.readUInt16LE(end+6)===0&&bytes.readUInt16LE(end+20)===0,'Unsupported candidate ZIP ending');
  const count=bytes.readUInt16LE(end+10),start=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);
  requireTrue(count>0&&count<=100&&count===bytes.readUInt16LE(end+8)&&start+size===end,'Invalid candidate ZIP directory');
  const entries=new Map();let cursor=start,localCursor=0;
  for(let index=0;index<count;index++){
    requireTrue(cursor+46<=end&&bytes.readUInt32LE(cursor)===0x02014b50,'Invalid candidate ZIP entry');
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),compressed=bytes.readUInt32LE(cursor+20),length=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42);
    requireTrue(flags===0x800&&method===0&&compressed===length&&length<=4*1024*1024&&extra===0&&comment===0&&bytes.readUInt16LE(cursor+34)===0&&bytes.readUInt32LE(cursor+38)===0&&cursor+46+nameLength<=end,'Unsupported candidate ZIP entry fields');
    const nameBytes=bytes.subarray(cursor+46,cursor+46+nameLength),relative=safeArchivePath(nameBytes.toString('utf8'));
    requireTrue(!entries.has(relative)&&local===localCursor&&local+30<=start&&bytes.readUInt32LE(local)===0x04034b50,'Duplicate or overlapping candidate ZIP entry');
    requireTrue(bytes.readUInt16LE(local+6)===flags&&bytes.readUInt16LE(local+8)===method&&bytes.readUInt32LE(local+14)===crc&&bytes.readUInt32LE(local+18)===length&&bytes.readUInt32LE(local+22)===length&&bytes.readUInt16LE(local+26)===nameLength&&bytes.readUInt16LE(local+28)===0,'Candidate local header differs from its directory');
    const dataStart=local+30+nameLength,dataEnd=dataStart+length;
    requireTrue(dataEnd<=start&&bytes.subarray(local+30,dataStart).equals(nameBytes),'Candidate ZIP filename or byte range differs');
    const data=bytes.subarray(dataStart,dataEnd);requireTrue(crc32(data)===crc,'Candidate ZIP CRC mismatch');
    entries.set(relative,data);localCursor=dataEnd;cursor+=46+nameLength;
  }
  requireTrue(cursor===end&&localCursor===start,'Unexpected bytes in candidate ZIP');return entries;
}
async function controlledDirectory(projectRoot,target){
  const absolute=path.resolve(target),delivery=path.join(projectRoot,'.runtime','delivery');
  requireTrue(within(delivery,absolute),'Candidate outputs must stay in this checkout .runtime/delivery');
  const relative=path.relative(projectRoot,absolute);let cursor=projectRoot;
  for(const part of relative.split(path.sep)){
    if(!part)continue;cursor=path.join(cursor,part);await fs.mkdir(cursor,{recursive:true});
    requireTrue(!(await fs.lstat(cursor)).isSymbolicLink(),'Candidate output directories must not be symbolic links');
  }
  return absolute;
}
export async function buildCandidate({projectRoot=root,source='HEAD',baseline=BASELINE,output}={}){
  projectRoot=path.resolve(projectRoot);
  requireTrue(source==='HEAD'||/^[a-f0-9]{40}$/i.test(source),'Use HEAD or a complete source commit SHA');
  requireTrue(/^[a-f0-9]{40}$/i.test(baseline),'Use a complete baseline commit SHA');
  const commit=textGit(projectRoot,['rev-parse','--verify',source+'^{commit}']);
  requireTrue(git(projectRoot,['merge-base','--is-ancestor',baseline,commit],{allowFailure:true}).status===0,'Candidate source does not descend from its accepted baseline');
  const entries=[];
  for(const relative of [...SOURCE_PATHS,...OPTIONAL_PATHS]){
    const record=textGit(projectRoot,['ls-tree',commit,'--',relative]);
    if(!record){requireTrue(!SOURCE_PATHS.includes(relative),'Required source is missing from the committed candidate: '+relative);continue;}
    requireTrue(/^100(?:644|755) blob [a-f0-9]{40}\t/.test(record),'Candidate source must be a regular Git file: '+relative);
    const bytes=git(projectRoot,['cat-file','blob',commit+':'+relative]).stdout;
    requireTrue(bytes.length<=4*1024*1024,'Candidate source file exceeds the limit: '+relative);entries.push([relative,bytes]);
  }
  const sourceBytes=new Map(entries),dependency=JSON.parse(sourceBytes.get('runtime-deps/package.json')),lock=JSON.parse(sourceBytes.get('runtime-deps/package-lock.json'));
  requireTrue(dependency.dependencies?.playwright==='1.58.2'&&dependency.dependencies?.['pdfjs-dist']==='5.4.296'&&Object.keys(dependency.dependencies).length===2&&lock.packages?.['node_modules/pdfjs-dist']?.version==='5.4.296'&&lock.packages?.['node_modules/playwright']?.version==='1.58.2'&&lock.packages?.['node_modules/playwright-core']?.version==='1.58.2','Candidate runtime dependency lock differs from the reviewed version');
  const manifest={format:1,product:'job-application-assistant',version:VERSION,status:'candidate-source-not-installed',source:{commit,baseline,repository:'https://github.com/Tianyao1234567/job-application-assistant'},dependencies:{bundled:false,node:'24',playwright:'1.58.2',pdfjs:'5.4.296 (local text extraction only)',chromium:'Downloaded separately through locked Playwright; one dedicated execution browser.'},validationBoundary:'Source integrity and runtime startup checks are separate from Windows visible-browser installation and real recruiting-site acceptance.',excludes:['.runtime','node_modules','tests','logs','screenshots','recordings','private profiles','credentials','Cookie/session state'],files:entries.map(([relative,bytes])=>({path:relative,bytes:bytes.length,sha256:sha256(bytes)}))};
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');entries.push(['SOURCE.json',manifestBytes]);
  const archive=zip(entries),basename='job-application-assistant-'+VERSION+'-'+commit.slice(0,12)+'.zip';
  const directory=await controlledDirectory(projectRoot,output||path.join(projectRoot,'.runtime','delivery',VERSION+'-'+commit.slice(0,12)));
  for(const name of [basename,'SOURCE.json','SHA256SUMS.txt']){
    try{requireTrue(!(await fs.lstat(path.join(directory,name))).isSymbolicLink(),'Candidate output must not replace a symbolic link');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await fs.writeFile(path.join(directory,basename),archive);await fs.writeFile(path.join(directory,'SOURCE.json'),manifestBytes);
  await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),sha256(archive)+'  '+basename+'\n'+sha256(manifestBytes)+'  SOURCE.json\n');
  await verifyCandidate(path.join(directory,basename),{expectedSource:commit,expectedBaseline:baseline});
  return {status:'PASS',version:VERSION,source:commit,baseline,files:manifest.files.length,bytes:archive.length,sha256:sha256(archive),verified:true,dependenciesBundled:false,archive:path.join(directory,basename),directory};
}
export async function verifyCandidate(archive,{expectedSource,expectedBaseline=BASELINE,extract,projectRoot=root}={}){
  const bytes=await fs.readFile(archive),entries=parseZip(bytes);requireTrue(entries.has('SOURCE.json'),'Candidate source manifest is missing');
  const manifest=JSON.parse(entries.get('SOURCE.json').toString('utf8'));
  requireTrue(manifest.format===1&&manifest.version===VERSION&&manifest.status==='candidate-source-not-installed'&&/^[a-f0-9]{40}$/.test(manifest.source?.commit||'')&&manifest.source.baseline===expectedBaseline&&Array.isArray(manifest.files),'Invalid candidate source manifest');
  if(expectedSource)requireTrue(manifest.source.commit===expectedSource,'Candidate source SHA does not match the requested commit');
  const listed=new Set();
  for(const file of manifest.files){
    requireTrue(ALLOWED.has(file.path)&&!listed.has(file.path)&&entries.has(file.path),'Candidate manifest contains an absent or unsafe source path');listed.add(file.path);
    const data=entries.get(file.path);requireTrue(file.bytes===data.length&&file.sha256===sha256(data),'Candidate source byte/hash mismatch');
  }
  requireTrue(SOURCE_PATHS.every(relative=>listed.has(relative))&&entries.size===listed.size+1,'Candidate payload does not match its complete manifest');
  if(extract){
    const target=path.resolve(extract);requireTrue(within(path.join(projectRoot,'.runtime','delivery'),target),'Candidate extraction must stay in checkout .runtime/delivery');
    try{await fs.lstat(target);throw new Error('Candidate extraction target already exists; choose a new isolated directory');}catch(error){if(error.code!=='ENOENT')throw error;}
    await controlledDirectory(path.resolve(projectRoot),target);
    for(const [relative,data] of entries){const filename=path.join(target,relative);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,data,{flag:'wx'});}
  }
  return {status:'PASS',version:VERSION,source:manifest.source.commit,baseline:manifest.source.baseline,files:listed.size,sha256:sha256(bytes),bytes:bytes.length,extracted:Boolean(extract)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,...args]=process.argv.slice(2);
  const output=result=>{
    console.log(JSON.stringify(result));
    if(process.env.GITHUB_ACTIONS==='true'){
      const {status,version,source,baseline,files,bytes,sha256:hash,verified,dependenciesBundled,extracted}=result;
      console.error('::notice title=Candidate source package '+command+'::'+JSON.stringify({status,version,source,baseline,files,bytes,sha256:hash,verified,dependenciesBundled,extracted}));
    }
  };
  try{
    if(command==='build'){requireTrue(args.length===0,'Build uses the committed HEAD and controlled default output');output(await buildCandidate());}
    else if(command==='verify'){
      requireTrue(args[0],'Provide the candidate ZIP path');let expectedSource,extract;
      for(let index=1;index<args.length;index+=2){requireTrue(args[index+1]&&['--source','--extract'].includes(args[index]),'Use --source <complete SHA> or --extract <new checkout-local .runtime/delivery path>');if(args[index]==='--source')expectedSource=args[index+1];else extract=args[index+1];}
      output(await verifyCandidate(args[0],{expectedSource,extract}));
    }else throw new Error('Use: node scripts/package-candidate.mjs build | verify <zip> [--source <SHA>] [--extract <new .runtime/delivery directory>]');
  }catch(error){console.error('Candidate delivery failed: '+error.message);process.exitCode=1;}
}
