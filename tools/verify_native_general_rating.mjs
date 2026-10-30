import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { processMonthlyGeneralRatings } from "../web/src/game/ai.js";
import { originalRefreshGeneralRatings55A6 } from "../web/src/game/navigation/originalgeneralrating.js";
import { performScenarioGeneralRatingRefresh } from "../web/src/game/navigation/scenariogeneralrating.js";

const originalScores = Uint8Array.from(
  Buffer.from(
    "11161b20252a2f34393e43484d52575c52575c61666b70757a7f84898e93988d93989da2a7acb1b6bbc0c5cacfd4c9ced4d9dee3e8edf2f7fc01060b10050a0f151a1f24292e33383d42474c41464b50565b60656a6f74797e83887d82878c91979ca1a6abb0b5babfc4b9bec3c8cdd2d8dde2e7ecf1f6fb00f5faff04090e13191e23282d32373c31363b40454a4f545a5f64696e73786d72777c81868b90959ba0a5aaafb4a9aeb3b8bdc2c7ccd1d6dce1e6ebf0e5eaeff4f9fe03080d12171d22272c21262b30353a3f44494e53585e63685d62676c71767b80858a8f94999fa4999ea3a8adb2b7bcc1c6cbd0d5dae0d5dadfe4e9eef3f8fd02070c11161b",
    "hex",
  ),
);

const inputs = (value) => ({
  siege: value >>> 4,
  field: (255 - value) >>> 4,
  naval: ((value * 17) & 255) >>> 4,
  force: value,
  lead: (value + 129) & 255,
});

test("55A6 production matches all 256 actual-instruction vectors and excludes G127", () => {
  assert.equal(originalScores.length, 256);
  for (let value = 0; value < 256; value++) {
    const records = Array.from({ length: 128 }, (_, slot) => ({
      attr: 0x7f,
      ability: inputs((value + slot) & 255),
      rating: 0xa5,
    }));
    records[0] = { attr: value, ability: inputs(value), rating: 0xa5 };
    records[126] = { attr: 0x80, ability: inputs(value), rating: 0xa5 };
    records[127] = { attr: 0xff, ability: inputs(value), rating: 0x5a };
    const writes = originalRefreshGeneralRatings55A6({
      readGeneralAttr: (slot) => records[slot].attr,
      readGeneralSpecialty: (slot, field) => records[slot].ability[field],
      readGeneralAbility: (slot, field) => records[slot].ability[field],
      writeGeneralRating(slot, rating) {
        records[slot].rating = rating;
      },
    });
    assert.equal(records[126].rating, originalScores[value], `G126 v${value}`);
    assert.equal(
      records[0].rating,
      value >= 0x80 ? originalScores[value] : 0xa5,
      `G0 v${value}`,
    );
    assert.equal(records[127].rating, 0x5a, `G127 v${value}`);
    assert.equal(writes.length, value >= 0x80 ? 2 : 1);
  }
});

