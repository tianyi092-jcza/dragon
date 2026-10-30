# 私有固定副本草稿：精确读取与限定保存

> 下列早期API支持域与验证是 PRIVATE-DRAFT-1 历史切片，不代表现行接口只支持四资源或尚无章节／地图／实体编辑。现行逐项状态见[全量审计](editor-completion-audit.md)；本次所有权及读后epoch复核见[后继端口验证](#后继所有权与读后epoch端口验证)。旧成绩仍只绑定各自源码，不冒当前全矩阵。

## 范围与权限

`E-01-BACKEND-PRIVATE-DRAFT-1`安装真实Root私有接口，不是完整编辑器／运行／发布完成。原管理员固定来源复制、账户和存储规则不改；新增`server/drafts.js`，Root只装配服务、路由和跨接口永久key检查。409旧声明输入（含375玩家输入）保持字节，根玩家部署未改，无部署／云创建／提交推送。

- 实际会话／强制改密／owner／epoch；管理员不越权读取或写他人。内置403、外人404，UUID与修订类型严格检查。
- 服务固定definitionDigest必须同时匹配SQL目录与copy origin。两表自报同值不构成证据。read/save/query在R2读取或结果重放之前检查；每await后复查原actor／epoch，最终SQL再检查固定来源和主体。
- baseline只来自管理员已提交`copy_origins`、固定目录和实际不可变R2；完整规范JSON、全分块实际SHA、共同结构门、`FixedCopyProfile`品牌和全源差异校验。客户sourceRef／ownerId／valid／root／cap都不能赋权。

## 早期HTTP接口（历史支持域）

| 接口 | 合同 |
| --- | --- |
| GET `/api/games/<UUID>/draft?revision=<positive decimal>` | 必须恰好一个明确修订；读取实际不可变快照，不回退latest。仅返回元数据、20章标签、公开势力槽四资源值与限定profile／摘要，不返回全地图／raw／对象路径 |
| POST `/api/games/<UUID>/draft/save` | 实际Origin／CSRF、`If-Match: "<revision>"`与`Idempotency-Key`；缺条件428，陈旧412。只收`{metadata:{name,introduction},resourceEdits:[{chapterId,slot,values}]}` |
| GET `/api/games/<UUID>/draft/operations/<key>` | 原主体当前epoch查询永久请求，返回pending／failed详情或经原immutable snapshot及content receipt再次核验的committed结果 |

字段只允许`money/reserve_cav/reserve_arc/reserve_inf`，通过共同`editChapterResources`同步具名字段和对应9个原生byte，并完整对比baseline；不允许source/raw/map/角色/计数/新章/上传。最多32补丁，重复章＋槽拒，请求16KiB限额；这是Web运维预算，不是DOS机制或容量证据。

**signed24/u16只说明表示安全，不批准异常值运行、可玩控件范围或Trial/Release。** 本API轮没有表单覆盖；后继[实际私有资料表单](editor-backend-draft-ui.md)只安装名称／简介编辑和只读资源，不代完整UI。普通`POST .../draft`和validate/compile/Trial/publish继续404。

## 持久事务与失败

`draft_requests`绑定实际actor/key/epoch、目标、精确期待修订、HMAC请求摘要及捕获的规范补丁；客户对象在await前捕获，不读取getter/隐藏/symbol/有损JSON。其它接口同key冲突409，异内容或旧epoch409。失败显式重试先在同SQL预约事务恢复pending并清旧error；不后台自动重试。

实际R2写之前记录`draft_objects` intent，conditional immutable写入＋真实读回后verified。保存最终同SQLite事务执行metadata CAS／名称／审计／snapshot／`draft_references`／对象committed／永久结果，最后content操作记录失败能回滚全部这些SQL变更。已有副本baseline与旧快照不改。no-op保留原修订和modifiedAt；失败同样不改游戏modifiedAt。staging记录不是物理垃圾清理；旧epoch不可继续写错误记账，也不能由新cookie复活旧请求。

明确修订与baseline各经过实际源解析和共同验收；当前为避免改变已证实的verifier接口，提取metadata与共同验收有重复读／解析。不称Cloudflare CPU／内存／时延SLA。并发相同key可能准备多次，但只有一个SQL永久结果；没有新增lease／调度／背景executor。

## 本轮实际验证与失败分析

详细生产者与日志位于`backend-private-draft-session-r1`，当前产品SHA分别绑定在每轮元数据和最终静态收据中。

- `draft-r1`八组通过，源与测试归档后补固定服务definition和失败重试状态。`draft-r2`只在测试要求一定观察到瞬时pending的断言退出；未记录该请求的最终结果，不追认成功或保存失败。
- r3改用真实owned SQL触发器记录failed→pending及error清空，并在committed前强制检查OLD为pending／错误为空。实际并发HTTP查询看到failed→committed、未捕获pending，写请求200；**不把两个独立HTTP请求的调度顺序当成保证，不以盲重跑遮蔽r2**。
- 最终`draft-r3`九组50实际Root HTTPS请求：完整副本20章精确私有读、guest/foreign/builtin、Origin/CSRF/条件写、非法整源／角色值、no-op、元数据＋四资源原生9byte保存修订2、永久结果／跨key／陈旧412、旧修订1、独立真实R2全源与共同writer完整比较、启动器重启、并发同keyno-op、真实末端SQL receipt触发故障500全回滚、同key显式重试提交3、两SQL目录/origin同错definition409与恢复、登出／运行门仍闭。
- 独立`epoch-r1`三组18请求：ignored派生Root与实际PrivateDrafts／SQL／R2，在真实预约后明确阻塞一次真实读、观察pending、真实改密、用新会话释放读取。原写401且游戏状态不改；新会话查询／重试旧key409、旧会话读401、当前会话正常读200。控制口只在ignored夹具，不进产品，不用sleep假装并发边界，不伪造会话或库。
- 当前七完整回归`metadata-r1`八／`blobs-r1`九／`auth-r1`七／`catalog-r1`八／`copy-r1`八／`jobs-r1`九／`ids-r1`十一全部通过；真实Root复制入口`entry-r13`六组40请求、fresh Chromium、两实际副本/pending启动器重启及独立wx截图通过。没有本轮私有表单/browser覆盖或无关87库存全跑声明。

真正原件、SAVE、用户IDB/profile、实际云秘密／证书、部署均未触及。SQLite fault/tamper仅服务器关闭后的owned临时库，明确恢复；R2独立inspection只读自有persist真实字节。所有失败、源码与生产者保留，不能把未跑／unconfirmed诊断冒clean。

主动12路径最初0clean/1findings/7MD unavailable/4JS push-only inconclusive：唯一error是ignored夹具对native Request绝对URL的静态误判，按精确文件/行/消息标FP，不改source/inlineignore/规则/cache。随后5source warning probe为1clean/4inconclusive、0显示诊断且FP仍明示隐藏；不冒全clean。session296文件23既有warning保留（此前14logger裁决与9旧sink/duplicate/JSON项），正确await括号不迎合hint改错。适用Node语法与真实执行另外签；Jev4919B人工工程摘要经0redactions preview审阅后发jev-1.13.0，仅advisory，无源码/资源/秘密/存档/完整log。

## 早期后续清单（历史）

后继[资料表单](editor-backend-draft-ui.md)已有失败输入保留／冲突／原key查询和实际改密后的保守恢复证据；完整受权私有工作台仍缺，随后共同compiler、图像/头像、runtime/Q69/Trial/发布及引用删除／备份恢复。精确四资源表示门不扩成角色／地图／新章初始化或中立开局规则。全目标继续见[工作表](editor-goal-completion.md)与[需求索引](editor-requirements-matrix.md)，不关闭E-01或任何未完成全项。

## 后继所有权与读后epoch端口验证

本次只读核 `PrivateDrafts.#owned/#load/#put/save`：所有者及主体epoch在异步读取／写入后重新核对；最终同步事务再核主体、来源、永久键并经 `compareAndSwap` 提交。没有据此新增防御层或修改产品；以下只验证列明边界，不把代码检查当完整异步权限证书。

发现 `tools/verify_vps_draft_save.mjs` 的旧“cross-author 404”标签实际只给了无效令牌 `hx`，期望 `SESSION_INVALID`，不是有效外作者的404证据。现改为准确的无效令牌401标签，另在既有内存SQLite种子中明确加入另一作者及管理员，通过该工具原principal端口提供三个不同有效主体。它们是**明确身份夹具，不是真实登录／会话验证**，底层仍为实际 `PrivateDrafts`／metadata／snapshot verifier／私有写账本、临时FileBucket和固定20章来源；复制来源登记也沿原种子，不冒实际复制HTTP。

- 有效外作者及管理员分别不能read、save、query原收据、captureForCompile，逐项核 `GAME_NOT_FOUND/404`。拒绝集合没有新增草稿blob read／put、保存操作预约或游戏行变化；管理员无跨作者编辑豁免。
- 在一次实际文件读取返回后，由测试端口将原作者epoch由1改2，同时更新自有users行。正在保存的原操作立即 `SESSION_INVALID/401`，只发生该一次read，无put、无游戏行变更；原pending请求保持epoch1、result为空，不由已失效权限改写错误状态。新epoch查询及重试该原键均 `OPERATION_REVOKED/409`，不再读写blob，也不复活请求。
- 原正常创建、no-op、资源保存到2、精确读回、旧修订／原键结果、陈旧修订及编译捕获正控保持。该受控读后transition不是实际密码API并发，该批未覆盖put后（后继验证见下）／prepareSnapshot后／最终事务各分支的完整失效矩阵；上述旧真实epoch-r1成绩仍是历史独立证据，未重跑。

`.dragon-analysis/editor-completion/draft-owner-ports-r1.log` 23项通过；后继补HTTP状态和读后epoch边界的最终 `draft-owner-ports-r2.log` 28项通过。本次无失败功能轮；语法／diff与文档链接检查通过，工具主动LSP300秒push-only未确认。仅既有测试及文档变化，无服务／规则／UI／DDL修改，不重建原生或后台壳，不重复无影响浏览器、完整复制HTTP、Trial／发布链。A03／A29的全入口、完整登录与异步提交矩阵仍未关闭。

## 后继对象写入返回后epoch验证

复用同一工具与真实私有写账本／临时FileBucket，在 `putImmutable` 完成写入及摘要读回、尚未返回 `PrivateDrafts.#put` 时，由明确principal夹具将epoch2改3并同步自有users行。输入显式改变简介，确保不是no-op；只触发一次草稿put。blob自身authority仍为该工具原固定端口，本轮验证的是草稿层写后复核，不冒blob内部撤权、真实密码API或完整HTTP认证。

保存返回 `SESSION_INVALID/401`。该原键保持pending、auth_epoch2、无result；唯一draft_objects行保持intent且SHA与真实put返回一致，没有进入verified／committed；游戏行和全部draft_references不变。新epoch查询／重试旧键均409，重试无额外blob读写。新epoch使用独立新键可正常提交修订3，原失权键仍不可查询，不由新成功收据复活。已写对象可能命中既有不可变内容，本测试不要求创建新文件；意向保留，不据此宣称失败回滚删除或物理回收完成。

`.dragon-analysis/editor-completion/draft-put-epoch-r3.log` 35项通过（原28＋7）。保留两轮测试失败：r1错用draft_references的draft_revision列，实际列为revision，发生SQL异常；r2沿用无编辑输入，属于正常no-op，未进入put且新增七项断言失败。纠正测试列名及使用明确简介编辑后重跑通过，没有为迁就断言修改产品或准入。

仅既有测试与文档变化；语法／diff和链接检查通过，工具主动LSP等待300秒仍push-only未确认。未重建不变后台／原生束，不重复无影响浏览器／规则／Trial／发布链。此处是在首次对象写入返回后拒绝，未到最终事务；prepareSnapshot返回后的后继验证见下，其它提交分支仍须独立覆盖，A03／A29／A30与长期目标均未关闭。

## 后继快照准备返回后最终事务撤权

同一既有工具在真实 `GameMetadataStore.prepareSnapshot` 完成不可变内容验证并返回其真实prepared对象之后，将principal夹具epoch3改4、同步自有users行，再把原对象返回 `PrivateDrafts.save`。局部包装在finally中恢复，不伪造快照能力、不替换校验结果或提交函数；产品代码未修改。

最终同步事务入口返回 `SESSION_INVALID/401`。此前该操作的所有draft_objects均已verified，但没有转为committed；原请求仍pending／auth_epoch3／无result，游戏行与全部draft_references不变。新epoch查询／重试旧键409，重试零额外草稿blob I/O；独立新键可正常提交修订4，成功后原撤权键仍409。与上节首次put后的intent状态区别明确：这里验证已完成全部对象写入和快照校验也不能替代提交时权限。

`.dragon-analysis/editor-completion/draft-prepare-epoch-r1.log` 首轮42项通过（原35＋7）。仍为显式principal／复制登记端口夹具及内存SQLite、临时FileBucket，不是实际登录／密码API并发、blob内部authority失效或全入口权限矩阵；也不代表物理删除已写内容。仅测试和文档变化，语法／diff／链接通过；工具主动LSP300秒push-only未确认。不重建未变程序壳或运行无影响浏览器／Trial／发布／规则链。A03／A29仍部分，完整目标未关闭。

## 后继草稿与地图读取的迟到删除栅栏

核读 `PrivateDrafts.#load/#owned/captureForCompile/#readMapProjection/readMinimap/readDecorationSelection` 后，确认既有后置所有权检查包含 `assertNotDeleting`，未新增平行校验或修改产品。复用 `verify_vps_draft_save.mjs`，在真实FileBucket根对象读取成功、尚未返回草稿层时，向自有内存SQLite插入明确栅栏夹具。

六入口分别为精确修订4正文DTO、编译捕获、1×1地图窗口、整图投影、小地图及装饰框选。每项在途调用均409 `GAME_DELETING`，只完成第一次根读取、没有put；同一栅栏下随后再请求仍409且零新增I/O。七张内容／快照／草稿请求／对象／引用／复制登记表逐行保持，栅栏仍在；每案finally仅移除其自有测试栅栏以隔离下一案，不模拟生产解除删除，也不是正式删除事务或物理清理。

完整入口 **66项通过**（原42＋6×4），原保存／读回到修订4、跨主体、读后／写后／准备后epoch失效检查保持。证据 `.dragon-analysis/editor-completion/draft-read-fence-20261029/` 的 `tests-r1.log`、`before.json`／`after.json` 记录551项选定输入SHA前后保持。输入仍为固定Web来源，不访问DOS存档、用户profile或网络；SQLite为内存，FileBucket为原工具自有临时目录，principal及复制来源登记是明确夹具。

该负控只证明首次真实根读取后的拒收及后续请求的前置拒收，不冒每个分块、图集await、HTTP状态分派／真实登录、浏览器或完整权限矩阵；没有执行地图绘制成功路径的新认证。语法／diff／文档链接按本批核验，无产品、DDL、源资源或束变化，不重跑无影响规则／发布／浏览器长链。A29／A30及整体目标仍未完成。

## 后继图集端口返回后的删除栅栏

沿同一工具补充不同的await边界：真实修订4源／profile捕获全部完成后，注入atlas端口接收准确token／registry／spring，在返回前插入本游戏自有栅栏。返回值刻意为null而非图像；既有`readMapAtlas`的`#sameOrigin`必须先返回409 `GAME_DELETING`，不能先检查或解码载荷而产生其它错误。随后重试仍409且源／atlas均零新增读取，七张内容表保持、没有put、栅栏保留；finally仅移除自有测试行。

默认完整入口 **71项通过**（原66＋5），551项选定输入SHA前后保持，证据 `.dragon-analysis/editor-completion/draft-atlas-fence-20261029/`。原根读取、保存、跨主体和epoch矩阵仍执行。只有atlas端口及插栅栏时机为明确夹具，其前面的快照与FileBucket读取是真实路径；不冒实际PNG读取／解码、HTTP登录、四季浏览器或每个分块的权限证明。产品已有后置门，本批仅扩测试，不改服务／DDL／程序束。

## 后继草稿对象读取异常后的权限复核

前两节只验证成功返回后的权限门。本轮复现不同路径：对象读取抛错时，`PrivateDrafts`原先跳过后置`#owned`，使同时发生的epoch变更或删除栅栏被原I/O错误遮蔽。六个正文／编译／地图读取入口共12项反例失败，日志 `draft-failed-read-20261029/before.log` 保留；没有据此声称返回了私有字节或发生越权提交。

修复在复用的`#readBlob`中统一成功及异常后的`#owned`检查，覆盖根索引、内容分块、baseline和stored verifier的对象读取。权限有效时原异常对象原样抛出；失效时返回当前`SESSION_INVALID`／`GAME_DELETING`等权限错误。保留原来源比对、内容解码、预算与提交边界，不增加重试、兜底空数据或新授权策略。

既有 `verify_vps_draft_save.mjs` 对六入口各核三种异常：权限不变、实际FileBucket读取后epoch变化、读取后插栅栏。原异常保留或精确401／409拒收，均只增加一次读取、零put、七张内容表不变。权限与来源仍为显式夹具，异常由读取适配器注入；不是实际磁盘故障、真实登录／HTTP或所有分块位置的故障枚举。独立atlas端口抛错及完整来源变化矩阵不在本次覆盖内；atlas异常的后继限定验证见下一节。

完整入口 **107项通过**（原71＋36）；原保存至修订4、跨主体及成功取数的撤权／栅栏验证保持。证据目录 `.dragon-analysis/editor-completion/draft-failed-read-20261029/`：`before.log`、`after.log`、501项选定源码／策略／固定资源的`before.json`与`after.json`，前后SHA相同。内存SQLite、自有临时FileBucket，无网络／浏览器／DOS存档；沿用工具保留临时目录的行为。两JS语法检查通过；主动LSP两代码push-only未确认，文档一clean、一仅三条既有词典提示。mode=all保留既有boolean参数与测试console两项warning，不屏蔽或称全仓clean。未改Web／DDL／程序束，不将此局部修复称为完整A29验收。

## 后继独立图集异常后的权限与来源复核

独立`#atlas`并不经过`#readBlob`。本轮在真实源／profile捕获之后让该端口抛出固定异常，分别同时改变epoch、插入删除栅栏、改变注册来源root摘要；修前均错误保留原I/O异常，三项失败已记录，不能沿用成功返回时的后置门证明异常路径安全。

`readMapAtlas`现在在异常分支也调用原`#sameOrigin`，复用其所有权／epoch／删除栅栏及捕获来源比对，再抛原错误。有效权限和未变来源的正对照仍严格保留同一个异常对象；三种变化分别401 `SESSION_INVALID`、409 `GAME_DELETING`、409 `DRAFT_SOURCE_CHANGED`。无额外重试、PNG兜底、注册策略或写入行为。

同一默认保存服务入口 **119项通过**（原107＋12），其中四例均先完成真实FileBucket源读取，再进入一次显式atlas故障端口；七张内容表保持、零put。finally仅还原各案自有epoch／栅栏／注册行用于隔离。此为内存SQLite、自有FileBucket与principal／来源／故障时机夹具，不是实际PNG流故障、HTTP认证、浏览器或完整来源变动枚举。

证据 `.dragon-analysis/editor-completion/atlas-failed-read-20261029/` 的`before.log`保留三项失败，`after.log`为最终119项通过，`before.json`／`after.json`重新计算的501项输入SHA保持。两JS语法通过；主动LSP两代码push-only未确认、文档一clean／一仅三条既有词典提示，mode=all保留测试收据console的既有warning，不屏蔽或声称诊断全清。未改Web、DDL、运行资源或程序束，不访问用户存档和生产内容。

## 后继对象异常时的注册来源复核

前述权限修复不等于来源复核已覆盖：首次根读取及校验器再次读取同一根时，注册来源root摘要若在等待期间变化并同时抛错，原异常分支仍只查主体／删除栅栏。新增六入口×两个读取位置的12例，修前全部漏报 `DRAFT_SOURCE_CHANGED`，而保留了原I/O错误；没有发现私有字节返回或写入。

本轮将`#readBlob`和传统校验委托异常分支的`#owned`改为既有`#origin`（内部仍先复核主体与栅栏），stored校验异常出口亦复用原捕获值的`#sameOrigin`，然后才执行原格式错误映射或抛出原异常。正常成功路径、来源策略、写事务及错误预算不变，无新重试或授权。此处补的是异常出口，不宣称所有来源变动时机、baseline字段或跨系统竞态已穷尽。

同一 `verify_vps_draft_save.mjs` 默认完整入口 **179项通过**（原155＋24条断言）。新增每例核实际读取后注册root变化、精确409错误、一次根／第二次根确实到达、零put及原七张内容表保持；注册表变化由测试显式注入，finally仅还原自有注册行。原权限有效时保留同一异常对象、epoch／删除栅栏及图集矩阵继续执行。内存SQLite与自有FileBucket，principal／来源登记及故障时机为夹具，不冒HTTP登录、磁盘故障或完整A29认证；临时目录沿原工具保留。

证据 `.dragon-analysis/editor-completion/draft-source-failure-20261029/`：`before.log`的12项失败、`after.log`完整179项成功，重新计算501项选定输入的`before.json`／`after.json`相同。两JS语法及diff检查通过；无Web／DDL／程序束变化。主动LSP两代码push-only未确认，文档一clean／一仅三条既有词典提示；mode=all保留测试收据console的既有warning及三条词典hint，不屏蔽或称诊断全清。

## 后继快照二次读取异常的权限复核

继续沿实际快照调用核查，而非重复首次根读取：传统正文路径`#readSource`在发现源元数据后委托`GameSnapshotVerifier.verify`重新读取根与内容。该委托原来仍只有成功后的`#owned`；校验器抛错时可遮蔽期间的epoch变化或删除栅栏。编译／地图使用的stored路径已通过受保护对象适配器检查，不应一并误报为缺陷。

既有工具增加六入口×三条件的18个定点故障场景：以精确修订4的根SHA计数，在同一根第二次实际FileBucket读取返回后注入错误，首次根与中间读取照常执行。分别保持权限、变更epoch、插栅栏；每例核第二次根确实到达、无put、七张内容表全文保持。修前只有正文DTO的epoch／栅栏两项失败，其余路径及原异常保留正对照通过。修复仅给传统校验委托增加异常后的原`#owned`复核，不改校验器、结构规则、分块预算或保存语义。

完整默认入口 **155项通过**（原119＋36条断言）。证据 `.dragon-analysis/editor-completion/draft-verifier-failure-20261029/`：`before.log`保留两项失败、`after.log`最终通过，501项重新固定输入的`before.json`／`after.json`保持。故障与principal转变为显式夹具，源索引／内容及文件读取真实；不是每个分块／依赖位置、HTTP登录或实际磁盘故障的穷尽验证。只用自有内存SQLite／临时FileBucket，无网络、用户存档或生产操作；两JS语法通过；主动LSP两代码push-only未确认，文档一clean／一三条既有词典提示。mode=all保留旧boolean参数与测试收据console两项warning，不屏蔽或称全清。无Web／DDL／束变化。
