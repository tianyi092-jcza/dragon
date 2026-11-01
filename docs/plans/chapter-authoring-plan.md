# 执行计划：建立章节与章节三面（2026-11）

> 本文件是**执行用计划**，由总体对话（控制方）下达，交给新会话按步执行。
> 规格来源：`docs/chapter-and-base-resources.md` §7（建立章节）、§8（差异核对）、
> `docs/editor-workbench-structure.md`（菜单与状态机）、`docs/checkpoint-journal.md` §45–§47.4。
> 冲突时以用户的现场口述为准，并**反向修改**上述产品合同文档。

## 0. 执行前提（硬约束）

| 约束 | 说明 |
|---|---|
| 语言 | 全程中文，每次回复以 `tianyi,` 开头 |
| 必读 | `E:/Dragon/AGENTS.md`、`E:/Dragon/web-port/AGENTS.md`，再读本文件与上文规格 |
| 测试方式 | **只能用本地开发服务**：`node tools/dev_editor.mjs`（https://127.0.0.1:8443，`tianyi`／`Dev-Local-2026!`）；玩家静态 `python -m http.server 8321 --directory web` |
| 禁止 | 未经用户明确指示**不得** `git push`、不得部署到 VPS、不得读写 `E:/Dragon/Dragon/SAVE.DAT` |
| 提交 | 每完成一步、验证通过后可本地 `git commit`；推送另需授权 |
| 证据 | 机制判定只认 `KI.EXE`／原始数据／实测；本计划中所有偏移已标注置信度，标「推断」的不得升格为实锤 |
| 改 `web/src` | 必须 `node tools/build_trial_web_bundle.mjs` 重建 Trial 束，否则 §44 那种 `startup-failed` 会重演 |
| 交付格式 | 每步交付：改了什么文件、跑什么命令、结果（PASS/FAIL 原文）、未做项与原因 |

## 1. 当前位置（接手指南）

| 项 | 状态 |
|---|---|
| 仓库 | `E:/Dragon/web-port`，第 1–4 步写入器已落地：`451a211` 修绿 chapter_city_history、`bb283dc` 章節 materialize、`b2f9d84` 新增章節、第 4 步建势力槽（`createFaction`） |
| 工作树 | 应保持干净；本计划只记录范围/批次状态 |
| 已 PASS 的验证 | `verify_copy_publish_parity.mjs`（复制→上架→编译产物等价）、`verify_editor_city_definitions.mjs` 4/4、`verify_editor_game_quota.mjs`、`verify_pinned_source_registration.mjs`、`verify_editor_chapter_materialize.mjs`（7 组）、`verify_editor_chapter_create.mjs`（4 组）、`verify_editor_chapter_factions.mjs`（5 组：建势力／首都门／拒绝面／原生 17 欄一致／固定副本回放与篡改）、`verify_editor_copy_profile.mjs`、`verify_editor_template_profile.mjs`、`verify_editor_people_history.mjs`、`verify_editor_chapter_city_history.mjs`、`verify_editor_draft_controller.mjs` |
| **已知红门（非本计划引入，未修）** | ① `verify_editor_chapter_cities.mjs`：「`sourceRef.kind='builtin-copy'` 应拒绝」一例不再抛错（`citydefinitions.js` 现无 profile 闸，属模型 C 后遗留口径）；② `verify_editor_authoring_context.mjs`：`installPublish` 未导出 `selectedGame`；③ `verify_editor_workbench_browser.mjs`：登录改密后 `#management-editor` 不可见（未走到章節段） |
| 模板游戏形状 | `kind:'minimal'` 基线的空白章是**空壳**：`state.cities` 0 条、`state.factions` 0、`state.generals` 0、`state.start` 不存在；但 `chapters[cid].cities` 已有 192 条中立引用（D1） |
| 五写在策略层 | `replayTemplateHistory` 已接受 `create-faction`／`set-monarch`／`set-capital`；`start-date`／`city-faction`／`general-faction`／`set-diplomat` 仍只对「本章新建的空白章」开放（`BLANK_CHAPTER_WRITES`），模板持久历史侧尚未放开——第 5、6 步按需对齐 |
| 内置 20 章 | `original-1..4` ＋ 上／中／下／后 各 4 章；任何校验**不得**改写或阻断它们 |

## 2. 已定事实（不得重新讨论，除非新原始证据）

