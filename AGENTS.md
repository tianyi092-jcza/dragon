# AGENTS.md — 臥龍傳 Web 项目记忆

> 维护长期事实、架构、命令、约定与当前主线。先读[全局AGENTS](../AGENTS.md)：安全、原证、审批与自主执行以其为准。
> [journal](docs/checkpoint-journal.md)只记会话过程/失败/验证；SKILL与`re-notes`维护模块规则和原始证据。历史日志不恢复任务或提交授权。

## 1. 项目边界

- 用原生JavaScript ES Modules + Canvas 2D重写1995 DOS《臥龍傳》；无模拟器、框架、构建步骤或npm运行时依赖。完整`web/`由普通静态HTTP服务独立运行，不依赖原版目录或提取工具。
- 仓库`E:/Dragon/web-port`；原程序/运行数据`E:/Dragon/Dragon/`；官方基准`E:/Dragon/原版/`，`上/中/下/后/`为改版库。
- 机制区分实锤/推断/未知，未闭合不补公式；Web产品差异另标，详细结论只维护一处。自动化禁读写真实SAVE和用户游戏存档/profile；测试用内存、mock或新隔离profile。保留共享脏改，commit/push分别需明确授权。

## 2. 当前主线

- **只彻底还原AI，尚未完成**：外交、编成/补员、驻防/出击、行军接敌、战果、占城、撤退、返都、解散及必要的状态/RNG/调度；不扩为字体或完整DOS环境复刻。
- **已接生产**：统一槽泵、固定槽相位/F14、一次性战斗续段/故障hold、快照相位校验、道路ready后装配；道路字段/目标保存保值已局部修正，不代表完整道路机制正确。
- **关键缺口**：原搜索、图memory/城市归属适配及互反校验已有，但**未接生产选路**；源/运行道路仍v1、旧近似算法仍在。下一阶段联动内容校验/编译、加载、图工作区/保存后接`47BB/487B`等，再修42AB续行、flags/节点化、方向与14/20消费者；不能只换权重。详见[AI全链](docs/re-notes-ai-chain.md)和[行军字段矩阵](docs/re-notes-march-pathfinding.md#55-p24字段工程矩阵与冷加载修复非完整道路接线)。
- 战后后续批、完整回归及战役因果仍待验证。“持续战争中全军返都”与“占城后弃守”分别调查，不预设同因。基础内容/世界/开局拆分已落地；编辑器、地图扩容、任意包/世界热切换、多语言不是当前AI前置任务。最新用户请求决定本轮范围。

## 3. 架构与数据流

`原版非存档资料 → 显式离线导入 → Web可编辑源 → 校验/编译资产 → Scenario副本 → 保存守卫/快照 → IndexedDB`

模块路径相对`web/src/`，同组省略重复目录前缀：

| 模块 | 职责 |
| --- | --- |
| `main.js`、`app/startflow.js`、`app/battleflow.js` | App装配、无绘制开局流程、战斗入口/接续；新局与读档共用`loadState` |
| `content/`、`game/world.js`、`worldresources.js` | 内容/章节/修订身份、旧索引映射、Scenario副本、每世界资源实例 |
| `game/navigation/`、`roadgraph.js`、`pathfind.js` | 导航实现与默认世界门面；原搜索尚未进入规则调用链 |
| `game/ai.js`、`weather.js`、`autobattle.js`、`legionscheduler.js` | 战略AI/灾害/接敌战后/速算与逐槽调度 |
| `game/legionphase.js`、`legioncounts.js`、`legioncontinuation.js`、`strategicfailure.js` | 固定槽相位/计数、续段所有权及失败暂停/禁存 |
| `game/clock.js`、`tacticalclock.js`、`battle/original*.js` | 战略/战术预算、权威Session、RNG、VM与结算 |
| `game/savegame.js`、`core/localstore.js` | 快照/恢复、保存守卫、IndexedDB四槽 |
| `game/playerqueries.js`、`legacyrecords.js`；`render/`、`ui/` | 纯玩家查询/字节兼容读取；只读绘制、GameBar/HUD工作流、消息FIFO与StartMenu |

- 逻辑分辨率`640×400`；当前世界`384×256`格、16px图块、192道路节点、128军团槽、24势力槽。尺寸、地址、哨兵、正常调度槽数不可一律换成数组length。
- `web/content/builtin/`为编辑源；`tools/compile_content.py`生成20章模板及地图/道路资产。命名state字段为编辑权威，未知兼容字节保留；不手改`data.json`等生成物掩盖错误。解析纠错先导入新目录比较，再编译。只有一套规则/AI/UI内核。
- 图集/布局、世界对象、道路拓扑分离；`map_tiles_*.png`是派生缓存，贴道路图不产生通路，图块索引仍参与规则。编译预生成不等于跨文件发布事务；详见[内容架构](docs/content-architecture.md)。
- 新局`legions=[]`，保留雨云初态与头部吸引边界；地图对象前16火灾/暴动、后16雨云，不filter压缩。AI/渲染仍用默认世界门面，存档槽尚未迁移为内容身份。
- 正式存档为同源IndexedDB `wolong-web/saves`四槽JSON；sidecar是快照内运行态，不是服务端文件。旧SAVE API/token/lease已废弃，浏览器锁管理单实例。
- **已批准旧档政策**：保全旧档、修正版从新局开始，拒缺相位/不相容档，不猜迁移/双内核。恢复先克隆合并sidecar再校验；phase标记不证明道路字段/单位有效，新增准入门须说明具体缺字段及原消费者，不能只凭phase1标签一刀切拒载。见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- 读档先回标题，空/不相容槽hover/hit-test/click禁用；战斗/待续段/未完成战略交互/装配pending或故障时禁存。先资源ready再build，await后核scenario/world/clock/票据；失败保部分写，不假事务回滚。

## 4. 现行交互与Web产品约定

- 无关闭按钮、羽扇唯一开关、右键逐层回退、子菜单地图锁、空白地图左键无功能、普通对白3秒关闭/type5强制例外，按[全局约定](../AGENTS.md)及[军师UI技能](../.agents/skills/re-ui-advisor-menu/SKILL.md)，不另维护状态表。
- 模态/场景/战斗/装配/鼠标移动hold取并集，不改速度模拟暂停；地图静止满1秒释放鼠标hold。输入锁与物理命中区域分开，锁地图仍识别暴露区域鼠标移动。
- 每RAF最多一个战略步或完整战术帧，不补后台债务；绘图不推进规则/导航/RNG。Canvas backing store仅尺寸/DPR变化时重建；列表右滚、24px表头、`#4a7828`选中，排序绑定原对象。
- 自定军师为`{custom:true,general_idx:null,name,hao,portrait}`；默认军师化身排除普通武将/编成/任官/自动出征候选。统一后继续地图、不播D7END；信赖归零/玩家灭亡仍GAME OVER，不能整体删EndView。
- 系统菜单六行：保存、读取、音效、战略速度、战术速度、退出。音效TYPE1→2→3→4→关闭调CF9音量，不选曲/换SFX；OFF停BGM、不禁PC/FM效果。
- 接战音画共享100ms换帧/200ms发声时钟：首次同步、暂停冻结、结束清理、不补播/升调，不改规则等待或延迟开战。战术表现`TACTICAL_PLAYBACK_RATE=0.5`、低四档等待加倍、最高30Hz、首帧立即；对白3秒或全局右键关闭但不暂停Session，无小地图/右下双箭头。见[战术规则](docs/re-notes-tactical-rules.md)。
- 独立开场在`web/intro/`：原生动画/单次MP3，副标题完全显现或skip后放行弹窗；会话刷新/读档直达终场，显式重启整页，左上覆盖不缩小。音乐隔离、加载与版权纯文本等以[开场维护源](docs/opening-scene.md)为准。

## 5. 重要坑点与详细维护源

- canonical `OriginalBattleRng`仅进程启动RTC播种一次，新局/标题不重播种、读档恢复，禁`Math.random()`兜底；战术先回写同一RNG再续战略，保持输入→A426 VM→A065帧顺序，无输入仍推进。消息返回/RNG不得重播；无真实对象/墙记录不按比例造城损。见[战斗技能](../.agents/skills/re-battle-command/SKILL.md)。
- 每主更新1据点/16军团；每槽到期动作→日结→03尾，再余槽/天气。当前槽退场仍完成尾段；0B/1E保零、03固定槽存留、F14不从live数组重算。generalIdx与slot分开，leader仅显示/兼容，六队原值为权威；不将真实军团合并或替换为synthetic city，插值不改规则坐标。撤退不传送/抹道路，初始化48不等于固定48次等待。见[AI全链P24](docs/re-notes-ai-chain.md#28-p24进行中槽游标写者与缺失相位)及[战后技能](../.agents/skills/re-post-battle/SKILL.md)。
- 已知0A/0C/0E不由`_march`覆盖，清缓存不删残值；校验早于outer reverse/engagement，节点化不清0A/0C，日费读动作后0E。0E为原地址，targetNode现有Web id不因8倍数就解码，也不由20补写14；完整消费者仍待修。原搜索保槽序、字宽、环队列与读写顺序；CF1不一律无路、未知RAM不补零、资产拒绝不伪造KI blocked。见[行军技能](../.agents/skills/re-march-engagement/SKILL.md)。
- 战争关系/势力目标/军团命令分开，清目标/迁都不是停战或返都广播；玩家未完成命令优先，委任不能覆盖。TALK38保城市续段，付款/互俘可能早于拒战，不假回滚。见[外交技能](../.agents/skills/re-domestic-diplomacy/SKILL.md)、[kernel笔记](docs/re-notes-kernel.md)与[消息ABI](docs/re-notes-strategic-message-abi.md)。
- 状态地址不等于SAVE偏移、军团+2/+3不能合u16；地图编号/布局编号不同，MMAP透明有独立mask（索引0可为不透明黑）。格式细节只维护在[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- BGM资产`grf/music/loops/*.flac`是软件OPL3非实机录音；无损不保证循环无缝/减少解码内存。音量、场景所有权与SFX详见[音频](docs/re-notes-audio.md)。部署/版权见[README](README.md)，不从旧日志推定远端状态或资源再分发许可。

## 6. 常用命令

在仓库根执行；先审所选测试/生成器I/O，入口不是本轮执行授权，不自动安装或改全局配置。

```bash
python -m http.server 8321 --directory web  # 前台常驻正常
# 亦可：python tools/webserver.py 8321
unset PYTHONOPTIMIZE                       # 不能让断言失效
export PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1
python -B tools/compile_content.py --output /path/to/new-generated  # 需Pillow；新目录先比较
python -B tools/verify_content_pipeline.py
node tools/verify_content_catalog.mjs
node tools/verify_world_resources.mjs
node tools/verify_start_flow.mjs
node tools/verify_legion_slot_phase.mjs     # focused示例，不代表全量
node tools/verify_legion_slot_battle.mjs
node --test tools/verify_road_field_authority.mjs
node tools/verify_road_cold_load_browser.mjs # 需已有Playwright，可显式PLAYWRIGHT_MODULE
node tools/verify_legion_lifecycle_browser.mjs
node --check web/src/main.js
git diff --check
```

全量先固定入口/依赖/源码并审I/O，再串行执行，不以`verify_*`通配或历史放行当安全证明。浏览器用新profile/本轮自持静态监听，只关闭本轮服务。生成脚本可能清目标目录，勿把共享`dist/`当可删临时目录；其它命令按对应SKILL，只重建涉及资产。

## 7. 分级验证

- **全部变更**：实际diff、受支持变更文件LSP、`lens_diagnostics mode=all`、`git diff --check`；仓库外另查前后差异/空白/路径。工具可能自动格式化，后续编辑先重读。
- **文档/Skill**：链接、规则一致性、围栏/元数据；改加载配置才验证对应cwd发现，不要求无关游戏回归/浏览器。
- **规则/数据/工具**：focused、解析/静态检查及原证复核；共享调度/RNG/存档/跨模块状态改动须全量安全回归，未跑完整批次明列待验证，不拼局部绿测。
- **UI/保存**：新profile流程及console/page/request错误；保存另测守卫、往返、失败路径，只用mock/内存/隔离profile。
- LSP unavailable/inconclusive或缓存沉默不是clean；限定OK不等于native门通过，片段/首批/tick/战役分开陈述。缺工具、失败或覆盖不足如实列出；数字/临时产物/调试过程只进journal，不作永久健康保证。
