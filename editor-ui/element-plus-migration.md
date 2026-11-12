# Element Plus 默认主题迁移交付记录

## 状态与范围

- 展示层迁移已实施，Element Plus **2.14.8**；Vue **3.5.44**、Vite **6.4.4** 保持。
- 未新增项目依赖或图标导入；锁文件中的既有传递依赖 tinycolor 随 Element Plus 的最低版本要求更新。
- 保留当前工作区原有改动。本次会话开始前后的差异分段比较显示：除 `editor-ui/` 和下列三个构建输出外，已有文件差异没有变化。
- 未修改玩家样式、游戏规则、authoring 表达式、服务业务、二进制格式、存档或战斗规则；没有 commit / push。
- **验证并非全部通过**：指定控制器组保留 6 个既有基线失败；真实源数据完整流程受本地资源库环境阻塞；Vue/JSON 的主动 LSP 未全部确认，详见下文。

## 文件清单与逐面板前后对照

下表路径相对 `editor-ui/`。`PortraitPreview.vue` 已检查但无需修改，其余列出的 Vue 文件均有本轮增量修改。

| 文件 | 改前 | 改后 |
| --- | --- | --- |
| `src/LoginPage.vue` | 原生输入框 | 默认 ElInput；保留原生表单提交、字段 name、校验属性和 reset 语义 |
| `src/AccountPages.vue` | 原生密码／资料输入 | 默认 ElInput；本地临时输入模型响应表单 reset，继续兼容外部 DOM 控制器填值与 FormData |
| `src/AccountsPanel.vue` | 原生列表、查找和状态选择 | ElTable / ElTableColumn、ElInput、ElSelect；角色标签和原有命令保持 |
| `src/DraftPanel.vue` | 原生游戏／章节列表和表单 | 默认表格与输入选择；资源区域使用 ElForm 传递 disabled，保持独立保存边界 |
| `src/StrongholdPanel.vue` | 自造表格、表头按钮和控件尺寸覆盖 | 默认表格、排序箭头、输入选择；排序仍在升／降之间切换，保存与校验不变 |
| `src/ChaptersPanel.vue` | 原生年代输入、势力／据点／人物表 | 三组 ElTable 和默认输入选择；单行编辑与各单命令边界不变 |
| `src/ChapterRolesPanel.vue` | 原生选择、表格、槽位列表、浏览器 prompt | 默认选择和表格；ElMessageBox.prompt；保留槽位值转换、身份／锁检查与命令参数 |
| `src/CatalogPanel.vue` | 原生查询与列表，资源画廊布局 | 默认输入／按钮／表格；画廊保留资源内容布局，不另画控件皮肤 |
| `src/CityDefinitionsPanel.vue` | 原生章选择和据点／引用列表 | 默认选择与表格；引用未知、配置与移除语义保持 |
| `src/GeneralDefinitionsPanel.vue` | 原生导入、人物、引用和章节人物列表 | 默认表格、复选、输入选择；继承／覆盖、引用选择与原命令保持 |
| `src/GeneralsPanel.vue` | 半成品 ElTable 缺样式，遗留尺寸／主题覆盖；姓名输入有错误 slot，排序回调缺失 | 补齐组件样式；默认表格排序、ElInput / ElInputNumber / ElCheckbox；导入和头像改 ElDialog / ElProgress / ElTooltip；保留所有必需选择器 |
| `src/CopyPanel.vue` | 原生名称／简介输入 | ElInput；原创建、追踪与字段回调保持 |
| `src/CopyGamePanel.vue` | 原生输入、自写进度遮罩及公共弹窗皮肤 | ElInput、ElDialog、默认不定进度；失败仍须明确确认，运行时不能 Esc／点击遮罩关闭 |
| `src/PublishPanel.vue` | 原生 textarea／表格、自写遮罩 | ElInput textarea、ElTable、ElDialog、ElText 状态色；校验、申请及失败关闭流程保持 |
| `src/ReviewPanel.vue` | 原生主表／历史表和自写删除遮罩 | 默认主表、嵌套历史表与 ElDialog；危险按钮和状态用默认组件，三阶段删除流程保持 |
| `src/ManagementPanel.vue` | 原生当前游戏复选、条目列表 | ElCheckbox 与 ElTable；查询／重试／忘记仍沿原控制器 |
| `src/DeletionPanel.vue` | 原生当前游戏复选、条目列表 | ElCheckbox 与 ElTable；不改变删除授权或服务判定 |
| `src/LibraryPanel.vue` | 原生筛选与资源／缺口条目 | ElInput 与 ElTable；下载回调和未知信息不变 |
| `src/StageAssetsPanel.vue` | 原生产物／缺证／未闭合引用列表 | 默认表格；不增加任何准入结论 |
| `src/StageJobsPanel.vue` | 原生用途选择和产物列表 | ElSelect 与 ElTable；保留用途权限、操作关联与下载参数 |
| `src/MapPanel.vue` | 原生游戏选择和道路描述列表 | 默认选择与表格；Canvas 与视口坐标逻辑不变 |
| `src/MapWindowPanel.vue` | 原生数值／模式选择、自画右键工具菜单 | 默认输入选择、ElPopover 与默认按钮；继续保留第一次外点只关闭及键盘工具行为，地图手势／命令不变 |
| `src/BaseTerrainPanel.vue` | 原生输入、复选和基底列表 | ElInput、ElCheckboxGroup 与表格；保留可输入空值／无效值后由原边界判定，不增加 clamp |
| `src/MaterialsPanel.vue` | 原生筛选、复选、选择与素材／实例列表 | 默认组件和 ElCheckboxGroup；跨页选取、拖放数据与绘制回调不变 |
| `src/WaterCreatePanel.vue` | 原生候选选择与列表 | 默认选择、复选组和表格；跨页选取集合及新建参数不变 |
| `src/WaterGroupsPanel.vue` | 原生组合、拆分成员列表与选择 | 默认表格、复选组和选择；小地图、组合／拆分命令不变 |
| `src/PortraitPreview.vue`（检查、未修改） | 已有 ElButton 与内容 Canvas，无自造控件皮肤 | 保留像素资源绘制和已有默认按钮 |
| `src/Workbench.vue` | 自定义壳视觉、原生游戏选择与账户菜单 | 默认按钮／选择／Popover／Link；ElConfigProvider 默认 size 与繁体 locale；空字符串继续代表有标签的有效选项（中立、自由、清空等） |

