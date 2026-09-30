// M2 统一地图源校验/编译共享核心（Web 工程方案，非原版机制）。
// 同一结构服务内置迁移与后续编辑副本；同一编译管线产生规则输入与视觉派生。
// 容量：现行规则 profile 只接受 384x256、192 据点及现有固定槽域；超域明确拒绝。

export const MAP_SCHEMA_VERSION = 1;
export const RULE_PROFILE = "ki-1995/web-0.1.1";
export const SUPPORTED_BOUNDS = Object.freeze({ width: 384, height: 256, tileSize: 16 });
export const CITY_SLOTS = 192;
// A-CAP-1 负控：原道路低区的分区编码空间（节点自 0000、边 0800..1FFF、
// 点 2000..7FFF，见排查§4）只给出上界 384 边／6144 点，不是可玩容量承诺。
// 超出编码空间的输入在此明确拒绝；域内新增仍须 G-ROAD/G-CAP 专项放行。
export const MAX_ROAD_EDGES = 384;
export const MAX_ROAD_POINTS = 6144;

function isInt(value, low, high) {
  return Number.isInteger(value) && value >= low && value <= high;
}

export function validateMapSource(src) {
  if (!src || typeof src !== "object") throw new TypeError("map source must be an object");
  if (src.schemaVersion !== MAP_SCHEMA_VERSION) throw new RangeError("unsupported map schemaVersion");
  const bounds = src.map?.bounds;
  if (!bounds || bounds.width !== SUPPORTED_BOUNDS.width || bounds.height !== SUPPORTED_BOUNDS.height || bounds.tileSize !== SUPPORTED_BOUNDS.tileSize)
    throw new RangeError("unsupported map bounds for current rule profile");
  if (!Number.isInteger(bounds.minX) || !Number.isInteger(bounds.minY)) throw new TypeError("bounds minX/minY must be integers");
  // A-CAP-1：现行规则 profile 只支持原点域；左／上扩边会平移编译坐标，
  // 须转换全部地图引用（排查§4），在 G-CAP 适配完成前明确拒绝而非默许。
  if (bounds.minX !== 0 || bounds.minY !== 0) throw new RangeError("non-zero map origin is not supported by the current rule profile");
  const W = bounds.width;
  const H = bounds.height;
  const base = src.map?.base;
  if (!Array.isArray(base?.terrainRef) || base.terrainRef.length !== W * H) throw new TypeError("base.terrainRef must cover every cell");
  for (let i = 0; i < base.terrainRef.length; i++) {
    if (!isInt(base.terrainRef[i], 0, 255)) throw new RangeError(`base.terrainRef[${i}] out of range`);
  }
  if (!Array.isArray(base?.geography) || base.geography.length !== W * H) throw new TypeError("base.geography must cover every cell");
  for (let i = 0; i < base.geography.length; i++) {
    if (!isInt(base.geography[i], 0, 2)) throw new RangeError(`base.geography[${i}] must be 0/1/2`);
  }
  const decorations = src.map?.decorations;
  if (!Array.isArray(decorations)) throw new TypeError("map.decorations must be an array");
  const defs = src.componentDefinitions ?? {};
  for (const [index, deco] of decorations.entries()) {
    if (!deco || typeof deco.id !== "string" || !deco.id) throw new TypeError(`decorations[${index}].id invalid`);
    if (typeof deco.definitionRef !== "string" || !defs[deco.definitionRef]) throw new RangeError(`decorations[${index}] unknown definitionRef`);
    if (!isInt(deco.x, bounds.minX, bounds.minX + W - 1) || !isInt(deco.y, bounds.minY, bounds.minY + H - 1))
      throw new RangeError(`decorations[${index}] out of bounds`);
  }
  const placements = src.map?.placements;
  if (!Array.isArray(placements) || placements.length !== CITY_SLOTS) throw new RangeError(`map.placements must contain ${CITY_SLOTS} slots`);
  const seenCells = new Set();
  const seenCities = new Set();
  for (const [index, place] of placements.entries()) {
    if (!place || typeof place.cityId !== "string" || !place.cityId) throw new TypeError(`placements[${index}].cityId invalid`);
    if (seenCities.has(place.cityId)) throw new RangeError(`placements[${index}] duplicate cityId`);
    seenCities.add(place.cityId);
    if (!isInt(place.x, bounds.minX, bounds.minX + W - 1) || !isInt(place.y, bounds.minY, bounds.minY + H - 1))
      throw new RangeError(`placements[${index}] out of bounds`);
    const key = `${place.x},${place.y}`;
    if (seenCells.has(key)) throw new RangeError(`placements[${index}] shares a node cell (据点不得共享同一节点格)`);
    seenCells.add(key);
  }
  const roads = src.map?.roads;
  if (!Array.isArray(roads)) throw new TypeError("map.roads must be an array");
  if (roads.length > MAX_ROAD_EDGES) throw new RangeError(`map.roads exceeds native encoding space (${MAX_ROAD_EDGES})`);
  let totalPoints = 0;
  const cityIds = new Set(placements.map((p) => p.cityId));
  const cityById = new Map(placements.map((p) => [p.cityId, p]));
  const tileAt = (x, y) => base.terrainRef[y * W + x];
  // A-ROAD-1 disconnect refusal (authoring side): each endpoint must be a
  // D4..DD port tile, cardinally aligned with its endpoint city at
  // distance 1..2 (certified 508/508 on original output). Truncated or
  // mis-targeted geometry is rejected, not silently compiled.
  const isPortOf = (pt, city) => {
    const tile = tileAt(pt.x, pt.y);
    const dx = pt.x - city.x;
    const dy = pt.y - city.y;
    const cardinal = (dx === 0 || dy === 0) && (dx !== 0 || dy !== 0);
    return tile >= 0xd4 && tile <= 0xdd && cardinal && Math.max(Math.abs(dx), Math.abs(dy)) <= 2;
  };
  for (const [index, road] of roads.entries()) {
    if (!road || typeof road.id !== "string" || !road.id) throw new TypeError(`roads[${index}].id invalid`);
    if (!cityIds.has(road.fromCityId) || !cityIds.has(road.toCityId)) throw new RangeError(`roads[${index}] unknown endpoint`);
    if (road.travelKind !== "land" && road.travelKind !== "water") throw new RangeError(`roads[${index}].travelKind must be land|water`);
    if (!Array.isArray(road.geometry) || road.geometry.length === 0) throw new TypeError(`roads[${index}].geometry must be non-empty`);
    totalPoints += road.geometry.length;
    if (totalPoints > MAX_ROAD_POINTS) throw new RangeError(`map road points exceed native encoding space (${MAX_ROAD_POINTS})`);
    for (const [gi, pt] of road.geometry.entries()) {
      if (!isInt(pt.x, bounds.minX, bounds.minX + W - 1) || !isInt(pt.y, bounds.minY, bounds.minY + H - 1))
        throw new RangeError(`roads[${index}].geometry[${gi}] out of bounds`);
    }
    const fromCity = cityById.get(road.fromCityId);
    const toCity = cityById.get(road.toCityId);
    if (!isPortOf(road.geometry[0], fromCity) || !isPortOf(road.geometry.at(-1), toCity))
      throw new RangeError(`roads[${index}] endpoints must be ports of their cities`);
  }
  return true;
}

// 编译：规则地形字节（base.terrainRef 直出）＋ 显式地理 ＋ 静态路网掩码。
// 不猜通行/代价，不改有序道路语义；小地图由同一 minimap.js 核心派生。
export function compileMapSource(src) {
  validateMapSource(src);
  const W = src.map.bounds.width;
  const H = src.map.bounds.height;
  const terrainBytes = Uint8Array.from(src.map.base.terrainRef);
  const geography = Uint8Array.from(src.map.base.geography);
  const roadMask = new Uint8Array(W * H);
  for (const road of src.map.roads) {
    for (const pt of road.geometry) {
      const lx = pt.x - src.map.bounds.minX;
      const ly = pt.y - src.map.bounds.minY;
      roadMask[ly * W + lx] = 1;
    }
  }
  return Object.freeze({ terrainBytes, geography, roadMask, width: W, height: H });
}
