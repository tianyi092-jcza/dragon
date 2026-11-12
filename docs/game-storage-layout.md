# 游戏存储布局：基础资源 vs 游戏数据

> 状态：**已确认（2026-11-04，用户决策：方案 B —— 目录投影存 SQLite，R2 只留基础资源与指针）**。
> 相关：`docs/r2-player-connection.md`（现网 R2/reader 现状）、`docs/editor-workbench-structure.md`（工作台面板合同）、`docs/checkpoint-journal.md` §4.8–§4.9（purge 现状与缺口）。

## 1. 一句话结论

**基础资源（引擎、画像库、静态站点）全站共享一份；游戏数据（章節、据点、武将、地图、目录投影）必须按 `gameId` 物理独立。**
只要游戏数据按 `gameId` 独立，「删除这个游戏」就退化成「删它自己的目录 + 删它自己的库行」，不需要引用计数、不需要退役检查点。

## 2. 现状：三类字节与各自的归属（实测 key）

| 类别 | 现网 key / 存储 | 是否共享 | 归属判断 |
|---|---|---|---|
| **基础资源（程序包）** | R2 `artifacts/programs/<programDigest>/…`（含 621 张 `kao/*.png`、站点、引擎源码包） | 全站共用一份 | ✅ 正确：不能随任何游戏删除 |
| **章節数据 / 素材字节** | **SQLite**：`published_pack_chapters(game_id, chapter_id, state_json)`、`published_pack_assets(game_id, asset_id, bytes BLOB)` | 已经按 `game_id` 隔离 | ✅ 正确：删除走库行即可 |
| **目录投影** | R2 `projections/<全局generation>/<digest>/projection.json` | **按全局代次编号，不按 gameId** | ❌ 耦合点：游戏数据的 key 里没有游戏身份 |
| **在架根** | R2 `control/current.json`（CAS 切换） | 全局单点 | ⚠️ 需要保留（见 §4） |
| **发布收据** | R2 `control/receipts/<authorityId>/<generation>/<operationDigest>.json` | 全局代次 | ⚠️ 与账本绑定 |
| **发布账本** | SQLite `content_distribution_{events,outbox,chunks,checkpoints,cleanup,enqueue_barrier}` | 全局链 | ⚠️ 复杂度主要来自这里 |

**关键事实（容易被误判）**：真正「游戏运行数据」的大头（章節 `state_json`、素材 `bytes`）**本来就在 SQLite 里、本来就以 `game_id` 为主键**。R2 里属于某个游戏的只有那份 `projection.json`；其余 R2 内容都是全站共享的程序包与全局根/收据。

所以「解开耦合」的改动面比字面上小得多：**要把 `projection.json` 从「全局代次」搬到「游戏命名空间」。**

## 3. 耦合是怎么形成的（历史原因，不是产品需求）

三条设计叠加的结果：

1. **两步发布**：先写字节到 R2，再切 `control/current.json`，避免读者看到半成品；
2. **要表达「第几次切换」**：于是引入单调递增的全局 `generation`；
3. **想省存储 + 幂等**：内容寻址（同字节同 key，`putImmutable` 不覆盖）。

于是「游戏数据」被挂到了与别人共享的全局序号上；删除时无法按游戏删目录（可能删到同 digest 的对象），只能走「退役检查点 → 分批清理 → 收尾核验」，这就是 `content_distribution_*` 六张表的由来。

## 4. 目标设计

### 4.1 布局

```
artifacts/programs/<programDigest>/…            基础资源：全站共享，任何游戏删除都不碰
games/<gameId>/releases/<version>/projection.json   游戏数据：目录投影（本游戏专属）
games/<gameId>/releases/<version>/meta.json         版本元信息（digest、创建时间、章节数）
games/<gameId>/pointer.json                         本游戏当前在架版本指针（CAS）
control/current.json                                全站在架列表 + 根版本（只有 gameId 集合，不含游戏内容）
```

- `games/<gameId>/` 是这个游戏在 R2 上的**唯一归属目录**；不同游戏即使内容完全相同也各存一份（放弃去重）。
- 章節/素材字节仍在 SQLite（已经按 `game_id` 隔离），不搬。
- `artifacts/programs/` 是引擎与画像库，**永不随游戏删除**。

### 4.2 三个流程

**创建（复制）**

```
复制内置/既有游戏 → 生成新 gameId → 在 SQLite 写入全部游戏行（game_id 主键）
                    → R2 不需要任何写入（投影在首次上架时才生成）
```

**上架（草稿 → 运行版，整体替换）**

```
① 校验整游戏（引用完整）
② 编译草稿 → 写 games/<gameId>/releases/<version>/projection.json + meta.json（不可变）
③ CAS 写 games/<gameId>/pointer.json：{version, digest} 从旧值 → 新值
   （旧版本目录保留，供回滚/对比；删除游戏时一起删）
④ CAS 写 control/current.json：把 gameId 加入在架集合
   ← 这一步成功，玩家端才看得见；介于 ③ 与 ④ 之间玩家仍看旧版本，不会看到半套
```

**删除（物理清除）**

```
① 建立不可逆栅栏（保留：这是防误删与并发编辑的唯一闸门）
② 删 SQLite 中该 gameId 的全部行（31 张表，逐表复查 0 行）
③ 删 R2 前缀 games/<gameId>/（目录投影 + meta + pointer）
④ 从 control/current.json 的在架集合移除该 gameId
⑤ 玩家端：目录不再列出 → 直接访问返回「游戏不存在」
```

**没有引用计数、没有退役检查点、没有 chunks 清理**——因为每份游戏数据只属于一个游戏。

### 4.3 必须保留的三条（不是防御过度）

| 保留项 | 为什么不能省 | 省略后的具体故障 |
|---|---|---|
| 不可变写 + 指针 CAS | 保证读者要么看旧版、要么看新版 | 上架中断时玩家拿到半套章节，取数 500 |
| digest 校验（读者侧） | 证明「这份字节就是这一版」 | 对象被误覆盖/截断后仍然被当作正版发给玩家 |
| 删除前的栅栏 | 防误删 + 阻断并发编辑 | 作者在编辑过程中被删库，或一次误点永久丢数据 |

### 4.4 账本怎么瘦身

| 现在 | 简化后 |
|---|---|
| `content_distribution_events`（链） | 删 |
| `content_distribution_outbox`（两阶段发布） | 删 |
| `content_distribution_chunks`（大对象分片） | 删（投影是小 JSON，不需要分片） |
| `content_distribution_checkpoints` / `_cleanup`（退役） | 删（每游戏独立，删除即前缀删除） |
| `content_distribution_enqueue_barrier`（入队闸门） | 删 |
| — | 新增 `game_releases(game_id, version, digest, state, published_at)`：**就是你说的「发布日志」**，只用于展示与追责，不作为数据归属依据 |

读者准入票（`PLAYER_ADMISSION_KEYS`）**保留**：它是防「直接拼 URL 盗取」的闸门，与发布日志无关。

## 5. 迁移计划（生产目前只有 2 个未上架的测试游戏）

| 批次 | 内容 | 判定通过的标准 |
|---|---|---|
| **A（可逆，先做）** | 上架时**同时**按新布局 `games/<gameId>/releases/<v>/…` 写一份投影，旧 `projections/<generation>/…` 逻辑保持不变 | 新老两处投影 digest 一致；既有 lane 全绿 |
| **B** | 读者（`reader/`）改为优先读新布局；`control/current.json` 增加在架集合 | 玩家端目录/准入/章節字节与旧布局逐字节一致；`--public-player` 模式绿 |
| **C** | 删除改「前缀删除 + 移出在架集合」；下线 `content_distribution_*` 六表与退役流程 | 删除后：库 0 行、`games/<gameId>/` 0 对象、玩家端目录不再列出、**另一个内容相同的游戏字节仍在且可玩** |

回滚：A 阶段完全可回滚（只是多写一份）；B 阶段保留旧读取分支，一个开关切回；C 阶段在生产只有测试游戏时可以「直接删库重来」，正式游戏上线后不允许，因此 **C 必须在第一个正式游戏上架前完成**。

## 6. 验证要求（每批都要有，不能只靠人工）

| 场景 | 断言 |
|---|---|
| 两个游戏内容完全相同 | 删 A 后 B 的 `games/<B>/` 全部对象仍在、玩家端仍能开局 |
| 上架中途失败 | `control/current.json` 仍指向旧版本；玩家端拿到的章節字节 = 旧版本 digest |
| 删除后残留 | 31 张表 0 行；R2 `games/<gameId>/` `list()` 为空；`control/current.json` 不含该 gameId |
| 基础资源不受影响 | `artifacts/programs/<programDigest>/` 对象数与 digest 前后一致 |
| 权限边界 | `wolong-builtin` 仍 403；非 owner 非管理员 403；未栅栏 409 |

## 7. 与「R2 只存程序包」的关系（回应「R2 不应该是引用」）

- 你指出的**引用耦合是真实存在的**：`projections/<generation>/` 确实把游戏数据挂在了全局序号上。
- 但 R2 里**并非只有引用**：章節与素材字节一直是 SQLite 里属于该 `game_id` 的实体行，不是引用。
- 目标设计后，R2 上属于游戏的东西只剩「这个游戏自己的目录」，而程序包仍是全站一份——这不是引用游戏数据，而是**多份游戏共用同一套引擎**，也正是你要求的「程序包共享、游戏数据独立」。

## 8. 已确认的决定（2026-11-04）

1. **目录投影是游戏级数据，不是工作台系统级数据。** 管理员「复制游戏」得到的是内置游戏那份目录，作者自建游戏得到的是自己建的目录；两者只是来源不同，性质相同——都属于**某个 gameId**。
2. **方案 B：投影存 SQLite**（`published_packs.manifest_json` 一类的游戏行），R2 只保留：
   - `artifacts/programs/<programDigest>/…`（基础资源，全站共享）
   - 一个极小的在架指针（哪些 gameId 在架、各自版本与 digest）
   删除游戏时 **R2 上没有任何属于该游戏的字节需要删**。
3. **生产现有两份测试游戏属一次性测试数据**，直接彻底清除，不迁移、不兼容。
4. 旧版本保留策略：**只保留当前在架版本**（回滚靠重新发布，不靠旧目录），与「新版上线即作废旧版」的既有产品决定一致。
5. 迁移窗口：**C 必须在第一个正式游戏上架前完成**（当前生产无正式游戏，窗口即现在）。

### 8.1 由此确定的代码改动清单

| 层 | 改动 |
|---|---|
| 发布 | 上架不再写 `projections/<generation>/<digest>/projection.json`；目录由 `published_packs`／`published_pack_chapters` 行按需生成 |
| 读者 | 目录查询改为「读在架指针 → 按 gameId 取该游戏的目录行」；章節字节仍按 digest 校验 |
| 删除 | DB 行 purge（已实现）+ 从在架指针移除；**不再需要** ledger 退役链、chunks 清理、R2 前缀删除 |
| schema | 删 `content_distribution_{events,outbox,chunks,checkpoints,cleanup,enqueue_barrier}`；新增 `game_releases(game_id, version, digest, state, published_at)` 作为发布日志 |
| 保留 | 栅栏（防误删/并发）、不可变写 + 指针 CAS、读者 digest 校验、准入票 |

