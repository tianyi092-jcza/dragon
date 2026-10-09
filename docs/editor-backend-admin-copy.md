# 管理员完整复制事务（E-01-BACKEND-ADMIN-COPY-1）

## 范围

这是本地真实Worker/同一SQLite/R2的**内部完整复制端口**，不是公开编辑器上线或运行证书。只允许已改密的真实管理员创建自己的独立副本；普通作者、任意他人来源和客户端目标ID均拒。固定来源来自[已登记目录](editor-backend-source-catalog.md)，实际41项Web输入/57,943,821B，共同loader/full copy/source-record投影照用，原件/375玩家输入未改变。地图、192据点、全部20章原数据/2540独立来源记录均保存；不按槽/姓名自动合人，也不猜空章/新角色/G127/255初始化。

## 持久预约与恢复

`AdminFullCopy`在同DO建立`copy_requests/copy_objects/copy_origins`；`GameMetadataStore`增加`content_reservations`与显式服务恢复分配端口。预约同时写真实actor/epoch、永久key/规范请求摘要、精确来源definition/root/profile、服务生成目标UUID、名称占用和pending状态。相同key并发只产生一个目标；异内容/不同操作409，名字按既有owner＋trim/NFC、大小写敏感规则占用。没有Game记录时名字是可追踪的待复制预约，不冒充已创建游戏。

claim在实际SQL行版本和持久deadline上签发32B随机租约hash/代次；私有WeakMap品牌不作数据库。重启丢品牌后，等待**已存期限**并重新claim，才由实际SQL/当前会话/epoch/来源重验产生新恢复cap，目标ID不变。`recoverGameId`只接受服务回查的私有租约，不按客户端gameId/valid/JSON恢复；恢复的allocation在每次对象/流段和快照准备／最终创建路径再次查租约，已有Game记录也不能绕过旧cap栅栏。直接旧cap、并发同capexecute、过期旧代次均拒。

默认租约60s、有限1..300000ms是工程配置，不是原游戏机制、并发量或Cloudflare CPU/内存SLA。测试500ms只验证实际期限，不更改规则时钟。

## 完整源、基线与原子提交

1. 从实际注册R2角色重新读取并核长度/全SHA；服务固定loader捕获全部章和只读来源记录。来源ID由目标ID＋固定投影序列稳定产生，每个来源记录仍独立；重试不会重新随机化同一个目标的来源身份，不自动归并历史人物。
2. 保留不可变完整baseline，候选仅更换规范化名称/简介；[内容差异门](editor-backend-provenance.md)和共同draft结构均再次检查。没有客户端上传整源、角色编辑或字段表示域放行。
3. 规范JSON分块写private/target/hash，**每次R2写前SQL登记intent**；真实条件创建与完整写后读回核验完成才verified。baseline和候选均完整读回/流式规范UTF8解析/摘要与内容门复核，不以etag、self-hash或valid标记通过；根索引与逻辑source摘要分开。Map不保存结果。
4. `GameMetadataStore.transaction`同步提交点重验主体、epoch、租约、来源与全部对象verified；同一事务创建Game/不可变snapshot/名称、origin中的精确catalog与baseline指针/摘要、对象committed引用、永久结果和原游戏元数据审计。content receipt插入失败时上述写集全部回滚，不能只留下Game或半个origin。预先预约/verified staging保留，以同一个目标显式重试。
5. 已提交操作查询/重放绑定不可变首个快照及origin，不追踪最新草稿，不更新modifiedAt或重新复制。SQL收据自报valid不能通过。公开副本复制API仍404，编译/运行/发布仍另门。

取消只允许当前有效的本人管理员放弃pending/running操作，准确行版本条件写，清租约/释放名称，ID和key永久保留，对象记abandoned。改密后的新会话可以**取消自己的旧待处理工作**，不能恢复旧key/cap/执行或改已提交Game。intent/abandoned保留了孤儿对象追踪，但物理删除、引用GC、备份和完整删除栅栏尚未实现，不宣称cleanup完成。

## 实际验证与失败纪律

生产入口：`server/admincopy.js`、`server/metadata.js`服务恢复门；测试`tools/verify_editor_backend_admin_copy.mjs`，ignored `backend-admin-copy-session-r1/fixture-worker.js`只提供受控fault/slow/计数。实际owned workerd/SQLite/R2、NodeHTTPS8787→own WorkerHTTP和工程随机秘密；无DOS/SAVE/userDB/profile/云凭据/真实证书/外网/安装/全局信任/部署/commit/push。

- `copy-r3`整轮八组：管理员/Origin/CSRF/输入门；预约名字/global key/目标race和预约trigger回滚；claim/DTO/固定来源；两次完整副本，content-operation trigger使最终全事务回滚后同ID/稳定来源重试；完整baseline/候选20章2540记录逐结构对比（仅metadata不同）；实际重启和待操作固定目标恢复；无重启过期代次、已存在游戏的旧allocation对象/准备快照栅栏及普通metadata key冲突；R2意图/显式取消/改密await与生产404。
- 元数据`metadata-r2`八组、对象`blobs-r2`九组、账户`auth-r2`七组、来源`catalog-r2`八组、任务`jobs-r1`九组及参数`ids-r1`十一组，全部是本轮真实执行，不借历史绿色。fresh账户`browser-r13`实际启动器两context六组、restart、IDB0/outside0/errors0也重跑；没有新编辑器工作台UI或87游戏全量新轮。
- 首次`copy-r1`确实exit1：最后新会话取消旧pending操作的返回路径复用了旧epoch查询门而409，取消SQL也因此回滚。定点只修取消返回当前已改行（不放宽query/execute/旧key门），并增加坏origin收据门后`copy-r2`七组通过；补旧allocation/普通operation conflict/无重启expiry后`copy-r3`整轮及相关回归重跑。所有原模块/测试/fixture与失败日志保留。
- metadata初次精确编辑有一个匹配两处的条目失败，而工具已实际提交其余八条；未重复提交已应用项，定点补唯一blobAuthority行。此工具部分应用事实单独记录，旧metadata先归档，交付核精确逆差，不称原子编辑成功。

最终主动10路径outcomes：0clean/1findings（仅40条正确await hint）/7MD unavailable/2JS push-only inconclusive；工具矛盾“7confirmed clean”不采信。session290文件23旧warning保，无新warning、无规则禁用/缓存清空。当前源、原403输入保全、所有执行收据、适用语法/链接另封存；Jev仅4840B人工工程摘要、reviewed无联网preview之后发送jev-1.13.0，0redactions且未传源码/资源/秘密/存档/完整log；advisory不代真实测试/权限/原证/完成门。

## 剩余

尚未装RootWorker公开复制接口与管理员工作台，不是普通minimal/空白初态新建。永久私人baseline的后续编辑profile、共同compiler执行器、PNG/头像与Q69全依赖/运行/Trial/发布、真实删除/孤儿GC/备份及线上资源/域名/容量验证仍开放。source schema/副本成功不产生Validation/Release权限，目标goal全部要求未完成。
