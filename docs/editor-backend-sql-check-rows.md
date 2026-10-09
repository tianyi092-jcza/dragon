# 当前原生SQL quick_check（E-01-BACKEND-SQL-CHECK-ROWS-1，限定）

接续[三声明FK行](editor-backend-declared-fk-rows.md)。正确DDL/FK关系不能保证存量CHECK值合法。本轮只新增`server/deletioncheckrows.js`和显式工具；486声明、原484输入/98imports含375玩家全保、99imports。所有旧Root/observer/freeze/waits/FK门不改，不自动继承新检查；无新schema或产品路由。

## 实际能力及范围

先在fresh owned Worker认证探针确认`PRAGMA ignore_check_constraints`返回0、`PRAGMA quick_check(1)`返回唯一quick_check=ok、实际`sql.databaseSize`可用。`integrity_check(1)`、page_count/page_size均被SDK精确`not authorized: SQLITE_AUTH`拒；不能把Node或SQLite全部能力投射到workerd。

[SQLite原文](https://www.sqlite.org/pragma.html#pragma_quick_check)说明quick_check不检查UNIQUE约束，也不核索引内容与表内容一致；其它与integrity_check相同，其中含CHECK/NOT NULL及低层结构检查，但不查外键。完整相关原文由直接curl抓取、固定anchor提取保存在owned `sqlite-pragma-passages.json`，不是AI结论。新服务不尝试被拒的完整integrity_check，不签UNIQUE/index-content/FK/全部业务行完整性。

低层`inspectNativeQuickCheck`前后要求ignore_check_constraints恰0；SQL getter/查询/投影异常503 DELETE_SQL_CHECK_QUERY，忽略CHECK开关503 DELETE_SQL_CHECK_ENFORCEMENT。实际databaseSize须非负safeInteger且≤32MiB，超过503 DELETE_SQL_CHECK_BUDGET。quick_check(1)只接受唯一、无额外字段、恰`ok`的投影；任何错误内容503 DELETE_SQL_CHECK_ROWS，**不公开SQLite错误或坏行**。32MiB为工程同步扫描范围预算，不是云SLA/原机制；结果数量1不冒CPU超时，仍有有界数据库扫描成本。

`GameDeletionCheckRows.observe`捕获primitive gameId/expectedRowRevision；actualsameStorage transaction内固定真实principal id/epoch/role和mustChange，原GameDeletionSchemaIntegrity先核owner/admin/builtin/UUID/unlisted/usedID/fence-owner-row/CAS/完整70对象35表243列35索引3FK/enforcement。第一次原生检查后重新核实际定义/scope及principal，再做第二次原生检查，防已有结果被内部晚到CHECK行变更追认为当前。原principal在真实Root是只读SELECT；所有检查同步无await/SQL写入，constructor不bootstrap。

exact12仅在原11事实增加quickCheckVerified=true，mode CURRENT_NATIVE_SQL_QUICK_CHECK_ONLY_LEGACY_UNKNOWN。rowIntegrityVerified/nativeDrainVerified/deleteAllowed恒false，**没有**全局size/行数/用户ID/token/SQLite错误正文。事实不是持久receipt或可复用权限；其它服务/提交仍须在本身实际事务重查，不凭此准许删除。

## 真实验证与失败保留

owned `.dragon-analysis/editor-phase/backend-sql-check-rows-session-r1`：wx before/源码/日志/partial/probe/报告，白OS环境、已有MF/OpenSSL/NodeSQLite、随机owned tempSQL-R2与loopbackHTTPS8787；producer1800s不延。未stage Source/library或使用R2正文。父fixture只初始化原两已有freeze表；SQL skeleton非正常新建/GameSource，journal行和BLOB时间字段是工程fixture，非真正NativePUT/pending历史。

最终fresh `main-r3`12组51记录HTTP调用/4exact facts/7源SHA/3wx执行源码：

- actualowner/admin/foreign/builtin/严格字段/UUID/CAS/fence及最小DTO，所有原Game/users/sessions/seals/journal/audit行fingerprint保持；真实Cookie/Origin/CSRF。
- actual ignore_check_constraints=ON先拒；仅fixture显式恢复connection flag，不假定transaction rollback能恢复PRAGMA状态。
- 真正持久保存bad journal state：controlled ON允许写corrupt，再OFF；旧完整定义observer仍通过，新原生checker503、不发错误正文。只有owned fixture恢复自己原pending行，不是产品repair。
- 第一次checker后真实原生index/game.row/users.epoch变更分别503/409/401并完整rollback；返回role变化是synthetic tuple401，不能冒公共攻击/数据库真实role变更。
- 第一检查后controlled ON写bad CHECK行再OFF，定义仍同；第二原生检查503并整个事务回滚，ownflag0/rowfingerprint恢复。
- actual34×1MiB BLOB元数据在owned事务使databaseSize>32MiB，新门精确budget503，原行及逻辑页数整体回滚。服务未清理/扩大预算，不签字段语义合法或provider工作。
- actualworkerd重启/真实password旧epoch401新session重查，publicdelete404、没有DELETE/410。

失败源/记录保：

1. probe-r1 login422 IDEMPOTENCY_KEY：新helper漏必需header，尚未到能力探测；只补UUID header，原200及预算保持，probe-r2得到精确原生能力。
2. main-r1前9组通过，新增预算fixture9×4MiB得到500而非原503。专用probe-r3定位4MiB单值在INSERT前被SQLITE_TOOBIG拒；1MiB/256KiB真实插入并强制rollback，databaseSize恢复307200。只改新fixture为34×1MiB，产品32MiB和期待503不改；r2整批fresh验证，不接受任意500或重跑碰绿。probe的characterized结果不当业务PASS。r2源/report保后补admin-only native size在预算rollback前后等值断言，r3同12 check strings全fresh，产品不变；不把单行probe的size恢复代整个预算证明。
3. 独立Node memory初版欲改sqlite_schema造NOT NULL坏行，但默认defensive连接精确拒`table sqlite_master may not be modified`，无该坏schema或结果。保失败源/说明，后继只签SDK拒绝+目录未改，不绕过defensive，也不当workerd/NOT NULL坏行实证。

`verify-memory.mjs`最终8组独立Node简化模型：真实CHECK正例/ignoreON与持久badCHECK拒；默认Node schema修改拒绝；真实FK孤儿quick_check仍ok的遗漏对照。另synthetic size非法/溢出、SQL异常/空投影、额外字段、后置flag变化明确分立，不冒native运行或全部35表/Root权限。NOT NULL检测能力依据SQLite原文，未制造native badNOTNULL样本。

适用SHA/全484旧输入/98imports/实际源码与快照/生成工具前缀及预算修正逆差、语法/diff/链接/73Q、主动LSP-session-all与人工最小Jev另签；LSP无确认不称clean，不重跑已封存93/FK/20章/browser/媒体/原机制。保全部旧故障，未知coupled502细因不被本PASS修复。

## 后继固定唯一键行（仍非索引内容一致）

[维护源](editor-backend-declared-unique-rows.md)：新原生NOT INDEXED/GROUP核35固定隐式键33表、BINARY/NULL/有界marker及actualscope逐表/第二全扫描；fresh15组50调用/5facts、临时去约束重复低层拒与原schema门先拒、lateSQL/预算/epoch/restart有证，Node10分立。488声明486旧含375保/100imports，本quick_check及旧Root/所有门不变不自动继承；uniqueKeysVerified不是索引实际内容一致/完整row/ref/drain/delete，三个完整字段false。

## 剩余出口

UNIQUE/index实际内容、完整FK/业务行/没有声明的content-command-receipt及shared/historicalrefs、全部writer/read/body/provider/CPU/legacy在途、专属幂等physicalcleanup/readback、SQL/receipt scrub、completed410、cache/实际backup/隔离恢复及RuntimeManifest/255/Trial/发布/workbench/初始化原证仍开。旧门未整合，无表迁移/自动repair/TTL/公开Root/delete许可；goal active，不commit/push/deploy/cloud/install/trust、不访问真实DOS SAVE/profile-IDB/秘密或清共享状态。
