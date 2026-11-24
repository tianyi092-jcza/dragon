// Grid 持续接触发声规则：首触静默、等待中重复发声（复刻原生 wait 语义）。
// 用法：node --test tools/verify_grid_march_sound.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGridMarchContact } from '../web/src/game/ai.js';
import { bindLegionSlotCounter } from '../web/src/game/legionphase.js';

function makeWorld() {
  const diplomacy = [];
  diplomacy[3] = []; diplomacy[3][7] = 0x10;
  diplomacy[7] = []; diplomacy[7][3] = 0x10;
  const sc = {
    player_faction: 0,
    factions: [{ idx: 0 }, { idx: 3 }, { idx: 7 }],
    cities: [{ idx: 0, faction: 3, x: 0, y: 0 }, { idx: 1, faction: 7, x: 4, y: 0 }],
    legions: [],
    diplomacy,
    legionSlotCounters: Array(128).fill(0),
  };
  sc.legionSlotCounters[5] = 12;
  const A = { slot: 5, faction: 3, status: 0x80, x: 0, y: 0, moveDelay: 1, movePeriod: 3 };
  bindLegionSlotCounter(sc, A);
  sc.legions.push(A);
  const sounds = [];
  const app = { scenario: sc, engagementFx: { requestSound: () => sounds.push('sfx') } };
  const siege = () => Object.assign(new RangeError('Grid march contact unresolved'), { endpoint: 1 });
  return { sc, A, app, sounds, siege };
}

test('攻城接触：首触静默，持续等待重复发声', () => {
  const { A, app, sounds, siege } = makeWorld();
  assert.equal(resolveGridMarchContact(app, A, siege()), 'waiting');
  assert.deepEqual(sounds, []);
  assert.equal(resolveGridMarchContact(app, A, siege()), 'waiting');
  assert.deepEqual(sounds, ['sfx']);
  assert.equal(resolveGridMarchContact(app, A, siege()), 'waiting');
  assert.deepEqual(sounds, ['sfx', 'sfx']);
});

test('野战接触：同规则（首触静默＋重复发声）', () => {
  const { sc, A, app, sounds } = makeWorld();
  sc.legions.push({ slot: 6, faction: 7, x: 5, y: 5, dead: false });
  A.x = 5; A.y = 5;
  const field = () => Object.assign(new RangeError('Grid field contact unresolved'), { point: { x: 5, y: 5 } });
  assert.equal(resolveGridMarchContact(app, A, field()), 'waiting');
  assert.deepEqual(sounds, []);
  assert.equal(resolveGridMarchContact(app, A, field()), 'waiting');
  assert.deepEqual(sounds, ['sfx']);
});
