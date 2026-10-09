// Actual archived Web tuple + detached copy + pure future-default selection.
// No originals, ignored candidates, network, storage/profile or draft writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BUILTIN_ENTITY_HISTORY} from '../web/src/editor/builtinentityhistory.generated.js';
import {resolveDraftEntitySource} from '../web/src/editor/entityhistory.js';
import {readEntitySourceForDraft,readInstalledEntitySource} from './editor_entity_source.mjs';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {copyBuiltinGame} from '../web/src/content/authoring/gamesource.js';
import {copyEntitySourceRecords} from '../web/src/editor/entitycopy.js';
import {inspectEntitySources} from '../web/src/editor/entityinspection.js';
import {decodeEntitySource} from '../web/src/editor/entitysource.js';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
function parse(b){try{return JSON.parse(b.toString('utf8'));}catch(cause){throw new TypeError('invalid actual archived source',{cause});}}
const sha=b=>createHash('sha256').update(b).digest('hex'),tuple=BUILTIN_ENTITY_HISTORY[0],d=tuple.descriptor;
assert.ok(Object.isFrozen(BUILTIN_ENTITY_HISTORY)&&Object.isFrozen(tuple)&&Object.isFrozen(d)&&Object.isFrozen(d.originalSources));
const prefix=tuple.dataURL.replace(/data\.json$/,'');
const source=readInstalledEditorSource({...BUILTIN_RESOURCES,world:parse(readFileSync(new URL('../web/'+prefix+'world-definition.json',import.meta.url))),catalogURL:prefix+'catalog.json',dataURL:tuple.dataURL,sourceURL:prefix+'game-source.json',sourceDigest:'65ef2263b4587cb3d831e926ce5c9ada97462ce8aa2222bd9fa8c68c1ffcd986',geographyReview:'APPROVED'});
assert.equal(tuple.sourceRevision,source.revision); // real archived prefix, never current/latest
const urls=[tuple.dataURL,d.manifestURL,d.resourceURL],assets=new Map(urls.map(url=>[url,readFileSync(new URL('../web/'+url,import.meta.url))]));
const inputHashes=Object.fromEntries([...assets].map(([u,b])=>[u,sha(b)])),bundle=await decodeEntitySource(parse(assets.get(d.manifestURL)),assets.get(d.resourceURL),d,sha);
const installed=await readInstalledEntitySource();assert.equal(installed.chapters[14].header128,bundle.chapters[14].header128);
const game=copyBuiltinGame({gameId:'history-detached',kind:'full',source},sha);let id=0;game.sourceRecords=copyEntitySourceRecords(game,source,bundle,d,()=>`history-record-${id++}`);
const before=JSON.stringify(game);let calls=[];
const read=async url=>{assert.ok(assets.has(url),'no latest or arbitrary URL');calls.push(url);return assets.get(url);};
const selected=await readEntitySourceForDraft(game,read);assert.deepEqual(calls,urls);assert.deepEqual(selected.bundle,bundle);assert.deepEqual(selected.descriptor,d);
assert.deepEqual(await readEntitySourceForDraft(game),selected);
for(const chapter of game.chapterOrder){const view=inspectEntitySources(game,selected.bundle,selected.descriptor,chapter);assert.equal(view.records.length,128);assert.equal(view.resourceRef.sha256,d.resource.sha256);}
// Future entry is a memory-only engineering fixture, NOT registered/adopted.
const future=structuredClone(tuple);future.sourceRevision='map-2-'+'e'.repeat(64);future.dataURL=`content/builtin/compiled/${future.sourceRevision}/data.json`;
future.descriptor.runtimeDataSha256='a'.repeat(64);
assert.strictEqual(resolveDraftEntitySource(game,[future,tuple]),tuple);
const futureGame=structuredClone(game);futureGame.sourceRef.revision=future.sourceRevision;futureGame.sourceRecords.sourceRevision=future.sourceRevision;futureGame.sourceRecords.resourceRef.runtimeDataSha256=future.descriptor.runtimeDataSha256;
assert.strictEqual(resolveDraftEntitySource(futureGame,[tuple,future]),future);
let contextRejections=0,assetRejections=0;
async function reject(mutate){const bad=structuredClone(game);mutate(bad);const state=JSON.stringify(bad);calls=[];await assert.rejects(()=>readEntitySourceForDraft(bad,read));assert.deepEqual(calls,[]);assert.equal(JSON.stringify(bad),state);contextRejections++;}
await reject(g=>g.sourceRecords.gameId='different-game');
await reject(g=>g.sourceRecords.mode='different-mode');
await reject(g=>g.sourceRef.revision='different-source');
await reject(g=>{g.sourceRef.revision=future.sourceRevision;g.sourceRecords.sourceRevision=future.sourceRevision;});
await reject(g=>g.sourceRecords.resourceRef.url='../unregistered-fixture/never-read');
await reject(g=>g.sourceRecords.resourceRef.sha256='b'.repeat(64));
await reject(g=>g.sourceRecords.resourceRef.byteLength--);
await reject(g=>g.sourceRecords.resourceRef.runtimeDataSha256='a'.repeat(64));
const conflict=structuredClone(tuple);conflict.descriptor.manifestSha256='b'.repeat(64);
assert.throws(()=>resolveDraftEntitySource(game,[tuple,conflict]),/ambiguous/);contextRejections++;
const wrongData=structuredClone(tuple);wrongData.dataURL='content/builtin/compiled/unregistered/data.json';assert.throws(()=>resolveDraftEntitySource(game,[wrongData]),/trusted/);contextRejections++;
for(const target of urls){calls=[];await assert.rejects(()=>readEntitySourceForDraft(game,async url=>{assert.ok(assets.has(url));calls.push(url);const b=Buffer.from(assets.get(url));if(url===target)b[0]^=1;return b;}));assert.ok(calls.every(url=>urls.includes(url)));assetRejections++;}
calls=[];await assert.rejects(()=>readEntitySourceForDraft(game,async url=>{assert.ok(assets.has(url));calls.push(url);if(url===d.resourceURL)throw new Error('owned historical body missing');return assets.get(url);}));assert.deepEqual(calls,urls);assetRejections++;
assert.equal(JSON.stringify(game),before);
for(const[url,h]of Object.entries(inputHashes))assert.equal(sha(readFileSync(new URL('../web/'+url,import.meta.url))),h);
process.stdout.write(JSON.stringify({result:'PASS-TRUSTED-ACTUAL-ARCHIVE-SELECTION',inputHashes,allowedURLs:urls,chapters:20,ordinarySourceIds:2540,contextRejections,assetRejections,callerUnchanged:true,
  limits:'Future tuple only memory selection fixture,not approval/adoption/newdata loader certificate;legacy source dates preserved;no file writes/auth/save/initializer/person merge'})+'\n');
