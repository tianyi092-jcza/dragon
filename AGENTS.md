# AGENTS.md — 臥龍傳 Web 项目记忆

> 只维护长期项目事实、架构、命令、约定和当前主线。先读[全局AGENTS](../AGENTS.md)：安全、原证、审批与自主执行以其为准。
> [journal](docs/checkpoint-journal.md)记录本轮过程、失败、验证、阻塞和下一步；模块机制与原始证据由相关SKILL/`re-notes`单点维护。日志不是任务或提交授权。

## 1. 项目边界

- 原生JavaScript ES Modules + Canvas 2D重写1995 DOS《臥龍傳》；无模拟器、框架、构建步骤或npm运行时依赖。完整`web/`由静态HTTP服务独立运行，不依赖原版目录或提取工具。
- 仓库`E:/Dragon/web-port`；原程序/运行数据`E:/Dragon/Dragon/`；官方基准`E:/Dragon/原版/`，`上/中/下/后/`为改版库。
- 原机制区分实锤/推断/未知，不凭当前实现、测试或体验补规则；Web产品差异另标。自动化禁读写真实SAVE及用户存档/profile，测试用内存、mock或新隔离profile。保留共享脏改，commit/push分别需明确授权。

## 2. 当前主线

- **全AI逆向仍是主线且尚未完成**：先闭合初始化、财政/外交、编成/补员、调度、行军接敌、战斗、战后、事件、日期与存档恢复，再做架构重构；不以近似规则、删玩法或提前切默认路径换取表面可玩。
- **已建立的严格骨架**：固定军团/势力/外交/事件/政策原始表与JSON恢复合同；有限编成、移动、野战、攻城、去向、占城、天气和日期链；固定槽月结已接至`53A6..53BD`政策切换。详细边界分别见[AI全链](docs/re-notes-ai-chain.md)、[行军](docs/re-notes-march-pathfinding.md)、[战后](docs/re-notes-legion-fate.md)、[财政](docs/re-notes-ai-fiscal.md)和[外交](docs/re-notes-ai-diplomacy.md)。这些均为限定域，不等于完整原生战役。
- **当前接缝**（明细与证据根见[journal §2/§5](docs/checkpoint-journal.md)，机制正文只留各`re-notes`/SKILL）：
  - 事件泵type1–8全类放行（type1 P25、type2/3 NPC+玩家决定 P26/P27、type4–7 P28、type8外交官径+玩家径 P29）、type9–13有限域、type1旧目标22..35别名（P30）；FFFF候选别名门（P34）、`3094`与4064外栈读实锤工程边界（P34/P39）。
  - type10直接生产路径穷尽无0x0A（P31）；`8810`/`5E80`零规则写零RNG审计+463E/40D7放行（P32）；月末585F deferred合同、v1 recruit系native禁用差异候选（P33）；进言链C07+迁都33FD（P35/P38，6E8F留C08）。
  - 1D0B统一胜利门D2A不变式（P36）；生产native城记录挂载（P37）；占格平面/C18 fresh初始化+native合成（P40）；43D3 faction域（P41）；7FB4立即命令入口核对（P42）。
  - 下一步：C03槽到期分派已结（P44）→ C12灭亡4FCE扫描+resume入口已接（P45/P46）→ C11-G1F调用者/战术退出帧/城壁/开场音/退出审计/泵尾/保存恢复已闭（P47–P53）→ C09消息返回已接（P54–P55）→ C15审阅/裁决已交付（P54/P56）→ v2候选重建（P57）→ 路由翻转批准（P60）→ 生产v1删除G1–G8（P62–P69/P76）→ 原生覆盖nREPLAY/nDELEG/nBLOCKER/nCONTACT/nRESUME/nP06（P70–P75）→ C15大门翻转批准（P78，门已翻）→ 门后延续G6/H1–H5/AL围栏全闭（P79–P86；H4-(3c)为非规则影响有界围栏）。未知处保已提交前缀并hold/禁存。
- **准入（门后现状）**：fresh装配默认v2，生产零v1残留；v1存档路径已退役删除，不兼容槽三路禁用。批次验证数字只写[journal](docs/checkpoint-journal.md)，不当作永久健康保证。

## 3. 架构与数据流

`原版非存档资料 → 显式离线导入 → Web可编辑源 → 校验/编译资产 → Scenario副本 → 保存守卫/快照 → IndexedDB`

模块路径相对`web/src/`，同组省略重复目录前缀：

