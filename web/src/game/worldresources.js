// 资源实例不进入Scenario/IndexedDB快照；仅保存世界定义与该世界的导航缓存。
import { DEFAULT_WORLD } from "../content/worlddefinition.js";
import { loadSeasonTile, loadImage, loadBytes } from "../core/assets.js";
import { createChunkedTerrain } from "../render/chunkedterrain.js";
import { SEASONS } from "./world.js";
import { isNorthExtension, isSupportedMapExtent } from '../content/authoring/mapextent.js';
import { createWorldGridRoads } from './navigation/worldgridroads.js';
import { createRoadGraph } from "./navigation/roadgraph.js";
import { createPathfinder } from "./navigation/pathfinder.js";

function freezeDefinition(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDefinition(child);
    Object.freeze(value);
  }
  return value;
}

export function createWorldResources(definition = DEFAULT_WORLD, {
  fetcher, imageLoader = loadImage, bytesLoader = loadBytes,
  seasonLoader = loadSeasonTile, assertCurrent = () => {}, northExperiment = false,
  // MAP-EXT E6: explicit opt-in for supported extents (any side), not north-only.
  mapExtent = false,
} = {}) {
  // Trusted local I/O/lifecycle ports, not runtime admission or server authority.
  if ((fetcher !== undefined && typeof fetcher !== "function") ||
      [imageLoader, bytesLoader, seasonLoader, assertCurrent].some(port => typeof port !== "function"))
    throw new TypeError("Invalid world resource ports");
  assertCurrent();
  // 当前仍有固定坐标/槽位/图块语义约束，不能靠修改width就启用扩容。
  // MAP-EXT E6: mapExtent 接受任一受支持侧（原域照旧）；northExperiment 仍仅北向。
  const allowGrid = northExperiment || mapExtent;
  // MAP-EXT E6: flat refusal ladder (no nested ternary across ||).
  const originShape = definition.width === 384 && definition.height === 256 &&
    (definition.minX ?? 0) === 0 && (definition.minY ?? 0) === 0;
  const gridShape = mapExtent ? isSupportedMapExtent(definition) : isNorthExtension(definition);
  if (definition.tileSize !== 16 || (allowGrid ? !gridShape : !originShape))
    throw new RangeError(
      "unsupported world dimensions for current rule profile",
    );
  // Capture identity and URLs before asynchronous loads; never retain caller aliases.
  definition = freezeDefinition(structuredClone(definition));
  const roads = allowGrid ? createWorldGridRoads(definition,{fetcher,assertCurrent}) : createRoadGraph(definition.assets.roadGraph, { fetcher, assertCurrent });
  const terrain = createPathfinder(definition, roads, { fetcher, assertCurrent });
  return Object.freeze({
    definition, roads, terrain,
    // Lazy: constructing a world or displaying the title must not load bitmaps.
    loadSeason: async (season, day = 16) => {
      assertCurrent();
      const index = SEASONS.indexOf(season);
      if (index < 0 || !Number.isInteger(day) || day < 0 || day > 16)
        throw new TypeError("Invalid season phase");
      const from = SEASONS[(index + 3) % 4];
      const atlas = definition.assets.seasonAtlases?.[season];
      if (!atlas) {
        const [image, previous] = await Promise.all([
          seasonLoader(season, definition),
          day < 16 ? seasonLoader(from, definition) : null,
        ]);
        assertCurrent();
        if (day === 16) return image;
        // Legacy full-image port: blend at draw time, never allocate two full maps.
        return Object.freeze({ draw(ctx, x, y, scale) {
          assertCurrent();
          const w = definition.width * 16 * scale, h = definition.height * 16 * scale;
          ctx.drawImage(previous, x, y, w, h);
          ctx.save();
          ctx.globalAlpha *= day / 16;
          ctx.drawImage(image, x, y, w, h);
          ctx.restore();
        }});
      }
      const [target, previous, layout] = await Promise.all([
        imageLoader(atlas),
        day < 16 ? imageLoader(definition.assets.seasonAtlases[from]) : null,
        bytesLoader(definition.assets.terrain),
      ]);
      assertCurrent();
      let image = target;
      if (day < 16) {
        // KI:9336/9377 dates; modern RGB interpolation, NOT a VGA/DAC emulator.
        // One small immutable atlas per date also colors the native terrain overlay.
        image = document.createElement('canvas');
        image.width = target.width; image.height = target.height;
        if (previous.width !== image.width || previous.height !== image.height)
          throw new TypeError("Season atlas dimensions differ");
        const ctx = image.getContext('2d');
        ctx.drawImage(previous, 0, 0);
        const pixels = ctx.getImageData(0, 0, image.width, image.height);
        ctx.clearRect(0, 0, image.width, image.height);
        ctx.drawImage(target, 0, 0);
        const next = ctx.getImageData(0, 0, image.width, image.height).data;
        for (let i = 0; i < next.length; i++)
          pixels.data[i] = Math.round(pixels.data[i] + (next[i] - pixels.data[i]) * day / 16);
        ctx.putImageData(pixels, 0, 0);
      }
      const chunked = createChunkedTerrain(image, layout, definition);
      // M2：只读投影需要当季图集绘制 8A1E 差分；附加引用，不改规则权威。
      return Object.freeze({ ...chunked, atlasImage: image });
    },
  });
}

// 当前产品仅装配基准世界；旧API是此实例的兼容门面，不可用于预览热替换。
export const defaultWorldResources = createWorldResources();
