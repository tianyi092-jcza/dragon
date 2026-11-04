# 检查点日志（checkpoint journal）

> **用途**：只记录**本轮会话**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)，本文件不复制、不替代原始证据或验证。
> **历史归档**：旧编号批次（EDITOR-UI UI-1…UI-14、B1–B8 工作台重构、章節創作七步、方案 B 的 A/B/C 批、早期部署与迁移归因）
> 已从正文移除。CHANGELOG 等文档仍引用 §6／§10／§11／§13／§19–§33 一类旧锚点，那些链接指向的就是这些归档批次，
> 需要细节请用 `git log -p -- docs/checkpoint-journal.md` 追溯；仍被主动引用的锚点保留在文末「归档锚点」。

## 1. 当前主线状态

- **软件版本 `0.1.11`**（本次发布）：已推 `github`（`main` = 本提交 / tag `v0.1.11` / Release），**未部署**。上一版 `0.1.10`（`c5de53d` / tag `v0.1.10`）已推 GitHub 并已上生产。生产当前跑的是 **`b8d62b0`**（镜像 `20261104-bc1-ui6`，healthy）；`fbeeca0` 之后的发布日志与发布历史面板**只在仓库里**。Gitea `origin` 仍未推（不在发布目标内）。
- **游戏级存储（方案 B）A+B+C 三批已全部上线**：上架时并行写 `control/directory.json`（游戏级在架指针，R2 唯一与游戏相关的对象）；读者只按指针出目录；删除 = 库行 purge + 指针移除该 gameId + `artifacts/<gameId>/` 前缀回收。
- **产品主流程在生产上已跑通**：複製遊戲（20 章全量）→ 全面檢驗 → 上架（版本 +1、状态「待上架」）→ 管理员同意（「已上架」）→ 玩家端能加载并正常游玩；删除旧产物走同一 fence→purge 链。
- **工作台回馈**：複製一次跑到完成（无「續」、真实文件数进度）；上架/检验有阻塞遮罩 + 分步状态；全站提示改成「在做什么／做成了什么／失败能怎么办」；每请求有超时（只读 60s／写 600s），UI 不再可能被一个请求永久锁死。
- **v0.1.10 发布后补记批（已随 `b8d62b0` 提交并上生产）**：补齐版本记录（`docs/release-v0.1.10.md`、`CHANGELOG 0.1.10`）、给出 C 批剩余两条路线的对比与实测数据（`drainMs=7041`）、把提示文案规范落到剩余面板，并修好两条自 ui4／ui5 起就陈旧的浏览器门。详见 §4.24–§4.27。
- **A 路線第一版（同步發布，可回滚）已上生产**：镜像 `20261104-bc1-ui6`，`EDITOR_SYNC_PUBLISH=0` 即回旧协议。详见 §4.28／§4.29。
- **发布日志 `game_releases`（审计）已提交`fbeeca0`，未部署**：与发布同一事务写 pending/confirmed 行，管理回执带 `releaseDigest`；纯 additive，7 张 `content_distribution_*` 与 drainer 未动。面板（第 2 档）已随本批完成，见 §4.33。

## 2. 本轮交付批次（按提交顺序）

| commit | 内容 |
|---|---|
| `af21e37` | A 批：上架并行写游戏级目录指针（`reader/directorypointer.js`、`vps/directory-pointer.mjs`、`verify_directory_pointer` 22 checks） |
| `e4bbca3` | B+C 批：读侧切指针、玩家删除改为阻塞告知 410、删除=purge+指针移除+前缀回收（`vps/game-reclaimer.mjs`、`verify_game_purge_reclaim` 9） |
| `4f8e1c3` | 重建 Trial 网页包（`trialweb.txt`） |
| `2dcc9da` | A+B+C 上生产记录 |
| `8edcaab` | 複製遊戲一次跑到完成、进度改报文件数 |
| `ceb03ad` | 没复制成功的副本不再留下名称与数据（`#abandonInTxn`/`#abandonStaleInTxn`/`#abandonFailed`，`verify_copy_abandon` 14） |
| `aa795a8` | 失败要看得到原因，不能静默关掉弹窗（`failedCode`+`reasonText`） |
| `c9eaf7a` | 进度即时（写请求与只读轮询并行）、进入即加载、提示写清楚 |
| `c5de53d` | 上架阻塞遮罩 + 分步状态（`phase`）、全站提示改为可读文案（v0.1.10） |
| `fbeeca0` | A 路線：发布日志 `game_releases` + 回执 `releaseDigest`（54表／52索引／361列／4FK） |
| `73fbdc6` | 发布历史面板（第 2 档）：`GET /api/admin/games/<id>/releases` + 审核页行内展开 |
| `3651299` | docs：校正上一行的提交号 |
| 本提交 | **v0.1.11 发布**：`VERSION` 0.1.11、`CHANGELOG` 0.1.11 段、`docs/release-v0.1.11.md`（含全量审阅：51 文件分类／排除项／本次复跑与未重跑／既有红） |

## 3. 本轮技术决定（长期有效）

1. **方案 B 三条不可退**：不可变写 + 指针 CAS；读者 digest 校验；删除前栅栏。不做引用计数、不建退役账本。
2. **目录指针是 R2 上唯一与游戏相关的对象**，按 gameId 一条 entry、按 gameId 升序；`digest` 覆盖不含 digest 的 body，字段顺序即字节。
3. **删除 = 库行 purge + 指针移除 + 前缀回收**：墓碑与「缺席」对读者等价（都 410 `GAME_DELETED`），所以 purge 后不留墓碑。
4. **读者语义**（用户 m256/m262）：查不到即 `410 GAME_DELETED`；玩家端文案为繁体**告知**「該遊戲已刪除！」、单一「確認」、右键无效、确认后无条件清本机进度并回开局选择页。
5. **失败必须可见**：複製失败留弹窗写明原因（只有「確認」能关），成功才自动隐藏；服务端用 `result_json` 记 `failedCode`，不新增列。
6. **不造假进度**：要么真实计数（已写入 N 个文件），要么只报步骤（`phase`）。删除所有定时器假装百分比。
7. **提示文案规范**：等待说「在做什么」、结束说「做成了什么」、失败说「发生了什么 + 你能做什么 + 怎么回报」；机器标识（原键、gameId）不出现在面向用户的句子里。
8. **客户端不许把 UI 锁死**：每请求超时；`run()` 的 `finally` 先解锁再渲染；单面板渲染异常不扩散。

