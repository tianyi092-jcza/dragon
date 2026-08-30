# Checkpoint Journal — 2026-08-30 战略军团与战斗底层

> 本文件记录本轮会话的详细进展、调试过程、失败尝试、相关文件、阻塞和下一步。
> 长期项目记忆已整理到 `AGENTS.md`；逆向证据详见 `re-notes-march-pathfinding.md` 与 `re-notes-kernel.md`。

## 1. 本轮目标与范围

本轮从“战术战斗前先还原战略军团”开始，依次完成：

1. 原版据点道路拓扑与点列移动；
2. 势力固定军团标识与接敌等待态；
3. 野战地形/战场布局选择；
4. 野战与攻城战略速算；
5. 战后继续、道路撤退、延迟回归和被俘；
6. 破城后同城守军组撤退；
7. 修复玩家委任军团收到目标后不行军；
8. 定位战术攻城城损链，并明确尚缺的城壁对象状态机。

提交前已审查全部改动与未跟踪文件，移除无关格式噪音、本机存档内容和可再生大型 probe JSON；真实 `E:/Dragon/Dragon/SAVE.DAT` 始终只读。

## 2. 详细进展

### 2.1 道路拓扑与移动

- 逆向 `KI.EXE 0xE4CE..0xE992`，从 `MMAP.MAP` 构建原版道路图：
  - 192 个据点节点；
  - 254 条无向道路边；
  - 单一连通分量；
  - 完整道路点列共 5526 点，边长 6..84；
  - 反向边、端点解析与诊断异常均为 0。
- 闭合 `0x491B/0x4A0F`：四个有序 tagged edge slot、`0x4000/0x8000` 端点标签、加权搜索返回第一条边和 `stride=±4`。
- 对 192×191 个有序据点对验证：距离 mismatch 0，非法 first hop 0。
- 新增 `roadgraph.js`，据点命令改走原版拓扑；军团沿边点列逐战略更新移动，到边端下一次更新重新寻路。
- `roadApproachesAt()` 支持道路内部点的多条边出现，端点顺序校正为 `edge+8` 后 `edge+6`，供 `0x487B` 撤退选择。
- 大地图和小地图路线绘制改为只读导航状态，不再由渲染层推进路线。

### 2.2 军团标识、接敌和音效

- 从 `MMAP.MCH` 提取 24 个样式槽×5帧，共 120 张原版 PNG；势力记录 `+0x3E` 解析为 `march_marker_style`。
- 删除臆造的 `mark0.svg`～`mark3.svg`，不再使用独立颜色循环或任意角旋转。
- 移动方向帧：0西、1东、2北、3南；到达/驻止帧为4。运行时字段使用 `_markerFrame`，不写入稳定快照。
- 从 `MMAP.MCH + 0xA000` 解析5组×4相接敌动画并生成审查图；产品资产只保留运行时有实锤引用的 group 0 四帧。
- 接触检测移到坐标写入前：发起方停在原道路点，不提前进入敌军或城市坐标。
- 接敌状态按原版名义12、同轮减至11，再逐调度到1；防守方不被同步置等待态。
- `speaker.engageSfx()` 复刻调用时序和忙状态门控；实际 YNSOUND ID3 音色仍仅为近似。

### 2.3 野战地形与 BATTLE.MAP

- 新增 `fieldterrain.js`，移植 `0x4B63..0x4C71`：
  - `CS:0x982F` 的14段图块分类；
  - `CS:0x97F0` 的21条地形组合；
  - 输出目录 `0xC0..0xD5`；
  - 反向组合设置水平镜像 bit `0x40`。
- 修正旧 BATTLE.MAP 解析误判：目录项是 `[layout, theme]`，不是 `[theme, layout]`；布局窗口起点是 `0x200 + layout * 256`，不是 `layout * 4096`。
- 重新生成 `web/battle_maps.json`，实际战场布局只有 `0/1/2`；删除错误生成的 theme 编号 PNG。
- 野战使用真实军团防守方，不再构造 synthetic city；`BattleView` 支持 field battle、独立防守势力和镜像战场。

### 2.4 SAVE 军团表勘误

- 发现此前将运行时状态段 `0x2240` 直接当成 SAVE 槽文件偏移，导致解析出伪军团和错误主将。
- 正确文件偏移为 `0x22C0`（槽头 `0x80` + 状态段 `0x2240`）。
- `parse_save.py`、`savegame.js` 已改为读写：
  - `+0` 状态、`+1` 势力、`+2/+3` 主将；
  - `+4` 总兵、`+6` 士气；
  - `+28+i*4` 的六个单位兵力/兵种；
  - status 8 与 `+3` 倒计时的延迟回归槽。
- 真实 SAVE 只读验证覆盖128个军团槽：四槽活跃军团数 `[32,0,9,0]`；主将槽与军团槽一致，`+4` 等于六单位十人制兵力合计。

### 2.5 野战速算与主防守军

