import test from 'node:test';
import assert from 'node:assert/strict';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { mapPositionProblems, assertMapPositions } from '../web/src/editor/mappositionvalidation.js';
import { buildRoad } from '../web/src/content/authoring/roadedit.js';
import { createMapCanvas } from '../editor-ui/src/mapcanvas.js';
import { createMapController } from '../editor-ui/src/basemap.js';
import { GameCopyStore } from '../server/gamecopy.js';
import { openStorage } from '../vps/sqlite-port.mjs';

function fixture() {
  const ids = [184, 203, 212, 213];
  const componentDefinitions = Object.fromEntries(ids.map(tile => {
    const id = `tile-${tile}`;
    return [id, { id, revision: 'original-byte-1', category: 'atomic-original', anchor: [0, 0], footprint: [[0, 0]],
      visualRef: `MMAP.MDL:${id}`, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } } }];
  }));
  const placements = [{ id: 'piece-a', cityId: 'a', componentRef: 'tile-203', x: 2, y: 5 }, { id: 'piece-b', cityId: 'b', componentRef: 'tile-203', x: 8, y: 5 }];
  const geometry = Array.from({ length: 5 }, (_, index) => ({ x: index + 3, y: 5 }));
  const road = { id: 'road-ab', fromCityId: 'a', toCityId: 'b', geometry, travelKind: 'land' };
  const tileAt = x => x === 3 ? 212 : x === 7 ? 213 : 184;
  const derived = buildRoad({ ...road, cities: new Map(placements.map(p => [p.cityId, p])), roads: [], tiles: tileAt });
  const raw = p => '0'.repeat(16) + [p.x, 0, p.y, 0].map(byte => byte.toString(16).padStart(2, '0')).join('') + '0'.repeat(40);
  return { gameId: 'test', componentDefinitions, selectionGroups: [],
    cities: { a: { cityId: 'a', runtimeSlot: 0, name: '甲城', x: 2, y: 5 }, b: { cityId: 'b', runtimeSlot: 1, name: '乙城', x: 8, y: 5 } },
    chapters: { first: { state: { cities: placements.map((p, idx) => ({ idx, x: p.x, y: p.y, raw: raw(p) })), nativeCityRecordRaw: placements.map(raw) } } },
    map: { bounds: { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 },
      base: { policy: 'sea-ground-1', terrainRef: Array(384 * 256).fill(95), geography: Array(384 * 256).fill(1), unknownUnderlays: {} },
      decorations: [], waterGroups: [], placements,
      roads: [{ ...road, nativeBinding: derived.nativeBinding, components: geometry.map((p, index) => ({ ...p, id: `road-cell-${index}`, definitionRef: `tile-${tileAt(p.x)}`, variantRef: 'original' })) }] } };
}
const move = (layer, id, dx, dy) => ({ op: 'map-object-translate', layer, id, dx, dy });

test('a supported move on the real 192-city template saves, recompiles and rereads from SQLite', async () => {
  const { readInstalledEditorSource } = await import('./editor_builtin_source.mjs');
  const { convertInstalledSystemBaseMap } = await import('./system_base_map_conversion.mjs');
  const { BUILTIN_RESOURCES } = await import('../web/src/content/builtinresources.generated.js');
  const { SystemBaseMapStore } = await import('../server/systembasemapstore.js');
  const registered = readInstalledEditorSource();
  const { template } = convertInstalledSystemBaseMap(registered, BUILTIN_RESOURCES.sourceDigest);
  const storage = openStorage(':memory:');
  const store = new SystemBaseMapStore({ storage, principal: () => ({ id: 'admin', role: 'admin', must_change: false }), loadInitialTemplate: async () => template });
  try {
    const before = await store.initialize('fixture'), source = before.template.content;
    const candidates = source.map.placements.flatMap(place => {
      const roads = source.map.roads.filter(road => road.fromCityId === place.cityId || road.toCityId === place.cityId);
      if (roads.length !== 1) return [];
      const road = roads[0], end = road.fromCityId === place.cityId ? road.geometry[0] : road.geometry.at(-1);
      const distance = Math.max(Math.abs(end.x - place.x), Math.abs(end.y - place.y));
      if (![1, 2].includes(distance)) return [];
      const direction = distance === 1 ? -1 : 1;
      return [move('cities', place.id, direction * Math.sign(end.x - place.x), direction * Math.sign(end.y - place.y))];
    });
    const edit = candidates.find(edit => !mapPositionProblems(previewMapEdits(source, [edit])).length);
    assert.ok(edit, 'real original map has a move preserving its certified ports and node order');
    const saved = store.edit('fixture', [edit]);
    assert.equal(saved.version, before.version + 1); assert.notEqual(saved.digest, before.digest);
    assert.deepEqual(store.capture(), saved);
    const old = source.map.placements.find(place => place.id === edit.id), moved = saved.template.content.map.placements.find(place => place.id === edit.id);
    assert.equal(moved.x, old.x + edit.dx); assert.equal(moved.y, old.y + edit.dy);
    assert.equal(saved.template.content.cities[moved.cityId].x, moved.x); assert.equal(saved.template.content.cities[moved.cityId].y, moved.y);
    const { copyBuiltinGame } = await import('../web/src/content/authoring/gamesource.js');
    const { instantiateSystemBaseMap } = await import('../server/systembasemap.js');
    const { compileGameSource } = await import('../web/src/content/authoring/trialcompile.js');
    const { createHash } = await import('node:crypto');
    const sha = bytes => createHash('sha256').update(bytes).digest('hex');
    const game = instantiateSystemBaseMap(copyBuiltinGame({ gameId: 'position-check', ownerId: 'fixture', kind: 'full', source: registered }, sha), before, sha);
    const candidate = applyMapWorkspaceEdits(game, [edit]);
    const compiled = compileGameSource(candidate, sha);
    assert.equal(Object.keys(compiled.chapterDigests).length, 20, 'all real imported chapters/raw coordinates compile after moving');
    const slot = source.cities[moved.cityId].runtimeSlot;
    assert.equal(compiled.cityIndex[slot].y, moved.y);
    assert.ok(candidate.chapterOrder.every(id => candidate.chapters[id].state.cities[slot].y === moved.y));
    const restored = store.edit('fixture', [{ ...edit, dx: -edit.dx, dy: -edit.dy }]);
    assert.equal(restored.digest, before.digest, 'returning to the original position exactly restores content identity');
  } finally { storage.close(); }
});

