// 提示框自动回行：原版TALK固定分行不断行，全流按框宽measure折行。
import assert from "node:assert/strict";
import test from "node:test";

globalThis.innerWidth = 640;
globalThis.innerHeight = 400;

const { GameBar } = await import("../web/src/ui/gamebar.js");

const CHAR = 10;
function stubCtx(drawn) {
  return {
    font: "",
    fillStyle: "",
    textBaseline: "",
    measureText(text) {
      return { width: String(text).length * CHAR };
    },
    fillText(text, x, y) {
      drawn.push({ text: String(text), x, y, font: this.font, fill: this.fillStyle });
    },
    drawImage() {},
    fillRect() {},
  };
}

function drawBox(lines, w = 304, h = 80) {
  const drawn = [];
  const bar = Object.create(GameBar.prototype);
  bar._drawWindow = (_ctx, px, py) => ({ x: px + 8, y: py + 8, w: w, h: h });
  bar._drawGeneralCardBox(stubCtx(drawn), 100, 100, w, h, null, lines);
  return drawn;
}

test("TALK固定分行被打散重排：跨原行边界续接", () => {
  const drawn = drawBox([
    [{ text: "ABCDEFGHIJ", color: "#ffffff" }, { text: "KLMNOPQRST", color: "#ffe000" }],
    [{ text: "UVWXYZ", color: "#ffffff" }],
  ]);
  // 框内宽210px=21字符：26字符流应折为21+5，原行边界消失。
  const rows = [];
  for (const d of drawn) {
    const last = rows.at(-1);
    if (last && last.y === d.y) last.text += d.text;
    else rows.push({ y: d.y, text: d.text });
  }
  assert.deepEqual(
    rows.map((r) => r.text),
    ["ABCDEFGHIJKLMNOPQRSTU", "VWXYZ"],
  );
});

test("字符串内\\n不断行：拼入流中", () => {
  const drawn = drawBox(["AB\nCDEFGHIJKLMNOPQRSTUVWX"]);
  const rows = [];
  for (const d of drawn) {
    const last = rows.at(-1);
    if (last && last.y === d.y) last.text += d.text;
    else rows.push({ y: d.y, text: d.text });
  }
  assert.deepEqual(
    rows.map((r) => r.text),
    ["ABCDEFGHIJKLMNOPQRSTU", "VWX"],
  );
});

test("颜色与数字字体随片断保留", () => {
  const drawn = drawBox([
    [{ text: "AB", color: "#ffe000" }, { text: "CD", color: "#ffffff", isNum: true }],
  ]);
  assert.equal(drawn[0].fill, "#ffe000");
  assert.equal(drawn[1].fill, "#ffffff");
  assert.match(drawn[1].font, /Oswald/);
  assert.ok(!/Oswald/.test(drawn[0].font));
});

test("每行不超框宽", () => {
  const drawn = drawBox([
    [{ text: "0123456789".repeat(10), color: "#ffffff" }],
    "汉字测试".repeat(20),
  ]);
  const byRow = new Map();
  for (const d of drawn) {
    const row = byRow.get(d.y) ?? { x0: Infinity, x1: -Infinity };
    row.x0 = Math.min(row.x0, d.x);
    row.x1 = Math.max(row.x1, d.x + d.text.length * CHAR);
    byRow.set(d.y, row);
  }
  for (const [y, row] of byRow) {
    assert.ok(row.x1 - row.x0 <= 210, `row y=${y} width ${row.x1 - row.x0}`);
  }
});
