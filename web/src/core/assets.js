// 资源加载器 — 集中管理所有逆向提取的资产，带缓存
import { SEASONS } from "../game/world.js";

const cache = new Map();
const imageBust = new Set([
  "battle_map_0.png",
  "battle_map_1.png",
  "battle_map_2.png",
]);

function imageUrl(url) {
  const name = url.split("/").pop();
  return imageBust.has(name) ? `${url}?v=full-field-1` : url;
}

export async function loadJSON(url) {
  if (!cache.has(url))
    cache.set(
      url,
      fetch(url).then((r) => r.json()),
    );
  return cache.get(url);
}

export function loadImage(url) {
  if (!cache.has(url))
    cache.set(
      url,
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("加载失败: " + url));
        img.src = imageUrl(url);
      }),
    );
  return cache.get(url);
}

/** 四季地形图 {spring: Promise<Image>, ...} */
export const seasonTiles = Object.fromEntries(
  SEASONS.map((s) => [s, loadImage(`map_tiles_${s}.png`)]),
);

/** 武将头像 (懒加载+缓存) */
export function portrait(i) {
  return loadImage(`kao/${i}.png`);
}
