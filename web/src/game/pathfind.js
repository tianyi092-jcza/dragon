// 旧地形/格网API的兼容门面；资源缓存现由世界实例持有。
import { defaultWorldResources } from "./worldresources.js";

export const {
  loadTerrain,
  terrainTile,
  roadOffset,
  passable,
  gateDirs,
  findPath,
} = defaultWorldResources.terrain;
