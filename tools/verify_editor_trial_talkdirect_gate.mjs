// Q69 batch 8f TALK direct-literal + event-wheel evidence (ruling A, narrow): real local backend harness.
// Web product decision (user ruling 2026-10-08 option A, extended by 8d): the trial TALK gate locks
// ONLY proven-green fixed domains; every full-byte personality window (414+/422+/430+/438+/470+/
// 518+/534+/542+talk_idx, no modulo) and the 486+warTalkStyle war window keep CURRENT behavior
// (empty box, no skip, no modulo invention — original empty-sentence semantics unknown), registered
// as known issues. The type-10 native generic wheel is unreachable in trial (zero producers in
// web/src, zero boot slots in all 20 chapters, native >=1023 fail-closed, legacy writer rejects
// native). No production behavior change this batch: docs + this tool only.
// Unit-level: ai.js direct-literal non-empty mirrors + 43..49 CX closure + war486 shape/statics +
// 489..493 pins with four real monarch instances + disaster 70+{0,1,2} producers + type-10
// unreachability + eight personality-window empty-count pins. Live: builtin-derived chapter issue
// still 200 with trialId + status active.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { format } from "node:util";
import { startEditorBackend } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/startup-transport-probe.mjs";
import { setConnectionPolicy } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/tls-transport-probe.mjs";

const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.equal(process.argv.length, 3);
const out = join(".dragon-analysis/editor-phase", round);
assert.ok(existsSync(join(out, "fixture.js")), "round fixture.js must be pre-staged");
mkdirSync(out, { recursive: true });
/** Harness progress goes through tlog (repo convention), not console.log. */
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
const checks = [], calls = [];
const evidence = (name, actual, expected) => { assert.equal(actual, expected, `${name}: ${actual}`); checks.push({ name, status: expected }); };
function parsed(b) { try { return JSON.parse(b); } catch (cause) { throw new Error("owned talkdirect gate JSON", { cause }); } }

// Unit domain: ai.js/gamebar direct TALK literals + war/disaster/type-10 shapes over web/talk.json.
const unit = () => {
	const talk = parsed(readFileSync("web/talk.json"));
	evidence("unit-talk-count", talk.count, 1023);
	const strings = talk.strings;
	const isEmpty = (s) => !Array.isArray(s) || s.length === 0 || !s.some((x) => x);
	const empties = (a, b) => { const r = []; for (let i = a; i <= b; i++) if (isEmpty(strings[i])) r.push(i); return r; };
	// ai.js direct enqueueTalkMessage literals (capture/city/war/trust/budget/diplomacy/disaster
	// reports) + unification TALK75 + 0x196 direct + war base 486..488.
	const fixed = [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 57, 63, 65, 66, 67, 68, 69, 70, 75, 407, 486, 487, 488];
	evidence("unit-ai-direct-literals", JSON.stringify(fixed.filter((i) => isEmpty(strings[i]))), JSON.stringify([]));
	// Native war-path 3C3D CX closure: CX=0x2B/0x2F + min(al,2) covers 43..49 (8d proved 43/45/47).
	evidence("unit-diplo-cx-full", JSON.stringify(empties(43, 49)), JSON.stringify([]));
	// War declaration shape: warTalkStyle clamps monarch talk_idx to 0..7, index is 486+style.
	const ai = readFileSync("web/src/game/ai.js", "utf8");
	assert.ok(ai.includes("Math.max(0, Math.min(7, monarch?.talk_idx ?? 0))"), "warTalkStyle clamp present");
	assert.ok(ai.includes("talkIndex: 486 + warTalkStyle"), "486+style war index present");
	evidence("unit-war486-shape-static", true, true);
	// Known-issue pin (ruling A: kept, no skip): 489..493 exactly empty. Any drift re-opens 8f.
	evidence("unit-known-issue-489-493", JSON.stringify(empties(486, 493)), JSON.stringify([489, 490, 491, 492, 493]));
	// Four real monarch instances whose war declarations render the empty box (data-backed).
	const game = parsed(readFileSync("web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23/game-source.json"));
	const monarchTalk = (cid, fidx) => {
		const st = game.chapters[cid].state;
		const f = Object.values(st.factions).find((x) => x.idx === fidx);
		return Object.values(st.generals).find((x) => x.idx === f.monarch_idx).talk_idx;
	};
	const instances = [["middle-2", 10, 6, 492], ["middle-3", 10, 3, 489], ["lower-3", 3, 4, 490], ["lower-3", 4, 5, 491]];
	for (const [cid, fidx, wantTalk, wantIndex] of instances) {
		const t = monarchTalk(cid, fidx);
		assert.equal(t, wantTalk, `${cid} f${fidx} talk_idx`);
		assert.equal(486 + t, wantIndex, `${cid} f${fidx} war index`);
		assert.ok(isEmpty(strings[486 + t]), `${cid} f${fidx} war box empty`);
	}
	evidence("unit-war486-real-instances", instances.length, 4);
	// 8e corroboration: later-4 both monarchs talk 1 -> 487 non-empty, so the observed 8e war
	// declaration rendered a real box (no empty-box confound in the defeat proof).
	evidence("unit-8e-war-unaffected", isEmpty(strings[486 + monarchTalk("later-4", 1)]), false);
	// Disaster-object 70+subtype: producers are exactly three type-12 writes with arg0 0/1/2.
	assert.equal((ai.match(/type: 12/g) || []).length, 3, "three type-12 producers");
	for (const a of ["arg0: 0", "arg0: 1", "arg0: 2"]) assert.ok(ai.includes(a), `disaster ${a} present`);
	evidence("unit-disaster70-producers-static", true, true);
	evidence("unit-disaster70-72", JSON.stringify(empties(70, 72)), JSON.stringify([]));
	// Type-10 native generic wheel unreachability in trial: zero {type:10} producers in web/src,
	// zero boot slots across all 20 chapters, native >=1023 fail-closed, legacy writer rejects native.
	const jsFiles = [];
	const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.isFile() && e.name.endsWith(".js")) jsFiles.push(p); } };
	walk("web/src");
	let producers = 0;
	for (const p of jsFiles) { const t = readFileSync(p, "utf8"); producers += (t.match(/\btype:\s*10\s*[,}]/g) || []).length + (t.match(/type:10/g) || []).length; }
	evidence("unit-type10-zero-producers", producers, 0);
	assert.equal(game.chapterOrder.length, 20, "twenty chapters");
	let badWheels = 0, type10Slots = 0;
	for (const cid of game.chapterOrder) {
		const raw = game.chapters[cid]?.state?.nativeStrategicEventRaw;
		if (typeof raw !== "string" || raw.length !== 256 * 8 || !/^[0-9a-f]+$/i.test(raw)) { badWheels++; continue; }
		for (let s = 0; s < 256; s++) {
			const b = [0, 1, 2, 3].map((i) => parseInt(raw.slice(s * 8 + i * 2, s * 8 + i * 2 + 2), 16));
			if (!b.every((v) => v === 0) && b[0] === 10) type10Slots++;
		}
	}
	evidence("unit-type10-boot-wheels-valid", badWheels, 0);
	evidence("unit-type10-zero-boot-slots", type10Slots, 0);
	assert.ok(ai.includes("if (payload.talkIndex >= 1023)"), "native >=1023 fail-closed present");
	assert.ok(ai.includes("rejectNativeGeneralLifecycle(sc, app"), "legacy writer rejects native present");
	evidence("unit-type10-unreachable-static", true, true);
	// Eight full-byte personality windows pinned as known issues (selector -> base -> empty count
	// over base..min(base+255,1022)); any drift re-opens 8f. Bases: 414/422/430/438/470/518/534/542.
	const windows = [[0x197, 414, 73], [0x198, 422, 68], [0x199, 430, 68], [0x19a, 438, 65], [0x19e, 470, 56], [0x1a4, 518, 28], [0x1a6, 534, 23], [0x1a7, 542, 20]];
	for (const [sel, base, want] of windows) {
		const exp = 0x196 + (sel - 0x196) * 8;
		assert.equal(exp, base, `selector 0x${sel.toString(16)} base`);
		assert.equal(empties(base, Math.min(base + 255, 1022)).length, want, `window ${base} empty count`);
	}
	evidence("unit-personality-windows-pinned", windows.length, 8);
	for (const sel of [0x198, 0x199, 0x1a4, 0x1a6, 0x1a7]) assert.ok(ai.includes(`personalitySelector: 0x${sel.toString(16)}`), `selector 0x${sel.toString(16)} present`);
	assert.ok(ai.includes("personalitySelector = 0x19a"), "selector 0x19a assignment present");
	evidence("unit-personality-selectors-static", true, true);
};
unit();

