# E-01-BACKEND-PRIVATE-BYTE-CONTEXT-1 — 附件真实身份与 opt-in 字节取数

## 当前有限能力

[共同缓存/加载合同](game-editor-technical-design.md#42-runtimemanifest1)要求模式/游戏/准确修订/摘要隔离。本批只做byte transport，不新增规则/初始化/角色全装配，不签RuntimeManifest/Trial或发布。prior管理stage结构UI c59b4e63的375玩家及其它514输入/115imports保，两旧server源先wx归档；没有现玩家App/UI/asset-cache/MapView/MusicPlayer导入新模块。

- `StageJobsAPI.assertCurrent`原issued WeakMap→actualprincipal→actualpurpose serviceJob→原canonical和byte长度SHA的代码不变，末尾多返回**已重核的当前Job**，不是新capability。其它调用者可继续忽略返回值。
- Root原两个附件GET在原完整源/全持久产物或库400角色重验后，用actual GameMetadataStore.snapshotReference取准确saved身份。stage依据刚重核Job的game/revision，不依客户端query/DTO；library依据既有actualcaptured artifact。snapshot后再原issued/captured service guard，最后actualRoot principal与入口id/epoch/role/mustChange比对，无后续await/callback。
- 原binary/attachment/body/SHA/no-store/权限和路径不变，增加stage/library共同`X-Game-ID/X-Draft-Revision/X-Source-SHA256/X-Dependency-SHA256`；stage admission明确stage-only，库仍原private-available-bytes-only及X-Library-Root。只是本次已授权byte响应身份，不授报告永久有效、原始RootKey公开或客户端授权。

## 新模块：`web/src/content/privatebytes.js`

`createPrivateByteContext({gameId,draftRevision,sourceDigest,dependencyDigest},{fetcher,subtle,assertCurrent})`无npm、DOM、存储、计时器；只用Web标准fetch/ReadableStream/WebCrypto。引用/locator平坦own-data字段严格检查，accessor不执行；私有阶段六purpose/UUID4/assetId与4MiB、初始批次的库固定registry/library-000..397/无遍历logicalURL及16MiB（registry的后继显式绑定见末节）。工程界不是原规则域/heap/CPU/provider时限。

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

## 后继精确库身份绑定（非运行准入）

原`privatebytes`硬编码`approved-available-library-76cdf28-1`，不能消费现行库ID。现改为构造端明确传`libraryIdentity:{registryId,catalogRoot}`，严格own-data两字段、规范非空ID／SHA并捕获不可变副本；不从待取locator、latest或旧常量补身份。缺该选项仍可读private-stage，但private-library在fetch前拒绝；明确null／坏形状不是缺省。

库locator必须同时等于捕获的registryId和catalogRoot，随后仍走原准确game／saved revision／source／dependency、每次同源授权GET、响应root／长度／SHA和生命周期检查。ID格式校验不是登记授权；只有服务能决定实际可读库，不能靠构造本地context授权任意ID。上层JSON／小图及音频端口显式转传该选项；固定大图仅收private-stage，无需库身份。没有新增资源、放宽398索引／字节预算、改变解码或连接App／Trial。

证据前缀`.dragon-analysis/editor-completion/private-library-binding-`：

- `before.log`在旧硬编码上先复现现行ID被拒及新合同断言失败；`after-r2.log`最终5组通过，含现行策略常量ID的字节／JSON／WAV模型，缺绑定／身份错配在网络前拒、绑定副本无别名、坏形状／访问器零执行、实际响应root仍须匹配及close拒绝。全部HTTP／音频decoder明确为夹具，不冒服务身份或真实WebAudio。
- `audio.log`41、`resources.log`35、`fallback.log`31项通过；在各自原隔离证据目录新建`model-r901.json`，不覆盖旧收据。音频夹具明确提供既有旧库tuple，证明显式绑定不是自动改绑到新库；阶段JSON／PNG／固定大图行为保持。
- 原生束236文件重建并复建unchanged，SHA `d17fa1a1570cd7aa979b063dafe8855a24a402603857ce8c72a177928893988d`，两入口壳SHA保持；shell65、六文件语法通过。没有Vue／服务／DDL变更，不重建展示壳。六份代码主动LSP均未确认（1超时、5 push-only），三文档warning视图clean；mode=all的warning检查仍31项（后继error视图93文件未见error，不代表未确认文件clean），含新显出的privatebytes既有finally风格警告，本批未改其清理逻辑，未屏蔽。

归档原生浏览器验证入口已改为从实际已读库描述传入tuple，但其固定before／delivery mirror仍是历史封存环境，本批未覆盖这些冻结文件、未跑该旧入口，不能把原native-r3拼作新代码的实际HTTP／浏览器证明。当时现行服务联合取数尚待验证，后继Request聚焦见下；浏览器、连接所有消费者、20画像255及26结构缺项等仍未解除。

## 后继现行库实际Request联合验证

`verify_editor_template_root.mjs --private-library-only` 复用真实common Request处理器、自有文件SQLite／FileBucket、41固定来源与完整副本，新增实际固定库stager的400角色／现行消费者指纹核验和明确登记。来源／库登记使用实际服务方法和种子管理员；不是浏览器登录、TCP／TLS或云部署。本轮不更改产品代码或权限门。

`.dragon-analysis/editor-completion/private-library-api-r2.log` 14组通过（8公共＋6专属），stderr为空：

- 从真实398条库清单取registryId／catalogRoot，snapshotReference取准确source／dependency；将当前草稿保存至2后，context仍明确取已保存1，不能追latest。清单未决引用原样等于固定policy，未补画像。
- 按实际清单选择JSON、PNG、FLAC各一项，privatebytes调用真实处理器GET，流／WebCrypto长度SHA等于固定policy角色；仅验证字节，不宣称图片／音频解码或完整资源闭包。四准入位false。
- 同一locator再次显式读确实另发GET，修改已返回数组不污染下次结果；草稿对象数、全部请求账本、当前2快照引用保持，合法服务会话touch不冒全数据库零写。
- 缺库tuple、错registry／root在网络前拒；伪造source关联时，同本人真实GET仍200，但客户端按响应header拒，不能把本地tuple当授权。
- 普通作者读管理员库路径403；重建服务后原context仍可读取准确旧修订。仅在自有fixture的第一库对象await后停用管理员，实际服务返回401，前端拒绝；没有靠本地assertCurrent模拟权限（此处本地回调为空），也不声称完整await矩阵／撤销排空。最后恢复自有种子状态并关闭context，Trial／release仍0。

首轮`r1.stderr`在stager首次put报`bucket condition`：R2的`etagDoesNotMatch`与FileBucket的Headers形状不同。复用既有Node operator adapter，先断言原create-only条件再转为`If-None-Match:*`；未放宽FileBucket、覆盖既有对象或修改产品取数逻辑。该失败保留，不计通过。归档浏览器before／mirror未改；该批次实际浏览器尚待验证，后继独立浏览器见下，全部消费者链仍开放。

本批仅测试及三份文档更改，无产品／Vue／web/src／DDL变化，不重复构建两束或运行无影响长入口。测试语法、shell65通过；测试主动LSP首次10秒超时未确认；按用户要求延长到30秒重查后为push-only未确认，不冒clean。三文档warning视图clean，mode=all缓存93文件仍31项既有warning，未屏蔽。

## 后继现行库隔离浏览器字节协议

新增 `tools/verify_private_library_browser.mjs`，在独立HTTPS／SQLite／FileBucket和全新Chromium上下文执行真实登录、改密、来源与库登记、完整复制及metadata保存1→2。仅测试页与原样privatebytes模块为自有同源交付路由；所有API、资源字节和权限响应走实际服务，未伪造成功响应、不改封存mirror、不绕过CSP。该页不是已交付编辑器界面，也不是引擎装配。

`.dragon-analysis/editor-completion/private-library-browser-r2.log` 三组通过，收据 `.dragon-analysis/editor-phase/private-library-browser-r2/receipt.json`：

- 41固定来源及400库角色由实际stager核验后通过浏览器管理员API登记；从真实清单捕获库tuple。准确修订1的source／dependency来自自有已提交SQLite快照只读观察，不是权限替代；当前2不覆盖旧读取身份。
- 原生浏览器Fetch／ReadableStream／WebCrypto读取真实JSON、PNG、FLAC字节各一项，长度SHA匹配清单；同一JSON另两次读取均新GET，修改返回数组不污染下次。缺绑定不发GET，四准入位false。前五次资源GET皆200且显式revision1。
- 第二个新隔离上下文真实登录同账户并改密，第一个上下文仍持旧cookie，原context下一次GET401；不靠本地生命周期回调模拟服务拒绝。context关闭，草稿请求账本／对象数保持，两个页面正式IDB调用0，Trial／release仍0；没有声明全撤销／迟到矩阵。
- 17项关键源码SHA运行前后相同并写入收据；6次资源GET状态为五200／一401，非预期页面错误与外连均空、stderr空。只验证字节协议，不代表PNG／音频解码、已交付工作台接线、完整资源闭包或运行准入。

首轮r1在副本名称超过既有8字限制时422 `COPY_METADATA`，日志及failure.json保留；按既有normalizeGameMetadata合同改短测试名称，并在再跑前将尚未执行的简介也改入20字限制。未放宽产品输入。最初定位时猜测不存在的auth／copy／routes路径造成只读检索失败，后改查实际文件，不计为验证成绩。只有测试／文档变化，不构建两束或重复无影响Root／规则／发布长链。语法、shell65及diff通过，收据17源码SHA事后复核一致；主动LSP按用户要求用30秒，测试为push-only未确认、三文档warning视图clean。mode=all缓存94文件仍31项既有warning／1项hint，未屏蔽，不称全仓clean。

## 后继浏览器JSON及小图解码

同一隔离入口r3在字节协议之外加载原样 `privateresources.js`／`privatepng.js`；三个模块仅在自有 `/owned-modules/` 路径提供，所有数据仍走实际权限HTTP。`.dragon-analysis/editor-completion/private-resource-browser-r3.log` 首轮5组通过，收据 `.dragon-analysis/editor-phase/private-library-browser-r3/receipt.json`，不覆盖r1／r2。

- 从固定库实际GET `grf/music/playback.json`，两次 `readJSON` 与经SHA核对的本地固定文件逐值相同，各自深冻结且不是同一对象；每次仍有独立GET。
- 原生 `createImageBitmap` 解码RGB8 `grf/ui/battle_status_0.png`（24×16）及indexed4 `kao/149.png`（128×128），OffscreenCanvas逐像素结果SHA与独立Node `decodePNG`一致。两样本事前明确核实全不透明，避免把Canvas预乘／反预乘舍入当作解码错误；不外推透明图或所有PNG。
- 显式dispose重复调用及context.close重复调用后，实际ImageBitmap宽度均归零；closed读在网络前拒绝。另一真实PNG解码仅由测试端口延后返回，原生bitmap已生成后关闭context，再释放端口返回：明确 `PRIVATE_RESOURCE_CLOSED`，迟到bitmap也被实际close，未交付给调用者。没有伪造bitmap或成功资源响应，不冒全部await／撤销矩阵。
- 保留真实登录／改密／登记／精确旧1与当前2、字节副本隔离、第二上下文改密令旧cookie GET401、账本／对象不增和正式IDB禁用等前序检查。十次资源GET200、最终一次401，页面错误／外连为空、stderr为0；四准入位仍false。
- 20项关键源码SHA运行前后及事后复核相同，独立像素SHA和JSON源SHA在收据及 `private-resource-browser-recheck.json` 中。仅测试与文档改变，无产品／服务／Vue／web/src／DDL改动，不重建两束或重复无影响长链；该r3范围不是音频解码；后继r4在同一真实链新增[原生FLAC只解码](editor-backend-private-audio-decode.md#后继现行库原生flac只解码)，6组／21源码SHA通过，仍非已交付界面、完整依赖闭包或Trial运行准入。语法、shell65及diff通过；主动LSP用30秒后测试仍push-only未确认，两文档warning视图clean。mode=all缓存94文件仍31项既有warning／1项hint，未屏蔽。

## 后继浏览器调用方代次失效

同一隔离入口r6补充原生PNG／WAV解码之后、句柄交付之前的调用方代次变化。使用明确自有 `assertCurrent` 回调捕获generation，两个实际GET／原生解码均完成后递增generation，再释放测试解码端口的返回；**此前不调用context.close**，以分别验证检查回调和显式关闭。此回调是组件生命周期夹具，不是服务认证、已交付宿主接线或完整await矩阵。

`.dragon-analysis/editor-completion/private-generation-r6.log` 首轮10组通过，收据 `.dragon-analysis/editor-phase/private-library-browser-r6/receipt.json`：

- PNG和音频都返回测试回调的 `OWNED_EDITOR_GENERATION_CHANGED`，未交付句柄；随后再次读取仍在GET前拒绝，两个decoder各执行一次。
- 实际PNG bitmap在context.close之前即宽度归零；音频provider已持有的AudioBuffer不清零，其全PCM SHA仍与此前明确范围的固定WAV独立转换对照相同。原生OfflineAudioContext仍suspended，没有播放、source node或startRendering；两个context四准入位都false，最后重复close清理。
- 保留r5实际登录、登记、精确旧修订、JSON／PNG／FLAC／WAV及close迟到检查；实际资源GET总17次，前16次200且revision1，最后由第二真实浏览器改密造成旧cookie401。代次变化未伪装成服务权限撤销，二者分开证明。
- 21项源码SHA运行前后及事后复核一致（`private-generation-recheck.json`）；非预期页面错误／外连为空，正式IDB为0，stderr为空；草稿账本／对象保持，无Trial或release。无产品／服务／Vue／web/src／DDL更改，不重建两束或重复无影响长链。仍未证明完整资源闭包、宿主代次维护或全量迟到矩阵。
