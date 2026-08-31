# 卧龙传 Web 复刻 · 项目记忆（Checkpoint Journal）

> 本文件按「长期有效 → 当前状态 → 近期过程」组织，供跨会话快速恢复上下文。
> 完整开发规范仍见 `AGENTS.md`；二进制证据与详细逆向过程见 `docs/re-notes-kernel.md`、`docs/re-notes-march-pathfinding.md`。

---

## 0. 2026-08-31 本轮 Checkpoint：委任边界闭合与硬单实例收口

### 本轮目标

1. 继续逆向并实现委任军团的三个剩余边界：最后一条道路边内据点易主、接敌倒计时 `11→1` 期间目标变化、SAVE 中是否存在独立 field/siege 类型字段。
2. 将原先“并发保存按时间覆盖”的风险改成**硬单实例**：同一套 SAVE/lease 路径只能有一个游戏页面持有运行权；第二页面不得初始化游戏，重复启动的不同端口 Web server 进程也不能分别授予运行权。
3. 修完 detached reviewer 指出的延迟 HTTP 响应、跨进程锁和退出释放竞态，并留下可重复回归。

### 已完成工作

#### A. KI.EXE 行军与接敌边界

- 静态闭合 `0x25CC → 0x2662 → 0x42AB → 0x2708`：每次实际军团更新先清 `status bit5`，再按当前道路和现场对象重新检测；`11→1` 是持续接触确认 timer，不是锁存战型。
- `0x42AB` 每轮读取 active edge 目的端据点的**实时城主和外交**：己方、中立或交战方继续；变成未开战第三方时反转当前道路边。
- `0x2831` 按 128 个军团槽升序寻找下一点的首个活动异势力军团；野战接触不查外交。目标消失时清 `+3` 并在同轮继续移动；目标被第三方军团替换时保留倒计时，但实时对象改为替换者。
- `0x2880` 在最终攻城判定时实时读取端点城主，不沿用命令下达时的归属快照。
- Web 已同步 active-edge `toNode` 检查、原版 slot 顺序、实时 field/siege 重分类、目标消失/替换/停战处理和 runtime slot 唯一性。

#### B. SAVE 道路上下文

- 确认没有独立的 field/siege SAVE 字节。`0x8CFF` 原样保存军团状态段，因此 `+0x0A stride`、`+0x0C point raw address`、`+0x0E edge/node raw address` 均为真实持久字段；读档后战型由道路下一点和实时对象重新判断。
- `roadgraph.js` 增加 E717 固定地址布局与 Web edge/point 的可逆转换；优先恢复 DOS 原始上下文，字段无效时才重新寻路。
- sidecar 只保存 Web 无法放入已证二进制字段的 canonical RNG、强制撤退和精确帧态，不虚构 DOS 字段。

#### C. 硬单实例与保存发布

- 新入口 `web/src/boot.js` 只有成功取得 lease 后才动态 import/初始化 `main.js`；第二页面停在阻塞层，不创建游戏 App、RAF 或可写 SAVE 的运行时。
- `web/src/core/singleinstance.js` 维护 token、generation、服务端有效期和独立本地 expiry timer。heartbeat pending、后台节流或延迟旧响应不能延长已经到期的本地运行权；失权立即冻结战略、战术和委任动画。
- acquire `201` 与 heartbeat `204` 都按请求开始时间、原 deadline、generation 和服务端返回有效期验证。旧请求晚到时不能在新实例接管后重新激活旧页面。
- 页面退出时先同步清空 token/generation/deadline、把状态置为 `stopped` 并冻结本地 runtime，再异步 release。若退出发生在初始 acquire pending 期间，晚到的新 token 会立即释放，不会调用 `onActive`；已 suspended 的页面退出不会重复调用 `onSuspend`。
- `tools/webserver.py` 的 lease RMW 与 SAVE/metadata publication 已从进程内线程锁升级为 OS 级跨进程文件锁：POSIX 使用 `flock(LOCK_EX)`，Windows 使用标准库字节区间锁；不同端口的两个 server 共享同一路径时也只能有一个 acquire 返回 `201`。
- SAVE 二进制、sidecar 和 parse 输出在同一 publication 事务中提交；先在临时文件完成尺寸、metadata 与解析 JSON 验证，全部成功后才原子替换 canonical 输出，失败保持旧存档不变。非 lease 持有者不能读写受保护 SAVE，release/acquire 不能插入提交中途。
- 修正攻城速算专长分流：仅攻方 `0x5285` 兵种权重临时使用行3，攻守双方 `0x52D7` 的 mode0 均读取攻城专长；固定 field/siege 差异 golden 已覆盖。
- selected SAVE 槽改从当前四槽镜像对应槽开始 patch，只覆盖已证字段，保留未建模字节和尾部事件队列；客户端保存采用 stage/commit，失败后内存槽与后续保存底版均不变化。

