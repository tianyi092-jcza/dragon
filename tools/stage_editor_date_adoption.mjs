// Fixed evidence-bound staging only. No shared asset/module/draft/save writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {readInstalledEntitySource} from './editor_entity_source.mjs';
import {compileGameSource} from '../web/src/content/authoring/trialcompile.js';
import {canonicalDigest} from '../web/src/content/authoring/gamesource.js';
import {checkDateDisplayInheritance,DATE_BASE_REVISION} from './date_display_inheritance.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),[first,second,round]=process.argv.slice(2);
assert.equal(process.argv.length,5);assert.equal(first,'date-candidate-r3');assert.equal(second,'date-candidate-r4');assert.match(round??'',/^[A-Za-z0-9-]{1,64}$/);assert.notEqual(round,first);assert.notEqual(round,second);
assert.equal(BUILTIN_RESOURCES.world.revision,DATE_BASE_REVISION);
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={},base='.dragon-analysis/editor-phase/';
function read(p){assert.ok(!/save\.dat/i.test(p));const b=readFileSync(join(root,p));inputs[p]=sha(b);return b;}
function json(b){try{return JSON.parse(b.toString('utf8'));}catch(cause){throw new TypeError('invalid fixed date adoption evidence',{cause});}}
const oldPrefix=`content/builtin/compiled/${DATE_BASE_REVISION}/`,baseManifest=json(read('web/'+oldPrefix+'manifest.json'));
readInstalledEditorSource(BUILTIN_RESOURCES,url=>{assert.ok(url.startsWith(oldPrefix));return read('web/'+url);});
const oldAuthor=await readInstalledEntitySource(url=>{assert.ok([BUILTIN_RESOURCES.dataURL,BUILTIN_ENTITY_SOURCE.manifestURL,BUILTIN_ENTITY_SOURCE.resourceURL].includes(url));return read('web/'+url);});
const baseAssets=new Map(baseManifest.assets.map(e=>[e.path,read('web/'+e.url)]));
const producerTools=['tools/stage_editor_date_candidate.mjs','tools/editor_builtin_source.mjs','tools/editor_entity_source.mjs','web/src/content/builtinresources.generated.js','web/src/editor/builtinentitysource.generated.js','web/src/editor/entitysource.js','web/src/content/authoring/gamesource.js','web/src/content/authoring/trialcompile.js','web/src/content/authoring/mapcompile.js','web/src/content/authoring/maplayers.js','web/src/content/authoring/fixedcitybindings.js','web/src/content/authoring/roadedit.js'];
const allowed=new Set([...Object.keys(inputs),'../Dragon/KI.EXE',...producerTools]);
const a=json(read(base+first+'/receipt.json')),b=json(read(base+second+'/receipt.json'));assert.deepEqual(a,b);assert.equal(a.result,'PASS-DATE-CANDIDATE-NOT-INSTALLED');
for(const[p,h]of Object.entries(a.inputs)){assert.ok(allowed.has(p));assert.equal(sha(read(p)),h);}
const files=new Map();for(const[p,h]of Object.entries(a.artifacts)){assert.match(p,/^(?:package\/(?:[A-Za-z0-9_-]+\.(?:json|bin|png)|chapters\/[A-Za-z0-9_-]+\.json)|author-input\/(?:entity-source|manifest)\.json|resources\.json|author-descriptor\.json)$/);const bytes=read(base+first+'/'+p);assert.equal(sha(bytes),h);assert.deepEqual(bytes,read(base+second+'/'+p));files.set(p,bytes);allowed.add(base+first+'/'+p);allowed.add(base+second+'/'+p);}
for(const r of[first,second])allowed.add(base+r+'/receipt.json');
const manifest=json(files.get('package/manifest.json')),resources=json(files.get('resources.json')),assets=new Map(manifest.assets.map(e=>[e.path,files.get('package/'+e.path)]));
assert.equal(manifest.geographyReview,'PENDING-DATE-DELTA');assert.equal(manifest.dateCorrection.status,'PENDING');assert.equal(Object.hasOwn(manifest,'displayAcceptance'),false);
const inheritance=checkDateDisplayInheritance({baseResources:BUILTIN_RESOURCES,baseManifest,baseAssets,resources,manifest,assets,acceptanceBytes:read('docs/data/current-map-display-acceptance.json')});
const machineTools=['tools/verify_editor_date_candidate.mjs','web/src/game/scenarioassembly.js','web/src/game/world.js','web/src/game/worldresources.js','web/src/content/catalog.js'];
const appTools=['tools/verify_editor_date_app.mjs','tools/browser_test_server.mjs','web/src/main.js','web/src/game/clock.js','web/src/ui/hud.js','web/src/ui/gamebar.js','web/src/editor/trialpolicy.js'];
for(const p of[...machineTools,...appTools,'web/index.html',base+'date-app-session-r1/candidate-verify.log'])allowed.add(p);
function verifyHashes(object){for(const[p,h]of Object.entries(object)){assert.ok(allowed.has(p),'unexpected proof input '+p);assert.equal(sha(read(p)),h);}}
const fresh=json(read(base+'date-app-session-r1/candidate-verify.log'));assert.equal(fresh.revision,a.revision);assert.equal(fresh.result,'PASS-DATE-CANDIDATE-SAME-ENGINE-NOT-INSTALLED');assert.equal(fresh.productionFreshAndJsonRestore,20);assert.equal(fresh.wrongPriorIdentityRejections,20);assert.deepEqual(Object.keys(fresh.toolHashes),machineTools);verifyHashes(fresh.sourceHashes);verifyHashes(fresh.toolHashes);
const app=json(read(base+'date-app-browser-r1/receipt.json'));assert.equal(app.revision,a.revision);assert.equal(app.result,'PASS-PENDING-DATE-APP-NOT-INSTALLED');assert.deepEqual(Object.keys(app.toolHashes),appTools);verifyHashes(app.sourceHashes);verifyHashes(app.toolHashes);assert.deepEqual(app.errors,[]);assert.deepEqual(app.forbidden,[]);
assert.deepEqual(app.cases.map(c=>[c.idx,c.candidate,c.clock.year,c.serial,c.idb]),[[14,false,8,0,0],[14,true,264,0,0],[15,false,10,0,0],[15,true,266,0,0]]);
for(const c of app.cases){assert.deepEqual(c.before,c.after);assert.equal(c.gameStarted,true);assert.equal(c.runtimeEnabled,true);assert.equal(c.canPersist,false);assert.deepEqual(c.denied,{save:{saved:'blocked',reason:'trial'},load:false});}
const source=json(assets.get('game-source.json')),compiled=compileGameSource(source,sha);assert.equal(compiled.sourceDigest,inheritance.sourceDigest);
assert.deepEqual(Buffer.from(compiled.terrainBytes),assets.get('terrain.bin'));assert.deepEqual(compiled.roadGraph,json(assets.get('roads.json')));assert.deepEqual(Buffer.from(compiled.roadCost),assets.get('road_cost.bin'));assert.deepEqual(Buffer.from(compiled.roadOffsetBytes),assets.get('road_offset.json'));
const nextAuthor=json(files.get('author-input/entity-source.json')),probe=structuredClone(nextAuthor);probe.runtimeDataSha256=oldAuthor.runtimeDataSha256;assert.deepEqual(probe,oldAuthor);assert.equal(nextAuthor.runtimeDataSha256,sha(assets.get('data.json')));
for(let idx=0;idx<20;idx++){const c=nextAuthor.chapters[idx],h=Buffer.from(c.header128,'hex');assert.equal(c.chapterId,source.chapterOrder[idx]);assert.deepEqual(source.chapters[c.chapterId].state.start,{day:h[0],month:h[4],year:h.readUInt16LE(6)});}
const ki=read('../Dragon/KI.EXE');assert.equal(sha(ki),'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868');const signatures={0x1d9c:'a1f00c',0x1d9f:'3ac4',0x1dd7:'fe06f00c',0x1daa:'813ef60ce803',0x1db2:'c706f60ce603',0x1db8:'ff06f60c',0x8c62:'8b4406'};for(const[va,hex]of Object.entries(signatures))assert.equal(ki.subarray(Number(va)+0x200,Number(va)+0x200+hex.length/2).toString('hex'),hex);
const tools={};for(const p of['tools/stage_editor_date_adoption.mjs','tools/date_display_inheritance.mjs'])tools[p]=sha(read(p));
const contractPath='docs/editor-date-adoption-contract.md',contractSha256=sha(read(contractPath));
const evidence={candidateRevision:a.revision,freshJsonSha256:inputs[base+'date-app-session-r1/candidate-verify.log'],appReceiptSha256:inputs[base+'date-app-browser-r1/receipt.json'],contractSha256};
const revision='map-2-'+canonicalDigest({contract:'date-map-inheritance-1',inheritance,evidence,tools},sha),prefix=`content/builtin/compiled/${revision}/`,pendingPrefix=`content/builtin/compiled/${a.revision}/`;
const world=structuredClone(resources.world);world.revision=revision;const rebase=url=>{assert.ok(url.startsWith(pendingPrefix));return prefix+url.slice(pendingPrefix.length);};
for(const k of['terrain','roadGraph','roadCost','roadOffset'])world.assets[k]=rebase(world.assets[k]);for(const k of['seasonAtlases','seasons','minimap'])for(const n of Object.keys(world.assets[k]))world.assets[k][n]=rebase(world.assets[k][n]);
const encode=v=>Buffer.from(JSON.stringify(v)+'\n');
assets.set('world-definition.json',encode(world));const catalog=json(assets.get('catalog.json'));catalog.revision=revision;assets.set('catalog.json',encode(catalog));
const acceptedResources={...resources,world,catalogURL:prefix+'catalog.json',dataURL:prefix+'data.json',sourceURL:prefix+'game-source.json',geographyReview:'APPROVED'};
const certificate={...inheritance,evidence};
const acceptedManifest={...manifest,contentRevision:revision,worldRevision:revision,geographyReview:'APPROVED',visualReview:'APPROVED',authorDisplayData:{...manifest.authorDisplayData,status:'APPROVED'},displayAcceptanceInheritance:certificate,dateCorrection:{...manifest.dateCorrection,status:'APPLIED-ORIGINAL-WORD-IMPORT',kiSha256:sha(ki),signatures},assets:manifest.assets.map(e=>({...e,url:prefix+e.path,byteLength:assets.get(e.path).length,sha256:sha(assets.get(e.path))}))};
const descriptor=json(files.get('author-descriptor.json')),release={schemaVersion:1,resources:acceptedResources,entitySource:descriptor};
const freezeText='function freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\n';
const releaseModule=Buffer.from('// Generated coherent resources/author-input tuple. One atomic switch point.\n'+freezeText+'export const BUILTIN_RELEASE = freeze('+JSON.stringify(release)+');\n');
for(const[p,h]of Object.entries(inputs))assert.equal(sha(readFileSync(join(root,p))),h,'proof changed while staging');
const output=join(root,base,round);mkdirSync(output);mkdirSync(join(output,'package'));mkdirSync(join(output,'package/chapters'));mkdirSync(join(output,'author-input'));
const artifactHashes={};function write(p,bytes){writeFileSync(join(output,p),bytes,{flag:'wx'});artifactHashes[p]=sha(bytes);}
for(const[p,bytes]of assets)write('package/'+p,bytes);write('package/manifest.json',Buffer.from(JSON.stringify(acceptedManifest,null,2)+'\n'));
for(const p of['entity-source.json','manifest.json'])write('author-input/'+p,files.get('author-input/'+p));
write('release.json',encode(release));write('builtinrelease.generated.js',releaseModule);
writeFileSync(join(output,'receipt.json'),encode({result:'PASS-DATE-MAP-INHERITANCE-STAGED-NOT-INSTALLED',revision,sourceDigest:inheritance.sourceDigest,inputs,tools,artifactHashes,release,certificate,limits:'Machine inheritance of exact old map scope,not new human approval. Date KI/header correction. No switch/draft/save/auth/init/full goal completion.'}),{flag:'wx'});
process.stdout.write(JSON.stringify({result:'PASS-DATE-MAP-INHERITANCE-STAGED-NOT-INSTALLED',revision,changes:inheritance.changes,unchangedRoleBytes:32})+'\n');
