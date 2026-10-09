# 当前游戏名称与永久ID绑定（E-01-BACKEND-NAME-BINDINGS-1，限定）

接续[索引/表投影](editor-backend-index-projections.md)。这是第一段具名业务引用核验，不是再跑SQL约束套件，更不是完整引用图/物理删除。只新增`server/deletionnamebindings.js`与显式工具；494声明/492旧含375玩家保持/103imports，旧Root及所有门/冻结/等待未变，不自动继承本检查，无新schema/公开产品route。

## 合同与实现

来源：产品Q26及工程§1.1，实际`server/metadata.js` constructor的content_games/content_names/content_used_ids声明与`#names/#create/#save`：同作者BINARY草稿名和nullable当前formal名均占用，同游戏相同名只一行；不同作者可重名；创建记录永久不复用ID。不是DOS机制。本门不修改原写者/正规化、字符可玩域、正式发布或其它指针合同。

低层`inspectGameNameBindings`仅对已经捕获的目标原生TEXT gameId核：
- 实际parent owner/draft字段TEXT、formal为TEXT或NULL；不替name合法字符/trim/NFC检查。
- NOT INDEXED used-ID投影LIMIT2恰一行；名称投影LIMIT3须恰等于SQL CASE导出的当前distinct名称数量（NULL/共享formal为1，否则2），不只依声明UNIQUE排除重复membership。
- 两个实际SQL EXISTS谓词分别拒额外/foreign-owner/错误game/type占用与漏草稿/非NULL formal；全部BINARY原生比较，不拼JS复合键/大小写折叠。共享同名两EXISTS可指同一行，不要求两个重复占用。
- 每个投影最多3行，DB safeInteger非负、32MiB工程预算；坏query/投影503 DELETE_NAME_BINDING_QUERY、引用坏值DELETE_NAME_BINDING_ROWS、尺寸超限DELETE_NAME_BINDING_BUDGET。不存在自动修复。无名字/全局键/SQLite原文输出。

`GameDeletionNameBindings.observe`严格gameId/expectedRowRevision，单次primitive捕获；same actual storage.transactionSync内真实Root principal pin id/epoch/role/mustChange，原schema observer先核owner/admin/builtin/fence-unlisted-usedID/CAS/70对象35表243列35索引3FK。首次binding检查后真实scope/定义及最后外部principal回调重查；之后以内部实际session SQL匹配原Root.policy，再重查scope/schema并无外部callback扫bindings，最后再实际session SQL，无await/外部callback可插在最终权威后。旧DTO不赋权限。session策略来源为受保护`worker.js#principal`的disabled、user/session epoch、absolute/idle、mustChange，未引入第二套登录。

exact13 facts：原schema11加nameBindingsVerified=true/usedIdBindingVerified=true，mode `CURRENT_GAME_NAME_ID_BINDINGS_ONLY_LEGACY_UNKNOWN`。rowIntegrityVerified/nativeDrainVerified/deleteAllowed仍false，无当前名称数量或内容。不检查所有其它game/历史release/command/receipt/ref，也不将BLOB game-id按TEXT重贴身份；这些别名与全历史闭包仍未知。不能缓存facts当后来事务授权。

## 实际证据

owned`.dragon-analysis/editor-phase/backend-name-bindings-session-r1` wx before/源码/log/report；OS白名单子环境、既有MF/OpenSSL/NodeSQLite、random owned tempSQLite-R2/loopbackHTTPS8787，producer1800s不延。所有492输入/102imports前后hash相同。父fixture只初始化原两freeze表；SQL skeleton不是Source/正常新建；手工formal字段及双名称是占用工程样本，current_release_id不因此成为有效发布。

