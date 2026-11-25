// 结束动画视图 — 复刻 D7OVER.EXE / D7END.EXE:
//   GAMEOVER.DAT(军师烛下图) / END_S1..12.DAT(每剧本通关画) 640×400 16色
//   原版流程: 载图→调色板17步淡入(0xEF/0x1C1 每步等待)→等待点击→淡出退出
// 资产: tools/parse_end.py 批量解码 (成对触发RLE 0x58F + VGA planar) → grf/*.png
// 失败过场（Web 产品决定，非原版机制）：grf/defeat.png 水墨底 3s 淡入 →
//   「出師未捷身先死，常使英雄淚滿襟」逐字渐显 → 1s 后「重新再來」按钮；
//   仅按钮可离开（回游戏选择页），背景点击无效果。
// 胜利过场（Web 产品决定非原版机制）：统一门 TALK75＋君主行→「天下一統」
//   弹窗→grf/victory.png 水墨底 3s 淡入→十行评语逐字渐显→1s 后小一号「返回」按钮。
// 背景图布局（用户指定，两过场统一）：等比完整居中、不拉伸不变形、不平铺；
//   高分辨率按 cover 对应放大填满无空白，低于 1920*1080 不缩小（scale≥1）；
//   容器裁剪，绝不出浏览器滚动条。
import { loadImage } from "../core/assets.js";
import { clockPause, clockRestore } from "../core/modalclock.js";

const FADE_MS = 2000; // 淡入时长 (对应原版17步调色板渐变)
const DEFEAT_IMG = "grf/defeat.png";
export const VICTORY_IMG = "grf/victory.png";
const STAGE_FADE_MS = 3000; // 过场背景淡入时长（用户指定）
const STAGE_CHAR_MS = 150; // 逐字渐显间隔
const STAGE_LINE_PAUSE_MS = 400; // 两句之间停顿
const STAGE_BUTTON_DELAY_MS = 1000; // 文成后按钮延迟
const DEFEAT_LINES = ["出師未捷身先死", "常使英雄淚滿襟"];
const VICTORY_LINES = [
	"以英雄一人之力，",
	"使天下歸於一統，",
	"而長期不毛之亂世到此終於戰亂平息、和平到來。",
	"有一個人，",
	"自願做這位英雄的影子，",
	"成為輔佐他執行政務軍事的人物。",
	"後代的歷史，",
	"對此人有這樣的評語：",
	"引導戰亂之世歸於平靜的這个人物，",
	"是「天下第一軍師」",
];
const DEFEAT_BUTTON = "重新再來";
const VICTORY_BUTTON = "返回";

export class EndView {
	/**
	 * @param {HTMLElement} root #endv 容器 (index.html 预置)
	 * @param {object} app
	 */
	constructor(root, app) {
		this.root = root;
		this.app = app;
		this.active = false;
		this._mode = null;
		this._clockPauseState = null;
		this._sequenceTimer = null;
		this._stageTimers = [];
		this._poemSpans = [];
		this._poemTotalMs = 0;
		this.img = root.querySelector("#edimg");
		this.cap = root.querySelector("#edcap");
		root.addEventListener("click", () => this.finish());
		// 图片载入完成后按 cover≥1x 适配（两过场统一规则）
		this.img.addEventListener("load", () => {
			if (this.active && this._mode !== "legacy") this._fitStageImage();
		});
		window.addEventListener("resize", () => {
			if (this.active && this._mode !== "legacy") this._fitStageImage();
		});
		// 过场覆盖层：诗文＋按钮（平时隐藏，不改 index.html 结构）
		const overlay = document.createElement("div");
		overlay.id = "edoverlay";
		overlay.style.position = "absolute";
		overlay.style.inset = "0";
		overlay.style.display = "none";
		overlay.style.flexDirection = "column";
		overlay.style.alignItems = "center";
		overlay.style.justifyContent = "center";
		overlay.style.pointerEvents = "none";
		overlay.style.overflow = "hidden";
		const poem = document.createElement("div");
		poem.id = "edpoem";
		poem.style.textAlign = "center";
		poem.style.color = "#3a352c";
		poem.style.fontSize = "clamp(14px, 2.6vw, 20px)";
		poem.style.fontWeight = "700";
		poem.style.letterSpacing = "0.3em";
		poem.style.lineHeight = "2.2";
		poem.style.margin = "0 6vw";
		this._poemEl = poem;
		const retry = document.createElement("button");
		retry.id = "edretry";
		retry.type = "button";
		retry.style.pointerEvents = "auto";
		retry.style.color = "#333";
		retry.style.background = "#fff";
		retry.style.border = "1px solid #d8d2c2";
		retry.style.borderRadius = "6px";
		retry.style.cursor = "pointer";
		retry.style.opacity = "0";
		retry.style.visibility = "hidden";
		retry.style.transition = "opacity 600ms ease-in";
		retry.addEventListener("click", (ev) => {
			ev.stopPropagation();
			this.exitStaged();
		});
		this._retryBtn = retry;
		overlay.appendChild(poem);
		overlay.appendChild(retry);
		root.appendChild(overlay);
		this._overlay = overlay;
	}

