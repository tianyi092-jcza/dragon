# 检查点日志（checkpoint journal）

> **用途**：只记录**本轮会话**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)，本文件不复制、不替代原始证据或验证。
> **历史归档**：旧编号批次（EDITOR-UI UI-1…UI-14、B1–B8 工作台重构、章節創作七步、方案 B 的 A/B/C 批、早期部署与迁移归因）
> 已从正文移除。CHANGELOG 等文档仍引用 §6／§10／§11／§13／§19–§33 一类旧锚点，需要细节请用
> `git log -p -- docs/checkpoint-journal.md` 追溯；仍被主动引用的锚点保留在文末「归档锚点」。

## 1. 本轮会话概览

起点是「读记忆 → 按建议顺序继续」，实际跑完的是：v0.1.11 上生产 → 第一次真实上架 → 玩家站 503 根因与修复 → 编辑器三项产品收口 → 玩家标题页四项视觉收口 → 三次 digest 锁步部署（ui8／ui9／ui10）→ 系统资源模块改版（头像 621）→ 上架面板「校验成功但按钮禁用」的根因与提示改造（ui11）。

| commit | 内容 |
| --- | --- |
| `c1760ce` | 部署记录 + 服务器侧取源配方（`game-storage-layout` §15） |
| `ff37768` | 编辑器：上架管理去「刪除」、审核页物理删除改自有遮罩层、`forgetGame` 清上下文、下拉幽灵项删除 |
| `608b418` | §4.40 部署记录（ui8） |
| `0cf0a22` | 玩家标题页四项视觉收口 + 内置游戏名繁体 |
| `eed4181` | 章节列表合集前缀 `[重制]`→`[重製]` |
| `8ae316a`／`d8526cf` | 存档弹窗放大到 448×368、字号按 canvas 规格统一 |
| `027ca99` | 游戏选择下拉框字号 14px→16px |
| `eb94103` | 编辑器系统资源：头像 621、筛选上提同行、头像改相册（＋两个陈旧门修复） |
| `579fb23`／`7d985db` | 记忆整理；ui10 锁步部署记录 |
| `b23f6bc` | 头像相册改横向排布（序号固定列对齐）、上架按钮禁用时给出原因（`blockedText`） |

生产镜像沿革：`20261105-bc1-ui7c` → `ui8`（`c3376df5…`）→ `ui9`（`9085eb95…`）→ `ui10`（`823d54ae…`）→ **`20261106-bc1-ui11`（`12cee783…`，当前）**。
玩家站 static release digest：`b41ffe54…`(D2)→`a9438b77…`→`7909bb66…`→`7ccef941…`→`52be51d2…`→**`51bb2347a64190971b70564cc840e813f1f05af0d101526e7136f2183828c161`（当前，与编辑器 pin 对齐）**；sourceTree `2ecb54f6…`。

## 2. 玩家标题页 UI（用户 m722／m824）

需求四项：①「不可用存檔管理」改成带「!」的图标钮，放在右上三颗圆钮（`intro/scene.html` 的 sound/replay/skip，20/70/120px）下面；②悬停出文字「不可用存檔」，弹窗改用中央「新游戏」同款云纹金框、缩小、标题改「不可用存檔」、说明精简、去掉「重新檢查本機目錄」（打开即自动检查）；③删掉左侧竖排「三國制霸之計」；④点新游戏后，把上一页选择框里的游戏名显示在章节窗上方（同宽、距页顶 40px、同云纹样式）。另加：内置游戏名应为繁体。

- 新增 `web/src/player/cloudframe.js`：`loadCloudFrameImages()`＋`paintCloudWindow(ctx, images, w, h)`（16px 格、上下 `frame_sq` 逐 8px、左右 `frame_cap`+`frame_col`、内部 32×32 `cloud` 平铺）。弹窗与游戏名标签共用。
- `playercatalog.js`：manage 钮改 40×40 圆钮（`right:max(20px,env(...)); top:170px`），`aria-label="不可用存檔"`，悬停／聚焦才显示药丸文字；弹窗最终 448×368（＝章节窗同尺寸，`8ae316a`），打开即 `inspect()`，无重查按钮。
- `startmenu.js`：`_gameNameBanner(name)` 用 DOM canvas（`#startv` 居中 640×400，画在 canvas 内落不到页顶 40px），`left = startv.left + 88*scale`、宽 464、`top:40px`；`finally` 保证退出/取消移除。`_chapterRows()` 前缀改 `[重製]`。
- `intro.config.js`：`subtitle.text` 置空——节点与淡入时序保留，菜单放出时机不变（`verify_opening_browser` 仍绿）。内置名改繁体 `臥龍傳·三國制霸之計（內置）`。

