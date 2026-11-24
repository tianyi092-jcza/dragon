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

/** Q37 Web presentation: uploaded portraits belong to a captured chapter/world,
 * not a process-global DOS portrait byte. No rule fields or 255 semantics change. */
const worldPortraits = new WeakMap();
export function bindPortraitOverrides(world, map) {
  if (!world || typeof world !== "object" || !(map instanceof Map) || worldPortraits.has(world)) {
    throw new TypeError("portrait bindings require a fresh owning world");
  }
  worldPortraits.set(world, new Map([...map].map(([idx, entry]) => [idx, Object.freeze({ ...entry })])));
}
function portraitOverride(general, world) {
  if (!general || typeof general !== "object") return null;
  const entry = worldPortraits.get(world)?.get(general.idx);
  // Captured tactical speakers have slot/portrait, without live portraitKey.
  return entry && entry.portrait === general.portrait &&
    (!Object.hasOwn(general, "portraitKey") || general.portraitKey === entry.portraitKey) ? entry.url : null;
}
// Q69-(iii): retain the existing narrow FF presentation exception for uploads.
export function hasPortraitOverride(general, world) { return portraitOverride(general, world) !== null; }
export function portraitURL(generalOrByte, world) {
  const byte = generalOrByte && typeof generalOrByte === "object" ? generalOrByte.portrait : generalOrByte;
  return portraitOverride(generalOrByte, world) ?? `kao/${byte}.png`;
}
// 事项④ Web 产品决定（用户裁决 2026-10-09，非原版机制）：章武将 portraitKey ×
// manifest.portraits 命中即按章实体 idx 绑定；同 byte 不合并，未命中回落，不发明图。
export function buildPortraitOverrides(generals, portraits) {
  const map = new Map();
  if (!Array.isArray(generals) || !Array.isArray(portraits)) { return map; }
  const byId = new Map(portraits.filter((entry) => entry && typeof entry.assetId === "string").map((entry) => [entry.assetId, entry]));
  for (const general of generals) {
    if (!general || !Number.isInteger(general.idx) || typeof general.portraitKey !== "string" || !Number.isInteger(general.portrait)) { continue; }
    const hit = byId.get(general.portraitKey);
    if (typeof hit?.url === "string" && hit.url) {
      map.set(general.idx, Object.freeze({ portrait: general.portrait, portraitKey: general.portraitKey, url: hit.url }));
    }
  }
  return map;
}
export function portrait(generalOrByte, world) {
  return loadImage(portraitURL(generalOrByte, world));
}
/** 據點圖片自管庫 Web 呈現（Web 产品决定 2026-11，非原版機制）：發布包實際引用的
 * 自管圖按 view 綁定到所屬 world；未命中回落凍結 grf／kyo，不發明圖。被刪圖在新包
 * 無條目，舊 gamebar／hud 只認回落路徑，顯示為空（404 即空）。 */
const worldCityPictures = new WeakMap();
export function bindCityPictureOverrides(world, map) {
  if (!world || typeof world !== "object" || !(map instanceof Map) || worldCityPictures.has(world)) {
    throw new TypeError("city picture bindings require a fresh owning world");
  }
  worldCityPictures.set(world, new Map([...map].map(([view, entry]) => [view, Object.freeze({ ...entry })])));
}
export function cityPictureURL(view, world) {
  const known = Number.isInteger(view) && view >= 0 && view <= 255 ? view : 0;
  return worldCityPictures.get(world)?.get(known)?.url ?? `grf/kyo_${String(known).padStart(2, "0")}.png`;
}
export function buildCityPictureOverrides(cities, pictures) {
  const map = new Map();
  if (!Array.isArray(cities) || !Array.isArray(pictures)) { return map; }
  const byView = new Map(pictures.filter((entry) => entry && Number.isInteger(entry.view)).map((entry) => [entry.view, entry]));
  for (const city of cities) {
    if (!city || !Number.isInteger(city.view)) { continue; }
    const hit = byView.get(city.view);
    if (typeof hit?.url === "string" && hit.url) {
      map.set(city.view, Object.freeze({ view: city.view, url: hit.url }));
    }
  }
  return map;
}
