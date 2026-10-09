// Actual 20-chapter read-only import prototype. No draft/profile/network writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { createImportedEntityIndex } from "../web/src/editor/entityindex.js";
const root = fileURLToPath(new URL("../", import.meta.url));
function json(p) { try { return JSON.parse(readFileSync(join(root,p),"utf8")); } catch (cause) { throw new TypeError("invalid readonly import fixture",{cause}); } }
const report = json(".dragon-analysis/editor-phase/entities-audit-r1/receipt.json");
assert.equal(report.result,"PASS-READONLY-INVENTORY-NOT-EDITOR-CERTIFICATE"); assert.equal(report.fixtureId,BUILTIN_RESOURCES.world.revision);
const sha = (b) => createHash("sha256").update(b).digest("hex");
for (const [p, hash] of Object.entries(report.sourceHashes)) {
  assert.ok(p.startsWith("web/content/builtin/compiled/" ) || ["../Dragon/KI.EXE","../上/SINARIO.DAT","../中/SINARIO.DAT","../下/SINARIO.DAT","../后/SINARIO.DAT","../原版/SINARIO.DAT"].includes(p));
  assert.equal(sha(readFileSync(join(root,p))),hash);
}
const source = readInstalledEditorSource(), args = { gameId:"readonly-entity-prototype", sourceRevision:source.revision, chapters:source.chapters, rawChapters:report.records }, before = JSON.stringify(args);
let next = 0, negativeControls = 0;
const model = createImportedEntityIndex(args,()=>`independent-source-record-${next++}`);
assert.equal(Object.keys(model.entities).length,2540); assert.equal(Object.keys(model.bindings).length,20);
for (let chapter=0;chapter<20;chapter++) {
  const binding=model.bindings[source.chapters[chapter].id]; assert.equal(Object.keys(binding.slotMap).length,127);
  assert.equal(Object.hasOwn(binding.slotMap,127),false); assert.equal(binding.reserved127.originalRaw32,report.records[chapter].rawGeneralRecords[127]);
  for (let slot=0;slot<127;slot++) {
    const entity=model.entities[binding.slotMap[slot]]; assert.equal(entity.origin.originalRaw32,report.records[chapter].rawGeneralRecords[slot]);
    assert.equal(entity.display.name,source.chapters[chapter].state.generals[slot].name); assert.equal(entity.gameId,args.gameId);
  }
}
const first=model.entities[model.bindings[source.chapters[0].id].slotMap[0]], second=model.entities[model.bindings[source.chapters[1].id].slotMap[0]];
assert.notEqual(first.id,second.id); assert.notEqual(first.display.name,second.display.name);
const encoded=JSON.stringify(model);
let restored; try { restored=JSON.parse(encoded); } catch(cause){throw new Error("index JSON fixture invalid",{cause});} assert.deepEqual(restored,model);
function reject(mutate, allocator=()=>`n-${next++}`) { const copy=structuredClone(args); mutate(copy); const snapshot=JSON.stringify(copy); assert.throws(()=>createImportedEntityIndex(copy,allocator)); assert.equal(JSON.stringify(copy),snapshot); negativeControls++; }
reject(a=>a.rawChapters[0].rawGeneralRecords.pop());
reject(a=>a.rawChapters[0].rawGeneralRecords[0]="00");
reject(a=>a.rawChapters[0].chapterId="wrong-context");
reject(a=>a.chapters[1].id=a.chapters[0].id);
reject(a=>a.chapters[0].state.generals[0].idx=1);
reject(a=>a.chapters[0].state.generals[0].ability.force=16);
reject(a=>a.gameId="");
reject(()=>{},()=>"same-id");
reject(()=>{},()=>"__proto__");
assert.equal(JSON.stringify(args),before);
process.stdout.write(JSON.stringify({result:"PASS-READONLY-PROTOTYPE-NOT-WRITABLE-ENTITY-CERTIFICATE",chapters:20,independentOrdinarySourceRecords:2540,preservedReservedRecords:20,negativeControls,inputUnchanged:true,
  limits:"Not saved into drafts, not GeneralDefinition edit/init/merge/complete UI; original2560 records retained, native state unchanged"})+"\n");
