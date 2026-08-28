// 地图视图 — 相机(拖动平移, 固定100%不可缩放) + 分层绘制(地形/城池/军团/标签)
import {
  WORLD,
  factionColorEx,
  contrastText,
  factionMark,
} from "../game/world.js";
import { findPath, roadOffset } from "../game/pathfind.js";

// 行军标识 SVG (势力属性): 文件内 __FC__ 占位符 → 势力色, 按 (文件,颜色) 缓存
const _markCache = new Map(); // key -> {img, ok}
function getMarkImage(file, color, onReady) {
  const key = file + "|" + color;
  let e = _markCache.get(key);
  if (e) return e.ok ? e.img : null;
  e = { img: new Image(), ok: false };
  _markCache.set(key, e);
  e.img.onload = () => {
    e.ok = true;
    onReady?.();
  };
  fetch("grf/ui/" + file)
    .then((r) => r.text())
    .then((t) => {
      e.img.src =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(t.replaceAll("__FC__", color));
    });
  return null;
}

const CITY_SIZE = 16; // 城池图标整体尺寸
const CITY_CORE = 12; // 据点中心建筑尺寸（正方形填充区 / 拾取范围）
const CURSOR_SIZE = 20; // 悬停光标（套住中心建筑/行军图标，比原游戏略大）
const PLAQUE_SIZE = 16; // 驻军标识牌尺寸（无边框，下/右 1px 黑色阴影）

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
    const curT = isMoving ? Math.min(1, Math.max(0, t)) : 1;

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

    // 4. 朝向角度
    let angle = 0;
    if (isMoving) {
      angle = Math.atan2(toY - fromY, toX - fromX);
    } else if (L.target) {
      const path = L._path;
      const nxt = (path && path[0]) || L.target;
      angle = Math.atan2(nxt.y - L.y, nxt.x - L.x);
    }

    return {
      wxp,
      wyp,
      sx: this.sx(wxp),
      sy: this.sy(wyp),
      angle,
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
    return isMovingStep || hasActiveTarget;
  }

  /** 屏幕坐标拾取地图对象，未命中返回 null
   *  命中优先级：据点中心建筑 > 行军中的军团
   */
  pick(px, py) {
    const sc = this.getScenario();
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
      if (L.dead || L.faction == null) continue;
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

  /** 绘制驻军标识牌：势力色 18×18 正方形 + 1px 黑色阴影 + 白色 12px 君主姓 */
  _drawGarrisonSquare(ctx, x, y, color, surname) {
    const hs = PLAQUE_SIZE / 2;

    // 1px 黑色阴影（右下）
    ctx.fillStyle = "#000";
    ctx.fillRect(x - hs + 1, y - hs + 1, PLAQUE_SIZE, PLAQUE_SIZE);

    // 势力色牌面
    ctx.fillStyle = color;
    ctx.fillRect(x - hs, y - hs, PLAQUE_SIZE, PLAQUE_SIZE);

    if (surname) {
      ctx.font = '12px "Noto Serif TC","PMingLiU",serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // 深底白字 / 浅底黑字（依势力色亮度自动判断）
      ctx.fillStyle = contrastText(color);
      ctx.fillText(surname[0], x, y + 0.5);
      ctx.textAlign = "start";
    }
  }

  /** 行军标识 (势力属性 SVG, grf/ui/markN.svg): 凸形尖头朝上, 旋转对齐行进方向; __FC__ 占位贴势力色 */
  _drawMarchingIcon(ctx, x, y, color, file, angle) {
    const img = getMarkImage(file, color, () => this.draw());
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2); // SVG 尖头朝上 → 旋转到行进方向
    if (img) {
      ctx.drawImage(img, -7.5, -7.5, 15, 15);
    } else {
      // SVG 未加载好时兜底: 简单凸形
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-2, -6);
      ctx.lineTo(2, -6);
      ctx.lineTo(2, -2);
      ctx.lineTo(6, -2);
      ctx.lineTo(6, 6);
      ctx.lineTo(-6, 6);
      ctx.lineTo(-6, -2);
      ctx.lineTo(-2, -2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** 绘制悬停光标：1px 白色方框 + 1px 右下黑色投影（复刻原版） */
  _drawHoverCursor(ctx, x, y) {
    const hs = CURSOR_SIZE / 2;
    ctx.save();
    // 1px 黑色投影（右下偏移 1px）
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x - hs + 1.5,
      y - hs + 1.5,
      CURSOR_SIZE - 1,
      CURSOR_SIZE - 1,
    );
    // 1px 白色主框
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x - hs + 0.5,
      y - hs + 0.5,
      CURSOR_SIZE - 1,
      CURSOR_SIZE - 1,
    );
    ctx.restore();
  }

  draw() {
    const { ctx, cv } = this;
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
        const fac = sc.factions.find((fac) => fac.idx === g.faction);
        const surname = fac?.monarch?.trim() || g.leader || "?";
        this._drawGarrisonSquare(
          ctx,
          x,
          y,
          factionColorEx(sc, g.faction),
          surname,
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
      if (L.dead || L.faction == null) continue;
      const isGarrison =
        !this.isMarching(L) &&
        sc.cities.some((c) => c.x === L.x && c.y === L.y);
      if (isGarrison) continue; // 已在城池方块中表现

      const renderPos = this.getLegionRenderPos(L, t);
      const lx = renderPos.sx,
        ly = renderPos.sy;
      if (lx < -60 || ly < -40 || lx > cv.width + 60 || ly > cv.height + 40)
        continue;

      if (L.target) {
        // 行军路线虚线: 沿路网路径, 逐格贴道路线 (从当前插值位置出发)
        let path = L._path;
        if (!path)
          path = L._path = findPath(L.x, L.y, L.target.x, L.target.y) || [];
        ctx.strokeStyle = factionColorEx(sc, L.faction);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(lx, ly);

        // 若当前跨格移动尚未完全走完(curT < 1)，先把线连向本步目标格 (L.x, L.y)
        if (renderPos.isMoving && renderPos.curT < 1) {
          const [tox, toy] = roadOffset(L.x, L.y);
          ctx.lineTo(this.sx(L.x * 16 + 8 + tox), this.sy(L.y * 16 + 8 + toy));
        }

        for (const p of path) {
          const [ox, oy] = roadOffset(p.x, p.y);
          ctx.lineTo(this.sx(p.x * 16 + 8 + ox), this.sy(p.y * 16 + 8 + oy));
        }
        if (!path.length && (L.x !== L.target.x || L.y !== L.target.y))
          ctx.lineTo(
            this.sx(L.target.x * 16 + 8),
            this.sy(L.target.y * 16 + 8),
          );
        ctx.stroke();
        ctx.setLineDash([]);

        // 行军标识 (势力属性 SVG): 凸标尖头对齐行进方向
        this._drawMarchingIcon(
          ctx,
          lx,
          ly,
          factionColorEx(sc, L.faction),
          factionMark(L.faction),
          renderPos.angle,
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
  }
}
