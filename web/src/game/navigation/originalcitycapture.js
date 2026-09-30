// KI 4CF3/4D63/4DF0/6A3D/4502, SHA-bound windows: legion-fate notes §11.
// Real applyBattleResult prefix, not a complete capture/graphics/message RET.
import { nativeLegionAt } from "../nativelegions.js";
import { scenarioNativeRoadContext } from "../scenarioassembly.js";
import { OriginalFateBoundaryError } from "./originallegionfate.js";

const stop = (at, detail) => {
  throw new OriginalFateBoundaryError(at, detail);
};
function own(record, field, max, at, nullable = false) {
  if (!record || !Object.hasOwn(record, field)) stop(at, `missing ${field}`);
  const value = nullable && record[field] === null ? 255 : record[field];
  if (!Number.isInteger(value) || value < 0 || value > max)
    stop(at, `invalid ${field}`);
  return value;
}
function cityAt(sc, index, at) {
  if (index < 0 || index >= 192 || sc.cities?.[index]?.idx !== index)
    stop(at, `city address ${index}`);
  return sc.cities[index];
}
function factionAt(sc, owner, at) {
  const matches = sc.factions?.filter((f) => f?.idx === owner);
  if (owner >= 24 || matches?.length !== 1) stop(at, `faction alias ${owner}`);
  return matches[0];
}
const ownerByte = (city, at) => {
  // Existing Scenario null city owner is the explicit neutral18, not FF.
  if (Object.hasOwn(city, "faction") && city.faction === null) return 0x18;
  return own(city, "faction", 255, at);
};

function capital6A3D(sc, owner) {
  let selected = -1,
    type = 255,
    production = 0,
    preferred = false;
  for (let index = 0; index < 192; index++) {
    const city = cityAt(sc, index, "6A50");
    if (ownerByte(city, "6A50") !== owner) continue;
    const candidateType = own(city, "type", 15, "6A55");
    if (type < candidateType) continue;
    const candidateProduction = own(city, "prod", 65535, "6A5F");
    if (production > candidateProduction) continue;
    if (!preferred) {
      type = own(city, "type", 15, "6A68");
      production = own(city, "prod", 65535, "6A6E");
      selected = index;
    }
    if (own(city, "attr", 255, "6A73") & 0x1f) continue;
    preferred = true;
    type = own(city, "type", 15, "6A7A");
    production = own(city, "prod", 65535, "6A80");
    selected = index;
  }
  return selected;
}

function retarget4502(sc, owner, oldCapital, newCapital) {
  for (let slot = 0; slot < 127; slot++) {
    const legion = nativeLegionAt(sc, slot, "451F");
    if (own(legion, "faction", 255, "451F") !== owner) continue;
    if (own(legion, "status", 255, "4524") < 0x80) continue;
    if (own(legion, "targetCity", 255, "4529") !== oldCapital) continue;
    legion.targetCity = newCapital; //452E precedes the independent word read.
    const targetWord = own(legion, "targetNode", 191, "4531") * 8;
    if (targetWord !== newCapital * 8) continue;
    legion.targetNode = oldCapital; //4536; NOT old->new.
    legion.status = own(legion, "status", 255, "4539") | 2;
  }
}

function capital4DF0(sc, city, owner) {
  const faction = factionAt(sc, owner, "4DFE");
  const oldCapital = own(faction, "capital", 255, "4DFE", true);
  if (city.idx !== oldCapital) return false; //4E4B CLC, even F23==0.
  const selected = capital6A3D(sc, owner);
  if (selected < 0) {
    faction.capital = null; //4E50, then4E54 (failure keeps the capital write).
    faction.attr = own(faction, "attr", 255, "4E54") & 0x7f;
    return true; //4E57 STC; no inferred extinction from storedF23.
  }
  faction.capital = selected; //4E1B XCHG; AL=new, AH=old to4502.
  retarget4502(sc, owner, oldCapital, selected);
  if (owner * 64 === own(sc, "nativePlayerFactionPointer", 65535, "4E2B"))
    stop("4E3A", "CE7/TALK30/5E60 capital message return");
  return false;
}

