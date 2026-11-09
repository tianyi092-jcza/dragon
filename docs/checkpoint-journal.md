# 检查点日志（checkpoint journal）

> **用途**：只记录**本工作线**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)，本文件不复制、不替代原始证据或验证。
> **历史归档**：旧编号批次（EDITOR-UI UI-1…UI-14、B1–B8 工作台重构、章節創作七步、方案 B 的 A/B/C 批、ui7–ui11 上线流水、
> 玩家标题页四项视觉收口、字号排查）已从正文移除。CHANGELOG 等文档仍引用 §6／§10／§11／§13／§19–§33 一类旧锚点，需要细节请用
> `git log -p -- docs/checkpoint-journal.md` 追溯；仍被主动引用的锚点保留在文末「归档锚点」。

## 1. 本工作线概览

主题：**上架链路可靠性 + 玩家端发布方式改手动 + 方案 B 迁到自有 VPS**。编辑器镜像 `20261105-bc1-ui7c` → … → `20261107-bc1-ui15`（`3295ad99…`）→ `20261107-bc1-ui16`（`9a99154`）→ **`20261107-b2-disk`（方案 B，当前）**；玩家镜像 **`dragon-player:20261107-b2-disk2`（当前）**。两端都跑在 `sadcloud`，Cloudflare 与 R2 已下线（§1.2）。

| commit | 内容 |
| --- | --- |
| `f8f9b1f` | 上架不再依赖单次长连接（POST 一次 + 每 5 s 轮询幂等查询端点）；追踪提示可辨识目标 |
| `e5f3a5d` | ui12 部署记录 |
| `b5072af` | 回执遗失后重送不再多占一个版本（`pendingIdentical`／`bindIdentical`） |
| `5799ebc` | `CanonicalSourceParser` 2.2×（校驗／上架共用）＋重建 trialweb 束 |
| `f595158`／`9e09c0b` | ui13／ui14 部署记录与部署坑 |
| `455744e` | `vps/manual-static-build.sh` ＋手动发布手册（§15.6）；CF Git 集成已断开 |
| `5c0e272` | 上架申請流程收斂（按钮只在有东西可送时开放、目标已删即自動作廢）＋删除＝彻底清除补上 `private/<gameId>/` 回收；ui15 已部署 |
| `9a99154` | 去掉審核頁三段說明與底部說明、草稿上下文條空態與小字（用戶要求）；ui16 已部署 |
| `9f60ebd` | 方案 B：磁盘桶落盘 content-type（`.meta/<key>`）＋一次性回填脚本 |
| `2841cd8` | 玩家端唯讀桶綁定补 Workers 形状（`body` 流串＋`httpMetadata`），`/program-assets/*` 不再 503 |
| `c763638` | 方案 B 的 journal 记录（§1.2） |

当前 digest：`static-release.json` = **`72ec1c31e1a37f7e9f23118ca443cdf6c3500c030650ccfe5074a5683a9b1bb2`**（1442 文件、167.39 MiB，`sadcloud` 上 `/srv/dragon/dist`），sourceTree = `93faf8d99b2f51166fcf4ab30e491d8fa37bc20f26bde69ea78264d036549873`，与 `publication.env` 三处 pin 一致。玩家端不再有 Cloudflare Worker（原 Version `ba4d2794…` 随 DNS 切灰云失效），改由 `dragon-player-1` 上的 `vps/player-server.mjs` 提供；两个域名现直接解析到 `82.158.91.231`（响应头 `Server: nginx`，无 `cf-ray`）。

## 1.1 ui15（2026-11-06 22:00Z）：上架申請按鈕永久灰 + 每删一个游戏白占 46 MB

**用户现象**：校驗成功但「上架」按鈕灰，提示「上架暫停：上一次上架「臥龍傳·重構版」…編號 63803a5e…這款已不在清單…按「只停止本機追蹤」」。

**根因（实锤）**：`server/public/publish.txt` 的 `blocked = Boolean(pending) || badJournal` 与校驗结果无关；`pending` 是**浏览器 sessionStorage**（`editor-submission-operation:<userId>`）里上一次未结案的追踪，指向早已 purge 的旧游戏。服务端 purge 触达不到浏览器；跨标签页删除（sessionStorage 按标签页隔离）让本标签页记账滞留。生产库当时 `content_releases`／`game_releases` 0 行、`content_audits` 仅 1 条 create → **上架申请从未发出**，不是服务端拒绝。

