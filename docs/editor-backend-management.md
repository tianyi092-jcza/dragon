# E-01-BACKEND-ADMIN-MANAGEMENT-1 — 管理下架与解除限制（认证API限定）

## 后继限定操作界面（本页API成绩仍历史）

[实际管理UI/恢复](editor-backend-management-ui.md)已接existingadmin公共摘要、confirmed下架/clear与持久原关联、明确GET404后人工同键重试、未知回复保key/body/header；fresh实际Root-browser13/24控制/9POST/5GET与fakeDOM26另证。这里只静态route/Text/client/index装配，management.js与全部API认证/CAS/预算/audit/资源保护不改。本页“UI仍缺”是本API批历史：后继UI不授正式发布/上架/registry-announcement竞态、匿名旧局或完整Q20。

## 产品及边界

[产品Q20/§4.1](game-editor-design.md)：管理员下架同时管理限制，不能由作者上架或发布绕过；[§5.1](game-editor-design.md)解除后仍保持下架。不是DOS规则，无新机制公式；管理员管理权限不授他人私有草稿/修改/发布，[工程§5–6](game-editor-technical-design.md)。只有此**管理状态服务和API**落地，完整Q20客户端、正式发布/上架、匿名registry/announcement/admission仍缺。

新`server/management.js#GameManagement`，Root自身SQLite/principal/permanent reservation guard装配，无新schema/table/column。写集只Game.listed/restricted/row_revision（changed BigInt+1）；draft_revision/modified_at/created_at/owner/名字占用/metadata/snapshot/refs/blobs/currentReleaseId/nextOrdinal保。成功动作独立Audit时间：`admin-unlist`或`admin-clear-restriction`、before/after管理row/time；不伪称内容编辑。新key no-op不增row，仍记管理event/永久receipt；samekey replay不新增任何行/事件，不倒回当前状态。restricted不当删除、fence或禁止作者修正保存；futurepublish提交仍须保持当时管理状态而非恢复上架。

## 固定合同

| Root API（本轮实际路径） | 输入/权限 |
| --- | --- |
| `POST /api/games/:id/listing` | admin only，exact `{action:"unlist"}`；listed0+restricted1。不实现list/作者unlist，其它动作422 |
| `POST /api/games/:id/restriction/clear` | admin only，exact `{}`；listed0+restricted0，不自动上架 |
| 两写共用 | 原exactOrigin/Cookie/CSRF/mustChange/body bound，`Idempotency-Key`，quoted positive `If-Match`管理row；8192 decimal位工程预算，不把PrivateDraft expected64推广meta/result，64→65合法 |
| `GET /api/admin/games/:id/management-operations/:key` | actualadmin，只有自身actor/key/target方法结果；readonly旧事实，不当前状态证书。无queryparams，不读私有源 |

只有六字段`{gameId,action,listed:false,restricted:boolean,rowRevision,eventAt}`，no owner/name/introduction/资源/密钥。action必须primitive string且自身method键，拒JSON array隐式key coercion；minimal result存入既有content_operations，reservation存入既有content_reservations：方法区别原create/save，共用actor/key永久命名空间；历史Root `copy`族名称是**content reservation族**，不赋copy capability，不增加第九SQL族。旧Root contentKey source/auth/draft/compile/HTTP/delete互斥先后核。新helper自己再核**实际存在的固定七族表**nativeBINARY actor/key，防原Root在adminCopies/R2未配置时早return忽略留存表；不猜未来未知表/新族，不重建missing schema，不TTL清expired键。existingcontent_operation-only/不同方法-target/digest/epoch状态也拒，不拿短TTL AES auth receipt作提交键。

Root现有operationHMAC绑定method/path/body+expected header，捕获原actor/epoch；body/digest await后到actualadmin/epoch同SQL事务。Root callback pinned身份之外还有实际SQL sessions JOIN users policy，safe deadlines、epoch、role、disabled/mustChange、最终callback-free重核。builtin403/未知404/异常UUID422/已fenced409GAME_DELETING；currentrow CAS409GAME_CHANGED。oldkey方法-target-digest不同409、oldEpoch409OPERATION_REVOKED；orphan reservation/坏minimalreceipt503，不补签或修复。历史query/replay需Game仍可管理/current真实权限，但**不**把旧rowRevision强等current，解除后重放旧unlist只能返回旧receipt，不能恢复restriction。

SQL外层一次同步事务：首权限/key/actualsession/Game/CAS→管理三字段→reservation/operation/audit→末namespace callback与native七族扫描→actualGame tuple/最终actualsession；失败全部SQL回滚，非SQL-R2/provider原子性，未触nativePUT/GET/delete。源`metadata.js`一字不改：作者#save仅写name/draft-row/modified，不覆盖listed/restricted；未新增作者限制写门，也不以此推完整正常保存/发布验收。

## 当前原生/模型证据

owned `.dragon-analysis/editor-phase/backend-admin-management-session-r1/`，先核原生产b605/505输入112imports及支持namespacewait52fb、worker/local-validation wx归档；其它504旧含375玩家/111旧imports全保。新三源worker/management/focusedtool合计507输入、113imports待独立static核，fixed35表243列70对象没有变。

