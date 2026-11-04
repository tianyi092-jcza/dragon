# v0.1.10 发布审阅

> **补记说明**：本文写于发布之后（`c5de53d` / tag `v0.1.10` 已在 2026-11-04 推送 `github`、打 Release 并部署生产），
> 用途是补齐 `CHANGELOG` 的版本沿革与审阅证据。范围事实取自 `git diff v0.1.9 v0.1.10`；
> 验证分「本次补记复跑」与「发布当时记录的证据」两类，未重跑的链路明确标注，不冒充通过。

## 版本范围

`v0.1.9`（`278dc1b`，2026-10-30）→ `v0.1.10`（`c5de53d`，2026-11-04）：**74 个提交、149 个文件（+22104 / −9195），其中 50 个新文件**。
按主题分为七组：

| 组 | 内容 | 代表提交 |
|---|---|---|
| 章節創作 | materialize 最小可用 → 新建章節 → 勢力＝君主＋必填首都 → 武将章节属性 → 职务先验后还原 → 序号重排 → 内政官（太守）开放；槽位降级为编码位、武将库承担身份与能力基准 | `bb283dc`…`fa0261a`、`0ecae2c`、`6369131`、`447400a` |
| 工作台结构 | B1–B8 三级菜单与上架状态机；複製遊戲独立成管理员模块；去重模块级标题；章節序号下拉与 op 分派表 | `2f87ec2`、`bf4abd9`、`ae8416f`、`e56856a`、`93209f0` |
| 游戏级存储（方案 B） | A 批：上架并行写 `control/directory.json`；B 批：读者只按指针出目录；C 批：删除＝库行 purge＋指针移除＋`artifacts/<gameId>/` 前缀回收 | `af21e37`、`e4bbca3`、`9e049fd` |
| 玩家端删除语义 | 查不到即 `410 GAME_DELETED`；繁體告知「該遊戲已刪除！」单一「確認」、右键无效、确认后清本机进度回开局选择页 | `e4bbca3`、`web/src/player/playerdeletedgame.js` |
| 工作台回馈与文案 | 复制一次跑到完成（无「續」、真实文件数进度）；进入即加载；提示「在做什么／做成了什么／失败怎么办」；每请求超时；上架阻塞遮罩＋分步 `phase` | `8edcaab`、`ceb03ad`、`aa795a8`、`c9eaf7a`、`c5de53d` |
| 验证门 | 两颗长期红门修绿；旧壳断言退役；分发账本六表冻结声明补齐（53 表／51 索引／356 列／4 FK）；Trial 包重建 | `d964efb`、`8bc0b7d`、`43a8670`、`45f5a78` |
| 部署链 | LF 源重建 Trial 包（修 Linux 启动失败）；静态发布 pin 与 nginx 维护闸门解除；玩家准入密钥配置；`request-slow`／`request-failed` 请求日志 | `8efcc99`、`d37831f`、`c5de53d` |

## 纳入范围（按目录）

- **工具与测试（35 改进 ＋ 5 夹具 ＋ 30 新增 lane）**：新增 `verify_chapter_*`（create／factions／generals／materialize／officers／reorder／attributes／references）、
  `verify_editor_general_library`、`verify_general_library`、`verify_editor_copy_modes`、`verify_copy_abandon`、`verify_copy_tracking`、
  `verify_copy_publish_parity`、`verify_game_purge`、`verify_game_purge_reclaim`、`verify_directory_pointer`、`verify_reader_directory_pointer`、
  `verify_review_backend`／`verify_review_ui_model`／`verify_review_ui_browser`、`verify_workbench_produce_game_browser`、
  `verify_editor_workbench_end_to_end`、`verify_editor_game_quota`、`verify_editor_chapter_*`、`verify_pinned_source_registration`、
  `verify_player_deleted_saves`／`verify_player_deleted_entry_browser`、`tools/build_chapter_base.mjs`、`tools/dev_editor.mjs`。
- **服务端（14 改进）**：`server/gamepurge.js`（新）、`server/admincopy.js`（abandon／租约清扫／`objects` 计数）、`server/distributionledger.js`、
  `server/distributiondeclarations.js`（六表冻结）、`server/deletiondefinitions.js`、`server/publicationproducer.js`（purge 后丢弃墓碑）、
  `server/copyprofile.js`、`server/copyobjects.js` 等。
- **发布器与读者（7 ＋ 1）**：`vps/directory-pointer.mjs`、`vps/game-reclaimer.mjs`、`vps/r2reachability.mjs`、`vps/register-pinned-source.mjs`（新）；
  `vps/distribution-publisher.mjs`、`vps/distribution-resources.mjs`、`vps/editor-server.mjs`、`vps/publication-server.mjs`（指针先于根、只在成对端口齐备时装配回收器）；`reader/directorypointer.js`（新）。
