# 私有固定副本草稿：精确读取与限定保存

## 范围与权限

`E-01-BACKEND-PRIVATE-DRAFT-1`安装真实Root私有接口，不是完整编辑器／运行／发布完成。原管理员固定来源复制、账户和存储规则不改；新增`server/drafts.js`，Root只装配服务、路由和跨接口永久key检查。409旧声明输入（含375玩家输入）保持字节，根玩家部署未改，无部署／云创建／提交推送。

- 实际会话／强制改密／owner／epoch；管理员不越权读取或写他人。内置403、外人404，UUID与修订类型严格检查。
- 服务固定definitionDigest必须同时匹配SQL目录与copy origin。两表自报同值不构成证据。read/save/query在R2读取或结果重放之前检查；每await后复查原actor／epoch，最终SQL再检查固定来源和主体。
- baseline只来自管理员已提交`copy_origins`、固定目录和实际不可变R2；完整规范JSON、全分块实际SHA、共同结构门、`FixedCopyProfile`品牌和全源差异校验。客户sourceRef／ownerId／valid／root／cap都不能赋权。

## 已安装HTTP接口

| 接口 | 合同 |
| --- | --- |
| GET `/api/games/<UUID>/draft?revision=<positive decimal>` | 必须恰好一个明确修订；读取实际不可变快照，不回退latest。仅返回元数据、20章标签、公开势力槽四资源值与限定profile／摘要，不返回全地图／raw／对象路径 |
| POST `/api/games/<UUID>/draft/save` | 实际Origin／CSRF、`If-Match: "<revision>"`与`Idempotency-Key`；缺条件428，陈旧412。只收`{metadata:{name,introduction},resourceEdits:[{chapterId,slot,values}]}` |
| GET `/api/games/<UUID>/draft/operations/<key>` | 原主体当前epoch查询永久请求，返回pending／failed详情或经原immutable snapshot及content receipt再次核验的committed结果 |

字段只允许`money/reserve_cav/reserve_arc/reserve_inf`，通过共同`editChapterResources`同步具名字段和对应9个原生byte，并完整对比baseline；不允许source/raw/map/角色/计数/新章/上传。最多32补丁，重复章＋槽拒，请求16KiB限额；这是Web运维预算，不是DOS机制或容量证据。

**signed24/u16只说明表示安全，不批准异常值运行、可玩控件范围或Trial/Release。** 本API轮没有表单覆盖；后继[实际私有资料表单](editor-backend-draft-ui.md)只安装名称／简介编辑和只读资源，不代完整UI。普通`POST .../draft`和validate/compile/Trial/publish继续404。

## 持久事务与失败

`draft_requests`绑定实际actor/key/epoch、目标、精确期待修订、HMAC请求摘要及捕获的规范补丁；客户对象在await前捕获，不读取getter/隐藏/symbol/有损JSON。其它接口同key冲突409，异内容或旧epoch409。失败显式重试先在同SQL预约事务恢复pending并清旧error；不后台自动重试。

实际R2写之前记录`draft_objects` intent，conditional immutable写入＋真实读回后verified。保存最终同SQLite事务执行metadata CAS／名称／审计／snapshot／`draft_references`／对象committed／永久结果，最后content操作记录失败能回滚全部这些SQL变更。已有副本baseline与旧快照不改。no-op保留原修订和modifiedAt；失败同样不改游戏modifiedAt。staging记录不是物理垃圾清理；旧epoch不可继续写错误记账，也不能由新cookie复活旧请求。

明确修订与baseline各经过实际源解析和共同验收；当前为避免改变已证实的verifier接口，提取metadata与共同验收有重复读／解析。不称Cloudflare CPU／内存／时延SLA。并发相同key可能准备多次，但只有一个SQL永久结果；没有新增lease／调度／背景executor。

## 本轮实际验证与失败分析

详细生产者与日志位于`backend-private-draft-session-r1`，当前产品SHA分别绑定在每轮元数据和最终静态收据中。

- `draft-r1`八组通过，源与测试归档后补固定服务definition和失败重试状态。`draft-r2`只在测试要求一定观察到瞬时pending的断言退出；未记录该请求的最终结果，不追认成功或保存失败。
- r3改用真实owned SQL触发器记录failed→pending及error清空，并在committed前强制检查OLD为pending／错误为空。实际并发HTTP查询看到failed→committed、未捕获pending，写请求200；**不把两个独立HTTP请求的调度顺序当成保证，不以盲重跑遮蔽r2**。
- 最终`draft-r3`九组50实际Root HTTPS请求：完整副本20章精确私有读、guest/foreign/builtin、Origin/CSRF/条件写、非法整源／角色值、no-op、元数据＋四资源原生9byte保存修订2、永久结果／跨key／陈旧412、旧修订1、独立真实R2全源与共同writer完整比较、启动器重启、并发同keyno-op、真实末端SQL receipt触发故障500全回滚、同key显式重试提交3、两SQL目录/origin同错definition409与恢复、登出／运行门仍闭。
- 独立`epoch-r1`三组18请求：ignored派生Root与实际PrivateDrafts／SQL／R2，在真实预约后明确阻塞一次真实读、观察pending、真实改密、用新会话释放读取。原写401且游戏状态不改；新会话查询／重试旧key409、旧会话读401、当前会话正常读200。控制口只在ignored夹具，不进产品，不用sleep假装并发边界，不伪造会话或库。
- 当前七完整回归`metadata-r1`八／`blobs-r1`九／`auth-r1`七／`catalog-r1`八／`copy-r1`八／`jobs-r1`九／`ids-r1`十一全部通过；真实Root复制入口`entry-r13`六组40请求、fresh Chromium、两实际副本/pending启动器重启及独立wx截图通过。没有本轮私有表单/browser覆盖或无关87库存全跑声明。

真正原件、SAVE、用户IDB/profile、实际云秘密／证书、部署均未触及。SQLite fault/tamper仅服务器关闭后的owned临时库，明确恢复；R2独立inspection只读自有persist真实字节。所有失败、源码与生产者保留，不能把未跑／unconfirmed诊断冒clean。

主动12路径最初0clean/1findings/7MD unavailable/4JS push-only inconclusive：唯一error是ignored夹具对native Request绝对URL的静态误判，按精确文件/行/消息标FP，不改source/inlineignore/规则/cache。随后5source warning probe为1clean/4inconclusive、0显示诊断且FP仍明示隐藏；不冒全clean。session296文件23既有warning保留（此前14logger裁决与9旧sink/duplicate/JSON项），正确await括号不迎合hint改错。适用Node语法与真实执行另外签；Jev4919B人工工程摘要经0redactions preview审阅后发jev-1.13.0，仅advisory，无源码/资源/秘密/存档/完整log。

## 后续

后继[资料表单](editor-backend-draft-ui.md)已有失败输入保留／冲突／原key查询和实际改密后的保守恢复证据；完整受权私有工作台仍缺，随后共同compiler、图像/头像、runtime/Q69/Trial/发布及引用删除／备份恢复。精确四资源表示门不扩成角色／地图／新章初始化或中立开局规则。全目标继续见[工作表](editor-goal-completion.md)与[需求索引](editor-requirements-matrix.md)，不关闭E-01或任何未完成全项。
