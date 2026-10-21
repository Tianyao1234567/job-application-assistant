import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {ROOT} from '../paths.mjs';
import {createApp} from '../server.mjs';

async function setup(t, options = {}) {
  await fs.mkdir(path.join(ROOT, '.runtime/tests'), {recursive: true});
  const dataDir = await fs.mkdtemp(path.join(ROOT, '.runtime/tests/server-'));
  const app = await createApp({dataDir, port: 0, startFixture: false, testMode: true, ...options});
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

test('dashboard browser open waits for managed readiness and app close owns the managed shutdown once', async t => {
  let allowReady, opened = 0, stopped = 0;
  const ready = new Promise(resolve => {allowReady = resolve;});
  const app = await setup(t, {testMode: false,
    browserOpen: async () => {opened++; await ready;}, browserClose: async () => {stopped++;}});
  let complete = false;
  const response = app.request('/api/action', {action: 'browser-open'}).then(value => {complete = true; return value;});
  while (!opened) await new Promise(resolve => setTimeout(resolve, 5));
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(complete, false, 'a launch request alone cannot report success');
  allowReady();
  assert.deepEqual(await (await response).json(), {ok: true, ready: true});
  await Promise.all([app.close(), app.close()]);
  assert.equal(stopped, 1);
  assert.equal(app.store.state.paused, true);
  assert.equal(app.store.state.running, false);
});

test('failed managed browser open never returns ready and test services still refuse production browser calls', async t => {
  let opened = 0;
  const app = await setup(t, {testMode: false, browserOpen: async () => {opened++; throw new Error('BROWSER_OPEN_FAILED');}});
  const response = await app.request('/api/action', {action: 'browser-open'});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).ready, undefined);
  const isolated = await setup(t, {browserOpen: async () => {opened++;}});
  assert.equal((await isolated.request('/api/action', {action: 'browser-open'})).status, 409);
  assert.equal(opened, 1);
});

