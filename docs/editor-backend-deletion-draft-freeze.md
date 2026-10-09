# 当前私有草稿任务冻结（E-01-BACKEND-DELETION-DRAFT-FREEZE-1，限定）

接续[CompileJobs冻结](editor-backend-deletion-job-freeze.md)，新增`server/deletiondraftfreeze.js#GameDeletionDraftFreeze`可信内部service，不装公开Root端口／UI，不开放物理delete。只inventory捕获新记录、固定列布局增加声明的第35表；470声明／其它466旧含375玩家保护。Root、PrivateDrafts、认证／其他store／引擎／资源不改。

## 状态与权限

- actual同SQLite principal／mustChange、owner或admin管理、非内置、UUID／usedID、未上架、准确Game-fence及rowCAS在同同步事务中复查。foreign作者先404，管理员管理不授他人private read。
- `draft_requests`当前17列／无隐藏列，当前row的actor-owner、key、请求摘要、epoch、期待revision及pending/failed/committed状态严格核验；pending不能夹带result／error／root／completed等残值。10000rows及单encode4MiB是工程预算，不是原机制、完整SQL取数heap或云SLA。
- 仅pending→failed，error_code=DELETION_FROZEN、error_status=409、completed_at写本次时间。没有draft lease或generation，不能谎称撤销它们。既有failed、committed逐field保持；作者正文、request digest／epoch／修订、对象和references、成功receipt、快照与Game内容／modifiedAt不变。
- 当前PrivateDrafts的owner后GAME_DELETING门已禁止后续pending新建／failed重启／完成／catch错误写回。本轮不改这些路径。冻结不是取消provider，原body在SQL中仍保，未做内容scrub。

## 原子与重复

新增同SQL `content_deletion_draft_freezes`最小game/fence、actor、前后请求摘要／数量／时间与HMAC-SHA256。固定域draft-request-deletion-freeze-1及服务64hex key，constant-time核seal；不保存作者正文／凭据／bytes。SQL插记录失败回滚此前pending更新。按game/fence自然幂等的内部方法不是新的publickey协议或成功删除receipt。

再次调用须actual当前请求摘要／数量及原seal同。缺／换key、坏MAC、后续row变更拒，不覆盖、不reseal、不TTL修复或unfreeze。MAC不是权限／排空证书，SQL与服务key同时妥协不在保障内。

inventory已知schema／scoped捕获新表且每await复查；旧DTO／deleteAllowedfalse保持。fixed layout35表243列，仅新增该9列布局，旧34逐属性同，纯内存Node SQLite核当前声明DDL；不是全面DDL／trigger／未来引用语义认证。

## 实际当前验证

owned `.dragon-analysis/editor-phase/backend-deletion-draft-freeze-session-r1`：既有MF/OpenSSL／白OS环境／随机工程配置／owned tempSQL-R2／loopback HTTPS8787；源快照、日志、报告wx。producer1800s、step预算原样；新43MB全源save到native控制独立240s在**首次执行前**明确，不套用原4B测试的短poll，也未因失败延时。原52期待不变，只有新表要求原列manifest明确更新35；原34源码SQL／布局仍逐项核。

`main-r1`一次fresh完整59组／543记录Node调用通过（polling调用数不是固定协议）；36metadata／10byte／10command／10CompileJob freeze／6reference／8draft-freeze结果。无producer失败、timeout、拼green或放宽错误。

新增七组：

1. 真实原副本保存2的committed请求；foreign／strictfield／builtin／UUID／CAS、unknownstate与实际ADD COLUMN拒，onlyfixture精确恢复。
2. 零pending时原committed全行、receipt／snapshot／对象／references／Game内容时间不变，只插一最小freeze记录。
3. storedMAC／换缺key／实际request状态变更拒，onlyfixture精确恢复后重复同结果；actual starter/workerd重启行／结果同。
4. 真实第二20章完整副本：Root staleCAS保存实际failed，另一个保存到native PUT已commit后promise暂停；fence后SQL seal INSERT trigger500回滚pending更新，明确retry／真实并发同结果、一record，仅pending转failed而原failed全保。SQL pendingRecords0但privateWritesPending1，不是drain。
5. release原promise才journal settled；旧Root save晚到准确409GAME_DELETING、catch不得覆盖冻结请求或提交snapshot；原key再保存409且native次数不增。不能把错误归因于不存在的独立draft lease门，也不假R2 rollback。
6. foreign零draft的actual inventory list暂停，仅插freeze record使晚到原capture409，证明新scoped记录参与摘要；实际owner和admin只得相同最小facts。
7. actual改密oldtoken401／newprincipal重复永久freeze，不恢复请求；publicdelete仍404。

原52全链当前兼容包含完整20章／baseline／保存2、真实data29/images7／queuedfallback、85对象50,665,541B全native长度-SHA、journal／command MAC／CompileJobs冻结／columns／显式多重边及provider坏值／SQL-nativeawait／rollback／restart／actualpassword。样本数不作产品常数，不冒全六用途、browser、媒体或完整战役。

所有schema扩展、原producer派生逆差及当前源码／wx快照／reports、SHA-imports、语法／链接／73Q另签。适用主动LSP5paths全部inconclusive、无warning不称clean；七MD unavailable，session-all保既有warnings。Jev只人工3687B工程摘要，审preview后固定jev1.13.0 advisory，不发code/resource/secret/userstate/full日志，不作oracle／权限／完成门。

## 未完成

冻结结果恒nativeDrainVerifiedfalse／deleteAllowedfalse。copy及legacy／其它进程／future uploads/Trial/releases等全writer、native未知结果保守处置／真正drain、全legacy/sharedrefs、专属物理delete-readback、SQL内容及收据scrub、completed410／cache／实际backup和隔离恢复仍缺；不能用本记录或零计数授delete。未知初始化／G127/255／全部consumers／RuntimeManifest／认证Trial／发布／正式存档等旧限制及四资源只读保持。主goalactive，无commit/push/deploy/cloud/install/trust、DOS SAVE／真实profile-IDB或共享清理。