test("55A6 full-byte arithmetic: all force/lead pairs and all specialty sums", () => {
  // Recheck the original leaf, not a document/test as authority. This is an
  // arithmetic equivalence test, NOT 3,014,656 CPU runs or editor admission.
  const ki = fs.readFileSync(new URL("../../Dragon/KI.EXE", import.meta.url));
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(ki.length, 67099);
  assert.equal(digest(ki), "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868");
  assert.equal(digest(ki.subarray(0x200 + 0x55a6, 0x200 + 0x55ec)), "02cdbf0d15bd8b42736fcf248f786d502a0a62d2d0de9b8068e684488915b293");
  const total = 256 * 256 * 46;
  let checked = 0;
  for (let base = 0; base < total; base += 127) {
    const count = Math.min(127, total - base);
    const writes = originalRefreshGeneralRatings55A6({
      readGeneralAttr: slot => slot < count ? 0x80 : 0x7f,
      readGeneralSpecialty(slot, field) {
        const sum = (base + slot) % 46;
        if (field === "siege") return Math.min(sum, 15);
        if (field === "field") return Math.min(Math.max(sum - 15, 0), 15);
        assert.equal(field, "naval"); return Math.max(sum - 30, 0);
      },
      readGeneralAbility(slot, field) {
        const pair = Math.floor((base + slot) / 46);
        if (field === "force") return pair >>> 8;
        assert.equal(field, "lead"); return pair & 255;
      },
      writeGeneralRating(slot, rating) {
        assert.equal(slot, checked - base);
        const index = base + slot, pair = Math.floor(index / 46);
        // Algebraic modulo equivalent of the checked SHR/ADD/SHL leaf.
        const expected = (index % 46 + 2 * (pair >>> 8) + 2 * (pair & 255)) % 256;
        assert.equal(rating, expected, `pair ${pair}, specialty sum ${index % 46}`);
        checked++;
      },
    });
    assert.equal(writes.length, count);
  }
  assert.equal(checked, 3014656);
});

test("55A6 all 4096 specialty triples reduce to their sum, without reading politics", () => {
  for (let packed = 0; packed < 4096; packed++) {
    const specialties = { siege: packed >>> 8, field: (packed >>> 4) & 15, naval: packed & 15 };
    const reads = [], output = [];
    originalRefreshGeneralRatings55A6({
      readGeneralAttr: slot => slot === 126 ? 0xff : 0,
      readGeneralSpecialty(slot, field) { assert.equal(slot, 126); reads.push(field); return specialties[field]; },
      readGeneralAbility(slot, field) { assert.equal(slot, 126); reads.push(field); if (field === "force") return 255; assert.equal(field, "lead"); return 128; },
      writeGeneralRating(slot, rating) { output.push({ slot, rating }); },
    });
    assert.deepEqual(reads, ["siege", "field", "naval", "force", "lead"]);
    assert.deepEqual(output, [{ slot: 126, rating: (specialties.siege + specialties.field + specialties.naval + 766) % 256 }]);
  }
});

test("official active Cao Cao and Dian Wei ratings refresh from stored abilities", () => {
  let data;
  try {
    data = JSON.parse(
      fs.readFileSync(new URL("../web/data.json", import.meta.url), "utf8"),
    );
  } catch (cause) {
    throw new Error("cannot load official rating fixture", { cause });
  }
  const sc = structuredClone(data.scenarios[16]);
  sc.generals[127].attr = 0xff;
  sc.generals[127].battle_rating = 0x5a;
  const writes = performScenarioGeneralRatingRefresh(sc);
  assert.equal(sc.generals[16].name.trim(), "曹操");
  assert.equal(sc.generals[16].battle_rating, 54);
  assert.equal(sc.generals[88].name.trim(), "典韋");
  assert.equal(sc.generals[88].battle_rating, 40);
  assert.equal(sc.generals[127].battle_rating, 0x5a);
  assert.equal(
    writes.some(({ slot }) => slot === 127),
    false,
  );
});

test("55A6 write failure retains earlier G1F prefix and enters strategic hold", () => {
  const generals = Array.from({ length: 128 }, (_, idx) => ({
    idx,
    attr: idx < 2 || idx === 127 ? 0x80 : 0,
    ability: { siege: 1, field: 2, naval: 3, force: 4, lead: 5 },
    battle_rating: 0x5a,
  }));
  delete generals[1].battle_rating;
  const app = {
    scenario: { generals, nativeLegionSlots: {} },
    clock: { hold: false },
  };
  assert.throws(() => processMonthlyGeneralRatings(app), /battle_rating/);
  assert.equal(generals[0].battle_rating, 24);
  assert.equal(Object.hasOwn(generals[1], "battle_rating"), false);
  assert.equal(generals[127].battle_rating, 0x5a);
  assert.equal(app.clock.hold, true);
  assert.ok(app._strategicBattleFailure?.error);
});
