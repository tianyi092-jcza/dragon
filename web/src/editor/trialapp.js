// Local exact-snapshot full App entry, not an authenticated Trial service.
// No intro/singleinstance/title/repository load; fresh window owns all state.
import { createTrialEnvironment } from "../content/authoring/trialruntime.js";
const status = document.querySelector("#trial-status");
window.addEventListener("dragon-trial-ended", () => { status.textContent = "草稿試運行已結束；進度已丟棄，請從工作台開啟新視窗。"; });
try {
  const args = new URLSearchParams(location.search);
  if (!/^[1-9]\d*$/.test(args.get("revision") ?? "") || !args.get("chapter")) throw new Error("缺少固定快照修訂或章節");
  const response = await fetch("/api/trial-pack?" + args, { cache: "no-store" });
  if (!response.ok) throw new Error("快照載入失敗：" + response.status);
  const pack = await response.json();
  if (pack.manifest.identity.gameId !== args.get("game") || pack.manifest.identity.draftRevision !== args.get("revision") || pack.chapterId !== args.get("chapter")) throw new Error("試運行快照身份不符");
  if (args.has("scope") ? args.get("scope") !== "chapter" || pack.manifest.scope?.kind !== "chapter" || pack.manifest.scope.chapterId !== pack.chapterId : pack.manifest.scope !== undefined)
    throw new Error("試運行章節範圍不符");
  // Explicit faction selection before importing/booting the actual App.
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;left:20px;top:20px;z-index:101;color:white;background:#141414;padding:16px";
  const label = document.createElement("p"); label.textContent = "草稿試運行：選擇勢力（原軍師）；不保存進度。";
  const select = document.createElement("select"); select.id = "trial-faction";
  for (const f of pack.chapter.factions) { const option = document.createElement("option"); option.value = String(f.idx); option.textContent = f.monarch ?? f.name; select.append(option); }
  const button = document.createElement("button"); button.id = "start-trial"; button.textContent = "開始試運行";
  panel.append(label, select, button); document.body.append(panel);
  button.onclick = async () => {
    button.disabled = true;
    try {
      const trial = createTrialEnvironment(pack, { fullApp: true, playerFaction: Number(select.value) });
      const { startApp } = await import("../main.js");
      await startApp(null, { trial });
      panel.remove();
      status.textContent = `草稿試運行 ${trial.identity.gameId} 修訂${trial.identity.draftRevision} — 僅記憶體；正式存讀檔停用（本地無認證）`;
    } catch (error) { status.textContent = "無法啟動試運行：" + error.message; }
  };
} catch (error) { status.textContent = "無法載入試運行：" + error.message; }
