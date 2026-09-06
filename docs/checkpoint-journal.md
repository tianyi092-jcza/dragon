# 臥龍傳 Web · Checkpoint Journal

> 本文件只记录当前会话的实现、调试、验证、阻塞和下一步。
> 长期有效的项目事实、架构、命令和约定见 `../AGENTS.md`；地址级逆向证据见 `docs/re-notes-*.md` 与 `E:/Dragon/.agents/skills/`。

## 1. 本轮目标与结果

本轮完成内政官治理、type4/type5预算对话和月结财政审计，并把上一阶段的委任战斗/战后链修正纳入当前工作区。目标是以 `KI.EXE`、原始数据和可控运行态替换 Web 中未经证实的规则。

当前结果：代码、focused regression、文档已更新；无代码或逆向硬阻塞；本地提交已创建，推送因远端返回404暂未完成。未读取或写入 `E:/Dragon/Dragon/SAVE.DAT`。

## 2. 本轮已确认并实现

### 2.1 内政官与城市治理

- `0x4194` 是逐城市槽治理，不是月结批处理。玩家城市基准为 `cl=5/dl=1`；只有官员 `general[+0x1A]` 非零时才先扣1预算并在本轮使用政治、武术加成。AI/中立城市固定 `8/4`，忽略官员。
- 前两次 RNG 固定消费；城兵未满时才消费第三次。治理成功增加上升率/防灾；补兵成功同时扣上升率并增加城兵。
- `city.defence` 作为 `+0x11` 唯一权威字段；移除战斗和治理路径写入 `city.disaster` 的镜像逻辑。
- 候选条件改为活动、同势力、`status=0`、非君主；原军师 NPC 不再被 `is_player` 排除。任命不改旧预算；手动解任清预算；城破链仅清官员身份。

### 2.2 type4/type5预算对话

- 对话状态机恢复为：报告 TALK56/57 → 执行官个性请求 → 三选项 → 军师回应 → 执行官回应。
- 零建议额走 TALK308..318 特殊链；非零建议额进入 TALK278..282 或 type5 对应池。`talk_idx` 在个性选择器中按原版规则归一。
- 入口建议额 `1..499` 钳为500；数字键盘自定义 `1..499` 保持原值；上限30000，不按国库钳制。
- 预算提交延迟到最后执行官回应关闭时，且使用 once-only 保护。修复快速双击重复扣款、公开 `GameBar.click()` 右键二次清零、羽扇绕过预算流程及未完成事件可被存档丢失。
- type5 全流程屏蔽右键和羽扇；type4 选择页右键保持等待，键盘右键返回三选项。预算 audience 或战略消息活动时禁止快照。

### 2.3 月结财政

- 月结使用本月税率、征兵设定和更新前生产力；财务结算后才更新生产力并生产预算/外交等事件，最后转正次月政策。
- 删除月结中重复的伪 `0x4194` 更新、无原版依据的每将20金月俸和按城市 `type` 推导生产倍率。
- 生产力倍率改为读取生产力 word 的高字节；修正三地带兵源移位取整、AI 50%收入和 AI 征兵财政门控。
- type4 建议额不计入月累计支出，也不预扣；批准后即时扣款并写 `floor(grant/128)` 预算点。

### 2.4 上一阶段战斗基线

上一阶段已完成并保留：道路节点/边点分离、真实驻军与临时城防分流、`0x5130` 速算、两阶段撤退、返都补员/解散、破城迁都及同城军团处理、接战动画/音效、军师菜单命中和武将专长列。详情已从本文件旧版压缩到 `AGENTS.md` 的架构与规则摘要。

## 3. 调试过程与失败尝试

