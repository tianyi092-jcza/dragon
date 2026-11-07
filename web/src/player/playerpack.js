// Immutable formal-session bytes -> owned Blob URLs. No Trial capability, engine
// execution, storage, latest-release lookup or built-in-resource fallback.
import { ASSET_TYPES, MAX_METADATA_BYTES, MAX_RESOURCE_BYTES, isDigest, isChapterId, mapLimited, parseJSON, sha256, validateIdentity } from './runtimecontract.js';
// 資源併發上限：鏈路每趟 0.7–1.5 s，6 路剛好把 173 個資源壓到十幾秒且不打爆瀏覽器連線池。
const PACK_PARALLEL = 6;
import { PlayerReaderError } from './playerclient.js';
const seasons = ['spring', 'summer', 'autumn', 'winter'];
const rules = ['terrain', 'roadGraph', 'roadCost', 'roadOffset'];
const minis = ['minimapBase', 'minimapLarge'];
const roles = { terrain: 'rules-initial-terrain', roadGraph: 'native-road-v2', roadCost: 'legacy-grid-visual', roadOffset: 'legacy-grid-visual', minimapBase: 'automatic-minimap', minimapLarge: 'automatic-minimap' };
const fail = code => { throw new PlayerReaderError(code); };
const check = value => { if (!value) fail('PLAYER_PACK_INVALID'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function freeze(value) {
  const pending = [value];
  while (pending.length) {
    const next = pending.pop();
    if (object(next) || Array.isArray(next)) {
      for (const item of Object.values(next)) if (item !== null && typeof item === 'object') pending.push(item);
      Object.freeze(next);
    }
  }
  return value;
}
function declaration(entry) {
  check(object(entry) && isDigest(entry.sha256) && Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0 && entry.byteLength <= MAX_RESOURCE_BYTES);
}
export async function loadPlayerPack({ session, compilerRevision, maxTotalBytes, readStatic, urls = globalThis.URL }) {
  if (typeof session?.read !== 'function' || typeof session?.state !== 'function' || typeof compilerRevision !== 'string' || !compilerRevision || !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || typeof readStatic !== 'function' || typeof urls?.createObjectURL !== 'function' || typeof urls?.revokeObjectURL !== 'function') throw new TypeError('fixed session, compiler pin, explicit byte budget and trusted static/URL ports required');
  const identityKeys = ['gameId', 'releaseId', 'ordinal', 'revision', 'sourceDigest', 'chapterId', 'chapters', 'manifestDigest', 'name', 'publishedAt'];
  const identity = structuredClone(Object.fromEntries(identityKeys.map(key => [key, session.identity?.[key]])));
  try { validateIdentity(identity); } catch { fail('PLAYER_PACK_INVALID'); }
  check(Array.isArray(identity.chapters) && identity.chapters.length > 0 && identity.chapters.every(id => isChapterId(id, identity.gameId)) && new Set(identity.chapters).size === identity.chapters.length && identity.chapters.includes(identity.chapterId) && isDigest(identity.manifestDigest));
  const createURL = urls.createObjectURL.bind(urls), revokeURL = urls.revokeObjectURL.bind(urls);
  let total = 0, closed = false;
  const owned = new Set();
  function current() {
    if (closed) fail('PLAYER_PACK_CLOSED');
    const state = session.state();
    if (state === 'deleted') throw new PlayerReaderError('GAME_DELETED', 410);
    if (state !== 'active') fail('PLAYER_SESSION_CLOSED');
  }
  function close() {
    closed = true; let failure;
    for (const url of owned) {
      try { revokeURL(url); owned.delete(url); } catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
  }
  async function accept(result, type, descriptor, limit = MAX_RESOURCE_BYTES) {
    current();
    check(result?.bytes instanceof Uint8Array && result.bytes.length > 0 && result.bytes.length <= limit && result.contentType === type);
    if (result.bytes.length > maxTotalBytes - total) fail('PLAYER_PACK_BUDGET');
    const bytes = new Uint8Array(result.bytes); total += bytes.length;
    const digest = await sha256(bytes); current();
    check(isDigest(result.sha256) && result.sha256 === digest);
    if (descriptor) check(bytes.length === descriptor.byteLength && digest === descriptor.sha256);
    return bytes;
  }
  async function read(role, type, descriptor, limit) {
    current(); const result = await session.read(role); current();
    return accept(result, type, descriptor, limit);
  }
  try {
    const manifestBytes = await read('manifest', 'application/json', null, MAX_METADATA_BYTES);
    check(await sha256(manifestBytes) === identity.manifestDigest); current();
    let manifest;
    try { manifest = parseJSON(manifestBytes); } catch { fail('PLAYER_PACK_INVALID'); }
    check(manifest?.schemaVersion === 1 && manifest.buildFormat === 'studio-app-2' && manifest.compilerRevision === compilerRevision && !Object.hasOwn(manifest, 'scope'));
    check(manifest.identity?.gameId === identity.gameId && manifest.identity.draftRevision === identity.revision && manifest.identity.sourceDigest === identity.sourceDigest && JSON.stringify(manifest.chapters) === JSON.stringify(identity.chapters));
    check(manifest.world?.id === identity.gameId + '-world' && manifest.world.revision === identity.sourceDigest && manifest.world.width === 384 && manifest.world.height === 256 && manifest.world.tileSize === 16);
    const declared = [];
    for (const [entries, ids] of [[manifest.assets, rules], [manifest.minimapAssets, minis]]) {
      check(Array.isArray(entries) && entries.length === ids.length && new Set(entries.map(e => e?.assetId)).size === ids.length);
      for (const entry of entries) {
        declaration(entry); check(ids.includes(entry.assetId) && entry.role === roles[entry.assetId]);
        check(entry.url === `/api/trial-asset?game=${encodeURIComponent(identity.gameId)}&revision=${identity.revision}&digest=${identity.sourceDigest}&asset=${entry.assetId}`);
        declared.push({ role: 'asset:' + entry.assetId, type: ASSET_TYPES[entry.assetId], entry });
      }
    }
    check(Array.isArray(manifest.portraits) && manifest.portraits.length <= 2048 && new Set(manifest.portraits.map(e => e?.assetId)).size === manifest.portraits.length);
    for (const entry of manifest.portraits) {
      declaration(entry); check(typeof entry.assetId === 'string' && /^p?[0-9]{1,6}$/.test(entry.assetId) && entry.role === 'game-portrait' && entry.mime === 'image/png' && entry.url === `kao/${entry.assetId}.png`);
      declared.push({ role: 'asset:' + entry.assetId, type: 'image/png', entry });
    }
    const visual = []; let prefix;
    check(object(manifest.visualAssets) && Object.keys(manifest.visualAssets).sort().join(',') === 'seasonAtlases,seasons');
    for (const [group, stem] of [['seasonAtlases', 'map_atlas_'], ['seasons', 'map_tiles_']]) {
      const entries = manifest.visualAssets[group];
      check(object(entries) && Object.keys(entries).sort().join(',') === [...seasons].sort().join(','));
      for (const season of seasons) {
        const entry = entries[season]; declaration(entry);
        const match = /^content\/builtin\/compiled\/(map-2-[a-f0-9]{64})\/([^/]+)$/.exec(entry.path);
        check(match && entry.url === entry.path && match[2] === stem + season + '.png' && (prefix === undefined || prefix === match[1]));
        prefix = match[1]; visual.push({ role: group + ':' + season, type: 'image/png', entry });
      }
    }
    // Reject declared aggregate oversize before reading chapter/assets/static.
    const declaredBytes = [...declared, ...visual].reduce((sum, value) => sum + value.entry.byteLength, 0);
    if (declaredBytes > maxTotalBytes - total) fail('PLAYER_PACK_BUDGET');
    const chapterBytes = await read('chapter:' + identity.chapterId, 'application/json');
    let chapter;
    try { chapter = parseJSON(chapterBytes); } catch { fail('PLAYER_PACK_INVALID'); }
    check(object(chapter));
    if (declaredBytes > maxTotalBytes - total) fail('PLAYER_PACK_BUDGET');
    // 併發抓取：一章可達 173 個資源，逐個 await 在長鏈路上要幾分鐘（服務端 3 ms/個）。
    // 結果按輸入索引回填，資源順序與逐個版本完全一致；current() 仍在每個請求前後檢查。
    const declaredReads = await mapLimited(declared, PACK_PARALLEL, item => read(item.role, item.type, item.entry));
    const visualReads = await mapLimited(visual, PACK_PARALLEL, async item => {
      current(); const value = await readStatic(item.entry.path, { maxBytes: item.entry.byteLength }); current();
      return accept(value, item.type, item.entry);
    });
    const resources = [...declared.map((item, index) => ({ ...item, bytes: declaredReads[index] })),
      ...visual.map((item, index) => ({ ...item, bytes: visualReads[index] }))];
    const resourceURLs = {};
    for (const item of resources) {
      current(); const url = createURL(new Blob([item.bytes], { type: item.type }));
      check(typeof url === 'string' && url.startsWith('blob:') && !owned.has(url));
      owned.add(url); current(); resourceURLs[item.role] = url;
    }
    // Source manifest stays unchanged (its legacy URL strings are never fetched).
    // Formal identity is separate: trialSnapshotId is not an admission capability.
    return Object.freeze({ identity: freeze(identity), manifest: freeze(manifest), chapter: freeze(chapter), resourceURLs: Object.freeze(resourceURLs), byteLength: total, assertCurrent: current, close });
  } catch (error) { close(); throw error; }
}
