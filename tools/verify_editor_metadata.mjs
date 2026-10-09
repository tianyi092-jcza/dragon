// Pure Unicode/display contract; no files/network/timestamps/game rules.
import assert from "node:assert/strict";
import { normalizeGameMetadata, checkLocalDraftName } from "../web/src/editor/gamemetadata.js";
assert.deepEqual(normalizeGameMetadata({ name: "  e\u0301  ", introduction: "  简体内容  " }), { name: "é", introduction: "简体内容" });
assert.equal(normalizeGameMetadata({ name: "😀".repeat(8), introduction: "😀".repeat(20) }).name.length, 16);
for (const value of [null, [], { name: " ", introduction: "" }, { name: "a".repeat(9), introduction: "" },
  { name: "a", introduction: "a".repeat(21) }, { name: "a\u0000b", introduction: "" }, { name: "a", introduction: "\ud800" },
  { name: "a", introduction: "", ownerId: "spoof" }, { name: 1, introduction: "" }, { name: "a" }])
  assert.throws(() => normalizeGameMetadata(value));
const game = { gameId: "one", localModel: { ownerId: "placeholder" } };
const records = [{ gameId: "two", ownerId: "placeholder", metadata: { name: "é" } }];
assert.throws(() => checkLocalDraftName(game, { name: "é" }, records), /已有此名稱/);
checkLocalDraftName(game, { name: "É" }, records); // case sensitive
checkLocalDraftName(game, { name: "é" }, [{ ...records[0], ownerId: "another-placeholder" }]);
checkLocalDraftName(game, { name: "é" }, [{ ...records[0], gameId: "one" }]);
process.stdout.write("PASS metadata: trim/NFC/code points/author text, 10 invalid values and scoped draft-name collision; no auth claim\n");
