// Browser-only trusted-pack seam. Real current Web chapter/resources, real
// environment/repository/App/native IDB; NOT a signed remote admission test.
import { startApp } from '/src/main.js';
import { BUILTIN_RESOURCES as builtin } from '/src/content/builtinresources.generated.js';
import { TRIAL_COMPILER_REVISION } from '/src/content/authoring/trialcompile.js';
import { createPlayerEnvironment } from '/src/player/playerenvironment.js';
import { createPlayerSaveStore } from '/src/player/playersaves.js';
import { createPlayerSaveRepository, capturePlayerSaveRepository } from '/src/player/playerrepository.js';
import { createGameSaveStore } from '/src/core/gamesavestore.js';
let params;try{params=new URL(location.href).searchParams;}catch{throw new Error('owned fixture URL invalid');}
const G=params.has('large')?'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee':'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', R='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const ordinal=params.has('large')?'1.9007199254740993':'1.0';
const digest=builtin.sourceDigest, chapterId=G+'#owned-chapter';
let ended=false;
const current=()=>{if(ended)throw Object.assign(new Error('owned explicit deletion'),{code:'GAME_DELETED'});};
const urls=[], resourceURLs={};
async function blob(role,path){const response=await fetch(path);if(!response.ok)throw new Error('owned fixture asset missing');const url=URL.createObjectURL(await response.blob());urls.push(url);resourceURLs[role]=url;}
const data=await (await fetch(builtin.dataURL)).json();
for(const id of ['terrain','roadGraph','roadCost','roadOffset'])await blob('asset:'+id,builtin.world.assets[id]);
await blob('asset:minimapBase',builtin.world.assets.minimap.base);await blob('asset:minimapLarge',builtin.world.assets.minimap.large);
for(const group of ['seasons','seasonAtlases'])for(const season of ['spring','summer','autumn','winter'])await blob(group+':'+season,builtin.world.assets[group][season]);
const identity=Object.freeze({gameId:G,releaseId:R,ordinal,revision:'1',sourceDigest:digest,chapterId,manifestDigest:'c'.repeat(64)});
const pack={assertCurrent:current,identity,chapter:data.scenarios[0],resourceURLs,manifest:{buildFormat:'studio-app-2',compilerRevision:TRIAL_COMPILER_REVISION,identity:{gameId:G,draftRevision:'1',sourceDigest:digest},chapters:[chapterId],world:{id:G+'-world',revision:digest,width:384,height:256,tileSize:16},portraits:[]}};
const factionPosition=params.has('alternate-faction')?1:0;
const environment=createPlayerEnvironment(pack,{playerFaction:pack.chapter.factions[factionPosition].idx});
const store=createGameSaveStore({gameId:G,databaseName:'owned-formal-app',getIndexedDB:()=>indexedDB});
const saves=createPlayerSaveStore({environment,store}), repository=createPlayerSaveRepository({saves,assertCurrent:current});
const control=window.__ownedFormal={environment,store,saves,repository,exits:[],retire(){ended=true;},ready:false};
control.statusCalls=0;control.statusHook=null;
const formal={environment,saveRepository:repository,checkStatus(){control.statusCalls++;return control.statusHook?.();},onExit(result){control.exits.push(result);for(const url of urls)URL.revokeObjectURL(url);}};
control.rejectedOptions=0;
for(const options of [{formal:false},{formal:0},{formal:''},{formal:{}},{formal:{...formal,onExit:null}},
 {formal:{...formal,saveRepository:null}},{formal:{...formal,savedSlot:-1}},{formal,trial:{}},
 {formal:{...formal,environment:{...environment,player:null}}},{formal:{...formal,checkStatus:false}}]) {
  let rejected=false;try{await startApp(null,options);}catch(error){rejected=error instanceof TypeError;}
  if(!rejected||window.__app._bootStarted||window.__ownedDatabases.length)throw new Error('invalid formal options changed App/storage');
  control.rejectedOptions++;
}
if(params.has('restore'))formal.savedSlot=0;
if(params.has('restore-import'))formal.savedSlot=12;
const failure=params.get('failure');
if(['repository','null','delete-code'].includes(failure))formal.saveRepository={...repository,async load(){
  if(failure==='null')throw null;
  if(failure==='delete-code')throw Object.assign(new Error('not a deletion fact'),{code:'GAME_DELETED'});
  throw new Error('owned repository failure');
}};
if(failure==='missing-slot')formal.savedSlot=999;
if(failure==='season')window.__app.setSeason=async()=>{
  await Promise.resolve();
  const a=window.__app;control.failurePrefix={scenario:Boolean(a.scenario),clock:Boolean(a.clock),incomplete:Boolean(a._scenarioAssemblyIncomplete)};
  throw new Error('owned season failure');
};
if(params.has('capture')) {
  const selected=await store.get(0);
  formal.saveRepository=await capturePlayerSaveRepository({saves,assertCurrent:current,expectedToken:selected.token});
  formal.savedSlot=0;control.repository=formal.saveRepository;control.capturedLabel=selected.record.snapshot.label;
  await store.put({...saves.identity,slot:0,snapshot:{...selected.record.snapshot,label:'external after capture'}},selected.token);
}
try {
  await startApp(null,{formal});
  window.__app.gamebar._clockHoldRequested=true;window.__app.gamebar.syncClock();
  control.ready=true;
} catch(error) { control.bootError={code:error?.code??null,message:error?.message??'owned non-Error rejection',nullRejection:error===null}; }
