// 章節據點五屬性（所屬勢力另由 setChapterCityFaction 寫）：當前生產／上升值／防災值／城兵
// 的有界寫入與靜態原生來源同步。No backend; pinned builtin copyIMMUTABLE. Usage:
// node tools/verify_editor_city_fields.mjs
import { editChapterCity, editChapterCityNative } from '../web/src/content/authoring/gamesource.js';
import { aliasStateByte } from '../web/src/game/navigation/scenariowarconsumer.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

let passed = 0;
const check = (name, cond, extra = '') => {
  if (!cond) { console.error(`FAIL ${name} ${extra}`); process.exitCode = 1; }
  else { passed++; console.log(`ok ${name}`); }
};
const throws = (name, fn) => {
  try { fn(); } catch { passed++; console.log(`ok ${name}`); return; }
  console.error(`FAIL ${name}`); process.exitCode = 1;
};

const { game } = await createPinnedCopyLoader()({ gameId: 'city-probe', ownerId: 'o' });
const ch0 = game.chapterOrder[0];
const rec0 = game.chapters[ch0].state.cities[0];
console.log(`base idx=${rec0.idx} troops=${rec0.troops}/${rec0.troops_cap} prod=${rec0.prod}/${rec0.max_prod}`);

const edited = editChapterCity(game, ch0, rec0.idx, { troops: rec0.troops - 1, prod: rec0.prod - 100 });
const rec1 = edited.chapters[ch0].state.cities.find(c => c.idx === rec0.idx);
check('applied', rec1.troops === rec0.troops - 1 && rec1.prod === rec0.prod - 100);
check('new object', edited !== game);
check('original intact', game.chapters[ch0].state.cities.find(c => c.idx === rec0.idx).troops === rec0.troops);
const raw = rec1.raw;
const byte = o => Number.parseInt(raw.slice(o * 2, o * 2 + 2), 16);
check('raw patched', byte(0x13) === rec1.troops && byte(0x0E) + byte(0x0F) * 256 === rec1.prod);
// 上升值 +0x10、防災值 +0x11：單一 byte，值域只由編碼寬度決定。
const growth = rec0.growth === 255 ? 254 : rec0.growth + 1;
const morale = editChapterCity(game, ch0, rec0.idx, { growth, defence: 0 });
const recM = morale.chapters[ch0].state.cities.find(c => c.idx === rec0.idx);
const byteM = o => Number.parseInt(recM.raw.slice(o * 2, o * 2 + 2), 16);
check('growth/defence applied', recM.growth === growth && recM.defence === 0);
check('growth/defence raw patched', byteM(0x10) === growth && byteM(0x11) === 0);
check('growth/defence u8 ceiling', editChapterCity(game, ch0, rec0.idx, { growth: 255, defence: 255 }).chapters[ch0].state.cities.find(c => c.idx === rec0.idx).defence === 255);

check('no-op same ref', editChapterCity(game, ch0, rec0.idx, { troops: rec0.troops }) === game);
check('zero troops allowed', editChapterCity(game, ch0, rec0.idx, { troops: 0 }).chapters[ch0].state.cities.find(c => c.idx === rec0.idx).troops === 0);
check('cap boundary', editChapterCity(game, ch0, rec0.idx, { troops: rec0.troops_cap, prod: rec0.max_prod }).chapters[ch0].state.cities.find(c => c.idx === rec0.idx).prod === rec0.max_prod);

throws('over cap', () => editChapterCity(game, ch0, rec0.idx, { troops: rec0.troops_cap + 1 }));
throws('negative', () => editChapterCity(game, ch0, rec0.idx, { prod: -1 }));
throws('fraction', () => editChapterCity(game, ch0, rec0.idx, { troops: 1.5 }));
throws('neg zero', () => editChapterCity(game, ch0, rec0.idx, { troops: -0 }));
throws('unknown key', () => editChapterCity(game, ch0, rec0.idx, { owner: 1 }));
throws('empty values', () => editChapterCity(game, ch0, rec0.idx, {}));
throws('bad chapter', () => editChapterCity(game, 'nope', rec0.idx, { troops: 1 }));
throws('bad idx', () => editChapterCity(game, ch0, 99999, { troops: 1 }));
throws('builtin game', () => editChapterCity({ ...game, gameId: 'wolong-builtin' }, ch0, rec0.idx, { troops: 1 }));
const tampered = structuredClone(game);
tampered.chapters[ch0].state.cities.find(c => c.idx === rec0.idx).troops += 0;
const tRaw = tampered.chapters[ch0].state.cities.find(c => c.idx === rec0.idx).raw;
tampered.chapters[ch0].state.cities.find(c => c.idx === rec0.idx).raw = tRaw.slice(0, 0x13 * 2) + 'ff' + tRaw.slice(0x13 * 2 + 2);
throws('raw divergence', () => editChapterCity(tampered, ch0, rec0.idx, { troops: 1 }));

