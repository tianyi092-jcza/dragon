# 独立后台：真实R2不可变对象基础

范围`E-01-BACKEND-BLOB-1`，接续[真实账户](editor-backend-auth.md)及[同事务域元数据](editor-backend-metadata.md)，依据[工程合同](game-editor-technical-design.md)§1/4/5/6；不是完整草稿、资源管理、发布或删除交付。

## 已实现及接线

- `server/blobs.js#ImmutableBlobStore`使用实际R2 binding，`putImmutable/read`每次I/O前及所有await后重新查实际会话/作者/epoch；流读各段也查。`GameMetadataStore.blobAuthority`只允许自己的游戏，新建暂存需真正allocation对象能力，JSON复制或ownerId/角色DTO无效。管理员不能借管理权读写他人对象；内置原件拒写。永久已用ID缺游戏记录时不接受旧allocation重新开启。
- 键只由服务派生`private/<UUIDv4>/<实际bytes SHA256>`；不接作者文件名/任意key/外部URL。输入是自有Uint8Array，首个await前独立捕获，调用方随后修改不改变在途字节。不接受SharedArrayBuffer。
- `onlyIf: new Headers({'If-None-Match':'*'})`条件创建，existing返回null不覆盖；新建/已有冲突都实际get并流读核完整长度和SHA，不能只凭etag、checksums/customMetadata或自报hash宣布成功。同size坏字节拒绝，不自动覆盖修复损坏旧对象。读取不存在返回资源404，不推断整个游戏已删除。
- 默认单对象预算16MiB，可用安全运维binding`EDITOR_BLOB_MAX_BYTES`设有限整数1..64MiB；不是引擎规则阈值、整源容量或生产SLA证书。当前测试实际0/1/257/4096B及4097拒收，不冒16/64MiB压力、并发/线上CPU和内存验证。超预算请求在R2 I/O前拒绝。
- 只返校验后的自有bytes/摘要，不提供公共URL或内容cache；R2 httpMetadata标记opaque octet-stream/no-store，不将尚未验证文件作为图像、HTML或脚本公开。真正图片解码/重编码、源安全结构与依赖闭包仍须后续端口。
- `server/worker.js`装配内部对象层；无R2 binding时null，不伪造Map。`server/wrangler.jsonc`声明`EDITOR_BLOBS`及拟定bucket名`dragon-editor-private`，**未创建真实云资源**。启动器只已装Miniflare本机binding，持久化于独立`server/.local/blobs`，账户/元数据仍`server/.local/metadata`。根玩家wrangler和游戏部署不动。

参考[Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)：条件不成立put返回null，支持HTTP条件Headers，put/get/delete强一致； wildcard不可覆盖行为又由实际localR2双请求证明，不仅按文档猜实现。

## 明确关闭的能力

生产snapshot verifier仍未安装，创建/保存/上传/编译/发布API未开；工程fixture的JSON标记不是真实GameSource。真实R2字节读回不等于语义、安全、资源依赖或编译通过。对象不自动取得资产ID、引用登记、Trial或正式版身份。

`delete`默认503`DELETE_FENCE_NOT_READY`：拥有游戏或知道hash不证明无引用，也不证明已建立永久删除栅栏。没有因此单独删除已保存/发布内容，引用/物理删除/备份清理及任务重试仍待实施。会话撤销期间已开始的nativeput可能留下私有未引用暂存对象；完成返回401且不可取得元数据提交权，不假称R2与SQLite跨服务回滚，也不盲删可能被引用的同键对象。清理必须由后续受信任务/引用计划执行。

## 实际验证

先登记[准确I/O](editor-local-validation.md)：仅自有OS temp R2/SQLite、随机工程密码/密钥、已装workerd和HTTPS127.0.0.1:8787；无用户DB/IDB/profile/SAVE/DOS/云凭据、依赖安装、共享清理或部署。

`tools/verify_editor_backend_blobs.mjs`最终`backend-blob-session-r1/blobs-r4`九组：实际字节读回与首await捕获；真实条件创建/同key并发；实际两作者/admin跨读写拒且I/O counter不增加；allocation伪造与已用ID缺行拒/六坏policy；quota/长度/缺对象；nativebucket直写同size损坏后hash拒及不覆盖修复；delete503/生产上传404；实际账户停用发生在nativeget/put和已消费第一段R2流后仍401、重登录不复活旧token、私有暂存orphan如实保；workerd重启R2字节/SQLite所有权与会话保留。

fixture仅ignored工程验证目录，使用真实账户/SQLite/R2；JSONmarker初始根与绕过adapter的破坏写仅为工程对象，不冒真实GameSource/图片/正式发布。已消费流夹具把实际R2返回字节拆为两段后暂停，不自造正确的存储结果。

r1缺对象测试误查`[1]`，它恰是已写的1B样本，实际200而非预期404；原test/log保留，改用明确未写3B样本。同步补授权/完整性失败时取消已取得R2流，不吞主错误；r2完整通过。随后加实际部分流消费撤销，r3九组全部重跑，不拼接r2。浏览器r7driver误传`--out`给位置参数入口，安全路径断言在浏览器启动前拒，原driver/log保留；改正确参数，fresh browser-r8六组全部通过。之后Worker新增嵌套三元警告等价展开，blobs-r4九组/metadata-r6八组/账户auth-r14七组/fresh browser-r9六组四门全部再跑，源码/receipt另绑定；不是旧绿色或dispatch-only。

原375游戏输入及其余旧后台byte保持；定点四文件增量、新源码/测试/依赖/图片/失败/producer/文档链接与诊断另封存。没有运行无关87游戏全量或改规则/RNG，不称完整编辑器或全clean。

最终主动六源码0clean/1findings（36正确await括号hint）/5inconclusive，七文档初主动unavailable，矛盾“7confirmed clean”不采信；session276文件9既有warning保。无规则mute/cacheclear，不把静态语法/实际执行替代LSP确认。Jev仅3686B人工工程摘要经preview核验后固定jev-1.13.0 advisory，无秘密/资源/源码/个人资料/完整log，不代测试或完成门。

## 后继永久栅栏（限定，非delete开启）

[同SQL栅栏](editor-backend-deletion-fence.md)已接metadata BlobAuthority、prepare及Job等现行状态门，fenced目标的新读/写及nativeawait后返回409GAME_DELETING；实际四端口/SQL回滚/restart/epoch及20章fullcopy Root负控、旧库附件兼容有证。`delete`仍未开放、无核清或completed410；nativeput可能留orphan，引用/专属对象清理及备份保障仍缺，不推翻上面的关闭纪律。

## 接续

源根与依赖实际读取/安全验收 → 精确固定来源复制/草稿CAS及引用登记 → 私有工作台/Trial → 持久编译/发布/上下架/公告/删除及备份恢复。存储层不能提前放行这些未完成出口；线上bucket和专域配置/部署仍需另获授权。
