# 检查点日志（checkpoint journal）

> **用途**：只记录**本工作线**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)，本文件不复制、不替代原始证据或验证。
> **历史归档**：旧编号批次（EDITOR-UI UI-1…UI-14、B1–B8 工作台重构、章節創作七步、方案 B 的 A/B/C 批、ui7–ui11 上线流水、
> 玩家标题页四项视觉收口、字号排查）已从正文移除。CHANGELOG 等文档仍引用 §6／§10／§11／§13／§19–§33 一类旧锚点，需要细节请用
> `git log -p -- docs/checkpoint-journal.md` 追溯；仍被主动引用的锚点保留在文末「归档锚点」。

## 1. 本工作线概览

主题：**上架链路可靠性 + 玩家端发布方式改手动**。生产镜像 `20261105-bc1-ui7c` → `ui8` → `ui9` → `ui10`（`823d54ae…`）→ `ui11`（`12cee783…`）→ `ui12`（`55a75da2…`）→ `ui13`（`d699f9e9…`）→ **`20261106-bc1-ui14`（`e68316f8…`，当前）**。

| commit | 内容 |
| --- | --- |
| `f8f9b1f` | 上架不再依赖单次长连接（POST 一次 + 每 5 s 轮询幂等查询端点）；追踪提示可辨识目标 |
| `e5f3a5d` | ui12 部署记录 |
| `b5072af` | 回执遗失后重送不再多占一个版本（`pendingIdentical`／`bindIdentical`） |
| `5799ebc` | `CanonicalSourceParser` 2.2×（校驗／上架共用）＋重建 trialweb 束 |
| `f595158`／`9e09c0b` | ui13／ui14 部署记录与部署坑 |
| `455744e` | `vps/manual-static-build.sh` ＋手动发布手册（§15.6）；CF Git 集成已断开 |

当前 digest：玩家站 `static-release.json` = **`72ec1c31e1a37f7e9f23118ca443cdf6c3500c030650ccfe5074a5683a9b1bb2`**（223595 B、1441 文件、167.39 MiB），sourceTree = `93faf8d99b2f51166fcf4ab30e491d8fa37bc20f26bde69ea78264d036549873`，与 VPS `publication.env` 三处 pin 一致。玩家 Worker 当前 Version `ba4d2794-d347-4abf-9294-d62754024e9e`。

## 2. 上架管理：190–205 s 回执被链路切断（生产实测，2026-11-06）

用户截图问「校驗成功但上架按鈕暫停／玩家端加载不出来」。直查 `dartnode4`（只读）得到：

```text
POST /api/publish                          ms=194451 / 203927 / 190417  → INTERNAL_ERROR "Premature close"
POST /api/admin/copies/<id>/run            ms=144108                     → 同样 Premature close
GET  /api/games/<id>/draft/chapter-references  ms=37169 / 38466 / 42652
```

- nginx access 对这三次上架全部记 `499`（客户端先断）；容器内事务仍跑完并提交 → **上架、编译、冻结、分发全都已成立**，只差管理员「同意」（`listed=0`，所以玩家目录里没有它：`web/src/player/playerpublic.js` 找不到 directory 条目即 `showFailure`）。
- 三处超时都不是「100 秒」：`server/public/client.txt` POST 600 s；nginx `location /` 的 `proxy_read_timeout/proxy_send_timeout` 也是 600 s。`dragon-editor.720108.xyz` 确在 Cloudflare 后（`server: cloudflare`＋`cf-ray`），非 Enterprise 的 100 s 边缘上限不可调，但连接能活到 190 s 以上，所以这里是被链路／边缘静默丢掉，不是计时器砍的。
- 库里同一时刻：`content_releases` 版本 **1.0**、`published_packs` 20 章＋6 资产、`content_distribution_state` tail=confirmed=**9**、outbox 空、`content_announcements` 空。
- 「永远循环」的真正成因：请求 190–205 s → 用户等不下去刷新 → 连接断在响应前 → 追踪键保留 → 按钮永久灰；**服务端其实已经成功**。

## 3. 上架改轮询（根治，`server/public/publish.txt`）

`publishOutcome(t, ctx)` 取代 `send()` 里对 `/api/publish` 的单一等待：

