# AGENTS.md — 臥龍傳 Web 复刻项目记忆

> 只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线。
> 最近一轮的调查、修改、失败修正和工作区状态见 `docs/checkpoint-journal.md`；二进制证据和公式见 `docs/re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据原则

- 目标：不用模拟器，以 **原生 JavaScript ES Modules + Canvas 2D** 重写 1995 DOS《臥龍傳》；无框架、无构建、无 npm 运行时依赖。
- 仓库：`E:/Dragon/web-port`；原版程序/运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/` 是改版剧本库，不得当作官方机制证据。
- 机制必须来自 KI.EXE、原始数据或资源；文档和代码必须区分 **实锤 / 推断 / 未知**。新结论要同步回流到对应 SKILL 或 `re-notes`。
- 表现可不同，但胜负、六队伤亡、士气、城壁、城损、财政和战略状态必须按原版规则。
- 原版程序、资源和 DOS 存档只供离线逆向，不能成为 Web 产品运行依赖。

## 2. 数据、运行时与存档

- 逻辑分辨率 `640×400`；战略地图逻辑网格 `384×256`。
- `web/data.json` 由 `tools/parse_sinario.py` 生成，共20章；禁止直接编辑生成物掩盖解析错误。
- SINARIO 不含运行时军团表；新游戏必须从 `legions=[]` 开始。读档保留军团、日期、事件队列、调度游标和 canonical RNG 快照。
- 新局与读档统一经 `main.js::loadState` 装配。每次装载重建 canonical RNG；有快照则恢复，旧档不得继承上一局随机流。
- 资金使用24bit语义，运行值在 `-655000..655000` 饱和；战略兵力常以十人为内部单位，跨层时必须注明单位。
- 正式存档只使用浏览器 IndexedDB：`wolong-web/saves`，四槽 JSON。自动化测试禁止读写 `E:/Dragon/Dragon/SAVE.DAT`。
- 同 origin 单实例优先使用 Web Locks `wolong-web-game-instance`，旧浏览器降级为 `localStorage` 心跳；未取得锁不得启动 App、RAF 或写档。
- 战斗/过渡或待补日历进位时禁止快照。运行态 sidecar 必须保存军团规则态、延迟回归、事件队列、RNG 与战略调度游标。

## 3. 核心架构

| 路径 | 职责 |
| --- | --- |
| `web/src/boot.js` | 取得单实例锁后启动应用 |
| `web/src/main.js` | App 装配、新局/读档、战略调度、月结、战术入口和战果回写 |
| `web/src/core/localstore.js` / `singleinstance.js` | IndexedDB 持久化与浏览器单实例 |
| `web/src/game/savegame.js` | JSON 快照、Web 运行态恢复、存档时机守卫 |
| `web/src/game/clock.js` | KI 战略子刻度/时刻/日期与五档表现速度 |
| `web/src/game/ai.js` | 据点/军团战略 AI、行军、接敌、速算入口、撤退和战后处理 |
| `web/src/game/economy.js` | 资金 helper、军团维护费和月度财政 |
| `web/src/game/diplomacy.js` / `audience.js` | 外交矩阵、事件候选、预算和觐见结果 |
| `web/src/game/roadgraph.js` | 原版192节点、254边道路拓扑与寻径 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算和城损纯规则 |
| `web/src/game/engagetransition.js` | 战略地图四相接战表现过渡 |
| `web/src/game/battle/original*.js` | 原版战术模拟器：RNG、对象池、命令、移动、碰撞、伤害和差分 |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术渲染；不得推进规则状态 |
| `web/src/ui/gamebar.js` / `hud.js` | 顶栏、军师菜单、Canvas 弹窗、战略消息 FIFO |
| `tools/parse_*.py` / `tools/verify_*` | 原版数据生成、逆向辅助与 focused regression |

## 4. 已确认的长期规则

### 4.1 战略调度

- KI 主更新顺序：`0x1D0B` 每次执行 `0x3EFD` 一个据点槽 → `0x25A3` 十六军团槽 → `0x2459` → `0x1D8E`。
- `CF2=0..8`：从0起共9次主更新进入下一游戏时刻；`CF3=0..23` 后进一天。
- `0x3E11` 只在 `CF2>=8` 的时刻进位分支 `0x1DEC` 调用，每次轮转一个势力槽；不是每主更新或每日一次。
- 128军团槽每8次主更新轮完；192据点槽约每日轮完。`0x4194/0x4269` 是当前据点槽的成长处理，必须与该城轮询同轮，不能集中全城批处理。
- 战略速度只缩放墙钟，不得改变槽扫描、RNG 或规则执行次数。精确原版毫秒值仍未知。

