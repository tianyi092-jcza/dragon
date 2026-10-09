# 当前声明唯一键行（E-01-BACKEND-DECLARED-UNIQUE-ROWS-1，限定）

接续[原生quick_check](editor-backend-sql-check-rows.md)明确未检测的UNIQUE语义。本批只新增`server/deletionuniquerows.js`及显式工具；488声明，原486输入/99imports含375玩家全保，100imports。旧Root、所有观察器/冻结/FK/quick_check/PUT-readwait门不变，不自动继承新保护。无schema迁移、公开产品路由、物理删除或运行许可。

## 固定来源与原生查询

先核前驱receipt及全部输入/import/历史SHA，再核完整定义批次receipt和`expected.json`SHA；从实际35隐式唯一索引取得33表/35完整列组合，均非partial、无表达式、BINARY collation。固定字面量固化于新模块；不能根据当前坏schema重新推导/放宽。两个INTEGER PRIMARY KEY rowid别名表不在这35隐式索引范围，不据此宣称所有低层索引内容完整。

[SQLite UNIQUE说明](https://www.sqlite.org/lang_createtable.html)与[NOT INDEXED说明](https://www.sqlite.org/lang_indexedby.html)公网页已直接curl独立归档。先在actual Worker认证probe验证所有35固定GROUP/HAVING查询和33有界marker扫描，得到characterized结果，不当业务PASS。仅`NOT INDEXED`禁止采用声明索引读取原表；它不保证索引页与表内容相等，也不认证存储损坏不存在。

每表`SELECT 1 AS rowMarker FROM 固定表 NOT INDEXED LIMIT ?`先查最多10001、全表累计最多20001的预算探测；超过每表10000/总计20000即503 DELETE_UNIQUE_BUDGET。前后实际databaseSize非负safeInteger且≤32MiB；工程范围预算不是云CPU/延迟SLA。固定键原生`WHERE 所有键列 IS NOT NULL GROUP BY 键列 COLLATE BINARY HAVING COUNT(*)>1 LIMIT 1`检查重复；不用JS拼键或大小写折叠。任一NULL按照SQLite UNIQUE语义不构成重复；NOT NULL/完整业务ID合法性仍另查。异常查询/投影503 DELETE_UNIQUE_QUERY，实际重复503 DELETE_UNIQUE_ROWS，不输出SQLite消息或坏键。

## 同事务事实端口

`GameDeletionUniqueRows.observe`严格gameId/expectedRowRevision、单次primitive捕获；actual storage.transactionSync固定真实principal id/epoch/role/mustChange，原GameDeletionSchemaIntegrity先核owner/admin/builtin/UUID/fence/unlisted/usedID/rowCAS和完整70对象35表243列35索引3FK/enforcement。首遍每表后实际scope/定义/身份重核；再核末次scope与principal，最后不再调用外部principal回调的完整第二遍扫描，防内部晚到已扫表行增长。无await/CREATE/业务SQL写入/bootstrap。

exact13只在原11事实新增uniqueKeysVerified=true/uniqueConstraintsVerified=35，mode `CURRENT_DECLARED_UNIQUE_KEYS_ONLY_LEGACY_UNKNOWN`；rowIntegrityVerified/nativeDrainVerified/deleteAllowed恒false。没有全局行数/键/DBsize/错误正文；不是持久receipt、索引内容一致证明或权限替代，后续使用仍须实际事务重验。

## 当前实际证据与限制

owned`.dragon-analysis/editor-phase/backend-declared-unique-rows-session-r1`：wx before/固定键来源/源码/probe/log/report，白OS环境/既有MF-OpenSSL-NodeSQLite、random owned tempSQL-R2和loopbackHTTPS8787；producer1800s不延。不stage源/库、不碰R2正文，父fixture仅初始化原两freeze表；SQL skeleton、工程journal和过期session键不冒正常创建、GameSource、实际PUT或真正session。

一次fresh `main-r1`15组50记录HTTP调用、5exact facts、7源SHA/3wx源码；全486/99前后hash保持：

- owner/admin/foreign/builtin/UUID/严格字段/CAS/fence、实际Cookie/Origin/CSRF；精确13字段及全部工程行不变。
- 原native UNIQUE确实拒普通重复INSERT；并未绕过Root约束或制造持久索引页损坏。
- 当前声明TEXT PK可有两NULL值的actual SQL样本，新门按UNIQUE语义接受，fixture仅移除自己样本；不授NULL业务operationID合法。
- 两独立simple/composite重复：只有owned事务暂去相应表的约束、复制原行后生成重复，低层固定NOT INDEXED查询503并全schema/row回滚。**不是**完整schema服务通过或native索引损坏实证。完整服务另对该漂移先503 DELETE_SCHEMA_DEFINITION。
- 首表scan后actual index/game.row/users.epoch变更503/409/401，合成返回role变化401另标synthetic，原行/目录完整回滚。
- 第一完整扫描之后内部actual10001 session增长由第二无回调扫描捕获budget503并全部回滚；前置相同预算亦拒。无产品清行/重试/扩预算。
- 真workerd重启及真实改密old401/newfacts，publicdelete404，无410或delete能力。

Node最终10组简化**无索引/无完整声明**表模型另标：BINARY大小写及分隔符复合键、simple/composite重复、NULL、BLOB/TEXT储存类区别、真实10001及10000+10000+1预算；query/投影/size失败是synthetic，不冒native authority/完整35表/索引损坏。memory-r1原件保；unchecked JSON.parse辅助诊断只补try/catch并生成memory-r2，同10check字符串重验，不重跑未变native产品。

失败保留：前置fixed identifier检查误排sha256中的数字，尚未建owned目录或产品/probe；保说明，改为固定schema标识符字母/数字/下划线，并非放宽用户SQL。probe-r1在Miniflare启动因JSON import无module rule失败，尚未login/SQL；源/log/status保，仅把已核keys.json生成owned ES module并替换local import，不改SDK/module rules/依赖或期待。probe-r2仅characterized三auth调用/所有35查询支持，不当业务PASS。主producer无失败。static-r1把固定login_rates唯一列`bucket`的文字误当provider访问，源/log保留；只纠正collector为成员/调用语法检测，不改任何产品、输入哈希、业务期待或预算，static-r2完整重验。适用SHA/来源重建/语法/diff/链接73Q/主动LSP-session-all与最小Jev另签，unconfirmed不称clean，不重跑封存93/quick_check/FK/20章/browser/媒体/原机制。

## 后继共同冻结（不是旧入口升级）

[维护源](editor-backend-validated-freeze.md)：原本低层35键扫描与quickcheck/三FK、原定义冻结共同actualouterSQL事务，末次callback之后纯重扫并实际session-user SQL核原Root policy；15组105调用/4facts、late CHECK/预算/epoch-expiry-role及全35行/目录-size rollback有证。490声明488旧375玩家保/101imports；本原服务/Root不改不自动受保护，仍不签indexContents/fullrow/refs/native/delete。

## 仍开出口

实际索引与表内容一致、完整FK/CHECK/业务行/undeclared command-receipt/shared历史refs与一致事务整合、全部writer/read/body/provider/CPU/legacy/external在途，专属幂等physicalcleanup/readback、SQL/receipt scrub、completed410、cache及实际backup/隔离恢复；RuntimeManifest/255/Trial/release/workbench/初始化原证仍未完。旧门不自动升级；goal active，无commit/push/deploy/cloud/install/trust、真实DOS SAVE/profile-IDB/秘密或共享清理。
