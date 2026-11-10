# 草稿读取／保存性能与副本数据设计（待下轮处理）

> 状态：已定位、未交付。`server/drafts.js` 当前等于线上实现（本轮性能改动已整份回退）。
> 关联：journal §13；契约测试 `tools/verify_vps_draft_save.mjs`（179 checks）。

## 1. 实测（Windows 本机，gameId `be782c87…`，20 章 × 192 据点，canonical 源约 45.5 MB / 44 chunks）

| 阶段 | 冷读 | 热读 | 无改动保存 | 编辑保存 |
|---|---|---|---|---|
| `#load` 解源＋`verifyStored` | 3.4 s | 0.4 s | 0.5 s | 0.5 s |
| `#profile` 载入 pinned baseline＋`capture()` | 8.1 s | ~0 | ~0 | ~0 |
| `#editHistory`（SQLite） | 0.02 s | 0.02 s | 0.02 s | 0.02 s |
| `#verifyHistory` 深比较 | 6.2 s | 6.3 s | 6.0 s（base）＋5.6 s（候选） | 8.5 s（候选） |
| DTO 组装（20.1 MiB 响应） | 1.3 s | 1.1 s | — | — |
| `JSON.stringify` 响应 | 0.14 s | 0.14 s | — | — |
| `encodeSourceChunks` | — | — | 0（源未变） | 9.3 s |
| 逐块 `putImmutable` | — | — | 0 | 27 s（45 MB / 44 块） |
| `prepareSnapshot` | — | — | 2.6 s | 2.6 s |
| **合计** | **≈21 s** | **≈8.4 s** | **≈17 s** | **≈59 s** |

用户现场感受：加载 34 s、保存 55 s（生产机更慢）。

## 2. 瓶颈判断

1. **读**：每次都重解整份 canonical JSON＋整份深比较，再组一份 20 MiB 全量 DTO（20 章 × 192 城）。
2. **写**：改一座据点也要重编码整份游戏（9 s）并把 44 块全部重写（27 s）。
3. `#profile` 冷启 8 s：pinned baseline 解源＋`capture()` 冻结整棵图。

## 3. 已原型验证的两条优化（未交付）

- **未变区块复用**：`#write` 以新编码各块的 sha256 命中上一版索引时直接沿用 chunk 描述，不重复落盘 → 落盘 27 s → 0.55 s。
- **已验证读取缓存**：键 `gameId+revision+sourceDigest`（源内容寻址，验证结论只依赖字节），加「保存后把刚验过的候选 proof 种进新修订」→ 热读 8.4 s → 2.8 s，无改动保存 17 s → 2.9 s，编辑保存 59 s → 23 s。
- 另删掉了 `#load`/`#profile` 里把整份源解两遍的旧 `#readSource`（单次解析＋`verifyStored`）。

**为什么回退**：`verify_vps_draft_save` 由 179 全绿变 168 绿＋11 红，失败项集中两类：
①「撤销 epoch 后仍能继续」类（缓存命中路径少了逐请求 `#owned` 复核／blob 读）；
②「failed atlas 不改内容、不写块」类（断言 `draftReads`/`draftPuts` 精确计数）。
这些是真实不变量（epoch／撤销、失败不落盘），不能靠改断言掩盖；必须让缓存保持守卫语义，或明确重写这些契约。

## 4. 下一轮要回答的设计问题

1. **副本数据形状**：是否继续用「整份 canonical JSON（44 块）」？
   - 备选 A：按章分片（每章一块）＋索引，允许单章重编码；配合未变块复用，写成本≈一章。
   - 备选 B：在快照之上再存「命名编辑日志」，读时按需重放（读快照＋日志），避免每次整份重编码；代价是读多一次重放（但可缓存）。
   - 备选 C：把「父表 192 座＋每章子表」拆成独立文档，UI 按需取（先只取据點页所需字段），把 20 MiB DTO 拆成 2–3 个小响应。
2. **读接口**：`GET /draft?revision=` 是否改成「按模块/章节分页」，让城池页只拉 `cities` + `cityDefinitions`（预计 <1 MiB）。
3. **守卫与缓存**：缓存键必须含 `auth_epoch`／principal，或命中后仍执行 `#owned`/`#origin`；epoch 变化时清空对应 actor 的缓存。
4. **验证成本**：`profile.verify` 的全图深比较能否改为「按已申报编辑逐根比较」（只比较被写过的章／城／势力根），并把「整份一致」留给发布前的冻结核验。
5. **契约测试改写范围**：11 条红的判据（I/O 计数／epoch 复核）要逐条决定是「换成语义断言」还是「缓存必须保留该行为」。

## 5. 复现方式

- 本地服务：`node tools/dev_editor.mjs --port 8443 --store .dragon-analysis/dev-city --no-watch --no-library`（`https://127.0.0.1:8443/`，`tianyi` / `City-Test-2026!`）。
- 计时：临时在 `read()`/`save()` 加 `Date.now()` 分段并打 `console.error`，用脚本 `POST /api/auth/login`（带 `Origin`）＋`GET /api/games` 取当前 revision＋`GET /api/games/<id>/draft?revision=<n>`／`POST /draft/save`（`If-Match` 用当前 revision）复测。
- 保存命令示例：`{ metadata, resourceEdits: [], chapterEdits: [{ op: 'city-native', chapterId: '<gameId>#upper-1', cityIdx: 0, values: { growth: N } }] }`（值要与现值不同，否则是 no-op）。
