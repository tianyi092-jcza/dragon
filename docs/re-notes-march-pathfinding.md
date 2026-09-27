# 战略军团行军与寻径逆向笔记

> 状态：第一阶段静态逆向，2026-08-29。本文区分“已实锤”“强推断”和“待动态验证”。
>
> 目标：在完善战术战斗前，先复刻军团从据点到据点的路线规划、不可达处理、沿道路移动和方向动画。

> 现行Web显示/节奏见[行军表现修正](march-presentation-fixes.md)：统一城/军团锚点、8×movePeriod插值、战略提速与接战五响。本文旧方向偏移/八更新插值/100ms音画描述为历史表现，不再代表当前实现；原版坐标/周期机制不变。

## 一、结论摘要

原版战略行军不是在 `384×256` 地图像素格上直接跑 A*，而是：

1. 读取 `MMAP.MAP` 的地图 tile；
2. 用解压后的地图生成**据点节点与道路边组成的拓扑图**，`1A00`构图返回后才由`1A03→87AF`加载`MMAP.MDL/MMAP.MCH`覆盖临时工作区；
3. 军团记录保存当前拓扑节点、目标节点、当前道路边、方向与移动残差；
4. `0x491B/0x4A0F` 在拓扑图上做带权 BFS/Dijkstra 式搜索，返回下一条道路边，而不是一次性保存整条像素路径；
5. `0x47BB` 每次需要换边时重新查询下一跳，因而天然支持中途道路状态变化；
6. `0x2708..0x2808` 沿当前道路边的点列/坐标数据推进，并更新四方向；
7. 战略图有三条不同绘制路径：`0x2B2A` 画正常军团行军/驻止标识，`0x2B3C` 画接敌/攻城等待态动画，`0x2533` 画独立的 16B 通用地图动画对象。

因此旧Web“从地图图块提取可走格，再在384×256网格做8向A*”的据点主路径只是视觉近似；当前据点到据点行军已改用原版道路拓扑，旧A*仅保留在少数非据点临时坐标兼容路径。

## 二、原版运行时地图拓扑生成

### 2.1 地图资源加载

已实锤：

- `0x87AF` 加载 `MMAP.MDL` 到 `[0x9876]`；
- `0x87BB` 加载 `MMAP.MCH` 到 `[0x9876] + 0x800`；
- `0x19ED..0x1A00`给`E48A`传入图/已解压地图/临时seed/marker段，构图写入`[0x9874]`，不是在此读取或解压MMAP文件；
- `[0x9874]`由`0x87CC..0x87F7`从既有`D46`分配块计算得到；该函数本身不调用DOS分配。原分配成功与解压后输入契约见§2.5。

### 2.2 据点节点 tile 范围（2026-08-30 校正）

已实锤：地图构图入口 `0xE4CE` 扫描完整 `384×256` tile 图，并以：

```text
0xCB <= tile < 0xD4
```

识别**据点/关卡节点起点**，而不是把这 9 种 tile 当作全部道路。对当前 `mmap_map.bin` 的独立统计为：

- `0xCB..0xD3` 恰好出现 192 格；
- 20 章剧本合并后的唯一据点坐标也恰好为 192 个；
- 两个坐标集合完全一致，无多余、无遗漏；
- 实际使用的节点 tile 为 `0xCD`（183 个）、`0xD0`（4 个）、`0xD3`（5 个）。

撤销的是把`0xCB..0xD3`当作**全部可连接道路tile**的说法，不是撤销其作为据点节点起点的事实。`E4E5/E4E9`及§2.5原图构造确认上述节点范围。

### 2.3 从据点出发的道路探测

已实锤：

