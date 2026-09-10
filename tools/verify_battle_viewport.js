import assert from "node:assert/strict";
import fs from "node:fs/promises";

class ImageStub {}
globalThis.Image = ImageStub;
const { BattleView } = await import("../web/src/render/battleview.js");
const { BATTLE_PANEL_SPECS, POPUP_FONT_PX } = await import(
  "../web/src/ui/battlepanels.js"
);
const { BATTLE_SCENE_HEIGHT, BATTLE_SCENE_WIDTH, FIELD, battleCellToScene } =
  await import("../web/src/game/tacticalbattle.js");
const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);

assert.deepEqual(BATTLE_PANEL_SPECS.dialogue, {
  selector: ".battle-dialogue",
  cols: 30,
  rows: 5,
  width: 480,
  height: 80,
  inset: 8,
  portrait: 64,
  copyGap: 8,
  lineHeight: 20,
  nameMargin: 3,
  copyAlign: "center",
  topAnchor: "title",
  bottomAnchor: "cards",
});
assert.equal(POPUP_FONT_PX, 16);
assert.equal(BATTLE_PANEL_SPECS[BATTLE_PANEL_SPECS.dialogue.topAnchor].top, 16);
assert.equal(
  BATTLE_PANEL_SPECS[BATTLE_PANEL_SPECS.dialogue.bottomAnchor].bottom,
  16,
);
assert.deepEqual(battleCellToScene(0, 0), { x: 16, y: 576 });
assert.deepEqual(battleCellToScene(63, 0), { x: 1024, y: 72 });
assert.deepEqual(battleCellToScene(0, 63), { x: 1024, y: 1080 });
assert.deepEqual(battleCellToScene(63, 63), { x: 2032, y: 576 });
assert.deepEqual(
  battleCellToScene(63, 0, 3),
  { x: 1024, y: 24 },
  "DA1C/DAAA level raises the object by one 16px screen row",
);

const previousInnerWidth = globalThis.innerWidth;
const previousInnerHeight = globalThis.innerHeight;
Object.defineProperty(globalThis, "innerWidth", {
  value: 640,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "innerHeight", {
  value: 400,
  writable: true,
  configurable: true,
});

function control() {
  return {
    style: {},
    dataset: {},
    classList: { toggle() {} },
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    disabled: false,
    textContent: "",
    removeAttribute() {},
    setAttribute(name, value) {
      this[name] = value;
    },
    querySelector() {
      return control();
    },
  };
}

const listeners = new Map();
const ctx = new Proxy(
  { beginPath() {}, rect() {}, clip() {}, save() {}, restore() {} },
  {
    get(target, key) {
      if (!(key in target)) target[key] = () => {};
      return target[key];
    },
  },
);
const cv = {
  width: 0,
  height: 0,
  style: {},
  getContext: () => ctx,
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  setPointerCapture() {},
  releasePointerCapture() {},
};
const controls = {};
for (const selector of [
  "#bassault",
  "#battack",
  "#bformation",
  "#bwall",
  "#bdefend",
  "#bretreat",
  "#battle-bottom-bar",
  "#bctl",
  "#btitle",
  "#bbelligerents",
  "#batkname",
  "#bdefname",
  "#batktroops",
  "#bdeftroops",
  "#batkmorale",
  "#bdefmorale",
  "#batk-troops-fill",
  "#batk-morale-fill",
  "#bdef-troops-fill",
  "#bdef-morale-fill",
  "#bcommandhint",
  "#bdialogue-atk",
  "#bdialogue-atk-face",
  "#bdialogue-atk-name",
  "#bdialogue-atk-text",
  "#bdialogue-def",
  "#bdialogue-def-face",
  "#bdialogue-def-name",
  "#bdialogue-def-text",
  "#bunit0",
  "#bunit1",
  "#bunit2",
  "#bunit3",
  "#bunit4",
  "#bunit5",
]) {
  controls[selector] = control();
}
const formationButtons = Array.from({ length: 16 }, (_, index) => {
  const button = control();
  button.dataset.formation = String(index);
  return button;
});
const deploymentButtons = [48, 28, 5].map((baseX) => {
  const button = control();
  button.dataset.baseX = String(baseX);
  return button;
});
const cardStatusIcons = Array.from({ length: 6 }, () => control());
const cardTroopsFills = Array.from({ length: 6 }, () => control());
for (let i = 0; i < 6; i++) {
  controls[`#bunit${i}`].querySelector = (selector) => {
    if (selector === ".battle-card-troops-fill") return cardTroopsFills[i];
    if (selector === ".battle-card-status") return cardStatusIcons[i];
    return control();
  };
}
const previousDocument = globalThis.document;
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, "canvas");
    return {
      width: 0,
      height: 0,
      getContext: () => ctx,
    };
  },
  querySelector(selector) {
    return controls[selector] ?? control();
  },
  querySelectorAll(selector) {
    if (selector === ".battle-symbol-btn") return formationButtons;
    if (selector === ".battle-deployment-btn") return deploymentButtons;
    return [];
  },
};