- POST **只发一次**（同一把 Idempotency key，绝不重送）；同时每 5 s `GET /api/games/<id>/publish-operations/<key>`（既有幂等端点，服务端零改动），**先到者胜**。
- 只有「没有 HTTP 状态码」的连线层失败才转纯轮询；服务端任何答复（4xx／5xx）照原样抛出。轮询里 404 `PUBLISH_OPERATION_NOT_FOUND`（还在编译）与 5xx／断线继续等，其余 4xx 立即拒绝。
- `PUBLISH_POLL_BUDGET_MS = 10 分钟`；超时只报「结果未知，稍后按查詢原操作核对，不要重送」，**不清追踪键、不写成失败**。
- 轮询命中时 `distribution` 取回执自带描述子，不再补发一次 `query()`。
- 配套（同 commit）：`shortId`／`targetText(t)` 让暂停原因、追踪提示、失败补语统一为「名称＋清单中建立时间＋当前状态＋编号前 8 码」，目标不在清单时直说「已不在清單」；`stuckHint()` 统一失败补语；`query()` 命中后 `store(null)` 结案＋`load(ctx)` 重读清单；`render()` 末尾加「下一步：由管理員在「審核」按「同意」，玩家端目錄才會出現」。
- 验证：纯内存 probe（已删）——POST 永挂＋轮询第 2 次命中 → 10.0 s 完成、`/api/publish` 只 1 次、journal 清空；POST 连线失败＋轮询命中 → 完成；POST 422 → 不轮询、立即拒、清键；轮询 403 → 5 s 内拒绝。`verify_publish_ui_model` 9 pass／7 fail（与改前逐一同名，既有红）。

## 4. 回执遗失后重送不再多占一个版本

历史问题：每次「看不见回执」的重发都多一版 release（14:53、15:02 各留一份）。规则与取舍的详细维护源见 [r2-player-connection.md §2.74](r2-player-connection.md)。

- `ReleaseLedger.pendingIdentical(tokenHash, gameId, draftRevision, sourceDigest)`：要求 `current_release_id` 存在、`listed=0`、该 release 的 revision+digest 与当前一致、`content_announcements` 无该 release（挡「上过又下」）、`content_audits` 无 `admin-reject` 且 `before_revision=该 ordinal`。
- `PublishOperations.bindIdentical(tokenHash, ticket, releaseId)`：经 `#authority`／`#replay` 校验后，把**原回执字节**插到新键的 `content_reservations`＋`content_operations`（不新增 release／序號）；名称不同返回 null，`releaseId !== operation.releaseId` → `PUBLISH_STALE`。
- `server/editorapp.js#publishPin` 在 `snapshotReference` 后先试复用，命中即跳过验证与编译（**取舍**：不重跑 `chapterReferenceReport`／`validateGameSource`）。
- 验证：新增 `tools/verify_publish_identical_replay.mjs` 6 组全过；`verify_publish_sync` 起初因「复用旧回执却不给新键留记录」而 404，改为绑定后全绿；`publish_operations／matrix／atomicity／operations_root／to_r2／release_candidates／atomic_builtin_release／copy_publish_parity／frozen_publication_root／distribution_publisher*` 全 PASS。

## 5. 校驗／上架共用的源码解析 2.2×（`web/src/content/authoring/sourcejson.js`）

`CanonicalSourceParser` 改跳段扫描：字符串内一次 `stringBreak` 正则定位下一个 `"`／`\\` 并整段 `slice`，scalar 用 sticky `scalarRun` 整段取，结构字符按 charCode 比较；无反斜线的 token 直接 `slice` 去引号，只有整数／`true/false/null` 才直接得值，其余仍走 `JSON.parse` 并校验 `scalar(value)===token`（错误码与顺序不变）。`#value` 用 `frame.value[key]=value` 取代 `Object.defineProperty`。

- 实测（容器内、真实 45 MB／44 chunk 生产源）：parse **6.46→2.71–3.26 s**；`verifyStored` 8.27→**4.27 s**。IO 只有 168 ms，不是瓶颈。`JSON.parse` 整份 0.6–0.7 s 是理论下限，再降要动 worker 线程级，未做。
- 差分验证：新增 `tools/verify_source_parser_equivalence.mjs`（5 tests，全过）内嵌**旧 parser 原文**逐位对比：多 chunk 切分 × canonical 值、40+ 条非规范／恶意文本、预算触发点、400 轮 fuzz、`decodeSourceChunks` 字节路径。
- 回归面：41 个引用 sourcejson 的 `verify_*` 改前／改后 pass／fail 集合完全一致。
- 未做：`chapter-references` 单次仍 37–42 s，其主体是单线程 event loop 被上架／编译占住（并发 190 s 请求排队），不是算法本身。

