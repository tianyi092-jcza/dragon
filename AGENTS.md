# AGENTS.md — 臥龍傳 Web 复刻项目记忆

> 本文件只保存长期有效的项目事实、架构、命令、约定、重要坑点与当前主线。
> 本轮详细过程见 `docs/checkpoint-journal.md`；二进制证据见 `docs/re-notes-kernel.md`、`docs/re-notes-march-pathfinding.md`。

## 1. 项目边界

- 目标：不用模拟器，以 **原生 JavaScript ES Modules + Canvas 2D** 重写 1995 DOS《臥龍傳》。
- 无框架、无构建、无 npm 运行时依赖；产品直接由静态服务器运行。
- 仓库：`E:/Dragon/web-port`；原版程序与运行数据：`E:/Dragon/Dragon/`。
- 官方基准：`E:/Dragon/原版/`；`上/中/下/后/` 为改版剧本库。
- 必须依据原版程序、数据和资源逆向；文档与代码要区分**实锤、推断、未知**，不能把视觉近似写成原版机制。
- 自动化测试**禁止写入** `E:/Dragon/Dragon/SAVE.DAT`。保存测试必须 mock `/api/save` 或只操作内存/临时文件。

## 2. 数据与坐标

- 游戏逻辑分辨率：`640×400`。战略主画布为 `#cv`，标题/开局为独立画布 `#startv`。
- 战略地图网格：`384×256`，每格对应 16×16 原版图块。
- `web/data.json`：五组剧本目录合并的 20 章数据，由 `tools/parse_sinario.py` 生成；改解析器后必须重跑，不能直接修 JSON 掩盖解析错误。
- `SAVE.DAT`：4 槽，每槽 `0x56C0` 字节。军团表为128×64B；运行时状态段起点 `0x2240`，槽文件因 `0x80` 头部位于 **`0x22C0`**。
- `BATTLE.MAP` 目录项为 `[layout, theme]`；布局数据从 `0x200 + layout * 256` 开始读取 4096B。实际布局仅 `0/1/2`。
- 势力军团标识样式来自势力记录 `+0x3E`，使用固定 24 槽×5帧原版资源，不做运行时染色或任意角旋转。
- 资金为 24bit：`word@+0x20 + byte@+0x22 << 16`。兵力相关原版记录通常以十人为单位，Web 展示/战术单位可能以人为单位，转换时必须注明层级。

## 3. 当前架构

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js` | 应用装配、主循环、剧本/存档加载、战术层入口和战果回调 |
| `web/src/game/ai.js` | 战略军团调度、道路移动、接敌、攻城、战后继续/撤退/武将去向 |
| `web/src/game/roadgraph.js` | 原版 192 节点/254 边道路拓扑、加权寻径、道路格到端点方向 |
| `web/src/game/fieldterrain.js` | `0x4B63` 野战地形分类、BATTLE.MAP 目录与镜像选择 |
| `web/src/game/autobattle.js` | `0x5130/0x5285/0x52D7` 野战/攻城速算、城池损伤纯函数 |
| `web/src/game/battle.js` | 战术战斗对象、六单位映射、野战与攻城参战方构造 |
| `web/src/render/battleview.js` | 战术渲染、镜像战场、单位结果和城壁记录回传 |
| `web/src/render/mapview.js` | 战略地图、道路路线、军团标识和接敌动画 |
| `web/src/game/savegame.js` | SAVE.DAT 镜像、槽位 patch、军团和延迟回归状态序列化 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、主要 Canvas 列表和地图锁定 |
| `web/src/game/clock.js` / `core/modalclock.js` | 战略速度、hold 与模态暂停恢复 |
| `web/src/core/speaker.js` | PC Speaker 风格 SFX 与 TYPE 1..4 profile |
| `tools/parse_*.py` | 原版数据解析和 Web 资产生成 |

### 战略军团主流程

1. 据点目标通过 `road_graph.json` 的原版拓扑寻径，不在 `384×256` bitmap 上自由 A*。
2. 每次战略更新沿当前道路边点列前进一步；到边端当轮停止，下次更新重新选择下一边。
3. 进入下一道路点前检查敌军/敌城；发起军团停在原点，进入 `11→1` 接敌倒计时。
4. 玩家直属军团进入战术层；AI 或玩家已委任军团走战略速算。
5. 战果回写六单位和士气，再经过 `0x474A`：继续、沿首都方向撤退，或进入 `0x291A` 武将去向。
6. `0x2977/0x2A7E` 用独立 48 调度周期队列恢复武将；`0x29C3` 处理被俘/退场。
7. 破城后 `0x4DA4` 让同城原守军共享一个撤退目标；无路则逐军团调用 `0x291A`。

## 4. 稳定交互约定

- 全游戏不增加关闭按钮；弹窗与二级界面按鼠标右键逐层回退。
- 羽扇图标是军师一级菜单唯一开关；关闭父菜单必须清理全部子窗口、选中状态并恢复计时。
- 军师子菜单激活时地图绝对锁定；地图空白处左键不关闭、不取消任何界面。
- Canvas 列表滚动条统一在右侧；选中行使用墨绿色 `#4a7828`。
- 系统选单、弹窗和场景切换用 `clock.hold` 冻结；不要通过改速度档模拟 hold。
- 游戏内读档必须返回标题后执行，禁止直接热替换当前 scenario。
- 标题空存档槽必须在 hover、hit-test、click 三条路径都禁用。
- 玩家下达的军团目标优先于通用 AI；委任只改变后续自主和战斗处理，不能覆盖尚未完成的玩家命令。

