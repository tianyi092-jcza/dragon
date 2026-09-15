// KI 3F74..4235 / 4269..42AA. Static instruction contract and explicit
// named-state coverage: re-notes-march-pathfinding.md#native-city-callers.
import { readOriginalCityCache as readStoredCityCache } from "./originalroadarrival.js";
import { createOriginalLegion } from "./originalformation.js";
import { nativeLegionAt, rebindNativeLegionViews } from "../nativelegions.js";

function readOriginalCityCache(context, index, at) {
  try {
    return readStoredCityCache(context, index, at);
  } catch (cause) {
    throw new RangeError(
      `Web engineering Uncovered city cache ${index} at ${at}`,
      { cause },
    );
  }
}

function stop(at) {
  throw new RangeError(`Web engineering Uncovered ${at}`);
}
function unsigned(value, max, at) {
  if (!Number.isInteger(value) || value < 0 || value > max) stop(at);
  return value;
}
const byte = (value, at) => unsigned(value, 255, at);
const word = (value, at) => unsigned(value, 65535, at);
const encodedByte = (value, at) => (value === null ? 255 : byte(value, at));
function random(rng, at) {
  if (typeof rng?.nextByte !== "function") stop(`canonical RNG at ${at}`);
  return byte(rng.nextByte(), `RNG byte at ${at}`);
}
function factionAt(sc, owner, at) {
  const faction =
    owner < 24 && sc.factions?.find((item) => item?.idx === owner);
  if (!faction) stop(`faction ${owner} at ${at}`);
  return faction;
}
function cityOwner(sc, context, index, at) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 192 ||
    sc.cities?.[index]?.idx !== index
  )
    stop(`city ${index} at ${at}`);
  return context.readCityOwnerByte(0x841 + index * 32);
}
function generalAt(sc, index, at) {
  if (index >= 128 || !sc.generals?.[index]) stop(`general ${index} at ${at}`);
  return sc.generals[index];
}

// 4575 owns the quota once; each 45C1 rescans the 127 original general slots.
function requestFormation(sc, context, faction, target, amount) {
  const funds = Object.hasOwn(faction, "gold") ? faction.gold : faction.money;
  if (!Number.isInteger(funds) || funds < -0x800000 || funds > 0x7fffff)
    stop("signed24 funds at 4579");
  const high = (funds >> 8) & 0xffff;
  const signed = (high << 16) >> 16;
  const quota = signed <= 160 ? 5 : ((high << 3) & 0xffff) >>> 8;
  const remaining = quota - byte(faction.n_legions, "F14 at 458C");
  if (remaining <= 0) return false;
  let count = Math.min(byte(amount, "CL at 4594"), remaining),
    created = 0;
  do {
    let best = 0,
      selected = -1;
    for (let index = 0; index < 127; index++) {
      const general = generalAt(sc, index, "45CE");
      if (encodedByte(general.faction, "G1C at 45CE") !== faction.idx) continue;
      if (byte(general.status, "G17 at 45D3") !== 0) continue;
      const force = byte(general.ability?.force, "G11 at 45D9");
      if (force > best) {
        best = force;
        selected = index;
      }
    }
    if (selected < 0) break;
    const result = createOriginalLegion(sc, context, selected);
    if (result.cf) break;
    created++;
    result.record.targetCity = target;
    result.record.commandState = 0;
    rebindNativeLegionViews(sc);
    count = (count - 1) & 255;
  } while (count !== 0);
  return created !== 0;
}

function requestReinforcement(sc, context, city, amount) {
  if (byte(city._aiCooldown, "C17 at 40C9") !== 0) return;
  const player = byte(sc.player_faction, "player at 40D2");
  if (player === cityOwner(sc, context, city.idx, "40D7"))
    stop("CDE/8810 at 40E6");
  const faction = factionAt(
    sc,
    cityOwner(sc, context, city.idx, "410B"),
    "4117",
  );
  if (!requestFormation(sc, context, faction, city.idx, amount)) return;
  const capital = encodedByte(faction.capital, "F03 at 411C");
  const x = word(city.x, "request X at 4127");
  const cap = sc.cities?.[capital];
  if (capital >= 192 || cap?.idx !== capital) stop("capital city at 412B");
  const dx = Math.abs(x - word(cap.x, "capital X at 412B"));
  const y = word(city.y, "request Y at 4133");
  const dy = Math.abs(y - word(cap.x, "capital X at 4137"));
  city._aiCooldown = Math.min(30, ((dx + dy) & 65535) >>> 3);
}
function recordRequest(sc, context, city) {
  factionAt(
    sc,
    cityOwner(sc, context, city.idx, "40B3"),
    "40C5",
  ).strategic_city_primary = city.idx;
}

function dispatch(sc, city, target, count, rng) {
  let remainingSkips = (count - 1) & 255;
  for (let slot = 0; ; slot++) {
    // No active filter or faction gate. 4160 reads 0E even in an empty slot.
    if (slot >= 128) stop(`fixed slot ${slot} L0E at 4160`);
    const legion = nativeLegionAt(sc, slot, "L0E at 4160");
    if (word(legion.roadEdgeOrNode, "L0E at 4160") !== city.idx * 8) continue;
    if (byte(legion.status, "L00 at 4165") < 0x80) continue;
    if (remainingSkips && random(rng, "416E") < 0x40) {
      remainingSkips--;
      continue;
    }
    if (
      byte(legion.status, "L00 at 4179") & 4 &&
      byte(legion.commandState, "L23 at 417E") < 8
    ) {
      legion.targetCity = target; // 4184, then 4187; no target14/bit1/0B write.
      legion.commandState = 0;
    }
    return; // DL=1; ineligible non-skipped matching slots also consume it.
  }
}

