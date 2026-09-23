// Strict Scenario adapter for the native type2 3220 / type3 3262 consumers.
// Field provenance: nativeFactionSlots/nativeLegionSlots/nativeDiplomacy
// tables, general ability/status/faction/origFaction bytes and the city
// +1/+1A owner pair (_strategicLastFaction). No legacy/raw fallback.
import {
  nativeDiplomacyAt,
  writeNativeDiplomacyAt,
} from "../nativediplomacy.js";
import { nativeFactionAt } from "../nativefactions.js";
import { nativeLegionAt } from "../nativelegions.js";
import {
  originalBeginAssistanceEvent3220,
  originalCommitAssistanceEvent3258,
} from "./originalassistanceconsumer.js";
import {
  originalBeginDomesticBudgetEvent32A9,
  originalBeginEnvoyBudgetEvent32E9,
  originalCommitBudget39E8,
} from "./originalbudgetconsumer.js";
import {
  originalBeginTruceEnvoyResult3327,
  originalTruceEnvoyOutcome3346,
  originalCommitTruceEnvoyResult3371,
  originalBeginAssistanceEnvoyResult3388,
  originalAssistanceEnvoyOutcome33B2,
  originalCommitAssistanceEnvoyResult33DD,
} from "./originalenvoyresultconsumer.js";
import {
  originalBeginTruceEvent3262,
  originalCommitTruceEvent3297,
} from "./originaltruceconsumer.js";
import { describeMessageState } from "./scenariowarconsumer.js";

// 3DC9 罚则 TALK 台词选择器（KI.EXE 实锤）：借位（信赖不足扣 30）时 CX 从
// 默认 0x1A5(TALK[421] 空串) 改为 0x19E，经 075B 展开为 470+君主个性
// （\4 解任台词，随后信赖==0 → 1CB1 GAME OVER）。
export const PLAYER_TRUST_PENALTY_DELTA = 30;
export const PLAYER_TRUST_PENALTY_BORROW_SELECTOR = 0x19e;
export const PLAYER_TRUST_PENALTY_DEFAULT_SELECTOR = 0x1a5;

/** 3902 信赖门读取（cs:[D00] 运行时字节，与 deficit-trust io 同一 strict 合同）。 */
export function readScenarioPlayerTrust(sc) {
  return byte(own(sc, "trust"), "trust");
}

/**
 * 87FF+0x4240（实锤）：CFD 玩家势力指针→[bx+1] 君主号→0x4240 武将记录；
 * 返回 +1E 个性字节（talk_idx）。3C99 变体规则：v>=3 则 v-=3（减一次，
 * 非模 3 非钳位；raw 6/7 会得偏移 3/4，见 re-notes-ai-diplomacy）。
 */
export function readScenarioPlayerMonarchPersonality(sc) {
  const pointer = own(sc, "nativePlayerFactionPointer");
  if (!Number.isInteger(pointer) || pointer % 0x40 || pointer >= 22 * 0x40)
    missing("87FF aligned player faction pointer");
  const faction = nativeFactionAt(sc, pointer >>> 6, "87FF player faction");
  const generalIndex = byte(own(faction, "monarch_idx"), "monarch_idx");
  const general = sc.generals?.[generalIndex];
  if (!general || general.idx !== generalIndex)
    missing(`monarch general ${generalIndex}`);
  return byte(own(general, "talk_idx"), "monarch talk_idx");
}

/** 3C99 个性变体（实锤）：v>=3 减 3 一次。 */
export function playerDecisionTalkVariant(personality) {
  const v = byte(personality, "monarch talk_idx");
  return v >= 3 ? v - 3 : v;
}

function trustIo(sc) {
  // 与 scenariodeficittrust.js 同一 strict 合同：sc.trust 为 0-255 数值。
  return {
    readTrustByte() {
      return byte(own(sc, "trust"), "trust");
    },
    writeTrustByte(value) {
      sc.trust = byte(value, "trust write");
    },
  };
}