### 4.2 NPC 战略军事反应

已落实的是 **边境军事反应闭环**，不是完整势力自主经营 AI：

- 有战略目标的势力按 `city.raw[0x1C..0x1F]` 四邻顺序扫描边境。
- 玩家空虚边城显示 TALK38，并按 `(rng&15)+24` 次本城轮询冷却。
- AI 空虚/弱势边城走 `0x4575→0x45C1→0x6E8F`：在首都选择最高武力待命武将（同值低索引），按六队候选兵种和真实骑/弓/步兵池编成，再以请求城为目标。
- 邻城威胁候选贡献“运行态强度+1”；完整 `city[+0x18]` 产品语义仍未命名，Web 的驻军数量映射属于明确推断。
- 驻城委任军团只执行已闭合的相邻目标指令；占城后结束旧攻击并驻守，禁止无证据地自动寻找最近敌城连续进攻。
- 尚未完整还原：势力目标选择/改换的全部规则、全套财政与内政 AI、多战线兵力分配、全部战略事件响应，以及战术战场六队逐帧 AI。

### 4.3 行军、接敌与战斗

- 据点行军使用 `road_graph.json` 原版道路拓扑，不在 bitmap 上自由 A*；渲染不得修改路线。
- 提交下一道路点前按军团槽序查敌。异势力接触后原地停止，接敌状态从12同轮减为11；约11次该槽调度后开战，并且每轮重检目标。
- 玩家直属军团进入战术层；NPC-NPC 和委任军团走战略速算；临时城防固定速算。委任不能覆盖未完成的玩家命令。
- 原版战略速算按六队交错消费12次 RNG；平手攻方胜。伤亡、士气和城损公式以 `re-battle-command` SKILL 为准。
- 每个活动军团在 `CF3==1` 且其槽被扫描时结算：
  - 道路边：军费 `floor(troops/2)+floor(troops/4)`，不恢复士气；
  - 节点：军费 `floor(troops/32)+1`，士气 `+10`，封顶势力 `+0x1D`。
- 总兵低于600且实际位于本势力首都时，按槽序用真实兵池补至每队最多100；补员先于同槽维护费。
- 小地图只闪实际接敌/攻城位置，普通目标不得响/闪。YNSOUND ID3 调用时机和记录链已闭合，声卡芯片/PCM与原始音色仍未知。

### 4.4 战后与灭亡

- 胜方结束旧攻击命令。败方士气为0或第一队为0时进入 `0x291A`；否则按规则继续或撤退。
- 战败撤退以本势力首都为最终目标；边内按原版端点优先级选择，后续路线只能经过己方据点，不能穿过敌城。
- 48表示该军团槽被调度48次，约42.7游戏小时，不是48天。
- 破城顺序：据点易主 → `0x4DF0` 寻新首都 → `0x4DA4` 处理同城守军组 → 无新首都时 `0x4FCE` 灭亡。
- 最后一城失陷同轮失活、显示通用 NPC TALK36并清理其它势力目标，不等月结。
- `0x4FCE` 已确认按武将索引0..126扫描，但自尽/俘获/流散的完整分支条件尚未闭合；不得用近似规则改写武将或额外消费 RNG。

### 4.5 外交与宣战

- 外交矩阵是有方向的；普通变化只改指定方向，宣战/停战调用点才显式同步双方。raw `<0x80` 表示交战。
- 新游戏首次显示地图前执行 `0x2BD9` 初始化；月结再次执行关系/事件候选；读档不得重复开局初始化。
- AI→玩家宣战：TALK63 通用报告 → AI君主 TALK478..480；第二条关闭后才提交目标与敌对状态。
- 玩家主动宣战：玩家君主 TALK486..488；对白关闭后才提交敌对状态。
- 战略消息使用 FIFO；显示期间 `clock.hold`，最后一条关闭才恢复。
- 外交官预算批准时扣款并换算 `floor(grant/128)`；非零输入最低500、上限30000。政治影响预算消耗和成功概率，不改变单次关系增量。

## 5. 稳定交互约定

- 不增加关闭按钮；弹窗和二级界面统一右键逐层回退。
- 羽扇是军师一级菜单唯一开关；关闭时清理所有子窗口/选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白左键无功能，不关闭界面。
- NPC/武将通用消息3秒自动关闭或右键关闭，关闭后立即执行一次回调。
- Canvas 列表滚动条在右侧，选中行颜色 `#4a7828`。
- 模态、系统选单和场景切换统一使用 `clock.hold`，禁止改速度档模拟暂停。
- 游戏内读档必须先返回标题；空槽在 hover、hit-test、click 三条路径都禁用。
- 保存成功后才更新内存槽；失败保留旧档并提示。

