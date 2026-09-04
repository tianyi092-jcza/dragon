# AGENTS.md — 臥龍傳 Web 项目记忆

> 本文件是长期项目记忆，只保存稳定事实、架构、命令、约定、重要坑点和当前主线。
> 当前会话的调试过程、改动文件、验证、阻塞和下一步见 `docs/checkpoint-journal.md`。
> 逆向细节见 `docs/re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据原则

- 目标：不用模拟器，以**原生 JavaScript ES Modules + Canvas 2D**重写1995 DOS《臥龍傳》；无框架、无构建、无npm运行时依赖。
- 仓库：`E:/Dragon/web-port`；原版程序和运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/`是改版库，不能证明官方机制。
- 用户体验、截图和Web现状只用于提出假设、构造回归，不能单独证明规则。
- 正式结论只接受：`KI.EXE`明确指令/调用链/寄存器/字段、原始二进制数据与资源，或可重复且可控制变量的原版运行态观测。
- 证据未闭合时必须标为「推断」或「未知」，不得按平衡性、合理性或单次样本补阈值、概率、公式和兜底分支。
- 原始证据推翻既有代码、文档或测试时，以原始证据为准，并同步修正错误测试。
- 新逆向成果必须及时回流到对应SKILL或`re-notes`；代码注释应标明KI地址、数据偏移、TALK索引或资源名。
- 表现层可以不同，但不得改变规则帧、RNG消费、决策、胜负、六队伤亡、士气、城壁、城损、财政或战略状态。

## 2. 核心架构

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js` | App装配、新局/读档、战略调度、月结、战术入口与战果回写 |
| `web/src/game/clock.js` | KI战略子刻度、日期和五档表现速度 |
| `web/src/game/ai.js` | 据点/军团AI、行军、接敌、撤退、破城和战后状态机 |
| `web/src/game/roadgraph.js` | 原版192节点、254边道路拓扑与寻径 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算与六队结果 |
| `web/src/game/engagetransition.js` | 委任接战四相表现；不消费规则RNG |
| `web/src/game/battle/original*.js` | 原版战术RNG、VM、对象、命令、移动、碰撞、伤害和结算 |
| `web/src/game/savegame.js` | JSON快照、运行态sidecar与保存守卫 |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术只读投影和输入桥接 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、Canvas列表/弹窗和战略消息FIFO |
| `web/src/ui/startmenu.js` | 标题选单和通用标题阶段弹窗 |
| `tools/parse_*.py` / `export_*.py` | 从原始资源生成Web数据 |
| `tools/verify_*` | focused regression、存档、UI和逆向规则验证 |

## 3. 数据、RNG与存档

- 逻辑分辨率`640×400`；战略地图逻辑网格`384×256`，浏览器只负责视口缩放。
- `web/data.json`由`tools/parse_sinario.py`生成，共20章；生成物错误必须从解析链修复。
- SINARIO不含运行时军团表；新游戏从`legions=[]`开始，新局和读档统一经`main.js::loadState`装配。
- 游戏规则只使用canonical `OriginalBattleRng`字节流；不得回退到`Math.random()`。
- 正式存档只使用IndexedDB `wolong-web/saves`四槽JSON。自动化测试禁止读写`E:/Dragon/Dragon/SAVE.DAT`。
- sidecar保存军团导航/状态、48槽回归、事件轮、灾害、调度游标和RNG。战斗、接战过渡或待补日历进位期间禁止快照。
- 游戏内读档必须先返回标题；空槽在hover、hit-test、click三条路径都禁用。

## 4. 稳定战略规则

- `0x1D0B`每次主更新依次处理一个据点槽、十六军团槽、`0x2459`和日历；道路推进由军团槽轮询驱动，不绑定每日刷新。
- `CF2=0..8`，9次主更新进一时刻；`CF3=0..23`后进一天。渲染不得推进或改写导航。
- 道路资产为192节点、254边；边内点列不含两端据点中心。节点中心若混入points，会把驻城守军误判为道路野战。
- `0x2831`只检查下一道路边点上的异势力活动军团，进入`0x4A7B→0x5130(AL=1)`野战；不要求双方都有进攻命令。
- 攻军走完边内点后，由`0x2880→0x4ADE→0x4C72`检查端点敌城，真实驻军走`AL=0`攻城；无真实守军才由`0x4F8A`生成六队弓兵临时城防。
- NPC-NPC与玩家委任共用`0x5130`。委任位只决定是否跳过玩家战术层，不改变战型、数值公式或战果写回。
- 无目标驻军不会因附近敌军自行出城；目标只由据点AI或`0x4325`状态机写入。玩家尚未完成的命令优先于后续委任自主逻辑。
- `0x5130`严格读取六队原值；`legion.troops`暂时与六队和不一致时不得均分重建。真实主守军按原版候选评分选取，同值保留低军团槽。
- `generalIdx`是权威主将索引；`leader`只用于显示和旧快照兼容，军团slot不能冒充武将索引。
- 战败时`0x474A`仅在士气0、首队0或无合法退路时不能继续。总兵`<=300`不是歼灭条件。
- `0x487B`先选择并写入即时己方退点：边内固定按结构`edge+8`后`edge+6`检查；典型攻城失败会退往来路据点，但不存在独立“历史出发据点”字段。
- 写入即时退点后，总兵`<=300`或即时退点即首都写状态10，否则写状态8。状态10也先到即时退点，再由`0x4325→0x44A9`改目标返首都；状态8在即时据点休整。
- 战果函数不移动败军坐标；撤退继续由`0x25A3→0x2662→0x2708`逐边点推进。`stride=-4`时有向points首尾与结构端点相反，禁止按数组首尾猜`+8/+6`，否则会整边瞬移。
- `0x6FD2@0x701D`写军团`+0x0B=1`；成功建立撤退后，下次军团槽即可开始移动，不得另加Web等待。
- 原首都失陷后先按`0x4DF0→0x6A3D`重选首都，再执行`0x4DA4`同城守军撤退；禁止简单取最低据点索引。
- 破城顺序：据点易主 → 选择新首都 → 处理同城守军组 → 无新首都时灭亡。

## 5. 战术、消息与表现边界

- 权威战术状态只有`OriginalBattleSession`。每个固定帧顺序：**就绪输入/按钮 → BATTLE.DAT VM `A426` → 战术帧 `A065`**。
- 战术速度只改变墙钟推进速度，不得改变固定帧、调用次数或RNG消费顺序。Canvas只读投影规则状态。
- 战略规则消息统一进入`GameBar` FIFO：显示期间`clock.hold`，3秒或右键关闭，回调once；高优先级模态/战术层期间延后。
- 有实锤TALK索引的消息使用`enqueueTalkMessage()`；硬编码文本不得冒充原版TALK。
- 委任接战四相按`0→1→2→3`播放，当前起拍间隔约165ms；每相同步起播一次已缓存音效。帧回调不得fetch、decode、resume或消费规则RNG。
- 战略显示补偿只作用于Canvas：水平道路Y `+3px`、垂直道路X `+2px`、斜段按分量平滑过渡；军团、虚线、接战和拾取必须使用一致显示坐标。

## 6. 稳定交互约定

- 全游戏不增加关闭按钮；弹窗和二级界面统一右键逐层回退。
- 羽扇是军师一级菜单唯一开关；关闭时清全部子窗口和选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白左键无功能，也不关闭界面。
- 系统选单、模态、委任过渡、战斗和场景切换统一使用`clock.hold`，不得修改速度档模拟暂停。
- `Clock.advance()`中若战略tick建立战斗/过渡，必须在同一catch-up循环立即同步hold，高速档不得等下一RAF。
- Canvas列表滚动条在右侧；表头统一24px；选中行为`#4a7828`。表头排序首次升序、再次降序；排序后保留对象身份，占位行固定末尾。
- 地图只显示一个跟随鼠标的游戏光标；已选据点可保留中心选中框。
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

