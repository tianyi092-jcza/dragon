import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  EMPTY_FACTION,
  buildDiplomacyCandidates,
  factionStrategicPower,
  runStrategicDiplomacy,
} from "../web/src/game/diplomacy.js";
import {
  initializeStrategicDiplomacy,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";
import {
  OriginalBattleRng,
  originalBiosClockFromDate,
} from "../web/src/game/battle/originalrng.js";

let data;
try {
  data = JSON.parse(
    await readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error("failed to load generated scenario data", { cause: error });
}
assert.equal(data.scenarios.length, 20, "生成物必须包含五套来源的20章");

function oracleRelation(sc, from, to) {
  if (from == null || to == null) return 0xb7;
  if (from === to) return 0xff;
  return sc.diplomacy?.[from]?.[to] ?? 0xb7;
}

function oraclePower(faction) {
  if (!faction) return 0;
  let power =
    ((faction.reserve_cav ?? 0) >> 2) +
    ((faction.reserve_arc ?? 0) >> 2) +
    ((faction.reserve_inf ?? 0) >> 2);
  const cityCap = Math.max(0, (faction.n_cities ?? 0) << 8);
  if (power >= cityCap || power > 2000) power = 2000;
  return (resourceWord(faction) & 0xffff) <= 19 ? 0 : power;
}

function activeFactions(sc) {
  return (sc.factions ?? [])
    .slice(0, 0x16)
    .filter(
      (faction) =>
        faction &&
        faction.active !== false &&
        !faction.dead &&
        (faction.attr == null || faction.attr >= 0x80),
    );
}

/** 独立复刻0x2C52/0x2CDF/0x2C8A，不调用产品候选实现。 */
function oracleCandidates(sc, factionIdx) {
  const seen = new Set();
  const candidates = [];
  let touchesEmptyCity = false;
  for (const city of (sc.cities ?? []).slice(0, 0xc0)) {
    if (city?.faction !== factionIdx || typeof city.raw !== "string") continue;
    const bytes = Uint8Array.from(city.raw.match(/../g) ?? [], (value) =>
      Number.parseInt(value, 16),
    );
    for (let direction = 0; direction < 4; direction++) {
      if ((bytes[0] & (1 << direction)) === 0) continue;
      const neighbour = sc.cities?.[bytes[0x1c + direction]];
      if (neighbour?.faction == null || neighbour.faction === EMPTY_FACTION) {
        touchesEmptyCity = true;
        continue;
      }
      if (neighbour.faction === factionIdx || seen.has(neighbour.faction))
        continue;
      seen.add(neighbour.faction);
      const raw = oracleRelation(sc, factionIdx, neighbour.faction);
      candidates.push({
        factionIdx: neighbour.faction,
        raw,
        atWarSnapshot: raw < 0x80,
      });
    }
  }
  for (let start = 0; start < candidates.length - 1; start++) {
    let minimum = start;
    for (let index = start + 1; index < candidates.length; index++) {
      if (candidates[index].raw < candidates[minimum].raw) minimum = index;
    }
    if (minimum !== start)
      [candidates[start], candidates[minimum]] = [
        candidates[minimum],
        candidates[start],
      ];
  }
  return { candidates, touchesEmptyCity };
}

function decrease(sc, from, to, delta) {
  const raw = oracleRelation(sc, from, to);
  sc.diplomacy[from][to] = (raw & 0x80) | Math.max(0, (raw & 0x7f) - delta);
}

function resourceWord(faction) {
  return (Number(faction?.gold ?? faction?.money ?? 0) | 0) >> 8;
}

function oracleShouldDeclare(sc, faction, candidateIdx) {
  if (candidateIdx == null || candidateIdx === faction.target_faction)
    return false;
  const threshold = Math.min(((faction.n_cities ?? 0) << 4) + 0x40, 0x061a);
  if (threshold >= resourceWord(faction)) return false;
  const bell = faction.bellicosity ?? 0;
  if (
    oracleRelation(sc, faction.idx, candidateIdx) >
    (0x80 | (bell + (bell >> 1) + 0x14))
  )
    return false;
  const enemy = sc.factions.find((item) => item?.idx === candidateIdx);
  const enemyPower = oraclePower(enemy);
  return oraclePower(faction) >= enemyPower - (enemyPower >> 2);
}

/** 独立复刻0x2D58..0x2FB0；返回事件尝试顺序与最终关系/目标。 */
function oracleStrategicDiplomacy(sc) {
  const work = new Map(
    activeFactions(sc).map((faction) => [
      faction.idx,
      oracleCandidates(sc, faction.idx),
    ]),
  );
  const events = [];
  for (const faction of activeFactions(sc)) {
    const row = work.get(faction.idx);
    const candidates = row.candidates;
    const first = candidates[0] ?? null;
    if (faction.idx === sc.player_faction) {
      if (first) {
        decrease(sc, faction.idx, first.factionIdx, 1);
        if (!first.atWarSnapshot)
          decrease(sc, faction.idx, first.factionIdx, 7);
      }
      for (const other of activeFactions(sc)) {
        if (other.idx !== faction.idx) decrease(sc, other.idx, faction.idx, 1);
      }
    } else if (first) {
      const raw = oracleRelation(sc, faction.idx, first.factionIdx);
      if (raw >= 0x80) {
        sc.diplomacy[faction.idx][first.factionIdx] =
          0x80 | (Math.max(raw & 0x7f, 22) - 2);
      } else if (first.factionIdx !== sc.player_faction && raw < 50) {
        sc.diplomacy[faction.idx][first.factionIdx] = raw + 1;
      }
    }

    const targetIdx = faction.target_faction;
    if (
      targetIdx != null &&
      targetIdx !== sc.player_faction &&
      candidates.some(
        (candidate) =>
          candidate.factionIdx === sc.player_faction &&
          !candidate.atWarSnapshot,
      ) &&
      oracleRelation(sc, faction.idx, sc.player_faction) >= 0x80 &&
      oracleRelation(sc, targetIdx, sc.player_faction) >= 0xa3
    ) {
      events.push({
        type: 2,
        arg0: sc.player_faction,
        arg1: faction.idx,
        arg2: targetIdx,
      });
    }

    if (faction.idx !== sc.player_faction && first?.atWarSnapshot) {
      let remaining = oraclePower(faction);
      let startIndex = -1;
      for (let index = 0; index < Math.min(0x15, candidates.length); index++) {
        const candidate = candidates[index];
        if (!candidate.atWarSnapshot) break;
        const enemy = sc.factions.find(
          (item) => item?.idx === candidate.factionIdx,
        );
        remaining -= oraclePower(enemy);
        if (remaining <= 0) {
          startIndex = index;
          break;
        }
      }
      if (startIndex >= 0) {
        for (
          let index = startIndex;
          index < Math.min(0x15, candidates.length);
          index++
        ) {
          const candidate = candidates[index];
          if (!candidate.atWarSnapshot) break;
          if (candidate.factionIdx === first.factionIdx) continue;
          events.push({
            type: 3,
            arg0: faction.idx,
            arg1: candidate.factionIdx,
            arg2: 0xff,
          });
        }
      }
    }

    const declared = oracleShouldDeclare(sc, faction, first?.factionIdx);
    let preserveEmpty = false;
    if (declared) {
      events.push({
        type: 1,
        aggressor: faction.idx,
        defender: first.factionIdx,
      });
    } else {
      const targetByte =
        faction.target_faction == null ? 0xff : faction.target_faction & 0xff;
      if (targetByte >= EMPTY_FACTION) {
        const threshold = Math.min(
          ((faction.n_cities ?? 0) << 4) + 0x60,
          0x06dd,
        );
        if (row.touchesEmptyCity && threshold < resourceWord(faction)) {
          if (targetByte === EMPTY_FACTION) preserveEmpty = true;
          else
            events.push({
              type: 1,
              aggressor: faction.idx,
              defender: EMPTY_FACTION,
            });
        } else {
          faction.target_faction = null;
        }
      }
    }
    const targetByte =
      faction.target_faction == null ? 0xff : faction.target_faction & 0xff;
    if (
      !preserveEmpty &&
      (targetByte === EMPTY_FACTION ||
        !first?.atWarSnapshot ||
        first.factionIdx !== targetByte)
    )
      faction.target_faction = null;
  }
  return events;
}

let combinations = 0;
for (
  let scenarioIndex = 0;
  scenarioIndex < data.scenarios.length;
  scenarioIndex++
) {
  const template = data.scenarios[scenarioIndex];
  assert.equal(template.cities.length, 0xc0);
  assert.equal(template.diplomacy.length, template.factions.length);
  for (let row = 0; row < template.diplomacy.length; row++) {
    assert.equal(template.diplomacy[row].length, template.factions.length);
    for (const raw of template.diplomacy[row])
      assert.ok(Number.isInteger(raw) && 0 <= raw && raw <= 0xff);
  }
  for (const player of activeFactions(template)) {
    combinations++;
    const actual = structuredClone(template);
    const expected = structuredClone(template);
    actual.player_faction = player.idx;
    expected.player_faction = player.idx;

    for (const faction of activeFactions(template)) {
      assert.deepEqual(
        buildDiplomacyCandidates(actual, faction.idx),
        oracleCandidates(expected, faction.idx),
        `SC${scenarioIndex} 玩家${player.idx} 势力${faction.idx}候选表`,
      );
    }

    const actualEvents = runStrategicDiplomacy(actual);
    const expectedEvents = oracleStrategicDiplomacy(expected);
    assert.deepEqual(
      actualEvents,
      expectedEvents,
      `SC${scenarioIndex} 玩家${player.idx}外交事件`,
    );
    assert.deepEqual(
      actual.diplomacy,
      expected.diplomacy,
      `SC${scenarioIndex} 玩家${player.idx}外交矩阵`,
    );
    assert.deepEqual(
      actual.factions.map((faction) => faction.target_faction),
      expected.factions.map((faction) => faction.target_faction),
      `SC${scenarioIndex} 玩家${player.idx}战略目标`,
    );
    assert.equal(
      actualEvents.some((event) => event.type === 2 || event.type === 3),
      false,
      "20章新鲜SINARIO全部和平且目标为FF，不应开局生成type2/3",
    );
  }
}

// 最小marker回归：和平候选即使不接壤空城也必须累计-8。
{
  const scenario = {
    player_faction: 0,
    factions: [
      {
        idx: 0,
        attr: 0x80,
        active: true,
        money: 0,
        n_cities: 1,
        target_faction: null,
      },
      {
        idx: 1,
        attr: 0x80,
        active: true,
        money: 0,
        n_cities: 1,
        target_faction: null,
      },
    ],
    diplomacy: [
      [0xff, 0xa0],
      [0xa0, 0xff],
    ],
    cities: [
      {
        idx: 0,
        faction: 0,
        raw: "0100000000000000000000000000000000000000000000000000000001000000",
      },
      {
        idx: 1,
        faction: 1,
        raw: "0100000000000000000000000000000000000000000000000000000000000000",
      },
    ],
  };
  runStrategicDiplomacy(scenario);
  assert.equal(scenario.diplomacy[0][1], 0x98);
}

// 交战marker回归：即使另有空城，玩家对首候选也只能-1。
{
  const raw = new Uint8Array(32);
  raw[0] = 3;
  raw[0x1c] = 1;
  raw[0x1d] = 2;
  const scenario = {
    player_faction: 0,
    factions: [
      { idx: 0, attr: 0x80, active: true, money: 0, n_cities: 1 },
      { idx: 1, attr: 0x80, active: true, money: 0, n_cities: 1 },
    ],
    diplomacy: [
      [0xff, 0x20],
      [0x20, 0xff],
    ],
    cities: [
      { idx: 0, faction: 0, raw: Buffer.from(raw).toString("hex") },
      { idx: 1, faction: 1, raw: "".padStart(64, "0") },
      { idx: 2, faction: null, raw: "".padStart(64, "0") },
    ],
  };
  runStrategicDiplomacy(scenario);
  assert.equal(scenario.diplomacy[0][1], 0x1f);
}

// 0x2F71：接壤空城且资金过门槛时生成目标0x18的type1。
{
  const raw = new Uint8Array(32);
  raw[0] = 1;
  raw[0x1c] = 1;
  const scenario = {
    player_faction: 0,
    factions: [
      {
        idx: 0,
        attr: 0x80,
        active: true,
        money: 0x20000,
        n_cities: 1,
        reserve_cav: 0,
        reserve_arc: 0,
        reserve_inf: 0,
        target_faction: null,
      },
    ],
    diplomacy: [[0xff]],
    cities: [
      { idx: 0, faction: 0, raw: Buffer.from(raw).toString("hex") },
      { idx: 1, faction: null, raw: "".padStart(64, "0") },
    ],
  };
  assert.deepEqual(runStrategicDiplomacy(scenario), [
    { type: 1, aggressor: 0, defender: EMPTY_FACTION },
  ]);
}

// 0x3091最后资金门是无符号比较；负Q256不能被误判为<=19。
assert.ok(
  factionStrategicPower({
    money: -256,
    n_cities: 1,
    reserve_cav: 400,
    reserve_arc: 400,
    reserve_inf: 400,
  }) > 0,
);

// 两个用户复现锚点都由同一算法产生，不写章节特判。
for (const [scenarioIndex, playerName, aggressorName, defenderName] of [
  [16, "曹操", "曹操", "呂布"],
  [17, "劉備", "曹操", "劉備"],
]) {
  const scenario = structuredClone(data.scenarios[scenarioIndex]);
  scenario.player_faction = scenario.factions.find(
    (faction) => faction.monarch.trim() === playerName,
  ).idx;
  const aggressor = scenario.factions.find(
    (faction) => faction.monarch.trim() === aggressorName,
  );
  const defender = scenario.factions.find(
    (faction) => faction.monarch.trim() === defenderName,
  );
  const events = runStrategicDiplomacy(scenario);
  assert.ok(
    events.some(
      (event) =>
        event.type === 1 &&
        event.aggressor === aggressor.idx &&
        event.defender === defender.idx,
    ),
    `SC${scenarioIndex} ${aggressorName}应向${defenderName}生成type1`,
  );
}

// canonical RNG下验证真实入槽与“数日后”提交；不会退化成固定0号槽。
{
  const scenario = structuredClone(data.scenarios[17]);
  scenario.player_faction = scenario.factions.find(
    (faction) => faction.monarch.trim() === "劉備",
  ).idx;
  const messages = [];
  const rng = new OriginalBattleRng();
  const app = {
    scenario,
    originalRng: rng,
    gamebar: {
      enqueueStrategicMessage(message) {
        messages.push(message);
      },
      enqueueTalkMessage(message) {
        messages.push(message);
      },
    },
  };
  initializeStrategicDiplomacy(app);
  let hour = null;
  for (let current = 1; current <= 24 * 10; current++) {
    tickStrategicWarEvents(app);
    while (messages.length) messages.shift().onClose?.();
    if (scenario.diplomacy[0][2] < 0x80) {
      hour = current;
      break;
    }
  }
  assert.equal(hour, 167, "00:00:00固定回放种子下赤壁曹操应在第7天进入交战");
}

// 0xEC82只在进程启动时以INT 1Ah/AH=2的BCD本地时间播种。Web显式
// 夹具可保持可回放；真实启动时钟应让同一type1的槽位/逻辑日期随时间变化。
assert.deepEqual(originalBiosClockFromDate(new Date(2000, 0, 1, 13, 45, 9)), {
  ch: 0x13,
  cl: 0x45,
  dh: 0x09,
});
assert.throws(
  () => originalBiosClockFromDate(new Date("invalid")),
  /valid Date/,
);
for (const { scenarioIndex, playerName, aggressor, defender } of [
  { scenarioIndex: 16, playerName: "曹操", aggressor: 0, defender: 13 },
  { scenarioIndex: 17, playerName: "劉備", aggressor: 0, defender: 2 },
]) {
  const scheduledHours = new Set();
  for (const clock of [
    { ch: 0x00, cl: 0x00, dh: 0x00 },
    { ch: 0x12, cl: 0x34, dh: 0x56 },
    { ch: 0x23, cl: 0x59, dh: 0x59 },
  ]) {
    const scenario = structuredClone(data.scenarios[scenarioIndex]);
    scenario.player_faction = scenario.factions.find(
      (faction) => faction.monarch.trim() === playerName,
    ).idx;
    initializeStrategicDiplomacy({
      scenario,
      originalRng: new OriginalBattleRng(clock),
    });
    const slot = scenario.strategicEventSlots.findIndex(
      (event) =>
        event?.type === 1 &&
        event.aggressor === aggressor &&
        event.defender === defender,
    );
    assert.ok(slot >= 0, `SC${scenarioIndex}必须排入指定type1`);
    // 2BD9先等7次3E11，之后每槽相隔10次；slot因此决定逻辑日期。
    scheduledHours.add(7 + slot * 10);
  }
  assert.ok(
    scheduledHours.size > 1,
    `SC${scenarioIndex}的原始时钟种子必须改变${playerName}相关type1时刻`,
  );
}

process.stdout.write(
  `diplomacy all-scenario verification passed: ${combinations} player/scenario combinations + dynamic marker/RNG cases\n`,
);
