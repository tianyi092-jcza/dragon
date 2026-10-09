// E-05-Q69-CLOSURE-8a: mechanical runtime-load coverage proof over the fixed available library.
// Per load point: source anchor (drift guard) -> concrete path domain -> case-sensitive membership
// in FIXED_TRIAL_ASSET_PATHS. Data-dependent domains (kao portrait / kyo city view) are evaluated
// against the pinned builtin 20-chapter source only; draft generality is the 8b start-gate, not 8a.
// No DOS, network, profile, draft or product writes; one new owned receipt.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { FIXED_TRIAL_ASSET_PATHS } from "../web/src/editor/trialassetpaths.js";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)),
	round = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const sha = (b) => createHash("sha256").update(b).digest("hex"),
	inputHashes = {};
function read(p) {
	assert.ok(!/save\.dat/i.test(p));
	const b = readFileSync(join(root, p));
	if (!inputHashes[p]) inputHashes[p] = sha(b);
	return b;
}
const text = (p) => read(p).toString("utf8");
function parse(p) {
	try {
		return JSON.parse(text(p));
	} catch (cause) {
		throw new TypeError(`invalid fixed coverage JSON: ${p}`, { cause });
	}
}
const library = new Set(FIXED_TRIAL_ASSET_PATHS);
assert.equal(library.size, 398);

const sites = [], produced = new Map(); // path -> site names
function claim(siteName, path) {
	assert.ok(library.has(path), `${siteName}: ${path} not in fixed library (case-sensitive)`);
	if (!produced.has(path)) produced.set(path, []);
	produced.get(path).push(siteName);
}
function site(name, file, anchors, produce) {
	const body = text(file);
	for (const a of anchors)
		assert.ok(body.includes(a), `${name}: anchor drift in ${file}: ${a.slice(0, 60)}`);
	const before = produced.size;
	produce();
	sites.push({ name, file, paths: produced.size - before });
}

// ── 固定共享域（章无关） ────────────────────────────────────────────
site("battle-eager-five", "web/src/main.js",
	['loadJSON("battle_maps.json")', 'loadJSON("battle_navigation.json")', 'loadJSON("battle_rules.json")', 'loadJSON("battle_scripts.json")', 'loadJSON("talk.json")'],
	() => { for (const p of ["battle_maps.json", "battle_navigation.json", "battle_rules.json", "battle_scripts.json", "talk.json"]) claim("battle-eager-five", p); });

site("talk-lazy", "web/src/game/talk.js", ['loadJSON("talk.json")'],
	() => claim("talk-lazy", "talk.json"));

site("battle-terrain-layout", "web/src/render/battleview.js", ["loadImage(`grf/battle_terrain_${battle.layout}.png`)"],
	() => {
		const maps = parse("web/battle_maps.json");
		assert.equal(maps.directory.length, 214);
		for (const d of maps.directory) claim("battle-terrain-layout", `grf/battle_terrain_${d.layout}.png`);
	});

site("battle-fixed-four", "web/src/render/battleview.js",
	['loadImage("grf/battle_units.png")', 'loadJSON("battle_talk.json")', 'loadBytes("battle_display.bin")'],
	() => { for (const p of ["grf/battle_units.png", "battle_talk.json", "battle_display.bin"]) claim("battle-fixed-four", p); });

site("battle-status-icons", "web/src/render/battleview.js",
	["battle_status_${statusIcons[group]}.png"],
	() => {
		// 值域=战术命令码，写点 originalsession.js playerGroupStatusIcons（固定六组槽）；
		// 上界由库存六行证明（命令域出自钉住的固定 battle 数据，不在 8a 重导）。
		const session = text("web/src/game/battle/originalsession.js");
		assert.ok(session.includes("playerGroupStatusIcons = [0, 0, 0, 0, 0, 0]"), "status icon slot anchor");
		for (let i = 0; i < 6; i++) claim("battle-status-icons", `grf/ui/battle_status_${i}.png`);
	});

site("battle-unit-three", "web/src/render/battleview.js",
	['"battle_unit_infantry.png"', '"battle_unit_cavalry.png"', '"battle_unit_archer.png"'],
	() => { for (const t of ["infantry", "cavalry", "archer"]) claim("battle-unit-three", `grf/ui/battle_unit_${t}.png`); });

site("march-markers", "web/src/render/mapview.js",
	["const MARCH_STYLE_COUNT = 24;", "const MARCH_FRAME_STATIONARY = 4;", "grf/march_markers/style_"],
	() => {
		for (let s = 0; s < 24; s++) for (let f = 0; f <= 4; f++)
			claim("march-markers", `grf/march_markers/style_${String(s).padStart(2, "0")}_frame_${f}.png`);
	});

