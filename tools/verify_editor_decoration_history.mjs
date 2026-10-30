// Actual fixed Web sources; trusted draft history only, not movement rules or HTTP permission.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { translateDecorations, reorderDecorations, captureComponent, componentCells } from '../web/src/editor/componenttools.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const step = mapEdits => ({ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits });
let groups = 0, getters = 0;
for (const kind of ['minimal', 'full']) {
  const options = { loadCopy: createPinnedCopyLoader({ kind }) };
  if (kind === 'minimal') options.profileRevision = FIXED_TEMPLATE_PROFILE;
  const profile = new FixedCopyProfile(options);
  const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-decoration-history' });
  const base = captured.game;
  const members = base.map.decorations.filter(row => componentCells(base, row).every(([x]) => x < 383)).slice(0, 2);
  assert.equal(members.length, 2);
  const memberIds = members.map(row => row.id), move = { op: 'decoration-translate', memberIds, dx: 1, dy: 0 };
  const verify = (game, edits) => kind === 'minimal'
    ? profile.verifyOrderedTemplate(captured.capability, game, edits.map(edit => step([edit])))
    : profile.verify(captured.capability, game, [], [], edits);
  const moved = translateDecorations(base, memberIds, 1, 0);
  verify(moved, [move]); verify(decodeSourceChunks(encodeSourceChunks(moved)), [move]);
  assert.deepEqual(moved.chapters, base.chapters); assert.deepEqual(moved.cities, base.cities);
  assert.deepEqual(moved.componentDefinitions, base.componentDefinitions); assert.deepEqual(moved.compatibility, base.compatibility);
  assert.deepEqual({ ...moved.map, decorations: [] }, { ...base.map, decorations: [] });
  assert.deepEqual(moved.map.decorations.map(row => memberIds.includes(row.id) ? { ...row, x: row.x - 1 } : row), base.map.decorations); groups++;
  const back = { ...move, dx: -1 }, restored = translateDecorations(moved, memberIds, -1, 0);
  verify(restored, [move, back]); assert.deepEqual(restored, base);
  // Intermediate failure cannot be hidden by a later opposite displacement.
  assert.throws(() => verify(base, [{ ...move, dx: 384 }, { ...move, dx: -384 }]));
  assert.throws(() => verify(moved, []));
  for (const edit of [{ ...move, memberIds: [] }, { ...move, memberIds: ['missing'] }, { ...move, memberIds: [memberIds[0], memberIds[0]] }, { ...move, dx: 0 }, { ...move, dx: 0.5 }, { ...move, dy: -0 }, { ...move, x: 20 }, { ...move, dx: 384 }]) assert.throws(() => verify(moved, [edit]));
  const accessor = { ...move }; Object.defineProperty(accessor, 'dx', { enumerable: true, get() { getters++; return 1; } });
  assert.throws(() => verify(moved, [accessor])); assert.equal(getters, 0); groups++;
  for (const mutate of [game => { game.map.decorations.find(row => !memberIds.includes(row.id)).x++; }, game => { game.map.decorations[0].id = 'forged'; }, game => { game.map.decorations = game.map.decorations.toReversed(); }, game => { game.map.base.terrainRef[0] = 'unknown-history-base'; }, game => { game.cities[Object.keys(game.cities)[0]].x++; }]) {
    const bad = structuredClone(moved); mutate(bad); assert.throws(() => verify(bad, [move]));
  }
  const materialId = base.gameId + '#material-' + 'e'.repeat(64);
  const create = { op: 'material-capture', materialId, memberIds, name: '平移後擷取' };
  const created = captureComponent(moved, memberIds, materialId, create.name);
  verify(created, [move, create]);
  assert.deepEqual(created.map, moved.map); assert.equal(Object.hasOwn(base.componentDefinitions, materialId), false); groups++;
  const ids = base.map.decorations.slice(0, 3).map(row => row.id);
  assert.equal(ids.length, 3);
  const order = { op: 'decoration-reorder', memberIds: ids.slice(0, 2), direction: 1 };
  const ordered = reorderDecorations(base, order.memberIds, 1);
  verify(ordered, [order]); verify(decodeSourceChunks(encodeSourceChunks(ordered)), [order]);
  assert.deepEqual(ordered.map.decorations.slice(0, 3).map(row => row.id), [ids[2], ids[0], ids[1]]);
  assert.deepEqual(ordered.map.decorations.slice(3), base.map.decorations.slice(3));
  assert.deepEqual({ ...ordered.map, decorations: [] }, { ...base.map, decorations: [] });
  assert.deepEqual(ordered.chapters, base.chapters); assert.deepEqual(ordered.componentDefinitions, base.componentDefinitions);
  const undone = reorderDecorations(ordered, order.memberIds, -1);
  verify(undone, [order, { ...order, direction: -1 }]); assert.deepEqual(undone, base);
  const movedOrdered = reorderDecorations(moved, order.memberIds, 1);
  verify(movedOrdered, [move, order]);
  verify(base, [{ ...order, direction: -1 }]); // Already at bottom: genuine no-op.
  groups++;
  assert.throws(() => verify(ordered, []));
  for (const edit of [{ ...order, direction: 0 }, { ...order, direction: '1' }, { ...order, direction: 2 }, { ...order, memberIds: [] }, { ...order, memberIds: ['missing'] }, { ...order, memberIds: [ids[0], ids[0]] }, { ...order, dx: 1 }]) assert.throws(() => verify(ordered, [edit]));
  const badOrder = { ...order }; Object.defineProperty(badOrder, 'direction', { enumerable: true, get() { getters++; return 1; } });
  assert.throws(() => verify(ordered, [badOrder])); assert.equal(getters, 0);
  assert.throws(() => verify(base, [{ ...order, memberIds: ['missing'] }, { ...order, direction: -1 }]));
  for (const mutate of [game => { game.map.decorations[0].x++; }, game => { game.map.decorations[0].id = 'forged'; }, game => { game.map.decorations = game.map.decorations.toReversed(); }, game => { game.cities[Object.keys(game.cities)[0]].x++; }]) {
    const bad = structuredClone(ordered); mutate(bad); assert.throws(() => verify(bad, [order]));
  }
  groups++;
}
process.stdout.write(JSON.stringify({ groups, getters, scope: 'neutral/full-copy trusted decoration translation and layer-order history; no HTTP, city/road movement or playable admission' }) + '\n');
