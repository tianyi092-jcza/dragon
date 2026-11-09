# 交接：上架申請卡在 DISTRIBUTION_AUTHORITY_CORRUPT（2026-11-10）

> 用途：新会话续接任务的**唯一入口**。读完本文件即可继续，不需要翻历史对话。
> 长期事实见 `AGENTS.md`，部署配方见 `docs/game-storage-layout.md` §16/§17，进度流水见 `docs/checkpoint-journal.md`。

## 1. 当前唯一阻塞

用户在生产点「上架申請」，约 190–205 s 后返回：

```
這次沒有完成：系統回報「DISTRIBUTION_AUTHORITY_CORRUPT」
```

`server/publicationproducer.js:9` 的 `check()` 失败**统一**抛这个码，所以要看是哪一条 `check`。

### 已确认的根因（上一轮修复不完整，不是用户数据问题）

`server/publicationproducer.js` 的 `#catalog(state)` 需要一条「上一条账本世代」做目录基线。我上一轮（提交 `e089e88`）加了 `#anchor(checkpointDigest)`：当账本尾巴被**退役检查点**取代时（退役条目只有身份凭证、没有 payload），改用检查点的 `anchor_digest` 定位那个未退役世代当基线。

生产实际数据（`/data/dragon/data/editor.sqlite`，只读查得）：

```
content_distribution_checkpoints:
  checkpoint_digest   = 32ba563a4d07f8d016b0b52d5bedd64189361e7ac603e584e9ad377724b586dc
  retired_generations = [12,13,14]
  anchor_digest       = ba2714a59963aa535faa24658bbad783003e3bcf53614e912d61d8bc7f263fe8
  created_at          = 2026-11-08T04:33:26.640Z

content_distribution_events: gen12 publish(cf369743-8b34-4664-91c2-152c706492f0)
                             gen13 listing(同一游戏)  gen14 delete-fence(同一游戏)
                             全部 state=confirmed，payload chunks 已被清理
content_distribution_chunks: 只有 gen 1–11 各 1 行
content_distribution_state : tail=confirmed=14, blocked_reason=null
```

**关键**：这款游戏是在**被退役的世代里**上架并同意上架的（gen12 publish、gen13 listing）。锚点基线是 gen ≤11 的目录快照，里面**根本没有这款游戏的条目**；而数据库里它现在是「在架」（`content_games.listed<>0`、`current_release_id` 非空）。于是 `#assertCatalogAuthority(catalog)` 拿 DB 的 `required` 集合与目录对比时对不上 → `check()` 失败。

结论：**账本退役后，不能只靠锚点快照重建当前目录**。

## 2. 修复方案（下一轮直接做）

`server/publicationproducer.js`：

1. `#catalog(state)`：尾巴被退役时，不再「退回锚点快照当目录」，而是**按数据库权威事实重建** `catalog.games`：
   - 集合与顺序：`content_games` 中 `listed<>0 OR current_release_id IS NOT NULL`，并上 `content_deletion_fences`（墓碑）、`published_games`；
   - 每条的 `release`：从 `published_games`（当前 pin）取，`current` 为空即 `null`；
   - `announcements`：沿用现有投影规则（`content_announcements` / `firstOnline` 自引用按现有规则处理）；
   - 锚点条目仍要读，但**只用作 digest 链起点与自引用降级**，不再当目录内容。
2. `#assertCatalogAuthority(catalog)`：保持原语义（它本来就是拿 DB 校对目录），重建正确后应自然通过；若仍有 `DISTRIBUTION_BOOTSTRAP_REQUIRED`，说明重建漏了集合成员。
3. 补回归测试：**退役世代里含有已上架游戏**，退役后仍能发布新版本。现有相关 lane：`tools/verify_deletion_scan_retirement.mjs`、`tools/verify_deletion_completion_readiness.mjs`、`tools/verify_distribution_ledger_backup_restore.mjs`（都用 `retireCheckpointInTxn`），挑一个扩写或新增 `tools/verify_publish_after_retirement.mjs`。

相关代码位置：
- `server/publicationproducer.js`：`#catalog()`（约 :32）、`#anchor()`（本轮新增）、`#assertCatalogAuthority()`（约 :49）、`check()`（:9）
- `server/distributionledger.js`：`#retiredPin()`（:82）、`entry()`（:333）、`retireCheckpointInTxn()`（:188）、checkpoints/cleanup 建表（:61-62）
- `server/deletionfrozenrefs.js:21` 已有 `entry.retired === true` 的处理范式，可参考

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

失败排查：`docker compose --env-file env/.env logs --tail 60 editor | grep internal-error`
（`EDITOR_ERROR_DEBUG` 默认开启，非 HttpError 会打 `{"event":"internal-error","code","message","stack"}`；`fail()` 产生的 HttpError 不打栈，只有码）。

## 4. 环境现状（2026-11-10）

| 项 | 值 |
| --- | --- |
| 仓库 | `E:/Dragon/web-port`，分支 `main`，远端 `github`（`https://github.com/tianyi092-jcza/dragon.git`） |
| HEAD | `e089e88`（= github/main） |
| 生产入口 | `https://dragon-editor.720108.xyz`（编辑器）、`https://dragon.720108.xyz`（玩家），经 Cloudflare Tunnel `f5d35af4-…` 到 instabox 本机端口 18990→8788 / 8789 |
| 镜像 | `dragon-editor-publication:20261110-b2-disk11`、`dragon-player:20261109-b2-disk9`、`node:22-bookworm-slim` |
| 静态 pin | `STATIC_RELEASE_SHA256=b5674f4b…`、`STATIC_SOURCE_SHA256=91defffe…`（`env/publication.env` 三处 + `env/proxy.env` 的 `PROXY_STATIC_PREFIX`） |
| 磁盘 | `/` 16G（docker 全在这，已用 5.1G）、`/data` 20G（已用 4.8G）。**每次重建镜像前先 `docker builder prune -af`** |
| 数据 | 桶 `/data/dragon/bucket` 2.8G（其中 `artifacts/programs/` 2.7G 是历次静态程序归档、`kao/` 13M 621 张头像、`artifacts/<gameId>/` 约 3M）；`data/editor.sqlite` 3.4M |
| 在架游戏 | `cf369743-8b34-4664-91c2-152c706492f0`「臥龍傳·重構版」1.0，20 章 |

## 5. 用户已定的后续需求（顺序不可打乱）

用户 m2008 原话：**「1. 检验结果存服务端。2. 上架申請弹窗不接受粗粒度进度，做真实 ①–⑥，异步回调结果。3. 先修 500 再改 UI。」**

| # | 内容 | 状态 |
| --- | --- | --- |
| ① | 修上架 500（`RUNTIME_STAGE` 桶类型、`RUNTIME_CORRUPT` 账本退役、`DISTRIBUTION_AUTHORITY_CORRUPT` 目录重建） | 前两个已修；**第三个进行中** |
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
