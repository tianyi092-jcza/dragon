# 副本简化铁律 T1–T8 落地任务清单（规范）

> 来源：用户 2026 对话裁决 T1–T8。状态：部分落地，未勾选项仍待独立收尾；条目中的测试数字是当批收据，不代表当前全仓结果。
> 目标：`copy单套 + publish单槽 + formal单快照`；砍历史回放/整包编解码/draft链与试运行；
> 加 30 分钟节流 + 检验–上架状态机 + 必填发布说明；模块存只拦本模块，发布门全量检验。
> UI 长期采用 Element Plus 默认主题、默认组件、默认控件与默认 size，以 `AGENTS.md` §3 及 journal §37（tag: `architecture`）为准；旧布局文档仅保留整页不滚、数据区滚、垂直居中、枚举名称、保存重读等通用目标，固定 34px／原生 table 皮肤已撤销。下文旧阶段的面板／API 描述须与现行代码及 journal 交叉核对，不是另行恢复旧链的授权。

## 0. 术语冻结

* `copy(gameId)`：单套可变草稿，无修订号，按 `gameId` 标识，与修订次数无关。
* `slot(gameId)`：单提交槽，后到覆盖前到，存一次性检验票 + 发布说明 + `submitted_at`。
* `formal(gameId)`：单出版快照，只留最新 + `ordinal` 计数器 + 发布说明，不回滚，不 diff。
* `ticket`：检验通过发的一次性票据，提交即核销。前端防抖 ≠ 后端安全，后端仍以票据 + 鉴权为准。

```text
copy(gameId) ──[检验通过→一次性票]──▶ slot(gameId)单槽 ──[同意]──▶ formal(gameId)+ordinal+1
 单套可变        30分钟节流              后到覆盖前到         只留最新
```

## 1. 后端任务（server/）

### B1 新建 `server/gamecopy.js`（GameCopyStore）
- [x] 建表（`storage.transactionSync` 内 `CREATE TABLE IF NOT EXISTS`）：
  - `game_copies(game_id PK, owner_id, data_json, copy_digest, updated_at)`
  - `publish_slots(game_id PK, ticket, description, validation_digest, state[ready|submitted|approved], submitted_at, validated_at)`
  - `copy_validations(game_id PK, state[passed|failed], copy_digest, problems_json, ticket, checked_at)`
- [x] `#owned(tokenHash,gameId)`：复用 `principal` + `content_games.owner_id` + `assertNotDeleting`，`must_change→403`，`wolong-builtin→403`。
- [x] `readCopy(gameId)`：返回 `{gameId, data, copyDigest, updatedAt}`；无行则 `404 COPY_NOT_FOUND`。
- [x] `writeModule(gameId, module, patch)`：整行覆盖写（新覆盖旧，不做 CAS/版本比对，T1）：
  - `module ∈ {metadata, cities, generals, chapters, map}`，未知 → `422 COPY_MODULE`。
  - 只做本模块校验（T4，见 §3），跨模块不拦。
  - 更新 `copy_digest=sha256(data_json)`，`updated_at=now`，同时作废旧 `copy_validations.ticket`（检验票失效，下次需重验）。
  - 失败不写行、不改 `slot/formal`。
- [x] `validateWhole(gameId)`：整包全量验（T2/D1，低频允许慢）：
  - 读 `copy` 全量 → `validateGameSource` + `chapterReferenceReport` + `compileMapSource` 最小闭包。
  - 通过 → 写 `copy_validations(passed, ticket=randomUUID, copy_digest)` + `publish_slots(ticket, state=ready, validated_at=now)`；失败 → 写 `failed + problems_json`，不发票，不动 `slot.state`。
  - `problems_json ≤262144`，超时 600s，`problems` 为逐章 `[{chapterId, code, detail}]`，供上架页红字列出。
