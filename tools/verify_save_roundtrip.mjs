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
const templateSlots = Array.from(
  { length: 20 },
  () => new Uint8Array(SLOT_SIZE),
);
// 活动军团槽继承底版未知字节，但已建模标识/目标字段必须由运行态覆盖或清除。
templateSlots[4][LEGION_BASE + 126 * 64 + 0x08] = 0x5a;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x09] = 0xa5;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x0a] = 4;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x0b] = 1;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x0c] = 0x30;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x0d] = 0x20;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x0e] = 0x10;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x0f] = 0x08;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x14] = 0x34;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x15] = 0x12;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x16] = 0x41;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x18] = 0x2d;
templateSlots[4][LEGION_BASE + 126 * 64 + 0x20] = 7;
const scenarios = {
  slots: templateSlots.map((slot) => Buffer.from(slot).toString("base64")),
  save_b64: Buffer.from(baseline).toString("base64"),
};
globalThis.fetch = async (url) => {
  if (String(url).endsWith("road_graph.json")) {
    let data;
    try {
      data = await fs.readFile(
        new URL("../web/road_graph.json", import.meta.url),
        "utf8",
      );
    } catch (error) {
      throw new Error(`cannot read road graph fixture: ${error.message}`, {
        cause: error,
      });
    }
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      throw new Error(`cannot parse road graph fixture: ${error.message}`, {
        cause: error,
      });
    }
    return { ok: true, status: 200, json: async () => parsed };
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
  captive_flag: idx === 1 ? 7 : 0xff,
  origFaction: idx === 1 ? null : undefined,
}));
const city = {
  idx: 0,
  faction: 0,
  governor: 5,
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
  _markerFrame: 3,
  marker_base: 0x23,
  _retreat: { cityIdx: 7, nodeId: 0x1234 },
  _engagement: { kind: "siege", countdown: 7, target: { cityIdx: 0 } },
  engagementCountdown: 7,
  _active: true,
};
const scenario = {
  conscription: [1000, 500, 300],
  next_tax: 27,
  next_conscription: [1200, 340, 50],
  factions: [
    {
      idx: 0,
      attr: 0x80,
      active: true,
      capital: 0,
      gold: 0x123456,
      reserve_cav: 0x1234,
      reserve_arc: 0x2345,
      reserve_inf: 0x3456,
      target_faction: 1,
      brokeMonths: 2,
      deficitScolded: true,
    },
    { idx: 1, attr: 0x80, active: true, capital: null, gold: 1000 },
  ],
  cities: [city],
  generals,
  legions: [legion],
  delayedLegionReturns: [
    { leader: "將64", generalIdx: 64, faction: 0, countdown: 47 },
  ],
  _appeared: new Set([12, 34]),
  player_advisor: {
    custom: true,
    general_idx: null,
    name: "測試軍師",
    hao: "別號",
    portrait: 7,
  },
  pendingRecruits: [{ city: 0, n: 100 }],
  pendingTruceNegotiations: [{ targetFactionIdx: 1, daysLeft: 2 }],
  pendingAssistanceNegotiations: [{ allyFactionIdx: 1, daysLeft: 3 }],
  envoys: { 1: { name: "將5", left: 4 } },
  prisoners: [{ leader: "將6", faction: 0, months: 1 }],
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
  scenarioIdx: 4,
  loadedSaveSlot: null,
  scenario,
  originalRng,
  clock: { daysInMonth: 30, day: 1, month: 1, year: 190, sub: 6, hour: 17 },
};
const originalSlot = legion.slot;
const originalStatus = legion.status;
const originalTroops = legion.troops;
const slot = serializeSlot(app, "ROUNDTRIP");
assert.equal(
  legion.slot,
  originalSlot,
  "staging must not mutate live legion slot",
);
assert.equal(
  legion.status,
  originalStatus,
  "staging must not mutate live status",
);
assert.equal(
  legion.troops,
  originalTroops,
  "staging must not mutate live troops",
);

// 槽头章节号必须使用data.json的20章全局索引；税率/征兵按已证头部字段写回。
assert.equal(slot[0x02], 6);
assert.equal(slot[0x03], 17);
assert.equal(slot[0x11], 4);
assert.deepEqual(Array.from(slot.slice(0x1a, 0x20)), [100, 0, 50, 0, 30, 0]);
assert.equal(slot[0x20], 27);
assert.deepEqual(Array.from(slot.slice(0x22, 0x28)), [120, 0, 34, 0, 5, 0]);

// KI.EXE势力资金为word@+0x20 + byte@+0x22<<16，不能截成u16。
assert.equal(slot[0x80 + 0x20], 0x56);
assert.equal(slot[0x80 + 0x21], 0x34);
assert.equal(slot[0x80 + 0x22], 0x12);
assert.deepEqual(
  Array.from(slot.slice(0x80 + 4, 0x80 + 10)),
  [0x34, 0x12, 0x45, 0x23, 0x56, 0x34],
);
assert.equal(slot[0x80 + 0x19], 1);