site("engage-frames", "web/src/render/mapview.js", ["grf/engage/group_0_frame_${frame & 3}.png"],
	() => { for (let f = 0; f < 4; f++) claim("engage-frames", `grf/engage/group_0_frame_${f}.png`); });

site("city-icons", "web/src/render/mapview.js",
	['kind = "empty"', 'kind = f.idx === sc.player_faction ? "player" : "other"', "grf/ui/icon-${kind}_city.png"],
	() => { for (const k of ["empty", "player", "other"]) claim("city-icons", `grf/ui/icon-${k}_city.png`); });

site("mapimages-role-gate", "web/src/render/mapimages.js",
	["icon-(?:empty|player|other)_city", "march_markers", "engage"],
	() => {
		// ROLE 正则门与 march/engage/icon 三域一致：独立解析正则枚举并核对等于三域并集。
		const body = text("web/src/render/mapimages.js");
		const m = body.match(/const ROLE = \/\^(.+?)\$\(/);
		assert.ok(m, "ROLE regex anchor");
		const re = new RegExp(`^${m[1]}$`);
		for (const p of [...produced.keys()]) if (/^grf\/(ui\/icon-|march_markers\/|engage\/)/.test(p)) assert.ok(re.test(p), `ROLE rejects ${p}`);
	});

site("disaster-frames", "web/src/render/disasterpresentation.js",
	["const ASSETS = Object.freeze({ 1: 'fire', 2: 'riot' })", "frame & 7"],
	() => { for (const a of ["fire", "riot"]) for (let f = 0; f < 8; f++) claim("disaster-frames", `grf/disaster/${a}_frame_${f}.png`); });

site("weather-frames", "web/src/render/weatherpresentation.js",
	["Array.from({ length: 8 }", "grf/weather/cloud_frame_${frame}.png"],
	() => { for (let f = 0; f < 8; f++) claim("weather-frames", `grf/weather/cloud_frame_${f}.png`); });

site("gamebar-literals", "web/src/ui/gamebar.js", ['loadImage("grf/ui/tool_bar.png")', 'loadImage("grf/ivent_0.png")', 'loadImage("grf/ui/message_npc.png")'],
	() => {
		const body = text("web/src/ui/gamebar.js");
		const lits = [...body.matchAll(/loadImage\("([^"]+)"\)/g)].map((x) => x[1]);
		assert.ok(lits.length >= 18, "gamebar literal count");
		for (const p of lits) claim("gamebar-literals", p);
	});

site("kyo-city-view-data", "web/src/ui/gamebar.js", ["grf/kyo_${view}.png", 'padStart(2, "0")'],
	() => {
		const source = readInstalledEditorSource(BUILTIN_RESOURCES, (u) => read(`web/${u}`));
		assert.equal(source.chapters.length, 20);
		let cities = 0;
		for (const c of source.chapters) for (const city of c.state.cities) {
			cities++;
			claim("kyo-city-view-data", `grf/kyo_${String(city.view ?? 0).padStart(2, "0")}.png`);
		}
		assert.equal(cities, 3840);
	});

site("kao-portrait-data", "web/src/game/world.js", ["`kao/${m ? m.portrait : 0}.png`"],
	() => {
		// 另两入口锚：startmenu 军师缓存与 battleview 战术对白 speaker。
		assert.ok(text("web/src/ui/startmenu.js").includes("kao/{portrait}.png"), "startmenu anchor");
		assert.ok(text("web/src/render/battleview.js").includes("portrait(capture.speaker.portrait)"), "battleview speaker anchor");
		const manifest = parse("server/available-library.txt");
		const registered = manifest.unresolvedReferences;
		assert.equal(registered.length, 20);
		const source = readInstalledEditorSource(BUILTIN_RESOURCES, (u) => read(`web/${u}`));
		const missing = [];
		let generals = 0;
		for (const c of source.chapters) for (const g of c.state.generals) {
			generals++;
			const path = `kao/${g.portrait}.png`;
			if (library.has(path)) claim("kao-portrait-data", path);
			else missing.push({ chapterId: c.id, slot: g.idx, portrait: g.portrait, logicalURL: path });
		}
		assert.equal(generals, 2560);
		assert.deepEqual(missing, registered.map((r) => ({ chapterId: r.chapterId, slot: r.slot, portrait: r.portrait, logicalURL: r.logicalURL })),
			"missing portraits must equal the 20 registered unresolved G127/255 references");
	});

site("endview-endings", "web/src/game/ai.js",
	['img: "grf/gameover.png"', "`grf/end_s${i + 1}.png`"],
	() => {
		assert.ok(text("web/src/game/commands.js").includes('img: "grf/gameover.png"'), "commands gameover anchor");
		claim("endview-endings", "grf/gameover.png");
		for (let i = 1; i <= 12; i++) claim("endview-endings", `grf/end_s${i}.png`);
	});

site("music-playback", "web/src/core/music.js",
	['../../grf/music/playback.json', "../../grf/music/${item.file}"],
	() => {
		claim("music-playback", "grf/music/playback.json");
		const playback = parse("web/grf/music/playback.json");
		assert.equal(playback.tracks.length, 11);
		for (const t of playback.tracks) claim("music-playback", `grf/music/${t.file}`);
	});

site("speaker-engage-sfx", "web/src/core/speaker.js", ["const ENGAGE_SFX_URLS = [3, 13]", "ynsound-record${record}.wav"],
	() => { for (const r of [3, 13]) claim("speaker-engage-sfx", `grf/sfx/ynsound-record${r}.wav`); });

site("shell-css-urls", "server/public/trialapp.txt", ["battle_symbol_0", "Oswald-Light.woff2"],
	() => {
		for (const [file, label] of [["server/public/trialapp.txt", "shell"], ["web/index.html", "index"]]) {
			const urls = [...text(file).matchAll(/url\((?:\\?"|")([^"\\]+)(?:\\?"|")\)/g)].map((x) => x[1]);
			assert.ok(urls.length >= 19, `${label} CSS url count`);
			for (const u of urls) claim("shell-css-urls", u);
		}
	});

// ── trial 不可达 / 其它根域（登记边界，非库存缺口） ────────────────────
const boundaries = [];
{
	const boot = text("web/src/editor/servertrialapp.js");
	assert.ok(boot.includes("startApp(null, { trial })"), "trial boot passes null opening");
	const main = text("web/src/main.js");
	assert.ok(main.includes("opening?.menuReady"), "opening is optional-chained");
	assert.ok(main.includes("loadBuiltinContent(), app.saveRepository.load()") && main.includes("app.content = trial.content"),
		"trial branch skips loadBuiltinContent");
	assert.ok(![...library].some((p) => /open_s/.test(p)), "opening frames deliberately absent from library");
	boundaries.push("openview open_s*: trial boot opening=null (servertrialapp.js startApp(null,{trial}); main.js opening?.) — 不可达，库存刻意不含");
	boundaries.push("loadBuiltinContent catalog/dataURL: 仅 else 分支（main.js trial 分支 app.content=trial.content）——trial 不请求");
}
{
	const editor = text("web/src/tools/editorpage.js");
	assert.ok(editor.includes("map_atlas_summer.png"), "editorpage atlas anchor");
	boundaries.push("map_atlas_*/map_tiles_*/季节8: installedSources 注册表根（批次5 visualAssets/批次7b 路由分流 content/builtin/compiled/）——非 available-library 域");
}

// ── 反向覆盖：库存每行要么被某加载点产出，要么属登记的保守全量族 ──────
const conservativeSuperset = [];
for (const p of library) {
	if (produced.has(p)) continue;
	if (/^kao\/\d+\.png$/.test(p) || /^grf\/kyo_\d+\.png$/.test(p)) { conservativeSuperset.push(p); continue; }
	throw new Error(`library path not produced by any load point and not a registered superset row: ${p}`);
}

const receipt = {
	result: "PASS-TRIAL-ASSET-COVERAGE-8A",
	round,
	librarySize: library.size,
	sites: sites.map((s) => ({ name: s.name, file: s.file, paths: s.paths })),
	producedPaths: produced.size,
	conservativeSuperset: { count: conservativeSuperset.length, families: ["kao/0..149 (150 全量保守 staging)", "grf/kyo_00..14 (15 全量保守 staging)"] },
	dataDomains: {
		kao: "20 章 2560 武将 portrait byte；缺失集==available-library manifest 登记的 20 个 G127/255（slot 127/portrait 255）",
		kyo: "20 章 192 city view byte 全部在库",
		battleLayout: "battle_maps.json directory 214 项 layout 域 ⊆ {0,1,2}（固定钉住数据）",
	},
	boundaries,
	caseSensitive: true,
	caseFix: "grf/END_s*→grf/end_s*（库存键对齐磁盘与运行时小写实际名；ai.js end_s 生成式与 web/grf 磁盘文件名为准）",
	notClosure: "draft 章的 portrait/view 启动门属 8b；G127/255 处置属 8c；本证只覆盖内置 20 章与固定共享域",
	inputHashes,
};
const dir = join(root, ".dragon-analysis/editor-phase", `trial-asset-coverage-${round}`);
mkdirSync(dir, { recursive: false });
writeFileSync(join(dir, "receipt.json"), `${JSON.stringify(receipt, null, "\t")}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ result: receipt.result, sites: sites.length, producedPaths: produced.size, superset: conservativeSuperset.length, checks: sites.length + 1 })}\n`);
