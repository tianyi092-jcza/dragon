// M2 动态地形只读投影（Web 工程方案，非原版机制）。
// Scenario 是唯一规则地形权威；此处只把 scenario.terrain 相对初始资源的
// 差分投影到大地图绘制，不推进规则、不消费 RNG、不写回创作源/共享缓存。
// 覆盖：易主中心/角块写回（8A1E）、季节切换（调用方换 atlas 即重建）、
// JSON 恢复（scenario 替换即重读）、非整数 DPR（与底图同映射逐块绘制）。

// initialHex: world.terrain.terrainIdentity()（384*256 bytes 的 hex）。
// atlas: 当前季节图集 Image（256 图块 16x16 按行排列，与 chunkedterrain 一致）。
// terrain: 场景装配的只读地形对象（scenarioNativeRoadContext(sc).terrain），
// 含 readTile(x,y)；Scenario 本体不直接持有该字段。
export function drawTerrainOverlay(ctx, {
  atlas,
  terrain,
  initialHex,
  sx,
  sy,
  scale,
  viewW,
  viewH,
  tileSize = 16,
  worldW = 384,
  worldH = 256,
}) {
  if (!atlas || !atlas.complete || atlas.naturalWidth === 0) return 0;
  if (!terrain || typeof terrain.readTile !== "function") return 0;
  if (typeof initialHex !== "string" || initialHex.length !== worldW * worldH * 2) return 0;
  // 可见图块范围（含 1 格边距），只读比较该范围。
  const x0 = Math.max(0, Math.floor((-sx(0)) / (tileSize * scale)) - 1);
  const y0 = Math.max(0, Math.floor((-sy(0)) / (tileSize * scale)) - 1);
  const x1 = Math.min(worldW - 1, Math.ceil((viewW - sx(0)) / (tileSize * scale)) + 1);
  const y1 = Math.min(worldH - 1, Math.ceil((viewH - sy(0)) / (tileSize * scale)) + 1);
  let painted = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      let cur;
      try {
        cur = terrain.readTile(tx, ty);
      } catch {
        continue;
      }
      const init = parseInt(initialHex.slice((ty * worldW + tx) * 2, (ty * worldW + tx) * 2 + 2), 16);
      if (cur === init) continue;
      if (!Number.isInteger(cur) || cur < 0 || cur > 255) continue;
      ctx.drawImage(
        atlas,
        (cur % 16) * 16,
        Math.floor(cur / 16) * 16,
        16,
        16,
        sx(tx * tileSize),
        sy(ty * tileSize),
        tileSize * scale,
        tileSize * scale,
      );
      painted++;
    }
  }
  return painted;
}
