// 游戏主界面 UI — 顶部工具栏 + 军师子菜单 + 小地图 + 资源面板 + 设置菜单
//
// 布局逆向依据:
//   - tool_bar.png 640×32 原大置于顶部水平居中; 四图标 30×25 烙于栏内
//     模板匹配实测: ico1@(336,3) ico2@(368,3) ico3@(400,3) ico4@(432,3), 32px 步进
//   - 日期区深蓝框 x459..578, 年/月/日金字 x496/529/562, 数字白色补于各字之前
//   - 扇=军师子菜单(進言/人事/財政/編成/軍團/據點/武將/勢力), 旗=资源面板,
//     地图=小地图, 书=设置
//   - 小地图: MMAP.MAP 解码 384×256 与城池网格一致 → 世界数据微缩渲染
//     (minimap.png 160×107 由 map_full.png 1920×1280 NEAREST 缩出), 城点按势力着色,
//     点击导航大地图, 遇袭城点闪烁+警示音
//   - 时钟联动: 仅模态弹窗(進言/列表/存读档)打开时冻结计时, 菜单条/悬停不影响
import { loadImage, portrait } from "../core/assets.js";
import * as cmd from "../game/commands.js";
import * as adv from "../game/advisor.js";
import { quoteFor, quoteForFormation, quoteForIndex } from "../game/talk.js";
import { cityTypeLabel } from "../game/world.js";
import { clickSfx, warnSfx, toggleMute, unlockSfx } from "../core/speaker.js";
import { isFriendly } from "../game/diplomacy.js";
import { factionColorEx } from "../game/world.js";
import { getProjectedFinance } from "../game/economy.js";

const FONT = '16px "Noto Serif TC","PMingLiU",serif';
const DIN = '300 16px "Oswald","Noto Serif TC","PMingLiU",serif';
const NAVY = "#002266";
const GOLD = "#cc8822";
const CREAM = "#ffdd99";
const BEIGE = "#f0d090";

const SUBMENU = [
  "進言",
  "人事",
  "財政",
  "編成",
  "軍團",
  "據點",
  "武將",
  "勢力",
];

export class GameBar {
  constructor(app) {
    this.app = app;
    this.bx = 0; // 工具栏左缘 (窗口宽变化时重算)
    this.miniOpen = false;
    this.resOpen = false;
    this.selFaction = null; // 小地图当前选择查看的势力
    this.submenuOpen = false;
    this.selectedSubmenu = null; // 军师子菜单当前被选项索引 (0..7, 激活时停止计时)
    this.settingsOpen = false;
    this.hoverAct = null;
    this.portraitImg = null;
    this.portraitKey = null;
    this._flashQueue = new Map(); // 正在闪烁的遇袭城: idx -> 开始时间
    this._lastBlinkDraw = 0;
    this.listDialog = null; // 当前 canvas 列表弹窗
    this.generalCard = null; // 武将特长/对白信息弹窗
    this.formationDialog = null; // 部队编成弹窗
    this.formationQuote = null; // 部队编成确认/提示发言弹窗 (武将/军师发言)
    this.cityCard = null; // 左下角据点信息弹窗
    this.baseMenu = null; // 军师子菜单「據點」二级下拉菜单 (首都確認 / 據點一覽)
    this.financeDialog = null; // 军师「財政」弹窗
    this.keypadDialog = null; // 数字输入弹窗 (税率/各兵种征兵数)
    this._assets = Promise.all([
      loadImage("grf/ui/tool_bar.png"),
      loadImage("grf/ui/tool_ico1.png"),
      loadImage("grf/ui/tool_ico2.png"),
      loadImage("grf/ui/tool_ico3.png"),
      loadImage("grf/ui/tool_ico4.png"),
      loadImage("grf/ui/ico_money.png"),
      loadImage("grf/ui/ico_cavalry.png"),
      loadImage("grf/ui/ico_archer.png"),
      loadImage("grf/ui/ico_infantry.png"),
      loadImage("grf/ui/cloud.png"),
      loadImage("grf/ui/frame_sq.png"),
      loadImage("grf/ui/frame_col.png"),
      loadImage("grf/ui/frame_cap.png"),
      loadImage("grf/ui/minimap_roads.png"),
      loadImage("grf/ui/message_npc.png"),
    ]).then(
      ([
        bar,
        i1,
        i2,
        i3,
        i4,
        money,
        cav,
        arc,
        inf,
        cloud,
        sq,
        col,
        cap,
        mbg,
        messageNpc,
      ]) => {
        this.imgs = {
          bar,
          i1,
          i2,
          i3,
          i4,
          money,
          cav,
          arc,
          inf,
          mbg,
          messageNpc,
        };
        this._gf = { cloud, sq, col, cap }; // 金框+云纹 (与弹窗同源资产)
        this.app.view.draw();
      },
    );
  }

  // ── 金框 + 云纹窗 (与 startmenu prompt 同款, 供右侧面板用) ──
  _frame(ctx, ox, oy, wTiles, hTiles) {
    const { sq, col, cap } = this._gf;
    const x = ox,
      y = oy,
      w = wTiles * 16,
      h = hTiles * 16;
    for (const by of [y, y + h - 8])
      for (let px = 8; px < w - 8; px += 8) ctx.drawImage(sq, x + px, by);
    for (const cx of [x, x + w - 8]) {
      ctx.drawImage(cap, cx, y);
      for (let by = y + 8; by < y + h - 8; by += 8) ctx.drawImage(col, cx, by);
      ctx.drawImage(cap, cx, y + h - 8);
    }
  }

  _cloud(ctx, x, y, w, h) {
    ctx.fillStyle = ctx.createPattern(this._gf.cloud, "repeat");
    ctx.fillRect(x, y, w, h);
  }

