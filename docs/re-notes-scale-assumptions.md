# 规模假定普查（192 城 / 128 将 / 20 章，只读，2026-10-10）

目标：回答"230 城 / 158 将 / 12 章"是否可行，分级：A 改数字就行 / B 改结构（机械） / C 改规则（危险，动原版机制）。

## 192 城

- **C-规则层（original*.js 约 15 文件）**：`originalcapitalrelocation.js:22`、`originalmonthlybudgets.js:54`、`originalmonthlydiplomacy.js:107`、`originalmonthlyfiscal.js:109/255`、`originalcitycapture.js:38`、`originallegionfate.js:522` 等固定 `for (i<192)` 扫描；`originalcity.js:44/110`、`originalroadarrival.js:20` 等 `index>=192` 守卫；`originalroadstate.js:3/16` 槽算式（`8*slot`、`20h*slot`，slots 0..191）；`originalroadmemory.js:6` `NODE_COUNT=192`＋版本检查 192 节点记录。**这些是原版机制复刻**，改数即改规则（月结/寻路/攻城全受影响），属 C。
- **B-结构层**：`gamesource.js:221/225`（192 城＋slot 0..191）、`mapcompile.js:10` `CITY_SLOTS=192`、`worlddefinition.js:8`、`trialcompile.js:30`（192 槽位投射）、`entitysource.js:24`（city32/192）、`ai.js:929/935/5283/5341`（寻路节点表与 192 城槽同序＋`%192` 游标）。机械可改，但改后须重验寻路/AI。
- **耦合积**：3840（=20×192）城记录数组（`scenariocitycache.js` 灾害/冷却、`weather.js` 灾害槽）。改任一因子都要同步改数组尺寸，属 B。

## 128 将（武将槽）

- **B-编辑器实体层**：`entityindex.js:11/15`（章 generals 定长 128，slot127 保留）、`entityinspection.js:13/15/18/24`（128 引用表）。机械可改。
- **B/C-边界**：`battle/originalmessages.js:18/172`（slot<128/127）、`autobattle.js:115`（slot>=127）、`g1F` 注释"inactive/127 retained"。战斗消息层按 128 定界，放开需验战术全链，偏 C。
- 未含 128 军团槽（`LEGION_SLOT_COUNT=128`，军团数，用户未要求放开，保持）。

## 20 章

- **B-数组尺寸**：3840 城记录（见上）、`entitysource.js:15/17`（内置包 20 章）、`trialassetmanifest.js:114`（20 未闭合引用与章数同数，改章数须同步改登记逻辑）。
- **A-已放开**：`gamesource.js` `chapterOrder` 只验成员存在，不验长度——**12 章新游戏在校验层已天然允许**。
- 工具层多处 `for idx<20`（stage/verify 脚本）属测试脚手架，随改随调，A。

## 结论

- **12 章**：校验已允许，B 级收尾（登记逻辑＋工具脚手架）即可。
- **158 将**：编辑器层 B，战斗消息层需战术回归（偏 C，建议放开后重跑 tactical lane）。
- **230 城**：C 级为主。192 是原版规则引擎的世界模型（寻路寻址/月结扫描/槽算式），放开＝重写部分规则代码，与"玩法/AI 不变"直接冲突。**建议：城数暂锁 192，先放开将数与章数；230 城需单独立项（规则改造），不能塞进编辑器前提。**

存档 codec（gamesavecodec.js）未见 192/128/20 字面量，属好消息；150 kao / 15 kyo 为固定资源数，非可编辑计数，不在本次放开范围。
