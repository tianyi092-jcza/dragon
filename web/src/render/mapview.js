// 地图视图 — 相机(拖动平移, 固定100%不可缩放) + 分层绘制(地形/城池/军团/标签)
import { WORLD, factionColorEx } from "../game/world.js";
import { roadOffset } from "../game/pathfind.js";

const MARCH_STYLE_COUNT = 24;
const MARCH_FRAME_STATIONARY = 4;
const _marchMarkerCache = new Map(); // "style:frame" -> {img, ok}
const _engageMarkerCache = new Map(); // frame -> {img, ok, promise}

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

/** KI.EXE 0x2808: 0=西、1=东、2=北、3=南；到达/驻止为4。 */
function marchFrame(fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (!dx && !dy) return MARCH_FRAME_STATIONARY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 0 : 1;
  return dy < 0 ? 2 : 3;
}

const CITY_SIZE = 16; // 城池图标整体尺寸
const CITY_CORE = 12; // 据点中心建筑尺寸（正方形填充区 / 拾取范围）
const CURSOR_SIZE = 20; // 悬停光标（套住中心建筑/行军图标，比原游戏略大）
const CURSOR_RADIUS = 3;

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
    this.pointer = null; // 原版风格Canvas光标的屏幕位置；不属于规则状态
    this.selectedCity = null; // 当前选中的据点对象（中心显示正方形光标边框）
    this.selectedFaction = null; // 图例选中的势力 idx 或 null
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

  /** 更新Canvas自绘光标位置；返回是否有可见变化。 */
  setPointer(x, y) {
    const next = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    const previous = this.pointer;
    if (previous?.x === next?.x && previous?.y === next?.y) return false;
    this.pointer = next;
    return true;
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

  /** 获取军团插值渲染位置 (支持 lerp 平滑移动与道路中线吸附) */
  getLegionRenderPos(L, t = 1) {
    const fromX = L.prevX ?? L.x;
    const fromY = L.prevY ?? L.y;
    const toX = L.x;
    const toY = L.y;

    const isMoving = fromX !== toX || fromY !== toY;
    // 仅在移动逻辑刚发生的同一战略更新内插值。下一帧逻辑尚未更新时
    // 必须保持在新点，不能因_clock._acc从零重新开始而倒跳到上一道路点。
    const moveSerial = L._renderMoveSerial;
    const currentSerial = this.app?.clock?.strategicTickSerial;
    const sameStrategicTick =
      !Number.isInteger(moveSerial) ||
      !Number.isInteger(currentSerial) ||
      moveSerial === currentSerial;
    const curT =
      isMoving && sameStrategicTick ? Math.min(1, Math.max(0, t)) : 1;

    // 1. 世界格点插值
    const gx = fromX + (toX - fromX) * curT;
    const gy = fromY + (toY - fromY) * curT;

    // 2. 道路偏移量插值 (沿道路中心线滑动)
    const [ox0, oy0] = roadOffset(fromX, fromY);
    const [ox1, oy1] = roadOffset(toX, toY);
    const ox = ox0 * (1 - curT) + ox1 * curT;
    const oy = oy0 * (1 - curT) + oy1 * curT;

    // 3. 世界像素坐标
    const wxp = gx * 16 + 8 + ox;
    const wyp = gy * 16 + 8 + oy;

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
   */
  pick(px, py) {
    const sc = this.getScenario();
    if (!sc) return null;
    const half = CITY_CORE / 2;

    // 据点中心建筑（含驻军/空城）
    for (const c of sc.cities) {
      const [wxp, wyp] = this.cityPixel(c);
      const x = this.sx(wxp),
        y = this.sy(wyp);
      if (px >= x - half && px < x + half && py >= y - half && py < y + half) {
        return { type: "city", city: c };
      }
    }

    // 行军中的军团（使用逐帧插值的实际屏幕位置）
    const t = this.app?.clock?.dayProgress?.() ?? 1;
    for (const L of sc.legions) {
      if (L.dead || L._active === false || L.faction == null) continue;
      if (!this.isMarching(L)) continue;
      const pos = this.getLegionRenderPos(L, t);
      const x = pos.sx,
        y = pos.sy;
      if (px >= x - half && px < x + half && py >= y - half && py < y + half) {
        return { type: "legion", legion: L };
      }
    }
    return null;
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

  /** 绘制悬停光标：1px 白色方框 + 1px 右下黑色投影（复刻原版） */
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
    const { ctx, cv } = this;
    if (this.app && !this.app.gameStarted) return;
    cv.width = innerWidth;
    cv.height = innerHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#141414";
    ctx.fillRect(0, 0, cv.width, cv.height);

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
      if (x < -40 || y < -40 || x > cv.width + 40 || y > cv.height + 40)
        continue;
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

    // 军团: 不在城池驻军内则绘制行军图标
    const t = this.app?.clock?.dayProgress?.() ?? 1;
    for (const L of sc.legions) {
      if (L.dead || L._active === false || L.faction == null) continue;
      const isGarrison =
        !this.isMarching(L) &&
        sc.cities.some((c) => c.x === L.x && c.y === L.y);
      if (isGarrison) continue; // 已在城池方块中表现

      const renderPos = this.getLegionRenderPos(L, t);
      const lx = renderPos.sx,
        ly = renderPos.sy;
      if (lx < -60 || ly < -40 || lx > cv.width + 60 || ly > cv.height + 40)
        continue;

      const transition = this.app?.engageTransition;
      if (transition?.active && transition.legion === L) {
        this._drawEngagement(ctx, lx, ly, transition.frame);
      } else if (L._engagement) {
        this._drawEngagement(ctx, lx, ly, L._engagement.countdown);
      } else if (L.target) {
        // 原版大地图只绘制军团标识，不显示通往下一据点的路线虚线。
        // 导航点列仍由规则层维护，渲染层只读取当前位置与方向帧。
        // 行军标识：势力记录 +0x3E 指定固定样式槽，方向选离散原版帧。
        const faction = sc.factions.find((f) => f.idx === L.faction);
        this._drawMarchingIcon(
          ctx,
          lx,
          ly,
          faction?.march_marker_style ?? L.faction,
          renderPos.frame,
        );
      } else {
        // 非驻军且非行军：仅用小圆点占位（正常情况不应出现）
        ctx.fillStyle = factionColorEx(sc, L.faction);
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 选中据点光标（正方形边框显示在据点中心上，右键关闭信息弹窗时消失）
    const selCity = this.selectedCity;
    if (selCity) {
      const [wxp, wyp] = this.cityPixel(selCity);
      const cx = this.sx(wxp);
      const cy = this.sy(wyp);
      this._drawHoverCursor(ctx, cx, cy);
    }

    // 悬停光标（对空城中心建筑和行军军团显示；与已选中据点重合时不重复绘制）
    if (this.hoverTarget) {
      let cx, cy;
      if (this.hoverTarget.type === "city") {
        if (this.hoverTarget.city !== selCity) {
          const [wxp, wyp] = this.cityPixel(this.hoverTarget.city);
          cx = this.sx(wxp);
          cy = this.sy(wyp);
          this._drawHoverCursor(ctx, cx, cy);
        }
      } else {
        const renderPos = this.getLegionRenderPos(this.hoverTarget.legion, t);
        cx = renderPos.sx;
        cy = renderPos.sy;
        this._drawHoverCursor(ctx, cx, cy);
      }
    }

    // UI 覆盖层 (工具栏/小地图/资源面板 — GameBar)
    this.overlay?.(ctx);

    // 无论是否命中地图对象，都强制使用同款圆角正方形线框作为游戏光标。
    // 必须最后绘制，确保窗口上也不会露出浏览器默认箭头。
    if (this.pointer)
      this._drawHoverCursor(ctx, this.pointer.x, this.pointer.y);
  }
}
