import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {readInstalledEntitySource} from './editor_entity_source.mjs';
import {BUILTIN_ENTITY_SOURCE as descriptor} from '../web/src/editor/builtinentitysource.generated.js';
import {copyBuiltinGame} from '../web/src/content/authoring/gamesource.js';
import {copyEntitySourceRecords} from '../web/src/editor/entitycopy.js';
import {inspectEntitySources} from '../web/src/editor/entityinspection.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),source=readInstalledEditorSource(),bundle=await readInstalledEntitySource();
const game=copyBuiltinGame({gameId:'inspection-pure',kind:'full',source},sha);let n=0;
game.sourceRecords=copyEntitySourceRecords(game,source,bundle,descriptor,()=>`inspection-${n++}`);
const before=JSON.stringify(game);let negativeControls=0;
for(const [i,id]of game.chapterOrder.entries()){
  const result=inspectEntitySources(game,bundle,descriptor,id);assert.equal(result.records.length,128);assert.equal(result.records.filter(r=>r.id!==null).length,127);
  assert.equal(result.records[127].reserved,true);assert.equal(result.records[127].id,null);assert.equal(result.sourceChapterId,source.chapters[i].id);
  assert.equal(result.records.reduce((sum,r)=>sum+r.references.length,0)+result.nonOrdinaryReferences.length,236);
  for(const [slot,r]of result.records.entries())assert.equal(r.originalRaw32,bundle.chapters[i].general32[slot]);
  assert.deepEqual(result.templateStart,result.originalStart); // adopted original header, all20
  if(i===14)assert.equal(result.originalStart.year,264);
  if(i===15)assert.equal(result.originalStart.year,266);
}
function reject(change){const copy={...game,sourceRecords:structuredClone(game.sourceRecords)};change(copy);assert.throws(()=>inspectEntitySources(copy,bundle,descriptor));negativeControls++;}
reject(c=>c.sourceRecords.gameId='different');reject(c=>c.sourceRecords.resourceRef.sha256='0'.repeat(64));
reject(c=>c.sourceRecords.bindings[c.chapterOrder[0]].targetChapterId='other');
reject(c=>c.sourceRecords.bindings[c.chapterOrder[0]].completeOriginalRecords[0].originalRaw32='00');
reject(c=>c.sourceRecords.bindings[c.chapterOrder[0]].slotMap[127]='invented');
reject(c=>c.sourceRecords.bindings[c.chapterOrder[0]].reserved127.runtimeSlot=126);
reject(c=>{const b=c.sourceRecords.bindings[c.chapterOrder[0]];b.slotMap[1]=b.slotMap[0];});
assert.throws(()=>inspectEntitySources(game,bundle,descriptor,'unknown'));negativeControls++;
const old={...game};delete old.sourceRecords;assert.equal(inspectEntitySources(old,null,descriptor).available,false);
assert.equal(JSON.stringify(game),before);
process.stdout.write(JSON.stringify({result:'PASS-READONLY-INSPECTION-NOT-EDITOR-AUTHORITY',chapters:20,records:2560,negativeControls,inputUnchanged:true,referenceScope:'source C19/F01/F02 only;not whole consumer closure'})+'\n');
