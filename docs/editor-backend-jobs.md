# E-01：持久任务／租约／检查点底层

这是`CompileJobs.enqueue/checkpoint/retry`的同SQLite基础，**不是编译器、运行证书、正式发布或完整目标完成**。本页初始底层轮未装生产Worker；后继[真实阶段API](editor-backend-stage-api.md)已在独立Root安装限定data／images执行器和Job／产物认证入口。完整validation/compile/publish仍404，阶段ready不授运行资格。后继[实际共同资料执行器](editor-backend-data-compile.md)已在派生Root／真实全源SQL-R2执行两阶段及29产物，仍data-only、未公共安装；后继[固定六图持久Job](editor-backend-image-jobs.md)已真实精确源/41角色、七R2产物/租约/ready复查/重启与epoch八组验证，仍仅内部图像阶段。不能把本页历史marker测试当实际编译证书。源准入见[完整源](editor-backend-snapshots.md)/[固定副本内容门](editor-backend-provenance.md)，发布提交仍遵循[工程§5](game-editor-technical-design.md#53-保存编译和发布线性化)。

## 权威与状态

- 同DO SQLite的`compile_jobs`和`compile_operations`记录actor/epoch、游戏、不可变已保存修订与三源引用、scope、compiler/profile/pipeline摘要、stage、attempt/generation、租约hash/截止、单调十进制行修订、checkpoint/failure/retryable/事件时间。enqueue永久key与job行同事务；同key异内容409，不用进程Map/短TTL模拟任务库。
- 只从真实principal与`GameMetadataStore.snapshotReference`捕获自己的已保存快照；管理员无他人私有任务读取权、内置保护，首次/重设密码态拒。scope目前仅`all`，章节scope须独立验收后接入，不能猜章节存在或省略依赖。新草稿保存不重定向旧job，查询／进度不更新game.modifiedAt。
- 当前状态`queued→running→ready`或`running→failed→queued`（仅retryable）。**ready仅表示配置阶段的服务端checkpoint已登记**，不能生成valid:true、Trial、Release或公告。正式执行器须安装对应版本的共同校验/编译/输出完整准入；这里没有像素/PNG/runtime入口。
- claim按行修订CAS，只有一个获租；每次接管增加持久generation/attempt，存32B随机nonce的SHA，不存明文租约。私有WeakSet品牌仅执行上下文，不能从客户端ticket/DTO恢复。服务重启后持久期限仍在，失去旧品牌不准越过截止抢占；过期后才能新claim，旧代次即使还活着也失效。
- heartbeat、stage/failure/retry均在SQL事务内复查实际会话/epoch、游戏所有权/准确快照、行修订、租约/代次。改密后新cookie不能复活旧epoch任务；重新发起是新操作，不改旧任务半份输出。

## 检查点边界

输入先规范JSON捕获，getter/hidden/symbol/洞/非法数/坏Unicode拒，await期间调用者不能替换expectedRevision/stage/output清单。输出ID无路径、重复ID拒；最大128条/单对象4MiB，记录64KiB UTF8、阶段1–16、租约默认60秒且有限配置。这些是**内部运维预算，不是游戏容量或原版规则**，尚无生产CPU/内存/SLA证书。

配置阶段次序固定；checkpoint manifest绑定job/源修订/source及依赖摘要、compiler/profile/pipeline、当前stage、上一stage摘要和完整输出描述。只有服务注入的`verifyCheckpoint`端口实际读回对象／核长度SHA／完整阶段语义后可出proof，客户端标记、etag或摘要本身不能出proof；未装端口503。I/O后提交事务再核lease/CAS/principal，途中heartbeat或改密导致旧准备结果不能写回。SQL只存描述／摘要，不包图片或整个GameSource。

compiler、profile或阶段次序不匹配均409，不拼新旧编译器；可由对应旧版本执行器继续，或明确发起新操作从0开始。重试保相同job、准确源与已有检查点；非可重试失败或陈旧行拒。不存在自动程序升级就重新标旧输出有效、发布／计数递增或清理实际对象的副作用。

## 本轮实际证明

先[登记I/O](editor-local-validation.md)，只新增job模块与显式测试；此前398声明源码/资产（375游戏）每轮前后全部同SHA，玩家配置/旧Worker/其它会话改动不碰。

最终`backend-jobs-session-r1/jobs-r2`**九组真实workerd/SQLite/R2/NodeHTTPS8787**，78次实际请求：

1. 同key双请求只一个job、永久冲突与作者/管理员/builtin/scope拒；工程快照引用准确捕获。
2. 同行claim只一个获租、validDTO不能造cap；错误stage/缺R2/实际坏SHA拒且不进度；受控await后调用者改input不改已捕获checkpoint。
3. 保存新修订后旧job仍旧snapshot；任务读／阶段不写游戏modifiedAt。
4. 真正关闭／重开Worker/R2/SQLite，SQL进度、key和输出保留，临时lease丢失；等待持久期限后新代次从已保存stage继续，两阶段ready但不是运行证书。
5. 不重启的真实期限接管也隔离旧活cap；failure/retry CAS与重复key保job，重试后旧cap仍失败，非retryable拒。
6. 缺输出port503；实际SQLite trigger在插op处故障，使已插job一起回滚，计数不留半行。
7. 实际R2输出proof进入受控await后heartbeat令CAS409、改密令旧token401/新token旧job409，不提交迟到结果。
8. compiler版本、profile版本、同名compiler/profile但阶段顺序改变分别实测409；明确新操作从0，不合半份旧结果。
9. 生产validation路径仍404。

夹具的已保存快照是**工程marker**，输出是三byte opaque数据，使用真元数据能力、真Blob读/写及真SQL，但绝不冒完整GameSource、共同编译/图片/runtime或发布证据。夹具Map只保临时lease票据/inflight探针，绝不存权威job。宿主直接写坏R2是owned工程故障注入，不证明普通客户端有覆盖权限。r1八组先通过、旧脚本／夹具按SHA归档后新增期限/hash/profile/次序负控，r2完整九组重跑；未有失败轮被吞掉或改期待迎合产品。

新工程秘密只入owned绑定/请求内存，无用户profile/IDB/SAVE/DOS/实际证书或云秘密；已装MF/OpenSSL、本机临时工程TLS，无安装/全局信任修改/共享清理/云资源创建/部署/commit/push。无UI或旧产品变更，不重跑无关87游戏库存或浏览器UI。支持诊断与实际新语法/SHA/旧版本/链接另封存，空缓存或push-only不冒clean。

最后主动9路径outcomes0clean/1findings（仅34正确await hint）/7Markdown unavailable/1push-only inconclusive；工具“7confirmed clean”不采。session284文件23旧warning（14reviewed测试logger＋9旧项）保，不禁规则/清缓存，不能宣称全clean。新语法/源及import字节、旧r1生产者/当前r2/log、73Q与本地链接另封存。Jev仅3977B经preview审的工程文字后固定`jev-1.13.0`发送，无源码/原件/快照/凭据/完整log，输出只advisory。

## 内部ID类型门复核

后续`E-01-BACKEND-JOB-IDS-1`先登记I/O再实际验证，维护来源仍为本页。最初静态疑虑“对象可能SQL绑定500”被真实结果推翻：52个未知／非法输入均404，不能把猜测写成原因。但追加**真实存在UUID包入单元素数组**后，`[operationId]`查询自己的job与`[gameId]`enqueue自己的源实际200；普通对象仍404。它不构成跨作者越权，说明SQL绑定隐式转换不能替代ID类型验收，早期未知ID测试不足以证明整个类型门。

`server/jobs.js`仅增加与既有元数据一致的规范小写UUID-v4检查：query/claim共同owned入口在真实principal后、SQL绑定前拒非UUID；enqueue的gameId与retry的operationId也明确拒，内置字符串仍交原403保护。有效未知／他人UUID仍404，真正字符串ID继续原权限与CAS；不改SQL表、租约、epoch、快照、游戏规则或接线。共四个最小区域，旧源码`jobs-before-ids.js`及probe-r3原200证据保留。

最终`backend-job-ids-session-r1/ids-r3`十一组153次真实本机NodeHTTPS/workerd/SQLite/R2请求，69个ID负控：52非法422＋4有效未知404，真实数组别名在作者／另一作者／管理员的query/claim/retry/enqueue及普通对象均422，任务计数、行修订、game.modifiedAt不变；原九组完整任务行为也在同轮执行，另`jobs-r3`原测试九组78请求重新通过。399其它旧输入（375游戏）同SHA，只有jobs修改与一个新显式测试；没有浏览器／全游戏或运行编译新证书。

初次probe-r1由生产者的newline转义错误SyntaxError而未执行请求，原脚本／stderr留存；probe-r2、probe-r3分别完成初步矩阵和已存在别名证据。ids-r1/r2及旧jobs-r1/r2是修复前成绩，不能替代r3当前结果；测试新增嵌套三元警告等价展开，未禁规则，最末两门再完整跑。实际语法/SHA/旧版/诊断另封存；主动两源码路径0clean/1findings（42条正确await hint）/1push-only inconclusive，session286文件23旧warning保，不宣称全clean。Markdown不可用仍如实登记。本轮是明确Web参数类型修复，不读DOS，不用Jev或经验判原机制；无外部发送、云资源／部署／提交推送。

## 仍需接线

实际scope/校验报告及共同无DOM编译／像素/PNG/分块工作调度；持久来源登记和真实复制；生产worker/队列或alarm执行与版本部署纪律；私有staging引用、取消/配额/并发与删除清理；精确发布提交、CAS/版本/上下架/公告；Trial/匿名玩家协议与运维恢复。Job表没有物理删除/备份清理接口；不可在这些门未闭合时报“只差上线”或完整E-06已完成。
