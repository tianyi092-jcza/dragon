// KI 28BF→4ADE / 4ED7 / 4F8A / 4FC8. Evidence: fate notes §14/§15.
// Synchronous call-local globals/BP; exceptions retain writes, never fake RET.
import { createScenarioBattleIO } from "./originalfieldterrain.js";
import { resolveOriginalSiegeQuickBattle } from "./originalfieldbattle.js";
import { nativeLegionAt, rebindNativeLegionViews } from "../nativelegions.js";
import { captureOriginalCity } from "./originalcitycapture.js";
import { retreatOriginalGarrison } from "./originalroadretreat.js";
import { performScenarioLegionFate, performScenarioExtinction4FCE, performScenarioExtinctionPlayerGate } from "./scenariolegionfate.js";

function stop(at, detail) {
  const error = new RangeError(
    `Web engineering Uncovered native siege ${detail} at ${at}`,
  );
  error.instruction = at;
  throw error;
}

/** 4F8A writes only the listed slot127 fields, preserving all other residue. */
export function buildOriginalSiegeDefender(io, city) {
  const owner = io.readCityByte(city, 1, "4F8F");
  io.prepareTemporaryDefender("4F92");
  io.writeLegionByte("defender", 1, owner, "4F92");
  io.writeLegionByte("defender", 2, 127, "4F95");
  io.writeLegionByte("defender", 6, 255, "4F99");
  const total = io.readCityByte(city, 0x13, "4F9D");
  io.writeLegionWord("defender", 4, total, "4FA2");
  const quotient = Math.floor(total / 6);
  let remainder = total % 6;
  for (let i = 0; i < 6; i++) {
    io.writeTeamTroops("defender", i, quotient, "4FAD");
    io.writeTeamType("defender", i, 3, "4FB0");
    if (remainder) {
      remainder--;
      const old = io.readTeamTroops("defender", i, "4FBA");
      io.writeTeamTroops("defender", i, (old + 1) & 255, "4FBA");
    }
  }
}

/** Detached-chain extinction scan factory (P55-C09-2d): the movement-driven
 * siege has no attached battle flow, so message routing comes from the
 * caller-threaded blocks. Without blocks every gate keeps its historic hold:
 * 4FE5 (no onPlayerDead), 509E (no diplomat handler), 4D86 (no governor
 * handler, wired by the caller through capture's extraBlocks). The blocks
 * shape is { onDiplomatBlock(deadOwner, diplomat, diplomatTail, captureTail),
 * onGovernorBlock(governorCtx, governorTail), onPlayerDead(deadOwner) };
 * hooks (with captureTail) arrive per scan call from captureOriginalCity. */
export function createDetachedExtinctionScan(sc, context, blocks) {
  return (deadOwner, newOwner, hooks) => {
    // 4FD9..4FDC player gate first (F00 committed even on the exit path).
    if (performScenarioExtinctionPlayerGate(sc, deadOwner, context)) {
      if (typeof blocks?.onPlayerDead === "function") {
        blocks.onPlayerDead(deadOwner);
        return "player-defeated";
      }
      // Else fall through: the orchestrator re-clears F00 (idempotent) and
      // fires the historic 4FE5 hold itself (single stop site, boundary class).
    }
    return performScenarioExtinction4FCE(
      sc,
      deadOwner,
      newOwner,
      context,
      blocks?.onDiplomatBlock
        ? (suspendedOwner, diplomat, diplomatTail) =>
            blocks.onDiplomatBlock(
              suspendedOwner,
              diplomat,
              diplomatTail,
              hooks?.captureTail,
            )
        : undefined,
    );
  };
}
/** Stop at the first unclosed message CALL, not after fabricated UI returns. */
export function dispatchOriginalSiegeBattle(io, city, defender) {
  const player = io.readPlayer("4ED9");
  if (io.readLegionByte("attacker", 1, "4EDD") === player) {
    if (!(io.readLegionByte("attacker", 0, "4F2B") & 4) && defender !== 0x4200)
      stop("4F36", "CDE/TALK28/tactical return");
  } else if (io.readCityByte(city, 1, "4EE2") === player) {
    if (defender === 0x4200) {
      const result = resolveOriginalSiegeQuickBattle(io);
      if ((result.ax & 255) === 0)
        stop("4F06", "4F71/TALK26 before city capture");
      return result;
    }
    if (!(io.readLegionByte("defender", 0, "4F0B") & 4))
      stop("4F13", "4F58/TALK27/tactical return");
  }
  return resolveOriginalSiegeQuickBattle(io); // no tactical 4F51 occupancy DEC
}

