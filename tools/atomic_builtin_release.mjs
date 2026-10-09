// Local immutable-file staging + one atomic default switch. Not a disk/remote transaction.
import assert from 'node:assert/strict';
import {existsSync,lstatSync,realpathSync,readFileSync,writeFileSync,mkdirSync,renameSync,unlinkSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join,sep,dirname} from 'node:path';
export const RELEASE_PATH='src/content/builtinrelease.generated.js';
export const RELEASE_WRAPPERS={
  'src/content/builtinresources.generated.js':'// Coherent builtin tuple; history and approval live in immutable artifacts.\nimport { BUILTIN_RELEASE } from "./builtinrelease.generated.js";\nexport const BUILTIN_RESOURCES = BUILTIN_RELEASE.resources;\n',
  'src/editor/builtinentitysource.generated.js':'// Coherent builtin tuple; author input is NOT a runtime initializer.\nimport { BUILTIN_RELEASE } from "../content/builtinrelease.generated.js";\nexport const BUILTIN_ENTITY_SOURCE = BUILTIN_RELEASE.entitySource;\n'};
const sha=b=>createHash('sha256').update(b).digest('hex');
export function installCoherentBuiltinRelease(targetRoot,{baseModuleBytes,newModuleBytes,assets,previousWrapperSha256},hook=()=>{}) {
  assert.ok(baseModuleBytes instanceof Uint8Array&&newModuleBytes instanceof Uint8Array);assert.notDeepEqual(baseModuleBytes,newModuleBytes);
  assert.ok(Array.isArray(assets)&&typeof hook==='function');assert.ok(!lstatSync(targetRoot).isSymbolicLink());
  const root=realpathSync(targetRoot),seen=new Set();
  function path(relative){assert.ok(!relative.includes('\\')&&!relative.startsWith('/')&&!relative.split('/').includes('..'));const target=resolve(root,relative);assert.ok(target.startsWith(root+sep));
    let parent=root;for(const part of relative.split('/')){parent=join(parent,part);if(existsSync(parent))assert.ok(!lstatSync(parent).isSymbolicLink(),'symlink in controlled target');}return target;}
  const expected=new Map();
  for(const entry of assets){assert.match(entry.path,/^content\/builtin\/(?:compiled\/map-2-[a-f0-9]{64}\/(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)|authoring\/entities-[a-f0-9]{64}\/(?:entity-source|manifest)\.json)$/);assert.ok(entry.bytes instanceof Uint8Array);assert.ok(!seen.has(entry.path));seen.add(entry.path);const target=path(entry.path);if(existsSync(target))assert.deepEqual(readFileSync(target),Buffer.from(entry.bytes),'immutable file conflict');expected.set(target,entry.bytes);}
  const releasePath=path(RELEASE_PATH),oldRelease=existsSync(releasePath)?readFileSync(releasePath):null;
  const already=oldRelease!==null&&Buffer.from(newModuleBytes).equals(oldRelease);
  if(oldRelease!==null&&!already)assert.deepEqual(oldRelease,Buffer.from(baseModuleBytes),'unknown release must not be replaced');
  for(const[relative,text]of Object.entries(RELEASE_WRAPPERS)){const target=path(relative),bytes=readFileSync(target);assert.ok(sha(bytes)===previousWrapperSha256[relative]||bytes.equals(Buffer.from(text)),'unknown wrapper modification');if(already)assert.deepEqual(bytes,Buffer.from(text),'incoherent installed release');}
  function atomic(relative,bytes,expectedOld){const target=path(relative),temp=target+'.date-switch-'+randomUUID();mkdirSync(dirname(target),{recursive:true});
    try{writeFileSync(temp,bytes,{flag:'wx'});const current=existsSync(target)?readFileSync(target):null;if(expectedOld===null)assert.equal(current,null);else assert.deepEqual(current,expectedOld,'concurrent local default modification');renameSync(temp,target);}finally{if(existsSync(temp))unlinkSync(temp);}}
  for(const[target,bytes]of expected){mkdirSync(dirname(target),{recursive:true});if(!existsSync(target))writeFileSync(target,bytes,{flag:'wx'});assert.deepEqual(readFileSync(target),Buffer.from(bytes));}
  hook('after-assets');
  if(already)return {result:'UNCHANGED-COHERENT-RELEASE',immutableFiles:assets.length};
  if(oldRelease===null)atomic(RELEASE_PATH,baseModuleBytes,null);
  hook('after-base-module');
  for(const[relative,text]of Object.entries(RELEASE_WRAPPERS)){const old=readFileSync(path(relative));assert.ok(sha(old)===previousWrapperSha256[relative]||old.equals(Buffer.from(text)),'concurrent wrapper modification');if(!old.equals(Buffer.from(text)))atomic(relative,Buffer.from(text),old);hook(relative.includes('/editor/')?'after-entity-wrapper':'after-resource-wrapper');}
  hook('before-switch');for(const[relative,text]of Object.entries(RELEASE_WRAPPERS))assert.deepEqual(readFileSync(path(relative)),Buffer.from(text),'concurrent wrapper modification before switch');atomic(RELEASE_PATH,newModuleBytes,Buffer.from(baseModuleBytes));
  assert.deepEqual(readFileSync(releasePath),Buffer.from(newModuleBytes));
  return {result:'SWITCHED-COHERENT-RELEASE',immutableFiles:assets.length,limits:'Immutable additions/old baseline wrappers may remain after failure; one rename for defaults,not filesystem/deployment transaction. No old asset/draft/save cleanup.'};
}
