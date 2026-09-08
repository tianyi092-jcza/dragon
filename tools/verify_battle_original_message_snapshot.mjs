// B1/B2/B3 regression derived from the read-only independent review fixture
// 0f77e6d9-b009-427d-b22f-60f494f6ffe0/battle-talk-independent-fixture.mjs.
// Original external evidence is unchanged. All state here is in memory.
import assert from "node:assert/strict";
import fs from "node:fs";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid ${label} JSON`, { cause: error });
  }
}
function cloneJson(value) {
  return parseJson(JSON.stringify(value), "snapshot");
}
function readJson(path) {
  try {
    return parseJson(fs.readFileSync(path, "utf8"), path);
  } catch (error) {
    throw new Error(`cannot read ${path}`, { cause: error });
  }
}
const catalog = readJson("web/battle_talk.json");
const context = {
  speakers: [
    {
      slot: 0,
      legionPointer: 0x2240,
      generalPointer: 0x4240,
      name: "甲",
      portrait: 0,
      personality: 0,
    },
    {
      slot: 1,
      legionPointer: 0x2280,
      generalPointer: 0x4260,
      name: "乙",
      portrait: 1,
      personality: 0,
    },
  ],
  advisorName: "丙",
};
const session = (options = {}) =>
  new OriginalBattleSession({
    talkCatalog: catalog,
    talkContext: context,
    registers: { side0Active: 1, side1Active: 1, tacticalFrameCounter: 0x1234 },
    ...options,
  });
const source = session({ frame: 73 });
source.emitTalk(0, 0x1b7, "independent-review");
source.messages.showWall(source.registers, 100, 0x80, 0xc00);
source.pool.bytes[111] = 91;
source.effects.bytes[17] = 7;
source.rng.nextByte();
source.enqueue({ frame: 99, type: "group-toggle", group: 2 });
const saved = source.snapshot();
function target() {
  const s = session({ frame: 11 });
  s.registers.tacticalFrameCounter = 0x456;
  s.emitTalk(1, 0x1b8, "target-existing");
  s.messages.showWall(s.registers, 300, 0x80, 0xc20);
  s.pool.bytes[112] = 56;
  for (let i = 0; i < 3; i++) s.rng.nextByte();
  s.enqueue({ frame: 90, type: "group-toggle", group: 0 });
  return s;
}
function identities(s) {
  return [
    s.registers,
    s.rng,
    s.rng.table,
    s.queue,
    s.events,
    s.playerGroupStatusIcons,
    s.objectDisplays,
    ...[s.pool, s.effects, s.mapObjects, s.spatial, s.paths, s.temps].flatMap(
      (p) => [p, p.bytes],
    ),
    s.spatial.tiles,
    s.spatial.tileAttributes,
    s.messages,
    s.messages.context,
    s.messages.context.speakers,
    ...s.messages.context.speakers,
    s.messages.slots,
    s.messages.slots[1],
    s.messages.slots[1].speaker,
    s.messages.slots[1].opponent,
    s.messages.slots[1].rawLines,
    s.messages.slots[1].lines,
    s.messages.wall,
  ];
}
let refusals = 0;
function refuse(name, mutate, { base = saved, inMemory = false } = {}) {
  const input = structuredClone(base);
  mutate(input);
  if (!inMemory) {
    if (input.messages !== undefined)
      input.messages = cloneJson(input.messages);
    input.registers = cloneJson(input.registers);
  }
  const s = target(),
    before = s.snapshot(),
    refs = identities(s);
  assert.throws(() => s.restore(input), undefined, name);
  assert.deepEqual(
    s.snapshot(),
    before,
    `${name}: every snapshot byte/register/RNG/command/event/capture unchanged`,
  );
  const after = identities(s);
  refs.forEach((ref, i) =>
    assert.equal(after[i], ref, `${name}: identity ${i}`),
  );
  refusals++;
}
// Minimal external reproducer cases, including nonempty differently seeded target.
for (const [name, mutate] of [
  [
    "missing messages",
    (s) => {
      delete s.messages;
    },
  ],
  [
    "missing C405",
    (s) => {
      delete s.messages.wallMinimum;
    },
  ],
  [
    "unsupported revision",
    (s) => {
      s.messages.revision = 2;
    },
  ],
  [
    "wrong hash",
    (s) => {
      s.messages.catalogHash = "wrong";
    },
  ],
  [
    "stripped decoded",
    (s) => {
      const q = s.messages.slots[0];
      s.messages.slots[0] = {
        side: 0,
        hitId: 27,
        deadline: q.deadline,
        selector: q.selector,
        status: "decoded",
      };
    },
  ],
  [
    "missing speaker",
    (s) => {
      delete s.messages.slots[0].speaker;
    },
  ],
  [
    "missing raw/rendered text",
    (s) => {
      for (const k of ["rawLines", "lines", "text"])
        delete s.messages.slots[0][k];
    },
  ],
  [
    "lost context",
    (s) => {
      s.messages.context = null;
    },
  ],
  [
    "unknown status",
    (s) => {
      s.messages.slots[0].status = "bogus";
    },
  ],
  [
    "oversize selector",
    (s) => {
      s.messages.slots[0].selector = 65536;
    },
  ],
  [
    "stripped wall",
    (s) => {
      s.messages.wall = {
        metric: s.messages.wallMinimum,
        deadline: s.registers.wallMarkerAt,
      };
    },
  ],
  [
    "marker overflow",
    (s) => {
      s.registers.side0MarkerAt = s.messages.slots[0].deadline = 0x11270;
    },
  ],
  [
    "counter overflow",
    (s) => {
      s.registers.tacticalFrameCounter = 0x11234;
    },
  ],
  [
    "legacy missing words",
    (s) => {
      delete s.messages;
      for (const k of [
        "tacticalFrameCounter",
        "side0MarkerAt",
        "side1MarkerAt",
        "wallMarkerAt",
      ])
        delete s.registers[k];
    },
  ],
])
  refuse(name, mutate);
refuse(
  "noncloneable slot",
  (s) => {
    s.messages.slots[0].extra = () => {};
  },
  { inMemory: true },
);
// Independently mutate every required retained capture field (not catalog output).
for (const key of [
  "side",
  "hitId",
  "deadline",
  "selector",
  "status",
  "index",
  "offset",
  "speaker",
  "opponent",
  "rawLines",
  "lines",
  "text",
  "argumentWordsConsumed",
])
  refuse(`decoded missing ${key}`, (s) => {
    delete s.messages.slots[0][key];
  });
for (const key of [
  "label",
  "hitId",
  "address",
  "value",
  "maximum",
  "metric",
  "deadline",
])
  refuse(`wall missing ${key}`, (s) => {
    delete s.messages.wall[key];
  });
for (const location of [
  (s) => s.messages.context.speakers[0],
  (s) => s.messages.slots[0].speaker,
  (s) => s.messages.slots[0].opponent,
]) {
  for (const key of [
    "slot",
    "legionPointer",
    "generalPointer",
    "name",
    "portrait",
    "personality",
  ])
    refuse(`identity missing ${key}`, (s) => {
      delete location(s)[key];
    });
  for (const [key, value] of [
    ["slot", 128],
    ["legionPointer", 0],
    ["generalPointer", 0],
    ["name", 7],
    ["portrait", 256],
    ["personality", 256],
    ["personality", -1],
  ])
    refuse(`identity invalid ${key}=${value}`, (s) => {
      location(s)[key] = value;
    });
}
for (const [key, value] of [
  ["selector", -1],
  ["index", 65536],
  ["index", 671],
  ["offset", -1],
  ["offset", 65536],
  ["rawLines", [1]],
  ["lines", [false]],
  ["text", null],
  ["text", "wrong"],
  ["argumentWordsConsumed", -1],
  ["argumentWordsConsumed", 1.5],
])
  refuse(`decoded invalid ${key}`, (s) => {
    s.messages.slots[0][key] = value;
  });
for (const [key, value] of [
  ["address", 0xc01],
  ["address", 0xb00],
  ["address", 0x2000],
  ["value", 152],
  ["value", 5],
  ["maximum", 150],
  ["hitId", 28],
  ["label", "wrong"],
])
  refuse(`wall invalid ${key}`, (s) => {
    s.messages.wall[key] = value;
  });
for (const mutate of [
  (s) => {
    delete s.messages.context.advisorName;
  },
  (s) => {
    s.messages.context.speakers.pop();
  },
  (s) => {
    s.messages.context.speakers[0] = null;
  },
  (s) => {
    s.messages.context.advisorName = 7;
  },
  (s) => {
    s.messages.slots[1] = null;
    s.registers.side1MarkerAt = 1;
  },
  (s) => {
    s.messages.wall = null;
  },
])
  refuse("context/slot/wall consistency", mutate);

const empty = session().snapshot();
for (const legacy of [false, true])
  for (const key of [
    "tacticalFrameCounter",
    "side0MarkerAt",
    "side1MarkerAt",
    "wallMarkerAt",
  ]) {
    for (const value of [
      undefined,
      null,
      -1,
      65536,
      0.5,
      "65535",
      NaN,
      Infinity,
    ]) {
      refuse(
        `${legacy ? "legacy" : "new"} explicit word ${key}=${value}`,
        (s) => {
          if (legacy) delete s.messages;
          if (value === undefined) delete s.registers[key];
          else s.registers[key] = value;
        },
        { base: empty, inMemory: true },
      );
    }
    refuse(
      `inherited word ${key}`,
      (s) => {
        if (legacy) delete s.messages;
        const value = s.registers[key];
        delete s.registers[key];
        Object.setPrototypeOf(s.registers, { [key]: value });
      },
      { base: empty, inMemory: true },
    );
  }
for (const value of [false, 0, "", {}, []])
  refuse(
    "not a message snapshot",
    (s) => {
      s.messages = value;
    },
    { base: empty },
  );
for (const where of [
  (s) => s.messages,
  (s) => s.messages.context,
  (s) => s.messages.wall,
  (s) => s.messages.slots[0].opponent,
  (s) => s.events[0],
])
  refuse(
    "noncloneable nested payload",
    (s) => {
      where(s).extra = () => {};
    },
    { inMemory: true },
  );
for (const extra of [
  Symbol("bad"),
  new WeakMap(),
  new Date(),
  new Uint8Array(1),
])
  refuse(
    "unsupported data type",
    (s) => {
      s.messages.extra = extra;
    },
    { inMemory: true },
  );
refuse(
  "proxy",
  (s) => {
    s.messages.extra = new Proxy({}, {});
  },
  { inMemory: true },
);
refuse(
  "cycle",
  (s) => {
    s.messages.extra = s.messages;
  },
  { inMemory: true },
);
refuse(
  "sparse context",
  (s) => {
    delete s.messages.context.speakers[0];
  },
  { base: empty, inMemory: true },
);
let accessorReads = 0;
refuse(
  "accessor never invoked",
  (s) => {
    Object.defineProperty(s.messages.slots[0], "extra", {
      enumerable: true,
      get() {
        accessorReads++;
        return 1;
      },
    });
  },
  { inMemory: true },
);
assert.equal(accessorReads, 0);
refuse(
  "non-enumerable noncloneable",
  (s) => {
    Object.defineProperty(s.messages, "extra", { value: () => {} });
  },
  { inMemory: true },
);
refuse(
  "symbol-key payload",
  (s) => {
    s.messages[Symbol("bad")] = () => {};
  },
  { inMemory: true },
);

function roundtrip(s) {
  const input = s.snapshot();
  input.messages = cloneJson(input.messages);
  const twin = session();
  twin.restore(input);
  assert.deepEqual(twin.snapshot(), s.snapshot());
  assert.notEqual(twin.messages.slots, s.messages.slots);
  assert.notEqual(twin.messages.context, s.messages.context);
  return twin;
}
roundtrip(source);
for (const personality of [8, 255]) {
  const c = structuredClone(context);
  c.speakers[0].personality = personality;
  const s = session({ talkContext: c });
  s.emitTalk(0, 0x1b7, "byte-personality");
  assert.equal(s.messages.slots[0].status, "decoded");
  assert.equal(s.messages.slots[0].index, 670 + personality);
  assert.equal(roundtrip(s).messages.slots[0].speaker.personality, personality);
}
for (const [options, selector, status] of [
  [{ talkContext: null }, 0x1b7, "unresolved-slot-context"],
  [
    {
      talkContext: { speakers: [null, context.speakers[1]], advisorName: null },
    },
    0x1b7,
    "unresolved-slot-context",
  ],
  [{ talkCatalog: null }, 0x1b7, "unresolved-talk-asset"],
  [{}, 0xffff, "unresolved-talk-index"],
  [
    {
      talkContext: {
        speakers: [
          { ...context.speakers[0], personality: 2 },
          context.speakers[1],
        ],
        advisorName: null,
      },
    },
    0x1ac,
    "unresolved-talk-arguments",
  ],
]) {
  const s = session(options);
  s.emitTalk(0, selector, "unresolved");
  assert.equal(s.messages.slots[0].status, status);
  const twin = session(options),
    input = s.snapshot();
  input.messages = cloneJson(input.messages);
  twin.restore(input);
  assert.deepEqual(twin.snapshot(), s.snapshot());
  for (const key of ["status", "selector", "deadline"])
    refuse(
      `${status} missing ${key}`,
      (x) => {
        delete x.messages.slots[0][key];
      },
      { base: input },
    );
  if (
    status === "unresolved-talk-index" ||
    status === "unresolved-talk-arguments"
  )
    refuse(
      `${status} missing index`,
      (x) => {
        delete x.messages.slots[0].index;
      },
      { base: input },
    );
}
// Advisor null is also valid for decoded records that never use \\4.
const noAdvisor = session({ talkContext: { ...context, advisorName: null } });
noAdvisor.emitTalk(0, 0x1b7, "no-advisor");
roundtrip(noAdvisor);
// Captured names/text are retained, NOT recreated from target context/catalog.
const history = structuredClone(saved);
history.messages.slots[0].lines[0] = "retained history";
history.messages.slots[0].text = history.messages.slots[0].lines.join("\n");
const historyTarget = target();
historyTarget.restore(history);
assert.equal(historyTarget.messages.slots[0].lines[0], "retained history");
history.messages.slots[0].lines[0] = "poison";
history.messages.context.speakers[0].name = "poison";
assert.equal(historyTarget.messages.slots[0].lines[0], "retained history");
assert.equal(historyTarget.messages.context.speakers[0].name, "甲");
const legacy = structuredClone(empty);
delete legacy.messages;
assert.doesNotThrow(() => session().restore(legacy));
legacy.registers.tacticalFrameCounter = 0xff00;
refuse("ambiguous legacy FFFF", () => {}, { base: legacy });
// New explicit empty FFFF remains valid even at D319=FF; runtime still closes it.
const ff = session();
ff.registers.tacticalFrameCounter = 0xfffe;
const ffTwin = roundtrip(ff);
const rng = ffTwin.rng.snapshot();
const tick = ffTwin.tick();
assert.deepEqual(
  tick.events.filter((e) => e.type === "side-marker").map((e) => e.side),
  [0],
);
assert.deepEqual(ffTwin.rng.snapshot(), rng);
// Same-deadline side1 is deferred across restore, never expired/replayed early.
for (const high of [0, 0xff00]) {
  const s = session();
  s.registers.tacticalFrameCounter = high | 0xc3;
  s.emitTalk(0, 0x1b7, "deferred");
  s.emitTalk(1, 0x1b8, "deferred");
  for (let i = 0; i < 60; i++) s.tick();
  assert.equal(s.messages.slots[0], null);
  assert.ok(s.messages.slots[1]);
  const twin = roundtrip(s);
  for (let i = 0; i < 256; i++) {
    s.tick();
    twin.tick();
  }
  assert.deepEqual(twin.snapshot(), s.snapshot());
  assert.equal(Boolean(s.messages.slots[1]), high === 0xff00);
}
// C405 and saved bar survive; equal/higher values cannot extend the deadline.
const wallTwin = roundtrip(source);
wallTwin.registers.tacticalFrameCounter++;
wallTwin.messages.showWall(wallTwin.registers, 100, 0x80, 0xc00);
assert.equal(wallTwin.registers.wallMarkerAt, saved.registers.wallMarkerAt);
wallTwin.messages.showWall(wallTwin.registers, 101, 0x80, 0xc00);
assert.equal(wallTwin.messages.wallMinimum, 100);
console.log(
  `message snapshot OK: ${refusals} atomic refusals; all statuses, retained identities/text, byte personalities, wall/legacy/new FFFF/deferred continuation`,
);
