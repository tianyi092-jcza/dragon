# DOSBox-X 原版战术逐帧捕获方案

## 当前状态

- 已解压并确认便携版位置：`E:/Dragon/.tools/dosbox-x/bin/x64/Release/dosbox-x.exe`。
- Debugger构建提供 `DEBUGBOX`、`BP`、`MEMDUMPBIN`、`LOG/LOGS/LOGL`。
- Web差分协议已存在：`web/src/game/battle/originaldiff.js`，比较frame、寄存器、RNG调用数，以及objects/mapObjects/effects/spatial/tiles/temp/pathQueue/paths八个blob。
- 当前阻塞不再是模拟器缺失，而是：可重复进入完全相同战斗的输入/存档脚本，以及在动态加载后解析KI.EXE运行段并自动导出断点状态。

## 最小可重复fixture

第一份真实fixture只覆盖**无玩家命令的连续固定帧**，避免鼠标、墙钟和脚本输入引入变量：

1. 从独立复制的测试存档启动（禁止写 `E:/Dragon/Dragon/SAVE.DAT`）。
2. 固定章节、双方军团、战场mode、攻守方、RNG表与索引。
3. 进入战术层，在 `A1C5`完成后的第一轮 `A426→A065` 前捕获initial。
4. 连续捕获16帧；每帧在 `A065`返回后导出。
5. 战斗若在16帧内结束，则额外在 `9FDC`入口和返回后导出exit包。

## 捕获字段

每个断点帧至少保存：

- CPU：CS:IP、DS、ES、SS、AX/BX/CX/DX/SI/DI/BP/SP、FLAGS；
- 战术寄存器与标志：Web `snapshot().registers` 所对应的D2E/D30/D31A..D31E/D313/D316/D318/D322/D324/D326/D348等；
- 原版RNG：257字节表/索引及已消费次数可推导信息；
- 八个差分blob对应内存窗口：对象池、地图对象、效果对象、空间占用、tile、临时军团、路径队列、路径区；
- 当前BATTLE.DAT VM PC/等待寄存器；
- `9FDC`的胜负、六队幸存、士气、城损结果。

地址必须以运行时段基址换算，不能把反汇编逻辑偏移直接当物理地址。

## 建议输出格式

目录：`tools/fixtures/original-battle/<case>/`

```text
manifest.json          # 章节、存档hash、KI.EXE hash、DOSBox-X版本、断点地址映射
initial.json           # 可直接传给 OriginalBattleSession.restore()
frame-0000.json        # canonical packet，full=true
frame-0001.json        # 后续可只含hash；每4帧或首差异帧full=true
...
raw/frame-0000-*.bin   # MEMDUMPBIN原始证据
commands.json          # 第一fixture为空数组
```

fixture的 `source` 必须写 `ki.exe-dosbox-x`，并记录所有原始bin的SHA-256，避免人工转换后失去证据链。

## Debugger执行骨架

```text
DEBUGBOX KI.EXE
BP <runtime_cs> A426
BP <runtime_cs> A065
BP <runtime_cs> 9FDC
RUN
# 命中后使用EV确认寄存器/段基址
MEMDUMPBIN <seg> <off> <count>
RUN
```

DOSBox-X交互Debugger不天然适合无人值守批处理。自动化优先顺序：

1. 先做一次人工命中，记录运行时CS/DS及各内存窗口；
2. 用独立测试存档和键盘宏稳定复现入口；
3. 若Debugger命令无法从文件重放，采用控制台输入自动化或最小DOSBox-X补丁，在断点回调直接写frame目录；
4. 原始导出完成后，用转换脚本生成 `originaldiff.js` fixture，并执行逐帧回放比较。

## 验收条件

- 同一测试存档连续捕获两次，initial及16帧所有raw SHA-256完全一致；
- Web从同一initial恢复后，每帧 `compareOriginalBattlePackets()` 为equal；
- 若不一致，报告首个不同帧、section、blob和byte offset，禁止只比较最终胜负；
- 捕获工具、测试存档副本和输出目录不得触碰正式 `Dragon/SAVE.DAT`。
