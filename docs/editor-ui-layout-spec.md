# 编辑器工作台 UI／布局规范（全模块强制）

> 适用范围：`editor-ui/` 所有面板，以及 `server/public/style.css` 的全局控件度量（旧 shell 页面同受约束）。
> 新面板必须一次满足；改旧面板时按同一标准修正，不再逐次向用户确认。
> 用户 2026-11 明确要求：这些规则适用于**所有模块**，后续对话不再重复。

## 1. 页面骨架：整页不出滚动条

- `.workbench{height:100vh;overflow:hidden}`；`.workbench-main{display:flex;flex-direction:column;min-height:0;overflow:hidden}`。
- `#session>.module-card{flex:1}`；`.module-card{min-height:0;overflow:auto}`。
- 滚动只发生在数据区：`.entity-table-wrap{flex:1;min-height:0;overflow:auto}`，表头 `sticky`。
- 页面标题只保留 `h1`（`.page-heading`）。**不得**出现「編輯後台 / 模块名」这类副标题——位置已由左侧菜单表达。

## 2. 顶部提示行

- 全站单一行 `.page-line`：左 `#status`（操作提示，左对齐、原位置），右 `#workspace-context`（目前草稿，右对齐）。
- 「目前草稿」**无边框、无底色、无内边距**，不做成胶囊。
- 两者都只占一行：`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`；行容器 `justify-content:space-between`。

## 3. 控件度量：唯一来源是 CSS 变量

- `--control-height:34px`、`--control-font-size:14px`；输入框、下拉、按钮一律同高、`box-sizing:border-box`。
- **禁止用 `margin-top` 制造控件间距。** flex 行 `align-items:center` 下，顶边距会把控件下推半格，正是「按钮和输入框不齐」的根因。行内间距交给容器 `gap`。
- 按钮：`display:inline-flex; align-items:center; justify-content:center; line-height:1`；相邻按钮 `margin-left:8px`。
- 行容器统一 `display:flex; align-items:center`：`.module-toolbar`、`.current-game`、`.account-actions`、`.page-line`。
- 表格：`td/th{vertical-align:middle}`；表内 `input/select{margin:0}`；表内按钮与输入框同高（34px），不得降到 28px 之类。

## 4. 优先用 Element Plus 组件

- 新面板表单控件优先 `ElInput / ElSelect / ElButton`，同一面板统一 `size`，度量交给框架。
- 必须用原生 `input/select` 时，必须落在第 3 条度量内；不要写与全局规则抢权重的选择器——`input:not([type=checkbox]):not([type=radio]):not([type=file])` 这类三属性选择器权重高于 `.module-toolbar input`，会静默覆盖你的修正。
- 禁止用内联 `style` 覆盖控件高度。

## 5. 表格

- 紧凑：单元格 `padding:6px 8px`；表头 12px 加字距。
- 序号列跟随「当前可见顺序」重排，不是身份或槽位。
- 操作列固定宽度、按钮同高；编辑态「保存／取消」与同行输入框顶边、高度一致。
- 长文本列省略号，不撑破布局。

## 6. 枚举列必须显示名称

- 枚举值（据點类型、身份、状态、兵种等）一律显示产品／原版定义的可读名称，**不得直接显示 0/1/2**。
- 未知值显示「数字（未知）」，不隐藏、不改写存储值。
- 名称以原始证据为准。例：据點类型 0–4 = 大都市／中都市／小都市／關卡／戰場（`CS:7DF5`，索引＝type 低 4 位；5 首都／6 中立是同表后续项，不是合法存储值）。原版字串是「都市」，不写「大城市」。

## 7. 保存与重读

- 保存成功后由**面板层**调用 `load()` 重读该修订，禁止出现「已保存但页面仍是旧值、所有编辑按钮被禁用」。
- 不为此修改控制器的 `accept()` 合同（它有意把 `verifiedRead` 置 false，要求明确重读）。
- 文案遵项目约定：等待说「在做什么」，结束说「做成了什么」，失败说「发生了什么＋能做什么＋怎么回报」；不贴原键／gameId／摘要；不伪造百分比或进度条。

## 8. 文案密度

- 页面不写科普式长段落。需要说明时压到一行（≤ 40 字），或放进 `title`／帮助入口。
- 模块说明只保留「能改什么／改不了什么／保存语义」，不复制数据模型文档。

## 9. 提交前自检清单

1. 1280×800 与 1600×900 下整页无滚动条，只有数据区滚动。
2. 顶栏、工具栏、表格行内所有控件同高 34px，`getBoundingClientRect().top` 差 < 1px。
3. 标题区无副标题；提示行左提示右草稿、右对齐、无边框。
4. 枚举列无裸数字。
5. 保存后值已刷新、编辑按钮可用。

## 10. 本次踩过的反例（不要再犯）

- 原生 `input{display:block;margin-top:7px}` → 与 Element Plus 按钮错位。
- 表内按钮 `min-height:28px` 与 34px 输入框混排 → 行内不齐。
- `.page-heading>span` 副标题；带边框和底色的「目前草稿」胶囊。
- 枚举列直接渲染 `type` 数字。
- 保存后依赖控制器自动重读（它不会），导致页面锁死。
