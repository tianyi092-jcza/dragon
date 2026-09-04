import assert from "node:assert/strict";
import fs from "node:fs/promises";

class ImageStub {
  set src(_value) {}
}
globalThis.Image = ImageStub;
globalThis.document = {
  querySelector() {
    return { addEventListener() {}, style: {}, textContent: "" };
  },
};
globalThis.performance = { now: () => 10_000 };

const { GameBar } = await import("../web/src/ui/gamebar.js");

const clock = { hold: false };
const app = {
  clock,
  battleView: { active: true },
  engageTransition: null,
  hud: { dialogCount: 0 },
};
const host = {
  app,
  _lastMouse: 0,
  _clockHoldRequested: false,
  selectedSubmenu: null,
};
GameBar.prototype.syncClock.call(host);
assert.equal(clock.hold, true, "战术战斗活动期间战略时钟必须冻结");

app.battleView.active = false;
app.engageTransition = { active: true };
GameBar.prototype.syncClock.call(host);
assert.equal(clock.hold, true, "委任四相与结算过渡期间战略时钟必须冻结");

app.engageTransition.active = false;
GameBar.prototype.syncClock.call(host);
assert.equal(clock.hold, false, "战斗结束且无其它模态后战略时钟恢复");

const battleViewSource = await fs.readFile(
  new URL("../web/src/render/battleview.js", import.meta.url),
  "utf8",
);
assert.match(
  battleViewSource,
  /prevClockState\s*=\s*\{[\s\S]*?hold:\s*this\.app\.clock\.hold[\s\S]*?this\.app\.clock\.hold\s*=\s*true/,
  "BattleView.open必须保存旧hold并在加载战场资源前冻结时钟",
);
assert.match(
  battleViewSource,
  /this\.app\.clock\.hold\s*=\s*this\.prevClockState\.hold/,
  "BattleView结束或启动失败时必须恢复进入战斗前的hold",
);

process.stdout.write(
  "battle clock hold OK: tactical and delegated battle states freeze strategic time\n",
);
