// M1 自动小地图纯生成核心（Web 工程方案，非原版机制）。style-5 起对照 DOS 原版：陆地杂点、河回绿色、海岸下沉投影。
// 海面纯色对齐内置底图效果。
// 输入: geographyGrid/staticRoadGeometry/bounds/styleRevision/textureSeed。
// 约束: 确定可复现；不使用 Math.random/时间/游戏规则 RNG；不修改 Scenario。
// 显示类别与规则地形分别建模；此处只消费调用方给定的显式地理 grids。
// 技术合同 §2.4 的参数起点：海岸半径 8 源格、陆地阴影 12/255。
// style-3 起纹理项（原 4/255）已退役：textureNoise 保留为确定性工具，渲染不再消费。

export const MINIMAP_STYLE_REVISION = "minimap-style-7-high-coast";
export const MINIMAP_SIZES = Object.freeze({
  base: Object.freeze({ w: 208, h: 139 }),
  large: Object.freeze({ w: 250, h: 167 }),
});

// 候选配色起点（现 Web 提取/表现资源，非新发现原版色值证明）。
export const MINIMAP_PALETTE = Object.freeze({
  land: [0xf0, 0xd0, 0x90],
  seaA: [0x00, 0x1e, 0x5a],
  seaB: [0x00, 0x02, 0x05],
  river: [0x40, 0x60, 0x40], // user 2026-11-24: revert to DOS green rivers
  road: [0x40, 0x60, 0x40], // user visual feedback: one ink for roads and visible water
  coastShadow: [0x80, 0x40, 0x20], // user 2026-11-24: DOS relief underlay tone
});

// DOS 式陆地杂点：哈希半点加深（确定性、seed 稳定），幅度贴原版明暗差。
const GRAIN_DARK = 22;

const COAST_RADIUS = 8;
const LAND_SHADE = 12;
const TEXTURE_AMP = 4;

// 确定性整数坐标哈希（seed 相关），均值居中，不消费规则 RNG。
export function textureNoise(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  // 0..255 均匀，再居中到 [-amp, +amp]
  const v = h % (TEXTURE_AMP * 2 + 1);
  return v - TEXTURE_AMP;
}

// 海岸距离场（Chebyshev， capped at COAST_RADIUS），只在地理掩码内渐变。
export function coastalShade(geography, width, height, x, y) {
  if (geography[y * width + x] !== 0) return 0;
  let nearest = COAST_RADIUS + 1;
  for (let dy = -COAST_RADIUS; dy <= COAST_RADIUS; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -COAST_RADIUS; dx <= COAST_RADIUS; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      if (geography[ny * width + nx] === 1) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d < nearest) nearest = d;
        if (nearest <= 1) return LAND_SHADE;
      }
    }
  }
  if (nearest > COAST_RADIUS) return 0;
  // 越靠近海岸越暗：线性 (1 - d/(R+1)) * amp
  return Math.round(LAND_SHADE * (1 - nearest / (COAST_RADIUS + 1)));
}

// Style-3 平色陆地（Web 产品决定：用户批准对齐内置纯平底图效果）。
// 陆地统一取 MINIMAP_PALETTE.land，仅保留海岸渐变 shade；不再按归一化坐标
// 分冷暖段、不做 Bayer 整量化、不撒噪点，不再有“山脉感”斑块。
// seed 为保留参数（调用兼容），不再影响输出。
function landPixel(shade, grain) {
  const extra = grain ? GRAIN_DARK : 0;
  return MINIMAP_PALETTE.land.map(value => Math.max(0, Math.min(255, value - shade - extra)));
}

