# 固定季节整图认证入口（E-01-BACKEND-FALLBACK-API-1）

从[单季持久Job](editor-backend-fallback-jobs.md)继续，只改`server/worker.js`装配及`server/stageapi.js`，新增显式验证。原443输入先封存，两旧源wx归档；441其它输入含375玩家不改，新验证使声明444。原生成器／compiler版本／四单季和六图执行器／SQL协议／R2／原件及引擎不改。

## 实际接口与权限

原`data/images`接口与DTO保持，增加固定purpose：`fallback-spring`、`fallback-summer`、`fallback-autumn`、`fallback-winter`。每个在Root绑定既有独立season服务；路径选已配置服务，不接正文season或任何URL/path/hash。`all`仅该单季Job的全阶段，`stage-only`不是完整四季manifest或运行准入。

- POST `/api/games/<UUID>/stage-jobs/<purpose>`：准确`{draftRevision,scope:"all"}`，永久key；202只预约，不自动执行。
- GET `.../<jobId>`：实际owner/admin、epoch、精确snapshot及compiler/pipeline查询。
- POST `.../<jobId>/run`、`retry`：准确`{}`、quoted positive If-Match和原命令key；缺条件428、陈旧条件412，同key换请求409。命令绑定不是成功收据，终态重放仅返回重新核验的当前事实。
- GET `.../<jobId>/artifacts/<assetId>`：ready后重新编译准确全源、核所有checkpoint及实际R2，再读取指定登记输出。附件octet-stream／no-store／nosniff／固定文件名与完整SHA头。每Job只有report和一季PNG，不开放任意对象读。

实际Origin（含端口）／CSRF／session／管理员本人／内置保护／SQL namespace均保持。新latest不重定向旧revision；跨季、原images/data与auth操作不能借永久key混用。

## 回应前最后一道门

Stage API给此次结果登记短期WeakMap关联，固定token及实际Job的规范摘要；这不是授权／持久凭据，clone或自报DTO不能替代SQL。每次登记和Root从await返回后再次调用`assertCurrent`，重新查实际principal、owner、Job epoch、snapshot、pipeline和完整Job摘要；JSON与原事实对拍，附件重新按actual checkpoint核长度及全SHA。没有await位于最后检查与构造Response之间。

该门覆盖所有六purpose，原data/images的响应格式不变。它不承诺传输期间对象不变、Cloudflare CPU/内存/吞吐SLA或所有来源消费者闭包；完整source／catalog及R2核验仍由原执行器承担，不把进程品牌升级为持久资源准入。

## 本批验证与两次失败定位

独立`.dragon-analysis/editor-phase/backend-fallback-api-session-r1`保源码、失败轮、探针、日志与下载，所有新文件wx；仅owned SQL/R2／随机私密工程配置／loopback8787／已有MF和OpenSSL、白OS环境。没有用户profile-IDB、DOS-SAVE、云创建部署、安装trust、commit/push或共享清理。

- 最终fallback-r3七组78实际HTTPS：默认Root固定路由及角色/Origin/CSRF/body/query、永久key隔离、saved1/current2、四独立季节Job／两产物、五附件完整SHA、CAS／实际SQL snapshot-pipeline-checkpoint和同长R2损坏、真实stop/restart重验、明确retry与游戏modifiedAt不改；完整compile／Trial仍404。
- 原data/images默认Root当前七组42另通过，data29／images7、产物／权限／SQL损坏／重启与终态命令均保持。两producer同产品SHA，120请求；没有重跑无关UI/KDF/PNG或宣称完整浏览器覆盖。
- 单独native夹具重导出原Root ingress，仅在真实StageAPI.read返回的await边界：改实际snapshot导致409、翻此次附件bytes导致503、调用原实际password handler成功200后Root拒401；旧cookie401、真实新login旧Job/key409，明确新预约202。不是并发外部HTTP、直接epoch SQL修改或假成功API。
- 四PNG与此前逐行Worker／独立Pillow封存PNG bytes完全同，诚实复用旧像素证据，不冒本批新oracle／DPR／浏览器颜色管理认证。

r1失败不是ready期待放宽：夹具把终态cursor2/checkpoint2的ready强制标failed，造成协议不会正常写出的状态，retry后无剩余阶段所以running。先用原CompileJobs／actual nativeSQLite受控探针核实真实prefix running1→failed1→queued1→ready2及清lease，ready再fail拒；探针principal/reference/verifier为明确synthetic，只证明状态协议，不证明资源或认证。再仅修夹具故障输入为report-only cursor1的合法failed前缀，保ready期待、产品与预算不改。此API retry场景是controlled SQL状态，不冒有机执行器故障；前批真实写失败证据独立保留。

r2在五默认Root主组完成后控制入口401。原因是新ignored fixture自建ingress用DO名`metadata`，原Root用`editor-authority-v1`；重启到了不同真实SQL主体。五请求受控探针让同一真实login/password session原入口200→旧夹具401→重导出原入口200，才定点修fixture，不改生产权限、cookie期限或TLS。r1/r2都保失败meta、源码、四PNG/report和日志，不记完整通过。另一次只读统计命令多一右括号已定点修正，不是产品测试失败或重跑。

## 未完成

本API批固定季节操作UI未接；后继[固定季节界面](editor-backend-fallback-ui.md)已接六固定用途、旧关联恢复与核验下载，有独立浏览器限定证据，仍无运行资格。全部CSS/loader/audio／G127/255、Q69／RuntimeManifest、真正Trial全部mutating/async认证门、完整编辑/空章初始化、发布/玩家/存档/删除备份与所有要求仍开放。主goal保持active；本批不授运行或发布资格。
