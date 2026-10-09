import assert from "node:assert/strict";
import { disableTrialPersistence } from "../web/src/editor/trialpolicy.js";
const app = { saveRepository: { load() { throw new Error("formal repository reached"); } } };
disableTrialPersistence(app, { gameId: "fixture", sourceDigest: "digest", trialSnapshotId: "snapshot" });
assert.equal(app.canPersist, false); assert.deepEqual(app.saves.slots, []);
for (const key of ["load", "save", "put", "add", "remove", "clear", "import"]) assert.throws(() => app.saveRepository[key](), /禁止/);
for (const key of ["canPersist", "trialIdentity", "saveRepository"]) {
  assert.equal(Object.getOwnPropertyDescriptor(app, key).writable, false);
  assert.throws(() => { app[key] = true; }, TypeError);
}
assert.throws(() => disableTrialPersistence({}, {}), /invalid/);
process.stdout.write("PASS scoped: readonly trial capability; seven repository operations reject without IO\n");
