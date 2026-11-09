# 交接：上架申請卡在 DISTRIBUTION_AUTHORITY_CORRUPT（2026-11-10；已修復並上線 2026-11-09 UTC）

> 用途：新会话续接任务的**唯一入口**。读完本文件即可继续，不需要翻历史对话。
> 长期事实见 `AGENTS.md`，部署配方见 `docs/game-storage-layout.md` §16/§17，进度流水见 `docs/checkpoint-journal.md`。

## 1. 当前唯一阻塞（已修復，見本節末的訂正）

用户在生产点「上架申請」，约 190–205 s 后返回：

```
這次沒有完成：系統回報「DISTRIBUTION_AUTHORITY_CORRUPT」
```

`server/publicationproducer.js:9` 的 `check()` 失败**统一**抛这个码，所以要看是哪一条 `check`。

### 订正后的根因（2026-11-09，在生产库拷贝上实证）

上一轮（`e089e88`）新增的 `#anchor()` 用它自己的 `anchor_digest` 找基線，并以
`check(entry.retired !== true)` 收尾。**生产唯一的一个检查点把 anchor 指进了退役范围**：

```
content_distribution_checkpoints:
  checkpoint_digest   = 32ba563a…
  retired_generations = [12,13,14]
  anchor_digest       = ba2714a59963aa535faa24658bbad783003e3bcf53614e912d61d8bc7f263fe8
                        ↑ 正是 gen14 自己的 operation_digest（退役条目）
```

`retireCheckpointInTxn` 只要求 anchor digest 在 events 里存在，**不保证它未退役**，所以
`#anchor()` 在 `check(entry.retired !== true)` 就失败 → 每次上架都 503。这是用户实际撞到的
那一步（旧码在真实拷贝上重现，新码放行到下一世代）。

再往下一层（交接当时推测的那条，真实存在但被上一条盖住）：把基线退回锚点快照当目录内容
也不成立——「臥龍傳·重構版」（cf369743）是在 gen12 publish／gen13 listing 才上架的，gen11 的
目录快照里没有它；重新发布 1.1 时「前一版序号」被当成 null → 期望 1.0、实际 1.1 → 同样 503。

生产库现状（2026-11-09 08:0xZ 只读拷贝）：tail=confirmed=14、blocked_reason=null、无任何
`published_games`／`content_releases`／`published_packs` 行；cf369743 已在 gen14 被 fence 并
purge；`content_games` 只剩一款 **937c71ab-fb5d-4466-866a-f5f82f8fa3b0「臥龍傳·重构版」**
（next_ordinal=`0`，从未发布过）。也就是说用户删掉了打不开的那款、重建了一款，下一次上架
申请是它的**首次发布**（下一世代 gen15）。

## 2. 已实施的修复（`7590fdc` + `905dffe`，已上生产）

`server/publicationproducer.js`：

1. `#anchor(checkpointDigest)`：不再信任 `anchor_digest`。把**所有**检查点的
   `retired_generations` 取并集，从尾巴往下找第一个没退役、且 `entry()` 确认还能读 payload 的
   世代当基线（生产上就是 gen11）。全部退役时 fail-closed 回 CORRUPT。
2. `#catalog(state, kind, gameId)`：尾巴退役时改由 `#rebuild()` 按数据库权威事实重建
   `catalog.games`——成员集合＝`published_games ∪ content_deletion_fences ∪ content_games`
   (listed<>0 OR current_release_id 非空)，`listed`／`deleted`／`current` 全部取库里的事实；
   锚点只保留既有公告列与 digest 链起点。未退役尾巴仍走 `#retained()`（原 payload ＋ purge 过滤，
   行为不变）。
3. 基线是「上一世代」的状态：本次操作已经写进库里的那一款显式回到操作前——
   `listing` 的 `listed` 记 false、`delete-fence` 的墓碑按「尚未记录」处理、`publish` 只用
   `#previous()` 给出前一版序号（`1.0` 是首版，其余 `1.<n-1>`）。
4. 当前版本的 `runtime` 索引参考若不在锚点里，由同一份 SQLite pack 用
   `buildRuntimeIndex` 重算（key 内嵌 sha256，不能臆造占位值）；`#firstOnline()` 用
   publish／listing／restriction 事件重建首次上架世代。
