# 删除栅栏后的只读引用观察（E-01-BACKEND-DELETION-INVENTORY-1，内部限定）

接续[永久栅栏](editor-backend-deletion-fence.md)，新增`server/deletioninventory.js#GameDeletionInventory.observe`及明确owned验证。**不是清理计划、引用图完成证书或删除capability**。Root／全部既有stores／UI／453旧输入含375玩家不改；`ImmutableBlobStore.delete`仍关闭，没有公开观察／delete API。

## 权限与观察边界

- 实际同SQLite principal及owner或admin管理权，必须非内置、已登记used ID、未listed、持久fence的owner与row同当前Game。foreign author先404；admin管理权只得到最小计数／摘要，不得读他人内容、字节或对象key。没有客户端SQL／prefix／valid／hash／临时lease／可恢复计划输入。
- 同步事务捕获schema、Game/fence及当前关联记录：snapshots／names／audit／delete operations、copy requests/objects/origin、draft requests/objects/references、compile jobs/operations及data/image/fallback objects、可明确关联的content operations/reservations。receipt关联按实际gameId或actor/key，不按散落hash猜所有权。
- 现行表名白名单；未知表名503，实际表结构也进入摘要，过程中升级拒。**表名白名单不认证未来新列引用语义**。无game ID索引的copy/stage HTTP command键、尚未存在的release／Trial／upload／backup图仍缺；不能称全部SQL可scrub。
- 跨游戏snapshot／Job的准确`root_key`若指进本游戏private prefix，单独计数。sameSHA但位于`installed/...`或别的`private/<gameId>/...`不是相同物理对象，更不是可删共享refcount。没有根据hash去扫／删共享库。

## 两次R2元数据列表不是原子清理快照

实际固定`private/<gameId>/`分页，只读key／size／etag；每个list await后再次查principal／epoch、Game/fence/schema及关联SQL全摘要。两次完整排序元数据观察必须相等；重复key、坏prefix/文件名、非正长度／坏etag、坏truncated、重复或坏cursor都拒；过程SQL或对象差异409。不接受部分页当成功。

- 文件名SHA仅是存储描述，不是完整bodySHA；**本轮不读取资源body、解码媒体或检验其内容正确**。etag也不作内容证书。
- SQL引用缺对象计`missingReferences`；已列但无当前SQL索引计`untrackedPrivateObjects`，不是允许回收。多条引用／R2元数据的明确长度矛盾503；root无长度时不猜。
- intent与running记录各自计数，queued不冒in-flight；零计数不证native I/O已经drain。两次相同列表仍可能漏两观察之间变化、尚在途PUT或未索引引用，非跨服务事务／删前排他锁。
- 固定4MiB编码记录／1万对象／128页是工程观察预算，不是原游戏阈值、原SQL全部取数内存界限、云SLA或整体heap保障。当前捕获有全表筛选，不能承诺无限数据集性能。

仅返回`gameId/rowRevision/sqlDigest/inventoryDigest`及计数，mode恒`OBSERVED_METADATA_ONLY_NOT_DELETE_PLAN`，**`deleteAllowed:false`无例外**。内部记录及列表不外传，不持久保存计划；无新增refs、row增量或内容modifiedAt。新合法会话重新观察不等恢复旧操作或原key成功。

## 当前实测

独立`.dragon-analysis/editor-phase/backend-deletion-inventory-session-r1`，随机工程配置、owned OS temp SQL/R2、loopbackHTTPS、白OS子环境、已有workerd。仅工程fixture继承原Root、前批真实fence夹具，加只读service及受控故障；Native fixture-only remove／损坏SQL只用于本批owned数据，绝非产品物理删除出口。

最终`main-r3`八组、87记录Node请求、9成功观察：

1. 实际owner/admin／builtin／UUID／未知对象／强制已fenced及最小返回字段；foreign author对admin全副本在fence后仍404。
2. 真实257B opaque snapshot（不是正常新章／GameSource／玩法），相同hash另存installed工程namespace，不改private观察摘要、不读删共享对象。
3. native orphan可见、长度258/257冲突拒、fixture移除root如实missing1；真正starter/workerd重启后同观察及持久fence，非进程计划。
4. foreign root alias计数、未知schema／非法private key拒；不泄露foreign identity/body。
5. **真实20章fullcopy＋baseline，metadata保存2、实际data29／images7产物＋queued spring Job**；最终85 private对象／85引用hash、192关联行、missing0／untracked0／intent0／running0。强制native每页2项，实际双完整分页；前后Game/snapshot/objectRows/origin/shared registered facts不变。该对象数只是本样本，不作产品期待常数。
6. 实际native列表后分别注入重复cursor／duplicate key／outside prefix／truncated类型／null entry，五精确503、不部分成功；清故障后摘要相同。
7. native第一列表返回被暂停，修改当前SQL或追加orphan，晚回分别精确`DELETE_INVENTORY_CHANGED`／`DELETE_INVENTORY_OBJECTS_CHANGED`409。
8. 实际password handler在列表await中撤旧session，晚回401；新epoch可新观察，依然没有删除权。

r1七组通过后保其三份源码／日志／报告；先加fixture四列表fault及foreign权限控制，r2完整重验八组。随后人工复核发现null数组项原会抛TypeError而非结构化拒绝，保r2源并补service显式object门及第五fault；最终r3当前SHA完整重验八组。没有producer失败／timeout／signal或拼成绩、延预算、放宽门。未重跑无关browser／游戏／PNG／媒体：Root/UI／所有旧源未改，本轮无浏览器操作或用户profile/IDB。源码、两轮报告、imports与455声明／453保护／375玩家、语法／链接／73Q另封存。

Jev只发审阅过的4187B人工工程摘要（r2范围，后继null门由确定性人工复核／r3测试覆盖），固定1.13.0 advisory；无原码／资源／秘密／用户态／全日志，不作规则、权限或期望oracle。LSP active及session-all另签，unconfirmed不冒clean。无commit/push/deploy/cloud/install/trust/SDK、DOS-SAVE或共享清理；goal仍active。

## 后继限定命令关联

[持久命令目标关联](editor-backend-command-targets.md)补新copy/stage绑定及明确合法旧键重放的target；观察核当前关联行并加入固定`httpCommandCoverage:BOUND_ROWS_ONLY_LEGACY_UNKNOWN`，仍非全部历史。前文192行/原14字段是本轮历史样本，后继增加coverage和已绑定行；原缺关联不猜。Root运行与取消权限分别复查，完整legacy图／drain仍缺。

