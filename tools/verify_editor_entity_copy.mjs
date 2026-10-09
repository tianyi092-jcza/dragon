// Source-record preservation in copied DTOs; fixed Web inputs only, memory output.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {readInstalledEntitySource} from './editor_entity_source.mjs';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {copyBuiltinGame} from '../web/src/content/authoring/gamesource.js';
import {copyEntitySourceRecords} from '../web/src/editor/entitycopy.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),source=readInstalledEditorSource(),bundle=await readInstalledEntitySource();
const make=id=>copyBuiltinGame({gameId:id,ownerId:'owned-test',kind:'full',source},sha);
const game=make('source-copy-one'),other=make('source-copy-two');
const before=JSON.stringify({chapters:game.chapters,generals:game.generals,compatibility:game.compatibility,source}),bundleBefore=JSON.stringify(bundle);
let next=0;const allocate=({gameId})=>`${gameId}-source-record-${next++}`;
const records=copyEntitySourceRecords(game,source,bundle,BUILTIN_ENTITY_SOURCE,allocate),otherRecords=copyEntitySourceRecords(other,source,bundle,BUILTIN_ENTITY_SOURCE,allocate);
assert.equal(Object.keys(records.entities).length,2540);assert.equal(Object.keys(records.bindings).length,20);
assert.equal(new Set([...Object.keys(records.entities),...Object.keys(otherRecords.entities)]).size,5080);
for(const chapter of source.chapters){const target=game.compatibility.idMap.chapters[chapter.id],binding=records.bindings[target];assert.equal(binding.sourceChapterId,chapter.id);assert.equal(binding.targetChapterId,target);assert.equal(binding.completeOriginalRecords.length,128);assert.equal(binding.reserved127.runtimeSlot,127);for(let i=0;i<127;i++){const entity=records.entities[binding.slotMap[i]];assert.equal(entity.gameId,game.gameId);assert.equal(entity.origin.sourceChapterId,chapter.id);assert.equal(entity.display.name,chapter.state.generals[i].name);}}
const encoded=JSON.stringify(records);let reopened;try{reopened=JSON.parse(encoded);}catch(cause){throw new Error('invalid copied source JSON',{cause});}assert.deepEqual(reopened,records);
let negatives=0;
function reject(mutate,allocator=allocate){const copy=structuredClone(game);mutate(copy);const snapshot=JSON.stringify(copy);assert.throws(()=>copyEntitySourceRecords(copy,source,bundle,BUILTIN_ENTITY_SOURCE,allocator));assert.equal(JSON.stringify(copy),snapshot);negatives++;}
reject(g=>g.sourceRef.kind='builtin-template');
reject(g=>g.sourceRef.revision='wrong');
reject(g=>g.sourceRecords={mode:'already-present'});
reject(g=>delete g.compatibility.idMap.chapters[source.chapters[0].id]);
reject(g=>g.chapters[g.chapterOrder[0]].sourceChapterId='wrong');
reject(g=>g.chapterOrder.pop());
reject(()=>{},()=> 'same-record-id');
assert.equal(JSON.stringify({chapters:game.chapters,generals:game.generals,compatibility:game.compatibility,source}),before);assert.equal(JSON.stringify(bundle),bundleBefore);
process.stdout.write(JSON.stringify({result:'PASS-COPY-SOURCE-RECORD-DTO-NOT-SERVER-UI',chapters:20,ordinarySourceRecords:2540,reservedRecords:20,independentGames:2,negativeControls:negatives,nativeNamedSourceUnchanged:true,limits:'Not installed in service/drafts yet; legacy general dictionary and native state unchanged; source-record identity is not historical person merge/edit/init'})+'\n');
