// Explicit two owned candidates -> same production catalog/fresh/JSON restore.
// No server/browser/storage/DOS IO; fetch is exclusively an in-memory asset map.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {decodeEntitySource} from '../web/src/editor/entitysource.js';
import {createContentCatalog} from '../web/src/content/catalog.js';
import {createWorldResources} from '../web/src/game/worldresources.js';
import {createNewGameScenario} from '../web/src/game/world.js';
import {prepareScenario,snapshotScenarioAssembly,readSavedAssembly} from '../web/src/game/scenarioassembly.js';
import {canonicalDigest} from '../web/src/content/authoring/gamesource.js';
const root=fileURLToPath(new URL('../',import.meta.url)),rounds=process.argv.slice(2);assert.equal(rounds.length,2);assert.notEqual(...rounds);for(const r of rounds)assert.match(r,/^[A-Za-z0-9-]{1,64}$/);
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={},urlBytes=new Map();
function read(p){assert.ok(!/save\.dat/i.test(p));const b=readFileSync(join(root,p));inputs[p]=sha(b);return b;}
function json(b){try{return JSON.parse(b.toString('utf8'));}catch(cause){throw new TypeError('invalid controlled candidate JSON',{cause});}}
const oldPrefix=`content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`;
readInstalledEditorSource(BUILTIN_RESOURCES,url=>{assert.ok(url.startsWith(oldPrefix));return read('web/'+url);});
const oldManifest=json(read('web/'+oldPrefix+'manifest.json'));
const allowedInputs=new Set(['web/'+oldPrefix+'manifest.json',...oldManifest.assets.map(e=>'web/'+oldPrefix+e.path),'web/'+BUILTIN_ENTITY_SOURCE.manifestURL,'web/'+BUILTIN_ENTITY_SOURCE.resourceURL,'../Dragon/KI.EXE',
  'tools/stage_editor_date_candidate.mjs','tools/editor_builtin_source.mjs','tools/editor_entity_source.mjs','web/src/content/builtinresources.generated.js','web/src/editor/builtinentitysource.generated.js','web/src/editor/entitysource.js','web/src/content/authoring/gamesource.js','web/src/content/authoring/trialcompile.js','web/src/content/authoring/mapcompile.js','web/src/content/authoring/maplayers.js','web/src/content/authoring/fixedcitybindings.js','web/src/content/authoring/roadedit.js']);
function load(round){const folder='.dragon-analysis/editor-phase/'+round+'/',r=json(read(folder+'receipt.json'));assert.equal(r.result,'PASS-DATE-CANDIDATE-NOT-INSTALLED');
  for(const[p,h]of Object.entries(r.inputs)){assert.ok(allowedInputs.has(p),'undeclared candidate input');assert.equal(sha(read(p)),h);}
  const entries=new Map();for(const[p,h]of Object.entries(r.artifacts)){assert.match(p,/^(?:package\/(?:[A-Za-z0-9_-]+\.(?:json|bin|png)|chapters\/[A-Za-z0-9_-]+\.json)|author-input\/(?:entity-source|manifest)\.json|resources\.json|author-descriptor\.json)$/);const b=read(folder+p);assert.equal(sha(b),h);entries.set(p,b);}
  const manifest=json(entries.get('package/manifest.json')),resources=json(entries.get('resources.json')),source=json(entries.get('package/game-source.json')),data=json(entries.get('package/data.json')),catalog=json(entries.get('package/catalog.json'));
  assert.equal(manifest.geographyReview,'PENDING-DATE-DELTA');assert.equal(manifest.dateCorrection.status,'PENDING');assert.equal(Object.hasOwn(manifest,'displayAcceptance'),false);assert.equal(resources.world.revision,r.revision);assert.equal(manifest.sourceDigest,canonicalDigest(source,sha));
  for(const e of manifest.assets){assert.equal(e.url,`content/builtin/compiled/${r.revision}/${e.path}`);const b=entries.get('package/'+e.path);assert.equal(b.length,e.byteLength);assert.equal(sha(b),e.sha256);urlBytes.set(e.url,b);}
  return {r,entries,manifest,resources,source,data,catalog};}
