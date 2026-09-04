# 臥龍傳 Web · Checkpoint Journal

> 本文只记录当前未提交会话的详细进展、调试过程、失败尝试、相关文件、验证、阻塞和下一步。
> 长期项目事实、架构、命令和约定见`../AGENTS.md`；稳定逆向证据见`re-notes-*.md`和`E:/Dragon/.agents/skills/`。

## 1. 本轮目标与当前状态

本轮围绕第一章曹操—吕布战局，完整复核并修正委任战斗和战后战略链：

- 无目标守军错误主动出城；
- 道路野战、真实驻军攻城和空城临时城防分流错误；
- 攻城接触倒计时反复重置，导致无动画、无音效、无战果；
- 高速档进入战斗后同一RAF仍继续推进战略时间；
- 连续战斗后胜负、六队、主守军、目标和道路上下文丢失；
- 败军被误判歼灭、卡在边内、直接跳回据点或一律直奔首都；
- 破城迁都、守军撤退、胜军入城和地图拾取异常；
- 接战音效预载、地图道路标识位置和若干列表/标题表现问题。

规则实现与focused regression已完成；当前没有代码或逆向硬阻塞。剩余必要工作是整理未提交diff，并在全新浏览器会话中复跑真实战局。

## 2. 详细进展

### 2.1 战型入口与守军行为

- 删除无原版依据的军团级`scanThreat()`主动出城路径。无目标军团保持驻城，目标仅由据点AI或`0x4325`状态机写入。
- 重新闭合入口：
  - 道路边点接触：`0x2708→0x2831→0x4A7B→0x5130(AL=1)`；
  - 敌城端点：`0x2880→0x4ADE→0x4C72→0x4ED7/0x4F8A→0x5130(AL=0)`。
- `roadgraph.js::orientedEdgePoints()`不再把据点中心追加到边点列。旧行为会让`0x2831`误把驻城守军当道路野战。
- `stepRoadGraph()`改为先走完纯边内点，再在下一军团槽切换edge端点；敌城端点进入攻城，未开战第三方仍按`0x42AB`反转。
- 空城不再直接占领：`0x4F8A`按当前城兵生成六队弓兵临时城防，余数从前队分配。
- NPC-NPC和玩家委任共用同一`0x5130`；委任只控制是否进入玩家战术层，不改变mode和战果公式。

### 2.2 战略速算输入与军团身份

- `autobattle.js`直接读取完整六队原值；`legion.troops`暂时与六队和不一致时不再均分重建。
- `selectPrimaryLegion()`按原版军团槽比较，同评分保留低槽。
- `generalForLegion()`统一以`generalIdx`解析主将；删除“运行期slot可当武将索引”的错误兼容。
- 用第一章程昱/吕布和曹仁/张辽样本机械代入后确认：mode 0公式本身支持守方获胜，旧失城来自错误战型和守军状态，而非需要另补公式。

### 2.3 攻城卡死、过渡和时钟

- 拆分端点后，攻城接触发生在`_march.pointIndex===_march.points.length`。旧`currentEngagement()`因不存在下一边点而清接触，每轮重建倒计时12。
- 现由`_march.toNode`持续重检敌城端点，倒计时可正常递减并进入四相与结算。
- `GameBar.syncClock()`将`battleView.active`和`engageTransition.active`纳入hold。
- `Clock.advance()`每次战略tick后立即同步hold；战斗或过渡在高速catch-up中建立后，同一RAF立即停止继续推进。
- 接战四相保持`0→1→2→3`，当前间隔165ms。标题首次用户手势解锁音频，`ensureGameAssets()`预载四图和音效，帧回调只同步起播已缓存Buffer。

### 2.4 战后、撤退与连续战斗

