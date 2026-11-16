// CITY-CAPACITY-1 C2 detached search over projectStructuredRoadGraph output.
// KI 491B..4A7A: ordered batches, interleaved carries and per-port visitation.
// This stage retains the proven WORD cost encoding (including wrapping/8000),
// NOT an approved wider cost policy. No v3 runtime/load/save admission yet.
export function searchStructuredRoadGraph(graph, {
  startCityIndex, stopCityIndices, owner, readCityOwner,
}) {
  if (!Array.isArray(stopCityIndices) || stopCityIndices.length < 1 || stopCityIndices.length > 2)
    throw new RangeError('one or two stop city indices required');
  for (const index of [startCityIndex, ...stopCityIndices]) {
    if (!Number.isInteger(index) || index < 0 || index >= graph.nodes.length)
      throw new RangeError('search city index outside graph');
  }
  if (!Number.isInteger(owner) || owner < 0 || owner > 255)
    throw new RangeError('search owner byte required');
  // 491B: no owner reads, allocation or work writes on this shortcut.
  if (stopCityIndices.includes(startCityIndex))
    return { status: 'already-there', cityIndex: startCityIndex };
  if (typeof readCityOwner !== 'function') throw new TypeError('city owner reader required');

  // Graph structure is validated by its owning projection/loading boundary.
  // Every structured node is a CITY; old DS-address ranges are not node kinds.
  const visited = new Uint8Array(graph.nodes.length * 4);
  let entries = [{ cityIndex: startCityIndex, costWord: 0, roadIndex: null, direction: null }];
  let minimum = 0;
  while (entries.length) {
    const next = [];
    for (const entry of entries) {
      if (entry.costWord !== minimum) {
        // 4987: carry here, not after all cheaper entries have expanded.
        next.push(entry);
        continue;
      }
      // 49B6: the stop city itself does not incur fees or an owner read.
      if (stopCityIndices.includes(entry.cityIndex)) return { status: 'found', ...entry };
      const cityOwner = readCityOwner(entry.cityIndex);
      if (!Number.isInteger(cityOwner) || cityOwner < 0 || cityOwner > 255)
        throw new RangeError('unknown city owner byte');
      let cost = entry.costWord;
      if (cityOwner !== owner) cost = ((cost + 0xa6) & 0xffff) | 0x8000;
      cost = (cost + 4) & 0xffff;
      const node = graph.nodes[entry.cityIndex];
      for (const [slot, port] of node.ports.entries()) {
        const visit = entry.cityIndex * 4 + slot;
        if (visited[visit]) continue;
        visited[visit] = 1;
        if (port === null) continue;
        const edge = graph.edges[port.roadIndex];
        const opposite = port.end === 'from' ? edge.toCityIndex : edge.fromCityIndex;
        const oppositeSlot = graph.nodes[opposite].ports.findIndex(p => p?.roadIndex === port.roadIndex);
        const oppositeVisit = opposite * 4 + oppositeSlot;
        if (visited[oppositeVisit]) continue;
        visited[oppositeVisit] = 1;
        next.push({
          cityIndex: opposite,
          costWord: (cost + edge.cost) & 0xffff,
          roadIndex: port.roadIndex,
          // Reverse search: the found endpoint travels BACK toward the root.
          direction: port.end === 'from' ? -1 : 1,
        });
      }
    }
    entries = next;
    minimum = next.reduce((min, entry) => Math.min(min, entry.costWord), 0xffff);
  }
  // D5 approved: do not reinterpret the old exhausted BX=0800 as a road.
  return { status: 'unreachable' };
}
