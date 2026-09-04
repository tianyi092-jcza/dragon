// 原版战略道路拓扑 — 由 tools/probe_march_topology.py 从 MMAP.MAP 生成。
// 本模块先以 shadow mode 提供加权图路线；现有逐格移动尚不切换到该路线。

let graph = null;
let loadPromise = null;
let nodeByCoord = new Map();
let edgePointsByCoord = new Map();
let edgePointBases = [];
let adjacency = [];

const ROAD_NODE_SIZE = 8;
const ROAD_EDGE_BASE = 0x0800;
const ROAD_EDGE_SIZE = 0x10;
const ROAD_POINT_BASE = 0x2000;
const ROAD_POINT_SIZE = 4;
const coordKey = (x, y) => `${x},${y}`;

function installGraph(raw) {
  if (!raw || raw.version !== 1 || raw.nodes?.length !== 192) {
    throw new Error("invalid strategic road graph");
  }

  const nextNodeByCoord = new Map();
  const nextEdgePointsByCoord = new Map();
  const nextAdjacency = Array.from({ length: raw.nodes.length }, () => []);
  const nextEdgePointBases = [];
  let nextPointAddress = ROAD_POINT_BASE;
  for (const node of raw.nodes) {
    if (node.id < 0 || node.id >= raw.nodes.length) {
      throw new Error(`invalid road node id ${node.id}`);
    }
    nextNodeByCoord.set(coordKey(node.x, node.y), node.id);
  }
  if (nextNodeByCoord.size !== raw.nodes.length) {
    throw new Error("duplicate strategic road node coordinates");
  }

  for (const edge of raw.edges ?? []) {
    const { source, target, weight } = edge;
    if (
      source < 0 ||
      source >= raw.nodes.length ||
      target < 0 ||
      target >= raw.nodes.length ||
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      throw new Error(`invalid strategic road edge ${edge.id}`);
    }
    if (edge.id !== nextEdgePointBases.length) {
      throw new Error(`non-sequential strategic road edge ${edge.id}`);
    }
    nextEdgePointBases.push(nextPointAddress);
    nextPointAddress += edge.points.length * ROAD_POINT_SIZE;
    nextAdjacency[source].push({ edge, node: target });
    nextAdjacency[target].push({ edge, node: source });
    for (const [pointIndex, point] of edge.points.entries()) {
      const key = coordKey(point.x, point.y);
      const locations = nextEdgePointsByCoord.get(key) ?? [];
      locations.push({ edge, pointIndex });
      nextEdgePointsByCoord.set(key, locations);
    }
  }

  graph = raw;
  nodeByCoord = nextNodeByCoord;
  edgePointsByCoord = nextEdgePointsByCoord;
  edgePointBases = nextEdgePointBases;
  adjacency = nextAdjacency;
  return graph;
}

export async function loadRoadGraph() {
  if (graph) return graph;
  if (!loadPromise) {
    loadPromise = fetch("road_graph.json")
      .then((response) => {
        if (!response.ok)
          throw new Error(`road_graph.json HTTP ${response.status}`);
        return response.json();
      })
      .then(installGraph)
      .catch((error) => {
        loadPromise = null;
        throw error;
      });
  }
  return loadPromise;
}

export function roadGraphReady() {
  return graph != null;
}

export function roadNodeAt(x, y) {
  if (!graph) return null;
  const id = nodeByCoord.get(coordKey(x, y));
  return id == null ? null : graph.nodes[id];
}

export function roadNodeById(id) {
  return graph?.nodes?.[id] ?? null;
}

export function roadEdgeById(id) {
  return graph?.edges?.[id] ?? null;
}

/** E717：节点表从0起每项8B；边表从0x0800起每项0x10B。 */
export function roadNodeRawAddress(nodeId) {
  return Number.isInteger(nodeId) &&
    nodeId >= 0 &&
    nodeId < (graph?.nodes.length ?? 0)
    ? nodeId * ROAD_NODE_SIZE
    : null;
}

