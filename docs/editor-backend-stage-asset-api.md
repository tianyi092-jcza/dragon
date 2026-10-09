# E-01-BACKEND-STAGE-ASSET-API-1 — 受认证结构计划GET（不授运行）

## 现行范围

`server/worker.js`只新增现行`collectFixedStageAssets` import及GET dispatch，internal collector/pureplan/旧服务、constructor/schema/其它Root方法/玩家/全部旧工具保持。新focused `tools/verify_editor_backend_stage_asset_api.mjs`。旧512输入/115imports保，替换Root＋新工具→514声明、模块graph116、375玩家仍保。前继[内部服务收集](editor-backend-stage-asset-collection.md)的“不挂Root”是其历史批次事实，不是本批状态；当前Root行为由本批收据接续，不再用管理UIb137证明当前所有Root字节。

```text
GET /api/games/:gameId/stage-assets
    ?revision=<exact saved revision>
    &data=<job UUID4>&images=<job UUID4>
    &fallback-spring=<job UUID4>&fallback-summer=<job UUID4>
    &fallback-autumn=<job UUID4>&fallback-winter=<job UUID4>
```

query恰七个唯一字段，顺序无意义，URL标准解码后的值判定；缺/重复/额外422STAGE_COLLECTION_QUERY。game及六distinctJob均小写UUID4；非法game422GAME_ID、Job422STAGE_COLLECTION_OPERATION；revision正十进制string/无前导0/64位以内422DRAFT_REVISION（沿PrivateDraft协议，非全部metadata或原机制界）。路径仅本固定副本侧协议，内置403、其它method404（Root非法写Origin/method仍先403）。无额外CAS、幂等保留键、Job或SQL状态写、session.touch，GET结果不是newoperation或权限凭据。

保持Root标准精确Origin（有Origin须完全相同）、同源私有Secure/HttpOnly/SameSiteStrict Cookie。无Cookie401；强制改密403；当前actualadmin本人固定副本，作者403FIXED_LIBRARY_ADMIN_REQUIRED；管理员角色也不许读别人私有内容，owner/fence原服务继续决定。缺实际Stage/library配置503STAGE_COLLECTION_NOT_CONFIGURED，不能用fakeports/DTO fallback。现行已发Job对应错purpose/compiler/pipeline409；真实queued409JOB_NOT_READY，指定savedrevision与合法Job不同409JOB_SNAPSHOT_CHANGED。后两者仅映射内部collector**exact known** READY/REVISION TypeError，其余错误保持Root原处理，不按任意message构造权限或status，不放宽原helper门。

## 响应和末次权威

响应顶层只`{plan,admission:'stage-plan-collection-not-runtime',runtimeAllowed:false,trialAllowed:false,releaseAllowed:false,deleteAllowed:false}`，JSON/no-store，GET不刷新cookie。plan原reference/compiler/report/currentmissing/435私有locators保，不能当RuntimeManifest@1；source/操作UUID/opaque reference都只是描述，不是资源read能力。

实际调用既有collector，以本Root `games/stageApi/libraryAssets`可信端口读一次库＋六Job/六report共13段；report路径重建全准确source/核所有实际输出，不能用ready摘要跳读。每await/回调后原库capturedactor-epoch/ref-origin/catalog和已发真实Stage响应guard复核，精确saved1不latest；末次`assertCurrent()`后只序列化脱离/冻结普通plan字段，再核**原capture**及actual Root principal-id/epoch/role/mandatorychange；末次之后无await/外部callback。不导出服务assert/句柄/tokenHash或原报告byte缓存。

Root接线不把分段native readback说成435对象同一provider事务或一次持久准入。缺真实profileCertificate、chapterId/slotMapDigest、完整loader/directImage/audio/cache/255原图像初始化/认证Trial/发布/全历史refs与body-providerCPUlegacy-drain/delete410-cachebackuprestore/工作台等依旧open，不清plan.missing，不创建255文件、规则或初始化默认值。

