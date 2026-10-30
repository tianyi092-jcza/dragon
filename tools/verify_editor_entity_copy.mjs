// Source-record preservation in copied DTOs; fixed Web inputs only, memory output.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {readInstalledEntitySource} from './editor_entity_source.mjs';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {copyBuiltinGame, copyChapterInGame, chapterSaveGaps, validateGameSource} from '../web/src/content/authoring/gamesource.js';
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
// Explicit installed-source low-bit fixture (post-adoption); missing stays missing, not a migration of installed records.
const retained=structuredClone(game), chapterId=retained.chapterOrder[0];
const state=retained.chapters[chapterId].state, general=state.generals[0];
const originalLow=game.chapters[chapterId].state.generals[0].specialty_low_bits;
assert.ok(source.chapters.every(chapter=>chapter.state.generals.every(row=>Object.hasOwn(row,'specialty_low_bits') && /^[0-9a-f]{3}$/.test(row.specialty_low_bits))));
assert.equal(source.chapters.flatMap(chapter=>chapter.state.generals).filter(row=>row.specialty_low_bits!=='000').length,5);
for(const value of [null,undefined,'','00','0000','00G','00F','abc\n','abc\r\n',[0,0,0],0]){
  general.specialty_low_bits=value;
  assert.ok(chapterSaveGaps(state,chapterId).some(gap=>gap.code==='entity-save'&&gap.message.includes('specialty_low_bits')));
  for(const draft of [true,false]) assert.throws(()=>validateGameSource(retained,{draft}),/specialty_low_bits/);
  assert.deepEqual(general.specialty_low_bits,value);
}
for(const value of ['000','216','abc','fff']){
  general.specialty_low_bits=value;
  assert.ok(!chapterSaveGaps(state,chapterId).some(gap=>gap.message.includes('specialty_low_bits')));
  validateGameSource(retained,{draft:true});
}
general.specialty_low_bits='216';
const copiedId=copyChapterInGame(retained,chapterId);
assert.equal(retained.chapters[copiedId].state.generals[0].specialty_low_bits,'216');
assert.equal(JSON.parse(JSON.stringify(retained)).chapters[copiedId].state.generals[0].specialty_low_bits,'216');
delete general.specialty_low_bits;
validateGameSource(retained,{draft:true});
assert.equal(Object.hasOwn(general,'specialty_low_bits'),false);
assert.equal(game.chapters[chapterId].state.generals[0].specialty_low_bits, originalLow);
assert.ok(/^[0-9a-f]{3}$/.test(game.chapters[chapterId].state.generals[0].specialty_low_bits));
assert.equal(JSON.stringify({chapters:game.chapters,generals:game.generals,compatibility:game.compatibility,source}),before);
process.stdout.write(JSON.stringify({specialtyInvalidInputs:11,specialtyValidInputs:4,specialtyCopyAndJson:true,result:'PASS-COPY-SOURCE-RECORD-DTO-NOT-SERVER-UI',chapters:20,ordinarySourceRecords:2540,reservedRecords:20,independentGames:2,negativeControls:negatives,nativeNamedSourceUnchanged:true,limits:'Not installed in service/drafts yet; legacy general dictionary and native state unchanged; source-record identity is not historical person merge/edit/init'})+'\n');