const initial = `init${randomBytes(13).toString("hex")}`, password = `pw1${randomBytes(13).toString("hex")}`;
const own = mkdtempSync(join(tmpdir(), "trial-talkdirect-gate-")), config = parsed(readFileSync("server/wrangler.jsonc"));
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
	const sourceEntry = await req("/api/admin/source", undefined, session);
	const def = sourceEntry.data.definition, copyKey = randomUUID();
	r = await req("/api/admin/copies", { registryId: def.registryId, name: "TALK直接域", introduction: "" }, session, { "Idempotency-Key": copyKey }); assert.equal(r.status, 202);
	r = await req(`/api/admin/copies/${copyKey}/run`, {}, session, { "If-Match": '"1"' }); assert.equal(r.status, 200, r.data?.error);
	const gameId = r.data.gameId;
	evidence("copy-run", typeof gameId === "string", true);

	// Session gate still precedes everything; the TALK direct domain is client data asserted above.
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
		result: "PASS-TRIAL-TALK-DIRECT-WHEEL-8F-NOT-Q69-CLOSURE",
		round, checks, calls,
		gate: { error: null, status: 200, builtinChapters: 20, talkDirectDomain: "all-nonempty", knownIssue: "486plus489-493-and-eight-personality-windows-empty-box-kept-no-behavior-change", type10: "unreachable-in-trial" },
		limits: "Web product decision (user ruling 2026-10-08 option A narrow extended by 8d: fixed domains locked, 486+warTalkStyle 489..493 plus eight full-byte personality windows kept as known issues with empty box, no skip, no modulo, no behavior change; type-10 native generic wheel unreachable in trial by code-exhaustive producer scan plus zero boot slots), not an original-rule claim. Native-branch event-wheel runtime writes beyond the legacy-rejecting schedulers are not traced; this batch does not certify strategic-event reachability. Unification browser proof stays residual. This is not a Q69 closure certificate. No runtime/Release admission.",
	};
	writeFileSync(join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
	tlog(`PASS ${checks.length} checks, ${calls.length} calls`);
} finally {
	if (server) await server.close();
}
