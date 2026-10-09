# E-01-BACKEND-STAGE-ASSET-COLLECTION-1 — 内部实际服务收集（不挂Root）

## 范围与信任边界

新`server/stageassetcollection.js#collectFixedStageAssets(tokenHash,request,ports)`协调服务器既有实际games/stageApi/libraryAssets；新focused工具只模型。**没有生产Root装配、网络路由、schema/Job写、玩家/结构装配器改动，没有新授权服务或运行证书**。旧511输入/115imports/375玩家保；工程新两文件另记513/116，Root玩家行为基线仍管理UIb137。设计对应[共同合同](game-editor-technical-design.md)§4.1–4.2及[只读结构角色计划](editor-backend-stage-asset-plan.md)。

`request`严格gameUUID4/positive64位以内准确saved revision/六primitive purpose→六distinct JobUUID4；canonical JSON先拒accessors/nonJSON/extra与8192B工程请求界、32层。64位是既有PrivateDraft协议，非全部metadata/原机制界。token64hex只是格式，**不赋实际权限**。配置端口只由可信服务器装配，接口形状也非能力证明；model fakeports可造结构结果，不能当native身份/字节已认证。

先`PrivateLibraryAssets.read`，让现行服务自己捕获并跨await重核实际actor/epoch/owner/fence/精确snapshot/copyOrigin/catalog；其返回`assertCurrent`闭包作为后续复查之一。捕获完整reference（含createdAt）及库body的canonical脱离文本；依次读六真实`StageJobsAPI.read` Job响应与绑定report附件。后者原路径重建全源/核所有持久输出、实际Blob读回及末Job比对，收集器不能用摘要绕过。每次await前后，对已拥有库闭包/所有阶段已发响应assertCurrent/准确reference复查；snapshot回调后再核最初库/阶段响应，DTO/freeze/JSON不是权限。绑定report UTF8 fatal/JSON/4MiB界后交原pureplan作角色/compiler/profile/pipeline/两stagechain/reportSHA-length/库关系校验，末同步复查，返回冻结`{plan,assertCurrent,admission:'stage-plan-collection-not-runtime',runtimeAllowed:false,trialAllowed:false,releaseAllowed:false,deleteAllowed:false}`。

`assertCurrent`仍仅服务器内部服务复查，不导出token/句柄/原byte缓存、也不产生新Root能力。**成功分段读回不等于435对象在一个provider原子快照中一致**；各服务终点之后R2外部变化/并发写/provider-body-CPUlegacy闭包仍未证。pureplan原missing全部保，不能清native-byte-readback或runtime/profile/slotMap缺口为准入。

## 当前验证

- **模型33检查**：fakeports而非SQLite/Root授权。13个await逐个返回后撤销都立即拒/无后续读或retry；snapshot/库body/已拥有Job/report bytes变动拒；snapshot回调晚撤身份被后核捕获；request额外/缺purpose/错类型/重Job/坏UUID/0和65位revision/坏token/缺serverassert/缺库闭包/accessor0次调用、output深隔离/冻结及current2不追latest有证。没有原生provider或用户态。
- **main-r2 fresh实际Root：18检查/112 HTTP请求，16报告sourceSHA/21执行前WX源码**。原plan13所有expectation/status/预算保持，原102请求相对顺序保；additional10控制/请求执行5新检查。正常KDF admin-author、全固定Source与available库登记/完整copy、六ready与准确saved1/current2全源全产物已重验；新owned subclass测试路由直接调用同一Root实例的actualports，**不改旧fixture或生产Root**。
- 实际收集13内部段（一次库＋六Job/六report）输出与独立pureplan全字相等：44描述子/435角色/20unknown，前后whole35行/catalog/databaseSize不变；跨purpose distinct IDs仍原409JOB_PIPELINE_CHANGED。不是fake Game/Source或以同SHA造能力。
- 新测试对已发collection serverhandle在**owned异步yield后**修改实际data Job row_revision=999；原服务末次assertCurrent报409JOB_CHANGED，再次查旧handle仍409，已完成合法读取不回滚。此native位置不是13个collector-provider-await逐个lateSQL测试；13个位置仅模型证，不推广provider。
- 原actualpassword handler改epoch，fresh本人请求对旧collection句柄仍401SESSION_INVALID，不用新principal DTO翻新旧cap。新fresh collection在实际库fullsource/400role读取返回后插永久fence，现行闭包立即409GAME_DELETING、第一stage查询前拒；非completed410，不清fence或取消已合法provider读取。Row突变和最后fence仅owned样本，非作者合法编辑流程、SQL自动rollback或physicaldelete。

## 首轮预算失败与修正（不拼partial）

main-r1 **ETIMEDOUT/statusnull/SIGTERM/1800000ms**，21执行前源/stdout-stderr-meta、六binding/库/recipe/collected partial均保；无最终report或failure JSON（突然终止），不冒通过。时间戳23:08捕获、23:26recipe、23:33collected、23:38超时；无逐请求trace不能断言确切在途点或TLS/provider挂死。能确认新setup在成功完整收集后又发第二次完整13段重验，仅为了晚到SQL情景，使整个昂贵序列挤占固定预算。

仅新fixture/probe最小改为已有真实handle在owned asyncyield后实际SQL改行并末次重核，保持同409与其它原13期待，不变产品/认证规则或1800s。新producer增加完成请求trace，fresh r2全18/112通过，不借旧partial恢复拼绿。`failure-analysis-r1.json`明确postexecution，`derivation.json`原r1源SHA不追改；另有原型SQL列名operation_id在执行前核actualDDL应为job_id并修，仅草稿、非虚构失败轮。首轮杀后实际netstat8787无监听，未清任何共享process/状态。

## 未完成/证据收口

RuntimeManifest@1/角色URL-loader-directImage/audio/cache/认证Trial/完整chapter identity-slotMap/Profile/255原初始化/发布上架-registry公告/allhistory引用与body-providerCPUlegacy排空/physicaldelete410/scrub-cachebackuprestore/完整工作台全部仍open。513工程inventory不等Root接入或全部Q69/Q20/goal认证。独立static-r1已核所有511protected+2新源=513/115旧imports+module=116、所有input-import-history-failure-native/model执行SHA/21与3同期wx、成功collection与recipe全字435roles等值及6report原始length-SHA/pipeline两stage链、原13检查/102调用相对顺序/新增6请求status、9syntax/gitdiff/593本地链接73唯一Q/35actual NodeDDL243列70对象；文档后r2重签封存。Jev人工3362B最小摘要preview审后固定jev-1.13.0仅advisory，无源码/资源/秘密/用户态/全日志或oracle。主动9code8inconclusive+1aux，MD4unavailable（ready0/2），sessionall435文件27继承warning/35hint-info，不称clean。

诊断auxiliary是newfixture唯一`new URL(request.url)`静态规则：该owned handle只经workerd平台原生Request调用，url已是绝对合法URL，无自由authorURL或伪Request-shaped接口。按实际报出身份mark false-positive，范围仅本fixture，不推广通用URL输入、不写ignore注释/禁rule/清cache、不更改已验证native源；记录rawfinding，不冒零诊断。Goal段首次edit错猜header未匹配、无文件变化，读实际header后定点追加，非producer失败。

owned证据根`.dragon-analysis/editor-phase/backend-stage-asset-collection-session-r1/`；before先核522abbe8全图并WX归档local-validation。模型与native不同；同数据库callback复查非R2事务。无真实SAVE/用户profile-IDB/browser/云创建/安装信任/commit-push-deploy/共享清理，目标active。
