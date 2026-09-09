# 臥龍傳 Web · Checkpoint Journal

> 更新时间：2026-09-09
>
> 用途：记录本轮会话的实现、调试、失败尝试、验证、当前阻塞和下一步。长期稳定规则见`../AGENTS.md`，地址级证据见`re-notes-*.md`与`E:/Dragon/.agents/skills/`。

## 1. 本轮范围

本轮从开局军师界面延伸到战略内政与委任表现，主要处理：

1. 原版规格的军师确认窗与现代Web自定军师输入；
2. 内政官申请资金的底部报告、朝堂议政与双人对白；
3. 玩家确认的默认军师不能再作为普通武将参与操作；
4. 委任攻城接触位置及野战胜方战后续行；
5. 战略地图逐RAF重绘、道路移动插值和接战动画连续性。

本轮不宣称整个战略/战术系统已完全等价于原版；未闭合项继续按「推断/未知」处理。

## 2. 已完成进展

### 2.1 开局军师确认与自定输入（已提交）

- 军师确认窗依据`KI.EXE 0x8F37`改为240×192金框、224×176内区；君主/军师头像均为64×64，并重排首都、武将数、据点数和两个按钮。
- 自定军师不再使用`END_S15.DAT`选字板，改用Canvas上方的原生DOM输入框，以支持系统中文输入法。
- 军师名与别号均必填；等效宽度上限为6单位（全角2、半角1），即最多3个全角字符或6个半角字符。支持Enter确认、Esc/右键取消。
- 自定军师保持独立对象`{custom:true,general_idx:null,name,hao,portrait}`，姓名不参与武将身份寻址；简繁中文和其他Unicode文本由IndexedDB JSON无损保存。
- 已验证`createNewGameScenario → snapshotState → applyWebMetaToState → getAdvisor`后名称、别号、头像及`custom`标记一致。
- 已提交：`4a6098d feat: replicate advisor confirmation dialog and modernize custom advisor input`。

### 2.2 内政官资金申请UI与资源修正（未提交）

- TALK56“前来报告现状”已改为复用统一底部`generalCard`系统消息框，不再新增顶部报告窗。关闭报告卡后才进入朝堂议政。
- `_drawProposalAudience()`在`budget_report`阶段不再重复绘制窗口；进入朝堂前清除报告卡，避免两个体系叠画。
- `showNpcMessageDialog()`增加可见文本守卫：空字符串、空token或纯空白消息不创建头像空框；若存在`onClose`则直接续行。`_showBudgetReportCard()`返回是否真正显示，未显示时不等待3秒。
- `IVENTGRF.DAT`提取纠偏：原脚本把288×176插图误按交错格式解成288×352并拉伸。根据`0xFA37`的`ax=0xB012`，`tools/parse_kyoivent.py`现只输出原生288×176的canonical `ivent_0/1/2.png`；六个无引用且内容重复的`_a/_b`别名已删除。
- 朝堂背景和传统进言背景均按288×176原寸绘制；内政官在左上、君主在右下。第3步显示答应/提示金额/拒绝；选择后按两轮对白推进并保留前一方发言。
- TALK解析中据点名使用土橙`#c08020`；金额数字标记`isNum`，由DIN/Oswald以`#ffd700`绘制。

### 2.3 默认军师排除普通武将操作（未提交）

- 新增`commands.js::isPlayerAdvisorGeneral(sc,general)`，同时检查`general.is_player`和非自定`player_advisor.general_idx`，确保读档身份标记重建前也不会短暂进入候选。
- 已从武将一览、编成、内政官任命、外交官任命、旧自动出征、旧遣使和玩家势力AI选将中过滤已确认的默认军师。
- 全新浏览器确认该军师在武将、编成、内政官、外交官四个可见列表中均不存在。

### 2.4 委任攻城接触位置与野战续行（未提交）

