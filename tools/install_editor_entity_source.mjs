// Explicit local author-input installation only. Never switch current game,
// write originals/drafts/profile, deploy, or trust a manifest's own hash.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
const root=fileURLToPath(new URL('../',import.meta.url)),[first,second]=process.argv.slice(2);assert.equal(process.argv.length,4);assert.notEqual(first,second);
for(const r of[first,second])assert.match(r??'',/^[a-zA-Z0-9-]{1,64}$/);
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFileSync(join(root,p));
function json(p){try{return JSON.parse(read(p).toString());}catch(cause){throw new Error('invalid explicit source package',{cause});}}
const stages=[first,second].map(r=>`.dragon-analysis/editor-phase/${r}/`),a=json(stages[0]+'receipt.json'),b=json(stages[1]+'receipt.json');assert.deepEqual(a,b);assert.equal(a.result,'PASS-STAGE-READONLY-NOT-INSTALLED');
// Independently sealed latest verifier, including its exact tool and input SHA.
const v=json('.dragon-analysis/editor-phase/entity-source-session-r1/source-verify-r2.log');assert.equal(v.result,'PASS-SCOPED-STAGED-SOURCE-NOT-INSTALLED');assert.equal(v.negativeControls,8);
const fixedTools=new Set(['tools/stage_editor_entity_source.mjs','tools/editor_builtin_source.mjs','tools/verify_editor_entity_source.mjs','web/src/editor/entitysource.js','web/src/editor/entityindex.js','web/src/content/builtinresources.generated.js','web/src/content/authoring/gamesource.js','web/src/content/authoring/trialcompile.js','web/src/content/authoring/maplayers.js','web/src/content/authoring/mapcompile.js','web/src/content/authoring/roadedit.js','web/src/content/authoring/fixedcitybindings.js']);
const fixedStage=new Set(stages.flatMap(p=>[p+'receipt.json',p+'package/entity-source.json',p+'package/manifest.json']));
const compiledPrefix=`web/content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`;
for(const[p,h]of Object.entries({...v.sourceHashes,...v.toolHashes,...a.sourceHashes,...a.toolHashes})){
  assert.ok((p.startsWith(compiledPrefix)&&/^(?:chapters\/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(p.slice(compiledPrefix.length)))||fixedTools.has(p)||fixedStage.has(p)||['../上/SINARIO.DAT','../中/SINARIO.DAT','../下/SINARIO.DAT','../后/SINARIO.DAT','../原版/SINARIO.DAT'].includes(p));
  assert.ok(!/save\.dat/i.test(p));assert.equal(hash(read(p)),h,p);
}
const body=read(stages[0]+'package/entity-source.json'),manifestBytes=read(stages[0]+'package/manifest.json'),m=json(stages[0]+'package/manifest.json');
assert.deepEqual(body,read(stages[1]+'package/entity-source.json'));assert.deepEqual(manifestBytes,read(stages[1]+'package/manifest.json'));assert.deepEqual(m,a.manifest);
assert.equal(m.resource.sha256,hash(body));assert.equal(m.resource.byteLength,body.length);assert.equal(m.runtimeDataSha256,hash(read('web/'+BUILTIN_RESOURCES.dataURL)));
const payload=json(stages[0]+'package/entity-source.json');assert.equal(payload.chapters.length,20);
const prefix=`content/builtin/authoring/entities-${m.resource.sha256}/`;
const descriptor={schemaVersion:1,mode:'READONLY_IMPORT_INPUT',manifestURL:prefix+'manifest.json',manifestSha256:hash(manifestBytes),manifestByteLength:manifestBytes.length,
  resourceURL:prefix+'entity-source.json',resource:m.resource,runtimeDataSha256:m.runtimeDataSha256,sourceChapterOrder:payload.sourceChapterOrder,originalSources:m.originalSources};
const generated='// Generated explicit author-input descriptor; NOT a runtime manifest.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_ENTITY_SOURCE = freeze('+JSON.stringify(descriptor,null,2)+');\n';
const modulePath='web/src/editor/builtinentitysource.generated.js';
function immutableWrite(p,bytes){if(existsSync(join(root,p))){assert.deepEqual(read(p),Buffer.from(bytes),'immutable author resource differs: '+p);return;}writeFileSync(join(root,p),bytes,{flag:'wx'});}
// All preconditions and descriptor conflict checks BEFORE creating assets.
if(existsSync(join(root,modulePath)))assert.deepEqual(read(modulePath),Buffer.from(generated));
mkdirSync(join(root,'web',prefix),{recursive:true});
immutableWrite('web/'+prefix+'entity-source.json',body);immutableWrite('web/'+prefix+'manifest.json',manifestBytes);
immutableWrite(modulePath,generated); // reference last; no current manifest replaced
for(const[p,h]of Object.entries(a.sourceHashes))assert.equal(hash(read(p)),h,'input drift after local installation');
process.stdout.write(JSON.stringify({result:'PASS-LOCAL-AUTHOR-SOURCE-INSTALLED-NOT-RUNTIME',descriptor,installedHashes:Object.fromEntries(['web/'+prefix+'entity-source.json','web/'+prefix+'manifest.json',modulePath].map(p=>[p,hash(read(p))])),
  limits:'Only new immutable author inputs; no current game switch, draft/UI/actor edit/init/merge or deployment'})+'\n');
