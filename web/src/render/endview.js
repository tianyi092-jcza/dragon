// 结束动画视图 — 复刻 D7OVER.EXE / D7END.EXE:
//   GAMEOVER.DAT(军师烛下图) / END_S1..12.DAT(每剧本通关画) 640×400 16色
//   原版流程: 载图→调色板17步淡入(0xEF/0x1C1 每步等待)→等待点击→淡出退出
// 资产: tools/parse_end.py 批量解码 (成对触发RLE 0x58F + VGA planar) → grf/*.png
import { loadImage } from "../core/assets.js";
import { clockPause, clockRestore } from "../core/modalclock.js";

const FADE_MS = 2000; // 淡入时长 (对应原版17步调色板渐变)

export class EndView {
	/**
	 * @param {HTMLElement} root #endv 容器 (index.html 预置)
	 * @param {object} app
	 */
	constructor(root, app) {
		this.root = root;
		this.app = app;
		this.active = false;
		this._clockPauseState = null;
		this._sequenceTimer = null;
		this.img = root.querySelector("#edimg");
		this.cap = root.querySelector("#edcap");
		root.addEventListener("click", () => this.finish());
	}

	/**
	 * 显示结束画面 (模态: 暂停时钟)
	 * @param {object} o {img: 资产路径, caption: 说明文字}
	 */
	async show(o) {
		if (this.active) return;
		this.active = true;
		if (o.img === "grf/gameover.png") this.app.score?.gameOver();
		this.root.style.display = "flex";
		this.cap.textContent = o.caption ?? "";
		this.img.style.opacity = "0";
		clockPause(this.app, this);
		const sequence =
			Array.isArray(o.sequence) && o.sequence.length ? o.sequence : null;
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

	/** 点击收尾: 淡出→回标题(重载) — 对应原版淡出后 int 0x4C 退出 */
	finish() {
		if (!this.active) return;
		this.active = false;
		if (this._sequenceTimer != null) {
			clearInterval(this._sequenceTimer);
			this._sequenceTimer = null;
		}
		this.root.style.display = "none";
		clockRestore(this.app, this);
		this.app.music?.select(null);
		location.reload(); // 回标题 = 重新载入
	}
}
