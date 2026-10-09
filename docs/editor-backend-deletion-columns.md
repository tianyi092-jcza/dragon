# 删除观察的固定SQL列布局门（E-01-BACKEND-DELETION-COLUMNS-1，内部限定）

接续[当前任务冻结](editor-backend-deletion-job-freeze.md)及[只读观察](editor-backend-deletion-inventory.md)。已知表名不足以排除新增引用列：本批新增`server/deletionschema.js#assertDeletionColumnSchema`，inventory只增加import及同事务调用，Root／stores／认证／规则／UI和其余463旧输入含375玩家不变，466声明。

## 固定合同及来源

- 当前13份明确服务源码的34条CREATE TABLE语句只读提取，source SHA绑定前批receipt；Node内置SQLite纯内存重建，以`PRAGMA table_xinfo`取得34表／234列的固定布局。生成器、DDL文本／各源码来源、产物SHA与完整派生保存于独立`backend-deletion-columns-session-r1`。
- 七属性为cid、name、type、notnull、dflt_value、pk、hidden。product是固定当前布局常量，Node SQLite仅离线派生／核验工具，非新增Worker／玩家运行依赖，不安装包或读取任何实际用户数据库。
- 同SQLite的实际principal／owner或admin管理／非内置／未listed／used ID／永久fence与row校验**之后**，scoped记录查询及native R2之前验证每张实际已存在的已知表；未知表仍原`DELETE_INVENTORY_SCHEMA`，不符列布局明确503 `DELETE_INVENTORY_COLUMNS`。不从client拿表名、SQL、schema或许可。
- 每次capture包括native list await后的重新捕获都重验，无缓存授权或自动schema迁移。不能把未知列默认为无引用，或擅自丢列修复原库；未来已授权schema升级需同时重新审消费者／合同及验证。
- table_xinfo包括generated virtual hidden列，普通table_info不够。原observer DTO／sqlDigest构造／coverage UNKNOWN与deleteAllowed false保持；不新增计划／成功receipt／清理权。

## 严格边界

这是**列布局合同**，不认证同列结构的CHECK／collation／FK／index／view／trigger语义、存储schema被管理员完全妥协后的真实性、完整未来数据模型或所有引用。原schema SQL仍在capture摘要中，但文本变化拒收不等于完整DDL审计。

可选服务表缺失维持原捕获边界，不承诺整个后台已装全；存在的未知列拒收不等于完整legacy命令／共享引用图／全SQL可scrub。34／234是当前布局，不是游戏容量／机制阈值。PRAGMA及schema等值不授native drain、删除／Trial／runtime／发布许可，不改private journal的pending／uncertain，也不保证跨服务原子快照、ABA排除、全SQL heap或云SLA。

## 实际当前验证

`main-r1`46组454记录Node调用，34 metadata观察／10 byte／10 command／10 freeze结果；一次fresh owned状态完整成功，无producer失败／timeout／signal／预算延长／拼旧green。454只是实际本轮计数，有界polling数量不是业务合同。

原40流程／期待／预算完整当前兼容：真实20章全副本／baseline／saved2／data29-images7、85对象50,665,541B的完整native hash、权限／journal／command proof／Job freeze、损坏／await／回滚／restart／实际改密。不是所有季节／全部后台／媒体语义或游戏运行证书。

新增六组：

1. actual workerd SQLite34表列名同固定来源；当前原流程在新gate下真实执行，不仅离线模型。
2. content_snapshots、draft_references、compile_jobs分别实际ALTER ADD引用列，observer精确503，native list次数不增；foreign author仍先404，不泄schema。仅owned fixture精确原DDL／rows复原后整份摘要同。
3. 实际根列rename／drop及generated virtual字段分别拒；hidden=2实测，不把生成列遗漏。fixture保存原rows再还原，非产品迁移或repair。
4. actual PRAGMA响应上的七独立单字段控制：缺属性／type／default／nullability／PK／hidden／ordinal均精确503；这些是fixture包装真实返回值，不冒原数据库已真的改变这些七个属性。
5. 实际native第一list返回暂停后添加已知表新列，await重新capture503、不发部分成功；恢复仅owned故障清理，不取消provider／回滚R2。
6. actual starter/workerd重启后同完整观察／固定布局，不凭临时实例缓存授权。

随机工程配置／owned OS tempSQL-R2／loopbackHTTPS8787、白OS子环境、已有MF/OpenSSL与Node builtin SQLite，各producer1800s不延，源码快照／报告／日志wx。未改UI／玩家，故不跑无关browser／IDB／DOS／媒体。Jev仅3449B人工最小工程摘要，经preview审最终state后固定1.13.0 advisory，不发原码／资源／秘密／用户态／全日志，不计算SQL／机制／期望／权限。适用主动LSP／session-all、source-import SHA／精确inverse／语法／链接及73Q另封存，unconfirmed不称clean。

## 后继当前DDL定义核验（旧列门本身不升级）

[维护源](editor-backend-deletion-definitions.md)：新增同authority/fence transaction只读核固定当前14源35DDL/35隐式索引3FK/70对象、原35/243列与enforcement，等列CHECK/FK/COLLATE/UNIQUE及extra对象有真实native负控。16组80调用/15facts、Node9组分立，_cf_CREATE实际由SDK拒而非新门native表证；480声明477旧含375保/96imports。旧本函数/inventory/freezes不改、不自动获得该新门保护，rowIntegrity/nativeDrain/deletefalse，返回DTO不是future提交许可。

## 剩余

完整refs／shared refcount／legacy关联、所有writer与native在途保守drain、专属幂等物理delete／核清、SQL内容及收据scrub、minimal completed410／cache／实际backup与隔离restore。Blob.delete仍关闭，Q43／Q46／E09／工程§5.4／主goal不完成；原资源控件只读及原机制／G127-255／全消费者／RuntimeManifest／认证Trial／发布／正式存档等旧缺口保持。无commit/push/deploy/cloud/install/trust/SDK、真实profile-IDB／DOS-SAVE或共享清理。
