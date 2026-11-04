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
| 删除后的 R2 回收 | 新增 `vps/game-reclaimer.mjs`：①读 `control/directory.json` → 按 `sha256(JSON.stringify(directoryPointerBody(pointer))) === pointer.digest` 复核 → 过滤掉该 gameId 一条 → 用**读到的 etag** 做 CAS 写回 → 回读逐字节确认；②按 `artifacts/<gameId>/` 前缀 list+remove，直到前缀为空 | 游戏级数据物理独立，所以删除只涉及这两件事。**不推进代次**：这是已提交目录的修补，不是新发布；条目移除与保留墓碑对读者等价（都是 410 `GAME_DELETED`），所以玩家可见语义一个字都没变 |
| 不碰的东西 | `artifacts/programs/<programDigest>/`（共享程序包）、`kao/<id>.png`（621 共享画像）、`control/receipts|roots/…`（冻结证明链）一律不动；不做引用计数、不做退役账本 | §8 已确认的决定 |
| 路由接线 | `server/editorapp.js#postPurge` 变成 async：库行 purge（单交易）→ registry revision bump → 调用注入的 `purgeReclaimer`；回执新增 `reclamation: { state: 'completed', pointer, objects }`；**未注入端口时**报 `{ state: 'pending', code: 'RECLAIMER_UNCONFIGURED' }`，失败时报具体 code——没写 completed 就是没做完 | 库行 purge 是交易，R2 回收在交易之后：失败只降级，不推翻已提交的删除事实，也不假装清理成功 |
| 端口装配 | `vps/publication-server.mjs` 只在 `r2.list`/`r2.remove` 都存在时才装配回收器（生产 `r2client` 都有）；`vps/editor-server.mjs`、`createEditorApplication` 增加可选 `purgeReclaimer` 并做启动期类型校验 | 可选注入 = 未装配时如实降级，不是「默认假装有 R2 删除能力」 |
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
