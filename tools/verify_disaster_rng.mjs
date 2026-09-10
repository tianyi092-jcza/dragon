import assert from "node:assert/strict";

import { enqueueMonthlyDisasterEvents } from "../web/src/game/ai.js";

const values = [1, 0, 1, 7];
let calls = 0;
const scenario = {
        player_faction: 0,
        factions: [{ idx: 0 }],
        cities: [
                {
                        idx: 0,
                        name: "甲城",
                        faction: 0,
                        x: 10,
                        y: 10,
                        growth: 100,
                        defence: 100,
                        raw: "00".repeat(32),
                },
        ],
        legions: [],
        generals: [],
        strategicEventSlots: Array(256).fill(null),
        _strategicEventCursor: 0,
};
const app = {
        scenario,
        originalRng: {
                nextByte() {
                        calls++;
                        return values.shift() ?? 0xff;
                },
        },
};
const events = enqueueMonthlyDisasterEvents(app);
assert.equal(events[0].type, 11);
assert.equal(calls, 6, "type11命中4字节，随后单城type12两个早退门控字节");
assert.deepEqual(scenario.strategicEventSlots[60], {
        type: 11,
        arg0: 0,
        arg1: 0,
        arg2: 0,
});
assert.equal(scenario.cities[0].development, undefined, "生产者不得即时改城");

process.stdout.write(
        "disaster RNG verification passed: direct city selector, slot60 and exact byte consumption\n",
);