其它修改／新增文件：

- `package.json`、`package-lock.json`：仅升级 Element Plus 及其必要的既有传递依赖。
- `src/main.js`：集中补齐实际使用的组件 CSS，仍按组件路径引入；仅在编辑器挂载时移除 `/style.css` 的 link；将默认字体变量用于 body，使 Teleport 弹窗也继承默认字体。
- 新增 `src/theme.css`：仅工作台布局、间距、宽度、溢出和内容图尺寸，不定义颜色、控件高度、圆角、边框或主题变量。
- 新增本交付记录 `element-plus-migration.md`。
- 按要求重建：`../server/public/shell-ui.txt`（服务输出为 shell-ui.js）、`../server/public/shell-ui.css`、`../server/public/shell-ui-licenses.txt`。除此之外未编辑 `server/public/`。

## 保留的自定义布局及理由

1. `theme.css`：顶栏／侧栏／内容区 grid 与 flex；页面不产生外层滚动，模块数据区自行滚动；状态左、草稿上下文右。
2. 工具栏、账户表单、选择器宽度与间距：避免无限拉伸、标签折行；不改变 Element Plus 的默认控件高度和 padding。
3. 资源画廊、头像网格、缩略图、pixelated / object-fit：展示像素资源，不是控件皮肤。头像的 32 / 64px 是内容图尺寸，不是输入／按钮高度覆盖。
4. `MapPanel.vue`、`MapWindowPanel.vue`、`WaterGroupsPanel.vue`：Canvas 视口、叠层、定位、滚动与命中坐标需要保持原几何关系；Canvas 的零边框／padding 是坐标映射合同，不用于美化组件。
5. 地图 SVG 占格／越界／选取反馈仍是内容标记，不是默认组件主题。主要状态色使用默认变量；原有紫色位移标记保留，因为现有文案明确说明“紫色为目的占格”，不更改该内容含义。
6. 地图右键菜单只保留全屏事件屏障、定位与按钮排列；弹出层视觉由 ElPopover 提供。原第一次外点只关闭语义不变。

没有覆盖 Element Plus 的行高、输入高度、按钮高度、字距、边框、圆角或主色。

## 构建与依赖：真实输出

```bash
cd E:/Dragon/web-port/editor-ui
node build.mjs
node build.mjs --check
npm ls --depth=0
```

