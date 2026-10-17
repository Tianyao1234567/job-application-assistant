import test from 'node:test';
import assert from 'node:assert/strict';
import {linuxBrowserSocketBudget,assertLinuxBrowserTempDirectory} from '../../autofill-extension/tests/runtime.mjs';

test('Chromium 145 temporary socket budget follows both actual source branding paths',()=>{
  const budget=linuxBrowserSocketBudget('/workspace/.runtime/tmp');
  assert.deepEqual(budget.brandBytes,{'com.google.Chrome':64,'org.chromium.Chromium':68});
  assert.equal(budget.maximumBytes,68);assert.equal(budget.limitBytes,108);
  assert.doesNotThrow(()=>assertLinuxBrowserTempDirectory('/workspace/.runtime/tmp'));
});

test('Linux sockaddr_un accepts 107 bytes and the browser preflight rejects 108',()=>{
  const longestSafe='/'+ 'a'.repeat(61);
  assert.equal(assertLinuxBrowserTempDirectory(longestSafe).maximumBytes,107);
  assert.throws(()=>assertLinuxBrowserTempDirectory(longestSafe+'a'),/108 UTF-8 bytes.*fewer than 108.*shorten the checkout/);
});

test('Temporary socket limit counts UTF-8 bytes instead of JavaScript characters',()=>{
  const longestSafe='/'+ '中'.repeat(20)+'a';
  assert.equal(longestSafe.length,22);assert.equal(Buffer.byteLength(longestSafe),62);
  assert.equal(assertLinuxBrowserTempDirectory(longestSafe).maximumBytes,107);
  assert.throws(()=>assertLinuxBrowserTempDirectory(longestSafe+'a'),/108 UTF-8 bytes/);
});

test('The former hosted container checkout explains the overlong socket before launch',()=>{
  const former='/__w/job-application-assistant/job-application-assistant/.runtime/tmp';
  assert.deepEqual(linuxBrowserSocketBudget(former).brandBytes,{'com.google.Chrome':110,'org.chromium.Chromium':114});
  assert.throws(()=>assertLinuxBrowserTempDirectory(former),/114 UTF-8 bytes/);
  assert.throws(()=>linuxBrowserSocketBudget('relative/tmp'),/absolute Linux path/);
});
