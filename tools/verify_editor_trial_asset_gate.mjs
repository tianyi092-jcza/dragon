// Q69 batch 8b chapter-dependency start gate evidence: real local backend, issue attempts must be
// rejected 422 TRIAL_CHAPTER_ASSET_MISSING when any chapter general portrait byte or city view byte
// misses the staged fixed library (conservative refuse incl. portrait 255 pending 8c disposition).
// Unit-level: gate helper over synthetic states and all 20 builtin chapters (exactly the registered
// G127/255 gaps, matching the staged manifest unresolvedReferences). Not an original-rule claim.
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
function parsed(b) { try { return JSON.parse(b); } catch (cause) { throw new Error("owned asset gate JSON", { cause }); } }

// Unit domain: helper over synthetic states and the real builtin chapters.
const unit = () => {
	evidence("unit-clean-state-gaps", trialChapterAssetGaps({ generals: [{ idx: 0, portrait: 0 }, { idx: 127, portrait: 149 }], cities: [{ idx: 0, view: 0 }, { idx: 191, view: 14 }] }).length, 0);
	const bad = trialChapterAssetGaps({ generals: [{ idx: 127, portrait: 255 }, { idx: 3, portrait: 150 }, { idx: 4 }], cities: [{ idx: 2, view: 15 }, { idx: 5, view: "x" }] });
	evidence("unit-gap-count", bad.length, 5);
	evidence("unit-gap-255", JSON.stringify(bad[0]), JSON.stringify({ kind: "kao", slot: 127, value: 255, logicalURL: "kao/255.png" }));
	evidence("unit-gap-view-15", JSON.stringify(bad[3]), JSON.stringify({ kind: "kyo", slot: 2, value: 15, logicalURL: "grf/kyo_15.png" }));
	const source = readInstalledEditorSource(BUILTIN_RESOURCES, (url) => readFileSync(join("web", url)));
	let total = 0;
	for (const chapter of source.chapters) {
		const gaps = trialChapterAssetGaps(chapter.state);
		total += gaps.length;
		assert.equal(gaps.length, 1, chapter.id);
		assert.deepEqual(gaps[0], { kind: "kao", slot: 127, value: 255, logicalURL: "kao/255.png" }, chapter.id);
	}
	evidence("unit-builtin-chapters", source.chapters.length, 20);
	evidence("unit-builtin-total-gaps", total, 20);
	evidence("unit-library-size", FIXED_TRIAL_ASSET_PATHS.length, 398);
};
unit();

const initial = `init${randomBytes(13).toString("hex")}`, password = `pw1${randomBytes(13).toString("hex")}`;
const own = mkdtempSync(join(tmpdir(), "trial-asset-gate-")), config = parsed(readFileSync("server/wrangler.jsonc"));
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
	r = await req("/api/admin/copies", { registryId: def.registryId, name: "啟動門證據", introduction: "" }, session, { "Idempotency-Key": copyKey }); assert.equal(r.status, 202);
	r = await req(`/api/admin/copies/${copyKey}/run`, {}, session, { "If-Match": '"1"' }); assert.equal(r.status, 200, r.data?.error);
	const gameId = r.data.gameId;
	evidence("copy-run", typeof gameId === "string", true);

	// Session gate precedes the asset gate.
	r = await req(`/api/games/${gameId}/trials`, { expectedRevision: "1", chapterId: `${gameId}#upper-1` }, null);
	evidence("issue-anonymous-401", r.status, 401);

	// Builtin-derived chapter carries the registered G127/255 record: conservative refuse, twice, no trialId leaked.
	for (const attempt of ["issue-rejected-422", "issue-rejected-repeat-422"]) {
		r = await req(`/api/games/${gameId}/trials`, { expectedRevision: "1", chapterId: `${gameId}#upper-1` }, session);
		evidence(attempt, r.status, 422);
		evidence(`${attempt}-code`, r.data?.error ?? null, "TRIAL_CHAPTER_ASSET_MISSING");
		evidence(`${attempt}-no-trial-id`, r.data?.trialId ?? null, null);
	}
	evidence("backend-calls-minimum", calls.length >= 8, true);

	const receipt = {
		result: "PASS-TRIAL-CHAPTER-ASSET-GATE-NOT-Q69-CLOSURE",
		round, checks, calls,
		gate: { error: "TRIAL_CHAPTER_ASSET_MISSING", status: 422, captureSets: { kao: 150, kyo: 15 }, builtinChapters: 20, builtinGaps: 20 },
		limits: "No original-rule/reachability claim; conservative missing-asset refuse incl. portrait 255 pending batch 8c G127/255 disposition. All builtin-derived chapter starts reject until 8c. Not runtime/Release admission.",
	};
	writeFileSync(join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
	console.log(`PASS ${checks.length} checks, ${calls.length} calls`);
} finally {
	if (server) await server.close();
}
