// Read-only serialization inventory, NOT edit/init or exhaustive rule references.
export function inspectEntitySources(game, bundle, descriptor, chapterId = game.chapterOrder?.[0]) {
  const index = game.sourceRecords;
  const chapters = (game.chapterOrder ?? []).map(id => ({ id, sourceId: game.chapters[id].sourceChapterId, name: game.chapters[id].state.name ?? id }));
  const overview = { gameId: game.gameId, revision: game.localModel.draftRevision, chapters, legacyDictionaryCount: Object.keys(game.generals ?? {}).length };
  if (index === undefined) return { ...overview, available: false, reason: "此草稿未保存完整人物來源；舊草稿不自動補，請建立新的完整副本。", records: [] };
  const entry = game.chapters?.[chapterId], binding = index.bindings?.[chapterId];
  if (!entry || !game.chapterOrder.includes(chapterId) || index.mode !== "READONLY_SOURCE_RECORD_INDEX" || index.gameId !== game.gameId || index.sourceRevision !== game.sourceRef.revision ||
      index.resourceRef?.sha256 !== descriptor.resource.sha256 || index.resourceRef.url !== descriptor.resourceURL || index.resourceRef.byteLength !== descriptor.resource.byteLength ||
      index.resourceRef.runtimeDataSha256 !== descriptor.runtimeDataSha256 || bundle.runtimeDataSha256 !== descriptor.runtimeDataSha256 ||
      binding?.targetChapterId !== chapterId || binding.sourceChapterId !== entry.sourceChapterId) throw new RangeError("人物來源身份／章映射不一致");
  const source = bundle.chapters.find(c => c.chapterId === entry.sourceChapterId);
  if (!source || binding.completeOriginalRecords?.length !== 128 || Object.keys(binding.slotMap ?? {}).length !== 127 || Object.hasOwn(binding.slotMap,127)) throw new RangeError("人物來源記錄不完整");
  const byte = (hex, offset) => Number.parseInt(hex.slice(offset * 2, offset * 2 + 2),16);
  const references = Array.from({length:128},()=>[]), nonOrdinaryReferences=[];
  function reference(kind, slot, field, value) {
    const ref={kind,slot,field,value};
    if (value < 128) references[value].push(ref);
    else nonOrdinaryReferences.push(ref); // preserve FF/other byte, do not invent G255
  }
  source.city32.forEach((raw,slot)=>reference("C",slot,"+19 太守",byte(raw,0x19)));
  source.faction64.slice(0,22).forEach((raw,slot)=>{reference("F",slot,"+01 君主",byte(raw,1));reference("F",slot,"+02 軍師",byte(raw,2));});
  const ids=new Set(),records=[];
  for(let slot=0;slot<128;slot++) {
    const original=binding.completeOriginalRecords[slot], raw=source.general32[slot], named=entry.state.generals?.[slot];
    if(original?.originalRaw32!==raw || original.runtimeSlot!==slot || original.sourceChapterId!==entry.sourceChapterId || named?.idx!==slot) throw new RangeError("人物來源槽／原字節不一致");
    const id=slot===127?null:binding.slotMap[slot], entity=id===null?null:index.entities?.[id];
    if(slot===127) { if(binding.reserved127?.originalRaw32!==raw || binding.reserved127.runtimeSlot!==127) throw new RangeError("G127保留記錄不一致"); }
    else if(typeof id!=="string" || ids.has(id) || entity?.id!==id || entity.gameId!==game.gameId || entity.origin?.sourceRevision!==index.sourceRevision || entity.origin.sourceChapterId!==entry.sourceChapterId || entity.origin.runtimeSlot!==slot || entity.origin.originalRaw32!==raw) throw new RangeError("人物來源ID／溯源不一致");
    ids.add(id);
    const differences=[];
    for(const[key,offset]of[["force",17],["lead",18],["politics",19]])if(named.ability?.[key]!==byte(raw,offset))differences.push({field:key,template:named.ability?.[key]??null,original:byte(raw,offset)});
    records.push({slot,id,reserved:slot===127,name:named.name,hao:named.hao,sourceName:entity?.display.name??null,legacyName:game.generals?.[slot]?.name??null,
      originalRaw32:raw,unknownOffsets:[20,21,27],ability:{force:byte(raw,17),lead:byte(raw,18),politics:byte(raw,19)},differences,references:references[slot]});
  }
  const header=source.header128, originalStart={day:byte(header,0),month:byte(header,4),year:byte(header,6)+byte(header,7)*256};
  return {...overview,available:true,chapterId,sourceChapterId:entry.sourceChapterId,resourceRef:structuredClone(index.resourceRef),
    originalStart,templateStart:structuredClone(entry.state.start),records,nonOrdinaryReferences,
    limits:"來源實例不是歷史人物；只列原C19/F01/F02引用，不是全消費者／任免／初始化認證；不改模板、草稿、執行中對局或存檔。"};
}
