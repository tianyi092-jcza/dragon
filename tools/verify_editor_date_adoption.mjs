// Independent approved-form stage algebra and production loader; no installation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {checkDateDisplayInheritance,DATE_BASE_REVISION} from './date_display_inheritance.mjs';
import {canonicalDigest} from '../web/src/content/authoring/gamesource.js';
import {decodeEntitySource} from '../web/src/editor/entitysource.js';
import {createContentCatalog} from '../web/src/content/catalog.js';
import {createWorldResources} from '../web/src/game/worldresources.js';
import {createNewGameScenario} from '../web/src/game/world.js';
import {prepareScenario,snapshotScenarioAssembly,readSavedAssembly} from '../web/src/game/scenarioassembly.js';
const root=fileURLToPath(new URL('../',import.meta.url)),[first,second]=process.argv.slice(2);assert.equal(process.argv.length,4);assert.notEqual(first,second);for(const r of[first,second])assert.match(r??'',/^[A-Za-z0-9-]{1,64}$/);
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={},base='.dragon-analysis/editor-phase/';
function read(p){assert.ok(!/save\.dat/i.test(p));const b=readFileSync(join(root,p));inputs[p]=sha(b);return b;}
function json(b){try{return JSON.parse(b.toString('utf8'));}catch(cause){throw new TypeError('invalid scoped adoption JSON',{cause});}}
const oldPrefix=`content/builtin/compiled/${DATE_BASE_REVISION}/`,baseManifest=json(read('web/'+oldPrefix+'manifest.json')),baseAssets=new Map(baseManifest.assets.map(e=>[e.path,read('web/'+e.url)]));assert.equal(BUILTIN_RESOURCES.world.revision,DATE_BASE_REVISION);
const candidateFiles=['receipt.json','resources.json','author-descriptor.json','author-input/entity-source.json','author-input/manifest.json','package/manifest.json',...baseManifest.assets.map(e=>'package/'+e.path)];
const allowed=new Set(['web/'+oldPrefix+'manifest.json',...baseManifest.assets.map(e=>'web/'+e.url),'web/'+BUILTIN_ENTITY_SOURCE.manifestURL,'web/'+BUILTIN_ENTITY_SOURCE.resourceURL,'../Dragon/KI.EXE','docs/data/current-map-display-acceptance.json','docs/editor-date-adoption-contract.md',base+'date-app-session-r1/candidate-verify.log',base+'date-app-browser-r1/receipt.json','web/index.html',
  'tools/stage_editor_date_adoption.mjs','tools/date_display_inheritance.mjs','tools/stage_editor_date_candidate.mjs','tools/editor_builtin_source.mjs','tools/editor_entity_source.mjs','web/src/content/builtinresources.generated.js','web/src/editor/builtinentitysource.generated.js','web/src/editor/entitysource.js','web/src/content/authoring/gamesource.js','web/src/content/authoring/trialcompile.js','web/src/content/authoring/mapcompile.js','web/src/content/authoring/maplayers.js','web/src/content/authoring/fixedcitybindings.js','web/src/content/authoring/roadedit.js','tools/verify_editor_date_candidate.mjs','web/src/game/scenarioassembly.js','web/src/game/world.js','web/src/game/worldresources.js','web/src/content/catalog.js','tools/verify_editor_date_app.mjs','tools/browser_test_server.mjs','web/src/main.js','web/src/game/clock.js','web/src/ui/hud.js','web/src/ui/gamebar.js','web/src/editor/trialpolicy.js',...['date-candidate-r3','date-candidate-r4'].flatMap(r=>candidateFiles.map(p=>base+r+'/'+p))]);