## 后继Root私有PUT记录

[限定journal](editor-backend-private-writes.md)在同SQL记Root当前私有PUT pending/settled/uncertain；新增三个观察字段privateWritesPending/privateWritesUncertain/privateWriteCoverage，关联行/SQLdigest纳入journal，不把文件名SHA当资产引用或body证明。十九组当前实际兼容/故障/restart有证；两个0不认证全局排空，legacy UNKNOWN/deleteAllowed false保留。

## 后继命令关联封存（原observe仍仅结构）

[服务proof](editor-backend-command-proofs.md)新增同SQL命令目标MAC及独立fenced核验，真实同actor合法另一个target错配，新proof门拒而原inventory仍UNKNOWN；不能追认原存在门为完整性seal。inventory现在捕获该game proof行进入SQL摘要，不自行验证MAC、不改变DTO／legacyUNKNOWN／deleteAllowedfalse。最终33组318请求及原26当前兼容有证，462声明457旧保；全历史、共享refs、writer/drain和物理／backup准入仍缺。

## 后继实际字节核验（不授删除）

[私有byte核验](editor-backend-deletion-integrity.md)补当前实际body完整长度-SHA、前后观察／epoch及Game-fence门；85对象50,665,541B、同长损坏与十二native控制、真实restart/改密及原十九兼容最终26组有证。原文「本轮不读body」仍是inventory本身的准确边界；新service不返keys/body，不将hash或两个0当refs/drain/清理capability。461声明459旧全保，deleteAllowed仍false。

## 后继当前编译任务冻结（不是native排空）

[当前任务冻结](editor-backend-deletion-job-freeze.md)在永久fence内将queued/running/retryable失败置非retry终态／撤lease／推进代次，保ready和原非retry失败，记录HMAC并核当前行。inventory仅捕获content_deletion_job_freezes行进SQLdigest/associatedRows，不核其MAC或改DTO。实际零Job只新增该记录令晚到观察409；另一实际场景Job running计数0时native pending仍1。最终40组含原33兼容，464声明461旧含375保；既有观察依然deleteAllowed false／legacy UNKNOWN，不授所有writer或排空。

## 后继固定列布局门（仅当前布局）

[列布局维护源](editor-backend-deletion-columns.md)补表名门尚未拒当前已知表新增引用列的缺口：固定34表234列／七属性，actual table_xinfo包括generated字段，每次授权/fence后、scoped及native前与await重新capture核验。当前46组含原40原期待兼容，真实ALTER／virtual hidden2／PRAGMA控制与restart有证；466声明463旧含375保。前文「表名不认证未来新列」是旧阶段限制；如今未知新列直接拒，但不认证未来引用语义／全部DDL或完整图，DTO／sqlDigest构造／legacy UNKNOWN和deleteAllowedfalse保持。

## 后继当前显式多重边（非完整图）

[多重边维护源](editor-backend-reference-edges.md)抽出原显式引用提取共用helper，节点去重但保table／row fingerprint／field全部边；observer原summary/长度门保持，新同步内部summary说明当前归属次数，不返私有图。SQLite独立COUNT/json_each及重复snapshot同物理root／foreign alias／实际restart最终52组含原46原期待兼容有证，468声明465旧含375保。仅current explicit graph，不把跨namespace同hash、journal记录或legacy未知当共享refcount或删除资格；真正完整图与计划仍缺。

## 后继当前pending草稿冻结（仍非native排空）

[草稿冻结维护源](editor-backend-deletion-draft-freeze.md)仅新增content_deletion_draft_freezes的known/scoped捕获及对应fixed列布局；每await原SQLdigest因此能检出零draft新增freeze记录，旧DTO不授排空或delete。35表243列只是当前声明扩展，原34逐属性保持；原PrivateDrafts/Root不改，failed/committed及所有内容和引用保。59组当前全链有证，SQLpending0/nativejournalpending1仍明确非drain。

## 后继同事务协调（仍不授删除）

[协调维护源](editor-backend-deletion-sql-freeze.md)同storage外层事务重核fence-row/固定列及copy终态，原Job/Draft共同冻结／第二seal失败全回滚，只重核原两HMAC表；原inventory/scoped/columns源码及35表243列全不变。返回当前pending计数可变不是immutable计划/成功收据，恒false。最终67组原59当前兼容，实际Root nativeawait/rollback/race/MAC/late409/restart/改密有证；r2 generic502细因未知，失败保、只改新观察flow原native通知后全fresh，不冒完整provider排空或SLA。

## 后继Root命名空间封闭（coverage仍UNKNOWN）

[维护源](editor-backend-private-namespace.md)只关闭非private-key原生PUT旁路，inventory源码/scoped/schema及DTO全保持。当前五writer族同BlobStore、两个rawcatalog readonly核查不宣称alias/legacy/provider闭包；72组原67当前兼容、坏key无SQL/native/合法/条件null/fence/restart及installedroot bytes有证，Root journal计数仍非排空能力，观察deleteAllowed恒false。

## 后继当前实例原PUT等待（coverage仍UNKNOWN）

[维护源](editor-backend-current-write-wait.md)新增active登记/原promise finally通知，服务有限等待自己捕获PUT并每await核实际身份/fence/schema/seals；pending无本实例handle/跨restart或uncertain拒，超时只撤own订阅/timer，不取消原native或修SQL。最终83组原81当前兼容，旧源独立ack probe误返200保，当前captured entry actual ack及同tuple原行留存门分别拒SQL假settled／ack后删行503不repair；实际Root两边界/并发/timeout/unknown/ackfault/restart/坏MAC-column/实际改密有证，475声明472旧保；原inventory/scoped/35表243列/DTO不改，0当前依然恒false，不授wholeprovider/读流/CPU/fullrefs/delete。

## 后继当前读取调用退出（coverage仍UNKNOWN）

[维护源](editor-backend-current-read-wait.md)：登记在原Root BlobStore read而非此inventory/body核验器，原journal get/list透明、inventory/scoped/schema/35表243列/DTO保持。same-storage原freeze有限等待当前调用退出，包含失败与cancel次错，不授body/provider/历史证明；93组原92当前兼容，r1源/report保，新outer await actualauthority复查及原inner最后scope后真实fence控制409；477声明473旧含375保，三个drain/delete字段恒false，没有新表/公开route或全引用/reader closure。

## 后继冻结全局账本引用诊断（仍不授删除）