**修法**（`5c0e272`）：
- `submittable(row)`：`draft→可送`；`pending→仅 rejected 可送`；`listed→仅 draftChanged 可送`（`server/metadata.js` 的 `#submissionState` 新增 `draft_revision` 比对得出 `draftChanged`）。按钮文字改「上架申請」，确认框改「送出申請」。
- 本机追踪自動作廢：`reconcile()`（清單成功读取且 `pending.gameId` 不在其中）＋`query()` 的 `GAME_NOT_FOUND` 权威分支 → `store(null)` 并提示「目標已刪除，本機追蹤已自動作廢」；刷新失败不得误清。目标已不在清單时不再显示无意义的 8 码短码。

**删除＝彻底清除（用户要求 2026-11-06）**：生产实测每删一个游戏留 `publication-data/private-objects/private/<gameId>/` **49 檔／46 MB**（5 个孤儿共 229 MB）。原因：`vps/game-reclaimer.mjs` 只扫 R2 `artifacts/<gameId>/`，`server/gamepurge.js` 不碰 blob 端口，`vps/file-bucket.mjs` 当时无 remove。修法：`FileBucket.remove`（只允许 `private/`，`installed/` 拒绝；目录空了连目录一起删）＋reclaimer 的 `sweepPrivate` 按 `private/<gameId>/` 前缀扫（`objects` 埠可选，缺埠照实报 0）＋回执 `reclamation.privateObjects`（`publish.txt` 的 `reclaimed()` 允许并显示「遊戲私有位元組回收 N 檔」）。已手工清掉 5 个孤儿目录（清單存证 `/srv/dragon-editor/publication/reclaimed-orphan-private-objects-20261106.txt`）。

**残留（设计保留，不干扰复制／上架／审核）**：`content_distribution_events` 每个已删游戏留 1 行 `delete-fence`（append-only digest 链，删会 `DISTRIBUTION_LEDGER_CORRUPT`）；`content_operations` 11 条／`content_reservations` 14 条按 `(actor, op_key)` 寻址，新操作是全新键。`content_names`／`content_used_ids` 清空 → 名称与 id 未占用。

**验证**：`verify_game_purge` **11/11 PASS**（真实 HTTP purge + 真 FileBucket：本游戏私有前缀清空、同内容孪生游戏与 `installed/` 逐字节不动、32 张表 0 行；顺手修掉 TABLES 清单缺 `game_releases` 的既有红 32≠31）；`verify_game_purge_reclaim` 10/10；`verify_publish_ui_model` 12 pass／7 既有红同名不变；`verify_copy_publish_parity` PASS。

**部署（ui15）**：`5c0e272` → 服务器侧浅取（FETCH_HEAD 一致）→ `git archive` 2519 文件 → 变更文件 `sha256sum -c` **13/13 OK**（`editor-ui/src/PublishPanel.vue` 不进镜像，只有 `shell-ui.txt` 进）→ `docker build … 20261107-bc1-ui15`（`3295ad99…`）→ 镜像内 `VERIFY_OK`（sourceTree `93faf8d9…`，240 源文件／241 束文件）→ `backup-publication.sh`（备份 `publication-20261106T144616Z`）→ `app-prev15-20261106T144630Z` → `.env` 换 tag → recreate。`web/`／`reader/` 与线上逐文件相同 → **三处 pin 不动**（digest 仍 `72ec1c31…`）。首启 488 s healthy；`/api/health` 200 `initialized:true`；`/shell-ui.js` 710599 B sha `0509d4b4…` 与提交一致；schema 54 表／52 索引／361 列／4 FK／`integrity_check ok`；账本 11/11/null 未动；玩家 `/play-api/v1/registry` generation 11、`directory:[]` 不变；日志仅 `started`＋`distribution-idle`。

## 1.2 方案 B：玩家端搬離 Cloudflare（2026-11-06 15:00Z–23:40Z，`sadcloud`）

### 1.2.1 现象与根因（实锤）

用户完整走通「复制→校驗→上架申請→審核同意」，玩家端能看到发布资讯与下拉框，但点「新游戏开始」报 `Error 1102 Worker exceeded resource limits`（Ray ID `a56512467b60b98f`，2026-11-06 15:18:32 UTC），控制台无错误；后来又出现「要不报错，要不又跳回到开始加载单独的画面」（失败分支 `location.assign('/')` 回首页）。

