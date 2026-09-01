# AGENTS.md — 臥龍傳 Web 项目记忆

> 本文件只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线。
> 最近一轮的实现、调试、失败尝试和工作区状态见 `docs/checkpoint-journal.md`；具体二进制证据与公式见 `docs/re-notes-*.md` 和 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据原则

- 目标：不用模拟器，以 **原生 JavaScript ES Modules + Canvas 2D** 重写 1995 DOS《臥龍傳》。无框架、无构建、无 npm 运行时依赖。
- 仓库：`E:/Dragon/web-port`；原版程序与运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/` 是改版剧本库，不能作为官方机制证据。
- 机制结论必须来自 KI.EXE、原始数据或资源，并区分 **实锤 / 推断 / 未知**。新逆向成果应同步到对应 SKILL 或 `re-notes`，不能只留在代码注释或会话中。
- Web 可使用高分辨率、不同布局和近似动画；但表现层不得改变规则帧、RNG、决策、胜负、六队伤亡、士气、城壁、城损、财政或战略状态。
- 原版程序、资源和 DOS 存档只供离线逆向，产品运行时不得依赖 DOS 文件或模拟器。
- 未闭合机制宁可显式报错或保守停住，也不得加入“最近敌城”“随机改投”“百分比拟合外交”“随机战术伤害”等平行替代规则。

## 2. 核心架构

| 路径 | 职责 |
| --- | --- |
| `web/src/boot.js` | 取得浏览器单实例锁后启动应用 |
| `web/src/main.js` | App 装配、新局/读档、战略调度、月结、战术入口和战果回写 |
| `web/src/core/localstore.js` / `singleinstance.js` | IndexedDB 四槽存档与同 origin 单实例 |
| `web/src/game/savegame.js` | JSON 快照、运行态 sidecar、存档时机守卫 |
| `web/src/game/clock.js` | KI 战略子刻度、时刻、日期和五档表现速度 |
| `web/src/game/ai.js` | 据点/军团战略 AI、事件轮、行军、接敌、撤退和战后处理 |
| `web/src/game/economy.js` | 24bit资金、维护费和月度财政 |
| `web/src/game/diplomacy.js` / `ui/gamebar.js` | 外交矩阵、事件候选、预算和原版进言/觐见交互 |
| `web/src/game/roadgraph.js` | 原版192节点、254边道路拓扑与寻径 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算和六队结果 |
| `web/src/game/engagetransition.js` | 战略地图接战表现；不得消费规则RNG |
| `web/src/game/battle/original*.js` | 原版战术规则：RNG、启动、VM、对象池、命令、移动、碰撞、伤害、结算与差分 |
| `web/src/game/battle/battleprojection.js` | 零RNG、只读的Canvas战场DTO组装 |
| `web/src/game/battlewalls.js` | 从权威地图对象生成只读城壁矩形投影 |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术渲染和输入桥接；不另建规则状态 |
| `web/src/ui/gamebar.js` / `hud.js` | 顶栏、军师菜单、Canvas弹窗、战略消息FIFO |
| `tools/parse_*.py` / `tools/export_*.py` | 从原始资源生成Web数据 |
| `tools/verify_*` | focused regression、存档、UI和逆向规则验证 |

## 3. 数据、随机源与存档

- 逻辑分辨率为 `640×400`，战略地图逻辑网格为 `384×256`；浏览器可按视口放大。
- `web/data.json` 由 `tools/parse_sinario.py` 生成，共20章；战场数据由 `tools/parse_battle.py`、`tools/export_battle_rules.py` 等生成。禁止直接修改生成物掩盖解析错误。
- SINARIO 不含运行时军团表；新游戏必须从 `legions=[]` 开始。新局和读档统一经 `main.js::loadState` 装配。
- 游戏规则只使用 canonical `OriginalBattleRng` 字节流。新局重建，读档恢复快照；旧档不得继承上一局随机状态。缺少规则RNG时应报错，不能回退到 `Math.random()`。
- 资金按24bit语义运行，在 `-655000..655000` 饱和；战略兵力常以十人为内部单位，跨层时必须明确单位。
- 正式存档只使用浏览器 IndexedDB `wolong-web/saves`，四槽 JSON。自动化测试禁止读写 `E:/Dragon/Dragon/SAVE.DAT`。
- sidecar 保存军团规则态、48次槽调度延迟回归、战略事件轮、灾害对象、调度游标和RNG。不得另设按月递减的俘虏复活链。
- 战斗、接战过渡或待补日历进位期间禁止快照。保存成功后才更新内存槽；失败必须保留旧档。
- 单实例优先使用 Web Locks `wolong-web-game-instance`，旧浏览器降级为 `localStorage` 心跳；未取得锁不得启动App、RAF或写档。

## 4. 已确认的战略规则

### 4.1 主循环与事件轮

- `0x1D0B`每次主更新依次处理：一个据点槽 → 十六军团槽 → `0x2459` → 日历/时刻。
- `CF2=0..8`，共9次主更新进入下一游戏时刻；`CF3=0..23`后进一天。128军团槽每8次主更新轮完，192据点槽约每日轮完。
- `0x3E11`只在时刻进位时调用，每次轮转一个势力槽。职责固定为：事件泵 → 财政危机门控 → 预备兵维护累计 → 外交官维护；它不是完整目标选择AI。
- 战略事件轮为256个4B槽、4页×64槽。首槽等待7次势力调度，之后每10次消费一槽，空槽也消费；月结前移一页。
- `0x301C`的偏移单位是事件槽，不是天数。type6停战、type7请援延后20槽，出队时才重读外交官并计算结果。
- type1..13的现存处理语义、已证生产者和SAVE尾段解析已统一。type10无KI直接生产者，只兼容DOS SAVE中已有的通用TALK事件。

### 4.2 财政、据点与NPC军事反应

- 财政门控比较 `nCities*8+24` 与 signed `funds>>8`；普通不足清战略目标，严重不足重算势力attr bit6。
- 预备兵维护费为每次势力轮询累计 `floor((骑+弓+步)/32)`，月结扣除后清零，不能按固定周期估算。
- `0x4194/0x4269`属于当前据点槽处理，不能集中为全城批处理；所有相关随机分支消费共享 canonical RNG。
- 有战略目标的势力按城记录四邻原始顺序扫描边境。AI弱城请求由首都选择最高武力待命武将，同值取低索引，按真实三兵种池编成六队并以请求城为目标。
- 玩家空虚边城显示TALK38，并按 `(rng&15)+24` 次本城轮询冷却。
- 驻城委任军团只执行已有相邻目标；占城后结束旧攻击并驻守，不能无证据地继续寻找最近敌城。
- `0x4325`军团状态机、势力`+0x16/+0x17`一次性据点目标槽、状态8/9/10/11及财政bit6门控均以当前SKILL/回归为准。

### 4.3 行军、接敌、速算与战后

- 据点行军使用 `road_graph.json` 原版道路拓扑，不在地图位图上自由A*；绘制函数不得推进路线。
- 提交下一道路点前按军团槽序查敌。接敌初值12并同轮减为11，之后每次该槽调度重检目标，倒计时结束再开战。
- 玩家直属军团进入战术层；NPC-NPC、委任军团和临时城防走战略速算。委任不能覆盖尚未完成的玩家命令。
- 战略速算按六队交错消费12个RNG字节，平手攻方胜；伤亡、士气和城损公式见 `re-battle-command` SKILL。
- 军团每日维护只在 `CF3==1` 且该槽被扫描时发生：道路边费用高且不恢复士气；节点费用低并恢复士气。首都低兵力补员先于同槽维护费。
- 战败撤退最终目标是本势力首都，路线只能经过己方据点；48表示军团槽被调度48次，不是48天。
- 破城顺序固定为：据点易主 → 寻新首都 → 处理同城守军组 → 无新首都时灭亡。
- `0x4FCE`按武将索引扫描：有`+0x1D`原属记录则恢复仍活跃原属；非君主且`+0x17!=0`则解散军团并流散；其余进入`0x29C3`被俘/退场。该扫描不额外消费RNG。

### 4.4 外交

- 外交矩阵有方向；普通变化只改单向，宣战/停战调用点才显式同步双方。raw `<0x80`表示交战。
- 新游戏显示地图前执行一次`0x2BD9`，月结再次生成关系/事件候选；读档不得重复开局初始化。
- 宣战/谈判通过战略消息FIFO显示，最后一条对白关闭后才提交状态；`onClose`必须once，避免右键和自动关闭重复执行。
- 外交/内政预算只在玩家批准后扣款；type4请求额不得在月结预扣。批准额按 `floor(grant/128)` 写武将预算字节。
- 已删除无证的随机进言、百分比外交和隐藏DOM旁路；正式入口统一走GameBar的原版提案/事件流程。

## 5. 已确认的战术规则与表现边界

- 权威战术状态只有 `OriginalBattleSession`。旧随机伤害/克制/超时判胜模拟器已删除，产品不能静默回退到近似规则。
- 战斗启动先执行 `A1C5`：所有模式固定50个A065预帧；mode1再执行已闭合的A2E8/A34F评分、RNG、等待、单挑和脚本跳过分支。
- 战斗主循环每个固定帧严格为：**就绪玩家输入/按钮 → BATTLE.DAT VM `A426` → 同一Session的战术帧 `A065`**。A426是全战斗持续脚本，不是可跳过开场动画。
- A065内部顺序为结束判定 → 双方对象命令 → 效果对象 → ADC8后处理；ADC8按固定地址顺序处理撤退、路径、移动、占用、补员/退出和活动计数。
- 双方各6组、每组8个对象槽；对象池、临时六队记录、地图对象、路径队列、RNG、VM和寄存器均可快照。
- 玩家守方时交换D2E/D30，使对象0侧始终为玩家军团、对象1侧为对手；D35 bit6是地图镜像，bit7是玩家攻守态。
- 城壁、碰撞、伤害、撤退、六队幸存、士气和城损只由Session规则状态决定。Canvas城壁和单位DTO只读投影，不得回写规则。
- `battleprojection.js`可以采用高分辨率和近似动画，但必须零RNG、零规则推进。空白战场点击不得创建任意坐标移动命令。
- 战术速度只能改变墙钟推进速度，不得改变固定帧顺序、每帧调用次数或RNG消费顺序。

## 6. 稳定交互约定

- 不增加关闭按钮；弹窗和二级界面统一右键逐层回退。
- 羽扇是军师一级菜单唯一开关；关闭时清理所有子窗口、选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白左键无功能，也不关闭界面。
- NPC/武将消息3秒自动关闭或右键立即关闭，关闭后回调只执行一次。
- Canvas列表滚动条在右侧，选中行使用 `#4a7828`。
- 模态、系统选单和场景切换统一使用 `clock.hold`；不得通过改速度档模拟暂停。
- 游戏内读档必须先返回标题；空槽在hover、hit-test、click三条路径都禁用。

