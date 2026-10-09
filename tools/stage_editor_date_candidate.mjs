// Independent date-only candidate; NEVER installation/approval/draft migration.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {readInstalledEntitySource} from './editor_entity_source.mjs';
import {compileGameSource} from '../web/src/content/authoring/trialcompile.js';
import {canonicalDigest} from '../web/src/content/authoring/gamesource.js';
const root=fileURLToPath(new URL('../',import.meta.url)),round=process.argv[2];
assert.equal(process.argv.length,3);assert.match(round??'',/^[A-Za-z0-9-]{1,64}$/);
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={};
function read(p){assert.ok(!/save\.dat/i.test(p));const b=readFileSync(join(root,p));inputs[p]=sha(b);return b;}
function json(b){try{return JSON.parse(b.toString('utf8'));}catch(cause){throw new TypeError('invalid fixed candidate JSON',{cause});}}
const oldPrefix=`content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`;
readInstalledEditorSource(BUILTIN_RESOURCES,url=>{assert.ok(url.startsWith(oldPrefix));return read('web/'+url);});
const rawInput=await readInstalledEntitySource(url=>{assert.ok([BUILTIN_RESOURCES.dataURL,BUILTIN_ENTITY_SOURCE.manifestURL,BUILTIN_ENTITY_SOURCE.resourceURL].includes(url));return read('web/'+url);});
const oldManifest=json(read('web/'+oldPrefix+'manifest.json')),assets=new Map();
for(const e of oldManifest.assets){assert.match(e.path,/^(?:[A-Za-z0-9_-]+\.(?:json|bin|png)|chapters\/[A-Za-z0-9_-]+\.json)$/);const b=read('web/'+oldPrefix+e.path);assert.equal(sha(b),e.sha256);assets.set(e.path,b);}
const ki=read('../Dragon/KI.EXE');assert.equal(sha(ki),'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868');
const signatures={0x1d9c:'a1f00c',0x1d9f:'3ac4',0x1dd7:'fe06f00c',0x1daa:'813ef60ce803',0x1db2:'c706f60ce603',0x1db8:'ff06f60c',0x8c62:'8b4406'};
for(const [va,hex]of Object.entries(signatures))assert.equal(ki.subarray(Number(va)+0x200,Number(va)+0x200+hex.length/2).toString('hex'),hex);
const source=json(assets.get('game-source.json')),oldSource=structuredClone(source),data=json(assets.get('data.json')),oldData=structuredClone(data),catalog=json(assets.get('catalog.json')),changes=[];
for(let idx=0;idx<20;idx++){
  const id=source.chapterOrder[idx];assert.equal(rawInput.chapters[idx].chapterId,id);assert.deepEqual(source.chapters[id].state,data.scenarios[idx]);
  const h=Buffer.from(rawInput.chapters[idx].header128,'hex'),date={day:h[0],month:h[4],year:h.readUInt16LE(6)};
  for(const field of ['day','month','year'])if(date[field]!==data.scenarios[idx].start[field])changes.push({idx,chapterId:id,field,old:data.scenarios[idx].start[field],original:date[field]});
  source.chapters[id].state.start=structuredClone(date);data.scenarios[idx].start=structuredClone(date);
}
assert.deepEqual(changes.map(({idx,field,old,original})=>({idx,field,old,original})),[{idx:14,field:'year',old:8,original:264},{idx:15,field:'year',old:10,original:266}]);
const sourceProbe=structuredClone(source),dataProbe=structuredClone(data);
for(let idx=0;idx<20;idx++){const id=source.chapterOrder[idx];sourceProbe.chapters[id].state.start=oldSource.chapters[id].state.start;dataProbe.scenarios[idx].start=oldData.scenarios[idx].start;}
assert.deepEqual(sourceProbe,oldSource);assert.deepEqual(dataProbe,oldData);
const compiled=compileGameSource(source,sha);assert.notEqual(compiled.sourceDigest,BUILTIN_RESOURCES.sourceDigest);
assert.deepEqual(Buffer.from(compiled.terrainBytes),assets.get('terrain.bin'));assert.deepEqual(compiled.roadGraph,json(assets.get('roads.json')));assert.deepEqual(Buffer.from(compiled.roadCost),assets.get('road_cost.bin'));assert.deepEqual(Buffer.from(compiled.roadOffsetBytes),assets.get('road_offset.json'));
const tools={};for(const p of ['tools/stage_editor_date_candidate.mjs','tools/editor_builtin_source.mjs','tools/editor_entity_source.mjs','web/src/content/builtinresources.generated.js','web/src/editor/builtinentitysource.generated.js','web/src/editor/entitysource.js','web/src/content/authoring/gamesource.js','web/src/content/authoring/trialcompile.js','web/src/content/authoring/mapcompile.js','web/src/content/authoring/maplayers.js','web/src/content/authoring/fixedcitybindings.js','web/src/content/authoring/roadedit.js'])tools[p]=sha(read(p));
const revision='map-2-'+canonicalDigest({contract:'date-only-candidate-1',baseRevision:BUILTIN_RESOURCES.world.revision,sourceDigest:compiled.sourceDigest,inputs,tools},sha),prefix=`content/builtin/compiled/${revision}/`;
function encoded(value){return Buffer.from(JSON.stringify(value)+'\n');}
assets.set('game-source.json',encoded(source));assets.set('data.json',encoded(data));
for(const e of catalog.chapters)assets.set(e.file,encoded(source.chapters[e.id].state));
// Retain old bytes whenever serializing an unchanged document would normalize it.
for(const e of catalog.chapters)if(!changes.some(c=>c.chapterId===e.id))assets.set(e.file,read('web/'+oldPrefix+e.file));
function newURL(url){assert.ok(url.startsWith(oldPrefix));return prefix+url.slice(oldPrefix.length);}
const definition=json(assets.get('world-definition.json'));definition.revision=revision;
for(const key of ['terrain','roadGraph','roadCost','roadOffset'])definition.assets[key]=newURL(definition.assets[key]);
for(const key of ['seasonAtlases','seasons','minimap'])for(const name of Object.keys(definition.assets[key]))definition.assets[key][name]=newURL(definition.assets[key][name]);
catalog.revision=revision;assets.set('world-definition.json',encoded(definition));assets.set('catalog.json',encoded(catalog));
const altered=oldManifest.assets.filter(e=>sha(assets.get(e.path))!==e.sha256).map(e=>e.path);
assert.deepEqual(altered.toSorted(),['game-source.json','data.json','world-definition.json','catalog.json',...changes.map(c=>catalog.chapters[c.idx].file)].toSorted());
const entries=oldManifest.assets.map(e=>({...e,url:prefix+e.path,byteLength:assets.get(e.path).length,sha256:sha(assets.get(e.path))}));
const manifest={...oldManifest,contentRevision:revision,worldRevision:revision,sourceDigest:compiled.sourceDigest,assets:entries,geographyReview:'PENDING-DATE-DELTA',visualReview:'PENDING-DATE-DELTA',authorDisplayData:{...oldManifest.authorDisplayData,status:'PENDING-DATE-DELTA'},dateCorrection:{status:'PENDING',baseRevision:BUILTIN_RESOURCES.world.revision,changes,unchangedRoleBytes:32,policy:'date-only overlay, not full re-extraction; existing missing event tail retained, not certified'},priorDisplayApproval:oldManifest.displayAcceptance};
// Old acceptance was bound to a different sourceDigest. Never silently relabel.
delete manifest.displayAcceptance;
const resources={...BUILTIN_RESOURCES,world:definition,catalogURL:prefix+'catalog.json',dataURL:prefix+'data.json',sourceURL:prefix+'game-source.json',sourceDigest:compiled.sourceDigest,geographyReview:'PENDING-DATE-DELTA'};
const author=structuredClone(rawInput);author.runtimeDataSha256=sha(assets.get('data.json'));
const authorBytes=encoded(author),authorManifest=json(read('web/'+BUILTIN_ENTITY_SOURCE.manifestURL));authorManifest.runtimeDataSha256=author.runtimeDataSha256;authorManifest.resource={path:'entity-source.json',sha256:sha(authorBytes),byteLength:authorBytes.length};
const authorManifestBytes=Buffer.from(JSON.stringify(authorManifest,null,2)+'\n'),authorPrefix=`content/builtin/authoring/entities-${sha(authorBytes)}/`;
const authorDescriptor={...BUILTIN_ENTITY_SOURCE,resource:authorManifest.resource,runtimeDataSha256:author.runtimeDataSha256,manifestURL:authorPrefix+'manifest.json',manifestSha256:sha(authorManifestBytes),manifestByteLength:authorManifestBytes.length,resourceURL:authorPrefix+'entity-source.json'};
const authorProbe=structuredClone(author);authorProbe.runtimeDataSha256=rawInput.runtimeDataSha256;assert.deepEqual(authorProbe,rawInput);
for(const[p,h]of Object.entries(inputs))assert.equal(sha(readFileSync(join(root,p))),h,'input drift');
const out=join(root,'.dragon-analysis/editor-phase',round);mkdirSync(out);mkdirSync(join(out,'package'));mkdirSync(join(out,'package/chapters'));mkdirSync(join(out,'author-input'));
for(const[p,b]of assets)writeFileSync(join(out,'package',p),b,{flag:'wx'});
writeFileSync(join(out,'package/manifest.json'),Buffer.from(JSON.stringify(manifest,null,2)+'\n'),{flag:'wx'});
for(const[p,v]of [['resources.json',resources],['author-descriptor.json',authorDescriptor]])writeFileSync(join(out,p),encoded(v),{flag:'wx'});
writeFileSync(join(out,'author-input/entity-source.json'),authorBytes,{flag:'wx'});writeFileSync(join(out,'author-input/manifest.json'),authorManifestBytes,{flag:'wx'});
const artifacts=Object.fromEntries([...entries.map(e=>['package/'+e.path,e.sha256]),['package/manifest.json',sha(Buffer.from(JSON.stringify(manifest,null,2)+'\n'))],['resources.json',sha(encoded(resources))],['author-descriptor.json',sha(encoded(authorDescriptor))],['author-input/entity-source.json',sha(authorBytes)],['author-input/manifest.json',sha(authorManifestBytes)]]);
writeFileSync(join(out,'receipt.json'),encoded({result:'PASS-DATE-CANDIDATE-NOT-INSTALLED',revision,sourceDigest:compiled.sourceDigest,inputs,tools,artifacts,changes,alteredRoles:altered,unchangedRoles:32,limits:'PENDING review; no current switch/source/drafts/saves/profile changes; named template/date overlay only, no whole source event-tail certification'}),{flag:'wx'});
process.stdout.write(JSON.stringify({result:'PASS-DATE-CANDIDATE-NOT-INSTALLED',revision,changes,unchangedRoles:32})+'\n');