## 9. 实施记录：A 批已落地（2026-11-04）

### 9.1 现状事实（读代码实测，影响设计落地方式）

| 事实 | 出处 | 对方案 B 的影响 |
|---|---|---|
| R2 上每个游戏还有 `artifacts/<gameId>/<ordinal>/<releaseId>/…`（runtime index、`manifest.json`、`chapters/<id>.json`、生成素材） | `web/src/player/runtimecontract.js:32` `runtimeBase()`；`vps/runtime-index.mjs:7` | 「R2 只留基础资源」在字面上做不到：玩家端 reader 是 Cloudflare Worker，**读不到 VPS 的 SQLite**，章节/素材字节必须仍在 R2。该前缀以 `gameId` 独占（不与他人共享），所以删除时按前缀删即可，**仍然不需要引用计数** |
| 未上架但未删除的游戏：`projectPublicationCatalog` 只为 `listed` 的游戏写 `releases`（`server/publicationcatalog.js:53`），所以**新准入**在下架后拿不到 runtime | `server/publicationcatalog.js:50-57`、`reader/worker.js:145` | 更正（2026-11-04，B 批实测）：已签发的旧客户端**并非**取不到数——`file()` 的字节引用来自 admission ticket 里的 runtime index，`checkRunningState` 对「已知但未上架」的游戏用 `currentRelease` 通过身份校验，所以下架后旧能力仍可继续读既有字节；只有**新准入**返回 `403 GAME_NOT_LISTED`。指针因此必须为「已知、未上架、未删除」的游戏保留 `currentRelease`，否则 B 批会**新增**一处能力损失 |
| 删除后被 `server/gamepurge.js` 清空库行与 fence，`gameStates` 里不再有该 gameId | `server/gamepurge.js:19-51` | C 批之后指针里那条墓碑会随重写消失，读者手里只剩「查不到」。**用户 m256/m262 已决定语义**：查不到就是 `410 GAME_DELETED`（与「玩到一半被删」走同一阻塞提示），B 批已按此实现并在 `verify_reader` 锁定 |

### 9.2 A 批做了什么（可回滚）

- 新增 [reader/directorypointer.js](../reader/directorypointer.js)：游戏级目录指针的**唯一契约**（`control/directory.json`，每个 gameId 一条 entry；`digest` 覆盖不含 digest 的 body）。上架游戏携带 `release`（含 runtime 引用）、`directory`（名称/发布时间/章节序）、`announcements`；未上架只留状态；墓碑只留 `deleted: true`。
- 新增 [vps/directory-pointer.mjs](../vps/directory-pointer.mjs)：由**已冻结的投影**整形（不读 SQL、不取当前时间、不补默认值），并用自有 etag 做 CAS + 回读确认。
- `vps/distribution-resources.mjs` 在资源闭包末尾把这份目录作为**背书事实**返回（`runtimeVersion === 2` 时才有；v1 旧投影没有游戏级目录）；`vps/distribution-publisher.mjs` 只写被背书的那份，且**在根 CAS 之前**写——指针写不成功时根仍指旧代次，玩家看不到半套。
- 旧 `projections/<generation>/<digest>/projection.json` 与 `control/current.json` 逻辑**一行未改**，所以整批可回滚。

### 9.3 验证

| lane | 结果 |
|---|---|
| `node tools/verify_directory_pointer.mjs`（新增） | **22 checks**：整形保真（2 上架 + 1 未上架 + 1 墓碑，旧五列视图可回放）、9 类投影偏差拒绝、6 类指针形状拒绝、CAS/幂等/冲突/回读不一致、指针先于根、**中途失败根不动 + 恢复后同一操作补写**、注入式校验端口不背书时不写指针 |
| `node tools/verify_publication_chain_browser.mjs` | 10 checks 绿；新增断言：每推进一代写一份指针，`pointer.generation === root.generation`，且指针条目与旧 `projections/<gen>/<digest>/projection.json` 的同一 gameId **逐字段相同** |
| `node tools/verify_workbench_produce_game_browser.mjs` | 7 checks 绿；新增断言：上架写出指针，`games` 恰为量产的 gameId、20 章、`1.0` |
| `node tools/verify_first_online.mjs` | 116 checks 绿（新增「指针先于根、重试不重复写」） |
| `node tools/verify_frozen_publication_root.mjs` | 46 groups 绿（新增指针代次/digest 断言） |
| `verify_distribution_publisher{,_workerd,_r2client,_retirement}` / `verify_distribution_resources{,_workerd}` / `verify_static_resources` / `verify_static_batch` / `verify_publication_catalog` / `verify_player_pack_compiled` / `verify_reader` / `verify_distribution_drainer` / `verify_distribution_restore` / `verify_publication_server` / `verify_publish_to_r2` | 全绿（注入式 resource-verifier 端口不背书目录，因此这些 lane 的端口只需放行新 key） |

未跑/未改：B 批（读者改读指针）、C 批（库行 purge + 移出在架集合 + 下线 `content_distribution_*` + 新增 `game_releases`）。C 批改 schema 必须同步 `tools/verify_editor_schema_sources.mjs`（53/51/356/4）、`tools/verify_distribution_schema.mjs`（53/51/356）与 `server/deletiondefinitions.js` 的冻结声明。

## 10. 实施记录：B 批已落地（2026-11-04，读侧切到指针 + 玩家删除 UX）

### 10.1 读者（`reader/worker.js`）

| 改动 | 内容 | 依据/边界 |
|---|---|---|
| 指针优先 | `snapshot()` 先走 `pointerView()`：读 `control/directory.json`，仅当 `pointer.generation === control.generation`、`authorityId` 一致、`sha256(JSON.stringify(directoryPointerBody(pointer))) === pointer.digest` 时才用 `directoryState(pointer)` 作为视图，`runtimeVersion` 记为 2 | 指针是**同代次**视图，不是新的一层权威；digest 用与写出端完全相同的字节序列重算 |
| 回落 | `control.version !== 2`（旧根）、指针缺失、指针代次与根不一致（发布中途失败：指针已写、根 CAS 未提交）→ 继续读该代次的 `projections/<gen>/<digest>/projection.json` | 用户要求②「中途失败玩家仍拿旧 digest」靠这条成立。C 批下线投影读取前必须先解决这个窗口，否则发布窗口会变成读侧 503 |
| 未上架未删除 | 指针为这类游戏保留 `currentRelease`，`checkRunningState` 的身份校验照旧通过，`file()` 按 ticket 里的引用继续供字节 | 见 §9.1 更正条目；B 批**不得**削减这项既有能力 |
| 查不到 = 删除 | `checkRunningState`、`admit`、`status` 三条路径：gameId 不在视图里 → `410 GAME_DELETED`（原本 503 / 403） | 用户 m256 的语义选择 A + m262 的「弹窗只能确认」。**这是产品可见语义反转**，`tools/verify_reader.mjs` 的三条旧断言（unknown→403、unknown status→200、missing state→503）已同步改为 410 + `error: 'GAME_DELETED'`，不是放宽校验 |
| 不变 | `control/current.json` 仍是唯一权威根；`state.uploaded` 仍取根对象时间戳（firstOnline 基准）；渲染/账户/资源闭包逻辑未动 | |

### 10.2 玩家侧删除提示（阻塞项，只能确认）

- 文案改为告知句 `該遊戲已刪除！`（繁体，游戏内统一），单一「確認」按钮；右键、Esc、滚轮、辅助点击都被吞掉，弹窗**不关闭、不后退、不把右键当作保留**（用户 m262 + m272）。
- 确认后执行 `discardLocalSaves()`（逐槽 `compareDelete`，核不上的保留不猜删）→ `onExit` → 回到游戏开始/选择页。
- 清档失败时**仍是同一个确认按钮**（提示「本機進度尚未清除，請再確認一次。」）：不新增第二个选项，也不假装清空成功。
- 覆盖四条触发面：①加载入口目录里没有该游戏（`playerpublic.js`）；②新局预览/选章（`playernewgame.js`）；③读档面板（`playerrestore.js`，原双按钮分支已删除）；④运行期换章/状态检查（`playersessionhost.js` 的 `deleted` 出口，`discardSaves` 端口由 `playerpublic.js` 注入）。
- `mountDeletedSavePrompt` 与 `GAME_DELETED_SAVE_NOTICE` 已不存在（旧双按钮契约作废），新入口为 `mountDeletedGameNotice` / `GAME_DELETED_NOTICE`。

### 10.3 验证

| lane | 结果 |
|---|---|
| `node tools/verify_reader_directory_pointer.mjs`（新增） | **16 checks**：真实 workerd/R2 里「冻结投影（无指针）」与「同代次指针」的 registry / status / 释放历史 **响应字节完全相同**、章节字节相同、准入 identity 与 manifestDigest 相同；指针代次超前时回落旧投影并给出同一份字节；指针 body 被改或 digest 被改 → 503 fail closed；恢复原字节后重新可用；指针里没有的 gameId → status/admit 均 410 `GAME_DELETED` |
| `node tools/verify_reader.mjs` | 77 checks 绿（含三条语义反转后的新期望值） |
| `node tools/verify_reader_announcements.mjs` / `verify_player_client_workerd.mjs` | 107 / 7 checks 绿 |
| `node tools/verify_player_deleted_saves.mjs` | 12 checks 绿（告知文案 + 旧入口不存在 + 端口缺失即拒绝） |
| `node tools/verify_player_deleted_entry_browser.mjs` | 5 checks 绿（真 Chromium：只有一个按钮、右键与 Esc 不关闭也不离开入口页、确认后才清档并跳转） |
| `node tools/verify_player_restore_browser.mjs` | 36 checks 绿（读档面板删除态、右键阻塞、目录读取失败不清档、核不上的槽保留） |
| `node tools/verify_player_new_game_browser.mjs` / `verify_player_session_host_browser.mjs` | 20 / 21 checks 绿 |
| `verify_player_chapters` / `verify_player_client` / `verify_player_pack_compiled` | 42 / 50 / 6 checks 绿 |

### 10.4 B 批未做 / 留给 C 批

- 用户要求的验收①（两个内容完全相同的游戏，删 A 后 B 字节仍在且能开局）与③（删除后 31 张表 0 行 + R2 无该 gameId 残留 + 在架指针不含该 gameId）都需要「删除 = 库行 purge + 重写指针」这条 C 批路径，B 批无法自证。
- 验收②目前在 B 层用「指针代次超前 → 回落旧投影、字节与旧 digest 一致」证明；C 批下线投影读取后必须重新证明同一件事。
- 指针只在 `control.version === 2` 的冻结根上被接受；旧 v1 根一律走投影（回归 lane 覆盖）。
- 未 push、未部署。

## 11. 实施记录：C 批已落地（2026-11-04，删除 = 库行 purge + 指针移除 + 前缀回收）

### 11.1 本轮实际做了什么

