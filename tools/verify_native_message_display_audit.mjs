import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";

// P32：8810/5E80 消息显示子树写集与返回合同穷尽审计锁定
// （单一维护源：re-notes-strategic-message-abi.md 审计节）。
// 方法：从 8810/5E80 递归下降（capstone 16 位）构造传递调用树，46 个函数、
// 74 条直接 near-call 边；唯一间接边 084A 的 call ax 已实锤解析为 cs:[08A4]
// 跳转表（\1..\7 令牌处理器 08B2/08DB/0904/0939/095B/097E/0984，已并入树）。
// 结论：
// - 全树 74 条边无一条指向 ECE0 → 消息显示零 RNG 消费（实锤）。
// - 全树 41 条写指令逐条分类：VRAM（ds/es=0xA0C8 或字形 blit movsb/stosb）、
//   属性平面（ds=cs:[D84E]）、命中平面（ds=cs:[E479]）、代码段显示/等待/鼠标
//   局部（cs:[98A5]/[0D2C-0D2D]/[01D5-01D9]/[F7A1-F7A3]/[071F-074D]/[0845-0849]）、
//   栈帧（F4DF [bp]）。零规则状态写入（信赖 cs:[D00]、事件轮、势力/城/军团
//   记录均不出现）。
// - 8810 本体 = 895D 开框 → 01B4 鼠标 → 075B 文本 → 01DB → 222B 输入等待 →
//   01B4 → 895D 关框 → cs:[98A5]=8 → 01DB → RET；仅保存/恢复 AX/BX/CX/DX，
//   无栈切换、无非局部返回（旧会话曾误读 88E0 为栈切换，系陈旧缓存错断，
//   字节级核对证伪：58 5a 8b 26 d2 0c 在全文件中不存在）。
// - 5E80：98A6-bit1 门，SI=cs:[CFD] 玩家势力，AL 右移逐位调 5EB7/5F27/5F5D/5F7F
//   四面板（君主名/城/资金等），同属零规则写入。
// 勘误：075B 选择器展开 CX>=0x196 → 0x196+(CX-0x196)*8+AH 与 P27/P29 一致；
// F75E 两处 lcall 0:0 为运行期打补丁的鼠标驱动入口（P14 重定位鼠标模块之实锤）。

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const LOAD = 0x200;
const raw = (address, length) =>
  ki.subarray(address + LOAD, address + LOAD + length).toString("hex");

test("8810 body: frame/text/wait/close sequence, single display-byte write, plain RET", () => {
  assert.equal(raw(0x8810, 16), "53525051ba0a00bb0800b01eb91005e8");
  assert.equal(raw(0x881f, 5), "e83b015958"); // call 895D 开框后恢复 CX/AX
  assert.equal(raw(0x8824, 3), "e88d79"); // call 01B4（rel16 回卷至 01B4）
  assert.equal(raw(0x882d, 3), "e82b7f"); // call 075B 文本
  assert.equal(raw(0x8830, 3), "e8a879"); // call 01DB
  assert.equal(raw(0x8833, 3), "e8f599"); // call 222B 输入等待（直接，非2216包装）
  assert.equal(raw(0x8844, 3), "e81601"); // call 895D 关框（AL=0）
  // 8810 本体唯一自写：显示状态字节 cs:[98A5]=8。
  assert.equal(raw(0x8847, 6), "2ec606a59808");
  assert.equal(raw(0x8850, 3), "5a5bc3"); // pop dx / pop bx / ret
});

