// Opt-in local public release, in-memory only (no player save / development store writes).
import assert from 'node:assert/strict';
import {localFormalChapter} from './local_formal_chapter.mjs';
import {createPlayerEnvironment} from '../web/src/player/playerenvironment.js';
import {prepareScenario} from '../web/src/game/scenarioassembly.js';
import {bindNativePlayerFactionPointer,initializeFreshPlayerAdvisor} from '../web/src/game/nativefactions.js';
import {refreshNativeMonthlyPolicyViews} from '../web/src/game/nativemonthlypolicy.js';
import {createOriginalBattleRng} from '../web/src/game/battle/originalrng.js';
import {monthEnd} from '../web/src/game/commands.js';
import {Clock} from '../web/src/game/clock.js';
import * as ai from '../web/src/game/ai.js';
const id=process.argv[2]; assert.ok(id,'local published game UUID required');
const pack=await localFormalChapter(id,'middle-3');assert.match(pack.chapter.name,/隱伏新野/);
const env=createPlayerEnvironment(pack,{playerFaction:0,mapExtent:true});await env.world.roads.loadRoadGraph();
const {scenario:s}=await prepareScenario({...env,mode:'fresh',idx:0,mapExtent:true});ai.buildArmies(s);initializeFreshPlayerAdvisor(s);bindNativePlayerFactionPointer(s,'xinye fiscal');
const f=s.factions[0];assert.equal(f.monarch,'曹操');
const rng=createOriginalBattleRng({ch:0,cl:0,dh:1}),app={scenario:s,originalRng:rng,gamebar:{enqueueTalkMessage(m){m.onClose?.();m.onComplete?.();}}};
// Match visible reserves, not the unobserved troop formations / prior transfers.
[f.reserve_cav,f.reserve_arc,f.reserve_inf]=[100,1000,1000];
s.nativeMonthlyPolicy.bytes.splice(0,16,18,0,0,0,0,0,0,0,100,0,232,3,44,1,44,1);refreshNativeMonthlyPolicyViews(s);
ai.initializeStrategicDiplomacy(app);
let months=0;
app.clock=new Clock({startYear:203,startMonth:10,onStrategicTick(c){ai.aiTick(app,{cityIndex:s._cityTickCursor??0,legionBatchStart:s._legionBatchCursor??0,hour:c.hour,runFactionTick:false});},onHour(){ai.tickStrategicWarEvents(app);ai.tickFactionStrategicState(app);},onMonthEnd(c){
 const reg=[[0,0,0],[0,0,0],[0,0,0]],cap=s.cities[f.capital];let base=0,n=0;
 for(const v of s.cities.filter(v=>v.faction===0)){n++;const d=Math.max(Math.abs(cap.x-v.x),Math.abs(cap.y-v.y)),q=Math.floor(v.prod/(d<=80?2:d<=200?3:4)),b=q>>5,r=v.y<80?0:v.y<150?1:2,a=r===0?b>>5:r===1?b>>3:b>>1,k=r===0?b-(b>>2)-(b>>3)-a:r===1?b>>3:b>>5;const vec=[k,a,r===2?a-k:b-a-k];vec.forEach((v,i)=>reg[r][i]+=v*10);base+=q;}
 const before=f.reserve_cav*10,policy=[...s.conscription],tax=s.tax;
 const row=ai.processMonthlyFiscalSettlement(app,c).find(r=>r.faction===0);
 const actual=[row.cav,row.arc,row.inf].map(v=>10*v);console.log(JSON.stringify({month:c.month,tax,policy,n,base,regions:reg,income:row.income,actual,before,after:f.reserve_cav*10}));
 assert.deepEqual(actual,policy.map((p,i)=>Math.min(p,reg.reduce((a,v)=>a+v[i],0))));months++;
 const tail=()=>{ai.processMonthlyGeneralRatings(app);ai.monthlyDiplomacyAI(app);ai.processMonthlyBudgetProducers(app);ai.enqueueMonthlyDisasterEvents(app);ai.enqueueDeficitTrustEvent(app);ai.processMonthlyPolicyActivation(app);ai.monthlyAI(app);monthEnd(app);};
 if(ai.processMonthlyGeneralFates(app,tail)!=='suspended') tail();
}});
for(let tick=0;months<2&&tick<15000;tick++){app.clock._tick();assert.ok(!app._strategicBattleFailure);}
assert.equal(months,2);
