# E-01-BACKEND-PRIVATE-ROW-BINDINGS-1：私有对象行关系（此前限定）

**当前接续[精确saved/job链接](editor-backend-saved-job-links.md)**：同一现有路径再核current draft saved父与job owner/game/revision/三引用，原末actualscope-session保，exact32/newmode，当前CLI45组342调用/7facts及497输入105imports；本页31/36/496只指5bbfee历史批次，不再冒当前模块/CLI。Root/其它协调器-wait未变，全refs/native/delete仍false。

## 范围与依据

Web产品/工程限定实现，非DOS机制：产品§3/4.1、工程§1.2/1.3/5.4要求私有资源及游戏引用归属。原实际写者维护关系：`admincopy.js#put/#execute/cancel`登记copy对象并依次intent/verified/committed或abandoned；`drafts.js#put/save`登记actor/op_key对象、成功新修订时写draft_references并committed；`datacompiler.js/imagejobs.js/fallbackjobs.js#execute`登记operation/actor/game对象intent→verified；`metadata.js#insertSnapshot`登记game/revision。`jobs.js#owned/enqueue`及draft/copy提交重核将父请求/作业归于游戏所有者。旧auth_epoch是历史记录，不要求等于当前session；禁用作者也不转移或丢失其内容。

新增`server/deletionprivaterows.js#inspectPrivateObjectRowBindings`是纯低层SQL检查，**不增observer/class/route/schema**。现有`GameDeletionValidatedFreeze#checks`在原两冻结/HMAC共同事务前后及最后外部callback之后纳入；原实际SQLsession/scope/完整schema/fence/CAS门和最终session保持。原Root/其余coordinator/wait并未整合，事实离开事务后不赋任何后续权限。

## 固定查询规则

- 当前canonical TEXT gameId的六表：copy_objects、draft_objects、data_compile_objects、image_compile_objects、fallback_compile_objects、draft_references。原生typeof、64位小写十六进制SHA、整数1..16MiB长度，原写者state集合；draft引用revision是原生TEXT正十进制。
- copy对象→copy请求(game/owner)；draft对象→draft请求(actor/op_key/game/owner)；三编译对象→compile_jobs(operation_id/job_id、actor/game/owner)；draft引用→snapshot(game/revision)。原生BINARY关联，不JS拼键/trim/NFC/大小写归一。draft/compile还拾取父game为当前目标却childgame已外移的类型一致反向关联，拒跨game引用；其它无关联游戏的相同SHA不算共享物理对象。
- 同`private/<gameId>/sha`声明长度必须一致：六单表GROUP/HAVING和15固定pairwise BINARY joins。**原六表UNION ALL被nativeSDK拒**，不修改SDK/SQLite限制或绕过权限。替代SQL核同一长度规则、期待/预算不放宽。
- DB32MiB，每表10000、六child加四target父表总20000；投影只有固定marker和LIMIT。QUERY/ROWS/LENGTH/BUDGET各自503，字段/全局行/SQLite原错误不公开；工程预算不是CPU/heap/SLA或完整provider闭包。
- 返回现有27字段加四bool（exact31）：privateObjectRowsVerified、privateObjectParentLinksVerified、draftSnapshotLinksVerified、privateObjectLengthBindingsVerified=true。mode `CURRENT_DECLARED_SQL_AND_PRIVATE_ROW_BINDINGS_FREEZES_ATOMIC_NATIVE_UNKNOWN`；indexContentIntegrityVerified、rowIntegrityVerified、nativeDrainVerified、deleteAllowed仍false。

## 实际验证与失败留存

owned `.dragon-analysis/editor-phase/backend-private-row-bindings-session-r1/`。

最终fresh **main-r5：36组275记录HTTP调用/6exact31 facts/22报告源/4wx源码**，经现有`verify_editor_backend_validated_freeze.mjs`同process委托当前focused工具。前22check字符串与旧bound完整报告逐项deepEqual，原权限/status/code/hook8和10/预算/全35行目录size与sealsrollback期待保持。新增：