test("075B selector expansion and cs:[08A4] token jump table", () => {
  assert.equal(raw(0x075b, 8), "1e56502e8e1e380d"); // ds=cs:[D38] TALK段
  assert.equal(raw(0x0763, 4), "81f99601"); // cmp cx,0x196
  // \1..\7 令牌处理器表：08B2 武将名 / 08DB 城名(+0x840+2) / 0904 目标君主名
  // (+0x4242) / 0939 玩家军师名(CFD+2→+0x4248) / 095B 玩家君主名 / 097E 空跳 /
  // 0984 数字÷0xF06 经 062F 渲染。
  assert.equal(raw(0x08a4, 14), "b208db08040939095b097e098409");
  assert.equal(raw(0x08b2, 5), "2e8e1e520d"); // 令牌1：ds=cs:[D52] 状态段
  assert.equal(raw(0x08b7, 3), "368b05"); // 读 caller 栈参数 ss:[di]
  assert.equal(raw(0x08cb, 3), "054042"); // +0x4240 武将记录
  assert.equal(raw(0x08f4, 3), "054008"); // 令牌2：+0x840 城记录
  assert.equal(raw(0x092d, 4), "81c64242"); // 令牌3：+0x4242
  assert.equal(raw(0x093e, 5), "2e8b36fd0c"); // 令牌4：si=cs:[CFD]
  assert.equal(raw(0x094e, 3), "054842"); // 令牌4：+0x4248
  assert.equal(raw(0x097e, 6), "474783ea30c3"); // 令牌6：跳参+行位修正
  assert.equal(raw(0x09a5, 3), "bb060f"); // 令牌7：除数 0xF06
});

test("render subtree segments/ports/devices are display-only", () => {
  assert.equal(raw(0x07da, 4), "8ccb8edb"); // 07D2：ds=cs（写代码段局部）
  assert.equal(raw(0x07f1, 4), "88874608"); // cs:[bx+0x846] 颜色缓存
  assert.equal(raw(0x07fe, 4), "883e4508"); // cs:[0x845] 轮转游标
  assert.equal(raw(0x062f, 12), "1e0651565755fcb9c8a08ec1"); // es=0xA0C8 VRAM
  assert.equal(raw(0x0b13, 5), "b8c8a08ed8"); // 0AD9：ds=0xA0C8
  assert.equal(raw(0x0ae3, 4), "bacf038a"); // 端口 0x3CF
  assert.equal(raw(0xd5e9, 5), "2e8e1e4ed8"); // D5D4：ds=cs:[D84E] 属性平面
  assert.equal(raw(0xe3da, 5), "2e8e1e79e4"); // E3D7：ds=cs:[E479] 命中平面
  assert.equal(raw(0xf213, 5), "b8c8a08ed8"); // F1A3：ds=0xA0C8（640×400 裁剪）
  assert.equal(raw(0xf7ac, 5), "b8c8a08ed8"); // F7A4：ds=0xA0C8 光标精灵
  assert.equal(raw(0xf763, 5), "2ea3a1f78c"); // F75E：cs:[F7A1] 局部
  assert.equal(raw(0xf789, 5), "9a00000000"); // lcall 0:0 运行期补丁鼠标驱动
  assert.equal(raw(0xf790, 5), "9a00000000");
  assert.equal(raw(0xf4eb, 5), "b8003dcd21"); // F4DF：DOS open
  assert.equal(raw(0xf4fa, 3), "b80042"); // seek 4200（后随 cd21）
  assert.equal(raw(0xf507, 3), "b43f8b"); // read 3F
  assert.equal(raw(0xf513, 6), "9fb43e8b5e00"); // close 3E
  assert.equal(raw(0xe3a1, 2), "cd50"); // E38C：int 0x50 引擎
  // 0701 三个自修改参数槽（F878/F75E 的调用参数），非规则状态。
  assert.equal(raw(0x0701, 15), "505157552ea31f072ea336072ea34d");
});

test("5E80 gate and four HUD panels read player faction, zero rule writes", () => {
  assert.equal(raw(0x5e80, 9), "2ef606a698027501c3"); // test cs:[98A6],2 门
  assert.equal(raw(0x5e8b, 5), "2e8e1e520d"); // ds=cs:[D52]
  assert.equal(raw(0x5e90, 5), "2e8b36fd0c"); // si=cs:[CFD] 玩家势力
});

