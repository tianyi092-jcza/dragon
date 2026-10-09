# 当前SQL声明完整性（E-01-BACKEND-DELETION-DEFINITIONS-1，限定）

接续[当前列布局](editor-backend-deletion-columns.md)与[当前读取调用](editor-backend-current-read-wait.md)。列属性相等不能证明CHECK／外键／COLLATE／UNIQUE／索引、view或trigger仍为当前声明。本批新增**内部只读**`GameDeletionSchemaIntegrity.observe`及固定`assertDeletionDefinitions`，不修改旧列门、inventory、freeze、Root、任何writer／reader／UI或规则，也不开放删除。

## 固定声明与同事务核验

从当前14源的35条字面CREATE TABLE提取实际声明，逐字源与477基线SHA绑定；owned内存NodeSQLite生成当前`sqlite_master`的70对象（35表、35隐式索引）及3条外键声明、每表index_list、每索引index_xinfo、foreign_key_list。无显式CREATE INDEX／trigger／view获准；CHECK与COLLATE等约束由SQLite保存的完整table SQL文本锁定。固定目录编入`server/deletiondefinitions.js`，不在请求中重新从现状生成可信期望，也不接受客户端DDL／迁移／hash证明。

`GameDeletionSchemaIntegrity`捕获一次primitive game/row，在真实storage.transactionSync内检查actualprincipal／mustChange、owner/admin、非builtin、准确UUID/row、实际fence-owner-row、未listed、usedID；随后在同事务核定义。服务不拥有freeze实例，不终态化任何Job/Draft；constructor不建表或持有R2。完整目录包含所有对象，不像旧列门按`sqlite_`／`_cf_`前缀排除；未知对象或合法等价但非本版文本一律503 `DELETE_SCHEMA_DEFINITION`，不自动归一或迁移。元数据读取失败／超过128条预算为`DELETE_SCHEMA_METADATA`；master查询LIMIT129，所有动态标识来自已匹配固定目录，不来自用户参数。

原35表243列门再次核查；真实FK enforcement必须1、defer_foreign_keys必须0，否则`DELETE_SCHEMA_ENFORCEMENT`。目录相同但FK/index元数据不等为`DELETE_SCHEMA_ATTRIBUTES`。核验与摘要均同步无await，原principal本身只查真实session/用户，观察不写SQL或R2。不能推广为SQLite全部运行语义证明、所有现存数据合法、PRAGMA foreign_key_check完成或全历史引用闭包。

exact11最小事实：gameId、rowRevision、schemaDigest、tablesVerified、indexesVerified、foreignKeyDeclarationsVerified、definitionsVerified=true、rowIntegrityVerified=false、nativeDrainVerified=false、deleteAllowed=false、mode=`CURRENT_DECLARED_SQL_DEFINITIONS_ONLY_LEGACY_UNKNOWN`。摘要与Object.freeze只是事实表示；返回后定义/权限可变化，未来协调或提交必须重新查询，不能拿旧DTO/hash替代权威。**旧inventory/freeze路径仍只核原列门，不自动获得本批保护**。

## 当前实际证据

owned`.dragon-analysis/editor-phase/backend-deletion-definitions-session-r1`：所有before／生成来源／源码／日志／partial／报告wx；白OS环境、已装MF-OpenSSL/NodeSQLite、random工程配置／owned tempSQL-R2／loopbackHTTPS8787；独立1800s预算不延。Root启动只声明原33表，fixture通过原SQLfreeze constructor初始化已有两freeze表；未调用freeze。工程小game由仅fixture事务建立真实owner/usedID/name/row skeleton，**不是**GameSource、完整复制、创作初态或可玩游戏。未stage source/library，R2没有正文读/写/删。

最终fresh `main-r3`16组80记录HTTP调用、15exact observations：

