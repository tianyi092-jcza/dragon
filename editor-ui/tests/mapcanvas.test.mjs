import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapCanvas } from '../src/mapcanvas.js';
import { previewMapEdits } from '../../web/src/editor/mapcommands.js';
import cityGroupCatalog from '../src/mapcitygroups.json' with { type: 'json' };

const fixture = () => ({ cities: {}, componentDefinitions: { piece: { id: 'piece', revision: 'test-1', category: 'test-fixture', name: '測試片段', anchor: [0, 0], footprint: [[0, 0], [1, 0], [0, 1]], visualRef: 'MMAP.MDL:indexed-footprint', ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, 16], [1, 0, 17], [0, 1, 18]] } } } }, map: {
  bounds: { minX: 0, minY: 0, width: 2, height: 2, tileSize: 16 }, base: { terrainRef: [16, 16, 16, 16], geography: [0, 0, 0, 0], unknownUnderlays: {} },
  decorations: [{ id: 'piece-1', definitionRef: 'piece', variantRef: 'original', x: 0, y: 0 }], roads: [], placements: [], waterGroups: [],
} });
function canvas() {
  const draws = [], context = { globalAlpha: 1, setTransform(...args) { draws.push(['transform', ...args]); }, clearRect(...args) { draws.push(['clear', ...args]); }, fillRect(...args) { draws.push(['fill', ...args]); }, drawImage(...args) { draws.push(['image', ...args]); draws.push(['image-alpha', this.globalAlpha, ...args]); }, strokeRect(...args) { draws.push(['stroke', ...args]); }, beginPath() { draws.push(['begin']); }, moveTo(...args) { draws.push(['move', ...args]); }, lineTo(...args) { draws.push(['line', ...args]); }, stroke() { draws.push(['grid', this.lineWidth, this.strokeStyle]); }, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
  return { style: {}, width: 32, height: 32, clientWidth: 32, clientHeight: 32, getContext: () => context, draws };
}
function recipeFixture() {
  const source = fixture();
  const tiles = [[0, 0, 166], [1, 0, 160], [0, 1, 161], [1, 1, 174]];
  tiles.forEach(([, , tile]) => {
    const id = `tile-${tile}`;
    source.componentDefinitions[id] = { id, revision: 'original-byte-1', category: 'atomic-original', anchor: [0, 0],
      footprint: [[0, 0]], visualRef: `MMAP.MDL:${id}`, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } } };
  });
  return { source, recipe: { itemId: 'fixture-mountain-square', name: '工程夾具', category: 'mountain',
    ruleRecipeRef: 'ki-byte-stamp-1', anchor: [0, 0], footprint: tiles.map(([x, y]) => [x, y]), tiles,
    support: 'existing-decoration', geographyEffect: 'preserve-underlay' } };
}

test('selected cell reports its visible catalog byte, not the instance ID or the multi-cell anchor tile', () => {
  const source = fixture(), main = canvas();
  Object.assign(source.map.bounds, { minX: 313, minY: -1 });
  Object.assign(source.map.decorations[0], { id: 'edge-north--1-349', x: 313, y: -1 });
  source.componentDefinitions.piece.variants.original.tiles[1][2] = 0;
  let model;
  const view = createMapCanvas({ publish: v => { model = v; }, stage: () => assert.fail('inspection must not edit') });
  view.attach(main, null); view.setSource(source); view.resize(32, 32); view.fit();
  view.pick(24, 8);
  assert.equal(model.selected.id, 'edge-north--1-349'); assert.equal(model.selected.cellTileId, 0);
  view.pick(24, 8); assert.equal(model.selected, null);
  view.pick(8, 8); assert.equal(model.selected.cellTileId, 16);
});

test('base-only tint follows visible footprints even for identical tiles and never tints the game workspace', () => {
  const source = fixture();
  for (const gameId of ['system-base-map', 'game-id']) {
    const main = canvas(), fills = [];
    main.getContext().fillRect = (...rect) => fills.push(rect);
    const view = createMapCanvas({ gameId, publish() {}, stage: assert.fail });
    view.attach(main, null); view.setSource(source); view.resize(32, 32); view.fit();
    fills.length = 0; view.setAtlas({});
    assert.deepEqual(fills, gameId === 'system-base-map' ? [[16, 16, 16, 16]] : []);
    fills.length = 0; view.layer('decor', 'visible', false);
    assert.equal(fills.length, gameId === 'system-base-map' ? 4 : 0);
  }
});

test('Shift-drag copies selected decorations once in layer order; preview keeps the originals and rejects partial drops', () => {
  const { source } = recipeFixture(), main = canvas(), batches = [];
  source.map.decorations = ['tile-166', 'tile-160'].map((definitionRef, x) => ({ id: `old-${x}`, definitionRef, x, y: 0, minimapLand: x === 0 }));
  const view = createMapCanvas({ publish() {}, stage: edits => batches.push(edits) });
  view.attach(main, null); view.setSource(source); view.resize(32, 32); view.fit(); view.setAtlas({});
  view.pick(24, 8); view.toggleMulti(8, 8);
  assert.ok(view.beginMultiMove(8, 8, true)); main.draws.length = 0;
  view.previewObjectMove(8, 24);
  const sprites = main.draws.filter(r => r[0] === 'image-alpha');
  assert.equal(sprites.filter(r => r[1] === 0.5).length, 2);
  assert.ok(sprites.some(r => r[1] === 1 && r[3] === 96 && r[4] === 160));
  assert.equal(batches.length, 0); view.commitObjectMove(); view.commitObjectMove();
  assert.equal(batches.length, 1);
  const after = previewMapEdits(source, batches[0]);
  assert.deepEqual(after.map.decorations.slice(0, 2), source.map.decorations);
  assert.deepEqual(after.map.decorations.slice(2).map(i => [i.definitionRef, i.x, i.y]), [['tile-166',0,1], ['tile-160',1,1]]);
  assert.deepEqual(after.map.decorations.slice(2).map(item => item.minimapLand), [true, false]);
  assert.equal(new Set(after.map.decorations.map(i => i.id)).size, 4);
  view.beginMultiMove(8, 8, true); view.previewObjectMove(24, 24); view.commitObjectMove();
  view.beginMultiMove(8, 8, true); view.previewObjectMove(8, 24); view.cancelObjectMove(); view.commitObjectMove();
  assert.equal(batches.length, 1);
});

test('default workspace publishes 238 atomic cards and four preview-only city groups without changing existing combinations', () => {
  const { source } = recipeFixture(), before = JSON.stringify(source);
  let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage: () => assert.fail('browsing must not stage') });
  view.setSource(source);
  assert.equal(model.catalogItems.length, 242);
  assert.equal(model.catalogAtoms.length, 256);
  assert.ok(model.catalogItems.slice(0, 238).every(row => row.cells === 1 && /^tile-\d+$/.test(row.id)));
  assert.ok(model.catalogItems.slice(238).every(row => row.category === 'city-group' && !row.canPlace && !row.available));
  assert.deepEqual(model.catalogCategories.map(row => row.name), ['地面', '山地', '水系', '農田', '牆體', '據點', '據點組', '道路']);
  assert.equal(JSON.stringify(source), before);
});

