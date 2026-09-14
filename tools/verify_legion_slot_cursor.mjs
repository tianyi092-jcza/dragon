import assert from "node:assert/strict";
import test from "node:test";

import { LegionSlotBatch } from "../web/src/game/legionscheduler.js";

// Sequencing tests only: no simulated battle/message return is presented as
// an original execution certificate. No files, browser or saves are accessed.
function cursor(settleDaily = false, endSlot = 1) {
  return new LegionSlotBatch({ firstSlot: 0, endSlot, settleDaily });
}

function drain(batch, lookup) {
  const operations = [];
  for (let i = 0; i < 513; i++) {
    const operation = batch.next(lookup);
    operations.push(operation);
    if (operation.kind === "done" || operation.kind === "cancelled") {
      return operations;
    }
  }
  assert.fail("bounded slot cursor did not finish");
}

test("25C1/25CC: byte gate, reload and bit5 over 512 local inputs", () => {
  for (const period of [2, 3]) {
    for (let delay = 0; delay < 256; delay++) {
      const record = { status: 0xe4, moveDelay: delay, movePeriod: period };
      const operations = drain(cursor(), () => record);
      assert.deepEqual(
        operations.map((operation) => operation.kind),
        delay === 1 ? ["action", "tail", "done"] : ["tail", "done"],
        `delay=${delay}, period=${period}`,
      );
      assert.equal(record.moveDelay, delay === 1 ? period : (delay - 1) & 255);
      assert.equal(record.status, delay === 1 ? 0xc4 : 0xe4);
    }
  }
});

test("25B6/25DE: all status bytes select the live entry path", () => {
  for (let status = 0; status < 256; status++) {
    const record = { status, moveDelay: 1, movePeriod: 3 };
    const kinds = drain(cursor(true), () => record).map((step) => step.kind);
    let expected = ["done"];
    if (status >= 128) expected = ["action", "daily", "tail", "done"];
    else if (status & 8) expected = ["inactive", "done"];
    assert.deepEqual(kinds, expected, `status=${status}`);
  }
});

test("two yielded actions resume at their own daily/tail, without re-gating", () => {
  const first = { status: 0xc4, moveDelay: 1, movePeriod: 3 };
  const second = { status: 0xc4, moveDelay: 1, movePeriod: 2 };
  const table = [first, second];
  const batch = cursor(true, 2);
  const lookup = (slot) => table[slot];
  assert.deepEqual(batch.next(lookup), {
    kind: "action",
    slot: 0,
    record: first,
  });
  // Stand-in for a completed action's writes, not a fake raw callee return.
  first.moveDelay = 8;
  first.status = 8;
  table[0] = null;
  assert.deepEqual(batch.next(lookup), {
    kind: "daily",
    slot: 0,
    record: first,
  });
  assert.deepEqual(batch.next(lookup), {
    kind: "tail",
    slot: 0,
    record: first,
  });
  assert.deepEqual(batch.next(lookup), {
    kind: "action",
    slot: 1,
    record: second,
  });
  second.moveDelay = 1;
  assert.deepEqual(batch.next(lookup), {
    kind: "daily",
    slot: 1,
    record: second,
  });
  assert.deepEqual(batch.next(lookup), {
    kind: "tail",
    slot: 1,
    record: second,
  });
  assert.deepEqual(batch.next(lookup), { kind: "done" });
  assert.equal(first.moveDelay, 8);
  assert.equal(second.moveDelay, 1);
});

test("later slots observe action writes, not a frozen active list", () => {
  const table = [
    { status: 0xc4, moveDelay: 1, movePeriod: 3 },
    { status: 0 },
    null,
    { status: 8 },
  ];
  const batch = cursor(false, 4);
  const lookup = (slot) => table[slot];
  assert.equal(batch.next(lookup).kind, "action");
  table[1] = { status: 0x80, moveDelay: 1, movePeriod: 2 };
  table[3].status = 0;
  const rest = drain(batch, lookup);
  assert.deepEqual(
    rest.map(({ kind, slot }) => [kind, slot]),
    [
      ["tail", 0],
      ["action", 1],
      ["tail", 1],
      ["done", undefined],
    ],
  );
});

test("cancellation cannot resume a yielded action or report normal completion", () => {
  const record = { status: 0x80, moveDelay: 1, movePeriod: 3 };
  const batch = cursor(true);
  assert.equal(batch.next(() => record).kind, "action");
  batch.cancel();
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      batch.next(() => assert.fail("cancelled lookup")),
      {
        kind: "cancelled",
      },
    );
  }
  assert.equal(batch.currentRecord, null);
});

test("unknown used bytes are rejected; zero and an unused reload are preserved", () => {
  assert.throws(() => cursor().next(() => ({ status: 128 })), /moveDelay/);
  assert.throws(
    () => cursor().next(() => ({ status: 128, moveDelay: 1 })),
    /movePeriod/,
  );
  const zero = { status: 128, moveDelay: 1, movePeriod: 0 };
  assert.equal(cursor().next(() => zero).kind, "action");
  assert.equal(zero.moveDelay, 0);
  const notDue = { status: 128, moveDelay: 0 };
  assert.equal(cursor().next(() => notDue).kind, "tail");
  assert.equal(notDue.moveDelay, 255);
  assert.throws(() => cursor().next(() => ({ status: 256 })), /status/);
});