// New explicit write contract; old `city` replay is deliberately unchanged.
const native = editChapterCityNative(game, ch0, rec0.idx, { prod: rec0.prod - 256, troops: rec0.troops - 1 });
const nativeState = native.chapters[ch0].state, nativeCity = nativeState.cities[0];
check('native named and both raw sources agree', nativeCity.prod === rec0.prod - 256 && nativeCity.troops === rec0.troops - 1 && nativeState.nativeCityRecordRaw[0] === nativeCity.raw);
check('direct native alias observes edited high byte', aliasStateByte(nativeState, 0x84f, 'city-edit-test') === nativeCity.prod >>> 8);
check('static other slots preserved', nativeState.nativeCityRecordRaw.slice(1).every((raw, index) => raw === game.chapters[ch0].state.nativeCityRecordRaw[index + 1]));
check('native write source intact', game.chapters[ch0].state.nativeCityRecordRaw[0] === rec0.raw);
check('native no-op same reference', editChapterCityNative(native, ch0, rec0.idx, { prod: nativeCity.prod, troops: nativeCity.troops }) === native);
check('legacy static source unchanged for old history', edited.chapters[ch0].state.nativeCityRecordRaw[0] === rec0.raw);
const repaired = editChapterCityNative(edited, ch0, rec0.idx, { prod: rec1.prod });
const repairedState = repaired.chapters[ch0].state, repairedRaw = repairedState.nativeCityRecordRaw[0];
check('explicit same named value repairs only requested static field', repaired !== edited && repairedRaw.slice(0x0e * 2, 0x10 * 2) === rec1.raw.slice(0x0e * 2, 0x10 * 2) && repairedRaw.slice(0x13 * 2, 0x14 * 2) === rec0.raw.slice(0x13 * 2, 0x14 * 2));
check('legacy source remains immutable', edited.chapters[ch0].state.nativeCityRecordRaw[0] === rec0.raw && repairedState.cities[0].raw === rec1.raw);
const completed = editChapterCityNative(repaired, ch0, rec0.idx, { troops: rec1.troops });
check('second explicit field completes static binding', completed.chapters[ch0].state.nativeCityRecordRaw[0] === rec1.raw);
check('other chapters unchanged', game.chapterOrder.slice(1).every(id => JSON.stringify(native.chapters[id]) === JSON.stringify(game.chapters[id])));
const zero = editChapterCityNative(game, ch0, rec0.idx, { troops: 0, prod: 0 }).chapters[ch0].state;
check('native zero fields retain exact byte widths', zero.nativeCityRecordRaw[0] === zero.cities[0].raw && zero.cities[0].raw.slice(0x0e * 2, 0x10 * 2) === '0000' && zero.cities[0].raw.slice(0x13 * 2, 0x14 * 2) === '00');
const nativeMorale = editChapterCityNative(game, ch0, rec0.idx, { growth, defence: 255 }).chapters[ch0].state;
check('native growth/defence sync both raw sources', nativeMorale.nativeCityRecordRaw[0] === nativeMorale.cities[0].raw && Number.parseInt(nativeMorale.cities[0].raw.slice(0x10 * 2, 0x10 * 2 + 2), 16) === growth && Number.parseInt(nativeMorale.cities[0].raw.slice(0x11 * 2, 0x11 * 2 + 2), 16) === 255);
const divergentMorale = structuredClone(game), divergentRaw = divergentMorale.chapters[ch0].state.nativeCityRecordRaw[0];
divergentMorale.chapters[ch0].state.nativeCityRecordRaw[0] = divergentRaw.slice(0, 0x11 * 2) + 'ff' + divergentRaw.slice(0x11 * 2 + 2);
const repairedMorale = editChapterCityNative(divergentMorale, ch0, rec0.idx, { defence: rec0.defence }).chapters[ch0].state;
check('written growth/defence byte may be repaired from named record', repairedMorale.nativeCityRecordRaw[0] === repairedMorale.cities[0].raw);
for (const values of [{prod:rec0.max_prod + 1}, {troops:-0}, {growth:256}, {defence:-1}, {}]) throws('native existing value gate', () => editChapterCityNative(game, ch0, rec0.idx, values));
for (const table of [undefined, null, [], Array(192).fill('00'), Array(192)]) {
  const bad = structuredClone(game); bad.chapters[ch0].state.nativeCityRecordRaw = table;
  throws('native missing/malformed table rejected even for no-op', () => editChapterCityNative(bad, ch0, rec0.idx, { prod: rec0.prod }));
}
for (const offset of [0, 0x10, 0x11, 0x19, 0x1a]) {
  const bad = structuredClone(game), before = bad.chapters[ch0].state.nativeCityRecordRaw[0];
  const replacement = (Number.parseInt(before.slice(offset * 2, offset * 2 + 2), 16) ^ 1).toString(16).padStart(2, '0');
  bad.chapters[ch0].state.nativeCityRecordRaw[0] = before.slice(0, offset * 2) + replacement + before.slice(offset * 2 + 2);
  // 0x10／0x11 只在這一次不寫那兩個欄位時才算受保護；其它偏移永遠受保護。
  throws('native protected-byte divergence rejected', () => editChapterCityNative(bad, ch0, rec0.idx, { prod: rec0.prod }));
}
console.log(`passed ${passed} checks`);
