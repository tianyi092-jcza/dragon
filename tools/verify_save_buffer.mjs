import assert from "node:assert/strict";

globalThis.atob ??= (value) => Buffer.from(value, "base64").toString("binary");
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};

const { initSaveAssets, serializeSave } = await import(
  "../web/src/game/savegame.js"
);

const total = 4 * 0x56c0;
const baseline = new Uint8Array(total);
// selected slot的未建模字节与0x52C0..尾部事件区必须原样保留。
baseline[0x1234] = 0x5a;
baseline[0x52c0] = 0xa5;
baseline[0x56bf] = 0x7e;
const slots = Array.from({ length: 20 }, (_, index) => {
  const template = new Uint8Array(0x56c0);
  template[0x1234] = 0x40 + index;
  template[0x52c0] = 0x60 + index;
  return template;
});
const toB64 = (bytes) => Buffer.from(bytes).toString("base64");

globalThis.fetch = async (url) => ({
  ok: String(url) !== "/api/save.dat",
  status: String(url) === "/api/save.dat" ? 404 : 200,
  json: async () =>
    String(url).includes("scen_raw")
      ? { save_b64: toB64(baseline), slots: slots.map(toB64) }
      : { A: [0x41] },
});

await initSaveAssets({ allowStaticFallback: true });
const faction = { idx: 0, monarch_idx: 0, capital: 0, gold: 100, money: 100 };
const app = {
  scenarioIdx: 0,
  clock: { year: 184, month: 1, day: 1, daysInMonth: 31 },
  scenario: {
    player_faction: 0,
    trust: 100,
    tax: 18,
    factions: [faction],
    diplomacy: [[0]],
    generals: [],
    cities: [],
    legions: [],
    citiesOf: () => [],
  },
};
const first = serializeSave(app, 0, "A");
// 新游戏没有loadedSaveSlot，必须使用当前章节静态模板，不能继承目标槽旧章节。
assert.equal(first[0x1234], 0x40, "new game did not use scenario template");
assert.equal(first[0x52c0], 0x60, "new game event baseline was wrong scenario");
assert.equal(first[0x56bf], 0, "new game inherited target-slot tail");
// 从槽0读档后另存槽2，目标槽必须继承当前加载槽的未知区，而不是槽2旧底版。
app.loadedSaveSlot = 0;
app.clock.day = 2;
const copied = serializeSave(app, 1, "COPY");
assert.equal(copied[0x56c0 + 0x1234], 0x40);
assert.equal(copied[0x56c0 + 0x52c0], 0x60);
assert.equal(copied[0x56c0 + 0x56bf], 0);
app.loadedSaveSlot = null;
app.clock.day = 2;
const second = serializeSave(app, 1, "B");
assert.deepEqual(
  second.slice(0, 0x56c0),
  first.slice(0, 0x56c0),
  "Saving slot 2 reverted slot 1 to the startup baseline",
);
process.stdout.write(
  "save buffer uses scenario template for new games and loaded slot for save-as\n",
);
