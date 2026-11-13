// Owned bytes, native Blob URLs and explicit in-memory ports only. No engine,
// storage, network, real game or complete dependency-retention certification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadPlayerPack } from '../reader/playerpack.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gameId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', releaseId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', sourceDigest='a'.repeat(64), chapterId=gameId+'#chapter';
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const compilerRevision='owned-compiler';
let checks=0;
function fixture() {
  let state='active', serial=0;
  const reads=[],staticReads=[],blobs=new Map(),revoked=[];
  const manifest={schemaVersion:1,buildFormat:'studio-app-2',compilerRevision,identity:{gameId,draftRevision:'1',sourceDigest,trialSnapshotId:'old-format-metadata'},world:{id:gameId+'-world',revision:sourceDigest,width:384,height:256,tileSize:16},chapters:[chapterId],assets:[],minimapAssets:[],portraits:[],visualAssets:{seasonAtlases:{},seasons:{}}};
  const data=new Map(),statics=new Map();
  const types={terrain:'application/octet-stream',roadGraph:'application/json',roadCost:'application/octet-stream',roadOffset:'application/json',minimapBase:'image/png',minimapLarge:'image/png'};
  const roles={terrain:'rules-initial-terrain',roadGraph:'native-road-v2',roadCost:'legacy-grid-visual',roadOffset:'legacy-grid-visual',minimapBase:'automatic-minimap',minimapLarge:'automatic-minimap'};
  const result=(bytes,contentType)=>({bytes,contentType,sha256:sha(bytes)});
  for(const [assetId,type] of Object.entries(types)) {
    const bytes=type==='application/json'?encode({assetId}):encode(assetId);
    data.set('asset:'+assetId,result(bytes,type));
    const entry={assetId,role:roles[assetId],byteLength:bytes.length,sha256:sha(bytes),url:`/api/trial-asset?game=${gameId}&revision=1&digest=${sourceDigest}&asset=${assetId}`};
    (assetId.startsWith('minimap')?manifest.minimapAssets:manifest.assets).push(entry);
  }
  const png=encode('owned portrait');data.set('asset:p2',result(png,'image/png'));
  manifest.portraits.push({assetId:'p2',role:'game-portrait',mime:'image/png',url:'kao/p2.png',sha256:sha(png),byteLength:png.length});
  for(const [group,stem] of [['seasonAtlases','map_atlas_'],['seasons','map_tiles_']]) for(const season of ['spring','summer','autumn','winter']) {
    const path='content/builtin/compiled/map-2-'+sourceDigest+'/'+stem+season+'.png',bytes=encode(path);
    manifest.visualAssets[group][season]={path,url:path,sha256:sha(bytes),byteLength:bytes.length};statics.set(path,result(bytes,'image/png'));
  }
  const identity={gameId,releaseId,ordinal:'1.0',revision:'1',sourceDigest,chapterId,chapters:[chapterId],name:'Owned',publishedAt:'2030-01-01T00:00:00.000Z',manifestDigest:''};
  data.set('chapter:'+chapterId,result(encode({name:'unchanged',factions:[{idx:0}]}),'application/json'));
  const sync=()=>{const bytes=encode(manifest);data.set('manifest',result(bytes,'application/json'));identity.manifestDigest=sha(bytes);};sync();
  const options={compilerRevision,maxTotalBytes:1000000,session:{identity,state:()=>state,read:async role=>{reads.push(role);assert.ok(data.has(role));return structuredClone(data.get(role));}},readStatic:async(path,{maxBytes})=>{staticReads.push(path);const value=statics.get(path);assert.ok(value.bytes.length<=maxBytes);return structuredClone(value);},urls:{createObjectURL(blob){const url='blob:owned-'+(++serial);blobs.set(url,blob);return url;},revokeObjectURL(url){revoked.push(url);blobs.delete(url);}}};
  return {manifest,identity,data,statics,reads,staticReads,blobs,revoked,options,sync,state:value=>{state=value;},load:()=>loadPlayerPack(options)};
}
// Copy approval records the public ordinal as the pack revision; old integer
// draft revisions remain valid for existing immutable publications.
for (const revision of ['1.0', '1.10']) {
  const f = fixture();
  f.identity.revision = revision; f.identity.ordinal = revision; f.manifest.identity.draftRevision = revision;
  [...f.manifest.assets, ...f.manifest.minimapAssets].forEach(entry => { entry.url = entry.url.replace('revision=1&', `revision=${revision}&`); });
  f.sync(); const pack = await f.load(); assert.equal(pack.identity.revision, revision); pack.close(); checks++;
}
async function invalid(f,code='PLAYER_PACK_INVALID') { await assert.rejects(f.load(),e=>e.code===code);assert.equal(f.blobs.size,0);checks++; }
for (const revision of ['0', '01', '1.01', '1.-1', '2.0', '1.0/extra', '1.' + '9'.repeat(32)]) {
  const f = fixture(); f.identity.revision = revision; await invalid(f); assert.equal(f.reads.length, 0);
}
{
 const f=fixture(),pack=await f.load();assert.equal(f.reads.length,9);assert.equal(f.staticReads.length,8);assert.equal(Object.keys(pack.resourceURLs).length,15);
 assert.deepEqual(pack.manifest,f.manifest);assert.equal(pack.identity.releaseId,releaseId);assert.equal(pack.identity.ordinal,'1.0');assert.equal(pack.chapter.name,'unchanged');
 assert.ok(Object.isFrozen(pack.manifest.assets[0]));assert.ok(Object.isFrozen(pack.chapter.factions[0]));assert.ok(Object.isFrozen(pack.identity.chapters));
 assert.equal(Object.hasOwn(pack,'binding'),false);assert.equal(Object.hasOwn(pack.identity,'trialSnapshotId'),false);
 for(const [role,url]of Object.entries(pack.resourceURLs)){assert.ok(f.blobs.has(url));assert.ok(!url.includes('ticket'));if(role==='asset:terrain')assert.deepEqual(new Uint8Array(await f.blobs.get(url).arrayBuffer()),f.data.get(role).bytes);}
 f.identity.ordinal='1.9';assert.equal(pack.identity.ordinal,'1.0');pack.assertCurrent();pack.close();pack.close();assert.equal(f.revoked.length,15);assert.throws(pack.assertCurrent,e=>e.code==='PLAYER_PACK_CLOSED');assert.equal(f.options.session.state(),'active');checks++;
}
for(const mutate of [f=>f.options.maxTotalBytes=0,f=>f.options.maxTotalBytes=1.5,f=>f.options.compilerRevision='',f=>f.options.readStatic=null,f=>f.options.urls={},f=>f.options.session={}]) {const f=fixture();mutate(f);await assert.rejects(f.load(),TypeError);assert.equal(f.reads.length,0);checks++;}
for(const mutate of [
 m=>m.compilerRevision='wrong',m=>m.buildFormat='studio-chapter-1',m=>m.schemaVersion=2,m=>m.scope={},m=>m.identity.gameId=releaseId,m=>m.identity.draftRevision='2',m=>m.identity.sourceDigest='b'.repeat(64),m=>m.chapters.push(gameId+'#other'),m=>m.world.width=385,m=>m.world.revision='b'.repeat(64),
 m=>m.assets.pop(),m=>m.assets[1]=m.assets[0],m=>m.assets[0].role='wrong',m=>m.assets[0].url='https://untrusted.invalid/data',m=>m.assets[0].byteLength=0,m=>m.minimapAssets=[],m=>m.portraits.push(m.portraits[0]),m=>m.portraits[0].assetId='../../secret',m=>m.portraits[0].url='https://untrusted.invalid/kao.png',m=>m.portraits[0].mime='text/html',m=>delete m.visualAssets.seasons.winter,m=>m.visualAssets.seasons.spring.path='../escape',m=>m.visualAssets.seasons.spring.url='https://untrusted.invalid/map',m=>m.visualAssets.extra={}
]) {const f=fixture();mutate(f.manifest);f.sync();await invalid(f);assert.equal(f.staticReads.length,0);}
{const f=fixture();f.identity.manifestDigest='b'.repeat(64);await invalid(f);}
{const f=fixture();f.options.maxTotalBytes=1;await invalid(f,'PLAYER_PACK_BUDGET');assert.deepEqual(f.reads,['manifest']);}
{const f=fixture();f.options.maxTotalBytes=f.data.get('manifest').bytes.length+1;await invalid(f,'PLAYER_PACK_BUDGET');assert.deepEqual(f.reads,['manifest']);}
for(const key of ['asset:terrain','asset:p2']) {const f=fixture();f.data.get(key).bytes[0]^=1;await invalid(f);}
{const f=fixture();f.manifest.assets[0].sha256='b'.repeat(64);f.sync();await invalid(f);}
{const f=fixture();f.data.get('asset:roadGraph').contentType='text/html';await invalid(f);}
{const f=fixture();f.statics.values().next().value.bytes[0]^=1;await invalid(f);}
{const f=fixture();f.statics.values().next().value.contentType='text/html';await invalid(f);}
{const f=fixture();f.options.readStatic=async()=>{throw new Error('owned static missing');};await assert.rejects(f.load(),/owned static missing/);assert.equal(f.blobs.size,0);checks++;}
for(const state of ['closed','deleted']) {const f=fixture();f.state(state);await invalid(f,state==='deleted'?'GAME_DELETED':'PLAYER_SESSION_CLOSED');assert.equal(f.reads.length,0);}
{const f=fixture();const read=f.options.readStatic;f.options.readStatic=async(...args)=>{const value=await read(...args);f.state('closed');return value;};await invalid(f,'PLAYER_SESSION_CLOSED');}
{const f=fixture();const make=f.options.urls.createObjectURL;f.options.urls.createObjectURL=blob=>{const url=make(blob);if(f.blobs.size===2)f.state('closed');return url;};await invalid(f,'PLAYER_SESSION_CLOSED');assert.equal(f.revoked.length,2);}
{const f=fixture();const make=f.options.urls.createObjectURL;f.options.urls.createObjectURL=blob=>{if(f.blobs.size===2)throw new Error('owned URL failure');return make(blob);};await assert.rejects(f.load(),/owned URL failure/);assert.equal(f.blobs.size,0);assert.equal(f.revoked.length,2);checks++;}
{const f=fixture();f.options.urls=URL;const pack=await f.load();const url=pack.resourceURLs['asset:terrain'];assert.deepEqual(new Uint8Array(await(await fetch(url)).arrayBuffer()),f.data.get('asset:terrain').bytes);pack.close();await assert.rejects(fetch(url));checks++;}
{const f=fixture();f.identity.privateCapability='owned-not-for-export';f.identity.self=f.identity;const pack=await f.load();assert.equal(Object.hasOwn(pack.identity,'privateCapability'),false);assert.equal(Object.hasOwn(pack.identity,'self'),false);pack.close();checks++;}
{const f=fixture();const entries=[...f.manifest.assets,...f.manifest.minimapAssets,...f.manifest.portraits,...Object.values(f.manifest.visualAssets.seasonAtlases),...Object.values(f.manifest.visualAssets.seasons)];f.options.maxTotalBytes=f.data.get('manifest').bytes.length+entries.reduce((n,e)=>n+e.byteLength,0);await invalid(f,'PLAYER_PACK_BUDGET');assert.deepEqual(f.reads,['manifest','chapter:'+chapterId]);}
{const f=fixture();const revoke=f.options.urls.revokeObjectURL;let first=true;f.options.urls.revokeObjectURL=url=>{if(first){first=false;throw new Error('owned revoke failure');}revoke(url);};const pack=await f.load();assert.throws(pack.close,/owned revoke failure/);assert.equal(f.blobs.size,1);pack.close();assert.equal(f.blobs.size,0);checks++;}
{const f=fixture();const create=f.options.urls.createObjectURL;let first;f.options.urls.createObjectURL=blob=>{if(first)return first;first=create(blob);return first;};await invalid(f);assert.equal(f.revoked.length,1);}
{const f=fixture();f.manifest.portraits[0].assetId=2;f.manifest.portraits[0].url='kao/2.png';f.sync();await invalid(f);}
process.stdout.write(JSON.stringify({checks,scope:'owned synthetic pack/byte/Blob URL ports; native Node Blob URL lifecycle, no network or engine proof'})+'\n');
