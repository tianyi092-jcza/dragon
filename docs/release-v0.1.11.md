# v0.1.11 发布审阅

> 范围事实取自 `git diff v0.1.10 v0.1.11`（`c5de53d..HEAD`）。验证分「本次复跑」与「本次未重跑、沿用上一轮记录」两类，
> 未重跑的链路不冒充通过；既有红照抄、不当成本版引入。

## 版本范围

`v0.1.10`（`c5de53d`，2026-11-04）→ `v0.1.11`：**6 个提交、51 个文件（+2801 / −1720），其中 4 个新文件**。
主题只有一条主线：**发布协议选 A 路线（同步发布）**，配套发布审计日志与「发布历史」面板；不改游戏内容、不改玩家端字节。

| 组 | 内容 | 代表提交 |
|---|---|---|
| 同步发布（A 路线第一版） | `server/editorapp.js` 注入 `distributionDrain`，上架／同意在同一请求内把分发推进到可见（一步一代次、上限 8 步／25 秒，抛错只降级 pending）；`EDITOR_SYNC_PUBLISH=0` 即回旧协议，drainer 并存一代 | `b8d62b0` |
| 发布日志 `game_releases` | 与业务写同一事务写 pending／confirmed 行，管理回执升 version 2 带 `releaseDigest`（v1 逐字节兼容）；纯 additive，7 张 `content_distribution_*` 与 drainer 未动 | `fbeeca0` |
| 发布历史面板（第 2 档） | `GET /api/admin/games/<id>/releases`（admin 门／内建 403／查询串 422），审核页每行行内展开版本／时间／分发状态／摘要，点击才加载 | `73fbdc6` |
| 提示文案与陈旧门 | 面向用户的句子里清掉「原鍵／pending／gameId」；`publish.txt`／`review.txt` 的裸 NUL 改回转义文本；三条自 ui4／ui5 起陈旧的浏览器门按现行契约重修 | `b8d62b0` |
| 记忆与计数 | `AGENTS.md`／`r2-player-connection.md` 的 schema 冻结计数同步到 54表／52索引／106对象／361列／4FK、索引投影 50；`checkpoint-journal` §4.24–§4.33 | `87a0b9e`、`fbeeca0`、本提交 |

## 纳入范围（按目录，共 51 个文件）

- **服务端（11）**：`server/editorapp.js`（`distributionDrain`／`#advanceDistribution`／`#getReleaseHistory`）、`server/distributionledger.js`（`game_releases` 表、`releaseVersionOf`、`enqueueInTxn`／`confirmInTxn` 写行、`operationStatus.releaseDigest`、只读 `releaseLog`）、`server/management.js`、`server/managementreceipt.js`（v1／v2）、`server/deletionfence.js`、`server/deletioninventory.js`、`server/distributiondeclarations.js`、`server/gamepurge.js`。
- **工作台模块（7 个 `.txt` = 浏览器原生 ES 模块）**：`server/public/publish.txt`（可选 `distribution` 键、`releaseDigest` 校验）、`review.txt`（发布历史动作 + 严格校验）、`client.txt`、`draft.txt`、`catalog.txt`、`library.txt`（文案与超时），以及重建产物 `server/public/shell-ui.txt`（698276 → 705343）与 `shell-ui.css`。
- **编辑器前端（4 个 `.vue` ＋ 2 个 `.js`）**：`editor-ui/src/ReviewPanel.vue`（行内发布历史）、`main.js`（`reviewModel.history`）、`PublishPanel.vue`／`BaseTerrainPanel.vue`／`ChapterRolesPanel.vue`／`CityDefinitionsPanel.vue`／`copy.js`（文案）。
- **测试与夹具（22 个 `.mjs`，3 新）**：新增 `tools/verify_publish_sync.mjs`（11 组）、`tools/verify_release_log.mjs`（11 组）、`tools/verify_release_history.mjs`（7 组）；同步计数与断言的既有 lane：`verify_distribution_schema`、`verify_editor_schema_sources`、`verify_frozen_publication_root`、`verify_publish_operations_root`、`verify_vps_editor_server`、`verify_publish_ui_model`、`verify_publication_ui_browser`、`verify_review_ui_model`／`_browser`、`verify_editor_workbench_browser`、`verify_editor_roles_browser`、`verify_workbench_produce_game_browser`，以及 3 个夹具（`distribution-ledger`、`distribution-schema`、`publication-browser-authority`）。
- **发布器（3）**：`vps/editor-server.mjs`、`vps/publication-server.mjs`（注入 `() => publisher.drainOne()`）、`vps/publication-config.mjs`（`EDITOR_SYNC_PUBLISH`，只降不升）。
- **必要文档（7）**：`AGENTS.md`、`CHANGELOG.md`、`VERSION`、`docs/checkpoint-journal.md`、`docs/game-storage-layout.md`（§14）、`docs/r2-player-connection.md`（计数）、`docs/release-v0.1.10.md`（上一版的补记）、`docs/deployment.md`（交叉链接）、本文件。

