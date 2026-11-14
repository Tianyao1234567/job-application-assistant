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
const accepted10='46a28d3ee7402dad992c0fa721e6e01f676cff1e';
const accepted12='950e9e2fe375868e0e576de7f34fb92a8d70dd02';
const newRuntime=['local-app/profile-update.mjs','local-app/public/profile-file-import.js'];
const nativeRuntime=['autofill-extension/runner/greenhouse-native-gate.js','autofill-extension/runner/greenhouse-native-request.js',
 'autofill-extension/runner/greenhouse-public-controls.js','local-app/greenhouse-location.mjs'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function gitBlob(source,name){const result=spawnSync('git',['show',source+':'+name],{cwd:ROOT,maxBuffer:8*1024*1024});assert.equal(result.status,0,'packaging fixture must come from the stated committed source');return result.stdout;}

test('candidate14 retains accepted candidate5/6/8/10/12 and requires profile import runtime modules',async()=>{
 assert.equal(VERSION,'0.2.0-candidate.14');
 assert.deepEqual(UPDATE_BASELINES,['3856a49a78852c4729a6be4d64f01f19acdcd1c3','38714f7ea7ccb1837b899ba8d9cb1f9d537e60ac',accepted8,accepted10,accepted12]);
 const baseline=await baselineManifest(ROOT,accepted8);assert.equal(baseline.source,accepted8);assert.equal(baseline.version,'0.2.0-candidate.8');
 for(const name of newRuntime){assert.ok(SOURCE_PATHS.includes(name));assert.equal(baseline.files.some(file=>file.path===name),false,'candidate8 needs the new runtime file supplied by the delta');}
 const baseline10=await baselineManifest(ROOT,accepted10);assert.equal(baseline10.version,'0.2.0-candidate.10');for(const name of newRuntime)assert.ok(baseline10.files.some(file=>file.path===name));
});

test('the committed single-file delta recognizes exact accepted candidate8 and candidate10 installations',async t=>{
 const {bundle,report}=await buildUpdate({projectRoot:ROOT});assert.equal(bundle.target.version,'0.2.0-candidate.14');assert.equal(report.baselines.length,5);
 assert.ok(report.baselines.some(item=>item.version==='0.2.0-candidate.12'&&item.source===accepted12));assert.equal(validateBundle(bundle),bundle);
 assert.doesNotThrow(()=>validateBundle({...bundle,baselines:bundle.baselines.slice(0,2)}),'existing two-baseline bundles remain supported');
 assert.throws(()=>validateBundle({...bundle,baselines:bundle.baselines.slice(0,1)}),/UPDATE_PACKAGE_INVALID/);
 assert.throws(()=>validateBundle({...bundle,baselines:[...bundle.baselines,bundle.baselines[0]]}),/UPDATE_PACKAGE_INVALID/);
 assert.throws(()=>validateBundle({...bundle,baselines:[...bundle.baselines.slice(0,3),bundle.baselines[0]]}),/UPDATE_PACKAGE_INVALID/);
 for(const name of [...newRuntime,...nativeRuntime]){
  const metadata=bundle.target.files.find(file=>file.path===name);assert.ok(metadata);assert.equal(typeof bundle.changes[name],'string');
  const bytes=Buffer.from(bundle.changes[name],'base64');assert.deepEqual(bytes,gitBlob(bundle.target.source,name));assert.equal(metadata.bytes,bytes.length);assert.equal(metadata.sha256,hash(bytes));
 }
 const parent=path.join(ROOT,'.runtime/tests');await fs.mkdir(parent,{recursive:true});const installation=await fs.mkdtemp(path.join(parent,'profile-update-package-'));t.after(()=>fs.rm(installation,{recursive:true,force:true}));
 for(const source of [accepted8,accepted10,accepted12]){
  const baseline=bundle.baselines.find(item=>item.source===source);assert.ok(baseline);
  const targetRoot=path.join(installation,source.slice(0,12));
  for(const file of baseline.files){const target=path.join(targetRoot,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,gitBlob(source,file.path));}
  await fs.writeFile(path.join(targetRoot,'SOURCE.json'),JSON.stringify({source:{commit:source},version:baseline.version,files:baseline.files}));
  assert.equal((await installedBaseline(targetRoot,bundle)).source,source);
 }
});