test('real copy SQLite rejects invalid movement without a prefix and saves a repaired batch atomically', () => {
  const storage = openStorage(':memory:'), gameId = '11111111-1111-4111-8111-111111111111';
  storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
  storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, 'owner');
  const store = new GameCopyStore({ storage, principal: () => ({ id: 'owner', must_change: 0, epoch: 1 }),
    games: { assertNotDeleting() {}, listOwn: () => [{ gameId }] } });
  try {
    store.ensureFromGame('fixture', gameId, fixture());
    const before = store.read('fixture', gameId);
    assert.throws(() => store.writeModule('fixture', gameId, 'map', { edits: [move('roads', 'road-ab', 1, 0)] }),
      error => error.status === 422 && error.detail?.problems.some(problem => problem.message.includes('road-ab') && problem.message.includes('甲城')));
    assert.deepEqual(store.read('fixture', gameId), before);
    store.writeModule('fixture', gameId, 'map', { edits: [move('roads', 'road-ab', 1, 0), move('cities', 'piece-a', 1, 0), move('cities', 'piece-b', 1, 0)] });
    const saved = store.read('fixture', gameId);
    assert.notEqual(saved.copyDigest, before.copyDigest); assert.equal(saved.data.cities.a.x, 3);
    assert.equal(saved.data.chapters.first.state.cities[0].raw.slice(16, 24), '03000500');
    assert.deepEqual(mapPositionProblems(saved.data), []);
  } finally { storage.close(); }
});

test('road/city movement is atomic, JSON-stable and synchronizes explicit coordinates without renumbering identities', () => {
  const source = fixture(), before = JSON.stringify(source);
  assert.deepEqual(mapPositionProblems(source), []);
  const edits = [move('cities', 'piece-a', 1, 0), move('roads', 'road-ab', 1, 0), move('cities', 'piece-b', 1, 0)];
  const invalid = previewMapEdits(source, [edits[1]]);
  assert.ok(mapPositionProblems(invalid).some(p => p.message.includes('road-ab') && p.message.includes('甲城') && p.message.includes('乙城')));
  assert.throws(() => assertMapPositions(invalid), /保存失敗/);
  const result = previewMapEdits(source, edits), server = applyMapWorkspaceEdits(source, JSON.parse(JSON.stringify(edits)));
  assert.deepEqual(server, result); assert.deepEqual(mapPositionProblems(result), []);
  assert.equal(result.cities.a.x, 3); assert.equal(result.cities.a.runtimeSlot, 0);
  assert.equal(result.chapters.first.state.cities[0].raw.slice(16, 24), '03000500');
  assert.equal(result.chapters.first.state.nativeCityRecordRaw[0], result.chapters.first.state.cities[0].raw);
  assert.equal(result.map.roads[0].geometry[0].x, 4);
  assert.equal(result.map.roads[0].components[0].x, 4);
  assert.equal(result.map.roads[0].nativeBinding.bounds.minX, 4);
  assert.equal(JSON.stringify(source), before);
  assert.throws(() => applyMapWorkspaceEdits(source, [{ ...edits[0], arbitrary: true }]), /COPY_MAP_DELTA/);
  assert.throws(() => previewMapEdits(source, [move('cities', 'piece-a', -3, 0)]), /超出/);
  assert.throws(() => previewMapEdits(source, [move('roads', 'missing', 1, 0)]), /不存在/);
  const grouped = structuredClone(source);
  grouped.map.decorations = [{ id: 'wall-owned', definitionRef: 'tile-184', x: 2, y: 4 }, { id: 'nearby-unowned', definitionRef: 'tile-184', x: 1, y: 4 }];
  grouped.selectionGroups = [{ id: 'city-group-a', members: [{ layer: 'decorations', id: 'wall-owned' }] }];
  grouped.cityGatePorts = [{ cityId: 'a', x: 3, y: 5 }];
  const movedGroup = previewMapEdits(grouped, [move('cities', 'piece-a', 1, 0)]);
  assert.equal(movedGroup.map.decorations[0].x, 3);
  assert.equal(movedGroup.map.decorations[1].x, 1, 'adjacent pixels never confer ownership');
  assert.equal(movedGroup.cityGatePorts[0].x, 4);
  assert.deepEqual(applyMapWorkspaceEdits(grouped, [move('cities', 'piece-a', 1, 0)]), movedGroup);
  const reordered = previewMapEdits(source, [move('cities', 'piece-a', 0, 1)]);
  assert.ok(mapPositionProblems(reordered).some(p => p.code === 'CITY_SCAN_ORDER'));
});

