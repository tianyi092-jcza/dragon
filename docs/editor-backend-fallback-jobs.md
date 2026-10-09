# 单季整图持久任务（E-01-BACKEND-FALLBACK-JOBS-1）

本批在[逐行生成基础](editor-backend-fallback-rows.md)上接实际准确source、租约与私有R2，不开放Root／UI入口或运行资格。仅一处旧planner改动、新Job及显式主验证：443声明，440旧输入含375玩家全保；原六图compiler／输出、Root、Jobs、Blob、目录、草稿、引擎与素材不改。

## 来源和生成边界

`FixedCopyImages`将原六图的全源捕获前缀抽为同一私有`#prepare`：原管理员本人、不可变snapshot、baseline/profile、copy origin／固定definition、全41角色SQL/R2核验及共同`compileGameSource`均保留。原六图继续用该前缀，算法、版本、输出及报告不变；新`captureFallback`只接服务固定spring／summer／autumn／winter之一，不接作者URL／hash或裸plane。

只从共同compiler的`terrainBytes`和已登记的相应256atlas捕获纯逐行投影；不从图片反算规则、不修改原资源、不一次物化四季或96MiB RGBA。每行yield前明确await内部可信执行守卫，随后复查实际principal／epoch、owner、准确snapshot、origin与catalog capture；生成完成的await后再次两重检查。默认guard类型推断的“await无type效果”提示不代表可删除该异步边界：实际native改密callback和租约控制在这里执行，不能改成不等待或只测开始时的身份。

压缩产物≤4MiB才可进入现checkpoint协议（Blob自身上限另有配置）；原row encoder的16MiB不自动扩大Job产物。生成报告是`single-season-fallback-only`，记录source／dependency／catalog／season与三I/O版本、6144×4096及完整pixel SHA；未签完整runtime、其它资源或持久写入成功。

## 持久状态

`FixedCopyFallbackJobs`只接受构造时可信season，复用原`CompileJobs`的`all`scope作为“本单季pipeline全部输出”，不是整游戏运行资格。compiler独立为`fixed-copy-fallback-1-rows-{season}-{I/O修订指纹}-job-1`；短修订区分符不是权限，实际报告保留完整修订，checkpoint及source／bytes完整SHA才是验证依据。不同season／原六图／资料pipeline不能复用永久key或查询对方记录，不改旧Job／key标签。

两阶段`validate-fallback → store-fallback`保存绑定report和一PNG：真实SQL意图、R2条件写／全bytes读回、写返回后的lease／source复查、verified记录及checkpoint。重启从明确saved revision重新捕获、重算单季、核对已有report／PNG与前序；ready也完整重建来源、每个checkpoint和R2，不按缓存状态直接通过。运行中的guard每行实际检查当前SQL lease／epoch／CAS；ready guard检查原完整Job摘要，最终再次复查。

失效租约／身份不能把旧intent升verified或推进checkpoint。实际失败可显式原幂等条件重试；到期running须新代次claim。R2已写出而提交未成仍保intent／对象，不能声称跨服务回滚、删除或物理GC。300秒租约、4MiB产物及逐行背压不是Cloudflare CPU／内存／吞吐SLA；全43MB草稿、baseline及41角色反复读取仍有显著成本。

## 当轮实际证据

独立`.dragon-analysis/editor-phase/backend-fallback-jobs-session-r1`先登记I/O、441 before和旧planner wx；产品源在所有三producer之间保持同SHA。仅已装MF／OpenSSL／原flags、白OS子环境、owned随机配置／OS temp SQL-R2／loopback HTTPS，秘密不进命令或日志；所有报告／PNG wx，不覆盖旧包。

- 主七组65实际HTTPS：管理员本人saved1／current2、角色／builtin／Origin／strict scope和跨season／跨namespace永久key；native row128 lease到期在任何intent前拒。新代次生成report后SQL trigger使stage1租约到期；真实关闭重启，新代次重建来源和旧report，spring attempt3完成。summer／autumn／winter另各独立单季任务，错误season查询409。
- 四季八实际R2产物全长度／SHA，四PNG的完整bytes与此前独立Pillow封存的逐行PNG完全同；报告完整pixel SHA／6144×4096也对拍。诚实复用旧独立像素证据，不冒本轮新Pillow执行、DPR或浏览器颜色管理证明。
- ready源重建／不写modifiedAt，陈旧CAS、实际SQL pipeline／checkpoint损坏及同长R2 PNG损坏拒，保持ready记录，无盲修对象。native第128行的真实原password handler callback200后旧执行401，任何intent前停止；新登录不能复活Job／key，原游戏时间不变，公开compile仍404。该callback不是并发外部HTTP或直接SQL改epoch。
- 另两组21实际HTTPS独立写返回控制：先实际BlobStore写report，再抛受控R2-return故障，得到failed／retryable而只有intent、无verified／checkpoint；用户明确retry及同key重放后重建原bytes完成。另实际写后lease置到期，返回时409，无verified／checkpoint，新代次证明已写对象后完成。控制只在ignored继承Root夹具，非生产开关、非模拟成功结果。
- 原六图九组56实际HTTPS当前回归：准确source、租约／restart、七R2／六旧PNG、旧compiler／pipeline拒、ready与损坏／输出await改密均保持。三producer合计142请求，未重新跑未改的全部账户／库／PNG／UI或玩家战役。

无失败测试或延timeout碰绿；主／原六图先成功，再补独立写返回边界，未重做已过主轮。保主轮原runner，增加write选择后仅执行新producer；不追认旧轮使用新runner。实际Node／workerd、SHA保护／精确逆差／imports／syntax／文档与支持诊断另封存。LSP inconclusive／MD unavailable不报clean，正确`(await expr).member`提示不改坏。

## 尚缺

当前是内部单季任务，未接Root的fallback Job／产物API和UI，更不是四季与资料／全部资源合一RuntimeManifest。完整CSS／loader／audio／G127/255消费者、Q69和准入、完整认证Trial输入／异步门、实体／章节初始化和表单、发布／匿名玩家／存档／删除备份及全Q仍缺。主goal active；无commit/push／部署云创建／安装trust／真实profile-IDB／DOS-SAVE／共享清理。
