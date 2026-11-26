// MAP-EXT E6: joint compile, local extended player pack, full-map display.
// Isolated only: real registered source + :memory: builds, no dev store, no
// browser, no publish/deploy. Covers: origin byte-equivalence under the
// mapExtent flag, N/W/E/max compiles with origin-block identity, explicit
// compat as the origin 384x256 plane (E5 west/east boundary now admitted),
// extended tile-pixel rows, offset-aware minimap roundtrips, a local
// schema-3 grid pack admitted to the fresh grid branch (plus refusal
// matrix), shared four-season layout, and same-machine compile cost.
// Usage: node --test tools/verify_map_extent_playable.mjs (cwd=web-port)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { validateSystemBaseMap, instantiateSystemBaseMap } from '../server/systembasemap.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { copyBuiltinGame } from '../web/src/content/authoring/gamesource.js';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { createFixedTileRows, createFixedTileWindowRows } from '../web/src/content/authoring/tilepixels.js';
import { minimapTransform, renderMinimapPixels } from '../web/src/content/authoring/minimap.js';
import { loadPlayerPack } from '../web/src/player/playerpack.js';
import { createPlayerEnvironment } from '../web/src/player/playerenvironment.js';
import { prepareScenario, scenarioGridRoadContext } from '../web/src/game/scenarioassembly.js';
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from '../web/src/game/nativelegions.js';
import { attachSyntheticNativeFactionSource } from './native_faction_fixture.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const source = readInstalledEditorSource(BUILTIN_RESOURCES);
const { template: baseTemplate } = convertInstalledSystemBaseMap(source, BUILTIN_RESOURCES.sourceDigest);

const growTemplate = (steps) => {
  let cur = { ...baseTemplate.content, gameId: 'e6-probe' };
  for (const [side, n] of steps) for (let k = 0; k < n; k++) cur = applyMapWorkspaceEdits(cur, [{ op: 'map-extent', side, delta: 1 }]);
  const { gameId, ...content } = cur;
  return { ...structuredClone(baseTemplate), content };
};
const snapshotOf = template => ({ version: 1, digest: validateSystemBaseMap(template, sha).digest, template });
const bornFull = (template, gameId) => instantiateSystemBaseMap(
  copyBuiltinGame({ gameId, ownerId: 'o', kind: 'full', source }, sha), snapshotOf(template), sha);
const compileBoth = game => ({
  plain: compileGameSource(game, sha),
  flagged: compileGameSource(game, sha, { mapExtent: true }),
});
const withCompat = (game, roadCostHex) => ({ ...game,
  compatibilityAssets: { roadCostHex, roadOffsetJson: '{}' } });

test('E6 origin compile is byte-identical with and without the mapExtent flag', () => {
  const game = bornFull(baseTemplate, 'e6-origin');
  const { plain, flagged } = compileBoth(game);
  for (const key of ['terrainBytes', 'roadCost', 'roadMask', 'minimapGeography', 'geography'])
    assert.deepEqual(flagged[key], plain[key], `${key} identical on the origin domain`);
  assert.equal(JSON.stringify(flagged.roadGraph), JSON.stringify(plain.roadGraph), 'road graph identical');
  assert.equal(flagged.compatibilityAssetMode, plain.compatibilityAssetMode);
});

test('E6 north+5 and west+3/east+2 compile; origin block identical, new bands are sea', () => {
  const base = compileGameSource(bornFull(baseTemplate, 'e6-base'), sha);
  const north = compileGameSource(bornFull(growTemplate([['north', 5]]), 'e6-n5'), sha, { mapExtent: true });
  assert.equal(north.terrainBytes.length, 384 * 261);
  const nb = { minX: 0, minY: -5, width: 384, height: 261 };
  for (let y = 0; y < 256; y++) for (let x = 0; x < 384; x++)
    assert.equal(north.terrainBytes[(y + 5) * 384 + x], base.terrainBytes[y * 384 + x], `origin cell ${x},${y}`);
  for (let y = -5; y < 0; y++) for (let x = 0; x < 384; x++)
    assert.equal(north.terrainBytes[(y + 5) * 384 + x], 95, `new cell ${x},${y} is sea`);
  const mixed = compileGameSource(bornFull(growTemplate([['west', 3], ['east', 2]]), 'e6-we'), sha, { mapExtent: true });
  assert.equal(mixed.terrainBytes.length, 389 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 384; x++)
    assert.equal(mixed.terrainBytes[y * 389 + x + 3], base.terrainBytes[y * 384 + x], `shifted origin cell ${x},${y}`);
  for (let y = 0; y < 256; y++) for (const x of [-3, -2, -1, 384, 385])
    assert.equal(mixed.terrainBytes[y * 389 + x + 3], 95, `new column cell ${x},${y} is sea`);
});

