# 持久HTTP命令目标关联（E-01-BACKEND-COMMAND-TARGETS-1，限定）

接续[只读删除观察](editor-backend-deletion-inventory.md)，补当前copy/run-cancel、stage/run的同SQL结构关联。新增`server/commandtargets.js#HttpCommandTargets`；定点Root、stageapi、inventory三旧源，其余452含375玩家保护。**不是命令成功receipt、权限、完整引用图、drain或delete能力**；物理删除继续关闭。

## 真实写入与旧记录

`content_http_command_targets(kind,actor,op_key,game_id,target_id)`以kind/actor/key唯一，固定copy/stage CHECK。仅在原命令绑定事务中记录；实际persisted命令及同actor copy_request/compile_job都必须存在，game UUID来自其不可变真实记录，不接受客户端game/hash/SQL或valid。既有关联的目标不符503，不覆盖；插关联失败同时回滚新命令绑定。只是可信调用者内部接口，不单独授权执行或成功。

Root run在新绑定前实际query，核当前epoch/owner/fence；cancel保留**新认证同owner可明确取消旧会话pending工作**的既有能力，按真实同actor request及fence检查，不借query把cancel升级为resume或误禁此路径。已fenced的copy不新写命令或关联。stage/run已有实际Job权限与游戏门，绑定关联后仍沿原execute和末次检查。未新增API／UI，retry/enqueue仍由既有compile_operations关联，不重造HTTP run成功收据。

旧HTTP command只有不可逆digest时不猜game或target，不扫描请求摘要/秘密反解，不后台全量补索引。合法准确同键重放并通过当前实际权限/状态可记录缺失关联；这不证明原请求执行。旧key/请求/epoch照旧约束。单纯已存关联不是可以恢复的capability。

## 观察边界

inventory将当前有明确关联的copy/stage命令及索引行纳入关联SQL摘要；核实际命令和同actor request/Job目标，损坏503。新增返回常量`httpCommandCoverage:BOUND_ROWS_ONLY_LEGACY_UNKNOWN`，旧缺关联**不会被当零历史命令或全部可scrub**；仍`deleteAllowed:false`。raw旧digest、不完整历史、未来同名列/新表与所有writer/drain仍有缺口；两列表一致不为跨服务事务。管理员只有原最小计数/摘要，不得到foreign键、命令正文或内容。

## 后继服务完整性（原结构证据不提升）

[命令关联proof](editor-backend-command-proofs.md)补固定服务HMAC和独立fenced只读核验：封存实际绑定事务中的command摘要／epoch与关联。真实另一个同actor合法Job错配仍可满足本页原结构存在门，新seal门拒503；不能把原十五组或原inventory报告说成已经核MAC。当前33组含原26兼容／同SQLproof故障／旧seal重放／损坏与真实restart有证，462声明457旧保，缺关联或seal仍UNKNOWN／无删除权。原class需受信server requestKey，Root/stage已显式装配；不是新权限或成功receipt。

## 当前验证

独立`backend-command-targets-session-r1`，wx归档三旧源并核455/84基线。真实owned temp SQLite/R2／随机工程配置／loopback HTTPS、白OS子环境和已有workerd；无新浏览器，因为UI/玩家输入未改。明确producer1800s，三轮status0/null signal/null error，预算未延。

最终`main-r3`十五组123记录Node请求、11观察，包括：

- 实际20章copy/save2、data/images及queued fallback、原权限/fence/双分页/缺失-orphan/五坏list/SQL-R2 await变化和实际epoch控制；旧八组流程不放宽。
- 原copy及两个stage/run精确game/request/job关联；模拟旧缺关联后准确同键合法重放只补结构行。
- 实际SQLite关联INSERT trigger500，command与关联同事务回滚；原key明确重试可用。
- 既有copy/stage关联损坏，正常Root run精确503；cancel及terminal重放兼容，同key异target409。
- actual workerd restart同绑定与关联；fenced copy新命令精确409且原表全同。
- fenced inventory坏target503；模拟缺关联减少两已知行但coverage恒UNKNOWN/无删除权，fixture精确恢复后同digest。
- 实际改密后旧pending run409 COPY_OPERATION_REVOKED；新会话同owner新key显式cancel200，保留取消权限、不恢复旧运行。

本样本85私有元数据/85引用、200关联行只是当轮数据，不是产品常数。fixture SQL损坏/删关联/恢复仅owned工程控制，不为产品cleanup。r1十三组、r2十四组源码/报告都保；随后人工复核Root查询不应阻断新会话取消旧pending，分开run/cancel门并补实测，最终r3完整重验当前SHA，未拼旧green。命令摘要不授原请求成功，完整媒体语义/六用途全执行/其它后台或原机制不在本证据范围。

主动LSP/session-all、源码/报告/历史、语法/链接/73Q另签；silent/inconclusive不等clean。未提交、推送、部署、创建云、安装/trust、DOS SAVE或真实profile-IDB；完整goal仍active。

## 仍缺

全部legacy持久引用/共享refcounts、全部writer冻结与native排空、计划提交重验、专属幂等delete/readback、全SQL与收据scrub、completed最小凭证/410、cache/实际backup清理及恢复排除；本批不关闭§5.4、Q43/Q46或完整目标。
