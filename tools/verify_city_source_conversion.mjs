// City-slice conversion plus isolated temporary CLI output; no real source writes,
// SAVE, IDB, network, whole-game migration or resource admission.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { convertLegacyCitySource } from '../web/src/content/authoring/citysourceconversion.js';

function fixture() {
  const definitions = Array.from({ length: 192 }, (_, i) => ({
    cityId: `stable-${i}`, runtimeSlot: i, x: i, y: 10, name: `City ${i}`,
    max_prod: 1000, prod: 200, growth: 100, defence: 100, troops: 10, type: 1, view: 2,
  }));
  const game = {
    schemaVersion: 1,
    cities: Object.fromEntries([...definitions].reverse().map(city => [city.cityId, city])),
    map: { placements: [...definitions].reverse().map(({ cityId, x, y }) => ({
      id: `placement-${cityId}`, cityId, x, y, componentRef: 'tile-205',
      variantRef: 'original', importRef: `fixture:cell-${y * 384 + x}`,
    })) },
    chapterOrder: ['a', 'b'],
    chapters: Object.fromEntries(['a', 'b'].map((id, chapter) => [id, { state: {
      cities: definitions.map(({ runtimeSlot: idx }) => ({ idx, faction: null, governor: null,
        prod: 200, growth: 100, defence: 100, troops: 10,
        troops_cap: chapter ? 170 : 20, raw: '00'.repeat(28) + 'ffffffff' })).reverse(),
      factions: [{ idx: 0, capital: 191, strategic_city_primary: null, strategic_city_secondary: null, n_cities: 0 }],
      nativeFactionSlotRaw: Array.from({ length: 22 }, (_, slot) => {
        const bytes = new Uint8Array(64);
        bytes[3] = slot === 0 ? 191 : 255;
        bytes[0x16] = bytes[0x17] = 255;
        return Buffer.from(bytes).toString('hex');
      }),
    } }])),
  };
  return { game, options: { defaultChapterId: 'a', battleMapIds: definitions.map(city => `siege-${city.runtimeSlot}`) } };
}