| 改动 | 内容 | 依据/边界 |
|---|---|---|
| 删除后的 R2 回收 | 新增 `vps/game-reclaimer.mjs`：①读 `control/directory.json` → 按 `sha256(JSON.stringify(directoryPointerBody(pointer))) === pointer.digest` 复核 → 过滤掉该 gameId 一条 → 用**读到的 etag** 做 CAS 写回 → 回读逐字节确认；②按 `artifacts/<gameId>/` 前缀 list+remove，直到前缀为空；③（ui15 补全）按 `private/<gameId>/` 前缀清编辑器私有位元組（`vps/file-bucket.mjs` 的 `remove`，`installed/` 拒绝删除），回执新增 `privateObjects` 档数 | 游戏级数据物理独立，所以删除只涉及这两件事。**不推进代次**：这是已提交目录的修补，不是新发布；条目移除与保留墓碑对读者等价（都是 410 `GAME_DELETED`），所以玩家可见语义一个字都没变 |
| 不碰的东西 | `artifacts/programs/<programDigest>/`（共享程序包）、`kao/<id>.png`（621 共享画像）、`control/receipts|roots/…`（冻结证明链）一律不动；不做引用计数、不做退役账本 | §8 已确认的决定 |
| 路由接线（现行，取代C批先删库再回收） | `server/editorapp.js#postPurge`：`GamePurge.check`先核身份/归属/fence/名称/修订/已下架 → `purgeReclaimer`移除指针、清空两处专属前缀 → 交易内再次核权并purge库行 → registry revision bump；成功回执 `reclamation: { state: 'completed', pointer, objects, privateObjects }` | **缺端口503 `RECLAIMER_UNCONFIGURED`；回收失败503 `RECLAIM_FAILED`及reason，均不删库行**。保留fence和管理行用于重试；已经清掉的文件不可恢复，重试只清余项。不得把两种存储说成跨库原子事务。 |
| 端口装配 | `vps/publication-server.mjs`只在分发桶具有list/remove时装配完整回收器，带实际私有bucket；`tools/dev_editor.mjs`无runtimeStager/公开分发桶，只通过共用`reclaimPrivateGame`清其实际私有桶，回执pointer=absent、objects=0 | 未装配时拒绝purge，不再先删库后pending；不为开发环境虚构公开桶。历史已经删库但未回收的游戏须按原gameId及实际存储单独核对清理，不能按名称盲扫或声称新代码已清理旧垃圾。 |
| 发布器重建目录 | `server/publicationproducer.js#catalog` 在冻结 catalog 复核之后，丢弃 `content_games` 已无行的 gameId | 修**预存缺陷**：purge 后墓碑留在 catalog 里会让下一次发布被 `#assertCatalogAuthority` 判成 503 `DISTRIBUTION_AUTHORITY_CORRUPT`。墓碑只服务于「fence 了但还没 purge」的中间态 |

### 11.2 为什么这一批没有下线 6 张账本表（scope 裁定，需用户决定）

调研结论（读代码实测，供决策）：`content_distribution_state/events/chunks/checkpoints/cleanup/enqueue_barrier` 不是「只管退役的账本」，它们同时是**异步发布协议的载体**：

1. `chunks` 持有**入队时冻结的 payload 字节**（128KB 分片）。HTTP 发布写库即入队，drainer 之后按分片还原 payload 做资源闭包校验——删掉它就必须改成同步发布（HTTP 请求里跑完校验 + 上传）或引入新的冻结队列。
2. `events` 是操作身份链，`server/management.js` 的**管理回执里存 `{operationId, generation}` 并回查 events**（`#distributionRow`）。删表 = 改管理回执协议（`encodeManagementReceipt`/`decodeManagementReceipt` 已验收的形状）+ 一批 UI/lane。
3. `checkpoints`/`cleanup`/`barrier` 才是纯退役机制，可以随表一起消失。

因此「下线 6 张表 + 新增 `game_releases`」不是清理，而是发布协议改版，涉及已验收的管理回执格式、玩家可见的发布延迟语义与 20+ 条 lane。本轮按最小不可逆风险原则**不做**，改为先交付用户真正要的删除语义；`game_releases` 是 `events` 的替代日志，应与协议改版同批落地，避免现在加一张没有消费者的表。

两条可行路线（待用户选）：**A 同步发布**（HTTP 内完成 verify + 归档 + 指针 CAS，drainer 退役，`game_releases` 直接当发布日志）；**B 新队列**（保留异步，用 `game_releases` + 新冻结表替代 events/chunks，管理回执改存 `releaseDigest`）。两条都要动 `management.js` 的回执格式。

### 11.3 验证（本轮实跑）

| lane | 结果 |
|---|---|
| `node tools/verify_game_purge_reclaim.mjs`（新增） | **9 checks**：指针对不上 digest 整体拒绝且一个字节都不删；删 A 只掉自己那条 + 自己的 3 个物件清空；**另一个内容完全相同的游戏条目逐字段不变、共享程序包与画像逐字节不动**；`directoryState` 视角 A 不存在、B 的 chapters/release 引用不变；重复回收幂等（不重写指针）；指针缺失只清字节；CAS 冲突一次后收敛、持续冲突如实报错且不动指针与字节；list 越界拒绝 |
| `node tools/verify_game_purge.mjs`（改） | **11 checks**（原 8）：新增三条——回执 `reclamation.state === 'completed'` 且 `pointer === 'removed'`、`objects` 等于本游戏对象数；R2 上该 gameId 前缀 0 字节且指针不含该 gameId、代次不变；同内容的另一个游戏与共享位元组不动。scope 改写为「库行 purge + 注入式 in-memory R2 回收；不含真实 S3/R2/TLS、不含账本退役、不含玩家端通关」 |
| `node tools/verify_publication_producer.mjs`（改） | **25 组**（原 24）：新增「purge 后重建目录必须丢墓碑」——删掉某游戏全部行后下一次 `listing` 仍能入队，冻结 payload 里不再出现该 gameId，projection 的 gameStates/releases/directory 都不再有它 |
| `node tools/verify_publication_server.mjs` | 18 checks 绿（端口校验 + 无 list/remove 时不装配回收器） |
| `node tools/verify_reader_directory_pointer.mjs` | 16 checks 绿（读侧未改动，回归确认） |
| `node tools/verify_editor_shell.mjs` | 92 checks 绿 |
| `node tools/verify_publication_chain_browser.mjs` | 10 checks 绿（真 Chromium + 真 workerd R2 + 默认发布器，20 章） |
| `node tools/verify_editor_schema_sources.mjs` | 23 owners / 53 表 / 51 索引 / 356 列 / 4 FK 不变（本轮**无 schema 改动**） |

### 11.4 仍未验证 / 未做的

- 用户验收①的**全栈**版本（两个真实上架游戏，删 A 之后用真 workerd 读者把 B 从 registry→admit→逐章读到开局）尚未有 lane：本轮在字节层与视图层证明「删 A 不动 B」，未跑完整开局链路。
- 验收③的「31 张表 0 行」用真 SQLite 验了；「R2 无残留 / 指针不含该 gameId」用的是注入式 in-memory 物件埠（与生产同一份回收代码，但不是真实 R2 桶）。
- 验收②（上架中途失败玩家仍拿旧 digest）B 批是用「指针代次超前 → 回落旧投影」证明的；投影读取还没下线，所以这一条目前仍然依赖投影回落。
- 6 张账本表、退役流程（retirement 18 组 / backup_restore 7 组）与 `game_releases` 都还在，见 §11.2 待决定项。

### 11.5 发布协议改版：两条路线对比（2026-11-04，待用户裁决）

§11.2 把「下线 6 张表 + 新增 `game_releases`」判为**发布协议改版**。本节补上决策所需的实测数据与两条路线的具体影响面。

#### 决策所需的关键事实（本次实测）

| 量 | 数值 | 来源 |
|---|---|---|
| 一次 20 章上架的分发排空耗时（校驗＋上傳＋指标 CAS＋根 CAS＋回讀，2 个代次：上架 1 次、同意 1 次） | **7041 ms**（≈3.5 s/代次） | `tools/verify_workbench_produce_game_browser.mjs` 新增诊断字段 `drainMs`、`drainStates=[VISIBLE_CONFIRMED, VISIBLE_CONFIRMED]` |
| 该 lane 全程 | 3m23s | 同上（绝大部分是 20 章**複製**那笔同步长请求，不是分发） |
| 一次上架的 R2 写入物件数 | 34 个（含共享物件） | 同上 `r2Objects` |
| 代理层对源站的约 100 秒切换上限 | 已知约束 | journal §4.16／§4.19（复制曾被 499 切断，但执行不中止） |

**结论性判断**：分发本身**不是**同步发布的硬阻塞——每次上架约 3.5 秒（本地 Miniflare R2＋真实 verify 闭包），距 100 秒有两个数量级余量。真正的长请求是「20 章複製」，与发布协议无关。生产需一次实测确认（真实 R2 网络延迟、更大章数会线性放大）。

#### 路线 A：同步发布（HTTP 内跑完 verify＋归档＋指针 CAS，drainer 退役）

- **改动**：publish／listing 请求在 HTTP 内依次跑 `producer.expectedObjects` → `verify`（资源闭包）→ 上传 root archive／projection／目录指标 → 根 CAS → 回执；
  `vps/distribution-publisher.mjs`、`vps/distribution-drainer.mjs` 与 `content_distribution_{state,events,outbox,chunks,checkpoints,cleanup,enqueue_barrier}` **7 张表**退场；
  `game_releases(game_id,version,digest,state,published_at)` 直接当发布日志；`managementreceipt` 的 `distribution:{operationId,generation}` 改存 `releaseDigest`。
- **收益**：可见性与回执同一时刻；**删除整个异步骨架**（常驻 drainer 循环、两阶段 outbox、入队时冻结的 chunks payload、入队屏障、退役检查点与清理表）；
  「已提交但未同步」（`COMMITTED_SYNC_PENDING`）这个中间态消失——它是今天最难向用户解释的状态。
- **风险**：①请求时长随章数/游戏数线性放大（现测 3.5 s/代次，生产需实测）；②丢回应＝状态未知，需要复制那套「原键查询／幂等重送」；
  ③原子性从「库内交易＋冪等重放」变成「HTTP 内多步＋CAS」，失败可能留下已上传但未 CAS 的孤儿物件（`vps/game-reclaimer.mjs` 的前缀回收可直接复用）。
- **影响面**：约 **22 条 lane** ＋ 7 个 fixture ＋ 4 个计数门（53/51/356/4）＋ `server/deletiondefinitions.js`；其中退役类 8 条可整体删除，drainer 类 4 条退场，其余改写。

#### 路线 B：新队列（保留异步，`game_releases`＋新冻结表替代 events/chunks）

