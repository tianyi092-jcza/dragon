# 臥龍傳 Web · Checkpoint Journal

> 更新时间：2026-09-10
>
> 本文件记录**当前批次**的详细进展、调试过程、验证、阻塞和下一步。提交状态与历史以`git log`为准；长期事实与约定见`../AGENTS.md`；地址级证据见`re-notes-*.md`和`E:/Dragon/.agents/skills/`。

## 1. 本轮范围与状态

- 仓库：`E:/Dragon/web-port`；分支：`main`；基线：`ecfa675`。
- 用户明确要求取消游戏通关后的过场动画。
- 本批只改变“玩家统一全部据点”的产品表现：不再启动D7END结局画，游戏继续停留在战略地图。
- 信赖归零和玩家势力灭亡的GAME OVER结束视图不在本批范围内，继续保留。

## 2. 确认与实现

- 全项目检索确认`EndView.show()`有三类正式入口：
  1. `commands.js::checkTrustGameOver()`：信赖归零；
  2. `ai.js::finalizeFactionExtinction()`：玩家势力灭亡；
  3. `ai.js::monthlyAI()`：玩家统一全部据点后的D7END通关画。
- 本批仅移除`monthlyAI()`中的统一检查和`grf/end_s*.png`播放调用；另外两类失败结局入口保持不变。
- `monthlyAI()`仍保留月末清理已退场军团的职责；统一后战略时钟、地图和后续月结继续运行。
- `main.js`月结调用点注释已同步，避免继续把`monthlyAI()`描述为“统一结局检查”。
- `EndView`、`#endv`和GAMEOVER资源不能删除，因为失败结局仍依赖它们。既有END_S资源也不在本批做无关迁移或删除。
- 这是用户明确的产品决定，不写成原版D7END机制结论。

## 3. 调试与决策

1. **没有整体删除EndView**：结束视图同时服务信赖归零和势力灭亡；全删会误伤GAME OVER。
2. **没有自动返回标题**：用户要求取消过场，并未要求统一后立即重载或跳标题；因此采用最小行为变更，保留战略地图。
3. **没有删除END_S资产链**：取消播放不等于撤销已完成的资源逆向；本批避免夹带无关删除。

## 4. 相关文件

- `web/src/game/ai.js`：移除统一天下后的D7END触发，保留退场军团清理。
- `web/src/main.js`：修正月结调用注释。
- `tools/verify_victory_no_cutscene.mjs`：锁定统一后0次`EndView.show()`，并确认GAME OVER仍调用`gameover.png`。
- `AGENTS.md`：记录“统一后留在地图、失败结局保留”为产品决定。
- `docs/checkpoint-journal.md`：记录本批范围、证据、验证和下一步。

## 5. 验证记录

- `verify_victory_no_cutscene.mjs`通过：统一后0次`EndView.show()`、死军团照常清理，信赖归零仍显示`gameover.png`。
- 全新Chrome profile通过：正式新局改为全城归玩家后调用`monthlyAI()`，`#endv`保持隐藏、`EndView.active=false`且战略场景仍存在；无console/page错误。
- 完整工作树107项`verify_*.mjs`、11项`verify_*.py`和`verify_battle_viewport.js`全部通过。
- 3个变更JS文件primary LSP零诊断；`lens_diagnostics mode=all`覆盖21个会话文件，零问题。
- `git diff --check`通过，仅有仓库既有LF/CRLF提示。
- 自动化全程未读取或写入`E:/Dragon/Dragon/SAVE.DAT`。

## 6. 当前阻塞与残余风险

- 无规则或实现阻塞。
- 统一天下后游戏会继续运行，而不是自动返回标题；这是“取消过场”的最小明确实现。若后续需要“无过场直接回标题”，必须由用户另行确认。

## 7. 下一步

1. 等待用户验收“统一后继续留在战略地图”的产品行为。
2. 如需改成“无过场直接返回标题”，必须另行确认，不能自行改变当前决定。
3. 提交或推送仅在用户明确要求后执行。
