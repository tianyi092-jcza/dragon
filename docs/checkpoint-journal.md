# 检查点日志（checkpoint journal）

> **用途**：只记录**本轮会话**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)，本文件不复制、不替代原始证据或验证。
> **历史归档**：§26–§48（EDITOR-UI 批次、B1–B8 工作台重构、§42–§45 部署与本地服务、§46–§47 迁移归因）已从正文移除；细节用 `git log -p -- docs/checkpoint-journal.md` 追溯。仍被外部文档引用的锚点保留在文末「归档锚点」。

## 1. 当前主线状态

- **章節創作七步全部落地**：`451a211` 修绿 chapter_city_history → `bb283dc` materialize → `b2f9d84` 新建章節 → `ba1f190` 势力=君主+必填首都 → `239f7d3` 武将章节属性 → `8bd82c0` 职务先验后还原+首都唯一性 → `b46ed75` 首都须属本势力+年份4位+标题16码点 → `fa0261a` 内政官（太守）开放。
- **本轮（本会话）主线**：把「槽位」从身份降级为编码位，让武将库承担身份与能力基准，补齐序号重排，并把这条链做成可端到端验证的骨架。
- **下一个大件（未完成）**：把当前游戏用工作台重新产出一遍 → 上架 → 管理员同意 → 删旧游戏，此后所有游戏统一由工作台发布（用户长期目标）。
- 仓库 HEAD `7b18c6e`（`207b5a7` 之后的记忆重整），**工作树有未提交的验证修复、未 push、未部署**。
- **本会话续（验证门归因）**：两颗长期红的验证门已修绿——`verify_editor_workbench_browser` 218 checks、`verify_editor_shell` 90 checks（含长期 red 的 `disband-order`）。改动只在 `tools/`，未触产品代码。

## 2. 本轮交付批次（按提交顺序）

| commit | 内容 |
|---|---|
| `0ecae2c` | 槽位降级为编码位：未登场槽＝空位（无姓名/头像/能力/`generalId`），保存门只管已登场槽；`assignChapterGeneral`/`clearChapterGeneral`；基座 49,590B→18,392B |
| `6369131` | 武将库承担身份与能力基准（`ability` 六项入 `definitionFields`，可章节覆写）；取消勾选＝删库记录并级联清空各章 `people` 与原生槽位；在任者拒绝 |
| `bf6371d` | 并行会话开放太守后的跨特性缺口：库级删除也须查 `city.governor`，否则留悬空太守 |
| `447400a` | 人物层勾选直通原生槽位（`people.included` ↔ 128 槽编码），只对作者章生效（原生记录无 `generalId` 键） |
| `9785edf` | 新建勢力表单（`factionCreate` 投影＋`create-faction` 命令＋`ChapterRolesPanel` 表单） |
| `09fedcb` | 章節序号重排 `moveChapter` ＋ `chapter-reorder` 回放／回退 |
| `e56856a` | `CHAPTER_EDIT_OPS` 表驱动（21 条 op 集中登记，行为零变化） |
| `93209f0` | 序号下拉 UI（`chapterOrderInputs`＋`moveChapter` 动作） |
| `43a8670` | publish 暴露 `selectedGame()`，上架面跟随共享选择 |
| `b015562` | 上架面 B2 口径改写（`verify_editor_authoring_context` 14/14） |
| `45f5a78` | 职务口径修正（军师可在章節设、内政/外交官不设）＋`verify_editor_workbench_end_to_end.mjs` 7 组 |
| `207b5a7` | 本文件 §49 初版 |

## 3. 本轮技术决定（长期有效）

1. **槽位是编码不是身份**：`chapter.state.generals[slot]` 只是原生 128 条表的落位；身份由 `generalId`（`game.generals` 库）承载，章节按 ID 引用。取消出场＝清空该槽留洞，不重排。
2. **能力值是游戏级库属性**，章节只能覆写（六项 `siege/field/naval 0..15`、`force/lead/politics 0..255`，共用 `ABILITY_LIMITS`）。旧库记录可无 `ability`，不补默认值。
3. **内置 20 章不迁库**：原生记录没有 `generalId` 键，作者层写入器以此判别，绝不改写内置章的原生身份。
4. **勾选＝库记录存在**（不新增 `enabled` 字段）；取消勾选级联清引用；在任（势力职务或太守）拒绝隐式免职。
5. **序号＝`chapterOrder` 位置**，允许重排，不新增 `ordinal` 字段。
6. **军师可设可不设**；内政官（挂据点）／外交官（挂势力）属运行期，建章阶段一律不设。军师须本势力、登场月 `+0x18` 为 0、非俘虏。
7. **模板 profile 接受 materialize 后的中性章節态**（`(a)`）：允许 `{start,generals,cities,factions,nativeCityRecordRaw}`，generals 只 0/128、cities 只 0/192、数组无额外自有键；仍拒 `_src`、原生势力表、军团、外交等副本专属字段。
8. **多会话协作**：不得共用工作树；只用**显式路径** `git add`，禁用 `-A`（`6b19b53`/`dc7e4b7` 两次归属错位）。

## 4. 本轮调试记录（含失败尝试）

- **`revertCreateFaction` 误判**：期望值原先只叠加已申报的 `set-capital`，遇到「建势力→划据点给本势力→设首都→派军师」的正常批次会误报 `COPY_PROTECTED_DELTA`。改为叠加同批已申报的 `set-strategist`/`set-diplomat`/`general-faction`/`city-faction`。
- **`baseChapter` 取错快照**：原取 `lineage`（每次回放后被覆盖成回放后状态），导致新建章的允许写入无法回退；改为「基线章 → 复制快照 → 由建章命令重建的空白快照 → 才退回 lineage」。这是**第 3 步白名单长期不可逆**的真因。
- **盲还原洞**（用户选 `(b)`）：`set-monarch`/`set-capital`/`set-strategist`/`set-diplomat`/`general-faction`/`city-faction` 全部改为「先验后还原」——候选记录必须整体等于「操作前快照＋同一 writer」或整体等于操作前原值。
- **浏览器红门 `verify_editor_workbench_browser`（未修完，改动已 `git checkout --` 回退）**：
  - 一层真因：视图 id ≠ 面板根节点 id。`data-view="management-editor"` 对应 `ReviewPanel.vue:28` 的 `id="review-editor"`；`ManagementPanel.vue:10` 虽持有 `id="management-editor"`，但**从未被 Workbench 渲染**（孤立组件）。加映射后 `admin`/`management-editor`/`catalog-editor`/`mapview-editor`/`stronghold-editor`/`generals-editor`/`copy` 连续 7 个通过。
  - 二层真因：测试仍残留旧壳模块断言（`library-editor`/`stage-editor`/`stage-assets-editor`/`deletion-editor`），而 `grep -c "stage-assets-editor" server/public/stageassets.txt server/public/shell-ui.txt` 两处均为 **0** —— 这些 id 在已出货壳里根本不存在，那段断言早已是死代码。结论：必须**搬家**到独立页测试（或按退役决定删除），不能就地打补丁。
- **失败尝试记录**：曾把测试循环改为「从实际菜单派生＋核心 9 模块断言」，能推进到 `stage-assets-editor` 才失败；因未跑通整条脚本，按「未跑通不得提交」回退，工作树保持干净。

### 4.1 本会话续：两颗红门的最终归因（已修绿）

- **`management-editor` 是历史名**：菜单 view id 由 `server/public/client.txt` 的 `views` 决定（10 项），但该视图渲染的是 `ReviewPanel.vue` 的 `id="review-editor"`。测试改为**从 `#menu button[data-view]` 派生**菜单集合，并用显式「view → 面板根节点」映射表断言「恰好一个可见 section」，同时断言菜单集合等于已批准结构（含 `chapters-editor`，原列表漏了它）。
- **原测试后半段从未真正执行过**：它一直死在旧的第 180 行，所以 180 行之后的断言都是纸面覆盖。逐 id 比对可达组件后，死指标为 `#stage-*`、`#stage-assets-*`、`#publish-game/#publish-name/#publish-games-refresh/#publish-button`、`#source-install/#source-refresh`、`#management-*`、`#deletion-*`、`#copy h3`、`#main`。它们全部属于[工作台结构 §3 已取消模块](editor-workbench-structure.md) 或重构前的旧壳，处置是**退役**而不是改选择器：
  - 阶段任务／阶段结构／素材库：界面取消，控制器仍由 `verify_editor_stage_jobs_controller` / `verify_editor_stage_assets_controller` / `verify_editor_library_controller` 三条 lane 独立覆盖（本次已跑，全绿，均不依赖 DOM）。
  - 删除追踪：已并入「上架管理／上架审核」（`PublishPanel`/`ReviewPanel` 的 `data-action="delete"`），深流程归 `verify_publication_ui_browser` / `verify_review_ui_browser` / `verify_publication_chain_browser`。
  - 上架面改为按现网面板断言：`/api/games/submissions` 两行（草稿／已上架）、版本列 `—`、`data-action="delete"` 标题含「刪除整個遊戲」、只读全章校验打 `/draft/chapter-references`。
