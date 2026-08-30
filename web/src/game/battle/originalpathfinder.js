// KI.EXE 0xBD46..0xBFF1 原版代价寻路与最多64项回溯。
// navigation布局：0x0000/0x1000方向mask，0x2000每格u8代价；全链0 RNG。

import {
  ORIGINAL_MAP_CELLS,
  ORIGINAL_MAP_WIDTH,
  ORIGINAL_NAV_COST_BASE,
  ORIGINAL_NAV_PLANE_SIZE,
} from "./originalnavigation.js";

const UNVISITED = 0xffff;
const CARDINALS = Object.freeze([
  { bit: 0x10, delta: -1, wordDelta: -1 },
  { bit: 0x20, delta: 1, wordDelta: 1 },
  { bit: 0x40, delta: -0x40, wordDelta: -0x100 },
  { bit: 0x80, delta: 0x40, wordDelta: 0x100 },
]);

function coordinateWord(x, y) {
  return (x & 0xff) | ((y & 0xff) << 8);
}

function coordinateIndex(word) {
  const x = word & 0xff;
  const y = (word >> 8) & 0xff;
  if (x >= 0x40 || y >= 0x40) return -1;
  return y * ORIGINAL_MAP_WIDTH + x;
}

function nodeOf(index, plane) {
  return index + plane * ORIGINAL_MAP_CELLS;
}

function nodeIndex(node) {
  return node & 0x0fff;
}

function nodePlane(node) {
  return node >= ORIGINAL_MAP_CELLS ? 1 : 0;
}

function navigationValue(navigation, node) {
  return navigation[
    nodeIndex(node) + nodePlane(node) * ORIGINAL_NAV_PLANE_SIZE
  ];
}

function movementCost(navigation, node) {
  return navigation[ORIGINAL_NAV_COST_BASE + nodeIndex(node)] ?? 0;
}

function endpointClear(navigation, node, pathMask, endpointPolicy) {
  if (endpointPolicy !== 0 || pathMask === 0xeb) return true;
  const index = nodeIndex(node);
  const plane = nodePlane(node) * ORIGINAL_NAV_PLANE_SIZE;
  const samples = [index, index + 1, index - 1];
  return samples.every(
    (sample) =>
      sample >= 0 &&
      sample < ORIGINAL_MAP_CELLS &&
      (navigation[sample + plane] & 0xf0) === 0,
  );
}

function neighborNodes(navigation, node, pathMode) {
  const value = navigationValue(navigation, node);
  const currentIndex = nodeIndex(node);
  const plane = nodePlane(node);
  const neighbors = [];
  for (const direction of CARDINALS) {
    if ((value & direction.bit) === 0) continue;
    const nextIndex = currentIndex + direction.delta;
    if (nextIndex < 0 || nextIndex >= ORIGINAL_MAP_CELLS) continue;
    neighbors.push({ node: nodeOf(nextIndex, plane), ...direction });
  }
  if (pathMode === 0x74 && (value & 8) !== 0) {
    const otherPlane = plane ^ 1;
    neighbors.push({
      node: nodeOf(currentIndex, otherPlane),
      vertical: true,
      wordDelta: 0,
    });
  }
  return neighbors;
}

