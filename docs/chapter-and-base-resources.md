# 城池据点（基础资料）与章节属性归属（模型合同）

按用户定义建立：**剧本 = 底层基础资料（全章共享）+ N 个互相独立的章**。章节**引用**基础资料，不复制；
因此「改基础属性」自动传导、「删基础资料」使引用它的章失效。本文是字段归属与校验口径的单一维护源。

## 1. 城池据点等基础资料（游戏级，全章共享，章只引用）

| 类别 | 字段（作者层） | 来源 | 章可修改？ |
|---|---|---|---|
| 地图地形 | `map`（tile、`componentDefinitions`） | 剧本 | 否 |
| 道路 | `map.roads[].fromCityId/toCityId` | 剧本 | 否 |
| 地图放置物 | `map.placements[].cityId` | 剧本 | 否 |
| 据点定义 | `cities[cityId]` = `{cityId, runtimeSlot, x, y, name}` | 剧本 | 仅经 `overrides`（当前关闭） |
| 武将资料 | `generals[generalId]`：姓名、字、头像、能力（siege/field/naval/force/lead/politics）、`talk_idx` 等 | 剧本／固定源 entity-source | 仅经 `overrides` |
| 固定运行槽 | 据点 192 槽、武将 128 槽（`runtimeSlot`/`idx` 锁定） | 剧本 | 否 |

依据：`web/src/content/authoring/cityrecords.js`（定义键白名单 `cityId/runtimeSlot/x/y/name`）、
`gamesource.js:316-332`（192 据点、道路/放置物引用检查）、`generaldefinitions.js`（`generals` 定义 + `captureScope`）。

## 2. 游戏章节属性（`chapters[chapterId]`，各章独立）

| 类别 | 字段 | 归属 | 说明 |
|---|---|---|---|
| 势力 | `factions[0..21].idx` | 章节 | 势力**是章节定义**，不是基础资料 |
| 君主 | `factions[].monarch_idx` | 章节 | 同一武将在不同章可为不同势力的君主或普通武将 |
| 军师／外交官 | `advisor_idx` / `diplomat_idx`（可空） | 章节 | |
| 势力基本面 | `capital`、`money`、`legion_morale_cap`、`reserve_cav/arc/inf`、`bellicosity`、`talk_style`、`march_marker_style`、`n_generals`、`n_cities`、`target_faction`、`strategic_city_*` | 章节 | `gamesource.js:27-28` |
| 据点引用 | `cities[cityId].factionId` + `overrides` | 章节 | 归属势力属**章节**；数值（max_prod/prod/growth/defence/troops/troops_cap/type/view）在原生状态层属章节 |
| 武将引用 | `people[generalId].included` / `factionId` / `overrides` | 章节 | 所属势力属**章节**；`gamesource.js:90` 校验 `faction`/`join_faction` |
| 章节时间 | `startDate.{era,year,month,day}` | 章节 | 用户 2026-11 决定开放编辑：纪年标签（公元前／公元后）＋年/月/日，作为本章计时起点；现值只读（`DraftPanel.vue:56`） |

## 3. 校验规则（发布前试运行的口径）

1. **引用完整性**：章节引用不存在的 `generalId` / `cityId` → 该章失败（`gamesource.js` 定义与引用分离）。
2. **删除即失败**：基础资料被任何章引用时不得删除——`generaldefinitions.js:161-163` 在保存期直接拒绝
   （`general definition is referenced by chapters`）；据点同理由 `captureCityDefinitions` 保证键存在。
3. **改属性不失败**：改基础名称/能力/头像，无 `overrides` 的章自动继承（`inheritance()` 返回
   `inheritedFields`/`overriddenFields`），属正常传导，不产生缺口。
4. **章节内删除**：删势力 / 删据点引用 / 删武将引用 → 该章 `factionId` 或引用悬空 → 按 1 处理。
5. **全章汇总**：单章试运行只覆盖当前章；发布前试运行须遍历 `chapterOrder` 全部章，
   一次列出「哪些章因某基础资料被删除而失效」（防止基础资源地图、据点、武将缺失）。

## 4. 用户已决定（2026-11）：菜单与编辑面

- 模块名「基礎資料」改为**「城池據點」**，属游戏级模块。
- 章节属性（據點勢力歸屬／武將所屬身份職務）因章節數量動態，不放在據點 tab，而歸入独立的**「遊戲章節」**模块。
- 完整菜单与状态机见 [编辑器工作台结构](editor-workbench-structure.md)。

## 5. 已知不一致（待裁决，勿默认为已实现）

1. **据点势力归属未开放**：作者层 `captureChapterCities` 强制 `factionId === null` 且 `overrides` 必须为空
   （`cityrecords.js:29-36`），而原生状态层 `cities[].faction` 存在并被 AI/规则使用。
   → 「据点的势力所属是章节定义的」在数据层成立，在编辑入口尚未开放。
2. **两层表示并存**：作者层用 id 键（`cities[cityId]`、`people[generalId]`），原生状态用定长数组
   （`cities[192]`、`generals[128]`、`factions[]`）。两者之间的唯一转换点尚未在文档中声明，
   与「契约方言统一」属同一件事。

## 6. 玩家端存档校验（用户决定）

覆盖发布后：旧版本在玩家端不可选；加载存档时校验 ①**游戏是否仍存在** ②版本标识，任一不符即弹窗提示并可删除本地存档。
现状：`web/src/player/playersaves.js:15,20` 已把存档绑定到
`releaseId / releaseOrdinal / manifestDigest / sourceDigest`，不符时抛 `TypeError`。
→ 需要补的是**面向玩家的明确提示**（当前为内部错误类型），不是新的版本机制。
