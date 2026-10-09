// Local shared context across actual modules; owned store/context only, not authenticated editor.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { startEditorServer } from "./editor_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { BUILTIN_ENTITY_SOURCE } from "../web/src/editor/builtinentitysource.generated.js";
const round = process.argv[2]; assert.equal(process.argv.length,3); assert.match(round ?? "", /^[A-Za-z0-9-]{1,64}$/);
const out = join(".dragon-analysis/editor-phase",round); mkdirSync(out);
const sha = b => createHash("sha256").update(b).digest("hex"), prefix = "web/content/builtin/compiled/"+BUILTIN_RESOURCES.world.revision+"/";
function fixtureJSON(bytes) { try { return JSON.parse(bytes.toString()); } catch (cause) { throw new Error("invalid fixed navigation manifest fixture", { cause }); } }
const manifest = fixtureJSON(readFileSync(prefix+"manifest.json"));
const paths = [prefix+"manifest.json",...manifest.assets.map(a=>prefix+a.path),... [BUILTIN_ENTITY_SOURCE.manifestURL,BUILTIN_ENTITY_SOURCE.resourceURL].map(p=>"web/"+p)];
const resources = Object.fromEntries(paths.map(p=>[p,sha(readFileSync(p))]));
const store = mkdtempSync(join(tmpdir(),"dragon-navigation-")), server = await startEditorServer(0,store), origin = `http://127.0.0.1:${server.address().port}`;
const tools = ["tools/verify_editor_navigation_browser.mjs","tools/editor_server.mjs","web/src/editor/navigation.js","web/src/editor/games.js","web/src/editor/studio.js","web/src/editor/entities.js","web/editor-games.html","web/editor-studio.html","web/editor-entities.html"];
const hashes = Object.fromEntries(tools.map(p=>[p,sha(readFileSync(p))]));
async function api(path, body) { const init={method:body===undefined?"GET":"POST",headers:{"content-type":"application/json",connection:"close"},signal:AbortSignal.timeout(120000)}; if(body!==undefined)init.body=JSON.stringify(body);const r=await fetch(origin+path,init);assert.equal(r.status,200,path);return r.json(); }
const { chromium }=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||"C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const browserEnv={};for(const key of ["SystemRoot","WINDIR","COMSPEC","PATH","PATHEXT","TEMP","TMP","USERPROFILE","LOCALAPPDATA","APPDATA","HOMEDRIVE","HOMEPATH"])if(process.env[key]!==undefined)browserEnv[key]=process.env[key];
let browser, stage="copy", failNextList=false;const errors=[],forbidden=[],expectedErrors=[],checks=[],requests=[];
try {
  await api("/api/copy",{gameId:"nav-a",kind:"full",ownerId:"local",metadata:{name:"<img>",introduction:"文字"}});
  await api("/api/copy",{gameId:"nav-b",kind:"minimal",ownerId:"local",metadata:{name:"另一份",introduction:""}});
  const storedBefore=Object.fromEntries(["nav-a","nav-b"].map(id=>[id,sha(readFileSync(join(store,id,"gamesource.json")))]));
  browser=await chromium.launch({headless:true,env:browserEnv});const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(()=>{window.__navigationIDB=0;indexedDB.open=()=>{window.__navigationIDB++;throw new Error("formal IDB forbidden");};});
  await context.route("**/*",async route=>{const url=new URL(route.request().url());requests.push(url.href);
    if(url.origin!==origin||/save\.dat|\.dragon-analysis|\/mmap_map\.bin$|\/road_graph\.json$|\/src\/boot\.js$/i.test(url.pathname)){forbidden.push(url.href);return route.abort();}
    if(url.pathname==="/api/games"){
      if(failNextList){failNextList=false;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"owned navigation list fixture unavailable"})});}
      const r=await route.fetch(),data=await r.json();data.records.push({gameId:"readonly-template",editable:false}); // Explicit DTO fixture, not actual builtin enumeration/auth.
      return route.fulfill({response:r,json:data});
    }return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(120000);
  page.on("pageerror",e=>errors.push(String(e)));page.on("console",m=>{if(m.type()==="error"&&!m.location().url?.endsWith("/favicon.ico")){if(m.text().includes("503"))expectedErrors.push(m.text());else errors.push(m.text());}});
  async function contextReady(id){await page.waitForFunction(id=>{const select=document.querySelector("#current-game");return select&&!select.disabled&&select.value===id;},id);}
  async function studioReady(id){await page.waitForFunction(id=>window.__studio?.draft.gameId===id,id);await contextReady(id);}
  async function draftDigest(){return page.evaluate(async()=>{const b=new TextEncoder().encode(JSON.stringify(window.__studio.draft));return [...new Uint8Array(await crypto.subtle.digest("SHA-256",b))].map(v=>v.toString(16).padStart(2,"0")).join("");});}
  async function point(x,y){await page.locator("#cv").scrollIntoViewIfNeeded();const p=await page.locator("#cv").evaluate((c,[x,y])=>{const r=c.getBoundingClientRect(),u=window.__studio;return [r.left+c.clientLeft+(x*16+8-u.cam.x)*u.zoom,r.top+c.clientTop+(y*16+8-u.cam.y)*u.zoom];},[x,y]);await page.mouse.click(...p);}
  stage="empty game-level shell / readonly DTO / author text";await page.goto(origin+"/?game=");await contextReady("");
  assert.equal(await page.locator("#manager").isHidden(),true);
  assert.equal(await page.locator('#editor-navigation a[aria-disabled="true"]').count(),2);assert.equal(await page.locator("#editor-navigation select").count(),1);
  assert.equal(await page.locator('#current-game option[value="readonly-template"]').count(),0);assert.equal(await page.locator("#editor-navigation img").count(),0);
  assert.equal(await page.locator('#current-game option[value="nav-a"]').textContent(),"<img>");
  await page.selectOption("#current-game","nav-a");await contextReady("nav-a");await page.waitForSelector("#manager:not([hidden])");
  assert.equal(new URL(page.url()).searchParams.get("game"),"nav-a");assert.equal(await page.inputValue("#edit-name"),"<img>");
  checks.push("empty context disables map/source; readonly DTO excluded; author textContent; selection opens actual game manager");
  stage="game/map/source context / current link no navigation";await page.click('#editor-navigation [data-module="map"]');await studioReady("nav-a");
  const originalDraft=await draftDigest();await page.click('#editor-navigation [data-module="map"]');assert.equal(await draftDigest(),originalDraft);
  const bounds=await page.evaluate(()=>{const n=document.querySelector("#editor-navigation").getBoundingClientRect(),c=document.querySelector("#cv").getBoundingClientRect(),a=document.querySelector("#layout aside").getBoundingClientRect();return {navRight:n.right,canvasLeft:c.left,asideRight:a.right,width:innerWidth};});assert.ok(bounds.navRight<bounds.canvasLeft);assert.ok(bounds.asideRight<=bounds.width);
  checks.push("actual map same game; current module no-op; left menu/main right with visible canvas/aside");
  stage="dirty map context cancel/accept / no implicit save";await page.click('#tools [data-tool="grass"]');await point(10,10);assert.equal(await page.evaluate(()=>window.__studio.dirty),true);const changedDraft=await draftDigest();
  page.once("dialog",d=>d.dismiss());await page.selectOption("#current-game","nav-b");await contextReady("nav-a");assert.equal(new URL(page.url()).searchParams.get("game"),"nav-a");assert.equal(await draftDigest(),changedDraft);
  page.once("dialog",d=>d.accept());await page.selectOption("#current-game","nav-b");await studioReady("nav-b");assert.equal(await page.evaluate(()=>window.__studio.dirty),false);
  checks.push("native beforeunload cancellation preserves draft/context label; confirmed different-game navigation new realm, no automatic save");
  stage="source context / existing chapter selection only";await page.click('#editor-navigation [data-module="sources"]');await contextReady("nav-b");await page.waitForFunction(()=>document.querySelector("#status").textContent.includes("未保存完整人物來源"));
  await page.selectOption("#current-game","nav-a");await contextReady("nav-a");await page.waitForFunction(()=>document.querySelectorAll("#records tr").length===128);
  assert.equal(await page.locator("#chapter option").count(),20);const chapter=await page.locator("#chapter option").nth(15).getAttribute("value");await page.selectOption("#chapter",chapter);await page.waitForFunction(id=>document.querySelector("#chapter").value===id&&document.querySelectorAll("#records tr").length===128,chapter);
  assert.match(await page.locator("#identity").textContent(),/nav-a/);assert.equal(await page.locator("#editor-navigation select").count(),1);
  await page.screenshot({path:join(out,"source-context.png")});checks.push("minimal source remains explicitly unavailable; full source same game128/20 chapters; no game-level chapter selector");
  stage="game metadata dirty cancel/accept / context synchronization";await page.click('#editor-navigation [data-module="games"]');await contextReady("nav-a");await page.waitForSelector("#manager:not([hidden])");
  await page.fill("#edit-name","未保存");page.once("dialog",d=>d.dismiss());await page.click('#editor-navigation [data-module="sources"]');assert.equal(await page.inputValue("#edit-name"),"未保存");assert.equal(new URL(page.url()).pathname,"/");
  page.once("dialog",d=>d.accept());await page.click('#editor-navigation [data-module="sources"]');await contextReady("nav-a");await page.waitForFunction(()=>document.querySelectorAll("#records tr").length===128);
  await page.click('#editor-navigation [data-module="games"]');await contextReady("nav-a");await page.waitForSelector("#manager:not([hidden])");assert.equal(await page.inputValue("#edit-name"),"<img>");
  await page.click('button[data-game="nav-b"]');await contextReady("nav-b");assert.ok((await page.locator('#editor-navigation [data-module="map"]').getAttribute("href")).includes("game=nav-b"));
  assert.equal(new URL(page.url()).searchParams.get("game"),"nav-b");await page.reload();await contextReady("nav-b");await page.waitForSelector("#manager:not([hidden])");assert.equal(await page.inputValue("#edit-name"),"另一份");
  checks.push("metadata native dirty guard; no automatic save; existing manage button synchronizes module context and canonical URL/reload");
  stage="list failure isolated/manual retry / desktop1024";failNextList=true;await page.goto(origin+"/?game=nav-a");await page.waitForFunction(()=>document.querySelector("#editor-navigation p").textContent.includes("被拒絕"));await page.waitForSelector("#manager:not([hidden])");assert.equal(await page.inputValue("#edit-name"),"<img>");
  await page.click("#refresh-context");await contextReady("nav-a");await page.waitForFunction(()=>document.querySelector("#editor-navigation p").textContent.includes("切換遊戲"));
  await page.click('#editor-navigation [data-module="map"]');await studioReady("nav-a");await page.setViewportSize({width:1024,height:768});await page.waitForFunction(()=>document.querySelector("#cv").width===544);
  const right=await page.locator("#layout aside").boundingBox();assert.ok(right.x+right.width<=1024);await page.screenshot({path:join(out,"map-context.png")});
  assert.equal(await page.evaluate(()=>window.__navigationIDB),0);assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);assert.equal(expectedErrors.length,1);
  for(const[id,h]of Object.entries(storedBefore))assert.equal(sha(readFileSync(join(store,id,"gamesource.json"))),h);
  for(const[p,h]of Object.entries({...resources,...hashes}))assert.equal(sha(readFileSync(p)),h);
  checks.push("navigation503 isolated from actual manager; explicit retry;1280/1024 main-window bounds; source files unchanged/IDB0/outside0");
  writeFileSync(join(out,"receipt.json"),JSON.stringify({result:"PASS-LOCAL-EDITOR-CONTEXT-THREE-MODULES",checks,hashes,resources,storedBefore,errors,expectedErrors,forbidden,requests,idbAccesses:0,artifactPaths:["source-context.png","map-context.png"],limits:"Local3existing modules only; readonly DTO fixture not builtin list/auth; native beforeunload exercised, not all platforms; no editable entity/chapter/new initializer/private resource/network/publish completeness."},null,2)+"\n",{flag:"wx"});process.stdout.write(JSON.stringify({result:"PASS-LOCAL-EDITOR-CONTEXT-THREE-MODULES",groups:checks.length,idb:0,errors:0,expected503:1})+"\n");
} catch(error){writeFileSync(join(out,"failure.json"),JSON.stringify({stage,error:String(error),stack:error.stack,checks,errors,expectedErrors,forbidden},null,2)+"\n",{flag:"wx"});throw error;}
finally {await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
