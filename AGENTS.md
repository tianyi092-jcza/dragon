# AGENTS.md — 臥龍傳 Web 项目记忆

> 只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线。
> 当前批次的详细进展、调试、验证、阻塞与下一步见 `docs/checkpoint-journal.md`；地址级证据见 `docs/re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据纪律

- 目标：不用模拟器，以**原生 JavaScript ES Modules + Canvas 2D**重写1995 DOS《臥龍傳》；无框架、无构建、无npm运行时依赖。
- 仓库：`E:/Dragon/web-port`；原程序与运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/`是改版库，不能证明官方机制。
- 用户体验、截图、Web现状、既有代码、测试和文档只能提供线索，不能单独证明规则。
- 正式机制只接受：`KI.EXE`明确指令/调用链/寄存器/字段、原始二进制数据与资源，或可重复且可控制变量的原版运行态观测。
- 证据未闭合时标为「推断」或「未知」；不得凭平衡性、合理性或单次样本补公式、阈值、概率或兜底。
- 新证据推翻现状时同步修正代码、测试和文档；新成果立即回流到对应SKILL或`re-notes`，关键实现注明KI地址、数据偏移、TALK索引或资源名。
- 表现可以现代化，但不得改变规则帧、RNG消费、决策、财政、战略状态、战斗胜负、六队伤亡、士气、城壁或城损。

## 2. 核心架构

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js` | App装配、新局/读档、战略RAF、月结、战术入口与战果回写 |
| `web/src/game/clock.js` | 战略子刻度、日期、五档速度及浏览器帧预算 |
| `web/src/game/ai.js` | 据点/军团AI、行军、接敌、撤退、破城、灾害事件和战后状态机 |
| `web/src/game/weather.js` | 战略雨云、火灾/暴动对象动画及`0x4269`统一灾害损害 |
| `web/src/game/roadgraph.js` | 原版道路拓扑、寻径与运行态导航 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算与六队结果 |
| `web/src/game/battle/original*.js` | 原版战术RNG、VM、对象、命令、移动、伤害和结算 |
| `web/src/game/savegame.js` | IndexedDB JSON快照、运行态sidecar与保存守卫 |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术只读投影及输入桥接 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、Canvas弹窗和战略消息FIFO |
| `web/src/ui/hud.js` / `startmenu.js` | 列表与模态计数；标题、新局和军师确认 |
| `tools/parse_*.py` / `export_*.py` | 从原始数据和资源生成Web产物 |
| `tools/verify_*` | focused regression、存档、资源和浏览器验收 |

## 3. 数据、存档与运行边界

- 逻辑分辨率为`640×400`；战略地图逻辑网格为`384×256`，浏览器只负责视口缩放。
- `web/data.json`由`tools/parse_sinario.py`生成，共20章；生成物错误必须修解析链，不能直接改JSON掩盖。每章从`+0x21C0`保留16朵雨云初态，并从头部`+0x32..+0x39`保留默认吸引边界。
- SINARIO不含运行时军团表；新游戏从`legions=[]`开始，新局和读档统一经`main.js::loadState`装配。
- 正式规则只使用canonical `OriginalBattleRng`字节流，禁止`Math.random()`回退；异步战术必须先回写同一RNG再恢复战略推进。
- 正式存档是IndexedDB `wolong-web/saves`四槽JSON；自动化测试**禁止读取或写入**`E:/Dragon/Dragon/SAVE.DAT`。
- sidecar保存军师、导航、军团、回归队列、事件轮、灾害对象、调度游标和RNG。战斗、接战过渡或待补日历进位期间禁止快照。
- 游戏内读档必须先返回标题；空槽在hover、hit-test、click三条路径都禁用。
- 自定军师是独立对象`{custom:true,general_idx:null,name,hao,portrait}`；默认军师成为玩家化身后，必须从普通武将、编成、内政/外交官和自动出征候选中排除。

## 4. 全局交互、计时与渲染约定

- 全游戏不增加关闭按钮；弹窗和二级界面统一右键逐层回退。普通NPC/武将提示框3秒自动关闭或右键立即关闭；强制交互例外必须有原始证据。
- 羽扇是军师一级菜单唯一开关；关闭时清全部子窗口和选中态。子菜单激活时地图绝对锁定；只展开一级菜单时仅实际`640×48`菜单矩形拦截输入。
- 大地图左键仅处理据点中心或行走军团；点击空白不关闭界面、不触发隐藏功能。
- 系统选单、模态、战斗和场景切换统一使用`clock.hold`，不得改速度档模拟暂停。
- 正常战略地图无模态时逐RAF重绘；`Clock.advanceFrame()`每RAF最多推进一个战略规则步，后台/延迟帧不得追赶积压。
- 规则更新与绘制严格分离：Canvas、动画投影和音效不能推进路线、事件、战斗、RNG或日历。
- 战略规则消息统一进入`GameBar` FIFO；有实锤TALK索引时使用`enqueueTalkMessage()`，状态提交与后续RNG必须服从原版消息返回边界。
- Canvas列表滚动条在右侧，表头24px，选中行为`#4a7828`；排序后保持原对象绑定，占位行固定末尾。

