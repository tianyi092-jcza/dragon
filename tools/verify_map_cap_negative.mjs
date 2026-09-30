import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// A-CAP-1 negative controls: every out-of-profile map source must be
// accurately rejected (RangeError/TypeError); the in-profile source must
// compile. Probes: width 385, height 257, tileSize, negative minX/minY,
// placements 191/193, roads 385 edges, 6145 total points, out-of-bounds
// geometry point, duplicate cityId, bad travelKind, unknown endpoint.
// These numbers are boundary probes, not gameplay thresholds (admission §5).
// Pure node, no product assets touched, no SAVE.DAT.
import assert from "node:assert/strict";
import {
  compileMapSource,
  validateMapSource,
  MAX_ROAD_EDGES,
  MAX_ROAD_POINTS,
} from "../web/src/content/authoring/mapcompile.js";

const W = 384;
const H = 256;

function validSource() {
  const placements = [];
  for (let i = 0; i < 192; i++) {
    placements.push({ cityId: `city-${i}`, x: i % W, y: Math.floor(i / W) });
  }
  // Port-shape endpoints (A-ROAD-1): city-0 at (10,10) with port (10,11),
  // city-1 at (10,13) with port (10,12); both D4 tiles, cardinal dist 1.
  placements[0] = { cityId: "city-0", x: 10, y: 10 };
  placements[1] = { cityId: "city-1", x: 10, y: 13 };
  const terrainRef = Array.from({ length: W * H }, () => 0x20);
  terrainRef[11 * W + 10] = 0xd4;
  terrainRef[12 * W + 10] = 0xd4;
  return {
    schemaVersion: 1,
    componentDefinitions: {},
    map: {
      bounds: { minX: 0, minY: 0, width: W, height: H, tileSize: 16 },
      base: {
        terrainRef,
        geography: Array.from({ length: W * H }, () => 0),
      },
      decorations: [],
      placements,
      roads: [
        {
          id: "road-0",
          fromCityId: "city-0",
          toCityId: "city-1",
          travelKind: "land",
          geometry: [
            { x: 10, y: 11 },
            { x: 10, y: 12 },
          ],
        },
      ],
    },
  };
}

function expectReject(name, mutate, ErrorClass = RangeError) {
  const src = validSource();
  mutate(src);
  assert.throws(() => validateMapSource(src), ErrorClass, `${name} must reject`);
  assert.throws(() => compileMapSource(src), ErrorClass, `${name} must reject on compile`);
  tlog(`reject OK: ${name} (${ErrorClass.name})`);
}

// Positive control: in-profile source compiles; mask marks road cells.
const compiled = compileMapSource(validSource());
assert.equal(compiled.width, W);
assert.equal(compiled.height, H);
assert.equal(compiled.terrainBytes.length, W * H);
assert.equal(compiled.roadMask[11 * W + 10], 1);
assert.equal(compiled.roadMask[12 * W + 10], 1);
assert.equal(compiled.roadMask[0], 0);
tlog("positive control: in-profile source compiles, roadMask exact");

// Bounds probes.
expectReject("width 385", (src) => {
  src.map.bounds.width = 385;
});
expectReject("height 257", (src) => {
  src.map.bounds.height = 257;
});
expectReject("tileSize 8", (src) => {
  src.map.bounds.tileSize = 8;
});
expectReject("negative minX", (src) => {
  src.map.bounds.minX = -16;
});
expectReject("negative minY", (src) => {
  src.map.bounds.minY = -16;
});

// Placement count probes.
expectReject("placements 191", (src) => {
  src.map.placements.length = 191;
});
expectReject("placements 193", (src) => {
  src.map.placements.push({ cityId: "city-192", x: 200, y: 0 });
});
expectReject("duplicate cityId", (src) => {
  src.map.placements[1].cityId = "city-0";
});
expectReject("placement out of bounds", (src) => {
  src.map.placements[0].x = 384;
});

// Road probes.
expectReject("unknown endpoint", (src) => {
  src.map.roads[0].toCityId = "city-999";
});
expectReject("bad travelKind", (src) => {
  src.map.roads[0].travelKind = "air";
});
expectReject("geometry out of bounds", (src) => {
  src.map.roads[0].geometry.push({ x: 384, y: 0 });
});
// A-ROAD-1 disconnect refusal: truncated end on a non-port tile.
expectReject("non-port end", (src) => {
  src.map.roads[0].geometry[1] = { x: 11, y: 12 };
});
// A-ROAD-1 disconnect refusal: end on another city's port (D4 tile at
// (10,8) planted here; cardinal to city-1 at (10,13) but distance 5).
expectReject("wrong-city port end", (src) => {
  src.map.base.terrainRef[8 * W + 10] = 0xd4;
  src.map.roads[0].geometry[1] = { x: 10, y: 8 };
});
expectReject(`${MAX_ROAD_EDGES + 1} edges`, (src) => {
  src.map.roads = [];
  for (let i = 0; i <= MAX_ROAD_EDGES; i++) {
    src.map.roads.push({
      id: `road-${i}`,
      fromCityId: "city-0",
      toCityId: "city-1",
      travelKind: "land",
      geometry: [{ x: 0, y: 0 }],
    });
  }
});
expectReject(`${MAX_ROAD_POINTS + 1} total points`, (src) => {
  const geometry = [];
  for (let i = 0; i <= MAX_ROAD_POINTS; i++) {
    geometry.push({ x: i % W, y: Math.floor(i / W) % H });
  }
  src.map.roads[0].geometry = geometry;
});

tlog(`A-CAP-1: all negative controls reject; bounds edges=${MAX_ROAD_EDGES} points=${MAX_ROAD_POINTS}`);