## 7. 常用命令

在 `E:/Dragon/web-port` 执行：

```bash
# 生成资源
python tools/parse_sinario.py
python tools/parse_battle.py
python tools/export_battle_rules.py

# 全部 focused regression
for f in tools/verify_*.mjs; do node "$f" || exit 1; done
for f in tools/verify_*.py; do python "$f" || exit 1; done
node tools/verify_battle_viewport.js
node tools/verify_clock_pause.js

# 语法与diff
python -m py_compile tools/parse_sinario.py tools/parse_battle.py tools/export_battle_rules.py
node --check web/src/main.js
git diff --check

# 全新浏览器冒烟
python tools/webserver.py 8321
playwright-cli -s=dragon-fresh open http://127.0.0.1:8321/ --browser=chrome
playwright-cli -s=dragon-fresh console
playwright-cli -s=dragon-fresh close
```

提交前还必须对变更文件运行LSP、`lens_diagnostics mode=all`，并使用全新Playwright会话避免ESM缓存造成假回归。

## 8. 重要坑点

1. 状态段地址不等于文件偏移，例如军团表状态地址`0x2240`与SAVE文件偏移`0x22C0`不能混用。
2. `BATTLE.MAP`目录项是`[layout, theme]`；实际layout只有0/1/2。`MMAP.MAP`、`MMAP.MCH/MDL`和战术资源职责不同。
3. 活动军团主将是`+2` byte；`+3`被接敌倒计时/状态复用，不能当作u16主将或战型。
4. CBE5脚本块读取对手武将`general[+0x16]`，不是军团UI formation字段。
5. 野战主守方按原版候选选择，不能合并同坐标所有军团或用synthetic city代替。
6. `0x291A`是不能继续行动后的武将去向分派，不等于“退到最近据点”。
7. 没有真实地图对象/墙记录时，不得按战略比例臆造战术城损。
8. `web/data.json`、TALK和地图资源必须从解析链修正；Big5校订要保留索引和证据。
9. 渲染函数不得修改路线、战斗、队列、RNG或日历；表现辅助不得调用规则随机源。
10. 工作区可能含多条未提交主线；禁止整体`reset/clean`，先按功能审查diff并保留用户改动。

## 9. 当前主线状态

- NPC势力级战略调度、事件轮、边境军事反应、外交事件、道路接敌、战略速算、撤退、破城和灭亡链已闭合到现有KI.EXE/原始数据静态证据。
- 战术A1C5启动、持续`输入→A426→A065`、六队对象/命令/移动/碰撞/伤害/撤退/结算链已落地；随机平行战术、外交和进言系统已删除。
- 当前没有已知阻塞性的AI/玩法规则缺口。主线进入 **维护、证据增强和新证据驱动的勘误** 阶段。
- 非阻塞增强项：DOSBox-X逐帧捕获与`originaldiff.js`比对；YNSOUND双YM3812寄存器序列和可听音色验证；外部INT61驱动对应的五档绝对毫秒测量。
