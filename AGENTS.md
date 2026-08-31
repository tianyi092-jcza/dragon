# AGENTS.md — 臥龍傳 Web 复刻项目记忆

> 本文件只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线状态。
> 本轮详细进展、调试过程和失败尝试见 `docs/checkpoint-journal.md`；二进制证据见 `docs/re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 1. 项目边界

- 目标：不用模拟器，以 **原生 JavaScript ES Modules + Canvas 2D** 重写 1995 DOS《臥龍傳》。
- 无框架、无构建、无 npm 运行时依赖；产品由静态服务器直接运行。
- 仓库：`E:/Dragon/web-port`；原版程序与运行数据：`E:/Dragon/Dragon/`。
- 官方剧本基准：`E:/Dragon/原版/`；`上/中/下/后/` 是改版剧本库。
- 机制必须依据 KI.EXE、原始数据和资源逆向；文档与代码必须区分**实锤、推断、未知**。表现可以不同，但胜负、六队伤亡、士气、城壁和据点城损必须遵循原版规则。
- 原版程序、资源及 DOS 存档只用于离线逆向，不得成为部署时运行依赖。

## 2. 数据与运行时边界

- 逻辑分辨率 `640×400`；战略画布 `#cv`，标题/开局画布 `#startv`。战略地图逻辑网格 `384×256`。
- `web/data.json` 由 `tools/parse_sinario.py` 从五组剧本生成，共20章。修改解析器后必须重新生成；禁止直接改 JSON 掩盖解析或运行时错误。
- 新游戏 clone 静态 `data.json` 模板并清空军团及运行时队列；读档保留军团、事件队列和 `save_date`。两者统一经 `main.js::loadState` 装配。
- SINARIO 不含运行时军团表，新游戏必须以 `legions=[]` 开始；`buildArmies` 只归一化已有军团，不能合成占位军团。
- 每次装载都重建 canonical RNG；有快照时先恢复，旧档无快照时不得继承上一局随机流。
- 正式存档只使用浏览器 IndexedDB：数据库 `wolong-web`、对象仓 `saves`、四槽纯 JSON 快照。自动化测试使用 mock IndexedDB 或独立浏览器 profile，禁止读写 `E:/Dragon/Dragon/SAVE.DAT`。
- 同 origin 单实例首选 Web Locks（`wolong-web-game-instance`），旧浏览器降级为 `localStorage` 心跳。未取得锁的页面不得初始化 App、RAF 或写存档。
- 资金原始字段为24bit：`word@+0x20 + byte@+0x22 << 16`。兵力数据常以十人为单位；跨战略、战术和 UI 转换时必须明确单位。

## 3. 当前架构

| 路径 | 职责 |
| --- | --- |
| `web/src/boot.js` | 取得浏览器单实例锁后动态加载应用 |
| `web/src/main.js` | App 装配、主循环、新局/读档、月结、战术层入口与战果回写 |
| `web/src/core/localstore.js` | IndexedDB 四槽持久化 |
| `web/src/core/singleinstance.js` | Web Locks 单实例与 localStorage 降级 |
| `web/src/game/savegame.js` | 纯 JSON 快照、恢复和存档时机守卫 |
| `web/src/game/ai.js` | 战略调度、移动、接敌、事件延迟、AI 战争及战后处理 |
| `web/src/game/diplomacy.js` | 外交矩阵、开局/月度变化、宣战候选、外交官预算事件 |
| `web/src/game/economy.js` | 常规月度财政；外交费只在 type-5 对话批准时扣除 |
| `web/src/game/roadgraph.js` | 原版192节点/254边道路拓扑和加权寻径 |
| `web/src/game/autobattle.js` | 原版战略野战/攻城速算与城损纯函数 |
| `web/src/game/legionmode.js` / `engagetransition.js` | 委任权威和战略地图四相战斗过渡 |
| `web/src/game/battle/original*.js` | 原版战术 RNG、对象池、命令、移动、导航、寻路、碰撞、结果和差分工具 |
| `web/src/render/mapview.js` / `battleview.js` | 战略与战术表现层；不得推进规则状态 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、Canvas 弹窗、觐见、战略消息 FIFO 和地图锁定 |
| `web/src/ui/hud.js` | 据点/人事等子界面和外交官任免 |
| `web/src/game/clock.js` / `core/modalclock.js` | 战略速度及模态 `clock.hold` |
| `tools/parse_*.py` | 原版数据解析和 Web 资产生成 |
| `tools/verify_*` | Node/Python/Playwright 定向回归 |

