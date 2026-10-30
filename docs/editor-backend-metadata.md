# 独立后台：同事务域游戏元数据基础

范围`E-01-BACKEND-METADATA-1`，接续[真实账户服务](editor-backend-auth.md)，依据产品§3/4.1/5与[工程合同](game-editor-technical-design.md)§1/5/6；不是原版机制变更，也不是完整草稿/复制/发布交付。

## 后继限定管理状态API（本页原成绩仍历史）

[管理下架/解除维护源](editor-backend-management.md)已装Root实际admin同SQL管理三列、独立audit/permanent minimalreceipt；不改本页metadata.js或snapshot/refs/draft/modifiedAt。current16/161与Node28/原账户7/61证据另签，工程Game不冒正式版本/正常Source；完整操作UI、发布-上架-限制同提交/registry仍open。本页“未开放”是本轮历史，不覆盖后继copy/draft/stage/library或管理API。

## 实际实现

`server/metadata.js#GameMetadataStore`在同一账户SQLite Durable Object内建表；`server/worker.js`装配并给真正会话开放`GET /api/games`自己的紧凑摘要及`GET /api/admin/games`管理员全局管理摘要。管理摘要只含当前正式名称/简介（无正式版时null）、公开创建者账户、上架/限制、行修订与时间，不输出他人草稿名称/正文/根引用/草稿修订。强制改密态仍拒绝；管理员也不能借管理权取得他人私有快照。

- 游戏ID由服务分配UUIDv4，创建需实际服务分配能力；`content_used_ids`永久记已使用ID，为未来删除后不复用保留基础，不意味着本轮已实现物理删除。
- 账户来自真正session principal；准备前、异步验收后以及同步事务内都查有效会话/epoch，不接受ownerId或管理员角色DTO。prepared snapshot/allocation使用私有对象能力，复制成JSON即无效。
- 名称/简介复用共同trim/NFC/8/20码点规范，服务器额外在trim前拒控制码和孤立代理；作者原文不转繁体。同作者大小写敏感唯一，跨作者可重名；同游戏草稿名与当前正式名可共占一个名，改草稿后当前正式名仍占用；纯旧草稿名释放。SQL唯一键`owner_id,name COLLATE BINARY`在同事务域，不靠预检清单或进程Map。
- 成功创建`createdAt==modifiedAt`，草稿/行修订从十进制字符串1开始，`BigInt`递增不经浮点；正式指针null、nextOrdinal为0、未上架。草稿修改不伪造正式版本；实际内容no-op不改变修订/时间，失败完全回滚。
- 快照引用按`gameId,revision`追加，旧引用不覆盖；本层只管事务内引用，不能把引用/摘要存在当已核验真实对象或依赖闭包。
- 同步`transaction`内只允许一次创建或CAS保存；异步callback在调用前拒绝，thenable/多次写会回滚，逃逸callback在事务结束后不能继续写。审计只记录操作者/动作/ID/前后修订/UTC，不记录草稿/密码/个人资料。
- 提交幂等另用永久`content_operations`：账户/方法/目标/HMAC请求摘要/epoch绑定，无短TTL重新分配ID；异内容409，同key并发只一次修改。返回丢失/重启后仍可重放原结果，不换成latest；权限与所有权复查先于重放。改密/停用恢复后的旧epoch收据不可复活。未来删除必须清理内容正文并只保最小事实收据，本轮没有冒此清理已完成。

## 明确未开写入口

生产`GameMetadataStore`未安装真实不可变对象/源验收端口，准备快照返回503；**未开放生产创建、复制、保存、编译、发布或上架接口**。`{valid:true}`/作者提交的hash/一份自称manifest均不能取得prepared能力。服务端验收端口将来必须实际读回不可变字节，核根/sourceDigest/依赖/安全结构，之后才可准备并提交。

