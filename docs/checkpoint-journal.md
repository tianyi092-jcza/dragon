# 检查点日志（checkpoint journal）

> **用途**：只记录**本轮会话**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)，本文件不复制、不替代原始证据或验证。
> **历史归档**：旧编号批次（EDITOR-UI UI-1…UI-14、B1–B8 工作台重构、章節創作七步、方案 B 的 A/B/C 批、早期部署与迁移归因）
> 已从正文移除。CHANGELOG 等文档仍引用 §6／§10／§11／§13／§19–§33 一类旧锚点，那些链接指向的就是这些归档批次，
> 需要细节请用 `git log -p -- docs/checkpoint-journal.md` 追溯；仍被主动引用的锚点保留在文末「归档锚点」。

## 1. 当前主线状态

- **软件版本 `0.1.10`**，已推 GitHub（`c5de53d` / tag `v0.1.10` / Release），已部署生产（镜像 `20261104-bc1-ui5`，healthy）。工作树干净；Gitea `origin` 未推。
- **游戏级存储（方案 B）A+B+C 三批已全部上线**：上架时并行写 `control/directory.json`（游戏级在架指针，R2 唯一与游戏相关的对象）；读者只按指针出目录；删除 = 库行 purge + 指针移除该 gameId + `artifacts/<gameId>/` 前缀回收。
- **产品主流程在生产上已跑通**：複製遊戲（20 章全量）→ 全面檢驗 → 上架（版本 +1、状态「待上架」）→ 管理员同意（「已上架」）→ 玩家端能加载并正常游玩；删除旧产物走同一 fence→purge 链。
- **工作台回馈**：複製一次跑到完成（无「續」、真实文件数进度）；上架/检验有阻塞遮罩 + 分步状态；全站提示改成「在做什么／做成了什么／失败能怎么办」；每请求有超时（只读 60s／写 600s），UI 不再可能被一个请求永久锁死。

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

## 5. 当前阻塞

1. **无阻塞项**：v0.1.10 已上线，主流程（复制→检验→上架→同意→玩家加载→删旧产物）在生产可用。
2. **账本剩 2 条历史事件 + 1 条 cleanup 行**属惰性遗留；直接删会触发 `DISTRIBUTION_LEDGER_CORRUPT`，等整表下线时一起清。
3. **上架面板那三个按钮**（查詢原操作／以原鍵重試／只停止本機追蹤）是否删除待用户决定；若删需同时把 `submit`/`remove` 改成「重按同一动作即重用原键重送」，否则会出现「有原键但没有完成手段」的死锁。
4. 複製仍是同请求同步跑（租约 5 分钟），受 Cloudflare 约 100 秒切回复限制；现靠「丢回复→按原键查询/自动轮询」兜底。

## 6. 下一步（建议顺序）

1. **C 批剩余**：下线 6 张 `content_distribution_*` 与退役流程 + 新增 `game_releases(game_id,version,digest,state,published_at)`。这等于发布协议改版，需先在「同步发布」与「新队列」里选一条（当前 `chunks` 表冻结 payload 是异步发布的基础）。
2. 把「提示文案规范」（§3.7）落到其余面板：错误码映射补全、机器标识从用户句子里清干净。
3. 复制改后台任务 + 前端轮询（可选，彻底摆脱代理层 100 秒限制）。

## 7. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`；其余旧锚点（§26–§49）已无外部引用，需要时用 git 历史追溯。

## 8. 用户指定五档提速

（归档摘要）用户指定五档 6.5／5.0／4.8／1.8／1.0ms，每 RAF 最多 16 更新；60Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示相位。现行口径与后续复验见 [战略时序](re-notes-strategic-time.md)。
