// Raw KI.EXE B413/B240/B3B2/CC31/B8AA boundary fixtures, no save I/O.
import assert from "node:assert/strict";
import fs from "node:fs";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
import { ORIGINAL_OBJECT as O } from "../web/src/game/battle/originalstate.js";
import { ORIGINAL_EFFECT as E, spawnOriginalAttackEffect } from "../web/src/game/battle/originaleffects.js";
import { updateOriginalAttackEffects } from "../web/src/game/battle/originaleffectframe.js";
import { commitOriginalSpatialOccupancy } from "../web/src/game/battle/originalmovement.js";
import { reviveOriginalBattleObject, updateOriginalInactiveObject, updateOriginalActiveObject } from "../web/src/game/battle/originalobjectframe.js";
import { executeOriginalChild } from "../web/src/game/battle/originalexecutor.js";
import { canonicalOriginalBattlePacket, compareOriginalBattlePackets } from "../web/src/game/battle/originaldiff.js";
import { createOriginalPathBuilder } from "../web/src/game/battle/originalpathfinder.js";
import { createFieldBattle } from "../web/src/game/tacticalbattle.js";

const json = (name) => {
  try {
    return JSON.parse(
      fs.readFileSync(new URL(`../web/${name}.json`, import.meta.url), "utf8"),
    );
  } catch (error) {
    throw new Error(`cannot parse ${name}.json`, { cause: error });
  }
};
const navigation = json("battle_navigation");
// CAEB/CB59..CB71: independently compare the entire exported descriptor tables.
const mdl = fs.readFileSync(new URL("../../Dragon/BATTLE.MDL", import.meta.url));
for (let layout = 0; layout < 3; layout++) {
  const offset = 0x1000 + layout * 0xf800;
  assert.deepEqual(navigation.layouts[layout].attributes, [...mdl.subarray(offset, offset + 0x800)]);
}
function object(s, a, { current = 1, pending = 1, height = 0, pointer = 0x514 } = {}) {
  for (const [field, value] of [[O.FLAGS, 0x80], [O.HP, 180], [O.ANCHOR_X, 20], [O.ANCHOR_Y, 20],
    [O.PREVIOUS_X, 19], [O.PREVIOUS_Y, 18], [O.LEVEL, 3], [O.PREVIOUS_LEVEL, 2],
    [O.HEIGHT, height], [O.PREVIOUS_HEIGHT, height], [O.CURRENT_COMMAND, current], [O.PENDING_COMMAND, pending]])
    s.pool.write8(a, field, value);
  s.pool.write16(a, O.SPATIAL_0C, pointer);
  s.pool.write16(a, O.SPATIAL_0E, pointer);
}
function reserves(s, side, group, remaining) {
  s.temps.write8(side, 8 + group * 4 + 1, remaining);
  s.temps.write16(side, 4, remaining);
  s.temps.write8(side, 6, 93);
}
// B490..B4A7 sequential normalization for every legal command pair on both sides.
for (const side of [0, 1]) for (let current = 0; current <= 8; current++) for (let pending = 0; pending <= 8; pending++) {
  const s = new OriginalBattleSession(), a = side * 0x600 + 0x20;
  object(s, a, { current, pending }); s.pool.write8(a, O.FLAGS, 0x50);
  s.pool.write8(a, O.KIND, 9); s.pool.write8(a, O.STATE, 0x19);
  s.pool.write8(a, O.STATUS_TIME, 0x77); s.pool.write16(a, O.TIMER, 0x1234);
  reserves(s, side, 0, 1);
  const result = reviveOriginalBattleObject(s.pool, s.temps, s.spatial, s.registers, a);
  const restored = pending === 5 ? current : pending;
  assert.equal(s.pool.read8(a, O.PENDING_COMMAND), restored === 6 ? 3 : restored === 7 ? 0 : restored);
  assert.equal(s.pool.read8(a, O.CURRENT_COMMAND), 8);
  assert.equal(result.revived, true); assert.equal(result.display.frame, side ? 90 : 0);
  assert.equal(s.pool.read8(a, O.STATE), 1); assert.equal(s.pool.read8(a, O.FLAGS), 0x98);
  assert.equal(s.pool.read8(a, O.KIND), 0); assert.equal(s.pool.read8(a, O.HP), 93);
  assert.equal(s.pool.read8(a, O.STATUS_TIME), 0x77); assert.equal(s.pool.read16(a, O.TIMER), 0x1234);
  assert.equal(s.temps.read16(side, 4), 0); assert.equal(s.rng.calls, 0);
}
// B437/B445: empty or own retreat -> player leader icon5 ONLY; no other writes.
for (const side of [0, 1]) for (let group = 0; group < 6; group++) for (const slot of [0, 1, 7]) {
  for (const [remaining, winner] of [[0, 0], [1, side + 1]]) {
    const s = new OriginalBattleSession(), a = side * 0x600 + group * 0x100 + slot * 0x20;
    object(s, a); s.pool.write8(a, O.FLAGS, 0); reserves(s, side, group, remaining);
    s.registers.winnerState = winner;
    const before = s.snapshot();
    const r = reviveOriginalBattleObject(s.pool, s.temps, s.spatial, s.registers, a);
    assert.equal(r.statusIcon, side === 0 && slot === 0 ? 5 : null);
    assert.deepEqual(s.pool.snapshot(), before.objectBytes); assert.deepEqual(s.temps.snapshot(), before.tempBytes);
    assert.deepEqual(s.spatial.snapshot().spatialBytes, before.spatialBytes); assert.equal(s.rng.calls, 0);
  }
}
// B4EA runs even on blocked entry: clamps XY/pointers/height, but not +1F or reserves.
for (const side of [0, 1]) for (const y of [0, 16, 47, 255]) for (const plane of [0, 0x1000]) {
  const s = new OriginalBattleSession(), a = side * 0x600 + 0x20;
  object(s, a, { height: 0x10 }); s.pool.write8(a, O.FLAGS, 0); s.pool.write8(a, O.ANCHOR_Y, y);
  reserves(s, side, 0, 2);
  const index = Math.max(16, Math.min(47, y)) * 64 + (side ? 62 : 1);
  s.spatial.write8(index + plane, 1);
  const r = reviveOriginalBattleObject(s.pool, s.temps, s.spatial, s.registers, a);
  assert.equal(r.reason, "occupied"); assert.equal(r.statusIcon, undefined);
  assert.equal(s.pool.read16(a, O.SPATIAL_0E), index); assert.equal(s.pool.read8(a, O.HEIGHT), 0);
  assert.equal(s.pool.read8(a, O.PREVIOUS_HEIGHT), 0x10); assert.equal(s.temps.read16(side, 4), 2);
  assert.equal(s.pool.read8(a, O.STATE), 0); assert.equal(s.rng.calls, 0);
}
// Actual ADC8 status-icon consumer and deep snapshot, without issuing pending5.
{
  const s = new OriginalBattleSession({ objectsInitialized: true, registers: { mode: 1 } });
  object(s, 0); object(s, 0x600); const seen = [];
  s.tick({ updateObject() {}, objectHandlers: { leaderHandlers: { refresh: e => seen.push(e) } } });
  assert.deepEqual(s.playerGroupStatusIcons, [0, 5, 5, 5, 5, 5]);
  assert.deepEqual(seen.map(e => e.address), [0x100, 0x200, 0x300, 0x400, 0x500]);
  assert.equal(s.pool.read8(0x100, O.PENDING_COMMAND), 0);
  const snap = s.snapshot(), twin = new OriginalBattleSession().restore(snap);
  twin.playerGroupStatusIcons[1] = 2; assert.equal(snap.playerGroupStatusIcons[1], 5);
  assert.equal(s.playerGroupStatusIcons[1], 5); assert.equal(s.rng.calls, 0);
}
// B2AB/B2CB old/new selection must ignore pointer layer and preserve other planes.
for (const previousHeight of [0, 0x10]) for (const height of [0, 0x10]) {
  const s = new OriginalBattleSession(), a = 0x620;
  object(s, a, { height, pointer: 0x2356 }); s.pool.write16(a, O.SPATIAL_0E, 0x4123);
  s.pool.write8(a, O.PREVIOUS_HEIGHT, previousHeight); s.pool.write8(a, O.STATE, 8);
  s.pool.write8(a, O.FLAGS, 0xc0);
  s.spatial.bytes.fill(0x33, 0x7000, 0xb000);
  s.spatial.write8(0x4123, 0xff); s.spatial.write8(0x5123, 0xfe);
  s.spatial.write8(0x2356, 0x80); s.spatial.write8(0x3356, 0x80);
  const beforeRng = s.rng.snapshot();
  commitOriginalSpatialOccupancy(s.pool, s.spatial, a);
  assert.equal(s.spatial.read8(0x9000 + (previousHeight << 8) + 0x123), 0);
  assert.equal(s.spatial.read8(0x9000 + ((previousHeight ^ 0x10) << 8) + 0x123), 0x33);
  assert.equal(s.spatial.read8(0x9000 + (height << 8) + 0x356), 8);
  assert.equal(s.spatial.read8(0x7000 + 0x356), 0x33);
  assert.equal(s.spatial.read8(0x8000 + 0x356), 0x33);
  assert.equal(s.spatial.read8(0x4123), 0x80); assert.equal(s.spatial.read8(0x5123), 0x80);
  assert.equal(s.spatial.read8(0x2356), 0xb2); assert.equal(s.spatial.read8(0x3356), 0xb2);
  assert.equal(s.pool.read8(a, O.PREVIOUS_HEIGHT), height);
  assert.equal(s.pool.read8(a, O.PREVIOUS_LEVEL), 3);
  assert.equal(s.pool.read8(a, O.FLAGS), 0xc0); assert.equal(s.pool.read8(a, O.STATE), 8, "utility cannot toggle");
  const tail = updateOriginalActiveObject(s, a);
  assert.equal(tail.display.frame, 98); assert.equal(s.pool.read8(a, O.STATE), 9);
  assert.equal(s.pool.read8(a, O.FLAGS), 0x80); assert.deepEqual(s.rng.snapshot(), beforeRng);
}
// EF/F0/F8 x attr3/4 x incoming bit02; actual AB39 downstream command branch.
for (const tile of [0xef, 0xf0, 0xf8]) for (const attr of [3, 4]) for (const incoming of [0, 2]) {
  const s = new OriginalBattleSession(), a = 0x20;
  object(s, a, { height: 0x10, current: 3, pending: 3 });
  s.pool.write8(a, O.FLAGS, 0x80 | incoming);
  s.spatial.writeTile(0x514, tile); s.spatial.tileAttributes = new Uint8Array(0x800);
  s.spatial.tileAttributes[tile * 8] = attr;
  s.spatial.write8(0x7514, 4); s.spatial.write8(0x8514, 3); // deliberately disagree with MDL
  commitOriginalSpatialOccupancy(s.pool, s.spatial, a);
  const special = tile < 0xf0 && attr >= 4;
  assert.equal(s.pool.read8(a, O.FLAGS) & 2, special ? 2 : 0);
  executeOriginalChild(s.pool, a, {});
  assert.equal(s.pool.read8(a, O.PENDING_COMMAND), special ? 6 : 3);
  assert.equal(s.rng.calls, 0);
}
// B3B2 current +1E, not +1F; death countdown doesn't erase before KIND0.
for (const creditSurvivor of [false, true]) {
  const s = new OriginalBattleSession(), a = 0x20;
  object(s, a, { height: 0x10, pointer: 0x2514 }); s.pool.write8(a, O.PREVIOUS_HEIGHT, 0);
  s.spatial.write8(0xa514, 8); s.spatial.write8(0x9514, 37);
  s.spatial.write8(0x2514, 0x82); s.spatial.write8(0x3514, 2);
  s.objectDisplays[1] = { address: a, x: 19, y: 18, level: 2, frame: 84 };
  if (!creditSurvivor) {
    s.pool.write8(a, O.FLAGS, 0x11); s.pool.write8(a, O.KIND, 2);
    updateOriginalInactiveObject(s.pool, s.temps, s.spatial, s.registers, a);
    assert.equal(s.spatial.read8(0xa514), 8);
  }
  s.finalizeObject(a, { creditSurvivor });
  assert.equal(s.spatial.read8(0xa514), 0); assert.equal(s.spatial.read8(0x9514), 37);
  assert.equal(s.spatial.read8(0x2514), 0x80); assert.equal(s.spatial.read8(0x3514), 0);
  assert.equal(s.temps.read8(0, 11), creditSurvivor ? 1 : 0); assert.equal(s.objectDisplays[1], null);
  reserves(s, 0, 0, 1);
  const r = reviveOriginalBattleObject(s.pool, s.temps, s.spatial, s.registers, a);
  assert.equal(r.revived, true); assert.equal(s.spatial.read8(0x9501), 8);
  assert.equal(s.pool.read8(a, O.STATE), 1); assert.equal(s.rng.calls, 0);
}
// AE04→B4B8(AH1) final death visit erases current-height surcharge exactly once.
{
  const s = new OriginalBattleSession(), a = 0x620;
  object(s, a, { pointer: 0x1fff, height: 0x10 });
  s.pool.write8(a, O.FLAGS, 0x11); s.pool.write8(a, O.KIND, 1);
  s.spatial.writePathSurcharge(0x6fff, 0x10, 8);
  s.spatial.writePathSurcharge(0x6fff, 0, 9);
  let clears = 0;
  const write = s.spatial.writePathSurcharge.bind(s.spatial);
  s.spatial.writePathSurcharge = (...args) => { clears++; return write(...args); };
  const r = updateOriginalInactiveObject(s.pool, s.temps, s.spatial, s.registers, a);
  assert.equal(r.finalized, true); assert.equal(clears, 1);
  assert.equal(s.spatial.read8(0xafff), 0); assert.equal(s.spatial.read8(0x9fff), 9);
  assert.equal(s.temps.read8(1, 11), 0); assert.equal(s.pool.read8(a, O.STATE), 0);
  assert.equal(s.rng.calls, 0);
}
// Production facade owns a LIVE D2FC view, not exported navigation's initial copy.
{
  const maps = json("battle_maps"); maps.navigation = navigation;
  maps.formationVectors = json("battle_rules").formationVectors;
  const sc = { player_faction: 0, generals: [0, 1].map(idx => ({ idx, name: String(idx), battle_formation: 0, ability: { force: 80, lead: 70, field: 5 } })) };
  const legion = faction => ({ generalIdx: faction, leader: String(faction), faction, morale: 200, troops: 100,
    units: [{ type: 1, troops: 1000 }, ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 }))] });
  const battle = createFieldBattle(sc, legion(0), legion(1), maps, { directoryIndex: 0xc0 });
  const s = battle.session, rng = s.rng.snapshot();
  s.spatial.bytes.fill(0, 0x7000);
  for (const plane of [0, 0x1000]) for (let x = 1; x <= 4; x++)
    s.spatial.write8(0x7000 + plane + 64 + x, (x > 1 ? 0x10 : 0) | (x < 4 ? 0x20 : 0));
  const request = layer => ({ current: 0x0101, target: 0x0104, layer, mask: layer ? 0x74 : 0xeb, endpointPolicy: layer ? 0 : 1 });
  assert.equal(battle.originalPathBuilder(request(0)).distance, 5);
  assert.equal(battle.originalPathBuilder(request(0x10)).distance, 5);
  object(s, 0x20, { pointer: 0x2043, height: 0x10 });
  commitOriginalSpatialOccupancy(s.pool, s.spatial, 0x20);
  assert.deepEqual(battle.originalPathBuilder(request(0x10)), {
    carry: false, words: [0x0103, 0x0104], distance: 13, visited: 4,
  }); // Not merely a distance check: AED2 must accept the weighted route.
  assert.equal(battle.originalPathBuilder(request(0)).distance, 5);
  const snapshot = s.snapshot();
  assert.equal(snapshot.spatialBytes.length, 0xb000);
  const twin = new OriginalBattleSession().restore(snapshot), twinBuilder = createOriginalPathBuilder(twin.spatial.navigationBytes());
  assert.equal(twinBuilder(request(0x10)).distance, 13);
  s.finalizeObject(0x20); assert.equal(battle.originalPathBuilder(request(0x10)).distance, 5);
  assert.equal(twinBuilder(request(0x10)).distance, 13); assert.equal(snapshot.spatialBytes[0xa043], 8);
  s.restore(snapshot); assert.equal(battle.originalPathBuilder(request(0x10)).distance, 13);
  const full = canonicalOriginalBattlePacket(s, { full: true });
  assert.equal(full.blobs.spatial.length, 0xb000);
  twin.spatial.write8(0xa043, 7);
  const difference = compareOriginalBattlePackets(full, canonicalOriginalBattlePacket(twin, { full: true }));
  assert.deepEqual(difference.differences.find(d => d.key === "spatial").firstByte, { index: 0xa043, expected: 8, actual: 7 });
  const legacy = { ...snapshot, spatialBytes: snapshot.spatialBytes.slice(0, 0xa000) };
  s.restore(legacy); assert.equal(s.spatial.read8(0xa043), 0);
  assert.equal(battle.originalPathBuilder(request(0x10)).distance, 5);
  commitOriginalSpatialOccupancy(s.pool, s.spatial, 0x20);
  assert.equal(battle.originalPathBuilder(request(0x10)).distance, 13);
  assert.deepEqual(s.rng.snapshot(), rng);
}
// B8AA offsets/layer: independent literal expectations then B97E first-contact.
for (const side of [0, 1]) for (const dir of [0, 1, 2, 3, 0x80, 0x81, 0x82, 0x83]) for (const level of [0, 2, 4]) {
  const s = new OriginalBattleSession(), source = side * 0x600 + 0x20, target = (side ^ 1) * 0x600 + 0x20;
  object(s, source); object(s, target); s.pool.write8(source, O.LEVEL, level);
  s.pool.write8(target, O.CLASS, 0x12); s.pool.write8(target, O.HP, 100);
  const close = dir >= 0x80, d = dir & 3;
  const x = 20 + (close && d === 0 ? -1 : close && d === 2 ? 1 : 0);
  const y = 20 + (close && d === 1 ? -1 : close && d === 3 ? 1 : 0);
  const pointer = (level + 1) * 0x1000 + y * 64 + x;
  const r = spawnOriginalAttackEffect(s.pool, s.effects, source, { parameter: close ? 0xff00 : 0, direction: dir, effectClass: 0x20, code: 0x214 });
  assert.equal(s.effects.read16(r.address, E.ANCHOR_X), x << 8);
  assert.equal(s.effects.read16(r.address, E.ANCHOR_Y), y << 8);
  assert.equal(s.effects.read16(r.address, E.LEVEL), (level + 1) << 8);
  assert.equal(s.effects.read16(r.address, E.POSITION_X), pointer);
  assert.equal(s.effects.read16(r.address, E.PREVIOUS_SPATIAL), pointer);
  const before = s.effects.snapshot();
  assert.equal(spawnOriginalAttackEffect(s.pool, s.effects, source + 0x200, { parameter: 0, direction: 0, effectClass: 1, code: 0 }).spawned, false);
  assert.deepEqual(s.effects.snapshot(), before, "aliased busy slot unchanged");
  s.spatial.write8(pointer, (target >> 5) + 1); s.spatial.write8(y * 64 + x, 0x80);
  const erased = [];
  const [frame] = updateOriginalAttackEffects(s.pool, s.effects, s.spatial, { render: { erase: e => erased.push(e) } });
  assert.equal(frame.contact.target, target); assert.equal(s.pool.read8(target, O.HP), 68);
  assert.deepEqual(erased, [{ address: r.address, x, y, level: level + 1 }]);
  assert.equal(s.effects.read8(r.address, E.FLAGS), 0); assert.equal(s.rng.calls, 0);
}
// B8EC/B910 byte wrap, B91D byte increment, B935 ADD (not bitwise OR).
for (const [direction, x, y, level, ex, ey, el, pointer] of [
  [0x80, 0, 20, 2, 255, 20, 3, 0x35ff],
  [0x83, 20, 255, 0xff, 20, 0, 0, 0x14],
  [2, 255, 255, 0x0f, 255, 255, 16, 0x40bf],
]) {
  const s = new OriginalBattleSession();
  s.pool.write8(0, O.ANCHOR_X, x); s.pool.write8(0, O.ANCHOR_Y, y); s.pool.write8(0, O.LEVEL, level);
  const r = spawnOriginalAttackEffect(s.pool, s.effects, 0, { parameter: 0, direction, effectClass: 32, code: 0x214 });
  assert.equal(s.effects.read16(r.address, E.ANCHOR_X), ex << 8);
  assert.equal(s.effects.read16(r.address, E.ANCHOR_Y), ey << 8);
  assert.equal(s.effects.read16(r.address, E.LEVEL), el << 8);
  assert.equal(s.effects.read16(r.address, E.POSITION_X), pointer);
}
console.log("battle occupancy OK: raw MDL, B413 normalization/icons, B240/B3B2 two-plane surcharges/terrain, live facade/restore/diff, B8AA first contact; BD46 reverse/vertical differential and queued consumption covered by verify_battle_original_bd46*.mjs");
