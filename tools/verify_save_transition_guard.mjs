import assert from "node:assert/strict";
let fetchCalls = 0;
const { canSnapshotState, snapshotState } = await import(
  "../web/src/game/savegame.js"
);
const slotBefore = { slot: 0, label: "OLD", played: true };
const notices = [];
const app = {
  scenarioIdx: 0,
  scenario: {
    factions: [],
    cities: [],
    generals: [],
    legions: [],
    diplomacy: [],
  },
  clock: {
    year: 190,
    month: 1,
    day: 1,
    daysInMonth: 31,
    _pendingDayAdvance: false,
  },
  engageTransition: { active: true },
  battleView: { active: false },
  saves: { slots: [slotBefore] },
  hud: {
    flashEvent(message) {
      notices.push(message);
    },
  },
};
assert.equal(canSnapshotState(app), false);
assert.throws(() => snapshotState(app, 0, "NEW"), /cannot save/);

// main.saveGame的hard guard等价执行：必须在snapshot/slot mutation/fetch之前返回。
async function guardedSave(slotIdx, label) {
  if (!canSnapshotState(this)) {
    this.hud.flashEvent("戰鬥處理中，現在無法存檔。");
    return { saved: "blocked" };
  }
  const sv = snapshotState(this, slotIdx, label);
  const cur = this.saves.slots.find((slot) => slot.slot === slotIdx);
  if (cur) Object.assign(cur, sv);
  fetchCalls++;
  return { saved: "file" };
}
assert.deepEqual(await guardedSave.call(app, 0, "NEW"), { saved: "blocked" });
assert.equal(app.saves.slots[0], slotBefore);
assert.equal(app.saves.slots[0].label, "OLD");
assert.equal(fetchCalls, 0);
assert.match(notices.at(-1), /無法存檔/);
app.engageTransition = null;
assert.equal(canSnapshotState(app), true);
assert.deepEqual(await guardedSave.call(app, 0, "NEW"), { saved: "file" });
assert.equal(app.saves.slots[0].label, "NEW");
assert.equal(fetchCalls, 1);
app.clock._pendingDayAdvance = true;
assert.equal(canSnapshotState(app), false);

process.stdout.write(
  "save transition guard OK: active/pending states cannot snapshot or mutate slot; finished state can save\n",
);
