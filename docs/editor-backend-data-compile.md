# 固定副本的实际共同资料编译（内部、限定）

E-01-BACKEND-COMPILE-DATA-1。`server/datacompiler.js#FixedCopyDataCompiler`已在隔离派生Root／真实SQLite与R2中执行共同编译，**尚未装入公开Root、UI或运行加载器**。这不是完整Validation、PNG、Trial或Release；公开`/api/games/<id>/compile`仍404。底层合同见[持久Job](editor-backend-jobs.md)、[私有固定副本](editor-backend-private-draft.md)及[工程设计](game-editor-technical-design.md)。

## 实际入口与权限

- 内部`enqueue/query/execute/retry`服务，只接受自己的准确已保存修订、固定profile和`all` scope。构造参数由服务装配，不接受请求DTO提供store／验证器／principal；HTTP夹具仅位于ignored分析目录。
- `PrivateDrafts.captureForCompile`重验真实owner／session epoch、SQL origin、固定服务definition、不可变baseline、所选源及其每块R2长度／SHA和共同`FixedCopyProfile`；最终再次核准确快照三项引用。返回内部完整源，不返回账户密码hash／token，不新增公开整源下载。
- 请求先规范捕获，再检查实际global key namespace；同SQL永久key／source／compiler／profile／pipeline与租约／代次／CAS复用`CompileJobs`。不按`valid`、manifest、hash或临时Map签发权限。管理员不读取他人草稿。
- 新增`CompileJobs.assertLease/assertPipeline`是非写入的实际SQL守卫；旧`query`语义保持。执行器在入口、输出证明及ready返回边界核完整持久pipeline；ready最终summary必须与捕获状态精确一致。

## 共同执行与产物

真正调用未改`compileGameSource`（`editor-local-0.6`），没有另造地图／道路／规则编译器。服务版本`editor-local-0.6-server-data-1`固定阶段`validate → compile-data`；pipeline为版本／profile／有序阶段的规范摘要。

当前固定完整20章输入实际产生29项：

1. `source_report`：固定源结构门、章数／尺寸及准确绑定。
2. `binding_0`：game／revision／source／dependency／operation／compiler／profile／pipeline。
3. 地形、完整地理、mini地理、道路mask、cost、offset六个byte产物。
4. 共同`roadGraph`规范JSON。
5. 20章准确源定义JSON；不是新增初始化或运行证书。

报告明确`admission: data-only`及四个未完成门：`image-decode`、`pixel-png-output`、`complete-runtime-dependencies`、`runtime-admission`。不生成`valid:true`、RuntimeManifest／Trial／Release／公告。signed24／u16可表示不授任意数值可玩；本轮不修改资源范围、原初始化、角色、容量或新拓扑机制。

每项按≤4MiB分块、最多128 descriptors；有限300秒租约与这些大小是工程预算，**不是Cloudflare CPU／内存／执行SLA**。未创建云资源或部署。

## 写入、恢复与失败

- 写前同SQL复查真实租约并记录`data_compile_objects` intent；实际游戏私有R2 conditional immutable写／长度与全SHA读回；await后再次复查租约并记verified、显式heartbeat。没有靠定时器或`waitUntil`假保活。
- checkpoint不信任描述符自身：只匹配本次捕获并共同编译的完整计划、stage／前序摘要及全部实际输出bytes，再经原Job提交守卫。临时Map仅保存本次计算计划，结束清自己引用，不冒durable队列或授权。
- 重启丢临时品牌；过期SQL租约可准确新claim。恢复重新读取不可变修订、重编、对拍旧checkpoint及实际R2后才继续。不会用最新草稿替换原Job、拼新旧pipeline或恢复客户cap。
- ready重验同样重编和实际读回，无新的行写入。损坏checkpoint／pipeline或同size坏R2不当成成功，也不自动覆盖修复。
- failed依现有Job的真实cap/CAS／epoch记录；原权失效不再以失败处理覆盖主错误。新会话不能复活旧epoch的Job／key。取消、共享引用／物理GC、备份与完整运行准入未实现；intent／verified不等于已清理对象。
- 同一ready Job的并发内部重验可能因暂时计算计划竞争而拒绝；没有由此获得跨会话权限或云并发保证。本轮不声明公平调度、自动后台daemon或任务执行SLA。

## 本轮验证与更正

证据位于`.dragon-analysis/editor-phase/backend-data-compile-session-r1/`，每轮独立wx日志／当前源码SHA／owned OS temp真实SQL-R2；随机工程秘密不输出，不碰DOS SAVE／用户profile或IDB。无需浏览器：本轮Root／前端／玩家输入未改。

- `data-r4`八组、77实际HTTPS请求：完整固定副本和两真实主体、准确修订／永久key／namespace拒；真实阶段1 SQL租约到期；实际关闭重启、新代次重新计算和旧checkpoint核验后完成29产物；所有native／geo／道路／20章与未改共同Node compiler在准确源上对拍。
- 实际ready只读重验、旧CAS409、checkpoint损坏503、持久pipeline损坏409；actual R2同size单byte损坏503。恢复仅测试夹具显式还原owned原byte，生产没有corruption／restore开关。
- 控制真实BlobStore输出边界，实际改密后旧await401、checkpoint0／无verified输出；新cookie查询及旧key409，游戏modifiedAt不改。等待／release只存在ignored夹具，不代替实际认证／BlobStore守卫。
- 当前回归：`jobs-r1`九组78请求、`ids-r1`十一组153请求、`draft-r1`九组50请求、`epoch-r1`三组18请求；总记录376请求，不拼旧库存或无关游戏回归。
- `data-r1`仅setup期把不存在的修订2误期望409，实际优先404；查清`enqueue`先核快照后检查永久操作，保失败producer，补真实保存修订2再测同key冲突，不改产品迎合断言。`data-r2`五组先通过。
- `data-r3`负控实锤ready原分支漏查SQL pipeline：改持久digest后错误返回200。原因是ready不claim租约，而旧只读query不查pipeline；仅summary版本字段不足。已加实际SQL只读guard与末端一致性，`data-r4`原期待409通过。失败日志／源码／分析保，不靠延长timeout或放宽期望。
- 主动LSP与session-all另封存：push-only／inconclusive不报clean；ignored夹具的native Request URL规则精确FP单独裁决，不关闭规则。Jev只发送人工审阅2667B工程摘要、固定`jev-1.13.0`，advisory非正确性门。

从已封存415输入继续，仅两旧服务增加内部守卫／捕获端口，加新执行器／测试，当前417声明；413旧输入含375玩家保持。语法／递归imports／精确逆差／文档链接及日志SHA另签收据。完整工作台、公共编译、PNG／runtime／Q69、Trial、发布及清理仍需接续，**主目标active、不关闭完整E-01／E-06**。
