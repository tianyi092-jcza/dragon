# AGENTS.md — 臥龍傳 Web 项目记忆

> 这里只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线状态。
> 当前会话的实现、调试、验证、阻塞和下一步见 `docs/checkpoint-journal.md`；逆向细节见 `docs/re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据纪律

- 目标：不用模拟器，以**原生 JavaScript ES Modules + Canvas 2D**重写1995 DOS《臥龍傳》；无框架、无构建、无npm运行时依赖。
- 仓库：`E:/Dragon/web-port`；原版程序和运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/`是改版库，不能证明官方机制。
- 用户体验、截图、Web现状、既有测试和文档只可提供线索，不能单独证明规则。
- 正式结论只接受：`KI.EXE`明确指令/调用链/寄存器/字段、原始二进制数据与资源，或可重复且可控制变量的原版运行态观测。
- 证据未闭合时标为「推断」或「未知」；不得按平衡性、合理性或单次样本补公式、阈值、概率和兜底。
- 原始证据推翻既有实现时，以原始证据为准，并同步修正代码、测试和文档。
- 新逆向成果必须及时回流到对应SKILL或`re-notes`；关键代码注释应保留KI地址、数据偏移、TALK索引或资源名。
- 表现可以不同，但不得改变规则帧、RNG消费、决策、胜负、六队伤亡、士气、城壁、城损、财政和战略状态。

## 2. 核心架构

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js` | App装配、新局/读档、战略调度、月结、战术入口与战果回写 |
| `web/src/game/clock.js` | 战略子刻度、日期与五档表现速度 |
| `web/src/game/ai.js` | 据点/军团AI、行军、接敌、撤退、破城与战后状态机 |
| `web/src/game/roadgraph.js` | 原版道路拓扑与寻径 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算与六队结果 |
| `web/src/game/battle/original*.js` | 原版战术RNG、VM、对象、命令、移动、伤害和结算 |
| `web/src/game/savegame.js` | JSON快照、运行态sidecar与保存守卫 |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术只读投影与输入桥接 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、Canvas列表/弹窗和战略消息FIFO |
| `web/src/ui/hud.js` | 列表数据构造及旧DOM HUD入口 |
| `web/src/ui/startmenu.js` | 标题选单与标题阶段弹窗 |
| `tools/parse_*.py` / `export_*.py` | 从原始资源生成Web数据 |
| `tools/verify_*` | focused regression、存档、UI和逆向规则验证 |

## 3. 数据、存档与规则边界

- 逻辑分辨率为`640×400`；战略地图逻辑网格为`384×256`。浏览器只负责视口缩放。
- `web/data.json`由`tools/parse_sinario.py`生成，共20章；生成物错误必须从解析链修复，不能直接改JSON掩盖。
- SINARIO不含运行时军团表；新游戏从`legions=[]`开始，新局和读档统一经`main.js::loadState`装配。
- 正式规则只使用canonical `OriginalBattleRng`字节流；不得回退到`Math.random()`。
- 正式浏览器存档使用IndexedDB `wolong-web/saves`四槽JSON；自动化测试禁止读写`E:/Dragon/Dragon/SAVE.DAT`。
- sidecar保存导航、军团状态、48槽回归、事件轮、灾害、调度游标和RNG。战斗、接战过渡或待补日历进位期间禁止快照。
- 游戏内读档必须先返回标题；空槽在hover、hit-test、click三条路径都禁用。

## 4. 已确认的战略主干

- `0x1D0B`每次主更新依次处理一个据点槽、十六军团槽、`0x2459`和日历；道路移动由军团槽轮询驱动，不绑定每日刷新。渲染不得推进导航。
- 原版道路资产为192节点、254边；边内点列不包含据点中心。把节点中心混入points会把驻城守军误判为道路野战。
- 下一道路边点有异势力活动军团时走野战；走完边内点后，敌城端点走攻城。无真实守军才以当前城兵生成六队步兵临时城防；中立空城也不是无战占领。
- NPC-NPC与玩家委任共用`0x5130`速算。委任位只决定是否跳过玩家战术层，不改变战型、数值或战果写回。
- 无目标驻军不会自行出城；玩家尚未完成的命令优先于后续委任自主逻辑。
- 速算严格读取六队原值；不得因`legion.troops`暂时不等于六队和而重分。真实主守军按军团槽评分选择，同分保留低槽。
- `generalIdx`是权威主将索引；`leader`只用于显示和旧快照兼容，军团slot不能冒充武将索引。
- 原始兵种码固定为`1=骑`、`2=弓`、`3=步`、`4=空`；对应势力预备池`+4/+6/+8`。
- 武将`ability.siege/field/naval`来自记录`+0x0E/+0x0F/+0x10`高四位，分别表示攻城、野战、水战专长。
- 战败不能继续的硬条件是士气0、首队0或无合法退路；总兵`<=300`只影响撤退命令态，不是歼灭条件。
- 撤退先沿当前edge逐点到即时己方退点，再由状态10决定是否二段返首都。`stride=-4`时有向点列首尾与结构端点相反，端点判定必须读原始edge。
- 状态10抵都后无条件转9补员：先把残兵并回同兵种池，再按该兵种队数重分；单队上限1000人、余数优先前队，不同兵种不互借。NPC任一队少于300人才转11解散；玩家势力含委任军团不自动解散。
- 抵达节点后必须保留目标到下一军团槽，并把原始`+0x0E`写为`nodeId*8`；运行态`targetNode`使用graph id，只在SAVE边界换算。
- 城市战略attr必须逐槽动态重算；SINARIO `raw[0]`只有邻接低位，不能直接驱动NPC命令状态机。
- 首都失陷时先按原版候选链重选首都，再处理同城守军。实际主守军由战后链改命令态；其余同城组只共享撤退目标和移动标志，不得整组改状态或增加Web冷却。

## 5. 战术、消息与表现

- 权威战术状态只有`OriginalBattleSession`；每个固定帧顺序为：**就绪输入/按钮 → BATTLE.DAT VM `A426` → 战术帧 `A065`**。
- 战术速度只改变墙钟推进速度，不能改变固定帧、调用次数或RNG消费。Canvas只读投影规则状态。
- 战略规则消息统一进入`GameBar` FIFO：显示期间`clock.hold`，3秒或右键关闭，回调once；高优先级模态和战术层期间延后。有实锤TALK索引时使用`enqueueTalkMessage()`。
- 接触建立当轮立即按军团`+3`低两位显示四相，不在倒计时后追加第二轮。五声音效在同一WebAudio时间轴按82.5ms间隔预排；表现回调不得fetch、decode、resume或消费规则RNG。
- 接战动画锚定攻方军团当前坐标：先画48×48动画，再画同坐标16×16军团标识；不得移到据点中心或用GIF掩盖启动等待。
- 道路显示补偿只作用于Canvas；军团、虚线、接战和拾取必须使用一致显示坐标。

## 6. 交互与UI约定

- 全游戏不增加关闭按钮；弹窗和二级界面统一右键逐层回退。
- 羽扇是军师一级菜单唯一开关；关闭时清全部子窗口、选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；仅展开一级菜单且八项未选中时，只有实际`640×48`菜单矩形拦截输入。同高度左右地图仍可点击和拖拽；地图空白左键无功能。
- 系统选单、模态、委任过渡、战斗和场景切换统一使用`clock.hold`，不得修改速度档模拟暂停。
- `Clock.advance()`中若战略tick建立战斗或过渡，必须在同一catch-up循环立即同步hold。
- Canvas列表滚动条在右侧；表头24px；选中行为`#4a7828`。表头首次升序、再次降序，排序后保持原对象绑定，占位行固定末尾。
- 普通武将与编成候选列表为`624×352`，显示攻城、野战、水战三项专长；编成面板位置不随列表扩宽偏移。
- 首页确认章节、势力、军师或有效存档前，只显示`grf/ui/loginbg.jpg`和标题选单；背景保持比例、左上对齐、cover且不重复。

