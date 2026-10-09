# Root读取调用退出等待（E-01-BACKEND-CURRENT-READ-WAIT-1，历史限定）

**当前后继[现有等待整合](editor-backend-validated-waits.md)**仅import/constructor接ValidatedFreeze，原read/wait核心/minimal7falsefacts保持；502输入109imports/fresh23检查353调用/16asynccases有证，controllednative前暂停非provider挂起/EOF。下文旧SQLfreeze、93/930/477为原1232ee历史，当前完整旧93全源suite未重跑，不冒当前业务全证。

接续[当前PUT等待](editor-backend-current-write-wait.md)。PUT返回不代表早先GET、reader.read或cancel调用已退出。本轮登记并主动等待**当前同一Root BlobStore的授权read调用**，不是新增成功字节／正文排空观察器，也不是物理删除许可。

## 原读取核心保持

475基线仅改`server/blobs.js`和`server/worker.js`，其余473含375玩家保持；新增内部`GameDeletionReadWait`及显式验证工具，477声明，表布局35／243不变。

- Root仅在原BlobStore constructor传actual `ctx.storage`。原五writer族仍共用该BlobStore／原PUT journal；独立installed catalog rawGET不因此成为私有读取登记。没有公开Root控制路由或UI改变。
- BlobStore在原scope／descriptor成功后、调用nativeGET及任何await前登记唯一live条目；gameId取已形成规范private key，不跟随随后context字段改变。`#performRead`是原read的完整nativeGET／每流段权限／长度-SHA／cancel／releaseLock／末次权限与bytes返回核心，逐byte逆差核验，无放宽错误或成功条件。
- 外层新增await返回后再查实际authority，不能信任inner core先前的actor DTO；finally在原整个调用返回／拒绝后移出条目并通知其所属订阅；读权限失败也要走原best-effort cancel后才返回。登记不授读取权、不改变原allocation／GameSource／字节／RNG。
- 正常返回、错误返回、cancel失败被原逻辑保留为次生错误，**均属于调用退出**。本轮不检查“原body确已消费/所有取消都成功”，也不推断SDK/provider工作已消失。不发正文排空证书，不新增历史read SQL表或自动修复。

## 同storage／有限等待

`GameDeletionReadWait`要求实际ImmutableBlobStore且用原prototype private-brand方法核storage对象同一性；sql字段相同的facade或假wait函数不行。constructor自己构造原SQLfreeze、捕获独立gameId／rowRevision原始tuple，不接受客户端超时、计划或品牌DTO。

原SQLfreeze在等待前／每await返回重核actualprincipal、mustChange、owner/admin、非builtin、usedID、未listed、准确fence-owner-row／CAS、固定schema和两原freeze seals。服务是管理事实端口，不授管理员他人私有byte权。可以完成合法SQL冻结，不能倒回以伪装跨服务事务。

等待器只捕获当前该game登记的read条目；最多10000条等待捕获、每条最多128订阅。默认5000ms，允许内部1..30000ms，fixture100ms负控；工程预算不是DOS机制／云SLA。通知或timeout后再次复查；结束时有新当前调用则503，不把旧快照当全部reader。finally只撤own subscription／timer；超时不取消原GET/reader/cancel、不重试，也不改原SQL/bytes。

exact7事实DTO：gameId、rowRevision、readsWaited、bodyDrainVerified=false、nativeDrainVerified=false、deleteAllowed=false、`CURRENT_INSTANCE_REGISTERED_READ_CALLS_RETURNED_BODY_DRAIN_UNKNOWN`。

readsWaited是本次捕获后已退出的调用数，**含失败**；repeat或重启后可以0，不是immutable receipt。进程Map不是持久元数据替代，也不认证历史／external／future／raw bucket／get-list-body／CPU／客户端已下载bytes。完整删除前置仍开放。

## 当前实际证据

owned`.dragon-analysis/editor-phase/backend-current-read-wait-session-r1`：random工程配置、owned OS tempSQLite/R2、loopbackHTTPS8787、白OS环境和既有MF/OpenSSL，源码/before/log/report wx，producer1800s／原83等待／240s通知均不延。

