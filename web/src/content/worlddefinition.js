// Controlled local unified package; old revision assets remain untouched.
// Source/manifest share the compiler used by isolated editable copies.
import { BUILTIN_RESOURCES } from "./builtinresources.generated.js";
export const DEFAULT_WORLD = BUILTIN_RESOURCES.world;

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
