# E-01-BACKEND-SNAPSHOT-1：分块规范源与本机 HTTPS

本批是独立后台的**内部草稿结构验收端口**，不是完整编辑器、运行/发布许可或线上部署。用户m6873已授权从零建设服务，m6911要求专用后台域名、不影响玩家部署；本机入口仍`https://127.0.0.1:8787/`。账户、[元数据](editor-backend-metadata.md)、[R2对象](editor-backend-blobs.md)仍为真实服务，不复用无认证文件harness。主目标继续，不能据此关闭。

## 1. 实际容量与不变边界

固定已批准Web `map-2-47e358…/game-source.json`实际43,308,095B；规范JSON43,308,094B，map字段40,624,149B。原文件SHA `2dba072a8b98ecfe9e78793dadf767718e13886829e24d821a629916870c60ff`；规范摘要`87742af76b54a13711541eefbb2dd2066ba06d30602027b9bfcf9ae43bf9f2b1`。不移除地图、不拿小JSONmarker代完整源，不改原格式、默认包或共同规则。

旧R2默认单对象16MiB并不证明整源可收。本批使用1MiB分块及实际读回的规范索引；每块至多4MiB、索引至多1MiB、1..4096块、总源默认64MiB，均为有限工程预算，不是游戏容量规则或线上CPU/内存/SLA证书。实际样本42块。测试赋予新gameId与明确metadata后规范源43,308,018B，与只读原文件大小不同是身份/文字变化，不是丢字段。

上批388封存输入中仅`server/metadata.js`两处接口适配及本机launcher改变，旧两文件先按原SHA完整归档；其它386（含375游戏源码/资产）逐轮不变。生产Worker、认证、BlobStore、根玩家`wrangler.jsonc`、原compiled源、旧副本/存档没有改动。无DOS/SAVE/用户IDB/profile、安装/全局信任/云秘密/资源创建/部署/commit/push。

## 2. 规范JSON与物理/逻辑身份

`web/src/content/authoring/sourcejson.js`：对象键排序、数组顺序保留；读取own descriptor后才取值，拒getter/hidden/symbol/洞/循环/非普通对象/非JSON值、非有限数/-0/不安全整数、孤立代理与危险对象键。作者字符串不按这些键名全文封禁。UTF8可跨块；fatal解码，拒BOM/坏UTF8。增量parser拒重复/未排序键、非规范数字/转义、空白/多根/尾逗号与未完成token；默认64层、400万节点、单token1MiB，不能由无界参数取消预算。

encoder不拼接整源JSON字符串，但host捕获仍持有全体私有byte chunks，**不是零内存流式上传器**。测试用自己的编码Worker structured clone在first await前捕获并transfer buffers，finally终止；不继承秘密或接触文件系统/DOS。

内部索引`dragon-game-source-index-1`包含精确gameId、逻辑sourceDigest、sourceByteLength、顺序chunks和dependencies。每块及索引由真实BlobStore读取、长度/SHA与权限校验，规范解析重建完整逻辑源；摘要覆盖原UTF8字节而非重新序列化掩盖坏输入。完整源身份、规范metadata和共同`validateGameSource(...,{draft:true})`复查。draft结构诊断不冒严格compile成功。

物理索引SHA不等逻辑整源SHA。`metadata.prepareSnapshot`仅增加真实tokenHash/allocation传入可信验收端口及`rootDigest`物理键检查（旧单对象端口允许原sourceDigest fallback）；逻辑/依赖/物理三摘要仍严格hex校验。没有增加SQL列、伪造已提交record、接受客户端valid:true或从gameId JSON重建allocation能力。

## 3. 依赖与未安装门

dependencies与源assets按稳定资产ID精确对应SHA/长度/mediaType/role；每项实际读回，最终再查根对象权限/epoch。仅已安装的opaque data/octet-stream路径可收。PNG/portrait等尚无真实解码与受信共享资产端口，明确503 `SOURCE_ASSET_NOT_ADMITTED`，不拿PNG签名或hash当安全图像验收。

共同原生初态/compatibility delta、原始来源与可信复制、角色/任官/缓存初始化、完整资源消费者/Q69、运行/Trial、编译发布仍开放。**生产Worker没有安装本批snapshot verifier，也没有公开创建/保存/上传/编译/发布API。** 真实43MB验收只在ignored隔离fixture安装端口；R2由host特权夹具预置，不是作者上传入口，不能据此宣称后台可复制或保存完整草稿。

## 4. 真实cap生命周期与传输排查