## 4. 本轮调试记录（含失败尝试）

- **「60 秒仍未完成 / 按了『續』还是 60 秒」**：`copy.js` 旧代码 `for i<20` + 3 秒 = 前端自动核对只有 60 秒上限；服务端 `/run` 是同请求同步跑完（租约 5 分钟），代理层 100s 切断回应但不中止执行；再按「續」触发 `409 COPY_NOT_CLAIMABLE`（不许第二份）→ 永远同一个循环。**结论：60 秒不是服务端上限**。
- **「复制成功能，但点了上架后整个工作台全禁用」**：`run()` 只在 `finally` 末尾 `shell.sync({busy:false})`，而 `finally` 前面还有 14 个 `render()`；只要请求不结束或某个渲染抛错，`state.busy` 永真。生产实测（只读）：容器 healthy、CPU 0.87%、到 8788 的 ESTABLISHED 连接 0 条、账本无 publish 事件、`content_releases`/`published_games`/`published_packs*` 全 0 → **那次上架什么都没写**，F5 即恢复。修法：请求超时 + 先解锁再渲染 + `try/catch` 包住渲染。
- **「复制必失败」（真因不是代码）**：上一轮「清空到 generation 0」把 `publication-data/private-objects` 当孤儿 blob 清掉，里面其实是 `installed/`（已安装底层资源字节）。reserve 只查 SQLite 所以成功，`execute` 首次 `loadFull` 读源字节就失败。已从清空前备份 `publication-20261104T082754Z/private.tgz` 只解 `installed/`（520 文件 / 104MB，不碰 `private/` 草稿），并按两个 `installed_sources.root_digest` 核对 sha256/大小。
- **浏览器删除永远停在「已柵欄、尚未徹底刪除」**：C 批给 purge 回执加了 `reclamation`，而 `server/public/{review,publish}.txt` 用 `fields()` 做**严格键集合相等**校验 → 多一个键就丢「回執格式無效」。修法：接受选填 `reclamation` 并校验收敛形状（completed 必带 `pointer`；pending 必带非空 code，1–200 字无控制字符），并在文案里如实报「已回收／未設定／未完成（code）」。
- **失败尝试（不要重做）**：曾猜测「服务端挂起在 `captureForCompile`／`playPacks.prepare`」，靠 `ss`/`docker stats`/nginx access.log 逐项排除；host nginx access.log 为空（编辑器不走它），容器 rootfs 只读使 `docker cp` 不可用（查库要 `docker run --rm -v .../publication-data:/data:ro ... node:22-bookworm-slim node /q.cjs`）。最终结论是客户端锁而不是服务端阻塞；因此后来在 `vps/editor-server.mjs` 加了 `request-slow` / `request-failed` 事件日志，下一次真失败直接可查。
- **`verify_editor_copy_modes` 曾 3/5 红**：它把「本机原键在操作完成後仍存在」当契约；改为「完成即释放、命名空间由 run 路径证明」后 5/5。`verify_editor_copy_controller.mjs`（测旧控制器 API）与 `verify_editor_backend_admin_copy.mjs`（`pathToFileURL(undefined)` 崩溃）是既有红，未修。

### 4.24 发布后补记：0.1.10 的版本记录缺口（2026-11-04 晚，未提交）

`CHANGELOG` 最新只到 `0.1.9`，`docs/release-v0.1.10.md` 不存在，`docs/deployment.md` 也只覆盖玩家端静态站。
补法是**以 git 为范围事实**：`git diff v0.1.9 v0.1.10` = 74 提交 / 149 文件（+22104 −9195，50 新文件），分七组写入发布审阅。

- 新增 `docs/release-v0.1.10.md`：范围（七组主题 + 按目录的纳入清单）、排除（本地代理产物／凭据／生产备份）、
  验证（分「本次补记复跑」与「发布当时记录、本次未重跑」两类）、生产状态（只读实测）、限制（C 批剩余、同步复制长请求、三按钮待定、验收①③缺口、账本遗留、封存门）。
- `CHANGELOG.md` 新增 `0.1.10` 段；`docs/deployment.md` 加一行交叉链接（该文件只管玩家端静态站，不复制发布历史）。
- 本次第一手复跑：`verify_copy_tracking` 8/8、`verify_copy_abandon` 14/14（`PASS-COPY-ABANDON`）、
  `verify_editor_schema_sources` 23 owners／53 表／51 索引／356 列／4 FK、`editor-ui/build.mjs --check`（698189/54698）。
- 生产只读实测：工作台 `/` 200、`/shell-ui.js` 698189、`/publish.js` 28401、`/client.js` 20931（＝本地 20739 ＋ 192 行换行）；
  玩家端 `/play-api/v1/registry` 200／generation 3，列出「卧龙传·重构版」1.0／20 章（`publishedAt 2026-11-04T12:16:11.962Z`）。

### 4.25 C 批剩余：两条发布路线的实测依据（2026-11-04 晚，待用户裁决）

- **新增诊断**：`tools/verify_workbench_produce_game_browser.mjs` 的收款对象加 `drainStates` 与 `drainMs`——
  每次跑这条 lane 都量「一次 20 章上架的分发排空耗时」，因为发布协议改版的决策取决于这段是否稳定低于代理层约 100 秒上限。
