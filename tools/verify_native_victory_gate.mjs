import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dispatchNativeUnificationGate } from "../web/src/game/ai.js";
import {
  countNativeAliveFactions,
  NATIVE_UNIFICATION_MONARCH_SELECTOR,
  NATIVE_UNIFICATION_TALK_INDEX,
  resolveNativeVictoryMonarch,
} from "../web/src/game/navigation/originalvictorygate.js";

const KI = readFileSync(new URL("../../Dragon/KI.EXE", import.meta.url));
const SINARIO = readFileSync(
  new URL("../../原版/SINARIO.DAT", import.meta.url),
);
// file offset = VA + 0x200
const raw = (va, len) =>
  KI.subarray(va + 0x200, va + 0x200 + len).toString("hex");

test("KI.EXE sha256 pinned", () => {
  assert.equal(
    createHash("sha256").update(KI).digest("hex").slice(0, 8),
    "fffeba98",
  );
});

test("byte pins: 1D0B D2A gate, 1D20 victory branch, 1CB1, 4FCE dec, 8CAE loads (P36)", () => {
  // 1D0B: cmp byte cs:[0x0D2A],1; je 1D20
  assert.ok(raw(0x1d0b, 0x20).startsWith("2e803e2a0d01740d"), "1D0B gate");
  // 1D20: call CDE; cx=0x4B; al=0x93; call 8810
  assert.ok(raw(0x1d0b, 0x55).includes("b94b00b093"), "TALK75 + AL=0x93");
  // ds=D52; call 87FF; cx=0x197; call 8810; al=2; call 1CB1
  assert.ok(raw(0x1d0b, 0x55).includes("8e1e520d"), "ds=D52");
  assert.ok(raw(0x1d0b, 0x55).includes("b99701"), "selector 0x197");
  assert.ok(raw(0x1d0b, 0x55).includes("b002e86bff"), "al=2 call 1CB1");
  // 1CB1: ss/sp <- cs:[9903]/cs:[9901], push ax, al=2 far exit
  assert.ok(
    raw(0x1cb1, 0x1f).startsWith("2e8e1603992e8b26019950b80200"),
    "1CB1 swap",
  );
  // 4FCE: monarch byte -> cs:[2919]; attr &= 0x7F; cmp bx,cs:[CFD];
  // player: al=1 call 1CB1 (no dec); else dec byte cs:[0xD2A]
  const w = raw(0x4fce, 0x32);
  assert.ok(w.startsWith("505351578a44012ea2192980277f2e"), "4FCE prefix");
  assert.ok(w.includes("2efe0e2a0d"), "4FE8 dec D2A");
  // 8CAE: bx=cs; si=0xCF0; di=0x3B; call E38C (0x3B-byte block incl. D2A)
  const init = raw(0x8cae, 0x52);
  assert.ok(init.includes("8ccbbef00cbf3b00e8bd56"), "8CAE statics block load");
  // then +0x80 → 0x5240 bytes → D52:0; +0x5240 → 0x400 bytes → D56:0
  assert.ok(init.includes("05800083d100"), "state block 0x5240 at +0x80");
  assert.ok(init.includes("05405283d100"), "event page 0x400 at +0x5240");
});

test("official SINARIO.DAT record[0x3A] alive-faction counts (P36)", () => {
  const stride = 0x56c0;
  assert.equal(SINARIO.length % stride, 0);
  const counts = [0x16, 0x0b, 0x06, 0x04];
  for (let chapter = 0; chapter < 4; chapter++)
    assert.equal(SINARIO[chapter * stride + 0x3a], counts[chapter]);
});

function makeScenario(aliveSlots, { pointerSlot = 0, monarchIndex = 5 } = {}) {
  const records = [];
  for (let slot = 0; slot < 22; slot++)
    records.push({
      idx: slot,
      attr: aliveSlots.includes(slot) ? 0x80 : 0,
      monarch_idx: slot === pointerSlot ? monarchIndex : null,
    });
  return {
    nativeFactionSlots: { version: 1, records },
    nativePlayerFactionPointer: pointerSlot * 0x40,
    generals: Array.from({ length: 8 }, (_, idx) => ({
      idx,
      name: `將${idx}`,
      talk_idx: idx,
    })),
  };
}

