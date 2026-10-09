# E-01-BACKEND-COPY-OPERATION-LINKS-1 — 复制永久保留键/元数据操作槽（历史限定）

**后继当前冻结已接[target编译操作/原enqueue链接](editor-backend-compile-operation-links.md)**：exact40/CLI115组913调用/14facts/501输入109imports；目标op actor-key-method/恰一enqueue与canonical UTF8 SHA、多retry-currentrow可保但retry digest验证false，孤儿反向未知。copy helper未变，下文37/105/500对应26514本历史切片，Root/其它门不变、fullrow/ref/native/deletefalse。

## 原Web业务证据与范围

`server/deletioncopyoperations.js#inspectCopyOperationLinks`纳现有ValidatedFreeze首末同SQL checks，原两freeze/HMAC和最后callback-free actualscope-session保，非新增观察器/表/产品route。只选当前canonical TEXT game的committed copy，既有Game没有copy时明确vacuity（actualGame权限由调用者原门核）。原Root/其它coordinator/wait不变；不授物理删除。

主要来源（owned preflight/contracts绑定原源码SHA）：

- `AdminFullCopy.reserve37-50`同事务插`content_reservations(actor,key,create,new,digest,epoch)`/预占名/目标copy请求。允许Game尚未创建。
- `#execute101-110`调用`metadata.transaction115-146`同actor/key/create/new/requestdigest，核reservation method/target/digest/epoch、创建Game并插content_operations，origin/copy请求/objects同事务commit。**reservation不被消费/删除**；原body及server literal写者扫描撤销“完成会消耗保留键”的初步猜想，未按猜想实现。
- `metadata.summary13-15/create159-168`：content operation存11字段元数据summary，初始gameId/ownerId/draftRevision1/rowRevision1。它不是copy请求四字段source/baseline receipt，不能比较两JSON文本，不能把创立summary重新等同latest后续状态。
- `PrivateDrafts.save156-197`不用content_reservations；cancel/preGame也不能强加success/Game/origin需求。Root.contentKey247-253只核sameactor-key/固定namespace，独立actor同key可分立，不冒全历史/未来namespace与别名认证。

新检查仅native TEXT/BINARY sameactor-key的reservation与content_operation互一、create/new/digest/storedEpoch等目标copy、actualgame owner。JSON只核game/owner/initialdraft-row1与plain object；**其余summary、typed BLOB别名、反向/其它game/shared/history/generaloperations/全部namespace与Sourcebytes不认证**。storedEpoch不currentowner，历史creation不latest；no-copy vacuity不是Game/删除认证。

DB safe非负32MiB、固定每查询LIMIT2、单operation JSON8192 UTF8B；QUERY/TARGET/ROWS/BUDGET固定503，无SQL内容泄露。预算非heap/CPU/provider SLA。当前exact37=前继35加copyReservationLinksVerified/copyOperationLinksVerifiedtrue，mode `CURRENT_DECLARED_SQL_AND_COPY_OPERATION_LINKS_FREEZES_ATOMIC_NATIVE_UNKNOWN`；indexContent/fullrow/nativeDrain/deletefalse，pendingjournal1unknown。

## 当前证据

前继draft-receipt receipt `4c31c7cfef005171c02df85189388aed168f42038c8b0a7baac0b6187ea4533e`，owned `.dragon-analysis/editor-phase/backend-copy-operation-links-session-r1`，两旧源先wx归档，375玩家保、oldCLI同processimport/1800s/白环境/4同期wx源保。

最终fresh **main-r2 105组838记录HTTP调用/13exact37 facts/38报告源/4同期wx源码**，前继82字符串/所有权限-error-hooks8/10-预算/全35行目录databaseSize-two-sealsrollback期待保持。20真实missing/wrong actor-key-method-target-digest-epoch/JSON identity-revision-shape/8193B拒；旧epoch37/currentdraft2但initial1元数据操作正例，两seals后/最后callback实际DELETEreservation精确503与完整SQL/两executors-seals rollback。继承currentrestart/password/missingtable-no-recreation/publicdelete404仍覆盖。allcopypositive由新owned override补**工程**reservation/op，不是原Source/copy/save/PUT/完整summary证明。

Node完整35DDL **34组**、实际tuple wrong/missing/BLOB/float/state/JSON identity-revision与budget/no-copy vacuity、重序/空白语义；size/query/nullcursor为synthetic。真实模型/helper执行前wx源码与3sourceSHA/meta另签，Node page pragmas不冒workerd/Root能力，nativeAuthority/sourceBytes/fullSummaryfalse。

## 保留故障与修正

- before-any-native re-read原parent方法为seedCopyOrigin，非猜测seedOrigin。保未运行草稿/dispatch-review，仅新override和super call改实际名字，不编造failed执行。
- main-r1原82与20新坏关系共102已验后，新positive freeze caller漏admin参数，实际401 LOGIN_REQUIRED（822调用）；4源/完整log/failure保。源码直接定位`action(v,s)`未传session，没有改Root/fixture/product/期待/预算，仅该newcaller补actualadmin并fullfresh r2，产品/helper/fixture两轮byte同。不是historicalepoch权限回退或盲重试。
- 主动LSP两个aux findings newURL与JSON.parse位于ownedhandle7:32/2132，实际WHATWG Request及原EditorMetadata.fetch109-112 try awaitthis.handle(request)/catch(HttpError or INTERNAL_ERROR)闭合。仅exactsession false-positive，两位置须明确，不inlineignore/禁rule/cache/trust；hidden finding不clean。silent/inconclusive/unavailable另签。

500声明497旧375玩家保/108imports，35表243列70对象不变；静态source/import/history/SHA/反向diff/82原字符串/37facts/模型34/links73Q/syntax-diff/LSP-sessionall/审过最小Jev另签，未跑不冒全workspace clean。UI/player/media/原规则未改，不重跑无关browser/gameplay。

## 仍开

完整元数据summary与namespace/typed/reverse/crossgame/shared/historical/content-command-audit refs/Source依赖bytes/实际pinnedpolicy、所有Root-submit/coordinator-waits、writer/read/body/providerCPUlegacy/unknownwrites、exclusivephysicaldelete-readback-scrub410-cache/actualbackup隔离恢复、RuntimeManifest/Q69/255/认证Trial/release/fullworkbench/原初始化与全部73Q仍open。无commit/push/deploy/cloud/install/trust/真实SAVE-profileIDB/共享清理；主goal active。
