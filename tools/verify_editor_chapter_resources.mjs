// Fixed Web source, memory only; no rules, native IDB, DOS/SAVE or user profile.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { copyBuiltinGame } from "../web/src/content/authoring/gamesource.js";
import { editChapterResources } from "../web/src/editor/chapterresources.js";
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), inputs = {}, tools = {};
const priorIDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB"); let implicitIDB = 0;
Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { implicitIDB++; throw new Error("IDB forbidden"); } });
let checks = 0, negatives = 0, getterReads = 0;
try {
  const source = readInstalledEditorSource(undefined, path => { const bytes = readFileSync(new URL("../web/" + path, import.meta.url)); inputs["web/" + path] = sha(bytes); return bytes; });
  const game = copyBuiltinGame({ gameId: "resource-memory", ownerId: "fixture-not-auth", kind: "full", source }, sha), original = JSON.stringify(game);
  const fields = { money: [0x20, 3, -0x800000, 0x7fffff], reserve_cav: [4, 2, 0, 65535], reserve_arc: [6, 2, 0, 65535], reserve_inf: [8, 2, 0, 65535] };
  function expected(base, chapterId, slot, changes) {
    const next = structuredClone(base), state = next.chapters[chapterId].state, row = state.factions[slot];
    for (const [name, value] of Object.entries(changes)) {
      if (value === row[name]) continue;
      const [offset, size] = fields[name], b = Buffer.alloc(size); if (name === "money") b.writeIntLE(value, 0, size); else b.writeUIntLE(value, 0, size);
      const replace = raw => raw.slice(0, offset * 2) + b.toString("hex") + raw.slice((offset + size) * 2);
      row[name] = value; row.raw = replace(row.raw); state.nativeFactionSlotRaw[slot] = replace(state.nativeFactionSlotRaw[slot]);
    }
    row.money_hi = Number.parseInt(row.raw.slice(0x22 * 2, 0x23 * 2), 16); return next;
  }
  for (const id of game.chapterOrder) {
    const rows = game.chapters[id].state.factions;
    for (const slot of [0, rows.length - 1]) for (const [name, [, , min, max]] of Object.entries(fields)) {
      const value = rows[slot][name] === max ? min : rows[slot][name] + 1, patch = { [name]: value };
      assert.deepEqual(editChapterResources(game, id, slot, patch), expected(game, id, slot, patch)); checks++;
    }
    assert.equal(editChapterResources(game, id, 0, { money: rows[0].money }), game); checks++;
  }
  const id = game.chapterOrder[0], slot = 0;
  for (const [name, [, , min, max]] of Object.entries(fields)) for (const value of [min, max]) { assert.deepEqual(editChapterResources(game, id, slot, { [name]: value }), expected(game, id, slot, { [name]: value })); checks++; }
  const unknown = structuredClone(game); unknown.chapters[id].state.factions[slot].raw = unknown.chapters[id].state.factions[slot].raw.slice(0, 22) + "aa" + unknown.chapters[id].state.factions[slot].raw.slice(24);
  unknown.chapters[id].state.nativeFactionSlotRaw[slot] = unknown.chapters[id].state.nativeFactionSlotRaw[slot].slice(0, 22) + "bb" + unknown.chapters[id].state.nativeFactionSlotRaw[slot].slice(24);
  const joint = { money: -1, reserve_cav: 1, reserve_arc: 256, reserve_inf: 65500 };
  assert.deepEqual(editChapterResources(unknown, id, slot, joint), expected(unknown, id, slot, joint)); checks++;
  function refused(base, chapter, index, patch) { assert.throws(() => editChapterResources(base, chapter, index, patch)); negatives++; }
  for (const [name, [, , min, max]] of Object.entries(fields)) for (const bad of [true, "1", null, undefined, 1.5, NaN, Infinity, -0, min - 1, max + 1]) refused(game, id, slot, { [name]: bad });
  for (const bad of [null, [], new Date(0), {}, { monarch_idx: 1 }, { money: 1, capital: 0 }, Object.create({ money: 1 })]) refused(game, id, slot, bad);
  const accessor = {}; Object.defineProperty(accessor, "money", { enumerable: true, get() { getterReads++; return 1; } }); refused(game, id, slot, accessor);
  const hidden = {}; Object.defineProperty(hidden, "money", { value: 1 }); refused(game, id, slot, hidden);
  refused(game, id, slot, { [Symbol("money")]: 1 });
  for (const index of [-1, 22, 0.5, "0", null]) refused(game, id, index, { money: 1 });
  for (const chapter of ["missing", "__proto__", "", null]) refused(game, chapter, slot, { money: 1 });
  for (const change of [
    g => { g.gameId = "wolong-builtin"; }, g => { g.sourceRef.kind = "builtin-template"; }, g => { g.chapterOrder = []; },
    g => { g.chapters[id].chapterId = "other"; }, g => { g.chapters[id].state.factions[0].idx = 1; },
    g => { g.chapters[id].state.nativeFactionSlotRaw.pop(); }, g => { delete g.chapters[id].state.nativeFactionSlotRaw[0]; },
    g => { g.chapters[id].state.factions[0].raw = "00"; }, g => { g.chapters[id].state.factions[0].money++; },
    g => { g.chapters[id].state.factions[0].money_hi++; },
    g => { const r = g.chapters[id].state; r.nativeFactionSlotRaw[0] = r.nativeFactionSlotRaw[0].slice(0, 8) + "ffff" + r.nativeFactionSlotRaw[0].slice(12); },
  ]) { const bad = structuredClone(game); change(bad); const before = JSON.stringify(bad); refused(bad, id, slot, { money: 1 }); assert.equal(JSON.stringify(bad), before); }
  assert.equal(JSON.stringify(game), original); assert.equal(getterReads, 0); assert.equal(implicitIDB, 0);
  for (const [path, digest] of Object.entries(inputs)) assert.equal(sha(readFileSync(new URL("../" + path, import.meta.url))), digest);
  for (const path of ["tools/verify_editor_chapter_resources.mjs", "web/src/editor/chapterresources.js", "tools/editor_builtin_source.mjs"]) tools[path] = sha(readFileSync(new URL("../" + path, import.meta.url)));
  process.stdout.write(JSON.stringify({ result: "PASS-CHAPTER-RESOURCE-WRITER-MEMORY", chapters: 20, checks, negatives, getterReads, implicitIDB, inputs, tools, limits: "Representation/copy-on-write only. Boundary values not rule execution authorization, no auth/UI/role/new chapter/App or default migration." }, null, 2) + "\n");
} finally { if (priorIDB) Object.defineProperty(globalThis, "indexedDB", priorIDB); else delete globalThis.indexedDB; }
