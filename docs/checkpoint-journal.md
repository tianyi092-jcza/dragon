# Checkpoint Journal

> 当前开发轮次的交接记录，不是长期指令、机制证明或任务授权。[项目记忆](../AGENTS.md)只维护长期事实、架构、命令、约定与当前主线；机制和原始证据由相关`re-notes`及Skills单点维护。日志不是任务或提交授权。

## 道路对齐、行军插值、五响与战略提速（本轮）

- 用户四项报障已本地修正，详细原证/原因/产品边界见[行军表现修正](march-presentation-fixes.md)。统一城标/军团显示锚点，插值从8更新改为8×movePeriod；五档墙钟间隔减半、RAF上限6；接战30ms换帧/60ms发声且连续共享接触最多五次请求。原规则、RNG、道路点、到达时机及战术速度不改；原始6FD2/25A3窗口确认六队全骑周期2、其余3（空队兵种也算）。视觉绝对美术中心与主观快慢仍非单元测试能够认证。
- 独立证据根`C:/Users/fczll/AppData/Local/Temp/dragon-march-presentation/`。复用已审固定入口/I/O白名单与Node/Python/browser权限守卫，从首入口非浏览器201/201、fresh浏览器24/24全部通过。五档真实RAF/Canvas/WebAudio均恰好五次请求，五响后接触画面仍正常、暂停取消守恒；横纵双向/斜向、周期2/3、到城/驻止锚点连续测试通过。旧规则/20章快照/槽RNG基线仍通过。非浏览器manifest仅`.codegraph/daemon.log`后台日志变动，未作为源码变化隐藏；源码与浏览器快照漂移另由checks核对。
- 主动LSP九个JS文件：无error报告，ai.js超5000行上限、六项push-only inconclusive，其余仅测试loopback URL/日志及await括号提示。不能称全部clean；Node语法与实际执行补充验证。文档/外部Skills同步标废旧节拍和方向补偿摘要，详细维护源单列；Jev审1440B最小preview后change调用成功，仅advisory，不含源码/资源/存档/凭据。
- 保留前两阶段、3F47及他方未提交成果；未stage/commit/push、未使用子代理，未访问真实SAVE或用户profile。完整回归之后只补文档记录与审计，不用历史通过冒充本轮结果。

## 3F47 读档能力漏传修复（继承前两阶段未提交成果）

