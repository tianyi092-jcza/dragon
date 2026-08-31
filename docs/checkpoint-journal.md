# 卧龙传 Web 复刻 · Checkpoint Journal

> 本文件记录**本轮会话**的详细进展、调试过程、失败尝试、相关文件、当前阻塞和下一步。
> 长期有效的项目事实、架构、命令、约定、坑点和主线状态统一维护在 `AGENTS.md`，此处不再重复；
> 二进制证据与逆向过程见 `docs/re-notes-kernel.md`、`docs/re-notes-march-pathfinding.md`。

---

## 2026-08-31 本轮：本地存档与浏览器单实例定稿

### 背景与决策

- 本轮开始时，助手错误地按既有的服务端 DOS `SAVE.DAT` / `/api/save` / lease 模式检查并汇报存档方案，被用户明确否定。
- 用户定稿**数据边界**：新游戏全部章节由服务器静态资源 `data.json` 提供；存档与读档只使用玩家浏览器的本地存储，运行时不依赖任何 DOS 内容、保存 API 或服务器进程。
- 迁移到 IndexedDB 后一度没有单实例保护（服务端 lease 已删除），同 origin 多标签页可同时写 IndexedDB 存在竞争；用户确认采用**纯浏览器端单实例**方案（Web Locks），不恢复任何服务端机制。

### 已完成实施

#### A. 存档迁移：服务端 → IndexedDB

- 新增 `web/src/core/localstore.js`：IndexedDB（数据库 `wolong-web`、对象仓 `saves`）读写与四槽规范化。
- `main.js`：启动时 `loadJSON('data.json')` 取章节 + `loadLocalSaveSlots()` 取槽位；`saveGame` 串行写 IndexedDB，写成功后才更新内存槽；`loadSave` 从内存槽位恢复。
- `web/src/game/savegame.js` 重写为纯 Web JSON：`snapshotState` / `applyWebMetaToState` / `canSnapshotState`，删除全部 DOS SAVE 序列化。
- `tools/webserver.py` 缩为纯静态文件服务器；`tools/export_save_assets.py` 的逆向模板只输出到未发布的 `.dragon-analysis/`。
- 删除运行时废弃文件：`web/scen_raw.json`、`web/big5_map.json`、`web/save.json`；`boot.js` 直接启动 main；`hud.js`/`startmenu.js`/`index.html` 残留 SAVE.DAT 文案改为本机存档表述。

#### B. 浏览器端单实例

- `web/src/core/singleinstance.js` 重写：首选 Web Locks API 排他锁（`wolong-web-game-instance`），不支持时以 `localStorage` 心跳租约降级。
- `web/src/boot.js` 拿到锁后才 import/初始化 `main.js`；第二分页面只显示阻断提示，不创建 App/RAF、不写 IndexedDB；关闭持锁页后重载被阻断页即可接管。
- 该保护不依赖 `tools/webserver.py`，任意静态托管均有效；但不能跨浏览器/跨设备强制独占。

#### C. 测试更替

- 删除 15 个围绕服务端 lease / DOS SAVE.DAT 的过时测试：`verify_save_buffer/client_commit/fresh_client/parse_build/roundtrip/server_metadata/server_rollback`、`verify_single_instance_local_expiry/loss/release_stop/save_init/server/stale_responses/startup_loss` 等。
- 新增：`tools/verify_local_saves.mjs`（Node mock IndexedDB 四槽 round-trip）、`tools/verify_single_instance.mjs`（Node mock Web Locks 阻断与接管）；重写 `tools/verify_single_instance_ui.js`（Playwright 双分页面阻断→关闭首页→重载接管）；更新 `tools/verify_save_transition_guard.mjs`。

### 调试过程与失败尝试

- **方向性误判**：先按服务端存档架构汇报，浪费一轮；教训是涉及存档/部署先与用户确认数据边界再动手。
- **`playwright-cli run-code` 对结尾 `};` 报 SyntaxError**：verify 脚本末尾的立即执行函数分号触发，去掉末尾分号解决。
- **标题菜单点击竞态**：`verify_system_menu.js`/`verify_clock_pause.js` 在慢机上点击早于监听器绑定；改为等待 `startMenu._onClick` 绑定并支持重试，clock 脚本补 `setViewportSize 1024x768`。
- **pi-lens 自动格式化**：会话中改写过 `main.js` 与多个 verify 脚本，后续编辑前必须重读（已列入 AGENTS.md 坑点）。

### 验证结果（全部通过）

