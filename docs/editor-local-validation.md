# 本地编辑器验证清单

## E-03-COMPONENT-TOOLS-1（本轮新增，先登记后执行）

用户“继续未完成的任务”后，实施当前profile的素材／组合编辑与明确补底；不接互联网账户、发布或扩容。

- `node tools/verify_editor_component_tools.mjs`：只用内存显式Web作者夹具，共同composer、组件操作模块；不读文件/网络/DOS/profile。多格擷取/整体命中/越界原子拒绝、组创建/拆分继承/合并明确flag、补底不回滚其它格、未使用坏定义拒收、JSON源往返；不作原规则golden。
- `node tools/verify_editor_component_browser.mjs <round>`：只读当前内置39角色/manifest和switch、相关ES Modules/HTML；写新的`.dragon-analysis/editor-phase/<round>`和OS自有mkdtemp存储。仅自有loopback server、新Playwright browser context；拒外网/DOS SAVE/profile/正式IDB。测试实际框选／擷取／拖放／完整多格命中、组合创建／拆分／合并及显式补底、保存重开／两PNG／20章同引擎JSON恢复、错误定义与陈旧保存拒绝，前后当前39资源不变；截图不作新美术验收。
- `node tools/run_map_migration_verification.mjs <round>`的显式库存加入上述两门及componenttools源码，原45门保持，形成47门串行／84源快照；入口、依赖和I/O沿上述及历史已审白名单，不跑通配。共享规则/存档/RNG未改，不将历史45收据冒充新轮全量。原5退休skip仍列skip，不计通过。

服务保存可同修订传map与追加定义；既有定义不得覆盖，未使用定义所有变体也经共同composer检查。显示／组操作不改native；实际放置／补底允许作者明确更改byte，但严格编译profile门不放宽。详见[共同合同§2.2.3](game-editor-technical-design.md)。

## E-02/03-CURRENT-WORKSPACE-1（上一轮证据）

用户本轮“好，继续”授权先补固定域当前源复制、组合开关及真实预览，不扩到账户/发布/任意拓扑。新增入口 `node tools/verify_editor_unified_workspace.mjs <round>`：只读当前`builtinresources.generated.js`及其固定编译目录38角色＋manifest、有关ES Modules；Node/browser仅自有loopback服务和OS mkdtemp草稿/构建；browser为已有Playwright的全新context，不访问真实SAVE/profile/IDB。对当前完整复制、20章装配、两PNG字节、组合开关原生4产物不变、保存重开、脏预览与编译修订、错成员/坏PNG拒收及实际浏览器错误/请求进行验证。测试只在自有存储故障注入，保存当前39资产/SHA，禁止覆盖来源/已封存输出。

服务默认来源改为`editor_builtin_source.mjs`读取当前不可变描述符；38角色逐项hash/长度/URI、sourceDigest、20章/native四产物核对后才复制，携带兼容辅助字节与只读图集引用，无ignored旧源回退。新工作台`/studio → /editor-studio.html`及`src/editor/studio.js`使用共同composer/minimap像素；工作区显隐只影响大图预览。编译仍共享0.6，私有I/O格式另标`studio-unified-1`，放在旧0.6目录子目录，保留旧产物；四原生资产＋两张PNG分别检查。当前原子源约43MiB，局部请求上限64MiB并按UTF8字节计数，越限停止积累；这不是完整互联网配额或可靠事务认证。

本批可在UI选择已持久化的实际组合、定位和切换`showOnMinimap`，不宣称素材库/组合拆分或完整App试运行。删除暴露unknown仍阻断编译；原路径重建只有用户明确确认后恢复其原图块组件，不猜补下层。不按回归旧夹具对尚未闭合初始化补值。历史同引擎层测试转为已经原子化的当前副本；原子修改操作而非改被覆盖底层。其它历史工具如实调整夹具或说明支持域，不能拼接旧成绩。

## 历史 E-03-ROAD-LOOP（下文是当时的入口与成绩域）

本页维护本批测试 inventory、I/O 白名单及工程范围；执行成绩记入 [journal](checkpoint-journal.md)，不是原规则 oracle 或正式发布准入。2026-10-01，基于 `6d89b01` 的本地后续切片，未授权 commit/push。

## 入口与依赖

串行执行以下显式入口，不执行 `verify_*` 通配。均使用当前 `editor_server.mjs`、`trialcompile.js`、`trialruntime.js`；共享装配仍走 `createWorldResources → prepareScenario`，移动走既有 `performOriginalRoadAction`，不改共享调度、RNG 或保存规则。

