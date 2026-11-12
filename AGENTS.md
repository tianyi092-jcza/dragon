# AGENTS.md — 臥龍傳 Web 项目记忆

> 只维护长期事实、架构、命令、约定和当前主线。先读[全局约定](../AGENTS.md)；本轮进展、失败、验证与阻塞见 [journal](docs/checkpoint-journal.md)，版本沿革见 [CHANGELOG](CHANGELOG.md)。文档、现有代码和测试均不替代原始机制证据或用户授权。

## 1. 项目边界与当前主线

- 以原生 JavaScript ES Modules＋Canvas 2D 重写 1995 DOS《臥龍傳》。玩家、共同核心及保留的 Trial 引擎无框架、构建和 npm 运行时依赖；完整 `web/` 可直接静态服务。
- 编辑器展示层是已批准的独立例外：`editor-ui/` 使用 Vue 3.5.x＋Element Plus 2.14.8＋Vite 6.x，预构建资源只由编辑器同源提供，不进入玩家引擎。业务层只向壳传显示 DTO／动作回调，不传凭据、源对象或 live 游戏状态；局部表单临时输入不替代服务端身份与权限权威。
- 仓库 `E:/Dragon/web-port`；原程序 `E:/Dragon/Dragon/`；官方基准 `E:/Dragon/原版/`，改版库 `上/中/下/后/`。禁止自动化访问真实 `SAVE.DAT` 或用户存档/profile；使用内存、mock、隔离目录与全新浏览器 profile。
- 软件版本以 `VERSION` 为准，规则基线 `web-0.1.1`；游戏版本 `1.n`、软件版本、内容摘要与程序归档身份相互独立。
- **当前主线：游戏级共享数据＋copy 单套／publish 单槽／formal 单快照收敛。** 元数据、章节、据点、游戏级武将及发布审核已接 copy；地图与部分定义面板、旧 draft 控制器／表清理仍有收尾，不能宣称旧链已全删。编辑器 `/api/trial/*` 已返回 `410 TRIAL_RETIRED`，不因保留引擎或旧文件重开试运行。
- **展示层长期架构约定：Element Plus 默认主题、默认组件、默认控件与默认 size**，适用于编辑器全部现有及新增前端页面，不因本轮迁移结束而失效。决策背景、备选方案与取舍见 [journal §37](docs/checkpoint-journal.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)（tag: `architecture`）；本地迁移验证及剩余限制见 journal §36，不将实施记录当生产上线事实。
- 生产采用 `sadcloud` 单 VPS（`ssh sadcloud`，根 `/srv/dragon`），编辑器与玩家服务分开运行，SQLite＋私有文件桶＋磁盘分发桶；域名 `dragon-editor.720108.xyz`／`dragon.720108.xyz` 经 nginx／Let's Encrypt，DNS 直指源站。Cloudflare Worker／R2／Tunnel 与 instabox 是历史形态；现行运维以[存储布局 §18](docs/game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产)为入口，镜像／摘要须部署时重新核对。

## 2. 架构与数据归属

