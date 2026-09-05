import assert from "node:assert/strict";

// HUD can be exercised without constructing its legacy DOM panels.
globalThis.window = {};
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    style: {},
    dataset: {},
    addEventListener() {},
    append() {},
  }),
};
globalThis.Image = class {};

const { HUD } = await import("../web/src/ui/hud.js");
const { GameBar } = await import("../web/src/ui/gamebar.js");

const free = {
  idx: 0,
  name: "甲　",
  faction: 0,
  active: true,
  status: 0,
  ability: {
    force: 11,
    lead: 12,
    politics: 13,
    siege: 4,
    field: 5,
    naval: 6,
  },
};
const commander = {
  idx: 1,
  name: "乙",
  faction: 0,
  active: true,
  status: 1,
  ability: {
    force: 9,
    lead: 8,
    politics: 7,
    siege: 3,
    field: 2,
    naval: 1,
  },
};
const scenario = {
  player_faction: 0,
  factions: [{ idx: 0, monarch: "曹操" }],
  generals: [free, commander],
  legions: [],
  cities: [],
  envoys: {},
};

function capture(method) {
  let options = null;
  const gamebar = {
    listDialog: null,
    openListDialog(next) {
      options = next;
      this.listDialog = { selectedRow: -1 };
    },
    showGeneralCard() {},
    showFormationDialog() {},
  };
  method.call({ app: { scenario, gamebar } });
  return options;
}

const expectedHeader = [
  "武將名",
  "武術",
  "統率",
  "政治",
  "攻城",
  "野戰",
  "水戰",
  "勢力",
  "身分",
];

const generals = capture(HUD.prototype.showGenerals);
assert.deepEqual(generals.header, expectedHeader);
assert.equal(generals.w, 624);
assert.equal(generals.cols.length, expectedHeader.length);
assert.deepEqual(generals.rows[0].cells, [
  "甲",
  "11",
  "12",
  "13",
  "4",
  "5",
  "6",
  "曹操",
  "－－－",
]);
assert.deepEqual(generals.rows[1].cells.slice(4, 7), ["3", "2", "1"]);

const selectedGeneralRow = generals.rows[0];
const sortHarness = {
  listDialog: {
    ...generals,
    sortable: true,
    selectedRow: 0,
    hover: -1,
    scroll: 0,
    sortColumn: -1,
    sortDirection: 0,
    _rowOrder: new Map(generals.rows.map((row, index) => [row, index])),
  },
};
assert.equal(GameBar.prototype._sortListDialog.call(sortHarness, 5), true);
assert.strictEqual(sortHarness.listDialog.rows[0]._gen, commander);
assert.strictEqual(
  sortHarness.listDialog.rows[sortHarness.listDialog.selectedRow],
  selectedGeneralRow,
);

const formation = capture(HUD.prototype.showFormation);
assert.deepEqual(formation.header, expectedHeader);
assert.equal(formation.w, 624);
assert.equal(formation.cols.length, expectedHeader.length);
assert.equal(formation.rows.length, 1);
assert.strictEqual(formation.rows[0]._gen, free);
assert.deepEqual(formation.rows[0].cells.slice(4, 7), ["4", "5", "6"]);

// Missing legacy/custom-general specialty fields remain deterministic zeroes.
free.ability = { force: 1, lead: 2, politics: 3 };
const fallback = capture(HUD.prototype.showFormation);
assert.deepEqual(fallback.rows[0].cells.slice(4, 7), ["0", "0", "0"]);

// Expanding the list must not drag the 240px formation panel away from its
// established screen position (old 480px list: 80 + 128 = 208).
const layoutHarness = {
  bx: 0,
  submenuOpen: true,
  listDialog: {
    x: 8,
    y: 84,
    w: 624,
    h: 352,
    header: expectedHeader,
    rowH: 18,
    titleBar: false,
    footer: null,
  },
  formationDialog: { wTiles: 15, hTiles: 12 },
  formationQuote: null,
};
GameBar.prototype._recalcListDialog.call(layoutHarness);
assert.equal(layoutHarness.formationDialog.ox, 208);
