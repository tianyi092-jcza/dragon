# AGENTS.md — 臥龍傳 Web 项目记忆

> 本文件只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线。
> 本轮详细进展、调试过程、失败尝试、相关文件、阻塞和下一步见 `docs/checkpoint-journal.md`。
> 逆向证据与公式见 `docs/re-notes-*.md` 和 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据原则

- 目标：不用模拟器，以 **原生 JavaScript ES Modules + Canvas 2D** 重写 1995 DOS《臥龍傳》；无框架、无构建、无 npm 运行时依赖。
- 仓库：`E:/Dragon/web-port`；原版程序与运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/` 是改版库，不能作为官方机制证据。
- 机制结论必须来自 KI.EXE、原始数据或资源，并标明 **实锤 / 推断 / 未知**。新发现要同步到对应 SKILL 或 `re-notes`，不能只留在代码注释或会话中。
- Web 可以改变布局和动画表现；表现层不得改变规则帧、RNG、决策、胜负、六队伤亡、士气、城壁、城损、财政或战略状态。
- 产品运行时不得依赖 DOS 文件、`SAVE.DAT` 或模拟器。未闭合机制应保守停住或明确报错，不能加入无证据的平行规则。

## 2. 核心架构

| 路径 | 职责 |
| --- | --- |
| `web/src/boot.js` | 浏览器单实例锁与应用启动 |
| `web/src/main.js` | App装配、新局/读档、战略调度、月结、战术入口和战果回写 |
| `web/src/core/localstore.js` / `singleinstance.js` | IndexedDB四槽存档与同origin单实例 |
| `web/src/game/savegame.js` | JSON快照、运行态sidecar和保存守卫 |
| `web/src/game/clock.js` | KI战略子刻度、日期和五档表现速度 |
| `web/src/game/ai.js` | 据点/军团AI、事件轮、行军、接敌、撤退、破城和战后处理 |
| `web/src/game/roadgraph.js` | 原版192节点、254边道路拓扑与寻径 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算和六队结果 |
| `web/src/game/engagetransition.js` | 战略接战表现；不消费规则RNG |
| `web/src/game/battle/original*.js` | 原版战术RNG、VM、对象池、命令、移动、碰撞、伤害和结算 |
| `web/src/game/battle/battleprojection.js` | 零RNG、只读Canvas战场DTO |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术渲染与输入桥接；不得建立权威规则状态 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、Canvas列表/弹窗和战略消息FIFO |
| `web/src/ui/hud.js` | 地图HUD、即时操作反馈和据点命令 |
| `tools/parse_*.py` / `tools/export_*.py` | 从原始资源生成Web数据 |
| `tools/verify_*` | focused regression、存档、UI和逆向规则验证 |

## 3. 数据、随机源与存档

- 逻辑分辨率为 `640×400`；战略地图逻辑网格为 `384×256`，浏览器只负责视口缩放。
- `web/data.json` 由 `tools/parse_sinario.py` 生成，共20章；战场数据同样由解析/导出脚本生成。生成物错误应从解析链修复。
- SINARIO不含运行时军团表；新游戏从 `legions=[]` 开始。新局和读档统一经 `main.js::loadState` 装配。
- 游戏规则只使用 canonical `OriginalBattleRng` 字节流。新局重建、读档恢复快照；不得回退到 `Math.random()`。
- 正式存档只使用 IndexedDB `wolong-web/saves` 四槽JSON。自动化测试禁止读写 `E:/Dragon/Dragon/SAVE.DAT`。
- sidecar保存军团规则态、48槽调度回归、战略事件轮、灾害、调度游标和RNG。战斗、接战过渡或待补日历进位期间禁止快照。
- 游戏内读档必须先返回标题；空槽在hover、hit-test、click三条路径都禁用。
- 单实例优先使用 Web Locks `wolong-web-game-instance`，旧浏览器降级为 `localStorage` 心跳；未取得锁不得启动App、RAF或写档。

## 4. 稳定战略规则

- `0x1D0B`每次主更新依次处理一个据点槽、十六军团槽、`0x2459`和日历/时刻。军团道路推进由槽轮询驱动，不绑定每日刷新。
- `CF2=0..8`，9次主更新进下一时刻；`CF3=0..23`后进一天。地图渲染只能读取导航状态，不能推进或改写路线。
- 战略事件轮为256个4B槽、4页×64槽；首槽等待7次势力调度，之后每10次消费一槽，空槽也消费；月结前移一页。
- 据点行军使用 `road_graph.json`。军团标识按16×16逻辑格中心插值，不叠加地图tile图案的视觉质心偏移。
- 接敌初值12并同轮减为11；之后每次该军团槽调度重新确认目标。
- 玩家直属军团进入战术层；NPC-NPC、委任军团和临时城防走战略速算。委任只改变后续自主和战斗控制，不能覆盖未完成的玩家命令。
- 无目标驻军不会因相邻敌军自行出城；新目标只由据点AI或 `0x4325` 状态机写入。每次据点轮询最多向一支合格委任军团写入出击目标。
- 下一道路点若是有敌军团的据点中心，`0x2831`军团接敌优先于`0x2880`据点攻城；只有没有军团占位时才进入据点攻城。
- `0x5130`严格读取六队原值；`+4`总兵暂时不一致时不得重建或均分六队。`0x4C72`主军评分同值取低军团槽；`0x52D7`武将能力读取军团`+2`主将索引。
- `generalIdx`是Web军团的权威主将索引；`leader`只用于显示和旧快照兼容，运行期军团slot不能冒充武将索引。
- 战败撤退以本势力首都为搜索目标。`0x491B`对非己城市增加高代价但仍展开；`0x487B`只要求即时第一跳属己。48表示军团槽被调度48次，不是48天。
- 破城顺序：据点易主 → 寻新首都 → 处理同城守军组 → 无新首都时灭亡。

## 5. 消息、战术与表现边界

- 正式战略规则消息统一进入 `GameBar` FIFO：显示期间 `clock.hold`，3秒或右键关闭，回调once，高优先级模态/战术层期间延后。
- 有实锤TALK索引的消息使用 `enqueueTalkMessage()`；TALK占位符和个性对白由 `talk.js`处理。硬编码文本不得冒充原版TALK。
- 宣战、谈判、迁都、亲征等状态必须在原版规定的最终对白关闭边界提交；战果规则消息不得经 `hud.flashEvent()` 旁路。
- 权威战术状态只有 `OriginalBattleSession`。每个固定帧顺序为：**就绪输入/按钮 → BATTLE.DAT VM `A426` → 战术帧 `A065`**。
- 战术速度只改变墙钟推进速度，不得改变固定帧、调用次数或RNG消费顺序。Canvas只读投影规则状态。
- 委任接战四相动画是Web表现同步：预载图像和 `web/grf/sfx/ynsound-id3.wav`，按0→1→2→3逐相播放；不得消费规则RNG或推进战略日期。

## 6. 稳定交互约定

- 全游戏不增加关闭按钮；弹窗和二级界面统一右键逐层回退。
- 羽扇是军师一级菜单唯一开关；关闭时清理全部子窗口、选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白左键无功能，也不关闭界面。
- 模态、系统选单和场景切换统一使用 `clock.hold`，不得用速度档模拟暂停。
- Canvas列表滚动条在右侧，选中行使用 `#4a7828`。所有带表头的列表支持点击排序：首次升序、再次降序；数字按数值、文字按 `zh-Hant`，占位虚线固定末尾；排序后必须保留当前行对象身份。
- 地图只显示一个跟随鼠标的游戏光标；hover据点/军团不额外绘制重复框。已选据点的持续选中框保留。
- 首页不播放开场动画；确认章节/势力/军师或有效存档前，只显示 `grf/ui/loginbg.jpg` 和标题选单。

