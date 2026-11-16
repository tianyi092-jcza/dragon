// M257 VPERF baseline: codec-level timings on a 257-node v3 chain graph.
// No product code, no saves, no network. Prints machine + timings + heap.
import os from "node:os";
import { createCheckedOriginalRoadMemory } from "../web/src/game/navigation/originalroadmemory.js";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";

const N = 257;
const nodes = Array.from({ length: N }, (_, id) => ({ id, edgeSlots: [0, 0, 0, 0] }));
const edges = [];
for (let i = 0; i < N - 1; i++) {
  const a = 0x810 + i * 16;
  nodes[i].edgeSlots[1] = 0x4000 | a;
  nodes[i + 1].edgeSlots[0] = 0x8000 | a;
  edges.push({
    id: i, source: i, target: i + 1, weight: 1,
    bounds: { minX: i % 384, maxX: i % 384, minY: 10, maxY: 10 },
    points: [{ x: i % 384, y: 10, flags: 0x44 }],
  });
}
const graph = { version: 3, nodes, edges };
const time = (label, fn) => {
  const t0 = process.hrtime.bigint();
  const out = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${label}: ${ms.toFixed(2)}ms`);
  return out;
};
console.log(`machine: ${os.cpus()[0].model} x${os.cpus().length}, ${(os.totalmem() / 2 ** 30).toFixed(1)}GiB, ${process.platform} ${process.version}`);
const memory = time("v3 checked encode (257 nodes)", () => createCheckedOriginalRoadMemory(graph));
console.log(`heap after encode: ${(process.memoryUsage().heapUsed / 2 ** 20).toFixed(1)}MiB`);
time("snapshot (257-node initial)", () => memory.snapshot());
const reads = new Map();
const result = time("v3 search end-to-end (0 -> 256, indexed owners)", () =>
  searchOriginalRoadMemory({
    start: 0, stopB: 256 * 8, stopC: 256 * 8, owner: 0,
    readGraphByte: (a) => memory.readByte(a & 0xffff),
    writeGraphByte: (a, v) => memory.writeByte(a & 0xffff, v),
    readStateByte: () => { throw new Error("legacy path must not fire"); },
    readCityOwnerAtNode: (node) => { reads.set(node, (reads.get(node) ?? 0) + 1); return 0; },
    cityNodeBound: N * 8,
    regions: { scratchEnd: 0x8000 + N * 8, queueBase: 0x9000 },
  }),
);
console.log(`search result: ${JSON.stringify(result)}, owner reads: ${reads.size}`);
console.log(`heap after search: ${(process.memoryUsage().heapUsed / 2 ** 20).toFixed(1)}MiB`);
