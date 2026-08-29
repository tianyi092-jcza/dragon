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
import {
  quoteFor,
  quoteForFormation,
  quoteForIndex,
  formatTalkTokens,
} from "../game/talk.js";
import { cityTypeLabel } from "../game/world.js";
import { clickSfx, warnSfx, toggleMute, unlockSfx } from "../core/speaker.js";
import {
  isFriendly,
  relation,
  declareWar,
  makeCeasefire,
  isAtWar,
} from "../game/diplomacy.js";
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
    this.personnelMenu = null; // 军师子菜单「人事」二级下拉菜单
    this.adviceMenu = null; // 军师子菜单「進言」二级下拉菜单 (敵對提案 / 停戰提案 / 請求協助 / 遷都 / 請求君主出陣)
    this.proposalAudience = null; // 敌对提案进言对话系统
    this.financeDialog = null; // 军师「財政」弹窗
    this.keypadDialog = null; // 数字输入弹窗 (税率/各兵种征兵数)
    this.legionMenu = null; // 军师子菜单「軍團」二级下拉菜单 (位置確認 / 行軍指示)
    this.marchingOrder = null; // 行军指示状态 { legion, step: 'pick_target'|'choose_order', targetCity }
    this.orderChoiceMenu = null; // 目标据点指示命令菜单 (戰鬥指揮 / 委任 / 解體)
    this._legionPortraitImg = null;
    this._legionPortraitKey = null;
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
      loadImage("grf/ivent_0_a.png"),
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
        ivent0,
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
          ivent0,
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
      onCancel: opt.onCancel ?? null,
    };
    this.layout();
    this._recalcListDialog();
    this.app.view.draw();
  }

  closeListDialog(force = false) {
    if (!this.listDialog) return;
    const cancelCb = force ? null : this.listDialog.onCancel;
    this.closeGeneralCard();
    this.closeFormationDialog();
    this.formationQuote = null;
    this.listDialog = null;
    if (cancelCb) {
      cancelCb();
      return;
    }
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
      const { x, y, h } = this._drawWindow(ctx, fx, fy, ftw, fth, "black");
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

    const me = cmd.playerFaction(sc);

    const rows = legions.map((L) => {
      const curCity = sc.cities.find((c) => c.x === L.x && c.y === L.y) || null;
      const curName = curCity?.name?.trim() ?? `(${L.x},${L.y})`;
      let targetName = (L.target?.name ?? "－－－－")?.trim();
      if (L.delegated) {
        targetName = targetName === "－－－－" ? "委任" : `${targetName}(委)`;
      }
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
        _legion: L,
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
      w: 480,
      h: 220,
      footer: {
        text: "請選擇進行行軍指示之軍團。",
      },
      onPickRow: (ri) => {
        const row = rows[ri];
        const L = row?._legion;
        if (!L || L.faction !== me?.idx) return;
        this.closeListDialog(true);
        this.selectedSubmenu = 4;
        this.marchingOrder = {
          legion: L,
          step: "pick_target",
          targetCity: null,
        };
        this.syncClock();
        this.app.view.draw();
      },
      onCancel: () => {
        this.selectedSubmenu = null;
        if (this.app?.view) this.app.view.selectedCity = null;
        this.syncClock();
        this.app.view.draw();
      },
    });
  }

  closeLegionCard() {
    this.closeListDialog();
  }

  /** 军师子菜单「軍團」: 展开二级菜单 (位置確認 / 行軍指示) */
  showLegionMenu() {
    this.closeCityCard();
    this.closeListDialog();
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeAdviceMenu();
    this.closeProposalAudience();
    this.closeMarchingOrder();
    this.selectedSubmenu = 4;
    this.syncClock();

    const cellW = 78;
    const btnX = this.bx + 8 + 4 * cellW;
    const wTiles = 7;
    const hTiles = 4;
    const ox = Math.round(btnX + (cellW - wTiles * 16) / 2);
    const oy = 72;

    this.legionMenu = {
      ox,
      oy,
      wTiles,
      hTiles,
      items: ["位置確認", "行軍指示"],
      hover: -1,
    };
    this.app.view.draw();
  }

  closeLegionMenu() {
    if (!this.legionMenu) return;
    this.legionMenu = null;
    this.app.view.draw();
  }

  _hitLegionMenu(px, py) {
    if (!this.legionMenu) return -1;
    const { ox, oy, wTiles, hTiles, items } = this.legionMenu;
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

  _drawLegionMenu(ctx) {
    if (!this.legionMenu) return;
    const { ox, oy, wTiles, hTiles, items, hover } = this.legionMenu;
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

  /** 「位置確認」: 列出我方军团，点击居中到军团位置 (KI.EXE 0x62A4 & 0x716D) */
  showLegionLocate() {
    this.closeCityCard();
    this.closeListDialog();
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeAdviceMenu();
    this.closeProposalAudience();
    this.closeMarchingOrder();
    this.selectedSubmenu = 4; // 軍團
    this.syncClock();

    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!sc || !me) return;

    const myLegions = (sc.legions ?? []).filter(
      (L) => !L.dead && L.faction === me.idx,
    );

    const rows = myLegions.map((L) => {
      const curCity = sc.cities.find((c) => c.x === L.x && c.y === L.y) || null;
      const curName = curCity?.name?.trim() ?? `(${L.x},${L.y})`;
      let targetName = (L.target?.name ?? "－－－－")?.trim();
      if (L.delegated) {
        targetName = targetName === "－－－－" ? "委任" : `${targetName}(委)`;
      }
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
        _legion: L,
        _curCity: curCity,
      };
    });

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
      w: 480,
      h: 220,
      footer: {
        text: "將游標移動至軍團的現在位置。",
      },
      onPickRow: (ri) => {
        const row = rows[ri];
        const L = row?._legion;
        if (!L) return;
        this.closeListDialog(true);

        const view = this.app.view;
        const curCity = row._curCity;
        let wxp, wyp;
        if (curCity) {
          [wxp, wyp] = view.cityPixel(curCity);
          view.selectedCity = curCity;
          this.showCityCard(curCity);
        } else {
          wxp = L.x * 16 + 8;
          wyp = L.y * 16 + 8;
          view.selectedCity = null;
        }

        view.cam.x = innerWidth / 2 - wxp;
        view.cam.y = innerHeight / 2 - wyp;
        view.clampCam();

        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      },
      onCancel: () => {
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      },
    });
  }

  /** 「行軍指示」: 列出我方军团并进入目标据点指示模式 (KI.EXE 0x62D2 & 0x7F90) */
  showLegionMarchOrders() {
    this.closeCityCard();
    this.closeListDialog();
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeAdviceMenu();
    this.closeProposalAudience();
    this.closeMarchingOrder();
    this.selectedSubmenu = 4; // 軍團
    this.syncClock();

    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!sc || !me) return;

    const myLegions = (sc.legions ?? []).filter(
      (L) => !L.dead && L.faction === me.idx,
    );

    const rows = myLegions.map((L) => {
      const curCity = sc.cities.find((c) => c.x === L.x && c.y === L.y) || null;
      const curName = curCity?.name?.trim() ?? `(${L.x},${L.y})`;
      let targetName = (L.target?.name ?? "－－－－")?.trim();
      if (L.delegated) {
        targetName = targetName === "－－－－" ? "委任" : `${targetName}(委)`;
      }
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
        _legion: L,
      };
    });

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
      w: 480,
      h: 220,
      footer: {
        text: "請選擇進行行軍指示之軍團。",
      },
      onPickRow: (ri) => {
        const row = rows[ri];
        const L = row?._legion;
        if (!L) return;
        this.closeListDialog(true);

        // 进入目标据点指示模式 (大地图可平移拖拽，右侧显示军团详细面板，底部提示 Talk 3)
        this.selectedSubmenu = 4;
        this.marchingOrder = {
          legion: L,
          step: "pick_target",
          targetCity: null,
        };
        this.syncClock();
        this.app.view.draw();
      },
      onCancel: () => {
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      },
    });
  }

  closeMarchingOrder() {
    this.closeOrderChoiceMenu();
    this.marchingOrder = null;
    this.app.view.draw();
  }

  /** 弹出目标据点战斗指示选择菜单 (KI.EXE 0x7FDB - 0x804E, Talk 76) */
  showOrderChoiceMenu(city) {
    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    const isCapital = me && city && city.idx === me.capital;
    const items = isCapital
      ? ["戰鬥指揮", "委　　任", "解　　體"]
      : ["戰鬥指揮", "委　　任"];
    const wTiles = 7;
    const hTiles = items.length + 2;

    const view = this.app.view;
    const [wxp, wyp] = view.cityPixel(city);
    const sx = view.sx(wxp);
    const sy = view.sy(wyp);
    const w = wTiles * 16;
    const h = hTiles * 16;
    const ox = Math.max(8, Math.min(innerWidth - w - 8, sx + 16));
    const oy = Math.max(40, Math.min(innerHeight - h - 8, sy - 8));

    this.orderChoiceMenu = {
      city,
      items,
      ox,
      oy,
      wTiles,
      hTiles,
      hover: -1,
    };
    this.app.view.draw();
  }

  closeOrderChoiceMenu() {
    if (!this.orderChoiceMenu) return;
    this.orderChoiceMenu = null;
    this.app.view.draw();
  }

  _hitOrderChoiceMenu(px, py) {
    const m = this.orderChoiceMenu;
    if (!m) return -1;
    const { ox, oy, wTiles, hTiles, items } = m;
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

  _drawOrderChoiceMenu(ctx) {
    const m = this.orderChoiceMenu;
    if (!m) return;
    const { ox, oy, wTiles, hTiles, items, hover } = m;
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

  /** 获取军团 6 队编制信息 */
  _getLegionUnits(legion) {
    if (Array.isArray(legion.units) && legion.units.length === 6) {
      return legion.units;
    }
    const tot = (legion.troops ?? 0) * 10;
    const per = Math.floor(tot / 6);
    const rem = tot % 6;
    const defaultTypes = [0, 0, 1, 1, 2, 2];
    const units = defaultTypes.map((t, idx) => ({
      name: ["主將", "前鋒", "左翼", "右翼", "左備", "右備"][idx],
      type: t,
      troops: per + (idx < rem ? 1 : 0),
    }));
    legion.units = units;
    return units;
  }

  /** 军团解体: 将兵力全额返还势力预备兵池 (KI.EXE 0x463E & 0x4717) */
  _disbandLegion(legion) {
    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me || !legion) return;

    const units = this._getLegionUnits(legion);
    for (const u of units) {
      const count = u.troops || 0;
      const poolAdd = Math.floor(count / 10);
      if (u.type === 0) me.reserve_cav = (me.reserve_cav ?? 0) + poolAdd;
      else if (u.type === 1) me.reserve_inf = (me.reserve_inf ?? 0) + poolAdd;
      else if (u.type === 2) me.reserve_arc = (me.reserve_arc ?? 0) + poolAdd;
    }

    const gen = sc.generals?.find((g) => g.name === legion.leader);
    if (gen) {
      gen.status = 0;
      gen.is_monarch = false;
    }
    const monarch = sc.monarchOf(me);
    if (monarch && monarch.name === legion.leader) {
      monarch.status = 0;
      monarch.is_monarch = false;
    }

    legion.dead = true;
    sc.legions = sc.legions.filter((l) => !l.dead && l !== legion);

    this.app.hud?.flashEvent?.(
      `「${legion.leader}」軍團已解體，兵員轉為預備兵。`,
    );
    this.app.hud?.refreshInfo?.();
  }

  /** 绘制行军指示全套 UI (右侧军团详细信息面板 + 底部 NPC 提示窗口) */
  _drawMarchingOrder(ctx) {
    const m = this.marchingOrder;
    if (!m) return;

    // 1. 绘制右侧 14×13 tiles 军团详细信息面板
    this._drawLegionDetailPanel(ctx, m.legion);

    // 2. 绘制底部 NPC 提示窗口 (Talk 3 / Talk 21)
    const promptText =
      m.step === "choose_order" && m.targetCity
        ? `向${m.targetCity.name.trim()}移動下。請下達戰鬥指示。`
        : "請指示行軍目標之據點。";
    this._drawBottomPromptWindow(ctx, promptText);
  }

  /** 绘制军团详细信息面板 (14×13 tiles = 224×208, KI.EXE 0x807B & 0x812A) */
  _drawLegionDetailPanel(ctx, legion) {
    if (!legion) return;
    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me) return;

    const W = innerWidth;
    const pw = 224;
    const ph = 208;
    const px = W - pw - 4;
    const res = this.panelRect("res");
    const targetY = res ? res.y + res.h + 8 : 36;
    let py = targetY;
    if (targetY + ph > innerHeight - 8) {
      py = res ? res.y : 36;
    }

    const win = this._drawWindow(ctx, px, py, 14, 13, "cloud");
    const x = win ? win.x : px + 8;
    const y = win ? win.y : py + 8;

    const gen = sc.generals?.find((g) => g.name === legion.leader);
    const monarch = sc.monarchOf(me);
    const isMonarch = legion.is_monarch || gen?.name === monarch?.name;

    // 1. 头像 64x64
    const portraitKey = gen?.portrait ?? monarch?.portrait;
    if (this._legionPortraitKey !== portraitKey) {
      this._legionPortraitKey = portraitKey;
      this._legionPortraitImg = null;
      portrait(portraitKey)
        .then((img) => {
          this._legionPortraitImg = img;
          this.app.view.draw();
        })
        .catch(() => {});
    }
    if (this._legionPortraitImg) {
      ctx.drawImage(this._legionPortraitImg, 0, 0, 128, 128, x, y, 64, 64);
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, 64, 64);
    }

    // 2. 右侧信息: 將軍/君主, 首都, 總兵力, 士氣值
    const cap = sc.city(me.capital);
    ctx.font = FONT;
    ctx.textBaseline = "top";
    const infoRows = [
      [isMonarch ? "君主" : "將軍", legion.leader || "？", false],
      ["首都", cap?.name?.trim() ?? "無", false],
      ["總兵力", `${(legion.troops ?? 0) * 10}`, true],
      ["士氣值", `${legion.morale ?? 200}`, true],
    ];

    infoRows.forEach(([label, val, isNum], i) => {
      const iy = y + i * 16;
      ctx.fillStyle = CREAM;
      ctx.fillText(label, x + 72, iy);
      ctx.fillStyle = "#ffffff";
      if (isNum) {
        ctx.font = DIN;
        ctx.fillText(val, x + 130, iy);
        ctx.font = FONT;
      } else {
        ctx.fillText(val, x + 130, iy);
      }
    });

    // 竖直分隔白线
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 118.5, y + 2);
    ctx.lineTo(x + 118.5, y + 62);
    ctx.stroke();

    // 3. 下方 6 队编制
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y + 68, 208, 116);

    const unitNames = ["主將", "前鋒", "左翼", "右翼", "左備", "右備"];
    const units = this._getLegionUnits(legion);
    const { cav, arc, inf } = this.imgs;
    const typeImgs = [cav, inf, arc];

    units.forEach((u, i) => {
      const uy = y + 72 + i * 18;
      // 编制名称
      ctx.fillStyle = CREAM;
      ctx.fillText(unitNames[i] || "隊伍", x + 8, uy);

      // 红底兵种图标
      const rx = x + 76;
      const ry = uy + 1;
      const rw = 22;
      const rh = 14;
      ctx.fillStyle = "#d00000";
      ctx.fillRect(rx, ry, rw, rh);
      const img = typeImgs[u.type ?? 0];
      if (img) {
        ctx.drawImage(img, rx, ry, rw, rh);
      }

      // 兵力数值
      ctx.font = DIN;
      ctx.fillStyle = "#ffffff";
      const s = `${u.troops ?? 0}`;
      ctx.fillText(s, x + 192 - ctx.measureText(s).width, uy);
      ctx.font = FONT;
    });
  }

  _hitLegionDetailPanel(px, py) {
    if (!this.marchingOrder) return false;
    const W = innerWidth;
    const pw = 224;
    const ph = 208;
    const px0 = W - pw - 4;
    const res = this.panelRect("res");
    const targetY = res ? res.y + res.h + 8 : 36;
    let py0 = targetY;
    if (targetY + ph > innerHeight - 8) {
      py0 = res ? res.y : 36;
    }
    return px >= px0 && px < px0 + pw && py >= py0 && py < py0 + ph;
  }

  /** 绘制底部统一规格信息提示窗口 (480×80, 30×5 tiles, 黑底金框 + NPC 头像 + 白字折行) */
  _drawBottomPromptWindow(ctx, rawText) {
    if (!this.imgs?.messageNpc) return;
    const fw = 480;
    const fh = 64;
    const fx = Math.round((innerWidth - fw) / 2);
    const fy = innerHeight - 64 - 24; // 8px 底部间隙
    const ftw = Math.ceil((fw + 16) / 16);
    const fth = Math.ceil((fh + 16) / 16);
    const { x, y } = this._drawWindow(ctx, fx, fy, ftw, fth, "black");
    const ph = 64;
    ctx.drawImage(this.imgs.messageNpc, x, y, ph, ph);
    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    const tx = x + ph + 14;
    const maxTextW = Math.max(40, (ftw - 1) * 16 - ph - 28);

    const lines = [];
    for (const paragraph of String(rawText ?? "").split("\n")) {
      if (!paragraph) {
        lines.push("");
        continue;
      }
      let cur = "";
      for (const char of paragraph) {
        if (ctx.measureText(cur + char).width > maxTextW) {
          lines.push(cur);
          cur = char;
        } else {
          cur += char;
        }
      }
      if (cur) lines.push(cur);
    }

    const lineH = 18;
    const totalH = lines.length * lineH;
    const textStartY = y + Math.max(0, Math.floor((ph - totalH) / 2));
    lines.forEach((line, li) => {
      ctx.fillText(line, tx, textStartY + li * lineH);
    });
  }

  _hitBottomPromptWindow(px, py) {
    if (!this.marchingOrder) return false;
    const fw = 480;
    const fh = 64;
    const fx = Math.round((innerWidth - fw) / 2);
    const fy = innerHeight - 64 - 24;
    return px >= fx - 8 && px < fx + fw + 8 && py >= fy - 8 && py < fy + fh + 8;
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

  /** 军师子菜单「人事」二级下拉菜单 (內政官任命 / 內政官解任 / 外交官任命 / 外交官解任) */
  showPersonnelMenu() {
    this.closeCityCard();
    this.closeListDialog();
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.selectedSubmenu = 1;
    this.syncClock();

    const cellW = 78;
    const btnX = this.bx + 8 + 1 * cellW;
    const wTiles = 8;
    const hTiles = 6;
    const ox = Math.round(btnX - 22);
    const oy = 72;

    this.personnelMenu = {
      ox,
      oy,
      wTiles,
      hTiles,
      items: ["內政官任命", "內政官解任", "外交官任命", "外交官解任"],
      hover: -1,
    };
    this.app.view.draw();
  }

  closePersonnelMenu() {
    if (!this.personnelMenu) return;
    this.personnelMenu = null;
    this.app.view.draw();
  }

  _hitPersonnelMenu(px, py) {
    if (!this.personnelMenu) return -1;
    const { ox, oy, wTiles, hTiles, items } = this.personnelMenu;
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

  _drawPersonnelMenu(ctx) {
    if (!this.personnelMenu) return;
    const { ox, oy, wTiles, hTiles, items, hover } = this.personnelMenu;
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

  /** 军师子菜单「進言」二级下拉菜单 (敵對提案 / 停戰提案 / 請求協助 / 遷都 / 請求君主出陣) */
  showAdviceMenu() {
    this.closeCityCard();
    this.closeListDialog();
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeProposalAudience();
    this.selectedSubmenu = 0;
    this.syncClock();

    const btnX = this.bx + 8;
    const wTiles = 8;
    const hTiles = 7;
    const ox = Math.round(btnX - 22);
    const oy = 72;

    this.adviceMenu = {
      ox,
      oy,
      wTiles,
      hTiles,
      items: ["敵對提案", "停戰提案", "請求協助", "遷都", "請求君主出陣"],
      hover: -1,
    };
    this.app.view.draw();
  }

  closeAdviceMenu() {
    if (!this.adviceMenu) return;
    this.adviceMenu = null;
    this.app.view.draw();
  }

  _hitAdviceMenu(px, py) {
    if (!this.adviceMenu) return -1;
    const { ox, oy, wTiles, hTiles, items } = this.adviceMenu;
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

  _drawAdviceMenu(ctx) {
    if (!this.adviceMenu) return;
    const { ox, oy, wTiles, hTiles, items, hover } = this.adviceMenu;
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

  /** 敌对提案进言对话系统 (100% 逆向复刻 KI.EXE 0x6475, 0x3830, 0x3B5A, 0x3BA9, 0x3C1E) */
  async showHostileProposalAudience(targetFaction) {
    this.closeCityCard();
    this.closeListDialog(true);
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeAdviceMenu();
    this.selectedSubmenu = 0;
    this.syncClock();

    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me || !targetFaction) return;

    const monarch = sc.monarchOf(me);
    const advGen = adv.getAdvisor(sc, me);
    const monarchImg = monarch
      ? await portrait(monarch.portrait).catch(() => null)
      : null;
    const advImg = advGen
      ? await portrait(advGen.portrait).catch(() => null)
      : null;

    const targetName = (targetFaction.monarch ?? "").trim();
    const advName = (advGen?.name ?? "軍師").trim();
    const monarchTalkIdx = (monarch?.talk_idx ?? monarch?.idx ?? 0) % 3;

    // 初始君主提问对白 (Talk 86..88)
    const monarchGreeting = await formatTalkTokens(
      86 + monarchTalkIdx,
      targetName,
      advName,
    );

    // 4 大理由客观有效性判定 (KI.EXE 0x6475 & 0x6A28)
    const rel = relation(sc, me.idx, targetFaction.idx);
    const bellicosity = me.bellicosity ?? 10;

    // r0: 外交关系恶劣
    const r0Valid = rel < bellicosity + 15;
    // r1: 我国较有利 (综合城池与好战度乘积对比)
    const myScore = (me.n_cities ?? 1) * (bellicosity + 20);
    const enemyScore = (targetFaction.n_cities ?? 1) * 25;
    const r1Valid = myScore > enemyScore;
    // r2: 敌正侵攻他国 (目标势力攻击目标非空且非我方)
    const r2Valid =
      targetFaction.target_faction != null &&
      targetFaction.target_faction !== 0xff &&
      targetFaction.target_faction !== me.idx;
    // r3: 敌势力疲乏 (资金为负/赤字)
    const r3Valid =
      (targetFaction.money ?? 0) < 0 ||
      (targetFaction.gold ?? 0) < 0 ||
      (targetFaction.money_status ?? 0) < 0;

    // 信赖度决定说服所需理由数 (KI.EXE 0x3C1E)
    const trustVal = sc.trust ?? 255;
    let requiredReasons = 4;
    if (trustVal >= 224) requiredReasons = 1;
    else if (trustVal >= 144) requiredReasons = 2;
    else if (trustVal >= 32) requiredReasons = 3;

    this.proposalAudience = {
      type: "hostile",
      playerFaction: me,
      targetFaction,
      monarch,
      advGen,
      monarchImg,
      advImg,
      targetName,
      advName,
      monarchTalkIdx,
      monarchLines: monarchGreeting,
      advLines: null,
      step: "greet",
      timer: null,
      timerAction: null,
      reasonsHover: -1,
      validReasons: [r0Valid, r1Valid, r2Valid, r3Valid],
      usedReasons: new Set(),
      requiredReasons,
      reasonsItems: [
        "外交關係惡劣",
        "我國較有利",
        "敵正侵攻他國",
        "敵勢力疲乏",
        "撤回進言",
      ],
    };

    this.app.view.draw();

    // 延时 3 秒自动进入军师进言，或玩家点击左键立即进入
    this._setProposalTimer(3000, async () => {
      await this._advanceToAdvisorPropose();
    });
  }

  /** 停战提案进言对话系统 (100% 逆向复刻 KI.EXE 0x64F1, 0x6577, 0x3830, 0x3B5A, 0x3BA9, 0x3C1E) */
  async showTruceProposalAudience(targetFaction) {
    this.closeCityCard();
    this.closeListDialog(true);
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeAdviceMenu();
    this.selectedSubmenu = 0;
    this.syncClock();

    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me || !targetFaction) return;

    const monarch = sc.monarchOf(me);
    const advGen = adv.getAdvisor(sc, me);
    const monarchImg = monarch
      ? await portrait(monarch.portrait).catch(() => null)
      : null;
    const advImg = advGen
      ? await portrait(advGen.portrait).catch(() => null)
      : null;

    const targetName = (targetFaction.monarch ?? "").trim();
    const advName = (advGen?.name ?? "軍師").trim();
    const monarchTalkIdx = (monarch?.talk_idx ?? monarch?.idx ?? 0) % 3;

    // 初始君主提问对白 (Talk 150..152: "\4，有什麼事嗎？")
    const monarchGreeting = await formatTalkTokens(
      150 + monarchTalkIdx,
      targetName,
      advName,
    );

    // 4 大理由客观有效性判定 (KI.EXE 0x6577)
    const bellicosity = me.bellicosity ?? 10;

    // r0: 對我國較不利 (我军总体实力 < 敌军实力)
    const myScore = (me.n_cities ?? 1) * (bellicosity + 20);
    const enemyScore = (targetFaction.n_cities ?? 1) * 25;
    const r0Valid = myScore < enemyScore;

    // r1: 我正在防禦戰 (处于交战状态的敌方势力数 >= 2)
    const warCount = sc.factions.filter(
      (f) => f && f.idx !== me.idx && isAtWar(sc, me.idx, f.idx),
    ).length;
    const r1Valid = warCount >= 2;

    // r2: 敵正侵攻他國 (目标势力正在进攻第三方势力)
    const r2Valid =
      targetFaction.target_faction != null &&
      targetFaction.target_faction !== 0xff &&
      targetFaction.target_faction !== me.idx;

    // r3: 我國力疲乏 (国库资金偏低或赤字)
    const r3Valid =
      (me.money ?? 0) < 0 ||
      (me.gold ?? 0) < 1000 ||
      (me.money_status ?? 0) < 0;

    // 信赖度决定说服所需理由数 (KI.EXE 0x3C1E)
    const trustVal = sc.trust ?? 255;
    let requiredReasons = 4;
    if (trustVal >= 224) requiredReasons = 1;
    else if (trustVal >= 144) requiredReasons = 2;
    else if (trustVal >= 32) requiredReasons = 3;

    this.proposalAudience = {
      type: "truce",
      playerFaction: me,
      targetFaction,
      monarch,
      advGen,
      monarchImg,
      advImg,
      targetName,
      advName,
      monarchTalkIdx,
      monarchLines: monarchGreeting,
      advLines: null,
      step: "greet",
      timer: null,
      timerAction: null,
      reasonsHover: -1,
      validReasons: [r0Valid, r1Valid, r2Valid, r3Valid],
      usedReasons: new Set(),
      requiredReasons,
      reasonsItems: [
        "對我國較不利",
        "我正在防禦戰",
        "敵正侵攻他國",
        "我國力疲乏",
        "撤回進言",
      ],
    };

    this.app.view.draw();

    // 延时 3 秒自动进入军师进言，或玩家点击左键立即进入
    this._setProposalTimer(3000, async () => {
      await this._advanceToAdvisorPropose();
    });
  }

  /** 请求协助进言对话系统 (100% 逆向复刻 KI.EXE 0x6623, 0x66D9, 0x6695, 0x301C) */
  async showAssistanceProposalAudience(allyFaction, targetFaction) {
    this.closeCityCard();
    this.closeListDialog(true);
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeAdviceMenu();
    this.selectedSubmenu = 0;
    this.syncClock();

    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me || !allyFaction || !targetFaction) return;

    const monarch = sc.monarchOf(me);
    const advGen = adv.getAdvisor(sc, me);
    const monarchImg = monarch
      ? await portrait(monarch.portrait).catch(() => null)
      : null;
    const advImg = advGen
      ? await portrait(advGen.portrait).catch(() => null)
      : null;

    const allyName = (allyFaction.monarch ?? "").trim();
    const targetName = (targetFaction.monarch ?? "").trim();
    const advName = (advGen?.name ?? "軍師").trim();
    const monarchTalkIdx = (monarch?.talk_idx ?? monarch?.idx ?? 0) % 3;

    // 初始君主提问对白 (Talk 214..216: "\4啊，突然來找我是為了什麼事啊？")
    const monarchGreeting = await formatTalkTokens(
      214 + monarchTalkIdx,
      allyName,
      advName,
    );

    // 4 大理由客观有效性判定 (KI.EXE 0x66D9)
    const relAlly = relation(sc, me.idx, allyFaction.idx);
    const bellicosity = me.bellicosity ?? 10;
    const myPower = (me.n_cities ?? 1) * (bellicosity + 20);
    const allyPower = (allyFaction.n_cities ?? 1) * 25;
    const targetPower = (targetFaction.n_cities ?? 1) * 25;

    // r0: 外交關係良好 (友好度 >= bellicosity * 4 + 60 | 0x80)
    const r0Valid = relAlly >= (((bellicosity * 4 + 60) & 0x7f) | 0x80);
    // r1: 協力國強大 (协助势力总体实力 > 我军实力)
    const r1Valid = allyPower > myPower;
    // r2: 侵攻對象強大 (目标势力总体实力 > 我军实力)
    const r2Valid = targetPower > myPower;
    // r3: 我正在防禦戰 (目标势力正在进攻我方)
    const r3Valid = targetFaction.target_faction === me.idx;

    // 信赖度决定说服所需理由数 (KI.EXE 0x3C1E)
    const trustVal = sc.trust ?? 255;
    let requiredReasons = 4;
    if (trustVal >= 224) requiredReasons = 1;
    else if (trustVal >= 144) requiredReasons = 2;
    else if (trustVal >= 32) requiredReasons = 3;

    this.proposalAudience = {
      type: "assistance",
      playerFaction: me,
      allyFaction,
      targetFaction,
      monarch,
      advGen,
      monarchImg,
      advImg,
      allyName,
      targetName,
      advName,
      monarchTalkIdx,
      monarchLines: monarchGreeting,
      advLines: null,
      step: "greet",
      timer: null,
      timerAction: null,
      reasonsHover: -1,
      validReasons: [r0Valid, r1Valid, r2Valid, r3Valid],
      usedReasons: new Set(),
      requiredReasons,
      reasonsItems: [
        "外交關係良好",
        "協力國強大",
        "侵攻對象強大",
        "我正在防禦戰",
        "撤回進言",
      ],
    };

    this.app.view.draw();

    this._setProposalTimer(3000, async () => {
      await this._advanceToAdvisorPropose();
    });
  }

  /** 迁都进言对话系统 (100% 逆向复刻 KI.EXE 0x6909, 0x6951, 0x3B08, 0x33FD) */
  async showRelocateCapitalAudience(targetCity) {
    this.closeCityCard();
    this.closeListDialog(true);
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeAdviceMenu();
    this.selectedSubmenu = 0;
    this.syncClock();

    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me || !targetCity) return;

    const monarch = sc.monarchOf(me);
    const advGen = adv.getAdvisor(sc, me);
    const monarchImg = monarch
      ? await portrait(monarch.portrait).catch(() => null)
      : null;
    const advImg = advGen
      ? await portrait(advGen.portrait).catch(() => null)
      : null;

    const cityName = (targetCity.name ?? "").trim();
    const advName = (advGen?.name ?? "軍師").trim();
    const monarchTalkIdx = (monarch?.talk_idx ?? monarch?.idx ?? 0) % 3;

    // 初始君主提问对白 (Talk 386..388: "對此地是否有何不滿呢？")
    const monarchGreeting = await formatTalkTokens(
      386 + monarchTalkIdx,
      "",
      advName,
      "",
      "",
      cityName,
    );

    // 迁都评估 (KI.EXE 0x6951): 比较新城与旧城 tier (type) 与生产力
    const curCap =
      (me.capital == null ? null : sc.cities[me.capital]) || targetCity;
    const isBetter =
      (targetCity.type ?? 2) <= (curCap.type ?? 2) &&
      (targetCity.prod ?? 0) >= (curCap.prod ?? 0) * 0.7;

    this.proposalAudience = {
      type: "relocate",
      playerFaction: me,
      targetCity,
      curCap,
      isBetter,
      monarch,
      advGen,
      monarchImg,
      advImg,
      cityName,
      advName,
      monarchTalkIdx,
      monarchLines: monarchGreeting,
      advLines: null,
      step: "greet",
      timer: null,
      timerAction: null,
    };

    this.app.view.draw();

    this._setProposalTimer(3000, async () => {
      await this._advanceToAdvisorPropose();
    });
  }

  /** 请求君主出阵进言对话系统 (100% 逆向复刻 KI.EXE 0x699E, 0x69B4, 0x3B08, 0x6E8F, 0x5E80) */
  async showMonarchDeployAudience() {
    this.closeCityCard();
    this.closeListDialog(true);
    this.closeGeneralCard();
    this.closeChoiceDialog();
    this.closeBaseMenu();
    this.closePersonnelMenu();
    this.closeAdviceMenu();
    this.selectedSubmenu = 0;
    this.syncClock();

    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me) return;

    const monarch = sc.monarchOf(me);
    if (!monarch) return;

    // 检查君主是否已经在军团出征中 (KI.EXE 0x69A0: Talk 64)
    const isDeploying =
      monarch.status === 1 ||
      sc.legions?.some(
        (L) =>
          !L.dead &&
          L.faction === me.idx &&
          (L.leader === monarch.name ||
            L.leader === monarch.idx ||
            L.is_monarch),
      );
    if (isDeploying) {
      const lines = await formatTalkTokens(64);
      await this.showNpcMessageDialog({
        lines,
        autoClose: 3000,
        onClose: () => {
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        },
      });
      return;
    }

    const advGen = adv.getAdvisor(sc, me);
    const monarchImg = monarch
      ? await portrait(monarch.portrait).catch(() => null)
      : null;
    const advImg = advGen
      ? await portrait(advGen.portrait).catch(() => null)
      : null;

    const advName = (advGen?.name ?? "軍師").trim();
    const monarchTalkIdx = (monarch?.talk_idx ?? monarch?.idx ?? 0) % 3;

    // 初始君主提问对白 (Talk 396..398: "軍師，戰況有所不利嗎？")
    const monarchGreeting = await formatTalkTokens(
      396 + monarchTalkIdx,
      "",
      advName,
    );

    // 出阵评估 (100% 逆向 KI.EXE 0x699E - 0x69EC)
    // 条件 1: 君主好战度 vs 国库资金 (0x69B6 - 0x69CE)
    const bellicosity = me.bellicosity ?? 10;
    const minGold = Math.max(0, (15 - bellicosity) * 400);
    const currentGold = me.gold ?? 0;
    const hasEnoughGold = currentGold >= 0 && currentGold >= minGold;

    // 条件 2: 势力总预备兵力是否 >= 600 (即 6000 人, 0x69D2 - 0x69EC)
    const totRes =
      ((me.reserve_cav ?? 0) + (me.reserve_inf ?? 0) + (me.reserve_arc ?? 0)) *
      10;
    const hasEnoughReserves = totRes >= 6000;

    const canDeploy = hasEnoughGold && hasEnoughReserves;

    this.proposalAudience = {
      type: "monarch_deploy",
      playerFaction: me,
      monarch,
      advGen,
      canDeploy,
      monarchImg,
      advImg,
      advName,
      monarchTalkIdx,
      monarchLines: monarchGreeting,
      advLines: null,
      step: "greet",
      timer: null,
      timerAction: null,
    };

    this.app.view.draw();

    this._setProposalTimer(3000, async () => {
      await this._advanceToAdvisorPropose();
    });
  }

  _setProposalTimer(ms, action) {
    if (!this.proposalAudience) return;
    if (this.proposalAudience.timer) {
      clearTimeout(this.proposalAudience.timer);
    }
    this.proposalAudience.timerAction = action;
    this.proposalAudience.timer = setTimeout(() => {
      if (this.proposalAudience) {
        this.proposalAudience.timer = null;
        action();
      }
    }, ms);
  }

  async _advanceToAdvisorPropose() {
    const p = this.proposalAudience;
    if (!p) return;
    p.step = "advisor_propose";
    if (p.type === "truce") {
      // 军师停战发言：Talk 153 (我認為與\3還是停戰為宜。)
      p.advLines = await formatTalkTokens(153, p.targetName, p.advName);
    } else if (p.type === "assistance") {
      // 军师请求协助发言：Talk 217 (和\3大人合作，去打倒\3如何？)
      p.advLines = await formatTalkTokens(
        217,
        [p.allyName, p.targetName],
        p.advName,
      );
    } else if (p.type === "relocate") {
      // 军师迁都发言：Talk 389 (為今後之事設想，我認為遷移到\2為宜。)
      p.advLines = await formatTalkTokens(
        389,
        "",
        p.advName,
        "",
        "",
        p.cityName,
      );
    } else if (p.type === "monarch_deploy") {
      // 军师请求君主出阵发言：Talk 399 (若請主公出陣，將士的士氣也會提高吧。)
      p.advLines = await formatTalkTokens(399, "", p.advName);
    } else {
      // 军师敌对发言：Talk 89 (想請主公答允對\3的進兵。)
      p.advLines = await formatTalkTokens(89, p.targetName, p.advName);
    }
    this.app.view.draw();

    this._setProposalTimer(3000, async () => {
      await this._advanceToMonarchReaction();
    });
  }

  async _advanceToMonarchReaction() {
    const p = this.proposalAudience;
    if (!p) return;
    const sc = this.app.scenario;
    const me = p.playerFaction;
    const targetFaction = p.targetFaction;

    const rel = targetFaction ? relation(sc, me.idx, targetFaction.idx) : 0;
    const bellicosity = me.bellicosity ?? 10;
    const atWar = targetFaction
      ? isAtWar(sc, me.idx, targetFaction.idx)
      : false;

    if (p.type === "relocate") {
      if (p.isBetter) {
        clickSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          390 + p.monarchTalkIdx,
          "",
          p.advName,
          "",
          "",
          p.cityName,
        );
        sc.trust = Math.min(255, (sc.trust ?? 255) + 10);
        me.capital = p.targetCity.idx;
        sc.capital = p.targetCity.idx;
        this.app.hud.refreshTrust();
        this.app.hud.refreshInfo?.();
        this.app.hud.flashEvent(
          `「${p.playerFaction.monarch}」同意遷都至「${p.cityName}」！信賴度 +10`,
        );
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          const view = this.app.view;
          const [wxp, wyp] = view.cityPixel(p.targetCity);
          view.cam.x = innerWidth / 2 - wxp;
          view.cam.y = innerHeight / 2 - wyp;
          view.clampCam();
          this.showCityCard(p.targetCity);
          this.selectedSubmenu = 0;
          this.syncClock();
          this.app.view.draw();
        });
      } else {
        warnSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          393 + p.monarchTalkIdx,
          "",
          p.advName,
          "",
          "",
          p.cityName,
        );
        sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(`遷都據點條件欠佳！進言被訓斥駁回，信賴度 -20`);
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
      }
      return;
    }

    if (p.type === "monarch_deploy") {
      if (p.canDeploy) {
        clickSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          400 + p.monarchTalkIdx,
          "",
          p.advName,
        );

        // 扣除预备兵 200 骑兵、200 步兵、200 弓兵 (以 10 兵为单位)
        me.reserve_cav = Math.max(0, (me.reserve_cav ?? 0) - 200);
        me.reserve_inf = Math.max(0, (me.reserve_inf ?? 0) - 200);
        me.reserve_arc = Math.max(0, (me.reserve_arc ?? 0) - 200);

        // 创建君主亲征军团 (6000 兵力，驻守首都)
        p.monarch.status = 1;
        p.monarch.is_monarch = true;
        const cap =
          (me.capital == null ? null : sc.cities[me.capital]) ||
          sc.citiesOf(me.idx)[0];

        if (!sc.legions) sc.legions = [];
        const newLegion = {
          leader: p.monarch.name,
          is_monarch: true,
          faction: me.idx,
          x: cap.x,
          y: cap.y,
          prevX: cap.x,
          prevY: cap.y,
          troops: 600, // 6000 兵
          morale: 200,
          formation: 1,
          target: cap,
          cooldown: 0,
          units: [
            { type: 0, troops: 1000 },
            { type: 0, troops: 1000 },
            { type: 1, troops: 1000 },
            { type: 1, troops: 1000 },
            { type: 2, troops: 1000 },
            { type: 2, troops: 1000 },
          ],
        };
        sc.legions.push(newLegion);

        this.app.hud.refreshInfo?.();
        this.app.hud.flashEvent(
          `「${p.monarch.name}」親征軍團出陣！駐守於「${cap.name}」。`,
        );
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          if (cap) {
            const view = this.app.view;
            const [wxp, wyp] = view.cityPixel(cap);
            view.cam.x = innerWidth / 2 - wxp;
            view.cam.y = innerHeight / 2 - wyp;
            view.clampCam();
            this.showCityCard(cap);
          }
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
      } else {
        warnSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          403 + p.monarchTalkIdx,
          "",
          p.advName,
        );
        this.app.hud.flashEvent(`君主目前不便出陣。`);
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
      }
      return;
    }

    if (p.type === "assistance") {
      // 请求协助提案判断 (KI.EXE 0x66D9)
      const relAlly = relation(sc, me.idx, p.allyFaction.idx);
      const minAllyRel = ((bellicosity * 4 + 30) & 0x7f) | 0x80;
      const atWarWithTarget = isAtWar(sc, me.idx, p.targetFaction.idx);

      if (relAlly < minAllyRel) {
        // 与协助国交情不够，君主严词驳回 (Talk 218..220)
        warnSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          218 + p.monarchTalkIdx,
          p.allyName,
          p.advName,
        );
        sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(`與協助國交情不足！進言被訓斥駁回，信賴度 -20`);
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
        return;
      }

      if (!atWarWithTarget) {
        // 未与目标国交战，君主训斥驳回 (Talk 227..229: "\6沒必要和目前並未敵對的\3為敵。")
        warnSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          227 + p.monarchTalkIdx,
          p.targetName,
          p.advName,
        );
        sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(`未與目標國交戰！進言被訓斥駁回，信賴度 -20`);
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
        return;
      }

      // 检查是否目标国正在攻击我方且实力占优 -> 直接同意 (Talk 221..223)
      const myPower = (me.n_cities ?? 1) * (bellicosity + 20);
      const targetPower = (p.targetFaction.n_cities ?? 1) * 25;
      if (
        p.targetFaction.target_faction === me.idx &&
        myPower < targetPower / 2
      ) {
        clickSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          221 + p.monarchTalkIdx,
          p.allyName,
          p.advName,
        );
        sc.trust = Math.min(255, (sc.trust ?? 255) + 20);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(
          `「${p.playerFaction.monarch}」同意請求協助！信賴度 +20`,
        );

        if (!sc.pendingAssistanceNegotiations)
          sc.pendingAssistanceNegotiations = [];
        const envoyObj = sc.envoys?.[p.allyFaction.idx];
        const envoyName = envoyObj?.name ?? "外交官";
        sc.pendingAssistanceNegotiations.push({
          allyFactionIdx: p.allyFaction.idx,
          targetFactionIdx: p.targetFaction.idx,
          envoyName,
          daysLeft: 20,
        });

        this.app.view.draw();
        this._setProposalTimer(3000, async () => {
          this.closeProposalAudience();
          const lines = await formatTalkTokens(
            60,
            p.allyName,
            p.advName,
            envoyName,
          );
          await this.showNpcMessageDialog({
            lines,
            autoClose: 3000,
            onClose: () => {
              this.selectedSubmenu = null;
              this.syncClock();
              this.app.view.draw();
            },
          });
        });
        return;
      }

      // 询问理由 (Talk 224..226)
      p.step = "choose_reason";
      p.monarchLines = await formatTalkTokens(
        224 + p.monarchTalkIdx,
        p.allyName,
        p.advName,
      );
      this.app.view.draw();
      return;
    }

    if (p.type === "truce") {
      // 停战提案判断 (KI.EXE 0x6577)
      if (!atWar) {
        // 未在交战状态，君主训斥驳回 (Talk 163..165: "原本就沒有和\3交戰啊！混帳東西！！")
        warnSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          163 + p.monarchTalkIdx,
          p.targetName,
          p.advName,
        );
        sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(`未處於交戰狀態！進言被訓斥駁回，信賴度 -20`);
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
        return;
      }

      // 友好度极低/君主好战驳回 (Talk 154..156: "說什麼停戰！那是不可 能的事！")
      const refuseThreshold = Math.floor(bellicosity / 2);
      if (rel < refuseThreshold) {
        warnSfx();
        p.step = "done";
        p.monarchLines = await formatTalkTokens(
          154 + p.monarchTalkIdx,
          p.targetName,
          p.advName,
        );
        sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(`進言被駁回！信賴度 -20`);
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
        return;
      }

      // 询问停战理由 (Talk 160..162: "事到如今，為何還要停戰？")
      p.step = "choose_reason";
      p.monarchLines = await formatTalkTokens(
        160 + p.monarchTalkIdx,
        p.targetName,
        p.advName,
      );
      this.app.view.draw();
      return;
    }

    // 敌对提案判断
    const isAttackingUs =
      targetFaction.target_faction === me.idx ||
      sc.legions.some(
        (l) =>
          !l.dead &&
          l.faction === targetFaction.idx &&
          l.target?.faction === me.idx,
      );
    const dismissThreshold = bellicosity * 2 + 20;
    const tooGood = rel >= dismissThreshold;

    let al = 2;
    if (isAttackingUs) al = 1;
    else if (atWar) al = 3;
    else if (tooGood) al = 0;

    if (al === 1) {
      // 对方已在进攻我方，直接同意开战 (Talk 93..95)
      clickSfx();
      p.step = "done";
      p.monarchLines = await formatTalkTokens(
        93 + p.monarchTalkIdx,
        p.targetName,
        p.advName,
      );
      sc.trust = Math.min(255, (sc.trust ?? 255) + 20);
      declareWar(sc, me.idx, targetFaction.idx);
      this.app.hud.refreshTrust();
      this.app.hud.flashEvent(`「${me.monarch}」同意開戰！信賴度 +20`);
      this.app.view.draw();
      this._setProposalTimer(3000, () => {
        this.closeProposalAudience();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      });
    } else if (al === 3) {
      // 已经在交战状态中了 (Talk 99..101)
      warnSfx();
      p.step = "done";
      p.monarchLines = await formatTalkTokens(
        99 + p.monarchTalkIdx,
        p.targetName,
        p.advName,
      );
      sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
      this.app.hud.refreshTrust();
      this.app.hud.flashEvent(`已處於交戰狀態！進言被駁回，信賴度 -20`);
      this.app.view.draw();
      this._setProposalTimer(3000, () => {
        this.closeProposalAudience();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      });
    } else if (al === 0) {
      // 关系良好，无理由开战，直接驳回 (Talk 90..92)
      warnSfx();
      p.step = "done";
      p.monarchLines = await formatTalkTokens(
        90 + p.monarchTalkIdx,
        p.targetName,
        p.advName,
      );
      sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
      this.app.hud.refreshTrust();
      this.app.hud.flashEvent(`關係良好，進言被駁回！信賴度 -20`);
      this.app.view.draw();
      this._setProposalTimer(3000, () => {
        this.closeProposalAudience();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      });
    } else {
      // 需要开战理由 (Talk 96..98)
      p.step = "choose_reason";
      p.monarchLines = await formatTalkTokens(
        96 + p.monarchTalkIdx,
        p.targetName,
        p.advName,
      );
      this.app.view.draw();
    }
  }

  async _selectProposalReason(ri) {
    const p = this.proposalAudience;
    if (!p) return;

    p.step = "reason_speak";
    if (p.type === "truce") {
      // 军师停战理由发言：Talk 167 + ri
      p.advLines = await formatTalkTokens(167 + ri, p.targetName, p.advName);
    } else if (p.type === "assistance") {
      // 军师协助理由发言：Talk 231..235
      const talkIdx = 231 + ri;
      const tName = ri <= 1 ? p.allyName : p.targetName;
      p.advLines = await formatTalkTokens(talkIdx, tName, p.advName);
    } else {
      // 军师开战理由发言：Talk 103 + ri
      p.advLines = await formatTalkTokens(103 + ri, p.targetName, p.advName);
    }
    this.app.view.draw();

    this._setProposalTimer(1500, async () => {
      await this._evaluateProposalReason(ri);
    });
  }

  async _evaluateProposalReason(ri) {
    const p = this.proposalAudience;
    if (!p) return;
    const sc = this.app.scenario;

    if (p.type === "assistance") {
      // 协助理由评估 (KI.EXE 0x66D9)
      if (ri === 4) {
        // 撤回进言 (Talk 235: 那也不再勉強，一切就任憑主公的旨意。) -> 不扣信赖度，结束
        p.step = "done";
        this.app.view.draw();
        this._setProposalTimer(2000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
        return;
      }

      if (p.usedReasons.has(ri)) {
        // 重复理由 (Talk 275..277) -> 不扣信赖度，重新选理由
        p.step = "repeating_reason";
        p.monarchLines = await formatTalkTokens(
          275 + p.monarchTalkIdx,
          p.allyName,
          p.advName,
        );
        this.app.view.draw();
        this._setProposalTimer(2500, () => {
          p.step = "choose_reason";
          this.app.view.draw();
        });
        return;
      }

      const isValid = p.validReasons[ri];
      if (!isValid) {
        // 假理由 / 谎言 (Talk 236 / 245 / 254 / 263) -> 信赖度 -20，驳回结束
        warnSfx();
        p.step = "done";
        const baseTalks = [236, 245, 254, 263];
        const talkIdx = baseTalks[ri] + p.monarchTalkIdx;
        p.monarchLines = await formatTalkTokens(
          talkIdx,
          ri <= 1 ? p.allyName : p.targetName,
          p.advName,
        );
        sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(`理由不實！進言被訓斥駁回，信賴度 -20`);
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
        return;
      }

      // 理由成立 (真理由!)
      p.usedReasons.add(ri);
      p.requiredReasons--;

      if (p.requiredReasons > 0) {
        // 仍需补充理由 (Talk 242 / 251 / 260 / 269)
        clickSfx();
        p.step = "need_more_reason";
        const baseTalks = [242, 251, 260, 269];
        const talkIdx = baseTalks[ri] + p.monarchTalkIdx;
        p.monarchLines = await formatTalkTokens(
          talkIdx,
          ri <= 1 ? p.allyName : p.targetName,
          p.advName,
        );
        this.app.view.draw();
        this._setProposalTimer(2500, () => {
          p.step = "choose_reason";
          this.app.view.draw();
        });
      } else {
        // 理由充分，说服成功，君主采纳并同意派使者请求协助! (Talk 239 / 248 / 257 / 266)
        clickSfx();
        p.step = "done";
        const baseTalks = [239, 248, 257, 266];
        const talkIdx = baseTalks[ri] + p.monarchTalkIdx;
        p.monarchLines = await formatTalkTokens(
          talkIdx,
          ri <= 1 ? p.allyName : p.targetName,
          p.advName,
        );
        sc.trust = Math.min(255, (sc.trust ?? 255) + 10);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(
          `「${p.playerFaction.monarch}」同意向「${p.allyName}」請求協助！信賴度 +10`,
        );

        if (!sc.pendingAssistanceNegotiations)
          sc.pendingAssistanceNegotiations = [];
        const envoyObj = sc.envoys?.[p.allyFaction.idx];
        const envoyName = envoyObj?.name ?? "外交官";
        sc.pendingAssistanceNegotiations.push({
          allyFactionIdx: p.allyFaction.idx,
          targetFactionIdx: p.targetFaction.idx,
          envoyName,
          daysLeft: 20, // 20 天后外交官前来报告交涉结果
        });

        this.app.view.draw();
        this._setProposalTimer(3000, async () => {
          this.closeProposalAudience();
          // 弹出 Talk 60: "那麼，就儘速向\1大人發出請求協助的指示。"
          const lines = await formatTalkTokens(
            60,
            p.allyName,
            p.advName,
            envoyName,
          );
          await this.showNpcMessageDialog({
            lines,
            autoClose: 3000,
            onClose: () => {
              this.selectedSubmenu = null;
              this.syncClock();
              this.app.view.draw();
            },
          });
        });
      }
      return;
    }

    if (p.type === "truce") {
      // 停战理由评估 (KI.EXE 0x3B5A & 0x3BA9)
      if (ri === 4) {
        // 撤回进言 (Talk 171: 既然不和主公之意，也就沒辦法了。) -> 不扣信赖度，结束
        p.step = "done";
        this.app.view.draw();
        this._setProposalTimer(2000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
        return;
      }

      if (p.usedReasons.has(ri)) {
        // 重复理由 (Talk 211..213) -> 不扣信赖度，重新选理由
        p.step = "repeating_reason";
        p.monarchLines = await formatTalkTokens(
          211 + p.monarchTalkIdx,
          p.targetName,
          p.advName,
        );
        this.app.view.draw();
        this._setProposalTimer(2500, () => {
          p.step = "choose_reason";
          this.app.view.draw();
        });
        return;
      }

      const isValid = p.validReasons[ri];
      if (!isValid) {
        // 假理由 / 谎言 (Talk 172..174 / 181..183 / 190..191 / 199..201) -> 信赖度 -20，驳回结束
        warnSfx();
        p.step = "done";
        const talkIdx = 172 + ri * 9 + p.monarchTalkIdx;
        p.monarchLines = await formatTalkTokens(
          talkIdx,
          p.targetName,
          p.advName,
        );
        sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(`理由不實！進言被訓斥駁回，信賴度 -20`);
        this.app.view.draw();
        this._setProposalTimer(3000, () => {
          this.closeProposalAudience();
          this.selectedSubmenu = null;
          this.syncClock();
          this.app.view.draw();
        });
        return;
      }

      // 理由成立 (真理由!)
      p.usedReasons.add(ri);
      p.requiredReasons--;

      if (p.requiredReasons > 0) {
        // 仍需补充理由 (Talk 178..180 / 187..189 / 196..198 / 205..207)
        clickSfx();
        p.step = "need_more_reason";
        const talkIdx = 178 + ri * 9 + p.monarchTalkIdx;
        p.monarchLines = await formatTalkTokens(
          talkIdx,
          p.targetName,
          p.advName,
        );
        this.app.view.draw();
        this._setProposalTimer(2500, () => {
          p.step = "choose_reason";
          this.app.view.draw();
        });
      } else {
        // 理由充分，说服成功，君主采纳并同意派使者停战! (Talk 175..177 / 184..186 / 193..195 / 202..204)
        clickSfx();
        p.step = "done";
        const talkIdx = 175 + ri * 9 + p.monarchTalkIdx;
        p.monarchLines = await formatTalkTokens(
          talkIdx,
          p.targetName,
          p.advName,
        );
        sc.trust = Math.min(255, (sc.trust ?? 255) + 10);
        this.app.hud.refreshTrust();
        this.app.hud.flashEvent(
          `「${p.playerFaction.monarch}」同意派出停戰使者！信賴度 +10`,
        );

        if (!sc.pendingTruceNegotiations) sc.pendingTruceNegotiations = [];
        const envoyObj = sc.envoys?.[p.targetFaction.idx];
        const envoyName = envoyObj?.name ?? "外交官";
        sc.pendingTruceNegotiations.push({
          targetFactionIdx: p.targetFaction.idx,
          targetFactionName: p.targetName,
          envoyName,
          daysLeft: 20, // 20 天后外交官前来报告交涉结果 (KI.EXE 0x654C: mov bl, 0x14)
        });

        this.app.view.draw();
        this._setProposalTimer(3000, async () => {
          this.closeProposalAudience();
          // 弹出 Talk 59: "那麼，就儘速對\1大人下達停戰指示。"
          const lines = await formatTalkTokens(
            59,
            p.targetName,
            p.advName,
            envoyName,
          );
          await this.showNpcMessageDialog({
            lines,
            autoClose: 3000,
            onClose: () => {
              this.selectedSubmenu = null;
              this.syncClock();
              this.app.view.draw();
            },
          });
        });
      }
      return;
    }

    if (ri === 4) {
      // 撤回进言 (Talk 144..146) -> 不扣信赖度，结束
      p.step = "done";
      p.monarchLines = await formatTalkTokens(
        144 + p.monarchTalkIdx,
        p.targetName,
        p.advName,
      );
      this.app.view.draw();
      this._setProposalTimer(3000, () => {
        this.closeProposalAudience();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      });
      return;
    }

    if (p.usedReasons.has(ri)) {
      // 重复理由 (Talk 147..149) -> 不扣信赖度，重新选理由
      p.step = "repeating_reason";
      p.monarchLines = await formatTalkTokens(
        147 + p.monarchTalkIdx,
        p.targetName,
        p.advName,
      );
      this.app.view.draw();
      this._setProposalTimer(2500, () => {
        p.step = "choose_reason";
        this.app.view.draw();
      });
      return;
    }

    const isValid = p.validReasons[ri];
    if (!isValid) {
      // 假理由 / 谎言 (Talk 108..110 / 117..119 / 126..128 / 135..137) -> 信赖度 -20，驳回结束
      warnSfx();
      p.step = "done";
      const talkIdx = 108 + ri * 9 + p.monarchTalkIdx;
      p.monarchLines = await formatTalkTokens(talkIdx, p.targetName, p.advName);
      sc.trust = Math.max(0, (sc.trust ?? 255) - 20);
      this.app.hud.refreshTrust();
      this.app.hud.flashEvent(`理由不實！進言被訓斥駁回，信賴度 -20`);
      this.app.view.draw();
      this._setProposalTimer(3000, () => {
        this.closeProposalAudience();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      });
      return;
    }

    // 理由成立 (真理由!)
    p.usedReasons.add(ri);
    p.requiredReasons--;

    if (p.requiredReasons > 0) {
      // 仍需补充理由 (Talk 114..116 / 123..125 / 132..134 / 141..143)
      clickSfx();
      p.step = "need_more_reason";
      const talkIdx = 114 + ri * 9 + p.monarchTalkIdx;
      p.monarchLines = await formatTalkTokens(talkIdx, p.targetName, p.advName);
      this.app.view.draw();
      this._setProposalTimer(2500, () => {
        p.step = "choose_reason";
        this.app.view.draw();
      });
    } else {
      // 理由充分，说服成功，君主采纳并同意开战! (Talk 111..113 / 120..122 / 129..131 / 138..140)
      clickSfx();
      p.step = "done";
      const talkIdx = 111 + ri * 9 + p.monarchTalkIdx;
      p.monarchLines = await formatTalkTokens(talkIdx, p.targetName, p.advName);
      sc.trust = Math.min(255, (sc.trust ?? 255) + 10);
      declareWar(sc, p.playerFaction.idx, p.targetFaction.idx);
      this.app.hud.refreshTrust();
      this.app.hud.flashEvent(
        `「${p.playerFaction.monarch}」准許對「${p.targetName}」開戰！信賴度 +10`,
      );
      this.app.view.draw();
      this._setProposalTimer(3000, () => {
        this.closeProposalAudience();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
      });
    }
  }

  /** 外交官返回汇报停战谈判结果 (100% 逆向复刻 KI.EXE 0x3327, 0x36C4, 0x3771, 0x3C3D) */
  async showTruceNegotiationResult({
    targetFaction,
    envoyName,
    outcome,
    goldRequired,
  }) {
    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    const targetName = (targetFaction?.monarch ?? "").trim();

    // 第一步：Talk 57 "駐\3勢力的外交官\1大人前來報告。"
    const step1Lines = await formatTalkTokens(57, targetName, "", envoyName);

    await this.showNpcMessageDialog({
      lines: step1Lines,
      autoClose: 3000,
      onClose: async () => {
        // 第二步：根据谈判结果展示 Talk 43 / 44 / 45
        if (outcome === 0) {
          // 无条件达成 (Talk 43: "與\3停戰交涉的結果，無條件地達成了。")
          clickSfx();
          makeCeasefire(sc, me.idx, targetFaction.idx);
          const step2Lines = await formatTalkTokens(43, targetName);
          await this.showNpcMessageDialog({
            lines: step2Lines,
            autoClose: 3500,
            onClose: () => {
              this.syncClock();
              this.app.hud.buildLegend?.();
              this.app.hud.flashEvent(
                `與「${targetName}」停戰成功！雙方恢復和平。`,
              );
              this.app.view.draw();
            },
          });
        } else if (outcome === 1) {
          // 支付金钱达成 (Talk 44: "與\3停戰交涉的結果，已經\7成立了。")
          clickSfx();
          if (me) {
            me.gold = Math.max(0, (me.gold ?? 0) - goldRequired);
          }
          makeCeasefire(sc, me.idx, targetFaction.idx);
          const costStr = `支付${goldRequired}金`;
          const step2Lines = await formatTalkTokens(
            44,
            targetName,
            "",
            "",
            costStr,
          );
          await this.showNpcMessageDialog({
            lines: step2Lines,
            autoClose: 3500,
            onClose: () => {
              this.syncClock();
              this.app.hud.buildLegend?.();
              this.app.hud.refreshInfo?.();
              this.app.hud.flashEvent(
                `與「${targetName}」停戰成功！支付 ${goldRequired} 金。`,
              );
              this.app.view.draw();
            },
          });
        } else {
          // 谈判破裂 (Talk 45: "與\3的停戰交涉，很遺憾，談判破裂了。")
          warnSfx();
          sc.trust = Math.max(0, (sc.trust ?? 255) - 30); // 问责扣减 30 信赖度 (KI.EXE 0x3C8B)
          this.app.hud.refreshTrust();
          const step2Lines = await formatTalkTokens(45, targetName);
          await this.showNpcMessageDialog({
            lines: step2Lines,
            autoClose: 3500,
            onClose: () => {
              this.syncClock();
              this.app.hud.flashEvent(
                `與「${targetName}」停戰談判破裂！信賴度 -30`,
              );
              this.app.view.draw();
            },
          });
        }
      },
    });
  }

  /** 外交官返回汇报请求协助谈判结果 (100% 逆向复刻 KI.EXE 0x301C, 0x3712, 0x3C3D) */
  async showAssistanceNegotiationResult({
    allyFaction,
    targetFaction,
    envoyName,
    outcome,
    goldRequired,
  }) {
    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    const allyName = (allyFaction?.monarch ?? "").trim();
    const targetName = (targetFaction?.monarch ?? "").trim();

    // 第一步：Talk 57 "駐\3勢力的外交官\1大人前來報告。"
    const step1Lines = await formatTalkTokens(57, allyName, "", envoyName);

    await this.showNpcMessageDialog({
      lines: step1Lines,
      autoClose: 3000,
      onClose: async () => {
        // 第二步：根据谈判结果展示 Talk 47 / 48 / 49
        if (outcome === 0) {
          // 无条件达成 (Talk 47: "與\3的合作交涉的結果，無條件成立了。")
          clickSfx();
          declareWar(sc, allyFaction.idx, targetFaction.idx);
          allyFaction.target_faction = targetFaction.idx;
          sc.trust = Math.min(255, (sc.trust ?? 255) + 10);
          this.app.hud.refreshTrust();
          const step2Lines = await formatTalkTokens(47, allyName);
          await this.showNpcMessageDialog({
            lines: step2Lines,
            autoClose: 3500,
            onClose: () => {
              this.syncClock();
              this.app.hud.buildLegend?.();
              this.app.hud.flashEvent(
                `「${allyName}」同意協同進攻「${targetName}」！信賴度 +10`,
              );
              this.app.view.draw();
            },
          });
        } else if (outcome === 1) {
          // 支付金钱达成 (Talk 48: "與\3的合作交涉，的結果，已經\7達成協定。")
          clickSfx();
          if (me) {
            me.gold = Math.max(0, (me.gold ?? 0) - goldRequired);
          }
          declareWar(sc, allyFaction.idx, targetFaction.idx);
          allyFaction.target_faction = targetFaction.idx;
          sc.trust = Math.min(255, (sc.trust ?? 255) + 10);
          this.app.hud.refreshTrust();
          const costStr = `支付${goldRequired}金`;
          const step2Lines = await formatTalkTokens(
            48,
            allyName,
            "",
            "",
            costStr,
          );
          await this.showNpcMessageDialog({
            lines: step2Lines,
            autoClose: 3500,
            onClose: () => {
              this.syncClock();
              this.app.hud.buildLegend?.();
              this.app.hud.refreshInfo?.();
              this.app.hud.flashEvent(
                `「${allyName}」同意協同進攻「${targetName}」！支付 ${goldRequired} 金。`,
              );
              this.app.view.draw();
            },
          });
        } else {
          // 谈判破裂 (Talk 49: "與\3的合作交涉，很遺憾，交涉破裂了。")
          warnSfx();
          sc.trust = Math.max(0, (sc.trust ?? 255) - 30);
          this.app.hud.refreshTrust();
          const step2Lines = await formatTalkTokens(49, allyName);
          await this.showNpcMessageDialog({
            lines: step2Lines,
            autoClose: 3500,
            onClose: () => {
              this.syncClock();
              this.app.hud.flashEvent(
                `與「${allyName}」的請求協助談判破裂！信賴度 -30`,
              );
              this.app.view.draw();
            },
          });
        }
      },
    });
  }

  closeProposalAudience() {
    if (!this.proposalAudience) return;
    if (this.proposalAudience.timer) {
      clearTimeout(this.proposalAudience.timer);
    }
    this.proposalAudience = null;
    this.app.view.draw();
  }

  _hitProposalReasons(px, py) {
    const p = this.proposalAudience;
    if (!p || p.step !== "choose_reason" || !p.reasonsRect) return -1;
    const { x, y, w, h, items } = p.reasonsRect;
    if (px >= x && px < x + w && py >= y && py < y + h) {
      const rowH = h / items.length;
      const i = Math.floor((py - y) / rowH);
      return i >= 0 && i < items.length ? i : -1;
    }
    return -1;
  }

  _clickProposalAudience(px, py, btn = 0) {
    const p = this.proposalAudience;
    if (!p) return false;
    if (btn === 2) {
      // 右键取消 / 退出进言
      clickSfx();
      this.closeProposalAudience();
      this.selectedSubmenu = null;
      this.syncClock();
      this.app.view.draw();
      return true;
    }
    if (btn !== 0) return true;

    // 如果当前处于选择理由状态，优先检测点击理由项
    if (p.step === "choose_reason") {
      const ri = this._hitProposalReasons(px, py);
      if (ri >= 0) {
        clickSfx();
        this._selectProposalReason(ri);
        return true;
      }
      return true; // 处于选理由阶段时，点外面不快进
    }

    // 其它阶段（有等待计时器时）：左键点击任意位置立即触发下一步
    if (p.timer) {
      clearTimeout(p.timer);
      p.timer = null;
      if (typeof p.timerAction === "function") {
        p.timerAction();
      }
      return true;
    }

    return true;
  }

  _drawProposalAudience(ctx) {
    const p = this.proposalAudience;
    if (!p) return;

    const iw = innerWidth;
    const ih = innerHeight;

    // 1. 背景大图窗口 (20×24 tiles = 320×384，居中展示)
    const winW = 320;
    const winH = 384;
    const winX = Math.round((iw - winW) / 2);
    const winY = Math.round((ih - winH) / 2) + 20;

    const bgWin = this._drawWindow(ctx, winX, winY, 20, 24, "black");
    const cx = bgWin ? bgWin.x : winX + 8;
    const cy = bgWin ? bgWin.y : winY + 8;

    // 绘制 ivent_0_a.png 事件背景图 (288×352)
    const iventImg = this.imgs?.ivent0;
    if (iventImg) {
      ctx.drawImage(iventImg, cx, cy, 288, 352);
    } else {
      ctx.fillStyle = "#112233";
      ctx.fillRect(cx, cy, 288, 352);
    }

    // 2. 上方君主发言框 (17×5 tiles = 272×80，位于左上错落)
    const topW = 272;
    const topH = 80;
    const topX = Math.max(8, winX - 72);
    const topY = Math.max(40, winY - 16);
    this._drawSpeechBox(
      ctx,
      topX,
      topY,
      topW,
      topH,
      p.monarchImg,
      p.monarchLines,
    );

    // 3. 下方军师发言框 (17×5 tiles = 272×80，位于右下错落)
    if (p.advLines) {
      const btmW = 272;
      const btmH = 80;
      const btmX = Math.min(iw - btmW - 8, winX + 120);
      const btmY = Math.min(ih - btmH - 8, winY + 288);
      this._drawSpeechBox(ctx, btmX, btmY, btmW, btmH, p.advImg, p.advLines);
    }

    // 4. 开战理由选择菜单 (11×7 tiles = 176×112，位于中间偏左)
    if (p.step === "choose_reason") {
      const rTilesW = 11;
      const rTilesH = 7;
      const rx = winX - 24;
      const ry = winY + 90;

      const rWin = this._drawWindow(ctx, rx, ry, rTilesW, rTilesH, "black");
      const rInnerX = rWin ? rWin.x : rx + 8;
      const rInnerY = rWin ? rWin.y : ry + 8;
      const rInnerW = rWin ? rWin.w : (rTilesW - 1) * 16;
      const rInnerH = rWin ? rWin.h : (rTilesH - 1) * 16;

      const items = p.reasonsItems || [
        "外交關係惡劣",
        "我國較有利",
        "敵正侵攻他國",
        "敵勢力疲乏",
        "撤回進言",
      ];
      p.reasonsRect = { x: rInnerX, y: rInnerY, w: rInnerW, h: rInnerH, items };

      const rowH = rInnerH / items.length;
      ctx.font = FONT;
      ctx.textBaseline = "top";

      items.forEach((item, i) => {
        const iy = rInnerY + i * rowH;
        const isHover = p.reasonsHover === i;
        if (isHover) {
          ctx.fillStyle = "#ffe000";
          ctx.fillRect(rInnerX + 1, iy + 1, rInnerW - 2, rowH - 2);
          ctx.fillStyle = "#0000bb";
        } else {
          ctx.fillStyle = "#ffffff";
        }
        const tw = ctx.measureText(item).width;
        ctx.fillText(
          item,
          rInnerX + (rInnerW - tw) / 2,
          iy + (rowH - 16) / 2 + 1,
        );
      });
    } else {
      p.reasonsRect = null;
    }
  }

  /** 绘制黑底金框发言框 (左侧头像 64×64，右侧多行对白) */
  _drawSpeechBox(ctx, px, py, w, h, img, lines) {
    const tw = Math.ceil((w + 16) / 16);
    const th = Math.ceil((h + 16) / 16);
    const win = this._drawWindow(ctx, px, py, tw, th, "black");
    const x = win ? win.x : px + 8;
    const y = win ? win.y : py + 8;

    // 左侧头像 64×64
    if (img) {
      ctx.drawImage(img, x + 8, y + 8, 64, 64);
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x + 8, y + 8, 64, 64);
    }

    // 右侧文字
    if (!lines) return;
    ctx.font = FONT;
    ctx.textBaseline = "top";
    const tx = x + 8 + 64 + 14;
    const lineH = 18;
    const rawLines = Array.isArray(lines) ? lines : [lines];
    const totalH = rawLines.length * lineH;
    const startY = y + Math.max(8, Math.floor((h - totalH) / 2));

    rawLines.forEach((line, li) => {
      const ly = startY + li * lineH;
      if (Array.isArray(line)) {
        let curX = tx;
        line.forEach((token) => {
          if (typeof token === "string") {
            ctx.fillStyle = "#ffffff";
            ctx.fillText(token, curX, ly);
            curX += ctx.measureText(token).width;
          } else if (token && typeof token === "object") {
            ctx.fillStyle = token.color || "#ffffff";
            const text = String(token.text ?? "");
            ctx.fillText(text, curX, ly);
            curX += ctx.measureText(text).width;
          }
        });
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(String(line ?? ""), tx, ly);
      }
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

  /** 通用 NPC 提示信息弹窗 (如据点已有内政官提示: 19×5 tiles = 304×80，黑底金框，左侧 NPC 头像 64×64) */
  async showNpcMessageDialog({
    lines,
    px,
    py,
    w = 304,
    h = 80,
    onClose = null,
    autoClose = 3000,
  } = {}) {
    let img = this.imgs?.messageNpc;
    if (!img) {
      img = await loadImage("grf/ui/message_npc.png").catch(() => null);
    }
    if (px == null || py == null) {
      if (this.listDialog) {
        const d = this.listDialog;
        px = d.px + d.w - w - 8;
        py = d.py + 76;
      } else {
        px = Math.round((innerWidth - w) / 2);
        py = Math.round((innerHeight - h) / 2);
      }
    }
    if (this._generalCardTimer) {
      clearTimeout(this._generalCardTimer);
      this._generalCardTimer = null;
    }
    this.generalCard = { gen: null, img, lines, px, py, w, h, onClose };
    if (autoClose) {
      this._generalCardTimer = setTimeout(() => {
        this._generalCardTimer = null;
        this.closeGeneralCard();
      }, autoClose);
    }
    this.app.view.draw();
  }

  /** 武将固定发言对话弹窗 (如任命内政官「我立刻前往。」、解任「那我這就回京城。」、任命外交官「遵命。」，19×5 tiles = 304×80) */
  async showGeneralMessageDialog(
    gen,
    text,
    onClose = null,
    { w = 304, h = 80, px, py, autoClose = 3000 } = {},
  ) {
    if (!gen) return;
    const img = await portrait(gen.portrait).catch(() => null);
    if (px == null || py == null) {
      if (this.listDialog) {
        const d = this.listDialog;
        px = d.px + d.w - w - 8;
        py = d.py + 76;
      } else {
        px = Math.round((innerWidth - w) / 2);
        py = Math.round((innerHeight - h) / 2);
      }
    }
    if (this._generalCardTimer) {
      clearTimeout(this._generalCardTimer);
      this._generalCardTimer = null;
    }
    this.generalCard = { gen, img, lines: [text], px, py, w, h, onClose };
    if (autoClose) {
      this._generalCardTimer = setTimeout(() => {
        this._generalCardTimer = null;
        this.closeGeneralCard();
      }, autoClose);
    }
    this.app.view.draw();
  }

  closeGeneralCard() {
    if (!this.generalCard) return;
    if (this._generalCardTimer) {
      clearTimeout(this._generalCardTimer);
      this._generalCardTimer = null;
    }
    const onClose = this.generalCard.onClose;
    this.generalCard = null;
    if (this.listDialog) this.listDialog.selectedRow = -1;
    if (onClose) {
      onClose();
      return;
    }
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

    // 左侧武将/NPC 头像 64×64
    if (img) {
      ctx.drawImage(img, x + 8, y + 8, 64, 64);
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x + 8, y + 8, 64, 64);
    }

    // 右侧对白文字
    ctx.font = FONT;
    ctx.textBaseline = "top";
    const tx = x + 8 + 64 + 14;
    const maxTextW = Math.max(40, w - 8 - 64 - 14 - 8);

    const rawLines = Array.isArray(lines) ? lines : [lines];
    const renderLines = [];
    for (const raw of rawLines) {
      if (Array.isArray(raw)) {
        renderLines.push(raw);
        continue;
      }
      for (const paragraph of String(raw || "").split("\n")) {
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
      const ly = startY + li * lineH;
      if (Array.isArray(line)) {
        let curX = tx;
        line.forEach((token) => {
          if (typeof token === "string") {
            ctx.fillStyle = "#ffffff";
            ctx.fillText(token, curX, ly);
            curX += ctx.measureText(token).width;
          } else if (token && typeof token === "object") {
            ctx.fillStyle = token.color || "#ffffff";
            const text = String(token.text ?? "");
            ctx.fillText(text, curX, ly);
            curX += ctx.measureText(text).width;
          }
        });
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(String(line ?? ""), tx, ly);
      }
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
    const {
      ox,
      oy,
      infoOx,
      infoOy,
      wTiles = 21,
      hTiles = 10,
      infoWTiles = 30,
      infoHTiles = 5,
    } = f;
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
    const targetInfoOx =
      infoOx ?? Math.round((innerWidth - infoWTiles * 16) / 2);
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
    const c = this.cityCard;
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
        this.personnelMenu ||
        this.adviceMenu ||
        this.proposalAudience ||
        this.formationDialog ||
        this.formationQuote ||
        this.financeDialog ||
        this.keypadDialog ||
        this.legionMenu ||
        this.marchingOrder ||
        this.orderChoiceMenu
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
    // 当行军指示处于选择目标据点状态时，允许在地图上拖拽平移与点击据点
    if (this.marchingOrder) {
      if (this.orderChoiceMenu && this._hitOrderChoiceMenu(px, py) >= 0) {
        return true;
      }
      if (py < 32 && px >= this.bx && px < this.bx + 640) return true;
      if (this._hitLegionDetailPanel(px, py)) return true;
      if (this._hitBottomPromptWindow(px, py)) return true;
      if (
        this.panels.some(
          (p) => px >= p.x && px < p.x + p.w && py >= p.y && py < p.y + p.h,
        )
      ) {
        return true;
      }
      return false;
    }

    // ★军师菜单下任何一个菜单被选中打开时，整个游戏地图锁定不可移动，地图上的操作全部无效
    if (this.selectedSubmenu != null) return true;
    if (this.proposalAudience) return true;
    if (this.adviceMenu) return true;
    if (this.legionMenu) return true;
    if (this.choiceDialog) return true;
    if (this.baseMenu) return true;
    if (this.personnelMenu) return true;
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
  click(px, py, btn = 0, target = null) {
    this.layout();

    // ★右键层级回退规则 (用户定稿):
    // 1. 若有子界面/弹窗打开或子菜单项处于被选状态，右键全部关闭回退到该菜单上，
    //    取消该菜单上所有被选项，所有菜单恢复未被选中状态，并立即开始计时。
    // 2. 若已回退到该菜单上且已无被选项，再次右键才关闭子菜单条本身。
    if (btn === 2) {
      if (this.orderChoiceMenu) {
        clickSfx();
        this.closeOrderChoiceMenu();
        if (this.marchingOrder) {
          this.marchingOrder.step = "pick_target";
          this.marchingOrder.targetCity = null;
        }
        this.app.view.draw();
        return true;
      }
      if (this.marchingOrder) {
        clickSfx();
        this.closeMarchingOrder();
        this.showLegionMarchOrders();
        return true;
      }
      if (this.legionMenu) {
        clickSfx();
        this.closeLegionMenu();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
        return true;
      }
      if (this.proposalAudience) {
        clickSfx();
        this.closeProposalAudience();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
        return true;
      }
      if (this.adviceMenu) {
        clickSfx();
        this.closeAdviceMenu();
        this.selectedSubmenu = null;
        this.syncClock();
        this.app.view.draw();
        return true;
      }
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
      const hadPersonnelMenu = Boolean(this.personnelMenu);
      const hadAdviceMenu = Boolean(this.adviceMenu);
      const hadLegionMenu = Boolean(this.legionMenu);
      const hadMarchingOrder = Boolean(this.marchingOrder);
      const hadOrderChoice = Boolean(this.orderChoiceMenu);
      const hadProposal = Boolean(this.proposalAudience);
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
        hadAdviceMenu ||
        hadLegionMenu ||
        hadMarchingOrder ||
        hadOrderChoice ||
        hadProposal ||
        hadBaseMenu ||
        hadPersonnelMenu ||
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
        if (hadProposal) this.closeProposalAudience();
        if (hadAdviceMenu) this.closeAdviceMenu();
        if (hadLegionMenu) this.closeLegionMenu();
        if (hadOrderChoice) this.closeOrderChoiceMenu();
        if (hadMarchingOrder) this.closeMarchingOrder();
        if (hadKeypad) this.closeKeypadDialog();
        if (hadFinance) this.closeFinanceDialog();
        if (hadFormation) this.closeFormationDialog();
        if (hadBaseMenu) this.closeBaseMenu();
        if (hadPersonnelMenu) this.closePersonnelMenu();
        if (hadList) this.closeListDialog();
        if (hadChoice) this.closeChoiceDialog();
        if (hadCard) this.closeCityCard();
        if (hadAdv) this.app.hud?.resolveAdvice?.(null);
        for (const el of domDlgs) el.remove();
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

    if (this.proposalAudience) {
      return this._clickProposalAudience(px, py, btn);
    }

    if (this.adviceMenu) {
      const i = this._hitAdviceMenu(px, py);
      if (btn === 0) {
        if (i === 0) {
          // 敵對提案
          clickSfx();
          this.closeAdviceMenu();
          this.selectedSubmenu = 0;
          this.syncClock();
          this.app.hud.showHostileProposalFactions();
          this.selectedSubmenu = 0;
          this.app.view.draw();
          return true;
        }
        if (i === 1) {
          // 停戰提案
          clickSfx();
          this.closeAdviceMenu();
          this.selectedSubmenu = 0;
          this.syncClock();
          this.app.hud.showTruceProposalFactions();
          this.selectedSubmenu = 0;
          this.app.view.draw();
          return true;
        }
        if (i === 2) {
          // 請求協助
          clickSfx();
          this.closeAdviceMenu();
          this.selectedSubmenu = 0;
          this.syncClock();
          this.app.hud.showAssistanceAllyFactions();
          this.selectedSubmenu = 0;
          this.app.view.draw();
          return true;
        }
        if (i === 3) {
          // 遷都
          clickSfx();
          this.closeAdviceMenu();
          this.selectedSubmenu = 0;
          this.syncClock();
          this.app.hud.showRelocateCapitalCities();
          this.selectedSubmenu = 0;
          this.app.view.draw();
          return true;
        }
        if (i === 4) {
          // 請求君主出陣
          clickSfx();
          this.closeAdviceMenu();
          this.selectedSubmenu = 0;
          this.syncClock();
          this.showMonarchDeployAudience();
          this.selectedSubmenu = 0;
          this.app.view.draw();
          return true;
        }
        if (i > 0 && i < this.adviceMenu.items.length) {
          clickSfx();
          this.closeAdviceMenu();
          this.selectedSubmenu = 0;
          this.syncClock();
          this.app.hud.flashEvent(
            `「${this.adviceMenu.items[i]}」界面還原中…（右鍵取消返回）`,
          );
          this.app.view.draw();
          return true;
        }
      }
      return true;
    }

    if (this.legionMenu) {
      const i = this._hitLegionMenu(px, py);
      if (btn === 0) {
        if (i === 0) {
          // 位置確認
          clickSfx();
          this.closeLegionMenu();
          this.selectedSubmenu = 4;
          this.syncClock();
          this.showLegionLocate();
          return true;
        }
        if (i === 1) {
          // 行軍指示
          clickSfx();
          this.closeLegionMenu();
          this.selectedSubmenu = 4;
          this.syncClock();
          this.showLegionMarchOrders();
          return true;
        }
      }
      return true;
    }

    if (this.marchingOrder) {
      if (btn === 0) {
        const sc = this.app.scenario;
        const L = this.marchingOrder.legion;

        // 如果命令菜单已展开
        if (this.orderChoiceMenu) {
          const ci = this._hitOrderChoiceMenu(px, py);
          if (ci >= 0) {
            clickSfx();
            const targetCity = this.marchingOrder.targetCity;
            if (ci === 0) {
              // 戰鬥指揮 (玩家战术指挥)
              L.target = targetCity;
              L.delegated = false;
              L.cooldown = 1;
              this.app.hud?.flashEvent?.(
                `「${L.leader}」隊向「${targetCity.name.trim()}」出發。`,
              );
            } else if (ci === 1) {
              // 委任 (AI自主指挥)
              L.target = targetCity;
              L.delegated = true;
              L.cooldown = 1;
              this.app.hud?.flashEvent?.(
                `「${L.leader}」隊委任向「${targetCity.name.trim()}」進軍。`,
              );
            } else if (ci === 2) {
              // 解體 (仅限首都)
              this._disbandLegion(L);
            }
            this.closeOrderChoiceMenu();
            this.closeMarchingOrder();
            this.showLegionMarchOrders();
            return true;
          }
        }

        // 检查是否点击了地图上的据点
        let clickedCity = target?.type === "city" ? target.city : null;
        if (!clickedCity && sc?.cities) {
          const view = this.app.view;
          for (const c of sc.cities) {
            const [wxp, wyp] = view.cityPixel(c);
            const sx = view.sx(wxp);
            const sy = view.sy(wyp);
            if (Math.hypot(px - sx, py - sy) <= 18) {
              clickedCity = c;
              break;
            }
          }
        }

        if (clickedCity) {
          clickSfx();
          this.marchingOrder.targetCity = clickedCity;
          this.marchingOrder.step = "choose_order";
          this.showOrderChoiceMenu(clickedCity);
          return true;
        }
      }
      return true;
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

    if (this.personnelMenu) {
      const i = this._hitPersonnelMenu(px, py);
      if (btn === 0) {
        if (i === 0) {
          // 內政官任命
          clickSfx();
          this.closePersonnelMenu();
          this.selectedSubmenu = 1;
          this.syncClock();
          this.app.hud.showAppointGovernorCities();
          this.selectedSubmenu = 1;
          this.app.view.draw();
          return true;
        }
        if (i === 1) {
          // 內政官解任
          clickSfx();
          this.closePersonnelMenu();
          this.selectedSubmenu = 1;
          this.syncClock();
          this.app.hud.showDismissGovernorCities();
          this.selectedSubmenu = 1;
          this.app.view.draw();
          return true;
        }
        if (i === 2) {
          // 外交官任命
          clickSfx();
          this.closePersonnelMenu();
          this.selectedSubmenu = 1;
          this.syncClock();
          this.app.hud.showAppointEnvoyFactions();
          this.selectedSubmenu = 1;
          this.app.view.draw();
          return true;
        }
        if (i === 3) {
          // 外交官解任
          clickSfx();
          this.closePersonnelMenu();
          this.selectedSubmenu = 1;
          this.syncClock();
          this.app.hud.showDismissEnvoyFactions();
          this.selectedSubmenu = 1;
          this.app.view.draw();
          return true;
        }
      }
      // 点击在二级菜单外：消费事件，不做任何操作
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

    if (this.generalCard) {
      if (this._hitGeneralCard(px, py)) {
        clickSfx();
        this.closeGeneralCard();
      }
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
            this.closeLegionMenu?.();
            this.closeMarchingOrder?.();
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
    if (this.proposalAudience) {
      const p = this.proposalAudience;
      if (p.step === "choose_reason") {
        const old = p.reasonsHover;
        p.reasonsHover = this._hitProposalReasons(px, py);
        if (old !== p.reasonsHover) changed = true;
      }
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
      return changed;
    }
    if (this.adviceMenu) {
      const old = this.adviceMenu.hover;
      this.adviceMenu.hover = this._hitAdviceMenu(px, py);
      if (old !== this.adviceMenu.hover) changed = true;
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
      return changed;
    }
    if (this.orderChoiceMenu) {
      const old = this.orderChoiceMenu.hover;
      this.orderChoiceMenu.hover = this._hitOrderChoiceMenu(px, py);
      if (old !== this.orderChoiceMenu.hover) changed = true;
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
      return changed;
    }
    if (this.legionMenu) {
      const old = this.legionMenu.hover;
      this.legionMenu.hover = this._hitLegionMenu(px, py);
      if (old !== this.legionMenu.hover) changed = true;
      if (this.hoverAct) {
        this.hoverAct = null;
        changed = true;
      }
      return changed;
    }
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
    if (this.personnelMenu) {
      const old = this.personnelMenu.hover;
      this.personnelMenu.hover = this._hitPersonnelMenu(px, py);
      if (old !== this.personnelMenu.hover) changed = true;
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

    if (i === 0) return this.showAdviceMenu(); // 進言
    if (i === 1) return this.showPersonnelMenu(); // 人事
    if (i === 2) return this.showFinanceDialog(); // 財政
    if (i === 3) return hud.showFormation(); // 編成
    if (i === 4) return this.showLegionMenu(); // 軍團
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
    if (this.personnelMenu) {
      this._drawPersonnelMenu(ctx);
    }
    if (this.adviceMenu) {
      this._drawAdviceMenu(ctx);
    }
    if (this.legionMenu) {
      this._drawLegionMenu(ctx);
    }
    if (this.marchingOrder) {
      this._drawMarchingOrder(ctx);
    }
    if (this.orderChoiceMenu) {
      this._drawOrderChoiceMenu(ctx);
    }
    if (this.proposalAudience) {
      this._drawProposalAudience(ctx);
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

    // 信賴度: 标签与进度条分两行; 黑底条, 中央细红条 (高度 2px)。原版按 255 为满格 (KI.EXE 0x5F27: w = floor((trust * 100 + 159) / 160))
    const ty = p.y + 78;
    ctx.fillStyle = CREAM;
    ctx.fillText("信賴度", p.x + 8, ty);
    const trust = sc.trust ?? 0;
    const bx = p.x + 8,
      by = ty + 20,
      bw = 192;
    ctx.fillStyle = "#050505";
    ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = trust <= 32 ? "#ff3333" : "#dd0000";
    const barWidth = Math.round((bw * Math.min(255, trust)) / 255);
    ctx.fillRect(bx, by + 3, barWidth, 2);
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
