// Q69-8a HTTP evidence: real local backend with staged registries; the trial web route must serve the
// lowercase end_s* logical URLs (case fix: library keys now match disk/runtime names), keep rejecting the
// never-registered uppercase variants and kao/255.png, and keep the session gate. No deployment.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { startEditorBackend } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/startup-transport-probe.mjs";
import { setConnectionPolicy } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/tls-transport-probe.mjs";

const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.equal(process.argv.length, 3);
const out = join(".dragon-analysis/editor-phase", round);
mkdirSync(out, { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const checks = [], calls = [];
const evidence = (name, actual, expected) => { assert.equal(actual, expected, `${name}: ${actual}`); checks.push({ name, status: expected }); };
function parsed(b) { try { return JSON.parse(b); } catch (cause) { throw new Error("owned trial web-assets JSON", { cause }); } }

const initial = `init${randomBytes(13).toString("hex")}`, password = `pw1${randomBytes(13).toString("hex")}`;
const own = mkdtempSync(join(tmpdir(), "trial-web-assets-")), config = parsed(readFileSync("server/wrangler.jsonc"));
config.main = resolve(`.dragon-analysis/editor-phase/${round}/fixture.js`);
writeFileSync(join(own, "config.json"), JSON.stringify(config), { flag: "wx" });
writeFileSync(join(own, ".dev.vars"), `EDITOR_DEFAULT_PASSWORD=${JSON.stringify(initial)}\nEDITOR_REQUEST_KEY=${JSON.stringify(randomBytes(32).toString("hex"))}\n`, { flag: "wx" });

let origin;
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
				const r = { status: s.statusCode, bytes: Buffer.concat(chunks), cookie: s.headers["set-cookie"]?.[0]?.split(";")[0], shaHeader: s.headers["x-content-sha256"] };
				let data = null;
				try { data = JSON.parse(r.bytes); } catch { /* png/audio bytes are not JSON */ }
				calls.push({ realm: "backend", path, status: r.status });
				done({ ...r, data });
			});
		});
		q.on("error", reject);
		q.end(value === undefined ? undefined : JSON.stringify(value));
	});
}
const login = async (account, pw) => { const r = await req("/api/auth/login", { account, password: pw }, null); assert.equal(r.status, 200); return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user }; };
const changePw = async (session, oldPw, newPw) => { const r = await req("/api/auth/password", { oldPassword: oldPw, newPassword: newPw }, session); assert.equal(r.status, 200); return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user }; };

setConnectionPolicy(true);
let server;
try {
	server = await startEditorBackend(join(own, "config.json"), { stageSource: true, stageLibrary: true });
	origin = new URL(server.url).origin;
	const admin = await changePw(await login("tianyi", initial), initial, password);
	let r = await req("/api/admin/source/install", {}, admin); assert.equal(r.status, 200);
	r = await req("/api/admin/library/install", {}, admin); assert.equal(r.status, 200);
	evidence("registry-install", r.status, 200);

	// The case-fixed lowercase rows serve real disk bytes with the sha response header.
	for (const p of ["grf/end_s1.png", "grf/end_s12.png", "grf/end_s7.png"]) {
		r = await req(`/api/trial/web/${p}`, undefined, admin);
		assert.equal(r.status, 200, p);
		const disk = readFileSync(`web/${p}`);
		assert.equal(sha(r.bytes), sha(disk), `${p} bytes == disk`);
		assert.equal(r.shaHeader, sha(disk), `${p} X-Content-SHA256`);
	}
	evidence("lowercase-end-s-served", 200, 200);

	// The never-registered uppercase variants stay rejected (no silent aliasing).
	r = await req("/api/trial/web/grf/END_s1.png", undefined, admin);
	assert.equal(r.status, 404, "uppercase END_s1 must stay 404");
	assert.equal(r.data?.error, "TRIAL_WEB_PATH");
	evidence("uppercase-end-s-404", r.status, 404);

	// The unclosed G127/255 reference stays refused: no substitution, no fabricated PNG.
	r = await req("/api/trial/web/kao/255.png", undefined, admin);
	assert.equal(r.status, 404, "kao/255 must stay 404");
	assert.equal(r.data?.error, "TRIAL_WEB_PATH");
	evidence("kao-255-still-404", r.status, 404);

	// Untouched baseline rows keep serving (kao/0.png, playback.json).
	r = await req("/api/trial/web/kao/0.png", undefined, admin);
	assert.equal(r.status, 200);
	assert.equal(sha(r.bytes), sha(readFileSync("web/kao/0.png")), "kao/0 bytes == disk");
	r = await req("/api/trial/web/grf/music/playback.json", undefined, admin);
	assert.equal(r.status, 200);
	assert.equal(sha(r.bytes), sha(readFileSync("web/grf/music/playback.json")), "playback.json bytes == disk");
	evidence("baseline-rows-unchanged", 200, 200);

	// Session gate applies in full to the web route.
	r = await req("/api/trial/web/grf/end_s1.png", undefined, null);
	assert.equal(r.status, 401, "anonymous web-route request must be 401");
	evidence("session-gate-401", r.status, 401);

	assert.ok(calls.every((c) => c.status < 500), "no 5xx from real backend");
	writeFileSync(join(out, "receipt.json"), `${JSON.stringify({
		result: "PASS-TRIAL-WEB-ASSETS-8A",
		round,
		checks,
		calls,
		limits: "Real local backend with staged installed-source + available-library registries; trial web route only (no browser, no trial session start). Case-fix serving evidence plus standing rejections (uppercase variants, kao/255) and the session gate. Not a Q69 closure certificate: draft-chapter start gate is 8b, G127/255 disposition is 8c.",
		productInstalled: false,
		goalComplete: false,
	}, null, "\t")}\n`, { flag: "wx" });
	process.stdout.write(`${JSON.stringify({ result: "PASS-TRIAL-WEB-ASSETS-8A", checks: checks.length, calls: calls.length })}\n`);
} finally {
	await server?.close();
}
