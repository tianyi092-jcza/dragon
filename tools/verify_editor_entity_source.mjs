// Two independent direct-source stages -> byte-bound web reader + source index.
// Only declared owned rounds/current immutable source/fixed source-hash files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { decodeEntitySource } from "../web/src/editor/entitysource.js";
import { createImportedEntityIndex } from "../web/src/editor/entityindex.js";
const root=fileURLToPath(new URL("../",import.meta.url)),[first,second]=process.argv.slice(2);assert.equal(process.argv.length,4);assert.notEqual(first,second);for(const r of[first,second])assert.match(r??"",/^[a-zA-Z0-9-]{1,64}$/);
const sha=b=>createHash("sha256").update(b).digest("hex"),inputs={};
function read(p){assert.ok(!/save\.dat/i.test(p));const b=readFileSync(join(root,p));inputs[p]=sha(b);return b;}
function json(b){try{return JSON.parse(b.toString());}catch(cause){throw new TypeError("invalid explicit source fixture",{cause});}}
const base=".dragon-analysis/editor-phase/",a=json(read(base+first+"/receipt.json")),b=json(read(base+second+"/receipt.json"));assert.deepEqual(a,b);assert.equal(a.result,"PASS-STAGE-READONLY-NOT-INSTALLED");
for(const[p,hash]of Object.entries({...a.sourceHashes,...a.toolHashes})){assert.ok(p.startsWith("web/")||p.startsWith("tools/")||["../上/SINARIO.DAT","../中/SINARIO.DAT","../下/SINARIO.DAT","../后/SINARIO.DAT","../原版/SINARIO.DAT"].includes(p));assert.equal(sha(read(p)),hash);}
const bytes=read(base+first+"/package/entity-source.json");assert.deepEqual(bytes,read(base+second+"/package/entity-source.json"));
const manifestBytes=read(base+first+"/package/manifest.json");assert.deepEqual(manifestBytes,read(base+second+"/package/manifest.json"));const manifest=json(manifestBytes);assert.deepEqual(manifest,a.manifest);
const current=readInstalledEditorSource(),runtimeDataSha256=sha(read("web/"+BUILTIN_RESOURCES.dataURL));
assert.equal(manifest.runtimeDataSha256,runtimeDataSha256);
const trusted={runtimeDataSha256,resource:manifest.resource,sourceChapterOrder:current.chapters.map(c=>c.id),originalSources:a.manifest.originalSources};
const parsed=await decodeEntitySource(manifest,bytes,trusted,sha);assert.equal(parsed.chapters.length,20);
for(const chapter of parsed.chapters){
  const original=read(chapter.source.path),start=chapter.source.chapterByteOffset;
  assert.equal(chapter.source.sha256,sha(original));assert.equal(chapter.source.sha256,a.sourceHashes[chapter.source.path]);
  assert.equal(chapter.header128,original.subarray(start,start+128).toString("hex"));
  for(const[key,offset,size,count]of[["general32",0x42c0,32,128],["city32",0x8c0,32,192],["faction64",0x80,64,24]])for(let slot=0;slot<count;slot++)
    assert.equal(chapter[key][slot],original.subarray(start+offset+slot*size,start+offset+(slot+1)*size).toString("hex"));
}
let id=0;const model=createImportedEntityIndex({gameId:"staged-readonly-index",sourceRevision:current.revision,chapters:current.chapters,rawChapters:parsed.chapters.map(c=>({chapterId:c.chapterId,rawGeneralRecords:c.general32}))},()=>`source-only-${id++}`);assert.equal(Object.keys(model.entities).length,2540);
let negatives=0;
async function reject(mutate,{rebind=false}={}){
  const copy=structuredClone(parsed);mutate(copy);const data=Buffer.from(JSON.stringify(copy)+"\n");let t=trusted,m=manifest;
  // Rebound cases deliberately exercise structure, not pretend a new hash is
  // real author approval; all fixtures stay memory-only and never install.
  if(rebind){const resource={...manifest.resource,sha256:sha(data),byteLength:data.length};m={...manifest,resource};t={...trusted,resource};}
  const before=JSON.stringify(copy);await assert.rejects(()=>decodeEntitySource(m,data,t,sha));assert.equal(JSON.stringify(copy),before);negatives++;
}
await reject(c=>c.chapters[0].general32[0]="00");
await reject(c=>c.chapters[0].general32.pop(),{rebind:true});
await reject(c=>c.chapters[0].city32[0]="invalid",{rebind:true});
await reject(c=>c.chapters[0].chapterId="unknown",{rebind:true});
await reject(c=>c.chapters[0].source.sha256="0".repeat(64),{rebind:true});
await reject(c=>c.chapters[0].source.path="../fake/SINARIO.DAT",{rebind:true});
await assert.rejects(()=>decodeEntitySource({...manifest,runtimeDataSha256:"0".repeat(64)},bytes,trusted,sha));negatives++;
await assert.rejects(()=>decodeEntitySource({...manifest,resource:{...manifest.resource,path:"../wrong.json"}},bytes,trusted,sha));negatives++;
for(const[p,hash]of Object.entries(inputs))assert.equal(sha(readFileSync(join(root,p))),hash,"input drift during verify");
process.stdout.write(JSON.stringify({result:"PASS-SCOPED-STAGED-SOURCE-NOT-INSTALLED",sourceHashes:inputs,toolHashes:Object.fromEntries(["tools/verify_editor_entity_source.mjs","web/src/editor/entitysource.js","web/src/editor/entityindex.js"].map(p=>[p,sha(readFileSync(join(root,p)))])),chapters:20,general32:2560,city32:3840,faction64:480,sourceRecordIds:2540,negativeControls:negatives,
  artifactsIdentical:2,limits:"not drafts/server/newGeneral edit/init/person merge/currentpack install; self-consistent negative hashes are only structural fixtures, not trust/approval"})+"\n");
