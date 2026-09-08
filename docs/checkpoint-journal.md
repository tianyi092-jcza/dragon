# 臥龍傳 Web · Checkpoint Journal

> 更新时间：2026-09-08
>
> 用途：记录本轮战术战斗工作的当前可继续状态。长期规则与地址级证据仍以 `AGENTS.md`、`docs/re-notes-tactical-rules.md`、`docs/re-notes-tactical-lifecycle.md` 和 `E:/Dragon/.agents/skills/re-battle-command/SKILL.md` 为准。

## 1. 本轮目标

本轮目标是继续以 `KI.EXE`、`BATTLE.MAP/MDL/SCH/DAT`、`ICONGRF.DAT`、`TALK.DAT` 和受控浏览器运行态为证据，修复并验证战术战斗的：

1. 64×64战场地图、地形、建筑、军旗、单位及原生绘制历史；
2. 16阵形、三部署区域、六命令、六队选择、状态图标及敌方脚本；
3. BD46寻路、占用/高度/城墙破坏、对象生命周期和战斗结束；
4. 开场对白、命令对白、3秒关闭、启动逐帧呈现与战术速度；
5. 现代大视口下的浮窗、卡栏、阵形图标和对白布局；
6. 核实最新截图中“地图下角内收、对边不平行”的视觉问题。

本轮不是“整个战斗已经100%复刻”的完成声明；仍需保留证据未闭合项。

## 2. 已完成工作

### 2.1 地图资源、投影与可见对象

- `BATTLE.MAP` 已按 `0x200 + directoryIndex*0x1000` 解析为214张独立64×64地图，不再错误地让三个layout共用三张图。
- `BATTLE.MDL` 每layout解析256个8字节descriptor和192个32×16地形图；`BATTLE.SCH`解析360个32×16半帧。
- mask与四个颜色平面均按左上/右上/左下/右下四象限解码；调色板通道保持原4-bit高半字节 `n*16`。
- 地图索引固定为 `y*64+x`；投影固定为：
  - `X = 16*(x+y)+16`
  - `Y = 64+8*(64+y-x)-16*level`
- `DD22`每个descriptor槽令显示缓冲位置上移一个DDB4的16px行；旧的8px解释已撤销。该修正同时消除了屋顶白缝，并使 `9E10→BB10→DC03` 的城头军旗高度正确。
- `CB9B/CBBC`镜像继续采用“保留边界、反转内部线性区并转换方向tile”，不再对Canvas、人物或点击坐标二次水平翻转。
- 越界区域使用原descriptor tile0的等距晶格，不用黑底或矩形平铺。
- 城头红/蓝军旗来自 `0xE00..` kind3地图属性对象及SCH基址 `0x150/0x204`，不是六队slot0的替代标记。

### 2.2 指挥、AI、寻路、占用与生命周期

- 16阵形已按 `C11A` 写入 `D346` 与 `D342=index*0x60`；三部署区按 `C165/C181/C19D` 写 `D33C` 的 `0x48/0x28/0x05`。
- 六卡按原槽顺序 `2,4,0,1,5,3` 显示为 `左翼、左備、大將、先鋒、右備、右翼`；多选按 `C27D..C30C` XOR mask，零mask表示全选。
- 六命令按原队列执行：普通命令只写组长pending，接受边界才广播并更新状态图标；撤退走side-wide路径。状态图标直接由 `ICONGRF.DAT` 原始图形生成。
- 敌方 `BATTLE.DAT` VM、阵形基准、城壁目标、方向、目标评分、追击和mode选择中的已识别错误均按原始调用链修正。
- BD46已改为原版target-seeded反向波前、环形队列和回溯：包括双plane成本、实时surcharge、BFDC distance alias、cost-gap retry、端点BX调整、方向压缩、64-word CLC截断及CF/AL语义。
  - 原始走廊：plain输出 `[0104]`；中间surcharge 8输出 `[0103,0104]`；上下plane均CF=0。
  - `tools/bd46_raw_oracle.py` 是带KI hash认证的有界指令解释器，仅作测试oracle，不是DOS或通用8086模拟器。
