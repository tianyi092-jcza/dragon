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

## 真正下一缺口

持久完整引用图及共享refcounts、未索引命令/历史内容关联、所有writer冻结与native I/O drain、当前引用计划的重验/提交、专属R2幂等delete/readback、全SQL与收据scrub、最小completed凭证/玩家410、cache及实际backup清理和隔离恢复排除删除。只有这些得到实证才能开放删除完成出口；本轮不关闭工程§5.4、Q43/Q46或主目标。
