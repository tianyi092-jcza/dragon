import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../web/", import.meta.url);
globalThis.window = globalThis;
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
globalThis.sessionStorage = {
  getItem() { return "1"; },
  setItem() {},
};
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => {
  throw new Error("startup lease loss must not start RAF");
};
globalThis.cancelAnimationFrame = () => {};
globalThis.Image = class {};
const context = {
  clearRect() {}, drawImage() {}, fillRect() {}, fillText() {},
  save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
  rect() {}, clip() {}, strokeRect() {}, measureText() { return { width: 0 }; },
};
const canvas = {
  style: {}, width: 640, height: 400,
  getContext: () => context,
  addEventListener() {},
};
globalThis.document = {
  body: { append() {} },
  fonts: { load: async () => [] },
  querySelector(selector) {
    if (selector === "#cv" || selector.endsWith("v")) return canvas;
    return { style: {}, addEventListener() {}, textContent: "" };
  },
  querySelectorAll() { return []; },
  createElement() { return { style: {}, addEventListener() {}, click() {} }; },
};
let jsonLoads = 0;
globalThis.fetch = async (url) => {
  const name = String(url);
  if (name === "/api/saves.json") {
    globalThis.__dragonInstance.state = "lost";
    globalThis.__dragonInstance.expiresAt = 0;
    return { ok: true, status: 200, async json() { return { slots: [] }; } };
  }
  const data = await fs.readFile(new URL(name, root));
  jsonLoads++;
  return {
    ok: true,
    status: 200,
    async json() { return JSON.parse(data.toString("utf8")); },
    async arrayBuffer() {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    },
  };
};
globalThis.__dragonInstance = {
  token: "startup",
  state: "active",
  expiresAt: Date.now() + 60_000,
};

const { startApp } = await import("../web/src/main.js");
await assert.rejects(startApp(), /lease-lost/);
assert.equal(globalThis.__dragonApp, undefined);
assert.ok(jsonLoads >= 1);

process.stdout.write(
  "single instance startup loss OK: lost lease aborts before publish/menu/RAF\n",
);