/**
 * 3DC9（实锤，re-notes-ai-diplomacy §36）：仅当 3902 结果 outcome==3
 * （索价过高破裂）时由 3C3D 以 al=30 调用；信赖 -=30，借位夹 0 并将台词
 * 选择器切为 0x19E（075B→470+个性 解任行）；扣后信赖==0 → al=1
 * CALL 1CB1（信赖归零 GAME OVER，web 对应 checkTrustGameOver）。
 * outcome 0/1/2 不进 3DC9，无任何写入。
 * 返回 { before, after, selector, gameOver }；selector 仅供 UI 显示台词。
 */
export function applyScenarioPlayerTrustPenalty(sc, outcome) {
  const channel = trustIo(sc);
  const before = channel.readTrustByte();
  if (outcome !== 3) {
    return { before, after: before, selector: null, gameOver: false };
  }
  const borrowed = before < PLAYER_TRUST_PENALTY_DELTA;
  const after = borrowed ? 0 : before - PLAYER_TRUST_PENALTY_DELTA;
  channel.writeTrustByte(after);
  return {
    before,
    after,
    selector: borrowed
      ? PLAYER_TRUST_PENALTY_BORROW_SELECTOR
      : PLAYER_TRUST_PENALTY_DEFAULT_SELECTOR,
    gameOver: after === 0,
  };
}

const missing = (field) => {
  throw new RangeError(`Web engineering Uncovered native negotiation ${field}`);
};
const own = (record, field) => {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, field))
    missing(field);
  return record[field];
};
const byte = (value, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) missing(field);
  return value;
};

function generalAt(sc, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 0x7f)
    missing(`general ${slot}`);
  const general = sc.generals?.[slot];
  if (!general || general.idx !== slot) missing(`same-slot general ${slot}`);
  return general;
}

function cityAt(sc, slot) {
  const city = sc.cities?.[slot];
  if (!city || city.idx !== slot || slot < 0 || slot >= 0xc0)
    missing(`city ${slot}`);
  return city;
}

/**
 * Shared io for both consumers, including the 50D7/2AD2 general-return
 * surface reused from originallegionfate.js. FF sentinel bytes map to null
 * on the general faction/origin and faction target/diplomat fields.
 */
