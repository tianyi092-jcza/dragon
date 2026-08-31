// 開場選單系統 — 1:1 復刻 KI.EXE 開局流程 (0x1AC3)
//   YES/NO 對話框 (0x8DC8 + comp7) → 章節選擇/讀檔 (0x8B7C + comp6)
// 幾何全部來自 CS:0xE16 組件表原始記錄；雲紋/金框素材 = ICONGRF.DAT 逆向提取
//   (tools/extract_ui.py → grf/ui/cloud.png + frame0..3.png)
// 雲紋平鋪對齊螢幕原點 (0xF26E: src += (x0 mod 256)/8 + (y0 mod 32)*4)
// 金框拼裝復刻 0xC14 + DOSBox 截圖比對: 頂/底=紅帶(idx10)+方框鏈片(frame_sq);
// 左右柱(含四角)=實心柱塊 frame_col 整柱堆疊 (放大截圖比對確認)
const COLORS = {
  0: "#000000",
  2: "#aabbbb",
  4: "#446644",
  5: "#559944",
  9: "#ffdd99",
  10: "#dd0000",
  13: "#88aa66",
  15: "#ffffff",
};
const FONT = '16px "Noto Serif TC","PMingLiU",serif';
import { portrait } from "../core/assets.js";
const TABLE_BG = "#f0d090"; // 原版列表米黄底 (240,208,144)

