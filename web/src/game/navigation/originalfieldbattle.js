// KI 4E5C / 5130 modes0,1 / 5285 / 52D7 / 51B3. Source: fate §13.6/§15.
// Synchronous native IO, immediate byte/word writes; never a legacy battle DTO.
import { TYPE_WEIGHT } from "../autobattle.js";

function stop(at, detail) {
  const error = new RangeError(
    `Web engineering Uncovered native field ${detail} at ${at}`,
  );
  error.instruction = at;
  throw error;
}
const u8 = (v) => v & 255;
const u16 = (v) => v & 65535;
function divWord(numerator, denominator, at) {
  const quotient = Math.floor(numerator / denominator);
  if (!denominator || quotient > 65535) stop(at, "DIV zero/overflow");
  return quotient;
}

function battlePower(io, role, mode) {
  const row = mode === 0 && role === "attacker" ? 3 : mode;
  let weighted = 0;
  for (let i = 0; i < 6; i++) {
    const type = io.readTeamType(role, i, "529A");
    const troops = io.readTeamTroops(role, i, "52A1");
    if (type < 1 || type > 4) stop("52A4", "CS weight-table alias");
    weighted = u16(weighted + troops * TYPE_WEIGHT[row][type - 1]);
  }
  if (row === 0) {
    const city = io.readGlobal("d32", "52B5");
    weighted = u16(weighted + io.readCityByte(city, 0x13, "52BA"));
  }
  const base = u16(weighted * (io.readLegionByte(role, 6, "52C3") >>> 3));
  const leader = io.readLegionByte(role, 2, "52DB");
  const force = io.readAbility(leader, "force", "52E7");
  const lead = io.readAbility(leader, "lead", "52E7");
  let command = u8(force * 2);
  if (force < lead || (io.nextByte("52F3") & 3) === 0) {
    const chosen = force < lead ? lead : force;
    command = u8(
      chosen - (chosen >>> 2) + io.readAbility(leader, "lead", "5304"),
    );
  }
  const specialty = io.readAbility(leader, mode === 0 ? "siege" : "field", "530D");
  const modifier = divWord(command * 16, 16 - specialty, "5320");
  return Math.floor((base * modifier) / 1024) & 65535;
}

/** 5130 returns AX only; its final stack ADD flags are not a battle CF API.
 * Caller4AB6 consumes AH, not CF. BX/CX/DX/BP and SI/DI are preserved.
 */
export function resolveOriginalFieldQuickBattle(io) {
  return resolveQuickBattle(io, 1);
}

export function resolveOriginalSiegeQuickBattle(io) {
  return resolveQuickBattle(io, 0);
}

function resolveQuickBattle(io, mode) {
  const attack = battlePower(io, "attacker", mode); // A52D7 before D5285.
  const defence = battlePower(io, "defender", mode);
  const a = u16(attack + 8),
    d = u16(defence + 8);
  const lost = a < d ? 1 : 0;
  const ratio = Math.min(
    100,
    divWord(Math.max(a, d) * 8, Math.min(a, d), "5171"),
  );
  const winner = lost ? "defender" : "attacker";
  const loser = lost ? "attacker" : "defender";
  if (io.readGlobal("d34", "51B9") < 0xc0) {
    // The field adapter has no city authority; preserve its engineering guard.
    if (mode !== 0) stop("51C3", "non-field city damage");
    const damage = u8(63 - ratio) >>> 2;
    const city = io.readGlobal("d32", "51CB");
    for (const [offset, at, clampAt] of [
      [0x13, "51D0", "51D5"],
      [0x10, "51D9", "51DE"],
      [0x11, "51E2", "51E7"],
    ]) {
      const before = io.readCityByte(city, offset, at);
      // SUB commits even when it borrows; the following MOV clamps separately.
      io.writeCityByte(city, offset, u8(before - damage), at);
      if (before < damage) io.writeCityByte(city, offset, 0, clampAt);
    }
  }
  let winTotal = 0,
    loseTotal = 0;
  for (let i = 0; i < 6; i++) {
    const winLoss = (io.nextByte("51F9") & 7) + 2;
    const win = Math.max(
      i === 0 ? 1 : 0,
      io.readTeamTroops(winner, i, "5200") - winLoss,
    );
    winTotal += win;
    io.writeTeamTroops(winner, i, win, "5215");
    const random = io.nextByte("5218");
    const loseLoss = (random % (ratio + i + 1)) + 8;
    const lose = Math.max(
      i === 0 ? 1 : 0,
      io.readTeamTroops(loser, i, "5225") - loseLoss,
    );
    loseTotal += lose;
    io.writeTeamTroops(loser, i, lose, "523A");
  }
  const oldWin = io.readLegionWord(winner, 4, "5249");
  io.writeLegionWord(winner, 4, winTotal, "5249");
  const oldLose = io.readLegionWord(loser, 4, "524C");
  io.writeLegionWord(loser, 4, loseTotal, "524C");
  let morale = 0;
  if (oldWin && io.readLegionByte(winner, 6, "5257") >= 100) {
    const before = io.readLegionByte(winner, 6, "525D");
    morale = u8(
      divWord(before * io.readLegionWord(winner, 4, "5260"), oldWin, "5263"),
    );
  }
  io.writeLegionByte(winner, 6, morale, "5265");
  morale = 0;
  if (oldLose && io.readLegionByte(loser, 6, "526E") >= 100)
    morale = u8(
      divWord(100 * io.readLegionWord(loser, 4, "5278"), oldLose, "527B"),
    );
  io.writeLegionByte(loser, 6, morale, "527D");
  let failed = 0;
  if (!io.continueLegion("attacker", lost === 0, "5192")) failed |= 1;
  if (!io.continueLegion("defender", lost !== 0, "51A1")) failed |= 2;
  return { ax: (failed << 8) | lost };
}

/** 4E5C dispatch. Player calls remain first-unknown stops, never FIFO RETs. */
export function dispatchOriginalFieldBattle(io) {
  const player = io.readPlayer("4E5C");
  if (player === io.readLegionByte("attacker", 1, "4E60")) {
    if (io.readLegionByte("attacker", 0, "4E70") & 4)
      return resolveOriginalFieldQuickBattle(io);
    io.writeGlobal("d2e", io.legionPointer("attacker", "4E75"), "4E75");
    io.writeGlobal("d30", io.legionPointer("defender", "4E7A"), "4E7A");
    stop("4E82", "4EB9 message call");
  }
  if (player === io.readLegionByte("defender", 1, "4E65")) {
    if (io.readLegionByte("defender", 0, "4E8A") & 4)
      return resolveOriginalFieldQuickBattle(io);
    io.writeGlobal("d35", io.readGlobal("d35", "4E8F") | 0x80, "4E8F");
    io.writeGlobal("d30", io.legionPointer("attacker", "4E95"), "4E95");
    io.writeGlobal("d2e", io.legionPointer("defender", "4E9A"), "4E9A");
    stop("4EA1", "CDE with exchanged SI/DI");
  }
  return resolveOriginalFieldQuickBattle(io); //4E6C→4E6F; NO4EAF occupancy DEC.
}
