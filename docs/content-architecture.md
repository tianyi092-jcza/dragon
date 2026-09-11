# Web 内容与世界资源边界（重构基础批次 B0–B4a）

这是 **Web 架构/内容格式约定，不是新的原版机制结论**。原始字段证据见[数据技能](../../.agents/skills/re-data-formats/SKILL.md)与其引用的逆向笔记。后续编辑器、Loading/过场动画、多语言和扩容尚未实现。

## 1. 一套内核与四种数据

```text
原版非存档资源 ──显式离线导入──> Web可编辑内容源
                                   │ 校验/编译
                                   ▼
                              Web运行资产
                                   │ createNewGameScenario复制
                                   ▼
                              Scenario运行态
                                   │ 保存守卫/snapshotState
                                   ▼
                         IndexedDB四槽快照（原行为）
```

- 同一规则/AI/UI内核运行内容，不建立“原版玩法/扩展玩法”两套引擎。
- 游戏运行只需要完整`web/`；不读取DOS文件，不需要生成器、Python依赖或原版目录。
- 内容模板不承担运行队列、RNG或浏览器存档职责。当前仍保留旧`scenario_idx`；目录身份没有触发用户IndexedDB迁移或槽号改写。
- 本批是迁移边界，不是完整编辑器SDK。不得据此宣称任意地图尺寸、武将/据点数量、多包热切换或所有资产已全部参数化。

## 2. 可编辑源与工具

源根为`web/content/builtin/`，约5MB，与当前已编译资产一起随Web交付。

| 文件 | 内容与权威 |
| --- | --- |
| `catalog.json` | `schemaVersion/id/revision/rules`；章节稳定ID、文件路径、旧索引、官方章节标记 |
| `chapters/*.json` | 章节起始状态：名称/年代、人物属性、势力、外交、据点初值、固定事件/天气初态等 |
| `world/world.json` | 世界ID、网格/图块尺寸、据点稳定ID与位置、资源入口；据点坐标只有这一份编辑源 |
| `world/tileset.json` | 256图块稳定ID与现行索引、atlas裁剪、尺寸/锚点/不透明标记、四季调色板 |
| `world/atlas.png` | `256×256`索引色图集；每块`16×16`，保留原像素索引，不是一块一个PNG |
| `world/layout.json` | 行优先`256×384`图块索引排列；索引在当前规则配置下不可随意重编号 |
| `world/roads.json` | 有序节点、边、边内点；与视觉布局分开，不靠贴一张道路图片自动产生通行性 |
| `world/road-cost.bin`、`road-offset.json` | 现有格网回退与表现偏移的兼容资源，不以此替代权威道路图 |
| `provenance.json` | 首次导入输入哈希，仅作来源追踪，不是机制证明或运行依赖 |

### 章节兼容区不是编辑权威

- 章节的`state`中不含城/势力`raw`。已知数值、名称、人物、四邻`connections`等直接作为命名字段编辑；世界坐标由世界定义注入。
- `initial_flags`仅保留原城记录高四位；低四位由有序四邻连接生成。未知位不猜语义、不自行提供玩法选项。
- `compatibility.cities/factions`保留完整原记录，用于尚未建模的字节和原版线性别名。编译器覆盖已建模数值/邻接；修改资金、生产力、城类型、位置等不必同步手改hex。
- `active/is_monarch`、势力君主显示名、`money_hi/n_factions`等由命名字段生成；不保留第二个可编辑副本。
- 兼容记录中旧Big5姓名等未消费字节仍是导入档案。编译器**不是DOS序列化器**，也不是SAVE导出器；不声称所有原始字节都已语义化。未知区不得擅自删除/重新分配。
- 人物/势力的`idx`仍是固定槽身份；不能靠排序数组重编号。稳定内容包/章ID与旧运行槽分开，更多实体ID适配留待后续，不虚构已完成。

### 命令与依赖

游戏无需构建。下列工具只在编辑/重新生成内容时使用，依赖开发机Python与Pillow；不进入JS产品运行时。

```bash
# 从Web源编译到新目录做比较；不会访问原版目录
python -B tools/compile_content.py --output /path/to/generated
python -B tools/verify_content_pipeline.py

# 确认源变更后，显式更新运行资产
python -B tools/compile_content.py --output web

# 仅重建四季地图；也从Web源读取
python -B tools/render_map.py

# 仅在需要重新导入原版非存档资料时使用；拒绝覆盖既有内容源目录
python -B tools/import_builtin_content.py --output /path/to/new-source
```

