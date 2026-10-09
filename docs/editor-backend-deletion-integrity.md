# 删除栅栏后的实际私有字节核验（E-01-BACKEND-DELETION-INTEGRITY-1，内部限定）

接续[元数据观察](editor-backend-deletion-inventory.md)与[Root PUT记录](editor-backend-private-writes.md)，新增`server/deletionintegrity.js#GameDeletionIntegrity.verify`及明确owned producer。全部459旧输入（含375玩家）、Root／认证／stores／inventory／journal／UI不变，461声明。**不是清理计划、持久capability、媒体／GameSource正确性、完整引用图、排空或物理删除**；无公开API，Blob.delete仍关闭。

## 受信内核及读边界

- 同SQLite principal，每次核mustChange、UUID、内置保护、实际owner或admin管理、used ID／未上架／持久fence的owner-row一致。foreign author先404，不泄漏栅栏。管理员仅在受信服务内作删除前hash观察，结果没有别人内容／bytes／keys／身份／凭据，不赋私有草稿取数权。
- 先捕获完整Game/fence及actor-epoch；所有native list/get／stream await和最终返回再查该身份。前后调用**现行真实inventory**，SQL关联／schema、双列表摘要必须相同。任何失效或变化只失败，不返回半份成功。DTO／digest不变成权限，服务不会接受客户端SQL／prefix／hash或伪valid。
- 固定`private/<UUID>/`完整分页、严格hash地址／唯一key／正size／etag／cursor；先预算再GET。对象get回传的key-size-etag必须同列表，实际全stream长度与SHA必须同描述／文件名。
- stream逐块增量SHA，不在本模块展开整文件buffer；未完成读失败时best-effort cancel并release reader。native provider自己的buffering／取消失败不能据此宣称I/O排空或整体heap上限；读失败无成功收据。
- 固定256对象、128页、每对象16MiB／全次128MiB、10万chunk是内部工程预算，不是原游戏规则阈值／媒体准入／云SLA。预算失败不作缺内容或删除完成。

## 观察不是跨服务原子快照

所有列出的当前private对象（含orphan）都实际校验；已知引用缺物理对象拒，而samehash在其它namespace不读取／删除。hash可相等但对象仍有unknown writer／引用／用途；untracked或uncertain可通过字节核验，仍不允许回收。

最终只给15字段：gameId、rowRevision、sqlDigest、inventoryDigest、byteObservationDigest、verifiedObjects、verifiedBytes、untrackedPrivateObjects、foreignRootReferences、privateWritesPending、privateWritesUncertain、原privateWriteCoverage／httpCommandCoverage、deleteAllowed=false，以及`VERIFIED_CURRENT_PRIVATE_BYTES_ONLY_NOT_DELETE_PLAN`。

结束再完整private列表及inventory对照。两相同列表和全SHA仅覆盖本次读取观察，不能排除ABA、旧native／external写者、未来表列／refs或随后变化，不锁住R2与SQL事务。两个journal计数0或byteObservationDigest不能被提交删除／发布／runtime当能力，**deleteAllowed恒false**。不持久保存内容副本或可恢复计划，不改row／modifiedAt或写journal。

## 实际证据

独立`.dragon-analysis/editor-phase/backend-deletion-integrity-session-r1`；已有MF/OpenSSL、白OS子环境、随机工程配置、owned OS temp SQLite/R2／HTTPS8787，所有源码／log／receipt wx。fixture继承前真实Root／journal／inventory，只有`/api/test/integrity`工程出口／控制；raw损坏、精确恢复或移除仅自有样本故障，不是产品绕过fence／修复／删除接口。

最终`main-r2`完整26组、266记录Node请求、22原metadata观察及10完整字节观察；非所有HTTP／云SLA。原十九command／inventory／private-write流程及预算完全原样，new七组：

1. 真实20章copy＋baseline＋saved2、data29/images7/queued fallback；85实际private对象共50,665,541B全native stream读、长度／SHA核验，get数等对象数、SQL/shared事实不变；真正starter/workerd重启同byte摘要。对象数／byte数仅样本，不作产品常数。builtin／UUID／未知／foreign author／缺引用精确拒。
2. 管理员对已fenced作者257B工程opaque对象只得到同owner最小摘要，无他人内容；原journal未知已提交4B／orphan确实可hash，但uncertain1／untracked1仍保、deleteAllowed false。opaque对象不是普通模板／玩法。
3. 原hash-key的实际同长度byte翻转：metadata仍有完整引用，但全body SHA精确503拒。显式第二fixture翻转恢复原bytes，非生产repair。
4. 十二独立native response控制：missing、get size／etag、非bytes／截断／超长／done类型／空chunk、per-object／object-count／total budget、重复cursor精确拒；total budget断言0额外nativeGET，不部分成功。
5. 实际GET回复暂停后改Game modifiedAt，晚回精确409；fixture恢复时间只是清故障，不冒生产回滚。
6. actual stream chunk读取后暂停，新增private orphan，最终列表变化精确409；移除只属owned forensic控制。
7. 实际password handler在body await撤旧session，晚回401；新的epoch只可新观察，不恢复任何旧操作／清理权限。

r1完整26组／252请求通过保三份源码与报告；只补fixture／producer的object-count／total／done-type／empty四negative controls，service byte完全同。r2从新的owned状态完整当前SHA跑26组／266请求；两轮status0／signalnull／errornull，无producer失败、延预算、拼成绩或放宽期待。精确派生／当前SHA／历史／imports、语法／链接／73Q、主动LSP／session-all另签。没有UI改，不跑无关browser／游戏／PNG／原机制回归，未读用户profile-IDB／DOS SAVE。

Jev只经preview审阅3810B人工工程摘要后固定jev-1.13.0 advisory，不传代码／资源／用户态／秘密或全日志，不作规则／期望／权限oracle。诊断unconfirmed不冒clean，不ignore／禁规则／清缓存。无commit/push/deploy/cloud/install/trust/SDK或共享清理；主goal active。

## 仍须完成

全部writer冻结及旧／external native在途保守处置、完整历史引用图／共享refcounts、提交重验、专属幂等physical delete／readback、全SQL内容与收据scrub、最小completed410、cache／实际backup清理和隔离恢复。公开删除／玩家410与完整§5.4／Q43／Q46／E09仍未交付；原初始化、G127/255、全消费者／RuntimeManifest／认证Trial及发布等其它目标不因hash观察解除。