test('E6 max extent 424x296 compiles; corners addressable', () => {
  const t0 = Date.now();
  const game = bornFull(growTemplate([['north', 20], ['south', 20], ['west', 20], ['east', 20]]), 'e6-max');
  assert.deepEqual(game.map.bounds, { minX: -20, minY: -20, width: 424, height: 296, tileSize: 16 });
  const mem0 = process.memoryUsage().heapUsed;
  const compiled = compileGameSource(game, sha, { mapExtent: true });
  const ms = Date.now() - t0;
  assert.equal(compiled.terrainBytes.length, 424 * 296);
  assert.equal(compiled.roadCost.length, 424 * 296);
  assert.equal(compiled.minimapGeography.length, 424 * 296);
  for (const [x, y] of [[-20, -20], [403, -20], [-20, 275], [403, 275]])
    assert.ok(Number.isInteger(compiled.terrainBytes[(y + 20) * 424 + x + 20]), `corner ${x},${y}`);
  assert.ok(ms < 120000, `max compile finishes, took ${ms}ms`);
  console.log(`E6 max compile: ${ms}ms, heap +${((process.memoryUsage().heapUsed - mem0) / 1048576).toFixed(1)}MiB`);
});

test('E6 explicit compat is the origin plane; sentinel lands at the world offset', () => {
  const hexAt = (x, y, byte) => {
    const cells = new Uint8Array(384 * 256).fill(1);
    cells[y * 384 + x] = byte;
    return Buffer.from(cells).toString('hex');
  };
  // North regression: identical placement to the E5 overlay semantics.
  const nGame = withCompat(bornFull(growTemplate([['north', 5]]), 'e6-cn'), hexAt(10, 20, 0xab));
  const nCompiled = compileGameSource(nGame, sha, { mapExtent: true });
  assert.equal(nCompiled.roadCost[(20 + 5) * 384 + 10], 0xab, 'north overlay at -minY row offset');
  // E5 boundary now admitted: west overlay shifts the origin block right.
  const wGame = withCompat(bornFull(growTemplate([['west', 1]]), 'e6-cw'), hexAt(10, 20, 0xcd));
  const wCompiled = compileGameSource(wGame, sha, { mapExtent: true });
  assert.equal(wCompiled.terrainBytes.length, 385 * 256);
  assert.equal(wCompiled.roadCost[20 * 385 + 11], 0xcd, 'west overlay at -minX column offset');
  assert.equal(wCompiled.roadCost[20 * 385], wCompiled.roadMask[20 * 385], 'new west column keeps derived mask');
  // Wrong plane sizes still refuse.
  const bad = withCompat(bornFull(growTemplate([['west', 1]]), 'e6-cb'), '00'.repeat(385 * 256));
  assert.throws(() => compileGameSource(bad, sha, { mapExtent: true }), /invalid explicit compatibility roadCost bytes/);
  const bad2 = withCompat(bornFull(growTemplate([['north', 1]]), 'e6-cb2'), '00'.repeat(384 * 255));
  assert.throws(() => compileGameSource(bad2, sha, { mapExtent: true }), /invalid explicit compatibility roadCost bytes/);
});

