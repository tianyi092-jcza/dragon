# E-01-BACKEND-KEY-NAMESPACE-AUDIT-1 — Root持久幂等键族核验（只读）

## 范围及生产基线

生产源全部不改，唯一生产receipt仍`backend-copy-command-links-session-r1/static-receipt-r1.json`/`6d6195a928e55a2a6327e48ac73b1dc29735731d8acbfe639b8c7257663c8a89`，504输入/111imports/375玩家/35表243列70对象。owned `backend-key-namespace-preflight-r1`审计receipt不是新生产基线，不授物理删除或整目标完成。

本批实际调用原Root `EditorMetadata.contentKey`，仅owned新测试route，认证admin、Cookie/Origin/CSRF原守卫保留。temporary工程SQL每case实际guard前后完整行/目录/size不变、sentinel rollback全部35表恢复。无Game/Source、实际copy/draft/compile/run/cancel/deletion成功、R2正文或玩家状态；正常测试账户创建是隔离profile中的原账户API，不冒作者内容操作证明。

## 实际写者/边界

- `worker.js#contentKey247-253`：先验证16..128 ASCII key；非delete族总查content_deletion_operations；有adminCopies时查七族。**copy HTTP为command，Stage HTTP为stage-command，不是同族**。

| 族 | 持久表 | actor列 |
| --- | --- | --- |
| auth | operations | actor |
| source | source_operations | actor |
| copy | content_reservations | actor |
| command | copy_http_commands | actor |
| draft | draft_requests | actor |
| compile | compile_operations | actor_id |
| stage-command | stage_http_commands | actor |
| delete（前置特别门） | content_deletion_operations | actor |

- 原匹配为actor+op_key，自己的族跳过，其它族冲突409。另一个actor同字符串key不冲突；SQL记录是否expired不参与contentKey。`operations.expires_at=0`仍被其它族阻止，自己的auth允许通过**键门**，不代表replay/canCommit允许过期操作：`worker.js#replay288-292/#canCommit294-301`另拒OPERATION_EXPIRED，不能据namespace通过清除/续用旧记录。
- `worker.js43-76`实际Root装配：两个catalog同source族；PrivateDrafts传draft；data/image/fourfallback ports传compile；StageJobsAPI传stage-command。`StageJobsAPI.write60-69`enqueue与retry走服务compile，而run先command binding后CAS/execute走stage-command，不授run成功。
- `jobs.js36-46/#key62/#operation63-66`**底层CompileJobs只校自己的key/操作，没有跨族guard**。真正三个生产wrapper在`datacompiler.js26-35/imagejobs.js21-24/fallbackjobs.js25-28`原sameSQL调用guard再委托enqueue/retry；不能以底层工程job样本认证全局键族一致或把core单独行为称生产漏洞。
- `sourcecatalog.js#install64-81`在verify await后sameSQL重查actor+operationGuard再查/写原source_operations；PrivateDrafts.save160-164及177-191在初始请求与最终commit各有guard。
- `content_operations`不是Root七族之一。`metadata.js#transaction115-146`允许与匹配create/new reservation共存，或由PrivateDrafts.save同key写保存receipt；不把metadata companion算新namespace。`GameDeletionFence.begin39-44`还另外查operations/content_operations/content_reservations，且调用trusted operationGuard；所以**Root scanner允许metadata-only不是删除许可**，本批不声称实际执行该额外fence门。
- 无adminCopies时，原Root在delete前置门之后提前返回，跳过七族；这是原装配边界而非configured生产例外。字段临时置null只在owned case中，finally恢复原实例，未改任何生产装配。

这些是当前Web业务证据，非原DOS机制；不推断完整旧schema/future/external/反向shared引用或未归属metadata历史。

## 当前受控原生验证

最终fresh probe-r3 **7检查/158记录HTTP调用/146实际guard矩阵/13报告源SHA/15同期wx执行源**，一次独立tempSQLiteR2/HTTPS8787会话、白OSenv/已有MF-OpenSSL/1800s，无Source/library staging或nativePUT-GET。

- 64同actor：八族×八requested族，自己的族200键门，其它每个409IDEMPOTENCY_CONFLICT（auth样本epoch37/expiry0，判断前后原行保）。
- 64另一实际author：相同key各族都不与admin冲突；不按key全局合并人/引用。
- 8 metadata-only：Root七族scanner均不拦，不能推广到fence额外门或真实save/create权限。
- 8 absent-adminCopies：前七族跳过、delete前置仍409；配置只在owned实例中临时恢复。
- 2非法key：422IDEMPOTENCY_KEY；实际匿名401、wrongOrigin403、独立badCSRF403。正常Root方法outcome存于result，HTTP200仅owned审计route成功，不冒正常生产操作成功。
- 每个case guard执行前后全SQL fingerprint相等，然后明确sentinel rollback，probe组间再核35行/目录/databaseSize。未做corruption/repair/schema操作或清理任何expired/pending/uncertain记录。

失败原件全留：r1 4调用1检查/0矩阵，newfixture把六字段case shape施于只有action的fingerprint，原security.fields正确422REQUEST_FIELDS；只新fixture按action分1/6字段。r2 157调用6检查/146矩阵，new HTTP helper把故意badCSRF覆盖为session合法token，正确200与期待403不符；只helper在session之后重新应用explicit extra，原403期待/Root/fixture/预算不改。最终r3完整fresh；15实际wx源码/全部log/meta/failure与两个最小inverse另签，不盲重试。

## 验证纪律及接续

生产504/111/375及历史hash、两个新增维护文件/原清单archive、源与失败最小diff、当前13/15SHA/146矩阵、syntax/diff/links和支持文件主动LSP/session-all另签。silent/inconclusive/unavailable不是clean；纯只读audit不用Jev，不新增rule suppression/ignore/cache/trust。

下一步须分别限定**正常生产已关联目标键**与工程core/metadata-only/未归属历史，才可构造当前freeze内的namespace一致性检查；不得直接把本矩阵200/零数、Root键门或某表存在当全引用闭包、权限或delete/drain证书。全部其它Q、Source-pinnedpolicy、provider/body/CPU/legacy/external、实际物理清理/410/cache-backups、RuntimeManifest/255/Trial/release/workbench/原初始化仍open，goal active。
