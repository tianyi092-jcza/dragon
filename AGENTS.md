# AGENTS.md — 臥龍傳 Web 项目记忆

> 只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线。
> 当前会话的改动、调试、验证、阻塞与下一步见 `docs/checkpoint-journal.md`；地址级证据见 `docs/re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据纪律

- 目标：不用模拟器，以**原生 JavaScript ES Modules + Canvas 2D**重写1995 DOS《臥龍傳》；无框架、无构建、无npm运行时依赖。
- 仓库：`E:/Dragon/web-port`；原程序与运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/`是改版库，不能证明官方机制。
- 用户体验、截图、Web现状、既有代码、测试和文档只能提供线索，不能单独证明规则。
- 正式机制只接受：`KI.EXE`明确指令/调用链/寄存器/字段、原始二进制数据与资源，或可重复且可控制变量的原版运行态观测。
- 证据未闭合时标为「推断」或「未知」；不得凭平衡性、合理性或单次样本补公式、阈值、概率和兜底。
- 原始证据推翻现状时同步修正代码、测试和文档。新成果应立即回流到对应SKILL或`re-notes`，关键代码保留KI地址、偏移、TALK索引或资源名。
- 表现可以现代化，但不得改变规则帧、RNG消费、决策、胜负、六队伤亡、士气、城壁、城损、财政和战略状态。