**坑**：①内联 `style.display` 会盖掉 `[hidden]`；②钮与弹窗 `aria-label` 同名后 `querySelector` 先命中按钮，测试要加 `[role="dialog"]`。

## 3. 部署：锁步与三个坑

Cloudflare 在 push 后自动构建部署（实测 **~50 秒到 3 分钟**）。判据：`/src/player/cloudframe.js` 200、`/src/ui/startmenu.js` 含新串、`/static-release.json` 摘要、`wrangler deployments list`。`web/` 一变 digest 就变，而 `reader/programentry.js` 只认 R2 `control/programs/` 里已登记的 digest → 未锁步时**正式入口（`?formalGame=`）会 503**；普通首页走 ASSETS，不受影响。

1. **pin 与镜像必须同源**：`vps/publication-main.mjs` 监听前用 `verifyInstalledProgram` 比对镜像内 `web/`＋`trialweb.txt` 与 `STATIC_SOURCE_SHA256`。只改 pin 不重建镜像 → `{"event":"startup-failed"}` 崩溃循环、编辑器 502 约 35 分钟（16:23–16:57，回滚 `publication.env.bak-pins-20261105T162255Z` 后 11 分钟恢复）。
2. **R2 登记可能被静默跳过**：B8「R2 不是开机条件」，归档传输错误判 `unreachable` → 服务照常起、日志只有 `started`＋`distribution-idle`，但 `control/programs/<digest>.json` 缺失。容器内 `r2client.list(...)` 为空就**再重启一次**（幂等）。
3. **nginx 在容器里**：`docker exec nginx nginx -t|-s reload`；复制 `location` 块要**按花括号深度**取块尾（块内有嵌套 `types {}`）。

口径：`git archive HEAD <path> | tar -xO | sha256sum` 才等于服务器落地字节（3 个 `eol=crlf` 文件裸 blob sha 会假失败）；Windows 工作树直接 `prepare_deploy` 得错 digest，要用 LF worktree。

## 4. 字号排查（用户 m1079／m1090）

弹窗四行全是 `16px / 400 / line-height 24px`、同一字体，差异只在 `opacity .8`、对齐与间距——不是三种字号。下拉框按要求改 16px（notice 仍 14px，高度都是 28px）。

## 5. 系统资源模块（用户 m1107／后续两轮）

需求：①471 张新头像并入「系統資源」头像（与原有 150 张共用）；②筛选与 TAB 同行、靠右上，不占下方高度；③头像改相册；④卡片＝序号-头像-路径（换行）大小；⑤后续再要求：**路径与 bytes 两行放头像右侧，序号固定宽以保证列对齐**。

- **120→128 是必要的（实锤）**：`web/src/ui/gamebar.js:5535`／`:8619` 都是 `drawImage(img, 0, 0, 128, 128, x, y, 64, 64)`，源矩形固定 128×128。用 Pillow `LANCZOS` 原地放大 471 张，重建 `web/kao/manifest.js`（621 条），`verify_kao_library` 通过。
- **不改任何 pin、不重算 available-library**：`server/editorapp.js#getResources` 追加 `GamePortraits` 里未收录的 `kao/<id>.png`（150→621）；`#getResourceAsset` 对 `kao/<id>.png` 走 `#portraitBytes(id)`（`readSharedPortrait`＋sha256），失败时回退图书馆，否则 `404 RESOURCE_NOT_FOUND`。
- 布局最终版（`b23f6bc`）：`.resource-gallery` `grid minmax(260px,1fr)`；卡片 `grid-template-columns:2.6em 64px minmax(0,1fr)`——序号右对齐固定列、头像 64px、`figcaption` 在右侧竖排「路径／bytes 大小」；序号列固定宽保证同一列卡片对齐。
- 顺手修的陈旧门：`verify_editor_workbench_browser` 的「上架管理必须有删除按钮」→「必须没有」；draft 幽灵项断言改占位；并修真 bug：`DraftPanel.vue` 的 `:value` 在游戏不在清单时落空，占位文案不显示（改 `model.selectionMissing ? '' : model.fields.gameId`）。
- 实测（dev_editor 8445/8446 ＋ Playwright）：`頭像 621／圖像圖塊 226／音樂與音效 13／字體 2／其他 9`，卡片 621，筛选与 TAB 同行；`/api/resources/asset` 抽验 `kao/0.png` 200/1573B、`kao/p0001.png` 200/35580B、`kao/p0471.png` 200/33393B；`p0471` 自然尺寸 128×128；布局截图 `.dragon-analysis/gallery-v2.png`。该门 219 checks pass。

