# 原始战术AI脚本与命令分派：P07分支账本

**状态：原始资源结构、VM本体与选表接口已核；完整战术帧及全AI专项尚未闭合。** 本页是32块脚本/19个opcode的详细维护源；总体任务与完成标准见[AI全链专项](re-notes-ai-chain.md)。不能把每条局部边分别设置输入执行，称为同一战役连续执行全部分支。

## 1. 原始来源与证书方法

- `E:/Dragon/Dragon/KI.EXE` SHA256：`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA加`200h`为文件偏移，near call目标按16位回绕。
- `E:/Dragon/Dragon/BATTLE.DAT`：8192字节，32块×256字节；SHA256：`89e311cd59d0e5d943762f03230c6db419c2d77730b2591429651445d19ef120`。没有以Web导出的脚本作为原版证据，没有访问SAVE。
- 子原始产物：`C:/Users/fczll/AppData/Local/Temp/dragon-a05-cfg-1s12c88g/`；父冻结、独立复跑及追加证书：`C:/Users/fczll/AppData/Local/Temp/dragon-ai-vm-parent-do8p_tvk/`。`cfg.json`保存全部原word、节点/边/标记角色、SCC和原指令定位，`range-cfg.json`保存每节点R集合，`vm-certificates.json`保存每个局部输入/输出及停点，非只有汇总数字。
- 有界CPU只使用固定KI、私有零RAM与显式脚本/对象输入。其测试RNG为显式identity表与零addend/index，实际执行ECE0；**未执行RTC初始化，不是官方开局RNG轨迹**。只AST提取已审CPU类/函数，不执行来源模块的场景顶层或外部文件reader替身。每次最多100000指令，未知指令/范围外IP停止。
- 2397条资源局部边中，2196次真实A426完整RET；另201次真实CALL到C315入口即停止，PC尚未通过A45C提交。**201次没有伪造消息返回**。另279个人工参数例、48个选块前缀、202个选命令前缀与资源可达性分别记录。
- 父逐文件核hash并重跑三个脚本，四输出逐byte一致；再对2397条资源边增加CF/ZF定义性守卫，MUL后ZF未知、DIV后两者未知，禁止读取未知标志，全部结果保持一致。未执行的SF/OF/PF/AF等不能冒称已认证；父负控制确认未知CF/ZF分支立即失败。此为有界原指令执行，不是通用x86/硬件认证。

## 2. 选块与PC入口

`CBE5..CC27`：令variant=`u8(mode+1)`；仅mode0且`D35>=80h`时variant改0。`BX=(D30-2240h)>>1`，切到D52状态段后读`[BX+4256h]`，因此脚本族来自**敌军团槽号对应的武将+16**，不是军团+2主将索引。AH按byte执行`family*4+variant`，AL清0，文件偏移即AH×256，读256字节。

正常family0..7、mode0/1/2、D35取0/80的48个真实前缀均验证到E38C入口：城战玩家守/攻variant0/1，陆战2、水型3；人为将slot17军团主将改88仍读取G17脚本族。这里没有伪造文件读取返回，也未证明任意family超域有效。

`9A92/9A94/9A98`清PC `D311`和wait `D313`；**不清R `D315`**。`A1C5`先执行50个A04B/A065，不执行VM。mode1进入挑战链：较强评分未达12C0不挑战；挑战发言并等40帧后，`A316`令PC加6，随后拒绝仍保留此跳过。故结构根为variant2的byte PC0/6，其它块PC0；开场若由9FDC非局部结束则不进入VM。PC6是第三个word之后，不是byte3。

普通循环`9FBB..9FDA`依次输入/按钮→A426→A065。以下结构分析使用正常handler返回和有效PC接口；它不是跳过A065的产品执行许可。

## 3. 32块结构分母

以R为任意byte、按下节原控制规则展开：2050节点、2397边、561个标记word，1485个word未作为本闭包的opcode或标记；越块目标、非法表索引和opcode/标记双角色均为0。32块中29种不同byte内容；相同节点数不代表相同策略。每块至少一个循环SCC，不能为迎合Web指令限额将其强制终止。

| 块（族/variant） | 节点 | 标记 | 循环SCC | 块（族/variant） | 节点 | 标记 | 循环SCC |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 0 (0/0) | 99 | 28 | 2 | 16 (4/0) | 95 | 22 | 2 |
| 1 (0/1) | 80 | 20 | 2 | 17 (4/1) | 77 | 23 | 1 |
| 2 (0/2) | 41 | 13 | 2 | 18 (4/2) | 66 | 22 | 2 |
| 3 (0/3) | 34 | 8 | 2 | 19 (4/3) | 34 | 8 | 2 |
| 4 (1/0) | 100 | 26 | 2 | 20 (5/0) | 94 | 22 | 2 |
| 5 (1/1) | 97 | 29 | 2 | 21 (5/1) | 74 | 24 | 1 |
| 6 (1/2) | 54 | 16 | 2 | 22 (5/2) | 66 | 22 | 2 |
| 7 (1/3) | 34 | 8 | 2 | 23 (5/3) | 34 | 8 | 2 |
| 8 (2/0) | 102 | 22 | 2 | 24 (6/0) | 76 | 18 | 2 |
| 9 (2/1) | 95 | 31 | 2 | 25 (6/1) | 72 | 20 | 1 |
| 10 (2/2) | 65 | 22 | 2 | 26 (6/2) | 52 | 17 | 2 |
| 11 (2/3) | 34 | 8 | 2 | 27 (6/3) | 34 | 8 | 2 |
| 12 (3/0) | 64 | 18 | 2 | 28 (7/0) | 73 | 18 | 2 |
| 13 (3/1) | 62 | 15 | 2 | 29 (7/1) | 67 | 15 | 2 |
| 14 (3/2) | 51 | 17 | 2 | 30 (7/2) | 56 | 17 | 2 |
| 15 (3/3) | 34 | 8 | 2 | 31 (7/3) | 34 | 8 | 2 |

opcode0..18节点数量依次为`324,125,135,317,4,13,0,48,68,80,561,36,16,88,0,24,200,0,11`。op6/14/17在这个资源结构闭包中没有节点，不表示它们不存在于执行器。条件op10实际cc0..4，op3实际cc0..5/7及命令0..5，op13实际cc1..3及命令0..4；op16实际cc0/1/3/4及参数0..20。

## 4. A426与19个opcode

A426先查word wait；非0则减1并RET，PC不变，无RNG。否则读`script[PC]`，opcode=`low&1F`，cc=`low>>5`，参数为高byte AH；SI先加2，再经A466的19项表CALL，正常返回后A45C写回SI到PC。表项无上界保护，不能把原资源内有效索引证明外推到任意损坏脚本。

下表O为D30E对象段、T为D30A临时军团段；R为D315。无特别说明的opcode本体不消费RNG，**不包含其后的A065或未完成消息callee**。

| op/入口 | 全部直接条件与循环 | 结果/边界 |
| --- | --- | --- |
| 0 A48C | 无 | wait=u8(AH)；以后wait次仅递减，再下一次取新opcode，不是毫秒。 |
| 1 A495 | 无 | D347=AH，D344=u16(AH×60h)。 |
| 2 A4AB | A4B0参数<1；否则A4B2参数>1 | D33E低byte依次3A/10，等于1则24。 |
| 3 A4BF | A4C5 D349!=2；A4D5命令5；A4DA命令!=3；A4E2 theme!=0；A4EE cc==7；A4FB组循环 | D3492直接返。命令3且theme0改1；cc7写敌六组长pending，否则写单组。命令5固定DI600调用A8F6，不立即替换current。 |
| 4 A50D | 无 | R=D346（玩家阵形byte）。 |
| 5 A516 | A51E部署byte<1C；A520>1C | R分别0/2，等于为1。 |
| 6 A52E | A542 current<4；A548归一后!=4；A54E max>=value；A556六组循环 | 敌六组current中>=4归0，再取最大，R范围0..3。A53B只在循环外清max。 |
| 7 A560 | 与op6共用A531 | 玩家六组同一归一化最大值。 |
| 8 A564 | A570 D31B>20h | 真R=D31E，假R=2；不是比较D31A低byte。 |
| 9 A57A | A57C参数非0 | 参数0改除数1；恰好一次ECE0，R=byte随机数%除数。除数1..255且被除数<=255，DIV零和商溢出均不可能。 |
| 10 A591 | cc表分派；A5AB等于、A5B4不等、A5BD大于等于、A5C6小于等于；A5CE/A5DC看下word低byte | 精确控制流见下文；不写R，不耗RNG。 |
| 11 A5E1 | A5ED总兵word<=255 | R=min(T:+24,255)，输入AH不参与。 |
| 12 A5F7 | A603总兵word<=255 | R=min(T:+4,255)。 |
| 13 A60D | A61F命令!=3；A627 theme!=0；A639首孩子CLASS不等；A63F是否主将组；A64F六组循环 | CLASS=u8(cc×18)，与O:[组+24h]比。命令3/theme0改1；匹配组调用A8DE给7孩子flags OR8并写pending，无active过滤；仅非首组同时改组长flags/pending。不是按组长CLASS匹配。 |
| 14 A654 | 无 | R=D31D。 |
| 15 A65D | A674 kind!=1；A679 min<=metric；A681 bit0==0；A688扫描16条；A68C任一bit0后跳过乘4 | 任一kind1 bit0置位则R0，否则R=high8(u16(minMetric×4))；不是min(255,metric×4/256)。AX无条件返回未乘4的min。无kind1时min=FFFF；见[城损独立输出](re-notes-tactical-rules.md#241-a65d返回值与城损勘误)。 |
| 16 A69F | A6B5 cc&6非0；A6B9 D349==0；A6BF side==0；A6C7 D349是否匹配变换门 | 匹配时最多一次C315，CX=1CE+AH，side=cc&1；不是循环AH次画旗。 |
| 17 A6CF | A6DE敌首组长pending<9 | R为pending>=9的布尔值，不扫六队、不读current。 |
| 18 A6E8 | 无 | R=O:0603首对象HP byte，不是军团士气或总兵。 |

条件表A59C精确为`A5CA,A5A6,A5AF,A5B8,A5C1`，即cc0无条件、1等于、2不等、3无符号>=、4无符号<=。不是旧笔记的`[je,jne,jb,jae...]`。令N为已经前移的`script[SI]`：

```text
N.low == 0:
    条件真：SI = 2*N.high           # 绝对word索引
    条件假：SI += 2                 # 跳过标记word