| 模块 | 职责 |
| --- | --- |
| `main.js`、`app/startflow.js`、`app/battleflow.js` | App装配、开局、战斗入口/接续；新局与读档共用`loadState` |
| `content/`、`game/world.js`、`worldresources.js` | 内容/章节/修订身份、旧索引映射、Scenario副本及每世界资源实例 |
| `game/navigation/` | v2原生导航基建（图记录与地形保留；Dijkstra实现与`findPath`门面导出已删，P67/P69） |
| `game/ai.js`、`weather.js`、`autobattle.js`、`legionscheduler.js` | 战略AI、灾害、接敌战后、速算与逐槽调度 |
| `game/legionphase.js`、`legioncounts.js`、`nativelegions.js`、`nativefactions.js`、`nativediplomacy.js`、`nativeevents.js`、`nativemonthlypolicy.js`、`legioncontinuation.js`、`strategicfailure.js` | 固定槽/原始表、续段所有权、严格恢复、失败暂停/禁存 |
| `game/clock.js`、`tacticalclock.js`、`battle/original*.js` | 战略/战术预算、权威Session、RNG、VM与结算 |
| `game/savegame.js`、`core/saverepository.js`、`core/indexeddbsavebackend.js`、`core/localstore.js` | 快照/守卫与存储分离；多档仓储、单档/摘要事务、默认组合门面 |
| `game/playerqueries.js`、`legacyrecords.js`；`render/`、`ui/` | 纯查询/兼容读取；只读绘制、GameBar/HUD、消息FIFO与StartMenu |

