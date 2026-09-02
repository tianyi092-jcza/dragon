# 卧龙传 Web 复刻 · Checkpoint Journal

> 本文只记录最近一轮会话的详细进展、调试过程、失败尝试、相关文件、当前阻塞和下一步。
> 长期项目事实、架构、命令和约定见 `../AGENTS.md`；稳定逆向证据与公式见 `re-notes-*.md` 和 `E:/Dragon/.agents/skills/`。

## 1. 会话目标与结果

- 2026-09-04 完整消息系统审计与首批修复：战略规则消息统一进入GameBar FIFO，严格3秒/右键关闭、clock hold、onClose once和最终对白提交；修复入站/主动外交结果过早提交、赤字信赖处罚时点、旧timer串卡、reset异步消息复活。继续反汇编`0x291A..0x2AD1`与`0x4CF3..0x511F`，闭合并接入TALK31..37、67..72、TALK41、57、65/66及内政官TALK68、外交官TALK69的顺序；AI迁都和新武将投奔不再使用HUD/自拟文案。随后复刻`0x075B`的`0x196+(selector-0x196)*8+talk_idx`换算，接入0x198/199/19A/1A4/1A6/1A7第二段，保证第一段关闭后才推进；补灭亡全链、type4/5预算和type10真实GameBar FIFO测试，修复预算结果阶段右键重复执行拒绝，并将玩家迁都/君主出阵成功状态推迟到最终君主对白3秒或右键关闭时once提交。再闭合`0x4E5C..0x4F89`的TALK26..30：玩家非委任野战TALK29、玩家攻守城TALK28/27均在关闭后才打开战术层；玩家据点易主TALK26，首都失陷且迁都成功按TALK30→26入队；委任/无真实守军速算静默。最终收尾将`0x3526`宣战硬编码改为TALK63→0x19F与0x1A0真实数据窗口，将边城请求改TALK38；补迁都失败、亲征失败/TALK64、战术模态等待、AI对AI TALK68/69动态测试，并扫描全部`0x8810`与`CX>=0x196`调用点确认战略消息生产者闭合。用户更新的`web/grf/ui/loginbg.jpg`纳入本批。
- 2026-09-03 宣战边境响应与战略移动勘误：`0x3FA9`的0xFE威胁标记来自任一正式交战邻国，不要求等于势力战略目标；修复AI宣战后玩家边境空城不发TALK38援军请求。补入`0x35AB..0x35E8`的AI防守方反指宣战者规则。确认军团道路推进由`0x1D0B→0x25A3`每次16槽轮询驱动，约每游戏时刻一次而非每日；新增主时钟回归。五档Web战略表现间隔整体减半为`240/140/80/40/12.5ms`，普通档提速1倍。删除大地图军团目标路线虚线，仅保留原版MMAP.MCH军团标识。
- 2026-09-03 首页启动隔离：取消D7OPEN开场动画和标题阶段默认章节地图。启动时仅加载`data.json`、IndexedDB存档目录、标题菜单素材，并在全屏自适应`grf/ui/loginbg.jpg`背景上完成新游戏/读档流程；确认章节、势力、军师或有效存档后，才延迟加载战略地图、道路、战斗、TALK资源，装配GameBar/HUD并直接进入对应地图。返回首页时清除当前地图引用并恢复纯背景选单，避免未进入游戏前推进或暴露地图状态。
- 2026-09-03 外交完整勘误：由第一章选曹操数日内对吕布开战、赤壁选刘备数日内遭曹操宣战两个复现锚点，逐指令重查完整`0x2BD9→0x2D58→0x2E33/0x2E89/0x2EFB/0x2F71`。除恢复玩家势力参与`0x2EFB`外，又修正：玩家额外`-7`取决于第一候选和平战争marker而非空城；候选采用原版不稳定selection-sort；type1/2/3/8随机入槽的RNG消费与不去重语义；`0x2F71`空城扩张type1；`0x2D8E..0x2DB7`月度目标保留/清理；和平低关系军团不得提前进入威胁/攻击；玩家宣战分支不写AI目标字段。新增独立oracle遍历20章共220个“章节×玩家势力”组合，并覆盖动态type2/type3、空城目标、marker、canonical RNG宣战日期。第一章选曹操现为曹操→吕布`A9→A1`并排type1；赤壁选刘备默认RNG下曹操于第7日提交对刘备宣战，均由同一算法产生，无章节特判。
- 日期：2026-08-31 至 2026-09-01。
- 基线：`a9ec763 feat: restore legion upkeep and capital replenishment`。
- 用户目标：全面逆向并正确实现原版NPC势力级AI、战略事件和战术六队逐帧规则；结论必须来自KI.EXE、原始数据或资源。
- 范围澄清：要求复刻 **AI与玩法规则**，不要求DOS硬件、低分辨率或逐像素动画。Web可使用高分辨率和近似动画，但表现不能改变规则帧、RNG、决策和战果。
- 结果：战略调度/事件轮、NPC军事反应、外交、行军接敌、战略速算、战后链和战术固定帧规则已闭合到现有静态证据；旧随机平行系统已删除。durable goal已完成并通过验证审计。

