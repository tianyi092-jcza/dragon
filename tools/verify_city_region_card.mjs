// 城市資訊卡所屬州郡：admit 入表＋發包回填（Web 展示欄位，不進規則門）。
// 用法：node --test tools/verify_city_region_card.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { admitChapterCity, attachCityRegions } from '../web/src/content/authoring/gamesource.js';

function dense(n) {
  return Array.from({ length: n }, (_, idx) => ({ idx, cityId: `city-${String(idx).padStart(3, '0')}`, name: `城${idx}` }));
}
function gameWith(region) {
  const cities = {};
  for (let i = 0; i < 192; i++) cities[`city-${String(i).padStart(3, '0')}`] = { cityId: `city-${String(i).padStart(3, '0')}`, runtimeSlot: i };
  cities['city-192'] = { cityId: 'city-192', runtimeSlot: 192, name: '測州城', region,
    max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1 };
  return {
    cities,
    map: { placements: [{ cityId: 'city-192', x: 10, y: 10 }] },
    chapters: { ch1: { state: { cities: dense(192) } } },
    chapterOrder: ['ch1'],
  };
}

test('admit 入表自帶定義 region（缺省即空字串）', () => {
  const full = gameWith('幽州');
  const w = admitChapterCity(full, 'city-192', 60, 'ki-1995:siege:7');
  assert.equal(w.slot, 192);
  const row = full.chapters.ch1.state.cities[192];
  assert.equal(row.region, '幽州');
  const blank = gameWith(undefined);
  delete blank.cities['city-192'].region;
  admitChapterCity(blank, 'city-192', 60, 'ki-1995:siege:7');
  assert.equal(blank.chapters.ch1.state.cities[192].region, '');
});

test('attachCityRegions 回填舊章同槽行、未知槽不动、冪等', () => {
  const states = { ch1: { cities: [{ idx: 0 }, { idx: 1, region: '舊' }, { idx: 9 }] } };
  const cities = { c0: { runtimeSlot: 0, region: '幽州' }, c1: { runtimeSlot: 1 } };
  // c1 定義無 region（視為空）：州行舊值被拉平為空，定義是唯一來源。
  assert.equal(attachCityRegions(states, cities), 2);
  assert.equal(states.ch1.cities[0].region, '幽州');
  assert.equal(states.ch1.cities[1].region, '');
  assert.equal(states.ch1.cities[2].region, undefined);
  assert.equal(attachCityRegions(states, cities), 0);
  assert.throws(() => attachCityRegions(null, {}), /chapter states required/);
});
