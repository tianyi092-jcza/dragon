# 同事务域永久删除栅栏（E-01-BACKEND-DELETION-FENCE-1，内部限定）

落实[工程§5.4](game-editor-technical-design.md#54-物理删除与恢复纪律)的**第一步**，不是完整删除、资源回收或备份交付。新增`server/deletionfence.js#GameDeletionFence`，四旧源metadata／drafts／copyimages状态门及Root跨命名空间key检查；公开路由／编辑界面不新增删除能力，`ImmutableBlobStore.delete`仍关闭。453声明，447旧含375玩家保护；不改规则／原资源。

## 栅栏与权威

- `begin(tokenHash,key,{gameId,expectedRowRevision,confirmationName})`仅受信内部service。实际同DO SQLite事务重新查session／epoch／mustChange及本人或admin管理权；内置拒绝，未知或其他作者非admin404，上架拒绝，明确名称须与当前草稿名称逐字相等，row CAS不是draft revision。admin管理权不转化为私有内容读取权。
- 输入严格字段、UUIDv4／key／正十进制row／well-formed名称，正文先独立捕获。服务端秘密HMAC绑定原输入；不接客户端digest或`valid`。已用ID必须在同SQL，不能替未落地copy目标凭空建栅栏。
- 同事务递增rowRevision、插入`content_deletion_fences`、永久`content_deletion_operations`及无内容audit。内容modifiedAt／draft revision、原快照、名称占用／对象引用／bytes均保留，等下一受信清理阶段；故障全部SQL回滚，不假称跨R2回滚。
- 同actor/key重放必须相同请求及epoch、仍有实际权限，验证receipt与持久fence；返回仅`gameId/state:fenced/rowRevision/createdAt`。其它key对已fenced目标409；旧key与其它auth／copy／draft／Job namespace不能重用。新会话不复活旧epoch操作，fence仍永久。仅内部`query`，无成功删除收据／撤销／undelete／自动TTL。
- fenced只指“清理前已不可新增内容准入”。返回409`GAME_DELETING`，**不是410、GAME_DELETED、已核清完成或回收站**；未接玩家删除识别。

## 当前接线边界

`GameMetadataStore.assertNotDeleting`实际查同SQL，不是前端状态／品牌。owned快照／Blob授权／create、prepare前及verifier await后均检查（后者再次完整BlobAuthority，旧allocation也不复活）。PrivateDrafts和FixedCopyImages两处直接查Game的入口增同一门，不只依赖随后碰巧失败的source读；原有async／提交复查保留。

现行CompileJobs查询／入队／lease／checkpoint／retry经真实snapshotReference取数；原copy提交结果、私有库、Root阶段API的末次复查亦经过该门。已fenced目标不能返回旧快照、再写保存／checkpoint或使用旧allocation。不会通过编辑器给内置资料新增特例。Root所有实际后继服务仍要核owner/epoch，future发布／上架／上传／Trial新增入口仍须显式集成同一门，未存在入口不能称已认证。

不提供物理删除capability。已进入native R2 PUT的请求可能在fence提交后留下opaque orphan，返回／提交仍拒；栅栏不是in-flight drain或SQLite-R2原子事务。此时绝不盲删同hash对象，source/catalog共享引用、所有Job intents／已发布历史／Trial、缓存和备份核清尚未完成。

## 当轮实际验证

`.dragon-analysis/editor-phase/backend-deletion-fence-session-r1`，随机工程密码／secret、独立OS tempSQLite/R2、loopbackHTTPS8787、白OS环境／已有workerd及fresh Chromium。各producer1800s原预算，日志／failed source／bytes／截图／报告wx。无正式DOS SAVE／profile-IDB／云或共享清理。

### 最终主验证 `main-r5`：八组、83记录请求

- 真实两个author／admin、小257B native R2及工程snapshot记录（**不是GameSource／普通新建／可玩模板**）。角色、builtin、listed、严格输入、名称及row CAS、原key冲突，失败无fence。
- SQL BEFORE INSERT receipt trigger故障实测，row／fence／audit／key一并回滚，旧snapshot和bytes保留。
- 两实际同key并发请求一个minimal收据；异key／异正文拒；已prepared save提交、旧create receipt、私有blob及原allocation全部拒，admin不能借删除权读他人byte。
- 四分别控制的native GET、native PUT返回后、snapshot verifier、opaque Job checkpoint await：先实际端口，再fence提交，晚返回／prepare／checkpoint均409，仍一快照／空checkpoint；不称物理回滚或完整战役。
- admin跨作者管理fence有效，仍无privateblob读取权；Root auth写不能借同deletekey；未开公开delete。
- 真starter/workerd重启保fence／收据和资源拒，不以进程cap代持久状态；实际改密旧cookie401／新epoch旧操作409，fence不可撤销。

### 最终独立兼容＋实际完整副本 `compat-r6`：十一组、36 Node调用

前十旧私有库/data-stage流程全部保原期待：17browser library GET／0内容POST／4完整附件（PNG／最大11,196,244B FLAC／JSON＋data），七坏byte/header/长度拒、准确saved1-current2、reload／改密／author、IDB0／外网0及console/pageerror0。不是全部阶段／后台回归；synthetic pagehide继续另标，非BFCache。

额外第十一组在真实20章全副本上建立内部fence：Root draft GET/save、private-library、新epoch queued data Job和六purpose enqueue全部精确409`GAME_DELETING`；另建新epoch真实完整副本核committed copy receipt的同一门。原copy key跨改密先精确`COPY_OPERATION_REVOKED`，不以其冒fence命中。固定共享库registered facts不变、无物理删除。

原只读测试SHA及九处精确派生保存于`compat-origin-final.json`，只更新artifact path／保护范围／当前源捕获／相同helper引用／fixture main及追加真实fence组，前十期待／预算无变化。

### 失败纪律

- `main-r1`首login500，无认证操作成绩：native starter固定className `EditorMetadata`，仅改wrangler classname无效，fixture当时只export `DeletionFixture`。核实际starter行44和workerd错误，只加fixture export alias及移除无效override，r2完整通过；不改SDK／启动器／状态期待或预算。
- `compat-r3`十组partial不拼PASS：原copy key来自改密前epoch，`AdminFullCopy.#row`先拒，错误期待其暴露fence。核实际409及#row→#result顺序，保失败；新增第二个实际新epoch完整副本，旧key另测原revocation，新的receipt必须命中fence，r4从fresh profile重验全部。
- r2／r4通过后人工复核central prepare顺序发现内部端口先state再owner会泄露foreign fence冲突（公开draft／blob已经先owner）。保旧metadata／主producer与报告，state门移动到owner/allocation后但仍在verifier前及await后，添加两个foreign prepare精确404；最终r5／r6完整独立重验当前SHA，不复用旧green。

适用LSP／session-all、Jev仅人工工程摘要及静态逆差／hash另签；silent或unconfirmed不称clean，正确await.member和yield点提示不删除。完整Goal仍active，无commit/push/deploy。

## 后续缺口

引用清理计划与共享refcount、Job/in-flight drain、专属对象幂等物理delete/readback、全部SQL内容／收据scrub、核清completed删除凭证／玩家410、缓存失效与实际备份清理／隔离恢复演练。还缺统一RuntimeManifest／认证Trial／发布与全部编辑域。只有上述逐项得到实证才开放完整删除出口；本次fence不能关闭工程§5.4、E-09或主目标。