`server/deletionfrozenrefs.js#inspectFrozenGameReferences` 是独立内部只读诊断，接收服务端可信 `FrozenDistributionLedger`；**不是权限门，不接公开API，不接原observe，不开放非空账本的删除观察／清理准入**。原 `DELETE_DISTRIBUTION_UNSUPPORTED` 保留。

- 逐代读取实际ledger的完整payload并依赖其字节／永久摘要链校验，严格核冻结envelope、catalog及其projection；publish附带runtime必须与对应catalog当前版本一致。不能只按事件行的 `game_id` 查引用：另一个游戏的发布／上架事件仍携带全局catalog中的本游戏资料。
- 返回目标游戏出现在哪些代、是否仍含current／announcement内容、是否仅deleted标记、其他游戏计数，以及目标的去重runtime描述；不返回人物／章节内容、游戏名或作者名。后继新增内部全目录索引描述会包含其它gameId，不能把此内部诊断作为作者公开API回包。runtime描述仅是后续取证入口，不是其资源闭包、现存对象或允许删除清单。
- 实际producer的delete-fence会把当前catalog该游戏变为 `deleted:true,current:null,announcements:[]`，但历史payload仍含旧内容。本诊断明确区分这两类，不能把最新根已隐藏等同历史物理清除。
- 默认最多1000代；调用者可收紧预算，超出明确拒绝，不返回部分清单冒全量。前后本地状态不同拒绝；这不是跨进程写锁、R2读取／缓存／备份一致性证明。未知envelope字段或损坏字节拒绝，不猜用途；要求与producer的JSON.stringify编码逐字节一致，重复键／额外空白等未知编码拒绝，防止JSON.parse静默丢弃藏在重复键里的历史内容，不重写原payload。`deleteAllowed`、`physicalCleanupProven`恒false，无SQL／R2写入、无删除、无历史payload改写。

验证：`node tools/verify_publication_producer.mjs` 首批20组通过（`.dragon-analysis/editor-completion/frozen-reference-inventory-r3.log`），真实临时SQLite及实际producer、两个游戏、六代：证明另一个游戏事件仍引用目标、当前删除标记不消灭前五代内容、只返回目标runtime、观察前后SQL不变、预算拒绝、损坏字节拒绝、未知字段／重复键／额外空白拒绝及对应有效对照。runtime和用户为显式夹具，无R2、HTTP或生产证明。schema两项复验仍23声明／50表／49索引／343列／4FK，未改变表结构。完整历史payload保留／回收协议、R2资源递归闭包和物理删除仍待闭合。

## 后继全目录历史运行索引入口（仍不授删除）

`inspectFrozenGameReferences` 新增 `catalogRuntimeReferences`，在每代完整catalog验证后、目标游戏筛选前收集**所有游戏**的current runtime描述，按key去重并保留gameId／SHA／长度。同key跨代描述不一致拒绝，即使冲突属于其它游戏；目标未出现也仍收集其它游戏入口。原 `runtimeReferences` 保持仅目标游戏，历史索引不因后续deleted标记消失；不返回名称或正文。

新增去重索引预算 `maxRuntimeReferences` 默认1000、可明确设1..100000，超出报 `DELETE_FROZEN_RUNTIME_BUDGET`，无部分成功清单；原代数预算、编码／链／头部稳定检查及两个禁止删除标志不变。当前只提供继续读取其它游戏索引的入口，**尚未跨游戏展开资源体、证明共享引用或独占、形成完整SQL／R2／在途／备份引用图**。没有新HTTP路由、provider访问、写入或删除许可。

实际内存SQLite／producer两游戏六代回归增至23组通过：`frozen-crossgame-after-r4.log`。新增两游戏去重、查询不存在目标仍有完整入口、预算拒绝、删除标记后历史保留、报告修改无持久副作用、其它游戏历史同key长度冲突拒绝；原损坏／未知编码负控全部保留。先行缺字段失败 `frozen-crossgame-before.log`；r1修后因测试UUID variant非法失败，r3因冲突夹具对同游戏重复pending publish被ledger正确拒绝，分别仅改测试为合法UUID、不同游戏publish／listing事件后通过，未放宽产品门。schema仍23源／50表／49索引／343列／4FK；语法／diff通过。本批没有重跑未改的资源体读取或20章编译长链，不以旧44组作为新字段端到端证明。

## 后继历史运行索引引用展开（仍不授删除）

`vps/deletion-runtime-refs.mjs#inspectRuntimeObjectReferences` 接收上段的目标gameId／runtime描述及可信只读对象端口，逐索引核长度、SHA、唯一JSON MIME、实际编码和运行身份，再展开资源描述。所有取数地址先核游戏命名空间与摘要文件名；未知字段、重复JSON键、跨游戏路径、同对象key的冲突描述、缺失／损坏索引都拒绝。异步前捕获输入，迟到修改不能换取数目标。默认1000索引／50000条引用预算（后者最大100000），不足时失败，不返回部分成功。

报告保留每个对象的索引／角色引用边，合并同key相同描述，明确标识 `kao/` 共享画像。默认仅实际读取运行索引，**没有验证资源体存在或归属**，也未展开manifest内部静态程序资源、SQL／legacy／跨游戏／备份／缓存引用。即使是目标游戏命名空间也不据此判独占。默认 `resourceBodiesVerified` 为false；`exclusiveOwnershipProven`、`deleteAllowed`、`physicalCleanupProven`恒false；没有写入端口、清理调用、公开路由或改变既有删除门。

`node tools/verify_deletion_runtime_refs.mjs` 22项通过（`.dragon-analysis/editor-completion/deletion-runtime-refs.log`）：两版本共享画像合并、重复索引去重、限定取数、跨游戏／路径／预算拒绝、缺失／损坏／双MIME、未知字段／重复键／额外空白、共享对象摘要冲突及await期间输入改变。使用自有内存对象端口和明确的传输索引夹具，不冒实际游戏编译、云对象或完整引用闭包证据。

后续真实编译链：`verify_frozen_publication_root.mjs` 42组通过（`.dragon-analysis/editor-completion/full-frozen-runtime-refs-r1.log`）。实际共同应用／文件SQLite／FileBucket编译20章、两次发布、八代冻结事件、静止复制并恢复50表后，串联上段全局引用诊断与运行索引展开：删除栅栏最新代仅标记，但前七代仍含内容、两个历史索引仍被引用；逐项对比实际索引中的资源SHA／长度／MIME及引用边，共享画像跨两版本保留。新增诊断仅获得GET端口、恰好读取两个索引，SQL逐表不变，根CAS仍8次。原41组及恢复一致性一起重跑通过。R2仍是自有内存端口，不是云对象测试；没有验证资源体、全生命周期独占、备份清除或物理删除。

