// Explicit available-library snapshot; no runtime/closure approval or installs.
import assert from "node:assert/strict";
import { readFileSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
	FIXED_TRIAL_ASSET_PATHS,
	TRIAL_ASSET_PROFILE,
} from "../web/src/editor/trialassetpaths.js";
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
	assert.ok(lstatSync(join(root, p)).isFile(), "regular fixed file required");
	const b = readFileSync(join(root, p));
	inputHashes[p] = sha(b);
	return b;
}
assert.equal(FIXED_TRIAL_ASSET_PATHS.length, 398);
assert.equal(new Set(FIXED_TRIAL_ASSET_PATHS).size, 398);
const source = readInstalledEditorSource(BUILTIN_RESOURCES, (url) =>
	read(`web/${url}`),
);
const resources = {},
	blobs = new Map();
function row(path) {
	const bytes = read(`web/${path}`),
		digest = sha(bytes);
	assert.ok(bytes.length > 0);
	blobs.set(digest, bytes);
	let mime = "application/octet-stream";
	if (path.endsWith(".png")) {
		mime = "image/png";
	} else if (path.endsWith(".json")) {
		mime = "application/json";
	} else if (path.endsWith(".woff2")) {
		mime = "font/woff2";
	} else if (path.endsWith(".flac")) {
		mime = "audio/flac";
	} else if (path.endsWith(".wav")) {
		mime = "audio/wav";
	} else if (path.endsWith(".txt")) {
		mime = "text/plain; charset=utf-8";
	}
	return {
		sha256: digest,
		byteLength: bytes.length,
		blobPath: `blobs/${digest}`,
		mime,
	};
}
for (const path of FIXED_TRIAL_ASSET_PATHS) {
	resources[path] = row(path);
}
const supportingFiles = { "font/OFL-Oswald.txt": row("font/OFL-Oswald.txt") };
const consumerPaths = [
	"web/index.html",
	"web/src/core/assets.js",
	"web/src/main.js",
	"web/src/editor/servertrialapp.js",
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
	"web/src/editor/trialassetpaths.js",
	"tools/stage_editor_trial_assets.mjs",
	"tools/editor_builtin_source.mjs",
];
const programHashes = Object.fromEntries(
	consumerPaths.map((p) => [p, sha(read(p))]),
);
const unresolvedReferences = [];
for (const c of source.chapters) {
	for (const g of c.state.generals) {
		const path = `kao/${g.portrait}.png`;
		if (!Object.hasOwn(resources, path)) {
			unresolvedReferences.push({
				chapterId: c.id,
				slot: g.idx,
				portrait: g.portrait,
				logicalURL: path,
			});
		}
	}
}
assert.equal(unresolvedReferences.length, 20);
assert.ok(
	unresolvedReferences.every((r) => r.slot === 127 && r.portrait === 255),
);
const manifest = {
	schemaVersion: 1,
	profile: TRIAL_ASSET_PROFILE,
	mode: "STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE",
	baseRevision: source.revision,
	runtimeDataSha256: sha(read(`web/${BUILTIN_RESOURCES.dataURL}`)),
	resources,
	supportingFiles,
	programHashes,
	unresolvedReferences,
	policy:
		"All available fixed paths captured, not runtime-approved or missing-path/sentinel inference; no loader/route/auth binding",
};
const body = Buffer.from(`${JSON.stringify(manifest)}\n`);
for (const [p, h] of Object.entries(inputHashes)) {
	assert.equal(
		sha(readFileSync(join(root, p))),
		h,
		"input drift during capture",
	);
}
const output = join(root, ".dragon-analysis/editor-phase", round);
mkdirSync(output);
mkdirSync(join(output, "package"));
mkdirSync(join(output, "package/blobs"));
for (const [digest, bytes] of blobs) {
	writeFileSync(join(output, "package/blobs", digest), bytes, { flag: "wx" });
}
writeFileSync(join(output, "package/manifest.json"), body, { flag: "wx" });
writeFileSync(
	join(output, "receipt.json"),
	`${JSON.stringify(
		{
			result: "PASS-STAGED-AVAILABLE-LIBRARY-NOT-RUNTIME",
			inputHashes,
			manifestSha256: sha(body),
			manifestByteLength: body.length,
			resources: 398,
			uniqueBlobs: blobs.size,
			totalResourceBytes: Object.values(resources).reduce(
				(n, r) => n + r.byteLength,
				0,
			),
			supportingFiles: 1,
			unresolvedReferences: 20,
			limits:
				"Owned staging only; no product installs/drafts/Trial loaders/CSS/audio scopes. Includes existing font licence but no redistribution-rights certification. Missing255 kept unresolved, not substituted/fallback/absence-policy-approved.",
		},
		null,
		2,
	)}\n`,
	{ flag: "wx" },
);
process.stdout.write(
	`${JSON.stringify({ result: "PASS-STAGED-AVAILABLE-LIBRARY-NOT-RUNTIME", manifestSha256: sha(body), resources: 398, uniqueBlobs: blobs.size, unresolvedReferences: 20 })}\n`,
);
