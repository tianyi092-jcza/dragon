// 本機磁碟上的物件桶（2026-11 用戶決定：編輯後台與玩家端都搬到自己的 VPS，
// 不再依賴 Cloudflare R2）。埠介面與 vps/r2client.mjs 逐方法相同，所以發布器、
// 在架指針 CAS、收據、程式歸檔、回收器一行都不用改：
//   get(key,{maxBytes}) → {bytes, headers:{etag,'content-type','last-modified'}} | null
//   putImmutable(key, bytes, contentType) → {sha256, byteLength} | null（已存在）
//   putControl(key, bytes, ifMatch) → boolean（CAS）
//   list(prefix, maxKeys) → string[]
//   remove(key) → 204 | 404
//
// etag 用 R2 的形狀 "＜md5＞"、last-modified 用檔案 mtime：這兩者進過
// content_distribution_events 的收據（rootETag／visibleAt），形狀不一致會被發布器
// 判成 REMOTE_GAP 並封鎖帳本。從 R2 遷移時保留 Last-Modified 就能讓收據繼續對得上。
import { createHash } from 'node:crypto';
import { mkdirSync, openSync, closeSync, writeSync, fsyncSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, lstatSync, rmdirSync, utimesSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

// 只回這兩種（R2 上實際存的也只有這兩種）：`.json` 是控制物件與清單，其餘都是
// 不可變位元組。vps/static-archive.mjs 的 stored() 與 vps/distribution-publisher.mjs
// 的 headers() 會逐字比對 content-type，按副檔名猜 image/png、text/javascript 會直接
// 判成 STATIC_ARCHIVE_INVALID。
const JSON_TYPE = 'application/json';
const BINARY_TYPE = 'application/octet-stream';
// 目錄 fsync 在 Linux 是必要的（改名要落盤），Windows 會明確回不支援的錯誤碼——
// 只在 Windows 容忍這幾個碼，其他平台照舊拋出。
function syncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    fsyncSync(fd);
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'ENOSYS', 'EINVAL', 'EISDIR'].includes(error?.code)) throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}
const etagOf = bytes => `"${createHash('md5').update(bytes).digest('hex')}"`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// 型別按副檔名猜是不夠的：程式歸檔把 `files/battle_maps.json` 這種檔案也當
// application/octet-stream 存（vps/static-archive.mjs 的 stored() 會逐字比對），所以
// 真實型別要跟物件一起落盤。放在 `.meta/<key>`（list() 跳過點開頭的目錄）。
const META_DIR = '.meta';
const fallbackType = key => key.endsWith('.json') ? JSON_TYPE : BINARY_TYPE;

// 鍵只允許相對、非空、非 . / .. 的分段：桶根之外一律拒絕（不是沙箱，是鍵形狀合約）。
function segments(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 1024) throw new TypeError('bucket key shape');
  const parts = key.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..' || part.includes('\\'))) throw new TypeError('bucket key shape');
  return parts;
}