- 新增 `autobattle.js`，实现 `0x5285/0x52D7/0x5130/0x51B3` 的可注入 RNG 纯函数。
- `0x4C72` 已确认不是多军团合并：扫描同坐标目标势力军团后，按

  ```text
  (troops >> 4) * (morale >> 4) * ((general.battle_rating >> 4) + 1)
  ```

  只选一个最强主防守军。
- 兵种权重表：
  - row0 `[2,3,3,0]`
  - row1 `[3,2,1,0]`
  - row2 `[1,3,2,0]`
  - row3 `[2,1,2,0]`
- `0x52D7` 末段闭合为 `((u32(basePower) * modifier) >> 10) & 0xFFFF`，JS 使用 `Math.imul` 保持乘法语义。
- 野战速算回写双方六单位、总兵和士气；玩家直属军团进战术层，AI和委任军团速算。

### 2.6 战后继续、撤退和武将去向

- 实现 `0x474A`：检查士气与第一单位；胜方或已在己方城的军团继续，败方寻找撤退路线。
- `0x487B` 已改为固定朝势力首都方向：从当前道路格按 `+8/+6` 端点顺序选可通往首都且属于己方的候选，不是“最近友城”。
- 实现 `0x291A` 分派：君主、同势力、 neutral 接收或通过 `battle_rating` 随机门槛者进入延迟回归，否则被俘/退场。
- `0x2977/0x2A7E`：军团移除，武将进入独立 48 调度周期队列；到期恢复武将待命，不自动重建军团。
- `0x29C3`：更新武将 status、新旧势力和特殊退场/君主 bit。
- SAVE 序列化可把队列写回 DOS 兼容的 status 8 槽；Web 即时快照保留队列但剔除可重建导航缓存。

### 2.7 攻城速算与破城守军

- 攻城速算使用 `0x5130(AL=0)`：攻方权重 row3，守方 row0 并叠加城防；双方 commander mode 均为攻城专长。
- 攻城入口先由 `0x4C72` 选择同城最强真实守军并回写其六单位/士气；仅在没有守军军团时调用 `0x4F8A` synthetic garrison：城兵展开为六个弓兵单位，士气 `0xFF`，主将索引 `0x7F`。
- 查证 20 个原始剧本的武将槽127均为固定占位档案：三种战斗专长0，武力/统率/政治8；Web 使用显式 8/8/0 profile，避免误读普通武将。
- 战略攻城每轮 `0x51B3` 按 `((0x3F-ratio)&0xFF)>>2` 同步损伤城兵、上升率、防灾。
- 实现 `0x4DA4`：据点先易主，再由同城原守方最低槽军团求一次撤退目标；全部原守军共享目标城/节点，但各自重建路线。无有效路线则逐军团调用 `0x291A`。
- 移除攻方失败时 `_bases` 历史瞬移和固定一月监禁，统一进入战后继续/撤退/去向链。

### 2.8 战术攻城城损定位

- 逆向 `0xA65D→0x9FF8`：扫描16条 `0xC00` 城壁对象，筛选 `kind==1`，取最小 `+0x18`；若全部对象 bit0 仍置位则 metric×4。
- 最终城损：

  ```text
  damage = (cityTroops + 50 - floor(metric / 10)) >> 3
  ```

  并同步扣城兵、上升率、防灾。
- 新增 `applyTacticalSiegeCityDamage(city, wallRecords)` 和战术回调 plumbing。
- 当前 `battle.js` 明确返回 `wallRecords=null`，因为尚未实现 `0x9B40` 初始化及城壁受击状态；守方获胜时也不会用 `defLeft`、战略 ratio 或假 metric 改写城池。

### 2.9 玩家委任军团不行军修复

症状：玩家选择目标并委任后，军团没有沿目标行军。

根因：通用 AI 分支在目标命令执行前覆盖了委任军团的 `target`。

修复：

- 玩家已下达的 target 无论 `delegated` 与否均具有最高优先级；
- 军团先完成玩家目标，再恢复自主决策；
- 委任军团参与战斗走战略速算，不弹玩家战术层；
- 移动一步后正确触发战略地图 redraw。

浏览器实测 city58→59：第一日冷却归零且目标保留；第二日 x=173→175，建立 `_march`，路径18点，时钟未被错误 hold。

## 3. 调试与失败尝试

