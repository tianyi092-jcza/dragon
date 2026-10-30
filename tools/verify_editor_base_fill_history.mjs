// Fixed Web inputs; owned base-water fixture. No automatic fill, API or runtime grant.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { fillBase, createWaterGroup } from '../web/src/editor/componenttools.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
let groups = 0, getters = 0;
for (const kind of ['minimal', 'full']) {
  const profileRevision = kind === 'minimal' ? FIXED_TEMPLATE_PROFILE : FIXED_COPY_PROFILE;
  const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind }), profileRevision });
  const capture = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-base-fill-history' });
  const base = capture.game; assert.equal(Object.keys(capture.provenance.inputHashes).length, 41);
  const verifyWith = (p, cap, candidate, edits) => kind === 'minimal' ? p.verifyOrderedTemplate(cap, candidate, [{ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits: edits }]) : p.verify(cap, candidate, [], [], edits);
  const verify = (candidate, edits) => verifyWith(profile, capture.capability, candidate, edits);
  const reject = (candidate, edits) => assert.throws(() => verify(candidate, edits), error => error.status === 422);
  const edit = { op: 'base-fill', cells: [0, 1], tile: 255, geography: 3 };
  const filled = fillBase(base, edit.cells, edit.tile, edit.geography);
  verify(filled, [edit]); verify(decodeSourceChunks(encodeSourceChunks(filled)), [edit]);
  for (const key of Object.keys(base).filter(key => key !== 'map')) assert.deepEqual(filled[key], base[key]);
  for (const key of Object.keys(base.map).filter(key => !['base', 'waterGroups'].includes(key))) assert.deepEqual(filled.map[key], base.map[key]);
  assert.deepEqual(filled.map.base.terrainRef.slice(0, 2), [255, 255]); assert.deepEqual(filled.map.base.geography.slice(0, 2), [3, 3]);
  assert.deepEqual(filled.map.base.terrainRef.slice(2), base.map.base.terrainRef.slice(2));
  assert.deepEqual(filled.map.base.geography.slice(2), base.map.base.geography.slice(2));
  const again = fillBase(filled, [1], 0, 0); verify(again, [edit, { ...edit, cells: [1], tile: 0, geography: 0 }]);
  reject(filled, []); groups++;

  for (const bad of [{ ...edit, cells: [] }, { ...edit, cells: [0, 0] }, { ...edit, cells: [0, 98304] }, { ...edit, cells: [-1] }, { ...edit, cells: ['0'] }, { ...edit, cells: [-0] }, { ...edit, cells: Array(1) }, { ...edit, tile: -1 }, { ...edit, tile: 256 }, { ...edit, tile: -0 }, { ...edit, tile: 1.5 }, { ...edit, geography: 4 }, { ...edit, geography: null }, { ...edit, geography: -0 }, { ...edit, extra: true }]) reject(filled, [bad]);
  reject(filled, [{ ...edit, cells: [98304] }, edit]);
  const descriptor = { ...edit }; Object.defineProperty(descriptor, 'cells', { enumerable: true, get() { getters++; return [0]; } }); reject(filled, [descriptor]);
  for (const mutate of [g => { g.map.base.terrainRef[2] = 'forged'; }, g => { g.map.base.geography[2] = 4; }, g => { g.map.decorations[0].x++; }, g => { Object.values(g.cities)[0].x++; }, g => { g.map.base.unknownUnderlays[2] = { sourceRef: 'forged', coveringInstanceId: 'missing' }; }]) {
    const bad = structuredClone(filled); mutate(bad); reject(bad, [edit]);
  }
  groups++;

  // Explicit test fixture, not an assertion that these base cells were originally water.
  let fixture = fillBase(base, [0, 1], 16, 1);
  fixture = createWaterGroup(fixture, [], [0, 1], 'owned-base-water', '自有水格', false);
  const local = new FixedCopyProfile({ profileRevision, loadCopy: async () => ({ game: fixture, provenance: { scope: 'owned base-water fixture' } }) });
  const captured = await local.capture({});
  const first = fillBase(captured.game, [0], 20, 0);
  verifyWith(local, captured.capability, first, [{ op: 'base-fill', cells: [0], tile: 20, geography: 0 }]);
  assert.deepEqual(first.map.waterGroups.at(-1), { ...fixture.map.waterGroups.at(-1), baseCells: [1] });
  const second = fillBase(first, [1], 20, 0);
  verifyWith(local, captured.capability, second, [{ op: 'base-fill', cells: [0], tile: 20, geography: 0 }, { op: 'base-fill', cells: [1], tile: 20, geography: 0 }]);
  assert.equal(second.map.waterGroups.some(row => row.id === 'owned-base-water'), false);
  assert.deepEqual(fixture.map.waterGroups.at(-1).baseCells, [0, 1]); groups++;
}
assert.equal(getters, 0);
process.stdout.write(JSON.stringify({ groups, getters, profiles: 2, fixedInputs: 41, scope: 'trusted explicit base-fill history and owned water fixture only; no HTTP or runtime grant' }) + '\n');
