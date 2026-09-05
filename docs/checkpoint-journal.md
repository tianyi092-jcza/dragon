# 臥龍傳 Web · Checkpoint Journal

> 本文记录本轮会话的详细进展、调试过程、失败尝试、相关文件、验证、阻塞和下一步。
> 长期项目事实、架构、命令和约定见`../AGENTS.md`；稳定逆向证据见`re-notes-*.md`和`E:/Dragon/.agents/skills/`。

## 1. 本轮目标与状态

本轮围绕第一章曹操—吕布战局，复核并修正委任战斗、战后战略链和相关UI：

- 驻城军团无故出城或返都；
- 道路野战、真实驻军攻城、临时城防分流错误；
- 接战倒计时、四相动画、五声音效和战略暂停异常；
- 连续战斗、败退、返都补员、NPC解散、破城迁都及守军组撤退；
- 军师一级菜单横向误拦截地图；
- 普通武将与编成候选列表显示隐藏战斗专长。

实现、全量回归和工作区审查已完成，当前无硬阻塞。本轮已按用户授权整理为一个完整提交并推送到`origin/main`。长期运行第一章真实战局仍是后续复核项。

## 2. 本轮实现

### 2.1 战型、行军与接战

- 删除无原版依据的军团级主动出城扫描。无目标军团保持驻城，目标只由据点AI或`0x4325`状态机写入。
- `roadgraph.js::orientedEdgePoints()`不再把据点中心混入边点列；`stepRoadGraph()`先走完边内点，再在下一军团槽处理端点。
- 下一道路边点有敌军时进入野战；敌城端点进入真实驻军攻城；无真实守军时按当前城兵生成六队步兵临时城防。NPC-NPC与玩家委任共用`0x5130`。
- 速算直接读取完整六队；主守军按原版军团槽评分选取。同分保留低槽，主将统一使用`generalIdx`。
- 修复端点攻城接触每轮被误清并重建倒计时的问题。接触建立当轮即按`+3`低两位显示四相，结算只保留单RAF串行gate。
- 五声由`engageSfxBurst()`在同一WebAudio时间轴按82.5ms间隔预排，不再等待`AudioContext.resume/statechange`。保留四张PNG，不改GIF。
- 地图先在攻方军团当前坐标画48×48接战动画，再画同坐标16×16军团标识；不再锚定目标城中心。
- 战略tick建立战斗或结算gate后，`Clock.advance()`在同一高速catch-up循环立即同步hold。

### 2.2 战后、撤退与状态机

- 野战胜方保留原攻击目标和道路上下文，并从下一军团槽继续；战果发生槽不再继续推进。
- 败方在清导航前保存edge、stride、pointIndex和points；战果写入的新撤退路线不再被统一清理覆盖。
- `0x474A`不能继续的条件修正为士气0、首队0或无合法退路；总兵`<=300`不再被误当歼灭。
- 撤退改为两阶段：先沿当前edge逐点到即时己方退点；状态10抵达后再改目标返首都。端点选择读取原始edge结构，避免`stride=-4`整边瞬移。
- 撤退建立后下一军团槽即可移动，删除额外12槽Web冷却；边内临时撤退导航进入sidecar。
- 状态10抵都后无条件转9补员：残兵先并回对应兵种池，再按同兵种队数重分。NPC任一队少于300时转11并在首都解散；玩家势力含委任军团不自动解散。
- 统一原始兵种码：`1=骑`、`2=弓`、`3=步`、`4=空`，同步修正补员、解散返还、AI/玩家编成及军团/战术图标标签。
- 抵达节点后保留目标到下一槽，并写回`roadEdgeOrNode=nodeId*8`；运行态`targetNode`统一使用graph id。此修复解决状态10/9/11抵达后永久卡死。
- 城市attr改为逐槽动态重算。旧代码误读SINARIO `raw[0]`邻接低位，导致椎阳驻军错误走`状态0→1→2→11→返都`；同时修正状态1别名门控方向。

### 2.3 破城与地图状态

- 首都失陷后先按`0x4DF0→0x6A3D`重选首都，再处理`0x4DA4`同城守军组。
- 实际主守军由战后链改命令态；其余同城军团只共享撤退目标和移动标志，不再整组改状态或增加等待。
- 攻城胜军入城后同步坐标、目标和节点状态；战后等待军团仍可从地图点击查看。
- 无目标活动军团使用原版驻止标识；行军虚线恢复为只读导航投影。

### 2.4 军师UI与武将专长

- 一级军师菜单命中统一由`GameBar._hitAdvisorBar()`限制为实际`640×48`矩形；仅展开一级菜单时，同高度左右地图不再被错误消费点击。
- 军团列表低值红字统一为：显示总兵少于3000、士气少于100；边界值保持黑色。
- 普通「武將」和「編成」候选列表新增`攻城/野戰/水戰`三列。数据来自SINARIO武将记录`+0x0E/+0x0F/+0x10`高四位；不存在只有野战、水战两项的情况。
- 两个列表共用九列表头、列布局和行构造，内窗扩为`624×352`；新增列保持数字排序和原对象绑定。240px编成面板保持原屏幕位置，旧/自定义武将缺字段时显示0。

## 3. 调试过程与失败尝试

