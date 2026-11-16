// C7-B/C7-D: city-group placement precheck (all-or-nothing gate, no mutation)
// plus map-side materialization transform (no source writes).
// Contract: map-city-group-contract §4.1. Pure reads/transforms only; center-cell terrain rules stay with mapcompile; this gate
// covers shape, bounds and occupancy only.
import { componentCells, occupiedCells } from "./componenttools.js";

const fail = (code, detail) => {
  throw new RangeError(`city group placement refused (${code}): ${detail}`);
};

function checkItem(item) {
  if (!item || typeof item !== "object") fail("BAD_ITEM", "recipe required");
  if (typeof item.itemId !== "string" || !item.itemId) fail("BAD_ITEM", "itemId required");
  if (!Array.isArray(item.rows) || !item.rows.length) fail("BAD_ITEM", "rows required");
  const width = item.rows[0]?.length;
  if (!Number.isInteger(width) || width < 1) fail("BAD_ITEM", "rows must be a non-empty grid");
  for (const row of item.rows) {
    if (!Array.isArray(row) || row.length !== width) fail("BAD_ITEM", "rows must be rectangular");
  }
  const [ax, ay] = item.anchor ?? [];
  if (!Number.isInteger(ax) || !Number.isInteger(ay) || ax < 0 || ay < 0 || ax >= width || ay >= item.rows.length)
    fail("BAD_ITEM", "anchor must be a recipe cell");
  if (!Array.isArray(item.gates)) fail("BAD_ITEM", "gates required");
  for (const [gx, gy] of item.gates) {
    if (!Number.isInteger(gx) || !Number.isInteger(gy) || gx < 0 || gy < 0 || gx >= width || gy >= item.rows.length)
      fail("BAD_ITEM", "gate must be a recipe cell");
  }
  if (!Array.isArray(item.cityTypes) || !item.cityTypes.length) fail("BAD_ITEM", "cityTypes required");
}

function boundsOf(source) {
  const bounds = source?.map?.bounds;
  if (
    bounds &&
    Number.isInteger(bounds.minX) &&
    Number.isInteger(bounds.minY) &&
    Number.isInteger(bounds.width) &&
    Number.isInteger(bounds.height)
  )
    return bounds;
  return { minX: 0, minY: 0, width: 384, height: 256 };
}

/**
 * Validate a city-group placement without writing anything.
 * anchor {x, y} pins recipe cell item.anchor to the map grid.
 * Returns a frozen plan {itemId, cityType, center, cells, gates}.
 * Throws RangeError with a CITY_GROUP_* style code otherwise.
 */
export function planCityGroupPlacement(source, item, { x, y, cityType } = {}) {
  checkItem(item);
  if (!Number.isInteger(x) || !Number.isInteger(y)) fail("BAD_ANCHOR", "anchor must be integer cells");
  if (!item.cityTypes.includes(cityType)) fail("BAD_CITY_TYPE", `cityTypes [${item.cityTypes.join(",")}] do not include ${cityType}`);
  const [ax, ay] = item.anchor;
  const bounds = boundsOf(source);
  const cells = item.rows.flatMap((row, j) => row.map((tile, i) => ({ x: x + i - ax, y: y + j - ay, tile })));
  for (const cell of cells) {
    if (cell.x < bounds.minX || cell.y < bounds.minY || cell.x >= bounds.minX + bounds.width || cell.y >= bounds.minY + bounds.height)
      fail("OUT_OF_BOUNDS", `cell ${cell.x},${cell.y} outside the map`);
  }
  const occupied = (() => {
    if (!source?.map || typeof source.map !== "object") fail("BAD_SOURCE", "source.map required");
    return occupiedCells(source);
  })();
  for (const cell of cells) {
    if (occupied.has(`${cell.x},${cell.y}`)) fail("CELL_OCCUPIED", `cell ${cell.x},${cell.y} already occupied`);
  }
  const gates = item.gates.map(([gx, gy]) => ({ x: x + gx - ax, y: y + gy - ay }));
  const center = { x, y };
  return Object.freeze({
    itemId: item.itemId,
    cityType,
    center: Object.freeze(center),
    cells: Object.freeze(cells.map((cell) => Object.freeze({ ...cell }))),
    gates: Object.freeze(gates.map((gate) => Object.freeze({ ...gate }))),
  });
}

