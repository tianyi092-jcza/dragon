// 基礎據點身份提取：複製裝配時從源遊戲取城兵上限（首章同槽行）與攻城戰場（源據點定義）。
// 用法：node --test tools/verify_base_city_identity.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayBaseCityIdentity, backfillDefinitionTroopCaps, backfillRowBattlefields } from '../web/src/content/authoring/gamesource.js';
import { assertSystemBaseCities } from '../server/systembasemap.js';

function baseCity(cityId, runtimeSlot, extra = {}) {
  return { cityId, runtimeSlot, name: '城' + runtimeSlot, max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1, ...extra };
}
function sourceCity(cityId, runtimeSlot, extra = {}) {
  return { cityId, runtimeSlot, name: '源城' + runtimeSlot, max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1, ...extra };
}
function sourceOf(cities, chapterRows) {
  return { cities: Object.fromEntries(cities.map(c => [c.cityId, c])), chapterOrder: ['ch1'],
    chapters: { ch1: { state: { cities: chapterRows } } } };
}

test('overlay takes troop cap from source chapter one and battlefield from source definitions', () => {
  const copyData = { cities: { a: baseCity('a', 0), b: baseCity('b', 1) } };
  const source = sourceOf(
    [sourceCity('a', 0, { battleMapId: 'ki-1995:siege:7' }), sourceCity('b', 1, { battleMapId: 'ki-1995:siege:36' })],
    [{ idx: 0, troops_cap: 60 }, { idx: 1, troops_cap: 120 }]);
  const out = overlayBaseCityIdentity(copyData, source);
  assert.deepEqual(out, { battlefields: 2, troopCaps: 2 });
  assert.equal(copyData.cities.a.battleMapId, 'ki-1995:siege:7');
  assert.equal(copyData.cities.a.troops_cap, 60);
  assert.equal(copyData.cities.b.battleMapId, 'ki-1995:siege:36');
  assert.equal(copyData.cities.b.troops_cap, 120);
  // 基础校验放行新字段。
  assertSystemBaseCities(copyData.cities);
});

test('missing source battlefields resolve to the native directory; manual base values survive', () => {
  const copyData = { cities: { x: baseCity('x', 0), y: baseCity('y', 1, { battleMapId: 'ki-1995:siege:99' }) } };
  const source = sourceOf(
    [sourceCity('other-0', 0, { battleMapId: 'ki-1995:siege:192' }), sourceCity('other-1', 5)],
    [{ idx: 0, troops_cap: 300 }, { idx: 1 }]);
  const out = overlayBaseCityIdentity(copyData, source);
  assert.deepEqual(out, { battlefields: 1, troopCaps: 0 });
  // 越界源值不取，改按槽位取目录；base 手工值不洗；超限上限不取。
  assert.equal(copyData.cities.x.battleMapId, 'ki-1995:siege:0');
  assert.equal(copyData.cities.y.battleMapId, 'ki-1995:siege:99');
  assert.equal(copyData.cities.x.troops_cap, undefined);
  assert.equal(copyData.cities.y.troops_cap, undefined);
});

test('slots beyond the 192 native directory stay empty for later admission', () => {
  const copyData = { cities: { z: baseCity('z', 200) } };
  const source = sourceOf([], []);
  const out = overlayBaseCityIdentity(copyData, source);
  assert.deepEqual(out, { battlefields: 0, troopCaps: 0 });
  assert.equal(copyData.cities.z.battleMapId, undefined);
});

test('overlay feeds game copy and system base identically', () => {
  const copyData = { cities: { a: baseCity('a', 0) }, chapterOrder: ['ch1'], chapters: { ch1: { state: { cities: [{ idx: 0 }] } } } };
  const source = sourceOf([sourceCity('a', 0, { battleMapId: 'ki-1995:siege:42' })], [{ idx: 0, troops_cap: 77 }]);
  overlayBaseCityIdentity(copyData, source);
  // 游戏副本与系统基是同一份对象：两字段天然完全一致；落子回填不再改写已有值。
  const filled = backfillDefinitionTroopCaps({ cities: copyData.cities, chapterOrder: copyData.chapterOrder, chapters: copyData.chapters });
  assert.equal(filled, 0);
  assert.equal(copyData.cities.a.battleMapId, 'ki-1995:siege:42');
  assert.equal(copyData.cities.a.troops_cap, 77);
});

test('backfillRowBattlefields copies definition maps into rows missing them only', () => {
  const game = { cities: { a: baseCity('a', 0, { battleMapId: 'ki-1995:siege:7' }), b: baseCity('b', 1, { battleMapId: 'ki-1995:siege:9' }) },
    chapterOrder: ['ch1', 'ch2'], chapters: { ch1: { state: { cities: [{ idx: 0 }, { idx: 1, battleMapId: 'ki-1995:siege:36' }] } },
      ch2: { state: { cities: [{ idx: 0, battleMapId: 'ki-1995:siege:7' }, { idx: 1 }] } } } };
  const filled = backfillRowBattlefields(game);
  assert.equal(filled, 2);
  assert.equal(game.chapters.ch1.state.cities[0].battleMapId, 'ki-1995:siege:7');
  assert.equal(game.chapters.ch1.state.cities[1].battleMapId, 'ki-1995:siege:36');
  assert.equal(game.chapters.ch2.state.cities[1].battleMapId, 'ki-1995:siege:9');
});

test('assertSystemBaseCities rejects bad troop caps', () => {
  assert.throws(() => assertSystemBaseCities({ a: baseCity('a', 0, { troops_cap: 256 }) }), /troops_cap/);
  assert.throws(() => assertSystemBaseCities({ a: baseCity('a', 0, { troops_cap: -1 }) }), /troops_cap/);
  assert.throws(() => assertSystemBaseCities({ a: baseCity('a', 0, { troops_cap: 1.5 }) }), /troops_cap/);
});
