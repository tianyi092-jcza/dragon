# AGENTS.md — 臥龍傳 Web 项目记忆

> 这里只维护长期事实、架构、命令、约定和当前主线；先读[全局约定](../AGENTS.md)。本轮进展、失败与待办放[checkpoint journal](docs/checkpoint-journal.md)，版本沿革见[CHANGELOG](CHANGELOG.md)。文档或历史测试不能替代原始机制证据、当前验证或用户授权。

## 1. 边界与当前主线

- 原生 JavaScript ES Modules＋Canvas 2D 重写1995 DOS《臥龍傳》，玩家／Trial引擎及共同核心无模拟器、框架、npm运行时依赖；完整`web/`可直接静态服务，部署打包另有工具。互联网编辑器展示层是用户批准的独立例外：`editor-ui/`采用Vue 3＋Element Plus与独立构建，生成资源仅由编辑器同源提供，不进入游戏引擎，见[框架壳边界](docs/editor-framework-shell.md)。
- 仓库`E:/Dragon/web-port`；原程序`E:/Dragon/Dragon/`，官方基准`E:/Dragon/原版/`，改版库`上/中/下/后/`。自动化禁止访问真实`SAVE.DAT`、用户存档/profile；只用内存、mock或新隔离profile。
- 软件版本以`VERSION`为准，规则基线`web-0.1.1`；游戏正式版本`1.n`与软件版本、source修订、程序摘要相互独立。
- fresh／restore走v2原生道路与固定表，生产v1路径已退役；未知消费点fail-closed，保已提交前缀、hold和禁存。不凭现代码、体验或测试补公式，不宣称完整战役已经认证。
- 当前主线：**工作台统一发布＋游戏级存储**。软件版本 **`0.1.11`** 已发 Release 并上生产（**生产在 `sadcloud`（`ssh sadcloud`，82.158.91.231:7218，4C/3.9G/50G，2026-11-09 起；instabox sandbox 已退役**）：编辑器镜像 `20261109-b6-disk12`、玩家镜像 `dragon-player:20261109-b6-disk`；static release digest `b5674f4b…`／sourceTree `91defffe…` 与玩家站一致；**不依赖 R2，也不经 Cloudflare Tunnel**：两个域名 A 记录直指源站、灰云（DNS only），TLS 由机器上的 nginx（443 `ssl_preread` 按 SNI → `8443`）+ Let's Encrypt 证书终止）；游戏存储方案 B 的 A/B/C 三批已上线：上架并行写游戏级在架指针 `control/directory.json`，读者只按指针出目录，删除 = 库行 purge + 指针移除 + `artifacts/<gameId>/` 前缀回收 + 编辑器私有位元組 `private/<gameId>/` 回收（ui15 补全；不回收时每个游戏留 49 檔／46 MB）。生产上「复制→全面检验→上架→管理员同意→玩家端加载游玩→删旧产物」已跑通。发布协议为 **A 路線（同步发布）**：上架／同意在同一请求内把分发推到可见（`EDITOR_SYNC_PUBLISH=0` 即回旧协议），并新增审计日志 `game_releases` 与管理员「发布历史」面板（`GET /api/admin/games/<id>/releases`）。上架端到端 190–205 s，**前端不再依赖那一次长连接**：POST 只发一次＋每 5 s 轮询 `GET /api/games/<id>/publish-operations/<key>`，先到者胜，超时只报「结果未知」不清追踪键。
- **已上线能力（2026-11-09，细节见 [journal](docs/checkpoint-journal.md)）**：②「檢驗」结果落库（`content_game_validations`，绑定 `draft_revision`＋`source_digest`；schema **55 表／53 索引／369 列／4 FK**），上架硬门是「同修订 passed」，否则 `409 PUBLISH_VALIDATION_REQUIRED`；③檢驗四層（章節／武將／據點／固定槽）改逐层请求、在同一个遮罩里逐項 ✓/✗ 并列出红字原因；④上架申請 ①–⑥ 為服務端逐步进度（`GET /api/games/<id>/publish-operations/<key>/progress`）；城池據點页＝游戏级表格（名稱 1–12 字且遊戲內唯一、最大生產力／類型可改；槽位與座標凍結不顯示；暫無刪除）。
- **玩家站与编辑器必须用同一份 static release（digest 锁步）**：两端现在跑在同一台 VPS——编辑器 `dragon-editor-1`（`127.0.0.1:8788`）＋玩家 `dragon-player-1`（`127.0.0.1:8789`，同一份 `reader/*.js` 跑在 Node 上），静态产物挂 `/srv/dragon/dist`（1442 档，现行 digest `b5674f4b…`；换 digest 时必须同步改 `publication.env` 三个 pin 与 nginx 的 `deployment-assets/static-v1/<digest>/`），程序归档在磁盘桶 `artifacts/programs/<digest>/` 与 `control/programs/<digest>.json`。`web/` 一变就换 digest，而 `reader/programentry.js` 只为 `?formalGame=` 正式入口选程序（`mode` 只接受 `new`／`load`），未登记就 503「目前無法取得一致的遊戲程式」（普通首页走静态资源，不受影响）。重建静态产物用 `vps/manual-static-build.sh`（内部固定 `git -c core.autocrlf=false archive`）；现行生产布局、部署配方与上线核对见 [game-storage-layout](docs/game-storage-layout.md) §16。软件版本、玩家站 digest、程序归档摘要三者相互独立，必须分别核对。
- 剩余：下线 7 张 `content_distribution_*` 与退役流程（前置＝生产实测一次 20 章上架耗时，已有 212 s 数据）、通用系统审计未立项；上架回执已改轮询（不依赖单次长连接），不必再修「超时上报失败」。维护源：[存储布局](docs/game-storage-layout.md)（§16 为现行生产）、[R2接线](docs/r2-player-connection.md)（历史 CF/R2 形态）、[VPS就绪](docs/vps-editor-readiness.md)；本轮修改、提交／部署状态与阻塞只记 [checkpoint journal](docs/checkpoint-journal.md)，不在此复制。
- 优先最小修改、复用现有验证，不堆框架或辅助测试。保留他人改动；commit／push分别需明确授权，推送显式使用GitHub `github`，不误推Gitea `origin`。不提交秘密、缓存、临时报告、截图或本地运行数据。**本机对 `github.com:443` 的 git HTTP/2 通道常被重置**（`OpenSSL SSL_read: Connection was reset`／`Failed to connect`），而 `curl`／`gh api`／`ls-remote` 同一时刻可能正常；推送与拉取用 `git -c http.version=HTTP/1.1 push github <ref>` 即通，不必改全局配置。本机还设了 `HTTP(S)_PROXY`／`ALL_PROXY=http://127.0.0.1:10808`：`git` 走代理、`ssh`／`scp` 不走代理（这是上面那条重置的环境原因），而 **`wrangler` 会被代理卡死**，调用前必须 `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy`。**VPS 部署不要从本机传大包**：2026-11-05 实测本机→VPS 上行跌到 ≈16 KB/s，改用服务器侧 `git fetch --depth 1` 取 GitHub（服务器到 GitHub 快且可 hash 校验），配方见 [game-storage-layout](docs/game-storage-layout.md) §15。