test('slot order becomes stable ID order; coordinates and binding provenance separate', () => {
  const { game, options } = fixture();
  const before = JSON.stringify(game);
  const result = convertLegacyCitySource(game, options);
  assert.deepEqual(result.citySource.cityOrder, Array.from({ length: 192 }, (_, i) => `stable-${i}`));
  assert.equal(result.citySource.identity.indexByCityId['stable-191'], 191);
  assert.equal(result.citySource.cities['stable-191'].battleMapId, 'siege-191');
  assert.equal(result.citySource.cities['stable-191'].troops_cap, 20);
  for (const key of ['x', 'y', 'runtimeSlot', 'raw'])
    assert.equal(Object.hasOwn(result.citySource.cities['stable-191'], key), false);
  assert.deepEqual(result.legacyBindings[191], { cityId: 'stable-191', runtimeSlot: 191, x: 191, y: 10 });
  assert.deepEqual(result.citySource.placements, game.map.placements);
  assert.equal(JSON.stringify(game), before);
  assert.deepEqual(convertLegacyCitySource(game, options), result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('chosen chapter supplies defaults once; no cap flattening or implicit chapter selection', () => {
  const { game, options } = fixture();
  game.chapterOrder.reverse();
  assert.equal(convertLegacyCitySource(game, options).citySource.cities['stable-0'].troops_cap, 20);
  assert.equal(convertLegacyCitySource(game, { ...options, defaultChapterId: 'b' }).citySource.cities['stable-0'].troops_cap, 170);
  assert.equal(game.chapters.a.state.cities[0].troops_cap, 20);
  assert.equal(game.chapters.b.state.cities[0].troops_cap, 170);
  assert.throws(() => convertLegacyCitySource(game, { ...options, defaultChapterId: undefined }), /chapter identity/);
});

test('bindings are supplied explicitly and may share a real resource ID', () => {
  const { game, options } = fixture();
  options.battleMapIds.fill('shared-siege-template');
  assert.equal(convertLegacyCitySource(game, options).citySource.cities['stable-191'].battleMapId, 'shared-siege-template');
  for (const bad of [[], Array(192), Array(192).fill(null)])
    assert.throws(() => convertLegacyCitySource(game, { ...options, battleMapIds: bad }), /battle map/);
});

test('bad old source is refused, not fixed or partly converted', () => {
  const mutations = [
    game => { game.schemaVersion = 2; },
    game => { delete game.cities['stable-5']; },
    game => { game.cities['stable-5'].runtimeSlot = 4; },
    game => { game.chapters.a.state.cities.pop(); },
    game => { game.chapters.a.state.cities[0].idx = 1; },
    game => { game.chapters.a.state.cities[0].troops_cap = undefined; },
    game => { game.chapters.a.state.cities[0].troops_cap = 256; },
    game => { game.chapters.a.state.cities[0].troops_cap = 0; },
    game => { game.map.placements.pop(); },
    game => { game.map.placements[0].x++; },
    game => { game.map.placements[0] = game.map.placements[1]; },
  ];
  for (const mutate of mutations) {
    const { game, options } = fixture(); mutate(game);
    const before = structuredClone(game);
    assert.throws(() => convertLegacyCitySource(game, options));
    assert.deepEqual(game, before);
  }
});

test('CLI owns a new leaf, preserves inputs and emits deterministic SHA-bound projections only', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dragon-city-projection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { game, options } = fixture();
  const sourcePath = join(root, 'source.json'), bindingPath = join(root, 'bindings.json');
  const sourceText = JSON.stringify(game), bindingText = JSON.stringify(options.battleMapIds);
  await writeFile(sourcePath, sourceText, 'utf8');
  await writeFile(bindingPath, bindingText, 'utf8');
  const tool = fileURLToPath(new URL('./export_city_source_projection.mjs', import.meta.url));
  const run = (output, input = sourcePath) => execFileSync(process.execPath, [tool,
    '--source', input, '--default-chapter', 'a', '--battle-maps', bindingPath, '--output', output,
  ], { encoding: 'utf8', stdio: 'pipe' });
  const first = join(root, 'new-parent', 'first'), second = join(root, 'new-parent', 'second');
  run(first); run(second);
  for (const name of ['city-source.json', 'chapter-cities.json', 'legacy-bindings.json', 'receipt.json'])
    assert.equal(await readFile(join(first, name), 'utf8'), await readFile(join(second, name), 'utf8'));
  const receiptText = await readFile(join(first, 'receipt.json'), 'utf8');
  const receipt = JSON.parse(receiptText);
  assert.equal(receipt.scope, 'city-source-projection-only');
  assert.equal(receipt.converterRevision, 'city-source-projection-4');
  assert.equal(receipt.chapterCount, 2);
  assert.equal(receipt.countChangeCount, 0);
  const chapterCities = JSON.parse(await readFile(join(first, 'chapter-cities.json'), 'utf8'));
  assert.equal(chapterCities.chapters.a.cities['stable-0'].troops_cap, 20);
  assert.equal(chapterCities.chapters.b.cities['stable-0'].troops_cap, 170);
  assert.equal(chapterCities.chapters.a.factions[0].capitalCityId, 'stable-191');
  assert.equal(Object.keys(receipt.codeHashes).length, 7);
  for (const [path, digest] of Object.entries(receipt.codeHashes))
    assert.equal(createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex'), digest);
  assert.equal(receipt.sourceSha256, createHash('sha256').update(sourceText).digest('hex'));
  assert.equal(receipt.battleBindingsSha256, createHash('sha256').update(bindingText).digest('hex'));
  for (const [name, digest] of Object.entries(receipt.outputs))
    assert.equal(createHash('sha256').update(await readFile(join(first, name))).digest('hex'), digest);
  assert.throws(() => run(first), error => /EEXIST/.test(error.stderr.toString()));
  assert.equal(await readFile(join(first, 'receipt.json'), 'utf8'), receiptText);
  const bad = join(root, 'bad.json'), invalidOutput = join(root, 'invalid-output');
  game.schemaVersion = 2;
  await writeFile(bad, JSON.stringify(game), 'utf8');
  assert.throws(() => run(invalidOutput, bad));
  await assert.rejects(access(invalidOutput), { code: 'ENOENT' });
  game.schemaVersion = 1;
  delete game.chapters.a.state.nativeFactionSlotRaw;
  await writeFile(bad, JSON.stringify(game), 'utf8');
  const invalidChapterOutput = join(root, 'invalid-chapter-output');
  assert.throws(() => run(invalidChapterOutput, bad), error => /physical faction source/.test(error.stderr.toString()));
  await assert.rejects(access(invalidChapterOutput), { code: 'ENOENT' });
  assert.equal(await readFile(sourcePath, 'utf8'), sourceText);
  assert.equal(await readFile(bindingPath, 'utf8'), bindingText);
});

test('result and source do not share mutable rows, bindings or order', () => {
  const { game, options } = fixture();
  const result = convertLegacyCitySource(game, options);
  game.cities['stable-0'].name = 'renamed';
  game.map.placements[0].x = 300;
  options.battleMapIds[0] = 'other';
  assert.equal(result.citySource.cities['stable-0'].name, 'City 0');
  assert.equal(result.citySource.cities['stable-0'].battleMapId, 'siege-0');
  assert.equal(result.citySource.placements[0].x, 191);
  assert.equal(result.legacyBindings[0].x, 0);
});