## 6. 上架管理：校验语义与「按钮禁用」根因（用户截图问询）

**结论：`檢驗完成` 只表示「章节引用检查通过」，不等于完整编译或发布通过；按钮灰不是校验失败。**

- `server/public/publish.txt` 的 `render` 里 `blocked = Boolean(pending) || badJournal`，**与校验结果无关**。`pending` 是 sessionStorage `editor-submission-operation:<user UUID>` 恢复出来的持久追踪元组（上次上架请求的结果还没确认）。截图底部本来就有「未确认的旧上架操作／查詢原操作」，所以按钮灰、校验照样可用。
- `check(gameId)` 只发 `GET /api/games/<id>/draft/chapter-references`，`chapters=[]` 时消息写「校验成功／全部引用完整」并 toast「檢驗完成。」；非空写「檢驗未通過」。完整发布另有校验，不在这一步。
- 本轮改造（`b23f6bc`）：`publish.txt` 新增 `blockedText()`＋模型 `blockedReason`＋每行 `publishHint`；`PublishPanel.vue` 在 message 后显示 `#publish-blocked` 提示块、按钮 `title` 用 `publishHint`。有 pending 时校验成功文案改为「校驗成功！全部 20 章引用完整；但上架按鈕目前暫停，原因見下方說明」。对 pending 建议**先查询原操作再「只停止本機追蹤」**恢复按钮；对 badJournal 建议清掉记录后再上架。**没有改追踪安全逻辑**：未知结果时不应建议盲清重发。
- 验证：`verify_editor_workbench_browser` 219 checks（两次通过，最后一次 `.dragon-analysis/editor-workbench/run-XQ7Qqq`）；`build --check` `shell-ui.js` 710569 B／`shell-ui.css` 54698 B；`verify_publish_ui_model` 仍 9 pass／7 fail（既有红）。临时纯内存 probe（已删）验证过：pending 时 `publishDisabled=true` 且提示与校验成功并存。probe 早期失败的三个原因：缺 `user.role`、非法 UUID／key、缺 `receipt.version`。

### 6.1 生产实测（2026-11-06 15:5x）：上架其实全部成功，只是回执被切掉

用户问「为何卡 100 秒、能不能延长」，并给了 164 秒遮罩截图。直查 `dartnode4`（只读）得到的实锤：

```
POST /api/publish  ms=194451 / 203927 / 190417  →  request-failed INTERNAL_ERROR "Premature close"
POST /api/admin/copies/<id>/run  ms=144108      →  同样 Premature close
GET  /api/games/<id>/draft/chapter-references  ms=37169 / 38466 / 42652
```

- nginx 访问日志对这三次上架全部记 `499 0`（客户端先断）；容器内仍把事务跑完并提交。
- 三处超时都不是我们的 100 秒：`server/public/client.txt` POST 超时 **600 s**；nginx `location /` `proxy_read_timeout/proxy_send_timeout` **600 s**。域名 `dragon-editor.720108.xyz` 确实在 Cloudflare 后面（`server: cloudflare`＋`cf-ray`），非 Enterprise 的 100 s 边缘上限**不能调**；但本次日志显示连接能活到 190 s 以上，所以这里不是 100 s 计时器砍的，而是长连接被链路／边缘静默丢掉。**结论：延长超时无解，唯一可靠做法是不依赖单次长连接（后台任务＋轮询既有 `publish-operations` 查询端点）。**
- 数据库实况（同一时刻）：`content_games` 只剩 `63803a5e…`（`listed=0`、`current_release_id=6d9cdb0c…`），`content_releases` 版本 **1.0**、`published_packs` 20 章＋6 资产、`content_distribution_state` tail=confirmed=**9**、outbox 空 → 上架、编译、分发**全部已成立**，只差管理员「同意」（`listed` 仍 0，所以玩家目录没有它；`content_announcements` 空也是同一个原因）。此前两次 `415a5f8a…` 的上架也各留下一份 release（06:53、07:02），即每次「看不见回执」的重送都会多一版。
- 因此「永远循环」的真正成因是：请求 190–205 s → 用户等不下去刷新／重开 → 连接断在响应之前 → 跟踪键保留 → 按钮灰；服务器其实已经成功。