5. 回归：`tools/verify_publish_after_retirement.mjs`（三组：退役后第一次发布、退役后
   上架同意 ＋ runtime 重算、首次上架公告世代与删除墓碑）。旧码在它上面重现
   `DISTRIBUTION_AUTHORITY_CORRUPT`，新码全绿。

相关代码位置：`#anchor()`、`#catalog()`、`#rebuild()`、`#retained()`、`#pinned()`、`#runtime()`、
`#previous()`、`#firstOnline()`、`#assertCatalogAuthority()`；`server/distributionledger.js` 的
`#retiredPin()`／`entry()`／`retireCheckpointInTxn()` 未改。

## 3. 部署（只动 editor，别动 player）

生产在 **instabox sandbox**：`ssh -p 2222 ibssh_dkqur7jmhbhhitd5g6xjq3zxfa@ssh.instabox.sh`，目录 `/data/dragon`（`src/` 是 git 克隆，`env/` 放各 env，`bucket/` 磁盘桶，`dist/` 静态发布，`data/editor.sqlite`）。

本次改动**不涉及 `web/`**，所以静态 digest 不动，只重建 editor 镜像：

```bash
cd /data/dragon/src && git fetch --depth 1 origin main && git reset --hard FETCH_HEAD
docker builder prune -af                      # 根分区只有 16G，先腾空间
docker build -f src/vps/Dockerfile.publication -t dragon-editor-publication:<新tag> src
sed -i 's/^EDITOR_DEPLOYMENT_ID=.*/EDITOR_DEPLOYMENT_ID=<新tag>/' /data/dragon/env/.env
cd /data/dragon && docker compose --env-file env/.env up -d editor
curl -s https://dragon-editor.720108.xyz/api/health   # 期望 200 initialized:true（约 20 s）
```

补充（2026-11-09 实测）：`src/` 不会一直留着（上一次构建后被删了），没有就
`git clone --depth 1 --branch main https://github.com/tianyi092-jcza/dragon.git /data/dragon/src`
（约 551 MB，服务器到 GitHub 很快；Dockerfile 只 COPY server/vps/reader/tools×4/web，无 npm 构建）。构建只要 ~18 s。
`docker compose up -d editor` 之后隧道要几秒才不再 502，`127.0.0.1:8788` 直接 curl 会因 Origin/Host 检查回 403，
判据一律用公网 `/api/health`。

切流量前的干跑（本輪用過，建議保留習慣）：`cp` 一份 `data/editor.sqlite`（连 `-wal`/`-shm`）→ `VACUUM INTO` 出单文件
→ 在**新镜像**里用一份模拟上架脚本跑 `recordInTxn`，确认目录能重建、`projection.directory` 合理，再改 `.env`。
旧码在同一份拷贝上会停在 `#anchor` 的 `check(entry.retired !== true)`。

失败排查：`docker compose --env-file env/.env logs --tail 60 editor | grep internal-error`
（`EDITOR_ERROR_DEBUG` 默认开启，非 HttpError 会打 `{"event":"internal-error","code","message","stack"}`；`fail()` 产生的 HttpError 不打栈，只有码）。

## 4. 环境现状（2026-11-10）

| 项 | 值 |
| --- | --- |
| 仓库 | `E:/Dragon/web-port`，分支 `main`，远端 `github`（`https://github.com/tianyi092-jcza/dragon.git`） |
| HEAD | `e089e88`（= github/main） |
| 生产入口 | `https://dragon-editor.720108.xyz`（编辑器）、`https://dragon.720108.xyz`（玩家），经 Cloudflare Tunnel `f5d35af4-…` 到 instabox 本机端口 18990→8788 / 8789 |
| 镜像 | `dragon-editor-publication:20261109-b2-disk12`（本輪修復）、`dragon-player:20261109-b2-disk9`、`node:22-bookworm-slim` |
| 静态 pin | `STATIC_RELEASE_SHA256=b5674f4b…`、`STATIC_SOURCE_SHA256=91defffe…`（`env/publication.env` 三处 + `env/proxy.env` 的 `PROXY_STATIC_PREFIX`） |
| 磁盘 | `/` 16G（docker 全在这，已用 5.1G）、`/data` 20G（已用 4.8G）。**每次重建镜像前先 `docker builder prune -af`** |
| 数据 | 桶 `/data/dragon/bucket` 2.8G（其中 `artifacts/programs/` 2.7G 是历次静态程序归档、`kao/` 13M 621 张头像、`artifacts/<gameId>/` 约 3M）；`data/editor.sqlite` 3.4M |
| 在架游戏 | `cf369743-8b34-4664-91c2-152c706492f0`「臥龍傳·重構版」1.0，20 章 |

