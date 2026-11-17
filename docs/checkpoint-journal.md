# 检查点日志（checkpoint journal）

> 长期架构、命令与约定只维护在 [AGENTS.md](../AGENTS.md)；本页记录当前交接、会话进展、调试、验证与下一步。原机制证据查对应 re-notes，历史通过不替代新变更的验证。§72 以前见[归档](checkpoint-journal-archive-through-72.md)。
>
> 2026-11-17 按 §78 同规则再精简：§73–184 只保留标题与结论一行（锚点不变），细节用 `git show b101dd3:docs/checkpoint-journal.md` 恢复，或见各批次文档/re-notes。新增进展写在最前，不重写历史。

## 当前主线与状态

| 工作线 | 当前交接 |
| --- | --- |
| 战略事件调度 | D2-EVENT-64 本地完成并推送 `b101dd3`（未部署）：64 位置绝对调度表取代 D2-C 旁表，生产者/移页/泵串行/保存恢复全链接入；维护源[D2-EVENT-64 计划](d2-event-scheduler-plan.md)（§12 实现与 V01–V20 映射），边界与调试见下§187 |
| copy 收敛 | 元数据／章节／据点／武将／地图／审核已接 copy；部分定义面板、旧 draft 整体退役与表清理待办，按[收敛任务](copy-simplification-tasks.md)推进 |
| 据点扩容 | 193 城全链（检验→票→提交→批准→正式包→玩家装配）本地通过；运行/道路/财政/存档支持 v2-192 与 v3-512（M192／M193／M257），内置与生产准入仍 192。见[扩容计划](city-capacity-expansion-plan.md) |
| 地图工作台 | ATOMIC-CATALOG-1 单格库＋MAP-SPACE-4 布局＋紧凑底对齐为现行；据点组第八类只读；桥梁/水路并道路；长期约定在 memory §2 |
| 海域／地面 | SEA-GROUND-1：全幅 95 底图、小地图仅地面轮廓＋道路/据点，四层合成保留；见[合同](map-sea-ground-contract.md) |
| 编辑器展示层 | Element Plus 默认主题/组件/size＋繁体 locale，仅 `editor-ui/`；玩家 Canvas 不套此规则（memory §3） |
| Git／生产 | `github/main`=`b101dd3`（D2 实现已推送；本次 journal／memory 整理尚未提交）；`origin`（Gitea）停在 `dd877b3` 未推。生产仍是上一版镜像，未写入、未部署、未迁移真实数据 |

### 未完成、阻塞与下一步

1. **D2-EVENT-64 收尾**：功能与验证已完成（24 条适用 verifier＋两条浏览器 lane 全绿）；剩部署/生产验收需单独授权。已知环境限制：主动 LSP 对 `ai.js` 恒 inconclusive；`verify_war_proposal_browser` 落 retryable 分支不计通过（§187）。
2. **copy 收敛**：部分定义面板、旧 draft 整体退役与表清理，按[收敛任务](copy-simplification-tasks.md)分批；不重开已完成的 copy 链。
3. **据点扩容后继**：人物/地图等容量、生产准入迁移按[CITY-CAPACITY-1](city-capacity-expansion-plan.md)推进；计划不等于部署。
4. **环境注意**：宿主 LSP 不可用或 inconclusive 时不得称 clean；`verify_editor_panel_visibility_browser`、`verify_c15_upstream_replays` 等为基线已有失败，与本轮无关。不得为跑绿恢复 Trial 或放宽身份门。

## 187. D2-EVENT-64：P2–P5 本地实现（D0–D8＋S1 全 (a)，已完成并推送 b101dd3，未部署）

**目标与会话**：用户确认 D0–D8＋S1 全 (a)，随后追加「`0x304E` 纳入调度条目」「Playwright 没有就授权安装」。目标是拥挤/跨页/满轮不丢事件、月结位置换算正确、消息返回前不派下一条、保存恢复可校验、旧旁表退役；禁止真实 `SAVE.DAT`／profile／dev 库。

**实现**（全部为 Web 产品决定，非原版机制）
- `web/src/game/navigation/strategiceventschedule.js`（新，381 行）：`{version:1, epoch, entries[], meta[]}`，绝对位置 `epoch*64+slot`，rank `0=carry／1=overflow`，位置内顺序 carry→原轮→overflow；排队/carry/排序 0 RNG；缺字段＝空表，非法字节/版本/区域抛 `RangeError`。
- 生产：2FBF 页内拥挤→`(epoch+1)*64`；跨页→`epoch*64+offset/4`；301C 满轮→`epoch*64+offset/4` 且 CF 仍 0；原轮可写时只写原轮（不双派发）。新增 `accepted` 表示「Web 已接受」，`inserted` 只保留原 4 字节真值；22DB/2286/预算/57FE 改读 `accepted`。
- 移页：2BD9 先 `beforeEventMonthShift()`（旧当前页 `cursor..63` 含元数据搬到新纪元位置 0，再搬过期条目），之后才 `resetEventMonth`；pristine 新局（原轮全空、调度表空）直接跳过，保持 epoch 0。
- 派发：泵在分频归零时只推进一次游标并冻结批次（carry→原轮→overflow）；`ai.js` 串行派发，消息未返回不下一条，整批结束才 `tickFactionStrategicState` 一次；场景卸载清批次，挂起期间禁存。
- 上下文与保存：type11 携带区域快照；type12 subtype0 携带 `city._disasterGeneration`（随 `cityRuleState` 保存，不符则不清零、不移对象）；快照保存 `strategicEventSchedule`，恢复一次性校验，非空旧旁表拒绝（不猜到期时间）。
- S1：`enqueueDelayedStrategicEvent` 在 native 走真实 301C（`BL=0x14`，0 RNG），`gamebar` 三处 type6/7 不再抛 `legacy event wheel`。
- 304E：`hasScheduledEvent`（只读）并入 `hasPendingStrategicEvent`，调度条目在派发前都算待办。

**失败与纠错**
- V09 抓到真实缺陷：首版 `drainStrategicEventBatch` 在首条消息未关闭时就派发下一条（`Uncovered overlapping native generic TALK event`）→ 改为消息挂起即等待。
- 浏览器首轮抓到新局崩溃：`beforeEventMonthShift` 在 `resetEventMonth` 之前要求 cursor，实测 `RangeError: Uncovered monthly diplomacy _strategicEventCursor` → 改为「原轮全空且调度表空才跳过」，其余缺 cursor 仍 fail-closed 且不写 reset 前缀。
- 其它：超长 heredoc 截断改用 `write`；`savegame.js` import 锚点替换静默失败后补写；`carryOverdueEntries` 改 order 未重排已补；恢复拒绝误读 state 字段已改读 runtime；旧测试按新语义更新（满页仍计 queued、四字节记录含 `arg2`）。
- 过程失误：曾用 `verify_*.mjs` 通配跑全目录，大量需参数/服务的 backend 脚本失败并超时——不是回归，违反 AGENTS「禁止通配」，已改显式清单，不作证据。