本轮最小改动（`server/public/publish.txt`，仅前端 controller）：

1. 新增 `targetText(t)`／`shortId`：暂停原因、跟踪提示、失败补语统一写成「名称＋清单中创建时间＋当前状态＋编号前 8 码」；目标已不在清单时直说「已不在清单（可能已删除，或不在当前账户）」，不再和同名新副本混在一起。
2. `stuckHint()` 统一动作失败后的补语：目标不在清单 → 建议「只停止本机追踪」；仍在清单 → 保留同一请求、先查询。
3. `query()` 命中回执后 `store(null)` 结案＋`load()` 重读清单，避免「查到了、按钮还是灰的」与「状态还显示草稿」；`render()` 的上架结果补一句「下一步：由管理员在审核按同意」。
4. 验证：`verify_publish_ui_model` 9 pass／7 fail（与改前逐一同名，非新增红）；`verify_chapter_references` 8 checks 通过；`verify_publication_ui` 的 `TypeError` 改前改后一致（既有红）。纯内存 probe 验过：pending+已不在清单、pending+在清单、查询命中后 `blockedReason` 清空／journal 清空／`publishDisabled=false`、查询 404 的补语。

### 6.2 根治循环：上架不再依赖单次长连接（用户批准后实施）

`server/public/publish.txt` 新增 `publishOutcome(t, ctx)`，替换 `send()` 里对 `/api/publish` 的单一等待：

- POST 仍然**只发一次**（同一把 Idempotency key，绝不重送）；同时每 5 秒 `GET /api/games/<id>/publish-operations/<key>`（已有幂等查询端点，无需新协议、不改服务端），**先拿到确定答案的赢**。
- 只有「没有 HTTP 状态码」的连线层失败才转纯轮询；服务端任何答复（4xx／5xx）照原样抛出，4xx 仍按既有规则解除跟踪键。轮询里的 404（`PUBLISH_OPERATION_NOT_FOUND`＝还在编译）与 5xx／断线继续等；其余 4xx 立即拒绝。
- 上限 `PUBLISH_POLL_BUDGET_MS = 10 分钟`；超时只回报「结果未知，稍后按查询原操作核对，不要重送」，**不把未知写成失败**，也不清跟踪键。
- 轮询得回执时 `distribution` 直接取回执里的分发描述子；此时不再多发一次 `query()`（避免重复 GET，也让 `A 路线` 测试的「待确认仍补查一次」仍只算 1 次）。
- 验证（纯内存 probe，已删）：POST 永掛＋轮询第 2 次命中 → 10.0 s 完成、`/api/publish` 只 1 次、journal 清空；POST 连线层失败＋轮询命中 → 完成；POST 422 → 不轮询、立即拒、清键；轮询 403 → 5 s 内拒绝，不等满 10 分钟。`verify_publish_ui_model` 仍 9 pass／7 fail（与改前逐一同名）。
- 已知残留：`chapter-references`（校驗）単次也要 37–42 s，与上架同源的 `captureForCompile` 是慢点；本批不碰，但它是下一个值得拆的性能口。

## 7. 失败尝试与坑（不要重做）

- **本机→VPS 上行废了**：5 MB 探针 316 s（≈16 KB/s），168 MB tgz 3 分钟只走 540 KB 后断连。改服务器侧 `git fetch --depth 1`。
- **只回滚 pin 不够**（见 §3 第①条）：先建镜像、镜像内 `verifyInstalledProgram` 得 `VERIFY_OK`，再换 pin。
- **全仓 grep 会超时**：`dist/` 1441 文件／168 MB；限定 `web/src editor-ui/src server/*.js tools/*.mjs`。
- **`option:checked` 在 select 无匹配时为空**：断言占位文案用 `selectedOptions[0]?.textContent`。
- **dev_editor 首次登录表单有三个输入框**（目前密碼／新密碼／確認新密碼）。
- **`pragma_table_xinfo(?)` / `pragma_foreign_key_list(?)`** 必须绑定参数；不要 grep 单行的 `server/deletiondefinitions.js`。
- **Cloudflare 100 秒**：生产上架端到端 212 s，浏览器侧被切断（`Premature close`／很可能 524），服务端仍成功——「上架超时上报失败」仍是待修缺陷。