`npx wrangler tail dragon --format json` 抓到 `/play-api/v1/registry` 一次请求 **cpuTime = 11 ms**（wallTime 720 ms，outcome ok），而免费 Workers CPU 上限 10 ms → 冷启动或稍重的 `/play-api/v1/file`（要读并 sha256 运行时索引与章节）必被打穿。外部逐段实测（都 200，数据链本身正确）：`/play-api/v1/registry`（generation 13、目录含 `cf369743-8b34-4664-91c2-152c706492f0`「臥龍傳·重構版」1.0、20 章）、`/status`、`/admissions`（ticket 886 B）、`/file?role=chapter:…#upper-1`（122494 B）、`/file?role=manifest`（31781 B）、`/program-assets/<digest>/…`。

### 1.2.2 用户决定

「能不能改成不部署cloudflare，把玩家端部署到我指定的vps上？」→ 方案 A（保留 R2 存字节）／方案 B（彻底去 CF，字节落 VPS 磁盘）对比后：「我想走方案B，新VPS你使用ssh sadcloud连接，部署完后我把两个域名指向这个服务器」；随后「最好使用docker部署」；443 与既有 xray 冲突时选「按A」（nginx `ssl_preread` 按 SNI 分流）。

### 1.2.3 落地（新增／改动文件）

- **新增**：`vps/disk-bucket.mjs`（磁盘桶，与 `r2client` 逐方法同形；etag=`"<md5>"`、`last-modified`=mtime、content-type 落 `.meta/<key>`、`remove` 只许 `private/`）、`vps/player-server.mjs`（`reader/site.js` 跑在 Node：Request/Response 适配、`readOnlyBinding`、`createStaticAssets` 重放 `web/_headers` 与 404 页、`/index.html` 307）、`vps/migrate-r2-to-disk.mjs`、`vps/backfill-bucket-types.mjs`、`vps/Dockerfile.player`、`vps/docker-compose.disk.yml`、`tools/verify_disk_bucket.mjs`。
- **改动**：`vps/publication-config.mjs`／`publication-main.mjs` 支持 `PUBLICATION_BUCKET_ROOT`（未设仍走 R2，可回滚）；`vps/r2client.mjs` 加 `listAll`（跟 `NextContinuationToken`，只给迁移／审计用）。
- **迁移**：R2 → 磁盘桶 **13606 键／954 MB**（`written 8981 / skipped 4625 / mismatched 0`；`artifacts 8310 / control 37 / kao 621 / projections 13`），保留 R2 的 Last-Modified（收据 `visibleAt` 靠它）；SQLite（`VACUUM INTO`，3.5 MB）与 `private-objects`（150 MB／569 档）用 tar-over-ssh 从 dartnode4 搬。
- **静态发布**在服务器上重建：`sh vps/manual-static-build.sh /srv/dragon/build` → digest `72ec1c31…`／sourceTree `93faf8d9…`、1442 档。

### 1.2.4 失败尝试与坑（都实际踩过）

1. **`readOnlyBinding` 少了 Workers 绑定形状** → `/program-assets/*` 全 **503 `PROGRAM_ASSET_UNAVAILABLE`**（不是 404），玩家点「开始」直接掉错误页。`reader/programarchive.js` 的 `read()` 用 `object.httpMetadata.contentType` 逐字比对、用 `object.body.getReader()` 分块读；首版只给 `{ size, arrayBuffer() }`。修法：`{ size, httpMetadata:{ contentType: headers['content-type'] }, body: new Blob([bytes]).stream(), arrayBuffer }`（`2841cd8`），`tools/verify_disk_bucket.mjs` 第 8 条锁定。
2. **Debian 的 `/etc/nginx/mime.types` 缺 `flac/wav/mid`** → `vps/static-client.mjs` 的 `STATIC_CONTENT_TYPE` 失败，已补三行。
3. **`/program-assets/<digest>/static-release.json` 404 是正常的**：该路由只发 `kind==='asset'` 的文件，manifest 走注册记录那条路。
4. **`?formalGame=` 的 `mode` 只接受 `new`／`load`**，传 `mode=formal` 直接 404（我最初据此误判为「入口不通」）。
5. **删 R2 桶不能只用 S3 令牌**：`DELETE /<bucket>` 回 `403 AccessDenied`（令牌只有对象权限），改用 OAuth 的 `npx wrangler r2 bucket delete dragon`。
6. **`nohup node … > log` 在 ssh 下看不到进度**（stdout 缓冲到退出才落盘），只能靠另一路 `listAll` 计数确认（13606 → 4884 → 802 → 0）。
7. **`curl -I` 打 `/play-api/*` 得 404 是设计**：`reader/worker.js` 只接受 GET。

