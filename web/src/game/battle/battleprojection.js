// Canvas战场投影DTO。只组装地图/武将/六队显示信息，不推进规则、不消费RNG。

import { createCityGarrison, legionBattleUnits } from "../autobattle.js";
import { generalForLegion, LEGION_UNIT_TYPE } from "../legionunits.js";

export const FIELD = 1024;
export const BATTLE_SCENE_WIDTH = 2048;
export const BATTLE_SCENE_HEIGHT = 1088;
export const BATTLE_SCENE_TOP = 64;

/** DA1C/DAAA：screenColumn=x+y；16px screenRow=(y-x)/2+0x20-level。 */
export function battleCellToScene(x, y, level = 0) {
  const cellX = x | 0;
  const cellY = y | 0;
  return {
    x: (cellX + cellY) * 16 + 16,
    y: BATTLE_SCENE_TOP + (0x40 + cellY - cellX) * 8 - (level | 0) * 16,
  };
}

const ROLE = ["主將", "前鋒", "左翼", "右翼", "左備", "右備"];

export const TACTICAL_UNIT_TYPES = Object.freeze({
  [LEGION_UNIT_TYPE.CAVALRY]: Object.freeze({ key: "cavalry", label: "騎" }),
  [LEGION_UNIT_TYPE.ARCHER]: Object.freeze({ key: "archer", label: "弓" }),
  [LEGION_UNIT_TYPE.INFANTRY]: Object.freeze({ key: "infantry", label: "步" }),
  [LEGION_UNIT_TYPE.EMPTY]: Object.freeze({ key: "empty", label: "空" }),
});

function generalOf(scenario, legion) {
  return generalForLegion(scenario, legion);
}

function projectUnits(side, legion) {
  const groups = legionBattleUnits(legion)
    .map((unit, strategicIndex) => ({ ...unit, strategicIndex }))
    .filter((unit) => unit.type >= 1 && unit.type <= 3 && unit.troops > 0);
  return groups.map((group, index) => {
    const x = side === "atk" ? 110 : FIELD - 110 - (index % 2) * 40;
    const y = FIELD / 2 + (index - (groups.length - 1) / 2) * 150;
    const profile = TACTICAL_UNIT_TYPES[group.type];
    return {
      side,
      idx: index,
      strategicIndex: group.strategicIndex,
      type: group.type,
      typeKey: profile.key,
      typeLabel: profile.label,
      x,
      y,
      hx: x,
      hy: y,
      troops: group.troops,
      maxTroops: group.troops,
      gen: legion.leader,
      label:
        group.strategicIndex === 0
          ? legion.leader
          : (ROLE[group.strategicIndex] ?? `${index + 1}軍`),
      morale: Math.max(0, Math.min(255, legion.morale ?? 0)),
      routed: false,
      gone: false,
      order: null,
    };
  });
}

function baseView({
  kind,
  attacker,
  defender,
  city,
  directoryIndex,
  layout,
  theme,
  mirror,
}) {
  const attackerGeneral = generalOf(this, attacker);
  const defenderGeneral = generalOf(this, defender);
  return {
    kind,
    A: attacker,
    D: defender,
    city,
    directoryIndex,
    layout,
    theme,
    mirror,
    terrain: {
      key: kind === "siege" ? "siege" : "land",
      label: kind === "siege" ? "攻城戰" : "野戰",
    },
    speakers: { atk: attackerGeneral ?? null, def: defenderGeneral ?? null },
    units: [...projectUnits("atk", attacker), ...projectUnits("def", defender)],
    effects: [],
    dialogues: [],
    nextDialogueSequence: 0,
    time: 0,
    over: null,
  };
}

export function createSiegeProjection(
  scenario,
  attacker,
  city,
  battleMaps,
  defender = null,
) {
  const map =
    battleMaps?.directory?.[city.idx] ??
    battleMaps?.cities?.find((entry) => entry.idx === city.idx);
  if (!map || map.idx !== city.idx)
    throw new RangeError(`missing BATTLE.MAP city directory ${city.idx}`);
  let defendingLegion = defender;
  if (!defendingLegion) {
    const faction = scenario.factions?.[city.faction];
    const governor =
      city.governor == null ? null : scenario.generals[city.governor];
    const monarch = faction
      ? generalOf(scenario, { leader: faction.monarch })
      : null;
    defendingLegion = createCityGarrison(
      city,
      governor?.name ?? monarch?.name ?? null,
    );
  }
  const view = baseView.call(scenario, {
    kind: "siege",
    attacker,
    defender: defendingLegion,
    city,
    directoryIndex: city.idx,
    layout: map.layout,
    theme: map.theme,
    mirror: false,
  });
  view.title = `${attacker.leader}軍 ⚔ ${city.name} (${defendingLegion.leader ?? "守軍"})`;
  return view;
}

export function createFieldProjection(
  scenario,
  attacker,
  defender,
  battleMaps,
  fieldTerrain,
) {
  const directory = battleMaps?.directory?.find(
    (entry) => entry.idx === fieldTerrain?.directoryIndex,
  );
  const view = baseView.call(scenario, {
    kind: "field",
    attacker,
    defender,
    city: null,
    directoryIndex: fieldTerrain?.directoryIndex ?? 0xc0,
    layout: directory?.layout ?? 0,
    theme: directory?.theme ?? 0,
    mirror: Boolean(fieldTerrain?.mirror),
  });
  view.fieldTerrain = fieldTerrain;
  if (fieldTerrain?.terrainClass === 9)
    view.terrain = { key: "water", label: "水戰" };
  view.title = `${attacker.leader}軍 ⚔ ${defender.leader}軍`;
  return view;
}
