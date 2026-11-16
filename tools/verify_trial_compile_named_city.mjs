// D1(b) regression: compileGameSource accepts raw-less named chapter cities.
// - legacy raw chapters still compile byte-identical (no behaviour change);
// - one chapter row rewritten in named form (cityId + neighbourCityIds, no raw)
//   compiles with an unchanged roadGraph;
// - corrupt raw / wrong neighbours / unknown cityId fail closed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const prefix = `content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`;
const read = (p) => readFileSync(new URL('../web/' + prefix + p, import.meta.url));
const game = JSON.parse(read('game-source.json').toString('utf8'));

const baseline = compileGameSource(game, sha);
const slotCityId = new Map();
for (const row of game.chapters[game.chapterOrder[0]].state.cities) {
  const place = game.map.placements.find((p) => p.x === row.x && p.y === row.y);
  assert.ok(place?.cityId, `placement covers slot ${row.idx}`);
  slotCityId.set(row.idx, place.cityId);
}
// neighbour slots of slot s from the compiled road graph adjacency.
const adjacency = new Map(baseline.roadGraph.nodes.map((n) => [n.id, []]));
for (const edge of baseline.roadGraph.edges) {
  adjacency.get(edge.source).push(edge.target);
  adjacency.get(edge.target).push(edge.source);
}
for (const list of adjacency.values()) list.sort((a, b) => a - b);

const named = structuredClone(game);
{
  const ch = named.chapterOrder[0];
  const rows = named.chapters[ch].state.cities;
  for (const s of [0, 5]) {
    const row = rows[s];
    const ids = adjacency.get(s).map((t) => slotCityId.get(t));
    while (ids.length < 4) ids.push(null);
    assert.equal(ids.length, 4);
    delete row.raw;
    row.cityId = slotCityId.get(s);
    row.neighbourCityIds = ids;
    for (const f of ['attr', '_aiCooldown', '_strategicLastFaction', 'strategicBorderCount', 'disaster_event', 'cityCacheByte']) row[f] = 0;
  }
}
const mixed = compileGameSource(named, sha);
assert.deepEqual(mixed.roadGraph, baseline.roadGraph);
assert.deepEqual(Buffer.from(mixed.terrainBytes), Buffer.from(baseline.terrainBytes));
console.log('named-branch mixed chapter compiles, roadGraph unchanged');

const badRaw = structuredClone(game);
badRaw.chapters[badRaw.chapterOrder[0]].state.cities[0].raw = 'zz';
assert.throws(() => compileGameSource(badRaw, sha), /unsupported chapter city source/);
const badNbr = structuredClone(named);
badNbr.chapters[badNbr.chapterOrder[0]].state.cities[0].neighbourCityIds = [null, null, null, null];
assert.throws(() => compileGameSource(badNbr, sha), /unsupported chapter topology change/);
const badId = structuredClone(named);
badId.chapters[badId.chapterOrder[0]].state.cities[0].cityId = 'city-404';
assert.throws(() => compileGameSource(badId, sha), /without archive coverage/);
console.log('named-branch failures fail closed');
