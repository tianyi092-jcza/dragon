// 卧龙传 Web 引擎 — 世界常量与游戏数据模型
// 数据来源: tools/parse_sinario.py 提取自 SINARIO.DAT

export const WORLD = {
  TILES_X: 384,
  TILES_Y: 256, // MMAP.MAP 格子数
  TILE_PX: 16, // 每格像素 (mode 12h 图块)
  get WIDTH() {
    return this.TILES_X * this.TILE_PX;
  }, // 6144
  get HEIGHT() {
    return this.TILES_Y * this.TILE_PX;
  }, // 4096
};

// SINARIO.DAT 布局常量(文档化用途)
export const SINARIO = {
  SCENARIO_SIZE: 22208,
  OFF_FACTIONS: 0x80, // 24 × 64B
  OFF_CITIES: 0x8c0, // 200 × 32B
  OFF_LEGION_STATE: 0x2240,
  OFF_LEGION_SAVE: 0x22c0, // 128 × 64B
  OFF_GENERALS: 0x42c0, // 128 × 32B
  EMPTY_FACTION: 0x18,
};

export const SEASONS = ["spring", "summer", "autumn", "winter"];

/** 按月份返回季节索引: 3-5春 6-8夏 9-11秋 12-2冬 */
export function seasonOf(month) {
  return Math.floor(((month + 9) % 12) / 3); // 3月→0春 … 12月→3冬? 验证: m=12→(21%12)/3=3冬 ✓ m=7→(16%12)/3=1夏 ✓ m=3→0春 ✓
}

/** 势力颜色表（固定 20 色，按势力顺序分配）：取自 256 色中互不相近的鲜明色，
 *  不含红/白/灰（红留给玩家）。相邻序号颜色差异尽量大；
 *  势力数超过 20 时从头循环复用（i % 20）。 */
const FACTION_COLORS = [
  "#ffd700",
  "#008000",
  "#0000cd",
  "#ff00ff",
  "#ff8c00",
  "#008080",
  "#8a2be2",
  "#00ff00",
  "#000080",
  "#ffff00",
  "#20b2aa",
  "#4b0082",
  "#d2691e",
  "#00ffff",
  "#4169e1",
  "#808000",
  "#9932cc",
  "#7fff00",
  "#8b4513",
  "#40e0d0",
];
/** 玩家势力固定红色 */
export const PLAYER_RED = "#e02020";
export const factionColor = (i) => FACTION_COLORS[i % FACTION_COLORS.length];
/** 取势力颜色：玩家势力固定红，其它查表（超过 20 色循环复用） */
export function factionColorEx(sc, i) {
  if (sc && i === sc.player_faction) return PLAYER_RED;
  return factionColor(i ?? 0);
}
/** 依底色亮度返回适合的文字色：YIQ 亮度 >= 128 用黑字（如青 #00ffff），否则白字（如绿 #008000 / 海军蓝 #000080） */
export function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? "#000" : "#fff";
}

/** 据点类型（原版城池记录 +0x16 低半字节，KI.EXE 0x7EDB 查表 0x7df5 实锤）：
 *  0大都市 1中都市 2小都市 3關卡 4戰場 5港都 */
export const CITY_TYPES = [
  "大都市",
  "中都市",
  "小都市",
  "關卡",
  "戰場",
  "港都",
];
export const cityTypeLabel = (t) => CITY_TYPES[t] ?? "";

/**
 * 从 data.json 的只读章节模板创建一局全新的游戏状态。
 * SINARIO 不含运行时军团表，因此所有章节开局都必须保持 legions=[]。
 */
export function createNewGameScenario(raw, playerFaction = null, advisor) {
  const state = structuredClone(raw);
  if (playerFaction != null) state.player_faction = playerFaction;

  // 原版新章节头字段为未指定/满信赖；Web 选定玩家势力后从满值开始。
  state.trust = 255;
  delete state.trust_game_over;
  // 新局不得继承任何 Web 运行时队列或派生状态。正常 data.json 模板不含这些字段；
  // 这里仍显式清理，保证同章重开及意外模板污染都回到纯 SINARIO 初态。
  delete state.save_date;
  delete state.delayedLegionReturns;
  delete state.prisoners;
  delete state.pendingRecruits;
  delete state.pendingTruceNegotiations;
  delete state.pendingAssistanceNegotiations;
  delete state.pendingStrategicEvents;
  delete state.pendingEnvoyBudgetReports;
  delete state.strategicEventSlots;
  delete state.disasterMapObjects;
  delete state._disasterBounds;
  delete state.envoys;
  delete state._appeared;
  delete state._nextRuntimeLegionId;
  delete state._legionBatchCursor;
  delete state._cityTickCursor;
  delete state._factionTickCursor;
  delete state._strategicEventCursor;
  delete state._strategicEventDivider;
  delete state._envoyDiplomacyCursor;
  for (const faction of state.factions ?? []) {
    delete faction.dead;
    delete faction.gold;
    delete faction.food;
    delete faction.troops;
    delete faction.monthly_reserve_upkeep;
  }
  for (const city of state.cities ?? []) {
    delete city.sim;
    delete city.disaster;
    delete city.growth_rate;
    delete city.disaster_event;
    delete city._strategicLastFaction;
  }
  for (const general of state.generals ?? []) delete general.is_player;

  // 剧本镜像没有运行时军团。即使模板被意外污染，也不能带入新游戏。
  state.legions = [];
  delete state.armies;

  state.player_advisor = null;
  if (advisor === null) {
    const faction = state.factions?.find(
      (candidate) => candidate.idx === state.player_faction,
    );
    const general =
      faction?.advisor_idx == null
        ? null
        : state.generals?.[faction.advisor_idx];
    if (general) {
      state.player_advisor = {
        custom: false,
        general_idx: general.idx,
        name: general.name.trim(),
        hao: (general.hao ?? "").trim(),
        portrait: general.portrait,
      };
    }
  } else if (advisor) {
    state.player_advisor = { custom: true, general_idx: null, ...advisor };
  }
  return state;
}

/** 剧本数据视图 — 对 data.json / SAVE state 的一个薄封装 */
export class Scenario {
  constructor(raw) {
    Object.assign(this, raw);
  }

  city(i) {
    return this.cities[i];
  }

  /** 城池所属势力对象(null=空城) */
  factionOf(city) {
    return city.faction == null ? null : this.factions[city.faction];
  }

  /** 势力君主武将记录(权威: 势力记录 byte[1] = 君主索引) */
  monarchOf(faction) {
    return this.generals[faction.monarch_idx];
  }

  /** 势力君主头像 PNG 路径 */
  portraitOf(faction) {
    const m = this.monarchOf(faction);
    return `kao/${m ? m.portrait : 0}.png`;
  }

  /** 某势力拥有的城池列表 (对应内存 DS:0x840 城池数组按 +1=所属过滤) */
  citiesOf(factionIdx) {
    return this.cities.filter((c) => c.faction === factionIdx);
  }
}
