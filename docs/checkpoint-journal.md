# Checkpoint Journal

> 当前开发轮次的交接记录，不是长期指令、机制证明或任务授权。[项目记忆](../AGENTS.md)只维护长期事实、架构、命令、约定与当前主线；机制和原始证据由相关`re-notes`及Skills单点维护。日志不是任务或提交授权。

## 1. 当前主线状态

- **C15大门已翻**（P78，用户明确批准，verdict记ai-chain C15行）：fresh装配默认v2，生产侧v1零残留（G1–G8删除，P62–P69/P76），6原生覆盖gap全闭（P70–P75）。
- **门后延续全闭**（P79–P86，门后延续目标已标complete）：G6 compat读删除；AL=0x93围栏终局；D游标初值；H1战术域归属；H2信赖读；H4尾项——(1)选择器返回覆盖、(2)原版不可达（opening-ABORTED标签退役）、(3a)(3b)覆盖，(3c)60C8封为**非规则影响UNKNOWN围栏**（A1C纯VGA调色板重载已证返回后效应仅显示；归属/loader语义未知，影响半径不含规则状态，可终局携带）。
- 当前分支`main`，HEAD `58f7cfb`（P89 seal后按用户m3510附条件授权commit本地提交P87–P89十二文件，不含push；他方jev四项untracked未碰）。
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
| p85-h4supp | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 3rf（单轮直过无STOP） | `d7d22d31…` |
| p84-h4tail | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 4rf（单轮直过无STOP） | `349f70dd…` |
| p83-h2trust | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 3rf（1抖动STOP后重跑） | `6491a071…` |
| p82-h1d31c | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 4rf（单轮直过无STOP） | `006157a1…` |
| p81-h5image | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 4rf（单轮直过无STOP） | `56d45c60…` |
| p80-h3fence | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 3rf（单轮直过无STOP） | `b8a96753…` |
| p79-g6closed | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 3rf（单轮直过无STOP） | `71713fa1…` |
| p78-gateflip | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 2rf（单轮直过无STOP） | `a7eddcdf…` |
| p77-gatereview | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 2rf（单轮直过无STOP） | `99f8e802…` |
| p76-g5scaffold | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 3rf（单轮直过无STOP） | `ceb0299c…` |
| p75-np06 | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 2rf（单轮直过无STOP） | `af69610b…` |
| p74-nresume | full-1 194/194 TAP607 | 21/21 snap2203 0pe 2×503 1rf（1 infra STOP后首入口重跑） | `0af234d8…` |
| p73-ncontact | full-1 193/193 TAP605 | 21/21 snap2202 0pe 2×503 5rf（单轮直过无STOP） | `ec7ff591…` |
| p72-nblocker | full-1 192/192 TAP604 | 21/21 snap2201 0pe 2×503 2rf（1 timing STOP后首入口重跑） | `8ef6428a…` |
| p71-ndeleg | full-1 191/191 TAP603 | 21/21 snap2200 0pe 2×503 5rf（2 infra STOP后首入口重跑） | `5f052b13…` |
| p70-nreplay | full-1 190/190 TAP602 | 21/21 snap2199 0pe 2×503 4rf（1 infra STOP后首入口重跑） | `431e91a3…` |
| p69-g7dijkstra | full-1 190/190 TAP602 | 21/21 snap2199 0pe 2×503 5rf（1次engagement抖动STOP后整轮重跑直过） | `802b29af…` |
| p68-g8-oracles1 | full-1 190/190 TAP602 | 21/21 snap2199 0pe 2×503 2rf（单轮直过无STOP） | `3c0ea089…` |
| p67-g7-facade | full-1 190/190 TAP602 | 21/21 snap2199 0pe 2×503 4rf（单轮直过无STOP） | `6f5356a9…` |
| p66-g6-savegame | full-1 190/190 TAP602 | 21/21 snap2199 0pe 2×503 5rf（单轮直过无STOP） | `6870d9ae…` |
| p65-g4g5-admission | full-1 190/190 TAP602 | 21/21 snap2199 0pe 2×503 1rf（单轮直过无STOP） | `5458f229…` |
| p64-g3-gamebar | full-1 190/190 TAP602 | 21/21 snap2199 0pe 2×503 3rf（单轮直过无STOP） | `443f60ba…` |
| p63-g2-stepto | full-1 190/190 TAP602 | 21/21 snap2199 0pe 2×503 5rf（单轮直过无STOP） | `7c67a6d4…` |
| p62-g1-retreat | full-1 190/190 TAP600（3 P06 skip带因） | 21/21 snap2199 0pe 2×503 5rf（单轮直过无STOP） | `20552fef…` |
| p61-gate-inventory | full-1 190/190 TAP600 | 21/21 snap2199 0pe 2×503 4rf（单轮直过无STOP） | `c7794dc4…` |
| p60-ruling | full-1 190/190 TAP600 | 21/21 snap2199 0pe 2×503 1rf（单轮直过无STOP） | `ec81d604…` |
| p59-flip-audit | full-1 190/190 TAP600 | 21/21 snap2199 0pe 2×503 3rf（首跑engagement抖动STOP→单跑确认→重跑单轮直过） | `b85c994a…` |
| p58-gate-flip | full-1 190/190 TAP600（中断后修复重跑单轮直过） | 21/21 snap2199 0pe 2×503 4rf开场/导航相位（weather/clock两STOP同轮闭合后重跑） | `cbcc7c5f…` |
| p57-v2-candidate-rebuild | full-1 190/190+0B TAP600 | 21/21 snap2199 0pe 2×503 3rf开场相位（单轮直过） | `b726215e…` |
| p55-c09-governor-player-detached | full-1 190/189+1B TAP600 | 21/21 snap2198 0pe 2×503 5rf开场相位（首跑road_callers旧断言STOP后首入口重跑） | `ce28bbad…` |
| p54-c09-c15-review | full-1 190/189+1B TAP590 | 21/21 snap2198 0pe 2×503 5rf开场相位（首跑allowlist-STOP后首入口重跑） | `92b058c7…` |
| p53-c14-save-restore | full-1 189/188+1B TAP585 | 21/21 snap2197 0pe 2×503 opening.mp3 4rf导航相位（单轮直过） | `f933109c…` |
| p52-1d8e-pump-tail | full-1 189/188+1B TAP585 | 21/21 snap2197 0pe 0×真503 2ce+1rf导航相位（单轮直过） | `621d6c88…` |
| p51-exit-rng-alias | full-1 189/188+1B TAP585 | 21/21 snap2197 0pe 0×503 2ce+3rf导航相位（单轮直过） | `783f88a0…` |
| p50-battle-opening-beep | full-1 189/188+1B TAP585 | 21/21 snap2197 0pe 0×503 2ce+4rf导航相位（单轮直过） | `e3a3b9c8…` |
| p49-city-damage-a65d-9ff8 | full-1 189/188+1B TAP585 | 21/21 snap2197 0pe 0×503 2ce+3rf导航相位（首跑music抖动重跑） | `e67d56f8…` |
| p48-tactical-exit-frame | full-1 189/188+1B TAP585 | 21/21 snap2197 0pe 0×503 2ce+6rf导航相位 | `ad31a14f…` |
| p47-g1f-callers | full-1 188/187+1B TAP585 | 21/21 snap1118 0pe 0×503 2ce+4rf导航abort | `98f8bf51…` |
| p46-talk36-f19-callsite | full-1 188/187+1B TAP585 | 21/21 snap1118 0pe 2×503 4rf | `a5e338d9…` |
| p45-extinction-4fce | full-1 188/187+1B TAP582 | 21/21 snap1118 0pe 2×503 2rf | `b9135b51…` |
| p44-slot-expiry-dispatch | full-1 187/186+1B TAP569 | 21/21 snap1117 0pe 2×503 6rf | `bfe090ac…` |
| p43-monarch-deploy-commit | full-1 187/186+1B TAP569 | 21/21 snap1117 0pe 2×503 5rf | `699cb852…` |
| p42-march-order-entry | full-1 186/185+1B TAP563 | 21/21 snap1111 0pe 2×503 3rf | `80ac34f4…` |
| p41-road43d3-alias | full-1 186/185+1B TAP563 | 21/21 snap1111 0pe 2×503 1rf | `0dbbc292…`（seal-1作废） |
| p40-occupancy-init | full-1 186/185+1B TAP563 | 21/21 snap1111 0pe 2×503 4rf | `6d9e5b4f…`（seal-1作废） |
| p38-relocation-commit | full-1 185/184+1B TAP552 | 21/21 snap1110 0pe 2×503 4rf | `d2e5e52c…` |
| p37-city-records | full-1 185/184+1B TAP548 | 21/21 snap1110 0pe 2×503 3rf | `43a97ea4…` |
| p36-victory-gate | full-1 185/184+1B TAP548 | 21/21 snap1110 0pe 2×503 2rf | `41c2b5ab…`（7aa4e9ec作废） |
| p35-proposal-chain | full-4 184/183+1B TAP540 | browser-3 21/21 snap1108 0pe 2×503 3rf | `05209dd5…` |
| p34-ffff-alias | full-1 183/182+1B TAP532 | 21/21 snap1106 0pe 2×503 5rf | `53cbf5d9…` |
| p33-monthly-tail | full-1 183/182+1B TAP527 | 21/21 snap1106 rf5 | `14a5fcbb…` |
| p32-message-audit | full-1 183/182+1B TAP527 | 21/21 snap1106 rf3 | `cd8c572c…`（1a8c1b93作废） |
| p31-type10-audit | full-1 181过+1B TAP519 | 21/21 snap1105 | `e74555d8…`（9文件后被漂移，P32重绑） |
| p30-target-alias | full-1 181/180+1B TAP514 | 21/21 snap1104 0pe 2×503 4rf（首轮端口抖动重跑） | `4579dfa0…` |
| p29-type8-player | full-1 181/180+1B TAP510 | 21/21 snap1104 0pe 2×503 4rf | `eb067e9f…` |
| p28-budget-envoy | full-1 180过+1B TAP509 | 21/21 | `bd7494dd…` |
| p27-player-decision | full-1 180/179+1B TAP491 | 21/21 snap1101 0pe 2×503 2rf | `394dad29…`（c1e72c1c作废） |
| p26-negotiation | full-3 179/178+1B TAP472 | browser-3 21/21 snap1099 0pe 2×503 4rf | `d0d30f30…`（b0a98cff/28c0af7b/f8490a5d作废） |
| 01a0a5cb | — | — | `104b4225…`（只绑其输入） |