const app = {
  scenario: {
    player_faction: 0,
    factions: [{ monarch: "攻主" }, { monarch: "守主" }],
  },
  hud: { flashEvent() {} },
};
const view = new BattleView(cv, app);
view.active = true;
view.battle = {
  kind: "field",
  playerSide: "atk",
  sideMap: { 0: "atk", 1: "def", atk: 0, def: 1 },
  session: new OriginalBattleSession({
    registers: { side0Active: 1, side1Active: 1, themeFlag: 0 },
  }),
  A: { faction: 0, leader: "攻" },
  D: { faction: 1, leader: "守" },
  city: null,
  mirror: false,
  speakers: { atk: { name: "攻" }, def: { name: "守" } },
  dialogues: [],
  nextDialogueSequence: 0,
  layout: 0,
  directoryIndex: 0,
  units: [
    {
      side: "atk",
      idx: 0,
      strategicIndex: 2,
      type: 3,
      typeKey: "infantry",
      x: 110,
      y: FIELD / 2,
      hx: 110,
      hy: FIELD / 2,
      troops: 100,
      maxTroops: 100,
      morale: 100,
      label: "攻軍",
      gen: "攻",
      routed: false,
      gone: false,
    },
    {
      side: "def",
      idx: 0,
      x: FIELD - 110,
      y: FIELD / 2,
      hx: FIELD - 110,
      hy: FIELD / 2,
      troops: 90,
      maxTroops: 90,
      morale: 85,
      label: "守軍",
      gen: "守",
      routed: false,
      gone: false,
    },
  ],
};

{
  const projectedUnits = view.battle.units;
  view.battle.units = [1, 2, 3, 1, 2, 3].map((type, strategicIndex) => ({
    side: "atk",
    idx: strategicIndex,
    strategicIndex,
    type,
  }));
  assert.deepEqual(
    view.playerUnits().map((unit) => unit.strategicIndex),
    [2, 4, 0, 1, 5, 3],
    "C7A9 cards map display order to the six original legion group slots",
  );
  assert.deepEqual(
    view.playerUnits().map((unit) => unit.type),
    [3, 2, 1, 2, 3, 1],
    "each displayed card retains the actual troop type of its legion group",
  );
  view.battle.units = view.battle.units.filter(
    (unit) => unit.strategicIndex !== 4,
  );
  assert.equal(view.playerUnits()[1], null);
  assert.equal(
    view.playerUnits()[2].strategicIndex,
    0,
    "an empty group keeps its card slot instead of shifting later troop icons",
  );
  view.battle.units = projectedUnits;
}

const attributes = new Uint8Array(0x800);
attributes[1] = 0x20;
app.battleMaps = {
  maps: { 0: Array(0x1000).fill(0) },
  navigation: { layouts: { 0: { attributes: Array.from(attributes) } } },
};
view.battle.session.temps.write16(0, 4, 200);
view.battle.session.temps.write16(1, 4, 100);
view.battle.session.pool.write8(
  originalObjectAddress(0, 0, 0),
  ORIGINAL_OBJECT.HP,
  100,
);
view.battle.session.pool.write8(
  originalObjectAddress(1, 0, 0),
  ORIGINAL_OBJECT.HP,
  80,
);

view.mapImg = {};
let terrainDraws = 0;
ctx.drawImage = () => terrainDraws++;
view.composeBattlefield();
assert.equal(
  terrainDraws,
  (BATTLE_SCENE_WIDTH / 32) * (BATTLE_SCENE_HEIGHT / 8) +
    BATTLE_SCENE_HEIGHT / 16 +
    0x1000,
  "DD22 tile0 fills a 16px-staggered 8px-row lattice around the 64x64 map",
);
assert.equal(view.terrainLayers.length, 0x7f);
assert.equal(view.terrainLayers[0].image.height, 112);
assert.equal(
  view.terrainLayers[0].y,
  -32,
  "DD22's seven 0x400 screen-buffer rows span seven DDB4 16px rows",
);

