# Checkpoint Journal — 臥龍傳 Web 复刻

> 给下一个对话的项目记忆。这里只保留稳定事实、当前架构、操作约定、重要坑点和最近 checkpoint；详细逆向结论见 `AGENTS.md`、`docs/re-notes-kernel.md` 与 `docs/game-mechanics.md`。
>
> 更新日期：2026-08-29

## 一、项目稳定事实

- 项目目标：不用模拟器，以 **原生 JavaScript ES Modules + Canvas 2D** 重写 1995 DOS《臥龍傳》。无框架、无构建、无 npm 运行时依赖。
- 仓库根目录：`E:/Dragon/web-port`；原版程序和真实运行数据位于 `E:/Dragon/Dragon/`。
- 官方基准在 `E:/Dragon/原版/`；`上/中/下/后/` 是爱好者改版剧本。运行中的真实剧本/存档是：
  - `E:/Dragon/Dragon/SINARIO.DAT`
  - `E:/Dragon/Dragon/SAVE.DAT`
- `web/data.json` 是由五组目录合并出的 20 章数据；修改解析器后必须重新生成，不能手改输出代替修复解析器。
- 游戏逻辑分辨率为 **640×400**。战略地图用 `#cv`，标题与开局菜单用独立画布 `#startv`。
- 原版 `SAVE.DAT` 为 4 槽，每槽 `0x56C0` 字节，总长度 `4 * 0x56C0`。自动化测试不得写真实存档。
- BGM 不复刻；PC Speaker 风格 SFX 已接入 WebAudio。
- 更完整的数据格式、逆向地址和治理/外交公式以 `AGENTS.md` 和逆向文档为准，本文件不重复维护。

## 二、当前架构

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js` | 应用装配、主循环、剧本/存档加载、返回标题和跨模块状态清理 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、系统选单及主要 Canvas 弹窗、菜单层级和地图锁定 |
| `web/src/ui/startmenu.js` | 标题 YES/NO、章节/读档/势力/军师流程及通用 `prompt()` 弹窗 |
| `web/src/ui/hud.js` | 遗留 DOM HUD、列表/NPC 提示；`closeAll()` 用于切场景时清理 |
| `web/src/game/clock.js` | 战略历法、五档战略速度、兼容旧暂停接口 |
| `web/src/core/modalclock.js` | 模态窗口暂停/恢复战略时钟，保存速度档和原暂停状态 |
| `web/src/render/battleview.js` | 战术画面、五档战术倍率、战斗期间接管战略时钟 |
| `web/src/game/savegame.js` | SAVE.DAT 解析/序列化、会话内完整存档镜像与槽位 patch |
| `web/src/core/speaker.js` | SFX、静音及 TYPE 1..4 音色配置 |
| `tools/webserver.py` | 静态服务器、`/api/save` 和 `/api/saves.json` |
| `docs/re-notes-kernel.md` | KI.EXE 与数据格式逆向细节 |
| `docs/game-mechanics.md` | 游戏机制与逆向结论互证 |

### 时钟模型

- `clock.strategicSpeed` 是合法速度档索引 `0..4`：最低、低、普通、高、最高。
- 战略步长为 `[480, 280, 160, 80, 25]` ms/刻度。
- 兼容旧调用的 `clock.speed`：
  - 写入 `0` 表示暂停；
  - 写入 `1..5` 映射到战略速度 `0..4`；
  - 因此最低战略速度不再与暂停 sentinel 冲突。
- `clock.hold` 用于菜单、弹窗和返回标题期间的绝对冻结；不要用修改速度档来代替 hold。
- 战术速度完全独立：倍率 `[0.5, 0.75, 1.0, 1.5, 2.5]`，只影响战斗步进和动画。

### UI 与交互约定

- 全游戏不增加关闭按钮；弹窗和二级界面使用鼠标右键逐层回退。
- 军师菜单由羽扇图标乒乓开关；关闭父菜单时必须清理全部子孙窗口、选中状态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白处左键不承担关闭或取消功能。
- 系统选单及 SAVE/LOAD 子窗口打开时必须保持 `clock.hold = true`。
- 游戏内读档不得直接替换当前 scenario；确认后必须通过 `returnToTitle(1)` 回标题，再由 StartMenu 读档。
- Canvas 列表滚动条统一在右侧；中文按钮使用全角空格，如 `確　認`、`取　消`。
- 标题存档空槽显示 `（未使用）`，必须带 `disabled` 并在 hover、hit-test 和点击路径中全部拒绝选择。

## 三、常用命令

在 `E:/Dragon/web-port` 执行：

```bash
python tools/webserver.py 8321
# 浏览器：http://127.0.0.1:8321/

