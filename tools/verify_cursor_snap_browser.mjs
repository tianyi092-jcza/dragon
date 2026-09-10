import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright";
const { chromium } = require(playwrightPath);

const repo = fileURLToPath(new URL("../", import.meta.url));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

const port = await getFreePort();
const server = spawn(
  "python",
  [path.join(repo, "tools", "webserver.py"), String(port)],
  { stdio: "ignore" },
);

await new Promise((r) => setTimeout(r, 600));

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
  });

  // This test targets map input, not the ~25s opening movie. Set the isolated
  // session flag before app boot, rather than racing its 30s title wait.
  await page.addInitScript(() => sessionStorage.setItem("openPlayed", "1"));
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);

  await page.evaluate(() => {
    sessionStorage.setItem("openPlayed", "1");
    window.__app?.openView?.finish?.();
  });

  const clickAndRebind = async (x, y) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.evaluate(() => {
        window.__verifyMenuHandler = window.__app?.startMenu?._onClick ?? null;
      });
      await page.mouse.click(x, y);
      const rebound = await page
        .waitForFunction(
          () =>
            window.__app?.startMenu?._onClick &&
            window.__app.startMenu._onClick !== window.__verifyMenuHandler,
          null,
          { timeout: 3000 },
        )
        .then(
          () => true,
          () => false,
        );
      if (rebound) return;
    }
    throw new Error(`start menu click at ${x},${y} did not rebind`);
  };

  await clickAndRebind(468, 360); // 新游戏
  await clickAndRebind(512, 234); // 第一章
  await clickAndRebind(512, 234); // 第一势力
  await page.mouse.click(584, 455); // 确定军师并进入游戏

  await page.waitForFunction(
    () =>
      document.querySelector("#startv")?.style.display === "none" &&
      document.body.classList.contains("game-active") &&
      !!window.__app?.scenario,
  );

  // 1. 将镜头居中至一个据点（例如首个据点），获取其屏幕坐标
  const cityInfo = await page.evaluate(() => {
    const sc = window.__app.scenario;
    const view = window.__app.view;
    const city = sc.cities[0];
    const [wxp, wyp] = view.cityPixel(city);
    view.cam.x = 512 - wxp;
    view.cam.y = 384 - wyp;
    view.clampCam();
    view.draw();
    const cx = view.sx(wxp);
    const cy = view.sy(wyp);
    return { name: city.name, cx, cy };
  });

  assert.ok(
    cityInfo.cx > 50 &&
      cityInfo.cx < 950 &&
      cityInfo.cy > 50 &&
      cityInfo.cy < 700,
    "据点在屏幕可见区域内",
  );

  // 2. 移动鼠标到相交边缘：距离据点中心偏左上 (cx - 15, cy - 14)（相当于图1）
  await page.mouse.move(cityInfo.cx - 15, cityInfo.cy - 14);
  await page.waitForTimeout(100);

  // 验证光标是否自动吸附并定位在据点中心点 (cx, cy)（相当于图2）
  const pointerState = await page.evaluate(() => {
    const view = window.__app.view;
    return {
      pointer: view.pointer,
      snapState: view.snapState
        ? {
            type: view.snapState.target?.type,
            name: view.snapState.target?.city?.name,
            x: view.snapState.x,
            y: view.snapState.y,
          }
        : null,
      hoverTarget: view.hoverTarget?.city?.name ?? null,
    };
  });

  assert.ok(pointerState.snapState, "已触发吸附状态");
  assert.equal(pointerState.snapState.name, cityInfo.name, "吸附目标为该据点");
  assert.equal(
    pointerState.pointer.x,
    cityInfo.cx,
    "光标X坐标自动吸附在据点中心",
  );
  assert.equal(
    pointerState.pointer.y,
    cityInfo.cy,
    "光标Y坐标自动吸附在据点中心",
  );

  // 3. 在吸附状态下直接点击鼠标，验证精准打开据点卡
  await page.mouse.click(cityInfo.cx - 15, cityInfo.cy - 14);
  await page.waitForTimeout(100);

  const cardOpen = await page.evaluate(() => !!window.__app.gamebar.cityCard);
  assert.equal(cardOpen, true, "吸附后点击鼠标能够成功打开据点卡片");

  // 右键关闭据点卡
  await page.mouse.click(500, 300, { button: "right" });
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => !!window.__app.gamebar.cityCard),
    false,
    "右键关闭据点卡",
  );

  // 4. 移动鼠标移出相交区 (cx - 30, cy)，验证吸附解除
  await page.mouse.move(cityInfo.cx - 30, cityInfo.cy);
  await page.waitForTimeout(100);

  const afterMoveOut = await page.evaluate(() => {
    const view = window.__app.view;
    return {
      pointer: view.pointer,
      snapState: view.snapState,
    };
  });
  assert.equal(afterMoveOut.snapState, null, "鼠标移出相交区后吸附解除");
  assert.equal(
    afterMoveOut.pointer.x,
    cityInfo.cx - 30,
    "光标恢复跟随鼠标物理坐标",
  );

  process.stdout.write("verify_cursor_snap_browser passed successfully!\n");
} finally {
  await browser?.close();
  server.kill();
}
