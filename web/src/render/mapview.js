// 地图视图 — 相机(拖动平移, 固定100%不可缩放) + 分层绘制(地形/城池/军团/标签)
import { WORLD } from "../game/world.js";

const MARCH_STYLE_COUNT = 24;
const MARCH_FRAME_STATIONARY = 4;
// 0x25A3每次主更新扫描16/128个军团槽；同一槽每8次战略更新轮到一次。
// Canvas把单个道路点的位移铺满这8个更新间隔，最高速也至少约100ms/步，
// 只加快每步动画而不会在一个显示帧内跳过道路点。
const LEGION_SLOT_CYCLE_TICKS = 8;
const _marchMarkerCache = new Map(); // "style:frame" -> {img, ok}
const _engageMarkerCache = new Map(); // frame -> {img, ok, promise}
const _weatherCloudCache = new Map(); // phase -> {img, ok, promise}
const _disasterObjectCache = new Map(); // "group:phase" -> {img, ok, promise}
const WEATHER_CLOUD_FRAMES = 8;
const WEATHER_CLOUD_WIDTH = 256;
const WEATHER_CLOUD_HEIGHT = 144;
const DISASTER_OBJECT_FRAMES = 8;
const DISASTER_OBJECT_SIZE = 80;
const DISASTER_OBJECT_ASSET = Object.freeze({ 1: "fire", 2: "riot" });

/** 原版 MMAP.MCH 军团标识：势力样式槽 × 西/东/北/南/驻止帧。 */
function getMarchMarkerImage(style, frame, onReady) {
  const safeStyle =
    (((Number(style) || 0) % MARCH_STYLE_COUNT) + MARCH_STYLE_COUNT) %
    MARCH_STYLE_COUNT;
  const safeFrame = Math.max(0, Math.min(MARCH_FRAME_STATIONARY, frame | 0));
  const key = `${safeStyle}:${safeFrame}`;
  let entry = _marchMarkerCache.get(key);
  if (entry) return entry.ok ? entry.img : null;

  entry = { img: new Image(), ok: false };
  _marchMarkerCache.set(key, entry);
  entry.img.onload = () => {
    entry.ok = true;
    onReady?.();
  };
  entry.img.src =
    `grf/march_markers/style_${String(safeStyle).padStart(2, "0")}` +
    `_frame_${safeFrame}.png`;
  return null;
}

/** KI.EXE 0x2B3C：group 0 的四相 48×48 接敌/攻城动画。 */
function engageMarkerEntry(frame, onReady) {
  const safeFrame = frame & 3;
  let entry = _engageMarkerCache.get(safeFrame);
  if (entry) return entry;
  let settle;
  entry = {
    img: new Image(),
    ok: false,
    promise: new Promise((resolve) => {
      settle = resolve;
    }),
  };
  _engageMarkerCache.set(safeFrame, entry);
  entry.img.onload = () => {
    entry.ok = true;
    onReady?.();
    settle();
  };
  entry.img.onerror = () => {
    onReady?.();
    settle();
  };
  entry.img.src = `grf/engage/group_0_frame_${safeFrame}.png`;
  return entry;
}

function getEngageMarkerImage(frame, onReady) {
  const entry = engageMarkerEntry(frame, onReady);
  return entry.ok ? entry.img : null;
}

/** 四相全部完成加载（失败也视为已准备），避免动画开始后首帧缺图。 */
export function preloadEngageMarkerImages(onReady) {
  return Promise.all(
    [0, 1, 2, 3].map((frame) => engageMarkerEntry(frame, onReady).promise),
  );
}

/** KI.EXE 0x2533 + CS:0x985A：group0雨云的八相原始MMAP.MCH复合图。 */
function weatherCloudEntry(frame, onReady) {
  const safeFrame = frame & 7;
  let entry = _weatherCloudCache.get(safeFrame);
  if (entry) return entry;
  let settle;
  entry = {
    img: new Image(),
    ok: false,
    promise: new Promise((resolve) => {
      settle = resolve;
    }),
  };
  _weatherCloudCache.set(safeFrame, entry);
  entry.img.onload = () => {
    entry.ok = true;
    onReady?.();
    settle();
  };
  entry.img.onerror = () => {
    onReady?.();
    settle();
  };
  entry.img.src = `grf/weather/cloud_frame_${safeFrame}.png`;
  return entry;
}