## 5. 稳定高风险规则

### 5.1 战略行军与战斗

- `0x1D0B`每次主更新依次处理一个据点槽、十六军团槽、`0x2459`地图对象和日历；道路移动由军团槽轮询驱动，不绑定每日刷新。
- 军团一次道路点位移按16/128槽调度周期铺满8个战略更新间隔；插值只属于Canvas，不能改规则坐标、路线或RNG。
- 道路资产为192节点、254边；敌城末端`0xCE..0xDD`边界tile在坐标写回前检查，攻方停在边界前一道路点进入攻城。
- 下一道路点若有异势力活动军团则野战；真实主守军按军团槽评分选择，同分保留低槽。不得合并同坐标军团或用synthetic city代替真实守军。
- NPC-NPC与玩家委任共用`0x5130`速算；委任只决定是否跳过玩家战术层。玩家未完成命令优先于后续自主逻辑，野战胜方下一自身槽立即续行。
- 六队原值是速算权威；`generalIdx`是主将权威索引，`leader`仅用于显示/旧快照兼容。兵种码：`1=骑、2=弓、3=步、4=空`。
- 撤退、状态9/10、48周期回归、迁都及破城组规则以`docs/re-notes-march-pathfinding.md`和相关SKILL为准，不得简化成统一“败退回首都”。

### 5.2 天气与据点灾害

- 地图对象池固定为前16槽火灾/暴动、后16槽常驻group0雨云；固定槽不得用`filter()`或删除压缩。完整运行态由IndexedDB sidecar保存。
- 雨云通常每16次主更新按槽序、每朵固定消费X/Y两个RNG字节；物理回绕X为`[-16,400]`、Y为`[-16,272]`，默认吸引边界maxY=400是另一字段。
- type11随机字节是直接城市索引；事件起始槽是`32/36/.../60`。暴雨只收窄11×11吸引矩形并预排事件，不存在云数量、碰撞或“聚集完成”阈值。
- type12固定扫描192城且不检查所属：先按`rng<24 && (rng&63)>=defence`判火灾；只有该条件失败才按同构流程与`growth`判暴动。火灾条件命中后即使入队失败也跳过暴动；随机入槽在页满时仍消费起点RNG。
- 玩家城分配成功后用底部通用框显示TALK71/72并播放警告音；消息返回后才消费灾害强度和removal的两个RNG字节。AI城静默但数值路径相同；对象池满则0消息、0后续RNG、0伤害。
- 雨云八相描述符为`18 19 1A 1B 1C 18 19 1A`（256×144，锚点`x-8,y-4`）；大火为`20 21 22 23`重复、暴动为`28 29 2A 2B`重复（均80×80，锚点`x-2,y-2`）。动画由规则层每16 tick推进且0 RNG。
- `city[+0x15]`由每城治理后的`0x4269`持续结算：先扣防灾，缺口再扣上升值、按生产力高字节比例扣生产力及扣城兵。火灾/暴动到type12 removal才清，暴雨在下月旧雨区清理。
- 详细地址、公式、伪代码和资源证据统一维护在`docs/re-notes-kernel.md`与`re-domestic-diplomacy` SKILL，AGENTS不重复展开。

### 5.3 战术边界

