# MAP-MIGRATION-2：任务二完成审计与验证清单

本轮用户明确批准任务二相关产品要求/共同合同/执行计划并授权本地实现、必要原证核对、迁移与测试。禁止提交、推送、部署、修改全局配置/信任/权限，禁止访问真实SAVE.DAT及用户profile。完整编辑器、账户、任意扩容/拓扑、空白新章不在范围。

基线：`dev` HEAD `6d89b01a5834c8d98212031dd2c5ff49c73c9bf2`。本轮开始已有E-03-ROAD-LOOP本地改动，全部保留；不覆盖既有`.dragon-analysis/map-migration/`与`editor-phase/road-loop-20261001/`证据。本轮隔离输出根为`.dragon-analysis/map-migration-2/`，每轮另用新子目录。

## 最新切片 MINIMAP-ADOPTION-1（用户m1668认可后的本地采纳）

用户原话“很好，效果不错，继续”认可已展示候选；[验收描述符](data/current-map-display-acceptance.json)绑定stage-r9修订/sourceDigest、新两尺寸PNG、七图离线页SHA与认可范围，不扩大为DOS规则、完整编辑器或提交/部署授权。以下组合切片的“待M-06”是认可前历史状态，正式采纳与重验仍须本切片证据，不改写旧收据。

执行inventory（先审后跑）：`map_display_acceptance`只读固定描述符、stage-r9/package38/report、review-r2/receipt/html及七个固定PNG、报告23个Web/作者输入和12个源码（路径受限、SHA/字节核对），复用同一compileGameSource；不读DOS/SAVE/profile、不网络。`stage_approved_unified_map_game`在全部检查后仅创建新explicit-stage目录，原源/native/图像逐byte保留，只生成新世界/目录URI、批准manifest及规范Controlled metadata。`verify_approved_map_stage`只读上述输入及明确的两新目录，与信任builder逐byte比38角色/manifest/module，精确四URI内存fetch20章fresh/JSON恢复；五个错误/不完整认可负控仅自有OS temp（复制一个JSON，须在asset读取前拒收），stdout。installer沿用已审双APPROVED/38hash/worldURI/previous-byte/immutable门；此前temp转移及拒审门先重跑，真实本地安装只新目录与原子switch，保留旧39及全部失败轮。

新机器轮明确串行AGENTS36入口，并追加组合/seed/批准两目录20章JSON门；不运行通配、不传凭据，逐入口旧I/O白名单仍适用。`approved-machine-suite-r1`已39入口全部exit0，09:39:59.133Z—09:48:23.845Z，固定72源码/39资源前后SHA同；不是旧36与新focused拼接。实际安装`approved-local-install-r1.json`的新修订为`map-2-844eab32a84212f72b1430d398f5e82a3924d7e9527746fc2d1c7581cf694f86`，38角色＋manifest；上一模块SHA/旧目录保留核签。另`approved-late-world-r1`旧atlas晚到保护过。批准两目录复现及20章JSON/五拒收记录在`approved-stage-repro-r1.json`；安装前原五拒审/六temp转移新轮分别r4/r3过，mock不是批准来源。

### 当前请求完成审计（M-00至M-06，不扩大支持域）

| 显式要求 | 本轮真实产物/证据 | 结论/边界 |
| --- | --- | --- |
| 六维护源/相关skills、保留既有工作、先切片再实现 | 本审计历史inventory/M0原窗、HEAD 6d89b01、共享改动原样；既有E-03成果保留 | 已执行；不把文档或旧测试当原机制 |
| M-00来源、映射、差异、原尺寸192及战术关联 | 当前机器M00 baseline固定KI/非SAVE/MMAP/SINARIO；256图块/98304B/192/254/5526/3840坐标、低32KiB原cert及战术214目录/五点分类输入保持 | 通过本批原槽/原图域；不是新拓扑/扩容/全逆向认证 |
| M-01/M-02可复现自动mini/水域及组合/无手工图 | r9/r10从23固定输入/12源码独立生成，相同源码现再核SHA；批准r11/r12同38、当前两mini与已认可40da候选SHA同；组合/seed/layout新轮/道路独立、完整地理保留 | 已实现且本地实际接入；组选择/拆分UI不在任务二 |
| M-03统一可编辑四层、真改副本、同校验/编译/引擎 | current source含92586装饰/5526道路/192据点及持久水组，compileGameSource/prepareScenario无身份豁免；新machine样本28资产(10,10)20→16一字节、20章native16/JSON；分层调序/删除unknown/明确补底/引用/recipe拒收 | 已验证当前源支持域，不声称复原未知隐藏历史或任意组件可玩 |
| M-04无编辑规则保真、20章/相关规则/RNG/只读/恢复 | 新stage与M00初始plane/graph/helper逐byte保持；新39门含20fresh/JSON、native formation28/movement32/P06五case、fixed RNG、战术目录、实际中立捕获；四季×3DPR五格写集/atlas投影/cached-direct一致、RAM/RNG不变 | 通过限定路径；5退休skip非pass，固定RNG非CPU、非完整战役 |
| M-05当前真实App/缓存/迟到/保存拒绝不删档 | 新39门普通/放大/回退、精确当前URI/懒加载/0error、导航/锁/hold边界、mock事务失败、ownedIDB新档菜单往返/五类坏身份能力原样保留；独立late-world旧页/新页state/RAM/RNG同 | 新profile/内存/自有server；无真实SAVE/profile，不热换、伪标或清档 |
| M-06用户视觉认可/实际采纳 | m1668原话与精确source/两mini/七图页SHA在data/current-map-display-acceptance.json；新APPROVED manifest携descriptor、规范Controlled metadata经原受控installer原子switch | 已认可并真实本地采纳，不代签或扩大为原机制 |
| 来源工具版本/真实结果/失败/限制/立即回流 | 旧失败/中间轮均保留；本页/水域审核唯一详细源、产品/合同/计划引用；新独立stage/39机器/late/static均绑定SHA | 文件未提交/推送/部署，无全局配置/权限改变 |

批准源/native/图像原byte均保留（38角色仅catalog/world两文件更新URI）；source/role旧候选措辞是冻结来源历史，现批准以manifest.displayAcceptance为准，不伪改旧来源。新增builder/CLI/test与当前switch属于本地实现，不是编辑器账户批准服务；复现批准转移明确需要保留审核资料，基础自动生成本身不依赖手工图或ignored中间源。全部源码在本地保留，旧目录/封存基准不清理。

主动诊断：6个JS/JSON路径1个既有类型模型风格的Scenario动态fixture hint、5 push-only inconclusive，0 confirmed-clean；六Markdown marksman/typos不可用。裸JSON.parse新8重复告警已集中parse捕获修正后才生成/安装/跑39；未改规则来清hint。Jev仅经审的1667B最小摘要、preview检查后调用pinned1.13.0，结果只是advisory，不替代本表。最后静态approved-static-r2通过：72源码语法/AST、当前39及上一39资源保真、六文档98本地路径与diff检查；首次checker错把含Python的72源全当JS导致拒收，失败单独保留，只修校验器后新轮通过，产品/39机器收据未变。session mode=all复核94文件19warning/85hint：固定mock URL重复14、savegame旧style3、Python旧行cache2，及动态Scenario/await等hint；不是全清，不清全局缓存或改规则。文档最终状态回填后再做新静态轮核签。

**完成结论**：当前请求的M0–M3及M-00至M-06在固定384×256/192槽支持域已完成本地交付，未完成必需项=0；没有待视觉认可/待安装或证据阻塞项。非阻塞验证限制如上，不把inconclusive记为通过。完整编辑器UI/账户发布/任意拓扑/空章/移城扩容及全部原机制认证仍不在交付范围，不据此延伸实施授权。所有本地未提交改动及历史证据保留；没有commit/push/deploy。goal只有在最终文档静态轮核签后才标complete。

## 历史切片 MINIMAP-COMBINATION-1（类别认可后的小地图视觉反馈）

用户已认可水域显示类别；来源/范围写入唯一作者JSON，不扩大为原DOS机制、道路清单逐项验收或新风格批准。实际组合开关合同维护于工程合同§2.2.2，数据/共用0.6编译/显示摘要/3个生成入口已接线，完整编辑器组合选择/拆分/checkbox UI未实现。主河带及相连片区是持久化的Web作者初始化候选，不在运行时猜类别。

当前隔离`explicit-stage-r9/r10`修订`map-2-40da80fbba6764cb95b7da5fbd54187628230639ac766acc71710105e16d6372`，161个实际组合/51显示/110次要河片隐藏。`minimap-style-2-bands-dither`共用道路/水系色、区域色带/有限色阶点阵，仅显示用minimapGeography过滤；完整23716水格、四native、道路/20章仍同。未安装；实际current仍0.5/39资源及switch原SHA。