## 2. 本轮主要实现

### 2.1 战略调度、事件和NPC AI

- 闭合 `0x3E11`：每时刻轮转一个势力，顺序为事件泵、财政危机门控、预备兵维护累计、外交官维护；确认它不是完整目标选择AI。
- 实现256×4B战略事件轮：4页×64槽，首槽7次、后续10次调度，空槽也消费，月结前移一页；加入存档恢复和旧队列迁移。
- 闭合type1..13的现存处理语义和已证生产者：宣战、协同、停战、内政/外交预算、玩家停战/请援、迁都、武将原属回归、SAVE通用TALK、灾害及负资金信赖事件。
- type10确认无KI直接生产者，只兼容DOS SAVE尾段已有事件。
- 修正财政门控为 `nCities*8+24` 对 signed `funds>>8`；预备兵维护按每次势力轮询累计，而非固定周期估算。
- 闭合 `0x4325` 军团状态机、势力`+0x16/+0x17`一次性目标槽、状态8/9/10/11及财政bit6门控。
- 实现边境弱城请求、首都选将、真实兵池六队编成、增援/出击、道路接敌、战略速算、占城、撤退和灭亡闭环。
- 闭合 `0x4FCE` 武将三分支，删除按城数随机改投和按月俘虏复活链。
- 修复reviewer发现的三项战略回归：
  - type4内政预算不再在月结预扣；
  - 主动宣战资源门控统一为signed资金`>>8`；
  - type12灾害地图对象容量由16改为原版32。

### 2.2 战术规则与BATTLE.DAT

- 纠正核心架构：BATTLE.DAT `A426` 是全战斗持续脚本，不是可跳过开场cutscene。
- 每个固定帧改为：**就绪玩家输入/按钮 → A426 → 同一Session的A065**。删除点击跳过、40秒超时和4000指令上限。
- `OriginalBattleSession`增加就绪命令阶段；测试证明玩家命令在同帧A426前写入，A065随后观察到状态。
- 实现 `A1C5` 启动链：所有模式固定50个A065预帧；mode1加入A2E8/A34F评分、RNG、等待、单挑、重定位和脚本跳过。
- 全部32个BATTLE.DAT脚本块经过10,000帧持续循环测试；非法PC、opcode和跳转改为明确错误。
- 补齐固定帧顺序、对象生命周期和规则字段：
  - A754/A785对象命令 → B941效果 → ADC8；
  - B413补入未展开兵，B4B8撤退退出并累计幸存；
  - B240同步占用及前一X/Y/层/高度；
  - D348/A12A帧入口状态；
  - CBE5读取对手武将`general[+0x16]`；
  - B7CB按D35玩家对象侧门控；
  - op16按AH次数投影C315，op17只读0x600首组长。
