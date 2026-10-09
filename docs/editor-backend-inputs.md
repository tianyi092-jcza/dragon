# 完整编辑器接入：新建后台授权与剩余依赖

用户m6873已明确没有后台、授权适配现有部署新建，并要求固定启动端口；m6911明确另外解析后台专用域名、不影响游戏。**不再要求用户先做好后台或提供既有接口。** 当前实施与入口见[独立账户服务](editor-backend-auth.md)：Cloudflare Worker＋SQLite Durable Object、本机HTTPS8787；线上另域名443。原玩家部署不改，没有线上部署或云资源创建。

## 已解除的实施依赖

此前核实根`wrangler.jsonc`只有静态assets、没有互联网后台接线；不能据此断言线上不存在服务。旧`tools/editor_server.mjs`是无认证本地harness，不能直接公网使用。历史暂停索取既有协议/新平台授权已经由上述用户决定解除，不重复请求同一批准；此前纯文档核验293源/82资产是历史成绩，不冒新后台完成。

现真实账户/会话SQL事务、KDF、Origin/CSRF、强制改密/epoch撤销、CAS、持久限速与本机入口已经实现并隔离验证。新建实施不等于完整发布/玩家链交付。账号密码/key不要发到聊天、日志或Git；本机初始化交互生成私密配置，线上secret注入按单独获准部署执行。

## 继续实施与验证的能力

