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

---

# Checkpoint — 2026-08-30：战术规则兼容、地图对象与差分基础设施

## 1. 本轮目标

本轮主线是继续把 Web 战术战斗从“视觉近似模拟”收敛为可与 KI.EXE 对照的规则兼容实现，重点包括：

1. 根据最新反汇编证据修正 `0x9CE2/0x9DA1/0x9E10` 地图对象的地址分区、扫描顺序和 RNG 消费；
2. 闭合 `B5B7→B824→BB6D` 城壁/障碍延迟破坏、tile 改写、占用清理和 terrain bit7 刷新；
3. 处理 reviewer 指出的 P1 问题：路径模式、固定帧顺序、阵型基址、地图碰撞重排队、士气单位换算等；
4. 建立可供未来 KI.EXE/Web 逐帧比较的规范化差分包和 fixture 回放器；
5. 明确 TALK 606..669 的证据边界，不把无法证明的句子选择规则冒充原版机制；
6. 运行完整战术、战后、SAVE 和浏览器回归，确保本轮修正没有破坏现有流程。

产品最终要求不变：Canvas、场景尺寸和动画可不同，但固定相同的初始状态、命令帧与原版 RNG 时，胜负、六队伤亡、士气、城壁、据点属性和战后去向必须与 KI.EXE 一致。规则只能由 `OriginalBattleSession` 推进，渲染层不能改规则状态或额外消费 RNG。

## 2. 已完成工作

### 2.1 地图对象 `9CE2/9DA1/9E10`

重构了 `web/src/game/battle/originalmapobjects.js`，现在保留原版绝对地址分区：

- `9CE2` 从 `0xC00` 开始建立 `0xD0..0xDF` 连续墙段；
- `9DA1` 继续使用前一 pass 留下的地址和碰撞 ID；
- `9CE2 + 9DA1` 共同占用前 16 个 `0x20` 字节槽，即 `0xC00..0xDFF`；
- `9E10` 不再顺序追加，而是强制从 `0xE00` 开始；
- `9E10` 按 64×64 row-major 顺序扫描；
- 属性索引按原版只对 `BL` 加偏移，不向 `BH` 进位；
- 只有命中 `0xBA..0xBF` 的接受 tile 才建立 kind 3 对象；
- 每个接受 tile 恰好消费一次 `rng.nextByte()`，拒绝 tile 不消费 RNG；
- 对象写入 `flags/kind=0x03C0`、`+6=x`、`+8=y`、`+0A=attribute offset`、`+1C=0x0150/0x0204`、`+1B=rng&3`。

地图对象内存扩展到能够容纳固定 `0xE00` 起始的属性对象区，并保留 snapshot/restore。

### 2.2 `B5B7/B824/BB6D` 延迟破坏与 tile 刷新

已实现并验证：

- metric 从 1 减到 0 的当前碰撞不会立即破坏；
- 下一次 metric 已为 0 的碰撞才进入 `B824`；
- 按对象 `+0x1A` span 从上到下逐 tile 处理；
- tile `< 0xF0` 时 `+0x10` 并产生事件 4；
- tile `>= 0xF0` 时 `+0x08` 并产生事件 5；
- 每个 tile 调用 BB6D 等价刷新，按新 tile 重建七层 terrain bit7；
- 清六个占用平面的低 7 位碰撞 ID，但保留/重建 bit7；
- 清高度/动态描述；
- `B824` 设置对象 bit0，调用者随后清 bit7；
- 设置 `registers.mapRedraw`，对应原版 `D348=1`；
- Canvas 使用逐 tile 事件和 redraw 投影，C4FA 的 VGA 旧点绘制不进入规则层。

地图对象碰撞后补回了 `B613→C653`：攻击者无条件请求重建路径，重复请求仍由对象 bit4 去重。

### 2.3 CAEB 资源来源与导航内存布局

重新核对原版文件名和读取窗口：

- `BATTLE.MAP`：目录和 64×64 tile；
- `BATTLE.SCH`：每个 layout 的 `0x100` 调度块；
- `BATTLE.MDL`：`0x1000 + layout*0xF800` 的 D302 属性大块。

更新了 `tools/export_battle_maps.py` 并重新生成 `web/battle_navigation.json`。

