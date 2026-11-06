# 检查点日志（checkpoint journal）

> **用途**：只记录**本轮会话**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)，本文件不复制、不替代原始证据或验证。
> **历史归档**：旧编号批次（EDITOR-UI UI-1…UI-14、B1–B8 工作台重构、章節創作七步、方案 B 的 A/B/C 批、早期部署与迁移归因）
> 已从正文移除。CHANGELOG 等文档仍引用 §6／§10／§11／§13／§19–§33 一类旧锚点，需要细节请用
> `git log -p -- docs/checkpoint-journal.md` 追溯；仍被主动引用的锚点保留在文末「归档锚点」。

## 1. 本轮会话概览

起点是「读记忆 → 按建议顺序继续」，实际跑完的是：v0.1.11 上生产 → 第一次真实上架 → 玩家站 503 根因与修复 → 编辑器三项产品收口 → 玩家标题页四项视觉收口 → 两次 digest 锁步部署（ui8／ui9）→ 系统资源模块改版。

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

生产镜像沿革：`20261105-bc1-ui7c` → `ui8`（`c3376df5…`）→ **`ui9`（`9085eb95…`，当前）**。
玩家站 static release digest 沿革：`b41ffe54…`(D2，与 pin 对齐)→`a9438b77…`→`7909bb66…`→**`7ccef941…`（当前 pin 值）**→`52be51d2…`→（本次系统资源提交后再变一次，**均未登记 R2**）。

## 2. 玩家标题页 UI（用户 m722／m824）

需求四项：①「不可用存檔管理」改成带「!」的图标钮，放在右上三颗圆钮（`intro/scene.html` 的 sound/replay/skip，20/70/120px）下面；②悬停出文字「不可用存檔」，弹窗改用中央「新游戏」同款云纹金框、缩小、标题改「不可用存檔」、说明精简、去掉「重新檢查本機目錄」（打开即自动检查）；③删掉左侧竖排「三國制霸之計」；④点新游戏后，把上一页选择框里的游戏名显示在章节窗上方（同宽、距页顶 40px、同云纹样式）。另加：内置游戏名应为繁体。

- 新增 `web/src/player/cloudframe.js`：`loadCloudFrameImages()`＋`paintCloudWindow(ctx, images, w, h)`，与 `startmenu.js` 的原版拼法一致（16px 格、上下 `frame_sq` 逐 8px、左右 `frame_cap`+`frame_col`、内部 32×32 `cloud` 平铺）。弹窗与游戏名标签共用这一份。
- `playercatalog.js`：manage 钮改 40×40 圆钮（`position:fixed; right:max(20px,env(...)); top:170px`），`aria-label="不可用存檔"`，悬停／聚焦才显示左侧药丸文字；弹窗 224×184（用户随后要求放大 → `8ae316a` 改成与章节窗同大的 448×368），标题「不可用存檔」，文案精简为一行 + 逐目录 `槽N　版本序號 M`，打开即 `inspect()`。
- `startmenu.js`：`_gameNameBanner(name)` 用 DOM canvas（`#startv` 是页面居中的 640×400，画在 canvas 内落不到页顶 40px），`left = startv.left + 88*scale`、宽 464（448 内容 + 左右 8px 金框）、`top:40px`；`_chooseChapter()` 用 `finally` 保证退出/取消都会移除标签。`_chapterRows()` 前缀改 `[重製]`。
- `intro.config.js`：`subtitle.text` 置空——**节点与淡入时序保留**，`timeline.js` 的 `subtitleOpacity ≥ 1` 放出菜单的门不变（`verify_opening_browser` 仍绿）。
- 内置名改繁体 `臥龍傳·三國制霸之計（內置）`（`playercatalog.js` 的 `BUILTIN`）。

**踩到的坑**：①内联 `style.display` 会盖掉 `[hidden]`（manage 钮隐藏时按钮数断言从 0 变 1）；②钮的 `aria-label` 与弹窗同名后 `querySelector('[aria-label="不可用存檔"]')` 会先命中按钮，测试选择器要加 `[role="dialog"]`。

## 3. 部署：ui8／ui9 锁步与三个坑

背景：Cloudflare 在 push 后自动构建部署（实测 **~50 秒到 3 分钟**；判据 `/src/player/cloudframe.js` 是否 200、`/src/ui/startmenu.js` 是否含新字符串、`/static-release.json` 摘要、`wrangler deployments list` 的 Created）。但玩家站 digest 一变，`/program-assets/<新digest>/…` 就 503，**开局全挂**（`reader/programentry.js` 只认 R2 `control/programs/` 里已登记的 digest）。所以每次 `web/` 变更都必须做锁步：服务器侧取源 → `prepare_deploy` → dist 落到 `dragon-editor-bootstrap/<digest>/` ＋ nginx location → `publication.env` 三 pin → 重启编辑器（归档进 R2）→ 玩家端部署同一份 dist。

