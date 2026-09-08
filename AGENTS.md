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
- 状态10抵都后无条件转9补员：先把残兵并回同兵种池，再按该兵种队数重分；单队上限1000人、余数优先前队，不同兵种不互借。玩家普通行军指示由`0x7FDB`重置状态0，低于6000人抵达首都后同样转9；NPC任一队少于300人才转11解散，玩家势力含委任军团不自动解散。
- NPC没有“败军优先使用新月预备兵”的全局优先级：`0x1D0B`先据点AI、后军团槽，月结兵源在该轮末入账；下一tick受威胁空城可先于状态9败军在首都编成新军并消耗兵池。状态9池空也会转3，不会停留等待下月。
- 抵达节点后必须保留目标到下一军团槽，并把原始`+0x0E`写为`nodeId*8`；运行态`targetNode`使用graph id，只在SAVE边界换算。道路边内改令必须保留当前edge/point，由`0x47BB`调整stride，不能清导航后从道路点启动节点级寻路。
- 城市战略attr必须逐槽动态重算；SINARIO `raw[0]`只有邻接低位，不能直接驱动NPC命令状态机。
- 首都失陷时先按原版候选链重选首都，再处理同城守军。实际主守军由战后链改命令态；其余同城组只共享撤退目标和移动标志，不得整组改状态或增加Web冷却。

### 内政、月结与预算

- `0x4194`按城市槽逐次运行，不在月结重复执行：玩家基准`cl=5/dl=1`；有预算的内政官先扣`general.assignment_budget`，本轮仍加政治并以`(1+force)>>1`补兵；AI/中立固定`8/4`。前两次RNG固定消费，城兵未满才消费第三次，补兵同时扣上升率。
- `city.defence`是`+0x11`唯一权威字段，不得维护会漂移的`city.disaster`规则镜像。内政官任命只写城市官员和武将身份；手动解任另清预算，城破清身份但不清预算。
- type4月末预算只为玩家城、已有内政官且预算为零者生成；建议额不预扣、不计月支出，批准后在最后一段回应关闭时一次性扣款并写`floor(grant/128)`。type4/type5共享金额语义：入口建议额`1..499`钳为500，自定义键盘输入`1..499`保持原值，上限30000。
- 月结先按本月税率、征兵设定和旧生产力结算，再运行生产力更新与事件生产，最后转正次月政策；不添加武将固定月俸或第二套治理公式。所有未闭合公式仍须标为推断/未知并继续取证。

## 5. 战术、消息与表现