- `settleFieldLegion()`在清导航前保存战败瞬间edge、stride、pointIndex和points；战果后不得再次统一清理，避免擦掉新撤退路线。
- `aiTick()`同步战果返回后只清仍等于旧攻击目标的命令；若`0x474A`已写入撤退目标则保留。
- 野战胜方保留原进攻目标与道路上下文，并在下一军团槽继续后续接敌/攻城；发生战果的当前槽立即结束。
- `legionAtTargetNode()`在存在实体target时按实际坐标判断，避免缓存节点号令边内撤退提前完成。
- 边内临时撤退导航加入save sidecar，读档后继续沿原edge移动。
- `0x474A`硬失败条件修正为：士气0、首队0或`0x487B`无合法退路。总兵`<=300`不是歼灭条件。
- 最新复核明确两阶段撤退：
  1. `0x487B`先写当前edge的即时己方退点；
  2. 总兵`<=300`或退点即首都写状态10，否则状态8；
  3. 状态10也先到即时退点，随后`0x4325→0x44A9`才改目标返首都。
- 撤退瞬移根因是`stride=-4`时有向points首尾与结构`edge+8/+6`相反。旧实现按数组首尾猜端点，在城前可一步跨越整条边。
- 现通过`roadEdgeById()`读取原始source→target点列，固定按结构`+8→+6`构造候选和切片；端点中心不提前混入points。
- 按`0x6FD2@0x701D`的`+0x0B=1`取消败军额外12槽冷却，成功撤退者下一槽即开始逐点移动。
- 新增全254边×双方向属性回归：撤退目标必须是己方端点，所有相邻规则步Chebyshev距离`<=2`。

### 2.5 破城、迁都与地图状态

- 原首都失陷后改用`0x4DF0→0x6A3D`选择新首都，再执行`0x4DA4`同城守军撤退；不再简单取最低idx。
- 攻城胜军入城后同步`x/y`、`prevX/prevY`、`target`、`targetCity`和`targetNode`。
- `MapView.pick()`允许点击独立显示的活动军团，包括战后冷却和状态机等待军团；同势力据点中心驻军仍从据点入口打开。
- 无目标活动军团使用MMAP.MCH驻止帧，不再画4px小圆点。
- 行军虚线恢复，但只读导航状态。显示补偿统一为水平Y `+3px`、垂直X `+2px`，斜段平滑；规则坐标和道路图不变。

### 2.6 UI与标题表现

- 首页`loginbg.jpg`使用左上对齐、`cover`、不重复，非16:10窗口不拉伸变形。
- 所有带表头Canvas列表使用24px表头；驻军据点“據點／軍團”等选择弹窗统一24px行高。
- 表头排序支持升/降序、中文和数字比较、占位行末置，并保持选中对象身份。
- 地图只保留一个跟随鼠标的游戏光标；已选据点中心框保留。

## 3. 调试过程与失败尝试

- 初期只核对`0x5130`公式，focused测试通过但真实战局仍失城。运行态显示程昱、曹仁已离开据点，最终定位为错误主动出城和错误战型入口。
- 曾依据Web点列误以为据点中心真实军团应先进入mode 1野战；E717/E961数据证明边内点与节点中心完全分离后撤销该结论及错误测试。
- 攻城卡死一度被误归因于音效或过渡；实际是倒计时在edge端点被每轮清除重建。
- 高速档计时继续不是`battleView`未设置暂停，而是同一`Clock.advance()`catch-up循环在下一RAF前继续执行。
- 边内败军曾只保存显示`_path`而清空`_march`，从非节点坐标无法重新寻路，进而卡住或错误进入`0x291A`。
- 曾把所有战败理解成“朝首都撤退”，但进一步反汇编确认首次目标是即时己方退点；状态10才在抵达后开启第二段首都路线。
- 撤退瞬移不能由Canvas插值修复；真正错误是`stride=-4`端点与点列配反。表现插值只能投影相邻规则步，不能掩盖整边跳跃。
- 浏览器旧ESM曾造成修复后仍复现旧行为；最终现场验证必须使用全新会话，而不是普通reload。
- pi-lens可能给验证脚本带来无关格式diff；工作区不能整体reset，只能定点恢复确认无关的噪声。