## 2. 核心架构

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js` | App装配、新局/读档、战略RAF、月结、战术入口与战果回写 |
| `web/src/game/clock.js` | 战略子刻度、日期、五档速度及浏览器帧预算 |
| `web/src/game/ai.js` | 据点/军团AI、行军、接敌、撤退、破城和战后状态机 |
| `web/src/game/roadgraph.js` | 原版道路拓扑、寻径与运行态导航 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算与六队结果 |
| `web/src/game/battle/original*.js` | 原版战术RNG、VM、对象、命令、移动、伤害和结算 |
| `web/src/game/savegame.js` | IndexedDB JSON快照、运行态sidecar与保存守卫 |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术只读投影及输入桥接 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、Canvas弹窗和战略消息FIFO |
| `web/src/ui/hud.js` | 列表数据构造、旧DOM HUD入口及模态计数 |
| `web/src/ui/startmenu.js` | 标题选单、势力/军师确认和自定军师输入 |
| `tools/parse_*.py` / `export_*.py` | 从原始资源生成Web数据和图像 |
| `tools/verify_*` | focused regression、存档、浏览器UI和逆向规则验证 |

## 3. 数据、存档与运行边界

- 逻辑分辨率为`640×400`；战略地图逻辑网格为`384×256`，浏览器只负责视口缩放。
- `web/data.json`由`tools/parse_sinario.py`生成，共20章；生成物错误必须从解析链修复，不能直接改JSON掩盖。
- SINARIO不含运行时军团表；新游戏从`legions=[]`开始，新局和读档统一经`main.js::loadState`装配。
- 正式规则只使用canonical `OriginalBattleRng`字节流；不得回退到`Math.random()`。
- 正式存档是IndexedDB `wolong-web/saves`四槽JSON；自动化测试禁止读写`E:/Dragon/Dragon/SAVE.DAT`。
- sidecar保存玩家军师、导航、军团、回归队列、事件轮、灾害、调度游标和RNG。战斗、接战过渡或待补日历进位期间禁止快照。
- 自定军师是独立对象`{custom:true,general_idx:null,name,hao,portrait}`，Unicode姓名/别号随IndexedDB无损保存并在读档时恢复；武将身份不按姓名匹配。
- 玩家确认剧本默认军师后，该武将成为玩家化身，必须从武将一览、编成、内政官/外交官、自动出征及其他武将候选中排除；读档由`initPlayer`重建身份。
- 游戏内读档必须先返回标题；空槽在hover、hit-test、click三条路径都禁用。

## 4. 稳定规则与表现约束

### 4.1 战略调度、行军与战斗

- `0x1D0B`每次主更新依次处理一个据点槽、十六军团槽、`0x2459`和日历；道路移动由军团槽轮询驱动，不绑定每日刷新。
- 正常战略地图无模态时必须逐RAF重绘。`HUD.dialogCount`初始化为0，主循环对缺省值也按0处理；规则时钟不能在画面停更时后台推进。
- 浏览器主循环使用`Clock.advanceFrame()`：每RAF最多执行一次战略更新，延迟/后台帧丢弃整帧欠账，只保留小于一个step的小数相位。`Clock.advance()`仅供受控测试完整消费dt。
- 军团一次道路点位移按16/128槽调度周期连续铺满8个战略更新间隔；速度档只缩短墙钟时间，最高速也不能跳过整步。插值只属于Canvas，禁止修改规则坐标、路线、RNG和战果。
- 道路资产为192节点、254边；边内点列不包含据点中心。候选末端`0xCE..0xDD`据点边界tile在坐标写回前检查敌城，攻方停在边界前一道路点进入攻城。
- 下一道路点若有异势力活动军团则野战；真实主守军按军团槽评分选择，同分保留低槽。不能合并同坐标军团，也不能用synthetic city替代真实守军。
- NPC-NPC与玩家委任共用`0x5130`速算。委任仅决定是否跳过玩家战术层，不改变战型、数值或回写；野战胜方下一自身槽应继续行动，不得增加Web冷却。
- 玩家尚未完成的命令优先于后续委任自主逻辑；无目标驻军不会自行出城。
- 六队原值是速算权威；不得因`legion.troops`暂时不等于六队和而重分。`generalIdx`是权威主将索引，`leader`只用于显示和旧快照兼容。
- 原始兵种码：`1=骑`、`2=弓`、`3=步`、`4=空`；预备池对应势力字段`+4/+6/+8`。
- 撤退、状态9补员、状态10返城、48周期武将回归和迁都细节以`docs/re-notes-march-pathfinding.md`及相关SKILL为准，不得用统一“败退回首都”简化。

### 4.2 内政、预算与消息

- `0x4194`按城市槽逐次运行，不在月结重复执行。`city.defence`是`+0x11`唯一权威字段，不维护会漂移的规则镜像。
- type4月末预算只为玩家城、已有内政官且预算为零者生成；建议额不预扣、不计月支出，批准后在最终回应关闭时一次性扣款并写`floor(grant/128)`。
- type4/type5入口建议额`1..499`钳为500；键盘自定义`1..499`保持原值；上限30000。type5是强制交互，整段屏蔽右键。
- 战略规则消息统一进入`GameBar` FIFO；普通NPC/武将提示框3秒或右键关闭，回调once，显示期间`clock.hold`。有实锤TALK索引时使用`enqueueTalkMessage()`。
- 普通系统/NPC提示统一使用底部`generalCard`样式，不为单项事件另造顶部提示框。内政TALK56先显示底部报告卡，关闭后才进入朝堂议政。
- `IVENTGRF.DAT`三张议政插图只保留canonical `ivent_0/1/2.png`，按原生`288×176`提取和绘制；不得恢复无引用的`_a/_b`别名或按旧288×352交错结果拉伸。据点名使用土橙高亮，金额数字使用DIN/Oswald黄色高亮。

### 4.3 战术边界

- 权威战术状态只有`OriginalBattleSession`；固定帧顺序是：就绪输入/按钮 → BATTLE.DAT VM `A426` → 战术帧`A065`。无输入时也继续推进。
- 战术速度只改变墙钟等待，不能改变固定帧、调用次数或RNG消费；每RAF最多推进一个完整战术帧。
- `BATTLE.MAP`有214张独立64×64地图；layout只选择MDL图形/属性块。等距投影和原生绘制证据见`docs/re-notes-tactical-lifecycle.md`。
- 产品边界：不显示战术小地图和右下双箭头；保留三部署区、16阵形、六命令、六卡和系统战术速度。
- 战术对白是纯表现层：捕获已解码C315，显示3000ms或全局右键关闭；不暂停Session、不改变marker、命令、RNG或规则帧。
- BD46、B824及原生compositor均只达到文档标注的有界scoped-PASS；不得扩写成“整个战场/DOS运行完全等价”。

## 5. 交互与UI约定

- 全游戏不增加关闭按钮；弹窗与二级界面统一右键逐层回退。强制交互例外必须有原始证据或用户明确产品决定。
- 羽扇是军师一级菜单唯一开关；关闭时清全部子窗口和选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；仅展开一级菜单且未选中项目时，只有实际`640×48`菜单矩形拦截输入。同高度两侧地图仍可交互；地图空白左键无功能。
- 系统选单、模态、委任过渡、战斗和场景切换统一使用`clock.hold`，不得修改速度档模拟暂停。
- Canvas列表滚动条在右侧，表头24px，选中行为`#4a7828`；排序后保持原对象绑定，占位行固定末尾。
- 首页确认章节、势力、军师或有效存档前，只显示`grf/ui/loginbg.jpg`和标题选单；背景保持比例、左上对齐、cover且不重复。

