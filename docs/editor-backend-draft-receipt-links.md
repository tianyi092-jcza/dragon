# E-01-BACKEND-DRAFT-RECEIPT-LINKS-1 — 已提交私有保存回执的精确SQL链接（历史限定）

**后继当前existing冻结已接[copy永久保留键/元数据操作](editor-backend-copy-operation-links.md)**：exact37/CLI105组838调用/13facts/500输入108imports，create/new reservation保留/operation槽与初始JSON身份核；save checker本身未改，save不套copy reservation需求。下文35/82/499仅4c31历史切片，Root/其它门不变，fullsummary/ref/namespace/native/deletefalse。

## 范围与业务来源

新纯检查`server/deletiondraftreceipts.js#inspectCommittedDraftReceiptLinks`接现有`GameDeletionValidatedFreeze#checks`首末共同事务（含最后外部principal callback后的无callback扫描），原两freeze/HMAC/实际scope-session/schema/fence门保。不是新增观察器/schema/产品route/delete/410。Root/其它coordinator/wait未升级，[前继copy origin](editor-backend-copy-origin-links.md)原保护保留。

原Web写者/reader而非DOS机制：

- `drafts.js#receipt129-132`：同actor/op_key content_operations存在、请求摘要/auth_epoch/method save/target/原result_json相等；result.gameId/result.draftRevision对应request结果、修订为expected或expected+1，精确result_revision snapshot三refs等request。
- `#save156-197`捕获expected输入1..64十进制位，同metadata.transaction原子CAS/记录content operation/更新committed请求。`metadata.js#save169-179`内容/名称/简介无变化可保原expected（no-op），否则新快照；`transaction115-146`写实际summary JSON，随后draft写同saved对象JSON。
- `metadata.js#revision5/prepareSnapshot81-98`允许任意长度正十进制；**expected的64位限额不能推广到result**，64位全9进位可产生65位。只保expected界和精确expected/+1等式。
- 历史成功epoch仅在两个持久记录间匹配，不绑定当前owner epoch；结果不改绑latest；no-op可有verified而非committed的中间对象，不凭成功request强行改object状态。

检查仅目标canonical TEXT game、TEXT committed request：BINARY actual owner/actor/key/digest/epoch/method/target/完全相同JSON TEXT、精确结果snapshot root/source/dependency与decoded JSON game/revision。其余summary字段、完整内容操作/储备/审计/HTTP命令共享历史引用、typed BLOB/state别名、跨game反向及Source正文未认证。原reader JSON.parse语义保（重序/空白可接受，两个存入文本仍须相等），不冒严格SourceJSON证书。

## 预算与事实

DB32MiB，目标draft_requests/content_snapshots及按committed actor/key选择的content_operations每表10000、合计20000，NOT INDEXED有界投影；每回执SQL UTF8 byte8192、合计8MiB。query/shape/target/budget/links固定503，不回原始SQL/内容或全局count。预算非heap/CPU/provider SLA。非committed请求不获得successreceipt父需求，也不宣称安全删除。

当前exact35=前继34加`draftReceiptLinksVerified:true`，mode `CURRENT_DECLARED_SQL_AND_DRAFT_RECEIPT_LINKS_FREEZES_ATOMIC_NATIVE_UNKNOWN`；indexContentIntegrityVerified/rowIntegrityVerified/nativeDrainVerified/deleteAllowedfalse，pendingjournal1unknown。facts/seal/hash不是随后操作的权限或持锁快照。

## 当前验证与更正

owned `.dragon-analysis/editor-phase/backend-draft-receipt-links-session-r1/`，唯一前继receipt `ffbd6ee0bb4fad272b441d394907a2407239679b202cd5688a5228802495b457`。两旧源先wx归档，显式I/O保持375玩家、原oldCLI同process委托、1800s/白环境不改。

最终fresh **main-r3 82组655记录HTTP调用/12exact35 facts/36报告源/4同期wx源码**。前继59字符串/全部权限-status-code-hook8/10-预算-35行目录databaseSize-sealsrollback期待保。17真实错operation/request/ref/JSON/8193B拒且坏sample原样、三no-op/旧saved/current2/changed成功与独立65位carry正例；两seals后/最后callback DELETEcontent_operation精确503并全部SQL/原两freeze/seals rollback。旧restart/password/missingtable/publicdelete404仍在当前suite，不追认完整provider。

committed success与epoch37为**手工工程SQL，不是正常GameSource/save/PUT**。当前noncommitted pending仍被原freeze终态化，committed1原样preserved；原8facts的copy计数与身份不变，四新增facts各自目标/committedPreserved1，不能盲比全部facts。no-op sample verified对象合法；未读取/写R2正文。

首轮main-r1完整81/649/11通过但无carry覆盖；人工重新核writer发现新helper错误限制result64位。原helper/fixture/producer/model和报告wx保，移除不受writer支持的result cap、保expected界及精确+1、新native和Node carry后main-r2完整82/655/12通过（旧81字符串不变）。不是放宽错误期待或盲重试，carry-review记录来源。辅助no-flag-argument warning：仅newfixture布尔changed参数改直接revision业务值（原1/2分支语义同），归档源后main-r3完整82字符串同r2，产品/producer byte同。

Node完整35DDL模型最终**memory-r3 31组**，独立actual SQL wrong/missing/BLOB/JSON行为/no-op/+1/old-epoch/old-revision、单/总row与UTF8byte预算、64→65进位；size/query/nullcursor为synthetic。Node page pragmas不冒workerd能力/Root权限。原30/31报告和source保；r3给模型/helper/固定DDL SHA并在执行前wx保存实际模型/helper源码、meta/log另签，原checks精确同。无native/model producer失败，不清历史。

静态须核499声明/496旧含375玩家/107imports、两旧源归档及完整来源/反向diff/旧59字符串/模型31/新35facts、links73Q/syntax/diff/主动LSP/session-all/人工审过Jev另签。silent/inconclusive/unavailable不clean；new URL auxiliary误报须基于实际WHATWG Request及原Root.fetch109-112 try/await/catch精确记录，仅session false-positive，不inline ignore/禁rule/cache/trust。UI/玩家/媒体/原机制未改，不重跑无关browser/gameplay。

## 仍开

完整summary/typed别名/跨game/shared/history/content-command-receipt/actualSource依赖bytes与pinnedpolicy、全部Root-submit/coordinator/wait；writer/read/body/provider/CPU/legacy/external/unknownjournal；专属physicaldelete/readback/scrub/completed410/cache/实际backup和隔离restore；RuntimeManifest/Q69/255/认证Trial/release/fullworkbench/原初始化/73Q均open。无commit/push/deploy/cloud/install/trust/真实SAVE-profile-IDB/共享清理，主goal active。