- **工作台前端（12 改进 ＋ 4 新面板）**：`editor-ui/src/CopyGamePanel.vue`、`ReviewPanel.vue`、`ChaptersPanel.vue`（新）与
  `copy.js`（`track`／`abandon`／失败可见）、`PublishPanel.vue`（阻塞遮罩＋`phase`）等；重建产物 `server/public/shell-ui.txt`。
- **玩家端与内容层**：`web/src/player/playerdeletedgame.js`（新）、`playerpublic.js`／`playernewgame.js`／`playerrestore.js`／`playersessionhost.js`；
  `web/src/content/authoring/chaptermaterialize.js`、`chapterbase.generated.js`（新）、`gamesource.js`、`generaldefinitions.js`、`cityrecords.js`、`citydefinitions.js`；
  `server/public/trialweb.txt`（三次重建）。
- **必要文档**：`docs/game-storage-layout.md`、`docs/editor-workbench-structure.md`、`docs/chapter-and-base-resources.md`、
  `docs/editor-create-and-resources.md`、`docs/plans/chapter-authoring-{plan,prompt}.md`、`docs/session-handoff-game-storage.md`、
  `AGENTS.md`、`VERSION`、本文件与 `CHANGELOG`。

## 排除

- 本地代理／运行产物（`.dragon-analysis/` 会话收据、`editor-ui/node_modules`、`/tmp` 日志、失败轮截图）全程 gitignored，未进仓库；本范围 149 个文件无此类条目。
- 凭据与 env：`PLAYER_ADMISSION_KEYS` 只存运维本地 `~/.dragon-secrets/`（0600），不入 Git；`publication.env` 的 pin 值记录在文档，密钥不入仓。
- 生产备份包（`publication-*`、`app-prev*`、nginx 备份）留在服务器，不进仓库。

## 验证

**本次补记复跑（第一手，2026-11-04）**

- `tools/verify_copy_tracking.mjs`：**8/8**（一次点击到完成、只用文件数、重跑被拒不当作失败、租约过期才同键重跑、重新载入自动接着核对、已取消不重跑、失败留弹窗且「確認」才关）。
- `tools/verify_copy_abandon.mjs`：**14/14**（`PASS-COPY-ABANDON`：失败后状态/租约/名称/物件、同名重试、pending 超时清扫、持租约不被收、已 committed 不动、模板角色门）。
- `tools/verify_editor_schema_sources.mjs`：`23 owners / 53 tables / 51 indexes / 356 columns / 4 FK`。
- `editor-ui/build.mjs --check`：`shell-ui.js 698189 bytes`、`shell-ui.css 54698 bytes`、notices 10 packages —— 与生产 `/shell-ui.js` 字节数一致。

**发布当时记录的证据（来源：checkpoint journal §4.1–§4.23，未在本次补记重跑）**

- 两颗长期红门修绿：`verify_editor_workbench_browser` 218→**219 checks**（菜单派生 11 项）、`verify_editor_shell` 90→**92 checks**（含长期 red 的 `disband-order`）。
- 全链浏览器证据：`verify_workbench_produce_game_browser` **7 checks**（真实编辑器 gateway／auth／SQLite／私有文件桶＋真 Miniflare R2＋真 reader：複製遊戲 → 上架 → 同意 → 玩家端 registry／admissions／file 字节 sha 对账 → 删旧产物后仍可用）、
  `verify_publication_chain_browser` 10 组三模式、`verify_copy_publish_parity`（副本与内置数据等价）。
- 存储方案 B：`verify_directory_pointer` 22、`verify_reader_directory_pointer` 16、`verify_game_purge` 11、`verify_game_purge_reclaim` 9、`verify_publication_producer` 25 组。
- 玩家端：`verify_reader` 77、`verify_reader_announcements` 107、`verify_player_client_workerd` 7、`verify_player_deleted_saves` 12、
  `verify_player_restore_browser` 36、`verify_player_new_game_browser` 20、`verify_player_session_host_browser` 21、`verify_player_chapters` 42、
  `verify_player_client` 50、`verify_player_pack_compiled` 6、`verify_installed_program` 36。
- 已知既有红（非本版引入，未修）：`verify_editor_copy_controller.mjs`（测旧控制器 API，1 条 ast-grep 风格警告）、
  `verify_editor_backend_admin_copy.mjs`（`pathToFileURL(undefined)` 崩溃）。`verify_publish_ui_model` 基线实测为 **6 pass／9 fail**（HEAD 本体），
  容忍新文案并补上 mock purge 回执的 `reclamation` 后是 **8 pass／7 fail**——仍红（剩余 7 条早于 B3 §6／B8 的产品变更），但不属本版行为回退。

**发布后补记期间的额外修正（2026-11-04 晚，未提交，见 checkpoint journal §4.24–§4.27）**

