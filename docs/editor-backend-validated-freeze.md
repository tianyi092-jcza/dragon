# 原声明SQL检查与冻结共同事务（E-01-BACKEND-VALIDATED-FREEZE-1，历史限定）

**冻结器当前已纳[选中目标键结构跨族absence](editor-backend-key-namespace-links.md)**：exact48/CLI155检查1239调用20facts/505输入112imports，原46 checks之后六native关联/42固定actor-key EXISTS、metadata companion不新族、differentactor同key独立、expired不清、deleteactor不强owner；absence true/normalRootOriginfalse，fullhistory/native-delete仍false。Root/其它提交/waiter源码未变，未新增async等待覆盖。下文46/146/504及更早字段均历史切片。

**冻结器此前已纳[copy HTTP actor/key关联/现存proof](editor-backend-copy-command-links.md)**：exact46/CLI146检查1167调用/19facts/504输入111imports，allocation actor/key成对非jobUUID，缺proof保legacyfalse，command旧epoch不allocation/currentowner，原HTTP method-path-expected未知/run-cancel不授。既有waiter源码不改，无本批新copy异步等待证明，Root/其它提交不升级，全ref-native-deletefalse。下段43/130/503及以后均历史。

**冻结器此前已纳[bound Stage HTTP关系/现存proof](editor-backend-stage-command-links.md)**：exact43/CLI130检查1030调用/16facts/503输入110imports，缺proof保unsealed1/verifiedfalse/no repair、run绑定不成功，不重造purpose/expected。两个waiter源码未改依现有类，但本轮未新Stage异步场景；Root/其它coordinator未变，全ref/native/deletefalse。下段40/115及之后均历史切片或当次等待验证，不冒当前冻结DTO。

**现有两个等待入口此前已接[当前ValidatedFreeze](editor-backend-validated-waits.md)**：仅waiter四import/constructor替换，原private-brand/storage/ACKtuple/最小8-7falseDTO保；fresh23检查353调用/16asynccases/502输入109imports。该等待批次冻结器本体未变、当时exact40见下段历史，Root/其余coordinator未变。暂停native前/release真实R2不是provider悬挂，前freeze提交不被晚拒rollback，完整refs/body/providerCPUlegacy/delete仍open。

**冻结器此前实现为[target编译操作/原enqueue链接](editor-backend-compile-operation-links.md)**：exact40/CLI115组913调用/14facts、501输入109imports；multi retry/currentrow变化保而retry digest验证false，不认证孤儿/StageHTTP/purpose-policy，Root/其它门不变，fullrow/ref/native/deletefalse。下段37/105/500及之后均历史切片，不冒当前DTO。

**此前实现为[copy永久保留键/元数据操作](editor-backend-copy-operation-links.md)**：exact37/newmode、CLI105组838调用/13facts、500输入108imports；原reservation保留、不等同copy receipt/latest/currentepoch，Root/其它门不变，fullsummary/ref/namespace/native/deletefalse。下段35/82/499及之后均历史切片，不冒当前DTO。

**此前实现为[committed保存回执精确链接](editor-backend-draft-receipt-links.md)**：exact35/newmode、CLI82组655调用/12facts、499输入107imports；原Root/其它门未升级，fullsummary/ref/indexContent/native/deletefalse，原metadata允许64→65进位，不绑currentepoch/latest；工程SQL非Source/正常save/PUT。下段34/59/498及之后均历史切片，不冒当前DTO。

**此前实现为[copy origin/初始snapshot/receipt链接](editor-backend-copy-origin-links.md)**：exact34/newmode、CLI59组463调用/8facts、498输入106imports；Root/其它门不变、fullrefs/native/deletefalse，SQL工程非Source/normalcopy/pinnedpolicy。下段32/45/497与下文31/22均各历史切片，不冒当前DTO。

**此前实现为[精确saved/job链接](editor-backend-saved-job-links.md)**：exact32/newmode、CLI45组342调用/7facts、497输入105imports；下段31/36/496仅5bbfee此前切片，下文22仅更早原批次。Root/其它门仍未升级、全refs/native/deletefalse。

