# AGENTS.md — 臥龍傳 Web 项目记忆

> 只维护长期项目事实、架构、命令、约定和当前主线。先读[全局AGENTS](../AGENTS.md)：安全、原证、审批与自主执行以其为准。
> [journal](docs/checkpoint-journal.md)记录本轮过程、失败、验证、阻塞和下一步；模块机制与原始证据由相关SKILL/`re-notes`单点维护。日志不是任务或提交授权。

## 1. 项目边界

- 原生JavaScript ES Modules + Canvas 2D重写1995 DOS《臥龍傳》；无模拟器、框架、构建步骤或npm运行时依赖。完整`web/`由静态HTTP服务独立运行，不依赖原版目录或提取工具。
- 仓库`E:/Dragon/web-port`；原程序/运行数据`E:/Dragon/Dragon/`；官方基准`E:/Dragon/原版/`，`上/中/下/后/`为改版库。
- 原机制区分实锤/推断/未知，不凭当前实现、测试或体验补规则；Web产品差异另标。自动化禁读写真实SAVE及用户存档/profile，测试用内存、mock或新隔离profile。保留共享脏改，commit/push分别需明确授权。

## 2. 当前主线

- **全AI逆向尚未完成**：覆盖外交、编成/补员、驻防/出击、行军接敌、战果、占城、撤退、返都、解散及必要状态/RNG/调度。
- **阶段顺序**：先保证原机制、玩法完整及正确存档，再按原生JS/Canvas架构重构独立实现；不提前大规模重写、不删减玩法或用近似兜底。编辑器、扩容、任意世界热切换、多语言和完整DOS环境复刻不是当前前置任务。
- **已接限定域**：detached v2的[487B战后](docs/re-notes-march-pathfinding.md#native-retreat-callers)、[47BB移动/占格](docs/re-notes-march-pathfinding.md#native-movement-callers)、[到达/驻军缓存](docs/re-notes-march-pathfinding.md#native-arrival-callers)、[城市军事/治理/灾害及天气timer](docs/re-notes-march-pathfinding.md#native-city-callers)、[成功编成/state9重分/严格6FD2/唯一固定槽保存](docs/re-notes-march-pathfinding.md#native-formation-callers)。5030捕获的同号权威槽读取及29D4缺值门已补齐；不是完整29C3或灭亡链认证。
- **运行门与缺口**：默认源/运行道路仍v1，正常App仍拒v2；旧近似选路仍在。消息返回、去向/解散、完整初始化与占格生命周期、未知槽/别名/外栈、天气后继及日期/月界尚未整体闭合。“持续战争中全军返都”和“占城后弃守”分别调查，不预设同因。
- 具体边界见[AI全链](docs/re-notes-ai-chain.md)、[行军字段矩阵](docs/re-notes-march-pathfinding.md#55-p24字段工程矩阵与冷加载修复非完整道路接线)；批次成绩只进journal，不是永久健康保证。最新用户请求决定本轮范围。

## 3. 架构与数据流

`原版非存档资料 → 显式离线导入 → Web可编辑源 → 校验/编译资产 → Scenario副本 → 保存守卫/快照 → IndexedDB`

模块路径相对`web/src/`，同组省略重复目录前缀：

| 模块 | 职责 |
| --- | --- |
| `main.js`、`app/startflow.js`、`app/battleflow.js` | App装配、开局、战斗入口/接续；新局与读档共用`loadState` |
| `content/`、`game/world.js`、`worldresources.js` | 内容/章节/修订身份、旧索引映射、Scenario副本及每世界资源实例 |
| `game/navigation/`、`roadgraph.js`、`pathfind.js` | 导航与默认门面；detached原生规则和生产v1边界 |
| `game/ai.js`、`weather.js`、`autobattle.js`、`legionscheduler.js` | 战略AI、灾害、接敌战后、速算与逐槽调度 |
| `game/legionphase.js`、`legioncounts.js`、`nativelegions.js`、`legioncontinuation.js`、`strategicfailure.js` | 固定槽相位/计数、唯一记录表、续段所有权、失败暂停/禁存 |
| `game/clock.js`、`tacticalclock.js`、`battle/original*.js` | 战略/战术预算、权威Session、RNG、VM与结算 |
| `game/savegame.js`、`core/localstore.js` | 快照/恢复、保存守卫、IndexedDB四槽 |
| `game/playerqueries.js`、`legacyrecords.js`；`render/`、`ui/` | 纯查询/兼容读取；只读绘制、GameBar/HUD、消息FIFO与StartMenu |

- 逻辑分辨率`640×400`；当前世界`384×256`格、16px图块、192道路节点、128军团槽、24势力槽。尺寸、地址、哨兵及正常调度槽数不能一律替换成数组length。
- `web/content/builtin/`为编辑源，`tools/compile_content.py`生成20章模板及地图/道路资产。命名state字段为权威，未知兼容字节保留；不手改生成物掩盖错误。解析纠错先导入新目录比较，再编译；只有一套规则/AI/UI内核。
- 图集/布局、世界对象、道路拓扑分离；`map_tiles_*.png`是派生缓存，贴道路图不产生通路，图块索引仍参与规则。编译预生成不等于跨文件发布事务，见[内容架构](docs/content-architecture.md)。
- 当前新局`legions=[]`，保留雨云初态与头部吸引边界；地图对象前16火灾/暴动、后16雨云，不filter压缩。native稀疏表的缺槽/字段是未知，不能从空live数组自动造零表；显式初始化另有来源合同。
- 正式存档是同源IndexedDB `wolong-web/saves`四槽JSON；sidecar在快照内，不是服务端文件。旧SAVE API/token/lease已废弃，浏览器锁管理单实例。
- **现行存档政策（用户产品决定）**：用户确认无需保留旧Web存档，允许覆盖旧格式及清理空槽；兼容、迁移与保全旧档不再是开发约束。新格式必须完整保存规则状态/RNG/调度、正确恢复接续，事务失败不报成功。现有无metadata且phase有效的v1兼容路径只是实施现状，不是长期保留要求；相关变更中定点处理，不因此批量清库或访问真实SAVE/profile。见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- 读档先回标题；空/不相容槽hover/hit-test/click禁用。恢复先克隆合并sidecar再校验身份/字段，版本标签不能代替完整性。资源ready并完成detached验证后才安装，await后核scenario/world/clock/票据；预检失败不改live，提交后失败保部分写并hold/禁存，不假事务回滚。战斗、待续段、未完成交互/装配/现场或故障均禁存，见[装配合同](docs/re-notes-march-pathfinding.md#310-p24正式装配与保存身份准入web工程生产仍限v1)。

## 4. 现行交互与Web产品约定

- 无关闭按钮、羽扇唯一开关、右键逐层回退、子菜单地图锁、空白地图左键无功能、普通对白3秒关闭/type5强制例外，按[全局约定](../AGENTS.md)及[军师UI技能](../.agents/skills/re-ui-advisor-menu/SKILL.md)，不复制状态表。
- 各模态/场景/战斗/装配/鼠标hold取并集，不改速度模拟暂停；地图静止满1秒释放鼠标hold。输入锁与物理命中区域分开，锁地图仍识别暴露区域鼠标移动。
- 每RAF最多一个战略步或完整战术帧，不补后台债务；绘图不推进规则/导航/RNG。Canvas backing store仅尺寸/DPR变化时重建；列表右滚、24px表头、`#4a7828`选中，排序绑定原对象。
- 自定军师为`{custom:true,general_idx:null,name,hao,portrait}`；默认军师化身排除普通武将/编成/任官/自动出征候选。统一后继续地图、不播D7END；信赖归零/玩家灭亡仍GAME OVER，不能整体删EndView。
- 系统菜单：保存、读取、音效、战略速度、战术速度、退出。音效TYPE1→2→3→4→关闭调CF9音量，不选曲/换SFX；OFF停BGM、不禁PC/FM效果。
- 接战表现共享100ms换帧/200ms发声，首次同步、暂停冻结、结束清理，不补播/升调或改规则等待。战术`TACTICAL_PLAYBACK_RATE=0.5`，低四档等待加倍、最高30Hz、首帧立即；对白3秒或全局右键关闭但不暂停Session，无小地图/右下双箭头。详见[战术规则](docs/re-notes-tactical-rules.md)。
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

- 全量先固定入口、依赖与源码并审I/O，再串行执行；不以`verify_*`通配或历史放行当安全证明。浏览器用新profile、本轮自持监听，只关闭自有服务。生成器可能清目标目录，勿将共享`dist/`当临时目录。
- 工具日志显式UTF8；机器解析测试时固定reporter。Git退出码与stdout/stderr分开保存，`diff --check`的换行warning不等于失败；状态比较用stdout，不改全局换行配置来压警告。
- 子进程环境用必要白名单，日志不转储完整环境/凭据；分享前脱敏。测试通过只绑定实测SHA，任何后续漂移先核差异再重验，不凭通知推断来源。

## 7. 分级验证

- **全部变更**：实际diff、支持的变更文件LSP、`lens_diagnostics mode=all`、`git diff --check`；仓库外另查前后差异/路径。工具可能自动格式化，后续编辑先重读。
- **文档/Skill**：链接、规则一致性、围栏/元数据；加载配置变化才验证对应cwd发现，不跑无关游戏/浏览器回归。
- **规则/数据/工具**：focused、解析/静态检查及原证复核；共享调度/RNG/存档/跨模块状态改动须完整安全回归，不能拼局部绿测。
- **UI/保存**：新profile流程及console/page/request错误；保存另测守卫、往返、事务失败，仅用隔离状态。
- unavailable/inconclusive或缓存沉默不是LSP clean；静态核字节、同引擎往返、首批和完整战役证据分开。缺工具、失败、覆盖不足如实列明；批次数字、临时路径、调试过程只进journal。