function getWeatherCloudImage(frame, onReady) {
  const entry = weatherCloudEntry(frame, onReady);
  return entry.ok ? entry.img : null;
}

/** 八相全部预载；其中5/6/7按原表分别复用0/1/2的源位图。 */
export function preloadWeatherCloudImages(onReady) {
  return Promise.all(
    Array.from(
      { length: WEATHER_CLOUD_FRAMES },
      (_, frame) => weatherCloudEntry(frame, onReady).promise,
    ),
  );
}

/** KI.EXE 0x2533：group1大火、group2暴动均为5×5 tile、八相。 */
function disasterObjectEntry(group, frame, onReady) {
  const safeGroup = Number(group) | 0;
  const asset = DISASTER_OBJECT_ASSET[safeGroup];
  if (!asset) return null;
  const safeFrame = frame & 7;
  const key = `${safeGroup}:${safeFrame}`;
  let entry = _disasterObjectCache.get(key);
  if (entry) return entry;
  let settle;
  entry = {
    img: new Image(),
    ok: false,
    promise: new Promise((resolve) => {
      settle = resolve;
    }),
  };
  _disasterObjectCache.set(key, entry);
  entry.img.onload = () => {
    entry.ok = true;
    onReady?.();
    settle();
  };
  entry.img.onerror = () => {
    onReady?.();
    settle();
  };
  entry.img.src = `grf/disaster/${asset}_frame_${safeFrame}.png`;
  return entry;
}

function getDisasterObjectImage(group, frame, onReady) {
  const entry = disasterObjectEntry(group, frame, onReady);
  return entry?.ok ? entry.img : null;
}

/** 预载大火/暴动共16个逻辑相位，避免事件出现时首帧空白。 */
export function preloadDisasterObjectImages(onReady) {
  const pending = [];
  for (const group of [1, 2]) {
    for (let frame = 0; frame < DISASTER_OBJECT_FRAMES; frame++) {
      pending.push(disasterObjectEntry(group, frame, onReady).promise);
    }
  }
  return Promise.all(pending);
}

/** KI.EXE 0x2808: 0=西、1=东、2=北、3=南；到达/驻止为4。 */
function marchFrame(fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (!dx && !dy) return MARCH_FRAME_STATIONARY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 0 : 1;
  return dy < 0 ? 2 : 3;
}

/**
 * Web道路美术映射。连续截图夹逼校正：竖路右移2px；横路下移2px
 * 仍偏上、下移4px又偏下，故取像素中点3px。斜向按两轴分量过渡。
 */
function roadVisualOffset(fromX, fromY, toX, toY) {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  const span = dx + dy;
  if (!span) return [0, 0];
  return [(2 * dy) / span, (3 * dx) / span];
}

const CITY_SIZE = 16; // 城池图标整体尺寸
const CURSOR_SIZE = 18; // 游戏光标：较原20px圆角方框缩小2px
const CURSOR_RADIUS = 3;
const SNAP_INTERSECT_RADIUS = 17; // 光标(18×18)与据点/军团图标(16×16) AABB相交半距: (18/2 + 16/2) = 17

// 據點图标 (用户从原版提取): 我方=红心 / 其它势力=蓝 / 空城=土黄
const cityIcons = {};
function cityIcon(kind) {
  if (!cityIcons[kind]) {
    const im = new Image();
    im.src = `grf/ui/icon-${kind}_city.png`;
    cityIcons[kind] = im;
  }
  return cityIcons[kind];
}

