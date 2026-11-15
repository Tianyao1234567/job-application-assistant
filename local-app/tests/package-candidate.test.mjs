import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SOURCE_PATHS,buildCandidate,verifyCandidate} from '../../scripts/package-candidate.mjs';
import {testDirectory,removeTestDirectory} from '../../autofill-extension/tests/runtime.mjs';

const repository=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
function git(root,args){const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(result.status,0,'test source Git operation must succeed');return result.stdout.trim();}
async function setup(t){
  const directory=await testDirectory('candidate-source'),root=path.join(directory,'fictional source');await fs.mkdir(root);
  t.after(()=>removeTestDirectory(directory));
  for(const relative of SOURCE_PATHS){
    const target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});
    let bytes;try{bytes=await fs.readFile(path.join(repository,relative));}catch(error){if(error.code!=='ENOENT')throw error;bytes=Buffer.from('Fictional test-only source placeholder: '+relative+'\n');}
    await fs.writeFile(target,bytes);
  }
  await fs.writeFile(path.join(root,'README.md'),'# Fictional committed candidate source\n');
  await fs.mkdir(path.join(root,'.runtime','data'),{recursive:true});
  await fs.writeFile(path.join(root,'.runtime','data','local-key'),'FICTIONAL_TRACKED_RUNTIME_BAIT_NEVER_PACKAGE');
  await fs.writeFile(path.join(root,'unrelated-session.json'),'FICTIONAL_TRACKED_SESSION_BAIT_NEVER_PACKAGE');
  git(root,['init','-q']);git(root,['config','user.name','Candidate source test']);git(root,['config','user.email','candidate@example.test']);
  git(root,['add','.']);git(root,['commit','-qm','Fictional source and excluded runtime bait']);
  const baseline=git(root,['rev-parse','HEAD']);return {root,baseline};
}

test('candidate packs committed allowlisted bytes, excludes even tracked runtime bait, and verifies extracted hashes',async t=>{
  const {root,baseline}=await setup(t);
  await fs.writeFile(path.join(root,'README.md'),'FICTIONAL_UNCOMMITTED_PRIVATE_BAIT_NEVER_PACKAGE');
  const result=await buildCandidate({projectRoot:root,baseline});
  assert.equal(result.verified,true);assert.equal(result.dependenciesBundled,false);assert.equal(result.source,baseline);
  const zip=await fs.readFile(result.archive),manifest=JSON.parse(await fs.readFile(path.join(result.directory,'SOURCE.json'),'utf8'));
  for(const marker of ['FICTIONAL_TRACKED_RUNTIME_BAIT','FICTIONAL_TRACKED_SESSION_BAIT','FICTIONAL_UNCOMMITTED_PRIVATE_BAIT'])assert.equal(zip.includes(Buffer.from(marker)),false);
  assert.equal(manifest.files.length,SOURCE_PATHS.length);assert.ok(manifest.files.every(file=>!/(?:^|\/)(?:\.runtime|node_modules|tests)(?:\/|$)/.test(file.path)));
  const extracted=path.join(root,'.runtime','delivery','verified extraction 目录');
  const verified=await verifyCandidate(result.archive,{expectedSource:baseline,expectedBaseline:baseline,extract:extracted,projectRoot:root});
  assert.equal(verified.extracted,true);assert.equal(await fs.readFile(path.join(extracted,'README.md'),'utf8'),'# Fictional committed candidate source\n');
  assert.equal(JSON.parse(await fs.readFile(path.join(extracted,'runtime-deps/package.json'),'utf8')).dependencies.playwright,'1.58.2');
  const repeated=await buildCandidate({projectRoot:root,baseline});assert.equal(repeated.sha256,result.sha256,'the same committed source must produce the same ZIP');
  await assert.rejects(()=>verifyCandidate(result.archive,{expectedSource:'0'.repeat(40),expectedBaseline:baseline}),/source SHA/);
  await assert.rejects(()=>verifyCandidate(result.archive,{expectedSource:baseline,expectedBaseline:baseline,extract:extracted,projectRoot:root}),/already exists/);
});

test('candidate verification rejects modified bytes and unsafe archive names before any extraction',async t=>{
  const {root,baseline}=await setup(t),result=await buildCandidate({projectRoot:root,baseline}),original=await fs.readFile(result.archive);
  const changed=Buffer.from(original),position=changed.indexOf(Buffer.from('# Fictional committed candidate source'));assert.ok(position>0);changed[position]^=1;
  const tampered=path.join(result.directory,'tampered.zip');await fs.writeFile(tampered,changed);
  const target=path.join(root,'.runtime','delivery','must-not-exist');
  await assert.rejects(()=>verifyCandidate(tampered,{expectedBaseline:baseline,extract:target,projectRoot:root}),/CRC mismatch/);
  await assert.rejects(()=>fs.lstat(target),{code:'ENOENT'});
  const unsafe=Buffer.from(original),name=Buffer.from('job-application-assistant/README.md'),replacement=Buffer.from('job-application-assistant/../key.md');assert.equal(name.length,replacement.length);
  for(let index=unsafe.indexOf(name);index>=0;index=unsafe.indexOf(name,index+replacement.length))replacement.copy(unsafe,index);
  const unsafeArchive=path.join(result.directory,'unsafe.zip');await fs.writeFile(unsafeArchive,unsafe);
  await assert.rejects(()=>verifyCandidate(unsafeArchive,{expectedBaseline:baseline,extract:target,projectRoot:root}),/non-allowlisted path/);
  await assert.rejects(()=>fs.lstat(target),{code:'ENOENT'});
});

test('candidate refuses an incomplete committed source, non-ancestor baseline and unsafe output/extraction paths',async t=>{
  const {root,baseline}=await setup(t);
  await assert.rejects(()=>buildCandidate({projectRoot:root,baseline:'0'.repeat(40)}),/accepted baseline/);
  await assert.rejects(()=>buildCandidate({projectRoot:root,baseline,output:path.join(root,'outside-delivery')}),/\.runtime\/delivery/);
  const result=await buildCandidate({projectRoot:root,baseline});
  await assert.rejects(()=>verifyCandidate(result.archive,{expectedBaseline:baseline,extract:path.join(root,'.runtime','browser','production'),projectRoot:root}),/\.runtime\/delivery/);
  git(root,['rm','WINDOWS_START_001.md']);git(root,['commit','-qm','Fictional incomplete candidate']);
  await assert.rejects(()=>buildCandidate({projectRoot:root,baseline}),/Required source is missing.*WINDOWS_START_001/);
});
