// Q69 batch 8c sentinel-exclusion evidence: real local backend, builtin-derived chapter issue must now
// SUCCEED (200 with trialId, status active) because the manifest-registered G127/255 sentinel shape
// (slot 127 + portrait 255) is excluded from the start gate by Web product decision (user ruling
// 2026-10-08 option B, narrow predicate — not an original-rule claim). Any other missing reference
// (incl. portrait 255 at other slots) still gaps and still rejects. Staged manifest still registers the
// 20 unresolved references; the library stays STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE.
// Unit-level: gate helper over synthetic states and all 20 builtin chapters (zero gaps after exclusion).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { startEditorBackend } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/startup-transport-probe.mjs";
import { setConnectionPolicy } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/tls-transport-probe.mjs";
import { trialChapterAssetGaps } from "../server/trials.js";
import { FIXED_TRIAL_ASSET_PATHS } from "../web/src/editor/trialassetpaths.js";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";

const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.equal(process.argv.length, 3);
const out = join(".dragon-analysis/editor-phase", round);
assert.ok(existsSync(join(out, "fixture.js")), "round fixture.js must be pre-staged");
mkdirSync(out, { recursive: true });
const checks = [], calls = [];
const evidence = (name, actual, expected) => { assert.equal(actual, expected, `${name}: ${actual}`); checks.push({ name, status: expected }); };
function parsed(b) { try { return JSON.parse(b); } catch (cause) { throw new Error("owned sentinel gate JSON", { cause }); } }

// Unit domain: sentinel shape excluded, everything else still gaps.
const unit = () => {
	evidence("unit-clean-state-gaps", trialChapterAssetGaps({ generals: [{ idx: 0, portrait: 0 }, { idx: 127, portrait: 149 }], cities: [{ idx: 0, view: 0 }, { idx: 191, view: 14 }] }).length, 0);
	const bad = trialChapterAssetGaps({ generals: [{ idx: 127, portrait: 255 }, { idx: 3, portrait: 150 }, { idx: 4 }], cities: [{ idx: 2, view: 15 }, { idx: 5, view: "x" }] });
	evidence("unit-gap-count", bad.length, 4);
	evidence("unit-gap-255-excluded", bad.some((g) => g.value === 255), false);
	evidence("unit-gap-first", JSON.stringify(bad[0]), JSON.stringify({ kind: "kao", slot: 3, value: 150, logicalURL: "kao/150.png" }));
	evidence("unit-gap-view-15", JSON.stringify(bad[2]), JSON.stringify({ kind: "kyo", slot: 2, value: 15, logicalURL: "grf/kyo_15.png" }));
	evidence("unit-gap-255-elsewhere", trialChapterAssetGaps({ generals: [{ idx: 5, portrait: 255 }], cities: [] }).length, 1);
	const source = readInstalledEditorSource(BUILTIN_RESOURCES, (url) => readFileSync(join("web", url)));
	let total = 0, sentinels = 0;
	for (const chapter of source.chapters) {
		const gaps = trialChapterAssetGaps(chapter.state);
		total += gaps.length;
		assert.equal(gaps.length, 0, chapter.id);
		sentinels += chapter.state.generals.filter((g) => g?.idx === 127 && g?.portrait === 255).length;
	}
	evidence("unit-builtin-chapters", source.chapters.length, 20);
	evidence("unit-builtin-total-gaps", total, 0);
	evidence("unit-builtin-sentinels", sentinels, 20);
	evidence("unit-library-size", FIXED_TRIAL_ASSET_PATHS.length, 398);
	const library = parsed(readFileSync("server/available-library.txt"));
	evidence("unit-manifest-unresolved-still-20", library.unresolvedReferences.length, 20);
};
unit();

const initial = `init${randomBytes(13).toString("hex")}`, password = `pw1${randomBytes(13).toString("hex")}`;
const own = mkdtempSync(join(tmpdir(), "trial-sentinel-gate-")), config = parsed(readFileSync("server/wrangler.jsonc"));
config.main = resolve(join(out, "fixture.js"));
writeFileSync(join(own, "config.json"), JSON.stringify(config), { flag: "wx" });
writeFileSync(join(own, ".dev.vars"), `EDITOR_DEFAULT_PASSWORD=${JSON.stringify(initial)}\nEDITOR_REQUEST_KEY=${JSON.stringify(randomBytes(32).toString("hex"))}\n`, { flag: "wx" });