#### D. 验证结果

新增或重点扩展：

- `tools/verify_single_instance_server.py`
- `tools/verify_save_server_rollback.py`
- `tools/verify_save_client_commit.mjs`
- `tools/verify_single_instance_stale_responses.mjs`
- `tools/verify_single_instance_local_expiry.mjs`
- `tools/verify_single_instance_release_stop.mjs`
- 既有 `verify_engagement_state.mjs`、`verify_march_navigation.mjs`、SAVE metadata/parse/build/startup/loss/UI 系列回归。

最终 focused 输出：

```text
single instance release stop OK: unload freezes locally, rejects delayed successes, and avoids duplicate suspend
single instance stale responses OK: delayed acquire/heartbeat success rejected
single instance local expiry OK: pending heartbeat cannot extend local deadline
single instance server OK: generation/deadline + cross-process lease/save locks
```

并通过相关 Node/Python 语法检查、项目 TypeScript 检查、`git diff --check`、`lens_diagnostics mode=all` 和 fresh Chromium 冒烟；测试未写入真实 `E:/Dragon/Dragon/SAVE.DAT`，工作区无 staged 文件。

### 关键决策

- 最后一边和倒计时不再视为“未知产品竞态”：静态指令流已经足以确认它们是**每轮现场重检**；DOSBox-X 动态 fixture 仅作为后续逐帧盖章，不再阻塞实现。
- SAVE 不新增未经证实的 `engagementKind` 二进制字段；纯 DOS 档按已保存道路上下文在首次 tick 重建 field/siege。
- 单实例的信任边界在服务端 lease，而不是 `localStorage`、标签页广播或“最后写入者胜出”。客户端本地 deadline 只负责更早 fail closed，不能自行延长所有权。
- 解析后的 `save.json`、Web sidecar、lease、锁和临时文件默认放在 `.dragon-runtime/`（静态 `web/` 根之外）；服务端同时显式拒绝敏感静态路径，SAVE 只经 token API 暴露。
- 客户端保存使用 stage/commit：网络或 HTTP 失败不得修改 `app.saves` 或模块内四槽底版，成功响应后才提交并显示成功提示。
- 用户要求的“只能开一个进程玩”包含多个标签页和多个 Web server 进程；因此线程锁不够，lease 与保存发布必须使用共享路径上的跨进程锁。
- 页面仍存活但收到 `pagehide/beforeunload` 时也按永久停止处理；如果进入 BFCache，`pageshow.persisted` 强制 reload，不允许旧 runtime 复活。

### 失败尝试与审查修复

