# 卧龙传 Web 复刻 · Checkpoint Journal

> 本文件只记录**本轮会话**的详细进展、调试过程、失败尝试、相关文件、当前阻塞和下一步。
> 长期项目事实、架构、命令、约定与主线状态见 `../AGENTS.md`；二进制证据与稳定逆向结论见 `docs/re-notes-*.md` 和 `E:/Dragon/.agents/skills/`。

## 本轮目标

1. 查明原版第一章曹操/吕布开局外交显示与 SINARIO 静态值不一致的原因。
2. 实现 AI 主动向玩家宣战及底部战略消息。
3. 逆向外交官月度报告、申请经费、批准/改额/拒绝流程，以及人物政治和批准金额对关系改善的作用。
4. 按原版截图复用迁都觐见样式接入 Web，并补回归、存档和文档。

## 一、开局外交与 AI 主动宣战

### 调查过程

- 核对 `E:/Dragon/原版/SINARIO.DAT`、运行目录 DAT 与生成后的 `web/data.json scenarios[16]`。
- 原版第一章静态矩阵确认：曹操→吕布 `0xA9`，吕布→曹操 `0xAA`；合并和解析链没有错误。
- 继续追踪 KI.EXE，确认玩家选势力后会在首次显示地图前执行 `0x1B29→0x2BD9`。吕布→曹操由低7位42经过运行时修正降到39，因此开局显示“险恶”。Web 原先漏掉此初始化。
- 修正旧结论：AI 主动宣战门控在 `0x2EFB`；`0x2D3A` 只处理 type-8 事件。宣战链为 `0x2EFB→0x2FB1(type1)→0x31AE/0x31BE→0x320C→0x3526→0x3639→0x3644`。

### 实施

- `web/src/game/diplomacy.js`
  - 新增开局/月度 `0x2BD9` 关系变化和地理候选工作表。
  - 关系修改保持单向 cell；宣战/停战调用点显式同步。
  - 接入 `0x2EFB` 主动宣战候选和门控。
- `web/src/main.js` / `web/src/game/ai.js`
  - 仅新游戏执行首次外交初始化，读档不重复。
  - 月结再次执行；type-1 战略事件按调度延迟执行。
- `web/src/ui/gamebar.js`
  - 增加480×64底部君主头像战略消息、FIFO、3秒自动关闭或右键关闭。
  - 消息显示期间 `clock.hold`；关闭后恢复。
- `web/src/game/economy.js`
  - 删除错误的“月末 politics/4 双向提升关系”。
- `web/src/game/savegame.js` / `web/src/game/world.js`
  - 保存和恢复 `pendingStrategicEvents`，新游戏清队列。
- 新增 `tools/verify_diplomacy_runtime.mjs`。

### 验证

- 静态 A9/AA、开局险恶、吕布 type-1 候选、关系方向性、宣战通知和去重回归通过。
- 全新 Playwright 会话确认吕布→曹操 raw=`0xA7`，底部消息显示时暂停，右键关闭后恢复。
- 浏览器仅有既有 `favicon.ico` 404。

## 二、外交官月度经费与政治力

### 截图/TALK 定位

- TALK 69：驻目标势力的外交官前来报告。
- TALK 319/320：请求外交费金额。
- 菜单“答应/提示金额/拒绝”和数字键盘不是该 TALK 文本本身。
- TALK 325：批准；TALK 327：君主拒绝；TALK 340：截图中的外交官拒绝反应。
- `talk.json` 部分外交文本因标准 Big5 `errors="replace"` 已出现替换字符；本轮只对截图必需文本做校订，保留 TALK 索引和证据，未假称整个话型池已恢复。

### 逆向闭合

- 月结 `0x5358→0x5394→0x2BD9` 将事件计数器置7，随后 `0x539A→0x578F` 为预算耗尽的外交官排 type-5 事件。
- 每日 `0x3E11→0x31AE` 递减计数器，所以4月底生成的单个事件通常在5月7日处理；这与用户截图日期一致。
- 只有武将 `+0x1A==0`，即旧预算耗尽时才申请。
- 建议额：

```text
raw = min(player→target, target→player)
和平：request = (100 - (raw & 0x7F)) × 200
交战：request = (125 - (raw & 0x7F)) × 200
```

- 截图关系低7位52，因此 `(100-52)×200=9600`。
- type-5 处理链 `0x32E9→0x39E8`；数字键盘上限30000，非零输入最低500，不按现有国库钳制。
- 批准额只在对话结束后扣款，并由 `0x3ADF..0x3AE7` 转为武将工作预算：`floor(grant/128)`。9600金得到75预算点。
- `0x3E8E`：有外交官且预算非零时，第一随机门控 `<0x20`；通过后消耗 `23-politics`，再以 `(rng&0x0F)<=politics` 判定关系改善。成功时目标→玩家单向+1；若该方向超过反向，玩家→目标追赶+1。
- 因此政治影响预算持续时间和成功概率，批准额影响可工作轮数；单次成功增量始终是1。