元数据测试独立fixture提供工程JSON标记的引用验收端口，用真正账户/SQLite测试事务；没有冒充真实GameSource、BlobStore或编译。当前正式名和超过MAX_SAFE_INTEGER的序号场景由fixture直接SQL建立，**只证明占用/表示/事务，不是正式发布或1.9→1.10全链证书**。fixture只在ignored自有验证目录，不在生产配置或浏览器包。

## 本轮实证

先登记[验证I/O](editor-local-validation.md)，使用已安装Miniflare/workerd，实际HTTPS127.0.0.1:8787、own OS temp SQLite与随机工程密码/密钥；不读用户profile/存档/IDB/SAVE/DOS/云凭据，不创建云资源/部署或清共享缓存。

- `tools/verify_editor_backend_metadata.mjs`最终`backend-metadata-session-r1/metadata-r4`八组：真实两作者/管理员；NFC/码点/大小写/跨作者与坏字拒；私有读取与管理员无跨作者编辑/快照I/O；CAS/旧引用/no-op/实际SQL回滚；双请求/同key一次；草稿与当前正式双名；能力伪造/异步与逃逸拒；已准备后提交、在途异步准备期间停用拒绝；新登录旧收据不复活；大十进制修订；重启保持及owned SQLite只读核查。
- r1测试把`Different`（9码点）误用作8字符域内幂等冲突，实际先422而非预期409；原测试/日志保留。修为7码点`Changed`，r2通过；随后追加已准备提交撤销/大整数/旧名释放，r3完整重跑通过，不拼接r2结果；再将CLI JSON输出等价改用stdout，r4八组全部重跑，原r3及脚本保。
- 当前生产Worker完整重跑原账户`auth-r12`七组及新fresh浏览器`backend-auth-browser-r6`六组；不是只dispatch或旧绿色。历史账户r11/r5精确SHA保，不作为当前代码证书。
- 玩家根wrangler/旧293源码＋82资产保持原byte；新增后台输入独立封存。未运行无关87游戏全量或规则战役，不称全安全clean。

主动10路径7clean/1findings（35正确await括号hint）/2inconclusive，session272文件9既有warning保；两个CLI console.log提示改为明确stdout并重跑，不改await语义/禁规则/清缓存。Jev仅3633B人工工程摘要经preview后`jev-1.13.0`advisory，无资源/源码/凭据/个人资料或完整日志，不代实证。新语法/旧byte/实际receipts/依赖/producer与本地链接另封存。

## 后继：正式发布实际登记双名占用

本页早期“双名”测试以SQL夹具设置正式名，并未证明发布入口接线。完整目标审计发现实际发布只写pin／版本，`formal_name/formal_introduction`仍为null；新增真实Root断言在 `.dragon-analysis/editor-completion/formal-occupancy-root-before.log` 复现 `null !== 'HTTP證明'`。不得把早期占用基础测试作为该缺口已完成的证据。

现由 `server/editorapp.js` 的发布提交回调调用 `GameMetadataStore.setFormalMetadataInTxn`：再次检查当前作者、删除栅栏和精确草稿修订，按8／20码点合同冻结正式名称及该修订简介，复用同一 `content_names` 唯一域保留草稿名＋新正式名。与发号／pin／pack／永久请求及冻结分发同事务；冲突或后续失败全部回滚。旧正式名仅在成功换名且不再是草稿名时释放；历史公告不占名。此动作不修改内容时间、草稿修订、上架状态或既有永久收据，也不自动回填旧数据。

