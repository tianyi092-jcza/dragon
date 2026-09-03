# 臥龍傳 Web · Checkpoint Journal

> 本文只记录当前一轮未提交工作的详细进展、调试过程、失败尝试、相关文件、阻塞和下一步。
> 长期事实、架构、命令和约定见 `../AGENTS.md`；稳定逆向证据见 `re-notes-*.md` 和 `E:/Dragon/.agents/skills/`。

## 1. 本轮目标与当前结论

本轮主线是复核并修正委任模式完整战斗链，起因是第一章曹操—吕布战局中：

- 程昱、曹仁等强守军会主动离开据点；
- 吕布、张辽错误攻下本应守住的城市；
- 战后双方军团可能停成据点两侧圆点；
- 占城后可能同轮派出多支军团；
- 接战动画有时没有原版音效。

已确认主因不是`0x5130`胜负公式，而是Web自创的军团级`scanThreat()`令无目标委任守军主动出城，破坏了原版接敌/攻城入口与真实守军选择。相关规则、状态和输入偏差现已修正，并补充回归。当前改动尚未提交。

## 2. 逆向与实现进展

### 2.1 委任战斗入口与胜负

- 重新审计 `0x4E5C/0x4ED7 → 0x5130 → 0x5285 → 0x52D7 → 0x51B3`。
- 用第一章实际样本机械代入：
  - 吕布攻程昱守陈留：攻方约`740/984`，守方约`2317`；
  - 张辽攻曹仁守谯：攻方约`813`，守方约`996/1078`。
- 所有相关RNG分支均应守方胜，证明公式主体没有导致当前错误失城。
- `ai.js`删除无原版依据的通用`scanThreat()`出城分支；无目标军团现在驻止，目标只由据点AI或`0x4325`状态机写入。
- 入口顺序补充确认：`0x2736`先调用`0x2831`军团接敌，再调用`0x2880`据点攻城。据点中心存在敌军团时先进入军团接敌链，不应绕过真实守军。

### 2.2 速算输入与军团身份

- `autobattle.js`现在始终读取完整六队原值；`legion.troops`与六队和暂时不一致时，不再均分重建默认六队或替换兵种。
- `selectPrimaryLegion()`按原版军团槽顺序比较；评分相等时保留低槽。
- `generalForLegion()`以`generalIdx`和旧数字/姓名leader恢复主将，不再把运行期军团slot误当武将索引。
- 编成、战略速算、战术初始化、战场投影和战后命运统一使用主将解析逻辑。

### 2.3 撤退、战后与AI调度

- 重新闭合 `0x487B/0x491B/0x48E5..0x4901`：非己城市增加高代价但仍参与搜索；即时第一跳必须属己；当前位于已失陷据点节点时沿返回第一边取得下一据点。
- 修复陈留节点74失陷后经边105撤向许昌节点82，不再原地清退。
- 地图驻军识别要求军团与据点同势力且位于中心，避免易主中间态误吞敌军。
- 重查 `0x474A → 0x4483 → 0x405D..0x40AA`：占城胜军先进入状态8休整；一次据点轮询最多调动一支合格委任军团，不按敌城驻军数同时派多军。
- 战后双方坐标、目标、接敌状态和武将去向的focused regression已增强。

### 2.4 接战音效与战略地图表现

- 从YNSOUND链确认ID3：`SOUND.DAT`记录3驱动左YM3812 channel 6，3个INT1Ch tick后接记录13，再过7 tick静音。
- 正式资源：`web/grf/sfx/ynsound-id3.wav`。委任四相动画逐相播放；预载函数现在返回并等待解码完成，避免首次接战异步静音。
- 移除战略军团渲染对`road_offset.json`视觉质心的叠加；军团沿16×16逻辑道路格中心插值。
- 游戏光标缩为18px；hover据点/军团不再额外画重复方框，已选据点持续选中框仍保留。

### 2.5 Canvas列表排序

- `gamebar.js`所有带表头Canvas列表支持双向排序：首次升序、再次降序，切换列从升序开始。
- 数字按数值比较，文字使用`zh-Hant`，占位虚线固定末尾；表头显示箭头和hover反馈。
- 排序保持选中/hover行对象身份，不依赖原数组下标。
- `HUD.showFactions()`改为通过`row._faction`绑定势力，修复排序后点击错位。

## 3. 主要相关文件

### 规则与实现

