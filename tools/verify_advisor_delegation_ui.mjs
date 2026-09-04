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
    json: async () => {
      try {
        return JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid JSON fixture ${url}`, { cause: error });
      }
    },
  };
};

const { GameBar } = await import("../web/src/ui/gamebar.js");
const { loadRoadGraph, roadNodeAt } = await import(
  "../web/src/game/roadgraph.js"
);
await loadRoadGraph();
let now = 0;
globalThis.performance = { now: () => now };
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
  scenario: {
    player_faction: 0,
    factions: [{ idx: 0 }],
    cities: [],
    legions: [],
  },
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

// 仅地图鼠标活动暂停；满一秒后恢复。菜单/模态的冻结优先级仍高于鼠标静止。
bar.pokeClock();
assert.equal(clock.hold, true);
now = 999;
bar.syncClock();
assert.equal(clock.hold, true);
now = 1000;
bar.syncClock();
assert.equal(clock.hold, false);
bar.selectedSubmenu = 4;
bar.pokeClock();
now = 3000;
bar.syncClock();
assert.equal(clock.hold, true);
bar.selectedSubmenu = null;

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

// 空据点点击后的命令菜单必须在hover路径优先命中，三项/空白/外部均可更新。
bar.orderChoiceMenu = {
  items: ["戰鬥指揮", "委　　任", "解　　體"],
  ox: 100,
  oy: 100,
  wTiles: 7,
  hTiles: 5,
  hover: -1,
};
assert.equal(bar.hover(120, 112), true);
assert.equal(bar.orderChoiceMenu.hover, 0);
assert.equal(bar.hover(120, 136), true);
assert.equal(bar.orderChoiceMenu.hover, 1);
assert.equal(bar.hover(120, 164), true);
assert.equal(bar.orderChoiceMenu.hover, 2);
assert.equal(bar.hover(102, 102), true);
assert.equal(bar.orderChoiceMenu.hover, -1);
assert.equal(bar.hover(20, 20), false);
bar.orderChoiceMenu = null;

// 普通行军目标不能触发闪动；只有显式战斗位置进入队列，1500ms后清理。
now = 0;
app.scenario.legions = [{ target: { idx: 9 }, x: 1, y: 2 }];
assert.equal(bar.blinkTargets().size, 0);
bar.addMiniBattleFlash({ x: 12, y: 34 });
assert.deepEqual([...bar.blinkTargets()], ["field:12:34"]);
now = 1501;
assert.equal(bar.blinkTargets().size, 0);

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
const engaged = {
  leader: "戰軍",
  status: 0xa0,
  _engagement: { kind: "field" },
};
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

// 据点/军团二选一弹窗与行军目标的战斗指挥/委任弹窗统一为24px行高。
const choiceCity = { idx: 8, x: 10, y: 10, faction: 0 };
app.view.cityPixel = () => [160, 160];
app.view.sx = (value) => value;
app.view.sy = (value) => value;
bar.showGarrisonChoice(choiceCity, retreating);
assert.equal(bar.choiceDialog.h, 48);
assert.equal(bar.choiceDialog.hTiles, 4);
bar._recalcChoice();
assert.equal(
  bar._hitChoice(bar.choiceDialog.px + 4, bar.choiceDialog.py + 23),
  0,
);
assert.equal(
  bar._hitChoice(bar.choiceDialog.px + 4, bar.choiceDialog.py + 25),
  1,
);
bar.closeChoiceDialog();

// 位置确认选择道路中的军团时必须调用dayProgress()取得数值，不能把函数
// 对象传给插值后将相机坐标污染为NaN。
const marching = {
  leader: "行軍",
  faction: 0,
  x: 2,
  y: 2,
  prevX: 1,
  prevY: 2,
  troops: 100,
  morale: 100,
  target: city,
};
app.scenario.legions = [marching];
app.scenario.cities = [city];
clock.dayProgress = () => 0.5;
view.getLegionRenderPos = (_legion, t) => {
  assert.equal(t, 0.5);
  return { wxp: 24, wyp: 32 };
};
view.cam = { x: 0, y: 0 };
view.clampCam = () => {
  assert.equal(Number.isFinite(view.cam.x), true);
  assert.equal(Number.isFinite(view.cam.y), true);
};
bar.showLegionLocate();
bar.listDialog.onPick(0);
assert.equal(Number.isFinite(view.cam.x), true);
assert.equal(Number.isFinite(view.cam.y), true);

// 所有有表头的Canvas列表默认支持双向排序：数字按数值、文字按繁中排序，
// 占位虚线始终留在末尾；第二次点击同一表头反向，选择保持绑定原row。
const sortRows = [
  { cells: ["乙", "10"], id: "b" },
  { cells: ["甲", "2"], id: "a" },
  { cells: ["－－", "－－"], id: "placeholder" },
];
bar.openListDialog({
  header: ["武將名", "總兵數"],
  cols: [
    { x: 0, w: 80 },
    { x: 80, w: 80, align: "right" },
  ],
  rows: sortRows,
  w: 160,
  h: 96,
  scrollbar: "right",
});
const d = bar.listDialog;
d.px = 100;
d.py = 100;
d.titleH = 0;
assert.equal(d.headerH, 24, "所有Canvas列表表头统一加高至24px");
d.headerH = 24;
d.top = 24;
d.cap = 4;
d.selectedRow = 0;
assert.equal(bar.click(190, 108, 0), true);
assert.deepEqual(
  d.rows.map((row) => row.id),
  ["a", "b", "placeholder"],
);
assert.equal(d.rows[d.selectedRow].id, "b");
assert.equal(d.sortColumn, 1);
assert.equal(d.sortDirection, 1);
assert.equal(bar.click(190, 108, 0), true);
assert.deepEqual(
  d.rows.map((row) => row.id),
  ["b", "a", "placeholder"],
);
assert.equal(d.sortDirection, -1);
assert.equal(bar.hover(110, 108), true);
assert.equal(d.headerHover, 0);
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
  "advisor delegation UI OK: fan/right-click/map lock + sortable list headers + order/save guards\n",
);