### 本切片inventory、I/O与证据

| 入口 | 固定I/O/覆盖 | 最终成绩 |
| --- | --- | --- |
| verify_minimap_groups | 纯内存/共享compose与renderer/作者初始化函数，无fs/fetch；stdout | unit-r2：同素材不同实际组合、多格/叠层/base/独立道路/JSON/旧源默认、六拒收、禁止ambient RNG/time通过 |
| verify_layered_map_compile / verify_layered_map_engine / verify_minimap_seed | 既有逐行审白名单不扩：原Web+孤立store/loopback，Native点动作；seed只读current source | layered-r2/engine-r1/seed-r3通过；engine绑定未变0.6规则编译代码，非全战役 |
| stage_explicit_unified_map_game | 23固定输入（旧22+唯一组合显示policy）、12工具（旧11+纯分组函数）；仅新隔离目录，无DOS/档/profile/network | r9/r10：38角色、manifest/metadata逐byte同，原四native/20章保持 |
| verify_explicit_unified_stage | 两指定新目录/固定23+12白名单、旧proposal-r3摘要仅4native；真实candidate源全部组关后复编；仅4精确URI内存fetch | repro-r4：20章fresh/生产JSON、7作者拒收、所有组合关仍完整geo/四native/roadMask同，摘要不同；不是CPU认证 |
| verify_explicit_stage_app | 明确stage及受限proof名称（当前repro-r4）/9受信工具SHA；own server+fresh context、只候选prefix，不重包装/安装 | App-r3：192城、一章fresh/三布局/精确URI/懒加载/0error和forbidden；20章引用Node收据不当浏览器20章 |
| package_minimap_groups_review | 固定stage-r9/repro-r4/App-r3/原36收据及7PNG；当前39角色/metadata及65源码SHA；只新review-r2，无script/form/网络 | 已包装且current39/switch同；旧65现7差/其它58同；新截图SHA此时固定，非早期App输出hash |

证据根均为`.dragon-analysis/map-migration-2/`。最终资料：[新同尺寸/实际App离线页](../.dragon-analysis/map-migration-2/minimap-groups-review-r2/review.html)，详细资料/历史作废边界由[水域显示审核](map-water-display-review.md)维护；旧r3/r4 metadata误留0.5、r5/r6改0.6、r7/r8拆分分区内实际不连水片、r9/r10等价lint清理身份，均保留。途中精确edit匹配/部分apply错误已按工具回报定位续改，不隐藏为测试通过。

分级选择：未改AI/RNG/存储/装配或UI输入，共用编译的新增仅显示摘要；重跑实际编译及20章/JSON/原生动作/真实App接缝，不重复未改的全规则36轮，也不混拼新整套。静态14JS语法/2JSON/6文档99本地链接路径/冲突和多空行检查通过（不校验全部锚点）；旧MD012缓存行已非当前多空行，未清缓存。主动14JS：1个既有Scenario动态fixture hint、13 push-only inconclusive；2JSON inconclusive、6Markdown marksman/typos unavailable，confirmed clean=0。session mode=all：80文件、20warning/84hint，包含旧fake URL/保存style/Python旧行与MD012缓存，不为了清零改规则/配置。收据minimap-groups-static-r2固定最终文件SHA；diff仅LF/CRLF提示，未称LSP全清。未验收M-06/未正式采纳，因此goal不能complete。

## 1. 历史切片、依赖与当时验收状态（以页首新轮替代）

| 切片 | 工作/依赖 | 验收 | 状态/证据落点 |
| --- | --- | --- | --- |
| M0 | 固定只读KI/MMAP/五组SINARIO/Web源，组件/规则/地理映射；沿原证核本批输入 | M-00 | `m0-r1/baseline.json`已产出：解包/布局差0，192/254/5526及20章坐标同源；原水域标注/多格语义分组仍缺证 |
| M1 | 在M0显式地理上共享生成；水域叠层、细线、几何、条件布局与实际接入 | M-01/M-02/M-06 | 两目录自动图/真实App几何已过；水域类别本轮认可，组合显示/新风格仍待M-06，未安装 |
| M2a | 四层原子组件到视觉/规则/地理编译；未知底层和recipe明确拒收 | M-03/M-04 | 原子lift＋四层消费、30项纯编译正负控、20章fresh及JSON checkpoint通过；不认证任意组合 |
| M2b | 同编译/manifest/新修订接正式内置；旧资源并存与缓存失败重试 | M-04/M-05 | 新map-2修订38角色清单已本地接DEFAULT_WORLD/catalog/GameBar，真实App资源请求验证通过；0.5已接入；旧资源保留，五类旧身份/缺能力槽拒收且不删记录专项通过 |
| M2c | 开局/易主中心角块、季节、DPR及JSON恢复只读投影 | M-04/M-05 | 0.5四季×DPR1/1.25/2、真实中立易主五格精确投影、cached/direct像素相同、RAM/RNG只读及JSON恢复已验 |
| M3 | 支持域组件编辑/调序/移除/明确补底、道路规则保持，同引擎加载 | M-03/M-04/M-05 | 完整副本实际原子20→16已持久化、同编译20章native16/JSON恢复；改路闭环/目标指示/中立活页捕获均过，仅限定支持域 |

## 2. 历史用户要求对照（页首新矩阵为当前完成审计）

| 要求 | 可复核证据/检验方式 | 状态 |
| --- | --- | --- |
| 阅读全局及仓库AGENTS、产品设计、技术分册、迁移计划、准入排查 | 本轮完整读取六文件；相关三个RE SKILL已读取 | 已读；不当机制证明 |
| 保留工作区 | 开始git status/HEAD记录；已有E-03改动保留，不reset/clean | 已核 |
| 原件保护/原尺寸192槽 | M0原件hash/3840原坐标；stage/input对照；0.5可见node scan/原章raw XY负控 | 已核本批固定域；不放行变槽/扩容 |
| M-00来源/工具版本/组件及规则映射 | m0-r2＋machine-suite-r1-m0、KI窗/256tile/192/254/5526/3840记录，源/工具hash | 已产出；水域显示类别本轮认可，非原DOS水域机制认证 |
| 自动生成可复现/无手工中间图 | stage-r6/r7两干净目录/同核心PNG完全一致；minimap生成只读输入/整数textureNoise，不导入规则RNG | 同seed及真实接入通过；minimap-seed-r1两尺寸变seed仅显示像素变化、geoMask同、源不变且禁止ambient RNG/time仍通过 |
| 显式河湖海及Q62/Q66 | 原图候选provenance/hist/256sprite及坐标图；合成水域叠放/调序/删除/非水域遮盖 | 合成通过；当前0.5仍是未审3072河湖混类/0湖。新增explicit-water-proposal-r3作者资料/23,716格/707湖，真实App候选三布局已展示，水域类别本轮已认可，组合/新风格待M-06，未安装 |
| 四层/可编辑/底层恢复 | atomicmapimport/maplayers/mapcompile；30正负控、persistent-sample | 本批原子支持域已实现/验证，未复原未知多格历史 |
| 同一结构校验/编译/加载 | shared compileGameSource/createWorldResources/prepareScenario；source显式helper、原子全图及副本两身份同门 | 已验证；无完整编辑器/任意组合认证 |
| 规则字节及道路保真/战术映射 | 原平面0差、图全字段语义同、literal helper0差；既有编码/原证cert、P06与214切片/3840目录 | 本批保持项通过；不把Web两跑当CPU等价 |
| 20章及相关规则路径 | 20章fresh/JSON＋native28/32、P06五case、fixed RNG、实际委任中立捕获 | 限定路径通过；非全战役认证 |
| 开局/易主中心角块/季节/DPR | fresh生产89F0/restore精确RAM；真实中立五格/实际atlas命令＋12场景cached/direct像素 | 通过，限中立inline及已列DPR |
| 真实JSON恢复/坏能力拒绝/旧身份拒绝 | 20章assembly、生产菜单/owned IDB、五坏记录/持久保留及mock事务abort/error | 本批通过；不触真实档/热替换 |
| 新旧修订/晚到资源/缓存失败重试 | 两编译修订并存/metadata字节护栏；旧请求不串新、5类asset retry、失败原子安装 | 已验证列明接缝；late-world-browser-r1受控previous metadata旧页atlas晚到、新页固定0.5及完整state/RAM/RNG不变通过，不模拟live热切世界 |
| 浏览器实际接入/懒加载/地图锁/导航 | 0.5新contexts真实资源URI、懒加载/三布局/导航、据点全锁/退层及march目标例外 | 通过，日志/图/receipt在machine-suite-r1-* |
| 放大/回退布局/视觉验收 | 208×139及250×167/三真实布局，geography-review-r1新旧对照＋源sprite/坐标 | 几何通过；M-06仍待用户，不代签 |
| 只读渲染/无额外规则RNG/不热换 | projection/runtime snapshots/native RAM/RNG前后同、retained pixels；旧world实例与目录保留 | 已验证列明写集/路径；不宣称全程序无问题 |
| 验证与证据回流 | 每case记录contractRevision/sourceHashes/toolHashes/fixtureId/expectedSource/result/artifactPaths/coverageLimits，失败保留 | 进行中 |
| 分级验证/LSP | 主动changed paths及session mode=all、语法、diff检查；不可用单列 | 已执行各切片，范围/未确认见下文；不是全部clean |
| 授权边界 | 不commit/push/deploy，不访问真实档/profile，不扩槽/图、不做完整编辑器 | 持续遵守 |

