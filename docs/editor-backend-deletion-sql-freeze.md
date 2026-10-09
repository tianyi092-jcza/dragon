# 当前SQL冻结的原子协调（E-01-BACKEND-DELETION-SQL-FREEZE-1，限定）

新增`server/deletionsqlfreeze.js#GameDeletionSqlFreeze`及显式验证入口。全部470旧输入（含375玩家）与91旧imports不变；472声明。接续[Job冻结](editor-backend-deletion-job-freeze.md)和[草稿冻结](editor-backend-deletion-draft-freeze.md)，不是重写两套规则、native取消／排空或物理删除。

## 同一事务域

- constructor自己以同一storage／principal／服务key构造原两服务，不接受客户端或跨库的freeze端口。只复用原两冻结表，无新批准表、迁移、公开Root路由或delete能力。
- 严格输入后独立捕获gameId／expectedRowRevision两原始值，给两服务传自己的冻结tuple，避免可变内部输入被再次读取换目标。实际owner/admin、mustChange／builtin／UUID、usedID、未listed、准确Game-fence-owner-row及CAS均在外层sync事务核验。外作者先404，不泄露fence或列布局。
- 复用当前35表固定列布局门；表／列异常拒，不赋未来DDL／引用语义或缓存批准。
- 当前AdminFullCopy在同事务中创建Game、origin及committed复制请求（`server/admincopy.js`末段）。协调器仅允许目标copy行无记录或确实committed、actor为owner、无lease；异常非terminal行拒，不猜其可取消写者。该检查不是完整copy receipt／body核验，也不处理尚无Game的复制目标。
- 一个外层`transactionSync`内先调用原Job冻结，再调用原Draft冻结。后者失败必须回滚前者的Job更新与seal，以及本次Draft更新；旧HMAC记录只原服务核验，坏seal不覆盖、不TTL修复、不发unfreeze。
- 同事务读取当前Root journal pending／uncertain计数，**没有**native或R2操作。原表不是整个provider工作、legacy／外进程或futurewriter登记。

## 返回事实而非收据

exact14最小字段：gameId、rowRevision、jobStateDigest、draftStateDigest、jobsFrozen、jobsPreserved、requestsFrozen、requestsPreserved、copyRequestsPreserved、privateWritesPending、privateWritesUncertain、nativeDrainVerified=false、deleteAllowed=false、`CURRENT_SQL_FREEZES_ATOMIC_NATIVE_DRAIN_UNKNOWN`。

不返actor／Job内容／lease／key／body／MAC。管理权不授他人私有bytes。重复调用实际重核原两HMAC和当前行；pending计数随真正nativepromise返回而变化，因此整个DTO**不是immutable operation receipt**、请求成功证书或计划能力。两个0、两个freeze摘要或列布局通过都不授删除。

## 当前实际证据

owned`.dragon-analysis/editor-phase/backend-deletion-sql-freeze-session-r1`：random工程配置、owned tempSQLite/R2、loopbackHTTPS8787、既有MF/OpenSSL／白OS子环境。各producer1800s不延，源码快照／日志／报告wx；无UI改，不跑无关浏览器／媒体／原机制。

最终`main-r3`67组601记录Node调用（polling实际数，非协议固定数）；36metadata／10byte／10command／10Jobfreeze／6reference／8Draftfreeze／8协调返回。原59流程及期待完整当前兼容：真实20章源／baseline／saved2／data29-images7、85私有对象50,665,541B native长度-SHA、journal／MAC／columns／edges、故障／rollback／epoch／restart保原验证边界，非全媒体、战役或全部六用途。

新增八组：

1. 实际已sealed两服务重新核验，权限／builtin／UUID／strictfield／CAS，复制行与全部旧记录不变。
2. 实际第三完整20章副本、真实queued data Job、生产Root待保存全源，停在真实nativePUT提交后promise未返回；实际fence在协调器前建立。
3. only-fixture坏复制state拒，不冒合法copy运行态；实际第二seal的SQL BEFORE INSERT trigger500，证明外层回滚首Job更新／seal及Draft更新，全部行精确同。
4. 显式retry／sameinput并发只各一原seal；Job和pending Draft共同终态，Game内容时间／copy／snapshot／journal全保，nativepending仍1。
5. 实际第二seal MAC坏值503不重写第一seal；fixture精确恢复不是生产repair。
6. 释放原nativepromise后仅journal真正ack，旧Root save晚到精确GAME_DELETING；原终态／seals保；实时pending计数1→0，真实starter/workerd重启同。
7. 实际owner/admin零copy游戏最小事实一致；实际改密旧cookie401、新epoch只重核，不复活任务。
8. 独立内部getter控制：第二次读会换另一真实game，当前tuple只读取一次，两game原行同。这不是公共JSON会携带getter的证明。

## 失败与探针纪律

r1原协调66组通过后保存全部源。人工补独立tuple捕获和第8组，未借r1证明新源。

r2失败status1／signalnull／errornull，60流程后，新增第三副本save启动期间的`/api/test/writes`并发stats得到502 LOCAL_UPSTREAM_FAILURE（不是240s timeout）。catch failure JSON保首断言；finally关自有server时未观察的save promise又ECONNRESET，stderr因此掩首错。全部失败源、log/meta／partial报告保，不能拼green。

CodeGraph复核protected`tools/editor_local_https.mjs:49–54`：该502只把mf.dispatchFetch或response.arrayBuffer异常统一隐藏，细因仍未知，**未修生产bridge／SDK或宣称诊断闭合**。只给新增工程flow预登记原owned WriteFixture真实waiting转变通知，再启动save，避免重计算期间不相关的HTTP stats轮询；新240s预算与旧59等待／1800s均不变。新save立即附错误结果handler，finally不能再掩首错。r3完整67从新owned状态执行成功；这是明确改变观察探针后的验证，不是同键失败保存重跑或证明旧并发observer可靠／云SLA。原fixture／产品expectations与已封存旧源不改；新增fixture通知本身不是产品native终止机制。

精确派生原59／r1→r2 tuple和getter／r2→r3 probe delta、current SHA、全部470旧源、imports、语法／链接／73Q／LSP-session-all及人工最小Jev摘要另封存。LSP不确认不称clean。

## 后继完整定义与冻结同事务（旧入口保持）

[维护源](editor-backend-definition-freeze.md)：新opt-in协调器实际pinned actor/epoch/role、前后完整70对象/原scope门与本原两冻结同outertransaction，late nativeindex/epoch/row回滚及synthetic tuple分立；missing表先拒不constructor重建history，fresh11组88调用/4facts/482声明480旧保。原本服务、read/put-wait和Root全部不改/不自动享有新门，不冒重复原20章/93旧全链或真实enqueue-save/nativepending；rowIntegrity/nativeDrain/deletefalse，无新表/公开route。

## 尚缺

全部writer与legacy/external在途保守排空、全引用／共享对象归属、幂等专属physicaldelete/readback、SQL内容与receipt scrub、minimal completed410、cache和实际backup／隔离恢复；RuntimeManifest／G127-255／Trial／发布存档及完整工作台旧缺口不变。Blob.delete仍关；此内部服务未装生产Root公开操作，不是§5.4／Q43-Q46／主goal完成。无commit/push/deploy/cloud/install/trust、DOS-SAVE／真实profile-IDB或共享清理。