  // ── 通用窗口构造：金框 + 可选背景（1黑 / 2米黄 / 3云纹）──
  _drawWindow(ctx, ox, oy, wTiles, hTiles, bgStyle = "cloud") {
    this._frame(ctx, ox, oy, wTiles, hTiles);
    const cx = ox + 8,
      cy = oy + 8,
      cw = (wTiles - 1) * 16,
      ch = (hTiles - 1) * 16;
    if (bgStyle === "black") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(cx, cy, cw, ch);
    } else if (bgStyle === "beige") {
      ctx.fillStyle = BEIGE;
      ctx.fillRect(cx, cy, cw, ch);
    } else {
      this._cloud(ctx, cx, cy, cw, ch);
    }
    return { x: cx, y: cy, w: cw, h: ch };
  }

  // ── canvas 列表弹窗 (米黄底 + 黑表头 + 黑字，右键关闭) ──
  openListDialog(opt) {
    this.settingsOpen = false;
    this.cityCard = null;
    if (!this.listDialog) {
      this.app.hud.dialogCount = (this.app.hud.dialogCount ?? 0) + 1;
    }
    this.listDialog = {
      title: opt.title ?? "",
      titleBar: opt.titleBar ?? false,
      header: opt.header ?? [],
      cols: opt.cols ?? [],
      rows: opt.rows ?? [],
      rowH: opt.rowH ?? 16,
      scrollbar: opt.scrollbar ?? "right",
      w: opt.w ?? 432,
      h: opt.h ?? 320,
      x: opt.x ?? "center",
      y: opt.y ?? "center",
      scroll: 0,
      hover: -1,
      selectedRow: -1,
      footer: opt.footer ?? null,
      onPick: opt.onPick ?? null,
      onPickCell: opt.onPickCell ?? null,
    };
    this.layout();
    this._recalcListDialog();
    this.app.view.draw();
  }

  closeListDialog() {
    if (!this.listDialog) return;
    this.closeGeneralCard();
    this.closeFormationDialog();
    this.formationQuote = null;
    this.listDialog = null;
    this.selectedSubmenu = null; // 取消子菜单被选项，恢复未选中状态
    this.app.hud.dialogCount = Math.max(0, (this.app.hud.dialogCount ?? 1) - 1);
    this.syncClock(); // 开始计时
    if (this.app?.view) this.app.view.selectedCity = null;
    this.app.view.draw();
  }

  _recalcListDialog() {
    const d = this.listDialog;
    if (!d) return;
    if (d.x === "center") d.px = this.bx + Math.round((640 - d.w) / 2);
    else d.px = d.x;
    if (d.y === "center") {
      const minY = this.submenuOpen ? 84 : 40;
      d.py = Math.max(minY, Math.round((innerHeight - d.h) / 2));
    } else d.py = d.y;
    d.titleH = d.titleBar ? 20 : 0;
    d.headerH = d.header.length ? 16 : 0;
    d.top = d.titleH + d.headerH;
    d.cap = Math.max(1, Math.floor((d.h - d.top) / d.rowH));
    if (d.footer) {
      d.fw = 480; // 统一为武将弹窗宽度 480px (30 tiles)
      d.fh = 64; // 对齐 16px 框格 (hTiles=5 → 内高 64，外高 80px)
      d.fx = Math.round((innerWidth - d.fw) / 2); // 屏幕水平居中
      d.fy = innerHeight - d.fh - 16; // 屏幕底对齐且与底部保持 8px 间距 (fy-8 = innerHeight-80-8)
    }
    if (this.formationDialog) {
      this.formationDialog.ox = d.px + 128;
      this.formationDialog.oy = d.py + 28;
      if (this.formationQuote) {
        this.formationQuote.ox = this.formationDialog.ox;
        this.formationQuote.oy =
          this.formationDialog.oy +
          (this.formationDialog.hTiles ?? 12) * 16 +
          12;
      }
    }
  }

  _hitListDialog(px, py) {
    const d = this.listDialog;
    if (!d) return false;
    const inList =
      px >= d.px - 8 &&
      px < d.px + d.w + 8 &&
      py >= d.py - 8 &&
      py < d.py + d.h + 8;
    if (inList) return true;
    if (d.footer) {
      return (
        px >= d.fx - 8 &&
        px < d.fx + d.fw + 8 &&
        py >= d.fy - 8 &&
        py < d.fy + d.fh + 8
      );
    }
    return false;
  }

  _hitListDialogClose(_px, _py) {
    // 游戏全量采用右键关闭，无左键关闭按钮
    return false;
  }

  _drawListDialog(ctx) {
    const d = this.listDialog;
    if (!d) return;
    const { px, py, w, h, titleH, top, rowH, cap, header, cols, rows, scroll } =
      d;
    const tw = Math.ceil((w + 16) / 16),
      th = Math.ceil((h + 16) / 16);
    if (this._gf) {
      this._drawWindow(ctx, px - 8, py - 8, tw, th, "beige");
    } else {
      ctx.fillStyle = NAVY;
      ctx.fillRect(px, py, w, h);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
    }
    // 标题（原版权势一览风格：米黄底、黑字、居中）
    if (d.titleBar) {
      ctx.font = FONT;
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000000";
      const tw2 = ctx.measureText(d.title).width;
      ctx.fillText(d.title, px + (w - tw2) / 2, py + titleH / 2);
    }
    // 表头黑带（无表头的双列名单不绘制）
    const hasScrollbar = d.scrollbar === "left" || d.scrollbar === "right";
    const isLeft = d.scrollbar === "left";
    const hx = isLeft ? px + 18 : px;
    const hw = hasScrollbar ? w - 18 : w;
    if (header.length) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(hx, py + titleH, hw, 16);
      ctx.font = FONT;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffffff";
      header.forEach((t, c) => {
        const col = cols[c];
        if (!col) return;
        if (col.align === "right") {
          const tw2 = ctx.measureText(t).width;
          ctx.fillText(t, px + col.x + col.w - tw2, py + titleH + 1);
        } else if (col.align === "center") {
          const tw2 = ctx.measureText(t).width;
          ctx.fillText(t, px + col.x + (col.w - tw2) / 2, py + titleH + 1);
        } else {
          ctx.fillText(t, px + col.x, py + titleH + 1);
        }
      });
    }
    // 行区米黄底顶满至底部
    ctx.fillStyle = BEIGE;
    ctx.fillRect(hx, py + top, hw, h - top);
    // 滚动条 (left / right 模式)
    if (hasScrollbar) {
      const sbx = isLeft ? px + 1 : px + w - 17;
      const sby = py + titleH;
      const sbw = 16;
      const btnH = 16;
      const trackY = sby + btnH;
      const trackH = h - titleH - btnH * 2;

      // 顶端上箭头 ▲
      ctx.fillStyle = "#8aa474";
      ctx.fillRect(sbx, sby, sbw, btnH);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeRect(sbx + 0.5, sby + 0.5, sbw - 1, btnH - 1);
      ctx.fillStyle = "#000000";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▲", sbx + sbw / 2, sby + btnH / 2);

      // 底端下箭头 ▼
      const bby = py + h - btnH;
      ctx.fillStyle = "#8aa474";
      ctx.fillRect(sbx, bby, sbw, btnH);
      ctx.strokeStyle = "#000000";
      ctx.strokeRect(sbx + 0.5, bby + 0.5, sbw - 1, btnH - 1);
      ctx.fillStyle = "#000000";
      ctx.fillText("▼", sbx + sbw / 2, bby + btnH / 2);

      // 轨道深色背景
      ctx.fillStyle = "#2c3e24";
      ctx.fillRect(sbx, trackY, sbw, trackH);
      ctx.strokeStyle = "#1a2616";
      ctx.strokeRect(sbx + 0.5, trackY + 0.5, sbw - 1, trackH - 1);

      // 滑块 (不超过 cap 时填满整个轨道)
      const canScroll = rows.length > cap;
      const thumbH = canScroll
        ? Math.max(16, Math.round(trackH * (cap / rows.length)))
        : trackH;
      const thumbY = canScroll
        ? trackY +
          Math.round((scroll / (rows.length - cap)) * (trackH - thumbH))
        : trackY;

      ctx.fillStyle = "#8aa474";
      ctx.fillRect(sbx + 1, thumbY, sbw - 2, thumbH);
      ctx.strokeStyle = "#000000";
      ctx.strokeRect(sbx + 0.5, thumbY + 0.5, sbw - 1, thumbH - 1);
      // 高光与阴影
      ctx.fillStyle = "#c0dc9e";
      ctx.fillRect(sbx + 1, thumbY + 1, sbw - 2, 1);
      ctx.fillStyle = "#4a6238";
      ctx.fillRect(sbx + 1, thumbY + thumbH - 2, sbw - 2, 1);

      ctx.textAlign = "left"; // 恢复对齐
    }
    // 行数据
    ctx.font = FONT;
    ctx.textBaseline = "top";
    const n = Math.min(rows.length - scroll, cap);
    const oy = Math.floor((rowH - 14) / 2);
    for (let i = 0; i < n; i++) {
      const row = rows[scroll + i];
      const ry = py + top + i * rowH;
      const isSelected = scroll + i === d.selectedRow;
      const isHover = scroll + i === d.hover;
      if (isSelected) {
        ctx.fillStyle = "#4a7828";
        ctx.fillRect(hx, ry, hw, rowH);
      } else if (isHover) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(hx, ry, hw, rowH);
      }
      row.cells.forEach((cell, c) => {
        const col = cols[c];
        if (!col) return;
        const text = typeof cell === "object" && cell !== null ? cell.t : cell;
        let color = "#000000";
        if (isSelected) {
          color = "#e8ff60";
        } else if (typeof cell === "object" && cell !== null && cell.color) {
          color = cell.color;
        }
        ctx.fillStyle = color;
        const isNum = /^\d+$/.test(text);
        ctx.font = isNum ? DIN : FONT;
        const tw2 = ctx.measureText(text).width;
        let tx;
        if (col.align === "right") tx = px + col.x + col.w - tw2;
        else if (col.align === "center") tx = px + col.x + (col.w - tw2) / 2;
        else tx = px + col.x;
        ctx.fillText(text, tx, ry + oy);
      });
    }
    // 底部提示框（黑底 + 金框 + 头像，文字白色）
    if (d.footer && this.imgs?.messageNpc) {
      const { fx, fy, fw, fh } = d;
      const ftw = Math.ceil((fw + 16) / 16),
        fth = Math.ceil((fh + 16) / 16);
      const { x, y, h } = this._drawWindow(
        ctx,
        fx,
        fy,
        ftw,
        fth,
        "black",
      );
      const ph = 64;
      ctx.drawImage(this.imgs.messageNpc, x, y, ph, ph);
      ctx.font = FONT;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffffff"; // ★所有提示弹窗的文字为白色
      const tx = x + ph + 14;
      const maxTextW = Math.max(40, (ftw - 1) * 16 - ph - 28);

      // 自动折行 (Auto-wrap)
      const rawText = String(d.footer.text ?? "");
      const lines = [];
      for (const paragraph of rawText.split("\n")) {
        if (!paragraph) {
          lines.push("");
          continue;
        }
        let cur = "";
        for (const ch of paragraph) {
          const test = cur + ch;
          if (ctx.measureText(test).width > maxTextW && cur.length > 0) {
            lines.push(cur);
            cur = ch;
          } else {
            cur = test;
          }
        }
        if (cur) lines.push(cur);
      }

      const lineH = 20;
      const totalH = lines.length * lineH;
      const startY = y + Math.max(4, Math.floor((h - totalH) / 2));
      lines.forEach((line, li) => {
        ctx.fillText(line, tx, startY + li * lineH);
      });
    }
  }

  // ── 左下角据点信息弹窗（黑底 + 金框 + 城市图） ──
  showCityCard(city) {
    if (this.app?.view) this.app.view.selectedCity = city;
    this.cityCard = {
      city,
      w: 352,
      h: 160,
      img: null,
    };
    this._recalcCityCard();
    const view = String(city.view ?? 0).padStart(2, "0");
    loadImage(`grf/kyo_${view}.png`).then((img) => {
      if (this.cityCard && this.cityCard.city === city) {
        this.cityCard.img = img;
        this.app.view.draw();
      }
    });
    this.app.view.draw();
  }

  closeCityCard() {
    if (!this.cityCard) return;
    if (this.app?.view?.selectedCity === this.cityCard.city) {
      this.app.view.selectedCity = null;
    }
    this.cityCard = null;
    this.app.view.draw();
  }

  /** 驻军据点点击后的选择菜单：據點 / 軍團 (原版 7×3 tiles 垂直下拉) */
  showGarrisonChoice(city, legion) {
    // 关闭可能冲突的弹窗
    this.closeCityCard();
    this.closeLegionCard();
    this.closeListDialog?.();
    if (this.app?.view) this.app.view.selectedCity = city;

    this.choiceDialog = {
      city,
      legion,
      w: 96,
      h: 32,
      wTiles: 7,
      hTiles: 3,
      items: ["據點", "軍團"],
      hover: -1,
    };
    this._recalcChoice();
    this.app.hud.dialogCount = (this.app.hud.dialogCount ?? 0) + 1;
    this.syncClock();
    this.app.view.draw();
  }

  closeChoiceDialog() {
    if (!this.choiceDialog) return;
    if (this.app?.view?.selectedCity === this.choiceDialog.city) {
      this.app.view.selectedCity = null;
    }
    this.choiceDialog = null;
    this.selectedSubmenu = null; // 取消子菜单被选项
    this.app.hud.dialogCount = Math.max(0, (this.app.hud.dialogCount ?? 1) - 1);
    this.syncClock(); // 开始计时
    this.app.view.draw();
  }

  _recalcChoice() {
    const d = this.choiceDialog;
    if (!d) return;
    const view = this.app.view;
    const [wxp, wyp] = view.cityPixel(d.city);
    const sx = view.sx(wxp);
    const sy = view.sy(wyp);
    // 面板位于城市中心偏右下 (112x48 外框，96x32 内区)
    const w = d.wTiles * 16;
    const h = d.hTiles * 16;
    d.ox = Math.max(8, Math.min(innerWidth - w - 8, sx - 16));
    d.oy = Math.max(8, Math.min(innerHeight - h - 8, sy + 8));
    d.px = d.ox + 8;
    d.py = d.oy + 8;
  }

  _hitChoice(px, py) {
    const d = this.choiceDialog;
    if (!d) return -1;
    this._recalcChoice();
    const { px: x, py: y, w, h, items } = d;
    if (px >= x && px < x + w && py >= y && py < y + h) {
      const rowH = 16;
      const i = Math.floor((py - y) / rowH);
      return i >= 0 && i < items.length ? i : -1;
    }
    return -1;
  }

  _clickChoice(px, py, btn) {
    if (btn !== 0) return true;
    const i = this._hitChoice(px, py);
    if (i < 0) {
      // 点击在选择弹窗外：消费事件，不做任何操作（只有右键才能取消关闭）
      return true;
    }
    clickSfx();
    const { city, legion } = this.choiceDialog;
    this.closeChoiceDialog();
    if (i === 0) {
      this.showCityCard(city);
    } else {
      this.showLegionCard(city || legion);
    }
    return true;
  }

  _drawChoice(ctx) {
    const d = this.choiceDialog;
    if (!d) return;
    this._recalcChoice();
    const { ox, oy, wTiles, hTiles, items, hover } = d;
    const win = this._drawWindow(ctx, ox, oy, wTiles, hTiles, "black");
    const x = win ? win.x : ox + 8;
    const y = win ? win.y : oy + 8;
    const w = win ? win.w : (wTiles - 1) * 16;
    const rowH = 16;
    ctx.font = FONT;
    ctx.textBaseline = "top";

    items.forEach((item, i) => {
      const iy = y + i * rowH;
      const isHover = hover === i;
      if (isHover) {
        ctx.fillStyle = "#ffe000";
        ctx.fillRect(x + 1, iy + 1, w - 2, rowH - 2);
        ctx.fillStyle = "#0000bb";
      } else {
        ctx.fillStyle = "#ffffff";
      }
      // 據 點 / 軍 團 原版对称间距 (x+16, x+64)
      ctx.fillText(item[0], x + 16, iy + 1);
      ctx.fillText(item[1], x + 64, iy + 1);
    });
  }

  /** 军团信息弹窗（ beige 列表，scrollbar: right，10行原版规格） */
  showLegionCard(target) {
    this.closeCityCard();
    this.closeChoiceDialog();
    const sc = this.app.scenario;
    if (!sc) return;

    let targetCity = null;
    let legions = [];

    // 如果传入的是据点
    if (target && target.type != null && target.prod != null) {
      targetCity = target;
      legions = sc.legions.filter(
        (L) =>
          !L.dead && L.faction != null && L.x === target.x && L.y === target.y,
      );
    } else if (target && target.leader != null) {
      // 传入的是军团
      const L = target;
      targetCity = sc.cities.find((c) => c.x === L.x && c.y === L.y) || null;
      legions = sc.legions.filter(
        (l) => !l.dead && l.faction != null && l.x === L.x && l.y === L.y,
      );
      if (!legions.includes(L)) legions.unshift(L);
    }

    if (targetCity && this.app?.view) {
      this.app.view.selectedCity = targetCity;
    }

    const rows = legions.map((L) => {
      const curCity = sc.cities.find((c) => c.x === L.x && c.y === L.y) || null;
      const curName = curCity?.name?.trim() ?? `(${L.x},${L.y})`;
      const targetName = (L.target?.name ?? curCity?.name)?.trim() ?? "－－－";
      const troops = (L.troops ?? 0) * 10;
      const morale = L.morale ?? 200;
      return {
        cells: [
          L.leader || "？",
          `${troops}`,
          `${morale}`,
          curName,
          targetName,
        ],
      };
    });

    // 补足 10 行虚线占位 (原版军团情报规格)
    while (rows.length < 10) {
      rows.push({
        cells: ["－－－－", "－－－－", "－－－", "－－－－", "－－－－"],
      });
    }

    this.openListDialog({
      title: "",
      titleBar: false,
      header: ["武將名", "總兵數", "士氣值", "現在位置", "目標據點"],
      cols: [
        { x: 8, w: 72, align: "left" },
        { x: 82, w: 62, align: "right" },
        { x: 146, w: 54, align: "right" },
        { x: 204, w: 84, align: "left" },
        { x: 290, w: 84, align: "left" },
      ],
      rows,
      rowH: 18,
      scrollbar: "right",
      w: 400,
      h: 196,
    });
  }

  closeLegionCard() {
    this.closeListDialog();
  }

  /** 军师子菜单「據點」二级下拉菜单 (首都確認 / 據點一覽) */
  showBaseMenu() {
    this.closeCityCard();
    this.closeListDialog();
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.selectedSubmenu = 5;
    this.syncClock();

    const cellW = 78;
    const btnX = this.bx + 8 + 5 * cellW;
    const wTiles = 7;
    const hTiles = 4;
    const ox = Math.round(btnX + (cellW - wTiles * 16) / 2);
    const oy = 72;

    this.baseMenu = {
      ox,
      oy,
      wTiles,
      hTiles,
      items: ["首都確認", "據點一覽"],
      hover: -1,
    };
    this.app.view.draw();
  }

  closeBaseMenu() {
    if (!this.baseMenu) return;
    this.baseMenu = null;
    this.app.view.draw();
  }

  _hitBaseMenu(px, py) {
    if (!this.baseMenu) return -1;
    const { ox, oy, wTiles, hTiles, items } = this.baseMenu;
    const x = ox + 8;
    const y = oy + 8;
    const w = (wTiles - 1) * 16;
    const h = (hTiles - 1) * 16;
    if (px >= x && px < x + w && py >= y && py < y + h) {
      const rowH = h / items.length;
      const i = Math.floor((py - y) / rowH);
      return i >= 0 && i < items.length ? i : -1;
    }
    return -1;
  }

  _drawBaseMenu(ctx) {
    if (!this.baseMenu) return;
    const { ox, oy, wTiles, hTiles, items, hover } = this.baseMenu;
    const win = this._drawWindow(ctx, ox, oy, wTiles, hTiles, "black");
    const x = win ? win.x : ox + 8;
    const y = win ? win.y : oy + 8;
    const w = win ? win.w : (wTiles - 1) * 16;
    const h = win ? win.h : (hTiles - 1) * 16;
    const rowH = h / items.length;
    ctx.font = FONT;
    ctx.textBaseline = "top";

    items.forEach((item, i) => {
      const iy = y + i * rowH;
      const isHover = hover === i;
      if (isHover) {
        ctx.fillStyle = "#ffe000";
        ctx.fillRect(x + 1, iy + 1, w - 2, rowH - 2);
        ctx.fillStyle = "#0000bb";
      } else {
        ctx.fillStyle = "#ffffff";
      }
      const tw = ctx.measureText(item).width;
      ctx.fillText(item, x + (w - tw) / 2, iy + (rowH - 16) / 2 + 1);
    });
  }

  /** 武将特长/对白信息弹窗 (逆向 KI.EXE 0x6580 - 0x65B9 规格: 16×5 tiles = 256×80) */
  async showGeneralCard(gen) {
    if (!gen) return;
    const { lines } = await quoteFor(gen);
    const img = await portrait(gen.portrait).catch(() => null);
    const w = 256;
    const h = 80;
    let px, py;
    if (this.listDialog) {
      const d = this.listDialog;
      px = d.px + d.w - w - 24;
      py = d.py + d.h - h - 36;
    } else {
      px = Math.round((innerWidth - w) / 2);
      py = Math.round((innerHeight - h) / 2);
    }
    this.generalCard = { gen, img, lines, px, py, w, h };
    this.app.view.draw();
  }

  closeGeneralCard() {
    if (!this.generalCard) return;
    this.generalCard = null;
    if (this.listDialog) this.listDialog.selectedRow = -1;
    this.app.view.draw();
  }

  _hitGeneralCard(px, py) {
    const g = this.generalCard;
    if (!g) return false;
    return (
      px >= g.px - 8 &&
      px < g.px + g.w + 8 &&
      py >= g.py - 8 &&
      py < g.py + g.h + 8
    );
  }

  _drawGeneralCard(ctx) {
    const g = this.generalCard;
    if (!g) return;
    const { px, py, w, h, img, lines } = g;
    const tw = Math.ceil((w + 16) / 16);
    const th = Math.ceil((h + 16) / 16);
    const win = this._drawWindow(ctx, px - 8, py - 8, tw, th, "black");
    const x = win ? win.x : px;
    const y = win ? win.y : py;

    // 左侧武将头像 64×64
    if (img) {
      ctx.drawImage(img, x + 8, y + 8, 64, 64);
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x + 8, y + 8, 64, 64);
    }

    // 右侧对白文字
    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    const tx = x + 8 + 64 + 14;
    const maxTextW = Math.max(40, w - 8 - 64 - 14 - 8);

    const rawLines = Array.isArray(lines) ? lines : [String(lines || "")];
    const renderLines = [];
    for (const raw of rawLines) {
      for (const paragraph of String(raw).split("\n")) {
        if (!paragraph) {
          renderLines.push("");
          continue;
        }
        let cur = "";
        for (const ch of paragraph) {
          const test = cur + ch;
          if (ctx.measureText(test).width > maxTextW && cur.length > 0) {
            renderLines.push(cur);
            cur = ch;
          } else {
            cur = test;
          }
        }
        if (cur) renderLines.push(cur);
      }
    }

    const lineH = 18;
    const totalH = renderLines.length * lineH;
    const startY = y + Math.max(8, Math.floor((h - totalH) / 2));
    renderLines.forEach((line, li) => {
      ctx.fillText(line, tx, startY + li * lineH);
    });
  }

  /** 军师子菜单「編成」: 部队编成面板 (15×12 tiles = 240×192, inner 224×176) */
  async showFormationDialog(gen) {
    if (!gen) return;
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f) return;

    const img = await portrait(gen.portrait).catch(() => null);

    // 势力总可用预备兵池 (实际人数: reserve_* * 10)
    const totalRes = [
      (f.reserve_cav ?? 0) * 10, // 0: 騎兵
      (f.reserve_inf ?? 0) * 10, // 1: 步兵
      (f.reserve_arc ?? 0) * 10, // 2: 弓兵
    ];

    // 默认初始分配:
    // 0: 主將 (騎兵 type: 0)
    // 1: 前鋒 (騎兵 type: 0)
    // 2: 左翼 (步兵 type: 1)
    // 3: 右翼 (步兵 type: 1)
    // 4: 左備 (弓兵 type: 2)
    // 5: 右備 (弓兵 type: 2)
    const units = [
      { name: "主將", type: 0, troops: 0 },
      { name: "前鋒", type: 0, troops: 0 },
      { name: "左翼", type: 1, troops: 0 },
      { name: "右翼", type: 1, troops: 0 },
      { name: "左備", type: 2, troops: 0 },
      { name: "右備", type: 2, troops: 0 },
    ];

    let ox, oy;
    if (this.listDialog) {
      const d = this.listDialog;
      ox = d.px + 128;
      oy = d.py + 28;
      if (d.footer) {
        d.footer.text = "請下達各部隊編成之指示。";
      }
    } else {
      ox = Math.round((innerWidth - 240) / 2);
      oy = Math.round((innerHeight - 192) / 2);
    }

    this.formationDialog = {
      gen,
      portraitImg: img,
      totalRes,
      remRes: [0, 0, 0],
      units,
      totalTroops: 0,
      ox,
      oy,
      wTiles: 15,
      hTiles: 12,
    };

    this._recalcFormationTroops();
    this.app.view.draw();
  }

  _recalcFormationTroops() {
    const f = this.formationDialog;
    if (!f) return;

    // 对 3 个兵种分别计算:
    // 0: 骑兵 (cav), 1: 步兵 (inf), 2: 弓兵 (arc)
    for (let t = 0; t < 3; t++) {
      const indices = [];
      for (let i = 0; i < 6; i++) {
        if (f.units[i].type === t) indices.push(i);
      }
      const k = indices.length;
      const totalAvailable = f.totalRes[t];

      if (k === 0) {
        f.remRes[t] = totalAvailable;
      } else {
        const needed = k * 1000;
        if (totalAvailable >= needed) {
          indices.forEach((idx) => {
            f.units[idx].troops = 1000;
          });
          f.remRes[t] = totalAvailable - needed;
        } else {
          // 不足 1000 时平均分配
          const base = Math.floor(totalAvailable / k);
          const rem = totalAvailable % k;
          indices.forEach((idx, order) => {
            f.units[idx].troops = base + (order < rem ? 1 : 0);
          });
          f.remRes[t] = 0;
        }
      }
    }

    f.totalTroops = f.units.reduce((sum, u) => sum + u.troops, 0);
  }

  closeFormationDialog() {
    this.formationQuote = null;
    if (!this.formationDialog) return;
    this.formationDialog = null;
    if (this.listDialog) {
      this.listDialog.selectedRow = -1;
      if (this.listDialog.footer) {
        this.listDialog.footer.text = "進行軍隊編組。\n請選擇武將。";
      }
    }
    this.app.view.draw();
  }

  _hitFormationDialog(px, py) {
    const f = this.formationDialog;
    if (!f) return false;
    const { ox, oy, wTiles = 15, hTiles = 12 } = f;
    const inFormation =
      px >= ox && px < ox + wTiles * 16 && py >= oy && py < oy + hTiles * 16;
    if (inFormation) return true;
    const q = this.formationQuote;
    if (q) {
      const { ox: qx, oy: qy, wTiles: qw = 20, hTiles: qh = 5 } = q;
      if (px >= qx && px < qx + qw * 16 && py >= qy && py < qy + qh * 16) {
        return true;
      }
    }
    return false;
  }

  _clickFormationDialog(px, py) {
    if (this.formationQuote) {
      return true; // 存在发言/警告弹窗时，消费所有点击，只有右键能关闭
    }
    const f = this.formationDialog;
    if (!f) return false;
    const { ox, oy } = f;
    const x = ox + 8;
    const y = oy + 8;

    // 1. 检查是否点击了 6 个队的兵种按钮:
    for (let i = 0; i < 6; i++) {
      const uy = y + 70 + i * 16;
      const bx = x + 48,
        by = uy + 1,
        bw = 22,
        bh = 14;
      if (px >= bx && px < bx + bw && py >= by && py < by + bh) {
        clickSfx();
        // 切换顺序：骑兵(0) -> 步兵(1) -> 弓兵(2) -> 骑兵(0)
        f.units[i].type = (f.units[i].type + 1) % 3;
        this._recalcFormationTroops();
        this.app.view.draw();
        return true;
      }
    }

    // 2. 检查是否点击了「確定」按钮:
    const cx = x + 126,
      cy = y + 144,
      cw = 88,
      ch = 20;
    if (px >= cx && px < cx + cw && py >= cy && py < cy + ch) {
      this._confirmFormation();
      return true;
    }

    // 消费弹窗范围内的点击，防止点到下层列表
    return true;
  }

  async _confirmFormation() {
    const f = this.formationDialog;
    if (!f) return;
    const { gen, totalTroops, remRes, units } = f;
    const sc = this.app.scenario;
    const fac = cmd.playerFaction(sc);
    if (!fac || !sc) return;

    // 1. 检查主将 (units[0]) 或 前锋 (units[1]) 兵力是否 <= 0
    if (units[0].troops <= 0 || units[1].troops <= 0) {
      warnSfx();
      const advGen = adv.getAdvisor(sc, fac) || sc.monarchOf(fac);
      const pImg = advGen
        ? await portrait(advGen.portrait).catch(() => null)
        : null;
      const { lines } = await quoteForIndex(62);
      this.formationQuote = {
        type: "warning",
        img: pImg,
        lines,
        ox: f.ox,
        oy: f.oy + (f.hTiles ?? 12) * 16 + 12,
        wTiles: 20,
        hTiles: 5,
      };
      this.app.view.draw();
      return;
    }

    if (totalTroops <= 0) {
      warnSfx();
      this.app.hud?.flashEvent?.("兵力不足，無法編成軍團！");
      return;
    }

    clickSfx();

    // 1. 扣除势力预备兵
    fac.reserve_cav = Math.max(0, Math.floor(remRes[0] / 10));
    fac.reserve_inf = Math.max(0, Math.floor(remRes[1] / 10));
    fac.reserve_arc = Math.max(0, Math.floor(remRes[2] / 10));

    // 2. 武将身份变为軍團長 (status = 1)
    gen.status = 1;

    // 3. 确定驻守据点 (首都)
    const cap =
      (fac.capital == null ? null : sc.cities[fac.capital]) ||
      sc.citiesOf(fac.idx)[0];
    if (!cap) {
      warnSfx();
      this.app.hud?.flashEvent?.("無可用首都或據點！");
      return;
    }

    // 4. 创建新军团并驻守在首都
    sc.legions = sc.legions || [];
    const newLegion = {
      leader: gen.name,
      faction: fac.idx,
      x: cap.x,
      y: cap.y,
      prevX: cap.x,
      prevY: cap.y,
      troops: Math.floor(totalTroops / 10), // 内部标准以 10 兵为单位
      morale: 200,
      formation: 1,
      target: cap,
      cooldown: 0,
      units: units.map((u) => ({ type: u.type, troops: u.troops })),
    };
    sc.legions.push(newLegion);

    // 5. 弹出该武将发言对白弹窗 (100% 逆向复刻 KI.EXE 0x6F32 逻辑)
    const { lines } = await quoteForFormation(gen);
    this.formationQuote = {
      type: "success",
      gen,
      img: f.portraitImg,
      lines,
      ox: f.ox,
      oy: f.oy + (f.hTiles ?? 12) * 16 + 12,
      wTiles: 20,
      hTiles: 5,
      cap,
    };
    this.app.view.draw();
  }

  _drawFormationQuote(ctx) {
    const q = this.formationQuote;
    if (!q) return;
    const { ox, oy, wTiles = 20, hTiles = 5, img, lines } = q;
    const win = this._drawWindow(ctx, ox, oy, wTiles, hTiles, "black");
    const x = win ? win.x : ox + 8;
    const y = win ? win.y : oy + 8;
    const w = win ? win.w : (wTiles - 1) * 16;
    const h = win ? win.h : (hTiles - 1) * 16;

    // 左侧头像 64×64 (紧贴内框左上角)
    if (img) {
      ctx.drawImage(img, 0, 0, 128, 128, x, y, 64, 64);
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, 64, 64);
    }

    // 右侧文字
    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    const tx = x + 64 + 6;
    const maxTextW = Math.max(120, w - 64 - 12);

    const fullText = Array.isArray(lines)
      ? lines.join("")
      : String(lines || "");
    const NO_START = "，。、？！；：」』）】”’";
    const renderLines = [];
    for (const paragraph of fullText.split("\n")) {
      if (!paragraph) {
        renderLines.push("");
        continue;
      }
      let cur = "";
      for (let i = 0; i < paragraph.length; i++) {
        const ch = paragraph[i];
        const test = cur + ch;
        if (ctx.measureText(test).width > maxTextW && cur.length > 0) {
          if (
            NO_START.includes(ch) &&
            ctx.measureText(test).width <= maxTextW + 16
          ) {
            renderLines.push(test);
            cur = "";
          } else {
            renderLines.push(cur);
            cur = ch;
          }
        } else {
          cur = test;
        }
      }
      if (cur) renderLines.push(cur);
    }

    const lineH = 18;
    const totalH = renderLines.length * lineH;
    const startY = y + Math.max(4, Math.floor((h - totalH) / 2));
    renderLines.forEach((line, li) => {
      ctx.fillText(line, tx, startY + li * lineH);
    });
  }

  _drawFormationDialog(ctx) {
    const f = this.formationDialog;
    if (!f) return;
    const { ox, oy, gen, portraitImg, units, totalTroops, remRes } = f;
    const wTiles = 15,
      hTiles = 12;

    const win = this._drawWindow(ctx, ox, oy, wTiles, hTiles, "cloud");
    const x = win ? win.x : ox + 8;
    const y = win ? win.y : oy + 8;

    // 1. 左上角武将头像 64×64
    if (portraitImg) {
      ctx.drawImage(portraitImg, 0, 0, 128, 128, x + 2, y + 2, 64, 64);
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x + 2, y + 2, 64, 64);
    }

    // 2. 右侧信息（將軍 / 總兵力 / 士氣值）
    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("將軍", x + 74, y + 6);
    ctx.fillText(gen.name?.trim() ?? "", x + 120, y + 6);

    ctx.fillText("總兵力", x + 74, y + 26);
    ctx.font = DIN;
    ctx.fillStyle = "#ffffff";
    const sTotalTroops = `${totalTroops}`;
    ctx.fillText(
      sTotalTroops,
      x + 216 - ctx.measureText(sTotalTroops).width,
      y + 26,
    );

    ctx.font = FONT;
    ctx.fillText("士氣值", x + 74, y + 46);
    ctx.font = DIN;
    const sMorale = "200";
    ctx.fillText(sMorale, x + 216 - ctx.measureText(sMorale).width, y + 46);

    // 3. 左下方 6 队编制
    const unitNames = ["主將", "前鋒", "左翼", "右翼", "左備", "右備"];
    for (let i = 0; i < 6; i++) {
      const u = units[i];
      const uy = y + 70 + i * 16;

      // 队伍名
      ctx.font = FONT;
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "top";
      ctx.fillText(unitNames[i], x + 6, uy);

      // 兵种按钮（绿底 + 兵种图标）
      const bx = x + 48,
        by = uy + 1,
        bw = 22,
        bh = 14;
      ctx.fillStyle = "#509040";
      ctx.fillRect(bx, by, bw, bh);

      let iconKey = "arc";
      if (u.type === 0) iconKey = "cav";
      else if (u.type === 1) iconKey = "inf";
      const iconImg = this.imgs[iconKey];
      if (iconImg) {
        ctx.drawImage(iconImg, bx, by, bw, bh);
      }

      // 队伍兵力
      ctx.font = DIN;
      ctx.fillStyle = "#ffe080";
      const sTroops = `${u.troops}`;
      ctx.fillText(sTroops, x + 116 - ctx.measureText(sTroops).width, uy);
    }

    // 4. 右下方预备兵数
    ctx.font = FONT;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText("預備兵數", x + 126, y + 70);

    // 预备兵三行（原版顺序：騎兵、弓兵、步兵）
    const resTypes = [
      { key: "cav", idx: 0 },
      { key: "arc", idx: 2 },
      { key: "inf", idx: 1 },
    ];
    for (let i = 0; i < 3; i++) {
      const { key, idx } = resTypes[i];
      const ry = y + 88 + i * 16;

      // 红色背景图标
      const rx = x + 126,
        rby = ry + 1,
        rw = 22,
        rh = 14;
      ctx.fillStyle = "#d00000";
      ctx.fillRect(rx, rby, rw, rh);

      const iconImg = this.imgs[key];
      if (iconImg) {
        ctx.drawImage(iconImg, rx, rby, rw, rh);
      }

      // 剩余预备兵数
      ctx.font = DIN;
      ctx.fillStyle = "#ffe080";
      const sRes = `${remRes[idx]}`;
      ctx.fillText(sRes, x + 214 - ctx.measureText(sRes).width, ry);
    }

    // 5. 確定 按钮
    const cx = x + 126,
      cy = y + 144,
      cw = 88,
      ch = 20;
    ctx.fillStyle = "#c08020";
    ctx.fillRect(cx, cy, cw, ch);
    // 高光边框
    ctx.fillStyle = "#f0c060";
    ctx.fillRect(cx, cy, cw, 1);
    ctx.fillRect(cx, cy, 1, ch);
    // 阴影边框
    ctx.fillStyle = "#603000";
    ctx.fillRect(cx, cy + ch - 1, cw, 1);
    ctx.fillRect(cx + cw - 1, cy, 1, ch);

    ctx.font = FONT;
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText("確定").width;
    ctx.fillText("確定", cx + (cw - tw) / 2, cy + ch / 2 + 1);

    // 6. 若存在提示/武将发言弹窗，绘制于上方
    if (this.formationQuote) {
      this._drawFormationQuote(ctx);
    }
  }

  showFinanceDialog() {
    this.closeCityCard();
    this.closeListDialog();
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeFormationDialog();
    this.closeBaseMenu();
    this.closeKeypadDialog();

    this.selectedSubmenu = 2;
    this.syncClock();

    const wTiles = 21;
    const hTiles = 10;
    const infoHTiles = 5;
    const infoWTiles = 30; // 统一为武将弹窗宽度 480px (30 tiles)

    const ox = this.bx + Math.round((640 - wTiles * 16) / 2);
    const oy = Math.max(36, Math.round((innerHeight - hTiles * 16) / 2));
    const infoOx = Math.round((innerWidth - infoWTiles * 16) / 2);
    const infoOy = innerHeight - infoHTiles * 16 - 8;

    this.financeDialog = {
      ox,
      oy,
      wTiles,
      hTiles,
      infoOx,
      infoOy,
      infoWTiles,
      infoHTiles,
      advisorImg: null,
    };

    // 异步加载军师头像
    const sc = this.app.scenario;
    if (sc) {
      const fac = cmd.playerFaction(sc);
      const advGen =
        (fac ? adv.getAdvisor(sc, fac) : null) ||
        (fac ? sc.monarchOf(fac) : null);
      if (advGen && advGen.portrait != null) {
        portrait(advGen.portrait)
          .then((img) => {
            if (this.financeDialog) {
              this.financeDialog.advisorImg = img;
              this.app.view.draw();
            }
          })
          .catch(() => {});
      }
    }

    this.app.view.draw();
  }

  _recalcFinanceDialog() {
    const fd = this.financeDialog;
    if (!fd) return;
    const wTiles = fd.wTiles ?? 21;
    const hTiles = fd.hTiles ?? 10;
    const infoHTiles = fd.infoHTiles ?? 5;
    const infoWTiles = fd.infoWTiles ?? 30;
    fd.ox = this.bx + Math.round((640 - wTiles * 16) / 2);
    fd.oy = Math.max(36, Math.round((innerHeight - hTiles * 16) / 2));
    fd.infoOx = Math.round((innerWidth - infoWTiles * 16) / 2);
    fd.infoOy = innerHeight - infoHTiles * 16 - 8;
  }

  closeFinanceDialog() {
    this.closeKeypadDialog();
    if (!this.financeDialog) return;
    this.financeDialog = null;
    this.app.view.draw();
  }

  showKeypadDialog(type, curVal, maxVal, ox, oy) {
    const wTiles = 10;
    const hTiles = 7;
    const cw = (wTiles + 1) * 16;
    const ch = (hTiles + 1) * 16;
    const bx = this.bx ?? Math.max(0, Math.round((innerWidth - 640) / 2));
    const minX = bx + 8;
    const maxX = bx + 640 - cw + 8;
    const minY = 32;
    const maxY = innerHeight - ch + 8;

    this.keypadDialog = {
      type,
      val: Math.min(maxVal, curVal ?? 0),
      max: maxVal,
      ox: Math.min(maxX, Math.max(minX, ox)),
      oy: Math.min(maxY, Math.max(minY, oy)),
      wTiles,
      hTiles,
    };
    this.syncClock();
    this.app.view.draw();
  }

  closeKeypadDialog() {
    if (!this.keypadDialog) return;
    this.keypadDialog = null;
    this.syncClock();
    this.app.view.draw();
  }

  _hitFinanceDialog(px, py) {
    const f = this.financeDialog;
    if (!f) return false;
    const { ox, oy, infoOx, infoOy, wTiles = 21, hTiles = 10, infoWTiles = 30, infoHTiles = 5 } = f;
    const x = ox - 8;
    const y = oy - 8;
    const w = (wTiles + 1) * 16;
    const h = (hTiles + 1) * 16;
    const inMain = px >= x && px < x + w && py >= y && py < y + h;
    if (inMain) return true;
    if (infoOy != null) {
      const ix = (infoOx ?? ox) - 8;
      const iy = infoOy - 8;
      const iw = ((infoWTiles ?? wTiles) + 1) * 16;
      const ih = (infoHTiles + 1) * 16;
      if (px >= ix && px < ix + iw && py >= iy && py < iy + ih) return true;
    }
    return false;
  }

  _hitKeypadDialog(px, py) {
    const k = this.keypadDialog;
    if (!k) return false;
    const { ox, oy, wTiles = 10, hTiles = 7 } = k;
    const x = ox - 8;
    const y = oy - 8;
    const w = (wTiles + 1) * 16;
    const h = (hTiles + 1) * 16;
    return px >= x && px < x + w && py >= y && py < y + h;
  }

  _clickKeypadDialog(px, py) {
    const k = this.keypadDialog;
    if (!k) return false;
    const { ox, oy, wTiles = 10, hTiles = 7 } = k;
    const kx = ox + 8;
    const ky = oy + 8;
    const kw = (wTiles - 1) * 16;
    const kh = (hTiles - 1) * 16;

    if (px < kx || px >= kx + kw || py < ky || py >= ky + kh) {
      return true; // 消费外部点击
    }

    const headerH = 24;
    if (py < ky + headerH) return true; // 显示区

    const btnH = 24;
    const ry = py - (ky + headerH);
    const rx = px - kx;
    const r = Math.floor(ry / btnH);
    if (r < 0 || r >= 3) return true;

    let c = -1;
    if (rx < 24) c = 0;
    else if (rx < 48) c = 1;
    else if (rx < 72) c = 2;
    else if (rx < 96) c = 3;
    else if (rx < 144) c = 4;

    if (c === -1) return true;

    clickSfx();
    const sc = this.app.scenario;

    if (c === 4) {
      if (r === 0) {
        // ★需求 3：取消 -> 将当前输入的数复位清零为 0（不关闭窗口）
        k.val = 0;
      } else if (r === 1) {
        // 最大
        k.val = k.max;
      } else if (r === 2) {
        // 決定
        if (k.type === "tax") {
          sc.next_tax = k.val;
        } else if (k.type === "cav") {
          if (!sc.next_conscription) sc.next_conscription = [0, 0, 0];
          sc.next_conscription[0] = k.val;
        } else if (k.type === "arc") {
          if (!sc.next_conscription) sc.next_conscription = [0, 0, 0];
          sc.next_conscription[1] = k.val;
        } else if (k.type === "inf") {
          if (!sc.next_conscription) sc.next_conscription = [0, 0, 0];
          sc.next_conscription[2] = k.val;
        }
        this.closeKeypadDialog();
      }
    } else if (c === 3) {
      if (r === 0) {
        // ◀ 回退
        k.val = Math.floor(k.val / 10);
      } else if (r === 1) {
        // 0
        k.val = Math.min(k.max, k.val * 10);
      } else if (r === 2) {
        // 00
        k.val = Math.min(k.max, k.val * 100);
      }
    } else {
      // 数字 1..9
      const digits = [
        [7, 8, 9],
        [4, 5, 6],
        [1, 2, 3],
      ];
      const d = digits[r][c];
      k.val = Math.min(k.max, k.val * 10 + d);
    }

    this.app.view.draw();
    return true;
  }

  _clickFinanceDialog(px, py) {
    if (this.keypadDialog) {
      return this._clickKeypadDialog(px, py);
    }
    const f = this.financeDialog;
    if (!f) return false;
    const { ox, oy } = f;
    const fx = ox + 8;
    const fy = oy + 8;
    const sc = this.app.scenario;

    // 键盘弹窗位置计算：
    // X：位于图标列右侧偏右并留出间隙（图标列右界 fx + 246，留出 6px 间隙 -> ox = fx + 252）
    // Y：位于当前设置行数字的下方一点，不遮挡当前及以上行的文字与数字
    const keypadOx = fx + 252;

    // 1. 次月 稅率 (绘制于 fy + 70，高 16)
    if (px >= fx + 220 && px < fx + 312 && py >= fy + 68 && py < fy + 84) {
      clickSfx();
      const curVal = sc.next_tax ?? sc.tax ?? 18;
      this.showKeypadDialog("tax", curVal, 100, keypadOx, fy + 88);
      return true;
    }

    // 2. 次月 騎兵 徵兵數 (绘制于 fy + 86，高 16)
    if (px >= fx + 220 && px < fx + 312 && py >= fy + 84 && py < fy + 99) {
      clickSfx();
      const curVal = sc.next_conscription?.[0] ?? 0;
      this.showKeypadDialog("cav", curVal, 10000, keypadOx, fy + 104);
      return true;
    }

    // 3. 次月 弓兵 徵兵數 (绘制于 fy + 101，高 16)
    if (px >= fx + 220 && px < fx + 312 && py >= fy + 99 && py < fy + 114) {
      clickSfx();
      const curVal = sc.next_conscription?.[1] ?? 0;
      this.showKeypadDialog("arc", curVal, 10000, keypadOx, fy + 119);
      return true;
    }

    // 4. 次月 步兵 徵兵數 (绘制于 fy + 116，高 16)
    if (px >= fx + 220 && px < fx + 312 && py >= fy + 114 && py < fy + 132) {
      clickSfx();
      const curVal = sc.next_conscription?.[2] ?? 0;
      this.showKeypadDialog("inf", curVal, 10000, keypadOx, fy + 134);
      return true;
    }

    return true;
  }

  _drawKeypadDialog(ctx) {
    const k = this.keypadDialog;
    if (!k) return;
    const { ox, oy, val, wTiles = 10, hTiles = 7 } = k;
    const win = this._drawWindow(ctx, ox, oy, wTiles, hTiles, "black");
    const kx = win ? win.x : ox + 8;
    const ky = win ? win.y : oy + 8;
    const kw = (wTiles - 1) * 16;
    const headerH = 24;
    const btnH = 24;

    // 顶部显示区域 144×24 黑底
    ctx.fillStyle = "#000000";
    ctx.fillRect(kx, ky, kw, headerH);
    ctx.font = DIN;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    const sVal = `${val}`;
    const twVal = ctx.measureText(sVal).width;
    ctx.fillText(
      sVal,
      kx + Math.round((kw - twVal) / 2),
      ky + headerH / 2 + 0.5,
    );

    const btnData = [
      [
        { t: "7", type: "num", val: 7, w: 24 },
        { t: "8", type: "num", val: 8, w: 24 },
        { t: "9", type: "num", val: 9, w: 24 },
        { t: "◀", type: "back", w: 24 },
        { t: "取消", type: "cancel", w: 48 },
      ],
      [
        { t: "4", type: "num", val: 4, w: 24 },
        { t: "5", type: "num", val: 5, w: 24 },
        { t: "6", type: "num", val: 6, w: 24 },
        { t: "0", type: "num", val: 0, w: 24 },
        { t: "最大", type: "max", w: 48 },
      ],
      [
        { t: "1", type: "num", val: 1, w: 24 },
        { t: "2", type: "num", val: 2, w: 24 },
        { t: "3", type: "num", val: 3, w: 24 },
        { t: "00", type: "00", w: 24 },
        { t: "決定", type: "ok", w: 48 },
      ],
    ];

    for (let r = 0; r < 3; r++) {
      const by = ky + headerH + r * btnH;
      let bx = kx;
      for (const btn of btnData[r]) {
        const isAction =
          btn.type === "cancel" ||
          btn.type === "max" ||
          btn.type === "ok" ||
          btn.type === "back";
        ctx.fillStyle = isAction ? "#c08030" : "#509040";
        ctx.fillRect(bx, by, btn.w, btnH);

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, btn.w - 1, btnH - 1);

        if (btn.type === "back") {
          ctx.beginPath();
          ctx.moveTo(bx + 16, by + 6);
          ctx.lineTo(bx + 7, by + 12);
          ctx.lineTo(bx + 16, by + 18);
          ctx.closePath();
          ctx.fillStyle = "#000000";
          ctx.fill();
        } else {
          ctx.font = btn.type === "num" || btn.type === "00" ? DIN : FONT;
          ctx.fillStyle = "#000000";
          ctx.textBaseline = "middle";
          const tw = ctx.measureText(btn.t).width;
          ctx.fillText(btn.t, bx + (btn.w - tw) / 2, by + btnH / 2 + 0.5);
        }

        bx += btn.w;
      }
    }
  }

  _drawFinanceDialog(ctx) {
    const fd = this.financeDialog;
    if (!fd) return;
    const {
      ox,
      oy,
      infoOx,
      infoOy,
      wTiles = 21,
      hTiles = 10,
      infoWTiles = 30,
      infoHTiles = 5,
    } = fd;
    const sc = this.app.scenario;
    const data = getProjectedFinance(sc);

    // ── 0. 底部信息提示窗口 (黑底 + 金框 + 军师/提示头像 + 自动回行文字) ──
    const targetInfoOx = infoOx ?? Math.round((innerWidth - infoWTiles * 16) / 2);
    const targetInfoOy = infoOy ?? innerHeight - infoHTiles * 16 - 8;
    const infoWin = this._drawWindow(
      ctx,
      targetInfoOx,
      targetInfoOy,
      infoWTiles,
      infoHTiles,
      "black",
    );
    const ix = infoWin ? infoWin.x : targetInfoOx + 8;
    const iy = infoWin ? infoWin.y : targetInfoOy + 8;
    const iw = infoWin ? infoWin.w : (infoWTiles - 1) * 16;
    const ih = infoWin ? infoWin.h : (infoHTiles - 1) * 16;

    // 左侧提示头像 64×64 (紧贴内框左上角，统一使用 message_npc)
    const advImg = this.imgs?.messageNpc || fd.advisorImg;
    if (advImg) {
      ctx.drawImage(
        advImg,
        0,
        0,
        advImg.naturalWidth || advImg.width || 64,
        advImg.naturalHeight || advImg.height || 64,
        ix,
        iy,
        64,
        64,
      );
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(ix, iy, 64, 64);
    }

    // 右侧提示文字 (自动回行)
    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    const tx = ix + 64 + 14;
    const maxTextW = Math.max(60, iw - 64 - 28);

    const infoText = "請指示下個月以後的財政予定。";
    const renderLines = [];
    for (const paragraph of infoText.split("\n")) {
      if (!paragraph) {
        renderLines.push("");
        continue;
      }
      let cur = "";
      for (let i = 0; i < paragraph.length; i++) {
        const ch = paragraph[i];
        const test = cur + ch;
        if (ctx.measureText(test).width > maxTextW && cur.length > 0) {
          renderLines.push(cur);
          cur = ch;
        } else {
          cur = test;
        }
      }
      if (cur) renderLines.push(cur);
    }

    const lineH = 20;
    const totalTextH = renderLines.length * lineH;
    const startTy = iy + Math.max(4, Math.floor((ih - totalTextH) / 2));
    renderLines.forEach((line, li) => {
      ctx.fillText(line, tx, startTy + li * lineH);
    });

    // ── 1. 财政主弹窗 (金框 + 云纹底) ──
    const win = this._drawWindow(ctx, ox, oy, wTiles, hTiles, "cloud");
    const x = win ? win.x : ox + 8;
    const y = win ? win.y : oy + 8;

    const { money, cav, arc, inf } = this.imgs;

    // 1. 左上: 資金
    ctx.font = FONT;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText("資金", x + 16, y + 8);

    ctx.fillStyle = "#000000";
    ctx.fillRect(x + 10, y + 26, 128, 16);

    ctx.font = DIN;
    ctx.fillStyle = "#ffffff";
    const sTreasury = `${data.treasury}`;
    ctx.fillText(sTreasury, x + 134 - ctx.measureText(sTreasury).width, y + 26);

    // 2. 右上: 收入 / 支出 (带垂直分隔线 | 与黑底数值框)
    ctx.font = FONT;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("收入", x + 158, y + 8);
    ctx.fillText("支出", x + 158, y + 26);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 194.5, y + 6);
    ctx.lineTo(x + 194.5, y + 44);
    ctx.stroke();

    ctx.fillStyle = "#000000";
    ctx.fillRect(x + 198, y + 8, 110, 16);
    ctx.fillRect(x + 198, y + 26, 110, 16);

    ctx.font = DIN;
    ctx.fillStyle = "#ffffff";
    const sIncome = `${data.income}`;
    ctx.fillText(sIncome, x + 304 - ctx.measureText(sIncome).width, y + 8);

    const sExpense = `${data.expense}`;
    ctx.fillText(sExpense, x + 304 - ctx.measureText(sExpense).width, y + 26);

    // 3. 左下: 今月底
    ctx.font = FONT;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("今月底", x + 32, y + 50);

    // 黑色连续底框
    ctx.fillStyle = "#000000";
    ctx.fillRect(x + 98, y + 70, 48, 62);

    // 稅率 (紅底圖標 + 數值)
    ctx.fillText("稅率", x + 16, y + 70);

    ctx.fillStyle = "#d00000";
    ctx.fillRect(x + 72, y + 70 + 1, 22, 14);
    if (money) ctx.drawImage(money, x + 72, y + 70 + 1, 22, 14);

    ctx.font = DIN;
    ctx.fillStyle = "#ffffff";
    const sCurTax = `${data.curTax}%`;
    ctx.fillText(sCurTax, x + 142 - ctx.measureText(sCurTax).width, y + 70);

    // 徵兵數 (3 行紅底圖標 + 數值)
    ctx.font = FONT;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("徵兵數", x + 16, y + 86);

    const redTroops = [
      { img: cav, val: data.curCav, ty: y + 86 },
      { img: arc, val: data.curArc, ty: y + 101 },
      { img: inf, val: data.curInf, ty: y + 116 },
    ];

    redTroops.forEach(({ img, val, ty }) => {
      ctx.fillStyle = "#d00000";
      ctx.fillRect(x + 72, ty + 1, 22, 14);
      if (img) ctx.drawImage(img, x + 72, ty + 1, 22, 14);

      ctx.font = DIN;
      ctx.fillStyle = "#ffffff";
      const sVal = `${val}`;
      ctx.fillText(sVal, x + 142 - ctx.measureText(sVal).width, ty);
    });

    // 4. 右下: 次月
    ctx.font = FONT;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("次月", x + 192, y + 50);

    // 黑色连续底框
    ctx.fillStyle = "#000000";
    ctx.fillRect(x + 250, y + 70, 56, 62);

    // 稅率 (綠底按鈕 + 數值)
    ctx.fillText("稅率", x + 164, y + 70);

    ctx.fillStyle = "#509040";
    ctx.fillRect(x + 224, y + 70 + 1, 22, 14);
    if (money) ctx.drawImage(money, x + 224, y + 70 + 1, 22, 14);

    ctx.font = DIN;
    ctx.fillStyle = "#ffffff";
    const sNextTax = `${data.nextTax}%`;
    ctx.fillText(sNextTax, x + 302 - ctx.measureText(sNextTax).width, y + 70);

    // 徵兵數 (3 行綠底按鈕 + 數值)
    ctx.font = FONT;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("徵兵數", x + 164, y + 86);

    const greenTroops = [
      { img: cav, val: data.nextCav, ty: y + 86 },
      { img: arc, val: data.nextArc, ty: y + 101 },
      { img: inf, val: data.nextInf, ty: y + 116 },
    ];

    greenTroops.forEach(({ img, val, ty }) => {
      ctx.fillStyle = "#509040";
      ctx.fillRect(x + 224, ty + 1, 22, 14);
      if (img) ctx.drawImage(img, x + 224, ty + 1, 22, 14);

      ctx.font = DIN;
      ctx.fillStyle = "#ffffff";
      const sVal = `${val}`;
      ctx.fillText(sVal, x + 302 - ctx.measureText(sVal).width, ty);
    });

    // 5. 若存在數字輸入彈窗，繪製于上方
    if (this.keypadDialog) {
      this._drawKeypadDialog(ctx);
    }
  }

  _recalcCityCard() {
    if (!c) return;
    c.px = 12;
    c.py = innerHeight - c.h - 12;
  }

  _hitCityCard(px, py) {
    const c = this.cityCard;
    if (!c) return false;
    return (
      px >= c.px - 8 &&
      px < c.px + c.w + 8 &&
      py >= c.py - 8 &&
      py < c.py + c.h + 8
    );
  }

  _drawCityCard(ctx) {
    const c = this.cityCard;
    if (!c) return;
    const { px, py, w, h, city, img } = c;
    const tw = Math.ceil((w + 16) / 16),
      th = Math.ceil((h + 16) / 16);
    // 金框 + 黑底
    if (this._gf) {
      this._drawWindow(ctx, px - 8, py - 8, tw, th, "black");
    } else {
      ctx.fillStyle = NAVY;
      ctx.fillRect(px, py, w, h);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
    }
    const sc = this.app.scenario;
    const f = city.faction == null ? null : sc.factions[city.faction];
    const isCapital = f && f.capital === city.idx;

    // 布局：左右 10 边距，城市图 140×140 占满纵向，右侧信息列
    const pad = 10;
    const iw = 140,
      ih = 140;
    const gap = 16;
    const tx = px + pad + iw + gap;
    const right = px + w - pad;
    const top = py + pad;
    let y = top;

    // 左侧：城市图黑底衬
    ctx.fillStyle = "#000000";
    ctx.fillRect(px + pad, top, iw, ih);
    if (img) {
      ctx.drawImage(img, px + pad, top, iw, ih);
    }

    // 右侧文字统一白色
    ctx.textBaseline = "top";
    ctx.font = FONT;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(city.name, tx, y);
    if (isCapital) {
      const nm = ctx.measureText(city.name).width;
      ctx.fillText("首都", tx + nm + 8, y);
    }
    // 据点类型：与名称同行，靠右对齐
    const tlabel = cityTypeLabel(city.type);
    if (tlabel) {
      const twd = ctx.measureText(tlabel).width;
      ctx.fillText(tlabel, right - twd, y);
    }
    y += 22;
    if (f) {
      ctx.fillText(f.monarch, tx, y);
      y += 22;
    } else {
      ctx.fillText("中立", tx, y);
      y += 22;
    }

    // 数据区：黑底框
    const boxH = h - pad * 2 - 22 * 2;
    const boxY = y;
    ctx.fillStyle = "#000000";
    ctx.fillRect(tx, boxY, right - tx, boxH);

    const drawRow = (label, value, opts = {}) => {
      ctx.font = FONT;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, tx + 8, y);
      const v = `${value}`;
      ctx.font = DIN;
      ctx.fillStyle = opts.color ?? "#ffffff";
      const vw = ctx.measureText(v).width;
      ctx.fillText(v, right - 8 - vw, y);
      y += 20;
    };

    y = boxY + 8;
    const troops =
      (city.sim ? city.sim.troops : city.troops) ?? city.troops ?? 0;
    const rise = ((city.sim ? city.sim.morale : city.growth) ?? 100) - 100;
    const defence = (city.sim ? city.sim.food : city.defence) ?? 0;
    drawRow("城兵數", troops * 10);
    drawRow("生產力", city.prod ?? 0);
    drawRow("上昇值", rise, { color: rise < 0 ? "#ff4444" : "#ffffff" });
    drawRow("防災值", defence);
  }

  wheel(px, py, dy) {
    this.layout();
    if (!this.listDialog) return false;
    const d = this.listDialog;
    if (!this._hitListDialog(px, py)) return false;
    if (
      d.footer &&
      px >= d.fx &&
      px < d.fx + d.fw &&
      py >= d.fy &&
      py < d.fy + d.fh
    )
      return true;
    if (d.rows.length <= d.cap) return true;
    const step = 3;
    const ns = Math.max(
      0,
      Math.min(d.rows.length - d.cap, d.scroll + (dy > 0 ? step : -step)),
    );
    if (ns !== d.scroll) {
      d.scroll = ns;
      d.hover = -1;
      this.app.view.draw();
    }
    return true;
  }

  /** 面板几何 (窗口像素): 右侧两面板(小地图+资源)成列, 页面右缘对齐, 垂直居中 */
  layout() {
    const W = innerWidth;
    this.bx = Math.max(0, Math.round((W - 640) / 2));
    const panels = [];
    // 面板尺寸必须与 _drawWindow 实际外框一致, 防止上下边框重叠
    if (this.miniOpen) panels.push({ w: 224, h: 176, kind: "mini" });
    if (this.resOpen) panels.push({ w: 224, h: 208, kind: "res" });
    const gap = 8;
    let y = 32 + 4; // 右上角: 紧贴工具栏下方
    for (const p of panels) {
      p.x = W - p.w - 4; // 页面右对齐
      p.y = y;
      y += p.h + gap;
    }
    this.panels = panels;

    if (this.financeDialog) {
      this._recalcFinanceDialog();
    }
  }

  panelRect(kind) {
    return this.panels?.find((p) => p.kind === kind);
  }

  onModalClosed() {
    this.selectedSubmenu = null; // 模态弹窗关闭 → 取消子菜单被选项
    this.syncClock(); // 开始计时
    this.app.view.draw();
  }

  /** 鼠标移动暂停计时, 静止 1 秒恢复 (原版 [0x98A5] 暂停计数器语义);
   *  操作菜单/弹窗打开时计时冻结 (原版 [0xD2A]=1 主循环跳过时钟进位链) */
  isMenuOpen() {
    return !!(this.submenuOpen || this.settingsOpen);
  }

  /** 每帧同步: 只有模态弹窗 (進言/武將/勢力/存读档/列表选择) 打开时才冻结计时;
   *  菜单条/下拉/小地图/资源面板/悬停均不影响计时 */
  syncClock() {
    const c = this.app.clock;
    if (!c) return;
    const modalOpen =
      (this.app.hud?.dialogCount ?? 0) > 0 ||
      !!(
        this.listDialog ||
        this.choiceDialog ||
        this.baseMenu ||
        this.formationDialog ||
        this.financeDialog ||
        this.keypadDialog
      );
    const subActive = this.selectedSubmenu != null;
    c.hold = modalOpen || subActive; // 点击军师菜单项时停止计时
  }

  pokeClock() {
    this._lastMouse = performance.now();
    this.syncClock();
  }

  // ── 命中测试: 返回 true = 坐标在 UI 上, 地图交互不处理 ──
  hitTest(px, py) {
    this.layout();
    // ★军师菜单下任何一个菜单被选中打开时，整个游戏地图锁定不可移动，地图上的操作全部无效
    if (this.selectedSubmenu != null) return true;
    if (this.choiceDialog) return true;
    if (this.baseMenu) return true;
    if (this.listDialog) return true;
    if (this.generalCard) return true;
    if (this.formationDialog) return true;
    if (this.financeDialog) return true;
    if (this.keypadDialog) return true;

    if (this.cityCard && this._hitCityCard(px, py)) return true;
    // 军师子菜单带
    if (
      this.submenuOpen &&
      py >= 32 &&
      py < 80 &&
      px >= this.bx &&
      px < this.bx + 640
    )
      return true; // 军师子菜单带
    if (py < 32 && px >= this.bx && px < this.bx + 640) return true; // 工具栏
    if (
      this.panels.some(
        (p) => px >= p.x && px < p.x + p.w && py >= p.y && py < p.y + p.h,
      )
    )
      return true;
    return false;
  }

  /** 点击分发: 消费返回 true */
  click(px, py, btn = 0) {
    this.layout();

    // ★右键层级回退规则 (用户定稿):
    // 1. 若有子界面/弹窗打开或子菜单项处于被选状态，右键全部关闭回退到该菜单上，
    //    取消该菜单上所有被选项，所有菜单恢复未被选中状态，并立即开始计时。
    // 2. 若已回退到该菜单上且已无被选项，再次右键才关闭子菜单条本身。
    if (btn === 2) {
      if (this.keypadDialog) {
        clickSfx();
        this.closeKeypadDialog();
        return true;
      }
      if (this.formationQuote) {
        clickSfx();
        const isSuccess = this.formationQuote.type === "success";
        this.formationQuote = null;
        if (isSuccess) {
          // 编成成功后，右键关闭发言弹窗同时关闭编成面板，回到编成列表
          this.closeFormationDialog();
          this.app.hud?.showFormation?.();
        }
        this.app.view.draw();
        return true;
      }
      if (this.formationDialog) {
        clickSfx();
        this.closeFormationDialog();
        return true;
      }
      if (this.financeDialog) {
        clickSfx();
        this.closeFinanceDialog();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
        return true;
      }
      if (this.generalCard) {
        clickSfx();
        this.closeGeneralCard();
        return true;
      }

      const hadSelectedCity = Boolean(this.app?.view?.selectedCity);
      const hadBaseMenu = Boolean(this.baseMenu);
      const hadSubActive = this.selectedSubmenu != null;
      const hadList = Boolean(this.listDialog);
      const hadChoice = Boolean(this.choiceDialog);
      const hadCard = Boolean(this.cityCard);
      const hadFormation = Boolean(this.formationDialog);
      const hadFinance = Boolean(this.financeDialog);
      const hadKeypad = Boolean(this.keypadDialog);
      const advDlg = document.querySelector("#advisordlg");
      const hadAdv = advDlg && advDlg.style.display !== "none";
      const domDlgs = Array.from(document.querySelectorAll(".panel")).filter(
        (el) => el.id && el.id !== "advisordlg" && el.style.display !== "none",
      );
      const hadDomDlg = domDlgs.length > 0;

      if (
        hadBaseMenu ||
        hadSubActive ||
        hadList ||
        hadChoice ||
        hadCard ||
        hadFormation ||
        hadFinance ||
        hadKeypad ||
        hadAdv ||
        hadDomDlg ||
        hadSelectedCity
      ) {
        clickSfx();
        if (hadKeypad) this.closeKeypadDialog();
        if (hadFinance) this.closeFinanceDialog();
        if (hadFormation) this.closeFormationDialog();
        if (hadBaseMenu) this.closeBaseMenu();
        if (hadList) this.closeListDialog();
        if (hadChoice) this.closeChoiceDialog();
        if (hadCard) this.closeCityCard();
        if (hadAdv) this.app.hud?.resolveAdvice?.(null);
        domDlgs.forEach((el) => el.remove());
        this.selectedSubmenu = null; // 取消菜单上所有的被选项
        if (this.app?.view) this.app.view.selectedCity = null; // 取消据点选中状态
        this.syncClock(); // 开始计时!
        this.app.view.draw();
        return true;
      }

      // 能关闭军师菜单的只有其父菜单项（羽扇图标）的开关切换，右键不关闭军师菜单条
      if (this.settingsOpen) {
        clickSfx();
        this.settingsOpen = false;
        this.app.view.draw();
        return true;
      }
      return false;
    }

    if (this.baseMenu) {
      const i = this._hitBaseMenu(px, py);
      if (btn === 0) {
        if (i === 0) {
          // 首都確認
          clickSfx();
          this.closeBaseMenu();
          const sc = this.app.scenario;
          const me = cmd.playerFaction(sc);
          const cap = me && me.capital != null ? sc.cities[me.capital] : null;
          if (cap) {
            const view = this.app.view;
            const [wxp, wyp] = view.cityPixel(cap);
            view.cam.x = innerWidth / 2 - wxp;
            view.cam.y = innerHeight / 2 - wyp;
            view.clampCam();
            this.showCityCard(cap);
            this.selectedSubmenu = 5;
            this.syncClock();
          }
          this.app.view.draw();
          return true;
        }
        if (i === 1) {
          // 據點一覽
          clickSfx();
          this.closeBaseMenu();
          this.selectedSubmenu = 5;
          this.syncClock();
          this.app.hud.showBaseCities();
          this.selectedSubmenu = 5;
          this.app.view.draw();
          return true;
        }
      }
      // 点击在二级菜单外：消费事件，不做任何操作（只有右键才能取消关闭）
      return true;
    }

    if (this.formationDialog) {
      return this._clickFormationDialog(px, py);
    }

    if (this.keypadDialog) {
      return this._clickKeypadDialog(px, py);
    }

    if (this.financeDialog) {
      return this._clickFinanceDialog(px, py);
    }

    if (this.generalCard && this._hitGeneralCard(px, py)) {
      clickSfx();
      this.closeGeneralCard();
      return true;
    }

    if (this.listDialog && this._hitListDialog(px, py)) {
      const d = this.listDialog;
      if (this._hitListDialogClose(px, py)) {
        clickSfx();
        this.closeListDialog();
        return true;
      }
      if (btn === 0) {
        // 滚动条点击处理 (left / right 均支持)
        const hasScrollbar = d.scrollbar === "left" || d.scrollbar === "right";
        if (hasScrollbar && d.rows.length > d.cap) {
          const isLeft = d.scrollbar === "left";
          const sbx = isLeft ? d.px + 1 : d.px + d.w - 17;
          const sbw = 16;
          if (px >= sbx && px < sbx + sbw) {
            const btnH = 16;
            // 上箭头 ▲
            if (py >= d.py + d.titleH && py < d.py + d.titleH + btnH) {
              clickSfx();
              d.scroll = Math.max(0, d.scroll - 1);
              this.app.view.draw();
              return true;
            }
            // 下箭头 ▼
            if (py >= d.py + d.h - btnH && py < d.py + d.h) {
              clickSfx();
              d.scroll = Math.min(d.rows.length - d.cap, d.scroll + 1);
              this.app.view.draw();
              return true;
            }
            // 轨道
            const trackY = d.py + d.titleH + btnH;
            const trackH = d.h - d.titleH - btnH * 2;
            if (py >= trackY && py < trackY + trackH) {
              clickSfx();
              const rel = (py - trackY) / trackH;
              d.scroll = Math.max(
                0,
                Math.min(
                  d.rows.length - d.cap,
                  Math.round(rel * (d.rows.length - d.cap)),
                ),
              );
              this.app.view.draw();
              return true;
            }
          }
        }

        const ry = py - d.py - d.top;
        if (ry >= 0 && ry < d.cap * d.rowH) {
          const ri = Math.floor(ry / d.rowH) + d.scroll;
          const rx = px - d.px;
          const ci = d.cols.findIndex(
            (col) => rx >= col.x && rx < col.x + col.w,
          );
          if (ri >= 0 && ri < d.rows.length && d.onPickCell) {
            clickSfx();
            d.onPickCell(ri, ci);
            return true;
          }
          if (ri >= 0 && ri < d.rows.length && d.onPick) {
            clickSfx();
            d.selectedRow = ri;
            d.onPick(ri);
            return true;
          }
        }
      }
      return true;
    }
    if (this.cityCard && this._hitCityCard(px, py)) {
      return true;
    }
    if (this.choiceDialog) {
      return this._clickChoice(px, py, btn);
    }
    unlockSfx();

    // 工具栏图标
    if (py >= 0 && py < 32 && px >= this.bx && px < this.bx + 640) {
      const ix = px - this.bx;
      const icons = [
        ["fan", 336],
        ["flag", 368],
        ["map", 400],
        ["book", 432],
      ];
      for (const [act, ix0] of icons) {
        if (ix >= ix0 && ix < ix0 + 30 && py >= 3 && py < 28) {
          clickSfx();
          if (act === "fan") {
            this.submenuOpen = !this.submenuOpen;
            // 乒乓开关：打开或隐藏下级；隐藏时优先级最高，关闭所有子孙窗口与选中状态
            this.selectedSubmenu = null;
            this.closeBaseMenu?.();
            this.closeListDialog?.();
            this.closeGeneralCard?.();
            this.closeFormationDialog?.();
            this.closeFinanceDialog?.();
            this.closeKeypadDialog?.();
            this.closeCityCard?.();
            this.closeChoiceDialog?.();
            const advDlg = document.querySelector("#advisordlg");
            if (advDlg && advDlg.style.display !== "none") {
              this.app.hud?.resolveAdvice?.(null);
            }
            const domDlgs = Array.from(
              document.querySelectorAll(".panel"),
            ).filter(
              (el) =>
                el.id && el.id !== "advisordlg" && el.style.display !== "none",
            );
            domDlgs.forEach((el) => el.remove());
            if (this.app?.view) this.app.view.selectedCity = null;
            this.syncClock();
          }
          if (act === "flag") this.resOpen = !this.resOpen;
          if (act === "map") {
            this.miniOpen = !this.miniOpen;
            if (!this.miniOpen) {
              this.selFaction = null;
              this.closeListDialog?.();
            }
          }
          if (act === "book") this.settingsOpen = !this.settingsOpen;
          this.app.view.draw();
          return true;
        }
      }
      // 日期区无交互
      return true;
    }
    // 军师菜单带交互 (单选机制: 当有任意子项被选中时，禁止点击其他项)
    if (this.submenuOpen && py >= 32 && py < 80) {
      if (this.selectedSubmenu != null) {
        // 当前已有子菜单项被选中，不可点击其他子项
        return true;
      }
      const cellW = 78;
      const i = Math.floor((px - this.bx - 8) / cellW);
      if (i >= 0 && i < 8) {
        clickSfx();
        this.submenuClick(i);
      }
      return true;
    }
    // 小地图: 点击在窗口内即消费
    const mini = this.panelRect("mini");
    if (mini && this._miniHit(px, py)) return true;
    // 资源面板: 仅点击在面板内时消费
    const res = this.panelRect("res");
    if (
      res &&
      px >= res.x &&
      px < res.x + res.w &&
      py >= res.y &&
      py < res.y + res.h
    )
      return true;
    // 设置菜单
    if (this.settingsOpen) {
      const m = this._settingsRect();
      if (px >= m.x && px < m.x + m.w && py >= m.y && py < m.y + m.rows * 24) {
        const i = Math.floor((py - m.y) / 24);
        this.settingsClick(i);
        return true;
      }
    }
    return false;
  }

  /** 悬停: 更新 hoverAct, 返回是否需要重绘 */
  hover(px, py) {
    this.layout();
    let changed = false;
    if (this.baseMenu) {
      const old = this.baseMenu.hover;
      this.baseMenu.hover = this._hitBaseMenu(px, py);
      if (old !== this.baseMenu.hover) changed = true;
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
      return changed;
    }
    if (this.formationQuote) {
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
      return changed;
    }
    if (this.generalCard && this._hitGeneralCard(px, py)) {
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
      return changed;
    }
    if (this.formationDialog && this._hitFormationDialog(px, py)) {
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
      return changed;
    }
    if (this.choiceDialog) {
      this._recalcChoice();
      const old = this.choiceDialog.hover;
      this.choiceDialog.hover = this._hitChoice(px, py);
      changed = old !== this.choiceDialog.hover;
      return changed;
    }
    if (this.listDialog && this._hitListDialog(px, py)) {
      const d = this.listDialog;
      const old = d.hover;
      const ry = py - d.py - d.top;
      let hov = -1;
      const hasScrollbar = d.scrollbar === "left" || d.scrollbar === "right";
      const isLeft = d.scrollbar === "left";
      const sbx = isLeft ? d.px : d.px + d.w - 18;
      const inScroll =
        hasScrollbar && d.rows.length > d.cap && px >= sbx && px < sbx + 18;
      if (!inScroll && ry >= 0 && ry < d.cap * d.rowH) {
        hov = Math.floor(ry / d.rowH) + d.scroll;
        if (hov < 0 || hov >= d.rows.length) hov = -1;
      }
      d.hover = hov;
      changed = old !== hov;
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
    } else if (this.hoverAct) {
      this.hoverAct = null;
      changed = true;
    }
    return changed;
  }

  submenuClick(i) {
    const hud = this.app.hud;
    // 点击子菜单项: 记录被选状态, 停止计时 (用户定稿规则)
    this.selectedSubmenu = i;
    this.syncClock(); // 立即停止计时!
    this.hoverAct = null;
    this.app.view.draw();

    if (i === 0) return hud.showAdvice(); // 進言
    if (i === 2) return this.showFinanceDialog(); // 財政
    if (i === 3) return hud.showFormation(); // 編成
    if (i === 5) return this.showBaseMenu(); // 據點
    if (i === 6) return hud.showGenerals(); // 武將
    if (i === 7) return hud.showFactions(); // 勢力
    // 人事/財政/編成/軍團/據點 — 占位或实现
    hud.flashEvent(`「${SUBMENU[i]}」界面还原中…（右鍵取消返回）`);
  }

  settingsClick(i) {
    const hud = this.app.hud;
    if (i === 0) {
      this.settingsOpen = false;
      hud.showSaveDialog();
    } else if (i === 1) {
      this.settingsOpen = false;
      hud.showLoadDialog();
    } else if (i === 2) {
      this.muted = toggleMute();
      hud.flashEvent(this.muted ? "音效：關" : "音效：開");
      if (!this.muted) clickSfx();
    } else if (i === 3 || i === 4) {
      const c = this.app.clock;
      if (c) c.speed = Math.max(0, Math.min(3, c.speed + (i === 3 ? 1 : -1)));
      hud.flashEvent(`戰略速度 ${this.app.clock?.speed ?? "-"}`);
    } else this.settingsOpen = false;
    this.app.view.draw();
  }

  _settingsRect() {
    return { x: this.bx + 432 - 40, y: 32, w: 110, rows: 6 };
  }

  /** 遇袭城集合 (被敌对军团指向的目标城) — 小地图闪烁3次+音效 */
  blinkTargets() {
    const sc = this.app.scenario;
    const now = performance.now();
    const targets = new Set();
    if (sc)
      for (const L of sc.legions) {
        if (L.faction == null || !L.target) continue;
        // 只有敌对(非友好)军团目标才闪烁
        if (isFriendly(sc, L.faction, L.target.faction)) continue;
        targets.add(L.target.idx ?? L.target);
      }
    // 新攻击目标 → 加入闪烁队列并响一声
    let hasNew = false;
    for (const idx of targets) {
      if (!this._flashQueue.has(idx)) {
        hasNew = true;
        this._flashQueue.set(idx, now);
      }
    }
    if (hasNew) warnSfx();
    // 清理已完成 3 闪的 (每闪 500ms, 共 1500ms)
    for (const [idx, start] of this._flashQueue) {
      if (now - start > 1500) this._flashQueue.delete(idx);
    }
    return new Set(this._flashQueue.keys());
  }

  /** UI 层绘制 (MapView.draw 末尾回调) */
  draw(ctx) {
    if (!this.imgs) return;
    this.layout();
    const { bar, i1, i2, i3, i4 } = this.imgs;
    // 工具栏原大顶部居中
    ctx.drawImage(bar, this.bx, 0);
    for (const [img, ix] of [
      [i1, 336],
      [i2, 368],
      [i3, 400],
      [i4, 432],
    ])
      ctx.drawImage(img, this.bx + ix, 3);
    // 日期: 白色数字补于 年/月/日 (x496/529/562) 之前
    const c = this.app.clock;
    if (c) {
      ctx.font = DIN;
      ctx.fillStyle = c.hold ? "#aaaaaa" : "#ffffff"; // 暂停(鼠标活动)时灰显
      ctx.textBaseline = "top";
      const put = (txt, rightEdge) => {
        const w = ctx.measureText(txt).width;
        ctx.fillText(txt, this.bx + rightEdge - w, 8);
      };
      put(`${c.year}`, 494);
      put(`${c.month}`, 527);
      put(`${c.day}`, 560);
    }
    // 军师子菜单带 — 窗口构造：与 banner 同宽的金框 + 黑底 + 无分隔线 + 白字垂直居中
    if (this.submenuOpen) {
      const sx = this.bx,
        sy = 32,
        wTiles = 40,
        hTiles = 3;
      const { x, y, w, h } = this._drawWindow(
        ctx,
        sx,
        sy,
        wTiles,
        hTiles,
        "black",
      );
      const cellW = w / 8;
      // 按钮文字
      ctx.font = FONT;
      ctx.textBaseline = "top";
      SUBMENU.forEach((t, i) => {
        const sel = this.selectedSubmenu === i;
        const ix = x + i * cellW;
        if (sel) {
          // 被选状态: 实心米黄底 + 黑字
          ctx.fillStyle = CREAM;
          ctx.fillRect(ix + 1, y + 1, cellW - 2, h - 2);
          ctx.fillStyle = "#000000";
        } else {
          ctx.fillStyle = "#ffffff";
        }
        const tw = ctx.measureText(t).width;
        ctx.fillText(t, ix + (cellW - tw) / 2, y + (h - 16) / 2 + 1);
      });
    }
    // 设置菜单
    if (this.settingsOpen) {
      const m = this._settingsRect();
      const { x, y } = this._drawWindow(ctx, m.x - 8, m.y - 8, 8, 10, "black");
      ctx.font = FONT;
      ctx.textBaseline = "top";
      const labels = [
        "存檔",
        "讀檔",
        `音效：${this.muted ? "關" : "開"}`,
        "速度＋",
        "速度−",
        "關閉",
      ];
      labels.forEach((t, i) => {
        ctx.fillStyle = i === 5 ? GOLD : CREAM;
        ctx.fillText(t, x + 12, y + i * 24 + 4);
      });
    }
    if (this.miniOpen) this.drawMini(ctx);
    if (this.resOpen) this.drawRes(ctx);
    if (this.listDialog) {
      this._recalcListDialog();
      this._drawListDialog(ctx);
    }
    if (this.generalCard) {
      this._drawGeneralCard(ctx);
    }
    if (this.formationDialog) {
      this._drawFormationDialog(ctx);
    }
    if (this.financeDialog) {
      this._drawFinanceDialog(ctx);
    }
    if (this.cityCard) {
      this._recalcCityCard();
      this._drawCityCard(ctx);
    }
    if (this.choiceDialog) {
      this._drawChoice(ctx);
    }
    if (this.baseMenu) {
      this._drawBaseMenu(ctx);
    }
  }

  /** 小地图面板: 金框云窗 + 路网/海域底图 + 据点方块 + 军团路线 */
  drawMini(ctx) {
    const p = this.panelRect("mini");
    if (!p) return;
    const mw = 208, // 内区宽度, 与资源面板同宽
      mh = 139; // 按世界 6144x4096 比例的高度
    let mx, my;
    if (this._gf) {
      // 14x11 瓦片 → 外框 224x176, 内区 208x160
      const { x, y } = this._drawWindow(ctx, p.x - 8, p.y - 8, 14, 11, "cloud");
      mx = x;
      my = y;
    } else {
      ctx.fillStyle = NAVY;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
      mx = p.x + 8;
      my = p.y + 8;
    }
    // 内区 208x160：地图 208x139 置顶，下方留 21px 给名牌
    if (this.imgs.mbg) ctx.drawImage(this.imgs.mbg, mx, my, mw, mh);
    else {
      ctx.fillStyle = "#d0b080";
      ctx.fillRect(mx, my, mw, mh);
    }
    const sc = this.app.scenario;
    if (!sc) return;
    const me = cmd.playerFaction(sc);
    const kx = 208 / 6144;
    const ky = 139 / 4096;
    const blink = this.blinkTargets();
    const on = Math.floor(performance.now() / 250) % 2 === 0;
    // 军团路线 (虚线: 军团→目标)
    const t = this.app.clock?.dayProgress?.() ?? 1;
    ctx.setLineDash([3, 3]);
    for (const L of sc.legions) {
      if (L.faction == null || !L.target) continue;
      const fromX = L.prevX ?? L.x;
      const fromY = L.prevY ?? L.y;
      const toX = L.x;
      const toY = L.y;
      const isMoving = fromX !== toX || fromY !== toY;
      const curT = isMoving ? Math.min(1, Math.max(0, t)) : 1;
      const gx = fromX + (toX - fromX) * curT;
      const gy = fromY + (toY - fromY) * curT;
      ctx.strokeStyle = factionColorEx(sc, L.faction);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx + (gx * 16 + 8) * kx, my + (gy * 16 + 8) * ky);
      ctx.lineTo(
        mx + (L.target.x * 16 + 8) * kx,
        my + (L.target.y * 16 + 8) * ky,
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 据点方块: 所有点 5x5(3x3色块+1px边框)
    // 玩家黄填充#F0E000+红边框#D00000; 选中蓝填充#3040D0+白边框#FFFFFF; 其它蓝填充#3040D0+深蓝边框#002060; 空城白底黑框
    for (const c of sc.cities) {
      const x = mx + (c.x * 16 + 8) * kx;
      const y = my + (c.y * 16 + 8) * ky;
      const f = sc.factionOf(c);
      const isMe = me && f && f.idx === me.idx;
      const isSel = f && this.selFaction === f.idx;
      let col = "#eeeeee"; // 空城=白
      let border = "#000000"; // 空城=黑框
      if (isMe) {
        col = "#F0E000"; // 玩家=黄填充
        border = "#D00000"; // 玩家=红边框
      } else if (isSel) {
        col = "#3040D0"; // 选中势力=蓝填充
        border = "#FFFFFF"; // 白边框
      } else if (f) {
        col = "#3040D0"; // 其它势力=蓝填充
        border = "#002060"; // 深蓝边框
      }
      if (blink.has(c.idx) && !on) {
        // 闪烁时使用被选择查看势力的颜色
        col = "#3040D0";
        border = "#FFFFFF";
      }
      const rx = Math.round(x);
      const ry = Math.round(y);
      ctx.fillStyle = border;
      ctx.fillRect(rx - 2, ry - 2, 5, 5); // 外框 5x5（整数坐标，避免 Canvas 半像素抗锯齿把边框晕粗）
      ctx.fillStyle = col;
      ctx.fillRect(rx - 1, ry - 1, 3, 3); // 色块 3x3
    }
    // 视口线框: 当前大地图可视范围 (缩小一半, 并加 1px 右下黑色阴影)
    const view = this.app.view;
    const vx = (-view.cam.x / view.cam.scale) * kx;
    const vy = (-view.cam.y / view.cam.scale) * ky;
    const vw = ((innerWidth / view.cam.scale) * kx) / 2;
    const vh = ((innerHeight / view.cam.scale) * ky) / 2;
    const vrx = mx + vx + vw / 2;
    const vry = my + vy + vh / 2;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(vrx + 1.5, vry + 1.5, vw, vh);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(vrx + 0.5, vry + 0.5, vw, vh);
    // 底部势力名牌在地图下方: 左红底黄徽(我方), 右蓝底蓝徽(选中势力)
    const by = my + mh + 1;
    this._banner(ctx, mx, by, 102, 20, me, "#D00000", "#F0E000", "#D00000");
    const sel = sc.factions.find((f) => f.idx === this.selFaction);
    this._banner(
      ctx,
      mx + 106,
      by,
      102,
      20,
      sel,
      "#3040D0",
      "#3040D0",
      "#FFFFFF",
    );
  }

  /** 小地图底部势力名牌 (固定色底+方块徽记+居中白字) */
  _banner(ctx, x, y, w, hgt, f, bg, emblemFill, emblemBorder) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, hgt);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hgt - 1);
    // 左侧方块徽记 (与据点同色)
    const ex = x + 6,
      ey = y + Math.round((hgt - 8) / 2);
    ctx.fillStyle = emblemBorder;
    ctx.fillRect(ex, ey, 8, 8);
    ctx.fillStyle = emblemFill;
    ctx.fillRect(ex + 1, ey + 1, 6, 6);
    // 君主名水平居中 (徽记右侧)
    ctx.font = '12px "Noto Serif TC","PMingLiU",serif';
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    const text = f ? f.monarch.trim() : "－－－－";
    const tw = ctx.measureText(text).width;
    const emblemW = 18;
    ctx.fillText(text, x + emblemW + (w - emblemW - tw) / 2, y + hgt / 2);
  }

  /** 设置小地图默认查看的势力: 本章第一个有城的非玩家势力 */
  setDefaultSelFaction() {
    const sc = this.app.scenario;
    if (!sc) return;
    const me = cmd.playerFaction(sc);
    const first = sc.factions.find((f) => f.idx !== me?.idx && f.n_cities > 0);
    this.selFaction = first ? first.idx : (me?.idx ?? null);
  }

  /** 路网层 (离屏缓存): 地形图块 20(道路)/200(过河段) → 1px 网格 */
  _drawRoads(ctx, mx, my, mw, mh) {
    if (!this._roadCv) {
      const cv = document.createElement("canvas");
      cv.width = mw;
      cv.height = mh;
      const c2 = cv.getContext("2d");
      c2.fillStyle = "#e8d060"; // 原版小地图路网土黄
      const build = (u8) => {
        for (let cy = 0; cy < 256; cy++)
          for (let cx = 0; cx < 384; cx++) {
            const t = u8[cy * 384 + cx];
            if (t === 20 || t === 200)
              c2.fillRect(
                mx - mx + Math.round(cx / 2),
                Math.round(cy / 2),
                1,
                1,
              );
          }
        this._roadCv = cv;
      };
      fetch("mmap_map.bin")
        .then((r) => r.arrayBuffer())
        .then((b) => build(new Uint8Array(b)))
        .catch(() => {});
    }
    if (this._roadCv) ctx.drawImage(this._roadCv, mx, my);
  }

  /** 小地图点击: 窗口内任意点击均被消费; 地图区 → 大地图居中; 右名牌 → 选择势力 */
  _miniHit(px, py) {
    const p = this.panelRect("mini");
    if (!p) return false;
    // 整个小地图面板（含金框）内点击都消费，避免落到大地图
    if (px < p.x || py < p.y || px >= p.x + p.w || py >= p.y + p.h)
      return false;
    const mx = p.x,
      my = p.y;
    const mw = 208,
      mh = 139;
    const kx = 208 / 6144;
    const ky = 139 / 4096;
    // 名牌区: 右名牌点击 → 弹势力列表选择显示势力
    const by = my + mh + 1;
    if (py >= by && py < by + 20 && px >= mx && px < mx + mw) {
      if (px >= mx + 106) {
        clickSfx();
        this._pickSelFaction();
      }
      return true;
    }
    // 地图区: 点到哪, 大地图就移到哪 (视口中心=点击点)
    if (px >= mx && py >= my && px < mx + mw && py < my + mh) {
      clickSfx();
      const view = this.app.view;
      const wxp = ((px - mx) / kx) * view.cam.scale;
      const wyp = ((py - my) / ky) * view.cam.scale;
      view.cam.x = innerWidth / 2 - wxp;
      view.cam.y = innerHeight / 2 - wyp;
      view.clampCam();
      view.draw();
      return true;
    }
    // 金框/其它非交互区: 消费但无动作
    return true;
  }

  /** 势力选择列表 (小地图右名牌): 原版权势一览双列窗，蓝字=当前查看势力 */
  _pickSelFaction() {
    const sc = this.app.scenario;
    if (!sc) return;
    if (this.listDialog) this.closeListDialog();
    const cand = sc.factions.filter((f) => f.n_cities > 0);
    const rowH = 18;
    const titleH = 20;
    const maxVisRows = 10;
    const rows = [];
    for (let i = 0; i < cand.length; i += 2) {
      const cell = (f) => {
        if (!f) return "";
        return {
          t: f.monarch.trim(),
          color: f.idx === this.selFaction ? "#3040D0" : "#000000",
        };
      };
      rows.push({
        cells: [cell(cand[i]), cell(cand[i + 1])],
        factionIdxs: [cand[i]?.idx, cand[i + 1]?.idx],
      });
    }
    this.layout();
    const mini = this.panelRect("mini");
    if (!mini) return;
    const w = 120;
    const h = titleH + Math.min(rows.length, maxVisRows) * rowH;
    this.openListDialog({
      title: "勢力一覽",
      titleBar: true,
      header: [],
      cols: [
        { x: 8, w: 48, align: "left" },
        { x: 60, w: 48, align: "left" },
      ],
      rows,
      rowH,
      w,
      h,
      x: mini.x + 208 - w,
      y: mini.y + 176, // 内区起点；外框 top=mini.y+168，正好接在小地图金框下缘
      onPickCell: (ri, ci) => {
        const idx = rows[ri]?.factionIdxs?.[ci];
        if (idx == null) return;
        this.selFaction = idx;
        this.closeListDialog();
        this.app.view.draw();
      },
    });
  }

  /** 资源面板: 君主卡 + 信賴度 + 資金/預備兵 */
  async drawRes(ctx) {
    const p = this.panelRect("res");
    if (!p) return;
    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me) return;
    const { money, cav, arc, inf } = this.imgs;
    if (this._gf) {
      this._drawWindow(ctx, p.x - 8, p.y - 8, 14, 13, "cloud");
    } else {
      ctx.fillStyle = NAVY;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
    }
    // 君主头像 64×64 (懒加载缓存)
    const mon = sc.monarchOf(me);
    const key = mon?.portrait;
    if (this.portraitKey !== key) {
      this.portraitKey = key;
      this.portraitImg = null;
      portrait(key)
        .then((img) => {
          this.portraitImg = img;
          this.app.view.draw();
        })
        .catch(() => {});
    }
    if (this.portraitImg)
      ctx.drawImage(this.portraitImg, 0, 0, 128, 128, p.x + 8, p.y + 8, 64, 64);
    // 君主/首都/軍師 (头像右侧：标签 x=76, 竖白线 x=122, 数值 x=138)
    const cap = sc.city(me.capital);
    const advGen = adv.getAdvisor(sc, me);
    ctx.font = FONT;
    ctx.textBaseline = "top";
    const rows = [
      ["君主", me.monarch],
      ["首都", cap?.name?.trim() ?? "－"],
      ["軍師", advGen ? advGen.name.trim() : "－－－"],
    ];
    rows.forEach(([k, v], i) => {
      const y = p.y + 16 + i * 16;
      ctx.fillStyle = CREAM;
      ctx.fillText(k, p.x + 76, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(v, p.x + 138, y);
    });

    // 竖白线 (君主/首都/军师标签与姓名之间，高度从 y+14 到 y+61)
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + 122.5, p.y + 14);
    ctx.lineTo(p.x + 122.5, p.y + 61);
    ctx.stroke();

    // 信賴度: 标签与进度条分两行; 黑底条, 中央细红条 (高度 2px)。Web 面板按用户规则以100为满格(20=1/5)
    const ty = p.y + 78;
    ctx.fillStyle = CREAM;
    ctx.fillText("信賴度", p.x + 8, ty);
    const trust = sc.trust ?? 0;
    const bx = p.x + 8,
      by = ty + 20,
      bw = 192;
    ctx.fillStyle = "#050505";
    ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = trust <= 20 ? "#ff3333" : "#dd0000";
    ctx.fillRect(bx, by + 3, Math.round((bw * Math.min(100, trust)) / 100), 2);
    // 資金 / 預備兵 (原版规格: 黑底框 + 红底剪影图标 + 白色数值)
    ctx.fillStyle = "#000000";
    ctx.fillRect(p.x + 8, p.y + 112, 192, 72);

    ctx.font = FONT;
    ctx.fillStyle = CREAM;
    ctx.fillText("資金", p.x + 16, p.y + 118);
    ctx.fillText("預備兵", p.x + 16, p.y + 134);

    const resItems = [
      { img: money, val: me.gold ?? 0 },
      { img: cav, val: (me.reserve_cav ?? 0) * 10 },
      { img: arc, val: (me.reserve_arc ?? 0) * 10 },
      { img: inf, val: (me.reserve_inf ?? 0) * 10 },
    ];

    const rx = p.x + 95,
      rw = 22,
      rh = 14;

    resItems.forEach(({ img, val }, i) => {
      const iy = p.y + 118 + i * 16;
      const ry = iy + 1;

      // 红色背景图标
      ctx.fillStyle = "#d00000";
      ctx.fillRect(rx, ry, rw, rh);

      if (img) {
        ctx.drawImage(img, rx, ry, rw, rh);
      }

      // 数值 (Oswald / DIN)
      ctx.font = DIN;
      const s = `${val}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(s, p.x + 196 - ctx.measureText(s).width, iy);
      ctx.font = FONT;
    });
  }

  /** 遇袭闪烁需要持续重绘 (主循环 4Hz 调用) */
  needsAnim() {
    return this.miniOpen && this.blinkTargets().size > 0;
  }
}
