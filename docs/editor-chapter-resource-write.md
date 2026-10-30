# E-04：既有副本章节资源写入（限定本地API）

## 后继：解散后的原槽身份

以下历史收据之后，互联网草稿资源表单已接入。修复编辑器组合路径：解散会缩短公开 `factions` 数组，但原有 `idx` 与22条 `nativeFactionSlotRaw` 的对应不应变成新的数组位置。写入器现在在唯一、合法的公开idx中寻找目标，同时仍只改同一原槽的具名／raw／native九byte；不存在的公开槽、重复idx、缺固定来源和分歧继续拒绝。不编辑已移除势力残存raw，不重排／扩展槽，不改变原版数值规则或允许非完整初始化运行。

`PrivateDrafts.read` 的资源DTO使用 `slot=f.idx`；固定副本校验重编码资源也使用可信来源idx，不从显示位置选槽。固定源负控先复现“公開勢力槽不符”（`compacted-resources-before-r2.log`，首轮120秒超时不计通过）。修后资源写入器193检查／71拒绝通过；全固定副本profile通过，覆盖原章解散后的资源更新、复制非密排章后的更新、JSON往返，以及已移除槽原始字节篡改拒绝。实际自有文件SQLite／FileBucket服务63项通过，新增解散后独立副本资源DTO、保存至rev14、完整源精确比对和已移除槽拒写；使用显式principal夹具，不是HTTP授权或运行机制证明。日志均在 `.dragon-analysis/editor-completion/compacted-resources-{writer,profile,service}.log`。

本阶段补共同JS创作路径，而非重复Python编译修复。`compileGameSource`保存章state，生产native初始化从固定22槽raw建立唯一表并覆盖具名视图；只改具名值会丢掉修改。底层宽度来源复用[资金原证](editor-money-import.md)与[三池原证/编译](editor-reserve-compile.md)，不添加规则公式或异常值可玩许可。

## 后继：资源修改后解散的保护比较

固定来源负控 `funded-disband-before.log` 复现先改资源再解散被422拒绝：profile重新插入仅供比较的势力记录时采用初始资源，和保留的已修改native槽发生分歧。现从候选固定槽读取既有四资源表示，复用原writer在可信基线记录上重建，仅用于比较克隆；不把候选任意raw拷入基准、不复活实际已解散势力，也不允许API编辑已移除槽。新增 `readFactionResources` 复用同文件既有偏移／解码，不新增规则或值域。

完整固定源profile通过（`funded-disband-profile.log`），包含先修改后解散、JSON往返及夹带F18字节修改仍拒绝；资源writer193检查／71拒绝、shell65项重跑通过。实际隔离文件SQLite／FileBucket服务66项通过（`funded-disband-service.log`），新增同批资源修改→解散保存rev15、完整源等于已有写入器输出、旧修订14完整保留。测试使用显式principal，不是HTTP认证／浏览器／运行初始化证明；更复杂复制时点的已移除槽资源组合未由本批完整覆盖。日志均在 `.dragon-analysis/editor-completion/`。

## 后继：复制保留解散前的资源

`funded-disband-copy-before.log` 复现上述已保存章再复制时仍被422拒绝：复制比较只重编码当前公开势力，遗漏已解散原槽保存的四资源。现复制比较对可信原章曾有、复制时已移除的公开槽，也用原记录及既有writer重建四资源九byte；仅替换比较用native数组，不将势力加回实际草稿，不开放API写已移除槽，不处理原章从未公开的槽。其余原生字节仍全量比较。

完整固定来源profile通过（`funded-disband-copy-after.log`），新增修改资源→解散→复制、JSON往返／完整state一致及复制原槽F18、F23夹带修改拒绝。实际自有文件SQLite／FileBucket服务72项通过（`funded-disband-copy-service.log`）：保存复制到rev17、完整源等于独立既有writer输出、复制state与原章完全一致、旧修订16不变；原有恢复／原数据树不变负控保留。shell65、语法与diff通过。使用显式principal，不冒HTTP认证／浏览器／Trial或原版解散初始化证明；没有新增规则或数值域。日志在 `.dragon-analysis/editor-completion/`。

## 产物与边界