最终构建／检查摘录：

```text
vite v6.4.4 building for production...
✓ 1000 modules transformed.
✓ built in 3.97s
Built shell-ui.js: 1043210 bytes
Built shell-ui.css: 113943 bytes
Built notices for 13 packages
vite v6.4.4 building for production...
✓ 1000 modules transformed.
✓ built in 3.72s
Verified shell-ui.js: 1043210 bytes
Verified shell-ui.css: 113943 bytes
Verified notices for 13 packages
```

```text
wolong-editor-ui@ E:\Dragon\web-port\editor-ui
+-- @vitejs/plugin-vue@5.2.4
+-- element-plus@2.14.8
+-- vite@6.4.4
`-- vue@3.5.44
```

`git diff --check -- editor-ui server/public/shell-ui.txt server/public/shell-ui.css server/public/shell-ui-licenses.txt`：退出 0；仅 Git 的 GeneralsPanel.vue 换行归一化提示，没有 whitespace error。

## 指定回归：真实输出

```bash
cd E:/Dragon/web-port
node --test tools/verify_copy_generals_manage.mjs
```

```text
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 479.3062
```

```bash
node --test tools/verify_copy_controller_copypage.mjs tools/verify_copy_controller_chapters.mjs tools/verify_copy_controller_cities.mjs tools/verify_copy_controller_generals.mjs tools/verify_copy_controller_modules.mjs tools/verify_editor_definition_controller.mjs tools/verify_editor_chapter_people.mjs
```

```text
ℹ tests 114
ℹ suites 0
ℹ pass 108
ℹ fail 6
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 34035.0129
```

这组**退出 1，未通过**。六项均在 `verify_editor_definition_controller.mjs`，失败名称与改动前单跑的基线一致，没有为它们修改业务／测试：

```text
city rename shares exact revision journal, preserves other inputs and requires reread
city DTO unknown and invalid rows fail closed; cancellation, identity changes and invalid text never save
city reload restores only key association and cannot reconstruct original body
chapter city configure/remove keeps single journal, saved metadata and dirty forms; original retry and reread
chapter city DTO validation is atomic, unknown locks writes; confirmation context and quota refuse
city impact confirmation captures exact chapter fields and reload only recovers original association
```

```bash
node --test tools/verify_copy_chapter_ops.mjs tools/verify_copy_single_slot.mjs tools/verify_copy_validate_gate.mjs
```

```text
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 79790.9791
```

没有另跑用户提示的 `verify_general_library.mjs:61` 已知基线红，不将其计为通过。测试未访问正式 SAVE.DAT；浏览器与服务验证使用独立 profile／开发状态目录。

## 浏览器证据与覆盖边界

### 真实服务

8443 已有其它实例，未停止它。使用自己的隔离实例：

```bash
node tools/dev_editor.mjs --port 8444 --store E:/Dragon/.dragon-analysis/element-default-ui --no-library
```

```text
DEV READY https://127.0.0.1:8444/  (account tianyi, bootstrap password Dev-Local-Only-2026!)
```

修改后已重启该实例，使服务重新 import 构建资源。新 Playwright profile，CDP `Network.setCacheDisabled` 后 reload，验证主色 `#409eff`、body 字体等于默认字体变量、玩家样式 link 数量 0。页面与 viewport 高度均 1000，无外层滚动条。

- 登录后逐一检查 11 个主导航页，均未捕获 console error 或 pageerror。
- 个人资料保存返回“操作完成。”，重新显示所填内容；密码页和账户 Popover 正常，未捕获 pageerror。
- 初始未登录 session 请求的 401 不算作“整场会话零错误”；上面零错误结论只针对已登录检查区间。
- **真实完整数据流程未验完**：正常资源库初始化遇到 `INVALID_RESOURCE_LIBRARY`／指纹不匹配；隔离实例禁用资源库后可检查壳与空态，但原章全套复制返回 403 `SOURCE_NOT_REGISTERED`。没有改服务或绕过校验。真实头像字节、原章导入后编辑、完整发布／审核／删除流程仍需可用的已登记资源库再验。

### 合成展示预览（不是后端规则验证）

为覆盖真实空库无法打开的页面，使用现有 Vite / Vue 依赖临时编译全部组件，注入明确标注的合成 DTO 与记录调用的 stub actions；不连后端、不模拟机制结论、不把它称为真实游戏全流程。