export class MapView {
  constructor(canvas, scenarioGetter) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.getScenario = scenarioGetter;
    this.cam = { x: 0, y: 0, scale: 1 };
    this.seasonImg = null; // 当前地形 Image（由外部 setSeason 设置）
    this.hoverTarget = null; // 当前悬停的地图对象 {type:'city'|'legion', ...}
    this.rawPointer = null; // 真实物理鼠标位置 { x, y }
    this.pointer = null; // 原版风格Canvas光标的屏幕位置；不属于规则状态
    this.snapState = null; // 当前光标吸附状态: { target, key, x, y }
    this.selectedCity = null; // 当前选中的据点对象（中心显示正方形光标边框）
    this.selectedFaction = null; // 图例选中的势力 idx 或 null
    this._canvasSize = null;
  }

  /**
   * CSS像素仍是全部地图/输入坐标的单位；仅在视口或DPR变化时重置
   * backing store。反复写canvas.width/height会清空并重新分配位图，不能
   * 放在每一帧draw中。
   */
  syncCanvasSize() {
    const width = Math.max(
      1,
      Math.floor(
        Number(globalThis.innerWidth) ||
          Number(this.cv.clientWidth) ||
          Number(this.cv.width) ||
          1,
      ),
    );
    const height = Math.max(
      1,
      Math.floor(
        Number(globalThis.innerHeight) ||
          Number(this.cv.clientHeight) ||
          Number(this.cv.height) ||
          1,
      ),
    );
    const dpr = Math.max(1, Number(globalThis.devicePixelRatio) || 1);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    const unchanged =
      this._canvasSize?.width === width &&
      this._canvasSize?.height === height &&
      this._canvasSize?.dpr === dpr &&
      this.cv.width === pixelWidth &&
      this.cv.height === pixelHeight;
    if (unchanged) return this._canvasSize;

    this.cv.width = pixelWidth;
    this.cv.height = pixelHeight;
    this.ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this._canvasSize = { width, height, dpr };
    return this._canvasSize;
  }

  fit() {
    // 固定 100% 显示, 居中并钳制在地图范围内
    this.cam.scale = 1;
    this.clampCam();
  }

  sx(wx) {
    return this.cam.x + wx * this.cam.scale;
  }
  sy(wy) {
    return this.cam.y + wy * this.cam.scale;
  }
  wx(px) {
    return (px - this.cam.x) / this.cam.scale;
  }
  wy(py) {
    return (py - this.cam.y) / this.cam.scale;
  }

  /** 更新Canvas自绘光标位置；返回是否有可见变化。
   *  当正方形光标(18×18)与据点中心图标(16×16)或活动军团图标(16×16)相交时，
   *  自动吸附使光标定位在对象中心上。自动吸附只一次，军团移动不跟随。
   */
  setPointer(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const changed = this.pointer !== null || this.snapState !== null;
      this.rawPointer = null;
      this.pointer = null;
      this.snapState = null;
      return changed;
    }

    this.rawPointer = { x, y };

    // 如果鼠标处于普通 UI 区域（工具栏/弹窗等），不执行地图对象吸附
    // 出征目标据点选择阶段允许在大地图上吸附据点
    const gamebar = this.app?.gamebar;
    const isChoosingMarchCity =
      gamebar?.marchingOrder && !gamebar?.orderChoiceMenu;
    const inUi = !isChoosingMarchCity && (gamebar?.hitTest?.(x, y) ?? false);

    if (inUi) {
      this.snapState = null;
      const previous = this.pointer;
      this.pointer = { x, y };
      return previous?.x !== x || previous?.y !== y;
    }

    const radius = SNAP_INTERSECT_RADIUS;

    // 若当前已吸附：检查物理鼠标是否已脱离当前吸附区域
    if (this.snapState) {
      const dx = Math.abs(x - this.snapState.x);
      const dy = Math.abs(y - this.snapState.y);
      if (dx <= radius && dy <= radius) {
        // 物理鼠标仍在当前吸附区内：保持吸附在目标触发点，光标不随鼠标微移，军团移动不跟随
        const previous = this.pointer;
        this.pointer = { x: this.snapState.x, y: this.snapState.y };
        return previous?.x !== this.pointer.x || previous?.y !== this.pointer.y;
      }
      // 物理鼠标已移出相交区：解除吸附
      this.snapState = null;
    }

    // 检查是否有相交的据点或军团图标
    const hit = this.findIntersectingTarget(x, y);
    if (hit) {
      // 触发自动吸附！仅吸附一次并固定在触发时的中心坐标 (hit.x, hit.y)
      this.snapState = {
        target: hit.target,
        key: hit.key,
        x: hit.x,
        y: hit.y,
      };
      const previous = this.pointer;
      this.pointer = { x: hit.x, y: hit.y };
      return previous?.x !== hit.x || previous?.y !== hit.y;
    }

    // 未相交：使用物理鼠标位置
    const previous = this.pointer;
    this.pointer = { x, y };
    return previous?.x !== x || previous?.y !== y;
  }

  /**
   * 检查屏幕坐标 (px, py) 处的光标 (18×18) 是否与据点中心图标 (16×16) 或活动军团图标 (16×16) 相交。
   * 相交阈值: (18/2 + 16/2) = 17 像素。
   * 包含据点内有军团（驻军）的情况。
   * 优先级: 据点中心建筑 > 行军中的军团。若同类有多个相交，取中心距离最近者。
   */
  findIntersectingTarget(px, py) {
    const sc = this.getScenario();
    if (!sc) return null;
    const radius = SNAP_INTERSECT_RADIUS;

    // 1. 据点中心建筑（含驻军旗帜/各势力据点/空城）
    let bestCity = null;
    let bestCityDist = Infinity;
    for (const c of sc.cities) {
      const [wxp, wyp] = this.cityPixel(c);
      const cx = this.sx(wxp);
      const cy = this.sy(wyp);
      const dx = Math.abs(px - cx);
      const dy = Math.abs(py - cy);
      if (dx <= radius && dy <= radius) {
        const dist = dx * dx + dy * dy;
        if (dist < bestCityDist) {
          bestCityDist = dist;
          bestCity = {
            target: { type: "city", city: c },
            key: `city_${c.idx}`,
            x: cx,
            y: cy,
          };
        }
      }
    }
    if (bestCity) return bestCity;

    // 2. 地图上独立显示的活动军团（非同势力驻军）
    const t = this.app?.clock?.dayProgress?.() ?? 1;
    let bestLegion = null;
    let bestLegionDist = Infinity;
    for (const L of sc.legions) {
      if (L.dead || L._active === false || L.faction == null) continue;
      const isGarrison =
        !this.isMarching(L) &&
        sc.cities.some(
          (city) =>
            city.x === L.x && city.y === L.y && city.faction === L.faction,
        );
      if (isGarrison) continue;
      const pos = this.getLegionRenderPos(L, t);
      const lx = pos.sx;
      const ly = pos.sy;
      const dx = Math.abs(px - lx);
      const dy = Math.abs(py - ly);
      if (dx <= radius && dy <= radius) {
        const dist = dx * dx + dy * dy;
        if (dist < bestLegionDist) {
          bestLegionDist = dist;
          bestLegion = {
            target: { type: "legion", legion: L },
            key: `legion_${L.idx}`,
            x: lx,
            y: ly,
          };
        }
      }
    }
    return bestLegion;
  }

  /** 相机钳制: 地图四边不得越出屏幕 (拖到边即停, 不留黑边) */
  clampCam() {
    const c = this.cam;
    c.x = Math.min(0, Math.max(innerWidth - WORLD.WIDTH, c.x));
    c.y = Math.min(0, Math.max(innerHeight - WORLD.HEIGHT, c.y));
  }

  /** 固定 100%: 缩放已禁用 (保留 API 兑底) */
  zoomAt() {
    this.cam.scale = 1;
    this.clampCam();
  }

  pan(dx, dy) {
    this.cam.x += dx;
    this.cam.y += dy;
    this.clampCam();
    this.snapState = null;
  }

  fitScale() {
    return 1; // 固定 100%
  }

  /** 城池世界坐标 → 世界像素中心 */
  cityPixel(c) {
    return [c.x * 16 + 8, c.y * 16 + 8];
  }

  /** 军团世界坐标 → 世界像素中心 (兼容旧接口) */
  legionPixel(L, t = 1) {
    const pos = this.getLegionRenderPos(L, t);
    return [pos.wxp, pos.wyp];
  }

  /** 获取军团插值渲染位置 (支持 lerp 平滑移动与道路轴向显示补偿) */
  getLegionRenderPos(L, t = 1) {
    const fromX = L.prevX ?? L.x;
    const fromY = L.prevY ?? L.y;
    const toX = L.x;
    const toY = L.y;

    const isMoving = fromX !== toX || fromY !== toY;
    // 规则在军团自身槽被轮到时一次提交一个道路点。表现层以战略更新序号
    // 计算距该次提交经过的批次数，把该点位移连续铺到下一次同槽调度。
    // 这既避免_clock._acc每次归零造成倒跳，也保证最高速仍有多个RAF可见帧。
    const moveSerial = L._renderMoveSerial;
    const currentSerial = this.app?.clock?.strategicTickSerial;
    let curT = 1;
    if (isMoving) {
      if (Number.isInteger(moveSerial) && Number.isInteger(currentSerial)) {
        const elapsedTicks = Math.max(0, currentSerial - moveSerial);
        curT =
          (elapsedTicks + Math.min(1, Math.max(0, t))) /
          LEGION_SLOT_CYCLE_TICKS;
      } else {
        // 旧快照/独立预览没有战略序号时维持单步0..1兼容。
        curT = t;
      }
      curT = Math.min(1, Math.max(0, curT));
    }

    // 1. 世界格点插值
    const gx = fromX + (toX - fromX) * curT;
    const gy = fromY + (toY - fromY) * curT;

    // 2. Web显示映射：连续截图确认水平+2px偏上而+4px偏下，取+3px；
    // 垂直道路右移2px已正确。仅补偿道路法线方向，避免旧tile质心表在弯道
    // 产生-4..+4px逐格摆动；KI规则坐标和沿路进度完全不变。接敌/战后
    // 冷却时坐标不动，需从尚未消费的道路点推导轴向，否则标识会短暂
    // 跳回tile几何中心。
    const pendingPoints =
      L._march?.points?.slice(L._march.pointIndex ?? 0) ?? L._path ?? [];
    const nextVisualPoint = pendingPoints.find(
      (point) => point.x !== toX || point.y !== toY,
    );
    const visualToX = isMoving ? toX : (nextVisualPoint?.x ?? toX);
    const visualToY = isMoving ? toY : (nextVisualPoint?.y ?? toY);
    const [offsetX, offsetY] = roadVisualOffset(
      fromX,
      fromY,
      visualToX,
      visualToY,
    );
    const wxp = gx * 16 + 8 + offsetX;
    const wyp = gy * 16 + 8 + offsetY;

    let frame = MARCH_FRAME_STATIONARY;
    if (isMoving) {
      frame = marchFrame(fromX, fromY, toX, toY);
    } else if (L.target) {
      const nxt =
        L._march?.points?.[L._march.pointIndex] || L._path?.[0] || L.target;
      frame = marchFrame(L.x, L.y, nxt.x, nxt.y);
    }

    return {
      wxp,
      wyp,
      sx: this.sx(wxp),
      sy: this.sy(wyp),
      frame,
      isMoving,
      curT,
    };
  }

  /** 驻守在指定城池的军团（坐标完全重合且不在行军中） */
  garrisonOf(city) {
    const sc = this.getScenario();
    return (
      sc.legions.find(
        (L) =>
          !L.dead &&
          L._active !== false &&
          L.faction != null &&
          L.faction === city.faction &&
          !this.isMarching(L) &&
          L.x === city.x &&
          L.y === city.y,
      ) || null
    );
  }

  /** 军团是否正在行军（有目标或正在跨格移动中） */
  isMarching(L) {
    const isMovingStep =
      (L.prevX != null && L.prevX !== L.x) ||
      (L.prevY != null && L.prevY !== L.y);
    const hasActiveTarget =
      L.target != null && (L.x !== L.target.x || L.y !== L.target.y);
    return L._engagement != null || isMovingStep || hasActiveTarget;
  }

  /** 屏幕坐标拾取地图对象，未命中返回 null
   *  命中优先级：据点中心建筑 > 行军中的军团
   *  支持与光标(18×18)相交吸附区域匹配，确保吸附状态下点击即中。
   */
  pick(px, py) {
    // 优先：若当前处于有效吸附状态，且查询点在该吸附的相交有效范围内，直接返回吸附对象
    if (this.snapState) {
      const dx = Math.abs(px - this.snapState.x);
      const dy = Math.abs(py - this.snapState.y);
      if (dx <= SNAP_INTERSECT_RADIUS && dy <= SNAP_INTERSECT_RADIUS) {
        return this.snapState.target;
      }
    }

    const sc = this.getScenario();
    if (!sc) return null;
    const radius = SNAP_INTERSECT_RADIUS;

    // 据点中心建筑（含驻军/空城）
    let bestCity = null;
    let bestCityDist = Infinity;
    for (const c of sc.cities) {
      const [wxp, wyp] = this.cityPixel(c);
      const x = this.sx(wxp),
        y = this.sy(wyp);
      const dx = Math.abs(px - x);
      const dy = Math.abs(py - y);
      if (dx <= radius && dy <= radius) {
        const dist = dx * dx + dy * dy;
        if (dist < bestCityDist) {
          bestCityDist = dist;
          bestCity = { type: "city", city: c };
        }
      }
    }
    if (bestCity) return bestCity;

    // 地图上独立显示的活动军团（含战后冷却/状态机等待）都可点击。
    // 驻在同势力据点中心的军团仍由上方据点入口打开驻军选择。
    const t = this.app?.clock?.dayProgress?.() ?? 1;
    let bestLegion = null;
    let bestLegionDist = Infinity;
    for (const L of sc.legions) {
      if (L.dead || L._active === false || L.faction == null) continue;
      const isGarrison =
        !this.isMarching(L) &&
        sc.cities.some(
          (city) =>
            city.x === L.x && city.y === L.y && city.faction === L.faction,
        );
      if (isGarrison) continue;
      const pos = this.getLegionRenderPos(L, t);
      const x = pos.sx,
        y = pos.sy;
      const dx = Math.abs(px - x);
      const dy = Math.abs(py - y);
      if (dx <= radius && dy <= radius) {
        const dist = dx * dx + dy * dy;
        if (dist < bestLegionDist) {
          bestLegionDist = dist;
          bestLegion = { type: "legion", legion: L };
        }
      }
    }
    return bestLegion;
  }

  /** 绘制驻止旗帜帧（MMAP.MCH 每个势力样式槽的第 5 张）。 */
  _drawStationaryMarker(ctx, x, y, style) {
    this._drawMarchingIcon(ctx, x, y, style, MARCH_FRAME_STATIONARY);
  }

  /** 绘制 MMAP.MCH 原版 16×16 军团标识，不旋转、不运行时染色。 */
  _drawMarchingIcon(ctx, x, y, style, frame) {
    const img = getMarchMarkerImage(style, frame, () => this.draw());
    if (img) ctx.drawImage(img, Math.round(x) - 8, Math.round(y) - 8);
  }

  _drawEngagement(ctx, x, y, countdown) {
    const img = getEngageMarkerImage(countdown & 3, () => this.draw());
    if (img) ctx.drawImage(img, Math.round(x) - 24, Math.round(y) - 24);
  }

  /** 绘制Canvas游戏光标：1px白色圆角框 + 1px右下黑色投影。 */
  _drawHoverCursor(ctx, x, y) {
    const hs = CURSOR_SIZE / 2;
    ctx.save();
    // 1px 黑色投影（右下偏移 1px）
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(
      x - hs + 1.5,
      y - hs + 1.5,
      CURSOR_SIZE - 1,
      CURSOR_SIZE - 1,
      CURSOR_RADIUS,
    );
    ctx.stroke();
    // 1px 白色主框
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(
      x - hs + 0.5,
      y - hs + 0.5,
      CURSOR_SIZE - 1,
      CURSOR_SIZE - 1,
      CURSOR_RADIUS,
    );
    ctx.stroke();
    ctx.restore();
  }

  draw() {
    const { ctx } = this;
    if (this.app && !this.app.gameStarted) return;
    const { width, height } = this.syncCanvasSize();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#141414";
    ctx.fillRect(0, 0, width, height);

    // 底图
    if (this.seasonImg) {
      ctx.drawImage(
        this.seasonImg,
        this.sx(0),
        this.sy(0),
        WORLD.WIDTH * this.cam.scale,
        WORLD.HEIGHT * this.cam.scale,
      );
    }

    const sc = this.getScenario();
    if (!sc) return;

    // 城池: 建筑图标 + 驻军方块（覆盖中心建筑）
    for (const c of sc.cities) {
      const [wxp, wyp] = this.cityPixel(c);
      const x = this.sx(wxp),
        y = this.sy(wyp);
      if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
      const f = sc.factionOf(c);
      let kind = "empty";
      if (f) {
        kind = f.idx === sc.player_faction ? "player" : "other";
      }
      ctx.drawImage(cityIcon(kind), x - 8, y - 8, CITY_SIZE, CITY_SIZE);

      const g = this.garrisonOf(c);
      if (g) {
        const fac = sc.factions.find(
          (candidate) => candidate.idx === g.faction,
        );
        this._drawStationaryMarker(
          ctx,
          x,
          y,
          fac?.march_marker_style ?? g.faction,
        );
      }

      if (this.selectedFaction != null && f && f.idx === this.selectedFaction) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#fff";
        ctx.strokeRect(x - 9.5, y - 9.5, 19, 19);
      }

      // 标签
      ctx.font = '12px "Noto Serif TC","PMingLiU",serif';
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.75)";
      ctx.strokeText(c.name, x + 14, y);
      ctx.fillStyle = f ? "#efe4c0" : "#b5ac9c";
      ctx.fillText(c.name, x + 14, y);
    }

    // KI.EXE 0x2AF4先扫描status bit5并由0x2B3C画接战图，随后第二轮
    // 才由0x2B2A画军团标识；两者都读取军团+0x10/+0x12同一城前坐标。
    const t = this.app?.clock?.dayProgress?.() ?? 1;
    for (const L of sc.legions) {
      if (L.dead || L._active === false || L.faction == null) continue;
      const engageFrame = this.app?.engagementFx?.frameOf(L);
      if (!Number.isInteger(engageFrame)) continue;
      const pos = this.getLegionRenderPos(L, t);
      this._drawEngagement(ctx, pos.sx, pos.sy, engageFrame);
    }

    // 第二轮绘制军团：接战中只保留标识，不再绘制诊断路线。
    for (const L of sc.legions) {
      if (L.dead || L._active === false || L.faction == null) continue;
      const isGarrison =
        !this.isMarching(L) &&
        sc.cities.some(
          (c) => c.x === L.x && c.y === L.y && c.faction === L.faction,
        );
      if (isGarrison) continue; // 已在城池方块中表现

      const renderPos = this.getLegionRenderPos(L, t);
      const lx = renderPos.sx,
        ly = renderPos.sy;
      if (lx < -60 || ly < -40 || lx > width + 60 || ly > height + 40) continue;

      const faction = sc.factions.find((f) => f.idx === L.faction);
      const markerStyle = faction?.march_marker_style ?? L.faction;
      if (L._engagement || L.target || renderPos.isMoving) {
        // 行军标识：势力记录 +0x3E 指定固定样式槽，方向选离散原版帧。
        this._drawMarchingIcon(ctx, lx, ly, markerStyle, renderPos.frame);
      } else {
        // 活动军团即使在节点等待状态机写入下一目标，也仍使用原版驻止帧。
        // 小圆点不是MMAP.MCH资产，会掩盖撤退目标/道路状态丢失并造成假坐标。
        this._drawStationaryMarker(ctx, lx, ly, markerStyle);
      }
    }

    // 0x2533先按固定槽序画前16个静态对象。group1大火/group2暴动
    // 都是5×5 tile，以对象坐标为中心，故左上为(x-2,y-2)。
    for (const object of (sc.disasterMapObjects ?? []).slice(0, 16)) {
      if (!object || object.active === false) continue;
      const image = getDisasterObjectImage(
        object.group ?? object.kind,
        object.frame ?? 1,
        () => this.draw(),
      );
      if (!image) continue;
      const left = this.sx(((object.x ?? 0) - 2) * WORLD.TILE_PX);
      const top = this.sy(((object.y ?? 0) - 2) * WORLD.TILE_PX);
      const size = DISASTER_OBJECT_SIZE * this.cam.scale;
      if (left >= width || top >= height || left + size <= 0 || top + size <= 0)
        continue;
      ctx.drawImage(image, left, top, size, size);
    }

    // 0x1CC9先画军团、再由0x2533按槽序画通用对象；后16槽雨云
    // 因此覆盖据点、军团和静态灾害。16×9图左上为(x-8,y-4)。
    for (const cloud of sc.weatherClouds ?? []) {
      if (!cloud || cloud.active === false || (cloud.group ?? 0) !== 0)
        continue;
      const image = getWeatherCloudImage(cloud.frame ?? 0, () => this.draw());
      if (!image) continue;
      const left = this.sx(((cloud.x ?? 0) - 8) * WORLD.TILE_PX);
      const top = this.sy(((cloud.y ?? 0) - 4) * WORLD.TILE_PX);
      const cloudWidth = WEATHER_CLOUD_WIDTH * this.cam.scale;
      const cloudHeight = WEATHER_CLOUD_HEIGHT * this.cam.scale;
      if (
        left >= width ||
        top >= height ||
        left + cloudWidth <= 0 ||
        top + cloudHeight <= 0
      )
        continue;
      ctx.drawImage(image, left, top, cloudWidth, cloudHeight);
    }

    // 军团移动不跟随：若当前吸附的是行军军团，检查其是否已完全移出吸附框；
    // 仅当其渲染位置已远离吸附点超过阈值时才自动脱离，恢复物理鼠标位置。
    if (this.snapState && this.snapState.target?.type === "legion") {
      const L = this.snapState.target.legion;
      if (L.dead || L._active === false || L.faction == null) {
        this.snapState = null;
        if (this.rawPointer) this.pointer = { ...this.rawPointer };
      } else {
        const renderPos = this.getLegionRenderPos(L, t);
        const lx = renderPos.sx;
        const ly = renderPos.sy;
        if (
          Math.abs(lx - this.snapState.x) > SNAP_INTERSECT_RADIUS ||
          Math.abs(ly - this.snapState.y) > SNAP_INTERSECT_RADIUS
        ) {
          this.snapState = null;
          if (this.rawPointer) this.pointer = { ...this.rawPointer };
        }
      }
    }

    // 已点击选中的据点保留中心选中框；右键关闭信息弹窗时消失。
    const selCity = this.selectedCity;
    if (selCity) {
      const [wxp, wyp] = this.cityPixel(selCity);
      const cx = this.sx(wxp);
      const cy = this.sy(wyp);
      this._drawHoverCursor(ctx, cx, cy);
    }

    // 悬停据点/军团时只保留鼠标位置的游戏光标；不再在对象中心额外
    // 绘制同款方框，避免两个圆角正方形重叠或并排出现。

    // UI 覆盖层 (工具栏/小地图/资源面板 — GameBar)
    this.overlay?.(ctx);

    // 无论是否命中地图对象，都强制使用同款圆角正方形线框作为游戏光标。
    // 必须最后绘制，确保窗口上也不会露出浏览器默认箭头。
    if (this.pointer)
      this._drawHoverCursor(ctx, this.pointer.x, this.pointer.y);
  }
}
