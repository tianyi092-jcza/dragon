import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Advisor lock + minimap navigation in a real browser (M-05 remainder).
// Fresh Chromium, isolated profile, self-owned static server. Real clicks:
// fan opens the advisor bar; selecting 据点 locks the whole big map
// (drag pans nothing, city click selects nothing); minimap click still
// navigates (UI, not big-map); right-click rollback restores map input.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

const server = await startBrowserTestServer();
let browser;
const errors = [];
try {
  const origin = `http://127.0.0.1:${server.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.location().url?.endsWith("/favicon.ico")
    )
      errors.push(message.text());
  });
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  async function rebind(x, y) {
    await page.evaluate(() => {
      window.__lockMenuHandler = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__lockMenuHandler,
    );
  }
  await rebind(468, 360);
  await rebind(512, 234);
  await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () => window.__app.gameStarted && window.__app.runtimeEnabled,
  );
  const geom = await page.evaluate(() => {
    const app = window.__app;
    app.clock.hold = true; // freeze motion; input routing still live
    const bar = app.gamebar;
    bar.layout?.();
    return { bx: bar.bx };
  });
  // Boot product state: minimap and advisor bar auto-open at game start.
  // Prove both real toggles by closing and reopening through clicks.
  const bootPanels = await page.evaluate(() => ({
    mini: window.__app.gamebar.miniOpen,
    submenu: window.__app.gamebar.submenuOpen,
  }));
  tlog(`boot panels: ${JSON.stringify(bootPanels)}`);
  assert.equal(bootPanels.mini, true, "minimap auto-opens at start");
  assert.equal(bootPanels.submenu, true, "advisor bar auto-opens at start");
  await page.mouse.click(geom.bx + 415, 15); // map icon closes
  assert.equal(
    await page.evaluate(() => window.__app.gamebar.miniOpen),
    false,
  );
  await page.mouse.click(geom.bx + 415, 15); // map icon reopens
  const mini = await page.evaluate(() => {
    const bar = window.__app.gamebar;
    return { open: bar.miniOpen, rect: bar.panelRect("mini") };
  });
  assert.equal(mini.open, true, "minimap must reopen via map icon");
  await page.mouse.click(geom.bx + 351, 15); // fan closes
  assert.equal(
    await page.evaluate(() => window.__app.gamebar.submenuOpen),
    false,
  );
  // Fan reopens the advisor bar.
  await page.mouse.click(geom.bx + 351, 15);
  const barOpen = await page.evaluate(() => ({
    open: window.__app.gamebar.submenuOpen,
    selected: window.__app.gamebar.selectedSubmenu,
  }));
  assert.equal(barOpen.open, true);
  assert.equal(barOpen.selected, null);
  await page.screenshot({ path: "advisor_bar_open.png" });
  // Minimap navigation with the bar open but nothing selected (baseline).
  const nav = await page.evaluate(() => {
    const bar = window.__app.gamebar;
    const rect = bar.panelRect("mini");
    // NOTE: panel rect includes the nameplate strip (clicking it opens the
    // faction picker instead of navigating); aim inside the 208x139 map zone.
    return {
      x: rect.x + rect.w * 0.6,
      y: rect.y + rect.h * 0.6,
      cam: { ...window.__app.view.cam },
    };
  });
  await page.mouse.click(nav.x, nav.y);
  const afterBaseNav = await page.evaluate(() => ({ ...window.__app.view.cam }));
  assert.ok(
    afterBaseNav.x !== nav.cam.x || afterBaseNav.y !== nav.cam.y,
    "minimap click must navigate with nothing selected",
  );
  tlog(
    `minimap nav unselected: cam (${nav.cam.x},${nav.cam.y}) -> (${afterBaseNav.x},${afterBaseNav.y})`,
  );
  // Select 據點 (cell 5).
  await page.mouse.click(geom.bx + 437, 56);
  const selected = await page.evaluate(() => ({
    selected: window.__app.gamebar.selectedSubmenu,
    cam: { ...window.__app.view.cam },
  }));
  assert.equal(selected.selected, 5, "據點 must be selected");
  await page.screenshot({ path: "advisor_selected.png" });

  // Map lock: drag pans nothing.
  await page.mouse.move(512, 400);
  await page.mouse.down();
  await page.mouse.move(700, 500, { steps: 10 });
  await page.mouse.up();
  const afterDrag = await page.evaluate(() => ({
    cam: { ...window.__app.view.cam },
    cityCard: !!window.__app.gamebar.cityCard,
  }));
  assert.deepEqual(afterDrag.cam, selected.cam, "locked map must not pan");
  // Map lock: clicking a city selects nothing.
  const cityPt = await page.evaluate(() => {
    const app = window.__app;
    const city = app.scenario.cities[app.scenario.factions[0].capital];
    const [wxp, wyp] = app.view.cityPixel(city);
    return { x: app.view.sx(wxp), y: app.view.sy(wyp) };
  });
  await page.mouse.click(cityPt.x, cityPt.y);
  const afterCity = await page.evaluate(() => ({
    cam: { ...window.__app.view.cam },
    cityCard: !!window.__app.gamebar.cityCard,
  }));
  assert.deepEqual(afterCity.cam, selected.cam, "locked map click moves nothing");
  assert.equal(afterCity.cityCard, false, "locked map opens no city card");

  // Modal rule: with the 據點二级菜单 open, minimap clicks are consumed
  // (baseMenu branch returns true outside its rect) — no navigation.
  const lockedCam = { ...selected.cam };
  await page.mouse.click(nav.x, nav.y);
  const afterLockedNav = await page.evaluate(() => ({
    cam: { ...window.__app.view.cam },
    baseMenu: !!window.__app.gamebar.baseMenu,
  }));
  assert.deepEqual(
    afterLockedNav.cam,
    lockedCam,
    "minimap click under an open submenu must not navigate",
  );
  assert.equal(afterLockedNav.baseMenu, true, "base menu stays open");
  tlog("minimap under 據點 menu: consumed, camera unchanged");

  // Right-click rollback until the workflow exits, then drag works again.
  for (let i = 0; i < 4; i++) {
    const done = await page.evaluate(
      () =>
        window.__app.gamebar.selectedSubmenu == null &&
        !window.__app.gamebar.listDialog &&
        !window.__app.gamebar.baseMenu,
    );
    if (done) break;
    await page.mouse.click(512, 400, { button: "right" });
  }
  const rolledBack = await page.evaluate(() => ({
    selected: window.__app.gamebar.selectedSubmenu,
    dialog: !!window.__app.gamebar.listDialog,
    baseMenu: !!window.__app.gamebar.baseMenu,
    cam: { ...window.__app.view.cam },
  }));
  assert.equal(rolledBack.selected, null);
  assert.equal(rolledBack.dialog, false);
  assert.equal(rolledBack.baseMenu, false);
  await page.mouse.move(512, 400);
  await page.mouse.down();
  await page.mouse.move(400, 350, { steps: 10 });
  await page.mouse.up();
  const afterUnlock = await page.evaluate(() => ({ ...window.__app.view.cam }));
  assert.ok(
    afterUnlock.x !== rolledBack.cam.x || afterUnlock.y !== rolledBack.cam.y,
    "map drag must work after rollback",
  );
  assert.deepEqual(errors, [], "no page/console errors");
} finally {
  await browser?.close();
  server.close();
}
tlog("advisor lock browser: lock + minimap nav + rollback OK");