- 用户发现攻城时攻方标识/48×48接战动画伸入据点。重新核对`0x26FF→0x2708→0x274C..0x275E→0x2880`：候选道路点先检查军团，随后在status bit0已置位且tile为`0xCE..0xDD`时检查edge端点城；敌城返回发生在坐标写回之前。
- 扫描原始`MMAP.MAP`及E717资产：254条edge首末共508格均为`0xCE..0xDD`据点边界tile，5526个边内点没有其他中段命中。因此起点首格可以消费，敌城末端边界格不能消费。
- `ai.js`新增`siegeApproachCity()`，在候选点坐标写回前判断攻城；保留`pointIndex===points.length`旧Web快照兼容重检。反向路径也允许从旧终点状态正确回退。
- 浏览器构造同一目标城时，城坐标`(225,107)`、不可消费边界点`(226,107)`、攻方停在`(227,107)`，显示间距32px，接战动画不再伸入城内。
- 野战胜方约停1秒的根因是Web统一写`cooldown=8`。`0x5130→0x474A→0x6FD2/0x701D`只写原始`+0x0B=1`，下一自身槽减至0后同槽继续；Web动作前检查模型的等价值是`cooldown=0`，现已修正。

### 2.5 战略逐帧重绘与道路移动连续性（未提交）

- 用户观察到军团像每天才更新一次、道路移动跳格、接战动画瞬间播放完。
- 根因：`HUD`构造时没有初始化`dialogCount`，值为`undefined`；主RAF使用严格条件`dialogCount === 0`，导致规则时钟正常推进，但地图进入暂停分支，只在日期变化时重绘。
- `hud.js`现显式初始化`dialogCount=0`；`main.js`同时以`(app.hud?.dialogCount ?? 0) === 0`防御缺省状态。
- `clock.js`新增浏览器RAF入口`advanceFrame(dtMs)`：每RAF最多一个战略更新；延迟/后台帧丢弃整帧欠账，只保留小于step的相位。原`advance()`继续供受控测试完整消费dt。
- `mapview.js`按`0x25A3`每次扫描16/128军团槽的调度事实，把一个道路点位移铺满8个战略更新间隔。仅Canvas插值改变，规则坐标、寻路、RNG和战果未改。
- 全新Chrome实测：无模态时`dialogCount=0/hold=false`，350ms内21次Canvas绘制；最高速单步`curT`约为`0.19/0.36/0.40/0.57/0.73/0.77/0.95/1.00`，约8个可见采样完成，没有整步跳跃。

## 3. 调试过程与失败尝试

1. **把前台Web服务误判为卡死**

   `tools/webserver.py`使用前台`serve_forever()`，正确启动命令是`python tools/webserver.py 8321`。早期无端口启动及访问`localhost:8000`失败，随后发现8321存在多个重复监听；清理旧实例后保留单一服务。以后启动前先检查PID和端口占用。

2. **空白内政官头像框被误判为重复入队**

   排查确认`enqueueDomesticBudgetReport()`只入队一次，`_drainStrategicMessages()`也只进入预算分支；TALK56格式化结果有可见文本。问题处理方式是统一报告卡路径并对空内容做入口守卫。全新浏览器重新触发后只出现一个带完整文字的底部框。

3. **原始插图尺寸误判**

   旧提取器输出288×352并由浏览器缩放，造成朝堂图像失真。重新检查原始blit尺寸后撤销交错解码，改为288×176原寸输出。

4. **攻城仅在`pointIndex===length`判断过晚**

   旧Web先消费据点边界点再攻城，单纯改视觉偏移会让规则坐标继续错误。最终在候选点写回前按原始tile与edge端点检查，而不是用渲染补丁掩盖。

5. **战略动画问题最初看似速度过快**

   实际根因是RAF绘制门控失效，不是道路规则或速度公式。先修`dialogCount`后再加单RAF规则预算及只读插值，避免通过减慢规则tick掩盖问题。

6. **无关格式化diff**

   pi-lens曾自动格式化八份与本轮功能无关的战术验证脚本。审查确认后已逐文件恢复，未整体reset，也未覆盖本轮功能修改。

7. **浏览器时钟测试曾是假成功入口**

   旧`verify_clock_pause.js`只定义全局helper，直接以Node执行会零断言退出。现改为`clock_pause_browser_helper.cjs`，由`verify_battle_browser_acceptance.mjs`在隔离profile和临时服务器中真实调用；首次接入还暴露了测试错误地期待单个战略tick改变小时，已改为校验`strategicTickSerial`精确增加1。

## 4. 相关文件

### 产品代码

