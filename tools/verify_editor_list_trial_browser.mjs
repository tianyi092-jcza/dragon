// Own loopback/fresh profile/temporary drafts; same App/compiler, no user saves.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEditorServer } from "./editor_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { BUILTIN_RELEASE } from "../web/src/content/builtinrelease.generated.js";
const round = process.argv[2]; assert.match(round ?? "", /^[A-Za-z0-9-]{1,64}$/);
const out = join(".dragon-analysis/editor-phase", round); mkdirSync(out);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function readManifest(path) { try { return JSON.parse(readFileSync(path, "utf8")); } catch (cause) { throw new Error("固定來源manifest損壞", { cause }); } }
const prefix = BUILTIN_RESOURCES.sourceURL.replace("game-source.json", ""), manifest = readManifest("web/" + prefix + "manifest.json");
const paths = ["web/" + prefix + "manifest.json", ...manifest.assets.map((a) => "web/" + a.url),
  "web/" + BUILTIN_RELEASE.entitySource.manifestURL, "web/" + BUILTIN_RELEASE.entitySource.resourceURL];
const hashes = () => Object.fromEntries(paths.map((p) => [p, sha(readFileSync(p))]));
const before = hashes(), store = mkdtempSync(join(tmpdir(), "dragon-list-trial-")), server = await startEditorServer(0, store);
const origin = `http://127.0.0.1:${server.address().port}`; let browser, stage = "copy", compileRequests = 0;
const errors = [], expectedErrors = [], forbidden = [], checks = [], responses400 = [];
async function call(path, body) { const r = await fetch(origin + path, { headers: { "content-type": "application/json", connection: "close" }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) }); assert.equal(r.status, 200, path); return r.json(); }
async function boot(page) { await page.waitForSelector("#start-trial"); await page.click("#start-trial"); await page.waitForFunction(() => window.__app?.gameStarted && window.__app.runtimeEnabled); await page.evaluate(() => { window.__app.gamebar.settingsOpen = true; window.__app.gamebar.syncClock(); }); }
async function state(page) { return page.evaluate(async () => { const a = window.__app, { scenarioNativeRoadContext, snapshotScenarioAssembly } = await import("/src/game/scenarioassembly.js"); return { identity: a.trialIdentity, tile: scenarioNativeRoadContext(a.scenario).terrain.readTile(10,10), state: JSON.stringify(a.scenario), ram: JSON.stringify(snapshotScenarioAssembly({ scenario:a.scenario,scenarioIdx:a.scenarioIdx,content:a.content,world:a.world })), rng:JSON.stringify(a.originalRng.snapshot()), idb:window.__listIDB }; }); }
try {
  await call("/api/copy", { gameId:"list-trial",kind:"full",ownerId:"local-fixture",metadata:{name:"測試遊戲",introduction:"<img src=x>"} });
  await call("/api/copy", { gameId:"list-empty",kind:"minimal",ownerId:"local-fixture" });
  const draft = await call("/api/draft?game=list-trial");
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
  const browserEnv = {};
  for (const key of ["SystemRoot","SYSTEMROOT","WINDIR","COMSPEC","ComSpec","PATH","Path","PATHEXT","TEMP","TMP","USERPROFILE","LOCALAPPDATA","APPDATA","HOMEDRIVE","HOMEPATH"])
    if (process.env[key] !== undefined) browserEnv[key] = process.env[key];
  browser = await chromium.launch({ headless:true, env:browserEnv }); const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(() => { window.__listIDB=0; indexedDB.open=()=>{ window.__listIDB++; throw new Error("formal IDB forbidden"); }; });
  context.on("page", (p) => { p.setDefaultTimeout(120000); p.on("pageerror", (e)=>errors.push(String(e))); p.on("response", (r)=>{ if(r.status()===400) responses400.push(r.url()); }); p.on("console", (m)=>{ if(m.type()!=="error" || m.location().url?.endsWith("/favicon.ico")) return; if(m.location().url===origin+"/api/compile" && /400/.test(m.text())) expectedErrors.push(m.text()); else errors.push(m.text()); }); });
  let readonlyFixtureShown = false;
  await context.route("**/*", async (route) => { const u = new URL(route.request().url()); if(u.origin!==origin || /save\.dat|\/mmap_map\.bin$|\/road_graph\.json$|\/src\/boot\.js$|\.dragon-analysis/i.test(u.pathname)){forbidden.push(u.href);return route.abort();} if(u.pathname==="/api/compile") compileRequests++;
    // Local listing does not enumerate the builtin; inject only a readonly DTO
    // to exercise the UI branch, never install a draft or claim backend auth.
    if(u.pathname==="/api/games" && !readonlyFixtureShown) { readonlyFixtureShown=true; const response=await route.fetch(), data=await response.json(); data.records.push({gameId:"wolong-builtin",editable:false}); return route.fulfill({response,json:data}); }
    return route.continue(); });
  const list = await context.newPage(); let acceptDialog = true;
  list.on("dialog", (d) => acceptDialog ? d.accept() : d.dismiss()); await list.goto(origin+"/");
  await list.waitForSelector('[data-trial="list-trial"]'); assert.equal(await list.isDisabled('[data-trial="list-empty"]'),true);
  assert.equal(await list.locator("#games img").count(),0); assert.match(await list.locator("#games").textContent(),/<img src=x>/);
  assert.match(await list.locator("#games").textContent(),/wolong-builtin：唯讀原件/);
  assert.equal(await list.locator('[data-trial="wolong-builtin"]').count(),0);
  await list.click('[data-trial="list-trial"]'); await list.waitForSelector("#trial-picker"); assert.equal(await list.locator("#trial-chapter-list option").count(),20);
  await list.click("#trial-cancel"); assert.equal(await list.locator("#trial-picker").isVisible(),false); assert.equal(context.pages().length,1);
  await list.click('[data-trial="list-trial"]'); await list.waitForSelector("#trial-picker");
  await list.click('[data-game="list-trial"]'); await list.waitForSelector("#manager"); await list.fill("#edit-name","未存名字");
  acceptDialog=false; await list.click("#trial-start"); acceptDialog=true;
  assert.equal(context.pages().length,1); assert.equal(compileRequests,0); assert.equal(await list.inputValue("#edit-name"),"未存名字");
  await list.evaluate(()=>{window.__savedOpen=window.open;window.open=()=>null;}); await list.click("#trial-start");
  await list.waitForFunction(()=>document.querySelector("#list-status").textContent.includes("視窗被阻擋")); assert.equal(compileRequests,0); assert.equal(context.pages().length,1);
  await list.evaluate(()=>{window.open=window.__savedOpen;}); checks.push("list visible entry/20 chapters/cancel/empty+original disabled/textContent/popup blocker without compile");
  stage="stale fixed revision refuses / own waiting popup closes";
  draft.map.decorations.find((d)=>d.x===10&&d.y===10).definitionRef="tile-16";
  await call("/api/save",{gameId:draft.gameId,expectedRevision:"1",map:draft.map});
  const rejectedPopup=list.waitForEvent("popup"); await list.click("#trial-start"); const rejected=await rejectedPopup;
  await list.waitForFunction(()=>document.querySelector("#list-status").textContent.includes("修訂衝突"));
  if(!rejected.isClosed()) await rejected.waitForEvent("close"); assert.equal(compileRequests,1); assert.equal(await list.locator("#trial-picker").isVisible(),true);
  await list.click("#refresh"); await list.waitForSelector('[data-trial="list-trial"]'); await list.click('[data-trial="list-trial"]'); await list.waitForSelector("#trial-picker");
  await list.selectOption("#trial-chapter-list",draft.chapterOrder[0]);
  stage="real list popup / fixed revision2";
  const popup=list.waitForEvent("popup"); await list.click("#trial-start"); const old=await popup; await boot(old);
  assert.equal(await old.evaluate(()=>window.opener),null); const oldState=await state(old); assert.equal(oldState.tile,16); assert.equal(oldState.identity.draftRevision,"2"); assert.equal(oldState.identity.chapterId,draft.chapterOrder[0]); assert.equal(oldState.idb,0);
  const denied=await old.evaluate(async()=>({save:await window.__app.saveGame(0,"forbidden"),load:await window.__app.loadSave(0),idb:window.__listIDB}));
  assert.deepEqual(denied,{save:{saved:"blocked",reason:"trial"},load:false,idb:0}); assert.deepEqual(await state(old),oldState);
  checks.push("stale compile400 closes own waiting window; retained picker/manual refresh; real App fixed revision2/chapter0/opener null/save+load refuse");
  stage="new saved chapter/revision does not replace old App";
  draft.map.decorations.find((d)=>d.x===10&&d.y===10).definitionRef="tile-32";
  await call("/api/save",{gameId:draft.gameId,expectedRevision:"2",map:draft.map});
  await list.click("#refresh"); await list.waitForSelector('[data-trial="list-trial"]'); await list.click('[data-trial="list-trial"]'); await list.waitForSelector("#trial-picker"); await list.selectOption("#trial-chapter-list",draft.chapterOrder[1]);
  const nextPopup=list.waitForEvent("popup"); await list.click("#trial-start"); const next=await nextPopup; await boot(next);
  const nextState=await state(next); assert.equal(nextState.tile,32); assert.equal(nextState.identity.draftRevision,"3"); assert.equal(nextState.identity.chapterId,draft.chapterOrder[1]); assert.equal(typeof nextState.identity.trialSnapshotId,"string"); assert.notEqual(nextState.identity.trialSnapshotId,oldState.identity.trialSnapshotId); assert.equal(nextState.idb,0);
  assert.deepEqual(await state(old),oldState); assert.equal(await list.evaluate(()=>window.__listIDB),0);
  assert.equal(await list.inputValue("#edit-name"),"未存名字"); assert.equal((await call("/api/game-info?game=list-trial")).metadata.name,"測試遊戲");
  await list.screenshot({path:join(out,"list.png")}); await old.screenshot({path:join(out,"old-app.png")}); await next.screenshot({path:join(out,"new-app.png")});
  await list.close(); assert.deepEqual(await state(old),oldState); assert.deepEqual(await state(next),nextState);
  assert.equal(expectedErrors.length,1); assert.deepEqual(responses400,[origin+"/api/compile"]); assert.deepEqual(errors,[]); assert.deepEqual(forbidden,[]); assert.deepEqual(hashes(),before);
  checks.push("two actual App snapshots/chapters/tile16 vs32; old state+RAM+RNG unchanged; closing list does not terminate; IDB0/only explicit stale400");
  const tools=["tools/verify_editor_list_trial_browser.mjs","web/src/editor/listtrial.js","web/src/editor/games.js","web/editor-games.html","tools/editor_server.mjs","web/src/main.js","web/src/editor/trialapp.js","web/src/editor/trialpolicy.js","web/src/content/authoring/trialruntime.js"];
  writeFileSync(join(out,"receipt.json"),JSON.stringify({result:"PASS-LOCAL-LIST-TRIAL-BROWSER",checks,resources:before,toolHashes:Object.fromEntries(tools.map(p=>[p,sha(readFileSync(p))])),identities:[oldState.identity,nextState.identity],compileRequests,expectedErrors,errors,forbidden,artifacts:["list.png","old-app.png","new-app.png"],limits:"No auth/backend/full asset closure/network gates/whole-campaign/native lifecycle callback certificate"},null,2)+"\n",{flag:"wx"});
  process.stdout.write("PASS LOCAL LIST TRIAL BROWSER / two real App snapshots / IDB0 / one expected stale400\n");
} catch(error) { writeFileSync(join(out,"failure.json"),JSON.stringify({stage,error:String(error),stack:error.stack,errors,expectedErrors,forbidden},null,2)+"\n",{flag:"wx"}); throw error; }
finally { await browser?.close(); await new Promise(r=>server.close(r)); }
