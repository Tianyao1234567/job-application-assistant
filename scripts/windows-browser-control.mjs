import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// Both the dashboard and CMD use the same locked, exact-owner PowerShell entry.
// Keep child output private: it can contain local paths and dependency diagnostics.
export function createWindowsBrowserControl() {
  let opening, closing;
  function run(close) {
    if (process.platform !== 'win32') return Promise.reject(new Error('BROWSER_WINDOWS_REQUIRED: 此入口仅用于 Windows 项目专用浏览器。'));
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(root, 'scripts', 'open-browser.ps1'), ...(close ? ['-Close'] : [])],
      {cwd: root, windowsHide: true, stdio: 'ignore'});
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error(close ? 'BROWSER_CLOSE_TIMEOUT: 项目浏览器未正常关闭，请保留数据后检查。' :
          'BROWSER_READY_TIMEOUT: 项目浏览器或扩展尚未就绪，请检查 Node.js、锁定浏览器依赖及项目日志。'));
      }, close ? 32000 : 42000);
      child.once('error', () => finish(new Error('BROWSER_CONTROL_FAILED: 无法运行项目浏览器管理入口。')));
      child.once('exit', code => finish(code === 0 ? undefined : new Error(close ?
        'BROWSER_CLOSE_FAILED: 项目浏览器未正常关闭，请保留数据后检查。' :
        'BROWSER_OPEN_FAILED: 浏览器未就绪，请检查 Node.js、锁定 Playwright、Chromium 及项目日志。')));
    });
  }
  return {
    open() {
      if (closing) return Promise.reject(new Error('BROWSER_CLOSING: 项目正在停止。'));
      if (!opening) opening = run(false).finally(() => {opening = undefined;});
      return opening;
    },
    close() {
      if (!closing) closing = (async () => {await opening?.catch(() => {}); await run(true);})();
      return closing;
    }
  };
}
