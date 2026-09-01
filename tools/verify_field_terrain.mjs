import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { loadTerrain } = await import("../web/src/game/pathfind.js");
const { classifyFieldBattleTerrain, fieldTerrainClass } = await import(
  "../web/src/game/fieldterrain.js"
);
const { createFieldBattle } = await import("../web/src/game/tacticalbattle.js");

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${error.message}`, {
      cause: error,
    });
  }
}

globalThis.fetch = async (url) => {
  const path = new URL(`../web/${url}`, import.meta.url);
  const bytes = await fs.readFile(path);
  return {
    ok: true,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    json: async () => parseJson(bytes, url),
  };
};
await loadTerrain();

const raw = parseJson(
  await fs.readFile(new URL("../web/data.json", import.meta.url)),
  "data.json",
);
const battleMaps = parseJson(
  await fs.readFile(new URL("../web/battle_maps.json", import.meta.url)),
  "battle_maps.json",
);
battleMaps.navigation = parseJson(
  await fs.readFile(new URL("../web/battle_navigation.json", import.meta.url)),
  "battle_navigation.json",
);
assert.equal(battleMaps.directory.length, 214);
assert.deepEqual(
  battleMaps.directory.slice(0xc0, 0xd6).map((entry) => entry.layout),
  [...Array(16).fill(1), ...Array(6).fill(2)],
);

assert.equal(fieldTerrainClass(0xb8), 1);
assert.equal(fieldTerrainClass(0xba), 2);
assert.equal(fieldTerrainClass(0x70), 3);
assert.equal(fieldTerrainClass(0xa8), 7);
assert.equal(fieldTerrainClass(0xca), 8);
assert.equal(fieldTerrainClass(0xc0), 9);
assert.equal(fieldTerrainClass(0xcb), 0);

const graph = parseJson(
  await fs.readFile(new URL("../web/road_graph.json", import.meta.url)),
  "road_graph.json",
);
const seenDirectories = new Set();
let checked = 0;
let mirrored = 0;
for (const edge of graph.edges) {
  for (let index = 1; index < edge.points.length; index++) {
    const defender = { ...edge.points[index], faction: 1, _markerFrame: 4 };
    const previous = edge.points[index - 1];
    const dx = defender.x - previous.x;
    const dy = defender.y - previous.y;
    let _markerFrame;
    if (Math.abs(dx) >= Math.abs(dy)) _markerFrame = dx < 0 ? 0 : 1;
    else _markerFrame = dy < 0 ? 2 : 3;
    const attacker = {
      ...previous,
      faction: 0,
      _markerFrame,
      leader: "攻",
      troops: 100,
    };
    const selected = classifyFieldBattleTerrain(attacker, defender, 0, {
      nextByte: () => 0,
    });
    assert.ok(
      selected.directoryIndex >= 0xc0 && selected.directoryIndex <= 0xd5,
    );
    const directory = battleMaps.directory[selected.directoryIndex];
    assert.ok(directory);
    assert.ok(directory.layout >= 0 && directory.layout <= 2);
    seenDirectories.add(selected.directoryIndex);
    if (selected.mirror) mirrored++;
    checked++;
  }
}
assert.ok(checked > 5000);
assert.ok(seenDirectories.size >= 10);
assert.ok(mirrored > 0);

const sc = structuredClone(raw.scenarios[0]);
const attacker = {
  leader: sc.factions[0].monarch,
  faction: 0,
  troops: 100,
  formation: 1,
};
const defender = {
  leader: sc.factions[1].monarch,
  faction: 1,
  troops: 100,
};
const selected = { directoryIndex: 0xc0, mirror: true, terrainClass: 0 };
const battle = createFieldBattle(sc, attacker, defender, battleMaps, selected);
assert.equal(battle.kind, "field");
assert.equal(battle.layout, battleMaps.directory[0xc0].layout);
assert.equal(battle.theme, battleMaps.directory[0xc0].theme);
assert.equal(battle.mirror, true);
assert.deepEqual(battle.fieldTerrain, selected);
assert.equal(
  battle.session.registers.battleSideFlag & 0x40,
  0x40,
  "D35 bit6 preserves field-map mirror independently from player-side bit7",
);
assert.equal(
  battle.session.registers.themeFlag,
  battleMaps.directory[0xc0].theme,
  "AB4F mirrors the BATTLE.MAP directory theme byte",
);

process.stdout.write(
  `field terrain OK: ${checked} road points, ${seenDirectories.size} directory codes, ${mirrored} mirrored\n`,
);
