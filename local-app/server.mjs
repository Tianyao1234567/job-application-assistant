import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT, initializePaths, insideRoot} from './paths.mjs';
import {Store} from './model.mjs';
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
  browserOpen} = {}) {
  const paths = initializePaths(dataDir), store = new Store(paths, now ? {now} : {});
  const key = localKey(paths.data);
  let fixture, timer, browserProcess, closing;
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
          if (browserOpen) await browserOpen();
          else {
            if (process.platform !== 'win32') throw new RequestError(409, '云端不启动生产浏览器；请使用隔离的托管浏览器检查');
            if (!browserProcess || browserProcess.exitCode !== null) {
              browserProcess = spawn(process.execPath, [path.join(ROOT, 'scripts/browser.mjs')], {cwd: ROOT, stdio: 'ignore'});
              browserProcess.on('error', () => { browserProcess = null; });
            }
          }
          json(res, 200, {ok: true}); return;
        }
        json(res, 200, store.action(body)); return;
      }
      if (url.pathname === '/api/settings') store.setSettings(body);
      else if (url.pathname === '/api/profile') store.setProfile(body);
      else if (url.pathname === '/api/resume') store.setResume(body);
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
      clearInterval(timer); store.state.paused = true; store.state.running = false; store.save();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await fixture?.close();
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