test('E6 extended tile-pixel rows carry compiled dims; origin defaults unchanged', () => {
  const atlas = new Uint8Array(256 * 256 * 4).fill(255);
  const plane = new Uint8Array(389 * 256).fill(12);
  const rows = createFixedTileRows(plane, atlas, 389);
  assert.equal(rows.width, 389 * 16);
  assert.equal(rows.height, 256 * 16);
  assert.equal([...rows].length, 256 * 16);
  assert.equal(rows[Symbol.iterator]().next().value.length, 389 * 16 * 4);
  const win = createFixedTileWindowRows(plane, atlas, { x: 0, y: 0, width: 32, height: 16 }, 389);
  assert.equal([...win].length, 16);
  const origin = createFixedTileRows(new Uint8Array(384 * 256).fill(3), atlas);
  assert.equal(origin.width, 6144);
  assert.equal(origin.height, 4096);
});

test('E6 minimap transform: four-corner roundtrips, NW negative inside, margins reject', () => {
  const bounds = { minX: -3, minY: -5, width: 387, height: 261, tileSize: 16 };
  const box = { x: 10, y: 20, w: 208, h: 139 };
  const t = minimapTransform(bounds, box);
  assert.deepEqual(t.rect, { x: 10, y: 20, w: 208, h: 139 }, 'stretched art fills the box exactly');
  for (const [tx, ty] of [[-3, -5], [383, -5], [-3, 255], [383, 255]]) {
    const [dx, dy] = t.worldToDisplay(tx * 16 + 8, ty * 16 + 8);
    assert.ok(dx >= box.x && dx < box.x + box.w && dy >= box.y && dy < box.y + box.h, `corner ${tx},${ty} on the art`);
    const [wx, wy] = t.displayToWorld(dx, dy);
    assert.ok(Math.abs(wx - (tx * 16 + 8)) < 1e-6 && Math.abs(wy - (ty * 16 + 8)) < 1e-6, `corner ${tx},${ty} roundtrips`);
  }
  const [nx, ny] = t.worldToDisplay(-3 * 16 + 8, -5 * 16 + 8);
  assert.ok(nx >= box.x && ny >= box.y, 'NW negative tile maps inside, never wraps to the last column');
  assert.equal(t.displayToWorld(box.x - 1, box.y), null, 'left margin rejects');
  assert.equal(t.displayToWorld(box.x + box.w, box.y), null, 'right margin rejects');
  assert.equal(t.displayToWorld(box.x, box.y - 1), null, 'top margin rejects');
  assert.equal(t.displayToWorld(box.x, box.y + box.h), null, 'bottom margin rejects');
  const o = minimapTransform({ minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 }, box);
  const [ox, oy] = o.worldToDisplay(8, 8);
  assert.ok(ox >= box.x && oy >= box.y, 'origin tile (0,0) still on the art');
});

