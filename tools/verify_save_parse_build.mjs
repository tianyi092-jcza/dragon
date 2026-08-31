import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

globalThis.window = {};
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};
globalThis.fetch = async (url) => {
  const data = await fs.readFile(new URL(`../web/${url}`, import.meta.url));
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    json: async () => JSON.parse(data.toString("utf8")),
  };
};

const output = join(tmpdir(), `dragon-save-parse-${process.pid}.json`);
const python = spawnSync(
  "python",
  [
    "-c",
    [
      "import json, sys",
      "sys.path.insert(0, 'tools')",
      "from parse_save import SLOT_SIZE, LEGION_BASE, parse_legions",
      "slot=bytearray(SLOT_SIZE); r=LEGION_BASE+7*64",
      "slot[r]=0xA4; slot[r+1]=0; slot[r+2]=7; slot[r+3]=7; slot[r+6]=200; slot[r+0x0B]=1",
      "slot[r+0x10:r+0x12]=(257).to_bytes(2,'little'); slot[r+0x12:r+0x14]=(9).to_bytes(2,'little')",
      "slot[r+0x14:r+0x16]=(2).to_bytes(2,'little'); slot[r+0x16:r+0x18]=(246).to_bytes(2,'little'); slot[r+0x18:r+0x1A]=(15).to_bytes(2,'little'); slot[r+0x20]=1",
      "[(slot.__setitem__(r+0x29+i*4,10),slot.__setitem__(r+0x2A+i*4,(i%3)+1)) for i in range(6)]",
      "json.dump(parse_legions(bytes(slot),2)[0],open(sys.argv[1],'w',encoding='utf8'),ensure_ascii=False)",
    ].join(";"),
    output,
  ],
  { cwd: new URL("..", import.meta.url), encoding: "utf8" },
);
assert.equal(python.status, 0, python.stderr);
const legions = JSON.parse(await fs.readFile(output, "utf8"));
await fs.unlink(output);

const { loadRoadGraph } = await import("../web/src/game/roadgraph.js");
await loadRoadGraph();
const { buildArmies } = await import("../web/src/game/ai.js");
const cities = [
  { idx: 0, name: "甲", faction: 0, x: 257, y: 9 },
  { idx: 1, name: "乙", faction: 1, x: 246, y: 15 },
];
legions.push({
  leader: "敵",
  faction: 1,
  x: 255,
  y: 9,
  troops: 60,
  morale: 200,
  units: Array.from({ length: 6 }, () => ({ type: 1, troops: 100 })),
  status: 0x80,
  _active: true,
});
const scenario = {
  cities,
  factions: [
    { idx: 0, capital: 0, monarch: "將7" },
    { idx: 1, capital: 1, monarch: "敵" },
  ],
  generals: Array.from({ length: 8 }, (_, idx) => ({ idx, name: `將${idx}` })),
  legions,
  diplomacy: [
    [0xff, 0],
    [0, 0xff],
  ],
};
buildArmies(scenario);
const restored = scenario.legions[0];
assert.equal(restored.target, cities[1]);
assert.equal(restored.targetNode, 2);
assert.deepEqual(restored._engagement, {
  kind: "pending",
  countdown: 7,
  target: { cityIdx: 1, x: 246, y: 15 },
});
assert.equal(restored.status & 0x20, 0x20);
assert.equal(restored.engagementCountdown, 7);

// targetCity无效时也必须保留+0x16/+0x18坐标；build只保留pending，
// 首次实际tick才按保存道路上下文执行0x2831/0x2880重检。
const invalidOutput = join(tmpdir(), `dragon-save-invalid-${process.pid}.json`);
const invalidPython = spawnSync(
  "python",
  [
    "-c",
    [
      "import json, sys",
      "sys.path.insert(0, 'tools')",
      "from parse_save import SLOT_SIZE, LEGION_BASE, parse_legions",
      "slot=bytearray(SLOT_SIZE); r=LEGION_BASE+7*64",
      "slot[r]=0xA4; slot[r+1]=0; slot[r+2]=7; slot[r+3]=5; slot[r+6]=200; slot[r+0x0B]=1",
      "slot[r+0x10:r+0x12]=(257).to_bytes(2,'little'); slot[r+0x12:r+0x14]=(9).to_bytes(2,'little')",
      "slot[r+0x16:r+0x18]=(246).to_bytes(2,'little'); slot[r+0x18:r+0x1A]=(15).to_bytes(2,'little'); slot[r+0x20]=0xFF",
      "[(slot.__setitem__(r+0x29+i*4,10),slot.__setitem__(r+0x2A+i*4,(i%3)+1)) for i in range(6)]",
      "json.dump(parse_legions(bytes(slot),2)[0],open(sys.argv[1],'w',encoding='utf8'),ensure_ascii=False)",
    ].join(";"),
    invalidOutput,
  ],
  { cwd: new URL("..", import.meta.url), encoding: "utf8" },
);
assert.equal(invalidPython.status, 0, invalidPython.stderr);
const invalidLegions = JSON.parse(await fs.readFile(invalidOutput, "utf8"));
await fs.unlink(invalidOutput);
assert.equal(invalidLegions[0].target, null);
assert.deepEqual(invalidLegions[0]._engagement.target, {
  cityIdx: null,
  x: 246,
  y: 15,
});
invalidLegions.push({
  leader: "敵",
  faction: 1,
  x: 255,
  y: 9,
  troops: 60,
  morale: 200,
  units: Array.from({ length: 6 }, () => ({ type: 1, troops: 100 })),
  status: 0x80,
  _active: true,
});
const invalidScenario = { ...scenario, legions: invalidLegions };
buildArmies(invalidScenario);
assert.deepEqual(invalidScenario.legions[0]._engagement, {
  kind: "pending",
  countdown: 5,
  target: { cityIdx: null, x: 246, y: 15 },
});