- `node --check`、`python -m py_compile`、`git diff --check`；
- `verify_single_instance.mjs` / `verify_local_saves.mjs` / `verify_save_transition_guard.mjs`；
- 全新 Playwright 会话：保存→reload→读取确认零 `/api` 请求且落 IndexedDB；双分页面阻断与接管；`verify_system_menu.js`、`verify_clock_pause.js`；
- 静态服务器下 `scen_raw`/`big5_map` 确认 404；
- `lens_diagnostics mode=all` 仅剩 `export_save_assets.py` 既有静态路径 traversal 警告（逆向工具，不发布）。

### 相关文件

| 路径 | 本轮职责 |
| --- | --- |
| `web/src/core/localstore.js` | 新增：IndexedDB 四槽持久化 |
| `web/src/core/singleinstance.js` | 重写：Web Locks 单实例 + localStorage 降级 |
| `web/src/boot.js` | 入口 gate：持锁后才加载 main |
| `web/src/main.js` | 启动读本地槽、saveGame/loadSave 接 IndexedDB |
| `web/src/game/savegame.js` | 重写为纯 Web JSON 快照 |
| `tools/webserver.py` | 缩为纯静态服务器 |
| `tools/export_save_assets.py` | 逆向模板仅输出 `.dragon-analysis/` |
| `tools/verify_local_saves.mjs` / `verify_single_instance.mjs` / `verify_single_instance_ui.js` | 新增/重写回归 |
| `web/src/ui/hud.js` / `startmenu.js` / `web/index.html` | 文案改本机存档表述 |

### 当前阻塞

- 本轮无代码级阻塞。
- 主线仍缺真实 KI.EXE 的 DOSBox-X debugger 逐帧捕获，用于 `originaldiff.js` ground-truth 动态差分（战术模拟器主线阻塞，与本轮无关）。
- 已知边界：Web Locks/localStorage 降级只在同浏览器 profile、同 origin 内有效，无法跨浏览器/设备独占。

### 下一步

1. 从本 journal、`AGENTS.md`、`docs/re-notes-*.md` 恢复上下文。
2. 运行存档/单实例 focused suite（`verify_local_saves`、`verify_single_instance`、`verify_save_transition_guard` + 双页面 UI 冒烟）确认工作区后续改动未破坏本轮结论。
3. 当前工作区含大量未提交修改与删除，按功能拆分审查提交；禁止 `reset/clean`。
4. 回到主线：准备 DOSBox-X debugger 逐帧 capture，与 `originaldiff.js` 规则包比对。

---

## 历史轮次摘要

> 细节已压缩；稳定结论已并入 `AGENTS.md` 或 re-notes，废弃实现见 git 历史。

- **2026-08-31 委任边界与硬单实例**：静态闭合 `0x25CC→0x42AB→0x2831/0x2880` 现场重检链——`11→1` 为持续接触确认 timer，最后一边每轮实时读城主/外交，目标消失同轮继续移动、被替换保留倒计时，野战不查外交；SAVE 无独立 field/siege 字节，道路上下文（`+0x0A/+0x0C/+0x0E`）按 E717 固定布局可逆恢复。同期的**服务端 lease/SAVE 事务发布实现已被本轮 IndexedDB 方案整体取代并删除**，行军与道路上下文结论仍然有效。
- **2026-08-30 委任战略速算逆向闭合**：中立城 `0x18` 临时城防速算；委任权威统一为 status bit2（`legionmode.js`）；`0x5130` 只消费 canonical RNG 流；`0x51B3` 只扣城兵且易主保留扣损；委任战斗战略地图四相过渡；军师菜单羽扇唯一开关与地图绝对锁定交互补强；存档原子性守卫（接敌四相/战术层活动/日历待进位时拒绝存档）。
- **2026-08-31 章节/存档共享加载初始化复核**：新游戏 `legions=[]`、`data.json` 只读模板 clone、运行时队列显式清理；`loadState` 统一装配且每次重建 canonical RNG；存档时钟由 `save_date` 直接构造。其中 DOS SAVE 字段回写/sidecar 部分已随服务端方案废弃。
- **2026-08-30 战略地图据点点击流程**：据点/军团选择菜单、军团详情面板、兵种图标 `1=騎兵/2=步兵/3=弓兵` 映射修复。
- **2026-08-30 战略军团与战斗底层**：道路拓扑 192 节点/254 边、24 槽×5帧行军标识、BATTLE.MAP 目录勘误、`0x4B63` 野战地形、`0x5130` 速算、战后 `0x474A/0x487B/0x291A/0x2977/0x4DA4` 全链。
- **2026-08-24 会话二**：BATTLE.DAT 脚本 VM、外交迁都、天灾/暴动、觐见台词、PC Speaker 音效、开场/结束动画 RLE；BGM（YNSOUND.COM 常驻驱动）决定不复刻。游戏达到可玩状态。