### 1.2.5 切换后的验证（全部 200）

编辑器 `/api/health` 200 `initialized:true`、`/` 200、`/shell-ui.js` **709029 B**（与 `git show HEAD:server/public/shell-ui.txt` 逐字节一致）；玩家 `/play-api/v1/registry` generation 13、`/?formalGame=cf369743…&mode=new` **200／33216 B**（`<base href="/program-assets/72ec1c31…/">`）、`/program-assets/<digest>/{grf/battle_units.png,grf/battle_terrain_0.png,src/main.js,intro/scene.html}` 全 200 且 MIME 正确（png／js／text-plain）、未知路径 404；`docker ps` 两容器 healthy。用户实测：「两个域名试了，可以访问，正常」。

### 1.2.6 下线旧环境（用户授权：「2. 旧 R2 桶 dragon清理。3. 旧机器 dartnode4：容器停掉清除。」）

- **R2 桶 `dragon` 已删除**：删前先证明磁盘副本完整（键集合 **13606==13606**、缺失 0／多余 0、抽样 25 个 sha256 全等），再逐条删 13606 个对象，最后删桶。剩余桶 `agentic-inbox`／`img-box`／`sanguo-gtiles` 未动。删后复测 registry／entry／asset／health 全 200 → 生产已完全不依赖 R2。
- **dartnode4**：`docker compose down`（编辑器容器＋网络）、`docker rm -f dragon-editor-probe`、所有 `dragon-editor-publication:*` 镜像 `rmi`、`dragon-editor.720108.xyz` 的 vhost 移到 `/home/web/conf.d-disabled/` 后 `nginx -t`＋reload；磁盘 74G→61G（释放约 13G）。`nginx` 容器**保留**（同机还服务 `kpanle.720108.xyz`／`v2ray-dartnode.720108.xyz`，配置未受影响）。
- **DNS**：用户把两条 A 记录切到灰云后，`nslookup` 直接返回 `82.158.91.231`，响应头 `Server: nginx`（无 `cf-ray`）→ CF 已完全不在链路上，100 s 边缘上限与 Worker CPU 限制都不再适用。

### 1.3 2026-11-07：搬到 instabox sandbox + Cloudflare Tunnel 绑回域名

用户原话：「当前的VPS不再使用。资源配置太低」（指 sadcloud 4C/3.9G）→ 选中「1」（CF Tunnel 方案）。

- **机器**：instabox sandbox `m_agqwqhyt5emm6ckzagrgpj375a`，Firecracker VM，4 vCPU / 8192 MiB / 16 GiB root + 20 GiB `/data`，Debian 13；docker 29.8.2 与 compose v5.6.0 已装；**无公网 IP**（`~/MACHINE.md`：no port is reachable from the internet），只有 `instabox-port publish` 的 `<port>-<id>.instabox.tech` 出口（证书 `*.instabox.tech`，自定义 Host 打边缘回 503）。
- **迁移**：桶 13606 对象（`.meta` 合计 27212 档）/1.6 GB、dist 1442/171 MB、private-objects 569/150 MB、`editor.sqlite` 3.4 MB，`tar` over ssh（instabox→sadcloud 出网通）；键集合 `LC_ALL=C sort | md5sum` 两边同为 `381524459c4d853f5b86394fe2e2f4b2`；镜像 `docker save | gzip | ssh docker load`。落地 `/data/dragon`，compose 端口仍绑 `127.0.0.1:8788/8789`。
- **三个坑**：①数据目录必须 `700` 且属主 = 容器 uid（`privateOwned()` 校验），tar 后是 755 → `private owner permissions required` 重启循环；②编辑器要求 `Host` 逐字等于配置 origin 的 host（`vps/editor-server.mjs:88`），instabox 代理把 Host 改写成 `127.0.0.1:<port>` → 18990 上加 40 行 host-rewriting proxy，并顺带从本机 `dist` 供应 `deployment-assets/static-v1/<digest>/`（编辑器开机静态归档要读它，content-type 必须与 `vps/static-client.mjs` 白名单逐字相符）；③旧隧道 `fa6929ee-…` 已删但两条 CNAME 仍指它 → 域名回 **530（Argo 1033）**，`cloudflared tunnel route dns --overwrite-dns` 报「already configured」不改写，必须 API `PATCH /zones/<zone>/dns_records/<id>` 换成新隧道 `f5d35af4-…cfargotunnel.com`。
- **现状**：`https://dragon.720108.xyz`（player，registry/入口页/`intro/assets/gametitle.png`/`program-assets/src/main.js` 全 200）、`https://dragon-editor.720108.xyz`（`/api/health` 200 `initialized:true`、`/shell-ui.js` 709029 B sha `cb0f822a…`）；CF 只做 TLS 反代（`server: cloudflare`、`cf-cache-status: DYNAMIC`），**不跑 Workers**，1102 不再出现。systemd：`dragon-editor-proxy.service`、`dragon-tunnel.service`；sandbox stop 后跑 `/data/dragon/start.sh`。
- **待办**：sadcloud 尚未下线（用户未确认）；`proxy.mjs`/compose/start.sh 未入库。

