// Modern UI policy tests. Real decoded captures/VM/Session, fake wall time and
// DOM/Image surfaces; not a browser smoke or a replacement KI timer oracle.
import assert from "node:assert/strict";
import fs from "node:fs";
import { BattleDialoguePresentation } from "../web/src/ui/battledialogue.js";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
import { originalTalkContext } from "../web/src/game/battle/originalmessages.js";
import { ORIGINAL_OBJECT as O } from "../web/src/game/battle/originalstate.js";
import {
  createFieldBattle,
  queueTacticalCommand,
} from "../web/src/game/tacticalbattle.js";
import { BattleView } from "../web/src/render/battleview.js";
import { GameBar } from "../web/src/ui/gamebar.js";
import { attachInput } from "../web/src/core/input.js";

const json = (name) => {
  try {
    return JSON.parse(fs.readFileSync(`web/${name}.json`, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${name}.json`, { cause: error });
  }
};
const catalog = json("battle_talk"),
  scripts = json("battle_scripts");
const maps = json("battle_maps");
maps.navigation = json("battle_navigation");
maps.formationVectors = json("battle_rules").formationVectors;
const generals = Array.from({ length: 128 }, (_, idx) => ({
  idx,
  name: `將${idx}`,
  portrait: idx,
  talk_idx: 0,
  battle_formation: 0,
  ability: { force: 8, lead: 7, field: 3, siege: 3 },
}));
const sc = {
  player_faction: 0,
  generals,
  factions: [{ idx: 0, advisor_idx: 4 }],
};
const legion = (faction, slot, generalIdx = faction) => ({
  faction,
  slot,
  generalIdx,
  leader: generals[generalIdx].name,
  morale: 200,
  troops: 100,
  units: [
    { type: 1, troops: 1000 },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 })),
  ],
});
const context = originalTalkContext(sc, [legion(0, 2), legion(1, 3)]);
const session = () =>
  new OriginalBattleSession({
    talkCatalog: catalog,
    talkContext: context,
    registers: { side0Active: 1, side1Active: 1 },
  });

class FakeTime {
  value = 0;
  id = 0;
  pending = new Map();
  now = () => this.value;
  schedule = (callback, ms) => {
    const id = ++this.id;
    this.pending.set(id, { at: this.value + ms, callback });
    return id;
  };
  cancel = (id) => this.pending.delete(id);
  jump(ms, fire = true) {
    this.value += ms;
    if (fire) {
      for (const [id, timer] of [...this.pending]) {
        if (timer.at > this.value) continue;
        this.pending.delete(id);
        timer.callback();
      }
    }
  }
}
function presentation(time = new FakeTime(), callbacks = {}) {
  const visible = [null, null];
  const p = new BattleDialoguePresentation({
    now: time.now,
    schedule: time.schedule,
    cancel: time.cancel,
    show: (capture, entry) => {
      visible[capture.side] = capture;
      callbacks.show?.(capture, entry);
    },
    hide: (side) => {
      visible[side] = null;
      callbacks.hide?.(side);
    },
  });
  return { p, time, visible };
}
function readOnly(s, action) {
  const before = s.snapshot();
  const refs = [
    s.registers,
    s.events,
    s.messages,
    s.messages.slots,
    s.queue,
    s.rng,
  ];
  action();
  assert.deepEqual(
    s.snapshot(),
    before,
    "UI must not change full Session/RNG/queue snapshots",
  );
  for (const [i, ref] of [
    s.registers,
    s.events,
    s.messages,
    s.messages.slots,
    s.queue,
    s.rng,
  ].entries())
    assert.equal(ref, refs[i]);
}

// Exact 2999/3000ms independent of early native expiry (no local-input writes).
{
  const s = session(),
    { p, time, visible } = presentation();
  p.start(s.events, s.messages.slots);
  s.emitTalk(0, 0x1b7, "test");
  readOnly(s, () => p.sync(s.events));
  assert.equal(visible[0].text, "啊啊，我就是將2，\n來一決勝負！！！");
  for (let n = 0; n < 60; n++) s.tick();
  assert.equal(s.messages.slots[0], null);
  readOnly(s, () => p.sync(s.events));
  assert.ok(visible[0], "raw close cannot shorten presentation");
  readOnly(s, () => time.jump(2999));
  assert.ok(visible[0]);
  readOnly(s, () => time.jump(1));
  assert.equal(visible[0], null);
  p.sync(s.events);
  assert.equal(visible[0], null);
}

// Same-deadline native AX deferral outlives modern UI, no resurrection.
{
  const s = session(),
    { p, time, visible } = presentation();
  s.emitTalk(0, 0x1b7);
  s.emitTalk(1, 0x1b8);
  p.start(s.events, s.messages.slots);
  for (let n = 0; n < 60; n++) s.tick();
  assert.equal(s.messages.slots[0], null);
  assert.ok(s.messages.slots[1]);
  p.sync(s.events);
  time.jump(2999);
  assert.ok(visible.every(Boolean));
  readOnly(s, () => time.jump(1));
  assert.deepEqual(visible, [null, null]);
  assert.ok(s.messages.slots[1]);
  for (let n = 0; n < 256; n++) s.tick();
  p.sync(s.events);
  assert.deepEqual(visible, [null, null]);
}

// Two independent slots; identical new events still own distinct serials.
// Simulate already-queued cancelled callbacks and an early firing timer.
{
  const s = session(),
    { p, time, visible } = presentation();
  p.start(s.events, s.messages.slots);
  s.emitTalk(0, 0x1b1);
  s.emitTalk(1, 0x1b8);
  p.sync(s.events);
  const first = p.slots[0],
    stale = time.pending.get(first.timer).callback;
  time.jump(1000);
  s.emitTalk(0, 0x1b1);
  p.sync(s.events);
  assert.ok(p.slots[0].serial > first.serial);
  const replacement = p.slots[0];
  stale();
  assert.equal(p.slots[0], replacement);
  const early = time.pending.get(replacement.timer).callback;
  time.pending.delete(replacement.timer);
  early();
  assert.equal(p.slots[0], replacement);
  time.jump(1999);
  assert.ok(visible.every(Boolean));
  time.jump(1);
  assert.ok(visible[0]);
  assert.equal(visible[1], null);
  time.jump(999);
  assert.ok(visible[0]);
  time.jump(1);
  assert.equal(visible[0], null);
  for (let i = 0; i < 10; i++) p.sync(s.events);
  assert.deepEqual(visible, [null, null]);
  s.emitTalk(0, 0x1b7);
  p.sync(s.events);
  s.emitTalk(0, 0xffff);
  p.sync(s.events);
  assert.equal(
    visible[0],
    null,
    "unknown selectors do not leave stale/invented speech",
  );
  assert.equal(s.messages.slots[0].status, "unresolved-talk-index");
  s.messages
    .showWall(s.registers, 48, 0x80, 0xc00)
    .forEach((e) => s.recordMessageEvent(e));
  readOnly(s, () => {
    p.sync(s.events);
    p.dismissAll();
    time.jump(3000);
  });
  assert.equal(
    s.messages.wall.metric,
    48,
    "C407 is not ordinary spoken dialogue",
  );
}

// Throttled background timeout: deadline checked before repaint; lifecycle
// cancellation cannot close a new view even if old callbacks are already queued.
{
  const s = session(),
    { p, time, visible } = presentation();
  s.emitTalk(0, 0x1b7);
  p.start(s.events, s.messages.slots);
  const stale = time.pending.get(p.slots[0].timer).callback;
  time.jump(5000, false);
  assert.ok(visible[0]);
  readOnly(s, () => p.sync(s.events));
  assert.equal(visible[0], null);
  p.dispose();
  assert.equal(time.pending.size, 0);
  p.start(s.events, s.messages.slots);
  const next = p.slots[0];
  stale();
  assert.equal(p.slots[0], next);
  readOnly(s, () => p.dismissAll());
  p.sync(s.events);
  assert.equal(visible[0], null);
  s.emitTalk(0, 0x1b7);
  p.sync(s.events);
  assert.ok(visible[0]);
  p.dispose();
  assert.equal(time.pending.size, 0);
  p.sync(s.events);
  assert.equal(visible[0], null);
}

// Native snapshots stay data-only and exact. A new view uses retained endpoint
// slots with a fresh lifetime, not historical event replay or serialized timers.
{
  const s = session(),
    { p, time } = presentation();
  s.emitTalk(0, 0x1b7);
  s.emitTalk(1, 0x1b8);
  for (let n = 0; n < 60; n++) s.tick();
  p.start(s.events, s.messages.slots);
  time.jump(3000);
  const saved = s.snapshot(),
    twin = session();
  twin.restore(saved);
  assert.deepEqual(twin.snapshot(), saved);
  const second = presentation();
  second.p.start(twin.events, twin.messages.slots);
  assert.equal(
    second.visible[0],
    null,
    "closed historical show events aren't replayed",
  );
  assert.equal(second.visible[1].text, saved.messages.slots[1].text);
  second.time.jump(2999);
  assert.ok(second.visible[1]);
  second.time.jump(1);
  assert.equal(second.visible[1], null);
  for (let n = 0; n < 256; n++) {
    s.tick();
    twin.tick();
  }
  assert.deepEqual(s.snapshot(), twin.snapshot());
  p.dispose();
  second.p.dispose();
}

// Minimal DOM + deliberately deferred original portrait loads for production
// BattleView rendering/routing tests. No fake rule handlers or hand-written text.
const controls = new Map(),
  images = new Map();
const ctx = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
const element = () => ({
  dataset: {},
  style: {},
  textContent: "",
  src: "",
  classList: { toggle() {} },
  setAttribute() {},
  removeAttribute(key) {
    this[key] = "";
  },
  querySelector() {
    return element();
  },
  getContext: () => ctx,
});
globalThis.document = {
  hidden: false,
  querySelector(selector) {
    if (!controls.has(selector)) controls.set(selector, element());
    return controls.get(selector);
  },
  querySelectorAll() {
    return [];
  },
};
globalThis.Image = class {
  set src(value) {
    this.url = value;
    images.set(value, this);
  }
  get src() {
    return this.url;
  }
};
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function production(defending = false) {
  const a = legion(0, 2),
    d = legion(1, 3);
  const battle = createFieldBattle(
    sc,
    defending ? d : a,
    defending ? a : d,
    maps,
    { directoryIndex: 0xc0 },
  );
  const view = Object.create(BattleView.prototype);
  Object.assign(view, {
    battle,
    active: true,
    app: {
      battleMaps: maps,
      battleScripts: scripts,
      tacticalSpeed: 5,
      clock: { hold: true },
      hud: { flashEvent() {} },
    },
    camera: { x: 0, y: 0 },
    s: 1,
    cv: { width: 1024, height: 768, style: {}, releasePointerCapture() {} },
    ctx,
    sceneCanvas: element(),
    terrainLayers: [],
    sceneReady: false,
    _panelSignature: "",
    _openGeneration: 1,
    composeBattlefield() {},
    commitNativeDisplay() {},
    originalDisplayProcess: {
      startBattle() {
        return { boundary: battle.session.nativeDisplayBoundary, writes: 0 };
      },
      commit() {
        return { boundary: battle.session.nativeDisplayBoundary, writes: 0 };
      },
      endBattle() {},
    },
  });
  const s = battle.session;
  s.messages.catalog = catalog;
  view.startBattleScript();
  s.pool.bytes.fill(0);
  s.temps.bytes.fill(0);
  s.effects.bytes.fill(0);
  s.spatial.bytes.fill(0);
  s.spatial.tiles.fill(1);
  s.spatial.tileAttributes.fill(0);
  Object.assign(s.registers, { side0Active: 1, side1Active: 1, mode: 1 });
  for (const [address, x, y] of [
    [0, 20, 20],
    [0x600, 40, 40],
  ]) {
    for (const [field, value] of [
      [O.FLAGS, 0xc0],
      [O.HP, 180],
      [O.ANCHOR_X, x],
      [O.PREVIOUS_X, x],
      [O.ANCHOR_Y, y],
      [O.PREVIOUS_Y, y],
      [O.POSITION_X, x],
      [O.POSITION_Y, y],
      [O.CURRENT_COMMAND, 8],
      [O.PENDING_COMMAND, 8],
    ])
      s.pool.write8(address, field, value);
    s.pool.write16(address, O.TARGET_X, x | (y << 8));
    s.pool.write16(address, O.SPATIAL_0C, y * 64 + x);
    s.pool.write16(address, O.SPATIAL_0E, y * 64 + x);
  }
  const ui = presentation(new FakeTime(), {
    show: (c, e) => view.showBattleDialogue(c, e),
    hide: (side) => view.hideBattleDialogue(side),
  });
  view.dialoguePresentation = ui.p;
  ui.p.start(s.events, s.messages.slots);
  return { view, s, ...ui };
}

for (const defending of [false, true]) {
  const { view, s, p, time, visible } = production(defending);
  const rng = s.rng.snapshot();
  queueTacticalCommand(view.battle, { groups: [0], command: "attack" });
  view.updateBattleFrames(0.05); // real queued C1B9 -> original exported VM -> A065
  assert.equal(s.frame, 1);
  assert.equal(s.messages.slots[0].index, 630);
  assert.equal(s.messages.slots[1].index, 1006);
  readOnly(s, () => {
    view.draw();
    view.draw();
    view.syncBattlePanel();
  });
  assert.ok(visible.every(Boolean));
  const playerName = defending ? "def" : "atk";
  assert.equal(
    document.querySelector(`#bdialogue-${playerName}-name`).textContent,
    "將2",
  );
  assert.equal(
    document.querySelector(`#bdialogue-${playerName}-text`).textContent,
    s.messages.slots[0].text,
  );
  assert.ok(images.has("kao/2.png"));
  assert.ok(!images.has("kao/0.png"));
  // Another fixed frame while visible; no FIFO, command lock or rule pause.
  view.updateBattleFrames(0.05);
  assert.equal(s.frame, 2);
  assert.ok(visible[0]);
  assert.deepEqual(s.rng.snapshot(), rng);
  readOnly(s, () => {
    time.jump(2999);
    view.draw();
  });
  assert.ok(visible[0]);
  readOnly(s, () => {
    time.jump(1);
    view.draw();
  });
  assert.deepEqual(visible, [null, null]);
  assert.ok(
    s.messages.slots[0],
    "modern timeout does not clear the raw marker/capture",
  );
  p.dispose();
}

// Global contextmenu currently routes attachInput -> GameBar.click. Preserve
// system/settings priority, then consume battle right clicks anywhere (even empty).
{
  const { view, s, p, time, visible } = production();
  s.emitTalk(0, 0x1b7);
  s.emitTalk(1, 0x1b8);
  view.syncBattleDialogue();
  const bar = Object.create(GameBar.prototype);
  let settingsDraws = 0;
  Object.assign(bar, {
    layout() {},
    syncClock() {},
    settingsOpen: true,
    app: {
      battleView: view,
      view: {
        draw() {
          settingsDraws++;
        },
      },
    },
  });
  bar.click(9999, 9999, 2);
  assert.equal(settingsDraws, 1);
  assert.ok(visible.every(Boolean));
  // Neither drag release nor right pointerup may select a unit / queue a command.
  let unintendedClick = 0;
  view.onClick = () => unintendedClick++;
  view.drag = { pointerId: 7, moved: false };
  view.onPointerUp({ button: 2, pointerId: 7 });
  assert.equal(unintendedClick, 0);
  const listeners = new Map();
  const addEventListener = (type, handler) => listeners.set(type, handler);
  globalThis.window = { addEventListener };
  globalThis.addEventListener = addEventListener;
  let mapActions = 0;
  attachInput(
    { cv: { addEventListener }, pick: () => ({ type: "city" }) },
    {
      onSelect: (target, e) => {
        if (bar.click(e.clientX, e.clientY, e.button, target)) return;
        mapActions++;
      },
    },
  );
  let prevented = false;
  readOnly(s, () =>
    listeners.get("contextmenu")({
      button: 2,
      clientX: -9999,
      clientY: -9999,
      preventDefault() {
        prevented = true;
      },
    }),
  );
  assert.equal(prevented, true);
  assert.equal(mapActions, 0);
  assert.equal(view.drag, null);
  assert.deepEqual(visible, [null, null]);
  readOnly(s, () => {
    view.syncBattleDialogue();
    bar.click(0, 0, 2);
    time.jump(3000);
  });
  assert.equal(unintendedClick, 0);
  assert.ok(s.messages.slots[0]);
  // Existing semantic local close API remains functional and independent.
  s.messageInput(27, 2);
  assert.equal(s.messages.slots[0], null);
  s.emitTalk(0, 0x1b1);
  view.syncBattleDialogue();
  assert.ok(visible[0]);
  p.dispose();
}

// Slow faces cannot resurrect after dismissal/exit, nor overwrite a different
// slot identity on replacement or reentry. Hidden display starts are deferred.
{
  const { view, s, p, time, visible } = production();
  view.clearBattleDialogue();
  view.dialoguePendingStart = true;
  s.emitTalk(0, 0x1b7);
  document.hidden = true;
  view.syncBattleDialogue();
  assert.equal(visible[0], null);
  time.jump(8000);
  document.hidden = false;
  view.syncBattleDialogue();
  assert.ok(visible[0]);
  const old = p.slots[0],
    stale = time.pending.get(old.timer).callback;
  s.messages.context.speakers[0].portrait = 5;
  s.emitTalk(0, 0x1b1);
  view.syncBattleDialogue();
  images.get("kao/2.png").onload();
  await flush();
  assert.equal(document.querySelector("#bdialogue-atk-face").src, "");
  images.get("kao/5.png").onload();
  await flush();
  assert.equal(document.querySelector("#bdialogue-atk-face").src, "kao/5.png");
  readOnly(s, () => view.clearBattleDialogue());
  assert.equal(time.pending.size, 0);
  view.dialoguePendingStart = true;
  view.syncBattleDialogue();
  const next = p.slots[0];
  stale();
  assert.equal(p.slots[0], next);
  time.jump(2999);
  assert.ok(visible[0]);
  time.jump(1);
  assert.equal(visible[0], null);
  images.get("kao/3.png").onload();
  await flush();
  assert.equal(document.querySelector("#bdialogue-atk").dataset.kind, "");
  // Finish uses this same teardown before callback/strategic return.
  globalThis.cancelAnimationFrame = () => {};
  let exitCalls = 0;
  view.onFinish = () => exitCalls++;
  s.registers.side1Active = 0;
  s.tick();
  assert.equal(s.finished, true);
  view.finish();
  assert.equal(exitCalls, 1);
  assert.equal(view.active, false);
  assert.equal(p.active, false);
  assert.equal(time.pending.size, 0);
}

// Real async open/open and finish/open boundaries: stale resource completion
// must not run startup or RAF against the newer battle. Startup itself is real,
// still synchronous, and intentionally not redesigned by this presentation lane.
{
  document.createElement = () => element();
  globalThis.fetch = async (url) =>
    String(url).includes("battle_display.bin")
      ? {
          ok: true,
          arrayBuffer: async () => new Uint8Array(299520).buffer,
        }
      : { ok: true, json: async () => catalog };
  let rafSerial = 0;
  const raf = new Map();
  globalThis.requestAnimationFrame = (callback) => {
    raf.set(++rafSerial, callback);
    return rafSerial;
  };
  globalThis.cancelAnimationFrame = (id) => raf.delete(id);
  const first = production(),
    second = production();
  const { view, s, p, time } = first;
  s.emitTalk(0, 0x1b7);
  view.syncBattleDialogue();
  const staleTimer = time.pending.get(p.slots[0].timer).callback;
  const before = s.snapshot();
  let firstFinished = 0,
    secondFinished = 0;
  Object.assign(view.app.clock, {
    hold: false,
    _legacyPaused: false,
    strategicSpeed: 2,
  });
  const oldOpen = view.open(first.view.battle, () => firstFinished++);
  assert.equal(view.app.clock.hold, true);
  const newOpen = view.open(second.view.battle, () => secondFinished++);
  assert.equal(time.pending.size, 0);
  assert.equal(p.active, false);
  for (const [url, image] of images)
    if (url.includes("battle_terrain_") || url.includes("battle_units"))
      image.onload();
  await Promise.all([oldOpen, newOpen]);
  assert.equal(view.battle, second.view.battle);
  assert.equal(view.active, true);
  assert.deepEqual(
    s.snapshot(),
    before,
    "obsolete open must not run old startup",
  );
  assert.equal(raf.size, 1);
  const owner = [...p.slots];
  staleTimer();
  assert.deepEqual(p.slots, owner);
  const activeSession = view.battle.session;
  if (!activeSession.finished) {
    activeSession.registers.side1Active = 0;
    activeSession.tick();
  }
  view.finish();
  assert.equal(firstFinished, 0);
  assert.equal(secondFinished, 1);
  assert.equal(
    view.app.clock.hold,
    false,
    "overlapping open preserves original strategic hold",
  );
  assert.equal(view.app.clock._legacyPaused, false);
  assert.equal(view.app.clock.strategicSpeed, 2);
  assert.equal(raf.size, 0);
  assert.equal(time.pending.size, 0);
  assert.equal(p.active, false);
  const third = production();
  await view.open(third.view.battle, () => {}); // assets now cached; new generation
  assert.equal(view.active, true);
  assert.equal(view.battle, third.view.battle);
  staleTimer();
  assert.equal(p.active, true);
  third.s.registers.side1Active = 0;
  third.s.tick();
  view.finish();
}

console.log(
  "battle dialogue presentation OK: 2999/3000ms, raw early/AX-late independence, replacement serials, stale timers/faces, global hierarchy, real input/VM/ticks/render/RNG, background, teardown and snapshot endpoint",
);
