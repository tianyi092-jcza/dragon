# 臥龍傳 Web · Checkpoint Journal

> 本文只记录最近一轮会话的详细进展、调试过程、失败尝试、相关文件、当前阻塞和下一步。
> 长期项目事实、架构、命令和约定见 `../AGENTS.md`；稳定逆向证据与公式见 `re-notes-*.md` 和 `E:/Dragon/.agents/skills/`。

## 1. 本轮目标与结果

- 目标：完整审计主动/被动战略消息生产者，必要时继续反汇编；统一消息生命周期、状态提交边界和TALK数据驱动。
- 结果：任务完成并提交为：

```text
b88b703 feat: complete strategic message fifo audit
```

- 当前分支：`main`领先`origin/main`一个提交；工作区干净。
- 用户更新的 `web/grf/ui/loginbg.jpg` 已纳入该提交。

## 2. 主要实现

### 2.1 统一消息基础设施

- `web/src/ui/gamebar.js`
  - 战略规则消息统一进入FIFO；全链保持 `clock.hold`。
  - NPC/武将消息统一3秒自动关闭或右键立即关闭。
  - `onClose`使用once与`try/finally`，避免右键和旧timer重复提交或异常卡死FIFO。
  - timer绑定当前卡片，旧timer不能关闭后继消息。
  - 高优先级模态和战术层期间不出队，关闭后恢复drain。
  - 加入scenario UI generation守卫，返回标题/reset时等待头像/TALK的旧消息不能复活。
  - 新增 `enqueueTalkMessage()`；通用TALK与个性段作为相邻FIFO条目。
- `web/src/game/talk.js`
  - 复刻 `0x075B`：`0x196 + (selector-0x196)*8 + general[+0x1E]`。
  - 占位符支持同类多参数顺序消费，用于TALK29等多武将文本。

### 2.2 提交边界修复

- 玩家停战/请援使者、入站外交、主动宣战：最终结果/君主对白关闭后才提交外交、资金和战略目标。
- 玩家迁都与君主亲征：成功状态推迟到最终君主对白关闭；失败、已出阵TALK64也补足暂停/关闭边界测试。
- type13严重赤字：TALK51关闭后才扣信赖50并检查Game Over。
- type4/type5预算：修复结果阶段右键会再次执行拒绝的问题。

### 2.3 TALK与战略事件覆盖

- 战斗与战后：TALK26..37、67；包括战前TALK27/28/29、据点失陷TALK26、新首都TALK30、溃散/被俘/回归和个性段。
- 灭亡链：内政官TALK68→0x1A6、守军命运、外交官TALK69→0x1A7、逐将TALK34/37/67及个性段、最终TALK36。
- 外交与内政：TALK38、41、51、56/57、63、65/66、70/71/72、type10 SAVE通用TALK。
- 宣战链改为真实TALK：
  - AI→玩家：TALK63→选择器0x19F（TALK478..485）。
  - 玩家发起：选择器0x1A0（TALK486..493）。
  - 最终君主段关闭后提交战争状态。
- 战略战果自拟 `hud.flashEvent()` 摘要已移除；AI/委任速算无原版消息的路径保持静默。

### 2.4 战斗开场与失城

- 重反汇编 `0x4E5C..0x4F89`：
  - 玩家非委任野战TALK29关闭后才进入战术层。
  - 玩家攻/守有真实守军据点时，TALK28/27关闭后才进入战术层。
  - 无真实守军或委任军团直接战略速算，无TALK27/28。
  - 玩家据点实际易主统一TALK26。
  - 玩家首都失陷且找到替代首都时，FIFO顺序为TALK30→TALK26。

## 3. 逆向勘误与证据回流

- 重查 `0x291A..0x2AD1`、`0x4CF3..0x511F`、`0x3526`、`0x40C9`、`0x4E5C..0x4F89`。
- 确认 `0x50B4` 只有军团/武将状态清理，无TALK路径。
- TALK68条件是旧城非中立且有governor；`0x4D63`内部无玩家门控。
- `0x5074`外交官返回TALK69同样无玩家门控；新增AI对AI灭亡动态测试。
- 勘误TALK57/69：外交预算与AI迁都报告使用TALK57；TALK69只属于灭亡势力外交官返回链。
- 稳定结论已更新：
  - `docs/re-notes-kernel.md`
  - `docs/message-system-audit.md`
  - `E:/Dragon/.agents/skills/re-domestic-diplomacy/SKILL.md`
  - `E:/Dragon/.agents/skills/re-post-battle/SKILL.md`

## 4. 新增或重点增强的测试

- `tools/verify_strategic_message_fifo.mjs`
- `tools/verify_negotiation_message_commit.mjs`
- `tools/verify_personality_talk_selector.mjs`
- `tools/verify_budget_message_ui.mjs`
- `tools/verify_type10_message_fifo.mjs`
- `tools/verify_recruits_message.mjs`
- `tools/verify_extinction_message_fifo.mjs`
- `tools/verify_battle_opening_messages.mjs`
- `tools/verify_war_message_fifo.mjs`
- `tools/verify_advice_commit_boundary.mjs`
- 同步增强外交、边城AI、战后命运、围城、灾害和灭亡测试。

## 5. 调试过程与失败尝试

- `tools/verify_save_legions.py` 多次被pi-lens自动格式化，形成与功能无关的print换行diff；最终用定点 `git checkout -- tools/verify_save_legions.py` 恢复。
- TALK生产入口从 `enqueueStrategicMessage`迁到 `enqueueTalkMessage` 后，多个旧测试mock未实现新方法，导致消息数组为空或canonical外交日期断言失败；逐个补兼容mock后恢复。
- 新宣战FIFO测试最初把字符串行当token对象读取，得到空文本；修正测试帮助函数以兼容string/token两种行结构。
- AI对AI灭亡测试最初复用了已被前一fixture修改为dead/handled的对象，导致只见TALK68；改为重建势力状态并确保目标是最后据点后，确认TALK68→69。
- 战后测试曾出现TypeScript LSP行尾伪诊断，Node `--check`与执行均通过；重写文件后不再影响最终诊断。
- 全量suite中先后暴露 `verify_diplomacy_all_scenarios.mjs`、`verify_envoy_budget.mjs`旧mock只监听硬编码消息入口；补 `enqueueTalkMessage` 后通过。

## 6. 验证结果

提交前后均完成：

- 所有 `tools/verify_*.mjs` 通过。
- 所有 `tools/verify_*.py` 通过。
- `tools/verify_battle_viewport.js`、`tools/verify_clock_pause.js` 通过。
- 变更文件LSP：0 diagnostics。
- `lens_diagnostics mode=all`：无问题。
- `git diff --check`：通过，仅有工作树换行提示。
- fresh Playwright标题冒烟正常；仅 `favicon.ico` 404，非业务错误。

## 7. 当前阻塞与下一步

### 当前阻塞

- 无已知阻塞性的AI、玩法或消息系统缺口。

### 下一步（均为非阻塞增强）

1. 推送本地提交 `b88b703`（仅在用户明确要求时）。
2. 按 `docs/dosbox-original-battle-capture.md` 建立DOSBox-X逐帧捕获fixture，与 `originaldiff.js` 做独立差分。
3. 继续验证YNSOUND双YM3812寄存器序列和可听音色。
4. 若出现新二进制/原始数据证据，按“实现 + focused regression + re-notes + SKILL”四处同步勘误。