## 6. 玩家端改手动构建（用户决定，2026-11-06）

用户要求：同仓的玩家端原本由 push 触发 Cloudflare 自动构建，**关掉它，改手动**。理由是 pin drift：push 一改 `web/` 就立刻换玩家端 digest，而 VPS pin 不跟随 → VPS 一重启就 `startup-failed`（本次因此不可用约 28 分钟，CST 19:41–20:09）。

- 触发源确认：仓库无 `.github/workflows`；`dragon.720108.xyz` = Worker `dragon` + Static Assets + **Workers Builds Git 集成**。本机 wrangler 是 OAuth 登录，`GET /accounts/<acct>/builds/workers` 返回 `code 10000`，CLI 无 `builds` 子命令 → 命令行关不掉，由用户面板断开。
- 新增 `vps/manual-static-build.sh`：`git -c core.autocrlf=false archive HEAD` → 临时目录跑 `tools/prepare_deploy.mjs` → 打印 `static-release.json` 的 sha256 → 生成去掉 `build.command`、路径为绝对值的 `wrangler.deploy.jsonc`。实测 **11–12 秒**产出 `72ec1c31…`／1442 文件／167.39 MiB，与线上逐位相同。
- 手册：[game-storage-layout](game-storage-layout.md) §15.6。顺序不可颠倒：本地构建 → `wrangler deploy -c wrangler.deploy.jsonc` → 放 VPS 静态目录 + nginx location → **切镜像** → 最后改 `publication.env` 三处 pin → recreate。
- **手动 deploy 实测**：14 秒（内容相同 → `No updated asset files to upload`，只传 worker 53.63 KiB / gzip 12.49 KiB），新 Version `ba4d2794…`。deploy 前后线上逐项相同（`static-release.json` 223595 B／`72ec1c31…`／etag `"433c5d01…"`、`/` 200／33114 B、`registry generation 10`／`9071fd5b…`）→ **重复手动发布是幂等的**。
- **断开生效的验证探针**：Workers Builds 会给每个被构建的 commit 写 check-run `Workers Builds: dragon`。断开前 `9e09c0b` 有（completed/success，2026-11-06T12:11:30Z），断开后 `455744e` 在 4.5 分钟内**一条都没有**。
  ```bash
  gh api repos/tianyi092-jcza/dragon/commits/<sha>/check-runs --jq '.check_runs[] | [.name,.status,(.conclusion//"")] | @tsv'
  ```

## 7. 部署流水（本工作线）

| 镜像 | commit | 内容 | 首启 |
| --- | --- | --- | --- |
| `ui12`（`55a75da2…`） | `f8f9b1f` | 上架轮询（仅前端 `publish.txt`） | 7 min |
| `ui13`（`d699f9e9…`） | `b5072af` | 重送复用（仅服务端） | 7 min |
| `ui14`（`e68316f8…`） | `f595158` | parser＋锁步 digest `72ec1c31…`／`93faf8d9…` | **23 min**（R2 无该 digest） |
| 手动 deploy | `455744e` | 玩家端 Worker Version `ba4d2794…` | 14 s（内容不变） |

ui14 步骤：服务器 LF 检出跑 `prepare_deploy.mjs` 复现 inventory → `dist/` 放 `/home/web/html/dragon-editor-bootstrap/72ec…/`（1442 文件、171 MiB）→ 花括号深度复制 location 块＋reload → 公网验 `static-release.json` 200／`72ec1c31…`、`sourcejson.js` `80a7fac5…` → 改三处 pin（备份 `.before-72ec1c31…`）→ 备份数据 → 切 `app`＋`.env` → recreate。验收：`/api/health initialized:true`、玩家 `/program-assets/72ec…/data.json` **200**、`registry generation 10`、日志只有 `started`＋`distribution-idle`、error 计数 0。

回滚点：`app-prev23-20261106T114510Z`、`app-prev22-20261106T112142Z`、`publication.env.before-72ec1c31…`、nginx conf `.before-72ec1c31…`、备份 `publication-20261106T112112Z`／`…T080248Z`。

## 8. 用户指定五档提速（归档摘要）

