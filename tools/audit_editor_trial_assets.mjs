// Fixed imported-profile Web dependency inventory, NOT a closure certificate.
// No DOS, network, profile, draft or product writes; one new owned receipt.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
	round = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const sha = (b) => createHash("sha256").update(b).digest("hex"),
	inputHashes = {},
	resources = {},
	roles = {};
function read(p) {
	assert.ok(!/save\.dat/i.test(p));
	const b = readFileSync(join(root, p));
	inputHashes[p] = sha(b);
	return b;
}
function parse(b) {
	try {
		return JSON.parse(b.toString("utf8"));
	} catch (cause) {
		throw new TypeError("invalid fixed dependency JSON", { cause });
	}
}
function add(role, path) {
	assert.match(path, /^[A-Za-z0-9_./-]+$/);
	assert.ok(!path.includes(".."));
	roles[role] ??= [];
	roles[role].push(path);
	if (resources[path]) {
		return;
	}
	const b = read(`web/${path}`);
	const item = { sha256: sha(b), byteLength: b.length };
	assert.ok(b.length > 0);
	if (path.endsWith(".png")) {
		assert.ok(b.length >= 33);
		assert.equal(b.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
		assert.equal(b.subarray(12, 16).toString(), "IHDR");
		item.width = b.readUInt32BE(16);
		item.height = b.readUInt32BE(20);
		assert.ok(item.width > 0 && item.height > 0);
	}
	resources[path] = item;
}
for (const p of [
	"battle_maps.json",
	"battle_navigation.json",
	"battle_rules.json",
	"battle_scripts.json",
	"talk.json",
	"battle_talk.json",
	"battle_display.bin",
]) {
	add("battleAndTalk", p);
}
for (let i = 0; i < 3; i++) {
	add("battleImages", `grf/battle_terrain_${i}.png`);
}
add("battleImages", "grf/battle_units.png");
for (let i = 0; i < 150; i++) {
	add("portraitLibrary", `kao/${i}.png`);
}
assert.deepEqual(
	readdirSync(join(root, "web/kao"))
		.filter((p) => p.endsWith(".png"))
		.sort(),
	Array.from({ length: 150 }, (_, i) => `${i}.png`).sort(),
);
for (let i = 0; i < 15; i++) {
	add("cityViews", `grf/kyo_${String(i).padStart(2, "0")}.png`);
}
for (let style = 0; style < 24; style++) {
	for (let frame = 0; frame < 5; frame++) {
		add(
			"march",
			`grf/march_markers/style_${String(style).padStart(2, "0")}_frame_${frame}.png`,
		);
	}
}
for (let i = 0; i < 4; i++) {
	add("engage", `grf/engage/group_0_frame_${i}.png`);
}
for (let i = 0; i < 8; i++) {
	add("weather", `grf/weather/cloud_frame_${i}.png`);
}
for (const effect of ["fire", "riot"]) {
	for (let i = 0; i < 8; i++) {
		add("disaster", `grf/disaster/${effect}_frame_${i}.png`);
	}
}
for (const kind of ["player", "other", "empty"]) {
	add("mapIcons", `grf/ui/icon-${kind}_city.png`);
}
for (const name of [
	"tool_bar",
	"tool_ico1",
	"tool_ico2",
	"tool_ico3",
	"tool_ico4",
	"ico_money",
	"ico_cavalry",
	"ico_archer",
	"ico_infantry",
	"cloud",
	"frame_sq",
	"frame_col",
	"frame_cap",
	"message_npc",
]) {
	add("gameUI", `grf/ui/${name}.png`);
}
for (let i = 0; i < 3; i++) {
	add("gameUI", `grf/ivent_${i}.png`);
}
for (let i = 0; i < 16; i++) {
	add("battleUI", `grf/ui/battle_symbol_${i}.png`);
}
for (let i = 0; i < 6; i++) {
	add("battleUI", `grf/ui/battle_status_${i}.png`);
}
for (const type of ["cavalry", "archer", "infantry"]) {
	add("battleUI", `grf/ui/battle_unit_${type}.png`);
}
add("battleUI", "grf/ui/battle_formation_stone.png");
add("font", "font/Oswald-Light.woff2");
add("end", "grf/gameover.png");
for (let i = 1; i <= 12; i++) {
	add("end", `grf/end_s${i}.png`);
}
add("audio", "grf/music/playback.json");
const musicIndices = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, "OVERBGM"],
	music = parse(read("web/grf/music/playback.json"));