export function performOriginalSiegeEntry(io, city) {
  io.writeLegionByte(
    "attacker",
    0,
    io.readLegionByte("attacker", 0, "4AEC") & 0xdf,
    "4AEC",
  );
  io.writeLegionByte("attacker", 3, 0, "4AEF");
  io.writeGlobal("d32", city, "4AF3");
  io.writeGlobal("d34", (((city - 0x840) << 3) & 65535) >>> 8, "4B03");
  io.writeGlobal("d35", 0, "4B08");
  const x = io.readCityWord(city, 8, "4B0E");
  const y = io.readCityWord(city, 10, "4B11");
  const owner = io.readCityByte(city, 1, "4B14");
  const selection = io.selectDefenders(owner, y, x);
  if (selection.cf) buildOriginalSiegeDefender(io, city);
  else io.selectDefender(selection.bx, "4B1C"); // BX binding, NOT a D status/03 write
  const result = io.dispatchSiege(city, selection.bx);
  const lost = result.ax & 255;
  const failed = result.ax >>> 8;
  if (selection.cf) io.writeLegionByte("defender", 0, 0, "4FC9");
  if (!lost) {
    if (!selection.cf && failed & 2)
      io.fate("defender", io.readLegionByte("attacker", 1, "4B28"), "4B2D");
    io.captureCity(city, io.readLegionByte("attacker", 1, "4B41"), "4B46");
  } else if (failed & 1) {
    io.fate("attacker", io.readCityByte(city, 1, "4B50"), "4B53");
  }
  return "siege-battle"; //4B56 restores frame;28C2 CLC suppresses candidate commit
}

export function performScenarioSiegeEntry(
  sc,
  attacker,
  cityIndex,
  context,
  rng,
  blocks,
) {
  const { io, prefix, call } = createScenarioBattleIO(
    sc,
    attacker,
    null,
    context,
    rng,
  );
  function cityAt(pointer, at) {
    const index = (pointer - 0x840) / 32;
    const city =
      Number.isInteger(index) &&
      index >= 0 &&
      index < 192 &&
      sc.cities?.[index];
    if (!city || city.idx !== index) stop(at, "city address/identity");
    return city;
  }
  function own(record, key, max, at) {
    if (!record || !Object.hasOwn(record, key)) stop(at, `missing ${key}`);
    const value =
      key === "faction" && record[key] === null ? 0x18 : record[key];
    if (!Number.isInteger(value) || value < 0 || value > max)
      stop(at, `invalid ${key}`);
    return value;
  }
  const fields = { 1: "faction", 16: "growth", 17: "defence", 19: "troops" };
  io.readCityByte = (pointer, offset, at) =>
    own(cityAt(pointer, at), fields[offset], 255, at);
  io.writeCityByte = (pointer, offset, value, at) => {
    cityAt(pointer, at)[fields[offset]] = value;
  };
  io.readCityWord = (pointer, offset, at) =>
    own(cityAt(pointer, at), offset === 8 ? "x" : "y", 65535, at);
  const writeLegionByte = io.writeLegionByte;
  io.writeLegionByte = (role, offset, value, at) => {
    writeLegionByte(role, offset, value, at);
    if (at === "4FC9") rebindNativeLegionViews(sc); // projection, never delete slot127
  };
  io.prepareTemporaryDefender = (at) => {
    nativeLegionAt(sc, 127, at, true); // establish only writable storage, no defaults
    io.selectDefender(0x4200, at);
  };
  io.dispatchSiege = (city, defender) => {
    const result = dispatchOriginalSiegeBattle(io, city, defender);
    call.battleResult = result;
    return result;
  };
  io.captureCity = (pointer, captor, at) => {
    const city = cityAt(pointer, at);
    const detachedScan = createDetachedExtinctionScan(sc, context, blocks);
    captureOriginalCity(
      sc,
      city,
      captor,
      () => {
        const count = own(prefix.bpWords, 0xfe, 127, "4D11");
        if (!count) return;
        const receiver = io.readCityByte(pointer, 1, "4DA7");
        const defenders = Array.from({ length: count }, (_, i) => {
          const p = own(prefix.bpWords, i * 2, 65535, "4DAA/4DC6");
          return nativeLegionAt(sc, (p - 0x2240) / 64, "4DAA/4DC6");
        });
        retreatOriginalGarrison(sc, defenders, context, (record) =>
          performScenarioLegionFate(sc, record, context, "291A", receiver, rng),
        );
      },
      detachedScan,
      undefined,
      blocks?.onGovernorBlock
        ? { onGovernorBlock: blocks.onGovernorBlock }
        : undefined,
    );
  };
  try {
    if (!Number.isInteger(cityIndex) || cityIndex < 0 || cityIndex >= 192)
      stop("28BB", "city pointer alias");
    call.cityPointer = 0x840 + cityIndex * 32;
    return performOriginalSiegeEntry(io, call.cityPointer);
  } catch (error) {
    error.nativeSiegePrefix = prefix;
    error.nativeSiegeCall = call;
    throw error;
  }
}