test('city groups preview native cells at DPR1/1.25/2 and drag as one visual decoration batch without exposing recipes', () => {
  const { source } = recipeFixture(), main = canvas();
  Object.assign(source.map.bounds, { width: 16, height: 16 });
  Object.assign(source.map.base, { terrainRef: Array(256).fill(16), geography: Array(256).fill(0) });
  cityGroupCatalog.items.flatMap(item => item.rows.flat()).forEach(tile => {
    const id = `tile-${tile}`;
    source.componentDefinitions[id] = { id, revision: 'original-byte-1', category: 'atomic-original', anchor: [0, 0],
      footprint: [[0, 0]], visualRef: `MMAP.MDL:${id}`, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } } };
  });
  let model;
  const before = JSON.stringify(source), atlas = { season: 'spring' };
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edits => edits });
  view.attach(main, null); view.setSource(source); view.setAtlas(atlas); view.pick(1, 1);
  const previousRatio = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  try {
    for (const ratio of [1, 1.25, 2]) {
      Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: ratio });
      for (const item of cityGroupCatalog.items) {
        const id = `catalog:${item.itemId}`, row = model.catalogItems.find(row => row.id === id), thumb = canvas();
        const width = item.rows[0].length * 16, height = item.rows.length * 16;
        assert.equal(row.available, true); assert.equal(row.canPlace, true);
        assert.deepEqual([row.previewWidth, row.previewHeight], [width, height]);
        assert.ok(!['tiles', 'rows', 'anchor', 'gates', 'source', 'definition', 'variants', 'plan'].some(key => key in row));
        view.previewMaterial(thumb, id);
        assert.deepEqual([thumb.width, thumb.height, thumb.style.width, thumb.style.height], [width * ratio, height * ratio, `${width}px`, `${height}px`]);
        assert.deepEqual(thumb.draws.filter(row => row[0] === 'image'), item.rows.flatMap((row, y) => row.map((tile, x) => ['image', atlas, tile % 16 * 16, Math.floor(tile / 16) * 16, 16, 16, x * 16, y * 16, 16, 16])));
        assert.equal(thumb.getContext('2d').imageSmoothingEnabled, false);
        assert.ok(view.previewPlacement(id, 16, 16)?.inBounds);
        const edits = view.commitPlacement();
        assert.equal(edits.at(-1).op, 'decoration-place');
        assert.equal(edits.filter(edit => edit.op === 'material-capture').length, 1);
        assert.throws(() => view.command('decoration-place', { materialId: id }), /僅供預覽/);
        view.previewMaterial(null, id);
      }
    }
    assert.equal(JSON.stringify(source), before);
    const id = 'catalog:city-group-large-v1';
    model.catalogItems.find(row => row.id === id).name = 'mutated DTO';
    model.catalogCategories[0].name = 'mutated DTO';
    model.catalogAtoms[222].available = false;
    model.catalogItems.find(row => row.id === 'tile-222').available = false;
    view.grid(false);
    assert.equal(model.catalogItems.find(row => row.id === id).name, '大都市');
    assert.equal(model.catalogCategories[0].name, '地面');
    assert.equal(model.catalogAtoms[222].available, true);
    assert.equal(model.catalogItems.find(row => row.id === 'tile-222').available, true);
    // Even a same-ID source definition cannot turn a display-only recipe into a material.
    source.componentDefinitions[id] = { ...structuredClone(source.componentDefinitions.piece), id };
    delete source.componentDefinitions['tile-222']; view.setSource(source);
    assert.equal(model.catalogItems.find(row => row.id === id).available, false);
    const thumb = canvas(); view.previewMaterial(thumb, id);
    assert.equal(thumb.draws.filter(row => row[0] === 'image').length, 0);
    assert.equal(view.previewPlacement(id, 1, 1), null); view.commitPlacement();
    assert.throws(() => view.command('decoration-place', { materialId: id }), /僅供預覽/);
    view.setSource(null);
    assert.ok(model.catalogItems.filter(row => row.category === 'city-group').every(row => !row.available && !row.canPlace));
  } finally {
    if (previousRatio) Object.defineProperty(globalThis, 'devicePixelRatio', previousRatio);
    else delete globalThis.devicePixelRatio;
  }
});

test('atomic thumbnails enlarge to 32 CSS pixels while map placement stays one 16px cell', () => {
  const { source } = recipeFixture(), before = JSON.stringify(source), main = canvas(), thumb = canvas(), staged = [];
  const view = createMapCanvas({ publish() {}, stage: edit => staged.push(edit) });
  const previousRatio = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  try {
    view.attach(main, null); view.setSource(source); view.resize(32, 32); view.fit(); view.grid(false);
    for (const ratio of [1, 1.25, 2]) {
      Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: ratio });
      for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        const atlas = { season }; view.setAtlas(atlas); thumb.draws.length = 0; main.draws.length = 0;
        view.previewMaterial(thumb, 'tile-166');
        assert.deepEqual([thumb.width, thumb.height, thumb.style.width, thumb.style.height], [32 * ratio, 32 * ratio, '32px', '32px']);
        assert.deepEqual(thumb.draws.filter(row => row[0] === 'image'), [['image', atlas, 96, 160, 16, 16, 0, 0, 32, 32]]);
        assert.equal(thumb.getContext('2d').imageSmoothingEnabled, false);
        view.previewPlacement('tile-166', 1, 1);
        assert.deepEqual(main.draws.filter(row => row[0] === 'image-alpha' && row[1] === 0.5).map(row => row.slice(-4)), [[0, 0, 16, 16]]);
        view.cancelPlacement();
      }
    }
    view.previewPlacement('tile-166', 24, 24); view.commitPlacement();
    assert.equal(staged.length, 1);
    assert.deepEqual(staged.map(({ instanceId: _instanceId, ...edit }) => edit), [{ op: 'decoration-place', materialId: 'tile-166', variantRef: 'original', x: 1, y: 1, waterClass: null }]);
    assert.equal(JSON.stringify(source), before);
  } finally {
    if (previousRatio) Object.defineProperty(globalThis, 'devicePixelRatio', previousRatio);
    else delete globalThis.devicePixelRatio;
  }
});

test('single-cell drops replace the top decoration as one gesture without flattening older layers', () => {
  const { source } = recipeFixture(), batches = [], main = canvas();
  let current = source;
  const view = createMapCanvas({ publish() {}, stage: edits => {
    batches.push(edits); current = previewMapEdits(current, Array.isArray(edits) ? edits : [edits]); view.setSource(current);
  } });
  view.attach(main, null); view.setSource(source); view.resize(32, 32); view.fit(); view.setAtlas({});
  const drop = (id, pos) => { view.previewPlacement(id, pos, pos); view.commitPlacement(); };
  assert.throws(() => drop('tile-166', 8), /多格/);
  drop('tile-166', 24);
  const under = { ...current.map.decorations.at(-1), id: 'old-underlay', definitionRef: 'tile-161' };
  current = { ...current, map: { ...current.map, decorations: [under, ...current.map.decorations] } };
  view.setSource(current); drop('tile-160', 24); drop('tile-160', 24);
  assert.equal(batches.length, 2); assert.deepEqual(batches[1].map(e => e.op), ['decoration-remove', 'decoration-place']);
  assert.deepEqual(current.map.decorations.map(d => d.definitionRef), ['tile-161', 'piece', 'tile-160']);
  assert.deepEqual(current.map.decorations[0], under);
  current = { ...current, selectionGroups: [{ id: 'group', members: [{ layer: 'decorations', id: current.map.decorations.at(-1).id }] }] };
  view.setSource(current); assert.throws(() => drop('tile-161', 24), /組合/);
  current = { ...current, map: { ...current.map, placements: [{ id: 'centre', cityId: null, x: 1, y: 1, componentRef: 'tile-160' }] } };
  view.setSource(current); assert.throws(() => drop('tile-161', 24), /道路或據點/);
  assert.equal(batches.length, 2);
});

