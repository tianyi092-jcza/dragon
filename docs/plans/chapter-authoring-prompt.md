# 新会话提示词（复制下面整段到新对话）

```text
继续卧龙传 Web 编辑器的工作。仓库 E:/Dragon/web-port。

【第一步（必做）】按顺序读：
1. E:/Dragon/AGENTS.md
2. E:/Dragon/web-port/AGENTS.md
3. E:/Dragon/web-port/docs/plans/chapter-authoring-plan.md   ← 本次执行计划，严格按它的步骤走
4. E:/Dragon/web-port/docs/chapter-and-base-resources.md（§7 建立章节、§8 差异核对）

读完先复述：当前 HEAD、第 1 步要做什么、你打算怎么验证，等我确认后再动手改代码。

【硬约束】
- 全程中文，每条回复以 "tianyi," 开头。
- 测试只用本地开发服务：node tools/dev_editor.mjs（https://127.0.0.1:8443，账号 tianyi，密码 Dev-Local-2026!）；
  玩家静态页用 python -m http.server 8321 --directory web。
- 没有我明确指示，不要 git push、不要部署 VPS、不要读写 E:/Dragon/Dragon/SAVE.DAT。
- 改了 web/src 必须跑 node tools/build_trial_web_bundle.mjs；改了 editor-ui/src 必须跑 node editor-ui/build.mjs --check。
- 机制只认 KI.EXE／原始数据／实测；计划里标「推断」的（如外交官 +0x2A）不得说成实锤。
- 与我口述冲突时，以我的为准，并反向修改产品合同文档（docs/ 下的契约文件），不要改测试来迁就代码。
- 每次交付给：改了哪些文件、跑了什么命令、输出原文（PASS/FAIL）、未做项及原因。不要只说"已完成"。

【任务范围】
执行 docs/plans/chapter-authoring-plan.md 的第 1 → 7 步：修绿章节历史验证器 → 章节 materialize →
「新增章節」对话框与列表 → 势力=君主（必填首都）→ 武将章节属性 → 据点章节属性与试运行校验 →
内政官/外交官预设（标推断）。

每完成一步：跑验证、本地 git commit（不 push）、把结果告一段落，然后**停下来问我是否继续下一步**。
遇到需要产品决策的点（计划 §5 列了 4 条），不要自己拍板，列出现状与选项问我。
```

## 说明（不必复制）

- 控制方（总体对话）保留决策权；新会话执行、报告、遇决策点回问。
- 若新会话读不到计划文件，说明工作树未提交：让新会话先 `git pull` 或由控制方提交后再开始。