final **main-r3 16检查161记录HTTP调用/4六字段receipt/8reportSHA/12执行前wx源**。main-r1原13检查144调用保；人工复核原Root无R2的knownnamespace skip后，仅新helper加fixed七族native纯检查、新两case，再main-r2全fresh15/155保；随后直接审receipt发现array action可coerce method且跳过strictbranch，onlynewhelper补primitive-own action门/两个模型与一个actualSQL坏receipt readonly503，新main-r3全16/161，前三passed均保。原13字符串/状态-错误/CAS/时间/全部35行目录databaseSize回滚期待保；旧helper实际源12WX留，两轮Rootbyte同，变化仅新helper/focusedtool/fixture、unusedconst等最小style修，无nativeproducer失败/预算放宽。

- 真实RootKDF/管理员及author，旧session401、独立badOrigin-CSRF/IfMatch-CAS/builtin-UUID/未知/list关闭拒，各拒后全部35SQL行/catalog/size同；跨作者合法管理不赋draft读权。
- 管理下架/解除/新key no-op；Game内容全部列（除三管理列）/snapshot/names精确同；旧unlist query/replay在解除后不改变currentrestricted0，旧result不latest。
- actualdifferentactor authkey与管理员managementkey分立，同actor auth/draft/method/expected重用409；原永久reservation-method/target/digest/epoch与audit/result一起commit。
- 同key两个实际HTTP都同200结果；不同key同expected管理CAS，恰一200/一409。不以请求到达顺序推调度常数。
- actualnative审计INSERT trigger失败500，Game/两永久键/操作/audit全35行目录size回滚；temporary触发器是owned故障，不冒正常产品schema或物理DB腐败。
- 第二真实namespace callback后实际session expiry/user epoch/role/Game row注入，最终SQL401/409且全回滚；在原Rootguard之后插sameactor expired-auth key，被新纯native检查409/全回滚，不清过期记录。
- workerd/DO restart保session/keys/历史receipt且不reapply；同持久Root去掉R2配置后仍拒留存authkey（原guard会skip），并可readonly自身management history；无重建/丢表/资源/provider认证。
- Actual password handler使新epoch旧managementkey query/replay409，不短TTL复用；fence两动作409、badstoredrow503；64→65 exact BigInt合法。

Game/opaqueformal指针/listed samples是**工程SQL metadata，不是正常Source/正式发布/线上目录/旧局资源**；整个测试不staging/读取R2正文，不claim匿名隐藏、发布竞争或完整Q20界面认证。GETreadonly和失败全SQL指纹不包括外部provider缓存。只新增Root路径，不改变原账户/draft/stage/library/copy handlers：原账户工具当前**auth-r3 7组61请求**/四执行前sourcecapture、原KDF/disable-enable-reset/epoch-CAS/同key/rates/expiry/restart验证有证；不是原browser或全部metadata/R2/freeze/wait大轮。

独立complete35DDL Node **memory-r4 28检查**：真实class、fakeprincipal/guard、actualSQL user/session不信成功DTO、no-op/historicreceipt/类型/坏六字段/orphan不修/trigger-rollback/late-session/BigInt。模型不是workerd/Root身份；memory-r1 lazy adapter没有在exec执行INSERT、重放错误CAS409，两个执行前wx源/log/meta保，onlyadapter改eager匹配actualnative，r2 passed26；helper补七族后r3全部26重核；receipt primitive-own门后r4保26＋两array negative＝28。actual Root query corrupted actionarray/false flag 503且wholeSQL保，不猜正常HTTP攻击。产品预算/业务期待不为模型改。inlinePython差分setup SyntaxError在执行/I-O前，shell原因UNKNOWN，仅事后说明非同期source；ownedNode LCS原worker正逆差后独立collector验证，无覆盖原源码/失败。

## 静态/诊断与未完成

独立static-r3已核507输入/504旧/375玩家/113imports（111旧、Root变及新helper）、9语法/577本地链接/73唯一Q，fixed70对象/35实际Node CREATE及PRAGMA.table_xinfo243列、newRoot正逆source delta；全部原历史/失败/actual执行source/current maps最后rehash。firstcollector两次失败wx保：r1猜quoted-key/变量名/Root空格字面量；r2误猜expected.tables实际只有objects tuples，onlycollector改用原tuple35DDL与actualNode列计数，无产品/SQL期待/权限/预算改。文档补录后static-r4重签与finish独立核。code8 inconclusive/MD8 unavailable/final changed5 inconclusive，27继承sessionwarnings/430文件与35显示hint-info不是新workspace clean，confirmedClean0。

语法/diff/主谱系I-O-SHA/actualsource与old13check/账户/模型/当前fixedDDL/links73Q/支持LSP-sessionall及5993B人工privacy-preview-r3→固定jev1.13advisory另签；silent/unavailable/inconclusive与缓存零非clean，不加ignore/禁rule/清cache。原preview4910B未发送，keyspace人工复核后preview-r2 5311B已审send保；receipt type补录后preview-r3 5993B归档再审send，不发源码/真实资料/日志。无UI/player/media/原机制变更，本批不跑无关browser/游戏全轮，也不承诺未知Rootbody未复验边界。完整操作UI/unknown-write客户端GET联动、正常自建发布/上架-限制与registry-announcement同事务/匿名旧局资源、所有Root-submit与allhistory-reference/native/body-providerCPUlegacy-drain、专属physicaldelete/readback-scrub410/cacheactualbackup隔离restore，以及RuntimeManifest/Trial/完整工作台/初始化原证/其它73Q仍open。

无commit/push/deploy/cloud/install/trust、真实SAVE/profileIDB/共享清理，goal active。此管理状态基础不是全E-01、Q20或physicaldelete准入证书。