test('ordinary drop refreshes map tiles without redrawing the unchanged library; full install restores it', () => {
  const { source } = recipeFixture(), main = canvas(), thumb = canvas();
  let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage() {} });
  view.attach(main, null); view.setAtlas({}); view.setSource(source); view.resize(32, 32); view.fit();
  view.previewMaterial(thumb, 'tile-166'); const draws = thumb.draws.length;
  const next = previewMapEdits(source, [{ op: 'decoration-place', instanceId: 'drop', materialId: 'tile-166', x: 1, y: 1 }]);
  view.setSource(next, true, true); view.pick(24, 24);
  assert.equal(model.selected.cellTileId, 166); assert.equal(thumb.draws.length, draws);
  assert.equal(model.materials.find(m => m.id === 'tile-166').inUse, true);
  view.setSource(source); assert.ok(thumb.draws.length > draws); assert.equal(model.materials.find(m => m.id === 'tile-166').inUse, false);
});

test('one JSON-saved layout edit is reused unchanged by all four seasonal atlases', () => {
  const { source } = recipeFixture(), staged = [], main = canvas();
  source.map.decorations = [];
  source.editorAssets = { seasonAtlases: Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => [season, { url: `/${season}.png` }])) };
  const view = createMapCanvas({ publish() {}, stage: edit => staged.push(edit) });
  view.attach(main, null); view.setSource(source); view.resize(32, 32); view.fit(); view.grid(false);
  view.setAtlas({ season: 'spring' });
  view.previewPlacement('tile-166', 1, 1); view.commitPlacement();
  assert.equal(staged.length, 1);
  const saved = JSON.parse(JSON.stringify(previewMapEdits(source, staged))), before = JSON.stringify(saved);
  assert.deepEqual(saved.editorAssets, source.editorAssets);
  assert.equal(saved.map.decorations.at(-1).definitionRef, 'tile-166');
  view.setSource(saved);
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const atlas = { season }; main.draws.length = 0; view.setAtlas(atlas);
    assert.ok(main.draws.some(row => row[0] === 'image' && row[1] === atlas && row.slice(2).join(',') === '96,160,16,16,0,0,16,16'), `${season} uses the saved tile at the same cell`);
    assert.equal(JSON.stringify(saved), before, 'atlas changes do not create or mutate seasonal layouts');
  }
});

test('private recipe thumbnails and ghosts use exact cells and never leak plans to DTOs or source', () => {
  const { source, recipe } = recipeFixture(), original = JSON.stringify(source), main = canvas(), thumb = canvas();
  let model;
  const view = createMapCanvas({ spriteRecipes: [recipe], publish: value => { model = value; }, stage: () => assert.fail('preview must not stage') });
  view.attach(main, null); view.setSource(source); view.grid(false);
  const id = `catalog:${recipe.itemId}`, row = model.catalogItems.find(item => item.id === id);
  assert.deepEqual(Object.keys(row).sort(), ['available', 'canPlace', 'category', 'cells', 'id', 'itemId', 'layer', 'name', 'note']);
  assert.equal(row.available, true); assert.equal(row.canPlace, true); assert.equal(row.cells, 4);
  assert.match(row.note, /7條命令/);
  assert.equal(model.materials.some(item => item.id === id), false);
  row.name = 'changed DTO'; recipe.tiles[0][2] = 0;
  const previousRatio = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  try {
    for (const ratio of [1, 2]) {
      Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: ratio });
      view.resize(32, 32); view.fit();
      for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        const atlas = { season }; view.setAtlas(atlas); thumb.draws.length = 0; main.draws.length = 0;
        view.previewMaterial(thumb, id);
        assert.deepEqual([thumb.width, thumb.height, thumb.style.width, thumb.style.height], [64 * ratio, 64 * ratio, '64px', '64px']);
        const images = thumb.draws.filter(row => row[0] === 'image');
        assert.equal(images.length, 4); assert.ok(images.every(row => row[1] === atlas));
        const expected = [[96, 160, 16, 16], [0, 160, 16, 16], [16, 160, 16, 16], [224, 160, 16, 16]];
        assert.deepEqual(images.map(row => row.slice(2, 6)), expected);
        assert.deepEqual(view.previewPlacement(id, 1, 1), { materialId: id, x: 0, y: 0, inBounds: true });
        const ghosts = main.draws.filter(row => row[0] === 'image-alpha' && row[1] === 0.5);
        assert.deepEqual(ghosts.map(row => row.slice(3, 7)), expected);
        assert.deepEqual(ghosts.map(row => row.slice(-4)), [[0, 0, 16, 16], [16, 0, 16, 16], [0, 16, 16, 16], [16, 16, 16, 16]]);
        view.cancelPlacement();
      }
    }
  } finally {
    if (previousRatio) Object.defineProperty(globalThis, 'devicePixelRatio', previousRatio);
    else delete globalThis.devicePixelRatio;
  }
  assert.equal(JSON.stringify(source), original);
  view.grid(true); assert.equal(model.catalogItems.find(item => item.id === id).name, '工程夾具');
});

test('recipe canvas commits one real command batch and rebuilds reuse plans on source changes', () => {
  const { source, recipe } = recipeFixture(), main = canvas(), batches = [], original = JSON.stringify(source);
  let candidate = source, model;
  const view = createMapCanvas({ spriteRecipes: [recipe], publish: value => { model = value; }, stage(batch) {
    batches.push(batch); candidate = previewMapEdits(candidate, batch); view.setSource(candidate); return 'staged';
  } });
  view.attach(main, null); view.setSource(source); view.setAtlas({});
  const id = `catalog:${recipe.itemId}`;
  view.previewPlacement(id, 1, 1); assert.equal(view.commitPlacement(), 'staged'); view.commitPlacement();
  assert.equal(batches.length, 1); assert.equal(batches[0].length, 7);
  assert.deepEqual(batches[0].map(edit => edit.op), ['decoration-place', 'decoration-place', 'decoration-place', 'decoration-place', 'material-capture', 'decoration-remove', 'decoration-place']);
  const materialId = batches[0][4].materialId;
  assert.equal(candidate.map.decorations.length, source.map.decorations.length + 1);
  assert.equal(Object.keys(candidate.componentDefinitions).length, Object.keys(source.componentDefinitions).length + 1);
  assert.deepEqual(candidate.componentDefinitions[materialId].variants.original.tiles, recipe.tiles);
  assert.deepEqual(candidate.map.base, source.map.base);
  assert.match(model.catalogItems.find(item => item.id === id).note, /復用本圖完整配方；1條命令/);
  view.previewPlacement(id, 1, 1); view.commitPlacement();
  assert.equal(batches[1].length, 1); assert.equal(batches[1][0].materialId, materialId);
  assert.equal(Object.keys(candidate.componentDefinitions).length, Object.keys(source.componentDefinitions).length + 1);
  candidate = source; view.setSource(source);
  assert.match(model.catalogItems.find(item => item.id === id).note, /7條命令/);
  view.pick(1, 1); view.command('decoration-place', { materialId: id });
  assert.equal(batches[2].length, 7, 'command entry follows the same plan instead of dereferencing a fake source definition');
  assert.equal(JSON.stringify(source), original);
});

