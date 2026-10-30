// Authoring reservation policy, not native initialization or role eligibility proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { setMonarch, setStrategist, removeMonarch } from '../web/src/content/authoring/gamesource.js';
const fixture = () => ({ chapters: { c: { chapterId: 'c', state: {
  generals: [0, 126, 127].map(idx => ({ idx, faction: null })),
  factions: [{ idx: 0, monarch_idx: null, advisor_idx: null }], cities: [],
} } } });
test('reserved general 127 cannot receive ordinary chapter posts or succession', () => {
  for (const assign of [g => setMonarch(g, 'c', 0, 127), g => setStrategist(g, 'c', 0, 127), g => removeMonarch(g, 'c', 0, { successor: 127 })]) {
    const game = fixture(), before = structuredClone(game);
    assert.throws(() => assign(game), /ordinary general slot/); assert.deepEqual(game, before);
  }
});
test('unknown membership is not a free general for appointment or succession', () => {
  for (const missing of [false, true]) {
    for (const assign of [g => setMonarch(g, 'c', 0, 0), g => removeMonarch(g, 'c', 0, { successor: 0 })]) {
      const game = fixture(), state = game.chapters.c.state;
      state.factions[0].monarch_idx = 126;
      if (missing) delete state.generals[0].faction;
      else state.generals[0].faction = undefined;
      const before = structuredClone(game);
      assert.throws(() => assign(game), /lord must be a free general/);
      assert.deepEqual(game, before);
    }
  }
});
test('ordinary endpoints and explicit advisor removal retain the existing writer contract', () => {
  for (const idx of [0, 126]) {
    const game = fixture(); setMonarch(game, 'c', 0, idx);
    assert.equal(game.chapters.c.state.factions[0].monarch_idx, idx);
    assert.equal(game.chapters.c.state.generals.find(row => row.idx === idx).faction, 0);
    const advisor = fixture(); advisor.chapters.c.state.generals.find(row => row.idx === idx).faction = 0;
    setStrategist(advisor, 'c', 0, idx);
    assert.equal(advisor.chapters.c.state.factions[0].advisor_idx, idx);
    setStrategist(advisor, 'c', 0, null); assert.equal(advisor.chapters.c.state.factions[0].advisor_idx, null);
  }
  for (const idx of [-1, 128, 1.5, '126', NaN, -0]) {
    const game = fixture(), before = structuredClone(game);
    assert.throws(() => setStrategist(game, 'c', 0, idx), /ordinary general slot/); assert.deepEqual(game, before);
  }
});
test('advisor replacement requires chapter ownership without normalizing an imported exception', () => {
  for (const owner of [null, 1, undefined, '0']) {
    const game = fixture(); game.chapters.c.state.generals[0].faction = owner;
    const before = structuredClone(game);
    assert.throws(() => setStrategist(game, 'c', 0, 0), /strategist must belong to chapter faction/);
    assert.deepEqual(game, before);
  }
  const inherited = fixture(); inherited.chapters.c.state.factions[0].advisor_idx = 126;
  const before = structuredClone(inherited);
  assert.deepEqual(setStrategist(inherited, 'c', 0, 126), { replaced: null });
  assert.deepEqual(inherited, before); // Preserve an unchanged source exception, not an assignment grant.
  inherited.chapters.c.state.generals[0].faction = 0;
  assert.deepEqual(setStrategist(inherited, 'c', 0, 0), { replaced: 126 });
  assert.equal(inherited.chapters.c.state.generals.find(row => row.idx === 126).faction, null);
});
test('20 pinned chapters preserve reserved source records and raw faction tables on refusal', async () => {
  const loaded = await createPinnedCopyLoader({ kind: 'full' })({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-role-slots' });
  assert.equal(Object.keys(loaded.provenance.inputHashes).length, 41);
  assert.equal(loaded.game.chapterOrder.length, 20);
  for (const id of loaded.game.chapterOrder) {
    const game = structuredClone(loaded.game), before = structuredClone(game), faction = game.chapters[id].state.factions[0];
    assert.ok(game.chapters[id].state.generals.some(row => row.idx === 127));
    assert.ok(game.chapters[id].state.generals.every(row => Object.hasOwn(row, 'faction') && (row.faction === null || Number.isInteger(row.faction))));
    assert.throws(() => setStrategist(game, id, faction.idx, 127), /ordinary general slot/);
    assert.deepEqual(game, before);
  }
});
test('captured full-copy history still permits ordinary advisor clearing but refuses reserved-role history', async () => {
  const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind: 'full' }) });
  const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-role-history' });
  const base = captured.game, chapterId = base.chapterOrder[0];
  const faction = base.chapters[chapterId].state.factions.find(row => Number.isInteger(row.advisor_idx));
  assert.ok(faction);
  const cleared = structuredClone(base);
  setStrategist(cleared, chapterId, faction.idx, null);
  const edit = { op: 'set-strategist', chapterId, factionIdx: faction.idx, generalIdx: null };
  assert.equal(typeof profile.verify(captured.capability, cleared, [edit]).sourceDigest, 'string');
  const forged = structuredClone(base);
  forged.chapters[chapterId].state.factions.find(row => row.idx === faction.idx).advisor_idx = 127;
  assert.throws(() => profile.verify(captured.capability, forged, [{ ...edit, generalIdx: 127 }]), error => error.status === 422);
  const state = base.chapters[chapterId].state;
  const occupied = new Set(state.factions.flatMap(row => [row.monarch_idx, row.advisor_idx]));
  const foreign = state.generals.find(row => row.idx < 127 && Number.isInteger(row.faction) && row.faction !== faction.idx && !occupied.has(row.idx));
  assert.ok(foreign);
  // A later valid clear must not hide an invalid earlier replacement in history.
  assert.throws(() => profile.verify(captured.capability, cleared, [{ ...edit, generalIdx: foreign.idx }, edit]), error => error.status === 422);
  assert.equal(base.chapters[chapterId].state.factions.find(row => row.idx === faction.idx).advisor_idx, faction.advisor_idx);
});