1. **据点属性分层（模型 C）**：游戏级 `cities[]` 存 `name`／`runtimeSlot`／`x`／`y`／`max_prod`／`type`／`view`；章节级存 `growth`／`defence`／`troops_cap`；`prod`／`troops` 为运行时值，**任何层都不写定义**。证据：20 章×192 格对照第 1 章，`max_prod`／`type`／`view` 0 差异，`growth` 2189、`troops_cap` 2328、`defence` 1 格不同。
2. **武将身份**：`general+0x17`＝0 待命／1 军团长／2 内政官／3 外交官／4 被俘（实锤，二级资料与我们的解码一致，第 1 章 128 条全 0）。
3. **武将章节字段**：所属势力 `+0x1C`（`FF`＝自由）、登场 `attr` bit7、君主 `attr` bit6、登场时间 `+0x18`、投奔 `+0x19`、被俘 `+0x1D`。
4. **职务不属于武将**：军团长＝军团 `+2`，主将／先锋／左翼／右翼／左备／右备＝军团 `+0x28..0x3F`（含兵数与兵种）。本章不开放军团编辑，界面不得把「职务」写成武将字段。
5. **势力＝君主**：定义势力必须指定首都（有首都⇒至少一个据点）；试运行／上架再校验「每势力 ≥1 据点；恰 1 个自动成首都；多个必须且只能选 1 个；0 个不通过」。
6. **内置 20 章不套势力校验**：改版章节有 8 例首都非本势力（`upper-1` 5、`middle-2` 1、`lower-3` 2），原版 4 章为 0。
7. **容量维持**：16 势力槽／192 据点／128 武将（链接所述 24／200 视为存储容量，不放开）。
8. **外交官偏移 `+2A`**（推断）：开局内政官／外交官皆空，运行后委派；作者层允许预先指定以便测试。
9. **城池 `type`/`view`** 以现有实现为准（`raw[0x17]` 恒 0，与二级资料不符，结果导向）。
10. **章节序号 1–10** 是 Web 产品决定（原版每剧本 4 章、内置 20 章），只约束作者新建游戏。

## 3. 步骤（严格按序，遇到阻塞只停该步）

### 第 1 步：修绿 `verify_editor_chapter_city_history.mjs`

- 原因：D1 materialize 后口径过期。已知三处：① `chapters[cid].cities` 现为 192 条中立引用（原断言"无 cities 键"）；② `chapterCitiesProjection` 计数由 `[0,1]` 变 `[191,192]`（复制章继承 192）；③ 某处期望错误码随 D1 变化。
- 做法：逐条按**新模型**改断言并在注释里写明理由（复制章继承 192 是 D1 的必然结果，不是放宽）；若第三处错误码变化暴露出真实缺陷，先报告再动。
- 验收：`node tools/verify_editor_chapter_city_history.mjs` exit 0，且 `git diff` 只含该文件。

### 第 2 步：章节 materialize（最难点，先做最小可用）

目标：让模板章从空壳变成**可写入、可试运行**的章节态。

- 新模块建议 `web/src/content/authoring/chaptermaterialize.js`，导出 `materializeChapterState(game, chapterId, start)`。
- 填法（唯一有原证来源的方案）：
  1. `state.start` ← 对话框值（`{era?, year, month, day}`）。
  2. `state.cities` ← **192 条原生记录**：以固定源第 1 章同槽记录的 `raw` 为基座，只补写已知字段（`+0x01` 所属势力＝`0x18` 中立、`+0x0C` 最大生产力←游戏级 `max_prod`、`+0x0E` 当前生产力初值、`+0x10` 上升值←章节级 `growth`、`+0x11` 防灾值←章节级 `defence`、`+0x12` 城兵、`+0x13` 城兵上限←章节级 `troops_cap`、`+0x17` 类型/观感←游戏级 `type`/`view`、`+0x19` 内政官 null）；**邻接表（`+0x1C` 起）与坐标保持固定源原值**，因为 `compileGameSource` 会校验 `raw` 邻接表必须与道路图一致。
  3. `state.generals` ← 128 槽骨架（从固定源第 1 章复制，`attr` bit7=0、`faction=FF`），供第 5 步勾选出场时落地。
  4. 数据形状以现有读者能接受为准：先跑 `compileTrialSource` 与 `chapterActiveGaps`，按报错收敛，不要凭猜。
- 风险与红线：**不得**发明未证实的偏移写值；凡不确定的字节一律沿用固定源原值并在代码注释标注「沿用原值，未证实」。
- 验收：单元级脚本证明新章 `state.cities.length===192`、`state.generals.length===128`、`compileTrialSource` 成功、`chapterActiveGaps` 只报预期缺口；`node tools/build_trial_web_bundle.mjs` 重建后 `verify_copy_publish_parity.mjs` 仍 PASS。

### 第 3 步：「新增章節」对话框＋章节列表（前端）

- 字段：章節序號（下拉 1–10，已占用禁用，显示「第一章」…）、章節標題（≤16 Unicode 码点，trim＋NFC，必填）、紀元（公元前／公元）、開始日期（年纯数字≤4 位、月 1–12、日 1–31；不做日历合法性校验）。
- 保存 → 列表出现；**第一章**同时带入章节态（第 2 步的 materialize ＋势力集合骨架＝空）。
- 列表列：序号（第一章）／标题／开始年代／完成度（据点／武将／势力缺口数）。
- 门控：游戏级「管理地图 → 管理据点 → 管理武将」未完成前，章节页给明确提示并禁止新建。
- 验收：本地开发服务里走完一次（新建遊戲→三件事→建章→列表），无 console/page/request 错误；截图或文字步骤记录；`node editor-ui/build.mjs --check` 通过。

