// KI 2873 -> 4A7B/4B63..4C71. Source and bounded ABI: legion-fate §13.
// No XY/resource fallback. Synchronous quick returns; unknown calls retain prefixes.
import { nativeLegionAt } from "../nativelegions.js";
import { bindLegionSlotCounter } from "../legionphase.js";
import { originalTeamTroops } from "./originalformation.js";
import { continueOriginalLegionAfterBattle } from "./originalroadretreat.js";
import { performScenarioLegionFate } from "./scenariolegionfate.js";
import { dispatchOriginalFieldBattle } from "./originalfieldbattle.js";
const u16 = (value) => value & 65535;
const RANGES = [
  [1, 0xb8, 0xb9],
  [2, 0xba, 0xbf],
  [3, 0x70, 0xa7],
  [3, 0xa9, 0xaf],
  [4, 6, 6],
  [4, 0x1d, 0x1d],
  [4, 0xb0, 0xb0],
  [4, 0xb6, 0xb7],
  [5, 0xb1, 0xb3],
  [6, 0x0e, 0x0f],
  [6, 0x1e, 0x6f],
  [7, 0xa8, 0xa8],
  [8, 0xca, 0xca],
  [9, 0xc0, 0xc3],
];
const PAIRS = [
  [0, 3, 3],
  [1, 3, 0],
  [2, 3, 5],
  [3, 3, 6],
  [4, 3, 4],
  [5, 3, 7],
  [6, 0, 0],
  [6, 0, 4],
  [7, 0, 5],
  [8, 0, 6],
  [8, 5, 6],
  [9, 5, 5],
  [10, 5, 4],
  [11, 4, 4],
  [12, 4, 6],
  [13, 6, 6],
  [14, 7, 7],
  [6, 0, 7],
  [9, 5, 7],
  [14, 6, 7],
  [11, 4, 7],
];
function stop(instruction, detail) {
  const error = new RangeError(
    `Web engineering Uncovered native field ${detail} at ${instruction}`,
  );
  error.instruction = instruction;
  throw error;
}
function unsigned(value, max, instruction, label) {
  if (!Number.isInteger(value) || value < 0 || value > max)
    stop(instruction, label);
  return value;
}
function terrainClass(tile) {
  for (const [kind, low, high] of RANGES)
    if (tile >= low && tile <= high) return kind;
  return 0; // 4C6A reads CS:9859=00 after the fourteen triples.
}

/** IO values are bytes/words. Row arguments are canonical 9872-relative
 * paragraphs, not DOS segments. Returns only the actual 4B63 output CX.
 * readOccupancyAliasByte is a distinct DS:SI read, never a Legion field.
 */
export function classifyOriginalFieldTerrain(io, al) {
  const player = io.readPlayer("4B67");
  if (player === io.readLegionByte("attacker", 1, "4B6C"))
    al = io.readLegionByte("attacker", 8, "4B71");
  if (player === io.readLegionByte("defender", 1, "4B74"))
    al = io.readLegionByte("defender", 8, "4B79");
  const row = io.readLegionWord("defender", 0x1c, "4B7D");
  const bx = io.readLegionWord("defender", 0x1a, "4B80");
  const sample = (delta, at) =>
    terrainClass(io.readTerrainByte(row - 24, u16(bx + delta), at));
  // All five reads happen even when the center selects a direct directory.
  const west = sample(0x17f, "4B92");
  const east = sample(0x181, "4B9B");
  const north = sample(0, "4BA4");
  const south = sample(0x300, "4BAB");
  const center = sample(0x180, "4BB4");
  if (center > 0 && center < 8) return 0xce + center;
  if (center === 9) {
    // 4C2C restores D52 only BEFORE LDS. LDS then replaces DS with L1C.
    const offset = io.readLegionWord("attacker", 0x1a, "4C33");
    const attackerRow = io.readLegionWord("attacker", 0x1c, "4C33");
    let ch =
      io.readOccupancyByte(attackerRow, offset, "4C36") === 0xca ? 0x40 : 0;
    const currentPlayer = io.readPlayer("4C3D");
    if (currentPlayer !== io.readOccupancyAliasByte(attackerRow, "4C41"))
      ch ^= 0x40;
    return (ch << 8) | 0xd5;
  }
  if (center >= 8) return 0xd1 + (io.nextByte("4C1F") & 3);
  // 4BDD: only exact 1/3 reverse; all other AL>=2 use west/east.
  const first = al < 2 ? (al === 1 ? north : south) : al === 3 ? east : west;
  const second = al < 2 ? (al === 1 ? south : north) : al === 3 ? west : east;
  for (const [directory, low, high] of PAIRS) {
    if (first === low && second === high) return 0xc0 + directory;
    if (second === low && first === high) return 0x4000 | (0xc0 + directory);
  }
  return 0xc6;
}

/** 4C72..4CF2. BP is invocation-local relative word storage, never absolute
 * SS or a persistent selector. Preserve each list write before any later fault.
 * AX/DX/SI/DI/BP are restored; only BX/CX/CF are returned.
 */