- `web/src/game/ai.js`
- `web/src/game/autobattle.js`
- `web/src/game/legionunits.js`
- `web/src/game/roadgraph.js`
- `web/src/game/engagetransition.js`
- `web/src/game/battle/battleprojection.js`
- `web/src/game/commands.js`
- `web/src/game/tacticalbattle.js`
- `web/src/core/speaker.js`
- `web/src/main.js`
- `web/src/render/mapview.js`
- `web/src/ui/gamebar.js`
- `web/src/ui/hud.js`

### 资源、测试与文档

- `web/grf/sfx/ynsound-id3.wav`
- `tools/verify_autobattle.mjs`
- `tools/verify_delegated_autobattle.mjs`
- `tools/verify_engagement_state.mjs`
- `tools/verify_postbattle_fate.mjs`
- `tools/verify_strategic_city_ai.mjs`
- `tools/verify_engage_transition.mjs`
- `tools/verify_engage_sfx_asset.mjs`
- `tools/verify_march_navigation.mjs`
- `tools/verify_advisor_delegation_ui.mjs`
- `docs/re-notes-march-pathfinding.md`
- `E:/Dragon/.agents/skills/re-battle-command/SKILL.md`
- `E:/Dragon/.agents/skills/re-march-engagement/SKILL.md`
- `E:/Dragon/.agents/skills/re-ui-advisor-menu/SKILL.md`

## 4. 调试过程与失败尝试

- 初期只核对战略速算公式，测试均通过，但真实玩法仍错误。读取运行态后发现程昱、曹仁已离开城市中心，说明关键是输入和状态机而不是公式。
- 两个“据点两侧圆点”不是对象被删除，而是军团仍活动、`target=null`、`_engagement=null`并停在中心相邻格；这直接指向Web主动出城分支。
- 一次并行公式审计子任务超时，没有可用产物；后续由主流程直接逐指令复核。
- `generalForLegion()`曾兼容“slot即武将索引”，会让旧Web快照在slot修复后绑定错误主将；现已删除该假设。
- 交战声音资源可正常加载，但首次流程仍可能无声；定位为过渡只等待图像、不等待音频解码，现已让`prepare`同时等待两者。
- 地图标识偏左最初怀疑道路数据，最终确认是渲染层额外使用tile颜色质心；逻辑道路坐标本身无误。
- 部分验证脚本被pi-lens自动格式化，产生与功能无关的换行diff；提交前需继续检查并定点恢复噪声，不能整体reset。
- TypeScript LSP曾对`legionunits.js`报告文件尾伪语法错误，而Node解析和复制后的同内容文件正常；重写文件后恢复。仍应以最终LSP结果为准。

## 5. 验证状态

已完成：

- 委任攻城、接敌状态、撤退、战后命运、据点AI、接战动画/音效、道路插值和列表排序的focused regression。
- 本轮中曾运行全部78个`verify_*.mjs`与4个`verify_*.py`，均通过；`verify_battle_viewport.js`和`verify_clock_pause.js`通过。
- 相关变更文件Node语法、LSP、`lens_diagnostics mode=all`和`git diff --check`曾分别通过。

注意：此后又加入了列表排序、HUD绑定和文档整理，提交前必须重新执行一次完整验证；不能沿用旧结果作为最终证据。

## 6. 当前阻塞与风险

- 无外部硬阻塞；DOSBox-X原版现场已关闭，若要做新的动态断点复核需重建战局。
- 最大剩余风险是浏览器真实流程尚未在本轮最终代码上完整复跑：需确认程昱/曹仁留在据点、正确守城、战后无圆点残留、四相音效可听、列表排序点击目标正确。
- 工作区包含约30个功能/测试/文档/资源修改，尚未提交；其中可能仍有自动格式化噪声。
- 当前HEAD：`acd28e8 docs: refresh project memory and journal`，与`origin/main`一致。

## 7. 下一步

1. 审查全部工作区diff，恢复确认无关的格式化噪声，保留用户与本轮功能修改。
2. 重新运行全量`verify_*.mjs`、`verify_*.py`、viewport、clock、变更文件LSP、`lens_diagnostics mode=all`和`git diff --check`。
3. 启动新静态服务并使用全新Playwright profile复跑真实流程：
   - 吕布攻程昱守陈留；
   - 张辽攻曹仁守谯；
   - 守军保持据点中心并正确获胜；
   - 战后无无目标圆点；
   - ID3四相音效可听；
   - 表头升降序、选中保持和势力点击映射正确。
4. 若浏览器结果通过，更新本journal的最终验证证据并整理提交；未经用户明确要求不推送远端。
5. 后续非阻塞增强：DOSBox-X逐帧捕获与`originaldiff.js`差分；继续提取其它YNSOUND音效和测量INT61五档绝对时长。