test('recipe previews reject readonly or missing atoms and clear on every workspace cancellation', () => {
  const { source, recipe } = recipeFixture(), main = canvas(), thumb = canvas(); let calls = 0, model;
  const reference = { ...recipe, itemId: 'reference', support: 'reference-only' };
  const view = createMapCanvas({ spriteRecipes: [recipe, reference], publish: value => { model = value; }, stage() { calls++; throw new Error('budget rejected'); } });
  const id = `catalog:${recipe.itemId}`;
  view.attach(main, null); view.setSource(source); view.setAtlas({});
  assert.equal(view.previewPlacement('catalog:reference', 1, 1), null);
  view.previewMaterial(thumb, 'catalog:reference'); assert.equal(thumb.draws.filter(row => row[0] === 'image').length, 4);
  view.pick(1, 1); assert.throws(() => view.command('decoration-place', { materialId: 'catalog:reference' }), /不可放置/);
  assert.equal(view.previewPlacement(id, 31, 31).inBounds, false); view.commitPlacement();
  for (const cancel of [() => view.cancelPlacement(), () => view.setAtlas(null), () => view.setSource(source),
    () => view.resize(32, 32), () => view.pan(0, 0), () => view.zoom(1), () => view.fit(),
    () => view.layer('decor', 'locked', true), () => view.layer('decor', 'visible', false), () => view.setSource(null)]) {
    view.setSource(source); view.setAtlas({}); view.layer('decor', 'locked', false); view.layer('decor', 'visible', true); view.fit();
    assert.equal(view.previewPlacement(id, 1, 1).inBounds, true); cancel(); view.commitPlacement();
  }
  assert.equal(calls, 0);
  assert.equal(model.catalogItems.find(item => item.id === id).available, false);
  thumb.draws.length = 0; view.previewMaterial(thumb, id);
  assert.equal(thumb.draws.some(row => row[0] === 'image'), false, 'source reset cannot retain a private recipe texture');
  const changed = structuredClone(source); changed.componentDefinitions['tile-166'].revision = 'not-original';
  view.setSource(changed); view.setAtlas({}); assert.equal(view.previewPlacement(id, 1, 1), null);
  assert.equal(model.catalogItems.find(item => item.id === id).available, false);
  view.setSource(source); view.previewPlacement(id, 1, 1);
  assert.throws(() => view.commitPlacement(), /budget rejected/); view.commitPlacement(); assert.equal(calls, 1);
});

test('recipe canvas preserves transparent anchor cells through preview and material capture', () => {
  const { source, recipe } = recipeFixture(), main = canvas(), thumb = canvas(), batches = [];
  recipe.tiles = recipe.tiles.slice(1, 3); recipe.footprint = recipe.tiles.map(([x, y]) => [x, y]);
  const view = createMapCanvas({ spriteRecipes: [recipe], publish() {}, stage: batch => batches.push(batch) });
  view.attach(main, null); view.setSource(source); view.setAtlas({}); view.grid(false);
  const id = `catalog:${recipe.itemId}`;
  view.previewMaterial(thumb, id); main.draws.length = 0; view.previewPlacement(id, 1, 1);
  assert.deepEqual(thumb.draws.filter(row => row[0] === 'image').map(row => row.slice(-4)), [[32, 0, 32, 32], [0, 32, 32, 32]]);
  assert.deepEqual(main.draws.filter(row => row[0] === 'image-alpha' && row[1] === 0.5).map(row => row.slice(-4)), [[16, 0, 16, 16], [0, 16, 16, 16]]);
  view.commitPlacement(); assert.equal(batches[0].length, 5);
  const candidate = previewMapEdits(source, batches[0]);
  assert.deepEqual(candidate.componentDefinitions[batches[0][2].materialId].footprint, [[1, 0], [0, 1]]);
});

test('workspace rejects retired manual fill and water visibility actions without staging', () => {
  const source = fixture(), original = JSON.stringify(source), commands = [], main = canvas();
  const view = createMapCanvas({ publish() {}, stage: edit => commands.push(edit) });
  view.attach(main, null); view.setSource(source); view.setAtlas({}); view.fit();
  view.layer('decor', 'locked', true); view.pick(1, 1);
  for (const operation of ['base-fill', 'base-fill-rectangle', 'water-visibility']) {
    assert.throws(() => view.command(operation, { width: 2, height: 2, tile: 95, geography: 1 }), /海域基底固定/);
  }
  assert.deepEqual(commands, []);
  assert.equal(JSON.stringify(source), original);
});

test('placement preview snaps its anchor, preserves holes and commits at most once', () => {
  const source = fixture(), original = JSON.stringify(source), main = canvas(), commands = [];
  const view = createMapCanvas({ publish() {}, stage: command => { commands.push(command); return 'staged'; } });
  view.attach(main, null); view.setSource(source); view.setAtlas({}); view.grid(false);
  const previousRatio = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  try {
    for (const ratio of [1, 1.25, 2]) {
      Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: ratio });
      view.resize(32, 32); view.fit(); main.draws.length = 0;
      const pending = view.previewPlacement('piece', 1, 1);
      assert.deepEqual(pending, { materialId: 'piece', x: 0, y: 0, inBounds: true });
      const outlines = main.draws.filter(row => row[0] === 'stroke');
      assert.equal(outlines.length, 3, 'only actual footprint cells, never its bounding rectangle');
      assert.deepEqual(main.draws.filter(row => row[0] === 'image-alpha' && row[1] === 0.5).map(row => row.slice(-4)), outlines.map(row => row.slice(1)), 'DPR does not separate texture from footprint');
      assert.equal(commands.length, 0);
      pending.x = 99;
      view.cancelPlacement(); assert.equal(view.commitPlacement(), undefined);
    }
    view.previewPlacement('piece', 1, 1);
    assert.equal(view.commitPlacement(), 'staged'); view.commitPlacement();
    assert.equal(commands.length, 1);
    assert.equal(commands[0].x, 0); assert.equal(commands[0].y, 0);
    assert.equal(commands[0].op, 'decoration-place');
    assert.equal(commands[0].materialId, 'piece');
    assert.equal(commands[0].variantRef, 'original');
    assert.equal(JSON.stringify(source), original, 'stage owns edits, preview never mutates source');
  } finally {
    if (previousRatio) Object.defineProperty(globalThis, 'devicePixelRatio', previousRatio);
    else delete globalThis.devicePixelRatio;
  }
});

test('placement texture uses the current atlas, exact variant tiles and temporary opacity', () => {
  const source = fixture(), original = JSON.stringify(source), main = canvas();
  const view = createMapCanvas({ publish() {}, stage: () => assert.fail('ghost drawing must not stage') });
  view.attach(main, null); view.setSource(source); view.grid(false);
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const atlas = { season }; view.setAtlas(atlas); main.draws.length = 0;
    view.previewPlacement('piece', 1, 1);
    const ghosts = main.draws.filter(row => row[0] === 'image-alpha' && row[1] === 0.5);
    assert.equal(ghosts.length, 3, 'draw tile cells only, preserving the footprint hole');
    assert.ok(ghosts.every(row => row[2] === atlas));
    assert.deepEqual(ghosts.map(row => row.slice(3, 7)), [[0, 16, 16, 16], [16, 16, 16, 16], [32, 16, 16, 16]]);
    assert.deepEqual(ghosts.map(row => row.slice(-4)), [[0, 0, 16, 16], [16, 0, 16, 16], [0, 16, 16, 16]]);
    assert.equal(main.getContext('2d').globalAlpha, 1, 'outline and subsequent map renders remain opaque');
    main.draws.length = 0; view.cancelPlacement();
    assert.equal(main.draws.some(row => row[0] === 'image-alpha' && row[1] !== 1), false);
  }
  view.previewPlacement('piece', 1, 1); main.draws.length = 0; view.setAtlas(null);
  assert.equal(main.draws.some(row => row[0] === 'image-alpha'), false, 'an invalid atlas clears the texture and preview');
  assert.equal(JSON.stringify(source), original);
});

