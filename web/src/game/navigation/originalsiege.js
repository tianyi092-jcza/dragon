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
/** Stop at the first unclosed message CALL, not after fabricated UI returns.
 * 4F06 is the single wired exception: with io.suspendSiegeWarning (installed
 * by performScenarioSiegeEntry from caller blocks) the attacker-won verdict
 * against a player city with only the 0x4200 temporary defender returns a
 * suspension verdict instead of stopping; the entry suspends TALK26 and
 * resumes into the deferred capture. Without the channel the historic stop
 * stays (bare-leaf contract, pinned by unit tests).
 * 4F36/4F13 player-tactical branches likewise return suspension descriptors
 * (converted by the entry layer to blocks.onTacticalBattle, historic stop
 * without it); quick-battle callers never see a descriptor. */
export function dispatchOriginalSiegeBattle(io, city, defender) {
  const player = io.readPlayer("4ED9");
  if (io.readLegionByte("attacker", 1, "4EDD") === player) {
    if (!(io.readLegionByte("attacker", 0, "4F2B") & 4) && defender !== 0x4200)
      // 4F36→CDE，随后CX=1C→4F58（TALK28）；返回才写D2E/D30并进1B5A。
      return {
        suspended: "tactical-suspended",
        kind: "siege-attack",
        talk: 28,
        at: "4F36",
        detail: "CDE/TALK28/tactical return",
      };
  } else if (io.readCityByte(city, 1, "4EE2") === player) {
    if (defender === 0x4200) {
      const result = resolveOriginalSiegeQuickBattle(io);
      // 4F06→4F71：攻胜先发警告/TALK26（CX=1Ah），关闭后才回外层易主
      // （消息审计§3.1）。裁决由入口挂起，通道缺失则历史stop。
      if ((result.ax & 255) === 0) {
        if (typeof io.suspendSiegeWarning === "function")
          return { suspended: "siege-warning-26", result, city, defender };
        stop("4F06", "4F71/TALK26 before city capture");
      }
      return result;
    }
    if (!(io.readLegionByte("defender", 0, "4F0B") & 4))
      // 4F13→4F58（TALK27，CX=1B，4F58内一次0CDE）；返回才进1B5A。
      return {
        suspended: "tactical-suspended",
        kind: "siege-defence",
        talk: 27,
        at: "4F13",
        detail: "4F58/TALK27/tactical return",
      };
  }
  return resolveOriginalSiegeQuickBattle(io); // no tactical 4F51 occupancy DEC
}

export function performOriginalSiegeEntry(io, city, resolveTacticalSides = null) {
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
  const dispatchOut = io.dispatchSiege(city, selection.bx);
  // 4F06裁决挂起：4B3A清临时军与4B41易主都在消息关闭后（原窗4F06→4F71→
  // 返回→4B3A→4B41），不得在挂起前执行；续跑闭包带完整后半段。
  if (dispatchOut?.suspended === "siege-warning-26")
    return io.suspendSiegeWarning(dispatchOut, () =>
      finishOriginalSiegeEntry(io, city, selection, dispatchOut.result),
    );
  // 4F36/4F13战术挂起：开场TALK28/27后进战术引擎，退出裁决ax由resume带回
  // 跑完整后半段（去向/易主）；通道缺失则入口层历史stop（裸叶合同）。
  if (dispatchOut?.suspended === "tactical-suspended") {
    if (typeof resolveTacticalSides !== "function")
      stop(dispatchOut.at, "tactical sides resolver");
    return io.suspendTacticalBattle(
      dispatchOut,
      (verdict) => finishOriginalSiegeEntry(io, city, selection, verdict),
      resolveTacticalSides(),
    );
  }
  return finishOriginalSiegeEntry(io, city, selection, dispatchOut);
}

/** 4B3A→4FC8清临时军、4B41→4CF3易主及攻方去向。正常路径直跑；4F06挂起
 * 路径由 resume 在 TALK26 关闭后调用。返回 capture 的原样字符串：
 * "captured-4D62" 为正常结束，各 "*-suspended" 由调用泵让出批处理，
 * "player-defeated" 沿历史形状落回外层（终局模态自带计时hold）。 */
function finishOriginalSiegeEntry(io, city, selection, result) {
  const lost = result.ax & 255;
  const failed = result.ax >>> 8;
  if (selection.cf) io.writeLegionByte("defender", 0, 0, "4FC9");
  if (!lost) {
    if (!selection.cf && failed & 2)
      io.fate("defender", io.readLegionByte("attacker", 1, "4B28"), "4B2D");
    const capOut = io.captureCity(
      city,
      io.readLegionByte("attacker", 1, "4B41"),
      "4B46",
    );
    if (typeof capOut === "string" && capOut !== "captured-4D62")
      return capOut;
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
    undefined,
    undefined,
    blocks,
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
  // 4F06裁决通道：blocks.onSiegeWarning26 拥有 TALK26 序列，关闭后跑续跑
  // 闭包；通道缺失则 dispatch 内的历史stop保持（裸叶合同，单测锁定）。
  io.suspendSiegeWarning = (verdict, resumeTail) => {
    if (typeof blocks?.onSiegeWarning26 !== "function")
      stop("4F06", "4F71/TALK26 before city capture");
    blocks.onSiegeWarning26({
      result: verdict.result,
      attacker,
      cityIndex,
      resumeTail,
    });
    return "suspended";
  };
  io.captureCity = (pointer, captor, at) => {
    const city = cityAt(pointer, at);
    const detachedScan = createDetachedExtinctionScan(sc, context, blocks);
    return captureOriginalCity(
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
          performScenarioLegionFate(
            sc,
            record,
            context,
            "291A",
            receiver,
            rng,
            blocks,
          ),
        );
      },
      detachedScan,
      // 灭亡挂起通道：5042 stop 在此被收为 extinction-suspended 并延后
      // 4D2A 尾（去向§19.7）；缺失则历史hold保持。
      blocks?.onExtinctionBlock,
      blocks?.onGovernorBlock
        ? { onGovernorBlock: blocks.onGovernorBlock }
        : undefined,
    );
  };
  try {
    if (!Number.isInteger(cityIndex) || cityIndex < 0 || cityIndex >= 192)
      stop("28BB", "city pointer alias");
    call.cityPointer = 0x840 + cityIndex * 32;
    // 4F36/4F13战术挂起的三方记录：攻方原生记录、主守军原生记录、被攻城池。
    return performOriginalSiegeEntry(io, call.cityPointer, () => ({
      attacker,
      defender: io.battleRecords().defender,
      city: cityAt(call.cityPointer, "4B46"),
    }));
  } catch (error) {
    error.nativeSiegePrefix = prefix;
    error.nativeSiegeCall = call;
    throw error;
  }
}
