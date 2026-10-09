# Root私有写入命名空间封闭（E-01-BACKEND-PRIVATE-NAMESPACE-1，限定）

接续[原子SQL冻结](editor-backend-deletion-sql-freeze.md)，关闭一个已查证的底层写入旁路。只改`server/privatewrites.js#PrivateWriteJournal.put`：删掉非`private/` key直接转发原生PUT的分支。统一先走原严格UUIDv4／小写SHA key解析与sameSQL fence/pending门，其余方法和ack规则全保。并无已证公开路由利用此旁路；这是内部写入端口的工程封闭，不是新增原游戏机制。

## 当前调用点与权限边界

CodeGraph实际constructor／caller及AST复核，详见owned`writer-audit.json`的逐源SHA：

| 当前写者族 | 私有写入口 | 写后SQL门 |
| --- | --- | --- |
| AdminFullCopy | `admincopy.js:75 #put→blobs.putImmutable` | branded lease/epoch、copy_objects verified、创建Game/请求committed同事务 |
| PrivateDrafts | `drafts.js:146 #put→blobs.putImmutable` | 实际owner/fence/request、对象verified、savedCAS/refs/receipt同事务 |
| data | `datacompiler.js:88` | 实际Job lease、bytes、verified/heartbeat/checkpoint |
| images | `imagejobs.js:55` | Job lease/imageplan实际源、bytes、verified/checkpoint |
| fallback四实例 | `fallbackjobs.js:61` | 当前guard/imageplan、bytes、verified/checkpoint |

`worker.js:61–73`构造一个journal→一个BlobStore，以上五族共享同blobs端口（fallback四季）。`blobs.js:36`构造唯一规范private key，捕获bytes、native条件PUT后完整读回和每await owner/epoch/fence复查。Root原生bucket的另外两个目录对象是`InstalledSourceCatalog`，当前代码只GET／验证SQL登记，不PUT。实际字节staging在独立Node工具，非该journal写端口，不因这次变更取得private／删除权。

受查server代码AST dot-put原2文件3调用（含非private旁路），当前2文件2调用；putImmutable原5文件5点、EDITOR_BLOBS成员原1文件5点。保所有server JS SHA、caller地址及精确逆差。**这些只是列明的当前调用点与装配，不是完整别名／反射／运维／legacy或futurewriter闭包**。fixture继承的故障与opaque适配器有故意直达native的控制，明确不是产品Root调用图的一部分。

journal本身不是owner权限端口。它允许合法allocation复制尚无Game的private写，所以不能随意改成“必须Game已存在”。真实owner/epoch仍由原BlobStore与allocation/lease检查；管理删除权不授他人private读写。unsupported key现在422 PRIVATE_WRITE_KEY、无SQL/no native；get/list仍透明转发，delete仍503，所有coverage LEGACY_UNKNOWN和deleteAllowed=false保。

## 当前真实验证

owned`.dragon-analysis/editor-phase/backend-private-namespace-session-r1`，472旧输入基线／92imports；只有一个旧源获准改动并wx归档，其余471含375玩家保，新增verifier使473声明。Root、BlobStore、其它服务、表布局35/243、UI/引擎不改。白OS子环境／已有MF/OpenSSL／随机配置／owned tempSQL-R2／loopbackHTTPS8787，producer1800s不延，原67独立native通知240s及所有业务期待保；源码／日志／报告wx，无失败producer。

一次fresh`main-r1` **72组646记录Nodecalls**（含有界poll，非协议固定数），原67原期待当前兼容：真实全20章copy/saved2/data29-images7、R2长度-SHA／SQL冻结和外层回滚、真实nativepending/uncertain/ack失败保／late409、schema/MAC/refs／restart/改密、独立getter控制。仍不是完整媒体、战役／RuntimeManifest／全部六用途产物认证。metadata36／byte10／command10／Jobfreeze10／reference6／Draftfreeze8／SQLfreeze8，新增4最小namespace样本恒deleteAllowed=false。

新增五组：

1. only-fixture admin入口直调**实际生产journal**。19非private／实际installed root key／大小写／编码斜线／畸形UUID-hash／非primitive key逐项精确422，完整journal与所有原生PUT调用计数不变；独立读实际两个installed目录root字节长度-SHA前后同，不冒全部41/400资源重核。
2. 新控制端点自己实际admin/cookie/Origin/CSRF拒，无SQL/native变化；不是新增产品route或许可。
3. 独立owned opaque工程game经**生产Root BlobStore**合法三byte PUT／实际onlyIf冲突null，两次native调用／两个settled记录、created true→false、SHA读回保。opaque工程引用不是GameSource、普通模板或编辑域。
4. 同game实际永久fence后，rawjournal与Root validprivate PUT均409 GAME_DELETING且无新pending/native；installed roots bytes保。
5. 真实starter/workerd restart保原持久journal/fence、namespace422与fence409；spy计数器是instance内调用计数，重置0**不认证persisted work或native drain**。

计数器置于journal/原WriteFixture之下，计所有namespace native.put调用，不是只查private前缀的伪零；统计“调用”不等provider已经完成或对象commit。原正常／unknown／SQL ack故障规则按旧67当前重验。原SQL冻结r2 generic502细因仍未知，历史失败不作本轮成功，旧并发observer可靠性／云SLA仍未认证。

SHA/imports、旧源精确逆差、原67派生逆差与当前report14源/runner3快照、schema内存核、语法／链接／73Q／主动LSP和session-all／人工最小Jev另签，empty/unavailable/inconclusive不称clean。

## 尚缺与不授权限

全writer/legacy/external在途结果、native不确定性保守排空、全refs/shared归属、专属幂等physicaldelete/readback、SQL/receipt scrub、completed410、cache/实际backup与隔离恢复；RuntimeManifest/255/认证Trial/发布/存档及完整工作台/初始化原证仍缺。关闭底层非private写旁路不解决任何这些缺口，不关闭§5.4/Q43-Q46/goal。无commit/push/deploy/cloud/install/trust、DOS SAVE／实际profile-IDB或共享清理。