test('placement keeps nonzero anchors and fractional zoom coordinates at commit', () => {
  const source = fixture(), main = canvas(), commands = [];
  source.componentDefinitions.offset = { ...source.componentDefinitions.piece, id: 'offset', anchor: [1, 1] };
  const view = createMapCanvas({ publish() {}, stage: command => commands.push(command) });
  view.attach(main, null); view.setSource(source); view.setAtlas({}); view.grid(false);
  view.zoom(1.25); main.draws.length = 0;
  assert.deepEqual(view.previewPlacement('offset', 25, 25), { materialId: 'offset', x: 1, y: 1, inBounds: true });
  const outlines = main.draws.filter(row => row[0] === 'stroke').map(row => row.slice(1));
  assert.equal(outlines.length, 3);
  assert.deepEqual(main.draws.filter(row => row[0] === 'image-alpha' && row[1] === 0.5).map(row => row.slice(-4)), outlines, 'offset anchor and fractional zoom align texture with outlines');
  [[-4, -4, 20, 20], [16, -4, 20, 20], [-4, 16, 20, 20]].forEach((expected, index) => {
    expected.forEach((value, axis) => assert.ok(Math.abs(outlines[index][axis] - value) < 1e-10));
  });
  view.commitPlacement();
  assert.equal(commands[0].x, 1); assert.equal(commands[0].y, 1);
  assert.equal(commands[0].materialId, 'offset');
  assert.equal(view.previewPlacement('offset', 1, 1).inBounds, false, 'anchor offset cannot hide negative footprint cells');
  view.commitPlacement(); assert.equal(commands.length, 1);
});

test('placement rejects overflow and cancels on invalid input or changed workspace', () => {
  const source = fixture(), main = canvas(); let calls = 0;
  const view = createMapCanvas({ publish() {}, stage() { calls++; throw new Error('stage rejected'); } });
  view.attach(main, null); view.setSource(source); view.setAtlas({});
  assert.equal(view.previewPlacement('piece', 31, 31).inBounds, false);
  view.commitPlacement(); assert.equal(calls, 0);
  for (const args of [['missing', 1, 1], ['piece', -1, 1], ['piece', 32, 1], ['piece', 1, NaN], ['piece', 1, Infinity]]) {
    view.previewPlacement('piece', 1, 1);
    assert.equal(view.previewPlacement(...args), null); view.commitPlacement();
  }
  const cancellations = [
    () => view.cancelPlacement(), () => view.setAtlas(null), () => view.setSource(source),
    () => view.layer('decor', 'locked', true), () => view.layer('decor', 'visible', false),
    () => view.resize(32, 32), () => view.pan(1, 0), () => view.zoom(1.25), () => view.fit(),
  ];
  cancellations.forEach(cancel => {
    view.layer('decor', 'locked', false); view.layer('decor', 'visible', true);
    view.setAtlas({}); view.fit(); view.previewPlacement('piece', 1, 1);
    cancel(); view.commitPlacement(); assert.equal(calls, 0);
  });
  view.layer('decor', 'locked', true);
  assert.equal(view.previewPlacement('piece', 1, 1), null);
  view.layer('decor', 'locked', false); view.setAtlas({}); view.fit();
  view.previewPlacement('piece', 1, 1);
  assert.throws(() => view.commitPlacement(), /stage rejected/);
  view.commitPlacement(); assert.equal(calls, 1, 'failed stage cannot replay a consumed gesture');
});

test('material previews preserve native pixels, holes and season changes without editing', () => {
  const source = fixture(), original = JSON.stringify(source), target = canvas();
  const view = createMapCanvas({ publish() {}, stage: () => assert.fail('preview must not stage') });
  const previousRatio = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  try {
    view.setSource(source);
    for (const ratio of [1, 1.25, 2]) {
      Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: ratio });
      view.previewMaterial(target, 'piece');
      assert.deepEqual(target.style, { width: '64px', height: '64px' });
      assert.equal(target.width, 64 * ratio); assert.equal(target.height, 64 * ratio);
      for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        const atlas = { season }; target.draws.length = 0; view.setAtlas(atlas);
        const images = target.draws.filter(row => row[0] === 'image');
        assert.equal(images.length, 3, 'footprint hole stays clear');
        assert.ok(images.every(row => row[1] === atlas));
        assert.deepEqual(images.map(row => row.slice(-4)), [[0, 0, 32, 32], [32, 0, 32, 32], [0, 32, 32, 32]]);
        assert.ok(target.draws.some(row => row[0] === 'transform' && row[1] === ratio && row[4] === ratio));
        assert.equal(target.getContext('2d').imageSmoothingEnabled, false);
      }
    }
    target.draws.length = 0; view.setAtlas(null);
    assert.ok(target.draws.some(row => row[0] === 'clear'));
    assert.equal(target.draws.some(row => row[0] === 'image'), false, 'unready atlas never retains previous season');
    view.setAtlas({}); target.draws.length = 0; view.setSource(null);
    assert.ok(target.draws.some(row => row[0] === 'clear'));
    assert.equal(target.draws.some(row => row[0] === 'image'), false, 'source removal clears registered previews');
    view.previewMaterial(null, 'piece'); target.draws.length = 0; view.setSource(source);
    assert.equal(target.draws.length, 0, 'unmounted previews are no longer redrawn');
    const wide = structuredClone(source);
    wide.componentDefinitions.wide = { ...wide.componentDefinitions.piece, id: 'wide', anchor: [-2, 0], footprint: [[-2, 0], [4, 0]], variants: { original: { tiles: [[-2, 0, 16], [4, 0, 17]] } } };
    view.setSource(wide); view.setAtlas({}); target.draws.length = 0;
    view.previewMaterial(target, 'wide');
    assert.deepEqual(target.style, { width: '224px', height: '32px' }, 'wide components are not shrunk to fit a card');
    assert.deepEqual(target.draws.filter(row => row[0] === 'image').map(row => row.slice(-4)), [[0, 0, 32, 32], [192, 0, 32, 32]], 'negative local origin and holes are retained');
    assert.equal(JSON.stringify(source), original);
  } finally {
    if (previousRatio) Object.defineProperty(globalThis, 'devicePixelRatio', previousRatio);
    else delete globalThis.devicePixelRatio;
  }
});

test('grid is display-only, DPR changes backing pixels, and resize preserves the world center', () => {
  const source = fixture(), main = canvas(); let model;
  source.map.bounds = { minX: 0, minY: 0, width: 100, height: 100, tileSize: 16 };
  source.map.base.terrainRef = Array(10000).fill(16);
  source.map.base.geography = Array(10000).fill(0);
  const original = JSON.stringify(source);
  const view = createMapCanvas({ publish: value => { model = value; }, stage: () => assert.fail('presentation must not stage edits') });
  view.attach(main, null); view.setSource(source); view.setAtlas({});
  view.zoom(64); view.locate(0.5, 0.5);
  main.draws.length = 0; view.grid(true);
  assert.equal(model.gridVisible, true);
  assert.deepEqual(main.draws.filter(row => row[0] === 'grid'), [
    ['grid', 2, 'rgba(0, 0, 0, 0.45)'], ['grid', 1, 'rgba(255, 255, 255, 0.55)'],
  ]);
  const boundaries = main.draws.filter(row => row[0] === 'move').map(row => JSON.stringify(row));
  assert.equal(main.draws.filter(row => row[0] === 'begin').length, 1);
  // The top-left point starts both a horizontal and a vertical segment.
  assert.equal(new Set(boundaries).size, boundaries.length - 1);
  assert.equal(main.draws.filter(row => row[0] === 'line').length, boundaries.length);
  main.draws.length = 0; view.grid(false);
  assert.equal(main.draws.some(row => row[0] === 'grid' || row[0] === 'stroke'), false);
  view.pick(16, 16); const center = [model.selected.x, model.selected.y], zoom = model.zoom;
  const previousRatio = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 2 });
  try {
    view.resize(64, 48); view.pick(32, 24);
    assert.deepEqual([model.selected.x, model.selected.y], center);
    assert.equal(model.zoom, zoom);
    assert.equal(main.width, 128); assert.equal(main.height, 96);
    assert.ok(main.draws.some(row => row[0] === 'transform' && row[1] === 2 && row[4] === 2));
    main.draws.length = 0; view.grid(true);
    assert.deepEqual(main.draws.filter(row => row[0] === 'grid').map(row => row[1]), [2, 1], 'DPR does not change CSS line widths');
    view.zoom(1.25); main.draws.length = 0; view.grid(true);
    assert.deepEqual(main.draws.filter(row => row[0] === 'grid').map(row => row[1]), [2, 1], 'fractional zoom does not change CSS line widths');
    view.fit(); main.draws.length = 0; view.grid(true);
    assert.equal(main.draws.some(row => row[0] === 'grid'), false);
    assert.equal(main.draws.filter(row => row[0] === 'stroke').length, 1, 'dense grid omitted; only selected cell outline remains');
    assert.equal(JSON.stringify(source), original);
  } finally {
    if (previousRatio) Object.defineProperty(globalThis, 'devicePixelRatio', previousRatio);
    else delete globalThis.devicePixelRatio;
  }
});