export function roadNodeIdFromRaw(rawAddress) {
  return Number.isInteger(rawAddress) &&
    rawAddress >= 0 &&
    rawAddress < ROAD_EDGE_BASE &&
    rawAddress % ROAD_NODE_SIZE === 0 &&
    rawAddress / ROAD_NODE_SIZE < (graph?.nodes.length ?? 0)
    ? rawAddress / ROAD_NODE_SIZE
    : null;
}

export function roadEdgeRawAddress(edgeId) {
  return Number.isInteger(edgeId) &&
    edgeId >= 0 &&
    edgeId < (graph?.edges.length ?? 0)
    ? ROAD_EDGE_BASE + edgeId * ROAD_EDGE_SIZE
    : null;
}

export function roadEdgeIdFromRaw(rawAddress) {
  if (
    !Number.isInteger(rawAddress) ||
    rawAddress < ROAD_EDGE_BASE ||
    (rawAddress - ROAD_EDGE_BASE) % ROAD_EDGE_SIZE !== 0
  )
    return null;
  const edgeId = (rawAddress - ROAD_EDGE_BASE) / ROAD_EDGE_SIZE;
  return edgeId < (graph?.edges.length ?? 0) ? edgeId : null;
}

function roadPointRawAddress(edgeId, pointIndex) {
  const edge = graph?.edges?.[edgeId];
  if (
    !edge ||
    !Number.isInteger(pointIndex) ||
    pointIndex < 0 ||
    pointIndex >= edge.points.length
  )
    return null;
  return edgePointBases[edgeId] + pointIndex * ROAD_POINT_SIZE;
}

function rawPointIndex(edgeId, rawAddress) {
  const edge = graph?.edges?.[edgeId];
  const base = edgePointBases[edgeId];
  if (!edge || !Number.isInteger(rawAddress) || rawAddress < base) return null;
  const delta = rawAddress - base;
  if (delta % ROAD_POINT_SIZE !== 0) return null;
  const index = delta / ROAD_POINT_SIZE;
  return index < edge.points.length ? index : null;
}

function marchPoints(edge, stride) {
  const fromNode = stride === 4 ? edge.source : edge.target;
  const toNode = stride === 4 ? edge.target : edge.source;
  return {
    fromNode,
    toNode,
    points: orientedEdgePoints(edge, fromNode, toNode),
  };
}

/**
 * 0x8CFF会保存+0x0A/+0x0C/+0x0E。将DOS原始地址恢复成Web边点列；
 * 地址不满足E717生成布局时返回null，调用方才可退回目标重寻路。
 */
export function restoreRoadMarchContext({
  x,
  y,
  targetX,
  targetY,
  targetNode,
  stride,
  pointAddress,
  edgeOrNode,
}) {
  if (!graph || (stride !== 4 && stride !== -4)) return null;
  const edgeId = roadEdgeIdFromRaw(edgeOrNode);
  const rawIndex = rawPointIndex(edgeId, pointAddress);
  const edge = graph.edges[edgeId];
  if (!edge || rawIndex == null) return null;
  const oriented = marchPoints(edge, stride);
  let pointIndex = -1;
  const currentIndex = edge.points.findIndex(
    (point) => point.x === x && point.y === y,
  );
  if (currentIndex >= 0) {
    const expectedRaw = roadPointRawAddress(edgeId, currentIndex);
    if (expectedRaw !== pointAddress) return null;
    pointIndex =
      stride === 4 ? currentIndex + 1 : edge.points.length - currentIndex;
  } else {
    const from = graph.nodes[oriented.fromNode];
    const expectedInitial = stride === 4 ? 0 : edge.points.length - 1;
    if (!from || from.x !== x || from.y !== y || rawIndex !== expectedInitial)
      return null;
    pointIndex = 0;
  }
  // pointIndex==points.length是合法的“边内点已耗尽，等待下一槽切端点”状态。
  if (pointIndex < 0 || pointIndex > oriented.points.length) return null;
  return {
    targetX,
    targetY,
    targetNode,
    currentNode: oriented.fromNode,
    edgeId,
    stride,
    fromNode: oriented.fromNode,
    toNode: oriented.toNode,
    points: oriented.points,
    pointIndex,
  };
}