- **夹具缺口（不是产品 bug）**：章節 `factions` 行缺 `diplomat_idx`，而 `draft.txt` 的 `checkedFactionRoles` 要求 copy profile 下每行含 `monarch_idx/advisor_idx/diplomat_idx/capital` 且各章含 `generals`；缺一个字段就整表返回 `null`，表现为「角色面永远是未知」「新增章節永远锁定」。补夹具字段即可，**不放宽校验**。这条同时解释了先前的误判（曾以为存盘后 `factionRoles.source` 陈旧导致锁定，实测补字段后无需重载即可新增）。
- **夹具缺口**：`catalog.txt`（系統資源）在会话就绪后**自动** `GET /api/resources`，与当前视图无关；夹具没这一条就会进 `unexpected`，让末尾 `assert.deepEqual(unexpected, [])` 失败。已补 `{mode:'BUILTIN_READONLY', resources: []}`；隔离上下文同样需要。
- **`verify_editor_shell` 的 `disband-order` 是测试自身 bug**：`c.slice(c.indexOf("const revertDisband"))` 没有右界，把后一个函数 `revertCreateFaction` 里合法的 `factions.splice(factions.findIndex(f => f?.idx === factionIdx), 1)` 也当成「revertDisband 用了旧规则」。按下一个顶层声明 `const revertCreateFaction` 截断即转绿，**没有改 `server/copyprofile.js`**。
- **`view-section:management-editor` 曾是假绿**：该 id 只由**从未被 Workbench 渲染**的 `ManagementPanel.vue` 提供。`verify_editor_shell` 现在从 id 采集里剔除 5 个孤立组件（`ManagementPanel`/`DeletionPanel`/`StageAssetsPanel`/`StageJobsPanel`/`LibraryPanel`），改为逐项登记「视图 id → 组件 → 根节点 id」，并要求 `Workbench.vue` 真的 `import` 且用同一视图 id 控制显示。
- **孤立组件保留**：5 个 `.vue` 已不在出壳内，但删除会牵动多条以文件 hash 固定输入的 backend lane（属另一项退役决定），本轮只解除它们对判据的影响，不做删除。


### 4.2 本会话续：三段串链打通，以及它撞出的仓库级 schema 漂移

- **三段串链已通**：`verify_publication_chain_browser.mjs` 现在用现网面板跑「作者上架 → 管理員上架審核同意 → 删除」，
  后端仍是同一套真实夹具（共同 Request／文件 SQLite／20 章编译／guarded 不可变 stage／默认 publisher／owned workerd R2／reader），
  无 API 桩。三种模式实跑全绿：基础 10 组、`--review-ui --delete-ui` 10 组、再加 `--admin-delete-ui` 10 组。
- **根因 1（真 bug，影响面最大）**：`server/distributionledger.js` 自 `d301c49` 起另建 `content_distribution_checkpoints`／
  `_cleanup`／`_enqueue_barrier` 三张表，但 `server/distributiondeclarations.js` 的冻结声明只到 `d2acb08` 的三表。
  于是任何 `assertDeletionDefinitions` 入口一律 503 `DELETE_SCHEMA_DEFINITION`：`verify_publication_chain_browser` 死在第 44 行夹具启动、
  `verify_distribution_schema`（真 workerd）同错、`verify_editor_schema_sources` 报 `53 !== 50`。修法是补齐冻结声明（对象／列／索引／外键全量），
  不是放宽比较：这些表被 `verify_distribution_ledger_retirement`（18 组）与 `verify_distribution_ledger_backup_restore`（7 组）实际读写。
- **受影响 lane 清单（必须一起改，不能只改期望值）**：`distributiondeclarations`（6 张账本表）、`deletionschema` 列布局、
  `deletioninventory` 的 `knownTables`（否则 `DELETE_INVENTORY_SCHEMA`）、以及四处计数门：53 表／51 索引／104 对象／356 列／4 FK。
  已同步 `verify_editor_schema_sources`、`verify_distribution_schema`、`tools/fixtures/distribution-schema`、`verify_vps_editor_server`、
  `verify_frozen_publication_root`、`verify_publish_operations_root`、`tools/fixtures/publication-browser-authority`，以及 `AGENTS.md`／`r2-player-connection.md` 的基线句。
- **根因 2**：`verify_publication_chain_browser` 全篇写的是退役旧壳 id（`#publish-games-refresh`／`#publish-name`／`#publish-button`／`#management-*`／`#deletion-*`）与原生 `prompt`。
  现网是 `PublishPanel`（`#publish-refresh`／`#publish-table` 行内 `data-action`／ElMessageBox 确认／`editor-submission-operation:` 日志键）与
  `ReviewPanel`（`#review-refresh`／`#review-table` 行内 `data-action`／`#review-result`）。上架名来自服务端 `row.name`，不再有输入框，所以断言改为比对库里 `draft_name`。
- **根因 3**：`verify_frozen_publication_root` 的「listed=1 → 预览 409」负控已被 B1-B8 产品决定撤销（任何状态都可删，`begin` 里 `listed && fenced` 会顺带撤下 listed）。
  改为断言 200 且返回当前 rowRevision／draft_name，并保留只读指纹不变。`restoredTables` 一并由 50 改 53。
- **根因 4**：`verify_vps_editor_server` 断言 `client.js` 恰好 import 11 个模块，现网是 12（`management→review` 更名后新增 `review.js`）。
  改为断言精确集合，避免下次再靠数字漂移。
- **失败尝试（记录教训）**：第一版补丁脚本用「第一个 `if (managementUI) {`」当锚点，误把审核段到删除段之间约 20 行的阅读端断言整段删掉；
  发现后 `git checkout -- tools/verify_publication_chain_browser.mjs` 回退，改为「唯一文本锚点＋行数校验＋自底向上替换」重做，并逐段核对 diff。
- **仍属封存、不能当现行门**：`verify_editor_backend_deletion_definitions` 需要 `round` 参数且把 21 个源文件 hash 钉在 `pinned/worker.js` 时代的快照里（21/21 已 drift），
  本轮只把它里面的 `tablesVerified` 由 50 改 53，未重建快照；`verify_editor_roles_browser` 仍是手动 harness。

### 4.3 本会话续三：两条 UI 门本就是现网面板；Trial 程序包漂移；player 段收尾

- **两条 UI 门不需要迁移**：`verify_publication_ui_browser`（7 checks）与 `verify_review_ui_browser`（6 checks）早已改用现网
  `PublishPanel`／`ReviewPanel` 选择器（`#publish-refresh`／`#publish-table`／`[data-action=…]`／`ElMessageBox`／`#review-*`），实跑全绿。
  之前 §5 记「仍写旧壳 id」是压缩摘要里的陈旧判断，本会话实测后更正，不做任何代码改动。
- **新漂移（根因 5）**：`server/public/trialweb.txt` 自 `45f5a78`（建章阶段只开放军师）后没有重建，
  `web/src/content/authoring/gamesource.js` 实际 67581 字节 vs 包内 67066。只有 `--player-client`／`--player-app` 模式会查这条
  （`makePublishRuntimeStage` 逐文件比对 byteLength＋sha256），base 模式不查，所以长期未暴露；`verify_installed_program` 同因恒红（`INSTALLED_PROGRAM_INVALID`）。
  修法＝`node tools/build_trial_web_bundle.mjs` 重建（只改 `trialweb.txt` 一行），随后 `verify_installed_program` 36 checks 绿。
- **player 段证据（「删旧游戏后玩家端仍可启动」）**：`verify_player_deleted_entry_browser` 6 checks；
  链 `--player-client --player-app` 10 checks（App 8）；`--player-client --player-app --public-player` 10 checks（App 12、trace ≈2211）。
- **一次偶发红（非行为回退）**：`public-player-browser.mjs` 的 `traces()` 在仍有 `/play-api/` fetch 未返回（`status===null`）时就断言，
  重跑两次皆绿。修法＝断言前给未返回的 trace 最多 5 秒 settle 窗口（50×100ms），超时仍 fail 才算真漏读；同时把 `path` 写进 trace，
  让失败信息能指到具体请求。**没有**放宽 completed／cancelled／bytes>0 的判据。
- **`verify_editor_backend_deletion_definitions` 决定封存**：它是 `pinned/worker.js` 世代的证据快照（21/21 源 hash drift，连启动断言都过不了），
  重建快照等于改写历史证据，属另一项决定；同一事实由 `verify_editor_schema_sources`、`verify_distribution_schema` 与链里真实 SQLite 的
  `assertDeletionDefinitions` 覆盖。已写文件头封存说明，`tablesVerified` 的 53 标注「未重跑验证」。

### 4.4 本会话续四：产品流程（重产→上架→同意→删除）现状盘点

- **已提交** `8bc0b7d`（上一批 17 文件：六表冻结、串链接现网面板、Trial 程序包重建、trace settle、封存标注）。
- **「重产当前游戏 → 上架」HTTP 层已实锤**：`tools/verify_copy_publish_parity.mjs` 实跑绿，走真实
  `POST /api/admin/copies`（202 预留）→ `POST …/run`（`If-Match: "1"`）→ 轮询 → `GET /api/games/<id>/draft?revision=1`（20 章）
  → `POST /api/publish` → `GET /api/games/submissions` → `POST …/listing list` → `GET /api/published-games` → `GET /api/trial-pack`，
  并断言副本与内置游戏数据等价。全程真实 editor application（Node SQLite＋私有文件桶），无成功夹具。