## 4. 已确认的核心规则

### 4.1 战略军团与战斗

- 据点目标使用 `road_graph.json` 的原版道路拓扑，不在地图 bitmap 上自由 A*。
- 军团沿道路点列移动；到边端当轮停止，下轮再选边。渲染只能读取路线状态。
- 接敌采用 `11→1` 倒计时并在每轮重检城主、外交和目标；玩家直属军团进战术层，AI 或委任军团走战略速算。
- 委任权威是 legion status bit2；玩家已下达目标优先，委任不能覆盖未完成命令。
- 战果按六队和士气回写；战后继续、撤退、武将去向、48周期回归和破城组撤退已接入原版链。细节见相关 SKILL 和 re-notes。
- 军团途中道路上下文由原版 `+0x0A/+0x0C/+0x0E` 转为 Web `edgeId/pointIndex`；取消目标必须清理道路上下文和有效位。
- 原版军团固定六队。旧对象只有总兵时，`legionunits.js` 使用项目兼容默认类型 `[1,1,3,3,2,2]` 补全；这是 Web 兼容策略，不是已确认 KI.EXE 自动编成规则。

### 4.2 外交与外交官

- SINARIO 外交矩阵只是静态初值。新游戏选定玩家后、首次显示地图前执行 `0x1B29→0x2BD9`；月结经 `0x5358→0x5394→0x2BD9` 再执行。读档禁止重复开局初始化。
- 关系档位使用低7位；raw `<0x80` 为交战。`0x30D3/0x30F0` 只修改指定方向，宣战/停战调用点才显式同步双方。
- AI 主动宣战门控在 `0x2EFB`，不是 `0x2D3A`；type-1 事件延迟日调度后执行。
- 外交官预算耗尽时，月结 `0x578F` 生成 type-5 事件；事件计数器初值7，通常在下月7日报告。
- 建议额取双方较低关系：和平 `(100-value)×200`，交战 `(125-value)×200`。
- 批准额在对话结束时一次性扣款，并转为工作预算 `floor(grant/128)`；数字输入上限30000，非零最低500。外交费不得提前计入常规月支出。
- `0x3E8E` 只有预算非零才工作：第一随机门控通过后消耗 `23-politics`，第二门控 `(rng&0x0F)<=politics` 成功时关系单向 `+1`，必要时反向关系追赶 `+1`。政治影响预算持续时间和成功率，不改变单次增量。

## 5. 稳定交互约定

- 全游戏不增加关闭按钮；弹窗和二级界面统一右键逐层回退。
- 羽扇是军师一级菜单唯一开关。关闭父菜单必须清理所有子孙窗口、选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白处左键无功能，不关闭任何界面。
- NPC/武将通用消息3秒自动关闭或右键立即关闭；连续战略消息进入 FIFO，不得覆盖。
- Canvas 列表滚动条在右侧，选中行颜色 `#4a7828`。
- 系统选单、弹窗和场景切换统一用 `clock.hold`，禁止通过修改速度档模拟暂停。
- 游戏内读档先返回标题再装载，禁止热替换当前 scenario。
- 标题空存档槽在 hover、hit-test、click 三条路径都必须禁用。
- 保存写入成功后才更新内存槽；失败时保留旧档并提示。

## 6. 常用命令

在 `E:/Dragon/web-port` 执行：

