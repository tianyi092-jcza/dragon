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

## 5. 当前阻塞

1. ~~工作台浏览器门／壳矩阵／三段串链／旧壳 UI 门／player 段~~：**全部已解**（218／90／10×3／7／6／6／10 各段绿）。
2. **已封存，不是现行门**：`verify_editor_backend_deletion_definitions`（`pinned/worker.js` 世代证据快照，见 §4.3）。
3. **手动 harness（非 CI 级门）**：`verify_editor_roles_browser`（`round`＋`EDITOR_TEST_PORT`）、`verify_trial_app_boot`（`round` 参数＋`attemptN` 目录，无参启动会死于 `assert.match(round)`）。
4. 本轮改动（含 `trialweb.txt` 重建）**未提交**：commit 需另行授权。

## 6. 下一步（建议顺序）

1. ~~把旧壳 UI 门改到现网面板~~：**无需改动**（本就是现网选择器，实测绿）。
2. ~~决定 `verify_editor_backend_deletion_definitions`~~：**已决定封存**。
3. ~~「删旧游戏后玩家端仍可启动」~~：**已有证据链**（链 player 段 ＋ deleted-entry lane），见 §4.3。
4. **下一件大活**：用工作台重产当前游戏 → 上架 → 管理员同意 → 删旧游戏，走真实产品流程（不是夹具链）；
   并把过程中新撞出的漂移按 §4.2／§4.3 的方式补声明或补夹具，不要只对齐数字。
5. 若还要更严的证据：`--program-paths` 变体与 `verify_player_deleted_saves` 可按需补跑。

## 7. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`；其余旧锚点（§26–§48）已无外部引用，需要时用 git 历史追溯。

## 8. 用户指定五档提速

（归档摘要）用户指定五档 6.5／5.0／4.8／1.8／1.0ms，每 RAF 最多 16 更新；60Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示相位。现行口径与后续复验见 [战略时序](re-notes-strategic-time.md)。