- **「删旧游戏」撞到产品级事实**：`wolong-builtin` 在约 20 处入口硬性 `403 BUILTIN_PROTECTED`（含 `server/deletionfence.js:56`／`:99`），
  而玩家端当前正式游戏正是它（`--public-player` 模式的选择器默认 `wolong-builtin`）。因此**若「旧游戏」指内置当前游戏，现行产品明确禁止删除**；
  可删的是工作台产出的旧游戏（链 lane 的删除段已覆盖 fence→退役→玩家端仍可启动）。这一条需要产品决定，不由实现猜测。
- **「用工作台重产」的 UI 证据当前是缺口**：唯一驱动副本 UI 的 `verify_editor_fullcopy_water_browser.mjs` 是手动 rN harness
  （需 `round`＋`EDITOR_TEST_PORT`＋`PLAYWRIGHT_MODULE`，且后者要 `.mjs` 入口，写 `index.js` 会 `ERR_UNSUPPORTED_DIR_IMPORT`／named export undefined），
  全篇旧壳 id：`#copy h3`（现为 `h4`「我的遊戲」）、`#copy-run`／`#copy-state`、`#source-install`／`#source-refresh`、`#water-*`；
  实跑在 `#copy h3` 超时 240 秒，且 `WaterCreatePanel.vue`／`WaterGroupsPanel.vue` 根本不在 `Workbench.vue` 的 10 个面板内。
  已在该文件头标退役，并把退役 id／未挂载组件／退役 lane 登记进[工作台结构](editor-workbench-structure.md) §3.1。
- **仍未覆盖的唯一缺口**：`draft-editor` 的「複製遊戲」（`#full-copy-name`／`#full-copy-introduction`／`#full-copy-create`，管理員可见）没有任何可跑 lane，
  HTTP 等价物只有 parity lane。下一步应补这一条小 lane，并把它的产物接进链上架／同意／删除。

### 4.5 产品流程：工作台量产 → 上架 → 同意 → 删上一份产物（已打通）

- **用户确认的产品口径**：「旧游戏」＝**上一份工作台产物**（不是内置游戏）；长期目标是等量产游戏完全可用后**删掉内置游戏条目**，统一用工作台量产的游戏。
- **新增 lane** `tools/verify_workbench_produce_game_browser.mjs`（6 checks，实跑绿）：真实 gateway／auth／SQLite／私有文件桶＋真实共享静态包，页面请求 in-process 桥接。
  1. 作者登录看不到 `#draft-full-copy`（整套复制是管理员能力）；
  2. 管理员在「游戏管理」填 `#full-copy-name` 点 `#full-copy-create` → 真实 `POST /api/admin/copies`（202，只有一次）＋同键轮询 → `#full-copy-message` 「完整副本已建立」，DB 出现新 `game_id`（≠来源），`#draft-load` 后 20 章且章序沿用来源；
  3. 上架管理 `[data-action=publish]` → 版本 1.0、状态待上架；
  4. 上架审核 `[data-action=approve]` → 已上架 1.0；
  5. 删除**上一份产物** `[data-action=delete]` → 真实 fence 行且 `fence_revision = before_revision + 1`，新产物 `listed` 仍为 1（互不影响）；
  6. 收银：零 pageerror／零逃逸请求／console 只有两次「未登入引导 401」。
- **夹具教训（这次真正踩到）**：上架第一步曾稳定 `INTERNAL_ERROR`——因为我把 `verifyStaticResources` 写成 `async () => true`，而上架要把运行时包写入 R2 并用静态发布清单核对这个证据；换成 `makePublishRuntimeStage()` 的真 `verifyStaticResources` 后立即通过。**禁止为了跑通而用固定返回顶替证据门**。
- **数据模型结论（回答「内置与量产数据组织是否不同」）**：游戏**数据模型与引擎同一套**——复制按 `installedSourcePolicy` 从同一份 builtin 源取数，引擎吃同一个 game-source（20 章／192 据点／128 武将槽），`verify_copy_publish_parity` 已断言副本与内置等价。不同的是**承载与生命周期**：内置＝`playercatalog.js:4` 的常量条目＋构建期 `BUILTIN_RELEASE` 指向 `web/content/builtin/compiled/**` 静态文件，无 DB 行、无 release pin／ordinal、无 reader 准入、不可编辑；量产＝`content_games`／`content_releases`／`published_games`＋`copy_objects`/`copy_origins`＋R2 `artifacts|projections|control`，经 `/play-api/v1/admissions` 准入，可上架／审核／删除。
- **删内置的边界（重要）**：`web/content/builtin/**` 同时是工作台的 **installed source（基础资源库）**，不能跟着内置游戏条目一起删；要撤的是「内置游戏条目」：`playercatalog.js` 的 `BUILTIN` 常量与默认选择、约 20 处 `BUILTIN_PROTECTED`、以及玩家端对 `BUILTIN_RELEASE` 的静态引导。顺序必须是先让量产游戏上架且玩家端确认可用，再切默认，最后撤条目。

### 4.6 本会话续五：玩家端接进量产流程（已打通，7 checks 连跑两遍绿）

- **lane**：`tools/verify_workbench_produce_game_browser.mjs` 现有 **7 checks**，新增第 5 段「玩家端」。流程仍是真 editor
  gateway／auth／SQLite／私有 FileBucket ＋ 真 Miniflare R2；玩家侧走真 `reader/site.js`（owned workerd）与真 distribution publisher。
- **必须排空到 IDLE**：上架与管理员同意**各排入一笔分发修订**，只 `drainOne()` 一次会把「同意前」的投影快照确认成可见，
  表现为 `VISIBLE_CONFIRMED` 却拿到空目录。修法＝循环 drain 直到 `IDLE`（上限 20 次），并断言过程中至少出现一次 `VISIBLE_CONFIRMED`。
- **玩家端断言（第 5 段）**：`/play-api/v1/registry` → 目录恰 1 笔、gameId＝量产 id、ordinal＝1.0、name＝量产名、chapters.length＝20；
  `control/current.json` 的 `uploaded` 经 `rootVisibleAt` 得到上线时间；`/play-api/v1/admissions?game&ordinal&chapter=<首章>` → 200 且拿到 ticket；
  `/play-api/v1/file?role=chapter:<首章>` 带 Bearer → 200，且字节 sha 等于 `published_pack_chapters.state_json` 的 sha。
- **删除后不变**：删掉上一份产物（fence）后再读一次 registry，目录仍恰 1 笔且是量产游戏，说明旧产物删除不影响玩家端可用性。
- **两个实测坑**：①`mf.dispatchFetch` 在这个 Miniflare 版本只吃 **url 字符串**（传 `Request` 会 `ERR_INVALID_URL`），
  与链 lane 的 `dispatchFetch(request.url(), init)` 一致；②reader 需要 `PLAYER_ORIGIN`／`PLAYER_ADMISSION_ACTIVE_KEY`／`PLAYER_ADMISSION_KEYS`
  三个绑定，缺一个就是 `ADMISSION_NOT_CONFIGURED`；③publisher 会写 `control/roots/`，`putImmutable` 的 key 断言必须含 `control/(receipts|roots)/`。

### 4.7 玩家端目录口径：内置保默认、量产只增选项（用户 2026-11 决定）

- **用户口径**：现阶段玩家端下拉框**保持内置为默认首项**；工作台量产的游戏上架后应作为**额外可选项**出现在同一列表；
  等量产游戏在玩家端确认能玩，再执行 C 方案删内置（届时只删 `wolong-web` 里 `gameId='wolong-builtin'` 命名空间的存档与目录条目，
  `web/content/builtin/**` 仍保留为 installed source 与量产复制的上游）。
- **现有产品代码已满足该口径，无需改动（实锤）**：`web/src/player/playercatalog.js:24` 下拉 = `[BUILTIN, ...published]`；
  `:20`／`:29`／`:85`／`:169` 四处回落都把选择拉回 `wolong-builtin`，所以默认永远是内置；`:173` `selection()` = `entries.get(select.value) ?? BUILTIN`；
  `web/src/ui/startmenu.js:673-676` 开局时读 `selection()` → `navigatePlayerGame(gameId, mode)` → `?formalGame=<id>&mode=new|load` → `boot.js` → `launchPublicPlayer`。
- **新增断言**（`tools/fixtures/public-player-browser.mjs`）：内置换默认为默认后，下拉**恰好 2 项**——第 1 项 `wolong-builtin`、label 以「（内置）」结尾且为默认选中值；
  第 2 项是量产 gameId、label 以「（自建） 1.0」结尾。实跑 `--player-client --player-app --public-player` 绿：10 checks、App **13**（+1）、trace 2211。
  注：label 是简体「（内置）」，断言写成繁体会被正则打回（实测一次失败后修正）。
- **生产现状（只读核查，2026-11）**：`GET https://dragon.720108.xyz/play-api/v1/registry` → `503 REGISTRY_EMPTY`（reader 通、无任何上架游戏）；
  `GET https://dragon-editor.720108.xyz/api/published-games` → `503 PLAY_READER_REQUIRED`。因此「量产可选」还需要在产品侧真实操作：
  管理員 `https://dragon-editor.720108.xyz` → 遊戲管理 → 「複製遊戲」 → 上架 → 同意。另外按 `docs/r2-player-connection.md:655`，
  生产尚未配置 `PLAYER_ADMISSION_KEYS`，准入未配置前玩家端选到量产游戏也开不了局。

### 4.7 生产部署（2026-11-03，已执行）：Cloudflare 玩家端 + VPS 工作台