## 2. 架构与数据流

`原版非存档资料 → 离线导入 → 编辑源 → 校验／编译 → Scenario副本 → 保存守卫／快照 → IndexedDB`

| 模块（游戏路径相对`web/src/`） | 职责 |
| --- | --- |
| `main.js`、`app/startflow.js`、`app/battleflow.js` | App装配，新局／恢复共用加载器，战斗接续 |
| `content/`、`game/world.js`、`game/worldresources.js` | 内容身份、编译合同、每世界资源实例 |
| `game/navigation/`、`game/native*.js` | 原生道路／地形／占格／固定表；不是通用A*或Dijkstra替代品 |
| `game/ai.js`、`legionphase.js`、`legionscheduler.js`、`strategicfailure.js` | 逐槽规则、续段、失败暂停 |
| `game/clock.js`、`tacticalclock.js`、`battle/original*.js` | 战略／战术预算、Session、RNG、VM、结算 |
| `game/savegame.js`、`core/gamesavestore.js`、`saverepository.js` | 完整快照、IndexedDB事务、CAS及存档归属 |
| `render/`、`ui/`、`game/playerqueries.js` | 只读绘制、界面、消息FIFO与查询 |
| `player/` | 正式目录／准入／资源／存档／宿主；旧`reader/`客户端文件仅再导出 |
| 仓库`editor-ui/`、`server/public/` | Vue后台外壳及原生业务模块适配；不持有响应式游戏状态、不替代服务端权限 |
| 仓库`server/editorapp.js`、`vps/` | Node与workerd共用业务／鉴权；VPS SQLite、文件桶、发布CLI和drainer |
| 仓库`reader/site.js`、`vps/player-server.mjs` | 同源游戏API、程序归档资源与Static Assets路由；同一份 `reader/*.js` 由 `vps/player-server.mjs` 在 Node 上跑（workerd／`wrangler.jsonc` 为历史形态） |

