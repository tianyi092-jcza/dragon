import assert from "node:assert/strict";

class ImageStub {}
globalThis.Image = ImageStub;
const { BattleView } = await import("../web/src/render/battleview.js");
const { FIELD } = await import("../web/src/game/tacticalbattle.js");

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
        addEventListener() {},
        disabled: false,
        textContent: "",
        removeAttribute() {},
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
    "#bsiege",
    "#bformation",
    "#bwall",
    "#bdefend",
    "#bretreat",
    "#bctl",
    "#btitle",
    "#batkname",
    "#bdefname",
    "#batktroops",
    "#bdeftroops",
    "#batkmorale",
    "#bdefmorale",
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
        return controls[selector];
    },
};

const app = {
    scenario: { player_faction: 0 },
    hud: { flashEvent() {} },
};
const view = new BattleView(cv, app);
view.active = true;
view.battle = {
    kind: "field",
    A: { faction: 0, leader: "攻" },
    D: { faction: 1, leader: "守" },
    city: null,
    mirror: false,
    speakers: { atk: { name: "攻" }, def: { name: "守" } },
    dialogues: [],
    nextDialogueSequence: 0,
    units: [
        {
            side: "atk",
            idx: 0,
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

view.focusCameraOnPlayer();
view.updateCursor();
view.draw();
assert.equal(view.s, 1, "battlefield must stay at native 1:1 scale");
assert.ok(
    Object.is(view.ox, 0) || Object.is(view.ox, -0),
    "player-side focus clamps to the west battlefield edge",
);
assert.equal(view.oy, -(FIELD / 2 - innerHeight / 2));
assert.equal(cv.style.cursor, "grab");
assert.equal(controls["#batktroops"].textContent, 100);
assert.equal(controls["#bdeftroops"].textContent, 90);
assert.equal(controls["#bunit0"].textContent, "1\n100");
assert.equal(controls["#bsiege"].disabled, true);
assert.equal(controls["#bwall"].disabled, true);

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
listeners.get("pointerup")({ pointerId: 1, clientX: 120, clientY: 100 });
assert.equal(cv.style.cursor, "grab");

view.pan(-10000, -10000);
assert.equal(view.camera.x, FIELD - (innerWidth - 144));
assert.equal(view.camera.y, FIELD - innerHeight);
view.pan(10000, 10000);
assert.equal(view.camera.x, 0);
assert.equal(view.camera.y, 0);
view.draw();

const persistentVm = {
    step() {
        return "run";
    },
};
view.battleScriptVm = persistentVm;
view.selectPlayerUnit(0);
assert.equal(view.sel, view.battle.units[0]);
view.issueTacticalCommand("assault");
assert.equal(
    view.battleScriptVm,
    persistentVm,
    "tactical input must not stop the persistent A426 VM",
);
assert.equal(controls["#bcommandhint"].textContent, "所選部隊向敵軍突擊。");
assert.equal(cv.style.cursor, "crosshair");
view.onClick(400, 240);
assert.equal(
    view.sel.order,
    undefined,
    "battlefield blank click cannot create legacy movement state",
);
view.issueTacticalCommand("defend");
assert.equal(controls["#bcommandhint"].textContent, "所選部隊原地守陣。");
assert.equal(controls["#bdialogue-atk-name"].textContent, "攻");
assert.equal(
    controls["#bdialogue-atk-text"].textContent,
    "守住陣地，不可妄動！",
);
assert.equal(view.sel.order, undefined);
assert.equal(controls["#bcommandhint"].textContent, "所選部隊原地守陣。");
view.issueTacticalCommand("assault");
assert.equal(controls["#bcommandhint"].textContent, "所選部隊向敵軍突擊。");
view.issueTacticalCommand("formation");
assert.equal(
    controls["#bcommandhint"].textContent,
    "所選部隊在當前位置重新集結列陣。",
);
view.issueTacticalCommand("retreat");
assert.equal(view.battle.units[0].routed, false);
assert.equal(view.sel, null);

if (previousDocument === undefined) delete globalThis.document;
else globalThis.document = previousDocument;
if (previousInnerWidth === undefined) delete globalThis.innerWidth;
else globalThis.innerWidth = previousInnerWidth;
if (previousInnerHeight === undefined) delete globalThis.innerHeight;
else globalThis.innerHeight = previousInnerHeight;

process.stdout.write(
    "battle viewport OK: full scene + tactical commands + dual dialogue boxes\n",
);