export function createNegotiationIo(sc, rng) {
  const factionAt = (index) => nativeFactionAt(sc, index, "negotiation IO");
  const readGeneralByte = (slot, offset) => {
    const general = generalAt(sc, slot);
    if (offset === 0x13) return byte(own(general.ability, "politics"), "G13");
    if (offset === 0x17) return byte(own(general, "status"), "G17");
    if (offset === 0x1c) {
      const value = own(general, "faction");
      return value === null ? 0xff : byte(value, "G1C");
    }
    if (offset === 0x1d) {
      const value = own(general, "origFaction");
      return value === null ? 0xff : byte(value, "G1D");
    }
    missing(`general read ${offset}`);
  };
  return {
    readFactionAttr: (index) => byte(own(factionAt(index), "attr"), "F00"),
    readFactionTarget: (index) => {
      const value = own(factionAt(index), "target_faction");
      return value === null ? 0xff : byte(value, "F19");
    },
    writeFactionTarget: (index, value) => {
      factionAt(index).target_faction =
        byte(value, "F19 write") === 0xff ? null : value;
    },
    readFactionDiplomat: (index) => {
      const value = own(factionAt(index), "diplomat_idx");
      return value === null ? 0xff : byte(value, "F2A");
    },
    readFactionMonarch: (index) =>
      byte(own(factionAt(index), "monarch_idx"), "F01"),
    readFactionBellicosity: (index) =>
      byte(own(factionAt(index), "bellicosity"), "F28"),
    readFactionMoney: (index) => {
      const value = own(factionAt(index), "money");
      if (!Number.isInteger(value) || value < -0x800000 || value > 0x7fffff)
        missing("money");
      return value;
    },
    writeFactionMoney: (index, value) => {
      if (!Number.isInteger(value) || value < -0x800000 || value > 0x7fffff)
        missing("money write");
      const record = factionAt(index);
      record.money = value;
      if (Object.hasOwn(record, "gold")) record.gold = value;
    },
    readGeneralPolitics: (slot) => readGeneralByte(slot, 0x13),
    readGeneralStatus: (slot) => readGeneralByte(slot, 0x17),
    readGeneralFaction: (slot) => readGeneralByte(slot, 0x1c),
    readGeneralOrigin: (slot) => readGeneralByte(slot, 0x1d),
    readGeneralByte: (slot, offset) => {
      if (offset === 0x1a) {
        const value = own(generalAt(sc, slot), "assignment_budget");
        return byte(value, "G1A");
      }
      return readGeneralByte(slot, offset);
    },
    writeGeneralByte(slot, offset, value) {
      const general = generalAt(sc, slot);
      const raw = byte(value, `general write ${offset}`);
      if (offset === 0x17) general.status = raw;
      else if (offset === 0x1a) general.assignment_budget = raw;
      else if (offset === 0x1c) general.faction = raw === 0xff ? null : raw;
      else if (offset === 0x1d) {
        general.origFaction = raw === 0xff ? null : raw;
        general.captive_flag = raw; // v1 projection mirror, never a source
      } else missing(`general write ${offset}`);
    },
    readFactionByte: (owner, offset) => {
      const field = { 0: "attr", 0x18: "nativeGeneralCount" }[offset];
      if (!field) missing(`faction read ${offset}`);
      return byte(own(factionAt(owner), field), `F${offset}`);
    },
    writeFactionByte: (owner, offset, value) => {
      if (offset !== 0x18) missing(`faction write ${offset}`);
      factionAt(owner).nativeGeneralCount = byte(value, "F18 write");
    },
    readLegionStatusByte: (slot) =>
      byte(
        own(nativeLegionAt(sc, slot, "379E monarch legion"), "status"),
        "L00",
      ),
    readPlayerFaction: () => byte(own(sc, "player_faction"), "CFF"),
    // 3558 in the shared 3526 war tail reads the same CFF byte.
    readPlayerFactionByte: () => byte(own(sc, "player_faction"), "3558"),
    readPlayerFactionPointer: () => {
      const value = own(sc, "nativePlayerFactionPointer");
      if (!Number.isInteger(value) || value < 0 || value > 0xffff)
        missing("CFD pointer");
      return value;
    },
    readDiplomacy: (from, to) => nativeDiplomacyAt(sc, from, to, "negotiation"),
    writeDiplomacy: (from, to, value) =>
      writeNativeDiplomacyAt(sc, from, to, value, "negotiation"),
    readCityGovernor: (slot) => {
      const value = own(cityAt(sc, slot), "governor");
      return value === null ? 0xff : byte(value, "city +19");
    },
    readCityOwner: (slot) => {
      const value = own(cityAt(sc, slot), "faction");
      return value === null ? 0x18 : byte(value, "city owner");
    },
    readCityOldOwner: (slot) =>
      byte(own(cityAt(sc, slot), "_strategicLastFaction"), "city +1A"),
    writeCityOldOwner: (slot, value) => {
      cityAt(sc, slot)._strategicLastFaction = byte(value, "city +1A write");
    },
    nextRandomByte: () => {
      if (typeof rng?.nextByte !== "function") missing("canonical RNG");
      return rng.nextByte();
    },
  };
}

export function beginScenarioTruceEvent(sc, event, rng) {
  return originalBeginTruceEvent3262(createNegotiationIo(sc, rng), event);
}

export function commitScenarioTruceEvent(sc, state, rng) {
  return originalCommitTruceEvent3297(createNegotiationIo(sc, rng), state);
}

export function beginScenarioAssistanceEvent(sc, event, rng) {
  return originalBeginAssistanceEvent3220(createNegotiationIo(sc, rng), event);
}

