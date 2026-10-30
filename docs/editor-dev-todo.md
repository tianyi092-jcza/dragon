# 编辑器功能开发待办（功能先行，部署后行）

用户决定：先完成编辑器开发，再说部署的事。部署事项（sidecar上线、V2–V5、发布验证）全部挂起，不在本清单排队。本清单只收功能开发缺口，状态源自[逐项索引](editor-requirements-matrix.md)，不复制证据。

约定：`[做]`=有基础待补完，`[缺]`=基本未开始，`[判]`=待用户决策。

历史条目的“已关闭／全绿”只对应当批范围，不覆盖[完整验收清单](editor-completion-audit.md)的剩余项。作者上下架、旧档单档确认删除和画像上传已被后继决定取代，校正索引见[政策冲突校正](editor-requirements-matrix.md#后继政策冲突校正)；旧上传／裁剪／解码记录不再作为现行开发队列。

## A. 实体编辑（据点/武将/势力/章节）

N3约束（已探明，不违背）：`FixedCopyProfile.verify`全图比对，城市任何改动都要新chapterEdit op+回滚臂；192基地锁不碰（Q27是“移除放置”不是删城）；字段证据见`re-notes-entity-fields.md`据点§2/§8。
- N3-1 章节城数值：`troops`（+13）/`prod`（+0E/F），门为同记录cap（`troops_cap`/`max_prod`，§8规则3），非负整数。已落地：`gamesource.editChapterCity`（decoded+raw同步改写，分歧拒收），单元十七项全绿；N3-2已关闭：draft capture `city` op门 + save应用环 + `copyprofile`回滚臂（含raw），`tools/verify_vps_city_save.mjs`七项全绿（profile接纳/拒收、存盘rev2、读值可见、超cap/坏形拒收）。N3-3已关闭：`stronghold.txt`章节选择+逐城troops/prod输入+保存（绝对值语义、cap预检、冲突落字、成功后重读），`index.html`加章节下拉，`drafts.read`城市投影加troops/prod/troopsCap/maxProd；`tools/verify_stronghold_ui_model.mjs`十六项（模型轮，非浏览器证书）+ 存盘八项 + 单元十七项全绿。LSP本轮超时未确认，以功能测试为证。`growth`/`defence`（缺上限证据，规则9）、`governor`（要武将身份同步）、`name`（Big5定长编码）、`owner`（要attr/+1B重建）、放置增删（要tile/component证据+回滚臂）全部另立项，不塞N3-1。
- N3-2 N3-1的draft capture op + profile回滚臂 + 存盘往返。
- N3-3 据点表单UI + 引用清单扩展 + 保存发布守卫。
- [缺] N3 据点CRUD：可写资料、放置、章节引用清单、安全移除、已证字段表单。
- [缺] N4 武将CRUD：全字段、历史人物权威、继承、跨章删除、新增槽（128锁定不变；改名/头像/君主军师解散已有）。
- [缺] N5 章节继承与覆盖：可写基础资料、“本章自定义”/恢复继承、势力/首都/预算初始化。
- [缺] N6 普通中立模板与空章：已证中立开局（minimal复制+无章不算数，不填0/FF/50）。
- [缺] Q27 移除据点：保资料/章节、标断路、禁发布。
- [做] Q28 新空章/复制本章：B4a已落地，可玩空白章与继承未放行。
- [做] Q13/Q40/Q41/Q51/Q52：章节独立势力、势力可选、开局无军团、完整/最小复制范围（局部有证，初始化与跨引用未闭合）。

## B. 地图/素材工具

B-3a已关闭（结构门）：试编译硬锁192槽坐标，移城永不可编译（`unsupported city relocation`钉住），B-1/B-2双门是结构性的不是暂行的；重开需G-SLOTS槽语义，另立项。B-3b已关闭：拓扑路由（GET状态+POST move/move-clear/rebuild/rebuild-clear，CSRF+Idempotency-Key+owner门，upsert语义）miniflare冒烟十一项；mapview叠加绘制（意向琥珀标+断路红线+计数，topo失败降级）模型七项。Q26仅剩产品分叉（模板内容/画像/同名显示规则）。B-1已关闭（Q14意向层）：`roadedit.moveCityIntent`/`brokenRoads`纯推导（意向不碰正本）+ `server/topology.js`意向存取（`draft_topology_moves`表，game外存档）+ 存盘/发布双门（有意向即422，缺表兼容旧库）；十三项全绿。B-2已关闭（重建记录层）：`draft_topology_rebuilds`表（形态门：整点/边界/连续/端点一致/长度上限）+ `status()`断路展示（broken/rebuilt/uncovered）+ 门保持红（flags/cost/slots要tile证据，B-3）；同脚本扩展至二十一项全绿。重建UI绘制与B-3全量验证待续；运行时准入仍关闭（原证门）。
- [做] Q14/Q21/Q59：移城断路重连、无据点路口、水陆同门、任意拓扑与规则消费适配。Q21/Q59已关闭：`buildRoad`本就有shared-cell/segment/X-crossing拒收与水陆同门（kind只记不参与门）；新增`tools/verify_road_gates.mjs`七项（水路接纳+同推导+水陆同拒收+X交叉）全绿，既有`verify_road_edit`仍绿。
- [做] Q39：超界预览/确认扩边（当前拒扩图，容量原证未闭合）。已关闭：`previewTranslateOutOfBounds`（越界格精确预览，只读不改）+ `requestMapExpansion`（确认即拒，容量原因为据）+ `buildAndStore`首门（非384×256拒`PLAY_MAP_BOUNDS`）；`tools/verify_map_bounds.mjs`九项全绿，既有115项组件套件仍PASS。
- [做] Q56/Q60/N7：完整语义工具栏、其它变换、语义组件权威（关卡/古战场/长城等）。已关闭可关闭部分：`tools/verify_tool_matrix.mjs`三十七项（全工具定义域接纳/拒收矩阵：查询、引用、更名、移除、水组、填底、平移、调序、拆分、擷取、放置、库门）；旋转/镜像/碰城/路戳/隐藏底明确不在装饰工具射程内（缺tile语义证据，不发明），N7语义组件权威仍缺。
- Q26 已关闭（2026-10-15，用户决策③）：作者经 `POST /api/games` 自建（registryId 服务端 pin 已安装源）；同作者重名 409，跨作者放行（＝重名允许）；`publishedGames.list` 条目追加 creatorAccount（玩家侧「名＋版本（作者）」）；当批画像自传 owner-only 曾通过，但该许可后被H节禁上传政策撤销。`tools/verify_author_create.mjs` 十七项为当批收据。原“模板画像库待建”已由621共享库选择政策取代，不再排队自传或独立模板库。

## C. 草稿/版本/发布（功能侧）

Q30-1历史切片已关闭（失败落字；下述头像上传／删除入口已按H节退役，不恢复）：`general.txt`的`saveEdits`／头像上传／头像删除三处失败现在写模块区消息并继续上抛（提示框类输入瞬态，重做即可；不再只靠壳层status）；`tools/verify_generals_conflict_model.mjs`六项（失败消息+上抛+取消不发POST），壳矩阵六十九项仍PASS，三个编辑模块ESM语法核过。- Q30剩余完整编辑表单仍缺（此前被C-2b/D阻塞，现阻塞已除，可排期）。

Q45/Q9/Q20部分关闭：`tools/verify_publish_matrix.mjs`十二项（目录隔离谓词、下架owner/admin矩阵、幂等/内置、改密门）＋Q25新契约（listed过滤、pin ordinal）回归全绿；路由级发布全管线仍待B-3b2装配。Q30剩余完整编辑表单可排期（阻塞已除）。

C-1已关闭（Q18/Q24/Q42核心）：`server/releases.js`（`bumpOrdinal`字符串步进`0`→1.0→…→1.9→1.10 + `ReleaseLedger`发号/指針/历史，无回滚API）+ `tools/verify_vps_releases.mjs`二十二项全绿。C-2接线已关闭：`issueInTxn`/`publishInTxn`双环境形式 + `#publishPin`终提交单事务（重验权属/修订→发号→上架，pin形不动，失败回滚不耗号），原子性四项已验（二十六项全绿），发布矩阵十二项与发布包二十二项回归全绿。C-2b已关闭（E-01四十七表重验epic，2026-10-15）：运行时45表→generator补20源→公告2表后47表/94对象/317列；`deletiondefinitions.js`/`deletionschema.js`重定基（+10表、users+4画像列、+11索引，零删减）；`uniquerows`/`indexprojections`/`validatedfreeze` keys 46→47；`deletioninventory.js` knownTables准入（scopedTables不动）；16 lane＋3 runner计数同步；7/7可跑lane重跑绿（definitions/columns/unique/fk/index/name/sql_check）。残留：draft-freeze/private-namespace两条重lane blocked-on-env（private-write-journal fixture R2 put after-pause无release死锁候选＋sql-freeze writeGate二次包裹），真修单独立项，不属重定基。

Q25 已关闭（2026-10-15，见用户决策①②）：`publishedGames.list()` 只列 `listed=1`（JOIN content_games）；pin 加 `ordinal`（发版传入、新旧严格校验）；`ReleaseLedger.pruneExceptInTxn` 发版事务内删旧序号行（`next_ordinal` 照递增，单版本替换）；pack 全量删写。`verify_publish_matrix` 按新契约改后十二项绿，`verify_workerd_parity` 二十项绿。node 平面未动（分叉记账）。残留：直接拼 URL 取未上架 pack 未封（UUID 不可猜）。
- Q18/Q24 正式发布序号已关闭（见C-1）：`bumpOrdinal`字符串步进＋失败不递增已验。
- Q25 决策见上（已关闭）。
- Q42 无回滚已关闭（见C-1设计）：无回滚API，错版只发新序号递增修正；Q25单版本替换删旧版与之相容（旧序号行事务内删，`next_ordinal`不回退）。
- Q30/Q45/Q9/Q20：陈旧拒收、两作者/管理员权限矩阵、作者发布不被绕过已随Q25/C-2关闭；Q30剩余完整编辑表单仍缺。

## D. 公告/目录/玩家端
- Q31–Q33/Q35/Q36 公告后端已关闭（2026-10-15）：新 `server/announcements.js`（DDL主人#21：`content_announcements`＋`content_registry`）＋publish/listing事务announce＋管理下架bump＋匿名GET分页；`tools/verify_announcements.mjs`二十二项全绿。Q34玩家侧公告UI仍缺（另立项）。
- [做] Q10/Q29 原旧局续玩／旧版保存警告政策已撤销。当前新版旧局停止禁存、同版下架可继续、不热换Scenario；本地联合复验见[R2§2.72](r2-player-connection.md#272-当前版本唯一的共同发布联合复验current-publication-1)，生产发布／物理回收仍未放行。
- [做] Q11/Q19/N8 原“版本不符单档确认清理”已撤销。已确认更新的旧档自动清理及新版保存原子清旧见R2§2.69／2.72；其它不可用档识别／管理及完整环境矩阵仍缺。

## E. 试运行收尾
- [做] Q67–Q71：列表分支/权限/窗口矩阵、快照迟到组合、撤销/App侧/故障组合的当前SHA整体验收。
- [做] Q37剩余：共享画像ID＋SHA引用与完整消费者闭包，见完整验收清单A16／A20／A32；旧上传格式／裁剪／解码色彩认证不再排队，Q69原证缺口另立项。

## F. 账户/安全矩阵

F-1已关闭：`tools/verify_idor_matrix.mjs`十项（跨作者与未知id不可区分：快照/草稿读写/头像上下行/blob权柄/任务入队同码，Trial同401，未认证恒401）。此为含旧画像上下行的历史矩阵；当前共享资源读取／Trial全提交与async边界、线上配置仍待F-2，不恢复上传。
- [做] Q38/Q44/Q47：内容资料权限、线上配置（KDF/epoch/改密/限速已有）。
- [缺] T§6：内容IDOR、共享资源读取／Trial全提交与async边界、两作者管理员全矩阵。

## G. 删除
- [做] Q43/Q46：fence之后继续——全内容核清、共享保护、备份清理、玩家明确错误退出（不远端清档）。

## H. 用户已决策（2026-10-14）
- [定] JPEG源预算：保持当前值（16384像素/单边8192/100KiB），不扩大。
- [定] Q25/Q26/D/A2（2026-10-15，用户决策①②③）：发布＝作者定版，上架＝管理员操作、仅上架进玩家目录；无回退、只增不减、仅保留当前版（A2只显示当前版；原R2选择A后被新版全部作废决定撤销，见下一条）；开放作者自建（第一章＋公用基础地图、重名允许、玩家侧「名＋版本（作者）」；当批“画像自传或模板库选”已由下文禁上传／621共享库政策取代）。均已落地并 commit（见C-2b/Q25/Q26/D/A2条）。
- [定] **原R2选择A已撤销**：新版上线旧版游戏全部作废，不再为旧版续玩或兼容保留运行数据；旧局确认更新即停止禁存，旧档提示并自动清理，新版保存同事务清旧。仅下架且版本未变可继续，公告历史不授旧版准入；物理回收仍须保护当前版、共享资源及其它游戏。政策维护于[产品§5](game-editor-design.md#5-草稿校验与发布)，接线／本地联合复验及尚缺的物理回收见[R2§2.69–2.72](r2-player-connection.md)；不拿旧SQL行剪枝冒全量清理。
- [定] A2 发布 UI 完整分支验收补齐：`GET /api/games/:id/releases`版本列表＋`publish.txt`作者UI（发布对话框/版本列表/公告预览/失败落字）＋lane化验证（releases四码冒烟、`verify_publish_ui_model`十六项）；修Q26遗留POST 500与多余`}`、简体混入改繁体。
- [定] 画像政策（2026-10-15，用户决策，取代上传管线）：禁上传，武将画像一对一取自共用画像库（`web/kao`，621 PNG／11.2MB，编号命名；`manifest.js` 提交生成，lane 自核）；发包记ID＋SHA（`kao/<id>.png`，R2 取数），pack 不嵌字节。编辑器上传链已退役落地（`portraits.js` 唯读、worker 路由、pack 冻结、general 选择器、9 lane 删除、idor／publish_pack 20 项／shell 68 项／generals 6 项改绿、E-01 46 波 7/7 重跑绿）。后继Trial服务上传口已退役；残留客户端上传／裁剪／图库在[R2§2.60](r2-player-connection.md#260-固定库新身份与trial选边修复library-refresh-1)清除并复验真实启动；其余重 lane（sql-freeze／bound／validated／waits／reference／management）待跑；R2 `kao/` 621／621 已传。
- [定] R2布局（用户已建 `dragon` 桶）：`kao/<id>.png` 共用库（一次上传永不覆盖）；`artifacts/<gameId>/<releaseId>/<sha>/…` 发版包（画像只记ID不嵌字节）；`projections/<generation>/<digest>/…` 目录/公告/release索引快照；`control/current.json` CAS根。桶保持私有、无公开域；读经Worker binding。需用户授权见journal。
- [定] V5切换/上线：全部开发完成后进行。——任一有效会话存在时新登录一律409（码`SINGLE_USER_ONLINE`，非401）；同key重放、同会话续用不受影响；退出/过期释放座位。Q9/Q20/Q45多角色并存验收收窄为单用户流；workerd开发后端是否跟进该门另议（已封存 lanes 不动）。已实现：`vps/auth-server.mjs`经`EDITOR_SINGLE_USER=1`开启（默认关，S3十九项不受影响），`tools/verify_vps_single_user.mjs`七项（拒/重放/释放/过期）全绿。

## I. 部署（挂起，不排队）
- sidecar上线、V2解码隔离、V3分发、V4读取端、V5切换、Outbox确认协议审阅、发布部署验证。
- V1本地移植切片（S1–S10）作为功能开发底座保留，不推进部署动作。
