// Pure exact selection from CODE-TRUSTED tuples, never from draft-supplied URLs.
// This is source identity, not authentication, writable entity or save admission.
export function resolveDraftEntitySource(game, trustedEntries) {
  const index=game?.sourceRecords,ref=index?.resourceRef;
  if(!Array.isArray(trustedEntries)||game?.sourceRef?.kind!=='builtin-copy'||index?.schemaVersion!==1||index.mode!=='READONLY_SOURCE_RECORD_INDEX'||
     index.gameId!==game.gameId||index.sourceRevision!==game.sourceRef.revision||!ref)throw new TypeError('invalid draft entity source context');
  const matches=trustedEntries.filter(entry=>{
    const d=entry?.descriptor;
    return entry?.sourceRevision===index.sourceRevision&&d?.mode==='READONLY_IMPORT_INPUT'&&ref.url===d.resourceURL&&
      ref.sha256===d.resource?.sha256&&ref.byteLength===d.resource?.byteLength&&ref.runtimeDataSha256===d.runtimeDataSha256;
  });
  if(matches.length===0)throw new RangeError('unregistered draft entity source; no latest fallback');
  const selected=matches[0],d=selected.descriptor;
  if(!/^map-2-[a-f0-9]{64}$/.test(selected.sourceRevision)||selected.dataURL!==`content/builtin/compiled/${selected.sourceRevision}/data.json`||
     d.resourceURL!==`content/builtin/authoring/entities-${d.resource.sha256}/entity-source.json`||
     d.manifestURL!==`content/builtin/authoring/entities-${d.resource.sha256}/manifest.json`)throw new RangeError('invalid trusted source tuple');
  for(const entry of matches)if(entry.dataURL!==selected.dataURL||entry.descriptor.manifestURL!==d.manifestURL||entry.descriptor.manifestSha256!==d.manifestSha256||
      entry.descriptor.manifestByteLength!==d.manifestByteLength)throw new RangeError('ambiguous trusted entity history');
  return selected; // no modification, ID reassignment or historical-person merge
}
