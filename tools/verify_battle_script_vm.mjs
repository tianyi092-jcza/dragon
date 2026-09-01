import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { BattleScript } = await import("../web/src/game/battlescript.js");
const { advanceOriginalScriptFrame } = await import(
  "../web/src/game/tacticalbattle.js"
);
const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);

{
  const bytes = [0xab];
  const vm = new BattleScript([(5 << 8) | 9], {
    nextRandomByte() {
      assert.ok(bytes.length, "op9 must consume exactly one original RNG byte");
      return bytes.shift();
    },
  });
  vm.step();
  assert.equal(vm.R, 0xab % 5);
  assert.equal(bytes.length, 0);
}

{
  const bytes = [0xfe];
  const vm = new BattleScript([9], {
    nextRandomByte() {
      return bytes.shift();
    },
  });
  vm.step();
  assert.equal(vm.R, 0, "A57A AH=0 substitutes divisor 1");
  assert.equal(bytes.length, 0);
}

{
  const vm = new BattleScript([(3 << 8) | (7 << 5) | 3], {
    gate2: () => false,
    themeFlag: () => false,
    issueCmd(command, group) {
      assert.equal(command, 1, "A4D7 remaps command3 when theme flag is clear");
      assert.equal(group, 7);
    },
  });
  vm.step();
}

assert.throws(
  () => new BattleScript([(5 << 8) | 9], {}).step(),
  /requires original RNG byte/,
);

{
  const calls = [];
  const vm = new BattleScript([(3 << 8) | 16], {
    flags: (count) => calls.push(count),
  });
  vm.step();
  assert.deepEqual(calls, [3], "op16 forwards the C315 repeat count");
}

{
  const order = [];
  const session = new OriginalBattleSession();
  const originalTick = session.tick.bind(session);
  session.tick = (options) => {
    order.push("A065");
    return originalTick(options);
  };
  const handle = {
    over: null,
    logicAccumulator: 0,
    session,
    sideMap: { 0: "atk", 1: "def" },
    playerSide: "atk",
    originalFormation: null,
    originalPathBuilder: null,
    originalLastEvents: [],
    units: [],
    dialogues: [],
    nextDialogueSequence: 0,
    kind: "field",
  };
  session.enqueue({
    type: "tactical-command",
    frame: 0,
    side: 0,
    groups: [0],
    commandNumber: 1,
  });
  const vm = {
    step() {
      order.push("A426");
      assert.equal(
        session.queue.snapshot().length,
        0,
        "9FA0 consumes player input before A426",
      );
      return "run";
    },
  };
  const first = advanceOriginalScriptFrame(handle, vm);
  assert.deepEqual(order, ["A426", "A065"]);
  assert.ok(first.events.some((event) => event.type === "command"));
  advanceOriginalScriptFrame(handle, vm);
  assert.deepEqual(order, ["A426", "A065", "A426", "A065"]);
}

{
  const vm = new BattleScript([(255 << 8) | 0, (0 << 8) | 10, 0], {});
  for (let frame = 0; frame < 5001; frame++) vm.step();
  assert.equal(
    vm.done,
    false,
    "valid looping BATTLE.DAT VM has no Web step cap",
  );
}

assert.throws(
  () => new BattleScript([31], {}).step(),
  /opcode 31 is outside A466 table/,
);

{
  let blocks;
  try {
    blocks = JSON.parse(
      await fs.readFile(
        new URL("../web/battle_scripts.json", import.meta.url),
        "utf8",
      ),
    );
  } catch (error) {
    throw new Error("cannot load battle_scripts.json", { cause: error });
  }
  assert.equal(blocks.length, 32);
  for (const [block, words] of blocks.entries()) {
    const vm = new BattleScript(words, {
      nextRandomByte: () => 0,
      formation() {},
      issueCmd() {},
      select() {},
    });
    for (let frame = 0; frame < 10000; frame++) vm.step();
    assert.equal(
      vm.done,
      false,
      `BATTLE.DAT block ${block} remains a live loop`,
    );
  }
}

process.stdout.write(
  "battle script VM OK: A426 op9 original RNG + A4BF command remap\n",
);