- 权威战术状态只有`OriginalBattleSession`；固定帧顺序：就绪输入/按钮 → BATTLE.DAT VM `A426` → 战术帧`A065`。无输入时也继续推进。
- 战术速度只改变墙钟等待，不能改变固定帧、调用次数或RNG；每RAF最多推进一个完整战术帧。
- `BATTLE.MAP`有214张独立64×64地图；layout只选择MDL图形/属性块。产品不显示战术小地图和右下双箭头。
- 战术对白是纯表现层：显示3000ms或全局右键关闭，不暂停Session、不改变marker、命令、RNG或规则帧。
- BD46、B824和原生compositor仅达到文档标注的有界scoped-PASS，不得扩写成“整个DOS战场完全等价”。

## 6. 常用命令

在`E:/Dragon/web-port`执行：

```bash
# 生成核心数据与战略地图资源
python tools/parse_sinario.py
python tools/parse_battle.py
python tools/export_battle_rules.py
python tools/extract_march_markers.py

# 全量安全回归
export PLAYWRIGHT_MODULE='C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright'
for f in tools/verify_*.mjs; do node "$f" || exit 1; done
for f in tools/verify_*.py; do python "$f" || exit 1; done
node tools/verify_battle_viewport.js

# 基础静态检查
python -m py_compile tools/parse_sinario.py tools/parse_battle.py tools/export_battle_rules.py
node --check web/src/main.js
git diff --check

# 本地静态服务器（参数是端口，前台serve_forever属正常）
python tools/webserver.py 8321

# 全新浏览器冒烟
playwright-cli -s=dragon-fresh open http://127.0.0.1:8321/ --browser=chrome
playwright-cli -s=dragon-fresh console
playwright-cli -s=dragon-fresh close

# KI.EXE反汇编
python -i tools/disasm.py
# print(va_range(a,b)); callers(target); VA = 文件偏移 - 0x200
```

提交前必须运行：变更文件LSP、`lens_diagnostics mode=all`、相关focused suite、必要的全量安全回归、`git diff --check`和全新Playwright会话冒烟。

## 7. 重要坑点

1. 状态段地址不等于SAVE文件偏移，例如军团状态地址`0x2240`对应文件偏移`0x22C0`。
2. 活动军团主将是`+2` byte；`+3`被接敌倒计时/状态复用，不能合并为u16主将或战型。
3. `0x291A`是不能继续行动后的武将去向分派，不等于普通撤退。
4. 没有真实地图对象/墙记录时，不得按战略比例臆造战术城损。
5. type11槽号与4B字节地址有二次换算；`32..60`不能误写回`8..15`。地图32对象也不能误当成type12可占32槽。
6. 雨云吸引边界maxY=400与物理回绕Y=272不冲突；不能合并字段。
7. MMAP复合图透明来自独立mask，颜色索引0可能是不透明黑，不能用色键透明。
8. 浏览器ESM缓存会制造假回归；规则或资源修改后使用全新浏览器profile。
9. `tools/webserver.py`需要位置参数端口；启动前检查残留PID/端口，避免把前台常驻误判为卡死或重复监听。
10. 工作区可能含用户和连续会话改动；禁止整体`reset/clean`。pi-lens造成的无关格式diff也只能定点恢复。

## 8. 当前主线状态

- 分支`main`，当前批次基线`6a96f21`；战略天气、暴雨、据点火灾/暴动及配套资源、测试和文档已实现并验证，提交状态以`git log`为准。
- 最新完整回归：106项MJS、11项Python及`verify_battle_viewport.js`全部通过；16个变更脚本primary LSP与`lens_diagnostics mode=all`零问题，全新Chrome验收通过。
- 当前无硬阻塞。已知表现差异仅为战略Canvas尚未模拟原版D51F“每地图tile最多5个覆盖层”的硬上限；不影响RNG、事件、生命周期、消息或城损。
- 战略下一步是长时浏览器覆盖灾害重叠/重复事件、内政预算耗尽、月结边界、保存禁止条件，以及多速度下行军、接战和战后续行。
- 战术长期未闭合项：E04A scratch来源、首DDB4前完整VGA来源、B533完整伤害/交换、CBE5身份不变量、命令9/10可达性及受控DOSBox逐帧差分。
- 不得整体`reset/clean`或覆盖现有修改；提交和推送必须等待用户明确指令。