**相关文件**
- 产品：`strategiceventschedule.js`（新）、`strategiceventschedule` 的调用方 `ai.js`、`savegame.js`、`originalweather.js`、`originallegionfate.js`、`originalmonthlydiplomacy.js`、`scenarioevents.js`、`scenarioweather.js`、`scenariomonthlydiplomacy.js`、`scenariomonthlybudgets.js`、`scenariolegionfate.js`；删 `strategiceventoverflow.js`。
- 测试：新增 `verify_d2_event_{schedule,schedule_chain,schedule_browser,refusal,save_roundtrip,v_matrix,v_matrix_app}.mjs`；更新 `verify_native_legion_fate`（42/42）、`verify_native_weather_monthly`、`verify_strategic_negotiation_events`；删 `verify_event_overflow_side_table.mjs`。
- 文档：计划 §10–§12（含 V01–V20 映射）、本页 §186–§187、`re-notes-ai-diplomacy` §40、`re-notes-legion-fate` §20、两个 SKILL 的 Web 指针。

**验证（2026-11-17 实跑）**
- 24 条适用 `tools/verify_*` 全绿：调度 9/9、链 9/9、refusal 6/6、V 矩阵 13/13、app 5/5、存档往返 1/1、天气 8/8＋5/5、fate 42/42、预算 9/9、容量边界 5/5、RNG raw、外交 runtime/20 章 220 组合、三个 save lane、capital/message_fifo/negotiation/city_ai/native_city/faction_tick、`weather_regional_sampling`。
- 浏览器（真实 Chromium，隔离 profile）：`verify_menu_save_slots_browser` 通过（存 A→推进→存 B→覆盖→回标题→空槽三禁→读 A→刷新→读 B，`page errors: []`）；新增 `verify_d2_event_schedule_browser` 注入 2 条非空调度（overflow+generation、carry+region，epoch 5）经 `saveGame`→IndexedDB→`reload`→`loadSave` 原样恢复。
- 构建：`trialweb.txt` 重建 256 文件，sha `2237603d…`；`git diff --check` 通过。
- 未通过/未覆盖：`verify_war_proposal_browser` 两次落 retryable（`exit 2`，骰子分支未触发），不计通过；主动 LSP `inconclusive=5`（push-only、`ai.js` 超 5000 行），仅 `node --check`，不称 clean。

**状态与下一步**：已提交 `b101dd3` 并推送 `github/main`；无阻塞、无未决用户决定。后续仅部署/生产验收（需授权）与可选扩展（人物/地图容量）。
## 186. D2-EVENT-64：P0/P1隔离审计与一次性决策包（未实施，未push）

- 只读审计＋隔离探针（`.dragon-analysis/d2-event-64/`，未入库）：基线 5 条全绿；复现 D2-C 接缝——当前页满时 22DB `areaQueued:false` 却不写 bounds、旁表只存四字节载荷，轮转 4 次后才派发（约晚 4 个月）且按错误区域结算；301C 远期满轮落 M+5 位置 0（晚约 1 个月）；2FBF 跨页请求（原版立即 STC）同样延后；恢复路径不校验旁表，`type:0x1ff` 被截断成 255 后才在派发时抛错。
- 接线审计：2FBF 生产者 6 处、301C 4 处；仅 22DB/预算/57FE 读 `inserted`；进言 type6/7 仍走 legacy（后由 S1 修复）。
- SKILL 补证：301C 的 `BL` 是槽偏移且扫到四页末尾；页满失败仍已消费随机起点 1 字节；301C 插入/满队列 CF 均 0 且 5940 不查；DOS 槽尾 `+0x52C0..+0x56BF` 就是事件轮、无「到期时间」字段。
- 产出：计划 §10（审计与分级）＋§11（推荐模型、四组示例、D0–D8＋S1 决策表）；用户随后确认全 (a)。

## 185. D2-EVENT-64后继计划（仅文档，供新会话goal委派）

- 已由 §186–§187 执行完毕；本节保留计划期交接。任务分解 P0–P6、决策表 D0–D8＋S1、验收矩阵 V01–V18（后补 V19/V20）、完成审计清单；维护源[D2-EVENT-64 计划](d2-event-scheduler-plan.md)。
- 规划期已记 2FBF 捕获后仍报失败、22DB 不写 bounds 的线索；实际复现与修复见 §186–§187。

## 184. D2-C实现：溢出旁表＋2BD9排空（用户批C，本地验证，未push）

- **已被 §187 取代**（模块与测试在 `b101dd3` 删除）。旁表只存四字节载荷＋sequence、按页 3 排空，捕获事件被推迟约 4 个月且丢失目标位置与区域上下文；模块与测试已在 `b101dd3` 删除，语义改由绝对调度表承担。保留本节仅作历史与锚点。

## 183. D2-A满页行为冻结：原版满页就是丢，无overflow机制（RE结论，未push）

- 结论仍然有效；Web 差异见 §187。原版 2FBF 只看当前页剩余、跨页立即 STC；301C 满轮 CF 仍 0，调用方不重试，事件实际丢失。Web 的「接受并延后」是已批准产品差异，不改原窗字节。

## 182. B4收尾：D4 k=2可达＋2286新城入灾＋费用域保留（本地验证，未push）
- 用户拍板：N=193..256顶槽必须可达（总目标突破192）；费用域问清区别后再定；D2按“实现它”推进到可实现边界。

## 181. B4推进：D4实施＋费用域提案＋D2证据冻结（本地验证，未push）
- D4（用户B4“全做”授权，按提案逐字实施，标Web产品决定）：`originalweather.js` 22DB选城改live-N抽样…

## 180. 本地服务澄清＋删除面板挂载（本地 dev 5173 已起，未push）
- 更正：本轮全部实现均为本地服务，无推送无部署；此前的公网探测（dragon*.720108.xyz）只是只读连通性抽查，不是目标。本地目标库为`.dragon-analysis/dev`（editor.sqlite）：仅1个上架游戏`臥龍傳·重構版`（`be4d9d16…`，approved，20章6资产），即待删的旧上架。

## 179. VPERF场景级耗时：assembly＋月度（本地实测记录，非门限）
- 新`tools/bench_scenario_perf.mjs`（i5-7500／15.9GiB／win32／node24，与codec基线同机）：compileGameSource 192城2734ms（堆456MiB，地形/道路为主）；fresh缓存init＋synthesize三档皆sub-ms…

## 178. D1(b)具名编译＋D2新城拓扑＋编辑器新城面板（本地验证通过，未push）
- 用户决策：D1由(b)具名正统（内置终将删除，raw只留导入侧；(a)合成raw虽下游零改但成永久负担）；D2=建档→放piece→绑定（先cities.create→地图city-stamp放未绑定piece→city-bind选piece绑档案→admit→road-add→发布）；B4三项全做（见下blocked）；旧上架游戏可删…