### 可选对象体完整性检查（仍不授删除）

显式 `verifyBodies: true` 才读取已收集对象体，复用索引的精确长度／SHA／唯一MIME检查。共享对象每次调用只读一次，不跨调用缓存；全部成功才返回 `resourceBodiesVerified: true` 与 `verifiedBodyBytes`（包括已读索引）。读取预算默认256MiB、硬上限1GiB：索引总量不足在任何GET前拒绝；展开后的完整对象总量超预算，在任何非索引GET前拒绝。失败无部分成功报告。默认只展开描述符的行为保留。

这里证明的是本次观察到的对象字节，不证明provider原子快照、隐藏引用、manifest内的程序依赖、跨游戏独占或删除许可；其它三项标志仍false。没有PUT／DELETE端口，也没有改现有维护门。

传输夹具检查扩为34项通过（`deletion-runtime-bodies-r2.log`），含精确预算、共享读取去重、缺体／同长错误SHA／长度／MIME／重复MIME及恢复后重验。首轮正控遗漏显式共享依赖对象，按预期被拒绝，补齐测试对象后通过，失败日志 `deletion-runtime-bodies.log` 保留。实际20章／两版本／八代／50表恢复链扩为44组通过（`full-frozen-runtime-bodies-r1.log`）：读取全部报告对象并核字节计数、SQL不变／根CAS仍8次，另翻转实际共享画像体确认拒绝并恢复测试对象。R2仍为自有条件内存端口，不宣称云端验收或物理删除完成。日志均在 `.dragon-analysis/editor-completion/`。

## 后继跨游戏资源引用展开（仍不授删除）

`vps/deletion-runtime-refs.mjs#inspectCatalogObjectReferences` 接收前述 `catalogRuntimeReferences` 形状的入口，先捕获并核验全部gameId／同游戏命名空间／索引SHA文件名／长度，再开始GET。复用单游戏索引校验与展开，不增加另一份资源解析规则；所有游戏共用总索引预算1000、引用边预算默认50000／最大100000，重复索引去重，超预算整体失败。该入口默认只读索引；后继显式资源体校验见下。

报告按对象key合并实际观察到的索引引用，保留每条边的gameId／indexKey／role；`gameIds` 与 `sharedAcrossGames` 只表达所提供索引中确实同时被哪些游戏引用。跨游戏同key的SHA／长度／MIME必须相同，否则拒绝。既有单游戏检查提取为共享描述符捕获函数，验证域不放宽。

**不将一个游戏引用冒称独占**：调用者可能少提供入口，冻结头也可能在异步期间变化，所以 `catalogCoverageProven` 恒false；`exclusiveOwnershipProven/deleteAllowed/physicalCleanupProven` 也恒false，即使输入为空；resourceBodiesVerified默认false，后继只在显式正文校验成功时改变。尚未将完整账本头稳定性、全部历史SQL／legacy／在途、manifest内部静态资源、provider快照及备份闭包串成可删除证明；无公开API、PUT、DELETE或生产访问。

`verify_deletion_runtime_refs.mjs` 共49项通过（`catalog-objects-after-r3.log`），保留旧34项，新增两游戏三版本的共享画像引用边、重复去重、输入不变、全量地址预检零GET、索引冲突、总预算、await期间后续入口被改不能换取数地址、跨游戏共享对象描述冲突（改变后的索引单独可通过、合并才拒绝）、另一游戏缺失索引整体拒绝及恢复、稀疏输入与空输入不授删除。来源是自有内存端口及明确传输索引夹具，不是实际发布／云桶／全账本端到端证明。缺少新导出端口的先行失败 `catalog-objects-before.log` 保留；producer既有23组同时通过 `catalog-objects-producer.log`，语法／diff通过。未改schema／UI／运行束，没有重跑未受影响的20章编译长链。

## 后继冻结账本与跨游戏索引联合扫描（仍不授删除）

内部 `vps/deletion-catalog-scan.mjs#inspectFrozenCatalogObjects` 先捕获完整本地ledger.status，再调用既有全历史账本扫描，将其全部 `catalogRuntimeReferences` 交给既有跨游戏索引展开；不按目标gameId筛掉其它游戏。预算在任何账本／provider读取前校验，沿用最多1000代／1000索引和默认50000、最大100000引用边。每次provider GET之前、await返回之后及最终返回前均比较完整头部（authority、tail及digest、confirmed进度、blockedReason）；变化报 `DELETE_CATALOG_HEAD_CHANGED`，不返回旧报告、不回滚真实账本，发现变化后不继续GET。

返回捕获头、账本引用及资源引用报告，仅为有边界的只读诊断。相同头部观测不构成外部writer lease或provider原子快照；`writerLeaseHeld/providerSnapshotProven/catalogCoverageProven/exclusiveOwnershipProven/deleteAllowed/physicalCleanupProven` 全为false，包括空账本和已有恢复阻塞的稳定账本；resourceBodiesVerified默认false，后继显式校验只转发其真实结果。未增加HTTP入口、写入、DELETE或生产调用。

`verify_deletion_catalog_scan.mjs` 8组通过（`.dragon-analysis/editor-completion/frozen-catalog-joint-r2.log`）：实际内存SQLite／FrozenDistributionLedger保存两游戏三版本的合法冻结目录，接自有内存provider的传输索引；核全历史共享画像边、目标不存在仍扫其它游戏、预算／另一游戏索引缺失整体拒绝、报告无别名及扫描不改三张账本表。第一和最后GET期间实际追加账本均拒绝，第一GET变化仅读一次；同代数但 `block('REMOTE_AHEAD')` 改变也拒绝；随后稳定阻塞报告保留阻塞且不授删除，空账本不冒完整引用证明。冻结payload与运行资源是明确构造的传输夹具，未经过正式发布producer／编译器／R2／认证，不冒真实内容发布联合链。既有资源检查49项、producer23组分别通过 `frozen-catalog-runtime-regression.log`、`frozen-catalog-producer-regression.log`；语法与diff通过。不改schema、UI或程序束，不重跑未受影响的20章编译长链。

## 后继跨游戏正文校验与全局预算（仍不授删除）