| 能力 | 当前切片与仍需工作 |
| --- | --- |
| MetadataStore | [真实同事务域基础](editor-backend-metadata.md)已有主体/名称/CAS/永久幂等/快照引用；[完整源结构端口](editor-backend-snapshots.md)只隔离fixture有证；[固定副本内容差异](editor-backend-provenance.md)41输入/20章/78拒与Worker-R2六组有证但非持久注册/权限；后继[持久固定来源目录](editor-backend-source-catalog.md)57MB/41角色及Worker内共同copy、SQL/R2/重启/epoch八组有证，后继[内部全源复制事务](editor-backend-admin-copy.md)管理员真实目标/名称/origin/baseline/refs/永久结果同SQL、回滚/epoch/重启八组，后继[真实Root管理员入口](editor-backend-copy-entry.md)已显式stage/真实登录登记/完整复制、状态/CAS/取消/永久key、pending重启与own摘要；后继[私有固定副本草稿](editor-backend-private-draft.md)已装精确修订owner读取／限定补丁写，actual R2全源/共同writer/固定definition/epoch与SQL CAS/refs/永久结果有证；后继[实际私有资料表单](editor-backend-draft-ui.md)只开放名称／简介和只读四资源，八真实浏览器流程／冲突／原key查询／明确改密恢复与当前回归有证；仍需完整工作台/完整源与依赖运行准入、发布指针及公告同事务 |
| AvailableLibrary | [固定可用库](editor-backend-available-library.md)当前398项byte与旧库同、两个consumer指纹更新；400角色代码锚及原目录SQL/R2协议、Root管理员登记／永久key／实际重启和改密五组26有证，原目录61／阶段API42当前回归；20个G127/255未知、全部loader/CSS/audio及runtime/Q69准入仍缺，不是作者资产取数权限；后继[索引PNG](editor-backend-indexed-png.md)补4bit实际缺口，376库图及packed1/2/4独立像素有证，不代权限／消费者闭包；后继[私有固定库读取](editor-backend-library-assets.md)实际本人管理员／精确保存修订、全source/baseline/profile及400角色R2核验，七组55／六附件及native末次assert／实际改密有证；后继[精确修订只读库UI](editor-backend-library-ui.md)实际398／20目录／筛选与完整附件、saved1-current2／七坏回复／改密与author及另标synthetic pagehide共最终十组有证，新library16MiB分支仅支持最大现有FLAC，原stage4MiB兼容；不授runtime或写素材；后继[运维登记UI](editor-backend-library-register-ui.md)明确GET／原key空body／unknown恢复、真实restart／改密及坏关联十组有证，消除手工调用该API但不取消运维staging；普通作者模板权限、全部消费者及runtime仍缺 |
| BlobStore | [真实R2条件创建/读回/授权](editor-backend-blobs.md)已接，分块43MB源fixture可收；仍需生产资产/图片/共享引用/物理删除/备份保障，不用进程Map冒durable对象库 |
| CompileJobs | [同SQL持久Job底层](editor-backend-jobs.md)九组真实租约/key/CAS/checkpoint/R2读回/重启及版本门；工程引用不是实际编译证书；后继[内部共同资料编译](editor-backend-data-compile.md)准确全源／两阶段／29实际私有R2产物／重启和损坏、epoch八组有证，后继[独立PNG I/O](editor-backend-png-io.md)Node／workerd与独立Pillow有证，只是有界raw-sample适配器；后继[固定副本受权图像](editor-backend-copy-images.md)实际全源/profile与41角色R2重读、四atlas／两共享mini、八组48请求与六PNG独立像素有证，该轮仅内存品牌，后继[六图持久Job](editor-backend-image-jobs.md)真实R2/七产物/重启重算/ready复查与epoch八组53请求有证，仍不runtime；后继[真实阶段API](editor-backend-stage-api.md)已装Root限定data／images提交／查询／CAS运行与完整重验后的私有产物读取；stage-only，不冒完整compiler；后继[阶段操作界面](editor-backend-stage-ui.md)已接明确已保存上下文／dirty确认、原键恢复／CAS执行及核SHA下载，八实际浏览器流程有证；后继[整图逐行基础](editor-backend-fallback-rows.md)原flags实际stream/zlib及四季/显式改tile/奇数宽12PNG独立像素、错误与预算关闭有证，不展开整图RGBA，该基础轮未接持久Job／权限；后继[单季整图Job](editor-backend-fallback-jobs.md)复用同一准确source捕获，服务固定season／独立pipeline、两R2产物及每行lease/epoch和写返回复查，主65／原六图56／独立写控制21当前有证，该内部轮未接Root/UI或runtime；后继[固定季节认证API](editor-backend-fallback-api.md)七组78及当前data/images42，末次实际Job/snapshot/token与附件SHA门及四独立产物有证，该API轮UI／runtime仍缺；后继[固定季节界面](editor-backend-fallback-ui.md)四选项／六分用途关联、明确saved1-current2／未知回应恢复及全SHA附件、author与实际改密有证，新八组和原data/images当前八组通过，仍不runtime；仍需完整源/像素/图片运行准入、staging引用清理、单章scope、发布与运维接线 |
| 认证适配 | 账户、管理员完整复制、固定副本私有草稿及限定stage Job／产物API已实测；旧本地工作台、Trial、全部其它私有资产取数/提交/异步入口仍需真实认证接线 |
| 玩家协议 | registry/release识别、固定准入、下架/明确删除、公告与版本核对仍未接 |
| 运维/隔离 | 本机真实workerd/SQLite/R2及两作者UI/API、NodeHTTPS8787→own WorkerHTTP边界已隔离重验；线上专用域名/绑定、安全配置、恢复/删除全链仍须另行验证 |

commit/push/线上部署与真实云资源创建仍分别需要明确授权，不因为用户新建请求自动操作线上。新域名尚未解析不阻本机开发，也不改玩家Origin/配置；不能把8787伪称Cloudflare任意公网监听。

完整人物/据点/章节表单、继承/角色/空章初始化、语义素材、资源全部消费者/G127、拓扑容量原证、完整桌面/实际App战役仍开放；不能写“只差上线”。财政夹限与表示宽度不批准任意资源UI范围，本地writer/比较删除primitive不是受信发布认证。全目标见[工作表](editor-goal-completion.md)/[差距索引](editor-requirements-matrix.md)。历史goal自动跟踪暂停不等目标完成，也不撤销当前明确实施授权。