### 初版偏差与修正

本轮先做了可交互初版，随后高精度汇编审查发现并修正：

1. **报告日期过早**：初版月结后立即弹出；改为排队并延迟7个日调度。
2. **双重扣款**：初版把建议外交费计入 `computeFactionExpense()`，批准时又扣一次；现已从常规月支出删除，只在对话批准时扣款。
3. **预算换算错误**：初版使用 `floor(grant/200)`；按 `0x3AE2/0x3AE4` 修正为 `floor(grant/128)`。
4. **重复申请**：初版每月为所有外交官生成报告；改为仅预算耗尽时申请。
5. **输入上限错误**：初版按当前国库钳制；修正为固定30000、非零最低500。
6. **场景文本**：当前截图主分支已可用，但 TALK 319..345 按武将 `talk_idx` 的完整分档仍未全部实现。

### 实施文件

| 路径 | 本轮职责 |
| --- | --- |
| `tools/parse_sinario.py` | 导出武将 `assignment_budget` |
| `web/data.json` | 由解析器重生成 |
| `web/src/game/diplomacy.js` | 申请额、预算耗尽判断、月结 type-5 报告生成 |
| `web/src/game/ai.js` | 7日延迟和 `0x3E8E` 预算/政治维护 |
| `web/src/game/economy.js` | 删除外交费月结预扣，避免双扣 |
| `web/src/ui/gamebar.js` | 双头像觐见、三项菜单、数字键盘、批准/改额/拒绝、FIFO/hold |
| `web/src/ui/hud.js` | 任命外交官时初始化预算状态 |
| `web/src/game/savegame.js` | 保存/恢复预算、待处理报告和旧档默认值 |
| `web/src/main.js` | 月结生成并排入延迟报告 |
| `tools/verify_envoy_budget.mjs` | 公式、预算门控、政治消耗和关系方向回归 |

### 验证与调试

通过：

```text
node tools/verify_envoy_budget.mjs
node tools/verify_diplomacy_runtime.mjs
node tools/verify_save_transition_guard.mjs
node tools/verify_local_saves.mjs
node --check（相关 JS）
python -m py_compile tools/parse_sinario.py
git diff --check
lens_diagnostics mode=all（变更文件）
```

- Playwright 新会话用测试场景直接打开外交费觐见，确认显示对刘备申请9600并持有 `clock.hold`。
- 一次浏览器冒烟因等待场景初始化超时，随后改用正式 App 装配后注入最小场景状态完成验证；超时未证明业务逻辑失败。
- `economy.js` 的 TypeScript LSP 一度保留4条行号超过 EOF 的旧缓存诊断；文件实际只有310行，`node --check` 通过，pi-lens 标记为 stale。后续若再次出现须重新扫描，不能把所有 LSP 错误一概视为缓存。
- pi-lens 在会话末自动格式化了 `web/src/ui/gamebar.js` 和 `tools/verify_envoy_budget.mjs`；继续编辑前需重读。

## 三、文档回流

- 更新 `E:/Dragon/.agents/skills/re-domestic-diplomacy/SKILL.md`：开局/月度外交、主动宣战、外交官预算申请和政治维护。
- 更新 `docs/re-notes-kernel.md`：关键地址、公式、预算换算和事件日期。
- 更新根 `E:/Dragon/AGENTS.md` 的 SKILL 索引说明。
- 本次重新整理 `web-port/AGENTS.md`：只保留长期项目记忆；本 journal 只保留本轮详细过程。

## 当前状态与下一步

### 当前状态

- 本轮实现和文档尚未提交；工作区同时包含此前的存档/单实例及战术主线修改，禁止整体 reset/clean。
- 外交核心数值、事件日期、预算单位和政治门控已闭合并有 Node 回归。
- UI 已完成主分支冒烟，但尚未从正式菜单按正常日历完整跑到5月7日逐项对照全部截图。

### 下一步

1. 使用全新 Playwright 会话从正式菜单选择原版第一章，任命外交官并正常推进到下月7日，验证报告日期、三项菜单、数字键盘、扣款、右键层级和时钟冻结。
2. 测试全额批准、低于建议额、高于建议额、拒绝/输入0四个分支及读档恢复待处理报告。
3. 按武将 `talk_idx` 闭合 TALK 319..345 的完整对白选择；修复 TALK 解析链而不是直接修改 `talk.json`。
4. 复核通用 NPC/武将消息取消左键关闭后，其他既有回调流程没有回归。
5. 按功能拆分审查当前 diff 后提交；提交前重跑 LSP、`lens_diagnostics mode=all`、focused Node suite 和全新浏览器冒烟。
6. 完成本轮后回到主线：DOSBox-X debugger 捕获真实 KI.EXE 战术逐帧状态，与 `originaldiff.js` 做动态差分。