## 5. 用户已定的后续需求（顺序不可打乱）

用户 m2008 原话：**「1. 检验结果存服务端。2. 上架申請弹窗不接受粗粒度进度，做真实 ①–⑥，异步回调结果。3. 先修 500 再改 UI。」**

| # | 内容 | 状态 |
| --- | --- | --- |
| ① | 修上架 500（`RUNTIME_STAGE` 桶类型、`RUNTIME_CORRUPT` 账本退役、`DISTRIBUTION_AUTHORITY_CORRUPT` 目录重建） | **已完成并上线**（镜像 `20261109-b2-disk12`；换成用真实生产库拷贝做干跑验证后才切流量） |
| ② | 检验结果存服务端（状态「草稿/检验成功/检验失败」+ 状态时间；绑定 `draft_revision`，修订一改即失效）+ 上架申請按钮可用性规则 | 未做 |
| ③ | 检验弹窗四层逐项 ✓/✗（章节结构／城市引用／数量锁定／章节引用），失败项下一行红字写原因（例「城市引用 ✗ → 寿春 未落在地图上」），窗口随内容放大 | 未做 |
| ④ | 上架申請弹窗 ①–⑥ **真实**进度（待执行→进行中→完成/失败），服务端逐步回调，前端按事件刷新 | 未做 |

用户的业务规则（原文要点）：
- 未检验前状态=草稿，申请前无版本号（ordinal 在真正上架时才分配）；
- 检验通过 → 状态「检验成功」、状态时间=检验成功时间；失败 → 「检验失败」+ 结束时间；
- 检验不成功则上架申請禁用；点发出申请后禁用，等管理员批复；只有批复未通过才恢复可用，批复通过则保持禁用直到下次检验成功；
- 「检验和上架申请就是个 todo 任务动态完成监控表」。

## 6. 本轮之前的成果（已上线，勿回退）

- 发布游戏与内置游戏走**同一套**程序内菜单（`web/src/ui/startmenu.js`）：章节窗、势力窗、右键逐级返回；
- 三层云纹窗：游戏名条 → 章节名条 → 势力列表（内置与发布共用）；
- 下拉框选游戏后「新游戏／读取存档」**同页异步刷新**，不再整页跳转、不重播开场音乐（`app.rebindFormalGame` + `bindFormalGame`）；
- 公开端点 `GET /play-api/v1/chapters?game=<id>`（无票，只返展示元数据）；新发布的索引带 `chapterIndex`（名称/日期/势力），旧发布仍返回 `CHAPTERS_UNAVAILABLE` 并退回逐章加载；
- 开场音乐压到 64 kbps（2.5 MB → 837 KB）。

## 7. 工作纪律（务必遵守）

- 中文回复，每条以 `tianyi,` 开头。
- 机制判定只认原始证据（`KI.EXE` 反汇编/原始数据），不拿现状当证据；文档冲突先看适用层级。
- 不擅自扩大范围；用户说「先方案」就只给方案。
- 改 `web/` 必须走锁步部署（新 REL/SRC digest → 换 dist → 改三处 pin + proxy prefix + 两个 tag → 重建两镜像 → 重启）；只改 `server/`/`vps/` 时只重建对应镜像。
- 提交与推送分别需要明确授权；本仓库惯例是改完即 commit，推送前确认。
- 写 JS 字符串里的转义时**不要**经过 python/bash heredoc（曾把 `\n` 写成真实换行导致 `SyntaxError` + 容器 crash-loop）。