```text
原版非存档资料 → 离线导入／游戏源 → 校验与编译 → Scenario → 保存守卫 → IndexedDB
编辑器：copy(gameId) → 全量检验／一次性票 → publish 单槽 → 管理员同意 → formal 最新版
```

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js`、`app/startflow.js`、`app/battleflow.js` | 新局／恢复装配、场景与战斗接续 |
| `web/src/content/`、`game/world.js`、`game/worldresources.js` | 内容身份、编译合同、每世界资源实例 |
| `web/src/game/navigation/`、`game/native*.js` | 原生道路／地形／占格／固定表；不是通用 A* 替代品 |
| `web/src/game/ai.js`、`legionphase.js`、`legionscheduler.js`、`strategicfailure.js` | 逐槽调度、续段及失败暂停 |
| `web/src/game/clock.js`、`tacticalclock.js`、`battle/original*.js` | 战略／战术时序、Session、RNG 与结算 |
| `web/src/game/savegame.js`、`core/gamesavestore.js`、`saverepository.js` | 完整快照、IndexedDB 事务、CAS 与存档归属 |
| `web/src/render/`、`ui/`、`game/playerqueries.js` | 只读绘制、输入、消息 FIFO 与查询 |
| `web/src/player/` | 正式游戏目录、准入、资源与存档；旧客户端 reader 文件仅再导出 |
| `editor-ui/`、`server/public/*.txt` | Vue 展示壳及原生业务控制器；展示迁移不改业务合同 |
| `server/editorapp.js`、`server/gamecopy.js` | 共同应用／鉴权、模块写入、检验票、提交与审核事务 |
| `vps/`、`reader/site.js`、`vps/player-server.mjs` | Node SQLite／文件桶／发布装配；玩家侧复用 `reader/*.js` |

### 游戏与保存

- 原版世界 384×256 格、16px 图块、192 据点、128 军团槽、22 正常势力、24×24 外交矩阵，逻辑界面 640×400；哨兵／别名／排除槽不能用数组长度泛化。扩容与任意拓扑须另过准入门，不能从原图证据外推。
- fresh／restore 使用 v2 原生道路与固定表，生产 v1 回退已退役。未知消费点 fail-closed，保留已提交前缀、hold 与禁存；不补零未知 RAM，不用 `Math.random` 兜底。
- 图集、显示布局、拓扑与规则地形分离；Scenario 是规则地形权威，画道路不等于建通路。资源路径取世界定义，不硬编码旧图。解析纠错导入新目录，不手改生成物。
- 正式存档仅同源 IndexedDB `wolong-web/saves`，目录与正文同事务。游戏内读档先回标题，detached 校验／资源 ready 后安装；await 后重核 scenario／world／clock／票据。战斗、未完续段、装配与故障期间禁存；真实 JSON 往返不能用 structuredClone 替代。
- RNG、原生表、live／delayed 对象身份及槽写序不可简化；绘制不推进路线、不消费 RNG。规则证据按[行军](../.agents/skills/re-march-engagement/SKILL.md)、[战斗](../.agents/skills/re-battle-command/SKILL.md)、[战后](../.agents/skills/re-post-battle/SKILL.md)、[数据格式](../.agents/skills/re-data-formats/SKILL.md)加载，不在 memory 复制地址／推导细节。

### 编辑器数据与发布

- 据点、地图道路、武将库与章节属于**单款游戏自己的共享数据**；`sourceRef.kind`／`copy_origins.profile_revision` 只是来源标签，不能据此杜撰第二份共享数据。编辑期可变 copy 与正式快照分开，发布不回写内置源。
- 据点父表：名称、地图坐标、最大生产力、类型及新章默认四值；缺省四值从该游戏第一章回填一次。章节可改所属势力、当前生产力、上升值、防灾值、城兵；名称／最大生产力／类型关联父表，内政官不在该设置。编译物化原生格式，见[据点合同](docs/editor-city-definitions.md)与[章节属性](docs/chapter-and-base-resources.md)。
- 游戏级武将库姓名游戏内唯一，六项能力写入域 `0..15`；`suicideOnCapture` 是游戏级属性，关联槽只同步 attr bit4，不改其它位。`zi` 只保存、不写原生槽；导入不把原生称呼字段误当字／号。导入是显式动作、按姓名去重、64 条一批，成功批次保留，失败可重试；不伪造跨批事务。
- copy 模块保存只拦本模块约束，跨模块依赖在发布全量检验门闭合；按 `copyDigest` 作废旧票，不能照搬旧 `draft_revision` 保存门。单写者 copy 无修订 CAS，不意味着可省鉴权、epoch、Origin 或删除栅栏。
- 提交需同摘要的通过票、必填发布说明（1–2000 码点），票一次性核销、每游戏 30 分钟节流。管理员同意在同一事务内分配 ordinal、安装已准备包、更新 pin／formal／`listed=1`；失败整体回滚、不耗号。ordinal 按 `1.0→1.1…1.10` 整数序号递增，不回滚或复用。名称占用与登记归游戏作者，同作者不可重名、不同作者可同名；审核管理员是权限身份，不是名称所有者。
- 内置游戏始终可用，管理员也不能经编辑器修改／下架／删除；完整复制不含对局或存档。作者只编辑／提交自己的内容，管理员审核／限制／删除，不替别人编辑。普通新建与完整复制入口语义不同，不能混用。
- 新正式版使同游戏旧版对局禁存、旧档不可加载；清旧与新版保存同事务，失败不先删。网络错误、缺身份、下架或损坏不能冒充更新。仅下架且未更新的会话可继续；`410 GAME_DELETED` 用阻塞告知「該遊戲已刪除！」，仅「確認」，清该游戏本机进度后回开局。
- `control/directory.json` 为游戏级在架指针；共享程序包在 `artifacts/programs/<digest>/`，游戏发布字节在 `artifacts/<gameId>/`，编辑器私有字节在 `private/<gameId>/`。删除须库行 purge＋指针移除＋两处游戏前缀回收；`installed/` 底层资源与共享程序包不是游戏孤儿，禁止顺带删除。
- 磁盘桶兼容既有对象端口：ETag 形如 `"<md5>"`、mtime 决定 last-modified，读者绑定须含 `size`、`httpMetadata.contentType` 与 `body: ReadableStream`。shared `kao/` 为 621 张 128×128 画像（数字 0–149／`p####` 471 张），不开放用户上传。

## 3. 展示、交互与文档职责

- 玩家游戏的无关闭按钮、羽扇唯一开关、右键退层／强制多步无效、地图锁例外及 hold 并集遵[全局约定](../AGENTS.md)。**编辑器是常规网页交互例外**，不套游戏窗口皮肤；玩家列表选中色 `#4a7828` 不适用于编辑器。
- **长期强制约定（用户确认，Web 产品决定，非原版机制）**：编辑器全部现有及新增前端页面一律使用 **Element Plus 默认主题、默认组件、默认控件与默认 size**、繁体 locale；默认主色 `#409EFF` 及其它视觉取默认 `--el-*`，不重定义主题变量、不在默认组件上再造皮肤。列表用 `ElTable/ElTableColumn`，弹窗用 `ElDialog/ElMessageBox`，表单用 `ElInput/ElInputNumber/ElCheckbox/ElSelect` 等对应默认控件，按钮用默认 `ElButton`。这是持续有效的架构选择，不是一次性换色；例外须另获用户明确批准。不增加框架／图标库／依赖；图标另取授权。范围仅 `editor-ui/` 展示层，不将组件体系带入玩家／Trial Canvas 引擎或业务／规则核心。
- 按组件路径引入，例如 `import { ElButton } from 'element-plus/es/components/button/index.mjs'`，**同时**在 `editor-ui/src/main.js` 引入相应 `element-plus/es/components/<name>/style/css`，否则只有裸组件 DOM。
- `editor-ui/src/theme.css` 只放骨架、间距、宽度、溢出与资源内容布局；不定义颜色、控件高度、字阶、边框或圆角覆盖。整页不滚、数据区滚；提示左／目前草稿右，枚举显示名称、未知保留「数字（未知）」；保存后按既有控制器合同重读。
- `server/public/style.css` 属玩家样式，**不得为了编辑器去改它**；编辑器挂载时移除该 link。原[布局规范](docs/editor-ui-layout-spec.md)中的通用布局目标仍适用，但其中 34px、自造变量／原生 table 皮肤及共用玩家样式的旧条款已被本次默认组件决定取代，不能重新引回。
- 保留中文／繁体文案与既有 id、data-* 协议（尤 `#generals-*`、`#publish-overlay*`、`#full-copy-overlay*`、`#review-*` 及行／列／输入标记）；结构变化不等于授权删除选择器。EP 空字符串是有效业务选项时，保持 `empty-values=[null, undefined]`；数组多选用 `ElCheckboxGroup`，不靠原生 input 语义猜测。
- **统一加载反馈（用户指定）**：编辑器数据加载统一显示页中央蓝色四圆点旋转动画，不用文字或按钮转圈代替。由工作台唯一的 Element Plus Loading 入口处理，图形按用户参考图，颜色／尺寸／旋转／遮罩沿用默认组件；共同 API 请求计数覆盖首次会话、后台清单和并行读取，并与动作 busy 合并，成功／失败均清理。新增模块沿用共同入口，不另造加载样式；图片／音频懒加载不阻塞整页。
- **列表长期默认（用户确认，后续无需重复询问）**：现有／新增列表使用固定表头的默认 `ElTable`、带 jumper 的 `ElPagination`，不使用瀑布流／无限滚动追加；数据请求沿用上述统一 Loading。操作列按城池据点参考统一默认普通按钮：只读「編輯」，编辑态「保存／取消」，不加 primary／link／text 或固定悬浮列。默认每页 25 条，可选 25／50／100；头像选择弹窗固定每页 25 张、仅挂载当前页、可跳转并适配／调整窗口大小。新模块复用 `ListPagination.vue`、`ListRowActions.vue` 与 `pagination.js`；详见[布局规范](docs/editor-ui-layout-spec.md)。特殊情况由用户另提；此约定不自动授权整仓集中迁移，实际实施范围按当前用户任务，不把未改模块记成已迁移。
- 多步动作进度写「在做什么」，成功写「做成什么」，失败写「原因＋可做什么」；不伪造百分比。长动作／失败弹窗按所属状态机限制 Esc、遮罩和明确关闭，不将默认可关闭行为强加给阻塞流程。全局 `run()` 先解锁再渲染，面板异常不扩散。
- 玩家标题只用一个游戏选择器，远端目录失败不阻断内置游戏；新局／标题读档后默认展开军师条、势力信息、小地图。开场、云纹金框和加载等待按[开场合同](docs/opening-scene.md)，不把这些玩家视觉引入编辑器。
- `CITY-4064-WEB-1` 是已批准的有限 Web 差异，不据此放宽其它规则；原证与适用域见[行军维护源](docs/re-notes-march-pathfinding.md#3156-p394064-外栈读取闭合为永久工程边界)。
- 游戏时序、只读渲染、云雨季节、战术对白等现行决定分别见[战略时序](docs/re-notes-strategic-time.md)、[表现合同](docs/presentation-modernization.md)、[行军表现](docs/march-presentation-fixes.md)、[战术生命周期](docs/re-notes-tactical-lifecycle.md)，不在记忆重复历史参数和测试成绩。
- 编辑器／地图任务按需加载[产品设计](docs/game-editor-design.md)、[共同工程合同](docs/game-editor-technical-design.md)、[迁移计划](docs/game-map-migration-plan.md)、[准入原证](docs/re-notes-editor-map-admission.md)及相关 SKILL。地图 M0→M1→M2→M3 仍须真实修改、编译和同加载器验证；方案／待办不等于实施授权。框架壳边界见[说明](docs/editor-framework-shell.md)，copy 收尾以[任务清单](docs/copy-simplification-tasks.md)与 journal 的实际状态交叉核对，旧 UI／API 描述不能覆盖现行决定。

## 4. 重要工程坑点

- **构建不等于检查**：`build.mjs --check` 仅比对，不更新资源；修改 Vue 后先 build，再 check。生成 `server/public/shell-ui.txt`（服务 URL `/shell-ui.js`）、`shell-ui.css`、`shell-ui-licenses.txt` 三份必须一起同步。
- **Vue 检查工具兼容方案**：编辑器保留 Vue 3；私有 `editor-ui/lsp/` 固定 Vue LS 2.2.12＋TS 5.9.3 standalone，配置只在 `editor-ui/.pi-lens.json`，不改全局 pi-lens／信任。当前客户端须从 `editor-ui` 启动新 pi 进程才能实际采用 override；父目录启动虽可显示配置来源，仍可能走默认服务。完整安装、协议回归、push-only 限制与回退见[工具说明](editor-ui/lsp/README.md)；不把空主动结果当 clean，需要时运行该独立新进程检查并记录真实结果。
- **构建不等于服务刷新**：`server/public/*.txt` 被进程 import，dev 监听还排除 `server/public/`；改控制器或产物后须重启自己持有的 dev 实例，再用新 profile／禁缓存刷新验字节。不能停别的会话实例。
- **已登记库不是随改随用**：消费者指纹／角色／SHA 绑定严格；不为跑通而改 manifest、重算旧身份或放宽门。`--no-library` 只能验壳与空态，`SOURCE_NOT_REGISTERED` 是真实源流程阻塞，合成 DTO 预览不能替代它。
- **schema 以声明和活门为准**：`deletiondefinitions.js`、`deletionschema.js`、`distributiondeclarations.js` 及相关投影／inventory 同步维护；不把某轮表数写成永久规则，不改 pinned 历史 lane 快照祝福新结构。purge 为单事务；栅栏存在不等于物理清理成功。
- **SQLite WAL 快照**：裸拷主 DB 可能漏已提交 WAL；运行库调查／迁移须使用一致备份（如 `VACUUM INTO`）或停服一致快照，不据不完整副本判机制。
- **部署锁步**：改 `web/src/**` 后重建 `trialweb.txt`（即便编辑器 Trial 已退役，安装校验仍绑定它）。玩家与编辑器用同一 static release；镜像内源码、三处 pin、nginx `static-v1/<digest>/` 与程序登记必须一致。无包登记、错误 content-type、uid／目录权限都可使启动或程序资源 503，不能放宽校验掩盖。
- **换行影响摘要**：遵 `.gitattributes`，生产静态归档使用 `vps/manual-static-build.sh`（内置 `git -c core.autocrlf=false archive`）；Windows 工作树／裸 blob／归档字节可能不同，不能改期望 hash。`sourceTreeDigest` 相同不保证整个 inventory 一致，核 `static-release.json` 与实际资源 SHA。
- 生产取源、镜像构建、三 pin／nginx 切换和两服务部署 ID 的完整顺序见[存储布局](docs/game-storage-layout.md) §16／§18。生产写入、删库、迁移、部署另需授权；服务健康、push 成功和内容实际可用是不同证据。
- 保留用户／其它会话改动，不整体 reset/clean、不批量归一换行。commit、push 分别需明确授权；推送 GitHub 使用 remote `github`，不是 Gitea `origin`。遇本机 Git HTTP/2 reset，可单次 `git -c http.version=HTTP/1.1 …`，不改全局策略。不提交秘密、profile、缓存、临时截图或运行数据。

## 5. 常用命令与分级验证

以下在仓库根执行，是入口索引，**不是整批测试／部署授权**。先审 I/O、依赖与隔离要求，显式选 lane，重任务串行，禁止 `verify_*` 通配。

```bash
python -m http.server 8321 --directory web
node tools/editor_server.mjs --serve --port 8322
node tools/dev_editor.mjs --port 8443 --store <独立状态目录>
# 仅壳／空态检查可追加 --no-library；不能据此验真实源复制／发布
npm --prefix editor-ui ci --ignore-scripts
node editor-ui/build.mjs
node editor-ui/build.mjs --check
# 仅编辑器开发工具，独立依赖；新 pi 会话须从 editor-ui 启动
npm ci --prefix editor-ui/lsp --ignore-scripts --no-audit --no-fund
npm run --prefix editor-ui/lsp check
node tools/build_trial_web_bundle.mjs
python -B tools/compile_content.py --output /path/to/new-generated
node tools/verify_pinned_source_registration.mjs
node --test tools/verify_copy_generals_manage.mjs
node --test tools/verify_copy_controller_copypage.mjs tools/verify_copy_controller_chapters.mjs tools/verify_copy_controller_cities.mjs tools/verify_copy_controller_generals.mjs tools/verify_copy_controller_modules.mjs tools/verify_editor_definition_controller.mjs tools/verify_editor_chapter_people.mjs
node --test tools/verify_copy_chapter_ops.mjs tools/verify_copy_single_slot.mjs tools/verify_copy_validate_gate.mjs
node tools/verify_publish_controller_slot.mjs
node tools/verify_review_controller_queue.mjs
node tools/verify_game_purge.mjs
node tools/verify_editor_schema_sources.mjs
node --check <变更JS或MJS>
git diff --check
# 只读线上核对；不是部署或改生产数据
curl -s https://dragon-editor.720108.xyz/api/health
curl -s https://dragon.720108.xyz/play-api/v1/registry
# 仅构建隔离静态产物；不上传／切换生产
sh vps/manual-static-build.sh /path/to/new-out
```

- 规则改动按范围选内容、slot-phase、battle、formation、road-authority、save 等现有安全回归；共享调度／RNG／存档／跨模块状态须完整适用回归。Python 用 `-B` 与 UTF-8 日志，编译写新目录。
- UI 用全新 Playwright profile，核 console／pageerror／请求错误、实际保存重读与可用源流程；需要模块时可指定已有 `PLAYWRIGHT_MODULE`，不擅自装依赖。合成 fixture、真实服务与生产验证必须分开报告。
- 存档另测真实 JSON、事务失败、跨窗口 CAS；公开版本／目录／删除可复用 `verify_publication_chain_browser.mjs`，程序归档用 `verify_program_entry.mjs`／`verify_program_assets.mjs`，按入口文档选参数，不能把进程内桥当生产 TCP／TLS。
- **交付检查**：核实际 diff；支持文件主动 `lens_diagnostics source=lsp scope=paths`，并跑 `mode=all`。空缓存、push-only、超时／inconclusive 不算 clean，编译成功不替代 Vue LSP。未跑／失败／覆盖不足如实列明，不拼接过期成绩。
- 纯文档只核职责、事实依据、链接／锚点与 diff，不跑无关游戏回归；保留外部引用的 journal 锚点或归档索引。Jev 仅开发期 advisory，非证据／oracle／放行门，纯文档无需调用；使用边界见[集成文档](docs/jev-integration.md)。