跨游戏展开和联合扫描现支持显式 `verifyBodies: true`／`maxBodyBytes`，默认不读正文，预算默认256MiB／最大1GiB。先按去重索引大小核预算，再展开全部游戏并核去重对象总大小，均在相应GET之前拒绝超限；不为每个游戏分别放宽一份预算。共享对象每次调用全局只GET一次，索引不重读，不跨调用缓存。正文复用单游戏的同一长度／SHA／唯一MIME校验函数，不复制另一套校验规则；默认旧路径保持。全部成功才返回resourceBodiesVerified=true及verifiedBodyBytes（含索引），对象内容仍不返给调用者。空入口的显式成功只代表零字节，不代表无其它引用。

联合扫描把每次正文GET也置于相同头部前后重核之下；正文await期间恢复阻塞变化立即拒绝，并停止后续读取。有效正文不证明manifest内部静态资源、全部SQL／legacy／在途／备份闭包、provider原子快照或独占，删除标志不改变。

隔离检查：`catalog-bodies-before.log` 保留旧实现未提供正文证明的先行失败；`catalog-bodies-after-r1.log` 61项通过（保留49项），新增两游戏三版本／共享对象一次读取、总预算两阶段拒绝、缺失／坏长度／坏SHA／坏MIME／重复MIME拒绝及恢复、空输入不授删除。`catalog-bodies-joint-r1.log` 实际内存SQLite冻结账本11组通过，增加正文报告／零读取预算拒绝、正文await期间真实block变更拒绝；`catalog-bodies-producer.log` 23组回归通过。正文是自有传输夹具，不是原版资源、编译产品或云桶，不冒正式发布／恢复／物理清理验收。无DDL、UI、原生束或生产变化；四JS语法检查通过。

## 后继实际编译／隔离恢复联合扫描验证

`verify_frozen_publication_root.mjs` 已把新联合扫描器接入既有完整应用回归，不只使用前节的构造目录。`catalog-bodies-compiled-root-r1.log` 共46组通过：实际common Request、文件SQLite／FileBucket、20章编译与两次发布、8代冻结producer账本、关闭后复制／重新打开50表及私有对象。恢复后的联合扫描获取完整8代头和两个历史索引，结果与既有单游戏展开逐对象／引用边相符；显式正文检查的总字节、唯一GET数和对象报告相符，损坏共享画像正文时两入口均拒绝。

扫描前后三张账本之外的**全部SQL表行**也保持一致，内存provider全部对象的key／正文SHA不变，发布root写数仍8；已有恢复检查继续覆盖私有文件桶。该真实编译夹具只含一个游戏的两个版本，不冒跨游戏实际编译共享证明（跨游戏由前述独立夹具覆盖）。日志起首500是既有受控提交失败／原键重试测试，随后200及预期409均通过断言。R2仍为自有内存端口、会话为种子夹具，静态资源仍沿用既有stager缝隙；不冒云桶、真实登录、外机恢复或物理删除。无产品代码、DDL、界面、程序束或生产配置变更。

## 后继manifest与索引声明对应核验

显式正文校验现在同时复用发布流程既有 `distribution-resources.mjs#manifestRoles`，核manifest的gameId／修订／源摘要／章序与已核索引一致，以及资产、画像角色集合／摘要／长度／类型／URL对应。该函数只新增导出，原发布算法未改；删除诊断不另造一套角色规则。跨游戏收集器通过内部私有调用保留已核索引，不接受外部index缓存，也不重读索引或共享正文。默认仅索引路径不读manifest；显式成功在资源报告返回 `manifestBindingsVerified: true`，否则false。

这不是完整manifest语义或静态资源闭包认证：visualAssets、程序归档、规则准入、其它SQL／legacy／备份仍不由此证明，删除／独占标志不变。测试对错配manifest及其索引重新计算全部SHA／长度：仅索引扫描可以完成，但所属gameId、修订、源摘要、章表、缺资产、错画像SHA／URL或错资产URL，在单游戏及跨游戏正文校验均拒绝；恢复正常对象后通过。这排除仅因传输SHA坏而“假测到”绑定门。

`manifest-bindings-after-r1.log` 70项资源检查、`manifest-bindings-joint-r1.log` 11组账本联合检查、`manifest-bindings-distribution.log` 45组原发布资源回归均通过；`manifest-bindings-compiled-root-r1.log` 重跑实际20章／两发布／8代／50表恢复共46组通过。后者起首500及409为既有受控负控；R2仍是内存端口，不冒云桶或真实删除。三JS语法检查通过，无schema、界面、原生束或生产变更。

## 后继季节静态引用登记（不解析为物理对象）

显式正文扫描在manifest绑定校验时，复用 `static-resources.mjs` 的既有visualAssets严格捕获规则，经新增 `captureStaticVisualReferences` 导出八个季节角色的path／SHA／长度。单游戏及跨游戏报告增加 `staticVisualReferences`：默认未读manifest时为null，显式检查后为数组（无该声明则为空），每项保留gameId／indexKey／role引用边。这些边与运行索引边共用maxReferences预算，超限整次失败。

静态路径**不是R2或程序归档对象key**。相同path、SHA、长度的声明合并引用边；同path但摘要／长度不同的历史声明分别保留，不在缺少程序绑定时捏造全局冲突或独占。扫描器不访问这些路径、不读取静态正文、不将其大小计入已验证运行正文总字节。`staticProgramBindingProven/staticResourceBodiesVerified` 恒false；删除、独占及完整覆盖标志不变。后续仍须把这些声明接到可信历史程序身份及实际对象库存，且不能只凭八张季节图声称全部静态依赖闭合。

`static-refs-after-r1.log` 80项通过，新增两游戏共用八声明／引用边、同路径不同摘要分开、返回无别名、null与空列表区分、统一引用预算、坏季节／URL／摘要／长度／额外字段拒绝，确认没有静态路径GET。`static-refs-joint-r1.log` 11组、`static-refs-verifier.log` 原静态校验35项、`static-refs-distribution.log` 发布资源45组通过。实际20章编译与恢复回归 `static-refs-compiled-root-r1.log` 46组通过，两个历史版本登记八项各两条引用；正文GET数／已验证字节／全部SQL及provider正文不变。仍是单游戏真实编译＋内存R2，不冒云与跨游戏真实编译。首次新增导出编辑遗漏闭合括号，被即时语法诊断捕获并在运行前修正；最终四JS语法检查通过。未改DDL／UI／原生束／生产配置。

## 后继本地冻结头与仅历史索引分区

