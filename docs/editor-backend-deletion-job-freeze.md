# 删除栅栏内的当前编译任务冻结（E-01-BACKEND-DELETION-JOB-FREEZE-1，限定）

接续[命令封存](editor-backend-command-proofs.md)及[Root私有写记录](editor-backend-private-writes.md)。新增内部`server/deletionjobfreeze.js#GameDeletionJobFreeze`；inventory仅增加known／scoped新表，其它461旧输入含375玩家保护，464声明。未装Root公开API／UI；原Jobs、Root、copy、Blob、认证、journal、游戏规则及资源不改。

## 同SQL冻结，不是native排空

内部freeze(tokenHash,{gameId,expectedRowRevision})在同步同SQLite事务中重新核principal／mustChange／owner或admin管理、UUID／内置、used ID、未listed、永久Game-fence及准确row CAS；foreign作者先404。跨作者管理不给私有Job内容／资源取数权限。

只处理**当前compile_jobs**：固定24列结构、最多10000行／编码4MiB，未知列或任务状态拒，非全SQL取数heap或云SLA。记录必须属于该Game作者，generation／revision／lease表示须有效。

- queued、running、可重试failed统一转failed、failure_code=DELETION_FROZEN、retryable=0；generation及row_revision各递增，lease_hash置NULL／lease_until=0，更新任务时间。
- ready和既有非retryable失败逐byte保留。checkpoint、stage cursor、attempt、引用、对象、快照、原操作receipt和Game内容／modifiedAt不动。不清除用户数据，不将失败改成ready或发布。
- 同一事务写`content_deletion_job_freezes(game_id,fence_revision,actor_id,before_digest,after_digest,freeze_mac,frozen_count,preserved_count,created_at)`。服务64hex key的固定域HMAC封存全部事实；actor_id只作内部动作身份，不输出给跨作者调用者。插记录失败回滚前面全部任务更新。
- 同Game／fence重放核seal及当前全部Job摘要／数量；坏MAC／换key、任务改变拒，不重新冻结或覆盖旧记录，真实重启不自动解除。缺key失败，不用默认秘密。MAC不抵御同时取得服务key／SQL写权者。

返回九最小字段：gameId、rowRevision、jobStateDigest、jobsFrozen、jobsPreserved、createdAt、nativeDrainVerified:false、deleteAllowed:false及mode CURRENT_COMPILE_JOBS_FROZEN_NOT_DRAINED。不是删除完成receipt／资产能力／成功运行资格。内部调用按准确Game-fence天然幂等；不存在新的公开POST协议／客户端请求键。

**native pending仍可能存在**。冻结不取消provider promise、清journal／uncertain、证明旧外部writer停机，不处理pending copy／draft、未来uploads／releases／Trial。原永久fence与现行提交／await复查仍是入口门。旧checkpoint晚到实测在既有GAME_DELETING门拒，不把这个错误冒充独立Job lease分支覆盖；SQL撤lease／generation的实际结果另核。

inventory纳入新记录的SQL摘要和associatedRows，不赋HMAC验证或删除权。零Job只证明当前表为空，不认证全writer排空；该表保留的摘要／计数不是可恢复内容备份。仍需全refs／legacy／共享引用、writer冻结及在途保守处置、专属幂等physicaldelete/readback、SQL内容及收据scrub、最小completed410、cache／实际backup和隔离恢复。

## 最终实际验证

owned `.dragon-analysis/editor-phase/backend-deletion-job-freeze-session-r1`，白OS子环境、已有MF/OpenSSL、随机工程配置／owned OS tempSQLite-R2／loopbackHTTPS8787、各producer1800s不延，wx源码快照／日志／报告。无UI变化，不跑浏览器或原机制回归。

最终main-r2 **40组399记录Node调用**、24 metadata／10 byte／10 command／10 freeze结果：原33流程／业务期待／预算原样当前兼容（真实20章copy／baseline/save2、data29-images7、native byte/hash及journal／命令／权限／改密／restart），不是全HTTP／全阶段或整战役成绩。

新增七组及独立控制：

1. 全副本实际ready data/images原行保，真实queued fallback转非retry终态；两个sameinput并发同最小结果，一封存记录。Game内容时间／快照及已封存command关系不变；foreign／strictfields／CAS拒。
2. 实际opaque工程Job claimed-running、真实fail生成retryable与非retryable失败，前两冻结、后者原行保；unknown state／未来列拒。actual SQL sealINSERT trigger500使全部任务更新／新记录回滚，明确retry成功。工程257B不是GameSource／普通模板或玩法域。
3. stored MAC、另一服务key、缺key、postfreeze row变更分别拒且不覆盖；owned精确恢复只是故障注入清理，不是生产修复。真实starter/workerd重启行／结果同。
4. 实际checkpoint verifier在native read后暂停，建立fence并freeze后释放，晚到409／原checkpoint仍空、terminal row完全同。
5. 实际Root nativePUT已提交但promise暂未返回，running Job冻结后pendingRecords0而privateWritesPending1；不提前ack或报告drain。显式fixture释放后journal才settled，外层仍409。
6. **零Job场景的原inventory native list暂停**，只新增freeze记录便令晚到SQL捕获409，验证scoped记录纳入摘要；非Job字段或内容更改。
7. 实际admin跨作者只管理最小facts，作者同零Job结果；实际password handler后旧cookie401，新principal重读永久freeze不恢复租约；公开delete404。

r1完整39组389记录调用通过、全部源码／结果保；随后只补key控制及零Job记录变化的晚到观察，module／inventory不变，r2从fresh owned状态按原预算完整40组重验。不是producer失败、延预算或拼旧green；有界polling调用数按各报告记录，不作业务固定常数。实施中两次非唯一edit均被拒无write，合并两白名单行后及时恢复误删的原三表名，均在实际producer前修正；最终inventory精确逆差仅两新增表名，旧表不丢。

Jev仅3927B人工最小工程摘要，经preview审最终state后固定jev-1.13.0 advisory，不发代码／资源／秘密／用户态／全日志，不作oracle／权限／完成门。主动LSP四source severitywarning零诊断但clean0／inconclusive4，七MD unavailable7／clean0；session-all362 files／27既有warnings／35warning-file hints，不workspace clean或禁规则／清缓存。SHA／imports、语法／链接／73Q另签；unconfirmed不是clean。未commit/push/deploy/cloud/install/trust、DOS-SAVE／真实profile-IDB或共享清理。四资源仍只读，G127/255／RuntimeManifest／认证Trial／发布／完整删除和主goal仍未完成。
