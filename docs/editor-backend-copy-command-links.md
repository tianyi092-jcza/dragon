# E-01-BACKEND-COPY-COMMAND-LINKS-1 — copy HTTP关联及现存proof（历史限定）

**现有冻结后继已纳[目标键跨族结构absence](editor-backend-key-namespace-links.md)**：exact48/155检查1239调用20facts/505输入112imports，六native选择/42固定actor-key对比，normalRootOriginfalse，不授全history/refs/delete；原copy helper未变，Root/其它提交/waiter源码不变且无新async覆盖。下文46/146/504属于6d6195a9历史切片。

## 来源与范围

`server/deletioncopycommands.js#inspectCopyCommandLinks`接现有ValidatedFreeze首末/最后callback-free检查，原actualstorage/principal-session/schema/fence/twofreeze-HMAC同事务保。原两个waiter源码未改依现有类；本批不冒新copy异步等待覆盖/旧23等待全轮。Root/其它coordinator/提交不变，无新observer/schema/产品route/delete410。

原Web业务证据（不是DOS机制）：

- `worker.js#copyCommand256-272`actualCopyAccess/contentKey/原epoch守卫，sameSQL INSERTcopy_http_commands和`commandTargets.record('copy',actor.id,op.key,target)`；随后273-281才replay/cancel/claim/awaitexecute。binding不证明run/cancel成功。取消可由新认证owner明确处理旧pending，但不是旧run授权。
- `worker.js#operation283-286`原digest是service MAC(JSON[request.method,requestURL.pathname,[value,expected]])；method/path/action/旧expected未全部独立存入command，不能从当前copy revision/state恢复preimage。
- `admincopy.js#reserve37-50`preGame allocation(actor/op_key)有合法key，独立gameUUID；`#cancel72`不要求所有历史allocation有Game/origin。**target_id是allocation op_key，需同时匹配actor，不是job UUID或全局唯一键**。
- `commandtargets.js#binding15-19/record38-54`原JSON-array域含kind/actor/command key/game/target/digest/storedEpoch，实际32B服务key/constant-time核existing proof。commandEpoch不强等allocationEpoch/currentOwner。

纯helper按当前canonicalTEXTgame选择copy_requests、explicitcopy target/proof或nativeBINARY反向actor+target键对，选对应command。固定TEXT/owner/actor-key-game-parent/command-digest-safeintegerEpoch和proof字段/MAC有界核验。没有JS normalization/composite字符串key，没有创建表/constructor/补签；缺proof保unsealed，不repair/reseal。preGame/其它game/typed alias/已删或移动parent/unboundcommand/全部共享历史未知，不从真空0推delete。结果true只是此限域关系。

DB32MiB，各四组最多10000/合计20000，NOT INDEXED/LIMIT10001，每关系LIMIT2、MAC payload8192UTF8B；QUERY/TARGET/KEY/ROWS/PROOF/BUDGET503不回SQL/内容/服务key。非heap/CPU/providerSLA。

## 当前事实与验证

当前exact46=前继43+copyHttpCommandLinksVerifiedtrue/copyHttpProofBindingsVerified(unsealed===0)/copyHttpUnsealedTargets，mode `CURRENT_DECLARED_SQL_AND_COPY_HTTP_LINKS_FREEZES_ATOMIC_LEGACY_UNKNOWN`。stage legacy状态独立保持；retryRequestDigests/indexContentIntegrity/fullrow/nativeDrain/deletefalse，pendingjournal1unknown。facts/HMAC不授后续操作权限。

owned `.dragon-analysis/editor-phase/backend-copy-command-links-session-r1/`；前继61a1571e/503输入110imports所有SHA先核，两旧源wx存。当前504声明501旧含375玩家/111imports（109旧），35表243列70对象不变。原oldCLI同process入口/1800s白环境/MF-OpenSSL不改，无Source-library staging/normalcopy-save-enqueue/PUT或用户数据。

一次fresh **main-r1 146检查1167记录HTTP调用/19exact46 facts/46报告SHA/4同期wx源码**。原130字符串和全部status-error-权限-builtin-UUID-fenceCAS-OriginCookieCSRF-hook8/10-预算/ALL35行目录databaseSize-sealsrollback/restart/password/missingtable/publicdelete404保。11真实坏command/proof/actor/target/逆game/orphan精确拒且坏sample原样；sealed/legacy1false/不同actor同allocation+HTTP两key正例；两晚callback删除实际copycommand精确503与原两executor/seals/全SQLrollback。

fixture工程copy已存在于原sixobject样本，实际production HttpCommandTargets在真实servicekey下record签名，command digest仍工程opaque、stored37；**非实际Root run/cancel/Source/正常copy/nativePUT成功**。同key另一作者为独立preGame工程allocation，非创建新可玩游戏，不能扩大清理权限。原其它fixture/产品route无改。facts原16身份/计数保，新3copyPreserved1、committedrequest0；每个目标验证，不盲比不同game的digest。

Node完整35DDL **memory-r1 26检查**，独立literal原domain HMAC（command37/allocation99/current100）、NONUUID targetkey、12错field/BLOB/MAC/逆game/失command/orphan/legacy无写/badkey、另一actor同keys不被误选；低helper canceled结构正例不冒原fullcoordinator状态许可。synthetic size/query/cursor与actual10001target预算分立，Node page pragmas不冒workerd/Root。model/helper执行前wx两个源码+三SHA/meta/log另签。未独立构造总20000/MAC8192payload负例；源码guard核而不伪称实际覆盖。

无native/model失败或盲重跑。旧CLI/COPYshell打印沿用，不是新范围权威；当前46事实及146场景才是。源正逆diff/派生原130校验、主动LSP/session-all/syntax/diff/links73Q与隐私审过3936B固定Jev另签；inconclusive/unavailable非clean，不加ignore/禁rule/cache/trust。UI/player/media/原机制未改，不重跑无关browser/gameplay。

## 仍开

完整HTTPpreimage/执行receipt/typed-unbound-orphan-movedparent/crossgame/shared全部history/namespace/audits/Source-pinnedpolicy和Root全提交-coordinator；writer-read-body-providerCPUlegacy-external-future/unknownjournal；专属physicaldelete/readback/scrub410/cache实际backup隔离restore；RuntimeManifest/Q69/255/认证Trial/release/fullworkbench/原初始化/73Q全目标仍open。无commit/push/deploy/cloud/install/trust/真实SAVE-profileIDB或共享清理，goal active。
