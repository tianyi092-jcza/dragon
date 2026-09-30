# Checkpoint Journal

> 本轮会话的进展、调试、失败、文件、阻塞与下一步。长期事实、架构、
> 命令、约定见项目记忆（[`AGENTS.md`](../AGENTS.md) 各 SKILL），机制细节见
> `re-notes`，版本变更见 [`CHANGELOG.md`](../CHANGELOG.md)。历史发布批次
> 明细已归档，不在此重复；下文“已验证”均指本机重跑结果，不是全战役认证。

## 当前主线状态（2026-10-01，dev 分支）

- **任务二《地图统一改造》关闭**：M0–M3、深验证轮、G 门七证据包、四余项、
  pi-lens 两批、延期重跑、M-06 验收＋开局遍（242 格）重验收，均通过。
  G-MAP/G-ROAD/G-INIT/G-SLOTS/G-CAP 保持关闭（证据在手，编辑器集成未做）。
- **编辑器阶段进行中**（本地、无后端）：E-02 复制/闭环/试运行页、
  E-03 工作台 v0/v1/道路建造＋v2 重编码；服务 8322（游戏静态服 8321）。
- **已提交**：`4b13035`（任务二整批，dev 分支，已推 github/dev）。
- **未提交（dev 工作区）**：`mapcompile.js`（诊断分离）、`originalcity.js`
  （3FBF raw 回退）、`originalroadarrival.js`（3F29 死槽跳过）、
  `gamesource.js`（槽位回填＋漂移诊断）、`roadedit.js`＋`encodeRoadGraphV2`
  （新建）、`editor_server.mjs`（trial-pack 章节参数＋/studio＋/trial＋
  web 静态）、新 tools（`verify_road_edit`、`verify_editor_studio_road_browser`
  等）。`AGENTS.md`、`docs/*` 设计文档、`CONTEXT.md` 系其它会话产物，不碰。
- **生产数据结论**：data.json 具名/旧属分立忠实（原版亲核零差异），
  首轮重建写是原版行为；官渡等 6 章靠死槽容限正常开局（曾 hold，现通）。

## 关键命令

- 游戏静态服（常驻，用户终端）：另见 8321 进程；编辑器服务：
  `node tools/editor_server.mjs --serve --port 8322`（本环境后台不驻留，
  前台验证过）。
- 自检：`node tools/editor_server.mjs`；单测：`node --test tools/verify_<x>.mjs`；
  浏览器脚本直接 `node tools/verify_<x>_browser.mjs`（全新 profile/隔离服务）。
- Python 工具链：`python`（C:/Python313，非 WindowsApps 垫片）；必要时
  `python -B tools/verify_road_v2_content.py`。
- 提交推送分离授权；`.dragon-analysis/` gitignored（报告与隔离输出不入库）。

## 重要坑点（已验证）

- 画布点击一律经 `getBoundingClientRect` 换算（含 1px 边框＋body 边距）。
- 章节 id 含 `#`：拼 trial/服务 URL 必须 `encodeURIComponent`。
- E717 槽纪律：源槽＝种子方向，目标槽＝到达反方向；同城同向无双港
  （slot-occupied 经几何不可达，守卫仅作纵深）。
- 走廊紧密度：现图 8006 单格 detour 零可分类——纯几何新路必拒收，
  有效改路须 tile 重漆 recipe。
- 开局遍：89F0 调用者＝1BE6 启动链＋1B87 战术归来（读档路无）；fresh
  合成平面遍 192 城，显式平面（读档/测试）原样。
- 单平面顺序绘制：后城可见先城写（真图城距远不碰；合成测试城距须 ≥6）。
- `prepareScenario` 城市/节点门是显式别名 enforcement（恒等或拒收）。
- `structuredClone` 替代 JSON 深拷贝（lint 门）；verify 脚本输出走 `tlog`
  （`node:util format` 封装），`console.log` 会触发 pi-lens 告警。
- pi-lens 误报已裁决：content_pipeline 路径穿越（source_path 收容）、
  TS2568 Scenario 动态 fixture、await 成员括号式——不管；
  真告警（未用变量、`0*4`、嵌套三元、`!!`、裸 JSON.parse）修。

## 本轮会话（E-03 道路＋漂移定案）

- 新增 `roadedit.js`（建造全认证派生＋精确拒收码、`deriveSlots` 与 v2
  tag 254/254 一致、`encodeRoadGraphV2` 与 roads.json 逐字节全同）；
  工作台 road 画线＋land/water 确认＋近线删除。
- `verify_road_edit.mjs`、`verify_editor_studio_road_browser.mjs` 全绿
  （exit0；删 road-0→逐格重建→保存校验编译过）。
- 漂移：先误判数据 bug，后原版亲核纠正——具名/旧属分立忠实；
  落为 3F29 死槽跳过＋3FBF raw 回退两处产品容限（未提交）。
  官渡仲裁：hold→18 轮推进；arrival/city/faction/diplomacy/callers/
  movement＋复制/闭环/menu_save 重跑全绿。
- 阻塞：无（漂移修复 authority 问题已由证据裁决：不改数据）。
- 下一步：E-03 继续（v2 新边落盘到发布管线？已做编码器；缺与
  compile/publish 的接线）或漂移报告归档；commit 需明确授权。
