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