test('canvas moves roads/cities with translucent stamps, shows only red cells live and clears them after repair', () => {
  let source = fixture(), model, view;
  const fills = [], images = [];
  const context = { globalAlpha: 1, setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {},
    fillRect(...args) { fills.push([this.fillStyle, ...args]); }, drawImage(...args) { images.push([this.globalAlpha, ...args]); } };
  const canvas = { width: 6144, height: 4096, style: {}, getContext: () => context };
  view = createMapCanvas({ publish: value => { model = value; }, stage: edit => { source = previewMapEdits(source, [edit]); view.setSource(source); return true; } });
  view.attach(canvas, null); view.resize(6144, 4096); view.setSource(source); view.setAtlas({}); view.zoom(1 / model.zoom, 3072, 2048);
  const screen = (x, y) => [(x + 0.5) * 16, (y + 0.5) * 16];
  view.pick(...screen(4, 5)); assert.equal(model.selected.layer, 'roads');
  assert.equal(view.beginObjectMove(...screen(4, 5)), true);
  view.previewObjectMove(...screen(5, 5)); assert.ok(images.some(row => row[0] === 0.5));
  fills.length = 0; view.commitObjectMove();
  assert.ok(fills.some(row => row[0] === 'rgba(255, 0, 0, 0.35)'));
  assert.deepEqual(model.diagnostics, [], 'position details must not leak into live UI');
  assert.equal(view.beginObjectMove(...screen(5, 5)), true);
  view.previewObjectMove(...screen(4, 5)); view.commitObjectMove(); fills.length = 0; view.resize(6144, 4096);
  assert.ok(!fills.some(row => row[0] === 'rgba(255, 0, 0, 0.35)'));
  view.pick(...screen(2, 5)); assert.equal(model.selected.layer, 'cities');
  assert.equal(view.beginObjectMove(...screen(2, 5)), true);
  view.previewObjectMove(...screen(2, 6)); view.commitObjectMove();
  assert.equal(source.map.placements[0].y, 6); assert.deepEqual(model.diagnostics, []);
});

test('save lists precise problems without transport or loss; repair saves and rereads', async () => {
  let source = fixture(), model, writes = 0;
  const controller = createMapController({ api: async (_path, body) => {
    if (body) { writes++; source = applyMapWorkspaceEdits(source, body.edits); }
    return { snapshot: { version: 1, digest: 'a'.repeat(64), template: { content: structuredClone(source) } } };
  }, publish: value => { model = value; }, paint() {}, work: action => action(), confirm: () => true });
  controller.setIdentity({ user: { id: 'admin', role: 'admin', mustChangePassword: false } });
  await controller.actions.reload(); controller.actions.stage(move('roads', 'road-ab', 1, 0));
  assert.deepEqual(model.serverProblems, []);
  await controller.actions.save();
  assert.equal(writes, 0); assert.equal(model.dirty, true); assert.equal(model.locked, false);
  assert.match(model.message, /保存失敗/);
  assert.ok(model.serverProblems.some(p => p.message.includes('road-ab') && p.message.includes('甲城') && p.message.includes('(2, 5)')));
  controller.actions.stage(move('cities', 'piece-a', 1, 0)); controller.actions.stage(move('cities', 'piece-b', 1, 0));
  assert.deepEqual(model.serverProblems, []);
  await controller.actions.save(); assert.equal(writes, 1); assert.equal(model.dirty, false);
});
