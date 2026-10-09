import { normalizeGameMetadata } from "./gamemetadata.js";
import { launchListTrial } from "./listtrial.js";
import { mountEditorNavigation } from "./navigation.js";
const initialGame = new URLSearchParams(location.search).get("game") || null;
const navigation = mountEditorNavigation({ moduleKey: "games", gameId: initialGame });
const $ = (id) => document.getElementById(id);
let selected = null, savedText = "", busy = false, trialChoice = null;
function values() { return { name: $("edit-name").value, introduction: $("edit-introduction").value }; }
function dirty() { return selected !== null && JSON.stringify(values()) !== savedText; }
function setBusy(value) { busy = value; for (const id of ["full-copy", "minimal-copy", "refresh", "save-metadata", "reload-metadata", "cancel-metadata", "trial-start", "trial-cancel", "trial-chapter-list", "portrait-save", "portrait-clear", "portrait-chapter-list", "portrait-general-list", "portrait-key"]) $(id).disabled = value; $("trial-start").disabled = value || trialChoice === null; }
async function request(path, payload) {
  const init = { cache: "no-store" };
  if (payload !== undefined) { init.method = "POST"; init.headers = { "content-type": "application/json" }; init.body = JSON.stringify(payload); }
  const response = await fetch(path, init), data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
function mayLeave() { return !dirty() || confirm("尚有未保存的遊戲資料；放棄修改？"); }
function show(record) {
  selected = record; navigation.setGame(record.gameId); $("manager").hidden = false;
  $("edit-name").value = record.metadata?.name ?? ""; $("edit-introduction").value = record.metadata?.introduction ?? "";
  savedText = JSON.stringify(values()); $("details").replaceChildren();
  const fields = [["遊戲ID", record.gameId], ["草稿修訂", record.draftRevision], ["建立者占位值（無認證）", record.ownerId ?? "未記錄"],
    ["建立時間（UTC）", record.createdAt ?? "未記錄（舊本地草稿）"], ["修改時間（UTC）", record.modifiedAt ?? "未記錄（舊本地草稿）"],
    ["固定來源修訂", record.sourceRef.revision], ["內容數量", `${record.cityCount}據點／${record.chapterCount}章／${record.waterGroupCount}水域組合`]];
  for (const [label, value] of fields) { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = String(value); $("details").append(dt, dd); }
  $("studio-link").href = `/studio?game=${encodeURIComponent(record.gameId)}`;
  $("entities-link").href = `/entities?game=${encodeURIComponent(record.gameId)}`; $("status").textContent = "";
}
function clearTrialChoice() { trialChoice = null; $("trial-picker").hidden = true; $("trial-chapter-list").replaceChildren(); $("trial-start").disabled = true; }
async function chooseTrial(record) {
  if (busy) return;
  clearTrialChoice(); setBusy(true);
  try {
    const draft = await request(`/api/draft?game=${encodeURIComponent(record.gameId)}`);
    if (draft.gameId !== record.gameId || typeof draft.localModel?.draftRevision !== "string" ||
        !Array.isArray(draft.chapterOrder) || !draft.chapterOrder.length ||
        new Set(draft.chapterOrder).size !== draft.chapterOrder.length ||
        draft.chapterOrder.some((id) => typeof id !== "string" || !id || !Object.hasOwn(draft.chapters ?? {}, id))) throw new Error("缺少可選章節或草稿身份不符");
    for (const id of draft.chapterOrder) { const option = document.createElement("option"); option.value = id;
      const name = draft.chapters[id].state?.name; option.textContent = typeof name === "string" ? name : id; $("trial-chapter-list").append(option); }
    trialChoice = Object.freeze({ gameId: draft.gameId, draftRevision: draft.localModel.draftRevision });
    $("trial-description").textContent = `遊戲 ${trialChoice.gameId}，已保存修訂 ${trialChoice.draftRevision}；章節是否完整仍由共同編譯器檢查。`;
    $("trial-picker").hidden = false; $("list-status").textContent = "請選擇章節，再開啟獨立試運行視窗";
  } catch (error) { $("list-status").textContent = `試運行選擇被拒絕：${error.message}`; }
  finally { setBusy(false); }
}
$("trial-cancel").onclick = () => { if (!busy) clearTrialChoice(); };
$("trial-start").onclick = async () => {
  if (busy || trialChoice === null) return;
  if (selected?.gameId === trialChoice.gameId && dirty() && !confirm("未保存的遊戲資料不包含在試運行中；繼續測試已保存修訂？")) return;
  const binding = { ...trialChoice, chapterId: $("trial-chapter-list").value };
  setBusy(true);
  const openTrialWait = () => {
    const target = "/trial-wait";
    if (!target.startsWith("/") || target.startsWith("//")) throw new Error("僅允許內部試運行路徑");
    return window.open(target, "_blank");
  };
  try {
    const result = await launchListTrial(binding, { openWindow: openTrialWait, compile: (body) => request("/api/compile", body) });
    $("list-status").textContent = result.result === "blocked" ? "視窗被阻擋；請再次點擊開啟，不會取代遊戲清單。" : `已開啟固定修訂 ${result.draftRevision} 的選定章節；正式存讀檔停用`;
  } catch (error) { $("list-status").textContent = `試運行被拒絕：${error.message}；請重新選擇已保存修訂`; }
  finally { setBusy(false); }
};
let portraitDraft = null;
function clearPortraitChoice() { portraitDraft = null; $("portrait-picker").hidden = true; $("portrait-chapter-list").replaceChildren(); $("portrait-general-list").replaceChildren(); $("portrait-key").value = ""; $("portrait-status").textContent = ""; }
function portraitGenerals() { const chapterId = $("portrait-chapter-list").value; const state = portraitDraft?.chapters?.[chapterId]?.state; return Array.isArray(state?.generals) ? state.generals : []; }
function refreshPortraitGenerals() {
  const generals = portraitGenerals(); $("portrait-general-list").replaceChildren();
  for (const general of generals) { const option = document.createElement("option"); option.value = String(general.idx); option.textContent = `#${general.idx} ${general.name ?? "無名"}（byte ${general.portrait}／${general.portraitKey ?? "未綁定"}）`; $("portrait-general-list").append(option); }
  refreshPortraitKey();
}
function refreshPortraitKey() {
  const general = portraitGenerals().find((g) => String(g?.idx) === $("portrait-general-list").value);
  $("portrait-key").value = general?.portraitKey ?? "";
}
async function choosePortrait(record) {
  if (busy) return;
  clearPortraitChoice(); setBusy(true);
  try {
    const draft = await request(`/api/draft?game=${encodeURIComponent(record.gameId)}`);
    if (draft.gameId !== record.gameId || typeof draft.localModel?.draftRevision !== "string" ||
        !Array.isArray(draft.chapterOrder) || !draft.chapterOrder.length ||
        draft.chapterOrder.some((id) => typeof id !== "string" || !id || !Object.hasOwn(draft.chapters ?? {}, id) || !Array.isArray(draft.chapters[id].state?.generals))) throw new Error("缺少武將來源或草稿身份不符");
    for (const id of draft.chapterOrder) { const option = document.createElement("option"); option.value = id; const name = draft.chapters[id].state?.name; option.textContent = typeof name === "string" ? name : id; $("portrait-chapter-list").append(option); }
    portraitDraft = Object.freeze({ gameId: draft.gameId, draftRevision: draft.localModel.draftRevision, chapters: draft.chapters, chapterOrder: draft.chapterOrder });
    refreshPortraitGenerals();
    $("portrait-picker").hidden = false; $("portrait-status").textContent = "試運行上傳的頭像編號填入此處即綁定；清空則清除綁定（数字 byte 不动）。";
  } catch (error) { $("list-status").textContent = `頭像綁定載入被拒絕：${error.message}`; }
  finally { setBusy(false); }
}
async function savePortrait(clear) {
  if (busy || portraitDraft === null) return;
  const raw = clear ? "" : $("portrait-key").value.trim();
  if (raw !== "" && !/^[A-Za-z]{1,32}$/.test(raw)) { $("portrait-status").textContent = "頭像編號須為 1..32 個英文字母。"; return; }
  setBusy(true);
  try {
    const result = await request("/api/general-portrait", { gameId: portraitDraft.gameId, expectedRevision: portraitDraft.draftRevision, chapterId: $("portrait-chapter-list").value, generalIdx: Number($("portrait-general-list").value), portraitKey: raw === "" ? null : raw });
    const draft = await request(`/api/draft?game=${encodeURIComponent(portraitDraft.gameId)}`);
    portraitDraft = Object.freeze({ gameId: draft.gameId, draftRevision: result.draftRevision, chapters: draft.chapters, chapterOrder: draft.chapterOrder });
    refreshPortraitGenerals();
    $("portrait-status").textContent = result.changed ? `已綁定 ${result.portraitKey ?? "（已清除）"}；草稿修訂 ${result.draftRevision}` : "無變化。";
    await list();
  } catch (error) { $("portrait-status").textContent = `綁定被拒絕：${error.message}`; }
  finally { setBusy(false); }
}
$("portrait-chapter-list").onchange = () => { if (!busy && portraitDraft !== null) refreshPortraitGenerals(); };
$("portrait-general-list").onchange = () => { if (!busy && portraitDraft !== null) refreshPortraitKey(); };
$("portrait-save").onclick = () => savePortrait(false);
$("portrait-clear").onclick = () => savePortrait(true);
async function list() {
  clearTrialChoice(); clearPortraitChoice();
  const data = await request("/api/games?details=1"); $("games").replaceChildren();
  for (const record of data.records) {
    const li = document.createElement("li"), text = document.createElement("span");
    if (record.error || !record.editable) { text.textContent = `${record.gameId}：${record.error || "唯讀原件，請先複製"}`; li.append(text); }
    else {
      text.textContent = `${record.metadata?.name || "未命名"} — ${record.metadata?.introduction || "無簡介"}（${record.gameId}，修訂${record.draftRevision}）`;
      const manage = document.createElement("button"), a = document.createElement("a"); manage.textContent = "遊戲資料"; manage.dataset.game = record.gameId;
      manage.onclick = async () => { if (busy || !mayLeave()) return; setBusy(true); try { show(await request(`/api/game-info?game=${encodeURIComponent(record.gameId)}`)); } catch (error) { $("list-status").textContent = error.message; } finally { setBusy(false); } };
      a.textContent = "地圖工作台"; a.href = `/studio?game=${encodeURIComponent(record.gameId)}`; a.onclick = (event) => { if (busy || !mayLeave()) event.preventDefault(); };
      const trial = document.createElement("button"); trial.textContent = "測試運行"; trial.dataset.trial = record.gameId;
      trial.disabled = record.chapterCount === 0; trial.title = trial.disabled ? "尚無章節，不能試運行" : "選擇已保存章節，在新視窗試運行";
      trial.onclick = () => chooseTrial(record);
      const portrait = document.createElement("button"); portrait.textContent = "頭像綁定"; portrait.dataset.portrait = record.gameId;
      portrait.disabled = record.chapterCount === 0; portrait.title = portrait.disabled ? "尚無章節，不能綁定" : "為本遊戲章節武將綁定上傳頭像編號";
      portrait.onclick = () => choosePortrait(record);
      li.append(text, manage, a, trial, portrait);
    }
    $("games").append(li);
  }
  $("list-status").textContent = data.records.length ? "本地草稿，不是正式上架目錄" : "尚無本地副本";
}
for (const [id, kind] of [["full-copy", "full"], ["minimal-copy", "minimal"]]) $(id).onclick = async () => {
  setBusy(true);
  try {
    const metadata = normalizeGameMetadata({ name: $("new-name").value, introduction: $("new-introduction").value });
    await request("/api/copy", { gameId: $("new-game").value, kind, ownerId: "local-test", metadata });
    $("copy-status").textContent = "已複製；請從下方開啟工作台"; await list();
  } catch (error) { $("copy-status").textContent = `複製被拒絕：${error.message}`; }
  finally { setBusy(false); }
};
$("refresh").onclick = async () => { if (busy) return; setBusy(true); try { await list(); } catch (error) { $("list-status").textContent = error.message; } finally { setBusy(false); } };
$("save-metadata").onclick = async () => {
  if (!selected || busy) return;
  const issued = JSON.stringify(values()); setBusy(true);
  try {
    const result = await request("/api/metadata", { gameId: selected.gameId, expectedRevision: selected.draftRevision, metadata: normalizeGameMetadata(values()) });
    const changedDuringSave = JSON.stringify(values()) !== issued, later = values();
    show(result); if (changedDuringSave) { $("edit-name").value = later.name; $("edit-introduction").value = later.introduction; }
    $("status").textContent = changedDuringSave ? "已保存發出時的資料；後續修改仍未保存" : "資料已保存；已開啟的工作台/試運行未替換";
    await list();
  } catch (error) { $("status").textContent = `保存被拒絕：${error.message}；表單已保留，請重新載入後手動合併`; }
  finally { setBusy(false); }
};
$("reload-metadata").onclick = async () => { if (!selected || busy || !mayLeave()) return; setBusy(true); try { show(await request(`/api/game-info?game=${encodeURIComponent(selected.gameId)}`)); } catch (error) { $("status").textContent = error.message; } finally { setBusy(false); } };
$("cancel-metadata").onclick = () => { if (busy || !mayLeave()) return; selected = null; $("manager").hidden = true; };
for (const id of ["studio-link", "entities-link"]) $(id).onclick = (event) => { if (busy || !mayLeave()) event.preventDefault(); };
window.addEventListener("beforeunload", (event) => { if (dirty() || busy) { event.preventDefault(); event.returnValue = ""; } });
list().then(async () => {
  if (initialGame === null) return;
  setBusy(true);
  try { show(await request(`/api/game-info?game=${encodeURIComponent(initialGame)}`)); }
  finally { setBusy(false); }
}).catch((error) => { $("list-status").textContent = `讀取失敗：${error.message}`; });