- **Cloudflare**：玩家端由 Workers Builds 从 GitHub main 自动部署。最新 deployment `2026-11-03T12:07:48Z`（push 12:06:28Z）；
  线上 static-release.json 的 sourceTreeDigest = `6ef15d39…` = 用部署树重建 HEAD 的结果 → 线上内容确为 HEAD。
- **VPS 工作台**：`ssh dartnode`，目录 `/srv/dragon-editor/publication`（root）。可复用部署步骤：
  1. 本地 `git archive HEAD server vps reader tools web VERSION .gitattributes` 出 tgz，scp 上去并校验 sha256；
  2. 解包到 `app-new-<ts>`，**在服务器上用 node 容器跑 `node tools/prepare_deploy.mjs`** 得到静态发布（dist/）；
  3. 静态发布必须放到 `/home/web/html/dragon-editor-bootstrap/<sha256(static-release.json)>/`：nginx 容器的 /var/www/html 挂的是宿主 /home/web/html，
     不是宿主 /var/www/html；同时在 `/home/web/conf.d/dragon-editor.720108.xyz.conf` 里照既有块复制一个 `location ^~ /deployment-assets/static-v1/<digest>/`；
  4. `publication.env` 三处 pin：STATIC_PATH_PREFIX 与 STATIC_RELEASE_SHA256 用该 digest，STATIC_SOURCE_SHA256 用构建输出的 source tree digest；
  5. `./backup-publication.sh` → 换 app 目录 → `.env` 改 EDITOR_DEPLOYMENT_ID → `docker build` → `docker compose up -d --force-recreate`。
  首次启动会把整份静态发布（1441 文件／164MB）写进 R2，**约 10–15 分钟**后才监听端口，期间 health: starting 属正常。
