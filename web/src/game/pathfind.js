// 旧地形/格网API的兼容门面；资源缓存现由世界实例持有。
// P67 G7: 像素寻径 findPath 导出删除（G2已删唯一生产调用方 stepLegacyPath；
// 测试侧经 world.resources.terrain.findPath 直调实例，不走此门面）。
import { defaultWorldResources } from "./worldresources.js";

export const {
  loadTerrain,
  terrainTile,
  roadOffset,
  passable,
  gateDirs,
} = defaultWorldResources.terrain;
