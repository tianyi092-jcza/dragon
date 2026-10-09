# E-01-BACKEND-COMPILE-OPERATION-LINKS-1 — 目标任务所选持久操作链接（历史限定）

**后继当前现有冻结已纳[bound Stage HTTP关系/已有proof](editor-backend-stage-command-links.md)**：exact43/130检查1030调用/16facts/503输入110imports，缺proof保legacy unsealed1/false、不把run binding当成功、不重造旧purpose/expected。原compile helper未变仍retry false，下面40/115/501为278ad历史；Root/其它coordinator未升，waiter源码不改依同类但未新Stage异步case，完整refs/native/deletefalse。

## 原Web写者与限定范围

`server/deletioncompileoperations.js#inspectCompileOperationLinks`接已有ValidatedFreeze共同checks首末/最后callback-free扫描，原两freeze/HMAC及实际scope/session/schema/fence门保持。不是新观察器/表/产品route；Root/其它coordinator/wait不变，[前继copy永久槽](editor-backend-copy-operation-links.md)规则保持。

- `jobs.js:9–15/73–84`：canonicalSourceTokens规范token，字符与UTF8字节各65536上限，Node createHash SHA256 UTF8；enqueue digest字段为method/gameId/draftRevision/scope/pipeline。actualsaved requested修订，同SQL插job+原enqueue operation；不latest。
- `#retry132–144`添加同job多个retry操作，不改原enqueue；摘要preimage含旧expectedRevision，但operation只有actor/key/method/digest/job_id，不存expected/authEpoch/gameId。因此**不能从current row_revision重造retry摘要或给孤儿确定归属**。
- `datacompiler.js:20–35`、`imagejobs.js:14–23`、`fallbackjobs.js:14–27`三个家族delegates原CompileJobs与trustedpipeline/operationGuard；其余pipeline policy、checkpoint、Source/R2和实际目的选择不由此新检查认证。
- `stageapi.js:48–69`run HTTP命令另存stage_http_commands/HttpCommandTargets，retry走CompileJobs.retry；不是同一namespace，不能据compile操作猜run历史或purpose。

仅canonical TEXT目标game的typed jobs及指向这些job_id的操作：native SQL BINARY actor/job关系、key/method/hash表示，每job恰一enqueue且canonical UTF8摘要精确匹配。允许多retry/后来row变动；孤儿、移出的job_id反向、typed BLOB/game别名、所有namespace/shared历史/Source bytes/实际policy未认证。JS Map只持canonical UUID ASCII jobId单键，不拼actor/job复合键、不normalize。

DB32MiB/每表10000合计20000、原canonical record64KiB预算，QUERY/TARGET/ROWS/BUDGET固定503不泄SQL/内容；工程预算不是heap/CPU/provider SLA。

exact40=前继37加`compileJobOperationLinksVerified:true`、`enqueueRequestDigestsVerified:true`、`retryRequestDigestsVerified:false`；mode `CURRENT_DECLARED_SQL_AND_COMPILE_OPERATION_LINKS_FREEZES_ATOMIC_NATIVE_UNKNOWN`。原indexContent/fullrow/nativeDrain/deletefalse、pendingjournal1unknown。事实/hash/seal不能授权后续删除。

## 当前证据

前继receipt26514fc387915f6816ee2403a087cf4badaf86da2f27acb0c259e5dc91e02360；owned `.dragon-analysis/editor-phase/backend-compile-operation-links-session-r1`两旧源先wx归档、before完整旧500/108图、375玩家保护。固定白OS环境/已有MF-OpenSSL-NodeSQLite、自有tempSQL/R2与loopback、oldCLI同process委托、1800s/四实际执行前wx源；无依赖安装或预算延长。

一次fresh **main-r1 115组913记录HTTP调用/14exact40 facts/40报告源/4同期wx源码**：原105字符串、权限/error/hooks8/10/预算/全35行目录databaseSize-sealsrollback期待保。七missing/duplicate/actor/key/method/digest/movedjob_id坏关系beforeexec精确503且坏数据保；两seals后/末callback实际DELETEenqueue拒、全SQL和原两executors/sealsrollback。一原enqueue+3不恢复preimage的retry和row100正例，retry验证明确false。所有skeleton仅显式补工程enqueue行，不是正常enqueue/compiler/Source/PUT。

Node完整35DDL独立模型**18组**，literal排序JSON UTF8 SHA oracle不调用产品canonical摘要来规定期待；实际坏字段/BLOB/missing/duplicate、多retry/row100/vacuity与10001operation预算，synthetic size/query/nullcursor另标。模型/helper实际执行前wx源码和三sourceSHA/meta绑定；Node page pragmas非workerd/Root能力。无native/model producer失败，不拼历史green。

工具result/runner的继承复制打印标签只作历史shell输出，范围以本次实际40字段/105旧+10新场景/本维护源与独立static receipt为准；不宣称重跑完整copy源码/媒体。当前501声明498旧375玩家保/109imports，35表243列70对象不变。主动LSP/syntax/diff/links73Q/SHA/Jev另签；silent/inconclusive/unavailable不clean，未跑检查不冒通过。无UI/玩家/媒体/原规则变化，不跑无关browser/gameplay。

## 仍开

retry preimage、孤儿/typed/reverse/crossgame/shared/historical/所有namespace/HTTP命令/完整receipt与Source-policy字节；全部Root-submit/coordinator/wait；body/provider/CPU/legacy/external/unknownjournal；exclusive physicaldelete/readback/scrub410/cache/实际backup及隔离restore；RuntimeManifest/Q69/255/认证Trial/release/fullworkbench/原初始化和73Q均open。无commit/push/deploy/cloud/install/trust、真实SAVE-profile-IDB/共享清理；主goal active。