const canvasTexts = [];
ctx.fillText = (text) => canvasTexts.push(String(text));
view.focusCameraOnPlayer();
view.updateCursor();
view.draw();
assert.equal(
  view.s,
  1,
  "DDB4 terrain and SCH objects retain their original 1:1 pixel size",
);
assert.ok(
  Object.is(view.ox, 0) || Object.is(view.ox, -0),
  "player-side focus clamps to the west battlefield edge",
);
assert.equal(view.battleUiScale(), 1, "battle panels remain at 100% scale");
assert.equal(
  view.oy,
  -312,
  "floating UI leaves the full browser height available to the battlefield",
);
assert.equal(cv.style.cursor, "grab");
assert.equal(controls["#btitle"].textContent, "陸上　作戰");
assert.equal(controls["#bbelligerents"].textContent, "攻主　對　守主");
assert.equal(controls["#batkname"].textContent, "攻");
assert.equal(controls["#bdefname"].textContent, "守");
assert.equal(controls["#batktroops"].textContent, 1000);
assert.equal(controls["#bdeftroops"].textContent, 900);
assert.equal(controls["#batkmorale"].textContent, 100);
assert.equal(controls["#bdefmorale"].textContent, 80);
assert.equal(controls["#batk-troops-fill"].style.width, "65px");
assert.equal(controls["#batk-morale-fill"].style.width, "97px");
assert.equal(controls["#bdef-troops-fill"].style.width, "32px");
assert.equal(controls["#bdef-morale-fill"].style.width, "77px");
assert.equal(cardTroopsFills[0].style.width, "100%");
view.battle.units[0].troops = 50;
view._panelSignature = "";
view.syncBattlePanel();
assert.equal(
  cardTroopsFills[0].style.width,
  "50%",
  "each card's yellow line follows that group's current troop count",
);
view.battle.units[0].troops = 100;
view.battle.session.pool.write8(
  originalObjectAddress(0, 0, 0),
  ORIGINAL_OBJECT.HP,
  220,
);
view._panelSignature = "";
view.syncBattlePanel();
assert.equal(
  controls["#batkmorale"].textContent,
  200,
  "displayed morale is capped at the game's 200 maximum without changing HP",
);
assert.equal(
  view.battle.session.pool.read8(
    originalObjectAddress(0, 0, 0),
    ORIGINAL_OBJECT.HP,
  ),
  220,
);
view.battle.session.pool.write8(
  originalObjectAddress(0, 0, 0),
  ORIGINAL_OBJECT.HP,
  100,
);
view.battle.sideMap = { 0: "def", 1: "atk", atk: 1, def: 0 };
view.battle.playerSide = "def";
view._panelSignature = "";
view.syncBattlePanel();
assert.equal(controls["#batkname"].textContent, "守");
assert.equal(controls["#bdefname"].textContent, "攻");
assert.equal(controls["#batktroops"].textContent, 900);
assert.equal(controls["#bdeftroops"].textContent, 1000);
view.battle.sideMap = { 0: "atk", 1: "def", atk: 0, def: 1 };
view.battle.playerSide = "atk";
view._panelSignature = "";
view.syncBattlePanel();
assert.equal(controls["#battack"].disabled, false);
assert.equal(
  canvasTexts.some((text) => text.startsWith("攻 ")),
  false,
  "the non-original top-left strength summary is not drawn",
);

view.camera.y = 100;
const startX = view.camera.x;
const startY = view.camera.y;
listeners.get("pointerdown")({
  button: 0,
  pointerId: 1,
  clientX: 320,
  clientY: 200,
  preventDefault() {},
});
listeners.get("pointermove")({ pointerId: 1, clientX: 120, clientY: 100 });
assert.ok(
  view.camera.x > startX,
  "dragging left reveals the eastern battlefield",
);
assert.ok(
  view.camera.y > startY,
  "dragging up reveals the southern battlefield",
);
assert.equal(cv.style.cursor, "grabbing");
listeners.get("pointerup")({
  button: 0,
  pointerId: 1,
  clientX: 120,
  clientY: 100,
});
assert.equal(cv.style.cursor, "grab");

view.pan(-10000, -10000);
assert.equal(view.camera.x, BATTLE_SCENE_WIDTH - innerWidth);
assert.equal(
  view.camera.y,
  BATTLE_SCENE_HEIGHT - innerHeight,
  "floating windows leave the complete Canvas available for map panning",
);
view.pan(10000, 10000);
assert.equal(view.camera.x, 0);
assert.equal(view.camera.y, 0);
view.draw();

