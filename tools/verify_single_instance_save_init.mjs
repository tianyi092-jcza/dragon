import assert from "node:assert/strict";

const slotSize = 0x56c0;
const bundled = new Uint8Array(4 * slotSize);
globalThis.atob ??= (value) => Buffer.from(value, "base64").toString("binary");
globalThis.Image = class {
  set src(_value) { queueMicrotask(() => this.onload?.()); }
};
globalThis.fetch = async (url) => {
  const name = String(url);
  if (name.endsWith("scen_raw.json"))
    return {
      ok: true,
      status: 200,
      async json() {
        return { save_b64: Buffer.from(bundled).toString("base64"), slots: [] };
      },
    };
  if (name.endsWith("big5_map.json"))
    return { ok: true, status: 200, async json() { return {}; } };
  if (name === "/api/save.dat")
    return { ok: false, status: 409, async arrayBuffer() { return new ArrayBuffer(0); } };
  throw new Error(name);
};
globalThis.__dragonInstance = {
  token: "init",
  state: "active",
  expiresAt: Date.now() + 60_000,
};
const { initSaveAssets } = await import("../web/src/game/savegame.js");
await assert.rejects(initSaveAssets(), /lease-lost/);
// 只有显式测试模式才允许bundled底版。
globalThis.__dragonInstance.state = "lost";
await initSaveAssets({ allowStaticFallback: true });
process.stdout.write(
  "single instance save init OK: formal 409 fails closed; explicit test fallback allowed\n",
);
