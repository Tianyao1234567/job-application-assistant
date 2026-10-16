import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {ROOT} from '../paths.mjs';
import {createApp} from '../server.mjs';

async function setup(t) {
  await fs.mkdir(path.join(ROOT, '.runtime/tests'), {recursive: true});
  const dataDir = await fs.mkdtemp(path.join(ROOT, '.runtime/tests/server-'));
  const app = await createApp({dataDir, port: 0, startFixture: false, testMode: true});
  t.after(async () => {await app.close(); await fs.rm(dataDir, {recursive: true, force: true});});
  const html = await (await fetch(app.url)).text();
  const key = /name="local-key" content="([A-Za-z0-9_-]+)"/.exec(html)?.[1];
  assert.ok(key);
  const request = (route, body, headers = {}) => fetch(app.url + route, {
    method: body ? 'POST' : 'GET',
    headers: {'X-Local-Key': key, Origin: app.url, ...(body ? {'Content-Type': 'application/json'} : {}), ...headers},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  return {...app, key, request, dataDir};
}

test('dashboard API preserves state across restart and never exposes resume storage path', async t => {
  const app = await setup(t);
  assert.equal((await app.request('/api/action', {action: 'demo'})).status, 200);
  let response = await app.request('/api/state');
  assert.equal(response.status, 200);
  let state = await response.json();
  assert.equal(state.sites.length, 2); assert.equal(state.readiness.length, 0);
  assert.equal(state.profile.version, 1); assert.equal(state.resume.file, undefined);
  assert.ok(state.resume.sha256);
  await app.close();
  const restarted = await createApp({dataDir: app.dataDir, port: 0, startFixture: false, testMode: true});
  t.after(() => restarted.close());
  response = await fetch(restarted.url + '/api/state', {headers: {'X-Local-Key': app.key}});
  state = await response.json();
  assert.equal(state.profile.version, 1); assert.equal(state.resume.version, 1);
  assert.equal(state.paused, true); assert.equal(state.running, false);
});

test('management APIs reject missing key, hostile origin, mutation without origin and malformed bodies', async t => {
  const app = await setup(t);
  assert.equal((await fetch(app.url + '/api/state')).status, 401);
  assert.equal((await app.request('/api/state', null, {Origin: 'https://untrusted.example'})).status, 403);
  assert.equal((await fetch(app.url + '/api/action', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Key': app.key}, body: '{"action":"demo"}'})).status, 403);
  assert.equal((await app.request('/api/action', {action: 'demo'}, {'Sec-Fetch-Site': 'cross-site'})).status, 403);
  assert.equal((await app.request('/api/action', {action: 'demo'}, {'Content-Type': 'text/plain'})).status, 415);
  const invalid = await fetch(app.url + '/api/action', {method: 'POST', headers: {Origin: app.url, 'X-Local-Key': app.key, 'Content-Type': 'application/json'}, body: '{bad'});
  assert.equal(invalid.status, 400);
  assert.equal((await app.request('/api/state')).status, 200);
  assert.equal((await app.request('/api/action', {action: 'browser-open'})).status, 409);
});

test('Host validation blocks rebinding and static routes cannot traverse the checkout', async t => {
  const app = await setup(t);
  const status = await new Promise((resolve, reject) => {
    const request = http.get(app.url, {headers: {Host: 'untrusted.example'}}, response => {response.resume(); resolve(response.statusCode);});
    request.on('error', reject);
  });
  assert.equal(status, 403);
  for (const route of ['/model.mjs', '/state.json', '/.runtime/data/local-key', '/%2e%2e/package.json']) {
    assert.equal((await fetch(app.url + route)).status, 404);
  }
  const schema = await fetch(app.url + '/schema.js');
  assert.equal(schema.status, 200); assert.match(await schema.text(), /validateProfile/);
});

test('bridge restricts origin and extension identity, including CORS and result routes', async t => {
  const app = await setup(t);
  const extensionId = 'a'.repeat(32), origin = 'chrome-extension://' + extensionId;
  const identity = {clientId: 'client-test-0001', profileId: 'profile-test-0001', extensionId};
  assert.equal((await app.request('/api/bridge/poll', identity)).status, 403);
  assert.equal((await app.request('/api/bridge/poll', identity, {Origin: 'http://127.0.0.1:17322'})).status, 403);
  assert.equal((await app.request('/api/bridge/poll', {...identity, extensionId: 'b'.repeat(32)}, {Origin: origin})).status, 403);
  const poll = await app.request('/api/bridge/poll', identity, {Origin: origin});
  assert.equal(poll.status, 200); assert.equal(poll.headers.get('access-control-allow-origin'), origin);
  assert.equal((await poll.json()).command, null);
  assert.equal((await app.request('/api/bridge/authorize', {clientId: identity.clientId, commandId: 'absent'}, {Origin: 'chrome-extension://' + 'b'.repeat(32)})).status, 403);
  const preflight = await fetch(app.url + '/api/bridge/poll', {method: 'OPTIONS', headers: {Origin: origin}});
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal((await app.request('/api/bridge/authorize', {clientId: identity.clientId, commandId: 'absent'}, {Origin: origin})).status, 200);
});
