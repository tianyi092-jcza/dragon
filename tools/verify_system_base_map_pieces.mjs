// Real registered source, read-only. No SAVE, browser profile, SQL or network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { planSystemBaseMapPieces } from './system_base_map_pieces.mjs';
const source = readInstalledEditorSource();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const before = digest(source);
const plan = planSystemBaseMapPieces(source);
assert.equal(digest(source), before, 'planner must not mutate input');
assert.equal(digest(planSystemBaseMapPieces(source)), digest(plan), 'deterministic planning');
const expected = new Map(source.map.decorations.filter(atom => !atom.waterClass).map(atom => [atom.y * 384 + atom.x, atom]));
const seen = new Set(), ids = new Set();
plan.pieces.forEach(piece => {
  assert(!ids.has(piece.id)); ids.add(piece.id);
  const definition = plan.definitions[piece.definitionRef];
  assert(definition.footprint.length >= 1 && definition.footprint.length <= 256);
  assert.equal(piece.sourceMembers.length, definition.footprint.length);
  const blocks = new Set();
  definition.variants.original.tiles.forEach(([dx, dy, tile], index) => {
    const x = piece.x + dx, y = piece.y + dy, cell = y * 384 + x, original = expected.get(cell);
    assert(original); assert(!seen.has(cell)); seen.add(cell);
    assert.deepEqual(piece.sourceMembers[index], { cell, sourceId: original.id });
    assert.equal(source.componentDefinitions[original.definitionRef].variants.original.tiles[0][2], tile);
    blocks.add(`${Math.floor(x / 16)},${Math.floor(y / 16)}`);
  });
  assert.equal(blocks.size, 1);
  const remaining = new Set(piece.sourceMembers.map(member => member.cell));
  const reached = [remaining.values().next().value]; remaining.delete(reached[0]);
  for (const cell of reached) {
    [cell - 384, cell + 384, ...(cell % 384 ? [cell - 1] : []), ...(cell % 384 < 383 ? [cell + 1] : [])].forEach(next => {
      if (remaining.delete(next)) reached.push(next);
    });
  }
  assert.equal(remaining.size, 0, 'each piece must be connected');
});
assert.equal(seen.size, expected.size);
const grouped = plan.groups.flatMap(group => group.pieceIds);
assert.equal(grouped.length, ids.size); assert.equal(new Set(grouped).size, ids.size);
assert(grouped.every(id => ids.has(id)));
assert(plan.pieces.some(piece => piece.sourceMembers.length > 1), 'not an all-atom wrapper');
assert(plan.groups.some(group => group.sourceCellCount > 256 && group.pieceIds.length > 1), 'large groups are split');
const first = source.map.decorations.find(atom => !atom.waterClass);
assert.throws(() => planSystemBaseMapPieces({ ...source, map: { ...source.map, decorations: [first, first] } }), /overlapping/);
assert.throws(() => planSystemBaseMapPieces({ ...source, map: { ...source.map, bounds: { ...source.map.bounds, width: 385 } } }), /fixed-map/);
assert.throws(() => planSystemBaseMapPieces({ ...source, map: { ...source.map, decorations: [{ ...first, x: -1 }] } }));
console.log(JSON.stringify({ passed: true, cells: seen.size, groups: plan.groups.length, pieces: plan.pieces.length,
  definitions: Object.keys(plan.definitions).length, multicell: plan.pieces.filter(piece => piece.sourceMembers.length > 1).length,
  largestPiece: Math.max(...plan.pieces.map(piece => piece.sourceMembers.length)), digest: digest(plan) }, null, 2));
