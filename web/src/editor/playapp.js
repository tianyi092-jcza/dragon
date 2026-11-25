// b2 发布玩入口（用户裁决 2026-10-10）：同源发布游戏选择→试玩同款运行时→持久存档（按游戏隔离）。
// 无 API（纯静态）时仅内置一项；published 条目未装配前不在列表中（发布即已编译），不静默回退。
import { createTrialEnvironment } from "../content/authoring/trialruntime.js";

const status = document.querySelector("#play-status");
const panel = document.createElement("div");
panel.style.cssText =
	"position:fixed;left:20px;top:20px;z-index:101;color:white;background:#141414;padding:16px;max-width:420px";
// user 2026-11-26：开局三下拉行高加大（原生控件无真 4px 间隙，用字号＋内边距逼近）。
const listStyle = document.createElement("style");
listStyle.textContent =
	"#play-game,#play-chapter,#play-faction{font-size:18px;padding:8px;margin:4px 0}" +
	"#play-game option,#play-chapter option,#play-faction option{padding:4px 8px;font-size:18px}";
document.head.append(listStyle);
document.body.append(panel);
function fail(message) {
	status.hidden = false;
	status.textContent = message;
	throw new Error(message);
}
try {
	const args = new URLSearchParams(location.search);
	let entries;
	try {
		const response = await fetch("/api/published-games", { cache: "no-store" });
		if (!response.ok) throw new Error("list unavailable");
		entries = (await response.json())?.games ?? null;
		if (!Array.isArray(entries)) throw new Error("bad list");
	} catch {
		entries = [
			{ gameId: "wolong-builtin", name: "臥龍傳·制霸天下", builtin: true },
		];
	}
	const gameLabel = document.createElement("p");
	gameLabel.textContent = "選擇遊戲（已發布；未發布前僅內置一項）";
	const gameSelect = document.createElement("select");
	gameSelect.id = "play-game";
	for (const entry of entries) {
		const option = document.createElement("option");
		option.value = entry.gameId;
		const baseName = entry.name ?? entry.gameId;
		// 显示发布版本号以便确认是否载入新包；内置项无 revision 保持原名。
		option.textContent = entry.revision ? `${baseName}（${entry.revision}版）` : baseName;
		gameSelect.append(option);
	}
	const picked = args.get("game");
	if (picked && entries.some((entry) => entry.gameId === picked))
		gameSelect.value = picked;
	const chapterLabel = document.createElement("p");
	chapterLabel.textContent = "選擇章節";
	const chapterSelect = document.createElement("select");
	chapterSelect.id = "play-chapter";
	const factionLabel = document.createElement("p");
	factionLabel.textContent = "選擇勢力（原軍師）";
	const factionSelect = document.createElement("select");
	factionSelect.id = "play-faction";
	const button = document.createElement("button");
	button.id = "start-play";
	button.textContent = "開始遊戲（進度保存於本機，按遊戲隔離）";
	panel.append(
		gameLabel,
		gameSelect,
		chapterLabel,
		chapterSelect,
		factionLabel,
		factionSelect,
		button,
	);
	async function loadChapters() {
		chapterSelect.replaceChildren();
		factionSelect.replaceChildren();
		const entry = entries.find((e) => e.gameId === gameSelect.value);
		if (!entry || entry.builtin) return;
		let pin;
		try {
			const response = await fetch("/api/published-games", {
				cache: "no-store",
			});
			pin =
				((await response.json())?.games ?? []).find(
					(e) => e.gameId === entry.gameId,
				) ?? null;
		} catch {
			pin = null;
		}
		if (!pin || !Array.isArray(pin.chapters)) fail("發布記錄缺失章節表");
		for (const chapterId of pin.chapters) {
			const option = document.createElement("option");
			option.value = chapterId;
			option.textContent = chapterId.includes("#")
				? chapterId.split("#")[1]
				: chapterId;
			chapterSelect.append(option);
		}
		await loadFactions();
	}
	async function loadFactions() {
		factionSelect.replaceChildren();
		const entry = entries.find((e) => e.gameId === gameSelect.value);
		if (!entry || entry.builtin || !chapterSelect.value) return;
		const response = await fetch(
			`/api/trial-pack?game=${encodeURIComponent(entry.gameId)}&revision=${encodeURIComponent(entry.revision)}&chapter=${encodeURIComponent(chapterSelect.value)}`,
			{ cache: "no-store" },
		);
		if (!response.ok)
			fail(`快照載入失敗（發布可能已撤銷）：${response.status}`);
		const pack = await response.json();
		if (
			pack.manifest?.identity?.gameId !== entry.gameId ||
			pack.manifest?.identity?.draftRevision !== entry.revision ||
			pack.manifest?.identity?.sourceDigest !== entry.sourceDigest
		)
			fail("發布快照身份不符（可能已重發布）");
		chapterSelect.selectedOptions[0].textContent = pack.chapter.name;
		window.__playPack = pack;
		for (const f of pack.chapter.factions.filter((f) => f.monarch && f.monarch.trim())) {
			const option = document.createElement("option");
			option.value = String(f.idx);
			option.textContent = f.monarch ?? f.name;
			factionSelect.append(option);
		}
	}
	gameSelect.onchange = loadChapters;
	chapterSelect.onchange = loadFactions;
	await loadChapters();
	status.textContent = "請選擇遊戲、章節與勢力，再開始遊戲。";
	button.onclick = async () => {
		button.disabled = true;
		try {
			const entry = entries.find((e) => e.gameId === gameSelect.value);
			if (!entry) fail("未選擇遊戲");
			if (entry.builtin) {
				const { startApp } = await import("../main.js");
				panel.remove();
				await startApp(null);
				return;
			}
			const pack = window.__playPack;
			if (!pack || pack.manifest?.identity?.gameId !== entry.gameId)
				fail("請先選擇章節");
			const trial = createTrialEnvironment(pack, {
				fullApp: true,
				playerFaction: Number(factionSelect.value),
				persistent: true,
			});
			const { startApp } = await import("../main.js");
			trial.openSavedChapter = async (reference, playerFaction) => {
				if (reference?.packId !== entry.gameId || reference.revision !== entry.sourceDigest ||
					!pack.manifest.chapters.includes(reference.chapterId)) fail("存檔不屬於此發布版本");
				const query = new URLSearchParams({ game: entry.gameId, revision: entry.revision, chapter: reference.chapterId });
				const response = await fetch(`/api/trial-pack?${query}`, { cache: "no-store" });
				if (!response.ok) fail("存檔章節載入失敗");
				const target = await response.json();
				const id = target.manifest?.identity;
				if (target.chapterId !== reference.chapterId || id?.gameId !== entry.gameId ||
					id.draftRevision !== entry.revision || id.sourceDigest !== entry.sourceDigest) fail("存檔章節發布身份不符");
				return createTrialEnvironment(target, { fullApp: true, playerFaction, persistent: true });
			};
			const { StartMenu } = await import('../ui/startmenu.js');
			panel.hidden = status.hidden = true;
			const menu = new StartMenu({data:trial.content.data, world:trial.world}, {advisorOnly:true});
			const advisor = await menu.chooseDirectAdvisor(trial.player);
			if (advisor === undefined) {
				panel.hidden = status.hidden = button.disabled = false;
				return;
			}
			await startApp(null, { trial, advisor });
			panel.remove();
			status.textContent = "";
			status.hidden = true;
		} catch (error) {
			panel.hidden = status.hidden = false;
			status.textContent = `無法開始遊戲：${error.message}`;
			button.disabled = false;
		}
	};
} catch (error) {
	status.textContent = `無法載入遊戲列表：${error.message}`;
}
