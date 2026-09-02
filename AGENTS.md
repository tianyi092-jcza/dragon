# AGENTS.md — 臥龍傳 Web 项目记忆

> 只保存长期有效的项目事实、架构、命令、约定、重要坑点和当前主线。
> 最近一轮的实现、调试、失败尝试与下一步见 `docs/checkpoint-journal.md`；二进制证据与公式见 `docs/re-notes-*.md` 和 `E:/Dragon/.agents/skills/`。

## 1. 项目边界与证据原则

- 目标：不用模拟器，以 **原生 JavaScript ES Modules + Canvas 2D** 重写 1995 DOS《臥龍傳》。无框架、无构建、无 npm 运行时依赖。
- 仓库：`E:/Dragon/web-port`；原版程序与运行数据：`E:/Dragon/Dragon/`；官方剧本基准：`E:/Dragon/原版/`。`上/中/下/后/` 是改版剧本库，不能作为官方机制证据。
- 机制结论必须来自 KI.EXE、原始数据或资源，并明确区分 **实锤 / 推断 / 未知**。新逆向成果必须同步到对应 SKILL 或 `re-notes`，不能只留在代码注释或会话中。
- Web 可改变分辨率、布局和动画表现；表现层不得改变规则帧、RNG、决策、胜负、六队伤亡、士气、城壁、城损、财政或战略状态。
- 产品运行时不得依赖 DOS 文件、SAVE.DAT 或模拟器。未闭合机制宁可显式报错或保守停住，不得加入平行近似规则。

## 2. 核心架构

| 路径 | 职责 |
| --- | --- |
| `web/src/boot.js` | 取得浏览器单实例锁后启动应用 |
| `web/src/main.js` | App 装配、新局/读档、战略调度、月结、战术入口和战果回写 |
| `web/src/core/localstore.js` / `singleinstance.js` | IndexedDB 四槽存档与同 origin 单实例 |
| `web/src/game/savegame.js` | JSON 快照、运行态 sidecar、存档时机守卫 |
| `web/src/game/clock.js` | KI 战略子刻度、时刻、日期和五档表现速度 |
| `web/src/game/ai.js` | 据点/军团 AI、事件轮、行军、接敌、撤退、破城和战后处理 |
| `web/src/game/economy.js` | 24bit资金、维护费和月度财政 |
| `web/src/game/diplomacy.js` | 有方向的外交矩阵、候选和状态提交 |
| `web/src/game/talk.js` | TALK加载、占位符替换和个性对白选择器 |
| `web/src/game/roadgraph.js` | 原版192节点、254边道路拓扑与寻径 |
| `web/src/game/autobattle.js` | 战略野战/攻城速算和六队结果 |
| `web/src/game/engagetransition.js` | 战略接战表现；不得消费规则RNG |
| `web/src/game/battle/original*.js` | 原版战术RNG、VM、对象池、命令、移动、碰撞、伤害和结算 |
| `web/src/game/battle/battleprojection.js` | 零RNG、只读的Canvas战场DTO |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术渲染和输入桥接；不另建规则状态 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、Canvas弹窗和战略消息FIFO |
| `web/src/ui/hud.js` | 地图HUD、即时操作反馈和据点命令 |
| `tools/parse_*.py` / `tools/export_*.py` | 从原始资源生成Web数据 |
| `tools/verify_*` | focused regression、存档、UI和逆向规则验证 |

## 3. 数据、随机源与存档

- 逻辑分辨率 `640×400`；战略地图逻辑网格 `384×256`。浏览器可按视口放大。
- `web/data.json` 由 `tools/parse_sinario.py` 生成，共20章；战场资源由解析/导出脚本生成。不要直接修改生成物掩盖解析错误。
- SINARIO 不含运行时军团表；新游戏必须从 `legions=[]` 开始。新局和读档统一经 `main.js::loadState` 装配。
- 游戏规则只使用 canonical `OriginalBattleRng` 字节流。新局重建，读档恢复快照；缺规则RNG时应报错，不能回退到 `Math.random()`。
- 资金按24bit语义运行并在 `-655000..655000` 饱和；战略兵力常以十人为内部单位，跨层时必须明确单位。
- 正式存档只使用浏览器 IndexedDB `wolong-web/saves` 四槽JSON。自动化测试禁止读写 `E:/Dragon/Dragon/SAVE.DAT`。
- sidecar保存军团规则态、48次槽调度延迟回归、战略事件轮、灾害对象、调度游标和RNG。
- 战斗、接战过渡或待补日历进位期间禁止快照。保存成功后才更新内存槽；失败保留旧档。
- 单实例优先使用 Web Locks `wolong-web-game-instance`，旧浏览器降级为 `localStorage` 心跳；未取得锁不得启动App、RAF或写档。