- **改动**：drainer 与两阶段保留；`events` → `game_releases`；`chunks` → 新冻结表（或沿用并改名）；`checkpoints/cleanup/enqueue_barrier` 随退役机制删除；回执同样改存 `releaseDigest`。
- **收益**：玩家可见性语义**不变**（延遲发布），不新增 HTTP 时长风险；改动集中在帐本与回执。
- **风险**：表少了但**机制没少**（drainer／outbox 仍在），复杂度下降有限；`game_releases` 与 `events` 的语义要重新对齐；lane 改写量仍约 22 条——投入与 A 相当，收益更小。

#### 建议

**选 A（同步发布）**，前置两道保险：

1. **生产实测一次**：在真实 R2／代理链上量一次 20 章上架的端到端耗时；若稳定 <60 秒，A 路线成立；若接近或超过 100 秒，退回 B。
2. **失败语义先落地**：发布请求沿用複製已经验证过的「丢回应＝状态未知 → 原键查询／幂等重送 → 不重复入队」模式，并且**先做可回滚批**（保留 drainer 与老表，两条路径并存一代），再删表。

#### 待用户裁决（三点）

1. 路线选 **A 同步发布** 还是 **B 新队列**。
2. 管理回执是否接受 `distribution:{operationId,generation}` → `releaseDigest`（会影响管理 UI 与回执 lane 的已验收形状）。
3. 是否接受「上架／同意＝立刻可见」的产品语义（即删掉「已提交、尚未同步」这个可见状态）。


## 12. A 路線第一版已落地（2026-11-04，可回滾；尚未上生產）

### 12.0 与上一節的關係

上一節§11.5 的三點待裁決已由用戶裁定：**走 A（同步發布）**，先做**可回滾第一版**。本批只做「HTTP 內推進分發」，**不动 schema、不删表、不换回执形状**；删除 7 张账本表改成 `game_releases` 日志与 `releaseDigest` 回执仍是后续批次。

### 12.0.1 本批实际改动

| 位置 | 改动 | 可回滾性 |
|---|---|---|
| `server/editorapp.js` | 新增可信注入埠 `distributionDrain`（非函式或非 frozen 模式一律 `TypeError`，且在动 SQL 前拒绝）；`#advanceDistribution()` 一步一代次推进，上限 8 步／25 秒，失败只降级为 pending；`#publishPin` 改为返回 `{pin,gameId,releaseId,replayed}`（三处返回点一致） | 未注入即旧行为 |
| `POST /api/publish` | 仅当注入 drain **且非重放**时推进，并在回执里**多带一个可選** `distribution` 描述子（与 GET 状态同构）；重放只观测不推进 | 未注入＝回應逐位元相同 |
| `POST /api/games/<id>/listing`（同意上架） | 提交後在本次請求內推进；**管理回執形状不变** | 同上 |
| `server/public/publish.txt` | `fieldsOptional` 放行那一个可選键；`publishReceipt` 逆写回原 pin 欄位（描述子不混进永久回执）；抽 `distributionStatus()`，状态 GET 与新回执共用同一套核验；已确认就**不再补查**状态 GET | 缺键＝旧协议，照旧补查 |
| `vps/publication-server.mjs` | `distributionDrain: () => publisher.drainOne()`；drainer 仍在跑（两条路径并存一代） | `EDITOR_SYNC_PUBLISH=0` 不注入 |
| `vps/publication-config.mjs` | 可選 `EDITOR_SYNC_PUBLISH`（`0`/`1`，未设＝开），**只降不升**，不影帳本与其他开关 | — |

**为什么它真可回滚**：drain 只是同一 publisher 的 `drainOne()`（幂等、只读寫既有帳本），不發新代次、不改回执、不解除 recovery 锁；关掉注入就回到旧协议，database 里没有任何本批引入的新表或新欄位。

### 12.0.2 验证（本次实跑）

- 新 lane `tools/verify_publish_sync.mjs`：**11 组绿**——构造门（非函式／非 frozen 拒）；回滚态回執**无** `distribution` 鍵且分發仍 pending；排程器路徑照旧可用；+ 注入後回執自带 confirmed 且不需外部排空；**重放不推进**；推进抛错→回執 200 + pending、帳本仍留該代次且排程器随后补上；同意上架在本次请求內推进且回執形状不變；**並发同鍵两個请求得到同一份回執、推进不交叉（peak=1）、帳本只多一代**；**回滾並存态：舊协议实例留下的 pending 代次，与排程器同时工作仍能被补齐，且代次从 1 起连续不重複**。
- 回归：`verify_frozen_publication_root.mjs` 46 组（真 Request／20 章／8 代账本／50 表恢复）——**它先抓到本轮一个真缺陷**：并发同键发布走的 `#publishPin` 回放分支漏改返回形状，导致回应空 body；已修正并重跑绿。
- `verify_publish_ui_model.mjs`：新增 1 条 A 路線 client 測試通过（确认/待确认/缺键三種回執）；总 9 通过／7 失败——**7 条失败与 HEAD 基线同名相同**，均为早于 B3 §6／B8 的既存项。
- `verify_publish_operations_root.mjs` 31 组、`verify_publication_producer.mjs` 25 组、`verify_vps_frozen_service.mjs` 14 组、`verify_publication_main.mjs` 93 checks 均绿；`editor-ui/build.mjs --check` 不受影响（无 `.vue` 改动）。

### 12.0.3 本批未做（未驗證不得声称完成）

1. **未上生產**：部署需单独授权；生产端到端时长（真 R2／代理链）仍未实测，§11.5 的前置条件②仍未满足。
2. **未删表**：7 张 `content_distribution_*` 与 drainer 仍在；`game_releases` 日志与 `releaseDigest` 回执未做。
3. **跨实例未同步**：推进串行化只在同一应用实例内（HTTP 并发已覆盖）；两个进程同时推进同一帳本靠 `drainOne` 幂等与 CAS守住语义，但它们各自等自己的队列，回執的 `state` 取的是那一瞬的观测值（客户端仍会补查）；上生产前应保持单实例。
4. **未重现** `COMMITTED_SYNC_PENDING` 的生产条件（本地 lane 只模拟了「推进抛错」），也没有真实 R2 网络延迟下的耗时样本。

## 12.1 上生产记录：A 路線第一版（2026-11-04，镜像 `20261104-bc1-ui6`）

| 项 | 值 |
| --- | --- |
| 提交 | `b8d62b0`（A 路線第一版 + 文案/门重修 + 版本记录） |
| 镜像 tag | `dragon-editor-publication:20261104-bc1-ui6`（`sha256:f19ef5b7…`） |
| 回滚点 | 容器 dir：`app-prev13-<ts>`；数据：`/root/dragon-editor-backups/publication-20261104T153126Z` |
| 静态发布 digest | **未变**（本轮只改 `server/`、`vps/`，未动 `web/` 与 `trialweb.txt`，`git archive` 内的安装校验输入不变） |
| 首次健康 | 9 分钟（首启归档静态程序 1439 个物件，与 §12.2 坑 3 同形） |

步骤（较上一轮省了两步）：`git archive HEAD server vps reader tools web VERSION .gitattributes | gzip -1`（161 MB）
→ `scp` 到 `dartnode:/srv/dragon-editor/publication/app-wip-ui6.tgz`（48 s）
→ 解包 `app-new13` → `docker build -f app-new13/vps/Dockerfile.publication -t dragon-editor-publication:20261104-bc1-ui6 app-new13`
→ `./backup-publication.sh` → `mv app app-prev13-<ts>` → `mv app-new13 app` → `.env` 改 `EDITOR_DEPLOYMENT_ID` → `docker compose up -d --force-recreate` → 轮询 health。
**没有动 nginx、没有动 `publication.env` 的三处静态 pin、没有 `wrangler deploy`**——本轮没有玩家端字节变化，`/play-api/v1/registry` 仍是 `generation 3`。

上线后只读实测：`/` 200、`/api/health` 200（`accounts-sessions`、`initialized:true`）、
`/shell-ui.js` **698276**（＝本地构建产物）、`/publish.js` **30121**（＝本地 29839 加换行转换）、玩家端 `registry` 200／generation 3。

**开关与回滚**：`EDITOR_SYNC_PUBLISH` 未设＝开（上架／同意在本次请求内推进）。要退回旧协议：在 `publication.env` 加
`EDITOR_SYNC_PUBLISH=0` 并 `docker compose up -d --force-recreate`，**不必换镜像、不必回滚数据**（本批没有 schema 变更）。
要整镜像回滚：`docker compose down` → `mv app app-ui6-failed && mv app-prev13-<ts> app` → `.env` 改回 `20261104-bc1-ui5` → `up -d`。

**未验证**：生产环境没有做一次真实上架，所以「真 R2 网络下的同步耗时」与「上架后立刻对玩家可见」仍只有本地证据
（`verify_publish_sync` 11 组＋`verify_frozen_publication_root` 46 组，内存 R2）。这一步要管理员在生产点一次上架才能量到。

## 13. 部署记录：A+B+C 已上生产（2026-11-04）

这一次部署同时改了两个面：**VPS 工作台/发布器**（`dragon-editor.720108.xyz`）与 **Cloudflare 玩家端 Worker**
（`dragon.720108.xyz`，`wrangler deploy`）。两者必须落在**同一份静态发布**上，否则玩家端正式入口会 503。

### 12.1 本次用的具体值

| 项 | 值 |
| --- | --- |
| 提交 | `af21e37`（A 批）→ `e4bbca3`（B+C 批）→ `4f8e1c3`（重建 trialweb 束） |
| 静态发布 digest | `b93d19e87fc834fc340fc6094d93f9bacb8e7c685bed339b0623217447c76ab0`（1441 文件 / 164.30 MiB） |
| source tree digest | `260cc9b4fcbb838da0c89ab3764c6a3b09ab10fb211220ff0421dadb63ebab7d` |
| 镜像 tag | `dragon-editor-publication:20261104-bc1` |
| 回滚点 | `app-prev7-20261104T082827`、`/root/dragon-editor-backups/publication-20261104T082754Z`、nginx conf `.before-b93d19…`、`publication.env.before-b93d19…` |

### 12.2 步骤（含这次踩到的坑）

1. `git archive HEAD server vps reader tools web VERSION .gitattributes` → 上传 → 解包 `app-new7`。
2. 服务器上 `docker run … node tools/prepare_deploy.mjs` 产出静态发布，digest `b93d19…`。
3. 静态发布放 `/home/web/html/dragon-editor-bootstrap/<digest>/`，并在 nginx conf 里加同形状的
   `location ^~ /deployment-assets/static-v1/<digest>/`，`nginx -t` + reload。
4. `publication.env` 三处 pin（`STATIC_PATH_PREFIX`/`STATIC_RELEASE_SHA256`/`STATIC_SOURCE_SHA256`）、`.env` 换 `EDITOR_DEPLOYMENT_ID`。
5. `docker build` → `backup-publication.sh` → `mv app app-prev7-…` → `mv app-new7 app` → `compose up -d --force-recreate` → 轮询 health（**7.5 分钟** healthy）。
6. **坑 1：`server/public/trialweb.txt` 陈旧**。B 批改了 `web/src/player/*.js` 却没重建束，不重建就会对外提供旧客户端。
   现在已用 `node tools/build_trial_web_bundle.mjs` 补齐（`4f8e1c3`，sha256 `e4185662…`、files 240）。