/**
 * C7-D: map-side materialization of a placement plan (pure transform).
 * Contract: map-city-group-contract §4.1 three-way output, map side only.
 * Gate cells yield port metadata only (no road geometry); non-gate cells
 * yield atomic `tile-<byte>` decoration descriptors in plan order; the group
 * links the decoration instance ids. Copy-model city rows, chapter
 * coverage and battleMapId bindings are NOT written here (later slice).
 * Returns a frozen {cityId, itemId, cityType, center, decorations, ports,
 * group}. Throws RangeError on malformed plan/cityId/newId.
 */
export function materializeCityGroupPlacement(plan, { cityId, newId } = {}) {
  if (!plan || typeof plan !== "object") fail("BAD_PLAN", "placement plan required");
  if (typeof cityId !== "string" || !cityId) fail("BAD_CITY", "stable cityId required");
  if (typeof newId !== "function") fail("BAD_IDS", "id factory required");
  if (typeof plan.itemId !== "string" || !plan.itemId) fail("BAD_PLAN", "itemId required");
  if (!Array.isArray(plan.cells) || !plan.cells.length) fail("BAD_PLAN", "cells required");
  if (!Array.isArray(plan.gates)) fail("BAD_PLAN", "gates required");
  const cellKeys = new Set();
  for (const cell of plan.cells) {
    if (!Number.isInteger(cell?.x) || !Number.isInteger(cell?.y)) fail("BAD_PLAN", "cell coordinates required");
    if (!Number.isInteger(cell?.tile) || cell.tile < 0 || cell.tile > 255)
      fail("BAD_PLAN", `cell ${cell.x},${cell.y} tile must be an atomic byte`);
    cellKeys.add(`${cell.x},${cell.y}`);
  }
  for (const gate of plan.gates) {
    if (!Number.isInteger(gate?.x) || !Number.isInteger(gate?.y)) fail("BAD_PLAN", "gate coordinates required");
    if (!cellKeys.has(`${gate.x},${gate.y}`)) fail("BAD_PLAN", `gate ${gate.x},${gate.y} is not a plan cell`);
  }
  const gateKeys = new Set(plan.gates.map((gate) => `${gate.x},${gate.y}`));
  const decorations = [];
  for (const cell of plan.cells) {
    if (gateKeys.has(`${cell.x},${cell.y}`)) continue;
    const instanceId = newId("decoration");
    if (typeof instanceId !== "string" || !instanceId) fail("BAD_IDS", "id factory must return non-empty strings");
    decorations.push({ instanceId, materialId: `tile-${cell.tile}`, variantRef: "original", x: cell.x, y: cell.y, waterClass: null });
  }
  const ports = plan.gates.map((gate, gateIndex) => ({
    portId: `${cityId}:${gateIndex}`,
    cityId,
    gateIndex,
    x: gate.x,
    y: gate.y,
  }));
  const group = {
    id: `city-group-${cityId}`,
    members: decorations.map((decoration) => ({ layer: "decorations", id: decoration.instanceId })),
  };
  const frozen = {
    cityId,
    itemId: plan.itemId,
    cityType: plan.cityType ?? null,
    center: plan.center ? { ...plan.center } : null,
    decorations: Object.freeze(decorations.map((decoration) => Object.freeze({ ...decoration }))),
    ports: Object.freeze(ports.map((port) => Object.freeze({ ...port }))),
    group: Object.freeze({ ...group, members: Object.freeze(group.members.map((member) => Object.freeze({ ...member }))) }),
  };
  return Object.freeze(frozen);
}