/** Web运行态反算E717地址布局，供SAVE/snapshot原样写回。 */
export function serializeRoadMarchContext(march) {
  const edge = graph?.edges?.[march?.edgeId];
  if (!edge || (march.stride !== 4 && march.stride !== -4)) return null;
  let sourceIndex;
  if ((march.pointIndex ?? 0) <= 0) {
    sourceIndex = march.stride === 4 ? 0 : edge.points.length - 1;
  } else {
    sourceIndex =
      march.stride === 4
        ? march.pointIndex - 1
        : edge.points.length - march.pointIndex;
  }
  const pointAddress = roadPointRawAddress(edge.id, sourceIndex);
  const edgeOrNode = roadEdgeRawAddress(edge.id);
  if (pointAddress == null || edgeOrNode == null) return null;
  return { stride: march.stride, pointAddress, edgeOrNode };
}

/** 0x42AB阻断时在当前边转向另一端，不重新跑Dijkstra。 */
export function reverseRoadMarchContext(march, x, y) {
  const edge = graph?.edges?.[march?.edgeId];
  if (!edge) return null;
  const stride = march.stride === 4 ? -4 : 4;
  const oriented = marchPoints(edge, stride);
  const currentIndex = edge.points.findIndex(
    (point) => point.x === x && point.y === y,
  );
  let pointIndex;
  if (currentIndex >= 0)
    pointIndex =
      stride === 4 ? currentIndex + 1 : edge.points.length - currentIndex;
  else {
    const from = graph.nodes[oriented.fromNode];
    const to = graph.nodes[oriented.toNode];
    if (to?.x === x && to?.y === y) pointIndex = oriented.points.length;
    else if (from?.x === x && from?.y === y) pointIndex = 0;
    else return null;
  }
  return {
    ...march,
    targetX: graph.nodes[oriented.toNode].x,
    targetY: graph.nodes[oriented.toNode].y,
    targetNode: oriented.toNode,
    currentNode: oriented.fromNode,
    stride,
    fromNode: oriented.fromNode,
    toNode: oriented.toNode,
    points: oriented.points,
    pointIndex,
  };
}

/** 当前道路格到相邻端点的有向点列；据点节点返回自身和空点列。 */
export function roadApproachesAt(x, y) {
  if (!graph) return [];
  const nodeId = nodeByCoord.get(coordKey(x, y));
  if (nodeId != null) {
    return [{ node: graph.nodes[nodeId], points: [], distance: 0 }];
  }
  const locations = edgePointsByCoord.get(coordKey(x, y));
  if (!locations) return [];
  return locations.flatMap(({ edge, pointIndex }) => {
    const source = graph.nodes[edge.source];
    const target = graph.nodes[edge.target];
    const sourcePoints = edge.points.slice(0, pointIndex).toReversed();
    const targetPoints = edge.points.slice(pointIndex + 1);
    // 0x487B检查当前边的+8端后再检查+6端；拓扑资产中target/source
    // 分别对应这两个端点。返回顺序是战后撤退的稳定平权依据。
    return [
      {
        edgeId: edge.id,
        node: target,
        points: [...targetPoints, { x: target.x, y: target.y }],
        distance: targetPoints.length + 1,
      },
      {
        edgeId: edge.id,
        node: source,
        points: [...sourcePoints, { x: source.x, y: source.y }],
        distance: sourcePoints.length + 1,
      },
    ];
  });
}

/** 当前道路格可直接撤回的相邻端点；据点节点返回自身。 */
export function roadEndpointsAt(x, y) {
  return roadApproachesAt(x, y).map((approach) => approach.node);
}