全历史扫描新增 `headRuntimeReferences` 与 `historicalOnlyRuntimeReferences`，把已核全部catalog运行索引按最后一代**本地冻结目录**是否仍引用分区。原 `catalogRuntimeReferences`／目标runtimeReferences保持完整，联合扫描仍读取所有历史索引，不因分区跳过任何对象。每个返回分区独立复制描述符，无跨数组可变别名；空账本两分区均空。局部目标不存在时，全目录分区仍完整。

本地tail可以pending且confirmedGeneration为0，因此head不等于远端当前，historicalOnly也**不等于已退休、无引用或可删除**。此结果只供后续完整引用分析，不改变不可变历史payload、SQL、provider、写入门或删除标志；SQL／在途／legacy／备份及全局账本退休方案仍未闭合。

`frozen-frontier-producer.log` 实际producer／内存SQLite两游戏24组通过：删除栅栏后本地头只引用另一游戏，而目标旧索引全部留在历史分区；改变返回head描述不影响全历史数组或重读结果，三表不变。`frozen-frontier-joint.log` 11组覆盖两游戏三版本的当前／旧版分区、无目标及空账本，provider仍读取全部三索引；`frozen-frontier-resources.log` 80项回归通过。三JS语法检查通过。本批未重复不受读取分区影响的20章编译长链，不引用上一轮46组作为新代码成绩；无DDL／UI／原生束或生产操作。

## 后继对象引用边的本地末代分区

联合扫描新增 `objectFrontier`，明确basis为 `local-frozen-tail` 并记录tailGeneration；逐物理对象key将已观察到的gameId／indexKey／role边分为headReferences与historicalReferences。分区使用上述已核索引的gameId与key对应，无法归属的边整次拒绝；不按某一个旧索引的年龄推断整个共享对象已经不用。原资源报告、全历史读取、预算、头漂移守卫均不减少，分区边独立复制，不与资源报告共享可变对象。

`object-frontier-after.log` 实际内存SQLite账本＋两游戏三版本传输索引13组通过：旧运行索引只有历史边，但两张共享画像同时保留两游戏的末代边和旧版本历史边；目标缺席仍给完整分区，正文检查与仅索引模式分区相同，返回改写不污染资源报告／重读，空账本明确空分区。provider索引读取仍3次，SQL行不变；既有首末await／正文await／同代block漂移拒绝继续通过。先行 `object-frontier-before.log` 因新报告字段未实现而失败，保留原件。资源80项及producer24组回归通过（`object-frontier-resources.log`／`object-frontier-producer.log`），两JS语法和diff检查通过。

本地末代尚未确认时也可生成此分区，所以它不代表远端当前、对象独占、旧版退休或删除资格；所有相关准入仍false。静态path声明不在物理对象分区内，不猜程序归档key。未重跑不受报告派生影响的20章编译长链，旧46组不作为本次源码证明；无DDL／HTTP／UI／程序束或生产改动。

## 后继本地已确认代引用视图

全历史扫描新增 `confirmedGeneration`／`confirmedRuntimeReferences`，只从已完整校验的本地已确认代catalog捕获所有游戏运行索引，早于目标游戏筛选。保留原末代与全历史分区；确认进度0时数组为空，仅表示本地无已确认代，不代表远端无内容或无引用。

联合扫描新增独立 `confirmedObjectFrontier`（basis=`local-confirmed-generation`），在原全历史对象上给出 `confirmedReferences`。它不是与末代／历史边互斥的第三分区：一个旧运行索引可以同时属于本地历史边和上一次已确认目录，待确认删除不能擦去后者；共享画像也保留各索引／游戏对应的确认边。返回值各自复制，不与原报告共享可变边。没有增加GET或跳过历史，仍使用原总预算和所有await前后完整头部重核；确认进度改变即使tail不变也拒旧报告。

验证日志 `.dragon-analysis/editor-completion/confirmed-frontier-*`：`before.log` 保留字段未实现的先行失败；`after-r2.log` 19组通过，实际内存SQLite／FrozenDistributionLedger、两游戏三版本传输夹具。新增0确认、末代2但确认1、共享对象边、目标缺席／正文模式／返回无别名、真实confirmInTxn在GET await期间推进而拒绝晚回、追平2、待确认delete-fence3保留确认2的引用、确认删除后全部历史仍读取且不授清理。确认通过显式测试收据capability和真实SQL状态转移，不冒远端readback。既有producer24组与资源80项分别通过 `producer.log`／`resources.log`；不是20章实际编译或云端联合证书。

主动LSP三代码push-only未确认，两文档warning视图clean；mode=all缓存47文件仍3项既有warning（drafts布尔参数、能力测试字符串建议、原证数值解析），未屏蔽、不称全仓clean。

本视图是本地账本进度诊断，不是远端当前根、外部writer lease、provider快照、缓存／备份闭包或删除资格。所有禁止删除／独占／完整覆盖标志保持false。无新API、SQL结构、PUT／DELETE、Vue或原生束变化；未重跑未受报告派生影响的20章编译、浏览器或生产长链。

## 后继目标游戏拓扑意向记录观察

审计发现 `draft_topology_moves`／`draft_topology_rebuilds` 已在已知表和固定列布局内，却未进入目标游戏的scoped捕获。即使目标已有两条意向，原 `associatedRows` 仍可为0，SQL摘要也未覆盖这些记录。现仅将这两张表加入原按 `game_id` 捕获列表，沿既有排序、4MiB预算、关联行计数及每次list await后的完整摘要复核；不是新增表、对象引用或删除计划。

意向记录不含资源对象地址，因而不伪造私有字节引用边；其它游戏的意向仍不计入本游戏观察。现有返回字段、移动意向保存／发布门、原 `hasPendingMoves` 语义及禁止删除标志不变。空表也显式进入当前SQL摘要，旧摘要不是跨版本可恢复的删除凭证。非空全局冻结账本仍按原门拒绝，不能借此绕过历史内容、共享引用或备份障碍。

复用 `tools/fixtures/distribution-schema.mjs` 及原Node／workerd两个入口，增加两组：本游戏各一条移动和重建计入2行且摘要改变，另一游戏各一条不混入、改动它们不改变本游戏观察；正常观察前后两张意向表保持，私有对象／引用数不增加。分别在list返回时改动本游戏移动或重建记录，均在第一次await后拒409 `DELETE_INVENTORY_CHANGED`、不继续第二次列表；只有测试显式恢复原行后才能重新观察，服务不修复或删除记录。

