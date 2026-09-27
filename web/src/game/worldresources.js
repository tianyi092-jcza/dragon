// 资源实例不进入Scenario/IndexedDB快照；仅保存世界定义与该世界的导航缓存。
import { DEFAULT_WORLD } from "../content/worlddefinition.js";
import { loadSeasonTile, loadImage, loadBytes } from "../core/assets.js";
import { createChunkedTerrain } from "../render/chunkedterrain.js";
import { createRoadGraph } from "./navigation/roadgraph.js";
import { createPathfinder } from "./navigation/pathfinder.js";

function freezeDefinition(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDefinition(child);
    Object.freeze(value);
  }
  return value;
}

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
  // Capture identity and URLs before asynchronous loads; never retain caller aliases.
  definition = freezeDefinition(structuredClone(definition));
  const roads = createRoadGraph(definition.assets.roadGraph);
  const terrain = createPathfinder(definition, roads);
  return Object.freeze({
    definition, roads, terrain,
    // Lazy: constructing a world or displaying the title must not load bitmaps.
    loadSeason: async (season) => {
      const atlas = definition.assets.seasonAtlases?.[season];
      if (!atlas) return loadSeasonTile(season, definition);
      const [image, layout] = await Promise.all([
        loadImage(atlas), loadBytes(definition.assets.terrain),
      ]);
      return createChunkedTerrain(image, layout, definition);
    },
  });
}

// 当前产品仅装配基准世界；旧API是此实例的兼容门面，不可用于预览热替换。
export const defaultWorldResources = createWorldResources();