- 初期只核对`0x5130`公式；focused测试通过但真实战局仍失城。运行态最终证明根因是守军被错误调出和战型入口错误，不是公式缺少加成。
- 曾把据点中心加入道路points并据此判为野战；原始E717/E961拓扑证明节点与边点分离后撤销。
- 攻城卡死曾被误归因于音效或过渡；实际是edge端点没有“下一边点”，接触状态被每轮清除重建。
- 旧1秒启动延迟来自等待音频准备，不是PNG切换；GIF不能修复规则时序问题。
- 高速档继续走时不是`battleView`漏设暂停，而是同一`Clock.advance()` catch-up循环未立即重新检查hold。
- 曾把所有败军直接送首都；反汇编闭合后确认先退即时己方端点，状态10才开启第二段返都。
- 撤退瞬移不能由Canvas插值修复；根因是`stride=-4`有向点列与edge结构端点配反。
- 返都卡死根因是抵达帧过早清`_march/+0x0E`和target，下一槽无法进入状态10/9/11处理器。
- 椎阳驻军返都与攻城失败无关；根因是静态城市字节被误当运行态attr，并叠加状态1门控方向译反。
- 浏览器旧ESM曾制造修复后仍复现的假回归；规则/UI现场验证必须使用全新会话。
- 工作区包含用户已有修改，且pi-lens可能产生格式化噪声；禁止整体reset，只能定点恢复已确认无关内容。

## 4. 主要相关文件

### 实现

- `web/src/game/ai.js`
- `web/src/game/roadgraph.js`
- `web/src/game/autobattle.js`
- `web/src/game/savegame.js`
- `web/src/game/clock.js`
- `web/src/game/engagetransition.js`
- `web/src/game/legionunits.js`
- `web/src/core/speaker.js`
- `web/src/main.js`
- `web/src/render/mapview.js`
- `web/src/render/battleview.js`
- `web/src/ui/gamebar.js`
- `web/src/ui/hud.js`
- `web/src/ui/startmenu.js`

### 重点回归

- `tools/verify_autobattle.mjs`
- `tools/verify_delegated_autobattle.mjs`
- `tools/verify_engagement_state.mjs`
- `tools/verify_field_result.mjs`
- `tools/verify_siege_result.mjs`
- `tools/verify_postbattle_fate.mjs`
- `tools/verify_march_navigation.mjs`
- `tools/verify_legion_command_state.mjs`
- `tools/verify_strategic_city_ai.mjs`
- `tools/verify_engage_transition.mjs`
- `tools/verify_engage_sfx_asset.mjs`
- `tools/verify_advisor_delegation_ui.mjs`
- `tools/verify_general_specialty_columns.mjs`

### 文档

- `docs/re-notes-march-pathfinding.md`
- `docs/re-notes-kernel.md`
- `E:/Dragon/.agents/skills/re-battle-command/SKILL.md`
- `E:/Dragon/.agents/skills/re-march-engagement/SKILL.md`
- `E:/Dragon/.agents/skills/re-post-battle/SKILL.md`
- `E:/Dragon/.agents/skills/re-data-formats/SKILL.md`
- `E:/Dragon/.agents/skills/re-ui-advisor-menu/SKILL.md`

## 5. 验证状态

- 最终完整回归：80个MJS、4个Python及2个JS验证全部通过，汇总`ALL_OK 86`；包含新增的`verify_general_specialty_columns.mjs`。
- 最新23个变更JS/MJS文件主语言LSP：0 errors；`lens_diagnostics mode=all`：无问题；`git diff --check`通过，仅有LF/CRLF提示。
- 全新Chrome已验证：
  - `dragon-fresh-final`：第一章曹操新局可正常进入战略地图；
  - `dragon-engage-visual`：动画锚定攻方、标识后绘制，五声起拍间隔均为82.5ms；
  - `dragon-advisor-hit`：菜单外同高度据点仍可点击；
  - `dragon-general-columns`：普通武将和编成列表九列完整，滚动条未裁切，编成面板位置不偏移。
- 浏览器控制台仅既存`favicon.ico` 404。自动化均使用纯内存fixture或新局，未读写正式`SAVE.DAT`。

## 6. 提交审查、阻塞与风险

- 整合基线：`15ae29d fix: complete delegated battle and retreat flow`。
- 已逐项审查全部修改和未跟踪文件：保留产品代码、回归测试、逆向/项目文档及标题背景资产；唯一未跟踪产品文件为`tools/verify_general_specialty_columns.mjs`。
- `tools/verify_diplomacy_runtime.mjs`、`tools/verify_save_legions.py`、`tools/verify_war_message_fifo.mjs`仅含格式化噪声，已恢复且不纳入提交。`verify_advice_commit_boundary.mjs`的格式噪声同样先恢复，但审查发现君主亲征仍使用旧兵种顺序后，为该修复新增了必要断言并纳入提交。
- `.playwright-cli/`、`.dragon-runtime/`、`.dragon-analysis/`、日志、截图、缓存和探针输出均为忽略的本地代理/运行产物，不纳入提交。
- 当前无代码、逆向、测试或发布阻塞。发布过程中首次HTTPS访问曾短暂返回404，最终重试已成功更新`origin/main`。
- 剩余风险：第一章长期自然战略调度尚未在最终代码上完整复跑；用户浏览器若继续使用旧ESM也可能呈现假回归。

## 7. 下一步

1. 用全新浏览器长期运行第一章，重点复核：
   - 椎阳驻军不再无故返都；
   - 状态10返都补员与状态11解散；
   - NPC-NPC道路野战、真实驻军攻城和临时城防；
   - 败军逐点退即时己方据点，再按状态二段返都；
   - 破城整组撤退、迁都、胜军入城和战后地图拾取。
2. 后续继续用DOSBox-X逐帧捕获与`originaldiff.js`差分，扩展战术和音效证据链。
