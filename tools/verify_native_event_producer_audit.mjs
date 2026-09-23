import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";

// type10 生产者穷尽审计锁定（re-notes-custom-data.md §7.3）。
// 结论：事件轮（256×4B，段 cs:[D56]）写指令仅 2FF6/2FF8 与 3038/303A 两处；
// 全部追加入口（2FBF/2FB1→2FC0、301C/300E→301C）的全部直接 near-call 生产者
// 站点穷尽枚举共 15 个，type 立即数集合 {1,1,2,3,4,5,6,7,8,9,11,12,12,12,13}，
// 无 0x0A；函数指针式立即数引用与 9A 远调用命中均为零。
// 仍 UNKNOWN：FF /2-/3 间接调用与自修改代码（静态不可排除）。

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const LOAD = 0x200;
const raw = (address, length) =>
  ki.subarray(address + LOAD, address + LOAD + length).toString("hex");

test("fixed KI event-wheel write primitives and search routine bytes", () => {
  // 2FB1 包装：CX=SI*4、AH=CH（arg0=槽索引），落入 2FBF。
  assert.equal(raw(0x2fb1, 0x0e), "518bced1e1d1e18ae5e8020059c3");
  // 2FBF/2FC0 扫描追加：BL=FF→ECE0&7C 随机槽；写指令仅在 2FF6/2FF8；
  // DS=cs:[D56]；页内扫至 0x100，满则 STC。
  assert.equal(
    raw(0x2fbf, 0x4e),
    "1e505351528bc880fbff7510e812bd32e4247c8bd82e031e200deb0b32ffd1e3d1e32e031e200d81fb0001731b2e8e1e560d803f007508890f895702f8eb0a83c30481fb000172eaf95a595b581f",
  );
  // 300E 包装：CX=SI*4 后 call 301C。
  assert.equal(raw(0x300e, 0x10), "518bced1e1d1e18ae5e8020059c31e50");
  // 301C 定槽追加：从 D20+BL*4 扫整轮至 0x400；写指令仅在 3038/303A。
  assert.equal(
    raw(0x301c, 0x32),
    "1e505351528bc832ffd1e3d1e32e031e200d2e8e1e560d803f007507890f895702eb0983c30481fb000472eb5a595b581fc3",
  );
  // 304E/305B 事件搜索（读），非生产者。
  assert.equal(
    raw(0x304e, 0x43),
    "1e50538bded1e3d1e38ae7eb031e50532e8e1e560d2e8b1e200d3907751480faff7405385702750a80feff7411385703740c83c30481fb000472dff9eb01f85b581fc3",
  );
});

test("fixed KI producer call-site bytes carry type immediates without 0x0A", () => {
  // 每个站点钉 type 立即数 mov + call 首字节（e8）。
  const sites = [
    [0x2d4a, 8, "b008baffff8adae8"], // type8 迁都
    [0x2e7d, 5, "b002b3ffe8"], // type2
    [0x2ee3, 5, "b003b3ffe8"], // type3
    [0x2f64, 5, "b001b3ffe8"], // type1
    [0x2fa1, 8, "b001ba18ffb3ffe8"], // type1
    [0x22aa, 6, "b80c01b3ffe8"], // type12 AH=1
    [0x22c7, 6, "b80c02b3ffe8"], // type12 AH=2
    [0x2340, 7, "b00b32e433d2e8"], // type11
    [0x577a, 5, "b004b3ffe8"], // type4
    [0x57e9, 5, "b005b3ffe8"], // type5
    [0x581c, 6, "b80d00ba9601"], // type13 DX=0x196
    [0x34fe, 6, "b80c008bd6e8"], // type12 经301C
    [0x597c, 6, "b009baffffe8"], // type9
    [0x669c, 12, "b0078b5602d1e2d1e28ad6b3"], // type7
    [0x6548, 7, "b00633d2b314e8"], // type6 经300E
  ];
  for (const [va, n, hex] of sites) assert.equal(raw(va, n), hex);
});