const TOTAL = 9;
const GRID_BOUNDS = { minX: -3, minY: -5, width: 387, height: 261, tileSize: 16 };
function gridGraph() {
  const at = i => (i === 0 ? [-3, -5] : i === 1 ? [-2, -5] : [i + 1, 10]);
  const nodes = Array.from({ length: TOTAL }, (_, i) => {
    const [x, y] = at(i);
    return { cityIndex: i, cityId: `c${i}`, x, y, ports: [null, null, null, null] };
  });
  nodes[0].ports[0] = { roadIndex: 0, end: 'from' };
  nodes[1].ports[0] = { roadIndex: 0, end: 'to' };
  return {
    version: 'world-grid-experiment',
    bounds: { ...GRID_BOUNDS },
    nodes,
    edges: [{
      roadId: 'r0', fromCityIndex: 0, toCityIndex: 1, cost: 1,
      points: [{ x: -3, y: -5, flags: 2 }, { x: -2, y: -5, flags: 2 }],
    }],
  };
}
function gridChapter() {
  const graph = gridGraph();
  return {
    player_faction: 0,
    generals: [],
    legions: [],
    factions: [
      { idx: 0, capital: 0, n_legions: 0, active: true, attr: 0x80, money: 1000, legion_morale_cap: 200, march_marker_style: 0, strategic_city_primary: null, strategic_city_secondary: null, n_cities: TOTAL - 1 },
      { idx: 1, capital: TOTAL - 1, n_legions: 0, active: true, attr: 0x80, money: 1000, legion_morale_cap: 200, march_marker_style: 0, strategic_city_primary: null, strategic_city_secondary: null, n_cities: 1 },
    ],
    cities: graph.nodes.map(({ x, y }, idx) => ({ idx, x, y, faction: idx === TOTAL - 1 ? 1 : 0,
      attr: 0x80, governor: null, _aiCooldown: 0, _strategicLastFaction: idx === TOTAL - 1 ? 1 : 0,
      strategicBorderCount: 0, strategicNeighbours: [255, 255, 255, 255], disaster_event: 0 })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
    weatherClouds: Array.from({ length: 16 }, () => ({})),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
    nativeCityRecordRaw: Array.from({ length: TOTAL }, () => '00'.repeat(32)),
  };
}
async function loadGridPack({ bounds, tamperWorld = null, flags = {} }) {
  const W = bounds.width, H = bounds.height;
  const graph = bounds === GRID_BOUNDS ? gridGraph() : { ...gridGraph(), bounds: { ...bounds } };
  const chapterBytes = encode(gridChapter());
  const graphBytes = encode(graph);
  const types = { terrain: 'application/octet-stream', roadGraph: 'application/json', roadCost: 'application/octet-stream', roadOffset: 'application/json', minimapBase: 'image/png', minimapLarge: 'image/png' };
  const gameId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const releaseId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const sourceDigest = 'c'.repeat(64);
  const chapterId = `${gameId}#chapter`;
  const data = new Map();
  const manifest = {
    schemaVersion: 3, buildFormat: 'studio-world-grid-1', compilerRevision: TRIAL_COMPILER_REVISION,
    identity: { gameId, draftRevision: '1', sourceDigest }, chapters: [chapterId],
    world: tamperWorld ?? { id: `${gameId}-world`, revision: sourceDigest, ...bounds },
    assets: [], minimapAssets: [], portraits: [], visualAssets: { seasonAtlases: {}, seasons: {} },
  };
  const put = (assetId, bytes, type, role) => {
    data.set(`asset:${assetId}`, { bytes, contentType: type, sha256: sha(bytes) });
    const entry = { assetId, role, byteLength: bytes.length, sha256: sha(bytes),
      url: `/api/trial-asset?game=${gameId}&revision=1&digest=${sourceDigest}&asset=${assetId}` };
    (assetId.startsWith('minimap') ? manifest.minimapAssets : manifest.assets).push(entry);
  };
  const roles = { terrain: 'rules-initial-terrain', roadGraph: 'world-road-grid', roadCost: 'legacy-grid-visual', roadOffset: 'legacy-grid-visual', minimapBase: 'automatic-minimap', minimapLarge: 'automatic-minimap' };
  for (const [assetId, type] of Object.entries(types)) {
    const bytes = assetId === 'roadGraph' ? graphBytes
      : assetId === 'terrain' ? new Uint8Array(W * H).fill(0xba)
      : assetId === 'roadCost' ? new Uint8Array(W * H).fill(1)
      : assetId === 'roadOffset' ? encode({}) : encode(assetId);
    put(assetId, bytes, type, roles[assetId]);
  }
  const statics = new Map();
  for (const [group, stem] of [['seasonAtlases', 'map_atlas_'], ['seasons', 'map_tiles_']]) {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      const path = `content/builtin/compiled/map-2-${sourceDigest}/${stem}${season}.png`;
      const bytes = encode(path);
      manifest.visualAssets[group][season] = { path, url: path, sha256: sha(bytes), byteLength: bytes.length };
      statics.set(path, { bytes, contentType: 'image/png', sha256: sha(bytes) });
    }
  }
  const manifestBytes = encode(manifest);
  const identity = Object.freeze({ gameId, releaseId, ordinal: '1.0', revision: '1',
    sourceDigest, chapterId, chapters: [chapterId], manifestDigest: sha(manifestBytes) });
  const session = { identity, state: () => 'active',
    read: async role => {
      if (role === 'manifest') return { bytes: manifestBytes, contentType: 'application/json', sha256: sha(manifestBytes) };
      if (role === `chapter:${chapterId}`) return { bytes: chapterBytes, contentType: 'application/json', sha256: sha(chapterBytes) };
      const hit = data.get(role);
      assert.ok(hit, `unexpected pack role ${role}`);
      return hit;
    } };
  const pack = await loadPlayerPack({ session, compilerRevision: TRIAL_COMPILER_REVISION,
    maxTotalBytes: 256 * 1024 * 1024,
    readStatic: async path => { const hit = statics.get(path); assert.ok(hit, `unexpected static ${path}`); return hit; },
    ...flags });
  return { pack, identity };
}