- 世界384×256格、16px图块、192据点节点；128军团槽、22正常势力、24×24外交矩阵、256×4B事件轮；逻辑界面640×400。哨兵／别名／排除槽不能用数组长度泛化。
- `web/content/builtin/`编译20章；图集、布局、拓扑与规则地形分离，画道路不等于建通路。实际资源路径取世界定义，不硬编码旧`road_graph.json`。命名state字段为权威，未知字节不补零；解析纠错导入新目录，不手改生成物。
- IndexedDB为同源`wolong-web/saves`，目录与正文同事务；不是DOS存档或服务端API。恢复先回标题，detached校验／资源ready后安装，await后重核所属scenario／world／clock／票据。战斗、未完续段、装配或故障均禁存。
- 编辑器schema：**54表／52索引／106对象／361列／4FK，23个DDL源**（`d301c49` 起分发账本另有退休检查点／清理／入队闸门三表，已补冻结；`game_releases` 为 A 路線发布审计日志，每次上架一行，无 payload 无外键；见 checkpoint-journal §4.2／§4.30）。权威含`server/deletiondefinitions.js`、`deletionschema.js`、`distributiondeclarations.js`；旧22源生成器不再覆盖全量，不能直接覆盖当前冻结门。
- **单一 VPS 承载两端（2026-11-06 方案 B 上线，取代 CF Worker＋R2）**：`sadcloud` 上编辑器负责账户／草稿／私有Trial／编译／发布，玩家服务把 `reader/*.js` 跑在 Node 上；游戏字节放**磁盘桶** `/srv/dragon/bucket`（`vps/disk-bucket.mjs`，与 `vps/r2client.mjs` 逐方法同形：`etag` 用 R2 形状 `"<md5>"`、`last-modified` 取文件 mtime（收据 `visibleAt` 靠它）、content-type 落 `.meta/<key>`）。桶布局`kao/`（**621 张共享画像，其中 150 张数字档 0–149 供游戏按 byte 取用，`p####` 471 张供编辑器 portraitKey 挑选；全部必须 128×128**）、`artifacts/programs/<programDigest>/`（共享程序包）、`artifacts/<gameId>/…`（游戏级不可变发布字节）、`control/current.json`（冻结根）、`control/directory.json`（**游戏级在架指针：唯一与游戏相关的可写对象**）、`control/programs|roots|receipts/`。禁用户上传画像。游戏数据发布不经Git、不重启程序。
- 发布请求永久幂等，准确release／pin／冻结事件同事务；预上传不等于公开可见，远端根CAS与读回收据后才确认，未知响应不伪造回滚。删除栅栏不等于物理清理；真正删除＝库行purge＋在架指针移除该gameId＋按`artifacts/<gameId>/`前缀回收＋编辑器私有位元組`private/<gameId>/`前缀回收（`FileBucket.remove`，`installed/` 永不删），读者查不到即`410 GAME_DELETED`（墓碑与缺席等价，purge后不留墓碑）。
- `/play-api`交给游戏reader；`/program-assets/<digest>/…`交给登记／清单／SHA门；正式根页请求由当前部署选择程序壳，普通首页走ASSETS。程序选择不是用户提供的历史摘要；八季节图基址来自模块URL。游戏版本作废与软件归档身份是不同概念。

### 2.1 编辑器与统一地图的文档职责

任务匹配时先读[产品设计](docs/game-editor-design.md)、[工程合同](docs/game-editor-technical-design.md)、[迁移计划](docs/game-map-migration-plan.md)、[准入排查](docs/re-notes-editor-map-admission.md)及相关SKILL原证；[术语表](CONTEXT.md)不替代规则。[开发待办](docs/editor-dev-todo.md)和[需求矩阵](docs/editor-requirements-matrix.md)用于定位缺口，不自动授权实施。

基础模块详见[基础重构](docs/web-refactor-phase1.md)、[存档与地图分块](docs/web-refactor-phase2.md)、[内容架构](docs/content-architecture.md)、[表现合同](docs/presentation-modernization.md)。互联网编辑器不等于既有`editor.html`受限补丁工具；`saves.html`是本地存档管理／备份入口。

### 2.2 执行顺序与迁移准入

- 先确认共同合同，再迁移验证当前游戏，随后开发编辑器；M0基准→M1自动小地图→M2统一源／接线→M3真实修改样本。不分叉原图专用格式、校验豁免或第二套规则／AI。
- 原384×256／192据点证据不推广到任意拓扑、移动城市、空白章或扩容。G-MAP／G-ROAD／G-INIT／G-SLOTS／G-CAP按影响分别核验，局部未知只阻塞相关工作。
- 必须真实编辑组件、重新编译并走同一加载器；不得把原图截图包装成编辑成果。四层为基本地图→装饰→道路→据点；作者指定水陆路型，显隐／锁定不改规则。Scenario是规则地形唯一权威，显示不反写源或消费RNG。
- 自动小地图共用同一源与算法，河湖海／静态路网、遮挡与等比点击矩形遵循产品合同；不另设原图算法。验收覆盖实际修改、20章／季节、涉及战术入口、固定RNG、JSON恢复和迟到资源；视觉项由用户验收，局部通过不是全战役证明。

### 2.3 已确认的编辑器与多游戏边界