export function selectOriginalFieldDefenders(io, ax, dx, owner) {
  let count = 0;
  for (let slot = 0; slot < 127; slot++) {
    if (io.readSlotByte(slot, 0, "4C7B") < 0x80) continue;
    if (io.readSlotWord(slot, 0x12, "4C80") !== ax) continue;
    if (io.readSlotWord(slot, 0x10, "4C85") !== dx) continue;
    if (io.readSlotByte(slot, 1, "4C8A") !== owner) continue;
    io.writeBpWord(count * 2, 0x2240 + slot * 0x40, "4C8F");
    count++;
  }
  io.writeBpWord(0xfe, count, "4C9D");
  if ((io.readBpWord(0xfe, "4CA2") & 255) === 0)
    return { bx: 0x4200, cx: owner << 8, cf: true };
  const length = io.readBpWord(0xfe, "4CB0") & 255;
  let best = 0;
  let selected = io.readBpWord(0, "4CB8"); // all-zero scores retain BP[0].
  for (let i = 0; i < length; i++) {
    const pointer = io.readBpWord(i * 2, "4CBB");
    const slot = (pointer - 0x2240) / 0x40;
    const shifted = io.readSlotWord(slot, 4, "4CBE") >>> 4;
    // MOV AH destroys the high byte of shifted AX BEFORE byte MUL AH.
    const morale = io.readSlotByte(slot, 6, "4CC3") >>> 4;
    const firstProduct = (shifted & 255) * morale;
    const rating = io.readGeneralRating(slot, "4CD0") >>> 4;
    const score = u16(firstProduct * (rating + 1));
    if (score > best) {
      best = score;
      selected = io.readBpWord(i * 2, "4CE1");
    }
  }
  return { bx: selected, cx: 4, cf: false };
}

/** 4A87..4ADD. Empty BP remains uncovered; completed quick calls consume AH. */
export function performOriginalFieldEntry(io, al) {
  io.writeGlobal("d32", 0, "4A87");
  const cx = classifyOriginalFieldTerrain(io, al);
  io.writeGlobal("d35", cx >>> 8, "4A91");
  io.writeGlobal("d34", cx & 255, "4A96");
  const owner = io.readLegionByte("defender", 1, "4A9B");
  const selection = io.selectDefenders(owner);
  if (selection.cf) stop("4AD3", "field stack/return tail");
  io.selectDefender(selection.bx, "4AA3");
  io.writeLegionByte(
    "attacker",
    0,
    io.readLegionByte("attacker", 0, "4AA5") & 0xdf,
    "4AA5",
  );
  io.writeLegionByte("attacker", 3, 0, "4AA8");
  io.writeLegionByte(
    "defender",
    0,
    io.readLegionByte("defender", 0, "4AAC") & 0xdf,
    "4AAC",
  );
  io.writeLegionByte("defender", 3, 0, "4AAF");
  const result = io.dispatchBattle("4AB3");
  const failed = result.ax >>> 8;
  if (failed) {
    const role = failed === 2 ? "defender" : "attacker";
    const other = failed === 2 ? "attacker" : "defender";
    const at = failed === 2 ? "4ACB" : "4AC1";
    io.fate(
      role,
      io.readLegionByte(other, 1, at),
      failed === 2 ? "4ACE" : "4AC4",
    );
  }
  //4AD3 restores this invocation's frame;2876 sets CLC before movement INC.
  return "field-battle";
}

/** Call-local globals/BP, consumed synchronously, NOT persistent CS or Session.
 * Only a failed invocation attaches diagnostics to its existing owner's Error.
 */