## 3. 历史测试inventory与I/O白名单（最新追加/成绩见页首）

先读入口及imports再登记，逐个执行，不用verify_*通配。以下为此前逐切片入口的历史inventory；最新组合显示切片的23输入/12工具/受限proof/9校验SHA/4native比较及成绩由页首表替代旧22/11/6/6资产等计数，不按历史字段调用新版代码。

| 入口 | 输入白名单 | 输出/环境 | 覆盖限制/状态 |
| --- | --- | --- | --- |
| `node tools/run_map_migration_verification.mjs <new-round>`（新入口逐行审、固定36入口均已审并在此登记；无verify通配） | 仅本表各入口已核白名单；65个明确源码及当前38runtime角色文件/manifest逐字节SHA；子进程只传必要Windows/临时目录/Playwright路径及Python UTF8/noopt环境，不继承凭据 | 新独有round顺序执行、逐组exit/日志SHA/源码SHA/角色SHA及起止时间；每浏览器/原样本另新子round；source/resource漂移硬失败 | 收据明确pass-scoped-machine-suite不等goalComplete；退休walker skip/固定RNG非CPU/原图分类及M06待审不可销账 |
| `tools/audit_map_migration_baseline.mjs`（已逐行审I/O；只用Node标准库） | `../Dragon/KI.EXE,MMAP.MAP,MMAP.MDL`，五组`SINARIO.DAT`，明确Web源（r2追加`web/road_cost.bin,road_offset.json`与`builtin/world/road-cost.bin`）及本轮代码 | 全新`.dragon-analysis/map-migration-2/<round>/` | 只读指纹/原窗；不CPU执行/不访问SAVE |
| `tools/verify_layered_map_compile.mjs`（已逐行审入口/imports） | `web/mmap_map.bin`、`web/content/builtin/world/{world,roads}.json`，mapcompile/maplayers/minimap/atomicmapimport纯模块及其明确源码hash；纯内存样本 | stdout/本轮隔离日志 | 分层正负控25项已通过r2；不认证任意组合/全战役 |
| `tools/verify_layered_map_engine.mjs`（已逐行审入口/imports） | 服务内置白名单见editor-local-validation；受审scenarioassembly/nativelegions/originalroadmovement/trialruntime依赖；r3增加明确`web/road_cost.bin,road_offset.json`及相关源码hash；全新自有loopback服务 | 自有OS临时store，stdout/本轮日志；不读DOS、SAVE、IDB/profile | 受控文件样本/20章fresh/实际原生点动作，不扩大编辑器8MiB配额，不认证完整App或规则月界 |
| `node tools/editor_server.mjs`（本轮已重读selfcheck与编译入口） | 同内置服务白名单、仅本机临时loopback HTTP | 新OS temp store、自有监听 | 编译器0.3兼容回归，不启动共享8322store |
| `node tools/verify_editor_road_loop.mjs`（本轮已重读完整入口） | 本地服务白名单、受审原生动作依赖、自己的loopback资源 | 新OS temp store/自有监听，允许其自有roads.json损坏负控后恢复 | 原有改路/晚到固定修订回归；不替代本批完整迁移 |
| `node tools/stage_map_migration_sample.mjs <new-round>`（新入口全行审、相关copy/compile/assembly/catalog/world依赖已审） | 当前generated模块固定sourceURI→hash核过的manifest/source/catalog/terrain/graph/两helper六固定文件；原Web城市world.json；9源码hash；只mock四个fixture URI不转发 | 新本轮独有round完整改后源、28资产、manifest/20章native16＋JSON检查收据；不写Web/DOS/存档/profile | 永久保留真实(10,10)20→16完整副本与来源修订，原图/图/辅助不变、同引擎20章及JSON恢复；图像复用固定源修订且地理/路网不改，不当完整App或用户视觉 |
| `node tools/stage_explicit_unified_map_game.mjs <new-round>`（新入口逐行审，fixedgameimport/atomicmapimport/compile/minimap与原资源读口已审） | 固定22个Web/作者JSON输入：world/graph/catalog/data/plane/helper二文件、8四季PNG、6战术文件及唯一作者资料；11个明确源码hash，禁ignored中间源/current编译包；只Node标准库 | 新独有round/package完整38角色＋manifest/metadata/报告，不读DOS/档/profile，不网络、不安装 | 可移植两目录同URI同byte、作者data应用前编译保真；候选PROPOSED_NOT_APPROVED，不替代M-06 |
| `node tools/verify_explicit_stage_app.mjs <stage-round> <new-round>`（新入口全行审；复用受审App/browser server，不读已装pack） | 固定explicit-stage-repro-r2收据与其6受信tool SHA、明确stage子树report/manifest/38角色/generated模块全SHA；模块与受审emitter重建byte同后才fixture替换；owned origin只新prefix，旧/rootworld/外部/API/SAVE拒 | 新ownedcontext、自有server、新round三布局/receipt/failure；不改stage字节、不复制已装包、不repack、不安装/真档/profile | 首个独立生成包直接进真实App，四规则/两mini请求/真实revision、标题懒加载、192城/一章fresh及三布局；引用未漂移20章收据但不再跑、不混拼全认证，截图hold非规则门 |
| `node tools/verify_explicit_unified_stage.mjs <stage-a> <stage-b>`（新入口全读及catalog/world/newgame/assembly已审） | 两指定新round/report/metadata/package；report源须恰22固定白名单、tool须恰11固定源码；38asset路径/URL/hash校验；仅固定explicit-water-proposal-r3 receipt摘要比较6资产，不读其任意路径 | stdout/独有本轮日志；Node fetch只4精确manifest URI内存，不转发；20章fresh/JSON恢复；7纯显示资料拒收，source only孤立clone | 全38资产及manifest/metadata两目录byte同、旧候选PNG和4native文件同、20章同引擎JSON；非浏览器/人类审批/原水机制 |
| `tools/map_water_display_authoring.mjs`（新纯函数逐行审，从旧propose原逻辑提取） | 仅调用者孤立source/plane/固定作者JSON及SHA；无fs/network/RNG | 按原显式坐标栅格与字面waterRoadIds写候选资料，失败调用者弃clone；旧CLI仍做原bytes/overlay/unknown负控 | 唯一共享显示应用逻辑；focused propose-r4与r3完整artifact/digest比较，未修改生产运行器/65源码 |
| `tools/stage_unified_map_game.mjs <new-round>`（仅历史候选复现；新显式资料使用上列独立entry；已逐行审入口/imports，共享fixedgameimport/atomicmapimport/compileGameSource，PNG压缩只Node标准库） | 明确`web/{mmap_map.bin,data.json,road_cost.bin,road_offset.json}`、builtin/world/{world,roads}.json、旧catalog.json、历史unified_mapsource.json（仅作未审核地理/道路显示候选，不当原证），四季atlas/tiles共8PNG、6个固定battle依赖及明确本次工具源码hash | 仅新本轮隔离round/package；没有网络/用户目录/真实档访问，不安装产品/覆盖旧目录 | staged新修订/完整角色hash/保真比较；地理仍PENDING，不等于真实接入或完成 |
| `tools/verify_unified_map_stage.mjs <stage-a> <stage-b>`（已逐行审I/O、catalog/world/prepare/new-game APIs） | 仅声明的两个本轮stage报告及其白名单package路径；22条固定Web/历史候选白名单输入（不按任意report路径读取）；明确相关源码hash；manifest白名单mock fetch不转发网络 | 只读各新stage，stdout/本轮日志；纯内存20章 | 全角色hash/实际依赖URL/完整目录复现/正式身份20章fresh；追加同合同真实副本、map/def/helper完整溯源、辅助保留/原子改动/原章raw坐标错绑定负控；追加20章生产assembly内存JSON checkpoint恢复/旧world与content身份拒收（readSavedAssembly/snapshot/prepare依赖已审，无磁盘保存）；不等于完整App存档、浏览器或地理标注审核 |
| `node tools/verify_gamesource_copy.mjs`（完整入口/依赖I/O已重读） | 明确builtin/{world/world.json,catalog.json}、data.json、历史unified_mapsource.json、road_graph.json；纯native_faction_fixture及受审装配依赖；白名单mock不转发 | stdout/本轮日志，纯内存，不写store/profile | 旧E02复制确定性/拒收/诊断/装配兼容回归，不当新增原机制证明 |
| `tools/verify_world_asset_retry.mjs`（已逐行审入口、worldresources/pathfinder/roadgraph依赖） | 仅`web/{mmap_map.bin,road_cost.bin,road_offset.json,road_graph.json}`及明确相关源码hash；Response mock严格fixture.invalid前缀不转发 | 纯内存自有World，stdout/本轮日志 | HTTP/JSON/尺寸/offset格式/graph失败后重试与资源原子安装，不证明浏览器或原寻径机制 |
| `node tools/verify_world_resources.mjs`（已重读完整入口及imports） | 仅读`web/road_graph.json`；mock Image/Response，四个明确first/second接口不转发 | 纯内存World，stdout/本轮日志 | 既有隔离/懒加载/缓存回归，不是任务二完整验收 |
| `node tools/verify_march_indication_browser.mjs <new-round>`（全366行入口/imports重读，补实际mapBox/独有output/route；post-battle SKILL按本批加载） | 自有loopbackWeb、生产6E8F fixture/原生动作及真实点击，5固定源码hash；route拒外部/API/SAVE | 新Chromium/newContext、自有server、独有round五图/receipt/failure，无真实档/profile | 指示阶段拖拽与mini导航不选目标、真实委任/退层/独立pointer hold释放及中立活页捕获；25日/模态/失败终点不能算CAPTURED；RTC依赖不当固定RNG原证 |
| `node tools/verify_advisor_lock_browser.mjs <new-round>`（全204行旧入口/imports重读后审修改） | 自有loopback Web及5固定源码hash；route拒外部/API/SAVE，不读DOS/profile | 新Chromium/newContext及独有round两图/receipt/failure，不覆盖历史root截图 | 真实地图开关/羽扇/未选中mini导航、已选据点地图拖拽/实际可见城市/mini全锁、右键退层恢复；移除弱直接hold，未模型行军目标例外 |
| `tools/verify_unified_map_browser.mjs <new-round>`（新入口逐行审；browser_test_server完整读；main shell/assets接缝重读；Playwright skill已读） | 自有loopback下只读Web静态资源，route拒外部/API/SAVE路径；明确7源码hash；读取已核generated常量 | 新Chromium/newContext临时隔离IDB，自有server，独有round三图/receipt/failure；不调用共享浏览器/profile/服务 | 真实App新身份/manifest资源、标题懒加载、普通/放大/回退和地图导航/框消费；四季/DPR/写回/保存与视觉确认另验 |
| `tools/verify_unified_map_identity_browser.mjs <new-round>`（新入口逐行审；main.saveGame/loadSave、savegame.admit、assembly snapshot、localstore/repository/IDB backend已读；沿用browser_test_server安全边界） | 自有loopback只读Web静态资源、8固定源码hash，拒外部/API/SAVE | 新Chromium/newContext临时IDB，仅其中构造5个不相容记录；新round receipt/failure | 原world/content修订1及缺terrain/movement/cityCache能力拒收，live身份/RAM/RNG/date不变，记录不删不改，重载仍保留；不是真实旧档、成功热替换或菜单流程 |
| `node tools/verify_content_catalog.mjs`（完整入口及catalog API已读） | 仅旧Web catalog.json/data.json；纯引用/错误fixture | stdout/新本轮日志，无网络/profile写 | 20章引用和负控，旧目录仍能构造，不代替正式新清单运行验证 |
| `python -B tools/compile_content.py --output .dragon-analysis/map-migration-2/legacy-compile-r1`（36行入口＋content_pipeline全603行已读） | 固定旧builtin/catalog/world/20章/tileset/layout/roads及受source_path约束的其引用资产；Pillow | 仅新隔离目录，临时stage，不DOS/网络/profile；PYTHONDONTWRITEBYTECODE/PYTHONUTF8仅本命令环境 | 旧可编辑内容适配保真/兼容回归，不替代新四层GameSource编译 |
| `python -B tools/verify_content_pipeline.py`（入口174行及上述依赖已读） | Web固定旧builtin源与出货data/terrain/road/四季PNG；audit hook禁止全部DOS目录与SAVE | 自有OS临时copy/output，stdout/本轮日志，无网络 | 20章旧源一致、命名raw编辑、不覆盖坏输出及四季像素；不替代新manifest验证 |
| `python -B tools/verify_map_marker_anchor.py`（全121行入口已读） | 固定原KI.EXE/MMAP.MAP/MDL/MCH，Web graph与3city/120march PNG；Pillow | 只读/stdout，不运行原游戏，不DOS写/SAVE/profile | 13原指令pin、192节点、原16×16几何/mask，不整机VGA认证 |
| `node tools/verify_weather_presentation.mjs`、`node tools/verify_disaster_presentation.mjs`（完整72/45行入口和纯表现依赖已审） | 纯内存frozen输入和Image mock，无文件/fetch转发 | stdout/本轮日志 | 动画不写规则、插值/暂停/原8帧/容量/重复性 |
| `node tools/verify_render_layers_browser.mjs`（全151行入口及renderer依赖已读） | 自有loopbackWeb，纯渲染fixture使用可信DEFAULT_WORLD清单mini/atlas引用；route拒外部/API/SAVE | 新context×3 DPR/自有server/stdout，不保存/无用户profile | crowded/idle/dirty/reentrant/resize cached-direct精确像素与只读状态；不是正式App规则生命周期 |
| `node tools/verify_weather_browser.mjs`（完整468行入口和表现/事件依赖已读） | 自有loopbackWeb，ownedcontext合成weather/fire/riot/state与有界RNG；无fs/DOS | 新Chromium/newContext/自有server/stdout，无共享profile/save请求 | cloud8帧、paused/running、fire/riot/TALK71/72，不全战略事件认证 |
| `node tools/verify_legion_lifecycle_browser.mjs`（全344行入口及localstore/save/phase依赖已读） | 自有loopbackWeb，ownedcontext IDB及合成RAM sentinel/badphase/slot/2A7E；route拒外部/API/SAVE | 新Chromium/newContext/自有server/stdout；真实UI及ownedIDB，不真实profile | 生命周期/早拒不改活态、标题加载/延续取消/正式RAM恢复；改真实settings hold夹具，不改golden |
| `node --test tools/verify_native_formation.mjs`（全1013行入口/纯fixture/imports已读） | 4个可信World资源URL内存mock，原生合成输入，native_faction_fixture纯内存；无文件/fetch转发 | stdout/本轮日志 | 编成/占用/JSON/尾链/失败前缀及固定RNG，旧原证golden不改 |
| `node --test tools/verify_native_road_movement.mjs`（全1769行分两段读完） | 4个可信World URL合成byte/mock，不转发；纯JSON和原生合成模型 | stdout/本轮日志 | 原路点提交/接敌/速算/占用/恢复/失败前缀；不CPU oracle或全战役 |
| `node --test tools/verify_legion_slot_battle.mjs`（全351行入口/imports已读） | `web/data.json,mmap_map.bin`、`tools/fixtures/legion-slot-p06.json`及当前World四个精确资产URL，只读白名单 | stdout/本轮日志 | 保留KI五case证书与场景/RNG；仅把旧硬编码fetch地址换成manifest地址，不改预期 |
| `node --test tools/verify_road_field_authority.mjs`（全329行入口/imports已读） | `web/data.json,road_graph.json`，纯内存；默认graph当前manifest URL mock只返回已核同源图，不转发 | stdout/本轮日志 | 3个active/5个已退休v1walker skip，不计为8个通过；物理指针与sidecar不推断 |
| `node tools/verify_save_repository.mjs`、`node tools/verify_local_saves.mjs`（69/21行入口及savebackend_mock57行全读；repository/backend/localstore依赖此前已审） | 纯内存协议mock，getIndexedDB明确注入/在localstore动态import前赋mock，无fs/network/真实IDB | stdout/本轮日志 | request成功后transaction abort/error/throw不得成功或覆盖原件、40独立记录/summary读、local JSON记录所有权；不代替真实新profileApp流程 |
| `node tools/verify_save_transition_guard.mjs`（完整119行入口及savegame/phase依赖已读） | 纯内存角色/guard，计数模拟transport，无文件/network/profile | stdout/本轮日志 | 战斗/强制audience/pending day禁存及完成后快照；不代替真实App旧身份拒收 |
| `node tools/verify_start_flow.mjs`（完整入口及纯startflow依赖已读） | 纯内存async步骤，无文件/network | stdout/本轮日志 | 启动选择/回退/错误传播的兼容回归 |
| `node --test tools/verify_legion_slot_phase.mjs`（完整137行入口及aiTick/phase依赖已审） | 仅web/data.json、内存P16局部夹具 | stdout/本轮日志，无网络/真实档 | 固定槽delay/RNG相位回归；不证明全战役 |
| `node tools/verify_retained_layers.mjs`（完整46行入口及retained layer源码已读） | 纯mock Canvas，无文件/network/profile | stdout/本轮日志 | 缓存/字体/场景切换/内存界限调度，不代替真实像素验证 |
| `node --test tools/verify_fixed_rng_march_diff.mjs`（625行完整入口及依赖已读；允许四个manifest规则URL，mock不转发） | 仅web/road_graph.json；固定RNG/纯合成完整native fixture；Image错误显式忽略且不触网络 | stdout/本轮日志 | Web两次相同输入确定性；合成平面不是原章差异oracle；mock图匹配当前world.assets.roadGraph不硬编码旧文件名，不改机制golden |
| `node --test tools/verify_tactical_entry_full.mjs`（148行完整入口及battle projection依赖已审） | web/battle_maps.json、可信builtin/chapters下固定20章、只读../Dragon/BATTLE.MAP | stdout/本轮日志，原件只读，无SAVE/profile | 原city.idx目录及214切片/边界入口；不证明战术渲染或完整战斗 |
| `tools/verify_unified_map_projection_browser.mjs <new-round>`（新入口逐行审；依赖browser_test_server、main.setSeason、MapView.draw/DPR、retained layers、assembly snapshot及neutral capture已读，8A1E原窗来源复核见M0及去向§12.2） | 自有loopback Web静态资源，拒外部/API/SAVE；8个固定源码hash，无DOS/profile访问 | 三个新Chromium context DPR1/1.25/2，自有server，独有round12图/receipt/failure | 真实中立inline capture完整平面精确写集；中心/四角实际MapView atlas命令；四季、cached/direct逐像素同、渲染不改Scenario/RAM/RNG；不证明战斗全链/视觉分类批准 |
| `node tools/verify_menu_save_slots_browser.mjs <new-round>`（入口339行、browser_test_server/main shell重审；真实SAVE stat已移除后才准入） | 仅自有loopback Web静态资源，不读DOS；API/SAVE网络路径拦截 | 新Chromium隔离context IDB，新本轮round截图；旧round2不覆盖 | 生产菜单保存/隔离/覆盖/返回标题/空槽三禁/重载持久恢复；尚不覆盖旧身份槽保留 |
| `tools/verify_map_panel_layout.mjs`（新入口和纯几何依赖已审；layout-2追加640×48军师条AABB、6viewport×3单双panel状态；不改UI暂停/规则） | 自身、mappanellayout/minimap/gamebar四个明确源码hash；纯内存640×400、1024×768、1280×768/400几何 | stdout/本轮日志，无fetch/Image/Scenario/clock/profile | 外框完整/相邻面板不交叠、实际地图半开边界与正逆变换、名牌/普通放大回退；不代替Canvas/browser/视觉验收 |
| `tools/install_unified_map_candidate.mjs <stage-round> [reviewed-previous-stage]`（全读；追加拒审门及显式stage名称支持） | round只接受m2-stage-rN或explicit-stage-rN；两review状态必须先APPROVED，否则角色读取/建目录前拒收；同38hash/URI/world/规范generated/previous-byte合同，明确原尺寸及world所有角色同修订；hash/length错误准确指出角色 | 本轮只在temp镜像检验转移，真实0.5/候选均不写；两个族不设规则或review豁免 | 名称支持不是批准机制。正向传输允许规范Controlled generated模块，当前PROPOSED isolated模块/资料仍拒；真实审核记录及批准后产物生成/实际采纳尚未完成 |
| `node tools/verify_explicit_map_install_transfer.mjs <new-round>`（新入口逐行审；installer、Nodefs/spawn完整已审） | 仅固定explicit-stage-r1 manifest及其38正则/hash核过角色、m2-stage-r6/current39与switch；精确installer字节；必要childenv，无网络/profile/DOS | 新OS-temp repo镜像：mock APPROVED双字符串仅测试条件分支，不写真实批准或源码；独有日志/receipt/temp保留 | explicit未审/坏terrain hash/自洽hash却world指旧修订/previous字节不符拒收，规范mock gate输入38逐byte复制＋原子switch＋旧目录保留/immutable重装拒收；非真实用户验收或实际安装、非新的规则测试 |
| `node tools/package_map_review.mjs <new-round>`（新入口全行审；只Node fs/crypto，不浏览器） | 固定作者JSON及review-r3/App-r2两收据、七个固定既有PNG；四review PNG核原输出SHA，三App图原收据无输出SHA故只在包装时固定SHA及核viewport PNG尺寸 | 新独有round/review.html（dataURI内嵌七图，无script/form/网络，CSP拒外部）/包装收据；全部输入前后SHA同，不生成新图片、不写当前Web/档/profile | 仅便于人工验收，打开页面不批准/不安装，不重跑旧测试；decode后七图逐byte同，不把新hash冒充旧App截图hash |
| `node tools/verify_map_install_review_guard.mjs <new-round>`（新入口全行审及installer/Node fs/spawn审过） | 固定旧stage-r6/proposed explicit-stage-r1两manifest、当前generated模块及39当前角色文件SHA；把确切installer代码复制到全新自有OS temp repo，子进程只必要环境 | 五个实际CLI拒收case在temp root，无角色文件故须在asset-read前拒；新本轮日志/收据，自有temp保留，不写真实Web/DOS/档/profile | PENDING/proposed/缺review/只改map状态/缺author状态拒收且目录不创建、switch不改；不造human-approved正例，不安装、不重复规则或整套浏览器 |
| `python -B tools/render_map_geography_review.py <new-round> <revision>`（新入口全行审；仅Python标准库/Pillow） | 当前已核编译revision的manifest/terrain/game-source/spring atlas/两尺寸mini五个固定role文件长度hash；保留的Web旧手工mini及旧auto208，所有输入仅读Web，修订/round严格regex | 新独有本轮round的256索引sprite、初始平面坐标图、新旧对照和REVIEW_REQUIRED收据；无网络/原DOS/profile访问 | 不执行分类、不认证旧标签；实际候选hist85812/9420/3072/0（lake缺失），作为人工审查材料；两路径heuristic提示已核固定filename白名单/round约束与独有目录，不改全局策略 |
| `python -B`仅导入已全文审读`tools/disasm.py`并调用`va_range(E4CE,E50C)` | 只读固定`../Dragon/KI.EXE`及本工具/Capstone；不调用pickle辅助/main | stdout到本轮独有node-scan-primary-r1.log | 原62B扫描窗复核，来源hash对M0；不CPU/畸形源运行认证 |
| `node tools/jev_assess.mjs change --input <reviewed-summary>`（CLI/profiles/client已全读） | 仅本轮人工最小1729B摘要，先无网络preview审最终state；不发送资源/源码/日志/profile/凭据值 | 经项目持续授权发pinned TypeSafe，仅advisory本轮JSON；credential只由环境进入HTTP授权头 | 不作为机制/门槛/自动改码依据；原始数据仍只留本机 |
| `node tools/verify_water_proposal_browser.mjs <source-round> <new-round>`（新入口全行审，复用已审App/browser server/生产World与assembly） | 已核proposal receipt/四rule+源+两mini、current manifest38固定角色；只ownedorigin，当次新prefix immutable包、原App代码，精确generated模块夹具替换，其它world旧URI硬拒；Node仅4精确候选URI内存fetch，不转发 | 新独有round完整38角色及manifest/metadata、20章fresh/JSON独立assembly收据、三布局/receipt或failure；新ownedcontext自身空IDB，不读真实档/profile，不install不热换 | 真实同生产App一章fresh加载候选、192城/独立修订mini+角色URI、标题懒加载、三尺寸/边框、0error；r3另20章Node生产assembly能力JSON恢复逐字段同；分类/M-06未审批，不冒充CPU或全规则认证 |
| `node tools/render_water_proposal_review.mjs <source-round> <new-round>`（新入口全行审，已有Playwright） | 只已核proposal receipt及四明确SVG，PNG dataURI唯一允许资源；禁止script/foreignObject/iframe/非data图片链接；不加载游戏/全禁network | 新独有round四PNG/receipt，四全新ownedcontexts/about:blank关闭，截图不写原素材 | 仅hash同SVG的审核图片，不当类别/原视觉/任务通过 |
| `node tools/propose_map_water_annotations.mjs <new-round>`（新入口全行审，共同compile/minimap/maplayers依赖已审） | 当前generated固定sourceURI→manifest核过source/原plane/graph/两helper/atlas/旧mini七角色；明确作者JSON；固定geography-review-r2已核原plane图；6源码hash；不读取DOS/SAVE/profile或网络 | 新独有round完整候选源/逐实例region与waterClass/geo/native4资产/同核心两mini/自含SVG对照与region图/收据；不安装不覆盖 | 仅Web作者显示资料，候选几何/整格岸线近似/每个lake区待审核；实际water原子field覆盖/删除unknown阻断/显式补底校验，不借此认证原水标签。原Rule4资产及路网/chapter保持，生产入口无豁免 |
| `node tools/verify_minimap_seed.mjs`（新入口及纯minimap/maplayers已审） | current generated固定sourceURI，明确4源码hash，纯数组；临时Math.random/Date.now抛错后finally还原 | stdout/新本轮日志，不网络/真实档 | 两尺寸同seed像素同，变seed仅显示像素变化/geoMask同，源原样/无ambient RNG或time；非原纹理算法或分类认证 |
| `node tools/verify_world_revision_late_browser.mjs <new-round>`（新入口全行审、browser_test_server/两metadata/World及snapshot依赖已审） | 只旧stage-r4已审generated/worldJSON及当前源码；ownedorigin Web两既存修订目录，不跟随任意路径；route拒外部/API/SAVE | 两个全新ownedcontexts模拟previous/current页面；旧spring atlas晚到门、独有receipt/failure；不热换live世界，不真实profile | 旧已加载metadata通过受控route模拟，其真实旧资源仍可取；新页固定新revision且旧晚到不改其state/RAM/RNG，非不存在的编辑器热切世界认证 |
| `tools/verify_asset_retry.mjs`（已逐行审入口/imports） | 仅自身、assets.js/worlddefinition.js源码指纹；mock Response/Image，不转发网络 | 纯内存mock和stdout/本轮日志 | 失败重试/单航班/不同URL修订；不代替真实浏览器和清单hash验证 |

