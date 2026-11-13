// Initial Web authoring policy A, not reconstructed DOS object identities.
// Shared by offline inventory/conversion. No filesystem, source mutation or rule writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BYTE_STAMP_RECIPE } from '../web/src/content/authoring/maplayers.js';

export function planSystemBaseMapPieces(source) {
  const { width, height, minX, minY, tileSize } = source.map.bounds;
  assert.deepEqual([width, height, minX, minY, tileSize], [384, 256, 0, 0, 16], 'fixed-map input required');
  const cells = new Map();
  source.map.decorations.filter(instance => !instance.waterClass).forEach(instance => {
    const definition = source.componentDefinitions[instance.definitionRef];
    assert.equal(definition.ruleRecipeRef, BYTE_STAMP_RECIPE);
    assert.deepEqual(definition.footprint, [[0, 0]], 'initial conversion accepts registered atoms only');
    assert.deepEqual(definition.anchor, [0, 0]);
    const tiles = definition.variants[instance.variantRef ?? 'original'].tiles;
    assert.equal(tiles.length, 1); assert.deepEqual(tiles[0].slice(0, 2), [0, 0]);
    const tile = tiles[0][2];
    assert(Number.isInteger(tile) && tile >= 0 && tile <= 255);
    assert(Number.isInteger(instance.x) && instance.x >= 0 && instance.x < width);
    assert(Number.isInteger(instance.y) && instance.y >= 0 && instance.y < height);
    const cell = instance.y * width + instance.x;
    assert(!cells.has(cell), 'overlapping input atoms cannot be reordered by conversion');
    const category = tile < 112 ? 'ground-shore-pattern' : tile < 180 ? 'mountain-pattern' : tile < 184 ? 'field-pattern' : 'structure-pattern';
    cells.set(cell, { cell, sourceId: instance.id, definitionRef: instance.definitionRef, tile, category });
  });
  const pending = new Set([...cells.keys()].sort((a, b) => a - b));
  const groups = [], pieces = [], definitions = {};
  // Neighbour ordering and source-cell ordering form part of policy v1 determinism.
  const adjacent = cell => [cell - width, ...(cell % width ? [cell - 1] : []), ...(cell % width < width - 1 ? [cell + 1] : []), cell + width];
  while (pending.size) {
    const first = pending.values().next().value, category = cells.get(first).category;
    const members = [first]; pending.delete(first);
    for (let index = 0; index < members.length; index++) {
      adjacent(members[index]).forEach(cell => {
        if (pending.has(cell) && cells.get(cell).category === category) { pending.delete(cell); members.push(cell); }
      });
    }
    members.sort((a, b) => a - b);
    const groupId = `web-piece-group-${first}`, pieceIds = [], remaining = new Set(members);
    while (remaining.size) {
      const start = remaining.values().next().value;
      const blockX = Math.floor(start % width / 16), blockY = Math.floor(Math.floor(start / width) / 16);
      const part = [start]; remaining.delete(start);
      for (let index = 0; index < part.length; index++) {
        adjacent(part[index]).forEach(cell => {
          if (remaining.has(cell) && Math.floor(cell % width / 16) === blockX && Math.floor(Math.floor(cell / width) / 16) === blockY) {
            remaining.delete(cell); part.push(cell);
          }
        });
      }
      part.sort((a, b) => a - b);
      const x = Math.min(...part.map(cell => cell % width)), y = Math.min(...part.map(cell => Math.floor(cell / width)));
      const tiles = part.map(cell => [cell % width - x, Math.floor(cell / width) - y, cells.get(cell).tile]);
      assert(part.length <= 256);
      const definitionId = `web-piece-${createHash('sha256').update(JSON.stringify([category, tiles])).digest('hex')}`;
      definitions[definitionId] ??= { id: definitionId, category, footprint: tiles.map(([dx, dy]) => [dx, dy]), anchor: [0, 0],
        visualRef: 'MMAP.MDL:indexed-footprint', ruleRecipeRef: BYTE_STAMP_RECIPE, revision: 'web-piece-policy-1', variants: { original: { tiles } } };
      const id = `web-piece-instance-${start}`;
      pieces.push({ id, definitionRef: definitionId, x, y, groupId, sourceMembers: part.map(cell => ({ cell, sourceId: cells.get(cell).sourceId })) });
      pieceIds.push(id);
    }
    groups.push({ id: groupId, category, pieceIds, sourceCellCount: members.length });
  }
  return { schema: 'system-base-map-piece-plan-1', policy: 'web-piece-policy-1',
    boundary: 'User-approved Web editing fragments. Four-connected visual buckets, split at fixed 16x16 grid and connected within each block. Not DOS object boundaries, terrain classification or permission to move roads/cities. No hidden ground invented.',
    definitions, pieces, groups };
}
