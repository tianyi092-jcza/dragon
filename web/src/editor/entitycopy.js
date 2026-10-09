// Additive source-record preservation, NOT GeneralDefinition edits/initializers.
import {createImportedEntityIndex} from './entityindex.js';
export function copyEntitySourceRecords(game, source, bundle, descriptor, allocateId) {
  if(game?.sourceRef?.kind!=='builtin-copy'||game.sourceRef.revision!==source?.revision||game.sourceRecords!==undefined||
     bundle?.mode!=='READONLY_IMPORT_INPUT'||bundle.runtimeDataSha256!==descriptor?.runtimeDataSha256||
     !Array.isArray(bundle.chapters)||!Array.isArray(source.chapters)||bundle.chapters.length!==source.chapters.length)
    throw new TypeError('explicit full-copy entity source context required');
  const targets=new Set();
  for(const chapter of source.chapters){
    const target=game.compatibility?.idMap?.chapters?.[chapter.id];
    if(typeof target!=='string'||targets.has(target)||game.chapters?.[target]?.sourceChapterId!==chapter.id)
      throw new RangeError('incomplete source chapter binding');
    targets.add(target);
  }
  if(targets.size!==game.chapterOrder.length||game.chapterOrder.some(id=>!targets.has(id)))throw new RangeError('mixed target chapter context');
  const index=createImportedEntityIndex({gameId:game.gameId,sourceRevision:source.revision,chapters:source.chapters,
    rawChapters:bundle.chapters.map(c=>({chapterId:c.chapterId,rawGeneralRecords:c.general32}))},allocateId);
  const bindings={};
  for(const [sourceId,binding]of Object.entries(index.bindings)){
    const targetId=game.compatibility.idMap.chapters[sourceId];
    Object.defineProperty(bindings,targetId,{enumerable:true,value:{...binding,targetChapterId:targetId,sourceChapterId:sourceId}});
  }
  // Return separately; caller installs ONLY after all checks succeed. Neither
  // source nor runtime/named state or the legacy dictionary is rewritten.
  return {schemaVersion:1,mode:'READONLY_SOURCE_RECORD_INDEX',gameId:game.gameId,sourceRevision:source.revision,
    resourceRef:{url:descriptor.resourceURL,sha256:descriptor.resource.sha256,byteLength:descriptor.resource.byteLength,runtimeDataSha256:descriptor.runtimeDataSha256},
    entities:index.entities,bindings,policy:'per-game independent source-record IDs; not historical-person merge or writable actor authority'};
}
