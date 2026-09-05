// 地图视图 — 相机(拖动平移, 固定100%不可缩放) + 分层绘制(地形/城池/军团/标签)
import { WORLD, factionColorEx } from "../game/world.js";
import { findRoadRoute, roadGraphReady } from "../game/roadgraph.js";

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
const CITY_CORE = 12; // 据点中心建筑尺寸（正方形填充区 / 拾取范围）
const CURSOR_SIZE = 18; // 游戏光标：较原20px圆角方框缩小2px
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

  /** 获取军团插值渲染位置 (支持 lerp 平滑移动与道路轴向显示补偿) */
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

    // 地图上独立显示的活动军团（含战后冷却/状态机等待）都可点击。
    // 驻在同势力据点中心的军团仍由上方据点入口打开驻军选择。
    const t = this.app?.clock?.dayProgress?.() ?? 1;
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

    // KI.EXE 0x2AF4先扫描status bit5并由0x2B3C画接战图，随后第二轮
    // 才由0x2B2A画军团标识；两者都读取军团+0x10/+0x12同一城前坐标。
    const t = this.app?.clock?.dayProgress?.() ?? 1;
    for (const L of sc.legions) {
      if (L.dead || L._active === false || L.faction == null) continue;
      const engageFrame = L._engagement?.countdown;
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
      if (lx < -60 || ly < -40 || lx > cv.width + 60 || ly > cv.height + 40)
        continue;

      const faction = sc.factions.find((f) => f.idx === L.faction);
      const markerStyle = faction?.march_marker_style ?? L.faction;
      if (L._engagement) {
        this._drawMarchingIcon(ctx, lx, ly, markerStyle, renderPos.frame);
      } else if (L.target) {
        // Web诊断表现：恢复行军路线虚线，便于直接核对道路点列与地图美术
        // 中线。路径只读规则层导航状态，绝不在绘制时回写军团缓存。
        let path = L._path ?? [];
        if (!path.length && roadGraphReady()) {
          path = findRoadRoute(L.x, L.y, L.target.x, L.target.y)?.points ?? [];
        }
        ctx.strokeStyle = factionColorEx(sc, L.faction);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        const routePoints = [];
        if (renderPos.isMoving && renderPos.curT < 1) {
          routePoints.push({ x: L.x, y: L.y });
        }
        routePoints.push(...path);
        if (
          !path.length &&
          (L.x !== L.target.x || L.y !== L.target.y) &&
          !routePoints.some(
            (point) => point.x === L.target.x && point.y === L.target.y,
          )
        ) {
          routePoints.push(L.target);
        }
        for (let index = 0; index < routePoints.length; index++) {
          const point = routePoints[index];
          const previous = routePoints[index - 1] ?? { x: L.x, y: L.y };
          const next = routePoints[index + 1] ?? point;
          const [offsetX, offsetY] = roadVisualOffset(
            previous.x,
            previous.y,
            next.x,
            next.y,
          );
          ctx.lineTo(
            this.sx(point.x * 16 + 8 + offsetX),
            this.sy(point.y * 16 + 8 + offsetY),
          );
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // 行军标识：势力记录 +0x3E 指定固定样式槽，方向选离散原版帧。
        this._drawMarchingIcon(ctx, lx, ly, markerStyle, renderPos.frame);
      } else {
        // 活动军团即使在节点等待状态机写入下一目标，也仍使用原版驻止帧。
        // 小圆点不是MMAP.MCH资产，会掩盖撤退目标/道路状态丢失并造成假坐标。
        this._drawStationaryMarker(ctx, lx, ly, markerStyle);
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