test('Web group selection uses member footprints and never authorizes group topology edits', () => {
  const source = fixture(), main = canvas(); let model;
  source.selectionGroups = [{ id: 'group-1', label: 'mountain-pattern', members: [{ layer: 'decorations', id: 'piece-1' }] }];
  const before = JSON.stringify(source), view = createMapCanvas({ publish: value => { model = value; }, stage: () => assert.fail('selection must not write') });
  view.attach(main, null); view.setSource(source); view.selectGroup('group-1');
  assert.equal(model.groups[0].name, '山紋片段'); assert.equal(model.selected.cells, 3);
  assert.equal(model.selected.members, 1); assert.equal(model.selected.layer, 'group');
  assert.throws(() => view.command('decoration-translate', { dx: 1, dy: 0 }), /裝飾片段/);
  view.layer('decor', 'locked', true); view.selectGroup('group-1');
  assert.equal(model.layers.find(row => row.id === 'decor').locked, true);
  assert.equal(JSON.stringify(source), before);
  view.setSource(previewMapEdits(source, [{ op: 'decoration-remove', memberIds: ['piece-1'] }]));
  assert.equal(model.selected, null); assert.deepEqual(model.groups, []);
});

test('capture selected decoration as a reusable material, rename and remove without changing map cells', () => {
  const source = fixture(), commands = [], main = canvas(); let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => commands.push(edit) });
  view.attach(main, null); view.setSource(source); view.pick(8, 8);
  view.command('material-capture', { name: '新素材' });
  const capture = commands.pop(); assert.match(capture.materialId, /^system-base-map#material-[a-f0-9]{64}$/);
  assert.deepEqual(capture.memberIds, ['piece-1']);
  let candidate = previewMapEdits(source, [capture]); view.setSource(candidate);
  const row = model.materials.find(row => row.id === capture.materialId);
  assert.equal(row.editable, true); assert.equal(row.inUse, false); assert.equal(row.cells, 3);
  view.command('material-rename', { materialId: row.id, name: '改名素材' });
  candidate = previewMapEdits(candidate, commands.splice(0)); view.setSource(candidate);
  assert.equal(model.materials.find(item => item.id === row.id).name, '改名素材');
  view.command('material-remove', { materialId: row.id });
  candidate = previewMapEdits(candidate, commands); view.setSource(candidate);
  assert.equal(model.materials.some(item => item.id === row.id), false);
  assert.deepEqual(candidate.map, source.map);
});

test('unknown underlay diagnostics locate the exact base cell without guessing a replacement', () => {
  let model; const commands = [], source = fixture();
  source.map.base.terrainRef = [null, null, null, 16];
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => commands.push(edit) });
  view.setSource(source); assert.equal(model.diagnostics.length, 0);
  const removed = previewMapEdits(source, [{ op: 'decoration-remove', memberIds: ['piece-1'] }]);
  view.setSource(removed); assert.equal(model.diagnostics.length, 3);
  view.focusDiagnostic(2); assert.equal(model.selected.x, 0); assert.equal(model.selected.y, 1);
  assert.throws(() => view.command('base-fill', { tile: 20, geography: 0 }), /海域基底固定/);
  assert.deepEqual(commands, []);
  assert.equal(model.diagnostics.length, 3, 'legacy diagnostics do not restore the retired manual tool');
  assert.equal(removed.map.base.terrainRef[2], null);
  view.setSource(null); assert.deepEqual(model.diagnostics, []);
});

test('native canvas uses tile atlas, footprint hit testing, display-only layer locks and explicit commands', () => {
  let model;
  const source = fixture();
  [16, 17, 18].forEach(tile => {
    const id = 'tile-' + tile;
    source.componentDefinitions[id] = { id, revision: 'test-1', category: 'atomic-original', anchor: [0, 0], footprint: [[0, 0]], visualRef: 'MMAP.MDL:tile-' + tile, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } } };
  });
  source.componentDefinitions['deco-grass'] = { ...source.componentDefinitions['tile-16'], id: 'deco-grass' };
  const original = JSON.stringify(source), commands = [], main = canvas(), mini = canvas();
  const view = createMapCanvas({ publish: value => { model = value; }, stage: command => commands.push(command) });
  view.attach(main, mini); view.setSource(source); view.setAtlas({});
  assert.equal(main.draws.filter(row => row[0] === 'image').length, 4);
  assert.deepEqual(model.materials.filter(row => row.originalAtom).map(row => row.id), ['tile-16', 'tile-17', 'tile-18']);
  assert.ok(model.materials.filter(row => row.originalAtom).every(row => !row.editable), 'reference classification does not grant author mutation rights');
  assert.ok(model.materials.some(row => !row.originalAtom), 'historical pieces stay outside the atom reference view');
  assert.equal(model.materials.find(row => row.id === 'deco-grass').originalAtom, false, 'legacy aliases sharing atomic category are not a second canonical byte');
  view.pick(24, 24); assert.equal(model.selected.layer, 'base', 'footprint hole only supplies a placement coordinate');
  assert.throws(() => view.command('base-fill', { tile: 20, geography: 0 }), /海域基底固定/);
  assert.deepEqual(commands, []);
  view.pick(8, 24); assert.equal(model.selected.id, 'piece-1');
  assert.throws(() => view.command('base-fill', { tile: 20, geography: 0 }), /海域基底固定/);
  view.command('decoration-split');
  const split = commands.at(-1); assert.equal(split.childIds.length, 3);
  assert.ok(split.childIds.every(id => /^system-base-map#decoration-[a-f0-9]{64}$/.test(id)));
  assert.equal(new Set(split.childIds).size, 3);
  view.setSource(previewMapEdits(source, [split])); assert.equal(model.selected, null);
  view.layer('decor', 'locked', true); view.pick(8, 8); assert.equal(model.selected.layer, 'base');
  assert.throws(() => view.command('decoration-remove'), /裝飾/);
  view.layer('decor', 'visible', false); view.layer('base', 'visible', false);
  assert.ok(main.draws.some(row => row[0] === 'fill'), 'hidden underlying unknown is drawn explicitly');
  view.pan(10, 10); view.zoom(2); view.fit(); view.locate(0.5, 0.5);
  assert.equal(JSON.stringify(source), original, 'drawing and navigation never modify the source');
  assert.equal(mini.width, 250); assert.equal(mini.height, 167);
  view.setSource(null); assert.equal(model.loaded, false); assert.equal(model.selected, null);
});

