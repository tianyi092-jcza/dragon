// 天下一統弹窗（Web 产品决定，非原版机制）：统一门 TALK75＋君主个性行关闭后，
// 在地图中央以金框＋云纹平铺（与 gamebar._drawWindow 默认 cloud 同源资产
// grf/ui/cloud.png）显示统一日期与「天下一統」；地图或弹窗任意点击进入胜利过场。
import { VICTORY_IMG } from "./endview.js";
import { clockPause, clockRestore } from "../core/modalclock.js";

/** 统一日期文案（公元／公元前均显前缀：可创作公元前游戏，须与公元区分） */
export function unificationDateText(clock) {
	const y = clock?.year, m = clock?.month, d = clock?.day;
	if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d))
		throw new RangeError("native unification modal needs clock date");
	const era = clock.era === "bc" ? "公元前" : "公元";
	return `${era}${y}年${m}月${d}日`;
}

/**
 * 显示统一弹窗（模态：暂停时钟，任意点击推进过场）。
 * @returns {{active: boolean}} modal 句柄（挂 app.victoryModal 供 aiTick 保持 pending）
 */
export function showVictoryModal(app, { dateText, onAdvance }) {
	if (typeof document === "undefined")
		throw new RangeError("native unification modal needs DOM");
	if (typeof dateText !== "string" || !dateText)
		throw new RangeError("native unification modal needs dateText");
	if (typeof onAdvance !== "function")
		throw new RangeError("native unification modal needs onAdvance");
	if (app.victoryModal?.active)
		throw new RangeError("native unification modal already pending");
	const catcher = document.createElement("div");
	catcher.id = "unimodal";
	catcher.style.position = "fixed";
	catcher.style.inset = "0";
	catcher.style.zIndex = "30";
	catcher.style.display = "flex";
	catcher.style.alignItems = "center";
	catcher.style.justifyContent = "center";
	catcher.style.cursor = "pointer";
	const box = document.createElement("div");
	box.style.background = "url(grf/ui/cloud.png) repeat";
	box.style.border = "3px double #c9a227";
	box.style.padding = "18px 56px";
	box.style.textAlign = "center";
	box.style.pointerEvents = "none";
	const dateEl = document.createElement("div");
	dateEl.id = "unimodate";
	dateEl.textContent = dateText;
	dateEl.style.color = "#6b5510";
	dateEl.style.fontSize = "14px";
	dateEl.style.letterSpacing = "4px";
	dateEl.style.marginBottom = "10px";
	const titleEl = document.createElement("div");
	titleEl.id = "unimotitle";
	titleEl.textContent = "天下一統";
	titleEl.style.color = "#7a5c00";
	titleEl.style.fontSize = "26px";
	titleEl.style.fontWeight = "700";
	titleEl.style.letterSpacing = "8px";
	titleEl.style.textIndent = "8px";
	box.appendChild(dateEl);
	box.appendChild(titleEl);
	catcher.appendChild(box);
	document.body.appendChild(catcher);
	const holder = {};
	const modal = { active: true, dateText, _el: catcher, _holder: holder };
	clockPause(app, holder);
	catcher.addEventListener("click", () => {
		onAdvance();
	});
	app.victoryModal = modal;
	return modal;
}

/** 关闭弹窗（如仍在）并进入胜利过场（node 可测的纯接线，不碰 DOM 构造） */
export function advanceToVictoryCutscene(app) {
	const modal = app.victoryModal;
	if (modal?.active) {
		modal.active = false;
		try {
			clockRestore(app, modal._holder);
		} catch {
			/* 无时钟状态也继续进过场 */
		}
		modal._el?.remove?.();
		if (app.victoryModal === modal) app.victoryModal = null;
	}
	if (typeof app.endView?.show !== "function")
		throw new RangeError("native victory cutscene has no UI");
	app.endView.show({ img: VICTORY_IMG });
}