- `web/src/editor/chapterresources.js#editChapterResources`仅完整builtin-copy的既有章/公开原槽：资金signed24及骑/弓/步u16三池。核章身份/固定22条64B来源、四具名值与public/raw/native一致及money_hi；拒缺记录、分叉、未知字段/角色、getter/hidden/symbol、非整数/负零/越界。不补默认或静默修源。
- copy-on-write只同步选章选槽的四具名值、资金高byte及两条raw的相应九byte；未修改字段、unknown、未公开槽、其余章、来源记录ID、地图/角色/计数/首都保留。同值返回同对象。此profile门不是全部GameSource身份/schema或任免初始化证明。
- `tools/editor_server.mjs`新增POST `/api/chapter-resources`，精确五字段`gameId/expectedRevision/chapterId/slot/values`；加载现草稿后准确修订比较，变化才保存并递增，同值不写盘。成功响应只含定位/修订/changed。单进程同步尾，不是认证、durable CAS/跨进程事务；内置/minimal/缺章/stale明确拒，没有latest回退或whole-state上传。
- 原地图保存/metadata/compiler/原版表初始化/费用/AI/RNG/Clock/App/Trial/存档/默认包不改。没有章CRUD/继承/势力角色/首都表单或新增导航模块；完整后台和合法异常域仍缺。

## 实际验证与失败保留

[I/O先审](editor-local-validation.md)后新增两入口；87入口/293声明源仅库存，**没有新87全轮**。最终`chapter-resource-write-session-r1/run-focused.mjs`的r4七项白OS/Python env串行exit0：新memory/API、旧chapter API、reserve-native、money-native、copy-drift、installed entities。旧门仅按已审白名单读取固定KI/五SINARIO；新门不读DOS，全部禁真实SAVE、用户profile、native IDB及外网。

- memory189检查/70拒，20章首末槽、四字段、no-op、表示边界及独立unknown AA/BB；独立Buffer编码比全source，原输入不变，getter/implicitIDB访问0。表示边界不进入规则运行。
- API own OS temp/loopback完整复制，20章四资源各+1条件保存至rev21；一次准确whole编译，四native blob由真实HTTP逐长度/SHA校验后仅测试内存复用。20独立world实际fresh及公共JSON冷恢复，固定表别名/四值、完整webMeta、公共restoreSnapshotState语义state、native军团、assembly同，RNG/Clock0tick保留。不是20次独立单章构建、全App初始化或战役。
- 旧rev1单章pack在首次资源装配前挂迟到gate，保存rev2后释放，仍装旧四值；原pack及immutable snapshot文件逐byte保留。no-op不写盘/不递增；12拒含stale/额外字段/角色/minimal/builtin及同captured revision竞写一200一400，不假定赢家、不默重试。
- r1 raw表比失败：cold按已存sidecar物化`_extinctionHandled`等明确字段；改为公共恢复语义并加强完整webMeta/全state断言，不修改产品/补值。最终审计按原receipt更正此前exit13归因：r2/r3均API1200秒ETIMEDOUT/SIGTERM、exitCode null且stdout空，无verdict，均保exact producer/log，不算通过。180秒仅stderr进度探针证明旧gate已结束后重复scoped装配慢，保AUDIT-ONLY；最终改一次whole编译/四HTTP已校验blob复用，仍执行全部20fresh/cold断言，没有清生产缓存/换loader。r4全部七项重跑，不拼历史绿色。

最终静态收据`chapter-resource-write-session-r1/static-receipt-r1.json`另绑定293语法/82current与archive资产/288旧声明源不变、server与runner有界逆delta、七实际日志/失败与探针/文档链接/诊断/HEAD；源码输入SHA在focused前后核。不以LSP unavailable/inconclusive或缓存空称clean，既有动态Scenario.factions建议不改正确API迎合工具。

主动11路径0clean/1findings仅五个动态Scenario.factions hint/6MD unavailable/4push-only inconclusive；工具“6confirmed clean”矛盾文字不采。session247文件九旧warning（两parser sink/两pipeline sink/四offline duplicate/已reviewed trueJSON冷克隆建议仍缓存），没有清cache/禁rule，也不把旧finding缺席写成resolved。

Jev初3415B摘要沿用了错误exit13描述，原preview/advisory保为历史、发送后按原receipt更正并重新preview/send；最终仅人工最小工程文字，经完整preview再fixed1.13/advisory，不发送源、原数据/图像/快照/完整日志/凭据，不作机制/权限/完成门。完整目标仍active，下一实际表单与所有初始化/后台依赖按[状态索引](editor-requirements-matrix.md)接续；无commit/push/deploy。
