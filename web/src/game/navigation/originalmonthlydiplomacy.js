// Strict KI.EXE 2BD9 monthly diplomacy producer.
// Evidence: docs/re-notes-ai-diplomacy.md §§2-7 (P17).
import { originalCurrentEnqueue2FBF } from "./originalweather.js";

export class OriginalMonthlyDiplomacyBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original monthly diplomacy boundary at ${at}: ${detail}`);
    this.name = "OriginalMonthlyDiplomacyBoundaryError";
  }
}
const stop = (at, detail) => {
  throw new OriginalMonthlyDiplomacyBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const u8 = (value, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    stop(at, `${label} is not u8`);
  return value;
};
const u16 = (value, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff)
    stop(at, `${label} is not u16`);
  return value;
};
const signed16 = (value) => (value & 0x8000 ? value - 0x10000 : value);
const readFactionByte = (io, slot, field, at) =>
  u8(call(io, "readFactionByte", [slot, field], at), at, `faction ${field}`);
const readRelation = (io, actor, target, at) =>
  u8(call(io, "readRelationByte", [actor, target], at), at, "relation");
const writeRelation = (io, actor, target, value, at) =>
  call(io, "writeRelationByte", [actor, target, u8(value, at, "relation")], at);
const nextRandom = (io, at) =>
  u8(call(io, "nextRandomByte", [], at), at, "random byte");

function eventIO(io) {
  return {
    nextRandomByte: () => nextRandom(io, "2FCB"),
    readEventCursorWord: () =>
      u16(call(io, "readEventCursorWord", [], "2FD4"), "2FD4", "D20"),
    readEventTypeByte: (offset) =>
      u8(call(io, "readEventTypeByte", [offset], "2FF1"), "2FF1", "event type"),
    writeEventWord: (offset, value) =>
      call(io, "writeEventWord", [offset, value], "2FF6"),
  };
}

function enqueue(io, type, actor, target = 0xff, extra = 0xff) {
  const ax = u8(type, "2FB1", "event type") | (u8(actor, "2FB1", "actor") << 8);
  const dx = u8(target, "2FB1", "target") | (u8(extra, "2FB1", "extra") << 8);
  return originalCurrentEnqueue2FBF(eventIO(io), ax, dx, 0xff);
}

function resetEventMonth(io) {
  call(io, "writeEventCursorWord", [0], "2BE1");
  call(io, "writeEventDividerByte", [7], "2BE8");
  // REP MOVSW is forward: pages 1..3 become 0..2, then page 3 clears.
  for (let offset = 0; offset < 0x300; offset += 2) {
    const value = u16(
      call(io, "readEventWord", [offset + 0x100], "2BF8"),
      "2BF8",
      "event word",
    );
    call(io, "writeEventWord", [offset, value], "2BFA");
  }
  for (let offset = 0x300; offset < 0x400; offset += 2)
    call(io, "writeEventWord", [offset, 0], "2C03");
}

function strategicPower3091(io, slot) {
  const cav = u16(
    call(io, "readFactionWord", [slot, "reserveCav"], "3094"),
    "3094",
    "reserve cavalry",
  );
  const arc = u16(
    call(io, "readFactionWord", [slot, "reserveArc"], "309B"),
    "309B",
    "reserve archers",
  );
  const inf = u16(
    call(io, "readFactionWord", [slot, "reserveInf"], "30A2"),
    "30A2",
    "reserve infantry",
  );
  let power = (cav >>> 2) + (arc >>> 2) + (inf >>> 2);
  const cities = readFactionByte(io, slot, "nCities", "30B0");
  if (power >>> 8 >= cities) power = 2000;
  if (power > 2000) power = 2000;
  const moneyWord = u16(
    call(io, "readFactionMoneyHighWord", [slot], "30C7"),
    "30C7",
    "money high word",
  );
  return moneyWord <= 19 ? 0 : power;
}

function lowerRelation(raw, amount) {
  return (raw & 0x80) | Math.max(0, (raw & 0x7f) - amount);
}

function buildCandidates(io, actor) {
  const ordinary = [];
  let empty = false;
  for (let city = 0; city < 192; city++) {
    if (readFactionByte(io, city, "cityOwner", "2C61") !== actor) continue;
    const mask = readFactionByte(io, city, "cityConnectionMask", "2C6D");
    if (mask > 0x0f) stop("2C6D", "city connection mask exceeds four bits");
    for (let direction = 0; direction < 4; direction++) {
      if (!(mask & (1 << direction))) continue;
      const neighbour = readFactionByte(
        io,
        city,
        `cityConnection${direction}`,
        "2C79",
      );
      if (neighbour >= 192)
        stop("2C79", "city connection is outside 192 slots");
      const owner = readFactionByte(io, neighbour, "cityOwner", "2C80");
      if (owner === actor) continue;
      if (owner === 0x18) {
        empty = true;
        continue;
      }
      if (owner > 0x17)
        stop("2C80", "neighbour owner is outside diplomacy rows");
      if (ordinary.some((candidate) => candidate.slot === owner)) continue;
      if (ordinary.length >= 21)
        stop("2C8A", "candidate row exceeds 21 entries");
      const relation = readRelation(io, actor, owner, "2CA8");
      ordinary.push({ slot: owner, relation, war: relation < 0x80 });
    }
  }
  // 2C8A..2CDB exchanges immediately whenever a strictly smaller raw byte is
  // encountered. It is not one selection-sort swap at the end of a pass.
  for (let start = 0; start < ordinary.length; start++) {
    let smallest = ordinary[start].relation;
    for (let scan = start + 1; scan < ordinary.length; scan++) {
      if (ordinary[scan].relation >= smallest) continue;
      smallest = ordinary[scan].relation;
      [ordinary[start], ordinary[scan]] = [ordinary[scan], ordinary[start]];
    }
  }
  return { empty, ordinary };
}

function maybeQueueCapitalMove(io, actor) {
  const target = readFactionByte(io, actor, "targetFaction", "2D3A");
  if (target !== 0xff) return;
  if (nextRandom(io, "2D46") >= 0x40) return;
  enqueue(io, 8, actor);
}

function updateRelations(io, actor, row, player) {
  const first = row.ordinary[0];
  // FFFF terminates the candidate row. 2DB8/2DF3 perform no relation update;
  // later 2EFB has its own documented 06FF alias boundary.
  if (!first) return;
  if (actor === player) {
    let raw = readRelation(io, actor, first.slot, "2DF3");
    raw = lowerRelation(raw, 1);
    writeRelation(io, actor, first.slot, raw, "2E02");
    if (!first.war) {
      raw = readRelation(io, actor, first.slot, "2E08");
      writeRelation(io, actor, first.slot, lowerRelation(raw, 7), "2E14");
    }
    for (let slot = 0; slot < 22; slot++) {
      if (slot === player) continue;
      if (readFactionByte(io, slot, "attr", "2E1B") < 0x80) continue;
      raw = readRelation(io, slot, player, "2E24");
      writeRelation(io, slot, player, lowerRelation(raw, 1), "2E2F");
    }
    return;
  }
  const raw = readRelation(io, actor, first.slot, "2DB8");
  if (raw >= 0x80) {
    const value = Math.max(raw & 0x7f, 22) - 2;
    writeRelation(io, actor, first.slot, 0x80 | value, "2DD5");
  } else if (first.slot !== player && raw < 50) {
    writeRelation(io, actor, first.slot, raw + 1, "2DEB");
  }
}

function maybeQueueAlliance(io, actor, row, player) {
  const target = readFactionByte(io, actor, "targetFaction", "2E42");
  if (target === 0xff || target === player) return;
  const playerCandidate = row.ordinary.find(
    (candidate) => candidate.slot === player && !candidate.war,
  );
  if (!playerCandidate) return;
  if (readRelation(io, actor, player, "2E66") < 0x80) return;
  if (readRelation(io, target, player, "2E77") < 0xa3) return;
  enqueue(io, 2, player, actor, target);
}

function queueExcessWarTruces(io, actor, row, player) {
  if (actor === player) return;
  let remaining = strategicPower3091(io, actor);
  let trigger = -1;
  for (let index = 0; index < Math.min(21, row.ordinary.length); index++) {
    const candidate = row.ordinary[index];
    if (!candidate.war) break;
    const enemy = strategicPower3091(io, candidate.slot);
    if (remaining <= enemy) {
      trigger = index;
      break;
    }
    remaining -= enemy;
  }
  if (trigger < 0) return;
  const firstSlot = row.ordinary[0]?.slot;
  for (
    let index = trigger;
    index < Math.min(21, row.ordinary.length);
    index++
  ) {
    const candidate = row.ordinary[index];
    if (!candidate.war) break;
    if (candidate.slot === firstSlot) continue;
    enqueue(io, 3, actor, candidate.slot);
  }
}

function moneyHighWord(io, actor, at) {
  return signed16(
    u16(
      call(io, "readFactionMoneyHighWord", [actor], at),
      at,
      "money high word",
    ),
  );
}

function maybeQueueWar(io, actor, row) {
  const first = row.ordinary[0];
  const oldTarget = readFactionByte(io, actor, "targetFaction", "2F0C");
  // 2F08 gate: decoded candidate (owner<<6 -> shl,2 -> AH) vs F19; the FFFF
  // candidate decodes to 0xFF, so F19==0xFF rejects it before the money gate.
  if ((first ? first.slot : 0xff) === oldTarget) return false;
  const cities = readFactionByte(io, actor, "nCities", "2F17");
  const threshold = Math.min(cities * 16 + 64, 0x61a);
  if (moneyHighWord(io, actor, "2F23") <= threshold) return false;
  const bellicosity = readFactionByte(io, actor, "bellicosity", "2F2C");
  const relationThreshold =
    ((bellicosity + (bellicosity >>> 1) + 20) & 0xff) | 0x80;
  const candidateRelation = first
    ? readRelation(io, actor, first.slot, "2F38")
    : u8(
        call(io, "readNoCandidateRelationAliasByte", [actor], "2F38"),
        "2F38",
        "FFFF candidate relation alias",
      );
  if (candidateRelation > relationThreshold) return false;
  // Web 产品决定（原版行为不可知，待用户确认；见re-notes-ai-diplomacy§7）：
  // 无普通候选（首字FFFF）但走到这里时，原版继续以bx=0x7FFF调3091，读
  // DS:0x8003/05/07/20/22——8CAE只载入0x5240字节，该地址超出=未初始化
  // RAM（P34实锤），比较结果与是否排战完全取决于堆垃圾，不存在可实现
  // 的确定性原规则（标“未知”，不得写入正式规则路径）。本轮harness已证
  // 明该门常规可达（第三章首换月：富足和平势力空行+F19已设+关系门过），
  // 永冻(stop)会使游戏无法推进。保守选择：宣战比较恒不成立（return
  // false），目标维护照常走maybeQueueEmptyWar/2D94空行协议；本分支在
  // stop前不消费RNG、不写状态，故对时间线零影响（仅跳过不可知的比较
  // 与对0xFF的幻影排战；零填充复现的[1,A,FF,FF]输出早已撤销证书地位）。
  // 若用户否决，改回stop即恢复永冻（单行回退）。
  if (!first) return false;
  const mine = strategicPower3091(io, actor);
  const enemy = strategicPower3091(io, first.slot);
  if (mine < enemy - (enemy >>> 2)) return false;
  enqueue(io, 1, actor, first.slot);
  return true;
}

function maybeQueueEmptyWar(io, actor, row) {
  const target = readFactionByte(io, actor, "targetFaction", "2F71");
  if (target < 0x18) return false;
  if (!row.empty) {
    call(io, "writeFactionByte", [actor, "targetFaction", 0xff], "2F86");
    return false;
  }
  const cities = readFactionByte(io, actor, "nCities", "2F99");
  const threshold = Math.min(cities * 16 + 96, 0x6dd);
  if (moneyHighWord(io, actor, "2FA6") <= threshold) {
    call(io, "writeFactionByte", [actor, "targetFaction", 0xff], "2FAF");
    return false;
  }
  if (target === 0x18) return true;
  enqueue(io, 1, actor, 0x18);
  // The proposal does not commit F19=18h. A pre-existing value above 18h
  // therefore continues to 2D94 and is cleared.
  return false;
}

function preserveOrClearTarget(io, actor, row, warAttempted) {
  let target = readFactionByte(io, actor, "targetFaction", "2D8E");
  if (!warAttempted && maybeQueueEmptyWar(io, actor, row)) return;
  target = readFactionByte(io, actor, "targetFaction", "2D94");
  const first = row.ordinary[0];
  if (target !== 0x18 && first?.war && first.slot === target) return;
  call(io, "writeFactionByte", [actor, "targetFaction", 0xff], "2DAC");
}

/** Full synchronous 2BD9 producer through its original RET. */
export function originalMonthlyDiplomacy2BD9(io) {
  resetEventMonth(io);
  const player = u8(
    call(io, "readPlayerFaction", [], "2C10"),
    "2C10",
    "player faction",
  );
  const rows = Array(22).fill(null);
  for (let actor = 0; actor < 22; actor++) {
    if (readFactionByte(io, actor, "attr", "2C15") < 0x80) continue;
    rows[actor] = buildCandidates(io, actor);
    maybeQueueCapitalMove(io, actor);
  }
  for (let actor = 0; actor < 22; actor++) {
    const row = rows[actor];
    if (row === null) continue;
    updateRelations(io, actor, row, player);
    maybeQueueAlliance(io, actor, row, player);
    queueExcessWarTruces(io, actor, row, player);
    const warAttempted = maybeQueueWar(io, actor, row);
    preserveOrClearTarget(io, actor, row, warAttempted);
  }
  return { rows };
}