/** 3F74 normal military return only; 3EFD prefix and 4194 belong to caller. */
export function runOriginalCityMilitary(sc, context, city, rng) {
  if (cityOwner(sc, context, city.idx, "3F50") === 0x18) return "returned";
  const work = new Uint8Array(16).fill(255);
  let threat = 0,
    bp = 0;
  if (byte(city.strategicBorderCount, "C1B at 3FAB") !== 0) {
    const owner = cityOwner(sc, context, city.idx, "3FB3");
    const target = encodedByte(
      factionAt(sc, owner, "3FBF").target_faction,
      "F19 at 3FBF",
    );
    for (let index = 0; index < 4; index++) {
      const neighbour = byte(
        city.strategicNeighbours?.[index],
        "C1C neighbour at 3FD4",
      );
      if (neighbour === 255) break;
      const otherOwner = cityOwner(sc, context, neighbour, "3FE4");
      if (otherOwner === owner) continue;
      if (otherOwner !== 0x18) {
        if (
          byte(sc.diplomacy?.[owner]?.[otherOwner], "relation at 3FF4") >= 0x80
        )
          continue;
        work[bp] = 254;
        threat =
          (threat + readOriginalCityCache(context, neighbour, "3FFF")) & 255;
      }
      if (otherOwner !== target) continue;
      work[bp] = neighbour;
      work[bp + 1] = cityOwner(sc, context, neighbour, "400C");
      work[bp + 2] =
        (readOriginalCityCache(context, neighbour, "4013") + 1) & 255;
      bp += 4;
    }
  }
  city.strategicThreat = threat; // 3F92 only after complete 3FA9 RET.
  city.attr = byte(city.attr, "C00 at 4028") & 0x3f;
  if (work[0] === 255) {
    city._aiCooldown = 0;
    return "returned";
  }
  city.attr |= work[0] === 254 ? 0x80 : 0xc0;
  if (readOriginalCityCache(context, city.idx, "4044") < 1) {
    requestReinforcement(sc, context, city, 1);
    recordRequest(sc, context, city);
    return "returned";
  }
  if (work[0] >= 254) return "returned";
  let al = random(rng, "405D") & 3,
    di = 0;
  for (;;) {
    if (di >= 16) stop("SS:[BP+10h] at 4064");
    if (work[di] >= 254) {
      di = 0;
      continue;
    }
    al = (al - 1) & 255;
    if (al === 0) break;
    di += 4;
  }
  if (readOriginalCityCache(context, city.idx, "4073") <= 1) {
    const amount = (byte(city.strategicThreat, "C14 at 407A") + 2) & 255;
    const local = readOriginalCityCache(context, city.idx, "4080");
    if (amount <= local) return "returned";
    if (
      byte(sc.player_faction, "player at 4086") ===
      cityOwner(sc, context, city.idx, "408B")
    )
      return "returned";
    requestReinforcement(sc, context, city, amount - local);
    recordRequest(sc, context, city);
  } else {
    dispatch(
      sc,
      city,
      work[di],
      readOriginalCityCache(context, city.idx, "40A6"),
      rng,
    );
    city._aiCooldown = 0;
  }
  return "returned";
}

/** 4194 exact byte arithmetic and lazy reads; mutations/RNG are immediate. */
export function governOriginalCity(sc, context, city, rng) {
  let cl = 8,
    dl = 4;
  if (
    byte(sc.player_faction, "player at 4198") ===
    cityOwner(sc, context, city.idx, "419C")
  ) {
    cl = 5;
    dl = 1;
    const governor = encodedByte(city.governor, "C19 at 41A6");
    if (governor !== 255) {
      const general = generalAt(sc, governor, "41B7");
      const budget = byte(general.assignment_budget, "G1A at 41B7");
      if (budget !== 0) {
        general.assignment_budget = budget - 1;
        cl = (cl + byte(general.ability?.politics, "G13 at 41C2")) & 255;
        dl = ((dl + byte(general.ability?.force, "G11 at 41C6")) & 255) >>> 1;
      }
    }
  }
  let ch = cl > 15 ? cl - 15 : 1;
  if ((random(rng, "41D5") & 15) <= cl)
    city.growth = Math.min(200, (byte(city.growth, "C10 at 41DE") + ch) & 255);
  if ((random(rng, "41EE") & 15) <= cl) {
    const defence = byte(city.defence, "C11 at 41F7");
    ch = (ch >>> 1) + 1;
    city.defence = Math.min(200, (defence + ch) & 255);
  }
  const cap = byte(city.troops_cap, "C12 at 420B"),
    troops = byte(city.troops, "C13 at 420B");
  if (troops >= cap) city.troops = cap;
  else if (random(rng, "4213") < 0x18) {
    city.growth = Math.max(0, byte(city.growth, "C10 at 421A") - dl);
    city.troops = Math.min(cap, Math.min(255, troops + dl));
  }
}

/** 4269 does not consume RNG or clear persistent C15. */
export function damageOriginalCity(city) {
  const strength = byte(city.disaster_event, "C15 at 426A");
  const defence = byte(city.defence, "C11 at 426E");
  if (defence >= strength) {
    city.defence = defence - strength;
    return;
  }
  city.defence = 0;
  const damage = strength - defence;
  city.growth = Math.max(0, byte(city.growth, "C10 at 4284") - damage);
  const prod = word(city.prod, "C0F at 428F / C0E at 4297");
  city.prod = (prod - ((damage * (prod >>> 8)) >>> 2)) & 0xffff;
  city.troops = Math.max(0, byte(city.troops, "C13 at 429E") - (damage >>> 1));
}
