# 卧龙传 Web 复刻 · Checkpoint Journal

> 记录最近一轮会话的详细进展、调试过程、失败尝试、相关文件、当前阻塞和下一步。
> 长期项目事实、架构、命令和约定见 `../AGENTS.md`；稳定逆向证据见 `re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 会话日期与目标

- 日期：2026-08-31
- 基线提交：`a9ec763 feat: restore legion upkeep and capital replenishment`
- 用户目标：从最初11项战略/战斗问题扩展为“全面逆向原游戏 AI”，所有结论必须来自 KI.EXE、数据或资源，并标注地址、字段、RNG、扫描顺序及实锤/推断/未知。
- 本轮实际范围：闭合并落实 **战略调度、NPC边境军事反应、宣战消息、道路接敌、战略速算入口、战败撤退、破城与灭亡通知**。没有宣称完整 NPC 自主经营 AI 或完整战术逐帧 AI 已完成。

## 一、主要逆向结论

### 1. 战略主循环与调度

- `0x1D0B` 固定顺序：
  1. `0x3EFD`：一个据点槽；
  2. `0x25A3`：16个军团槽；
  3. `0x2459`；
  4. `0x1D8E`：日历/时刻进位。
- `CF2` 当前值 `<8` 时只自增；达到8时进位。因此从0起共9次主更新进入下一游戏时刻。
- `0x1DEC` 仅在时刻进位时调用 `0x3E11`；每次轮转一个势力槽。旧笔记“每主更新调用”以及地址 `0x1E04` 均已修正。
- 128军团槽每8次主更新扫完；192据点槽约每日扫完。接敌11次槽调度约10游戏小时；48回归约42.7游戏小时。

### 2. NPC边境反应与编成

- `0x3EFD→0x3F74→0x3FA9` 按 `city.raw[0x1C..0x1F]` 原始四邻顺序检查战略目标势力。
- 邻城候选写入运行态强度 `+1`（`0x4013..0x4019`）；弱城请求数为 `threatTotal+2-localStrength`。
- 玩家空虚边城走 `0x40C9`：通用NPC TALK38，冷却 `(rng&0x0F)+0x18`，即24..39次本城轮询。
- AI边城走 `0x4575→0x45C1→0x6E8F`：
  - 首都生成新军；
  - 选择最高武力待命武将，同值低索引；
  - 六队候选顺序：`[骑弓步, 骑弓步, 弓骑步, 弓骑步, 步弓骑, 步弓骑]`；
  - 每个候选池至少50，任一队失败则整次编成失败；
  - 实际每队补至最多100并真实消耗预备池；
  - 新军目标为请求增援的己方边境城。
- 官方第一章 fixture：吕布势力首都79、边境城76，宣战后可由首都编成并增援城76。
- `city[+0x18]` 的完整产品语义仍未知；当前 Web 用同城有效军团数映射强度，文档已标为推断。

### 3. 宣战消息

- AI→玩家：`0xCE7` 警告 → 通用NPC TALK63 → AI君主 TALK478..480。
- 玩家主动宣战：玩家君主 TALK486..488。
- 战略消息改为 FIFO；最终君主对白关闭后才提交 `target_faction` 与敌对关系，避免对白尚未完成就提前开战。
- 消息 `onClose` 增加 once guard，右键与自动关闭不能重复提交。

### 4. 接敌、速算与闪动

- `0x2708` 提交下一道路点前按军团槽序查敌；发现异势力军团后停止原位。
- 接敌状态初值12，并在同轮减为11；逐次该槽调度重检目标，倒计时结束后进入战斗。
- NPC-NPC、委任军团和临时城防走战略速算；玩家直属军团进入战术层。
- `0x5130` 速算实锤：平手攻方胜，六队交错消耗12次原版字节 RNG，胜败方伤亡及士气按原公式回写。
- 小地图只读取 `addMiniBattleFlash()` 显式队列；普通 `legion.target` 不再提前响/闪。闪动1500ms后清理。
- YNSOUND ID3 已闭合到 SOUND.DAT 记录3→13→0及PIT分频256（约4.66kHz）；芯片/PCM仍未知，Web音色不得称为复刻。

### 5. 战败撤退与灭亡

- `0x474A/0x487B`：败方若可继续，最终目标固定为本势力首都，不是最近己城。
- 道路中战败必须在清导航前保存当前边、点序和方向；端点按原版 `edge+8` 后 `edge+6` 优先级。
- 撤退后续路径只允许经过己方据点；交战中的敌城同样阻断。
- 破城链确认：`0x4CF3→0x4DF0→0x4DA4→0x4FCE`。必须先处理同城守军组，再执行最后一城灭亡。
- `0x4FCE` 已定位为按武将索引0..126扫描并进入三类分支，但自尽/俘获/流散条件未完全闭合。本轮删除了未经证据支持的近似武将去向，只保留势力失活、TALK36、目标清理与玩家game over。

## 二、实现与相关文件

### 产品代码

- `web/src/game/clock.js`
  - 增加 `onStrategicTick/onHour`；实现9主更新/时刻和战斗 hold 后的 pending calendar advance。
  - 注释统一为 `CF2=0..8`；速度仅作为Web墙钟表现。
- `web/src/main.js`
  - 每主更新按游标调用一个据点槽和16个军团槽；每时刻调用 `0x3E11` 对应入口。
  - 初始化/恢复 `_cityTickCursor`、`_legionBatchCursor`、外交游标和时钟子刻度。
- `web/src/game/ai.js`
  - 移除“NPC无军团就自动生成君主军团”的无证逻辑。
  - 接入逐城边境扫描、AI编成、单城 `0x4194/0x4269`、16槽军团处理和延迟回归。
  - 修正主循环顺序为城先于军团，避免首都补员抢先消耗编成兵池。
  - 修正邻城强度 `+1`、撤退己方城市约束、占城后停止旧命令。
  - 增加宣战关闭回调、道路上下文快照、即时灭亡通知；删除未知灭亡武将近似分派。
- `web/src/game/savegame.js`
  - 快照守卫加入待补战略进位。
  - sidecar 保存延迟回归、事件队列、RNG及三个调度游标。
- `web/src/game/world.js`
  - 新局显式清除战略调度游标。
- `web/src/ui/gamebar.js`
  - 修正空据点命令菜单 hover/hit-test 优先级。
  - 战略消息支持 once `onClose`；普通行军目标不再进入闪动队列。

### 测试

- 新增 `tools/verify_strategic_city_ai.mjs`：
  - 第一章吕布首都编成/边境增援；
  - TALK38冷却；
  - 弱城“邻城强度+1”请求数；
  - 最高武力而非君主特判。
- 扩展：
  - `verify_clock_transition.mjs`
  - `verify_diplomacy_runtime.mjs`
  - `verify_postbattle_fate.mjs`
  - `verify_siege_result.mjs`
  - `verify_advisor_delegation_ui.mjs`
- 工作区原先已有三项纯格式改动：
  - `verify_engage_transition.mjs`
  - `verify_legion_daily.mjs`
  - `verify_march_navigation.mjs`
  本轮未覆盖或回退。

### 文档与技能

- 更新：
  - `web-port/AGENTS.md`
  - `docs/re-notes-kernel.md`
  - `E:/Dragon/.agents/skills/re-domestic-diplomacy/SKILL.md`
  - `E:/Dragon/.agents/skills/re-march-engagement/SKILL.md`
  - `E:/Dragon/.agents/skills/re-post-battle/SKILL.md`

## 三、调试、审查与失败尝试

1. **审查纠正 `0x3E11` 频率误判**
   - 初版 reviewer 将其判为每日调用，另一 reviewer 又将 `CF2` 判为0..7。
   - 重新直接反汇编 `0x1D0B..0x1E16` 后确认：`CF2=0..8`；`0x3E11` 位于 `0x1DEC`，是每时刻一次。
   - 旧文档中的 `0x1E04` 实为速度等待分支，已勘误。

2. **城/军团顺序**
   - 初版 `aiTick` 先补员后跑据点AI，会使同批首都军团先消耗兵池，压制边境请求编成。
   - 改为单城AI及成长先执行，再处理16个军团槽。

3. **灭亡链无证实现**
   - 初版根据君主、俘虏标志和status近似处理全部残余武将。
   - reviewer指出 `0x4FCE` 特殊条件未闭合，且调用顺序早于 `0x4DA4`。
   - 重新反汇编 `0x4CF3..0x511F` 后删除近似规则，并恢复守军先于灭亡。

4. **宣战提交过早**
   - 初版两条消息入队后立即 `declareWar`。
   - 加入战略消息 `onClose`，最终对白关闭后才提交；无GameBar的纯逻辑环境才直接提交。

5. **测试执行目录错误**
   - 一次从 `E:/Dragon` 运行 `node tools/...` 导致模块路径不存在。
   - 切换到 `E:/Dragon/web-port` 后全部通过；非业务回归。

6. **UI测试暴露既有诊断**
   - 扩展 `verify_advisor_delegation_ui.mjs` 时，pi-lens指出 JSON fixture 解析无 try/catch。
   - 已补明确错误包装，再加入 hover 与闪动回归。

7. **最终 reviewer**
   - 一次全面 reviewer 运行15分钟超时，未修改文件也未产出结论。
   - 随后限制为六个关键点的快速只读复审，结果 `PASS`。

## 四、验证结果

以下命令均在 `E:/Dragon/web-port` 通过：

```text
node tools/verify_clock_transition.mjs
node tools/verify_strategic_city_ai.mjs
node tools/verify_diplomacy_runtime.mjs
node tools/verify_new_game_initialization.mjs
node tools/verify_legion_daily.mjs
node tools/verify_engagement_state.mjs
node tools/verify_march_navigation.mjs
node tools/verify_postbattle_fate.mjs
node tools/verify_siege_result.mjs
node tools/verify_field_result.mjs
node tools/verify_delegated_autobattle.mjs
node tools/verify_save_transition_guard.mjs
node tools/verify_local_saves.mjs
node tools/verify_advisor_delegation_ui.mjs
```

另已通过：

- 本轮相关 JS/MJS `node --check`；
- `git diff --check`；
- 变更文件 LSP primary：0 diagnostics；
- `lens_diagnostics mode=all`：无问题；
- 全新 Chromium Playwright 冒烟：应用正常加载，仅既有 `favicon.ico` 404；动态检查9次战略tick进入下一时刻。

## 五、当前工作区

尚未提交。`git status --short` 当前包含：

```text
M AGENTS.md
M docs/checkpoint-journal.md
M docs/re-notes-kernel.md
M tools/verify_advisor_delegation_ui.mjs
M tools/verify_clock_transition.mjs
M tools/verify_diplomacy_runtime.mjs
M tools/verify_engage_transition.mjs
M tools/verify_legion_daily.mjs
M tools/verify_march_navigation.mjs
M tools/verify_postbattle_fate.mjs
M tools/verify_siege_result.mjs
M web/src/game/ai.js
M web/src/game/clock.js
M web/src/game/savegame.js
M web/src/game/world.js
M web/src/main.js
M web/src/ui/gamebar.js
?? tools/verify_strategic_city_ai.mjs
```

禁止整体 `reset/clean`；其中三项测试文件包含本轮开始前已有的纯格式改动。

## 六、当前阻塞与下一步

### 未闭合/阻塞

1. `0x3E11` 势力级完整自主决策：目标选择/改换、财政危机、内政和多战线调动。
2. `city[+0x18]` 运行态强度的完整产品定义，以及 `0x4325` 状态8/10策略。
3. `0x4FCE` 武将自尽、俘获、流散三分支的精确字段条件。
4. 战略事件 type2/4/6/7/8/9/10 的产品语义和NPC响应。
5. 战术战场内六队逐帧 AI 尚未全面动态对齐。
6. YNSOUND ID3 的后端芯片/PCM和真实音色。
7. 原版五档战略速度的精确墙钟毫秒值。

### 建议下一步

1. 继续反汇编 `0x3E11` 相关势力字段与其调用的 `0x31AE/0x3E65/0x3E8E`，区分事件队列、资源危机与真正的目标决策。
2. 针对 `0x4FCE→0x50B4/0x50D7/0x29C3` 建立字段矩阵，先闭合固定扫描和分支条件，再写产品代码。
3. 使用 DOSBox-X debugger 捕获 KI.EXE 战术逐帧状态，与 `web/src/game/battle/originaldiff.js` 做 ground-truth 差分。
4. 提交前再次运行变更 focused suite、LSP、lens和全新浏览器冒烟；按功能审查并暂存，避免混入无关工作区改动。