- 第一版 server 只有 `threading.Lock`，只能约束单一 Python 进程；reviewer 指出两个不同端口 server 可同时 read-empty 并各自返回 `201`，随后改为 OS 级跨进程锁并增加双进程并发测试。
- 第一版延迟响应保护只检查 token/本地过期，未完全覆盖旧 acquire `201` 和 heartbeat `204` 在新实例接管后的 stale success；随后加入 generation、请求原 deadline 和服务端有效期验证。
- 第一版 `stopAndRelease()` 先发 release、未同步冻结本地 runtime，仍存活页面可能继续执行；修为先本地失效再网络释放。
- 上述修复后第一次 final review 又发现“退出发生在 initial acquire pending”仍可被晚到 `201` 重新激活，以及已 suspended 后退出会重复 `onSuspend`；现已增加 post-await `stopped` guard、立即释放晚到 token，并按 `wasActive` 决定是否调用 `onSuspend`。
- 长时 worker 最后因 acceptance/reviewer 协调超过运行时限而显示 timeout，但修改已经落盘；主代理逐项检查、补测试并经过最终独立复审，结论为无 P0/P1。LSP 客户端在主代理环境曾不可用，不能把“0 diagnostics”写成 LSP 已确认；实际以 worker 的 TypeScript 检查、Node/Python 检查和 Lens 为准。

### 相关文件

| 路径 | 本轮职责 |
| --- | --- |
| `web/src/game/ai.js` | 最后一边实时城主/外交、接敌 timer、slot 顺序和现场重分类 |
| `web/src/game/roadgraph.js` | E717 raw 地址与 edge/point 上下文可逆恢复 |
| `web/src/game/savegame.js` / `tools/parse_save.py` | 已证道路字段、接敌等待、selected-slot保真、stage/commit与runtime解析态 |
| `web/src/boot.js` | lease 成功后才启动游戏的入口 gate |
| `web/src/core/singleinstance.js` | acquire/heartbeat/deadline/generation、失权冻结和退出释放 |
| `tools/webserver.py` | 跨线程/跨进程 lease 与 SAVE publication 事务 |
| `web/src/main.js` / `web/index.html` | boot 接线、启动与失权后的 App 生命周期 |
| `tools/verify_single_instance_*.js` / `.mjs` / `.py` | 浏览器双页面/失权、stale response、本地到期、退出、startup loss、双 server 竞争和保存授权回归 |
| `docs/re-notes-march-pathfinding.md` / `docs/re-notes-kernel.md` | KI.EXE 地址级证据与 SAVE/道路结论 |

### 当前状态

- 本轮委任行军三个边界与硬单实例已收口；最终 reviewer 对最后两项退出竞态结论为 **无 P0/P1，Merge PASS**。
- 当前工作区仍包含本轮及之前连续开发的 tracked/untracked 修改；必须保留，禁止 `reset/clean`，提交前需按功能拆分审查。
- 正式运行必须使用 `python tools/webserver.py 8321`，直接静态打开或不支持 lease API 的服务一律 fail closed。

### 阻塞点

- 本轮功能无代码级合并阻塞。
- 项目主线仍缺真实 KI.EXE/DOSBox-X 的逐帧捕获，用于 `originaldiff.js` 的 ground-truth 差分和原版战术规则动态验收；这是战术模拟器主线阻塞，不是本轮单实例/行军边界阻塞。
- 次级工程风险：跨进程文件锁依赖所有写入者都通过 `tools/webserver.py` 协议；外部程序直接改写 SAVE 不在 lease 保护范围内。

### 下一步

1. 先从本 checkpoint、`AGENTS.md`、`docs/re-notes-march-pathfinding.md` 和 `docs/re-notes-kernel.md` 恢复上下文，不重新猜测已闭合的最后边/倒计时/SAVE 类型规则。
2. 运行完整战略、SAVE、单实例 focused suite 和 fresh-browser 双页面阻塞冒烟，确认工作区后续改动未破坏本轮结论。
3. 按功能整理当前大工作区 diff；不混入真实 SAVE，不执行破坏性 Git 操作。
4. 回到主线：准备 DOSBox-X debugger 逐帧 capture，与 `originaldiff.js` 规则包比较，优先闭合仍缺动态 ground truth 的战术战斗状态。

---

## 0.1 2026-08-30 委任战略速算逆向闭合

### 单实例三项竞态收口

