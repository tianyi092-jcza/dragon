// Actual pinned Web source, isolated pure history; no API/native initialization grant.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { applyChapterCityEdit, setCityDefinitionName, chapterCitiesProjection, cityDefinitionChangeImpact } from '../web/src/content/authoring/citydefinitions.js';
import { copyChapterInGame, deleteChapter, chapterActiveGaps } from '../web/src/content/authoring/gamesource.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind: 'minimal' }), profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-city-history' });
const base = captured.game, chapterId = base.chapterOrder[0], cityId = Object.keys(base.cities)[0];
const set = (chapter = chapterId) => ({ op: 'set', chapterId: chapter, cityId, values: { factionId: null, overrides: {} } });
const remove = (chapter = chapterId) => ({ op: 'remove', chapterId: chapter, cityId });
const step = (chapterCityEdits = [], chapterEdits = [], cityEdits = []) => ({ chapterEdits, generalEdits: [], peopleEdits: [], cityEdits, chapterCityEdits });
const verify = (candidate, steps) => profile.verifyOrderedTemplate(captured.capability, candidate, steps);
const reject = (candidate, steps, code = 'COPY_TEMPLATE_HISTORY') => assert.throws(() => verify(candidate, steps), error => error.code === code);
let groups = 0;
const configured = applyChapterCityEdit(base, set());
verify(configured, [step([set()])]);
assert.equal(chapterCitiesProjection(configured)[0].cities[0].values.name, null);
assert.deepEqual(configured.chapters[chapterId].state, base.chapters[chapterId].state);
assert.deepEqual(chapterActiveGaps(configured.chapters[chapterId].state), chapterActiveGaps(base.chapters[chapterId].state));
assert.equal(Object.keys(configured.cities).length, 192);
assert.equal(Object.hasOwn(base.chapters[chapterId], 'cities'), false); groups++;

const rename = { op: 'rename', cityId, name: ' e\u0301𠀀 ' };
const named = setCityDefinitionName(configured, cityId, rename.name);
verify(named, [step([set()]), step([], [], [rename])]);
verify(named, [step([set()], [], [rename])]); // City names before chapter city edits in one request.
assert.deepEqual(cityDefinitionChangeImpact(configured, cityId, rename.name).affectedChapters, [{ chapterId, fields: ['name'] }]);
assert.equal(chapterCitiesProjection(named)[0].cities[0].values.name, 'é𠀀');
assert.deepEqual(named.map, base.map); assert.deepEqual(named.compatibility, base.compatibility);
verify(decodeSourceChunks(encodeSourceChunks(named)), [step([set()]), step([], [], [rename])]); groups++;

let copied = structuredClone(named);
const child = copyChapterInGame(copied, chapterId);
const copyStep = step([], [{ op: 'copy', chapterId }]);
copied = applyChapterCityEdit(copied, remove());
const copyHistory = [step([set()]), step([], [], [rename]), copyStep, step([remove()])];
verify(copied, copyHistory);
assert.deepEqual(chapterCitiesProjection(copied).map(row => row.cities.length), [0, 1]);
assert.deepEqual(cityDefinitionChangeImpact(copied, cityId, '新名').affectedChapters, [{ chapterId: child, fields: ['name'] }]);
const detached = structuredClone(copied); deleteChapter(detached, chapterId);
verify(detached, [...copyHistory, step([], [{ op: 'delete', chapterId }])]);
assert.equal(chapterCitiesProjection(detached)[0].cities[0].cityId, cityId); groups++;

const cleared = applyChapterCityEdit(configured, remove());
verify(cleared, [step([set(), remove()])]);
verify(applyChapterCityEdit(cleared, set()), [step([set(), remove(), set()])]);
reject(cleared, [step([remove(), set()])]);
reject(configured, [step()], 'COPY_PROTECTED_DELTA');
reject(configured, [{ chapterEdits: [], generalEdits: [], peopleEdits: [] }], 'COPY_PROTECTED_DELTA');
const legacy = [{ chapterEdits: [], generalEdits: [], peopleEdits: [] }], oldBody = JSON.stringify(legacy);
verify(base, legacy); assert.equal(JSON.stringify(legacy), oldBody); groups++;

for (const mutate of [g => { g.cities[cityId].x++; }, g => { g.chapters[chapterId].cities[cityId].overrides.name = '章覆蓋'; }, g => { g.chapters[chapterId].cities[cityId].factionId = 'unknown'; }, g => { g.chapters[chapterId].state.cities.push({ idx: 0 }); }]) {
  const bad = structuredClone(configured); mutate(bad); reject(bad, [step([set()])], 'COPY_PROTECTED_DELTA');
}
const wrongTime = structuredClone(copied); wrongTime.chapters[child].cities = {};
reject(wrongTime, copyHistory, 'COPY_PROTECTED_DELTA'); groups++;

for (const command of [{ ...set(), cityId: 'missing' }, { ...set(), chapterId: 'missing' }, { ...set(), op: 'move' }, { ...set(), values: { factionId: null, overrides: { troops: 0 } } }, { ...set(), name: 'extra' }, { ...remove(), values: {} }]) reject(base, [step([command])]);
reject(base, [step(Array.from({ length: 17 }, () => set()))]);
const sparse = []; sparse.length = 1;
assert.throws(() => verify(base, [step(sparse)]));
reject(base, [step(null)]);
const deletedThenSet = [step([], [{ op: 'delete', chapterId }]), step([set()])];
reject(base, deletedThenSet); groups++;

let getters = 0;
for (const where of ['step', 'command', 'values', 'overrides']) {
  const command = set(), entry = step([command]);
  const target = { step: entry, command, values: command.values, overrides: command.values.overrides }[where];
  Object.defineProperty(target, 'hiddenEffect', { enumerable: true, get() { getters++; return 1; } });
  assert.throws(() => verify(base, [entry]));
}
assert.equal(getters, 0);
assert.throws(() => verify(base, [step([Object.assign(() => {}, set())])]));
verify(configured, [step([set()])]); groups++;
process.stdout.write(JSON.stringify({ groups, inputHashes: Object.keys(captured.provenance.inputHashes ?? {}).length, getters, scope: 'captured neutral chapter city history only; no HTTP, confirmation, native initialization or runtime grant' }) + '\n');