## 7. 常用命令

在 `E:/Dragon/web-port` 执行：

```bash
# 生成资源
python tools/parse_sinario.py
python tools/parse_battle.py
python tools/export_battle_rules.py

# 全量回归
for f in tools/verify_*.mjs; do node "$f" || exit 1; done
for f in tools/verify_*.py; do python "$f" || exit 1; done
node tools/verify_battle_viewport.js
node tools/verify_clock_pause.js

# 静态检查
python -m py_compile tools/parse_sinario.py tools/parse_battle.py tools/export_battle_rules.py
node --check web/src/main.js
git diff --check

# 本地服务与全新浏览器冒烟
python tools/webserver.py 8321
playwright-cli -s=dragon-fresh open http://127.0.0.1:8321/ --browser=chrome
playwright-cli -s=dragon-fresh console
playwright-cli -s=dragon-fresh close

# KI.EXE反汇编
python -i tools/disasm.py
# print(va_range(a,b)); callers(target); VA = 文件偏移 - 0x200
```

提交前必须运行：变更文件LSP、`lens_diagnostics mode=all`、全量focused suite、`git diff --check`，以及全新Playwright会话冒烟。

## 8. 重要坑点

1. 状态段地址不等于文件偏移，例如军团状态地址`0x2240`与SAVE文件偏移`0x22C0`不能混用。
2. 活动军团主将是`+2` byte；`+3`被接敌倒计时/状态复用，不能当u16主将或战型。
3. 野战/攻城主守方按原版候选选择，不能合并同坐标军团，也不能用synthetic city替代真实守军。
4. `0x291A`是不能继续行动后的武将去向分派，不等于“退到最近据点”。
5. 没有真实地图对象/墙记录时，不得按战略比例臆造战术城损。
6. 渲染、音效和动画辅助不得修改路线、战斗、事件队列、RNG或日历。
7. TALK、地图和数据生成物必须从解析链修正；Big5校订要保留索引和证据。
8. pi-lens可能自动格式化验证脚本；无关格式diff要定点恢复，不能混入功能提交。
9. 工作区可能包含用户改动；禁止整体`reset/clean`，只能恢复已确认无关的文件。
10. 浏览器ESM缓存会制造假回归；功能冒烟必须使用新服务或全新Playwright会话。

## 9. 当前主线状态

- 战略调度、事件轮、外交、道路接敌、战略速算、撤退、破城、灭亡和战略消息FIFO已闭合到现有KI.EXE/原始数据证据。
- 战术A1C5启动、持续`输入→A426→A065`、六队对象/命令/移动/碰撞/伤害/撤退/结算链已落地。
- 当前主线是 **委任战斗链和战略地图状态勘误的收尾验证**：守军出城、真实守军选择、六队输入、撤退寻路、主将关联、占城后调度、接战原音效和地图标识位置均已修复并有focused regression。
- Canvas通用表格排序和地图光标简化已完成，尚在同一未提交工作区中。
- 当前HEAD为 `acd28e8 docs: refresh project memory and journal`，与 `origin/main`一致；工作区包含本轮未提交功能、测试、资源和文档修改。提交前仍需完成全量回归、fresh浏览器真实流程验证和diff清理。
- 长期非阻塞增强：DOSBox-X逐帧捕获并与`originaldiff.js`比对；继续验证其它YNSOUND音效及INT61速度绝对毫秒。
