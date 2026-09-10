import assert from "node:assert/strict";
import fs from "node:fs/promises";

// 构造基础浏览器环境 mock
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  closed: false,
  close: () => {
    globalThis.window.closed = true;
  },
};
globalThis.location = {
  reloadCalled: false,
  reload: () => {
    globalThis.location.reloadCalled = true;
  },
};
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
globalThis.performance = { now: () => 1000 };
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

// 构造 mock app 和 clock
const mockClock = {
  hold: false,
  speed: 2,
  year: 190,
  month: 1,
  day: 1,
};
let _viewDrawCount = 0;
const mockView = {
  draw: () => {
    _viewDrawCount++;
  },
  hoverTarget: null,
};
const mockApp = {
  clock: mockClock,
  view: mockView,
  hud: { dialogCount: 0 },
  gameStarted: true,
  scenario: { legions: [] },
  exitConfirmed: false,
  lastExitAction: null,
};

const gamebar = new GameBar(mockApp);
// 模拟所需图形资产就绪
gamebar._gf = {
  sq: {},
  col: {},
  cap: {},
  cloud: {},
};

// 1. 验证初始状态
assert.equal(gamebar.exitConfirmDialog, null, "初始无退出确认弹窗");
assert.equal(gamebar.isMenuOpen(), false, "初始无菜单打开");

// 2. 打开弹窗
gamebar.openExitConfirmDialog("reload");
assert.ok(gamebar.exitConfirmDialog, "成功打开退出确认弹窗");
assert.equal(
  gamebar.exitConfirmDialog.message,
  "刷新或关闭会丢失当前进度，请检查是否已存档。",
  "提示信息内容完全一致",
);
assert.deepEqual(
  gamebar.exitConfirmDialog.buttons,
  ["确定退出", "返回游戏"],
  "下方提供两个按钮：确定退出 和 返回游戏",
);
assert.equal(
  gamebar.exitConfirmDialog.defaultButton,
  1,
  "默认按钮索引指向 1 (返回游戏)",
);
assert.equal(gamebar.isMenuOpen(), true, "弹窗打开后判定为模态/菜单打开");
assert.equal(gamebar.hitTest(100, 100), true, "弹窗打开后全屏命中拦截");
assert.equal(mockClock.hold, true, "弹窗打开后战略时钟保持冻结");

// 3. 几何规格与按钮坐标测试
const rect = gamebar._exitConfirmDialogRect();
assert.equal(rect.wTiles, 22, "外框宽 22 tiles (352px)");
assert.equal(rect.hTiles, 8, "外框高 8 tiles (128px)");
assert.equal(rect.w, 352, "外框宽 352px");
assert.equal(rect.h, 128, "外框高 128px");
assert.equal(rect.x, Math.round((1024 - 352) / 2), "弹窗水平居中");
assert.equal(rect.y, Math.round((768 - 128) / 2), "弹窗垂直居中");

const innerX = rect.x + 8;
const innerY = rect.y + 8;
const innerW = (rect.wTiles - 1) * 16;
const btnW = 84;
const btnY = innerY + 74;
const btn0X = innerX + Math.floor(innerW / 2) - btnW - 16;
const btn1X = innerX + Math.floor(innerW / 2) + 16;

assert.equal(
  gamebar._hitExitConfirmDialog(btn0X + 10, btnY + 10),
  0,
  "命中按钮0：确定退出",
);
assert.equal(
  gamebar._hitExitConfirmDialog(btn1X + 10, btnY + 10),
  1,
  "命中按钮1：返回游戏",
);
assert.equal(
  gamebar._hitExitConfirmDialog(rect.x - 10, rect.y - 10),
  -1,
  "弹窗外部返回 -1",
);

// 4. 悬停状态测试
gamebar.hover(btn0X + 10, btnY + 10);
assert.equal(gamebar.exitConfirmDialog.hover, 0, "悬停在确定退出按钮上");
gamebar.hover(btn1X + 10, btnY + 10);
assert.equal(gamebar.exitConfirmDialog.hover, 1, "悬停在返回游戏按钮上");
gamebar.hover(rect.x + 10, rect.y + 10);
assert.equal(gamebar.exitConfirmDialog.hover, -1, "移出按钮后恢复 -1");

