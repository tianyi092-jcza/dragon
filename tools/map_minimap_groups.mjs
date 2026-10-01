// Author import initialization, not runtime/native hydrology inference.
// Persists real member identities of placed combinations. No IO/RNG here.
import assert from "node:assert/strict";
export function assignMinimapGroups(source, annotations, policy) {
  assert.equal(policy.schemaVersion, 1);
  for (const key of ["showSea", "showLakes", "showOtherRiverGroups"]) assert.equal(typeof policy[key], "boolean");
  const byCell = new Map(annotations.map((a) => [a.y * 384 + a.x, a]));
  assert.equal(byCell.size, annotations.length);
  const groups = [], used = new Set();
  function add(id, name, records, visible) {
    if (!records.length) return;
    const group = { id, name, memberIds: [], baseCells: [], showOnMinimap: visible,
      groupingProvenance: "explicit Web author initialization, not original multi-tile object reconstruction" };
    for (const a of records) {
      const cell = a.y * 384 + a.x;
      assert.ok(!used.has(cell)); used.add(cell);
      group.memberIds.push(a.instanceId);
      if (a.layer === "roads") group.baseCells.push(cell);
    }
    groups.push(group);
  }
  function addPieces(prefix, name, records, visible) {
    const remaining = new Map(records.map((a) => [a.y * 384 + a.x, a]).sort((a, b) => a[0] - b[0]));
    while (remaining.size) {
      const start = remaining.keys().next().value, queue = [start], piece = [];
      const discovered = new Set([start]);
      for (let i = 0; i < queue.length; i++) {
        const a = remaining.get(queue[i]); piece.push(a);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = a.x + dx, y = a.y + dy;
          if (x < 0 || x >= 384 || y < 0 || y >= 256) continue;
          const next = y * 384 + x;
          if (remaining.has(next) && !discovered.has(next)) { discovered.add(next); queue.push(next); }
        }
      }
      for (const cell of queue) remaining.delete(cell);
      add(`${prefix}-${start}`, name, piece, visible);
    }
  }
  // Review regions are NOT placed combination identities: disconnected water
  // pieces in the same review polygon still get independent controls.
  for (const regionId of new Set(annotations.filter((a) => a.waterClass !== "river").map((a) => a.regionId))) {
    const records = annotations.filter((a) => a.regionId === regionId);
    addPieces(`water-${regionId}`, regionId, records, records[0].waterClass === "sea" ? policy.showSea : policy.showLakes);
  }
  function segmentDistance(x, y, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], denominator = dx * dx + dy * dy;
    const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / denominator));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  }
  const bandIds = new Set();
  for (const band of policy.mainRiverBands) {
    assert.ok(typeof band.id === "string" && band.id && !bandIds.has(band.id)); bandIds.add(band.id);
    assert.ok(Number.isInteger(band.radius) && band.radius > 0 && band.radius <= 16);
    assert.ok(Array.isArray(band.points) && band.points.length >= 2);
    for (const point of band.points) assert.ok(point.length === 2 && point.every(Number.isInteger) && point[0] >= 0 && point[0] < 384 && point[1] >= 0 && point[1] < 256);
    const records = annotations.filter((a) => a.waterClass === "river" && !used.has(a.y * 384 + a.x) &&
      band.points.slice(1).some((b, i) => segmentDistance(a.x, a.y, band.points[i], b) <= band.radius));
    addPieces(`river-${band.id}`, band.name, records, true);
  }
  // Each remaining connected piece is an independent actual combination,
  // never one global 'all minor rivers' instance. Class is already explicit.
  addPieces("river-piece", "次要河流组合", annotations.filter((a) => !used.has(a.y * 384 + a.x)), policy.showOtherRiverGroups);
  assert.equal(used.size, annotations.length);
  source.map.waterGroups = groups;
  return groups;
}