## 7. 常用命令

在`E:/Dragon/web-port`执行：

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

提交前必须运行：变更文件LSP、`lens_diagnostics mode=all`、全量focused suite、`git diff --check`和全新Playwright会话冒烟。

## 8. 重要坑点

1. 状态段地址不等于SAVE文件偏移，例如军团状态地址`0x2240`对应文件偏移`0x22C0`。
2. 活动军团主将是`+2` byte；`+3`被接敌倒计时/状态复用，不能合并为u16主将或战型。
3. 野战/攻城主守方不能合并同坐标军团，也不能用synthetic city替代真实守军。
4. `0x291A`是不能继续行动后的武将去向分派，不等于普通撤退。
5. 没有真实地图对象/墙记录时，不得按战略比例臆造战术城损。
6. 渲染、动画和音效不得修改路线、战斗、事件队列、RNG或日历。
7. 浏览器ESM缓存会制造假回归；规则修改后的冒烟必须使用全新浏览器会话。
8. 工作区可能包含用户改动；禁止整体`reset/clean`，只能定点处理确认无关的文件。
9. pi-lens可能自动格式化验证脚本；无关格式diff需定点恢复。

## 9. 当前主线状态

- 当前主线是委任战斗、战略战后链与军师UI收尾。道路野战、真实驻军攻城、临时城防、连续战斗、两阶段撤退、返都补员/解散、破城迁都、接战四相/音效、菜单命中和武将专长列均已实现并有focused regression。
- 当前没有代码或逆向硬阻塞。最新完整回归为80个MJS、4个Python和2个JS验证全部通过，汇总`ALL_OK 86`。
- 剩余主线：用全新浏览器长期运行第一章，复核椎阳驻军、返都补员/解散、NPC-NPC野战、真实驻军攻城、临时城防、破城整组撤退与迁都。
- 本轮提交后，后续提交或推送仍须用户明确授权。