7. **坑 2：工作树是 CRLF，`git archive` 出来是 LF**。本地 `prepare_deploy`（CRLF）得 `a2eed7c9…`，服务器（LF）得 `b93d19e8…`；
   **source tree digest 两者相同**，只有逐文件 sha 不同。所以玩家端 Worker 必须用 **LF** 构建产物部署，否则
   `/static-release.json` 的 digest 在 R2 里没有对应程序包，正式入口必然 503。做法：`git archive` 到临时目录 →
   在那里 `prepare_deploy.mjs` → 把 `dist/` 拷回来 → 用一份**去掉 `build.command`** 的临时 wrangler 配置
   （`main`/`assets.directory` 用绝对路径）执行 `wrangler deploy -c <临时配置>`。仓库里的 `wrangler.jsonc` 不动。
8. **坑 3：程序归档会在首启时超时并降级启动（B8 语义）**。首启上传 1439 个物件约 18 分钟才完成，容器启动那次
   只写了 545 个就按「传输层不可达」降级（服务照旧 healthy，`staticArchive='unreachable'`）。随后在容器里用同一份
   `createStaticArchiver`（幂等跳过已存在物件）跑完 `stage()`，再用 `registerStaticProgram` 补 `control/programs/<digest>.json`，
   最后强制重建容器，健康 2 分钟，归档/登记都已是幂等命中。
9. **坑 4：生产 R2 有 v2 根但没有 `control/directory.json`**（A 批上线前根就已存在）。旧读者靠投影回落照旧 200，
   新读者一旦指针缺失会 503 `REGISTRY_MISSING`。因此上生产时用 `directoryPointerFromProjection` +`writeDirectoryPointer`
   按当前根代次补写了一次指针（空目录 + 1 条 `deleted` 墓碑），补写前后 `registry` 响应字节完全相同。

### 12.3 上线后实测

- `https://dragon.720108.xyz/static-release.json` 的 sha256 = `b93d19…`（与 VPS pin、R2 程序包一致）。
- `GET /play-api/v1/registry` → 200，`{"generation":1,…,"directory":[]}`（与补写指针前逐字节相同）。
- `GET /play-api/v1/status?game=<任意未知 UUID>` → **410 GAME_DELETED**（B 批语义已在生产生效）；
  墓碑游戏 `149b67be-…` 同样 410。
- `artifacts/programs/b93d19…/static-release.json` 在 R2 存在（223449 字节，digest 自证）+ 登记物件存在。
- 工作台 `https://dragon-editor.720108.xyz/` → 200；容器 `20261104-bc1` healthy，日志 `{"event":"started"}` + `{"event":"distribution-idle"}`。

### 12.4 仍未验证（部署面）

- 生产上**还没有任何上架游戏**，所以「玩家真正开局」这条端到端仍未在现网跑过；正式入口对已删除游戏返回 503
  「遊戲暫不可用」属预期（没有程序可用的一次性入口，不是发行链缺陷）。
- 验收①的全栈形态（两个真实上架游戏，删 A 后 B 仍能开局）与验收③的真实 R2 桶版本仍未补 lane（§11.4 同一条）。
- 生产指针是**手写补的**，不是发布器写的；下一次真实上架会由 `drainOne` 用同一整形函数覆盖它，两条路径产出同一形状。

### 12.5 上线后又按用户要求清空到 generation 0（2026-11-04）

用户指示「所有产生的数据都可以清除，保持干净」后，把生产回到**无根、帐本 gen 0** 的 bootstrap 前状态，
以便重新走一遍「複製遊戲 → 上架 → 同意」。

- 清空前的备份：`/root/dragon-editor-backups/publication-20261104T091229Z`。
- 删：帐本历史（events/checkpoints/cleanup/chunks/outbox 全清，`state` 重置为 gen 0 且 digest/blocked 为 NULL）、
  重放日志（`operations`/`content_operations`/`content_reservations`/`copy_http_commands`）、`private-objects` 196MB 孤儿 blob、
  R2 的 `control/current.json`、`control/directory.json`、`control/roots/…`、`control/receipts/…`、`projections/…`。
- 留：`users`（登录）、`sessions`、`login_rates`、`installed_sources`、`content_registry`（複製遊戲靠它）、
  R2 `artifacts/programs/**`（共享程序包）、`control/programs/**`（程序登记）、`kao/**`（621 张共享画像）。
- 结果：53 张表 0 行（除平台行）、`foreign_key_check` 0、`integrity_check` ok；容器 healthy；工作台 200；
  玩家端 registry `503 REGISTRY_EMPTY`、首页 200。
- **注意**：清空后首次启动仍要读 1439 个程序物件做核准核对，healthy 需要约 **6–8 分钟**。

## 14. 发布日志 `game_releases`（additive，2026-11-04）

用户选择方案 **A**：只做「新增审计日志 + 回执带 digest」，**不动** 7 张 `content_distribution_*` 表与 drainer。理由是实测阻塞（不是偏好）：

- `content_distribution_chunks` 是崩溃一致性**唯一载体**：payload 是累积 catalog，`firstOnline.generation` 自引用，`publicationproducer.#catalog` 从 `ledger.entry(tail).payload` 反序列化。删表等于删掉恢复能力。
- 远端头对账以 events 代次为锚；`EDITOR_SYNC_PUBLISH=0` 回滚路径就是 drainer。
- 生产库里已有真实数据（generation 3），删表批是不可回滚的单向操作。

### 14.1 语义

`game_releases(game_id, version, digest, state, published_at)`：

| 列 | 含义 | 来源 |
|---|---|---|
| `game_id`、`version` | 哪一次发布 | `payload.runtime.ordinal`（`^1\.(0\|[1-9][0-9]*)$`） |
| `digest` | 该次发布的 operation digest | `distribution_events.operation_digest` |
| `state` | `pending` → `confirmed` | 入账时 pending，`confirmInTxn` 时转 confirmed |
| `published_at` | 可见时间 | `saved.visibleAt` |

- 只在 `kind === 'publish'` 且信封里真有 `runtime.ordinal` 时写行；合成/纯传输 publish（无 runtime）不写。
- `runtime` 存在但 ordinal 非法 → 422 `DISTRIBUTION_OPERATION`，且不落半行（写行在 chunks 之前、同事务）。
- 主键 `(game_id, version)`：同版本重放走 `requireRecord` 校验，不同 operation digest 抢同一版本 → 503 `DISTRIBUTION_LEDGER_CORRUPT`；不静默覆盖。
- 管理回执 `distribution.releaseDigest` 只是**镜像**（`managementreceipt` version 2），权威仍是 ledger；旧 version 1 回执逐字节兼容。
- `releaseLog(gameId)` 是只读旁路，按 rowid 升序返回冻结数组。

### 14.2 改动清单

`server/distributionledger.js`（DDL + `releaseVersionOf` + `payloadBytes` 返回 `{bytes,envelope}` + `enqueueInTxn`/`confirmInTxn` 写日志 + `operationStatus.releaseDigest` + `releaseLog`）、`server/management.js`（回执带 digest）、`server/managementreceipt.js`（v1/v2 双版本逐版本重序列化校验）、`server/deletionfence.js`（v1/v2 回执都接受，仍校验 `result_json` 逐字节一致）、`server/public/publish.txt`（`distributionStatus` 加 `releaseDigest` 校验）、`server/distributiondeclarations.js`（layout/keys/additions/fk/indexList/indexInfo）、`server/deletioninventory.js`、`server/gamepurge.js`（purge 一并删日志行）。

### 14.3 计数门新基线

表 **53 → 54**、索引 **51 → 52**、列 **356 → 361**、唯一键/索引投影 **49 → 50**、FK 仍 **4**。
同步点：`tools/fixtures/distribution-schema.mjs`、`tools/fixtures/publication-browser-authority.mjs`、`tools/verify_{distribution_schema,editor_schema_sources,frozen_publication_root,publish_operations_root,vps_editor_server}.mjs`。

### 14.4 归档证据门故意不回改

`tools/verify_editor_backend_{bound_sql_freeze,declared_fk_rows,declared_unique_rows,deletion_definitions,index_projections,name_bindings,sql_check_rows,management}.mjs` 是**归档证据门**：需要 `process.argv[2]` 轮次号 + `before.json` 里的源码哈希快照，其 fixture-worker 是当初冻结的副本。把里面的 53 改成 54 只会让文件与自己的快照自相矛盾，所以保持原样；现行 schema 由上面 14.3 的活门（54/52/361）与新 lane `tools/verify_release_log.mjs` 负责。

### 14.5 验证（本次实跑）

新 lane `verify_release_log` **11 组绿**；`verify_distribution_ledger` 31、`verify_distribution_schema`（workerd 54/52/361）、`verify_distribution_schema_rows` 18、`verify_publication_producer` 25、`verify_publish_sync` 11、`verify_frozen_publication_root` 46、`verify_publish_operations_root` 31、`verify_vps_editor_server` 12、`verify_publication_server` 18、`verify_publication_main` 93、`verify_publication_catalog` 35、`verify_deletion_catalog_scan` 22、`verify_directory_pointer` 22、`verify_publication_chain_browser` 10（真浏览器）、`verify_editor_workbench_browser` 219、`verify_publication_ui_browser` 7、`verify_review_ui_browser` 6、`verify_editor_shell` 92、`verify_publish_ui_model` 9 通过／7 失败（7 条与改动前基线同名同数）、`verify_distribution_{drainer 35,outbox 10,receipts 23,receipts_workerd 23,restore 5,resources 45,resources_workerd 45,publisher 37,publisher_workerd 37,ledger_backup_restore 7,ledger_cleanup_races 6,ledger_retirement 18,ledger_workerd 30}`、`verify_deletion_{scan_retirement 5,retirement_prototype 7,completion_readiness 5}`、`verify_publish_atomicity` 15、`verify_frozen_player_surface` 13、`verify_vps_frozen_service` 14。

既有失败（用 `git worktree add /tmp/wt-head HEAD` 在 HEAD 上复现，与本批无关）：`verify_first_online`、`verify_reader_distribution`、`verify_deletion_distribution`(+`_workerd`)、`verify_publish_ui_model` 的 7 条。

### 14.6 仍未做

- 生产库尚未建这张表：本次**未部署**（需用户授权）。首次部署会在既有库上 `CREATE TABLE IF NOT EXISTS`，纯 additive。
- 日志不会回填历史（只有部署后的第一次发布才有行）；`releaseDigest` 在管理回执里的语义只是「这次发布的账本摘要」，不改可见性与审核流程。
- drainer 退役与 7 张表退场仍未做（本轮明确不做）。

### 14.7 读侧：管理员「发布历史」面板（第 2 档，additive）

`releaseLog(gameId)` 此前零调用方，所以日志只有运维登服务器查库时才看得到。现在有一条只读路由与一个界面入口：