## 4. 机制证据纪律及当前缺口

- 原单平面98,304B和MDL256块只能证明已知tile与像素，不唯一恢复隐藏底层。导入覆盖物下层用带来源unknown；删除后需要作者选择明确替换，不补草地。
- 组件写入原byte是创作合成合同，不能从水域类别/道路标签反推通行。原消费者E4CE/E961、2708、4B63、8A1E逐域复核；未知组合拒收，不gameId豁免。
- 水域展示标注可为Web视觉资料，但需明确人工导入依据/置信度；不得把边缘连通启发式当河湖海原证。若不足，继续核原资源并单列待用户标注/视觉确认，不自称实锤。
- 历史M-06普通图及242格开局遍的记录保留，仅适用旧产物；新地理/布局差异必须再提供对照。
- 历史当时尚无全轮通过/人类认可，不允许complete；现已由页首真实认可、批准采纳、新39入口及静态收据替代。该历史缺口不再作为当前待办。

## 5. 历史实际结果/失败沿革（只适用各自SHA，不覆盖页首新轮）

- M0-r1 exit0：原MMAP解包98304字节与出货/layout全同；256原子像素库存、192节点、254边/5526点、五库20章的3840城市坐标及道路运行图对应。原证窗、982F分类表与来源hash在`m0-r1/baseline.json`，工具/Node版本随报告。水域类别及隐藏底层并未因此实锤。
- layered-r1及r2 exit0：25项纯编译检查；r2新增整图92586装饰原子＋5526道路原子＋192据点中心，base全unknown，重编整平面逐字节相同；改组件实际改字节，删除阻断，明确补底后允许。Q62/Q66合成样本、调序、删除、隐藏/锁定无效应均通过。没有将原件水域标注问题靠合成样本销账。
- layered-engine-r1失败：测试把地形平面的`readByte(address)`误作移动占用图的`readByte(rowParagraph,x)`，读到地址240的6而非(10,10)的20；核对scenarioterrainmemory原API后仅修夹具为`readTile(10,10)`。失败日志保留。
- layered-engine-r2 exit0：同一原子源/共享编译0.3/四个固定修订资源/生产fresh prepare走20章192城；组件(10,10)20→16实际写入原生Scenario平面；原生2708点动作在原路到(252,9)，旧rev1编译包在rev2之后仍旧；原输入hash不变。夹具直接写本测试自有临时store，不声称完整编辑器CRUD或突破8MiB接口配额。
- 编译契约变化将editor-local版本升至0.3，旧0.2目录不覆盖、不复用旧成功收据。正式内置manifest接线尚未做。
- cache失败重试、自检0.3和旧道路闭环三项串行exit0：纯mock的JSON/bytes/Image失败后可重试、成功single-flight及不同修订URL隔离；既有原生改路/晚到资源/损坏资产负控仍过。日志为`asset-retry-r1`、`editor-03-selfcheck-r1`、`editor-03-road-loop-r1`；真实浏览器尚未因此覆盖。
- M0-r2 exit0：实际Web辅助`road_cost.bin`与图点＋节点mask相差**15773字节**，两个既有cost入口逐byte相同；因此不把旧harness mask当正式无编辑迁移输出。共享`compileGameSource`（原trial API为同函数别名）增加明确`compatibilityAssets`输入，校验后保留字节，不造KI成本式。最新同引擎r4已验证辅助原样对照及坏兼容输入负控，exit0。
- 原子recipe候选进一步校验定义身份、视觉绑定及显式水域mask；未知recipe在draft只留诊断、不产可运行替代。layered-r3最新30项exit0；engine-r3遇ECONNRESET失败，日志保留，不能解释为规则失败或隐藏重试。夹具增加失败stage记录并明确采用Connection:close（本机测试传输策略，不改产品服务），engine-r4单次重跑exit0，全20章/辅助原byte/原生点动作通过；不能由此推导真实浏览器连接表现。旧r2不当最新收据。
- m2-stage-r1 exit0：隔离生成统一四层GameSource、显式辅助资产、四季资源、自动小地图及20原章/目录/聚合data的完整角色hash清单、新content/world修订，地形0差异、v2图语义0差异、辅助byte0差异、20章不变。未安装到游戏；地理/道路显示标签仍明确PENDING候选。此后给修订摘要增加Node/zlib编码版本（防不同编码器同URI异byte），r1不当新工具最终收据；待stage-r2/r3复现与stage verifier执行。
- stage-r2/r3两干净目录全角色产物逐byte、清单和修订完全一致；`verify_unified_map_stage` exit0，通过原规则/辅助/data/20章身份保真、依赖URL均在清单、无请求的资源构造及正式新修订catalog/world的20章fresh。日志`m2-stage-repro-engine-r1`；新修订`map-2-1cc07d8133f51ee36f3124b9a14114bacfa7d7e565fb74dd7b0b0e9853f3f644`。仍未安装进当前游戏，不包含JSON/浏览器或分类审核。
- cache接缝审计发现pathfinder资源加载在offset JSON失败前会先安装terrain/cost，下次跳过失败资源；仅改为HTTP/尺寸/finite offset元组检查后原子安装、单航班失败清Promise及只读offset，不动任何A*/原生寻径/权重/字段/RNG算法。原图辅助bytes保持原样；world-retry-r1五类故障、world_resources-r1及stage-repro-engine-r2串行exit0；仍非真实浏览器证据。
- 同合同复制审计补上`compatibilityAssets`实际携带，并把sourceRef摘要扩至map/defs/helper（此前只world/章未覆盖）。编译profile以M0原192槽XY受信表拒移城（所有身份同门，不称原版不能移城）及原章raw +08/+0A错绑定；不放开G-SLOTS。契约提升到0.4，旧目录不覆盖。stage-r4/r5两新目录复现、完整同合同复制/原子20→16/原件文件保留/辅助literal保真/raw坐标负控、20章新身份fresh与旧复制/自检/改路闭环串行exit0，日志`m2-stage-repro-copy-engine-r3`、`gamesource-copy-04-r1`、`editor-04-selfcheck-r1`、`editor-04-road-loop-r1`。旧stage-r2/r3仍是历史0.3结果。20章JSON checkpoint等新增覆盖待最新工具重跑。
- 最新20章生产assembly内存JSON checkpoint恢复与旧world/content修订拒收exit0，日志`m2-stage-repro-copy-json-r4`；不是App/IDB存档证据。
- 38角色hash核后仅本地新增新修订目录及generated metadata模块（installer读38资产＋构造metadata与stage逐byte比较，拒任何覆盖），日志`m2-local-install-r1` exit0。旧目录/原件保留；catalog与DEFAULT_WORLD已接新候选，gamebar同清单两尺寸及共用外框/命中几何已修改，尚待实际浏览器与完整安全级重验。原图地理分类仍PENDING，不能因为本地接入宣布完成。
- unified-browser-r1 exit0：真实当前App新身份/四个规则资源及两尺寸小地图均同compiled修订；标题不加载世界大资源；普通1024×768、放大1280×768、回退640×400外框/名牌完整，实际Input导航与框消费通过，页面/请求错误0。三图与receipt保留；未代签M-06。
- menu-save-2-r1 exit0：新修订真实菜单存A/B、隔离、覆盖A而B不动、返回标题、空槽hover/hit/click三禁、重载后恢复B日期通过；完全隔离context，已移除真实SAVE stat后才执行。日志保留；旧身份槽保留未因此覆盖。
- projection-browser-r1 exit0：DPR1/1.25/2各独立新context，真实中立inline capture完整98304格写集精确为中心＋四角，来源8A1E原窗及去向§12.2；四季共12例均从当前revision atlas实际MapView捕到五个精确投影命令，cached/direct逐像素差0，渲染Scenario/装配RAM/路线/RNG不变。12图和完整receipt保留；仅中立inline，不冒称战斗/撤退/灭亡全链。
- identity-browser-r1失败：跨await夹具仅直接赋clock.hold，生产syncClock会释放它，导致期间规则推进；改用真实settingsOpen所有者的hold，失败轮保留。r2发现真实准入缺口：旧world/content身份已拒且原件保留，但缺terrain的v2快照被允许restore、合成静态初值。仅在正式App admitSavedScenario增加v2必需movement/terrain/cityCache检查（共同合同的缺能力拒收），先于loadState/RNG/场景改动；不改底层局部装配API、不修补/删除存档、不作为原KI机制。新增五项隔离IDB负控及持久保留，待r3重验。projection新轮亦采用真实所有者hold保证跨季节冻结。
- identity-browser-r3 exit0：五类world/content旧身份和缺terrain/movement/cityCache均在App preflight拒收，live场景/RAM/Rng/date与各记录不变，刷新标题后6条自有IDB记录仍全部保留。projection-browser-r2用真实settings hold重验四季×DPR1/1.25/2，全部exit0；五格写集/实际atlas绘制/uncached-cached像素同/绘制不写RAM及不消费RNG均通过，失败与早期弱夹具轮保留。
- content_catalog/start_flow/slot_phase/retained_layers/fixed_rng_march_diff/tactical_entry_full/save_transition_guard逐个串行exit0，日志随同名入口r1；fixed_rng是Web固定输入确定性，tactical目录切片验证不是整场战斗认证。
- native-formation-r1失败27/28，唯一入口均在未改的prepareScenario fresh89F0遇合成城市缺type；此旧编成夹具限定加载后的BA平面，未建模开局遍。仅把与其原mock逐byte相同的全BA当前平面作为显式terrainMemory输入，不补type/不改任何编成字段、静态golden或RNG预期；已有稀疏显式输入用例原样保留。全原章fresh/opening由本轮其它入口独立验证，不能用这份局部夹具认证。失败日志保留，串行&&后续三入口当时未执行，待新轮。
- native-formation-r2、native-road-movement-r1、slot-battle-r1、road-field-r1串行exit0：前两28/32项与P06五case证书不改golden；road-field仅3active pass、5已退休walker skip不算通过。新增fixture修订不是原机制补默认。
- 已审的旧内容离线编译（独有legacy-compile-r1）、content_pipeline、13pin锚点、纯weather/disaster、3DPR retained渲染浏览器、真实weather/fire/riot/TALK71/72及P24存档生命周期串行exit0；新编译产物没有覆盖旧资源或历史round。渲染fixture只添加当前World清单引用，生命周期夹具改真正settings所有者hold；预期/规则原样。测试结果不得替代原图分类或用户视觉。
- 审查后按流程发出Jev change最小1729B人工摘要（先preview逐项检查、无原资源/源码/日志/存档/个人信息/凭据），pinned1.13.0输出仅advisory：偏存档/状态、提示focused/round-trip复核。未把概率用作规则/门槛/命令/路径/改码输入；人工和确定性验证继续权威。
- 再核原E4CE..E50B发现共享编译还需核最终可见node scan；全行原指令见node-scan-primary-r1.log，来源hash可对M0。只补本批固定192槽/坐标/顺序支持域门，不声称原版如何处理畸形源；编译器升0.5。额外CB原子/移除node中心双负控、同源副本/20章fresh+JSON及stage-r6/r7独立复现全部exit0，日志m2-stage-node-scan-r5。当前游戏仍装此前0.4候选；0.5需新目录本地接入并重验，旧目录均保留。
- 0.5本地新目录安装完成，切换前/后均核上一metadata字节，错误previous-stage负控拒收且原模块/目录不改；原0.4、0.5并存。selfcheck/改路/unified-browser-r2/projection-r3/identity-r4全exit0，随后projection分支等价去三元＋stage明确JSON传输新轮亦过。
- M-03永久样本persistent-sample-r1已产出28资产/完整改后源/manifest：原件source SHA及来源当前0.5修订固定，恰(10,10)20→16一字节，图/helper不变；同原编译/引擎20章读取native16且JSON恢复逐字段同，不是只改ID。mini和atlas固定复用来源修订（geo/路网未变），不声明完整App编辑器。
- advisor-lock-2-r1真实未选/全锁/可见city/右键恢复过；march-indication-2-r1目标指示拖拽及mini导航、实际委任/退层/pointer hold释放、中立活页CAPTURED过；加强终点不得把day/modal cap算捕获成功，保持既有规则，不作新原机制证明。
- machine-suite-r1以必要环境白名单串行36入口全部exit0，固定65源码及38runtime资产＋manifest（39文件）前后SHA无漂移，完整AGENTS安全列表/保存mock事务失败/20章/相关M00-M05/新App浏览器均实跑；收据明确pass-scoped-machine-suite且goalComplete=false。起止2026-10-01T02:49:32.675Z—02:56:59.696Z；退休5项skip非通过，固定RNG不是CPU等价。全收据/逐组exit/日志SHA在machine-suite-r1，不拼接历史绿。
- geography-review-r1只生成审核材料：256索引sprite、原初始平面坐标图及旧手工/旧auto/新两尺寸对照；原候选hist85812/9420/3072/0，provenance明确UNAPPROVED，原lake标签缺失且旧river/lake混类不能当完整分类。源规则byte/图/helpers完全不动；标注仍需独立解决，图片批准不能替代类别数据审核。
- minimap-seed-r1两尺寸同seed相同、变seed只显示像素变化/geoMask不变、原源不变且临时禁止Math.random/Date.now仍通过；只是已批准Web显示seed，不称原RNG算法。late-world-browser-r1两ownedcontext模拟已加载旧metadata页及新0.5页，旧spring atlas晚到仍从旧实际目录成功加载，不改新页完整state/RAM/RNG/身份/mini URI；不热换live场景，两目录请求各守自己的revision。
- geography-review-r2将PIL解码改为只读白名单/hash已核的BytesIO（不重开路径），重跑三图SHA与r1逐字节同；原r1材料/失败轮全部保留。只是I/O护栏，不改变类别或图片验收。
- 静态分级已核48个变更JS＋main语法、1Python AST、8Markdown/85本地链接路径（r1为84，journal补链接后r2为85）、git diff --check；仅LF/CRLF warning非失败。最后重跑/文档更新收据static-delivery-r3，65源码及39角色文件仍与machine-suite-r1 SHA同，不把链接路径当anchor校验。
- 主动LSP最后49代码路径：findings1（formation json夹具JSON round-trip的structuredClone建议，保留其明确JSON合同）、inconclusive47（push-only无法证明clean）、GameBar8609>5000 too_large1；Markdown无ready server，不称全部clean。session mode=all缓存19warning：asset retry七固定fake URL×重复runner两份、savegame三既有style、Python两旧行path sink；Python已经改BytesIO/三图相同但缓存旧行未刷新，不宣称cache归零。fixture URL全部只用注入mock不联网、生产寻径/RNG/保存oracle不因风格告警改写。
- 未完成/阻塞：原显示水域资料需要显式逐实例河/湖/海标注审核，现未审historic连通/颜色来源不能替代。已查原KI地形消费者/256原sprite/原初始平面/候选类别及直方图，未发现本批可复用已核lake展示标签；合成湖泊用例仅证明编译器能力，不认证原湖泊分区。下一验证需原sprite＋坐标对照制作/核对Web展示标注数据，明确标为作者资料而非原通行机制，水域调序/显露下层及两尺寸重新生成/同图表回归；不得无依据沿用启发式或补公式。
- 自动继续轮新增显式Web资料，不沿用旧flood-fill/颜色分类：详见[水域显示审核](map-water-display-review.md)及其唯一JSON维护源。明确curated原sprite IDs、1外海/13湖区多边形、剩余水图样river候选、35 waterRoadIds/其它219 land含桥；有依据的原字节保持与作者类别选择分开，17道路显示标签与旧any-water-point启发式不同，原graph flags/cost/geometry不变。数据未审，不冒充原通行机制。
- explicit-water-proposal-r1/r2/r3结果限定过，失败日志/旧材料未删。r3陆74588/海9874/河13135/湖707、逐实例23716格；20章order+states digest同，4rule资产/原有序图/roadMask 0差。实际湖原子field遮挡仍lake、删露unknown拒收、作者明确land替换才改摘要，生产compileGameSource同门。
- explicit-water-review-r3四自含SVG新context PNG通过，无page/console/network；短标号＋独立图例可读，水路图明确label而不是原交通认证。
- explicit-water-App-r1/r2/r3只新ownedorigin/新context：当前38角色复制至隔离完整proposal修订，输入hash在写前核，metadata精确受控替换，所有world角色同新prefix，旧URI/外部/API/SAVE硬拒。192城/一章fresh/标题懒加载/两mini URI/普通208及大250及回退208外框过，0errors/forbidden；r2去settings遮挡用owned截图hold与真实sync结果取并集，非hold规则测试。没有安装到当前Web；r3新增Node严格4URI mock，全部20章本proposal身份fresh/生产assembly JSON恢复逐字段同，独立完整字段assembly-receipt保留，不把一章App图像当20章或CPU规则证明。原36suite绑定65code/39resource仍同SHA，没有重复未漂移门。
- portable explicit stage收口：新stage_explicit_unified_map_game从固定22个Web/作者JSON输入直接import/lift/apply同生产compile、两mini及38角色/manifest，不读ignored历史中间源或current编译包；map_water_display_authoring纯函数成为两入口共用逻辑，原65生产/工具及39current资源仍同SHA。原legacy stage仅历史复现，不将其启发式重新当正式作者资料。
- shared extraction focused：propose-r4全部14产物及sourceDigest/nativeParity与r3同，PNG/App审核材料仍对应同内容；不重复未漂移浏览器。explicit-stage-r1/r2两干净目录38产物＋manifest/generated metadata逐byte同，修订map-2-7056303571d7db33dc86d1d85a609bba1317d719f4c9e0fb40837023b7815e1e；完整origin和工具/输入摘要不同就如实新修订，非冒充旧身份。两个mini和4native资产与既有作者审核候选同byte；hist及13区域、35道路标签同，无新作者决定。
- explicit-stage-repro-r1 checker误调用content.reference(idx)失败，日志不删除/不改名为通过；原API核对后仅改chapter(idx).reference，r2两目录/所有输入工具Hash及38角色、20章新世界fresh/生产JSON恢复逐字段同、7作者数据错误拒收过。不改规则期望、不复跑旧36、不宣称新整套认证/真实App当前已安装。此新portable包仅隔离输出，仍PROPOSED_NOT_APPROVED。
- 本次追加静态/诊断：3新JS node --check、作者JSON14 region/35水路、3变更文档18本地路径、git diff --check过；explicit-water-static-r2将文档后续更新独立核签。原36suite 65code/39resource仍同SHA，未复跑未漂移旧门。新JS主动LSP=3 inconclusive/0返回诊断，JSON probe亦未确认；Markdown unavailable，session all仍19既有/旧cache警告，未称clean或擅改配置。
- portable后续分级：4个新/变工具主动LSP无返回诊断但全部inconclusive（push-only，不等clean）；session all缓存20warning含之前19与MD012旧行。当前文档字节检查无三连续newline，不把缓存旧行当有效新修订诊断或擅自清缓存。代码syntax/三文档本地路径、原65/39SHA及详细版本/限制再签至portable-explicit-static-r1；不修改全局配置/权限，不把未确认LSP写成通过。
- portable-stage-App-r1已从独立stage38角色/原metadata直接进入真实App（不是复制已装包重包装），三布局/标题懒加载/192城、4规则与2mini请求过。审图发现normal/640短视口右侧面板覆盖640×48军师条；这是原新版几何检查漏项，不是水域或原机制问题。
- layout-2本地只改mappanellayout纯位置：预测初始直列/横排与既定advisor条交叠时，整体下移到y84并重新判断横排；1280宽屏无重叠保持原位。菜单关闭仍预留其区域，羽扇开关不移动导航控件，不改地图/时钟/RNG/原数据。原36suite的65源码中仅layout和其纯测试2文件发生本次范围内差异，39资源不变；旧36是旧几何收据，不自动当最新全绿。六个已审focused入口串行exit0，独有round不覆盖：layout2-pure-r1矩阵；portable-stage-App-r2真实三尺寸menu AABB/六角色请求；layout2-current-App-r1当前默认包/导航；layout2-advisor-r1锁退层；layout2-march-r1真实目标/mini导航与中立CAPTURED；layout2-retained-r1三DPR cached/direct像素。仅纯显示位置修正，旧36不当新完整套成绩；所有旧图/漏检记录保留。
- layout2分级：3个变更JS主动LSP0返回诊断/3 inconclusive，session all当前19既有/旧行警告（MD012不再在缓存摘要），不是confirmed clean；语法/文档路径/diff与仅2源差/39资源0差写layout2-focused-static-r1。保留六入口真实receipt/log及r1遮挡图，不因截图已修就替用户签视觉。
- install-review-guard-r1：历史installer此前只核资产/metadata，没有拒收PENDING。现在读取manifest后、角色读取/目录创建之前拒未批准map或author状态；五项实际CLI在自有临时repo（确切installer代码SHA同）拒收：历史PENDING、explicit提案、缺review、只改map状态、缺author状态。都没有角色文件，拒收须是明确review原因而非ENOENT；目录未创建、switch未改，真实当前39资产SHA不变。不自动批准、不实现新批准生成/安装流程，修改两个字符串也不等于记录了人类验收。installer不在原65快照内，需其单独工具SHA及本次负控证据；原65仍只有layout/纯测试两差、其余63及39资源不变，不把历史36改写为新整套通过。
- install-review-static-r1首次静态checker错误地假设installer属于原65，预期3差/实际2而失败；不是产物或规则失败，失败记录保留。按原receipt实际键集合更正仅静态checker，r2核2代码语法/三文档路径、installer独立SHA、5拒收case及原65两差/39资源不变。两文件主动LSP0返回diagnostic、2 inconclusive（push-only）；未把未确认当clean，未复跑旧规则门。
- offline-review-r1仅把既有七PNG与两个验收门打包为单HTML，无script/form/network，CSP禁外部。四review图按原receipt输出SHA核，三App图原收据无输出hash，在本次包装固定SHA并核PNG viewport；七dataURI解码SHA逐项同、全部输入前后同。未重渲染/重跑旧门/更新作者资料/切换当前包。新入口语法/diff过，主动LSP0返回诊断但1 inconclusive；仍不称全clean。水域审核页链接此离线材料。
- 安装接缝独立推进：名称门新增explicit-stage-rN（previous亦同），与历史族同38角色/原尺寸/world角色全指同revision/规范Controlled module/previous byte，不使PROPOSED/isolated模块变可装。新增hash/length准确角色错误，不改编译/原数据/运行码。explicit-install-transfer-r1先5case过；随后追加world显式同修订拒混门，r2六case过：explicit未审、terrain坏hash、world自洽checksum却旧URI、previous mismatch均写目录/switch前拒；temp内mock APPROVED两个字符串仅覆盖38byte-copy、旧目录保留、原子switch、immutable重装拒，非原图或M-06审批记录。原五拒审门因installer源码变化重验r2/r3，最新r3过；不重复无漂移规则/浏览器。
- 所有转移只在本测试自有OS temp repo，真实Current39、Current模块/manifest及proposal38原byte不变。未造真实批准，不安装当前候选；approved资料生成/真实批准记录和正式采纳仍等待真实验收。installer与新增测试不在原36的65源码键集内，旧65仍仅几何两个差/63同，39角色同；正向复制测试不是人类批准机制或新整套规则认证。最后两变JS主动LSP无返回diag、2 inconclusive，不称clean；本轮语法/三文档本地路径/diff、65键集实际差/39current/38proposal及两focused收据绑定维护于explicit-install-transfer-static-r1，不把无变化运行源码重测。
- 待用户M-06和类别资料：请使用水域审核页列出的新旧mini、坐标分区/图例/35水路及同候选App三布局；检查边界/湖区/原sprite集合/道路作者选择，以及道路水系可辨、色调纹理、外框势力名牌相邻UI不叠。类别批准与视觉批准两个门，不重复索实施授权、不代签。其余授权无依赖步骤已继续完成，目标仍active。