导航构建结果现在作为相对 `0x0000..0x2FFF` 数据写入 Session 的 `0x7000` 基址，避免错误覆盖对象/效果/地图对象等低地址内存。Session 空间内存覆盖到 `0x9FFF`，支持：

- `0x7000/0x8000` 双导航平面；
- `0x9000` 代价区；
- 原有低地址占用、描述和临时区域。

另外为异常对象坐标增加边界保护：候选空间地址超出原版合法窗口时不再让浏览器抛 `RangeError`，而是按阻塞/请求重建路径处理。

### 2.4 BD46 路径模式修正

reviewer 指出此前把 `CL=0xEB/0x74` 错当成方向 mask。现已改为：

- 四向展开始终检查导航字节的 `0x10/0x20/0x40/0x80`；
- `0xEB` 只表示不走跨层分支；
- `0x74` 允许在 bit `0x08` 条件满足时跨平面；
- 垂直路径代价包含两平面 level 差；
- cardinal relaxation 按原版波前和地形代价顺序处理；
- `tools/verify_battle_original_navigation.mjs` 的跨层 fixture 改用 mode `0x74`。

`BD96..BDBE` 罕见的备用起始平面/阻塞端点分支尚需真实 KI.EXE fixture 最终确认，文档已明确保留该证据边界。

### 2.5 固定帧 ADC8 顺序

`OriginalBattleSession.tick()` 现在按逆向证据执行：

```text
AE56 自动撤退检查
→ AE73/mode0 首对象定时 HP 衰减
→ AED2 每帧最多处理两个路径请求
→ 地址升序 AF69/AF65 移动和 B240 占用提交
→ ADC8/AEA9 活动对象重算
```

移动更新已从命令 executor 回调中分离，避免同一帧的 handler 顺序改变规则结果。未初始化对象的纯 Session 单元测试不会凭默认零 HP 产生虚假的自动撤退事件，但正式对象会话仍执行上述顺序。

### 2.6 阵型、侧别和战后士气修正

已修正 reviewer 指出的规则偏差：

- 0 侧阵型基准改为 `0x2005`；
- 1 侧阵型基准改为 `0x203A`；
- `battleSideFlag/D35` 不再根据“玩家控制哪一侧”决定，而由战场镜像/方向状态决定；
- 战后旧兵力先统一转换为原版十人单位，再与新兵力比较；
- 避免旧兵力按人数、新兵力按十人单位造成士气比例缩小十倍。

### 2.7 差分基础设施

新增：

- `web/src/game/battle/originaldiff.js`
- `tools/verify_battle_original_diff.mjs`

支持：

- 将 Session 转为规范化规则包；
- 记录 frame、finished、winner、registers、RNG、命令队列；
- 对对象池、地图对象、效果池、空间内存、tile、temp、路径队列和路径区计算确定性 FNV-1a hash；
- 可选保存全部原始字节；
- packet 比较时报告第一个不同字节；
- 从固定初始 snapshot 和命令帧 fixture 重放 Web 战斗。

该工具目前可验证 Web 自身确定性，并为未来 KI.EXE 捕获数据提供统一输入格式；它不等于已经完成真实 KI.EXE 动态差分。

### 2.8 TALK 静态调查结论

进一步确认：

- 通用 TALK 索引/格式化入口是 `0x075B`；
- `0x075B` 的直接调用者不在战术核心；
- `0x93E9/0x9409` 是通用菜单选择路径，不是战术 TALK 读取器；
- `0xC315` 是按侧显示旗帜/主将标识的呈现逻辑，不是 TALK.DAT 读取器；
- TALK 606..669 虽为连续语义池，但静态扫描没有找到战术运行时可达桥。

因此当前结论只能是：606..669 在此 KI.EXE 构建中可能未启用或不可达。Web 双通话框的具体句子映射继续明确标记为表现政策，规则层只输出事件和说话侧别。

### 2.9 文档和长期记忆更新

已更新：

- `AGENTS.md`
- `docs/re-notes-tactical-rules.md`

记录地图对象地址分区、BD46 模式、ADC8 顺序、阵型基准、兵力单位、TALK 证据边界和动态差分阻塞。