- **实测（连跑两遍绿）**：`drainMs = 7041`（≈3.5 s/代次）、`drainStates = [VISIBLE_CONFIRMED, VISIBLE_CONFIRMED]`、
  `r2Objects = 34`、lane 全程 3m23s（绝大部分是 20 章**複製**那笔同步长请求，不是分发）。
- **结论**：分发本身不是同步发布的硬阻塞，距 100 秒有两个数量级余量；真正的长请求是複製，与发布协议无关。
- 两条路线的影响面、收益、风险与前置保险已写入 [game-storage-layout](game-storage-layout.md) §11.5（含「生产实测一次」与「可回滚并存一代」两道保险）。
- **建议**：选 A（同步发布），前置＝生产实测一次 20 章上架端到端耗时（<60 秒则成立，接近或超 100 秒退回 B）。

### 4.26 提示文案规范落到剩余面板（2026-11-04 晚，未提交）

- **「原鍵」是内部术语，全部从面向用户的句子里清掉**：`server/public/draft.txt` 18 处（→「同一個請求」，
  `服務仍pending` → 「服務端還在處理中」）、`client.txt` 3 处（→「查詢上一次操作」）、`publish.txt` 5 处（→「同一個請求」）、
  `editor-ui/src/copy.js` 3 处、以及 `BaseTerrainPanel.vue`／`CityDefinitionsPanel.vue`／`ChapterRolesPanel.vue` 的按钮与说明。
- **补「你能做什么」的尾巴**：`catalog.txt`（讀取資源清單失敗）与 `library.txt`（素材讀取未確認）原本只抛原始 message，
  现补「請確認連線後重試；仍失敗就把這句話告訴管理員」。`general.txt`／`stage.txt`／`draft.txt` 原本已有引导，未动。
- **发现并修掉一个真缺陷（`publish.txt` 里的裸 NUL 字节）**：C 批加的 `reclamation` 校验正则 `/[\x00-\x1f\x7f]/`
  在文件里是一个**真实的 0x00 字节**而不是转义文本，导致 git 把 `publish.txt` 当二进制（`Bin 27627 -> 28401`），
  diff 审阅与文本工具都看不到它。行为等价（`[NUL-\x1f]`），但已改为转义文本，文件恢复为可 diff 的 UTF-8。
- **顺手修掉重复标点**：删除失败提示 `'：' + result.purgeError` 会在错误自带「。」时出现「。。」，改为先去掉尾部句号。
- **验证**：`verify_editor_shell` 92、`verify_copy_tracking` 8/8、`verify_editor_copy_modes` 5/5、
  `verify_publication_chain_browser` 10（2m26s）、`verify_publication_ui_browser` 7（见 §4.27）、
  `verify_editor_workbench_browser` 219（见 §4.27）；`editor-ui/build.mjs` 重建 `shell-ui.js` 698276／`shell-ui.css` 54698
  （`.vue` 模板文字变了，scoped 样式 hash 随之变化，属预期）。
- **未改**：`tools/verify_editor_copy_controller.mjs` 的 `nested-ternary` 风格警告（该 lane 测的是旧控制器 API，本就是既知红）。

### 4.27 两条浏览器门自 ui4／ui5 起就陈旧：根因与重修（2026-11-04 晚）

两条门在 v0.1.10 发布时**没有被跑**，因此把 ui4（「進入即載入」）与 ui5（「機器標識不出現在使用者句子裡」）的产品变更留在了断言之外。
它们的失败都是断言陈旧，不是产品回退；修法是一律把断言改成新的产品契约，并保留原有的「不得 POST／不得自动重送」判据。

- **`verify_publication_ui_browser`（7 checks，现全绿）三处陈旧**：
  1. 「開頁不自動發請求」→ ui4 之后应断言「進入時恰好 1 次 GET、0 次 POST」；
  2. 追踪行断言包含 `lost.key`（原键）→ ui5 之后应断言包含「還沒拿到確定結果」且**不含** `lost.key`；
  3. **删除段真的红了**：夹具 `purge` 回执没有 `reclamation`，而 C 批之后 `publish.txt#purgeReceipt` 严格按键集合校验，
     于是页面一直显示「徹底刪除回執無效」。这是 §4.16 同一类缺陷的另一处：夹具补齐 `{state:'completed',pointer:'rewritten',objects:3}` 后转绿。
     **教训：服务端新增必填回执字段时，必须同时搜「所有 mock 回执」**（`grep reclamation tools/`）。
- **`verify_editor_workbench_browser`（219 checks，现全绿）两处陈旧**：
  1. 「每个模块导航都不发 API 请求」→ ui4 之后应断言恰好三条自动加载：
     `GET /api/admin/accounts`、`GET /api/admin/reviews`、`GET /api/games/submissions`（各 1 次、且都不是 POST）；
  2. 上架面断言「进入时表格 0 行、按重新整理后才 1 次请求」→ 改为「进入即已有 2 行、以已自动载入为基線，之后每次请求计数恢复原值」；
     并把 `/api/admin/reviews` 补进夹具路由（原缺失 → 500 → 末尾 `errors` 断言红）。
- **两条门现在都绿**：`verify_publication_ui_browser` 7（`unexpectedErrors:[]`、`outside:[]`、`failed:[]`）、
  `verify_editor_workbench_browser` 219（1m24s）。
- **`verify_publish_ui_model` 基线校正**：把 `/保留原鍵/` 改成 `/（保留原鍵|保留同一個請求）/` 后是 **7 pass／8 fail**；
  实测 HEAD 本体的同一 lane 是 **6 pass／9 fail**——即旧日志里的「7/8 既有红」是在已带容错断言的树上量的，本次改动净修好 1 条。
- **同一根因还波及第三条门**：`verify_review_ui_browser`（6 checks）也是「開頁不得自行讀取或提交」＋夹具 purge 回执缺 `reclamation`，
  同样改成「进入即 1 次 GET、0 次 POST」＋补回执后转绿。
