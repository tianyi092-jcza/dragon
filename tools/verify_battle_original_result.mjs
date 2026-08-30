import assert from "node:assert/strict";

const {
  countActiveObjectsByGroup,
  originalTacticalMorale,
  settleOriginalTacticalLegion,
  tacticalGroupSurvivors,
} = await import("../web/src/game/battle/originalresult.js");

const objects = Array.from({ length: 0x30 }, () => ({ flags: 0 }));
for (const index of [0, 1, 7, 8, 15, 16, 17, 18, 40, 47])
  objects[index].flags = 0x80;
assert.deepEqual(countActiveObjectsByGroup(objects), [3, 2, 3, 0, 0, 2]);

const records = [
  { primary: 90, active: 3 },
  { primary: 80, active: 2 },
  { primary: 70, active: 1 },
  { primary: 60, active: 0 },
  { primary: 50, active: 4 },
  { primary: 40, active: 5 },
];
assert.deepEqual(tacticalGroupSurvivors(records), [93, 82, 71, 60, 54, 45]);

assert.equal(originalTacticalMorale(200, 600, 450, true), 150);
assert.equal(originalTacticalMorale(200, 600, 300, false), 49);
assert.equal(originalTacticalMorale(99, 600, 300, false), 0);
assert.equal(originalTacticalMorale(100, 600, 300, false), 49);
assert.equal(originalTacticalMorale(255, 600, 0, true), 0);
assert.equal(originalTacticalMorale(255, 0, 300, true), 0);

const settled = settleOriginalTacticalLegion({
  oldMorale: 200,
  oldTotal: 600,
  groupRecords: records,
  won: true,
});
assert.deepEqual(settled.units, [93, 82, 71, 60, 54, 45]);
assert.equal(settled.troops, 405);
assert.equal(settled.morale, 135);

process.stdout.write(
  "battle original result OK: 0x9F2C group counts + 0x9F58 troops/morale\n",
);