- `GET /api/admin/games/<id>/releases`（`server/editorapp.js#getReleaseHistory`），顺序为 **admin 门 → 内建 403 `BUILTIN_PROTECTED` → 查询串 422 `RELEASE_HISTORY_QUERY` → 200 `{gameId, releases}`**。
  与既有 `GET /api/games/<id>/releases`（`content_releases` 内容修订清单，作者可见，且 `pruneExceptInTxn` 只留当前一版）**是两件事**。
- 客户端在 `server/public/review.txt`（上架审核模块，admin 专属）里：`history(gameId)` 动作 + 严格校验（键集合精确、`1.n`、digest 64 hex、`pending` 必 `publishedAt: null`、`confirmed` 必带时间、同版本不重复），
  `ReviewPanel.vue` 行内展开「版本／上架时间／分发状态／摘要」。摘要只显示前 8 位，整串只在 `title`。
- **点击才加载**（不进 `client.txt` 的 `autoLoad`），因为发布历史是逐游戏的可选查询，不是页面基线；同时只展开一列。
- 空态是常态：日志不回溯回填，A 路线之前上架的版本永远没有行。**不是故障**。
- 验证：`tools/verify_release_history.mjs` 7 组（真 editor application 代码 + 真 ledger 写行）、`verify_review_ui_model` 11/11、`verify_review_ui_browser` 7/7（新增第 7 条）。
- schema 不变：仍 54 表／52 索引／361 列／50 索引投影／4 FK。

## 15. 部署配方（现行：服务器侧浅取 + 26 文件校验 + 镜像替换）

### 15.1 为什么不再从本机传 tgz

2026-11-05 实测：本机到 `dartnode`（IPv6）与 `dartnode4`（IPv4）的上行都已崩溃——5 MB 探针 **316 s（≈16 KB/s）**，
168 MB 的 `git archive` 包 3 分钟内只走 540 KB 就断连；而同一时刻**服务器到 GitHub 是通的且快**
（`curl https://github.com` 0.38 s、`git ls-remote ... main` 命中目标提交）。所以包的来源改成 GitHub：

```bash
# 服务器上（/srv/dragon-editor/publication）
rm -rf ui7-src app-new14 && mkdir ui7-src && cd ui7-src
git init -q && git remote add origin https://github.com/tianyi092-jcza/dragon.git
git fetch --depth 1 origin main            # 先 git ls-remote 确认 = 本机 HEAD
git rev-parse FETCH_HEAD                   # 必须等于本地 `git rev-parse HEAD`
mkdir -p ../app-new14
git archive FETCH_HEAD server vps reader tools web VERSION .gitattributes | tar -x -C ../app-new14
```

- 上下文：`vps/Dockerfile.publication` 只 COPY `server/ vps/ reader/ web/` 与四个 `tools/*.mjs`，`web/` 必须在包里
  （启动的静态程序归档要读它），所以路径清单不能省。
- 白拿一个好处：GitHub blob 是 LF，和自己 `git archive` 的字节一致，天然绕开「工作树 CRLF → 服务器 LF」的 digest 假差。

### 15.2 完整性校验（不要靠「看起来对」）

上机前在本地对**本次变更文件**算清单，服务器侧逐条校验：

```bash
# 本地
{ git diff --name-only <上一个已部署提交>..HEAD | grep -E '^(server|vps|reader|tools|web)/'; echo VERSION; echo .gitattributes; } \
  | sort -u > /tmp/files
while read -r f; do echo "$(git show "HEAD:$f" | sha256sum | cut -d' ' -f1)  $f"; done < /tmp/files > /tmp/sums
# 服务器
cd app-new14 && sha256sum -c /tmp/sums
```

用 `git show`（而不是读工作树文件）算哈希，否则 CRLF 会让每个文件都对不上。2026-11-05 那一批 26/26 OK。

### 15.3 替换与回滚

```bash
docker build -f app-new14/vps/Dockerfile.publication -t dragon-editor-publication:<tag> app-new14
./backup-publication.sh                       # 停止容器→备份 publication-data/.env/compose→独立容器 integrity_check→trap 拉起
ts=$(date -u +%Y%m%dT%H%M%SZ); mv app "app-prev-<ts>"; mv app-new14 app
sed -i 's/^EDITOR_DEPLOYMENT_ID=.*/EDITOR_DEPLOYMENT_ID=<tag>/' .env
docker compose up -d --force-recreate
```

- **不要**在这里改 `publication.env` 的三处静态 pin：只有当 `web/`／`reader/` 变了、静态发布 digest 才需要换；
  判断方法是 `git diff --stat <上次部署提交>..HEAD -- web reader` 为空即不动。
- **首启健康要等**：核对静态程序 1440 个物件，2026-11-05 实测第一个 200 在 405 s、healthy 在 420 s；期间 `http=000` 正常。
- 回滚两级：`EDITOR_SYNC_PUBLISH=0` + recreate 回旧发布协议（无 schema 回滚，additive 新表可留）；
  整镜像回滚用 `app-prev-<ts>` + `.env` 改回旧 tag。

### 15.4 上线后最小只读核对（每次照做）

1. `/`、`/api/health` 200，且 health body 的 `initialized:true`。
2. `/shell-ui.js`、`/shell-ui.css`、各自定义模块的字节数**与 `git show HEAD:<path>` 相等**（不是与工作树相等）。
3. 复制生产库快照到 `/tmp`，用容器内 `node:sqlite` 只读打开：`55 表／53 索引／369 列／4 FK` + `integrity_check ok`（现行基线，含 `content_game_validations`；2026-11-09 前是 54/52/361/4）
   （`pragma_table_xinfo(?)`／`pragma_foreign_key_list(?)` 要传参数，双引号会被当标识符报错）。
4. 账本 `tail_generation` / `confirmed_generation` / `blocked_reason` 未被动过。
5. 玩家端 `/play-api/v1/registry` 的 generation 与 `static-release.json` 的 `sourceTreeDigest`（＝`publication.env` 的 `STATIC_SOURCE_SHA256`）不变。
6. 容器日志除 `started` / `distribution-idle` 外无 `error|failed|unreachable`。

**玩家端字节变化时的配套（2026-11-05 实锤，见 checkpoint-journal §4.42）**：

- 玩家站 `/static-release.json` 的 digest 必须等于 `publication.env` 的 `STATIC_RELEASE_SHA256`：编辑器启动时把该 digest 的完整程序归档＋登记进 R2（`artifacts/programs/<digest>/`、`control/programs/<digest>.json`）。玩家端一改动，先按 §15.1–15.3 把编辑器 pin／nginx／镜像一起换到新 digest，否则 `?formalGame=` 入口与 `/program-assets/<新digest>/…` 一律 503，连内置游戏都开不了。
- **pin 与镜像必须同源**：`vps/publication-main.mjs` 在监听前用 `verifyInstalledProgram` 比对镜像内 `web/` ＋ `server/public/trialweb.txt` 与 `STATIC_SOURCE_SHA256`。只改 pin 不重建镜像＝pin drift，容器会以 `{"event":"startup-failed"}` 立即崩溃重启（本次实测踩到，回滚 pin 后 11 分钟恢复）。换 pin 前可先在镜像里验证：`docker run --rm --entrypoint node <image> -e "const m = await import('/app/vps/installed-program.mjs'); ..."`。
- **登记可能被跳过**：归档阶段的传输错误被判成 `unreachable`（B8 决定「R2 不是开机条件」），服务照常起但 `control/programs/<digest>.json` 缺失 → 玩家侧 503。判据：容器内用 `r2client` 列 `control/programs/<digest>`（空＝未登记）。修法是**再重启一次**容器让它幂等重跑归档＋登记（第二次约 11 分钟）。
- `/program-assets/<digest>/<path>`：503 ＝ 登记缺失/无效，404 ＝ 文件缺失。带查询串只允许 `?v=original-sprites-1` 且仅限四张 `grf/battle_terrain_{0,1,2}.png`／`grf/battle_units.png`，其余一律 404 —— 所以不要用 `?cb=…` 做缓存穿透验证（会给假 404）。
- nginx 跑在 `nginx` 容器里：改完 conf 要 `docker exec nginx nginx -t` ＋ `docker exec nginx nginx -s reload`；宿主机 `nginx -s reload` 会报 `invalid PID number`。用正则复制既有 `location ^~ /deployment-assets/static-v1/<digest>/` 块时，必须**按花括号深度**找块尾：块内有嵌套 `types { }`，非贪婪匹配会停在嵌套的 `}`，把新块插进旧块内部，`nginx -t` 报 outside location。


### 15.5 2026-11-05 上线记录（v0.1.11）

| 项 | 值 |
| --- | --- |
| 提交 | `62b1329`（v0.1.11 发布 + 记忆补记） |
| 镜像（当前生产） | `dragon-editor-publication:20261105-bc1-ui7c`（`sha256:211882f3…`）；同一提交先上过 `ui7`（`sha256:f73a5a9c…`），三者 RootFS 层摘要逐层相同 |
| 回滚点 | 目录 `app-prev15-20261105T131520Z`（前一份 `app-prev14-20261105T125158Z`）；数据 `/root/dragon-editor-backups/publication-20261105T131446Z`（前一份 `…T125131Z`） |
| 取源与校验 | 服务器侧浅取 → `FETCH_HEAD=62b1329`；`app-new*` 解包后 **26/26 sha256 OK**；镜像内运行期文件 **11/11 OK** |
| 静态发布 | **未变**（`web/`／`reader/` 自 `b8d62b0` 零改动；digest 仍 `b93d19…`，玩家端 223449 字节／1440 文件／`260cc9…`） |
| 首启健康 | 两次分别 405 s／435 s 首个 200，healthy 紧随；日志 `started`+`distribution-idle`，0 错误 |
| schema | 54 表／52 索引／361 列／4 FK；`game_releases` 首启建表、0 行；`integrity_check ok`；账本 `3/3/null` 未动 |
| 新路由 | `GET /api/admin/games/<id>/releases` 匿名 401 `LOGIN_REQUIRED`；POST 该路径 415 |

**仍未验证**：生产上没有真实上架过一次 → 「真 R2／代理链下 20 章上架端到端耗时」与「上架后立刻对玩家可见」仍只有本地证据（§11.5 前置①），
发布历史面板也还没见过真实行。

### 15.6 手动静态发布（用户决定：关闭 CF push 自动构建，2026-11-06）

**为什么关**：`dragon.720108.xyz` 是 Worker `dragon` + Static Assets，由 Cloudflare **Workers Builds 的 Git 集成**在 push 后自动构建部署。
仓库里没有 `.github/workflows`，所以自动构建不是 GitHub Actions，改仓库文件关不掉。风险已在 2026-11-06 实测暴露：
自动构建会把新 `web/` 立刻推上玩家端，而 VPS 的 `publication.env` 三处 pin 不跟随 →
下一次容器重启就 `startup-failed`（本次因此不可用约 28 分钟）。改成手动后，两侧由同一份产物一起推进，pin drift 从根上消失。