- 正式启动在每个异步资源/SAVE seam 后重验本地 lease deadline；启动中失权不会发布 `__dragonApp`、进入菜单或启动 RAF。
- 客户端维护 `expiresAt`，独立到期计时器可在 heartbeat pending/后台节流时先冻结规则；204 才续期，409 永久失权。
- 服务端保存按 `SAVE_WRITE_LOCK → LEASE_LOCK` 固定顺序持有 publication 事务，直至 SAVE、sidecar 与 parse 输出完成；release/acquire 不可在提交中途换所有者。

- **实锤地址**：`0x2880/0x4ADE/0x4ED7/0x4F8A/0x5130/0x51B3/0x52D7`。
- 中立据点（文件所属 `0x18`，Web `faction=null`）不再无战占领：进入攻城等待，无真实守军时展开六弓、士气 `0xFF`、主将 `0x7F` 的临时城防并速算。
- 委任权威统一为军团 `status bit2 (0x04)`；新增 `legionmode.js`，UI、build/load、SAVE 和战斗分流统一同步，旧 `delegated` 仅作兼容镜像。
- 玩家委任攻方、委任真实主守军和委任野战双方均走战略速算；无真实守军一律速算，未委任真实玩家军团才进入战术层。
- `0x5130` 只消费同一 `OriginalBattleRng.nextByte()` 流：攻 commander 条件字节→守 commander 条件字节→胜败双方逐队交错 12 字节→必要时 `0x291A`；不再使用 `Math.random()`。
- `0x51B3` 只扣城 `+0x13/+0x10/+0x11`，不改生产力/城兵上限；`0x4CF3` 易主保留扣损后的城兵，不再清零。
- 玩家委任战斗在战略地图使用 app 级单槽 transition：四图预载完成后，RAF 严格播放 `group_0_frame_0..3.png` 各一相，延迟 RAF 不跳相；动画期间稳定 `clock.hold`、阻止同 tick 第二战、完成回调 once，渲染层只读 transition 状态。
- 修复 reviewer blockers：旧 snapshot 委任 bit 迁移先于默认 status；SAVE `+0x0B/+0x20/+0x16/+0x18` 恢复途中目标并重建导航；军团主将仅取 `+2` byte，`+3` 是 bit5 接敌倒计时，不能按 u16 合并；大 dt 在 onDay 获得 hold 后停止追赶；战略速算士气只写一次且无预建 units 也从结果侧记录初始化六队；战术 Session 从 canonical RNG snapshot 初始化并在退出后接回 canonical 流。
- 目标在正常接近前变己方则无战进入，变交战方则攻击实时占领方，变未开战第三方由道路 blocker 重寻路/失败。
- 后续静态闭合：`0x42AB`每轮在最后边读取实时城主/外交，未开战第三方改向另一端；`0x25CC→0x2831/0x2880→0x264A`令`11→1`成为持续接触timer，目标消失同轮继续移动、替换目标保留倒计时，野战不查外交。动态fixture仅作附加盖章。
- 新增回归：固定字节 RNG golden、委任攻守分流/中立攻城、双方六队/总兵/士气端到端一致且无NaN、status bit2 旧快照迁移、SAVE 途中目标与bit5/+3待战恢复（战型不猜字段，载入后按道路下一点重建）、生产命令targetNode、四相预载/精确顺序/once/hold、同tick两场gate、大 dt及月末暂停竞态、单次士气写回、战术→战略→存档 RNG 连续性，以及易主三种正常路径。
- 军师交互补强：羽扇命中优先于所有子层全屏消费，关闭时统一清理行军指示/列表/选中并恢复clock；行军目标/命令层右键回到菜单条展开且八项未选中，不再重开军团列表；任一子菜单选中（含目标选择）地图绝对锁定。
- `0x8CFF`原样镜像完整状态段，军团`+0x0A/+0x0C/+0x0E`道路上下文进入SAVE；Web按E717固定地址布局可逆恢复，字段无效才重寻路。无独立field/siege byte，纯DOS档首次tick现场重检；sidecar只保存canonical RNG、强制撤退和Web精确帧态。
- 正式入口改为持久单实例lease：boot成功取得随机token后才动态初始化主程序；第二页面只显示阻塞层。SAVE读写均授权，heartbeat失败立即冻结，409永久停止；服务端使用线程锁加OS级跨进程文件锁串行lease RMW与SAVE publication，静态无服务fail closed。
- 存档原子性：接敌四相/战术层活动或 `onDay` 后仍待日历进位时，UI 与 `saveGame`/`snapshotState` 均拒绝存档；撤退中或接敌等待中的军团同样拒绝新的玩家行军命令并给出明确提示。资金按确认的24bit `+0x20..+0x22` 完整写回。