## 177. VPUBLISH迁移：parity改走copy检验链（本地通过，未push）
- `tools/verify_copy_publish_parity.mjs`：遗留`/api/publish`直发（409）＋trial-pack比对（410退役）改走现行链：copy → `copy/validate`（passed＋ticket）→ `copy/submission`（submitted）→ `copy/approve…

## 176. B3片3(b)实施：显式admit＋named转换＋capture live化（已提交，未push）
- `gamesource.js`：`admitChapterCity(game,cityId,troopsCap)`——验主表完备（名＋7数＋troops_cap显式0..255，缺项指名拒收）＋placement在位（储备拒收）→回填主表x/y→逐章稠密追加密集条目…

## 175. 用户决策（已执行，见§176/§178；本节为历史记录）
- admit触发a/b待选（已解释，见下）；B4用户批准“现在启动”；VPUBLISH用户批准“迁移”（parity遗留直发流改走copy检验链，含△收敛）。goal仍blocked，待a/b选择＋/goal resume后执行。

## 174. B3片3设计：章节admit（§4.7，待触发确认，未push）
- 消费者盘点：`convertLegacyChapterCities`（state＋raw→编译具名形，192锁）／`captureCityDefinitions`（192锁＋x/y必填，片1储备行过不了）／`editChapterCity`（64-hex raw必填）／`chapterActiveGaps`密度门已live免改／rever…

## 173. B3实现片(2)：章节cityId键控＋191→511（已提交，未push）
- 边界解析方案（§4.6改键落为此实现：同等能力、更小 blast radius；内层记录仍槽位键控，删城重排时再议）：`gamecopy.js`五城市op接受`cityId`替代`cityIdx`…

## 172. B3实现片(1)：cities.create服务端签发（已提交，未push）
- `server/gamecopy.js` cities模块新增`create:{name,numbers?}`：姓名沿rename门（cityName／1..12码点／409重名）、numbers沿既有七字段0..65535门；签发`city-NNN`（既有最大序号＋1，pad3），槽位`existing.length`（只增不减故稠密）…

## 171. CITY后继：B2重录＋B5基线（goal complete，§176–184继续推进）
- 用户目标：完整实现破192后编辑工作台建档可玩＋玩家侧可运行；旧工作台上架游戏可删，无需迁移。已按组合授权推进：B1本地提交／B2重录／B3服务端签发／B4立项／B5全量；提交与推送分别授权，本轮只本地提交，不push、不部署、不动真实数据。

## 170. CITY-CAPACITY-1：本轮收敛检查点（goal complete，commit 8ba841f）
- 本轮目标：按计划从C0审计推进至M192／193／257验证与文档收敛（goal `980ce3d7`，已complete；耗时10h31m，tokens 8,237,552）。地图保持384×256；D1–D6仅实施已批准项，D2／D4／费用未动。

## 169. CITY-CAPACITY-1/C5：M192后开放（v3包可玩准入，用户批准执行）
- VPUBLISH后端链补查：`verify_copy_publish_parity`装配期即报`available library consumer fingerprint mismatch`，stash基线同败——registry记录hash与检出consumer文件偏斜（检出换行嫌疑），非CITY回归；改换行策略或重录指纹超出本轮授权…

## 168. CITY-CAPACITY-1/C6(c)：发布器v3-role全链同切（用户批准实施）
- 发布器按`compiled.roadGraph.version`发射三元组（v2逐字节不变；v3为schema 2／studio-app-3／native-road-v3；未知版本422拒收）；玩家`playerpack`＋`playerenvironment`双准入并拒混搭；`trials.js`未动（v2-only）。见[计划C6…

## 167. CITY-CAPACITY-1/C8：证据登记更新（VGROUP闭环）
- C8-1登记：VGROUP→✓（C7-J四配方浏览器：放置／拆散／删门／撤销／保存重读／两视口一致）；VISOLATION证据补C7-J模板浏览器；闭环表头加C7-A–C7-J。VPUBLISH仍✗（待C6c字段冻结确认；后继§168用户批准后已接C6c，VPUBLISH改△部分）。VEVENT为NA（D2未批准）。

## 166. CITY-CAPACITY-1/C7：四模板浏览器覆盖
- 新`tools/verify_city_group_browser.mjs`真实Chromium一次通过：四配方页内置放／拆散／删门（测试签发cityId，目录`canPlace`仍false故无UI点击流）＋JSON保存重读逐字节一致＋重读态可继续disband；两视口（1280×800／800×600）结果digest一致，零页错误／…

## 165. CITY-CAPACITY-1/C7：撤销语义锁定（单命令单元＋取消零写）
- 据点组三操作经`basemap.js`共用stage管线：单次stage即一undo单元，undo从snapshot重算preview，save唯一写口，dispose／setIdentity只清本地态。见[计划§9.10.35]…

## 164. CITY-CAPACITY-1/C7：删门（先解绑＋换原子墙）
- `componenttools.js:removeCityGate`删一门格：端口须存在（身份三项一致）＋引用该据点的道路须先解绑（模型无端口级引用，按city判，有路拒删且路不动）＋换墙原子tile门＋门格未被占；全有或全无（注销端口＋落墙装饰不入组，组链其它成员不动）。`occupiedCells`移入`componenttools.…

## 163. CITY-CAPACITY-1/C7：拆散解组
- `componenttools.js:disbandCityGroup(source,cityId)`只摘`city-group-<cityId>`组链（装饰独立保留、端口元数据保留、记录不动；未知组fail-closed）＋`mapcommands.js`新增`city-group-disband`命令；`reconcileMapSel…

## 162. CITY-CAPACITY-1/C7：画布放置解禁
- `mapcanvas.js decoration-place`：据点组materialId有caller签发`cityId`时走预检（锚点取选中格）＋物化（`newId`复用画布工厂）＋`stage({op:'city-group-place',materialized})`；无`cityId`沿用预览拒绝（既有用例逐字不变）。画布不签发…

## 161. CITY-CAPACITY-1/C7：放置落源与调和组保留
- `placeCityGroup(source,materialized)`落源（装饰实例＋`cityGatePorts`＋`selectionGroups`条目，全有或全无，原子tile形状门，不写copy模型）；`mapcommands.js`新增`city-group-place`命令；`reconcileMapSelectionGr…

## 160. CITY-CAPACITY-1/C7：放置物化变换首片（纯函数＋单测）
- 新增`materializeCityGroupPlacement(plan,{cityId,newId})`（同文件）：门格只出`cityId:gateIndex`端口元数据（不生路），非门格按行序出原子`tile-<byte>`装饰描述，组链装饰实例id；copy模型行与章节覆盖不在此写。见[计划C7]…

## 159. CITY-CAPACITY-1/C7：放置预检首片（纯函数＋单测）
- 新增`planCityGroupPlacement`（`web/src/editor/citygroupplacement.js`）：配方形状／锚点／`cityTypes`门，整单越界拒绝（`OUT_OF_BOUNDS`），装饰足迹＋道路构件＋placement占格冲突拒绝（`CELL_OCCUPIED`），返回冻结计划…

## 158. CITY-CAPACITY-1/C7：引用清单查询首片（方法＋单测，无路由）
- `DraftTopology.references(tokenHash,game,cityId)`只读：触达道路、待定移动意图、覆盖这些路的重建记录；坏身份fail-closed（`TOPOLOGY_CITY_ID`422／builtin403），未知城返回空而不报错，永不写表。新`verify_topology_references`3…

## 157. CITY-CAPACITY-1/C8：VPERF codec基线
- 新增`tools/bench_m257_perf.mjs`（257节点v3链图，i5-7500实测）：checked编码10.3ms、快照2.1ms、端到端索引搜索2.1ms（256次owner读）、堆~8MiB；场景级assembly／月度耗时未录。C8-1登记VPERF改△。无产品代码变更，不重建bundle。