test('E6 local extended grid pack reaches the fresh grid branch; movement covers negative tiles', async () => {
  const { pack } = await loadGridPack({ bounds: GRID_BOUNDS, flags: { mapExtent: true } });
  try {
    const environment = createPlayerEnvironment(pack, { playerFaction: 0, mapExtent: true });
    assert.equal(environment.raw.cities.length, TOTAL);
    assert.equal(environment.world.definition.width, GRID_BOUNDS.width);
    const terrain = await environment.world.terrain.loadTerrain();
    assert.equal(terrain.length, GRID_BOUNDS.width * GRID_BOUNDS.height, 'rules plane matches the extent');
    const raw = environment.raw;
    initializeNativeLegionSlotsFromZeroChapter(raw);
    attachSyntheticNativeFactionSource(raw);
    if (raw.nativeLegionSlots) {
      for (const legion of raw.legions) raw.nativeLegionSlots.records[legion.slot] = legion;
      rebindNativeLegionViews(raw);
    }
    const prepared = await prepareScenario({ raw, idx: 0, mode: 'fresh', content: environment.content, world: environment.world, mapExtent: true });
    const grid = scenarioGridRoadContext(prepared.scenario);
    assert.ok(grid, 'fresh extended world installs the grid context');
    assert.equal(grid.graph.nodes.length, TOTAL);
    assert.equal(grid.movement.readTile(-3, -5), 0, 'negative band addressable');
    grid.movement.writeTile(-3, -5, 1);
    assert.equal(grid.movement.readTile(-3, -5), 1, 'negative band writable');
    assert.throws(() => grid.movement.readTile(-4, -5), /outside world/, 'west of the band refuses');
  } finally {
    pack.close();
  }
});

test('E6 extended pack refusal matrix (flag off, bad bounds, legacy north intact)', async () => {
  await assert.rejects(loadGridPack({ bounds: GRID_BOUNDS }), /PLAYER_PACK_INVALID/, 'extended pack without any flag refuses');
  const badBounds = { minX: -41, minY: 0, width: 425, height: 256, tileSize: 16 };
  await assert.rejects(loadGridPack({ bounds: badBounds, flags: { mapExtent: true } }), /PLAYER_PACK_INVALID/, 'beyond-cap bounds refuse even with the flag');
  const northBounds = { minX: 0, minY: -5, width: 384, height: 261, tileSize: 16 };
  const legacy = await loadGridPack({ bounds: northBounds, flags: { northExperiment: true } });
  legacy.pack.close();
});

test('E6 compiled minimap art covers the extended plane for every season layout', () => {
  const game = bornFull(growTemplate([['north', 5], ['west', 3]]), 'e6-art');
  const compiled = compileGameSource(game, sha, { mapExtent: true });
  assert.equal(compiled.minimapGeography.length, 387 * 261);
  for (const [w, h] of [[208, 139], [250, 167]]) {
    const art = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, 387, 261, w, h, 1);
    assert.equal(art.pixels.length, w * h * 3, `minimap ${w}x${h} covers the extended plane`);
  }
  const origin = compileGameSource(bornFull(baseTemplate, 'e6-art0'), sha);
  assert.equal(renderMinimapPixels(origin.minimapGeography, origin.roadMask, 384, 256, 208, 139, 1).pixels.length, 208 * 139 * 3);
});