function makeApp(sc) {
  const messages = [];
  const endings = [];
  return {
    scenario: sc,
    messages,
    endings,
    gamebar: {
      enqueueTalkMessage(message) {
        messages.push(message);
      },
    },
    endView: {
      show(options) {
        endings.push(options);
      },
    },
  };
}

test("countNativeAliveFactions counts attr&0x80 slots", () => {
  const sc = makeScenario([0, 3, 7]);
  assert.equal(countNativeAliveFactions(sc), 3);
  assert.equal(countNativeAliveFactions(makeScenario([0])), 1);
  assert.equal(countNativeAliveFactions(makeScenario([])), 0);
  assert.throws(() => countNativeAliveFactions({}), /victory gate/);
});

test("resolveNativeVictoryMonarch follows 87FF pointer chain", () => {
  const sc = makeScenario([0], { pointerSlot: 2, monarchIndex: 5 });
  sc.nativePlayerFactionPointer = 2 * 0x40;
  sc.nativeFactionSlots.records[2].attr = 0x80;
  const monarch = resolveNativeVictoryMonarch(sc);
  assert.equal(monarch.idx, 5);
  assert.equal(monarch.talk_idx, 5);
  const broken = makeScenario([0]);
  delete broken.nativePlayerFactionPointer;
  assert.throws(() => resolveNativeVictoryMonarch(broken), /victory gate/);
});

test("1D20 victory branch fires once with TALK75 + monarch line + D7END sequence", () => {
  const sc = makeScenario([0], { pointerSlot: 0, monarchIndex: 5 });
  const app = makeApp(sc);
  assert.equal(dispatchNativeUnificationGate(app), true);
  assert.equal(sc.nativeUnificationShown, true);
  assert.equal(app.messages.length, 2);
  assert.equal(app.messages[0].talkIndex, NATIVE_UNIFICATION_TALK_INDEX);
  assert.equal(app.messages[0].gen, null);
  assert.equal(app.messages[1].gen.idx, 5);
  // selector 0x197 → 0x196 + (0x197-0x196)*8 + talk_idx = 414+5
  assert.equal(NATIVE_UNIFICATION_MONARCH_SELECTOR, 0x197);
  assert.equal(
    app.messages[1].talkIndex,
    0x196 + (NATIVE_UNIFICATION_MONARCH_SELECTOR - 0x196) * 8 + 5,
  );
  assert.equal(app.endings.length, 0);
  // 第二条关闭后才 1CB1(AL=2)→D7END：END_S1..12 循环序列
  app.messages[1].onClose();
  assert.equal(app.endings.length, 1);
  assert.equal(app.endings[0].sequence.length, 12);
  assert.equal(app.endings[0].sequence[0], "grf/end_s1.png");
  assert.equal(app.endings[0].sequence[11], "grf/end_s12.png");
  // 一次性：再次 tick 不重放
  assert.equal(dispatchNativeUnificationGate(app), false);
  assert.equal(app.messages.length, 2);
});

test("gate is inert while more than one faction alive or scenario not native", () => {
  const app = makeApp(makeScenario([0, 1]));
  assert.equal(dispatchNativeUnificationGate(app), false);
  assert.equal(app.messages.length, 0);
  const v1 = makeApp({ factions: [] });
  assert.equal(dispatchNativeUnificationGate(v1), false);
});

test("fail-closed: missing TALK/ending infra throws before the once-guard is set", () => {
  const sc = makeScenario([0]);
  const app = { scenario: sc };
  assert.throws(() => dispatchNativeUnificationGate(app), /TALK return/);
  assert.equal(sc.nativeUnificationShown, undefined);
});