/**
 * 3258 settle + 325D direct 3526 call. War-tail message phases carry the
 * same monarch/display records the type1 continuation consumes.
 */
export function settleScenarioAssistanceEvent(sc, state, rng) {
  return describeMessageState(
    sc,
    originalCommitAssistanceEvent3258(createNegotiationIo(sc, rng), state),
  );
}

/** 32A9 type4 内政官月度预算报告（城门 + 金额字，39E8 前段）。 */
export function beginScenarioDomesticBudgetEvent(sc, event) {
  return originalBeginDomesticBudgetEvent32A9(
    createNegotiationIo(sc, null),
    event,
  );
}

/** 32E9 type5 外交官月度维持费申请（势力门 + 金额字，39E8 前段）。 */
export function beginScenarioEnvoyBudgetEvent(sc, event) {
  return originalBeginEnvoyBudgetEvent32E9(
    createNegotiationIo(sc, null),
    event,
  );
}

/** 3AD9..3AF5 提交：先写武将+1A 预算点，再 563B 扣玩家国库。无 RNG。 */
export function commitScenarioBudgetEvent(sc, state) {
  return originalCommitBudget39E8(createNegotiationIo(sc, null), state);
}

/** 3327 type6 玩家停战使者结果：入口门（351A 活动 + 外交官在任）。 */
export function beginScenarioTruceEnvoyResult(sc, event) {
  return originalBeginTruceEnvoyResult3327(
    createNegotiationIo(sc, null),
    event,
  );
}

/** 3346：TALK57 关闭后 36C4（此点消费 3771 政治相等 RNG）。 */
export function scenarioTruceEnvoyOutcome(sc, state, rng) {
  return originalTruceEnvoyOutcome3346(createNegotiationIo(sc, rng), state);
}

/** 3371..3384：通知关闭后提交（35ED→45F8→4236→3669）。 */
export function commitScenarioTruceEnvoyResult(sc, state, rng) {
  return originalCommitTruceEnvoyResult3371(
    createNegotiationIo(sc, rng),
    state,
  );
}

/** 3388 type7 玩家请援使者结果：入口门（协助/目标 351A + 外交官）。 */
export function beginScenarioAssistanceEnvoyResult(sc, event) {
  return originalBeginAssistanceEnvoyResult3388(
    createNegotiationIo(sc, null),
    event,
  );
}

/** 33B2：TALK57 关闭后 3712（此点消费 3771 政治相等 RNG）。 */
export function scenarioAssistanceEnvoyOutcome(sc, state, rng) {
  return originalAssistanceEnvoyOutcome33B2(
    createNegotiationIo(sc, rng),
    state,
  );
}

/** 33DD..33E6：通知关闭后 35ED + 直接 3526 战争尾段（复用 3258）。 */
export function commitScenarioAssistanceEnvoyResult(sc, state, rng) {
  return describeMessageState(
    sc,
    originalCommitAssistanceEnvoyResult33DD(
      createNegotiationIo(sc, rng),
      state,
    ),
  );
}

/**
 * 3327/3388 消息状态描述：\1=外交官武将记录、\3=派驻势力君主名，均从
 * 固定势力表/固定武将槽解析，不依赖公开 factions 列表。
 */
export function describeEnvoyResultMessageState(sc, state) {
  if (
    state?.phase !== "report" &&
    state?.phase !== "report-failed" &&
    state?.phase !== "notify"
  )
    return state;
  const factionIndex = state.kind === "truce" ? state.target : state.ally;
  const record = nativeFactionAt(sc, factionIndex, "envoy result faction");
  const monarchIndex = own(record, "monarch_idx", "envoy result monarch");
  const factionName =
    monarchIndex === null
      ? ""
      : (generalAt(sc, monarchIndex).name?.trim?.() ?? "");
  const diplomatGeneral = generalAt(sc, byte(state.diplomat, "envoy diplomat"));
  return { ...state, factionName, diplomatGeneral };
}