## 4. 主要相关文件

### 规则与实现

- `web/src/game/ai.js`
- `web/src/game/roadgraph.js`
- `web/src/game/autobattle.js`
- `web/src/game/savegame.js`
- `web/src/game/clock.js`
- `web/src/game/engagetransition.js`
- `web/src/core/speaker.js`
- `web/src/main.js`
- `web/src/render/mapview.js`
- `web/src/render/battleview.js`
- `web/src/ui/gamebar.js`
- `web/src/ui/startmenu.js`

### 重点回归

- `tools/verify_autobattle.mjs`
- `tools/verify_delegated_autobattle.mjs`
- `tools/verify_engagement_state.mjs`
- `tools/verify_field_result.mjs`
- `tools/verify_siege_result.mjs`
- `tools/verify_postbattle_fate.mjs`
- `tools/verify_march_navigation.mjs`
- `tools/verify_retreat_restore.mjs`
- `tools/verify_battle_clock_hold.mjs`
- `tools/verify_clock_transition.mjs`
- `tools/verify_engage_transition.mjs`
- `tools/verify_engage_sfx_asset.mjs`

### 逆向文档

- `docs/re-notes-march-pathfinding.md`
- `docs/re-notes-kernel.md`
- `E:/Dragon/.agents/skills/re-battle-command/SKILL.md`
- `E:/Dragon/.agents/skills/re-march-engagement/SKILL.md`
- `E:/Dragon/.agents/skills/re-post-battle/SKILL.md`
- `E:/Dragon/.agents/skills/re-data-formats/SKILL.md`

## 5. 验证状态

最新验证已完成：

- 79个`tools/verify_*.mjs`全部通过；
- 4个`tools/verify_*.py`全部通过；
- `verify_battle_viewport.js`通过；
- `verify_clock_pause.js`通过；
- 汇总结果：`ALL_OK`；
- 本轮相关JS/MJS文件LSP：0 diagnostics；
- `lens_diagnostics mode=all`：本轮文件无问题；
- `git diff --check`：通过，仅LF/CRLF提示。

这些结果覆盖focused规则和状态回归，但不能替代最终浏览器真实战局验证。

## 6. 当前工作区、阻塞与风险

- 本轮整合基线：`f3b4f26 fix: align delegated battles with original rules`；本journal随本轮完整提交归档。
- 工作区包含大量未提交的功能、测试、资源和文档修改；禁止整体回退用户已有修改。
- 当前无逆向或实现硬阻塞。
- 实际剩余风险：
  - 用户浏览器可能继续运行旧ESM；
  - 第一章长期战略调度尚未在最终代码上完整复跑；
  - NPC-NPC道路野战、真实驻军攻城和空城临时城防仍需长期运行态抽查；
  - 审查确认`NUL`、`web/grf/ChatGPT Image ...png`和未引用的`web/grf/ui/login.jpg`均为本地/重复产物，已排除；产品只保留实际引用的`web/grf/ui/loginbg.jpg`。

## 7. 下一步

1. 审查完整工作区diff，区分功能修改、用户资产和自动格式化噪声；只定点处理确认无关内容。
2. 启动新静态服务并使用全新Playwright profile复跑第一章：
   - 选择曹操，编成程昱/曹仁军团并驻陈留、谯；
   - 等待吕布、张辽进攻；
   - 确认驻军不主动出城，真实守军进入mode 0；
   - 确认倒计时、四相音效和战略暂停；
   - 确认败军先逐点退来路己方据点，状态10再二段返首都；
   - 确认胜军入城、败军可点击、无无目标圆点。
3. 长期运行抽查NPC-NPC道路野战、真实驻军攻城和空城临时城防。
4. 浏览器通过后，重新运行全量回归、LSP、Lens和`git diff --check`，再更新本journal的最终证据。
5. 未经用户明确要求不提交、不推送远端。
