# 系统基础地图：本地交付核对

## 1. 核对目标与边界

目标是完成实施清单B0–B7：可追溯的Web可拆地图元素、独立持久模板、一次初始化后管理员维护、普通新建/完整复制共用单快照初始化、游戏级共用地图工作台，以及真实编辑保存、审批和同一玩家加载器消费。不是部署、真实数据迁移或地图扩容。

详细产品/数据合同只维护在[设计](system-base-map-design.md)，原图盘点在[盘点](system-base-map-inventory.md)。本页是需求到产物/验证的核对索引，不代替原始机制证据或测试本身。

## 2. 42项逐项对应

编号按[实施清单](system-base-map-tasks.md)各阶段条目顺序。

| 项目 | 实际产物与可复核证据 |
| --- | --- |
| B0.1 源覆盖 | `audit_system_base_map.mjs`严格登记源读取；98,304格单一物理归属、256原子定义、192据点、254道路，r8/r9隔离产物仍在 |
| B0.2 分类/粒度 | `system_base_map_pieces.mjs`；69,786非水格→5,506可拆片、4,081组、2,101复用定义；pieces测试逐格/四连通/256格上限 |
| B0.3 据点权威 | 设计§2/§7.3；模板cities独立物化，placement引用主表；instantiation测试槽绑定/局部ID与章节投影 |
| B0.4 证据分级 | 盘点§2–5；图样分类明确为Web决定，unknown保留，不开放任意拓扑/移城，不新增原版公式 |
| B0.5 可视样本/歧义 | 盘点§4.1–4.3及r4/r6/r8图样；192检查窗、窗外4格、墙/山/田/地面样本；用户选择A解决Web编辑粒度，不冒称DOS对象 |
| B1.1 结构合同 | `systembasemap.js`严格root/content/profile、城市/定义/引用/资源与共同编译校验；conversion负控 |
| B1.2 来源/摘要 | `systembasemapstore.js`当前version/digest/template，`mapOrigin`独立于历史sourceRef；store/instantiation摘要负控 |
| B1.3 独立物化 | `instantiateSystemBaseMap`深复制可变数据、共享不可变资源描述、保持局部ID与原槽；嵌套引用/T1T2测试 |
| B1.4 诊断 | 设计§7.8；本地unknown格定位、服务有界问题、配方/结构/章节负控与不确定写结果锁定；会话/画布测试 |
| B1.5 历史门 | `AdminFullCopy`先保留历史capture/verify，再实例化模板；旧profile默认1024定义门不变，转换配方预算仅工作区内部传入 |
| B2.1 转换入口 | `convert_system_base_map.mjs`登记修订＋新输出目录；重复目录/错误输入拒绝；不写系统库或原件 |
| B2.2 映射/unknown | template/mapping/receipt；sourceMembers、coveringInstanceId更新；conversion输入不变及JSON往返 |
| B2.3 规则保真 | conversion全编译输出深等、真实20章坐标/邻接检查；terrain/roadGraph/roadCost/roadOffset摘要，非视觉猜测 |
| B2.4 实际编辑 | conversion的picker/split/translate/reorder/remove/明确补底/capture/place与编辑后JSON重编；HTTP修改实际副本 |
| B2.5 小地图 | minimap测试两尺寸像素一致、确定性纹理、道路像素保留；浏览器Canvas水域开关/撤销/保存重读 |
| B3.1 系统归属 | `systembasemapdeclarations.js`及deletiondefinitions/deletionschema/deletioninventory；57表/54索引精确校验，系统表无game外键、不进游戏purge集合 |
| B3.2 管理服务 | EditorApp的admin/base-map读/初始化/save/atlas；真实gateway鉴权、CSRF、Origin及catalog字节门；game-purge回归 |
| B3.3 生效替换 | store先完整validate再单事务；故障回滚、无效保存留旧版；创建首await前捕获完整单快照 |
| B3.4 不重复转换 | initialize已有值直接返回；重开、重复初始化、迟到初始化不覆盖编辑，store/真实HTTP测试 |
| B3.5 拒绝/隔离 | store管理员/改密/撤权；HTTP作者拒绝、两入口缺模板零游戏/零copy；purge后模板全文与摘要不变 |
| B4.1 入口 | client管理员组“基礎地圖”；Workbench admin门；不参与当前游戏筛选，作者展示/服务权限分别验证 |
| B4.2 新布局 | `BaseMapPanel.vue`画布/四层/属性/素材与组合/水域/诊断分页/小地图/保存撤销重读；不是旧MapPanel |
| B4.3 共用核心 | `mapcanvas.js`/mapatlas/mapcommands，原生Canvas与Element Plus默认组件；源/bitmap不进Vue，拓扑只读边界明示 |
| B4.4 状态闭合 | basemap控制器dirty/表单/代际清理/迟到结果/422/未知提交/保存重读；17个会话/画布/图集用例；真实无根version DTO回归 |
| B4.5 浏览器 | 真实资源夹具测片段/组合命中、锁定显隐、拆分/unknown定位补底撤销及宽窄；真实HTTPS测模板/游戏保存重读 |
| B5.1 唯一初始化 | AdminFullCopy两profile注入同一captureBaseMap/instantiateSystemBaseMap，禁止缺模板回退 |
| B5.2 单快照/人物分离 | 实例化只替换地图相关字段，完整复制保留20章/466人物，普通新建允许空库；实际两种浏览器创建地图等价 |
| B5.3 原子/重试 | HTTPS两入口缺模板无可见游戏/copy；T2后已提交重试返回原收据、不重建；author-create/copy-abandon既有适用回归 |
| B5.4 章节兼容 | instantiation对错误raw坐标拒绝，真实20章共同编译；固定槽/首都/所属信息不由旧地图覆盖 |
| B5.5 T1/T2隔离 | instantiation/HTTPS T1→A/B、T2→C，旧游戏不变、改A不影响B/模板；浏览器再次核当前模板创建 |
| B5.6 旧数据策略 | 设计§7.3/§7.6；不迁移旧copy/publish/formal、不改内置；旧copy无mapEditorAssets则明确拒绝图集，不能猜描述符 |
| B6.1 游戏工作台 | `createGameMapWorkbench`＋共用BaseMapPanel；gameId作用域、作者copy API/受权atlas；旧页面不挂载 |
| B6.2 同一游戏模型 | 私有会话直接取同一copy，城市主表/章节不另建地图；上下文与真实浏览器切换/dirty拒绝测试 |
| B6.3 保存与票 | POST copy map增量命令、保存重读；HTTPS实际删片补底后旧票409、重新检验通过；模板严格保存与copy草稿问题分离 |
| B6.4 旧依赖清理 | 设计§7.9逐项列消费者；删除旧启动/DTO/画布/dirty桥，保留ChapterRoles实际共享状态与直接协议测试兼容埠，不扩大成整个draft退役 |
| B6.5 同加载器 | HTTPS审批的真实SQL包→loadPlayerPack→createPlayerEnvironment→prepareScenario；全terrain等于编辑结果且不同原图，v2道路/192据点/正式身份一致 |
| B7.1 分级回归 | 本页§3列明确串行lane；地图/编译/章节槽/装配/正式身份/mock保存/结构/purge覆盖；未改共享RNG或战斗公式 |
| B7.2 负控 | store回滚/权限/摘要；conversion引用/配方/越界/unknown；instantiation缺模板/章坐标；HTTPS旧票/创建失败/跨游戏隔离 |
| B7.3 浏览器门 | 两个全新context入口：真实资源内存API与实际HTTPS无拦截；两创建/保存/窄屏/错误检查，范围分开见§4 |
| B7.4 工程检查 | 48变更JS/MJS及client/shell语法；build→check、31SFC独立Vue LS、trialweb242文件；50路径主动LSP＋mode=all，未确认如实记录 |
| B7.5 回流 | 设计为详细合同、盘点为元素证据、任务/本审计为验收索引、journal为批次；撤销旧“未接地图/未闭合B0/玩家revision无需改”现态；没有新原机制结论需另写SKILL |
| B7.6 出口审计 | 本表逐项对应产物/断言而非仅依赖总通过数；B0–B6出口均有原数据/实现/隔离运行证据；明确保留§4限制 |

