// 章節據點五屬性（用户 2026-11 决定）：所屬勢力＋當前生產／上升值／防災值／城兵。
// 只驗作者層寫入器、固定副本歷史重放與回退；不含 HTTP、初始化、試玩或發布。
// node tools/verify_editor_chapter_city_attributes.mjs
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_COPY_PROFILE } from '../server/copyprofile.js';
import { copyChapterInGame, editChapterCityNative, setChapterCityFaction } from '../web/src/content/authoring/gamesource.js';

const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind: 'full' }), profileRevision: FIXED_COPY_PROFILE });
const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-chapter-city-attributes' });
const base = captured.game, chapterId = base.chapterOrder[0];
const verify = (candidate, chapterEdits) => profile.verify(captured.capability, candidate, chapterEdits, [], [], [], []);
const reject = (candidate, chapterEdits, code = 'COPY_PROTECTED_DELTA') => assert.throws(() => verify(candidate, chapterEdits), error => error.code === code);
let groups = 0;

// 挑一座四項數值都還有調整空間、且所屬勢力可以換的據點。
const state = base.chapters[chapterId].state;
const city = state.cities.find(row => row.troops > 2 && row.prod > 300 && row.growth < 255 && row.defence < 255 && row.troops_cap > row.troops && row.max_prod > row.prod);
assert.ok(city, '需要一座四項數值都有調整空間的據點');
const other = state.factions.map(row => row.idx).find(idx => idx !== city.faction);
assert.notEqual(other, undefined, '需要另一個可指派的勢力槽');

const numbers = { prod: city.prod - 1, growth: city.growth + 1, defence: city.defence + 1, troops: city.troops - 1 };
const numberEdit = { op: 'city-native', chapterId, cityIdx: city.idx, values: { ...numbers } };
const numbersGame = editChapterCityNative(base, chapterId, city.idx, numbers);
const numberState = numbersGame.chapters[chapterId].state;
assert.equal(numberState.cities[city.idx].growth, numbers.growth);
assert.equal(numberState.cities[city.idx].defence, numbers.defence);
assert.equal(numberState.cities[city.idx].prod, numbers.prod);
assert.equal(numberState.cities[city.idx].troops, numbers.troops);
assert.equal(numberState.nativeCityRecordRaw[city.idx], numberState.cities[city.idx].raw);
assert.equal(typeof verify(numbersGame, [numberEdit]).sourceDigest, 'string');
reject(numbersGame, []);
reject(numbersGame, [{ ...numberEdit, values: { ...numbers, growth: city.growth } }]);
groups++;

// 所屬勢力：與數值同批保存，順序固定（數值先、勢力後），回退依同一順序重建。
const faction = structuredClone(numbersGame);
setChapterCityFaction(faction, chapterId, city.idx, other);
const factionEdit = { op: 'city-faction', chapterId, cityIdx: city.idx, factionId: other };
assert.equal(faction.chapters[chapterId].state.cities[city.idx].faction, other);
assert.equal(typeof verify(faction, [numberEdit, factionEdit]).sourceDigest, 'string');
reject(faction, [numberEdit]);
reject(faction, [factionEdit, numberEdit]);
groups++;

// 未記錄的 growth 改動、改第二座、原生受保護位元組分歧都必須拒絕。
const laterGrowth = numbers.growth === 255 ? 254 : numbers.growth + 1;
reject(editChapterCityNative(faction, chapterId, city.idx, { growth: laterGrowth }), [numberEdit, factionEdit]);
const second = state.cities.find(row => row.idx !== city.idx);
reject(editChapterCityNative(faction, chapterId, second.idx, { defence: second.defence === 255 ? 254 : second.defence + 1 }), [numberEdit, factionEdit]);
const broken = structuredClone(base), offset = 0x00;
const rawBefore = broken.chapters[chapterId].state.nativeCityRecordRaw[city.idx];
broken.chapters[chapterId].state.nativeCityRecordRaw[city.idx] = rawBefore.slice(0, offset * 2) + 'ff' + rawBefore.slice(offset * 2 + 2);
assert.throws(() => editChapterCityNative(broken, chapterId, city.idx, { growth: laterGrowth }));
groups++;

// 值域：只由記錄自身上限與 u8 寬度決定，越界、負零、非整數都拒絕。
const ceilings = editChapterCityNative(base, chapterId, city.idx, { growth: 255, defence: 255 }).chapters[chapterId].state.cities[city.idx];
assert.equal(ceilings.growth, 255); assert.equal(ceilings.defence, 255);
for (const values of [{ growth: 256 }, { defence: -1 }, { growth: -0 }, { troops: 1.5 }, { prod: city.max_prod + 1 }, { growth: 1, owner: 1 }]) {
  assert.throws(() => editChapterCityNative(base, chapterId, city.idx, values), `應拒絕 ${JSON.stringify(values)}`);
}
groups++;

// 複製章節後再改：新章節的原生來源獨立，歷史仍要一步步對得上。
const copies = structuredClone(faction), childId = copyChapterInGame(copies, chapterId);
const childNumbers = { growth: 250, defence: 250 };
const childEdited = editChapterCityNative(copies, childId, city.idx, childNumbers);
const history = [numberEdit, factionEdit, { op: 'copy', chapterId }, { op: 'city-native', chapterId: childId, cityIdx: city.idx, values: childNumbers }];
assert.equal(typeof verify(childEdited, history).sourceDigest, 'string');
reject(childEdited, history.slice(0, 3));
assert.equal(base.chapters[chapterId].state.cities[city.idx].growth, city.growth);
groups++;

console.log(JSON.stringify({ result: 'PASS-CHAPTER-CITY-ATTRIBUTES', groups, cityIdx: city.idx, chapterId,
  limits: '作者層寫入器＋固定副本歷史重放（章節據點四項數值與所屬勢力）；不含 HTTP、原生初始化、試玩或發布。' }));