test('managed browser shutdown failure is reported after backend has saved and released its listener', async t => {
  const dataDir = await fs.mkdtemp(path.join(ROOT, '.runtime/tests/server-close-'));
  const app = await createApp({dataDir, port: 0, startFixture: false, testMode: false,
    browserClose: async () => {throw new Error('BROWSER_CLOSE_FAILED');}});
  t.after(() => fs.rm(dataDir, {recursive: true, force: true}));
  await assert.rejects(app.close(), /BROWSER_CLOSE_FAILED/);
  assert.equal(app.server.listening, false);
  const state = JSON.parse(await fs.readFile(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(state.paused, true);
  assert.equal(state.running, false);
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

test('health requires the management key and local Host/Origin, including extension-origin rejection', async t => {
  const app = await setup(t);
  assert.equal((await fetch(app.url + '/api/health')).status, 401);
  assert.equal((await app.request('/api/health', null, {Origin: 'https://untrusted.example'})).status, 403);
  assert.equal((await app.request('/api/health', null, {Origin: 'chrome-extension://' + 'a'.repeat(32)})).status, 403);
  assert.equal((await app.request('/api/health', null, {'Sec-Fetch-Site': 'cross-site'})).status, 403);
  const status = await new Promise((resolve, reject) => {
    const request = http.get(app.url + '/api/health', {headers: {Host: 'untrusted.example', 'X-Local-Key': app.key}}, response => {response.resume(); resolve(response.statusCode);});
    request.on('error', reject);
  });
  assert.equal(status, 403);
  assert.equal((await fetch(app.url + '/api/health', {headers: {'X-Local-Key': app.key}})).status, 200);
});

test('health reports disabled fixture, missing configuration and absent heartbeat without changing saved work', async t => {
  const app = await setup(t);
  let response = await app.request('/api/health');
  assert.equal(response.status, 200);
  let report = await response.json();
  const check = id => report.checks.find(item => item.id === id);
  assert.ok(Number.isFinite(Date.parse(report.checkedAt)));
  assert.equal(check('backend').status, 'pass');
  assert.equal(check('fixture').status, 'warning');
  assert.match(check('fixture').detail, /未启动虚构本地/);
  assert.equal(check('extension').status, 'warning');
  assert.match(check('configuration').detail, /请保存经确认的申请资料/);
  await app.request('/api/action', {action: 'demo'});
  await app.request('/api/action', {action: 'add', url: 'http://127.0.0.1:17322/site/beta/jobs/web-001'});
  await app.request('/api/action', {action: 'site-check', siteId: 'local-alpha'});
  const before = structuredClone({state: app.store.state, queue: app.store.queue, command: app.store.command,
    connection: app.store.connection, lastSeen: app.store.lastSeen});
  const savedBefore = await fs.readFile(path.join(app.dataDir, 'state.json'), 'utf8');
  report = await (await app.request('/api/health')).json();
  assert.equal(check('configuration').status, 'pass');
  assert.deepEqual({state: app.store.state, queue: app.store.queue, command: app.store.command,
    connection: app.store.connection, lastSeen: app.store.lastSeen}, before);
  assert.equal(await fs.readFile(path.join(app.dataDir, 'state.json'), 'utf8'), savedBefore);
  const text = JSON.stringify(report);
  for (const privateValue of [app.key, app.dataDir, ROOT]) assert.equal(text.includes(privateValue), false);
  assert.ok(report.checks.every(item => ['pass', 'warning', 'fail'].includes(item.status) && item.label && item.detail));
});

test('health makes a real bounded fixture request and reuses one private probe session without submitting', async t => {
  const testKey = 'health-fixture-private-test-key';
  const app = await setup(t, {startFixture: true, fixturePort: 0, testKey});
  const reports = await Promise.all(Array.from({length: 3}, async () => (await app.request('/api/health')).json()));
  reports.push(await (await app.request('/api/health')).json());
  for (const report of reports) {
    const fixture = report.checks.find(item => item.id === 'fixture');
    assert.equal(fixture.status, 'pass');
    assert.match(fixture.detail, /已实际响应/);
    assert.match(fixture.detail, /不确认投递浏览器登录/);
    assert.equal(report.checks.find(item => item.id === 'extension').status, 'warning');
    assert.equal(JSON.stringify(report).includes(testKey), false);
    assert.equal(JSON.stringify(report).includes('fixture_beta='), false);
  }
  const evidence = await (await fetch(app.fixture.url + '/__test/state', {headers: {'X-Fixture-Test-Key': testKey}})).json();
  assert.equal(evidence.sessions.length, 1);
  assert.equal(evidence.receipts.length, 0);
  assert.equal(evidence.submitRequests.length, 0);
});

test('health scopes saved login checks to the connected browser and distinguishes account mismatch and stale heartbeat', async t => {
  let clock = Date.parse('2026-10-17T03:00:00Z');
  const app = await setup(t, {now: () => clock});
  await app.request('/api/action', {action: 'demo'});
  const extensionId = 'a'.repeat(32), origin = 'chrome-extension://' + extensionId;
  const identity = {clientId: 'health-client-0001', profileId: 'health-profile-0001', extensionId};
  assert.equal((await app.request('/api/bridge/heartbeat', identity, {Origin: origin})).status, 200);
  app.store.loginResult(app.store.site('local-alpha'), {status: 'ready', account: 'demo', tenant: 'alpha'}, identity.profileId);
  app.store.loginResult(app.store.site('local-beta'), {status: 'ready', account: 'demo', tenant: 'beta'}, 'other-browser-profile');
  let report = await (await app.request('/api/health')).json();
  let byId = Object.fromEntries(report.checks.map(check => [check.id, check]));
  assert.equal(byId.extension.status, 'pass');
  assert.equal(byId['site:local-alpha'].status, 'pass');
  assert.match(byId['site:local-alpha'].detail, /不会重新读取网站页面/);
  assert.equal(byId['site:local-beta'].status, 'warning');
  assert.match(byId['site:local-beta'].detail, /其他浏览器或旧记录不能作为就绪依据/);
  app.store.loginResult(app.store.site('local-alpha'), {status: 'ready', account: 'other', tenant: 'alpha'}, identity.profileId);
  report = await (await app.request('/api/health')).json();
  assert.equal(report.checks.find(check => check.id === 'site:local-alpha').status, 'fail');
  clock += 6001;
  report = await (await app.request('/api/health')).json();
  byId = Object.fromEntries(report.checks.map(check => [check.id, check]));
  assert.equal(byId.extension.status, 'warning');
  assert.equal(byId['site:local-alpha'].status, 'warning');
  assert.equal(JSON.stringify(report).includes(identity.profileId), false);
});

test('health treats malformed or stalled fixture responses as failure and never follows a redirect', async t => {
  const app = await setup(t, {startFixture: true, fixturePort: 0, testKey: 'health-malformed-fixture-test-key'});
  let mode = 'html';
  app.fixture.server.removeAllListeners('request');
  app.fixture.server.on('request', (request, response) => {
    if (mode === 'timeout') return;
    if (mode === 'redirect') {response.writeHead(302, {Location: 'https://untrusted.example/'}); response.end(); return;}
    if (mode === 'html') {response.writeHead(200, {'Content-Type': 'text/html'}); response.end('<html>Not JSON</html>'); return;}
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(mode === 'broken-json' ? '{broken' : JSON.stringify({login: {tenant: 'other', status: 'ready', account: 'demo'}}));
  });
  for (mode of ['html', 'broken-json', 'wrong-tenant', 'redirect', 'timeout']) {
    const started = performance.now();
    const response = await app.request('/api/health');
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.checks.find(check => check.id === 'fixture').status, 'fail', mode);
    assert.ok(performance.now() - started < 3500, mode + ' must not hang');
    assert.equal(report.checks.find(check => check.id === 'backend').status, 'pass');
  }
});

test('health distinguishes explicit global pause, waiting schedule and active work without changing any of them', async t => {
  const app = await setup(t);
  await app.request('/api/action', {action: 'demo'});
  app.store.state.settings.scheduleEnabled = true;
  app.store.state.manualPaused = false;
  let report = await (await app.request('/api/health')).json();
  assert.match(report.checks.find(check => check.id === 'execution').detail, /等待计划检查/);
  await app.request('/api/action', {action: 'pause'});
  report = await (await app.request('/api/health')).json();
  let execution = report.checks.find(check => check.id === 'execution');
  assert.equal(execution.status, 'warning');
  assert.match(execution.detail, /每日计划不会触发/);
  assert.match(execution.action, /明确点击继续/);
  assert.equal(app.store.state.manualPaused, true);
  assert.equal(app.store.state.paused, true);
  assert.equal(app.store.state.running, false);
  await app.request('/api/action', {action: 'resume'});
  report = await (await app.request('/api/health')).json();
  execution = report.checks.find(check => check.id === 'execution');
  assert.equal(execution.status, 'pass');
  assert.match(execution.detail, /后台记录为运行中/);
  assert.equal(app.store.state.manualPaused, false);
  assert.equal(app.store.state.running, true);
});
