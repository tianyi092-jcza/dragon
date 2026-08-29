// 開場動畫 — D7OPEN.EXE 復刻 (OPEN_S1..S6.DAT + OPENPAL.BRG)
//   S1 = 640×350 EGA 全景(單張, 停留) → S2..S6 = 320×200×16色 多幀動畫
//   原版場景 handler 0x12e4..0x1338 (al=1..4) 以等待幀控制節奏; web 取 ~450ms/幀
import { loadImage } from "../core/assets.js";
import { clockPause, clockRestore } from "../core/modalclock.js";

const FRAME_MS = 450;
const S1_MS = 3200;

/** 構建播放序列: [{src, ms}...] */
function buildSequence() {
  const seq = [{ src: "grf/open_s1.png", ms: S1_MS }];
  // 幀數: S2/S3/S4=12 S5=9 S6=4 (parse_open.py 導出)
  const FRAMES = { 2: 12, 3: 12, 4: 12, 5: 9, 6: 4 };
  for (let s = 2; s <= 6; s++) {
    const n = FRAMES[s];
    for (let f = 0; f < n; f++) {
      seq.push({ src: `grf/open_s${s}_f${f}.png`, ms: FRAME_MS });
    }
  }
  return seq;
}

export class OpenView {
  /**
   * @param {HTMLElement} root #openv 容器 (index.html 預置)
   * @param {object} app
   */
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.active = false;
    this._timer = null;
    this._clockPauseState = null;
    this.img = root.querySelector("#opimg");
    root.addEventListener("click", () => this.finish());
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.finish();
    });
  }

  /** 播放開場序列 (模態: 暫停時鐘)。點擊/Esc 跳過。 */
  async play() {
    if (this.active) return;
    this.active = true;
    this.root.style.display = "flex";
    this.root.tabIndex = -1;
    this.root.focus();
    clockPause(this.app, this);
    const seq = buildSequence();
    let i = 0;
    while (i < seq.length && this.active) {
      const step = seq[i++];
      try {
        const im = await loadImage(step.src);
        this.img.src = im.src;
        this.img.style.opacity = "1";
      } catch {
        break; // 資產缺失即止
      }
      await new Promise((r) => {
        this._timer = setTimeout(r, step.ms);
        this._wake = r; // 跳过时立即唤醒
      });
    }
    this.finish();
  }

  finish() {
    clearTimeout(this._timer);
    const wake = this._wake;
    this._timer = null;
    this._wake = null;
    this.active = false;
    wake?.(); // 唤醒挂起的播放协程(跳过场景)
    this.root.style.display = "none";
    this.img.removeAttribute("src");
    clockRestore(this.app, this);
  }
}