最终fresh main-r3 **29组97记录HTTP调用/8exact13 facts/11报告源/3wx源码**：
- actual owner/admin/foreign/builtin/严格字段/UUID/mandatory fence/CAS及Cookie/Origin/CSRF，owner/admin相同最小facts；只读时全部35表行/目录fingerprint同。
- native单草稿、formal同名一行/不同名两行/恢复NULL；不同真实作者相同拼写不污染目标。
- native丢占用/额外名/foreign-owner/错误game/大小写/BLOBname均503、missing used-ID由原scope409；第三额外名拒，全部事务行/目录回滚。固定工程非法owner/game样本无FK声明，但不是用户授权写入口。
- 首次检查后principal3实际丢name/ADDindex/epoch；末次external callback4实际extra-name/case/owner/usedID/index/game row/epoch/idle expiry/role，精确503/409/401，hook.firedAt独立记录序号，全部35行/目录rollback；最后pure scan及内部实际scope/session不信已捕获DTO。
- actual workerd/DO restart，真实password handler旧epoch401/newfacts，publicdelete404，未开放410/物理清理。

r1在前13check（含七实际坏引用rollback）后失败，**只**在新手工formal样本distinct→NULL且其它作者行存在时hash不等。原state以SELECT * ORDER BY rowid哈希；fixture删除再插全部target names使相同逻辑行重排。保r1三源/日志/failure/fixture-r1及failure-analysis；独立owned NodeSQLite两作者模型验证排序差别，明确不是native原行dump。只修新formal fixture保现有草稿占用、删旧formal并仅插缺名，原完整fingerprint断言/产品/期待/预算保持，r2全fresh重验，不接受不同hash碰绿。r1/r2产品和producer byte同。之后人工复核独立cardinality缺口：旧1..2检查会依声明UNIQUE排除同名重复，保module/producer/fixture-r2及cardinality-review，补原生CASE expectedNames恰等count，新独立temporary native去content_names唯一声明后重复membership低层503/全schema-rows rollback（不是持久native坏页或fullservice接受漂移）；r3全29fresh、前28check字符串精确同。没有放宽任何旧期待或预算。

Node简化三表模型最终8组（旧7源/report保，新增独立无唯一约束重复membership拒）：实际single/shared/distinct、BINARY/crossowner、六坏绑定、第三name/nonTEXTformal；size/query/nullprojection是synthetic。不是完整35表或Root/workerd authority。未重跑封存18/93/各SQL checker全轮、20章/媒体/browser/原机制套件；旧源无变不拼兼容成绩。

主动LSP/session-all、SHA/原metadata写者/实际Root session策略/派生prefix/当前快照/语法/diff/链接73Q与隐私审过最小Jev（3567B初版与当前含cardinality摘要）另签，silent/inconclusive/unavailable不称clean。无commit/push/deploy/cloud/install/trust、真实SAVE/profile-IDB/秘密或共享清理，无R2正文/staging/实际PUT/save/enqueue。

## 后继已接现有ValidatedFreeze（非所有入口）

[维护源](editor-backend-bound-sql-freeze.md)：原低层name/usedID与35逻辑index纳入现有SQL两冻结-HMAC的actualoutertransaction前后检查，最后外callback后actualsession-scope/定义/纯扫再session；现有CLI fresh22组155调用/5exact27 facts，原15期待保持、真实names晚删/lastrow变动和全35行目录size-sealsrollback、两synthetic index结果分立。495声明492旧375玩家保/103imports，Root/其它freeze-wait未接，physicalindex/fullrow/ref/native/deletefalse。本文原只读service不变，原“所有旧门未变”是本批历史，当前不套用于已改ValidatedFreeze。

## 仍开

正式指针/内容-command-receipt/全部未声明与shared历史引用、其它game及typed别名、全business/物理索引/低层row完整性，与Root/其余冻结/提交共同整合（此现有ValidatedFreeze限定整合见上）；全部writer-reader-body-provider-CPU/legacy/external闭包、exclusive幂等physicalcleanup/readback/scrub410/cache实际backup隔离恢复，以及RuntimeManifest/255/Trial/release/工作台/初始化原证。主goal active，旧入口未整合，不能以此事实开放删除。
