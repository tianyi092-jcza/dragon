// Fixed Web source only. Internal history is not an HTTP or runtime grant.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { componentCells, captureComponent, placeComponent, renameWaterGroup, translateDecorations } from '../web/src/editor/componenttools.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
let groups = 0, getters = 0;
for (const kind of ['minimal', 'full']) {
  const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind }), profileRevision: kind === 'minimal' ? FIXED_TEMPLATE_PROFILE : FIXED_COPY_PROFILE });
  const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-placement-history' });
  const base = captured.game;
  assert.equal(Object.keys(captured.provenance.inputHashes).length, 41);
  const step = mapEdits => ({ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits });
  const verify = (candidate, edits) => kind === 'minimal'
    ? profile.verifyOrderedTemplate(captured.capability, candidate, [step(edits)])
    : profile.verify(captured.capability, candidate, [], [], edits);
  const reject = (candidate, edits) => assert.throws(() => verify(candidate, edits), error => error.status === 422);
  const origin = base.map.decorations.find(row => !row.waterClass);
  assert.ok(origin);
  const id = base.gameId + '#decoration-' + 'b'.repeat(64);
  const place = { op: 'decoration-place', instanceId: id, materialId: origin.definitionRef, variantRef: origin.variantRef ?? 'original', x: origin.x, y: origin.y, waterClass: null };
  const apply = (source, edit) => placeComponent(source, edit.materialId, edit.x, edit.y, edit.instanceId, edit.waterClass, edit.variantRef);
  const placed = apply(base, place);
  verify(placed, [place]); verify(decodeSourceChunks(encodeSourceChunks(placed)), [place]);
  assert.deepEqual(placed.map.decorations.slice(0, -1), base.map.decorations);
  assert.equal(placed.map.decorations.at(-1).id, id);
  for (const key of Object.keys(base.map).filter(key => key !== 'decorations')) assert.deepEqual(placed.map[key], base.map[key]);
  for (const key of Object.keys(base).filter(key => key !== 'map')) assert.deepEqual(placed[key], base[key]);
  reject(placed, []); reject(placed, [place, place]); groups++;

  const units = new Map();
  for (const row of base.map.decorations) {
    const cells = componentCells(base, row);
    if (!row.waterClass && cells.length === 1) units.set(cells[0].join(','), row);
  }
  let pair;
  for (const [key, row] of units) {
    const [x, y] = key.split(',').map(Number), neighbour = units.get(`${x + 1},${y}`);
    if (neighbour) { pair = [row.id, neighbour.id]; break; }
  }
  assert.ok(pair, 'actual adjacent land atoms required');
  const materialId = base.gameId + '#material-' + 'a'.repeat(64);
  const create = { op: 'material-capture', materialId, memberIds: pair, name: '放置素材' };
  const library = captureComponent(base, create.memberIds, materialId, create.name);
  assert.equal(library.componentDefinitions[materialId].footprint.length, 2);
  const stamp = { ...place, materialId, variantRef: 'original', x: 0, y: 0 };
  const created = apply(library, stamp);
  assert.throws(() => apply(library, { ...stamp, x: 383 }), /占用範圍/);
  reject(created, [create, { ...stamp, x: 383 }, { op: 'decoration-translate', memberIds: [id], dx: -383, dy: 0 }]);
  verify(created, [create, stamp]);
  if (kind === 'minimal') profile.verifyOrderedTemplate(captured.capability, created, [step([create]), step([stamp])]);
  reject(library, [stamp, create]);
  reject(created, [create, stamp, { op: 'material-remove', materialId }]);
  for (const change of [g => { g.map.decorations[0].x++; }, g => { g.map.decorations.at(-1).id = 'forged'; }, g => { g.map.decorations = g.map.decorations.toReversed(); }, g => { Object.values(g.cities)[0].x++; }, g => { g.map.placements[0].x++; }, g => { g.map.base.terrainRef[0] = 'unknown-placement-base'; }]) {
    const bad = structuredClone(created); change(bad); reject(bad, [create, stamp]);
  }
  assert.equal(Object.hasOwn(base.componentDefinitions, materialId), false); groups++;

  const wet = base.map.decorations.find(row => row.waterClass);
  assert.ok(wet);
  const water = { ...place, instanceId: base.gameId + '#decoration-' + 'c'.repeat(64), materialId: wet.definitionRef, variantRef: wet.variantRef ?? 'original', x: wet.x, y: wet.y, waterClass: wet.waterClass };
  const flooded = apply(base, water), groupId = 'group-' + water.instanceId;
  verify(flooded, [water]);
  assert.deepEqual(flooded.map.waterGroups.slice(0, -1), base.map.waterGroups);
  assert.deepEqual(flooded.map.waterGroups.at(-1).memberIds, [water.instanceId]);
  assert.equal(flooded.map.waterGroups.at(-1).id, groupId);
  const renamed = renameWaterGroup(flooded, groupId, '新放水域');
  verify(renamed, [water, { op: 'water-rename', groupId, name: '新放水域' }]);
  const inconsistent = structuredClone(flooded); inconsistent.map.waterGroups.at(-1).showOnMinimap = false;
  reject(inconsistent, [water]); groups++;

  for (const bad of [{ ...place, instanceId: 'foreign' }, { ...place, materialId: 'missing' }, { ...place, variantRef: 'missing' }, { ...place, waterClass: '' }, { ...place, waterClass: false }, { ...place, waterClass: 'unknown' }, { ...place, x: -1 }, { ...place, x: 384 }, { ...place, y: 256 }, { ...place, x: 0.5 }, { ...place, x: -0 }, { ...place, extra: 1 }]) reject(base, [bad]);
  const missingClass = { ...place }; delete missingClass.waterClass; reject(base, [missingClass]);
  const descriptor = { ...place }; Object.defineProperty(descriptor, 'x', { enumerable: true, get() { getters++; return 0; } }); reject(base, [descriptor]);
  // Bounds are checked before subsequent commands, not only on the final source.
  reject(base, [{ ...place, x: 384 }, { op: 'decoration-translate', memberIds: [id], dx: -1, dy: 0 }]);
  const final = translateDecorations(placed, [id], origin.x === 383 ? -1 : 1, 0);
  verify(final, [place, { op: 'decoration-translate', memberIds: [id], dx: origin.x === 383 ? -1 : 1, dy: 0 }]);
  assert.equal(base.map.decorations.some(row => row.id === id), false); groups++;
}
assert.equal(getters, 0);
process.stdout.write(JSON.stringify({ groups, getters, profiles: 2, inputHashes: 41, scope: 'fixed-source internal decoration placement history only; no HTTP, native initialization or runtime grant' }) + '\n');