1. **pin 与镜像必须同源**：`vps/publication-main.mjs` 监听前用 `verifyInstalledProgram` 比对镜像内 `web/`＋`server/public/trialweb.txt` 与 `STATIC_SOURCE_SHA256`。只改 pin 不重建镜像 → 容器 `{"event":"startup-failed"}` 崩溃循环、编辑器 502 约 35 分钟（16:23–16:57，回滚 `publication.env.bak-pins-20261105T162255Z` 后 11 分钟恢复）。
2. **R2 登记可能被静默跳过**：B8「R2 不是开机条件」，归档阶段传输错误判 `unreachable` → 服务照常起、日志只有 `started`＋`distribution-idle`，但 `control/programs/<digest>.json` 缺失。容器内 `r2client.list("control/programs/<D>")` 为空就**再重启一次**（幂等），17:59:28 登记完成。
3. **nginx 在容器里**：`docker exec nginx nginx -t` ＋ `docker exec nginx nginx -s reload`（宿主机报 `invalid PID number`）；复制 `location ^~ /deployment-assets/static-v1/<digest>/` 块要**按花括号深度**取块尾（块内有嵌套 `types {}`，非贪婪会插坏 → `outside location`）。

其余口径：`git archive HEAD <path> | tar -xO | sha256sum` 才是与服务器落地字节一致的校验（`web/index.html`、`web/src/content/authoring/gamesource.js`、`web/src/game/navigation/originalroadarrival.js` 是 `eol=crlf`，裸 blob sha 会假失败）；Windows 工作树是 CRLF，直接 `prepare_deploy` 得到错的 digest（`456a7beb…` 而非 `b41ffe54…`），要用 `git -c core.autocrlf=false -c core.eol=lf worktree add --detach` 的 LF 检出重建。

## 4. 字号排查（用户 m1079／m1090）

弹窗四行全是 `16px / 400 / line-height 24px`、同一字体，差异只在 `opacity .8`、对齐方式与行间距——不是三种字号。用户随后要求下拉框也 16px：`playercatalog.js` 的 `select.style` 加 `fontSize:'16px'`（notice 仍 14px，两者高度都是 28px）。

## 5. 系统资源模块（用户 m1107）

四项：①新增的 471 张头像（`web/kao/p0001..p0471.png`）并入「系統資源」头像，与原有 150 张共用；②筛选标题与输入框同一行、移到右上，与左侧 TAB 同行，不占下方高度；③头像改相册展示；④卡片＝序号-头像-路径（换行）文件大小。

- **120→128 是必要的（实锤）**：`web/src/ui/gamebar.js:5535`／`:8619` 都是 `ctx.drawImage(img, 0, 0, 128, 128, x, y, 64, 64)`，源矩形固定 128×128，120×120 会被缩小并带空角。用 Pillow `LANCZOS` 原地放大 471 张，重建 `web/kao/manifest.js`（621 条），`verify_kao_library` 输出「621 files (150 numeric + 471 p), 14.7MB, all PNG, byte-distinct」。
- **不改任何 pin、不重算 available-library**：`server/editorapp.js#getResources` 在钉死的 library roles 之后追加 `this.portraits.list()` 中尚未出现的 `kao/<id>.png`（150→621）；`#getResourceAsset` 对 `kao/<id>.png` 走新增的 `#portraitBytes(id)`（`readSharedPortrait`＋sha256/长度核对），失败时若在 library 里则回退图书馆读取；无 shared reader（Workerd 门）或都不命中则 `404 RESOURCE_NOT_FOUND`。
- UI：`editor-ui/src/CatalogPanel.vue` 新增 `.resource-toolbar` 一行（分类 TAB 左、`此分類 N 項`＋`篩選` 右），头像走 `.resource-gallery` 相册（`figure.resource-card`＝序号＋头像一行，路径与大小在 caption 两行）；`server/public/style.css` 加 `.resource-toolbar/.resource-filter(行内)/.resource-gallery/.resource-card`。
- **顺手修的陈旧门（`ff37768` 遗留）**：`verify_editor_workbench_browser` 里「上架管理必须有删除按钮」改为「必须没有」；draft 幽灵项断言改为「清空选择＋占位提示」，并修真 bug：`DraftPanel.vue` 的 `:value` 在游戏不在清单时落空，导致下拉框空白、占位文案不显示（改成 `model.selectionMissing ? '' : model.fields.gameId`）。该门 **219 checks pass**。
- 实测（`dev_editor.mjs --port 8445 --store .dragon-analysis/dev-m1107 --no-watch` ＋ Playwright）：`頭像 621／圖像圖塊 226／音樂與音效 13／字體 2／其他 9`，卡片 621 个，筛选与 TAB 同行（top 差 <10px），`/api/resources/asset` 抽验 `kao/0.png` 200/1573B、`kao/p0001.png` 200/35580B、`kao/p0471.png` 200/33393B、`grf/battle_units.png` 200/31496B，`p0471` 自然尺寸 128×128。截图 `.dragon-analysis/res-gallery.png`。

