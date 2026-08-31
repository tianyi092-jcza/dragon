# 卧龙传 Web 复刻 · Checkpoint Journal

> 本文件只记录**本轮会话**的目标、逆向过程、实现、失败修正、相关文件、验证和遗留事项。
> 长期项目事实、架构、命令、约定和主线状态见 `../AGENTS.md`；稳定二进制结论见 `re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 本轮目标

1. 自行逆向 `E:/Dragon/Dragon/KI.EXE`，精确还原军团每日士气和军费。
2. 核查兵种组成是否直接影响每日军费。
3. 按用户线索闭合军团位于首都时的自动补员机制。
4. 校准接敌音效调用、委任四相时长、小地图同步闪动和无驻军据点失守提示。
5. 将稳定结论回流到代码、测试、SKILL、re-notes 和长期 project memory。

## 一、调查与逆向过程

### 1. 样本与边界

- 工作样本：`E:/Dragon/Dragon/KI.EXE`，大小67099字节，SHA256 前缀 `fffeba`、后缀 `d43868`。
- 官方和改版章节目录只有不同 SINARIO 数据，没有第二份 KI.EXE；本轮以该唯一程序为机制基准。
- 原先 Web 逻辑仅在一轮末给“驻城、未移动、未接敌/撤退”的军团固定恢复10士气，且没有每日军费。该实现属于推断，位置也会造成战后同日恢复和打开战术层后漏结其他军团。

### 2. 每日军费与士气

- 主循环 `0x1D0B` 调用 `0x25A3`，军团游标每次处理16槽；`0x2600` 仅在 `CS:[0xCF3]==1` 执行，最终每个活动军团每日结算一次。
- `0x2609` 读取 `legion[+4]` 总兵（十人单位），只比较 `legion[+0x0E]`：
  - 道路边 `>=0x0800`：扣 `floor(troops/2)+floor(troops/4)`，随后立即返回，不恢复士气。
  - 节点 `<0x0800`：扣 `floor(troops/32)+1`，士气增加10并封顶所属势力 `faction[+0x1D]`。
- 该函数不检查城市、接敌、撤退或命令状态。
- 六队兵种字段没有进入 `0x2600` 或资金减法器；相同总兵和道路状态的单日军费不按兵种加权。兵种只能通过移动速度或在道路上停留的日数间接影响整段行军费用。
- `0x562B→0x563B` 对势力24bit资金做减法，下限 `-655000`；`0x5609` 的收入上限为 `+655000`。资金允许为负数。
- `faction[+0x1D]` 同时用于新编军团初始士气和 AI 休整完成门槛；当前20章活动势力均为200。

### 3. 首都自动补员

- `0x4370..0x4398`：总兵 `<0x258`（600，即6000人）且实际位于所属势力首都时，进入命令状态9。
- `0x4499→0x461D→0x4717/0x4698→0x6FD2`：先将六队现有兵按兵种并回势力预备池，再按同兵种队数重新分配，最后重算总兵。
- 兵种映射：骑兵1→`faction[+4]`，步兵2→`+6`，弓兵3→`+8`；类型4不参与。
- 每队上限100。逐队公式：

```text
min(100, floor(available / remainingTeams) + available % remainingTeams)
```

- 余数优先给先处理队；并回预备池经 `0x55EC` 饱和到 `0xFFDC=65500`。
- 补员真实消耗对应兵种池。未完成行军目标时不补；目标仍指首都但军团已经实际到达时，同轮可补。
- 单槽时序是补员状态机先于 `0x2600`，因此当日军费按补员后的总兵计算。多个首都军团按军团槽地址升序争用共享预备池。

## 二、实现

### 战略规则

- `web/src/game/economy.js`
  - 新增 `applyFactionFundsDelta()`，同步 `gold/money` 并在±655000饱和。
  - 新增道路/节点军费公式和势力军团士气上限 helper。
  - 月结不再将负资金截为0；赤字判断改为 `<=0`。
- `web/src/game/ai.js`
  - 新增并导出 `replenishLegionAtCapital()`、`settleLegionDaily()`。
  - `aiTick` 按军团槽序先执行首都补员，再在本轮移动、到达或同步战果之后统一日结；异步战术/委任战斗在战果回写后补做该日结算。
  - 新编、延迟回归和占位重生军团统一读取势力士气上限。
  - 玩家据点实际易主时播放警告音；无驻军失守另发通用底部提示。
- `web/src/game/commands.js`、`diplomacy.js`、`audience.js`、`web/src/ui/gamebar.js`
  - 即时资金收支统一使用资金 helper。
  - 新编军团和君主亲征使用势力士气上限。
- `tools/parse_sinario.py`
  - 导出 `legion_morale_cap=faction[+0x1D]`，并重生成 `web/data.json`。

### 接战表现

- `web/src/core/speaker.js` 保留倒计时 `+3>1` 时调用的 YNSOUND ID 3 近似音效；四相表现层不额外重播。
- `web/src/game/engagetransition.js` 将委任结算前的表现过渡固定为 `0→1→2→3`、每相约100ms；该过渡不写规则状态，也不重复播放倒计时音效。
- `web/src/ui/gamebar.js`
  - `addMiniBattleFlash()` 只维护闪动，不再重复播放失守警告音。
  - 据点和野外战斗位置均绘制白色十字。

### 测试与文档

- 新增 `tools/verify_legion_daily.mjs`：覆盖军费边界、奇数取整、兵种不直接加权、节点士气、道路不恢复、接敌/撤退状态、资金负值饱和、首都补员、槽序争用和异步战果后延迟日结。
- 扩展 `tools/verify_engage_transition.mjs`：验证四相顺序、预载 gate、延迟 RAF 不跳相及 once guard。
- 更新 `tools/verify_march_navigation.mjs` fixture，补齐资金、兵池和士气上限字段。
- 更新：
  - `E:/Dragon/.agents/skills/re-march-engagement/SKILL.md`
  - `docs/re-notes-kernel.md`
  - `E:/Dragon/AGENTS.md`
  - `web-port/AGENTS.md`

## 三、调试与失败修正

1. **日结时序两次校正**：最初放在循环末会被异步战术早退跳过，随后临时移到移动前又与 `0x2662→0x2600` 顺序相反；最终改为同步更新后统一结算，异步战斗在战果回写后补结。
2. **小地图重复音效**：`addMiniBattleFlash()` 曾调用 `warnSfx()`，与接战音效叠加；现将闪动维护与失守警告分离。
3. **据点闪动表现不一致**：最初据点只变色、野外才画十字；现两者统一绘制白十字。
4. **首都多军团顺序隐含依赖数组顺序**：改为显式按 `slot/_runtimeId` 排序引用后补员，并增加共享兵池争用回归。
5. **旧 SAVE 道路字段残留**：恢复的 `roadEdgeOrNode` 曾在抵达节点后继续把军团判为道路状态；现与 `_march` 一起清理，并增加边→节点次日日结回归。
6. **四相重复音效**：倒计时阶段已按 `+3>1` 播放 ID 3，表现过渡再逐帧播放会额外重播4次；已移除表现层音效，只保留原倒计时调用。
7. **浏览器冒烟**：全新 Playwright 会话验证成功；唯一控制台错误是既有 `favicon.ico` 404。
8. **工具调用小失误**：一次从仓库父目录执行 focused test 导致模块路径不存在；切换到 `E:/Dragon/web-port` 后通过，不是业务逻辑失败。

## 四、验证结果

已通过：

```text
python tools/parse_sinario.py
python -m py_compile tools/parse_sinario.py
node tools/verify_legion_daily.mjs
node tools/verify_engage_transition.mjs
node tools/verify_march_navigation.mjs
node tools/verify_engagement_state.mjs
node tools/verify_siege_result.mjs
node tools/verify_field_result.mjs
node tools/verify_postbattle_fate.mjs
node tools/verify_delegated_autobattle.mjs
node tools/verify_envoy_budget.mjs
node tools/verify_diplomacy_runtime.mjs
node tools/verify_new_game_initialization.mjs
node --check（本轮相关 JS）
git diff --check
```

- 12个相关源文件 LSP error/primary：0。
- `lens_diagnostics mode=all`：无本轮阻塞错误。
- 浏览器动态检查：节点日结资金/士气正确；首都补员后六队为 `[75,75,80,80,55,55]`，三预备池归0。
- 独立三路提交审查曾发现日结时序、旧 SAVE 道路字段和四相重复音效三项阻塞，均已修复并补回归。

## 五、当前工作区与遗留事项

- 本轮产品代码、测试、生成数据和必要文档已完成审查与提交准备；下一主线回到原版战术模拟器动态差分。
- 若后续工作区并存其它未提交主线，仍禁止整体 reset/clean，应按功能审查和暂存。
- 尚未闭合：
  1. YNSOUND ID 3 原始音色解码；当前只对齐 `+3>1` 的调用时机和次数，四相表现时长独立约400ms。
  2. 使用 DOSBox-X debugger 捕获真实 KI.EXE 战术逐帧状态，与 `originaldiff.js` 比较。
  3. 外交官 TALK 319..345 的完整说话类型分支和正常日历流程回归。