## 3. 关键决策

1. **原始地址优先于高级对象模型**：地图对象、效果、路径和导航必须保留 KI.EXE 地址分区，不能因为 JS 容器方便而顺序追加或重映射。
2. **规则帧和表现帧彻底分离**：`OriginalBattleSession` 是唯一规则写入者；Canvas RAF 只消费 Session 输出并插值绘制。
3. **RNG 调用次数和短路顺序属于兼容结果**：地图对象初始化、碰撞、战后去向和未来 TALK 若使用 RNG，都必须保持原版调用数量及次序。
4. **命令只能在固定逻辑帧生效**：DOM 事件不得直接改对象状态，必须进入 Session 命令队列。
5. **B824 的 C4FA 不移植为规则逻辑**：C4FA 是 VGA 局部刷新；Web 以事件和 redraw flag 投影，不能让绘制代码参与 tile 状态变化。
6. **D35 不是玩家侧标志**：相同战斗不能因玩家选择攻方或守方而改变原版规则流。
7. **兵力单位必须在边界显式转换**：原版通常是十人单位，Web/UI 常是人数；禁止在同一公式中混用。
8. **未证明的 TALK 不写成原版机制**：双通话框保留，但句子映射只能称为 Web 表现政策。
9. **差分工具与真实差分分开表述**：已有 packet/hash/replay 基础设施，不代表已经获得 KI.EXE 逐帧 ground truth。
10. **不清理整个工作区**：当前存在大量同一主线的未提交改动，禁止整体 `reset/clean`；只删除明确的临时反汇编和浏览器文件。

## 4. 失败尝试与排障记录

### 4.1 Session 测试首帧多出自动撤退事件

调整 ADC8 顺序后，`verify_battle_original_session.mjs` 的事件数量从预期 `[0,0,2,0]` 变成 `[1,0,2,0]`。原因是测试构造了未初始化对象池，双方首对象 HP 默认是 0，提前执行 AE56 后被识别为自动撤退。

处理：只在正式对象已初始化，或调用者明确提供对象处理/活动重算时执行 AE56/AED2 对象帧链。没有回退正确的 ADC8 顺序。

### 4.2 浏览器推进时空间内存越界

首次浏览器冒烟在 `probeOriginalCardinalSpatial()` 抛出：

```text
RangeError: original battle spatial access outside memory
```

先扩大空间内存仍未彻底解决，因为根因包含两部分：

1. 导航数据错误写在空间内存地址 0，覆盖了低地址对象占用语义；
2. 某些测试构造的对象坐标会产生超过 `0x6FFF` 的候选空间地址。

最终修复：

- 导航相对块写到 `0x7000`；
- 空间内存扩展到 `0xA000`；
- 对非法候选地址和过大 descriptor index 做阻塞/重排队保护。

修复后浏览器可推进 12 个固定逻辑帧，不再越界。

### 4.3 导航生成曾包含错误的伪高度描述区

早期 `buildOriginalBattleNavigation()` 返回长度 `0x8000`，并在相对 `0x7000` 写入根据 tile level 推测的高度描述。如果再整体复制到 Session，会覆盖/错位实际内存。

处理：导航生成器只返回实际 `0x3000` 的双平面和代价区；由战术入口整体写入 Session `0x7000`。不再把推测描述混入资产块。

### 4.4 资源文件归属曾有混淆

曾把 `0xF800` 属性大块归到错误文件。重新读取 CAEB 和文件名装载链后确定其来自 `BATTLE.MDL`，而 `BATTLE.SCH` 只提供 `0x100` 调度块。已更新 exporter、资产和文档。

### 4.5 DOSBox 0.70 无法建立自动捕获链

检查了项目自带 `E:/Dragon/dosbox.exe`，但该版本未发现可脚本化内存读断点、寄存器导出或 debugger automation。无法安全地宣称已经完成 KI.EXE 动态逐帧比较。

决定：保留现有原版二进制不改，未来使用 DOSBox-X debugger 或等价可调试模拟器；当前只完成 Web 侧 packet/replay 和捕获点设计。

### 4.6 TALK 606..669 无静态战术桥