- B413补员状态归一化、B240/B3B2占用和surcharge写回、地形flags bit02、B8AA投射物初始位置/层级已经闭合。
- B824破墙后六个physical occupancy plane按原版写0；第七面、descriptor plane与上下surcharge的保留/清除边界已经分开处理。
- 启动拒绝/单挑评分、D318低字节递增、marker word比较、主将致命HP保1、B240相位切换、B360死亡半帧及终止帧跳过B941/ADC8/DDB4均已按证据修正。

### 2.3 TALK、开场逐帧、速度与原生参考历史

- 已生成424条认证战术TALK目录，闭合C315的legion slot→general/personality/speaker、跨行栈参数、开场/命令/撤退生产者及原始marker/AX副作用。
- A1C5改为增量stepper；每个真实A04B/A065规则帧后yield，使双方开场对白能够在生产RAF中依次显示，同时战斗规则继续运行。
- 战术对白为纯表现层：显示3000ms或全局右键关闭；不暂停Session、不clock hold、不改marker、命令、RNG或规则帧。
- 修复浏览器原生 `setTimeout` 被脱离 `window` 调用造成的 `Illegal invocation` 和首条对白卡死。
- 战略速度 `CFA` 与战术速度 `CFB→CFC` 已确认相互独立；战术五档原等待量为 `64/48/32/16/0` 个约3.43284ms回调。
- Web生产层每个RAF最多推进一个完整规则帧；首个启用RAF立即执行，之后按A0F2尾等待；使用完整有限非负RAF delta，丢弃整帧欠账但保留真实模余相位。最高档只声明“无原版附加等待”，不冒充原版固定60FPS。
- 已激活隐藏的原生参考display/process：保留跨战 `CS:E164` scratch、framebuffer known-mask、99CB初始提交及每个非终止A065的B941→ADC8→DDB4历史。现代2048×1088场景只读取原始capture，与隐藏native viewport分离。
- 活动checkpoint成对保存Session、VM、pacing和native scratch/framebuffer历史；正式IndexedDB仍禁止战中存档。

### 2.4 现代战术UI

用户已明确：战术UI不要求照搬原版整体排版，但各原始素材和命令语义仍需有证据。

- 取消可见战术小地图和右下双箭头；保留16阵形、三部署区、六命令、六卡及系统战术速度。
- 使用三个192px浮窗和左下624×36六卡栏；窗口边框均调用既有 `GameBar._drawWindow(..., "black")`，不以CSS伪造原窗纹理。
- 对白规格集中到 `web/src/ui/battlepanels.js`：480×80外框、8px inset、64×64头像、16px字号、20px行高、两行有界换行。
- 上对白与左上标题窗顶边对齐；下对白与左下卡栏底边对齐；姓名与正文作为整体在64px正文区域垂直居中。
- 16阵形图重新从 `ICONGRF.DAT[0x2800..0x2FFF]` 四个plane解码为完整128×32网格和16个16×16格：两排无整体外框，每个格保留原14×14内框；运行时仅当前D346格叠黄色选中框。
- 右侧兵力/士气线使用 `C775/C78E` 的原始长度公式；文字显示与规则态分离。

### 2.5 最新地图形状核实

用户截图来自本轮会话临时目录，不作为仓库产物提交。

结论：**底层地图仍是严格菱形，截图中的不规则感来自视口裁切，不是投影变形。**

完整64×64地面菱形边界为：

- 上角 `(1024,64)`
- 左角 `(0,576)`
- 右角 `(2048,576)`
- 下角 `(1024,1088)`

四边斜率严格为 `±0.5`，两组对边平行。截图尺寸1897×1049；截图上角约 `(992,48)`，精确对应相机偏移约 `(32,16)`。其余角应显示在：

- 左 `(-32,560)`：越过左边；
- 右 `(2016,560)`：越过右边；
- 下 `(992,1072)`：比截图底边低23px。

因此截图只完整显示上角。两条下边在截图底行约 `x=944` 与 `x=1040` 处被截断，尚未汇合，视觉上就像下角提前内收。本项暂未修改代码；若继续核查，应输出不受相机裁切的2048×1088全场景调试图。

## 3. 关键决策

