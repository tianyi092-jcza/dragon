// Trusted offline/service bootstrap adapter. Call only with the registered,
// SHA-verified readInstalledEditorSource result; never with client content.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyBuiltinGame, canonicalDigest } from '../web/src/content/authoring/gamesource.js';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { SYSTEM_BASE_MAP_SCHEMA, SYSTEM_BASE_MAP_PROFILE, validateSystemBaseMap } from '../server/systembasemap.js';
import { planSystemBaseMapPieces } from './system_base_map_pieces.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function convertInstalledSystemBaseMap(source, sourceDigest) {
  const originalDigest = canonicalDigest(source, sha);
  const game = copyBuiltinGame({ gameId: 'base-map-conversion', ownerId: 'system', kind: 'full', source }, sha);
  const baseline = compileGameSource(game, sha);
  const plan = planSystemBaseMapPieces(source);
  const remap = new Map(plan.pieces.flatMap(piece => piece.sourceMembers.map(member => [member.sourceId, piece.id])));
  const nonWater = game.map.decorations.filter(instance => !instance.waterClass);
  assert.equal(remap.size, nonWater.length);
  game.map.decorations = [
    ...game.map.decorations.filter(instance => instance.waterClass),
    ...plan.pieces.map(piece => ({ id: piece.id, definitionRef: piece.definitionRef, x: piece.x, y: piece.y,
      variantRef: 'original', importRef: { policy: plan.policy, groupId: piece.groupId, sourceMembers: structuredClone(piece.sourceMembers) } })),
  ];
  Object.assign(game.componentDefinitions, structuredClone(plan.definitions));
  Object.values(game.map.base.unknownUnderlays).forEach(unknown => {
    const replacement = remap.get(unknown.coveringInstanceId);
    if (replacement) unknown.coveringInstanceId = replacement;
  });
  const template = { schema: SYSTEM_BASE_MAP_SCHEMA, supportProfile: SYSTEM_BASE_MAP_PROFILE,
    provenance: { sourceRevision: source.revision, sourceDigest, policy: plan.policy },
    content: { map: game.map, componentDefinitions: game.componentDefinitions, cities: game.cities,
      compatibilityAssets: game.compatibilityAssets, editorAssets: structuredClone(source.editorAssets),
      selectionGroups: plan.groups.map(group => ({ id: group.id, label: group.category,
        members: group.pieceIds.map(id => ({ layer: 'decorations', id })) })) } };
  const { digest, compiled } = validateSystemBaseMap(template, sha);
  const { sourceDigest: ignoredBefore, ...before } = baseline;
  const { sourceDigest: ignoredAfter, ...after } = compiled;
  assert.deepEqual(after, before, 'all shared compiler outputs must remain unchanged');
  // Also compile against actual imported chapters (not just empty template projection).
  const { sourceDigest: ignoredGame, ...withChapters } = compileGameSource(game, sha);
  assert.deepEqual(withChapters, before, 'actual chapter/native adjacency compatibility');
  assert.equal(canonicalDigest(source, sha), originalDigest, 'conversion must not mutate registered input');
  return { template, mapping: plan, receipt: { schema: 'system-base-map-conversion-receipt-1', digest,
    sourceRevision: source.revision, sourceDigest, policy: plan.policy,
    checks: ['all-compiler-outputs-identical', 'actual-20-chapter-compatibility', 'registered-input-unchanged'],
    counts: { sourceNonWaterCells: remap.size, pieces: plan.pieces.length, groups: plan.groups.length,
      reusableDefinitions: Object.keys(plan.definitions).length, cities: Object.keys(game.cities).length,
      roads: game.map.roads.length, waterGroups: game.map.waterGroups.length },
    hashes: { terrain: sha(compiled.terrainBytes), geography: canonicalDigest(compiled.geography, sha),
      minimapGeography: canonicalDigest(compiled.minimapGeography, sha), roads: canonicalDigest(compiled.roadGraph, sha),
      roadCost: sha(compiled.roadCost), roadOffsets: sha(compiled.roadOffsetBytes) } } };
}