- `verify_formal_name_occupancy.mjs` 10项：真实SQLite元数据／版本／pin，显式principal及快照端口；创建／草稿改名保正式占用、同作者冲突、跨作者重名、发号回滚、晚失败恢复占用、新正式名释放旧名、双名合一、过期修订／越权拒绝、NFC及简介冻结。不是HTTP或编译证明。
- `verify_publish_operations_root.mjs` 28组：实际共同Request／编译器／20章，新增正式字段和双名SQL断言，管理上架回滚快照包含 `content_names`；当时发布晚失败的独立fingerprint尚未包含名称表，缺口由后继“实际发布与创建预留联合验证”补齐。日志 `formal-occupancy-root-after.log`。
- `verify_frozen_publication_root.mjs` 44组：实际文件SQLite／FileBucket、8代冻结分发、50表隔离恢复及引用／字节诊断；回滚比较纳入名称表。日志 `formal-occupancy-frozen.log`。R2为内存端口、身份为种子会话，不冒云端、浏览器、完整空白创作或物理删除证书。
- schema两检查仍为23源／50表／49索引／343列／4外键；无DDL迁移、生产数据修改或部署。

## 后继：旧正式版本缺登记时仍保名称

旧发布可能已有当前版本／pin，而 `formal_name` 和正式名索引尚未登记。新增隔离负控 `legacy-formal-occupancy-before.log` 复现同作者新建仍能抢占该名称。现在名称写事务先只读核对本作者这些旧记录：当前release指针、release的版本／源修订／摘要、pin的游戏／作者／对应身份及历史40码点规范名称必须吻合。缺失或损坏返回 `GAME_NAME_STATE_UNKNOWN`，不得当空闲名；不跨作者扫描，不从历史公告猜名称。

创建最终提交、草稿改名和新发布都检查这份旧当前正式名（创建预留入口当时未覆盖，后继修复见下节）；该旧游戏正常保存时保留其草稿名＋旧正式名索引，但不编造旧正式简介、不回填正式字段、不改pin或永久收据。成功重新发布后采用新的8码点合同，原名仅在不再使用时释放。该兼容路径不是历史数据迁移或资源可玩性证明；损坏旧指针仍需独立修复，不能借此自动清除名称。

- `verify_formal_name_occupancy.mjs` 现16项通过，新增旧名在创建／保存／发布三路冲突且事务不变、跨作者允许、旧pin字节保留、缺pin／坏JSON／作者与版本不符拒绝、重新发布后释放；另用显式旧格式长名称验证草稿保存保留其占用而不改pin。日志 `legacy-formal-occupancy-after-r2.log`。
- 共同Request／20章真实编译回归28组通过（`legacy-formal-occupancy-root.log`）；元数据SQLite端口15项、shell65项通过。以上身份／快照仍用显式测试端口或种子会话，不冒生产认证、云端或浏览器验证。
- 两项schema检查保持23源／50表／49索引／343列／4外键；没有新表、批量回填或部署。

## 后继：创建预留先核旧正式名

A07审计发现 `AdminFullCopy.reserve` 只查`content_names`，没有读取尚缺正式字段／索引的旧当前release／pin。最终创建提交虽然会拒绝冲突，但预留可能先将旧正式名登记给新gameId，导致旧游戏后续保存也被该预留阻挡。`name-reservation-before.log` 在真实内存SQLite、实际创建预留服务中复现旧名预留未抛异常，不能以此前最终提交的16项验证覆盖这个入口。

新增元数据内部只读端口 `assertNameAvailableInTxn`；预留完成原键重放检查后、写入名称／请求之前调用它。该端口复用创建提交／保存／发布的同一私有占用检查和旧正式名身份核验，不另建名称规则或Map锁。规范名称由原请求边界提供，当前principal在同步事务内复核；冲突409、旧权威缺失／损坏503均不新增预留行。作者／管理员两种复制服务共用此入口，原键重放、不同正文冲突及跨作者同名规则保持。既有预留不被自动重写或清理；这不是旧坏记录的批量修复，也未开放物理删除或释放真实内容占用。

复用现有验证，前缀 `.dragon-analysis/editor-completion/name-reservation-`：

