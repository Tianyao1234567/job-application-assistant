import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createWindowsBrowserControl} from '../scripts/windows-browser-control.mjs';
import {ROOT, initializePaths, insideRoot} from './paths.mjs';
import {Store} from './model.mjs';
import {extractResume} from './resume-import.mjs';
import {createFixture} from './fixture.mjs';

const extensionOrigin = /^chrome-extension:\/\/([a-p]{32})$/;
const staticFiles = new Map([
  ['/', ['local-app/public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['local-app/public/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['local-app/public/style.css', 'text/css; charset=utf-8']],
  ['/schema.js', ['autofill-extension/shared/schema.js', 'text/javascript; charset=utf-8']]
]);
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function json(res, status, body) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}
async function readJSON(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new RequestError(415, '请求必须使用 JSON');
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 12 * 1024 * 1024) throw new RequestError(413, '请求超过大小限制');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body;
  } catch { throw new RequestError(400, '请求 JSON 格式不正确'); }
}
function localKey(dataDir) {
  const file = insideRoot(path.join(dataDir, 'local-key'));
  let key;
  try { key = fs.readFileSync(file, 'utf8').trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    key = crypto.randomBytes(32).toString('base64url');
    fs.writeFileSync(file, key, {mode: 0o600, flag: 'wx'});
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(key)) throw new Error('本地配对密钥文件无效，请保留数据并人工检查');
  return key;
}
function keyMatches(actual, expected) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function createApp({dataDir = path.join(ROOT, '.runtime/data'), port = 17321,
  fixturePort = 17322, startFixture = true, testMode = false, testKey, now,
  browserOpen, browserClose} = {}) {
  const paths = initializePaths(dataDir), store = new Store(paths, now ? {now} : {});
  const key = localKey(paths.data);
  const managedBrowser = !testMode && process.platform === 'win32' && !browserOpen ? createWindowsBrowserControl() : undefined;
  let fixture, timer, closing, fixtureProbe, fixtureProbeCookie;
  async function fixtureHealth() {
    const label = '虚构本地招聘测试站';
    if (!fixture) return {id: 'fixture', status: 'warning', label,
      detail: '本次后台未启动虚构本地招聘测试站，未进行响应检查。',
      action: '使用默认启动入口启动本地测试站后，再运行自检。'};
    // Concurrent checks share one request and retain its synthetic session cookie.
    // This cookie is never used to infer the extension browser's login state.
    if (fixtureProbe) return fixtureProbe;
    const pending = (async () => {
      try {
        const response = await fetch(fixture.url + '/site/beta/session', {
          signal: AbortSignal.timeout(1500), redirect: 'error', cache: 'no-store',
          headers: fixtureProbeCookie ? {Cookie: fixtureProbeCookie} : {}
        });
        const cookie = /^fixture_beta=[a-f0-9]{48}(?=;|$)/.exec(response.headers.get('set-cookie') || '')?.[0];
        if (cookie) fixtureProbeCookie = cookie;
        if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Invalid fixture response');
        const body = await response.json();
        if (body?.login?.tenant !== 'beta' || typeof body.login.account !== 'string' ||
          !['ready', 'login', 'expired', 'verification', 'unknown', 'account'].includes(body.login.status)) throw new Error('Invalid fixture session');
        return {id: 'fixture', status: 'pass', label,
          detail: '虚构本地招聘测试站已实际响应。此检查不确认投递浏览器登录，也不证明真实网站投递能力。'};
      } catch {
        return {id: 'fixture', status: 'fail', label,
          detail: '虚构本地招聘测试站未在限定时间内返回有效响应。此检查未访问真实招聘网站。',
          action: '检查本地测试站是否正常启动，然后重试自检。'};
      }
    })();
    fixtureProbe = pending;
    try { return await pending; }
    finally { if (fixtureProbe === pending) fixtureProbe = null; }
  }
  async function health() {
    const state = store.snapshot(), connected = state.connection.connected && !!state.connection.profileId;
    const checks = [{id: 'backend', status: 'pass', label: '本地管理后台',
      detail: '后台已响应。自检只读取状态，不会启动任务、填写或提交申请。'},
    await fixtureHealth(),
    connected ? {id: 'extension', status: 'pass', label: '插件与投递浏览器',
      detail: '已收到当前投递浏览器的插件心跳。心跳只代表连接正常，不代表网站已经登录。'} :
      {id: 'extension', status: 'warning', label: '插件与投递浏览器',
        detail: '尚未收到当前投递浏览器的有效插件心跳，或连接已超时。',
        action: '保持投递浏览器和执行端运行，在工作台连接插件后再检查。'},
    state.readiness.length ? {id: 'configuration', status: 'warning', label: '资料、简历与运行配置',
      detail: state.readiness.join('；') + '。', action: '前往资料与简历、规则与计划补齐上述项目。'} :
      {id: 'configuration', status: 'pass', label: '资料、简历与运行配置',
        detail: '当前运行模式所需配置已齐备；是否可执行仍以插件与网站检查为准。'}];
    if (state.manualPaused) checks.push({id: 'execution', status: 'warning', label: '执行与每日计划',
      detail: '你已全局暂停。每日计划不会触发新的自动动作，自检不会解除暂停。',
      action: '准备就绪后明确点击继续，恢复执行与每日计划。'});
    else if (state.running && !state.paused) checks.push({id: 'execution', status: 'pass', label: '执行与每日计划',
      detail: '后台记录为运行中；实际进展与结果以任务步骤和可靠回执为准。'});
    else if (state.settings.scheduleEnabled) checks.push({id: 'execution', status: 'pass', label: '执行与每日计划',
      detail: '每日计划已开启，等待计划检查。后台、插件和投递浏览器须保持运行，到时仍需通过配置与网站检查。'});
    else checks.push({id: 'execution', status: 'warning', label: '执行与每日计划',
      detail: '当前未运行，每日计划也未开启。自检不会开始执行。',
      action: '准备就绪后启动执行，或在规则与计划中开启每日计划。'});
    for (const site of state.sites.filter(site => site.enabled && !site.skipped)) {
      const check = {id: 'site:' + site.id, label: '网站登录记录 · ' + site.name,
        status: 'warning', action: '前往网站准备，在投递浏览器中处理后重新检查。'};
      if (site.adapter !== 'local-v1') {
        check.detail = '此网站尚待适配，不能可靠判断登录。自检不会访问真实招聘网站。';
      } else if (!connected) {
        check.detail = '插件未连接，不能确认此网站在当前投递浏览器中的登录状态。';
      } else if (site.login?.profileId !== state.connection.profileId || !site.login?.checkedAt) {
        check.detail = '缺少属于当前投递浏览器的登录检查记录；其他浏览器或旧记录不能作为就绪依据。';
      } else if (site.login.status === 'account' || site.login.status === 'ready' &&
        (site.login.account !== site.expectedAccount || site.login.tenant !== site.tenant)) {
        check.status = 'fail'; check.detail = '已记录的申请账号或公司范围不符，请在当前投递浏览器核对。';
      } else if (site.login.status === 'ready') {
        check.status = 'pass';
        check.detail = '已记录属于当前投递浏览器的账号与公司范围检查。自检不会重新读取网站页面，执行前仍需核对。';
        delete check.action;
      } else {
        const labels = {login: '需要登录', expired: '登录已失效', verification: '需要人工验证', unknown: '账号状态待核实'};
        check.detail = (labels[site.login.status] || labels.unknown) + '。这是已有检查记录，自检不会代替网站登录检查。';
      }
      checks.push(check);
    }
    return {checkedAt: state.now, checks};
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const host = `127.0.0.1:${server.address().port}`, origin = `http://${host}`;
      if (req.headers.host !== host) throw new RequestError(403, '仅允许本机地址访问');
      const url = new URL(req.url, origin);
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) throw new RequestError(405, '不支持的请求方法');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new RequestError(403, '禁止跨站读取工作台');
        const route = staticFiles.get(url.pathname);
        if (!route) throw new RequestError(404, '找不到页面');
        let bytes = fs.readFileSync(path.join(ROOT, route[0]));
        if (url.pathname === '/') bytes = Buffer.from(bytes.toString('utf8').replace('__LOCAL_KEY__', key));
        res.writeHead(200, {'Content-Type': route[1]});
        res.end(req.method === 'HEAD' ? undefined : bytes); return;
      }
      const bridge = url.pathname.startsWith('/api/bridge/');
      const requestOrigin = req.headers.origin;
      const extension = extensionOrigin.exec(requestOrigin || '');
      if (bridge) {
        if (!extension) throw new RequestError(403, '仅允许配对插件访问执行接口');
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, X-Local-Key'});
          res.end(); return;
        }
      } else if ((requestOrigin && requestOrigin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
        throw new RequestError(403, '禁止跨站调用管理接口');
      }
      if (!keyMatches(req.headers['x-local-key'], key)) throw new RequestError(401, '请从本机工作台重新连接');
      if (!bridge && req.method === 'GET' && url.pathname === '/api/state') {
        const state = store.snapshot();
        if (state.resume) delete state.resume.file;
        json(res, 200, state); return;
      }
      if (!bridge && req.method === 'GET' && url.pathname === '/api/health') {
        json(res, 200, await health()); return;
      }
      if (req.method !== 'POST') throw new RequestError(405, '不支持的请求方法');
      // Browser mutations always carry Origin. Script/test callers must supply it explicitly.
      if (!bridge && requestOrigin !== origin) throw new RequestError(403, '管理操作缺少本机来源');
      const body = await readJSON(req);
      if (bridge) {
        const operation = url.pathname.slice('/api/bridge/'.length);
        if (['poll', 'heartbeat'].includes(operation)) {
          if (body.extensionId !== extension[1]) throw new RequestError(403, '插件身份与来源不一致');
        } else if (store.connection?.extensionId !== extension[1]) {
          throw new RequestError(403, '执行端尚未配对');
        }
        const operations = {
          poll: () => store.poll(body),
          heartbeat: () => ({ok: store.heartbeat(body)}),
          authorize: () => store.authorize(body),
          result: () => store.result(body)
        };
        if (!Object.hasOwn(operations, operation)) throw new RequestError(404, '找不到执行接口');
        json(res, 200, operations[operation]()); return;
      }
      if (url.pathname === '/api/action') {
        if (body.action === 'browser-open') {
          if (testMode) throw new RequestError(409, '测试服务不启动生产浏览器');
          if (closing) throw new RequestError(409, '后台正在停止，请等待停止完成');
          if (browserOpen) await browserOpen();
          else {
            if (!managedBrowser) throw new RequestError(409, '云端不启动生产浏览器；请使用隔离的托管浏览器检查');
            await managedBrowser.open();
          }
          json(res, 200, {ok: true, ready: true}); return;
        }
        json(res, 200, store.action(body)); return;
      }
      if (url.pathname === '/api/settings') store.setSettings(body);
      else if (url.pathname === '/api/profile') store.setProfile(body);
      else if (url.pathname === '/api/resume' || url.pathname === '/api/resume/extract') {
        if(url.pathname==='/api/resume')store.setResume(body);
        const resume=store.state.resume;
        if(!resume)throw new RequestError(400,'请先选择本机简历');
        if(/\.pdf$/i.test(resume.name)){
          const binding={sha256:resume.sha256,resumeVersion:resume.version,profileVersion:store.state.profile.version};
          const result=await extractResume(fs.readFileSync(insideRoot(resume.file)),resume.sha256);
          const extraction=store.saveResumeImport(result,binding);json(res,200,{ok:true,extraction});return;
        }
      }
      else if(url.pathname==='/api/resume/confirm'){const result=store.confirmResumeImport(body);json(res,200,{ok:true,...result});return;}
      else throw new RequestError(404, '找不到管理接口');
      json(res, 200, {ok: true});
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 400, {ok: false, error: error.status ? error.message : '操作未完成：' + error.message});
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  try {
    if (startFixture) fixture = await createFixture({dataDir: path.join(paths.data, 'fixture'), port: fixturePort, testMode, testKey});
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
    timer = setInterval(() => store.tick(), 1000); timer.unref();
  } catch (error) { await fixture?.close(); throw error; }
  return {server, store, fixture, url: `http://127.0.0.1:${server.address().port}`, close() {
    if (!closing) closing = (async () => {
      clearInterval(timer);
      // Stop creates the same durable hold as explicit pause. Re-closing an
      // already held service must not keep revising unchanged queued tasks.
      if (!store.state.manualPaused || !store.state.paused || store.state.running) store.pause();
      store.save();
      let browserError;
      try {if (browserClose) await browserClose(); else await managedBrowser?.close();} catch (error) {browserError = error;}
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await fixture?.close();
      if (browserError) throw browserError;
    })();
    return closing;
  }};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (flag === '--data-dir' && value) options.dataDir = insideRoot(value);
    else if (['--port', '--fixture-port'].includes(flag) && /^\d+$/.test(value || '')) options[flag === '--port' ? 'port' : 'fixturePort'] = Number(value);
    else throw new Error('支持 --data-dir、--port、--fixture-port；测试选项仅限导入 API');
  }
  const app = await createApp(options);
  console.log('本地后台和虚构招聘测试站已启动（仅 loopback）；真实网站尚待适配。');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0)));
}