test("live re-audit: near-call map into append range is exactly the pinned set", () => {
  const hits = [];
  for (let off = LOAD; off < ki.length - 3; off += 1) {
    if (ki[off] !== 0xe8) continue;
    let rel = ki[off + 1] | (ki[off + 2] << 8);
    if (rel & 0x8000) rel -= 0x10000;
    const target = (off - LOAD + 3 + rel) & 0xffff;
    if (target >= 0x2fb1 && target < 0x3050) hits.push([off - LOAD, target]);
  }
  assert.deepEqual(hits, [
    [0x22af, 0x2fbf],
    [0x22cc, 0x2fbf],
    [0x2346, 0x2fbf],
    [0x2d51, 0x2fb1],
    [0x2e81, 0x2fb1],
    [0x2ee7, 0x2fb1],
    [0x2f68, 0x2fb1],
    [0x2fa8, 0x2fb1],
    [0x2fba, 0x2fbf], // 2FB1 自身落入
    [0x3017, 0x301c], // 300E 自身 call
    [0x3503, 0x301c],
    [0x577e, 0x2fbf],
    [0x57ed, 0x2fbf],
    [0x5824, 0x2fbf],
    [0x5981, 0x301c],
    [0x648c, 0x304e], // 搜索
    [0x654e, 0x300e],
    [0x660d, 0x304e], // 搜索
    [0x66a9, 0x301c],
    [0x6777, 0x304e], // 搜索
  ]);
});

test("live re-audit: no function-pointer immediates or far calls reach the append entries", () => {
  const entries = [0x2fbf, 0x2fb1, 0x301c, 0x300e, 0x2fc0, 0x2ff6, 0x3038];
  // imm16 引用且前字节为 mov reg,imm(b8..bf)/push imm(68)：零。
  for (const value of entries) {
    const lo = value & 0xff;
    const hi = value >> 8;
    for (let off = LOAD; off < ki.length - 2; off += 1) {
      if (ki[off] !== lo || ki[off + 1] !== hi) continue;
      const prev = ki[off - 1];
      assert.ok(
        !(prev >= 0xb8 && prev <= 0xbf) && prev !== 0x68,
        `unexpected imm16 ref to ${value.toString(16)} at ${(off - LOAD).toString(16)}`,
      );
    }
  }
  // 9A ptr16:16 远调用无一指向追加原语。
  let farCalls = 0;
  for (let off = LOAD; off < ki.length - 5; off += 1) {
    if (ki[off] !== 0x9a) continue;
    farCalls += 1;
    const o16 = ki[off + 1] | (ki[off + 2] << 8);
    assert.ok(
      !entries.includes(o16),
      `far call to append primitive ${o16.toString(16)} at ${(off - LOAD).toString(16)}`,
    );
  }
  assert.equal(farCalls, 143);
});

test("live re-audit: wheel segment cs:[D56] loads are exactly the three pinned sites", () => {
  const pat = [0x2e, 0x8e, 0x1e, 0x56, 0x0d]; // mov ds, cs:[0d56]
  const sites = [];
  for (let off = LOAD; off < ki.length - 5; off += 1) {
    if (pat.every((b, i) => ki[off + i] === b)) sites.push(off - LOAD);
  }
  assert.deepEqual(sites, [0x2fec, 0x302e, 0x305e]);
  // mov es, cs:[0d56]（2e 8e 06 56 0d）不存在；2BD9 页前移经 AX 寄存器装载。
  const esPat = [0x2e, 0x8e, 0x06, 0x56, 0x0d];
  for (let off = LOAD; off < ki.length - 5; off += 1) {
    assert.ok(
      !esPat.every((b, i) => ki[off + i] === b),
      `unexpected es load at ${(off - LOAD).toString(16)}`,
    );
  }
});