## 3. 最终复验收据

最终串行日志在本机忽略目录 `.dragon-analysis/system-base-map-final-uqJeiD/`，不提交运行数据：

- 五个`verify_system_base_map_{pieces,conversion,instantiation,store,minimap}.mjs`入口分别执行通过（这是入口名称摘要，不是通配执行命令）。
- `verify_copy_map_ops.mjs`＋`verify_copy_validate_gate.mjs`＋`verify_copy_single_slot.mjs`串行9项通过；schema sources、game purge19组、distribution schema `--rows`19组通过。
- player pack61、client50、environment37、chapters42、runtime contract104、mock player saves36、reader77通过。
- authoring context＋definition controller94项、chapter people13组通过。首跑15失败为未改动的旧夹具合同不符；按现行DTO/发布行为修正后通过，没有修改服务门。
- editor17项通过；build/check：JS978168字节、CSS122370字节、13包许可；trialweb242文件，摘要`29e41cc948a0a172bc1767a06abeffd3f736adae7350f86a9d5301534375bef6`，复建unchanged。
- 独立Vue LS31SFC通过，变更SFC零诊断，ChaptersPanel仍有既有TS6133提示。宿主主动LSP50路径：0发现、11clean、39push-only未确认；mode=all仍有client pending与两个SFC ast-grep deferred。**不是全仓LSP clean**；client/shell另验模块语法，SFC另有实际独立LS证据。
- 浏览器：`verify_system_base_map_browser.mjs`真实资源夹具通过；`EDITOR_TEST_PORT=19837 ... node tools/verify_copy_http_roundtrip.mjs --browser`实际HTTPS完整回放438.7秒通过。源码/壳在此后未发生产品变更，最终build/check确认同一壳字节；详情在journal§71。

## 4. 不扩大验证结论

- 未提交、推送、部署或读写真实SAVE/用户profile；没有把本地结果说成生产已安装。
- 不扩容、不开放任意道路拓扑/运行槽/移城；unknown必须明确补底；跨层组合不授予拓扑整体移动权限。Web片段不是DOS自然对象复原。
- 旧copy无图集描述时不能使用新画布；保留数据且明确报错，不执行未经授权的真实数据迁移。旧draft协议源码留给明确的共享/兼容消费者，不恢复旧地图页面或Trial产品。
- 同一玩家加载器确实消费实际审批包，但session/static读取为隔离端口；不声称公共分发桶、网络reader admission、完整App战役或生产TLS部署通过。
- 实际HTTPS浏览器仅将默认favicon.ico的精确404单列排除；业务console/pageerror/requestfailed为空。夹具浏览器不替代服务权限证明，权限另由真实gateway/SQLite负控覆盖。
