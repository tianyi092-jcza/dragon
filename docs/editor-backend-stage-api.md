# E-01：真实认证的阶段任务／私有产物入口

本页维护旧data/images批的`server/stageapi.js`及独立Root装配；后继[固定季节认证入口](editor-backend-fallback-api.md)加入四独立fallback purpose与Root末次实际回应复查，原data/images合同不变。旧批开放限定data／images工程阶段，不是完整编译、运行Valid、Trial或Release。此API批原共同compiler、图片算法、Jobs、Blob、profile、375玩家输入与后台UI不改；后继[阶段操作界面](editor-backend-stage-ui.md)接受权操作与核验下载，不改变服务合同。完整`/compile`、`/trial`仍404。

## HTTP与授权

固定前缀`/api/games/<规范UUID-v4>/stage-jobs/<data|images>`：

- `POST`精确`{draftRevision,scope:"all"}`，真实`Idempotency-Key`，202返回`{admission:"stage-only",purpose,job}`。
- `GET /<operationId>`取得自己的实际SQL Job；不接受查询参数、自报valid、路径、URL或hash授权。
- `POST /<operationId>/run`或`/retry`精确`{}`，操作key及引号包裹的正整数`If-Match`必需；缺428、陈旧412、冲突409。只显式推进，不自动改期待或重试。
- `GET /<operationId>/artifacts/<固定assetId>`仅ready任务。先从准确不可变源完整重建、核profile／pipeline、全部checkpoint与实际R2 bytes，再读取该Job描述的对象；最后复核当前会话／完整Job状态。不是按缓存ready／客户端摘要直接发对象。

所有请求经过原Root实际cookie／session／epoch／首次改密、精确Origin（含端口）；所有POST实际CSRF。服务query再核owner／snapshot／SQL pipeline与路由gameId。图像来源仍要求真实管理员本人，不冒充管理员、不读他人或内置。GET在同源原安全边界内，产物no-store／nosniff／attachment／octet-stream并返回服务计算的`X-Content-SHA256`；不能作为运行证书。

两个原样执行器复用同SQLite `CompileJobs`、固定private source/profile及实际BlobStore。`compile_operations.actor_id`和新增`stage_http_commands.actor`加入Root全局key命名空间提交检查。后者永久绑定actor／epoch／game／purpose／Job／动作／期待修订，只是请求条件，不是成功收据。相同绑定遇到终态可以完整重验后返回当前不可变阶段事实，不声称该HTTP命令曾完成写入。未知回应先查询Job；非终态仍按准确CAS和持久lease恢复。

## 产物和限制

[data执行器](editor-backend-data-compile.md)29产物与[图像Job](editor-backend-image-jobs.md)七产物保持原样；不是合并后的完整RuntimeManifest。图像报告仍保留原内存规划器missing定义，持久事实只能看实际SQL checkpoint，不能拿报告自报许可。

读取每个产物都会重验完整源及相关对象；这优先保证权限和精确修订，目前没有缓存吞吐、并发公平、Cloudflare CPU／内存／SLA保证。300秒lease是内部有界参数，不是平台承诺。完整回退、全部依赖／消费者、Q69／运行准入、单章scope、完整工作台与资源UI、Trial所有输入／async门、发布／玩家／清理／备份仍缺。阶段操作不更新game.modifiedAt，不物理删除staging，不影响玩家部署。

## 实际验证与重复边界修正

先登记[本地I/O](editor-local-validation.md)，旧425输入独立保护，只Root归档后定点装配／路由／namespace，新增服务和测试。`backend-stage-api-session-r1/api-r3`七组42实际未派生Root／HTTPS8787／SQLite／R2请求：

1. 真登录／强制改密／完整copy；owner、401／403／404、Origin端口、CSRF、内置、自报valid、key跨namespace、428／412及queued产物拒。
2. 实际共同data29产物、run条件永久绑定、purpose／SQL pipeline／查询字段门。
3. 实际私有terrain长度／SHA和防缓存头、foreign取数拒；服务已完整重建、对拍所有checkpoint而不是直接读摘要。
4. 实际固定来源／catalog／图像七产物及私有mini PNG读取。
5. 相同永久enqueue key仍核实际SQL pipeline；损坏不能返回旧摘要。
6. 实际ready checkpoint损坏时，即使对象仍健康也拒503；SQL pipeline损坏409，仅自有测试SQL显式还原。
7. 真关闭／重启原SQL/R2，永久命令条件恢复、终态重验事实，不改modifiedAt；完整compile／Trial404。

api-r1六组41请求先通过。追加实际SQL pipeline负控后api-r2观察到重复data enqueue202而原期待409：原底层enqueue的幂等分支只返回owned摘要，新HTTP入口误以为这已作兼容性证明。它没有绕过产物读取或跨作者权限，但仍是遗漏。保失败源码／日志，不调低409期待；只在新入口enqueue后调用实际query并核routegame／savedrevision，api-r3原409通过。此前data ready边界修正保持不变，不能将它自动推广为所有返回路径的证明。

最终同SHA的jobs九组78、ids十一组153、draft九组50、epoch三组18，共299独立focused请求；加本主门42为341。auth七组61／metadata八组72／blobs九组69在新Root接线后、最终仅新增enqueue复查之前通过，其生产者SHA独立保留，不冒最终同SHA543总轮。该唯一后续差异只在stage enqueue，Root／构造器和这些旧路径不变；不重复无依赖基础碰运气。未改UI和玩家，不跑无关浏览器或游戏库存。

所有执行只用自有OS temp、随机工程配置、loopback、已装MF/OpenSSL及白OS；无用户profile／IDB／DOS-SAVE、部署／云创建／安装／全局trust／commit／push／共享清理。失败producer、日志、Source SHA及Root最小逆差、支持诊断与静态文档检查分别保；LSP未确认不写clean。完整目标仍active。