## 实际验证及局限

- **fresh main-r2：30检查/66请求，7报告sourceSHA/21执行前WX源码**。actual正常Root KDF：admin/author与强制改密、Source41role＋库400role登记、完整副本、六stage真实enqueue/run/ready、save2；本GET请求saved1。无工程手工Game/snapshot/Job替代正常来源。
- URL/Origin/cookie/method/角色/内置/非法game/缺重复额外query/0-前导0-小数-65位revision/Job非法-null-数组表示-大写-重复负控；拒后whole35行/catalog/databaseSize同。真实queued和validrevision2/oldJob1两个冲突也独立前后SQL同。
- 成功GET实际13读的所有原库body、六issuedJob、六report byte被owned观察wrapper采集。wrapper调用原服务、返回原对象、原WeakMap/current guards不变；独立pureplan装配与Root JSON全字相等：44 descriptors/37generated＋398shared=435roles/20unknown255、20chapter artifacts。非selfSHA就赋权，整个读取前后35SQL/catalog-size不变，no-store/JSON/无setCookie/无顶层handle/assert/token/nativebyte有证。
- 六不同purpose已由原服务绑定；Root中distinct swapped data/images仍409JOB_PIPELINE_CHANGED，在实际库返回后/首次Stage issued之前拒。正常saved2存在不让旧saved1追latest。actualpassword handler撤旧cookie401；freshsession actual库全源/400role返回后owned插永久fence，立即409GAME_DELETING、第一Stage前拒。这一native hook只**after library await**，不冒13providerawait全部原生覆盖、终止provider、回滚合法读取或completed410。
- 当前原账户suite七组61请求全部保，owned只加一newGET/noR2正拒→**auth-r2八组62请求**；持久真实KDF/重启/密码撤销/限速/真实idle-absolute时间和noR2仍有证，不冒本批新UI/browser/网络/完整其它内容suite。

main-r1原28/60与auth-r1原8/62都是成功且保。人工代码复核发现两个合法但不适合的selection会落通用500，仅新Root分支映射两个已知TypeError并加native两例；**没有声称先前实际执行了这两个500**。当前30/66全fresh（原28期待保持）；auth-r2重验当前Root，Source/currenthelper之后不变。不拼旧成绩，不延1800s预算。

执行前新tool修改有三次edit非唯一anchor，工具部分应用其它条目，余项按真实结果修；均在首native前、无虚构producer失败或复跑原件。另预先修newtool拼字template、toReversed和随机UUID版本替换位置，保测试权限/期待。两native/两auth来源与日志、最小Root正逆delta/原archive保留；oldwrapper辅助日志单独标，不冒preexecutionWX。无nativeproducer失败。

## 证据收口

owned `.dragon-analysis/editor-phase/backend-stage-asset-api-session-r1/`。before先核e9dff4全input-source-import-history/failure/document/native/model SHA及WX归档Root/维护页。独立static-r1已核512protected＋两源514/graph116/375/两个成功round来源与21捕获/30与原28/66查询状态/独立13段所有report原byte长度-SHA及再装配/35actual DDL243列70对象/73Q/598本地链接/10syntax/gitdiff/Root移除两新增区域正逆原字节相等，文档后r2再签封存。不重跑封存155namespace/23wait/83-93/UI/原游戏全轮，因未变相应门或player。

Jev人工4579B最小审阅文字→审preview→固定jev-1.13.0仅advisory，未发送源/资源/秘密/真实用户或全日志；不作SQL、mechanism或完成oracle。主动LSP六执行代码及另三个collector-delta-advisory代码零诊断但inconclusive9/confirmedClean0，不称clean；五MD unavailable（marksman/typos ready0/2）及sessionall既有27warning/35hint-info原样另记，不ignore/禁rule/清cache。无UI/浏览器/profile-IDB/SAVE/云创建/install/trust/commit/push/deploy/共享清理，目标active，不关闭完整Q69/Q20/E-01/E-06或全部goal。
