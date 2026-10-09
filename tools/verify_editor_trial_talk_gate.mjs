// Q69 batch 8d TALK fixed-domain evidence (ruling A, narrow): real local backend harness.
// Web product decision (user ruling 2026-10-08 option A): the trial TALK gate locks ONLY the
// proven-green fixed domain (literal indices reachable from gamebar audiences + formation/specialty
// windows); the 414+talk_idx personality window keeps CURRENT behavior (empty box, no skip, no
// modulo invention — original empty-sentence semantics unknown), registered as a known issue.
// No production behavior change this batch: docs + this tool only.
// Unit-level: web/talk.json fixed-domain non-empty mirrors + formation-fallback shape +
// no-modulo arithmetic / %3 bound / 5-reason statics + known-issue pins (417..421, 73 empties
// in 414..669). Live: builtin-derived chapter issue still 200 with trialId + status active.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { startEditorBackend } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/startup-transport-probe.mjs";
import { setConnectionPolicy } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/tls-transport-probe.mjs";

const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.equal(process.argv.length, 3);
const out = join(".dragon-analysis/editor-phase", round);
assert.ok(existsSync(join(out, "fixture.js")), "round fixture.js must be pre-staged");
mkdirSync(out, { recursive: true });
const checks = [], calls = [];
const evidence = (name, actual, expected) => { assert.equal(actual, expected, `${name}: ${actual}`); checks.push({ name, status: expected }); };
function parsed(b) { try { return JSON.parse(b); } catch (cause) { throw new Error("owned talk gate JSON", { cause }); } }

// Unit domain: trial-reachable TALK fixed domain over web/talk.json (TALK.DAT parse, 1023 entries).
const unit = () => {
	const talk = parsed(readFileSync("web/talk.json"));
	evidence("unit-talk-count", talk.count, 1023);
	evidence("unit-talk-strings-len", talk.strings.length, 1023);
	const strings = talk.strings;
	const isEmpty = (s) => !Array.isArray(s) || s.length === 0 || !s.some((x) => x);
	const empties = (a, b) => { const r = []; for (let i = a; i <= b; i++) if (isEmpty(strings[i])) r.push(i); return r; };
	// Fixed literal singletons cited at gamebar call sites (57/64/75/89/153/399 + 43/45/47 envoy steps).
	evidence("unit-fixed-singletons", JSON.stringify(empties(43, 47).concat([57, 64, 75, 89, 153, 399].filter((i) => isEmpty(strings[i])))), JSON.stringify([]));
	// War-reason advisor window 103+ri (ri 0..4: three 5-item reasonsItems) and monarch window 108/111/114+ri*9+{0..2}.
	evidence("unit-war-reason-window", JSON.stringify(empties(103, 107)), JSON.stringify([]));
	evidence("unit-monarch-window", JSON.stringify(empties(108, 152)), JSON.stringify([]));
	// Truce 167+ri / assistance 231+ri advisor windows.
	evidence("unit-truce-assist-windows", JSON.stringify(empties(167, 171).concat(empties(231, 235))), JSON.stringify([]));
	// Incoming-diplomacy question window: base 360/373 + 3C99 variant (v>=3 ? v-3 : v).
	evidence("unit-diplo-question-window", JSON.stringify(empties(360, 380)), JSON.stringify([]));
	// Formation window 446+talk_idx with the 446..448-empty fallback (449+talk%5) the code relies on.
	evidence("unit-formation-fallback-targets", JSON.stringify(empties(449, 453)), JSON.stringify([]));
	evidence("unit-formation-fallback-precondition", JSON.stringify(empties(446, 448)), JSON.stringify([446, 447, 448]));
	// Specialty windows: captive 553..557 + siege 558..565 + field 566..573 + naval 574..581.
	const specialty = empties(553, 581);
	evidence("unit-specialty-windows", specialty.length, 0);
	// Statics locking the surveyed shapes (no behavior change): personality arithmetic has no
	// modulo (full-byte talk_idx walks 414..669), monarchTalkIdx is %3-bounded, reasons are 5-item.
	const talkJs = readFileSync("web/src/game/talk.js", "utf8");
	assert.ok(talkJs.includes("return 0x196 + (selector - 0x196) * 8 + (personality & 0xff);"), "personality arithmetic without modulo present");
	evidence("unit-personality-no-mod-static", true, true);
	const gamebar = readFileSync("web/src/ui/gamebar.js", "utf8");
	evidence("unit-monarchTalkIdx-bounded-static", gamebar.split("(monarch?.talk_idx ?? monarch?.idx ?? 0) % 3").length - 1, 5);
	evidence("unit-reasons-five-static", gamebar.split("reasonsItems: [").length - 1, 3);
	// Known-issue pins (ruling A: kept as-is, no skip, no modulo): 414..421 empties exactly
	// 417..421, 73 empties across the full 414..669 personality walk. Any drift re-opens 8d.
	evidence("unit-known-issue-414-421", JSON.stringify(empties(414, 421)), JSON.stringify([417, 418, 419, 420, 421]));
	evidence("unit-known-issue-414-669-empty-count", empties(414, 669).length, 73);
};
unit();

const initial = `init${randomBytes(13).toString("hex")}`, password = `pw1${randomBytes(13).toString("hex")}`;
const own = mkdtempSync(join(tmpdir(), "trial-talk-gate-")), config = parsed(readFileSync("server/wrangler.jsonc"));
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
	r = await req("/api/admin/copies", { registryId: def.registryId, name: "TALK固定域", introduction: "" }, session, { "Idempotency-Key": copyKey }); assert.equal(r.status, 202);
	r = await req(`/api/admin/copies/${copyKey}/run`, {}, session, { "If-Match": '"1"' }); assert.equal(r.status, 200, r.data?.error);
	const gameId = r.data.gameId;
	evidence("copy-run", typeof gameId === "string", true);

	// Session gate still precedes everything; the TALK fixed domain is client data asserted above.
	r = await req(`/api/games/${gameId}/trials`, { expectedRevision: "1", chapterId: `${gameId}#upper-1` }, null);
	evidence("issue-anonymous-401", r.status, 401);

	// Builtin-derived chapter issue still succeeds (sentinel exclusion intact, TALK needs no server gate).
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
		result: "PASS-TRIAL-TALK-FIXED-DOMAIN-8D-NOT-Q69-CLOSURE",
		round, checks, calls,
		gate: { error: null, status: 200, builtinChapters: 20, talkFixedDomain: "all-nonempty", knownIssue: "414+talk_idx-empty-box-kept-no-behavior-change" },
		limits: "Web product decision (user ruling 2026-10-08 option A narrow: fixed domain locked, 414+talk_idx empty box kept as known issue, no skip, no modulo, no behavior change), not an original-rule claim. Endview defeat/unification reachability is code-level survey in the 8d doc section; unification browser proof stays residual. This is not a Q69 closure certificate. No runtime/Release admission.",
	};
	writeFileSync(join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
	console.log(`PASS ${checks.length} checks, ${calls.length} calls`);
} finally {
	if (server) await server.close();
}
