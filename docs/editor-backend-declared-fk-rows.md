# 当前三声明外键行（E-01-BACKEND-DECLARED-FK-ROWS-1，限定）

接续[完整定义](editor-backend-deletion-definitions.md)与[定义冻结](editor-backend-definition-freeze.md)。固定DDL/pragma正确不证明存量父引用完整。本批只新增`server/deletionforeignkeyrows.js`和显式验证工具，原482输入/97imports含375玩家全部不变，484声明/98imports。旧Root/observer/freezes/waits未自动获得本门，无新表或产品路由。

## 实际边与权限

当前14源/固定70目录只声明三条外键：`content_games.owner_id`、`installed_sources.registered_by`、`sessions.user_id`均指向`users.id`，child均TEXT NOT NULL、parent按当前BINARY文本主键关系。`inspectDeclaredForeignKeyRows`固定三个LEFT JOIN，不接用户table/column/query；SQL LIMIT使用内部预算，每表10000/总20000，额外取一行检测溢出。固定parent主键索引随原完整定义门锁定。查询/游标异常503 `DELETE_FOREIGN_KEY_QUERY`，超预算503 `DELETE_FOREIGN_KEY_BUDGET`，空/坏投影或缺父503 `DELETE_FOREIGN_KEY_ROWS`，不返回任何ID、token/hash或坏行，不修复数据。预算是工程fail-closed，不是云SLA。

`GameDeletionForeignKeyRows.observe`strict gameId/expectedRowRevision，捕获primitive一次；同actualstorage外层transaction内首先capture actualprincipal id/epoch/role，随后每次原`GameDeletionSchemaIntegrity`观察都真实重查并固定身份，mustChange/换身份拒。原scope/owner-admin/builtin/UUID/fence-owner-row/usedID/listed/CAS/70对象/35表243列/35索引3FK及enforcement先核，每个子表后重核，最终定义/权限再次复查。任何晚到SQL失败回滚整个事务，constructor不写SQL或bootstrap，source无await/R2。

exact13只在原11事实中增加foreignKeyRowsVerified=true、foreignKeyEdgesVerified=3，mode=`CURRENT_DECLARED_FOREIGN_KEY_ROWS_ONLY_LEGACY_UNKNOWN`；rowIntegrityVerified/nativeDrainVerified/deleteAllowed仍false。低层rowsChecked仅内部统计，**不进入owner DTO**，避免公开全局session/user行数量。扫描范围为这三条声明关系的全局行，预算内每条都须有父；不是其它无声明关系/所有CHECK/账户session语义/内容引用或授权证明。服务的权限/完整定义门不可用低层helper代替。

## 当前独立证据

owned `.dragon-analysis/editor-phase/backend-declared-fk-rows-session-r1`：before/源码/日志/probe/报告wx；白OS环境、已装MF-OpenSSL/NodeSQLite、random owned tempSQL-R2及loopbackHTTPS8787，主producer1800s不延。SQL工程game skeleton非Source/正常新建，installed_sources工程行非真实库安装/运行许可，budget session行只合法父引用、不冒有效认证会话。无staging/R2正文/实际enqueue-save/UI/游戏变更，不重复旧93或原冻结流程。

先行实际SDK探针仅签三个bounded JOIN可用、初始0/0/1行、FK开且不defer，`CHARACTERIZED-ACTUAL-BOUNDED-FK-JOIN-ONLY`不是业务冻结/删除PASS。probe-r1生成输出拼接的换行落入JS字符串，parse即失败、无setup/请求；两源快照和stderr/meta保，仅删不必要拼接后probe-r2成功，未改产品/预算。run-probe继承的终端success文字不准确，**只认原始probe JSON的characterized结果**，不把它当freeze成绩。

最终fresh主`main-r2`13组50记录HTTP调用/4exactfacts/7源SHA/3wx执行源快照，无主producer失败：

- 原Root真实admin/owner/foreign/密码、mandatoryfence/UUID/builtin/strictfield/rowCAS、owner/admin正例，scope行/Job-Draft seals/journal/audits都不变。
- 每个声明子表分别在owned真实deferred事务暂改为缺父：低层真实JOIN拒503，原生事务整体rollback，完整行fingerprint恢复。**不是已保存坏行、正常Root绕过FK或fullservice在deferred下放行**。
- fullservice单独对actual defer_foreign_keys=ON先拒`DELETE_SCHEMA_ENFORCEMENT`，与低层负控分开。
- 第一表后internalprincipal控制真实新增index/改game.row/改users.epoch，分别503/409/401，完整外层rollback。returned role不同是明确synthetic控制401，不冒实际数据库换role或公共攻击。
- 真正额外10001工程session行触发10000表预算，服务不清理/扩预算；仅fixture删除自己带专用前缀的行，原fingerprint恢复。
- HTTP Cookie/CSRF/Origin、actual workerd重启与实际password旧epoch401/newsession重核，publicdelete404。

独立NodeSQLite `verify-memory.mjs`7组：简化三个关系模型正例、FK OFF插case-sensitive孤儿后ON拒、10001单表及10000+10000+1总预算；另synthetic query fault/NULL projection/超过LIMIT游标分立。这不是完整35表或Root权限，也不当作workerd存量坏行证据。

r1主13组全通过及三wx源保留；主动辅助诊断命中新fixture的nested ternary，改唯一绑定选择为等值if/else、无抑制/预算或期待变化，r2同13 check与50调用完整fresh重验。Jev3744B人工最小摘要在该语义不变风格修正前审preview并发送，仅advisory。

SHA/旧482保护与97imports、当前源/快照、三关系对当前固定FK元数据、语法/diff/链接/73Q、支持LSP-session-all和人工最小Jev另封存。unconfirmed不称clean；失败probe原件保，无main重试碰绿或提高预算。

## 后继当前原生quick_check（FK门未改）

[维护源](editor-backend-sql-check-rows.md)：独立同storage/原完整定义-fence事务两次nativechecker、ignoreflag0/native32MiB预算，持久badCHECK/lateSQL/预算rollback等12组51调用/4facts，Node8另标。486声明484旧含375全保/99imports，本三FK服务和Root/全部旧门不变；quick_check明确不查FK/UNIQUE/index内容，不默示组合或完整row/ref/drain/delete。三个完整字段false。

## 限制及下一出口

全行CHECK/结构语义、没有声明FK的内容/命令/receipt/共享历史引用，所有writer/read/body/provider/CPU/legacy在途、物理幂等清理/readback、SQL/receipt scrub、completed410、cache/实际backup/隔离恢复仍缺；RuntimeManifest/255/Trial/发布/workbench/初始化原证等仍开。旧门未整合，新服务只签当次关系事实，不授复用DTO/hash权限或整目标完成。无commit/push/deploy/cloud/install/trust、DOS SAVE/真实profile-IDB/秘密或共享清理，goal active。
