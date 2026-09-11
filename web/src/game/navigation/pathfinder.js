// ── 路网寻路: road_cost.bin (384×256 uint8, 1=可走/0=不可走) + A* 8向 ──
// 路网由 tools 从地图 tile 实证提取: 奶油线贯穿 tile(43种) + 桥(180) + 城关(205/208/211)
// + 水路(95/202) + 补丁格(83个缺口修复格)；192/192 城连通；军团严格沿路网行军，不下道。
// road_offset.json: 各线路 tile 的道路线质心偏移(像素)，供渲染层把虚线/标识贴在道路线上。
// 第三方未开战势力占据的格子视为堵路 (isBlocked 回调)，全堵→佯动。

// 旧格网回退仍保留原算法；道路拓扑是战略主路径，不在本批删除兼容路径。
export function createPathfinder(definition, roads) {
  const W = definition.width,
    H = definition.height;
  // 水域 tile: 水路也是路径但代价极高(原版陆路优先: 许昌-舞阳-汝南走陆路,
  // 水路仅在没有陆路可通时兑底, 如跨长江)
  const WATER = new Set([95, 202]);
  // 城/关 tile: 军团进出城只走正东南西北四门 (原版规则, 不斜进斜出)
  const CITY_TILES = new Set([205, 208, 211]);
  // 关卡 (9 个, 均为南北向两门): 只许南北向直行进出, 不可横向进出/拐弯
  const PASS_V = new Set([
    "195,70", // 壺關
    "202,101", // 汜水關
    "159,104", // 函谷關
    "130,105", // 潼關
    "66,106", // 散關
    "200,106", // 虎牢關
    "64,132", // 陽平關
    "34,135", // 白水關
    "43,142", // 葭萌關
  ]);

  let terrain = null; // Uint8Array(384*256) tile 索引 (保留供地形查询)
  let roadCost = null; // Uint8Array(W*H) 0=不可走, 1=可走
  let roadOff = null; // {tileId: [ox,oy]} 道路线质心偏移

  async function loadTerrain() {
    if (terrain && roadCost) return terrain;
    const [mapRes, costRes, offRes] = await Promise.all([
      fetch(definition.assets.terrain),
      fetch(definition.assets.roadCost),
      fetch(definition.assets.roadOffset),
      roads.loadRoadGraph(),
    ]);
    terrain = new Uint8Array(await mapRes.arrayBuffer());
    roadCost = new Uint8Array(await costRes.arrayBuffer());
    roadOff = await offRes.json();
    return terrain;
  }

  /** MMAP.MAP 原始图块编号；资源未就绪或越界时返回 null。 */
  function terrainTile(x, y) {
    if (!terrain || x < 0 || y < 0 || x >= W || y >= H) return null;
    return terrain[y * W + x];
  }

  /** 该格道路线的质心偏移 [ox,oy] (像素, 相对格中心): 渲染虚线/标识时贴到道路线上 */
  function roadOffset(x, y) {
    if (!terrain || !roadOff || x < 0 || y < 0 || x >= W || y >= H)
      return ZERO_OFF;
    return roadOff[terrain[y * W + x]] || ZERO_OFF;
  }
  const ZERO_OFF = [0, 0];

  function passable(x, y) {
    if (!roadCost || x < 0 || y < 0 || x >= W || y >= H) return false;
    return roadCost[y * W + x] > 0;
  }

  /** 该格允许的行军方向: 关卡只走南北门 / 城只走四门 / 其它 8 向 */
  function gateDirs(x, y) {
    if (PASS_V.has(x + "," + y))
      return [
        [0, -1],
        [0, 1],
      ];
    const t = terrain?.[y * W + x];
    if (CITY_TILES.has(t))
      return [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
    return DIRS.map(([dx, dy]) => [dx, dy]);
  }

  // 8向: 直行代价 1, 斜行 √2 (路网为 8 连通细线, 对角连接合法)
  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  // 二叉小根堆 (f 值排序)
  class Heap {
    constructor() {
      this.a = [];
    }
    push(node) {
      const a = this.a;
      a.push(node);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.a,
        top = a[0],
        last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1,
            r = l + 1;
          let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top;
    }
    get size() {
      return this.a.length;
    }
  }

  /**
   * A* 寻路 (曼哈顿启发), 严格沿路网走 (不下道)。
   * @param isBlocked 可选: (x,y)=>true 表示该格被未开战第三方势力占据(堵路)
   * @returns [{x,y},...] 不含起点、含终点的路径; 起点即终点=[]; 不可达/未装载=null
   */
  function findPath(sx, sy, tx, ty, isBlocked) {
    if (!roadCost) return null;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
    if (sx === tx && sy === ty) return [];
    if (!passable(tx, ty)) return null;
    if (isBlocked && isBlocked(tx, ty)) return null; // 目标本身被三方堵死

    const open = new Heap();
    const gScore = new Float32Array(W * H).fill(Infinity);
    const came = new Int32Array(W * H).fill(-1);
    const closed = new Uint8Array(W * H);
    const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
    const si = sy * W + sx;
    gScore[si] = 0;
    open.push({ i: si, x: sx, y: sy, f: h(sx, sy) });
    const ti = ty * W + tx;
    let guard = W * H * 2; // 防病态地图死循环

    while (open.size && guard-- > 0) {
      const cur = open.pop();
      if (cur.i === ti) {
        // 回溯路径
        const path = [];
        let i = ti;
        while (i !== si && i >= 0) {
          path.push({ x: i % W, y: (i / W) | 0 });
          i = came[i];
        }
        return path.reverse();
      }
      if (closed[cur.i]) continue;
      closed[cur.i] = 1;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cur.x + dx,
          ny = cur.y + dy;
        if (!passable(nx, ny)) continue;
        if (isBlocked && isBlocked(nx, ny)) continue; // 未开战第三方势力堵路
        const ni = ny * W + nx;
        if (closed[ni]) continue;
        // 城/关只许正向门进出: 斜向移动的两端任一是城则禁止
        if (dx !== 0 && dy !== 0) {
          if (CITY_TILES.has(terrain[cur.i]) || CITY_TILES.has(terrain[ni]))
            continue;
        }
        // 关卡只许南北两门: 横向移动的两端任一是关卡则禁止
        if (dy === 0) {
          if (PASS_V.has(cur.x + "," + cur.y) || PASS_V.has(nx + "," + ny))
            continue;
        }
        // 代价: 陆路=1, 水=3(航行)
        const cellCost = WATER.has(terrain[ni]) ? 3 : 1;
        let g = gScore[cur.i] + cost * cellCost;
        // 水陆过渡费: 入水/出水各+40 (原版过河须走桥, 防止把1格小河当捷径;
        // 桥面板=陆路连续格不受影响; 跨江等无陆路时水路仍可达)
        if (WATER.has(terrain[cur.i]) !== WATER.has(terrain[ni])) g += 40;
        if (g < gScore[ni]) {
          gScore[ni] = g;
          came[ni] = cur.i;
          open.push({ i: ni, x: nx, y: ny, f: g + h(nx, ny) });
        }
      }
    }
    return null; // 不可达 (目标被水隔断且无陆桥)
  }

  return { loadTerrain, terrainTile, roadOffset, passable, gateDirs, findPath };
}
