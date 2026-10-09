# 固定索引/表投影一致性（E-01-BACKEND-INDEX-PROJECTIONS-1，限定）

接续[共同SQL冻结](editor-backend-validated-freeze.md)与[唯一键行](editor-backend-declared-unique-rows.md)。新增`server/deletionindexprojections.js`和显式工具；492声明/490旧含375玩家保持/102imports。旧Root、全部观察/冻结/行检查/读写等待未变、不自动继承本保护。无新schema、公开产品route、R2正文、Source或删除能力。

## 可复核范围

固定35隐式索引/33表来自已封存完整定义oracle，不从坏运行态重推。actual认证Worker探针确认全部`INDEXED BY`、`NOT INDEXED`、`EXPLAIN QUERY PLAN`和SQLite类型/hex/数字表达式：35个单行`SCAN 表 USING COVERING INDEX 索引`计划，7投影行。只是能力characterized，不代业务证据。两个INTEGER PRIMARY KEY rowid别名表不在范围，SDK未准许的integrity_check不绕过。

每固定键比较两条原生只读查询：原表NOT INDEXED与指定声明索引INDEXED BY。索引计划必须精确覆盖索引扫描；不是只凭hint猜未回表。每行按safeInteger `_rowid_`关联，再核原生`typeof`/`hex`和数字分支；不比较顺序、不拼JS键。原生hex保TEXT/BLOB字节，不凭UTF解码后的替换字比较；NULL行由不同rowid区分，BLOB x61与TEXT a不同。数字仅接受finite real/safeInteger integer，无法无损表达即拒，不能据此扩SQL或业务值域。

增量消费实际SQL cursor，超每表10000/总表行20000、DB32MiB或每对投影累计64MiB UTF16字符串/数字计量即503 DELETE_INDEX_BUDGET；后者是编码投影计量，不是整个JS heap/CPU云SLA。坏query/投影/迭代503 DELETE_INDEX_QUERY，非覆盖计划DELETE_INDEX_PLAN，缺/重复rowid或不同投影DELETE_INDEX_ROWS。SQLite原文与全局键/行数不出owner DTO。相同逻辑投影不证明全部索引页、存储底层、CHECK/FK/UNIQUE/business-ref或历史外部操作完整。

## 当次权限和后置重核

`GameDeletionIndexProjections.observe`严格gameId/expectedRowRevision、单次primitive捕获，actual storage.transactionSync；真实Root principal捕获id/epoch/role/mustChange并每回调重查。原schema observer先核owner/admin/builtin/UUID/fence-unlisted-usedID/CAS及70对象35表243列35索引3FK/enforcement，首遍每表后核实际scope/定义；末次外部principal之后再无外部回调扫描。

最后只用内部实际SQL session/user查验原Root `worker.js`的epoch/disabled/absolute-idle/mustChange/identity，再经原observer重查真实schema/fence/row，最后实际session SQL再查一次。未相信最后外部回调此前的DTO。实现前复核曾只有末次session而缺scope重查，保未执行旧新模块/core后补该内部gate；本轮后置row/index负控实际证明新路径，**不**追认旧草稿已经通过该场景。

exact14：原11加indexProjectionsVerified=true/indexesCompared=35/indexContentIntegrityVerified=false，mode `CURRENT_DECLARED_INDEX_PROJECTIONS_ONLY_LEGACY_UNKNOWN`。rowIntegrityVerified/nativeDrainVerified/deleteAllowed仍false；不是receipt/权限/完整索引物理完整性证明。后续使用必须自己在实际事务重验。

## 当前证据

owned`.dragon-analysis/editor-phase/backend-index-projections-session-r1` wx before/固定键/probe/源/log/report；OS白名单子环境、已装MF/OpenSSL/NodeSQLite、随机owned tempSQL-R2/loopbackHTTPS8787，1800s不延。父fixture只初始化原两freeze表，SQL skeleton/工程journal/过期session/NULL操作键不是Source、正常新建、真实PUT或业务ID准入。

一次fresh main-r1 **18组61记录HTTP调用/5exact14 facts/9报告源/3wx源码**，全部490/101前后SHA相同：

- actual权限/严格字段/fence/CAS及Cookie/Origin/CSRF；owner/admin同最小facts，无业务行变化。
- native健康索引实际读取、原表与覆盖索引投影相等；两NULL加BLOB/TEXT工程键经生产比较器通过并由fixture仅清自己样本。
- 五个**明确synthetic** cursor/计划变换：bytes、missing、duplicate、rowid、非覆盖plan精确503。这是实际SQL结果的受控投影负控，**不是**损坏native索引页或持久索引腐败证据。未执行writable_schema/破坏页/defensive或权限绕过。
- 首表后actual index/Game row/epoch；最后外部callback37后actual index/Game row/epoch/idle expiry/10001 session预算，各精确503/409/401、全部35表行/目录rollback；后置scope与session在captured DTO之后仍实查，hook诊断不是provider状态。
- actualworkerd restart和真实改密old401/newfacts，publicdelete404，未重复旧18以外的rowchecker/93/20章/browser/media/原机制完整套件。

Node独立完整35DDL健康索引模型10组：原空表/33callback、NULL-BLOB-TEXT、真实10001和10000+10000+1预算；索引delivery逆序/类型差异/坏hex/大rowid/size-query/64MiB计量是synthetic。不是workerd authority或native损坏证明。主producer、探针、Node无执行失败；pre-main新草稿scope补门原件保，不拼旧green。

适用主动LSP/session-all、SHA/固定oracle/生成源码/派生prefix/当前snapshots/语法/diff/MD链接73Q/隐私审过最小Jev另签；silent/inconclusive/unavailable不称clean。无commit/push/deploy/cloud/install/trust、真实SAVE/profile-IDB/秘密或共享清理。

## 后继当前业务name/ID绑定（原投影门未升级）

[维护源](editor-backend-name-bindings.md)：新增独立目标game当前draft/nullable-formal BINARY名称恰等distinct数量、owner/game完整占用和usedID一条，actualauthority/schema/fence事务与末次callback后实际session/scope/binding重查；29组97调用/8facts和Node8/temporary去约束重复membership分立，494声明492旧375玩家保。原投影服务/Root/全部门不变未整合，fullrow/ref/native/deletefalse，不借name正例扩indexContent/其它game/全历史证书。

## 后继已接现有ValidatedFreeze（非所有入口/物理页）

[维护源](editor-backend-bound-sql-freeze.md)：原低层逻辑index与当前name-usedID纳入现有SQL两冻结/HMAC的actualoutertransaction前后检查，最后外callback后actualsession-scope/定义/纯扫再session；现有CLI fresh22组155调用/5exact27 facts，原15期待保持，真实names晚删/lastrow变动全35行目录size-sealsrollback，两synthetic index结果分立。495声明492旧375玩家保/103imports；本文只读service不变，原“所有旧门未变”仅为当批历史，当前不套已改ValidatedFreeze。Root/其它freeze-wait未接、physicalindex/fullrow/ref/native/deletefalse。

## 仍开

完整物理索引/低层完整性、business/command-receipt/shared历史refs与一致冻结/提交整合、全部writer-reader-body-provider-CPU/legacy/external闭包，专属幂等物理cleanup/readback/SQL收据scrub/410/cache实际backup隔离恢复，RuntimeManifest/255/Trial/release/工作台/初始化原证仍未完成。主goal active；不以本投影事实开放删除。
