# 臥龍傳 Web · Checkpoint Journal

> 更新时间：2026-09-10
>
> 本文件记录**当前批次**的详细进展、调试过程、验证、阻塞和下一步。提交状态与已提交历史以`git log`为准；长期事实与约定见`../AGENTS.md`；地址级证据见`re-notes-*.md`和`E:/Dragon/.agents/skills/`。

## 1. 本轮范围与状态

- 仓库：`E:/Dragon/web-port`；分支：`main`；基线：`6a96f21`。
- 本批主线是原版战略天气与据点灾害：16朵雨云、暴雨区域、据点大火、据点暴动、统一城损、消息FIFO、Canvas动画及IndexedDB运行态；实现与验证已完成。
- 规则只采用`KI.EXE`、官方SINARIO/MMAP资源和可复核调用链；没有读取或写入任何`SAVE.DAT`。
- 当前无硬阻塞。唯一已知表现差异是Canvas尚未模拟原版D51F“每地图tile最多5个覆盖层”的硬上限；不影响规则、RNG、消息、生命周期或城损。

## 2. 已完成进展

### 2.1 雨云状态、移动与绘制

- `tools/parse_sinario.py`从每章`SINARIO.DAT +0x21C0`解析16条常驻雨云记录，并从头部`+0x32..+0x39`解析默认吸引边界`{-16,-16,400,400}`；`web/data.json`由解析链重建。
- `web/src/game/weather.js`实现`0x2459→0x248A→0x24FF`：每朵timer通常每16个战略更新到期，按对象槽序为X/Y各消费一个canonical RNG字节，处理速度、残差、聚集回拉和世界回绕。
- 物理回绕为X`[-16,400]`、Y`[-16,272]`；Y=272与默认吸引边界maxY=400是不同字段。
- `MMAP.MCH`描述符`18 19 1A 1B 1C 18 19 1A`已提取为8相256×144 PNG；透明使用32B mask，颜色索引0可不透明。`MapView`以`(x-8,y-4)`锚点在军团层后只读绘制。

### 2.2 暴雨事件与统一城损

- 月结`0x22DB`先以强度0清旧雨区并恢复默认吸引边界，再尝试type11。selector是直接城市索引，不是`selector>>3`。
- type11起始事件槽是`32/36/40/44/48/52/56/60`；`0x233A/0x233C`与`0x2FDD/0x2FDF`分别执行槽号和4B字节地址换算。
- 入队成功只收窄目标附近11×11吸引矩形；没有云数量、碰撞或“聚集完成”条件。type11出队按城市槽序产生TALK70，消息实际显示时逐条播放警告音。
- `0x3EFD→0x4194→0x4269`已接入单城轮询：`city[+0x15]`先消耗防灾；缺口再扣上升值、`(缺口*highByte(prod))>>2`生产力和`缺口>>1`城兵。该字段由原事件清理，不在结算后自动归零。

### 2.3 大火与暴动

- `0x2286`固定扫描192城且不检查所属。每城先短路判火灾：`R1<24`后才取R2，比较`(R2&63)>=defence`；火灾条件命中后，即使随机入槽失败也跳过该城暴动。
- 只有火灾门控或比较失败才判暴动：`R3<24`后才取R4，比较`(R4&63)>=growth`。两类成功路径都由`0x2FBF(BL=FF)`消费随机起点字节；事件页已满也会消费。
- type12/arg0=1或2只在前16个固定稀疏对象槽分配首个空位。池满立即返回：0消息、0后续RNG、0伤害。arg0=0逐槽清同坐标对象和`city[+0x15]`；删除不压缩槽号，新对象复用最低空槽。
- 玩家城分配成功后先播放警告音，并用底部480×80通用消息框显示TALK71大火或TALK72暴动；消息关闭后才消费两个RNG字节，写4..11强度并排6..13个事件槽后的removal。同一时刻势力槽随消息延后，不能越过这两个字节。AI城静默但数值路径相同。
- 大火group1八相描述符为`20 21 22 23`重复；暴动group2为`28 29 2A 2B`重复。两者均80×80、`(x-2,y-2)`锚点、timer=16、动画0 RNG，并按固定槽序在军团后、雨云前绘制。
- 火灾/暴动没有独立损害公式，均持续复用`0x4269`直到type12 removal。

### 2.4 资源、存档与兼容

- `tools/extract_march_markers.py`现从原始`MMAP.MCH`生成雨云、大火和暴动PNG及审查图集：`docs/weather-cloud-animation.png`、`docs/disaster-object-animation.png`。
- 火灾使用调色索引`0,1,2,6,7,10,11,12,15`，暴动使用`0,1,2,6,7,9`；这些索引在四季palette bank一致，无需季节变体。
- `disasterMapObjects`统一规范为固定16槽null稀疏数组；旧Web紧凑数组按原顺序迁入低槽。对象槽、动画相位、雨云、灾区、城`+0x15`、事件轮及canonical RNG由IndexedDB state/sidecar往返。
- 战斗异步中断时，天气推进等待战术RNG回写后执行，避免战略/战术随机流交错。