- `after-r2.log`：`verify_formal_name_occupancy.mjs` 19项通过（16＋3）。真实SQLite及元数据／release／pin／预留类，principal、来源目录与快照为显式端口；预留不得读源／读写对象。旧正式名冲突核包括copy表的完整事务快照不变；旧pin缺失／坏JSON／作者或版本不符同时拒绝预留和创建；NFC同键重放、异键重名、换正文冲突、跨作者同名预留通过。原正式／草稿双名、发布回滚与旧长名用例保持。
- `author.log`：原角色门／作者创建18项通过。其元数据仍是显式索引占用stub，仅补上新端口，不冒真实旧正式名证明；该证明由前项实际类承担。
- `metadata-port.log`：原SQLite元数据端口15项通过。四个变更JS／MJS语法和diff检查通过。
- `root.log`：`verify_editor_template_root.mjs --role-slots-only` 600秒超时且输出为空，**未确认**；随后进程检查没有仍运行的该测试Node，未终止其它进程。没有将旧13组成绩拼接成本轮完整复制／Request证据。
- 四代码主动LSP300秒：三项未确认（timeout／push-only）；另报告`verify_author_create.mjs`三项既有console风格warning，未屏蔽，不称clean。

无DDL、Web运行模块或界面变化，不重建原生束／后台壳，不跑无影响浏览器、规则、Trial或完整冻结发布长链。A07仍部分：当前完整创建／发布组合与物理删除后的占用释放尚不能据此关闭；后者继续依赖A30，不从删除栅栏推断已释放。

## 后继：创建预留实际Request聚焦验证

复用 `tools/verify_editor_template_root.mjs --reservation-only`，在原41份固定来源注册后只走预留入口，不执行中立／完整副本的大对象复制。原有各模式保留；这条聚焦验证不覆盖或撤销上轮600秒空输出超时。

`.dragon-analysis/editor-completion/name-reservation-request-r2.log` 7组通过（r1也通过，r2补核两个冲突的409状态码）：

- 实际共同Request、文件SQLite、FileBucket及固定来源注册；认证仍为原测试种子会话，旧正式版／pin明确由自有SQL夹具建立，不冒真实发布、HTTPS或浏览器。
- 作者`POST /api/games`、管理员`POST /api/admin/copies`都拒绝本作者旧正式名409；同键再次请求仍拒绝。分别比较十张内容／名称／预留／copy／release／pin表，均不新增／改写预留或内容行，不声称认证计数表不变。
- 两角色的旧pin损坏时，预留未占新名也返回503 `GAME_NAME_STATE_UNKNOWN`，上述表保持损坏夹具原状；测试仅修复自己的夹具继续验证，不迁移实际历史数据。
- 另一作者可预留同名；原键返回原结果、换正文409、异键重名409、跨作者查原预留404。取消尚未执行的预留后可重新申请，分配不同ID；不是物理删除已创建游戏或完成A30。
- 管理员可预留另一作者的同名，profile仍为完整副本；作者仍为中立模板。注册完成后对象读／写计数均为0，拒绝前不加载来源或复制对象。

本批只改既有验证工具及文档；产品两文件与上轮冻结hash核同，不重跑未变SQLite专项／界面／规则／Trial／发布，不重建后台或原生束。工具语法、diff与文档链接检查通过；主动LSP300秒仍push-only未确认。完整复制／创作发布及物理删除释放仍未验收，A07保持部分。

## 后继：规范化同名预留与取消后的原键

继续复用 `verify_editor_template_root.mjs --reservation-only`，共同Request聚焦验证由7组增至14组；没有新增产品写路径或改变角色门。作者普通新建、管理员完整复制各自同时发起两个不同键的Request，名字分别为首尾空白包围的分解字符 `Cafe\u0301` 与已组合的 `Café`：