- **`review.txt` 也有裸 NUL**：与 `publish.txt` 同一批引入的 `reclamation` 校验正则，两个文件都含真实 0x00/0x1f/0x7f。
  已一并改成转义文本（`/[\x00-\x1f\x7f]/`），语义不变、两个文件恢复为可 diff 的 UTF-8。
  **教训：写正则转义时用字符串拼接或 raw 源，不要让编辑器/脚本把它变成真实控制字符；此后 `git diff --stat` 出现 `Bin` 就要查。**
- **全局复查**：`grep -rn "state: 'purged'" tools/ server/ | grep -v reclamation` 已无遗漏；生产 `server/editorapp.js#postPurge`
  三个分支都会带 `reclamation`，所以「回执必带」的严格校验是对的，错的是 mock。
- **`verify_publish_ui_model` 再进一步**：把它的 mock purge 回执补 `reclamation` 后是 **8 pass／7 fail**（HEAD 本体 6/9，本会话累计净修 2 条）。
  剩余 7 条是行为断言（`retryDisabled` 门、B3 §6 任何状态可删、B8 全章校验前置）早于后续产品变更，属另一项 re-baseline，本轮不追。
- **LSP**：7 个改动 JS 文件 1 条 ast-grep 风格警告（`verify_editor_copy_controller.mjs:12` nested-ternary，既有），
  6 个 push-only 服务无法确认 clean → 记为**未确认**，不是 0 诊断。

### 4.28 发布协议改版：A 路線第一版（同步發布、可回滚）已落地（2026-11-04 晚，未提交）

用户裁定「按 A 路線开始做发布协议改版的可回滚第一版」。本批只把**分发推进搬进 HTTP**，schema 一行未动，
删 7 张 `content_distribution_*` 表与以 `game_releases` 当日志、回执改存 `releaseDigest` 留待下一批。

**做法**（每一处都能单独回滚）：

- `server/editorapp.js`：新增可信注入卵 `distributionDrain`（非函式或非 frozen 模式在动 SQL 前 `TypeError`）；
  `#advanceDistribution()` 一步一代次、上限 8 步／25 秒，只依据 `frozenDistribution.status()` 判定；
  任何抛错只降级为 pending，**绝不把已提交的操作判成失败**；同一实例内用 `distributionDrainTail` 串行化。
- `POST /api/publish`：只有注入 drain **且非重放**时推进，回执多带一个**可選** `distribution`（与 GET 状态同构）；
  重放只观测、不再推进（否则每次幂等重送都会多写一次远端）。
- `POST /api/games/<id>/listing`（同意上架）：提交后推进，**管理回执形状不变**。
- `server/public/publish.txt`：`fieldsOptional` 放行那一个可選键；`publishReceipt` 逆写回原 pin 入栏位，
  描述子不混进永久回执；抽出 `distributionStatus()` 让 GET 与新回执共用一套核验；已确认就不再补查。
- `vps/publication-server.mjs` 注入 `() => publisher.drainOne()`；drainer 照旧在跑（两条路径共存一代）；
  `vps/publication-config.mjs` 新增可選 `EDITOR_SYNC_PUBLISH`（`0`＝旧协议，未设＝开）——只降不升。

**回归捉到一个真缺陷**：`verify_frozen_publication_root.mjs`（46 组）先红了——并发同键发布走的另一条
`#publishPin` 回放分支（`catch` 里 `inspect` 后 `return replay.pin`）漏改返回形状，导致 HTTP 200 空 body。
已改成与另两处一致的 `{pin,gameId,releaseId,replayed}`，重跑转绿。**教训：改一个函数返回形状时，`grep` 全函数名找每一个 `return`。**

**验证**：新 lane `tools/verify_publish_sync.mjs` **11 组绿**（构造门、回滚态无 `distribution` 键且仍 pending、排程器路可、同步态 confirmed、**重放零推进**、推进抛错→200＋pending 且排程器随后补上、同意上架同步推进且形状不变、**并发同键两请求回执一致且推进 peak=1、帳本只多一代**、**回滚并存态下 pending 代次仍能被排程器补齐且代次连续不重复**）；`verify_frozen_publication_root` 46、`verify_publish_operations_root` 31、`verify_publication_producer` 25、`verify_vps_frozen_service` 14、`verify_publication_main` 93 checks 均绿；`verify_publish_ui_model` 新增 1 条 client 测试通过，总计 **9 通过／7 失败，7 条与 HEAD 基线同名相同**。

**又一个行为决定**：并发同键的败者走回放分支不推进，但若不等已排队的推进，同一请求的两个并发调用会拿到 pending／confirmed 两种答案；现改为回放时 `await this.distributionDrainTail`（只等不推进），并发请求的回执因此一致。跨进程仍各等自己的队列（客户端补查兜底）。

**未做**：未上生产（部署需单独授权）；生产端到端时长（真 R2／代理链）未实测，§11.5 前置①仍未满足；未删表、未换回执。

### 4.29 A 路線第一版已提交并上生产（2026-11-04，`b8d62b0` / 镜像 `20261104-bc1-ui6`）

- 提交 `b8d62b0`（29 文件，+710/−72）后按 §12.2 流程上生产：archive 161 MB → scp 48 s → `docker build` → `backup-publication.sh`
  → `mv app app-prev13-<ts>` → `mv app-new13 app` → `.env` 改 tag → `compose up -d --force-recreate` → 首次健康 **9 分钟**（首启归档 1439 个静态物件）。
- **本轮没有玩家端字节变化**，所以没动 nginx、没动 `publication.env` 三处静态 pin、没跑 `wrangler deploy`。
- 只读实测：`/` 200、`/api/health` 200、`/shell-ui.js` 698276（＝本地构建产物）、`/publish.js` 30121（＝本地 29839 + 换行）、玩家端 `registry` generation 3。
- **回滚**：`EDITOR_SYNC_PUBLISH=0` + recreate 即回旧协议（无 schema 变更，不必回滚数据）；整镜像回滚用 `app-prev13-<ts>`。
- **仍未验证**：生产上没有真实上架一次，所以真 R2 下的同步耗时与「立刻可见」仍只有本地证据；这需要管理员在生产点一次上架。