assert.deepEqual(
	music.tracks.map((t) => t.index),
	musicIndices,
);
for (const [index, track] of music.tracks.entries()) {
	const name =
		typeof musicIndices[index] === "number"
			? `BGM_${String(musicIndices[index]).padStart(2, "0")}`
			: "OVERBGM";
	assert.equal(track.file, `loops/${name}.flac`);
	assert.ok(
		Number.isFinite(track.loopStart) &&
			Number.isFinite(track.loopEnd) &&
			track.loopEnd > track.loopStart,
	);
	add("audio", `grf/music/loops/${name}.flac`);
	assert.equal(
		read(`web/grf/music/loops/${name}.flac`).subarray(0, 4).toString(),
		"fLaC",
	);
}
for (const record of [3, 13]) {
	const p = `grf/sfx/ynsound-record${record}.wav`;
	add("audio", p);
	assert.equal(read(`web/${p}`).subarray(0, 4).toString(), "RIFF");
}
assert.equal(
	read("web/font/Oswald-Light.woff2").subarray(0, 4).toString(),
	"wOF2",
);
const maps = parse(read("web/battle_maps.json")),
	navigation = parse(read("web/battle_navigation.json")),
	talk = parse(read("web/talk.json")),
	battleTalk = parse(read("web/battle_talk.json")),
	scripts = parse(read("web/battle_scripts.json")),
	rules = parse(read("web/battle_rules.json"));
assert.equal(maps.cities.length, 192);
assert.equal(maps.directory.length, 214);
for (const table of [maps.maps, navigation.maps]) {
	assert.deepEqual(
		Object.keys(table),
		Array.from({ length: 214 }, (_, i) => String(i)),
	);
	assert.ok(
		Object.values(table).every(
			(a) =>
				Array.isArray(a) &&
				a.length === 4096 &&
				a.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
		),
	);
}
assert.deepEqual(Object.keys(navigation.layouts), ["0", "1", "2"]);
for (const layout of Object.values(navigation.layouts)) {
	assert.equal(layout.attributes.length, 2048);
}
assert.ok(
	maps.directory.every((r, i) => r.idx === i && [0, 1, 2].includes(r.layout)),
);
assert.equal(talk.count, talk.strings.length);
assert.equal(talk.count, 1023);
assert.equal(battleTalk.revision, 1);
assert.equal(
	battleTalk.sourceSha256,
	"cb0cdba4f1c507243cbc4e636bc3fcf698a4f88fe3a0d784cc579e5548e6fcaf",
);
assert.equal(scripts.length, 32);
assert.ok(scripts.every((a) => Array.isArray(a) && a.length === 128));
assert.equal(rules.formationVectors.length, 768);
assert.equal(
	resources["battle_display.bin"].byteLength,
	(3 * 192 + 360) * 0x140,
);
const consumers = [
	"web/index.html",
	"web/src/core/assets.js",
	"web/src/main.js",
	"web/src/core/music.js",
	"web/src/core/speaker.js",
	"web/src/render/battleview.js",
	"web/src/render/endview.js",
	"web/src/render/mapview.js",
	"web/src/render/disasterpresentation.js",
	"web/src/render/weatherpresentation.js",
	"web/src/ui/gamebar.js",
	"web/src/ui/hud.js",
	"web/src/game/talk.js",
	"web/src/game/battle/originalmessages.js",
	"web/src/content/authoring/trialruntime.js",
	"web/src/editor/trialapp.js",
	"tools/editor_builtin_source.mjs",
	"web/src/content/builtinresources.generated.js",
	"web/src/content/builtinrelease.generated.js",
	"tools/audit_editor_trial_assets.mjs",
];
for (const p of consumers) {
	read(p);
}
const cssURLs = [
	...read("web/index.html")
		.toString()
		.matchAll(/url\("([^"\n]+)"\)/g),
].map((m) => m[1]);
assert.equal(cssURLs.length, 19);
assert.ok(cssURLs.every((p) => Object.hasOwn(resources, p)));
const source = readInstalledEditorSource(BUILTIN_RESOURCES, (url) =>
	read(`web/${url}`),
);
const referencedPortraits = {},
	referencedCityViews = {};