- **数据模型铁律（用户 2026-11-11 决定）**：城池據點／地图道路／武将／游戏章节都是**这一款游戏自己的共享数据**，只有一份。`sourceRef.kind`（`builtin-template`／`builtin-copy`）与 `copy_origins.profile_revision` 只是「数据由内置哪份源导入」的**来源标签**，不得据此断言「没有游戏级据点」「再有一份副本」；真正的副本只指**编辑期临时修订**（加载当前共享数据→修改→保存延伸修订号→发布审核通过后成为现行版本，旧修订不再加载）。據點父表＝名称、坐标（地图管理写回）、最大生产力、类型＋给新章的默认值（当前生产力／上升值／防灾值／城兵，一次性从该游戏第一章取回，缺失允许自填）；章节子表可改所属势力＋那四项，名称／最大生产力／类型只读关联父表；内政官不在章节设置。编译发布时父表＋子表物化成原版二进制形状，运行时与存档格式不变。详见 `docs/editor-city-definitions.md` §0。
- 内置游戏始终可用，管理员也不能经编辑器修改／下架／删除；独立完整复制不含对局／存档。普通新建仅复制地图／道路／中立据点，不复制人物／势力／章节；复制固定修订，不追踪模板更新。副本不改原件或共享资源。
- 作者仅编辑／发布自己的内容；管理员全局上下架、限制及删除，但不能替他人编辑／发布。停用账户不自动下架。编辑器桌面繁体界面，不转换用户文本，允许常规保存／取消／关闭；玩家界面仍遵循游戏交互。
- 内置／正式自建／Trial共享源合同、编译及规则／AI／地图引擎，稳定实体ID与原运行槽分开。VPS／Cloudflare两端分别验证；引擎版本不同步时不开放新Trial／发布，不热换运行数据。
- 草稿可不完整；试玩／发布必须验证所需依赖，发布绑定精确已保存修订，陈旧写入拒绝。发布与上架分离；版本`1.0、1.1…1.10`按整数序号递增，不回滚／复用。公开公告历史不授历史游戏准入。
- **新版上线，旧游戏版本全部作废**：已确认更新的旧对局停止且禁存；旧档提示不能加载并自动清除，新版保存与同游戏旧档清除同事务，失败不先删旧档。同版其它槽／其它游戏保留；缺身份、损坏、网络失败、下架、删除不能冒充版本更新。仅下架且未更新的会话可继续。整游戏被删后玩家端弹繁体告知「該遊戲已刪除！」，只有一个「確認」按钮、右键无效（阻塞项），确认即无条件清除本机该游戏进度并回跳开局选择页；触发面包括开局加载与运行期换章，判定一律以 reader 的 `410 GAME_DELETED` 为准。旧「是否刪除？」问句与「取消／右键保留」政策已撤销。
- Trial固定已保存、校验过的草稿快照，仅窗口内存，不读写正式存档／回写草稿／发布；可选完整章但不能跳过共享依赖。断网暂停，认证明确失效终止，重新登录须新开Trial；新窗口不等于安全隔离。

## 3. 当前Web产品约定

