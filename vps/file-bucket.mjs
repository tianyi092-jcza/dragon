// Immutable private/installed filesystem port. A same-directory temporary file
// is fully written and synced before hard-link installation (no overwrite), then
// directory-synced. An interrupted confirmation is NOT a rollback assertion.
// Linux directory fsync is mandatory; Windows's explicit unsupported errors are
// tolerated only for local verification. Root/ancestors must not be symlinks.
// This is not a sandbox against another privileged/same-uid filesystem writer:
// production owns a private directory, and callers still verify bytes/SHA.
import { constants, openSync, closeSync, writeSync, fsyncSync, mkdirSync, lstatSync, fstatSync, readdirSync, createReadStream, linkSync, unlinkSync, rmdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve, sep, parse } from 'node:path';
import { Readable } from 'node:stream';

const KEY = /^(private\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})|installed\/([A-Za-z0-9_.-]{1,128}))\/([a-f0-9]{64})$/;
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
function statOrMissing(path) {
  try { return lstatSync(path); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
function syncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, READ_FLAGS | (constants.O_DIRECTORY ?? 0));
    fsyncSync(fd);
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'ENOSYS', 'EINVAL', 'EISDIR'].includes(error?.code)) throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}
function directory(path, create = false) {
  const absolute = resolve(path), root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    const parent = current; current = join(current, part);
    let stat = statOrMissing(current);
    if (!stat && create) {
      try { mkdirSync(current, { mode: 0o700 }); }
      catch (error) { if (error?.code !== 'EEXIST') throw error; }
      stat = lstatSync(current); syncDirectory(parent);
    }
    if (!stat) return false;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('bucket directory unsafe');
  }
  return true;
}
function regularFile(path) {
  const stat = statOrMissing(path);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error('bucket object unsafe');
  return stat;
}

export class FileBucket {
  #root;
  constructor({ root }) {
    if (typeof root !== 'string' || !root) throw new TypeError('root directory required');
    this.#root = resolve(root);
    directory(this.#root, true);
  }
  #path(key) {
    const match = typeof key === 'string' ? KEY.exec(key) : null;
    if (!match || match[3] === '.' || match[3] === '..') throw new TypeError('bucket key shape');
    const parts = match[2] !== undefined ? ['private', match[2]] : ['installed', match[3]];
    const dir = resolve(this.#root, ...parts);
    const full = join(dir, `${match[4]}.bin`);
    if (!full.startsWith(this.#root + sep)) throw new TypeError('bucket key escape');
    return { full, dir, hash: match[4] };
  }
  async put(key, bytes, options = {}) {
    const { full, dir, hash } = this.#path(key);
    if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer)) throw new TypeError('bucket bytes');
    if (options?.onlyIf !== undefined && (!(options.onlyIf instanceof Headers) ||
        options.onlyIf.get('If-None-Match') !== '*' || [...options.onlyIf].length !== 1)) throw new TypeError('bucket condition');
    directory(dir, true);
    // Unconditional calls also never overwrite immutable private keys.
    if (regularFile(full)) { syncDirectory(dir); return null; }
    const temp = join(dir, `.${hash}.${randomUUID()}.tmp`);
    let fd, ownsTemp = false;
    try {
      fd = openSync(temp, 'wx', 0o600); ownsTemp = true;
      for (let offset = 0; offset < bytes.byteLength;) {
        const written = writeSync(fd, bytes, offset, bytes.byteLength - offset, offset);
        if (!Number.isSafeInteger(written) || written < 1) throw new Error('bucket short write');
        offset += written;
      }
      fsyncSync(fd); closeSync(fd); fd = undefined;
      let created = true;
      try { linkSync(temp, full); }
      catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        if (!regularFile(full)) throw new Error('bucket install disappeared');
        created = false;
      }
      syncDirectory(dir);
      return created ? {} : null;
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (ownsTemp) { unlinkSync(temp); syncDirectory(dir); }
    }
  }
  async get(key) {
    let path;
    try { path = this.#path(key); } catch { return null; }
    if (!directory(path.dir)) return null;
    const stat = regularFile(path.full);
    if (!stat) return null;
    let stream;
    return {
      key, size: stat.size,
      get body() {
        if (stream) return stream;
        if (!directory(path.dir)) throw new Error('bucket object disappeared');
        regularFile(path.full);
        const fd = openSync(path.full, READ_FLAGS);
        try {
          const actual = fstatSync(fd);
          if (!actual.isFile() || actual.dev !== stat.dev || actual.ino !== stat.ino || actual.size !== stat.size) throw new Error('bucket object changed');
          stream = Readable.toWeb(createReadStream(path.full, { fd, autoClose: true }));
          return stream;
        } catch (error) { closeSync(fd); throw error; }
      },
      arrayBuffer() { return new Response(this.body).arrayBuffer(); },
    };
  }
  // 刪除遊戲後的私有位元組回收（用戶決定 2026-11：刪除＝徹底清除）。只允許 private/：
  // installed/ 是共享的已安裝底層資源，刪掉會讓之後的複製在讀源時必失敗。
  async remove(key) {
    const match = typeof key === 'string' ? KEY.exec(key) : null;
    if (!match || match[2] === undefined) throw new TypeError('only private objects are removable');
    const { full, dir } = this.#path(key);
    if (!directory(dir) || !regularFile(full)) return false;
    unlinkSync(full); syncDirectory(dir);
    // 目錄空了就一併移除，否則每刪一個遊戲都留一個 46 MB 的空殼。
    try {
      if (readdirSync(dir).length === 0) { rmdirSync(dir); syncDirectory(join(this.#root, 'private')); }
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') throw error;
    }
    return true;
  }
  async list({ prefix = '' } = {}) {
    if (typeof prefix !== 'string') throw new TypeError('bucket prefix');
    const out = [];
    if (!directory(this.#root)) throw new Error('bucket root disappeared');
    for (const namespace of ['private', 'installed']) {
      const base = join(this.#root, namespace);
      if (!directory(base)) continue;
      for (const name of readdirSync(base)) {
        if (!KEY.test(`${namespace}/${name}/${'0'.repeat(64)}`) || name === '.' || name === '..') continue;
        const dir = join(base, name);
        if (!directory(dir)) throw new Error('bucket directory disappeared');
        for (const file of readdirSync(dir)) {
          if (!/^[a-f0-9]{64}\.bin$/.test(file)) continue;
          const key = `${namespace}/${name}/${file.slice(0, -4)}`;
          if (!key.startsWith(prefix)) continue;
          const stat = regularFile(join(dir, file));
          if (!stat) throw new Error('bucket object disappeared');
          out.push({ key, size: stat.size });
        }
      }
    }
    out.sort((a, b) => {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return 0;
    });
    return { objects: out };
  }
}