- 早期使用 bitmap A* 和直线插值，能“走到”但会穿越非原版道路；已由拓扑点列模型替换。
- 曾把 `0xCB..0xD3` 全部称为道路 tile；实际它们是192个据点/关卡节点起点，已修正文档。
- 曾对 `MMAP.MCH/MDL` 错用 MMAP.MAP RLE，生成错误 bin；现已删除错误资产。
- 曾认为 BATTLE.MAP 布局按 `layout*4096` 排列且目录为 theme/layout；两者均已被加载器与输出交叉否定。
- 曾计划把同坐标多个防守军团合并参战；`0x4C72` 证明只选一个主军，破城组撤退才处理同城全部军团。
- 曾把 `0x291A` 理解为“撤退到最近据点”；实为无法继续行动后的延迟回归/被俘分派。
- 曾为攻城失败保留 `_bases` 瞬移、固定月数囚禁；与 `0x474A/0x291A` 不符，已移除。
- 曾准备以战术 `defLeft` 或战略 ratio 推算玩家攻城城损；因缺少真实城壁对象状态，明确拒绝该近似。
- Node 自定义 fetch smoke 一度返回缺少 `status` 的对象，触发 `road_graph.json HTTP undefined`；这是测试 stub 问题，不是产品加载失败。
- 浏览器验证中唯一稳定控制台错误为 `favicon.ico` 404，与游戏功能无关。

## 4. 本轮相关文件

### 新增核心代码

- `web/src/game/roadgraph.js`
- `web/src/game/fieldterrain.js`
- `web/src/game/autobattle.js`

### 主要修改代码

- `web/src/game/ai.js`
- `web/src/game/battle.js`
- `web/src/game/pathfind.js`
- `web/src/game/savegame.js`
- `web/src/main.js`
- `web/src/render/mapview.js`
- `web/src/render/battleview.js`
- `web/src/ui/gamebar.js`
- `web/src/core/speaker.js`

### 解析器、资产和文档

- `tools/decode_mmap.py`
- `tools/parse_battle.py`
- `tools/parse_save.py`
- `tools/parse_sinario.py`
- `tools/extract_march_markers.py`
- `tools/probe_march_topology.py`
- `tools/probe_march_search.py`
- `web/road_graph.json`
- `web/road_graph.json`（版本化运行时资产）
- `web/road_graph_probe.json`、`web/road_search_probe.json`（由工具按需再生，不提交）
- `web/grf/march_markers/`
- `web/grf/engage/`
- `web/battle_maps.json`
- `web/data.json`
- `web/save.json`
- `docs/re-notes-march-pathfinding.md`
- `docs/re-notes-kernel.md`

### 新增回归

- `tools/verify_road_graph.mjs`
- `tools/verify_march_navigation.mjs`
- `tools/verify_engagement_state.mjs`
- `tools/verify_field_terrain.mjs`
- `tools/verify_autobattle.mjs`
- `tools/verify_field_result.mjs`
- `tools/verify_postbattle_fate.mjs`
- `tools/verify_siege_result.mjs`
- `tools/verify_save_legions.py`
- `tools/verify_save_roundtrip.mjs`

## 5. 最后验证状态

最近一次完整相关回归均通过：

- road graph：192节点、254边；
- march navigation：典型路线逐点推进及委任命令优先；
- engagement：野战/攻城接触都停在占用点之前；
- field terrain：5272个道路移动点、19种目录、1303个镜像场景；
- autobattle：野战权重、主将修正、确定性伤亡与守恒；
- field result：六单位/士气回写、胜方继续、败方撤退；
- postbattle fate：道路撤退、48周期回归、被俘；
- siege result：mode0速算、战略城损、组撤退、战术城损纯函数；
- save legions：真实 SAVE 只读计数 `[32,0,9,0]`、128槽、偏移 `0x22C0`；另验证 canonical 城池字段、slot64 延迟回归与 slot126 活动军团序列化。

JS syntax、Python `py_compile`、LSP、Lens 和 `git diff --check` 已通过；仅有 Git 的 LF→CRLF 提示。

## 6. 当前阻塞

### 产品阻塞

战术攻城尚不能产生原版城损，因为缺少真实城壁对象：

- `0x9B40` 城壁对象初始化；
- 城壁对象 `kind/bit0/+0x18` 的初值；
- 单位攻击城壁时的命中、bit清除和 metric 更新；
- 战斗退出时如何把完整16条记录交给 `0xA65D`。

在这些字段闭合前，保持 `wallRecords=null` 是刻意且正确的行为。

### 流程状态

- 本轮提交前已排除 `.codegraph/`、Playwright 会话、日志、截图、缓存和 scratch 文件。
- `web/save.json` 已改为四个空槽的脱敏静态 fixture，不提交本机真实游玩状态。
- pi-lens 会自动格式化文件；继续修改 `ai.js`、`autobattle.js`、`savegame.js` 和验证脚本前必须重读。

## 7. 下一步

1. 逆向并移植 `0x9B40` 城壁对象初始化，先做只读探针和字段不变量，不直接猜测 UI 行为。
2. 追踪战术攻击对16条 `0xC00` 记录的更新路径，建立可注入、可回放的 wall-object 状态测试。
3. 将真实 wallRecords 接入 `BattleView.finish()`，用已实现的 `0xA65D→0x9FF8` 公式写回城兵/上升率/防灾。
4. 补一条浏览器攻城冒烟：城壁受击→战斗结束→战略城损与对象记录一致。
5. 次级逆向：路线平权动态比对、`+0x23` 命令状态命名、YNSOUND ID3 音色、战术 AI/兵种/士气细节。