真实汇总输出：

```text
Preview panels: 27 errors: 0 non-default primary: 0 outer scroll: 0
```

27 个面板均有逐页截图；另有真实 Workbench、个人资料／密码页，以及导入、相册、全套复制、发布、审核删除和地图工具弹层截图。弹层截图禁用截图时的动画，避免截到淡入中间帧。

交互输出摘录：

```json
{"editHeights":[49,49],"albumEscapeBlocked":true,"save":[{"action":"generalCopySave","args":["preview-general-1",{"name":"展示改名"}]}],"importPercent":"35"}
{"baseCall":[{"action":"baseFill","args":[[0],2,1]}],"rolesTables":2,"publishEscapeBlocked":true,"reviewCancelRemoved":true,"errors":[]}
{"indeterminateValue":null,"copyEscapeBlocked":true,"mapMenuItems":8,"mapMenuEscapeClosed":true,"errors":[]}
```

即：默认表格只读／编辑行均 49px；名称修改仍送原 patch；实际 7/20 的导入显示 35%；不定进度不向读屏伪报百分比；数值输入传入数字；跨页复选工作；运行／失败阻塞弹层保持 Esc 无效，地图工具菜单保持 Esc 关闭。

截图、完整日志与临时预览源保留于本机：

`C:/Users/fczll/AppData/Local/Temp/dragon-element-migration/`

主要文件：`real-workbench-final.png`、`real-*.png`、各组件同名 PNG、`contact-panels-1.png` 至 `contact-panels-3.png`、`generals-album.png`、`generals-import.png`、`full-copy-dialog.png`、`publish-dialog.png`、`review-dialog.png`、`map-tool-popover.png`；日志为 `final-build.log`、`generals.log`、`controllers.log`、`chapter.log`、`browser-panels.log`、`browser-real.log`、`browser-interactions*.log`、`browser-extra.log`、`browser-crosspage.log`、`audit.log`。其中跨页复选另用 25 项候选验证：下一页保留页外 1 项，选中第二项后返回上一页仍为 2 项、页外 1 项。

临时预览源已移至该目录的 `preview-source/`，没有留在工作树。Playwright 会话及自有 8444／8445 验证服务已停止；原 8443 实例没有触碰，如继续使用它须由该实例持有者重启以重新 import 产物。这些是本机验证产物，未放进发布包。

## 选择器、文案与范围审计

- 必需的 id 与 data-* 保留；表格结构改变后部分行属性落在对应单元格包装层，列／字段值通过动态绑定生成，不再要求原生 tr / td。
- Vue 模板 AST 对照会话前副本，必需静态 id 没有丢失；静态 data-field / data-input 转动态的项已逐项复核。
- 原模板中文／繁体片段对照无缺失；这只是文案审计，不把它当业务机制证明。
- 对 `src/` 的原生 input / select / textarea / table / button / dialog 与旧主题记号扫描无命中。

```text
Missing original Chinese template fragments: 0
Diff outside UI/generated changed vs session start: []
Baseline failure names match: true
```

玩家 `server/public/style.css` 会话前后 SHA-256 相同：

```text
cd191fc05665cb5dde84a2c2d3e0db96501227a048537d5decf0f57f6b4429ca
```

## LSP / lens 限制

已执行主动 `source=lsp scope=paths` 批量检查，以及 `lens_diagnostics source=session mode=all`：

```text
Files checked: 32
Total diagnostics: 0
Outcomes: clean=2, findings=0, unsupported=0, unavailable=0, failed=0, too_large=0, inconclusive=30
```

30 项未确认（29 超时、1 个 push-only 不能证明 clean），不能写成“全部 LSP 干净”。最终再次主动检查修改后的 `main.js`、`theme.css`：2 文件确认 clean，0 diagnostics。

`mode=all` 仅剩未改的 `src/copy.js:76` 既有 unreachable-code hint，并明确报告 Vue 文件检查不完整。全部 SFC 另经 Vite/Vue 编译与合成展示预览，但这不替代完整 Vue LSP 类型检查。

## 尚未完成／受限项

1. 使用可用的已登记原版资源库补跑真实完整数据浏览器验收；不修改库指纹或业务准入来强行通过。
2. 在支持 Vue 的 LSP 可用时补足 Vue／JSON 检查确认。
3. 六个既有城池控制器基线失败保留，不在本次展示层任务修复。