- 两条浏览器门在发布时**没有被跑**，因此把 ui4（「進入即載入」）与 ui5（「機器標識不出現在使用者句子裡」）的产品变更留在了断言之外。
  现均已按新产品契约重修并转绿：`verify_publication_ui_browser` **7 checks**（含夹具补 `reclamation` 回执——同一类缺陷的另一处）、
  `verify_editor_workbench_browser` **219 checks**（三条自动加载端点 + 补 `/api/admin/reviews` 夹具路由）、
  `verify_review_ui_browser` **6 checks**（同样的 ui4 陈旧断言 + 夹具缺 `reclamation`）。三条门的同一根因是：服务端新增必填回执字段时，所有 **mock 回执**都要一起补（`grep reclamation tools/`）。
- 提示文案规范落地：`draft/client/publish/catalog/library` 与三个面板的用户句子里的「原鍵／pending」全部换成用户语言，并补「你能做什么」的尾巴。
- 修掉 `server/public/publish.txt` 与 `server/public/review.txt` 里的**裸控制字节**（C 批正则把 `\x00` 写成了真实 0x00，导致 git 把两个文件当二进制、diff 不可见；行为等价，现改为转义文本）。
- `tools/verify_workbench_produce_game_browser.mjs` 新增 `drainStates`／`drainMs` 诊断：一次 20 章上架的分发排空实测 **7041 ms**（≈3.5 s/代次），
  为 C 批剩余的两条路线提供决策依据（见 [game-storage-layout](game-storage-layout.md) §11.5）。

## 生产状态（2026-11-04 只读实测）

- **工作台／发布器**：镜像 `dragon-editor-publication:20261104-bc1-ui5`，healthy；回滚点 `app-prev12-*`、`.env.before-20261104-bc1-ui5`、备份 `publication-20261104T125224Z`。
  `https://dragon-editor.720108.xyz/` 200；`/shell-ui.js` 200 / **698189**、`/publish.js` 200 / **28401**、`/client.js` 200 / **20931**（＝本地 20739 ＋ 192 行换行）。
- **玩家端**：`https://dragon.720108.xyz/play-api/v1/registry` 200 / `generation 3`，目录 1 笔——`卧龙传·重构版` `ordinal 1.0` / 20 章 / `publishedAt 2026-11-04T12:16:11.962Z`。
  即本轮部署未影响已上架内容，且「工作台量产 → 玩家端可加载」已在生产成立。
- **发布链**：Cloudflare Worker `dragon`（玩家端）、VPS 工作台镜像、R2 以 `control/directory.json` 为唯一在架指针。

## 限制（不因发布而解除）

> 本列表写于发布当时；发布后补记期间已修掉其中「两条浏览器门陈旧」那一类问题，明细见上方「额外修正」与 checkpoint journal §4.27。


1. **C 批剩余＝发布协议改版**：下线 6 张 `content_distribution_*` 与退役流程、新增 `game_releases(game_id,version,digest,state,published_at)`，
   必须先在「同步发布」与「新队列」两条路线中选一条；两条都要改 `server/management.js` 回执格式，并同步
   `tools/verify_editor_schema_sources.mjs`（53/51/356/4）、`tools/verify_distribution_schema.mjs`、`server/deletiondefinitions.js` 的冻结声明。
   裁定与路线见 [game-storage-layout](game-storage-layout.md) §11.2。
2. **复制仍是同请求同步跑**（租约 5 分钟），受 Cloudflare 约 100 秒切回复限制；现靠「丢回复 → 原键查询」兜底，未改后台任务＋轮询。
3. **待用户决定**：上架／删除面板那三个按钮（查詢原操作／以原鍵重試／只停止本機追蹤）是否删除；若删需把 `submit`／`remove` 改成「重按同一动作即重用原键重送」。
4. **验收缺口（未跑）**：验收①的全栈版本（两个同内容游戏删 A 后 B 从 registry→admit→逐章读到开局）；验收③的真实 R2 桶版本（现用注入式 in-memory 端口，与生产同一份回收代码）。
5. **账本遗留**：2 条历史事件 ＋ 1 条 cleanup 行惰性残留，直接删会触发 `DISTRIBUTION_LEDGER_CORRUPT`，等整表下线时一起清。
6. **已封存／手动 harness，不作现行门**：`verify_editor_backend_deletion_definitions`（`pinned/worker.js` 世代快照）、`verify_editor_fullcopy_water_browser`（面板未挂载＋旧壳 id）、
   `verify_editor_roles_browser`、`verify_trial_app_boot`、`verify_editor_backend_admin_copy`（需 `MINIFLARE_MODULE`）。
7. **部署口径**：只推 `github` 远端，Gitea `origin` 不在本次发布目标内；`web/content/builtin/**` 仍是工作台的 installed source，任何「撤内置游戏条目」不得连带删除它（见 [game-storage-layout](game-storage-layout.md)）。
