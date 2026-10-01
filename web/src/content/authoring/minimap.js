// M1 自动小地图纯生成核心（Web 工程方案，非原版机制）。
// 输入: geographyGrid/staticRoadGeometry/bounds/styleRevision/textureSeed。
// 约束: 确定可复现；不使用 Math.random/时间/游戏规则 RNG；不修改 Scenario。
// 显示类别与规则地形分别建模；此处只消费调用方给定的显式地理 grids。
// 技术合同 §2.4 的参数起点：海岸半径 8 源格、陆地阴影 12/255、纹理 4/255。

export const MINIMAP_STYLE_REVISION = "minimap-style-2-bands-dither";
export const MINIMAP_SIZES = Object.freeze({
  base: Object.freeze({ w: 208, h: 139 }),
  large: Object.freeze({ w: 250, h: 167 }),
});

// 候选配色起点（现 Web 提取/表现资源，非新发现原版色值证明）。
export const MINIMAP_PALETTE = Object.freeze({
  land: [0xf0, 0xd0, 0x90],
  seaA: [0x00, 0x1e, 0x5a],
  seaB: [0x00, 0x02, 0x05],
  river: [0x40, 0x60, 0x40],
  road: [0x40, 0x60, 0x40], // user visual feedback: one ink for roads and visible water
});

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

// Web visual bands + indexed-looking stipple, NOT a DOS generator formula.
// Normalized map coordinates make this shared by all maps; no city/name rules.
function landPixel(x, y, width, height, ox, oy, seed, shade) {
  const nx = x / Math.max(1, width - 1), ny = y / Math.max(1, height - 1);
  const broad = textureNoise(Math.floor(ox / 24), Math.floor(oy / 18), seed) / 30;
  const cool = Math.max(0, Math.min(0.65, (0.55 - ny) * (1.15 - nx * 0.4) + broad));
  const warm = Math.max(0, Math.min(0.85, ny * 0.9 + nx * 0.2 + broad));
  const pale = [242, 222, 156], grey = [175, 189, 180], gold = [230, 222, 64];
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(oy & 3) * 4 + (ox & 3)] / 16;
  const grain = textureNoise(ox, oy, seed);
  const pixel = [];
  for (let channel = 0; channel < 3; channel++) {
    const value = (pale[channel] * (1 - cool) + grey[channel] * cool) * (1 - warm) + gold[channel] * warm - shade;
    // Finite color steps and sparse cool/olive flecks instead of uniform blur.
    let speck = 0;
    if (grain === -4) speck = ny < 0.45 ? -28 : -18;
    pixel[channel] = Math.max(0, Math.min(255, Math.floor((value + speck) / 16 + bayer) * 16));
  }
  return pixel;
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
        const alt = (ox + oy) & 1;
        const base = alt === 0 ? MINIMAP_PALETTE.seaA : MINIMAP_PALETTE.seaB;
        r = base[0];
        g = base[1];
        b = base[2];
        cls = 1;
      } else {
        // 陆地：平色 + 海岸渐变（变暗） + 居中纹理；整数运算。
        const cx = Math.floor(((sx0 + sx1 - 1) / 2));
        const cy = Math.floor(((sy0 + sy1 - 1) / 2));
        const shade = coastalShade(geography, width, height, cx, cy);
        [r, g, b] = landPixel(cx, cy, width, height, ox, oy, seed, shade);
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
  return { pixels: out, geoMask };
}

// 统一正逆变换：显示框 (bx,by,bw,bh) 与地图像素范围 W=width*16,H=height*16。
// s=min(bw/W,bh/H)；实际图矩形居中；逆变换只接受半开实际矩形，留边不导航。
export function minimapTransform(bounds, displayBox) {
  const W = bounds.width * bounds.tileSize;
  const H = bounds.height * bounds.tileSize;
  const s = Math.min(displayBox.w / W, displayBox.h / H);
  const rw = W * s;
  const rh = H * s;
  const rx = displayBox.x + (displayBox.w - rw) / 2;
  const ry = displayBox.y + (displayBox.h - rh) / 2;
  return Object.freeze({
    scale: s,
    rect: Object.freeze({ x: rx, y: ry, w: rw, h: rh }),
    worldToDisplay(wx, wy) {
      return [rx + wx * s, ry + wy * s];
    },
    displayToWorld(px, py) {
      if (px < rx || py < ry || px >= rx + rw || py >= ry + rh) return null;
      return [(px - rx) / s, (py - ry) / s];
    },
    tileCenterToDisplay(tx, ty, minX = 0, minY = 0) {
      return this.worldToDisplay((tx - minX) * 16 + 8, (ty - minY) * 16 + 8);
    },
  });
}

// 条件性放大选择：完整外框+名牌+安全间距不与实体 UI 相交时用大框，否则回退。
export function pickMinimapBox(available, small = MINIMAP_SIZES.base, large = MINIMAP_SIZES.large) {
  if (available && available.w >= large.w && available.h >= large.h) return large;
  return small;
}