用户指定五档 6.5／5.0／4.8／1.8／1.0ms，每 RAF 最多 16 更新；60Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示相位。现行口径与后续复验见 [战略时序](re-notes-strategic-time.md)，长期约定见 [AGENTS.md](../AGENTS.md) §3。

## 9. 本轮失败尝试与坑

1. **先改 pin 再切镜像 → `startup-failed` 循环**：`backup-publication.sh` 结尾自己跑 `docker compose up -d`，pin 变了 compose 就用**旧镜像**重建，旧 `web/` 与新 `STATIC_SOURCE_SHA256` 不匹配。正确顺序：镜像内 `VERIFY_OK` → 切 `app`＋`.env` → 最后改 `publication.env` → recreate。
2. **`core.autocrlf=true` 时 `git archive` 会给未声明 `eol` 的文本文件补 CRLF**：45 个文件、+0.43 MiB（`content/builtin/chapters/*.json` 每行 +1 字节，`later-1.json` 7693 行 = +7693 字节），而 `sourceTreeDigest` **不变**（只覆盖 `.gitattributes` 里显式 `eol=lf` 的 `web/src/**.js` 与 `web/intro/styles.css`）→ 表现为「digest 对上了、inventory sha 对不上」（`f1582a85…` vs `72ec1c31…`）。必须 `git -c core.autocrlf=false archive`；判据是 `dist/static-release.json` 的 sha256 等于线上同名文件。
3. **新 digest 首启要 23 分钟**：`archiveStaticProgram` 先从 `STATIC_ORIGIN` 下载 1441 文件核 sha 再上传 R2（RX 536 MB／TX 184 MB）；R2 已有同 digest 时只需 7 分钟。期间服务不可用。
4. **CF 边缘会静默切断长响应**（190–205 s 的上架请求）：延长超时无解，唯一可靠做法是不依赖单次长连接（§3 的轮询）。
5. **wrangler 在本机必须去掉代理变量**：`HTTP(S)_PROXY`／`ALL_PROXY` 会让它卡死，用 `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy`。git-bash 下 node 不认 `/e/...`，脚本里用 `pwd -W` 转盘符路径。
6. **全仓 grep 会超时**：`dist/` 1441 文件／168 MB；限定 `web/src editor-ui/src server/*.js tools/*.mjs`。

## 10. 当前阻塞

1. **既有红（不阻塞，但不许写成全绿）**：`verify_first_online`、`verify_reader_distribution`、`verify_deletion_distribution(+_workerd)`；`verify_publish_ui_model` 9 pass／7 fail；`verify_editor_copy_controller`、`verify_editor_backend_admin_copy`；`verify_publication_ui` 的 `TypeError`、`verify_editor_shell` 的 `publish-vue-owned`（均改前既有）。
2. **玩家目录为空**：用户已手动删除「卧龙传·重构版」，库里 `content_games`／`releases`／`published_*`／`announcements`／`audits`／`copy_objects`／`snapshots`／`deletion_fences` 全 0，`registry generation 10`／`directory:[]` → 正式开局与端到端上架都需要先重新造一个游戏。
3. **惰性残留**：`content_operations` 10 条、`content_reservations` 13 条（target 指向已删 gameId，不会误命中新游戏）；`publication-data/private-objects/private/` 仍有 4 目录 196 文件 191.8 MB 未物理回收；账本剩 2 条历史事件＋1 条 cleanup 行，直删会 `DISTRIBUTION_LEDGER_CORRUPT`。
4. **7 张 `content_distribution_*` 与 drainer 仍在**；下线前置是生产实测一次 20 章上架端到端耗时（已有 212 s 数据）。

## 11. 下一步（建议顺序）

1. 重新造一个游戏（20 章）走完整链路：复制 → 全面检验 → 上架（现在应 10 s 内拿到轮询回执）→ 管理员同意 → 玩家端开局，端到端测一次耗时与可见性。
2. 若上架面板仍出现长时间无回执，用 `GET /api/games/<id>/publish-operations/<key>` 直接核对，别再重送。
3. 校驗 37–42 s：下一步只能把编译移出主线程（worker／子进程），需单独设计批准。
4. C 批剩余：下线 7 张 `content_distribution_*` + drainer；`verify_publish_ui_model` 的 7 条行为断言 re-baseline。
5. 通用审计 `audit_events`（审核／删除／账号变更）仍未立项。

## 12. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`（见 §8）；其余旧锚点（§26–§49）已无外部引用，需要时用 git 历史追溯。
