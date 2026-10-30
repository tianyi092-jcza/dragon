// Actual pinned Web sources, pure history; no HTTP/deletion/runtime permission.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE, FIXED_COPY_PROFILE } from '../server/copyprofile.js';
import { removeDecorations, placeComponent } from '../web/src/editor/componenttools.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
let groups = 0, getters = 0;
for (const kind of ['minimal', 'full']) {
  const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind }), profileRevision: kind === 'minimal' ? FIXED_TEMPLATE_PROFILE : FIXED_COPY_PROFILE });
  const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-removal-history' });
  const base = captured.game;
  assert.equal(Object.keys(captured.provenance.inputHashes).length, 41);
  const verify = (game, mapEdits) => kind === 'minimal' ? profile.verifyOrderedTemplate(captured.capability, game, [{ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits }]) : profile.verify(captured.capability, game, [], [], mapEdits);
  const reject = (game, edits) => assert.throws(() => verify(game, edits), error => error.status === 422);
  const land = base.map.decorations.find(row => !row.waterClass), wet = base.map.decorations.find(row => row.waterClass);
  assert.ok(land && wet);
  const memberIds = [land.id, wet.id], edit = { op: 'decoration-remove', memberIds };
  const removed = removeDecorations(base, memberIds);
  verify(removed, [edit]); verify(decodeSourceChunks(encodeSourceChunks(removed)), [edit]);
  assert.deepEqual(removed.map.decorations, base.map.decorations.filter(row => !memberIds.includes(row.id)));
  assert.deepEqual(removed.map.waterGroups, base.map.waterGroups.map(group => ({ ...group, memberIds: group.memberIds.filter(id => !memberIds.includes(id)) })).filter(group => group.memberIds.length || group.baseCells.length));
  for (const key of Object.keys(base.map).filter(key => !['decorations', 'waterGroups'].includes(key))) assert.deepEqual(removed.map[key], base.map[key]);
  for (const key of Object.keys(base).filter(key => key !== 'map')) assert.deepEqual(removed[key], base[key]);
  reject(removed, []); groups++;

  for (const bad of [{ ...edit, memberIds: [] }, { ...edit, memberIds: [land.id, land.id] }, { ...edit, memberIds: ['missing'] }, { ...edit, memberIds: [land.id, 'missing'] }, { ...edit, memberIds: Array(1) }, { ...edit, memberIds: [base.map.placements[0].id] }, { ...edit, extra: 1 }]) reject(base, [bad]);
  const getter = { ...edit }; Object.defineProperty(getter, 'memberIds', { enumerable: true, get() { getters++; return memberIds; } }); reject(base, [getter]);
  for (const mutate of [g => { g.map.base.terrainRef[0] = 'forged-removal-base'; }, g => { g.map.base.unknownUnderlays = {}; }, g => { g.map.decorations[0].x++; }, g => { g.map.decorations = g.map.decorations.toReversed(); }, g => { Object.values(g.cities)[0].x++; }]) {
    const bad = structuredClone(removed); mutate(bad); reject(bad, [edit]);
  }
  groups++;

  const instanceId = base.gameId + '#decoration-' + 'e'.repeat(64);
  const place = { op: 'decoration-place', instanceId, materialId: land.definitionRef, variantRef: land.variantRef ?? 'original', x: land.x, y: land.y, waterClass: null };
  const placed = placeComponent(base, place.materialId, place.x, place.y, instanceId, null, place.variantRef);
  const remove = { op: 'decoration-remove', memberIds: [instanceId] }, restored = removeDecorations(placed, [instanceId]);
  verify(restored, [place, remove]); assert.deepEqual(restored, base);
  reject(placed, [place, remove, place]); reject(base, [remove, place]); reject(base, [place, remove, remove]);
  assert.equal(base.map.decorations.some(row => row.id === instanceId), false); groups++;
}
assert.equal(getters, 0);
process.stdout.write(JSON.stringify({ groups, getters, profiles: 2, fixedInputs: 41, scope: 'captured decoration removal history only, no HTTP, physical deletion or playable initialization' }) + '\n');