`.dragon-analysis/editor-completion/deletion-topology-inventory-before.log` 保留旧实现0行不等于期望2行的负控。修后 `-node.log`／`-workerd.log` 和固定10个输入SHA后的最终 `-node-r2.log`／`-workerd-r2.log` 各 **18组通过**（原16＋2），现行50表／49索引／343列／4FK及原未知结构、全局账本拒收保持。Node使用隔离SQLite内存库，workerd使用自有DO SQLite；两者list结果、principal、意向行及变更时机为明确夹具，不冒真实对象桶并发、删除事务、完整引用图或物理清理。

语法、diff、链接和测试输入前后摘要核对通过；源码、日志和主动诊断见 `deletion-topology-inventory-final-hashes.json`。没有Vue、web/src、DDL或资源改动，不重建两束，不重复无影响浏览器／编译／Trial／发布／规则长链。`deleteAllowed:false` 及完整A30未完成状态保持。

## 后继已确认删除与历史保留的协议障碍

本批核读 `distributionledger.js`、`deletionfrozenrefs.js` 与 `vps/deletion-catalog-scan.mjs`，确认物理清理不能只追加删除事件后直接裁剪旧字节。以下是现行工程实现事实，不是原版机制，也不是新退休协议的实施批准：

| 边界 | 当前依赖 | 删除前尚缺的出口 |
| --- | --- | --- |
| SQL事件／chunks | ledger `#state`要求1..tail连续事件；`#metadata`绑定payload摘要、previousDigest和永久operationDigest；`entry/#payload`要求原分块字节仍完整 | 新的历史退休／最小收据协议必须同时保持其它游戏的操作查询、幂等及恢复可验证性；不能原地过滤payload或按事件game_id删行 |
| 全局目录 | 全历史扫描遍历每代完整catalog，另一游戏事件也保留目标游戏内容；已确认代与本地末代可不同 | 从最新目录移除不消灭旧目录字节；待确认与已确认分区均不是清理许可 |
| provider运行索引 | 联合扫描仍读取全历史catalog的全部索引，含historicalOnly；正文校验还依赖全部对象 | 不能先删历史索引再声称引用闭包已验证；共享对象仍需跨游戏保护，未知／legacy引用不可按空处理 |
| 完成声明 | 所有现有扫描仍返回deleteAllowed／physicalCleanupProven=false | 历史退休只是前置项，还须writer排空、SQL／私有内容收据清理、缓存／备份及隔离恢复出口；不开放410完成或名称释放 |

复用 `tools/verify_deletion_catalog_scan.mjs` 增加三组负控，当前 **22组通过**：实际内存SQLite完成三代并以显式测试收据确认delete-fence后，临时移除第一代chunks。该代事件归另一游戏、payload仍含目标内容；`ledger.status()`头部保持相同，但完整扫描报 `DISTRIBUTION_LEDGER_CORRUPT`，provider GET为0。说明元数据头稳定不能替代历史正文完整性。仅测试恢复原chunks及rowid后，三表和原报告恢复一致；不是服务自动修复或生产回收。

另一负控临时移除目标的historicalOnly运行索引，尽管确认进度已追平删除代，扫描仍拒 `DELETE_RUNTIME_REFERENCE_INVALID`，SQL及头部不变。测试恢复对象后完整正文校验通过，仍不授删除。夹具为两游戏三版本传输数据、自有内存provider及真实SQLite状态转移；不是实际编译、云端根readback或生产删除。

第三组负控用独立待发单代账本证明发行方存活消费者同样依赖原正文：移除该代chunks后头部不变，但空闲 `checkHead` 的 `entry(1)`、待发 `drainOne` 的 `next()`、旧键 `enqueueInTxn` 幂等重放三者均报 `DISTRIBUTION_LEDGER_CORRUPT`，而不是返回旧记录或去重成功。退休方案必须连同这三条读取路径一起迁移，不能只让只读扫描忽略缺正文。

证据位于 `.dragon-analysis/editor-completion/deletion-retained-history-20261029/`：`tests-r2.log`、`before-r2.json`／`after-r2.json`；141项选定server／vps／reader及测试输入SHA前后核同，不冒完整传递依赖清单。首轮`tests-r1.log`因测试恢复行未恢复rowid，导致按rowid排序的比较失败；已只修夹具恢复顺序，未改变产品。语法与diff检查通过；主动LSP为push-only未确认，mode=all限定三文件缓存无发现，不称已确认clean。未引入新协议、DDL、HTTP、PUT／DELETE能力或运行束变更；未跑无影响浏览器／编译／原规则长链。

## 后继历史正文退休的候选实施顺序（待批准，不是删除许可）

本轮重新核读 `server/distributionledger.js` 与 `vps/distribution-publisher.mjs`：除全历史扫描外，publisher在**无待发任务**时仍执行checkHead，读取远端代对应的`ledger.entry`，由原payload重建expectedObjects；发送下一代还要恢复前代收据。故“已确认即可删chunks”不仅破坏审计，也会破坏正常空闲检查和下一次发布。`enqueueInTxn`的旧operation重放同样调用`#payload`。必须连同这些消费者迁移，不能仅让inventory忽略缺失正文。

以下是解决这一实际阻碍的**候选工程方案**，不是已批准协议、DDL或恢复命令。本轮不实施，也不改变永久幂等／物理删除合同。为避免把逐项扫描无限当作删除进度，后续实现按下列依赖推进；短暂全局发布屏障及收据退休接口的代价必须先审阅确认，不静默增加产品行为。

```text
权限／下架核验 → 目标持久栅栏 → 排空与封存引用计划
  → 建立不含目标内容的新检查点并验证远端读回
  → 切换历史读取／幂等／恢复消费者
  → 清理退休正文及目标独占对象／SQL／缓存／备份
  → 隔离恢复复核 → 最小完成凭证／名称释放／410
```

### 需要一起设计的四个合同