- 每对恰一项202、一项409 `GAME_NAME_OCCUPIED`；仅获准键产生预留／copy行，名称表只有一个规范化名称，metadata保存为 `Café`，profile仍分别为中立模板／完整副本。两作者可同时占用相同名称。
- 获准键重放返回同一结果；冲突键重放仍409，十张内容／名称／预留／copy／release／pin表全文不变，不把认证续期表算入这个不变断言。
- 取消尚未执行的获准预留后，重放其原键仍为原gameId的canceled记录，十表不变，不能复活名称占用；原冲突键以原正文再请求可预留不同gameId。已有内容、origin、对象、已用ID、release及pin表保持，注册后的对象读写仍均0。这里取消的是测试预留，不是已创建游戏的物理删除。
- 作者调用管理员复制入口、管理员调用作者新建入口分别403 `FULL_COPY_ADMIN_REQUIRED`，十表不变。初轮错误假设管理员可以走普通作者入口，收到403而非预期409，记录在 `name-reservation-combinations-tests.log`；核现行 `authorCopyAccess` 后纠正测试，不放宽权限。`tests-r2.log`与最终日志均14组通过。

证据位于 `.dragon-analysis/editor-completion/name-reservation-combinations-*`。使用实际共同Request、文件SQLite、FileBucket和41份固定来源注册；身份与旧正式pin仍为显式种子夹具。同进程 `Promise.all` 同时发起不等于跨进程数据库竞争、故障恢复或任意调度证明；没有HTTP登录／网络／浏览器、实际复制或发布。最终14项执行输入前后核同；不重建未变两束或重跑无影响长链。主动LSP与完整范围收据见 `name-reservation-combinations-final-hashes.json`，A07仍部分，完整创建／发布组合与A30物理删除占用释放仍未闭合。

## 后继：实际发布与创建预留联合验证

复用 `tools/verify_publish_operations_root.mjs`，本批30组通过，含实际共同Request、20章编译和发布1.0→1.1→1.2。源游戏仍由固定完整副本bootstrap建立、会话仍为种子身份；使用自有内存SQLite与临时FileBucket，不是作者空白创建、真实登录／HTTPS／浏览器或云发布。

- 首次发布后，作者通过真实 `POST /api/games` 分别尝试草稿名、当前正式名，均409 `GAME_NAME_OCCUPIED`，八张相关表不变且对象GET无新增。
- 后续改名发布后，名称表仍保留草稿名与新正式名；原正式名可由同作者新建预留并原键重放，得到不同gameId。取消该未执行预留后释放其占用，旧公告快照保持不变。未执行该新预留的复制，更不是物理删除已有游戏。
- 修正测试覆盖缺口：原发布晚失败fingerprint只比较十一张表，现纳入 `content_names` 共十二表；receipt触发器造成500后，包含名称占用的整组状态恢复，原键重试发布1.2成功。产品未改，旧“回滚快照包含名称表”说明已收窄到当时真实覆盖的管理上架路径。

证据：`.dragon-analysis/editor-completion/name-publication-reservation-20261029/` 下 `tests-r1.log`、`before.json`、`after.json`；378项选定工程源码／固定策略文件执行前后SHA一致，实际来源字节由既有固定加载器校验，不将378项称为全部传递依赖清单。工具语法检查通过；主动LSP仍push-only未确认。session全量限定路径另报一条GET带body警告，实际该处从原POST Request克隆并替换正文，保留POST方法，30组已执行该冲突分支；不为静态误判重写传输。另有await括号风格及库指纹拼写提示，未改变其正确语义或hash。未重建未改两束、未跑无影响浏览器／原规则回归或R2 staging选项。A07仍部分，完整创建／保存／发布组合、角色矩阵与A30物理删除释放仍须继续。

## 后继：已发布游戏的实际草稿改名保存

`node tools/verify_publish_operations_root.mjs --save-names` 在既有30组后追加六组，最终36组通过。新增选项走实际草稿Request、固定profile核验、不可变对象写入及同事务CAS，不使用prepared-snapshot替身；其余身份／完整副本bootstrap、内存SQLite／临时FileBucket边界同上。