function routeNodeIds(source, target, isNodeBlocked, nodePenalty) {
  const count = graph.nodes.length;
  const distance = new Float64Array(count);
  distance.fill(Infinity);
  const previousNode = new Int16Array(count);
  const previousEdge = new Int16Array(count);
  previousNode.fill(-1);
  previousEdge.fill(-1);
  const visited = new Uint8Array(count);
  distance[source] = 0;

  for (let remaining = count; remaining > 0; remaining--) {
    let current = -1;
    let best = Infinity;
    for (let node = 0; node < count; node++) {
      if (!visited[node] && distance[node] < best) {
        best = distance[node];
        current = node;
      }
    }
    if (current < 0 || current === target) break;
    visited[current] = 1;

    for (const step of adjacency[current]) {
      const neighbour = step.node;
      if (neighbour !== source && isNodeBlocked?.(graph.nodes[neighbour])) {
        continue;
      }
      // KI.EXE 0x49C3/0x4A3D：每次展开当前节点先加4，再累加边点数。
      // 0x491B 的战败搜索还会对非己城市加入约 0x80A6 的巨额代价；
      // 它们仍会展开，不能用 blocked 回调直接删除。
      const penalty = Math.max(
        0,
        Number(nodePenalty?.(graph.nodes[current])) || 0,
      );
      const candidate = best + penalty + 4 + step.edge.weight;
      if (candidate < distance[neighbour]) {
        distance[neighbour] = candidate;
        previousNode[neighbour] = current;
        previousEdge[neighbour] = step.edge.id;
      }
    }
  }

  if (!Number.isFinite(distance[target])) return null;
  const nodes = [];
  const edges = [];
  let current = target;
  while (current !== source) {
    nodes.push(current);
    const edgeId = previousEdge[current];
    current = previousNode[current];
    if (edgeId < 0 || current < 0) return null;
    edges.push(edgeId);
  }
  nodes.push(source);
  return {
    nodes: nodes.toReversed(),
    edges: edges.toReversed(),
    distance: distance[target],
  };
}

function orientedEdgePoints(edge, fromNode, _toNode) {
  // E717/E961：边内点列只保存道路点，两端据点节点由edge +6/+8独立保存；
  // 节点中心绝不能追加到points，否则0x2831会把驻城守军误判为道路野战。
  return edge.source === fromNode ? edge.points : edge.points.toReversed();
}

function routeLegs(route) {
  const legs = [];
  for (let index = 0; index < route.edges.length; index++) {
    const edge = graph.edges[route.edges[index]];
    const fromNode = route.nodes[index];
    const toNode = route.nodes[index + 1];
    const stride = edge.source === fromNode ? 4 : -4;
    legs.push({
      edgeId: edge.id,
      fromNode,
      toNode,
      stride,
      points: orientedEdgePoints(edge, fromNode, toNode),
      rawEdgeOrNode: roadEdgeRawAddress(edge.id),
      rawPointAddress: roadPointRawAddress(
        edge.id,
        stride === 4 ? 0 : edge.points.length - 1,
      ),
    });
  }
  return legs;
}

/**
 * 按原版“节点展开4 + 边点数”代价求据点到据点路线。
 * 返回节点、边和沿边点列；边点不含起点或终点据点中心。
 */
export function findRoadRoute(sx, sy, tx, ty, isNodeBlocked, nodePenalty) {
  if (!graph) return null;
  const source = nodeByCoord.get(coordKey(sx, sy));
  const target = nodeByCoord.get(coordKey(tx, ty));
  if (source == null || target == null) return null;
  if (source === target)
    return {
      nodes: [source],
      edges: [],
      legs: [],
      points: [],
      distance: 0,
    };

  const route = routeNodeIds(source, target, isNodeBlocked, nodePenalty);
  if (!route) return null;
  const legs = routeLegs(route);
  return {
    ...route,
    legs,
    points: legs.flatMap((leg) => leg.points),
  };
}