let autonomousVmSteps = 0;
const originalUnits = view.battle.units;
const originalSession = view.battle.session;
view.battle.units = [];
view.battle.session = new OriginalBattleSession({
  registers: { side0Active: 1, side1Active: 1 },
});
view.battleScriptVm = {
  step() {
    autonomousVmSteps++;
    return "run";
  },
};
app.tacticalSpeed = 4;
view.updateBattleFrames(0.032);
assert.equal(
  autonomousVmSteps,
  0,
  "32ms is below the user-approved half-speed 30Hz rule-frame interval",
);
view.updateBattleFrames(0.002);
assert.equal(
  autonomousVmSteps,
  1,
  "A426 advances without player input but highest speed stays at one visible logic frame per RAF",
);
for (const unsafeDelta of [
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
])
  view.updateBattleFrames(unsafeDelta);
assert.equal(
  autonomousVmSteps,
  1,
  "BattleView ignores negative and nonfinite elapsed deltas even at highest speed",
);
view.battle.units = originalUnits;
view.battle.session = originalSession;
app.tacticalSpeed = 2;

const persistentVm = {
  step() {
    return "run";
  },
};
view.battleScriptVm = persistentVm;
// Real registered DOM handlers feed the same deterministic input queue.
for (let index = 0; index < 16; index++) {
  formationButtons[index].handlers.click();
  assert.equal(view.panelState().selectedFormation, index);
  assert.equal(formationButtons[index]["aria-pressed"], "true");
}
for (const button of deploymentButtons) {
  button.handlers.click();
  assert.equal(
    view.panelState().side0FormationBase & 0xff,
    Number(button.dataset.baseX),
  );
  assert.equal(button["aria-pressed"], "true");
}
assert.equal(
  view.panelState().battlefieldHidden,
  false,
  "new battles have no visible suppression toggle",
);
view.battle.session.playerGroupStatusIcons = [0, 1, 2, 3, 4, 5];
view.syncBattlePanel();
assert.deepEqual(
  cardStatusIcons.map((icon) => Number(icon.dataset.command)),
  [2, 4, 0, 1, 5, 3],
);
assert.match(cardStatusIcons[0].style.backgroundImage, /battle_status_2\.png/);
controls["#bunit0"].handlers.click();
controls["#bunit1"].handlers.click();
assert.equal(view.panelState().selectedGroupMask, (1 << 2) | (1 << 4));
controls["#bunit1"].handlers.click();
assert.equal(view.panelState().selectedGroupMask, 1 << 2);
view.issueTacticalCommand("assault");
assert.equal(
  view.battleScriptVm,
  persistentVm,
  "tactical input must not stop the persistent A426 VM",
);
assert.equal(controls["#bcommandhint"].textContent, "所選部隊向敵軍突擊。");
assert.equal(cv.style.cursor, "grab", "ordinary command clears selection");
view.onClick(400, 240);
assert.equal(
  view.battle.units[0].order,
  undefined,
  "battlefield blank click cannot create legacy movement state",
);
assert.equal(view.panelState().selectedGroupMask, 0);
view.battle.mirror = true;
view.camera.x = 0;
view.camera.y = 312;
view.draw();
view.onClick(
  view.battle.units[0].x + view.ox,
  view.battle.units[0].y + view.oy,
);
assert.equal(
  view.panelState().selectedGroupMask,
  1 << 2,
  "CB9B changes tile bytes but never reflects object or hit-test coordinates",
);
view.battle.mirror = false;
view.issueTacticalCommand("attack");
assert.equal(controls["#bcommandhint"].textContent, "所選部隊攻擊敵軍。");
view.issueTacticalCommand("defend");
assert.equal(controls["#bcommandhint"].textContent, "所選部隊原地守陣。");
assert.equal(controls["#bdialogue-atk"].dataset.kind ?? "", "");
assert.equal(
  controls["#bdialogue-atk-text"].textContent,
  "",
  "queued buttons must not invent speech before a decoded native event",
);
assert.equal(view.battle.units[0].order, undefined);
assert.equal(controls["#bcommandhint"].textContent, "所選部隊原地守陣。");
view.issueTacticalCommand("assault");
assert.equal(controls["#bcommandhint"].textContent, "所選部隊向敵軍突擊。");
view.issueTacticalCommand("formation");
assert.equal(
  controls["#bcommandhint"].textContent,
  "所選部隊按選定陣形與部署位置列陣。",
);
view.issueTacticalCommand("retreat");
assert.equal(view.battle.units[0].routed, false);
assert.equal(view.panelState().selectedGroupMask, 0);

