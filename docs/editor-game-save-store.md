# E-08：按游戏隔离的本地存档底层（显式opt-in）

工程§8.2切片，**尚未安装进玩家App/Trial/repository/saves页**。旧v2路径保持，没有真实存档迁移、清理或新版本标签；目标仍开放。Q11/Q19的受信正式版本核对、确认UI/取消/不可加载与完整共享恢复仍缺，不能把下面compareDelete当版本删除许可。

## API与数据

- `web/src/core/gamesavecodec.js`：严格JSON/正文/摘要/比较token编码；`gamesavestore.js#createGameSaveStore({gameId,databaseName,getIndexedDB,createRecordId?})`绑定游戏，数据库名/工厂必须显式提供，无默认访问global IndexedDB。工程opaque ID长度256，不normalize身份，拒控制码/孤立代理；game键encodeURIComponent分隔，百分号与冒号不会碰撞。
- 沿现同源store `saves`/DBv1，独立`game:<encodedGameId>:catalog-v3`和`game:<encodedGameId>:record:<slot>`；目录格式3含gameId、nextWriteRevision、严格有序unique slot/active recordId的摘要。它不读`catalog-v2/record:<slot>/slots`，无自动迁移、整库升级/清空。
- `put({gameId,slot,releaseId,releaseOrdinal,chapterId,manifestDigest,snapshot}, expected=null)`；null只能新槽，覆盖必须get返回的完整token。JSON捕获在第一个await前；snapshot须JSON对象，无损保未知字段；undefined/非有限/-0/稀疏/typed-array/date/function/symbol/bigint/访问器/循环拒收，不推测完整Scenario或原字节初始化。元数据只语法检查，不认证release/章/manifest存在、最新或可加载。
- 正文format3带recordId/writeRevision及输入字段；按排序字段的规范JSON bodyText算Web SHA-256，pair只bodyText/bodyDigest。get同事务捕获目录/正文，随后在事务外核实际digest、语法/绑定/摘要一致，返回独立record和frozen token；list仅读摘要，不证明可加载。
- 新建recordId为独立crypto UUID（可注入fixture），覆盖保该ID；每游戏nextWriteRevision单调分配，不在删除后重置，耗尽拒。重复active ID拒；即使fixture故意重复已删ID也不能复活旧revision/body token。与规则RNG无关。
- SHA不放进活跃IDB事务：put先捕获本地目录/正文、算候选摘要，再读写事务重核完整捕获目录及槽期待，正文＋目录同提交；不同槽的同时写也可能保守冲突，必须重读处理，不静默重试覆盖。任何请求成功不等事务完成。
- `compareDelete(token)`核绑定和已捕获正文digest，事务内比较`gameId/slot/recordId/writeRevision/savedReleaseId/bodyDigest`，另比较完整bodyText和摘要；只删该正文及目录行，保counter/其它游戏/legacy。corrupt、缺正文、目录不符或替槽拒绝，不修复/自动清理。token是本地期待，不是认证/签名/远端有效凭据；bodyText含保存内容，不应传给外部review或日志。
- 未来版本删除流程仍须**先**取得独立受信已识别旧release/最新目录并复查，再由显式左键确认捕获的版本条件调用primitive；503、未知、损坏、下架/删除不得变版本不符。普通正式局不套Trial网络暂停。完整snapshot生成、同版能力/JSON/detached恢复、游戏级导入/备份和所有mutating入口仍需共同App接线。

后续[真实快照限定验证](editor-game-save-snapshot.md)已补当前20章snapshotState→strict/store→公共detached、80损坏能力/索引拒载保正文与RNG续态；没有放宽codec或安装App。以下保留本底层批次的小JSON/176声明源与六focused历史成绩，不能据后续20章0tick推广为全部中途状态。

## 实际验证与限制

I/O先登[清单](editor-local-validation.md#e-08-game-save-store-1显式opt-in底层先审io)，77入口/176源码只是库存（五新JS及补记旧savecatalog，不声称完整ES闭包）。本阶段最终白名单env `game-save-store-session-r1/run-focused-r3.mjs`六项串行：两新门、旧repository/local-saves/transition-guard/Trial-policy，全部exit0；旧170声明源仅runner登记变化，现仓储/序列化/App/Trial源和82资产不改，176语法另签。

- 纯内存7组/59负控、implicit IDB getter0：规范JSON与独立Node SHA比对、同slot/编码碰撞/clone/list摘要、七token字段、坏header/有损JSON/访问器不调用、损坏正文/目录不补、两写一赢、stale删除/ABA、activeID碰撞、读写abort/error各2–4请求及同步throw/删除失败、held commit前不成功、不可用和抛falsey/undefined的工厂拒。工程小snapshot不是正式恢复fixture。
- fresh Chromium两页、只两个显式随机owned库：factory自己新建v1/saves并冷页get、同一库两游戏slot0与显式legacy夹具不读清、原生跨页CAS一赢/一冲突、错游戏与旧token不删替槽、实际delete/recreate、原生put/delete请求成功后主动abort保正文/摘要、百分号/冒号分隔。六流程组，page/console/outside错误0；不是两作者认证、真实旧档或确认UI。
- 内存r1 mock只发tx error而漏默认abort，top-level await未结算；r2重复idle登记三个held commit，断言失败；两失败与原mock字节保留。修mock不松生产事务门，r3纯门通过。随后六focused r1通过；review补factory falsey错误必须reject及真实未seed建库，r2**六项全重跑**；随后把既有savecatalog显式补入输入记账，核预审旧SHA，最终r3再次全六重跑，不拼旧绿色。
- final静态收据/producer在`.dragon-analysis/editor-phase/game-save-store-session-r1/`；语法/日志/receipt/差异/资产/文档链接/诊断/Jev另核，不称完整77全轮、E-08完整出口或完整任务一完成。未获取commit/push/deploy授权。