- `0xE57F..0xE68C` 从据点向左/右/上/下寻找相邻可连接格，容许一格或两格距离后调用边构建；
- `0xE81C..0xE95F` 沿道路继续探测，除正交方向外还检查四个斜邻；
- `0xE961` 是实际的可连接 tile 分类器：接受 `0xB8..0xDD`，并按范围返回类别 `0..4`；`0xCA` 还会附加 `0x80` 标志；
- 遇到 `tile >= 0xD4` 时会建立带 `0x40` 标记的特殊点；下一探测方向取 seed 记录方向 byte 的低半字节（`E792`装入DX、`E84B AND DH,0F`），不是 tile 低位，详见[自定义数据基础军团§6.3](re-notes-custom-data.md#legion)；
- 每条道路点列条目为 4 字节：`x(word), y(byte), 分类/方向(byte)`；边构建同时记录包围范围。

因此此前“构图只检查四邻”“原版不存在斜角连接”的结论过强。更准确的说法是：**拓扑搜索发生在据点/边图上，而单条道路边的生成与点列推进允许八邻几何变化；战略标识最终仍量化为西/东/北/南四方向。**

### 2.4 最终节点、边与点流

**勘误：旧版把16字节边记录叫作节点，并把包围盒误标成类型/方向。** 原`E717/E77D`构造的是三个不同区域：

- 节点：图段`0000..05FF`，192个8B记录，每节点西/东/北/南四个邻接word；0表示无边，非0为边offset OR `4000h/8000h`方向tag。`0600..07FF`保留0。
- 边：本原图`0800..17DF`，254个16B记录。`+0/+2`为首/末点offset（word，末点包含在内）；`+4`为byte成本；`+5`由初始清零保留0；`+6/+8`为source/target节点offset（word）；`+A/+C`为x最小/最大（word）；`+E/+F`为y最小/最大（byte）。包围盒由`E7B1..E7CA`写入，254条均与原点流独立min/max一致。
- 点流：每点4B，x word/y byte/class byte；本图`2000..7657`共5526点。254边均有44h特殊首点、不计成本，所以总成本5272；首末点数不是成本本身。下一空闲7658h，至7FFF为原清零尾部。

`0x491B`读节点四个邻接word，再以边`+4`byte计费，不把包围盒或节点地址当边代价。

### 2.5 P04：原初始化与连续轨迹的图接口证书

**实锤范围：固定原MMAP、显式DOS分配成功与解压后输入契约下的完整内部构图；不是全部DOS启动/任意地图认证。** 固定KI/官方SINARIO哈希见[AI专项](re-notes-ai-chain.md)，MMAP SHA256为`51b6fcaa390c80bd8a358dcacbf7d8dbb6dfeb0e048d8c3bdd86329df3401bcf`。

- 原`00DF`两次`INT21/AH48`在本证书分别请求1D5Eh/5356h paragraphs，明确返回2500h/4500h、CF0；内部段地址计算与`87CC`均实执行。失败分支只静态复核，不模拟DOS分配器。map由固定原文件解压至4500h、官方状态至原计算出的3B00h；原文件I/O及F5E7解压CPU未执行。
- 原`19ED→1A00→E48A→E4CE/E717`实跑到1A03。`E49B`清seed scratch整64KiB；`E4A8`只清图0000..7FFF，不能把8000以上当原初始化零值。508个初始active seed经反向去重构造254边，原节点/边/点序与原图字段均保留。原`1A2D..1A4C`另实跑清marker整98304B；中间资源/设备调用未执行，因此仍不是19CA整函数连续前缀。
- 全私有RAM分别以00/A5初始化，每次1059434条原指令，图前32KiB完全一致，SHA256 `c226fc8fd8567ffc23a927e09419797d9d94b06c1b4d67bbf9b73909981e7afc`；点流SHA256 `d443c417625cf0e1b8caed90e3958f41a5fbe769e18a75f74965a897afc7ffea`。图后半段保留不同填值，491B非即时返回分支自行清8000..87FF并写搜索队列。
- 与P03原`road()`转录图相比，全部节点/方向tag、边编号/首末点/成本/端点和点流逐byte一致；仅边包围盒1146个byte不同，旧转录未填这些字段。**不是整个图段一致。** 五个491B接口样例不读取这些差异字段；不能仅凭样例推断所有消费者不读。
- 父已独立重跑两填值构图：除耗时/记录路径外结果一致，六份私有graph/scratch/marker二进制逐byte一致。随后将真实生成的32KiB图作为明确输入接入[P03两场连续轨迹](re-notes-ai-chain.md#8-p03持续战争下的多军返都与前线对照)，完整1678/1200tick的所有结果字段（仅图输入说明除外）、RNG、消息记录与整条IP序列一致；最终RAM也只有上述1146个包围盒差异。故这两个具体轨迹不再依赖漏填包围盒的转录图；**导入图数据不等于连上原初始化寄存器/栈/外部输入全前缀**。

原证据`C:/Users/fczll/AppData/Local/Temp/dragon-road-init-mfecc1mo/`含完整反汇编、`probe.py/cpu-source.py/cpu-extract.py`、manifest、逐边/分支/读区结果及两种填值图。父重跑及接续在`C:/Users/fczll/AppData/Local/Temp/dragon-ai-raw-graph-parent-4qsc4fuv/`：`run_raw_graph.py`只替换显式图输入adapter，不替代KI callee；`raw-graph-continuation-check.json`记录全轨迹比较。最终road报告冻结为该目录`road-capture-completed.md`（SHA256 `839c099ef89cf4cc582b3a33d12b9dc3077dda487b2447b02550be455bf31cb4`）。原探针每段限步、未知opcode/中断/条件立即失败；本路径只消费CF/ZF，未认证一般FLAGS。DOS失败、非特殊seed、class3终点等未跑分支仍继续研究，不算全部覆盖。

**后续P13接缝补证：** [原MMAP解码与构图](re-notes-strategic-message-abi.md#11-p13原mmap解码eof与资源释放真正返回)在另一明确A2100/B4000布局执行真实F5E7、4次文件读取（含EOF）、close/free后再原E48A，父独立复跑并抽取的32KiB图与上述SHA完全一致。P04原输入契约未被追溯改写；P13仅补固定资源正常解码接缝，DOS仍为声明合同、启动后续/其它输入及图8条未观察边不冒称全闭合。

## 三、寻径算法

### 3.1 入口与调用链

已实锤：

```text
军团月内 tick 0x25A3
  → 单军团更新 0x2662
  → 需要选择/切换道路边时 0x47BB
  → 路径查询 0x491B
  → 邻接扩展 0x4A0F
  → 返回下一条边和方向增量
```

`0x487B` 负责从势力首都/目标据点反查目标拓扑节点，并调用 `0x491B` 判断下一跳。

### 3.2 算法性质

已实锤：`0x491B`：

- 入口起点已等停止点时直接CF=1返回；其余才清空`0x8000..0x87FF`的访问/工作区；
- 使用 8 字节队列条目；
- 保存`{node,cost,回向stride,进入该节点的edge}`，不是把根的第一跳一路传播；
- 分批扫描当前最小费用项，非最小旧项的搬运与新项入队交错；
- `0x4A0F` 展开节点的四个邻接；
- 读取道路**边记录**`+4`的byte成本并累加（不是节点`+4`）；
- 到达目标后返回第一跳节点/边，而非整条路径。

仅以“Dijkstra/带权BFS”命名不足以定义规则：正成本、无溢出小图也能区分原批次队列与逐项优先队列，完整局部合同见§3.5。

### 3.3 路线选择策略

原版路线选择基于拓扑边的累计权重：

- 优先总代价更低的道路链；
- 只走地图构图阶段确认过的道路连接；
- 不在全图通行 bitmap 上自由做 8 向捷径；斜向变化只能来自构图阶段确认的道路点列；
- 长道路被压缩为边，搜索规模远小于 `384×256`；
- 军团每次换边时可重新搜索，不必永久缓存整条路线。

旧“weight=点列长度/与Dijkstra一致即原版”结论撤销：E81C特殊首点不计AH，E7AE存byte代价，4A3D读取；现图每边为点数−1，49DC城市节点另加4。完整原始窗口见[自定义数据基础军团§6.3](re-notes-custom-data.md#legion)。本批仅勘误，既有probe/运行权重未修复。战败撤退的`0x491B`展开非己城市时先`DX=u16(DX+A6h)`、再`DH|=80h`，随后城市节点加4、边加byte代价；不是反复加常量80A6h。它仍继续展开邻接；`0x487B`最终只要求即时第一跳城市属己，不能把非己城市当成全程阻断。军团当前`+0x0E`是据点节点时，`0x48E5`以首都为目标反向搜索，`0x48EA..0x48F1`按返回`±4`校正边指针并取该边另一端作为即时下一跳；因此破城后当前据点已经易主，也不会把该节点本身误当撤退目标。

### 3.4 双端撤退与CF返回勘误

`487B`取首都为反搜起点AX。军团位于边内时，`48AF/48B2`读`CX=edge+6、BX=edge+8`；两端都己有便保留两个停止节点，只有一端己有才折叠为同一个节点，两端都非己则`4903`返回CF=1。`48D7→491B`从首都按原队列/word代价寻找先命中的停止点，**没有“只要+8己有就优先+8”规则**。三角图首都到end6/end8边byte代价7/9时选end6，9/7时选end8。当前为城市节点时BX=CX=current，由`48E5`搜索；通常返回后取即时下一端并检查归属。

`491B`在`491B..4924`见AX等于BX/CX时立即CF=1，未初始化队列；`487B`的`48DA/48E8→490C`把AX乘4作为城表偏移并CLC。因此首都正好在当前边端点是**成功快捷路径**，不能统一把搜索CF=1当无路。

另`49AB..49B4`队列耗尽也CF=1/BX=800h，`490C`未区分原因而同样使用遗留AX。正常到该出口的AX/CX现已闭合（§3.5）；原图全输入域的耗尽可达性、word代价回绕/队列容量仍须继续核，不能增加“断图就近返都”的兜底。上述失败接口不能与原MAP连通性证明混为一谈。精确费用：`493B`把DL势力写入`49D2`比较立即数；`49CD/49D5/49D9/49DC`依归属执行加A6、OR8000、加4，再由`4A3D/4A40`加边byte并进位，全部16位回绕。普通非负Dijkstra的数学等价不能覆盖这些溢出分支。

本节是AI全链专项对旧结论的原窗复核，原KI哈希及认证边界见[专项总纲](re-notes-ai-chain.md)。原始入口参数、临时队列和返回寄存器必须一起保留；Web固定端点优先及旧权重尚未在本专项修复。

### 3.5 P24：491B环队列与确定耗尽返回

**实锤**：`491B..4A7A`完整局部静态合同，本体无RNG/消息/DOS调用；不等于所有调用者下游、完整世界或全费用/容量可达证明。原窗与补录证据索引在journal P24；父对原指令独立复核后增加`navigation/originalroadsearch.js`纯数据算法及`verify_original_road_search.mjs`，**默认生产图源/一般移动尚未接入**；detached v2的487B战后caller切片见§3.11。

输入为图段、`AX=根、BX/CX=任一停止点、DL=所属`及D52城市所属。非快捷保存ES/DX/SI/DI/BP，执行CLD；返回AX/BX/CX/CF，DX恢复整个入口word。Web局部API只表达可观察AX/BX/CX/CF，不替不存在的CPU寄存器补零。

|原位置|确定行为|
|---|---|
|491B..4924|根已等任一停止点则直接CF1，保留AX/BX/CX，不清工作区，也不CLD|
|4940..495A|清8000..87FF共1024word；**不清8800..8BFF队列**。AX0、SI根、DX0、BX8800、DI87F8、CL1/CH0，直接处理根，不读虚构根队列项|
|49B6..49FE|先检测停止点。未命中且node<600时，非己做`u16(cost+A6) OR 8000`，然后城市加4；node≥600连+4也跳过。四邻接按+0/+2/+4/+6顺序展开，AX保存本批min|
|4A0F..4A79|访问标记是`u16(slotAddress+8000)`的byte。先读tag，再看visited；无tag也置visited。4000tag取edge+8/strideFFFC，8000或C000取edge+6/stride4；加edge+4成本byte并16位进位。反向邻接按+2找低14bit相同edge，原码**无四次上限**；两端槽均标记，写完整8B项|
|49A0..49B4|输入头按`u16(ptr+8)&FBFF`推进，CL做byte减；CL0且CH0才耗尽。物理环128项，但CH是byte，原码没有容量检查/钳制|
|495C..499E|扫描整批项的unsigned word最小费；4968先读以比较，严格更小时496C再读以赋min（相等不重读）；CL=原项数、CH0，按输入序处理。较贵项复制到输出尾；最小项展开的新项也立即写同一尾，因此两类输出交错。复制四word的读取/写入次序不可在别名域先快照化|
|4A00..4A0E|命中返回该项stride/进入边/cost，即AX/BX/CX，CF0；不是完整路径|

正常落到49B0必经49A9未跳（CL0）和49AB/49AE未跳（CH0），尾部没有POP CX。因此**CX=0**确定；第一次根无候选时AX0，否则AX=最后一批min；BX800/CF1。撤销“耗尽AX/CX一概未知”。输出计数byte归零不等于证明无限抽象队列真的为空。

**调用者不能统一CF1→blocked**：47BB两处分流只看CX>=8000及命令≥0A，不看search CF。耗尽CX0跳过291A门，仍读图0800。边内按AL==4取该边+6、否则+8，与旧当前边+8比较以写±4；节点路径按AL==4取首点、否则末点，并写0E800、0A=AL、清bit0、CLC。所以失败可写0A0或5；不能强归一成±4。这不授权恢复旧战后stride0截断路径。487B的490C也仍将AX左移2作城偏移并CLC。

可重复的静态golden，完整显式tag/byte输入在上述纯内存测试：

- **S1**：N0=0、N1=8、T=10h，0800连接N0/N1成本20，0810连接N0/T成本3，0820连接N1/T成本3。T槽先8810后8820时从T反搜N1/N0返回`4/0810/7/CF0`，交换槽顺序返回`4/0820/7/CF0`；仅交换停止参数不改队列次序。
- **S2**：R/A/B/C=0/8/10h/18h；0800 R→A成本1、0810 R→B成本6、0820 A→C成本1。R槽4800/4810，A槽8800/4820，其余互反、空槽明确0，全己有。先生成A5/B10；下一批读A时先生成C10，随后才搬运旧B10，下一批C先命中，返回`FFFC/0820/000A/CF0`。逐项稳定优先队列会先B，已构成正常正成本反例。
- **S3**：S2将R→B改1，新增B→C成本2及互反tag；A/B同为5、分别向C入队10/11。visited[node]不能删除第二项。
- **S4**：仅R0→A8成本1，U10h孤立；搜U正常耗尽返回`5/0800/0/CF1`，从孤立U搜R则`0/0800/0/CF1`。接47BB节点端，前者可写stride5；golden止于该RET，不猜后续非对齐点读取。
- **S5**：130节点单链，N_i=8i，E_i=0800+10h*i，每边成本1、互反tag、全己有。每批一项，N128写8BF8后回绕，N129写8800；返回`FFFC/1000/0285/CF0`。改搜未命中的停止地址0410则`0285/0800/0/CF1`。这是环尾控制，不是积压超过128项认证。
- **算术与边界**：连续两个非己节点、边成本1得8156而非0156；78条成本255、非己城市单链得817E，覆盖ADD A6先回绕再OR的声明域；显式非城市node600→608成本1不加4。未知反向邻接读须报域外且保留先前写入，不伪造“无路”。

原队列旧byte不能默认为零；在上述普通输入中，读项都来自本调用已完整写入的项。局部实现由调用者提供可读/可写内存，未知byte抛错，之前写入不回滚；不分配清零队列或用无界数组假装原环。容量覆盖、CH回绕、地址别名和不匹配反向扫描须保留实际字节/顺序，不能由普通小图绿测扩大认证。

默认资源缺口已从旧P04图继续核：192节点768tag槽、508有效互反链接/260空槽，254边各恰两端，无自环；**121节点**的原邻接顺序不同于edge-id插入序（如node2原`3,4,0,5`，插入序`0,3,4,5`）。原byte成本总5272、每边点数−1；点flags见§5.4。当前源/运行图都未存tag与flags，成本仍旧值。已导入新目录并核差异（§3.6）；仍待编译/发布及接入491B和各调用者，不能直接改生成物或把新增原语单测说成P1已修。

### 3.6 P24：图字节重建与默认图条件队列界

**实锤（限定输入的静态合同/数学推导）**：默认P04图、有效节点偏移和通常不别名RAM条件下，可以给出待处理项上界127；这不是某次运行实测最大值，不要求费用单调，也没有证明全部原调用者始终满足这些前提。

**初始化与字节重建**：19ED取AX=CS9874图段，19F6取CX=CS9876种子段，1A00 near16调用E48A。E492..E49B以ES=CX清8000h个word（64KiB）；恢复AX后，E49F..E4A9以ES=AX清4000h个word（图0000..7FFF）。E4CE保存AX、E50A恢复，E729以DS=AX写正式图。图低半区的空白和边+5零值有指令依据，**不能将另一段的64KiB清零借给图高半区/旧队列**；491B仍仅另外清8000..87FF。

父固定读取P04产物（SHA c226fc8fd8567ffc23a927e09419797d9d94b06c1b4d67bbf9b73909981e7afc），把原四tag槽、成本byte、完整point flags及bbox四字段导入新目录`road-source-import-v1/world/roads.json`。候选格式version2，SHA353a6c706e002f94a861ef515d11342080290cffbcbb0acc7053231413ecadf7；**未发布到仓库源/运行资产**。192节点、254边、5526点，点流止于7658；每边内部坐标无重复。按低32KiB清零后依次写节点、16B边头和4B点，可重建全部32768B，零差异、同P04 SHA。它是既有数据核对，不是新构图执行或任意地图生成器证书。

**P57重建（用户批准(a)，2026-09-21）**：历史候选`353a6c70…`在盘上与git历史中均不存在（`road-source-import-v1/world/`仅剩空目录，Temp各road目录无重建产物），故按批准以新候选顶替，而非绕过pin。重建输入：probe轨迹数据（192 origins/254边几何端点，全与P04一致：光栅序==v1节点序、边端点+5526坐标+顺序全合、flag类直方图与§5.4逐项相等）+已文档化E717规则（现刷`E717..E80D`：逐节点×4槽顺序处理、SI无条件+2故槽位位置固定；`E77D`源槽写`0x40|边地址`、`[DI+6]`源节点基、`DH^=1`目标槽、`DI+=0x10`；`E81C`：`DH`步进0=W/1=E/2=N/3=S、`AH`逐点计数故成本=点数−1、`E484/E486` X极值word、`E488/E489` Y极值byte、城市块`AL=4`起`OR 0x40`得`0x44`；目标槽=反方向下标，与node2 pin`[3,4,0,5]`及508互反/总成本5272/点流止7658全合）。新候选SHA `b943e43a…`（193288B），落盘`tools/fixtures/road-v2-candidate.json`；等价证明：自编码与真实`createOriginalRoadMemory`双双复现`c226fc8f…`+`d443c417…`；`verify_road_v2_content.py`改pin+默认`--candidate`后全绿（`verify_road_v2_content.py`历史BLOCKED到此退役）。默认源/运行资产仍v1；翻转默认+App门+live调用者接线仍是下一阶段，不在本批。

**条件界的原始数据前提**：192节点全部连通，254边无自环、每边两端恰有4000/8000互反槽，度数`{1:1,2:96,3:65,4:30}`，唯一叶节点27。图/队列与城市状态段不别名；代码/栈/RAM正常，无重入或外部写图，城市所属读取有效。start是`8×id`（id=0..191），声称必命中时至少一个stop也须如此；不能拿节点编号直接充偏移。

证明要点（令n=192、m=254、c=m−n+1=63）：

1. 对非空连通S定义`f(S)=|E_inc(S)|−|S|+1`。若补集还有边，可加入一个与S相邻且仍有补集邻边的节点v，f增量为补集邻边数减1，非负。反复扩充至连通顶点覆盖C，故f(S)≤f(C)。
2. I=V−C独立，C连通，故`sum(deg(v)−1,v∈I)≤c`。只有一个叶节点，其余度≥2，所以`|I|−1≤63`，`|C|≥128`，`f(C)=m−|C|+1≤127`。
3. 在首次物理覆盖/计数失真之前，令S为**已开始展开**的不同节点，p为已消费的非根最小项数（含正在展开项），e为成功入队项数。S连通，重复节点只增p；槽visited与固定互反关系使每边至多入队一次。因此每次部分展开后`Q=e−p≤|E_inc(S)|−|S|+1≤127`。carry是移项，不增Q。
4. 令U含当前输入、O为已有输出，尾在读头后U+O个槽。最小项已消费时Q=U+O−1，入队后仍≤127，写不覆盖未读输入；carry时Q=U+O≤127，目标亦不重叠，保护498C/4992的延迟源word读取。对“首次覆盖或计数失真”联合归纳即可闭合，**不是先假设无限队列等价**。CL/CH各≤127；不要求每个指令瞬间CL+CH也≤127。虚根495A单独作基例，不读87F8。
5. 每个非空批至少消费一个实际最小项，FFFF也会匹配；word费用回绕不破坏计数。总入队至多254，故结束。若最终空而还有未展开节点，连通性跨界边应已生成指向它的项，与无丢项/最终空矛盾。故有效stop先命中，不能落49B0耗尽；入口已等stop则走快捷CF1。

此证明**仅排除上述默认有效域的容量覆盖/耗尽**。§3.5其他图、无效参数及别名域的字面返回合同仍保留；不能据此删掉原环、把CF1统一转blocked、证明当前Web Dijkstra等价，或认定玩家现象根因。尚须审调用者的节点字段、其他图写者及完整移动接续。

父产物均在`C:/Users/fczll/AppData/Local/Temp/dragon-ai-slot-order-parent-uudvtfid/`：`road-init-clear-raw.txt`、`road-init-caller-raw.txt`、`import-default-road-fields.py`、`reconstruct-imported-road-memory.py`及`road-memory-reconstruction.json`；`check-road-queue-bound.py`、`road-queue-bound-input.json`保完整tag/端点/BFS树，`road-queue-bound-proof.md`保原证明。fresh只读子67addc80-fe0f-4d86-b8a7-c273673c23cc无P1/P2，条件OK；报告冻结`road-bound-proof-review-first.md`，SHA a5e9492037f6b1eccfb467f24c3264c7b46fa72f929b3c1ea4b13ade0c7be99c。子未执行脚本/搜索/哈希，未独立复算32768B。

**实现与验证边界**：`navigation/originalroadmemory.js`的`createOriginalRoadMemory`只编码version2记录并保留known-byte集合：低32KiB已知零，未写高半区读取抛错，写入立即持久；不按几何补flags/cost/bounds，不暴露底层分配零。内容profile拒绝点流覆盖搜索工作区是资产校验，不是原版“无路”结果。默认源/运行资产及原生调用者仍未接线；显式v2预备加载支持见§3.9。JS编码候选低32768B与P04同SHA是既有资源一致性核验；有限所属配置的原生查询不是2^192所属枚举、原程序对拍、全部费用正确性或原战役认证。代码测试数量、日志及当前验收状态见[journal](checkpoint-journal.md)，不得冒称全回归。

**未接线的互反槽校验**：同模块`createCheckedOriginalRoadMemory`先编码，再检查每条边非自环、4000/8000两类tag各恰有一个且位于对应端点；低14位必须是现有16B边头地址，拒绝错误selector、错端/重复/缺失槽和悬空/未对齐地址。依据是E717/P04的有序互反槽以及4A21..4A4E的指针消费：反向扫描不自带四槽上限。该检查不排序、补槽或改写flags/成本，只读编码后的低半区，高半区仍未知。

这是**Web资产结构校验**，不是宣称KI会拒绝这些损坏RAM，也不能将异常转成原版blocked。它允许结构完整但不连通的图，不能据此推导127界、可达性或证明任意新地图已受支持；还不校验世界/城市坐标一致性、图块与flags语义、bbox几何或调用者参数。返回RAM仍可显式写入，初始检查不保证后续无人改图。默认生产仍使用v1资产；§3.9新增编译器/加载器的显式v2预备支持，不能把此工厂或预备支持当作已完成生产发布。

<a id="37-p24d52城市归属适配尚未接线"></a>

### 3.7 P24：D52城市归属适配（detached战后接线见§3.11）

`49C3`仅在节点偏移<600h时读取城市：`49C9/49CB`将节点偏移乘4，`49CD`读取`ES:[SI+0841h]`。有效节点是`8*slot`，所以这实际是D52城市表0840h、32B记录的**+1归属byte**；不是+3，也不是节点id直接加到0841h。随后才走ADD A6/OR8000和城市+4。原窗491B..4A0F已列于§3.5；搜索命中检查49B6先于该读取，因此停止节点不会额外收城市费用。

`navigation/originalroadstate.js`仅提供这192个对齐归属地址的Web适配，不伪造完整D52镜像。按固定slot取命名`city.faction`：明确null按现有`compile_chapter`的城市+1编码为18h，数字保留byte值；读取即时命名字段而非可能陈旧的初始`city.raw`。这是Web表示适配，不证明原程序使用JS或任意byte都是有效势力。缺槽/错idx、缺归属、超byte值及其它地址均为未覆盖错误，不能补成中立/0或当成原版无路；原搜索此前已完成的内存写入不回滚。

该适配不能处理坏根节点造成的其它D52别名地址，生产调用者仍须先证明有效入口。也未因此连接生产AI、更新图资产或建立图工作区保存生命周期。纯内存控制入口为`tools/verify_original_road_state.mjs`，实际执行与审阅状态见[journal](checkpoint-journal.md)。

### 3.8 P24：原图RAM快照前置切片（Web工程，尚未接生产）

原始约束仍是§3.5–3.6的E49F图低32KiB初始化、4940仅清visited、旧queue不清以及未知读取保留此前写入。本节不新增原版机制结论；JSON格式是未接线的Web内存编解码，不是DOS SAVE格式，也不改变现行IndexedDB或旧档准入。

`navigation/originalroadmemory.js`返回的`snapshot()`生成独立纯JSON：

- `version: 1`是**内存快照schema版本**，不是道路资产版本；资产仍要求version2。
- `initialGraph`是构造时低32768B的完整小写hex，固定捕获、逐字节匹配；绑定的是**初始图RAM**，不是当前已修改RAM、外部可变JSON标签或完整world/content身份。
- `patches: [{address, hex}]`按地址升序合并相邻变化。低半区只记录不同于初始值的byte；高半区记录所有已知byte，**包括显式写入的0**。高半区未出现的byte仍未知，不能补零；低半区写回初始值可省略，不丢可观察状态。保留全64KiB地址域而非只存visited/queue，以免漏掉显式别名写入。

`restoreOriginalRoadMemory(graph, checkpoint)`先创建新的、通过初始互反结构校验的图，核对版本/完整初始图身份，再校验所有patch的整数地址、小写偶数非空hex、64KiB边界和升序不重叠；最多接受65536段且解码总byte不超过65536。校验后才对**新实例**应用运行时写入，包含低半区变化，不对这些运行态重新套初始互反校验。失败不修改既有实例、输入graph或checkpoint；这不改变原搜索遇未知读取时保留部分写入的合同，也不等于生产装配事务回滚。快照/恢复不重播搜索、清旧queue或耗RNG。

纯内存控制入口`tools/verify_original_road_checkpoint.mjs`覆盖JSON往返、全地址known/unknown、已知零/洞、低半区改写、独立实例、损坏范围/身份拒绝、完整64KiB与65536单byte段边界，以及恢复后连续查询的返回和写序一致性。它使用已确认静态合同的合成图；同原生引擎的保存前后对照不是独立DOS算法oracle。实际批次、默认图候选核对和负控结果见[journal](checkpoint-journal.md)。

**后续工程接线见§3.9–3.10**：每Scenario RAM适配已接detached准备和正式snapshot sidecar；生产仍只准入v1，不支持从标题读取v2。初始graph byte相同不能证明城市/世界相同。默认源/运行图和生产选路仍v1/旧链；发布v2及接入47BB/487B等必须继续联动这些边界，不能把工程往返叫作完整道路接线或全AI完成。

### 3.9 P24：v2内容与Scenario生命周期预备接线（非生产切换）

本节是**已批准的Web工程预备合同**，不新增KI机制结论。沿用§3.6可复核的E717..E81B字段/有序tag与P04固定图、E49F仅清低半区、4A21..4A4E互反槽消费。显式v2候选仍只用于新目录，不从v1几何推导缺失字段，不修改默认源`world/roads.json`、运行`road_graph.json`或默认world revision。

- **内容/编译**：`tools/content_pipeline.py`接受v1/v2，v1的有限正权重和既有字段不变；v2额外要求nodes/edges为数组、byte成本（含0）、四个有序word tag、逐点byte flags、显式bounds、非自环互反端点、固定节点槽与不覆盖point/search区的地址布局。空edges数组配全部零tag可通过结构门；空对象/字符串不是数组，必须拒绝。这不证明空图连通或被原调用者接受。Python与`navigation/originalroadcontent.js`同样要求384×256坐标域、唯一节点坐标和bounds恰为边点坐标极值；这是Web资产一致性门，不声称KI会拒绝损坏RAM。编译器另外保留世界据点坐标/边界tile检查。v2编译仅允许**尚不存在的新输出目录**；全部校验完成前不创建输出，既有v1编译行为不变；实际文件发布仍不是跨文件事务。
- **loader/世界资源**：`navigation/roadgraph.js`先克隆并完整验证v2候选，再深冻结所有节点、tag数组、边、bounds和points，最后一次安装索引。失败不暴露半图、清失败promise后允许重试；成功后不提供热替换入口。`worldresources.js`克隆并深冻结定义（包括assets/seasons），冻结返回资源容器，避免调用方修改初始对象或替换definition/roads污染身份和异步URL；RAM不放在共享资源上。
- **未接线隔离**：安装v2后`findRoadRoute`、旧行军restore/serialize/reverse helper及格网`findPath`在任何相同起终点/缺节点/未载成本等快捷返回之前明确抛出“v2 road rule callers are not connected”。不退回Dijkstra/A*，不伪造原版blocked；只读节点/边/地址/端点几何仍可读。读取几何不创建RAM、不执行原搜索或写visited/queue。未加载与v1的既有行为不变。
- **独立Scenario适配**：`navigation/scenarioroadmemory.js`以私有WeakMap按`Scenario`对象持有RAM。`initializeScenarioRoadMemory`只接受未绑定对象和已加载v2；重复初始化/恢复已绑定对象一律拒绝，普通`getScenarioRoadMemory`只取既有实例，绝不按次查询重建。`restoreScenarioRoadMemory`只向未绑定对象恢复，先核所有身份与完整codec checkpoint再绑定；失败不触碰live所有者且目标可重试。
- **身份与暂存JSON**：显式调用方必须提供非空`{packId,chapterId,revision}`，世界身份取冻结定义的`{id,revision}`，无默认补齐。`snapshotScenarioRoadMemory`输出独立`{version:1,identity:{world,content},memory}`；`memory`使用§3.8完整初始图bytes/patches合同。版本是适配schema，不是phase1或原地址单位证明。身份以值捕获，返回JSON和调用参数不别名；已知高半区0、未知洞、旧queue及低半区变化经JSON保留。RAM函数不进入可枚举Scenario或结构克隆。

**本预备批次的后续**：正式新局/读档的catalog/world/cities准入、异步票据、snapshot sidecar及detached城市归属reader已由§3.10接续，生产仍拒v2，不会从读档缺失RAM猜新局。调用方伪造同名身份不是内容认证；相同初始RAM只绑定图bytes，节点坐标等world数据靠显式world revision管理，并不升级为任意世界切换支持。487B/4DA4的detached实际caller切片已由§3.11接续；47BB、剩余移动字段及战役因果仍未接线，默认v2发布必须等待这些边界联动完成。

回归入口：`tools/verify_road_v2_lifecycle.mjs`为合成内存/mock-fetch控制；`tools/verify_road_v2_content.py --candidate <固定候选路径>`先校验§3.6候选SHA，再复制Web源至临时目录编译。v1全内容/loader回归及私有负控的实际输出和源码SHA仅记录在[journal](checkpoint-journal.md)，不把工程往返绿测当DOS搜索或全游戏认证。

### 3.10 P24：正式装配与保存身份准入（Web工程，生产仍限v1）

> P60路由翻转裁决（用户批准(a)）后：fresh装配默认v2、出货图即v2候选、native上下文走原生47BB/491B（见journal P59审计矩阵）。本节下文“生产仍限v1/拒绝v2/未进入默认生产调用”均为P24当时表述，作历史保留，不再代表现状；机制结论本身不受影响。

本节是用户批准的下一工程切片，不新增KI机制结论，不改路由、RNG、槽调度、默认v1源/运行资产或world revision。`scenarioassembly.js`是实际`main.loadState`使用的共享准备合同，不另建可玩v2入口。

- **单一正式JSON表示**：新装配对象的快照在`webMeta.scenarioAssembly`写`{version:1,world:{id,revision},content:{packId,chapterId,revision},roadVersion:1|2}`；保留`scenario_idx`且必须等于catalog解析章节的`legacyScenarioIndex`。`webMeta.roadMemory`仅用于detached v2，完整沿用§3.9适配schema及§3.8内存codec；v1不允许携带该键，v2恢复缺失RAM不得fresh替代。顶层saved/state不得嵌入`scenarioAssembly/roadMemory/roadVersion`，不能在删除envelope后将残存RAM降级为v1。各version分别属于Web schema，不是原版地址单位或真实性认证。
- **同步准入**：`savegame.admitSavedScenario`复用克隆/sidecar合并后的phase门，再核上述schema、catalog reference/index及当前world id/revision。phase-valid且没有新metadata/RAM标志的既有v1继续准入，不猜其历史身份、RAM或相位。`StartMenu`行禁用检查只执行这一阶段，不加载道路/地形；hover/hit/click读取当前槽，不信行文字缓存，`beginSavedGame`在`enterGame`更改runtime/UI之前重验，`loadSave`在实际选择时再次准入。
- **detached准备**：`prepareScenario`显式区分`fresh/restore`，在首次await前克隆状态、checkpoint并捕获catalog/world身份；等待该world的terrain/roads，核实际loaded road version，以及固定192城的slot/idx与node id/坐标对应。城市归属是可变运行态，不与模板初始归属比较。v2才初始化或恢复已有WeakMap RAM owner，并将即时城市reader绑定到新Scenario；RAM不放共享资源或可枚举state，也不重复初始化。装配身份WeakMap不另持有一份RAM。
- **生产提交门**：任何v2在live Scenario、RNG、所选槽、initPlayer/buildArmies、外交及默认v1门面之前明确拒绝。相同端点、空军团、无边图不绕过准入。detached v2可走正式snapshot JSON测试，但不可从标题进入游戏；不增加开关或任意world热切换。
- **异步所有权**：pending预检使用独立assembly票据，参与既有hold并集与保存守卫；await后核entry票据、world/content对象及原clock。只有当前候选才能安装Scenario/RNG，最终资源屏障后才提交所选槽。交叠成功/失败与回标题取消不能提交旧候选或释放较新操作的hold。预检失败仅清理自己的pending/hold，保留旧live局/槽。`_scenarioAssemblyIncomplete`独立标记已开始提交但未过最终屏障的现场，和可被下一候选替换的`_scenarioAssemblyPending`分开；保存与clock均读取两者的并集。替代候选预检失败不清旧现场的incomplete，不恢复旧票据的提交/图片权限；旧候选已在等季节资源或已提交后失败两种状态均继续禁存/暂停。只有当前候选成功越过最终屏障或回标题丢弃现场才清incomplete；成功换局仍保留独立系统模态hold。提交后的部分写失败不伪装为整个load事务回滚，过期季节图片也不得写新scene。
- **快照失败边界**：从已绑定装配身份取metadata，校验当前index/world/catalog并复制RAM；v2不经过旧道路序列化fallback。独立未绑定的旧纯state测试/API仍可生成无metadata快照，但已知world加载v2或已独立绑定RAM却缺装配身份必须报错，不能降级或静默丢失。`saveGame`在候选快照/槽克隆/IndexedDB事务整个失败边界内捕获错误；快照失败不写槽/持久库，事务abort不得显示成功。JSON快照与live无别名。

**仍不支持的native范围**：原搜索未进入默认生产调用；§3.11仅接detached v2的487B→474A/4DA4。47BB参数/CF/CX、42AB同动作接续、flags/节点到达/方向，以及0E/14/20完整消费者仍待联动。现有v2结构门、城市对应和JSON连续查询只证Web一致性/保存连续性，不能宣称全部费用、原caller、任意世界、战役或全AI认证。

控制入口为`verify_scenario_assembly.mjs`、`verify_scenario_assembly_browser.mjs`及既有phase/checkpoint/v2-lifecycle/cold-load控制。浏览器必须从自有TEMP静态副本运行，使用新profile；状态/保存失败只用合成槽与隔离IndexedDB。实际先红/后绿、源码SHA、失败及未跑全量边界只记[journal](checkpoint-journal.md)。

<a id="native-retreat-callers"></a>

### 3.11 P24：detached v2的487B真实战后调用切片

> **当前native占城范围勘误：** [去向§10.4](re-notes-legion-fate.md#104-必要撤销native4cf3不再经过legacy占城f23重算)新核4CF3原写序，发现旧legacy官员/owner及F23重算顺序不成立。下述真实field/city双方战果及474A前缀继续保留；但撤销“native city apply已完成占城/迁都并贯通4DA4”的认证，本批[去向§11](re-notes-legion-fate.md#11-4cf3真实占城前缀与首都返回p24-capture-1)已让真实apply按原owner/C1A、F23 DEC、严格首都CF/4502及原BP4DA4推进；原leaf覆盖继续保留。官员/迁都消息与条件4FCE仍保前缀/hold/禁存；地图停点现由[去向§12](re-notes-legion-fate.md#12-c12地图续段与单一terrain权威p24-capture-map-1)的显式单一terrain/88CC/display-off域推进，不认证完整尾。历史成绩不代表当前完整capture返回。

**范围与置信度**：487B正文及474A/4DA4相关分支为静态原指令实锤；命名字段、assembly/RAM所有权和表示域拒绝是已批准Web工程合同，不是KI会抛异常的机制。正式`prepareScenario`绑定的detached v2，现由同一`ai.js`真实`continueLegionAfterBattle`、`applyFieldBattleResult`、`applyBattleResult`进入原487B和已有491B。没有另造测试专用战后内核。默认v1保原近似路径/成本；App仍拒v2、默认源/运行图未发布。本节不认证47BB/stepTo/一般移动、完整slot/tick、战术/消息非局部返回或全战役。

**可复核来源**：KI SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA+200h。以`P=C:/Users/fczll/AppData/Local/Temp/dragon-ai-slot-order-parent-uudvtfid`计：`movement-contract-v1/raw/movement.txt`的487B..491A/491B..4A7A，`battle-entry-return-raw.txt`的474A..47BA/4DA4..4DEF及4A7B/4ADE/4CF3/4DF0，`battle-continuation-flags-corrected-raw.txt`的5130/5192/51A1，`fate-wrapper-raw.txt`的291A调用边界。原窗哈希依次为`d1e948557bf436e111e2952fe6d0fc5f31419b2fac919a3f3c575f622f157ad7`、`d53c58b3c6a965b90a765808376fc0760fff7ddac44be5515bb60787aa966b7d`、`81be58476d2325f52b62fc8f590fa7e46945a742b7bfba1deb81c23608cee12c`、`849bfc2321b5c733f5a184fac871e6fe502d3c8c3a55e0526a4c7a59aa7b3ee9`；字节核验与本批输出记journal，不把静态比较称为执行原程序。目标provenance索引为`road-authority-review-v1/target-provenance-v1/{manifest.json,references.txt,source-inventory.json}`，不是不存在的`raw/targets.txt`。

**487B ABI与顺序**（`navigation/originalroadretreat.js`）：

- 487B先读L01及所属首都byte。明确null沿现有命名编码为FF，undefined/缺槽不得吞成FF。FF立即CF1、不读0E/图/城市；本适配没有输入AH/CX，所以返回仅`{bx:faction*40h,cf:true,reason:"no-capital"}`，不拼假AX/CX；AL=FF已知但真实caller只消费CF。其它出口返回完整`ax/bx/cx/cf`。
- 488D取首都×8为AX，4897再读L01，489A读权威word0E（不看x/y或_battleRoadContext）。边内先读+6→CX再+8→BX，先查+6 owner再+8 owner，一己则折叠，两己保双stop，两非己直接CF1。无首都所属前置门。
- 48D7/48E5使用同Scenario既有RAM执行491B。边内只有完整AX==FFFC才对返回BX加2；节点路径只有完整AX==4才加2；再读[图BX+6]×4，按即时city+1比较所属。不是按AL比较，不要求整路己有，也不把高费用当CF失败。
- 任意search CF1（快捷/耗尽）均走490C：**AX本身两次word SHL**，BX=AX，CLC；不复查owner，不清旧queue。无分配/按次重建RAM，也无RNG/消息。
- **命名返回桥**只接受CLC且BX为20h对齐、在0..17E0h：city/targetNode为BX/32。raw14本应BX>>2，当前targetNode仍是Web id；不造raw别名、不从20回填14。其余确定成功返回抛`Uncovered original road retreat city return`，不是原CF1/blocked。孤立根耗尽AX0→BX0可映射（不加owner门）；R0→A8 cost1、stop10h孤立时耗尽AX5→原487B AX/BX14h、CX0、CLC，桥拒绝但保搜索写。

**实际caller与部分失败**：474A保既有6FD2/phase前缀，士气0/首队0及winner先短路；败方4761按0E<600h读取城市归属，不用坐标。成功先写targetNode（14投影）、targetCity（20）、OR2，再按总兵<=300短路或重新读即时首都决定10/8；低兵不额外读首都，晚读异常前不抢写命令8。487B/474A不改0A/0C/0E或位置。4DA4在既有易主/迁都之后，只用原BP[0]查询一次，再按原列表20→14→0B1→OR2，包括已退场成员，保23/03/1E/道路残值；不会重扫active或复活。CF1才按原列表291A；工程错误直接上抛，不能多派291A/消息/RNG或回滚前序战果、首个474A/组内前序成员及workspace。field apply仍先两侧战果再攻/守474A；city apply的同一结果前缀修正见下段。既有AH失败分派、捕获方参数、迁都/消息/灭亡顺序未改，不以此宣称完整DOS消息返回。

**攻城结果前缀（P1勘误）**：`5180/5189→51B3`先写双方六队（5215/523A）、总兵（5249/524C）和士气（5265/527D），返回后才`5192→攻方474A`、`51A1→守方474A`。旧city apply把守方结果延迟到攻方474A之后，本轮新可达的搜索/表示域异常会漏掉已发生的守方战果。现共同入口先提交双方预计算结果，再保持攻/守474A次序；这也调整v1共用入口的结果写回时点，但不改伤亡/士气公式、原近似选路、相位重置次序或默认资产。异常仍上抛，不提前执行守方474A/291A，不回滚已提交结果及攻方/workspace前缀。可复核控制为两断边0→1 cost20、2→3 cost1，势力0首都2、攻方0E=800h、城市1与主守军属1：487B耗尽后BX=14h触发工程拒绝；主守军600→360及结果士气应已写，守方0B/1E/23尚不改。真实战略resolveBattle已提前扣城损；本修复不把城损遗漏列入该反例，也未移动城损或消息分派。

**所有权/保存**：`scenarioNativeRoadContext`仅从正式assembly绑定取得对应roads、即时owner reader和现有WeakMap RAM。无身份却独立绑定RAM、显式错位v2标记、身份/版本漂移、缺必需字段/未知RAM均抛工程错误，不fallback默认v1或fresh RAM。无metadata有效phase v1仍沿原准入。保存接缝曾暴露native真实caller创建_retreat而无_march时，旧snapshot访问sourceMarch.targetX抛错；批准修为native不读取/序列化legacy retreatMarch，保权威字段、_retreat和正式roadMemory。v1保存路径不改；有/无/污染_march不影响native快照及恢复后真实caller。

**验证层级**：`tools/verify_native_road_callers.mjs`使用合成192节点v2+四资产mock fetch+正式prepare。静态三角图3/9及平权tag顺序、双端折叠、FF/shortcut/耗尽、异属首都/失陷节点、真实field/city apply、query/写序、不同slot前序写、known0/未知洞/旧queue、JSON再入真实caller及只读几何均有控制；旧AI与CF/单stop/清queue私有变异应实际红。图几何只读测试不是完整Canvas/浏览器冒烟；direct RET、战后apply与真实25A3连续槽/消息栈证书分开。后两者及完整安全共享保存回归交独立验证，不由focused绿代替。精确命令、红绿、SHA、工具缺失和未覆盖边界只记journal/批次报告。

<a id="native-movement-callers"></a>

### 3.12 P24：detached v2的47BB与有限真实移动

> 接续状态更正：本节早期291A/463E/25E5全停描述由[去向§7](re-notes-legion-fate.md#7-有限-scenario-接线p24-fate-integration-1)的显式字段、无消息返回与失败前缀合同取代；其它未覆盖域不因此放行。

**范围**：正式`prepareScenario`绑定的detached v2现可由同一`ai.js`真实到期slot或`stepTo`进入`performOriginalRoadAction`，先于旧到达、retreat、outer reverse、engagement、缓存准备和默认road facade。复用§3.11同Scenario RAM/live owner；`selectOriginalRoad47BB`仅是驱动中的选边原语，不是第二游戏内核。正常返回才回到既有slot泵执行日费/03尾/余槽；异常由既有泵保前缀、取消余槽、hold/禁存。直接stepTo不额外执行25CC或尾段，tx/ty不改14。默认源/运行图仍v1，App v2仍拒绝；本节不认证到达命令、真正开战/消息返回、全初始化或全战役。

**证据与置信度**：规则为静态指令实锤，原窗仍是§3.11所列固定KI SHA/VA+200h及`P/movement-contract-v1/raw/movement.txt`：2662..28CB、42AB..4324、47BB..487A及491B。每次字节复核/测试输出记journal。`98`按16位CBW解释，原窗工具打印`cwde`不是32位运算依据。命名桥、占格能力/身份和异常边界是本批父明确批准的**Web工程限制**，不是原程序会抛异常。未闭合callee绝不作为普通RET/no-op或CF失败。

**显式占格能力**（`navigation/scenariomovementmemory.js`）：

- fresh显式传`movementMemory:{version:1,spans:[{address,hex}]}`；只复制给定known byte，不造全零格、不扫描军团计数。空洞未知；00/FF都是已知整byte。`270F..2728`以Ybyte×24段落+Xword访问，差址为`Y*384+X`。本能力只支持规范平面0..98303，不模拟未知9872基址、段回绕或别名。
- 军团指针两字段`occupancyOffset`（1A，0..383）与`occupancyRowParagraph`（相对9872的1C，0..6120且24整除）；这是规范指针，不是伪造DOS segment。旧pointer可以不同于x/y，不隐式修复。2699读取offset后row，269C先DEC整byte；仅正常26F7重读**当前pointer**并INC。0→FF、FF→0回绕，未知/越域在消费处工程拒绝，绝不finally补INC。
- 275F点提交先写row(2764)、再offset(2767)；27A2城市提交先offset(27E3)、再row(27E6)。分别写、分别验证，后半失败保前半。不把二者合成原子坐标写。
- capability保存在正式assembly的Scenario WeakMap所有者中，与原图RAM同寿命；context只读查找，不逐查询创建。snapshot正式`webMeta.movementMemory`带version1、exact world/content身份、复用road checkpoint的完整initialGraph与known spans。JSON恢复校验身份/图/有序不重叠有界spans，保unknown/零/FF，军团指针仍由普通状态快照保存，无冲突副表。capture在await前复制输入。
- 缺此可选能力的旧detached v2仍能prepare、487B、snapshot、JSON restore，只在移动入口拒绝；v1、错位metadata、错身份/图拒绝。无metadata有效phase v1准入不变，不迁移旧档、不推测占格初值。

**47BB原写序**（`navigation/originalroadmovement.js`）：先14→0E→01，边内先edge+6→+8；目标等+8/+6快捷OR1后写stride4/FC，不搜索、不写0C/0E。其它目标从14向两端反搜，保旧+8作BP。只在unsigned CX≥8000h才读23，23≥0Ah再读01并在291A边界抛；保搜索RAM及外层DEC/清bit1，不假STC。低费即使缺23也不抢读。边内仅比较返回**AL==4**选返回edge+6，否则+8；所得端等旧BP写4，否则FC，保旧边/点。节点相等CLC无写，其余反搜后依次写0C→0E→清bit0→AL低byte stride。**忽略search CF**：耗尽仍读0800，节点可写stride0/5而非统一±4；边内AL0读0800+8，若等旧BP则+4。对外只声明CF，不伪造本接口没有完整输入/验证的其它47BB寄存器ABI。

**2662/42AB/点推进**：

1. 初批0E==14在266E、NPC节点在4304暂停的边界已由[§3.13](#native-arrival-callers)限定推进，不能再概称全部到达/缓存未覆盖。bit4置仍在267A→2BA8停，不提前清bit4；普通移动其余流程不变。
2. 边内42AB仅stride byte==FC选+6，其它（含0/5/80）选+8。己方/18h先短路，其它才读显式外交byte；≥80h读另一端并依次写14→20→OR2，然后**同动作**继续2697，不返回`reversed`，不保旧最终目标。city owner实时命名读取；未知外交不补NEUTRAL。
3. DEC旧格后，有bit1先清再47BB；节点新边直接提交0C，不能先26FF错误置bit0。普通边内26C8读取当前完整flags：low3<2继续，否则bit6置且signedStride>0或bit6清且signedStride<0继续，其它27F6/27A2。26FF先OR1、再CBW stride与旧0C按u16相加。
4. 2708依序读Xword、Y/flagsword、候选occupancy。非零才2831；随后**总先读所属world terrain byte**，再看bit0及tile CE..DD决定2880。候选拒绝未提交；通过后row→offset→0C→独立重读candidate+2→Xword→Y低byte（保高byte）。第二flags门再按同条件决定方向或节点化；一次动作最多一个候选点，不在同动作调用4325。
5. 2808以u16(currentX-nextX)非零优先取bit15生成0/1；X相等才u8(currentY-nextY)的bit7+2，相同坐标保marker。27F6先NEG **byte**再CBW（80仍80），看反向点后XOR1。27A2仅stride byte4选edge+8，其它+6；先写0E，node<600h再按固定city slot先读X/Y、写完整X/Y，然后offset→row（Y低byte×24）；node≥600h不改坐标/pointer。重读0E==14才marker4；保0A/0C/status/14/20/23。城市桥失败保已写marker/0E。

**有限接触**：2831扫描slot0..126；初批沿live列表把缺席当空的模型已被[§3.15](#native-formation-callers)单一固定槽表替代，缺槽/缺status不跳过。不看dead/_active，不排self。active先比Yword（候选Y零扩展）、再Xword、首次匹配才比较双方所属；低slot友军直接放行，不再找后面的敌军，slot127不扫。异属或2880异属/18h城市先OR20，再读固定03：0写12；>1保值（Web音画仍由既有独立表现时钟，不在本驱动发原硬件音效）；1的野战2873按[去向§13](re-notes-legion-fate.md#native-field-terrain)进入首次DI/candidate-Y AL的4A7B/4B63前缀，规范4C41同占格平面别名与4C72原BP/存储评分已按§13.5接入，四次status/03写后按[§13.6](re-notes-legion-fate.md#native-field-dispatch)接4E5C/5130模式1、474A/AH去向及正常slot尾；玩家未知消息停4E82/4EA1，空名单停4AD3，未知/域外仍按消费点停；攻城现按[去向§15](re-notes-legion-fate.md#native-siege-integration)接真实28BF→4ADE/严格mode0/临时slot127/原BP与有限返回，玩家消息停4F36/4F13/4F06。只正常quick/有限去向返回才沿原INC和slot尾，不补未知callee尾。正常等待保原point/坐标、尾INC回旧格；完整slot首次12→11，直接stepTo仍12。`_engagement`仅按准确首次目标建立表现投影，后续判定不用旧投影重播/换主军；候选消失后真实slot清bit5并自然续走、尾清03。

**未覆盖边界**：到达/4300现仅覆盖§3.13列出的命名地址与handler域；其余仍停。2BA8显示链、291A高费去向的未闭合分支仍停；4A7B现仅按[§13.6](re-notes-legion-fate.md#native-field-dispatch)放行严格野战quick/有限去向及原尾，4ADE仅按[去向§15](re-notes-legion-fate.md#native-siege-integration)推进无消息限定域，玩家消息/战术返回仍未覆盖。新核静态291A在2944先判capital==FF再走君主/同属等门；2977于2989..298C另DEC占格后才status08/counter48/F14。现legacy helper缺这次占格副作用且有额外marker/cache写，不能直接复用作47BB的完整callee。详细原补窗索引`C:/Users/fczll/AppData/Local/Temp/dragon-movement-contract-h0f5at1x/raw-291a-29c3.txt`（原字节SHA `55394f0a445034efb7a2a77eb5dcaa5803d52ed91fcaf081a01739b65fb7b615`）、`raw-2ba8-2bd9.txt`；只是静态证据，完整链留下一批。§3.11攻城**双方结果先于攻方474A**的P1修复未重排/撤回。

**测试层级**：`tools/verify_native_road_movement.mjs`以正式prepare+显式plane+合成原byte图/精确tile mock为输入，覆盖真实474A后下一slot、同动作42AB、节点出发连续到期、flags两门、日费/03/余槽、工程异常前缀、持久RAM/JSON再入及cache无影响。原语47BB双stop/快捷/耗尽与真实动作测试分开；方向/读写顺序用受控reader/setter注入，不当作实际KI执行。两项新golden初红、私有变异、当前SHA/命令和剩余验证见journal；完整共享安全回归、主动诊断与独立review另行验收，不能借局部绿宣称全部道路/AI已还原。

<a id="native-arrival-callers"></a>

### 3.13 P24：detached到达命令与存储city+18缓存

> 接续状态更正：本节早期291A/463E/25E5全停描述由[去向§7](re-notes-legion-fate.md#7-有限-scenario-接线p24-fate-integration-1)的显式字段、无消息返回与失败前缀合同取代；其它未覆盖域不因此放行。

**范围/置信度**：固定KI静态指令为实锤；命名字段、显式known cache、精确异常是批准的Web工程表示，不是DOS异常机制。本节为本批唯一详细维护源。仍由`performLegionSlotAction → performOriginalRoadAction`及`stepTo`调用；不复用legacy `settleArrivedLegionCommand/state5AliasedByte/cityLocalStrength`，不新增槽泵、不启用App v2。默认v1与§3.11攻城双方结果先于攻方474A的P1修复不变。

**可复核原证**：固定KI SHA仍为`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA+200h。复用`P/movement-contract-v1/raw/movement.txt`（P见§3.11，SHA `d1e948557bf436e111e2952fe6d0fc5f31419b2fac919a3f3c575f622f157ad7`）的2662/28F4/4300；对齐新窗在`C:/Users/fczll/AppData/Local/Temp/dragon-arrival-contract-xuhoghtv/retry/`：`raw-4370-4575.txt` SHA `5830e5bde93a6c50e90608beb1c1f21a1302ec83643c78e3cdf67932493a3454`、`raw-3efd-405d.txt` SHA `66c679fecff63a6b19276b842cb11685a71e919da27bef69211517ac676c731a`及`raw-ece0-ecfc.txt`。4358..436F是12个word表，不当指令。实施补复核在`C:/Users/fczll/AppData/Local/Temp/dragon-arrival-implementation-j3xfnx68/check_evidence.py`、`evidence-check.json`、`producer-windows.txt`：逐行比固定KI字节，4325..4358完整窗；其余producer窗仅证所示读写/表示，不扩大为全部callee返回认证。

**表示前置核对**：448C/263A/6F77读取F+1D、6F7A写L+6为byte；解析/编译命名`legion_morale_cap`对应+1D，本桥不复用会兜底的cap helper。6FE9逐六队byte求和而6FF6写word总兵，二者可不同；Web编成/速算结果的`unit.troops=byte*10`与`legion.troops=原word`分别承载，4470只接受显式0..2550且10整除的队兵，不补队、不取整、不从总兵造队。4CF5 XCHG city+1，命名`city.faction`为实时权威（显式null编码18h），不读可能陈旧的raw。4028/4040是attr高位写者，native到达只读显式`city.attr`；本批不让未认证legacy城轮询替它造高位。外交以600h起24×24原byte矩阵承载（文件章偏移加80h）；364A/365D、367A/368B及42E2证线性live byte域，43D3不套relation的同属/缺值默认。F16/F17/capital显式null编码FF，缺失/非法不编码FF。上述是消费桥及已有命名写者核对，不证明完整城归属/外交生产历史已闭合。

**2662到达与4300**：先比原0E和14，不比坐标或20。相等走266A marker4→28F4→**无条件2671/4325**→RET；4325一次只分派一个handler，新命令不在同动作再次分派或移动。4300输入BX先u16×4，4304读真实city+18；>1 CLC，不读marker/attr。否则430B marker4 CLC，不读attr；否则4311 attr<80 CLC；成功再BX×8，431E写20=BH、STC回266A。成功路径不执行269C/26FA占格DEC/INC，失败才继续既有普通移动。日费读动作后的字段，正常RET才由原泵执行同槽2600/264A及余槽；异常保已执行marker/20/请求/cache/RNG/早槽前缀，不补尾、不重播。

28F4保留DI=`u16(BX*4)`，先L+1与D52:`u16(DI+841h)`比较；同属CLC。异属再算AX=`u8(20)*8`，不等BX仍CLC；相等在2912→291A精确停，此时AL是target*8的低byte，不是目标owner或通常city id。291A及返回后的STC执行仍未覆盖，结构上2671不按CF提前返回。

| 消费地址 | 已覆盖命名域 | 未覆盖域 |
| --- | --- | --- |
| 28FD owner | wrapped地址841h+20h*j，j0..191：live city.faction | 其它D52别名/缺字段 |
| 43D3 DI+18h | 600h..83Fh live diplomacy；858h+20h*j stored cache；**000h..5FFh faction 域（P41）**：偶 k→`faction[k/2].nativeGeneralCount`（F+18 live）、奇 k→F+38 静态 raw 字节（strict hex 切片）；4300 拦截 STC 重入以 DI=u16(idx*0x400)，idx=64 回绕 0→势力0 F18 | F+18/F+38 以外的 faction offset与其它别名 |
| 4304/441B/4455/4462 | 实际city+18的同一cache能力 | 缺能力/未知byte/非city地址 |
| 4549/454C | 实际city记录+8/+A的完整X/Y word | 缺坐标、非city pointer，包括首都FF |

普通到达current0..47的43D3落faction域已由P41接线（偶/奇k分别读F+18 live计数与F+38静态raw）；48..65落外交；66..191落city0..125的cache。截留city3：BX0300、DI0C00，owner地址1441=city96+1，43D3地址0C18=city30+18；city4/5分别owner128/160与cache62/94。city64 DI回绕0，owner0而43D3为0018=势力0的F18 live计数（P41已接：4300拦截STC重入 DI=u16(idx*0x400)，idx=64→0x0000，43D3读0000+18h）。192城成功截留owner命名域仅`i%64<=5`；city6在28FD读处停，保20/marker；city0异属比较相等在2912停。不能按逻辑当前/目标城市代替真实wrapped地址。

**4300-STC重入BX勘误（本轮实机证据）**：上段BX0300/DI0C00/回绕0等系旧Web实现误传变异BX（node×32）给arrive的观测记录，不是静态原语义——静态结构行为“28F4保留DI”、“STC回266A”、“DI继承28F4不重算”及P01的4300→28F4异属截留分支（AL传target*8）共同要求重入arrive用原节点号（DI=node×4真城市）。旧模型下城市0..5读到幻影城0/32/64/96/128/160（静默错分支），城市≥6读到192外野地址（如city14→0x4041/16449）直接冻时钟（第一章5/28实机复现）。现intercept返回原节点号，0x20=BH派生与`targetAddress===bx`协议不变（(node×32>>>8)×8恒等于8对齐node）。上段观测行保留为旧实现行为记录，不再作为原版寻址证据；28F4在STC后是否重算DI的最终静态复核已闭合（现刷`28F4..2918`：`28F4 mov di,bx; 28F6/28F8 shl×2`即DI=BX×4一次性派生，窗内无任何DI重写，唯一STC是2915的flag置位）：DI恒为入口BX派生，不重算，回退到DOS-RAM建模的条件未触发。

**4325/4548**：先算AX=840h+32*u8(20)，不先解引用目标；BX=2*u8(23)，仅BX<10h且非玩家时加8，故NPC0..7→handler4..11，>=8不偏移。表`[4370,4370,4370,4370,439D,43AF,440F,4466,4483,4499,44A9,44D6]`；域外在434F停。DI继承28F4，不被4325初始化。4548先读city Xword/Yword，再以X、Y、0E依次短路比较；node=`u16(pointer-840h)>>2`。无论CF都依次写16→18→14；不写20/status/marker，不由target投影决定相等。16/18命名`targetX/targetY`随普通state保存。

| handler | 分支/写序与返回边界 |
| --- | --- |
| 0..3 | 4370先command0，再4548；仅STC且总兵<600，比较目标编码与**玩家CFD首都**，等才9 |
| 4 | 4548；仅STC读attr bit40，清则command1 |
| 5 | 0E>=800→0；总兵<=300→10；目标bit40→0；否则attr<80或真实DI+18>2→43D9唯一一次canonical RNG，0B=(AL&7)+1再command2；否则总兵<600且目标为本势力首都→9 |
| 6 | bit40或(attr>=80且目标cache<=1)→1；否则财政bit40决定跳过F17与否，XCHG F17为FF，必要时XCHG F16；非FF命令不同则20→OR2，再command0、DEC旧目标cache（同20也DEC）；两者FF且attr<80则command11再DEC，否则不变。**不写14/16/18**；最后DEC未知保之前请求/目标/command写 |
| 7 | 4470顺序六队byte；首个<30→11，不读后队；全>=30→8，不看total |
| 8 | 先读取所属F1D，再比较L6；>=cap→1；不需target城市/cache/DI别名 |
| 9 | 已由[§3.15](#native-formation-callers)推进至严格461D/6FD2、command3及限定AL8表现返回；缺池/字段在实际消费点停 |
| 10 | 本势力capital与20比较；不同先20→OR2；4548 STC→9。capitalFF不早退，保20FF/OR2后在4549非city读处停 |
| 11 | 同capital/目标设置，4548 CLC正常RET；STC在44FE→463E停，保16/18/14，不解散/减F14/归预备/改占格 |

真实slot传现有canonical RNG，`stepTo`没有RNG时仅到43D9才拒绝。0B仍由既有槽泵递减/重装，43D9可以覆写本次重装值。已有14 id桥仅0..191，不能假称可真实到达edge；43AF edge短路另用原语测试验证，未扩大全域14表示。

**city+18能力及JSON生命周期（Web批准表示）**：可选`prepareScenario({cityCache:{version:1,spans:[{address,hex}]}})`，address为0..191城市槽；只存192 bytes与known holes，不是D52/full-city镜像，不从raw、live军团数、F14或占格推初值。私有所有者在既有assembly，`context.cityCache`及`webMeta.cityCache`往返带exact world/content/initialGraph身份；await前克隆所有输入，严格有序不重叠spans。缺能力仅在实际读/写处拒绝，包括3F4C，旧detached可487B/不消费cache的handler/保存。0、FF、unknown分开；DEC 0→FF→FE，refresh82h&7F→02。此时可有两支live军团仍同格，不可用2→1→0替代。邻城不机会性刷新。无metadata/v1拒带cache；不迁移旧档，不启用生产v2。

正式snapshot的native F16/F17 sidecar按own-property保真：缺字段不输出，不用旧`??null`把未知变FF；现有restore仅有key才覆盖。显式null/255/0仍保留；undefined经JSON消失仍未知，其它非法类型在实际XCHG点停。**首审P2修复**：NaN/±Infinity会被JSON变null而误编码FF，native snapshot现在直接拒绝这两字段的非有限数，不能先产生可被有损JSON接受的候选。IndexedDB structuredClone本身能保NaN，不归咎于IndexedDB丢值。仅此native分支改变，v1旧sidecar不变。city `_aiCooldown`/`_strategicLastFaction`由现有state clone/JSON/prepare保存，未加副本，保缺失/0/非法值到实际消费点；`createNewGameScenario`删旧owner，不作为native初始化来源。

**3EFD cache前缀，非完整城市轮询**：复用两个显式输入字段。3F06要求cooldown合法byte，非0先DEC；3F11才要求旧owner合法byte；比较实时owner，不同只在3F29写合法命名旧势力F17=city，不更新city1A。旧owner缺失/非法/别名越域保此前DEC。3F2C先Yword形成u16(Y*24)，3F43 Xword，3F47规范占格读、&7F，3F4C才要求cache写能力。Y>255等far alias不映射进规范plane。中立也必须完成此段。

**现行 App 读档接线更正（3F47）**：`movement capability at 3F47` 是 Web 缺少占格平面适配器的工程异常，不是武将移动能力不足，也不是原版在此拒绝移动。复核上述固定 SHA 的 `KI.EXE`（文件偏移=VA+200h）：`3F2C..3F41` 用城市 Y 形成 `ES=CS:[9872]+Y*24`，`3F43` 取城市 X，`3F47:26 8A 07` 读 `ES:[BX]`，`3F4A:24 7F` 保低7位，`3F4C:88 84 58 08` 写城市+18；此窗口无 RNG/调用。规范坐标下对应占格平面 `Y*384+X`，初始化原证见§3.15/P40。

Web 根因已确定为 `snapshotScenarioAssembly → readSavedAssembly/admitSavedScenario` 保留了 `movementMemory/terrainMemory/cityCache`，但 `main.loadSave → main.loadState → prepareScenario` 两个参数边界仅传 `roadMemory`。于是 restore 所有者的 movement/cache 为 null；terrain 则会误走既有缺输入路径而丢弃显式保存的改写。现三项完整转交原适配器，沿原有 await 前克隆、身份/known spans 校验，不新增补零或扫描重建，不放宽3F47/3F4C、未知洞及非法输入保护。fresh 路径和规则/RNG/调度未改。`verify_legion_lifecycle_browser.mjs` 在隔离存档写入非默认占格、cache、terrain 哨兵，经真实保存→标题→加载确认三项原值保留；这验证 Web 传递合同，不冒充原版战役 oracle。此前本节“可选能力/App拒v2”为历史 detached 范围，不是现行生产入口描述。

**历史边界已推进**：本节初批在3F57/3F5A停止；现[§3.14](#native-city-callers)已接有限军事真返回、严格治理/灾害与城市/军团游标提交，不再把全部3F74/4194称未覆盖。legacy cityLocalStrength/raw邻接仍不供native使用，city1A的4CF8/425B完整生命周期和App v2拒绝门未变。

**首审P1后的实际日结/尾边界**：新增到达正常RET使2600可达，不能继续走会将缺L04补0、缺F1D补200的legacy helpers。复核固定KI的2600..2661与562B..5662，`ai.js`仅在绑定native路径使用严格消费者，v1原容错、经济helper和槽泵顺序不变：

1. 槽泵只在本次原日结门打开才执行；2609先要求L04为显式word，260C才要求0Eword，不从_march/Number转换猜node/edge。edge费用`(troops>>1)+(troops>>2)`，node费用`(troops>>5)+1`；261D/262B才读L01byte，仅命名势力0..23域可桥接。不提前检查cap、morale或整个动作输入。
2. 562B的DX高byte形成势力记录，563D/5640的word SUB/byte SBB构成**24bit回绕减法**；5649..5657只下限钳`-655000`，没有上限钳。Web资金值要求显式signed24整数；依已存在的`commands.initPlayer`/`economy.applyFactionFundsDelta`命名约定，有own gold即为权威，否则读取显式money；非法/缺失gold不回退money/0。两字段同单位无倍乘、写回仍同步。不调用双侧钳制/默认补零helper。完整signed24极小值扣费可先回绕成正数，不添额外上限。原byte子字段与Web完整数值不是两份权威，未另造资金RAM/部分known表示。
3. edge在2623立即RET，不读F1D/L06。node扣费后2631再次读L01并定位势力，263A要求cap byte，263D才要求morale byte；先将morale+10按byte回绕写回，2641再读比较，>=cap才2646写cap。缺cap/morale保已完成command/目标/扣费；夹具注入第二次士气写失败时，第一次ADD值亦保留。失败由原泵hold/禁存，当前03/21、后槽/天气不补跑。
4. 原264A须严格读status byte；bit5清时264F先写固定03=0、2653再写**独立`contactAnimationByte21=0`**。这是批准的L21普通命名byte，不是08/03/22，也不从raw/绘制投影抄初值；写零不需要知道旧值。若2653写失败，03已清且余槽停止。bit5置只DEC03，减成0再单独写1，21原值/缺席不读不改。该字段由现有state clone/JSON/prepare与军团重建保留，无第二sidecar；本次不接尚未闭合的2B45消费者或其它L21写者，不认证完整动画生命周期。先前本批“正常尾完整”但漏2653的描述在此明确更正。

此修复的固定字节与红绿记录在`C:/Users/fczll/AppData/Local/Temp/dragon-arrival-review-fix-c40vt7bb/`，完整2600/562B静态窗为`daily-raw.txt`；字节/原顺序是规则证据，测试只是回归。首审BLOCK与首版全173结果均保留，不把修前绿测拼作修后通过。

**测试与剩余边界**：`verify_native_road_arrival.mjs`使用正式prepared detached Scenario、真实slot/stepTo与纯内存JSON，覆盖lazy gates、一次dispatch、不同BX/DI别名、同槽/早槽前缀、两次DEC/refresh、cache/图RAM隔离、city异常hold、原phase/F14保持。少量自定义IO原语只补真实bridge未覆盖边界，不是CPU oracle。旧movement到达“28F4全拒绝”测试最初改停handler9/461D；现[§3.15](#native-formation-callers)推进到实际缺池4735，保原等待/失败覆盖。固定KI字节核查、初红修正、私有变异及当前SHA证据只记journal/实施产物；完整安全清单与独立review另跑。461D限定三池域已由§3.15推进；291A/463E及消息、2BA8、4A7B/4ADE、D52非命名别名、完整cityAI/全campaign仍未认证。

<a id="native-city-callers"></a>

### 3.14 P24：detached城市军事→治理→灾害真返回与有限天气尾

**范围与原证**：本节为城市切片唯一详细维护源；静态KI指令为实锤，命名字段/Uncovered为批准Web工程表示，测试不是独立CPU证书。固定KI SHA同§3.13，VA+200h。本轮原窗在`C:/Users/fczll/AppData/Local/Temp/dragon-city-contract-readonly-6qdnvees/`，`raw-3efd-42ab.txt`、`raw-4575-474a.txt`、`raw-1d0b-1df8.txt`及`raw-2459-24c0.txt`可逐条用原byte重核。编成依赖另有`raw-6e8f-703c.txt`，不能把其局部窗当完整新编接线。本批不启用App v2、不改v1算法/默认道路资产、不增加双内核或旧档迁移；当前无旧档保全约束按项目AGENTS政策，不授权触碰真实SAVE。

**唯一城市阶段所有者**：`aiTick → tickStrategicCity`先§3.13 cache前缀，再`runOriginalCityMilitary`。真返回后`finishStrategicCityUpdate`独占`governOriginalCity(4194) → damageOriginalCity(4269)`，不再调用legacy治理。3F6F才写`_cityTickCursor=(idx+1)%192`。随后既有16槽action→2600→264A（03再21）→余槽；25FF才写`_legionBatchCursor`，然后2459，正常返回才可1D8E。main仅native取消旧无条件预推进；v1不变。native `aiTick`区分returned/pending/failed；全城市阶段异常进入同Scenario/Clock failure hold并禁存，直接military入口仍抛Uncovered。城成功军失败保已提交城市游标；天气失败也保军团游标。不补finally尾、不回滚、不重复前缀/RNG。本批日期控制限CF2<8，未认证月界/完整外交消息返回。

**命名与保存**：C14=`strategicThreat`，C1B=`strategicBorderCount`，C1C..1F=`strategicNeighbours`（固定四byte原顺序），C18仍只有cityCache能力。C15沿`disaster_event`，不增加镜像。F19沿`target_faction`，F16/F17沿既有具名字段。上述own state克隆保存；不在native消费时从raw/owner/道路/军团数补值。邻接FF终止而洞/null/NaN不是FF；snapshot拒绝新字节非法值/邻接洞，restore克隆后验证。缺整个可选字段仍未知，短路未读不提前阻断。cityCache/占格/图RAM仍以exact世界/内容/initialGraph身份隔离。88CC边界维护、完整初始化与捕获callee未接，4ADE门不放行，不能每tick重算边界掩盖缺写者。

**3FA9/4028顺序**：先CH=0，C1B=0立即RET，不读F19或邻接。否则读当前owner/F19，逐C1C..1F遇FF即停；同属跳过，中立不读外交，不加威胁；非中立关系raw>=80跳过，其余在当前工作项写FE并CH=byte(CH+邻C18)。若邻owner==F19（包括18中立），在同位置写`[邻城,owner,u8(cache+1),FF]`并前移4B；FE可被下一候选覆盖，不能重排集合。扫描中缺字段保cache等前缀但不提前提交C14；真RET才3F92写C14。4028先attr&3F；首FF清冷却并返回，FE置80，有效候选置C0。C18<1先请求再40B3写F16，早于候选RNG门；>=1才进4057。

**4057/40C9/4155**：首>=FE直接RET；否则一次canonical RNG取低2位，按原byte DEC计数，低0数第256项，不是r%n。1..3项在哨兵处回工作表头；四项时低1..3可正常命中，低0在4064首次读取`SS:[BP+10h]`停止，保已耗RNG/C14/attr/cache，不伪造第五哨兵或mod4。外栈为oldBP/oldDI/oldDX/oldCX/oldBX/oldAX/oldES/returnIP，真实调用现场未闭合。

命中后C18<=1：读取`u8(C14+2)-C18`，借位/零直接RET；正数但玩家所属也直接RET（已消费选择RNG）。其它调用40C9：冷却非零真RET；玩家径40D7已按[消息ABI§17](re-notes-strategic-message-abi.md#17-p3288105e80传递树写集审计与规则闭包)闭合：CDE/8810消息为纯显示+输入等待，Web模态关闭后经completePlayerReinforcementRequest延后执行40F6 1字节RNG→414F冷却=0x18+(AL&0xF)（不经NPC径30夹顶）→40B3 recordRequest。AI进4575：signed16资金高word<=160额度5，否则额度=highByte(u16(highWord<<3))；减具名F14借位/零才真CF1。不足额或固定0..126将逐读owner、匹配后status0、再全byte武力，最大仍0才真失败返回；没有active门、缺将不是无候选。初批有候选在45EC→6E8F停；该历史边界已由[§3.15](#native-formation-callers)成功编成/partial资格失败和原冷却接线替代。真失败/冷却RET之后40B3仍写当前owner的F16。

C18>1：4155以DL=1、DH=C18−1从2240逐40h扫描，先L0E再status>=80，不看势力。仅连续known槽可执行，缺对象/0E在4160停，不能跳洞或把inactive当0E=0。匹配且DH非0先RNG，<40则DH--跳下一槽；否则才检查委任bit2/命令<8，通过仅写L20→L23=0。非跳过槽不论资格都耗DL并返回，不写14/bit1/0B/坐标/占格/C18；只有RET后40AD清冷却。固定槽残值/创建现见[§3.15](#native-formation-callers)，不等于解散callee获准正常返回。

**4194逐读/字宽（实锤）**：AI/中立CL8、DL4，不读内政官。玩家CL5、DL1；C19非FF才读G1A，预算非0先--，然后CL=u8(5+politics)，DL=u8(1+force)>>1。预算1→0本次仍加成；缺能力保先扣预算。CH=CL>15?CL−15:1。无条件R1，(R1&15)<=CL才读growth，写min(200,u8(growth+CH))；无条件R2，命中才读defence、CH=(CH>>1)+1，写min(200,u8(defence+CH))。420B同时取得cap/兵；兵>=cap直接回写cap（超cap也缩减），不耗R3。未满才R3，>=18h真RET不写兵/growth；低于18h先growth饱和减DL，再兵byte加DL有carry置FF，最后mincap。政治251令CL0，武力255令DL0；高CL下增长先byte回绕，不能数学min后截断。RNG和字段逐次立即提交，不等整段成功才更新。

**4269持续灾害（实锤，0 RNG）**：先读C15再防灾，足够只写防灾差并RET；不足先防灾0，d=C15−旧防灾，再growth饱和减d。随后读prod高byte乘d，16位积>>2，以4297 word SUB写prod，不添加下限钳制；最后兵饱和减(d>>1)。不清C15，不写cap/max_prod/owner。生产力正常byte域虽不下溢，也不能把指令合同改成泛饱和助手。上游23CF/34BD/34F2沿既有灾害写者，本批不重写天气事件生产。

**2459天气尾（边界已推进）**：32固定16B槽顺序、status/timer/interval/dirty逐写规则不变；旧“后16到247C→248A停止、0 RNG”边界已由[§3.14.1](#native-weather-movement)的真实248A/24FF移动与每朵到期云2 RNG接线取代。前16定点对象仍不调用248A、0 RNG且不改frame；缺记录/字段仍在实际读取处停止。完整月度边界写者与日期/月界仍未因此闭合。

**验证边界**：`verify_native_city.mjs`以synthetic明确输入/正式prepare、真实city→16槽→weather→Clock sub<8及JSON冷恢复为控制；1..3候选全低2位、四候选越栈、额度/127将、逐读失败、预算回绕、灾害写序、32槽与游标提交均为可失败断言。脚本字节RNG只用于片段控制，实际tick/恢复用OriginalBattleRng；不把同一JS实现当独立CPU oracle。neutral成功控制显式0B=2→1，不是异属驻军到达291A的正常连续轨迹。初批编成/补员竞争停在6E8F门前；[§3.15](#native-formation-callers)已接限定三池成功/真实失败及竞争后继，仍非资金兵池所有消费者全闭合。完整回归/浏览器/LSP状态与私有mutant证据仅记批次journal，未闭合消息、外栈、捕获及月度天气写者/月界域仍是后续前置；固定槽残值限定所有权见§3.15。

<a id="native-weather-movement"></a>

### 3.14.1 P24：2459→248A/24FF原生雨云移动

**原证与范围**：固定KI SHA `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA+200h。证据根 `C:/Users/fczll/.pi/agent/sessions/--E--Dragon--/weather-movement-01a0a5cb/` 的source-only `raw.py`固定读取`2459..2533 / 22DB..23FF / 1D0B..1DF8 / ECE0..ECFE`，绑定Capstone源码/DLL/Python/KI输入hash、限制读写根且禁网络/子进程；这不是DOS运行。`oracle/`从真实MZ字节执行`248A→24FF→ECE0`直至真实RET，显式装入云记录、D22..D28、RNG表/addend/index，512组覆盖极端signed byte/word、限速、残差跨格、吸引边界与物理环绕；只实现这些窗口实际使用的FLAGS/指令，不认证中断、其它代码或完整DOS环境。`compare.mjs`将生产leaf逐组差分为512/512一致；仓库测试冻结其中15组，不以JS镜像替代原CPU证书。

**248A/24FF实锤**：每朵到期雨云按X后Y固定各调用一次ECE0，故恰好消费2个canonical RNG byte。每轴先取`jitter=R&7`；0..2令signed byte速度加`jitter-1`，随后封在−15..15。signed byte残差加速度后，`>=15`减15并让对应signed word坐标+1，`<=−15`加15并让坐标−1；其余坐标不动。每个轴的残差/速度与坐标在进入下一轴前立即写回，第二次RNG失败不能回滚X轴。

两轴写回后，分别用当前D22/D26与D24/D28做signed word吸引判断：小于min令pull=+1，大于max令pull=−1，同一坐标不会同时触发两者。之后物理X `<−16→400`、`>400→−16`，物理Y `<−16→272`、`>272→−16`；物理环绕界与吸引矩形不是同一概念。最后pull以byte加到已封过的速度，故可暂时得到±16。所有byte/word加法按原宽回绕，不用无限整数。

**Web接线与失败合同**：`tickOriginalStrategicWeather(sc,rng)`保持2459固定32槽与逐写顺序；后16槽timer到0后先reload、status OR1，再调用共享严格`moveOriginalWeatherCloud`。D22..D28只接受当前`_disasterBounds`，无缩窄区域时接受SINARIO显式`weatherCloudBounds`默认值；不退回全局常量。字段/RNG/边界在真实首次读取点验证，已完成DEC、reload、dirty、X轴或两轴写回均保留；上层沿既有战略失败hold/禁存，不finally补日期、不回滚、不重播RNG。`runLegionSlotBatch`在25FF提交军团游标后才取当时的`app.originalRng ?? app.activeBattleRng`传入，成功2489 RET后才允许日期尾。v1仍走旧`tickStrategicWeather`，正常App仍拒v2。

**后续边界**：22DB/2286月度生产与AL=0清区已由[§3.14.2](#native-weather-monthly-producer)闭合；237E非零强度的TALK70返回、23FF/2438对象消费及1D8E日期/月/年仍未闭合。没有启用生产v2、旧存档迁移或完整天气初始化。

<a id="native-weather-monthly-producer"></a>

### 3.14.2 P24：22DB/2286月度天气事件生产

**原证与范围**：固定KI SHA及VA+200h不变。证据根`C:/Users/fczll/.pi/agent/sessions/--E--Dragon--/weather-monthly-01a0a5cb/`的source-only `raw.py`固定抽取`21F0..2459 / 2F80..3060 / 3440..34F0 / 5320..53C0 / 5700..5880`，并把对22DB/237E/23FF/2438/2FBF的near-call字节候选另列线索；caller窗实锤月结`539D→22DB`后紧接`53A0→2286`。脚本绑定Capstone源码/DLL、Python、KI与自身，审计禁网络/子进程并限制读写根；首次launcher写错不存在的Python路径，在子进程启动前WinError2，单独留失败收据后以观察到的`C:/Python313/python.exe`成功重跑，不把失败计为证据。

`oracle/`从真实MZ字节连续执行22DB的237E/2FBF/ECE0至RET，再在同一RAM/RNG/事件页执行2286的2FBF/ECE0至RET；显式装入D20、D22..D28、D52/D56、192条20h城市记录、首个100h事件页及ECE0表/addend/index。16例覆盖全图/缩窄清区、minX单字段门、三条雨区随机门、事件碰撞/满页、D20 word回绕、火灾/暴动两门、阈值等于/低于及raw城市pointer；解释器只实现这些窗实际指令/FLAGS，不认证完整x86/DOS。当前生产适配与16/16逐字段、事件页、RNG index/call差分一致。

**22DB与237E AL=0**：入口只比较D22/minX原word是否FFF0；相等即使其它三界不同也不复位。非FFF0时先以AL=0调用237E：用word SUB、逻辑SHR算D22/D26及D24/D28中心，固定192城取word X/Y，Chebyshev距离大于20完全不写；范围内把C15写0。随后才依序写D22=−16、D24=−16、D26=400、D28=400。故清除不是全城归零，且任一城市/边界失败保已完成城市写与逐界前缀。AL=0不会进入TALK70。

复位后固定先耗1 RNG；低位偶数返回。奇数再取selector，`>=192`返回；否则直接以selector定位城市。城市X低byte小于192时额外耗1 RNG且偶数返回，X低byte大于等于192不耗该门。通过后再耗1 RNG得`BL=((R&7)+8)<<2`即32..60，调用2FBF排type11。2FBF先把BL乘4字节再加D20 word并允许16位回绕，只扫描`<0100h`当前页；逐4B探type0，先写type/arg0 word再写arg1/arg2 word，满页/起点越界CF1。只有真实插入CF0才读取所选城word X/Y：signed `<10`保原值，否则减5；各max=min+10按word回绕，依原顺序缩窄D22/D26、D24/D28。Web事件槽保持raw `{type,arg0,arg1,arg2}`唯一权威，不另造影子队列。

**2286固定城市生产**：紧接22DB固定扫描192城。每城先耗1 RNG；`<24`才耗第二个`&63`并与C11/defence比较，**大于等于**即以AX=010C、DX=`0840h+index*20h`、BL=FF调2FBF；不论插入成功与否都跳过该城第二门。首门未命中/阈值不足才耗第二门RNG；其`<24`才再耗`&63`，大于等于C10/growth时以AX=020C同法排队。BL=FF使2FBF内部再耗1 RNG并以`R&7C`选择0..31槽偏移。所有读取惰性、队列first-word/second-word写与RNG前缀均不回滚。

**接线与边界**：native scenario的`enqueueMonthlyDisasterEvents`现转入严格`originalweather.js→scenarioweather.js`，要求显式192城、当前边界、D20槽游标与实际探测到的事件槽；不补洞、不padding、不把city pointer提升为推断字段。v1旧生产器保持不变，默认源/App拒v2不变。仓库测试冻结7组规则/失败前缀并由真实native assembly调用证明不再误入legacy event wheel；完整回归记journal。type11消费者与消息接续见[§3.14.3](#native-weather-event-consumer)；type12消费者34B1、23FF/2438对象生命周期及日期月年仍是后续。

<a id="native-weather-event-consumer"></a>

### 3.14.3 P24：31AE事件泵与type11暴雨消息接续

固定KI原窗`31AE..3210 / 3440..3560 / 237E..2459 / ECE0`实锤：3E11先CALL31AE；31AE先byte DEC静态分频，结果非0即RET。结果0但D20>=0100h时不reload；否则先写10，再从D56读完整两个word、D20立即+4，type0返回，非零按`type-1`间接表调用。type11表项34A6只耗1 RNG，强度`(R&0F)+24`后进入237E。事件槽读取、分频和游标前缀均早于handler，未知type不能回滚或改走legacy。

证据根`weather-event-consumer-01a0a5cb`的source-only原窗绑定固定KI；oracle从真实MZ执行31AE，type11继续34A6→ECE0→237E，NPC路径到真RET，玩家路径停在真实CE7 CALL（CE7/8810等待ABI沿战略消息既有证据和Web批准的3秒/右键产品策略，不伪造完整字体显示返回）。12例覆盖分频0/1/2、页尾、空槽、type9/12真实handler边界、两种强度、NPC全扫描及玩家首/中/末消息前缀；当前JS叶12/12逐字段/RNG/192城差分一致。

237E每个玩家受灾城先提交C15，再PUSH原AL强度与城市pointer、CE7后TALK70；消息返回后才扫下一城。因此native Web以显式continuation逐条排TALK70，上一条关闭前不写后续城市；最后真实叶返回后才释放`_strategicEventPostMessageRngPending`并执行已延迟的3E11势力尾。type12消费已由[§3.14.4](#native-weather-object-consumer)闭合；其它native type在已提交分频/游标后hold/禁存首停。v1事件泵不变，默认/App v2门不变。尚未闭合1D8E日期月年。

<a id="native-weather-object-consumer"></a>

### 3.14.4 P24：type12火灾/暴动对象生命周期

原证为固定KI的34B1..3507、23FF..2459、301C..304E及31AE真实表项。34B1总是先以DX raw城市指针读word X/Y。AH=0时先写城市C15=0，再由2438固定扫16个10h对象槽：仅status>=80才读X，X相等才读Y，坐标全等就只清status，且清除所有匹配。AH非0先调用23FF；它找首个status<80槽并依序写status80、subtype(+E)、interval16、X/Y、+6/+7/+C/+F各1。16槽全满CF1立即返回，不读owner、不消息、不耗RNG。

生成成功后只有玩家城先CE7并TALK`70+subtype`；真返回/NPC直接续段各耗1 RNG：城市C15=`(R&7)+4`，随后BL=`(R&7)+6`，AX=000C、DX保持raw城市指针调用301C排移除事件。301C以D20 word+BL*4回绕，首探在0400h检查之前，碰撞后逐4B扫到0400h；满页与成功都无可用CF成功标志，first/second word逐写。Web保持raw type12 arg1/arg2为城市指针，现仅在此已证handler中按`0840h+index*20h`解码。

证据根`weather-object-01a0a5cb`的实际MZ oracle执行31AE→34B1及23FF/2438/301C/ECE0：10例覆盖移除多对象、NPC/玩家1/2型、对象满16槽、低槽选择、延迟碰撞和事件满页；首轮oracle测试脚本的局部变量`raw`覆盖绑定KI全局，第二CPU构造前即IndexError，保失败收据后仅重命名测试变量并全量重跑。最终生产叶10/10对象256B、事件1024B、城市/RNG一致。

native type12现以TALK71/72 continuation接回后缀，消息关闭前不写城市强度、不耗两byte RNG、不排移除；最后才执行延迟3E11势力尾。对象用固定16槽、不压缩；status清除保槽记录，绘制别名group/kind均派生自同一+E byte。legacy路径不变，默认/App v2门不变。1D8E日期层见[§3.14.5](#native-calendar-progression)；对象帧绘制是表现，不反推新的规则写。

<a id="native-calendar-progression"></a>

### 3.14.5 P24：1D8E日期、月年与5358边界

固定KI 1D8E..1E17及98AC十二月天数表实锤：CF2为0..8共9次主更新；小于8只INC并返回。CF2到8时清0；旧CF3小于23直接INC，旧值23则先处理日期：当前日小于当月日数只INC日；月末把day低byte置0，12月末若year>=1000先写998，再word INC，随后month从0增到1；其它月直接INC。新月份天数先写CF1，之后CALL5358；只有真实返回才在1DD7把day从0增到1。1DDB先清hour，1DE0仍INC，故换日后的首个时刻是1而非0。最后才显示日期并调用3E11/1E17。

证据根`calendar-01a0a5cb`以source-only脚本绑定固定KI/Capstone/Python并另存98AC原表；有限CPU执行1D8E真实字节，月界停5358前记录字段，再以明确真实返回边界从1DD7续到9377前。28例覆盖CF2全值、hour22/23、十二个月末及year 998/999/1000/1001/FFFF；当前Clock逐字段和5358入参边界28/28一致。该证书不替代5358内部各月结子系统自身证据。

Clock保持Web hold续跑产品合同，但pending日推进完成后现在也执行原1DE0的hour=1和onHour尾，不重跑战略槽。月结回调同步看到新year/month、day=0；返回后day=1。Web独立onYearEnd不是原CALL，安排在month=1/day=0且不作为原机制结论。默认/App v2门与v1共用日期字段不变。

<a id="native-unification-gate"></a>

### 3.14.6 P36：1D0B统一胜利门与D2A存活势力计数

本节是此切片唯一详细维护源。全部实锤来自固定 KI SHA `fffeba98…`（VA+200h）capstone 现刷与原数据亲核；专项 `tools/verify_native_victory_gate.mjs` 8/8（字节 pin + 门行为夹具）。

**入口门**：1D0B 主更新首指令 `cmp byte cs:[0x0D2A],1; je 1D20`（字节编码 `2e 80 3e 2a 0d 01 74 0d`）。D2A=存活势力数（含玩家）。

**计数不变式（实锤）**：初值=8CAE 从章节/存档记录（stride 0x56C0）+0 读 0x3B 字节到 CS:0xCF0..0x0D2A（`8ccb bef00c bf3b00 e8bd56` 窗），record[0x3A]=D2A 初值；官方原版 SINARIO.DAT 四章=0x16/0x0B/0x06/0x04（22/11/6/4=各章活跃势力数，亲核）。同 8CAE 另读 +0x80→0x5240 字节到 D52:0（状态块）、+0x5240→0x400 字节到 D56:0（事件页）。唯一写者=4FCE 灭亡处理内 4FE8 `dec byte cs:[0xd2a]`（同体先 4FD9 清该势力 F00 attr）；玩家被灭走 4FDC cmp bx,CFD→al=1 call 1CB1 **不经过 dec**。故 D2A==1 ⟺ 仅剩玩家=统一；Web 以 22 槽 attr&0x80 活计数实现等价判定（不存 D2A 字节；写者侧 4FCE 留 C12）。

**胜利分支 1D20..1D4B**（全窗实锤）：CDE beep→8810(CX=0x4B=TALK75,AL=0x93)→DS=D52→87FF 玩家君主→8810(CX=0x197=选择器→TALK[414+talk_idx] 君主个性行)→AL=2→1CB1。1CB1=SS/SP←cs:[9903]/[9901] 换栈长跳回主循环（主循环 1BE0 起保存于 1BEC/1BF1；1CD0 速度门尾跳进 1D0B，1D0B 无 near-caller）。AL=1=败北（exit1→YNVSHELL 派 D7OVER=gameover.png，Web 既有 checkTrustGameOver 合同）、AL=2=统一（exit2→D7END）。D7END.EXE 亲核：MZ 头、入口 0000、硬编码 END_S1..12 文件名表循环播放（0754.. 起 12 项）；END_S13-15 无任何 EXE 加载。

**Web 接线**：`web/src/game/navigation/originalvictorygate.js`（countNativeAliveFactions strict 活计数、resolveNativeVictoryMonarch 87FF 链）+ ai.js `dispatchNativeUnificationGate`（native 场景 tick 顶部门：活计数==1→warnSfx+TALK75+君主行，onClose→endView.show({sequence: END_S1..12})；缺 gamebar/endView infra→RangeError fail-closed 先于置 flag；once-only 由 nativeUnificationShown 保证）。endview.js 新增 sequence 循环淡切。v1 路径与默认/App v2 门不变。nativeStrategicStaticsRaw 未挂载（无当前消费者）。

**同轮附带（信赖初值，闭合为未知）**：cs:[D00] 写者穷尽={8CAE 块载入 record[0x10]=0xFF、8B33 新局径 DS:D52[CFD+0x2B] 拷贝（8B12 新局开窗 0x0D9A=SINARIO.DAT 后）、3DC9 扣减夹0、3D91 加算夹FF}；无 imm-100 写者、无 [reg+0x2B] imm/reg 写者（含段前缀变体全扫）；20 章势力记录 +0x2B 全 0。「新局信赖 100」写者未定位=未知（疑在君主选择流动态寻址）；Web 现状 trust=255 与块载入初值一致，无偏差。

<a id="native-formation-callers"></a>

### 3.15 P24：成功编成、兵池重分与原生固定槽所有权

> 接续状态更正：本节早期291A/463E/25E5全停描述由[去向§7](re-notes-legion-fate.md#7-有限-scenario-接线p24-fate-integration-1)的显式字段、无消息返回与失败前缀合同取代；其它未覆盖域不因此放行。

**范围与证据**：本节是此切片唯一详细维护源。实锤来自固定 KI SHA `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`、VA+200h的 `4575..45F7 / 461D..4749 / 6E8F..703B / 40B3..4193 / 4499..44A8 / 474A..47BA`。前述城市原窗目录含前三组及55EC；新增完整显示/返回窗口在 `C:/Users/fczll/AppData/Local/Temp/dragon-native-formation-contract-8tz2sumb/` 的 `raw-5e80-5eb7.txt / raw-5f7f-5faa.txt / raw-062f-06ff.txt / raw-0cac-0cde.txt / raw-2662-2697.txt / raw-4325-4358.txt / raw-474a-47bb.txt`，`raw-6c4c-6c5e.txt`是数据而非指令。静态逐byte复核不是执行CPU。新局零表原证为五个明确SINARIO文件、每章 `22C0h..42BFh` 完整8192B全零，结合8CD5/8CDB的完整载入合同；不证明整个启动/外交/占格初始化。该证据只授权明确的新章初始化API，不授权运行缺槽补零。

**接线**：`aiTick→tickStrategicCity→runOriginalCityMilitary` 中的 `40C9→4575→45C1→6E8F→6F26/6F86→461D→6FD2` 已接正常成功及真实资格失败。40C9返回后仍依次40B3、4194、4269、城市游标、真实16槽、天气尾；没有新泵、bornThisTick跳过或额外RNG。`4325 handler9`共享461D/6FD2；native474A也共享严格6FD2，且在legacy ensureUnits之前分支。v1算法/默认源与运行图不变，正常App仍拒v2。本节不放行291A/463E/消息、2BA8、4A7B/4ADE、一般D52/栈别名、248A/月界或整个战役。

#### 3.15.1 数量与真实caller返回

4575只在入口读signed16资金高word和F14；额度沿§3.14，减F14借位/零才CF1，CL只压至余量。每次45C1从0扫126，依次owner、匹配后status0、再武力byte；严格大于才替换，武力0全失败，同值低slot先，没有active/首都owner门。6E8F成功后先计数，再L20请求城、L23=0、CL减一；后一次CF1不回滚，至少一次成功最终仍CF0。工具CL0不是新增“请求零”门。

空城请求AL1；单军分支传 `u8(C14+2)-C18` 的真实正量，不能永远传1。成功后411C重新读取首都，4127请求X、412B首都X、4133请求Y、4137仍**首都X**；各差按word SUB/借位NEG，和word回绕，右移3后封30才写C17。首都FF或坐标晚缺在其实际city读取停，保全部创建/兵池前缀，F16/治理尚未发生。真CF1不写冷却但正常40B3写F16。编成/冷却0 RNG；405D候选选择与4194保持原消费顺序。

#### 3.15.2 原位复用与逐写资格

6EA0首先写同general号固定slot的L02。随后读取G1C，6ED7顺序复制三池到局部栈；不扣真实兵池。六队各按 `01 03 02 / 01 03 02 / 03 01 02 / 03 01 02 / 02 03 01 / 02 03 01` 找首个临时池>=50者，先临时SUB50再写本队type。第n队失败真CF1，L02/前n队type保留，旧troops和真实池不变。不得先整体确认成功或把失败回滚。

6F26依序L02、G17=1、重新读G1C写L01、首都写L20、读旧status；只有旧status<80才byte INC F14，然后status=C0、L08=4。不是找空slot，旧active同号也原位复用，不增F14、不注销旧占格。6F86先读城市完整X/Y，再写0E、14、X、targetX、Y、targetY、pointer offset、row，最后新格整byte INC（FF→0）；pointer row只用Y低byte，规范plane之外按既有桥在消费处停。不DEC旧格、不更新cityCache、不清03/0A/0C/21或旧队兵。随后F1D→L06、L23=1。6E8F最后461D、6FD2完整返回才status OR4与CLC。

#### 3.15.3 461D、4717、4698与6FD2

461D读L01形成兵池地址，先4717再4698，自身不重算总兵。4717逐队先type；type4连troops都不读写，其余先XCHG旧兵byte与0，再读当前type的池，55EC对旧兵+池有carry或>FFDC封FFDC，然后写池。第n队池未知时该队已清兵，前队归兵保留。type0/越三池地址在4735停，不改默认兵种；后续计数外栈别名也不冒充三池。

4698先按当前六队type计数，type4跳过。分配各队时读实时池，DIV剩余该type队数，先DEC计数，再商+余数，严格>100才截100并增加CH，真实池SUB在本队troops写之前。最后CMP CH,6的CF不是编成成败，461D/4499不消费。静态反例：初三池各100、旧兵 `[10,20,30,40,50,60]`（十人单位）且旧type全3；新type `[1,1,3,3,2,2]`，归池 `[130,210,170]`，重分 `[65,65,85,85,100,100]`，余池 `[0,10,0]`，总500。丢弃旧兵得到300是错误规则。初池各100、旧兵0时六队各50，总300同样成功，不加600门。

6FD2逐队先type再troops（type4也计兵），读完才写L04，随后L1E。6FFB比较post-loop BX即slot地址+40h，不是total；合法固定槽全type1周期2，否则3。再7006读L01、700F读F3E、701A写 `markerBase=u8(march_marker_style*5)`，701D才0B1。晚缺F3E保总兵/1E及旧markerBase/0B，不清03。native474A随后4751先士气，非零才4757首队兵；缺字段不是零或真实CF失败。攻城双方结果先提交、攻474A再守474A的§3.11 P1顺序不变；晚异常不提前第二474A/去向。

handler9在4499重分、449C重算、449F command3，44A5固定AL8显示返回后才回槽泵日结/03尾；不当场再分派state3。**父批准Web表现投影**仅替代5E80/AL8储备面板刷新，由已有slot泵的只读HUD/view刷新承接；不创建98A6默认值、不泛化其它mask或消息等待。静态98A6 bit1清直接RET；置位时AL8只进5F7F，读玩家三池×10经062F画三行，0CAC为VGA端口，后续只图面/字形/栈写，无规则RAM写/RNG/等待。显示门开有AL8→0、DF=0等寄存器副作用，父已核上层4354/2674不消费这些FLAGS且2600先CMP。此工程投影不声称模拟寄存器/显存/设备失败，也不能吞规则异常或补缺池。

#### 3.15.4 单一权威表、视图与保存

`nativeLegionSlots:{version:1,records:[{slot,...namedFields}]}` 是可选、native-only的固定128物理槽能力；records有序唯一、可稀疏，缺slot/缺key恒未知，不是空军团或隐式零RAM。它随同Scenario的v2 world/content身份安装，只持久一次；v1拒带表。独立 `initializeNativeLegionSlotsFromZeroChapter` 只按上述零章合同显式生成已覆盖命名字段0/六队type0与兵0，仍无活动军团，不在prepare/restore看空数组就初始化。

`sc.legions`与`delayedLegionReturns`仅为同一记录对象的status视图；C0半成品立即可见，工程失败保表/G17/F14/占格与已归兵，沿既有hold/禁存，不隐藏或补全。03仍只有128项 `legionSlotCounters`，getter绑槽、不从record/sidecar反盖。buildArmies有表时只重绑视图/显示身份，绕过morale、单位、slotclaim、delegated、零坐标回首都等legacy规范化。退场/捕获移除视图不删除表；当前batch/BP仍指同对象，本接缝不授权未闭合去向callee正常返回。

4155由表依槽读0E再status；25B6每访问读当时记录，缺槽/缺status停，不filter未知为empty；2831保127槽与status→Y→X原优先序。已有2A7E完整native返回未获放行，inactive bit3在25E5 CALL前停，不先走legacy。新编槽落当前16槽就立即参与轮询：0B1到期先reload再2662，出生0E=14首都，先到达/handler4改变14而不在同动作离城；后续到期才47BB/点提交。当前批之前/之外槽保0B1/旧03直到真访问。

snapshot候选不改live；只存表一次，不另存live/delayed规则副本或legionRuleState的03镜像，恢复先clone合并其它sidecar，再校验/重绑表视图，冲突legacy列表不能覆写表。六队各字段独立可知，空key可保未知；拒own undefined/null非法byte/word、NaN/Infinity、队数组洞、重复/越界slot。保0/FF、markerBase、0A/0C、独立14/20、旧队兵、F14/池、RNG、游标及known占格/cache/图RAM。真实资格CF1正常完成可保存partial并冷恢复重试；工程异常仍禁存。native返回后原始记录缺字段只在实际消费点停，保存校验不是预先改变规则执行序。

#### 3.15.5 5030直接捕获入口的权威槽消费修复（历史认证已收紧）

> **以下两段的旧native5030可返回/可保存实现描述已撤销**：后续[F23审计](re-notes-legion-fate.md#104-必要撤销native4cf3不再经过legacy占城f23重算)进一步将真实native胜攻停点提前到4CF3，保战果/474A/城损前缀并hold禁存，城市所属/官员/首都/F23尚不改；4FCE自身边界也保留，不写_extinctionHandled、不读/写去向槽与武将。原29C3同号槽指令证据保留；严格29C3叶另见[去向§7.3](re-notes-legion-fate.md#73-f18未闭合写者必须被阻断)，不能反证灭亡全链已接通。

**实锤写集来源**：固定上述KI SHA、VA+200h的 `501F/502E→5030→29C3`，`29C8..29D0`把武将指针减4240h、左移一位、加2240h，定位同general号固定slot；`29D4`（`80 3C 80`）先比较status byte，inactive跳过29D9占格DEC/29E2减F14，`29ED`（`C6 04 00`）清status，不清03或其它原槽字段。可复核原窗：`C:/Users/fczll/AppData/Local/Temp/dragon-ai-slot-order-parent-uudvtfid/extinction-count-raw.txt`（4FCE..5073、29C3..2A2E）；仅静态原编码，不是完整灭亡/消息返回证书。

有native表时，`applyBattleResult→finalizeFactionExtinction`的5030分支按`general.idx`用`nativeLegionAt`只读同号记录，不能从live/delayed视图找、以L02找、补记录或跳过非active槽。29D4严格读byte；缺slot、缺status及非法status均在此抛Uncovered，不能以`undefined>=80`为false继续捕获。明确inactive（回归取04）清0，保持F14、独立03及全部原字段/六队/占格。既有`clearCapturedLegionRecord`的dead/_active/target和`_retreat/_engagement=null`是Web清理投影；重绑getter不反盖03，不声称这些null是DOS写集。无表v1查找/清理分支不变。

回归使用真正prepared native、NPC最后城、无守军组、正常攻方474A的合成战果，验证04→0、武将捕获及正式snapshot→JSON→prepare恢复残值。未知输入只在实际29D4消费点停：先前战果/城损/占城/势力灭亡前缀和RNG、槽游标保留，武将尚未捕获；不补未返回尾段、不清已写`_extinctionHandled`重播。裸apply把异常交调用者，不自行创建hold；既有`openStrategicBattle`当前所有者捕获失败并禁存/hold，不执行后续endBattle/日结。测试只替代战斗计算/视图，不替代apply或错误所有权。此处只修新增表表示的消费者遗漏，**不放行一般29C3/291A/2A7E、2AD2、灭亡全扫描、active占格注销或消息链完整返回**；不能由此启用App v2。

#### 3.15.6 P39：4064 外栈读取闭合为永久工程边界

**范围/置信度**：固定KI capstone现刷为实锤（字节 pin 见 `verify_strategic_city_ai_raw.mjs` P39 段）；栈内容来源追踪为实锤指令级推导；「原版结果输入依赖、静态不可复现」为实锤结论。本节为本项唯一详细维护源。

**行走语义（4057..40B2）**：`405D` 一次 canonical RNG 后 `al &= 3`；`4064` 起 `cmp ss:[di],0xFE`——槽字节≥0xFE 则 `di=bp` 从头重扫（**al 不变**），否则 `dec al`、`al==0` 选中该槽、`di+=4` 续走。3FA9 只在 `3F89` 用 `rep stosw` 把 16 字节本地帧预填 0xFFFF；候选满四个（cl=4 耗尽）时不再写终止符。因此 N<4 时 al=0 的行走被哨兵截回、结果确定（等价 255 mod N 回绕，Web 现行实现逐指令吻合并有测试锁定）；**N=4 且 al=0 时行走越出缓冲进入压栈区**。

**外栈内容来源（实锤）**：`3F74` 依次 push es/ax/bx/cx/dx/di/bp 后 `sub sp,0x10; mov bp,sp`，故 `[bp+0x10]`=压栈 oldBP，`[bp+0x12/14/16/18/1A/1C]`=di/dx/cx/bx/ax/es。其中 bx=城市 X 低字节、ax=邻城 cache&0x7F、es=地图段基址（均为确定性状态值）；但 **bp/di/dx/cx 是 3EFD 未经初始化透传的 1CD0→1D0B 入口残余**——主循环 1C1F..1C65 每帧先跑 1F7F 输入、E453 计时（`1C22 push cx/dx / call E453 / pop`）、59A6/59B7/1E46/1F30/5C58 UI 分支，这些寄存器逐帧随用户输入与计时而变；再往上是返回地址（3F5A/1D16/1C65）与更老帧。al=0 的行走需 256 次有效字节读才终止（stride-4 深入约 1KB 栈），途经任何 ≥0xFE 字节都重置 di 但不重置 al，最终落点由动态栈内容决定。

**结论与 Web 边界**：原版此路径为越界栈读，选中槽由运行时动态栈字节决定，输入依赖、静态不可复现；与 3094 未初始化 RAM 同类。Web 在 `di>=16`（即首次 `ss:[bp+0x10]` 读）永久 fail-closed（`stop("SS:[BP+10h] at 4064")`，原有行为保留），不按经验补「选第 4 候选」或「视为随机」。N=4 可达性不可静态排除（边城四邻皆属目标势力即可构造），故保持停点而非删除。C08 账本「4064 外栈读取」项就此闭合为已分类边界；剩余 C08 缺口为 4155 无界槽扫/cache 一致性、43D3 线性别名全域、7FB4 立即命令与槽到期两入口。

**验证与剩余工作**：`verify_native_formation.mjs`的静态手算golden覆盖真实城市→创建→当前/跨批slot→后续47BB、旧兵守恒、一次成功后partial失败、state9池竞争、type4、active同slot/F14/03、实际消费点失败/hold/禁存、JSON冷再入及sidecar不反盖。既有native测试显式增加表/样式输入，旧461D全停断言推进到实际缺池4735；不是生产填洞。三旧v1测试及父追加批准同文件phase/BP夹具修正只锁已证输入/后继，不改v1生产来兼容耗尽pointIndex/旧cooldown。私有mutant、完整回归、浏览器、主动诊断与review的精确批次状态记journal/交付报告；focused不等于全AI、native启用或全战役证书。

#### 3.15.7 P40：占格平面/C18 缓存的 C02 生命周期与 fresh 初始化闭合

- **占格平面写者全集（10 站点，capstone 现刷亲核，规范对 `lds di/bx,[si+1A]`）**：269C 出发 dec / 26FA 到达 inc（行军每步配对）、298C / 29DE / 4682 / 7036 失活 dec、4EB4 / 4F51 战斗域 dec（4E5C/4F36 停点域内）、6FCA 编成 inc、8B0E 载入重建 inc。`es:[di]` 其它写者（86E0/9E9A/BC39/E57B/E6A0/E713）逐点核为 VRAM/引擎域，排除。失活次序（先 dec 后落 status，29C8 有 `cmp [si],0x80; jb` 跳过门）与 Web `originallegionfate.js` 逐指令一致。
- **平面初始化实锤**：`1A2F..1A4B` 在 E48A 地图解码之后 `rep stosw` 两页共恰 0x18000=384×256 字节全零（pin `raw(0x1a2f,0x1d)=2e8b16729833c08bf8b900808ec2f3ab81c200108bf8b900408ec2f3ab`）——占格平面是独立零初始化缓冲，**不是地图瓦片别名**。`89F0`（callers={1B87,1BE6}）载入后双循环：192 城 8A1E 着色 + 127 槽 8AEA 重建（`8AF8..8B11`：`lds bx,[si+1A]`、`inc es:[bx]`、回写 L1C/L1A；pin `raw(0x8af8,0x1a)=8bd8d1e003c32e030672988ec08b5c1089441c895c1a26fe07c3`），槽门 `[si]>=0x80`、slot127 攻城临时槽不参与。官方四章军团区 0x22C0..0x42C0 全零亲核，故 fresh 平面全零为数据实锤。
- **C18 缓存链**：`4155` 的 DH=`[SI+0x858]`=city+0x18；`3F4C` 刷新=`plane[cityTile]&0x7F`；C18 写者={3F4C 刷新、4455/4462 dec（43C9/440F 域）}；1B05/2AE0/2AEF（势力 F18）、5875（武将倒数）、1697（数据岛）均非 C18。初值=8CAE 载入城记录 byte+0x18（生产内容 `nativeCityRecordRaw`，P37 已挂）。
- **终止性论证（4155 无界扫描）**：C18≤匹配数时 skip 预算 C18−1<N 必终止；仅缓存高报（C18>N）才越界→Web `slot>=128` stop 保留为工程边界。拓扑核验：road_graph.json 254 条边折线无一穿过非端点城瓦片→站上城瓦片 ⟺ L0E==city*8。城市 AI 阶段先于军团移动阶段，无 mid-step 瞬态。
- **Web 接线（P40）**：`scenariomovementmemory.js` 新增 `zeroFilled:true` 合同（全平面 known=0，snapshot 只发非零 run）与 `synthesizeScenarioMovementMemory`（8AEA 逐军团重建）；`scenariocitycache.js` 新增 `synthesizeScenarioCityCache`（从 nativeCityRecordRaw 取 +0x18×192，缺 raw fail-closed）；`scenarioassembly.js` roadVersion2 fresh 分支两能力 null 时恒合成（restore 路径不动，旧档模拟缺失能力仍 stop）。专项 `verify_native_occupancy_init.mjs` 11/11；`verify_native_road_movement/arrival` 无能力用例改走「旧档 restore 缺 webMeta」路径（fresh 恒合成后原 fixture 开关不再产生缺失）。

#### 3.15.8 P42：军团菜单立即命令入口 7FB4（7FDB 选择体）接线核对

单一维护源。capstone 现刷实锤：`7F90`=目标据点指示菜单流（2078 开窗/1B4/DS=D52/SI=军团+0x2240）；`7FA5` 所有者门 `al=cs:[CFF]; cmp al,[si+1]; jne 7FBC`（NPC 军团只读视图，跳过 1DB/7FDB）；玩家径 `7FAE` 1DB→`7FB1` call 7FDB→`7FB4` call `4325`（不经槽门立即解算）→`7FB7` `or [si],2`。

`7FDB` 选择体：`703C` 城选择（jb 取消）→`bx<<=3` 目标 idx 存 [bp]→君主首都==目标→AL=3（解体项仅首都出现）→`801D` call `804E` 选项 UI（jb 重试）。结果写集：AL=0 戰鬥指揮 `and [si],0xFB`（清 bit2 委任）、AL=1 委任 `or [si],4`、AL=2 解体 `[si+0x23]=0x0B`（command 11）；随后 `803C` 统一写 `[si+0x0B]=1`（moveDelay）、`[si+0x20]=目标 idx`（target city）。`804E` 前缀 `ah=0x18-al`、`cs:[9898]` 夹顶（选项数 2..3）。

Web 吻合核对：`gamebar.assignMarchOrder` 写集逐指令等价（setLegionDelegated=bit2、commandState=0、moveDelay=1、status|=0x02=bit1、targetX/Y、settleArrivedLegionCommand=4325 立即解算）；`_orderDisbandAtCapital` = assignMarchOrder(首都,false)+commandState=11。无生产代码改动；字节 pin 与写集断言见 `tools/verify_advisor_delegation_ui.mjs` P42 段。槽到期入口（0B1 递减→解算）归 C03 调度轮。

#### 3.15.9 P43：出陣提交体 6A03（6E8F 君主编成门）接线

单一维护源。capstone 现刷实锤（VA+0x200，同 SHA）：`6E8F` 唯一 near-caller 为 `45EC`（AI 循环，已接）与 `6A03`（699E 出陣提交）。699E 提交链：87FF 取君主（`BX=[CFD]; BH=[BX+1]; BL=0; BX>>=3` → BX=君主idx*0x20，纯读零写）→69F3 `SI=BX+0x4240`（君主武将记录）→3B08 简易对白（push ax/bx/cx/dx/bp/di，SI 全程不动，69F7 直达 6A03）→DL==0（`canDeploy` 既有门）→`6A03 call 6E8F`→jb 6A10→`6A08 [DI]&=0xFB`（6EBF DI=军团地址：君主亲领清委任位，C4→C0）→AL=8→`5E80`（4641 同门：玩家资金面板刷新，P32 全树零规则写入、零 RNG，纯显示）→6A10 共享尾（8853/1D46/20D6 设备帧，沿用各进言既有 gamebar 尾）。

6E8F 体复用本节已闭合 `createOriginalLegion`（6EA0 同号槽、6EC9 六队候选、6F26 绑定/F14/占格INC、461D/6FD2、C4/CLC，+0x14=idx*8 差异仍按 §3.15 既有待修项保留，不在本轮扩大）。CF 分支（某队三候选池均不足 50）在 6A03 可达态下不可能：DL 门（69D2 池24位和）与 6EC9 读同一 F+4/6/8 字节，87FF/3B08 不碰池、模态 hold 无 tick 穿插；每行候选覆盖全部三类，故 CF 蕴含池和<400（末队<150+250），与 DL 通过（和高字≠0 或 和≥600）矛盾。CF 分支仅作忠实/fail-safe 保留（部分写保留、无清位、无 5E80、静默尾声、无信赖变动）。全链 0 RNG。699E DL 门（69B4–69EC）沿用既有 `canDeploy`，BH≥0x80 跳过与池高字语义差异记未知不修（v1 既有行为，非提交体边界）。

Web 接线：`originalformation.js` 新增 `commitOriginalMonarchDeploy`（0..126 门+君主记录门→createOriginalLegion→CF 直返→`&0xFB`+rebind）；`scenariomonarchdeploy.js` 新增 `performScenarioMonarchDeployCommit`（`scenarioNativeRoadContext` 空即 fail-closed，路 context 缺失不能半执行占格 INC）；`gamebar.js` 出陣定时器 native 分支调用提交（CF→静默尾声，成功→refreshInfo 作 5E80 投影+既有成功尾），v1 分支逐行不动（含 -200 预备池与 6×1000 固定编成）。`delegated` 镜像由既有 lazy 同步（读时从 bit2 回写），不另写。专项 `tools/verify_native_monarch_deploy.mjs` 6 项（成功全写集+C0/非委任、wrapper 同槽绑定、CF 部分写无计数、复用跳 F14、索引门、context 空门）。C08 编成驻防派令至此各项均有结论（4064 外栈读永久 fail-closed、4155 有界、43D3 别名、7FB4 两入口、6E8F 提交）；路线图剩余转 C03 调度与 C10–C12。

#### 3.15.10 P44：槽到期分派 25C1→2662 全分支核对（零生产改动）

单一维护源。capstone 现刷实锤（VA+0x200，同 SHA）：`2662` 唯一 near-caller 为 `25CF`（25C1 体内：`dec [si+0x0B]; jne 25D2` 跳过、`0` 则 `[0x0B]=[0x1E]`+`and [si],0xDF` 清 bit5+call 2662，随后 2600→264A；byte 回绕、due 才清位、动作→日结→尾顺序见 `legionscheduler.js LegionSlotBatch` 逐项等价）。2662 体（2662–26FE）15 路：`BX=[0x0E]==[0x14]`→`[8]=4`+28F4+4325 直返（266A，占格括号外）；`test [si],0x10`→2BA8（先 `and EFh` 清 bit4 再读 `cs:[98A6]&4` 作画，画体 9656/96ED 未展）；`BX<0x800` 且 `[1]≠cs:[CFF]`→4300（CF=1 即截留成功才走 266A，`[0x20]=BH`）；`BX≥0x800`→42AB（无 CF 检查）；占格 `LDS [1A]` DEC（2697）…INC（26F5，早退 jb 路亦 INC、266A 到达路跳过括号）；bit1 置位→消费+47BB（CF=1 经 INC 退）、随后 bit0 置位走 26C8 点标志解码、清位走 26C0→2708；bit1 清位+在节点→47BB 选边（CF=1 经 INC 退）后落 2708、在边上直落 26C8；26C8：`ES:[BX+3]&7<2`→26FF（`or [si],1`+BX+=stride 落入 2708 作候选），否则 `0x40` 置位要求 stride>0、清位要求 stride<0 才走 26FF，否则 27F6（neg stride→2808 方向写）+27A2 切节点；2708 候选：占格非零→2831、bit0 门内 `CE..DD`→2880，CF=1 早退（26C0 路忽略 CF），CF=0 写回（`[1C]=行段/[1A]=DI/[0C]=BX`，再读 `ES:[BX+2]` 写 `[10]=DI/[12]=AL`）后按新标志走 2804 或 27F6+27A2；27A2：`+0A==4` 取边 `+8` 端否则 `+6` 端→`[0x0E]=node`，node<0x600 经 `node*4+848h/84Ah` 取城坐标并重指远指针，到达复核 `[0x0E]==[0x14]`→`[8]=4`；2804 方向写（x 差符号→[8]=0/1，y 差为零保持 [8] 不变、否则 2/3）与 27F6 neg 封装逐字节等价；4325 分派（`[23]<8` 且 `[1]≠CFF` 则 +4 档，表跳 434F）；平面线性 `base+行*16+列`=base+y*384+x（`scenariomovementmemory.js movementPlaneAddress`）。

两处易误读以原码为准：其一 42AB 内联谓词逐项等价（`+0A==0xFC` 取 `+6` 否则 `+8`；端点非己且非 `0x18`；外交 `owner*24+other+0x600` xlatb≥0x80 才改写对端 `[0x14]=node/[0x20]=node>>>3/or bit1`）。其二 4300 拦截 BX 穿透属原码行为：4300 出口 BX=node*32（idx*256），266A 原样传入 28F4（DI=BX*4=idx*1024，idx≠0 时第二比较恒 jne→CLC 跳过 291A）及 4325；Web `interceptOriginalRoad4300` 返回同值 BX、`arriveOriginalRoad` 用 `di=u16(bx*4)` 复现同一偏移并经 43D3 `di+0x18` 消费——含怪一致，非偏差（`verify_native_road_arrival.mjs` 4300 专项已 pin）。CFF 语义记推断：唯一 init 写者 1B23（2BD9 开局前）、约 25 处 cmp/mov 读者全作自势力门；Web `player_faction` 取自剧本头 FF→0（`commands.js initPlayer`），1B08–2BD9 上游链不展。idx=0 拦截路 291A 可达性记未知（需 2662 时刻 DS 段身份），Web 在 idx≠0 全路与原码结局等价（跳过 291A、4325 正常），不修。callee 体（28F4/2831/2880/47BB/4325 各 handler）归 §3.11–§3.13/§5 已有范围，本轮只取调用边界。零生产改动：既有 movement 34 项 + arrival 24 项 + slot phase/cursor 锁死，聚焦五套件 104/104。逆向分流按用户指令优先走 jev：C03 开工包跑 `reverse-triage` preview（离线 advisoryOnly，无联网）；live `--send` 因无 `TYPESAFE_API_KEY` 未发（key 由操作者持有，本轮不索取）。

#### 3.15.11 P87：UI 旧式编成 push 的 v2 写穿修复（Web 工程，非 KI 新规则）

**问题**：C15 门翻转后正式局恒带 `nativeLegionSlots`，`sc.legions` 只是 `rebindNativeLegionViews` 重建的派生视图；但玩家「編成→確定」（`gamebar.js _confirmFormation`）、君主亲征旧分支、历史 `dispatch` 仍直接 `sc.legions.push`。下一次批次收尾/AI 重绑/存读档即丢掉该记录，而预备兵扣除与武将 `status=1` 保留——表现为“提示编成成功、预备兵减少、武将变軍團長，但军团列表与据点标志为空”。用户实报：原版第一章刘备势力张飞编成，无报错、无存读档、无时间流逝即复现（对话框关闭→时钟恢复后的首次批次收尾即可抹掉）。

**修复**：`nativelegions.js` 新增 `publishLegacyLegionRecord(sc, legion, at)`——无表时保持原 push；有表时把调用方已算好的字段值（状态/六队/兵力/坐标/目标城等，去掉 `target/leader/dead/_active/prevX/prevY/_march` 等表现派生）写入同号固定槽并重绑，返回重绑后视图。调用方原有的 ensure/bind/reset/count 顺序不动（count 仍查插入前态），只把 `push` 换成该函数。三处调用：`_confirmFormation`、君主旧分支、`commands.dispatch`。**置信度**：Web 工程推断修补，非原版机制实锤——字段取值仍沿用既有 UI 逻辑，手动编成 6CDA 入口（池扣减/槽选择/初始写集）仍未闭合，不冒充；仅 6FD2 尾（resetLegionActionPhase）有据。验证：最小内存脚本复现 push→rebind 丢失（WIPED）与写穿后保留（v1/v2 各 1 条，status/主将/目标城/总兵/F14 正确）；`verify_native_formation.mjs` 28/28 通过；`node --check` 三文件通过；LSP 对三文件 inconclusive（silent-on-clean 服务器，未证伪）。

**行军 plumbing 后续（同批）**：写穿后首次行军步仍 fail-closed（`Uncovered original movement L1a: undefined`，浏览器复现实测 t5 tick 张飞军团）。行军泵首动作即读占格指针，故 `publishLegacyLegionRecord` 补 6F86 对齐：`targetX/targetY` 默认当前坐标、`roadStride`/`roadPointAddress` 默认 0、`_markerFrame` 默认 4、`markerBase` 按 701A（style*5&255，已知才写）、`occupancyOffset/RowParagraph` 及 movement 平面 INC（调用方传 `scenarioNativeRoadContext(sc)?.movement`；App v2 恒有，无 context 时只写指针值不 INC 并注明）。补后同复现 400 tick 无失败、无 hold，军团正常上路。

**行军标识朝向修复（同批，Web 表现层，非 KI 新规则）**：用户实报行军中凸形标识始终朝一个方向，横走/竖走不变。根因：`mapview.js getLegionRenderPos` 用 `prevX/prevY/target/_march` 反推方向帧，但原生泵内从不维护这些表现派生（`performLegionSlotAction` 的 prevX 写只在无 native 上下文的旧分支；`publish/快照` 剥离 `_march/_path/prevX`；`assignMarchOrder` 只写目标系字段），反推恒得出发点或目标据点方向。原版写/读链完整：`originalroadmovement.js direction()`（dx 符号→0/1，否则 dy→2/3，同坐标保值）/`nodeize()`（^1 翻转）/到达（`[0x0E]==[0x14]`→4）每步写 +8；`0x2808` 按 +8 选帧。修复：表现层以 `L._markerFrame`（+8）为准，0..4 以外或缺失才回退旧推导；静止（无 target/engagement/位移）仍强制帧 4。影响面：仅方向帧来源，不动插值/分支/规则。验证：行军/转向/到达/回退/静止 5 例内存断言全过；`verify_native_road_movement.mjs` 32/32；`verify_native_formation.mjs` 28/28；LSP inconclusive（环境一贯）。

**42AB 通行语义（实测记录，未改规则）**：张飞沛→漢安首跳边 3344（+6 端 448=濟陰/曹操，+8 端 520=沛）。刘备开局与所有势力外交 ≥0x80（24×24 原生=legacy 一致；宣战清 bit7/停战 OR 0x80，故 ≥0x80=和平），首步后 42AB 因“终点非己/非中立且外交 ≥0x80”改写目标为另一端（家）并 dissolve 命令，军团返回首都后转 state9（总兵 500<600）→补员循环。该实现与 §3.12 line 650 静态证据逐项一致（42EE/42F7/42FA 只写 14/20/OR2、同动作继续），故按证据纪律保留，未做“放行和平过境”或“目标选择加宣战门”等经验修改。对曹操设交战值后复测：同一军团沿边推进且目标保持（42AB 放行）、无失败——即现行模型为“只能经己方/交战方节点，远程奔袭需逐城宣战攻取”。7F90 目标选择是否应限交战方、42AB 静态触发与“易主”表述的关系仍未闭合，记为后续原证复核项，不在本轮扩大。

## 四、不可达与没有走通的处理

已实锤：

- `0x491B`队列耗尽时BX=800h/CF=1；入口目标已等停止节点也CF=1，但不是失败。8000h高成本不等于无路，详见§3.4；
- `0x487B`没有把所有搜索CF=1直接上抛，`490C`会把遗留AX转为城偏移并CLC（§3.4）；其撤退搜索以首都为目标，对非己城市加巨额代价但不删除节点，最后只复核即时第一跳归属；当前位于据点节点时由`0x48E5..0x48F1`沿返回第一边取得下一跳；
- 正常行军`0x47BB`按`CX>=8000h`且命令`+23>=0Ah`进入291A，不按search CF；49B0耗尽CX0反而不会过该门，见§3.5；
- 组撤退`0x4DA4`及其去向分派见[战后Skill](../../.agents/skills/re-post-battle/SKILL.md)；不能将47BB的CX门直接套到组撤退。

`0x291A` 已闭合为战败/寻路失败后的军团清退与武将去向分派器，而不是移动到最近据点：`AL` 是调用者传入的接收方字节，不能保证总是真实胜方势力；先由2944检查首都FF并直接分派29C3；首都非FF时，F01等于L02、同势力接收、中立接收或通过同号武将原始`+0x1F`随机门槛才进入`0x2977`，军团初始化`status=0x08,+3=0x30`，后续`0x2A7E`按当时计数归零恢复武将待命。旧固定48次结论撤销：当前活动槽尾部可先清计数为0，且城0截留会把城市索引0当AL传入，详见[全链P01](re-notes-ai-chain.md)；否则进入`0x29C3`，军团删除、武将`status=4`并记录新旧势力。一般native去向与四类注销写序、TALK33/34分支差异仍见[接线前审计](re-notes-legion-fate.md)，不能把本段摘要当作callee已完整返回。`general[+0x1F]`的产品名称、特殊武将退场bit仍待命名。

仍待动态验证：

- 玩家下令目标不可达时，是否在 UI 阶段直接拒绝；
- 命令8/9/10的已核时序见全链P16/P24；尚未闭合的UI可达性和外层返回不能由状态单测替代；
- 按去向调用来源追踪实际倒数和槽续段；不能将初始48、被活动槽尾部清0两支混算成固定回归时长。

## 五、移动推进与方向

### 5.1 军团运行时字段

军团记录为 64B，状态段偏移 `0x2240` 起。与行军直接相关字段：

| 偏移 | 当前理解 |
| --- | --- |
| `+0x08` | 正常军团标识帧：`0=西, 1=东, 2=北, 3=南, 4=驻止/到达` |
| `+0x09` | 正常军团标识组基址：`势力记录[+0x3E] * 5` |
| `+0x0A` | 当前边上的有符号步进量，常见 `+4/-4` |
| `+0x0B` | 动画/移动倒计时 |
| `+0x0C` | 当前道路点列指针/索引 |
| `+0x0E` | 当前拓扑节点/边 |
| `+0x10/+0x12` | 当前地图坐标 |
| `+0x14` | 目标拓扑节点 |
| `+0x16/+0x18` | 目标据点坐标 |
| `+0x1A/+0x1C` | 当前地图/道路数据指针 |
| `+0x20` | 命令方向/目标辅助字段 |
| `+0x23` | 行军命令状态 |

其中部分字段仍需存档差分确认。

### 5.2 战后休整与再次出击

已实锤：

- 战后胜军由`0x474A`写入命令态8；`0x4483`只等待士气恢复到势力`+0x1D`上限，达到后转命令态1，不会在攻城结算同轮立即获得下一个进攻目标。
- 后续据点AI的`0x405D..0x4073`以RNG低2位循环选择候选邻城；命中候选时AL为0，`0x4099..0x40AA`明确把AL改成1后作为DL传给`0x4155`。
- 因此一次据点轮询最多给1支合格委任军团写目标。敌城运行态强度只参与`0x407A..0x4084`的出击门槛，不是同轮派遣数量。
- `0x4155`先取DH=cache−1，逐40h匹配node/active，先RNG跳过；非跳过槽不论委任/命令资格都耗DL。无显式上界，正常cache=N/DL=1保证最多N个匹配槽内终止；详见[实体字典据点§9.2](re-notes-entity-fields.md#city)，不再声称固定128或首个合格。

### 5.3 沿边移动

已实锤：

- `0x47BB` 决定下一条拓扑边；
- `0x2708` 读取当前边的点列/坐标数据；
- `0x27A2` 到端点后切换为节点；本动作不选择下一边；
- `0x2804/0x2808` 比较当前位置和下一点，生成四方向状态；
- 正常成功选择的`+0x0A`以`+4/-4`控制沿边方向；耗尽后的非标准值另见§3.5；
- `+0x08` 根据 x/y 差值形成四方向编码。

这说明原版军团标识不是在两个据点之间直接做一条直线插值，而是沿预生成道路边的点列逐步推进。

### 5.4 P24：同动作改向、点标志与节点写集勘误

以下保留原审计时的默认v1差异；detached v2有限实施及明确暂停边界以[§3.12](#native-movement-callers)为准，不将下文历史“仍待修”套到已覆盖切片。

**实锤范围**：KI `25A3..291A、42AB..4325、47BB..4A7B`及`E81C..E993`静态指令；通常合法图地址/stride±4、bit4清、搜索成功低成本域，不把本节写成全世界或显示callee完整返回证书。原KI SHA仍为`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，文件偏移=VA+200h；原报告与父补窗见journal P24。

1. **42AB返回不是动作结束**：按旧stride选当前边端，若非己/非18h且外交≥80h，`42EE/42F7/42FA`仅写另一端`L14/L20`及OR2；不写`0A/0C/0E`、位置、`16/18`、命令或周期。`2694`返回后继续`2697→26A5`，同动作消费bit1/重选方向/检查点。旧最终目标已被替换；Web的直接反转、保留旧最终目标、返回`reversed`结束动作均为未修偏差。
2. **47BB一般目标不是恒+4**：直接目标等edge+8写+4，等edge+6写−4。否则`47EA`令`AX=新目标、BX=edge+8、CX=edge+6、DL=所属`反搜两个停止节点。成功后`4806..481D`由返回stride取返回边朝根的一端，与保存的旧edge+8比较：相等+4，否则−4。两者均置bit0、保留原0C/0E。不能用“目标坐标变了”代替bit1；外层先清bit1，失败也不恢复。
3. **两次端向检查**：`26C8..26EA`先看当前0C；`2777..279E`再看已提交候选。`flags&7>=2`且`bit6置/stride≤0`或`bit6清/stride≥0`时，同动作调用`27F6→27A2`。所以44/−4的首点直接切source，04/+4的末点可提交后立即切target；不能先越过点流，也不能统一多等一动作。
4. **27A2只切节点**：重载旧L0E，0A==4取edge+8，否则取edge+6；写0E。节点<600h才按`node*4+0840h`城表写x/y和占格pointer；若等目标14再写方向4。**保留0A/0C/status/14/20/23**，不立即选下一边或调用4325。旧Web清导航同时删除0A/0C的做法错误；该字段清理/快照覆盖问题已局部修正（§5.5），但原flags触发节点化的完整时机仍未接入。
5. **方向不是刚完成的位移**：`2804`看0C+stride的下一点，x不等先判东西，x相等才判南北，相同位置保留旧方向；`27F6`看0C−stride后XOR1，再由27A2在最终目标覆盖为4。Web最大轴/刚完成位移算法仍待改。
6. **指针不能由坐标替代**：`reverseRoadMarchContext`在唯一坐标、已提交点且坐标与0C一致的输入可碰巧等价，但没有严格保留0C的合同。改向应先保留原始点地址，再改有向索引；不能借该helper擅改目标。§3.6已核默认254边各自无重复坐标，但这不证明改向时坐标已经提交并与0C一致，不能因此替换地址合同。

可重复的静态小图控制：edge0800首末2000/2014，两端node0/8；六点`(2+r,10)`，flags=`44,00,00,00,00,04`，首末tile=D4、其余BA；城中心`(1,10)/(8,10)`。旧占格1、其它0、status=C1、0B1/1E3、Y高byte0、无其它军团、无额外城市/天气阶段：

|输入|原指令确定结果（非本轮执行输出）|
|---|---|
|0C200C/x5/stride+4，目标8；城1第三方外交FF、城0己有|42AB改目标0；47BB保0C并转−4；同动作提交2008/x4，0E仍800，0 RNG|
|同上改为0C2000/x2|当前44直接切城0；0A=FC、0C2000保留，0E0/x1、方向4；不读1FFC|
|0C2010/x6/+4、目标8、两城己有|同动作提交2014后切城1；x8、0E8、0C2014保留、方向4|
|上一输入，总兵100/士气100/上限200/资金1000且CF3=1|同槽按新节点扣4、士气110、资金996，不扣道路75|
|上一道路输入但城1交战异属，03=0|末点不提交；直接动作03=12、完整槽尾11；不混成一次读写|

一般目标反例：当前边0800连接N0=0/N1=8、成本20；0810连接N0/T=10h、成本3，0820连接N1/T、成本9；三城皆己。邻接槽分别为N0=`4800,4810,0,0`、N1=`8800,4820,0,0`、T=`8810,8820,0,0`。491B从T向双停止点反搜，候选7/13，唯一先命中N0，返回AX4/BX0810/CX7；480A读其source=N0，不等旧N1，当前边写−4而不是+4。交换3/9会写+4。这不认证平权/溢出/队列尽头；这些继续单独核。

**flags来源已核，生产尚未接入**：E961给B8..B9→01、BA..CA→00（CA另OR80）、CB..D3→03、D4..DD→04；E81C特殊起点另由E841 OR40写44，随后方向来自DH低半字节，E889/E91E写后继分类。必须保留完整byte，不能按数组首末臆造通用flags。父复用P04原图SHA`c226fc8fd8567ffc23a927e09419797d9d94b06c1b4d67bbf9b73909981e7afc`，以`0800+16*edgeId`核两端、首末地址及每个4B点；与当前编辑源/运行图的254边、5526个坐标及顺序全匹配。flags计数44=254、04=254、00=4225、01=159、80=634；当前两个JSON均缺flags，254个weight也仍不是原byte成本。不是新构图运行证书或任意新地图支持。

P06默认图接缝的原byte：edge0EC0=`a440cc400a006002c002f300f3006d77`，40C8=`f3007600`、40CC=`f3007704`，node88中心`(243,120)`。可据此构造下一到期输入，但未执行的下一批/全战役不得由第一批绿测替代。完整资源导入、一般搜索、方向/节点生产修正仍待完成；不把仅撤销错误测试期待当作修复。

### 5.5 P24：字段工程矩阵与冷加载修复（非完整道路接线）

此矩阵描述默认v1/冷加载历史；detached v2已覆盖的14、低byte Y、flags/方向、显式pointer与移动入口隔离统一见[§3.12](#native-movement-callers)，不等于默认v2发布或全部旧字段已补齐。

字段审计的冻结范围、审阅结果和历史状态见[journal](checkpoint-journal.md)。以下是接入原道路前必须共同处理的字段合同；冷加载和后续字段写回的局部修复均不等于完整接线：

- 原`0C`在新边可指向首个待提交点，bit0清；首次提交不必置bit0。`26FF`先置bit0、再算候选地址，接触返回不撤回该写。旧`_march.pointIndex`只表示下一待提交索引，不能替代这个历史。
- `roadStride/roadPointAddress/roadEdgeOrNode`不能由旧`_march`反过来夺权。已将选边/提交点的字段写回与缓存失效分离，清缓存不再删0A/0C/0E；snapshot和日费优先显式0E，节点0不被旧边覆盖。缺0E时仍保留既有Web内存转换，不是原字段补全、旧档迁移或新增准入政策；完整字段校验/生命周期仍待接线。
- 430B读取方向4，08不能视为纯显示缓存。snapshot已停止删除实际运行`_markerFrame`，可保留0..4原有值；但旧parser的`marker_frame/raw`未随运行同步，原2808方向生成及4300接线仍待完成，不能据保存Web现值宣称原方向等价。缺值旧phase1档未在这一步迁移或额外拒载，正式接线前仍须明确准入；不得以当前build的缺值fallback补原历史。6F62新编明确写byte08=4，仅证明该新编入口，不授权旧档统一补4。`_nav_node`未在本次获准生产/解析源找到，不为文档假名补字段。
- 已核Web写者的`targetNode`为graph id，旧`parse_save`输出则是原地址。build过去会把8倍数id当地址解码，或由20重建14；现已取消这两种推导，只保留已有值（含0），不补缺字段、不改变输入格式或准入，不恢复此前已经被改坏的历史值。迁都原窗可生成14≠20，不能视为可安全归一化。**目标消费仍未整体修正**：现有stepRoadGraph仍按实体目标坐标重选并覆盖targetNode，到达/命令等caller也须随原搜索一起改造；保值不等于14/20机制已闭合。
- 当前build的`!x/!y`吞0，道路提交整写y而原2774仅写低byte；本次冷加载修复**未**修这些语义。21/22边界见§6.0，不能猜缺失旧字段或因此一刀切拒绝全部phase1档。
- 真规则搜索有三处：普通新边`makeMarchNavigation`、`retreatRouteToFriendlyCity`的端点反搜及节点下一跳；已有边bit1重选也需补入。`drawMini`的只读虚线近似不应调用会写搜索工作区的新原语。

**已接生产的局部字段写集**：`4863/4866/4869/486C`先记录新边首/末点、边地址、清bit0和stride，候选接触前这些字段已经生效；`276A`在通过候选接触检查后、坐标提交前写0C。现有节点化分支只改0E并保0A/0C残值（`27B5`），但尚未实现原flags的同动作节点化时机。build不按坐标覆盖显式0E；边内0E不进入现有节点到达判断。这不修复仍按实体坐标判断到达的全部分支，原`0E==14`与目标绑定仍须一起接入。

`prepareRoadMarchProjection`只校验/恢复投影，不写原0A/0C/0E；必须在**真实到期action的首个导航消费者前**运行，而非仅在`stepTo`内。否则outer `reverseBlockedFinalEdge`会先把stale edge的方向永久写进节点残值，engagement也可能先消费旧缓存。直接stepTo仍用同一准备函数。丢失缓存时按已有边/点恢复，不从道路点启动节点寻路；不能把恢复失败当原版无路。bit1在投影刚重建、目标坐标相同时也会触发端点重选；端点改向不改0C/0E，接触RET保留尚未提交的旧点。这不把现有一般目标近似升级成47EA，也未修42AB的旧提前返回。迁都`4502..4547`写20/14/bit1而不写道路三字段，缓存清理不得抹掉其下一动作所需的边身份。

验证入口`tools/verify_road_field_authority.mjs`区分真slot、直接stepTo和人工exhausted输入；cache有无的真slot对照不为旧nonwar选路结果建立原版golden。retreat保存夹具须明确把原三字段一起设置到人工边内状态，不能用snapshot偷偷把旧节点改成边。首次待提交点与bit0的完整历史仍不能由pointIndex补出，旧档缺字段问题也未因此解决。源静态窗/首审反例/增量审阅和执行记录见[journal](checkpoint-journal.md)。

**已修的独立工程缺陷**：原main `loadState`启动`terrain.loadTerrain()`后立即build，cold时图为空，恢复返回null且清掉输入0A/0C/0E；函数尾才等图ready，无第二次恢复。原`ensureGameAssets`不预热道路，warm同页测试会掩盖此问题。

**历史冷加载修复阶段**先await图/地形ready再build，并加scenario/world/clock与entry票据、pending禁存/hold；当时入口已提前安装场景并归一化/写RNG，因此资源失败保留部分live写入与pending，直到重试成功或返回标题。这不是当前预检失败合同。**现行两阶段装配统一见[§3.10](#310-p24正式装配与保存身份准入web工程生产仍限v1)**：资源/身份预检在detached候选上完成，失败保留旧live场景/RNG/所选槽，仅释放自己拥有的pending/hold；实际提交后仍不承诺整个load事务回滚。过期entry/assembly不能提交或解冻新流程，原存档不变。

验证入口`tools/verify_road_cold_load_browser.mjs`使用新context、自有端口及纯内存合成phase1存档，分别测cold/warm、交叠loadSave、旧enterGame回调、返回标题取消、禁存/hold、坏图拒绝和后续重试。不模拟原程序或证明人工军团正常可达。必须先证明输入在warm下能恢复，不能把错误点地址的拒绝误作cold缺陷。实际测试数字、红绿过程、临时产物与审阅/全量验证状态只记[journal](checkpoint-journal.md)，不由局部绿提升为完整道路或AI认证。

## 六、战略地图标识动画

### 6.0 截图校正与三条绘制路径

用户提供的原版截图显示，道路行军与城外攻城等待均使用所属势力的像素军团标识；各势力的**图案和颜色都不同**，但来自固定样式槽。反汇编与资产提取进一步把战略图绘制分成三条路径：

1. **正常军团行军/驻止：`0x2AF4 → 0x2B2A → 0xD4C7`**
   - 对 `status >= 0xC0` 的军团每帧绘制；
   - `index = legion[+0x09] + legion[+0x08]`；
   - `+0x08 = 0/1/2/3/4` 分别为西/东/北/南/驻止；
   - 军团创建/刷新 `0x6FD2..0x701A` 写 `+0x09 = faction[+0x3E] * 5`；
   - 因此每个势力样式槽严格对应 5 张资源图，不是旋转同一张图。
2. **接敌/攻城等待态：`0x2AF4 → 0x2B3C → 0xD51F`**
   - 只对 `status bit5 (0x20)` 的军团绘制；
   - `legion[+3]` 是名义值 12 的接战倒计时，低 2 bit 选择四相；
   - `2B45`以byte读取`legion[+0x21]`参与临时索引：byte内左移2后加`(+3 & 3)`，再扩word乘16；这不是所有消费者穷举。`2653 C6 44 21 00`仅清byte21，保22；detached native尾现以`contactAnimationByte21`承载此写零，见[§3.13](#native-arrival-callers)，v1及2B45消费者未扩接。现有证据不支持把它称为势力或编制样式。
   - P24新增`road-field-audit-addendum-v1/raw/contact-2a7e-2bd9.txt`由已知2A7E入口静态解码；2AF4明确DS=D52、ES=987A、SI从2240每次加40，闭合上述SI为军团。2B3C先OR status bit4，2BA8清bit4；22语义及其它写者仍未知，绘制callee/栈副作用未由本窗闭合，不能整体no-op。
3. **通用地图动画对象：`0x2533 → 0xD51F`**
   - 扫描 32 个 16B 对象；
   - `+0x0E` 选组，`+0x0F & 7` 选八帧；
   - 由事件/地图对象接口 `0x23FF` 创建，不是正常军团行军标识。

截图中的土黄色圆形背景属于据点城门/城墙图，不是额外爆炸。此前把 `0x2533` 当作正常行军军团动画、把 `0x2B3C` 当作常态四方向标识，均已被上述调用条件否定。

### 6.1 固定样式槽与原始资源

已实锤：

- 势力记录 `+0x3E` 是战略军团标识样式槽；
- 原始 20 章剧本中该字段使用 `0..23`，常见主体势力沿用稳定槽号；槽号不是运行时按当前活跃势力重新编号；
- `MMAP.MCH` 是原始覆盖图块文件，**不使用 `MMAP.MAP` 的 RLE**；
- 每张覆盖图块固定 160B：前 32B 是 16×16 1bpp 遮罩，后 128B 是 16×16 四平面颜色；
- 前 24 组 × 5 张即完整势力军团标识：四方向“凸/回/条纹”等标识 + 驻止旗帜；图案与颜色均已烘焙在资源中，不需要 Canvas 运行时染色；
- 提取结果：`web/grf/march_markers/style_00_frame_0.png` 至 `style_23_frame_4.png`；审查图集：`docs/march-marker-styles.png`；
- 帧次序由 `0x2808` 方向生成与资源外观交叉确认：`0=西, 1=东, 2=北, 3=南, 4=驻止`。

这与用户描述完全一致：游戏共有固定若干种图案/颜色组合；场景文件通过槽号分配给势力，后续章节可复用既有槽。Web 不应再使用“20 色循环 + 4 个 SVG + 独立染色”。

### 6.2 接战动画与委任声效

交战音效、驱动与轮询的详细证据统一维护在[音频证据](re-notes-audio.md)。旧“双OPL2/固定五声/82.5ms/2倍速/叠播/听感即认证”已撤销：COM:0154实为OPL3 NEW与4-op初始化，ID3用bank0未配对的channel6，后继3/7个BIOS tick链13/0，同ID重触发。Web用原指令单记录3/13的离线WAV按共享BIOS相位排后继；音乐AH7取消未来后继而不切断当前自然衰减，不冒称实机录音。

**原版时序**：首次接触只写12同槽减11，不发声；`+0B`归零重装`+1E`才重检接触、发ID3或结算。全六队骑兵周期2发5次，任一非骑兵（含零兵队）周期3发3次，间隔16/24个主更新；两者均在首次之后第12次自身槽访问进入战果。Web保留接战等待区的规则门控，P24已接统一动作门，方向/flags及相关字段的生产接线仍待完成；现行音画已按用户批准改为独立100ms/200ms节拍，不再由这些轮询发声。音频准备不影响规则和四相首帧，详细差异见[音频维护源](re-notes-audio.md)。

绘制位置由静态指令闭合：`0x2AF4→0x2B3C→0xD51F`先读取攻方军团`+0x10/+0x12`画48×48接战图；`0x2AF4→0x2B2A→0xD4C7`随后读取同一坐标画16×16军团标识。故动画与标识都停在城前军团坐标，且标识压在动画之上；旧Web“目标据点中心”定位已撤销。原版从接触当轮按倒计时选择图帧，现行Web改读共享表现相位；两者都不应在接触结束后再追加专用过渡。四张PNG调度保留；GIF不能解决启动等待，且不利于帧重置和与声音共用确定时基。

野外接敌 `0x2831` 与攻城检测 `0x2880` 共享同一预战阶段。`0x26FF`先把候选点指针按`+0x0A`推进，`0x2708`读取候选坐标；`0x2736`先调用`0x2831`，若该点已有异势力活动军团，CLC后主调度立即返回。否则`0x274C..0x2757`在`status bit0`已置位时把候选地图tile与`0xCE..0xDD`比较，命中才调用`0x2880`检查edge `+6/+8`端点所属。敌城由`0x28A3..0x28C2`建立接触并CLC返回，因而不会执行`0x275F..0x2774`的候选坐标/指针写回。

原始`MMAP.MAP`与E717生成资产交叉扫描进一步闭合位置：254条edge的首、末点共508格全部为`0xCE..0xDD`据点边界tile，5526边点中没有其它中段命中。初次入边时`status bit0`尚未置位，故可进入起点侧首格；抵达敌城侧末格前bit0已置位，故攻城军团停在**末格之前一格**。边点列仍不包含edge `+6/+8`端点据点中心，因此驻城军团不会被`0x2831`扫描，随后由`0x2880→0x4ADE→0x4C72`选择节点中心真实守军进入攻城：

- 首次接触：置军团 `status bit5`，`+3 = 0x0C`；
- 后续每个该军团逻辑更新周期，`+3` 递减并以低 2 bit 切换四相接战图；
- 道路轮询到期且`+3 > 1` 时调用 `0x2F5(AL=3)`，最终是 `int 61h, AH=5, AL=3` 的 YNSOUND 音效；
- 道路轮询到期且`+3 == 1` 时分别进入 `0x4A7B` 野战或 `0x4ADE` 攻城；名义倒计时为 12，同轮尾部可能立即减到 11，不能直接等同于 12 天；
- 双方均非玩家，或玩家军团设置 `status bit2 (0x04)` 时，直接进入 `0x5130` 战略速算，不进入战术场景；速算本体没有额外 PC speaker/int61 播放；`0x5130`在`0x5192/0x51A1`对双方分别调用`0x474A`，后者经`0x6FD2→0x701D`固定写`+0x0B=1`，所以下一次该军团槽在`0x25C1`减至0后同槽立即执行`0x2662`。野战胜方不得额外停顿，P24以真实`moveDelay=1`在下一槽到期，不再使用旧cooldown等值模型；
- `0x2662`只依据军团现有目标节点推进或调用`0x4325`；无目标驻军不存在“发现相邻敌军便走出据点迎击”的通用分支。目标只能由`0x3EFD→0x4155`或命令状态机写入，故真实守军应保持据点中心坐标，供攻城入口`0x4C72`选取。
- 玩家城池被攻陷时，下游 `0x4F71` 会调用 `0xCE7` 发出两段 PC speaker 警告音，再显示战报。

### 6.3 败退抵都补员与兵力不足解散

- `0x474A`重算六队总兵；士气0、第一队0或无退路时才不能撤退。成功选择即时退点后，总兵`<=0x012C`（显示<=3000）或退点就是首都写状态10，否则状态8。
- `0x44A9`令状态10锁定所属势力首都；抵达后无兵力/士气门槛转状态9。`0x4499`无条件执行`0x461D`补员、`0x6FD2`重算总兵，再转状态3；该抵都补员全链不读取`legion[+6]`士气。
- 玩家手动指定首都同样由`0x7FDB`先重置为状态0；抵达后`0x4370`以总兵`<0x258`转9，下一军团槽再重编。Web若沿用战后状态8，会先等待士气封顶并延迟补员。
- `0x4717`以`unit.type-1`索引势力`+4/+6/+8`，先把六队残兵并回对应池并清零。结合`0x5F7F..0x5FA1`资源面板顺序和ICONGRF三行剪影，原始码实锤为`1=骑→+4`、`2=弓→+6`、`3=步→+8`、`4=空/跳过`；旧Web的2步/3弓映射错误。
- `0x4698`统计各兵种剩余队数，并按队伍原顺序分配`min(100, pool/remainingTeams + pool%remainingTeams)`；每分一队从池中扣除，故余数优先同兵种前队。不同兵种不互借，全程0 RNG。
- `0x4325`仅按军团势力是否为玩家决定状态0..7是否把命令表索引偏移4，与委任位无关。NPC补员后状态3因此进入`0x4466`：任一队内部兵力`<30`（显示<300）就转11，六队均>=30才转8。状态11在首都由`0x463E→0x4651`解散并把残兵归池。
- 玩家势力包括委任军团仍走`0x4370`：总兵`<600`且目标为首都时继续状态9补员循环，不走NPC自动解散。后备不足不会凭士气或总兵阈值强制解散。
- 原版没有“现有败军优先使用新月预备兵”的全局策略：`0x1D0B`每次固定先`0x3EFD`据点AI、后`0x25A3`军团槽，月界的`0x5358`又在该轮二者之后才入账预备兵。所以下一战略tick，受威胁空城可先经`0x40C9→0x4575→0x45C1→0x6E8F→0x461D`在首都编成新军并消耗兵池，随后轮到状态9败军时只能使用余量（甚至只重分自身残兵）。状态9不会因池空停留等待下月，而是照常转3，再由NPC状态3的逐队门槛进入8或11。

## 七、当前 Web 实现与原版差异

> 本节含历史实现摘要，不是当前认证清单。现行字段/槽/保存分别以§5.5、AI全链P24及§3.10为准；detached v2战后原caller以§3.11为准。下述固定端点、独立倒数及二进制存档叙述不恢复旧规则/保存接口。

当前实现：

- `web/src/game/roadgraph.js`：装载 192 节点/254 边原版拓扑并执行加权 Dijkstra；
- `web/src/game/ai.js`：据点目标沿当前道路边点列推进，敌城边界在写坐标前接触。旧“耗尽边点后必另等下一槽切节点”的原版一致声明撤销：`275F`提交候选点后，同次`2783..279E`依flags bit6/stride进入`27A2`，可立即写城中心/node；真实末点flags04配+4、首点44配-4均如此。城前胜方没有结算瞬移，下一次到期动作可从剩余边点直接完成这一接续；
- `web/src/render/mapview.js`：只读导航点列绘制路线，使用原版 24 槽×5帧标识；
- `web/src/ui/gamebar.js`：小地图路线同样沿点列绘制；
- `web/src/game/pathfind.js`：旧 bitmap A* 仅保留给非据点临时威胁/撤退坐标的兼容路径。

尚存偏差：

1. 默认v1仍为固定端点近似；detached v2已按§3.11接原双stop/CF语义，但生产未启用。原队列平权、word费用回绕和容量仍需逐路径认证；
2. 战后撤退已改为“当前道路格→所在边两端→己方据点”的原版拓扑候选搜索；日常 AI 的临时四邻避敌坐标仍保留旧格点 A* 兼容路径；
3. `0x474A` 与 `0x291A/0x2977/0x29C3/0x2A7E` 已接入 Web 运行时：战术/速算结果均回写六单位和士气，随后检查士气与第一单位；败方按道路拓扑选择己方据点并进入强制撤退状态；无有效路线时按君主/同势力/中立/`general[+0x1F]`随机门槛进入Web独立倒数队列（旧固定48次原版一致声明已被[全链P01](re-notes-ai-chain.md)撤销，活动槽返回差异尚未修复），否则被俘，原势力灭亡且特殊bit置位者永久退场；二进制存档会把该队列还原为`status=8,+3=countdown`槽；`+0x23=8/10` 的状态行为及 `+0x1A/+0x1C` 占格 far pointer 已闭合，原版UI专名未证，保留中性名；字段、写回及异常快照边界见[自定义数据基础军团表](re-notes-custom-data.md#legion)；
4. 野外道路段军团相遇、接敌倒计时和攻城等待动画已接入：进入下一道路点前先判占用；候选格为末端`0xCE..0xDD`据点边界tile时再按edge端点城主判攻城，发起军团均停在原点并建立11→1接触状态，防守军团不被同步置状态。Web现按用户批准的固定100ms/200ms独立音画节拍绘图/发声，规则倒数和道路轮询不受影响（详见音频证据）；结算只用单RAF gate串行化，不再等待音频或追加专用四相；野战胜方在下一次自身槽立即续行，不追加Web冷却；
5. 攻城战略速算已接入`0x5130(AL=0)`：先由`0x4C72`选择同城真实主守军并回写其六单位/士气；仅无守军军团时，城池才按`0x4F8A`展开为六个步兵（原始码3）单位、士气`0xFF`、特殊主将索引`0x7F`。只有攻方`0x5285`临时使用权重行3，攻守双方`0x52D7`均保留模式0并取攻城专长。该索引直接指向128×32B武将表的第127项；五库20章（含改版，官方仅原版4章）的该项均为固定占位档案（攻城/野战/水战专长0，武力/统率/政治8），Web据此使用显式8/8/0档案，而不依赖解析器是否显示占位姓名；守方使用权重行0并把城兵`+0x13`再次作为守城附加值；`0x52D7`末段16位`MUL`、字节重排及两次`RCR`已化简为`((u32(basePower)*modifier)>>10)&0xFFFF`；`0x51B3`每场在六队循环前按`((0x3F-ratio)&0xFF)>>2`只扣一次城兵、上升率与防灾；逐队败损除数/播种和仍未闭合的占城AI差异见[AI详细维护源](re-notes-npc-strategy.md)；
6. 破城后的同城守军已接入`0x4DA4`组撤退：据点先易主，按军团槽顺序取`BP[0]`代表求一次道路撤退目标，全部原守方军团共享目标城/节点、各自清除路线缓存后重新寻路；实际参战主守军先由`0x474A`转状态8，其余军团保留原`+0x23`。`0x4DA4`不得复用单败军助手整组写8或追加12槽冷却；无有效路线则逐军团进入`0x291A`。攻方失败不再使用`_bases`历史瞬移或固定一月监禁链，而统一走`0x474A/0x487B/0x291A`；
7. `0x8CFF`会原样写完整状态段，途中`+0x0A stride/+0x0C point address/+0x0E edge-or-node`均进入SAVE；`0x8AEA`只修复`+0x1A/+0x1C`地图far pointer。Web按E717固定布局（node 8B自0、edge 0x10B自0x0800、point 4B自0x2000）恢复已知当前边；字段无效/缺失不能靠重寻路猜回原历史，准入与残留兼容边界见§5.5。抵达后`+0x0E`必须改写为目标`nodeId*8`并独立保留`+0x14/+0x20`到下一槽；Web的`targetNode`单位混用仍待修复，不能把“运行态已统一id”当成现状证明。`0x4DA4`字段已闭合为`+0x20=目标城、+0x14=目标节点、+0x0B=1、status|=2`；
8. 玩家战术城损旧乘4结论撤销：`A699`始终返回原最小metric，乘4只用于D315；实际扣量还须取移位结果DL。当前正式实现存在错误，原始输入输出和待修范围见[战术城损勘误](re-notes-tactical-rules.md#241-a65d返回值与城损勘误)，不能凭已有Session/golden宣称一致；
9. 玩家「委任」目标现作为权威行军命令优先执行，军团先沿原版道路抵达玩家所选据点，随后才进入自主决策；委任军团参与战斗时走战略速算而非强制打开玩家战术层。

## 八、实施记录与剩余验证

> 以下为早期历史，不把旧Dijkstra对照、未分CF语义或旧资产发布叙述用作现行原caller认证；当前详细边界见§3.5–3.11及§5.5。

1. **先建立原版构图只读探针**
   - 逐段复刻并验证 `0xE4CE..0xE992`，先输出据点起点、道路点列、边候选和分类统计；
   - 不在点列终止条件、特殊 tile 与边端语义尚未验证前直接替换运行时寻路；
   - 已新增 `tools/probe_march_topology.py`，可再生输出诊断 `web/road_graph_probe.json` 与审查图 `docs/march-topology-probe.png`；完整 probe JSON 不纳入版本库；
   - 当前探针已验证：192 个节点种子与 192 个唯一据点坐标完全一致；`0xB8..0xDD` 共 5718 个候选格；与旧 `road_cost.bin` 仅重叠 5411 格，旧 bitmap 另含 15466 个非原版分类候选格；
   - 已逐指令转录 `0xE57F` 的一/两格种子探测、`0xE81C..0xE992` 的点列追踪和 `0xE77D` 的反向边去重：得到 254 条双端均可解析、反向记录全部匹配的道路边，点列长度 6..84，总点数 5526，诊断异常为 0；192 个据点组成单一连通分量，度数分布为 1度×1、2度×96、3度×65、4度×30；
   - 在上述不变量全部通过后生成并版本化紧凑运行时资产 `web/road_graph.json`（192节点、254边、完整点列）；大型诊断 JSON 由 probe 工具按需重建。
   - Web 已新增 `web/src/game/roadgraph.js`，在 `loadTerrain()` 阶段并行装载该资产，并可按边长权重求据点到据点的节点链、边链、stride 和有方向点列；据点目标现已正式切换到该道路图。
   - `0x491B/0x4A0F` 已进一步闭合：节点为 8B、含四个有序 tagged edge slot；slot 的低 14 bit 是 edge 地址，`0x4000/0x8000` 分别编码边的两端。搜索队列记录为 `{node, cumulativeCost, signedStride, enteringEdge}`；成功返回 `AX=±4`、`BX=edge`、`CX=cost`、`CF=0`，失败为 `BX=0x0800/CF=1`。
   - 军团沿边移动的点记录为 4B `{x:u16, y:u8, flags:u8}`；`stride=+4` 最终到达 `edge+8` 端点，`stride=-4` 到达 `edge+6` 端点。到达节点后本轮不继续寻路，下一次军团更新才重新执行 `0x47BB`；渲染插值不参与逻辑位置。
   - 玩家`0x7F90→0x7FDB`普通行军选择会写`+0x23=0,+0x0B=1,+0x20=目标城`，并在`0x7FB7`置`status bit1`；战斗指挥清bit2、委任置bit2，只有解体写状态11。军团正在edge内时，`0x26A0`清bit1后调用`0x47BB`，保留`+0x0C`当前点地址；直接目标等edge+6/+8时写−4/+4，其余以新目标为根反搜两个端点，再按返回边决定方向（见§5.4，撤销旧“其余恒+4”概括）。这条链禁止Web清掉当前edge后从道路点启动节点级寻路。
   - 新增 `tools/probe_march_search.py`，按四个有序 slot、`0x4000/0x8000` 标签、边 visited 和 target→current 反向搜索转录 `0x491B/0x4A0F`；对全部 192×191 = 36672 个有序据点对验证：返回 edge/stride 均能从 current 物理走向下一节点，累计代价与独立 Dijkstra 完全一致（0 mismatch）。因此反向搜索返回 `BX` 确为当前军团的正向第一条边。
   - 平权时原版环形队列的精确稳定顺序，以及 `0x487B` 的势力通行后处理仍需保留独立验证；普通据点间无动态阻断的第一跳语义已闭合。
2. **建立资产验证**
   - 验证全部据点接入拓扑；
   - 对典型城对输出路线并与原版实机观察比对；
   - 验证关隘、桥、长江路线与分叉选择。
3. **替换 Web A***（已完成据点目标主路径）
   - `web/src/game/roadgraph.js` 使用加权 Dijkstra，返回节点、边、stride 与完整点列；
   - 据点到据点命令已切换为道路图，非据点临时威胁/撤退坐标暂保留旧格点路径；
   - 未开战第三方据点作为阻断节点，无路时返回明确失败，不再执行无证据的 `_feint` 闪出/返回。
4. **重做移动模型**（已完成第一阶段）
   - 军团导航状态为 `_march={currentNode,targetNode,edgeId,stride,pointIndex}`，每个逻辑更新沿当前 edge polyline 前进一个点；
   - 到达边端节点当轮停止，下次更新重新执行 Dijkstra 选择下一条边；
   - 朝向量化为东/西/南/北；最终到达时立即令 `prevX/prevY` 收敛并显示驻止旗帜；
   - 大地图和小地图路线绘制只读导航状态，不再由渲染层写 `_path`；即时快照剔除 `_march/_path` 等可重建缓存。
5. **接入原版标识与接战动画**
   - 直接使用已提取的 24 槽 × 5 帧 `MMAP.MCH` 原始标识；
   - 按势力记录 `march_marker_style` 选槽，按道路方向选 0..3，驻止选 4；
   - 已从 `MMAP.MCH + 0xA000` 的 `0x2B3C` 描述表精确合成 group 0 四相48×48动画（phase 1/3资源相同）；原版按倒计时低两位选相，现行Web按用户批准的独立固定表现时钟选相，动画和攻方标识共用城前军团坐标，动画先画、16×16标识后画；
   - 名义12同槽减11后逐槽倒数，`moveDelay/+0B`和`movePeriod/+1E`控制原版重检及发声，Web仍保留规则门控但已移除轮询直接发声、改由独立表现时钟驱动；快照保留两字段。ID3使用可复现OPL3单记录PCM原速重触发唯一通道，按BIOS相位排13/0后继并服从音乐AH7清后继边界，不叠播或预排五声；详见[音频证据](re-notes-audio.md)。
   - 野战改用独立军团防守方与战果回写，不再伪造城市；`fieldterrain.js`曾按`0x4B63..0x4C71`作以下XY近似；该完整原版认证现撤销，pointer/AL/class9占格DS别名与真实2873有限前缀见[去向§13](re-notes-legion-fate.md#native-field-terrain)：在防守军团所在战略格读取西/东/北/南/中心五个 `MMAP.MAP` 图块，经 `CS:0x982F` 的14段范围压缩为类别0..9，再用 `CS:0x97F0` 的21条有序对选择 BATTLE.MAP 目录 `0xC0..0xD5`；反向配对置bit `0x40`，实际CB9B作内部线性图块反转，不是全Canvas水平翻转；
   - `BATTLE.MAP` 目录字段也已校正：首字节才是实际布局0/1/2，次字节是主题号；`battle_maps.json` 现导出完整214项目录，野战目录 `0xC0..0xCF`映射布局1、`0xD0..0xD5`映射布局2，不再固定使用布局0；
   - 删除任意角旋转、独立势力染色和臆造的 4 SVG 循环。
6. **连接战斗触发**（已完成）
   - 道路野战、真实驻军攻城、无守军临时城防、委任速算及玩家战术入口均已连接；剩余工作是原版动态路线平权抽查和完整浏览器战局回归。

## 九、验证要求

- 纯函数测试：拓扑生成、Dijkstra、平权路线稳定性、不可达、动态封路；
- 资产测试：所有据点映射到图节点，边的 polyline 始终落在道路 tile；
- 状态机测试：下令、逐边推进、换边重算、到城驻军、路断失败；
- 渲染纯度测试：绘制前后军团逻辑对象不变；
- 浏览器冒烟：军团从多个典型据点出发，全程贴道路、有四方向、不会穿山越河或切弯；
- 原版动态比对：至少记录三条分叉路线、一次跨江、一次不可达/堵路行为。
