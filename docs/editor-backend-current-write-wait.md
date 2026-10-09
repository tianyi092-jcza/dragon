# 已登记PUT等待（E-01-BACKEND-CURRENT-WRITE-WAIT-1，历史限定）

**当前后继[现有等待整合](editor-backend-validated-waits.md)**仅import/constructor接ValidatedFreeze，原journal/wait/ACK+retainedtuple/minimal8falsefacts保；502输入109imports/fresh23检查353调用/16asynccases有证，controllednative前暂停非provider挂起。下文旧SQLfreeze、83/790/475为原4e9a6ff历史，当前完整旧83全源suite未重跑，不冒当前全排空。

接续[命名空间封闭](editor-backend-private-namespace.md)和[SQL冻结协调](editor-backend-deletion-sql-freeze.md)，本轮新增**主动等待原PUT返回的内部端口**，不是再把零计数包装成完整删除。475声明，473基线只改`server/privatewrites.js`，其余472含375玩家及原Root／各writer／UI／规则不变，35表243列不变。

## 登记和归还

`PrivateWriteJournal.put`仍原规范key→sameSQL fence/pending→native条件PUT→原返回检查／settled-uncertain／ack规则。新增privateMap在#begin完成后、调用bucket和任何await前同步登记真实operationId／捕获tuple、空subscriptionSet及acknowledged=false；只有原settled #finish真正返回才置true，finally才移出并通知其等待者。原native异常仍uncertain，ack失败仍pending，不添加abort、SQL取消、TTL清理、成功推断或新原生PUT入口；get/list透明、delete503和原授权全保。

内部`waitCurrentPuts`实际查fence和当前game journal，最多10000行、strict UUID/hash/state及实例／live tuple配对。uncertain→503 PRIVATE_WRITE_WAIT_UNKNOWN；pending无本实例handle或跨restart→503 PRIVATE_WRITE_WAIT_UNTRACKED；SQL/live不一致→503 JOURNAL_CHANGED。已经settled的历史行只参加结构检查，**不是新认证历史provider结果的证书**。当前handle必须与SQLpending一一匹配，不能拿一个任意promise或弱品牌代替。所有捕获条目完成后，还须逐一核实际ack标记以及同operation/game/hash/instance且settled的原记录仍存在；不能仅用Map消失、SQL settled位或0计数推出成功。不ack→503 UNKNOWN，缺列／tuple变化→503 JOURNAL_CHANGED；不修SQL或保留调用者subscription模拟原生在途。

每个真实live PUT最多128工程等待订阅。等待者只订阅所捕获的本game条目，每个PUT finally通知已完成id，所有原条目完成才唤醒；等待前后调用所属actual权限复查。timeoutMs必须1..30000ms，服务默认5000ms，fixture另用100ms负控；这些是内部工程等待预算，不是DOS机制／线上SLA或公开用户编辑域。每次finally只撤自己subscription与timer，超时504保持原nativepromise、registry条目和SQL，不中断／重试／修复原写入。

raw journal本身不是owner端口，也不要求Game先存在，以保合法allocation。当前计数／slots只反映该实例登记，不能用于推断worker重启取消provider、所有read/get/list/body/CPU/Job回调已完，或future/external/legacy操作不存在。

## 权限和同storage组合

新`server/deletionwritewait.js#GameDeletionWriteWait`自己构造原`GameDeletionSqlFreeze`，要求真实PrivateWriteJournal且用原prototype private-brand方法核**storage对象同一性**（不是sql字段相等、客户端DTO／伪造方法）。独立捕获gameId/expectedRowRevision primitive tuple；不接受client timeout、任意journal／seal／计划。

等待前和每个await返回，重核实际principal/mustChange、owner或admin、builtin、usedID、准确fence-owner-row／CAS、未listed、固定列布局和原两freeze HMAC。显式操作可先完成原SQL冻结，但不回滚已经合法建立的冻结以模拟native原子性。权限/布局/seal在await期间失效，不能返成功；所属subscription仍finally清理。owner/admin管理事实不授他人私有bytes。

exact8事实DTO：gameId、rowRevision、writesWaited、privateWritesPending=0、privateWritesUncertain=0、nativeDrainVerified=false、deleteAllowed=false、`CURRENT_INSTANCE_REGISTERED_PUTS_RETURNED_LEGACY_UNKNOWN`。writesWaited是本次捕获的本实例PUT数，重复或重启后可0；整个返回**不是immutable operation receipt、全writer/drain证书、删除计划或权限**。未来公开控制器还须按真正全部前置接线；本轮没有产品Root route／UI、physicaldelete或completed410。

## 当前实际验证

owned`.dragon-analysis/editor-phase/backend-current-write-wait-session-r1`：白OS子环境／已装MF-OpenSSL／random工程配置／owned tempSQL-R2／loopbackHTTPS8787，全部源码／before／日志／报告wx；producer1800s和原72等待／240s通知预算全保，无新producer失败。