export function createDiskBucket({ root, readOnly = false }) {
  if (typeof root !== 'string' || root.length === 0) throw new TypeError('bucket root required');
  const base = resolve(root);
  mkdirSync(base, { recursive: true });
  const pathOf = key => join(base, ...segments(key));
  const metaOf = key => join(base, META_DIR, ...segments(key));
  function readMeta(key) {
    try {
      const raw = JSON.parse(readFileSync(metaOf(key), 'utf8'));
      return typeof raw?.contentType === 'string' ? raw.contentType : null;
    } catch { return null; }
  }
  function writeMeta(key, contentType) {
    const target = metaOf(key);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, JSON.stringify({ contentType }));
  }
  const directoryOf = key => { const parts = segments(key); return join(base, ...parts.slice(0, -1)); };
  function statOf(key) {
    try { const value = lstatSync(pathOf(key)); return value.isFile() ? value : null; }
    catch (error) { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null; throw error; }
  }
  // 同目錄臨時檔 → fsync → 原子改名 → 目錄 fsync：半寫入的物件永不對外可見。
  function writeAtomic(key, bytes) {
    const directory = directoryOf(key), target = pathOf(key);
    mkdirSync(directory, { recursive: true });
    const temp = join(directory, `.${randomUUID()}.tmp`);
    let fd;
    try {
      fd = openSync(temp, 'wx', 0o600);
      for (let offset = 0; offset < bytes.length;) {
        const written = writeSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!Number.isSafeInteger(written) || written < 1) throw new Error('bucket short write');
        offset += written;
      }
      fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(temp, target);
      syncDirectory(directory);
    } finally {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temp); } catch { /* 已改名或從未建立 */ }
    }
  }
  function current(key) {
    const stat = statOf(key);
    if (!stat) return null;
    const bytes = readFileSync(pathOf(key));
    if (bytes.length !== stat.size) throw new Error('bucket object changed');
    return { bytes, stat };
  }
  return Object.freeze({
    get(key, { maxBytes = 64 * 1024 * 1024 } = {}) {
      const value = current(key);
      if (value === null) return null;
      if (value.bytes.length > maxBytes) throw new Error('bucket object too large');
      return {
        bytes: value.bytes,
        headers: { etag: etagOf(value.bytes), 'content-type': readMeta(key) ?? fallbackType(key), 'last-modified': value.stat.mtime.toUTCString() },
      };
    },
    putImmutable(key, bytes, contentType = 'application/octet-stream') {
      if (readOnly) throw new Error('bucket is read-only');
      const data = Buffer.from(bytes);
      if (statOf(key) !== null) return null;
      writeAtomic(key, data);
      writeMeta(key, contentType);
      return { sha256: sha256(data), byteLength: data.length, contentType };
    },
    putControl(key, bytes, ifMatch = null) {
      if (readOnly) throw new Error('bucket is read-only');
      const data = Buffer.from(bytes), prior = current(key);
      const currentEtag = prior === null ? null : etagOf(prior.bytes);
      if (ifMatch === null ? currentEtag !== null : currentEtag !== ifMatch) return false;
      writeAtomic(key, data);
      writeMeta(key, JSON_TYPE);
      return true;
    },
    list(prefix = '', maxKeys = 1000) {
      if (typeof prefix !== 'string') throw new TypeError('bucket prefix');
      if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) throw new TypeError('bucket list size');
      const out = [];
      const walk = (directory, relative) => {
        if (out.length >= maxKeys) return;
        let entries;
        try { entries = readdirSync(directory, { withFileTypes: true }); }
        catch (error) { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return; throw error; }
        for (const entry of entries) {
          if (out.length >= maxKeys) return;
          if (entry.name.startsWith('.')) continue;
          const key = relative === '' ? entry.name : `${relative}/${entry.name}`;
          if (entry.isDirectory()) { walk(join(directory, entry.name), key); continue; }
          if (entry.isFile() && key.startsWith(prefix)) out.push(key);
        }
      };
      // 只從 prefix 的目錄前綴開始走，避免整桶掃描。
      const parts = prefix.split('/').filter(part => part !== '');
      const startDir = join(base, ...parts.slice(0, Math.max(0, prefix.endsWith('/') ? parts.length : parts.length - 1)));
      const startKey = prefix.endsWith('/') ? parts.join('/') : parts.slice(0, -1).join('/');
      walk(startDir, startKey);
      return out.sort();
    },
    remove(key) {
      if (readOnly) throw new Error('bucket is read-only');
      const target = pathOf(key);
      try { lstatSync(target); }
      catch (error) { if (error?.code === 'ENOENT') return 404; throw error; }
      unlinkSync(target);
      try { unlinkSync(metaOf(key)); } catch { /* 沒有型別檔是合法的 */ }
      // 目錄空了就往上收掉，避免刪完留下大量空目錄。
      let directory = directoryOf(key);
      while (directory.startsWith(base + sep)) {
        try {
          if (readdirSync(directory).length > 0) break;
          rmdirSync(directory); directory = resolve(directory, '..');
        } catch { break; }
      }
      return 204;
    },
    // 只給遷移腳本用：把 R2 的 Last-Modified 帶過來，收據裡的 visibleAt 才不會變。
    setModified(key, date) {
      if (readOnly) throw new Error('bucket is read-only');
      const when = new Date(date);
      if (!Number.isFinite(when.getTime())) throw new TypeError('mtime required');
      utimesSync(pathOf(key), when, when);
    },
    etagOf,
    // 遷移／修補用：把既知型別寫進型別檔，不必重下載位元組。
    setContentType(key, contentType) {
      if (readOnly) throw new Error('bucket is read-only');
      if (typeof contentType !== 'string' || contentType.length === 0) throw new TypeError('content type required');
      writeMeta(key, contentType);
    },
    metaOf,
  });
}
