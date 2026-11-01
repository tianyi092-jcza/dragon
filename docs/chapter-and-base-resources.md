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
| 章节时间 | `state.start.{era,year,month,day}` | 章节 | 用户 2026-11 决定开放编辑：`era` 是**作者层纪年标签**（`bc`／`ad`，缺省视同 `ad`），与原生 `day`／`month` 字节、`year` u16 并列，**绝不把年份取负**，所以切换纪年不会重编号或丢失既有年份；年 1–65535、月 1–12、日 1–31 只是编辑器输入范围（非 KI 规则）。B4 起在 `#chapters-editor` 可写，`DraftPanel` 仍只读展示 |
| 章节属性写入口径 | 势力槽 `raw@1/2/3/0x2A`、据点 `raw+0x01`、`nativeFactionSlotRaw`／`nativeCityRecordRaw` | 章节 | B4 统一为「**命名视图＋固定 raw 槽同步**」：只改命名值会在试玩／发布被 `factionNativeConsistencyGaps` 以 `entity-native-mismatch` 拒绝（`initializeNativeFactionSlots` 用 raw 覆盖命名视图）。势力槽 offset／空值哨兵：`monarch_idx@1`（null→`0xFF`）、`advisor_idx@2`（null→`0x7F`）、`capital@3`（null→`0xFF`）、`diplomat_idx@0x2A`（null→`0xFF`）；据点 `+0x01`＝**当前所属**（null→`0x18`），而 `+0x1A` 是**原版旧所属，绝不能改**。外交官与内政官在 20 章内置初态全为 null；**内政官（`city.governor`，须联动 `general+0x17=2` 与预算 `general+0x1A`，KI `6A9B..6B70`）本批只读、未开放**。首都不要求该据点属于该势力（内置资料自有 8 例） |

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
   B5（2026-11）已让作者层对**游戏自有来源**（`builtin-template` 与 `builtin-copy`）可读写：
   `game.generals` 是默认空的武將庫、`chapter.people` 是章節引用，命令只改这两个根；库 → 原生
   128 槽的 materialize **仍未做、未裁決**，因此导入不等于可試玩（见 `checkpoint-journal.md`
   「B5 武將庫」節）。舊槽位字典不是庫，读写都 fail-closed。

## 5.1 B6（2026-11）之後的新遊戲形狀（實作現狀，非新機制）

- 工作台級「新建遊戲」產出 **空殼作者檔案**（`sourceRef.kind='builtin-template'`）：地圖（含道路／放置物）＋192 據點定義＋一個空白首章（`state.factions/generals/cities` 皆空），`generals`（遊戲級武將庫）為空。基地圖與據點是**複製**，不是引用底層資源。管理員「複製遊戲」才產出完整副本（`builtin-copy`：20 章＋原生 128 武將／192 據點）。
- 因此 §1／§2 的「章節引用基礎資料」目前只對**完整副本**成立：空殼檔案的 B4 章節屬性面、B5「從底層資源導入」都尚未開放（`replayTemplateHistory` 只允許結構操作；導入來源取自本遊戲章節原生武將記錄）。這是待裁決缺口，不是已實作行為。

## 6. 玩家端存档校验（用户决定）

覆盖发布后：旧版本在玩家端不可选；加载存档时校验 ①**游戏是否仍存在** ②版本标识。
`web/src/player/playersaves.js:15,20` 把存档绑定到
`releaseId / releaseOrdinal / manifestDigest / sourceDigest`，不符时抛 `TypeError`；不需要新版本机制。

B7（2026-11）已实现面向玩家的结果，两者口径不同：

| 情况 | 判定 | 面向玩家 |
|---|---|---|
| 游戏已不存在 | 仅 reader 明确 `410 GAME_DELETED` | 「該遊戲已被刪除，存檔不可用，是否刪除？」→ **确认**才逐槽 `compareDelete`（无法核对的槽保留并按数报告），**取消／右键**保留 |
| 版本不符 | 既有身份字段比对 | 旧版存档不能载入并**自动清除**（已批准政策，不逐档确认）；无法判定为旧版的行保留且不载入 |

维护源：`web/src/player/playerdeletedgame.js`；接线在 `playerpublic.js`（载入入口）与 `playerrestore.js`（读档选择器）。
细节与证据见 [R2 接线 §2.73](r2-player-connection.md) 与 `checkpoint-journal.md`「B7」節。
