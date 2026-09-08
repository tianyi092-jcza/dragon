import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { createFieldBattle, initializeVisualBattleStartup } = await import(
  "../web/src/game/tacticalbattle.js"
);
const { createOriginalBattleStartupStepper, runOriginalBattleStartup } =
  await import("../web/src/game/battle/originalstartup.js");
const { ORIGINAL_OBJECT, originalObjectAddress } = await import(
  "../web/src/game/battle/originalstate.js"
);
const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);
const { OriginalBattleDisplay } = await import(
  "../web/src/game/battle/originaldisplay.js"
);
const { BattleDialoguePresentation } = await import(
  "../web/src/ui/battledialogue.js"
);

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${error.message}`, {
      cause: error,
    });
  }
}

const battleMaps = parseJson(
  await fs.readFile(
    new URL("../web/battle_maps.json", import.meta.url),
    "utf8",
  ),
  "battle_maps.json",
);
battleMaps.navigation = parseJson(
  await fs.readFile(
    new URL("../web/battle_navigation.json", import.meta.url),
    "utf8",
  ),
  "battle_navigation.json",
);
battleMaps.formationVectors = parseJson(
  await fs.readFile(
    new URL("../web/battle_rules.json", import.meta.url),
    "utf8",
  ),
  "battle_rules.json",
).formationVectors;
const talkCatalog = parseJson(
  await fs.readFile(
    new URL("../web/battle_talk.json", import.meta.url),
    "utf8",
  ),
  "battle_talk.json",
);

const scenario = {
  player_faction: 0,
  generals: [
    {
      idx: 0,
      name: "甲",
      battle_formation: 0,
      ability: { force: 0, lead: 15, field: 0, siege: 0, naval: 0 },
    },
    {
      idx: 1,
      name: "乙",
      battle_formation: 0,
      ability: { force: 0, lead: 15, field: 0, siege: 0, naval: 0 },
    },
  ],
};
const legion = (leader, faction) => ({
  leader,
  faction,
  troops: 100,
  morale: 200,
  units: [
    { type: 1, troops: 1000 },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 })),
  ],
});
const create = () =>
  createFieldBattle(scenario, legion("甲", 0), legion("乙", 1), battleMaps, {
    directoryIndex: 0xc0,
    terrainClass: 0,
    mirror: false,
  });

{
  const battle = create();
  const callsBefore = battle.session.rng.calls;
  const startup = initializeVisualBattleStartup(battle);
  assert.equal(startup.frames, 50, "A1C5 always runs 0x32 A04B/A065 frames");
  assert.equal(
    startup.scriptWordSkip,
    0,
    "failed A2E8 eligibility does not skip script words",
  );
  assert.equal(battle.session.frame, 50);
  assert.equal(battle.session.registers.tacticalFrameCounter, 50);
  assert.equal(battle.session.registers.startupComplete, true);
  assert.equal(
    battle.session.rng.calls - callsBefore,
    4,
    "A2E8/A34F consumes exactly two original RNG bytes per commander",
  );
  const second = initializeVisualBattleStartup(battle);
  assert.equal(second, startup, "startup is idempotent after completion");
  assert.equal(battle.session.frame, 50);
}

{
  const battle = create();
  battle.session.registers.mode = 0;
  const callsBefore = battle.session.rng.calls;
  const startup = initializeVisualBattleStartup(battle);
  assert.equal(startup.frames, 50);
  assert.equal(
    battle.session.rng.calls,
    callsBefore,
    "non-mode1 startup has no A2E8 RNG",
  );
}

{
  // The startup frame/RNG driver below is still an isolated branch fixture,
  // but C315 now uses the actual Session message boundary rather than a stub.
  const fakeSession = new OriginalBattleSession({
    registers: { mode: 1, startupComplete: false },
  });
  const pool = fakeSession.pool;
  const first = originalObjectAddress(0, 0, 0);
  const second = originalObjectAddress(1, 0, 0);
  for (const [address, power] of [
    [first, 100],
    [second, 30],
  ]) {
    pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
    pool.write8(address, ORIGINAL_OBJECT.HP, 100);
    pool.write8(address, ORIGINAL_OBJECT.POWER, power);
    pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 8);
    pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
  }
  const bytes = [0, 0, 0, 0];
  fakeSession.rng = {
    calls: 0,
    nextByte() {
      this.calls++;
      return bytes.shift() ?? 0;
    },
  };
  const fakeHandle = { session: fakeSession };
  let ticks = 0;
  const startup = runOriginalBattleStartup(fakeHandle, {
    commanders: [
      { ability: { force: 15, lead: 0, field: 0 } },
      { ability: { force: 15, lead: 0, field: 0 } },
    ],
    tickFrame() {
      ticks++;
      fakeSession.frame++;
      if (ticks === 111) pool.write8(second, ORIGINAL_OBJECT.HP, 69);
      return { events: [], finished: false };
    },
  });
  assert.equal(startup.scriptWordSkip, 3);
  assert.equal(startup.frames, 110);
  assert.equal(fakeSession.rng.calls, 4);
  assert.deepEqual(
    startup.events
      .filter((event) => event.type === "startup-flag")
      .map((event) => event.originalId),
    [0x1b7, 0x1b9, 0x1cc],
  );
  assert.equal(pool.read8(first, ORIGINAL_OBJECT.PENDING_COMMAND), 0);
  assert.equal(pool.read8(second, ORIGINAL_OBJECT.PENDING_COMMAND), 0);
}

{
  // Browser production drives this same stepper once per tactical frame. The
  // first and second C315 calls remain observable between A065 frames instead
  // of being synchronously consumed before the first paint.
  const identity = (slot, name) => ({
    slot,
    legionPointer: 0x2240 + slot * 0x40,
    generalPointer: 0x4240 + slot * 0x20,
    name,
    portrait: slot,
    personality: 0,
  });
  const s = new OriginalBattleSession({
    registers: { mode: 1, startupComplete: false },
    talkCatalog,
    talkContext: {
      speakers: [identity(0, "甲"), identity(1, "乙")],
      advisorName: null,
    },
  });
  const first = originalObjectAddress(0, 0, 0);
  const second = originalObjectAddress(1, 0, 0);
  for (const [address, power] of [
    [first, 100],
    [second, 60],
  ]) {
    s.pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
    s.pool.write8(address, ORIGINAL_OBJECT.HP, 100);
    s.pool.write8(address, ORIGINAL_OBJECT.POWER, power);
    s.pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 8);
    s.pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
  }
  s.rng = {
    calls: 0,
    nextByte() {
      this.calls++;
      return 0;
    },
  };
  const handle = { session: s };
  const visible = [null, null];
  const presentation = new BattleDialoguePresentation({
    now: () => 0,
    schedule: () => 1,
    cancel() {},
    show(capture) {
      visible[capture.side] = capture;
    },
    hide(side) {
      visible[side] = null;
    },
  });
  presentation.start(s.events, s.messages.slots);
  const tacticalClock = { hold: false };
  const startup = createOriginalBattleStartupStepper(handle, {
    commanders: [
      { ability: { force: 15, lead: 0, field: 0 } },
      { ability: { force: 15, lead: 0, field: 0 } },
    ],
    tickFrame() {
      s.frame++;
      s.registers.tacticalFrameCounter =
        (s.registers.tacticalFrameCounter & 0xff00) |
        ((s.registers.tacticalFrameCounter + 1) & 0xff);
      return { events: [] };
    },
  });
  for (let frame = 0; frame < 50; frame++) {
    const step = startup.step();
    presentation.sync(s.events);
    assert.equal(step.advancedFrame, true);
    assert.equal(
      s.events.some((event) => event.type === "tactical-talk-show"),
      false,
    );
  }
  assert.equal(s.frame, 50);
  startup.step();
  presentation.sync(s.events);
  assert.equal(s.frame, 51);
  assert.equal(
    visible[0]?.status,
    "decoded",
    "first startup TALK is visibly decoded",
  );
  const frameWithFirstVisible = s.frame;
  for (let frame = 0; frame < 39; frame++) {
    startup.step();
    presentation.sync(s.events);
  }
  assert.equal(
    s.frame,
    frameWithFirstVisible + 39,
    "A065 advances under first panel",
  );
  assert.equal(visible[1], null);
  startup.step();
  presentation.sync(s.events);
  assert.equal(s.frame, 91);
  assert.equal(visible[0]?.status, "decoded");
  assert.equal(
    visible[1]?.status,
    "decoded",
    "second startup TALK becomes visible beside side0",
  );
  assert.equal(
    tacticalClock.hold,
    false,
    "startup panels never acquire a clock hold",
  );
  assert.equal(startup.done, false);
}

// Raw D31C/D31D remain FF through 9ACE. The first ADC8 rebuilds real counts;
// an initially empty side exits only on the second A065, with side0 precedence.
for (const [counts, winner, reason] of [
  [[0, 1], 1, "side0-empty"],
  [[1, 0], 0, "side1-empty"],
  [[0, 0], 1, "side0-empty"],
]) {
  const s = new OriginalBattleSession({ registers: { mode: 0 } });
  s.objectsInitialized = true;
  // Model the already-consumed initial 99CB boundary. The first nonterminal
  // A065 commits once; the second terminal A065 exits before B941/DDB4.
  s.nativeDisplay = new OriginalBattleDisplay();
  s.nativeDisplayBoundary = 1;
  s.nativeInitialCommitPending = false;
  assert.equal(s.registers.side0Active, 0xff);
  assert.equal(s.registers.side1Active, 0xff);
  const handle = { session: s };
  let ticks = 0;
  const stepper = createOriginalBattleStartupStepper(handle, {
    tickFrame: () => {
      ticks++;
      return s.tick({
        updateObject() {},
        recountActivity: () => ({
          side0Active: counts[0],
          side1Active: counts[1],
          side0Timed: 0,
          side1Timed: 0,
        }),
      });
    },
  });
  const first = stepper.step();
  assert.equal(first.done, false);
  assert.equal(s.finished, false);
  assert.equal(
    first.result.events.find((event) => event.type === "native-display-commit")
      ?.boundary,
    2,
  );
  assert.equal(s.nativeDisplayBoundary, 2);
  const phaseAfterFirst = s.registers.tacticalFrameCounter;
  const terminal = stepper.step();
  assert.equal(terminal.done, true);
  assert.equal(terminal.advancedFrame, true);
  assert.equal(terminal.ended, true);
  assert.equal(terminal.displayCommitted, false);
  assert.equal(s.nativeDisplayBoundary, 2);
  assert.equal(
    terminal.result.terminalFrameResult.events.some(
      (event) => event.type === "native-display-commit",
    ),
    false,
  );
  assert.equal(terminal.result.completed, false);
  assert.equal(terminal.result.framesIncludingTerminal, 2);
  assert.equal(terminal.result.terminalFrameResult.winner, winner);
  assert.equal(
    terminal.result.terminalFrameResult.events.find(
      (event) => event.type === "battle-end",
    ).reason,
    reason,
  );
  assert.equal(s.registers.tacticalFrameCounter, phaseAfterFirst + 1);
  assert.equal(s.registers.startupComplete, false);
  assert.equal(ticks, 2);
  assert.deepEqual(stepper.step(), {
    done: true,
    advancedFrame: false,
    result: terminal.result,
  });
}

// A6FA countdown precedence and winner mapping on the first startup frame.
for (const [winnerState, winner] of [
  [1, 1],
  [2, 0],
]) {
  const s = new OriginalBattleSession({
    registers: {
      mode: 0,
      winnerState,
      endCountdown: 1,
      side0Active: 1,
      side1Active: 1,
    },
  });
  const terminal = createOriginalBattleStartupStepper(
    { session: s },
    { tickFrame: () => s.tick() },
  ).step();
  assert.equal(terminal.done, true);
  assert.equal(terminal.result.framesIncludingTerminal, 1);
  assert.equal(terminal.result.terminalFrameResult.winner, winner);
  assert.equal(terminal.result.terminalFrameResult.rngCalls, 0);
  assert.equal(s.registers.startupComplete, false);
}

// Every decoded A1C5 A04B phase class uses the same nonlocal terminal escape.
// The injected finish is a boundary fixture; lifecycle branch/RNG timing above
// independently authenticates the code that reaches each listed call number.
function terminalAt({ at, powers = [100, 60], lowAt = 0, random = 255 }) {
  const s = new OriginalBattleSession({ registers: { mode: 1 } });
  for (const [index, address] of [0, 0x600].entries())
    s.pool
      .write8(address, ORIGINAL_OBJECT.FLAGS, 0x80)
      .write8(address, ORIGINAL_OBJECT.HP, 100)
      .write8(address, ORIGINAL_OBJECT.POWER, powers[index])
      .write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 8)
      .write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
  s.rng = {
    calls: 0,
    nextByte() {
      this.calls++;
      return this.calls <= 4 ? 0 : random;
    },
  };
  let calls = 0;
  const stepper = createOriginalBattleStartupStepper(
    { session: s },
    {
      commanders: [0, 1].map(() => ({
        ability: { force: 15, lead: 0, field: 0 },
      })),
      tickFrame() {
        calls++;
        s.frame++;
        s.registers.tacticalFrameCounter++;
        if (calls === lowAt) s.pool.write8(0x600, ORIGINAL_OBJECT.HP, 69);
        if (calls === at) {
          s.finished = true;
          s.winner = 0;
          return {
            events: [{ type: "battle-end", winner: 0, reason: "fixture" }],
            finished: true,
            winner: 0,
            rngCalls: s.rng.calls,
            displayCommitted: false,
          };
        }
        return { events: [], finished: false, displayCommitted: true };
      },
    },
  );
  let terminal;
  do terminal = stepper.step();
  while (!terminal.done);
  assert.equal(calls, at);
  assert.equal(terminal.ended, true);
  assert.equal(terminal.result.framesIncludingTerminal, at);
  assert.equal(s.registers.startupComplete, false);
  assert.equal(
    terminal.result.events.some(
      (event) => event.type === "startup-input-drain",
    ),
    false,
  );
  return { s, terminal };
}

for (const fixture of [
  { name: "fixed-initial", at: 1, skip: 0 },
  { name: "first-challenge", at: 51, skip: 0 },
  { name: "refusal", at: 91, powers: [100, 1], skip: 3 },
  { name: "accepted-opponent", at: 91, skip: 3 },
  { name: "duel-introduction", at: 131, skip: 3 },
  { name: "duel-loop", at: 141, skip: 3 },
  { name: "inter-round", at: 221, skip: 3 },
  { name: "loser-wait", at: 142, lowAt: 141, skip: 3 },
  { name: "final-winner", at: 162, lowAt: 141, skip: 3 },
]) {
  const { terminal } = terminalAt(fixture);
  assert.equal(terminal.result.scriptWordSkip, fixture.skip, fixture.name);
}
for (const random of [31, 32]) {
  const { s } = terminalAt({ at: 174, random });
  assert.equal(s.rng.calls, random < 32 ? 6 : 5);
}

process.stdout.write(
  "battle original startup OK: A1C5 yields, FF first counts, all nonlocal phase classes, terminal frame/RNG semantics\n",
);
