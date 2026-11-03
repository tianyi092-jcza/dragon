// B1 shell verification: login-only home, left menu + main window wiring,
// view/role gating, dirty-leave prompt. Static (no runtime); live miniflare
// smoke covers serving separately.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const checks = [];
const check = (name, cond) => {
	assert.ok(cond, name);
	checks.push(name);
};
const html = readFileSync("server/public/index.html", "utf-8");
const client = readFileSync("server/public/client.txt", "utf-8");
const css = readFileSync("server/public/style.css", "utf-8");
const shell = readFileSync('editor-ui/src/Workbench.vue', 'utf-8');
const application = readFileSync('server/editorapp.js', 'utf-8');
const accountViews = ['LoginPage', 'AccountPages', 'AccountsPanel'].map(name => readFileSync(`editor-ui/src/${name}.vue`, 'utf-8')).join('\n');
const draftView = readFileSync('editor-ui/src/DraftPanel.vue', 'utf-8');
const chaptersView = readFileSync('editor-ui/src/ChaptersPanel.vue', 'utf-8');
const stageAssetsView = readFileSync('editor-ui/src/StageAssetsPanel.vue', 'utf-8') + readFileSync('editor-ui/src/StageJobsPanel.vue', 'utf-8');
const libraryView = readFileSync('editor-ui/src/LibraryPanel.vue', 'utf-8');
const strongholdView = readFileSync('editor-ui/src/StrongholdPanel.vue', 'utf-8');
const mapView = readFileSync('editor-ui/src/MapPanel.vue', 'utf-8');
const catalogView = readFileSync('editor-ui/src/CatalogPanel.vue', 'utf-8');
const generalsView = readFileSync('editor-ui/src/GeneralsPanel.vue', 'utf-8');
const copyView = readFileSync('editor-ui/src/CopyPanel.vue', 'utf-8');
const publishView = readFileSync('editor-ui/src/PublishPanel.vue', 'utf-8');
// 已取消界面的孤立組件（ManagementPanel／DeletionPanel／Stage*／Library）不再供給任何 id：
// 它們不在出貨殼內，讀它們只會製造「面板存在」的假通過。
const reviewView = readFileSync('editor-ui/src/ReviewPanel.vue', 'utf-8');
const copyGameView = readFileSync('editor-ui/src/CopyGamePanel.vue', 'utf-8');
const htmlIds = new Set([...(reviewView + copyGameView + publishView + copyView + html + shell + accountViews + draftView + chaptersView + stageAssetsView + libraryView + strongholdView + mapView + catalogView + generalsView).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
// Login home: login form + hidden session/menu; no business content outside.
check("login-form", accountViews.includes('<form id="login">'));
check("menu-nav", shell.includes('<aside id="menu"') && shell.includes(':hidden="!ready"'));
check("shell-layout", html.includes('id="editor-app"') && !html.includes('id="main"') && !shell.includes('business-host'));
check("session-hidden", shell.includes('<section id="session" :hidden="!state.authenticated">'));
// Every menu view maps to a real section id. The UI list follows the approved
// three-level workbench structure; cancelled modules keep server capability.
	// 視圖 id 與面板根節點 id 不是同一件事（歷史名 management-editor 渲染 ReviewPanel 的 review-editor），
	// 因此逐項登記面板組件，並要求出貨殼真的 import 該組件、且用同一視圖 id 控制顯示。
	const viewPanels = { "copy": ["CopyPanel", "copy"], "draft-editor": ["DraftPanel", "draft-editor"], "admin": ["AccountsPanel", "admin"], "catalog-editor": ["CatalogPanel", "catalog-editor"], "stronghold-editor": ["StrongholdPanel", "stronghold-editor"], "mapview-editor": ["MapPanel", "mapview-editor"], "generals-editor": ["GeneralsPanel", "generals-editor"], "chapters-editor": ["ChaptersPanel", "chapters-editor"], "publish-editor": ["PublishPanel", "publish-editor"], "management-editor": ["ReviewPanel", "review-editor"], "copy-game-editor": ["CopyGamePanel", "copy-game-editor"] };
	for (const [id, [component, root]] of Object.entries(viewPanels)) {
		check(`view-section:${id}`, htmlIds.has(root) && client.includes(`'${id}'`) && shell.includes(`import ${component} from './${component}.vue'`) && shell.includes(`state.view !== '${id}'`));
	}
// Menu labels are fixed by the product contract.
for (const label of ["新建遊戲", "遊戲管理", "用戶管理", "系統資源", "城池據點", "地圖管理", "武將管理", "遊戲章節", "上架管理", "上架審核", "複製遊戲"]) {
	check(`view-label:${label}`, client.includes(`'${label}'`));
}
check("menu-groups", ["workbench", "game", "admin"].every(group => client.includes(`'${group}'`)) && shell.includes("'工作台級'") && shell.includes("'遊戲級'"));
check("cancelled-views-absent", !["stage-editor", "stage-assets-editor", "library-editor", "deletion-editor"].some(id => client.includes(`'${id}'`)) && !shell.includes("stage-assets-editor") && !shell.includes('id="library-editor"'));
check("current-game-selector", shell.includes('id="current-game"') && shell.includes("props.draft.chooseGame(event.target.value)") && readFileSync("server/public/draft.txt", "utf-8").includes("function chooseGame"));
// Role gate: admin view withheld from non-admin/must-change; menu hidden anon.
check("role-gate", client.includes("!current || current.user.mustChangePassword") && client.includes("!item[2] || current.user.role === 'admin'"));
check("session-gate", shell.includes('state.authenticated && !props.state.mustChange') && shell.includes(':hidden="!ready || !state.admin || state.view'));
// §4.7 dirty-leave prompt.
check("beforeunload", client.includes("beforeunload") && client.includes("canLeave()"));
// Every q('id') lookup in client resolves to an id present in some served page.
const lookups = [...client.matchAll(/q\('([^']+)'\)/g)].map((m) => m[1]);
const extraPages = ["server/public/draft.txt", "server/public/stage.txt", "server/public/library.txt", "server/public/catalog.txt", "server/public/management.txt", "server/public/stageassets.txt"].map((f) => readFileSync(f, "utf-8")).join("\n");
for (const id of new Set(lookups)) {
	check(`lookup:${id}`, htmlIds.has(id) || extraPages.includes(`id="${id}"`));
}
// Account page is exclusively Vue-owned; the native bridge must not rewrite it.
check('accounts-vue-owned', !html.includes('id="admin"') && accountViews.includes('<table id="accounts">') && !client.includes('q(id).hidden') && shell.includes("state.view !== 'admin'"));
check('accounts-controller', client.includes('createAccountController({ api, authority: () => current, work: run') && !client.includes("q('accounts').replaceChildren"));
check('accounts-dirty', client.includes('shell.accountDirty()'));
check('copy-vue-owned', !html.includes('id="copy"') && copyView.includes('id="own-games"') && !client.includes("q('copy-state')"));
check('copy-controller', client.includes('createCopyController({api') && client.includes('copyUI.canLeave(forUnload)') && copyView.includes('game.gameId'));
// B6（工作台結構合同 §2）：工作台級「新建遊戲」只複製地圖（章節與武將庫空），
// 管理員「複製遊戲」才走既有 /api/admin/copies 整套複製；兩者共用一份協議實現。
check("copy-create-map-only", copyView.includes('只複製底層地圖') && readFileSync('server/editorapp.js', 'utf-8').includes('profileRevision: FIXED_TEMPLATE_PROFILE'));
check("copy-mode-split", (() => { const c = readFileSync('editor-ui/src/copy.js', 'utf-8'); return c.includes("mode = 'minimal'") && c.includes("reservePath = full ? '/api/admin/copies' : '/api/games'") && c.includes("'/api/admin/source'") && c.includes('editor-fullcopy-operation:'); })());
check("admin-fullcopy-ui", copyGameView.includes('id="copy-game-editor"') && copyGameView.includes('id="full-copy-create"') && !draftView.includes('id="draft-full-copy"') && shell.includes(':model="fullCopyModel" :actions="fullCopy"') && client.includes("mode: 'full'") && client.includes('shell.fullCopy') && client.includes('fullCopyUI.canLeave(forUnload)') && client.includes('fullCopyUI.pagehide()'));
// Menu CSS present.
check("menu-css", css.includes("#menu") && css.includes(".workbench") && css.includes('.workbench [hidden]') && !css.includes('#main'));
// B2 (§4.6): profile route + last-admin guard + dto fields.
check("profile-route", application.includes("/api/auth/profile"));
check("admin-last", application.includes("ADMIN_LAST"));
check("profile-form", htmlIds.has("profile") && client.includes("q('profile')"));
// B3 (§4.1): creator listing API + deletion routes + list UI columns/actions.
check("set-listed", readFileSync("server/metadata.js", "utf-8").includes("setListed(tokenHash, gameId, listed, expectedRowRevision)"));
check("listing-restricted", readFileSync("server/metadata.js", "utf-8").includes("LISTING_RESTRICTED"));
check("deletion-routes", application.includes("/deletion(-operations") && application.includes("deletionFence.begin") && application.includes("deletionFence.query"));
check("own-games-columns", (() => { const copy = readFileSync('editor-ui/src/copy.js', 'utf-8'); return copy.includes('createdAt') && copy.includes('modifiedAt') && copy.includes('管理限制，須管理員解除') && copyView.includes('game.label'); })());
check("trial-jump", client.includes("gotoGame") && readFileSync("server/public/draft.txt", "utf-8").includes("async function gotoGame"));
check("delete-confirm", (() => { const management = readFileSync('server/public/management.txt', 'utf-8'); return management.includes('confirmationName') && management.includes('已上架遊戲不能刪除'); })());
check("management-dates", readFileSync("server/public/management.txt", "utf-8").includes("g.createdAt"));
// B4b (§4.2): city reference helpers + stronghold section wiring.
check("city-refs", readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("export function cityReferences") && readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("export function checkCityDeletable") && readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("CITY_COUNT_LOCKED"));
check("stronghold-section", htmlIds.has("stronghold-editor") && htmlIds.has("stronghold-cities") && client.includes("installStronghold") && application.includes("/stronghold.js"));
// B4c1 (§4.3): general field/portrait ops + generals section wiring.
check("general-ops", readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("export function renameGeneral") && readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("export function checkGeneralDeletable") && readFileSync("server/drafts.js", "utf-8").includes("'rename-general'") && readFileSync("server/drafts.js", "utf-8").includes("'portrait'"));
check("generals-section", htmlIds.has("generals-editor") && htmlIds.has("generals-chapters") && client.includes("installGenerals") && application.includes("/general.js"));
// B4c2 (§4.3): faction post ops + faction panel.
check("faction-ops", readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("export function setMonarch") && readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("export function setStrategist") && readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("export function removeMonarch") && readFileSync("web/src/content/authoring/gamesource.js", "utf-8").includes("export function disbandFaction") && readFileSync("server/drafts.js", "utf-8").includes("'set-monarch'") && readFileSync("server/drafts.js", "utf-8").includes("'disband-faction'"));
check("faction-panel", !generalsView.includes('actions.faction(') && generalsView.includes('data-native-faction-disband') && generalsView.includes('draftActions.disbandFaction(') && readFileSync('server/public/draft.txt', 'utf-8').includes('disbandFaction:') && generalsView.includes('data-native-advisor-assign') && generalsView.includes('draftActions.assignStrategist(') && readFileSync('server/public/draft.txt', 'utf-8').includes('assignStrategist:') && generalsView.includes('data-native-monarch-assign') && generalsView.includes('draftActions.assignMonarch(') && readFileSync('server/public/draft.txt', 'utf-8').includes('assignMonarch:') && generalsView.includes('data-native-monarch-succeed') && generalsView.includes('draftActions.succeedMonarch(') && readFileSync('server/public/draft.txt', 'utf-8').includes('succeedMonarch:'));
// B4d1 (§4.4): read-only schematic map viewer wiring.
check("mapview-section", htmlIds.has("mapview-editor") && htmlIds.has("mapview-canvas") && client.includes("installMapViewer") && application.includes("/mapview.js"));
// BOOT-1: draft read receipt carries rosters + map for the list UIs.
check("receipt-rosters", readFileSync("server/drafts.js", "utf-8").includes("generals: st.generals.map") && readFileSync("server/drafts.js", "utf-8").includes("strongholds:") && readFileSync("server/drafts.js", "utf-8").includes("map: { placements:"));
// BOOT-1 fixes: chapter-edit allowlist (profile revert + chain history),
// per-chapter pack rows, listing gate order, If-Match regex.
check("profile-allowlist", readFileSync("server/copyprofile.js", "utf-8").includes("revertAppliedChapterEdits") && readFileSync("server/drafts.js", "utf-8").includes("#editHistory") && readFileSync("server/drafts.js", "utf-8").includes("value.chapterEdits"));
check("pack-chapters", readFileSync("server/playpacks.js", "utf-8").includes("published_pack_chapters") && readFileSync("server/deletionfence.js", "utf-8").includes("published_pack_chapters"));
check("listing-gate", (() => { const w = application; const mgmt = w.slice(w.indexOf("async #postManagement")); return mgmt.indexOf("MANAGEMENT_ACTION") < mgmt.indexOf("fields(value, ['action', 'expectedRowRevision'])"); })());
check("unlist-regex", (() => { const w = application; const admin = w.slice(w.indexOf("async #postAdminUnlist")); return admin.includes('/^"([1-9][0-9]*)"$/') && !admin.includes('$"/'); })());
check("profile-status", htmlIds.has("profile-status"));
// B決策：共用画像庫（manifest 唯讀，無上傳／刪除／逐遊戲表）。
check("portrait-routes", (() => { const w = application; return w.includes("portraits(?:\\/([A-Za-z0-9]{1,32})(?:\\/(bytes))?)?") && w.includes("#getPortraits") && !w.includes("#postPortraitUpload") && !w.includes("#postPortraitDelete"); })());
check("portrait-pack", (() => { const p = readFileSync("server/playpacks.js", "utf-8"); return p.includes("#freezePortraits") && p.includes("manifest.portraits") && p.includes("role: 'game-portrait'") && p.includes("kao/${row.assetId}.png"); })());
check("portrait-ui", htmlIds.has("portrait-pick") && htmlIds.has("portrait-library") && !htmlIds.has("portrait-file") && generalsView.includes('id="portrait-pick"') && readFileSync("server/public/general.txt", "utf-8").includes('selectPortrait(value)'));
// BOOT-1 truth: disband revert inserts by baseline relative order (not baseline
// index — history-compacted arrays misalign); copy-match is order-insensitive.
check("disband-order", (() => { const c = readFileSync("server/copyprofile.js", "utf-8"); const from = c.indexOf("const revertDisband"), to = c.indexOf("const revertCreateFaction", from + 1); const fn = c.slice(from, to > from ? to : undefined); return fn.includes("order.indexOf(factionIdx)") && !fn.includes("findIndex(f => f?.idx === factionIdx)"); })());
check("copy-order-free", (() => { const c = readFileSync("server/copyprofile.js", "utf-8"); const seg = c.slice(c.indexOf("// Order-insensitive")); return seg.includes("compare(baseRest, rest, replacements)") && seg.includes("editChapterResources(shell, e.chapterId, oldState.factions[slot].idx, requested)"); })());
// B4a (§4.5): chapter CRUD fns + save-pipeline ops + gaps receipt + no-chapter publish gate + UI.
const gamesource = readFileSync("web/src/content/authoring/gamesource.js", "utf-8");
const drafts = readFileSync("server/drafts.js", "utf-8");
const draft = readFileSync("server/public/draft.txt", "utf-8");
check("chapter-fns", gamesource.includes("export function addBlankChapter") && gamesource.includes("export function copyChapterInGame") && gamesource.includes("export function deleteChapter") && gamesource.includes("export function renameChapter") && gamesource.includes("export function chapterGapCounts"));
check("chapter-edits-pipe", drafts.includes("DRAFT_CHAPTER_EDITS") && drafts.includes("DRAFT_CHAPTER_EDIT") && drafts.includes("gaps: chapterGapReport(st, id)") && readFileSync("server/chaptergapreport.js", "utf-8").includes("chapterActiveGaps(state, chapterId)"));
check("no-chapter-gate", application.includes("!captured.game.chapterOrder.length"));
check("chapter-ui", htmlIds.has("draft-chapters") && draft.includes("submitChapters") && draftView.includes('actions.chapter') && draft.includes("chapterAction"));
check('draft-vue-owned', !html.includes('id="draft-editor"') && !draft.includes('document.') && !draft.includes('createElement') && draftView.includes('@submit.prevent="actions.save()"'));
check('draft-display-projection', draft.includes('publish({') && client.includes('publish: model => shell.draft(model)'));
check('workspace-context', shell.includes('id="workspace-context"') && shell.includes('其它模組已選的精確目標不會自動替換'));
check('stage-vue-owned', !html.includes('id="stage-editor"') && !readFileSync('server/public/stage.txt', 'utf-8').includes('getElementById') && stageAssetsView.includes('actions.choosePurpose'));
check('stage-assets-vue-owned', !html.includes('id="stage-assets-editor"') && !readFileSync('server/public/stageassets.txt', 'utf-8').includes('document.') && stageAssetsView.includes('model.outputs'));
check('publish-vue-owned', !html.includes('id="publish-editor"') && !readFileSync('server/public/publish.txt', 'utf-8').includes('document.') && publishView.includes('actions.publish(row.gameId)') && publishView.includes('actions.remove(row.gameId, row.rowRevision)'));
// 刪除動作已併入「上架管理／上架審核」（工作台結構 §3），孤立組件不再參與這條判據。
check('management-deletion-vue-owned', !html.includes('<section') && !readFileSync('server/public/management.txt','utf-8').includes('document.') && (reviewView + publishView).includes('row.rowRevision'));
// B4 (§7): chapter attributes — start date era + city affiliation/capital +
// general affiliation/diplomat, each with its own save-pipeline op and revert.
check("chapter-attribute-writers", ["setChapterStart", "setChapterCityFaction", "setFactionCapital", "setChapterGeneralFaction", "setFactionDiplomat"].every(name => gamesource.includes(`export function ${name}`)));
check("chapter-attribute-pipe", ["'start-date'", "'city-faction'", "'set-capital'", "'general-faction'", "'set-diplomat'"].every(op => drafts.includes(op)) && drafts.includes("era: st.start.era ?? null") && drafts.includes("diplomat_idx: f.diplomat_idx ?? null"));
check("chapter-attribute-revert", (() => { const c = readFileSync("server/copyprofile.js", "utf-8"); return ["'start-date'", "'city-faction'", "'set-capital'", "'general-faction'", "'set-diplomat'"].every(op => c.includes(op)) && c.includes("revertCityFaction") && c.includes("revertFactionByte"); })());
check("chapter-attribute-controller", ["saveChapterStart:", "cityFaction:", "setCapital:", "generalFaction:", "setDiplomat:", "setStartInput"].every(name => draft.includes(name)) && draft.includes("attributes: {") && draft.includes("heldPosts(") && draft.includes("startInputs"));
check("chapter-attributes-ui", htmlIds.has("chapters-editor") && ["data-start-era", "data-start-save", "data-start-cancel", "data-city-faction", "data-city-capital", "data-general-faction", "data-faction-diplomat"].every(name => chaptersView.includes(name)) && !chaptersView.includes('document.'));
process.stdout.write(`editor shell matrix PASS ${checks.length} checks\n`);