### 4.30 发布日志 `game_releases`（A 路线，未提交）

用户选方案 A：只加审计日志与回执 digest，不动 7 张 `content_distribution_*` 与 drainer。详细记录见 `docs/game-storage-layout.md` §14。

- 新表 `game_releases(game_id,version,digest,state,published_at)`，写行时机在 `enqueueInTxn`（pending）/`confirmInTxn`（confirmed + visibleAt），只在 publish 且信封带 `runtime.ordinal` 时写。
- `managementreceipt` 升 version 2（键多一个 `releaseDigest`），v1 仍逐字节兼容；`deletionfence` 双版本都接受。
- 计数门新基线：**54 表 / 52 索引 / 361 列 / 50 索引投影 / 4 FK**。
- 归档证据门（`verify_editor_backend_*_freeze` 等 8 条 round 门）**故意不回改**：它们绑定 `before.json` 源码哈希快照，改数字只会自相矛盾。
- 新 lane `tools/verify_release_log.mjs` 11 组绿；浏览器三门、workbench 219、chain 10 全部重跑绿。
- 既有失败（HEAD worktree 复现）：`verify_first_online`、`verify_reader_distribution`、`verify_deletion_distribution`(+`_workerd`)、`verify_publish_ui_model` 7 条。
- **未提交、未部署**：commit 与 deploy 各自需要明确授权。

### 4.31 本轮交接：发布日志 `game_releases`（A 路线，未提交、未部署）

**本轮目标**：上一批把「同步发布」做完并上生产后，用户裁定方案 **A**——只做「新增发布日志 + 回执带 digest」，**不动** 7 张 `content_distribution_*` 与 drainer。

选 A 而非删表批的实测依据（不是偏好，是阻塞）：

- `content_distribution_chunks` 是崩溃一致性的**唯一载体**：payload 是累积 catalog，含 `firstOnline.generation` 自引用，`publicationproducer.#catalog` 从 `ledger.entry(tail).payload` 反序列化。删表等于删掉恢复能力。
- 远端头对账以 events 代次为锚；`EDITOR_SYNC_PUBLISH=0` 的回滚路径就是 drainer。
- 生产库已有真实数据（generation 3），删表是不可回滚的单向操作。

**已完成**：`server/distributionledger.js`（DDL `game_releases`、`releaseVersionOf`、`payloadBytes` 改返回 `{bytes,envelope}`、`enqueueInTxn` 写 pending 行、`confirmInTxn` 转 confirmed + `published_at`、`operationStatus.releaseDigest`、只读 `releaseLog(gameId)`）、`server/management.js`、`server/managementreceipt.js`（v1/v2 双版本）、`server/deletionfence.js`（v1/v2 都接受）、`server/public/publish.txt`（校验 `releaseDigest`）、`distributiondeclarations.js`、`deletioninventory.js`、`gamepurge.js`；计数门 54/52/361/50/4 全部同步；8 条归档 round 门故意不回改；新 lane `tools/verify_release_log.mjs` 11 组绿。

**关键决策**

1. **审计写行必须与业务写同一事务**：所以表进账本库、由 ledger 在 enqueue/confirm 里写，不做独立审计服务或异步日志。理由是对外讲清的一条——旁路收集会同时产生「发布了但没记」（漏审）与「记了但其实没发布」（假审）两种裂缝。
2. 只在 `kind === 'publish'` 且信封真带 `runtime.ordinal` 时写行；无 runtime 的合成/纯传输 publish 不写。ordinal 非法 → 422 `DISTRIBUTION_OPERATION`，且不落半行。
3. 主键 `(game_id, version)`：同版本不同 digest → 503 `DISTRIBUTION_LEDGER_CORRUPT`，不静默覆盖；重放走 `requireRecord` 校验。
4. 管理回执升 version 2（多键 `releaseDigest`），v1 逐字节兼容；v2 的 digest 允许 `null`（账本行缺失时不阻断审核/上架）。
5. 8 条归档证据门（`verify_editor_backend_*_freeze` 等）**不回改**：它们绑 `before.json` 源码哈希快照 + 轮次参数，改数字只会与自身快照矛盾。现行 schema 由活门（54/52/361）与新 lane 负责，理由写在 [game-storage-layout](game-storage-layout.md) §14.4。
6. **用户对定位的判断**：这不是新模块，长期应做成「系统审计」；本轮只覆盖发布这一块，用户已选**第 2 档**作为下一个任务（发布历史面板）。通用 `audit_events` 仍未立项。

**失败尝试 / 踩坑（下一轮不必重犯）**

- `verify_release_log` 首跑两条红，**都是测试自身问题**：① sqlite-port 返回 null-prototype 行，`deepStrictEqual` 失败 → 用 `row => ({...row})` 映射；② 合成 publish 复用了已有 pending publish 的 gameId → 409 `DISTRIBUTION_GAME_PENDING`，改用第三个 gameId `THIRD`。
- 计数门连带 4 处红：`verify_publish_operations_root`（2 处 53）、`verify_vps_editor_server`（`indexesVerified` 51 一处）、浏览器链夹具 `tools/fixtures/publication-browser-authority.mjs`（1 处）。`verify_editor_backend_management` 不是坏，是 round 门必须带轮次参数，**不能直接跑**。
- 4 条既有红用 `git worktree add /tmp/wt-head HEAD --detach` 在 HEAD 上复现后确认与本批无关（`first_online`、`reader_distribution`、`deletion_distribution` 与 `_workerd`）；`publish_ui_model` 改前改后都是 9 pass / 7 fail（7 条同名）。
- 教训：改 schema 计数后必须 `grep` 全 `tools/` 的 `tablesVerified`、`tables:`、`indexesVerified`、`53 tables`——**夹具里也各有一份**，不在 `verify_*.mjs` 里。

