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
| `web/src/game/tacticalbattle.js` / `game/battle/` | 战术战斗入口；当前实时模型将逐步替换为原版规则兼容模拟器 |
| `web/src/game/battle/originalrng.js` | KI.EXE `0xEC82/0xECE0` 原版随机源与可回放状态 |
| `web/src/game/battle/originalstate.js` / `originalcommands.js` | 原版 `0xC00` 对象池、字节字段、命令广播与切换 |
| `web/src/game/battle/originalinit.js` | `0x9E97→0x9AF4→0x9C45` 两侧临时记录、6×8对象模板和固定96次RNG激活 |
| `web/src/game/battle/originalsession.js` / `originaltargeting.js` | 固定逻辑帧、确定性输入回放与 `0xA85B` 目标选择 |
| `web/src/game/battle/originalcollision.js` / `originalresult.js` | 原版碰撞伤害、活动对象回组六队及战后士气 |
| `web/src/game/battle/originalmovement.js` / `originalmoveframe.js` | 四向/上下层探针、AF65移动状态机与B240占用提交 |
| `web/src/game/battle/originalpathqueue.js` | C653/AED2环形队列、0x3000路径区与B00D路径项 |
| `web/src/game/battle/originalnavigation.js` | CAEB/BB3C/BBA6地图资产、双平面导航与高度描述 |
| `web/src/game/battle/originalpathfinder.js` | BD46..BFF1双平面代价寻路与64项回溯 |
| `web/src/game/battle/originalmapobjects.js` | 9CB3/9CE2/9DA1地图对象与B5B7/B824城壁碰撞 |
| `web/src/render/battleview.js` | Web 战术表现层、镜像战场、单位结果和城壁记录回传 |
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
7. **存档途中导航**：二进制 SAVE保存status、目标节点/坐标/城和命令态，但不保存运行时edge/stride/point指针；载入后重建导航。Web私有完整RNG快照只进即时JSON metadata，不占SAVE.DAT未知尾段。
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

**当前主线：原版战术规则兼容模拟器。**
产品定稿要求是“动画可以不同，但胜负、六队伤亡、士气、城壁与据点城损必须按原版”。当前 Web 实时 `simulation.js` 的伤害、士气、克制、冲锋、齐射和超时判胜均只是临时表现模型，不得作为最终规则。已闭合城壁对象构造/metric/破坏bit/战后城损、KI.EXE `0xEC82/0xECE0` 原版随机源、`0xC00` 对象池、固定逻辑帧、命令广播、目标选择、碰撞伤害与精确 RNG 短路、六队对象初始化/固定96次RNG激活、玩家/AI命令跳表、`A754/A785` 96槽顺序、`AA2C`阵型目标、活动子对象`A7FD`、四向及`B0D3/B116`上下层探针、`ABD2/ABFF/AC55`攻击入口、`AD2D/AD7F`与`B8AA`固定效果槽、`ADC8/AEA9`活动计数，以及战后六组/士气；真实自动撤退为首对象 `+3 < 0x32`，并包含mode0每10帧HP衰减，绝不是Web临时士气12/兵力25%。效果对象`B941→B97E→BA2E→BAB7`逐帧生命周期、`B1B1`真实平面探针及`0x9FDC`战术退出也已闭合。`C653→AED2`队列与`B00D`路径项、战后`0x291A`严格原版字节RNG，以及原版会话对Canvas正式tick/finish/命令接管均已完成；B00D路径区已修正为0x3000字节，双方无别名；UI命令使用固定帧队列，组长/子槽同步；`B240`占用提交与`AF65..B00C`移动状态机已正式接入；`CAEB→BB3C/BBA6→BD46`地图资产、双导航平面、代价寻路和64项回溯已闭合，注意目录/tile来自BATTLE.MAP、`0xF800` D302属性大块来自BATTLE.MDL、BATTLE.SCH只提供每layout 0x100块；SAVE已保存撤退关键字段并用JSON metadata保存完整RNG快照。Canvas不得再通过`simulation.tickBattle`写胜负数据。`9CE2/9DA1/9E10`地图对象及`B5B7/B824/BB6D`城壁碰撞、tile改写与bit7刷新也已进入Session，9E10固定从0xE00且D302索引只对BL加偏移。ADC8固定顺序为AE56→AED2→AF69/B240扫描；BD46的EB/74只控制跨层而非方向mask；阵型基准为2005/203A，D35不得依赖玩家势力，战后兵力比例统一十人单位。`originaldiff.js`已提供规范化规则包、hash和首差异字节定位；真实KI.EXE逐帧捕获仍需DOSBox-X debugger。TALK通用入口075B无战术调用者，606..669暂按不可证可达处理，Web对白只属表现政策。

战术画面中的双方发言固定通过两个带主将/NPC头像的通话框按侧显示；`0xC315` 是战术旗帜/主将标识呈现，不是TALK索引，具体句子在原版选择桥闭合前必须标注为Web呈现政策。

次级待办：原版路线平权动态比对、`+0x23` 等字段产品命名、YNSOUND ID3 音色解码。