- [x] `submitSlot(gameId, {ticket, description})`：
  - `description` 必填多行 `1..2000` 码点，`trim` 后非空，否则 `422 PUBLISH_DESCRIPTION`。
  - `ticket` 必须等于 `copy_validations.ticket` 且 `copy_digest` 未变，否则 `409 VALIDATION_STALE`（改没改都需重验，T2）。
  - 30 分钟节流：`now - slot.submitted_at < 30min → 429 PUBLISH_TOO_SOON`（T2）。
  - 单槽覆盖：`INSERT OR REPLACE INTO publish_slots`，`state=submitted`，核销 `ticket`（同一票不可用两次，T5）。
- [x] `rejectSlot(gameId, admin)`：`submitted → empty`（仅 admin；票提交时已核销；说明保留备查；作者重验可再交；非 submitted → 409）。（`POST /api/games/:id/copy/reject` 已接线；驳回不写 formal、无需编号；同意已按下列 approveSlot 条目接入 ordinal 链）
- [x] `reviewQueue(admin)`：现为全局持久管理列表，已有提交说明的游戏按gameId保留一行，带申请状态和独立listed状态；通过/驳回保留删除入口，只有submitted能审核，编辑/校验不能解锁。旧「仅submitted成队」已由用户批准的[本批](copy-initialization-tasks.md)取代；接口仍为 `GET /api/admin/copy/submissions`，不按顶部游戏过滤。
- [x] `approveSlot(gameId, admin, installPack)`：`submitted → approved`＋序号配发（CAS `next_ordinal`，失败不耗号）＋release 行＋`pin`（含 `description`，修订号＝ordinal）＋`pruneExceptInTxn`＋正式名（copy metadata）＋包安装回调，同事务原子提交。（用户裁决方案 B；`POST /api/games/:id/copy/approve` 已接线：事务外 compile＋prepare，事务内 `installPreparedInTxn`；`verify_copy_approve_slot` 2 项通过。旧 pin 读 path 兼容数字修订＋新 ordinal，缺 `description` 仅新形报错）
  - 键设计：`pin.revision`＝`content_releases.ordinal`＝批准 ordinal（`1.0→1.1…`）；内容钉死只认 `copy_digest`；`content_releases.draft_revision` 列暂存 ordinal（列名遗留，待旧管线删除时随表清理，有注释）。
  - 原子提交（同一 `transactionSync`，CAS `next_ordinal` 防并发同意双耗号）：槽 `submitted→approved`＋序号配发＋release 行＋`pin`（含 `description`）＋`pruneExceptInTxn`＋正式名（copy metadata）＋包安装回调。
  - 包构建：编排层先在事务外 `compileGameSource(copyData)`＋`playPacks.prepare`（`reference={gameId, draftRevision: ordinal, sourceDigest: copy_digest}`；`#visuals` 需生产 R2，测试环境以注入的安装回调代替）；事务内 `installPreparedInTxn`。无包不写 formal（fail-closed，503 照常抛出）。
  - 校验涟漪（与旧管线共存期只放宽、不收紧）：`published.readPin/writePin`、`playpacks` 取包时、`releases` 新链路的 revision 正则接受 ordinal 形；manifest↔pin精确等值比较保持；旧结论“玩家identity.revision无需改”已撤销：玩家`validateIdentity`另有整数格式门，系统基础地图运行链回放实测会拒copy的`1.n`。现已补旧整数/规范`1.n`双形准入及负控，见[地图合同§7.7](system-base-map-design.md#77-编辑地图至运行加载器的隔离验证)。

### B2 发布正式 `formal` 收敛（复用现行 `published_games + content_releases`，不新增多版本）
- [ ] `formal` 只留最新：`publishInTxn` 后 `pruneExceptInTxn(keepReleaseId)` 已有，继续沿用。（copy 同意链内联等价删除）
- [x] `pin` 扩展 `description`：`published_games.pin_json` 增 `description` 字段。（写 path：`approveSlot` 必写；读 path：新 ordinal 形缺字段 → `500 PUBLISH_CORRUPT`，旧数字形无字段仍可读（`null`，面板显示旧版无说明）——全量 wipe 前不破坏旧发布目录；`verify_copy_pin_shape` 1 项通过。`playpacks` 取包三处修订校验同步放宽为 ordinal 兼容，等值比较不动；旧链测试 `review_backend`／`publication_producer`／`publish_after_retirement` 全绿）
- [ ] 版本：`bumpOrdinal` 不变（`1.0→1.1…`），每次同意 +1，哪怕内容未变。

### B3 检验–上架状态机（服务端唯一真相，T5）
- [x] 状态推导：`未验/失败→禁用`；`passed+ticket未核销→可提交一次`；`已提交→立即禁用`；`再验通过→再解禁`。
- [x] `GET /api/games/:id/copy/submission` 返回 `{state, validation, slot, nextVersion, publishEnabled, blockedReason}`，`blockedReason` 必须人话（等待/失败/节流剩余分钟），不贴原键/gameId/摘要。
- [ ] 旧 `draft_revision` 不再作为门条件；`readFresh(gameId, draftRevision)` 废弃，改为 `readFreshByDigest(gameId, copyDigest)`。（发布门改走 copyDigest，待接线）

### B4 旧链退役与迁移（T8）
- [x] 一次性 `tools/migrate_copy_once.mjs`：HTTP 驱动，逐游戏 `POST /copy/ensure`（`seedFromGame` 只种一次，已有行不覆盖，可重跑）。
- [ ] 迁移后（除内置）：清 `draft_requests/draft_objects/draft_references/content_snapshots(非内置)/trial_sessions/trial_assets/compile_jobs`，`VACUUM`。（停服窗口执行，未做）
- [x] `server/drafts.js` 标记 `@deprecated`（文件头＋`PrivateDrafts` 类注释：不再接受新写，新写走 `GameCopyStore`；仅供迁移脚本只读与旧 UI 改绑完成前的只读投影，F6 完成后删除）。（`save` 仍在线，未封——旧面板改绑完成前保留）

### B5 砍试运行（T6）
- [x] `editorapp.js`：`TrialSessions` 不再实例化；`/api/trial/*` 全部 `410 TRIAL_RETIRED`（含 wait/web/status/pack/asset/start/end）；删除 `trialWebFile/trialAppPage/TRIAL_WAIT_PAGE` 等残留。
- [x] 删除 `stageApi` 对 `drafts.captureForCompile` 的 trial 分支依赖，保留发布检验要用的整包加载。（`server/stageapi.js` 仅 80 行通用命令分发，零 draft/trial 引用，无分支可删）
- [x] 前端试运行按钮/章节运行测试入口全部下线（见 F3）。（`DraftPanel.vue` 試運行章下拉+`#draft-trial-start`+`data-chapter-trial` 已删，`shell-ui` 重建后零 `trial` 入口；`draft.txt` 控制器 `trial()/startTrial/openTrial` 暂留死代码（verify 覆盖中），待 F6 控制器重写时连 `query()/retry()` 一并清理）

### B6 鉴权与节流（T1/T2，不可砍）
- [x] 每请求必走 `#owned + #origin(基线来源标签) + epoch`；单写者只省掉 CAS，不省鉴权。（审计：`GameCopyStore.#owned`＝principal＋`must_change→403`＋`wolong-builtin→403`＋owner＋`assertNotDeleting`，写事务内复查；`principal` 验 `epoch` 不一致→401；网关 `#gateEntry` 验 Origin→403，copy 五路由全覆盖；写无 CAS 系 T1 设计）
- [x] 30 分钟节流键：`publish_slots.submitted_at`，按 `gameId` 计，不按用户计；管理员同意不限流。（`SUBMIT_COOLDOWN_MS` 按 game 计，`single_slot` 脚本实测；同意路由独立配发 ordinal，不走作者提交节流）

## 2. 前端任务（editor-ui/src + server/public/*.txt）

通用（`editor-ui-layout-spec.md` §1–§9，每面板自检）：
- [x] 整页不滚，数据区滚；顶部单行左提示右草稿。骨架由 `editor-ui/src/theme.css` 布局维护，不依赖玩家 `style.css`，列表使用默认 `ElTable/ElTableColumn`；迁移与浏览器覆盖限制见 journal §36。
- [x] 控件用 Element Plus 默认 size，布局垂直居中，不写高度覆盖；枚举显示名称、未知值保留「数字（未知）」；copy 保存后按既有控制器重读。旧 34px／自造高度变量条目已由默认组件约定取代。

### F1 `Workbench.vue`
- [x] `workspace-context` 改为 `目前草稿：name/gameId`，删 `／修订`（脏/未确认/未载入布尔保留，无号码；`pending/verified` 系控制器状态机，待 F6）。
- [x] 顶部 `current-game` 下拉显示 `name`，不显示 `／修订`。
- [x] 菜单：下线试运行相关视图（若有），保留 10 面板对照表（workbench-structure §3.1）。（`client.txt views` 无 trial 条目，无需删）

### F2 `DraftPanel.vue` → 改为副本页（保留文件名，改文案与逻辑）
- [x] 删：`#draft-revision` 输入、`#draft-load` 的修订语、`#draft-operation-query/retry`、`chapter gaps` 的修订绑定。（`#draft-trial-*` 试运行入口已删 ✅；query/retry 按钮与保存回应急段落已删 ✅；gaps 改走检验问题按章分发，未验显示「尚未检验」）。
- [x] 留：游戏选择、名称/简介、资源四字段（改走 `writeModule`）、新增章节表单（走 `copy` 章节模块）。（后端已备齐：`chapters.create/copy/delete/rename/setStart/resources/edits` 走原函数，`writeModule` 章节新增/复制/删除/四字段已验；`edits` 七 op：city/city-native/city-faction/set-capital/general-faction/city-governor/set-diplomat，与 draft chapterEdits 同形同限）
- [x] 保存语义：按模块 `PUT /copy`，成功后 `load()` 重读，不依赖控制器自动重读。（控制器加法：`loadCopy` 读 `GET /copy` 建页投影、`saveCopyPage` 按序送 metadata＋chapters.resources、`copyChapter/createCopyChapter` 走 chapters 模块、`setCopyField/setCopyResource/cancelCopyEdits`；`DraftPanel.vue` 已改绑；`verify_copy_controller_copypage.mjs` 7 项通过；附带修 `saveCopyModule` 换摘要即清检验票)

