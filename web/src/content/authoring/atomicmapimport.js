// Explicit single-plane -> editable four-layer import, not runtime fallback.
// Geometry/placement identity selects ROAD/CITY cells; remaining opaque
// tiles become individual decoration atoms. No semantic mountain/river
// grouping, hidden terrain, water class or native rule is guessed.
import { BYTE_STAMP_RECIPE } from "./maplayers.js";
import { compileMapSource } from "./mapcompile.js";

export function liftAtomicMapSource(source, sourceRef) {
  if (typeof sourceRef !== "string" || !sourceRef) throw new TypeError("fixed source provenance required");
  const before = compileMapSource(source);
  if (source.map.decorations.length || source.map.roads.some((r) => r.components?.length) ||
      source.map.placements.some((p) => p.componentRef != null))
    throw new RangeError("single-plane import requires an unlayered source, never flatten authored layers");
  const result = structuredClone(source);
  const { map } = result;
  const W = before.width;
  const covered = new Map();
  const definitions = {};
  for (let tile = 0; tile < 256; tile++) {
    const id = `tile-${tile}`;
    definitions[id] = { id, revision: "original-byte-1", category: "atomic-original",
      footprint: [[0, 0]], anchor: [0, 0], visualRef: `MMAP.MDL:tile-${tile}`,
      ruleRecipeRef: BYTE_STAMP_RECIPE, variants: { original: { tiles: [[0, 0, tile]] } },
      evidenceRef: { resource: "MMAP.MDL", offset: tile * 128, byteLength: 128 },
      semanticGrouping: "UNKNOWN: individual opaque tile, not a reconstructed multi-tile object" };
  }
  const unknownUnderlays = {};
  function claim(x, y, id) {
    const cell = y * W + x;
    if (covered.has(cell)) throw new RangeError(`import ownership overlap at ${x},${y}`);
    covered.set(cell, id);
    unknownUnderlays[cell] = { sourceRef: `${sourceRef}:cell-${cell}`, coveringInstanceId: id };
    return { id, definitionRef: `tile-${before.terrainBytes[cell]}`, x, y, variantRef: "original",
      importRef: `${sourceRef}:cell-${cell}` };
  }
  for (const road of map.roads) {
    road.components = road.geometry.map((point, i) => claim(point.x, point.y, `import-${road.id}-point-${i}`));
  }
  for (const place of map.placements) {
    const atom = claim(place.x, place.y, place.id);
    place.componentRef = atom.definitionRef;
    place.variantRef = atom.variantRef;
    place.importRef = atom.importRef;
  }
  for (let cell = 0; cell < before.terrainBytes.length; cell++) {
    if (!covered.has(cell)) map.decorations.push(claim(cell % W, Math.floor(cell / W), `import-atom-${cell}`));
  }
  map.base.terrainRef = Array(before.terrainBytes.length).fill(null);
  map.base.unknownUnderlays = unknownUnderlays;
  // Import retains the caller's annotation/provenance, never recalculates
  // sea/river/lake from connectivity, pixels, or field classification.
  result.componentDefinitions = definitions;
  result.compatibility = { ...result.compatibility,
    atomicImport: { sourceRef, originalRulePlanePreserved: true,
      geographyStatus: "Caller-supplied annotation/provenance; this importer is NOT a water-class oracle",
      groupingStatus: "Atomic cells only; semantic multi-tile grouping remains unknown" } };
  const after = compileMapSource(result);
  for (let i = 0; i < before.terrainBytes.length; i++) {
    if (before.terrainBytes[i] !== after.terrainBytes[i] || before.geography[i] !== after.geography[i])
      throw new Error(`atomic import changed explicit cell ${i}`);
  }
  return result;
}
