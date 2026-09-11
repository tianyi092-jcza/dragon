// 当前世界/资源定义。尺寸与槽位限制集中在此，不表示已支持容量扩展。
// 编辑源位于web/content/builtin/world；地图PNG是离线编译的可重建产物。
export const DEFAULT_WORLD = Object.freeze({
  id: "mmap-original",
  revision: "1",
  width: 384,
  height: 256,
  tileSize: 16,
  assets: Object.freeze({
    terrain: "mmap_map.bin",
    roadGraph: "road_graph.json",
    roadCost: "road_cost.bin",
    roadOffset: "road_offset.json",
    seasons: Object.freeze({
      spring: "map_tiles_spring.png",
      summer: "map_tiles_summer.png",
      autumn: "map_tiles_autumn.png",
      winter: "map_tiles_winter.png",
    }),
  }),
});

// KI兼容布局不是任意数组length；扩大世界须逐条审计使用位置与哨兵冲突。
export const STRATEGIC_LAYOUT = Object.freeze({
  citySlots: 192,
  legionSlots: 128,
  legionBatchSize: 16,
  factionSlots: 24,
  scheduledFactionSlots: 22,
  nodeSize: 8,
  edgeBase: 0x0800,
  edgeSize: 0x10,
  pointBase: 0x2000,
  pointSize: 4,
});
