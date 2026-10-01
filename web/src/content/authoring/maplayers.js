// GameSource@1 four-layer composition. Web authoring, NOT a KI stacking rule.
// Trusted recipe ki-byte-stamp-1 preserves an explicit original MMAP tile
// byte (MMAP.MDL: 256 opaque 16x16 tiles). No color/water/road label is
// converted into native terrain, movement cost, RNG, or topology.
// Native consumers still read the resulting single plane (E4CE, E961,
// 2708, 4B63, 8A1E). Unsupported recipes fail for every game identity.
export const BYTE_STAMP_RECIPE = "ki-byte-stamp-1";
export const WATER_CLASSES = Object.freeze({ sea: 1, river: 2, lake: 3 });

function fail(code, at) {
  throw new RangeError(`${code}: ${at}`);
}
function integer(value, low, high, at) {
  if (!Number.isInteger(value) || value < low || value > high) fail("INVALID_COMPONENT_VALUE", at);
}

// base null is UNKNOWN, not tile zero. Unknown cells may be completely
// covered by explicit stamps; deleting those stamps exposes the unknown
// and strict compilation refuses until the author supplies a replacement.
export function composeMapLayers(src, { draft = false } = {}) {
  const { bounds, base, decorations, roads, placements } = src.map;
  const W = bounds.width;
  const H = bounds.height;
  const terrain = base.terrainRef.slice();
  const geography = Uint8Array.from(base.geography);
  const minimapGeography = Uint8Array.from(base.geography);
  const groups = src.map.waterGroups === undefined ? [] : src.map.waterGroups;
  if (!Array.isArray(groups)) fail("INVALID_WATER_GROUPS", "map.waterGroups");
  const instances = new Map();
  for (const instance of [...decorations, ...roads.flatMap((r) => r.components ?? [])]) {
    if (instances.has(instance.id)) fail("DUPLICATE_COMPONENT_ID", instance.id);
    instances.set(instance.id, instance);
  }
  const groupIds = new Set(), groupedMembers = new Set(), groupedBase = new Set(), hiddenMembers = new Set();
  for (const group of groups) {
    if (typeof group?.id !== "string" || !group.id || groupIds.has(group.id)) fail("INVALID_WATER_GROUP_ID", "waterGroups");
    groupIds.add(group.id);
    if (typeof group.showOnMinimap !== "boolean" || !Array.isArray(group.memberIds) || !Array.isArray(group.baseCells) ||
        group.memberIds.length + group.baseCells.length === 0) fail("INVALID_WATER_GROUP", group.id);
    for (const id of group.memberIds) {
      if (!instances.has(id) || groupedMembers.has(id)) fail("INVALID_WATER_GROUP_MEMBER", group.id);
      groupedMembers.add(id);
      if (!group.showOnMinimap) hiddenMembers.add(id);
    }
    for (const cell of group.baseCells) {
      integer(cell, 0, W * H - 1, group.id);
      if (groupedBase.has(cell) || base.geography[cell] === 0) fail("INVALID_WATER_GROUP_BASE", group.id);
      groupedBase.add(cell);
      if (!group.showOnMinimap) minimapGeography[cell] = 0;
    }
  }
  const diagnostics = [];
  const seen = new Set();
  const defs = src.componentDefinitions ?? {};
  const cache = new Map();
  function unsupported(code, at) {
    if (!draft) fail(code, at);
    diagnostics.push({ code, message: `${code}: ${at}` });
    return null; // draft diagnostic only, never a runnable byte substitute
  }

  function recipe(definitionRef, variantRef, at) {
    if (typeof definitionRef !== "string" || (variantRef !== undefined && typeof variantRef !== "string"))
      fail("INVALID_COMPONENT_REFERENCE", at);
    const key = JSON.stringify([definitionRef, variantRef ?? "original"]);
    if (cache.has(key)) return cache.get(key);
    const def = defs[definitionRef];
    if (!def) fail("UNKNOWN_COMPONENT_DEFINITION", at);
    if (def.id !== definitionRef || typeof def.revision !== "string" || !def.revision || typeof def.category !== "string" || !def.category)
      fail("INVALID_COMPONENT_IDENTITY", at);
    if (def.ruleRecipeRef !== BYTE_STAMP_RECIPE) return unsupported("UNSUPPORTED_RULE_BINDING", at);
    if (!Array.isArray(def.anchor) || def.anchor.length !== 2) fail("INVALID_COMPONENT_ANCHOR", at);
    for (const v of def.anchor) integer(v, -383, 383, at);
    if (!Array.isArray(def.footprint) || def.footprint.length === 0) fail("INVALID_COMPONENT_FOOTPRINT", at);
    const footprint = new Set();
    for (const point of def.footprint) {
      if (!Array.isArray(point) || point.length !== 2) fail("INVALID_COMPONENT_FOOTPRINT", at);
      for (const v of point) integer(v, -383, 383, at);
      const cell = point.join(",");
      if (footprint.has(cell)) fail("DUPLICATE_COMPONENT_CELL", at);
      footprint.add(cell);
    }
    const tiles = def.variants?.[variantRef ?? "original"]?.tiles;
    if (!Array.isArray(tiles) || tiles.length !== footprint.size) fail("INVALID_COMPONENT_VARIANT", at);
    const cells = new Set();
    for (const tuple of tiles) {
      if (!Array.isArray(tuple) || tuple.length !== 3) fail("INVALID_COMPONENT_VARIANT", at);
      const [x, y, tile] = tuple;
      integer(x, -383, 383, at);
      integer(y, -383, 383, at);
      integer(tile, 0, 255, at);
      const cell = `${x},${y}`;
      if (!footprint.has(cell) || cells.has(cell)) fail("INVALID_COMPONENT_VARIANT", at);
      cells.add(cell);
    }
    const visualMatches = def.visualRef === "MMAP.MDL:indexed-footprint" ||
      (tiles.length === 1 && def.visualRef === `MMAP.MDL:tile-${tiles[0][2]}`);
    if (!visualMatches) return unsupported("UNSUPPORTED_VISUAL_BINDING", at);
    let waterCells = footprint;
    if (def.geographyMask !== undefined) {
      if (!Array.isArray(def.geographyMask)) fail("INVALID_GEOGRAPHY_MASK", at);
      waterCells = new Set();
      for (const point of def.geographyMask) {
        if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isInteger)) fail("INVALID_GEOGRAPHY_MASK", at);
        const cell = point.join(",");
        if (!footprint.has(cell) || waterCells.has(cell)) fail("INVALID_GEOGRAPHY_MASK", at);
        waterCells.add(cell);
      }
    }
    const result = { def, tiles, waterCells };
    cache.set(key, result);
    return result;
  }

  function stamp(instance, at, selectWater) {
    if (typeof instance?.id !== "string" || !instance.id) fail("INVALID_COMPONENT_ID", at);
    if (seen.has(instance.id)) fail("DUPLICATE_COMPONENT_ID", at);
    seen.add(instance.id);
    const bound = recipe(instance.definitionRef, instance.variantRef, at);
    if (bound === null) return;
    const { def, tiles, waterCells } = bound;
    integer(instance.x, 0, W - 1, at);
    integer(instance.y, 0, H - 1, at);
    if (instance.waterClass !== undefined && !Object.hasOwn(WATER_CLASSES, instance.waterClass))
      fail("INVALID_WATER_CLASS", at);
    // A non-water component never erases lower water geography, even
    // though its opaque native tile replaces the lower rule/visual tile.
    const water = instance.waterClass;
    for (const [dx, dy, tile] of tiles) {
      const x = instance.x + dx - def.anchor[0];
      const y = instance.y + dy - def.anchor[1];
      integer(x, 0, W - 1, at);
      integer(y, 0, H - 1, at);
      terrain[y * W + x] = tile;
      if (selectWater && water !== undefined && waterCells.has(`${dx},${dy}`)) {
        geography[y * W + x] = WATER_CLASSES[water];
        if (!hiddenMembers.has(instance.id)) minimapGeography[y * W + x] = WATER_CLASSES[water];
      }
    }
  }

  // Later decorations are on top. hidden/locked are workspace state and
  // deliberately do not suppress, remove, or reorder published content.
  for (const [i, deco] of decorations.entries()) stamp(deco, `decorations[${i}]`, true);
  // Road components are explicit authored byte stamps, separate from the
  // path and travelKind. Do not invent tiles from a land/water string.
  for (const [i, road] of roads.entries()) {
    if (road.components !== undefined && !Array.isArray(road.components)) fail("INVALID_ROAD_COMPONENTS", `roads[${i}]`);
    for (const [j, component] of (road.components ?? []).entries()) stamp(component, `roads[${i}].components[${j}]`, false);
  }
  for (const [i, place] of placements.entries()) {
    if (place.componentRef != null) stamp({ ...place, definitionRef: place.componentRef }, `placements[${i}]`, false);
  }
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === null) {
      const diagnostic = { code: "UNKNOWN_UNDERLAY", cell: i, x: i % W, y: Math.floor(i / W),
        message: `UNKNOWN_UNDERLAY: uncovered cell ${i % W},${Math.floor(i / W)}` };
      if (!draft) throw new RangeError(diagnostic.message);
      diagnostics.push(diagnostic);
    } else integer(terrain[i], 0, 255, `terrain[${i}]`);
  }
  return { terrain, geography, minimapGeography, diagnostics };
}