### 第 4 步：势力定义＝选君主＋必填首都

- 需要新增写入器：创建势力槽（选一名武将作君主）＋现有 `setFactionCapital`。作者层守则：**没有首都的势力不能保存**（用户口径：有首都⇒至少一个据点）。
- 在 `server/copyprofile.js` 的 `replayTemplateHistory` 中放开对应 op（`set-monarch`／`set-capital`／新增的 `create-faction`），其余仍 fail-closed。
- 验收：新增 `tools/verify_editor_chapter_factions.mjs`（模板章建势力→选君主→设首都→拒绝无首都势力→拒绝首都非本势力），PASS；文档 §3 校验表同步。
- **落地状态**：写入器 `createFaction`＋回放＋验证器（5 组）已交付；「无首都」由 `chapterActiveGaps` 的 `entity-field`＋`entity-ref` 承担。两项未完成：
  1. **`首都非本势力` 未实施**：原版 8 个内置势力的首都据点 `+01` 不等于本势力，属原始反例；这条只能是已标记的 Web 产品决定，需先定内置章豁免口径 → 归第 6 步。
  2. **选君主 UI 未接**：空白章 128 槽在「勾选出场」落地前全是未登场骨架，候选集会变成 128 个幽灵名字；表单留到第 5 步之后接（届时候选＝已登场且自由的武将）。

### 第 5 步：武将章节属性（勾选出场＋身份＋所属势力）

- 来源＝游戏级武將庫（只有基础信息）；库为空时给出「先到管理武将导入/自建」的提示与跳转。
- 字段：勾选出场、身份（`0x17` 0–4）、所属势力（必须是本章已定义势力或自由）。
- 需新增 `setGeneralStatus`（`+0x17`）写入器；128 槽分配策略先按「已出场武将按勾选顺序占槽」，并**写进合同**（这是 Web 决定，不是原版规则）。
- 验收：`tools/verify_editor_chapter_generals.mjs` PASS（含 129 名超额拒绝、未定义势力拒绝、身份越界拒绝）。

### 第 6 步：据点章节属性＋试运行全量校验

- 据点面：所属势力／中立／首都；首都只能有一个且必须属本势力。
- 试运行校验（作者层）：每势力 ≥1 据点、首都唯一且属本势力、每章至少一名君主。错误要能定位到「第几章／哪个势力／哪个据点」。
- 验收：`tools/verify_editor_chapter_validation.mjs` PASS（含 0 据点势力、双首都、首都非本势力三类拒绝）；`verify_copy_publish_parity.mjs` 仍 PASS（内置章不受影响）。

### 第 7 步：内政官／外交官预设（推断，测试用）

- 章节定义里可预先指定 `faction.advisor_idx`（`+2`，`7F`＝无）与 `diplomat_idx`（`+2A`，`FF`＝无）。
- 代码与文档都要标「偏移为推断：228 个内置势力全为空，无法判别；以 `+2A` 为准」。
- 验收：`tools/verify_editor_chapter_officers.mjs` PASS（设/撤、空值哨兵、身份冲突提示）。

## 4. 每步通用验证清单

```bash
node --check <改动的 JS/MJS>
node tools/build_trial_web_bundle.mjs          # 改了 web/src 必跑
node editor-ui/build.mjs --check               # 改了 editor-ui/src 必跑
node tools/verify_copy_publish_parity.mjs      # 据点/编译不回归
git diff --check
lens_diagnostics mode=all（改动文件）           # 空缓存不算 clean
```

## 5. 已定口径（控制方 2026-11 拍板，执行方不得再问、不得自行改动）

1. **空白章「当前生产力／城兵」初值**：取固定源第 1 章同槽值，最终口径。
2. **128 武将槽分配**：按作者**勾选顺序**占用槽位，不做固定槽复用 —— 因为后续要把「武将数量」改成可动态定义，槽位语义不能硬编码。
3. **同步时机**：地图／基础资料与已建章节的同步＝**建章时一次性**；之后改地图或基础资料不自动回写已建章，作者要新值就重建章。
4. **第一章可删可重建**：第一章的特殊性**只在于创建时顺带带入游戏基础数据**（章节态快照），带入完成即与其它章完全等价。
5. **基础数据生命周期**：归游戏——**由第一章产生，由删除游戏删除**。删任何章节（含第一章）都不删基础数据；所有章节删光后基础数据仍在（游戏仍是草稿，不可试运行／上架）。

> 红线：任何实现都不得把「删第一章」实现成「删基础数据」。章节态与基础数据是两套生命周期。

## 6. 交付边界

- 本计划只覆盖**建立章节与章节三面**；上架状态机、玩家端存档校验、模板五写的其余能力不在本批。
- 遗留（不属本批，不要顺手改）：`EDITOR_REGISTER_SOURCE` 生产未开启；6 个浏览器 verifier 引用旧 DOM（`#copy-run` 等）；CHANGELOG 缺该批次条目。
