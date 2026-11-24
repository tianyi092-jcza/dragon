// 扩图攻城 repaint：y>255 照画、角点等价、越界角跳过、坏入参 fail-closed。
// 用法：node --test tools/verify_city_capture_expanded.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { paintExpandedCityTile } from '../web/src/game/navigation/originalcitycapture.js';

function fakeTerrain(width, height, fill = 0xcb) {
  const bytes = new Uint8Array(width * height).fill(fill);
  const check = a => { if (!Number.isInteger(a) || a < 0 || a >= bytes.length) throw new RangeError('oob ' + a); };
  return {
    bytes,
    readByte: a => { check(a); return bytes[a]; },
    writeByte: (a, v) => { check(a); bytes[a] = v; },
  };
}
const bounds = (w = 8, h = 300) => ({ minX: 0, minY: 0, width: w, height: h });

test('y>255 主块重漆：中立+2、他方+1、己方不变', () => {
  for (const [faction, player, expected] of [[null, 0, 0xcd], [2, 0, 0xcc], [0, 0, 0xcb]]) {
    const t = fakeTerrain(8, 300);
    paintExpandedCityTile(t, bounds(), { idx: 0, x: 4, y: 260, type: 1, faction }, player);
    assert.equal(t.bytes[260 * 8 + 4], expected, `faction=${faction}`);
  }
});

test('角点等价：都城(±2,±2)四角＋高亮，玩家色', () => {
  const t = fakeTerrain(8, 300);
  // 四角预置城墙色 0xe0（0xde..0xf1 区间内），主块 0xcb。
  for (const [dx, dy] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) t.bytes[(10 + dy) * 8 + (4 + dx)] = 0xe0;
  paintExpandedCityTile(t, bounds(), { idx: 0, x: 4, y: 10, type: 0, faction: 0 }, 0);
  // 0xe0 → 0xde + ((0xe0-0xde)%10) + 10 = 0xde+2+10 = 0xea
  for (const [dx, dy] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) {
    assert.equal(t.bytes[(10 + dy) * 8 + (4 + dx)], 0xea, `corner ${dx},${dy}`);
  }
});

test('越界角点跳过不炸；主块越界／坏参 fail-closed', () => {
  const t = fakeTerrain(8, 300);
  // (0,0) 普通城：(-1,-1) 越界跳过，其余三格照写，不抛。
  t.bytes[1 * 8 + 1] = 0xe8;
  paintExpandedCityTile(t, bounds(), { idx: 0, x: 0, y: 0, type: 1, faction: null }, 0);
  assert.equal(t.bytes[0], 0xcd);
  assert.equal(t.bytes[1 * 8 + 1], 0xde);
  assert.throws(() => paintExpandedCityTile(t, bounds(), { idx: 0, x: 99, y: 0, type: 1, faction: null }, 0), /8A3F/);
  assert.throws(() => paintExpandedCityTile(null, bounds(), { idx: 0, x: 0, y: 0, type: 1, faction: null }, 0), /8A3F/);
  assert.throws(() => paintExpandedCityTile(t, { minX: 0 }, { idx: 0, x: 0, y: 0, type: 1, faction: null }, 0), /8A3F/);
});