## 1.4 待办：发布游戏与内置是两套启动流程（用户 2026-11-08 决定合并）

**用户原话**：「原来复制游戏的加载不是现在这样的，和内置游戏的完全相同，而且快…难道编辑工作台发布的游戏和内置游戏在加载上是两套不同的方式？」；方向「复制的游戏如果测试没问题，将来是要整个删除内置游戏的，也不存在内置游戏相应的所有特殊代码」。

**事实（git 可查，不是最近回归）**：
- 内置：`web/src/boot.js` → `startApp(opening)` → `web/src/ui/startmenu.js` 自己画「游戏名标签 + 章節窗（`_chapterRows()` 读 `app.content.chapters`）+ 勢力選擇」。
- 发布：同一文件里 `publicPlayerRequest(location.search)` 命中时走 `launchPublicPlayer` → `web/src/player/playernewgame.js` 的 **DOM 面板**（纯黄底、无金框、无滚动条），章节列表由 `playerchapters.js` 逐章 admit+读整章 JSON（20 章 × 2 串行请求 ≈ 45–150 s）。`launchPublicPlayer`、`playernewgame.js`、`reader/programentry.js` 均首见于 `d2acb08`（2026-10-18），此前 `boot.js` 只有 `startApp(opening)` 三行。
- 每次从标题页下拉框选游戏 = 整页导航到 `/?formalGame=<id>&mode=new` → **重跑 boot** → 开场音乐重播、再弹 DOM 面板；内置在同一页面内切菜单，所以不重播。用户看到的「跳回加载音乐页面」就是这个。

**合并方案（阶段 1，已定）**：让程序自己的「新遊戲」窗口处理发布游戏——`?formalGame=` 不再预装环境，改为把 `{ gameId, entry, chapters, open(chapterId, faction) }` 交给 `startApp`；`startmenu.js` 有 formalSource 时用它的章节列表（窗口/字体/金框/滚动条与内置逐像素一致），玩家选章选势力时才 `admit + 装包`（只装选中章，省掉 19 章的预读）。完成后 `playernewgame.js` / `playerchapters.js` / `playercatalog` 的选章路径可删。

**删内置的前置（用户要求最终整删）**：`server/admincopy.js:158` 的 `createPinnedCopyLoader` 读 `web/` 的 pinned 内容当复制上游 → 必须先做「从已上架版本复制」，否则删内置后无法新建游戏。内置足迹：`reader/` 0 处、`web/src` 25 文件、`server` 31 文件、`wolong-builtin` 特例 51 处、`tools` 227 文件夹具。

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

## 6. 玩家端改手动构建（用户决定，2026-11-06；**方案 B 后 wrangler 部分作废**）

