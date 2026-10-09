// Runtime-free local editor reader. No originals/ignored evidence/fallback IO.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {decodeEntitySource} from '../web/src/editor/entitysource.js';
import {BUILTIN_ENTITY_HISTORY} from '../web/src/editor/builtinentityhistory.generated.js';
import {resolveDraftEntitySource} from '../web/src/editor/entityhistory.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixedWebRead(url){return readFileSync(fileURLToPath(new URL('../web/'+url,import.meta.url)));}
async function readBoundEntitySource(d,dataURL,readWeb) {
  const data=await readWeb(dataURL);
  if(!(data instanceof Uint8Array)||sha(data)!==d.runtimeDataSha256)throw new TypeError('entity author source does not match current data');
  const bytes=await readWeb(d.manifestURL);
  if(!(bytes instanceof Uint8Array)||bytes.length!==d.manifestByteLength||sha(bytes)!==d.manifestSha256)throw new TypeError('invalid trusted entity author manifest');
  let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(cause){throw new TypeError('invalid entity author manifest JSON',{cause});}
  const body=await readWeb(d.resourceURL);
  return decodeEntitySource(manifest,body,d,sha);
}
export async function readInstalledEntitySource(readWeb=fixedWebRead) {
  return readBoundEntitySource(BUILTIN_ENTITY_SOURCE,BUILTIN_RESOURCES.dataURL,readWeb);
}
export async function readEntitySourceForDraft(game,readWeb=fixedWebRead) {
  // Current defaults may change later. A saved source index selects its exact
  // archived tuple, never a URL from the draft and never the latest as fallback.
  const current={sourceRevision:BUILTIN_RESOURCES.world.revision,dataURL:BUILTIN_RESOURCES.dataURL,descriptor:BUILTIN_ENTITY_SOURCE};
  const tuple=resolveDraftEntitySource(game,[...BUILTIN_ENTITY_HISTORY,current]);
  return {bundle:await readBoundEntitySource(tuple.descriptor,tuple.dataURL,readWeb),descriptor:tuple.descriptor};
}
