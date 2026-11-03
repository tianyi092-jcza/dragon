# 检查点日志（checkpoint journal）

> **用途**：只记录**本轮会话**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)，本文件不复制、不替代原始证据或验证。
> **历史归档**：§26–§48（EDITOR-UI 批次、B1–B8 工作台重构、§42–§45 部署与本地服务、§46–§47 迁移归因）已从正文移除；细节用 `git log -p -- docs/checkpoint-journal.md` 追溯。仍被外部文档引用的锚点保留在文末「归档锚点」。

## 1. 当前主线状态

- **章節創作七步全部落地**：`451a211` 修绿 chapter_city_history → `bb283dc` materialize → `b2f9d84` 新建章節 → `ba1f190` 势力=君主+必填首都 → `239f7d3` 武将章节属性 → `8bd82c0` 职务先验后还原+首都唯一性 → `b46ed75` 首都须属本势力+年份4位+标题16码点 → `fa0261a` 内政官（太守）开放。
- **本轮（本会话）主线**：把「槽位」从身份降级为编码位，让武将库承担身份与能力基准，补齐序号重排，并把这条链做成可端到端验证的骨架。
- **下一个大件（未完成）**：把当前游戏用工作台重新产出一遍 → 上架 → 管理员同意 → 删旧游戏，此后所有游戏统一由工作台发布（用户长期目标）。
- 仓库 HEAD `207b5a7`，**工作树干净，未 push、未部署**。

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

## 5. 当前阻塞

1. **`verify_editor_workbench_browser` 仍红**（需拆分测试，见上）；`verify_editor_roles_browser` 是手动 harness（需 `round` ＋ `EDITOR_TEST_PORT`）；`verify_editor_shell` 只剩既有的 `disband-order`（`revertDisband` 内 `findIndex` 命中旧规则）。
2. **端到端三段串链未开始**：上架／管理员同意／删旧游戏各有分片验证，但夹具形态不同（内存 journal harness vs 真实 D1/wrangler），需先抽适配层。
3. 本会话环境无法跑真实数据库/浏览器点击级验证，只能用 pinned 固定源＋内存对象。

## 6. 下一步（建议顺序）

1. 拆分 `verify_editor_workbench_browser`：工作台段（菜单派生＋核心 9 模块＋单例可见＋零请求）与原旧壳段（独立页测试）分离；处置孤立组件 `ManagementPanel.vue`（删除或改 id 接进菜单）。
2. 把 `verify_editor_workbench_end_to_end.mjs`（7 组已绿）作为骨架，逐段接入上架→同意→删除（先统一后端夹具）。
3. 之后再做「删旧游戏后玩家端仍可启动」这一段。

## 7. 归档锚点（仍被外部文档引用）

- 外观／行军两个 SKILL 引用 `#8-用户指定五档提速`；其余旧锚点（§26–§48）已无外部引用，需要时用 git 历史追溯。

## 8. 用户指定五档提速

（归档摘要）用户指定五档 6.5／5.0／4.8／1.8／1.0ms，每 RAF 最多 16 更新；60Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示相位。现行口径与后续复验见 [战略时序](re-notes-strategic-time.md)。
