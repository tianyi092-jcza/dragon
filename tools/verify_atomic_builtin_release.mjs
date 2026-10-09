// Filesystem-only coherence/fault fixtures; owned OS temp, no real profile/Web.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {installCoherentBuiltinRelease,RELEASE_PATH,RELEASE_WRAPPERS} from './atomic_builtin_release.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),parent=mkdtempSync(join(tmpdir(),'dragon-release-atomic-'));
const before=Buffer.from('export const BUILTIN_RELEASE = { resources: { fixture: "old" }, entitySource: { fixture: "old" } };\n'),after=Buffer.from('export const BUILTIN_RELEASE = { resources: { fixture: "new" }, entitySource: { fixture: "new" } };\n');
const oldWrappers={'src/content/builtinresources.generated.js':'// owned old resources fixture\n','src/editor/builtinentitysource.generated.js':'// owned old author fixture\n'},previousWrapperSha256=Object.fromEntries(Object.entries(oldWrappers).map(([p,b])=>[p,sha(b)]));
const assetPath='content/builtin/compiled/map-2-'+'a'.repeat(64)+'/terrain.bin',assetBytes=Buffer.from('fixture-only'),args={baseModuleBytes:before,newModuleBytes:after,assets:[{path:assetPath,bytes:assetBytes}],previousWrapperSha256};
let cases=0;
function fresh(id){const root=join(parent,id);mkdirSync(root);for(const[p,b]of Object.entries(oldWrappers)){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),b);}return root;}
function selected(root){if(existsSync(join(root,RELEASE_PATH)))return readFileSync(join(root,RELEASE_PATH));return before;}
function noTemps(root){for(const e of readdirSync(root,{withFileTypes:true})){assert.ok(!e.name.includes('.date-switch-'));if(e.isDirectory())noTemps(join(root,e.name));}}
try{
  for(const point of['after-assets','after-base-module','after-resource-wrapper','after-entity-wrapper','before-switch']){
    const root=fresh(point);assert.throws(()=>installCoherentBuiltinRelease(root,args,stage=>{if(stage===point)throw new Error('owned interruption');}),/owned interruption/);assert.deepEqual(selected(root),before);noTemps(root);
    assert.equal(installCoherentBuiltinRelease(root,args).result,'SWITCHED-COHERENT-RELEASE');assert.deepEqual(selected(root),after);for(const[p,b]of Object.entries(RELEASE_WRAPPERS))assert.equal(readFileSync(join(root,p),'utf8'),b);assert.deepEqual(readFileSync(join(root,assetPath)),assetBytes);
    assert.equal(installCoherentBuiltinRelease(root,args).result,'UNCHANGED-COHERENT-RELEASE');cases++;
  }
  let root=fresh('immutable-conflict');mkdirSync(dirname(join(root,assetPath)),{recursive:true});writeFileSync(join(root,assetPath),'conflict');assert.throws(()=>installCoherentBuiltinRelease(root,args));assert.equal(existsSync(join(root,RELEASE_PATH)),false);assert.equal(readFileSync(join(root,assetPath),'utf8'),'conflict');cases++;
  root=fresh('path-reject');assert.throws(()=>installCoherentBuiltinRelease(root,{...args,assets:[{path:'../outside.bin',bytes:assetBytes}]}));assert.equal(existsSync(join(parent,'outside.bin')),false);assert.equal(existsSync(join(root,RELEASE_PATH)),false);cases++;
  root=fresh('unknown-wrapper');const first=Object.keys(oldWrappers)[0];writeFileSync(join(root,first),'owned concurrent edit');assert.throws(()=>installCoherentBuiltinRelease(root,args));assert.equal(readFileSync(join(root,first),'utf8'),'owned concurrent edit');assert.equal(existsSync(join(root,assetPath)),false);cases++;
  root=fresh('unknown-release');writeFileSync(join(root,RELEASE_PATH),'owned other release');assert.throws(()=>installCoherentBuiltinRelease(root,args));assert.equal(readFileSync(join(root,RELEASE_PATH),'utf8'),'owned other release');assert.equal(existsSync(join(root,assetPath)),false);cases++;
  for(const point of['after-base-module','before-switch']){root=fresh('concurrent-'+point);assert.throws(()=>installCoherentBuiltinRelease(root,args,stage=>{if(stage===point)writeFileSync(join(root,first),'owned later edit');}),/concurrent wrapper modification/);assert.deepEqual(selected(root),before);assert.equal(readFileSync(join(root,first),'utf8'),'owned later edit');noTemps(root);cases++;}
  root=fresh('concurrent-release');assert.throws(()=>installCoherentBuiltinRelease(root,args,stage=>{if(stage==='before-switch')writeFileSync(join(root,RELEASE_PATH),'owned later release');}),/concurrent local default modification/);assert.equal(readFileSync(join(root,RELEASE_PATH),'utf8'),'owned later release');noTemps(root);cases++;
  process.stdout.write(JSON.stringify({result:'PASS-OWNED-ATOMIC-SWITCH-FAULTS',cases,interruptionPoints:5,idempotentAfterResume:5,concurrentEditsPreserved:4,toolHashes:Object.fromEntries(['tools/verify_atomic_builtin_release.mjs','tools/atomic_builtin_release.mjs'].map(p=>[p,sha(readFileSync(fileURLToPath(new URL('../'+p,import.meta.url))))])),limits:'Filesystem-only fixtures,not production adoption/remote transaction/power-loss durability/cache/auth/runtime proof'})+'\n');
}finally{rmSync(parent,{recursive:true,force:true});}