- 权威战术状态只有`OriginalBattleSession`；每个固定帧顺序为：**就绪输入/按钮 → BATTLE.DAT VM `A426` → 战术帧 `A065`**。`0x9FA0`无输入时也继续调用A426/A065，禁止等待玩家首令而冻结战斗。
- 玩家无论战略攻守都映射为对象0侧：初始化`0x9BCE`写word 1，即`current=1/pending=0`，首帧切入阵形命令0；之后只有玩家按钮`C1B9/C21A`改令。敌方固定为0x600侧，由按敌将阵形和战型选择的32块BATTLE.DAT脚本持续进攻、守阵、变阵或退却；玩家不操作时敌方也必须继续行动。
- 六按钮实锤映射为`陣形0、攻擊1、突擊2、城壁3、守陣4、退卻5`；“攻擊”在野战可用，只有命令3“城壁”受AB4F/themeFlag门控。
- 指挥面板实锤：C11A在整块ID3中细分16阵形，写D346/D342，不自动发命令0；C165/C181/C19D选择部署X=48/28/5并保留Y。六卡XOR D310多选，零mask=全部；普通命令先清mask、只写组长pending，A7B7实际切换后才广播子槽。撤退仅D349=0接受且无视mask。状态图按A8CC/C673事件保留ICONGRF原始24×16图，内部6/7/8不换图。
- 产品范围（2026-09-07）：取消右侧小地图与右下双箭头，停止这两项可见功能的逆向实现；不得移除三个部署区域（不是小地图）、16阵形、六命令、卡栏或系统战术速度。底层隐藏状态/旧快照仅作兼容保留。原版事实：双箭头C234是显示抑制，不是速度：A06A切JMP并绘地图外tile0，再点击恢复JE+D348；隐藏仍推进同样的固定帧/RNG。C315→C39C→075B是真实TALK链（16位near-call回绕曾被误判），op16至多调用一次。C315语义、现代3秒呈现、B941有界原生参考历史及A1C5合法非局部结束现已接入；但B533完整伤害/交换、CBE5身份不变量、命令9/10可达性、E04A间接scratch writer、首DDB4前完整VGA来源、现代全世界像素等价及DOS运行态差分仍未闭合，不能宣称整个战场完全忠实。
- 战术速度只改变墙钟推进速度，不能改变固定帧、调用次数或RNG消费。`60A5`把战术档`CFB<<4`写`CFC`；非终止`A065`完成B941/ADC8/DDB4后才在末段`A0F2`按`CFC`等待，因此首个启动A065立即执行，尾部等待只约束下一完整帧。战略`1DF8`只读`CFA`，两者互不耦合。最高速取消额外等待但每个RAF最多推进1个完整战术帧；RAF必须把完整的有限非负间隔交给预算器，延迟/后台RAF由预算器丢弃整帧欠账并保留真实模余小数相位，禁止预截断间隔、同一显示帧批跑或恢复后追赶造成进场即结算。Canvas只读投影规则状态。
- `BATTLE.MAP` 的214个目录各自拥有`0x200+directoryIndex*0x1000`处的64×64地图；layout只选择MDL的三套图形/属性块。禁止恢复旧的三张layout-only地图。CB9B镜像须保持边界行、反转线性内部`0x40..0xFBF`并转换方向tile/非零theme，严禁翻转Canvas、人物、点击或相机。
- MDL每layout块前0x800为256×8图块描述、后0xF000为192个32×16地形帧；SCH为360个32×16对象半帧。Web按`X=16*(x+y)+16、Y=64+8*(64+y-x)-16*level`和B32D人员帧公式投影，地形与对象按`y-x`深度交错；外围用DD22的原始tile0蓝色菱格，高分辨率保持原生1:1像素的大场景和相机裁切并取消原128×128小地图。战术atlas颜色通道使用4-bit的`n*16`。
- 战术对白表现例外（2026-09-07用户明确批准）：只显示已解码C315捕获，现代窗口从实际显示起3000ms或全局右键关闭，两侧独立替换；不以A12A原始marker早关/延期，不写Session/RNG/队列，不进战略FIFO、不暂停战术帧。系统弹窗/设置右键优先，之后战术层消费全屏右键；原始局部27/28关闭API独立保留。C407「門強度」不是对白，保持原始来源/marker语义，本批不新建其UI。现代对白统一由`battlepanels.js`定义480×80（30×5 tile）外框、8px框内距和64×64缩放头像；敌窗顶边对齐左上标题窗、玩家窗底边对齐左下六卡底边，均保留16px视口边距、16px popup字体及有界自动换行，姓名与正文作为一个内容块垂直居中，纹理继续由`GameBar._drawWindow`绘制。`ICONGRF.DAT[2800h..2FFFh]`是128×32四平面16阵形原图：每格16×16、内缩1px的14×14独立框；Web不得再给两排添加整体外框，未选框红、仅当前选择框黄。原始AX/60与20低byte差证据、快照契约不变；显示态不入原始快照，新view只接续当前捕获，不重放历史启动事件。A1C5按每个真实A04B/A065规则帧yield，使双方启动C315可见且不暂停战术推进；99CB/B941有界原生参考历史与合法启动期非局部结束也已接入，具体限制见`docs/re-notes-tactical-lifecycle.md`。
- 战略规则消息统一进入`GameBar` FIFO：显示期间`clock.hold`，普通NPC/武将框3秒或右键关闭，回调once；高优先级模态和战术层期间延后。有实锤TALK索引时使用`enqueueTalkMessage()`。type4/type5预算对话在最终回应关闭后提交；type5为强制交互例外，整段屏蔽右键并只允许左键选择、输入和推进；右键不能退出、视为拒绝或改写已批准预算。
- 接触建立当轮立即按军团`+3`低两位显示四相，不在倒计时后追加第二轮。五声音效在同一WebAudio时间轴按82.5ms间隔预排；表现回调不得fetch、decode、resume或消费规则RNG。
- 接战动画锚定攻方军团当前坐标：先画48×48动画，再画同坐标16×16军团标识；不得移到据点中心或用GIF掩盖启动等待。
- 道路显示补偿只作用于Canvas；军团、虚线、接战和拾取必须使用一致显示坐标。

### BD46路径证据边界（2026-09-07）

