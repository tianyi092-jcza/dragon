// E-04 read-only inventory. Original records are evidence, not initialized drafts.
// Fixed non-save whitelist + exact installed package. No DOS execution/network/profile.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)), round = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const sha = (b) => createHash("sha256").update(b).digest("hex"), sourceHashes = {}, inputSizes = {};
const originals = [
  ["上", "6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73"],
  ["中", "cf91e4360fa4e9363b5136ba379d58c8b1c8b5b3ca309eca4071b4f7a805ce59"],
  ["下", "89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb"],
  ["后", "3e70ad54e3fc3b9d13a25883098d1ccc53218aafd1a7a461b095c1f1fc9812db"],
  ["原版", "4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87"] ];
const source = readInstalledEditorSource(BUILTIN_RESOURCES, (url) => {
  assert.ok(url.startsWith(`content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`));
  const p = "web/" + url, bytes = readFileSync(join(root, p)); sourceHashes[p] = sha(bytes); inputSizes[p] = bytes.length; return bytes;
});
function json(bytes) { try { return JSON.parse(bytes.toString()); } catch (cause) { throw new TypeError("invalid fixed entity JSON", { cause }); } }
const installed = json(readFileSync(join(root, "web", BUILTIN_RESOURCES.sourceURL)));
const kiPath = "../Dragon/KI.EXE", ki = readFileSync(join(root, kiPath));
assert.equal(sha(ki), "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868"); sourceHashes[kiPath] = sha(ki); inputSizes[kiPath] = ki.length;
const signatures = [[0x52e7,"8b9751428aead0e5"], [0x55d3,"8a07d0e002e043e2f788641f"], [0x4f95,"c647027f"], [0x52db,"8a7c02"]];
for (const [va, hex] of signatures) assert.equal(ki.subarray(va + 512, va + 512 + hex.length / 2).toString("hex"), hex);
const chapters = [], generalVariants = Array.from({ length: 128 }, () => new Map()), cityVariants = Array.from({ length: 192 }, () => new Set()), differences = [], records = [];
function difference(idx, kind, slot, field, web, raw) { if (web !== raw) differences.push({ idx, kind, slot, field, web, raw }); }
for (const [group, [name, expected]] of originals.entries()) {
  const p = `../${name}/SINARIO.DAT`, bytes = readFileSync(join(root, p)); assert.equal(sha(bytes), expected); sourceHashes[p] = sha(bytes); inputSizes[p] = bytes.length;
  // Down-library's unrelated final two bytes are NOT padded/certified.
  assert.ok(bytes.length >= 3 * 0x56c0 + 0x42c0 + 128 * 32);
  for (let local = 0; local < 4; local++) {
    const idx = group * 4 + local, chapter = source.chapters[idx], state = chapter.state, start = local * 0x56c0;
    assert.equal(state.generals.length, 128); assert.equal(state.cities.length, 192);
    const rawGenerals = [], refs = [], sentinelRefs = [];
    for (let slot = 0; slot < 128; slot++) {
      const g = bytes.subarray(start + 0x42c0 + slot * 32, start + 0x42e0 + slot * 32), named = state.generals[slot]; assert.equal(named.idx, slot);
      rawGenerals.push(g.toString("hex"));
      // Appearance bytes are a variant signal, NOT a person identity/merge key.
      const signature = g.subarray(1, 14).toString("hex");
      const variants = generalVariants[slot]; if (!variants.has(signature)) variants.set(signature, []);
      variants.get(signature).push({ idx, chapterId: chapter.id, name: named.name, hao: named.hao });
      for (const [key, offset] of [["force",0x11], ["lead",0x12], ["politics",0x13]]) difference(idx,"general",slot,"ability." + key,named.ability[key],g[offset]);
      difference(idx,"general",slot,"attr",named.attr,g[0]); difference(idx,"general",slot,"portrait",named.portrait,g[1]);
      for (const [field, offset] of [["faction",0x1c], ["join_faction",0x19]]) {
        const value = g[offset];
        if (value === 255 || value === 24) sentinelRefs.push({ kind:"general",slot,field,value,meaning:value === 255 ? "field-specific FF, not G255" : "context-dependent transition/alias, not auto-neutral" });
        else refs.push({ from:`G${slot}.${field}`,to:`F${value}`,scope:value < state.factions.length ? "declared" : "not-public-prefix; preserved, not automatically invalid" });
      }
    }
    for (let slot = 0; slot < 192; slot++) {
      const c = bytes.subarray(start + 0x8c0 + slot * 32, start + 0x8e0 + slot * 32), city = state.cities[slot]; assert.equal(city.raw, c.toString("hex"));
      cityVariants[slot].add(c.subarray(2,8).toString("hex"));
      if (c[0x19] !== 255) refs.push({ from:`C${slot}.governor`,to:`G${c[0x19]}` });
    }
    for (let slot = 0; slot < 22; slot++) {
      const f = bytes.subarray(start + 0x80 + slot * 64, start + 0xc0 + slot * 64); assert.equal(state.nativeFactionSlotRaw[slot], f.toString("hex"));
      if (f[1] < 128) refs.push({ from:`F${slot}.monarch`,to:`G${f[1]}` });
      else sentinelRefs.push({kind:"faction",slot,field:"monarch",value:f[1],meaning:"out-of-profile ordinary general index; preserve byte, no repair or fictitious G255"});
      if (f[2] === 127) sentinelRefs.push({ kind:"faction",slot,field:"advisor",value:127,meaning:"reserved/custom/empty context; not an ordinary extra general" });
      else refs.push({ from:`F${slot}.advisor`,to:`G${f[2]}` });
      if (f[3] !== 255) refs.push({ from:`F${slot}.capital`,to:`C${f[3]}` });
      if (slot < state.factions.length) { const money = f.readUIntLE(0x20,3); difference(idx,"faction",slot,"money",state.factions[slot].money,money >= 0x800000 ? money - 0x1000000 : money); }
    }
    difference(idx,"chapter",null,"start.year",state.start.year,bytes.readUInt16LE(start + 6)); difference(idx,"chapter",null,"start.day",state.start.day,bytes[start]);
    const hasRaw = state.generals.every((g) => typeof g.raw === "string" && /^[a-f0-9]{64}$/i.test(g.raw));
    chapters.push({ idx, chapterId:chapter.id, source:name, sourceChapter:local, webGenerals:128, originalGenerals:128, fullGeneralRawInWeb:hasRaw, references:refs.length, sentinelRefs, physicalFactionSlots:24, capturedFactionSlots:22 });
    records.push({ idx, chapterId:chapter.id, rawGeneralRecords:rawGenerals, references:refs, sentinelRefs });
  }
}
const sameSlotVariants = generalVariants.flatMap((variants, slot) => variants.size > 1 ? [{ slot, appearances:[...variants].map(([rawAppearance,occurrences]) => ({rawAppearance,occurrences})) }] : []);
const report = { caseId:"E-04-ENTITY-READONLY-AUDIT-1",result:"PASS-READONLY-INVENTORY-NOT-EDITOR-CERTIFICATE",fixtureId:source.revision,sourceHashes,inputSizes,
  signatures:signatures.map(([va,hex]) => ({va,hex})),chapters,sameSlotVariants,cityNameVariantSlots:cityVariants.flatMap((s,slot) => s.size > 1 ? [slot] : []),differences,
  toolHashes:Object.fromEntries(["tools/audit_editor_entities.mjs", "tools/editor_builtin_source.mjs", "web/src/content/authoring/gamesource.js", "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/mapcompile.js", "web/src/content/authoring/maplayers.js", "web/src/content/authoring/roadedit.js", "web/src/content/authoring/fixedcitybindings.js", "web/src/content/builtinresources.generated.js"].map(p=>[p,sha(readFileSync(join(root,p)))])),
  legacyGeneralDictionarySize:Object.keys(installed.generals).length,legacyDictionaryMeaning:"first chapter name per slot, not cross-chapter person identity",
  unknownGeneralOffsets:["14","15","1B"], records,
  limits:["No draft mutation/identity assignment/person merge/runtime initialization", "appearance equality is NOT identity; keep source-scoped records pending explicit mapping", "No complete consumer/CPU/unused proof; down final two bytes unexamined", "No SAVE/profile/network; installed39 and helper compiler validation preserved"] };
for (const [p, before] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(join(root,p))),before,"input changed during audit");
const dir = join(root,".dragon-analysis/editor-phase",round); mkdirSync(dir);
writeFileSync(join(dir,"receipt.json"),JSON.stringify(report,null,2) + "\n",{flag:"wx"});
process.stdout.write(JSON.stringify({result:report.result,chapters:20,generalRecords:2560,sameSlotAppearanceVariants:sameSlotVariants.length,chaptersWithoutFullRaw:chapters.filter(c=>!c.fullGeneralRawInWeb).length,numericDifferences:differences.length})+"\n");
