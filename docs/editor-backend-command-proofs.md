# 命令目标关联的服务完整性封存（E-01-BACKEND-COMMAND-PROOFS-1，限定）

接续[结构关联](editor-backend-command-targets.md)。原结构门只核命令和同actor的真实request／Job存在；**另一个合法同actor目标也存在**并不能单独证明它是该已绑定命令的原目标。本轮实际错误配对控制验证此边界：旧inventory仍是UNKNOWN只读观察，新服务HMAC检查拒503。不是客户端漏洞放行记录，不将旧报告追认成proof检查／完整引用图。

## 同SQL最小proof

`HttpCommandTargets(storage, requestKey)`增加`content_http_command_proofs(kind,actor,op_key,game_id,target_id,binding_mac)`，与原关联同主键。Root及stageAPI仅传既有服务64hex requestKey；不传给客户端、日志或DTO。固定`http-command-target-1`域的HMAC-SHA256覆盖kind／actor／command key／game／target及实际命令的request_digest／auth_epoch，以固定JSON数组编码。constant-time比较，坏字段或MAC为`COMMAND_TARGET_PROOF_CORRUPT`；没配置密钥不写proof，明确503，不用默认秘密。构造只建表，不将缺配置改成认证启动崩溃。

- 实际Root／stage原命令绑定事务调用record，**先**沿原真实权限／epoch／owner／fence与原命令摘要门，随后核实际同actor request／Job。原binding、target和新proof同SQL事务提交；proof INSERT失败三者一起回滚。
- 已有proof必须匹配实际关联及当前命令摘要／存入epoch，坏值不覆盖。既有缺proof行不在观察中自动升级；只有准确同键、原固定body并通过当前真实Root授权／命令摘要／目标检查的重放才补proof。缺关联但proof尚存时，合法重放须核原proof后才能重建该相同关联。
- 服务密钥改变会使旧proof验证失败，不猜迁移或重封存；需要另获范围明确的恢复流程。MAC防未持有服务密钥的错误改配，不保证抵御同时取得服务秘密／SQL写权的攻击者。
- proof是内部数据完整性封存，**不是**原命令执行归属、成功receipt、真实owner/session权限、Job lease、资产引用能力、whole runtime或删除授权。所存旧auth_epoch只是被封存命令字段，观察者仍须当前实际principal。

## 独立只读核验

同模块新增`GameDeletionCommandIntegrity({storage,principal,targets})`内部observe，未装公开API／UI。actual同SQLite同步事务验证principal／mustChange／UUID／builtin／owner或admin管理／used ID／未listed和准确Game-fence，foreign作者先404。

只核当前game明确关联的真实命令／request-Job与proof；发现该game的孤立proof而对应关联不存在也拒。返回八个最小字段：gameId、rowRevision、associationDigest、sealedTargets、unsealedTargets、deleteAllowed:false、固定coverage `BOUND_COMMAND_PROOFS_ONLY_LEGACY_UNKNOWN`及mode `VERIFIED_BOUND_COMMAND_ASSOCIATIONS_NOT_DELETE_PLAN`。不返actor、命令键、target、MAC、bytes或内容。关联／proof各≤10000、编码≤4MiB为工程预算，不为全SQL分配／provider容量保证。

旧无关联的digest仍不可反解，此服务不推断全部legacy行／共享refcounts。缺proof计unsealed，不给完整历史准入；即使unsealed0仍不能宣称所有命令已索引。删关联且留下proof不是无历史，可观察503。

inventory纳入新表schema及该game proof行的SQL摘要／associatedRows，**不在原observe中假称验证MAC**，原DTO、legacyUNKNOWN／deleteAllowedfalse不改。字节核验仍是原body观察，不认证proof／跨服务atomicity或writer drain。

## 最终实际证据

`.dragon-analysis/editor-phase/backend-command-proofs-session-r1`：461输入／87imports基线全核，四旧源wx归档；仅commandtargets／Root／stageapi／inventory允许变，其余457含375玩家保持，新producer使462声明。所有UI／认证／BlobStore、fence、journal、integrity、游戏规则／资产不变。

最终main-r3 **33组318记录Node请求、23 metadata／10 byte／9 command观察**（不是全HTTP计数）：原26流程与预算完整保留，真实20章copy／baseline/save2、data29-images7、85私有对象50,665,541B、native错误／R2-SQL变化／journal／权限／改密／restart等当前SHA重验。378关联行与该game5封存目标只是当轮样本，非产品常数。

新增七组：

1. 真实SQL proof INSERT trigger500使command-target-proof全回滚；原key明确retry成功。
2. 实际授权同键重放补缺proof并保持原事实；坏MAC replay精确503、不覆盖。
3. 实际fenced owner/admin最小观察，author404／builtin／UUID；跨作者管理观察不授私有内容读取。
4. **同actor另一合法Job**被错配到已有command，原结构inventory仍UNKNOWN，新HMAC门精确503；owned原行恢复后原digest同。
5. 实际命令request_digest／存入auth_epoch／proof MAC分别损坏和不同service key，均503，无partial成功或重封存。
6. 缺proof只计unsealed，无观察写入或delete权；孤立proof因缺关联503，fixture按原记录恢复。
7. 实际starter/workerd重启保持精确command／target／proof及观测digest，无内存brand恢复权限。

random工程配置、owned OS tempSQL-R2、loopbackHTTPS8787、已装MF/OpenSSL、白OS环境，各producer1800s不延；wx源码快照／日志／报告。r1全33组通过后，人工补inventory捕获proof行，r2全轮fresh状态重验；随后主动diagnostics报告fixture选表嵌套三元warning，仅改等值if/else，最终r3全33组按原预算当前SHA重验。三轮status0/signalnull/errornull，无producer失败碰绿或拼旧成绩，不ignore／禁规则；原源与报告都保。未改旧fixtures，producer从当前原integrity producer精确派生，仅来源／保护、显式基准检查和上述测试扩展；原26业务期待及预算不放宽。

静态collector r1另有一次status1：误把最终318记录请求当每轮固定期待，r1实际317。已归档collector源码／log/meta，核三轮33流程与23/10/9观察全同、实际源有有界gate polling，逐轮metric为317/318/318；只修collector按各自真实产物绑定，不改main期待／预算或重跑碰计数。工程200路径对齐比较另存，不把无action-body的比较当机制／全网络证明。

当前主动LSP／session-all、Jev人工3398B最小摘要、源码／报告／历史SHA／imports、syntax／链接／73Q及旧源精确逆差另签；unconfirmed不等clean。无UI变不跑浏览器或原机制回归，不把局部测试冒全后台／完整战役。

## 仍缺

legacy完整引用图、共享refcounts、全writer冻结／native drain、实际幂等physicaldelete-readback／SQL内容及receipt scrub、最小completed410、cache／实际backup与隔离恢复、RuntimeManifest／认证Trial／发布和完整目标。四资源控件仍只读，G127/255及初始化unknown不扩大；Blob.delete仍关。无提交推送部署／云创建、安装trust、DOS-SAVE／真实profile-IDB或共享清理，主goal仍active。
