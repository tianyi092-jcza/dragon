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