# JS 语法检查；项目 .js 使用 ESM，复制为 .mjs 再检查最稳妥
cp web/src/ui/gamebar.js /tmp/gamebar.mjs
node --check /tmp/gamebar.mjs

git diff --check

# 浏览器回归；/api/save 已 mock，不会改真实 SAVE.DAT
playwright-cli open http://127.0.0.1:8321/ --browser=chromium
playwright-cli run-code --filename=tools/verify_system_menu.js
playwright-cli run-code --filename=tools/verify_clock_pause.js
playwright-cli close

# Node 回归
node tools/verify_save_buffer.mjs
node tools/verify_startmenu_empty_slot.mjs
node tools/verify_sound_profiles.mjs
```

提交前还应执行变更文件 LSP/diagnostics，并确认 `git status` 只有预期产品代码、测试和文档。

## 四、重要坑点与设计禁区

1. **禁止测试改写真实存档**
   - 浏览器保存测试必须 mock `/api/save`；不要让测试请求落到 `E:/Dragon/Dragon/SAVE.DAT`。

2. **不要恢复游戏内直接读档**
   - 旧 HUD 的 `showLoadDialog()` 会就地调用 `app.loadSave()`，容易残留军团、事件、音效、视图和 UI 状态，现已删除。

3. **最低速不是暂停**
   - 不能再用 `speed === 0` 同时表达最低速度和暂停。模态恢复应保存 `{ strategicSpeed, legacyPaused }`，不要只保存旧 `speed` 数值。

4. **连续保存必须基于最新会话镜像**
   - 每次从启动时的 SAVE.DAT 底版重新序列化，会覆盖本会话刚写入的其他槽位。`savegame.js` 的 `saveImage` 必须持续作为最新完整镜像。

5. **返回标题必须彻底清场**
   - `returnToTitle()` 要冻结旧场景，并清理 GameBar、HUD、选中据点、弹窗、事件、战斗/外交视图和 dispatch 状态；遗漏句柄会在下一局留下脏状态。

6. **浏览器模块缓存会造成假回归**
   - 修改 JS 后仅 reload 可能仍使用旧模块。结果异常时关闭 Playwright 会话后重新 open。

7. **LSP 可能出现过期伪诊断**
   - 无 tsconfig 时 TypeScript 服务偶尔报告超过文件实际 EOF 的 `hud.js` 错误。先以 `node --check` 验证真实语法，再重启/刷新 LSP；不要为不存在的行改代码。

8. **测试脚本格式**
   - `playwright-cli run-code` 文件当前通过全局函数形式运行；修改后应保证结尾分号和 `node --check` 通过。

9. **临时产物不提交**
   - `docs/test_*.png`、`.playwright-cli/`、`test-artifacts/`、日志和代理缓存均为本地产物。稳定回归脚本应提交，过程截图不提交。

10. **旧存档兼容仍有历史风险**
    - 旧存档的 `scenario_idx` 与后来的 20 章合集可能错位，尚未专项迁移。

## 五、本轮 Checkpoint

### 本轮目标

- 审查并完成系统选单、SAVE DATA、安全读档、五档战略/战术速度和音效 TYPE 1..4。
- 修复审查发现的暂停 sentinel、空存档槽、直接游戏内读档、连续多槽保存和返回标题残留问题。
- 建立不会破坏真实 SAVE.DAT 的耐久回归，完成 Git 提交并推送。
- 本次文档整理目标：删除旧 journal 中重复的尺寸、颜色、一次性验证过程和已完成任务清单，保留可长期复用的项目记忆。

### 已完成工作

- 系统选单 6 项已闭环：`資料儲存`、`存檔讀取`、`音效`、`戰略速度`、`戰術速度`、`遊戲結束`。
- SAVE DATA 支持 4 槽显示、空槽、日期、覆盖保存及连续保存多个槽位。
- 游戏内读档增加防丢失确认：取消返回系统选单；确认调用 `returnToTitle(1)` 并直达标题读档流程。
- 标题读档中的未使用槽位不可 hover/选择。
- 战略速度改为独立 `0..4` 档；旧 `clock.speed=0` 暂停兼容保留，最低速可正确暂停/恢复。
- 战术速度独立于战略速度，战斗结束后恢复进入战斗前的战略速度和暂停状态。
- `returnToTitle()` 与 `HUD.closeAll()` 增强，遗留 HUD 直接读档控件和 DOM 已删除。
- TYPE 1..4 已接入四组实际不同的声音 profile。
- 新增 5 个回归脚本：
  - `tools/verify_system_menu.js`
  - `tools/verify_clock_pause.js`
  - `tools/verify_save_buffer.mjs`
  - `tools/verify_startmenu_empty_slot.mjs`
  - `tools/verify_sound_profiles.mjs`
- 回归、语法检查、LSP、`git diff --check` 已通过；提交 `1b5a527` 已推送至 `origin/main`。

### 关键决策

- 游戏内读档一律返回标题后执行，不接受当前场景热替换。
- 菜单冻结使用 `clock.hold`，旧模态暂停使用独立 paused state，速度档本身永远是合法游戏设置。
- SAVE.DAT 更新采用“完整会话镜像 + 单槽 patch”，确保多次保存不回退其他槽。
- 自动化只保留可重复、带断言且不碰真实存档的脚本；运行截图不作为版本资产。
- 系统选单功能已完成，后续主线转向战术战斗底层机制，不继续扩展一次性系统选单样式细节。

### 失败尝试

- 曾让 `Clock.speed` 的 `0` 同时代表最低档和暂停，导致最低档主循环停住、模态恢复后永久暂停；已通过速度档/暂停分离解决。
- 曾在 HUD 中直接 `app.loadSave()`，造成跨场景状态残留风险；已移除并统一走返回标题流程。
- 曾以启动时 SAVE.DAT 底版逐次保存，第二次保存会抹掉第一次写入的槽；已改为会话镜像。
- 曾只根据槽记录是否存在判断可选，导致 `played=false` 空槽仍可点击；现使用显式 `disabled`。
- 曾在返回标题后让旧场景继续运行；现标题流程全程保持 clock hold，并清理活动视图。
- Playwright 的 request 监听一度挂得过晚，无法稳定统计 save 请求；现监听在页面导航和 route 测试前注册。

### 相关文件

- 产品代码：
  - `web/src/ui/gamebar.js`
  - `web/src/ui/startmenu.js`
  - `web/src/ui/hud.js`
  - `web/src/main.js`
  - `web/src/game/clock.js`
  - `web/src/game/savegame.js`
  - `web/src/core/modalclock.js`
  - `web/src/core/speaker.js`
  - `web/src/render/battleview.js`
  - `web/src/render/diploview.js`
  - `web/src/render/openview.js`
  - `web/src/render/endview.js`
  - `web/index.html`
- 测试：`tools/verify_*.js`、`tools/verify_*.mjs` 中上述 5 个脚本。
- 文档：`AGENTS.md`、`docs/game-mechanics.md`、本文件。

### 当前状态

- `main` 与 `origin/main` 当前提交均为 `1b5a527`，系统选单与安全存读档主线已完成并推送。
- 最近一轮自动格式化/诊断后，工作区又出现少量**未提交格式变更**：
  - `docs/game-mechanics.md`
  - `tools/verify_clock_pause.js`
  - `tools/verify_save_buffer.mjs`
  - `tools/verify_system_menu.js`
  - `web/src/core/modalclock.js`
  - `web/src/ui/gamebar.js`
  - `web/src/ui/hud.js`
- 这些变更目前看是空行、缩进、换行和分号整理，不应误当成新的产品功能；开始下一项开发前应先复查并决定提交或还原。
- 本文件重写后也属于新的未提交文档变更。

### 阻塞点

- 产品功能无阻塞。
- 流程上的唯一阻塞是当前工作区不干净：必须先处理上述格式变更和本 journal，避免与下一轮战斗系统改动混在一起。
- 历史兼容风险：旧存档 `scenario_idx` 与 20 章合集可能错位，但不阻塞当前新游戏和本轮系统选单功能。

### 下一步

1. 审查当前格式化差异，运行 `node --check`、LSP 和 `git diff --check`，将纯格式整理与本 journal 单独提交或还原。
2. 开始主线：逆向并完善遭遇战/攻城战底层机制，优先确认：
   - 战术 AI 行为状态机；
   - 兵种克制与伤亡/士气公式；
   - 突击决算、城门和守城判定；
   - 五军指令、撤退和战斗结束状态回写。
3. 为战斗机制新增纯函数或可注入 RNG 的单元回归，再补 Playwright 战斗层冒烟测试。
4. 次要方向：完善 AI 月度主动外交（遣使、宣战、停战、请援）。
5. 非主线且暂不处理：BGM、旧存档章节索引迁移、自创军师命名。
