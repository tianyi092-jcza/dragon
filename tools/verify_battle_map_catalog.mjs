// Read-only program resource + pure projection tests; no SAVE/profile/network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createSiegeMapCatalog, resolveSiegeMap } from '../web/src/content/battlemapcatalog.js';
import { createSiegeProjection } from '../web/src/game/battle/battleprojection.js';

const maps = JSON.parse(readFileSync(new URL('../web/battle_maps.json', import.meta.url), 'utf8'));
const catalogue = createSiegeMapCatalog(maps);
const scenario = { generals: [] };
const legion = leader => ({ leader, morale: 200, troops: 600,
  units: Array.from({ length: 6 }, () => ({ type: 1, troops: 1000 })) });
const attacker = legion('甲'), defender = legion('乙');
const resources = { ...maps, siegeCatalog: catalogue };
const project = city => createSiegeProjection(scenario, attacker, city, resources, defender);

test('192 immutable siege identities exactly retain current program directory metadata', () => {
  assert.equal(Object.keys(catalogue).length, 192);
  for (let idx = 0; idx < 192; idx++) {
    const entry = resolveSiegeMap(catalogue, `ki-1995:siege:${idx}`);
    assert.deepEqual(entry, { battleMapId: `ki-1995:siege:${idx}`, ...maps.directory[idx] });
    assert.ok(Object.isFrozen(entry));
  }
  assert.ok(Object.isFrozen(catalogue));
  for (const id of ['ki-1995:siege:192', 'ki-1995:siege:213', '__proto__', '', null, undefined])
    assert.throws(() => resolveSiegeMap(catalogue, id), /unknown siege battleMapId/);
});

test('original city bindings keep the same projection while explicit IDs select resources', () => {
  for (const idx of [0, 17, 191]) {
    const city = { idx, name: '原城' };
    const legacy = project(city);
    const explicit = project({ ...city, battleMapId: `ki-1995:siege:${idx}` });
    for (const field of ['directoryIndex', 'layout', 'theme', 'units', 'kind', 'mirror'])
      assert.deepEqual(explicit[field], legacy[field], field);
  }
});

test('192/254/255/256 targets keep identity when sharing a siege resource', () => {
  for (const idx of [192, 254, 255, 256]) {
    const city = { idx, name: `新城${idx}`, battleMapId: 'ki-1995:siege:17' };
    const view = project(city);
    assert.equal(view.city, city);
    assert.equal(view.city.idx, idx);
    assert.equal(view.directoryIndex, 17);
    assert.equal(view.layout, maps.directory[17].layout);
    assert.equal(view.kind, 'siege');
  }
});

test('missing or wrong explicit bindings never fall back to city index or field resources', () => {
  for (const battleMapId of [undefined, null, '', 'ki-1995:siege:192', 'audit-only-siege-0'])
    assert.throws(() => project({ idx: 0, name: '缺項', battleMapId }), /unknown siege battleMapId/);
  for (const idx of [192, 254, 255, 256])
    assert.throws(() => project({ idx, name: '無綁定' }), /missing BATTLE.MAP/);
});

test('shared resource creates separate display groups and retains distinct target objects', () => {
  const before = JSON.stringify(maps);
  const a = { idx: 256, name: '一', battleMapId: 'ki-1995:siege:0' };
  const b = { idx: 257, name: '二', battleMapId: 'ki-1995:siege:0' };
  const first = project(a), second = project(b);
  first.units[0].troops = 0;
  first.effects.push('local');
  assert.equal(second.units[0].troops, 100); // projection uses tens, not source persons
  assert.deepEqual(second.effects, []);
  assert.notEqual(first.city, second.city);
  assert.equal(JSON.stringify(maps), before);
});

test('catalogue boundary rejects missing/sparse/mismatched or invalid byte fields', () => {
  assert.throws(() => createSiegeMapCatalog({}), /complete siege map directory/);
  assert.throws(() => createSiegeMapCatalog({ directory: maps.directory.slice(0, 191) }), /complete siege/);
  for (const edit of [
    rows => { delete rows[5]; },
    rows => { rows[5].idx = 6; },
    rows => { rows[5].layout = -1; },
    rows => { rows[5].layout = 256; },
    rows => { rows[5].theme = null; },
    rows => { rows[5].theme = 0.5; },
  ]) {
    const directory = structuredClone(maps.directory);
    edit(directory);
    assert.throws(() => createSiegeMapCatalog({ directory }), /invalid siege map directory entry/);
  }
});

test('captured metadata is detached from resource object changes', () => {
  const input = { directory: structuredClone(maps.directory) };
  const captured = createSiegeMapCatalog(input);
  input.directory[0].theme = 255;
  assert.equal(captured['ki-1995:siege:0'].theme, maps.directory[0].theme);
  assert.throws(() => { captured['ki-1995:siege:0'].theme = 255; }, TypeError);
});