**关闭位置（只能在 Cloudflare 侧操作）**：Dashboard → Workers & Pages → `dragon` → Settings → Build → 断开 Git 集成／关闭自动部署。
本机 wrangler 是 OAuth 登录，`GET /accounts/<acct>/builds/workers` 实测返回 `code 10000 Authentication error`，
CLI 也没有 `builds` 子命令 → 命令行关不掉；要么面板点，要么提供带 Workers Builds 权限的 API Token。

**构建（本机即可，必须在 LF 下）**：

```bash
vps/manual-static-build.sh /path/to/out
# 输出：out/dist/（1442 文件）、out/dist/static-release.json、out/wrangler.deploy.jsonc
# 末行打印的 static-release.json sha256 就是 STATIC_RELEASE_SHA256
```

**`core.autocrlf` 是本步唯一的坑（2026-11-06 实锤）**：`git archive` 在 `autocrlf=true` 时会给**未声明 `eol`** 的文本文件补 CRLF
（本次 45 个文件、+0.43 MiB，`content/builtin/chapters/*.json` 各 +行数字节，例如 `later-1.json` 7693 行 = +7693 字节），
`sourceTreeDigest` **却不变**（它只覆盖 `.gitattributes` 里显式 `eol=lf` 的 `web/src/**.js` 与 `web/intro/styles.css`）——
于是「digest 对上了」但 inventory sha 对不上，改 pin 必炸。脚本里固定用 `git -c core.autocrlf=false archive`；
判据是 `out/dist/static-release.json` 的 sha256 必须与线上 `https://dragon.720108.xyz/static-release.json` 的 sha256 相同（同 digest 时）。

**部署（两侧同一份产物，顺序不要颠倒）**：

```bash
cd /path/to/out
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
  npx wrangler deploy -c wrangler.deploy.jsonc     # 只上传 Worker + assets，不再跑 build.command
```

1. 先 deploy 到 Cloudflare，核对 `static-release.json` 的 sha256／`sourceTreeDigest` 与构建输出一致。
2. 把 `out/dist/` 放到 VPS `/home/web/html/dragon-editor-bootstrap/<inventory-sha>/`，按 §15.4 的「花括号深度」补 nginx location 并 reload。
3. **最后**才改 `publication.env` 三处 pin 并换镜像（`app`→`app-prev…`、新目录→`app`、`.env` 换 tag），然后 `docker compose up -d --force-recreate`。
   ⚠️ 不要先改 pin 再换镜像：`backup-publication.sh` 结尾自己会 `docker compose up -d`，那一步会用旧镜像配新 pin → `startup-failed` 重启循环。
4. 首启：R2 无该 digest 时约 23 分钟（先下载 1441 文件核 sha 再上传），已有同 digest 时约 7 分钟。等 healthy 再验收。
5. 验收按 §15.4 六条执行；额外核 `docker logs` 里 error 计数 0。

**仓库里的 `wrangler.jsonc` 不动**：它保留 `build.command` 给「手工 deploy 仓库根」这种场景，
手动发布一律用脚本生成的、去掉 `build` 段的临时配置，避免 wrangler 在我们控制之外的目录重建 dist。

## 16. 方案 B 首次落地（`sadcloud`，2026-11-06；2026-11-09 起再次成为现行生产，见 §18）

> §15 及其 §15.1–15.6 描述的是**历史形态**（dartnode4 ＋ Cloudflare Worker ＋ R2 桶）。2026-11-06 起生产整体搬到自有 VPS，本节为准；旧机器与 R2 桶已下线。

### 16.1 为什么搬

- **玩家端 `Error 1102 Worker exceeded resource limits`**：`npx wrangler tail dragon` 实测 `/play-api/v1/registry` 单次 **cpuTime = 11 ms**，而免费 Workers CPU 上限 10 ms —— 冷启动或稍重的 `/play-api/v1/file`（读并 sha256 校验运行时索引与章节）必被打穿。
- **CF 边缘 100 s 上限**（非 Enterprise 不可调）会静默切断 190–205 s 的上架请求（nginx 记 `499`）。
- 用户决定（原话）：「能不能改成不部署cloudflare，把玩家端部署到我指定的vps上？」→ 选方案 B：彻底去 CF，字节落 VPS 磁盘。

### 16.2 机器与布局

| 项 | 值 |
| --- | --- |
| 主机 | `ssh sadcloud`（sshd **7218**，ufw 已放行 7218/80/443） |
| 规格 | Debian 13 (trixie)／4 核／3921 MB／50G；docker 29.9.3＋compose v5.7.0、node v22.23.0（`/opt/node22`）、nginx 1.26.3＋`libnginx-mod-stream`、certbot |
| 代码 | `/srv/dragon/src`（git clone，部署即 `git fetch && git reset --hard origin/main`） |
| 数据库 | `/srv/dragon/data/editor.sqlite`（`VACUUM INTO` 快照，owner 1000:1000，mode 700/600） |
| 私有字节 | `/srv/dragon/private-objects`（容器内挂 `/data/private-objects`） |
| 游戏字节 | `/srv/dragon/bucket`（磁盘桶，容器内 `/bucket`，`PUBLICATION_BUCKET_ROOT=/bucket`） |
| 静态产物 | `/srv/dragon/dist`（1442 档，挂玩家容器 `/app/dist:ro`） |
| 编排 | `/srv/dragon/docker-compose.yml`；`publication.env`／`editor.env`／`player.env`／`r2.env`（已无用）／`.env`（`*_DEPLOYMENT_ID`） |
| 容器 | `dragon-editor-1`（`127.0.0.1:8788`）、`dragon-player-1`（`127.0.0.1:8789`） |

**443 端口分流**：本机原有 x-ui/xray 的 `reality-443` 入站已改为 `127.0.0.1:11443`（DB 备份 `/root/x-ui.db.bak-*`）。nginx `stream` 用 `ssl_preread` 按 SNI 分流：两个 dragon 域名 → `127.0.0.1:8443`，`default` → `11443`。实测 SNI `www.tesla.com` 仍返回 TESLA 证书，**VPN 不受影响**。

### 16.3 磁盘桶契约（不能改，改了收据就废）

`vps/disk-bucket.mjs` 与 `vps/r2client.mjs` 逐方法同形，发布器／指针 CAS／收据／回收器不用改：

- `get(key,{maxBytes}) → { bytes, headers:{ etag, 'content-type', 'last-modified' } } | null`
- `putImmutable(key,bytes,type) → { sha256, byteLength } | null`、`putControl(key,bytes,ifMatch) → boolean`、`list(prefix,maxKeys) → string[]`、`remove(key) → 204|404`
- **`etag` 必须是 R2 形状 `"<md5>"`、`last-modified` 必须等于文件 mtime（`toUTCString()`）**：`vps/distribution-publisher.mjs` 的 `headers()` 会把两者写进收据（`rootETag`／`visibleAt`），形状不符即判 `REMOTE_GAP` 封锁账本。从 R2 迁移时保留 Last-Modified 就是为了这一点。
- content-type 只允许 `application/json`／`application/octet-stream`，落盘在 `.meta/<key>`（`list` 跳过点开头目录）；缺 meta 时按 `.json → application/json`、其余 `octet-stream` 回退。
- 迁移与回填：`vps/migrate-r2-to-disk.mjs`（可续传、逐条进度、用 `MAX_RESOURCE_BYTES` 作下载预算）、`vps/backfill-bucket-types.mjs`。

### 16.4 部署配方

```bash
# 1) 服务器取源（服务器到 GitHub 快，本机上行差；务必核对 HEAD）
ssh sadcloud 'cd /srv/dragon/src && git fetch -q origin main && git reset -q --hard origin/main && git rev-parse --short HEAD'
# 2) 重建镜像（编辑器／玩家各自独立，改哪个建哪个）
ssh sadcloud 'cd /srv/dragon && docker build -f src/vps/Dockerfile.publication -t dragon-editor-publication:<tag> src'
ssh sadcloud 'cd /srv/dragon && docker build -f src/vps/Dockerfile.player -t dragon-player:<tag> src'
# 3) 改 .env 的 EDITOR_DEPLOYMENT_ID／PLAYER_DEPLOYMENT_ID，然后 recreate
ssh sadcloud 'cd /srv/dragon && docker compose up -d --force-recreate editor player'
```

- **镜像内先验 pin**（与 §15 同理）：`docker run --rm --entrypoint node <image> --input-type=module -e "…verifyInstalledProgram({webRoot:'/app/web/',bundlePath:'/app/server/public/trialweb.txt',expectedSourceTreeDigest:'93faf8d9…'})"` 必须 `VERIFY_OK`。
- `web/`／`reader/` 没变时**不动 `publication.env` 三处 pin**；变了才重建 dist、`certbot` 不动、nginx `alias` 路径随 digest 改（`location ^~ /deployment-assets/static-v1/<digest>/`）。
- 玩家镜像只带 `reader/`＋`web/src/player/`＋`vps/{player-server,disk-bucket}.mjs`，`dist/` 由 compose 挂载 —— 换静态发布不必重建镜像。

### 16.5 上线后核对（每次照做）

```bash
curl -s https://dragon-editor.720108.xyz/api/health        # 200 + initialized:true
curl -s https://dragon-editor.720108.xyz/shell-ui.js | wc -c # 与 git show HEAD:server/public/shell-ui.txt 字节数相等
curl -s https://dragon.720108.xyz/play-api/v1/registry      # generation／directory 符合预期
curl -s -o /dev/null -w '%{http_code}' "https://dragon.720108.xyz/?formalGame=<gameId>&mode=new"   # 200
curl -s -o /dev/null -w '%{http_code}' "https://dragon.720108.xyz/program-assets/<digest>/grf/battle_units.png"  # 200 image/png
ssh sadcloud 'docker ps --format "{{.Names}} {{.Status}}"'
```

schema 复核（只读快照）：`cp /srv/dragon/data/editor.sqlite* /tmp/q/` 后用 `docker run --rm -v /tmp/q:/q node:22-bookworm-slim node /q/x.cjs`（`node:sqlite` readOnly），期望 **55 表／53 索引／369 列／4 FK**（现行基线，见 §14.3 与 journal §2）、`integrity_check ok`、账本 `tail_generation == confirmed_generation` 且 `blocked_reason` 为 null。

### 16.6 已下线（2026-11-06，不可再引用）

- **Cloudflare**：两个域名的 A 记录内容为 `82.158.91.231`（源站），但曾长期保持橙云（对外答 `104.21.88.121`／`172.67.178.181`）。**A 记录填源站 IP ≠ 直连**——云朵开关决定对外发布谁；切灰云（DNS only）后 CF 的 100 s 边缘上限与 Worker CPU 限制才真正消失。TLS 由本机 nginx 的 Let's Encrypt 证书提供（`CN=dragon.720108.xyz`，SAN 覆盖两个域名）。
- **R2 桶 `dragon`**：迁移后先核「磁盘 13606 键 == R2 13606 键、缺失 0／多余 0、抽样 25 个 sha256 全等」，再逐条删对象、最后 `wrangler r2 bucket delete dragon`（S3 令牌只有对象权限，删桶报 `AccessDenied`，要用 OAuth 的 wrangler）。剩余桶 `agentic-inbox`／`img-box`／`sanguo-gtiles` 与本项目无关。
- **旧机 `dartnode4`**：容器与 `dragon-editor-publication:*` 镜像已移除，`dragon-editor.720108.xyz` 的 vhost 移到 `/home/web/conf.d-disabled/`；`nginx` 容器**保留**（同时服务 `kpanle.720108.xyz`／`v2ray-dartnode.720108.xyz`）。保留回滚数据 `/srv/dragon-editor/publication/publication-data`（157 MB）与 `/root/dragon-editor-backups`（8.0 GB）。

