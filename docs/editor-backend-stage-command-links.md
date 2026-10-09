# E-01-BACKEND-STAGE-COMMAND-LINKS-1 — Stage HTTP目标/现存proof（历史限定）

**当前后继现有冻结纳[copy HTTP actor/key关联/现存proof](editor-backend-copy-command-links.md)**：exact46/CLI146检查1167调用/19facts/504输入111imports，target allocation actor/op_key成对非jobUUID，缺proof保legacyfalse，storedHTTPepoch不allocation/currentowner，不授原method-path-expected/run-cancel。原Stage helper和waiter源码未改，本批无新Stage/copy asyncwait覆盖，Root/其它提交未升级，全ref-native-deletefalse。下文43/130/503/61a1571e为本历史切片。

## 原Web合同与范围

`stageapi.js#command49-58/write60-71`只在run写Stage HTTP命令，并在rowCAS和execute前同SQL记command/target/proof。enqueue/retry走CompileJobs操作，因此不要求每job有run命令；已绑定记录不证明执行成功。原request digest覆盖game/purpose/job/action/expectedRevision，但其中purpose/expected没有原样存列，不能从当前row/pipeline重造preimage。

`commandtargets.js#binding16-19/verifyRelation22-38/record43-63`原stage target按actual actor/job找到game，HMAC覆盖原JSON数组`http-command-target-1,kind,actor,key,game,target,digest,storedEpoch`。缺proof返回false（legacy-unsealed），已有坏proof拒，只有合法原调用交易可补；观察不repair/reseal。旧epoch不绑当前owner。Root.contentKey247-253原同actor/key namespace冲突门保，不据静态callgraph遗漏声明Stage调用不存在。

新增`deletionstagecommands.js#inspectStageCommandLinks`只读选择当前canonical TEXT game jobs、显式stage target/proof及反向指向当前job的行，选其command：native BINARY owner/actor/key/game/job、exact command/proof关系与原domain HMAC验证。未绑定的旧命令、已删除/移出当前job、typed别名、跨game共享/全部历史反向仍未知。copy-kind与Stage request-preimage/run-success/Sourcebytes不在本证书。

现有ValidatedFreeze两次pure checks（末次在全部外部principal callback后）纳新检查；原outerSQL/两freeze-HMAC/actual final session/schema/scope不改。现有两waiter源码不变，依赖现有类自动走新检查，但本轮不把源码依赖签成新Stage异步场景覆盖或重跑23wait-case。Root/其它coordinators/submit路径不自动升级。

## 事实与预算

exact43=此前40加`stageHttpCommandLinksVerified:true`、`stageHttpProofBindingsVerified:(unsealed===0)`和`stageHttpUnsealedTargets`。mode `CURRENT_DECLARED_SQL_AND_STAGE_HTTP_LINKS_FREEZES_ATOMIC_LEGACY_UNKNOWN`，缺proof留下unsealed1/verifiedfalse，不升级完整历史；vacuous0亦非权限或完整引用证明。retryRequestDigestsVerified/indexContentIntegrityVerified/rowIntegrityVerified/nativeDrainVerified/deleteAllowed恒false；原pendingjournal1unknown。

DB32MiB/各selectedfamily10000/总20000、投影严格字段/LIMIT10001、逐关系fixed LIMIT2、HMAC编码8192 UTF8B。固定QUERY/TARGET/KEY/ROWS/PROOF/BUDGET503，不返SQL/内容/服务key/全局count；非heap/CPU/provider SLA。只用实际trusted coordinator捕获服务key，不来自DTO。

## 当前证据

唯一前继[等待入口整合](editor-backend-validated-waits.md)生产receipt `39ddfaf852651db716028d24625815f6372d503a45cd07fb085b269037e481e9`，502/109/375全哈希核；原coordinator/focusedtool先wx归档，新helper与owned `backend-stage-command-links-session-r1`，503声明/500旧保/110imports（108旧保）。无schema/产品route/正常Source-stage执行/R2/UI/游戏机制改动。

一次fresh **main-r1 130检查1030记录HTTP调用/16exact43 facts/44报告源/4同期wx执行源**，沿原oldCLI同process委托。原115字符串/状态错误-hook8/10-预算/全35行目录databaseSize/两executors-sealsrollback保持。11真实坏command字段/actor/key/target/MAC/反向错game/孤立proof精确503且badSQL不改；实际原`HttpCommandTargets.record`生成sealed工程关系，存37/currentowner不同epoch正例；缺proof保unsealed1/false；两seals后与末callback DELETEbound command精确ROWS503/全SQLrollback。

工程command digest为opaque d64与手工job，不是假装原Stage.run preimage或成功compiler/Source/PUT；实际record只签其持久绑定。原所有job并不自动seed stage，原enqueue/retry正例保。

Node完整35DDL**24检查**，独立literal原domain HMAC/stored37-current100、12错字段/type/反向/MAC、missing/orphan/legacy无写、invalidkey与实际10001jobs/32MiB内预算；size/query/cursor为synthetic。Node page pragmas不冒workerd/Root能力。当前model/helper执行前wx捕获、三sourceSHA/meta0；无native/model producer失败，不盲重跑或延预算。

source原件/精确派生及两source-delta反向/全部history/imports/主动LSP-session-all/syntax-diff/links73Q、人工审过3965B固定jev-1.13.0 advisory另签；silent/unavailable不clean。原tool/runner保留历史COPY print标签，不据console标签误称scope；当前43facts与130场景为准。

## 静态诊断更正（非native失败）

static-r1 collector在whole-file查first await service.execute，实际更早另一个方法也调用execute，误报order断言。源/log/meta保；仅把顺序证书限定到已实际读取的async write body并要求两anchor存在、r2重审，不改helper/产品/native/model/期待/预算，不重跑native碰绿。failedstatic四输出另签SHA。

## 仍开

完整请求preimage/成功receipt/typed别名/未绑定-孤立移出job跨game/shared-history全部namespace引用、Source/pinnedpolicy/Root全部提交协调；writer-read-body-providerCPUlegacy/external/未知journal；专属delete-readback-scrub410/cache实际backup隔离恢复；RuntimeManifest/Q69/255/认证Trial/release/fullworkbench/原初始化/全73Q仍open。无commit/push/deploy/cloud/install/trust/真实SAVE-profileIDB/共享清理，主goal active。
