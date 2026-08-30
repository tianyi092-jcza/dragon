import assert from "node:assert/strict";

const SLOT_SIZE = 0x56c0;
const LEGION_BASE = 0x22c0;
const CITY_BASE = 0x8c0;

globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};

const baseline = new Uint8Array(4 * SLOT_SIZE);
const scenarios = {
  slots: [Buffer.from(new Uint8Array(SLOT_SIZE)).toString("base64")],
  save_b64: Buffer.from(baseline).toString("base64"),
};
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () =>
    String(url).endsWith("scen_raw.json") ? scenarios : { chars: {} },
});
const { initSaveAssets, serializeSlot } = await import(
  "../web/src/game/savegame.js"
);
await initSaveAssets();

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
  status: 0x80,
  _active: true,
};
const scenario = {
  factions: [
    { idx: 0, capital: 0, gold: 1000 },
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
const app = {
  scenarioIdx: 0,
  scenario,
  clock: { daysInMonth: 30, day: 1, month: 1, year: 190 },
};
const slot = serializeSlot(app, "ROUNDTRIP");

const cityOffset = CITY_BASE;
assert.equal(slot[cityOffset + 0x10], city.growth);
assert.equal(slot[cityOffset + 0x11], city.defence);
assert.equal(slot[cityOffset + 0x12], city.troops_cap);
assert.equal(slot[cityOffset + 0x13], city.troops);

const returnOffset = LEGION_BASE + 64 * 64;
assert.equal(slot[returnOffset], 0x08);
assert.equal(slot[returnOffset + 3], 47);

const legionOffset = LEGION_BASE + 126 * 64;
assert.equal(slot[legionOffset], 0x80);
assert.equal(slot[legionOffset + 1], 1);
assert.equal(slot[legionOffset + 2], 126);
assert.equal(slot[legionOffset + 4], 60);
assert.equal(slot[legionOffset + 6], 200);
assert.deepEqual(
  Array.from({ length: 6 }, (_, index) => slot[legionOffset + 0x2a + index * 4]),
  [1, 2, 3, 1, 2, 3],
);
assert.deepEqual(
  Array.from({ length: 6 }, (_, index) => slot[legionOffset + 0x29 + index * 4]),
  [10, 10, 10, 10, 10, 10],
);
assert.ok(slot.slice(LEGION_BASE + 127 * 64, LEGION_BASE + 128 * 64).every((v) => v === 0));

process.stdout.write(
  "save roundtrip OK: canonical city fields, slot 64 return, slot 126 legion\n",
);