### F3 章节/据点/武将/地图面板

**地图后继计划（用户确认）**：不再只改绑旧MapPanel；旧地图页面全部重设计。先完成独立系统基础地图的一次转换/管理员维护，再将普通新建及完整复制接到同一模板初始化，最后建设游戏地图工作台。详细分批与验收见[系统基础地图任务](system-base-map-tasks.md)；下列旧MapPanel条目仅记录已有后端能力与接线缺口，不代表现行完整实现方案。
- [x] `StrongholdPanel`：保存走 `cities` 模块（rename＋numbers 同体一次 PUT，成功后控制器重读），删 `fields.revision` 门，`canLoad` 只看 gameId。（控制器加法：`checkedCopyCities`＋`cityCopySave`＋`page.cities` 行投影；`verify_copy_controller_cities` 6 项通过）
- [x] `ChaptersPanel`：保存走 `chapters.edits` 七 op＋`setStart`（逐命令一次 PUT，成功后控制器重读），`setCopyStartInput/cancelCopyStartInput` 替代年代暂存门，`setCopyField('chapterId')` 切章；`model.copy.page.attributes` 投影（势力角色／武将职务／据点数值，`posts` 由投影算）。（控制器加法：`checkedCopyData` 章武将／据点／角色引用校验＋`submitCopyChapterEdit`＋七 `copy*` 动作；`verify_copy_controller_chapters` 6 项通过）
- [x] `GeneralsPanel`：武将／势力表走 `model.copy.page.attributes`，就绪门只看副本页＋游戏（删 `revision/verifiedRead/profileRevision` 门），保存走 `copy*` 七任职动作＋`copyBlockers`（逐命令一次 PUT，成功后控制器重读），章节切换走 `setCopyField`，头像库跟随副本游戏（`adoptFor`，游戏级端点，不读修订）。（控制器加法：武将显示字段 `originalPortraitId/ability/specialtyLowBits/sourceRecordId`＋`copyBlockers`；`verify_copy_controller_generals` 4 项通过）
- [x] 游戏地图保存走新 `copy` 模块 API/`copyDigest`。按用户作废旧地图页面的后继决定，以共用BaseMapPanel＋createGameMapWorkbench替换旧MapPanel，已不依赖旧revision/verifiedRead/profileRevision门；服务仍用十四op身份/配方门并维护组合引用。真实HTTPS浏览器保存重读、实际修改后废票/重验/审批及同一玩家加载器装配通过，详见[基础地图合同§7.6–7.9](system-base-map-design.md#76-游戏地图读取与编辑会话)。
- [x] 跨模块缺口不在模块页拦，只在发布页红字列出（T4 §3）。（构造证据：`writeModule` 全程不读 `copy_validations`/票据，只换摘要即废票；跨引用（首都/太守/改名影响章/库引用/地图编译/章缺口）只进 `validateWhole` 全量闭包→逐章 problems→发布遮罩按 code 分组＋`copyGapsFor` 按章分发；控制器本地成员检查只认已读存在性。覆盖：`validate_gate`＋`single_slot`＋`copypage` gaps 分发）

### F4 `PublishPanel.vue`（状态机主面，T5）
- [x] 表格列：游戏名称｜说明｜版本号｜状态｜检验｜创建时间｜状态时间｜操作（`workbench-structure §3`），检验列显示 `passed/failed/未检验/已过期+时间`。（行数据源 `GET /api/games`＋逐游戏 `GET /copy/submission`；`version/nextVersion/state/validation/slot/publishEnabled/blockedReason` 全部取自 submission 回应）
- [x] 新增必填多行 `发布说明`（`ElInput textarea 3行`，前端 `maxlength 2000`＋计数＋控制器截断，服务端 `checkDescription` 再验；提交前 confirm 显示 `本次 ${nextVersion}`＋说明全文；提交后清空）。
- [x] 按钮：`校驗` → `POST /copy/validate` 全量验（遮罩为常驻检验清单：章节引用完整性／游戏源与地图编译，未验·／检查中▶／通过✓／未通过✗＋红字原因逐章列出，未知码追加在后；无明细的请求层失败只说原因，不指不存在的红字）；`上架申請` 默认禁用，`title/publishHint` 写明原因（未检验/检验失败/30分钟剩余/已提交待审核/未填说明）；提交前 `ElMessageBox.confirm` 显示 `本次 ${nextVersion}`；提交后立即禁用＋清空票据，失败不清空说明。
- [x] 删：`publish-query/retry/forget` 的长连接轮询（`publish.txt` 重写：只有提交后 190s 窗口内 5s 轮询 `GET submission` 查 `slot`，到期或离审结自动停；`revision/operation-key/progress/journal` 全删）。（控制器 `installPublish` 重写＋`verify_publish_controller_slot` 7 项通过；附带修新控制器 `allowed()` 引用比对 bug——`setIdentity` 存规范化副本，恒不等 `authority()`；补 `canAdoptGame` 登录态放行——F4 重写曾恒返 false，一票否决顶部游戏切换，已加回归断言）

### F5 `ReviewPanel.vue`（管理员）
- [x] 审核行显示发布说明原文；操作 `同意/拒绝/删除`（同意走 `/copy/approve` 空体提交，拒绝走 `/copy/reject`，删除走旧链）。（`installReview` 改走 `GET /api/admin/copy/submissions` 待审队列；`ReviewPanel` 加发布说明列；`verify_review_controller_queue` 5 项通过）
- [x] 同意即 `ordinal+1` 并覆盖 `formal`。（`approveSlot`＋路由＋审核面启用已落地；包构建：路由事务外 `compileGameSource`＋`prepare`，事务内 `installPreparedInTxn`；R2 visuals 缺失环境按 503 照常失败）

### F6 控制器 `server/public/draft.txt + publish.txt`
- [ ] `installDraftEditor`：删 `revision/attempt/verifiedRead/profileRevision` 状态机，改 `copyDigest + ticket`；删 `trial()`、`query()/retry()`；`save()` 按模块拆分。（`saveCopyModule/readCopySubmission/validateCopy/submitCopy` 加法已落地＋`verify_copy_controller_modules` 9项通过；旧路未动。删除边界已由基础地图合同§7.9重新审计：旧MapPanel及其子页面不再挂载、client启动/画布/dirty桥已删除；DraftPanel→ChapterRolesPanel仍实际消费共享章角色状态，GeneralDefinitions/CityDefinitions及旧地图协议有兼容验证消费者但不在现行菜单。不可再称这些旧地图/定义页面全部挂载；本项是完整draft退役，仍须另批处理共享章角色与兼容协议，不能拿地图入口替换当整项完成）
- [x] `installPublish`：已整体重写为 copy 单槽 API（旧 `validationRow/fresh()/revision/operation-key/progress/journal` 全删）：行数据源 `GET /api/games`＋逐游戏 `GET /copy/submission`；`check()` 走 `POST /copy/validate` 落库取票；`publish()` 只送一次（无票自动先验，票 `digest` 对不上重验，提交后清空说明＋票据）；提交后 5s 轮询 `GET submission` 查 `slot`、190s 到期或离 submitted 自动停；`description` 控制器截断 2000、提交前必填校验；节流倒计时取服务端 `blockedReason` 人话（轮询/重读即更新）。（`verify_publish_controller_slot` 6 项通过）

## 3. 校验分层（T4，模块个案前置规则）

* 模块存只拦本模块内（非空/范围/长度/本模块唯一），一律可在无序下独立通过。
* 跨模块（首都/太守指向、父表改名影响章、武将库引用、地图编译、章缺口）一律只在发布门拦。
* 例外需个案白名单：只查对方存在性（id 存在），不要求对方已全合法；双向全合法要求禁止落地（死循环）。

| 模块 | 存时拦 | 推迟到发布门 |
|---|---|---|
| 城池据点 | 名称 1–12 码点、游戏内唯一、非空；数值 `0..65535/0..255` 范围 | 改名/改数影响哪些章；首都/太守指向有效性 |
| 武将 | 姓名非空且库内唯一、游戏级六能力 `0..15`（用户产品决定，非原版u8宽度）、头像引用存在 | 章节 `people` 引用有效性 |
| 章节 | 章序号 1–10 唯一、标题 ≤16 码点、日期范围 | 每势力 ≥1 据点、恰 1 首都、引用完整性 |
| 地图 | 矩形越界、tile/geography 范围 | 编译闭包、道路/放置引用 |

## 4. 数据清理（T8）
- [ ] 停服后执行：`DELETE FROM content_games WHERE game_id != 'wolong-builtin'` 级联清 `game_copies/publish_slots/copy_validations/published_games/content_releases/published_packs`，保留 `installed_sources/available-library`。
- [ ] 备份内置验证：`verify_pinned_source_registration` 通过后才放行。

## 5. 验证清单（一次性交付门）
- [x] `node --check` 改动 JS/MJS；`git diff --check`；`lens_diagnostics mode=all`。（后端增量通过；`migrate_copy_once.mjs` 的 console 为 CLI 输出机制）
- [x] `node editor-ui/build.mjs --check` 通过（若改 Vue）。（试运行下线后重建 `shell-ui`，`--check` 通过）
- [x] 新：`tools/verify_copy_single_slot.mjs`（单槽覆盖、30min节流、说明必填、票一次性）。
- [x] 新：`tools/verify_copy_reject_slot.mjs`（管理员驳回：非 admin 403、非 submitted 409、无 copy 404、内置 403；槽回 empty 说明保留；作者重验可再交；真实内存 SQLite）。
- [x] `tools/verify_copy_review_queue.mjs`（现行全局管理列表：说明原文/作者/版本预告；非admin403；驳回/重验保留行但不能审核；真实内存SQLite。旧离队断言已撤销）。
- [x] 新：`tools/verify_copy_validate_gate.mjs`（未验禁用、通过解禁一次、提交再禁用、重验再解禁）。
- [x] 新：`tools/migrate_copy_once.mjs`（HTTP 驱动逐游戏 ensure，幂等可重跑）。
- [x] 新：`tools/verify_copy_http_roundtrip.mjs`（真 EditorService＋落盘 SQLite：建游戏→ensure幂等→模块存→检验→提交→票复投409→越权401/404/422）。
- [x] 新：`tools/verify_copy_controller_modules.mjs`（控制器加法：模块写 exact body、摘要存储、跨游戏隔离、422/错身份拒收、submission 透传、检验通过/失败、票一次性提交、空说明/无票拒送、换摘要清票；旧 `verify_editor_draft_controller` 110 项仍全过）。
- [x] 新：`tools/verify_copy_controller_copypage.mjs`（F2 副本页：读投影成型、非法读拒收、按模块有序存＋重读、无改不送、章结构三 op 形、建章清表单、同摘要换页保票、存后票废、取消恢复；7 项）。
- [x] 新：`tools/verify_copy_chapter_ops.mjs`（10 项：`chapters.create/copy/delete/rename/setStart/resources/edits`：与 draft 同语义，`setStart` 年≤9999部分合并，无 start 章拒改，纯函数返回值已接，改名不破发布门；`edits` 七 op 写后读回＋非法 op 拒收＋整包原子性；新增 `rename-general/portrait` 写后读回＋`set-monarch/set-strategist/remove-monarch/disband-faction` 任职／继任／解散＋六 op 非法形拒收）。
- [x] 新：`tools/verify_copy_controller_posts.mjs`（F3c 武将任职：`portraitKey` 投影、改名精确体、头像设／清＋同值不送、军师设／清＋槽位门、君主设／继任精确体、解散 confirm 拒收不送、本地门禁足不送；7 项）。
- [x] 新：`tools/verify_copy_controller_generals.mjs`（F3d 武將表讀投影：顯示欄位＋來源綁定攜帶、非法顯示值拒收、blockers 同槽分列＋不虛構引用、未載入／未知章／未知槽拒收不送；4 項）。
- [x] 新：`tools/verify_publish_controller_slot.mjs`（F4 上架面：清单＋逐游戏 submission 成行、无说明拒收不送、自动检验取票后一次提交＋清空说明票据、票核销后复投重验、409/429 人话不谎报、说明截断 2000；6 项）。
- [x] 新：`tools/verify_review_controller_queue.mjs`（F5 审核面：队列成行＋说明原文＋同意走 `/copy/approve` 空体提交＋队列缩减、非法队列拒收、驳回空体送 `/copy/reject`＋队列缩减、服务端拒收人话；5 项）。
- [x] 新：`tools/verify_copy_map_ops.mjs`（map 模块十四 op 走原函数：base-fill 写回、装饰放／移／删回环、水域建／显隐／改名回环、非法 op／空 edits／整包形／坏键／重复身份拒收、writer 域错归模块码；真实内存 SQLite＋固定种子；4 项）。
- [x] 新：`tools/verify_copy_controller_map.mjs`（F3e 地图命令控制器：`copyMapId` 身份格式＋坏种拒收、精确单体＋重读、单 op 包裹、空／坏形不送、服务端拒收不谎报；4 项）。
- [x] 新：`tools/verify_copy_approve_slot.mjs`（同意链路：序号配发＋pin/版本/正式名/prune/包安装同事务、非 admin／未提交／过期检验／无安装器拒收不写、安装失败整体回滚、批准后作者重验可开新版；真实内存 SQLite＋真事务；2 项）。
- [x] 新：`tools/verify_copy_api_bodies.mjs`（客户端 `api()` 无 body 即 GET 约定锁：三份控制器文本中 `/copy/validate|reject|approve` 调用必须带 body；F4 曾因此漏体致校验 404）
- [x] 新：`tools/verify_copy_pin_shape.mjs`（pin 双形读契约：旧数字 pin 无说明仍可读、新 ordinal 缺说明 500；1 项）。
- [x] 新：`tools/verify_copy_controller_chapters.mjs`（F3b 章节属性页：读建 attributes 投影＋posts、非法章武将／据点／角色引用拒收、年代暂存送 setStart＋清暂存、七 op 精确单命令体＋重读、本地职务／归属／数值门禁足不送、同值不送、取消清年代暂存；6 项）。
- [x] 旧：`verify_vps_draft_save` 标记退役（已移入 `tools/retired/`，git 跟随历史；draft 链不再写），`verify_publish_ui_model` 按新列重写（列契约＋检验文案＋无泄露＋恶形降级；流程由 `verify_publish_controller_slot` 覆盖）。
- [ ] 真机：全新 profile 走新建→模块存（<1s 级）→检验→填说明→提交→管理同意→玩家可见。
- [ ] 浏览器验证链路（已探通，F2–F5 改绑时用）：`playwright-core`（全局 `npm/node_modules/playwright-core`）＋系统 Chrome（`C:/Program Files/Google/Chrome/Application/chrome.exe`，`--no-sandbox`，headless 可用，无需下载浏览器；`PLAYWRIGHT_MODULE` 为空时直接用该绝对路径 `require`）。

## 6. 不做的事（明确不授权）
* 不做 diff、不做历史、不做回滚、不做 trial、不做多版本保留、不做行锁/CAS。
* 不改 `KI.EXE` 规则、不补公式；二级资料不作证据。
* 未经明确授权不 commit/push；commit/push 分开授权。

## 7. 2026-11-11 补记（删除失败＋冻结基线对齐＋上架章门恢复）
* 删除失败根因：老库缺 `content_deletion_job_freezes`／`content_deletion_draft_freezes`，purge 按固定表名删撞上缺表。修法：`server/gamepurge.js` purge 前读 `sqlite_master` 只删存在的表（回执 tables 如实报触及数）；已在用户真实 dev 库上做回滚探针验证（34 张触及、2 张跳过、零报错、零写入）。
* 冻结基线对齐（`verify_game_purge` 曾全挂，非本次引入，系 F1 加表＋T6 退役未同步基线）：`deletiondefinitions.js` 加三张 copy 表、剔已退役 trial 两表；`deletionschema.js` 补三表列布局；`deletionindexprojections.js`／`deletionuniquerows.js` 剔 trial 键；`deletioninventory.js` knownTables＋scopedTables 加三表（trial 条目保留，兼容仍有 trial 表的老库）；计数更新为 56 表／54 索引／368 列／4 FK；`gamepurge.js` TABLES 保留 trial_sessions（老库清遗，缺表时过滤器跳过）。
* 上架章门恢复：`server/public/publish.txt` check() 先调只读 `/draft/chapter-references`（无 layer＝全量），有缺口即拦（不再跑 copy 检验、不发票），`PUBLISH_CHAPTER_REFERENCES` 入 errors 映射、`checkDisabled` 加 `sending`、submit 加 sending 互斥；`verify_publish_controller_slot` harness 默认回干净章节清单＋新增「章缺口先拦」用例（8 项全过）；`verify_chapter_references` 恢复通过。

## 8. 2026-11-11 补记二（删除重试＋弹窗逐项状态）
* 删不掉根因二：首次 purge 失败回滚后栅栏已在，再点删除时 fence POST 直接 409 GAME_DELETING，purge 永远跑不到。修法：`server/deletionfence.js` begin() 遇已存在栅栏＋同确认名时直接返回既有回执（零写入、不重记分布事件），调用方拿新修订继续 purge；`verify_game_purge` 加 ③′ 回归（重复建栅返回既有回执）。
* 失败定位：`server/gamepurge.js` PURGE_INCOMPLETE 附带残留表名 detail；`review.txt` remove() 返回结构化 outcome `{ok, receipt?, error?, errorTables?}`，purge 失败文本追加涉及表；补 PURGE_* 六项人话映射。
* 弹窗按用户定稿重做（单弹窗、4 项编号无括号说明、项后直接跟 完成／进行中...／删除失败！、全程单个关闭按钮、失败不自动收起）：`ReviewPanel.vue` confirmDelete 原位更新各组状态（成功按 receipt.removed 逐组 完成、R2 用 reclamation 状态；失败只标涉及组 删除失败！），`review.txt` 不再为此改返回（outcome 已含）。
* `verify_review_controller_queue` 加 3 个 remove 用例（成功回执透传／已栅栏用栅栏修订继续／失败带表名，8/8 过）；`verify_review_ui_model` 系旧 listing 控制器断言（F5 已重写 review.txt），按 `tools/retired/` 既有先例退役。
