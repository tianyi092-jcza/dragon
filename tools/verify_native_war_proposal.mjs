import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  originalAssistanceProposalVerdict66D9,
  originalHostileProposalVerdict6475,
  originalProposalRequiredReasons3C1E,
  originalStrengthCompare6A28,
  originalTruceProposalVerdict6577,
} from "../web/src/game/navigation/originalwarproposal.js";

const KI = readFileSync(new URL("../../Dragon/KI.EXE", import.meta.url));
// file offset = VA + 0x200
const raw = (va, len) =>
  KI.subarray(va + 0x200, va + 0x200 + len).toString("hex");

test("KI.EXE sha256 pinned", () => {
  assert.equal(
    createHash("sha256").update(KI).digest("hex").slice(0, 8),
    "fffeba98",
  );
});

test("byte pins: verdict functions 6475/6577/66D9, strength 6A28, trust grade 3C1E (P35)", () => {
  assert.ok(
    raw(0x6475, 0x14).startsWith("535156572e8b36fd0c8bfbb0018bd7d1e2d1e2"),
  );
  // 6475 verdict0 gate: (rel-0x80) >= b*2+0x14 -> al=0
  assert.ok(raw(0x6475, 0x7c).includes("2c807304b003"), "at-war reject");
  assert.ok(
    raw(0x6475, 0x7c).includes("8a6428d0e480c4143ac4720432c0"),
    "verdict0 gate",
  );
  // 6577: peace reject 3c80 7204 b003; threshold b>>1: 8a6428 d0ec 3ac4 7304 32c0
  assert.ok(raw(0x6577, 0x78).includes("3c807204b003"), "peace reject");
  assert.ok(
    raw(0x6577, 0x78).includes("8a6428d0ec3ac4730432c0"),
    "verdict0 gate half bellicosity",
  );
  // 66D9: R==A -> 3b7e02 7504 b004; threshold b*4+0x1e |0x80
  assert.ok(
    raw(0x66d9, 0x40).includes("3b7e027504b004"),
    "same faction verdict4",
  );
  assert.ok(
    raw(0x66d9, 0x40).includes("d0e7d0e780c71e80cf80"),
    "ally threshold",
  );
  // 6A28: cx=[di+23]*25; ax=[si+23]*([si+28]+0x14)
  assert.ok(
    raw(0x6a28, 0x16).startsWith("8a4523b419f6e48bc88a44238a642880c414f6e4c3"),
  );
  // 3C1E trust grades
  assert.ok(raw(0x3c1e, 0x20).includes("80fae07310"), "grade E0");
  assert.ok(raw(0x3c1e, 0x20).includes("80fa907309"), "grade 90");
  assert.ok(raw(0x3c1e, 0x20).includes("80fa207302b404"), "grade 20");
  // 65EF diplomat gate: cmp [bx+2A],FF / TALK55 (cx=0x37)
  assert.ok(
    raw(0x65ef, 0x20).includes("807f2aff7402f8c3"),
    "envoy null passes",
  );
  assert.ok(raw(0x65ef, 0x20).includes("b93700"), "TALK55");
  // 6605/676F ring duplicate gates: al=6/al=7, TALK73/74 (cx=0x49/0x4A)
  assert.ok(
    raw(0x6605, 0x24).includes("b006baffff") &&
      raw(0x6605, 0x24).includes("b94900"),
    "type6 dup gate",
  );
  assert.ok(
    raw(0x676f, 0x1c).includes("b007baffff") &&
      raw(0x676f, 0x1c).includes("b94a00"),
    "type7 dup gate",
  );
});

test("3C1E required reasons thresholds", () => {
  assert.equal(originalProposalRequiredReasons3C1E(0xe0), 1);
  assert.equal(originalProposalRequiredReasons3C1E(0xff), 1);
  assert.equal(originalProposalRequiredReasons3C1E(0x90), 2);
  assert.equal(originalProposalRequiredReasons3C1E(0xdf), 2);
  assert.equal(originalProposalRequiredReasons3C1E(0x20), 3);
  assert.equal(originalProposalRequiredReasons3C1E(0x8f), 3);
  assert.equal(originalProposalRequiredReasons3C1E(0x1f), 4);
  assert.equal(originalProposalRequiredReasons3C1E(0), 4);
  assert.throws(() => originalProposalRequiredReasons3C1E(0x100), /3C1E trust/);
});

test("6A28 strength compare", () => {
  // my: 4 cities, bellicosity 10 -> 4*30=120; enemy: 3 cities -> 75
  assert.deepEqual(
    originalStrengthCompare6A28({ cities: 4, bellicosity: 10 }, { cities: 3 }),
    { mine: 120, other: 75 },
  );
  assert.ok(
    originalStrengthCompare6A28({ cities: 1, bellicosity: 0 }, { cities: 10 })
      .mine < 250,
  );
});

