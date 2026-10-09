# E-01-WORLD-RESOURCE-PORTS-1 — 共同世界加载端口

## 本批实际接线

[共同工程合同](game-editor-technical-design.md)§4.1–4.2要求同一资源/规则入口，不另造自建引擎。本批直接给现行`createWorldResources`、`createRoadGraph`、`createPathfinder`增加可选可信I/O和生命周期端口，复用[私有字节上下文](editor-backend-private-byte-context.md)、[JSON/小图解码](editor-backend-private-resource-decode.md)，**实际私有地图读入同一个道路/地形加载器和原chunked投影**。原Root/API/权限/SQL/UI、旧工具、源资源、Rule/初始化/Scenario/renderer不变；三个现行玩家loader获准修改，其余**372玩家输入保持**，不能写成375玩家全未改。

- `createWorldResources(definition, {fetcher,imageLoader,bytesLoader,seasonLoader,assertCurrent})`：仍固定384×256/tile16、structuredClone后深冻结definition、构造懒加载；默认core helpers/URL/默认单例保持。把fetch/assert端口传原road/path对象；atlas图片及layout完成后再次核局部生命周期，再调用原`createChunkedTerrain`。无atlas时通过seasonLoader，await后复核，不另写PNG或地形规则。
- `createRoadGraph(url,{fetcher,assertCurrent})`：首次和缓存加载检查，Response及JSON返回后核，再原installGraph；失败清自身promise、后续明确调用可重试。fetcher缺省**加载时**取globalThis.fetch，与旧全局替换行为一致，不在构造时冻结它。原192槽、v2原生校验/固定地址与所有查询/搜索完整原文本保持。
- `createPathfinder(definition,roads,{fetcher,assertCurrent})`：三资源fetch及原roads并行，Response/body批次后检查、尺寸/offset原检查保、提交terrain/cost/offset前再核，返回副本前核。失败不半装地形/成本；**道路可能已合法单独就绪，不是全世界原子安装**。terrain identity/查询/占格/搜索/字段算法尾段原bytes等值，不凭旧注释新增原机制结论。

这三个端口是可信调用方能力，不是任意作者脚本入口；回调不是actualsession/epoch/fence授权。缓存图/地形查询不持续远程认证，已返回对象或画过的像素不受DRM/瞬时撤销。原私有byte每次实际网络请求仍由Root权威控制；App/Trial依赖全装配和所有mutating/async/网络门，不能用局部回调替代。

## 验证与来源

| 证据 | 当前覆盖 |
| --- | --- |
| new模型21检查/38fake请求 | SAME共同factory；四I/O端口、懒加载/同URL两实例不混用、cached-return copy、fallback、坏ports/容量、HTTP/body/offset失败后明确重试、latefetch/body/atlas/fallback局部拒 |
| 原`verify_world_resources.mjs`未改 | 默认两世界/core helpers/原缓存与地址资源harness当前通过，不宣称实际玩家App全轮 |
| 原`verify_world_asset_retry.mjs`未改 | 五原case HTTP/JSON/length/offset-shape/graph-http：不半装、重试单飞/返回隔离/offset只读；四固定输入/mock无转发，9执行前WX |
| actualRoot/fresh browser8检查/20Node请求/8browserGET | 正常Source41/library400登记/完整复制saved1/data29+images7两实际Job/current2；同原factory私有road/terrain/cost/offset就绪v2/192/98304B，再私有atlas/layout到原chunked.draw，全部512×512 opaque RGBA同独立Node合成；读全35SQL/catalog/databaseSize不变 |
| actual late/权限 | 局部撤销拦三异步缓存加载/不新GET；**同epoch**实际permanentfence在原Stage.read返回后拒409/count1、freshgraph不安装；随后实际password handler撤旧cookie401，不改旧Jobepoch/清fence/取消provider |

native固定源两个产物由Node另GET保存owned atlas-r1.png/layout-r1.bin，独立`server/pngio.js#decodePNG`和layout按图块逐像素生成512×512参考，不用旧截图/近似/抽样。这里只证256×256当季atlas与区域512×512，**不是整图四季/所有透明图/全部435资源或新Scenario规则认证**。actualsaved1/current2不跟latest。browser从owned13 allowlisted同源ESM mirror导入当前模块，不增加产品Root模块route；真实cookie来自owned账户，新Chromium/无真实用户profile或存档，IDB调用/外部网络/意外page-console错误均0。fixture原权限/返回issued object和native41/400验证不替换，SQL只读指纹不表示R2原子或provider排空。

native-r1只跑一次即通过，9报告sourceSHA/24执行前WX；新模型4报告sourceSHA/5WX，默认harness5WX，retry9WX。产品在这些验证后未漂移。setup中一次inlineNode backslash语法错误发生在任何I/O/producer前，**没有同期执行前source capture/fullstderr档**；setup-failure-postnote.json明确后写/细因UNKNOWN，仅owned mirror.mjs改稳健分隔，不能冒native/model失败或成功。没有为了测试改变权限、业务期待或1800s预算。

## 字节保护、审阅与收口

owned `.dragon-analysis/editor-phase/world-resource-ports-session-r1/` 的before核prior604e/525inputs122imports375player所有input-source-import-history-failure-document/execution SHA，3loader/3MD编辑前WX归档；source-deltas.json以6/6/7行hunks完整正逆复原，另独立核原road installGraph+整个query/search尾段和pathfinder identity/query/search尾段逐byte不变。原导航机制是否已确认依[原证入口](re-notes-march-pathfinding.md)，本批只改I/O，不凭当前代码/模型增公式。

新工具进入声明inventory；其余522旧输入保+当前3loader+newtool=526。imports从旧122及新共同world根重新遍历为**128**，不猜graph尺寸。独立static-r1通过526/128/372保持+3授权loader、13新语法、628本地链接、73唯一Q、35actual NodeDDL/PRAGMA.table_xinfo243列/70对象、gitdiffcheck；所有执行捕获/13mirror/真实产物长度-SHA/全pixel/算法差分/旧默认两harness另核，文档后static-r2重签封存。

主动LSP四产品/新tool zero returned diagnostics，rawclean1/inconclusive3且prior disposition过滤1，位置未猜、不据此称clean；九auxiliary inconclusive9，四MD unavailable（marksman/typos ready0/2）。sessionall458文件28warning/35hint-info，27为原继承，另`roadgraph.js:22 adjacency`赋值未使用是真正**原稿20/91行与现22/93行逐byte等值**的既有问题，本轮仅session-defer，不写ignore/禁rule/清cache或修改原算法。声明图/测试通过不清除该原始finding，也不是workspace clean证书。

适用Jev人工最小英文3951B已审preview，固定jev-1.13.0/advisoryOnly，经双层白OSenv+仅必要key发送，3执行前WX源码；无资源/源码/用户ID/秘密/完整日志，非规则/像素/SQL/权限/完成oracle。未commit/push/deploy/cloud/installtrust/更改共享运行态或删任何共享证据。

## 未完成边界

这是首个**实际共同loader**私有资源端口，而非新孤立解码器；但真实玩家App未装私有世界、未装RuntimeManifest/profileCertificate/chapter身份-slotMap、其它renderer直接Image/Music/cache模式未接，Mini/四季/完整435资源、authenticatedTrial所有网络/状态入口、发布-上架-registry公告、allhistoryref/body-providerCPUlegacy-drain/physicaldelete410-cacheactualbackuprestore、完整工作台与实体/空章/255/G127原证/73Q仍open。不会因cachedready/byteSHA/端口/本批像素通过授运行或关闭总goal。