**相关文件**（本批，19 改 + 1 新）

- 服务端：`server/distributionledger.js`、`server/management.js`、`server/managementreceipt.js`、`server/deletionfence.js`、`server/distributiondeclarations.js`、`server/deletioninventory.js`、`server/gamepurge.js`、`server/public/publish.txt`
- 工具：`tools/verify_release_log.mjs`（新）、`tools/fixtures/distribution-schema.mjs`、`tools/fixtures/publication-browser-authority.mjs`、`tools/verify_distribution_schema.mjs`、`tools/verify_editor_schema_sources.mjs`、`tools/verify_frozen_publication_root.mjs`、`tools/verify_publish_operations_root.mjs`、`tools/verify_vps_editor_server.mjs`、`tools/verify_publish_ui_model.mjs`
- 文档：`docs/game-storage-layout.md` §14、本文件 §4.30／§4.31／§9

**当前状态**：全部验证通过（详尽矩阵见 §14.5 与 §4.30），已提交 `fbeeca0`；工作树干净。生产库**还没有这张表**，所以生产上此时查不到任何发布历史。

### 4.32 交接前的重跑与两个陈旧长期事实（`fbeeca0`）

- 提交前按证据重跑：`verify_release_log` 11 组绿、`verify_distribution_schema` 54／52／361、`verify_editor_schema_sources`
  23 owners／54／52／361／4 FK。三个数字一致，才提交。
- **发现两处长期事实陈旧**（不在原批的 19 个文件里）：`AGENTS.md` §2 还写「53表／51索引／104对象／356列」，
  `docs/r2-player-connection.md` §… 还写「23源／53表／51索引／104对象／356列」与「索引投影同步为 49」。
  现统一为 **54表／52索引／106对象／361列／4FK、索引投影 50**（对象数＝表＋索引，53+51=104 即旧口径）。
  历史发布记录（`docs/release-v0.1.10.md`、`CHANGELOG` 的 0.1.10 段）**不改**：它们记的是发布当时的事实。
- **教训**：改计数后不只 `grep` `tools/`，还要 `grep` `--include=*.md`——长期记忆里也各存一份，而且它比夹具更容易被漏掉。

### 4.33 发布历史面板（第 2 档）已落地（未部署）

**目标**：管理员在编辑器里看某个游戏的每一笔上架记录（版本／时间／分发状态／摘要）。数据源是
`releaseLog(gameId)`——上一批已经写好但**零调用方**，所以此前只能登服务器查 SQLite。

**做法（每一处都能单独回滚）**

- `server/editorapp.js`：新 route `GET /api/admin/games/<id>/releases`（`releaseHistoryPath`），
  顺序为 **admin 门 → 内建 403 → 查询串 422 → touch → 200**；admin 门用 `user.role !== 'admin'`（照 `#getAdminAccounts`），
  不使用 `copyAccess`（那是 FULL_COPY_ADMIN_REQUIRED，语义不同）。响应 `{gameId, releases}`，`releases` 是 ledger 的冻结数组。
- **这条路由与已有的 `GET /api/games/<id>/releases` 是两件事**：后者是 `content_releases`（内容修订清单，作者可见，而且
  `pruneExceptInTxn` 只保留当前一版）；前者是 `game_releases`（上架历史）。两个名字像，注释里写明了。
- `server/public/review.txt`：新增 `history(gameId)` 动作 + 严格 `releaseHistory()` 校验（键集合精确、
  `version` 必须 `1.n`、`digest` 64 hex、state 只有 pending／confirmed、**pending 必须 `publishedAt: null`、confirmed 必须有时间**、
  同版本不得重复），模型多一个 `history: {gameId, loading, message, rows}`，行上多 `historyOpen`／`historyDisabled`。
  摘要只给前 8 位，整串只进 `title`。
- `editor-ui/src/ReviewPanel.vue`：每行多一个「發布歷史」按钮，行内展开一张四列表（版本／上架时间／分發狀態／發布摘要），
  空态文案说“日志从本次上线之后才开始记，不回填旧版本”。已重建 `server/public/shell-ui.txt`（698276 → **705343**；CSS 未变 54698）。
- **权限定位留给作者的一步**：目前 "admin 门" 是按上一轮任务卡做的；作者看不到自己游戏的发布历史。
  若日后要开放给作者，应是另一条作者自查路由，不是放宽这条的权限。

**两个有意为之的选择**

1. **点击才加载**，不放进 `client.txt` 的 `autoLoad`：`verify_editor_workbench_browser`（219）已有「进入即恰好三条自动加载」的断言，
   而发布历史是逐游戏的可选查询，不是页面基线；点击才读也避开了“进审核页就为 N 个游戏各打一枪”放大。
2. **同时只展开一列**（`historyGameId` 单一而非 `Set`）：审核页是列表，多开会把行推得很远；再按同一行就是收起。
   副作用：打开另一行会先收起前一行（浏览器门里专门锁了这一点）。

**验证（全部实跑）**

- 新 lane `tools/verify_release_history.mjs` **7 组绿**（真 editor application 代码 + Node SQLite/bucket，日誌行由**真 ledger** 写入）：
  空态精确形状、两版本的 rowid 顺序与 5 个精确键、`publishedAt` 只在 confirmed、digest＝该代次 operation digest、
  `operationStatus().releaseDigest` 与历史首行一致、listing 事件不写行、admin 门（匿名 401／作者 403 且不带 body）、
  内建 403／非 uuid 404／未知 uuid 200 空／查询串 422、重复 GET 不写任何列也不推进代次、POST 不是路由。
- `tools/verify_review_ui_model.mjs`：新增 2 条（按了才读／一次 GET／再按收起不重发／摘要只露 8 位；空态不算错、
  10 种无效响应整批拒绝、失败留在展开里可重试），**11/11 绿**。
