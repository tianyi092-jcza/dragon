// CHAPTER-WB creation-only conversion. Never run on GET or an existing copy.
import { setChapterLabels, setChapterCapital, initializeChapterFactionIdentities, initializeBlankChapterInputs, retireChapterFaction } from '../web/src/content/authoring/gamesource.js';
import { decodePlayerOpening } from '../web/src/game/nativemonthlypolicy.js';
import { fail } from './security.js';

export function initializeCopyChapters(source) {
  const game = structuredClone(source), names = new Set();
  const receipt = { version: 1, labels: [], capitals: [], duplicates: [] };
  // Web product decision: the first occurrence of a monarch identity wins in
  // this chapter only. Retire later records without shifting native slots or
  // merging their money/troops into the retained faction.
  for (const chapterId of game.chapterOrder) {
    const state = game.chapters[chapterId].state, seen = new Map();
    for (const faction of state.factions) {
      if (faction.retired === true || !Number.isInteger(faction.monarch_idx) || faction.monarch_idx < 0 || faction.monarch_idx >= 127) continue;
      const monarch = state.generals.find(g => g.idx === faction.monarch_idx);
      const identity = monarch?.generalId ?? faction.monarch_idx;
      if (!seen.has(identity)) { seen.set(identity, faction.idx); continue; }
      const keptFactionIdx = seen.get(identity), monarchIdx = faction.monarch_idx;
      const monarchName = monarch?.name ?? faction.monarch ?? '';
      retireChapterFaction(game, chapterId, faction.idx);
      receipt.duplicates.push({ chapterId, keptFactionIdx, discardedFactionIdx: faction.idx, monarchIdx, monarchName });
    }
  }
  // Web product decision: a shared capital also keeps its first claimant,
  // even when monarchs differ. Only missing capital references still fail.
  for (const chapterId of game.chapterOrder) {
    const state = game.chapters[chapterId].state, claimed = new Map();
    for (const faction of state.factions) {
      if (faction.capital == null) continue;
      const city = state.cities.find(c => c.idx === faction.capital);
      if (city && claimed.has(faction.capital)) {
        const keptFactionIdx = claimed.get(faction.capital), monarchIdx = faction.monarch_idx;
        const monarchName = state.generals.find(g => g.idx === monarchIdx)?.name ?? faction.monarch ?? '';
        retireChapterFaction(game, chapterId, faction.idx);
        receipt.duplicates.push({ chapterId, keptFactionIdx, discardedFactionIdx: faction.idx,
          monarchIdx, monarchName, reason: 'shared-capital', cityIdx: city.idx, cityName: city.name });
        continue;
      }
      if (!city) {
        const chapterName = game.chapters[chapterId].name ?? state.name ?? chapterId;
        const monarch = state.generals.find(g => g.idx === faction.monarch_idx)?.name ?? faction.monarch ?? `勢力${faction.idx + 1}`;
        const message = `章節「${chapterName}」：「${monarch}」的首都（原始編號${faction.capital}）不存在。須先修正來源引用。`;
        fail(422, 'COPY_CHAPTER_CAPITAL', JSON.stringify({ chapterId, factionIdx: faction.idx,
          cityIdx: faction.capital, conflictingFactionIdx: null, message }));
      }
      claimed.set(faction.capital, faction.idx);
    }
  }
  // Number/name are generated afresh only for this new copy. Keep provenance in receipt.
  for (const chapter of Object.values(game.chapters)) { delete chapter.number; delete chapter.name; }
  game.chapterOrder.forEach((chapterId, index) => {
    const chapter = game.chapters[chapterId], state = chapter.state;
    const sourceName = source.chapters[chapterId].name ?? state.name ?? '';
    const normalized = sourceName.trim().normalize('NFC');
    const title = normalized.match(/「([^」]+)」/u)?.[1] ?? normalized;
    const number = String(index + 1);
    let name = title && [...title].length <= 8 ? title : `章${number}`;
    if (names.has(name)) name = `${[...name].slice(0, 8 - [...number].length).join('')}${number}`;
    for (let suffix = index + 1; names.has(name); suffix++) name = `章${suffix}`;
    setChapterLabels(game, chapterId, number, name);
    names.add(name);
    receipt.labels.push({ chapterId, sourceChapterId: chapter.sourceChapterId ?? null,
      sourceNumber: source.chapters[chapterId].number ?? null, sourceName, number, name });
    initializeChapterFactionIdentities(chapter);
    if (game.sourceRef.kind === 'builtin-template' && state.nativeMonthlyPolicyRaw === undefined && state.factions.length === 0) initializeBlankChapterInputs(state);
    if (state.start) state.start.era ??= 'ad';
    for (const faction of state.factions) {
      if (faction.retired === true) continue;
      const opening = faction.playerOpening ?? { trust: state.trust, policyRaw: state.nativeMonthlyPolicyRaw };
      decodePlayerOpening(opening);
      faction.playerOpening = structuredClone(opening);
      if (faction.capital == null) continue;
      const city = state.cities.find(c => c.idx === faction.capital);
      if (city.faction === faction.idx) continue;
      receipt.capitals.push({ chapterId, factionIdx: faction.idx, cityIdx: city.idx,
        cityName: city.name, before: city.faction, after: faction.idx });
      setChapterCapital(game, chapterId, faction.idx, city.idx);
    }
  });
  game.chapterConversion = receipt;
  return game;
}