最终fresh `main-r2`93组930记录Node调用（实际有界poll，不是协议固定数），原83 check字符串及期待完整当前兼容：真实20章copy/saved2/data29-images7、私有长度-SHA／fence／namespace／原SQL freezes／PUT waits／ack两拒、restart／epoch；不冒全六用途／媒体／runtime／战役。36metadata／10byte／10command／10Jobfreeze／6reference／8Draftfreeze／8SQLfreeze／4namespace／12PUTwait保，新增15read facts。

新增十组（保原九组）：

1. 实际owner/admin零当前、same-storage/private-brand和fake拒、foreign/builtin/UUID/CAS/strictfield、cookie/Origin/CSRF；全部false。
2. 真实Root小opaque bytes先完整SHA读取成功，后在nativeGET前hold；实际fence／SQLfreeze／wait后release真正GET、原scope拒与实际bodycancel，Root409、wait捕获1。fixture结果不是GameSource或普通模板。
3. 两真实Root read，实际native reader.read返回的chunk交付被owned控制hold；两个并发wait四订阅，fence后原read拒／cancel，全部退出才各返2；repeat0。
4. 三次显式100ms timeout504，只撤ownslots／timer，原held调用、nativeGET／cancel计数精确同；释放原调用才退出，不abort或自动retry。
5. 原metadata长度错误进入cancel时hold，actualfence／wait等待完整原调用；release真正native cancel后only-fixture注入cancel拒，原BLOB_CORRUPT保，wait返1仍bodyDrainfalse，**不是取消成功或成功bytes**。
6. nativeGET前受控拒，Root原500，wait只报被捕获调用退出1；真正nativeGET次数不增，不把finally当成功读取。
7. 两独立真实bodyawait中实际第二seal MAC和ADDcolumn变更，退出后wait精确503，ownslots清；fixture精确restore不冒repair。
8. 实际改密发生在原bodyawait，原Root及旧wait回调401，ownslots全清；新epoch只0当前，不授字节或删除。
9. actual starter/workerd restart只重核current0与现有seals，fencedRoot读在nativeGET前拒且publicdelete404；不证明旧provider/cancel状态。

10. 独立内部authority边界控制在原inner read最后一次scope查验返回已捕获DTO后，用真实GameDeletionFence原事务提交fence；外层await返回须第六次查询实际authority，Root精确409、不发bytes，finally注销。此fixture控制不是公共DTO攻击证明或旧源实测通过；原读取核心仍完整不改。

r1 92/925只为此前源，五wx快照及源码/report保留。人工复核新增outer await后补其返回authority复查，再加上述独立控制，r2全93当前重验、前92check字符串精确同，无producer失败。初次producer-delta元数据包含多余边界换行、未用于执行；保原件，用实际applied文本核唯一替换生成r2元数据，forward/inverse证明，不改任何业务期待或预算。

owned facade只把实际nativeGET及原SDK reader/read/cancel结果的交付插入可控等待，不修改SDK，也不当作另一个产品stream实现。正常未选择game时完全返回原native对象；原83全链当前验证包含原body故障与权限门。小opaque工程对象与真实全源兼容验证分别说明；错误/取消退出均显式不授body/native drain。

SHA／当前17report源和五wx快照／原83派生逆差／原read核心精确逆差／Root单constructor参数／imports／语法／链接／73Q、适用主动LSP-session-all和人工最小Jev另签。无producer失败；原coupled observer502细因仍未知，本轮pass不修复旧观察器或证明SLA，LSP unconfirmed不称clean。

## 下一出口

完整writer／reader／body／CPU与legacy-external在途、未知结果保守闭合、全共享/历史引用归属、专属幂等physicaldelete/readback、SQL/receipt scrub、minimal completed410、cache与实际backup/隔离恢复；RuntimeManifest／255／Trial／发布存档／完整工作台及初始化原证仍开。无新表、公开readwait/delete、删除授权、nativeabort、TTLrepair、410；不关闭Q43/Q46／§5.4／主goal。无commit/push/deploy/cloud/install/trust、DOS SAVE、真实profile-IDB或共享清理。
