// Fixed map-only inheritance algebra. No IO, flags, installation, or human approval creation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalDigest} from '../web/src/content/authoring/gamesource.js';
export const DATE_BASE_REVISION='map-2-844eab32a84212f72b1430d398f5e82a3924d7e9527746fc2d1c7581cf694f86';
export const DATE_BASE_SOURCE='65ef2263b4587cb3d831e926ce5c9ada97462ce8aa2222bd9fa8c68c1ffcd986';
export const DATE_ACCEPTANCE_SHA='467c54d6a3e2060bfc0f871331d73aa2bb096daf93c6f1b96abf4d3b6109e929';
const sha=b=>createHash('sha256').update(b).digest('hex');
const parse=b=>{try{return JSON.parse(b.toString('utf8'));}catch(cause){throw new TypeError('invalid inheritance asset JSON',{cause});}};
export function checkDateDisplayInheritance({baseResources,baseManifest,baseAssets,resources,manifest,assets,acceptanceBytes}) {
  assert.equal(baseResources.world.revision,DATE_BASE_REVISION);assert.equal(baseResources.sourceDigest,DATE_BASE_SOURCE);
  assert.equal(sha(acceptanceBytes),DATE_ACCEPTANCE_SHA);
  const acceptance=parse(acceptanceBytes);assert.equal(acceptance.decision,'APPROVED');assert.equal(acceptance.source,'用户m1668');assert.equal(acceptance.sourceDigest,DATE_BASE_SOURCE);
  assert.deepEqual(baseManifest.displayAcceptance,{...acceptance,sha256:DATE_ACCEPTANCE_SHA});
  for(const f of[baseManifest.visualReview,baseManifest.geographyReview,baseManifest.authorDisplayData?.status,baseResources.geographyReview])assert.equal(f,'APPROVED');
  assert.equal(baseManifest.assets.length,38);assert.equal(manifest.assets.length,38);assert.equal(baseAssets.size,38);assert.equal(assets.size,38);
  const source=parse(assets.get('game-source.json')),baseSource=parse(baseAssets.get('game-source.json'));
  const data=parse(assets.get('data.json')),baseData=parse(baseAssets.get('data.json'));
  assert.equal(canonicalDigest(baseSource,sha),DATE_BASE_SOURCE);assert.equal(manifest.sourceDigest,canonicalDigest(source,sha));assert.equal(resources.sourceDigest,manifest.sourceDigest);
  const changes=[{idx:14,chapterId:'later-3',field:'year',old:8,original:264},{idx:15,chapterId:'later-4',field:'year',old:10,original:266}];
  const probe=structuredClone(source),dataProbe=structuredClone(data);
  for(const c of changes){assert.equal(source.chapterOrder[c.idx],c.chapterId);assert.equal(source.chapters[c.chapterId].state.start.year,c.original);assert.equal(data.scenarios[c.idx].start.year,c.original);assert.equal(baseSource.chapters[c.chapterId].state.start.year,c.old);assert.equal(baseData.scenarios[c.idx].start.year,c.old);probe.chapters[c.chapterId].state.start.year=c.old;dataProbe.scenarios[c.idx].start.year=c.old;}
  assert.deepEqual(probe,baseSource);assert.deepEqual(dataProbe,baseData);
  const oldPrefix=`content/builtin/compiled/${DATE_BASE_REVISION}/`,revision=resources.world.revision;assert.match(revision,/^map-2-[a-f0-9]{64}$/);assert.notEqual(revision,DATE_BASE_REVISION);
  const prefix=`content/builtin/compiled/${revision}/`,rebase=url=>{assert.ok(url.startsWith(oldPrefix));return prefix+url.slice(oldPrefix.length);};
  const world=structuredClone(baseResources.world);world.revision=revision;
  for(const k of['terrain','roadGraph','roadCost','roadOffset'])world.assets[k]=rebase(world.assets[k]);
  for(const k of['seasonAtlases','seasons','minimap'])for(const n of Object.keys(world.assets[k]))world.assets[k][n]=rebase(world.assets[k][n]);
  assert.deepEqual(resources.world,world);assert.deepEqual(parse(assets.get('world-definition.json')),world);
  const catalog=parse(baseAssets.get('catalog.json'));catalog.revision=revision;assert.deepEqual(parse(assets.get('catalog.json')),catalog);
  assert.deepEqual(resources,{...baseResources,world,catalogURL:prefix+'catalog.json',dataURL:prefix+'data.json',sourceURL:prefix+'game-source.json',sourceDigest:manifest.sourceDigest,geographyReview:'PENDING-DATE-DELTA'});
  const allowed=new Set(['game-source.json','data.json','world-definition.json','catalog.json',...changes.map(c=>catalog.chapters[c.idx].file)]),same={},seen=new Set();
  for(let i=0;i<38;i++){
    const old=baseManifest.assets[i],next=manifest.assets[i];assert.equal(next.path,old.path);assert.ok(!seen.has(old.path));seen.add(old.path);
    const prior=baseAssets.get(old.path),bytes=assets.get(old.path);assert.equal(prior.length,old.byteLength);assert.equal(sha(prior),old.sha256);
    assert.equal(next.url,prefix+old.path);assert.equal(bytes.length,next.byteLength);assert.equal(sha(bytes),next.sha256);
    if(!allowed.has(old.path)){assert.deepEqual(bytes,prior);same[old.path]=sha(bytes);}else assert.notEqual(sha(bytes),sha(prior));
  }
  assert.equal(Object.keys(same).length,32);
  for(const e of catalog.chapters)assert.deepEqual(parse(assets.get(e.file)),source.chapters[e.id].state);
  for(const[name,hash]of Object.entries(acceptance.minimapSha256))assert.equal(sha(assets.get(name)),hash);
  return {schemaVersion:1,type:'MACHINE-MAP-ONLY-DATE-INHERITANCE',parentRevision:DATE_BASE_REVISION,parentSourceDigest:DATE_BASE_SOURCE,parentAcceptanceSha256:DATE_ACCEPTANCE_SHA,
    sourceDigest:manifest.sourceDigest,changes,unchangedRoleSha256:same,
    scope:'Existing m1668 map/water/minimap/season approval inherited by exact bytes and entire source except two original year words. Not new human approval; HUD year changes use KI/header evidence, not map approval; not complete editor/init/calendar/CPU certificate.'};
}
