# AGENTS.md — 臥龍傳 Web 复刻项目记忆

> 本文件只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线状态。
> 本轮工作过程见 `docs/checkpoint-journal.md`；二进制证据和完整公式见 `docs/re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据原则

- 目标：不用模拟器，以 **原生 JavaScript ES Modules + Canvas 2D** 重写 1995 DOS《臥龍傳》。无框架、无构建、无 npm 运行时依赖。
- 仓库：`E:/Dragon/web-port`；原版程序与运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/` 是改版剧本库。
- 机制必须依据 KI.EXE、原始数据和资源逆向；文档与代码必须区分**实锤、推断、未知**。新逆向结论要同步回流到对应 SKILL/re-notes，不能只留在代码注释或会话中。
- 表现可以不同，但胜负、六队伤亡、士气、城壁、城损及战略资源变化必须遵循原版规则。
- 原版程序、资源和 DOS 存档仅供离线逆向，不得成为 Web 部署时依赖。

## 2. 数据与运行时边界

- 逻辑分辨率 `640×400`；战略画布 `#cv`，标题画布 `#startv`；战略地图逻辑网格 `384×256`。
- `web/data.json` 由 `tools/parse_sinario.py` 生成，共20章。修改解析器后必须重生成；禁止直接编辑生成物掩盖解析错误。
- SINARIO 不含运行时军团表。新游戏必须从 `legions=[]` 开始；读档保留军团、事件队列、日期和 RNG 快照。新局和读档统一经 `main.js::loadState` 装配。
- 每次装载都重建 canonical RNG；有快照时恢复，旧档无快照时不得继承上一局随机流。
- 资金是24bit有符号运行值，范围在 `-655000..655000` 饱和；兵力通常以十人为内部单位。跨解析、战略、战术和 UI 时必须明确单位。
- 正式存档只使用浏览器 IndexedDB（`wolong-web/saves`，四槽纯 JSON）。自动化测试必须使用 mock IndexedDB、独立浏览器 profile 或纯内存状态，禁止读写 `E:/Dragon/Dragon/SAVE.DAT`。
- 同 origin 单实例首选 Web Locks `wolong-web-game-instance`，旧浏览器降级为 `localStorage` 心跳；未取得锁时不得初始化 App、RAF 或写存档。

## 3. 当前架构

| 路径 | 职责 |
| --- | --- |
| `web/src/boot.js` | 单实例锁后动态启动应用 |
| `web/src/main.js` | App 装配、主循环、新局/读档、月结、战术入口和战果回写 |
| `web/src/core/localstore.js` / `singleinstance.js` | IndexedDB 持久化与浏览器单实例 |
| `web/src/game/savegame.js` | JSON 快照、恢复和存档时机守卫 |
| `web/src/game/ai.js` | 战略日调度、军团移动、接敌、AI、事件和战后处理 |
| `web/src/game/economy.js` | 资金 helper、军团日费和月度财政 |
| `web/src/game/diplomacy.js` / `audience.js` | 外交矩阵、事件、预算与觐见结果 |
| `web/src/game/roadgraph.js` | 原版192节点/254边道路拓扑和寻径 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算与城损纯函数 |
| `web/src/game/legionunits.js` / `legionmode.js` | 六队兼容、军团槽和委任权威 |
| `web/src/game/engagetransition.js` | 战略地图四相接战过渡 |
| `web/src/game/battle/original*.js` | 原版战术 RNG、对象池、命令、移动、碰撞、结果和差分工具 |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术表现层；只能读取规则状态 |
| `web/src/ui/gamebar.js` / `hud.js` | 顶栏、军师菜单、Canvas 弹窗、觐见与子界面 |
| `web/src/game/clock.js` / `core/modalclock.js` | 战略速度和模态 `clock.hold` |
| `tools/parse_*.py` / `tools/verify_*` | 原版数据生成与定向回归 |

## 4. 已确认的长期规则

### 4.1 战略军团与战斗

- 据点行军使用 `road_graph.json` 的原版道路拓扑，不在 bitmap 上自由 A*。军团沿边点列推进，到边端当轮停止；渲染不得推进路线。
- 接敌采用 `11→1` 倒计时并逐轮重检目标。玩家直属军团进入战术层；AI 或委任军团走战略速算。委任不能覆盖尚未完成的玩家命令。
- 每个活动军团每日按当前道路上下文结算：
  - 道路边：军费 `floor(troops/2)+floor(troops/4)`，不恢复士气。
  - 节点：军费 `floor(troops/32)+1`，士气 `+10`，封顶势力 `legion_morale_cap`（原字段 `+0x1D`）。
- 总兵低于600的军团实际位于本势力首都时自动重编补员：骑/步/弓分别使用对应预备池，每队最多100。补员真实消耗兵池，按军团槽序执行，并先于当日军费。
- 原版军团固定六队。旧 Web 对象只有总兵时使用兼容类型 `[1,1,3,3,2,2]` 补全；这是兼容策略，不是原版自动编成结论。
- 战果按六队和士气回写；战后继续、撤退、武将去向、48周期回归和破城组撤退已接入原版链。
- 接敌倒计时在原版 `+3>1` 阶段调用 YNSOUND ID 3；委任结算前的 Web 四相表现按 `0→1→2→3` 显示但不额外重播音效。小地图在据点或野外位置绘制白色十字闪动；WebAudio 音色仍是近似。

### 4.2 外交与财政