## 156. CITY-CAPACITY-1/C6(c)：发布器v3-role字段冻结方案（纯文档，待确认）
- 冻结三元组：v3正式包`schemaVersion: 2`／`buildFormat: 'studio-app-3'`／roadGraph role `'native-road-v3'`；其余role／MIME／URL／world／manifest结构／compilerRevision不动。发布器按图版本发射，玩家双准入并拒混搭；`tri…

## 155. CITY-CAPACITY-1/C7：受限创建／拆散／删门引用清单设计（纯文档）
- 据点组合同新增 §4（C7-A）：放置三路物化（主表新行稳定cityId、门只建端口元数据不自动生路、余格进装饰表成组）、拆散只摘组链、删门须先解绑道路引用（有路引用拒删）、引用清单（copy模型／地图源／编译nodeScan与章初态与battleMapId／栈与DTO）、非目标（旋转翻转对象锁、自动生路／分章、超占地形）。实施前置…

## 154. CITY-CAPACITY-1/C9：同一模型与AGENTS回流
- 同一生产模型核查：`web/src/game`无gameId分流；残余`!==192`门均为DOS raw／legacy转换格式门（warconsumer type1别名、FFFF别名、`convertLegacy*`、`editChapterCityNative`），新城在其处fail-closed，无数量回退。未删除任何战术／人物模块…

## 153. CITY-CAPACITY-1/C8：残余192门收敛＋§7验收登记
- 修完：`ai.js`道路节点桥（`rawRoadNodeId`加`nodeCount`参数三调用点传live，`markLegionAtRoadNode`改live上限）与灭亡横扫（`readCityCount`能力缺省192＋io门／`cityAt`门放live）；extinction4FCE新增200城横扫用例。有意保留：cityph…

## 152. CITY-CAPACITY-1/C7：设计分解（纯文档）
- C7无放宽式改动：copy城市模型已按`cityId`键控无192门，地图命令走共用核心；UI硬命中仅两处展示文案，其余为素材ID／像素高度误命中；服务端仅模板profile名字符串。剩余为新功能轨（受限创建／移动移除／删除命令原子边界、拆组删门引用清单、章节配置同数据、撤销语义、四模板浏览器覆盖），须先出设计，C6(c)字段冻结确认后可…

## 151. CITY-CAPACITY-1/C6：游戏级数据copy面live长度
- `gamecopy.js`城市主表／引用校验／人物槽位／组过滤改live长度（`191→cities.length-1`等），唯一键`city-${index}`补旧数据fallback；`copyprofile.js`源检`192→game.cities.length`（默认192）。copy档案28/28全过（含257城档案）。bun…

## 150. CITY-CAPACITY-1/C5：257城完整store往返（测试-only）
- 合成257城v3 fresh装配→`snapshotState`→`saveJSON`→内存店put/get（文本逐字节一致、记录deepEqual）→`admitSavedScenario`→prepare restore→257城／末城归属1／缓存0。新用例一次通过，admission 6/6；`prepareFresh`新增返回`t…

## 149. CITY-CAPACITY-1/C5：剩余三项设计分解（纯文档）
- 玩家包准入三处v2钉死（`playerpack.js:10/:69`、`playerenvironment.js:16`），须schema2／studio-app-3／v3-role全链同切且字段先冻结，C6发布器未产出前不动代码；存档无需新格式（`savegame.js`无版本门，快照v1与metadata均已版本无关），剩余为257城…

## 148. CITY-CAPACITY-1/C5：M192真实图统一链里程碑
- 真实内置192城（同修订game-source.json＋roads.json，节点坐标192/192命中真实城市）走统一链：编译索引逐槽一致、fresh装配末城归属／缓存、真实图索引搜索found（旧地址读永不触发）、JSON快照／恢复往返保留。新`verify_m192_unified_chain`3/3。见[计划C5]…

## 147. CITY-CAPACITY-1/C5-2：编译输出索引摘要
- `compileGameSource`输出新增`cityIndex`（dense槽／cityId／坐标）与`chapterDigests`（逐章state规范摘要，JSON稳定，供C6按章失效）；`battleMapId`绑定表不发射（`game.cities`无该字段是schema事实，C6作者模型工作）；章初态切片仍未接线…

## 146. CITY-CAPACITY-1/C5-1：编译路径动态槽位
- `validateGameSource`城数1..512、槽位dense 0..N-1；`chapterActiveGaps`两锁、`applySharedCityData`同契；`trialcompile`以nodeScan为计数／位置权威（替代FIXED_CITY_BINDINGS，槽序＝扫描序）；`encodeRoadGraphV2…

## 145. CITY-CAPACITY-1/M257(h)：257城真实浏览器场景
- 新增`tools/verify_road_v3_browser.mjs`真实Chromium一次通过：`roads.json`拦截服务257城v3图（初版误拦`/road_graph.json`，默认世界资产实为`content/.../roads.json`，已修正），页内合成catalog／world／257城raw…

## 144. CITY-CAPACITY-1/M257(h)：浏览器harness复核（已被§145接续）
- 本环境此前判无浏览器，复查发现`%LOCALAPPDATA%/ms-playwright`已有chromium/headless_shell多版本。`verify_road_cold_load_browser.mjs`真实Chromium可跑：主冷加载流程（fresh装配＋快照＋道路搜索共享路径）全部断言通过；尾部坏图拒绝断言失败，sta…

## 143. CITY-CAPACITY-1/M257(g)：257城移动与月度深路径
- movement夹具加`nodeCount`与v3边基址（`version!==1`统一原生初始化）；`native_faction_fixture`192硬门改live长度＋逐槽保留（根因：覆盖records致257城缓存合成拒收）。M257移动用例（首点`[2,10,0x810,0x2000,4]`、v3工作区锁定）与fiscal25…

## 142. CITY-CAPACITY-1/M257(f)：装配v3准入
- 准入门v2→v2|v3：memory新增`maxNodesForVersion`／`edgeBaseForVersion`（单源；未知版本 fail-closed）；roadgraph装配／原图／边地址三函数版本化（v1保持旧256界可装载）；assembly元数据／可玩／P76／容量／初始化／context／snapshot放行v3；s…

## 141. CITY-CAPACITY-1/M257(e)：月度三循环与budgets门改live长度
- 方案A实施：原生三循环经可选`readCityCount`（缺省192，旧mock逐字节一致）；场景IO提供并放宽城市门；财政recount改`&0xffff`；外交邻居门改`>=cityCount`（C1C byte存储上限另行处理）；FFFF别名raw门保留。见[计划§9.10.29]…

## 140. CITY-CAPACITY-1/M257(d)：F23存取扩域
- F23存取byte扩word（可达域与DOS一致，阈值／min表达式不动）：nativefactions断言、`originalfactiontick`3E25、`originalmonthlydiplomacy`30B0、fiscal／diplomacy IO读数门；capture±1改word域回绕`&65535`…

## 139. CITY-CAPACITY-1/M257(c)：边类标记版本跟随
- 五处`>=0x800／<0x800`边判改为版本相关`edgeBase`（缺省`0x800`）：movement选边经`io`透传、`performOriginalRoadAction`两处与arrival handler5经同一`io`字段、retreat经新`edgeBase`参数装配。`cx>=0x8000`费用高位与`0x20`槽…

## 138. CITY-CAPACITY-1/M257(b)：search区域参数与接线
- `searchOriginalRoadMemory`新增可选`regions{scratchEnd,queueBase}`（缺省v2逐字节一致；环模替代`&0xFBFF`；非法区域拒收）；`searchRegionsFor(layout)`供装配；movement经`io`透传，retreat经新`regions`参数装配…

## 137. CITY-CAPACITY-1/M257(a)：memory v3编码与checked
- `originalroadmemory.js`版本参数化：v2逐字节不变；v3保持`node=slot*8`，`edgeBase=align16(N*8)`（257城`0x810`），上限512；编码／checked／checkpoint往返均经`edgeBase`；新增冻结`roadLayout`供搜索步骤(b)。见[计划§9.10.2…

## 136. CITY-CAPACITY-1/M257：v3重编号与财政域扩宽设计（纯文档）
- M257需两处并行改造：v3区域重编号（第257节点基址`0x800`撞边基址；连带搜索访问标记`+0x8000`落入队列区、队列环掩码`0xFBFF`、三处`>=0x800`边判）与F23存取扩域…

## 135. CITY-CAPACITY-1/C0：准入放行1..256与M193验证
- 用户明确授权阻塞项按目标需要继续（此前保留门解除）。roadmemory／roadgraph／assembly三处192门改live长度1..256（node*8<0x800；257+需v3重编号），加`roadNodeCount()`；cityCache加`cityCount`（默认192），装配传live长度；citySlots保留为…

## 134. CITY-CAPACITY-1/C4：俘虏城市门与首都扫描动态化＋保留门确认
- capture的`cityAt`与`capital6A3D`扫描改live长度（缺表沿用192界，诊断不变）。同时确认两处有意保留：`STRATEGIC_LAYOUT.citySlots`装配准入门（产品准入仍192，解除等于放行生产，未授权）与月度／财政城市循环＋F23算术域（未批准，不动）。见[计划§9.10.22]…

## 133. CITY-CAPACITY-1/C3/C5：编成／增援／迁都城市门动态化
- 6F89首都门、412B首都门去192短路（`idx`身份校验保留）；6A3D扫描改`io.cityCount ?? 192`（生产io提供live长度）。诊断标签与fail-closed不变，192城行为一致。见[计划§9.10.21]…

## 132. CITY-CAPACITY-1/C1：fresh缓存合成与初态live长度
- `synthesizeScenarioCityCache`与`initializeScenarioCityNativeInputs`改按live城市表长度（城／记录等长＋逐槽身份）；192城逐字节不变。`createScenarioCityCache`的192门（存档面）不动，超192 span在其处fail-closed。见[计划§9.…

## 131. CITY-CAPACITY-1/C2/C3：寻路索引读契约注入
- `searchOriginalRoadMemory`新增可选`readCityOwnerAtNode`＋`cityNodeBound`（缺省旧契约）；movement选边与retreat 487B在有`readCityOwner`能力时注入（`readRoadNodeOwner`＋共享`cityNodeBoundOf`），无能力mock走…

## 130. CITY-CAPACITY-1/C4：攻城入口城市门动态长度
- `performScenarioSiegeEntry`的私有指针`cityAt`与28BB入口门改用共享`cityAtRoadPointer`及live长度＋`idx`身份校验，诊断标签不变，失败仍fail-closed。192城行为不变；高索引完整攻城链未验证，不声称可玩。见[计划§9.10.18]…

## 129. CITY-CAPACITY-1/C3：撤退驻留与返回动态长度
- 474A驻留检查改live城市域＋`roadNodeToCitySlot`解槽＋索引读主权（城市表缺失沿用旧界，错位仍fail-closed）；`originalRetreatRoute`的BX返回校验改live长度（旧`0x17e0`为192城写法）。487B体内部与寻路plumbing仍走旧地址API；siege手写mock已补`re…