1. **原始证据优先**：截图只用于发现与复核视觉问题，不单独定义机制。
2. **地图保持原生1:1**：不为一次截图缩放整个2048×1088战场；大视口继续通过相机拖拽浏览。
3. **现代全场与native参考分离**：隐藏native display用于保存原始局部绘制历史；不能把它未经证明地扩展成全世界像素等价结论。
4. **UI产品例外固定**：不恢复战术小地图和双箭头；现代浮窗布局可以不同，但阵形、命令、状态和数值仍按原始语义。
5. **对白关闭是表现政策**：全局3秒/右键只控制DOM，不改变原始marker和战斗推进。
6. **最高速度不补公式**：原版最高档绝对FPS依赖硬件；Web只执行每RAF最多一完整帧以避免旧12帧批跑。
7. **存档安全**：任何验证不得读取或写入 `E:/Dragon/Dragon/SAVE.DAT`；战中正式保存仍禁止。
8. **不整体回退脏树**：当前大量修改属于本轮与此前连续工作，禁止 `reset/clean` 覆盖。

## 4. 失败尝试与教训

- 早期把军旗附着到六队slot0，位置错误；原始对象链证明它们是 `9E10` 建立的kind3地图属性对象。
- 曾把descriptor层和对象level理解为8px，造成屋顶白缝及军旗陷入墙面；DDB4缓冲行证明应为16px。
- 旧BD46使用正向最短路并在cost gap立即CF=1；实时surcharge接入后拒绝原版可达路线。最终必须整体重写原target-seeded反向工作区，不能只补carry。
- 第一版外部BD46 oracle把KI body复制越过64KiB CS并污染ES fixture；现限制CS为单段并显式安装测试数据。
- B824任务初稿曾假设破墙需要重建两个descriptor plane；原始指令只清六physical plane和指定surcharge，该假设已撤销。
- 试图仅凭PNG alpha复刻B941不成立：DFBB可忽略mask写满颜色面，慢路还依赖persistent `CS:E164` scratch和历史。
- 第一版开场浏览器fixture绕过未完成的标题Promise，导致 `#startv` 覆盖对白；现用四次真实pointer完成标题流程并验证post-await状态。
- 玩家面板曾因CSS数字错误变成2104px高；已修为192×288并加入真实布局回归。
- 对白timer曾因脱离window调用原生setTimeout而抛错；改为绑定包装函数。
- 旧RAF路径把delta截到50ms并曾每callback批跑12帧，造成高档过快和规则衰减异常；现按完整delta和一帧上限处理。
- 最新“地图不规则”观察经坐标反推确认是三个角被viewport裁掉；在完整场景证据出现前不得改投影去迎合观感。

## 5. 相关文件

### 产品代码

- `web/src/game/battle/battleprojection.js`：等距投影与16px level。
- `web/src/render/battleview.js`：大场景、对象capture、浮窗投影、RAF推进、checkpoint。
- `web/src/game/tacticalbattle.js`、`web/src/game/tacticalclock.js`：战斗装配与战术帧预算。
- `web/src/game/battle/originalpathfinder.js`、`originalpathqueue.js`、`originalspatial.js`：BD46、路径队列和B000空间。
- `web/src/game/battle/originalmovement.js`、`originalobjectframe.js`、`originaleffects.js`、`originaleffectframe.js`：移动、占用、生命周期和投射物。
- `web/src/game/battle/originalstartup.js`、`originalsession.js`、`originalmessages.js`：增量启动、快照、TALK/marker。
- `web/src/game/battle/originaldisplay.js`、`web/src/render/originalcompositor.js`：隐藏native参考历史。
- `web/src/ui/battledialogue.js`、`web/src/ui/battlepanels.js`：3秒对白及集中布局规格。
- `web/index.html`：现代战术浮窗、命令、阵形和六卡DOM/CSS。

### 原始生成物与提取工具

- `web/battle_maps.json`、`web/battle_navigation.json`、`web/battle_scripts.json`
- `web/battle_display.bin`、`web/battle_talk.json`
- `web/grf/battle_terrain_*.png`、`web/grf/battle_units.png`
- `tools/parse_battle.py`、`tools/export_battle_maps.py`
- `tools/export_battle_display.py`、`tools/export_battle_talk.py`
- `tools/extract_battle_status_icons.py`、`tools/extract_battle_formation_icons.py`

### 关键验证

