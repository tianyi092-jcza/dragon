// Public transport contract, not a game-rule or compiler admission certificate.
// Logical keys never include a test bucket prefix. No arbitrary client key reads.
export const MAX_METADATA_BYTES = 2 * 1024 * 1024;
export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
export const isGameId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
// Source chapter IDs stay unchanged. A scoped ID belongs to this exact game;
// do not widen release IDs or signing-key IDs, or accept URL-encoded aliases.
export function isChapterId(value, gameId) {
  return isGameId(gameId) && (isId(value) || (typeof value === 'string' && value.startsWith(`${gameId}#`) && isId(value.slice(gameId.length + 1))));
}
export const isOrdinal = value => typeof value === 'string' && /^1\.(0|[1-9][0-9]{0,30})$/.test(value);
export const isRevision = value => typeof value === 'string' && /^[1-9][0-9]{0,30}$/.test(value);
export const ASSET_TYPES = Object.freeze({ terrain: 'application/octet-stream', roadGraph: 'application/json', roadCost: 'application/octet-stream', roadOffset: 'application/json', minimapBase: 'image/png', minimapLarge: 'image/png' });
// 有界併發：發布遊戲一章可達 173 個資源、章節列表要逐章換票，全部逐個 await 在長鏈路上
// 要幾分鐘（服務端本身 3 ms/個）。結果按輸入索引回填，呼叫端仍保有順序語意。
export async function mapLimited(items, limit, worker) {
  if (!Array.isArray(items) || typeof worker !== 'function' || !Number.isSafeInteger(limit) || limit < 1 || limit > 32)
    throw new TypeError('bounded concurrency required');
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    for (let index = next++; index < items.length; index = next++) results[index] = await worker(items[index], index);
  };
  // 全部通道都落定才回報失敗：否則一個 worker 出錯時，其他仍在飛的請求（及其 session）
  // 會在呼叫端看到錯誤之後才收尾，留下「還沒關」的中間態。
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, run));
  const failed = outcomes.find(outcome => outcome.status === 'rejected');
  if (failed) throw failed.reason;
  return results;
}
export function requireValue(condition, code = 'RUNTIME_CORRUPT') {
  if (!condition) { throw new Error(code); }
}
export function parseJSON(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (cause) { throw new Error('RUNTIME_CORRUPT', { cause }); }
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function validReference(ref, max = MAX_RESOURCE_BYTES) {
  return ref && typeof ref.key === 'string' && isDigest(ref.sha256) && Number.isSafeInteger(ref.byteLength) && ref.byteLength > 0 && ref.byteLength <= max;
}
export function validateIdentity(value) {
  requireValue(value && isGameId(value.gameId) && isId(value.releaseId) && isOrdinal(value.ordinal) && isRevision(value.revision) && isDigest(value.sourceDigest));
}
export function runtimeBase(identity) {
  validateIdentity(identity);
  // A failed pre-commit candidate must not occupy another attempt's ordinal.
  // The authority must retain one releaseId for an exact retry, and allocate a
  // distinct ID for a new candidate; path syntax alone is not that authority.
  return `artifacts/${identity.gameId}/${identity.ordinal}/${identity.releaseId}/`;
}
export function validateRuntimeReference(identity, ref) {
  const base = runtimeBase(identity);
  requireValue(validReference(ref, MAX_METADATA_BYTES) && ref.key === `${base}runtime-${ref.sha256}.json`);
}
export function validateIndex(index) {
  const base = runtimeBase(index);
  requireValue(index.version === 1 && Array.isArray(index.chapters) && index.chapters.length > 0 && index.chapters.every(chapter => isChapterId(chapter, index.gameId)) && new Set(index.chapters).size === index.chapters.length);
  // 章節清單（名稱／日期／勢力）是可選元資料：發佈時寫進索引，玩家端章節窗與勢力窗都零額外請求。
  // 舊版本（或精簡檔）沒有這個欄位，客戶端退回逐章取資料。
  if (index.chapterIndex !== undefined) {
    requireValue(Array.isArray(index.chapterIndex) && index.chapterIndex.length === index.chapters.length);
    const seen = new Set();
    for (const row of index.chapterIndex) {
      requireValue(row !== null && typeof row === 'object' && !Array.isArray(row));
      requireValue(isChapterId(row.chapterId, index.gameId) && index.chapters.includes(row.chapterId) && !seen.has(row.chapterId));
      seen.add(row.chapterId);
      requireValue(typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 64);
      requireValue(row.start !== null && typeof row.start === 'object' && ['year', 'month', 'day'].every(key => Number.isSafeInteger(row.start[key])));
      requireValue(Array.isArray(row.factions) && row.factions.length <= 64);
      for (const faction of row.factions) {
        requireValue(faction !== null && typeof faction === 'object');
        requireValue(['monarch', 'advisor', 'capital'].every(key => typeof faction[key] === 'string' && faction[key].length <= 64));
        requireValue(Number.isSafeInteger(faction.nGenerals) && faction.nGenerals >= 0 && Number.isSafeInteger(faction.nCities) && faction.nCities >= 0);
      }
    }
  }
  requireValue(index.resources && typeof index.resources === 'object' && !Array.isArray(index.resources));
  const entries = Object.entries(index.resources);
  requireValue(entries.length <= 2048 && Object.hasOwn(index.resources, 'manifest'));
  for (const chapter of index.chapters) { requireValue(Object.hasOwn(index.resources, `chapter:${chapter}`)); }
  for (const [role, ref] of entries) {
    requireValue(validReference(ref));
    if (role === 'manifest') {
      requireValue(ref.key === `${base}manifest.json` && ref.contentType === 'application/json' && ref.byteLength <= MAX_METADATA_BYTES);
    } else if (role.startsWith('chapter:')) {
      const chapter = role.slice(8);
      // R2 keys are opaque strings: '#' is literal here. Only the S3 HTTP
      // signer encodes path segments; query callers encode the role once.
      requireValue(index.chapters.includes(chapter) && ref.key === `${base}chapters/${chapter}.json` && ref.contentType === 'application/json');
    } else if (role.startsWith('asset:')) {
      const id = role.slice(6);
      if (Object.hasOwn(ASSET_TYPES, id)) {
        requireValue(ref.key === `${base}${ref.sha256}` && ref.contentType === ASSET_TYPES[id]);
      } else {
        // Shared library IDs include both DOS byte names and p-prefixed template
        // names. This is path syntax, not membership: the frozen index supplies
        // the exact declared ID, hash and length, and the reader checks all three.
        requireValue(/^p?[0-9]{1,6}$/.test(id) && ref.key === `kao/${id}.png` && ref.contentType === 'image/png');
      }
    } else { throw new Error('RUNTIME_CORRUPT'); }
  }
  return index;
}
export function sameIdentity(a, b) {
  return ['gameId', 'releaseId', 'ordinal', 'revision', 'sourceDigest'].every(key => a?.[key] === b?.[key]);
}