const a=load(rounds[0]),b=load(rounds[1]);assert.deepEqual(a.r,b.r);for(const[p,bytes]of a.entries)assert.deepEqual(bytes,b.entries.get(p));
const oldSource=json(read('web/'+BUILTIN_RESOURCES.sourceURL)),oldData=json(read('web/'+BUILTIN_RESOURCES.dataURL));
const probe=structuredClone(a.source),dataProbe=structuredClone(a.data);for(const c of a.r.changes){probe.chapters[c.chapterId].state.start[c.field]=c.old;dataProbe.scenarios[c.idx].start[c.field]=c.old;}
assert.deepEqual(probe,oldSource);assert.deepEqual(dataProbe,oldData);assert.equal(a.r.alteredRoles.length,6);assert.equal(a.r.unchangedRoles,32);
for(const e of oldManifest.assets){const bytes=read('web/'+oldPrefix+e.path);assert.equal(sha(bytes),e.sha256);urlBytes.set(e.url,bytes);if(!a.r.alteredRoles.includes(e.path))assert.deepEqual(a.entries.get('package/'+e.path),bytes);}
assert.throws(()=>readInstalledEditorSource(a.resources,url=>urlBytes.get(url)||a.entries.get('package/manifest.json')),/APPROVED/);
const d=json(a.entries.get('author-descriptor.json')),m=json(a.entries.get('author-input/manifest.json')),author=await decodeEntitySource(m,a.entries.get('author-input/entity-source.json'),d,sha);
assert.equal(d.runtimeDataSha256,sha(a.entries.get('package/data.json')));assert.equal(d.manifestSha256,sha(a.entries.get('author-input/manifest.json')));
const oldAuthor=json(read('web/'+BUILTIN_ENTITY_SOURCE.resourceURL)),authorProbe=structuredClone(author);authorProbe.runtimeDataSha256=oldAuthor.runtimeDataSha256;assert.deepEqual(authorProbe,oldAuthor);
await assert.rejects(()=>decodeEntitySource(m,a.entries.get('author-input/entity-source.json'),BUILTIN_ENTITY_SOURCE,sha));
const oldCatalog=json(read('web/'+BUILTIN_RESOURCES.catalogURL)),oldContent=createContentCatalog(oldCatalog,oldData),newContent=createContentCatalog(a.catalog,a.data),oldWorld=createWorldResources(BUILTIN_RESOURCES.world),newWorld=createWorldResources(a.resources.world);
const priorFetch=globalThis.fetch,requests=[];
globalThis.fetch=async url=>{const key=String(url);assert.ok(urlBytes.has(key),`no network/fallback ${key}`);requests.push(key);return new Response(urlBytes.get(key),{status:200});};
let count=0,identityRejections=0;
try{for(let idx=0;idx<20;idx++){
  const prepare=async(content,world)=>prepareScenario({raw:createNewGameScenario(content.chapter(idx).template,0),idx,mode:'fresh',content,world});
  const old=await prepare(oldContent,oldWorld),fresh=await prepare(newContent,newWorld);
  assert.deepEqual(fresh.scenario.start,a.data.scenarios[idx].start);
  const stateProbe=structuredClone(fresh.scenario);stateProbe.start=old.scenario.start;assert.deepEqual(stateProbe,structuredClone(old.scenario));
  const webMeta=snapshotScenarioAssembly({scenario:fresh.scenario,scenarioIdx:idx,content:newContent,world:newWorld});
  const wire=JSON.stringify({state:fresh.scenario,webMeta});let saved;try{saved=JSON.parse(wire);}catch(cause){throw new Error('candidate JSON transport failed',{cause});}
  const restored=await prepareScenario({raw:saved.state,idx,mode:'restore',content:newContent,world:newWorld,...readSavedAssembly(saved)});
  assert.deepEqual(structuredClone(restored.scenario),structuredClone(fresh.scenario));assert.deepEqual(snapshotScenarioAssembly({scenario:restored.scenario,scenarioIdx:idx,content:newContent,world:newWorld}),webMeta);
  const oldMeta=snapshotScenarioAssembly({scenario:old.scenario,scenarioIdx:idx,content:oldContent,world:oldWorld});
  await assert.rejects(()=>prepareScenario({raw:saved.state,idx,mode:'restore',content:newContent,world:newWorld,...readSavedAssembly({state:old.scenario,webMeta:oldMeta})}),/mismatch/);identityRejections++;
  count++;
}}finally{globalThis.fetch=priorFetch;}
assert.equal(requests.length,8);for(const[p,h]of Object.entries(inputs))assert.equal(sha(readFileSync(join(root,p))),h);
const toolHashes=Object.fromEntries(['tools/verify_editor_date_candidate.mjs','web/src/game/scenarioassembly.js','web/src/game/world.js','web/src/game/worldresources.js','web/src/content/catalog.js'].map(p=>[p,sha(readFileSync(join(root,p)))]));
process.stdout.write(JSON.stringify({result:'PASS-DATE-CANDIDATE-SAME-ENGINE-NOT-INSTALLED',sourceHashes:inputs,toolHashes,revision:a.r.revision,identicalCandidates:2,changedRoles:6,unchangedRoleBytes:32,chapters:count,productionFreshAndJsonRestore:20,wrongPriorIdentityRejections:identityRejections,resourceRequests:requests,authorRecordBytesUnchanged:true,limits:'No adoption/App/browser/clock progression/full campaign or publisher auth. Unknown existing event tail preserved only; flags PENDING and source acceptance not relabeled.'})+'\n');
