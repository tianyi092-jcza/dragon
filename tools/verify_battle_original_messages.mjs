// Raw-index literals + real facade/VM/input/A065/restore. No DOM or DOS claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OriginalBattleSession } from '../web/src/game/battle/originalsession.js';
import { originalTalkContext, originalTacticalTalkIndex, resolveOriginalTacticalTalk } from '../web/src/game/battle/originalmessages.js';
import { ORIGINAL_OBJECT as O } from '../web/src/game/battle/originalstate.js';
import { createFieldBattle, createBattle, advanceOriginalScriptFrame, queueTacticalCommand, queueTacticalPanelInput } from '../web/src/game/tacticalbattle.js';
import { BattleView } from '../web/src/render/battleview.js';
import { dispatch } from '../web/src/game/commands.js';
import { buildArmies, tickStrategicCity } from '../web/src/game/ai.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';

const json = (name) => {
  try {
    return JSON.parse(fs.readFileSync(`web/${name}.json`, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${name}.json`, { cause: error });
  }
};
const catalog = json('battle_talk'), scripts = json('battle_scripts');
const maps = json('battle_maps'); maps.navigation = json('battle_navigation');
maps.formationVectors = json('battle_rules').formationVectors;
const generals = Array.from({length:128}, (_,idx) => ({idx, name:`將${idx}`, portrait:idx,
  talk_idx:0, battle_formation:0, ability:{force:8,lead:7,field:3,siege:3}}));
const sc = {player_faction:0,generals,factions:[{idx:0,advisor_idx:4}]};
const legion = (faction,slot=faction,generalIdx=faction) => ({slot,generalIdx,leader:generals[generalIdx].name,
  faction,morale:200,troops:100,units:[{type:1,troops:1000},...Array.from({length:5},()=>({type:4,troops:0}))]});
const context = originalTalkContext(sc,[legion(0,2,0),legion(1,3,1)]);
assert.equal(context.speakers[0].generalPointer,0x4280);
assert.equal(context.speakers[0].legionPointer,0x22c0);
assert.equal(context.speakers[0].portrait,2,'slot, not commander0');
assert.equal(originalTacticalTalkIndex(0x1b7,0),670);
assert.equal(originalTacticalTalkIndex(0x1b8,0),678);
assert.equal(originalTacticalTalkIndex(0x1b7,8),678,'AH never modulo8');
assert.equal(originalTacticalTalkIndex(0x195,255),0x195);
const self = resolveOriginalTacticalTalk(catalog,context,0,0x1b7);
assert.equal(self.offset,0x56f7);
assert.equal(self.text,'啊啊，我就是將2，\n來一決勝負！！！');
assert.equal(self.argumentWordsConsumed,2);
assert.equal(resolveOriginalTacticalTalk(catalog,context,1,0x1b8).text,'還以為是誰！將2啊\n，我就一刀把你砍下來\n！！');
// Raw TALK681 skips first stack word and consumes speaker in a later line.
const c3=structuredClone(context);c3.speakers[0].personality=3;
const crossLine=resolveOriginalTacticalTalk(catalog,c3,0,0x1b8);
assert.equal(crossLine.index,681);assert.equal(crossLine.argumentWordsConsumed,2);
assert.ok(crossLine.text.includes('將2'));assert.ok(!crossLine.text.includes('將3'));
const c2=structuredClone(context);c2.speakers[0].personality=2;
assert.ok(resolveOriginalTacticalTalk(catalog,c2,0,0x1ac).text.includes('將4'),'TALK584 uses current advisor, not stack');
assert.equal(resolveOriginalTacticalTalk(catalog,null,0,0x1b7).status,'unresolved-slot-context');
assert.equal(resolveOriginalTacticalTalk(null,context,0,0x1b7).status,'unresolved-talk-asset');
assert.equal(resolveOriginalTacticalTalk(catalog,context,0,0xffff).status,'unresolved-talk-index');
assert.equal(originalTalkContext(sc,[{generalIdx:0,idx:0},legion(1)]).speakers[0],null);

// A12A complete word comparison / low-byte lifetime, including FFFF collision.
for(const counter of [0x00f0,0x12f0,0xffc3]) {
  const s=new OriginalBattleSession({talkContext:context,talkCatalog:catalog,
    registers:{tacticalFrameCounter:counter,side0Active:1,side1Active:1}});
  const rng=s.rng.snapshot();
  s.emitTalk(0,0x1b7,'fixture-after-A12A');s.emitTalk(1,0x1b8,'fixture-after-A12A');
  const deadline=(counter&0xff00)|((counter+60)&255);
  assert.equal(s.registers.side0MarkerAt,deadline);
  for(let n=0;n<59;n++){s.tick();assert.ok(s.messages.slots[0]);}
  s.tick();assert.equal(s.messages.slots[0],null);assert.ok(s.messages.slots[1]);
  // C3B8 clobbers AX=011B; equal side1 deadline was NOT compared to D318.
  for(let n=0;n<256;n++)s.tick();
  if((counter&0xff00)===0xff00)assert.ok(s.messages.slots[1],'FFFF side0 sentinel keeps intercepting each cycle');
  else assert.equal(s.messages.slots[1],null);
  assert.equal(s.registers.side0MarkerAt,0xffff);assert.equal(s.registers.tacticalFrameCounter&0xff00,counter&0xff00);
  assert.deepEqual(s.rng.snapshot(),rng);
}
{
  const s=new OriginalBattleSession({talkContext:context,talkCatalog:catalog,
    registers:{tacticalFrameCounter:0x34fe,side0Active:1,side1Active:1}});
  s.emitTalk(0,0x1b7,'fixture');s.emitTalk(1,0x1b8,'fixture');s.tick();
  s.emitTalk(0,0x1b1,'replacement');
  assert.equal(s.registers.side0MarkerAt,0x343b);assert.equal(s.registers.side1MarkerAt,0x343a);
  const snapshot=s.snapshot(),twin=new OriginalBattleSession({talkCatalog:catalog});twin.restore(snapshot);
  snapshot.messages.slots[0].lines[0]='poison';snapshot.messages.context.speakers[0].name='poison';
  assert.equal(s.messages.slots[0].text,'擺出陣形！！');assert.equal(twin.messages.context.speakers[0].name,'將2');
  for(const target of [s,twin]) {
    assert.equal(target.messageInput(27,0),null);assert.equal(target.messageInput(0,2),null);
    target.messageInput(28,2);assert.ok(target.messages.slots[0]);assert.equal(target.messages.slots[1],null);
    target.tick();target.emitTalk(1,0x1b8,'post-restore');
  }
  assert.deepEqual(s.snapshot(),twin.snapshot());
}

function make() {
  const battle=createFieldBattle(sc,legion(0,2,0),legion(1,3,1),maps,{directoryIndex:0xc0});
  battle.session.messages.catalog=catalog;
  const view={battle,app:{battleScripts:scripts,hud:{flashEvent(){}}}};
  BattleView.prototype.startBattleScript.call(view);
  const s=battle.session;
  s.pool.bytes.fill(0);s.temps.bytes.fill(0);s.effects.bytes.fill(0);s.spatial.bytes.fill(0);
  s.spatial.tiles.fill(1);s.spatial.tileAttributes.fill(0);
  s.registers.side0Active=1;s.registers.side1Active=1;s.registers.mode=1;
  for(const [a,x,y] of [[0,20,20],[0x600,40,40]]) {
    for(const [f,v] of [[O.FLAGS,0xc0],[O.HP,180],[O.ANCHOR_X,x],[O.PREVIOUS_X,x],
      [O.ANCHOR_Y,y],[O.PREVIOUS_Y,y],[O.POSITION_X,x],[O.POSITION_Y,y],
      [O.CURRENT_COMMAND,8],[O.PENDING_COMMAND,8]])s.pool.write8(a,f,v);
    s.pool.write16(a,O.TARGET_X,x|(y<<8));s.pool.write16(a,O.SPATIAL_0C,y*64+x);s.pool.write16(a,O.SPATIAL_0E,y*64+x);
  }
  return {battle,s,vm:view.battleScriptVm,view};
}
// Actual exported VM starts with side1 C315. Player acknowledgment precedes it
// and A12A; rejected A7B7 current5 must NOT suppress the input-stage speech.
{
  const {battle,s,vm}=make();s.registers.tacticalFrameCounter=0xf0;
  s.pool.write8(0,O.CURRENT_COMMAND,5);
  const rng=s.rng.snapshot();
  queueTacticalCommand(battle,{groups:[0],command:'attack'});
  advanceOriginalScriptFrame(battle,vm);
  assert.equal(s.pool.read8(0,O.CURRENT_COMMAND),5);
  assert.equal(s.pool.read8(0,O.PENDING_COMMAND),1);
  assert.equal(s.messages.slots[0].index,630);assert.equal(s.messages.slots[1].index,1006); // selected raw block2 starts 1330h, AH19
  assert.equal(s.registers.side0MarkerAt,0x2c);assert.equal(s.registers.side1MarkerAt,0x2c);
  assert.equal(s.registers.tacticalFrameCounter,0xf1);
  const frame=s.frame;queueTacticalPanelInput(battle,{type:'message-input',hitId:28,button:2});
  advanceOriginalScriptFrame(battle,vm);
  assert.equal(s.frame,frame+1);assert.equal(s.messages.slots[1],null);assert.ok(s.messages.slots[0]);
  assert.deepEqual(s.rng.snapshot(),rng);
  const snapshot=s.snapshot(),copy=make();copy.s.restore(snapshot);
  // VM registers are not part of Session snapshot: restore its existing explicit state.
  for(const k of ['pc','wait','R','cmd','mode','done'])copy.vm[k]=vm[k];
  advanceOriginalScriptFrame(battle,vm);advanceOriginalScriptFrame(copy.battle,copy.vm);
  assert.deepEqual(s.snapshot(),copy.s.snapshot());
}
// Every C1B9/A8F6 gate, exact indices and lower-only C407 fixture through collide.
for(const winner of [0,1,2])for(const command of ['formation','attack','assault','wall','defend','retreat'])
for(const themeFlag of [0,42])for(const battleSideFlag of [0,0x80]) {
  const {battle,s,vm}=make();vm.pc=1; // original WAIT, not a stubbed VM
  Object.assign(s.registers,{winnerState:winner,themeFlag,battleSideFlag,selectedGroupMask:4});
  const rng=s.rng.snapshot();queueTacticalCommand(battle,{command});advanceOriginalScriptFrame(battle,vm);
  const rejected=command==='retreat'?winner!==0:winner===1;
  const selector=command==='retreat'?0x1af:command==='wall'?(themeFlag===0?0x1ac:battleSideFlag?0x1b6:0x1b4):
    0x1b1+['formation','attack','assault','wall','defend'].indexOf(command);
  assert.equal(s.messages.slots[0]?.selector??null,rejected?null:selector);
  assert.deepEqual(s.rng.snapshot(),rng);
}
// A69F all8 cc x4 D349, raw op16 records at all actual sites via production IO.
{
  const {s,vm}=make();const rng=s.rng.snapshot();
  for(let cc=0;cc<8;cc++)for(let winner=0;winner<4;winner++) {
    // Boundary instruction fixture: same raw A69F encoding, all condition branches.
    vm.words=[(20<<8)|(cc<<5)|16];vm.pc=0;vm.wait=0;s.registers.winnerState=winner;
    s.messages.slots=[null,null];vm.step();
    let expected=(cc&6);if(expected && (cc&1))expected^=6;expected>>=1;
    const slot=s.messages.slots[cc&1];
    assert.equal(slot?.selector??null,winner===expected?0x1e2:null);
    if(slot)assert.equal(slot.index,1014);
  }
  assert.deepEqual(s.rng.snapshot(),rng);
}
{
  const {battle,s,vm}=make();vm.pc=1;s.pool.write8(0,O.HP,49);
  s.registers.tacticalFrameCounter=0xf0;
  advanceOriginalScriptFrame(battle,vm);
  assert.equal(s.messages.slots[0].selector,0x1b0);
  assert.equal(s.registers.side0MarkerAt,0x2d,'AE56 after A12A starts at F1');
  assert.equal(battle.dialogues.length,0,'no invented retreat text');
}
{
  const {s}=make();s.registers.mode=0;s.registers.tacticalFrameCounter=0x12f0;
  s.pool.write8(0,O.DIRECTION,1);
  const a=0xc00;s.mapObjects.write8(a,0,0x80);s.mapObjects.write8(a,1,1);s.mapObjects.write16(a,0x18,0x1001);
  const rng=s.rng.snapshot();s.collide(0,0x61);
  assert.deepEqual(s.messages.wall,{label:'門強度',hitId:29,address:a,value:151,maximum:151,metric:4096,deadline:0x1204});
  s.registers.tacticalFrameCounter=0x12f1;s.mapObjects.write16(a,0x18,0x1001);s.collide(0,0x61);
  assert.equal(s.registers.wallMarkerAt,0x1204,'equal metric does not extend');
  s.mapObjects.write16(a,0x18,0x801);s.collide(0,0x61);
  assert.equal(s.registers.wallMarkerAt,0x1205);assert.equal(s.messages.wall.value,128);
  assert.equal(s.messageInput(29,0),null);s.messageInput(29,2);assert.equal(s.messages.wall,null);
  assert.deepEqual(s.rng.snapshot(),rng);
  const close=s.events.at(-1);assert.equal(close.unmask.height,4,'C4B7 differs from opening2');
  s.mapObjects.write16(a,0x18,1);s.collide(0,0x61);
  assert.equal(s.messages.wall.value,0,'1→0 decrements and displays; no B799 this call');
  // Let the actual A12A expire while making no extra collision calls.
  s.objectsInitialized=false;for(let i=0;i<20;i++)s.tick();
  assert.equal(s.messages.wall,null);assert.equal(s.registers.wallMarkerAt,0xffff);
}

// Actual raw op3 retreat through VM production IO, both accepting/rejecting gates.
for(const winner of [0,1,2]) {
  const {s,vm}=make();
  const block=scripts.find(words=>words.some(w=>(w&31)===3 && (w>>>8)===5));
  const pc=block.findIndex(w=>(w&31)===3 && (w>>>8)===5);
  vm.words=block;vm.pc=pc;s.registers.winnerState=winner;
  const rng=s.rng.snapshot();vm.step();
  assert.equal(s.messages.slots[1]?.selector??null,winner===0?0x1af:null);
  assert.deepEqual(s.rng.snapshot(),rng);
}
// Real ADC8/AF69 -> B533/B5B7/B60F -> C407, after this frame's A12A.
{
  const {battle,s,vm}=make();vm.pc=1;s.registers.mode=0;
  for(const [field,value] of [[O.FLAGS,0x80],[O.ANCHOR_X,2],[O.PREVIOUS_X,2],
    [O.ANCHOR_Y,1],[O.PREVIOUS_Y,1]])s.pool.write8(0,field,value);
  s.pool.write16(0,O.SPATIAL_0C,66);s.pool.write16(0,O.SPATIAL_0E,66);
  s.pool.write16(0,O.TARGET_X,0x104);s.pool.write16(0,O.POSITION_X,0x104);
  for(let x=1;x<=4;x++)s.spatial.write8(0x7000+64+x,(x>1?16:0)|(x<4?32:0));
  s.spatial.write8(67,0x61);s.spatial.write8(0x1043,0x61);s.spatial.writeTile(67,0xd0);
  s.mapObjects.write8(0xc00,0,0x80);s.mapObjects.write8(0xc00,1,1);s.mapObjects.write16(0xc00,0x18,500);
  const rng=s.rng.snapshot();advanceOriginalScriptFrame(battle,vm);
  assert.equal(s.pool.read8(0,O.ANCHOR_X),2);
  assert.equal(s.mapObjects.read16(0xc00,0x18),499);
  assert.equal(s.messages.wall.value,31);assert.equal(s.registers.wallMarkerAt,21);
  assert.ok(battle.originalLastEvents.some(e=>e.type==='tactical-wall-update'));
  assert.deepEqual(s.rng.snapshot(),rng);
}

// Restore prevalidation is atomic. Legacy active markers have no recoverable
// C405/captured text; FFFF itself is ambiguous when D319=FF.
{
  const {s}=make();s.registers.mode=0;s.pool.write8(0,O.DIRECTION,1);
  s.mapObjects.write8(0xc00,0,0x80);s.mapObjects.write8(0xc00,1,1);s.mapObjects.write16(0xc00,0x18,257);
  s.collide(0,0x61);s.emitTalk(0,0x1b7,'restore-fixture');
  const saved=s.snapshot();
  for(const corrupt of [
    x=>{delete x.messages;},
    x=>{delete x.messages.wallMinimum;},
    x=>{delete x.messages.catalogHash;},
    x=>{x.messages.revision=2;},
    x=>{x.messages.catalogHash='wrong';},
  ]) {
    const copy=structuredClone(saved);corrupt(copy);const before=s.snapshot();
    assert.throws(()=>s.restore(copy),/incomplete-tactical-message-state/);
    assert.deepEqual(s.snapshot(),before,'failed message restore changes no rule/RNG/queue byte');
  }
  const missing=new OriginalBattleSession();const before=missing.snapshot();
  assert.throws(()=>missing.restore(saved),/missing-tactical-talk-catalog/);
  assert.deepEqual(missing.snapshot(),before);
  assert.throws(()=>{s.messages.catalog={records:catalog.records,sourceSha256:catalog.sourceSha256};},/invalid-tactical-talk-catalog/);
  const twin=make().s;twin.restore(saved);
  assert.equal(twin.messages.wallMinimum,256);
  twin.registers.tacticalFrameCounter++;
  twin.mapObjects.write16(0xc00,0x18,257);twin.collide(0,0x61);
  assert.equal(twin.registers.wallMarkerAt,saved.registers.wallMarkerAt,'restored equal value cannot extend expiry');
  twin.objectsInitialized=false;
  for(let i=0;i<19;i++)twin.tick();
  assert.equal(twin.messages.wall,null);
  const legacy=new OriginalBattleSession().snapshot();delete legacy.messages;
  assert.doesNotThrow(()=>new OriginalBattleSession().restore(legacy),'closed non-FF-high legacy subset');
  legacy.registers.tacticalFrameCounter=0xff00;
  assert.throws(()=>new OriginalBattleSession().restore(legacy),/incomplete-tactical-message-state/);
}

// Actual official scenario -> existing AI formation + player dispatch -> both
// facade constructors/attack-defense mapping. No fallback slot invention here.
{
  const official=structuredClone(json('data').scenarios[16]);official.player_faction=0;
  official.citiesOf=idx=>official.cities.filter(c=>c.faction===idx);buildArmies(official);
  const faction=official.factions.find(f=>f.idx===13);faction.target_faction=0;
  official.diplomacy[13][0]=0;official.diplomacy[0][13]=0;
  tickStrategicCity({scenario:official,originalRng:createOriginalBattleRng(),gamebar:{enqueueTalkMessage(){assert.fail('NPC message');}}},76);
  const enemy=official.legions[0];assert.ok(enemy);assert.equal(enemy.slot,enemy.generalIdx);
  const from=official.cities[88],target=official.cities[76];
  const dispatched=dispatch(official,from,target);assert.ok(dispatched.ok,dispatched.err);
  const player=official.legions.at(-1);assert.equal(player.slot,player.generalIdx);
  for(const reverse of [false,true]) {
    const [a,d]=reverse?[enemy,player]:[player,enemy];
    for(const b of [createFieldBattle(official,a,d,maps,{directoryIndex:0xc0}),createBattle(official,a,target,maps,d)]) {
      b.session.messages.catalog=catalog;b.session.emitTalk(0,0x1b7,'legal-facade');
      assert.equal(b.session.messages.slots[0].status,'decoded');
      assert.equal(b.session.messages.slots[0].speaker.slot,player.slot);
      assert.equal(b.session.messages.context.speakers[1].slot,enemy.slot);
    }
  }
  // NPC-NPC/temp-city are 5130 strategy-only paths in KI; even a diagnostic
  // context without a legion.slot is unresolved, not attributed to general127.
  assert.equal(originalTalkContext(official,[player,{generalIdx:127}]).speakers[1],null);
}
console.log('original messages OK: raw indices/slot/stack, 60/20 byte-marker windows, local input, all command/A69F gates, production VM frames/auto retreat/restore/RNG and official formation/facade mappings; UI timing pending owner');
