// Reproducible author-only source package. Direct fixed non-save originals,
// NEVER ignored audit output / user profile / DOS I/O / product installation.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
const root=fileURLToPath(new URL("../",import.meta.url)),round=process.argv[2];assert.equal(process.argv.length,3);assert.match(round??"",/^[a-zA-Z0-9-]{1,64}$/);
const sha=b=>createHash("sha256").update(b).digest("hex"),sourceHashes={};
const source=readInstalledEditorSource(BUILTIN_RESOURCES,url=>{assert.ok(url.startsWith(`content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`));const p="web/"+url,b=readFileSync(join(root,p));sourceHashes[p]=sha(b);return b;});
const originals=[
  ["上","6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73"],
  ["中","cf91e4360fa4e9363b5136ba379d58c8b1c8b5b3ca309eca4071b4f7a805ce59"],
  ["下","89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb"],
  ["后","3e70ad54e3fc3b9d13a25883098d1ccc53218aafd1a7a461b095c1f1fc9812db"],
  ["原版","4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87"]];
const chapters=[];
for(const[group,[label,hash]]of originals.entries()){
  const p=`../${label}/SINARIO.DAT`,b=readFileSync(join(root,p));assert.equal(sha(b),hash);sourceHashes[p]=hash;
  assert.ok(b.length>=3*0x56c0+0x42c0+128*32);
  for(let ordinal=0;ordinal<4;ordinal++){
    const idx=group*4+ordinal,start=ordinal*0x56c0,chapter=source.chapters[idx];
    function records(offset,count,size){return Array.from({length:count},(_,slot)=>b.subarray(start+offset+slot*size,start+offset+(slot+1)*size).toString("hex"));}
    const general32=records(0x42c0,128,32),city32=records(0x8c0,192,32),faction64=records(0x80,24,64);
    assert.ok(general32.every(r=>r.length===64));assert.ok(city32.every(r=>r.length===64));assert.ok(faction64.every(r=>r.length===128));
    for(let i=0;i<192;i++)assert.equal(city32[i],chapter.state.cities[i].raw);
    for(let i=0;i<22;i++)assert.equal(faction64[i],chapter.state.nativeFactionSlotRaw[i]);
    chapters.push({chapterId:chapter.id,source:{path:p,sha256:hash,chapterOrdinal:ordinal,chapterByteOffset:start},
      header128:b.subarray(start,start+128).toString("hex"),general32,city32,faction64,
      policy:"complete source records only; no init/default/person merge/correction applied"});
  }
}
const toolHashes={};for(const p of["tools/stage_editor_entity_source.mjs","tools/editor_builtin_source.mjs","web/src/content/builtinresources.generated.js","web/src/content/authoring/gamesource.js","web/src/content/authoring/trialcompile.js","web/src/content/authoring/maplayers.js","web/src/content/authoring/mapcompile.js","web/src/content/authoring/roadedit.js","web/src/content/authoring/fixedcitybindings.js"])toolHashes[p]=sha(readFileSync(join(root,p)));
const dataSha256=sourceHashes["web/"+BUILTIN_RESOURCES.dataURL];assert.match(dataSha256,/^[a-f0-9]{64}$/);
const body=Buffer.from(JSON.stringify({schemaVersion:1,profile:"ki-fixed-entity-source-1",mode:"READONLY_IMPORT_INPUT",runtimeDataSha256:dataSha256,sourceChapterOrder:source.chapters.map(c=>c.id),chapters})+"\n");
const manifest={schemaVersion:1,profile:"ki-fixed-entity-source-1",mode:"READONLY_IMPORT_INPUT",runtimeDataSha256:dataSha256,
  resource:{path:"entity-source.json",sha256:sha(body),byteLength:body.length},
  originalSources:Object.fromEntries(originals.map(([label,hash])=>[`../${label}/SINARIO.DAT`,hash]))};
for(const[p,hash]of Object.entries(sourceHashes))assert.equal(sha(readFileSync(join(root,p))),hash,"input changed during stage");
const output=join(root,".dragon-analysis/editor-phase",round);mkdirSync(output);mkdirSync(join(output,"package"));
writeFileSync(join(output,"package/entity-source.json"),body,{flag:"wx"});writeFileSync(join(output,"package/manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
writeFileSync(join(output,"receipt.json"),JSON.stringify({result:"PASS-STAGE-READONLY-NOT-INSTALLED",sourceHashes,toolHashes,fixtureId:source.revision,manifest,chapters:20,generalRecords:2560,cityRecords:3840,factionRecords:480,
  limits:"author input not RuntimeManifest/initializer/edit; no installed assets/drafts/server/DOS/profile/network writes; unused bits retained; down final2bytes outside covered source tables"},null,2)+"\n",{flag:"wx"});
process.stdout.write(JSON.stringify({result:"PASS-STAGE-READONLY-NOT-INSTALLED",chapters:20,sha256:manifest.resource.sha256,byteLength:body.length})+"\n");
