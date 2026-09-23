// 旧战略道路API的兼容门面；算法与每个世界的独立缓存见navigation/roadgraph。
// P69 G7: v1 Dijkstra findRoadRoute 导出删除（实现本体同删；生产早已零调用，
// 7+2测试调用方已迁往图记录/原生覆盖）。
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
  roadPointRawAddress,
  restoreRoadMarchContext,
  serializeRoadMarchContext,
  reverseRoadMarchContext,
  roadApproachesAt,
  roadEndpointsAt,
} = defaultWorldResources.roads;