## 128. CITY-CAPACITY-1/C3：移动节点域动态长度
- movement目标桥与城市节点门（`targetNode`读写、`cityAt`、`nodeize`落点）改按live城市长度动态化，0x800边／节点种属标记不动，城市表缺失时沿用旧门。首版误将 bound 常量放进`movementIO`作用域致5项失败，已提模块级`maxTargetNodeOf`／`cityNodeBoundOf…

## 127. CITY-CAPACITY-1/C3：到达指针桥动态长度
- `originalroadstate.js`新增`cityAtRoadPointer`（`0x840+slot*32`同一起始／对齐，按live长度验`idx`，不设192门）；`arriveOriginalRoad`私有`cityAtPointer`全部六处改用共享体，失败仍为带指针与指令的RangeError。旧注释头在本轮一次误伤后…

## 126. CITY-CAPACITY-1/C3：移动所属索引解槽
- `performOriginalRoadAction`内联`cityOwner(node)`改用`roadNodeToCitySlot`解槽＋`readCityOwner(slot,"movement-owner")`；47BB寻路plumbing仍走旧地址API（共享搜索契约另行转移），`cityAt`／目标桥／retreat／`cac…

## 125. CITY-CAPACITY-1/C3：到达首读索引解槽
- `originalroadstate.js`新增`roadNodeToCitySlot`：`BX`（8*slot）经同一u16回绕／对齐解槽并验`idx`身份，不设192门；`arriveOriginalRoad`首读改`readCityOwner(slot,"28F4-first")`，错位／回绕／身份错位fail-closed。mov…

## 124. CITY-CAPACITY-1/C3：到达刷新现属索引
- `refreshOriginalCityCache`的3F11现属读取改用`readCityOwner(idx,"3F11")`，与军事／治理共用索引体；旧属比较、F17写回门、冷却与C18不变。到达首读仍走旧地址API。详细边界见[所属索引]…

## 123. CITY-CAPACITY-1/C3：战略邻居索引边界
- `originalroadstate.js`新增单格C1C解码服务，FF为空引用，不压缩／排序／修复；同一军事叶经Scenario两处返回接入，仍四槽懒读、null终止，其它消费者保留各自语义。旧byte解码不能产生高索引；显式nullable-index输入验证192/254/255/256可派令且仅null终止。详细边界见[行军说明]…

## 122. CITY-CAPACITY-1/C3：城市所属索引服务
- `originalroadstate.js`新增索引读取体，旧地址适配保192门并复用；Scenario准备／能力提供readCityOwner，同一军事／请求后继／治理九处去DS地址及内部重复192门。所有者byte域与null→18h不变，未知仍拒，保原故障阶段标签。详细边界见[行军说明]…

## 121. CITY-CAPACITY-1/C3：军事候选身份与标记分离
- 同一`runOriginalCityMilitary`改用有序候选记录和独立敌对标记，取消私有16-byte表的FE/FF城市身份混用；不改四邻读取／byte威胁／重复owner与缓存读取、原DEC选择和已批准四候选低0规则。详细维护源见[行军说明]…

## 120. CITY-CAPACITY-1/C1/C2：战略邻接顺序与拓扑一致性
- D6生成前的核查发现不能用导航端口重建导入战略顺序：登记3840行连接多重集合均一致，但2600行非空顺序不同；导航114节点有中间空槽，战略数组无中间空槽。只读KI复核88CC..895D位序，完整证据／边界维护于[战后§12.3.1]…

## 119. CITY-CAPACITY-1/C1/C3：章节城市引用与初态编译
- 新增`chaptercitycompile.js`，按捕获的cityOrder编译城市、22物理势力城市引用及C18；不截byte身份，不用主表新章默认覆盖旧章值，不丢未放置引用。陈旧源计数拒绝，明确不用于live F23或恢复。详细维护源见[计划§9.10.11]…

## 118. CITY-CAPACITY-1/C4：真实目录绑定收据与受控城损输出
- `verify_city_source_registered.mjs`改用现行程序攻城目录ID，新增独立资源SHA／长度、目录文件SHA及目录模块代码SHA；不伪装成原41角色之一，不改旧r1–r8。独占r9报告通过192城实际目录绑定、20章3840城市行、440物理势力槽和39计数差异，以及全部既有寻路／选边／撤退对照。