function reconstructOriginalPath(
  navigation,
  costs,
  startNode,
  targetNode,
  distance,
) {
  let node = targetNode;
  let remaining = Math.max(0, distance - 2);
  let x = nodeIndex(targetNode) % ORIGINAL_MAP_WIDTH;
  let y = Math.floor(nodeIndex(targetNode) / ORIGINAL_MAP_WIDTH);
  let currentWord = coordinateWord(x, y);
  const reverseWords = [currentWord];
  let cardinalPhase = 0;

  while (remaining > 0 && reverseWords.length < 0x40) {
    const options = CARDINALS.filter((direction) => {
      const previous = nodeIndex(node) + direction.delta;
      if (previous < 0 || previous >= ORIGINAL_MAP_CELLS) return false;
      return costs[nodeOf(previous, nodePlane(node))] === remaining;
    });
    let selected =
      cardinalPhase === 0
        ? options.find((option) => option.bit === 0x10 || option.bit === 0x20)
        : options.find((option) => option.bit === 0x40 || option.bit === 0x80);
    if (!selected) selected = options[0] ?? null;
    if (selected) {
      node = nodeOf(nodeIndex(node) + selected.delta, nodePlane(node));
      const previousIndex = nodeIndex(node);
      x = previousIndex % ORIGINAL_MAP_WIDTH;
      y = Math.floor(previousIndex / ORIGINAL_MAP_WIDTH);
      currentWord = coordinateWord(x, y);
      if (node !== startNode) reverseWords.push(currentWord);
      remaining--;
      cardinalPhase ^= 1;
      continue;
    }

    const value = navigationValue(navigation, node);
    if ((value & 8) !== 0) {
      const other = nodeOf(nodeIndex(node), nodePlane(node) ^ 1);
      if (costs[other] <= remaining) {
        const fromLevel = value & 7;
        const toLevel = navigationValue(navigation, other) & 7;
        const signedDelta =
          nodePlane(node) === 0 ? toLevel - fromLevel : fromLevel - toLevel;
        currentWord = 0x80 | ((signedDelta & 0xff) << 8);
        reverseWords.push(currentWord);
        remaining = costs[other];
        node = other;
        continue;
      }
    }
    break;
  }

  return {
    carry: node !== startNode || reverseWords.length >= 0x40,
    words: reverseWords.reverse(),
  };
}

/** BD46：分层Dijkstra式波前，u16代价、方向顺序10/20/40/80/08。 */
export function buildOriginalPath(navigation, request) {
  if (!navigation || navigation.length < ORIGINAL_NAV_COST_BASE + 0x1000)
    throw new TypeError("original pathfinder requires navigation/cost bytes");
  const currentIndex = coordinateIndex(request.current);
  const targetIndex = coordinateIndex(request.target);
  if (currentIndex < 0 || targetIndex < 0)
    return { carry: true, words: [], reason: "coordinate" };
  const startPlane = request.layer ? 1 : 0;
  const targetPlane =
    request.targetLayer == null ? startPlane : request.targetLayer ? 1 : 0;
  const startNode = nodeOf(currentIndex, startPlane);
  const targetNode = nodeOf(targetIndex, targetPlane);
  if (startNode === targetNode)
    return { carry: true, words: [], reason: "same-position" };
  if (
    !endpointClear(navigation, startNode, request.mask, request.endpointPolicy)
  )
    return { carry: true, words: [], reason: "endpoint" };

  const costs = new Uint16Array(ORIGINAL_MAP_CELLS * 2);
  costs.fill(UNVISITED);
  costs[startNode] = 1;
  let frontier = [startNode];
  let distance = 2;
  let found = false;
  while (frontier.length && !found) {
    const next = [];
    for (const node of frontier) {
      if (node === targetNode) {
        found = true;
        break;
      }
      if (distance <= costs[node]) {
        next.push(node);
        continue;
      }
      for (const neighbor of neighborNodes(navigation, node, request.mask)) {
        if (distance >= costs[neighbor.node]) continue;
        let candidate = distance + movementCost(navigation, neighbor.node);
        if (neighbor.vertical) {
          const currentLevel = navigationValue(navigation, node) & 7;
          const nextLevel = navigationValue(navigation, neighbor.node) & 7;
          candidate += Math.abs(currentLevel - nextLevel);
        }
        costs[neighbor.node] = candidate & 0xffff;
        next.push(neighbor.node);
      }
    }
    if (!found) {
      frontier = next;
      distance = (distance + 1) & 0xffff;
    }
  }
  if (!found) return { carry: true, words: [], reason: "unreachable" };

  const rebuilt = reconstructOriginalPath(
    navigation,
    costs,
    startNode,
    targetNode,
    distance,
  );
  return {
    ...rebuilt,
    distance,
    visited: costs.reduce((count, value) => count + (value !== UNVISITED), 0),
  };
}

export function createOriginalPathBuilder(navigation) {
  return (request) => buildOriginalPath(navigation, request);
}
