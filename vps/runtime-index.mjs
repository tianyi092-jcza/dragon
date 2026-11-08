// Freeze a role allowlist alongside a committed pack. Old indexes/bytes are
// never overwritten or pruned on update/unlist (user decision A).
import { createHash } from 'node:crypto';
import { ASSET_TYPES, MAX_METADATA_BYTES, parseJSON, requireValue, runtimeBase, validateIndex } from '../reader/runtimecontract.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function buildRuntimeIndex(pin, release, pack, chapters, assets) {
  const identity = { gameId: pin.gameId, releaseId: release?.release_id, ordinal: pin.ordinal, revision: pin.revision, sourceDigest: pin.sourceDigest };
  const base = runtimeBase(identity);
  requireValue(release.game_id === pin.gameId && release.ordinal === pin.ordinal && release.draft_revision === pin.revision && release.source_digest === pin.sourceDigest);
  requireValue(pack && pack.revision === pin.revision && pack.source_digest === pin.sourceDigest);
  const manifestBytes = Buffer.from(pack.manifest_json);
  requireValue(manifestBytes.length <= MAX_METADATA_BYTES);
  const manifest = parseJSON(manifestBytes);
  requireValue(manifest?.buildFormat === 'studio-app-2' && manifest.schemaVersion === 1 && manifest.identity?.gameId === pin.gameId && manifest.identity?.draftRevision === pin.revision && manifest.identity?.sourceDigest === pin.sourceDigest);
  requireValue(Array.isArray(pin.chapters) && JSON.stringify(manifest.chapters) === JSON.stringify(pin.chapters));
  const resources = {}, files = [], dependencies = [];
  const add = (role, key, bytes, contentType) => {
    requireValue(!Object.hasOwn(resources, role));
    if (contentType === 'application/json') { parseJSON(bytes); }
    const ref = { key, sha256: sha(bytes), byteLength: bytes.length, contentType };
    resources[role] = ref;
    files.push({ key, bytes, contentType });
  };
  add('manifest', `${base}manifest.json`, manifestBytes, 'application/json');
  requireValue(chapters.length === pin.chapters.length);
  for (const row of chapters) {
    requireValue(pin.chapters.includes(row.chapter_id));
    add(`chapter:${row.chapter_id}`, `${base}chapters/${row.chapter_id}.json`, Buffer.from(row.state_json), 'application/json');
  }
  requireValue(Array.isArray(manifest.assets) && Array.isArray(manifest.minimapAssets) && Array.isArray(manifest.portraits));
  const declared = [...manifest.assets, ...manifest.minimapAssets];
  requireValue(declared.length === assets.length && new Set(declared.map(entry => entry.assetId)).size === declared.length);
  for (const row of assets) {
    const entry = declared.find(item => item.assetId === row.asset_id);
    const bytes = Buffer.from(row.bytes);
    requireValue(entry && Object.hasOwn(ASSET_TYPES, row.asset_id) && sha(bytes) === row.sha256 && bytes.length === row.byte_length && row.sha256 === entry.sha256 && row.byte_length === entry.byteLength, 'asset corrupt');
    requireValue(entry.url === `/api/trial-asset?game=${encodeURIComponent(pin.gameId)}&revision=${pin.revision}&digest=${pin.sourceDigest}&asset=${row.asset_id}`);
    add(`asset:${row.asset_id}`, `${base}${row.sha256}`, bytes, ASSET_TYPES[row.asset_id]);
  }
  for (const entry of manifest.portraits) {
    const role = `asset:${entry.assetId}`;
    requireValue(!Object.hasOwn(resources, role) && entry.role === 'game-portrait' && entry.mime === 'image/png' && entry.url === `kao/${entry.assetId}.png`);
    const ref = { key: entry.url, sha256: entry.sha256, byteLength: entry.byteLength, contentType: entry.mime };
    resources[role] = ref;
    dependencies.push(ref); // Existing immutable shared library; never PUT/DELETE kao/ here.
  }
  // Prepared arrays and SQL cursors need not have the same enumeration order.
  // Canonicalize only this role map, never chapter order or the payload bytes.
  const canonicalResources = Object.fromEntries(Object.keys(resources).sort().map(role => [role, resources[role]]));
  // 章節清單（名稱／日期／勢力）：發佈時寫進索引，玩家端章節窗與勢力窗就都是零額外請求，
  // 不必再逐章換票讀 124 KB 的章節 JSON。欄位語義與 startmenu.js 的 _factionRows 一致。
  // 只有每章都帶 factions 的完整檔才寫；精簡檔（minimal profile／測試夾具）保持索引位元組不變。
  const chapterRows = new Map(chapters.map(row => [row.chapter_id, row]));
  const states = pin.chapters.map(chapterId => {
    const row = chapterRows.get(chapterId);
    requireValue(row !== undefined, 'chapter index row missing');
    const state = parseJSON(Buffer.from(row.state_json));
    requireValue(state !== null && typeof state === 'object');
    return { chapterId, state };
  });
  const complete = states.every(({ state }) => Array.isArray(state.factions) && state.start && typeof state.start === 'object' && typeof state.name === 'string' && state.name.length > 0);
  const chapterIndex = complete ? states.map(({ chapterId, state }) => ({
    chapterId,
    name: state.name,
    start: { year: state.start.year, month: state.start.month, day: state.start.day },
    factions: state.factions.filter(faction => faction?.monarch && faction.monarch.trim()).map(faction => ({
      monarch: faction.monarch,
      advisor: state.generals?.[faction.advisor_idx]?.name?.trim() || '－－－',
      nGenerals: faction.n_generals,
      nCities: faction.n_cities,
      capital: state.cities?.[faction.capital]?.name ?? '－－－',
    })),
  })) : undefined;
  const index = validateIndex({ version: 1, ...identity, chapters: [...pin.chapters], ...(chapterIndex === undefined ? {} : { chapterIndex }), resources: canonicalResources });
  const bytes = Buffer.from(JSON.stringify(index)), digest = sha(bytes);
  requireValue(bytes.length <= MAX_METADATA_BYTES);
  const reference = { key: `${base}runtime-${digest}.json`, sha256: digest, byteLength: bytes.length };
  files.push({ key: reference.key, bytes, contentType: 'application/json' });
  return { reference, files, dependencies };
}