// geography: Uint8Array, 0=land, 1=sea, 2=river, 3=lake. River/lake
// retain separate source classes; this style shares their display color.
// roadMask: Uint8Array 同尺寸，1=静态路网（水陆不区分显示，调用方保证连续栅格化）。
export function renderMinimapPixels(geography, roadMask, width, height, outW, outH, seed) {
  const out = new Uint8Array(outW * outH * 3);
  const geoMask = new Uint8Array(outW * outH); // 0 land, 1 sea, 2 water-line
  for (let oy = 0; oy < outH; oy++) {
    const sy0 = Math.floor((oy * height) / outH);
    const sy1 = Math.max(sy0 + 1, Math.floor(((oy + 1) * height) / outH));
    for (let ox = 0; ox < outW; ox++) {
      const sx0 = Math.floor((ox * width) / outW);
      const sx1 = Math.max(sx0 + 1, Math.floor(((ox + 1) * width) / outW));
      let sea = false;
      let water = false;
      let road = false;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const g = geography[sy * width + sx];
          if (g === 1) sea = true;
          else if (g === 2 || g === 3) water = true;
          if (roadMask[sy * width + sx]) road = true;
        }
      }
      let r;
      let g;
      let b;
      let cls = 0;
      if (water) {
        // Q66：重叠取最上方水域——调用方已在 geography 落定；此处只显示分类。
        r = MINIMAP_PALETTE.river[0];
        g = MINIMAP_PALETTE.river[1];
        b = MINIMAP_PALETTE.river[2];
        cls = 2;
      } else if (sea) {
        // Style-3：海面纯色 seaA，与内置底图一致；seaB 保留仅作调色板历史。
        r = MINIMAP_PALETTE.seaA[0];
        g = MINIMAP_PALETTE.seaA[1];
        b = MINIMAP_PALETTE.seaA[2];
        cls = 1;
      } else {
        // 陆地：纯平底色 + 海岸渐变（变暗）；style-5 加哈希杂点贴 DOS 底图质感。
        const cx = Math.floor(((sx0 + sx1 - 1) / 2));
        const cy = Math.floor(((sy0 + sy1 - 1) / 2));
        const shade = coastalShade(geography, width, height, cx, cy);
        [r, g, b] = landPixel(shade, textureNoise(ox, oy, seed ?? 1) > 0);
        cls = 0;
      }
      if (road) {
        // 静态路网最后叠加，细线至少一个输出像素；纹理不盖线。
        r = MINIMAP_PALETTE.road[0];
        g = MINIMAP_PALETTE.road[1];
        b = MINIMAP_PALETTE.road[2];
      }
      const j = (oy * outW + ox) * 3;
      out[j] = r;
      out[j + 1] = g;
      out[j + 2] = b;
      geoMask[oy * outW + ox] = road ? 3 : cls;
    }
  }
  // style-7 海岸继续加高（user 2026-11-26）：海底复制陆形下沉四像素——
  // 纯海像素（非路）且上／左四格内邻陆地时改绘投影色。
  // 河／路／陆像素不动；geoMask 分类不变。
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const i = oy * outW + ox;
      if (geoMask[i] !== 1) continue;
      const upLand = (oy > 0 && geoMask[i - outW] === 0) || (oy > 1 && geoMask[i - outW * 2] === 0) ||
        (oy > 2 && geoMask[i - outW * 3] === 0) || (oy > 3 && geoMask[i - outW * 4] === 0);
      const leftLand = (ox > 0 && geoMask[i - 1] === 0) || (ox > 1 && geoMask[i - 2] === 0) ||
        (ox > 2 && geoMask[i - 3] === 0) || (ox > 3 && geoMask[i - 4] === 0);
      if (!upLand && !leftLand) continue;
      const j = i * 3;
      out[j] = MINIMAP_PALETTE.coastShadow[0];
      out[j + 1] = MINIMAP_PALETTE.coastShadow[1];
      out[j + 2] = MINIMAP_PALETTE.coastShadow[2];
    }
  }
  return { pixels: out, geoMask };
}

// 统一正逆变换：显示框 (bx,by,bw,bh) 与地图像素范围 W=width*16,H=height*16。
// s=min(bw/W,bh/H)；实际图矩形居中；逆变换只接受半开实际矩形，留边不导航。
export function minimapTransform(bounds, displayBox) {
  // MAP-EXT E6: non-uniform scale matches the stretched compiled minimap
  // art (renderMinimapPixels fills outW×outH), so markers stay on the art
  // and tile↔display roundtrips stay exact. Negative NW tiles map inside
  // the rect by origin offset and never wrap to the last column.
  const ts = bounds?.tileSize ?? 16;
  const minX = bounds?.minX ?? 0, minY = bounds?.minY ?? 0;
  const W = bounds.width * ts;
  const H = bounds.height * ts;
  const sx = displayBox.w / W;
  const sy = displayBox.h / H;
  return Object.freeze({
    scaleX: sx,
    scaleY: sy,
    rect: Object.freeze({ x: displayBox.x, y: displayBox.y, w: displayBox.w, h: displayBox.h }),
    worldToDisplay(wx, wy) {
      return [displayBox.x + (wx - minX * ts) * sx, displayBox.y + (wy - minY * ts) * sy];
    },
    displayToWorld(px, py) {
      const lx = px - displayBox.x, ly = py - displayBox.y;
      if (lx < 0 || ly < 0 || lx >= displayBox.w || ly >= displayBox.h) return null;
      return [lx / sx + minX * ts, ly / sy + minY * ts];
    },
    tileCenterToDisplay(tx, ty) {
      return this.worldToDisplay(tx * ts + ts / 2, ty * ts + ts / 2);
    },
  });
}

// 条件性放大选择：完整外框+名牌+安全间距不与实体 UI 相交时用大框，否则回退。
export function pickMinimapBox(available, small = MINIMAP_SIZES.base, large = MINIMAP_SIZES.large) {
  if (available && available.w >= large.w && available.h >= large.h) return large;
  return small;
}
