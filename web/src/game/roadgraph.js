// 旧战略道路API的兼容门面；算法与每个世界的独立缓存见navigation/roadgraph。
import { defaultWorldResources } from "./worldresources.js";

export { createRoadGraph } from "./navigation/roadgraph.js";
export const {
  loadRoadGraph,
  roadGraphReady,
  roadNodeAt,
  roadNodeById,
  roadEdgeById,
  roadNodeRawAddress,
  roadNodeIdFromRaw,
  roadEdgeRawAddress,
  roadEdgeIdFromRaw,
  restoreRoadMarchContext,
  serializeRoadMarchContext,
  reverseRoadMarchContext,
  roadApproachesAt,
  roadEndpointsAt,
  findRoadRoute,
} = defaultWorldResources.roads;
