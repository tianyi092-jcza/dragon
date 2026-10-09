// 资源加载器 — 集中管理所有逆向提取的资产，带缓存
import { DEFAULT_WORLD } from "../content/worlddefinition.js";

const cache = new Map();
const imageBust = new Set([
  "battle_terrain_0.png",
  "battle_terrain_1.png",
  "battle_terrain_2.png",
  "battle_units.png",
]);

function imageUrl(url) {
  const name = url.split("/").pop();
  return imageBust.has(name) ? `${url}?v=original-sprites-1` : url;
}

// URLs supplied by a world/manifest are immutable revision-scoped keys.
// Keep successes/single-flight loads, but a failed Promise is not an asset:
// clear just its own entry so a transient failure can be retried. No world
// mutation or Scenario/RNG work occurs here.
function cachedAsset(url, factory) {
  if (!cache.has(url)) {
    const pending = factory().catch((error) => {
      if (cache.get(url) === pending) { cache.delete(url); }
      throw error;
    });
    cache.set(url, pending);
  }
  return cache.get(url);
}

export function loadJSON(url) {
  return cachedAsset(url, () => fetch(url).then((response) => {
    if (!response.ok) { throw new Error(`加载失败: ${url}`); }
    return response.json();
  }));
}

export function loadBytes(url) {
  return cachedAsset(url, () => fetch(url).then(async (response) => {
    if (!response.ok) { throw new Error(`加载失败: ${url}`); }
    return new Uint8Array(await response.arrayBuffer());
  }));
}

export function loadImage(url) {
  return cachedAsset(url, () => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`加载失败: ${url}`));
    img.src = imageUrl(url);
  }));
}

/** 四季战略地图按需加载；标题选单阶段不得提前请求地图位图。 */
export function loadSeasonTile(season, definition = DEFAULT_WORLD) {
  return loadImage(
    definition.assets.seasons[season] ?? `map_tiles_${season}.png`,
  );
}

/** 武将头像 (懒加载+缓存；试运行上传覆盖优先，无覆盖回落 kao) */
let portraitOverrides = null;
export function setPortraitOverrides(map) { portraitOverrides = map instanceof Map && map.size ? map : null; }
// 事项④ Web 产品决定（用户裁决 2026-10-09，非原版机制）：章武将 portraitKey ×
// manifest.portraits 命中即按 portrait byte 覆盖 kao 引用；未命中/非法一律回落，不发明图。
export function buildPortraitOverrides(generals, portraits) {
  const map = new Map();
  if (!Array.isArray(generals) || !Array.isArray(portraits)) { return map; }
  const byId = new Map(portraits.filter((entry) => entry && typeof entry.assetId === "string").map((entry) => [entry.assetId, entry]));
  for (const general of generals) {
    if (!general || typeof general.portraitKey !== "string" || !Number.isInteger(general.portrait)) { continue; }
    const hit = byId.get(general.portraitKey);
    if (typeof hit?.url === "string" && hit.url) { map.set(general.portrait, hit.url); }
  }
  return map;
}
export function portrait(i) {
  return loadImage(portraitOverrides?.get(i) ?? `kao/${i}.png`);
}