1. **稳定边界与检查点。** 候选先采用短暂全局分发屏障：在同一已验证authority下排空pending至已确认H，持久固定H、摘要与远端根ETag；不重置authority、代号或自动解除REMOTE_AHEAD／REMOTE_GAP。跨进程旧writer及在途provider写入必须另有可验证排空条件，暂停一个Node进程不够。新检查点是新对象，不能原地过滤旧payload再沿用原摘要。检查点要完整承接其它游戏的现有目录、公告快照、收据查询所需事实与资源引用；目标只保合同允许的最小删除身份，不含名称、简介、草稿或历史内容。
2. **不可变操作身份与可退休正文分离。** 候选保留连续代号及原operationDigest／previousDigest链的最小身份凭证，另用受验证检查点描述哪些正文已退休；绝不把缺chunks自动解释为已退休。当前`entry()`、旧键重放、checkHead／predecessor及只读全历史扫描均须改用明确的保留／退休分支。已删游戏旧操作只返回最小终态、不重新创建内容；其它游戏重放与查询仍满足其原合同，不能因同一旧信封包含目标就一并失效。具体最小字段、认证方式和兼容版本尚未确定，不能先删再补。
3. **保护集合与删除集合。** 保护集合须包含所有非目标游戏仍有合同义务的引用（包括同版本下架续局、迟到资源、共享模板与程序资源），不能只看当前上架目录，也不能把其它游戏historicalOnly直接视为可删。历史信封里的非目标事实迁入新检查点后，才有条件退休含目标内容的旧信封。对象按物理命名空间＋key判定，摘要相同不代表同一物理对象；只有完整闭包、writer排空和复核计划均成立时，才能执行目标独占删除。未知legacy引用仍阻断相关清理。
4. **删除完成与备份恢复。** SQL与对象存储没有共同事务，清理必须有持久进度、幂等删除与实际缺失读回；中途失败保持“删除中”，不能回滚栅栏复活内容。最小完成凭证在最终核清事务中落地；名称释放及completed410不能提前。备份必须在已确认存储能力下清除目标内容或销毁其解密能力，恢复时验证检查点与删除凭证，拒绝复活已删内容。尚无目标／保留清除政策的异地备份不能凭本地测试被算作完成。

### 实施前与交付时的最小证据矩阵

| 场景 | 必须得到的证据；当前未执行 |
| --- | --- |
| A、B交错发布，共享对象，B事件正文也含A；删除A | A名称／内容不再存在于退休正文及检查点；B目录、公告、旧键重放及受保护资源逐值保持，共享对象仍可读 |
| H已确认、H+1待发，或远端领先／缺失／外authority | 不退休、不删除；保既有恢复锁，不通过重置代号绕过 |
| 检查点上传／CAS／读回丢回应；每个持久阶段重启 | 不重复变更操作身份；只按实际读回推进，旧消费者不得继续写已退休格式 |
| 清理中其它游戏写入、目标旧writer晚返回 | 前者按批准的屏障策略恢复且不丢操作；后者不补回已清对象，无法证明则保持删除中 |
| 部分对象已删、SQL尚未清；任务重试与并发重试 | 进度收敛、其它游戏不变、只保最小收据，不伪报完成 |
| 从退休前／后备份恢复，再运行publisher与公开reader | 已删目标不复活；其它游戏恢复完整，空闲checkHead及下一代发布可继续；损坏／缺检查点明确拒绝 |

本批只有当前代码依赖核对与方案文档，没有新增检查点、收据格式、全局锁或DELETE能力。既有22组扫描负控仍只是历史限定证据，不能证明上述新协议。A30保持未完成；审批只涉及该协议变更，不阻塞其它已授权本地任务。

## 后继退休实施送审包（待用户审阅，不实施）

按候选顺序推进到“建立检查点”之前，短暂全局发布屏障与收据退休接口的代价必须先审阅确认。本节是送审清单，不是实施：所列函数与行为均为现状核对，不新增kind、DDL、锁或DELETE能力；用户逐项批复前不写产品代码。

### 触及清单（现状，只读核对）

| 位置 | 现状行为 | 退休后须改成的分支 |
| --- | --- | --- |
| `server/distributionledger.js` `#payload`／`entry`／`next`／`enqueueInTxn`重放／`confirmInTxn` | 任何缺chunks即 `DISTRIBUTION_LEDGER_CORRUPT`（22组负控已证含三条存活路径） | 保留／退休显式分支：保留代沿原路径；退休代只返回最小身份凭证，不读正文、不自动视为已退休 |
| `vps/distribution-publisher.mjs` `checkHead` | 空闲仍读远端代 `ledger.entry` 并由原payload重建 `expectedObjects` | 退休代跳过正文重建，改由检查点描述比对；远端根缺失语义不变 |
| 同上 `predecessor`／`drainOne` | 前代收据恢复＋下一代发布，旧键重放读原payload | 检查点承接后前代引用改指检查点；屏障期间 `drainOne` 暂停新发布，已确认H保持 |
| `vps/distribution-receipts.mjs` `verifyReceipt`／`observe`／`recover`／`expectedObjects` | 收据绑定原根字节与ETag | 检查点收据格式另行定义，旧收据验证路径保留不兼容改写 |
| `vps/deletion-catalog-scan.mjs` `inspectFrozenCatalogObjects` | 全历史扫描，缺正文即拒 | 同上保留／退休分支；扫描本身不授删除 |

### 屏障代价（须审阅）

- 范围：同一已验证authority下排空pending至已确认H后暂停新 `enqueue`，不是暂停读取；`checkHead` 只读行为不变。
- 失败语义：排空中任何异常沿用现有恢复锁（`REMOTE_AHEAD`／`REMOTE_GAP` 等），不新增自动解锁、不重置authority与代号。
- 跨进程旧writer与在途provider写入须有可验证排空条件，暂停单个Node进程不够——该条件是实施前置项，尚未设计。
- 回滚：屏障解除即恢复原发布路径；检查点对象一旦写入不可变，不存在“撤回检查点”，只能废弃并重建。

### 分阶段与权限边界

- 阶段0（不需本次审阅）：自有夹具内的保留／退休分支原型与负控，不碰产品代码。
- 阶段1（需本次审阅批准）：上述产品分支＋检查点kind（新对象、新摘要，不沿用原摘要）＋消费者迁移。
- 阶段2（独立外部依赖，不在本环境完成）：异地备份清除／解密能力销毁、生产410与名称释放——生产来源登记未授权，备份目标／保留政策／告警接收端需用户指定（沿用A31外部依赖口径）。

### 送审问题

1. 是否接受阶段1的屏障语义与失败锁沿用（不新增解锁）？
2. 检查点kind命名与最小字段集是否现在定，还是先做阶段0原型再定？
3. 阶段2是否维持外部依赖口径（本地不宣称完成），A30完成出口是否必须等备份实证？

## 真正下一缺口

持久完整引用图及共享refcounts、未索引命令/历史内容关联、所有writer冻结与native I/O drain、当前引用计划的重验/提交、专属R2幂等delete/readback、全SQL与收据scrub、最小completed凭证/玩家410、cache及实际backup清理和隔离恢复排除删除。只有这些得到实证才能开放删除完成出口；本轮不关闭工程§5.4、Q43/Q46或主目标。