```bash
python tools/webserver.py 8321
# http://127.0.0.1:8321/

# 基础检查
node --check web/src/main.js
python -m py_compile tools/parse_sinario.py tools/parse_battle.py
node tools/verify_local_saves.mjs
node tools/verify_single_instance.mjs
node tools/verify_save_transition_guard.mjs
node tools/verify_diplomacy_runtime.mjs
node tools/verify_envoy_budget.mjs
git diff --check

# 战略/战斗 focused suite
node tools/verify_road_graph.mjs
node tools/verify_march_navigation.mjs
node tools/verify_engagement_state.mjs
node tools/verify_field_terrain.mjs
node tools/verify_autobattle.mjs
node tools/verify_field_result.mjs
node tools/verify_postbattle_fate.mjs
node tools/verify_siege_result.mjs

# 浏览器冒烟：必须使用全新会话
playwright-cli open http://127.0.0.1:8321/ --browser=chromium
playwright-cli run-code --filename=tools/verify_single_instance_ui.js
playwright-cli run-code --filename=tools/verify_system_menu.js
playwright-cli run-code --filename=tools/verify_clock_pause.js
playwright-cli close
```

提交前还要对变更文件运行 LSP 与 `lens_diagnostics mode=all`。

## 7. 重要坑点

1. 状态段地址不等于文件偏移；例如状态段 `0x2240` 与 SAVE 文件军团表 `0x22C0` 不可混用。
2. `BATTLE.MAP` 目录项是 `[layout, theme]`；布局从 `0x200 + layout×256` 指向4096字节数据，实际布局只有0/1/2。
3. 只有 `MMAP.MAP` 使用对应 RLE；`MMAP.MCH/MDL` 是原始定长资源。
4. 野战防守方从同坐标候选中选最强主军，不合并全部军团，也不能用 synthetic city 代替。
5. `0x291A` 是无法继续行动后的武将去向分派，不是“退到最近据点”。
6. 没有真实 `wallRecords` 时，不得用 `defLeft` 或战略比例臆造战术城损。
7. 活动军团主将是 `+2` byte；`+3` 的 bit5 被接敌倒计时复用，禁止当 u16 解析。原版无独立 field/siege 字节。
8. `web/data.json`、TALK 和地图资产都必须由解析链修正；禁止直接改生成物掩盖源数据问题。TALK 当前存在标准 Big5 解码替换字符，校订文本必须保留索引和证据。
9. pi-lens 可能在回合后格式化文件；继续编辑前重读相关文件。若 LSP 行号超过 EOF，先以 `node --check` 和重新扫描确认是否为缓存诊断，不能直接忽略真实错误。
10. 工作区经常包含多条未提交主线；禁止整体 `reset/clean`，提交前按功能审查 diff。

## 8. 当前主线状态

### 已稳定并有回归

- 静态章节加载、IndexedDB 四槽存档、浏览器单实例和存档时机守卫。
- 原版道路拓扑、行军、接敌、野战/攻城战略速算、六队战果、士气和战后处理。
- 新游戏运行时外交初始化、方向性关系变化、AI 主动宣战和底部战略消息队列。
- 外交官预算申请公式、7日事件延迟、批准额预算换算、政治力消耗/成功门控及存档字段。

### 当前主线

**原版战术规则兼容模拟器。** `web/src/game/battle/original*.js` 已覆盖原版 RNG、对象池、固定逻辑帧、命令、移动/占用、导航/寻路、地图对象、城壁碰撞、伤害、撤退和战果回组；Canvas 已接管原版 Session。当前关键缺口是使用 DOSBox-X debugger 捕获真实 KI.EXE 逐帧状态，与 `originaldiff.js` 做 ground-truth 动态差分。`simulation.js` 的临时伤害、士气、克制和超时判胜不得作为最终规则来源。

### 次级待办

- 完成外交官 TALK 319..345 按武将说话类型的完整分支，并做正常日历流程实机回归。
- 用更多章节验证尚未命名的势力/武将产品字段。
- 原版路线平权动态比对、YNSOUND ID3 音色解码。