	/**
	 * 显示结束画面 (模态: 暂停时钟)
	 * @param {object} o {img: 资产路径, caption: 说明文字}
	 */
	async show(o) {
		if (this.active) return;
		this.active = true;
		const staged = o.img === DEFEAT_IMG || o.img === VICTORY_IMG;
		this._mode = o.img === DEFEAT_IMG ? "defeat" : staged ? "victory" : "legacy";
		if (o.img === "grf/gameover.png" || o.img === DEFEAT_IMG)
			this.app.score?.gameOver();
		this.root.style.display = "flex";
		if (staged) {
			this._showStaged(o.img);
			return;
		}
		this._restoreLegacyChrome();
		this.cap.textContent = o.caption ?? "";
		this.img.style.opacity = "0";
		clockPause(this.app, this);
		const sequence =
			Array.isArray(o.sequence) && o.sequence.length ? sequence : null;
		try {
			const im = await loadImage(sequence ? sequence[0] : o.img);
			this.img.src = im.src;
		} catch {
			/* 图缺失也显示文字 */
		}
		if (sequence && sequence.length > 1) {
			// D7END.EXE（实锤：硬编码 END_S1..12 文件名表动态循环播放）：
			// 预载全序列后循环淡切，点击仍由 finish() 收尾。
			const sources = [this.img.src];
			for (const path of sequence.slice(1)) {
				try {
					const image = await loadImage(path);
					sources.push(image.src);
				} catch {
					/* 缺图跳过 */
				}
			}
			if (sources.length > 1) {
				let index = 0;
				this._sequenceTimer = setInterval(() => {
					if (!this.active) return;
					index = (index + 1) % sources.length;
					this.img.style.transition = "opacity 400ms ease-in-out";
					this.img.style.opacity = "0";
					setTimeout(() => {
						if (!this.active) return;
						this.img.src = sources[index];
						this.img.style.opacity = "1";
					}, 400);
				}, 2600);
			}
		}
		// 双 rAF 确保 transition 生效
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				this.img.style.transition = `opacity ${FADE_MS}ms ease-in`;
				this.img.style.opacity = "1";
			}),
		);
	}

	/** 两过场统一布局：cover 等比＋不缩小（scale≥1），居中裁剪，无滚动条 */
	_fitStageImage() {
		const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
		if (!iw || !ih) return false;
		const scale = Math.max(1, window.innerWidth / iw, window.innerHeight / ih);
		this.img.style.width = `${Math.round(iw * scale)}px`;
		this.img.style.height = `${Math.round(ih * scale)}px`;
		this.img.style.maxWidth = "none";
		this.img.style.maxHeight = "none";
		return true;
	}

	/** 过场诗文按行逐字构段（逐字计时供 _playStagedText 用） */
	_buildPoem(lines) {
		while (this._poemEl.firstChild)
			this._poemEl.removeChild(this._poemEl.firstChild);
		this._poemEl.setAttribute("aria-label", lines.join(""));
		this._poemSpans = [];
		let delay = 0;
		for (const line of lines) {
			const lineEl = document.createElement("div");
			for (const ch of line) {
				const s = document.createElement("span");
				s.textContent = ch;
				s.style.opacity = "0";
				s.style.transition = `opacity ${STAGE_CHAR_MS}ms ease-in`;
				lineEl.appendChild(s);
				this._poemSpans.push({ el: s, delay });
				delay += STAGE_CHAR_MS;
			}
			this._poemEl.appendChild(lineEl);
			delay += STAGE_LINE_PAUSE_MS;
		}
		this._poemTotalMs = delay;
	}

	/** 失败／胜利过场：水墨底 3s 淡入，完成后起逐字流 */
	_showStaged(img) {
		const victory = img === VICTORY_IMG;
		this.root.style.background = "#f2efe6";
		this.root.style.cursor = "default";
		this.root.style.overflow = "hidden";
		this.img.classList.remove("pixelated");
		this.img.style.imageRendering = "auto";
		this.img.style.opacity = "0";
		this.img.style.transition = "";
		this.img.style.width = "";
		this.img.style.height = "";
		this.img.style.maxWidth = "none";
		this.img.style.maxHeight = "none";
		this.cap.style.display = "none";
		this._buildPoem(victory ? VICTORY_LINES : DEFEAT_LINES);
		const btn = this._retryBtn;
		btn.textContent = victory ? VICTORY_BUTTON : DEFEAT_BUTTON;
		if (victory) {
			btn.style.marginTop = "28px";
			btn.style.padding = "8px 30px";
			btn.style.fontSize = "14px";
			btn.style.letterSpacing = "8px";
			btn.style.textIndent = "8px";
		} else {
			btn.style.marginTop = "40px";
			btn.style.padding = "10px 44px";
			btn.style.fontSize = "16px";
			btn.style.letterSpacing = "10px";
			btn.style.textIndent = "10px";
		}
		btn.style.opacity = "0";
		btn.style.visibility = "hidden";
		this._overlay.style.display = "flex";
		clockPause(this.app, this);
		let started = false;
		const begin = () => {
			if (started || !this.active || this._mode === "legacy") return;
			started = true;
			this._fitStageImage();
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (!this.active || this._mode === "legacy") return;
					this.img.style.transition = `opacity ${STAGE_FADE_MS}ms ease-in`;
					this.img.style.opacity = "1";
				}),
			);
			this._later(STAGE_FADE_MS, () => this._playStagedText());
		};
		try {
			loadImage(img).then(
				(im) => {
					if (!this.active || this._mode === "legacy") return;
					this.img.src = im.src;
					this._fitStageImage();
					begin();
				},
				() => begin(),
			);
		} catch {
			begin();
		}
	}

	/** 诗文逐字渐显；全篇完成后 1s 显示按钮 */
	_playStagedText() {
		for (const s of this._poemSpans) {
			const el = s.el;
			this._later(s.delay, () => {
				el.style.opacity = "1";
			});
		}
		this._later(this._poemTotalMs + STAGE_BUTTON_DELAY_MS, () => {
			this._retryBtn.style.visibility = "visible";
			this._retryBtn.style.opacity = "1";
		});
	}

	/** 过场计时器：仅在 defeat/victory 模式且仍挂起时执行 */
	_later(ms, fn) {
		const id = setTimeout(() => {
			if (!this.active || this._mode === "legacy") return;
			fn();
		}, ms);
		this._stageTimers.push(id);
	}

	/** 「重新再來」／「返回」：回游戏选择页（不整页 reload） */
	exitStaged() {
		if (!this.active || this._mode === "legacy") return;
		this._hideEndview();
		try {
			const ret = this.app.returnToTitle?.(undefined, { endScreen: true });
			if (ret && typeof ret.catch === "function")
				ret.catch(() => location.reload());
		} catch {
			location.reload();
		}
	}

	/** legacy 胜利／旧单图路径收尾：点击关闭→回标题(重载) */
	finish() {
		// 过场仅按钮可离开，背景点击无效果（用户指定）。
		if (!this.active || this._mode !== "legacy") return;
		this._hideEndview();
		location.reload(); // 回标题 = 重新载入
	}

	/** 通用隐藏＋时钟恢复＋样式复位（供新局复用同一 EndView） */
	_hideEndview() {
		this.active = false;
		this._mode = null;
		if (this._sequenceTimer != null) {
			clearInterval(this._sequenceTimer);
			this._sequenceTimer = null;
		}
		for (const id of this._stageTimers) clearTimeout(id);
		this._stageTimers = [];
		this._restoreLegacyChrome();
		this.root.style.display = "none";
		clockRestore(this.app, this);
		this.app.music?.select(null);
	}

	/** 复位为黑底金字 legacy chrome，下一次 show() 干净起步 */
	_restoreLegacyChrome() {
		this.root.style.background = "#000";
		this.root.style.cursor = "pointer";
		this.root.style.overflow = "";
		this.img.classList.add("pixelated");
		this.img.style.imageRendering = "pixelated";
		this.img.style.transition = "";
		this.img.style.opacity = "";
		this.img.style.width = "";
		this.img.style.height = "";
		this.img.style.maxWidth = "96vw";
		this.img.style.maxHeight = "88vh";
		this.cap.style.display = "";
		if (this._overlay) this._overlay.style.display = "none";
	}
}
