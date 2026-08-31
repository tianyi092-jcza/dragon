import fs from "node:fs/promises";

const [baseUrl, outputPath, token] = process.argv.slice(2);
if (!baseUrl || !outputPath || !token)
  throw new Error("usage: baseUrl outputPath token");
globalThis.__dragonInstance = {
  token,
  state: "active",
  expiresAt: Date.now() + 60_000,
};
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const name = String(url);
  if (name === "/api/save.dat") return nativeFetch(`${baseUrl}${name}`, options);
  const data = await fs.readFile(new URL(`../web/${name}`, import.meta.url));
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(data.toString("utf8")),
  };
};
const { initSaveAssets, serializeSave } = await import(
  "../web/src/game/savegame.js"
);
await initSaveAssets();
const app = {
  scenarioIdx: 0,
  clock: { year: 184, month: 1, day: 1, daysInMonth: 31 },
  scenario: {
    player_faction: 0,
    trust: 100,
    tax: 18,
    factions: [],
    diplomacy: [],
    generals: [],
    cities: [],
    legions: [],
    citiesOf: () => [],
  },
};
await fs.writeFile(outputPath, serializeSave(app, 0, "FRESH"));