## 5. 常用命令

在 `E:/Dragon/web-port` 执行：

```bash
python tools/webserver.py 8321
# http://127.0.0.1:8321/

# 语法/格式
node --check tools/verify_autobattle.mjs
python -m py_compile tools/parse_save.py tools/parse_sinario.py tools/parse_battle.py
git diff --check

# 战略道路与战斗回归
node tools/verify_road_graph.mjs
node tools/verify_march_navigation.mjs
node tools/verify_engagement_state.mjs
node tools/verify_field_terrain.mjs
node tools/verify_autobattle.mjs
node tools/verify_field_result.mjs
node tools/verify_postbattle_fate.mjs
node tools/verify_siege_result.mjs
python tools/verify_save_legions.py

# 系统与存档回归
node tools/verify_save_buffer.mjs
node tools/verify_save_roundtrip.mjs
node tools/verify_startmenu_empty_slot.mjs
node tools/verify_sound_profiles.mjs
playwright-cli open http://127.0.0.1:8321/ --browser=chromium
playwright-cli run-code --filename=tools/verify_system_menu.js
playwright-cli run-code --filename=tools/verify_clock_pause.js
playwright-cli close
```

提交前还要运行变更文件的 LSP 与 `lens_diagnostics mode=all`。浏览器冒烟应使用全新 Playwright 会话，避免 ESM 缓存造成假回归。

## 6. 重要坑点

1. **SAVE 偏移**：状态段 `0x2240` 不等于文件偏移；文件军团表是 `0x22C0`。
2. **MMAP 资源**：只有 `MMAP.MAP` 使用对应 RLE；`MMAP.MCH/MDL` 是原始定长资源。
3. **BATTLE.MAP**：目录字节不是 `[theme, layout]`；布局窗口也不是 `layout * 4096`。
4. **野战防守方**：`0x4C72` 从同坐标候选中选一个最强主军，不合并所有军团，也不能用 synthetic city 冒充。
5. **撤退语义**：`0x291A` 不是“退到最近据点”；它是无法继续行动后的武将去向分派。
6. **战术城损**：没有真实 `wallRecords` 时不得用 `defLeft`、战略 ratio 或臆造 metric 写城损。
7. **存档途中导航**：二进制 SAVE 当前只保存军团坐标与稳定字段，不保存 edge/stride/point 指针；载入后重建导航。
8. **渲染纯度**：地图和小地图只能读取导航状态，不能由绘制函数推进或修改军团路线。
9. **自动格式化**：pi-lens 可能在回合结束后改写格式；继续编辑前重读相关文件，尤其 `ai.js`、`autobattle.js`、`savegame.js` 和验证脚本。
10. **工作区隔离**：提交前按功能审查改动，禁止用整体 reset/clean 处理含未提交工作的工作区。

## 7. 当前主线状态

已完成并有回归覆盖：

- 原版道路构图资产、拓扑寻径、道路点列移动和方向标识；
- 固定军团标识槽、野外接敌/攻城等待动画与近似 ID3 SFX；
- `0x4B63` 野战地形与布局/镜像选择；
- 野战和攻城 `0x5130` 战略速算；
- 六单位与士气战果回写；
- `0x474A/0x487B/0x291A/0x2977/0x29C3/0x2A7E` 战后继续、撤退和武将去向；
- `0x4DA4` 破城同城守军组撤退；
- 玩家委任军团命令优先与自动战斗行为。

**当前主线：战术攻城城壁对象状态机。**
已知 `0xA65D→0x9FF8` 的最终城损聚合公式，但尚未移植 `0x9B40` 城壁对象初始化、受击和 bit/metric 更新；在此之前战术攻城没有真实 `wallRecords` 时明确不写城损。

次级待办：原版路线平权动态比对、`+0x23` 等字段产品命名、YNSOUND ID3 音色解码，以及更完整的战术 AI/兵种/士气行为。