## 6. 常用命令

在`E:/Dragon/web-port`执行：

```bash
# 生成资源
python tools/parse_sinario.py
python tools/parse_battle.py
python tools/export_battle_rules.py

# 全量安全回归
for f in tools/verify_*.mjs; do node "$f" || exit 1; done
for f in tools/verify_*.py; do python "$f" || exit 1; done
node tools/verify_battle_viewport.js
# 战略时钟/RAF浏览器回归由 verify_battle_browser_acceptance.mjs 调用

# 静态检查
python -m py_compile tools/parse_sinario.py tools/parse_battle.py tools/export_battle_rules.py
node --check web/src/main.js
git diff --check

# 本地服务（参数是端口；前台serve_forever不是卡死）
python tools/webserver.py 8321

# 全新浏览器冒烟
playwright-cli -s=dragon-fresh open http://127.0.0.1:8321/ --browser=chrome
playwright-cli -s=dragon-fresh console
playwright-cli -s=dragon-fresh close

# KI.EXE反汇编
python -i tools/disasm.py
# print(va_range(a,b)); callers(target); VA = 文件偏移 - 0x200
```

提交前必须运行：变更文件LSP、`lens_diagnostics mode=all`、相关focused suite、必要的全量安全回归、`git diff --check`及全新Playwright会话冒烟。

## 7. 重要坑点

1. 状态段地址不等于SAVE文件偏移，例如军团状态地址`0x2240`对应文件偏移`0x22C0`。
2. 活动军团主将是`+2` byte；`+3`被接敌倒计时/状态复用，不能合并为u16主将或战型。
3. 渲染、动画和音效只能读取规则状态，不能推进路线、战斗、事件队列、RNG或日历。
4. `0x291A`是不能继续行动后的武将去向分派，不等于普通撤退。
5. 没有真实地图对象/墙记录时，不得按战略比例臆造战术城损。
6. 浏览器ESM缓存会制造假回归；规则修改后必须使用全新浏览器会话。
7. `tools/webserver.py`需要位置参数端口；无参数或把前台常驻误判为卡死都会干扰调试。启动前先检查残留PID/端口占用，避免重复监听。
8. 工作区可能包含用户和连续会话改动；禁止整体`reset/clean`，只能定点处理已确认无关文件。
9. pi-lens可能自动格式化验证脚本；无关格式diff应定点恢复，不得连带覆盖功能修改。

## 8. 当前主线状态

- 当前战略批次已整合内政预算UI、默认军师候选排除、委任攻城边界/野战续行和战略逐帧连续性；以`4a6098d`为前置基线，最终提交见`git log`。
- 当前无硬阻塞。最终工作树的98项MJS、9项Python、viewport验证、相关文件LSP及全新Chrome验收均已通过；审查口径与残余风险见`docs/checkpoint-journal.md`。
- 当前战术长期主线仍是收窄有界原生参考历史与完整DOS运行态之间的剩余差异；E04A scratch来源、首DDB4前完整VGA来源、B533完整伤害/交换、CBE5身份不变量、命令9/10可达性和受控DOSBox逐帧差分仍未闭合。
- 战略下一步是长时浏览器覆盖内政预算耗尽、月结政策边界、type4零建议额、保存禁止条件，以及多速度下连续行军、接战、攻城和战后续行。
- 不得整体`reset/clean`或覆盖现有修改；提交或推送须按用户明确指令执行。
