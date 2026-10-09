# E-01：固定副本六图持久Job（限定产物，不是运行准入）

`server/imagejobs.js#FixedCopyImageJobs`复用原样[CompileJobs](editor-backend-jobs.md)、[受权图像规划器](editor-backend-copy-images.md)、实际私有BlobStore与同SQL快照。仅内部服务及ignored派生Root有接线；生产Root／UI未改变，公共compile仍404。`IMAGE_JOB_REVISION=fixed-copy-images-1-job-1`、固定profile、阶段`validate-images → store-images`，不关闭E-01／E-06／Q69或完整目标。

现行后继接线见[阶段API](editor-backend-stage-api.md)／[界面](editor-backend-stage-ui.md)；本页首段「未改Root/UI」限原内部Job轮。后继[packed索引PNG](editor-backend-indexed-png.md)推进planner及派生Job为`fixed-copy-images-2-indexed124-job-1`，当前九组56请求含旧compiler/pipeline拒绝，原53请求仍是历史成绩。不迁移旧Job/key，不改变源／权限／六PNG或runtime门。

## 来源、权限与线性化

- 真管理员本人的完整固定副本、明确不可变已保存修订与all scope；actual principal、首次改密、owner／epoch、三源引用及SQL pipeline／行revision复查。输入先规范JSON有界捕获，不调用请求getter；服务注入的全局key guard在同步事务中与永久enqueue／retry绑定。客户端不能提交输出清单、来源路径、源hash或valid以取得权力。
- 实际FixedCopyImages每次执行都重读精确全源／baseline/profile、copy origin、品牌policy和41角色全部真实R2 bytes，复用共同compiler/mini/PNG产生六图。保存新草稿2不会把Job1改向latest2。计划Map只暂存计算结果，WeakMap只限原会话的图像计划，均不是持久授权；租约只能由实际CompileJobs SQL/品牌取得。
- 写前同SQL登记`image_compile_objects` intent并复查lease/CAS与图像计划；实际R2条件创建及长度/fullSHA读回后，同SQL复查并标verified，显式heartbeat续有限租约。checkpoint按准确Job、source/dependency、compiler/profile/pipeline、阶段和前序摘要绑定，只接受本次重算的完整描述与逐个实际R2读回。stage/checkpoint不是SQL与R2跨服务原子删除；中断intent可能留下私有对象，尚无physical GC。
- 重启不能从DTO恢复brand；持久期限到期后新的generation/attempt重新取源、重算六图，再核旧checkpoint与其全部真实对象。ready执行也检查实际SQL pipeline、整个summary、精确旧产物；不按ready字符串跳过。不完整checkpoint、原对象同size损坏都拒，不以覆盖写修复。新会话不能复活旧epoch Job/key。

## 产物与边界

第一阶段一个`image_report`，第二阶段四`atlas_spring/summer/autumn/winter`及`minimap_base/large`，共七个私有R2产物。PNG尺寸／像素与既有共同算法相同；报告绑定Job/源/profile/pipeline，admission=`image-stage-outputs-only`，没有valid/RuntimeManifest/Trial/Release资格。

报告保留原规划器sourceReport的四missing项（含persistent-image-job），它描述当时的内存规划，不重写其历史含义；当前持久结果由实际SQL Job/checkpoint证明，不能由一份提前写出的报告自称完成。全整图回退、完整消费者／Q69、runtime准入与公共编译仍缺。最大4MiB产物／300秒租约是工程预算，不Cloudflare CPU／内存／费用或SLA保证。不同有效会话并发重验同Job可能安全拒绝暂时proof，不保证公平调度。

## 本轮实际验证

先[登记I/O](editor-local-validation.md)。`backend-image-jobs-session-r1/jobs-r1`八组53次实际HTTPS8787／workerd／持久SQLite／R2请求通过：

1. 真完整副本/来源，实际角色与内置、数组ID、scope/self-valid拒；永久key与跨认证namespace冲突；Job1固定而当前已保存2。
2. 本次真实六图生产、报告真实R2 checkpoint，SQL trigger使持久lease在stage1过期；下一产物写前409，保running/已提交前缀，不冒ready。
3. 真关闭重启同owned数据库与R2，临时品牌丢失；过期SQL新generation2，准确源1重读、旧report重算/实际bytes核对后完成六PNG及第二checkpoint；game.modifiedAt不变。
4. 七实际产物长度/fullSHA，六PNG decodeRGBA及尺寸正确；新持久图像bytes逐个等于此前独立Pillow认证且封存的六PNG。诚实复用完全相同bytes的旧独立oracle，不宣称本轮重新执行Pillow。
5. ready实际取源/读回重验而不改row；stale CAS409、损坏checkpoint503、实际SQL pipeline篡改409，控制恢复仅owned已知SQL。
6. 原生owned R2同size byte flip后ready503/BLOB_CORRUPT，SQL ready row不变；没有自动覆盖／repair。明确fixture恢复原bytes并核SHA。
7. 实际author读admin Job及产物403，生产Root compile404。
8. 实际写意图后在真实BlobStore方法前等待，实际改密撤epoch，释放后旧await401；stage0/no verified output，fresh session不能复活旧Job/key；game.modifiedAt仍不变。

当前无失败轮或猜测重跑。所有423旧产品／375玩家输入只读保护，新两源声明425；Root、UI、旧Job底层、資料执行器、PNG/图像算法原样。没有浏览器界面变更或游戏机制变更，因此不重复无关游戏／旧UI库存。工程环境只用owned OS temp、随机绑定、loopback与已装工具；无部署／提交推送／云创建／安装／全局trust／用户profile-IDB／DOS-SAVE／共享清理。

实际执行与适用LSP/会话诊断、syntax/import/链接/源及日志SHA分开封存；inconclusive/unavailable不能写clean。剩余公共认证编译/Job接口、完整data-image依赖准入／runtime、单章scope、Trial/发布/玩家/生命周期清理和备份继续实施。