test('only the clicked 205 cell of a decoration can stamp and bind a city in one edit', () => {
  const source = fixture(), commands = []; let model;
  source.componentDefinitions.piece.variants.original.tiles = [[0, 0, 255], [1, 0, 205], [0, 1, 18]];
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => commands.push(edit) });
  view.attach(canvas(), null); view.setSource(source);
  view.pick(8, 8); assert.equal(model.selectedBinding, null);
  view.pick(24, 8); assert.deepEqual(model.selectedBinding, { pieceId: null, cityId: null, x: 1, y: 0 });
  source.map.placements.push({ id: 'later', x: 0, y: 1, componentRef: 'piece', variantRef: 'original', cityId: null });
  assert.throws(() => view.command('city-bind', { pieceId: null, cityId: 'test-city' }), /\(1, 0\).*\(0, 1\)/);
  assert.deepEqual(commands, [], '失敗的綁定不得留下 stamp 或 bind 命令');
  source.map.placements.pop();
  view.command('city-bind', { pieceId: null, cityId: 'test-city' });
  const pieceId = commands[0][0].pieceId;
  assert.deepEqual(commands, [[{ op: 'city-stamp', pieceId, x: 1, y: 0, tile: 205 }, { op: 'city-bind', pieceId, cityId: 'test-city' }]]);
});

test('base cell supplies only a city placement coordinate, never a movable decoration', () => {
  const source = fixture(), commands = []; let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => commands.push(edit) });
  view.attach(canvas(), null); view.setSource(source); view.pick(24, 24);
  assert.equal(model.selected.layer, 'base');
  assert.equal(view.beginObjectMove(24, 24), false);
  for (const op of ['decoration-remove', 'decoration-split', 'decoration-reorder', 'material-capture']) {
    assert.throws(() => view.command(op), /裝飾/);
  }
  view.command('city-stamp', { tile: 205 });
  assert.equal(commands.length, 1);
  assert.deepEqual({ ...commands[0], pieceId: 'generated' }, { op: 'city-stamp', pieceId: 'generated', x: 1, y: 1, tile: 205 });
});

test('city-group decoration-place stages prechecked materialized plans only with caller-issued cityId', () => {
  const item = cityGroupCatalog.items.find(row => row.itemId === 'city-group-common-v1');
  const source = { cities: {}, componentDefinitions: {}, map: {
    bounds: { minX: 0, minY: 0, width: 8, height: 8, tileSize: 16 },
    base: { terrainRef: [16, 16, 16, 16], geography: [0, 0, 0, 0], unknownUnderlays: {} },
    decorations: [], roads: [], placements: [], waterGroups: [] } };
  for (const tile of new Set(item.rows.flat())) {
    const id = `tile-${tile}`;
    source.componentDefinitions[id] = { id, revision: 'original-byte-1', category: 'atomic-original', anchor: [0, 0],
      footprint: [[0, 0]], visualRef: `MMAP.MDL:${id}`, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } } };
  }
  const staged = [], main = canvas();
  const view = createMapCanvas({ publish() {}, stage: edit => staged.push(edit) });
  source.map.base.terrainRef = Array(64).fill(16);
  source.map.base.geography = Array(64).fill(0);
  view.attach(main, null); view.setSource(source);
  view.pick(16, 16);
  const id = `catalog:${item.itemId}`;
  // No caller-issued cityId: legacy preview-only refusal, nothing staged.
  assert.throws(() => view.command('decoration-place', { materialId: id, cityType: 1 }), /僅供預覽/);
  assert.deepEqual(staged, []);
  // cityType outside the recipe gate is rejected by the precheck.
  assert.throws(() => view.command('decoration-place', { materialId: id, cityId: 'test-city-1', cityType: 0 }), /do not include/);
  assert.deepEqual(staged, []);
  const before = JSON.stringify(source);
  view.command('decoration-place', { materialId: id, cityId: 'test-city-1', cityType: 1 });
  assert.equal(staged.length, 1);
  const [edit] = staged;
  assert.equal(edit.op, 'city-group-place');
  assert.equal(edit.materialized.cityId, 'test-city-1');
  assert.equal(edit.materialized.decorations.length, item.rows.flat().length - item.gates.length);
  assert.deepEqual(edit.materialized.ports.map(port => port.portId), item.gates.map((_, gateIndex) => `test-city-1:${gateIndex}`));
  assert.equal(edit.materialized.group.id, 'city-group-test-city-1');
  assert.equal(JSON.stringify(source), before, 'staging never writes the source');
});

function multiFixture() {
  const atom = id => ({ id, revision: 'test-1', category: 'atomic-original', anchor: [0, 0],
    footprint: [[0, 0]], visualRef: `MMAP.MDL:${id}`, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, 16]] } } });
  return { cities: {}, componentDefinitions: { 'tile-16': atom('tile-16') }, selectionGroups: [], map: {
    bounds: { minX: 0, minY: 0, width: 5, height: 4, tileSize: 16 },
    base: { terrainRef: Array(20).fill(16), geography: Array(20).fill(0), unknownUnderlays: {} },
    decorations: [
      { id: 'a', definitionRef: 'tile-16', variantRef: 'original', x: 0, y: 0 },
      { id: 'b', definitionRef: 'tile-16', variantRef: 'original', x: 1, y: 0 },
      { id: 'c', definitionRef: 'tile-16', variantRef: 'original', x: 2, y: 0 },
    ],
    roads: [{ id: 'r1', geometry: [{ x: 4, y: 3 }] }],
    placements: [{ id: 'p1', cityId: null, x: 0, y: 3, componentRef: 'tile-16', variantRef: 'original' }],
    waterGroups: [] } };
}

test('rectangle adds topmost eligible objects once across all cells, in either direction', () => {
  const source = multiFixture();
  source.selectionGroups.push({ id: 'web-piece-group-1', label: 'group', members: ['a', 'b'].map(id => ({layer:'decorations', id})) });
  let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage: () => assert.fail('selection is not an edit') });
  view.attach(canvas(), null); view.setSource(source); view.setAtlas({});
  view.toggleMulti(3.2, 6.4);
  view.toggleMulti(16, 25.6, 3.2, 6.4);
  assert.deepEqual(model.multi.map(row => row.id), ['web-piece-group-1', 'c']);
  view.toggleMulti(3.2, 6.4, 1000, 1000);
  assert.deepEqual(model.multi.map(row => row.id), ['web-piece-group-1', 'c']);
});