for (const chapter of source.chapters) {
	assert.equal(chapter.state.generals.length, 128);
	assert.equal(chapter.state.cities.length, 192);
	for (const g of chapter.state.generals) {
		assert.ok(
			Number.isInteger(g.portrait) && g.portrait >= 0 && g.portrait <= 255,
		);
		referencedPortraits[g.portrait] ??= [];
		referencedPortraits[g.portrait].push({
			chapterId: chapter.id,
			slot: g.idx,
			attr: g.attr,
		});
	}
	for (const c of chapter.state.cities) {
		const path = `grf/kyo_${String(c.view).padStart(2, "0")}.png`;
		assert.ok(Object.hasOwn(resources, path));
		referencedCityViews[c.view] ??= [];
		referencedCityViews[c.view].push({ chapterId: chapter.id, slot: c.idx });
	}
}
const unresolvedPortraits = Object.entries(referencedPortraits)
	.filter(([i]) => !Object.hasOwn(resources, `kao/${i}.png`))
	.map(([portrait, refs]) => ({
		portrait: Number(portrait),
		logicalURL: `kao/${portrait}.png`,
		references: refs.length,
		reservedSlotReferences: refs.filter((r) => r.slot === 127).length,
		examples: refs.slice(0, 8),
		verdict:
			"UNRESOLVED-REACHABILITY; no placeholder/sentinel/dead-path assumption",
	}));
for (const [p, h] of Object.entries(inputHashes)) {
	assert.equal(
		sha(readFileSync(join(root, p))),
		h,
		"input changed during audit",
	);
}
const out = join(root, ".dragon-analysis/editor-phase", round);
mkdirSync(out);
writeFileSync(
	join(out, "receipt.json"),
	`${JSON.stringify({ result: "PASS-FIXED-WEB-INVENTORY-NOT-Q69-CLOSURE", fixtureId: source.revision, inputHashes, resources, roles, totalBytes: Object.values(resources).reduce((n, r) => n + r.byteLength, 0), shapes: { battleMaps: 214, battleNavigation: 214, mapCells: 4096, layoutAttributeBytes: 2048, battleDirectory: 214, cities: 192, talkStrings: 1023, battleTalkRecords: Object.keys(battleTalk.records).length, battleScripts: 32, scriptWords: 128, formationVectors: 768, battleDisplayBytes: resources["battle_display.bin"].byteLength }, portraitReferenceCounts: Object.fromEntries(Object.entries(referencedPortraits).map(([i, r]) => [i, r.length])), cityViewReferenceCounts: Object.fromEntries(Object.entries(referencedCityViews).map(([i, r]) => [i, r.length])), unresolvedPortraits, cssURLs, limits: "No immutable capture/loader binding/runtime test/auth/new original-rule claims. PNG signature+IHDR only, not decode/pixels. Full available portrait library and all214 battle tables retained, not assumed reachable-only subset. Legacy mmap_map.bin consumer only textual no-caller finding, not dead-path proof." }, null, 2)}\n`,
	{ flag: "wx" },
);
process.stdout.write(
	`${JSON.stringify({ result: "PASS-FIXED-WEB-INVENTORY-NOT-Q69-CLOSURE", resources: Object.keys(resources).length, totalBytes: Object.values(resources).reduce((n, r) => n + r.byteLength, 0), unresolvedPortraits })}\n`,
);
