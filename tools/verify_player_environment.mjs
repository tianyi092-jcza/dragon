// Pure owning-environment checks, no network, storage or rule-frame execution.
import assert from 'node:assert/strict';
import { createPlayerEnvironment } from '../reader/playerenvironment.js';
import { TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { portraitURL } from '../web/src/core/assets.js';
const G='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', R='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', H='a'.repeat(64);
let checks=0;
function fixture() {
  let retired=false;
  const identity=Object.freeze({gameId:G,releaseId:R,ordinal:'1.0',revision:'1',sourceDigest:H,chapterId:G+'#chapter'});
  const resourceURLs=Object.fromEntries(['terrain','roadGraph','roadCost','roadOffset','minimapBase','minimapLarge','0'].map(id=>['asset:'+id,'blob:owned-'+id]));
  for(const group of ['seasons','seasonAtlases'])for(const season of ['spring','summer','autumn','winter'])resourceURLs[group+':'+season]='blob:owned-'+group+'-'+season;
  const chapter={factions:[{idx:0,monarch_idx:0,n_legions:0},{idx:1,monarch_idx:0,n_legions:0}],generals:[{idx:0,name:'Owned',portrait:0,portraitKey:'0'}],cities:[],legions:[]};
  const manifest={schemaVersion:1,compilerRevision:TRIAL_COMPILER_REVISION,buildFormat:'studio-app-2',identity:{gameId:G,draftRevision:'1',sourceDigest:H},chapters:[identity.chapterId],world:{id:G+'-world',revision:H,width:384,height:256,tileSize:16},portraits:[{assetId:'0',url:'kao/0.png'}]};
  return {pack:{identity,chapter,manifest,resourceURLs,assertCurrent(){if(retired)throw new Error('owned retired');}},retire(){retired=true;}};
}
{
 const f=fixture(),before=JSON.stringify(f.pack),env=createPlayerEnvironment(f.pack,{playerFaction:1});
 assert.equal(JSON.stringify(f.pack),before);assert.notEqual(env.raw,f.pack.chapter);assert.equal(env.raw.player_faction,1);assert.equal(env.player,1);
 assert.equal(env.content.chapter(0).template,f.pack.chapter);assert.equal(env.content.chapter(f.pack.identity.chapterId),env.content.chapter(0));assert.equal(env.content.chapter(1),null);
 assert.equal(env.content.revision,H);assert.equal(env.world.definition.revision,H);assert.equal(env.content.chapter(0).official,false);
 assert.deepEqual(env.content.chapter(0).reference.publication,{releaseId:R,ordinal:'1.0'});assert.equal(env.content.resolveReference(structuredClone(env.content.chapter(0).reference)),env.content.chapter(0));
 assert.equal(Object.hasOwn(env,'binding'),false);assert.equal(Object.hasOwn(env,'persistent'),false);assert.equal(Object.hasOwn(env.identity,'trialSnapshotId'),false);
 assert.ok(Object.isFrozen(env)&&Object.isFrozen(env.content.chapter(0).reference.publication));checks++;
 for(const key of ['terrain','roadGraph','roadCost','roadOffset'])assert.equal(env.world.definition.assets[key],f.pack.resourceURLs['asset:'+key]);
 assert.equal(env.world.definition.assets.minimap.base,f.pack.resourceURLs['asset:minimapBase']);assert.equal(env.world.definition.assets.minimap.large,f.pack.resourceURLs['asset:minimapLarge']);
 for(const group of ['seasons','seasonAtlases'])for(const season of ['spring','summer','autumn','winter'])assert.equal(env.world.definition.assets[group][season],f.pack.resourceURLs[group+':'+season]);
 assert.equal(portraitURL(env.raw.generals[0],env.world),f.pack.resourceURLs['asset:0']);checks++;
 env.raw.generals[0].name='changed';assert.equal(f.pack.chapter.generals[0].name,'Owned');f.pack.resourceURLs['asset:terrain']='https://wrong.invalid';assert.equal(env.world.definition.assets.terrain,'blob:owned-terrain');checks++;
 for(const mutate of [ref=>delete ref.publication,ref=>{ref.publication.releaseId=G;},ref=>{ref.publication.ordinal='1.1';},ref=>{ref.revision='b'.repeat(64);},ref=>{ref.chapterId=G+'#other';}]){const ref=structuredClone(env.content.chapter(0).reference);mutate(ref);assert.equal(env.content.resolveReference(ref),null);checks++;}
 f.retire();assert.throws(env.assertCurrent,/retired/);assert.throws(()=>env.content.resolveReference(env.content.chapter(0).reference),/retired/);await assert.rejects(env.world.roads.loadRoadGraph(),/retired/);await assert.rejects(env.world.loadSeason('spring'),/retired/);checks++;
}
{
 // CITY-CAPACITY-1 C6(c) (user-authorized): v3 formal packs enter the player environment.
 const f=fixture();f.pack.manifest={...f.pack.manifest,schemaVersion:2,buildFormat:'studio-app-3'};
 const env=createPlayerEnvironment(f.pack,{playerFaction:0});
 assert.equal(env.content.revision,H);assert.equal(env.player,0);checks++;
}
for(const playerFaction of [undefined,null,'0',-1,2,0.5]){const f=fixture();assert.throws(()=>createPlayerEnvironment(f.pack,{playerFaction}),TypeError);checks++;}
for(const role of Object.keys(fixture().pack.resourceURLs)){const f=fixture();delete f.pack.resourceURLs[role];assert.throws(()=>createPlayerEnvironment(f.pack,{playerFaction:0}),/missing owned/);checks++;}
for(const mutate of [p=>{p.manifest.compilerRevision='wrong';},p=>{p.manifest.schemaVersion=2;},p=>{p.manifest.buildFormat='studio-app-3';},p=>{p.manifest.identity.gameId=R;},p=>{p.manifest.identity.sourceDigest='b'.repeat(64);},p=>{p.manifest.identity.draftRevision='2';},p=>{p.manifest.chapters=[];},p=>{p.resourceURLs['asset:terrain']='/api/trial-asset';}]){const f=fixture();mutate(f.pack);assert.throws(()=>createPlayerEnvironment(f.pack,{playerFaction:0}));checks++;}
{
 const f=fixture(),old=createPlayerEnvironment(f.pack,{playerFaction:0});
 const newer=createPlayerEnvironment({...f.pack,identity:Object.freeze({...f.pack.identity,releaseId:G,ordinal:'1.1'})},{playerFaction:0});
 assert.equal(newer.content.revision,old.content.revision);assert.equal(newer.world.definition.revision,old.world.definition.revision);
 assert.equal(newer.content.resolveReference(old.content.chapter(0).reference),null);assert.equal(old.content.resolveReference(newer.content.chapter(0).reference),null);checks++;
}
process.stdout.write(JSON.stringify({checks,scope:'trusted pack/catalog/world/new-game adapters, Blob URL wiring and separate formal publication reference; no App/save/storage/frame or source-rule proof'})+'\n');