---

## 1. 项目边界

- **目标**：不用模拟器，以原生 JavaScript ES Modules + Canvas 2D 复刻 1995 DOS《臥龍傳》。
- **约束**：无框架、无构建、无 npm 运行时依赖；产品直接由静态服务器运行。
- **仓库**：`E:/Dragon/web-port`；原版程序/数据：`E:/Dragon/Dragon/`；官方基准：`E:/Dragon/原版/`。
- **证据原则**：必须依据原版 KI.EXE、数据文件和资源逆向；代码与文档要区分**实锤、推断、未知**，不能把视觉近似写成原版机制。
- **测试红线**：自动化测试禁止写入 `E:/Dragon/Dragon/SAVE.DAT`；保存测试必须 mock `/api/save` 或只操作内存/临时文件。

---

## 2. 当前架构

| 路径 | 职责 |
| --- | --- |
| `web/src/main.js` | 应用装配、主循环、剧本/存档加载、战术层入口与战果回调 |
| `web/src/game/ai.js` | 战略军团调度、道路移动、接敌/攻城、战后继续/撤退/武将去向 |
| `web/src/game/roadgraph.js` | 原版 192 节点/254 边道路拓扑、加权寻径、道路格到端点方向 |
| `web/src/game/fieldterrain.js` | `0x4B63` 野战地形分类、BATTLE.MAP 目录与镜像选择 |
| `web/src/game/autobattle.js` | `0x5130/0x5285/0x52D7` 野战/攻城速算、城池损伤纯函数 |
| `web/src/game/battle/` | 战术战斗原版模拟器：originalrng / originalstate / originalcommands / originalinit / originalsession / originaltargeting / originalcollision / originalresult / originalmovement / originalpathqueue / originalnavigation / originalpathfinder / originalmapobjects |
| `web/src/render/battleview.js` | Web 战术表现层、镜像战场、单位结果和城壁记录回传 |
| `web/src/render/mapview.js` | 战略地图、道路路线、军团标识、接敌动画、据点拾取 |
| `web/src/game/savegame.js` | SAVE.DAT 镜像、槽位 patch、军团与延迟回归状态序列化 |
| `web/src/ui/gamebar.js` | 顶栏、军师菜单、主要 Canvas 列表、地图锁定与右键层级回退 |
| `web/src/game/clock.js` / `core/modalclock.js` | 战略速度、hold 与模态暂停恢复 |
| `web/src/core/speaker.js` | PC Speaker 风格 SFX 与 TYPE 1..4 profile |
| `tools/parse_*.py` | 原版数据解析和 Web 资产生成 |

---

## 3. 关键数据格式

- **逻辑分辨率**：`640×400`；战略地图网格：`384×256`，每格 16×16 像素。
- **道路拓扑**：`web/road_graph.json` 含 192 节点、254 边、5526 道路点列；据点命令走原版拓扑，不在 384×256 bitmap 上自由 A*。
- **军团标识**：势力记录 `+0x3E` 选 24 槽×5帧 `MMAP.MCH` 原版资源，不做运行时染色或任意角旋转。
- **BATTLE.MAP**：目录项为 `[layout, theme]`，布局数据从 `0x200 + layout * 256` 起读 4096B；实际战场布局仅 `0/1/2`。
- **SAVE.DAT**：4 槽，每槽 `0x56C0`；军团表 128×64B，运行时状态段起点 `0x2240`，槽文件偏移因 `0x80` 头部为 **`0x22C0`**。
- **资金**：24bit `word@+0x20 + byte@+0x22 << 16`；兵力记录原版通常以十人为单位，展示/战术单位可能以人为单位，转换处必须注明层级。