- `tools/verify_review_ui_browser.mjs`：新增第 7 条检查（进页 0 次、点一次 1 次 GET、行内展开 confirmed、
  摘要 `aaaaaaaa`、打开另一行会收起前一行、收起不再发请求、历史列不得冒充 `tr[data-game-id]`），**7/7 绿**（`unexpectedErrors:[]`）。
- `verify_editor_workbench_browser` 219、`verify_review_backend` 6、`verify_editor_shell` 92、`verify_release_log` 11、
  `verify_distribution_schema`（54/52/361）、`verify_editor_schema_sources`（23/54/52/361/4FK）均绿；`editor-ui/build.mjs --check` 过。
- 本批**不改 schema**：计数仍 54／52／361／50 投影／4 FK。

**未做**：未部署（生产无表，面板上去就是空态）；未开放作者自查；未做分页（`releaseLog` 无 LIMIT，单游戏版本数是有限增长，
目前最多十几个，上限 1000 的校验在客户端）；未在浏览器门里锁“真实 R2 + 生产数据”的表现。

### 4.34 v0.1.11 发布释出：全量审阅 + Release（2026-11-05）

用户要求「审查全部已改动与未跟踪文件，保留产品代码／测试／迁移／必要文档，排除本地代理／运行产物，再创建一个完整提交和 Release 并推送更新；Gitea 不推」。

**审阅口径与结果（不是重跑，是分类）**

- 范围 `c5de53d..HEAD`：6 提交／51 文件／+2801−1720／4 新文件；扩展名分布 22 mjs、10 js、7 txt、7 md、4 vue、1 css，**无 PNG／log／sqlite／zip／pem／env 之类产物**。
- `git status --ignored` 有 **156 条忽略项**（`.dragon-analysis/` 本轮 4 轮 browser 运行目录、`.pi/`、`.codegraph/`、`.playwright-cli/`、`.wrangler/`、`.dragon-runtime/`、根目录截图、`tools/*.log|*.txt`、`tmp_crop/`），全部 gitignored，51 个纳入文件里没有一条属于此类。
- 敏感值扫描只命中两处且都不是秘密：`shell-ui.txt` 的界面文案「變更密碼」、`tools/fixtures/publication-browser-authority.mjs` 里既有的受控测试口令（本范围只改了它的表数断言 53→54）。
- 语法：范围 32 个 `.js`／`.mjs` 全部 `node --check` 通过。**踩坑**：曾用一个「把每个 `server/public/*.txt` 当 ES module import」的循环，
  对 `client.txt`（裸 import specifier）、`playapp/trialapp/trialweb.txt`、`shell-ui-licenses.txt` 当然会报错，还把整段 base64 倒进输出——
  `.txt` 的正确验证入口是 `build.mjs` 与各自 lane，**下次不要用 import 探测这些文件**。

**本次复跑（为 Release 拿第一手证据）**

`verify_publish_sync` 11、`verify_release_log` 11、`verify_release_history` 7、`verify_review_ui_model` 11/11、
`verify_review_ui_browser` 7/7、`verify_editor_workbench_browser` 219、`verify_publication_chain_browser` 10、
`verify_workbench_produce_game_browser` 7、`verify_frozen_publication_root` 46、`verify_publish_operations_root` 31（`schemaTables:54`）、
`verify_publication_producer` 25、`verify_vps_frozen_service` 14、`verify_review_backend` 6、`verify_editor_shell` 92、
`verify_distribution_schema`（54/52/361）、`verify_editor_schema_sources`（23/54/52/361/4FK）、`build.mjs --check`（705343/54698）。
**未重跑**：`verify_copy_tracking` 8、`verify_copy_abandon` 14、`verify_copy_modes` 5、`verify_publication_main` 93、`verify_publication_ui_browser` 7（沿用 §4.24–§4.27 记录，已在发布审阅里标为未重跑）。
既有红复跑确认：`verify_publish_ui_model` **9 pass／7 fail**（与基线同名相同）。

**发布包**：`VERSION` 0.1.11、`CHANGELOG` 0.1.11 段、`docs/release-v0.1.11.md`（版本范围／按目录纳入／排除／验证两类／生产状态／六条限制）。
**tag 与 Release**：`v0.1.11` 打在发布提交上、推送 `github`，Release 正文由 `docs/release-v0.1.11.md` 派生。
**不部署**：代码 Release 不等于上线，生产仍是 `20261104-bc1-ui6`。

**推送踩坑（下次直接用）**：`git fetch`／`ls-remote` 连续三次 `Failed to connect to github.com port 443` 或 `OpenSSL SSL_read: Connection was reset, errno 10054`，
而同一时刻 `curl https://github.com/` 200（1.3s）、`gh api repos/tianyi092-jcza/dragon` 正常、`nslookup` 解析到 20.205.243.166 —— 是 git 的 HTTP/2 通道被重置，不是网络不通。
用 `git -c http.version=HTTP/1.1 push github main` 与 `... push github v0.1.11` 一次成功；不必改全局配置，也不必开代理。
（`gh release create v0.1.11 --notes-file` 走 api.github.com，本来就不受影响。）

**最终状态**：`github/main` = `fc1c84d`，tag `v0.1.11`（annotated `d634e0c`），Release 已建并标 Latest；Gitea `origin` 未动；工作树干净、`VERSION` 0.1.11。

## 5. 当前阻塞

1. **待授权：部署**。`game_releases` 与发布历史面板都已随 v0.1.11 发布，但**未部署**：生产库还没有这张表，所以生产上查不到任何发布历史（面板会显示空态，这是预期的，不是故障）。
2. **仍是既有红，不阻塞但不许写成「全绿」**：`verify_first_online`、`verify_reader_distribution`、`verify_deletion_distribution`（＋`_workerd`）在 HEAD 上就失败；`verify_publish_ui_model` 9 pass / 7 fail（7 条早于 B3 §6／B8 的产品变更）。
3. **账本剩 2 条历史事件 + 1 条 cleanup 行**属惰性遗留；直接删会触发 `DISTRIBUTION_LEDGER_CORRUPT`，等整表下线时一起清。
4. **7 张 `content_distribution_*` 与 drainer 仍在**。真要删，前置仍是生产实测一次 20 章上架端到端耗时（§11.5 前置①未满足）。
5. 上架面板那三个按钮（查詢原操作／以原鍵重試／只停止本機追蹤）是否删除仍待用户决定。

