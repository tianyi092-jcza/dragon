import assert from "node:assert/strict";
import fs from "node:fs/promises";

globalThis.window = {};
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
globalThis.performance = { now: () => 0 };
globalThis.Image = class {};
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
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

const { GameBar } = await import("../web/src/ui/gamebar.js");
const { loadRoadGraph, roadNodeAt } = await import(
  "../web/src/game/roadgraph.js"
);
await loadRoadGraph();
const clock = { hold: false };
const view = {
  selectedCity: null,
  draw() {},
  cityPixel: (city) => [city.x * 16, city.y * 16],
  sx: (x) => x,
  sy: (y) => y,
};
const notices = [];
const app = {
  clock,
  view,
  hud: {
    dialogCount: 0,
    flashEvent(message) {
      notices.push(message);
    },
    resolveAdvice() {},
  },
  scenario: { player_faction: 0, factions: [{ idx: 0 }], cities: [], legions: [] },
};
const bar = new GameBar(app);
bar._assets.catch(() => {});
bar.layout = () => {
  bar.bx = 0;
  bar.panels = [];
};
bar.bx = 0;

// 羽扇在行军指示子层仍是最高优先级唯一开关。
bar.submenuOpen = true;
bar.selectedSubmenu = 4;
bar.marchingOrder = { legion: {}, step: "pick_target", targetCity: null };
bar.orderChoiceMenu = { items: [], ox: 0, oy: 0, wTiles: 1, hTiles: 1 };
view.selectedCity = { idx: 1 };
bar.syncClock();
assert.equal(clock.hold, true);
assert.equal(bar.click(340, 10, 0), true);
assert.equal(bar.submenuOpen, false);
assert.equal(bar.selectedSubmenu, null);
assert.equal(bar.marchingOrder, null);
assert.equal(bar.orderChoiceMenu, null);
assert.equal(view.selectedCity, null);
assert.equal(clock.hold, false);

// 右键从目标选择直接回菜单条展开/八项未选中，不重开军团列表。
bar.submenuOpen = true;
bar.selectedSubmenu = 4;
bar.marchingOrder = { legion: {}, step: "pick_target", targetCity: null };
bar.listDialog = null;
bar.syncClock();
assert.equal(bar.click(700, 400, 2), true);
assert.equal(bar.submenuOpen, true);
assert.equal(bar.selectedSubmenu, null);
assert.equal(bar.marchingOrder, null);
assert.equal(bar.listDialog, null);
assert.equal(clock.hold, false);

// 任一子菜单（包括行军目标选择）地图绝对锁定。
bar.selectedSubmenu = 4;
bar.marchingOrder = { legion: {}, step: "pick_target", targetCity: null };
assert.equal(bar.hitTest(700, 400), true);
bar.marchingOrder = null;
bar.selectedSubmenu = null;

// 生产下令必须写准确道路节点，再由SAVE序列化使用。
const city = { idx: 9, x: 257, y: 9, name: "目標" };
const legion = { status: 0x80 };
bar.assignMarchOrder(legion, city, true);
assert.equal(legion.target, city);
assert.equal(legion.targetNode, roadNodeAt(city.x, city.y).id);
assert.equal(legion.status & 0x04, 0x04);

// 强制撤退/接敌等待是权威规则态：列表入口与direct assign都必须拒绝并提示。
const retreating = {
  leader: "退軍",
  status: 0x80,
  target: { idx: 1 },
  targetNode: 123,
  _retreat: { cityIdx: 1 },
};
const oldRetreatTarget = retreating.target;
assert.equal(bar.assignMarchOrder(retreating, city, false), false);
assert.equal(retreating.target, oldRetreatTarget);
assert.equal(retreating.targetNode, 123);
assert.match(notices.at(-1), /撤退中/);
const engaged = { leader: "戰軍", status: 0xa0, _engagement: { kind: "field" } };
assert.equal(bar.assignMarchOrder(engaged, city, true), false);
assert.equal(engaged.target, undefined);
assert.match(notices.at(-1), /交戰中/);
// 真实列表onPick入口也必须保持列表，不进入目标选择，并明确提示。
const rowSource = {
  idx: 0,
  faction: 0,
  name: "本城",
  x: 0,
  y: 0,
  type: 1,
  prod: 1,
};
app.scenario.cities = [rowSource];
app.scenario.legions = [{ ...retreating, faction: 0, x: 0, y: 0, units: [] }];
bar.showLegionCard(rowSource);
bar.listDialog.onPick(0);
assert.equal(bar.marchingOrder, null);
assert.ok(bar.listDialog);
assert.match(notices.at(-1), /撤退中/);
bar.closeListDialog(true);

// 四相过渡与onDay待补日历期间，系统保存入口不可打开。
app.engageTransition = { active: true };
bar.settingsOpen = true;
assert.equal(bar.openSystemSaveDialog(), false);
assert.equal(bar.systemSaveDialog, null);
assert.equal(bar.settingsOpen, true);
assert.match(notices.at(-1), /無法存檔/);
app.engageTransition = null;
clock._pendingDayAdvance = true;
assert.equal(bar.openSystemSaveDialog(), false);
clock._pendingDayAdvance = false;
assert.equal(bar.openSystemSaveDialog(), true);
assert.ok(bar.systemSaveDialog);

process.stdout.write(
  "advisor delegation UI OK: fan/right-click/map lock + order guards + save transition guard\n",
);
