#!/usr/bin/env node
/** Optional static release packaging; no compilation or game-data mutation. */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'web');
const destination = join(root, 'dist');
const excluded = new Set(['demo.html', 'road_graph_probe.json', 'road_search_probe.json',
  'grf/ui/battle_symbols_grid.png']);
function include(path) {
  if (excluded.has(path) || /(^|\/)[.]/.test(path)) return false;
  if (/\.(log|psd|npy|pyc)$/i.test(path) || path.endsWith('logs_webserver.txt')) return false;
  if (/^(capture|grf\/uiprobe)\//.test(path)) return false;
  if (path.startsWith('grf/music/')) {
    return path === 'grf/music/playback.json' || /^grf\/music\/loops\/[^/]+\.flac$/.test(path);
  }
  if (path.startsWith('grf/sfx/')) return /^grf\/sfx\/ynsound-record(3|13)\.wav$/.test(path);
  return true;
}
const files = [];
function collect(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed: ${relative}`);
    if (entry.isDirectory()) collect(absolute, `${relative}/`);
    else if (include(relative)) {
      const size = lstatSync(absolute).size;
      if (size > 25 * 1024 * 1024) throw new Error(`Exceeds 25 MiB: ${relative}`);
      files.push({ relative, absolute, size });
    }
  }
}
collect(source);
if (files.length > 20000) throw new Error('Exceeds conservative Pages 20,000-file limit');
const names = files.map(file => file.relative.toLowerCase());
if (new Set(names).size !== names.length) throw new Error('Case-insensitive path collision');
// Never remove an arbitrary user path: the output is fixed to this repository's dist/.
if (existsSync(destination) && lstatSync(destination).isSymbolicLink()) throw new Error('dist must not be a symlink');
rmSync(destination, { recursive: true, force: true });
for (const file of files) {
  const target = join(destination, file.relative);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(file.absolute, target);
}
console.log(`Prepared dist/: ${files.length} files, ${(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)} MiB`);
