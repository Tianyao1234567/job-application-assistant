import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ROOT} from '../paths.mjs';
import {SOURCE_PATHS,VERSION} from '../../scripts/package-candidate.mjs';
import {baselineManifest,buildUpdate,UPDATE_BASELINES} from '../../scripts/package-update.mjs';
import {installedBaseline,validateBundle} from '../../scripts/update-install.mjs';

const accepted8='bdd06e8aa17aa0e6dd433691cbbe399bebe41d7b';
const newRuntime=['local-app/profile-update.mjs','local-app/public/profile-file-import.js'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function gitBlob(source,name){const result=spawnSync('git',['show',source+':'+name],{cwd:ROOT,maxBuffer:8*1024*1024});assert.equal(result.status,0,'packaging fixture must come from the stated committed source');return result.stdout;}

test('candidate9 retains accepted candidate5/6/8 and requires both new profile import runtime modules',async()=>{
 assert.equal(VERSION,'0.2.0-candidate.9');
 assert.deepEqual(UPDATE_BASELINES,['3856a49a78852c4729a6be4d64f01f19acdcd1c3','38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac',accepted8]);
 const baseline=await baselineManifest(ROOT,accepted8);assert.equal(baseline.source,accepted8);assert.equal(baseline.version,'0.2.0-candidate.8');
 for(const name of newRuntime){assert.ok(SOURCE_PATHS.includes(name));assert.equal(baseline.files.some(file=>file.path===name),false,'candidate8 needs the new runtime file supplied by the delta');}
});

test('the committed single-file delta contains both new modules and recognizes an exact accepted candidate8 installation',async t=>{
 const {bundle,report}=await buildUpdate({projectRoot:ROOT});assert.equal(bundle.target.version,'0.2.0-candidate.9');assert.equal(report.baselines.length,3);assert.equal(validateBundle(bundle),bundle);
 assert.doesNotThrow(()=>validateBundle({...bundle,baselines:bundle.baselines.slice(0,2)}),'existing two-baseline bundles remain supported');
 assert.throws(()=>validateBundle({...bundle,baselines:bundle.baselines.slice(0,1)}),/UPDATE_PACKAGE_INVALID/);
 assert.throws(()=>validateBundle({...bundle,baselines:[...bundle.baselines,bundle.baselines[0]]}),/UPDATE_PACKAGE_INVALID/);
 for(const name of newRuntime){
  const metadata=bundle.target.files.find(file=>file.path===name);assert.ok(metadata);assert.equal(typeof bundle.changes[name],'string');
  const bytes=Buffer.from(bundle.changes[name],'base64');assert.deepEqual(bytes,gitBlob(bundle.target.source,name));assert.equal(metadata.bytes,bytes.length);assert.equal(metadata.sha256,hash(bytes));
 }
 const parent=path.join(ROOT,'.runtime/tests');await fs.mkdir(parent,{recursive:true});const installation=await fs.mkdtemp(path.join(parent,'profile-update-package-'));t.after(()=>fs.rm(installation,{recursive:true,force:true}));
 const baseline=bundle.baselines.find(item=>item.source===accepted8);assert.ok(baseline);
 for(const file of baseline.files){const target=path.join(installation,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,gitBlob(accepted8,file.path));}
 await fs.writeFile(path.join(installation,'SOURCE.json'),JSON.stringify({source:{commit:accepted8},version:baseline.version,files:baseline.files}));
 assert.equal((await installedBaseline(installation,bundle)).source,accepted8);
});
