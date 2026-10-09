# SQL定义核验与原冻结同事务（E-01-BACKEND-DEFINITION-FREEZE-1，限定）

接续[固定声明](editor-backend-deletion-definitions.md)及[原SQL冻结](editor-backend-deletion-sql-freeze.md)。旧观察DTO不能授权随后冻结；新增内部`GameDeletionDefinitionFreeze.freeze`把当次完整定义与原Job/Draft冻结放进同一actual storage.transactionSync。全部480旧输入（含375玩家）/96旧imports保持，只新增协调器和focused工具；482声明/97imports，35表243列及70对象不变。

## 权威和顺序

constructor只存actual storage、trusted principal和server key，不创建表或持有R2。请求严格gameId/expectedRowRevision，一次捕获primitive tuple并冻结内部target；不接收客户端证明/计划/超时/旧DTO。外层真实同步事务内捕获actual principal的id/epoch/role，传入原服务的每次principal调用都重新查真实Root会话、mustChange并核一致性。

1. 原只读`GameDeletionSchemaIntegrity`在actualauthority/fence/CAS/usedID/未listed后核完整70对象/35表243列/35隐式index/3FK及enforcement。**先核后构造**原SQLfreeze；缺原freeze表不自动IF-NOT-EXISTS重建，不推断“首次初始化”。受信部署的原表初始化与本次保护端口分开。
2. 自己构造原SQLfreeze，原构造器只对已经验证存在的两已声明表IF-NOT-EXISTS；所有服务使用同storage和pinned真实principal，不接受外部服务/品牌对象。
3. 原协调器执行原copy当前状态/写journal摘要、Job/Draft终态化和两HMAC seals。没有更改原任一规则/源；原SQL pending/uncertain不清、不cancel native。
4. 提交前再次实际scope/actor/epoch/role/完整定义核验，并末次实际principal复查。所有过程无await，摘要相同只是固定声明事实；任一失败抛出，原Job/Draft修改/seals及受测同事务原生DDL/row/epoch变更都随外层回滚，不假称SQL-R2原子。

exact17事实保原14字段，加schemaDigest、definitionsVerified=true、rowIntegrityVerified=false，mode=`CURRENT_DECLARED_SQL_FREEZES_ATOMIC_NATIVE_DRAIN_UNKNOWN`；nativeDrainVerified/deleteAllowed恒false。该事实与Object.freeze不是持续权限或完整行/引用/读body/CPU/provider证明。返回后其它改动仍要求下一操作真实重验。**旧Root/inventory/freezes/read-wait/put-wait未改、未自动接本保护**，新内部选择入口才享有此同事务门；没有公开产品route/delete/410。

## 当前实际证据

owned`.dragon-analysis/editor-phase/backend-definition-freeze-session-r1`：before/源快照/log/report wx，白OS环境/已有MF-OpenSSL，random owned tempSQLite-R2、loopbackHTTPS8787，主producer1800s不延。父definitions fixture已明确初始化两原表，真实Root认证与SQLite服务；不stage source/library，没有R2正文读写/删或browser/游戏规则变化。

最终fresh main-r2 **11组88记录HTTP调用、4exact事实**：

- actual owner/admin/foreign/builtin/UUID/strictfields/CAS/必需fence和cookie/Origin/CSRF；拒绝无seal写入。
- 七种实际CHECK/FK/COLLATE/UNIQUE/extra index/view/trigger漂移在冻结前精确503，原queued/pending和已捕获SQL rows保持；固定owned restore不是产品迁移。
- 原执行器真实把queued Job generation/row+1、failed/nonretry与pending draft失败409，两原HMAC封存；admin repeat/actualrestart重新查实际行/原seal/70定义，Game原时间/row与journal pending1不变。
- 内部trusted-principal边界控制：第六查验前实际创建index，在两原更新/seals之后post-gate精确503，所有SQL变更及index整体回滚；第五回调实际改Game row，在首Job已更新后原Draft拒409，全部回滚；第六回调实际增user epoch后末次principal拒401 SESSION_INVALID，epoch与冻结一起回滚，原admin session仍有效。纯synthetic返回actor epoch探针第五回调精确401 ACTOR_CHANGED，**不冒真实DB/公开身份攻击**。
- actual password handler撤old epoch401，新session重核；publicdelete仍404。
- actual drop已声明原freeze表（含封存行）后新门503，原constructor不重建；owned fixture确认table仍缺才逐字/逐行restore，旧已封存SQL rows等值，不冒undelete/repair。

game、queued Job、pending draft及pending journal为合法结构的**工程SQL skeleton**，不是原API enqueue/save、GameSource/正常初始化或在途native PUT；freeze及HMAC确为原产品实现，nativeSQL mutation/rollback与synthetic tuple分别标明。本批未重复原20章/R2/93已封存流程，不把源码不变当本轮全业务重跑。

r1 10组/旧源与三wx快照/报告保留，人工复核后将固定定义检查移到原constructor之前，再加独立missing-table负控；r2 first10 check字符串同且全fresh11通过，无producer失败、不延预算/接受任意错误或拼旧通过。主动LSP/session-all、SHA/当前8报告源/3wx快照/初版精确改动/语法/链接73Q与Jev最小摘要另签，未确认不称clean。

## 后继组合当前SQL检查（旧入口不升级）

[维护源](editor-backend-validated-freeze.md)：新选择协调器在本门之前/之后实际组合quickcheck/三FK/35UNIQUE，原两冻结/seals同outerSQLrollback，最后callback后无回调纯扫描和actualRoot policy session-user SQL核验；15组105调用/4facts及真实late坏行/预算/epoch-expiry-role/原行-目录-size全rollback有证。490声明488旧含375保/101imports，本文件原门/Root及各独立checker不改、不自动继承；完整row/index内容/refs/native/delete仍false。

## 下一出口

这里只闭合当前声明门与原SQL冻结共同事务。完整row/FK数据、全shared/legacy refs、writer/read/body/CPU/provider/未知结果、专属幂等physicalcleanup/readback、SQL/receipt scrub、minimal completed410、cache/实际backup/隔离restore，及RuntimeManifest/255/Trial/发布/完整工作台/初始化原证仍缺。无commit/push/deploy/cloud/install/trust、真实DOS SAVE/profile-IDB/秘密或共享清理，主goal active。