## 6. 本会话记录

- P90零日报障（用户：顶栏日期出现0日，截图196年5月0日；未独立成轮，修复随P91整轮验证）：5堆叠崩溃逐个KI窗口实证修复——(1)3F29旧所属0x18抛错→改写外交矩阵[0][23]（DS:0617，3EFD..3F2C：BH=+0x1A、BX=old*0x40、[BX+0x17]、AH=cityIdx因SI=idx*32；官数3840条+0x1A域闭合{0..21,0x18}）；(2)320C/3215 attr门对defender=24抛错→经共享aliasStateByte读模型字节（351A无界检查已pin；2F71扩张空城defender=0x18合法，3526已正确跳过宣战）；(3)首战攻城4D33抛错→fresh装配默认nativeFateDisplayFlags=0（CS:98A6静态0，1AA7清零，置位/清零点均显示域）；(4)首个换月585F/5885读武将+0x1D抛错→createNewGameScenario从captive_flag镜像origFaction（0xFF→null；旧缺失抛错pin保留；系0日本体：换月抛错冻时钟于day=0）；(5)换月2E77读relation(24,player)抛错→经aliasStateByte走3119编址（2E6A..2E77+3119：BX=0x600+24A+B；3593确会写0x18目标）。单测122绿＋实机probe第五章4月1日→5月1日零error。改动9文件（生产5＋测试4）。
- P91重叠报障（用户m4508：`Uncovered overlapping native player decision`，栈enqueue4033→assistance4179→dispatch4435→tick2947→onHour）：诊断probe（D1真fresh之monarchOf恒真，系统性缺失死；D2 guard语义正确复现同错；D3 teardown残留复现同错；D4正常问答干净）收敛到continuation-set早于fallible构造＋读档/回标题不清零两类（drain-false竞态为唯一残留，guard保留诊断）。修复（零规则改动）：`enqueueNativePlayerDecision`先镜像UI显示门精确错并完整构造payload（含3C99个性strict读）再set（不变量set⟺可显示+已构造）；新增`clearNativeUiContinuations`（三枚UI continuation），`loadState`提交边界＋`returnToTitle`调用；incoming/player_decision两fixture补`monarchOf`生产形状（R1构造期抛错无残留＋恢复可派发、R2 teardown清理后续派干净，旧overlap pin保留；player_decision 21/21）。另迁移road_movement两处P90遗留pin（flags=0默认下command10改钉29AE TALK31显示块：2977写已发生status 8/plane255回绕/F14 DEC；bit4改钉正常moved；显式缺失合同仍由fate文件钉死；首轮STOP后废弃重跑）。full-1 196/196 TAP618＋browser-1 22/22单轮直过（1pe诱发探针＋已知噪声），seal `0ba03dd6…`。外交§36回流P91段。用户存档干净（continuation系app级从不序列化）：补丁后读档即续。