- 已发布1.2的游戏把草稿改为自身当前正式名，保存到revision2，名称占用合为一行；再保存独立草稿名到revision3，重新形成草稿／正式双名。
- 两次保存均不改八张正式pack／pin／release／分发／公告／目录表；正式名称、简介、release ID与下一版本号保持，草稿新简介不会泄漏到正式版。
- revision3之后重放revision2及revision3两个保存原键，分别返回原历史收据，不新增对象GET；管理／名称／操作等十表不变。以旧revision2新键保存返回412 `DRAFT_CHANGED`，不改这些表或正式表；失败请求自身的draft_requests记录不在该不变声明内。
- 新草稿名与当前正式名均拒绝同作者新建预留；已释放的原草稿名可预留为另一gameId。没有执行该预留的复制，也没有物理删除。
- 新草稿再次实际发布为1.3，pack身份明确引用revision3，正式名称／简介切换为新草稿值；同名草稿／正式占用合一，原正式名此时才可由另一gameId预留。公告新版本位于首项，三个旧版本快照保持。

证据位于 `.dragon-analysis/editor-completion/name-draft-publication-20261029/`：`tests-r1.log`为先前五组增补的35组收据；最终`tests-r3.log`为36组收据，`before-r3.json`／`after-r3.json`的378项选定源码／策略SHA一致。r2因测试直接比较SQLite无原型行与普通对象而失败，字段值实际一致，已改为显式展开该测试行后复跑，未改产品；固定原始来源仍由既有加载器校验，不冒全部依赖清单。语法检查通过，主动LSP为push-only未确认，不宣称零诊断即clean。未改产品、未构建两束，未执行R2 staging、浏览器或原规则回归。该批证明完整副本发布→改草稿→再发布的名称／快照衔接，不冒空白创作起点；两作者完整创建／保存／发布矩阵与A30删除后的释放仍未闭合，A07保持部分。

## 后继：已发布草稿与收据的Request权限矩阵

在上述实际保存／再发布完成后，复用 `node tools/verify_publish_operations_root.mjs --save-names`，最终39组通过。既有 `verify_vps_draft_save.mjs` 已有两种非所有者的服务端口检查；本批补的是实际Request认证／CSRF／分派与已提交保存／发布收据的联合边界，不重复宣称新增产品权限。

- 另一作者、管理员、匿名各测试七种请求：读取revision3草稿、查询已提交保存收据、以所有者原键／新键保存、查询已提交发布收据、以所有者原键／新键发布，共21次拒绝。
- 两种已认证非所有者均404 `GAME_NOT_FOUND`，管理员的管理上架权限不等于可编辑他人草稿或代其定版；匿名均401。写请求提供合法正文及适用身份的CSRF，不用缺字段或错误CSRF掩盖所有权拒绝。
- 每次拒绝后比较21张内容／名称／快照／操作／草稿／copy／正式发布表的全表SHA，保持不变；对象GET与PUT计数均无新增。认证会话／限速表不在不变声明内，不能据此宣称请求没有任何认证侧写入。

证据：`.dragon-analysis/editor-completion/published-draft-authority-20261029/` 的 `tests-r1.log`、`before.json`／`after.json`。378项选定源码／策略执行前后SHA核同，工具语法通过。只改既有测试和本文／验收台账，未改产品。身份为种子会话，完整副本为bootstrap；不是HTTP登录、浏览器、多进程、异步读取期间撤销或全资源权限矩阵。A03／A29仍部分，管理员合法上架与作者合法保存／发布的正向路径由同一入口此前组覆盖。主动LSP仍push-only未确认；`mode=all`限定三文件报1W／7项await风格提示，warning仍为前述POST Request克隆的GET误判，不能称诊断全清。diff与文档目标检查通过，未重建未改两束或跑无影响浏览器／规则回归。

## 接续

后继[真实R2不可变对象基础](editor-backend-blobs.md)已接内部put/read与会话/作者复查，仍不是真实GameSource或依赖验收，delete503。根与依赖实际验收 → 固定源原子复制/准确草稿保存 → 工作台真实受权接线 → 持久编译/发布/上下架/公告与删除恢复；随后Trial与玩家目录/存档。阶段现有接口和测试引用不提前放行任何未完成步骤。