## 3. 调试过程与失败尝试

1. **type11 selector误读**：早期把`BH=selector,BL=0; BX>>=3`解释成城市索引再右移。重反汇编确认结果是`selector*0x20`记录偏移，selector本身就是0..191城市索引。
2. **事件槽与字节地址混淆**：曾把type11起始槽写成8..15；实际生产者先乘4得到槽32..60，入队器再乘4得到页内字节地址128..240。旧测试和文档已撤销。
3. **地图对象池范围误判**：最初允许type12占32槽；原版明确是前16槽静态火灾/暴动、后16槽常驻雨云。Web已改为固定16槽且禁止`filter()`压缩。
4. **边界字段混用**：默认吸引边界maxY=400与雨云物理回绕Y=272看似冲突，实际来自不同字段/分支，现分别保存。
5. **透明度误判风险**：MMAP颜色索引0并不代表透明；最终统一按独立mask生成RGBA，并以源像素哈希和Canvas目标像素锁定。
6. **玩家灾害消息后的RNG越序**：仅把伤害RNG放入TALK71/72关闭回调仍会让同一`0x3E11`势力槽提前消费RNG。现同时延后势力槽，消息关闭后先消费两个灾害字节再恢复。
7. **浏览器缓存/模块入口**：规则和资源修改后旧ESM缓存会制造假回归；浏览器验收使用全新profile。完整回归需设置现有`PLAYWRIGHT_MODULE`路径。

## 4. 相关文件

### 产品与生成链

- `web/src/game/weather.js`：雨云、静态灾害动画与`0x4269`。
- `web/src/game/ai.js`：type11/12生产、分发、消息事务和固定对象槽。
- `web/src/main.js`、`web/src/game/savegame.js`：装配、异步RNG续行和sidecar。
- `web/src/render/mapview.js`、`web/src/ui/gamebar.js`：对象层与底部消息FIFO/警告音。
- `tools/parse_sinario.py`、`web/data.json`：雨云初态和默认边界。
- `tools/extract_march_markers.py`、`web/grf/weather/`、`web/grf/disaster/`：MMAP资源生成。

### 回归与证据

- 规则：`verify_weather.mjs`、`verify_disaster_rng.mjs`、`verify_disaster_events.mjs`、`verify_fire.mjs`、`verify_riot.mjs`。
- 资源/浏览器：`verify_weather_assets.py`、`verify_disaster_assets.py`、`verify_weather_browser.mjs`。
- 地址笔记：`docs/re-notes-kernel.md`、`E:/Dragon/.agents/skills/re-domestic-diplomacy/SKILL.md`。

## 5. 验证记录

- 最新完整工作树：106项`verify_*.mjs`、11项`verify_*.py`和`verify_battle_viewport.js`全部通过。
- `verify_weather_browser.mjs`使用全新Chrome profile验证8张雨云和16张火灾/暴动相位资源、精确Canvas RGBA/锚点、TALK71/72底部消息框及关闭前0 RNG/关闭后2 RNG；无console、page或network错误。
- 16个变更JS/Python文件primary LSP零诊断；`lens_diagnostics mode=all`覆盖21个会话文件，零问题。
- `git diff --check`通过，仅有仓库既有LF/CRLF提示。
- 自动化全程未读取或写入`E:/Dragon/Dragon/SAVE.DAT`。

## 6. 当前阻塞与残余风险

- 无规则或测试阻塞。
- 未模拟D51F每地图tile最多5个覆盖层的硬上限；当前Canvas按对象槽序直接alpha绘制。此项只影响极端重叠时的视觉裁剪。
- 本批包含产品代码、生成资源、测试和文档；提交状态以`git log`为准，工作区仍禁止整体`reset/clean`。

## 7. 下一步

1. 长时运行官方第一章，覆盖暴雨、火灾、暴动重叠、同城重复type12、对象池耗尽和跨月清理。
2. 覆盖消息自动关闭/右键关闭、保存禁止窗口及旧IndexedDB快照迁移的浏览器路径。
3. 如需像素级完全一致，再实现并验证D51F每地图tile最多5覆盖层限制；在证据/验收明确前不自行补近似裁剪。
4. 继续战略长时回归：内政预算耗尽、月结边界、多速度行军、接战、攻城和战后续行。
5. 提交或推送仅在用户明确要求后执行；提交前重跑变更文件LSP、`lens_diagnostics mode=all`、focused suite、必要的全量回归及全新浏览器验收。