- **踩坑 1（真 bug，已修 `8efcc99`）**：`server/public/trialweb.txt` 用本地 CRLF 工作副本生成，而 git archive／Linux 是 LF
  （generaldefinitions.js 18652 vs 18355 字节），启动即 INSTALLED_PROGRAM_INVALID，容器日志只有 `{"event":"startup-failed"}`。
  修法：按 .gitattributes（web/src/** text eol=lf）重新检出该文件后重建包；现在 local／VPS／Cloudflare 三处 sourceTreeDigest 均为 `6ef15d39…`，包 sha `35472643…`。
- **踩坑 2**：旧镜像标签与实际运行不一致（.env 写 ui-8fb4d6c，容器却在跑 20261031-cr8）——回滚要按 `docker ps` 的实际镜像，不要只信 .env。
- **已解除的生产闸门**：vhost 里原有两块维护 location，对 `/api/publish`、`/api/unpublish`、
  `/api/games/<id>/(listing|restriction/clear|deletion*)` 直接 `503 PUBLICATION_NOT_READY`（上架／同意／删除全被挡）。
  按用户「按建议执行」已删除（备份 `/root/dragon-editor.nginx-before-gates-*.conf`），`nginx -t` 通过并 reload；同样请求现在返回 403（应用层鉴权）而非 503。
- **玩家准入密钥已配置**：`wrangler secret put PLAYER_ADMISSION_KEYS --name dragon`（值只存运维本地 `~/.dragon-secrets/player-admission-keys.json`，0600，不入 Git）；
  key id 用 wrangler.jsonc 的 PLAYER_ADMISSION_ACTIVE_KEY=primary。/play-api/v1/registry 仍 503 REGISTRY_EMPTY＝尚无上架游戏，属预期。
- **回滚材料**：`app-old-*`、镜像 20261031-cr8／ui-8fb4d6c、`.env.before-*`、`publication.env.before-*`、nginx 备份、`/root/dragon-editor-backups/publication-20261103T123009Z`。

### 4.8 生产可用性修复：复制长请求丢回复 + 复制游戏独立模块 + 去重标题

- **「复制失败」其实是成功**：`copy_requests` 该行 `state=committed`、`copy_objects` 49 个 chunk 全 committed，
  但 nginx access log 里 `POST /api/admin/copies/<key>/run` 是 **499**（上游客户端先断开）。整套复制是单个长请求，
  超过 Cloudflare 对源站的约 100 秒上限 → CF 掐断 → 应用回 HTML 错误页 → 前端 `response.json()` 失败 → 「服務回應無效。」
- **修复 1（客户端）**：`editor-ui/src/copy.js` 的 `/run` 失败时，先用**同一个原键**查一次（`GET /api/admin/copies/<key>`）再决定提示；
  仍失败才报错。判据不变：只有 `draftRevision` 存在才算已建立。
- **修复 2（真 bug）**：`create()` 原守卫 `(operation && !summary)` 抢在「续用原键」之前抛错。刷新后 `summary` 只在内存，
  于是「複製遊戲（續）」按钮点了只会报「請先明確查詢原操作，不另建未知目標。」，永远走不出死路。
  改为：有原键且结果未知（`needsQuery || !summary`）直接走 `runExisting()`（先查原键）；`needsQuery` 不再禁用按钮
  （`createDisabled: locked || broken || (needsQuery && !operation)`）。
- **修复 3（基础设施）**：线上 vhost 的 api location 补 `proxy_read_timeout/proxy_send_timeout 600s`（备份 `/root/dragon-editor.nginx-before-timeout-*.conf`）。
- **产品重构（用户要求）**：新增管理员模块「複製遊戲」（`editor-ui/src/CopyGamePanel.vue`，根节点 `#copy-game-editor`，
  菜单 view id `copy-game-editor`，`admin` 分组、仅管理员可见），位置在「上架審核」之后；`#full-copy-*` 元素 id 保持不变，
  但已整体搬离 `DraftPanel.vue`（`#draft-full-copy` 不复存在），「遊戲管理」恢复简洁。
- **去重标题（用户要求）**：页面顶部已有「編輯後台 / X」+ `<h1>X</h1>`，各面板又重复一遍。删除重复的模块级标题：
  遊戲管理、遊戲章節、武將管理（原「武將庫與章節武將」）、地圖管理（原「地圖與水域顯示」）、上架管理、上架審核；
  「帳戶管理」改「帳戶清單」避免与菜单名重复。小节标题（章節定義／據點數值／勢力…）保留。
- **验证**：`verify_editor_shell` **92 checks**（新增 copy-game-editor 视图段 + 标签 + `htmlIds` 纳入 CopyGamePanel）、
  `verify_editor_workbench_browser` **219 checks**（菜单派生 11 项）、`verify_workbench_produce_game_browser` **7 checks**（改从新模块入口驱动）。
- **部署**：工作树快照（`git write-tree`＋`git commit-tree` 生成临时树，不动 refs）→ tgz → VPS 解包/构建/换目录；
  保持同一 `EDITOR_DEPLOYMENT_ID` 可避免重新播种静态发布，但即便如此首启仍要约 20 分钟才 healthy（期间 nginx 502 属正常）。
  线上 `/shell-ui.js` = 本地构建字节数（689470）。

### 4.10 会话续：存储布局改为「游戏级独立」（方案 B 已定稿）

- **产品口径（用户确认）**：目录投影是**游戏级**数据。管理员「复制游戏」拿到的是内置游戏那份目录，作者自建游戏拿到的是自己建的目录，
  只是来源不同、性质相同。基础资源（`artifacts/programs/<programDigest>/`，引擎＋621 画像＋站点）全站共享，任何游戏删除都不碰。
- **方案 B 定稿**：投影存 SQLite（按需由 `published_packs`/`published_pack_chapters` 生成），R2 只留基础资源 + 极小在架指针；
  删除 = 删库行 + 移出在架指针，**不做引用计数、不做退役账本**。文档：[game-storage-layout.md](game-storage-layout.md) §4／§5／§8／§8.1；
  交接提示词：[session-handoff-game-storage.md](session-handoff-game-storage.md)。
- **生产清理（已执行）**：两份测试游戏（`149b67be…`「卧龙传[重构版]」、`4040fa50…`「卧龙传·重构版」）走「栅栏 → purge(31 表)」彻底清除；
  结果 `games=0 fences=0 packs=0 chapters=0 chunks=0`，账号保留。`149b67be…` 的账本退役返回 `pending: DISTRIBUTION_CHECKPOINT_CONFLICT`
  （该游戏唯一的世代是 delete-fence 事件，没有可用作 anchor 的 `operation_digest`），遗留 2 条历史事件 + 1 条 cleanup 行；
  这些行惰性且方案 B 会整表下线，**不得直接删**（会导致 `DISTRIBUTION_LEDGER_CORRUPT`，chain lane 已实锤复现过）。
- **R2 盘点（实测，无孤儿）**：`projections/` 1 个对象 = 当前空目录投影；`control/receipts/` 1、`control/roots/` 1 = 当前根所需；
  `artifacts/` 1000+ = 共享程序包；`games/ test/ tmp/ drafts/` 全 0。删这三个 live 对象会让读者拿不到根（玩家端直接 502），因此不动。
- **下一步**：A 批（上架并行写新布局，可回滚）→ B 批（读者改读 SQLite 目录）→ C 批（删除简化 + 下线 6 张 `content_distribution_*` + 新增 `game_releases`）。

### 4.12 游戏存储布局（方案 B）B 批：读侧切指针 + 玩家删除提示改为阻塞告知（未提交）

- **用户决定**（m256/m262/m272）：读者查不到 gameId 即 `410 GAME_DELETED`；玩家端弹窗改为繁体告知「該遊戲已刪除！」，**只有一个「確認」**，确认即清本机进度并回到游戏开始的选择页；右键无效，弹窗是阻塞项。
- **读者**：`reader/worker.js` 先读 `control/directory.json`（同代次 + authorityId + body digest 校验），不合格或旧 v1 根回落到该代次投影；查不到 gameId 的 `admit`/`file`/`status` 三条路径统一 410。已验证「已知但未上架」游戏的既有旧能力不被削减。
- **语义反转已记录**：`tools/verify_reader.mjs` 三条旧断言（unknown→403、unknown status→200、missing state→503）改为 410 + `GAME_DELETED`；这是用户批准的产品语义变更，不是放宽校验。
- **玩家侧**：`playerdeletedgame.js` 的 `mountDeletedGameNotice`/`GAME_DELETED_NOTICE` 取代旧双按钮入口；四条触发面（加载入口、新局选章、读档面板、运行期状态检查）共用同一阻塞弹窗；清档失败仍只有同一个确认按钮。
- **验证**：新增 `verify_reader_directory_pointer` 16 checks；`verify_reader` 77、`verify_reader_announcements` 107、`verify_player_client_workerd` 7、`verify_player_deleted_saves` 12、`verify_player_deleted_entry_browser` 5、`verify_player_restore_browser` 36、`verify_player_new_game_browser` 20、`verify_player_session_host_browser` 21、`verify_player_chapters` 42、`verify_player_client` 50、`verify_player_pack_compiled` 6 全绿。
- **未做**：用户验收①（两个相同内容游戏删 A 后 B 仍可开局）与③（删除后 31 表 0 行 + R2 无该 gameId + 指针不含该 gameId）依赖 C 批「库行 purge + 重写指针」；验收②在 B 层用「指针代次超前回落旧投影、字节等于旧 digest」证明，C 批下线投影读取后需重新证明。未 push、未部署。

### 4.11 游戏存储布局（方案 B）A 批：上架并行写游戏级目录指针（已落地，未提交）

- **基线（改动前）已跑绿**：`verify_game_purge` 8 checks、`verify_distribution_ledger_retirement` 18 组、
  `verify_distribution_ledger_backup_restore` 7 组、`verify_editor_shell` 92、`verify_publication_chain_browser` 10、
  `verify_workbench_produce_game_browser` 7。
- **A 批内容**：新增 `reader/directorypointer.js`（`control/directory.json`，每个 gameId 一条 entry，digest 覆盖不含 digest 的 body）
  与 `vps/directory-pointer.mjs`（由已冻结投影整形 + 自有 etag CAS + 回读）；`vps/distribution-resources.mjs` 在资源闭包末尾
  背书这份目录（仅 `runtimeVersion === 2`），`vps/distribution-publisher.mjs` 只写被背书的那份，且**在根 CAS 之前**写。
  旧 `projections/<gen>/<digest>/projection.json` 与根逻辑一行未改 → 整批可回滚。
- **新增 lane** `tools/verify_directory_pointer.mjs` **22 checks**：整形保真、9 类投影偏差与 6 类指针形状拒绝、
  CAS/幂等/冲突/回读不一致、指针先于根、**中途失败根不动且恢复后补写同一指针**。
- **既有 lane 全部保持绿**（都在改后复跑）：chain browser 10（新增「每推进一代一份指针 + 指针条目与旧投影逐字段一致」）、
  workbench produce 7（新增指针含量产 gameId/20 章/1.0）、first online 116（新增「指针先于根、重试不重复写」）、
  frozen publication root 46 组、distribution publisher 37+37+13+6、resources 45+45、static_resources 35、static_batch 36、
  publication catalog 35、player_pack_compiled 6、reader 77、drainer 35、restore 5、publication_server 18、publish_to_r2 29、
  schema sources 53 表/51 索引/356 列/4 FK、distribution schema 53/51/356。
- **实测教训（重要）**：浏览器 lane 与多个 Miniflare lane **不能并发跑**——同一台机器上并行会互相踩到 scratch/端口，
  出现与本改动无关的红（本次 `retirement`/`restore`/两个 schema lane 并行时红、单独跑全绿）。
- **读代码发现的两处事实（写进 `docs/game-storage-layout.md` §9.1）**：①读者是 Cloudflare Worker，读不到 VPS SQLite，
  所以 `artifacts/<gameId>/…` 必须继续留在 R2（gameId 独占前缀，删除仍不需要引用计数）；②未上架但未删除的游戏
  今天就已经取不到 runtime（503），所以指针不需要携带它们的 runtime。
- **C 批待用户确认的一处产品语义**：purge 之后 `content_games`/fence 行都没了，指针重写时该 gameId 会整条消失，
  玩家端由 `410 GAME_DELETED` 变成 `503 GAME_STATE_UNAVAILABLE`。保留 410 需要墓碑（每条 36 字节、永久增长），
  方案 B 的「删除即移除」原则上不给墓碑——A/B 两批不动这个行为。
- **状态**：A 批代码 + 验证完成，**未 commit、未部署**。B 批（读者改读指针）、C 批（purge + 移出在架集合 + 下线
  `content_distribution_*` + `game_releases`）尚未实施；C 批改 schema 必须同步两个计数门与 `server/deletiondefinitions.js`。

### 4.13 游戏存储布局（方案 B）C 批：删除 = 库行 purge + 指针移除 + 前缀回收（已落地，未提交）

- **范围裁定（本轮只做删除语义）**：调研确认 `content_distribution_state/events/chunks/checkpoints/cleanup/enqueue_barrier`
  不是「只管退役的账本」——`chunks` 是**入队时冻结的 payload**（异步发布的基础），`events` 被 `server/management.js`
  的管理回执回查（`#distributionRow`）。下线这 6 张表等于改发布协议 + 管理回执格式，涉及已验收形状与 20+ 条 lane，
  不能塞进这一批。`game_releases` 是 `events` 的替代日志，与协议改版同批落地（现在加会是一张没有消费者的表）。
  详细裁定与两条后续路线见 `docs/game-storage-layout.md` §11.2。
- **C 批内容**：新增 `vps/game-reclaimer.mjs`（读指针 → digest 复核 → 过滤该 gameId → 按读到的 etag CAS 写回 → 回读确认；
  然后按 `artifacts/<gameId>/` 前缀 list+remove）。**不推进代次**（这是已提交目录的修补，不是新发布），不碰共享程序包、
  画像与 receipts/roots。`#postPurge` 变 async 并在库行 purge 之后调用注入的 `purgeReclaimer`，回执新增
  `reclamation`（completed / pending+code；未注入端口 = `RECLAIMER_UNCONFIGURED`）。`vps/publication-server.mjs` 只在
  `r2.list`/`r2.remove` 都在时装配回收器。`server/publicationproducer.js#catalog` 在冻结复核之后丢弃 `content_games`
  已无行的 gameId——修「purge 后残留墓碑让下一次发布 503 DISTRIBUTION_AUTHORITY_CORRUPT」的预存缺陷。
- **验证**：新增 `verify_game_purge_reclaim` **9 checks**；`verify_game_purge` 8→**11**（回执 completed + 本游戏前缀 0 字节
  + 指针不含该 gameId + 同内容另一游戏与共享位元组不动）；`verify_publication_producer` 24→**25 组**（purge 后重建目录丢墓碑）；
  `verify_publication_server` 18、`verify_reader_directory_pointer` 16、`verify_editor_shell` 92、
  `verify_publication_chain_browser` 10、`verify_editor_schema_sources` 53/51/356/4（本轮无 schema 改动）全绿。
- **未验证**：验收①的全栈版本（真 workerd 读者把 B 从 registry→admit→逐章读到开局）还没有 lane；验收③的 R2 部分用
  注入式 in-memory 物件埠（与生产同一份回收代码，但不是真实 R2 桶）；验收②仍依赖「回落旧投影」因为投影读取没下线。
- **状态**：C 批代码 + 验证完成，已随 B 批提交（`e4bbca3`）并上生产（见 §4.14）。

### 4.14 方案 B（A+B+C）已提交并部署生产（2026-11-04）

- **提交**：`af21e37`（A 批）→ `e4bbca3`（B+C 批，23 个显式路径）→ `4f8e1c3`（重建 `server/public/trialweb.txt`）。**未 push**（未授权）。
- **提交前补的一步**：B 批改了 `web/src/player/*.js` 但没重建 Trial 束，`trialweb.txt` 一度陈旧；
  已跑 `node tools/build_trial_web_bundle.mjs`（sha256 `e4185662…`、files 240、shell `a456d356…`、play `515019f2…`），
  重跑 `verify_player_pack_compiled`（6）与 `verify_installed_program`（36，source tree `260cc9b4…`）确认。
- **部署两个面**：
  1. **VPS 工作台/发布器**：静态发布 digest `b93d19e8…`（1441 文件/164.30 MiB）→ 放 `/home/web/html/dragon-editor-bootstrap/<digest>/`
     + nginx 新增同形状 `location`（reload）→ `publication.env` 三处 pin + `.env` `EDITOR_DEPLOYMENT_ID=20261104-bc1` → 构建 →
     `backup-publication.sh`（`publication-20261104T082754Z`）→ `app` → `app-prev7-20261104T082827` → 强制重建 → **7.5 分钟 healthy**。
  2. **Cloudflare 玩家端 Worker**（`dragon.720108.xyz`）：`wrangler deploy`，版本 `0c951544-03ed-4e73-b522-72700e285bfd`。
- **坑（已写进 game-storage-layout §12.2，后续部署必须照做）**：
  - 工作树 CRLF / `git archive` LF —— 本地 `prepare_deploy` 得 `a2eed7c9…`，服务器 LF 得 `b93d19e8…`，**source tree digest 相同**、
    文件 sha 不同。玩家端 Worker 必须用 LF 产物部署（否则 R2 里没有对应程序包，正式入口 503）。本轮做法：`git archive` 到临时目录 →
    在那里 `prepare_deploy` → 拷 `dist/` 回来 → 用去掉 `build.command` 的临时 wrangler 配置（绝对路径）`wrangler deploy -c`。
  - 首启程序归档会超时降级（B8 语义）：上传 1439 个物件约 18 分钟，容器只写 545 个就降级启动；随后用同一份
    `createStaticArchiver` 幂等补完 + `registerStaticProgram` 补登记，再强制重建，这次 2 分钟 healthy。
  - 生产 R2 有 v2 根但**没有 `control/directory.json`**（A 批上线前根已在）——新读者会 503 `REGISTRY_MISSING`，
    所以按当前根代次用 `directoryPointerFromProjection`+`writeDirectoryPointer` 补写了一次（空目录 + 1 条墓碑）。
- **上线实测**：`/static-release.json` sha256 `b93d19…`；`/play-api/v1/registry` 200 且与补写前逐字节相同；
  未知 gameId 的状态接口 **410 GAME_DELETED**（B 批语义已生效）；工作台 200；容器日志 `started` + `distribution-idle`。
- **仍未做**：生产尚无上架游戏，所以「玩家真正开局」在现网未跑过；验收①全栈版本、验收③真实 R2 桶版本仍未补 lane；
  6 张账本表与 `game_releases` 等发布协议改版（§4.13 / game-storage-layout §11.2）；push 未授权。

### 4.15 生产数据清空到 generation 0（准备重新做复制→上架→同意）

用户指示：「所有产生的数据都可以清除，保持干净」。清空前先跑 `backup-publication.sh`（`publication-20261104T091229Z`）。

- **SQLite（单交易，`defer_foreign_keys=ON`）**：清 `content_distribution_{cleanup,checkpoints,chunks,events,outbox}` + 重置
  `state` 回 `tail=0/confirmed=0/两个 digest NULL/blocked NULL` 和 `enqueue_barrier.paused=0`；另清重放日志
  `operations`(9)、`content_operations`(2)、`content_reservations`(2)、`copy_http_commands`(2) 与空表的 `content_audits`。
  结果：53 张表全部 0 行，只剩平台行 —— `users`(1)、`sessions`(2)、`login_rates`(3)、`installed_sources`(2)、
  `content_registry`(1)、`content_schema`/`schema_version`、帐本 `state`+`enqueue_barrier` 的单调行。`PRAGMA foreign_key_check` 0 条、
  `integrity_check` ok。
- **私有物件**：`publication-data/private-objects` 196MB → 0（行已全无，这些是孤儿 blob）。
- **R2**：删 `control/current.json`、`control/directory.json`、`control/roots/…`、`control/receipts/…`、`projections/1/…`；
  **保留**基础资源：`artifacts/programs/**`（共享程序包）、`control/programs/**`（5 份程序登记）、`kao/**`（621 张画像）。
  `artifacts/` 首页 1000 个键全部在 `programs/` 下，无任何 per-game 残留。
- **为什么没删 `users`/`installed_sources`/`content_registry`**：登录与「複製遊戲」要靠它们（不是测试产物）；
  帐本 `state` 行也不能删（ledger 构造时会自己插回，删行等于把 authority 换掉）。
- **清空后实测**：容器 healthy（启动要读 1439 个程序物件做校验，约 **6–8 分钟**才健康，不是卡死）；
  工作台 200；玩家端 `/play-api/v1/registry` → **503 REGISTRY_EMPTY**（无根，即文档记载的 bootstrap 前状态）；
  玩家首页 200。下一次上架会从 generation 1 重新播种，并由 `drainOne` 写第一份指针。

### 4.16 工作台「複製遊戲」追蹤：一次跑到完成、進度改為檔案數（2026-11-04，未提交）

用户反馈兩件事（原話）：「我按续后，还是60秒未完成」「弹窗的进度提示不要使用百分比进度，不准确，就用背后的文件数量完成
进度一致表示就可以」「要确认复制完后，不要再有什么续」。

**60 秒与「續」的真實來源**：`editor-ui/src/copy.js` 的 `runExisting()` 在 `/run` 回應被代理層切斷後，用
`for i<20` + 3 秒輪詢共 60 秒，超時就寫「可稍後再按（續）」。服務端 `POST /api/admin/copies/<key>/run` 是**同一個請求內同步跑完**
（`await this.adminCopies.execute(...)`，租約 300000ms），Cloudflare 約 100 秒 / nginx 499 會切断回應但不中止執行；
再按「續」時 `claim` 因 `running` 且租約未過而回 409 `COPY_NOT_CLAIMABLE`，用戶只會看到同一個 60 秒循環。
**所以 60 秒不是服務端上限，只是前端自動核對的上限。**

- `editor-ui/src/copy.js`：刪掉 20×3s 迴圈，新增 `track(t, key)` —— 依 `leaseUntil` 判斷「仍在執行（只讀輪詢）」或
  「租約已過/從未 claim（用同一原鍵再跑，最多 3 次）」；`409 COPY_NOT_CLAIMABLE / COPY_ALREADY_RUNNING / COPY_CHANGED`
  與網絡中斷都不算失敗，改走只讀查核；`TRACK_MS = 15 分種` 到頂也只提示「重新載入會自動接著核對，不必按任何按鈕」。
  `setIdentity()` 現在會自動 `resume()` 手上那一筆原鍵（用户已按過複製的那一筆，不是新開操作）；完成即 `release()` 本機原鍵。
  不再輸出 `resume`（即「（續）」）與任何百分比。
- `server/admincopy.js`：`#summary` 新增 `objects`（`copy_objects` 實際列數），供 UI 報「已寫入 N 個檔案」。
  不給百分比：總數要等 baseline 與 candidate 兩份文件都編碼完才知道。
- `editor-ui/src/CopyGamePanel.vue`：彈窗標題直接用 `model.message`（與背景面板同一句話），進度條改無限循环條紋（
  `.progress-fill.indeterminate`），按鈕永遠是「複製遊戲」；彈窗改由 `model.tracking` 驅動（重新載入後也顯示）。

**順手修掉的 C 批回歸（真實缺陷）**：C 批讓 `#postPurge` 在回執裡加 `reclamation`，但工作台兩個回執驗證器
（`server/public/review.txt`、`server/public/publish.txt`）用 `fields()` 做**嚴格鍵集合相等**，多一個鍵就丟
「徹底刪除回執格式無效」→ 瀏覽器上刪除整個遊戲永遠停在「已柵欄、尚未徹底刪除」。
現在兩處都接受選填 `reclamation` 並校驗形狀（`completed` 必須帶 `pointer`，`pending` 必須帶非空 `code`），
並在結果文案裡如實報告（已回收 / 未設定 / 未完成）。

**驗證（本輪實跑）**：新增 `tools/verify_copy_tracking.mjs` 6 checks（一次點擊到完成、只用檔案數、重跑被拒不當失敗、
租約過期才同鍵重跑、重新載入自動接着核對、已取消不重跑）；`verify_editor_copy_modes` 5/5（HEAD 原本 3/5：
修正兩條把「本機原鍵在完成後仍存在」當契約的舊断言）；`verify_publish_ui_model` 新增 1 組（回收結果四種形狀 + 五種非法形狀），
該 lane 共 7 pass/8 fail，與 HEAD 基線相同（既有陳舊紅，非本改動）；`verify_workbench_produce_game_browser` **7 checks 全綠**
（含刪除舊產物 fence→purge 200，即上面那個回歸修好的證據）；`verify_editor_shell` 92、`verify_editor_workbench_browser` 219 全綠；
`editor-ui/build.mjs --check` 相符（shell-ui.txt 694445 bytes / shell-ui.css 54698 bytes）。
LSP：7 個改動檔案 5 confirmed clean、1 ast-grep 警告（`verify_publish_ui_model.mjs:82` 既有 nested-ternary）、
1 個 silent-on-clean 服務無法確認（記為未確認，不是 0 診斷）。

**未做（待用户決定）**：上架/刪除面板那三個按鈕（查詢原操作／以原鍵重試／只停止本機追蹤）是否刪除。
它們只在有 journal 待核對時可用，正常流程下恒為灰；若要刪除，`publish.txt` 的 `submit`/`remove` 得改成
「重按同一動作就重用原鍵重送」（幂等）並自動查詢一次，否則會出現「有原鍵但沒有完成手段」的死锁。

### 4.17 沒複製成功的副本不得留下任何東西（2026-11-04，未提交）

用户回報（原話）：「上一个没复制成功，但数据还在，重新新建时显示名称重复，这是个bug。没复制成功的，不应该保存下来。」

**原因（读代码定位）**：`server/admincopy.js` 的 `reserve()` 会立刻写 `content_names(owner,name,game_id)` 与 `content_reservations`，
但 `execute()` 失败时什么都没回收：`copy_requests` 停在 `pending`／`running`，名称列永远占着 →
同名 reserve 被 `assertNameAvailableInTxn` 判 `GAME_NAME_OCCUPIED`。上一次只取消（`cancel()`）才有清理。

- `#abandonInTxn(row,state)`：终止状态 + `lease_hash=NULL/lease_until=0` + 删该 gameId 的 `content_names` +
  `copy_objects` 标 `abandoned`。已 `committed` 的行一律不动。
- `execute()` 失败即 `#abandonFailed(cap)`（只收回仍属自己这次 lease 的那份，别人重新 claim/已 commit 的不动），
  状态记 **`failed`**；失败信息不掩盖原始错误（内部 catch 全部吞掉，`reserve` 前的清扫兵底）。
- `reserve()` 在名称检查前跑 `#abandonStaleInTxn(actor)`：`running` 且租约已过，或 `pending` 超过
  `STALE_PENDING_MS=30000`（从没 claim 过，例如分页被关）→ 当作中断收回。仍持租约的请求不碰。
- 客户端 `editor-ui/src/copy.js`：`failed` 进 `decodeSummary` 白名单；`track()` 与 `runExisting()` 都把
  `failed` 当终点 —— 文案「未完成，服務端已丟棄這次的資料（名稱已釋放），可修改後直接重新複製。」+ `release()` 本机原键。

**驗證**：新增 `tools/verify_copy_abandon.mjs` **14 checks**（真实 in-memory SQLite：失败后状态/租约/名称/物件、同名重试成功、
pending 超时清扫、仍持租约不被收、已 committed 不动、模板实例角色门）；`verify_copy_tracking` **7/7**（新增 failed 终点用例）；
`verify_author_create` 18 checks、`verify_formal_name_occupancy` 19、`verify_editor_game_quota` PASS（真实复制路径）、
`verify_editor_copy_modes` 5/5、`verify_workbench_produce_game_browser` **7/7**；`editor-ui` 重建（shell-ui.txt 694832 bytes）。
LSP：3 clean、1 个 lane 的 console.log 风格警告（与既有 lane 同款）。

### 4.18 4.17 已提交并部署生产（2026-11-04）

- 提交：`ceb03ad fix(copy): 沒複製成功的副本不再留下名稱與資料`（本地，未 push）。
- 镜像：`dragon-editor-publication:20261104-bc1-ui2`（用 `cp -a app app-new2` + 解包，保留远端 `dist`，因此没有重新播种）。
- 备份 `publication-20261104T104200Z`（含隔离恢复校验）；回滚点 `app-prev9-20261104T104210`、`.env.before-20261104-bc1-ui2`；
  `EDITOR_DEPLOYMENT_ID=20261104-bc1-ui2`。
- 健康：`up -d --force-recreate` 后约 **4–5 分钟** healthy（启动仍要校验 1439 个程序物件）；日志只有 `started`/`distribution-idle`。
- 公网实测：`/shell-ui.js` 200 / **694832** 字节，含「已丟棄這次的資料」、「已寫入」；
  **不含**「正在核對原鍵」「複製遊戲（續）」（旧 60 秒循环与「續」已下线）；工作台 `/` 200；
  玩家端 `/play-api/v1/registry` → **503 REGISTRY_EMPTY**（未上架状态未变）。

### 4.19 生产「复制必定失败」的真因与失败语义（2026-11-04，未提交）

用户回報：「点击复制游戏后，弹出这个窗口，然后快速消失，什么提示都没有。游戏也没复制成功」；
随后追加要求（原話）：「这个弹窗要保证复制完全成功后再隐藏，隐藏关闭后，应该自动刷新顶部的“当前游戏”下拉列表框」。

**真因（生产实测，已修）**：生产 SQLite 的 `copy_requests` 三行全是 `failed`，`content_names`/`copy_objects` 均 0 行 ——
上一批的 abandon 逻辑把每次尝试都收尾了，不是占名问题。继续查：**`publication-data/private-objects` 是空的**。
即 §4.15 「生产清空到 generation 0」时把 196MB private-objects 当孤儿 blob 删了，里面其实有
`private-objects/installed/approved-{available-library-f4ba804b-1,builtin-28805f-entities7e7-1}` —— 已安装底层资源的字节。
所以 `reserve()`（只查 SQLite）成功、`execute()` 第一次 `loadFull` 读源字节就失败。本地 lane 全绿是因为本地有这些字节。

- **恢复**：从清空前的备份 `publication-20261104T082754Z/private.tgz` 只解出 `publication-data/private-objects/installed/`
  （520 文件 / 104MB，不动 `private/` 里的旧草稿与副本字节）。校验：两个 `installed_sources.root_digest`
  对应文件大小与 sha256 前缀均相符（98515 / 18835）。blob 按请求读取，不需要重启容器。
- **弹窗语义**：`failed` 不再静默关闭 —— `model.failed` 让弹窗留着，写明原因，只有「確認」能关（`actions.dismiss()`）；
  成功（`draftRevision`）才自动隐。
- **失败原因**：`#abandonInTxn(row, state, code)` 把 code 写进既有 `copy_requests.result_json`
  （`{version:1,code}`，不新增列、不动 schema 与计数门）；`#summary` 在 failed 时回 `failedCode`；
  客户端 `copy.js` 用 `reasons` 表翻成中文（如 `COPY_SOURCE_CHANGED` → 「底層資源已變更，需要管理員重新登記來源」），
  未知 code 保留原文（不編造原因）。`#abandonStaleInTxn` 記 `COPY_INTERRUPTED`，其余失敗記原始 code 或 `COPY_FAILED`。
- **顶下拉框刷新**：已核實链路 `client.txt:115 onCreated: () => draftUI.actions.refresh()` → `draft.txt` 的
  `refresh: () => action(refreshGames)` → 重載 `draftModel.games` → `Workbench.vue` 的 `<select id="current-game">`。
  即「複製成功後自動刷新頂部當前遊戲」本就存在，本批只把它在彈窗文案裡說明白。

**驗證**：`tools/verify_copy_tracking.mjs` **8/8**（新增：失敗留彈窗 + 「確認」才關 + 成功不標失敗；失敗訊息測已知/未知 code）；
`tools/verify_copy_abandon.mjs` **14/14**；`verify_workbench_produce_game_browser` **7/7**（真实浏览器复制→上架→同意→删除旧产物）；
`editor-ui` 重建：shell-ui.js **697562** bytes / shell-ui.css 54698 bytes。

### 4.20 4.19 已提交并部署生产（2026-11-04）

- 提交：`aa795a8 fix(copy): 失敗要看得到原因，不能靜默關掉彈窗`（本地，未 push）。
- 镜像 `dragon-editor-publication:20261104-bc1-ui3`（`cp -a app app-new3` + 解包，保留远端 `dist`，未重新播种）。
- 备份 `publication-20261104T111557Z`（含隔离恢复校验）；回滚点 `app-prev10-20261104T111622`、`.env.before-20261104-bc1-ui3`。
- 健康：约 **12 分钟**才 healthy（启动要校验 1439 个程序物件；比上批的 5 分钟长，日志仍只有 started/distribution-idle）。
- 公网验收：`/shell-ui.js` 200 / **697562** 字节，含「這次的資料已由服務端丟棄」（2）、`full-copy-dismiss`（1）、
  「這次沒有產生副本」（1）、「已寫入」（1），**不含**「正在核對原鍵」；工作台 `/` 200；
  玩家端 `/play-api/v1/registry` → **503 REGISTRY_EMPTY**（未上架状态未变）。
- 源字节未被部署影响：`publication-data/private-objects/installed` 仍为 2 项 / 104M（在 `app` 之外，只换 app 目录不会动它）。

**教训**：批量“清空到 generation 0”时不要按体积猜孤儿 —— `private-objects/installed/` 是“已安装底层资源”的字节，
删掉不报错，但会让下一次复制一定在 `loadFull` 失败。现在的失败会被看见（弹窗不再静默关闭），而不是静默消失。

### 4.21 工作台回馈速度：进度实时、进入即加载、提示写清楚（2026-11-04，未提交）

用户实测反馈（原话）：「点击复制后，弹窗一直提示复制0个档案，过了一会，弹窗消失，整个没有档案数量的进度显示。只提示显示操作完成。
我在上架审核中点击“重新整理”，才刷新发现已经建立。上架审核这个模块应该点击进去就要自动加载。而且顶部“当前游戏”的
下拉框也没有自动刷新…还得点击“重新整理”才出现，这个应该在复制成功后就自动刷新才对…页面上方的提示不应该显示
“操作完成”，应该明显确内容，如“复制完成”或“检验完成”」，以及：「我在上架管理删除了游戏，在上架审核页面点进去
自动加载就应该看不到，不能进去页面后还要点击“整理管理”才刷新」。

三处真因都是**反馈链路**而不是复制本身：
1. **进度恒为 0**：旧 `track()` 先 `await` `POST /run`（服务端在同一个请求里跑完整份复制，可长达 5 分钟；
   代理层约 100 秒切断响应）才开始轮询。请求挂起期间没有任何 `GET`，所以 `objects` 一直是 0。
   现改为**写请求与只读查询并行**：`/run` 不 await（只记 `settled` 结果），每 2 秒 `GET` 一次刷新
   `已寫入 N 個檔案`；两者都结束后再判定终态。租约/重跑规则不变。
2. **进入模块不自动加载**：`show()` 只切视图，从不触发加载。新增 `autoLoad`：`上架管理`(publish-editor)、
   `上架審核`(management-editor→reviewUI)、`用戶管理`(admin→accounts.load) 在**进入视图时自动加载一次**
   （按视图变化判定，`run()` 的 finally 重入不会死循环）。所以在「上架管理」删了游戏，切到「上架審核」看到的就是已无该游戏的清单。
3. **顶部下拉框不刷新**：`fullCopy.onCreated` 原本直推 `draftUI.actions.refresh()`，但它是 `run()` 包装的动作，
   此刻 `busy` 还是 `true` → 被静默丢弃。改为置 `draftRefreshPending` 标记，由 `run()` 的 finally（`busy=false` 之后）统一刷新。
4. **提示词**：`run()` 不再一律写「操作完成。」——动作返回字符串就用那句（复制→「複製完成。」、
   檢驗→「檢驗完成。」/「檢驗未通過，請看下方清單。」、刷新列表→「上架清單已更新。」），否则退回旧文案。

**验证（本批实跑）**：`verify_copy_tracking` **8/8**（并行轮询后所有用例仍绿）；`verify_editor_shell` **92**；
`verify_workbench_produce_game_browser` **7/7**（真实浏览器 Copy→publish→approve→delete）；`editor-ui/build.mjs`
重建 `shell-ui.js` **697739** bytes / `shell-ui.css` 54698。LSP：`editor-ui/src/copy.js` clean。

**未做**：上架面板那三个按钮（查詢原操作／以原鍵重試／只停止本機追蹤）仍待用户决定。

### 4.22 ui4 已提交并部署生产（2026-11-04）

- 提交：`c9eaf7a fix(workbench): 進度即時、進入即載入、提示寫清楚`（本地，未 push）。
- 镜像 `dragon-editor-publication:20261104-bc1-ui4`；回滚点 `app-prev11-20261104T115347`、`.env.before-20261104-bc1-ui4`；
  备份 `publication-20261104T115314Z`（含隔离恢复校验）。
- 健康：`--force-recreate` 后约 **11 分钟** healthy（45 × 15s 轮询；启动校验 1439 个程序物件，日志只有 `started`/`distribution-idle`）。
- 公网实测（模块是分开服务的，不要只看 shell-ui.js）：
  `/shell-ui.js` 200 / **697739** 字节，含「複製完成。」、不含「正在核對原鍵」；
  `/client.js` 200 / 18874 字节（含 `draftRefreshPending` 三分处与「操作完成。」兼底文案）；
  `/publish.js` 200 / 27627 字节（含「上架清單已更新。」「檢驗完成。」）；`/review.js` 200 / 13692 字节（含「上架清單已更新。」）；
  工作台 `/` 200；源字节仍在：`publication-data/private-objects/installed` 104M。
- 玩家端状态变化（不是本次部署引起）：`/play-api/v1/registry` 现在 **200** `{generation:1,directory:[],announcements:[]}`
  （上一批还是 503 `REGISTRY_EMPTY`）——即清空后又跑过至少一次发布，当前目录为空（复制/上架/删除测试的残留）。

### 4.23 上架不再「全站凍死」：阻塞遮罩 + 分步狀態 + 友善文案（2026-11-04，未提交）

用户指示（m1613/m1615/m1634）：复制→检验→上架→审核→状态全对了，玩家端也能加载复制出来的游戏；但「点击上架后整个按
钮全禁用」不能接受；阻塞应该在**当前动作**上表达清楚；「整个系统上提示要尽可能友善，让用户易于理解每步都是什么状态」。

- `server/public/client.txt`：①每个请求都有上限（只读 60s、写入 **600s**），超时/中断给明确文案（「伺服器 X 秒内没
  有回应，请求已中止；实际结果未知，请用原键查询再决定」），不再允许一个请求把 UI 永久锁住；②`run()` 的 `finally`
  先 `shell.sync({busy:false})` 解锁再渲染，并把 14 个 `render()` 包进 `try/catch`（单个面板渲染抛错不再拖死全站）；
  ③`run()` 开头立刻重画一次面板，让「动作进行中」体现在每个面板的按钮禁用上（以前按钮看着能点、点了被静默吞掉）；
  ④未收录错误码的补底文案改为「這次沒有完成：系統回報「CODE」…把这句话连同代码告诉管理员」，不再写「操作被拒絕：CODE」。
- `server/public/publish.txt`：①新增 `phase`（随 model 下发）：上架前「正在校驗全部章節…」、提交时「正在提交上架…」、
  提交后「已提交，正在讀取回執與清單…」；②追踪行去抭原鍵/gameId 等机器标识，改成「上一次上架「名字」還沒拿到確定
  結果（連線可能中斷了）…可按「查詢原操作」確認結果；系統不會自動重送」。
- `editor-ui/src/PublishPanel.vue`：「上架」与「检验」共用义一**阻塞遮罩**：标题（正在處理上架…）+ 第二行显示当前
  步骤（`model.phase`）+ 已用秒数；完成自动关闭；失败/逾时把原因写在第二行，2.5 秒后自动关闭并把同一句话留在面板
  讯息里。删除了原有的假装百分比进度条。
- `vps/editor-server.mjs`：每个请求记一行可查证的回条：`request-slow`（>15 秒或 5xx）与 `request-failed`
  （method/route/ms/code/message，不记 body/cookie/key），下次真失败时 `docker logs` 就能定位。
- 验证：`verify_editor_shell` **92**；`verify_workbench_produce_game_browser` **7/7**（真实浏览器：复制→上架 200→
  同意→玩家端能取到目录与章节字节→删旧产物）；`editor-ui/build.mjs` 重建后 `shell-ui.js` **698189** bytes；
  `publish.txt`/`review.txt` 均可作为模块导入。截图问题（整个工作台冻结）现在只能来自「同一动作还在跑」的状态，
  已用遮罩明示并封顶 10 分钟。

## 5. 当前阻塞

0. **v0.1.10 已发布并上线**（2026-11-04）：commit `c5de53d`、tag `v0.1.10`、Release
   `https://github.com/tianyi092-jcza/dragon/releases/tag/v0.1.10`（只推 `github` 远端，Gitea 镜像按用户指示不在本次发布目标内）。
   镜像 `dragon-editor-publication:20261104-bc1-ui5`，回滚点 `app-prev12-*`、`.env.before-20261104-bc1-ui5`、
   备份 `publication-20261104T125224Z`；32 × 15s 轮询后 healthy。公网实测：`/shell-ui.js` 200 / **698189**、
   `/client.js` 200 / 20931（含「這次沒有完成」「REQUEST_TIMEOUT」）、`/publish.js` 200 / 28401（含「正在校驗全部章節」
   「正在提交」「還沒拿到確定結果」、phase 6 处）、工作台 `/` 200；玩家端 registry **200 / generation 3**，
   仍列出「卧龙传·重构版」1.0 / 20 章（部署未影响已上架内容）。

1. **口径已定（§4.7）**：现阶段内置保默认、量产只作为额外可选项；撤内置（C 方案）在量产于玩家端确认能玩之后再做。
2. **已封存／已退役，都不是现行门**：`verify_editor_backend_deletion_definitions`（`pinned/worker.js` 世代快照）、`verify_editor_fullcopy_water_browser`（水域面板未挂载＋旧壳 id）。
3. **手动 harness（非 CI 级门）**：`verify_editor_roles_browser`、`verify_trial_app_boot`、`verify_editor_backend_admin_copy`（需 `MINIFLARE_MODULE`）。
4. ~~产品侧待办~~：维护闸门已解除、PLAYER_ADMISSION_KEYS 已配置（见 §4.7）；剩下就是用户在 `dragon-editor.720108.xyz` 以管理员做「複製遊戲 → 上架 → 同意」。
5. ~~本轮 B/C 批提交与部署~~：已完成（§4.14）；剩下 `game_releases` + 下线 6 张账本表需要先在「同步发布」与「新队列」里选一条路线。
6. 复制长请求仍受 Cloudflare 约 100 秒上限约束：现在靠「丢回复→按原键查询」兜底；若仍嫌慢，下一步改成后台任务＋前端轮询。

## 6. 下一步（建议顺序）

1. ~~工作台量产→上架→同意→玩家端→删上一份产物~~：**已打通并提交**（`d132411`，7 checks）。
2. ~~玩家端「内置默认 + 量产可选」口径~~：**代码本就满足，已加断言锁住**（App 13，见 §4.7）。
3. **等用户在生产的四步操作**：複製遊戲 → 上架 → 管理员同意 → 配 `PLAYER_ADMISSION_KEYS`；之后我按真机表现补/修验证（准入、目录、开局、存档命名空间）。
4. **C 方案（撤内置）落地顺序**（等第 3 步确认能玩后）：玩家目录去掉内置条目 → 清 `wolong-web` 的 `wolong-builtin` 存档命名空间 → 撤约 20 处 `BUILTIN_PROTECTED` → 最后评估 `BUILTIN_RELEASE` 静态引导；`web/content/builtin/**` 不动。
5. 顺手补：`--program-paths` 变体、`verify_player_deleted_saves`（按需）。

## 7. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`；其余旧锚点（§26–§48）已无外部引用，需要时用 git 历史追溯。

## 8. 用户指定五档提速

（归档摘要）用户指定五档 6.5／5.0／4.8／1.8／1.0ms，每 RAF 最多 16 更新；60Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示相位。现行口径与后续复验见 [战略时序](re-notes-strategic-time.md)。