第一次host R2 conditional put把Node Headers交给MF代理，序列化失败，改为host-only普通条件对象；重复fixture对象先真实读取/hash复核才复用，冲突不覆盖。生产BlobStore不变。

随后43MB host staging期间真实cap Map不再保留，实际404发生在allocation门，**不是源parser成功或失败证书**；没有证据证明具体回收原因。自己的活动子进程只用实际已认证会话维持已有cap，编码线程避免阻塞父I/O；重启后pending cap丢失仍必须404，不从DTO复活。

多轮原生本机workerd HTTPS出现有200/422/503 headers但正文0B、ECONNRESET或SDK Undici terminated；所有失败/sourceHash/旧producer保留。一轮Fetcher诊断曾全过，正式binding复验仍失败，因此撤销稳定通过推论；SDK getWorker是代理Fetcher，不是纯内存独立传输。

独立4/6秒async等待与busyloop均成功，不能推为统一5秒阈值；精确Content-Length、连接、chunked、响应缓冲和限定TLS1.2均未闭合原因。HTTP对照两轮、NodeHTTPS→own WorkerHTTP对照两轮完整通过；相关公开问题/SDK PR只是调查线索，不声明它们证明本机根因，也未patch供应商/全局配置。

`tools/editor_local_https.mjs`现在用于**本机启动入口**：外部Node HTTPS127.0.0.1:8787，内侧MF HTTP只127随机端口；SDK dispatchFetch保持原HTTPS URL，仍执行Worker Origin/CSRF/主体/epoch/SQL/R2权限。固定Host检查，丢弃caller-selected转发/MF/CF等非允许header，16KiB JSON限制，实际读回response bytes后派生长度，不猜Content-Length。一天RSA2048工程自签证书仅own OS temp、用已装OpenSSL生成，关闭清自己两文件；不读真实证书、不改信任/安装。Cloudflare线上edge TLS及玩家部署不受影响。

## 5. 当前完整执行与限制

证据目录`.dragon-analysis/editor-phase/backend-snapshot-session-r1/`，各轮wx日志/状态、源码/输入SHA保；失败不是skip或pass。

- `codec-r5`：91正例、38拒收，固定完整源规范摘要/UTF8跨块/共同canonicalDigest等值，原文件byte保。Node时间不是Worker/SLA。
- `snapshot-r19`：真实新本机HTTPS完整7组通过；`snapshot-r20/r21`：完整8组（r21绑定最终源码）通过，新增Host400、Origin/CSRF403、超预算413、转发header不能改身份。源完整读/hash/共用draft/SQL commit、两作者和管理员跨作者拒、索引/hash/预算/缺对象/坏JSON/common结构、opaque依赖与image503、R2SQL重启/会话/失cap404、生产写404均真实执行。创建耗时观测约5秒，不作阈值或线上承诺。
- `binding-r3`：最终Worker服务绑定代理7组通过；内部路径不是独立公开TLS或内存传输证书。
- 同当前产品源码重新串行`blobs-r7`9组、`metadata-r9`8组、`auth-r17`7组、实际launcher/fresh browser `browser-r12`6组。浏览器IDB0、外部请求0、pageerror0，预期console按精确路径登记；没有执行完整历史游戏库存。

Nodecodec的sparse negative改为同语义elision、结果stdout改write后r3复验，随后增加accessor执行0显式断言并r4完整重跑；不把洞改为空数组迎合lint。14条test-only日志警告按精确file/line/message裁决FP，安全分类仅SHA/boolean/路径/status，不输出秘密/整源。另三条codec无用regex转义警告等价删除（两类全部65536个UTF16 code unit共131072 predicate等值），旧byte/日志保，codec-r5及其它六门在最终源码下全部再跑。最终主动16路径outcomes0clean/2findings（仅35正确await hint）/8unavailable/6inconclusive，工具矛盾“8confirmed clean”不采信；session278文件26warning包括14已裁决test日志/3已修旧regex缓存与9旧项，缓存不清也不当clean。最终主动诊断、语法、两处metadata与launcher逆delta、旧输入/日志/图片/当前producerSHA及链接/Q1–Q73另封存。Jev只人工小工程摘要经preview后advisory，不传源码/资源/快照/凭据/完整日志，不作原证/验收/目标完成门。

## 下一实施边界

仍须真实受信来源与source/resource delta验收、完整依赖/图片/共同runtime gate、受权复制/草稿API、持久编译任务/状态恢复和发布链。不能为启用接口把未完成门改成valid DTO、admin豁免、补初态或latest回退。局部完成不阻其它已授权工作，主目标继续。