## 排除

- **本地代理／运行产物全程 gitignored，未进仓库**：`.dragon-analysis/` 会话收据与轮次截图（本次新增 4 轮 browser 运行目录）、`.pi/`、`.codegraph/`、`.playwright-cli/`、`.wrangler/`、`.dragon-runtime/`、根目录截图 `*.png`、`*.log`、`tools/*.log|*.txt`、`tmp_crop/`。`git status --ignored` 显示 156 条忽略项，本范围 51 个文件里没有一条属于此类。
- **凭据与 env**：`.env`／`.env.*`／`.dev.vars*` 均在 `.gitignore`；`PLAYER_ADMISSION_KEYS` 与 `publication.env` 只在运维本地。敏感值扫描命中的两处都不是秘密：`shell-ui.txt` 里的界面文案「變更密碼」、`tools/fixtures/publication-browser-authority.mjs` 里既有的受控测试口令（本范围只改了它的表数断言）。
- **生产备份包**（`publication-*`、`app-prev*`、nginx 备份）留在服务器，不进仓库。

## 验证

**本次实跑（2026-11-05）**

| 入口 | 结果 |
|---|---|
| `tools/verify_release_history.mjs`（新） | 7 组绿：空态精确形状、两版本 rowid 顺序与 5 个精确键、`publishedAt` 只在 confirmed、digest＝该代次 operation digest、`operationStatus().releaseDigest` 与历史首行一致、listing 不写行、admin 门（匿名 401／作者 403 无 body）、内建 403／非 uuid 404／查询串 422、重复 GET 不写列不推进代次 |
| `tools/verify_release_log.mjs`（新） | 11 组绿（自建 SQLite + 假回执；不是 R2 证据） |
| `tools/verify_publish_sync.mjs`（新） | 11 组绿（构造门、回滚态仍 pending、同步态 confirmed、重放零推进、推进抛错→200＋pending、同意上架形状不变、并发同键回执一致且 peak=1、并存态待确认代次仍被补齐） |
| `tools/verify_review_ui_model.mjs` | 11/11（+2 条发布历史） |
| `tools/verify_review_ui_browser.mjs` | 7/7（+1 条，真实浏览器；`unexpectedErrors:[]`、`outside:[]`、`failed:[]`） |
| `tools/verify_editor_workbench_browser.mjs` | 219（真实浏览器） |
| `tools/verify_publication_chain_browser.mjs` | 10（真实浏览器：登录→编译→R2 暂存→SQL 提交→丢回应→重载→目录与章节字节） |
| `tools/verify_workbench_produce_game_browser.mjs` | 7（真实浏览器：複製→上架→同意→玩家端取目录→删旧产物） |
| `tools/verify_frozen_publication_root.mjs` | 46 组（8 代次／20 章／721 私读） |
| `tools/verify_publish_operations_root.mjs` | 31 组（`schemaTables: 54`） |
| `tools/verify_publication_producer.mjs` | 25 组 |
| `tools/verify_vps_frozen_service.mjs` | 14 组 |
| `tools/verify_review_backend.mjs` | 6 组 |
| `tools/verify_editor_shell.mjs` | 92 |
| `tools/verify_distribution_schema.mjs` | 实际 54 表／52 索引／361 列，与冻结声明一致 |
| `tools/verify_editor_schema_sources.mjs` | 23 owners／54／52／361／4 FK |
| `editor-ui/build.mjs --check` | 通过（`shell-ui.js` 705343、`shell-ui.css` 54698） |
| `node --check` | 本范围 32 个 `.js`／`.mjs` 全部通过；`.vue`／`.txt` 由 `build.mjs` 与各自 lane 覆盖 |