1. 状态段地址不等于文件偏移，例如军团状态地址`0x2240`与SAVE文件偏移`0x22C0`不能混用。
2. 活动军团主将是`+2` byte；`+3`被接敌倒计时/状态复用，不能当u16主将或战型。
3. 野战/攻城主守方不能合并同坐标军团，也不能用synthetic city替代真实守军。
4. `0x291A`是不能继续行动后的武将去向分派，不等于普通撤退。
5. 没有真实地图对象/墙记录时，不得按战略比例臆造战术城损。
6. 渲染、动画和音效不得修改路线、战斗、事件队列、RNG或日历。
7. 浏览器ESM缓存会制造假回归；规则修改后的冒烟必须使用全新浏览器会话。
8. 工作区可能包含用户改动；禁止整体`reset/clean`，只能定点修改或恢复已确认无关的文件。
9. pi-lens可能自动格式化验证脚本；无关格式diff需定点恢复。

## 9. 当前主线状态

- 本轮整合基线：`f3b4f26 fix: align delegated battles with original rules`；后续以远端`main`最新提交为准。
- 当前未提交主线是委任战斗与战略战后链收尾：道路野战/真实驻军攻城/临时城防、连续战斗、撤退两阶段目标、边内逐点退却、破城迁都、接战音效和战略时钟冻结均已实现并有focused regression。
- 最新全量自动回归结果为`ALL_OK`；相关JS/MJS的LSP为0 diagnostics，Lens无本轮问题，`git diff --check`通过（仅换行提示）。
- 剩余必要工作：审查未提交diff和无关/临时文件；用全新浏览器会话完成第一章真实流程复测，确认守军、攻城、四相音效、暂停、撤退动画和战后目标。
- 长期非阻塞增强：DOSBox-X逐帧捕获并与`originaldiff.js`差分；继续研究其它YNSOUND音效和INT61速度绝对时长。