// D44-relative canonical domain: ES=(Y-2)*24 paragraphs; BX arithmetic is
// independently u16. Segment-base wrap/aliases are not a Web terrain plane.
// Exported for A-MAP-2 write-order tests (same body production calls).
export function paint8A1E(sc, city) {
  const y = own(city, "y", 65535, "8A1F");
  let bx = (own(city, "x", 65535, "8A38") + 0x300) & 65535;
  const terrain = scenarioNativeRoadContext(sc)?.terrain;
  function read(at) {
    if (y < 2 || y > 255 || !terrain) stop(at, "terrain memory/segment alias");
    try {
      return terrain.readByte((y - 2) * 384 + bx);
    } catch (cause) {
      throw new OriginalFateBoundaryError(at, cause.message);
    }
  }
  function write(value, at) {
    try {
      terrain.writeByte((y - 2) * 384 + bx, value);
    } catch (cause) {
      throw new OriginalFateBoundaryError(at, cause.message);
    }
  }
  const tile = read("8A3F");
  let value = (Math.floor(((tile - 0xcb) & 255) / 3) * 3 + 0xcb) & 255;
  const owner = ownerByte(city, "8A4E");
  if (owner === 0x18) value = (value + 2) & 255;
  else if (owner !== own(sc, "player_faction", 255, "8A5A"))
    value = (value + 1) & 255;
  write(value, "8A63");
  const currentOwner = ownerByte(city, "8A68");
  const highlight =
    currentOwner === own(sc, "player_faction", 255, "8A6B") ? 10 : 0;
  const type = own(city, "type", 15, "8A74");
  // Corner BX walks per city type (admission §2.3): metropolis (±2,±2),
  // checkpoint orthogonal-adjacent, others (±1,±1). Table lookup, no branch.
  const CORNER_DELTAS = {
    0: [-0x302, 4, 0x600, -4],
    3: [-0x180, 0x17f, 2, 0x17f],
  };
  const deltas = CORNER_DELTAS[type] ?? [-0x181, 2, 0x300, -2];
  for (const delta of deltas) {
    bx = (bx + delta) & 65535;
    const corner = read("8AD1");
    if (corner < 0xde || corner >= 0xf2) continue;
    write(0xde + ((corner - 0xde) % 10) + highlight, "8AE6");
  }
}

function neighbour(city, index, at) {
  if (
    !Object.hasOwn(city, "strategicNeighbours") ||
    !Array.isArray(city.strategicNeighbours) ||
    !Object.hasOwn(city.strategicNeighbours, index)
  )
    stop(at, `missing strategicNeighbours[${index}]`);
  return own(city.strategicNeighbours, index, 255, at);
}
function borders88CC(sc, city) {
  const owner = ownerByte(city, "88E0"); // AL survives all four890A calls.
  let dl = 1;
  for (let index = 0; index < 4; index++) {
    const next = neighbour(city, index, "88EB");
    if (next === 255) continue; //88F0 bypasses88FD: no DL shift.
    const other = cityAt(sc, next, "8915");
    let dh = 1,
      reverse = 0;
    for (; reverse < 4; reverse++, dh <<= 1)
      if (neighbour(other, reverse, "8915") === city.idx) break;
    //891E returns only890A;88FD still advances DL and the outer loop.
    if (reverse < 4) {
      const same = owner === ownerByte(other, "891F");
      function update(record, bit, testAt, countAt, attrAt) {
        const set = (own(record, "attr", 255, testAt) & bit) !== 0;
        if (set === !same) return;
        record.strategicBorderCount =
          (own(record, "strategicBorderCount", 255, countAt) +
            (same ? -1 : 1)) &
          255;
        const attr = own(record, "attr", 255, attrAt);
        record.attr = same ? attr & (255 ^ bit) : attr | bit;
      }
      update(
        other,
        dh,
        same ? "893D" : "8925",
        same ? "8943" : "892B",
        same ? "8949" : "892F",
      );
      update(
        city,
        dl,
        same ? "894F" : "8933",
        same ? "8953" : "8937",
        same ? "8958" : "893A",
      );
    }
    dl <<= 1;
  }
}

/** AL captor, SI city, original BP references retained by caller closure.
 * PUSHF/POPF preserves4DF0 CF across4DA4, never consumes the retreat's CF.
 * Only the explicit map/neighbor/display-off domain returns; failures keep writes.
 * extinctionScan(deadOwner, captor, hooks) continues past4D1E when provided;
 * without it the historic4D1E stop stays. hooks carries the deferred 4D2A
 * captureTail for scan lambdas that suspend the diplomat sequence (P55-C09-2b).
 * The scan itself still stops at5042; when it does and
 * onExtinctionBlock(deadOwner, captor, captureTail) is provided, the 4D2A tail
 * is deferred: the handler owns the TALK36 FIFO entry (5045..504A) and, on
 * message close, the 504D..5073 resume followed by the tail (5073 ret to
 * 4D1E+3). Without the handler the historic5042 hold stays.
 * extraBlocks.onGovernorBlock(governorCtx, governorTail) (P55-C09-2a) owns the
 * 4D86 CE7/TALK68/1A6 sequence: the 4D6F XCHG and 4D7E G17 clear are already
 * committed, and governorTail runs the 4D0A DEC onward on sequence close.
 * Without it the historic4D86 hold stays. Scan results "diplomat-suspended",
 * "extinction-suspended", "governor-suspended" and "player-defeated" all
 * skip the inline tail; anything else falls through to it (historic shape).
 */
