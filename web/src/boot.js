import {
  showInstanceMessage,
  startSingleInstance,
} from "./core/singleinstance.js";

let appLoaded = false;

try {
  await startSingleInstance({
    onActive() {
      globalThis.__dragonApp?.setRuntimeEnabled?.(true);
    },
    onSuspend() {
      globalThis.__dragonApp?.setRuntimeEnabled?.(false);
    },
    onLost() {
      globalThis.__dragonApp?.loseInstanceLease?.();
    },
  });
  const module = await import("./main.js");
  const runtime = globalThis.__dragonInstance;
  if (runtime?.state !== "active" || Date.now() >= runtime.expiresAt)
    throw new Error("lease-lost");
  await module.startApp();
  appLoaded = true;
} catch (error) {
  if (!appLoaded && !document.querySelector("#instance-lock")?.textContent)
    showInstanceMessage(`遊戲無法啟動。\n${error?.message ?? error}`);
}