**本次未重跑（沿用 §4.24–§4.31 记录，不冒充通过）**：`verify_copy_tracking` 8、`verify_copy_abandon` 14、`verify_editor_copy_modes` 5、`verify_publication_main` 93、`verify_publication_ui_browser` 7。

**既有红（HEAD 上就存在，非本版引入）**：`verify_first_online`、`verify_reader_distribution`、`verify_deletion_distribution`（＋`_workerd`）失败；
`verify_publish_ui_model` **9 pass / 7 fail**（本次复跑，与基线同名相同，7 条早于 B3 §6／B8 的产品变更）；`verify_editor_copy_controller`、`verify_editor_backend_admin_copy` 为既有红。
`verify_editor_backend_*_freeze` 等 8 条归档 round 门绑 `before.json` 源码哈希快照，**故意不回改**，需带轮次参数，不能直接跑。

**LSP**：改动文件中 5 条 ast-grep `nested-ternary-js` 提示都在 `server/editorapp.js` 范围外的新增行之前（727–731 行，既有代码）；
`server/public/review.txt` 无 LSP 服务、`editor-ui/src/main.js` 服务当时未就绪 → 记为**未确认**，不是 0 诊断。

## 生产状态

- **本版不部署**：代码 Release 不等于上线。生产仍是 `b8d62b0` 对应的镜像 `20261104-bc1-ui6`；`fbeeca0` 之后的 `game_releases` 表与发布历史面板**在生产上还不存在**，因此生产库查不到任何发布历史，面板上线后先显示空态——空态是预期，不是故障。
- 部署后请管理员在生产真实上架一次，并量出 20 章上架的端到端耗时（下线 7 张 `content_distribution_*` 的前置①）。
- 回滚：`EDITOR_SYNC_PUBLISH=0` 回旧发布协议（无 schema 变更，不必回滚数据）；整镜像回滚用 `app-prev13-<ts>`。

## 限制（不因发布而解除）

1. **7 张 `content_distribution_*` 与 drainer 仍在**。`content_distribution_chunks` 是崩溃一致性的唯一载体（payload 是累积 catalog、含 `firstOnline.generation` 自引用），远端头对账以 events 代次为锚，删表是不可回滚的单向操作；生产库已有真实数据。
2. **发布历史只覆盖 A 路线之后**，不回填旧版本；作者端看不到自己游戏的发布历史（那条权限是 admin 门，若开放应是另一条作者自查路由）。
3. **通用系统审计仍未立项**：`game_releases` 只覆盖发布，审核／删除／账号变更没有等价日志；`audit_events` 建议用这里的真实字段反推，不先设计。
4. **复制仍是同步长请求**（与发布协议无关），代理层约 100 秒上限的隐患仍在；改后台任务＋轮询是可选后续。
5. **上架面板三个按钮**（查詢原操作／以原鍵重試／只停止本機追蹤）是否删除仍待产品决定。
6. 生产端到端时长、真 R2 下的「上架即可见」仍只有本地证据。