test("40E6 player reinforcement chain and 463E/5E80 HUD tail pins", () => {
  assert.equal(raw(0x40c9, 7), "80bc5708007401"); // +857 冷却门
  assert.equal(raw(0x40d2, 10), "2e8a0eff0c3a8c410875"); // cl=cs:[CFF] 比属主
  assert.equal(raw(0x40e3, 4), "578bfce8"); // push 城记录参数 / di=sp
  assert.equal(raw(0x40e6, 3), "e8f5cb"); // call CDE 蜂鸣
  assert.equal(raw(0x40e9, 5), "b92600b093"); // cx=0x26(TALK38) al=0x93
  assert.equal(raw(0x40ee, 3), "e81f47"); // call 8810
  assert.equal(raw(0x40f1, 3), "83c402"); // add sp,2 收参数
  assert.equal(raw(0x40f6, 9), "e8e7ab240f0418eb50"); // ece0→&0x0F→+0x18
  assert.equal(raw(0x40fd, 2), "eb50"); // jmp 414F
  assert.equal(raw(0x414f, 4), "88855708"); // mov [di+0x857],al
  assert.equal(raw(0x4641, 10), "8a44012e3a06ff0c7505"); // 属主==cs:[CFF]?
  assert.equal(raw(0x464b, 5), "b008e83018"); // al=8 call 5E80 → 4650 RET
});

// 8810/5E80 传递调用树（递归下降，46 函数 / 74 边）。每条边钉 e8+rel16 目标。
const CALL_EDGES = [
  [0x065e, 0x0cac],
  [0x0666, 0x069a],
  [0x0680, 0x06de],
  [0x0690, 0x069a],
  [0x06f9, 0x084a],
  [0x06fd, 0x0701],
  [0x0719, 0xf878],
  [0x0721, 0xf75e],
  [0x0730, 0xf878],
  [0x0738, 0xf75e],
  [0x0747, 0xf878],
  [0x074f, 0xf75e],
  [0x0785, 0x0bcd],
  [0x079d, 0x07d2],
  [0x07af, 0x0ad9],
  [0x07c9, 0x06f9],
  [0x0824, 0xe38c],
  [0x083a, 0xfa37],
  [0x0862, 0xf878],
  [0x0871, 0xf75e],
  [0x08d7, 0x0701],
  [0x0900, 0x0701],
  [0x0935, 0x0701],
  [0x0957, 0x0701],
  [0x097a, 0x0701],
  [0x09a8, 0x062f],
  [0x0ac3, 0x0ad9],
  [0x0ad5, 0x0ad9],
  [0x0ae0, 0x0cac],
  [0x0bd3, 0x0c14],
  [0x0c0a, 0xf1a3],
  [0x0c3a, 0x0c60],
  [0x0c3f, 0x0c77],
  [0x0c4b, 0x0c77],
  [0x0c54, 0x0c60],
  [0x0c69, 0xf9b0],
  [0x0c6f, 0xf9b0],
  [0x0c83, 0xf9b0],
  [0x0c8d, 0xf9b0],
  [0x0c97, 0xf9b0],
  [0x0ca3, 0xf9b0],
  [0x5e9c, 0x5eb7],
  [0x5ea3, 0x5f27],
  [0x5eaa, 0x5f5d],
  [0x5eb1, 0x5f7f],
  [0x5ed0, 0x07d2],
  [0x5ee0, 0x06fd],
  [0x5f00, 0x06fd],
  [0x5f1f, 0x06fd],
  [0x5f55, 0x0aaa],
  [0x5f77, 0x062f],
  [0x5f98, 0x062f],
  [0x881f, 0x895d],
  [0x8824, 0x01b4],
  [0x882d, 0x075b],
  [0x8830, 0x01db],
  [0x8833, 0x222b],
  [0x8836, 0x01b4],
  [0x8844, 0x895d],
  [0x884d, 0x01db],
  [0x8973, 0xd5d4],
  [0x8984, 0x0c14],
  [0x8999, 0x89de],
  [0x89ec, 0xe3d7],
  [0xe393, 0xf4df],
  [0xf795, 0xf7a4],
  [0xf9e8, 0xfa1b],
  [0xf9fd, 0xfa1b],
  [0xfa06, 0xfa1b],
  [0xfa0f, 0xfa1b],
  [0xfa6f, 0xfaa2],
  [0xfa84, 0xfaa2],
  [0xfa8d, 0xfaa2],
  [0xfa96, 0xfaa2],
];

