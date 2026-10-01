// Shared explicit Web DISPLAY authoring only, never a native water oracle.
// Mutates the caller's isolated source; callers must compile/compare native
// bytes and discard this source on failure. No filesystem/network/RNG access.
import assert from "node:assert/strict";
export function applyWaterDisplayProposal(source, plane, proposal, proposalSha256, planeSha256) {
  assert.equal(proposal.schemaVersion, 1);
  assert.ok(["PROPOSED_NOT_APPROVED", "CATEGORY_APPROVED_VISUAL_PENDING"].includes(proposal.status));
  if (proposal.status === "CATEGORY_APPROVED_VISUAL_PENDING") {
    assert.equal(proposal.categoryReview?.decision, "APPROVED");
    assert.equal(proposal.categoryReview?.source, "本轮用户明确认可水域类别，要求修改小地图及实际组合级显示开关");
  }
  assert.equal(plane.length, 384 * 256);
  assert.equal(planeSha256, proposal.sourcePlaneSha256);
  assert.match(proposalSha256, /^[a-f0-9]{64}$/);
  const kinds = { sea: 1, river: 2, lake: 3 }, ids = new Set(proposal.waterBearingTileIds), regions = new Set();
  assert.equal(ids.size, proposal.waterBearingTileIds.length);
  for (const id of ids) assert.ok(Number.isInteger(id) && id >= 0 && id <= 255);
  assert.equal(proposal.defaultWaterRegion.waterClass, "river");
  for (const region of [proposal.defaultWaterRegion, ...proposal.regions]) {
    assert.match(region.id, /^[A-Za-z0-9-]+$/); assert.ok(!regions.has(region.id)); regions.add(region.id);
    assert.ok(Object.hasOwn(kinds, region.waterClass));
    if (region !== proposal.defaultWaterRegion) {
      assert.ok(region.polygon.length >= 3);
      for (const p of region.polygon) assert.ok(Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && p[0] >= 0 && p[0] <= 384 && p[1] >= 0 && p[1] <= 256);
    }
  }
  // Rasterization of literal author coordinates, not semantic inference.
  function contains(polygon, x, y) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function regionAt(x, y) {
    const hits = proposal.regions.filter((r) => contains(r.polygon, x + 0.5, y + 0.5));
    assert.ok(hits.length <= 1, `ambiguous authored water regions at ${x},${y}`);
    return hits[0] ?? proposal.defaultWaterRegion;
  }
  const waterRoads = new Set(proposal.waterRoadIds), roadAnnotations = [];
  assert.equal(waterRoads.size, proposal.waterRoadIds.length);
  const actualRoadIds = new Set(source.map.roads.map((r) => r.id));
  for (const id of waterRoads) assert.ok(actualRoadIds.has(id), `unknown author road reference ${id}`);
  for (const road of source.map.roads) {
    const originalKind = road.travelKind;
    road.travelKind = waterRoads.has(road.id) ? "water" : "land";
    road.travelKindProvenance = { role: "Web-author-display-status:" + proposal.status, proposalId: proposal.id, sourceRole: "literal waterRoadIds/other land incl bridges; NOT native flags/weight" };
    roadAnnotations.push({ id: road.id, originalKind, proposedKind: road.travelKind, fromCityId: road.fromCityId,
      toCityId: road.toCityId, geometry: road.geometry, nativeBinding: road.nativeBinding });
  }
  const annotations = [], counts = Object.fromEntries([...regions].map((id) => [id, 0]));
  source.map.base.geography.fill(0);
  source.map.base.geographyProvenance = { role: "Web-authored-display-status:" + proposal.status, proposalId: proposal.id,
    proposalSha256, sourcePlaneSha256: planeSha256, semantics: "Visible water atoms carry classes. Hidden rule underlays remain UNKNOWN, never fabricated. Road graphic water has an explicit base display annotation; this is not proof of its hidden native terrain." };
  function annotate(instance, layer) {
    const cell = instance.y * 384 + instance.x;
    if (!ids.has(plane[cell])) return;
    const region = regionAt(instance.x, instance.y);
    counts[region.id]++;
    const record = { instanceId: instance.id, layer, x: instance.x, y: instance.y, tileId: plane[cell], regionId: region.id, waterClass: region.waterClass };
    annotations.push(record);
    if (layer === "decorations") {
      instance.waterClass = region.waterClass;
      instance.waterDisplayProvenance = { proposalId: proposal.id, regionId: region.id, status: proposal.status };
    } else {
      source.map.base.geography[cell] = kinds[region.waterClass];
      record.role = "visible-road-water-display-only; no hidden-rule-layer claim";
    }
  }
  for (const instance of source.map.decorations) annotate(instance, "decorations");
  for (const road of source.map.roads) for (const instance of road.components) annotate(instance, "roads");
  for (const placement of source.map.placements) assert.ok(!ids.has(plane[placement.y * 384 + placement.x]));
  for (const count of Object.values(counts)) assert.ok(count > 0, "every proposed region must include an actual water-bearing atom");
  return { annotations, counts, roadAnnotations, waterRoads, kinds };
}
