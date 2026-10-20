// Actual checkout-local cleanup tests; no browser/profile contents are inspected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runtimeRoot,testsRoot,testDirectory,removeTestDirectory} from '../../autofill-extension/tests/runtime.mjs';

async function rejectedBeforeDeletion(t,targets){
  // If a guard regresses, prevent the test itself from deleting a protected path.
  // Passing requires rejection before this mock is reached, not mock refusal.
  const rm=t.mock.method(fs,'rm',async()=>{throw new Error('Protected deletion was attempted');});
  for(const target of targets)await assert.rejects(()=>removeTestDirectory(target),/Only isolated test directories|Unsafe project runtime path/);
  assert.equal(rm.mock.callCount(),0,'protected targets must be rejected before filesystem deletion');
}

test('runtime cleanup refuses the tests root, an external path and a sibling prefix before deleting',async t=>{
  await rejectedBeforeDeletion(t,[testsRoot,path.join(testsRoot,'..','tests'),path.join('/tmp','not-a-task-test-'+randomUUID()),path.join(runtimeRoot,'tests-sibling-'+randomUUID())]);
});

test('runtime cleanup refuses production browser paths without reading or writing a real profile',async t=>{
  await rejectedBeforeDeletion(t,[path.join(runtimeRoot,'browser','production'),path.join(runtimeRoot,'browser','production','Default'),path.join(testsRoot,'..','browser','production')]);
});

test('runtime cleanup removes the owned test child while preserving an independent sibling sentinel',async t=>{
  const target=await testDirectory('cleanup-owned'),sibling=await testDirectory('cleanup-sibling');
  t.after(async()=>{await removeTestDirectory(target);await removeTestDirectory(sibling);});
  const sentinel='Fictional sibling sentinel; not applicant or credential data.';
  await fs.mkdir(path.join(target,'nested'));await fs.writeFile(path.join(target,'nested','owned.txt'),'owned test data');
  await fs.writeFile(path.join(sibling,'sentinel.txt'),sentinel);
  await removeTestDirectory(target);
  await assert.rejects(()=>fs.lstat(target),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(sibling,'sentinel.txt'),'utf8'),sentinel);
});
