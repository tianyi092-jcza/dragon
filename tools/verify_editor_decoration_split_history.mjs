// Fixed Web inputs plus an explicitly owned unknown-underlay fixture. No runtime/API grant.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { componentCells, captureComponent, placeComponent, splitDecoration, removeMaterial } from '../web/src/editor/componenttools.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
let groups = 0, getters = 0;
const step = mapEdits => ({ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits });
for (const kind of ['minimal', 'full']) {
  const profileRevision = kind === 'minimal' ? FIXED_TEMPLATE_PROFILE : FIXED_COPY_PROFILE;
  const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind }), profileRevision });
  const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-split-history' });
  const base = captured.game; assert.equal(Object.keys(captured.provenance.inputHashes).length, 41);
  const verifyWith = (p, cap, candidate, edits) => kind === 'minimal' ? p.verifyOrderedTemplate(cap, candidate, [step(edits)]) : p.verify(cap, candidate, [], [], edits);
  const verify = (candidate, edits) => verifyWith(profile, captured.capability, candidate, edits);
  const reject = (candidate, edits) => assert.throws(() => verify(candidate, edits), error => error.status === 422);
  const atoms = new Map();
  for (const row of base.map.decorations) { const cells = componentCells(base, row); if (!row.waterClass && cells.length === 1) atoms.set(cells[0].join(','), row.id); }
  let pair;
  for (const [key, id] of atoms) { const [x, y] = key.split(',').map(Number), next = atoms.get(`${x + 1},${y}`); if (next) { pair = [id, next]; break; } }
  assert.ok(pair);
  const materialId = base.gameId + '#material-' + 'a'.repeat(64), parent = base.gameId + '#decoration-' + 'b'.repeat(64);
  const children = ['c', 'd'].map(hex => base.gameId + '#decoration-' + hex.repeat(64));
  const create = { op: 'material-capture', memberIds: pair, materialId, name: '拆分兩格' };
  const place = { op: 'decoration-place', instanceId: parent, materialId, variantRef: 'original', x: 0, y: 0, waterClass: null };
  const split = { op: 'decoration-split', instanceId: parent, childIds: children };
  const library = captureComponent(base, pair, materialId, create.name), placed = placeComponent(library, materialId, 0, 0, parent, null, 'original');
  const result = splitDecoration(placed, parent, children), history = [create, place, split];
  verify(result, history); verify(decodeSourceChunks(encodeSourceChunks(result)), history);
  assert.deepEqual(result.map.decorations.slice(0, -2), base.map.decorations);
  assert.deepEqual(result.map.decorations.slice(-2).map(row => row.id), children);
  assert.deepEqual(result.map.base, base.map.base); assert.deepEqual(result.chapters, base.chapters);
  const beforePixels = composeMapLayers(placed, { draft: true }), afterPixels = composeMapLayers(result, { draft: true });
  for (const field of ['terrain', 'geography', 'minimapGeography']) assert.deepEqual(afterPixels[field], beforePixels[field]);
  verify(removeMaterial(result, materialId), [...history, { op: 'material-remove', materialId }]);
  reject(result, [create, place]); reject(result, [...history, { ...place, materialId: base.map.decorations[0].definitionRef }]);
  assert.equal(Object.hasOwn(base.componentDefinitions, materialId), false); groups++;

  for (const edit of [{ ...split, instanceId: 'missing' }, { ...split, childIds: [] }, { ...split, childIds: [children[0]] }, { ...split, childIds: [children[0], children[0]] }, { ...split, childIds: [children[0], parent] }, { ...split, childIds: [children[0], 'foreign'] }, { ...split, childIds: [children[0], base.map.decorations[0].id] }, { ...split, childIds: Array(2) }, { ...split, extra: true }]) reject(result, [create, place, edit]);
  reject(result, [...history, split]); // Removed parent cannot be split again.
  reject(result, [...history, { ...place, instanceId: children[0] }]);
  reject(base, [{ ...split, instanceId: base.map.decorations.find(row => componentCells(base, row).length === 1).id }]);
  const getter = { ...split }; Object.defineProperty(getter, 'childIds', { enumerable: true, get() { getters++; return children; } });
  reject(result, [create, place, getter]); groups++;

  for (const mutate of [g => { g.map.decorations.at(-1).x++; }, g => { g.map.decorations.at(-1).splitProvenance.instanceId = 'forged'; }, g => { g.map.decorations = g.map.decorations.toReversed(); }, g => { g.map.base.terrainRef[0] = 'unknown-split-base'; }, g => { g.map.base.unknownUnderlays[0] = { sourceRef: 'forged', coveringInstanceId: children[0] }; }, g => { Object.values(g.cities)[0].x++; }]) {
    const changed = structuredClone(result); mutate(changed); reject(changed, history);
  }
  const wet = placeComponent(library, materialId, 0, 0, parent, 'river', 'original');
  const wetResult = splitDecoration(wet, parent, children);
  verify(wetResult, [create, { ...place, waterClass: 'river' }, split]);
  assert.deepEqual(wetResult.map.waterGroups.at(-1).memberIds, children);
  assert.equal(wetResult.map.waterGroups.at(-1).id, 'group-' + parent); groups++;

  // This is an owned fixture, NOT a claim that the pinned baseline had this covering record.
  const fixture = structuredClone(wet);
  fixture.componentDefinitions[materialId].geographyMask = [[0, 0]];
  fixture.map.waterGroups.at(-1).showOnMinimap = false;
  fixture.map.base.terrainRef[0] = null;
  fixture.map.base.unknownUnderlays[0] = { sourceRef: 'owned split fixture', coveringInstanceId: parent };
  const fixtureBefore = structuredClone(fixture);
  const local = new FixedCopyProfile({ profileRevision, loadCopy: async () => ({ game: fixture, provenance: { scope: 'owned unknown-underlay fixture' } }) });
  const localCapture = await local.capture({});
  const divided = splitDecoration(localCapture.game, parent, children);
  verifyWith(local, localCapture.capability, divided, [split]);
  assert.deepEqual(divided.map.base.unknownUnderlays[0], { sourceRef: 'owned split fixture', coveringInstanceId: children[0], priorCoveringInstanceId: parent });
  assert.deepEqual(divided.map.base.terrainRef, fixtureBefore.map.base.terrainRef);
  assert.deepEqual(divided.map.waterGroups.at(-1).memberIds, [children[0]]);
  assert.equal(divided.map.waterGroups.at(-1).showOnMinimap, false);
  assert.equal(Object.hasOwn(divided.map.decorations.at(-1), 'waterClass'), false);
  const fixturePixels = composeMapLayers(fixtureBefore, { draft: true }), dividedPixels = composeMapLayers(divided, { draft: true });
  for (const field of ['terrain', 'geography', 'minimapGeography']) assert.deepEqual(dividedPixels[field], fixturePixels[field]);
  assert.deepEqual(fixture, fixtureBefore);
  const bad = structuredClone(divided); bad.map.base.unknownUnderlays[0].sourceRef = 'forged';
  assert.throws(() => verifyWith(local, localCapture.capability, bad, [split])); groups++;
}
assert.equal(getters, 0);
process.stdout.write(JSON.stringify({ groups, getters, profiles: 2, fixedInputs: 41, scope: 'internal split history and owned unknown-underlay fixture; no HTTP or runtime certification' }) + '\n');
