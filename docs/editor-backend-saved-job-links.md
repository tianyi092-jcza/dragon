# E-01-BACKEND-SAVED-JOB-LINKS-1：现有冻结的保存快照/作业引用

**当前现有协调器已接[copy origin/初始snapshot/receipt](editor-backend-copy-origin-links.md)**：exact34/新mode、CLI59组463调用/8facts、498声明106imports。此helper不变，下面32/45/497及source SHA对应c157134此前receipt，不描述当前组合DTO；Root/其它门仍未整合，全refs/native/deletefalse。

## 范围与依据

Web SQL产品合同（非DOS机制）：`metadata.js#insertSnapshot157`保存独立game/revision/rootKey/sourceDigest/dependencyDigest；`#save169-179`新修订同事务更新current draft_revision及插snapshot，no-op保旧修订；`#snapshotReference108-114`只取精确revision。`jobs.js#enqueue73-84`从该实际引用写actor/game/revision/三个引用字段，`#owned50-58`再次比较全部三字段，不改绑latest。

**rootKey中的rootDigest与sourceDigest不一定相同**：`prepareSnapshot95-97`显式rootDigest优先、sourceDigest回退，两个不同摘要保存为独立字段。不能为方便检测强绑两SHA，也不能据SQL关系相等追认Source/正文/依赖证书。

新增纯低层`server/deletionsavedjobs.js#inspectSavedJobSnapshotLinks`；现有`GameDeletionValidatedFreeze#checks`在原共同事务前后及最后外部callback之后纳入。原完整schema、真实owner/admin/fence/CAS、两冻结/HMAC及末次实际SQL session/scope复查不变。无新observer/class/schema/产品route；Root/其它协调器与wait仍未升级。

## 固定规则与遗漏

- 当前canonical TEXT target game必须恰有一条game；当前TEXT draft_revision存在同game/TEXT revision snapshot。
- 当前TEXT game的每条compile_jobs须有TEXT actor/revision/rootKey/sourceDigest/dependencyDigest，并以原生BINARY连接实际game.owner与精确snapshot revision；snapshot三引用字段须TEXT并逐字段BINARY相等。
- 合法旧snapshot作业保留，current draft可以为后来的修订。不要求旧epoch等于当前session，不删除禁用作者的内容，不将数字revision转浮点，不JS拼键/NFC/trim/casefold。
- DB32MiB，snapshot/jobs/game各10000、总20000；NOT INDEXED marker LIMIT10001与bad LIMIT1，原生SQLite相等、fail-closed QUERY/ROWS/BUDGET503，原错误/全局数据不公开。不是heap/CPU/provider SLA。
- 不认证全部snapshot字段域/序列连续性/未来snapshot、不认证BLOB game-ID别名/跨game rootKey反向闭包/正文SHA/依赖/正式release/历史command-receipt或物理索引。
- exact32 = 原31加savedJobSnapshotLinksVerified:true；mode `CURRENT_DECLARED_SQL_AND_SAVED_JOB_LINKS_FREEZES_ATOMIC_NATIVE_UNKNOWN`。rowIntegrityVerified/indexContentIntegrityVerified/nativeDrainVerified/deleteAllowed仍false。离开事务的facts/hash/HMAC不授后续操作权。

## 验证与失败保留

owned `.dragon-analysis/editor-phase/backend-saved-job-links-session-r1/`。最终native **main-r1：45组342记录HTTP调用/7exact32facts/26报告源/4wx源码**，原existingCLI同process委托。前36check字符串与前继private-row主轮逐项相同，原所有status/code/owner-builtin/UUID/fence/CAS/原hook8-10/预算/全35行目录size/sealsrollback期待保持。

新fixture显式从既有工程job三字段模拟保存父行，六对象样本保已有父关系后匹配job tuple；这是SQL skeleton/伪saved行，不是正常Source/create/save/enqueue/正文PUT，不能拿自行复制tuple证明正常业务源。新增真实ownedSQL坏样本：缺current snapshot、job revision失父、三引用字段分别错配、job actor外移，在原执行器前503/DELETE_SAVED_JOB_ROWS且坏样本/全行目录size不变；current draft2、job旧saved1正例保；BOTHseals callback8/LASTcallback10删snapshot，503并全35行目录size、原两执行器/seals rollback。pendingjournal1未知继续保。原restart/password/缺表不重建/公开delete404保持，无native producer失败。

Node完整35DDL **20组**另标：独立rootDigest a与sourceDigest b正例、9种真实模型错配/BLOB storageclass、缺snapshot、旧revision、synthetic size/getter/query/projection与实际10001单表/10000+10000+game1总预算。Node page pragmas仅模型计量，不推广workerd支持或Root权限。

首次Node辅助失败`near ")": syntax error`/ERR_SQLITE_ERROR：误将固定expected.objects的[type,name,table,sql] tuples当对象，选零CREATE导致users列空/INSERT users()。保memory-before-ddl-shape与memory-failure-r1；只改tuple0/3并assert35，不改产品/native期待/预算。修后19组保，再追加独立总预算模型20组；两个模型报告/source保，未重跑native碰绿。

## 静态/工程出口与仍开

以前继5bbfee receipt496输入/104imports为唯一基线，wx归档两个改动旧源，新增一helper：预计497声明/494旧含375玩家保/105imports（103旧imports不变）；静态独立另签。35表243列70对象、原CLI委托未改。LSP/session-all/源码及历史SHA/syntax/diff/links73Q/Jev最小人工摘要另签，silent/unavailable不clean；无UI/player/媒体/原机制变化，不重复无关浏览器/战役。无真实SAVE/profile/IDB、云/install/trust/commit/push/deploy或共享清理。

完整typed别名/共享/历史/content-command-receipt引用、所有source/dependency实际字节、Root/全部提交-等待接线、writer-reader-body/provider/CPU/legacy闭包与unknown结果、专属幂等physicaldelete/readback/scrub/completed410/cache/真实备份清理、RuntimeManifest/Q69/Trial/release/全工作台/原初始化仍开放，主goal active。