export function createScenarioBattleIO(
  sc,
  attacker,
  defender,
  context,
  rng,
  x,
  y,
) {
  const prefix = {};
  // Retain the actual first-D reference without fetching fields for diagnostics.
  const call = { ax: y, dx: x, firstDefender: defender };
  const records = { attacker, defender };
  function own(record, field, max, at) {
    if (!record || !Object.hasOwn(record, field)) stop(at, `missing ${field}`);
    return unsigned(record[field], max, at, `invalid ${field}`);
  }
  function access(at, read) {
    try {
      return read();
    } catch (error) {
      if (error.instruction === undefined) error.instruction = at;
      throw error;
    }
  }
  const byteFields = {
    0: "status",
    1: "faction",
    2: "generalIdx",
    6: "morale",
    8: "_markerFrame",
  };
  const wordFields = {
    4: "troops",
    16: "x",
    18: "y",
    26: "occupancyOffset",
    28: "occupancyRowParagraph",
  };
  const readByte = (record, offset, at) =>
    access(at, () => own(record, byteFields[offset], 255, at));
  const readWord = (record, offset, at) =>
    access(at, () => own(record, wordFields[offset], 65535, at));
  const fixedRecord = (slot, at) =>
    access(at, () => nativeLegionAt(sc, slot, at));
  function writeTeam(role, index, field, value, at) {
    return access(at, () => {
      const record = records[role];
      if (!Object.hasOwn(record, "units")) record.units = [];
      if (!Array.isArray(record.units)) stop(at, "team storage");
      if (!Object.hasOwn(record.units, index)) record.units[index] = {};
      const unit = record.units[index];
      if (!unit || typeof unit !== "object") stop(at, "team storage");
      unit[field] = value;
    });
  }
  const io = {
    writeGlobal: (name, value) => {
      prefix[name] = value;
    },
    readGlobal: (name, at) =>
      own(prefix, name, name === "d32" ? 65535 : 255, at),
    readPlayer: (at) => own(sc, "player_faction", 255, at),
    legionPointer: (role, at) =>
      access(at, () => {
        const record = records[role];
        const slot = own(record, "slot", 127, at);
        if (fixedRecord(slot, at) !== record) stop(at, "unique legion pointer");
        return 0x2240 + slot * 64;
      }),
    readTeamType: (role, index, at) =>
      access(at, () => own(records[role].units?.[index], "type", 255, at)),
    readTeamTroops: (role, index, at) =>
      access(at, () => originalTeamTroops(records[role], index, at)),
    writeTeamTroops: (role, index, value, at) =>
      writeTeam(role, index, "troops", value * 10, at),
    writeTeamType: (role, index, value, at) =>
      writeTeam(role, index, "type", value, at),
    readAbility: (leader, field, at) =>
      access(at, () => {
        if (leader > 127) stop(at, "general address alias");
        return own(
          sc.generals?.[leader]?.ability,
          field,
          field === "field" || field === "siege" ? 15 : 255,
          at,
        );
      }),
    writeLegionWord: (role, offset, value, at) =>
      access(at, () => {
        records[role][wordFields[offset]] = value;
      }),
    continueLegion: (role, won, at) =>
      access(at, () =>
        continueOriginalLegionAfterBattle(sc, records[role], won, context),
      ),
    fate: (role, captor, at) =>
      access(at, () =>
        performScenarioLegionFate(
          sc,
          records[role],
          context,
          "291A",
          captor,
          rng,
        ),
      ),
    dispatchBattle: () => {
      const result = dispatchOriginalFieldBattle(io);
      call.battleResult = result;
      return result;
    },
    readLegionByte: (role, offset, at) => readByte(records[role], offset, at),
    readLegionWord: (role, offset, at) => readWord(records[role], offset, at),
    writeLegionByte: (role, offset, value, at) =>
      access(at, () => {
        const record = records[role];
        if (offset === 3) {
          bindLegionSlotCounter(sc, record);
          record.engagementCountdown = value;
        } else record[byteFields[offset]] = value;
      }),
    selectDefenders: (owner, candidateY = y, candidateX = x) => {
      const words = {};
      prefix.bpWords = words;
      const result = selectOriginalFieldDefenders(
        {
          readSlotByte: (slot, offset, at) =>
            readByte(fixedRecord(slot, at), offset, at),
          readSlotWord: (slot, offset, at) =>
            readWord(fixedRecord(slot, at), offset, at),
          readGeneralRating: (slot, at) =>
            access(at, () =>
              own(sc.generals?.[slot], "battle_rating", 255, at),
            ),
          writeBpWord: (offset, value) => {
            words[offset] = value;
          },
          readBpWord: (offset, at) => own(words, offset, 65535, at),
        },
        candidateY,
        candidateX,
        owner,
      );
      call.selection = result;
      return result;
    },
    selectDefender: (pointer, at) => {
      records.defender = fixedRecord((pointer - 0x2240) / 0x40, at);
      call.di = pointer;
    },
    readTerrainByte: (row, offset, at) =>
      access(at, () => {
        // Saved L1C translates through -9872 +D44 -18h. Segment aliases
        // outside canonical rows remain unknown; BX wraps independently.
        if (row < 0 || row > 24 * 254 || row % 24 !== 0 || !context.terrain)
          stop(at, "terrain capability/segment alias");
        return context.terrain.readByte(row * 16 + offset);
      }),
    readOccupancyByte: (row, offset, at) =>
      access(at, () => context.movement.readByte(row, offset)),
    readOccupancyAliasByte: (row, at) =>
      access(at, () => {
        const slot = own(attacker, "slot", 127, at);
        const si = 0x2240 + slot * 0x40;
        call.si = si;
        return context.movement.readAliasByte(row, u16(si + 1));
      }),
    nextByte: (at) =>
      access(at, () => {
        if (typeof rng?.nextByte !== "function") stop(at, "canonical RNG");
        return unsigned(rng.nextByte(), 255, at, "RNG byte");
      }),
  };
  return { io, prefix, call };
}

export function performScenarioFieldEntry(sc, attacker, defender, context, rng, x, y) {
  const { io, prefix, call } = createScenarioBattleIO(
    sc, attacker, defender, context, rng, x, y,
  );
  try {
    return performOriginalFieldEntry(io, y);
  } catch (error) {
    error.nativeFieldPrefix = prefix;
    error.nativeFieldCall = call;
    throw error;
  }
}
