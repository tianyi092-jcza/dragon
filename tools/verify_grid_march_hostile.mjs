// 扩展带宣战直达敌城：入口不再拒收，行军至到场接敌（E8），未宣战仍由 ai 侧拒收。
// 用法：node --test tools/verify_grid_march_hostile.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceGridMarch } from '../web/src/game/navigation/worldgridroads.js';

const PF = 3, FOE = 7;
function world() {
  const tiles = new Map([['0,0', 1]]);
  const key = (x, y) => `${x},${y}`;
  return {
    sc: { cities: [{ idx: 0, faction: PF, x: 0, y: 0 }, { idx: 1, faction: FOE, x: 4, y: 0 }] },
    graph: {
      nodes: [
        { cityIndex: 0, ports: [{ roadIndex: 0, end: 'from' }, null, null, null] },
        { cityIndex: 1, ports: [{ roadIndex: 0, end: 'to' }, null, null, null] },
      ],
      edges: [{ fromCityIndex: 0, toCityIndex: 1, cost: 4, points: [{ x: 1, y: 0, flags: 0 }, { x: 4, y: 0, flags: 2 }] }],
    },
    movement: {
      readTile: (x, y) => tiles.get(key(x, y)) ?? 0,
      writeTile: (x, y, count) => { tiles.set(key(x, y), count); },
    },
  };
}
function army(targetNode) {
  return { targetNode, faction: PF, status: 0, x: 0, y: 0, roadPosition: { kind: 'city', cityIndex: 0 } };
}

test('宣战敌城：入口放行，到场抛带 endpoint 的接触（E8 管线接手）', () => {
  const { sc, graph, movement } = world();
  const A = army(1);
  let outcome;
  try {
    for (let step = 0; step < 6; step++) {
      outcome = advanceGridMarch(sc, A, { graph, movement });
      if (outcome !== 'moved') break;
    }
    assert.fail('expected siege contact, got ' + outcome);
  } catch (error) {
    assert.equal(error.message, 'Grid march contact unresolved');
    assert.equal(error.endpoint, 1);
  }
});

test('非法节点仍沿用旧拒收', () => {
  const { sc, graph, movement } = world();
  assert.throws(() => advanceGridMarch(sc, army(9), { graph, movement }), /friendly destination of the marching faction/);
});
