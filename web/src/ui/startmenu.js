// 開場選單系統 — 1:1 復刻 KI.EXE 開局流程 (0x1AC3)
//   YES/NO 對話框 (0x8DC8 + comp7) → 章節選擇/讀檔 (0x8B7C + comp6)
// 幾何全部來自 CS:0xE16 組件表原始記錄；雲紋/金框素材 = ICONGRF.DAT 逆向提取
//   (tools/extract_ui.py → grf/ui/cloud.png + frame0..3.png)
// 雲紋平鋪對齊螢幕原點 (0xF26E: src += (x0 mod 256)/8 + (y0 mod 32)*4)
// 金框拼裝復刻 0xC14 + DOSBox 截圖比對: 頂/底=紅帶(idx10)+方框鏈片(frame_sq);
// 左右柱(含四角)=實心柱塊 frame_col 整柱堆疊 (放大截圖比對確認)
import { runStartFlow } from "../app/startflow.js";

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
    // 标题阶段的首次操作就是可靠的用户手势；在该手势内解锁并预缓存
    // 接战WAV，避免数分钟后首次委任战斗才启动AudioContext/解码。
    this._engageSfxWarmup = null;
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
      await runStartFlow(
        {
          chooseAction: () => this._yesNo(),
          chooseChapter: () => this._chooseChapter(),
          chooseFaction: (idx) => this._factionDialog(idx),
          chooseAdvisor: (idx, faction) => this._advisorDialog(idx, faction),
          chooseSave: () => this._chooseSave(),
          beginNewGame: async (idx, f, adv) => {
            await this.app.beginNewGame(idx, f, adv);
          },
          beginSavedGame: async (slot) => {
            await this.app.beginSavedGame(slot);
          },
        },
        initialAction,
      );
    } finally {
      this.cv.style.display = "none";
      for (const el of hidden) el.style.display = "";
    }
  }

  async _chooseChapter() {
    const sortedIdx = await this.prompt({
      x: "center",
      y: "center",
      w: 448,
      h: 368,
      title: "新游戏",
      rowH: 28,
      rows: this._chapterRows(),
    });
    if (sortedIdx < 0) return sortedIdx;
    return this._sortedScenarios?.[sortedIdx]?._origIdx ?? sortedIdx;
  }

  _chooseSave() {
    return this.prompt({
      x: "center",
      y: "center",
      w: 448,
      h: 256,
      title: "读取存档",
      rowH: 56,
      pad: 8,
      rows: this._saveRows(),
    });
  }

  _chapterRows() {
    // 目录决定官方章节与旧槽号；无目录的旧调用/测试保留原排序兼容。
    const all = this.app.data.scenarios;
    const origIndices = this.app.content
      ? this.app.content.chapters
          .filter((chapter) => chapter.official)
          .map((chapter) => chapter.legacyScenarioIndex)
      : [16, 17, 18, 19];
    const orig = origIndices
      .filter((i) => all[i])
      .map((i) => ({ ...all[i], _origIdx: i }));
    const others = all
      .map((s, i) => ({ ...s, _origIdx: i }))
      .filter((_s, i) => !origIndices.includes(i));
    const sorted = [...orig, ...others];
    this._sortedScenarios = sorted;
    return sorted.map((s) => {
      // 仅在新游戏列表标注合集章节；内部 scenario.name 仍保留原始标题。
      const name = s.name.replace(/(章[．.])　　/, "$1 ");
      return {
        name: origIndices.includes(s._origIdx) ? name : `[重制]${name}`,
        date: s.start,
      };
    });
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
    if (!this._kaos[i]) {
      this._kaos[i] = portrait(i).catch(() => null);
    }
    return this._kaos[i];
  }

  // 自創軍師命名文字庫 (END_S15.DAT → nametable.json, KI.EXE 0x8FC8)
  _nameTable() {
    this._nt ??= fetch("nametable.json").then((r) => r.json());
    return this._nt;
  }

  // ── 軍師確認 (0x8E5A→0x8FC9): 君主/軍師頭像 (64×64) + 首都/武將數/據點數 + 自定/確定 ──
  // 原版外框 240×192 (15×12 tiles, 金框邊厚各 8px, 內部雲紋 224×176)
  // 返回: undefined=右鍵回退, null=確認原軍師(無軍師則直接確認), {name,hao,portrait}=自定
  async _advisorDialog(scenIdx, facIdx) {
    const scen = this.app.data.scenarios[scenIdx];
    const f = scen.factions[facIdx];
    const mon = scen.generals[f.monarch_idx];
    const adv = f.advisor_idx == null ? null : scen.generals[f.advisor_idx];
    const cap = f.capital == null ? null : scen.cities[f.capital];
    const w = 224,
      h = 176; // 金框外圍 240×192 (15×12 tiles)，居中 (208, 112)
    const px = (640 - w) >> 1,
      py = (400 - h) >> 1;
    const monImg = await this._kao(mon.portrait);
    const advImg = adv ? await this._kao(adv.portrait) : null;
    const btns = [
      { label: "自定", act: "custom", x: px + 159, y: py + 126, w: 50, h: 18 },
      { label: "確定", act: "ok", x: px + 159, y: py + 150, w: 50, h: 18 },
    ];
    const draw = (hoverAct) => {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, 640, 400);
      this._frame(px - 8, py - 8, 15, 12);
      this._cloud(px, py, w, h);

      // 上部頭像與文字區域黑色底框 (寬 208, 高 104, 包含君主/軍師頭像及名號)
      ctx.fillStyle = "#000000";
      ctx.fillRect(px + 8, py + 7, 208, 104);

      // 下部情報區域黑色底框 (寬 144, 高 48, 包含首都/武將數/據點數及數值)
      ctx.fillRect(px + 8, py + 119, 144, 48);

      // 君主 (左上): 64×64 頭像 + 下方「君主」/君主名 (縮進 16px)
      if (monImg)
        ctx.drawImage(monImg, 0, 0, 128, 128, px + 16, py + 7, 64, 64);
      this._text("君主", px + 16, py + 79, 15);
      this._text(mon.name.trim(), px + 32, py + 95, 15);

      // 軍師 (右上): 「軍師」/軍師名 (縮進 16px) + 64×64 頭像 (無軍師則空)
      this._text("軍師", px + 144, py + 7, 15);
      this._text(adv ? adv.name.trim() : "－－－", px + 160, py + 23, 15);
      if (advImg)
        ctx.drawImage(advImg, 0, 0, 128, 128, px + 144, py + 47, 64, 64);

      // 情報表 (左下): 首都 / 武將數 / 據點數 + 白色豎線 + 數值
      this._text("首\u3000都", px + 16, py + 119, 15);
      this._text("武將數", px + 16, py + 135, 15);
      this._text("據點數", px + 16, py + 151, 15);

      // 白色分割豎線 (x=79, y=119..166, 高 48px)
      this._rect(px + 79, py + 119, px + 79, py + 166, 15);

      // 首都名
      this._text(cap ? cap.name.trim() : "－－－", px + 96, py + 119, 15);

      // 武將數 & 據點數 (右對齊於 px + 126)
      const numFont = '300 16px "Oswald","Noto Serif TC","PMingLiU",serif';
      ctx.font = numFont;
      const genStr = `${f.n_generals}`;
      const genTw = ctx.measureText(genStr).width;
      this._numText(genStr, px + 126 - genTw, py + 135, 15);

      const cityStr = `${f.n_cities}`;
      const cityTw = ctx.measureText(cityStr).width;
      this._numText(cityStr, px + 126 - cityTw, py + 151, 15);

      // 按鈕 (立體黃褐金屬底色, 懸停反白, 50×18)
      for (const b of btns) {
        const hov = b.act === hoverAct;
        const x0 = b.x,
          y0 = b.y,
          x1 = b.x + b.w - 1,
          y1 = b.y + b.h - 1;
        // 填充底色
        ctx.fillStyle = hov ? "#ffffff" : "#c08020";
        ctx.fillRect(x0 + 1, y0 + 1, b.w - 2, b.h - 2);
        // 立體邊框: 頂/左高亮 (#f0d090), 底/右陰影 (#804020)
        ctx.fillStyle = hov ? "#ffffff" : "#f0d090";
        ctx.fillRect(x0, y0, b.w - 1, 1);
        ctx.fillRect(x0, y0, 1, b.h);
        ctx.fillStyle = hov ? "#442211" : "#804020";
        ctx.fillRect(x1, y0, 1, b.h);
        ctx.fillRect(x0 + 1, y1, b.w - 1, 1);
        // 文字 (黑體 16px 居中: x+9, y+1)
        this._text(b.label, b.x + 9, b.y + 1, 0);
      }
    };
    return new Promise((resolve) => {
      const done = (v) => {
        this._unbind();
        resolve(v);
      };
      const hit = (x, y) =>
        btns.find((b) => this._in(x, y, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1))
          ?.act ?? null;
      // 绑定抽成函数: 从 _nameDialog 返回后其 _bind/_unbind 会覆盖/移除本窗处理器, 需重绑
      const bind = () => this._bind(onClick, onMove);
      const onClick = (x, y, btn) => {
        if (btn === 2) return done(undefined); // 右鍵回退
        const act = hit(x, y);
        if (act === "ok") return done(null); // 確認原軍師
        if (act === "custom") {
          this._nameDialog({
            name: "",
            hao: "",
            portrait: adv?.portrait ?? 145,
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

  // ── 自創軍師命名: 頭像前後翻 + 原生輸入框 (最多3個全角漢字或6個英數) + 確定/取消 ──
  async _nameDialog(cur = {}) {
    const w = 336,
      h = 176;
    const px = (640 - w) >> 1,
      py = (400 - h) >> 1;
    let pt = cur.portrait ?? 145; // 預設頭像 (0x5221 預設 145 號儒士頭像)
    let errorMsg = null;
    let hoverAct = null;

    // 字符等效寬度計算: 全角字符 (漢字、日文假名、韓文諺文等) 佔 2, 半角英數佔 1
    const clampVisualWidth = (str, maxUnits = 6) => {
      let width = 0;
      let res = "";
      for (const ch of str) {
        const cw = ch.charCodeAt(0) > 0x7f ? 2 : 1;
        if (width + cw > maxUnits) break;
        width += cw;
        res += ch;
      }
      return res;
    };

    // 建立 DOM 輸入框容器
    const overlay = document.createElement("div");
    overlay.id = "advisor-input-overlay";
    overlay.style.position = "fixed";
    overlay.style.zIndex = "70";
    overlay.style.pointerEvents = "none";
    overlay.style.userSelect = "none";

    const createInput = (placeholder) => {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = placeholder;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.style.position = "absolute";
      input.style.pointerEvents = "auto";
      input.style.border = "1px solid #804020";
      input.style.background = "#eed8a1";
      input.style.color = "#000000";
      input.style.fontFamily =
        '"Noto Serif TC","Noto Serif SC","PMingLiU","SimSun",serif';
      input.style.fontWeight = "bold";
      input.style.textAlign = "center";
      input.style.outline = "none";
      input.style.boxSizing = "border-box";
      input.style.boxShadow = "inset 1px 1px 2px rgba(0,0,0,0.35)";

      input.onfocus = () => {
        input.style.border = "1px solid #ffd700";
        input.style.boxShadow =
          "0 0 6px rgba(255, 215, 0, 0.8), inset 1px 1px 2px rgba(0,0,0,0.2)";
      };
      input.onblur = () => {
        input.style.border = "1px solid #804020";
        input.style.boxShadow = "inset 1px 1px 2px rgba(0,0,0,0.35)";
      };
      input.oninput = () => {
        const clamped = clampVisualWidth(input.value, 6);
        if (input.value !== clamped) input.value = clamped;
        if (errorMsg) {
          errorMsg = null;
          draw();
        }
      };
      return input;
    };

    const nameInput = createInput("最多3字");
    const haoInput = createInput("最多3字");
    overlay.append(nameInput, haoInput);
    document.body.append(overlay);

    const syncPositions = () => {
      const r = this.cv.getBoundingClientRect();
      const scaleX = r.width / 640;
      const scaleY = r.height / 400;
      overlay.style.left = `${r.left}px`;
      overlay.style.top = `${r.top}px`;
      overlay.style.width = `${r.width}px`;
      overlay.style.height = `${r.height}px`;

      const positionInput = (el, ix, iy, iw, ih) => {
        el.style.left = `${ix * scaleX}px`;
        el.style.top = `${iy * scaleY}px`;
        el.style.width = `${iw * scaleX}px`;
        el.style.height = `${ih * scaleY}px`;
        el.style.fontSize = `${15 * scaleY}px`;
        el.style.lineHeight = `${ih * scaleY}px`;
      };
      positionInput(nameInput, px + 144, py + 48, 84, 26);
      positionInput(haoInput, px + 240, py + 48, 84, 26);
    };

    window.addEventListener("resize", syncPositions);
    syncPositions();
    setTimeout(() => nameInput.focus(), 50);

    // 交互區域定義
    const navBtns = [
      { act: "prev", x: px + 88, y: py + 22, w: 38, h: 20 },
      { act: "next", x: px + 88, y: py + 54, w: 38, h: 20 },
    ];
    const actionBtns = [
      { label: "確定", act: "ok", x: px + 98, y: py + 138, w: 64, h: 22 },
      { label: "取消", act: "cancel", x: px + 178, y: py + 138, w: 64, h: 22 },
    ];

    const draw = async () => {
      const img = await this._kao(pt);
      const ctx = this.ctx;
      ctx.clearRect(0, 0, 640, 400);

      // 外框與雲紋底: 22×12 tiles (外圍 352×192, 內部雲紋 336×176)
      this._frame(px - 8, py - 8, 22, 12);
      this._cloud(px, py, w, h);

      // 頂部黑色底框 (320×88)
      ctx.fillStyle = "#000000";
      ctx.fillRect(px + 8, py + 8, 320, 88);

      // 頭像 (64×64)
      if (img) ctx.drawImage(img, 0, 0, 128, 128, px + 16, py + 20, 64, 64);
      // 頭像外框細線
      ctx.strokeStyle = "#805020";
      ctx.strokeRect(px + 15.5, py + 19.5, 65, 65);

      // 頭像翻頁: 前▲ / 後▼ 與白色分割線 (原版風格)
      const prevHov = hoverAct === "prev";
      const nextHov = hoverAct === "next";
      this._text("前 ▲", px + 88, py + 24, prevHov ? 14 : 15);
      // 分割白線
      this._rect(px + 86, py + 48, px + 128, py + 48, 15);
      this._text("後 ▼", px + 88, py + 56, nextHov ? 14 : 15);

      // 標籤
      this._text("軍師名", px + 158, py + 24, 15);
      this._text("別　號", px + 254, py + 24, 15);

      // 規則或錯誤提示 (置於黑框下方雲紋區域)
      ctx.font = '13px "Noto Serif TC","PMingLiU",serif';
      const msg = errorMsg
        ? `！${errorMsg}`
        : "※ 限1至3個漢字（或6個英數），均為必填";
      ctx.fillStyle = errorMsg ? "#ff5533" : "#ecd088";
      const tw = ctx.measureText(msg).width;
      ctx.fillText(msg, px + ((w - tw) >> 1), py + 110);

      // 操作按鈕 (立體土金底色, 懸停反白)
      for (const b of actionBtns) {
        const hov = b.act === hoverAct;
        const x0 = b.x,
          y0 = b.y,
          x1 = b.x + b.w - 1,
          y1 = b.y + b.h - 1;
        ctx.fillStyle = hov ? "#ffffff" : "#c08020";
        ctx.fillRect(x0 + 1, y0 + 1, b.w - 2, b.h - 2);
        ctx.fillStyle = hov ? "#ffffff" : "#f0d090";
        ctx.fillRect(x0, y0, b.w - 1, 1);
        ctx.fillRect(x0, y0, 1, b.h);
        ctx.fillStyle = hov ? "#442211" : "#804020";
        ctx.fillRect(x1, y0, 1, b.h);
        ctx.fillRect(x0 + 1, y1, b.w - 1, 1);
        this._text(b.label, b.x + 16, b.y + 3, 0);
      }
    };

    return new Promise((resolve) => {
      let isDone = false;
      const cleanup = () => {
        if (isDone) return;
        isDone = true;
        window.removeEventListener("resize", syncPositions);
        overlay.remove();
        this._unbind();
      };

      const submit = () => {
        const nameVal = nameInput.value.trim();
        const haoVal = haoInput.value.trim();
        if (!nameVal) {
          errorMsg = "請輸入軍師名";
          draw();
          nameInput.focus();
          return;
        }
        if (!haoVal) {
          errorMsg = "請輸入別號";
          draw();
          haoInput.focus();
          return;
        }
        cleanup();
        resolve({
          name: nameVal,
          hao: haoVal,
          portrait: pt,
        });
      };

      const cancel = () => {
        cleanup();
        resolve(undefined);
      };

      const onKeyDown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      };
      nameInput.addEventListener("keydown", onKeyDown);
      haoInput.addEventListener("keydown", onKeyDown);

      const hit = (x, y) => {
        const nav = navBtns.find((b) =>
          this._in(x, y, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1),
        );
        if (nav) return nav.act;
        const act = actionBtns.find((b) =>
          this._in(x, y, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1),
        );
        if (act) return act.act;
        return null;
      };

      this._bind(
        (x, y, btn) => {
          if (btn === 2) return cancel(); // 右鍵取消
          const act = hit(x, y);
          if (act === "cancel") return cancel();
          if (act === "ok") return submit();
          if (act === "prev") {
            pt = (pt + 149) % 150;
            draw();
          } else if (act === "next") {
            pt = (pt + 1) % 150;
            draw();
          }
        },
        (x, y) => {
          const act = hit(x, y);
          if (act !== hoverAct) {
            hoverAct = act;
            draw();
          }
        },
      );

      draw();
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
  //        header      表头列标签数组 (可选, 默认占 24px 一行, 需配 colX)
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
      headerH = 24,
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
    const top = header ? headY + headerH + 2 : rowTop0;
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
        this._rect(px, py + headY, twRight, py + headY + headerH - 1, 0); // 表头黑带
      }
      if (header) {
        header.forEach((t, c) => {
          this._text(
            t,
            px + colX[c],
            py + headY + Math.floor((headerH - 16) / 2),
            15,
          );
        });
      }
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
        const targetScroll = Math.max(0, Math.min(rows.length - cap, ns));
        if (targetScroll !== scroll) {
          scroll = targetScroll;
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
      if (!this._engageSfxWarmup) {
        this._engageSfxWarmup = this.app.prepareEngageAudio?.() ?? true;
      }
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
