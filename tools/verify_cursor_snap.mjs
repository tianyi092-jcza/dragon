import assert from "node:assert/strict";

// Mock browser globals for Node.js
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
globalThis.Image = class Image {
  constructor() {
    this.src = "";
  }
};

import { MapView } from "../web/src/render/mapview.js";

// Mock canvas
const cv = {
  width: 1024,
  height: 768,
  getContext: () => ({
    save: () => {},
    restore: () => {},
    clearRect: () => {},
    fillRect: () => {},
    drawImage: () => {},
    beginPath: () => {},
    roundRect: () => {},
    stroke: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 20 }),
    setLineDash: () => {},
    moveTo: () => {},
    lineTo: () => {},
  }),
};

// 构造测试战局数据：1个据点（许昌，坐标 x: 20, y: 15），1个军团（曹操，驻军或行军）
const cityXuchang = {
  idx: 0,
  name: "許昌",
  x: 20,
  y: 15,
  faction: 0,
};

const legionCaocao = {
  idx: 0,
  name: "曹操",
  leader: "曹操",
  x: 20,
  y: 15,
  prevX: 20,
  prevY: 15,
  faction: 0,
  dead: false,
  _active: true,
  target: null,
};

const mockScenario = {
  player_faction: 0,
  factions: [{ idx: 0, name: "曹操", march_marker_style: 0 }],
  cities: [cityXuchang],
  legions: [legionCaocao],
  factionOf: (c) => mockScenario.factions[c.faction],
};

const view = new MapView(cv, () => mockScenario);
view.cam = { x: 0, y: 0, scale: 1 };

// 据点中心屏幕像素
const [wxp, wyp] = view.cityPixel(cityXuchang);
const cx = view.sx(wxp);
const cy = view.sy(wyp);

// ── 1. 验证距据点中心远距离时（未相交）正常跟随 ──
view.setPointer(cx - 50, cy - 50);
assert.equal(view.snapState, null, "远距离时不吸附");
assert.deepEqual(view.pointer, { x: cx - 50, y: cy - 50 }, "光标完全跟随鼠标");
assert.equal(view.pick(cx - 50, cy - 50), null, "远距离 pick 返回 null");

// ── 2. 验证当光标(18×18)与据点中心图标(16×16)相交（半距<=17px）时自动吸附 ──
// 例如移动到偏左上角 dx=16, dy=16 处（类似图1）
view.setPointer(cx - 16, cy - 16);
assert.ok(view.snapState, "相交时触发自动吸附");
assert.equal(view.snapState.target.type, "city");
assert.equal(view.snapState.target.city.name, "許昌");
assert.deepEqual(
  view.pointer,
  { x: cx, y: cy },
  "光标自动定位在据点中心（类似图2）",
);

// 验证此时拾取 pick 精确返回许昌
const picked = view.pick(cx - 16, cy - 16);
assert.ok(picked, "吸附状态下点击/拾取命中");
assert.equal(picked.type, "city");
assert.equal(picked.city.name, "許昌");

// ── 3. 验证在相交区内手抖微移，保持吸附在中心 ──
view.setPointer(cx - 10, cy - 12);
assert.ok(view.snapState, "相交区内微移仍保持吸附");
assert.deepEqual(view.pointer, { x: cx, y: cy }, "光标保持在中心不抖动");

// ── 4. 验证鼠标移出相交区后自动解除吸附 ──
view.setPointer(cx - 25, cy);
assert.equal(view.snapState, null, "移出相交区后吸附解除");
assert.deepEqual(view.pointer, { x: cx - 25, y: cy }, "光标恢复跟随鼠标");

// ── 5. 验证行军中的军团相交与自动吸附 ──
// 调整曹操军团为行军中（x: 25, y: 15, 离开据点）
legionCaocao.x = 25;
legionCaocao.y = 15;
legionCaocao.prevX = 25;
legionCaocao.prevY = 15;
legionCaocao.target = { x: 30, y: 15 };

const lPos = view.getLegionRenderPos(legionCaocao, 1);
const lx = lPos.sx;
const ly = lPos.sy;

// 鼠标移向军团，刚好相交（dx=15, dy=14，类似图3）
view.setPointer(lx + 15, ly + 14);
assert.ok(view.snapState, "光标与军团图标相交时触发自动吸附");
assert.equal(view.snapState.target.type, "legion");
assert.equal(view.snapState.target.legion.name, "曹操");
assert.deepEqual(
  view.pointer,
  { x: lx, y: ly },
  "光标自动定位在军团当前中心（类似图4）",
);

// ── 6. 验证“自动吸附只一次，如果军团移动不跟随” ──
const snappedX = view.pointer.x;
const snappedY = view.pointer.y;

// 模拟军团向前行军（坐标改变，x 增加了 6px）
legionCaocao.x = 26;
legionCaocao.prevX = 25;
legionCaocao._renderMoveSerial = 1;
// 触发 draw() 重绘
view.draw();

// 核心验证：军团移动，光标坐标绝不跟随军团！
assert.deepEqual(
  view.pointer,
  { x: snappedX, y: snappedY },
  "军团向前移动，光标固定在原吸附位置，不跟随军团！",
);

// 当军团走远（离开吸附框超过17px）
legionCaocao.x = 35;
legionCaocao.prevX = 35;
view.draw();
assert.equal(view.snapState, null, "军团走远离开吸附框后，吸附自动解除");
assert.deepEqual(
  view.pointer,
  { x: lx + 15, y: ly + 14 },
  "吸附解除后光标自然回到物理鼠标所在位置",
);

process.stdout.write("verify_cursor_snap passed successfully!\n");