**此前实现已接[索引/name共同整合历史](editor-backend-bound-sql-freeze.md)及[私有对象行关系历史](editor-backend-private-row-bindings.md)**：同一ValidatedFreeze再核six-family描述子/四parent关系与同namespace长度，末callback后实际scope/纯扫/最终session保，exact31/newmode；现有CLI同process当前suite36组275调用/6facts，原22字符串及原拒绝/预算/完整rollback保。496声明493旧375玩家保/104imports，旧源wx归档，Root/其它freeze-wait未接、physicalindex/fullrow/ref/native/deletefalse。下文exact22、旧source SHA/490库存和未接index结论仅对应历史receipt d0670b40…，不再描述当前模块/CLI，不以旧报告冒新覆盖。

接续[定义冻结](editor-backend-definition-freeze.md)、[quick_check](editor-backend-sql-check-rows.md)、[三FK](editor-backend-declared-fk-rows.md)及[35唯一键](editor-backend-declared-unique-rows.md)。旧事实DTO不授随后冻结。本批新增内部`server/deletionvalidatedfreeze.js#GameDeletionValidatedFreeze`和显式工具；490声明、488旧输入/100旧imports含375玩家全保，101imports。所有旧Root、观察器、冻结及读写等待不改、不自动继承本保护，无新表/公开产品route/DELETE/410。

## 当次权威与共同原子性

constructor仅存实际storage/trusted Root principal/server key，无bootstrap。输入严格gameId/expectedRowRevision，一次捕获primitive tuple。自己在actual storage.transactionSync构造原服务，不接客户端报告、服务实例或“品牌”权限。

1. 捕获实际principal id/epoch/role；所有原服务回调都重新调用实际Root principal，并核mustChange及三字段一致。
2. 原只读完整定义/owner-admin/builtin/UUID/fence-unlisted-usedID/rowCAS门在任何原freeze constructor之前执行，缺表不悄悄重建。
3. 无回调组合原`inspectNativeQuickCheck`、`inspectDeclaredForeignKeyRows`和`inspectDeclaredUniqueKeys`；原32MiB/每表10000总20000预算与错误保持，不扩大检测范围。
4. 原`GameDeletionDefinitionFreeze`执行原Job/Draft/HMAC共同更新，原copy/journal检查保持。之后再实际scope/定义查验，schemaDigest一致。
5. **所有principal回调之后**无回调/await重扫三组原检查，防已扫表晚到坏CHECK或预算增长。最后直接从同SQL sessions JOIN users读取最小当前字段，重验原Root `worker.js:97–102`的disabled/session-user epoch/absolute与idle expiry/mustChange及捕获身份；不相信回调此前的DTO。投影不含password_hash/account/CSRF，不把最后回调返回成功当session仍有效。
6. 任何失败抛出使两原SQL更新/seals和受控SQL变化共同回滚，**不**声称回滚R2/provider。pending/uncertain journal保持，不abort/retry/repair。

exact22事实：原definitionfreeze17，加quickCheckVerified、foreignKeyRowsVerified、foreignKeyEdgesVerified=3、uniqueKeysVerified、uniqueConstraintsVerified=35，mode `CURRENT_DECLARED_SQL_CHECKS_AND_FREEZES_ATOMIC_NATIVE_UNKNOWN`；rowIntegrityVerified/nativeDrainVerified/deleteAllowed恒false。无全局数量/键值/DBsize/错误正文。不是持续权限、索引内容一致、完整业务行或shared/legacy refs、body/provider/CPU证明；下一操作仍需自己的实际事务核验。

## 实际证据

owned`.dragon-analysis/editor-phase/backend-validated-freeze-session-r1` before/源/log/report wx，random owned tempSQLite-R2/loopbackHTTPS8787、白OS环境及已有MF/OpenSSL；producer1800s不延。父实际Root fixture只初始化原两freeze表，SQL skeleton、queued Job/pending Draft/pending journal是工程结构，**非**正常创建/Source/enqueue/save/nativePUT；原冻结执行器与HMAC确为生产实现。无staging/R2正文或游戏/browser/原机制变化。

最终fresh main-r3 **15组105记录HTTP调用、4exact22 facts、13报告源/3wx源码快照**，全部488输入/100imports前后SHA同：

