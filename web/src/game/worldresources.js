// 资源实例不进入Scenario/IndexedDB快照；仅保存世界定义与该世界的导航缓存。
import { DEFAULT_WORLD } from "../content/worlddefinition.js";
import { createRoadGraph } from "./navigation/roadgraph.js";
import { createPathfinder } from "./navigation/pathfinder.js";

export function createWorldResources(definition = DEFAULT_WORLD) {
  // 当前世界仍有固定坐标/槽位/图块语义约束，不能靠修改width就启用扩容。
  if (
    definition.width !== 384 ||
    definition.height !== 256 ||
    definition.tileSize !== 16
  )
    throw new RangeError(
      "unsupported world dimensions for current rule profile",
    );
  const roads = createRoadGraph(definition.assets.roadGraph);
  const terrain = createPathfinder(definition, roads);
  return { definition, roads, terrain };
}

// 当前产品仅装配基准世界；旧API是此实例的兼容门面，不可用于预览热替换。
export const defaultWorldResources = createWorldResources();
