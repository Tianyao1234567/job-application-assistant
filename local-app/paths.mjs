import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export function insideRoot(value) {
  const absolute = path.resolve(value);
  const relative = path.relative(ROOT, absolute);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) return absolute;
  throw new Error('运行路径必须位于项目目录内');
}
export const RUNTIME = insideRoot(path.join(ROOT, '.runtime'));
export function initializePaths(dataDir = path.join(RUNTIME, 'data')) {
  const paths = {
    root: ROOT, runtime: RUNTIME, data: insideRoot(dataDir),
    tmp: insideRoot(path.join(RUNTIME, 'tmp')), cache: insideRoot(path.join(RUNTIME, 'cache')),
    browsers: insideRoot(path.join(RUNTIME, 'browsers')),
    productionProfile: insideRoot(path.join(RUNTIME, 'browser', 'production')),
    downloads: insideRoot(path.join(RUNTIME, 'downloads')), logs: insideRoot(path.join(RUNTIME, 'logs'))
  };
  for (const value of Object.values(paths)) fs.mkdirSync(value, {recursive: true});
  process.env.TMP = process.env.TEMP = process.env.TMPDIR = paths.tmp;
  process.env.PLAYWRIGHT_BROWSERS_PATH = paths.browsers;
  process.env.npm_config_cache = paths.cache;
  return paths;
}