| 入口 | 覆盖 |
| --- | --- |
| `node tools/editor_server.mjs` | 本地复制、保存、编译、章节包、结构/路径拒绝 |
| `node tools/verify_editor_copy_drift.mjs`（新增，只读原证） | 五组20章3840条城记录，与Web具名现属／完整raw逐条核对，输出每章现属≠旧属的原始偏移 |
| `node tools/verify_editor_road_loop.mjs`（新增） | 无编辑 v2 全等／placement调序不换槽；副本改点真实移动；未重建章节缓存的改拓扑拒收；晚到道路请求跨新草稿/编译不串资源；断裂/失效 binding/坏摘要/损坏产物拒绝；来源 hash 不变 |
| `node tools/verify_editor_trial_loop.mjs` | 编译快照地形实际加载，192城×10轮 |
| `node tools/verify_road_edit.mjs` | 原254边重编码及受限生成器正负控 |
| `node tools/verify_editor_trial_browser.mjs` | 新 profile 试运行、10天、无 IDB 调用、四资产准确修订URL且无内置terrain/road fallback |
| `node tools/verify_editor_studio_road_browser.mjs` | 工作台实际点击删除/重建路，保存/编译 |

新增测试在此登记后才执行。涉及两份浏览器测试的真实 SAVE 文件时间读取已移除；没有任何真实档案读取/写入/元数据探针。

## I/O 白名单

- 服务只读输入：`web/data.json`、`web/content/builtin/catalog.json`、`web/content/builtin/world/world.json`、`web/road_offset.json`、`.dragon-analysis/map-migration/unified-a/unified_mapsource.json`（既有统一源）。该 gitignored 输入尚不是可移植生产素材交付。
- 漂移原证入口额外只读固定五个非存档文件：`../上/SINARIO.DAT`、`../中/SINARIO.DAT`、`../下/SINARIO.DAT`、`../后/SINARIO.DAT`、`../原版/SINARIO.DAT`，不扫描目录、不执行原版、不调用会改生成物的main。
- 测试额外只读：`web/road_graph.json`、`web/content/builtin/world/roads.json`、`web/mmap_map.bin`；其余为上述入口的 ES Modules imports（包含 `tools/native_faction_fixture.mjs` 的纯内存夹具与共享引擎依赖）。不加载 DOS SAVE 或用户 profile。
- 每个服务监听 `127.0.0.1` 自动分配端口，只写本次 `mkdtemp` 独立目录；可创建草稿、编译快照和故障注入产物。不覆盖默认 store、封存报告、Web资产或来源。
- 浏览器为已有 Playwright Chromium 的 `launch + newContext`，不传用户数据目录；只请求自有编辑服务的白名单资产与 `/src` 模块。结束只关闭自有 browser/server。
- Node 装配 fetch 只允许 manifest 四个固定修订资源 URL；不转发内置/其它来源。晚到请求保留原修订。

## 编译/运行工程合同

`build/<draftRevision>/editor-local-0.2/` 保存 `snapshot.json`、`terrain.bin`、`roads.json`、`road_cost.bin`、`road_offset.json`、最后写出的 `manifest.json`。完整 GameSource 的规范摘要包含章节与组件定义；清单每资产核字节长度/sha256。重复编译同修订仅返回已核清单，不原地覆盖；重复复制到同身份拒绝。序号用 BigInt，不用浮点。

城市按固定 `runtimeSlot` 编号，不能按 placement 数组排序改槽；移动城市或章城市/节点分歧明确拒绝。携带章节的副本逐城核对原raw紧凑邻居与编译道路端点集合，不一致则阻断（新拓扑章节缓存初始化尚未接线），不暗修C1C..1F；无章最小副本可编译地图，但不能试运行。道路由既有生成器复核 port、连续性、占用/交叉、slot、flags、成本和 bbox；旧 binding 不符阻断，不替作者暗修。v2 再经过生产 codec 验证。域仍为384×256、192城与低32KiB空间；格式/几何成立不代表任意拓扑或完整战役获证。

原生道路是唯一 native 搜索/移动输入；`road_cost.bin` 仅为编译几何/节点的旧格网占用掩码，不是原生边权公式；`road_offset.json` 为编译时固定的受信 tile-质心表现表，非规则输入。土地/水路选择不被它们改写。试运行不再加载旧地形或旧 road_graph 来填空。

Trial 页服务响应时即捕获准确已编译修订，后续包和资源只从快照读取；可显式指定 `revision` 重开历史本地快照，不代表正式历史版本开局权限。清单身份包含 game/revision/digest/trialSnapshotId；世界/内容身份由该快照派生。资源失败不降级内置，旧请求不会改新世界。fresh 以编译地形资产进入生产89F0开局着色，不用显式测试平面绕开它。

当前仍为无 App/标题/完整渲染的内存 harness，不宣称 E-05 完整隔离：无认证、断网状态机、可靠存储事务或正式发布。工作台装饰尚不参与规则合成；完整素材/任意新图/空白章/扩容仍未放行。