## 6. 失败尝试与坑（不要重做）

- **本机→VPS 上行废了**：5 MB 探针 316 s（≈16 KB/s），168 MB tgz 3 分钟只走 540 KB 后断连。放弃打包上传，改服务器侧 `git fetch --depth 1`（服务器到 GitHub 快且可 hash 校验）。
- **只回滚 pin 不够**：ui9 那次先改 pin 后建镜像，容器崩了 35 分钟；正确顺序是先建镜像、镜像内跑 `verifyInstalledProgram` 确认 `VERIFY_OK`，再换 pin。
- **全仓 grep 会超时**：`dist/` 有 1441 文件／168 MB，`grep -rln ... .` 300 s 超时；限定 `web/src editor-ui/src server/*.js tools/*.mjs`。
- **`option:checked` 在 select 无匹配时是空**：断言占位文案要用 `selectedOptions[0]?.textContent`。
- **dev_editor 首次登录表单有三个输入框**（目前密碼／新密碼／確認新密碼），只填两个会一直停在改密页。
- **`pragma_table_xinfo(?)` / `pragma_foreign_key_list(?)`** 必须用绑定参数，双引号会被当标识符；不要 grep 单行的 `server/deletiondefinitions.js`。
- **`Cloudflare 100 秒`**：生产上架端到端 212 s，浏览器侧被切断（`Premature close`／很可能 524），服务端仍成功——「上架超时上报失败」是待修缺陷。

## 7. 当前阻塞

1. **玩家站 digest 与编辑器 pin 未对齐 → 开局 503**：pin 仍是 `7ccef941…`，而玩家站已随 push 部署到更新的 digest（`52be51d2…` 起，系统资源提交后又变一次）。`/program-assets/<最新>/data.json` = 503。修法＝按 §3 锁步一次。
2. **既有红（不阻塞，但不许写成全绿）**：`verify_first_online`、`verify_reader_distribution`、`verify_deletion_distribution(+_workerd)`；`verify_publish_ui_model` 8 pass／7 fail（7 条早于 B3 §6／B8 的产品变更）；`verify_editor_copy_controller`、`verify_editor_backend_admin_copy`。
3. **账本**剩 2 条历史事件 + 1 条 cleanup 行属惰性遗留；直接删会触发 `DISTRIBUTION_LEDGER_CORRUPT`，等 7 张 `content_distribution_*` 一起下线时清。
4. **7 张 `content_distribution_*` 与 drainer 仍在**；下线前置是「生产实测一次 20 章上架端到端耗时」（已拿到 212 s，但伴随上面的超时缺陷）。
5. 上架面板三个按钮（查詢原操作／以原鍵重試／只停止本機追蹤）是否删除仍待用户裁决。

## 8. 用户指定五档提速

（归档摘要）用户指定五档 6.5／5.0／4.8／1.8／1.0ms，每 RAF 最多 16 更新；60Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示相位。现行口径与后续复验见 [战略时序](re-notes-strategic-time.md)。

## 9. 下一步（建议顺序）

1. **锁步部署一次**，把玩家站 digest 与编辑器 pin 对齐（含系统资源这批）：服务器取源 → `prepare_deploy` → dist+nginx → 三 pin → 重启（确认 `control/programs/<D>.json` 真登记）→ 玩家端部署 → 验 `?formalGame=…&mode=new` 返回 `x-program-digest` 且 `/program-assets/<D>/data.json` 200。
2. 修「上架超过前端等待上限被报失败」：把同步发布改为后台任务＋轮询（可选路线），或让前端接受 100 s 以上的结果回执。
3. 玩家重新上架一个版本，端到端手测开局（registry 目前为空——之前那个游戏被删除测试物理删掉了）。
4. 通用审计 `audit_events`（覆盖审核／删除／账号变更）仍未立项；建议用 `game_releases` 的真实字段与用法反推结构，不先设计。
5. C 批剩余：下线 7 张 `content_distribution_*` + drainer；`verify_publish_ui_model` 的 7 条行为断言 re-baseline。

## 10. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`；其余旧锚点（§26–§49）已无外部引用，需要时用 git 历史追溯。