test("call tree edges pin e8+rel16 and consume zero RNG (no ECE0 target)", () => {
  assert.equal(CALL_EDGES.length, 74);
  for (const [site, target] of CALL_EDGES) {
    const off = site + LOAD;
    assert.equal(ki[off], 0xe8, `call opcode at ${site.toString(16)}`);
    const rel = ki.readInt16LE(off + 1);
    assert.equal(
      (site + 3 + rel) & 0xffff,
      target,
      `call target at ${site.toString(16)}`,
    );
    assert.notEqual(target, 0xece0, "message tree must not consume RNG");
  }
});

// 全树 41 条写指令白名单：VRAM/属性平面/命中平面/代码段显示局部/栈帧。
const WRITE_WHITELIST = [
  [0x01c1, "2ea3d501", "cs:[01D5] 鼠标包装参数"],
  [0x01c5, "2e8916d701", "cs:[01D7]"],
  [0x01ca, "2e891ed901", "cs:[01D9]"],
  [0x06b2, "a4", "062F/069A 字形blit es:di(VRAM)"],
  [0x06d2, "aa", "stosb VRAM"],
  [0x06e9, "aa", "06DE stosb VRAM"],
  [0x0705, "2ea31f07", "0701 自修改参数槽"],
  [0x0709, "2ea33607", "0701 自修改参数槽"],
  [0x070d, "2ea34d07", "0701 自修改参数槽"],
  [0x07f1, "88874608", "07D2 cs:[0846+] 颜色缓存"],
  [0x07fe, "883e4508", "07D2 cs:[0845] 轮转游标"],
  [0x0b1e, "8814", "0AD9 VRAM 像素写"],
  [0x0b2b, "8824", "0AD9 VRAM"],
  [0x0b36, "8834", "0AD9 VRAM"],
  [0x2230, "2ec6062d0d00", "222B cs:[0D2D] 等待局部"],
  [0x2261, "2ec6062d0d00", "222B cs:[0D2D]"],
  [0x226a, "2ec6062d0d00", "222B cs:[0D2D]"],
  [0x2270, "2ec6062c0d00", "222B cs:[0D2C]"],
  [0x8847, "2ec606a59808", "8810 cs:[98A5]=8 显示状态"],
  [0xd5f6, "800f10", "D5D4 属性平面"],
  [0xd5f9, "80277f", "D5D4 属性平面"],
  [0xd5fe, "8027ef", "D5D4 属性平面"],
  [0xd601, "800f60", "D5D4 属性平面"],
  [0xe403, "8804", "E3D7 命中平面"],
  [0xf252, "8807", "F1A3 VRAM 线/矩形"],
  [0xf25b, "882f", "F1A3 VRAM"],
  [0xf262, "8827", "F1A3 VRAM"],
  [0xf4e5, "894602", "F4DF 栈帧"],
  [0xf4e8, "894e04", "F4DF 栈帧"],
  [0xf4f5, "894600", "F4DF 栈帧"],
  [0xf763, "2ea3a1f7", "F75E cs:[F7A1] 光标局部"],
  [0xf780, "2e882ea3f7", "F75E cs:[F7A3]"],
  [0xf80f, "8825", "F7A4 VRAM 光标精灵"],
  [0xf814, "8805", "F7A4 VRAM"],
  [0xf819, "8815", "F7A4 VRAM"],
  [0xf862, "8825", "F7A4 VRAM"],
  [0xf867, "8805", "F7A4 VRAM"],
  [0xf86c, "8815", "F7A4 VRAM"],
  [0xfa29, "a4", "FA1B 字形blit"],
  [0xfab0, "a4", "FAA2 字形blit"],
  [0xfab4, "a4", "FAA2 字形blit"],
];

test("write whitelist: 41 writes, all display/input/local/stack, none rule state", () => {
  assert.equal(WRITE_WHITELIST.length, 41);
  for (const [va, hex, label] of WRITE_WHITELIST) {
    assert.equal(
      raw(va, hex.length / 2),
      hex,
      `write at ${va.toString(16)} (${label})`,
    );
  }
});