## 17. 方案 B 第二次搬迁：instabox sandbox（2026-11-07 ~ 2026-11-09，已被 §18 取代）

用户决定：「当前的VPS不再使用。资源配置太低」→ 迁到 instabox sandbox（Firecracker VM，4 vCPU / 8 GiB / 16 GiB root + 20 GiB `/data`，Debian 13），对外走 **Cloudflare Tunnel**。

### 17.1 拓扑

| 入口 | 链路 |
| --- | --- |
| `https://dragon-editor.720108.xyz` | CF Tunnel → `127.0.0.1:18990`（host-rewriting proxy）→ `8788`（editor 容器） |
| `https://dragon.720108.xyz` | CF Tunnel → `127.0.0.1:8789`（player 容器，**不需要 proxy**） |

DNS 两条 CNAME → `f5d35af4-bbb8-4abe-9ec4-cbc9ead29866.cfargotunnel.com`（proxied=true）。CF 只做 TLS 反代（响应头 `server: cloudflare`、`cf-cache-status: DYNAMIC`），**不跑 Workers**，所以 2026-11-06 的 Error 1102（免费 Worker CPU 10ms 上限，实测 `/play-api/v1/registry` 单次 cpuTime 11ms）不会再出现。

### 17.2 三个必踩的坑（都实测过）

1. **数据目录必须 `700` 且属主 = 容器 uid**：`vps/publication-main.mjs` 的 `privateOwned()` 要求 `mode & 0o077 === 0`，tar 解包后目录是 755 → 启动即 `private owner permissions required` → `startup-failed` 重启循环。修法 `chmod 700 <dataRoot>`。
2. **编辑器要求 `Host` 逐字等于配置 origin 的 host**（`vps/editor-server.mjs:88`），而 instabox 的公网代理把 `Host` 改写成 `127.0.0.1:<port>`、真名放 `x-forwarded-host`；Cloudflare Tunnel 则保留原 Host。所以 18990 上有一个 40 行反代（`/data/dragon/proxy.mjs`，已入库 `vps/instabox/`）：还原 Host + 顺带把 `deployment-assets/static-v1/<digest>/` 从本机 `dist` 供应（编辑器开机的静态归档要读它，content-type 必须与 `vps/static-client.mjs` 白名单逐字相符，含 flac/wav/mid）。玩家端不需要反代：`vps/player-server.mjs` 用 `PLAYER_ORIGIN` 重建请求 URL，与 Host 无关。
3. **旧隧道的 CNAME 会让域名回 530**：DNS 原本指向已删除的隧道 `fa6929ee-…`，`cloudflared tunnel route dns --overwrite-dns` 不会改写既有 CNAME（它报「already configured」）；要用 API `PATCH /zones/<zone>/dns_records/<id>` 把 content 换成新隧道。

### 17.3 布局与运维

```text
/data/dragon/{data(700),private-objects(700),bucket(700),dist,env,cloudflared,logs}
/data/dragon/{docker-compose.yml,proxy.mjs,start.sh,README.md}
systemd: dragon-editor-proxy.service（proxy.mjs）、dragon-tunnel.service（cloudflared）
```

- 迁移校验：桶 13606 对象（含 `.meta` 共 27212 档）键集合 `find | LC_ALL=C sort | md5sum` 两边同为 `381524459c4d853f5b86394fe2e2f4b2`；`dist` 1442、`private-objects` 569、`editor.sqlite` 3.4 MB；镜像 `docker save | gzip | ssh docker load` 字节一致。
- **sandbox stop 后所有进程与隧道连接消失**；start 后跑 `/data/dragon/start.sh`（compose up + 重启 proxy/tunnel）。
- 换域名只需改 `env/publication.env` 的 `EDITOR_ORIGIN`/`STATIC_ORIGIN`、`env/player.env` 的 `PLAYER_ORIGIN`、`env/proxy.env` 的 `PROXY_PUBLIC_HOST`，代码零改动。
- **部署产物已入库 `vps/instabox/`**（`proxy.mjs`、`docker-compose.yml`、`start.sh`、`README.md`）：机器上 `/data/dragon/` 的这四份以仓库为源；`env/`（含账号与隧道凭据）不入库。改完 `scp` 到机器对应路径并 `./start.sh`。

### 17.4 旧机 sadcloud 已下线（2026-11-07）

`/srv/dragon` 上 `docker compose down`（容器与网络已移除，镜像与 `/srv/dragon` 2.9 GB 保留作回滚）；`/etc/nginx/sites-enabled/dragon-{editor,player}.conf` 两个站点软链已删并 reload（80/8443 不再服务本项目）。**同机的 x-ui/xray 未动**（443 SNI 分流与 `127.0.0.1:11443` 的 reality inbound 照常运行）。回滚 = 恢复软链 + `docker compose up -d` + 把 DNS 指回该机。

> 2026-11-09 UTC 本条已被 §18 推翻：生产迁回 `sadcloud`，instabox 退役。

## 18. 迁回 `sadcloud`（2026-11-09 UTC 起，现行生产）

用户决定（原话）：「以后就82.158.91.231部署了，不换了，instbox太不稳定了」。sadcloud 上 §16 的基础设施原样保留（`/srv/dragon/src|data|private-objects|bucket|dist`、nginx 443 SNI 分流、Let's Encrypt 证书 SAN 覆盖两域名、`certbot.timer`），本轮只做「取源 → 锁步重建静态发布 → 换镜像 → 迁数据 → 起容器」。

### 18.1 现行镜像与摘要

| 项 | 值 |
| --- | --- |
| 编辑器镜像 | `dragon-editor-publication:20261111-city1`（HEAD `c789d4e`＋迁移命令修订，sha `3a2acaf0…`；含批次 F–G：共享據點投影、70 異名迁移） |
| 玩家镜像 | `dragon-player:20261109-b6-disk` |
| static release | 清单 sha256 `80c9e96b26c363149315aa2255b16b2f8a9b5f3457dc00d0bdad3a2b8ca89362` |
| sourceTree | `50c4fc95c4ebdedd85b274f1a0c1132f2ba8d190dea4dda059c62ca827f12e4f` |
| 入口 | `https://dragon-editor.720108.xyz` → nginx 443（`ssl_preread` 按 SNI → `127.0.0.1:8443`）→ `127.0.0.1:8788`；`https://dragon.720108.xyz` → `8789` |
| DNS | 两条 A 记录 `82.158.91.231`，**灰云（DNS only）**，TLS 由本机 nginx 终止 |

### 18.2 必做的四步（少一步就起不来）

1. **`sites-enabled` 软链**：`sites-available/dragon-{editor,player}.conf` 必须在 `sites-enabled/` 有软链，否则 80/8443 根本没人听，443 的 SNI 分流全指到死端口（外部表现为 TLS 握手被 reset / CF 报 525）。`nginx -t && systemctl reload nginx`。
2. **静态发布锁步**：`sh src/vps/manual-static-build.sh /srv/dragon/build/static-<tag>` → `rsync -a --delete <out>/dist/ /srv/dragon/dist/`；把清单 sha256 与 `sourceTreeDigest` 写进 `publication.env` 的 `STATIC_RELEASE_SHA256`／`STATIC_SOURCE_SHA256`／`STATIC_PATH_PREFIX=deployment-assets/static-v1/<digest>/`，同时把 nginx `dragon-editor.conf` 里 `location ^~ /deployment-assets/static-v1/<digest>/` 的 digest 换成同一个值。**不换 nginx 那段，编辑器启动会读不到自己的静态归档。**
3. **数据属主/权限**：从别处 tar 过来的文件是 root，容器要求 `privateOwned()`；`chown -R 1000:1000 /srv/dragon/data /srv/dragon/private-objects && chmod 700` 两个目录、`data/editor.sqlite*` 置 600，否则 `private owner permissions required` → `startup-failed` 重启循环。
4. **compose 变量**：`docker-compose.yml` 用 `${EDITOR_DEPLOYMENT_ID}`／`${PLAYER_DEPLOYMENT_ID}`，即使只起 editor 也要两个都给：`EDITOR_DEPLOYMENT_ID=<tag> PLAYER_DEPLOYMENT_ID=<tag> docker compose up -d editor`（`editor.env`／`player.env` 里的同名行只是记录，不被 compose 插值）。
5. **磁盘桶属主**：`/srv/dragon/bucket` 必须是 `1000:1000`。从 tar 中转到 VPS 的目录节点会保留客户端 uid（本机是 `197609`），旧 digest 的 `control/programs/<digest>.json` 已存在时启动只读不报错；一换新 digest，`registerStaticProgram` 要写 `control/programs/<digest>.json` 与 `artifacts/programs/<digest>/` 就直接 `PROGRAM_REGISTRATION_UNAVAILABLE` → `startup-failed` 重启循环（2026-11-11 实测）。`chown -R 1000:1000 /srv/dragon/bucket` 即解。

### 18.3 从 instabox 迁数据（一次性，迁完即退役）

instabox 沙箱限制：无 `rsync`、出站 `ssh` 报 `hostname contains invalid characters`、入站长连接会被 cooling 掐断，且冷却时间戳长时间不刷新。可行路径是**经本机中转的 tar over ssh**：

```sh
ssh -p 2222 <instabox> 'tar -C /data/dragon -cf - data private-objects' | tar -C /tmp/ibsync -xf -
tar -C /tmp/ibsync -cf - data private-objects | ssh sadcloud 'tar -C /srv/dragon -xf -'
ssh -p 2222 <instabox> 'cd /data/dragon/bucket && tar -cf - control projections receipts roots artifacts/<gameId>' \
  | ssh sadcloud 'tar -C /srv/dragon/bucket -xf -'
```

- 账本与桶必须成对搬：只搬 `control/` 不搬 `artifacts/<gameId>/`，玩家端会拿不到 runtime 索引。
- `artifacts/programs/<digest>/` 每个 171 MB；只有「完整副本／共享程序包」才用，按需补。
- 核对：`data/editor.sqlite` 的 `content_distribution_state.tail_generation == confirmed_generation`、`content_games` 行、`published_games.pin_json.ordinal`；玩家端 `registry` 的 `generation` 必须与 `control/current.json` 一致。
- 迁移前先 `docker compose stop editor`，避免覆盖正在写的 SQLite。

### 18.4 退役 instabox

镜像与 `/data/dragon` 保留作回滚；DNS 已指向 `82.158.91.231`；`cloudflared` 隧道（`f5d35af4-…`）与 `vps/instabox/` 下的 proxy／compose／start.sh 只作历史参考，不再部署。