let server, origin;
function req(path, value, session, extra = {}) {
	const h = { Origin: origin, ...extra };
	if (session) { h.Cookie = session.cookie; h["X-CSRF-Token"] = session.csrf; }
	if (value !== undefined) { h["Content-Type"] = "application/json"; h["Idempotency-Key"] ??= randomUUID(); }
	return new Promise((done, reject) => {
		const q = httpsRequest(origin + path, { method: value === undefined ? "GET" : "POST", headers: h, rejectUnauthorized: false }, (s) => {
			const chunks = [];
			s.on("data", (b) => chunks.push(b));
			s.on("error", reject);
			s.on("end", () => {
				const r = { status: s.statusCode, bytes: Buffer.concat(chunks), cookie: s.headers["set-cookie"]?.[0]?.split(";")[0] };
				let data = null;
				try { data = JSON.parse(r.bytes); } catch {}
				calls.push({ realm: "backend", path, status: r.status });
				done({ ...r, data });
			});
		});
		q.on("error", reject);
		q.end(value === undefined ? undefined : JSON.stringify(value));
	});
}
const login = async (account, pw) => { const r = await req("/api/auth/login", { account, password: pw }, null); assert.equal(r.status, 200); return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user }; };
const changePw = async (session, oldPw, newPw) => { const r = await req("/api/auth/password", { oldPassword: oldPw, newPassword: newPw }, session); assert.equal(r.status, 200); return r.data; };

setConnectionPolicy(true);
try {
	server = await startEditorBackend(join(own, "config.json"), { stageSource: true, stageLibrary: true });
	origin = new URL(server.url).origin;
	evidence("backend-started", true, true);
	const admin = await login("tianyi", initial);
	await changePw(admin, initial, password);
	const session = await login("tianyi", password);
	let r = await req("/api/admin/source/install", {}, session); assert.equal(r.status, 200);
	r = await req("/api/admin/library/install", {}, session); assert.equal(r.status, 200);
	const def = (await req("/api/admin/source", undefined, session)).data.definition, copyKey = randomUUID();
	r = await req("/api/admin/copies", { registryId: def.registryId, name: "哨兵排除證據", introduction: "" }, session, { "Idempotency-Key": copyKey }); assert.equal(r.status, 202);
	r = await req(`/api/admin/copies/${copyKey}/run`, {}, session, { "If-Match": '"1"' }); assert.equal(r.status, 200, r.data?.error);
	const gameId = r.data.gameId;
	evidence("copy-run", typeof gameId === "string", true);

	// Session gate still precedes the asset gate.
	r = await req(`/api/games/${gameId}/trials`, { expectedRevision: "1", chapterId: `${gameId}#upper-1` }, null);
	evidence("issue-anonymous-401", r.status, 401);

	// Builtin-derived chapter carries only the excluded G127/255 sentinel: issue now succeeds.
	r = await req(`/api/games/${gameId}/trials`, { expectedRevision: "1", chapterId: `${gameId}#upper-1` }, session);
	evidence("issue-accepted-200", r.status, 200);
	evidence("issue-trial-id", typeof r.data?.trialId, "string");
	evidence("issue-state-active", r.data?.state ?? null, "active");
	const trialId = r.data.trialId;
	r = await req(`/api/trials/${trialId}/status`, undefined, session);
	evidence("status-active-200", r.status, 200);
	assert.equal(r.data?.state, "active");
	evidence("backend-calls-minimum", calls.length >= 8, true);

	const receipt = {
		result: "PASS-TRIAL-SENTINEL-EXCLUSION-8C-NOT-Q69-CLOSURE",
		round, checks, calls,
		gate: { error: null, status: 200, captureSets: { kao: 150, kyo: 15 }, builtinChapters: 20, builtinGaps: 0, sentinelExcluded: 20 },
		limits: "Web product decision (user ruling 2026-10-08 option B sentinel exclusion, narrow predicate slot-127 + portrait-255), not an original-rule/reachability claim; staged manifest still registers 20 unresolved G127/255 references and the library stays STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE; portrait 255 at any other slot still gaps and still rejects. TALK domain is 8d; this is not a Q69 closure certificate. No runtime/Release admission.",
	};
	writeFileSync(join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
	console.log(`PASS ${checks.length} checks, ${calls.length} calls`);
} finally {
	if (server) await server.close();
}
