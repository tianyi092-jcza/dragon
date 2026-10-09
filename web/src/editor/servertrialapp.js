// Server Trial window boot: authenticated pack -> gate-guarded full App boot with the production engine.
// Q70/Q71 wiring: ten-field frozen binding (sessionId = current session CSRF, client-side only),
// single-flight status probes via the trusted adapter, visibility/offline pauses, strategic-clock
// rule boundary installed through trial.gate. Formal save/load stays disabled by trialpolicy.
// Tactical frames boundary, workbench button and browser evidence live in their own sub-batches.
import { createTrialEnvironment } from "../content/authoring/trialruntime.js";
import { createTrialConnectionGate } from "./trialconnection.js";
import { createTrialConnectionMonitor } from "./trialconnectionmonitor.js";
import { createTrialStatusProbe } from "./trialstatusadapter.js";
import { bindTrialConnectionEvents } from "./trialconnectionevents.js";

// Pure binding builder (evidence entry): pack's nine server fields plus the client-side session marker.
export function buildServerTrialBinding(pack, sessionId) {
  const source = pack?.binding;
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 256) throw new TypeError("invalid server trial session marker");
  if (!source || typeof source !== "object") throw new TypeError("invalid server trial binding input");
  return {
    trialId: source.trialId,
    snapshotId: source.snapshotId,
    ownerId: source.ownerId,
    sessionId,
    authEpoch: String(source.authEpoch),
    gameId: source.gameId,
    draftRevision: source.draftRevision,
    snapshotDigest: source.snapshotDigest,
    chapterId: source.chapterId,
    manifestDigest: source.manifestDigest,
  };
}

export async function bootServerTrialWindow({
  windowTarget = window,
  documentTarget = document,
  fetchImpl = (...args) => window.fetch(...args),
  openApp = (trial) => import("../main.js").then(async (module) => { await module.startApp(null, { trial }); return globalThis.__dragonApp ?? null; }),
} = {}) {
  const status = documentTarget.querySelector("#trial-status");
  const say = (text) => { if (status) status.textContent = text; };
  windowTarget.addEventListener("dragon-trial-ended", () => say("草稿試運行已結束；進度已丟棄，請重新登入並從工作台開啟新視窗。"));
  const args = new URLSearchParams(windowTarget.location.search);
  const trialId = args.get("trial") ?? "";
  if (trialId === "" || [...args.keys()].join(",") !== "trial" || !/^[a-f0-9-]{36}$/.test(trialId)) {
    say("缺少固定試運行身份；請從工作台重新開啟。");
    return { result: "invalid-entry" };
  }
  const sessionResponse = await fetchImpl("/api/session", { credentials: "same-origin", cache: "no-store" });
  if (!sessionResponse.ok) {
    say("登入狀態無效；請重新登入後從工作台重開試運行。");
    return { result: "session-invalid", status: sessionResponse.status };
  }
  const session = await sessionResponse.json();
  if (!session?.user?.id || typeof session.csrf !== "string" || !session.csrf) {
    say("登入狀態無效；請重新登入後從工作台重開試運行。");
    return { result: "session-invalid" };
  }
  const packResponse = await fetchImpl(`/api/trials/${trialId}/pack`, { credentials: "same-origin", cache: "no-store" });
  if (!packResponse.ok) {
    say("試運行快照不可用或已結束；請從工作台重新開啟新視窗。");
    return { result: "pack-unavailable", status: packResponse.status };
  }
  const pack = await packResponse.json();
  // Explicit faction choice by user click before booting the actual App (same policy as the local trial).
  const panel = documentTarget.createElement("div");
  panel.style.cssText = "position:fixed;left:20px;top:20px;z-index:101;color:white;background:#141414;padding:16px";
  const label = documentTarget.createElement("p");
  label.textContent = "草稿試運行：選擇勢力（原軍師）；不保存進度。";
  const select = documentTarget.createElement("select");
  select.id = "trial-faction";
  for (const faction of pack.chapter.factions) {
    const option = documentTarget.createElement("option");
    option.value = String(faction.idx);
    option.textContent = faction.monarch ?? faction.name;
    select.append(option);
  }
  const button = documentTarget.createElement("button");
  button.id = "start-trial";
  button.textContent = "開始試運行";
  panel.append(label, select, button);
  documentTarget.body.append(panel);
  const chosen = await new Promise((resolve) => { button.onclick = () => { button.disabled = true; resolve(Number(select.value)); }; });
  panel.remove();
  let environment;
  try {
    environment = createTrialEnvironment(pack, { fullApp: true, playerFaction: chosen });
  } catch (error) {
    say("試運行快照身份不符：" + error.message);
    return { result: "pack-invalid", error: error.message };
  }
  const gate = createTrialConnectionGate(buildServerTrialBinding(pack, session.csrf));
  const probe = createTrialStatusProbe({ baseUrl: windowTarget.location.origin, fetch: fetchImpl });
  const monitor = createTrialConnectionMonitor(gate, {
    probe,
    setTimer: (...args) => windowTarget.setTimeout(...args),
    clearTimer: (...args) => windowTarget.clearTimeout(...args),
  });
  bindTrialConnectionEvents(monitor, { windowTarget, documentTarget, navigatorState: windowTarget.navigator });
  let app;
  try {
    app = await openApp({ ...environment, gate });
  } catch (error) {
    monitor.dispose("window-dispose");
    say("無法啟動試運行：" + error.message);
    return { result: "boot-failed", error: error.message };
  }
  // Terminal states never revive: discard window progress and prompt re-login (Q70).
  // Pauses keep the in-memory progress and the strategic clock simply holds (Q71).
  const watch = windowTarget.setInterval(() => {
    if (gate.state === "ended") {
      windowTarget.clearInterval(watch);
      monitor.dispose("window-dispose");
      app.returnToTitle();
    } else if (gate.state === "paused" && gate.reason !== "hidden") {
      say("連線狀態未確認；試運行已暫停，進度保留於本視窗記憶體。");
    } else if (gate.state === "running") {
      say(`草稿試運行 ${environment.identity.gameId} 修訂${environment.identity.draftRevision} — 僅記憶體；正式存讀檔停用`);
    }
  }, 1000);
  monitor.checkNow();
  return { result: "booted", gate, monitor, app, watch };
}

if (typeof window !== "undefined" && typeof document !== "undefined" && document.querySelector?.("#trial-status")) {
  bootServerTrialWindow().catch((error) => {
    const status = document.querySelector("#trial-status");
    if (status) status.textContent = "無法啟動試運行：" + (error?.message ?? String(error));
  });
}
