# Root私有PUT持久记录（E-01-BACKEND-PRIVATE-WRITE-JOURNAL-1，限定）

接续[命令关联](editor-backend-command-targets.md)与[只读删除观察](editor-backend-deletion-inventory.md)，不是排空或删除许可。新增`server/privatewrites.js#PrivateWriteJournal`；Root仅将原ImmutableBlobStore的bucket包装，installed目录仍原bucket；inventory接新表／三个摘要字段。其它455旧输入（含375玩家）不变，459声明；业务路由、认证、BlobStore原权限／完整读回、draft／copy／compiler／UI／引擎不变。

## 持久边界

- 同SQLite `content_private_writes`记录operation_id、game_id、文件名sha256、instance_id、pending/settled/uncertain、started_at/settled_at。没有正文／凭据／客户端权限。文件名hash不是该journal验证过的body SHA。
- Root私有PUT调用native之前同步事务检查持久fence并插pending；SQL插入失败不进native。UUIDv4私有路径严格核验。旧BlobStore仍先重查owner/epoch；adapter不是权限端口，admin删除权不赋他人私有写权。
- native PUT正常返回（包括条件不写的null）仅说明本次promise返回，标settled。随后原BlobStore仍完整读回与await后权限核验；fence可使外层409，不能把journal settled当内容提交／成功请求／可删证书。
- native失败／非法返回保持uncertain；未知结果可能已物理提交。SQL ack失败则pending保留。ack核原operation、instance、game/hash及pending状态；移除或篡改不归零／修复。新instance／真实重启不TTL清表，不自动认领、推断已完成或恢复写入；没有resolver或cleanup接口。
- get/list透明转发，不跟踪读取body／CPU或整个Job。delete仍拒`DELETE_FENCE_NOT_READY`。仅当前Root私有Blob PUT覆盖；旧写者／运维／其它进程、multipart、future uploads/releases/Trial/cache/backup与全部writer admission/drain未证。provider失败后是否仍可能提交不得猜。

## 观察与限制

inventory已知schema纳入新表与SQLdigest，返回新增`privateWritesPending`、`privateWritesUncertain`、固定`privateWriteCoverage:ROOT_PUT_ADAPTER_ONLY_LEGACY_UNKNOWN`。journal不是资产引用，不加入referencedHashes；pendingRecords原Job计数不冒journal计数。双扫描期间journal变化仍拒，两个计数0不认证全局排空；deleteAllowed永false。

该表保留settled记录供下一步可信核清；不是永久内容备份或删除完成策略。真实删除仍需所有writer冻结、在途保守处置／对象读回与专属／共享引用图、SQL内容及收据scrub、最小completed410、cache和实际备份清理／恢复。不能因本批完成开放物理delete。

## 后继严格写入命名空间（不授排空）

[维护源](editor-backend-private-namespace.md)：删除原非private-key直接nativePUT分支，unsupported namespace统一原PRIVATE_WRITE_KEY/无SQL/native；get/list/delete503与原ack/pending/uncertain语义保持。installed字节staging独立native端口、Root两个catalog只读；当前五writer族/装配/AST只签已核调用点，不签alias/legacy/futurewriter。72组含原67当前兼容，19坏key及实际installedroot-key/ALL-nativecounter不变、Root合法/条件null/fence/restart有证；473声明471旧保，coverage仍LEGACY_UNKNOWN，不授完整排空/delete。

## 后继当前实例已登记PUT等待（不授完整排空）

[维护源](editor-backend-current-write-wait.md)仅新增本实例live登记/finally通知与own订阅清理，原put/fence/pending/native/settled-uncertain及ack规则保；same-storage/actualprincipal服务在原freeze前后重核并有限等待，timeout不abort或清SQL，pending无本实例handle/跨restart、uncertain拒。最终83组原81当前兼容，旧源独立ack probe两故障误返200保，当前captured entry须actual ack成功及同tuple原行仍在，SQL假settled／ack后移除行均503不修SQL；实际两个native边界/并发/timeout/unknown/ack/restart/await坏MAC-column/实际改密与slots清理有证；475声明472旧保，current0不是wholeprovider/read/CPU/legacy drain，coverage/deletefalse全保。

## 后继当前读取调用退出（仍不授正文/provider排空）

[维护源](editor-backend-current-read-wait.md)：原journal get/list仍透明，新增登记在同Root BlobStore授权read、nativeGET之前，原GET/stream权限/长度-SHA/cancel核心不变；原调用返回或拒绝后finally通知，**不认证**body消费或cancel成功。same-storage原freeze有限等待只撤own订阅/timer，93组原92当前兼容、真实GET/read/cancel hold/超时/失败/latefence/MAC-column/实际epoch/restart，以及新outer await authority重查／独立inner末scope后真实fence第六查询409有证，r1旧源/report保；477声明473旧保，bodyDrain/nativeDrain/deleteAllowed恒false，无新表/公开route或全部read/writer closure。

## 当前实际证据

`.dragon-analysis/editor-phase/backend-private-write-journal-session-r1`：白OS子环境、已装MF/OpenSSL、随机工程配置／owned OS tempSQL-R2／loopback HTTPS8787；各producer1800s不延，源快照／日志／报告wx，无UI变不跑无关browser。

最终`main-r2`十九组184记录Node请求／20成功观察（不是全HTTP或云SLA）。旧十五组命令／inventory权限、真实20章fullcopy／baseline/save2/data29/images7/queued fallback、native分页／损坏／SQL-R2变化／改密／restart按原期待重验；新字段仅扩exact DTO断言。当前完整样本85物理元数据对象/85refs/371关联行、pending/uncertain0只是样本，非产品常数。

新增工程opaque bytes调用**实际生产Root BlobStore**（现有同SQL小工程game，不是GameSource／可玩编辑域）：

1. native PUT之前／之后分别暂停，fence实际提交后观察pending1；新Root写精确409且native次数不增。释放旧promise后journal settled，但外层权限409，物理orphan不假回滚；两个受测新写被原Blob权限门拒，不冒全部adapter入口已独立认证。
2. 实际native commit后注入未知失败，API500、uncertain1、未引用对象1；真实starter/workerd重启保持原记录／计数，未自动清除。
3. actual SQL INSERT trigger500，无journal行或native调用；native完成后SQL ack trigger500保pending1，真实重启仍pending，无假成功。
4. admin跨作者工程game写404且无journal/native变化；native完成后故意改捕获hash，ack精确503 `PRIVATE_WRITE_JOURNAL_CHANGED`保pending。fixture恢复原hash不是ack或生产resolver。

r1十八组通过保旧源／报告；人工补ack完整game/hash关联与受控坏tuple/foreign覆盖后r2全十九组从fresh owned状态重验，未拼旧green／失败碰绿／改预算。测试从原command-targets producer作精确派生，当前逆差与原十五流程绑定另签。

适用主动LSP／session-all、Jev人工最小工程摘要、SHA/imports／语法／链接／73Q与Root/inventory精确逆差另封存；unconfirmed不称clean。无commit/push/deploy/cloud/install/trust、真实DOS SAVE／profile-IDB或共享清理；主goal仍active。
