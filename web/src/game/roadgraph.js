// 原版战略道路拓扑 — 由 tools/probe_march_topology.py 从 MMAP.MAP 生成。
// 本模块先以 shadow mode 提供加权图路线；现有逐格移动尚不切换到该路线。

let graph = null;
let loadPromise = null;
let nodeByCoord = new Map();
let edgePointsByCoord = new Map();
let adjacency = [];

const coordKey = (x, y) => `${x},${y}`;

function installGraph(raw) {
  if (!raw || raw.version !== 1 || raw.nodes?.length !== 192) {
    throw new Error("invalid strategic road graph");
  }

  const nextNodeByCoord = new Map();
  const nextEdgePointsByCoord = new Map();
  const nextAdjacency = Array.from({ length: raw.nodes.length }, () => []);
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
    const sourcePoints = edge.points.slice(0, pointIndex).reverse();
    const targetPoints = edge.points.slice(pointIndex + 1);
    // 0x487B检查当前边的+8端后再检查+6端；拓扑资产中target/source
    // 分别对应这两个端点。返回顺序是战后撤退的稳定平权依据。
    return [
      {
        node: target,
        points: [...targetPoints, { x: target.x, y: target.y }],
        distance: targetPoints.length + 1,
      },
      {
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

function routeNodeIds(source, target, isNodeBlocked) {
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
      // KI.EXE 0x49C3/0x4A3D：每次展开节点先加4，再累加边点数。
      const candidate = best + 4 + step.edge.weight;
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
  nodes.reverse();
  edges.reverse();
  return { nodes, edges, distance: distance[target] };
}

function orientedEdgePoints(edge, fromNode, toNode) {
  const points =
    edge.source === fromNode ? edge.points : edge.points.slice().reverse();
  const destination = graph.nodes[toNode];
  return [...points, { x: destination.x, y: destination.y }];
}

function routeLegs(route) {
  const legs = [];
  for (let index = 0; index < route.edges.length; index++) {
    const edge = graph.edges[route.edges[index]];
    const fromNode = route.nodes[index];
    const toNode = route.nodes[index + 1];
    legs.push({
      edgeId: edge.id,
      fromNode,
      toNode,
      stride: edge.source === fromNode ? 4 : -4,
      points: orientedEdgePoints(edge, fromNode, toNode),
    });
  }
  return legs;
}

/**
 * 按原版“节点展开4 + 边点数”代价求据点到据点路线。
 * 返回节点、边和沿边点列；不含起点据点格，包含终点据点格。
 */
export function findRoadRoute(sx, sy, tx, ty, isNodeBlocked) {
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

  const route = routeNodeIds(source, target, isNodeBlocked);
  if (!route) return null;
  const legs = routeLegs(route);
  return {
    ...route,
    legs,
    points: legs.flatMap((leg) => leg.points),
  };
}
