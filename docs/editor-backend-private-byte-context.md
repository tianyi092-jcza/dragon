# E-01-BACKEND-PRIVATE-BYTE-CONTEXT-1 — 附件真实身份与 opt-in 字节取数

## 当前有限能力

[共同缓存/加载合同](game-editor-technical-design.md#42-runtimemanifest1)要求模式/游戏/准确修订/摘要隔离。本批只做byte transport，不新增规则/初始化/角色全装配，不签RuntimeManifest/Trial或发布。prior管理stage结构UI c59b4e63的375玩家及其它514输入/115imports保，两旧server源先wx归档；没有现玩家App/UI/asset-cache/MapView/MusicPlayer导入新模块。

- `StageJobsAPI.assertCurrent`原issued WeakMap→actualprincipal→actualpurpose serviceJob→原canonical和byte长度SHA的代码不变，末尾多返回**已重核的当前Job**，不是新capability。其它调用者可继续忽略返回值。
- Root原两个附件GET在原完整源/全持久产物或库400角色重验后，用actual GameMetadataStore.snapshotReference取准确saved身份。stage依据刚重核Job的game/revision，不依客户端query/DTO；library依据既有actualcaptured artifact。snapshot后再原issued/captured service guard，最后actualRoot principal与入口id/epoch/role/mustChange比对，无后续await/callback。
- 原binary/attachment/body/SHA/no-store/权限和路径不变，增加stage/library共同`X-Game-ID/X-Draft-Revision/X-Source-SHA256/X-Dependency-SHA256`；stage admission明确stage-only，库仍原private-available-bytes-only及X-Library-Root。只是本次已授权byte响应身份，不授报告永久有效、原始RootKey公开或客户端授权。

## 新模块：`web/src/content/privatebytes.js`

`createPrivateByteContext({gameId,draftRevision,sourceDigest,dependencyDigest},{fetcher,subtle,assertCurrent})`无npm、DOM、存储、计时器；只用Web标准fetch/ReadableStream/WebCrypto。引用/locator平坦own-data字段严格检查，accessor不执行；私有阶段六purpose/UUID4/assetId与4MiB、库固定registry/library-000..397/无遍历logicalURL及16MiB。工程界不是原规则域/heap/CPU/provider时限。

阶段locator→固定`/api/games/G/stage-jobs/P/J/artifacts/A`；库→`/api/games/G/draft/library-assets/A?revision=R`。logicalURL/mime只保留描述/键，不执行URL、不决定解码，更不是完整398角色来源证书。每次GET credentials:same-origin/cache:no-store/redirect:error，无任意remote、POST、重试、latest回退。原Root实际cookie/epoch/owner/fence/Job/saved/source才决定服务端读权；调用端assertCurrent是**受信装配的本地代次/身份/生命周期契约**，任意fake callback、DTO或hash并不证明权威。

所有网络/每stream read/WebCrypto await两侧检查本地生命周期；status必须200、不redirect，八身份/完整性header与admission严格，库还比catalogRoot，有Content-Length则必须精确。预分配descriptor长度、超额即拒、EOF后核精确长度和SHA-256，然后回每消费者独立Uint8Array。不给JSON/PNG/audio/Blob URL或Scenario、不保decoded/运行地形。

独立context Map键含固定mode/全部game-revision-source-dependency/整个purpose-operation-or-library descriptor；同locator只合并**in-flight** GET，成功或失败立即删除自己的entry，下一显式读必须再次网络授权。没有settledbyte缓存绕过epoch/fence。最多八inflight；close只永久关本context/清ownMap，不重开、不取消SQL/HTTP Job/provider、承诺GC/已知撤销瞬时到达或provider排空。未来正式Trial还须真实连接/会话通道、全mutating/async门，不以此assert callback替代。

## 实际验证与范围

最终native-r3 **7检查/17 Node控制调用/6浏览器附件GET**，新隔离Chromium/ownedHTTPS8787/tempSQLite-R2、actualKDF Source41roles+库400roles登记/正常copy/saved1真实dataJob29产物/save2。**没有重复全六stage/namespace/wait/UI套件**。

1. 实际browser WebCrypto/stream取terrain_0与library-000，长度SHA准确，commonRoot headers匹配saved1/current2，四准入位false；第二stageGET确实再发网络/真实source与全产物重验，三成功读前后全35SQL行/catalog/databaseSize不变。
2. 故意fabricate source关联、同本人库实际GET仍200，模块按actual header拒；这是真实byte关联负控，不是权限攻击或server403。
3. actualpassword handler撤旧browsercookie，原bytecontext新GET401，无settledcache；fresh实际cookie后库400role read返回插owned永久fence，Root409GAME_DELETING、无byte、不410。hook只owned原fixture，无fence清理/修SQL/取消provider。
4. zero IDB access/outside network/page errors；不读用户profile、真实SAVE或触共享存档。浏览器只加载owned标准模块deliveryfixture，无产品UI变动/视觉批准。

独立fake HTTP/reader/lifecycle model-r3 **42检查**：保初39，错路径/tuple/accessor零执行/头/short-overflow-sameLength坏SHA/401403409410503、fetch-reader-digest三个await撤本地生命周期、单飞独立byte副本、失败ownentry清理和显式retry、八并发/永久close；另两取消同时失败保原HTTP401/SHA，以及第三例保原falsy thrown value。fakePorts非native授权/当前byte源/全部await撤销证书。

native-r1 7/17/6与model-r1 39已passed；人工复核发现cleanup rejection可能掩盖首HTTP/integrity错误（**非已证native故障**），只新helper+ownedmirror加primary failure preservation，再全fresh native-r2及model-r2 41。后续同一复核把failure引用改布尔标记，以保JavaScript falsy thrown value并加一负控，native-r3同7/17/6/model-r3 42再fullfresh；Root/header代码三轮相同，所有passed轮源码/log/report保；没有失败producer或放宽权限/期待/1800s。第一次model加强edit非唯一anchor工具拒且文件未改，精确重试，不虚构执行失败。初稿ownedfixture classname大小写、modeluppercaseUUID样本在执行前核实修正。

## 证据与未完成项

owned `.dragon-analysis/editor-phase/backend-private-byte-context-session-r1/`的before/旧两源/doc wx、native三轮12执行前源码/报告6来源、model三轮2来源/stdout-stderr-meta保持。独立static-r2核两旧源LCS正逆（Root恰两附件替换、Stage恰一末尾insert）/518输入514旧375玩家/118imports115旧/73唯一Q/实际35NodeDDL与PRAGMA.table_xinfo243列70对象/606链接/10源码语法/gitdiff与当前所有SHA；文档后r3重签。首static-r1把Map用Object.keys计数0!==118（actualentries早已与期待相等），只新collector改graph.size、源-log-meta全保，不动业务/权限/budget/产物。主动9代码无诊断但inconclusive9、4MD unavailable4（ready0/2）、sessionall444文件27既有warning35hint-info保，后继collector主动单独核；没有ignore/rule-disable/cacheclear或workspace clean。reviewed 3803B 最小Jev/preview后固定jev-1.13.0 advisory不作权限/原证/SQL/完成oracle；在M2 41时送出，后继一条falsy模型加强及布尔marker不追认先前摘要为42。外层owned wrapper ambient env，内层已有provider明确白OSenv+仅所需key，不把外层也说成whitelist；无源/资源/秘密/用户ID/全日志发送。

只source-bound byte桥；没有接Root结构plan UI按钮、435角色装配、Image/directImage/Music/完整cache身份、chapterId/slotMap/profileCertificate/RuntimeManifest/认证Trial、255/G127初始化原证、发布上架registry-announcement、allhistoryrefs/body-providerCPUlegacy-drain/physicaldelete410-scrub-cache实际backuprestore/完整工作台及其它全73Q。主goal active，不局部close/block全部任务。无commit/push/deploy/cloud/install/trust/实际后台修改或共享清理。
