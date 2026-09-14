# Checkpoint Journal

> 本文是会话日志与交接，不是长期指令或任务授权。项目事实/架构/命令见[项目记忆](../AGENTS.md)，安全与证据约定见[全局AGENTS](../../AGENTS.md)。机制结论只在对应SKILL/`re-notes`维护；此处保留关键过程、验证边界及证据入口，不复写全部逆向笔记。

## P24：AI槽调度与道路接线——当前交接

### 1. 范围与结论

- 连续AI专项覆盖外交、编成/补员、驻防/出击、移动接敌、战果、占城、撤退、返都及解散。**全AI尚未完成**；“仍在战争中全军返都”与“占城后弃守”的战役级因果未闭合，不能以局部序列替代解释。
- 槽泵/相位/F14、战斗续段、冷加载与道路字段/目标保值已有生产修复。最近子批修的是字段生命周期与缓存污染，**不是原搜索上线**；原搜索/图内存/城市归属适配及互反校验仍未接生产，源和运行道路仍v1。
- 本次整理只改文档。现场为`main`、HEAD `dd877b3cda2d9e7b5cd163daeec360f96e560e44`，暂存区空、共享脏改保留；未commit/push。此状态不是未来现场或授权，继续工作时重查。

### 2. 已完成的生产切片

| 子批 | 实际变化与边界 |
| --- | --- |
| 槽调度/创建写者 | `LegionSlotBatch`按实时固定槽执行：到期动作→日结→03尾→下一槽→天气。0B/1E与128槽03、F14为权威；当前记录退场后仍完成本槽尾。创建/重编及战果写者已接；不等于整战役认证。 |
| 战果与异步接续 | 保战前守军名单、六队与原道路位置；撤退先改目标、不传送。scene/clock/batch/ticket一次性claim防旧回调确认新战；异常保部分写、取消批次、hold/禁存。P06五例只认证首批写回，后续到期仍待补。 |
| 冷加载/保存 | `loadState`先等同世界道路/地形ready再build；await后核所有权。entry票据防交叠/回标题后复活；装配pending并入hold/保存守卫。坏图拒绝后可重试，不声称加载全过程事务回滚。保存保留实际`_markerFrame`，不补旧档方向或修原方向公式。 |
| 道路字段 | clear只清投影；选边先写0C/0E/0A，候选通过后在坐标前提交0C；节点化保0A/0C。snapshot/日费优先已知0E，build不以坐标覆盖。缺0E仍有原Web内存fallback，不是迁移/准入认证。 |
| 缓存接缝 | `prepareRoadMarchProjection`不写原字段，先校验/必要时重建投影；在真实action的outer reverse/engagement等读取之前调用，stepTo路径共用。无法投影的显式边抛错，不伪造原版无路。一般目标选路、42AB与flags等仍有旧偏差。 |
| 目标保值 | build不再用targetCity/20覆盖targetNode/14，不再把8倍数runtime id当DOS地址解码；保留0，缺失不补写。正式Web写者/IndexedDB入口已限定复核，phase1不是单位证明；原`0E==14`及其它目标消费者尚未整体接线。 |