---

## 4. 关键交互约定

- **无关闭按钮**：全游戏弹窗/二级界面均无关闭按钮，统一鼠标右键逐层回退。
- **军师菜单唯一开关**：顶栏羽扇图标是军师一级菜单唯一开关；隐藏时强制清理所有子孙窗口与选中状态并恢复计时。
- **地图绝对锁定**：军师任一子菜单被选中时，大地图完全锁定，不能拖拽、点击或悬停拾取。
- **大地图左键纯粹性**：除据点中心和行走中的军团标识外，点击其它位置无功能、不关闭任何界面。
- **右键层级回退**：有子弹窗/选中时，右键关闭最内层并恢复计时；军师菜单条本身保持展开。
- **自动关闭**：NPC 提示框、武将对白弹窗支持 3 秒自动关闭或右键立即关闭，关闭后执行后续回调。
- **读档**：游戏内读档必须返回标题后执行，禁止直接热替换当前 scenario。
- **空存档槽**：标题空存档槽必须在 hover、hit-test、click 三条路径都禁用。
- **玩家目标优先**：玩家下达的军团目标优先于通用 AI；委任只改变后续自主和战斗处理，不能覆盖尚未完成的玩家命令。
- **渲染纯度**：地图与渲染只能读取导航状态，绘制函数不得推进或修改军团路线；列表滚动条在右侧，选中行 `#4a7828`。

---

## 5. 常用命令

启动服务器：

```bash
python tools/webserver.py 8321
# http://127.0.0.1:8321/
```

语法/格式：

```bash
node --check web/src/ui/gamebar.js
node --check web/src/main.js
python -m py_compile tools/parse_save.py tools/parse_sinario.py tools/parse_battle.py
git diff --check
```

战略与战斗回归：

```bash
node tools/verify_road_graph.mjs
node tools/verify_march_navigation.mjs
node tools/verify_engagement_state.mjs
node tools/verify_field_terrain.mjs
node tools/verify_autobattle.mjs
node tools/verify_field_result.mjs
node tools/verify_post_battle_fate.mjs
node tools/verify_siege_result.mjs
python tools/verify_save_legions.py
```

提交前还要运行变更文件的 LSP 与 `lens_diagnostics mode=all`。浏览器冒烟用全新 Playwright 会话，避免 ESM 缓存造成假回归。

---

## 6. 重要坑点

1. **SAVE 偏移**：状态段 `0x2240` 不等于文件偏移；文件军团表是 `0x22C0`。
2. **MMAP 资源**：只有 `MMAP.MAP` 使用对应 RLE；`MMAP.MCH/MDL` 是原始定长资源。
3. **BATTLE.MAP**：目录字节不是 `[theme, layout]`；布局窗口也不是 `layout * 4096`。
4. **野战防守方**：`0x4C72` 从同坐标候选中选一个最强主军，不合并所有军团，也不能用 synthetic city 冒充。
5. **撤退语义**：`0x291A` 不是“退到最近据点”；它是无法继续行动后的武将去向分派。
6. **战术城损**：没有真实 `wallRecords` 时不得用 `defLeft`、战略 ratio 或臆造 metric 写城损。
7. **存档导航**：二进制 SAVE 原样保存`+0x0A/+0x0C/+0x0E`道路上下文；按E717固定地址布局恢复edge/point，只有无效时才重寻路。无独立field/siege byte。
8. **时钟 hold**：系统选单、弹窗和场景切换用 `clock.hold` 冻结；不要通过改速度档模拟暂停。
9. **pi-lens 自动格式化**：回合结束后可能改写格式；继续编辑 `ai.js`、`autobattle.js`、`savegame.js` 和验证脚本前必须重读。
10. **工作区隔离**：提交前按功能审查改动，禁止用整体 reset/clean 处理含未提交工作的工作区。

---

## 7. 当前主线状态

**主线：原版战术规则兼容模拟器。**