{
  const pool = new OriginalBattleObjectPool();
  pool.write8(0x600, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write8(0x600, ORIGINAL_OBJECT.CLASS, 0x24);
  pool.write8(0x600, ORIGINAL_OBJECT.STATE, 0x08);
  pool.write8(0x600, ORIGINAL_OBJECT.DIRECTION, 3);
  pool.write8(0x600, ORIGINAL_OBJECT.ANCHOR_X, 0x20);
  pool.write8(0x600, ORIGINAL_OBJECT.ANCHOR_Y, 0x18);
  const renderSession = new OriginalBattleSession();
  renderSession.pool = pool;
  view.battle.session = renderSession;
  const sprite = view.originalObjectSprite(0x600);
  assert.equal(sprite.frame, 90 + 0x24 + 0x08 + 6);
  assert.deepEqual(sprite.point, { x: 912, y: 512 });

  // 9E10/BB10：城市属性对象才是城头军旗；不是部队组长的附加贴图。
  const flagAddress = 0x0e00;
  renderSession.mapObjects.write16(flagAddress, 0x00, 0x03c0);
  renderSession.mapObjects.write8(flagAddress, 0x06, 40);
  renderSession.mapObjects.write8(flagAddress, 0x08, 38);
  renderSession.mapObjects.write8(flagAddress, 0x0a, 5);
  renderSession.mapObjects.write8(flagAddress, 0x1b, 2);
  renderSession.mapObjects.write16(flagAddress, 0x1c, 0x0204);
  renderSession.attributeDisplays.set(flagAddress, {
    address: flagAddress,
    x: 40,
    y: 38,
    level: 5,
    phase: 2,
    code: 0x0208,
    pair: true,
    attribute: true,
  });
  const [wallFlag] = view.originalAttributeSprites();
  assert.equal(wallFlag.frame, 164);
  assert.deepEqual(wallFlag.point, { x: 1264, y: 480 });
  renderSession.mapObjects.write8(flagAddress, 0x00, 0);

  const backLayer = {};
  const frontLayer = {};
  view.unitImg = {};
  view.sceneReady = true;
  view.terrainLayers = [
    { depth: -9, image: backLayer, x: 0, y: 0 },
    { depth: -7, image: frontLayer, x: 0, y: 0 },
  ];
  const paintOrder = [];
  ctx.drawImage = (source) => paintOrder.push(source);
  view.drawBattlefieldLayers(ctx);
  assert.deepEqual(
    paintOrder,
    [
      view.sceneCanvas,
      backLayer,
      view.unitImg,
      view.unitImg,
      view.unitImg,
      view.unitImg,
      frontLayer,
    ],
    "terrain with greater y-x depth occludes captured SCH unit and attribute pairs behind it",
  );
}

const indexHtml = await fs.readFile(
  new URL("../web/index.html", import.meta.url),
  "utf8",
);
assert.match(indexHtml, /battle-operation-header battle-floating-window/);
assert.match(indexHtml, /battle-enemy-window battle-floating-window/);
assert.match(indexHtml, /battle-player-window battle-floating-window/);
assert.match(indexHtml, /top: calc\(16px \* var\(--battle-ui-scale\)\)/);
assert.match(indexHtml, /bottom: calc\(16px \* var\(--battle-ui-scale\)\)/);
assert.match(
  indexHtml,
  /\.battle-operation-header \{[^}]*left: calc\(16px \* var\(--battle-ui-scale\)\)/,
);
assert.match(
  indexHtml,
  /#battle-bottom-bar \{[^}]*left: calc\(16px \* var\(--battle-ui-scale\)\)/,
);
assert.equal(
  indexHtml.match(/class="battle-window-frame"/g)?.length,
  5,
  "three information windows and two tactical speech windows reuse the popup frame constructor",
);
assert.match(indexHtml, /data-window-cols="12" data-window-rows="5"/);
assert.match(indexHtml, /data-window-cols="12" data-window-rows="7"/);
assert.match(indexHtml, /data-window-cols="12" data-window-rows="18"/);
assert.doesNotMatch(
  indexHtml,
  /\.battle-floating-window \{[^}]*\bborder:/,
  "the shared popup constructor, not CSS, owns all four textured borders",
);
assert.doesNotMatch(indexHtml, /frame_(?:sq|col|cap)\.png/);
assert.doesNotMatch(indexHtml, /#bctl \{[^}]*background: #000/);
assert.doesNotMatch(indexHtml, /#battle-bottom-bar \{[^}]*left: 50%/);
assert.match(indexHtml, /\.battle-stats-row \{[\s\S]*?font-size: calc\(16px/);
assert.match(indexHtml, /\.battle-stat-number \{[\s\S]*?font-family: "Oswald"/);
assert.match(
  indexHtml,
  /id="bdefname" class="battle-banner-name">守方<\/span>/,
);
assert.match(
  indexHtml,
  /id="batkname" class="battle-banner-name">攻方<\/span>/,
);
assert.match(indexHtml, /id="bdef-troops-fill"/);
assert.match(indexHtml, /id="bdef-morale-fill"/);
assert.match(indexHtml, /id="bdeftroops" class="battle-stat-number">0<\/span>/);
assert.match(indexHtml, /id="batktroops" class="battle-stat-number">0<\/span>/);
assert.doesNotMatch(indexHtml, /id="(?:batk|bdef)troops"[^>]*>0<\/span>人/);
assert.doesNotMatch(indexHtml, /battle_card_slot_[0-5]\.png/);
assert.doesNotMatch(
  indexHtml,
  /battle_(?:speed_btn|btn_(?:assault|attack|formation|wall|defend|retreat))\.png/,
);
assert.match(indexHtml, /class="battle-card-status"/);
assert.equal(indexHtml.match(/class="battle-card-troops-fill"/g)?.length, 6);
assert.match(
  indexHtml,
  /battle-card-role-label">左翼<[\s\S]*battle-card-role-label">左備<[\s\S]*battle-card-role-label">大將<[\s\S]*battle-card-role-label">先鋒<[\s\S]*battle-card-role-label">右備<[\s\S]*battle-card-role-label">右翼</,
);
assert.match(
  indexHtml,
  /\.battle-card-troops-fill \{[\s\S]*?background: #ffd000/,
);
assert.match(indexHtml, /#battle-bottom-bar \{[\s\S]*?width: calc\(624px/);
assert.match(indexHtml, /\.battle-side-progress \{[\s\S]*?width: calc\(160px/);
assert.doesNotMatch(
  indexHtml,
  /battle-display-(?:btn|toggle)|mini-?map/i,
  "cancelled controls have no DOM or CSS",
);
assert.match(indexHtml, /\.battle-card-role-label \{[\s\S]*?width: calc\(40px/);
assert.match(indexHtml, /class="battle-card-role-label">大將<\/span>/);
assert.doesNotMatch(indexHtml, /class="battle-card-role-label">主將<\/span>/);
assert.equal(
  indexHtml.match(/<button class="battle-symbol-btn/g)?.length,
  16,
  "C11A subdivides ID3 into 16 formation choices",
);
assert.match(
  indexHtml,
  /\.battle-symbols-grid \{[\s\S]*?width: calc\(128px[\s\S]*?height: calc\(32px[\s\S]*?background: transparent;[\s\S]*?border: 0;/,
  "the two original formation rows have no enclosing frame",
);
assert.match(
  indexHtml,
  /\.battle-symbol-btn\.active::after \{ border-color: #f0e000; \}/,
  "only the selected 16x16 button receives the yellow frame",
);
assert.equal(
  indexHtml.match(/<button class="battle-deployment-btn/g)?.length,
  3,
);
const battleViewSource = await fs.readFile(
  new URL("../web/src/render/battleview.js", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  battleViewSource,
  /battle-display-toggle|mini-?map/i,
  "no cancelled-control listener, hit-test or renderer",
);
assert.match(
  battleViewSource,
  /const windowBuilder = this\.app\.gamebar\?\._drawWindow/,
  "battle windows must reuse GameBar's common popup constructor",
);

if (previousDocument === undefined) delete globalThis.document;
else globalThis.document = previousDocument;
if (previousInnerWidth === undefined) delete globalThis.innerWidth;
else globalThis.innerWidth = previousInnerWidth;
if (previousInnerHeight === undefined) delete globalThis.innerHeight;
else globalThis.innerHeight = previousInnerHeight;

process.stdout.write(
  "battle viewport OK: continuous enemy strategy + original command UI mapping\n",
);