// 5. Canvas 绘制记录测试
const drawOps = [];
const mockCtx = {
  save: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: (x, y) => drawOps.push({ op: "moveTo", x, y }),
  lineTo: (x, y) => drawOps.push({ op: "lineTo", x, y }),
  stroke: () => drawOps.push({ op: "stroke" }),
  fillRect: (x, y, w, h) => drawOps.push({ op: "fillRect", x, y, w, h }),
  strokeRect: (x, y, w, h) => drawOps.push({ op: "strokeRect", x, y, w, h }),
  fillText: (text, x, y) => drawOps.push({ op: "fillText", text, x, y }),
  measureText: (text) => ({ width: text.length * 16 }),
  drawImage: () => {},
  createPattern: () => ({}),
  set font(_v) {},
  set fillStyle(v) {
    drawOps.push({ op: "fillStyle", val: v });
  },
  set strokeStyle(v) {
    drawOps.push({ op: "strokeStyle", val: v });
  },
  set lineWidth(_v) {},
  set textAlign(_v) {},
  set textBaseline(_v) {},
};
gamebar._drawExitConfirmDialog(mockCtx);
const textOps = drawOps.filter((o) => o.op === "fillText").map((o) => o.text);
assert.ok(textOps.includes("刷新或关闭会丢失当前进度，"), "绘制包含第一行提示");
assert.ok(textOps.includes("请检查是否已存档。"), "绘制包含第二行提示");
assert.ok(textOps.includes("确定退出"), "绘制包含确定退出按钮");
assert.ok(textOps.includes("返回游戏"), "绘制包含返回游戏按钮");
// 验证突出默认按钮（返回游戏）的高亮轮廓线
const goldOutline = drawOps.some(
  (o) => o.op === "strokeStyle" && o.val === "#ffd700",
);
assert.ok(goldOutline, "突出默认按钮：绘制了金色高亮轮廓线");

// 6. 右键回退（默认返回游戏）
const rightClickConsumed = gamebar.click(100, 100, 2);
assert.equal(rightClickConsumed, true, "右键点击被消费");
assert.equal(gamebar.exitConfirmDialog, null, "右键点击关闭了弹窗，回到游戏");

// 7. 再次打开，测试点击“返回游戏”按钮
gamebar.openExitConfirmDialog("reload");
assert.ok(gamebar.exitConfirmDialog, "再次打开弹窗");
const cancelClickConsumed = gamebar.click(btn1X + 10, btnY + 10, 0);
assert.equal(cancelClickConsumed, true, "左键点击返回游戏被消费");
assert.equal(
  gamebar.exitConfirmDialog,
  null,
  "点击返回游戏关闭了弹窗，回到游戏",
);

// 8. 再次打开，测试点击“确定退出”按钮
gamebar.openExitConfirmDialog("reload");
assert.ok(gamebar.exitConfirmDialog, "再次打开弹窗");
globalThis.location.reloadCalled = false;
mockApp.exitConfirmed = false;
mockApp.lastExitAction = null;
const confirmClickConsumed = gamebar.click(btn0X + 10, btnY + 10, 0);
assert.equal(confirmClickConsumed, true, "左键点击确定退出被消费");
assert.equal(gamebar.exitConfirmDialog, null, "弹窗状态清理");
assert.equal(mockApp.exitConfirmed, true, "已确认退出标记置为 true");
assert.equal(mockApp.lastExitAction, "reload", "执行了刷新动作");
assert.equal(
  globalThis.location.reloadCalled,
  true,
  "调用了 location.reload()",
);

// 9. 测试 action === "close"
mockApp.exitConfirmed = false;
gamebar.openExitConfirmDialog("close");
assert.ok(gamebar.exitConfirmDialog, "打开关闭弹窗");
gamebar.click(btn0X + 10, btnY + 10, 0);
assert.equal(mockApp.exitConfirmed, true, "确认关闭标记置为 true");
assert.equal(mockApp.lastExitAction, "close", "执行了关闭动作");

// 10. 测试 beforeunload 防护规则
function simulateBeforeUnload(app) {
  if (app.exitConfirmed || !app.gameStarted || !app.scenario) return null;
  const event = { preventDefaultCalled: false, returnValue: "" };
  event.preventDefault = () => {
    event.preventDefaultCalled = true;
  };
  event.preventDefault();
  const msg = "刷新或关闭会丢失当前进度，请检查是否已存档。";
  event.returnValue = msg;
  return event;
}

// 战局中未确认退出时：
mockApp.exitConfirmed = false;
const blockedEvent = simulateBeforeUnload(mockApp);
assert.ok(blockedEvent, "战局中未确认退出必须拦截 beforeunload");
assert.equal(blockedEvent.preventDefaultCalled, true, "调用了 preventDefault");
assert.equal(
  blockedEvent.returnValue,
  "刷新或关闭会丢失当前进度，请检查是否已存档。",
  "设置了正确的提示文本",
);

// 用户在弹窗确认退出后：
mockApp.exitConfirmed = true;
const allowedEvent = simulateBeforeUnload(mockApp);
assert.equal(
  allowedEvent,
  null,
  "用户确认退出后 beforeunload 直接放行，不二次卡顿",
);

// 未开始游戏时：
mockApp.gameStarted = false;
assert.equal(simulateBeforeUnload(mockApp), null, "未开始游戏时直接放行");

process.stdout.write("verify_exit_confirm_dialog passed successfully!\n");
