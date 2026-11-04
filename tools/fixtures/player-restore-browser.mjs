// Own current-Web/native-IDB fixture. Reader ports are controlled, not signed.
import './formal-app-browser.mjs';
import { BUILTIN_RESOURCES as builtin } from '/src/content/builtinresources.generated.js';
import { TRIAL_COMPILER_REVISION } from '/src/content/authoring/trialcompile.js';
import { mountPlayerRestore } from '/src/player/playerrestore.js';
import { PlayerReaderError } from '/src/player/playerclient.js';
import { mountDeletedGameNotice } from '/src/player/playerdeletedgame.js';
import { mountFormalBackup } from '/src/tools/formalbackup.js';
import { sha256 } from '/src/player/runtimecontract.js';
const base = window.__ownedFormal;
if (!base.ready) throw new Error('owned base App failed');
await window.__app.saveGame(0, '<img src=x onerror=alert(1)>');
const original = await base.store.get(0);
await window.__app.returnToTitle();
const G = original.record.gameId, C = original.record.chapterId, R = original.record.releaseId;
const values = new Map(), visuals = {}, roles = { terrain:'rules-initial-terrain',roadGraph:'native-road-v2',roadCost:'legacy-grid-visual',roadOffset:'legacy-grid-visual',minimapBase:'automatic-minimap',minimapLarge:'automatic-minimap' };
async function bytes(path, contentType) { const response = await fetch(path); if (!response.ok) throw new Error('owned asset unavailable'); const data = new Uint8Array(await response.arrayBuffer()); return { bytes:data,contentType,sha256:await sha256(data) }; }
const assets = [], minis = [];
for (const id of Object.keys(roles)) {
  let path = builtin.world.assets[id];
  if (id === 'minimapBase') path = builtin.world.assets.minimap.base;
  if (id === 'minimapLarge') path = builtin.world.assets.minimap.large;
  let type = 'application/octet-stream';
  if (id.startsWith('minimap')) type = 'image/png';
  else if (['roadGraph','roadOffset'].includes(id)) type = 'application/json';
  const value = await bytes(path, type); values.set('asset:'+id,value);
  const row = { assetId:id,role:roles[id],byteLength:value.bytes.length,sha256:value.sha256,url:`/api/trial-asset?game=${G}&revision=1&digest=${builtin.sourceDigest}&asset=${id}` };
  (id.startsWith('minimap') ? minis : assets).push(row);
}
for (const group of ['seasons','seasonAtlases']) {
  visuals[group] = {};
  for (const season of ['spring','summer','autumn','winter']) {
    const path = builtin.world.assets[group][season], value = await bytes(path,'image/png'); values.set(path,value);
    visuals[group][season] = { path,url:path,byteLength:value.bytes.length,sha256:value.sha256 };
  }
}
const manifest = { schemaVersion:1,buildFormat:'studio-app-2',compilerRevision:TRIAL_COMPILER_REVISION,identity:{gameId:G,draftRevision:'1',sourceDigest:builtin.sourceDigest},chapters:[C],world:{id:G+'-world',revision:builtin.sourceDigest,width:384,height:256,tileSize:16},assets,minimapAssets:minis,portraits:[],visualAssets:visuals };
async function json(value) { const data = new TextEncoder().encode(JSON.stringify(value)); return {bytes:data,contentType:'application/json',sha256:await sha256(data)}; }
values.set('manifest',await json(manifest)); values.set('chapter:'+C,await json((await (await fetch(builtin.dataURL)).json()).scenarios[0]));
const selection = {gameId:G,releaseId:R,ordinal:base.environment.identity.ordinal,revision:'1',sourceDigest:builtin.sourceDigest,name:'Owned restore',publishedAt:'2037-01-01T00:00:00.000Z',chapters:[C]};
const header = {...base.saves.identity,manifestDigest:values.get('manifest').sha256};
const control = window.__restore = {sessions:[],gets:[],calls:0,view:null,chosen:null,settled:false,hold:false,release:null,holdGet:false,releaseGet:null,changed:false,staticFailure:false,statusFailure:false,holdStatus:false,releaseStatus:null,deleted:false,prompt:null,promptExit:null};
const store = {...base.store,async get(slot){control.gets.push(slot);if(control.holdGet)await new Promise(done=>{control.releaseGet=done;});return base.store.get(slot);}};
const reader = {
  async registry(){return {directory:[structuredClone(selection)]};},
  async status(request){const id=typeof request==='string'?request:request?.gameId;if(control.deleted&&id===G)throw new PlayerReaderError('GAME_DELETED',410);if(control.holdStatus && request?.gameId===G)await new Promise(done=>{control.releaseStatus=done;});if(control.statusFailure)throw new Error('owned status unavailable');return {...selection,listed:true};},
  async admit({chapterId,ordinal}) {
    control.calls++;
    if (control.deleted) throw new PlayerReaderError('GAME_DELETED',410);
    if (ordinal !== selection.ordinal || chapterId !== C || control.changed) throw new Error('owned current release changed');
    let state = 'active';
    const session = {identity:{...selection,chapterId:C,manifestDigest:header.manifestDigest},state:()=>state,close(){state='closed';},async read(role){if(state!=='active')throw new Error('owned closed');return structuredClone(values.get(role));}};
    control.sessions.push(session);
    if(control.hold)await new Promise(done=>{control.release=done;});
    return session;
  },
};
const options = {root:document.body,reader,selection,store,compilerRevision:TRIAL_COMPILER_REVISION,maxTotalBytes:256*1024*1024,async readStatic(path){if(control.staticFailure)throw new Error('owned static failure');return structuredClone(values.get(path));}};
control.advance = () => { selection.releaseId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; selection.ordinal = '1.' + (BigInt(base.environment.identity.ordinal.slice(2)) + 1n); };
control.before = () => base.store.list();
control.empty = async () => {for(const row of await base.store.list()){const value=await base.store.get(row.slot);await base.store.compareDelete(value.token);}};
control.seed = async (slot=0, changes={}) => {
  const prior = await base.store.get(slot);
  return base.store.put({...header,slot,snapshot:{...original.record.snapshot,slot},...changes},prior?.token??null);
};
control.reset = async () => {
  control.view?.close(); control.release?.(); control.releaseGet?.(); control.releaseStatus?.(); control.release=null; control.releaseGet=null; control.releaseStatus=null; control.hold=false;control.holdGet=false;control.holdStatus=false;
  control.chosen?.session.close(); control.chosen?.pack.close(); control.chosen=null;
  for(const row of await base.store.list()){const value=await base.store.get(row.slot);await base.store.compareDelete(value.token);}
  selection.releaseId=R;selection.ordinal=base.environment.identity.ordinal;control.statusFailure=false;
  control.changed=false;control.staticFailure=false;control.gets=[];control.sessions=[];control.calls=0;
  control.deleted=false;control.promptExit=null;
  await control.seed();
};
control.mountDeletedPrompt = ({listFailure=false}={}) => {
  control.prompt?.close();document.querySelector('#owned-deleted')?.remove();control.promptExit=null;
  const root=document.createElement('section');root.id='owned-deleted';document.body.append(root);
  const scoped=listFailure?{...base.store,async list(){throw new Error('owned catalog unavailable');}}:base.store;
  control.prompt=mountDeletedGameNotice({root,store:scoped,onExit:action=>{control.promptExit=action;}});
};
control.mountBackup = () => {
  control.backup?.close();document.querySelector('#owned-backup')?.remove();
  const root=document.createElement('section');root.id='owned-backup';document.body.append(root);
  control.backup=mountFormalBackup({...options,root,createStore:gameId=>{if(gameId!==G)throw new Error('wrong owned game');return store;}});
};
control.mount = () => {control.gets=[];control.settled=false;control.chosen=null;control.view=mountPlayerRestore(options);control.view.result.then(value=>{control.chosen=value;control.settled=true;});};
control.bad = () => {
  let count=0;
  for(const bad of [{root:null},{reader:{}},{store:{}},{store:{...store,gameId:'other'}},{compilerRevision:''},{maxTotalBytes:0},{readStatic:null}]) {
    try{mountPlayerRestore({...options,...bad});}catch(error){if(error instanceof TypeError)count++;else throw error;}
  }
  return count;
};
await control.reset(); control.ready=true;
