# AGENTS.md — 臥龍傳 Web 项目记忆

> 只维护长期事实、架构、命令、约定和当前主线。先读[全局约定](../AGENTS.md)；进展、失败、验证和阻塞见 [journal](docs/checkpoint-journal.md)，版本沿革见 [CHANGELOG](CHANGELOG.md)。文档、代码和测试不能替代原证或用户授权。

## 1. 项目边界与当前主线

- 以原生 JavaScript ES Modules＋Canvas 2D 重写1995 DOS《臥龍傳》。玩家、共同编辑/编译核心及保留的Trial引擎无框架、构建及npm运行时依赖，`web/`可直接静态服务。
- 编辑器展示层限定`editor-ui/`，使用Vue 3＋Element Plus＋Vite，版本以package/lock为准；预构建壳由同源服务提供。Vue只接显示DTO/动作回调，不接凭据、源对象或live游戏状态，不替代服务端权限。
- 仓库`E:/Dragon/web-port`，原程序`E:/Dragon/Dragon/`，官方基准`E:/Dragon/原版/`，改版库`上/中/下/后/`。禁止自动化访问真实`SAVE.DAT`、用户存档/profile；测试用内存、mock、隔离目录及新profile。
- 软件版本以`VERSION`为准，规则基线`web-0.1.1`；游戏版本`1.n`、软件版本、内容摘要和程序归档身份相互独立。
- **当前主线：游戏级共享数据＋copy单套/publish单槽/formal单快照。** 元数据、章节、据点、武将库、审核、地图、新城和独立管理员删除管理已接线；193城发布装配链本地通过。定义面板余项、旧draft退役及表清理见[收敛任务](docs/copy-simplification-tasks.md)。`/api/trial/*`为`410 TRIAL_RETIRED`，保留引擎不等于重开接口。
- **战略事件（Web产品决定，非原版机制）**：`strategicEventSchedule`以`epoch*64+slot`定位，四字节轮作投影／原窗对照；`inserted`仅原窗真值，`accepted`才是Web已接受。每位置只推进一次，消息返回后才派下一条，整批后tick势力一次。移页、7/10分频、查询及保存合同见[D2计划§12](docs/d2-event-scheduler-plan.md)；恢复一次性校验，非空旧D2-C旁表拒绝，不猜到期时间。
- **地图工作台（Web产品决定）**：独立系统模板＋共用Canvas＋精炼目录已本地实现。两种创建取模板单快照，既有游戏不跟随更新；固定384×256、live 1..512城，行序定槽，192为导入基线，不复原DOS对象。缺`mapEditorAssets`的旧copy拒绝，不自动迁移。合同：[基础地图](docs/system-base-map-design.md)、[精炼目录](docs/map-workspace-sprite-library-design.md)及[验收边界](docs/map-workspace-sprite-library-audit.md)；本地通过不等于部署。
- **据点扩容（Web产品决定）**：固定384×256，运行／道路／财政／存档支持v2-192与v3-512；内置与生产准入仍192，据点组素材可作为装饰拖放但不自动建城。新城admit必填`battleMapId`（`ki-1995:siege:0..191`共享战场，写定义＋全章行）。须贯通稳定身份、道路、章节、运行、战场和保存，不只放宽计数门或另建引擎。人物／地图等其它容量、Web差异与验收见[CITY计划](docs/city-capacity-expansion-plan.md)；不自动授权部署／迁移。
- 生产为`sadcloud`单VPS（`ssh sadcloud`，`/srv/dragon`）：编辑器/玩家分服务，SQLite＋私有文件桶＋磁盘分发桶，nginx/Let's Encrypt；域名`dragon-editor.720108.xyz`/`dragon.720108.xyz`直连源站。Worker/R2/Tunnel、instabox为历史形态；操作前按[存储布局§18](docs/game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产)重新核部署身份。

## 2. 架构与数据归属