- 门后延续目标已标 complete（get_goal/update_goal以`default.*`名暴露；用时6h46m，tokens 2,520,949）：P79–P86即审计对照，唯一剩余H4-(3c)为已分类非规则影响围栏。
- P87根因修复（用户实机报障：设速后`Uncovered nativePlayerFactionPointer at 3549/358C`经onHour零catch逃出frame杀死rAF，日期与光标双冻）：live CFD由loadState在initPlayer之后绑定（`bindNativePlayerFactionPointer`，1B17-equivalent；fresh与读档同一落点；未选定留空；`verify_player_faction_pointer.mjs`第195项锁定bind三形态＋3549/358C路由＋旧档愈合）；full-1 195/195 TAP611＋browser-1 21/21单轮直过，seal `647c6fba…`；外交§268回流一行。frame-loop rAF加固提案未实施，待批。
- P89实机双崩溃根因修复（用户m3510：实机验证一次，绿则commit、不含push）：(1)首崩`Uncovered native terrain memory`——fresh新局owner.terrain恒null（main.js不传terrainMemory，fixture显式零span掩盖）；修为fresh/restore-missing时以`world.terrain.terrainIdentity()`合成全平面显式span（89F0/8A1E鲜绘刻意不做，角别名无平面模型）；`verify_fresh_terrain_bind.mjs`第196项（0xBA特征字节证合成源＋快照/读档round-trip）；capture_map两处迁移（absent-case改合成断言＋omit=-2子例期望8A3F→88EB）。(2)次崩`Uncovered native capital city 6 owner at 6A50`（tick 243）——live中立城faction为null而首都域`readCityOwner`独漏`null→0x18`映射（其余negotiation/capture/fate/warconsumer四域皆有；原码依据42AB“非己且非0x18”）；修后6A3D跳过中立城；capital_relocation新增中立城用例（先红11/1后绿12/12，临时回退证明已恢复字节一致）。live-verify复测tick 288→1009→1155零error全绿；早前一轮t1瞬时hold=true而tick 281→409续走，hold源采样全系正当UI/模态态（3秒自动关闭类），定为transient by design。full-1 196/196 TAP613 DRIFT[]＋browser-1 22/22单轮直过无STOP，seal `864e74cf…`。外交§16回流一段（6A50中立映射＋7项回归）。manifest双坏键事故见§3新行。
- P88 frame-loop加固（用户批准执行）：`main.js`之frame入口先行调度（尾部调度删除；异常仍上浮上报，fail-closed语义不动）；新`tools/verify_frame_loop_survives.mjs`（browser第22项：advanceFrame单发探针throw，断言时钟续走＋错误全含marker；快照内旧调度复原验证红TimeoutError exit1，非空证明）；full-1 195/195 TAP611 DRIFT[]＋browser-1 22/22单轮直过无STOP（1pe为诱发探针自断言，其余已知噪声），seal `c83f544a…`。§4.2专项行已补该测试名。
- 本次记忆整理：journal从595行收束为本版——§1重写为当前主线（门已翻/延续全闭/HEAD/KI/政策），§2收束为验证惯例与命令，§3坑点表保留（历史candidate-BLOCKED行按P57更新），§4文件清单同步v1删除与新增原生专项，§5删P42–P57冗长明细只留seal对照表（行内容逐字保留），删过时§6阻塞/§7下一步/§8旧整理注；同步修正web-port/AGENTS.md之P57-era接缝链与v1默认表述。只改2文档，不碰代码/资产/测试/Skills，不访问真实存档/profile。
- 计时静默冻结根因（用户：原版第二章208年9月停表且控制台无报错；第一章6月0日仍现；要求不按章打补丁、彻底查计时算法＋长日期测试）：aiTick（ai.js尾部catch return "failed"）与runLegionSlotBatch（catch return false）两处吞错→holdFailedStrategicUpdate永久冻结，只发4秒flash，控制台零输出；syncClock派生hold本身无泄漏，恢复路径（loadState清flag、读档可续、坏态拒存）闭合。修为集中上报点恒console.error带栈（strategicfailure.js）＋HUD常驻横幅（hud.js refreshClock内flag自维护，loadState清flag后自摘）。验证：临时探针直调断言hold/console/banner现隐四态全通（后删）；node --check三文件过；git diff --check过；LSP strategicfailure仅no-console规则命中（console.error即规则允许的形态），hud inconclusive。新增常驻工具tools/verify_clock_longrun_browser.mjs（chapter/months/faction参数；开场选择桩接管＋beginNewGame真实装配；0日/tick停滞/console错三类loud失败；无failure停滞先右键nudge后定性；watchdog dump含failure堆栈与全部hold输入）。harness实测：第一章1个月PASS；2个月在196/5/20复现`Uncovered native siege 4F71/TALK26 before city capture at 4F06`（AI攻玩家城、破守备队后快战胜利）；第二章3个月在208/9/28复现`Uncovered fate CDE/TALK36 extinction block at 5042`（与用户208/9/24同月同类）。两处皆为待KI闭合的原版消息分支，未按章打补丁，留待战斗/战后技能证据后实现。生产2文件＋新增1工具；临时探针已删；改动未commit。
- 分支线全查（用户授权反汇编、不止两条）：(1)4F06/TALK26已接：dispatch回裁决、入口拆续跑闭包、ai.js挂起（warnSfx＋TALK26单消息personality无段，CX=1Ah即索引本身）＋resume续跑易主，batch让出/ticket认领（finishDeferredLegionDaily），禁存＋提交边界清理已接；在途重复挂起精确错防continuation覆盖。(2)5042灭亡挂起已通到行军攻城链：buildNativeSiegeBlocks补onExtinctionBlock→capture第六参→"extinction-suspended"上浮→泵归一让出（isRoadSuspended；player-defeated沿历史形状）；总督/外交官既有挂起同享让出管线（此前吞返回致乱序现已纠正）；resume三件套认领ticket（链式挂起由深层认领）。(3)4300-STC重入BX勘误：旧实现误传变异BX致到达读幻影城（0..5静默错分支；≥6野地址如city14→0x4041/16449冻时钟，第一章5/28实机复现）；按§3.13保留DI结构改intercept返回原节点号，0x20=BH协议不变；到达/行军单测按真城市寻址更新（旧幻影期望作废并注明），行军笔记留待办（28F4后段静态复核）。(4)3094空行宣战：harness第三章首换月（212/6→7/0日）确定性复现FFFF空行＋关系门过→原版读未初始化RAM（DS:0x8003+，P34实锤）→行为不可知；P34永久stop修订为Web产品决定（待用户确认）：宣战比较恒不成立return false，目标维护走maybeQueueEmptyWar/2D94，零RNG零写、时间线无影响；外交单测三处3094期望同步更新，外交§7已回流修订。(5)实机长跑：第一章3月、第二章4月（过用户208/9/24及9→10零日点、跨年）、第三章3月、第四章3月全部PASS零error。回归：攻城11＋灭亡34＋到达31＋行军编成39（5旧skip）＋月结外交31＋ai调用方50＋谈判道路129等约430绿零失败；full-1全量未跑。剩余分支线（tactical进入类4F36/4F13/4E82/4EA1、去向TALK31/32/33/34/67/35/37、月结5924/599C、2BB3/58F1/4AD3及基础设施守卫）列待办未动；改动未commit。