最终fresh`main-r2`83组790记录Nodecalls（含有界poll，不是协议固定数），原72原期待当前完整兼容：原全20章copy/saved2/data29-images7、native字节和SQL/fence/journal/并发/HMAC/schema/多重边／namespace/outer原子回滚、restart/真实改密与原独立getter；不冒完整六用途／媒体／战役／RuntimeManifest。36metadata／10byte／10command／10Jobfreeze／6reference／8Draftfreeze／8SQLfreeze／4namespace及12当前wait事实。

当前新增十一组（原九组及两ack边界）：

1. owner/admin真实零当前事实；storage wrapper即使sql相同也拒；foreign/builtin/UUID/CAS/strictfields以及实际cookie-Origin-CSRF门。新控制route不是产品授权。
2. 生产Root小opaque工程写，登记后停在原生调用**前**，actualfence/SQLfreeze后wait注册；release实际调用native/ack，outerRoot晚到409、wait捕获1，slots/liveWaits全0。
3. 两同hash生产Root条件PUT，停在实际native结果**后**（含真实onlyIf conflict-null）；两个并发wait四slots，release后原两记录settled、outerRoots409、两wait各2；repeat0。这些仅工程opaque refs，非GameSource／普通模板。
4. 三次显式100ms timeout504，ownslots／timer清理，原held PUT／pendingSQL／native调用计数精确同；释放原promise后settled再wait0，不是自动retry／abort。
5. 真nativecommit后only-fixture模拟unknown返回，原uncertain保；wait503 UNKNOWN，不拿finally当成功。显式repeat不修SQL、不进native。
6. 实际SQLack UPDATE trigger500，native返回但pending保；Map finally已移出，wait503 UNTRACKED，零slots不授清理；撤owned trigger后仍不能盲ack／修复pending。
7. 真实starter/workerd restart保pending/uncertain并继续拒；旧settled行只可报告0本实例handles，计数reset不证明provider退出。
8. 两独立真实nativeawait期间，actual第二seal MAC坏值和SQL ADDcolumn，返回前重验精确503，ownslots清理；fixture精确restore非产品repair。
9. 实际密码替换发生在nativewait中；原Root及wait回调均旧epoch401，虽原PUT真实settled也不赋旧token成功；newepoch仅0当前事实，公开delete404。

10. only-fixture在实际native被hold期间先把SQL行假置settled，原Root实际ack503。旧源独立focused probe曾wait200；当前捕获条目必须actual ack=true，精确503 UNKNOWN，slots清空，不改SQL或掩Root错误。
11. 实际SQL AFTER UPDATE trigger在正常ack返回同时移除对应行，原Root后续fence409。旧源focused probe曾wait200；当前wait还须原tuple记录仍在，精确503 JOURNAL_CHANGED，不假历史ref完整或repair。

## 旧源实证与更正

`main-r1`及原static-r1 81组765只为旧源／九组验证，原件不覆盖，不作为上述两边界证明。复核后先保存旧privatewriter／fixture／producer；独立owned tempSQLite/R2小opaque focused probe两条真实故障分别记录Root503/wait200、Root409/wait200，输出是`CHARACTERIZED_PREVIOUS_ACK_BOUNDARY_GAP`，不是business pass或delete批准。无完整源／媒体重算，120s独立探针预算不延。

仅为current captured entry补actual ack bit及同原tuple retained-row核验；原native PUT/onlyIf-null/uncertain/ack异常语义和全部其它产品源不改。fixture新增两SQL故障、producer新增两负控；顺便删除未使用preComplete绑定但保waitFact调用及原期待，旧source81原件保。最终main-r2全部83当前重验，前81check字符串不变；无producer失败、不拼旧pass。新的counter-/historical-0仍不是全历史native认证。

owned nativegate包在原namespace/native端口以下，前／后边界、同game两PUT和unknown返回均只控owned对象，不修改SDK／原writer／生产权限。旧coupled observer502细因仍未知；本轮成功不修复旧观察器或认证云SLA。语法／SHA／旧源和原72派生逆差／imports／链接／73Q／适用主动LSP-session-all及人工最小Jev另外签；inconclusive/unavailable/空缓存不称clean。

## 真正剩余出口

全部writer与legacy/external在途和未知结果的保守闭合、全引用／shared归属、专属幂等physicaldelete/readback、SQL/内容receipt scrub、minimal completed410、cache和实际backup／隔离恢复排除。完整资源／255／认证Trial／发布存档／全工作台与初始化原证未解；不关§5.4、Q43/Q46或主goal。无commit/push/deploy/cloud/install/trust、DOS SAVE、用户profile-IDB或共享清理。
