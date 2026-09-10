# 战术启动 / 对象生命周期有界修复（2026-09-07）

## 来源与范围

本批独立读取 `E:/Dragon/Dragon/KI.EXE`（SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`），使用 `python -B` 导入 `tools.disasm.va_range`；文件偏移为 VA+0x200，near target 按16位IP回绕。核对 A04B..A155、A1C5..A425、ADC8..AE34、B240..B532、B97E..BA2D、C315..C3FE、C48F..C4D1、ECE0..ECFB。C3B0 的 `E8 A8 43` 到075B，BA27到02F5；A282/A28C是1000:0000 far function5鼠标按钮计数读取，不是音效。既有动画审计为线索，以下规则由重新读取的原始指令确认。

上批只修启动控制流、D318/marker比较与清除、BA0D、B240末尾、B360及其只读人员投影。此前追加B413、B240/B3B2 surcharge及terrain bit02、B8AA初始偏移/层位、BD46反向搜索与回溯，后续闭合B5B7/B799/B824墙破坏链、C315语义与现代3秒表现；A1C5已改为逐A04B/A065规则帧yield。本轮再按独立启动/display审计激活有界B941原生参考历史并闭合启动期9FDC非局部结束；下列未闭合残余仍禁止扩大成整场忠实声明。

## 2026-09-08 生产激活：99CB / B941 / 启动非局部结束

- 99F3先写原始相机`x0=36,y0=14`；DC9D尾段变换为`E160=x0+y0=50`、`E162=SAR(y0-x0,1)+32=21`，故生产32×30 cells固定使用`column=50,row=21`，与现代拖拽相机完全分离。99C2直接DC9D建立cells，99CB按E00..13E0升序对byte0>=C0属性执行BB10 capture后`(+1B+1)&3`，随后原生参考DDB4；该边界0规则RNG、0 A065/ADC8/D318。`D348`仍为1，首个A065再次DC9D后清零，不能合并两次refresh。
- 常规A065在A6FA通过后才执行B941。效果1400..17E0（Web池0..3E0）升序执行B97E→BA2E→BAB7；旧坐标DB9B先于存活新坐标DB34。四个code210/211/214/215分别固定映射SCH单半336/337/340/341。随后属性BB10；ADC8人员擦旧pair/画capture到相邻`+2`channel；一个规则边界只提交一次DDB4。终止A065允许前置DC9D/A12A，但无B941/ADC8/DDB4。
- Session快照保存battle cells、ordered operations、boundary、BB10/BAB7现代capture及once-only初始提交状态。仅供测试/调试的活动战斗checkpoint把Session、BATTLE VM、A0F2小数相位/首帧标志与`OriginalBattleDisplayProcess.snapshotBattle()`的scratch/framebuffer/known-mask/boundary配成一个不可拆分元组；只允许A1C5结束后的静止边界，恢复时重置RAF墙钟基准并校验Session/process boundary相等。它不进入IndexedDB或正式存档，活动战斗仍禁止保存。App shell持有进程级scratch：KI文件冷启动零种子，只初始化一次，跨battle/title/load保留；每战另建cells/framebuffer/known-mask。首DDB4前直接VGA/UI像素仍未知，buffer中的零只有存储意义，known-mask为0时不作原像素声明。
- 原生DDB4只消费原始边界：23×15、dirty/bit08、五邻、双channel、DFBB忽略mask写512pixel且不改scratch、慢路持久scratch均保持。现代完整场景不遍历扩展native grid；只读取实际BB10/DA1C/BAB7 capture，现代拖动仅改变Canvas裁切。因而屏外遮挡属于批准的现代投影，不声称唯一原版VGA图像。
- 9A92令D31C/D31D低byte均FF；9ACE不得写初始化活动计数。首个ADC8重建，故新局初始空侧最早第二A065终止；双方空时先命中D31C，winner1。A6FA倒计时先于空侧，旧D3491→winner1，其它非零（通常2）→winner0。
- 9FDC以D340恢复SP并RET到1B76。实现用只在外层startup stepper捕获的私有sentinel：terminal A065计入frames，返回`done=true/ended=true/displayCommitted=false`及terminal frame result；不resume generator，故不执行调用后的HP比较、LOOP减CX、后续C315、pending reset、按钮drain或startupComplete，也不进入A426/脚本VM/开战HUD。九类A04B位置与A298门控RNG均由定向矩阵锁定。A0F2位于常规A065的B941/ADC8/DDB4之后：首个启动A065在首个启用RAF立即执行，随后才以`64/48/32/16/0`回调等待约束下一帧；A1C5转9FA0时保留小数相位，每RAF至多一帧且延迟整帧欠账丢弃。最高速只声明无额外等待及Web一帧/RAF政策，不声明原版固定60FPS。
- 仍未验收：E04A实际可达及所有间接scratch writer、首个DDB4前完整VGA/UI/cursor来源、原始TALK窗口像素、legacy缺display历史的精确恢复、扩展全世界pixel equivalence、完整DOS运行态差分。现有JS raw-byte/逐bit fixtures不是独立CPU/VGA oracle；此项继续列为残余而非虚构结果。

## 已实现（实锤）

### A1C5 启动与 CX 活性

- A1C5所有mode先执行50个A04B；非mode1直接RET，无评分、恢复命令或按钮清空链。
- A34F每方恰好2 RNG字节。A370..A374先将 `3*force` 截成byte；A376 SUB lead若借位，由A37A清DL，再右移1。不是无限整数三倍减统率，也不是负数byte回绕。评分为 `u16((roll8..15 > gate ? 0 : POWER*HP) + ((second&7)<<8))`。
- A308强者<4800：STC→A27A；否则1B7/40帧，D311+=6。弱者<4800或<强者>>1：1B9/20帧、强者1CC、A33F→A34D STC，直接恢复pending0，不进入单挑。仅应战1B8/40帧后A34B CLC进入A1E3。
- A3C3第一轮1BA/1BB；后续 `Q=1BD+4*(round-1)+(选对白时HP差<20 ? 2 : 0)`，round饱和4。A3FF十帧LOOP结束虽CX0，**A40B又写CX=Q**。A04B push/pop CX；C315 push/pop CX；ECE0只使用AX/保存DS/BX，不改CX。A298使用byteD320倒数80，不改CX。
- A298每帧后HP<70即CF1；只有counter47..1在帧前消费门控RNG，<32再消费X随机数。A219另设CX20，帧后HP短路发生在LOOP之前，故第k帧退出CX=21-k。正常跑完20帧CX0只进入下一轮对白，**不进入A264**。
- A251败者CURRENT!=5：1CC、pending0、A261 CX20。已CURRENT5直接进入A264，继承真实CX。A264执行do/A04B/16位LOOP，因此退出源A298继承Q（443、445、447、449、451、453、455、457、459之一），退出源A219继承20..1；没有正常零CX入口证据，不得固定443或65536。
- A269胜者1CD/20帧，A27A两侧pending0；事件将两次AX5标为按钮清空而非音效。暂未改变同步启动驱动/原有异常结束处理。

### A12A 计数与 marker

`INC byte[D318]`只递增低字节，保持D319；原始比较为word。**本段旧“所有marker都与同一D318比较”结论已被本批完整C3B8调用链推翻**：A12F只载AX一次，side0清除返回AX011B、side1返回011C，后续word比较使用该AX。无FFFF sentinel豁免；见文末AX勘误及138个无stub原指令执行夹具。初始/跨战高byte历史未改。C315 ADD DL,3C及C48F ADD AL,14不进高byte，但只是写目标marker，不保证固定60/20帧可见时长。

### B97E→BA0D 致命命中

- 对立活动目标CLASS0且STATE bit0清：BA2A仅终止效果，不改HP/KIND/STATE，不消费RNG。
- CLASS0且STATE bit0置，或CLASS36：强度>>2；其它CLASS全强度。
- B9F5..BA08写KIND2、STATE=(old&1)|10、direction0、flags|40，再SUB HP。JA（无借位且非零）保留差；否则BA0D先HP1，CLASS0直接BA25保持活动。仅非零CLASS执行flags=(old&10)|1、KIND4、HP0。所有分支0 RNG。

### B240 / B360 展示边界

- `AE26`：active-at-scan必调用一次B240。flags40旁路移动/KIND倒数；无40且KIND>0只倒数，到0先STATE&1；无40且KIND0运行AF69及非零status倒数。`B4AF`：只有成功补员调用一次B240。其它inactive/补员早退不调用。
- `B32D..B355`取 `u8(CLASS + ((2*DIRECTION) OR (STATE&19)))`，STATE10时direction贡献0，side1再+90。DA1C绘制此pair，然后 `B358 flags&=BF; B35B STATE^=1`。
- 新增完整active-tail边界封装，不把toggle放进被移动探针复用的 `commitOriginalSpatialOccupancy`。最后一帧DA1C输入独立存入Session `objectDisplays`，Canvas读取已捕获frame/x/y/level；旧快照或首帧尚未捕获时仅active对象使用只读字段投影。
- `AE04` inactive flags1：KIND先减1，非零→B360；零→B4B8(AH1)→B3B2，清显示、不计幸存槽。B360先擦旧图，再同步+7/+9/+B为当前+6/+8/+A；不写STATE、不提交占用、也不执行B358。
- B360逻辑pair帧：side0基84、side1基174；CLASS<24加0、==24加2、>24加4；已递减KIND<=2再加1。KIND4的四次访问为3/base、2/second、1/second、0/erase。
- B413/B4B8仍负责补员/幸存归属。补员成功状态0画normal再toggle1，替换死亡显示；无预备兵、撤退方、任一占用低7位非零均不消费预备兵、不画normal、不toggle，不计同帧AEA9活动数。

## 追加实锤与实现：B413 / occupancy（2026-09-07）

独立重读KI：B240..B532、ADC8..AF64、AB39、A8CC、C673、CC31..CC80、CAEB..CB9A、9D52..9DED、BB3C..BFF1、AD2D/AD7F、B8AA..BB3B。地址仍为文件偏移减200h；B859/BA27/AD71等near call回绕到02F5，不按线性102F5取证。已有文档/测试只用作审计线索。

### B413全部分支 / B4EA辅助（0 RNG）

- B437预备byte=0，或B43E本侧码(side+1)==D349，直接B445；SI低byte=0才以AL5调用A8CC。A8CC只接受SI<600，故**只有玩家组长显示图标5**，不写current/pending，不处理孩子/敌侧。Session记录显示图号并保留refresh事件边界。
- B452先调用B4EA，再检查双占用低7位。B4EA将Y钳16..47并同步旧Y；X写1/62及旧X；+0C/+0E写y*64+x；+1E/+A/+B清0，**不清+1F**。占用失败保留这些初始化写入但不扣预备、总数，不刷新图标、不draw/toggle。
- B470扣组预备byte，B477扣临时侧记录总数word，HP取侧模板+6；B482 OR flags88，B485 AND word[SI],00FE同时清flags bit0与KIND；STATE0。原有+13/+16/+19及目标字段不另清。
- B490..B4A3为顺序判断：`if pending==5: pending=current; if pending==6: pending=3; if pending==7: pending=0`，最后current8。因此current6/pending5→pending3，current7/pending5→pending0。不是else-if。成功后B4AF调用B240一次，仍不计同帧AEA9活动数。

### CC31段别名、B240 / B3B2以及已闭合消费者

| D2FA相对byte区 | 原段与用途 | 原始证据 |
| --- | --- | --- |
| 0000..6FFF | D2FA七个物理高度occupancy面；对象低7位与地形bit7 | BB52..BB57清7000B；BB6D..BBA5 |
| 7000..8FFF | D2FC两个导航descriptor面，不是overlay | CC38 ADD AX,700 paragraphs；BBA6/AB71/B1DC |
| 9000..AFFF | D2FE两个u8路径附加成本面（本轮overlay） | CC3E ADD AX,200 paragraphs；BC22..BC2E清1000个word |
| B000..EFFF | D300路径distance word工作区（本轮不保存为spatial） | CC44 ADD AX,200 paragraphs；BD73..BD82 |

- `HEIGHT(+1E)`是导航面码0/10h，不是物理level：初始清0，B103写10，B14A落低面清0；物理+0C可以含更高层。B240按`node=(pointer&0FFF)|heightByte<<8`访问surcharge，不能直接用+0C的层或误用+7000。
- B29B旧+0E的两个物理occupancy面各AND80；B2A8..B2AE再以**旧+1F**清相应surcharge。B2B4当前+0C双面OR对象ID；B2BF写+0E=current，B2C5..B2C8把+1E复制到+1F，再以**新+1E**写surcharge8。地址相同也必须先清后写，无early-return。
- B2D3以新pointer低12位查D2F6 tile。tile>=F0无条件flags&FD；否则D302的`tile*8`首byte>=4置bit02，<4清bit02。D302由CB59..CB71读取原始MDL `1000h+layout*F800h`，不是方向mask/图形高层。AB39随后仅在flags02且+1E非零时pending6→AB7C。空内存测试无MDL时按零初始化byte处理；生产始终安装完整800B描述表。
- B3B2退场擦除先清旧+0E双occupancy低7位；**B3F3读取当前+1E，不是+1F**，清该surcharge。随后DAAA按旧XY/level擦显示，flags&10。B4B8只有AH0记幸存；AE10死亡AH1不记。保持既有exactly-once active-tail及死亡snapshot，不给通用工具加flags40/STATE切换或renderer副作用。
- 同一alias审计纠正`originalmapobjects.js`的9D6C/9DE8/B87F：墙/障碍初始化分别写低surcharge100/50，破坏清0；旧实现错写+7000污染导航descriptor，现改+9000。未借此重写B824其余地形/occupancy算法。
- BF34/BF57/BF7C/BFA4读取D2FC:`node+2000h`的byte，保留node上层1000h位，零扩展后加当前DX。**cardinal读取已修**；不再把上层附加成本映射到低面。生产builder读取Session.spatial的实时D2FC视图，不再捕获导出navigation副本；B240写8与B3B2清0可直接改变现有cardinal搜索的distance。
- `OriginalBattleSpatialMemory`扩至B000B，snapshot/restore及originaldiff全字节blob覆盖A000..AFFF；restore复用同一buffer避免builder悬空。旧A000B Web快照只可把从未存储的上面补0：这是兼容旧Web“无上面”的状态，**无法恢复缺失的原版历史附加成本**，不宣称历史重放等价。非A000/B000长度仍拒绝。导出navigation构造扩成4000B；不修改原始JSON。

### B8AA初始偏移 / 层位（闭合并修复）

- 全程序直接call仅AD57（AD2D远程；本条spawn前1 RNG）与ADA1（AD7F近层；0 RNG）。B8AA itself不消费RNG，固定DI=`1400+(SI&1E0)+(SI>=600?200:0)`，首byte非0只STC，不另找空槽、也不写任何效果字段。
- B8C3/+14接收AX参数，+5接收BL方向，+1C接收DX code，+4接收CH强度，+2接收SI来源。B8D8清AL；BL>=80时按bit0选X/Y，bit1选择byte减1/加1。**偏移发生在B8F4/B914写8.8定点X/Y之前**，同时写+0C/+0D旧擦除坐标；旧Web先写未偏移anchor导致首帧接触与画/擦坐标不一致。
- B91A..B922：`L=u8(source.level+1)`；+A=`L<<8`，+E=L。B925..B935将AH左移4次（byte回绕），AL=调整后X，再ADD `Y*64`；因此+10/+12初值=`u16((u8(L<<4)<<8)+X+Y*64)`，**不是纯y*64+x**，也不是无条件按最高5层钳制。
- B941→B97E **先读+10进行第一次碰撞**，随后BA2E才按方向移动/积分、BA8F钳后续层、BAA9碰撞；BAB7先用+0C/+0D/+E发擦除，再更新它们及强度，BB05/+12跟随+10。新fixture用字面层位与不同低面decoy验证首碰撞，不用生产计算结果反过来安排唯一目标。
- 全效果compositor/旗帜相位/TALK仍延期；本次未添加任何B941可见图形、UI或占位动画。

## BD46完整反向搜索 / 回溯修复（2026-09-07，实锤有界实现）

本节替代此前「BFDC延期」工作单。独立复核同一hash的KI `BD44..BFF1`、`AED2..B00C`，文件偏移VA+200h，所有near target按16位回绕。先运行外部 `bd46-raw-corridor.py` 与 `bd46-live-consumer.mjs`：双平面weighted corridor原版CF0而旧Web CF1，生产AED2丢弃请求；未关闭或撤回正确的B240实时surcharge连接。

### 搜索和工作区

- `BD54..BD6E`：DX=target构造seed，AX=current及CH=导航面构造停止word地址BD44。`BD7C/BD82`每次将D300的2000个word全部写FFFF；descriptor/surcharge不改。`BDD5`在**目标**写1，DX=2，不是正向Dijkstra。
- `BD96..BDD3`：BP0且CL!=EB先试上面中心、右、左；全无方向高位才回低面中心、右、左。右/左成功时保留调整后的BX并用它作seed；与current相同返回CF1。目标附近全无方向同样CF1。
- `BDDC/BE38`：SI写端、DI读端、CX本轮边界初值4000h。队列地址为D300:`4000..47FF`，每次+2后AND47FF（1024 words）；不去重、不排序、不增补现代堆或容量策略。先处理seed，到本轮边界后DX++、CX=SI；SI==DI即无路CF1。`BDF9`读出current后在代价门槛前立即成功。
- `BE00`只有DX>当前distance才展开，否则原样重入队。按10/20/40/80/08顺序。cardinal仅先比较DX<候选旧distance，随后**无条件**将DX+候选node完整双面surcharge写回并入队，不再比较加权结果；重复入队/较大值覆盖也是原始顺序。
- `BFCA/BFCD/BFDC`：跨面先用node读对面descriptor高度，然后恢复**双倍node**，加高度差绝对值和D2FC:`2000+2*n`的byte（AL ADD/AH ADC，u16回绕）。n<800读低surcharge偶byte；800..FFF读高surcharge偶byte；1000..1FFF读D300中下层对应distance word低byte。此读取严格先于BFE4本候选写回，可能看见已访问distance的低byteFF/00/01（不是高byte）、或重复入队更新后的值。D300与descriptor/cost共用一块私有byte视图，不能预计算为边权。**勘误旧工作单的FFFF描述**：上面候选n的alias恰为当前下层source的distance；BE00只有DX>source distance才展开，因此合法搜索该alias不可能仍是未访问FFFF。候选destination本身可以FFFF；alias byte FF可来自已访问distance=00FF/01FF等。raw trace同时记录source distance、alias byte和候选旧word，测试明确区分，不能伪造未访问source来满足旧待测设想。
- `distance`返回字段只是Web诊断用的**BE4A入口DX**；不声称原版公开返回distance。工作区不是持久session/RNG，生产依旧只把CF/AL路径交给AED2。

### 回溯、输出和消费

- `BE4A` DX-=2，从current开始，AX恢复current坐标。`BE5A`横向西/东优先，后纵向北/南；`BE75`尽量保持上一轴。相同轴连走只更新坐标，不输出每个tile；换轴前输出当前AX，即使随后只是遇到成本空档也保留这个词。
- `BEE0..BF13`无匹配时总读**上面descriptor** bit08；有connector则先XOR BH20切换word地址，即使BEFA比较失败也不恢复BX。成功时DX取对面distance，输出word `80 | signedUpperLevel<<8`（上行正、下行负，是上面level而非两面差）。恢复坐标AX，DX--；非零重试BE5A。无connector/无匹配同样DX--重试，不能返回CF1。
- `BF16`末段输出终点；`BEB5/BF19/BF23`达到64词也返回**CLC**和AL64（合法截断前缀，不是失败）。未达到容量时AL是实际已写word数；不额外补当前目标或插入逐格词。
- 字面corridor：y1/x1..4两面descriptor=20/30/30/10。current0101,target0104：无surcharge→CF0/AL1 `[0104]`，BE4A DX5；x3当前面cost8→CF0/AL2 `[0103,0104]`，DX13。cost8不是阻断。
- `AED2/AF41/AF44`只在CF0写AL到+17，随后B00D先减剩余再取+16偏移路径word；坐标word写+10/+11，80词写+12（负level钳0）。`AF99→AF65` AH0，同次向新词移动，不能再消费第二词。实现原有正确消费者未改；新增生产测试验证它们实际接受新输出。

### 可复核测试与限制

- `tools/bd46_raw_oracle.py`是**测试专用有界指令解释器**：Python capstone解码认证KI字节，独立1MiB内存；无KI call stub，无中断/设备/DOS依赖，非产品运行时。仅允许BD46..BFF1及明确指令/分支子集，未知或超过2,000,000指令立即失败；CF/ZF/SF/OF、byte/word回绕及near return/call实执行，PF/AF未建模且本段无消费者，DF由CLD固定。不是通用8086或DOS受控运行证明。
- 原外部oracle将整个KI file body复制到CS基址，文件长1061Bh，多出的末段会落入ES descriptor开头（并非声称的全零）。本地oracle只装载一个64KiB CS段，ES只由显式fixture填充，避免端点测试被泄露文件byte污染；四个原始corridor输出不变。
- `verify_battle_original_bd46.mjs`：45组原始差分，逐组对CF、CF0时AL/words、BE4A DX及全部D300 distance+ring byte SHA256。包括双平面plain/weighted、端点中心/右/左/无路/相同、同分与axis、64词CLC截断、ring环绕、vertical双向n=000/7FF/800/FFF/1000/1FFF别名、253/254/255成本造成distance跨byte、候选首次写/重复写，以及16组固定生成双面带权图。实际覆盖321个raw指令地址；不以地址覆盖宣称全输入等价。
- `verify_battle_original_bd46_live.mjs`：实际createFieldBattle、BattleView装配的原始BATTLE.DAT VM及生产IO、A426/A065/ADC8/B240/AED2/B00D/AF65，不stub规则回调；仅HUD通知记录在测试数组，无DOM/浏览器。双面writer写cost8、snapshot独立/原buffer恢复、队列首词0103、剩余1、B3B2清占用后逐帧移至2/3/4、消费第二词同帧移动及耗尽保持offset4；全程原始RNG snapshot不变。未执行全场战斗、全原版运行态或垂直移动绘图等价。
- 已修旧navigation/path integration逐格输出和relative-level预期；不能继续将旧测试当原版规则。

## B5B7 / B799 / B824 墙破坏链（2026-09-07，实锤有界修复）

独立完整读取occupancy review `943330a8-16f3-4cec-98ab-e9b8147fd850`及BD46 scoped-PASS review `f2e9e3d4-d36b-46f5-8291-5189507c1632`。重新认证本节开头同一KI hash，读取`B533..B617、B799..B8A9、BB3C..BD43、9D52..9DED、A96D..A987、C4FA..C5D6、C653..C672、A065..A07F、DC9D..DD21`，near call按16位IP回绕。`B859 E8 99 4A`实为`02F5`音效优先级/INT61门控，不是线性102F5；不是TALK调用，也不进入ECE0。以下仅声称规则内存/原版canonical RNG边界，不声称声卡或VGA逐像素模拟。

### 入口、分支与写回

- AF69四向/层移动探针返回非零occupancy ID时才走B533；`DI=(ID-1)<<5`，DI>=C00进入B5B7。B1B1先检查两个物理面低7位，再检查第二物理面bit7，最后读取D2FC相应导航面；不能用导航高位替代物理阻挡。地图对象接触最后`B612 POP DI → B613 C653 → B616 CLC`，**包括wrong-side/inactive路径**，故请求去重排队但这次接触本身不提交坐标。
- `mode!=0`直接B5EB。mode0、D35<80时SI>=600直接B612，SI<600且direction0则B5D3写METRIC0；D35>=80时SI<600直接B612，SI>=600且direction2则B5E6写METRIC0。其余方向仍走正常metric检查。**方向归零是实际word写回且发生在active门控之前**，inactive也能被归零。旧Web错误地先返回inactive、wrong-side仍递减，方向清零又只改局部变量，均已撤销。
- B5EB flags<80只排队；活动且metric非零只DEC，1→0该次仍不破坏。mode0且kind1另调用C407旧城壁提示呈现链（其完整窗口/TALK不在本次修复）。活动且入口metric0调用B799，返回后仅命中对象flags&7F；metric不另改。B799按目标**+8 Y**扫描C00..DE0固定16槽，所有同Y对象都调用B824，无kind/active/bit0过滤；目标若在16槽外且无同Y记录则不改tile、不置D348，只清命中active。
- 玩家按钮突击2经A7B7切换、A96D/A971广播与刷新、A979 mode0门控→A981/B7CB；B7CB要求`(SI<600 ? 80 : 0)==(D35&80)`，扫描同16槽，只有kind1、flags>=80且bit0清才B824。该入口不写metric、不清active。重复命令切换会再次扫描，但bit0已置的墙跳过；不能把B799的无过滤规则套给B7CB。

### B824内存顺序（不能重建导航）

令 `n=word[obj+10]&0FFF`，`count=byte[obj+1A]`（已初始化墙/障碍span>0）。先flags|1，对每个n、n+40h…依次：

1. `B848..B857`读取当前D2F6 tile：<F0就byte加10h并发音效4，否则byte加8并发5；按byte回绕，不按kind判断，不做幂等保护。D0→E0→F0→F8→00可因不同同Y对象的后续接触反复发生。原始合法span输入之外的CX0/跨地图坏记录不由本批夹具宣称等价。
2. `B85D→BB6D`按**新tile**的D302八字节描述刷新七个物理面bit7；低7位原样保留。tile非0时依次读`tile*8+1..7`：属性在1..6F置bit7；0或>=70清bit7。`BB7F/BB81`的tile0特殊分支不递增BX、不读属性，七面全置bit7；旧Web错误清bit7已修。
3. `B861 XOR AL,AL; B863..B87A MOV`把D2FA:`n+0000/1000/2000/3000/4000/5000`六个byte写**literal0**，不是AND80只清ID。第七面`n+6000`保留步骤2的bit7及原ID。示例七面原值A5，属性+7为1时最终`00/00/00/00/00/00/A5`；属性+7为70时最后25；tile0无论属性都是A5。
4. `B87F ES:[DI+9000]=0`（反汇编显示有符号`-7000`，16位offset为+9000）仅清**下层surcharge**；SOURCE可带2000物理层，但DI已mask0FFF。上层`A000+n`不清；D2FC的`7000+n/8000+n`都不改。此前9D6C/9DE8写lower100/50的正确地址保留。
5. B88B/C4FA→C51E只绘小地图像素，B799/B7CB尾段C577/C5AE同样只是VGA标记；产品已取消小地图，本次不恢复任何UI。B890..B89B增加Y/三个指针40h并LOOP；B89D才写D348=1。**空B7CB扫描或B799零匹配不会执行B89D**；旧Web无条件置redraw的差异同步修正，保留既有非零D348。

**撤销任务初稿“both navigation layers rebuilt”的假设（主管已批准依据raw修正）：两个D2FC导航descriptor面必须保持原值，不得重建。** BBA6完整构建及BC22双surcharge清零的直接call仅在998F初始化，BB3C仅9992初始化；BB6D直接调用仅BB5E初始化及B85D破坏。A065消费D348调用DC9D/DD22画地图并清D348，不执行BBA6。六物理面的释放让B1B1/B15D/B186通行，tile新值参与上面B20B/垂直>=F8检查，下层surcharge清零改变实时BD46搜索成本；这些效果不需要也不允许附加导航刷新。保留原版可能留下的描述/成本，不做“合理性修复”。

### 回归证据与边界

新增`tools/verify_battle_original_wall_clear.mjs`认证KI完整SHA256、固定指令byte块及上述near-call回绕；它是**raw地址导出的字面fixture，不是新增8086解释器或DOS运行差分**。

- 30组七面byte夹具：D0/EF/F0/F7/F8/FF分别按实锤变换，+7属性0/1/6F/70/FF；每个span两格，SOURCE带2000，每面预置bit80+ID。比较**整个B000B内存**，精确锁六面0、第七面结果、相邻格/两descriptor面/上surcharge未改、下surcharge0及flags/metric/音效ID/零RNG。
- 576组B5B7：mode0/1/2×D35 bit7×两侧×四方向×inactive/broken/active flags×metric0/1/5。验证真正metric、active/bit0、tile、D348、C653排队与CLC及完整RNG snapshot；不是只检查返回值metric。
- B799固定前16与+8 Y、kind0/2/active清/bit0置仍改、17槽与邻Y排除、D0反复到00、仅命中对象清active、后来同Y对象再次破坏；B7CB只筛活动未破kind1、metric/active保留、重复/空扫描不添D348；16槽外接触无同Y路径同样不添D348。
- 实际createFieldBattle facade + BattleView装配的导出BATTLE.DAT VM + production IO、玩家queued突击→A426/A065/A96D/B7CB/B824；后续上下两descriptor面的BD46/AED2/B00D/AF65逐帧经过破坏格，没有stub规则handler/VM/builder。字面corridor current0101/target0104，下层cost100→0令DX105→5、words `[0103,0104]`→`[0104]`；上层cost8保持、DX13/words `[0103,0104]`不变，但两面的物理路径都可以走到x4。第七面E1保持。D348下一帧被消费，完整RNG snapshot不变。
- 另一路真实ADC8移动接触B533/B5B7/B799：首次CLC仍停x2，tileD0→E0、target flags1、C653排队；下一生产帧AED2取路并进入x3，再到x4，0 RNG。ADC8当前不把接触事件展开到facade UI事件，本测试按真实规则写回断言，不虚构通知。
- BD46规则代码只改review提出的BFDC注释：upper alias是**已访问下层source distance低byte**，合法BE00展开不可能读未访问FFFF；FF可以来自00FF/01FF。其已通过独立review的reverse workspace、队列、压缩、surcharge消费、snapshot与lifecycle不变。

## 持久待修清单（2026-09-08当前边界）

有界99CB/B941/DDB4参考历史、属性相位、人员双半帧、四种投射物单半帧、A1C5逐帧yield及合法9FDC非局部结束已经生产接线；这不等于现代2048×1088拖拽场景取得原版逐像素等价。

### 其它明确延期

- C315原始索引/slot人物/栈参数/两侧替换/低byte marker与AX顺序已经实现；用户批准的全局3秒窗口只是现代呈现政策，原始TALK窗口像素仍未复刻。C407保持原始marker语义且不接入3秒对白。
- E04A实际可达及所有间接/别名scratch writer、首个DDB4前完整VGA/UI/cursor来源、动态scratch普遍收敛、legacy缺display历史恢复、扩展全世界pixel equivalence仍未验收。
- B533完整伤害/交换、命令9/10生产可达性以及完整DOS运行态固定种子差分仍需独立审计；不得以当前有界fixture概括整场所有分支。

## Display追加独立证据（2026-09-07历史取证；生产激活结论见文首）

来源：外部独立review `e4badaa3-a79f-4920-97c4-3ab4a94d8c98/b941-render-review.md`，调查 `96dcc0c6-9dc7-4869-a4fe-45da1c44ac11/display-reachability.md`、`display-history.md`及其raw/fixture。以下是有界研究结论，不是生产激活许可。

- directory2原27节点构造有**六个（不是七个）**节点不在初始化13条墙/障碍固定SOURCE/SPAN支持域：812、1452、1708、2412、2604、3308。固定记录的B799/B7CB/B824再多调用也不能写这六格；不证明其它动态路径不可达。仅C20五格反复五次的较小诊断仍可形成scratch差异，但同样未证明合法生产序列。
- genuine-initial-ID、固定记录、无其它occupancy写者的terrain-only子系统中，每条记录至多改一次。13条记录的**8192**个零/一次子集，以4745空间块/4946局部赋值证明mask全覆盖；不涵盖人员/效果/22个属性、窗口、记录变更或完整occupancy来源，不是全部动态安全证明。
- 214目录及字面镜像共**428 variants**初始化最多15条墙/障碍，未触发raw分配16槽边界。9D81/9DF3是各自分配后的检查，9DA1无入口容量检查；不能概括成全局预分配16上限，也没有官方触顶样本。当前builder边界差异本批不修改。
- CS:E164除E085/E0E1外另有**E04A**整256B颜色覆盖writer；未识别调用者，不能写成已证明不可达。文件初始零、两次D971清heap cells均不证明每战scratch清零；全程序间接/别名写者与跨战历史未闭合。
- 99F3置D348，99C2直接DC9D不清它，首A065再刷新；D9D1窗口bit8与DDB4跳过会改变scratch历史。扩展场景遍历不能拥有或覆盖native历史。此处“dormant/暂停”是2026-09-07当时的历史结论；2026-09-08仅在文首列出的有界原始边界激活生产，仍不补零、不扩大native遍历、不缩小现代UI/全场1:1拖拽，也不恢复小地图/双箭头。

## B941 native compositor（2026-09-07历史checked partial；后续激活见文首）

**本节记录生产激活前的审批与取证状态。** 当时只交付未接线模块、无损资产与证据；后续已按文首边界接入Session/99CB/BattleView。动态scratch全域与现代全世界像素等价仍未闭合，因此本节及后续激活都不宣称整场逐像素完成。

### 独立原始证据

完整读取指定animation/TALK audit、lifecycle及wall-clear accepted reviews，再认证原始文件：

| 文件 | bytes | SHA256 |
| --- | ---: | --- |
| KI.EXE | 67099 | `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868` |
| BATTLE.MDL | 194560 | `3522f7362f928fae45c1431a9efe57e285250d9db05d04ebdcb59f420e3e0bd3` |
| BATTLE.SCH | 115200 | `2ddad3e90d2e6c6c2e0d7e278e2a07254374e7bd7f4e34d4405599ce76f5ec0b` |
| BATTLE.MAP | 877056 | `8bbb2867ed526a2dcd2fcc1e0202a93952dcd113d3720936fd7304fd9e3ef872` |

VA=文件偏移减200h，near target按16位回绕。重读B941..B97D、BAB7..BB3B、DA1C..E156、D958..DA1B、9970..9A32、9ACE/9C45/9CB3/9E10、CAB7..CB98、CC31..CC80、A065..A0F1及B240..B35F。DC02是自修改数据byte，**DC03才是入口**，不能从DC02连续解码的假ADD读参数。

- D958的E15A=D302+80 paragraphs指向MDL图形首条，CC59..CC62使SCH紧随192条MDL；graphics word C0对应SCH半帧0，不是32×32逻辑帧。D958→D971清display 7800B（32列×30行×32B），不清CS:E164。
- **99C2 DC9D→99C5 9ACE→99C8 9CB3→99CB B941→99CE DDB4**。9ACE清1800B对象/效果池，9C45初始化96槽但不画DA1C；9CB3经9E10生成属性及rng&3初相。故99CB效果池空，只首次画属性并推进相位，不跑A065/ADC8、不增D318、不额外RNG；之后才A1C5的原有50帧。此边界补齐方案已获批准，但因下述显示历史阻塞**尚未实现**，不能多tick补图。
- 常规A082 B941先按1400..17E0扫描byte0>=C0，B97E接触→BA2E移动→BAB7，即使接触已清40也继续移动/erase。再按E00..13E0扫描byte0>=C0属性，经BB10画后INC +1B/AND3。ADC8在其后；DDB4在本帧人员draw完成后。
- BAB7先DB9B旧+0C/+0D/+0E，随后存活者复制当前整数+7/+9/+B、调整强度、DB34(code=+1C)、+12跟随+10；结束只清首byte。AD57 code210/211→SCH336/337；ADA1 code214/215→SCH340/341；**四者都是单32×16半帧，code在生命周期固定，不组合32×32、不按墙钟轮播**。
- BB10 level!=6：code=base+2*phase，DC03画pair；level6：code=base+8+phase，AH1单半。base150/204对应SCH144..151/324..331 paired及152..155/332..335 single，捕获pre-increment相位。新增独立BB10函数尚未接生产Session。

### cell/象限/擦除链（实锤有界实现）

DA1C/DB34/DC03：column=x+y-E160，row=((y-x) SAR 1)+20h-level-E162；native拒绝column<0或>=31、row<0或>=24。cell=(row*32+column)*32；+0为dirty/selection/禁绘位，+1最高显示height，+2 terrain floor，+3 terrain max回退。模块仅声称初始化有效高度/显式边界输入；损坏word/越层spill未认证。

- **效应/属性和terrain共用word通道**slot=cell+4*(z+1)，height=2*z+1；unit在slot+2。DB34仅空slot且height>=floor才写；DC03允许覆盖，仍受floor门控。禁止独立效果overlay/depth猜测。
- pair本cell先画code+1下半；上cell减400h、slot增4、height增2画code上半；顶行只保留下半。DAAA擦两个unit slot；DB9B只清effect/terrain slot>=C0，不按effect身份擦、保留普通地形word。若height>=max，max回退cell+3而非重新扫描其它对象。
- DD22按base cell向前遍历，七描述槽逐行上移，slot增4、height0/2/..12，并清unit通道。非零sprite<20h设floor/max，>=20h只设max，0不设；保留原始dirty置/清分支。
- DDB4输出23行×15块32×16，即480×368，VGA A0C8相当屏幕y40。中心奇列1..29；左右cell±20h、下左右+3E0/+420共同决定dirty/max。中心bit8禁绘；五格OR<40不画；画后清中心/左邻C0位，行尾及末行偶数格依原地址清。
- DE95每层固定**左BR→右BL→本格full→下左TR→下右TL**，每格channel0后channel2，再slot+=4。E0E1源象限30/20/10/00对应scratch目标00/10/20/30；单半奇列top=16*row、偶列top=16*row-8，pair上半再减16，level仍是16px。并非whole32×32 blit。
- D98B/D9AF为cell selection置/清例程（本轮直接call扫描无引用，不证明间接不可达）；D9D1用矩形bit8禁绘/恢复服务C315/C407等窗口。模块只实现已有bit8/selection的DDB4消费者，未接窗口生产者。DF49 highlight门控取INC DX/SHR后DL20，再按本格、左、右、下左、下右的实际bit20叠加MDL0。

### mask与scratch勘误

E085/E0B1..E0D5是(dst AND NOT mask) OR color，E0E1是象限版；**DFBB→DFE8→E011快路忽略mask直接写VGA，不写scratch**。DE95使用持久CS:E164..E263四面256B scratch，无逐块/逐帧清零，DFA6把它输出。

**撤销本轮早期“真实mask外color非零”的错误前提**：全3×192 MDL+360 SCH=936条认证记录，四平面每byte均满足color & ~mask == 0。主管已撤销要求不存在的真实非零样本；测试全量锁0，另以显著synthetic record验证一般OR语义，不声称真实资源/可达画面。对这些记录，E085覆盖自身可由正确alpha表达，但同一alpha-blit不能替代DFBB：**MDL0 sprite8仅58mask bits，快路仍写512pixel，其余454写色0清背景，不是透明保留**。共享scratch/象限/顺序另须独立保留。

export_battle_display.py精确导出web/battle_display.bin的299520B：三套192×140h MDL raw，再接360×140h SCH。无header、无裁色、无PNG读写；资产尚未被产品load/fetch。

### 静态覆盖域与可复现反例（有限证据）

- KI文件CS:E164..E263实为256个00；这只证明**进程文件初态**，不证明每战清零。D958/D971及99C2..99CE不清它；完整跨战应用历史/其它间接写者尚未闭合，正式路径禁止零兜底。
- verify_battle_original_display_coverage.mjs检查214个**未镜像、未改tile、无units/effects/属性**的原图，各用真实MDL，在分析用132×80格（column=-2,row=-6，检查73行×65块）按DE95五邻/双通道/层次累计mask：**1,015,430块均覆盖512bit，0 gap**。该精确静态域不依赖scratch，不能无条件推广动态域。native compositor明确拒绝扩展geometry，未把扩展遍历当原始遍历。
- tools/fixtures/battle_display_scratch.json完整列出directory2/layout0的27个初始tile>=D0节点、原值与五次u8(tile+(tile<F0?10h:8))序列。**这是B824字面变换构造，未证明正常玩法可达，不证明当前正式战场有该bug**。它反驳的只是无条件推广。没有调用B824 handler，也不把任意高tile声称为实际墙记录。
- 构造相机x42/y30→E160=72/E162=26；display全0后执行一次DD22 terrain建立，dirty由该过程生成；没有unit/effect/flag/TALK，framebuffer全0。分别用scratch全00和全FF，执行一次native DDB4，row0..22、column1..29 step2。首差pixel4350，即输出(30,9)/VGA(30,49)，**0 vs15**。相同input cell bytes hash=`7be61d96f9b2300bf04d6b74799a9b73ce40d386d2c8fd4c8d412b5229fd339b`；两个output hash=`a0e2a8dcc2aeb562b7cf890ed2859cfe5b5ce12b3d46a7f4cb15ae732aa30c93`、`38a307268812997a739655df71acdf50ca455768b156a7aed622386692759406`。
- 重放：node tools/verify_battle_original_display.mjs，认证KI/资源/固定指令byte、fixture全变换、cell hash及首差。这是**raw指令导出的字面JS模型，不是执行KI的CPU/VGA oracle或受控DOS**；review仍须复核模型。

### 模块验证与暂停契约

新增originaldisplay.js（cell/erase/terrain、独立BB10、分析geometry）和originalcompositor.js（native DDB4四面→indexed framebuffer）。必须显式传scratch/framebuffer；复制/快照无别名，restore校验尺寸/byte或4-bit域/geometry/revision。draw修改**独立显示**的dirty/scratch/framebuffer，应在原始显示边界执行，不得由每次Canvas repaint推进；无rule/RNG引用。

verify_battle_original_display.mjs涵盖四半帧hash、五象限×四背景逐bit、936记录/人工OR、channel竞争/attribute覆盖/floor拒绝、擦除阈值、pair裁剪、两旗base/level6/四相pre-increment、dirty/bit8/快路清0、DE95顺序及独立snapshot/invalid restore。实际Session tick经**已有effectRender测试回调**观察B97E/BA2E/BAB7 erase-before-draw、code/整数坐标及0 RNG；不接新BB10，不假称正式renderer/99CB已修。既有真实生产A426/A065/BD46/wall/lifecycle回归也全部执行。

本批38 focused +2 Python资产验证 +viewport正文通过。父会话负责LSP/Lens/新浏览器，独立review待进行。无暂存/提交/reset/clean，保留先前脏改，未触SAVE.DAT。

**后续最小研究/设计，不是已实现**：以9CB3实际记录和双方B799/B7CB调用证明/排除依赖构造可达性，必要时建raw VGA有界oracle。闭合固定视口历史与全场扩展遍历关系，或证明全部可达输出逐bit覆盖；不擅改小视口、不补零。之后预载raw资产，保存cells+scratch+indexed framebuffer，createHandle明确99CB一次初始化、A082一次B941、ADC8真实人员draw、A0DE/A0EF一次DDB4；按应用生命周期/快照保留必要历史。旧快照缺display不能伪造历史或restore补跑99CB。现代192px UI、全场1:1拖拽、取消小地图/双箭头保持。

实际TALK窗口呈现、yielded startup、合法9FDC非局部结束、跨战D318/scratch历史、完整DOS差分仍未知/延期；C315语义追加见下节，现有active/death pre-toggle捕获/side/坐标未改。

## C315 / C407 tactical messages（2026-09-07，原始语义证据；历史UI政策阻塞已由文末批准例外解除）

### 证据与批准边界

独立再次认证KI（同上SHA256）与34182B TALK.DAT（SHA256 `cb0cdba4f1c507243cbc4e636bc3fcf698a4f88fe3a0d784cc579e5548e6fcaf`），完整重读C315..C4F9、075B..09A4、01B4/01DB、06F9/0701、C1B9..C231、A69F、A8F6、AE56、A4BF、A7B7命令表、A1C5生产者、B5EB..B616、D9D1、E3D7/E41B/E453、4E5C..4F57、6E8F..6F30、9946..9ACD。wrapped C3B0→075B、C315→01B4、C394→01DB、C453→0BCD、C476→06FD、C4F6→0AAA；不把线性1075B当未知函数。

**本语义批次的历史批准边界：先交付原始Session marker/消息/输入语义，暂停冲突UI到期接线；后续用户明确选择全局3秒，现行表现例外见文末。** 不把60/20帧换成秒、不让3秒展示计时改原始marker、不使用会hold战斗的战略FIFO。本批无新增DOM弹窗、无自动呈现/右击实际命中监听；生产只预载原文目录并捕获消息。无B941/native compositor激活、无99CB修改、无scratch清零兜底，现代192px UI/全场1:1拖拽/取消小地图双箭头保持。startup仍同步；不混改yield和非局部结束。

### 原始文本与身份（实锤）

- C324..C350取 `speakerPtr=4240+((legionPtr-2240)>>1)`，DL1交换两侧，AL=记录+1 portrait、AH=+1E personality。**不是读取军团+2 commander后再寻武将。** 6E92..6EAD反向用武将指针×2构造军团slot并写+2，因此正常建军两者一致；原始公式仍必须保留，不能将Web `legion.idx/generalIdx/slot`当同义词。
- Web正式创建路径既有`ensureLegionSlot(...,general.idx)`，本批只读取实际`legion.slot`；不同slot快照字面取对应武将，不换成主将。缺slot/personality/name/portrait上下文明确`unresolved-slot-context`，不按idx%8、不借用NPC/实际主将脸、不造句。4EF1/4F30对临时4200城防直接走5130，NPC-NPC同样不进战术；这些分支无C315，不从127占位将伪造战术话者。
- 075B：selector<196直接用，否则 `u16(196+8*(selector-196)+AH)`，AH不mod8；索引×2读取TALK指针。C349先PUSH speaker，再PUSH opponent，SS:DI从opponent开始。084A的`\\1`经08B2消费word并打印该将+8名；`\\6`经097E只跳过word不前移文字X；游标跨行延续。`\\4`经0939独立取玩家势力+2军师，不消费这两word。
- 字面TALK670@56F7：`\\6啊啊，我就是\\1， / 來一決勝負！！！`打印speaker；TALK678@5811：`還以為是誰！\\1啊 / ，我就一刀把你砍下來 / ！！`打印opponent；681等跨行skip仍用同一cursor。未知token/越界参数或未导出索引显式unresolved，输出不含兜底文本。
- 新`export_battle_talk.py`从认证原TALK严格Big5解码424条（1AC、1AF..1E2各8条），保存原pointer/line；不使用既有parse_talk术语替换/replace错误字符链。`battle_talk.json` revision1附原文件hash，浏览器在startup前与图形一起预载，单帧无fetch/await/RNG。缺资源身份/版本显式拒绝，Session规则测试未提供目录时仍保留selector/marker并标明未解码。

### 生产者与时点（实锤有界）

| 实际入口 | selector/时点 |
| --- | --- |
| C1B9/C216 commands0..4 | 1B1+command，守方城壁3改1B6；D3491无发言；先清mask、写组长pending，再发言，**不是等待A7B7接受后才确认**；current5可拒绝切换但仍有确认 |
| C211无theme城壁拒绝 | 清mask后发1AC，没有pending写入 |
| C21A→A8F6 | D3490才写全侧pending5并发1AF；失败无发言/不清选择 |
| VM A500→A8F6 | 对象1侧1AF，仍遵守D3490，脚本的D3492上层gate保留 |
| ADC8 AE56/AE64→A8F6 | HP<50接受侧1B0，发生于A12A之后；删除旧硬编码「全軍撤退！！」 |
| A1C5→A2E8/A3C3/A23F | 原有挑战/拒绝/单挑/胜负selectors于原调用点捕获；保留旧startup-flag只作历史trace，非图形 |
| A69F/op16 | 原有cc/D349 gate，至多一次1CE+AH，现保留`side=cc&1`到生产IO |

AA10已识别为组长表A7E7的**命令10**；命令9=A9FB写pending10。所谓C127直接调用A9FB是C126 SHR内部byte的假阳性。本批32块BATTLE原字CFG（入口PC0及A2E8后PC3，Jcc双分支过近似）共200个op16站点，AH仅0..20；op3仅0..5、op13仅0..4。按钮0..5、startup8不生产9。**没有找到生产命令9写者，保持9/10不主动接线，不新增随机bark；这不是全程序间接不可达证明。** 不把静态站点全集说成正常一场全部执行。无需为本批添加任何规则RNG。

### 两侧窗口、C407与低byte历史

- C359读取wordD318，ADD DL,3C不进DH，写side0 D322/side1 D324。每侧一个槽，同侧替换重设marker，两侧并存。A12A仅INC低byte，A12F将word载入AX；**后续关闭调用会改AX，详见下一小节**。FFFF也可能是活动deadline，不能加sentinel跳过。调用在A12A之前则当帧已推进一次，AE56/C407在之后则下帧才推进；60是目标低byte差，不是独立窗口倒数。
- C3C0清为FFFF、C3F8→D9D1 unmask、E41B清命中。原rect side0=(224,288,256,80)/ID27，side1=(0,0,256,80)/ID28；左表均RET，右表C30D只关闭命中侧，空白右击无效。Session接收已局部命中的27/28输入；**尚未把现代DOM位置当原始VGA坐标或接实际鼠标监听**。
- B60F仅mode0/kind1且非零metric已DEC分支调用C407，包括1→0但该次不破坏。C407在D326==FFFF时建立窗口并将CS:C405设FFFF；否则保留最低值。C483只在当前metric严格低于C405时更新bar及marker，相同/更高值不延长。C4D2 active时value=min(151,metric>>4)，inactive为0；bar最大151。label来自KI C3FF字节`AA F9 B1 6A AB D7`，即「門強度」，不是TALK/百分比猜测。
- C48F ADD AL,14只低byte；A14B用当时AX比较D326命中才C4AA关闭，20是目标差而非保证20次后关闭。ID29左RET/右C4A6；打开mask参数(16,0,14,2)、关闭unmask(16,0,14,4)的不同高度保留。C415..C424对同一CX同时要求>=100h又<20h，字面鼠标隐藏分支不可满足，不擅修成DX。01B4/01DB光标和075B直接VGA绘制不在现代语义事件中冒充像素保存。
- 捕获mask/unmask仅保存D9D1原始参数，未调用dormant compositor或宣称native framebuffer/TALK像素等价。A12A清除在A6FA前、C407在ADC8接触处，消息保持战术循环运行；不从Canvas绘制推进消息或RNG。

### A12A→C3B8跨调用AX勘误（新实锤，主管批准撤销旧验收）

最终复核暴露前批及外部审计均漏掉的AX活性；不是为了测试改变原版：

| 指令边界 | AX / 副作用 |
| --- | --- |
| A12F/A133 | 只在此将wordD318载AX，比较D322 |
| 若D322不等 | 无调用，AX保留；A13F比较D324 |
| 若D322等→C3B8 | 只PUSH BX/DX；C3C0写markerFFFF；C3D0调C3F0，其C3F6写AH1，D9D1不写AX；返回后C3E3令AL=CL(0)、C3E5加1B；E41B PUSH AX、内部XOR AL清hitmap、POP AX完整恢复011B；C3B8最终返回AX011B |
| A13F | 使用上述当时AX，**不重载D318**；若命中side1，同链返回AX011C；不命中保留AX |
| A14B | 使用当时AX比较D326；若调用C4A6，其入口PUSH AX/尾POP AX，D9D1/E41B均在此保存区间内；AX不变 |
| A155 | AX可能是D318/011B/011C，D318自身不受关闭改写 |

因此同deadline002C的side0/side1/wall在首轮只关side0；若没有替换/别的关闭，下一次低byte002C可关side1（多256步），wall又可能被side1 clobber而再多256。marker011B/011C可以由此前关闭形成同帧级联，不受D318高byte相等限制。D319FF且side0 markerFFFF时，每次低byteFF即使side0捕获已空仍会调用清除并令AX011B，可持续挡住同FFFF的side1/wall；不增加“已空不清”门控、不补偿延时、不强制同步关闭。

新增测试专用`tactical_message_raw_oracle.py`实际执行认证KI五个精确区间：A12A..A155、C3B8..C3FE、C4A6..C4D1、D9D1..DA1B、E41B..E452；所有CALL/RET、byte/word寄存器、segmented私有内存、stack、display flag/hitmap写实执行，**没有KI-call stub**。仅建模这些区间实际消费的ZF，不声明其它flags/CPU/DOS/VGA设备等价；未知指令/越界/超过20000步立即失败。加载单64KiB CS，heap与stack不别名。

`verify_battle_message_raw.mjs`138个原指令差分，比较D318、三marker、关闭顺序，并检查A133/A13F/A14B/A155的AX逐点值；包含同deadline、单side1、011B/011C级联、wall、FFFF、word高byte/低byte回绕和关闭延期中snapshot/restore续跑。示例counter002B、markers[002C,002C,002C]→仅side0，AX轨迹002C/011B/011B/011B；markers[002C,011B,011C]→三者，AX轨迹002C/011B/011C/011C。旧session/lifecycle测试的同步三关断言已撤销，其余accepted移动/伤亡/启动/CX/wall机制保持。

### 快照契约与验证

新Session快照保存revision1消息槽/原文/解析文本/slot上下文、C405最低值、墙状态，D318/D322/24/26仍由registers保存；目录是外部版本/hash校验资源，不重解码已捕获历史。所有嵌套捕获独立复制。

**主管选择明确拒绝活动而不完整的旧消息快照**：不得停用C407继续战斗、补FFFF/重开/假造历史。缺匹配目录抛`missing-tactical-talk-catalog`；无版本/hash目录抛`invalid-tactical-talk-catalog`。独立review发现初版预验证不完整且可能晚期clone失败，旧的无条件原子性宣称撤销；B1–B3修复与有界输入契约见下节。旧快照仅在三marker明确FFFF且D319!=FF时兼容无活动窗口子集（下一C407本就重置C405）；D319FF的FFFF可能是活动deadline，一律不猜。此前lifecycle人工marker-only fixture的恢复断言改为明确拒绝，其原始counter/expiry断言保留。

- `verify_battle_talk_assets.py`独立读取原KI/TALK/BATTLE：认证hash/固定指令/wrapped calls、27/28/29表、424条原pointer/Big5行逐条对照、32块CFG/200站点；不导入exporter，不是CPU/VGA oracle。
- `verify_battle_original_messages.mjs`字面670/678/681/584与slot!=commander、所有cc×D349和按钮gate、前/后A12A到期、word高byte/FFFF相等、同侧替换/双侧/左右及空命中、C407严格降低/不延长、active新快照独立续跑及旧快照拒绝原子性。实际createFieldBattle+BattleView装配原BATTLE VM/IO+A065帧、current5确认时点、ADC8自动退却和AF69接触C407、恢复后真实帧、完整RNG snapshot不变；无规则handler stub。
- 官方第一章data fixture实际执行现有AI建军及玩家dispatch，再走createFieldBattle/createBattle攻守交换，验证真实slot/personality/portrait可解码。仅这些入口场景实执行，不宣称全场/DOS或每个改版/旧快照都已闭合。
- 测试中的BattleView方法通过Node调用，**没有执行浏览器UI/原始VGA/Playwright**。startup分支旧测试仍有显式fake frame/RNG driver，仅C315替换为真实Session；新实帧测试另列，不能混称全部真实运行。

### TALK快照B1–B3修复（2026-09-07，Web续态契约，待独立复核）

依据独立review `0f77e6d9-b009-427d-b22f-60f494f6ffe0/battle-talk-independent-review.md`、其完整外部fixture及`snapshot-repro-results.json`修复。该review已独立确认AX/文本/生产者；本节**不新增原版机制结论**，只关闭Web快照边界。原始外部证据未修改。

- **B1，revision1完整结构校验**：保持已有revision1输出格式，不升版、不迁移或修补残缺revision1。顶层必须有revision=1、catalogHash（null或认证TALK hash）、两项slots、context、wall、u16 wallMinimum。未知revision/status均拒绝。
- `context`是null，或包含恰好两个speaker（各为null或完整身份）与显式`advisorName:string|null`。完整身份含`slot:0..127`、字面`legionPointer=2240+slot*40h`、`generalPointer=4240+slot*20h`、字符串name、byte portrait/personality（0..255，**不mod8**）。不读generalIdx替换slot。
- 每个非空side槽必须含side=数组侧、hitId=27+side、u16 selector/deadline及已知status。`source`只是可选字符串诊断来源（内存undefined也可），不用于重建历史。status分支如下：

| status | 必须保留的续态 |
| --- | --- |
| `unresolved-slot-context` | 合法null context或至少一侧speaker=null；不要求不存在的text/index/portrait，不虚构身份 |
| `unresolved-talk-asset` | context双方身份完整；允许后来安装catalog，保留原未解码状态 |
| `unresolved-talk-index` / `unresolved-talk-arguments` | context双方身份完整；u16 index必须符合保存selector与该侧personality的075B word公式；advisorName仍可null |
| `decoded` | 认证catalogHash及已安装目录；context双方身份完整；完整speaker/opponent，其slot分别对应context两侧；u16 index符合保存speaker personality公式；u16原记录offset；非空字符串rawLines/lines数组且行数相等；text严格等于lines以换行连接；非负安全整数argumentWordsConsumed |

- `decoded`无`\4`时advisorName=null仍合法。已捕获的名字/文本不会按目标Session或当前catalog重生成，亦不把合法未解码状态升级为decoded。本校验是**完整性/字段域/身份关系校验，不是文本真实性或全历史可达性认证**；offset保留word域，不通过重新解码猜测丢失原文。
- wall可显式null；非空必须含原label「門強度」、hitId29、对齐20h且在当前地图对象池C00..1FE0的address、maximum151、整数value0..151、u16 metric/deadline。metric等于保存wallMinimum；value为0（inactive允许）或min(151,metric>>4)。不从当前墙flags重新计算保存bar。正常B60F先递减后C407，保存的是完整update；不把任意调用showWall(FFFF)产生的未完成打开对象当作合法续态。
- **B2，原始显式word先校验**：Session在合并register默认值前，读取传入对象自身的` tacticalFrameCounter / side0MarkerAt / side1MarkerAt / wallMarkerAt `四个可枚举data属性，必须是整数0..FFFF。缺属性、继承值、getter、null、字符串、负值、小数、溢出及非有限数一律拒绝，绝不mask/coerce/default修复。无messages（undefined/null）兼容只允许三marker显式FFFF且D319!=FF。新完整快照的空槽+FFFF在D319FF也合法；有槽则deadline须与对应word一致。**运行时A12A仍没有FFFF或空槽豁免**，被截留的side1可以跨周期继续存活。
- **B3，先准备再提交**：`prepareRestore`在任何Session写入前构造独立消息实例，完成整个输入messages的深复制/结构验证/marker对应检查；events亦在此前完整预复制。提交仅安装已经准备好的实例与事件数组，无后置message clone。失败保持原frame/registers、所有pool bytes、完整canonical RNG、command queue、events及messages值和原对象/数组身份；不需要回滚。
- 输入契约是普通data-only快照：message/context/slot/wall/事件树只含普通对象或null-prototype对象、稠密数组、字符串/布尔/null/有限数及可选undefined。拒绝函数、symbol键/值、accessor（不调用getter）、非枚举载荷、循环、稀疏数组、Date/Map/typed-array等非plain载荷；clone也会在提交前拒绝Proxy。外层Session输入同样须是普通数据，**不承诺隔离恶意Proxy trap/getter闭包的任意JS副作用，不宣称其它pool/queue等Session恢复失败已全量审计或具有原子性**。pool二进制快照仍使用原有typed-array格式，不在message树限制内。

验证：新增`tools/verify_battle_original_message_snapshot.mjs`整合外部最小复现及独立逐字段变异，209项拒绝均比较完整Session快照与rule/RNG/pool/queue/message及嵌套引用；涵盖五status、byte personality8/255、null context/单侧/军师、保存文本不重生、wall最低值、显式legacy、新空FFFF与AX截留后的deferred续跑。原外部fixture重跑5/5控制原子且11缺陷均消失（0 gaps）；原文件与历史结果未覆盖。48个battle focused正文与安全全量101正文（93 MJS+7 Python+viewport JS）通过，保存测试仅内存/mock或仅读SINARIO。三个浏览器page helper未执行正文，不算通过。

本批无UI/实际鼠标监听/战略hold/第二计时器、native display或99CB接线；AX/075B文本/输入和B60F等生产者保持。该批当时UI政策仍待用户决定（现已批准，见下一节）；全新浏览器、显式LSP/Lens及独立review不以Node验证冒认，父会话待review端点捕获后再安排诊断。编辑工具附带诊断曾自动运行，最终交付另记录文件hash。

## 战术对白3秒现代表现例外（2026-09-07，用户明确批准，已独立scoped-PASS）

用户明确决定「战术对白3秒全局关闭」。这是**现代UI产品政策，不是KI计时结论**。上文C315/C407、AX顺序活性、低byte目标差60/20、真实slot/075B索引/原文、data-only快照结构及局部命中API全部保留；本批未修改originalmessages/Session/生产者/目录/原始oracle。上批快照独立review `e4f080be-aff4-4047-92e5-45b1b67fdc5e/talk-snapshot-review.md`已scoped-PASS，不扩大为UI或全场接受。

- `ui/battledialogue.js::BattleDialoguePresentation`仅拥有现代捕获副本、两侧slot、递增serial、append-only事件读取游标、墙钟deadline和timeout句柄。`tactical-talk-show`的新捕获才替换该侧；仅status=decoded可显示原text/speaker/portrait。unresolved替换清旧框，不造句、不用主将或NPC脸兜底。同文/同frame的新事件仍是新serial。
- 实际显示立即起算3000ms；2999仍显示、3000关闭。只此deadline控制可见窗口。所有` tactical-talk-close `（含A12A早到/AX延期及独立raw局部关闭）不缩短/延长/复活现代捕获；timeout/global right-click也不改原始marker/slot/event/RNG/队列。没有第二个“取较早/较晚”timer，不等待窗口关闭继续规则。
- 两侧各自替换、各自3秒；全局右键立即清两侧现代框。复用现有`attachInput`全屏contextmenu→`GameBar.click`层级：系统读档确认/保存/设置先消费，其后活动战术层消费右键（即使当前无对白），不会落到战略菜单/据点/军团。战术拖拽取消，right pointerup不执行左键选择；不新增局部27/28监听，不伪造native local input。原始`messageInput(27/28/29,2)`仍独立可调用。
- C407「門強度」是来源特定城门状态，不是普通武将说话。保留B60F门控、C405最低值、marker/AX/局部29原始语义；本批不新建其可见UI，也不套入3秒对白控制器。
- 复用原有双侧DOM框/头像/text与GameBar `_drawWindow`纹理canvas；名字只取捕获slot身份，原换行保留。头像异步加载带entry所有权检查；旧加载、旧timeout、已进入任务队列的取消回调不能写/关闭新内容。头像缺资源只留空，不显示虚构NPC。现代192px信息/指挥窗、1:1全场与部署/卡栏保持；对白沿用原有240px双侧位置。
- 后台不暂停已有墙钟期限；浏览器限流导致callback延后时，下一次可见sync在paint前先检查期限。隐藏标签页不启动未显示事件的期限；回来后显示最后同侧新捕获，从显示起3秒，不补跑战术帧。无战略FIFO或新增clock.hold；现有战略暂停与战术速度完全不变。
- view退出清timer/捕获/游标、隐藏DOM；新open使旧await/RAF失去generation所有权。现代显示态**不写入原始Session快照**。新view或已接受的独立snapshot入口以当前保留slots开始新显示期限，并跳过整个既往event历史，不能重新播放已raw关闭的启动发言。正常活跃view只读新events，不逐帧重读raw slots，因而已dismiss捕获不会复活。
- A1C5现由增量stepper在每个实际A04B/A065后yield；C315捕获仍直接进入同一两侧展示器，不另造启动对白队列。第一侧3秒窗与后续启动规则帧并行，第二侧到达时可同时显示；对白、timer及右键都不暂停Session或取得新clock hold。native compositor/99CB、scratch历史及合法非局部结束继续dormant/延期。

验证：`tools/verify_battle_dialogue_presentation.mjs`采用可控墙钟/timer/DOM/Image，不是浏览器冒烟。覆盖2999/3000、真实60tick早关/AX同deadline side1延期、两侧替换同文新serial、已排队旧回调/早timer、unresolved/C407隔离、后台限流与首次显示、原始snapshot独立继续；真实facade→queued C1B9→导出BATTLE VM→A065和BattleView.draw，逐次比较完整Session快照/引用/RNG并验证可见期间frame继续。全局右键系统层级、拖拽/右键释放、捕获slot!=commander头像、异步头像替换/退出、新view teardown均有定向断言。viewport旧手写句期待改为“没有decoded event不显示发言”，保留面板/坐标断言。父会话在review后另行全新浏览器与显式LSP/Lens，不把Node DOM替身冒认为浏览器验收。