- 删除 `originalcommands-exec.js` 重复执行器，保留 `originalexecutor.js` 为唯一生产实现。

### 2.3 删除平行近似系统

- 删除 `web/src/game/battle/simulation.js` 及五个只验证随机伤害、兵种克制和超时判胜的legacy测试。
- 新增 `web/src/game/battle/battleprojection.js`，仅负责零RNG、只读的地图/武将/六队Canvas DTO。
- 将 `battlewalls.js` 缩减为只读城壁矩形投影；城壁权威状态只来自Session地图对象池。
- 删除战场空白点击产生的legacy `unit.order` 任意坐标移动。
- 删除旧随机“诚实/劣质建议”、百分比外交和隐藏DOM旁路：移除 `audience.js`、`diploview.js` 及相关入口；进言统一走GameBar已逆向流程。
- 战略据点、月结和野战地形生产入口删除 `Math.random` 回退，强制使用canonical `OriginalBattleRng`。`web/src`中仅单实例ID生成仍使用非玩法随机。

## 3. 关键调试与勘误

1. **`0x3E11`调用频率误判**
   - reviewer曾分别判断为每日调用或`CF2=0..7`。
   - 重反汇编 `0x1D0B..0x1E16` 后确认 `CF2=0..8`，`0x3E11`位于时刻进位分支`0x1DEC`。

2. **城与军团处理顺序**
   - 初版先补员后处理据点，导致首都军团抢先消耗兵池并压制边境编成。
   - 改为一个据点槽先于同轮16个军团槽。

3. **灭亡武将无证近似**
   - 初版按君主/俘虏标志猜测去向，且调用顺序早于同城守军处理。
   - 重反汇编 `0x4CF3..0x511F` 后删除近似，恢复破城→迁都→守军组→灭亡顺序，并闭合三分支。

4. **宣战提交过早**
   - 初版消息入队后立即改外交状态。
   - 改为最后一条君主对白关闭后提交，并给`onClose`加once guard。

5. **BATTLE.DAT被误作开场动画**
   - 初版VM仅在开场期间运行，用户点击或超时会销毁，A426与A065不交错。
   - 静态主循环证明A426每帧持续执行，遂重构为固定帧调度器；这也是本轮最大架构修正。

6. **B7CB侧别命名误导**
   - reviewer指出当前“守城侧”解释与命令路径冲突。
   - 直接反汇编B7CB确认门控条件是SI侧与`D35&0x80`匹配；结合对象0固定玩家军团，文档和实现改称“玩家对象侧”。

7. **C315/op16边界**
   - reviewer认为op16只改presentation flag，未实现副作用。
   - 重反汇编A69F和C315确认其为按AH次数绘制战术旗帜，不改变规则对象；Canvas按调用次数投影即可。

8. **遗留随机战术回退**
   - product facade仍可进入legacy `Math.random`模拟器，部分旧测试还把它当规则。
   - 先禁止回退，再迁移/删除只验证legacy规则的测试，最后删除整个simulation模块。

9. **工具与审查问题**
   - 一次从错误目录运行测试导致模块路径不存在，切回 `E:/Dragon/web-port` 后通过。
   - 一次全面reviewer运行15分钟超时；随后缩小为关键点只读复审并获得可操作结论。
   - Playwright冒烟仅见 `favicon.ico` 404，非业务错误。

## 4. 主要相关文件

### 产品代码

- 战略：
  - `web/src/game/ai.js`
  - `web/src/game/economy.js`
  - `web/src/game/diplomacy.js`
  - `web/src/game/clock.js`
  - `web/src/game/savegame.js`
  - `web/src/game/world.js`
  - `web/src/main.js`
