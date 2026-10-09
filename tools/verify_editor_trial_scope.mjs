// Explicit in-memory projection checks. Current immutable Web inputs only;
// no drafts/network/profile/browser/DOS writes, not service/App Q69 completion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { copyBuiltinGame } from "../web/src/content/authoring/gamesource.js";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
import { projectTrialChapter } from "../web/src/editor/trialscope.js";
const sha = v => createHash("sha256").update(v).digest("hex");
const source=readInstalledEditorSource(),game=copyBuiltinGame({source,gameId:"trial-scope-fixture",ownerId:"local-fixture",kind:"full"},sha);
const id=game.chapterOrder[14],other=game.chapterOrder[0],before=JSON.stringify(game);
const whole=compileGameSource(game,sha),scope=projectTrialChapter(game,id,sha),one=compileGameSource(scope.selected,sha);
assert.notEqual(scope.savedSourceDigest,scope.selectedSourceDigest);assert.equal(scope.savedSourceDigest,whole.sourceDigest);assert.equal(scope.selectedSourceDigest,one.sourceDigest);
assert.deepEqual(scope.selected.chapterOrder,[id]);assert.deepEqual(Object.keys(scope.selected.chapters),[id]);assert.deepEqual(scope.selected.chapters[id],game.chapters[id]);
for(const key of Object.keys(game).filter(k=>!['chapterOrder','chapters'].includes(k)))assert.deepEqual(scope.selected[key],game[key],key);
for(const key of ['terrainBytes','roadCost','roadOffsetBytes','roadGraph','geography','minimapGeography'])assert.deepEqual(one[key],whole[key],key);
const partial=structuredClone(game);partial.chapters[other].state={};const partialBefore=JSON.stringify(partial);
assert.throws(()=>compileGameSource(partial,sha),/chapter city\/node mismatch/);
const partialScope=projectTrialChapter(partial,id,sha);assert.deepEqual(compileGameSource(partialScope.selected,sha).terrainBytes,whole.terrainBytes);assert.equal(JSON.stringify(partial),partialBefore);
let rejects=0;
function reject(mutate,check=g=>projectTrialChapter(g,id,sha)){const copy=structuredClone(game);mutate(copy);const snapshot=structuredClone(copy);assert.throws(()=>check(copy));assert.deepEqual(copy,snapshot);rejects++;}
const compileSelection=g=>compileGameSource(projectTrialChapter(g,id,sha).selected,sha);
reject(()=>{},g=>projectTrialChapter(g,"missing-chapter",sha));reject(g=>g.chapterOrder.push(id));reject(g=>delete g.chapters[id]);
reject(g=>g.chapters[id].state.cities=[],compileSelection);
reject(g=>g.map.roads[0].nativeBinding.flags^=1,compileSelection);
reject(g=>g.chapters[other].state.badNumber=NaN); // unsafe JSON is not an unrelated form omission
assert.equal(JSON.stringify(game),before);
process.stdout.write(JSON.stringify({result:"PASS-FIXED-CHAPTER-PROJECTION-NOT-SERVICE-Q69",chapters:20,selectedNativeAssetsUnchanged:true,unrelatedIncompleteStateOmitted:true,wholeSourceStillRejected:true,negativeControls:rejects,inputUnchanged:true,
  limits:"No service/cache/UI/snapshot identity integration; no resource-capture or runtime/initializer/newGeneral certification. Full source safety remains checked; shared fields and complete selected state preserved."})+"\n");