export class StartMenu {
  constructor(app) {
    this.app = app;
    this.cv = document.querySelector("#startv");
    this.ctx = this.cv.getContext("2d");
    this._imgs = null;
    this._hover = -1;
    this._onClick = null;
    this._onMove = null;
    this._onCtx = null;
    // 全域屏蔽瀏覽器右鍵選單
    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  async _loadAssets() {
    if (this._imgs) return this._imgs;
    // 预载表格数字字体 (仅数字列使用 Oswald, 中文仍 Noto Serif TC)
    try {
      await document.fonts.load('300 16px "Oswald"');
    } catch {}
    const load = (n) =>
      new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = `grf/ui/${n}`;
      });
    this._imgs = {
      cloud: await load("cloud.png"),
      sq: await load("frame_sq.png"),
      col: await load("frame_col.png"),
      cap: await load("frame_cap.png"),
    };
    return this._imgs;
  }

  // ── 主流程: 對應 0x1AC3 迴圈 (YES/NO 無取消路徑, 右鍵僅在二級對話框回退) ──
  async show(initialAction) {
    const hidden = [];
    for (const id of ["panel", "legend", "cmdpanel", "tip"]) {
      const el = document.querySelector(`#${id}`);
      if (el && el.style.display !== "none") {
        el.style.display = "none";
        hidden.push(el);
      }
    }
    this.cv.style.display = "block";
    try {
      await this._loadAssets();
      let nextAct = initialAction;
      for (;;) {
        const act = nextAct !== undefined ? nextAct : await this._yesNo(); // 0=新遊戲 1=載入 (0x8DC8 無右鍵取消)
        nextAct = undefined;
        if (act === 0) {
          // 章節選擇: 20 章(原版4章置顶+其它章) → 屏幕居中加大彈窗
          const sortedIdx = await this.prompt({
            x: "center",
            y: "center", // 按画布尺寸动态居中
            w: 448,
            h: 368, // 雲窗 640×400 居中 (金框 88,8..552,392)
            title: "新游戏",
            rowH: 28, // 紧行距: 20px 黑带 + 8px 间隔
            rows: this._chapterRows(),
          });
          if (sortedIdx < 0) continue; // 右鍵 → 回 YES/NO (0x1AE3 jb)
          const idx = this._sortedScenarios?.[sortedIdx]?._origIdx ?? sortedIdx;
          const f = await this._factionDialog(idx);
          if (f < 0) continue; // 右鍵 → 回章節選擇
          // 軍師確認 (0x8E5A→0x8FC9): undefined=右鍵回勢力選擇, null=用原軍師, 對象=自定軍師
          const adv = await this._advisorDialog(idx, f);
          if (adv === undefined) continue;
          this.app.setScenario(idx, f, adv);
          return;
        }
        const slot = await this.prompt({
          x: "center",
          y: "center",
          w: 448, // 加宽 (原 304)
          h: 256, // 4 槽 × 56 + 顶部 30 + 余量
          title: "读取存档",
          rowH: 56, // 列表项加高, 上下留 pad
          pad: 8,
          rows: this._saveRows(),
        });
        if (slot < 0) continue; // 右鍵 → 回 YES/NO (0x1ADC jb)
        this.app.loadSave(slot);
        return;
      }
    } finally {
      this.cv.style.display = "none";
      for (const el of hidden) el.style.display = "";
    }
  }

  _chapterRows() {
    // SINARIO.DAT: 原版 4 章放在最前面，其余章节依次排列
    const all = this.app.data.scenarios;
    const origIndices = [16, 17, 18, 19];
    const orig = origIndices
      .filter((i) => all[i])
      .map((i) => ({ ...all[i], _origIdx: i }));
    const others = all
      .map((s, i) => ({ ...s, _origIdx: i }))
      .filter((_s, i) => !origIndices.includes(i));
    const sorted = [...orig, ...others];
    this._sortedScenarios = sorted;
    return sorted.map((s) => ({
      name: s.name,
      date: s.start,
    }));
  }

  _factionRows(scen) {
    // 各势力行: 君主名/军师名(势力记录 byte[2] 指定, 0x7F=无→---)/武将数/据点数/首都名
    return scen.factions
      .filter((f) => f.monarch && f.monarch.trim())
      .map((f) => {
        const adv = f.advisor_idx == null ? null : scen.generals[f.advisor_idx];
        return {
          cols: [
            f.monarch,
            adv?.name?.trim() || "－－－",
            `${f.n_generals}`,
            `${f.n_cities}`,
            scen.cities[f.capital]?.name ?? "－－－",
          ],
        };
      });
  }

  // ── 势力选择: NEW GAME 选章节后弹出 (通用 prompt 加宽加高版, 无标题) ──
  _factionDialog(scenIdx) {
    const scen = this.app.data.scenarios[scenIdx];
    return this.prompt({
      x: 96,
      y: 16,
      w: 448,
      h: 368, // 云窗 448×368, 金框 88,8..552,392
      header: ["勢力名", "軍師名", "武将", "據點", "首都"],
      colX: [8, 112, 232, 288, 336],
      rowH: 16,
      rows: this._factionRows(scen),
    });
  }

  // ── 軍師頭像快取 (kao/{portrait}.png, 128×128) ──
  _kao(i) {
    this._kaos ??= {};
    return (this._kaos[i] ??= portrait(i).catch(() => null));
  }

  // 自創軍師命名文字庫 (END_S15.DAT → nametable.json, KI.EXE 0x8FC8)
  _nameTable() {
    this._nt ??= fetch("nametable.json").then((r) => r.json());
    return this._nt;
  }

  // ── 軍師確認 (0x8E5A→0x8FC9): 君主/軍師頭像 + 首都/武将数/據點数 + 自定/确定 ──
  // 返回: undefined=右鍵回退, null=確認原軍師(無軍師則直接確認), {name,hao,portrait}=自定
  async _advisorDialog(scenIdx, facIdx) {
    const scen = this.app.data.scenarios[scenIdx];
    const f = scen.factions[facIdx];
    const mon = scen.generals[f.monarch_idx];
    const adv = f.advisor_idx == null ? null : scen.generals[f.advisor_idx];
    const cap = f.capital == null ? null : scen.cities[f.capital];
    const w = 352,
      h = 384; // 原版: 近全屏高 (金框 368×400 居中)
    const px = (640 - w) >> 1,
      py = (400 - h) >> 1;
    const monImg = await this._kao(mon.portrait);
    const advImg = adv ? await this._kao(adv.portrait) : null;
    const btns = [
      { label: "自定", act: "custom", x: px + 272, y: py + 224 },
      { label: "确定", act: "ok", x: px + 272, y: py + 272 },
    ];
    const draw = (hoverAct) => {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, 640, 400);
      this._frame(px - 8, py - 8, (w + 16) / 16, (h + 16) / 16);
      this._cloud(px, py, w, h);
      // 君主 (左): 大頭像 192×192 + 稱謂/名分兩行
      if (monImg)
        ctx.drawImage(monImg, 0, 0, 128, 128, px + 16, py + 16, 192, 192);
      this._text("君主", px + 16, py + 224, 15);
      this._text(mon.name.trim(), px + 16, py + 248, 15);
      // 軍師 (右上): 稱謂 + 名(無軍師=－－－) + 小頭像 96×96 (明顯小於君主)
      this._text("軍師", px + 208, py + 20, 15);
      this._text(adv ? adv.name.trim() : "－－－", px + 256, py + 20, 15);
      if (advImg)
        ctx.drawImage(advImg, 0, 0, 128, 128, px + 216, py + 48, 96, 96);
      // 情报表 (左下): 三行分別与 君主/曹操 及其下一行同高, 标签 x=88, 数值右对齐 x=208
      const rows = [
        ["首都", cap ? cap.name.trim() : "－"],
        ["武将数", `${f.n_generals}`],
        ["據點数", `${f.n_cities}`],
      ];
      rows.forEach(([k, v], i) => {
        const y = py + 224 + i * 28;
        this._text(k, px + 88, y, 15);
        const isNum = /^\d+$/.test(v);
        ctx.font = isNum
          ? '300 16px "Oswald","Noto Serif TC","PMingLiU",serif'
          : FONT;
        const tw = ctx.measureText(v).width;
        if (isNum) {
          this._numText(v, px + 208 - tw, y, 15);
        } else {
          this._text(v, px + 208 - tw, y, 15);
        }
      });
      // 按鈕 (懸停反白, 64×28)
      for (const b of btns) {
        const hov = b.act === hoverAct;
        this._rect(b.x, b.y, b.x + 63, b.y + 27, hov ? 15 : 13);
        this._outline(b.x - 1, b.y - 1, b.x + 64, b.y + 28, 2);
        this._text(b.label, b.x + 16, b.y + 6, 0);
      }
    };
    return new Promise((resolve) => {
      const done = (v) => {
        this._unbind();
        resolve(v);
      };
      const hit = (x, y) =>
        btns.find((b) => this._in(x, y, b.x, b.y, b.x + 63, b.y + 27))?.act ??
        null;
      // 绑定抽成函数: 从 _nameDialog 返回后其 _bind/_unbind 会覆盖/移除本窗处理器, 需重绑
      const bind = () => this._bind(onClick, onMove);
      const onClick = (x, y, btn) => {
        if (btn === 2) return done(undefined); // 右鍵回退
        const act = hit(x, y);
        if (act === "ok") return done(null); // 確認原軍師
        if (act === "custom") {
          this._nameDialog({
            name: adv?.name?.trim() ?? "",
            hao: adv?.hao?.trim() ?? "",
            portrait: adv?.portrait ?? 0,
          }).then((r) => {
            if (r === undefined) {
              draw(null);
              bind(); // 重綁本窗按鈕 (被命名窗覆盖)
            } else done(r); // 保存後回本窗並立即確認進入遊戲
          });
        }
      };
      const onMove = (x, y) => {
        const act = hit(x, y);
        if (act !== this._hover) {
          this._hover = act;
          draw(act);
        }
      };
      bind();
      draw(null);
    });
  }

  // ── 自創軍師命名 (0x8FC9 + END_S15 碼表): 頭像前後翻 + 軍師名/別號 + 文字面板 ──
  // 重来=清空 继续=回退一字 确定=保存返回; 右鍵取消不保存
  async _nameDialog(cur = {}) {
    const { chars } = await this._nameTable();
    const COLS = 16,
      ROWS = 8,
      PER = COLS * ROWS,
      MAX = 4;
    const w = 480,
      h = 320;
    const px = (640 - w) >> 1,
      py = (400 - h) >> 1;
    let name = cur.name ?? "",
      hao = cur.hao ?? "",
      pt = cur.portrait ?? 0,
      field = 0,
      page = 0;
    const fields = [
      { label: "軍師名", x: px + 240, y: py + 16, get: () => name },
      { label: "別號", x: px + 240, y: py + 56, get: () => hao },
    ];
    const btns = [
      { label: "重来", act: "clear", x: px + 176, y: py + 100 },
      { label: "继续", act: "bs", x: px + 244, y: py + 100 },
      { label: "确定", act: "ok", x: px + 312, y: py + 100 },
      { label: "前▲", act: "prev", x: px + 16, y: py + 120 },
      { label: "後▼", act: "next", x: px + 72, y: py + 120 },
      { label: "上一頁", act: "pgup", x: px + 16, y: py + 282 },
      { label: "下一頁", act: "pgdn", x: px + 400, y: py + 282 },
    ];
    const draw = async (hoverAct, hoverCell) => {
      const img2 = await this._kao(pt);
      const ctx = this.ctx;
      ctx.clearRect(0, 0, 640, 400);
      this._frame(px - 8, py - 8, (w + 16) / 16, (h + 16) / 16);
      this._cloud(px, py, w, h);
      if (img2) ctx.drawImage(img2, 0, 0, 128, 128, px + 16, py + 16, 96, 96);
      // 輸入框 (活動框米黄底白描邊, 非活動灰底)
      fields.forEach((f2, i) => {
        this._text(f2.label, px + 176, f2.y + 4, 15);
        this._rect(
          f2.x,
          f2.y,
          f2.x + 127,
          f2.y + 23,
          i === field ? TABLE_BG : 2,
        );
        if (i === field)
          this._outline(f2.x - 1, f2.y - 1, f2.x + 128, f2.y + 24, 15);
        this._text(f2.get(), f2.x + 8, f2.y + 4, 0);
      });
      for (const b of btns) {
        const hov = b.act === hoverAct;
        this._rect(b.x, b.y, b.x + 55, b.y + 19, hov ? 15 : 13);
        this._outline(b.x - 1, b.y - 1, b.x + 56, b.y + 20, 2);
        this._text(b.label, b.x + 4, b.y + 2, 0);
      }
      // 文字面板 (END_S15 碼表 16×8 分頁) — 原版: 蓝底白字直接绘在云窗上, 无面板底色
      ctx.font = FONT;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const idx = page * PER + r * COLS + c;
          if (idx >= chars.length) break;
          if (idx === hoverCell) {
            // 悬停反白: 黑底块
            this._rect(
              px + 16 + c * 16,
              py + 144 + r * 16,
              px + 31 + c * 16,
              py + 159 + r * 16,
              0,
            );
          }
          ctx.fillStyle = COLORS[15]; // 原版白字
          ctx.fillText(chars[idx], px + 16 + c * 16, py + 144 + r * 16);
        }
    };
    return new Promise((resolve) => {
      const done = (v) => {
        this._unbind();
        resolve(v);
      };
      const redraw = (hoverAct = null, hoverCell = -1) =>
        draw(hoverAct, hoverCell);
      const hitBtn = (x, y) =>
        btns.find((b) => this._in(x, y, b.x, b.y, b.x + 55, b.y + 19))?.act ??
        null;
      const hitField = (x, y) =>
        fields.findIndex((f2) =>
          this._in(x, y, f2.x, f2.y, f2.x + 127, f2.y + 23),
        );
      const hitCell = (x, y) => {
        if (
          !this._in(
            x,
            y,
            px + 16,
            py + 144,
            px + 15 + COLS * 16,
            py + 143 + ROWS * 16,
          )
        )
          return -1;
        const c = (x - px - 16) >> 4,
          r = (y - py - 144) >> 4;
        const idx = page * PER + r * COLS + c;
        return idx < chars.length ? idx : -1;
      };
      this._bind(
        (x, y, btn) => {
          if (btn === 2) return done(undefined); // 右鍵取消不保存
          const act = hitBtn(x, y);
          if (act === "clear") {
            name = "";
            hao = "";
            redraw();
          } else if (act === "bs") {
            if (field === 0) name = name.slice(0, -1);
            else hao = hao.slice(0, -1);
            redraw();
          } else if (act === "ok") {
            if (!name.trim()) return; // 無名不可確定
            done({ name: name.trim(), hao: hao.trim(), portrait: pt });
          } else if (act === "prev") {
            pt = (pt + 149) % 150;
            redraw();
          } else if (act === "next") {
            pt = (pt + 1) % 150;
            redraw();
          } else if (act === "pgup") {
            page = Math.max(0, page - 1);
            redraw();
          } else if (act === "pgdn") {
            page = Math.min(Math.ceil(chars.length / PER) - 1, page + 1);
            redraw();
          } else {
            const fi = hitField(x, y);
            if (fi >= 0) {
              field = fi;
              redraw();
              return;
            }
            const ci = hitCell(x, y);
            if (ci >= 0) {
              if (field === 0 && name.length < MAX) name += chars[ci];
              else if (field === 1 && hao.length < MAX) hao += chars[ci];
              redraw();
            }
          }
        },
        (x, y) => {
          redraw(hitBtn(x, y), hitCell(x, y));
        },
      );
      redraw();
    });
  }

  _saveRows() {
    // 瀏覽器 IndexedDB 四槽；未使用槽禁止選擇。
    const slots = this.app.saves?.slots ?? [];
    return [0, 1, 2, 3].map((i) => {
      const sv = slots.find((s) => s.slot === i);
      if (!sv || !sv.played) {
        return { name: "（未使用）", date: null, disabled: true };
      }
      const d = sv.state?.save_date;
      return {
        name: `${sv.label ?? ""}`,
        date: d ? { year: d.year, month: d.month, day: d.day } : null,
      };
    });
  }

  // ── YES/NO 對話框: comp7 @ (216,136), 金框 @ (208,128) 208×96 (0x8DC8) ──
  _yesNo() {
    return new Promise((resolve) => {
      const ox = 216,
        oy = 136;
      this._renderYesNo(ox, oy);
      this._bind((x, y, btn) => {
        if (btn === 2) return; // 右鍵不取消 (0x8E19 jb 重試)
        if (this._in(x, y, ox + 30, oy + 30, ox + 161, oy + 49))
          resolve(0); // 是
        else if (this._in(x, y, ox + 30, oy + 54, ox + 161, oy + 73))
          resolve(1); // 否
      }, null);
    });
  }

  // ── 通用窗口生成器 (全 UI 弹窗共用样式, 输入长宽即可) ──
  // opt: { x, y        云窗左上角 (游戏坐标 640×400); 传 "center" 则按画布尺寸动态居中
  //        w, h        云窗尺寸 (金框自动外包 8px; 建议为 16 的倍数)
  //        title       顶部白字标题 (全角串, 自动居中)
  //        rows        [{ name, date? }] 或 [{ cols: [...] }] 行 (空 name 行不可选)
  //        rowH        行高 (默认 48; 紧凑表格式传 16)
  //        header      表头列标签数组 (可选, 占 16px 一行, 需配 colX)
  //        colX        cols/表头各列相对 x 偏移 (row.cols 时必传)
  //        date        底部居中绿钮日期 {year,month,day} (可选)
  //      }
  // 返回: 点击的绝对行号 (0-based)；右键取消 = -1。行数超容量时滚轮滚动+滚动条。
  async prompt(opt) {
    const {
      x,
      y,
      w,
      h,
      title = "",
      rows = [],
      rowH = 48,
      pad = 4, // 列表行上下内边距 (黑带高度 = rowH - 2*pad)
      header = null,
      colX = null,
      date = null,
    } = opt;
    // 动态居中: 按画布逻辑尺寸算, 不硬编码坐标 (画布内容无法用 CSS 居中)
    const CW = this.cv.width || 640,
      CH = this.cv.height || 400;
    const px = x === "center" ? Math.floor((CW - w) / 2) : x;
    const py = y === "center" ? Math.floor((CH - h) / 2) : y;
    const tw = (w + 16) / 16,
      th = (h + 16) / 16;
    const rowTop0 = rowH >= 24 ? 30 : 28; // 列表行=30, 紧凑表格=28
    const headY = title ? 26 : 4; // 表头黑带 y 偏移 (无标题时顶格)
    const top = header ? headY + 18 : rowTop0; // 首行 y 偏移 (表头占 16px+2 间隔)
    const bottom = date ? 20 : 0; // 底部日期带
    const cap = Math.max(1, Math.floor((h - top - bottom - 2) / rowH));
    let scroll = 0; // 可视首行 (绝对行号)
    const draw = (hover) => {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, 640, 400);
      this._frame(px - 8, py - 8, tw, th);
      this._cloud(px, py, w, h);
      if (title) this._rect(px, py + 23, px + w - 1, py + 23, 15);
      const n = Math.min(rows.length - scroll, cap);
      const hasScrollbar = rows.length > cap;
      const rowsTop = py + top;
      if (rowH < 24) {
        // 紧凑表格 (原版配色: 黑底白字表头 + 米黄底黑字行) — 先画带后画字
        const twRight = hasScrollbar ? px + w - 20 : px + w - 1;
        this._rect(px, py + headY, twRight, py + headY + 15, 0); // 表头黑带
      }
      if (header)
        header.forEach((t, c) =>
          this._text(t, px + colX[c], py + headY + 2, 15),
        );
      if (rowH < 24) {
        const twRight = hasScrollbar ? px + w - 20 : px + w - 1;
        this._rect(px, rowsTop, twRight, rowsTop + cap * rowH - 1, TABLE_BG);
      }
      for (let i = 0; i < n; i++) {
        const row = rows[scroll + i];
        const ry = rowsTop + rowH * i;
        if (rowH >= 24) {
          // 列表行: 黑带上下留 pad, 文字垂直居中 (前端 padding 布局思路)
          const rw = hasScrollbar ? px + w - 20 : px + w - 17;
          this._rect(px + 16, ry + pad, rw, ry + rowH - pad - 1, 0);
          if (!row) continue;
          const ty = ry + pad + Math.floor((rowH - 2 * pad - 16) / 2);
          this._text(row.name, px + 18, ty, scroll + i === hover ? 15 : 9);
          if (row.date) {
            // 日期跟在名称同行: 白字无背景, 行内右对齐 (左名右日期 space-between)
            const ds = this._dateStr(row.date);
            this.ctx.font =
              '300 16px "Oswald","Noto Serif TC","PMingLiU",serif';
            const tw = this.ctx.measureText(ds).width;
            const dateRight = hasScrollbar ? px + w - 24 : px + w - 18;
            this._numText(ds, dateRight - tw, ty, 15);
          }
        } else {
          if (!row) continue;
          const hov = scroll + i === hover;
          const twRight = hasScrollbar ? px + w - 20 : px + w - 1;
          if (hov) this._rect(px, ry, twRight, ry + rowH - 1, 0); // 悬停反白
          row.cols.forEach((t, c) => {
            const draw = /^\d+$/.test(t) ? this._numText : this._text; // 数字列用 DIN 字体
            draw.call(this, t, px + colX[c], ry + 1, hov ? 15 : 0);
          });
        }
      }
      if (date) {
        const dx = px + Math.floor((w - 122) / 2),
          dy = py + h - 18;
        this._rect(dx, dy, dx + 121, dy + 15, 5);
        this._outline(dx - 2, dy - 2, dx + 123, dy + 17, 2);
        this._outline(dx - 1, dy - 1, dx + 122, dy + 16, 13);
        this._numText(this._dateStr(date), dx + 6, dy + 2, 0);
      }
      // 滚动条 (完全由 Canvas 绘制，与游戏内列表弹窗完全一致)
      if (rows.length > cap) {
        const sbx = px + w - 17;
        const sby = py + (title ? 26 : 4);
        const sbw = 16;
        const btnH = 16;
        const trackY = sby + btnH;
        const trackH = h - (title ? 26 : 4) - (date ? 20 : 0) - btnH * 2;
        const bby = sby + btnH + trackH;

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

        // 滑块
        const thumbH = Math.max(16, Math.round(trackH * (cap / rows.length)));
        const thumbY =
          trackY +
          Math.round((scroll / (rows.length - cap)) * (trackH - thumbH));

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

      if (title) {
        const tx = px + Math.max(0, (w - title.length * 16) / 2);
        this._fwText(title, tx, py + 3, 15);
      }
    };
    this._hover = -1;
    draw(-1);

    return new Promise((resolve) => {
      const done = (v) => {
        resolve(v);
      };
      const setScroll = (ns) => {
        ns = Math.max(0, Math.min(rows.length - cap, ns));
        if (ns !== scroll) {
          scroll = ns;
          this._hover = -1;
          draw(-1);
        }
      };
      const hit = (x2, y2) => {
        const n = Math.min(rows.length - scroll, cap);
        const rightBound = rows.length > cap ? px + w - 20 : px + w - 15;
        for (let i = 0; i < n; i++) {
          const ry = py + top + rowH * i;
          if (
            rows[scroll + i] &&
            !rows[scroll + i].disabled &&
            this._in(x2, y2, px + 14, ry, rightBound, ry + rowH - 1)
          )
            return scroll + i;
        }
        return -1;
      };
      this._bind(
        (x2, y2, btn) => {
          if (btn === 2) {
            done(-1); // 右键取消
            return;
          }
          // 滚动条交互
          if (rows.length > cap) {
            const sbx = px + w - 17;
            const sby = py + (title ? 26 : 4);
            const sbw = 16;
            const btnH = 16;
            const trackY = sby + btnH;
            const trackH = h - (title ? 26 : 4) - (date ? 20 : 0) - btnH * 2;
            const bby = sby + btnH + trackH;
            if (x2 >= sbx && x2 < sbx + sbw) {
              if (y2 >= sby && y2 < sby + btnH) {
                setScroll(scroll - 1);
                return;
              }
              if (y2 >= bby && y2 < bby + btnH) {
                setScroll(scroll + 1);
                return;
              }
              if (y2 >= trackY && y2 < trackY + trackH) {
                const rel = (y2 - trackY) / trackH;
                setScroll(Math.round(rel * (rows.length - cap)));
                return;
              }
            }
          }
          const i = hit(x2, y2);
          if (i >= 0) done(i);
        },
        (x2, y2) => {
          const i = hit(x2, y2);
          if (i !== this._hover) {
            this._hover = i;
            draw(i);
          }
        },
        (dy) => {
          // 滚轮滚动 (每格 1 行)
          if (rows.length <= cap) return;
          setScroll(scroll + (dy > 0 ? 1 : -1));
        },
      );
    });
  }

  _bind(onClick, onMove, onWheel) {
    const toGame = (e) => {
      const r = this.cv.getBoundingClientRect();
      return [
        Math.round((e.clientX - r.left) * (640 / r.width)),
        Math.round((e.clientY - r.top) * (400 / r.height)),
      ];
    };
    this._unbind();
    this._onClick = (e) => {
      const [x, y] = toGame(e);
      onClick(x, y, e.button);
    };
    this._onMove = onMove
      ? (e) => {
          const [x, y] = toGame(e);
          onMove(x, y);
        }
      : null;
    this._onWheel = onWheel
      ? (e) => {
          e.preventDefault();
          onWheel(e.deltaY);
        }
      : null;
    // pointerdown: 右鍵(button=2)不觸發 click, 必須用 pointerdown 才能收到取消路徑
    this.cv.addEventListener("pointerdown", this._onClick);
    if (this._onMove) this.cv.addEventListener("mousemove", this._onMove);
    if (this._onWheel)
      this.cv.addEventListener("wheel", this._onWheel, { passive: false });
  }

  _unbind() {
    if (this._onClick)
      this.cv.removeEventListener("pointerdown", this._onClick);
    if (this._onMove) this.cv.removeEventListener("mousemove", this._onMove);
    if (this._onWheel) this.cv.removeEventListener("wheel", this._onWheel);
    this._onClick = this._onMove = this._onWheel = null;
  }

  _in(x, y, x0, y0, x1, y1) {
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  // ── 繪製原語 ──

  // 金框 0xC14(dx,bx,cx): 16px 格單位。
  // 頂/底帶: 方框鏈片 frame_sq (不透明: 綠□+紅底) 逐 8px (柱之間);
  // 左右柱: 角帽 frame_cap(頂/底各一带) + 柱身 frame_col(金/奶油/深橙三色)
  _frame(ox, oy, wTiles, hTiles) {
    const ctx = this.ctx;
    const { sq, col, cap } = this._imgs;
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

  // 雲紋視窗 type7 (0xF26E): 32×32 平鋪, 對齊螢幕原點
  _cloud(x, y, w, h) {
    const ctx = this.ctx;
    const pat = ctx.createPattern(this._imgs.cloud, "repeat");
    ctx.fillStyle = pat;
    ctx.fillRect(x, y, w, h);
  }

  _rect(x0, y0, x1, y1, color) {
    this.ctx.fillStyle = COLORS[color] ?? color;
    this.ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  _outline(x0, y0, x1, y1, color) {
    this._rect(x0, y0, x1, y0, color);
    this._rect(x0, y1, x1, y1, color);
    this._rect(x0, y0, x0, y1, color);
    this._rect(x1, y0, x1, y1, color);
  }

  // 全角文字: 每字 16px 節進 (0xF6DC di=16/8)
  _fwText(str, x, y, color) {
    const ctx = this.ctx;
    ctx.font = FONT;
    ctx.fillStyle = COLORS[color] ?? color;
    ctx.textBaseline = "top";
    let cx = x;
    for (const ch of str) {
      ctx.fillText(ch, cx, y);
      cx += 16; // 固定全角節進
    }
    return cx;
  }

  _text(str, x, y, color) {
    const ctx = this.ctx;
    ctx.font = FONT;
    ctx.fillStyle = COLORS[color] ?? color;
    ctx.textBaseline = "top";
    ctx.fillText(str, x, y);
  }

  // 纯数字文本: 用 Oswald (仅限数字显示), 中文回落 Noto Serif TC
  _numText(str, x, y, color) {
    const ctx = this.ctx;
    ctx.font = '300 16px "Oswald","Noto Serif TC","PMingLiU",serif';
    ctx.fillStyle = COLORS[color] ?? color;
    ctx.textBaseline = "top";
    ctx.fillText(str, x, y);
  }

  // 日期格式 0x62F: "196年 4月 1日" (月/日十位補空格)
  _dateStr(d) {
    const p = (n) => (n >= 10 ? `${n}` : ` ${n}`);
    return `${d.year}年 ${p(d.month)}月 ${p(d.day)}日`;
  }

  // ── comp7 @rel: 雲窗(0,0,191,79) 白線y23 按鈕×2 描邊×4 文字×2 ──
  _renderYesNo(ox, oy) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 640, 400);
    this._frame(ox - 8, oy - 8, 13, 6);
    this._cloud(ox, oy, 192, 80);
    this._rect(ox, oy + 23, ox + 191, oy + 23, 15); // type5 白線
    for (const [dy, label] of [
      [32, "是"],
      [56, "否"],
    ]) {
      this._rect(ox + 32, oy + dy, ox + 159, oy + dy + 15, 5); // type3 綠底
      this._outline(ox + 30, oy + dy - 2, ox + 161, oy + dy + 17, 2); // type4 外框
      this._outline(ox + 31, oy + dy - 1, ox + 160, oy + dy + 16, 13); // type4 內框
      this._fwText(label, ox + 88, oy + dy, 0); // type8 黑字
    }
    // 標題 "新游戏" 白字
    this._fwText("新游戏", ox + 72, oy + 4, 15);
  }
}