test("6475 hostile verdict branches", () => {
  const base = {
    bellicosity: 20,
    relationByte: 0x80 | 10,
    pendingType1OnTarget: false,
    targetAttackingFaction: null,
    targetMoneyWord: 1000,
    weStronger: true,
    playerIndex: 3,
  };
  // pending type1 [1,player,target] -> 1
  assert.equal(
    originalHostileProposalVerdict6475({ ...base, pendingType1OnTarget: true })
      .al,
    1,
  );
  // at war (rel<0x80) -> 3
  assert.equal(
    originalHostileProposalVerdict6475({ ...base, relationByte: 0x7f }).al,
    3,
  );
  // (rel&0x7f) >= b*2+0x14=60 -> 0
  assert.equal(
    originalHostileProposalVerdict6475({ ...base, relationByte: 0x80 | 60 }).al,
    0,
  );
  assert.equal(
    originalHostileProposalVerdict6475({ ...base, relationByte: 0x80 | 59 }).al,
    2,
  );
  // low7 < b*2+0x14 -> al=2 with reason bitmap
  const v = originalHostileProposalVerdict6475({
    ...base,
    relationByte: 0x80 | 20,
  });
  assert.equal(v.al, 2);
  assert.deepEqual(v.reasons, [1, 1, 0, 0]); // r0: 10<20+15; r1: weStronger
  // r2: target attacking someone else; r3: target money negative
  const v2 = originalHostileProposalVerdict6475({
    ...base,
    relationByte: 0x80 | 5,
    targetAttackingFaction: 9,
    targetMoneyWord: -1,
    weStronger: false,
  });
  assert.equal(v2.al, 2);
  assert.deepEqual(v2.reasons, [1, 0, 1, 1]);
  // r2 false when target attacks the player (CFF)
  const v3 = originalHostileProposalVerdict6475({
    ...base,
    relationByte: 0x80 | 5,
    targetAttackingFaction: 3,
  });
  assert.equal(v3.reasons[2], 0);
});

test("6577 truce verdict branches", () => {
  const base = {
    bellicosity: 20,
    targetAttackingFaction: null,
    playerIndex: 0,
    weWeaker: false,
    anotherFactionTargetsMe: false,
    playerMoneyWord: 1000,
  };
  // peace -> 3
  assert.equal(
    originalTruceProposalVerdict6577({ ...base, relationByte: 0x80 }).al,
    3,
  );
  // (rel&0x7f) < b>>1=10 -> 0
  assert.equal(
    originalTruceProposalVerdict6577({ ...base, relationByte: 5 }).al,
    0,
  );
  // al=2 bitmap
  const v = originalTruceProposalVerdict6577({ ...base, relationByte: 30 });
  assert.equal(v.al, 2);
  assert.deepEqual(v.reasons, [0, 0, 0, 0]);
  const v2 = originalTruceProposalVerdict6577({
    ...base,
    relationByte: 30,
    weWeaker: true,
    anotherFactionTargetsMe: true,
    targetAttackingFaction: 9,
    playerMoneyWord: -1,
  });
  assert.deepEqual(v2.reasons, [1, 1, 1, 1]);
  // r2 false when target attacks the player
  const v3 = originalTruceProposalVerdict6577({
    ...base,
    relationByte: 30,
    targetAttackingFaction: 0,
  });
  assert.equal(v3.reasons[2], 0);
});

test("66D9 assistance verdict branches", () => {
  const base = {
    bellicosity: 10,
    allyIndex: 2,
    targetIndex: 1,
    relationToAllyByte: 0xc6,
    relationToTargetByte: 0x10,
    targetAttackingMe: true,
    myForce: 300,
    targetForce: 100,
    allyStrongerThanMe: false,
    targetStrongerThanMe: false,
  };
  // R==A -> 4
  assert.equal(
    originalAssistanceProposalVerdict66D9({ ...base, targetIndex: 2 }).al,
    4,
  );
  // threshold: ((10*4+0x1e)&0x7f)|0x80 = 0xC6; relAlly<0xC6 -> 0
  assert.equal(
    originalAssistanceProposalVerdict66D9({ ...base, relationToAllyByte: 0xc5 })
      .al,
    0,
  );
  // not at war with target -> 3
  assert.equal(
    originalAssistanceProposalVerdict66D9({
      ...base,
      relationToTargetByte: 0x80,
    }).al,
    3,
  );
  // target attacks me and myForce < floor(targetForce/2) -> 1
  assert.equal(
    originalAssistanceProposalVerdict66D9({
      ...base,
      myForce: 40,
      targetForce: 100,
    }).al,
    1,
  );
  // al=2 bitmap: r0 threshold = (0xC6+0x1e)&0xff = 0xE4; relAlly 0xE5 -> r0=1
  const v = originalAssistanceProposalVerdict66D9({
    ...base,
    relationToAllyByte: 0xe5,
    myForce: 300,
    targetForce: 100,
  });
  assert.equal(v.al, 2);
  assert.deepEqual(v.reasons, [1, 0, 0, 1]);
  // byte-wrap boundary: b=50 -> (200+30)=0xE6,&0x7f=0x66,|0x80=0xE6; r0 base (0xE6+0x1e)&0xff=0x04
  const v2 = originalAssistanceProposalVerdict66D9({
    ...base,
    bellicosity: 50,
    relationToAllyByte: 0xe6,
    targetAttackingMe: false,
  });
  assert.equal(v2.al, 2);
  assert.deepEqual(v2.reasons, [1, 0, 0, 0]);
  // b=50, relAlly 0xE5 < 0xE6 -> 0
  assert.equal(
    originalAssistanceProposalVerdict66D9({
      ...base,
      bellicosity: 50,
      relationToAllyByte: 0xe5,
    }).al,
    0,
  );
});

test("strict input validation", () => {
  assert.throws(
    () =>
      originalHostileProposalVerdict6475({
        bellicosity: 20,
        pendingType1OnTarget: false,
        relationByte: -1,
        targetAttackingFaction: null,
        targetMoneyWord: 0,
        weStronger: false,
        playerIndex: 0,
      }),
    /6475 relation/,
  );
  assert.throws(
    () =>
      originalTruceProposalVerdict6577({
        bellicosity: 20,
        relationByte: 300,
        targetAttackingFaction: null,
        playerIndex: 0,
        weWeaker: false,
        anotherFactionTargetsMe: false,
        playerMoneyWord: 0,
      }),
    /6577 relation/,
  );
});