```text
原版非存档资料 → 导入/游戏源 → 校验编译 → Scenario → 保存守卫 → IndexedDB
系统基础地图 → 创建时独立物化 → copy → 全量检验/一次性票 → publish → 审核 → formal
```

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js`、`app/{startflow,battleflow}.js` | 新局/恢复、场景与战斗接续 |
| `web/src/content/`、`game/{world,worldresources}.js` | 内容身份、编译合同、每世界资源 |
| `web/src/game/navigation/`、`web/src/game/native*.js` | 原生道路/地形/占格/固定表，不以通用A*替代 |
| `web/src/game/{ai,legionphase,legionscheduler,strategicfailure}.js` | 逐槽调度、续段、失败暂停 |
| `web/src/game/{clock,tacticalclock}.js`、`battle/original*.js` | 战略/战术时序、Session、RNG、结算 |
| `web/src/game/savegame.js`、`core/{gamesavestore,saverepository}.js` | 完整快照、IDB事务/CAS、存档归属 |
| `web/src/render/`、`ui/`、`game/playerqueries.js` | 只读绘制、输入、消息FIFO与查询 |
| `web/src/player/` | 正式目录、准入、资源、存档；旧reader客户端仅再导出 |
| `web/src/editor/{mapcommands,componenttools,mapobjectmove,mappositionvalidation,mapeditlimits}.js` | 地图共同预演、对象写入、位置校验与请求预算 |
| `editor-ui/`、`server/public/*.txt` | Vue展示壳/原生业务控制器 |
| `server/{editorapp,gamecopy,systembasemap,systembasemapstore,mapworkspace}.js` | 鉴权、copy/模板、初始化、共同编辑与检验 |
| `vps/`、`reader/site.js` | Node SQLite/文件桶/发布装配；玩家服务复用reader |

### 游戏与保存

- 原版世界384×256格、16px图块、192据点、128军团槽、22正常势力、24×24外交矩阵，逻辑界面640×400；哨兵/别名/排除槽不能用数组长度泛化。扩容、任意拓扑及移城另过准入。
- fresh/restore使用v2原生道路与固定表，v1生产回退已退役。未知消费点fail-closed，保留已提交前缀、hold与禁存；不补未知RAM、不用`Math.random`兜底，不简化RNG消费、live/delayed身份或槽写序。
- 图集/显示布局/拓扑/规则地形分离，Scenario为规则地形权威；画路不等于通路，资源取世界定义。绘制不推进路线或消费RNG；解析纠错导入新目录，不手改生成物。地图unknown不得猜底。
- 正式存档仅同源IndexedDB `wolong-web/saves`，目录/正文同事务。游戏内读档先回标题，detached校验及资源ready后安装，await后重核scenario/world/clock/票据；战斗、未完续段、装配、故障期间禁存。须测真实JSON往返，不能只用structuredClone。
- 标题单一游戏选择器，远端失败不阻断内置；新局/标题读档后默认展开军师条、势力信息、小地图。玩家交互/hold遵[全局约定](../AGENTS.md)；机制按[行军](../.agents/skills/re-march-engagement/SKILL.md)、[战斗](../.agents/skills/re-battle-command/SKILL.md)、[战后](../.agents/skills/re-post-battle/SKILL.md)、[数据格式](../.agents/skills/re-data-formats/SKILL.md)加载，不在memory复制推导。表现与支持边界见[开场](docs/opening-scene.md)、[战略时序](docs/re-notes-strategic-time.md)、[表现](docs/presentation-modernization.md)、[行军](docs/march-presentation-fixes.md)、[战术生命周期](docs/re-notes-tactical-lifecycle.md)；`CITY-4064-WEB-1`不外推其它规则。

### 地图编辑与素材

- **素材／显示**：`mapspritecatalog.json`是版本化Web身份／配方，不是DOS对象表；保留256原子身份，默认240个16×16单格，隐藏16个动态所属配色变体，不能按像素合并身份。固定春季预览、四季共享布局；原七类＋四张可整组拖放的据点组外观，桥梁／水路并道路。32px素材预览不改占格，100%为16px原始格；匹配原子定义的可见卡均可作为装饰放置，未知图块不推定规则语义，不恢复旧库导航或自动拆旧对象。库内拖放预览保留占格边框，不画中心十字；据点组整组落为装饰，一次撤销，不建城、不接路。现行放置规则见[原子合同](docs/map-atomic-catalog-contract.md)。
- **地图交互（Web产品决定）**：未锁拖整图，锁图后拖已选可编辑对象；底图仅供建城选位，不弹对象菜单。锁图不限制据点绑定／解绑；该操作使用按钮局部反馈。解绑后优先选中原城作为候选，不自动绑回；只允许显式绑定未绑定的据点，无候选时禁绑。拖动实体50%透明且保持抓取点，取消不落源；顶层点选，Shift多选装饰／通用组可批删。新组合是单一实例，不新增成员组链；拆散包含解组和多格实例拆单格，历史组数据保留兼容但不显示归属。建城使用工具栏弹窗，关闭保输入；复制／填充／对象锁未开放。布局与动作细则见[§2.6](docs/map-atomic-catalog-contract.md#26-地图交互收尾选位背景与锁图对象操作)。
- **地图保存预算**：`mapeditlimits.js`统一4096条命令／16 MiB完整JSON；仅基础地图save与游戏copy POST提高运输限，其它路由仍16 KiB，权限／模块校验不变。一批一次预演／撤销、失败无前缀；新组合／拆分以地图格数为对象上限，普通素材capture仍256格。模板／copy源64 MiB限不变；不自动迁移真实数据。
- **道路／据点对象移动（Web产品决定）**：锁图后可拖已选对象；拖放问题仅以半透明红格提示，修正后消除，保存时才列对象ID、据点名称／ID、坐标、原因并拒绝保存。只改显式对象及对应章节坐标，不猜归属／重连道路／重排槽号；检查模式随未保存移动批次，既有copy分步建城不新增全局拒绝门。详细源：[移动与错误详情](docs/map-atomic-catalog-contract.md#map-position-feedback)。
- `mapcanvas.js`／`mapspriterecipes.js`私有持有源、图集及预览定义，Vue只接DTO／动作。已有定义须完整匹配才复用；新配方沿共同放置／捕获／移除命令物化，不向source偷插定义。组批先过完整预览与预算，一次安装／撤销，保存仍为受限扁平请求，重读后按完整配方复用。
- 四季共用一份布局；显示网格、幽灵和视口不写内容。[SEA-GROUND-1](docs/map-sea-ground-contract.md)显式全幅95海底，小地图仅地面轮廓＋道路／据点；四层合成／眼睛锁独立于素材分类，不设四层库导航。用户界面称底图，未放素材处自然露出，不需铺海。新模板直接启用，旧可编辑地图仅本地暂存启用、保存才写入，不自动迁移持久数据；无policy旧源仍保留下层地理／unknown语义。外观分类不授予河湖mask、道路连通或移城能力。详细合同及原证见上述设计和[准入说明](docs/re-notes-editor-map-admission.md)。

### 编辑器数据与发布

- 地图道路、据点、武将库及章节属于单款游戏自己的共享数据；`sourceRef.kind`/`copy_origins.profile_revision`是历史来源标签，`mapOrigin`记录模板快照，不是第二份live数据。copy与formal分离，发布不回写内置源。
- 据点主表拥有名称/坐标/最大生产力/类型/新章默认四值，缺省四值从第一章回填一次；章节仅覆盖所属、当前生产力、上升值、防灾值、城兵，内政官不在该设置。见[据点合同](docs/editor-city-definitions.md)、[章节合同](docs/chapter-and-base-resources.md)。
- 普通新建完整据点主表、武将可空；完整复制还初始化人物/章节槽关联。内置武将整库导入须确认，服务端准备后单事务替换、失败保留旧库，不扫目标章分批追加。章序/槽序固定，姓名trim＋NFC去重、首次同名整条胜出；稳定ID改名不变，主表投影关联槽，缺引用交发布门，不隐式免职。六能力0..15，`suicideOnCapture`只同步attr bit4，`zi`只存，详见[武将合同](docs/editor-general-definitions.md#copy内置武将转换与主表权威现行)。
- copy保存只拦模块约束，发布全量检查跨模块；摘要变动作废检验票，不恢复draft修订门。单写者无CAS不等于省略鉴权/epoch/Origin/删除栅栏。
- 提交须同摘要通过票、1–2000码点说明；票一次性、每游戏30分钟节流。同意原子分配ordinal、安装已准备包、更新pin/formal/`listed=1`，失败回滚不耗号；版本1.0→1.1…1.10不复用。名称归作者，同作者不可重名；管理员全局管理保留已提交未删除游戏，审核只允许submitted，编辑/校验不解锁审核。
- 内置游戏始终可用且不可编辑/下架/删除；作者编辑提交自己游戏，管理员审核/限制/删除而非替作者编辑。完整复制不含对局/存档，普通新建与完整复制不能混用。
- 新正式版使旧对局禁存、旧档不可加载；清旧与新保存同事务。网络失败/下架/损坏不得冒充更新，仅下架未更新的会话可继续。`410 GAME_DELETED`强制确认后清该游戏本机进度并回开局。
- 目录`control/directory.json`；共享程序`artifacts/programs/<digest>/`、游戏发布`artifacts/<gameId>/`、私有`private/<gameId>/`。删除先核权/栅栏→移除指针/清两前缀→事务复核/purge，失败保留管理行与栅栏供重试；不删installed或共享程序。磁盘桶ETag为带引号md5，mtime决定last-modified，reader须有size/contentType/ReadableStream。详见[存储合同](docs/game-storage-layout.md)。
- 共享`kao/`共621张128×128画像，文件名/ID数字0..620，255是普通资源，不开放上传；ID>255走portraitKey，不塞byte，不改DOS FF或旧冻结身份。见[画像合同](docs/re-notes-portrait-reader.md#现行web准入与原证边界)。

## 3. 展示、交互与文档职责

- 编辑器全部页面采用**Element Plus默认主题/组件/控件/size、繁体locale**，不重定义`--el-*`、不加皮肤或UI/图标依赖。仅展示层，玩家Canvas不套此规则；编辑器可常规保存/取消/关闭，不套游戏右键约定。决策背景见[journal§37](docs/checkpoint-journal.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)。
- 组件按路径引入，`main.js`同时引入对应`style/css`；ElOption/ElTableColumn由select/table导出。`theme.css`仅骨架/间距/宽度/滚动/内容布局，不覆盖控件高度/字阶/边框/圆角；不修改玩家`server/public/style.css`，挂载编辑器时移除该link。
- [布局规范](docs/editor-ui-layout-spec.md)为详细维护源：整页不滚、数据区滚、垂直居中、枚举名称（未知保留数字）、保存后重读；旧34px/原生table皮肤撤销。不得覆盖`[hidden]`；隐藏重型内容按需挂载但保留输入。保留id/data-*协议；空字符串选项用`empty-values=[null, undefined]`，多选用ElCheckboxGroup，回调接值不假定原生事件。
- 列表默认固定表头、25/50/100分页＋jumper，不滚动追加（地图素材库按上述专项例外）；复用ListPagination/ListRowActions/pagination。默认普通编辑/保存/取消按钮，不加primary/link/text或悬浮操作列。固定列紧凑、读编辑同宽，操作列min180吸收余宽，窄屏表内横滚。头像25/页、当前页懒图、数值排序、跳页/resize；copy目录`?usage=0`跳过旧draft统计，无查询旧接口保留inUse与SHA/权限门。
- 加载共用四圆点/默认Loading；请求计数覆盖正文消费，默认global，局部/进度显式分流且包括重读；图片/音频懒载不挡整页，真实批次才报进度。`run()`先解锁再渲染，异常不扩散。复制/检验用局部阻塞弹窗、不叠背景Loading；删除在当前弹窗报告真实阶段、无Loading，清理全成功才报完成。尺寸/失败入口详见布局规范§3。
- 编辑器/地图任务加载[产品设计](docs/game-editor-design.md)、[工程合同](docs/game-editor-technical-design.md)、[迁移计划](docs/game-map-migration-plan.md)、[准入原证](docs/re-notes-editor-map-admission.md)与相关SKILL；框架边界见[壳合同](docs/editor-framework-shell.md)。M0→M1→M2→M3须真实修改/编译/同加载器验证，方案不构成实施授权。

## 4. 重要工程坑点

- **build≠check≠服务刷新**：Vue变更先build再check，同步shell-ui.txt（URL `/shell-ui.js`）/css/licenses。`server/public/*.txt`被进程import且dev监听排除；只重启自己持有实例，用新profile/禁缓存核字节，不能停他人实例。
- **Vue LSP**：项目私有`editor-ui/lsp/`用Vue LS2.2.12＋TS5.9.3 standalone，仅项目`.pi-lens.json`；从editor-ui启动新会话才实际采用override，配置来源不等于launcher生效。不改全局工具/信任，安装与独立检查见[说明](editor-ui/lsp/README.md)。
- **库/字节身份**：角色/指纹/SHA严格绑定，不改manifest或放宽旧身份；`--no-library`仅验壳/空态。改`web/src/**`重建trialweb.txt；玩家/编辑器static release、源码、三pin、nginx static-v1目录与程序登记锁步；核完整inventory/SHA，不只比sourceTreeDigest。静态归档遵manual-static-build.sh的`core.autocrlf=false`。
- **copyop分发**：`applyCapturedMapEdit`的`view(edit)`返回属性描述符表，不是原对象；新op用`value(edit, key)`取值，勿直读`edit.x`。未绑定piece（cityId空）校验必败，绑定后才放行；新城中心须行序扫描在最后（scan-last），否则编译拒收；走廊须先铺好（端点D4..DD），road-add只做认证不铺砖。
- **地图交互验收**：摘掉组关系不等于拆成单格，须检查实例身份／足迹、JSON保存重读及逐格命中。提示应复用固定状态区，右键清提示引发resize会关闭菜单／改变点击坐标，不能用点击重试掩盖。移动保存门限于移动批次，不阻断copy分步建城。
- **事件调度**：调度表与 4 字节轮不能各派发一次——条目只写原轮或只写调度表，读时按 carry→原轮→overflow 合并；改 `strategicEventSchedule` 形状须同步快照校验与 `verify_d2_event_*`，否则到恢复期才炸。
- **会话/版本接缝**：session DTO可无根级version，捕获和比较要使用相同缺省，不因undefined/null误拒全部请求；身份/epoch守卫仍保留。copy审批revision可为规范`1.n`，玩家兼容旧正整数，但不能省略manifest/session精确身份与SHA校验。
- **schema/purge**：同步deletiondefinitions/deletionschema/distributiondeclarations及投影/inventory，不把某批表数固化为规则、不重算pinned基线；系统基础地图表不进游戏purge。SQLite WAL调查用一致备份或停服快照，不能裸拷主库；栅栏存在不等于文件已清。
- **离线审计与编码**：忽略的报告父目录在新检出中可能不存在，允许创建父目录，但新轮次叶目录必须独占、拒绝覆盖。Python用`-B`和显式UTF-8；Windows子进程输出也须指定编码，不能以stdout的UTF-8设置代替。报告绑定当时输入／工具SHA，工具修补不改写旧收据。
- 提交、推送、生产写入/迁移/部署分别授权；健康或push成功不是内容验收。保留用户/其它会话改动，不整体reset/clean、不批量换行。不提交秘密/profile/缓存/运行数据。遇Git锁先查活跃进程、时间与归属，不盲删锁。GitHub用remote `github`，非Gitea `origin`；HTTP/2 reset可单次加`-c http.version=HTTP/1.1`，不改全局策略。

## 5. 常用命令与分级验证

仓库根执行，先审I/O/依赖/隔离；显式选lane、重任务串行，禁止`verify_*`通配。以下是入口，不是整批运行或部署授权。

```bash
python -m http.server 8321 --directory web
node tools/editor_server.mjs --serve --port 8322
node tools/dev_editor.mjs --port 8443 --store <独立状态目录>
npm --prefix editor-ui ci --ignore-scripts
node editor-ui/build.mjs
node editor-ui/build.mjs --check
npm ci --prefix editor-ui/lsp --ignore-scripts --no-audit --no-fund
npm run --prefix editor-ui/lsp check
node tools/build_trial_web_bundle.mjs
node tools/build_kao_manifest.mjs --check
node tools/verify_kao_library.mjs
python -B tools/compile_content.py --output /path/to/new-generated
node tools/verify_pinned_source_registration.mjs
node tools/verify_editor_schema_sources.mjs
node tools/verify_game_purge.mjs
node tools/verify_system_base_map_conversion.mjs
python -B tools/audit_map_sprite_atoms.py <new-round>
python -B tools/verify_map_sprite_atoms.py
node tools/verify_map_sprite_catalog.mjs
node tools/verify_d2_event_schedule.mjs            # + _chain/_refusal/_v_matrix/_v_matrix_app/_save_roundtrip
node tools/verify_d2_event_schedule_browser.mjs    # 浏览器 lane；本机 @playwright/cli 自带 playwright
node tools/verify_map_sprite_materialization.mjs
node --test --test-concurrency=1 tools/verify_map_position_editing.mjs
node tools/verify_map_canvas_select_disband_browser.mjs # 可选 --large；隔离SQLite／API夹具
node tools/verify_copy_http_roundtrip.mjs --browser
node --check <变更JS或MJS>
git diff --check
# 只读线上核对，不是部署
curl -s https://dragon-editor.720108.xyz/api/health
curl -s https://dragon.720108.xyz/play-api/v1/registry
# 隔离构建，不上传/切换生产
sh vps/manual-static-build.sh /path/to/new-out
```

- 按改动选内容、slot-phase、battle、formation、road-authority、save等回归；共享调度/RNG/存档/跨模块状态要完整适用覆盖。生成物写新目录。copy/地图lane按[收敛任务](docs/copy-simplification-tasks.md)、[基础地图核对](docs/system-base-map-completion-audit.md)及[精炼目录审计](docs/map-workspace-sprite-library-audit.md)选择；历史通过不替代本次执行。
- `verify_editor_workbench_browser.mjs`默认串行跑现行显隐／基础地图／选择拆散／新城四lane；旧draft/Trial体仅`--legacy-draft`，不是现行产品验收。分项通过不等于超时总命令通过。
- UI用全新Playwright profile，核console/pageerror/请求失败、保存重读及真实登记源流程；可用已有PLAYWRIGHT_MODULE，不擅装依赖。永久入口包括verify_editor_generals_browser、verify_editor_panel_visibility_browser、verify_new_city_panel_browser、verify_system_base_map_browser；夹具、真实后端、生产分开报告。
- 存档另测真实JSON、事务失败、跨窗口CAS；公开目录/删除用verify_publication_chain_browser，归档用verify_program_entry/verify_program_assets，按入口选参数。进程内桥不等于生产TCP/TLS；强制退出测试不能证明计时器清理。
- 交付审实际diff；支持文件主动`lens_diagnostics source=lsp scope=paths`，再`mode=all`。空缓存/push-only/超时/inconclusive不算clean，构建不代替Vue LSP；未跑/失败/覆盖不足如实记录。
- 纯文档只核职责、事实、链接/兼容锚点及diff，不跑无关游戏/浏览器回归。Jev仅advisory、非证据或放行门，纯文档不用，见[集成边界](docs/jev-integration.md)。