- 逻辑分辨率`640×400`；当前世界`384×256`格、16px图块、192道路节点。原运行域含128军团记录、22个40h势力记录、24×24外交矩阵及256×4B事件轮；各循环的排除槽、地址和哨兵不能一律替换成数组length。
- `web/content/builtin/`为编辑源，`tools/compile_content.py`生成20章模板及地图/道路资产。命名state字段为权威，未知兼容字节保留；不手改生成物掩盖错误。解析纠错先导入新目录比较，再编译；只有一套规则/AI/UI内核。
- 用户批准的Web扩展保持单一规则/AI内核与现有规则容量；基础见[第一阶段](docs/web-refactor-phase1.md)，多存档、独立管理/受限编辑器及地图分块见[第二阶段](docs/web-refactor-phase2.md)。这是非机制重构授权，不宣称剩余逆向已全部完成；不授权超过192据点或改变调度/公式。
- 图集/布局、世界对象、道路拓扑分离；`map_tiles_*.png`是派生缓存，贴道路图不产生通路，图块索引仍参与规则。编译预生成不等于跨文件发布事务，见[内容架构](docs/content-architecture.md)。
- 当前新局`legions=[]`，保留雨云初态与头部吸引边界；地图对象前16火灾/暴动、后16雨云，不filter压缩。native稀疏表的缺槽/字段是未知，不能从空live数组自动造零表；显式初始化另有来源合同。
- 正式存档是同源IndexedDB `wolong-web/saves`的独立档案和摘要目录，不再固定四档；sidecar在快照内，不是服务端文件。数据结构、原子写入、JSON备份与容量边界见[第二阶段](docs/web-refactor-phase2.md)。旧SAVE API/token/lease已废弃，浏览器锁管理游戏单实例。
- **现行存档政策（用户产品决定）**：用户确认无需保留旧Web存档，允许覆盖旧格式及清理空槽；兼容、迁移与保全旧档不再是开发约束。新格式必须完整保存规则状态/RNG/调度、正确恢复接续，事务失败不报成功。现有无metadata旧档按不相容槽禁用；v1装配臂（P65/P76）与序列化/compat读（P66/P79）已删除。相关变更中定点处理，不因此批量清库或访问真实SAVE/profile。见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- 读档先回标题；空/不相容槽hover/hit-test/click禁用。恢复先克隆合并sidecar再校验身份/字段，版本标签不能代替完整性。资源ready并完成detached验证后才安装，await后核scenario/world/clock/票据；预检失败不改live，提交后失败保部分写并hold/禁存，不假事务回滚。战斗、待续段、未完成交互/装配/现场或故障均禁存，见[装配合同](docs/re-notes-march-pathfinding.md#310-p24正式装配与保存身份准入web工程生产仍限v1)。

## 4. 现行交互与Web产品约定

- 无关闭按钮、羽扇唯一开关、右键逐层回退、子菜单地图锁、空白地图左键无功能、普通对白3秒关闭/type5强制例外，按[全局约定](../AGENTS.md)及[军师UI技能](../.agents/skills/re-ui-advisor-menu/SKILL.md)，不复制状态表。
- 各模态/场景/战斗/装配/鼠标hold取并集，不改速度模拟暂停；地图静止满1秒释放鼠标hold。输入锁与物理命中区域分开，锁地图仍识别暴露区域鼠标移动。
- 战略每RAF最多6次完整主更新、每次检查hold；战术仍最多一个完整帧，均不补后台债务。战略五档为60/35/20/10/3.125ms；行军按8×movePeriod更新插值，城/军团共用显示锚点，详见[行军表现](docs/march-presentation-fixes.md)。绘图不推进规则/导航/RNG。Canvas backing store仅尺寸/DPR变化时重建；列表右滚、24px表头、`#4a7828`选中，排序绑定原对象。
- 自定军师为`{custom:true,general_idx:null,name,hao,portrait}`；默认军师化身排除普通武将/编成/任官/自动出征候选。统一后继续地图、不播D7END；信赖归零/玩家灭亡仍GAME OVER，不能整体删EndView。
- 系统菜单：保存、读取、音效、战略速度、战术速度、退出。音效TYPE1→2→3→4→关闭调CF9音量，不选曲/换SFX；OFF停BGM、不禁PC/FM效果。
- 接战表现共享30ms换帧/60ms发声，每段连续共享接触最多五次请求；首次同步、暂停冻结、结束清理，不补播/升调或改规则等待。历史响满全程政策由[现行修正](docs/march-presentation-fixes.md)取代。战术`TACTICAL_PLAYBACK_RATE=0.5`，低四档等待加倍、最高30Hz、首帧立即；对白3秒或全局右键关闭但不暂停Session，无小地图/右下双箭头。详见[战术规则](docs/re-notes-tactical-rules.md)。
- 独立开场`web/intro/`：原生动画/单次MP3，副标题显现或skip后放行弹窗；会话刷新/读档直达终场，显式重启整页。左上覆盖不缩小、音乐隔离等见[开场维护源](docs/opening-scene.md)。

## 5. 重要坑点与详细维护源

- canonical `OriginalBattleRng`仅进程启动RTC播种一次，新局/标题不重播种、读档恢复；禁`Math.random()`兜底。战术先回写同一RNG再续战略，输入→A426 VM→A065帧，无输入仍推进。消息/RNG不重播，无真实墙记录不按比例造城损，见[战斗技能](../.agents/skills/re-battle-command/SKILL.md)。
- 每主更新1据点/16军团；到期动作→日结→03尾→余槽/天气。当前槽退场仍完成尾段；0B/1E保零，03独立固定槽存留，F14不从live数组重算。native表唯一持有规则记录，live/delayed只是同对象视图，不能覆盖表或隐去待消费的inactive/未知槽。generalIdx、slot与leader不可混用；5030按武将号查同号槽，不按L02。见[编成/固定槽](docs/re-notes-march-pathfinding.md#native-formation-callers)。
- 六队原值为权威，不合并军团或用synthetic city替代真实守军；战前BP列表不能事后按active重建。双方战果先提交，再攻方474A、守方474A；失败保前缀，不catch成正常CF/补尾。撤退不传送，初值48不等于固定48次等待，见[战后技能](../.agents/skills/re-post-battle/SKILL.md)。
- 已知0A/0C/0E不由`_march`覆盖，清缓存/节点化不删残值；校验早于outer reverse/engagement，日费读动作后0E。0E为原地址，targetNode现有Web id不因8倍数就解码，也不由20补14。原搜索保槽序/字宽/读写序，CF1不一律无路、未知RAM不补零、工程拒绝不伪造KI blocked，见[行军技能](../.agents/skills/re-march-engagement/SKILL.md)。
- 战争关系/势力目标/军团命令分开，迁都/清目标不是停战或返都广播；玩家未完成命令优先，委任不能覆盖。TALK38保城市续段，付款/互俘可能早于拒战，不假回滚，见[外交技能](../.agents/skills/re-domestic-diplomacy/SKILL.md)及[消息ABI](docs/re-notes-strategic-message-abi.md)。
- 状态地址不等于SAVE偏移；军团+2/+3不能合u16；兵力的内部十人单位与显示人数分开；地图目录号不等于布局号；MMAP透明有独立mask，索引0可为不透明黑。JSON可丢undefined、把非有限数转null，不能用structuredClone测试替代真实JSON往返，见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- BGM `grf/music/loops/*.flac`为软件OPL3而非实机录音，无损不保证无缝或低解码内存，见[音频](docs/re-notes-audio.md)。部署/版权见[README](README.md)，旧日志不证明当前远端状态或再分发许可。

## 6. 常用命令

仓库根执行，先审所选测试/生成器I/O；以下不是安装、部署或扩大任务范围的授权。

```bash
python -m http.server 8321 --directory web  # 前台常驻正常；亦可用tools/webserver.py
unset PYTHONOPTIMIZE                       # 保证Python断言有效
export PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1
python -B tools/compile_content.py --output /path/to/new-generated  # 需Pillow；先比较新目录
python -B tools/verify_content_pipeline.py
node tools/verify_content_catalog.mjs
node tools/verify_world_resources.mjs
node tools/verify_start_flow.mjs
node tools/verify_legion_slot_phase.mjs
node tools/verify_legion_slot_battle.mjs
node --test --test-reporter=tap tools/verify_native_formation.mjs  # focused，不代表全量
node --test tools/verify_road_field_authority.mjs
node tools/verify_road_cold_load_browser.mjs # 需已有Playwright，可显式PLAYWRIGHT_MODULE
node tools/verify_legion_lifecycle_browser.mjs
node --check web/src/main.js
git diff --check
```

### 6.1 Jev开发期辅助分流（适用时自动调用）

- Jev仅是开发期advisory，不是原版机制证据、测试oracle、代码审阅替代品或发布门禁；其结果不得把推断升级为实锤，也不得单独决定实现、测试期望或放行。
- 开发代理必须主动判断适用性，不等用户逐次提醒：已有实际diff且变更跨越规则/存档状态/时序或RNG/UI或浏览器/工具或测试等多个风险域，或验证方案仍有明显遗漏风险时，使用`change`；测试失败在确定性日志、退出码和直接诊断后仍存在多种合理归因，或需要决定下一验证lane时，使用`failure`。
- 逆向中先用反汇编、xref、读写扫描、原始数据或受控运行态观测建立事实；当仍有两个以上合理调查方向、关键证据缺口不明确，或需要在静态闭包与受控trace等探针之间排序时，必须自动使用`reverse-triage`。输入只能是人工整理的最小证据包，分列来源、已确认事实、候选解释、未知边界和可执行探针；禁止发送原始二进制、整段反汇编或大型trace。若下一步已由确定性证据唯一确定则直接执行，不额外调用。
- 调用顺序固定为：构造当前问题所需的最小文本 → 运行不联网preview并检查最终脱敏state → 确认不含禁发数据且`TYPESAFE_API_KEY`可用后自动增加`--send`。上述适用范围内的安全调用已获持续授权，无需每次重复询问；缺key、网络失败、限流或输入不宜外发时跳过并在交付中说明，不阻塞权威验证。
- 纯文档、显然的语法/导入错误、已由确定性证据定位的问题，以及地址、字宽、栈、公式、RNG或汇编语义的计算本身不调用。严禁发送原版/改版资源、真实存档或profile、凭据/Cookie/个人信息、私密issue、未经审阅的完整日志或大段无关源码；Jev输出不得直接作为shell参数、路径、选择器或自动改码指令。
- 命令：`node tools/jev_assess.mjs <change|failure|reverse-triage> --input <file|->`先preview，合格后同命令加`--send`。详细输入模板、边界和输出解释见[集成文档](docs/jev-integration.md)。

- 全量先固定入口、依赖与源码并审I/O，再串行执行；不以`verify_*`通配或历史放行当安全证明。浏览器用新profile、本轮自持监听，只关闭自有服务。生成器可能清目标目录，勿将共享`dist/`当临时目录。
- 工具日志显式UTF8；机器解析测试时固定reporter。Git退出码与stdout/stderr分开保存，`diff --check`的换行warning不等于失败；状态比较用stdout，不改全局换行配置来压警告。
- 子进程环境用必要白名单，日志不转储完整环境/凭据；分享前脱敏。测试通过只绑定实测SHA，任何后续漂移先核差异再重验，不凭通知推断来源。

## 7. 分级验证

- **全部变更**：实际diff、支持的变更文件LSP、`lens_diagnostics mode=all`、`git diff --check`；仓库外另查前后差异/路径。工具可能自动格式化，后续编辑先重读。
- **文档/Skill**：链接、规则一致性、围栏/元数据；加载配置变化才验证对应cwd发现，不跑无关游戏/浏览器回归。
- **规则/数据/工具**：focused、解析/静态检查及原证复核；共享调度/RNG/存档/跨模块状态改动须完整安全回归，不能拼局部绿测。
- **UI/保存**：新profile流程及console/page/request错误；保存另测守卫、往返、事务失败，仅用隔离状态。
- unavailable/inconclusive或缓存沉默不是LSP clean；静态核字节、同引擎往返、首批和完整战役证据分开。缺工具、失败、覆盖不足如实列明；批次数字、临时路径、调试过程只进journal。