- 战术：
  - `web/src/game/tacticalbattle.js`
  - `web/src/game/battlescript.js`
  - `web/src/game/battle/originalsession.js`
  - `web/src/game/battle/originalstartup.js`
  - `web/src/game/battle/originalexecutor.js`
  - `web/src/game/battle/originalobjectframe.js`
  - `web/src/game/battle/originalmovement.js`
  - `web/src/game/battle/originalmapobjects.js`
  - `web/src/game/battle/originalexit.js`
  - `web/src/game/battle/battleprojection.js`
  - `web/src/game/battlewalls.js`
  - `web/src/render/battleview.js`
- UI清理：
  - `web/src/game/advisor.js`
  - `web/src/ui/gamebar.js`
  - `web/src/ui/hud.js`
  - `web/index.html`

### 生成、测试与文档

- `tools/parse_sinario.py`
- `tools/parse_battle.py`
- `tools/export_battle_rules.py`
- `tools/verify_battle_original_*.mjs`
- `tools/verify_battle_script_vm.mjs`
- `tools/verify_tactical_rng_continuity.mjs`
- `tools/verify_*event*.mjs`
- `tools/verify_*save*.py`
- `docs/re-notes-kernel.md`
- `docs/re-notes-tactical-rules.md`
- `E:/Dragon/.agents/skills/re-battle-command/SKILL.md`
- 其它对应战略SKILL。

### 本轮删除

- `web/src/game/battle/simulation.js`
- `web/src/game/battle/originalcommands-exec.js`
- `web/src/game/audience.js`
- `web/src/render/diploview.js`
- 五个legacy随机战术测试及重复执行器测试。

## 5. 验证结果

完成审计前执行了fresh验证：

- 所有剩余 `tools/verify_*.mjs` 通过；
- 所有 `tools/verify_*.py` 通过；
- `tools/verify_battle_viewport.js`、`tools/verify_clock_pause.js` 通过；
- 变更JS执行 `node --check` 通过；
- 解析/导出脚本执行 `py_compile` 通过；
- 变更产品文件LSP为0 diagnostics；
- `lens_diagnostics mode=all` 无问题；
- `git diff --check` 无空白错误，仅既有LF→CRLF提示；
- 全新Chrome会话正常启动，旧`#advisordlg/#diplov`不存在；
- 浏览器内程序化野战验证：VM保持活动，玩家队列由1变0，frame 0→1，组长current/pending在同一“输入→A426→A065”帧变为命令1；console仅favicon 404；
- 重生成 `web/data.json`、战场脚本/地图/规则资源后，相关测试继续通过。

## 6. 当前工作区

- 工作区仍故意保持未提交，包含约百个修改、删除和新增文件。
- 本轮没有执行 `reset`、`clean` 或丢弃用户改动，也没有提交。
- 后续操作前应先按功能查看 `git status --short` 和相关diff，不能假定所有脏文件都属于同一个原子改动。

## 7. 当前阻塞与已知边界

### 阻塞

- 当前没有已知阻塞性的AI或玩法规则缺口。

### 非阻塞证据增强

- 使用可脚本化DOSBox-X debugger捕获KI.EXE的A426/A065/9FDC逐帧状态，并与 `originaldiff.js` 比较。
- 继续验证YNSOUND双YM3812寄存器序列和原始可听音色；这不影响AI/玩法规则。
- YNSOUND `0x8B7/0x913`已闭合INT61计时回调周期为约`3.43284ms`；战术五档已按`64/48/32/16/0`回调门控落地。战略原版非零等待也可换算为约`13.731/10.299/6.866/3.433ms`，但Web暂保留刻意放慢的表现节奏。
- 若新二进制或原始数据证据推翻既有解释，应同步修订实现、focused regression、`re-notes`和SKILL。

## 8. 下一步

1. 将当前大工作区按功能拆分审查，确认生成物、产品代码、测试和文档一致。
2. 在需要提交时重新执行全量focused suite、语法、LSP、lens、diff-check和全新浏览器冒烟。
3. 优先处理新证据驱动的勘误；不要恢复已删除的随机平行规则。
4. 条件允许时增加DOSBox-X逐帧捕获fixture，作为现有静态证据的独立验证层。