详细已修/未修矩阵见[行军§5.5](re-notes-march-pathfinding.md#55-p24字段工程矩阵与冷加载修复非完整道路接线)；槽泵与此前P01–P24链见[AI全链](re-notes-ai-chain.md)。

### 3. 关键调试、失败与修正

1. **冷加载不能只验warm**：人工输入先误配点坐标，初红不作为生产证据；纠正为`2004h=(254,9)`后，用冻结旧main在隔离页面替换，warm通过而cold丢边，才建立有效反例。之后补交叠加载、标题取消、pending禁存/hold及坏图失败重试。坏图错误文案、可选debug输出的错误期待也单独保留。
2. **字段初红四例**：实际移动不写三字段、snapshot用旧`_march`覆盖node0E、build删残值/按坐标覆写、人工exhausted节点化丢0A/0C。接触测试另因漏绑定03失败，补合法固定槽绑定；这次是夹具错误，不是生产机制缺陷。
3. **retreat夹具混合输入**：原先build已写node0E，测试却只改坐标/手造edge `_march`，借snapshot暗中修补。现在明确设置0A/0C/0E及末点地址，保原恢复断言；人工`pointIndex==length`仅隔离写集，不证原flags会正常生成该状态。
4. **fresh首审抓到新增P1**：只在stepTo内校验太迟；真实槽先用stale edge执行outer reverse，将`-4`写入已知node的0A残值。真实slot反例复现后，将共用准备函数前置。回归比较相同规则输入有/无污染缓存的结果，不把旧算法对非交战城市的blocked行为写成原版golden。
5. **目标0被20覆盖**：新增JSON→restore→build控制先红，修后保留id `0/8/16/191`×有无目标城八组现值。cold测试原人工phase1里混入raw地址16，纠正为runtime id2，并补cold/warm目标断言。只保值，不恢复旧已损坏目标；缺目标只做静态核对。
6. **浏览器服务失败不冒根因**：`road-fields-browser-psl9susk`为3/4，lifecycle出现四次`ERR_CONNECTION_REFUSED`并在20秒等待超时。改用已审自持Node port0监听，保隔离IndexedDB与全部流程断言，追加请求失败诊断；之后通过。旧Python服务为何失败仍未知，不能从绿测倒推根因。
7. **原搜索准备并非上线**：补齐默认图有序四tag槽、byte成本、flags/bounds；候选图低32KiB与原图一致。原语保分批环队列与读写顺序；fresh指出496C独立再读被合并，补控制先红后修。互反校验补“只缺source tag”负控及私有变异控制。默认图复合native replay绑定模块SHA，三个人工所属profile共256896查询；不是DOS执行、独立费用/平局oracle、任意图或战役证书。

### 4. 相关文件与维护源

| 类别 | 文件 |
| --- | --- |
| 本批核心生产 | `web/src/game/ai.js`、`savegame.js`、`roadgraph.js`、`navigation/roadgraph.js`；冷加载涉及`web/src/main.js`、`ui/gamebar.js` |
| 槽/计数/续段 | `web/src/game/legionscheduler.js`、`legionphase.js`、`legioncounts.js`、`legioncontinuation.js`、`strategicfailure.js`；`web/src/app/battleflow.js` |
| 尚未接线原模块 | `web/src/game/navigation/originalroadsearch.js`、`originalroadmemory.js`、`originalroadstate.js` |
| 当前新增/修正测试 | `tools/verify_road_field_authority.mjs`、`verify_retreat_restore.mjs`、`verify_road_cold_load_browser.mjs`、`verify_legion_lifecycle_browser.mjs`；共用`browser_test_server.mjs` |
| 详细规则/字段 | [行军](re-notes-march-pathfinding.md)、[原字段](re-notes-custom-data.md)、[AI全链](re-notes-ai-chain.md)、[内容架构](content-architecture.md)；march/data/post-battle SKILL保摘要与原证索引 |

表内同组省略重复目录前缀。本次记忆整理未改这些代码、资产、SKILL或`re-notes`。

### 5. 验证与审阅：只按相应版本和范围成立

| 批次 | 实际结果 | 不可扩大的边界 |
| --- | --- | --- |
| 最近非浏览器focused | `road-target-focused-33.log/.json`：33个明确入口通过；包含新增道路字段8项子测试 | 不是新完整非浏览器回归；直接stepTo/人工exhausted不等于完整原调度/flags |
| 最近隔离浏览器 | `road-fields-browser-v_ev9koy/summary.json`：cold/lifecycle/clock/exit四入口4/4、0超时，11指定源前后无漂移；server helper另2单测通过 | 每入口新context/临时根；不是全Web冻结或完整浏览器套件 |
| 最近代码静态检查 | 8个JS/MJS语法及diff检查通过；20文档309本地链接无错 | 这是代码批次记录，不冒作本次纯文档检查 |
| 最近代码LSP | 8个JS路径inconclusive、5个Markdown/Skill unavailable，0确认clean；session尚有5旧warning | 不采编辑工具的clean提示或缓存沉默；不能写成诊断全过 |
| 最新保留的完整批次 | 非浏览器141：118过/23败；浏览器13：11过/2败 | 冻结旧版本。20个旧失败入口后来定向修正，不拼成新全量比例；旧opening/weather夹具修后也只限定复跑 |
| 最近独立审阅 | 字段首审BLOCK 1个新增P1→前置校验复审限定关闭→目标保值限定OK with notes | 最后native验收仍`review-required`；不是全道路/全AI审查通过 |

结果锁定各日志中的源码版本；之后有自动格式化，不能把这些SHA当永远当前值。完整失败批次分别在本机TEMP下`dragon-ai-regression-p24-nonbrowser-_s5_mu_1/`、`dragon-ai-regression-p24-browser-sux8zfsi/`。

尚余旧失败入口：`verify_delegated_autobattle.mjs`、`verify_engagement_state.mjs`、`verify_march_navigation.mjs`；不能全归为夹具问题。全量安全清单/源码版本也须更新后重跑，当前不能结项。

### 6. 当前阻塞与恢复AI开发后的下一步

1. **资源/生命周期联动**：发布v2前同时完成内容schema/校验/编译、loader/world身份、每场景原图RAM、visited/旧queue工作区及保存边界；不逐次重建/清高半区来掩盖未知。互反结构检查不是完整世界或所有caller准入。
2. **原搜索进入真实调用链**：替换`makeMarchNavigation`、节点下一跳、`47BB/487B/4DA4`及双端反搜；保CF/CX/字宽/读写顺序和实际返回值，绘图虚线不能调用有工作区写入的规则搜索。
3. **完整移动/字段消费者**：修42AB同动作改目标续行、bit1重选、flags前后门、27A2同动作节点化/日费、2808方向和0E/14/20关系；`!x/!y`吞0、整写Y与原低byte写差异仍在。不得重算已权威的0B/1E/03/F14，也不能因+22未知拒全部phase1档。
4. **补后续与全量**：P06下一到期/后续批、三旧失败、相关fresh复审；重新审I/O并固定完整入口/源码，实际跑非浏览器与隔离串行浏览器，不拼接局部结果。
5. **继续剩余原证/因果**：4300截留、+21完整callee/+22、55A6评分/占格、野战主军选择、玩家消息非局部返回与世界交错。未闭合部分保持未知，完成独立已授权工作，不重开字体支线。

本次用户请求仅整理文档；以上是交接顺序，不自动开始新实现或授权提交/推送。

### 7. 可复核证据入口

本节代码路径相对仓库；下表证据文件相对本机包 **P**：
`C:/Users/fczll/AppData/Local/Temp/dragon-ai-slot-order-parent-uudvtfid/`。
这些是定位索引，不是复制出的第二套规则；原始日志/冻结件未删除。

| 证据束 | 必要入口 |
| --- | --- |
| 槽泵/创建/计数/P06 | `slot-fix-readiness-frozen.md`、`writers-frozen/`、`counter-frozen/`、`slot-motion-count-raw.txt`、`p24-focused-lifecycle-final.log`；仓库`tools/fixtures/legion-slot-p06.json` |
| 移动原窗/首审/补录 | `movement-contract-v1/raw/movement.txt`、`movement-contract-first.md`、`movement-search-addendum.md`、`road-field-serialization-audit-first.md` |
| 图候选/搜索/容量边界 | `road-source-import-v1/world/roads.json`、`road-memory-reconstruction.json`、`road-queue-bound-proof.md`、`road-bound-proof-review-first.md`、`original-road-topology-default.json/.log`、`road-topology-review-first.md`、`topology-source-tag-mutation-v1/` |
| 冷加载/方向先前审阅 | `road-stage-review-v1/`、`cold-load-code-review-first.md`、`road-memory-codec-review-first.md`、`marker-save-review-first.md`、`road-stage-followup-statuses.json` |
| 当前字段red/夹具/前置P1 | `road-authority-before-v1/`、`road-field-authority-red.log`、`road-field-authority-cache.log`、`road-field-authority-cache-fixed.log`、`road-field-outer-cache-red.log`、`road-fields-focused-third-33.log` |
| 目标保值/最新focused | `road-target-preservation-red.log`、`road-target-preservation-fixed.log`、`road-target-focused-33.log/.json` |
| 本批浏览器 | `run-road-fields-browsers.py`、`road-fields-lifecycle-before.mjs`、`road-fields-browser-psl9susk/`、`road-fields-browser-3wil9fl2/`、`road-fields-browser-v_ev9koy/summary.json` |
| 字段/目标审阅冻结 | `road-authority-review-v1/`（含raw补窗、followup及target provenance）、`road-field-authority-review-first.md`、`road-field-authority-review-followup.md`、`road-field-authority-review-receipt.json`、`road-target-preservation-review.md`、`road-target-preservation-review-meta.json` |

原P04低32KiB图：`C:/Users/fczll/AppData/Local/Temp/dragon-road-init-mfecc1mo/raw-init-00-graph-0000-7fff.bin`。候选/解释器重放不等于实际执行KI。

当前审阅workflow为`e19fe410-5ed7-44ad-b8f5-2f53ec054e67`；首child `410f0fb0-c795-4771-b7fe-eacb6dd4cf77`，后续恢复`0e732599-d15c-45e2-aa62-4f878fc8c5eb`、`86ddfad3-376d-4af2-9319-036068cb36a2`均结束。managed同一路报告会被resume覆盖，复核首稿请用表内分别冻结件。更早retreat冻结不是紧邻before；cold前版为逆变更重建并与既有SHA吻合，不冒作事前另存原件。

**必须保留的失败/安全记录**：

- 旧scout `62025777-3531-4eb7-9b69-8d7d14c14b14`（slot21-raw）根目录grep违规读取`.dragon-runtime/save.json`前500字符，已停止且不恢复；父未读取、复制或使用该内容。见P中`incident-slot21-read.json`、`incident-slot21-stop.json`，不得宣称整个专项零SAVE读取。该事件之后的本专项验证使用固定原资料静态字节、已审有界解释器/合成RAM及隔离测试，未运行原EXE/COM或接触真实存档/profile；不抹去此前违规。
- runner启动失败与同协议恢复、错误golden/partial冻结、旧报告的`rejected/review-required`均保留，不由后来局部绿测追改。P中`runner-start-failure.json`、`runner-start-failure-meta.txt`、`runner-start-failure-partial.diff`保留失败现场。
- 旧journal将一次cold四浏览器目录误写为`cold-load-browser-followup-6z7gnwtv`；实际是`cold-load-browser-followup-6zictuy5`。这里只保勘误，不虚构前者产物。

## 历史收束：不再作为当前待办

- P01–P23的原调用链、外交/财政、战略事件、VM与消息返回边界已归入[AI全链](re-notes-ai-chain.md)、[外交](re-notes-ai-diplomacy.md)、[财政](re-notes-ai-fiscal.md)、[战术AI](re-notes-tactical-ai.md)、[消息ABI](re-notes-strategic-message-abi.md)。片段、首批、完整RET/暂停与战役证书的差别保留；局部闭合不是全部外交/UI或整战闭合。
- 早期NPC修复与更早145项144过/1个opening断言失败见[NPC策略](re-notes-npc-strategy.md)，不覆盖上面的P24完整失败基线。
- B0–B4a的内容/世界/开局拆分已落地，现状见[内容架构](content-architecture.md)。早期开场15秒门、三行链接文案、反复交接/截图/发布准备不再是现行方案；当前开场以[opening-scene](opening-scene.md)为准。
- 旧提交授权、HEAD、远端404、dry-run与dist体积只属于当时会话，不作为本轮授权或当前部署状态。发布与版权维护源是[README](../README.md)。

## 本次project memory整理（仅文档）

- 分工恢复：`web-port/AGENTS.md`保长期事实/架构/命令/约定/坑点及当前AI主线；本journal保P24详细过程、关键失败、相关文件、验证边界、阻塞与交接。全局AGENTS、SKILL及`re-notes`不复制成第二套维护源。
- 删除乱序重复进度、已被后续推翻的中间“当前状态”、过期重构/开场方案、旧提交授权及无交接价值的计时/报告长度/重复路径。保留原始失败产物与最小可复核索引，不把庞大旧文整体转存成新的常驻记忆。
- 两文件整理前精确备份在`C:/Users/fczll/AppData/Local/Temp/dragon-project-memory-u797futb/`，`before.json`记录SHA/字节数。未改代码/资产，未执行游戏回归、浏览器或原程序；旧安全事件未抹去。
- 本轮验证：两文档37处本地链接/锚点及围栏检查通过，44个证据索引路径存在，`git diff --check`通过。两文档主动LSP均unavailable，未确认clean；session缓存仅5条既有代码warning。记录在上述备份目录`validation-final.json`、`evidence-index-check.json`及`diff-check-final.log`。纯文档范围不跑无关游戏回归；AI整体仍待开发与完整验证，本次不结项。
