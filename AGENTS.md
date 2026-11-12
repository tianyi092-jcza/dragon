# AGENTS.md — 臥龍傳 Web 项目记忆

> 只维护长期事实、架构、命令、约定和当前主线。先读[全局约定](../AGENTS.md)；会话进展、调试、失败、验证与阻塞见 [journal](docs/checkpoint-journal.md)，版本沿革见 [CHANGELOG](CHANGELOG.md)。文档、代码和测试均不替代原始机制证据或用户授权。

## 1. 项目边界与当前主线

- 原生 JavaScript ES Modules＋Canvas 2D 重写 1995 DOS《臥龍傳》。玩家、共同编辑／编译核心及保留的 Trial 引擎无框架、构建和 npm 运行时依赖，完整 `web/` 可直接静态服务。
- 编辑器展示层独立使用 Vue 3.5.x＋Element Plus 2.14.8＋Vite 6.x，限定 `editor-ui/`，预构建资源由编辑器同源提供。业务层只传显示 DTO／动作回调，不传凭据、源对象或 live 游戏状态；局部响应式表单不替代服务端身份／权限权威。具体依赖版本以 package／lock 为准。
- 仓库 `E:/Dragon/web-port`，原程序 `E:/Dragon/Dragon/`，官方基准 `E:/Dragon/原版/`，改版库 `上/中/下/后/`。禁止自动化访问真实 `SAVE.DAT`、用户存档或 profile；测试使用内存、mock、隔离目录与新 profile。
- 软件版本以 `VERSION` 为准，规则基线 `web-0.1.1`；游戏版本 `1.n`、软件版本、内容摘要和程序归档身份相互独立。
- **当前主线：游戏级共享数据＋copy 单套／publish 单槽／formal 单快照。** 元数据、章节、据点、武将库及发布审核已接 copy；地图／部分定义面板、旧 draft 控制器与表清理尚未整体收尾，见[任务清单](docs/copy-simplification-tasks.md)。编辑器 `/api/trial/*` 已退役为 `410 TRIAL_RETIRED`，保留引擎不等于重开接口。
- 当前本地已实现copy主表初始化、内置武将整库覆盖、持久管理员列表、先清文件再删库及阻塞弹窗反馈；尚未部署。地图收尾、头像旧持久化／冻结包兼容与生产验收仍待按任务推进；具体批次、验证缺口与数据操作收据只记journal，不把本地结果当上线事实。
- 生产为 `sadcloud` 单 VPS（`ssh sadcloud`，根 `/srv/dragon`）：编辑器／玩家分服务，SQLite＋私有文件桶＋磁盘分发桶，nginx／Let's Encrypt；域名 `dragon-editor.720108.xyz`／`dragon.720108.xyz`，DNS 直指源站。Worker／R2／Tunnel、instabox 是历史形态；现行运维见[存储布局 §18](docs/game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产)，部署时重新核镜像／摘要。

## 2. 架构与数据归属