- 用户要求分析并解决前两阶段的3F47失败。根因及可复核原指令统一记录在[行军§3.13](re-notes-march-pathfinding.md#313-p24detached到达命令与存储city18缓存)：是App读档装配漏传三个已保存的能力状态，不是原版移动公式未知或武将能力不足。
- `main.js`仅补`loadSave → loadState → prepareScenario`的`movementMemory/terrainMemory/cityCache`参数；不改保存格式、原适配器、AI、UI、RNG、调度与fail-closed门。生命周期浏览器测试新增三项非默认RAM哨兵，证明保存→标题→加载保值，而非重新初始化掩盖异常。前两阶段成果和他方Jev文件保留；未commit/push，未使用子代理。
- 本轮独立证据根`C:/Users/fczll/AppData/Local/Temp/dragon-3f47/`，复核并复用显式入口/依赖白名单、Node/Python权限守卫及fresh浏览器profile；未覆盖旧轮证据。`full-2`从首入口201/201、DRIFT[]；`browser-2`从首入口24/24全部通过，原`verify_legion_lifecycle_browser.mjs`和`verify_opening_browser.mjs`均通过，未删除错误断言。名称full-2/browser-2沿用runner布局，不是第二阶段旧结果。两阶段characterization基线仍通过；不据这些有限回归宣称完整原版战役已认证。
- 主动LSP：main仅一个既有async建议hint，生命周期测试push-only inconclusive，Markdown服务unavailable；不称全部clean。Node语法与实际运行补充验证。Jev按授权审阅1067B最小文字preview后change调用成功，仅状态恢复风险advisory，不发送资源、源码、存档或凭据。
- 本条晚于完整测试，仅记录本轮证据；此前两阶段的失败条目保留为历史，当前已由本轮闭合。

## Web 扩展第二阶段（历史批次，继承第一阶段未提交成果）

- 用户要求继续第二阶段；实现与使用说明唯一维护于[第二阶段设计](web-refactor-phase2.md)。保留原生ESM/Canvas与单一规则/AI内核，未改变规则容量、RNG、调度或未覆盖边界；未commit/push，未使用子代理。他方Jev文件和第一阶段成果保留。
- 已实现：多档/稳定档号，独立正文与原子摘要目录，旧bundle同事务复制且不删除；App单档保存/新档事务分配，原窗口滚动列表；独立`saves.html`摘要/JSON导入导出（detached准入、不覆盖、不热载）；`editor.html`原容量地图单格/据点六项数值编辑、撤销及hash绑定补丁；离线新目录校验发布工具；四季小图集、有界分块及非整数DPR单季采样回退。限制和启动仍全读快照的成本已明示，不宣传无限物理容量、任意世界编辑或实测FPS提升。
- 资料同步：AGENTS/README/部署说明与架构历史提示；仓库外`E:/Dragon/.agents/skills/re-data-formats/SKILL.md`三处定点更新Web现状/历史v1说明，无新的原机制结论。
- 证据根：`C:/Users/fczll/AppData/Local/Temp/dragon-refactor-phase2/`。复用已审白名单与读写/网络/profile guard，补新入口和依赖；`full-2/`、`browser-2/`为最终完整单轮，`checks.json`绑定源码与结果。`full-1/`、`browser-1/`是增加实际App保存守卫专项和编辑页并发输入禁用之前的完整轮次，未拼接放行。
- 非浏览器最终201/201通过，`DRIFT []`；原20章fresh/JSON恢复快照、六资源hash、128槽/RNG轨迹不变。20个阶段二JS文件Node语法通过、3个Python文件AST解析通过。纯内存mock验证读写别名隔离、40档、摘要不读正文、单档仅两key写入、request成功后abort/error与同步throw保旧、旧bundle复制；编辑补丁验证隔离编译、compatibility/道路保留，路径逃逸/旧hash/超容量/未知字段拒绝。
- 浏览器最终24项：22通过、2失败，**不标全绿**。新增专项真实IDB并发8次新建不碰撞、实际App保存守卫/单档RNG、坏导入不写库、标题准入/滚动命中、管理页下载再导入、编辑页修改/撤销/补丁下载均通过；四季×DPR 1/1.25/2×四视口48组逐像素比较通过。六装配/保存/读档案例、隔离IDB abort保旧专项均通过。
- 两项失败仍为`verify_legion_lifecycle_browser.mjs`与`verify_opening_browser.mjs`的`Uncovered movement capability at 3F47`，与第一阶段及其061e221改前隔离复现同一报错/调用链。本轮没有删除断言、放宽能力门或改规则；根因仍需独立闭合，不能称完整战役/完整浏览器放行。
- 主动LSP已尝试阶段二25个代码/HTML文件并复查修改文件；无error返回，但多数push-only inconclusive，GameBar 8625行超过5000行上限；Markdown LSP unavailable，不能称LSP全clean。最终`mode=all`为11 warning/6 hint：测试assert及预期异常pass、经source_path约束的路径sink、内部布尔分支与风格提示；Python guard已确认断言开启。语法、实际测试和文档链接检查补充覆盖，不替代LSP。
- Jev按已授权流程先审1293B最小脱敏preview再调用change，persistence_state主关注，建议状态往返/浏览器验证；仅advisory，无源码/资源/档案/凭据外发。
- 过程发现：实验1.5倍缩放和非整数DPR下直接分块有近邻采样差异。前者非当前产品功能（原zoomAt固定1:1），明确拒绝；后者属于现有显示环境，修为单季整图采样回退后48组通过，不以删现行DPR覆盖解决问题。旧本地mock原本提前发transaction complete，被替换为实际等待全部请求的内存协议夹具；事务失败断言未削弱。
- 最终浏览器817文件快照前后/与当前源码均零漂移；`git diff --check`通过（仅既有LF/CRLF提示），文档链接无缺失。本条晚于完整回归，仅记录证据；未部署、未访问真实存档/profile。

## Web 扩展基础第一阶段（历史批次，参考 061e221）

- 用户批准按推荐顺序开始第一阶段；实现与职责合同见[第一阶段设计](web-refactor-phase1.md)。不扩192据点/四存档、不改AI/UI/规则与未覆盖边界，不提交或推送。他方Jev四项untracked保留未改。
- 已实现：规则实现版本标识；改前20章 fresh/JSON恢复快照摘要与16批128槽/RNG轨迹基准；快照/资源/派生状态职责表；可注入四槽仓储与IDB事务适配器；App仓储注入、世界四季图入口及MapView世界定义注入、晚到图像world所有权检查。存档schema/数据库名/store/key不变。
- 验证根：`C:/Users/fczll/AppData/Local/Temp/dragon-refactor-phase1/`；入口/I/O审计、只读白名单与权限guard、源摘要、逐项退出码见`full-1/`、`browser-1/`；结果汇总`checks.json`。本条晚于测试，非生产文件变更；产品与浏览器快照逐文件相同。
- 非浏览器：200/200入口通过，完整单轮 `DRIFT []`；JS语法15/15。对照基准通过；mock提交/abort/error/同步throw、数据别名隔离与world懒加载/独立缓存通过。全新浏览器真实IDB事务abort保旧档、正式保存守卫/往返/标题准入、旧world图晚到拒写专项通过。
- 浏览器完整单轮23项：21通过、2失败，**不标全绿**。`verify_legion_lifecycle_browser.mjs`、`verify_opening_browser.mjs`均报 `Uncovered movement capability at 3F47`；在`browser-reference/`替换为`061e221`的改前生产源码后，两项分别复现同一报错。此为既有失败，未为本次重构放宽规则/屏蔽错误。根因未闭合；后续应独立追查恢复后的movement能力与首个战略tick。本阶段工程改动已落地，完整浏览器放行仍受此项阻塞。
- LSP主动查15个JS文件无error，2项确认clean、5项仅hint/辅助warning、8项push-only未确认，不能称全体LSP clean；新增测试中的console输出/await括号提示保留（测试日志非产品logger，括号不可删）。最终session `mode=all`无error、3条测试日志warning和9条hint。Markdown LSP四项unavailable，JSON基准5842行超过LSP 5000行上限；均不称LSP clean。Markdown结构检查通过，基准已由Node实际解析比对。
- Jev：已审最小脱敏preview后调用`change`，结果以persistence_state为主，建议状态往返与fresh浏览器验证；仅advisory，未作规则oracle。输入不含源码、资源、存档或凭据。
- 过程：首次baseline错误地要求fresh/restore快照对象完全相同，发现既有sidecar默认值具体化后改为分别冻结两种表示，未改生产快照；两处旧接口形状断言随资源API变更同步。首次非浏览器STOP轮留`failed-first-*`后首入口重跑；两次浏览器STOP轮保留后，从首入口完整收集全部23项失败仍保非零。临时browser依赖扫描误把页面import当host路径、汇总脚本GBK解码失败均已修正/以UTF8重跑，没有改产品绕过。

## 1. 当前主线状态

- **C15大门已翻**（P78，用户明确批准，verdict记ai-chain C15行）：fresh装配默认v2，生产侧v1零残留（G1–G8删除，P62–P69/P76），6原生覆盖gap全闭（P70–P75）。
- **门后延续全闭**（P79–P86，门后延续目标已标complete）：G6 compat读删除；AL=0x93围栏终局；D游标初值；H1战术域归属；H2信赖读；H4尾项——(1)选择器返回覆盖、(2)原版不可达（opening-ABORTED标签退役）、(3a)(3b)覆盖，(3c)60C8封为**非规则影响UNKNOWN围栏**（A1C纯VGA调色板重载已证返回后效应仅显示；归属/loader语义未知，影响半径不含规则状态，可终局携带）。
- 当前分支`main`，HEAD `f2c05fc`（去向分支续查；其前`58c2c28`计时分支批，均已按用户授权提交，不含push；他方jev四项untracked未碰）。P89 seal提交`58f7cfb`已在其历史中。
- 未提交堆积见§6清单；提交/push均需另行明确授权。
- 固定`KI.EXE` SHA256：`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，文件偏移按`VA+0x200`换算。
- 未stage、commit或push；未调整权限、信任或全局配置。未读取/写入真实`SAVE.DAT`、`.dragon-runtime`或用户浏览器profile。现行存档政策：用户确认无需保留旧Web存档，v1路径已退役删除，不兼容槽三路禁用。
- 最新完整证据根（P91）：`C:/Users/fczll/.pi/agent/sessions/--E--Dragon--/native-event-p91-overlap/`，seal `0ba03dd6…`（full-1 196/196 TAP618，1次STOP废弃后从首入口重跑；browser-1 22/22单轮直过，1pe为P88诱发探针；含P90零日报障5修复首次整轮验证）。

## 2. 验证惯例、命令与已知噪声

- P轮惯例：manifest跑前重绑（4437键，0缺失）＋首入口完整重跑（非浏览器full-1＋浏览器browser-1）＋独立seal＋snapshot前后零漂移＋index空；STOP轮废弃不拼接；journal条目晚于seal生成，已声明。
- 纯文档轮按项目AGENTS 2.4不跑无关游戏回归/浏览器冒烟，不新建P轮根。
- 证据根标配：`full-1/{inventory.json,run_nonbrowser.py,node_guard.cjs,python_guard.py,read-allowlist.json,manifest-current.json}`、`browser-1/{inventory.json,run_browser.py,browser_guard.cjs,music-observer.js,snapshot/}`、`final/build_seal.py`＋`checks.json`/`seal.json`；语法 sweep 用P58根`synth_js.cjs`/`synth_py.py`。
- 已知噪声（非缺陷）：opening.mp3 503×2（opening_loading）、`ERR_ABORTED`导航相位requestfailed、浏览器时序抖动（单跑确认后整轮重跑）；`.codegraph/codegraph.db`与`daemon.log`在manifest内持续churn，记噪声不改scope。
- 铁律：含反斜线内容一律落盘Temp脚本执行；setup范式含snapshot-before；新测试文件进runner清单＋read-allowlist＋snapshot。

## 3. 调试、失败尝试与修正

| 失败或误判 | 处理与保留结论 |
| --- | --- |
| fixture短表/缺表或恢复守卫误读（外交矩阵、事件轮、月结多轮） | 更新fixture为显式完整原始表；生产恢复守卫不放宽，不从公开列表补值。 |
| 证据脚本事故：Python反斜线heredoc损坏、漏建tmp、GBK/UTF-8聚合、seal过滤器、read-allowlist漏新条目、snapshot-before漏步 | 修基础设施后从对应首入口或不可变日志重算，不拼接成绩。**铁律**：含反斜线内容一律落盘Temp脚本；setup范式含snapshot-before（反斜线键）；新文件进runner清单。 |
| 格式化器静默漂移（纯排版无语义，多轮复发） | postgate全manifest漂移比对当场捕获；当轮作废，按当前字节重绑manifest+首入口重跑+重建seal。来源未定位。 |
| seal构建事故：正则补丁静默未生效误绑旧轮；manifest重建范围错误；误跑旧post脚本 | 构建脚本落盘全文写出+grep核对；manifest从上一根复制增量更新（保持绝对键范围）；post脚本按根名核对。 |
| 陈旧缓存错断：disasm旧缓存39E8错断；旧会话「8810经88E0栈切换返回」 | 一律以disasm.py现刷权威窗为准，老缓存只作线索；旧结论作废并在维护源标勘误。 |
| lint rewrite悬垂if（aiTick早退第二句脱离守卫） | 补花括号，从首入口完整重跑。 |
| 测试断言误写（槽号文案、assert.equal比结构对象、pin长度/VA笔误、阈值算术） | 只修测试，从专项首入口重跑；不改规则实现。 |
| 旧hold断言 vs 已闭合挂起合同 | 按新闭合行为改测试；manifest重绑后从首入口完整重跑，不拼接。 |
| 浏览器audio增益时序抖动 | 单条复跑确认后从首入口全新重跑；不改断言。 |
| `audience.entered 2!==6`（章节diplomat_idx=null触发TALK55拒绝） | 非抖动：修夹具显式任命外交官，不放宽门。 |
| 端口/启动抖动：ERR_UNSAFE_PORT(10080)、standalone启动超时 | 换安全端口/隔离重跑；opening的ERR_ABORTED按真实requestfailed记录，不称error-clean。 |
| snapshot-before手工补建用posix分隔符致guard零匹配 | 按铁律用生成器重建manifest后首入口全量重跑。 |
| 历史exact-v2 candidate缺失（P57已按E717规则重建退役BLOCKED） | 若再遇缺失，保持BLOCKED，不扫描历史目录、不重建替代候选。 |
| full-1轮中STOP（旧停点断言被新证据推翻） | 按新闭合行为改测试，逐项核对后首入口全量重跑闭合。 |
| manifest JSON反斜线转义quirk（receipts高位行严格解析失败） | harness既有发射问题：tolerant regex键值抽取比对，生产零漂移。 |
| 跨根脚本误用硬编码旧根改写已封存manifest | 跨根脚本一律参数化路径；记入seal checks processFailures。 |
| P89 manifest双坏键（setup遗留`E:Dragonweb-port<TAB>ools<VT>erify_native_capture_map.mjs`值`<m>`＋新文件未绑；两次node -e修补又添双反斜线/TAB/VT坏键） | 落盘文件脚本重修（删双坏键，sha256重绑两真文件；复读验证4437键零控制字符零缺失；runner DRIFT[]确认）。教训：含反斜线键操作一律落盘脚本，禁多层引号转义。 |

## 4. 相关文件

### 4.1 核心实现

- 固定表与恢复：`web/src/game/native{factions,diplomacy,events,legions,monthlypolicy}.js`、`scenarioassembly.js`（v1准入臂已删，P65/P76）、`savegame.js`（v1道路序列化臂＋compat读已删，P66/P79）、`world.js`；占格/缓存：`navigation/scenariomovementmemory.js`、`navigation/scenariocitycache.js`。
- 月结：`navigation/original{factiontick,generalrating,monthlyfiscal,monthlydiplomacy,monthlybudgets,monthlypolicy}.js`及对应`scenario*`桥。
- 事件消费：`original/scenario{warconsumer,capitalrelocation,deficittrust}.js`、`originalnegotiation.js`、`original{truce,assistance}consumer.js`、`originalplayerdecision.js`、`originalbudgetconsumer.js`、`originalenvoyresultconsumer.js`、`originalvictorygate.js`、`originalwarproposal.js`、`scenarionegotiation.js`、`originalevents.js`、`scenarioevents.js`、`web/src/game/ai.js`（v1撤退/步行臂已删，P62/P63；`_retreat`清除修复P74）。
- 行军/编成/战斗/天气：`original{formation,roadmovement,roadarrival,roadretreat,fieldbattle,fieldterrain,siege,weather}.js`、`scenariolegionfate.js`、`originallegionfate.js`、`scenarioweather.js`、`ui/gamebar.js`（live findRoadRoute预览已删，P64）、`render/endview.js`。
- 导航基建（v2，P67正名）：`game/navigation/`图记录与地形基建保留；Dijkstra实现与`findPath`门面导出已删（P67/P69）。
- 内容管线：`tools/parse_sinario.py`、`tools/content_pipeline.py`（nativeCityRecordRaw派生）、生产`web/data.json`。

### 4.2 回归与维护源

- 专项：`tools/verify_native_{faction_tick,monthly_fiscal,general_rating,monthly_diplomacy,monthly_budgets,monthly_policy,generic_talk,deficit_trust,capital_relocation,war_consumer,negotiation_consumer,player_decision,budget_consumer,war_proposal,victory_gate,occupancy_init,event_producer_audit,message_display_audit,extinction4FCE}.mjs`、`verify_strategic_city_ai_raw.mjs`、`verify_advisor_delegation_ui.mjs`、`verify_tactical_exit_frame.mjs`、`verify_battle_opening_messages.mjs`、`verify_content_pipeline.py`、`verify_c15_upstream_replays.mjs`（原生化，P70）、`verify_delegated_target_march.mjs`（P71）、`verify_third_party_blocker_march.mjs`（P72）、`verify_siege_contact_march.mjs`（P73）、`verify_march_resume.mjs`（P74）、`verify_legion_slot_battle.mjs`（原生P06迁移，P75）、`verify_frame_loop_survives.mjs`（P88，主循环逃逸异常存活）、`verify_fresh_terrain_bind.mjs`（P89，fresh地形合成绑定＋快照/读档round-trip）、`verify_player_faction_pointer.mjs`（P87，CFD绑定三形态＋3549/358C路由＋旧档愈合）。
- 机制维护源：`docs/re-notes-ai-{chain,fiscal,diplomacy}.md`、`re-notes-legion-fate.md`（§19.9–§19.11为H4终局源）、`re-notes-march-pathfinding.md`、`re-notes-strategic-message-abi.md`、`re-notes-custom-data.md`及相关Skills。
- 内容管线：`tools/parse_sinario.py`、`tools/content_pipeline.py`和`web/content/builtin/chapters/*.json`。

## 5. 历史seal对照表

各根`final/checks.json`为权威明细；journal条目均晚于seal生成，已声明。

| 根 | 非浏览器 | 浏览器 | seal |
| --- | --- | --- | --- |
| p91-overlap | full-1 196/196 TAP618（1 STOP废弃后重跑） | 22/22 snap2206 1pe（P88诱发探针） 2×503 6rf（单轮直过无STOP） | `0ba03dd6…` |
| p89-fresh-terrain | full-1 196/196 TAP613 DRIFT[] | 22/22 snap2206 1pe（P88诱发探针） 2×503 1rf（单轮直过无STOP） | `864e74cf…` |
| p88-frameloop | full-1 195/195 TAP611 | 22/22 snap2205 1pe（诱发探针，自断言） 2×503 4rf（单轮直过无STOP） | `c83f544a…` |
| p87-cfd-bind | full-1 195/195 TAP611 | 21/21 snap2204 0pe 2×503 4rf（单轮直过无STOP） | `647c6fba…` |

p26–p85已封存：明细查各根`final/checks.json`与git历史，不再逐轮展开。

## 6. 本轮记录（近期未封存事项；已seal轮次只留指向）

- 已封存：P87–P91见§5；计时分支批 `58c2c28`、去向分支批 `f2c05fc` 已提交；机制细节归各SKILL/re-notes（计时冻结与分支挂起→re-march-engagement/re-battle-command/re-post-battle，去向→legion-fate，提案门→re-war-proposal §7.1）。
- 渲染与时钟（用户报障，均未提交）：ai.js原生分支每动作写prev＋_renderMoveSerial（战败撤退图标 bounce→平滑，MAX-RENDER-DRIFT=3）；clock.js战略提速约1倍＋MAX_TICKS_PER_FRAME=3（超额欠账丢弃、hold即停）；loading人物高度-20%站位不动；接战声画120/60ms（用户选B，已确认“效果很好”）；对话框自动回行（_drawGeneralCardBox全流折行＋verify_dialog_autowrap）。
- 预算资金重叠锁钟（m2275/m2451/m2459/m2583）：audience丢nativeBudget致v1扣款掩盖门不清——gamebar内外政audience补nativeBudget＋关闭补commit(0,2)；悬停三门放行；clearNativeUiContinuations。用户确认对话正常。
- 敌对提案去门（m2875/m2895/m2916）：v1 dist实证入口无门→`showHostileProposalAudience`去门（停战/协助保留）；SKILL §7.1第10条（第9条“三提案”作废，65EF适用范围记未知）；探针PROPOSAL-GATE-PASS。
- 有交互顺序对话框右键无效（m2985/m2990产品决定，AGENTS §2.2已收）：gamebar.click与_clickProposalAudience两处（键盘/进言audience/外交接见选择阶段一律消费；done/result timer与type5强制沿自动关闭等价保留；generalCard提示框不动）；预算/消息FIFO/advice三套件＋浏览器探针全绿。
- 6475君主直判举证（m3129，无代码改动）：Talk94截图逐字命中al==1分支唯一源；disasm.py现刷6475（DL恒0/DH=0xFF调304E通配查type==1且arg0==0）确认原版直批跳过理由。诚实缺口：在途事件需当时快照；arg0别章/别势力是否恒=玩家未知；Web多验arg1==目标、比原版严，待另处理。已反问用户提案前是否已派军团打呂布。
- verdict1按原版放宽（m3270“按原版来，不用比原版严”）：gamebar hostile之`hasPendingStrategicEvent(sc,1,{arg0,arg1})`去arg1（原版304E只约束type==1且arg0==玩家）；originalwarproposal注释＋SKILL §7.1第1条同步；war_proposal 8/8。m3261“无交战却直批”在放宽后解释：只要事件环有任一条type1且arg0==玩家的在途事件（不限针对谁）即al==1——实机对局中AI动作/历史残留即可触发，无需可见交战。
- 未提交改动（`git status`）：M约30文件（ai.js、clock.js、gamebar.js、mapview.js、scenarioweather.js、world.js、savegame.js、commands.js、nativelegions.js、engagementpresentation.js、intro/styles.css、各verify钉值、re-notes-audio、SKILL、本journal）；新工具verify_dialog_autowrap/tactical_browser/tactical_entry等；`tools/_*`为gitignore临时脚本，不进版本。
- 待办/阻塞：commit待授权（push无授权）；m2497拒绝是否扣款待用户确认（原版拒绝无扣款）；m2659(1)月度资金是否固定时间未查；m2502/m2523被动协助金流已通无需改。
