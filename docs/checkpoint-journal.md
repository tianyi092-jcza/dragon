# Checkpoint Journal

> 当前开发轮次的交接记录，不是长期指令、机制证明或任务授权。[项目记忆](../AGENTS.md)只维护长期事实、架构、命令、约定与当前主线；机制和原始证据由相关`re-notes`及Skills单点维护。日志不是任务或提交授权。

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