## 117. CITY-CAPACITY-1/C4：攻城资源ID与实际目标分离
- 新增`content/battlemapcatalog.js`，捕获现行192攻城目录为`ki-1995:siege:*`，排除野战目录；只核目录元数据，不替代布局／导航／资源身份校验。`createSiegeProjection`消费显式battleMapId，资源directoryIndex与实际city对象分离；无效显式绑定拒绝，旧…

## 116. CITY-CAPACITY-1/C2：真实登记图撤退决策对照
- 扩现有登记源审计，不改产品运行代码：192节点／254边中点±方向、首都每16城采样并含当前位置／边端／null、默认章／全己／全外三种所属配置，共30720次487B决策与原适配器逐结果／惰性所属读取序一致。未执行去向或军团写回，详细配置与三组轨迹SHA见[行军笔记]…

## 115. CITY-CAPACITY-1/C2：结构化487B撤退选址
- 新`structuredroadretreat.js`保原端点筛选／读取序及反搜选城，分开无首都／外属端点／无路／下一城外属，不产生假城市或直接执行去向。静态487B..491B窗口亲读并锁SHA，详细证据及限制见[行军笔记]…

## 114. CITY-CAPACITY-1/D5：运行选边耗尽停止动作
- 原生47BB耗尽在高费用门之前明确返回unreachable；两个动作入口恢复占格，保位置／目标，不读假0800边、不因无路调用291A。路上重算无路时保留原pending-bit，使下次到期不沿旧方向偷走；可达替换可恢复正常移动。原日结／尾段／余槽保持。详细维护源：[运行无路边界]…

## 113. CITY-CAPACITY-1/C2：登记图选边三profile对照
- 扩`verify_city_source_registered.mjs`，在真实登记192节点／254边上，以全节点及每边中点正反方向、每16城目标加边两端、command1/10、默认／全己／全外属三profile作56160次47BB决定对照。位置／status bit0、其它状态位不变、owner读取及原写集次序逐项通过；原5217…

## 112. CITY-CAPACITY-1/C2：结构化位置选边隔离核
- 新`structuredroadselection.js`复用491B结构化反搜，区分城市首末点选边、边内保点改向、已经到达、无路及原费用去向请求；自身不写军团／占格、不执行291A、不改生产准入。原47BB完整窗口已再次只读复核，详细维护源见[选边边界]…

## 111. CITY-CAPACITY-1/C2：结构化寻路核与登记图查询对照
- 新`structuredroadsearch.js`保491B批次／交错／双端口次序，动态数组不截城市索引或队列计数；明确区分快捷、命中、耗尽。仍保原word费用语义，不抢先决定D5费用扩域，不接运行／保存。原窗再次只读核验，详细维护源见[寻路边界]…

## 110. CITY-CAPACITY-1/C2：结构化道路运输投影
- 新增`structuredroadgraph.js`，输出v3具名节点／端口／边，消除运输数据中的node×8、0800h边区及方向高位；保四槽顺序、边／点次序、byte费用／flags和bounds。已捕获城市片段不重复校验，未知道路在投影边界检查；不推导新费用或替换实际寻路。

## 109. CITY-CAPACITY-1/C1：导入城市具名初态片段
- `chaptercityconversion.js`新增initializer，保原attr／冷却／旧属／边界计数／灾度／C18，四邻接转稳定cityId或null但不改顺序／尾槽；不把旧章拉平成新城零初态。缺完整raw、重复raw或同名字段冲突、无法映射邻居拒绝，不猜填。详细维护源：[计划§9.10.5]…

## 108. CITY-CAPACITY-1/C1：章节城市引用与计数差异投影
- 新增`chaptercityconversion.js`及5项纯内存测试：保每章七个城市值、转换首都／两条战略目标到稳定cityId、FF→null；按已批准D6重计城数并同时报告原raw／公开计数。原章与raw不写回，不处理其它章状态或原生初态。

## 107. CITY-CAPACITY-1/C1：实际登记源片段转换
- 只读固定41个登记Web输入，经共同full-copy内存投影核到实际placement额外含`id/componentRef/variantRef/importRef`。原纯三字段validator会拒绝真实形状；补同形负控先红，再显式保留／校验四字段及实例ID唯一，不在工具里删字段造通过。

## 106. CITY-CAPACITY-1/C1：旧据点片段转换及离线独占输出
- 新增`citysourceconversion.js`：明确旧slot→cityOrder、坐标与slot退到legacyBindings，指定默认章一次取城兵上限，战场ID由调用方显式传入。完整章状态／raw／首都不动，不声称整个GameSource已转换；合同见[计划§9.10.2]…