多次从 `0xC315`、`0x93E9/0x9409` 和 TALK 指针表交叉引用追踪，均未找到战术调用。不能因为文本语义像战斗对白就直接映射为原版运行时选择。

决定：停止继续基于语义猜测，下一步改用运行时读断点验证。

## 5. 相关文件

### 5.1 本轮核心规则文件

- `web/src/game/battle/originalmapobjects.js`
- `web/src/game/battle/originalnavigation.js`
- `web/src/game/battle/originalpathfinder.js`
- `web/src/game/battle/originalspatial.js`
- `web/src/game/battle/originalmovement.js`
- `web/src/game/battle/originalmoveframe.js`
- `web/src/game/battle/originalpathqueue.js`
- `web/src/game/battle/originalsession.js`
- `web/src/game/battle/originalstate.js`
- `web/src/game/battle/originalexit.js`
- `web/src/game/battle/originalformation.js`
- `web/src/game/battle/originaldiff.js`
- `web/src/game/tacticalbattle.js`
- `web/src/main.js`

### 5.2 资产与解析器

- `tools/export_battle_maps.py`
- `tools/parse_battle.py`
- `web/battle_navigation.json`
- `web/battle_maps.json`
- `web/battle_rules.json`

### 5.3 本轮重点验证脚本

- `tools/verify_battle_original_diff.mjs`
- `tools/verify_battle_original_map_objects.mjs`
- `tools/verify_battle_original_navigation.mjs`
- `tools/verify_battle_original_path_integration.mjs`
- `tools/verify_battle_original_path_queue.mjs`
- `tools/verify_battle_original_move_frame.mjs`
- `tools/verify_battle_original_state.mjs`
- `tools/verify_battle_original_session.mjs`
- `tools/verify_battle_original_movement.mjs`
- `tools/verify_battle_original_vertical.mjs`
- `tools/verify_battle_original_formation.mjs`
- `tools/verify_battle_original_result.mjs`
- `tools/verify_battle_facade_original.mjs`
- `tools/verify_battle_dialogues.mjs`
- `tools/verify_battle_viewport.js`
- `tools/verify_postbattle_fate.mjs`
- `tools/verify_save_roundtrip.mjs`
- `tools/verify_field_result.mjs`
- `tools/verify_siege_result.mjs`

### 5.4 逆向笔记和长期说明

- `AGENTS.md`
- `docs/re-notes-tactical-rules.md`
- `docs/re-notes-kernel.md`
- `docs/checkpoint-journal.md`

### 5.5 外部原版和工具

- `E:/Dragon/Dragon/KI.EXE`
- `E:/Dragon/Dragon/BATTLE.MAP`
- `E:/Dragon/Dragon/BATTLE.SCH`
- `E:/Dragon/Dragon/BATTLE.MDL`
- `E:/Dragon/Dragon/TALK.DAT`
- `E:/Dragon/dosbox.exe`（DOSBox 0.70，不满足动态捕获需求）

## 6. 当前状态

### 6.1 已通过的回归

最近一次完整相关验证全部通过：

- original diff packet/replay；
- map objects `9CE2/9DA1/9E10`；
- `B5B7/B824`；
- navigation 和 BD46 path；
- path integration/queue；
- AF65/B240 move frame；
- facade/state/session/frame；
- movement/vertical/collision/targeting；
- init/formation/executor/commands；
- attack/effect frame；
- exit/retreat/result/RNG；
- 双通话框和战术 viewport；
- postbattle fate；
- SAVE roundtrip；
- field result；
- siege result。

静态检查状态：

- 相关 JS 文件 LSP：0 diagnostics；
- Lens error 级：0；
- `python -m py_compile tools/export_battle_maps.py tools/parse_battle.py`：通过；
- `git diff --check`：通过，仅有仓库既有 LF→CRLF 提示。

浏览器冒烟状态：

- 静态服务器下可创建战术战斗；
- 可排入 assault 命令并推进 12 个固定逻辑帧；
- 无空间内存越界；
- `mapObjects.bytes.length === 0x1400`；
- 阵型基准为 `[0x2005, 0x203A]`；
- RNG 调用和地图对象初始化进入同一 Session 随机流。

### 6.2 架构状态