> 2026-11-06 晚起玩家端改由 `sadcloud` 的 `dragon-player-1` 提供，Cloudflare 已不在链路上（§1.2）。`vps/manual-static-build.sh` 仍是重建 `dist/` 的唯一入口；下面「wrangler deploy」相关段落只作历史。

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
3. **（历史，R2 时代）新 digest 首启要 23 分钟**：`archiveStaticProgram` 先从 `STATIC_ORIGIN` 下载 1441 文件核 sha 再上传 R2（RX 536 MB／TX 184 MB）；R2 已有同 digest 时只需 7 分钟。期间服务不可用。
4. **CF 边缘会静默切断长响应**（190–205 s 的上架请求）：延长超时无解，唯一可靠做法是不依赖单次长连接（§3 的轮询）。
5. **wrangler 在本机必须去掉代理变量**：`HTTP(S)_PROXY`／`ALL_PROXY` 会让它卡死，用 `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy`。git-bash 下 node 不认 `/e/...`，脚本里用 `pwd -W` 转盘符路径。
6. **全仓 grep 会超时**：`dist/` 1441 文件／168 MB；限定 `web/src editor-ui/src server/*.js tools/*.mjs`。
7. **方案 B 迁移的坑**见 §1.2.4（唯讀綁定形状／mime.types／`mode` 值／删桶权限／nohup 缓冲／HEAD 404）。

## 10. 当前阻塞

1. **新 VPS 上还没跑过一轮完整创作链**：`sadcloud` 的 `content_games` 里仍是迁移过来的那个游戏（`cf369743…`，1.0、20 章、generation 13），「复制→校驗→上架申請→審核同意→玩家开局」在**磁盘桶**上还没实测；磁盘桶发布路径目前只有 `tools/verify_disk_bucket.mjs`（8/8）与端口契约证据。
2. **既有红（不阻塞，但不许写成全绿）**：`verify_first_online`、`verify_reader_distribution`、`verify_deletion_distribution(+_workerd)`；`verify_publish_ui_model` 12 pass／7 fail；`verify_editor_copy_controller`、`verify_editor_backend_admin_copy`；`verify_publication_ui` 的 `TypeError`、`verify_editor_shell` 的 `publish-vue-owned`（均改前既有）。
3. **惰性残留（设计保留，不干扰新游戏）**：`content_operations` 11 条、`content_reservations` 14 条（按 `(actor, op_key)` 寻址）；`content_distribution_events` 每个已删游戏 1 行 `delete-fence`（append-only digest 链，直删会 `DISTRIBUTION_LEDGER_CORRUPT`）。
4. **7 张 `content_distribution_*` 与 drainer 仍在**；下线前置是生产实测一次 20 章上架端到端耗时（旧环境已有 212 s 数据，新环境待测）。
5. **旧环境回滚数据仍在**：`dartnode4` 的 `/srv/dragon-editor/publication/publication-data`（157 MB）与 `/root/dragon-editor-backups`（8.0 GB）——用户尚未决定是否删除。
6. **`publication.env` 里仍留着 `R2_*` 凭据**（已无用），未清理以免与回滚流程混淆。

## 11. 下一步（建议顺序）

1. **在新 VPS 上跑一轮完整链路**：复制 → 全面检验 → 上架申請 → 審核同意 → 玩家端开新局，确认磁盘桶发布路径（`putImmutable`／CAS／收据 `visibleAt` 依赖 mtime）与端到端耗时；同时观察删除回执是否报「遊戲私有位元組回收 N 檔」（ui15 起）。
2. 若上架面板长时间无回执，用 `GET /api/games/<id>/publish-operations/<key>` 直接核对，别再重送（§3 的轮询仍在）。
3. 决定旧环境回滚数据去留（`dartnode4` 的 157 MB ＋ 8.0 GB）；确认稳定几天后可删。
4. 清理 `sadcloud` 的 `publication.env` 里无用的 `R2_*` 凭据。
5. C 批剩余：下线 7 张 `content_distribution_*` + drainer；`verify_publish_ui_model` 的 7 条行为断言 re-baseline。
6. 校驗 37–42 s 仍受限于主线程编译；移出主线程（worker／子进程）需单独设计批准。通用审计 `audit_events`（审核／删除／账号变更）仍未立项。

## 12. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`（见 §8）；其余旧锚点（§26–§49）已无外部引用，需要时用 git 历史追溯。

## 13. 批次 A（2026-11-09 UTC）：上架申請 `DISTRIBUTION_AUTHORITY_CORRUPT` 修復並上線

