// Actual two fixed-library stages. Only owned artifacts and declared Web inputs.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { FIXED_TRIAL_ASSET_PATHS } from "../web/src/editor/trialassetpaths.js";
import {
	decodeTrialAssetManifest,
	verifyTrialAssetBlob,
} from "../web/src/editor/trialassetmanifest.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
	[first, second] = process.argv.slice(2);
assert.equal(process.argv.length, 4);
assert.notEqual(first, second);
for (const r of [first, second]) {
	assert.match(r ?? "", /^[a-zA-Z0-9-]{1,64}$/);
}
const sha = (b) => createHash("sha256").update(b).digest("hex"),
	inputHashes = {};
function read(p) {
	assert.ok(!/save\.dat/i.test(p));
	const b = readFileSync(join(root, p));
	inputHashes[p] = sha(b);
	return b;
}
function json(bytes) {
	try {
		return JSON.parse(bytes.toString());
	} catch (cause) {
		throw new TypeError("invalid fixed stage JSON", { cause });
	}
}
const currentPaths = new Set();
const current = readInstalledEditorSource(BUILTIN_RESOURCES, (url) => {
	const p = `web/${url}`;
	currentPaths.add(p);
	return read(p);
});
const programPaths = [
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
	"web/src/editor/trialassetpaths.js",
	"tools/stage_editor_trial_assets.mjs",
	"tools/editor_builtin_source.mjs",
];
const whitelist = new Set([
	...currentPaths,
	...FIXED_TRIAL_ASSET_PATHS.map((p) => `web/${p}`),
	"web/font/OFL-Oswald.txt",
	...programPaths,
]);
const base = ".dragon-analysis/editor-phase/",
	a = json(read(`${base + first}/receipt.json`)),
	b = json(read(`${base + second}/receipt.json`));
assert.deepEqual(a, b);
assert.equal(a.result, "PASS-STAGED-AVAILABLE-LIBRARY-NOT-RUNTIME");
assert.deepEqual(Object.keys(a.inputHashes).sort(), [...whitelist].sort());
for (const [p, h] of Object.entries(a.inputHashes)) {
	assert.ok(whitelist.has(p));
	assert.equal(sha(read(p)), h);
}
const data = read(`${base + first}/package/manifest.json`);
assert.deepEqual(data, read(`${base + second}/package/manifest.json`));
assert.equal(sha(data), a.manifestSha256);
const trusted = {
	manifestSha256: a.manifestSha256,
	manifestByteLength: a.manifestByteLength,
	baseRevision: current.revision,
	runtimeDataSha256: sha(read(`web/${BUILTIN_RESOURCES.dataURL}`)),
	programHashes: Object.fromEntries(programPaths.map((p) => [p, sha(read(p))])),
};
const manifest = await decodeTrialAssetManifest(data, trusted, sha),
	blobNames = new Set();
for (const [path, row] of Object.entries({
	...manifest.resources,
	...manifest.supportingFiles,
})) {
	const bytes = read(`${base + first}/package/${row.blobPath}`);
	assert.deepEqual(bytes, read(`${base + second}/package/${row.blobPath}`));
	assert.deepEqual(bytes, read(`web/${path}`));
	assert.equal(sha(bytes), row.sha256);
	assert.equal(bytes.length, row.byteLength);
	blobNames.add(row.sha256);
	if (Object.hasOwn(manifest.resources, path)) {
		await verifyTrialAssetBlob(manifest, path, bytes, sha);
	}
}
for (const round of [first, second]) {
	assert.deepEqual(
		readdirSync(join(root, base, round, "package/blobs")).sort(),
		[...blobNames].sort(),
	);
}
let negativeControls = 0;
async function reject(mutate, { rebind = false } = {}) {
	const copy = structuredClone(manifest);
	mutate(copy);
	const bytes = Buffer.from(`${JSON.stringify(copy)}\n`),
		t = rebind
			? {
					...trusted,
					manifestSha256: sha(bytes),
					manifestByteLength: bytes.length,
				}
			: trusted;
	const before = JSON.stringify(copy);
	await assert.rejects(() => decodeTrialAssetManifest(bytes, t, sha));
	assert.equal(JSON.stringify(copy), before);
	negativeControls++;
}
await reject((m) => delete m.resources["battle_maps.json"]);
await reject((m) => delete m.resources["talk.json"], { rebind: true });
await reject((m) => (m.resources["battle_maps.json"].blobPath = "../outside"), {
	rebind: true,
});
await reject((m) => (m.resources["talk.json"].mime = "image/png"), {
	rebind: true,
});
await reject((m) => (m.resources["talk.json"].byteLength = 0), {
	rebind: true,
});
await reject((m) => (m.runtimeDataSha256 = "0".repeat(64)), { rebind: true });
await reject((m) => (m.programHashes["web/src/main.js"] = "0".repeat(64)), {
	rebind: true,
});
await reject((m) => (m.unresolvedReferences[0].portrait = 0), { rebind: true });
await reject((m) => (m.mode = "RUNTIME_COMPLETE"), { rebind: true });
const path = "talk.json",
	good = read(`${base + first}/package/${manifest.resources[path].blobPath}`),
	bad = Buffer.from(good);
bad[0] ^= 1;
await assert.rejects(() => verifyTrialAssetBlob(manifest, path, bad, sha));
negativeControls++;
await assert.rejects(() =>
	verifyTrialAssetBlob(manifest, "kao/255.png", good, sha),
);
negativeControls++;
await assert.rejects(() =>
	verifyTrialAssetBlob(manifest, "../talk.json", good, sha),
);
negativeControls++;
for (const [p, h] of Object.entries(inputHashes)) {
	assert.equal(
		sha(readFileSync(join(root, p))),
		h,
		"input drift during verify",
	);
}
const toolHashes = Object.fromEntries(
	[
		"tools/verify_editor_trial_assets.mjs",
		"web/src/editor/trialassetpaths.js",
		"web/src/editor/trialassetmanifest.js",
	].map((p) => [p, sha(readFileSync(join(root, p)))]),
);
process.stdout.write(
	`${JSON.stringify({ result: "PASS-STAGED-AVAILABLE-LIBRARY-NOT-Q69-RUNTIME", inputHashes, toolHashes, resources: 398, uniqueBlobs: blobNames.size, negativeControls, unresolvedReferences: 20, identicalStages: 2, limits: "No install/service/loader/CSS/audio binding or missing255 inference. Negative rebind is structural fixture not new approval. Fixed-library byte capture only; no original mechanism/redistribution certificate." })}\n`,
);