- 首次治理实现没有扣 `assignment_budget`，并错误使用 `lead`；根据反汇编改为预算先扣、读取 `force`，并补上第三 RNG 和补兵扣上升率。
- 初始 UI 回归仍期待“打开即三选项”；修正为报告和两段自动对白后才进入选择页。
- 旧测试把 type4 请求额当成月支出40金；根据 `0x5715→0x39E8` 链改为不预扣，只在最终回应后提交。
- 兵源聚合测试曾把三个城市合并计算，导致期望比例错误；改为逐城市验证原版三地带移位取整。
- LSP 曾残留已不存在的文件末尾语法错误；Node/TypeScript 直接解析确认源文件无语法错误，重启语言服务并重新扫描后 `lens_diagnostics mode=all` 无错误。
- 全新 Playwright 会话发现控制台唯一错误是服务未提供 `favicon.ico` 的404；不影响功能验证，未把它混入规则修复。
- 工作区存在先前用户修改，未使用整体 `reset`/`clean`；误生成的未跟踪 `NUL` 已删除。

## 4. 主要变更文件

### 产品代码

- `web/src/game/ai.js`：`0x4194`治理、战后城市字段。
- `web/src/game/economy.js`：月结顺序、生产力、收入、征兵和支出。
- `web/src/game/commands.js`：内政官候选、任命/解任、次月税率写入。
- `web/src/game/savegame.js`：战略消息/预算 audience 存档守卫。
- `web/src/game/autobattle.js`、`web/src/game/battle/originalexit.js`：城市防灾字段统一。
- `web/src/ui/gamebar.js`：预算状态机、延迟提交、右键/羽扇防护和 FIFO。
- `web/src/ui/hud.js`：候选过滤、任免调用和税率控制。
- `web/src/main.js`：月结后转正次月政策。

### 回归与文档

- 新增 `tools/verify_domestic_governance.mjs`。
- 更新 `verify_budget_message_ui.mjs`、`verify_domestic_budget_event.mjs`、`verify_envoy_budget.mjs`、`verify_save_transition_guard.mjs`、`verify_battle_original_exit.mjs`。
- 更新 `docs/re-notes-kernel.md`、`E:/Dragon/.agents/skills/re-domestic-diplomacy/SKILL.md` 和 `web-port/AGENTS.md`。

## 5. 验证状态

- 全量 `tools/verify_*`（MJS、JS、Python）：`89 passed, 0 failed`。
- 变更 JS/MJS：`node --check` 和 TypeScript parser 检查通过。
- `lens_diagnostics mode=all`：无 error；`git diff --check`：通过（仅有换行符提示）。
- 全新 Playwright 会话：第一章曹操新局可进入地图；内政官列表确认原军师荀彧可被任命；菜单和地图交互正常。
- 浏览器只剩既存 `favicon.ico` 404；测试均使用内存 fixture、新浏览器 profile 或新局。

## 6. 当前阻塞与残余风险

- 当前没有代码、测试或逆向硬阻塞。
- `rawRequest=0` 特殊对白的共同尾段局部 scratch 字节尚未通过受控 DOSBox 运行态确认；当前 Web 已按已确认 TALK 序列实现并有回归。
- 月结生产力高字节与解析器字段映射应继续用官方 SINARIO 原始记录交叉验证；不能用 Web 现状证明偏移。
- 仍需长期运行第一章，观察预算耗尽后治理、月结政策切换、NPC-NPC战斗、真实驻军攻城、返都补员/解散和破城迁都。

## 7. 下一步

1. 用全新浏览器会话长期运行第一章，覆盖上述战略链和 type4/type5 真实交互。
2. 用 DOSBox-X 对 `rawRequest=0` 尾段、月结生产力字段和关键 RNG 消费做可控运行态复核。
3. 继续把闭合的地址级结论回写 `re-notes`/SKILL、focused regression 和关键代码注释。
4. 待确认远端仓库路径或权限后，重新推送本地提交并核对`origin/main`；如需新增提交，先由用户明确授权，并重新运行变更文件LSP、`lens_diagnostics mode=all`、全量回归及`git diff --check`。