- 无关闭按钮、羽扇唯一开关、右键逐层回退、地图锁／行军目标指示例外、强制多步右键无效，按[全局约定](../AGENTS.md)及[军师UI技能](../.agents/skills/re-ui-advisor-menu/SKILL.md)。菜单／模态／场景／战斗／鼠标hold取并集，不用速度档模拟暂停；地图鼠标移动暂停，静止1秒释放自己的hold。
- 新局／标题读档后默认展开军师条、势力信息、小地图，未选子项不额外锁图。列表右侧滚动条、24px表头、选中`#4a7828`；排序绑定原对象。
- 标题只用一个游戏下拉框，默认「臥龍傳·三國制霸之計（內置）」（**繁体**），自建显示名称／版本，公告入口保留；远端目录失败不阻断内置游戏。标题页入口布局：「通知」文字＋游戏下拉框在顶部居中；右上是 `intro/scene.html` 的三颗圆钮（声音／重播／跳过，40×40，右侧 20px，top 20／70／120），本机存档入口是它们下面的第四颗圆钮（带「!」，top 170px，悬停／聚焦才出文字「不可用存檔」）；左侧竖排副标题已取消（节点与淡入时序保留，菜单放出时机不变）。游戏内弹窗统一用原版云纹金框：云纹/金框素材在 `web/grf/ui/{cloud,frame_sq,frame_col,frame_cap}.png`，共用绘制在 `web/src/player/cloudframe.js`（16px 格、上下 `frame_sq` 逐 8px、左右 `frame_cap`+`frame_col`、内部 32×32 平铺）。本机存档弹窗与章节选择窗同尺寸（448×368）、打开即自动检查、无重查按钮；点「新游戏」后在章节窗上方显示上一页选中的游戏名（同宽 464、距页顶 40px、同云纹，`startmenu.js#_gameNameBanner`）。姓名／字号确认后加载期间保持只读可见并提示等待，不伪造进度百分比，见[开场合同](docs/opening-scene.md)。
- 上架管理面板的「上架」按钮禁用与**校验结果无关**：`blocked = Boolean(pending) || badJournal`（`server/public/publish.txt`），`pending` 是从 sessionStorage 恢复的上次上架追踪，结果未确认前一直禁着；`check()` 只查章节引用（`GET /api/games/<id>/draft/chapter-references`），通过只说明引用完整，**不等于编译或发布通过**。面板必须把禁用原因写出来（`blockedReason`／按钮 `title`）：pending 时引导先「查詢原操作」再「只停止本機追蹤」，不得建议盲清重发。
- 编辑器后台（Vue 例外）：「系統資源」是**只读内置资源浏览**，头像类目同时包含共享画像库 621 张（`/api/resources` 在钉死的 available-library roles 后追加 `GamePortraits` 中未收录的 `kao/<id>.png`，字节走 `readSharedPortrait`＋sha256）；分类 TAB 与筛选框同一行（筛选靠右）；头像用相册卡片（序号＋头像一行，路径与文件大小在下一行）。**不要为此重算 `available-library.txt` 或 static pin**。
- 战略Clock（用户指定的Web产品决定）：五档6.5／5.0／4.8／1.8／1.0ms，每RAF最多16更新；60Hz预算上限约960更新/秒，高刷上限1000，实际受负载／hold影响。变速保留子步相位、每步查hold、不补后台债务；玩家与Trial共用，战术独立。原证与现代差异见[战略时序](docs/re-notes-strategic-time.md)。
- 军团按`8×movePeriod`插值，六队全骑周期2、其余3；城／军团中心`(16x+8,16y+8)`，不按道路视觉补偿。段内X优先定向，段末用权威方向／驻守帧；只读绘制。接战按原+03相位显示、原生道路到期且count>1时请求声音；无固定墙钟节拍或共享五响上限，不补播。详见[行军表现](docs/march-presentation-fixes.md)、[锚点原证](docs/re-notes-map-marker-anchor.md)。
- CITY-4064-WEB-1是明确批准的Web差异：四候选且随机低两位0时选第4项、不额外耗RNG，不模拟未知动态外栈；其它规则不放宽，见[原证边界](docs/re-notes-march-pathfinding.md#3156-p394064-外栈读取闭合为永久工程边界)。
- 云雨原八帧PNG由32槽timer／dirty及显式2533准备驱动，位置按战略serial／对象interval插值；无独立100ms节拍，hold冻结。季节按换季月前16日渐变，月结消息返回前不推进day1／季节／对象准备。Canvas仅尺寸／DPR变时重建，绘制只读；细节见[表现合同](docs/presentation-modernization.md)和[战略时序](docs/re-notes-strategic-time.md)。
- 自定军师无普通任官／编成／自动出征资格；统一后留在地图、不播D7END，信赖归零／灭亡仍GAME OVER。音效CF9的TYPE1→4→关闭只控制既有音乐逻辑，OFF不禁PC/FM效果；战术对白不暂停Session，姓名独占首行、正文按宽折行，见[战术生命周期](docs/re-notes-tactical-lifecycle.md)。

## 4. 重要坑点与证据入口

- `OriginalBattleRng`启动RTC播种一次，新局／标题不重播种，恢复与战术回写共用同一RNG；不以Math.random兜底。每更新1据点／16军团，槽动作→日结→03尾→余槽／天气；退出仍保已提交前缀，不能重播消息／随机消费。
- native表唯一持有记录，live／delayed是同对象视图；0B／1E零值、独立03、F14、inactive槽有语义。`_march`不覆盖0A／0C／0E残值，地址≠节点ID，CF1不一律无路，未知RAM不补零。地图对象前16灾害／后16云不压缩槽号。
- 六队原值、战前BP和双方战果写回顺序不能简化；撤退不传送，命令／战争关系／势力目标分开，委任不覆盖玩家未完成目标。见[行军](../.agents/skills/re-march-engagement/SKILL.md)、[战斗](../.agents/skills/re-battle-command/SKILL.md)、[战后](../.agents/skills/re-post-battle/SKILL.md)、[外交](../.agents/skills/re-domestic-diplomacy/SKILL.md)及[消息ABI](docs/re-notes-strategic-message-abi.md)。
- 恢复贯穿road／movement／terrain／cityCache能力，不重新合成掩盖缺失。真实JSON会丢undefined／将非有限数变null，structuredClone不能替代往返测试；内部十人单位≠显示人数，MMAP索引0不必透明，见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- Trial的旧roadgraph门面恒null，查询用`scenarioNativeRoadContext`。链路为issue／commit→`/api/trial/web/?trial=<uuid>`→束内`servertrialapp.js`；cookie Path=/api。POST分发必须在调用方或被调用方守权限，不能无条件漏门。等待真实画布尺寸再做浏览器操作。
- schema变更同步冻结声明／UNIQUE投影／所有计数及受影响lane，不能只改期望值祝福旧结果。全局分发payload／在途／备份引用未闭合时，非空账本删除inventory应拒绝，不能只过滤game_id假装完整清理。
- **工作台阻塞与文案约定**：阻塞只在「当前动作」上表达（先确认→遮罩写明正在做什么→分步状态→完成自动关闭）；等待说「在做什么」、结束说「做成了什么」、失败说「发生了什么＋能做什么＋怎么回报」，面向用户的句子不贴原键／gameId；不得用定时器假装百分比（要么真实计数，要么只说步骤）。每个请求必须有上限（只读60s／写600s），`run()`的`finally`先解锁再渲染，单面板渲染异常不得扩散。
- **生产数据清理坑**：`publication-data/private-objects/installed` 是「已安装底层资源」字节，不是孤儿blob；删了它复制会在`loadFull`读源时必失败（reserve只查SQLite，所以预约仍成功）。清空前先看备份体积（有字节约256M，清空后只剩几百K）。R2操作习惯：`r2client.list(prefix,maxKeys)`返回key字符串数组（无分页token），`get` 404返回null；容器rootfs只读使`docker cp`不可用，查库走`docker run --rm -v …/publication-data:/data:ro node:22-bookworm-slim node /q.cjs`。
- S3 SigV4保留空canonical query行；桶私有、凭据仓库外env。源章ID含`#`时R2保字面key、HTTP只编码一次。固定库消费者指纹改变需审差异／新身份，不覆写旧注册表或放宽SHA；画像索引硬编码与库指纹须共同核查。
- 按`.gitattributes`保持字节；Windows工作树与云Git检出清单可能因换行不同，先核Git blob及明确eol例外，不能改预期hash掩盖差异。`git status`标M不必有真实差异，不批量reset／renormalize。**用`git archive HEAD <path> | tar -xO | sha256sum`做落地字节校验**（`web/index.html`、`web/src/content/authoring/gamesource.js`、`web/src/game/navigation/originalroadarrival.js`是`eol=crlf`，裸blob sha会假失败）；Windows工作树直接跑`prepare_deploy`会得到错digest，必须用`git -c core.autocrlf=false -c core.eol=lf worktree add --detach`的LF检出；而且`core.autocrlf=true`时**`git archive`本身也会**给未声明`eol`的文本文件补CRLF（2026-11-06实测45个文件、+0.43MiB，`content/builtin/chapters/*.json`每行+1字节），但`sourceTreeDigest`不变（只覆盖显式`eol=lf`的`web/src/**.js`与`web/intro/styles.css`）→ 表现为「digest对上了、inventory sha对不上」（`f1582a85…` vs `72ec1c31…`）。归档一律用`git -c core.autocrlf=false archive`（`vps/manual-static-build.sh`已内置），判据是`dist/static-release.json`的sha256等于线上同名文件。
- **部署锁步的四个坑**（配方见[存储布局](docs/game-storage-layout.md)§15）：①**pin与镜像必须同源**——`vps/publication-main.mjs`开机前用`verifyInstalledProgram`比对镜像内`web/`＋`trialweb.txt`与`STATIC_SOURCE_SHA256`，只改`publication.env`不重建镜像会`startup-failed`崩溃循环；②**R2程序登记可能被静默跳过**——归档传输错误只判`unreachable`，服务照常起、日志只有`started`＋`distribution-idle`，要在容器内查`control/programs/<digest>.json`，缺了就再重启一次（幂等）；③**nginx在容器里**——`docker exec nginx nginx -t|nginx -s reload`，复制`location`块要按花括号深度取块尾（块内有嵌套`types {}`）；④**顺序不可颠倒**——镜像内`VERIFY_OK`→切`app`＋`.env`→**最后**改`publication.env`三处pin→recreate；先改pin再跑`backup-publication.sh`会让它结尾的`compose up -d`用**旧镜像**重建，旧`web/`对新`STATIC_SOURCE_SHA256`→`startup-failed`循环（2026-11-06实测不可用约28分钟）。玩家端每次`web/`变更都会换digest，未锁步就会开局503，所以UI改动可攒一批再一次性部署，不要每次push都重启生产；新digest首启要~23分钟（R2无该digest时要先下载1441文件核sha再上传），已有同digest时7分钟。
- **方案 B 迁移的三个坑（2026-11-06 实锤，细节见 journal §1.2）**：①玩家端唯讀綁定必须是 Workers 绑定形状 `{ size, httpMetadata.contentType, body: ReadableStream }`——`reader/programarchive.js` 用 `body.getReader()` 分块读、用 `httpMetadata.contentType` 逐字比对，只给 `{ size, arrayBuffer() }` 会让 `/program-assets/*` 全部 **503 `PROGRAM_ASSET_UNAVAILABLE`**（不是 404），`tools/verify_disk_bucket.mjs` 第 8 条已锁定；②Debian 的 `/etc/nginx/mime.types` 缺 `flac/wav/mid` → `vps/static-client.mjs` 的 `STATIC_CONTENT_TYPE` 失败，必须补；③`/program-assets/<digest>/` 的 digest 是**程序包 digest**（`control/programs/<digest>.json`），`static-release.json` 是 manifest 不是 asset（走该路由必 404，正常），`?formalGame=` 的 `mode` 只接受 `new`／`load`。
- **（历史，2026-11-06 已迁出 CF）Cloudflare 边缘会静默切断百秒级响应**：上架端到端 190–205 s，`client.txt` 与 nginx 都是 600 s、连接能活到 190 s 以上，却常在响应前被丢（`Premature close`，nginx 记 `499`）而服务端事务已提交；非 Enterprise 的 100 s 上限不可调。结论：延长超时无解，客户端只能「写请求只发一次＋轮询幂等查询端点」，后台长任务同理。
- Workers单文件25MiB限制：静态部署排除大型创作源`game-source.json`，保留运行资产；使用显式构建，不依赖custom build hook的跨版本行为。BGM为软件OPL3输出，不是实机录音；版权／分发边界见[README](README.md)。
- 重lane的代理502／DO stub失败与产品500分开排查，不凭无日志认定产品错误；测试门闩支持多个waiter，重叠put不能覆盖首个release。可复核补丁见`docs/fixture-patches/`。证据inputs／imports双桶都需固定hash，失败轮保留，不覆盖已封存scope。
- 原证索引：[AI全链](docs/re-notes-ai-chain.md)、[行军](docs/re-notes-march-pathfinding.md)、[武将去向](docs/re-notes-legion-fate.md)、[财政](docs/re-notes-ai-fiscal.md)、[外交](docs/re-notes-ai-diplomacy.md)。

## 5. 常用命令与验证

仓库根执行，先审I/O与依赖；以下是入口索引，不是整批运行或部署授权。工作台菜单与模块职责见[编辑器工作台结构](docs/editor-workbench-structure.md)、基础资料与章节属性归属见[城池据点与章节属性](docs/chapter-and-base-resources.md)。详细专项命令／范围见[R2接线](docs/r2-player-connection.md)、[VPS就绪](docs/vps-editor-readiness.md)和[部署指南](docs/deployment.md)，不在长期记忆复制逐批成绩。

```bash
python -m http.server 8321 --directory web
node tools/editor_server.mjs --serve --port 8322
node tools/dev_editor.mjs  # 本地开发服务：同上服务端跑 Node SQLite／文件桶，改源码自动重建重启
node tools/verify_pinned_source_registration.mjs  # 固定源启动登记（空库开箱可建游戏）
python -B tools/compile_content.py --output /path/to/new-generated
node tools/build_trial_web_bundle.mjs  # 修改web/src后重建，并核两壳／库指纹
vps/manual-static-build.sh /path/to/out  # 重建静态产物：dist/（LF），末行印出 static-release.json 的 sha256
# 改了 web/ 或编辑器二进制：先重算静态发布并把三个 pin 与 nginx 的 static-v1/<digest>/ 路径一起换，再起容器：
#   rsync -a --delete <out>/dist/ /srv/dragon/dist/；改 publication.env 的 STATIC_RELEASE_SHA256／STATIC_SOURCE_SHA256／STATIC_PATH_PREFIX；改 /etc/nginx/sites-available/dragon-editor.conf 的同一 digest；nginx -t && systemctl reload nginx
ssh sadcloud 'cd /srv/dragon/src && git fetch -q origin main && git reset -q --hard origin/main'  # 生产取源（服务器到 GitHub 快且可校验）
ssh sadcloud 'cd /srv/dragon && docker build -f src/vps/Dockerfile.publication -t dragon-editor-publication:<tag> src'  # 编辑器镜像
ssh sadcloud 'cd /srv/dragon && docker build -f src/vps/Dockerfile.player -t dragon-player:<tag> src'  # 玩家镜像
ssh sadcloud 'cd /srv/dragon && docker compose up -d --force-recreate editor'  # 先改 *.env 的 *_DEPLOYMENT_ID；compose 用环境变量插值，即使只起 editor 也要同时给 EDITOR_DEPLOYMENT_ID 与 PLAYER_DEPLOYMENT_ID
curl -s https://dragon-editor.720108.xyz/api/health  # 期望 200 + initialized:true
curl -s https://dragon.720108.xyz/play-api/v1/registry  # 玩家端目录（generation／directory）
node tools/verify_start_flow.mjs
node tools/verify_clock_transition.mjs
node tools/verify_march_navigation.mjs
node --test tools/verify_native_road_movement.mjs
npm --prefix editor-ui ci --ignore-scripts  # 仅修改后台展示层时安装固定构建依赖
npm --prefix editor-ui run build           # 只生成编辑器壳，不部署
npm --prefix editor-ui run check           # 重建逐字节比对生成物
node tools/verify_editor_workbench_browser.mjs
node tools/verify_editor_schema_sources.mjs
node tools/verify_player_site.mjs
node tools/verify_reader.mjs
node tools/verify_game_save_store.mjs
node tools/verify_player_restore_browser.mjs
node tools/verify_formal_app_browser.mjs
node tools/verify_trial_app_boot.mjs <新整数轮次>
node tools/verify_publication_main.mjs
node tools/verify_directory_pointer.mjs        # 指针整形/CAS/幂等/根先于指针语义
node tools/verify_reader_directory_pointer.mjs # 读者按指针出目录，与旧投影逐字等价
node tools/verify_game_purge.mjs               # 31表逐表0行复查
node tools/verify_game_purge_reclaim.mjs       # 指针移除+artifacts前缀回收+私有位元組回收
node tools/verify_copy_tracking.mjs            # 复制一次跑到完成/档案数进度/失败可见
node tools/verify_copy_abandon.mjs             # 失败不留下名称与数据
node tools/verify_vps_linux.mjs  # 非root Linux、原生临时文件系统、Node>=22.13
node --check <变更JS或MJS>
git diff --check
```

- 内容／规则改动按范围跑pipeline、catalog、world、slot-phase／battle、formation、road-authority等现有入口；共享调度／RNG／存档／跨模块状态改动须完整安全回归。Python禁优化，使用`-B`和UTF-8日志；编译输出用新隔离目录。
- UI用全新浏览器profile核流程和console/page/request错误；保存另测守卫、真实JSON、事务失败及跨窗口CAS。已有Playwright可显式传`PLAYWRIGHT_MODULE`，不擅自安装依赖。完整EOF后的CDP失败只能逐请求严格关联，不泛化忽略。
- 公开发布联合链使用`verify_publication_chain_browser.mjs`的`--node-service --management-ui --deletion-ui --admin-deletion-ui --player-client --player-app --public-player`，程序路径另加`--program-paths`（重入口600秒）。按当前版本唯一政策核旧票拒绝、旧局禁存、空槽新版保存原子清旧及仅同版下架续玩；验证范围见R2§2.72，进程内运输桥不等于生产TCP／TLS／云或物理清理。
- 程序资源验证复用`verify_program_entry.mjs`／`verify_program_assets.mjs`及各自`--workerd`；静态整包用`verify_static_release_package.mjs --archive --archive-read`，只能操作自有包，不覆盖共享dist。真桶测试限定自有`test/`前缀并清理；生产数据写入另依授权执行。
- 每次交付核实际diff、支持文件主动LSP及`lens_diagnostics mode=all`；空缓存／push-only／inconclusive不算clean。纯文档核职责、链接／锚点及元数据，不跑无关游戏回归；保留被引用的journal锚点或提供归档索引。
- 验证先固定显式入口／依赖／源码SHA与I/O白名单，串行跑重入口，禁止`verify_*`通配。仅关闭自有监听／profile，子进程用必要环境白名单；改动后重新核证据，不拼接过期成绩。
- Workers构建目标`main`、根`/`：构建`node tools/prepare_deploy.mjs`。**玩家端已改手动发布**（Git集成的自动构建已断开）：在LF环境下 `vps/manual-static-build.sh <out>` 产出`dist/`与`wrangler.deploy.jsonc`（已去掉`build.command`、路径为绝对值），再`env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy npx wrangler deploy -c <out>/wrangler.deploy.jsonc`；内容相同时约14秒且`No updated asset files to upload`，重复发布幂等。不要用仓库`wrangler.jsonc`直接deploy（那会重跑build并得到非LF产物）。只有明确授权才commit／`git push github HEAD:main`；推送成功、构建成功、运行数据可用是三项不同证据。

### Jev开发期辅助（非运行时依赖）

仅advisory，不是机制证据、测试oracle或放行门。多风险域改动用`change`，诊断仍有多种归因用`failure`，原证调查方向未定用`reverse-triage`；纯文档和明确语法问题无需调用。先人工最小摘要、离线preview审state，再检查key并`--send`；禁发秘密、真实存档、原资源、个人信息或未审日志。失败／地区限制不绕过、不阻塞权威验证。命令`node tools/jev_assess.mjs <change|failure|reverse-triage> --input -`，详见[集成文档](docs/jev-integration.md)。