- 导入器读取五份`SINARIO.DAT`、`MMAP.MDL/GAMEPAL.BRG`及已认证Web布局/道路资产；不读取SAVE。首次导入校验20章与当前运行资产无损一致。
- `parse_sinario.py`保留旧离线提取命令和解析API，**不是日常内容编辑后的编译入口**。原始证据纠错应修提取链、导入到新目录、审查源差异后再编译；不能用旧提取命令覆盖编辑源变更。
- `render_map.load_tiles/load_palette`保留给离线导入和证据工具；`render_map.main`不再通过它们读取DOS。
- `compile_content`先在临时目录完成校验与渲染，再发布运行资产；无效源不先覆盖`data.json`。文件系统发布阶段不是跨文件事务，写入权限/磁盘失败仍须重新生成核对。
- 当前校验覆盖版本/目录身份、路径不得逃出源根、现行槽序/容量、地图尺寸、节点与据点坐标一致、道路边界图块分类、图集与调色板等。不是任意第三方内容的完整安全沙箱，也未自动重算所有旧格网回退资料。

## 3. 运行模块职责

| 模块 | 职责 |
| --- | --- |
| `src/app/startflow.js` | 通过选择回调驱动开局循环，不绘制/加载；StartMenu保留窗口布局、排序映射与finally清理 |
| `src/content/catalog.js` | 加载目录/运行模板；`packId/chapterId/revision`查询及旧索引映射，不修改存档 |
| `src/content/worlddefinition.js` | 当前世界资源URL/尺寸及明确的原版布局常量；不是“所有常量都换length” |
| `src/game/worldresources.js` | 工厂创建每世界独立道路/地形缓存；App装配默认实例 |
| `src/game/navigation/roadgraph.js` | 原道路算法与该实例索引/加载缓存，保持搜索顺序与地址换算 |
| `src/game/navigation/pathfinder.js` | 原格网回退算法与该实例地形/成本/偏移缓存 |
| `src/game/roadgraph.js`、`pathfind.js` | 旧API门面，统一指向默认世界，便于渐进迁移调用方 |
| `src/game/playerqueries.js` | 两个纯玩家身份查询，解除commands↔diplomacy循环 |
| `src/game/legacyrecords.js` | 原记录字节兼容读取；保留原初始/运行字段选择，不悄悄修机制 |
| `src/game/world.js` | 运行态Scenario/模板复制，不拥有资源加载状态 |

- `main.startApp`只加载目录、章模板和本地槽位；确认新局/读档后才请求地图、道路与战斗资源。
- 标题排序由目录`official`决定；既有无目录调用保留旧20章排序适配。原版4章置顶和所有旧索引不变。
- 预览可以创建独立`createWorldResources`，不能向默认实例安装另一张图。**现有AI/渲染仍通过旧门面使用默认世界**；活跃游戏任意世界切换还没有完成接线。
- 当前限制仍是384×256网格、16px图块、192道路节点、128军团槽、24势力槽，且保留节点/边/点地址布局、固定关卡坐标与图块语义。扩大容量需要完整审计哨兵/计数/地址/调度/导航/战场映射，不是改一个配置项。
- 四季`map_tiles_*.png`仍是6144×4096整图缓存。图集源可供未来组件面板使用；分类、多图块模板、放置/撤销/自动拼接、地形语义编辑和缓存局部更新尚未实现。

## 4. 独立部署与验证

```bash
# 任意普通静态HTTP服务；复制整个web目录即可
python -m http.server 8321 --directory web
# 或仓库提供的同等静态服务
python tools/webserver.py 8321

node tools/verify_content_catalog.mjs
node tools/verify_world_resources.mjs
node tools/verify_standalone_web_browser.mjs
```

- `verify_content_pipeline.py`用Python审计钩子拒绝原版目录/任意SAVE文件访问，从隔离内容副本编译，比较20章、道路、布局与四季逐像素一致性，并测命名字段编辑和坏源不覆盖输出。
- `verify_world_resources.mjs`证明两个世界的道路/地形/偏移缓存互不污染，默认世界不被预览安装；不证明尚未实施的多世界游戏切换。
- `verify_standalone_web_browser.mjs`复制整个Web目录至临时根，仅允许同源静态请求，在全新profile真实点击开局并验证浏览器单实例接管。它不暴露原版目录，不复用用户存档。
- 保存仍在浏览器同源IndexedDB；复制Web文件不会复制浏览器存档。不同端口/域名是不同存储源；本地存储不是永久备份。

## 5. 批次界限

B0–B4a已落地公共查询、内容身份/原生源管线、图集地图源、世界资源实例基础和无绘制开局流程。当前未动正式四槽结构、原规则/RNG/消息返回边界，也没有引入动画库。

后续已讨论但尚未完成：场景生命周期继续拆分、存储仓储边界、GameBar/HUD按工作流拆分、AI按城市/军团/事件/战后/调度拆分、BattleView驱动与绘制分离。`OriginalBattleSession`不按行数硬拆。批次实测与原有用户改动保留情况只记[日志](checkpoint-journal.md)。