## 8. 用户指定五档提速

（归档摘要）用户指定五档 6.5／5.0／4.8／1.8／1.0ms，每 RAF 最多 16 更新；60Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示相位。现行口径与后续复验见 [战略时序](re-notes-strategic-time.md)。

## 9. 本轮部署交付（2026-11-06，镜像 `ui10`→`ui11`）

**ui10（锁步，解 503 阻塞）**：服务器侧浅取 `579fb23` → `prepare_deploy` 得 digest **`51bb2347…`**（与玩家站现有 digest 相等，1442 文件／167.39 MiB）→ 镜像 `ui10`（`823d54ae…`）→ 容器内 `VERIFY_OK` → 备份（旧 app `app-prev19-20261106T052026Z`）→ dist 落 `dragon-editor-bootstrap/51bb2347…/` ＋ nginx 新 location（按花括号深度插入）→ 三 pin 换 `51bb2347…`／`2ecb54f6…` → 重启**约 25 分钟** healthy（05:21→05:46，新 digest 首启归档 168 MB）；R2 首次启动就登记成功（没触发 §3 第②坑）。

验收：玩家 `/program-assets/51bb2347…/data.json` **200**（旧：503）；`?formalGame=…&mode=new` → 200＋`x-program-digest: 51bb2347…`；编辑器 `/api/health` 200、`/deployment-assets/static-v1/51bb2347…/static-release.json` 200；`/shell-ui.js` sha256 与本地 `server/public/shell-ui.txt` 相同；`/api/resources` 匿名 401。

**ui11（上架提示与相册排布，无 digest 变化）**：浅取 `b23f6bc` → `app-new20` → 镜像 `20261106-bc1-ui11`（`12cee783…`）→ 容器内 `VERIFY_OK`（sourceTree 仍 `2ecb54f6…`）→ `backup-publication.sh` → `.env` tag=ui11，`app`→`app-prev20-<TS>`、`app-new20`→`app` → `compose up -d --force-recreate`；06:29 起 starting/502，**06:36:05 healthy/200**，日志 `started`＋`distribution-idle`。因为 `web/` 未变，`prepare_deploy` digest 仍是 `51bb2347…`，所以**没有新 pin、没有 nginx 改动、没有玩家端部署**。

## 10. 当前阻塞

1. **既有红（不阻塞，但不许写成全绿）**：`verify_first_online`、`verify_reader_distribution`、`verify_deletion_distribution(+_workerd)`；`verify_publish_ui_model` 9 pass／7 fail；`verify_editor_copy_controller`、`verify_editor_backend_admin_copy`。
2. **账本**剩 2 条历史事件 + 1 条 cleanup 行属惰性遗留；直接删会触发 `DISTRIBUTION_LEDGER_CORRUPT`，等 7 张 `content_distribution_*` 一起下线时清。
3. **7 张 `content_distribution_*` 与 drainer 仍在**；下线前置是「生产实测一次 20 章上架端到端耗时」（有 212 s 数据，但伴随「超过前端等待上限被报失败」缺陷）。
4. **某个账号的旧上架追踪未确认**（用户截图里那个游戏）：需要点「查詢原操作」拿到确定结果，再决定是「只停止本機追蹤」还是重试；不要盲清重发。
5. 上架面板三个按钮是否删除仍待用户裁决；**玩家目录为空**（游戏被删除测试物理删掉），需重新上架才能测正式开局。

## 11. 下一步（建议顺序）

1. **手测新 UI**：玩家标题页四项＋编辑器「系統資源」621 头像相册；上架管理里对那个未确认的旧操作先「查詢原操作」，确认后再恢复上架按钮。
2. 重新上架一个版本（20 章）把玩家 registry 填回，端到端测一次开局。
3. 修「上架超过前端等待上限被报失败」（Cloudflare 100 s）：后台任务＋轮询，或让前端接受晚到回执。
4. 通用审计 `audit_events`（审核／删除／账号变更）仍未立项；用 `game_releases` 的真实字段反推结构，不先设计。
5. C 批剩余：下线 7 张 `content_distribution_*` + drainer；`verify_publish_ui_model` 的 7 条行为断言 re-baseline。

## 12. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`；其余旧锚点（§26–§49）已无外部引用，需要时用 git 历史追溯。
