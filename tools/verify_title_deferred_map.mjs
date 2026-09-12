import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [html, main, assets, menu, mapview] = await Promise.all([
  fs.readFile(new URL("../web/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../web/src/main.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../web/src/core/assets.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../web/src/ui/startmenu.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../web/src/render/mapview.js", import.meta.url), "utf8"),
]);

assert.match(
  html,
  /href="intro\/styles\.css"/,
  "标题阶段使用本地原生开场；不依赖旧login背景",
);
assert.match(html, /#cv\s*\{[\s\S]*display:\s*none/);
assert.match(html, /body\.game-active\s+#cv\s*\{[\s\S]*display:\s*block/);
assert.doesNotMatch(html, /id="openv"|id="opimg"|點擊跳過/);
assert.doesNotMatch(main, /OpenView|openPlayed|\.openView/);
assert.doesNotMatch(
  main,
  /app\.setScenario\(0\)/,
  "标题阶段不得装配默认章节作为地图背景",
);
assert.match(main, /await app\.startMenu\.show\(\)/);
assert.match(main, /async ensureGameAssets\(\)/);
assert.match(main, /await this\.ensureGameAssets\(\)/);
assert.match(main, /this\.gameStarted = true/);
assert.match(main, /document\.body\.classList\.add\("game-active"\)/);
assert.match(main, /this\.gameStarted = false/);
assert.match(main, /document\.body\.classList\.remove\("game-active"\)/);
assert.match(
  main,
  /resetScenarioUi\?\.\(\)/,
  "返回标题必须取消旧剧本的异步消息和计时器",
);
assert.match(
  main,
  /onSelect:\s*\(target, e\)\s*=>\s*\{[\s\S]*?if \(!app\.gameStarted \|\| !app\.scenario\) return;[\s\S]*?gamebar\?\.click/,
  "标题阶段全局右键不得穿透到战略GameBar",
);
assert.match(
  main,
  /onWheel:\s*\(e\)\s*=>\s*\{[\s\S]*?if \(!app\.gameStarted \|\| !app\.scenario\) return;[\s\S]*?gamebar\?\.wheel/,
  "标题阶段全局滚轮不得穿透到战略GameBar",
);
assert.match(menu, /await this\.app\.beginNewGame\(idx, f, adv\)/);
assert.match(menu, /await this\.app\.beginSavedGame\(slot\)/);
assert.doesNotMatch(assets, /Object\.fromEntries\([\s\S]*map_tiles_/);
assert.match(assets, /export function loadSeasonTile\(season\)/);
assert.match(mapview, /if \(this\.app && !this\.app\.gameStarted\) return;/);
const gamebar = await fs.readFile(
  new URL("../web/src/ui/gamebar.js", import.meta.url),
  "utf8",
);
assert.match(gamebar, /resetScenarioUi\(\)/);
assert.match(gamebar, /this\._strategicMessageQueue\.length = 0/);
assert.match(gamebar, /clearTimeout\(this\._generalCardTimer\)/);

process.stdout.write(
  "title deferred map OK: native opening, no default scenario; background until confirmed new/load game\n",
);