已完成并有回归覆盖：

- 原版道路构图资产、拓扑寻径、道路点列移动和方向标识；
- 固定军团标识槽、野外接敌/攻城等待动画与近似 ID3 SFX；
- `0x4B63` 野战地形与布局/镜像选择；
- 野战和攻城 `0x5130` 战略速算；
- 六单位与士气战果回写；
- `0x474A/0x487B/0x291A/0x2977/0x29C3/0x2A7E` 战后继续、撤退和武将去向；
- `0x4DA4` 破城同城守军组撤退；
- 玩家委任军团命令优先与自动战斗行为；
- 战术层原版模拟器已闭合：随机源、对象池、命令广播、固定逻辑帧、目标选择、碰撞伤害、六队对象初始化、路径队列、双平面导航/寻径、地图对象与城壁碰撞、占用提交与移动状态机；
- SAVE 保存撤退关键字段并用 JSON metadata 保存完整 RNG 快照；
- 战略地图据点点击的计时/弹窗/右键回退流程。

**当前阻塞**：

- 本轮委任行军边界、SAVE 道路上下文和硬单实例没有代码级合并阻塞。
- 战术模拟器主线仍需真实 KI.EXE 的 DOSBox-X debugger 逐帧捕获，用于 `originaldiff.js` ground-truth 动态差分；静态逆向已闭合的规则不得因缺少动态 fixture 回退为猜测。

---

## 8. 近期 Checkpoint 摘要

### 2026-08-30 战略地图据点点击流程与军团面板修复

- 任意据点点击即停计时；空城显据点面板，右键关闭后恢复。
- 有驻军据点显「据点/军团」选择菜单：点据点→据点面板；点军团→军团列表。
- 玩家据点军团列表：点击军团进入行军目标指示，完成战斗指挥/委任/解体后返回该城市军团列表。
- 非玩家据点军团列表：点击军团右侧显示只读详情面板，列表行选中，右键返回列表，再右键关闭列表并恢复计时。
- 修复军团详情面板兵种图标：`typeImgs` 改用 `[null, cav, inf, arc]` 以匹配内部兵种值 `1=騎兵/2=步兵/3=弓兵`。
- 关键文件：`web/src/ui/gamebar.js`、`web/src/main.js`。

### 2026-08-30 战略军团与战斗底层

- 构建原版道路拓扑：192 节点/254 边/5526 点列；军团沿边点列逐日推进，到边端重新寻路。
- 提取 24 槽×5帧原版行军标识与 group 0 接敌动画；接敌状态 `11→1` 倒计时。
- 修正 BATTLE.MAP 目录与布局解析；实现 `0x4B63` 野战地形分类与镜像战场。
- SAVE 军团表偏移勘误为 `0x22C0`，支持 128 槽与延迟回归 status 8 槽。
- 实现 `0x5130/0x5285/0x52D7` 野战/攻城速算；`0x4C72` 选同城最强主防守军。
- 实现战后 `0x474A` 继续、`0x487B` 朝首都撤退、`0x291A` 武将去向、`0x2977/0x2A7E` 48 周期回归、`0x4DA4` 破城组撤退。
- 修复玩家委任军团目标被 AI 覆盖的问题；委任军团走速算、不强制进战术层。

### 2026-08-24 会话二（迁都 → 可玩状态）

- 实现 BATTLE.DAT 开场脚本 VM 回放（battlescript.js + battleview.js 60fps 虚拟帧）。
- 实现外交迁都；修正 0x699E「請出陣」实为玩家自身出击指令。
- 实现天灾/暴动系统（disaster.js）。
- 重写觐见台词系统，修正觐见对象为【己方君主】。
- 实现 PC Speaker 风格音效（speaker.js）。
- 实现结束动画（endview.js）与开场动画（openview.js）RLE 解码播放。
- BGM 音乐逆向结案：确认 YNSOUND.COM 常驻驱动，决定不复刻。
- OPEN_S1 尾块、END_S13/14/15 结案。
- 当前状态：可玩。