const a=json(read(base+first+'/receipt.json')),b=json(read(base+second+'/receipt.json'));assert.deepEqual(a,b);assert.equal(a.result,'PASS-DATE-MAP-INHERITANCE-STAGED-NOT-INSTALLED');
for(const[p,h]of Object.entries(a.inputs)){assert.ok(allowed.has(p),'undeclared inheritance input');assert.equal(sha(read(p)),h);}
const files=new Map();for(const[p,h]of Object.entries(a.artifactHashes)){assert.match(p,/^(?:package\/(?:[A-Za-z0-9_-]+\.(?:json|bin|png)|chapters\/[A-Za-z0-9_-]+\.json)|author-input\/(?:entity-source|manifest)\.json|release\.json|builtinrelease\.generated\.js)$/);const bytes=read(base+first+'/'+p);assert.equal(sha(bytes),h);assert.deepEqual(bytes,read(base+second+'/'+p));files.set(p,bytes);}
const release=json(files.get('release.json'));assert.deepEqual(release,a.release);const resources=release.resources,manifest=json(files.get('package/manifest.json')),assets=new Map(manifest.assets.map(e=>[e.path,files.get('package/'+e.path)]));
const args={baseResources:BUILTIN_RESOURCES,baseManifest,baseAssets,resources:{...resources,geographyReview:'PENDING-DATE-DELTA'},manifest,assets,acceptanceBytes:read('docs/data/current-map-display-acceptance.json')};
const certificate=checkDateDisplayInheritance(args);assert.deepEqual(manifest.displayAcceptanceInheritance,{...certificate,evidence:a.certificate.evidence});assert.equal(Object.hasOwn(manifest,'displayAcceptance'),false);assert.equal(manifest.dateCorrection.status,'APPLIED-ORIGINAL-WORD-IMPORT');assert.equal(a.certificate.evidence.contractSha256,sha(read('docs/editor-date-adoption-contract.md')));
let negativeControls=0;
function reject(mutate){const altered={...args,resources:structuredClone(args.resources),manifest:structuredClone(manifest),assets:new Map([...assets].map(([p,v])=>[p,Buffer.from(v)]))};mutate(altered);assert.throws(()=>checkDateDisplayInheritance(altered));negativeControls++;}
function sourceChange(mutate){reject(x=>{const source=json(x.assets.get('game-source.json'));mutate(source);const bytes=Buffer.from(JSON.stringify(source)+'\n');x.assets.set('game-source.json',bytes);x.manifest.sourceDigest=canonicalDigest(source,sha);x.resources.sourceDigest=x.manifest.sourceDigest;});}
sourceChange(s=>s.map.waterGroups[0].showOnMinimap=!s.map.waterGroups[0].showOnMinimap);
sourceChange(s=>{delete s.componentDefinitions[Object.keys(s.componentDefinitions)[0]];});
sourceChange(s=>{Object.values(s.cities)[0].x++;});
sourceChange(s=>s.chapters['upper-1'].state.start.day++);
sourceChange(s=>s.chapters['later-3'].state.start.year=267);
sourceChange(s=>s.unapprovedExtra='added');
reject(x=>{const bytes=x.assets.get('map_atlas_spring.png');bytes[0]^=1;const e=x.manifest.assets.find(e=>e.path==='map_atlas_spring.png');e.sha256=sha(bytes);});
reject(x=>{const c=json(x.assets.get('catalog.json'));c.chapters[0].name='different';x.assets.set('catalog.json',Buffer.from(JSON.stringify(c)));});
reject(x=>x.resources.world.tileSize=17);
reject(x=>x.acceptanceBytes=Buffer.from('{}'));
reject(x=>x.manifest.assets[1].path=x.manifest.assets[0].path);
reject(x=>x.resources.unapprovedExtra=true);
const observed=readInstalledEditorSource(resources,url=>{if(url.endsWith('/manifest.json'))return files.get('package/manifest.json');const p=url.slice(`content/builtin/compiled/${a.revision}/`.length);assert.ok(assets.has(p));return assets.get(p);});assert.equal(observed.revision,a.revision);assert.equal(observed.chapters[14].state.start.year,264);assert.equal(observed.chapters[15].state.start.year,266);
const d=release.entitySource,author=await decodeEntitySource(json(files.get('author-input/manifest.json')),files.get('author-input/entity-source.json'),d,sha);assert.equal(d.runtimeDataSha256,sha(assets.get('data.json')));assert.equal(d.manifestSha256,sha(files.get('author-input/manifest.json')));
const oldAuthor=json(read('web/'+BUILTIN_ENTITY_SOURCE.resourceURL)),probe=structuredClone(author);probe.runtimeDataSha256=oldAuthor.runtimeDataSha256;assert.deepEqual(probe,oldAuthor);
const moduleText='// Generated coherent resources/author-input tuple. One atomic switch point.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_RELEASE = freeze('+JSON.stringify(release)+');\n';assert.equal(files.get('builtinrelease.generated.js').toString('utf8'),moduleText);
const generated=await import(new URL('../'+base+first+'/builtinrelease.generated.js',import.meta.url));assert.deepEqual(generated.BUILTIN_RELEASE,release);assert.ok(Object.isFrozen(generated.BUILTIN_RELEASE.entitySource.resource));assert.ok(Object.isFrozen(generated.BUILTIN_RELEASE.resources.world.assets.minimap));
const oldContent=createContentCatalog(json(baseAssets.get('catalog.json')),json(baseAssets.get('data.json'))),content=createContentCatalog(json(assets.get('catalog.json')),json(assets.get('data.json'))),world=createWorldResources(resources.world),oldWorld=createWorldResources(BUILTIN_RESOURCES.world),urlBytes=new Map();
for(const[e,prefix]of[[baseManifest,oldPrefix],[manifest,`content/builtin/compiled/${a.revision}/`]])for(const role of e.assets)urlBytes.set(prefix+role.path,(e===manifest?assets:baseAssets).get(role.path));
const previous=globalThis.fetch,requests=[];globalThis.fetch=async url=>{assert.ok(urlBytes.has(String(url)),'no network/fallback');requests.push(String(url));return new Response(urlBytes.get(String(url)),{status:200});};let restores=0,identityRejections=0;
try{for(let idx=0;idx<20;idx++){
  const fresh=await prepareScenario({raw:createNewGameScenario(content.chapter(idx).template,0),idx,mode:'fresh',content,world}),old=await prepareScenario({raw:createNewGameScenario(oldContent.chapter(idx).template,0),idx,mode:'fresh',content:oldContent,world:oldWorld});
  const state=structuredClone(fresh.scenario);state.start=old.scenario.start;assert.deepEqual(state,structuredClone(old.scenario));
  const webMeta=snapshotScenarioAssembly({scenario:fresh.scenario,scenarioIdx:idx,content,world}),text=JSON.stringify({state:fresh.scenario,webMeta});let saved;try{saved=JSON.parse(text);}catch(cause){throw new Error('JSON stage transport failed',{cause});}
  const restored=await prepareScenario({raw:saved.state,idx,mode:'restore',content,world,...readSavedAssembly(saved)});assert.deepEqual(structuredClone(restored.scenario),structuredClone(fresh.scenario));assert.deepEqual(snapshotScenarioAssembly({scenario:restored.scenario,scenarioIdx:idx,content,world}),webMeta);restores++;
  const oldMeta=snapshotScenarioAssembly({scenario:old.scenario,scenarioIdx:idx,content:oldContent,world:oldWorld});await assert.rejects(()=>prepareScenario({raw:saved.state,idx,mode:'restore',content,world,...readSavedAssembly({state:old.scenario,webMeta:oldMeta})}),/mismatch/);identityRejections++;
}}finally{globalThis.fetch=previous;}
for(const[p,h]of Object.entries(inputs))assert.equal(sha(readFileSync(join(root,p))),h);assert.equal(requests.length,8);
const toolHashes=Object.fromEntries(['tools/verify_editor_date_adoption.mjs','tools/date_display_inheritance.mjs','tools/editor_builtin_source.mjs','web/src/game/scenarioassembly.js','web/src/game/world.js','web/src/game/worldresources.js','web/src/content/catalog.js','web/src/editor/entitysource.js'].map(p=>[p,sha(readFileSync(join(root,p)))]));
process.stdout.write(JSON.stringify({result:'PASS-DATE-MAP-INHERITANCE-NOT-INSTALLED',revision:a.revision,inputs,toolHashes,identicalStages:2,unchangedRoleBytes:32,negativeControls,productionFreshJsonRestore:restores,wrongPriorIdentityRejections:identityRejections,resourceRequests:requests,limits:'Exact map-only machine inheritance,not new human approval. Date corrected by KI/header. No default/draft/save mutation;not full editor/calendar/CPU/init.'})+'\n');