const cityOffset = CITY_BASE;
assert.equal(slot[cityOffset + 0x10], city.growth);
assert.equal(slot[cityOffset + 0x11], city.defence);
assert.equal(slot[cityOffset + 0x12], city.troops_cap);
assert.equal(slot[cityOffset + 0x13], city.troops);
assert.equal(slot[cityOffset + 0x19], city.governor);

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
assert.equal(slot[legionOffset + 0x08], 3);
assert.equal(slot[legionOffset + 0x09], 0x23);
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
generals[0].attr = 0x80;
generals[0].active = false;
generals[0].talk_idx = 9;
generals[0].faction = null;
generals[0].origFaction = null;
const nullFactionSlot = serializeSlot(app, "NULL");
assert.equal(nullFactionSlot[generalOffset] & 0x80, 0);
assert.equal(nullFactionSlot[generalOffset + 0x1c], 0xff);
assert.equal(nullFactionSlot[generalOffset + 0x1d], 0xff);
assert.equal(nullFactionSlot[generalOffset + 0x1e], 9);
assert.equal(
  nullFactionSlot[generalOffset + 32 + 0x1d],
  7,
  "DOS parse field captive_flag must survive when origFaction is absent",
);

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
  commandSlot[commandOffset + 0x14] | (commandSlot[commandOffset + 0x15] << 8),
  roadNodeAt(257, 9).id,
);
assert.equal(commandSlot[commandOffset + 0x20], 0);
scenario.legions = originalLegions;

// 已取消命令必须显式清掉底版中的旧目标/道路字段，否则Python parse会复活旧命令。
const idleLegion = { ...legion, status: 0x80, commandState: 0 };
for (const key of [
  "target",
  "targetNode",
  "roadStride",
  "roadPointAddress",
  "roadEdgeOrNode",
  "_retreat",
  "_engagement",
  "engagementCountdown",
]) {
  delete idleLegion[key];
}
scenario.legions = [idleLegion];
const idleSlot = serializeSlot(app, "IDLE");
assert.equal(idleSlot[legionOffset + 0x0a], 0);
assert.equal(idleSlot[legionOffset + 0x0b], 0);
assert.ok(
  idleSlot
    .slice(legionOffset + 0x0c, legionOffset + 0x10)
    .every((v) => v === 0),
);
assert.ok(
  idleSlot
    .slice(legionOffset + 0x14, legionOffset + 0x1a)
    .every((v) => v === 0),
);
assert.equal(idleSlot[legionOffset + 0x20], 0xff);
assert.equal(idleSlot[legionOffset + 0x23], 0);
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
const liveDelegationBefore = {
  status: legion.status,
  delegated: legion.delegated,
  synced: legion._delegationSynced,
};
const snapshot = snapshotState(app, 0, "RNG");
scenario.citiesOf = citiesOf;
assert.deepEqual(
  {
    status: legion.status,
    delegated: legion.delegated,
    synced: legion._delegationSynced,
  },
  liveDelegationBefore,
  "snapshot staging must not normalize the live legion before HTTP commit",
);
assert.deepEqual(snapshot.webMeta.originalRng, originalRng.snapshot());
assert.equal(snapshot.state.save_sub, 6);
assert.equal(snapshot.state.save_hour, 17);
assert.equal(snapshot.webMeta.schema, 2);
assert.deepEqual(snapshot.webMeta.appearedGeneralIds, [12, 34]);
assert.equal(Object.hasOwn(snapshot.state, "_appeared"), false);
assert.deepEqual(
  snapshot.webMeta.scenarioRuntimeState.player_advisor,
  scenario.player_advisor,
);
assert.deepEqual(
  snapshot.webMeta.scenarioRuntimeState.pendingRecruits,
  scenario.pendingRecruits,
);
assert.deepEqual(snapshot.webMeta.scenarioRuntimeState.envoys, scenario.envoys);
assert.equal(
  snapshot.webMeta.scenarioRuntimeState.factionRuleState[0].brokeMonths,
  2,
);
assert.deepEqual(snapshot.state.legions[0]._engagement, legion._engagement);
assert.deepEqual(snapshot.webMeta.legionRuleState, [
  {
    slot: 126,
    _retreat: legion._retreat,
    _engagement: legion._engagement,
    engagementCountdown: 6,
  },
]);
let packet;
try {
  packet = JSON.parse(
    Buffer.from(encodeWebSaveMeta(0, snapshot.webMeta), "base64").toString(
      "utf8",
    ),
  );
} catch (error) {
  throw new Error(`cannot decode Web SAVE metadata fixture: ${error.message}`, {
    cause: error,
  });
}
assert.equal(packet.slot, 0);
assert.deepEqual(packet.webMeta.originalRng, originalRng.snapshot());
const binaryOnlyState = structuredClone(snapshot.state);
delete binaryOnlyState.legions[0]._retreat;
delete binaryOnlyState.legions[0]._engagement;
delete binaryOnlyState.legions[0].engagementCountdown;
delete binaryOnlyState.player_advisor;
delete binaryOnlyState.pendingRecruits;
delete binaryOnlyState.envoys;
delete binaryOnlyState.factions[0].brokeMonths;
delete binaryOnlyState.factions[0].deficitScolded;
applyWebMetaToState(binaryOnlyState, packet.webMeta);
assert.deepEqual([...binaryOnlyState._appeared], [12, 34]);
assert.deepEqual(binaryOnlyState.player_advisor, scenario.player_advisor);
assert.deepEqual(binaryOnlyState.pendingRecruits, scenario.pendingRecruits);
assert.deepEqual(binaryOnlyState.envoys, scenario.envoys);
assert.equal(binaryOnlyState.factions[0].brokeMonths, 2);
assert.equal(binaryOnlyState.factions[0].deficitScolded, true);
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