- `tools/verify_battle_original_bd46*.mjs`
- `tools/verify_battle_original_wall_clear.mjs`
- `tools/verify_battle_original_lifecycle.mjs`
- `tools/verify_battle_original_display*.mjs`
- `tools/verify_battle_original_messages.mjs`
- `tools/verify_battle_original_message_snapshot.mjs`
- `tools/verify_battle_message_raw.mjs`
- `tools/verify_battle_dialogue_presentation.mjs`
- `tools/verify_battle_dialogue_command_clicks.mjs`
- `tools/verify_battle_command_panel.mjs`
- `tools/verify_battle_formation_assets.py`
- `tools/verify_tactical_speed*.mjs`
- `tools/verify_battle_panel_layout.mjs`
- `tools/verify_battle_browser_acceptance.mjs`
- `tools/verify_battle_viewport.js`

### 长期证据文档

- `AGENTS.md`
- `docs/re-notes-tactical-rules.md`
- `docs/re-notes-tactical-lifecycle.md`
- `docs/re-notes-kernel.md`
- `E:/Dragon/.agents/skills/re-battle-command/SKILL.md`

## 6. 当前状态

- 仓库：`E:/Dragon/web-port`
- 分支/基线：`main`，`HEAD 57df722`
- 工作树：大量已修改及未跟踪文件，均为连续工作成果；**暂存区为空，未提交**。
- 禁止整体reset/clean或覆盖用户已有修改。
- 最近完整验证口径：
  - 105项安全非浏览器正文通过；
  - 另有Playwright/Chrome三尺寸panel布局和完整production BattleView acceptance两项正文通过；
  - Chrome版本 `152.0.7977.76`，使用全新临时profile，结束后删除；
  - primary LSP无错误；Lens无blocking，仅有既有测试重复/console/大型函数等warning；
  - `git diff --check`仅报告既有LF→CRLF提示；暂存为空。
- 本轮布局与生产BattleView的浏览器证据生成在本机临时目录，仅用于验收，不纳入仓库。
- 未读取或写入 `E:/Dragon/Dragon/SAVE.DAT`。
- 最新地图形状分析只产生结论和本记录，未改产品代码。

## 7. 阻塞点与残余风险

当前没有导致项目无法运行的硬阻塞，但以下证据链仍未闭合，不能宣称整场完全忠实：

1. `E04A` scratch整块writer及全部间接调用可达性尚未闭合；跨战 `CS:E164` 的全部合法历史仍未知。
2. 首次DDB4之前完整VGA背景、UI、cursor和其他writer来源未闭合；known-mask未知区域不能冒充黑色。
3. 隐藏native viewport只证明原局部绘制历史；现代2048×1088全世界的逐像素native equivalence未建立。
4. B533完整伤害/对象交换边界仍需专项审计。
5. CBE5的slot/commander身份依赖原版 `6E8F` 不变量；不能直接用Web `legion.idx/generalIdx` 猜补。
6. 内部命令9/10的完整生产可达性仍不明确；不得仅因CFG未找到writer就宣称不可达。
7. 尚缺覆盖完整战斗生命周期的受控DOSBox原版动态差分；现有raw oracle都是有界指令级工具，不是DOS运行等价证明。
8. 最新截图未包含完整地图四角。虽然坐标已证明投影平行，但若用户仍认为轮廓异常，应先生成完整scene图，而不是改公式。

## 8. 下一步

1. **地图视觉复核**：输出不受viewport裁切的2048×1088场景图，标出四角和四条理论边；增加四角/边斜率回归。若完整图仍有视觉缺口，再区分原始tile0边界、透明mask和实际坐标问题。
2. **native scratch审计**：继续追E04A及间接writer、首次DDB4前VGA/UI/cursor来源和跨战scratch可达状态。
3. **剩余规则链**：专项闭合B533伤害/交换、CBE5身份不变量及命令9/10生产入口。
4. **动态差分**：在不接触正式SAVE.DAT的独立环境中，建立可重复DOSBox战斗fixture，对关键Session、RNG、路径、消息和终止边界做逐帧差分。
5. **长时浏览器回归**：用全新profile覆盖攻/守城、野战、水战、破墙、撤退、主将死亡、不同速度及checkpoint恢复；继续明确区分实际执行正文与只定义page helper的脚本。
6. 每批完成后同步更新本文件、`re-notes-tactical-*`、SKILL和focused tests，并运行变更文件LSP、`lens_diagnostics mode=all`、安全验证及 `git diff --check`。
