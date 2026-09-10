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

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const port = await findFreePort();
const server = spawn(
  process.platform === "win32" ? "python" : "python3",
  [path.join(repo, "tools", "webserver.py"), String(port)],
  { stdio: "ignore" },
);

async function waitForServer(targetPort) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${targetPort}/index.html`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server failed to start");
}

try {
  await waitForServer(port);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();

  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu);
  await page.evaluate(() => {
    sessionStorage.setItem("openPlayed", "1");
    window.__app?.openView?.finish?.();
  });

  // YES → 第一章 → 第一势力 → 确定军师。每个对话框绑定后才点击，避免慢机竞态。
  await page.waitForFunction(() => {
    const startMenu = window.__app?.startMenu;
    return (
      document.querySelector("#startv")?.style.display !== "none" &&
      !!startMenu?._onClick
    );
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
  await clickAndRebind(468, 360);
  await clickAndRebind(512, 234);
  await clickAndRebind(512, 234);
  await page.mouse.click(584, 455);

  await page.waitForFunction(
    () =>
      document.querySelector("#startv")?.style.display === "none" &&
      document.body.classList.contains("game-active") &&
      !!window.__app?.scenario,
  );

  // 1. 验证在游戏进行中按下 F5：首选在页面内弹出提示对话框
  await page.keyboard.press("F5");
  await page.waitForFunction(() => !!window.__app?.gamebar?.exitConfirmDialog);

  const dlgInfo = await page.evaluate(() => {
    const d = window.__app.gamebar.exitConfirmDialog;
    return {
      message: d?.message,
      buttons: d?.buttons,
      defaultButton: d?.defaultButton,
      clockHold: window.__app.clock.hold,
      isMenuOpen: window.__app.gamebar.isMenuOpen(),
    };
  });

  assert.equal(
    dlgInfo.message,
    "刷新或关闭会丢失当前进度，请检查是否已存档。",
    "提示文字完全符合要求",
  );
  assert.deepEqual(
    dlgInfo.buttons,
    ["确定退出", "返回游戏"],
    "提供“确定退出”和“返回游戏”按钮",
  );
  assert.equal(dlgInfo.defaultButton, 1, "默认按钮指向返回游戏");
  assert.equal(dlgInfo.clockHold, true, "弹窗打开时时钟保持冻结");
  assert.equal(dlgInfo.isMenuOpen, true, "isMenuOpen 为 true");

  // 2. 验证按下回车键（Enter），默认是“返回游戏”，关闭弹窗回到游戏
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !window.__app?.gamebar?.exitConfirmDialog);
  const afterEnter = await page.evaluate(() => ({
    dialog: window.__app.gamebar.exitConfirmDialog,
    hasScenario: !!window.__app.scenario,
  }));
  assert.equal(afterEnter.dialog, null, "按回车键后弹窗关闭");
  assert.equal(afterEnter.hasScenario, true, "战局保留，未刷新未退出");

  // 3. 验证按下 Ctrl+R 快捷键打开弹窗
  await page.keyboard.press("Control+KeyR");
  await page.waitForFunction(() => !!window.__app?.gamebar?.exitConfirmDialog);

  // 验证按下鼠标右键，默认是“返回游戏”，关闭弹窗回到游戏
  await page.mouse.click(500, 300, { button: "right" });
  await page.waitForFunction(() => !window.__app?.gamebar?.exitConfirmDialog);
  const afterRightClick = await page.evaluate(() => ({
    dialog: window.__app.gamebar.exitConfirmDialog,
    hasScenario: !!window.__app.scenario,
  }));
  assert.equal(afterRightClick.dialog, null, "右键点击后弹窗关闭");
  assert.equal(afterRightClick.hasScenario, true, "战局保留");

  // 4. 验证点击“返回游戏”按钮
  await page.keyboard.press("F5");
  await page.waitForFunction(() => !!window.__app?.gamebar?.exitConfirmDialog);

  const btnPositions = await page.evaluate(() => {
    const r = window.__app.gamebar._exitConfirmDialogRect();
    const innerX = r.x + 8;
    const innerY = r.y + 8;
    const innerW = (r.wTiles - 1) * 16;
    const btnW = 84;
    const btnY = innerY + 74;
    const btn0X = innerX + Math.floor(innerW / 2) - btnW - 16;
    const btn1X = innerX + Math.floor(innerW / 2) + 16;
    return {
      btn0: { x: btn0X + btnW / 2, y: btnY + 11 },
      btn1: { x: btn1X + btnW / 2, y: btnY + 11 },
    };
  });

  // 点击按钮 1 (返回游戏)
  await page.mouse.click(btnPositions.btn1.x, btnPositions.btn1.y);
  await page.waitForFunction(() => !window.__app?.gamebar?.exitConfirmDialog);
  assert.equal(
    await page.evaluate(() => window.__app.gamebar.exitConfirmDialog),
    null,
    "点击返回游戏按钮后弹窗关闭回到游戏",
  );

  // 5. 验证点击“确定退出”按钮
  await page.keyboard.press("F5");
  await page.waitForFunction(() => !!window.__app?.gamebar?.exitConfirmDialog);

  // 点击按钮 0 (确定退出)，等待页面触发重载/导航
  const [navResponse] = await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.mouse.click(btnPositions.btn0.x, btnPositions.btn0.y),
  ]);
  assert.ok(navResponse, "成功触发并完成了刷新/重载页面");

  await browser.close();
  process.stdout.write("verify_exit_confirm_browser passed successfully!\n");
} finally {
  server.kill();
}