- `BD46..BFF1`已按原始字节修为target→current反向波前、D300的2000个distance word与4000..47FF环队列；端点中心/右/左成功保留调整BX。cardinal读完整双面surcharge；BFDC恢复双倍node后读D2FC:`2000+2*n`，可别名到distance低byte，必须先读再写候选。
- 回溯按轴压缩、成本空档递减DX重试；最多64词也CLC成功，不得因weighted gap拒绝或逐格补词。原版字面corridor无成本输出`[0104]`，x3成本8输出`[0103,0104]`；生产AED2/B00D/AF65接受并按词移动。仅诊断distance不是原版公开返回寄存器。
- 45组认证KI有界解释器差分及双平面实际VM/队列/移动/快照/RNG回归见`docs/re-notes-tactical-lifecycle.md`、`tools/verify_battle_original_bd46*.mjs`。测试oracle无KI-call stub，生产仅原生JS。BD46已独立scoped-PASS；A1C5逐规则帧yield、C315现代表现、B941有界原生参考历史及合法非局部提前结束均已接线，但本项仍不代表整场忠实。取消小地图/双箭头的产品边界不变。
- B824墙破坏追加（同文档/`verify_battle_original_wall_clear.mjs`，已独立scoped-PASS）：新tile经BB6D刷新七物理面bit7（tile0全置），B863..B87A前六面literal0，第七面保留刷新后的bit7与旧ID，B87F只清下surcharge。**不重建两个D2FC描述面、不清上surcharge**；D348由实际B824置位，空扫描不添重绘。B5B7 mode0错误侧别直接排队不扣metric，方向归零须在inactive判断前实际写word；B799无kind/active/bit0过滤地重复改前16槽同Y记录，仅命中对象清active；B7CB才筛活动未破kind1并保留metric/active。30整内存+576分支及实际VM命令/接触/双面路径fixture为有界证据，不是整场或DOS运行等价。

### B941 compositor证据边界（2026-09-07，checked partial）

- 99C2 DC9D→99C5 9ACE→99C8 9CB3→99CB B941→99CE DDB4首次B941在A1C5前，空效果池只画属性/phase+1，不多跑A065。2026-09-08已按后续完整启动审计生产激活：Session建立原生32×30 cells并只执行一次99CB，保留D348=1供首A065第二次DC9D；常规非终止A065只在原始边界执行一次B941/ADC8/DDB4，终止A065在A6FA后跳过三者。
- DB34/属性共享terrain通道4*(z+1)，unit在+2；DE95五邻象限/双通道不能depth猜测。DDB4 dirty/bit8、DFBB忽略mask直写、CS:E164持久scratch须保留。936真实记录color & ~mask全0，不存在要求的真实非零样本；一般OR人工fixture不冒充资源。MDL0 sprite8仅58maskbits但快路清写512pixels。
- 214原图1,015,430静态块全覆盖不证明动态域。directory2的27节点五次B824字面变换构造在scratch00/FF时native(30,9)差0/15；**正常玩法可达未证**。文件初值00不是每战清零。2026-09-08后续审计批准以app进程级冷零scratch、跨战保留和battle级cells/framebuffer known-mask激活原生参考历史；首DDB4前未知VGA像素不补零作结论。现代全场仍只按真实BB10/DA1C/BAB7 capture投影，拖动不推进历史。E04A可达、完整前置VGA来源、窗口像素与屏外pixel equivalence仍未验收。

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

- 委任战斗、道路/接战、战后撤退与迁都、军师菜单、武将专长、内政官治理、type4/type5预算及月结财政均已有证据化基础实现；当前战术主线是继续收窄有界原生参考历史与完整DOS运行态之间的剩余差异。
- 当前无代码硬阻塞。道路中途改令与玩家返都补员已修；B941原生参考历史、99CB与A1C5合法9FDC非局部结束按有界证据接线，D31C/D31D保持FF到首个ADC8。父会话最终实际执行105项非浏览器验证正文、三尺寸Chrome布局及完整production acceptance，共107项通过；产品源和重点测试LSP无诊断，Lens无阻塞项，`git diff --check`仅既有换行提示。当前新修复尚未提交；已获用户授权在完成全量审查后提交并推送。
- 待继续：用全新浏览器长期运行第一章，复核内政官预算耗尽后的治理、月结政策边界、type4零建议额及存档禁止条件；对`rawRequest=0`尾段的原版写回细节仍需受控DOSBox运行态确认。
- 不得整体`reset/clean`或覆盖用户已有修改；任何后续提交/推送须用户明确授权。