## 4. 战略规则与调度

- `0x1D0B`每次主更新依次处理：一个据点槽 → 十六军团槽 → `0x2459` → 日历/时刻。
- `CF2=0..8`，9次主更新进入下一游戏时刻；`CF3=0..23`后进一天。军团道路推进由槽位轮询驱动，不绑定每日刷新；渲染不得推进路线。
- `0x3E11`只在时刻进位时轮转一个势力槽，顺序为：事件泵 → 财政危机门控 → 预备兵维护累计 → 外交官维护。
- 战略事件轮为256个4B槽、4页×64槽。首槽等待7次势力调度，之后每10次消费一槽，空槽也消费；月结前移一页。`0x301C`偏移单位是事件槽，不是天数。
- type1..13现存处理语义、已证生产者和SAVE尾段解析已统一；type10只兼容DOS SAVE已有通用TALK事件，不为新游戏自创生产者。
- 财政门控比较 `nCities*8+24` 与 signed `funds>>8`；预备兵维护按每次势力轮询累计 `floor((骑+弓+步)/32)`。
- 玩家空虚边城显示TALK38，冷却为本城 `(rng&15)+24` 次轮询。AI弱城从首都按最高武力、低索引优先选择待命武将，并从真实三兵种池编成六队。
- 据点行军使用 `road_graph.json` 原版道路拓扑。接敌初值12并同轮减为11，之后每次该槽调度重新确认目标。
- 玩家直属军团进入战术层；NPC-NPC、委任军团和临时城防走战略速算。委任不能覆盖尚未完成的玩家命令。
- 战败撤退最终目标为本势力首都，路线只能经过己方据点；48表示军团槽被调度48次，不是48天。
- 破城顺序固定为：据点易主 → 寻新首都 → 处理同城守军组 → 无新首都时灭亡。
- `0x4FCE`按武将索引扫描：有原属记录则恢复仍活跃原属；非君主且有活动军团则解散并流散；其余进入`0x29C3`被俘/退场。该扫描不额外消费RNG。

## 5. 外交与消息系统

- 外交矩阵有方向；普通变化只改单向，宣战/停战调用点才显式同步双方。raw `<0x80`表示交战。
- 新游戏显示地图前执行一次`0x2BD9`；月结再次生成候选。读档不得重复开局初始化。
- 候选使用前192城、空城sentinel、战争marker和原版不稳定selection-sort；随机入槽不去重且必须保持RNG消费。
- 正式战略规则消息统一由 `GameBar` FIFO 呈现：显示期间 `clock.hold`；3秒自动关闭或右键关闭；回调once；高优先级模态/战术层期间延后；状态在原版规定的最终对白关闭边界提交。
- `enqueueTalkMessage()`用于有实锤TALK索引的规则消息；TALK占位符和 `0x075B` 个性窗口由 `talk.js`格式化。普通硬编码文本不得冒充原版TALK。
- 已接入的战略消息覆盖宣战、谈判、预算、迁都、亲征、战斗开场、战后命运、失城/新首都、灭亡、投奔、灾害和赤字处罚。
- 战果规则消息不得经 `hud.flashEvent()`旁路；HUD即时浮窗只用于存档结果、无效操作和非规则提示。
- 玩家参与且非委任的野战/攻城在TALK29或TALK27/28关闭后才进入战术层。玩家据点易主显示TALK26；首都失陷且有替代首都时按TALK30→TALK26排队。
- 宣战、谈判、迁都和亲征等状态必须在最终君主/结果对白关闭后提交，右键和旧timer竞争不得重复提交。

## 6. 战术规则与表现边界

