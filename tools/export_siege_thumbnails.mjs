// Siege thumbnail exporter: reuses the production BattleView.composeBattlefield
// path (same tile bytes, MDL attributes, atlas frames, isometric projection)
// to render static terrain only, then downscales to thumbnails.
// No game logic, saves, battles or balance changes; output is editor art.
// Usage: node tools/export_siege_thumbnails.mjs [--only 0,1,2]
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const onlyArg = process.argv.find(arg => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map(Number) : null;

const HARNESS = `<!doctype html><html><body><canvas id="cv" width="640" height="400"></canvas><canvas id="thumb" width="240" height="128"></canvas>
<div style="display:none"><button id="bunit0"></button><button id="bunit1"></button><button id="bunit2"></button><button id="bunit3"></button><button id="bunit4"></button><button id="bunit5"></button><button id="bassault"></button><button id="battack"></button><button id="bformation"></button><button id="bwall"></button><button id="bdefend"></button><button id="bretreat"></button><div id="bctl"></div><div id="btitle"></div><div id="battle-bottom-bar"></div></div>
<div id="err" style="white-space:pre-wrap"></div>
<script type="module">
const fail = m => { document.getElementById('err').textContent = String(m).slice(0, 500); };
try {
const { BattleView } = await import('/web/src/render/battleview.js');
const [navRes, mapRes] = await Promise.all([fetch('/web/battle_navigation.json'), fetch('/web/battle_maps.json')]);
const navigation = await navRes.json(), battleMaps = await mapRes.json();
const toU8 = a => Uint8Array.from(a);
const maps = Object.fromEntries(Object.entries(battleMaps.maps).map(([k, v]) => [k, toU8(v)]));
const layouts = Object.fromEntries(Object.entries(navigation.layouts).map(([k, v]) => [k, { attributes: toU8(v.attributes) }]));
const atlasCache = {};
async function atlas(layout) {
  if (!atlasCache[layout]) {
    const img = new Image();
    img.src = '/web/grf/battle_terrain_' + layout + '.png';
    await img.decode();
    atlasCache[layout] = img;
  }
  return atlasCache[layout];
}
const cv = document.getElementById('cv');
const appStub = { battleMaps: { maps, navigation: { layouts } } };
const view = new BattleView(cv, appStub);
const thumb = document.getElementById('thumb');
const tctx = thumb.getContext('2d');
tctx.imageSmoothingEnabled = true;
window.renderSiege = async (idx) => {
  const entry = battleMaps.directory[idx];
  view.battle = { directoryIndex: idx, layout: entry.layout };
  view.mapImg = await atlas(entry.layout);
  view.composeBattlefield();
  if (!view.sceneReady) throw new Error('scene not ready ' + idx);
  // Static terrain lives in depth strips; real frames interleave units by
  // depth. Thumbnails need no units, so composite all strips back to front
  // over the base lattice — same pixels the battle would show underneath.
  const sctx = view.sceneCanvas.getContext('2d');
  for (const layer of view.terrainLayers) sctx.drawImage(layer.image, layer.x, layer.y);
  tctx.clearRect(0, 0, thumb.width, thumb.height);
  tctx.drawImage(view.sceneCanvas, 0, 0, thumb.width, thumb.height);
  return { dataURL: thumb.toDataURL('image/png'), layout: entry.layout, theme: entry.theme };
};
window.__ready = true;
} catch (e) { fail(e && e.stack || e); }
</script></body></html>`;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/thumb-harness.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(HARNESS);
      return;
    }
    const path = join(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
    if (!path.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(bytes);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const require = createRequire(import.meta.url);
let chromium;
try {
  chromium = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright').chromium;
} catch {
  throw new Error('playwright unavailable; set PLAYWRIGHT_MODULE');
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(origin + '/thumb-harness.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true').catch(async () => {
    const errText = await page.evaluate(() => document.getElementById('err')?.textContent ?? '');
    throw new Error('harness init failed: ' + errText + ' | pageerrors: ' + errors.slice(0, 2).join(' // '));
  });
  const outDir = join(root, 'web', 'grf', 'siege');
  await mkdir(outDir, { recursive: true });
  const indices = only ?? Array.from({ length: 192 }, (_, i) => i);
  let done = 0;
  for (const i of indices) {
    const { dataURL, layout, theme } = await page.evaluate(async (idx) => window.renderSiege(idx), i);
    assert.ok(dataURL.startsWith('data:image/png;base64,'));
    const bytes = Buffer.from(dataURL.slice('data:image/png;base64,'.length), 'base64');
    assert.ok(bytes.length > 1000, 'thumbnail too small ' + i);
    await writeFile(join(outDir, `siege-${i}.png`), bytes);
    if (++done % 32 === 0) console.log(`thumbnails: ${done}/${indices.length}`);
  }
  assert.equal(errors.length, 0, errors.slice(0, 3).join('\n'));
  console.log(JSON.stringify({ result: 'SIEGE-THUMBNAILS-OK', count: indices.length }));
} finally {
  await browser.close();
  server.close();
}