- SINARIO 外交矩阵只是初值。新游戏首次显示地图前执行运行时关系初始化；月结再次更新；读档不得重复执行开局初始化。
- 关系是有方向的；普通关系变化只修改指定方向，宣战/停战调用点才显式同步双方。raw `<0x80` 表示交战。
- AI 主动宣战和外交官报告都使用延迟战略事件，必须可存档恢复。
- 外交官仅在预算耗尽时申请经费；批准额在对话完成时扣款并换算为工作预算 `floor(grant/128)`。数字输入上限30000，非零最低500；外交费不得提前计入常规月支出。
- 外交官政治影响预算消耗速度和关系改善成功率，不改变单次成功增量。
- 所有即时资金收支统一使用 `applyFactionFundsDelta()`，保持 `gold/money` 同步和边界饱和。

## 5. 稳定交互与状态约定

- 全游戏不增加关闭按钮；弹窗和二级界面统一右键逐层回退。
- 羽扇是军师一级菜单唯一开关；关闭时必须清理所有子孙窗口、选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白处左键无功能，不关闭界面。
- NPC/武将通用消息3秒自动关闭或右键立即关闭；连续战略消息使用 FIFO，不得覆盖。
- Canvas 列表滚动条在右侧，选中行颜色 `#4a7828`。
- 系统选单、弹窗和场景切换统一使用 `clock.hold`，禁止修改速度档模拟暂停。
- 游戏内读档必须先返回标题；空存档槽在 hover、hit-test、click 三条路径都禁用。
- 保存成功后才更新内存槽；失败时保留旧档并提示。

## 6. 常用命令

在 `E:/Dragon/web-port` 执行：

```bash
# 静态服务器
python tools/webserver.py 8321

# 解析和语法
python tools/parse_sinario.py
python -m py_compile tools/parse_sinario.py tools/parse_battle.py
node --check web/src/main.js
git diff --check

# 存档/外交
node tools/verify_local_saves.mjs
node tools/verify_single_instance.mjs
node tools/verify_save_transition_guard.mjs
node tools/verify_diplomacy_runtime.mjs
node tools/verify_envoy_budget.mjs

# 战略/战斗 focused suite
node tools/verify_road_graph.mjs
node tools/verify_march_navigation.mjs
node tools/verify_legion_daily.mjs
node tools/verify_engagement_state.mjs
node tools/verify_engage_transition.mjs
node tools/verify_field_terrain.mjs
node tools/verify_autobattle.mjs
node tools/verify_field_result.mjs
node tools/verify_postbattle_fate.mjs
node tools/verify_siege_result.mjs

# 浏览器冒烟必须使用全新 Playwright 会话/profile
playwright-cli open http://127.0.0.1:8321/ --browser=chromium
playwright-cli close
```

提交前必须对变更文件运行 LSP、`lens_diagnostics mode=all`、相关 focused suite 和全新浏览器冒烟。

## 7. 重要坑点

1. 状态段地址不等于文件偏移；例如状态段 `0x2240` 与 SAVE 文件军团表 `0x22C0` 不可混用。
2. `BATTLE.MAP` 目录项为 `[layout, theme]`；实际布局只有0/1/2。只有 `MMAP.MAP` 使用对应 RLE，`MMAP.MCH/MDL` 是原始定长资源。
3. 野战防守方从同坐标候选中选择原版主军，不能合并全部军团或用 synthetic city 替代。
4. `0x291A` 是无法继续行动后的武将去向分派，不等于“撤到最近据点”。
5. 没有真实 `wallRecords` 时，不得用战略比例臆造战术城损。
6. 活动军团主将是 `+2` byte；`+3` 被接敌倒计时/状态复用，禁止当作 u16 主将或独立战斗类型字段。
7. `web/data.json`、TALK 和地图资产必须从解析链修正。TALK 存在 Big5 替换字符，校订必须保留索引与证据。
8. 绘制函数不得修改路线、战斗或计时状态；模态暂停必须走 `clock.hold`。
9. pi-lens 可能格式化文件或保留陈旧诊断；继续编辑前重读，遇到越界行号时重新扫描，不能一概忽略。
10. 工作区可能包含多条未提交主线；禁止整体 `reset/clean`，提交前按功能审查 diff。

## 8. 当前主线状态

### 已稳定并有回归

- 静态章节加载、IndexedDB 四槽存档、浏览器单实例和存档时机守卫。
- 原版道路拓扑、行军、接敌、军团日费/士气、首都补员、战略速算、六队战果和战后处理。
- 外交运行时初始化、方向性关系变化、AI 主动宣战、战略消息队列和外交官预算流程。
- 战略地图四相接战过渡、小地图同步闪动和玩家据点失守提示。

### 当前主线

**原版战术规则兼容模拟器。** `web/src/game/battle/original*.js` 已覆盖原版 RNG、对象池、固定逻辑帧、命令、移动/占用、导航、地图对象、城壁碰撞、伤害、撤退和战果回组。下一关键步骤是使用 DOSBox-X debugger 捕获真实 KI.EXE 逐帧状态，与 `originaldiff.js` 做 ground-truth 动态差分。`simulation.js` 的临时伤害、士气、克制和超时判胜不得作为最终规则来源。

### 次级待办

- 完成外交官 TALK 319..345 按武将说话类型的完整分支，并跑正常日历流程回归。
- 动态验证原版路线平权细节和更多未命名数据字段。
- 解码 YNSOUND ID 3 原始音色；当前仅保证 `+3>1` 阶段的调用时机和次数。
