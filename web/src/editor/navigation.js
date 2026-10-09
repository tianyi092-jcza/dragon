// Local desktop module shell, not authorization or a draft/session owner.
const routes = Object.freeze({ games: "/", map: "/studio", sources: "/entities" });
const labels = Object.freeze({ games: "遊戲資料", map: "地圖工作台", sources: "來源檢查（唯讀）" });
function gameIdentity(value) {
  if (value !== null && (typeof value !== "string" || !value.length || value.length > 256)) throw new TypeError("遊戲身份不符");
  return value;
}
export function editorNavigationURL(moduleKey, gameId = null) {
  if (!Object.hasOwn(routes, moduleKey)) throw new RangeError("未知編輯模組");
  gameIdentity(gameId);
  if (gameId === null && moduleKey !== "games") throw new RangeError("請先選擇遊戲");
  return routes[moduleKey] + (gameId === null ? "" : "?" + new URLSearchParams({ game: gameId }));
}
export function editorNavigationChoice(moduleKey, currentGame, requestedGame) {
  editorNavigationURL(moduleKey, requestedGame);
  gameIdentity(currentGame);
  return currentGame === requestedGame ? null : editorNavigationURL(moduleKey, requestedGame);
}
export function editableNavigationGames(records) {
  if (!Array.isArray(records)) throw new TypeError("遊戲清單不符");
  const seen = new Set(), result = [];
  for (const record of records) {
    if (!record || typeof record !== "object") throw new TypeError("遊戲清單記錄不符");
    gameIdentity(record.gameId); if (record.gameId === null || seen.has(record.gameId)) throw new TypeError("重複或缺少遊戲身份");
    seen.add(record.gameId);
    if (record.editable !== true || record.error) continue;
    result.push(Object.freeze({ gameId: record.gameId, name: typeof record.metadata?.name === "string" ? record.metadata.name : record.gameId }));
  }
  return Object.freeze(result);
}
export function mountEditorNavigation({ moduleKey, gameId = null }) {
  if (!Object.hasOwn(routes, moduleKey)) throw new RangeError("未知編輯模組");
  gameIdentity(gameId);
  if (document.querySelector("#editor-navigation")) throw new Error("模組選單已裝載");
  let currentGame = gameId, records = [], ticket = 0;
  const style = document.createElement("style");
  style.textContent = 'body.editor-shell{margin-left:184px}#editor-navigation{position:fixed;left:12px;top:12px;width:152px;max-height:calc(100vh - 24px);overflow:auto;overflow-wrap:anywhere;font:14px sans-serif;box-sizing:border-box;padding:8px;border:1px solid #a79d88;background:#eee8dc;z-index:5}#editor-navigation select{width:100%;max-width:100%;font:inherit}#editor-navigation a{display:block;margin:10px 0}#editor-navigation [aria-current=page]{color:#4a7828;font-weight:bold}#editor-navigation [aria-disabled=true]{color:#777;pointer-events:none}#editor-navigation p{font-size:12px}';
  document.head.append(style); document.body.classList.add("editor-shell");
  const root = document.createElement("nav"); root.id = "editor-navigation"; root.setAttribute("aria-label", "編輯模組");
  const label = document.createElement("label"), select = document.createElement("select"), status = document.createElement("p"), refresh = document.createElement("button");
  select.id = "current-game"; select.setAttribute("aria-label", "目前遊戲"); label.textContent = "目前遊戲"; label.append(select);
  refresh.type = "button"; refresh.textContent = "重載遊戲清單"; refresh.id = "refresh-context";
  root.append(label, refresh, status); const links = new Map();
  for (const key of Object.keys(routes)) {
    const link = document.createElement("a"); link.textContent = labels[key]; link.dataset.module = key;
    if (key === moduleKey) { link.setAttribute("aria-current", "page"); link.onclick = event => event.preventDefault(); } root.append(link); links.set(key, link);
  }
  const notice = document.createElement("p"); notice.textContent = "無認證本地模組。章節可寫資料、據點／武將管理與帳戶尚未接入；切換不保存或替換已開對局。"; root.append(notice); document.body.prepend(root);
  function render() {
    select.replaceChildren(); const empty = document.createElement("option"); empty.value = ""; empty.textContent = "請選遊戲"; empty.disabled = moduleKey !== "games"; select.append(empty);
    for (const row of records) { const option = document.createElement("option"); option.value = row.gameId; option.textContent = row.name; select.append(option); }
    if (currentGame !== null && !records.some(row => row.gameId === currentGame)) { const option = document.createElement("option"); option.value = currentGame; option.textContent = currentGame + "（未列可編輯）"; option.disabled = true; select.append(option); }
    select.value = currentGame ?? "";
    for (const [key, link] of links) {
      const disabled = currentGame === null && key !== "games"; link.setAttribute("aria-disabled", String(disabled));
      if (disabled) link.removeAttribute("href"); else link.href = editorNavigationURL(key, currentGame);
    }
  }
  select.onchange = () => {
    const requested = select.value || null; select.value = currentGame ?? ""; // Cancelled beforeunload must not leave a false new context label.
    const next = editorNavigationChoice(moduleKey, currentGame, requested); if (next !== null) location.assign(next);
  };
  async function refreshList() {
    const issued = ++ticket; select.disabled = true; status.textContent = "讀取本地遊戲清單…";
    try {
      const response = await fetch("/api/games?details=1", { cache: "no-store" }), data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "清單讀取失敗");
      const next = editableNavigationGames(data.records); if (issued !== ticket) return;
      records = next; render(); status.textContent = "切換遊戲會離開目前頁面，不熱換來源。";
    } catch (error) { if (issued === ticket) status.textContent = "模組清單被拒絕：" + error.message; }
    finally { if (issued === ticket) select.disabled = false; }
  }
  refresh.onclick = refreshList; render(); const ready = refreshList();
  return Object.freeze({ ready, setGame(value) { const url = editorNavigationURL(moduleKey, value); currentGame = gameIdentity(value); history.replaceState(history.state, "", url); render(); } });
}