- 权威战术状态只有 `OriginalBattleSession`；旧随机伤害、兵种克制和超时判胜模拟器已删除。
- 战斗启动先执行 `A1C5`：所有模式固定50个A065预帧；mode1再执行A2E8/A34F评分、RNG、等待、单挑和脚本跳过分支。
- 每个固定帧严格为：**就绪玩家输入/按钮 → BATTLE.DAT VM `A426` → 同一Session的战术帧 `A065`**。A426是全战斗持续脚本。
- 双方各6组、每组8对象槽；对象池、临时六队记录、地图对象、路径队列、RNG、VM和寄存器均可快照。
- 城壁、碰撞、伤害、撤退、六队幸存、士气和城损只由Session规则状态决定。Canvas只做只读投影。
- 战术速度只能改变墙钟推进速度，不得改变固定帧顺序、每帧调用次数或RNG消费顺序。

## 7. 稳定交互约定

- 不增加关闭按钮；弹窗和二级界面统一右键逐层回退。
- 羽扇是军师一级菜单唯一开关；关闭时清理所有子窗口、选中态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白左键无功能，也不关闭界面。
- Canvas列表滚动条在右侧，选中行使用 `#4a7828`。
- 模态、系统选单和场景切换统一使用 `clock.hold`，不得通过改速度档模拟暂停。
- 游戏内读档必须先返回标题；空槽在hover、hit-test、click三条路径都禁用。
- 首页不播放开场动画。确认章节/势力/军师或有效存档前，只显示 `grf/ui/loginbg.jpg` 和标题选单；确认后才加载地图、道路、战斗和TALK资源。

## 8. 常用命令

在 `E:/Dragon/web-port` 执行：

```bash
# 生成资源
python tools/parse_sinario.py
python tools/parse_battle.py
python tools/export_battle_rules.py

# 全部focused regression
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

提交前必须对变更文件运行LSP、`lens_diagnostics mode=all`、全量focused suite和`git diff --check`；浏览器冒烟使用全新Playwright会话，避免ESM缓存假回归。

## 9. 重要坑点

1. 状态段地址不等于文件偏移，例如军团状态地址`0x2240`与SAVE文件偏移`0x22C0`不能混用。
2. `BATTLE.MAP`目录项是`[layout, theme]`；实际layout只有0/1/2。
3. 活动军团主将是`+2` byte；`+3`被接敌倒计时/状态复用，不能当u16主将或战型。
4. CBE5脚本块读取对手武将`general[+0x16]`，不是军团UI formation字段。
5. 野战主守方按原版候选选择，不能合并同坐标所有军团或用synthetic city代替。
6. `0x291A`是不能继续行动后的武将去向分派，不等于“退到最近据点”。
7. 没有真实地图对象/墙记录时，不得按战略比例臆造战术城损。
8. TALK、地图和数据生成物必须从解析链修正；Big5校订要保留索引和证据。
9. 渲染和表现辅助不得修改路线、战斗、事件队列、RNG或日历。
10. pi-lens可能自动格式化验证脚本；无关格式diff应定点恢复，不能把噪声混入提交。
11. 工作区可能含用户改动；禁止整体`reset/clean`，先审查相关diff并只恢复明确无关文件。

## 10. 当前主线状态

- NPC战略调度、事件轮、边境反应、外交、道路接敌、战略速算、撤退、破城和灭亡链已闭合到现有KI.EXE/原始数据静态证据。
- 战略消息系统审计已完成：规则消息统一进入GameBar FIFO，提交边界、右键/3秒once、模态等待和reset世代隔离均有focused regression。
- 战术A1C5启动、持续`输入→A426→A065`、六队对象/命令/移动/碰撞/伤害/撤退/结算链已落地；随机平行战术、外交和进言系统已删除。
- 当前没有已知阻塞性的AI或玩法规则缺口。主线进入 **维护、证据增强和新证据驱动的勘误** 阶段。
- 当前HEAD：`b88b703 feat: complete strategic message fifo audit`；本地`main`领先`origin/main`一个提交，工作区干净。
- 非阻塞增强项：DOSBox-X逐帧捕获并与`originaldiff.js`比对；YNSOUND双YM3812寄存器序列/音色验证；INT61五档绝对毫秒测量。