## 6. 下一步（建议顺序）

1. **部署 v0.1.11**（需明确授权）：不部署则面板永远空态。部署后请管理员在生产点一次真实上架，顺便量出 20 章上架的端到端耗时（C 批前置①）。
2. 通用系统审计（`audit_events` 覆盖审核／删除／账号变更）仍未立项；建议用 `game_releases` 的真实字段与用法反推其结构，不先设计。
3. 复制改后台任务 + 前端轮询（可选，彻底摆脱代理层 100 秒限制）。
4. C 批剩余（下线 7 张 `content_distribution_*`）仍等前置①；`verify_publish_ui_model` 的 7 条行为断言 re-baseline 也还挂着。
5. 作者自助看发布历史（若产品要）应是另一条作者自查路由，不是放宽现有 admin 门。

## 7. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`；其余旧锚点（§26–§49）已无外部引用，需要时用 git 历史追溯。

## 8. 用户指定五档提速

（归档摘要）用户指定五档 6.5／5.0／4.8／1.8／1.0ms，每 RAF 最多 16 更新；60Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示相位。现行口径与后续复验见 [战略时序](re-notes-strategic-time.md)。

## 9. 任务卡：发布历史面板（第 2 档）——**已完成**，实现记录见 §4.33

> 下面是当时的任务卡原文，保留作为“当初要求什么 vs 实际做了什么”的对照。
> 与卡片的差异只有两处，都是刻意：①控制层写进 `server/public/review.txt`（admin 专属模块），
> 而不是新建 `releases.txt`——避免新增一套 client 接线（import／setIdentity／十几处 render／canLeave），
> 符合“最小修改、复用现有验证”；②摘要只给前 8 位，整串进 `title`。

**目标**：管理员在编辑器里能看到某个游戏的发布历史（版本 / 时间 / 状态 / 摘要），数据来自已实现的 `releaseLog`。

**必须先知道的现状**

- `releaseLog(gameId)` 已实现但**零调用方**，没有任何 HTTP 路由；`releaseDigest` 只进管理回执，界面不显示。**现在哪里都看不到**，只有运维登服务器查 SQLite。
- 回执 v2 在生产已生效，但生产库还没 `game_releases` 表（未部署）。空列表是常态，不是故障。

**实施要点**

1. **路由**：`server/editorapp.js#getPrimaryRoutes`（约 762 行起，写法参照 `if (method === 'GET' && path === '/api/admin/reviews')`）。新增 `GET /api/admin/games/<id>/releases`：
   - 拒绝查询串，照 `#getAdminLibrary` 的 `if (url.search) fail(422, 'LIBRARY_QUERY')` 改成自己的错误码；
   - 收尾 `this.touch(tokenHash, policy)`；权限必须是 **admin 门**（照 `adminSubmissionSummaries` 的做法，不是 `copyAccess`）；
   - 响应 `{ gameId, releases: [...] }`，`releaseLog` 返回的已是冻结数组；
   - 非 uuid 时 ledger 抛 422 `DISTRIBUTION_OPERATION`，建议直接透传，别包装成 404。
2. **客户端模块**：新建 `server/public/releases.txt`，照 `publish.txt` 的风格：严格键集合校验、`Object.freeze`、错误码表、提示文案遵守 §3.7（等待说在做什么／结束说做成了什么／失败说原因 + 你能做什么）。摘要只显示 digest 前 8 位，整串只在 title 或复制按钮里，不要把机器串塞进句子。
3. **UI**：`editor-ui/src/ReviewPanel.vue` 或 `PublishPanel.vue` 里加「发布历史」区块（行内展开即可，不新开页面），`Workbench.vue` 负责注册；改完必须 `node editor-ui/build.mjs` 重建 `server/public/shell-ui.txt`（该产物被 git 跟踪），`--check` 必须过。
4. **空态**：新表不回填历史，老游戏必然为空，要显示「还没有发布记录」，不能报错。
5. **验证**
   - 新 lane `tools/verify_release_history.mjs`：admin 可读、author 403、非 uuid 422、空列表、多版本按 rowid 顺序、带查询串 422、响应键集合精确。
   - **浏览器门有坑**：`verify_editor_workbench_browser`（219 checks）现断言「进入即恰好三条自动加载：`GET /api/admin/accounts`、`/api/games/submissions`、`/api/admin/reviews`，各 1 次 0 POST」。若新面板也在进入时自动加载，**必须同步改这三条断言**；更省事的做法是「点击才加载」。
   - 计数门不变（不改 schema）：54 表 / 52 索引 / 361 列 / 50 索引投影 / 4 FK。
6. **编辑器交互例外**：编辑器允许常规网页式保存／取消／右键菜单／未保存离开提示（AGENTS.md 2.2）；但它启动的同引擎试运行界面仍遵守游戏交互规范。

**开工前的环境提示（本轮踩过）**

- Bash 控制台是 GBK，中文输出会乱码：读文件用 python（`encoding='utf-8'`），需要看中文就写进文件再用 read 工具看。
- **不要 grep 打印 `tools/verify_publish_ui_model.mjs`**：里面内嵌 base64 data URL，整行几万字符会炸输出。
- bash heredoc 里的反斜杠转义会被折叠成真实控制字符（曾把 0x00 写进源文件）。
- `edit` 工具要求先 `read` 同一文件。
- 既有红基线（照抄，不要当成本轮引入）：`publish_ui_model` 9/7、`first_online`、`reader_distribution`、`deletion_distribution(+workerd)`。