```text
原版非存档资料 → 离线导入／游戏源 → 校验编译 → Scenario → 保存守卫 → IndexedDB
编辑器：copy(gameId) → 全量检验／一次性票 → publish 单槽 → 管理员同意 → formal 最新版
```

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js`、`app/startflow.js`、`app/battleflow.js` | 新局／恢复、场景与战斗接续 |
| `web/src/content/`、`game/world.js`、`game/worldresources.js` | 内容身份、编译合同、每世界资源实例 |
| `web/src/game/navigation/`、`game/native*.js` | 原生道路／地形／占格／固定表，不以通用 A* 替代 |
| `web/src/game/{ai,legionphase,legionscheduler,strategicfailure}.js` | 逐槽调度、续段、失败暂停 |
| `web/src/game/{clock,tacticalclock}.js`、`battle/original*.js` | 战略／战术时序、Session、RNG、结算 |
| `web/src/game/savegame.js`、`core/{gamesavestore,saverepository}.js` | 完整快照、IndexedDB 事务、CAS、存档归属 |
| `web/src/render/`、`ui/`、`game/playerqueries.js` | 只读绘制、输入、消息 FIFO、查询 |
| `web/src/player/` | 正式目录、准入、资源与存档；旧客户端 reader 仅再导出 |
| `editor-ui/`、`server/public/*.txt` | Vue 展示壳／原生业务控制器 |
| `server/{editorapp,gamecopy}.js` | 应用鉴权、模块写入、检验票、提交审核事务 |
| `vps/`、`reader/site.js`、`vps/player-server.mjs` | Node SQLite／文件桶／发布装配，玩家复用 `reader/*.js` |

### 游戏与保存

- 原版世界 384×256 格、16px 图块、192 据点、128 军团槽、22 正常势力、24×24 外交矩阵，逻辑界面 640×400；哨兵／别名／排除槽不能用数组长度泛化。扩容与任意拓扑另过准入门。
- fresh／restore 使用 v2 原生道路与固定表，生产 v1 回退已退役。未知消费点 fail-closed，保留已提交前缀、hold 与禁存；不补零未知 RAM，不用 `Math.random` 兜底。RNG、live／delayed 对象身份、槽写序不可简化；绘制不推进路线、不消费 RNG。
- 图集、显示布局、拓扑与规则地形分离，Scenario 是规则地形权威；画道路不等于建通路，资源路径取世界定义。解析纠错导入新目录，不手改生成物。
- 正式存档仅同源 IndexedDB `wolong-web/saves`，目录／正文同事务。游戏内读档先回标题，detached 校验和资源 ready 后安装，await 后重核 scenario／world／clock／票据。战斗、未完续段、装配、故障期间禁存；真实 JSON 往返不能用 structuredClone 替代。
- 机制证据按[行军](../.agents/skills/re-march-engagement/SKILL.md)、[战斗](../.agents/skills/re-battle-command/SKILL.md)、[战后](../.agents/skills/re-post-battle/SKILL.md)、[数据格式](../.agents/skills/re-data-formats/SKILL.md)加载，不在 memory 复制地址与推导。

### 编辑器数据与发布

- 据点、地图道路、武将库与章节属于**单款游戏自己的共享数据**；`sourceRef.kind`／`copy_origins.profile_revision` 只是来源标签，不是第二份共享数据。编辑 copy 与正式快照分开，发布不回写内置源。
- 据点父表拥有名称、坐标、最大生产力、类型及新章默认四值，缺省四值从第一章回填一次；章节可改所属势力、当前生产力、上升值、防灾值、城兵，内政官不在该设置。编译物化原生格式，见[据点合同](docs/editor-city-definitions.md)与[章节属性](docs/chapter-and-base-resources.md)。
- 普通新建初始化完整据点主表，武将可空；完整复制初始化copy主表及章节槽关联，不保留空武将库。固定章序／槽序、姓名trim＋NFC去重，首次同名整条胜出。从内置游戏导入须确认整库覆盖，服务端准备后单事务替换、失败保留旧库，不扫描目标章或分批追加；不自动迁移旧副本。
- 武将姓名游戏内唯一，改名不改稳定ID；主表投影到关联槽，缺失引用交发布门报告，不隐式免职。六能力 `0..15`，`suicideOnCapture`只同步attr bit4；`zi`只保存，不把原生称呼导成字／号。详见[现行武将合同](docs/editor-general-definitions.md#copy内置武将转换与主表权威现行)。
- copy 保存只拦本模块约束，发布全量检验闭合跨模块依赖；`copyDigest` 变化作废旧票，不照搬 `draft_revision` 门。单写者无修订 CAS 不等于可省鉴权、epoch、Origin、删除栅栏。
- 管理员全局管理列表按gameId显示已提交过申请且未删除的游戏，不受顶部当前游戏过滤；通过/驳回仍保留删除入口，只有submitted可再次审核，编辑/校验不会解锁审核。
- 提交须同摘要通过票及 1–2000 码点发布说明，票一次性核销、每游戏 30 分钟节流。同意须同事务分配 ordinal、安装已准备包、更新 pin／formal／`listed=1`，失败回滚、不耗号；版本按 `1.0→1.1…1.10` 整数序号递增，不回滚／复用。名称归游戏作者，同作者不可重名、不同作者可同名，审核管理员不是名称所有者。
- 内置游戏始终可用，不经编辑器修改／下架／删除；完整复制不含对局或存档。作者编辑／提交自己内容，管理员审核／限制／删除，不替作者编辑；普通新建与完整复制不能混用。
- 新正式版使旧版对局禁存、旧档不可加载；清旧与新版保存同事务，失败不先删。网络错误、缺身份、下架、损坏不能冒充更新；仅下架未更新的会话可继续。`410 GAME_DELETED` 阻塞显示「該遊戲已刪除！」，仅「確認」，清该游戏本机进度后回开局。
- 在架指针 `control/directory.json`；共享程序 `artifacts/programs/<digest>/`，游戏发布 `artifacts/<gameId>/`，编辑私有 `private/<gameId>/`。删除须先核权／栅栏、移除指针并清空两处游戏前缀，再交易内复核并 purge 库行；回收失败保留管理行／栅栏供重试，不先删库制造孤儿文件。不顺带删除 `installed/` 或共享程序，现行合同见[存储布局 §11.1](docs/game-storage-layout.md#111-本轮实际做了什么)。
- 磁盘桶 ETag 为 `"<md5>"`、mtime 决定 last-modified；读者绑定含 `size`、`httpMetadata.contentType`、`body: ReadableStream`。共享 `kao/` 为 621 张 128×128 画像，文件名／资产 ID 数字 `0..620`，255按普通资源、不开放上传；ID>255 走 `portraitKey`，不塞原生 byte，不改 DOS FF 或历史冻结身份。详见[画像资源决定](docs/re-notes-portrait-reader.md#现行web准入与原证边界)。

## 3. 展示、交互与文档职责

- 玩家无关闭按钮、羽扇开关、右键层级／强制多步交互、地图锁及 hold 并集遵[全局约定](../AGENTS.md)；编辑器是常规网页交互例外，不套游戏皮肤。玩家列表选中色不用于编辑器。
- **长期 Web 产品决定（非原版机制）**：编辑器全部现有／新增页面用 **Element Plus 默认主题、默认组件、默认控件、默认 size、繁体 locale**；不重定义 `--el-*`、不叠皮肤，不加 UI／图标库或依赖，例外须另获批准。列表、弹窗、表单、按钮用对应默认组件；范围仅展示层，不进入玩家／Trial／共同规则。决策取舍见 [journal §37](docs/checkpoint-journal.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)。
- 组件按路径引入（如 `element-plus/es/components/button/index.mjs`），并在 `main.js` 引入相应 `element-plus/es/components/<name>/style/css`，否则只有裸 DOM。`theme.css` 仅骨架、间距、宽度、滚动、资源布局；不覆盖控件高度／字阶／边框／圆角。不得为编辑器修改玩家 `server/public/style.css`，挂载时移除该 link。
- 详细维护源为[布局规范](docs/editor-ui-layout-spec.md)：整页不滚、数据区滚、垂直居中、左提示右草稿、枚举名称（未知保留「数字（未知）」）、保存后按控制器合同重读。旧 34px／原生 table 皮肤条款已撤销。可见布局不得覆盖 `[hidden]`；隐藏重型内容按需挂载，但保留控制器与组件未保存输入。
- 保留中文／繁体与 id、data-* 协议（特别是 `#generals-*`、`#publish-overlay*`、`#full-copy-overlay*`、`#review-*`）。有效空字符串选项用 `empty-values=[null, undefined]`，数组多选用 `ElCheckboxGroup`；组件回调传值，不假定原生事件。
- 加载共用四圆点及默认Loading；页面统一请求计数／busy，弹窗先打开再局部加载，动作／请求默认`global`，局部／进度明确分流（含最终重读），不改权限或busy。图片／音频懒加载不阻塞整页，真实批次才用进度、不伪造百分比。`run()`先解锁再渲染，面板异常不扩散。
- 完整复制／检验用窄版加高阻塞弹窗，动画在内容上方，不叠背景Loading或底部说明；检验明细内部滚动，失败保留结果和确认／关闭入口。删除仅在当前弹窗更新真实阶段、无Loading，全部清理确认后才显示完成。具体尺寸、状态及例外统一维护在[布局规范§3](docs/editor-ui-layout-spec.md#3-加载反馈)。
- 列表默认固定表头、25／50／100 分页与 jumper，不用瀑布流；普通默认「編輯／保存／取消」，不加 primary／link／text 或悬浮操作列。复用 `ListPagination.vue`、`ListRowActions.vue`、`pagination.js`。固定列紧凑、读编辑同宽、控件不撑宽，操作列 min180 吸收余宽；宽屏无无谓横滚、窄屏表内横滚。规范不自动授权整仓迁移。
- 头像弹窗固定25张／页、只挂当前页、懒图、可跳页／resize；目录完整读取并缓存、数值排序。copy 用 `?usage=0` 跳过未消费的旧草稿使用统计，无查询旧接口仍保留 `inUse`；认证／SHA 门不放宽，见[轻量目录合同](docs/editor-general-definitions.md#copy头像目录轻量读取现行)。尺寸／对齐细则只在布局规范维护。
- 玩家标题单一游戏选择器，远端失败不阻断内置；新局／标题读档后默认展开军师条、势力信息、小地图。开场视觉见[开场合同](docs/opening-scene.md)；`CITY-4064-WEB-1` 有限差异见[行军维护源](docs/re-notes-march-pathfinding.md#3156-p394064-外栈读取闭合为永久工程边界)，不外推其它规则。
- 游戏表现／时序分别见[战略时序](docs/re-notes-strategic-time.md)、[表现合同](docs/presentation-modernization.md)、[行军表现](docs/march-presentation-fixes.md)、[战术生命周期](docs/re-notes-tactical-lifecycle.md)。编辑器／地图按需加载[产品设计](docs/game-editor-design.md)、[共同工程合同](docs/game-editor-technical-design.md)、[迁移计划](docs/game-map-migration-plan.md)、[准入原证](docs/re-notes-editor-map-admission.md)与相关 SKILL；框架边界见[壳合同](docs/editor-framework-shell.md)。地图 M0→M1→M2→M3 须真实修改、编译、同加载器验证，方案不等于实施授权。

## 4. 重要工程坑点

- **build ≠ check ≠ 服务刷新**：Vue 改动先 build 再 `--check`，同步 `shell-ui.txt`（URL `/shell-ui.js`）、`shell-ui.css`、`shell-ui-licenses.txt`。`server/public/*.txt` 被进程 import、dev 监听排除此目录；改后重启自己持有实例，再用新 profile／禁缓存验字节，不能停他人实例。
- **Vue LSP**：项目私有 `editor-ui/lsp/` 固定 Vue LS 2.2.12＋TS 5.9.3 standalone，仅 `editor-ui/.pi-lens.json` 配置，不改全局工具／信任。从 `editor-ui` 启动新 pi 才能实际采用 override；父目录显示配置来源不等于 launcher 生效。安装／独立检查／回退见[工具说明](editor-ui/lsp/README.md)，push-only／超时不能称 clean。
- **库准入**：指纹／角色／SHA 严格绑定，不改 manifest、旧身份或放宽门来跑通。`--no-library` 仅验壳／空态，合成 DTO 不能替代真实已登记源流程。
- **schema／purge**：同步 `deletiondefinitions.js`、`deletionschema.js`、`distributiondeclarations.js` 与投影／inventory，不把某轮表数写成永久规则、不重算 pinned 基线。purge 单事务；已有栅栏不等于物理清理成功。SQLite WAL 调查用一致备份（如 `VACUUM INTO`）或停服快照，不裸拷主库判数据缺失。
- **部署锁步／字节身份**：改 `web/src/**` 后重建 `trialweb.txt`（安装校验仍绑定）。玩家／编辑器同一 static release，源码、三 pin、nginx `static-v1/<digest>/`、程序登记一致；无包、错误 content-type、uid／目录权限可致503，不放宽校验掩盖。遵 `.gitattributes`，静态归档用 `manual-static-build.sh` 的 `core.autocrlf=false`；核完整 inventory／实际 SHA，不能只比 sourceTreeDigest。
- 部署顺序见[存储布局](docs/game-storage-layout.md) §16／§18；生产写入、删库、迁移、部署另需授权，健康／push 成功不等于内容可用。保留用户及其它会话改动，不整体 reset／clean、不批量换行；commit、push 分别授权。GitHub 用 remote `github`，不是 Gitea `origin`；HTTP/2 reset 可单次 `git -c http.version=HTTP/1.1 …`，不改全局策略。不提交秘密、profile、缓存、截图或运行数据。

## 5. 常用命令与分级验证

仓库根执行，先审 I/O／依赖／隔离，显式选 lane、重任务串行，禁止 `verify_*` 通配；下列是入口，不是整批运行或部署授权。

```bash
python -m http.server 8321 --directory web
node tools/editor_server.mjs --serve --port 8322
node tools/dev_editor.mjs --port 8443 --store <独立状态目录>
# --no-library 仅壳／空态，不能验真实复制／发布
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
node --test --test-concurrency=1 tools/verify_editor_portrait_catalog.mjs tools/verify_copy_generals_manage.mjs tools/verify_copy_controller_generals.mjs tools/verify_editor_loading.mjs
node --test --test-concurrency=1 tools/verify_copy_controller_copypage.mjs tools/verify_copy_controller_chapters.mjs tools/verify_copy_controller_cities.mjs tools/verify_copy_controller_modules.mjs tools/verify_editor_definition_controller.mjs tools/verify_editor_chapter_people.mjs
node --test --test-concurrency=1 tools/verify_copy_chapter_ops.mjs tools/verify_copy_single_slot.mjs tools/verify_copy_validate_gate.mjs
node --test tools/verify_review_controller_queue.mjs
node tools/verify_game_purge.mjs
node tools/verify_editor_schema_sources.mjs
node --check <变更JS或MJS>
git diff --check
# 只读线上核对，不是部署
curl -s https://dragon-editor.720108.xyz/api/health
curl -s https://dragon.720108.xyz/play-api/v1/registry
# 只构建隔离产物，不上传／切换生产
sh vps/manual-static-build.sh /path/to/new-out
```

- 规则改动选内容、slot-phase、battle、formation、road-authority、save 等适用回归；共享调度／RNG／存档／跨模块状态须完整适用覆盖。Python 用 `-B`／UTF-8，编译写新目录。
- copy初始化／整库覆盖／删除按需选 `verify_copy_builtin_generals.mjs`、`verify_copy_http_roundtrip.mjs`、`verify_game_purge_reclaim.mjs`；发布控制器入口为 `verify_publish_controller_slot.mjs`，当前运行注意事项见journal，不用强制退出证明计时器已清理。
- UI 用全新 Playwright profile，核 console／pageerror／请求错误、保存重读及可用源流程；可指定已有 `PLAYWRIGHT_MODULE`，不擅装依赖。合成夹具、真实后端、生产分开报告。永久浏览器入口：`verify_editor_generals_browser.mjs`、`verify_editor_panel_visibility_browser.mjs`。
- 存档另测真实 JSON、事务失败、跨窗口 CAS；公开版本／目录／删除可用 `verify_publication_chain_browser.mjs`，程序归档用 `verify_program_entry.mjs`／`verify_program_assets.mjs`，按各入口选参数，进程内桥不等于生产 TCP／TLS。
- 交付核实际 diff；支持文件主动 `lens_diagnostics source=lsp scope=paths`，再 `mode=all`。空缓存、push-only、超时／inconclusive 不算 clean，构建不替代 Vue LSP；未跑／失败／覆盖不足如实记录。
- 纯文档核职责、事实依据、链接／兼容锚点与 diff，不跑无关游戏／浏览器回归。Jev 仅开发 advisory，非证据／oracle／放行门，纯文档无需调用，见[集成边界](docs/jev-integration.md)。
