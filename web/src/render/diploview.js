// 外交觐见视图 — 复刻 0x3830 通用觐见场景:
//   IVENTGRF 双帧背景(a/b交替, 原版事件图动画) + 君主头像(0x3C99) +
//   台词框 + 选项菜单(0x3B7E) → 效果(0x3BA9) → 信赖增减(0x3D91/0x3DC9)
// 背景按动作映射: 宣戰=ivent_0 / 停戰=ivent_1 / 請援=ivent_2 (cs:[0x625B]跳转表)
import { loadImage } from "../core/assets.js";
import { clockPause, clockRestore } from "../core/modalclock.js";
import { buildAudience } from "../game/audience.js";

const FRAME_MS = 480; // a/b 帧切换周期 (原版约0.5s)

export class DiploView {
	/**
	 * @param {HTMLElement} root #diplov 容器 (index.html 预置)
	 * @param {object} app
	 */
	constructor(root, app) {
		this.root = root;
		this.app = app;
		this.active = false;
		this._timer = null;
		this._prevSpeed = null;
		this.bg = root.querySelector("#dpbg");
		this.face = root.querySelector("#dpface");
		this.text = root.querySelector("#dptext");
		this.opts = root.querySelector("#dpopts");
	}

	/**
	 * 打开觐见场景 (模态: 暂停时钟)
	 * @param {string} actionId war|ceasefire|aid
	 * @param {number} targetIdx 目标势力
	 */
	async open(actionId, targetIdx) {
		const scene = buildAudience(
			this.app,
			actionId,
			targetIdx,
			this.app.talkTable,
		);
		if (!scene) return;
		this.scene = scene;
		this.app.diploView = this;
		this.active = true;
		this.root.style.display = "flex";
		// 暂停时钟 (同 battleview: 战略速度分离)
		clockPause(this.app, this);
		try {
			const [a, b] = await Promise.all([
				loadImage(`grf/ivent_${scene.ivent}_a.png`),
				loadImage(`grf/ivent_${scene.ivent}_b.png`),
			]);
			this._frames = [a, b];
			this.bg.src = a.src;
			clearInterval(this._timer);
			let fi = 0;
			this._timer = setInterval(() => {
				fi ^= 1;
				this.bg.src = this._frames[fi].src; // 双帧交替
			}, FRAME_MS);
		} catch {
			this.bg.removeAttribute("src"); // 图缺失也不阻塞对话
		}
		this.face.src = `kao/${scene.monarch?.portrait ?? 0}.png`;
		this.showLines(scene.lines);
		this.buildOptions(scene.options);
	}

	showLines(lines) {
		this.text.replaceChildren(...lines.map((l, i) => `${i ? " " : ""}${l}`));
	}

	buildOptions(options) {
		this.opts.replaceChildren(
			...options.map((o) => {
				const b = document.createElement("button");
				b.textContent = o.label;
				b.onclick = () => this.choose(o);
				return b;
			}),
		);
	}

	/** 选项处理 (对应 0x3BA9 选项效果): apply→结果台词+信赖±→收尾 */
	choose(opt) {
		const r = opt.apply?.() ?? null;
		if (!r) return this.finish(null); // 退去: 无效果
		// 音效反馈: 采纳=0xCDE一声 / 拒绝失败=0xCE7两声
		if (r.trustDelta > 0) this.app.speaker?.clickSfx?.();
		else this.app.speaker?.warnSfx?.();
		const sc = this.app.scenario;
		if (r.trustDelta)
			sc.trust = Math.max(0, Math.min(255, sc.trust + r.trustDelta));
		this.app.checkTrustGameOver?.(); // 任何信赖扣减归零都立即结束
		this.showLines([r.result]);
		this.opts.replaceChildren();
		const b = document.createElement("button");
		b.textContent = "退去";
		b.onclick = () => this.finish(r);
		this.opts.append(b);
		this.app.hud.refreshTrust(); // 信赖红线即时刷新
	}

	finish(result) {
		clearInterval(this._timer);
		this._timer = null;
		this.active = false;
		this.root.style.display = "none";
		clockRestore(this.app, this);
		if (result) {
			const sign = result.trustDelta > 0 ? "+" : "";
			this.app.hud.flashEvent(
				result.result +
					(result.trustDelta ? `（信賴${sign}${result.trustDelta}）` : ""),
			);
		}
	}
}
