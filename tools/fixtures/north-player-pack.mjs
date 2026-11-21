// Isolated transport for an already compiled game. No editor store, HTTP,
// publication or Trial tickets. Blob URLs and byte verification are owned by
// the same pack loader as the public player; all map assets are actual bytes.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MINIMAP_SIZES, renderMinimapPixels } from '../../web/src/content/authoring/minimap.js';
import { encodePNG } from '../../server/pngio.js';
import { TRIAL_COMPILER_REVISION } from '../../web/src/content/authoring/trialcompile.js';
import { ASSET_TYPES } from '../../web/src/player/runtimecontract.js';

export async function northPlayerTransport(game, compiled) {
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const json = value => Buffer.from(JSON.stringify(value));
  const reply = (bytes,contentType) => ({bytes,contentType,sha256:sha(bytes)});
  const { gameId } = game, revision = '1', sourceDigest = compiled.sourceDigest;
  const chapterId = game.chapterOrder[0];
  const manifest = { schemaVersion:3, buildFormat:'studio-world-grid-1', compilerRevision:TRIAL_COMPILER_REVISION,
    identity:{gameId,draftRevision:revision,sourceDigest},world:{...game.map.bounds,id:`${gameId}-world`,revision:sourceDigest},
    chapters:game.chapterOrder, assets:[], minimapAssets:[], portraits:[], visualAssets:{seasonAtlases:{},seasons:{}} };
  const responses = new Map();
  const assets = {terrain:compiled.terrainBytes,roadCost:compiled.roadCost,roadOffset:compiled.roadOffsetBytes,roadGraph:json(compiled.roadGraph)};
  for (const [name,{w,h}] of Object.entries(MINIMAP_SIZES)) {
    const {pixels} = renderMinimapPixels(compiled.minimapGeography,compiled.roadMask,compiled.width,compiled.height,w,h,1);
    assets[name==='base'?'minimapBase':'minimapLarge'] = encodePNG(pixels,w,h,3);
  }
  const roles = {terrain:'rules-initial-terrain',roadGraph:'world-road-grid',roadCost:'legacy-grid-visual',roadOffset:'legacy-grid-visual',minimapBase:'automatic-minimap',minimapLarge:'automatic-minimap'};
  for (const [assetId,bytes] of Object.entries(assets)) {
    const result = reply(bytes,ASSET_TYPES[assetId]);
    responses.set(`asset:${assetId}`,result);
    manifest[assetId.startsWith('minimap')?'minimapAssets':'assets'].push({assetId,role:roles[assetId],sha256:result.sha256,byteLength:bytes.length,url:`/api/trial-asset?game=${gameId}&revision=${revision}&digest=${sourceDigest}&asset=${assetId}`});
  }
  const pinned = JSON.parse(await readFile(new URL('../../server/pinned/world-manifest.txt',import.meta.url)));
  for (const [key,stem] of [['seasons','map_tiles_'],['seasonAtlases','map_atlas_']]) for (const season of ['spring','summer','autumn','winter']) {
    const {url,byteLength,sha256} = pinned.assets.find(row=>row.path===`${stem}${season}.png`);
    manifest.visualAssets[key][season] = {path:url,url,byteLength,sha256};
    responses.set(url,reply(await readFile(new URL('../../web/'+url,import.meta.url)),'image/png'));
  }
  const header = reply(json(manifest),'application/json');
  responses.set('manifest',header);
  responses.set(`chapter:${chapterId}`,reply(json(game.chapters[chapterId].state),'application/json'));
  const identity = {gameId, releaseId:'north-experiment',revision,sourceDigest,ordinal:'1.0',chapters:game.chapterOrder,chapterId,manifestDigest:header.sha256};
  return {session:{identity,state:()=> 'active',read:async role=>responses.get(role)},compilerRevision:TRIAL_COMPILER_REVISION,maxTotalBytes:128*1024*1024,readStatic:async path=>responses.get(path)};
}
