import assert from "node:assert/strict";
import fs from "node:fs/promises";

const SLOT_SIZE = 0x56c0;
const LEGION_BASE = 0x22c0;
const CITY_BASE = 0x8c0;

globalThis.Image = class {
  /** @param {string} _value */
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};

const baseline = new Uint8Array(4 * SLOT_SIZE);
const scenarios = {
  slots: [Buffer.from(new Uint8Array(SLOT_SIZE)).toString("base64")],
  save_b64: Buffer.from(baseline).toString("base64"),
};
globalThis.fetch = async (url) => {
  if (String(url).endsWith("road_graph.json")) {
    const data = await fs.readFile(
      new URL("../web/road_graph.json", import.meta.url),
      "utf8",
    );
    return { ok: true, status: 200, json: async () => JSON.parse(data) };
  }
  return {
    ok: String(url) !== "/api/save.dat",
    status: String(url) === "/api/save.dat" ? 404 : 200,
    json: async () =>
      String(url).endsWith("scen_raw.json") ? scenarios : { chars: {} },
  };
};
const {
  applyWebMetaToState,
  encodeWebSaveMeta,
  initSaveAssets,
  serializeSlot,
  snapshotState,
} = await import("../web/src/game/savegame.js");
const { loadRoadGraph, roadNodeAt } = await import(
  "../web/src/game/roadgraph.js"
);
await loadRoadGraph();
const { GameBar } = await import("../web/src/ui/gamebar.js");
const { OriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);
await initSaveAssets({ allowStaticFallback: true });

const generals = Array.from({ length: 128 }, (_, idx) => ({
  idx,
  name: `將${idx}`,
  faction: idx === 126 ? 1 : 0,
  status: 1,
  active: true,
}));
const city = {
  idx: 0,
  faction: 0,
  x: 257,
  y: 9,
  prod: 1234,
  growth: 111,
  defence: 112,
  troops_cap: 113,
  troops: 114,
};
const legion = {
  slot: 126,
  leader: "將126",
  faction: 1,
  x: 257,
  y: 9,
  troops: 60,
  morale: 200,
  units: [1, 2, 3, 1, 2, 3].map((type) => ({ type, troops: 100 })),
  delegated: true, // 旧Web metadata无status时必须同步到原版status bit2。
  roadStride: 4,
  roadPointAddress: 0x2030,
  roadEdgeOrNode: 0x0810,
  targetNode: 0x1234,
  target: { idx: 7, x: 321, y: 45 },
  commandState: 10,
  _retreat: { cityIdx: 7, nodeId: 0x1234 },
  _engagement: { kind: "siege", countdown: 7, target: { cityIdx: 0 } },
  engagementCountdown: 7,
  _active: true,
};
const scenario = {
  factions: [
    { idx: 0, capital: 0, gold: 0x123456 },
    { idx: 1, capital: null, gold: 1000 },
  ],
  cities: [city],
  generals,
  legions: [legion],
  delayedLegionReturns: [
    { leader: "將64", generalIdx: 64, faction: 0, countdown: 47 },
  ],
  diplomacy: [
    [255, 0],
    [0, 255],
  ],
  citiesOf(faction) {
    return this.cities.filter((candidate) => candidate.faction === faction);
  },
};
const originalRng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
originalRng.nextByte();
const app = {
  scenarioIdx: 0,
  scenario,
  originalRng,
  clock: { daysInMonth: 30, day: 1, month: 1, year: 190 },
};
const slot = serializeSlot(app, "ROUNDTRIP");

// KI.EXE势力资金为word@+0x20 + byte@+0x22<<16，不能截成u16。
assert.equal(slot[0x80 + 0x20], 0x56);
assert.equal(slot[0x80 + 0x21], 0x34);
assert.equal(slot[0x80 + 0x22], 0x12);

const cityOffset = CITY_BASE;
assert.equal(slot[cityOffset + 0x10], city.growth);
assert.equal(slot[cityOffset + 0x11], city.defence);
assert.equal(slot[cityOffset + 0x12], city.troops_cap);
assert.equal(slot[cityOffset + 0x13], city.troops);

const returnOffset = LEGION_BASE + 64 * 64;
assert.equal(slot[returnOffset], 0x08);
assert.equal(slot[returnOffset + 2], 64);
assert.equal(slot[returnOffset + 3], 47);