- 提交：`7590fdc`（目錄基線改按資料庫權威事實重建、退役後 runtime 由 pack 重算、新 lane `tools/verify_publish_after_retirement.mjs`）、`905dffe`（`#anchor()` 不再信任 `anchor_digest`，改用最後一個還讀得到 payload 的世代）。均已推 `github/main`。
- 根因訂正：生產檢查點把 `anchor_digest` 指在退役範圍內（gen14），`e089e88` 的 `check(entry.retired !== true)` 直接失敗；「錨點目錄缺遊戲」是更下一層的潛伏缺陷。詳見 `docs/handoff-20261110-publish-authority.md` §1。
- 驗證：`verify_publish_after_retirement` 3 組、`verify_publication_producer` 25 組、`verify_publication_catalog` 35 組、`verify_deletion_scan_retirement`／`verify_deletion_completion_readiness`／`verify_distribution_ledger_retirement`／`verify_distribution_publisher_retirement`／`verify_distribution_ledger_backup_restore`／`verify_publish_atomicity`／`verify_publish_matrix`／`verify_publication_main`／`verify_publication_server`／`verify_publish_operations_root` 全綠；另用生產庫拷貝在**新鏡像**內干跑一次模擬上架（舊碼重現 CORRUPT、新碼產生 gen15）。
- 部署：`/data/dragon/src` 重新 clone（原目錄已被清），`docker builder prune -af` 後建 `dragon-editor-publication:20261109-b2-disk12`，改 `env/.env` 的 `EDITOR_DEPLOYMENT_ID` 並 recreate editor。公網 `/api/health` 200 `initialized:true`；玩家端鏡像與 static pin 未動；帳本仍 tail=confirmed=14、無 block。
- 已知殘留：`verify_frozen_publication_root.mjs` 在 `inspectRuntimeObjectReferences` 的 `fields(asset, …)` 回 `DELETE_RUNTIME_REFERENCE_INVALID`（舊碼同樣失敗，本輪未修，屬 fixture／掃描器本身的既有問題）。
- 待辦：使用者重試「上架申請」（當前是 `937c71ab…「臥龍傳·重构版」` 的首次發布）；之後按用戶既定順序做 ②檢驗結果存服務端＋按鈕可用性 ③四層逐項 ✓/✗ ④上架申請 ①–⑥ 真實進度。

## 14. 批次 B（2026-11-09 UTC）：② 檢驗結果落庫＋按鈕規則、③ 四層逐項 ✓/✗

- 生產先證實批次 A 有效：`937c71ab…「臥龍傳·重构版」` 的上架申請成功（gen15 publish，ordinal 1.0），管理員「同意」後 gen16 listing confirmed，玩家 registry generation 16、目錄 1 條；`content_games.listed=1`。gen15 走 `#rebuild`（退役尾巴），gen16 走 `#retained`。
- ② 新表 `content_game_validations`（8 列、PK game_id）＋`server/validations.js`（`ValidationStore`）＋`server/validationdeclarations.js`；`POST /api/games/{id}/draft/chapter-references` 空 body 落庫並回同一 DTO 形狀；`#publishPin` 在章節引用之後、`validateGameSource` 之前要求「同一 `draft_revision`、同一 `source_digest` 的 passed 記錄」，否則 `409 PUBLISH_VALIDATION_REQUIRED`；`/api/games/submissions` 每行帶 `draftRevision` 與 `validation` 投影（不含 sourceDigest／逐章內容）。UI 增「檢驗」列（未檢驗／檢驗成功／檢驗失敗（N 章）／檢驗已過期＋時間）。
- ③ 四層即服務端 `chapterBaseReferenceGaps` 的四個 code（`CHAPTER_MISSING`／`CHAPTER_GENERAL_MISSING`／`CHAPTER_CITY_MISSING`／`CHAPTER_CITY_SLOT_MISSING`）；`publish.txt` 只按 code 分組輸出 `validationLayers`，`PublishPanel.vue` 以「檢驗結果」彈窗逐層 ✓/✗，失敗層紅字列出「章名：服務端 detail」。不新增判定。
- 計數門：24 owners / 55 tables / 53 indexes / 369 columns / 4 FK（`verify_editor_schema_sources`、`verify_distribution_schema` 同步）；`gamepurge`、`deletioninventory`、`deletionuniquerows` 一併收新表。
- 驗證：`verify_publish_ui_model` 18/18（新增四層斷言）、`verify_publish_validation` 7 組、`verify_publication_server` 18、`verify_publication_main` 93、`verify_publish_operations_root` 31（schemaTables 55）；`editor-ui build --check` 通過。
