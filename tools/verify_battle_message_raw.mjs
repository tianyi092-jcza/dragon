// Independent bounded KI execution of A12A→C3B8/C4A6→D9D1/E41B, no call stubs.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {OriginalBattleSession} from '../web/src/game/battle/originalsession.js';
const fixtures=[];
for(const counter of [0x2b,0xfffe]) {
  const next=(counter&0xff00)|((counter+1)&255);
  for(const a of [next,0x11b,0x11c,0xffff])for(const b of [next,0x11b,0x11c,0xffff])
  for(const c of [next,0x11b,0x11c,0xffff])fixtures.push({counter,markers:[a,b,c]});
}
for(const counter of [0xff,0x11a,0x11b,0x12ff,0xffff]) {
  const next=(counter&0xff00)|((counter+1)&255);
  fixtures.push({counter,markers:[next,next,next]});
  fixtures.push({counter,markers:[0xabcd,next,0x11c]});
}
const result=spawnSync('python',['-B','tools/tactical_message_raw_oracle.py'],{
  input:JSON.stringify(fixtures),encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000,
});
assert.equal(result.status,0,result.stderr);
let raw;
try {
  raw = JSON.parse(result.stdout);
} catch (error) {
  throw new Error("invalid tactical message oracle JSON", { cause: error });
}
for(let i=0;i<fixtures.length;i++) {
  const f=fixtures[i],oracle=raw[i];
  const s=new OriginalBattleSession({registers:{tacticalFrameCounter:f.counter,
    side0MarkerAt:f.markers[0],side1MarkerAt:f.markers[1],wallMarkerAt:f.markers[2],side0Active:1,side1Active:1}});
  const rng=s.rng.snapshot();const frame=s.tick();
  assert.equal(s.registers.tacticalFrameCounter,oracle.counter);
  assert.deepEqual([s.registers.side0MarkerAt,s.registers.side1MarkerAt,s.registers.wallMarkerAt],oracle.markers,JSON.stringify(f));
  const closes=frame.events.filter(e=>e.type==='side-marker'||e.type==='wall-marker').map(e=>e.type==='wall-marker'?2:e.side);
  assert.deepEqual(closes,oracle.closes,JSON.stringify(f));assert.deepEqual(s.rng.snapshot(),rng);
}
const same=raw[0];assert.deepEqual(same.closes,[0]);
assert.deepEqual(same.trace,[[0xa133,0x2c],[0xa13f,0x11b],[0xa14b,0x11b],[0xa155,0x11b]]);
const cascade=fixtures.findIndex(f=>f.counter===0x2b&&f.markers[0]===0x2c&&f.markers[1]===0x11b&&f.markers[2]===0x11c);
assert.deepEqual(raw[cascade].closes,[0,1,2]);
assert.deepEqual(raw[cascade].trace,[[0xa133,0x2c],[0xa13f,0x11b],[0xa14b,0x11c],[0xa155,0x11c]]);
// Simultaneous messages: restore between the side0 expiry and side1's deferred
// cycle. No compensation close and no extra rule or RNG tick on restore.
{
  const s=new OriginalBattleSession({registers:{side0Active:1,side1Active:1}});
  s.emitTalk(0,0x1b7,'lifetime');s.emitTalk(1,0x1b8,'lifetime');
  for(let i=0;i<60;i++)s.tick();assert.equal(s.messages.slots[0],null);assert.ok(s.messages.slots[1]);
  const snap=s.snapshot(),twin=new OriginalBattleSession();twin.restore(snap);
  for(let i=0;i<255;i++){s.tick();twin.tick();assert.ok(s.messages.slots[1]);}
  s.tick();twin.tick();assert.equal(s.messages.slots[1],null);assert.deepEqual(s.snapshot(),twin.snapshot());
}
console.log(`message raw AX OK: ${fixtures.length} no-stub bounded KI comparisons, same-deadline suppression/011B-011C cascade/wall/FFFF/lowbyte and deferred restore continuation`);