- 手工六对象/四父表正控、copyRequest1保留；伪snapshot/descriptor是工程SQL，不是GameSource、正常创建/复制/save/enqueue/nativePUT或正式发布。
- 六family实际坏SHA、实际失父/错误actor/childgame外移/不存在snapshot/同hash长度冲突：在冻结前503，坏样本原状/35表所有行目录size无改。
- BOTHseals callback8及LASTcallback10实际插坏descriptor，503/DELETE_PRIVATE_ROW_ROWS；两原执行器/seals及所有受测SQL行/目录/size全部rollback，不冒SQL-R2原子或provider取消。
- 原Cookie/CSRF/owner/admin/builtin/fence/CAS、badCHECK及lateSQL-epoch-expiry-role、restart/password、缺表不重建/publicdelete404继续覆盖；pendingjournal仍1未知。

失败原件完整保，不能从最终PASS反向改写：

1. main-r1第一次健康冻结503 QUERY；owned probe-r3原生准确定位长度UNION语句 `too many terms in compound SELECT: SQLITE_ERROR`。probe-r1辅助生成输出换行parse失败、r2辅助相对import失败，都未进入native。只修辅助语法/import；产品仅将UNION改六groups/15joins，不修改限制、放宽期待或预算。probe-r4全部空表SQL接受，仅characterized不是businessPASS。
2. main-r2已完成原22组后，新六family正控503 ROWS。继承`definitions` create只是SQL skeleton并不写snapshots；新seed误以为已有snapshot。仅新fixture显式加入假snapshot父行，原产品/期待不改。
3. main-r3到28组208调用，新第六family目标create500 INTERNAL_ERROR。新label将draft_objects/draft_references都截为“壞draft”，确定重复；原native底层SQL错误被Root包装未公开，不能冒已读到nativeconstraintmessage。仅新样本编号壞物0..10，保同作者重名规则、原期待/预算。
4. r4全36通过后，主动LSP指出两个新fixture/model的nested-ternary警告；保r4源/report与原两helper后，只将等值分支改if/else（不改任何SQL/业务期待/预算），最终r5全fresh36、36check字符串同；model-r3仍22同check。原newURL辅助误报由当前WHATWG Request及继承Root.fetch109-112 try/await/catch证据在session精确标false-positive，没有inlineignore或规则修改。不拼前三轮分段green，所有源码/失败日志/status/直接分析与partial继续留存。

Node **22组**完整35原DDL模型另标：六family/四父表、真实坏描述/失父/跨actor-game/反向关联/同namespace长度与跨namespace不混合、合法历史state、canonical引用revision、10001及10000+10000+parent预算；坏query/size/shape为synthetic。Node不是workerd/Root或物理对象证据。

## 静态与维护边界

以前继bound receipt89fd05c0010d1b0cb134adc1342c9155caf260dbe79ea950bf6402c27d0339a1固定495输入/103imports，改两已wx归档旧源（现有coordinator/当前focused工具），新增helper；预计496声明、493旧含375玩家保、104imports，独立static另签。原existingCLI委托不变，35表243列70对象不变。适用LSP/session-all/语法/diff/links/73Q/SHA与人工最小Jev；silence/inconclusive/unavailable不clean，Jev非权限/SQL/完成oracle。无UI/引擎/媒体/原机制变化，不重复无关浏览器/战役轮；无真实SAVE/profile-IDB/秘密/共享清理、云/部署/install/trust/commit/push。

## 仍开

仅当前这些typed私有SQL关系：不认证全部BLOB-ID别名/未知下游、copy_origin/installed共享及历史content-command-receipt关系、所有snapshot/source digest/依赖/正文、正常初始化/正式版本链、物理索引完整性或完整行。Root/其它freeze-wait/最后实际提交尚未统一保护。所有writer-reader-body/provider/CPU/legacy在途、unknown结果及重启处理、幂等physicaldelete/readback/content-receipt scrub/completed410/cache和真实backup清理、RuntimeManifest/Q69/Trial/release/full工作台仍未完成，主goal保持active。
