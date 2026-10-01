// Read-only data evidence audit, not a DOS rule emulator or save test.
// Whitelist: five ../{上,中,下,后,原版}/SINARIO.DAT and web/data.json.
// No imports of decoders/main entry points; no SAVE/profile or file writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const webBytes = readFileSync(new URL("../web/data.json", import.meta.url));
let data;
try { data = JSON.parse(webBytes.toString("utf-8")); }
catch (error) { throw new Error("invalid fixed Web chapter source", { cause: error }); }
assert.equal(data.scenarios.length, 20);
const report = { caseId: "E-COPY-DRIFT-DATA-1", inputHashes: { "web/data.json": sha(webBytes) },
  inputSizes: { "web/data.json": webBytes.length },
  cityOffset: 0x8c0, recordBytes: 32, chapterBytes: 0x56c0,
  namedOwnerOffset: 1, oldOwnerOffset: 0x1a, chapters: [], mismatches: [],
  coverage: "3840 city records, data identity only; no KI execution, dead-slot-rule proof or strategy rerun" };
for (const [group, source] of ["上", "中", "下", "后", "原版"].entries()) {
  const path = `../../${source}/SINARIO.DAT`;
  const bytes = readFileSync(new URL(path, import.meta.url));
  // 下 has an unrelated two-byte-short final tail. Bound THIS audit by
  // the last complete city record; never pad it or assert unexamined data.
  assert(bytes.length >= 3 * 0x56c0 + 0x8c0 + 192 * 32, "complete city record coverage");
  report.inputHashes[`../${source}/SINARIO.DAT`] = sha(bytes);
  report.inputSizes[`../${source}/SINARIO.DAT`] = bytes.length;
  for (let chapter = 0; chapter < 4; chapter++) {
    const idx = group * 4 + chapter;
    const state = data.scenarios[idx];
    assert.equal(state.cities.length, 192);
    const divergences = [];
    for (let slot = 0; slot < 192; slot++) {
      const offset = chapter * 0x56c0 + 0x8c0 + slot * 32;
      const raw = bytes.subarray(offset, offset + 32);
      const city = state.cities[slot];
      const named = city.faction === null ? 0x18 : city.faction;
      if (city.idx !== slot || named !== raw[1] || city.raw !== raw.toString("hex"))
        report.mismatches.push({ idx, slot, offset, reason: "named-owner or full raw differs" });
      if (raw[1] !== raw[0x1a]) divergences.push({ slot, offset,
        currentOwner: raw[1], oldOwner: raw[0x1a] });
    }
    report.chapters.push({ idx, source, sourceChapter: chapter, name: state.name, divergences });
  }
}
assert.deepEqual(report.mismatches, []);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