- native workerd70对象文本/名字/隐式索引与独立NodeOracle完全相等，实际FK开且不defer；三个真实账户/密码/Owner-foreign/admin/builtin/UUID/strictfields/CAS/fence门。
- 实际移除journal state CHECK、session FK、名字BINARY→NOCASE、新增UNIQUE(game_id)，旧35/243列门均通过，新门精确503；仅owned fixture重建/还原，原行恢复，不是产品迁移或清理。
- 实际增加index/view/no-op trigger/未知table，新门503；index/view/trigger仍可通过旧列门；未知table原门也拒，二者不混同。所有精确还原后native摘要等于初始。
- actual同事务defer_foreign_keys=ON即拒503，事务后flag还原；列出/实际fence-owner坏值拒，fixture定点restore不冒undelete。
- HTTP坏cookie/CSRF/Origin拒、真实workerd重启保声明和fence、实际改密撤old epoch401、新session重核；publicdelete仍404，观察未改Job/Draft seals、写journal或audit计数。

workerd保留前缀 `_cf_` 的CREATE被SDK本身拒（精确`not authorized: SQLITE_AUTH`，原始warning／专用probe保），未产生table。最终组只签**SDK拒绝且native目录不变**，不是新门在native中核过该table。独立`verify-memory.mjs`9组（旧8组/source保）使用真实owned NodeSQLite可建该prefix表，旧过滤列门通过／新完整目录503；另外真实Node缺已声明对象及FK OFF拒，三种明确标为synthetic的FK/indexlist/indexinfo元数据负控，以及读取失败／129条预算拒。纯内存／synthetic不冒workerd运行证据。

## 失败与修正保留

- main-r1前9组通过，新增fixture错误假定workerd允许CREATE `_cf_unknown`；SDK拒绝被Root转500，旧源／failure/log全保。专用probe确认SQLITE_AUTH后，仅该flow改为精确SDK拒绝组；新增Node对照，未接受任意500、延预算或修改产品门。
- probe第一次生成字符串将换行落入JS字面量、第二次复制的tool相对import未重定位；两次均在parse/import、setup之前失败，无请求。源码/log/meta保，分别删不必要输出拼接、明确../../../tools导入；第三次专用probe实际成功，不算业务PASS。
- main-r2在坏CSRF期待403处得200：新测试helper先应用extra、后被真实session token覆盖，实际发的是合法token。源/日志保，只调整extra最后覆盖；原403期待/产品逻辑不变，main-r3整批从fresh验证。
- 初版新producer14 template/3 braces诊断在执行前改正并归档，未ignore／禁规则／清缓存。主动LSP／session-all结果另签；无确认不称clean。

## 后继同事务冻结协调（仅新入口）

[维护源](editor-backend-definition-freeze.md)：实际scope/actor-epoch-role/本完整声明门在原Job-Draft冻结前后sameStorage outertransaction重查，late原生index/epoch/row失败全回滚、synthetic tuple分立；missing freeze表在constructor之前拒而不自动重建history。fresh11组88调用/4facts、482声明480旧全保/97imports；本原observer、旧Root/freezes未改、不自动升级。工程SQL skeleton非Source/enqueue-save/nativePUT，row/ref/drain/delete仍false，无新表/公开route。

## 后继当前三声明FK行（仅新门）

[维护源](editor-backend-declared-fk-rows.md)：在本观察器sameStorage事务前后真实重验，新增三固定关系有界JOIN及actualactor-epoch-role；13组50调用/4facts、temporary deferred低层缺父/rollback、fullservice先拒defer及lateSQL/预算/restart/epoch有证，Node7模型分立。484声明482旧含375全保/98imports，本observer/Root/所有旧门全保持，不自动保护；只foreignKeyRowsVerified，完整row/ref/drain/deletefalse，无新表或repair。

## 限制与下一出口

480声明/477旧全保（含375玩家）、96imports；当前布局仍35/243。仅当前DDL文本/索引与FK元数据/当次enforcement，不检查现有行全FK一致、全部CHECK值或共享历史引用、初始化及权限数据全闭包；不扩展为完整数据库语义证明。旧原93当前读取流程源码和期待全保护，产品旧源未改，无关20章/media/browser/原规则不重复跑。

下一步仍需全refs/writer/read/body/CPU/legacy、native未知结果保守处置、专属幂等物理清理/readback、SQL/receipt scrub、最小completed410、cache/实际backup/隔离恢复；RuntimeManifest/255/Trial/发布/完整工作台和初始化原证等目标继续。无commit/push/deploy/cloud/install/trust、DOS SAVE/真实profile-IDB/秘密、公开Rootroute、表迁移、TTLrepair、delete/410或共享清理，主goal active。
