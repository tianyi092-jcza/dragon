# E-05-CHAPTER-SERVICE-1：固定导入章的本地试运行

本页维护无认证本地工具的单章投影／缓存及历史App验证；不是互联网Trial的当前能力清单。认证Trial的后继实现见[服务端维护源](editor-trial-server.md)，完整目标以[现行验收清单](editor-completion-audit.md)A20–A22／A32为准；[旧目标工作表](editor-goal-completion.md)仅保留历史范围。单章投影已实际接入本地服务/缓存/工作台/真实App，但不是完整Q69依赖闭包或可编辑实体初始化证明。原地图/date采纳/current39＋作者2不变；不新增规则/AI/RNG/正式存档路径。

## 已接入的工程合同

- `POST /api/compile`的可选`scope:{kind:"chapter",chapterId}`捕获**已保存整源**，共同结构/ID/有限JSON/地图门通过后以[纯投影](editor-trial-scope.md)和同`compileTrialSource`编译。完整所选state、全共享地图/路网/旧generals/未知及source-record兼容资料保留；不剪未活动槽，不造新章/新将初态。
- 旧whole `studio-app-2`不变；scope独立`build/<revision>/<compiler>/studio-chapter-1/<sha256(chapterId)>`，保存selected `snapshot.json`及完整`saved-source.json`。manifest的`scope.savedSourceDigest`/`identity.savedSourceDigest`绑定整源，`scope.selectedSourceDigest`/`identity.sourceDigest`绑定所选投影。snapshotId再含明确chapter hash后缀，不拿子集当整源身份。
- 缓存读取重新核全saved源、投影、两个摘要、章序、六资产SHA/长度/**精确scope URL**与季节资料；不能同修订覆写非所选内容已变的full source，不能latest/whole/另一scope回退。GET pack/asset/app使用`scope=chapter&chapter=<id>`；资产再有具体digest/role，晚到仍读原文件。旧whole pack/App路径仍可用。
- 工作台“測試運行”请求选定章scope；普通“編譯”仍整源。子窗口清opener，显式势力选择，boot/runtime核game/revision/chapter/scope/六URL身份。原只内存/拒正式仓储能力不变，不热换已运行对局、不回写草稿；所有写只本地harness显式store，不装Web资产。
- 无关章表单缺state/cities可不阻断所选；unsafe JSON/重复或缺章/所选缺必需数据/共享地图坏仍拒。全源编译仍拒未完成的其它章，未来发布必须全源，不借单章成功放行。

## 实际验证与中断保留

入口/I/O先登记[验证清单](editor-local-validation.md)。全新OS自有store、loopback/全新Chromium，finally仅关自己监听/context/browser/temp，无真实SAVE/profile/外网。

- [API最终同轮日志](../.dragon-analysis/map-migration-2/chapter-service-machine-r1/E05-chapter-service.log)：19拒收/不变控制；whole及两个章scope六资产同、缓存/身份/双摘要分开，重复编译、未知/混scope/章/digest/旧修订、runtime混URL、manifest/saved-source损坏、同修订整源变化拒绝，后续修订不替旧快照。所选state全文同，整源未完成仍拒。
- [真实浏览器](../.dragon-analysis/editor-phase/chapter-service-machine-r1-chapter-App/receipt.json)：其它章owned state未完成，工作台实际选章/popup/势力/同App/原系统menu hold首帧前生效，三App为两章/两修订。先延迟原scope road请求，再保存tile16→32/编译新修订和另一章，放旧响应后仍16；新scope各32，日期264/266正确。state/RAM/RNG/Clock/身份不串；四季、正式save/load拒绝、IDB0、试运行不写草稿、console/page/外网错误0。零tick只证明启动/所有权，不作全战役/战略日历推进或人类视觉批准。
- [64入口同SHA最终收据](../.dragon-analysis/map-migration-2/chapter-service-machine-r1/receipt-resumed.json)：138源/current39/作者2前后SHA同；对前134只有server/runtime/工作台/boot/runner五差，四新增库存（projection/module＋pure/API/browser入口）。63项在首段显式串行通过，外层2100秒总时限在末项前中断；[原running收据](../.dragon-analysis/map-migration-2/chapter-service-machine-r1/receipt.json)/[原日志](../.dragon-analysis/editor-phase/chapter-service-session-r1/machine-r1.log)保留。独立owned恢复器先核所有源/资产及63日志SHA，再在新owned round实际执行**仅第64项**、结束再核同SHA，另写resumed收据，[恢复日志](../.dragon-analysis/editor-phase/chapter-service-session-r1/resume-r1.log)。这是同源码的新64实际门；不是不中断整轮、不拼历史绿色。
- focused API最初[api-r1.log](../.dragon-analysis/editor-phase/chapter-service-session-r1/api-r1.log)240秒timeout且无定位输出，不能断言产品原因；随后owned请求trace/120秒请求预算/清自己活动连接，r2及上述同轮API实际通过。没有放宽断言；[r2](../.dragon-analysis/editor-phase/chapter-service-session-r1/api-r2.log)保历史，最终代码已由完整库存同轮签名。编辑工具一次非唯一oldText部分应用，立即读新文件补唯一位置，未重复已应用更改或覆盖其它改动。
- 原5退休road skips仍非通过，固定RNG仅已覆盖Web路径，不等CPU/整战役。Jev只人工2681B工程摘要→preview审最终state→fixed1.13.0，advisoryOnly，不外发原资源/数据/用户信息/凭据，不作oracle或放行门。

## 后继共享校验器范围修复

当前回归曾发现 `projectTrialChapter` 在裁选之前使用全章严格校验，使上述“无关坏章不阻断所选”合同失效。现改为整源draft结构／保存门＋所选投影严格门，共享地图及全部所选记录不裁减。新增Q40空势力active诊断，空势力草稿可存但不能选中编译；全源编译仍拒坏章。当前本地API回归21项拒收、所选六资产／草稿不变检查及Trial服务20项通过；原历史浏览器收据未重跑，不冒新源码证明。实现、失败记录及产物详见[校验后继记录](editor-chapter-gap-reports.md#后继q40空势力与单章校验范围)。

## 后继Q28本地发布章表边界

互联网发布已有无章拒绝；本地harness此前却会把已编译地图的零章模板写成published pin。负控 `empty-chapter-publish-before.log` 实测HTTP200，不是仅缺缓存导致的拒绝。现本地 `POST /api/publish` 要求草稿至少一章且编译manifest章序精确等于当前草稿章序，才写pin。保留零章模板创建、保存、地图校验和地图资产编译，不把地图预览当可玩发布；不改原版机制、正式后台事务或历史pin读取。

`node tools/editor_server.mjs` 的隔离loopback自检通过（`empty-chapter-publish-after.log`，位于 `.dragon-analysis/editor-completion`）：零章模板仍生成小地图／terrain资源，发布400且无pin、原稿bytes不变、目录仅内置；完整章manifest被改为空／倒序／重复章的三负控均400，已有pinbytes不变；随后原发布／读取／名称／卸载检查继续通过。语法与diff检查通过。这是自有临时目录本地harness，不冒互联网鉴权、正式版本事务、浏览器引擎或生产准入证明；没有重建程序束或部署。主动LSP为一份文档clean，脚本有条件对象展开／await括号的hint，审计文档有SHA词典信息；session全量缓存81文件仍有8项既有warning、23项hint/info，未屏蔽或称全部clean。

## 后继本地发布当前源摘要绑定

本地 `POST /api/publish` 此前只验证编译快照自身完整性、修订号及章序；当前草稿若在同一修订号下被改变，仍会写入指向旧编译内容的新pin。隔离负控 `publish-current-source-before.log` 实测200而非预期400。现写pin前用既有 `canonicalDigest` 比较当前完整草稿和编译manifest的 `sourceDigest`；不一致拒绝，不重写源、不替作者恢复旧稿或自动编译。

`node tools/editor_server.mjs` 自检通过（`.dragon-analysis/editor-completion/publish-current-source-after.log`）：分别仅改自有临时源的metadata名称／章名称而保持修订号和章表，发布均400 `compiled source mismatch`，旧pin和请求前草稿bytes不变；测试finally恢复自有fixture后，其余创建／保存／编译／发布／旧pin读取检查继续通过。语法与diff检查通过。这仅覆盖localhost文件harness，不替代互联网Root的快照／权限／事务证明；没有改Trial旧快照读取、程序束、原版规则或生产配置。

## 后继本地单章缓存完整入口复验

当前 `node tools/verify_editor_chapter_trial_api.mjs` 完整入口通过 `PASS-FIXED-CHAPTER-SERVICE`：49次拒收检查、18份scope身份收据。未修改产品或测试，也未把旧19／21项收据当作本轮结果。证据目录为 `.dragon-analysis/editor-completion/chapter-cache-api-20261029/`，含 `tests-r1.log`、`result.json` 和前后SHA清单；430项选定Web源码／固定内容／五个工具输入前后相同，不是全传递依赖认证。

- 整源与两个健康单章的六项编译资产SHA一致；坏章仍使全源及所选坏章编译失败，健康章可独立编译，源文件字节保持。
- 14类既有字段／原生视图负控分别核整源拒绝、坏章拒绝、健康章成功；包含能力表示域、势力ID、原生军师／资源／顺序／记录与解散后的计数一致性。仅证明现有准入拒绝，不把这些测试当作原版初始化或解散规则的证据。
- 混用章／摘要／scope URL、篡改缓存manifest或saved-source、同修订整源改动均拒；更新草稿后旧pack仍精确等于原快照，没有latest回退。runtime环境也拒混用URL／身份。

I/O限定自有OS临时目录和回环HTTP：固定已安装Web来源只读，草稿／缓存及负控篡改只在临时目录，finally关闭自己的服务／连接并移除目录。不是互联网鉴权服务、浏览器App、断网暂停、完整资源闭包或发布证明。语法检查通过；本批只记录当前本地缓存出口，不重建不变程序束，不重复已完成的HTTPS草稿保存链。

## 尚未完成与后续

Q69的battle/portrait/TALK及所有可达共享静态资源完整固定修订/私有授权/缺失拒收仍需库存和捕获验证；目前季节8资源、原生4及mini2固定，不能以已有App成功断言完整依赖闭包。源DTO仍只读来源实例，不是可写GeneralDefinition、角色任免、历史人归并或初始化证书。本地工具没有互联网认证，不据此断言后台尚未实现。该批“已请求配置但未答”为历史阻塞；后继服务端Trial已接会话认证／撤销、私有资源、App战略／战术边界与限定浏览器链，见[服务端维护源](editor-trial-server.md)。仍缺的完整窗口／迟到资源／全部输入联合验收按现行A20–A22逐项追踪，不用本页历史阻塞暂停独立本地工作，也不把后继切片拼成整体完成。未知空章/新将/重槽/新拓扑/扩容仍拒，不猜默认字段。

主动9JS为2既有/正确await-member hints、7push-only inconclusive、0confirmed-clean；7Markdown unavailable。session183文件仍3旧warning（parser两个未调用路径sink、控制码regex已有意图false-positive裁决），不清cache/禁规则或称全LSP clean。语法/全64日志SHA/138源及current39＋作者2/文档链接/Git diff/HEAD的[最终静态核签](../.dragon-analysis/editor-phase/chapter-service-session-r1/static-receipt.json)单列，不把缓存空或push-only当clean。无再次commit/push/fetch/deploy、真实存档/profile/DOS I/O、全局配置/缓存或原批准记录修改。
