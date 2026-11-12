// 共用画像庫讀取器（B 決策，V2 簡化）：禁上傳，武將一對一取自 `web/kao`
// manifest（獨立 lane 雙向核對清單與磁碟）。發版只記 ID＋SHA，玩家經 R2
// `kao/<file>` 取數；pack 不嵌位元組。無 SQL 表、無解碼、無上傳管線。
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { fail } from './security.js';

const BY_ID = new Map(KAO_MANIFEST.map(entry => [entry.id, entry]));
const LIST = Object.freeze(KAO_MANIFEST.map(entry => Object.freeze({
  assetId: entry.id, sha256: entry.sha256, byteLength: entry.bytes, mime: 'image/png',
})));

// Collect optional presentation references without turning malformed fields
// into missing dependencies. Null portraitKey means no override; absent native
// portrait remains absent for partial authoring records (not runtime admission).
export function collectPortraitIds(generals) {
  if (!Array.isArray(generals)) { fail(500, 'PLAY_PORTRAIT_CORRUPT'); }
  const ids = [];
  for (const general of generals) {
    if (!general || typeof general !== 'object' || Array.isArray(general)) { fail(500, 'PLAY_PORTRAIT_CORRUPT'); }
    if (Object.hasOwn(general, 'portrait')) {
      const id = general.portrait;
      if (!Number.isSafeInteger(id) || id < 0 || Object.is(id, -0)) { fail(500, 'PLAY_PORTRAIT_CORRUPT'); }
      ids.push(id);
    }
    if (Object.hasOwn(general, 'portraitKey') && general.portraitKey !== null) {
      if (typeof general.portraitKey !== 'string') { fail(500, 'PLAY_PORTRAIT_CORRUPT'); }
      ids.push(general.portraitKey);
    }
  }
  return ids;
}

export class GamePortraits {
  #reserved;
  constructor({ reservedIds = [] } = {}) {
    if (!Array.isArray(reservedIds)) { throw new TypeError('reserved id list required'); }
    this.#reserved = new Set(reservedIds);
  }
  list() { return LIST; }
  get(assetId) {
    const entry = BY_ID.get(assetId);
    if (!entry || this.#reserved.has(assetId)) { fail(404, 'PORTRAIT_NOT_FOUND'); }
    return Object.freeze({ assetId: entry.id, sha256: entry.sha256, byteLength: entry.bytes, mime: 'image/png' });
  }
  // 發版凍結：只收錄本局實際使用的 ID（數字 byte 轉字串＋portraitKey），
  // 無位元組；serve 端經 R2 取數時以 sha256 核對。
  forPublish(usedIds) {
    if (!Array.isArray(usedIds)) { fail(500, 'PLAY_PORTRAIT_CORRUPT'); }
    const seen = new Set(), rows = [];
    for (const rawId of usedIds) {
      // Bad reference types are corruption, not absent dependencies. Do not
      // silently omit them when constructing an immutable publication list.
      if (typeof rawId !== 'string' && (typeof rawId !== 'number' || !Number.isSafeInteger(rawId) || rawId < 0 || Object.is(rawId, -0))) { fail(500, 'PLAY_PORTRAIT_CORRUPT'); }
      const assetId = typeof rawId === 'number' ? String(rawId) : rawId;
      // Resource decision: 255 is an ordinary shared ID, not an omitted dependency.
      if (seen.has(assetId)) { continue; }
      seen.add(assetId);
      rows.push(this.get(assetId));
    }
    return Object.freeze(rows);
  }
}