test('shift-click toggles multi-select, combine regroups and disbands in one undo unit', () => {
  const source = multiFixture(), main = canvas(), staged = [];
  let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => { staged.push(edit); return 'staged'; } });
  view.attach(main, null); view.setSource(source); view.setAtlas({});
  // fit state: zoom 0.4, origin (0,-8); cell (x,y) centre screens at ((x+0.5)*6.4, ((y+0.5)*16+8)*0.4).
  assert.deepEqual(view.toggleMulti(22.4, 6.4), { toggled: false });
  assert.deepEqual(model.multi, []);
  assert.equal(view.toggleMulti(28.8, 25.6).rejected, 'road');
  assert.equal(view.toggleMulti(3.2, 25.6).rejected, 'city');
  assert.deepEqual(model.multi, []);
  assert.deepEqual(view.toggleMulti(3.2, 6.4), { toggled: true, multi: [{ kind: 'decor', id: 'a' }] });
  assert.deepEqual(model.multi, [{ kind: 'decor', id: 'a' }]);
  view.toggleMulti(9.6, 6.4);
  assert.deepEqual(model.multi.map(m => m.id), ['a', 'b']);
  view.toggleMulti(3.2, 6.4);
  assert.deepEqual(model.multi.map(m => m.id), ['b']);
  assert.deepEqual(view.groupSelection(), { error: 'at-least-two' });
  assert.deepEqual(view.ungroupSelection(), { noop: true });
  assert.deepEqual(staged, []);
  view.toggleMulti(16, 6.4);
  assert.deepEqual(view.groupSelection(), { grouped: true });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].length, 1);
  assert.equal(staged[0][0].op, 'decoration-combine');
  assert.deepEqual(staged[0][0].memberIds, ['b', 'c']);
  assert.match(staged[0][0].instanceId, /^system-base-map#decoration-[0-9a-f]{64}$/);
  assert.deepEqual(model.multi, []);
  const gid = staged[0][0].instanceId;
  const moved = previewMapEdits(source, staged[0]);
  view.setSource(moved);
  view.toggleMulti(9.6, 6.4);
  assert.deepEqual(model.multi, [{ kind: 'decor', id: gid }]);
  assert.deepEqual(moved.selectionGroups, []);
  const dis = view.ungroupSelection();
  assert.deepEqual(dis, { ungrouped: [], split: 1 });
  assert.equal(staged.length, 2);
  assert.equal(staged[1][0].op, 'decoration-split');
  assert.equal(staged[1][0].instanceId, gid);
  const child = staged[1][0].childIds[0];
  assert.deepEqual(model.multi, []);
  view.setSource(previewMapEdits(moved, staged[1]));
  view.pick(3.2, 6.4);
  assert.equal(model.selected.id, 'a');
  view.toggleMulti(9.6, 6.4);
  assert.deepEqual(model.multi.map(m => m.id), ['a', child]);
  assert.equal(model.selected, null);
  assert.equal(view.beginMultiMove(9.6, 6.4), true);
  view.previewObjectMove(16, 6.4);
  view.commitObjectMove();
  assert.equal(staged.length, 3);
  assert.deepEqual(staged[2].map(edit => edit.op), ['decoration-translate', 'decoration-reorder']);
  assert.deepEqual(staged[2][0].memberIds, ['a', child]);
  assert.deepEqual([staged[2][0].dx, staged[2][0].dy], [1, 0]);
  assert.equal(staged[2][1].direction, 'top');
});

test('legacy web-piece groups select as groups and disband through the generic path', () => {
  const source = multiFixture(), main = canvas(), staged = [];
  let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => { staged.push(edit); return 'staged'; } });
  const withLegacy = previewMapEdits(source, [{ op: 'decoration-group', memberIds: ['a', 'b'], groupId: 'web-piece-group-7' }]);
  assert.deepEqual(withLegacy.selectionGroups.map(g => g.id), ['web-piece-group-7']);
  view.attach(main, null); view.setSource(withLegacy); view.setAtlas({});
  view.toggleMulti(9.6, 6.4);
  assert.deepEqual(model.multi, [{ kind: 'group', id: 'web-piece-group-7' }]);
  view.toggleMulti(16, 6.4);
  assert.deepEqual(model.multi.map(m => m.id), ['web-piece-group-7', 'c']);
  const combined = view.groupSelection();
  assert.deepEqual(combined, { grouped: true });
  assert.equal(staged.length, 1);
  assert.deepEqual(staged[0].map(edit => edit.op), ['decoration-combine']);
  assert.deepEqual(staged[0][0].memberIds, ['a', 'b', 'c']);
  assert.match(staged[0][0].instanceId, /^system-base-map#decoration-[0-9a-f]{64}$/);
  const merged = previewMapEdits(withLegacy, staged[0]);
  assert.deepEqual(merged.selectionGroups, []);
  assert.equal(merged.map.decorations.length, 1);
  assert.deepEqual(model.multi, []);
});

test('disband flattens grouped and already-ungrouped fragments into individually selectable cells', () => {
  for (const grouped of [false, true]) {
    const source = fixture(), batches = []; let model, current = source;
    for (const tile of [16, 17, 18]) source.componentDefinitions[`atom-${tile}`] = {
      ...source.componentDefinitions.piece, id: `atom-${tile}`, footprint: [[0, 0]],
      variants: { original: { tiles: [[0, 0, tile]] } },
    };
    source.selectionGroups = grouped ? [{ id: 'web-piece-group-7', members: [{ layer: 'decorations', id: 'piece-1' }] }] : [];
    const view = createMapCanvas({ publish: value => { model = value; }, stage: edits => {
      const next = previewMapEdits(current, edits);
      batches.push(edits); current = JSON.parse(JSON.stringify(next)); view.setSource(current); return true;
    } });
    view.attach(canvas(), null); view.setSource(source); view.pick(8, 8);
    const result = view.ungroupSelection();
    assert.equal(result.split, 1);
    assert.equal(batches.length, 1, 'one controller undo unit');
    assert.deepEqual(batches[0].map(edit => edit.op), grouped ? ['decoration-ungroup', 'decoration-split'] : ['decoration-split']);
    assert.deepEqual(current.selectionGroups, []);
    assert.equal(current.map.decorations.length, 3);
    const ids = new Set();
    for (const [x, y] of [[1, 0], [0, 1], [0, 0]]) {
      view.pick(x * 16 + 8, y * 16 + 8);
      assert.equal(model.selected.cells, 1);
      assert.equal(model.selectedGroup, null);
      ids.add(model.selected.id);
    }
    assert.equal(ids.size, 3);
    // Recombine two new cells, then disband again: no multi-cell fragment returns.
    view.pick(8, 8);
    view.toggleMulti(8, 8); view.toggleMulti(24, 8); view.groupSelection();
    view.ungroupSelection();
    assert.equal(current.map.decorations.length, 3);
    assert.deepEqual(current.selectionGroups, []);
    view.setSource(source); view.pick(8, 8);
    assert.equal(model.selected.cells, 3, 'restoring the previous source restores the whole fragment');
  }
});

test('failed fragment splitting preserves the group and selection; dedicated groups are refused', () => {
  const source = fixture(); let current = source, model;
  source.selectionGroups = [{ id: 'web-piece-group-7', members: [{ layer: 'decorations', id: 'piece-1' }] }];
  const before = JSON.stringify(source);
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edits => { current = previewMapEdits(current, edits); view.setSource(current); } });
  view.attach(canvas(), null); view.setSource(source); view.pick(8, 8);
  assert.throws(() => view.ungroupSelection(), /缺少受信單格/);
  assert.equal(JSON.stringify(current), before);
  assert.equal(model.selected.id, 'piece-1');
  const protectedSource = structuredClone(source);
  protectedSource.selectionGroups[0].id = 'city-group-protected';
  view.setSource(protectedSource);
  assert.deepEqual(view.ungroupSelection(), { error: 'unsupported' });
  assert.equal(JSON.stringify(current), before);
});

test('plain click toggles selection off, single grouped decor disbands its group', () => {
  const source = multiFixture(), main = canvas(), staged = [];
  let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => { staged.push(edit); return 'staged'; } });
  const withLegacy = previewMapEdits(source, [{ op: 'decoration-group', memberIds: ['a', 'b'], groupId: 'web-piece-group-7' }]);
  view.attach(main, null); view.setSource(withLegacy); view.setAtlas({});
  view.pick(3.2, 6.4);
  assert.equal(model.selected.id, 'a');
  view.pick(3.2, 6.4);
  assert.equal(model.selected, null);
  view.pick(9.6, 6.4);
  assert.equal(model.selected.id, 'b');
  assert.equal(model.selectedGroup, 'web-piece-group-7');
  assert.deepEqual(view.ungroupSelection(), { ungrouped: ['web-piece-group-7'] });
  assert.deepEqual(staged, [[{ op: 'decoration-ungroup', groupId: 'web-piece-group-7' }]]);
  assert.deepEqual(model.multi, []);
  assert.equal(model.selected.id, 'b');
});