## 105. CITY-CAPACITY-1/C1：据点源属性边界
- 新增`citysource.js:captureCitySource`，复用identity模块，明确新据点字段／placement坐标唯一权威、草稿缺项与已放置城严格完整性；旧slot／坐标／raw及未知placement字段拒绝而非静默剥离。新章默认上限不拉平已有章节；资源绑定这里只核字符串，不代目录／运行检查。详细合同见[计划§9.…

## 104. CITY-CAPACITY-1/D6：城兵上限原证与导入负边界
- 复核KI的420B治理双byte读取及575C预算读取，确认`troops_cap`是C12独立输入；新源必须逐章保留，不由类型／战场推算，也不拉平成首章上限。详细维护源：[字段原证](re-notes-entity-fields.md#city-capacity-troops-cap)。

## 103. CITY-CAPACITY-1/D1：消息自身续段失败暂停
- 补`completeRequest`中40F6／414F／40B3异步错误边界：该段在批次resume之前，原先错误逃逸会清掉request却不进入failure hold。现保已写前缀、暂停并禁存，不恢复／重跑批次。

## 102. CITY-CAPACITY-1/D1：192相位分配及多城续段接线
- 新增`web/src/game/cityphase.js`并接入原生aiTick，按已批准192相位分配城市区间；military/daily阶段闭包按城市顺序恢复，整个批次返回后才推进相位与唯一军团batch。空城市批次也走军团；同步无UI不能重入。旧192结果不变，历史cityIndex／_cityTickCursor名称暂保留为相位…

## 101. CITY-CAPACITY-1/D1：原生TALK38治理与军团续段
- `aiTick`原生分支接入军事请求的一次性resume，消息未关不治理／灾损、不推进城市／军团游标；同步无UI、重复关闭、调用方options变更、旧clock回调及后继失败保前缀／禁存均有正负控。详细源在[行军笔记](re-notes-march-pathfinding.md#city-capacity-request-tail)。这…

## 100. CITY-CAPACITY-1/D5：主动迁都无候选不再写189
- 已批准的D5子项落实于`originalcapitalrelocation.js`：选择器返回null，type8在读旧首都／写F03之前返回`no-capital-candidate`。正常候选与真实城189仍合法；不改捕获4DF0、灭亡、提案显式commit或4502写序，不放宽192门。

## 99. CITY-CAPACITY-1/D3：批准记录与去除两处跨记录别名
- 批准：用户对§98集中请求回复“同意建议”，确认D1、D3、D5及D6新城初态／导入计数；随后恢复goal，当前active。D2、D4、费用域及财政算术扩域仍未批。历史“D1–D6未批／goal阻塞”仅适用于此前批次，现行维护源为[计划§9.4]…

## 98. CITY-CAPACITY-1：实施前产品决定确认
- 身份／中心纯数据子模块已完成本批验证，但不是C1整项完成。下一阶段接源初态及运行引用会依赖尚未批准的Web行为；不把用户的“继续”解释成批准D1–D6，不靠继续堆叠未接线模块绕开决定。

## 97. CITY-CAPACITY-1/C1：放置中心边界及F23域续查
- `compileCityIdentity`补固定384×256整数中心、单格唯一校验；不改建筑footprint、章引用及可玩准入。四角／移动不改索引、重复中心、非法坐标及98304互异中心的纯数据投影加入测试，总计37/37；大样本不代表可玩容量认证。

## 96. CITY-CAPACITY-1/C1：独立城市身份投影子模块
- 按计划允许先实现已闭合纯数据合同，新增`cityidentity.js:compileCityIdentity`；仅身份双射／单城单放置→cityOrder已放置子序列及索引表，不改原规则，不连接v1生产编译门。详细边界见[计划§9.10]…

## 95. CITY-CAPACITY-1/C0：目标跟踪与发布／存档外层盘点
- 用户明确要求以`/goal`持续推进；已建立活动目标，不把D1–D6提案自动视为批准。C0仍进行中。

## 94. CITY-CAPACITY-1/C0：原生事件跨月与消费边界对照
- 产物：新增`tools/verify_city_capacity_event_boundaries.mjs`，5项包含原KI窗口SHA、移页前／后延迟差异、消费后仍占位、旧当前页未消费事件丢弃、301C域外首读拒绝。固定KI只读，夹具全内存，未读SAVE或用户profile。

## 93. CITY-CAPACITY-1/C0：选都原字段纠错与事件次序复核
- 原证：只读固定`KI.EXE`，重取6A3D、33EA、301C、5358窗口并核SHA；6A55取C16类型，6A73取C00边界。详细bytes、复核命令和反例回流[去向§11.1](re-notes-legion-fate.md#111-原始绑定与调用者实锤)，扩容计划仅链接，不复制另一套机制解释。

## 92. CITY-CAPACITY-1/C0：首批字段审计与待决合同
- 授权：用户要求按扩容计划从C0开始，随后继续推进；保持384×256，保留已有修改，不提交／推送／部署／迁移真实数据。

## 91. CITY-CAPACITY-1：固定地图据点扩容计划与新会话交接
- 用户范围：最终独立Web代码支持人物／据点／道路／地图扩展；本期先保持384×256解除192据点限制。用户要求代码分析与详细设计后制定开发计划，在新对话实施。本轮只改文档，不开放新城、不改编译／运行保护门。

## 90. 锁图与据点组预览本地提交
- 授权／范围：用户要求“提交代码”，本地提交收录§87–89连续改动的19个源码／测试／文档／生成文件，包括地图拖动锁定、据点组原证配方、第八分类和四张只读原尺寸预览。不推送、不部署、不迁移真实数据。

## 89. CITY-GROUP-PREVIEW-1：据点组只读素材展示
- 授权／范围：用户要求先放进元素资源面板查看，在“据点”按钮后增加“据点组”；本轮只接展示，不等待实体绑定决定、不开放新放置或拆散。保留§87–88未提交改动；没有commit／push／部署／真实迁移授权。

## 88. CITY-GROUP-1：四套配方与放置接缝待确认
- 授权／范围：用户确认四种通用据点组，25／9／3／3格、中心锚点、关卡中间城楼＋两门最终3格，按16px组合尺寸预览，要求开始实施。开始时保留§87八个未提交文件，没有提交／推送／部署或真实数据迁移授权。

## 87. MAP-PAN-LOCK-1：地图拖动锁定切换
- 授权／范围：用户指出锁图按钮未生效，明确要求锁定／解锁切换、锁后地图不能拖动，作为后续对象操作基础。开工`fdb9d67`、工作区干净；本轮只改展示层指针处理及按钮，不改对象能力／规则／源结构，没有新增commit／push／部署授权。

## 86. 地图工作台布局与操作本地提交
- 授权／范围：用户确认当前效果并要求提交代码。本节所在提交收录§84–85连续改造的27个源码／测试／文档／生成文件，包括右键调序、浮动图层、紧凑布局、素材懒加载、100%和按钮左／提示右对齐；不推送、不部署、不迁移真实数据。

## 85. MAP-SPACE-5：紧凑布局与原始比例
- 范围／授权：用户多次标注截图要求把顶部／右侧空白还给地图，明确工具后同行显示状态、删除长说明、右栏固定、导航折叠全宽给地图、地图与素材栏底对齐；追加浮动图层图标无框／方形／悬停边框，以及放大和缩小间的100%按钮。只改展示布局及调用既有缩放动作，保留§84全部未提交修改；没有commit／push／部署／真实迁移授权。

## 84. MAP-SPACE-4：地图优先布局与对象右键菜单
- 授权／范围：用户提供布局截图，要求尽量留地图空间、提示合入标题下、两字按钮／锁图图标、两行分类TAB、32px图样下ID和无分页懒加载、中栏改可拖浮层、选中对象右键操作；追加导航折叠时地图自适应，并要求按此实施。开工HEAD为`a7237ca`、工作区干净；本轮无commit／push／部署／真实迁移授权。

## 83. 海底与原子素材库本地提交
- 授权／范围：用户要求「提交代码」，仅本地commit，不push。本节所在提交收录§78文档整理及§79–82连续地图改造：全幅底图与地面轮廓、单格七类库、32px预览、固定春季与中立据点展示，共40个源码／测试／文档／生成物文件。保留旧地图和原资源身份，不包含运行数据、profile、缓存或临时报告。

## 82. ATOMIC-SPRING-NEUTRAL-3：固定春季与中立据点素材
- 范围：用户要求移除四季选择，地图／素材固定春季、编辑布局自动供四季使用；据点库只显示中立外观，所属配色由游戏动态决定。仅展示与工作台动作投影，不新增配色或道路／据点放置能力；旧定义、实例和256原子身份全部保留。未授权提交／推送／部署／真实数据迁移，保留此前全部改动。

## 81. ATOMIC-PREVIEW-2：分类更正、植被核对与32px预览
- 范围：用户以六张截图要求蓝水岸边归水系、水系第一张回地面，核对疑似缺失的植被图样，并把右侧16×16预览放大到32×32。仅展示分类／缩略图；地图格、幽灵、规则、准入及持久数据不变。保留全部先前未提交改动，无commit／push／部署授权。

## 80. ATOMIC-CATALOG-1：单格素材库与单层分类
- 授权／范围：用户要求所有素材16×16原子化，取消组合卡、一级层分类与各库导航，仅剩末级分类；追加水路／桥梁归道路、底图自然露出及去掉素材悬停，最后明确继续完成。详细维护源[单格库合同](map-atomic-catalog-contract.md)。不是拆除现有地图实例，也不授权新道路／据点／配色规则；保留此前全部本地改动，无提交／推送…

## 79. SEA-GROUND-1：全幅海域基底与地面轮廓
- 授权与产品合同：用户确认全图95海域基底；取消手工地理及单格／范围填海；仅地面构成小地图陆地，其他装饰不参与轮廓；一级固定基底／装饰／道路／据点，二级分类独立。详细维护源为[新合同](map-sea-ground-contract.md)，属于Web决定，不是新KI机制。保留§78用户文档改动，不提交／推送／部署或访问真实SAVE/pro…

## 78. Project memory与journal精简（历史批次）
- 范围：只改仓库`AGENTS.md`与本页。开工核HEAD和本地`github/main`均为`664819d`、工作区干净；不修改产品、测试、资源、全局约定或历史归档。

## 77. 第二阶段完整提交审查（用户另行授权）
- 用户授权完整审查、一次提交并推送；实际保留45文件：6项目文档、13产品源码、19测试／工具、2构建壳产物、5羽扇图片。没有迁移文件；图片作为产品素材保留，未擅自接运行入口。

## 76. 第二阶段S2局部UI与S0资源盘点
- > 本节现为该会话的完成摘要；标题保留旧链接。S0–S6已闭合，不再逐轮重复“未完成”。完整配方／SHA／原图见证维护于[准入说明§2.1a–y](re-notes-editor-map-admission.md#sprite-g02-coast-completion)，逐项要求与版本化收据维护于[审计]…

## 75. 地图实测反馈与第二阶段设计交接
- 历史设计轮只交付[产品设计](map-workspace-sprite-library-design.md)和[接续提示词](map-workspace-sprite-library-handoff.md)，未授权生产操作。六项意见及S0–S6后来由§76实施；提示词已标历史，不再作为当前状态或新授权。

## 74. 全量审查、统一提交与推送
- 基础地图上一批审查65文件，产品／测试／文档及分级复验见[完成核对](system-base-map-completion-audit.md)；提交`172ffe0`已推送GitHub。当时宿主未确认、历史测试缺口仍保留，不等于部署。不要与§77的45文件提交混用收据。

## 73. 本轮 project memory / journal 整理
- 历史整理将长期规则归`AGENTS.md`、截至§72详单归[归档](checkpoint-journal-archive-through-72.md)，保留70旧标题／锚点转接；未更改产品。后继精简见§78，不重载旧临时计数或授权。

## 归档索引与兼容锚点

以下旧定位只转接历史记录，不恢复旧待办或授权。全部批次详见[归档](checkpoint-journal-archive-through-72.md)；无法恢复的更早收据见[缺口索引](historical-receipts.md)。

<!-- markdownlint-disable MD033 -->
<a id="72-基础地图最终依赖审计与分级复验"></a><a id="71-浏览器创建入口与画布编辑验收补齐"></a><a id="70-真实https后端浏览器保存与会话dto修正"></a>
§70–72：[真实后端、浏览器补齐与最终审计](checkpoint-journal-archive-through-72.md#72-基础地图最终依赖审计与分级复验)。
<a id="69-实际地图审批包与玩家加载器接缝"></a><a id="68-游戏地图展示壳接线"></a><a id="67-游戏地图共享编辑会话前置"></a><a id="66-基础地图组合选取与诊断反馈"></a><a id="65-管理员基础地图首版画布与构建壳接线"></a>
§65–69：[两工作台、会话及运行加载器](checkpoint-journal-archive-through-72.md#69-实际地图审批包与玩家加载器接缝)。
<a id="64-基础地图统一创建接线与真实https验证"></a><a id="63-基础地图应用装配固定schema与删除隔离"></a><a id="62-基础地图快照实例化与单槽存储核心"></a><a id="61-基础地图a方案分片与独立候选转换"></a><a id="60-基础地图b0源盘点历史后继见61"></a><a id="59-系统基础地图独立化设计与任务"></a>
§59–64：[盘点、合同与统一创建](checkpoint-journal-archive-through-72.md#64-基础地图统一创建接线与真实https验证)。
<a id="58-全量工作区审查与统一提交"></a><a id="57-本轮-project-memoryjournal-整理"></a><a id="56-检验窗口沿用阻塞弹窗布局"></a><a id="55-完整复制阻塞弹窗布局调整"></a><a id="54-删除弹窗就地进度与文件清理先于库行删除"></a><a id="54-后续用户确认本地测试定向清除历史残留"></a><a id="53-copy主表初始化内置武将覆盖与持久管理员列表"></a>
§53–58：[初始化、删除与历史授权收据](checkpoint-journal-archive-through-72.md#53-copy主表初始化内置武将覆盖与持久管理员列表)。
<a id="52-全量工作区审查与统一提交批次"></a><a id="51-project-memory-与会话日志整理"></a><a id="50-copy头像目录跳过无用旧草稿使用统计"></a><a id="49-共享头像文件及资产id数字重编号"></a><a id="48-头像弹窗等尺寸加载分页按钮右对齐与数字排序"></a><a id="47-武将管理加载性能真实进度固定列宽与局部头像加载"></a>
§47–52：[画像、列表与旧提交](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。
<a id="46-编辑器展示修补与-vue-检查工具本地提交"></a><a id="45-项目级-vue-lsp-standalone-兼容工具2026-11-12"></a><a id="44-武将据点统一分页与操作列头像每页-25-张2026-11-12"></a><a id="43-武将管理固定表头行编辑与懒加载核查2026-11-12"></a><a id="42-据点面板跨模块残留回归修复2026-11-12"></a><a id="41-编辑器统一页中央四圆点加载动画2026-11-12"></a><a id="40-城池据点加载按钮旋转动画2026-11-12"></a><a id="39-城池据点列表固定表头2026-11-12"></a><a id="38-完整本地提交前审查copy发布审核默认展示层与回归"></a>
§38–46：[默认展示层及Vue检查工具](checkpoint-journal-archive-through-72.md#45-项目级-vue-lsp-standalone-兼容工具2026-11-12)。
<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a><a id="36-element-plus-默认主题与默认组件迁移本轮"></a>
§36–37：[Element Plus默认主题/组件决策（tag: architecture）](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)，现行规则在memory§3/布局规范。
<a id="14-批次-j同意上架-422-source_runtime_binding审核页重复提示2026-11-11"></a><a id="15-批次-j-2同意成功却无反馈上架管理仍待审核2026-11-11"></a><a id="34-编辑副本简化收尾删除重试打通冻结基线对齐上架章门恢复2026-11-11"></a><a id="35-游戏级武将管理重写父表库行编辑自杀旗头像相册2026-11-11"></a>
§14–15、34–35：[发布/武将旧批次](checkpoint-journal-archive-through-72.md#34-编辑副本简化收尾删除重试打通冻结基线对齐上架章门恢复2026-11-11)。
<a id="5-当前时钟系统逆向与重构本地完成"></a><a id="8-用户指定五档提速"></a><a id="6-发布主线阻塞与下一步"></a>
时钟与旧阻塞：[原归档索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-014发布整理"></a><a id="10-录像反馈后的战略性能修复"></a><a id="10-录像反馈后的战略性能修复--10-014-发布整理"></a>
表现与发布旧记录：[原归档索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<a id="11-015发布整理"></a><a id="11-编辑器vps部署前只读盘点"></a><a id="11-编辑器vps部署前只读盘点--11-015-发布整理"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署/固定库/Trial：[原归档索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)，非现行生产入口。
<a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="19–23-后台框架壳--账户管理--阶段任务--只读素材库--草稿与章节组件化"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a><a id="30-上架限制与删除追踪组件化--32-固定库身份合同授权修复--33-后台迁移提交推送与受限上线"></a>
早期Vue壳/上线：[原归档索引](checkpoint-journal-archive-through-72.md#19-后台框架壳editor-ui-1)。
<!-- markdownlint-enable MD033 -->
