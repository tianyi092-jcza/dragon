// 费用域 decision analysis (NOT a policy change): analytic bound + empirical
// max search cost on the real 192 graph via the certified structured search,
// plus synthetic chain projection showing where u16 wrap bites. Prints memo
// numbers only. No product code changed.
import os from 'node:os';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { searchStructuredRoadGraph } from '../web/src/game/navigation/structuredroadsearch.js';
import { captureCitySource } from '../web/src/content/authoring/citysource.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';

const sha = b => createHash('sha256').update(b).digest('hex');
console.log(`machine: ${os.cpus()[0].model} x${os.cpus().length}, ${(os.totalmem() / 2 ** 30).toFixed(1)}GiB, ${process.platform} ${process.version}`);
const rev = BUILTIN_RESOURCES.world.revision;
const game = JSON.parse(fs.readFileSync(new URL(`../web/content/builtin/compiled/${rev}/game-source.json`, import.meta.url), 'utf8'));
const compiled = compileGameSource(game, sha);
const { nodes, edges } = compiled.roadGraph;
console.log(`graph: ${nodes.length} nodes, ${edges.length} edges`);
const projected = projectStructuredRoadGraph(game.map.roads, captureCitySource({
  cities: Object.fromEntries(Object.keys(game.cities).map(id => [id, { cityId: id }])),
  cityOrder: Object.keys(game.cities), placements: game.map.placements }));
console.log(`projected edge keys: ${Object.keys(projected.edges[0]).join(',')}`);
console.log(`edge keys: ${Object.keys(edges[0]).join(',')}`);
const weights = edges.map(e => e.weight ?? e.cost ?? 0);
const maxEdge = Math.max(...weights);
console.log(`edge weight: min=${Math.min(...weights)} max=${maxEdge}`);
const totalWeight = weights.reduce((a, b) => a + b, 0);
// Worst simple path: every edge once + per-node non-owner overhead (0xA6+4).
console.log(`analytic worst simple-path upper bound: totalWeight(${totalWeight}) + 192*0xAA(${192 * 0xaa}) = ${totalWeight + 192 * 0xaa} (wrap at 65536)`);

// Empirical: far-apart pairs by coordinate distance, all-non-owner (max cost).
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const pairs = [];
for (let i = 0; i < nodes.length; i += 5) {
  let best = -1, bestD = -1;
  for (let j = 0; j < nodes.length; j += 7) {
    if (i === j) continue;
    const d = dist(nodes[i], nodes[j]);
    if (d > bestD) { bestD = d; best = j; }
  }
  pairs.push([i, best]);
}
let maxCost = 0, maxPair = null;
for (const [a, b] of pairs) {
  const r = searchStructuredRoadGraph(projected,
    { startCityIndex: a, stopCityIndices: [b], owner: 0, readCityOwner: () => 1 });
  if (r.status === 'found' && r.costWord > maxCost) { maxCost = r.costWord; maxPair = [a, b]; }
}
console.log(`empirical max costWord over ${pairs.length} far pairs (all non-owner): ${maxCost} pair=${maxPair}`);

// Expanded projection: synthetic chains, worst-case edge weight 255,
// all non-owner. Shows where the retained u16 wrap bites.
// Expanded projection: steps to first fold. Per non-owner edge the rule adds
// 0xAA then the edge weight; folding starts when the unwrapped accumulator
// first reaches 65536 (order inversion only matters past this point).
for (const [label, edge] of [['worst-case edge 255', 255], ['real-average edge ~21', 21]]) {
  const perStep = 0xaa + edge;
  console.log(`${label}: folds past ${Math.ceil(65536 / perStep)} max-fee edges`);
}
console.log('policy input: 192-graph analytic bound above vs 65536; wrap impossible below bound.');