## 6. 常用命令

在 `E:/Dragon/web-port` 执行：

```bash
# 静态服务器与浏览器冒烟
python tools/webserver.py 8321
playwright-cli open http://127.0.0.1:8321/ --browser=chromium
playwright-cli close

# 生成、语法和diff
python tools/parse_sinario.py
python -m py_compile tools/parse_sinario.py tools/parse_battle.py
node --check web/src/main.js
git diff --check

# 存档、UI、外交
node tools/verify_local_saves.mjs
node tools/verify_single_instance.mjs
node tools/verify_save_transition_guard.mjs
node tools/verify_advisor_delegation_ui.mjs
node tools/verify_diplomacy_runtime.mjs
node tools/verify_envoy_budget.mjs

# 战略AI、行军与战斗
node tools/verify_clock_transition.mjs
node tools/verify_strategic_city_ai.mjs
node tools/verify_new_game_initialization.mjs
node tools/verify_legion_daily.mjs
node tools/verify_road_graph.mjs
node tools/verify_march_navigation.mjs
node tools/verify_engagement_state.mjs
node tools/verify_engage_transition.mjs
node tools/verify_delegated_autobattle.mjs
node tools/verify_field_result.mjs
node tools/verify_postbattle_fate.mjs
node tools/verify_siege_result.mjs
```

提交前：对变更文件运行 LSP、`lens_diagnostics mode=all`、相关 focused suite、`git diff --check`，并用全新 Playwright 会话冒烟，避免 ESM 缓存假回归。

## 7. 重要坑点

1. 状态段地址不等于文件偏移；例如状态段军团表 `0x2240` 与 SAVE 文件偏移 `0x22C0` 不可混用。
2. `BATTLE.MAP` 目录项是 `[layout, theme]`；实际布局只有0/1/2。`MMAP.MAP` 使用对应 RLE，`MMAP.MCH/MDL` 是原始定长资源。
3. 活动军团主将是 `+2` byte；`+3` 被接敌倒计时/状态复用，禁止当作 u16 主将或独立战型。
4. 野战主守方按原版候选选择，不能合并同坐标所有军团或用 synthetic city 代替。
5. `0x291A` 是不能继续行动后的武将去向分派，不等于“退到最近据点”。
6. 没有真实 `wallRecords` 时，不得用战略比例臆造战术城损。
7. `web/data.json`、TALK和地图资产必须从解析链修正；TALK 的 Big5 替换字符校订要保留索引与证据。
8. 绘制函数不得修改路线、战斗、队列或日历；暂停统一走 `clock.hold`。
9. 工作区可能同时含多条未提交主线；禁止整体 `reset/clean`，先按功能审查 diff。
10. 逆向结论未闭合时宁可保守停住，也不得加入“最近敌城”“随机流散”等看似合理的替代 AI。

## 8. 当前主线状态

### 已稳定并有 focused regression

- 新局无初始军团、IndexedDB四槽存档、单实例与过渡期存档守卫。
- KI战略时钟分层、单城/16军团槽轮询、道路行军、接敌、每日维护、首都补员。
- NPC边境威胁→首都编成→增援/出击→接敌→速算→占城/撤退的军事反应闭环。
- 双阶段宣战、战略消息 FIFO、外交官预算和方向性关系变化。
- 六队战略速算、战后首都方向撤退、破城守军组和即时灭亡通知。

### 当前主线

**继续闭合原版 NPC 势力级自主 AI，同时保持战术模拟器动态差分。**

NPC军事反应闭环已落实，但完整目标选择、财政/内政、多战线调动、全部事件响应和战术战场逐帧 AI 尚未完成。战术侧下一关键证据仍是使用 DOSBox-X debugger 捕获 KI.EXE 真实逐帧状态，与 `web/src/game/battle/originaldiff.js` 对比；`simulation.js` 的临时伤害、士气、克制和超时判胜不得作为最终规则来源。

### 长期未闭合

- `0x3E11` 除已确认外交维护外的完整势力级决策分支。
- `city[+0x18]` 强度字段和 `0x4325` 状态8/10的完整产品语义。
- `0x4FCE` 灭亡武将三分支的精确条件。
- 战略事件 type2/4/6/7/8/9/10 的完整语义。
- YNSOUND ID3 原始芯片/PCM音色。
- 原版战略五档的精确墙钟毫秒值。