N.low != 0:
    真/假均不改SI                  # 下次执行该word；无“普遍跳过下一指令”
```

32原块的op10 lookahead全部是低byte0的标记；无标记两侧仍通过人工内存原指令例核实，不删原码。op16的cc0..7发言门依次要求D349为`0,0,1,2,2,1,3,0`；原资源cc3/4虽同门2，但发言side不同。

A8DE循环A8EE固定7孩子。A8F6：A8FC检D349==0，否STC无写；是则A907按DI0/非0写D3491/2、六组pending5（A922循环）、side0/1，真实C315返回后才CLC。op3只生成DI600；DI0是其它调用域，不冒称它由op3可达。

### 4.1 本体分支分母与证据等级

连续执行岛`A426..A466、A48C..A59C、A5A6..A6FA、A8DE..A92E`（跳表数据排除）合计44个Jcc/LOOP、88条有向边。子资源/人工例覆盖78条；父追加部署0/28/255、墙metric1370/1370/1000且bit0两态、DI0直接A8F6，共6例补至**87条实执行**。仅`A548→A54A`未执行：A542保留的AL严格<4，其余经A544置0，所以A546比较4永远不等；这是全byte域本体不可达证明。

全部VA/原字节/目标/见证来源见父`parent-vm-branch-ledger.json`。DI0例停在C315，不伪造返回。87/88是本体控制边证书，不是所有输入组合、所有callee、32脚本真实战役或完整游戏覆盖率。

## 5. R范围分析：严格区分模型与完整帧

在**正常VM接口且相邻VM步骤间R不被外部改写**的模型内，用256元素集合求有限不动点：op5输出0..2，op6/7输出0..3，op9输出0..(divisor-1)，op17输出0/1；字段查询保守放宽，op3撤退/16的消息调用也将R放宽。得到6条条件边与其到达R集合矛盾：

| block | byte PC/原word | 模型到达R | 被排除边 |
| ---: | --- | --- | --- |
| 8 | 72h/042A，R==4 | 1,2 | true→80h |
| 9 | 52h/042A，R==4 | 1,2 | true→88h |
| 10 | 7Ah/044A，R!=4 | 1,2,3 | false→7Eh |
| 18 | 7Ch/044A，R!=4 | 1,2,3 | false→80h |
| 20 | 86h/042A，R==4 | 1,2 | true→94h |
| 22 | 7Ch/044A，R!=4 | 1,2,3 | false→80h |

模型内2050节点减为2034，排除16节点。**当前不能把这个条件模型证明直接称为完整原版循环中的6条绝对死分支**：真实两次VM间还有A065/输入/按钮及其它C315调用，须闭合R/PC/脚本区写集与SI返回契约。仅在op3/16作消息havoc不自动替代这些外部接口。2034个未排除节点也不表示都存在同一RNG流下的实战前缀。父已将这个跨步证明义务单独发回复核，没有因静态数字整齐而降低验收门槛。

## 6. pending→current与两张命令表

A7B7（组长）与A7FD（孩子）读取word`O+1A`，AL=current、AH=pending。current5或两者相等时保留current与路径；否则接受pending，写current、清路径word+16，并将目标锚点+10/+11/+12恢复为当前X/Y/level。再按选中索引间接CALL，**不是下令时就完成切换和孩子广播**。

| 索引 | 组长A7E7 | 孩子A82D | 边界摘要 |
| ---: | --- | --- | --- |
| 0 | A92E | AA2C | 组长到锚点后current/pending7；孩子编队移动。 |
| 1 | A953 | AB9C | 组长CLASS0走AA2C，其它AB9C。 |
| 2 | A96D | AB7C | 切换广播2；mode0另B7CB墙扫描。 |
| 3 | A988 | AB39 | 切换广播3，进入AB39。 |
| 4 | A99C | ABB2 | 组长按目标byte距离<=16广播4，否则0，自身AA2C。 |
| 5 | A9D0 | AAED | current5不再接受其它pending；首次切换处理孩子。 |
| 6 | AB39 | AB39 | 内部墙后继。 |
| 7 | AA2C | A82C RET | 锚点保持/孩子空操作。 |
| 8 | A7E6 RET | A82C RET | 内部空操作。 |
| 9 | A9FB | 表外 | 写中心锚点20h/20h及pending10。 |
| 10 | AA10 | 表外 | 每调用一次RNG；r&F8==0才C315，selector1BC+(r&3)。 |

组长11×11、孩子9×9共202个原指令前缀逐对验证到选中handler入口，current/路径/锚点与地址一致，前缀0R；**未将202次选表称为202次完整行为执行**。A754/A785按玩家侧后敌侧，各六组、组长后7孩子，active门后先A85B选目标再分派；失活组长则A83F让未在撤退的孩子pending5。A85B实际目标评分/空间过滤与表中动作callee不因选表认证而自动闭合。

原资源不发命令9，但表里存在9/10。字面写9搜索无命中不构成全程序间接不可达证明；真实写入者、异常表外索引和完整对象生命周期仍须单独判定，不新增随机发言或隐藏按钮。

## 7. 原始证书与继续闭合的接缝

父冻结报告`battle-lifecycle.md`（本批新增§12）SHA256：`f5c6fa8ddb6371747803237c4150ed2f953aee9c0f1e1288f6271c09bfdee387`。主要源/输出：

| 文件 | SHA256 |
| --- | --- |
| cfg.py | f614250ad2b2faa61fed4d87618b404b033483b02177ce9b1a1747f8a9f4e69c |
| cfg.json | f8616fc74396aa93c0e3bd8a951b07444e00bd1d8ebdb58ef3ddff79d6be45d6 |
| vm_probe.py | 631528345b523873ecee36d4f46846bf44e47263ed355de5ab35db956f701ef1 |
| cpu-class.py | d8db39261f9ce0f89e560f5599015fdf60b4966e5df546b50ef223a88915e7b3 |
| vm-certificates.json | fe2286f97838ef5f6c29a6322a898dea1d7f1fab8238b48cd941cb3fba79b271 |
| range_cfg.py | 1d204bfdf567870eb0a1fdcd35c2fc76227217288bead566bd56a2af33d26d4e |
| range-cfg.json | 00014a76064ea5cad01d7dd811fe72b58297c31807061a0587bc72de9182aa19 |

复演：在上述父私有目录禁用PYTHONOPTIMIZE，依次`python -B cfg.py`、`python -B vm_probe.py`、`python -B range_cfg.py`、`python -B parent-vm-check.py`；`parent-replay-check.json`保存四输出逐byte一致证据。初次父守卫工具把CRLF源码经read_text归一化后比原byte hash而失败，发生于CPU执行前；已保留`failed-parent-check-01.*`，改为先核raw bytes后才编译，从头重跑通过，不改KI/输入/期望。

后续必须闭合：C315正常返回ABI及设备/图形副作用；两步间R/PC/脚本存储写集；A1C5真实规则帧与9FDC非局部出口；A065目标、移动、伤害、补员/死亡及RNG链；所有剩余条件的真实字段生产者和持续状态；命令9/10写入者。下节记录新界面边界证书，仍不是以“未知列表”结项。

## 8. P07帧间接口复核：设备停止不等于正常返回

父已读完整追加报告§13、审`inventory.py/interfaces.py`及原C315/F4DF/F720/F75E/CC31、STR005D/00DF与YNVSHELL014C窗口，另目录复跑。**没有完整C315或A065→下次A426的执行证书**，§2条件模型的6边排除不升级为真实循环不可达。

### 8.1 已验证的局部边界

| 证书 | 实际终点/限制 |
| --- | --- |
| 01B4隐藏态 | 应用真实KI MZ重定位，内部mouse位于主CS+1000h；原far调用返回，外层恢复SI/DS/AX及SP，savedVisibility=FFFF |
| 01DB负savedVisibility | 原代码不操作光标，真实RET；不是把任何显示状态都当空操作 |
| 01B4可见态、01DB恢复显示 | 分别在真实VGA OUT、INT33之前停；未执行中断或显示端口 |
| C315 side0/1 | 执行到F9BE首OUT，两侧均停在真实callee内，未称整弹窗返回 |
| 07D2冷头像miss | 经E38C/F4DF至F4EE DOS open前停止，没有打开头像文件 |
| F51B两个独立后段 | 明确输入“DOS close已经返回”的寄存器/栈，不是从伪造INT返回接续；正常栈→E396/SP03E2，seek失败栈→旧BP=BEEF/SP03E0/DS3900 |

共9项：2个真实wrapper返回、5个外部停止、2个独立文件后段。R/PC与按CC31布局定位的256B脚本在这些区间最终不变，不宣称全帧写集保持。解释器的显式store日志不含PUSH用的独立word写助手，不能把它叫全内存写日志；这些固定栈范围由源码/轨迹及最终SP另核。

### 8.2 C315、字体缓冲和段布局

C315保存DS/AX/BX/CX/DX/DI，但**不自己保存SI**。C349/C34A另压两参数，C372加SP4，C385弹side；C38E..C393恢复六寄存器，C394→01DB后RET。因此SI保持必须追075B等所有callee及外部契约，不能从C315无MOV SI推导。

F720经INT15取得并自修改F789/F790的far目标；F75E保存DS/ES/SI/DI/BP，再令DS=ES=SS，分配32B栈字形缓冲，BP=SI=SP。父亲核STR.EXE双byte入口005D从END_S10.DAT请求30B并写尾word0，单byte00DF从END_S11.DAT请求15B并写尾byte0；**若选择这些入口**，目的地为传入的ES:SI栈缓冲，不是任意脚本堆。DOS保存/有限读取与旧INT15提供者仍需契约，未读字形文件、未执行STR或把另一提供者自动认成STR。

CC31令第二块基址为H（物理地址）：D306=H+3D200h、D42=H+44A00h、D30E=H+459A0h、D308=H+4A1A0h、D30A=H+4A2A0h、D30C=H+4A2E0h。脚本100h字节从最后一项起，**不是整个53560h块最后100h**。这是原布局计算；独立CPU夹具绑定H=40000h，不伪称已走DOS分配。cells/hitmap正常固定区域与脚本分离不够证明所有indexed/隐式store不越界。

### 8.3 F4DF错误路径不得伪造正常RET

原`F4F2 PUSH DS`在seek前执行；`F505 JB F513`却跳过正常read之后的`F512 POP DS`。假定DOS中断正常保持栈/BP：F4DF入口SP=S，正常close后SP=S−8，而seek失败后SP=S−10。尾段`ADD SP,6; POP BP; RET`因此失败时读原local+4为BP、读旧BP作IP，最终SP=S，而不是返回E396/SP=S+2。父复演的两个**独立后段输入**正好展示该差异，未称完整F4DF设备运行。

`F513 LAHF`后`F514 MOV AH,3E`已经覆盖保存的AH，F51B SAHF使用的是DOS-close实际返回AH，不能假定它恢复seek/read原flags。错误后旧BP可能落在其它代码，不能自动认成正常消息返回或必然安全退出。YNVSHELL原INT50错误处理尾0174是JMP自身，无正常IRET/RET；若确实进入该处理器，也不能当普通提示关闭后继续。

### 8.4 证据规模与继续工作

inventory是原语法过近似：frame/input包5966节点/497条写操作数/140边界，C315包1539节点/57条写操作数/95边界。CALL名义返回后继被枚举、设备/间接/非局部结束另列；**这些不是独立writer数量，也不是所有实参范围或真实返回证明**。命令9/10的有限写者封闭草案仍须与全对象/CS别名证明连接，暂不新增产品入口。

原包`C:/Users/fczll/AppData/Local/Temp/dragon-a05-frame-interface-smwt2av5/`；父冻结/复跑`C:/Users/fczll/AppData/Local/Temp/dragon-ai-vm-interface-parent-eivnd2nr/`，18文件保全。报告1246行/109068B，SHA `f28f4baa55e2a786c5c755e3f233ff14fe17b10b1827765faf274ebb6e0dc333`；五项报告pin亲核，三份输出逐byte一致：

- `inventory.py` SHA `1b92e0c6527496af7c4beaec4c575e35b50e750a08a31a42ac0e49a8a97a991d`；`interfaces.py` SHA `09a1472229b28c88b1e029daf474ef4357558f35810834a4713898e5c1bab052`。
- `interface-certificates.json` SHA `9934b3fab7c756987a1414c89ff1db8fff19ee9cc3291fa65c5a2b6cb50f044f`；父`parent-exact-replay.json`逐项分列范围，另`parent-abi-raw.txt`保留原窗。原KI hash同§1；STR SHA `6d7d709c173ae530faa86f2474f2b312c76597fb15623e82a3c93072fa6379fb`，YNVSHELL SHA `629d5c71c96b2502cd9d256b2fabd74e7275b7014f0a0743cd0dd07a8204a6b8`。
- 初跑缺ADC/RCL的fail-closed、错误script-watch位置、D52/D2E/D30物理地址少一位的旧夹具输出均保留，不冒称未失败；修正后父重新从源码执行。子首次正文21.75分钟才落盘，未满足18/20分钟收束要求，如实记录，不拿内容完整掩盖时限未达。

下一证据必须实际补齐设备/文件/字体/输入合同、所有间接写范围、IRQ和9FDC非局部退出，才能给真实跨步R/PC/script保持性判定；此处已把停止和失败单列，不能为了减少“未知”而手写返回。
