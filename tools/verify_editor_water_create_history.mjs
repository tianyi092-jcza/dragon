// Fixed Web source, internal map history only. No HTTP/runtime grant.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { createWaterGroup, fillBase, renameWaterGroup } from '../web/src/editor/componenttools.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
let groups = 0, getters = 0;
const step = mapEdits => ({ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits });
for (const kind of ['minimal', 'full']) {
  const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind }), profileRevision: kind === 'minimal' ? FIXED_TEMPLATE_PROFILE : FIXED_COPY_PROFILE });
  const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-water-create' });
  const base = captured.game; assert.equal(Object.keys(captured.provenance.inputHashes).length, 41);
  const verify = (candidate, edits) => kind === 'minimal' ? profile.verifyOrderedTemplate(captured.capability, candidate, [step(edits)]) : profile.verify(captured.capability, candidate, [], [], edits);
  const reject = (candidate, edits) => assert.throws(() => verify(candidate, edits), error => error.status === 422);
  const cells = base.map.base.geography.flatMap((geo, cell) => geo ? [cell] : []).slice(0, 2);
  const wet = base.map.decorations.find(row => row.waterClass), dry = base.map.decorations.find(row => !row.waterClass);
  assert.equal(cells.length, 2); assert.ok(wet); assert.ok(dry);
  const id = hex => `${base.gameId}#water-${hex.repeat(64)}`;
  const edit = { op: 'water-create', groupId: id('a'), memberIds: [wet.id], baseCells: cells, name: '明確混合組', showOnMinimap: false };
  const apply = (source, command) => createWaterGroup(source, command.memberIds, command.baseCells, command.groupId, command.name, command.showOnMinimap);
  const created = apply(base, edit);
  verify(created, [edit]); verify(decodeSourceChunks(encodeSourceChunks(created)), [edit]);
  assert.deepEqual(created.map.waterGroups.at(-1).memberIds, [wet.id]); assert.deepEqual(created.map.waterGroups.at(-1).baseCells, cells);
  assert.equal(created.map.waterGroups.at(-1).showOnMinimap, false);
  assert.ok(created.map.waterGroups.slice(0, -1).every(group => !group.memberIds.includes(wet.id) && !group.baseCells.some(cell => cells.includes(cell))));
  for (const key of Object.keys(base.map).filter(key => key !== 'waterGroups')) assert.deepEqual(created.map[key], base.map[key]);
  for (const key of Object.keys(base).filter(key => key !== 'map')) assert.deepEqual(created[key], base[key]);
  const a = composeMapLayers(base, { draft: true }), b = composeMapLayers(created, { draft: true });
  assert.deepEqual(a.terrain, b.terrain); assert.deepEqual(a.geography, b.geography);
  reject(created, []); reject(created, [edit, edit]); groups++;

  const transfer = { ...edit, groupId: id('b'), name: '重新組合', showOnMinimap: true };
  const moved = apply(created, transfer); verify(moved, [edit, transfer]);
  assert.equal(moved.map.waterGroups.some(group => group.id === edit.groupId), false);
  reject(moved, [edit, transfer, edit]); // Empty/deleted identity is never recycled.
  const renamed = renameWaterGroup(moved, transfer.groupId, '新組名稱');
  verify(renamed, [edit, transfer, { op: 'water-rename', groupId: transfer.groupId, name: '新組名稱' }]);
  const part = { ...edit, groupId: id('c'), memberIds: [], baseCells: [cells[0]] };
  const partial = apply(created, part); verify(partial, [edit, part]);
  const remainder = partial.map.waterGroups.find(group => group.id === edit.groupId);
  assert.deepEqual(remainder.memberIds, [wet.id]); assert.deepEqual(remainder.baseCells, [cells[1]]); assert.equal(remainder.showOnMinimap, false); groups++;

  const land = base.map.base.geography.findIndex(geo => geo === 0);
  const fill = { op: 'base-fill', cells: [land], tile: 20, geography: 1 };
  const filled = fillBase(base, fill.cells, fill.tile, fill.geography);
  const fresh = { ...edit, memberIds: [], baseCells: [land] };
  const grouped = apply(filled, fresh); verify(grouped, [fill, fresh]);
  reject(grouped, [fresh, fill]);
  for (const change of [g => { g.map.base.geography[land] = 2; }, g => { g.map.decorations[0].x++; }, g => { Object.values(g.cities)[0].x++; }, g => { g.map.waterGroups.at(-1).showOnMinimap = true; }]) {
    const bad = structuredClone(grouped); change(bad); reject(bad, [fill, fresh]);
  }
  assert.equal(base.map.base.geography[land], 0); groups++;

  for (const bad of [{ ...edit, groupId: 'foreign' }, { ...edit, groupId: base.map.waterGroups[0].id }, { ...edit, memberIds: ['missing'] }, { ...edit, memberIds: [dry.id] }, { ...edit, memberIds: [wet.id, wet.id] }, { ...edit, memberIds: Array(1) }, { ...edit, baseCells: [cells[0], cells[0]] }, { ...edit, baseCells: [98304] }, { ...edit, baseCells: [land] }, { ...edit, baseCells: [-0] }, { ...edit, memberIds: [], baseCells: [] }, { ...edit, name: '' }, { ...edit, showOnMinimap: 0 }, { ...edit, showOnMinimap: undefined }, { ...edit, extra: true }]) reject(base, [bad]);
  const missing = { ...edit }; delete missing.showOnMinimap; reject(base, [missing]);
  const accessor = { ...edit }; Object.defineProperty(accessor, 'memberIds', { enumerable: true, get() { getters++; return []; } }); reject(base, [accessor]);
  assert.equal(base.map.waterGroups.some(group => group.id === edit.groupId), false); groups++;
}
assert.equal(getters, 0);
process.stdout.write(`${JSON.stringify({ groups, getters, profiles: 2, fixedInputs: 41, scope: 'internal water-group creation history; no HTTP or runtime grant' })}\n`);