- `web/src/ui/startmenu.js`：军师确认窗和自定输入（已提交）。
- `web/src/ui/gamebar.js`、`web/src/game/talk.js`：TALK56底部报告、朝堂对白、token颜色与数字字体。
- `web/src/ui/hud.js`：默认军师列表过滤、`dialogCount=0`初始化。
- `web/src/game/commands.js`、`diplomacy.js`、`ai.js`：军师候选排除、战略AI及委任攻城/战后续行。
- `web/src/game/clock.js`、`web/src/main.js`、`web/src/render/mapview.js`：RAF预算、持续重绘和道路点插值。
- `tools/parse_kyoivent.py`、`web/grf/ivent_0/1/2.png`：三张288×176议政插图提取与canonical产物。

### 重点回归

- 内政/消息：`verify_budget_message_ui.mjs`、`verify_domestic_budget_event.mjs`、`verify_domestic_governance.mjs`、`verify_strategic_message_fifo.mjs`。
- 军师/外交：`verify_diplomacy_runtime.mjs`、`verify_legion_command_state.mjs`。
- 行军/战果：`verify_engagement_state.mjs`、`verify_field_result.mjs`、`verify_road_graph.mjs`、`verify_march_navigation.mjs`、`verify_delegated_autobattle.mjs`。
- RAF/UI：`verify_clock_transition.mjs`、`clock_pause_browser_helper.cjs`（由browser acceptance调用）、`verify_battle_browser_acceptance.mjs`。
- 资源迁移：`verify_kyoivent_assets.py`锁定三张canonical插图的尺寸、RGB像素哈希及旧别名删除。

### 证据文档

- `../AGENTS.md`
- `re-notes-march-pathfinding.md`
- `E:/Dragon/.agents/skills/re-march-engagement/SKILL.md`

## 5. 验证记录

- 已通过：
  - `verify_budget_message_ui.mjs`
  - `verify_domestic_budget_event.mjs`
  - `verify_domestic_governance.mjs`
  - `verify_diplomacy_runtime.mjs`
  - `verify_legion_command_state.mjs`
  - `verify_engagement_state.mjs`
  - `verify_field_result.mjs`
  - `verify_road_graph.mjs`
  - `verify_march_navigation.mjs`
  - `verify_delegated_autobattle.mjs`
  - `verify_clock_transition.mjs`
- 最终工作树完整执行：98项`verify_*.mjs`、9项`verify_*.py`及`verify_battle_viewport.js`全部通过。
- `verify_battle_browser_acceptance.mjs`使用全新Chrome 152隔离profile和临时端口，现同时真实执行战略时钟/RAF回归；三尺寸panel验收也包含在98项MJS中。
- 23个本轮相关JS/Python文件primary LSP零诊断；`lens_diagnostics mode=all`无blocking，仅报告一个已恢复且未改动的旧战术验证脚本`console.log` warning。
- `git diff --check`通过，仅有仓库既有LF/CRLF转换提示。
- 浏览器证据位于系统临时目录；本地profile、代理缓存、日志、PID、截图和一次性脚本均未纳入提交。
- 全程未读取或写入`E:/Dragon/Dragon/SAVE.DAT`。

## 6. 当前状态与阻塞

- 仓库：`E:/Dragon/web-port`
- 分支：`main`
- 本批基线：`4a6098d`；最终提交以`git log`为准。
- 全部已改动和未跟踪文件已审查：保留产品代码、focused tests、资源迁移与必要文档；恢复八份纯格式化噪声；删除六份废弃图片别名；所有本地profile、代理缓存、日志、PID、截图和一次性脚本继续由`.gitignore`排除。
- 暂无代码或测试阻塞；本批已获用户明确授权提交并推送。

## 7. 下一步

1. 长时运行第一章，覆盖内政官预算耗尽、type4零建议额、批准/拒绝/自定义金额、月结政策边界和保存禁止条件。
2. 在五档速度下持续观察多军团行军、道路接敌、攻城边界、接战四相和野战胜方立即续行，确认无后台RAF恢复追赶。
3. 复核旧IndexedDB快照的`pointIndex===points.length`兼容路径与默认军师读档身份重建。
4. 后续修改继续避免夹带自动格式化、本地运行产物和浏览器profile；提交前保持同一审查口径。
5. 战术长期未闭合项继续记录在`re-notes-tactical-*`，不要重新塞回本journal：E04A scratch来源、首DDB4前VGA来源、B533完整伤害/交换、CBE5身份不变量、命令9/10可达性及受控DOSBox逐帧差分。
