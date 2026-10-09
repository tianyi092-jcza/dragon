# E-01-BACKEND-COPY-ORIGIN-LINKS-1 — 复制来源/初始快照/回执关系（历史限定）

**后继当前现有冻结已纳[committed保存回执链接](editor-backend-draft-receipt-links.md)**：exact35/CLI82组655调用/12facts/499输入107imports，同SQL actor/key operation-原JSON与exactresult snapshot/expected/no-op/+1；65位进位有源与独立样本，历史epoch与旧saved不绑current/latest。原copy helper本身未变；下文34/59/498为ffbd本历史切片，Root/其它门不变，fullsummary/ref/native/deletefalse。

## 维护范围与来源

实现：`server/deletioncopyorigins.js#inspectCopyOriginLinks`，接入现有`GameDeletionValidatedFreeze#checks`的原首末共同事务扫描（含最后外部principal callback后的无回调扫描）。[前继saved/job](editor-backend-saved-job-links.md)及原两冻结/HMAC/实际scope-session门保留。不是新观察器、产品route、schema或物理删除能力；Root/其它coordinator/wait未升级。

原Web业务写者而非DOS机制：

- `admincopy.js#source35`捕获request与实际catalog status定义/root及profile修订；`#execute89-111`同事务创建Game/snapshot1、origin十字段、copy_objects committed和request committed/result。
- `#result54-58`用精确snapshot1（不latest）与origin核四字段JSON回执；origin.source_digest等snapshot.sourceDigest，origin.registry/catalog等request。新增其它等式来自同次writer参数，不凭观察补规则。
- `#write79-83`SHA的是canonical Source UTF8 chunks，返回的root是**索引**对象SHA/长度。`copyprofile.js#digest22/verify75`同canonical tokens SHA；`snapshots.js#verify20-63`核相同chunks Source SHA，另返索引rootDigest与dependencyDigest。因此origin.source/dependency等初始snapshot，而**baseline_root与baseline_digest不是同种摘要，snapshot rootDigest与sourceDigest亦不强等**，不可强绑。
- `sourcecatalog.js`installed_sources共享registry父，registrar不是目标Game owner；SQL equality不能代实际pinned policy/catalog媒体字节审批。
- pending/canceled/abandoned preGame allocation不保证origin/snapshot，本检查只对existing canonical TEXT目标；原freeze已经另核copy状态。无copy请求且无origin明确vacuous通过，不宣称普通Game为copy。

## 固定检查和事实

原生NOT INDEXED/BINARY/TEXT连接：目标请求/origin互为恰一；request.actor等Game.owner；committed request、origin.registry/definition/catalog/profile等request，installed同registry/definition/root；origin.source/dependency等同game **revision1**；baseline root/length有同game committed对象描述；该copy目标对象state均committed。origin实际SHA字段64lowerhex/长度正integer，registry/profile只核关系，不发新policy许可。typed BLOB别名/跨game反向/所有历史/shared引用仍未认证。

回执先SQL UTF8 byte长度至8192，再有限JSON.parse恰四字段/gameId/`'1'`/sourceDigest/baselineDigest。允许空白/键重序，与原reader decoded JSON语义一致；不冒严格Source JSON或重复key拒收。DB32MiB、目标对象/快照每表10000/总20000、请求/origin/catalog LIMIT2，query/rows/receipt/budget精确503，不回raw SQLite错误、内容或全局count。预算非heap/CPU/provider SLA。

当前**exact34**=前继32加`copyOriginLinksVerified`/`copyReceiptLinksVerified`true；mode `CURRENT_DECLARED_SQL_AND_COPY_ORIGIN_LINKS_FREEZES_ATOMIC_NATIVE_UNKNOWN`。`indexContentIntegrityVerified`/`rowIntegrityVerified`/`nativeDrainVerified`/`deleteAllowed`false，pendingjournal仍1unknown。事实/hash/HMAC不是后续操作的权限或持锁快照。

## 当前验证与故障

owned：`.dragon-analysis/editor-phase/backend-copy-origin-links-session-r1/`，唯一前继receipt `c157134df359d96f95f6945df93783659e35912d86829d2cbfd864e28efe2ae4`。两旧源先wx归档，新helper/当前focused工具/fixture显式I/O；现有旧CLI仍同process委托，1800s及环境白名单不改。

最终fresh **main-r2 59组463记录HTTP调用/8exact34 facts/33报告源/4wx源码**，原45check字符串/权限/status-code/hook8-10/预算/全35行目录databaseSize-sealsrollback保持。11真实坏origin/request/catalog/snapshot1/baseline descriptor/receipt拒；当前draft2仍固定copy snapshot1，registrar独立与两种digest分立；两seals后/最后callback DELETEorigin精确503且全部SQL rollback。真实restart/password/old401/缺表不重建/公开delete404来自当前原场景，不追认全部writer/provider。

原六对象工程样本现在显式补installed/origin/receipt/snapshot/job三元组与两个copy对象描述；仍是**手工SQL，非GameSource/正常fullcopy/save/enqueue/nativePUT**。Node完整35DDL **36组**另标：无copy vacuity、各wrong/missing/BLOB/state、JSON parse/shape/重序/byte预算、revision1不latest、两row预算，size/query/nullcursor为synthetic，Node page pragmas不冒workerd支持。

首轮main-r1在23组/167调用失败`INTERNAL_ERROR\n\n500 !== 200\n`：新copy样本两个对象，而继承sha-fault把两行皆改bad-sha，原复合PK先冲突。独立native probe-r2九调用实际重现`UNIQUE constraint failed: copy_objects.game_id, copy_objects.sha256: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)`、全部行目录size原样；这是夹具诊断characterized，非业务PASS。仅新fixture拦截该旧fault，经相同Origin/Cookie/CSRF/admin门，改**单个baseline描述子**；产品/helper/producer/原期待/预算字节不变再全fresh。原首轮源/log/failure保。probe-r1输出拼接换行引号SyntaxError发生native启动前，源/log保，仅改输出String.fromCharCode10后probe-r2，不放宽SQL期待。

辅助probe runner沿用四capture路径（产品/helper/main工具/fixture），未同期单独快照probe.mjs：失败输出引号单行在stderr完整保，仅依据唯一精确编辑逆构`probe-failed-r1-reconstructed.mjs`，明确不是当时wx源码。probe-source-coverage.json记录该遗漏，当前probe的静态SHA是事后绑定，不伪造同期证据。两主轮实际四源码/33报告源覆盖完整，辅助characterization不冒主产品来源认证。

静态须核**498声明/495旧含375玩家/106imports**、两旧源归档及所有来源/历史/派生/反向diff/本轮源码，35表243列70对象无迁移；links/73Q/syntax/diff/LSP与最小Jev另签。silent/inconclusive/unavailable不是clean，无ignore/规则/缓存/信任修改。UI/玩家/媒体/原机制未改，不重复无关browser/gameplay。

## 未闭合

完整typed别名、跨game/shared/history/content-command-receipt/Source与依赖正文、实际pinned policy及所有submit/Root/waits；reader/writer/body/provider/CPU/legacy/external及unknown写；专属物理delete/readback/内容与receipt scrub/completed410/cache/实际backup/隔离restore；RuntimeManifest/Q69/255/认证Trial/release/fullworkbench/原初始化/73Q均open。無commit/push/deploy/cloud/install/trust、真实SAVE/profileIDB/共享清理或R2内容staging，主goal active。
