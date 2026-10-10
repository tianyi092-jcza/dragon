// b2 play shell browser smoke: publish a full copy, drive /play chooser (game -> chapter ->
// faction -> start), assert boot status and per-game save isolation (namespaced IDB database).
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEditorServer } from "./editor_server.mjs";

const checks = [];
const check = (name, actual, expected) => {
	assert.equal(actual, expected, `${name}: ${actual}`);
	checks.push(name);
};
const store = mkdtempSync(join(tmpdir(), "play-shell-"));
const server = await startEditorServer(0, store);
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (path, body) => {
	const r = await fetch(`${base}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	assert.equal(r.status, 200, `${path} ${r.status}`);
	return r.json();
};
try {
	await post("/api/copy", {
		gameId: "play-smoke-1",
		ownerId: "admin-1",
		kind: "full",
	});
	const manifest = await post("/api/compile", { gameId: "play-smoke-1" });
	const pin = await post("/api/publish", {
		gameId: "play-smoke-1",
		name: "冒煙發布",
	});
	check("pin-revision", pin.revision, manifest.identity.draftRevision);
	const listed = await (await fetch(`${base}/api/published-games`)).json();
	check("list-two", listed.games.length, 2);
	check("builtin-first", listed.games[0].gameId, "wolong-builtin");
	const shell = await (await fetch(`${base}/play`)).text();
	check("shell-boot", shell.includes("/src/editor/playapp.js"), true);
	const { chromium } = createRequire(import.meta.url)(
		process.env.PLAYWRIGHT_MODULE ||
			"C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
	);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		page.on("pageerror", (error) => {
			throw new Error(`page error: ${error.message}`);
		});
		await page.goto(`${base}/play`, { waitUntil: "load" });
		await page.waitForFunction(
			() => document.querySelectorAll("#play-game option").length === 2,
			null,
			{ timeout: 30000 },
		);
		check("chooser-two-games", true, true);
		await page.selectOption("#play-game", "play-smoke-1");
		await page.waitForFunction(
			() => document.querySelectorAll("#play-chapter option").length > 0,
			null,
			{ timeout: 30000 },
		);
		const chapter = await page.$eval("#play-chapter option", (el) => el.value);
		await page.selectOption("#play-chapter", chapter);
		await page.waitForFunction(
			() => document.querySelectorAll("#play-faction option").length > 0,
			null,
			{ timeout: 60000 },
		);
		const faction = await page.$eval("#play-faction option", (el) => el.value);
		await page.selectOption("#play-faction", faction);
		await page.click("#start-play");
		await page.waitForFunction(
			() =>
				(document.querySelector("#play-status")?.textContent ?? "").includes(
					"進行中",
				),
			null,
			{ timeout: 300000 },
		);
		check("boot-status", true, true);
		const dbNames = await page.evaluate(async () =>
			(await indexedDB.databases()).map((d) => d.name),
		);
		check(
			"save-isolated",
			dbNames.some((n) => typeof n === "string" && n.includes("play-smoke-1")),
			true,
		);
	} finally {
		await browser.close();
	}
} finally {
	server.close();
}
process.stdout.write(`play shell browser smoke PASS ${checks.length} checks\n`);
