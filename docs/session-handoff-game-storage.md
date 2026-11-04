# 会话交接：游戏存储布局重构（方案 B）

> 用途：在新会话里续接「把游戏数据变成游戏级独立、删除=物理清除」这项任务。粘贴本文 §1 的提示词即可。
> 设计正文见 [game-storage-layout.md](game-storage-layout.md)（已定稿，方案 B）。

## 1. 直接粘贴给新会话的提示词

```text
续接卧龙传 web-port 的「游戏存储布局重构（方案 B）」任务。先做三件事再动手：

1) 读 E:/Dragon/AGENTS.md（全局铁律：逆向证据优先、commit/push 分别需要授权、git add 只用显式路径、回复以「tianyi,」开头用中文）。
2) 读 E:/Dragon/web-port/docs/game-storage-layout.md（本次任务的设计与已确认决定，尤其 §4 目标设计、§5 迁移 A/B/C、§8 已确认决定与 §8.1 改动清单）。
3) 读 E:/Dragon/web-port/docs/checkpoint-journal.md 的 §4.5–§4.10 与 §5/§6（现状、已验证的 lane、已知缺口）。

任务目标（用户口径）：
- 目录投影是「游戏级」数据，不是工作台系统级数据；管理员「复制游戏」与作者自建游戏只是来源不同，性质相同。
- 基础资源（引擎、621 张画像、静态站点，R2 artifacts/programs/<programDigest>/）全站共享，任何游戏删除都不能碰。
- 游戏数据必须按 gameId 物理独立；删除一个游戏 = 删该游戏的全部库行 + 从在架指针移除。不做引用计数、不做退役账本。

已确认的决定（不要重新讨论）：
- 方案 B：目录投影存 SQLite（published_packs/published_pack_chapters 行按需生成），R2 只保留基础资源 + 一个极小的在架指针。
- 旧版本只保留当前在架版本。
- 必须在第一个正式游戏上架前完成迁移（当前生产没有正式游戏，窗口就是现在）。
- 保留三条：不可变写+指针 CAS、读者 digest 校验、删除前栅栏。

当前生产状态（2026-11-04 实测）：
- 工作台 https://dragon-editor.720108.xyz 容器 dragon-editor-publication:ui-20261104-purge，Up healthy。
- 生产 DB 已清空游戏：games=0 fences=0 packs=0 chapters=0 chunks=0，仅保留账号。
- 玩家端 https://dragon.720108.xyz /play-api/v1/registry 返回 200 + directory: []。
- R2 现状：artifacts/programs/<digest>/（共享程序包，保留）+ 1 份空目录投影 + 其 receipt/root（当前根，读者要用）。无孤儿对象。

实施顺序（每批都要有 lane 证据，不许只跑一次人工）：
- A 批（可回滚）：上架时并行写新布局，老逻辑不动。
- B 批：读者改读新布局 / SQLite 目录，下线 R2 投影读取。
- C 批：删除改「库行 purge + 移出在架集合」，下线 6 张 content_distribution_* 表与退役流程，新增 game_releases 发布日志表。

必跑的既有 lane（改动前先跑一遍当基线）：
- node tools/verify_game_purge.mjs（8 checks）
- node tools/verify_publication_chain_browser.mjs（base 10）、--review-ui --delete-ui（10）
- node tools/verify_workbench_produce_game_browser.mjs（7）
- node tools/verify_editor_shell.mjs（92）、node tools/verify_editor_workbench_browser.mjs（219）
- node tools/verify_distribution_ledger_retirement.mjs（18 组）、node tools/verify_distribution_ledger_backup_restore.mjs（7 组）

必须新增的验证（关键，缺一不可）：
- 两个内容完全相同的游戏：删 A 后 B 的字节仍在、玩家端仍能开局。
- 上架中途失败：control 指针仍指旧版本，玩家拿到的章节字节等于旧 digest。
- 删除后：31 张表 0 行、R2 无该 gameId 残留、在架指针不含该 gameId。

部署（已授权，VPS + Cloudflare）：
- 本地 git archive HEAD server vps reader tools web VERSION .gitattributes | gzip → scp dartnode:/srv/dragon-editor/publication/app-wip.tgz
- 服务器解包 app-newN；docker build -f app-newN/vps/Dockerfile.publication -t dragon-editor-publication:<tag> app-newN
- ./backup-publication.sh → mv app app-prevN-<ts> → mv app-newN app → docker compose up -d --force-recreate
- 轮询 docker inspect --format '{{.State.Health.Status}}' 直到 healthy（实测 150–660 秒）
- 保持同一个镜像 tag 可免重新播种静态发布

约束：
- commit 前先跑适用 lane；push 需要用户明确授权。
- 不许为了变绿放宽校验或改期望值；不确定就记成「未验证」。
- 改 schema 必须同步冻结声明与计数门（当前基线 53 表/51 索引/356 列/104 对象/4 FK）。
```

## 2. 界面/术语对照（避免再绕回同一个问题）

| 术语 | 含义 | 归属 |
|---|---|---|
| 目录投影（projection） | 玩家端「选游戏/选章节」需要的整份 JSON：在架列表、每游戏章节 id、版本、digest、公告 | 其中「单游戏章节与版本」是**游戏级**；「在架列表/公告」是**全站目录** |
| 基础资源 | `artifacts/programs/<programDigest>/`（引擎、621 张画像、站点） | 全站共享，永不随游戏删除 |
| 章节字节 / 素材字节 | SQLite `published_pack_chapters.state_json`、`published_pack_assets.bytes` | 已经按 game_id 隔离 |
| 栅栏（fence） | 删除的第一步：标记游戏不可编辑/不可见，但数据还在 | 保留 |
| 物理删除（purge） | 删 31 张表里该 gameId 的全部行 | 已实现 |
| 分发账本 | `content_distribution_{events,outbox,chunks,checkpoints,cleanup,enqueue_barrier}` | 方案 B 下逐步下线 |