- 实际owner/admin/foreign/builtin/UUID/strictfields/fence/CAS及Cookie-Origin-CSRF；受拒无修改。
- 持久工程badCHECK：原完整定义观察仍通过，新协调器在冻结前503 DELETE_SQL_CHECK_ROWS，全SQL指纹不变；仅fixture明确恢复自有pending行。
- 实际原两冻结及seals共同提交；generation/row+1、failed/nonretry及Draft error409，Game/时间和pendingjournal保持；admin repeat事实同。
- 两seals已存在后第8次实际principal边界注入badCHECK、10001合法父引用/过期工程session增长、index、Game row；精确503 CHECK/FOREIGN_KEY_BUDGET/DEFINITION或409 FENCE_CHANGED，所有35表行/目录/实际databaseSize与之前指纹相同、两seals消失/queued-pending恢复。
- 第10次**最后外层gate principal回调**后实际增用户epoch、把当前session idle_until设0、改role，以及badCHECK/session增长；之后无外部回调，最后SQL guard或纯扫描精确401 SESSION_INVALID/ACTOR_CHANGED、503 CHECK/FK_BUDGET，全部共同回滚。不是纯synthetic身份DTO测试，也不宣称公共攻击路径。
- 实际workerd/DO restart、真实password handler old401/newfacts；缺原freeze表先503，fixture确认仍缺才精确restore；publicdelete404。

所有native hooks只在owned同步事务中，记录firedAt明确发生边界；总callback数并不等于触发序号。原独立checker/旧93/20章/R2/browser/media/原机制全轮未重跑，不把旧源不变冒本轮业务覆盖。

## 当时后继逻辑索引投影（当批未接；当前整合见顶栏）

[维护源](editor-backend-index-projections.md)：actual35覆盖计划/33表与原表增量rowid-type-nativehex-number相等，18组61调用/5facts及healthyNULL/BLOB-TEXT/lateSQL/rollback/restart-password，synthetic错误投影/Node10分立。492声明490旧375玩家保/102imports；本冻结模块不变、不自动受保护，完整物理index/business-ref/native/delete仍false，独立事实不能授下一提交权。

## 失败与修正

- derive-r1在写派生源码/启动之前错假设route唯一：父action和rejected helper共两处，源/说明保，改为精确两处替换；无SDK或业务期待变化。
- main-r1首个late CHECK已精确拒且全SQL/size rollback成立，随后诊断断言错把总calls10当触发8。三源码/log/failure保，仅fixture记录firedAt及工具相同8/10边界断言，原状态/error/预算期待不改。
- main-r2在budget新fixture得到INTERNAL_ERROR500：INSERT用了8值而固定当前sessions只有5列。源码/log/failure保；绑定已核原sessions DDL，独立owned Node模型给相同列数错误（不冒workerd原始错误正文），仅fixture改5值。10001行、32MiB、原503期待和1800s不变；产品模块三个主轮逐byte同。
- main-r3从fresh状态完整15通过，不拼partial成功、不接受任意500、不延预算。主stdout JSON是该轮证据；runner沿用父终端`definition/freeze scoped PASS`只是打印，不代替新result或范围。

static-r1在保留的main-r2 AssertionError.message核对处失败：collector误以为只有INTERNAL_ERROR，实际还含500 !== 503的断言格式；源/log/status保，仅把collector期待绑定完整原消息，不改任何主业务期待/产品/预算，static-r2完整重验。

主动LSP/session-all、源码/派生逆差/SHA/imports/语法/diff/链接73Q和隐私审过最小Jev另签；unconfirmed不是clean，无ignore/禁规则/缓存清除。当时索引-表实际投影未整合的缺口已由顶栏后继在此现有路径补齐；所有页/其它路径、业务/命令收据/历史shared refs、全writer/read/body/provider/CPU/legacy-external、专属幂等cleanup/readback/scrub/completed410/cache实际backup隔离恢复以及RuntimeManifest/255/Trial/release/workbench/初始化原证仍开放。无commit/push/deploy/cloud/install/trust、真实DOS SAVE/profile-IDB/秘密或共享清理，主goal active。