export function captureOriginalCity(
  sc,
  city,
  captor,
  retreatGarrison,
  extinctionScan,
  onExtinctionBlock,
  extraBlocks,
) {
  if (cityAt(sc, own(city, "idx", 191, "4CF5"), "4CF5") !== city)
    stop("4CF5", "unique SI city");
  if (!Number.isInteger(captor) || captor < 0 || captor > 255)
    stop("4CF3", "AL captor byte");
  const oldOwner = ownerByte(city, "4CF5");
  city.faction = captor === 0x18 ? null : captor;
  city._strategicLastFaction = oldOwner; //4CF8 C1A, existing sole field.
  // 4D2A tail (= 5073 ret to 4D1E+3): captor F23++, 8A1E repaint, 88CC
  // borders, 4D33 display gate. Runs inline on the plain path and deferred
  // (as captureTail) on the suspend paths. 4D62 RET, no diplomatic tail.
  const runInlineTail = () => {
    const taker = factionAt(sc, captor, "4D2A");
    taker.n_cities = (own(taker, "n_cities", 255, "4D2A") + 1) & 255;
    paint8A1E(sc, city); //4D2D; actual terrain writes before any88CC reads.
    borders88CC(sc, city); //4D30.
    if (own(sc, "nativeFateDisplayFlags", 255, "4D33") & 4)
      stop("4D41", "5CA4/9656/5CE0/95C9/5C58 display return");
    return "captured-4D62"; //4D62 RET;4B49 jumps to4B56, no diplomatic tail.
  };
  // 4D0A DEC onward: old F23--, 4DF0 new-capital search, 4DA4 garrison
  // retreat, then the 4D1E extinction branch. Shared by the inline path and
  // the governor resume tail (the 4D86 messages sit strictly between the
  // 4D6F/4D7E writes above and this rest).
  const runPrefixRest = () => {
    const faction = factionAt(sc, oldOwner, "4D0A");
    faction.n_cities = (own(faction, "n_cities", 255, "4D0A") - 1) & 255;
    const capitalCarry = capital4DF0(sc, city, oldOwner);
    retreatGarrison(); //4D11/4D18: caller retains original BP, including inactive.
    if (!capitalCarry) return runInlineTail();
    if (typeof extinctionScan !== "function")
      stop("4D1E", "4FCE extinction return");
    // 4D2A tail runs only after the 4FCE resume returns (5073 ret to
    // 4D1E+3). Defer it when the scan blocks at a message gate.
    const captureTail = runInlineTail;
    const hooks = { captureTail };
    try {
      // 4D1E: BX dead record, AL captor.
      const scanResult = extinctionScan(oldOwner, captor, hooks);
      if (scanResult === "diplomat-suspended") return scanResult;
      if (scanResult === "player-defeated") return scanResult;
      // A normally-returning scan falls through to the inline tail
      // (historic shape; unreachable per the unconditional 5042).
      return runInlineTail();
    } catch (error) {
      // 5042: scan prefix (5074/4236/127-dispatch) committed; DOS enters
      // CDE/TALK36 here (5045..504A). Without a block handler the historic
      // hold stays; with one the caller owns the FIFO-close resume + tail.
      if (
        error?.instruction !== "5042" ||
        typeof onExtinctionBlock !== "function"
      )
        throw error;
      onExtinctionBlock(oldOwner, captor, captureTail);
      return "extinction-suspended";
    }
  };
  if (oldOwner !== 0x18) {
    if (own(city, "governor", 255, "4D63", true) !== 255) {
      const governor = own(city, "governor", 255, "4D6F", true);
      city.governor = null; //4D6F XCHG before the general pointer is consumed.
      if (governor >= 128 || sc.generals?.[governor]?.idx !== governor)
        stop("4D7E", "governor general alias");
      sc.generals[governor].status = 0;
      const governorTail = () => runPrefixRest();
      if (typeof extraBlocks?.onGovernorBlock === "function") {
        extraBlocks.onGovernorBlock(
          { governor, cityIdx: own(city, "idx", 191, "4CF5") },
          governorTail,
        );
        return "governor-suspended";
      }
      stop("4D86", "CE7/TALK68/1A6 governor message return");
    }
    return runPrefixRest();
  }
  return runInlineTail();
}