// 旧 Web synthetic/recreation 军团可能只有总兵。buildArmies与SAVE
// fallback必须共享六队补全；二进制经Python parse后fresh build仍为活动军团。
const { createDefaultLegionUnits } = await import(
  "../web/src/game/legionunits.js"
);
assert.deepEqual(
  createDefaultLegionUnits(601).map((unit) => unit.troops),
  [1000, 1000, 1000, 1000, 1000, 1000],
  "six-team cap keeps the maximum representable 600 strategic troops",
);
const { initSaveAssets, serializeSlot } = await import(
  "../web/src/game/savegame.js"
);
await initSaveAssets({ allowStaticFallback: true });
const unitlessScenario = {
  cities: [{ idx: 0, name: "甲", faction: 0, x: 257, y: 9 }],
  factions: [
    {
      idx: 0,
      capital: 0,
      monarch: "將7",
      monarch_idx: 7,
      n_cities: 256,
    },
  ],
  generals: Array.from({ length: 8 }, (_, idx) => ({
    idx,
    name: `將${idx}`,
    faction: 0,
    active: true,
  })),
  diplomacy: [[0xff]],
  legions: [
    {
      leader: "將7",
      faction: 0,
      x: 257,
      y: 9,
      troops: 257,
      morale: 200,
      status: 0x80,
      _active: true,
    },
  ],
  citiesOf(idx) {
    return this.cities.filter((city) => city.faction === idx);
  },
};
buildArmies(unitlessScenario);
const built = unitlessScenario.legions[0];
assert.equal(built.units.length, 6);
assert.ok(built.units.every((unit) => Number.isFinite(unit.troops)));
assert.equal(
  built.units.reduce((sum, unit) => sum + unit.troops / 10, 0),
  257,
);
// 再删除六队，直接命中serializeSlot防御层，确保保存路径本身不依赖先调用build。
delete built.units;
const app = {
  scenarioIdx: 0,
  scenario: unitlessScenario,
  clock: { year: 190, month: 1, day: 1, daysInMonth: 31 },
};
const binary = serializeSlot(app, "UNITLESS");
const binaryPath = join(tmpdir(), `dragon-unitless-${process.pid}.dat`);
const parsedPath = join(tmpdir(), `dragon-unitless-${process.pid}.json`);
await fs.writeFile(binaryPath, binary);
const roundtripPython = spawnSync(
  "python",
  [
    "-c",
    [
      "import json,sys",
      "sys.path.insert(0,'tools')",
      "from parse_save import parse_legions",
      "data=open(sys.argv[1],'rb').read()",
      "json.dump(parse_legions(data,2)[0],open(sys.argv[2],'w',encoding='utf8'))",
    ].join(";"),
    binaryPath,
    parsedPath,
  ],
  { cwd: new URL("..", import.meta.url), encoding: "utf8" },
);
assert.equal(roundtripPython.status, 0, roundtripPython.stderr);
const parsedUnitless = JSON.parse(await fs.readFile(parsedPath, "utf8"));
await Promise.all([fs.unlink(binaryPath), fs.unlink(parsedPath)]);
assert.equal(parsedUnitless.length, 1);
const freshScenario = { ...unitlessScenario, legions: parsedUnitless };
buildArmies(freshScenario);
const fresh = freshScenario.legions[0];
assert.equal(fresh.units.length, 6);
assert.ok(fresh.units.every((unit) => Number.isFinite(unit.troops)));
assert.equal(fresh.troops, 257);
assert.equal(
  fresh.units.reduce((sum, unit) => sum + unit.troops / 10, 0),
  257,
);

// 0x2977延迟回归期满后，AI补充路径重建的军团也必须当场拥有六队。
const delayedScenario = {
  player_faction: 0,
  cities: [
    { idx: 0, name: "甲", faction: 0, x: 257, y: 9 },
    { idx: 1, name: "乙", faction: 1, x: 246, y: 15 },
  ],
  factions: [
    { idx: 0, capital: 0, monarch: "玩家", n_cities: 1 },
    { idx: 1, capital: 1, monarch: "歸將", monarch_idx: 1, n_cities: 1 },
  ],
  generals: [
    { idx: 0, name: "玩家", faction: 0, status: 0 },
    { idx: 1, name: "歸將", faction: 1, status: 0 },
  ],
  legions: [],
  delayedLegionReturns: [
    { slot: 1, leader: "歸將", generalIdx: 1, faction: 1, countdown: 1 },
  ],
  diplomacy: [
    [0xff, 0],
    [0, 0xff],
  ],
  citiesOf(idx) {
    return this.cities.filter((city) => city.faction === idx);
  },
};
const { aiTick } = await import("../web/src/game/ai.js");
aiTick({
  scenario: delayedScenario,
  battleView: { active: false },
  engageTransition: null,
  hud: { flashEvent() {}, buildLegend() {} },
  view: { draw() {} },
});
const returned = delayedScenario.legions.find((legion) => legion.faction === 1);
assert.ok(returned);
assert.equal(returned.units.length, 6);
assert.ok(returned.units.every((unit) => Number.isFinite(unit.troops)));
assert.equal(
  returned.units.reduce((sum, unit) => sum + unit.troops / 10, 0),
  returned.troops,
);

process.stdout.write(
  "save parse-build OK: pending rebuild + unitless build/save/parse/fresh-build keeps six teams\n",
);