- `OriginalBattleSession` 是可视战斗唯一权威规则状态；
- Canvas/RAF 不再调用 legacy simulation 决定胜负；
- `settleExit()` 是战术结果唯一权威出口；
- 完整 OriginalBattleRng 快照仅进入 Web JSON metadata，不写 SAVE.DAT 未知尾段；
- 地图对象、路径、效果、占用、命令和退出均可 snapshot/restore；
- 差分 packet 已就绪，但尚无真实 KI.EXE 捕获 fixture。

### 6.3 工作区状态

工作区仍包含大量同一主线的未提交修改和新增文件。不要执行整体 `git reset --hard`、`git clean` 或覆盖真实存档。测试继续禁止写 `E:/Dragon/Dragon/SAVE.DAT`。本轮临时 `.tmp_*` 反汇编、Web server PID/log 和 Playwright 临时脚本已删除。

## 7. 阻塞点

### 7.1 真实 KI.EXE 逐帧 ground truth

最终“100% 原版一致”仍依赖真实 KI.EXE 逐帧捕获。当前项目内 DOSBox 0.70 缺少已确认可自动化的调试接口。

需要捕获的关键状态：

- `0xC00` 双方 96 个对象槽；
- 地图对象 `0xC00..` 分区；
- `D31A..D34E` 全局寄存器；
- RNG 表、索引和调用次数；
- 路径队列、路径区和占用平面；
- tile 破坏与地图对象状态；
- 结束帧和 `0x9FDC` 输出。

建议断点：

- `0x9946` 战术入口；
- `0x9ACE` 单位初始化；
- `0xA065` 固定帧入口；
- `0xADC8` 帧后处理；
- `0xECE0` RNG；
- `0x9FDC` 战术退出。

### 7.2 TALK 606..669 运行时可达性

静态证据无法证明这些文本由战术核心读取。需要在可调试模拟器中对：

- `D38:04BC..053A` TALK 指针区；
- `D38:50F0..56F6` 文本区；

设置运行时读断点，记录实际索引、说话侧和是否消费 RNG。

### 7.3 BD46 罕见起始平面分支

普通四向和 mode `0x74` 跨层已有合成回归，但 `BD96..BDBE` 的备用起始平面/阻塞端点选择仍需真实 fixture。不要在动态差分前写成完全闭合。

### 7.4 全局完整性仍待动态验证

现有测试证明各已实现链条的静态语义和 Web 确定性，但不能代替：

- 原版每帧对象顺序；
- 所有罕见碰撞短路；
- 全局 RNG 调用序列；
- 真实战斗结束帧；
- TALK 实际读取。

## 8. 下一步

1. **准备可调试模拟器**：优先安装/使用 DOSBox-X debugger，确认可脚本化断点、内存 dump 和寄存器导出；不要修改原版数据文件。
2. **建立最小 KI.EXE 捕获场景**：固定剧本、日期、据点、双方武将、六队兵种/兵力、士气和 RNG 种子，先捕获初始化后第一帧。
3. **定义二进制 fixture 格式**：将 KI.EXE dump 转换成 `originaldiff.js` 可比较的 packet，明确绝对地址到 Web 各 blob 的映射。
4. **逐步扩大差分范围**：初始化 → 无命令 1 帧 → 固定命令帧 → 首次碰撞 → 地图对象破坏 → 自动撤退 → `0x9FDC` 退出。
5. **优先定位首差异**：使用 packet hash 和 first-byte report，每次只修第一个差异，避免通过后续补偿掩盖前序错误。
6. **验证 BD96..BDBE**：构造端点被阻塞或跨层起点场景，捕获原版选取的起始平面和代价。
7. **验证 TALK**：在实际战术流程中对 TALK 指针/文本区设置读断点；若从未命中，则保留 Web 表现政策并记录该构建不可达证据。
8. **最终回归**：动态 fixtures 全部通过后，再运行本 checkpoint 中的完整 original/facade/SAVE/field/siege/browser 回归。
9. **宣告标准**：只有固定输入下 KI.EXE/Web 的规则包、RNG 调用和退出 DTO 全部一致后，才可宣称“所有胜负数据由 KI.EXE 原版规则精确决定”。