const legionOffset = LEGION_BASE + 126 * 64;
assert.equal(slot[legionOffset], 0xa4);
assert.equal(slot[legionOffset] & 0x04, 0x04);
assert.equal(slot[legionOffset] & 0x20, 0x20);
assert.equal(slot[legionOffset + 0x03], 7);
assert.equal(slot[legionOffset + 1], 1);
assert.equal(slot[legionOffset + 2], 126);
assert.equal(
  slot[legionOffset + 3],
  7,
  "+3 countdown coexists with non-monarch leader byte at +2",
);
assert.equal(slot[legionOffset + 4], 60);
assert.equal(slot[legionOffset + 6], 200);
assert.equal(slot[legionOffset + 0x0a], 4);
assert.equal(slot[legionOffset + 0x0b], 1);
assert.equal(slot[legionOffset + 0x0c], 0x30);
assert.equal(slot[legionOffset + 0x0d], 0x20);
assert.equal(slot[legionOffset + 0x0e], 0x10);
assert.equal(slot[legionOffset + 0x0f], 0x08);
assert.equal(slot[legionOffset + 0x14], 0x34);
assert.equal(slot[legionOffset + 0x15], 0x12);
assert.equal(slot[legionOffset + 0x16], city.x & 0xff);
assert.equal(slot[legionOffset + 0x17], city.x >> 8);
assert.equal(slot[legionOffset + 0x18], city.y & 0xff);
assert.equal(slot[legionOffset + 0x19], city.y >> 8);
assert.equal(slot[legionOffset + 0x20], 0);
assert.equal(slot[legionOffset + 0x23], 10);
assert.deepEqual(
  Array.from(
    { length: 6 },
    (_, index) => slot[legionOffset + 0x2a + index * 4],
  ),
  [1, 2, 3, 1, 2, 3],
);
assert.deepEqual(
  Array.from(
    { length: 6 },
    (_, index) => slot[legionOffset + 0x29 + index * 4],
  ),
  [10, 10, 10, 10, 10, 10],
);
assert.ok(
  slot
    .slice(LEGION_BASE + 127 * 64, LEGION_BASE + 128 * 64)
    .every((v) => v === 0),
);
const generalOffset = 0x42c0;
generals[0].faction = null;
generals[0].origFaction = null;
const nullFactionSlot = serializeSlot(app, "NULL");
assert.equal(nullFactionSlot[generalOffset + 0x1c], 0xff);
assert.equal(nullFactionSlot[generalOffset + 0x1d], 0xff);

// 生产命令→road node→SAVE字段，不接受测试手填targetNode。
const orderCity = { idx: 0, x: 257, y: 9, name: "命令城" };
const orderLegion = { status: 0x80, cooldown: 0 };
GameBar.prototype.assignMarchOrder.call(
  {
    legionAcceptsMarchOrder: GameBar.prototype.legionAcceptsMarchOrder,
    app: { hud: { flashEvent() {} } },
  },
  orderLegion,
  orderCity,
  true,
);
assert.equal(orderLegion.targetNode, roadNodeAt(257, 9).id);
const originalLegions = scenario.legions;
scenario.legions = [{ ...legion, ...orderLegion, slot: 125, leader: "將125" }];
const commandSlot = serializeSlot(app, "ORDER");
const commandOffset = LEGION_BASE + 125 * 64;
assert.equal(
  commandSlot[commandOffset + 0x14] |
    (commandSlot[commandOffset + 0x15] << 8),
  roadNodeAt(257, 9).id,
);
assert.equal(commandSlot[commandOffset + 0x20], 0);
scenario.legions = originalLegions;

// JSON快照独立验证field等待态也原样保留；二进制fixture上面验证siege字段。
legion._engagement = {
  kind: "field",
  countdown: 6,
  target: { x: 255, y: 9, faction: 0 },
};
legion.engagementCountdown = 6;
const citiesOf = scenario.citiesOf;
delete scenario.citiesOf;
const snapshot = snapshotState(app, 0, "RNG");
scenario.citiesOf = citiesOf;
assert.deepEqual(snapshot.webMeta.originalRng, originalRng.snapshot());
assert.equal(snapshot.webMeta.schema, 2);
assert.deepEqual(snapshot.state.legions[0]._engagement, legion._engagement);
assert.deepEqual(snapshot.webMeta.legionRuleState, [
  {
    slot: 126,
    _retreat: legion._retreat,
    _engagement: legion._engagement,
    engagementCountdown: 6,
  },
]);
const packet = JSON.parse(
  Buffer.from(encodeWebSaveMeta(0, snapshot.webMeta), "base64").toString("utf8"),
);
assert.equal(packet.slot, 0);
assert.deepEqual(packet.webMeta.originalRng, originalRng.snapshot());
const binaryOnlyState = structuredClone(snapshot.state);
delete binaryOnlyState.legions[0]._retreat;
delete binaryOnlyState.legions[0]._engagement;
delete binaryOnlyState.legions[0].engagementCountdown;
applyWebMetaToState(binaryOnlyState, packet.webMeta);
assert.deepEqual(binaryOnlyState.legions[0]._retreat, legion._retreat);
assert.deepEqual(binaryOnlyState.legions[0]._engagement, legion._engagement);
assert.equal(snapshot.state.legions[0].engagementCountdown, 6);
const persistedRetreat = structuredClone(legion._retreat);
legion._engagement = null;
legion.engagementCountdown = null;
delete scenario.citiesOf;
const retreatSnapshot = snapshotState(app, 0, "RETREAT");
scenario.citiesOf = citiesOf;
assert.deepEqual(
  retreatSnapshot.webMeta.legionRuleState[0]._retreat,
  persistedRetreat,
);
const restoredRng = new OriginalBattleRng().restore(
  snapshot.webMeta.originalRng,
);
assert.equal(restoredRng.nextByte(), originalRng.nextByte());

process.stdout.write(
  "save roundtrip OK: retreat fields + delayed slot + null factions + RNG metadata\n",
);
