# Checkpoint Journal — 2026-08-24（存盘功能轮）

## 本轮目标

1. （用户指令）补上存盘功能（此前已有读档）
2. （插入指令）去掉游戏开始的开场插画
两项均已完成 ✅。至此 SESSION_HANDOFF.md 待办 #1–#10 全部清零。

## 已完成工作

- **开场插画移除**：删除 main.js 的 `showOpening` 方法及调用，启动直接进游戏界面。
- **存盘功能**（完整链路）：
  - `tools/export_save_assets.py` → `web/scen_raw.json`（4×剧本槽 0x56C0 b64 底版 + 当前 SAVE.DAT 全文件底版）+ `web/big5_map.json`（1235 字 Big5 编码表）
  - `src/game/savegame.js`（新建）：`serializeSlot(app,label)` 在剧本槽底版上 patch——全局块(+0 word=daysInMonth<<8|day / +4月 / +6年 / +0xF玩家势力 / +0x10信赖 / +0x18税率)、标签(+0x40 32B Big5 不足补 0x20)、外交矩阵(@0x680 行距24)、势力区(@0x80)、城池区(@0x8C0)、军团区(@0x2240 存活覆写)、武将区(@0x42C0)；`serializeSave`=SAVE.DAT 底版保其它槽；`snapshotState`=structuredClone(sc) 删 armies/滤 dead + save_date
  - `main.js`：`app.saveGame(slotIdx,label)` 快照→POST /api/save（octet-stream）失败回落 Blob 下载；启动优先 `fetch /api/saves.json`（no-store）避免浏览器缓存
  - `hud.js`：顶栏「存檔」tab → `#savedlg` 四槽按钮（label=当前日期）；`index.html` #savedlg 样式复制 #loaddlg
  - `tools/webserver.py`（新建）：静态服务 + POST /api/save 直写 `E:/Dragon/Dragon/SAVE.DAT` + 重跑 parse_save.py 刷 save.json + GET /api/saves.json；`parse_save.py` 支持 argv 路径参数

## 关键决策

- 存档序列化采用「剧本槽底版 + patch」策略而非从零组装：底版含原版未逆向字段的合法值，兼容性最好
- 标签 32B 不足部分补 0x20 空格（实测原版残留旧标签的教训）
- 持久化双通道：有本地服务端直写文件；无服务端（如纯静态托管）回落浏览器下载
- SAVE.DAT 槽偏移=slot×0x56C0 无基址（勘误了旧笔记的 0xD9A/0xDA6 基址误读，它们是文件名字符串）

## 失败尝试（踩坑记录）

- webserver SAVE_DAT 路径曾多拼一层 Dragon（E:/Dragon/Dragon/Dragon/）→ POST 500 → 前端静默回落 Blob 下载；且旧进程未重启新代码不生效（症状：/api/saves.json 通但 POST 失败）
- playwright run-code `--filename=/tmp/...` 找不到文件：write 工具的 /tmp 与 bash 的 /tmp 不互通，必须用 Windows 真实路径
- 测试脚本误用 `app.sc`（不存在）→ 状态在 `app.scenario`；时钟推进用 `clock.advance(ms)` 而非 tickClock；读档按钮 id 是 `#loadsav` 不是 `#loadload`
- 首次往返测试读档恢复的是旧数据：根因是 main.js 启动时静态加载 save.json 吃了浏览器缓存 → 改走 /api/saves.json (no-store)

## 相关文件

- 新建：`web/src/game/savegame.js`、`tools/webserver.py`、`tools/export_save_assets.py`、`web/scen_raw.json`、`web/big5_map.json`
- 修改：`web/src/main.js`（saveGame/loadSave/启动加载）、`web/src/ui/hud.js`（存檔tab+对话框）、`web/index.html`（#savedlg+样式）、`tools/parse_save.py`（argv 支持）
- 数据：`E:/Dragon/Dragon/SAVE.DAT`（已备份 SAVE.DAT.bak）、`web/save.json`（parse_save.py 产物）
- 文档：`docs/SESSION_HANDOFF.md` #10、`docs/re-notes-kernel.md`（逆向定论）、`docs/save_screen.png`（验证截图）
- 测试脚本：`tools/_save_t1.js`（往返验证）、`tools/_save_shot.js`（截图）

## 当前状态

- 验证全通过：playwright 往返（存槽1→变异 tax33/197-4-27→reload→读槽1→完全恢复 196/4/1/tax18/军团22/金8464，0 pageerror 0 下载回退）；python 独立解析磁盘 SAVE.DAT 槽1=196/4/1 格式兼容原版；截图目检通过
- 本地服务器运行中：`python tools/webserver.py 8321`（<http://127.0.0.1:8321）>
- pi-lens 全部 clean；无阻塞

## 阻塞点

无。

## 下一步（建议方向，均为新功能）

1. **BATTLE.DAT 开场脚本回放**：battle_scripts.json（32块×128 word）已导出未接入，VM op 表已逆向（re-notes-kernel.md）
2. **进言系统**：信赖度影响军师判定（待办#2 余留子项）
3. **外交扩展**：迁都/请出阵（逆向地址已有：0x6909/0x699E）
4. **真实 0xCDE 流逆向比对**（待办#2 余留子项）
5. 可选打磨：存档对话框显示军团数/剧本号列、原版游戏实机读 web 生成的 SAVE.DAT 验证
