# 原始 AI 外交提案、事件消费与目标清理：P17–P30

**范围：A01提案生产、type1/type3/type8消费、type2有界消费者、3E11资金时相及3E8E外交官维护，不是全部外交或全AI完成。** 只研究影响AI选择、事件、目标与RNG的原指令，不继续字体/显示重建。[全链总纲](re-notes-ai-chain.md)维护最终验收，[P05](re-notes-ai-chain.md#9-p05旧增援请求跨局部停战后仍可被消费)维护已有NPC停战与旧请求消费接缝。

## 1. 原证、输入与复跑

原始只读白名单：`E:/Dragon/Dragon/KI.EXE` SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`；`E:/Dragon/原版/SINARIO.DAT` SHA256 `4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87`。VA加200h取文件地址，near目标16位回绕；未读写SAVE。

93个有界探针中92个原RET、1个未声明状态外读暂停；92个中有8个完整`2BD9`，其余为明确局部handler入口，不能倒推其战役生产者。另256个F28 byte值逐一执行原`2F2C..2F38`算术前缀，停在关系callee之前，不替身跳过callee。

私有1MiB RAM，CS1000、状态DS3000、候选ES8000、事件8900、SS1FC0/SP0400，玩家17。官方prefix`SINARIO[80h:56C0h]`与头部、所有initial RAM/寄存器及edits保留；这是该探针明确的拷入范围，不宣称整个5640h都是武将/城市规则记录。普通fixture按输入改活动势力/三池/计数/目标/关系及城市链接；`producer-official`在执行前恢复整个该prefix为官方字节。EC82使用声明RTC00:00:00播种，之后全为原ECE0，不预烧或手给提案随机数。

沿用P09已按目的字宽解释立即数的Month及四个固定依赖；每调用200000、每机器5000000指令上界，未定义标志/未知指令/消息/设备均拒绝。普通内存操作在已声明KI/状态/候选/事件区内；parent另检查隐式XLAT与真实栈读取，见§8。局部候选表有明确前提，21项耗尽用独立的21唯一战争对手覆盖；重复首项夹具不冒称正常构表会生成重复。

## 2. 2BD9的全局顺序

1. `2BE1/2BE8`写D20=0、31AD=7；事件区100h..3FFh前移到0..2FFh，清最后100h。
2. `2C15`以FFFF初始化22×30h候选。逐活动势力先真实2C52构造/去重/立即交换排序，再2D3A迁都提案门；不是先跑所有决策再补候选。
3. **所有候选构完后**，`2C39..2C47`依势力槽调用2D58。其内先2DB8（玩家2DF3）更新当前关系，再依次2E33、2E89、2EFB、条件性2F71及旧目标清理。提案读取当前关系，候选战争marker和顺序仍是先前快照。
4. type2/type3不互斥，也不阻止随后type1。2E89的CF不作为2D58后续分支条件；2D89只看2EFB的CF。

实际完整`producer-invite`先以R233排`[2,17,0,2]`到offset104，后以R218排`[1,0,17,FF]`到88。**生产先后与事件槽顺序不同**；这不是已经消费/提交战争的证明。官方完整2BD9为32634条/30次RNG。

## 3. 2E33协同邀请

当前势力A、旧目标T、玩家P：

- `2E42/2E47`：T==FF或T==P退出。
- `2E52..2E5F`：从DI找**精确word `P*40h`**；FFFF终止。带8000战争marker的玩家候选不匹配。函数本身没有另做“A必须非玩家”或双方实力/资金门，正常候选的排除/接壤来自构表。
- `2E66`要求raw `R[A][P]>=80h`；`2E77`要求raw `R[T][P]>=A3h`，两个等号均通过；方向不能对调。
- `2E7B`交换SI/DI，2FB1实际排`[2,P,A,T]`，不是`[2,A,P,T]`。

只有达到排队才1 RNG，满页或D20=100h失败也已消费；其它早退0 RNG。原AX/BX/SI/DI保存，DX作为A/T参数可改变，不应把返回CF当互斥决策布尔值。

## 4. 2E89裁减多敌

玩家方直接CLC。NPC用3091算己方P，DX=P，BP保存**第一候选原word**，CL=21；扫描连续战争前缀。FFFF或BH<80退出CLC。每项屏蔽marker后算对方P，`2EBA SUB DX,AX；2EBC JBE`：

- **相等或借位都进入提案段**；仅剩余严格>0才继续扣下个对手。
- 从触发的当前项继续扫描，先用原word与BP比较，相等则跳过。所以第一候选始终免于本段停战提案；即使它已耗尽己方实力也不向它提案。异常重复首word同样被跳过。
- 其它连续战争项各排`[3,A,B,FF]`，不再继续扣实力。遇和平/FFFF或CL耗尽结束。
- 提案段末`2EF1 STC`，**即使0条提案、0 RNG或全因页满失败**。STC表示进入过该段，不保证事件写入。未进入则2EF4 CLC。2D58不据此阻止type1。

三对手各100时，己方100/200均只排第二、三项（233/218两个随机字节）；己方300只排第三项（233）；己方301不提案且CF0。只有一个首项且己方100时0事件/0RNG但CF1。完整2BD9满页对照通过原事件页前移形成占用，两个失败仍耗233/218，CF并不表示成功入队。

## 5. 2EFB主动敌对提案

只取第一普通候选并屏蔽8000；不在这里扫描其它候选。门控顺序：

```text
解出的候选方号 != F19
s16(word[F+21]) > min(u8(F23)*16 + 40h, 61Ah)
raw R[A][B] <= (u8(F28 + (F28>>1) + 20) | 80h)
P(A) >= P(B) - floor(P(B)/4)
```

- 钱门`2F28 JGE`为signed，等号拒绝。城数93阈1552、94起封1562。
- 好战阈`2F33/2F35`都是byte加，之后OR80h，不是先&7F或宽整数。全256值执行：71→254、72→128、157→255、158→129；这不授权编辑器超出原样本0..15。
- 实力等号通过；敌101时己75拒绝、76/77通过，不是`floor(3*敌/4)`。
- 通过后排`[1,A,B,FF]`；原2F6C无论排队成功/失败均CLC，早拒STC（2F6E `pop di; stc; ret`，P34亲核）。此时**没有写F19或战争矩阵**。
- 候选entry格式（2C52..2D39 builder实锤）：每势力行0x30字节在段`987C`，行首0x0600=中立(0x18<<6)标记，普通entry=邻城owner<<6，FFFF=空。2EFB内**2F02 `bx=ax`先把完整被掩候选字保存，2F2A `di=bx`在2F2C `bl=[si+28]`覆写BL之前执行**，故关系门3119以完整字取to=highbyte(DI<<2)=T精确（FFFF时to=0xFF）。
- 无普通候选时FFFF不被本入口拒绝：masked为0x7FFF后，gate1解码target=0xFF——**F19==0xFF时在2F0B `je 2F6E`直接STC短路跳过所有门（P34实锤，Web已接线）**；否则关系门地址=0x600+24*A+0xFF（actor≤13在矩阵内=flat字节`rows[actor+10][15]`；actor≥14越过0x83F进入城记录区，经strict `nativeCityRecordRaw`读取，P34已接线），关系门过后3091以bx=0x7FFF读状态外内存，见§7。

## 6. 2F71与2D8E目标尾段

2F71只在2EFB返回CF1后调用：F19<18h直接返回；否则检查word ES:[DI−2]是否FFFF（不是字面必须0600；0600由正常空城邻接生产）。FFFF就清F19=FF。其余要求：

` s16(word[F+21]) > min(u8(F23)*16 + 60h, 6DDh) `

等号/负钱拒绝并清FF；城数103阈1744、104起封1757。通过且F19==18h只保留、0RNG；其它>=18h值排`[1,A,18h,FF]`，含满页失败仍1RNG，**排提案本身不提交18h目标**。

随后两个看似相同的18h比较不得合并：

- 经过2F71后，`2D8E`若F19仍18h则直接保留返回。
- 由2EFB的CLC直接到`2D94`，若旧F19为18h则清FF。故另一type1提案即使页满没写成，也会让旧空城目标被清。
- 其它普通旧目标，只有第一项AH!=FF、具有战争marker、解出的方号等于F19才保留；不扫描其它候选寻找旧目标。

`decision-replace-empty-full`事件区完全未变，但RNG+1、F19清FF、最终CF0，是两个返回层不能合并的实证。

## 7. 3091实力、排队与状态外读

3091精确算术：`S=(骑u16>>2)+(弓u16>>2)+(步u16>>2)`，最大49149，无word加法溢出。若highByte(S)>=F23则**重置为2000**，再S>2000也封2000；最后**unsigned**word[F+21]<=19使结果0。不是`min(S,城市*256,2000)`，不能与提案门signed钱比较合为“负钱实力0”。wordFFFF在本函数可保留实力200，提案资金门却因负值拒绝。现Web实力函数已有该重置/unsigned逻辑，不能因摘要原来含糊就误报它有此缺陷。

2FBF随机BL=FF先ECE0，起址D20+(R&7C)，只向后寻找4B首byte为0的槽到100h，不回绕。写两word(type,actor)/(target,extra)后CLC，满则STC。固定BL输入另有helper边证书，不等于A01提案实际使用该入口参数。

`producer-empty`由2BD9构出行首0600、普通第一项FFFF。P34亲核闭合其边界分类：gate1对FFFF解码=0xFF，F19==0xFF时在2F0B直接STC短路；F19!=0xFF时关系门按0x600+24*A+0xFF读取（A≤13为矩阵flat字节；A≥14为0x840起的城记录区字节）。关系门全部通过后，3091以bx=0x7FFF读DS:0x8003/0x8005/0x8007/0x8020/0x8022；**8CAE初始化只向D52:0载入0x5240字节（8CDB pin实锤），0x8003超出=未初始化RAM**。该路径的可达性依赖未初始化内存内容，静态不可排除；Web将其定为**永久fail-closed工程边界**（与all-inactive ring先例一致）：别名门如实读取并可通过，3094状态外读点继续stop，不补FF目标保护、不把默认零认作原运行内存。原先无读界版由默认零得到`[1,0,FF,FF]`的输出**撤销证书地位**，不是已确认的正常原局行为。

另完整`producer-neutral-relation-alias-gate`显式把状态关系别名字节设阈上值，令2EFB在关系门早拒，后走原2F71排空城提案。它证明该输入路径，不替代FFFF尾段未初始化值的正常前史。异常候选/外部内存的参数化读集仍须与正常生产者范围分别闭合，不能为了穷举而扩展到无关DOS/字体。

## 8. 逐边、父复核与失败记录

| 本体范围 | 条件数 | 有完整RET见证的边 |
| --- | ---: | ---: |
| 2D58（含目标尾段） | 8 | 16/16 |
| 2E33 | 6 | 12/12 |
| 2E89 | 9 | 18/18 |
| 2EFB | 5 | 10/10 |
| 2F71 | 5 | 10/10 |
| 2FB1/2FBF | 4 | 8/8 |
| 3091 | 3 | 6/6 |

80边由`branch-denominators.json`逐IP/bytes/真假目标/完整RET例名记录；并非全callee或全输入空间分母，不将P09剩84直接减80。实际583个IP的隐式源操作另有XLAT与REP MOVSW，不能仅检索显式`get`就宣称全读集受限。

原包`C:/Users/fczll/AppData/Local/Temp/dragon-ai-a01-8ri7r2r1/`；父冻结与干净复跑`C:/Users/fczll/AppData/Local/Temp/dragon-ai-a01-parent-ct66wtk_/`。540项manifest全部核对，5个CPU/依赖与已复核P09逐byte同。父读源并亲核原2BD9/2D58..300E/3091窗口；独立重跑93例、256域表及validator，**281输出逐byte同，2个JSON仅错误traceback目录或elapsedMinutes不同**，所有初末RAM均相同；不是283份全byte相同。

父`parent-read-audit.py`再令每个入口以下栈字节未知，只有原PUSH/写入才变已知，审计语义get/POP与隐式XLAT（不把日志取旧值算规则读取）。349个实例重跑93例+256前缀：4757次栈读无未知读取、216次XLAT均在声明区；280输出byte同，1个停止JSON仅增加审计栈traceback，控制POP未知1FC10被拒。首次审计因隔离输出目录少了用于source-hash的month_probe.py，在首例执行前失败；保留源/日志，补拷完全相同源后重跑。此证据不扩展到任意异步IRQ、DOS或战役输入。

子首版audit初始化属性错误及未加读界版均保留。原子任务exit0但native验收**rejected**：未提供no-staged-files肯定证据（子声明未查暂存）。父封存status和共享diff，实查当次Git index为空，不重写旧验收状态、不将文档变更误归为子改产品；上述是父独立研究验证，不冒称该自动门已通过。子正文14.60分钟固定，未达14分钟目标，也如实保留。

| 文件 | SHA256 |
| --- | --- |
| 父冻结报告 | 7a5fbf7b911dd1bded9c138561fb5ecb8a924fc4587c0871cc10e016e5da4181 |
| probe.py | b53e635441e68c4e23e7b502624287a7cd1cf959745f9e72390e662f14eafa00 |
| extras.py | e014f9cf9e97f843badbe54ff22bd01ec062bb332bc84de67035b64392f9781d |
| unique_lists.py | a1d198897bb4f615914053da4b506d0e379d79eafb3ae2e5e3701b4b96de8b02 |
| corrected month_probe.py | 3cd27ba95808bd03fb8dd205042500f54fa6946c21f03454459d6db5da81cf15 |
| parent-read-audit.py | 182b68f55dd34d033592bb0c6e98a6a8c5b31ea9716a382d1fa7c1f75a0d035b |

复核命令均在私有副本、禁PYTHONOPTIMIZE且`PYTHONDONTWRITEBYTECODE=1`：`python -B probe.py`、`extras.py`、`unique_lists.py`、`validate.py`；父再执行read-audit。旧包与失败版不覆盖，不执行其历史顶层夹具。

P17留下的NPC type3消费已由以下P18接入；type1/2及玩家消息返回、目标变化与实际城市/军团相位仍分别核验。80局部边不等于这些下游全部完成，也不证明所有军团返都是同一原因。本页未修改生产实现。

## 9. P18：真实type3生产与消费顺序

同一KI/官方SINARIO只读白名单，沿P09目的宽度修正CPU、私有1MiB RAM及CS1000/状态3000/候选8000/事件8900/SS1FC0:0400。全初末RAM、寄存器、所有edits与真实IP/RNG/写回保留；5继承CPU源与父P09逐byte同。每调用500000/每机器5000000步，未声明内存/标志/指令/玩家消息边界即停，不运行显示替身。98A6=0为明确界面更新门输入，原5E80测试bit1后在5E88 RET，不外推该位开启后的绘制域；旧“声效门”标签撤销，见P20§21。

35例分33个真实RET、2个玩家边界停止；另单独两次页尽31AE返回。3例从真实2BD9构表开始，只排`[3,0,2,FF]`到offset104，用掉233，原31AD=7；之后不改RAM，连续267次31AE才消费该条（7+26×10），经3262真正返回。D20=108、31AD=10，旧事件四字节仍在原槽，不在出队时清零。此为实际生产→轮询→消费，不是运行267个日/完整主tick。

| 输入与同流历史 | 真实消费结果 |
| --- | --- |
| 付款：0方钱100000、2方0 | 0方65000、2方35000；双方关系00→80 |
| 免费同意 | 钱不变，仍提交双方和平 |
| 双方政治10相等 | 生产先用233，37C5再用218偶数，付25000；独立3262从同种子先用233奇数则只付21000 |

生产后0方目标1、2方FF；本事件只与2方停战，不清0方对1方目标/战争。其它局部例明确入口为3262、AX=(A<<8)|3、DX=FF00|B、DS状态段，不宣称已经由原队列产生。所有当前势力/城市/政治/被俘值仍是显式场景输入，非完整战役前史。

## 10. 3771代表选择：不对称失败与军团槽别名

3262构造SI=B×40h（接收方）、DI=A×40h（提出方）：

1. B.F2A!=FF：直接按该将号读政治，不另查所属、active、身份；否则37F5选A方闲将，失败CF1直接返回，3262不提交。
2. B.F1君主号r，原3795..379E直接读取`L=2240h+r*40h`的首byte。之后37A4检查`G=4240h+r*20h`的+17；非0且L首byte<80则失败，>=80才用该君主政治。**没有搜索军团+2主将匹配，也没有在此验证L所属/主将。**
3. 君主+17==0，另37F5选B方最高政治闲将。37F5只扫0..126、所属相等/+17零/政治严格>当前最大，无active门，同分取先者，全0失败。G127不被扫描。
4. **第二次37F5的失败CF未检查**：37B0把返回AX当BX，37BC读[BX+13]。正常B=2且无可选人时AX0200，因此实际读DS:0213（此输入物理30213），不是武将。此例明确给该状态别名字节7后完整返回，不能用默认零、君主补选或统一失败返回掩盖。

父两个额外完整3262对照：君主20有活动军团25（+2=20），但槽20非活动，仍失败且钱/战争不变；反之槽20活动、其+2=127，仍按君主20政治谈成35000。两例0RNG。这撤销旧Skill“只有主将索引匹配的军团有效”，但不声明每个异常槽组合都有合法战役生产链。

令p为第一代表政治、q为第二代表政治，unsigned比较：q>p取q，q<p取u8(16−p)；相等才取一次RNG，偶数取q、奇数取u8(16−p)。最终t=u8(所取byte×2)。选最高政治本身0RNG，不是姓名或实力概率。

## 11. 36C4费用、拒绝及饱和付款

原36CC..370F，R为接收方B→提出方A的关系raw，v=B.F28：

```text
k = B.F19 == A ? 2 : 1
a = u8(v + 2)
g = max(0, (R & 127) - a)              # unsigned SUB借位才下封0
b = u8(t + u8(30 - g))
if s8(b) < 0: b = 0                   # 是signed byte门，不是宽整数负值
fee = (b >> 1) * 1000
AL = fee == 0 ? 0 : k
```

计算成功必CLC；NPC AL>=2拒绝，0免费/1付费才进入提交。所以已有目标正是提出方通常k2，但fee0仍AL0免费同意。t40/v0时R70费用1000、R71免费；加总126→63000、128按signed门→免费；政治倍增也先byte回绕。费用最大63000，不凭经验加余额/关系/兵力守门。

3262没有351A活动检查；明确A inactive输入仍可能同意。付款者−649000仍付35000，真实563B下封−655000；收款方654000真实5609上封655000，付款仍扣全额。两端分别饱和，不能为强制资金守恒改扣量。

## 12. 互俘、部分提交与和平边界

37D8调用3138两次计互俘数，但3138末`3167 CMP AX,AX；3169 JE；316D CLC`，所有有限输入都CF0；37DF/37E9后两个OR永远跳过，AH=0。**这不代表实际互俘释放被跳过**。

NPC同意后原顺序：

```text
35ED: AL1先加接收方钱，再扣提出方；AL0跳钱
      扫127将，word[G+1C]匹配(A,B)或(B,A) → 50D7
45F8: 各自目标若等于另一方，才清FF
4236: 城current/oldOwner都在{A,B}内，才oldOwner=current
3669: 双向raw的unsigned最小值OR80，写双方
```

50D7先清G+17、换出并清旧属+1D；旧方首byte>=80恢复current，否则FF。2AD2以AH=FF不扣旧方将数，有效AL则恢复方计数byte++。例G40回0/G41回2、身份0/旧属FF，G127仍被俘。35ED不清外交官字段，也不创建军团，不能根据AH0删掉交换循环。3669对250/130或130/250都写130，不是各自OR80或先比较低7位。

两条**真实暂停而非正常RET**：

- 接收方玩家：3262→3287 CALL38C7，停38C7入口；计算值不替代玩家选择，尚未付款或和平。
- 提出方玩家、接收NPC同意：35000钱已转移、G40已恢复玩家/身份与旧属已清、将数已增加，随后50D7→5104 CALL CDE，停CDE入口；尚未执行45F8/4236/3669，双方关系仍00。不能整体回滚，也不能提前全部提交或消息返回后重复扣钱/加将数。

以上暂停只界定AI必要的前后写回，不继续字体/显示研究。通用“外交全部等最后消息才一次性提交”须撤销为逐原调用边界提交。整段NPC停战没有写军团命令/目标的广播，不能单凭停战得出全军返都。

页尽独立输入：31AE在倒数1→0且D20>=100h时直接RET、不重装；再调用倒数0→FF仍RET，不消费。不是每次页尽都能继续取条目。

## 13. P18逐边与父独立验证

| 原范围 | 完整RET见证边/分母 |
| --- | ---: |
| 31AE | 6/6 |
| 3262 | 5/6 |
| 36C4 | 10/10 |
| 3771 | 14/14 |
| 37D8 | 2/4 |
| 37F5 | 10/10 |
| 3138 | 7/8 |
| 35ED | 8/8 |
| 50D7 | 3/4 |
| 45F8 | 4/4 |
| 4236 | 10/10 |
| 3669 | 4/6 |

90条边中83有完整RET见证；2条仅玩家暂停前缀；3条由CMP AX,AX证明不可走；2条AL/AH=18h早退在本次正常NPC编号域外，不从通用函数删除。逐IP原byte/真假目标/完整与暂停例名保留`branch-denominators.json`。不与P17的80或P09余84混算。

原包`C:/Users/fczll/AppData/Local/Temp/dragon-ai-type3-ekek8axi/`，父冻结/干净复跑`C:/Users/fczll/AppData/Local/Temp/dragon-ai-truce-parent-o1zam_fo/`。核302项manifest和5继承源、亲读上述12原窗后重跑probe/extras/validator：**108文件逐byte同（全部72份RAM），3JSON只有异常traceback目录/AST渲染行或elapsedMinutes不同**，见`parent-replay-comparison.json`。两个停止的终端错误及栈frame文件/行/函数完全相同，不抹掉任意机器字段差异。

父`parent-read-audit.py`再令入口以下栈未知，只有原PUSH/写入解标，显式语义读/POP及隐式XLAT均检查；重跑35例+页尽及2个军团槽反例，2999栈读/21XLAT无未知读取，负控制POP1FC10拒绝。原35例/页尽106输出byte同、2停止JSON仅多审计traceback；两槽反例另存`read-audit/ruler-controls/`。这不是任意IRQ/DOS或全部运行输入认证。

| 来源 | SHA256 |
| --- | --- |
| 父冻结报告 | f747eaa26d82f409a8e4cd88fb1211dd52d3ad36aef59ded5e89260034ee22ea |
| probe.py | e37f3d6bfeec7669d285d8633aa52be63517310a370e36f01fb7ee7d21ecc922 |
| extras.py | 9d29a0c1e8839558efbbf5e31d47c459d324904a224e4dc80e3fc76c21dc5807 |
| validate.py | f85117704456501cf8330449a404fe1d90eb6c6d92ce7e83361f289f6f17901f |
| parent-read-audit.py | cdbc4f9fadf9c9d5c27a7dcc27d8f2943d00a7632805b93700c1e7d9113d0292 |

失败与修正全部保留：子首轮RNG阶段误标5358，修标签后23份旧末RAM仍同；私有producer目录已存在导致重跑失败，允许重用本轮自有目录后重跑，不改旧输入；正文14.37分钟错过14分钟前软目标。父最终比较器先因shell反斜杠语法错误失败，后发现Python AST traceback引用同名不同源缓存的代码摘录，改为严格比较frame身份/终端错误，完整保留两个版本/差异，不改CPU结果。此次子complete/attested且真实只读查过index为空，不追溯改写P17 rejected。

P18之后的type1/迁都局部写回见P19，type2有界消费见P22；城市/军团实际相位及玩家决定/消息返回继续独立核验。P18不构成全AI或用户战役单因认证，未修改生产/正式测试。

## 14. P19：type1生产后重新门控

**置信度：以下原门控、字宽、写集及已执行返回内的顺序为限定输入的实锤；完整战役前史与三个消息入口之后仍为继续研究项。** 不将局部证书升级为全链完成。

同一KI/官方SINARIO白名单，P09目的位宽修正Month及四个已pin依赖，私有CS1000/状态3000/候选8000/事件8900/SS1FC0:0400、完整初末RAM/源/输入edits。53例中50个原RET、3个真实消息入口停止；每根500000/每机器5000000指令上限，未定义FLAGS/未声明读取/指令拒绝。RTC00:00:00原EC82播种；不执行字体/显示替身。

9例先实际2BD9：233用于2D3A且未产type8，218由2EFB排`[1,0,2,FF]`到offset88。生产后双方F19均FF，关系94/BE；**然后**按记录的外部合同改active/F19/实力/资金，队列与RNG保持。227次原31AE（7+22×10）消费后D20=92、31AD=10，旧事件4B仍在原槽；不是227天/完整主tick，也不把外部修改假称战役前史。所有type1消费者0新RNG。

原门控顺序：

1. 320C两次351A分别检验提出方A与目标B：以编号×40h取记录，首byte>=80通过；无编号范围门。任一失败直接返回。
2. 352A/352E：**A.F19 unsigned<18h就拒绝整条**，不只是拒绝相同目标；18h/FF都可通过。
3. B=18h跳过关系/显示；其它B取A→B raw，已战<80h走无通知提交，和平才可能走玩家消息。A是玩家停CDE，B是玩家停CE7，这两次暂停均尚未写目标/关系。
4. 3593只给NPC提出方写F19=B，玩家跳过；随后35AB被攻击方响应，再3639双向关系。

基准最终目标[2,0]、关系[0A,0A]；排队后A.F19改2则消费但关系仍94/BE，不再提交；改18h仍可提交；排队后任一首byte改7F则拒绝。**成功排队不等于消费时仍通过条件。** 独立320C接口为AH=A/DL=B/DS=状态段；不是已执行事件生产者。

中立B=18h在351A实际访问状态0600首byte（关系区别名），本例显式设80；不能凭此宣称所有中立事件的活动检查都成功，更不能补一个中立势力对象。

## 15. 35AB旧目标实力与战争写回

B是玩家或18h不改其目标；其它NPC令T=B.F19：

```text
if u8(T) >= 0x24: B.F19 = A
else:
    if P(T) < P(A): B.F19 = A
    else: 保留T
```

35C3字节`80 FC 24`的阈值是**24h=36，不是18h=24**。实际比较的是旧目标P(T)和新进攻者P(A)，不是防守方自身力量；严格小于才换，相等保留。无旧目标active门。P沿§7的3091，不把unsigned资金门改成signed。

P(A)=200时T的199换目标，200/201保持；防守B自身力量0↔2000不改变结果。T inactive但P(T)=201仍保留；A资金高word19令P(A)=0，FFFF按unsigned门保留力量，消费者没有另加余额检查或扣钱。

旧T=18h/23h仍计算T×40h：分别读状态0604/0606/0608/0623/0621与08C4/08C6/08C8/08E3/08E1的已声明别名，不自动当作非法目标。T>=24h才直接改A。这些是明确异常输入事实，不代表该旧值都有正常战役生产者。

3639任一编号18h早退；其它编号经3697计算两个24列索引，ADD低byte/ADC高byte进位不能丢。3644先取两方向**unsigned raw最小值**，再`(minRaw&7Fh)>>1`写双方：90/C0→08，80/80→00，40/20→10，FA/82或82/FA→01。已战且通过F19门仍再次减半，不是“已经交战就完全不处理”。A10/B17的原索引进位有独立完整320C例。

这条type1完成没有军团命令/目标广播。它改变的是外交/战略目标，不能直接认定全军返都原因。

生产现以`originalwarconsumer.js`和固定势力/外交矩阵Scenario桥放行native type1：两次active和A.F19门按消费时重查；和平NPC→NPC或已战路径才继续，依序即时写A目标、按3091比较旧目标与A后可写B目标，最后取双向raw较小值清bit7/右移1并写两向。CFD在3549与358C按原时点独立读取，CFF只在3558/35AC读取，二者不互推；已战玩家路径无需消息仍可返回。旧目标24h以下但超出当前固定22势力表的状态别名仍在A目标已写后停，不补力量。P87：live CFD由loadState在initPlayer之后绑定（1B17-equivalent，slot*0x40；fresh与读档同一落点，未选定留空；`verify_player_faction_pointer.mjs`锁定3549路由与三形态）。

**P25：两类和平玩家消息返回已按真实TALK关闭合同接回。** `originalBeginWarEvent320C`只做门控与消息路由，不写目标/关系；和平且发起方是玩家（3549命中CFD）进入`aggressor-message`（3550 CDE→3570 8810，selector CX=0x1A0即TALK486..488，发起方君主对白，\3=目标君主、\4=军师），和平且防守方是玩家（3558命中CFF）进入`defender-report`（3563 CE7→356B 8810 TALK63，\3=发起方君主），TALK63真实关闭后经`originalContinueWarEvent356E`进入`defender-message`（同一8810的3570段，selector CX=0x19F即TALK478..480，发起方君主对白）。所有必需消息真实关闭后才由`originalCommitWarEvent358C`执行358C→3593（玩家发起者跳过A.F19写）→35AB（玩家防守方跳过B响应）→3639双向关系提交；CFD/CFF在提交时重新独立读取。缺TALK显示能力、重复continuation或跨scenario回调均fail-closed并hold，无部分写入后伪装成功。`verify_native_war_consumer.mjs`以固定KI字节和9项回归锁定消费重门、3091、旧目标实力、CFD/CFF、关系写回、两类消息先消息后提交顺序及失败前缀。18h中立活动别名和其它type2–7仍未放行。

## 16. 独立type8迁都与精确军团写集

10个独立33EA输入，不冒称已由2D3A排队。33EF先拒玩家编号，33F6再拒inactive。6A3D按192城号升序：owner匹配；`C+16低4位`不得大于当前BL，`C+0E生产word`不得小于当前DX，两门同时满足。BH尚0时可更新普通候选；一旦选到`C.attr&1F==0`置BH1，后续只允许同类候选替换，仍须满足前两门。完全平手取后城；不是先全局挑偏好类再独立排序。

旧都5、候选7类型更低/生产更高，选7；再加完全平手8选8；7生产低或类型更大则留5；锁定7后8即使数值更优但attr低5非0，也不替换。33EA先XCHG写F3，新旧相同直接返回。

4502的输入是AL新都、AH旧都、BL势力，**只扫127槽0..126**：同属、首byte>=80、L20=旧都，才写L20=新都；随后仅word L14恰等**新都×8**才反写旧都×8并status OR2。L23从未写入。

| 从5迁7的槽输入 | 原返回后 |
| --- | --- |
| 槽0：status80，L20=5/L14=40/L23=2 | L20=7，L14/status/L23不变 |
| 槽1：status80，L20=5/L14=56/L23=1 | L20=7/L14=40/status82，L23不变 |
| 槽2：L20=9，其它同匹配条件 | 不变 |
| 槽3异势力、槽4 status7F、槽127 | 全部不变 |

实际军团写点仅452E(+20)、4536(+14)、4539(status)。**不是把所有军团目标改新都，不清导航，不写状态11返都。** F2A=FF静默RET；有外交官则在原3464→CDE停止时，F3与这些军团字段已经提交，不能消息返回后重做迁都。

无己城输入中6A3D返回FFFF/CF1，但33FD未检查CF；`u16((FFFF−0840)<<3)=BDF8`，高byteBD令新都189，原4502后完整返回。这只认证该异常输入计算；不追加“失败保留旧都/改0”经验补丁，也不证明正常AI会丢光城市后仍到此。

生产现以`originalcapitalrelocation.js`和严格Scenario桥接回native type8：先按CFF拒玩家、再查固定势力active，固定192城执行6A3D并先写F+3，随后4502只扫L0..L126。CFD保持独立word；若它与事件势力pointer相等但CFF不等，已提交迁都/军团前缀后停在341F未闭合玩家消息/5E60。普通NPC无外交官直接返回；有外交官时严格等待通用TALK57关闭，再按selector 1A4和外交官talk_idx等待第二段个性对白关闭，才恢复同一3E11尾段。全程0 RNG，槽127不读；任一后段缺字段保留先前资本或军团写入并hold。`verify_native_capital_relocation.mjs`以固定KI字节和7项回归锁定后城平手、偏好、无城189、两段返回、CFD/CFF分歧、失败前缀及live中立城（P89：实机tick 243首崩“city 6 owner at 6A50”——live中立城`faction`为null而fixture用0xff哨兵，套件恒绿掩盖；根因为首都域`readCityOwner`独漏`null→0x18`映射，其余四域negotiation/capture/fate/warconsumer皆有，原码依据42AB端点谓词“非己且非0x18”；0x18永不等于真实势力，6A3D扫描跳过中立城；修后先红后绿+实机复测tick 1000+零pageerror）。此接线不扩大type1–7、完整8810或5E60。

## 17. P19复跑、独立审阅与输入修订说明

原包`C:/Users/fczll/AppData/Local/Temp/dragon-ai-type1-rr48uv07/`；父冻结/干净复跑`C:/Users/fczll/AppData/Local/Temp/dragon-ai-war-capital-parent-h7kzzn_z/`。核179项manifest与5继承源，读probe/capital/carry/validate，亲核6原窗，再运行53例与validator：**157文件逐byte同（全部106份RAM），4JSON仅traceback目录/代码摘录或elapsedMinutes不同**。`parent-replay-comparison.json`保存每项；终端异常及frame身份必须同，机器字段不忽略。

新鲜上下文reviewer `3324f537-dae4-45a6-a19f-5c62f44aa3e2`逐源审阅，限定X节无机制blocker，指出两个有效非阻断缺口。父未改冻结包，新增处理：

- **initialRegs标签不是真入口**：probe.run在装DS/AX/DX前保存快照。`parent-entry-contracts.json`按原53例顺序记录每次调用准备完成的寄存器和真实首指令寄存器。基准实际DS3000/AX1/DXFF02，SP0400在真实入口因CALL成为03FE；旧JSON的DS1000/AX1234/DX4567是pre-setup，不可直接配entry重放。
- **显式get不覆盖隐式源**：父`parent-read-audit.py`审所有语义get、POP/RET、XLAT及LDS/LES（本批后两者未执行）；REP MOVSW经原get，STOS只有目的写。入口以下栈全未知，原PUSH/写入即时解标，日志取旧值不算规则读。重跑53例4742栈读/36XLAT无未知读；156输出byte同、3停止JSON只增审计traceback，全部106RAM同。负控制未知POP1FC10、越界XLAT地址0都拒绝。

| 精确范围 | 完整RET见证边/分母 |
| --- | ---: |
| 320C | 4/4 |
| 351A | 0/0（CMP返回CF，调用者分支计在320C） |
| 3526 | 10/12 |
| 35AB | 8/8 |
| 3639/3644 | 5/6 |
| 33EA..3484 | 8/10 |
| 6A3D | 14/14 |
| 4502 | 10/10 |

共64边59完整RET、3仅玩家/迁都消息暂停前缀；363B的AL18h在本正常NPC发起域外，341F玩家分支在CFF/CFD一致且经33EF时被提前排除。不是用不一致玩家头部凑覆盖，也不把域外通用分支删除。详细每个原byte/真假目标/案例列表在branch-denominators.json。

| 来源 | SHA256 |
| --- | --- |
| 父冻结X报告 | 0617546994fd6c69151598eeab1d6de03204563de6580fe78c026fbbe5f0388b |
| probe.py | 5e6e05f9412f7f675ca5f186e9632c35367fe843dc44f1b110120d8df9e9e73e |
| capital.py | 5fcc5e072212c7b3d9b58f0762a939d15a626d518887600e1ea52cd5f7f1946d |
| carry.py | 267ac6e837325f985d521f1f30830682e89783e116c09a5aa9bcafc501236b1c |
| validate.py | 886b427cdb7375f64ce0f2aa6dbe2379863aa905afd9b880c3eafa891e90448e |
| 父read-audit | e3a95fa3d5db3852493bbf8a90552337a554a09b80bbcb4b0dc096cf129e1c59 |
| fresh-review.md | 240bf08b1071bdd7a8f49bbd93e15c634cd5e40ec2e1e6d5d6016bce5ce85c5f |

原子run为complete、native证据checked但**review-required**，父另有上述fresh审阅与补证，不追溯改写native状态或声称自动门已经reviewed。复跑均禁PYTHONOPTIMIZE、使用`python -B`和禁止pycache；未改生产/正式测试。实际type8生产消费及3E11财政接缝见P20，维护见P21，type2有界消费者见P22；玩家返回与城市/军团行为继续，全AI与用户战役因果证书仍未完成。

## 18. P20：原type8生产与消费不重复检查同一个门

沿相同KI/官方SINARIO及P19六份固定继承源，26例分24消费完整RET、1满页仅生产RET、1真实迁都消息入口停。入口合同为CS1000/状态3000/候选8000/队列8900/SS1FC0；根调用由既有execute建立返回word=0000、SP减2的**外部调用帧**，不冒称前一KI CALL已经执行，内部CALL/PUSH/RET均原指令。每调用500000/每机器5000000步；98A6=0使原5E80界面更新门返回，不推广到其绘制开启域。以下输入内门控/写集为实锤，不认证完整主tick或战役前史。

8个活动方0..7、F19全FF、低资金及明确城市候选，通常玩家17。真实2BD9第一轮2D3A自然依次消费`233,218,100,128,124,193,143,62`，前七次不排；方7的62<40h后，原2FB1消费第九字节187，排`[8,7,FF,FF]`到offset56。没有预烧RNG、改index或手写该事件。

31AD由原生产置7，147次原31AE（7+14×10）消费后D20=60/倒数10，旧4B仍在，RNG仍9次。33EA→6A3D→4502将7方旧都7换20；L20/L14/status写集沿§16，L23未写。

| 真实排队之后的显式变化 | 原消费结果 |
| --- | --- |
| F7.F19改2 | 仍迁都20，保留目标2；**不重查生产FF门** |
| F7失活 | 消费但保留都7 |
| F7首都已为20 | 原退出，不重复军团调整 |
| 玩家从生产入口就是7，CFF/CFD一致 | 仍自然产生同事件，消费者玩家门退出 |
| 候选城20易主 | 只剩原都7，保留7 |
| 两候选城都易主 | 沿原无城失败转换得到189；仅异常状态变化合同 |
| F7.F2A改10 | 都/军团写回完成后停CDE入口；不假返回 |

满页输入是旧未来页100h..1FFh占用，由原2BD9搬到当前页；仍9次RNG但没有方7新事件。只认证生产RET，不消费其它占位事件来冒称迁都成功。

## 19. 3E11：先消费，再按独立游标清目标

17例先沿P19真实2BD9排`[1,0,2,FF]`@88，使用233/218；双方F19均FF，之后才改明示财政/游标输入。先原31AE轮询到该事件即将消费，**最后一次进入3E11，由其原CALL31AE消费，再继续同一次资金门/维护费/游标**。前226次不是完整势力时刻，D1C是本次明确入口值。

原顺序：`3E11 CALL31AE → 3E14重新取D1C → 资金门 → 3E65累计费 → 3E8E维护 → D1C+=40h/到580h归零 → 原5E80界面更新门 → RET`。不把消费者遗留SI或事件actor当游标。

当前游标方F首byte>=80才先AND BFh清财政bit6。令`n=u8(F23)`、`h=s16(word[F21])`：

- h>8n+24：保留目标；
- h<=8n+24：3E38清F19=FF；其中h<=4n+12还OR40h。两个等号均进入处理。

n=10时上门104、下门52。D1C=提出方0、h104：**3593刚写目标2，随后同一次3E11的3E38又清FF，但双方战争关系已经是0A/0A**。h105保留2；h52或−1清FF并置财政位。没有撤销战争，也没有军团返都广播。

D1C=防守方2、h104只清其刚响应的目标0，提出方目标2保留；游标=第三方1只处理第三方，明确旧目标5的例变FF，不影响交战双方目标。游标21最终推进到580h后归零，不随事件方号重置。

## 20. 维护费时相与5673的有符号高byte

资金门之后，**游标方inactive也仍调用3E65/3E8E**。两次ADD/ADC保留三池u16总和进位，五次SHR/RCR得到`floor((骑+弓+步)/32)`，不是分别除32再求和。经5673只累加F1A..1C，**不在此扣现金或重新判断财政位**；实际扣款/月结仍见[P08](re-notes-ai-fiscal.md)。

池800→25；池400→12；三个FFFF→6143。旧费654999加后为655000，h105仍留新目标2；654975+25恰655000，654974+25为654999。inactive21仍累计31。3E8E的F2A通常FF早退；一个F2A10例在原233/218之后自然取100，因>=20h返回，RNG发生于费用之后。P20未走完低随机后继；后续真实轮转和预算/关系维护见[P21](#22-p21真实势力轮转与自然低随机门)。

**“费用恒封顶655000”只适用于相应输入域，不是任意u24字段的原码公式。** 567B/567E为`CMP DL,9 / signed JL`，5682也用signed JG；低word才unsigned比较FE98h。本3E65输入下令`q=u24(旧费+本次费)`，精确结果为：

```text
655000 <= q < 800000h ? 655000 : q
```

父另以四个明确异常旧费跑完整type1→3E11（每次仍只有233/218、目标2保留）：

| 旧费hex | +25后的原写回hex |
| --- | --- |
| 7FFFE6 | 09FE98（655000） |
| 7FFFE7 | 800000 |
| 800000 | 800019 |
| FFFFFF | 000018 |

这些证明高byte符号门和u24回绕，不声明正常战役会产生该异常旧费，也不据此扩大编辑器合法域。四例两独立目录17输出逐byte同，1820栈读/16XLAT无未知读取；详证`expense-domain/parent-expense-domain.py`及repeat比较。

## 21. P20父复核与剩余范围

原包`C:/Users/fczll/AppData/Local/Temp/dragon-ai-type8-chain-r29p1a88/`；父冻结/复跑`C:/Users/fczll/AppData/Local/Temp/dragon-ai-capital-tick-parent-g4eimxp8/`。127项manifest、10源AST、6继承源与P19逐byte同；父亲核2D3A、3E11、3E65、3E8E、5673五原窗，干净重跑四脚本：**105输出byte同、2JSON只traceback目录/摘录或elapsedMinutes，全部78RAM同**。未忽略机器字段。

新Guard跨生产/轮询/消费保持未知栈，由实际PUSH/写即时解除；显式get、POP/RET、XLAT、LDS/LES四byte及字符串读检查。26例12801栈读/222XLAT，没有实际LDS/LES/MOVSB/LODSB，REP MOVSW仍按原get搬页。POP未知栈和XLAT越界是原指令负控；LDS尾半word未知、LES越界仅guard单元，不能混报执行覆盖。

父另校验5061调用的实际入口：除了IP/SP，所有寄存器与caller一致；cap_boundaries独立sourceSHA核对。`parent-state-check.py`从生产后RAM应用记录的外部变化，按上述原门/已核都选择结果独立预测完整状态段0000..563F，26例逐byte一致，范围止于真实RET/指定CDE停点。

| 本体 | 完整RET见证边/分母 |
| --- | ---: |
| 2D3A | 4/4 |
| 3E11 | 8/8 |
| 3E65 | 0/0（carry输入另有证书） |
| 5673 | 6/6 |
| 3E8E | 3/16 |

不将旧33EA/6A3D/4502覆盖凑入新分母。P20的3E8E仍是3/16，后续P21另给全原byte域16边证书；玩家通知返回、完整主时刻和军团因果不由局部调用替代。

| 来源 | SHA256 |
| --- | --- |
| 父冻结Y报告 | d41e69d0afe5644499dd0a2f878293f7093f011857bdd0d0c35e3a5f0270cc77 |
| probe.py | a662a848cab7ba5868a5eb1343fd0bddcbe89497923c42400a7c5e57f2ee2922 |
| extras.py | 7e572657aeb1d51015a6bafe202a796e8f21812a50adec8a12af95f18f0a5beb |
| cap_boundaries.py | ca00e78c5dc0c2ae321239f25a4fdfa66e23c67d0dc4864efb092e0d3de2e35f |
| validate.py | 6ae527864713f26a6aa27edd217eafdc94ecbf96130d0e97682751e1795b5537 |
| 父异常费用四例 | 8d047ac59a46b6c455705a13d57d9ec8955199eb46702eb824b9d87f6fa1e537 |

**术语更正，不改执行证书**：父另亲核5E80，`TEST CS:[98A6],2`为0就在5E88 RET；非0才取玩家CFD并按AL位分派5EB7/5F27/5F5D/5F7F界面字段更新。P18及本轮初稿误称“声效门”，现撤销；冻结包原字节/轨迹不改。这里证明给定关闭位的真实返回，不延展字体/绘制专项。

本run complete/attested，不改P19原review-required历史。子曾误列一次TEMP目录名，未打开无关文件、未作证据；native窗口历时22分55秒，未以完成状态掩盖16分钟窗口未达。父未改冻结包或生产/正式测试；全部执行禁优化/禁pycache，未接触SAVE或运行原EXE。

## 22. P21真实势力轮转与自然低随机门

**实锤限于本节入口合同及后述原byte域，不是完整主循环/战役。** 真2BD9仍用233/218排`[1,0,2,FF]`@88；随后明示任用引用F0+2A=10、G10政治10/预算200等输入，并非已证明正常任命生产者。此后连续397次完整原3E11，D1C由原指令按0..21轮转；未手改游标、RNG表/index或预烧随机数。固定日历没有跨月，也没有执行其它城市/军团系统。

第227次调用（零基tick226，游标势力6）由内部31AE消费type1。第243次（tick242，游标0）自然取R23、R120；费用275→300先发生，预算200→187，双向关系raw182→183，D1C返回40h、队列游标96。tick396再自然取R10、R216，费用450→475、预算187→174、raw183→184，队列游标156→160。

完整连续序列为`233,218,100,128,124,193,143,62,187,252,238,38,47,23,120,215,159,112,179,41,164,10,216`。父从397条轮转记录独立核对只有游标0有引用：19次第一随机、两次第二随机，加生产2次共23次；不是用指定R23重新播种。

## 23. 3E8E预算、政治与返回FLAGS

原`3E8E..3EFC`，SI是当前势力偏移。依次：

1. F2A==FF直接RET、0 RNG；否则取r1，r1>=32 RET。
2. G=`4240h+u8(F2A)*20h`，G+1A预算b为0即RET，仍已耗r1。
3. p=`u8(G+13)`，先算`k=u8(23-p)`，再byte SUB预算。无借位写b-k，有借位再MOV 0，即`max(b-k,0)`，不能省略k的byte回绕。
4. **刚扣成0也不退出**，仍取r2；仅`(r2&15)>p`拒绝关系更新。等号通过，拒绝不退还预算。
5. 成功才进310A和以下关系写回，然后原RET至3E4C、3E11尾部。

p10/b12借位清0仍消费第二随机；b13恰清0亦继续；p7对低4bit=8拒绝、p8通过。p23的k0；p24的k255，b254借位、b255恰零；p255的k24。异常政治byte只作原算术域，不宣称正常能力或批准编辑器范围。

本窗不读势力活动、武将所属/身份或玩家自反条件；3E11活动门亦不包住维护调用。**旧“修改武将所属”动态例存在偏移标注错误，必须按§26勘误及父补证使用。** 不能用旧case名反证字段。

3EFC不是统一CF成功协议：可能留下CMP或OR的FLAGS，OR后AF无定义；根返回最后5E80 TEST又覆盖FLAGS，AF仍不可作定义值。给定98A6 bit1=0为真实界面门RET，不是声音替身，不扩显示路径。

## 24. 双向关系只增长一步且各保留状态位

正常对齐偏移SI=A*40h、CFD=P*40h时，原310A/3119令BX=`600h+A*24+P`，DX=`600h+P*24+A`；3ED2再复制DX至DI。A0/P17为0611h/0798h，不按外交官当前所属选方向。

设两旧raw为a、b，`inc(v)=(v&80h)|((v&7Fh)+((v&7Fh)<100 ? 1 : 0))`。先写a'=inc(a)，仅当**完整unsigned raw** a'>b时才写inc(b)，否则不写反向。各自保留bit7，旧low7>=100不增，**101..127不钳回100**；不自动修复不一致的两向战争/和平位。

90/10→91/11，而非91/91；10/11→11/11且无反向写；128/100→129/100；255/255保持。自反输入CFD=CFF=0，BX=DI=0600h，99只到100：旧b已在正向写前装DL，第二次可能写同一个100，不是再读新值加到101，也不是自反早退。

## 25. P21分母、输入域与独立复跑

原包`C:/Users/fczll/AppData/Local/Temp/dragon-ai-maintenance-869xkuvm/`；父冻结/复跑`C:/Users/fczll/AppData/Local/Temp/dragon-ai-envoy-parent-evi03zcb/`。报告最终2986行/235420B，旧Y的225806B前缀同；通知2927行只是较早长度。122项manifest同，7继承源同P20；11当前Python AST通过，另一个故意保留的首版SyntaxError未执行规则，不作为当前源。

**1主例+26真实caller续段=27例：26 RET、1声明域外读停止。** 低入口在真实3E49 CALL之后、3E8E第一条之前保存完整RAM/寄存器/valid/未知栈；局部输入后直接step，未重造内部CALL。外部根word0000是明示调用合同，不冒称世界上游。127可读，128/159只在本兼容尾域产生5253/525A与5633/563A别名；不是合法武将记录。160在3EA5读物理3565A前拒绝，已耗R23、尚未写预算/取r2；日志IP3EAA是预推进，不当该JE已执行或RET。

父干净重跑四脚本：98输出中**95 byte同、3JSON仅两种耗时和同帧/终止异常的traceback表示差异**；63二进制全同，其中59完整1MiB RAM、4矩阵文件，不将矩阵充RAM计数。268来源身份检查通过，父还按文件职责逐一核主源/配置/低入口SHA。3823语义栈读/73XLAT通过，实际0LDS/LES/直接串读；原POP/XLAT负控与LDS/LES guard单元分列。

8条件为3E94/3E9B/3EAA/3EB8/3EC8/3EDF/3EE9/3EF4，声明raw域16边均有RET证书。两向bit7一致且low7均<=100时，3EF4 taken在前置a'>旧b之后不可达；本次该边由混合bit或>100原byte见证，不报正常战役16/16。

另65536预算片段+65536关系片段、256个CMP/JAE及AND门控制。预算0片段绕过函数零门、关系矩阵为不同地址，均不当完整函数/生产前史。父独立整数计算复核全部输出：预算SUB六FLAGS全核；关系末CMP六FLAGS全核、末OR排除AF后核其余五位。没有用未定义AF证明结果。父片段复跑79.417秒完整，未放宽85秒源内界限。

## 26. 归属夹具勘误、父补证与审阅边界

**撤销冻结Z2行2889及findings.md行29“G所属改24”的动态证据表述。** 原locals.py的inactive-and-foreign实际把G10+10即4390h写24，未改当前所属439Ch；3E8E静态不查所属的结论仍成立。父重核37F5→3806按势力号比较+1C、50E0→50F2恢复所属至+1C；不能以旧case名替代字段原证，也不改冻结文件。

父新`ownership-controls/parent-controls.py`独立三例：重演旧偏移、只改+1C=24、同时改势力inactive/G+17=FF/G首byte40h及+1C=24。三例均由同一真实低入口121条原指令RET，预算200→187、两向raw0→1，R23/120和SP0400；后两例G+10保持0，实际439Ch初末均24。旧例初末RAM与冻结旧例全同；组合纠正例与旧例初末仅物理34390/3439C两输入byte不同，规则IP、寄存器/FLAGS及RNG相同。独立`ownership-repeat/`再次产生10输出byte同。这是明确异常/局部输入续段，不证明正常任命可建立这些状态。

Fresh reviewer首审“无问题”已被同协议挑战明确修正为P1/nonblocker证据表述错误；上面勘误和父三例补证完成，旧首审保留。审阅只读、未自行复跑，不将父随后完成的验证追溯写进旧报告。原delegate run complete、native仍review-required，不改成自动reviewed；全AI、战役/主tick、玩家消息可见路径及P16生产修正仍未完成，继续后续链而非以未知清单结项。

| 来源 | SHA256 |
| --- | --- |
| 父冻结Z报告 | dd518a263cefe2d14426761da96a0cb6c2f478c830a1d028fc51dfb64d1df08b |
| probe.py | 2151b3ef8e28538cbd5db3ed99dbb15d416fb7e5d2887426b51d35cdace0154c |
| locals.py | 42e1f934e482e0f32ec5671d40b5eaf56286e2e2ab0126b2943b239d810e9859 |
| fragments.py | 7817063bc61313ac80671019f1fb3a6b045fee007a9c39568fa2c74cf3fbdf4f |
| validate.py | f707b8e9bb15155f08210c0246d594c93db1c82174016c32eaec3e1265de6ebf |
| 父归属三例 | 3560063554e69c5693b3f9d637078ae30dd55a187bffc2bfc0b141264b21a372 |
| 父矩阵/FLAGS独立预测 | 7bdaf5cac949a9fd9d8c67c7fcf8d8673cdd3cde0e630b2f0097b4d41cec7263 |
| 首审（后被挑战更正） | c92a190512343e549f28a5878423b901585f3fe78b13e4d78692a4f45313d334 |
| 追加挑战审阅 | 2deae7a5e6dc29e96290287166f589aff2b1ddd73777e486d888156406bc808a |

## 27. P22：type2生产角色与玩家边界

**实锤限于以下真实生产链、局部输入和原指令范围，不等于完整玩家协同工作流。** 明示活动A0/T2/P17、A旧F19=2，三城经原构表/排序后，2BD9自然仅用R233排唯一`[2,17,0,2]`@104，未手填事件或预烧RNG。沿2E33的原指令：A是原进攻方，T是其旧目标/协同款付款方，受邀R取当时玩家P；2E7B交换后SI=P，2FB1编码到arg0，DL=A、DH=T不变。

3220三次351A查R/A/T首byte unsigned>=80，3712入口SI=R*40h、BX=A*40h、DI=T*40h。**在这条2BD9→2E33生产链、CFF/CFD一致且不变时，资格成功的事件必进3248 CALL38E6玩家路径。** 不以此排除全程序尚未查完的其它生产者，也不能拿改玩家后的NPC分支代替它。

同玩家真生产后第267次31AE到达38E6。四个现场止于该原内部交互入口、正文尚未执行，真实栈返回word324B；这是AI-only选定范围边界，不是环境故障，不称CDE、87FF、2078、3902或消息/选择已返回。算法AL=0/1/2都能到这里，预计算拒绝不是玩家最终拒绝。三方失活或代表资格失败另可在交互前RET。

NPC证书明确分两类：生产后外部改CFF/CFD为1/40h，或直接给3220局部ABI `AX=1102h,DX=0200h,DS=状态`。均非合法中途换主、常态NPC生产链或战役前史。真2BD9本身已把A0旧目标2清FF，事件仍消费；排队后将T→P改交战0也仍到38E6。消费者新读R→A/R→T，不重复生产时的A旧目标和T→P门。

## 28. 3712协同费用与结果

3712先以CL=1调用3771；CF1资格失败即退。代表选择沿P18已核链，**资格仍影响是否继续**；政治算值虽在371A存DL，却在3748被90−e覆盖，之前未用于费用或接受比较。政治相等仍在37C5耗RNG：局部等值首233、真生产后等值下一218，费用同20000；不能因此删掉抽签或选择器。

资格成功后，原byte运算为：

```text
x = u8(relation[R][A]); y = u8(relation[R][T])
code = (y < x) ? 2 : 1                 # unsigned raw，等号通过
e = (y >= 128) ? (y & 127) : 0
threshold = u8(2*u8(F[R]+28h) + 40)
if e < threshold: code = 2
v = u8(90-e)
if s8(v) < 0: v = 0
v = min_unsigned(v,60)
fee = (v >> 1) * 1000                 # DX word
if fee == 0: code = 0                 # 覆盖之前拒绝
37D8计算AH；明确CLC返回
```

本链AH为0；**CF0不是同意，仍须看AL**。e40在好战0阈值等号通过、付25000，e39拒绝；e30费用30000/e31费用29000。e89右移后即零，e90/91/127亦零，code0可覆盖两种拒绝。好战108令阈值byte回绕0，y处交战而e0也可得到付30000同意；这只是异常好战byte输入，不扩大正常/编辑器域。

第二次37F5失败不查CF：本轮R17的残AX1100导致读取显式DS1113别名7，不称合法代表前史。引用160则在3792读物理35653前拒绝；日志预推进3795不当该指令已执行。全部FLAGS只按valid集合使用。

1024原片段只覆盖3736..376B、CL初始1、预解码e及rawY全部256值×好战0/107/108/255；不是完整3712或其全组合/生产前史。

## 29. 先转款互俘，再尝试宣战

3220非玩家分支AL>=2退出；AL0/1真实执行`35ED → 恢复原packet DX → 3526`，**直接调用而非排新type1**。原type2槽字节保留，D20推进108、分频10。

付费例T2资金100000→80000，R17资金100000→120000：35ED先加R、再减T，再按G+1C/+1D逐项恢复互俘；没有余额门，但本批不扩任意异常资金输入。之后才尝试3526→35AB/3639：R17对A0开战、目标0，A0可改响应目标17，两向关系6/6。不执行type3的45F8/4236/3669停战/城标链，无军团写集或返都广播。

**付款不保证宣战成功。** R17已有F19=2时，仍先转20000并执行互俘，随后3526以F19<18h拒绝战争；R目标仍2、R/A关系仍和平。不能为“后面会拒战”取消前款，不能回滚整条或把成功付款等同战争提交。

互俘例恢复G40/G41；另一显式把玩家设为原属2的局部输入，在钱和一个将已经恢复后停CDE，3526尚未调用。不得重做前置写回或称整段已返回。玩家38E6之后的实际选择/返回仍另查，不把该NPC反例冒充稳定玩家全流程。

## 30. 同次3E11的清目标与RNG相位

轮询前缀只有31AE，最后一次进入原3E11由内部CALL消费，不能说267次完整世界/势力tick。显式改玩家的输入中D1C=17*40h，R17初钱0，先收20000并提交战争目标；本次资金门再按h78<=104清F19=FF，战争保留。接着费用+25、3E8E取R218。D1C是独立输入，不由事件角色自动绑定。

等政治、足额钱对照的同流为`生产R233 → 3771 R218 → 3E8E R100`。政治结果不参与费用，但删除那一次RNG会改变后续AI流。

## 31. P22父验证、分母与范围

原包`C:/Users/fczll/AppData/Local/Temp/dragon-ai-type2-yfeekn3y/`；父冻结/复跑`C:/Users/fczll/AppData/Local/Temp/dragon-ai-type2-parent-2vth1kqd/`。最终AA报告3124行/246146B，旧235420B前缀同；最终manifest254项，报告253是初版计数。7继承源同P21、11当前源AST通过。

**38运行32RET/6停止**；3712七条件14/14边有RET证书，3220六条件11/12边有RET证书，3246玩家fallthrough只到真实暂停，不补假返回。299来源字段核验、7669栈读/77XLAT通过，实际0LDS/LES；原POP/XLAT负控与guard-only LDS/LES分列。新增handler-entry RAM记录前的旧源/首五例15RAM保留，新旧逐byte同。

父四脚本干净复跑209输出：**202 byte同、7JSON仅六停点traceback表示及耗时**；167二进制中166完整1MiB RAM与1算术矩阵全同。3242根入口非IP/SP寄存器均保持；配置来源按实际文件职责核对，不仅检查是否在registry。另从真实handler-entry RAM独立预测29个CF0返回的AL/AH/DX与角色、四个38E6 caller栈及1024片段结果，全部通过；这是独立计算检查，不冒称另一批KI执行。

Fresh reviewer静态核对原窗/源码/记录，限定结论OK with notes、无问题；未自行执行或重新hash。其“父公式检查待运行”是审阅时点，父随后已完成，不回写旧报告。本run complete/attested，不升级任何旧run或全AI认证。首次读取不存在旧源路径的ENOENT已记录，随后只读指定Z依赖；未改旧件/生产/正式测试，未触及SAVE、执行原EXE或安装。完整玩家选择返回、城市/军团交错及P16生产修正仍未完成。

| 来源 | SHA256 |
| --- | --- |
| 父冻结AA报告 | 197b5f7d66914d1004f2124e69785c2589062cafcba102d37577557459856a02 |
| probe.py | 46552372cef0fc7db9d103ae2427579c398039691c11113d243cdc4916197b81 |
| locals.py | 7c9c1a580170d12ccc630b315e0cc21817437be30aaf11f3384e3931c9cdee5b |
| player_prefixes.py | 617fc0e95c90cc9048235acb43934e6a94ccd15bec563295f9d1bc4e32196653 |
| validate.py | 33be4f72e337bffc24a840377d8e752ad3a207459005da169ce05e563239d6da |
| 父公式/栈预测 | ed6ae816f8264deeb9fee5130ab7c8fe639beb33a53211505cacb2c5091c12c0 |
| fresh-review.md | 79cb9935bee8024e34753da8c05a7dea3fc042c9ac1a74b4296ad6873ab89de1 |

## 32. P23：玩家选择不是87FF或算法结果

**静态实锤与片段证书，尚非38E6完整返回。** 独立原包`C:/Users/fczll/AppData/Local/Temp/dragon-type2-decision-bbjs38w4/`，父冻结`C:/Users/fczll/AppData/Local/Temp/dragon-ai-player-boundary-parent-wd4_jgpi/`。P22三个真生产暂停仍在38E6，AL分别0/1/2，均有已知返回word324B；本批只核RAM/hash/实际SS:SP及未知栈集合，没有把它们续接成UI RET。

38E6先保存CX/SI/BX。87FF只是由CFD及其君主号计算武将偏移，38EC加4240h、临时SI指君主，再恢复BX攻击目标；它不是用户选择。38F3传TALK基373，经2078→3902→20D6后才恢复势力SI/CX。相邻type3的38C7包装传基360，不能合写成type2/3共用360..384。

3902的14B SS:BP局部：+0基TALK、+2算法/最终AL、+3菜单row、+4请求方/+6攻击方指针、+8候选金额、+A有效金额、+C原AH；+D无初始化且本窗不读。+8/+A先同算法金额。row1才进上限30000的7C6E；成功后写+8，金额0把row归一为0；取消CF经3971 PUSHF/397C POPF保护，397D回菜单，不改候选额或消费399E随机。菜单右键同样重开，不等于拒绝。

TALK376原三行是“無條件同意／提供資金／拒　　絕”；TALK378明确“讓他們提供金額”，与35ED把款加给受邀玩家一致。**这里是索取请求方资金，不是玩家给AI拨款。** row0最终AL0即不转钱，不要求返回DX也为0；row2没有改候选额。正常无别名输入只能令row0保留原额或由自定义0得到0，row2候选额仍原额；任意row×金额不是完整UI可达证据。

三句变体域内，初问373..375、菜单376、军师377..379、君主保算法380..382/采纳383..385。**窗口上界有前提**：父另核3C99是`v=G1E; if v>=3: v-=3`，不是模3或钳2；原raw6/7会得偏移3/4，部分君主文本进入386/387。075B在这些索引仍直接查表；更高值另有406阈值展开，不在本批UI证书内。因此冻结报告“373..385”只作通常三句分组，不能当任意G1E的全域上界，也不据此添加新字段限制。

## 33. 信赖门、真实结果与非局部退出

军师回应后399E直接取一次ECE0，39A1/39A6为unsigned `r<=trust`才采纳。设算法结果/金额A0/M0、归一用户row U、候选M：采纳时结果=`M>M0 ? 3 : U`、有效金额M、君主基383；不采纳保留A0/M0、君主基380。比较金额是unsigned word；等号采纳，trust0/r0也通过，不假定RNG均匀概率。未绑定callee的传递写/RNG仍不能据这一次直接CALL宣称整个UI只耗一次。

39CE..39DA恢复AL/DI/BX/DX/AH，38E6再恢复势力SI；正常返回后324B CDE→CX47/3C3D。3C3D先保存原AL，AL3只为首条通知暂映成2，随后恢复原AL并扣信赖30。3DD2借位清0；**原信赖30恰扣到0也会在3DFA/3E04调用1CB1**。1CB1直接从CS9903/9901换SS/SP，不能强行普通RET至3254。处罚在此之前已写入。

其它正常返回才在3254重新CMP AL,2，覆盖UI算术FLAGS：AL0/1进35ED，再325B恢复原事件DX、3526；AL2/3不成交。DL攻击方不能取金额的低byte。AL0不付钱仍处理互俘，AL1转款；3526仍可能独立拒战（P22）。菜单/数字面板CF需要保存，不能因3254覆盖算术FLAGS就宣称全部UI flags无关。

39CB的1D46亦非纯无写绘制：2B3C对bit5军团OR10h；2533的255B清对象bit0、2562写相位(old+1)&7。父核正确2533起点，废弃raw5的2590中指令起点。OR10不改变L0>=80真假，但不据此断言所有AI忽略bit4；这些明确写集不等于全部绘制/driver传递写已闭合。

## 34. P23父验证与仍需保持的返回边界

父核15项manifest、KI和TALK SHA、2603行原字节一致（含数据/错位行的字节核对**不算指令流证明**），16条TALK文本/原offset表；关键38E6/3902/3C3D/3DC9/1CB1/2533原窗另亲核。三个P22暂停RAM/返回word/970B未知栈范围再次核对。

新fragment.py只实现已pin的39A1..39BF十条原指令，无CALL/RET/ECE0；父干净复跑40例，全部输入/稀疏RAM/FLAGS/轨迹/写集同，仅finished时间不同。2条件4边覆盖，5未知读取负控拒绝；初DX和未声明局部字节是unknown/null，不填0。25例只满足已核必要约束，15例明确违反算法AL/金额或row2金额条件；**40例全是显式片段入口，不是实际玩家场景续跑**。

尚待闭合的AI接口是：INT33输入/寄存器合同、7D5F/E3D7→E453命中平面有效且不别名、SS局部/结果/原事件DX栈的存活、传递显示/INT61写与规则/RNG不冲突、trust归零退出及互俘/宣战消息返回。无需恢复字形像素，但不能把未知callee改成假RET。该局部缺口不阻塞独立军团槽序修正；全AI仍继续。

| 来源 | SHA256 |
| --- | --- |
| 冻结type2-player-decision.md | 114d953656c7631dea723a3c63fb6cdf5c2b4aad254c2be332c9873712941a3d |
| fragment.py | a5a78594049eff62a4154fa6799ad4e0eeaa59f52450c66ac6d56ce7ff762d77 |
| TALK.DAT | cb0cdba4f1c507243cbc4e636bc3fcf698a4f88fe3a0d784cc579e5548e6fcaf |

## 35. P26：type2/type3原生消费者接线（Web实现）

本节把P18（type3/3262）与P22（type2/3220）已核原证接回Web战略事件分派；所有机制结论沿用原证置信度，本节不新增逆向结论。

**实锤（沿用原证）**：分派表0x31F2原字节`0c3220326232`，type1→320C、type2→3220、type3→3262；事件解码type=AL、arg0=AH、arg1=DL、arg2=DH。

- **type3 3262**：AX=(A提出方<<8)|3，DX=FF00|B接收方，无351A活动检查。36C4起CL=1，3771双方代表（CF1→事件返回），B.F19==A时k=2。费用：R=`relation[B][A]`原字节，g=max(0,(R&0x7f)-u8(B.F28+2))，b=u8(t+u8(30-g))，s8(b)<0→0，`fee=(b>>1)*1000`，outcome=fee==0?0:k；37D8后AH恒0（3138尾CMP AX,AX→CLC）。3280：接收方==CFF→38C7玩家决定（已由§36闭合并接线）。3293 AL>=2拒绝无写入。提交序：35ED（AL=1时5609接收方+=fee上封655000、563B提出方-=fee下封-655000；再扫将0..126，`word[+1C]`命中(orig,current)∈{(B,A),(A,B)}→50D7按槽序逐个；50D7在恢复方==CFF玩家时于该将写入**之后**停5101 CDE，部分前缀保留）→45F8（清F19交叉目标）→4236（城0..191：current∈{A,B}且old∈{A,B}→old=current）→3669（双方≠0x18时双向写min(rawAB,rawBA)|0x80）。35ED尾5E80为显示门，无规则作用。
- **type2 3220**：AX=(R受邀<<8)|2，DX=(T付款<<8)|A攻击目标。R,A,T三道351A门按序（<0x80→返回）。3712：3771(SI=R,DI=T)；x=`rel[R][A]`，y=`rel[R][T]`；code=(y<x)?2:1；e=y>=0x80?y&0x7f:0；阈值u8(u8(F28<<1)+0x28)，e<阈值→code2；v=u8(90-e) s8<0→0、封顶60；`fee=(v>>1)*1000`；outcome=fee==0?0:code。3771政治t在3748被覆盖（不参与费用），但政治相等时RNG字节**仍消费**。3241：R==CFD→38E6玩家决定（已由§36闭合并接线）。3254 AL>=2拒绝。3258：35ED（R收款、T付款，俘囚R↔T；付款不回滚），随后恢复事件包DX并**直接CALL 3526**（SI=R、DL=A，绕过320C的351A门；352A忙碌门仍生效，忙碌时付款保留）。
- **3771**（SI=接收侧，DI=对方）：`[SI+2A]`外交官≠FF→直接取该将+13政治；否则37F5(DI)（CF1已查）。君主r=`[SI+1]`：`general[r]+17`≠0时先读军团槽r首字节（`2240+r*40`），<0x80→CF1失败，否则q=君主政治；`general[r]+17`==0时37F5(SI)的CF**未查**，失败即别名DS状态→Web硬停（37B0）。比较：q>p→q；q<p→u8(16-p)；相等→消费一个ECE0字节，偶q奇u8(16-p)；t=`u8(chosen*2)`。37F5：扫0..126，+1C==势力、+17==0、+13政治严格更大者；平手取先；政治0不被选；无候选CF1。
- **50D7**（复用originallegionfate.js）：清G+17、xchg +1D→FF、旧方attr≥0x80恢复current否则FF、2AD2以AH=FF只加返回侧F18；恢复方==CFF→5101 CDE/TALK37/199停。
- **5609/563B**：min(money+fee,655000)/max(money-fee,-655000)，24-bit 09FE98与F6:0168精确一致。

**Web接线**：`originalwarconsumer.js`抽出共享`originalWarEvent3526`（352A门/3530/353F/消息路由），`originalBeginWarEvent320C`保留门控后委托；新增`originalnegotiation.js`（37F5/3771/5609/563B/35ED）、`originaltruceconsumer.js`（3262 begin/3297 commit）、`originalassistanceconsumer.js`（3220 begin/3258 settle）、`scenarionegotiation.js`严格桥（全读own()校验；3558玩家别名与2AD2的0/0x18读按址放行）；`ai.js`的`dispatchStrategicEvent`原生分支接type2/type3，玩家决定38C7/38E6抛错并`holdFailedStrategicUpdate`（fail-closed），type2 settle复用type1的`_nativeWarEventContinuation`消息尾段。

**推断/未知**：type4–7分派项未接；v1 `ai.js`的`strategic_affiliation`为无原证幻影字段，原生路径不使用。（38C7/38E6玩家决定流已由§36闭合。）

回归：`tools/verify_native_negotiation_consumer.mjs`16/16（KI字节pin含31F2表+15个原窗口；type3付费35000/免费签字门/拒绝k2/政治相等RNG 21000对17000/接收方玩家38C7抛错+hold/提出方玩家5101中段部分前缀/君主军团门/37B0别名硬停/首37F5 CF；type2付费20000宣战提交/忙碌保留付款/零费改写/bell-108回绕30000/活动门/受邀玩家38E6/和平玩家防守双消息合同）；`verify_native_war_consumer.mjs`9/9无回归。

## 36. P27：38C7/38E6玩家决定流闭合与接线（Web实现）

本节以本轮capstone亲核为权威，闭合§32/§33遗留的玩家决定边界并把玩家侧接回Web。**与旧摘要的勘误**：①CALL CDE是PC喇叭beep音效（cs:[20F]音效模式），非UI等待；②3DC9借位时CX=0x19E经075B展开为`470+君主talk_idx`解任台词组，**不是**TALK[414]褒奖行（414为数值巧合，075B(0x19E)不指向它）；③信赖写方不止3DC9：3D91是另一写方（加算、溢出夹0xFF），本链不走；④§33保留的“不能宣称整个UI只耗一次RNG”本轮闭合：闭环内9409/7C6E/8810/9321/87FF/1B4/1DB/62F/241/2C2/3D09/3D45/1D46/A1C/5E80/75B/2216/21E7/E453全部无ECE0调用，**整链恰好消费1字节RNG（399E）**。

**调用点（实锤）**：type3 3262→3280 `cmp si,cs:[CFD]`→3287 CALL 38C7；type2 3220→3241 同构→3248 CALL 38E6。两路径此前已预计算NPC结果（36C4/3712→AL∈{0,1,2}、DX=算法fee）。返回后 CALL CDE(beep) → `mov cx,2Bh`(type3)/`2Fh`(type2)；CALL 3C3D → `cmp al,2; jae`拒绝返回 → 否则3297/3258提交。

**38C7/38E6包装（实锤，字节pin）**：38C7=`535156 e8324f(87FF) 81c34042 8bf3 b96801 bbffff e89ce7(2078) e82300(3902) e8f4e7(20D6) 5e595bc3`；38E6同构但`cx=0x175`(373)且BX保持DI(A攻击目标)。87FF：`BX=cs:[CFD]`、`BH=[BX+1]`君主号、`BX>>=3`→返回`monarch_idx*0x20`（字节`2e8b1efd0c 8a7f01 32db d1ebd1ebd1eb c3`），`add bx,4240h; mov si,bx`→SI=玩家君主记录。2078开窗/20D6关窗纯显示（lcall 1000:0引擎），20D6恢复AX。

**3902主体（实锤，字节pin）**：局部帧`[bp]=TALK基、[bp+2]=AL、[bp+3]=选择、[bp+8]=DX键盘额、[bp+0A]=DX算法fee副本、[bp+0C]=AH`。流程：3C99显示提问`base+变体`（变体v=`[si+1E]`≥3则减3一次，非模3）→`[bp]+=3`→3B7E(al=3)三选项（93E9/9409轮询cs:[D38]段，CF重试）→row1进7C6E键盘（AX=0x7530=**30000上限**；CF=1取消回选项重选；**输入0→[bp+3]=0转无条件同意**）→3CDC军师评论`TALK[base+4+choice]`（BX=cs:[CFD]、BH=[BX+2]顾问号）→**399E `call ece0`消费恰好1字节RNG；`cmp al,cs:[0d00]; ja 39bf`**（cs:[D00]=信赖度）→采纳组39A8：`[bp]+=3`(→base+10)、AL=选择、DX=输入额、**输入额>算法fee→AL=3**、写回`[bp+2]/[bp+0A]`；未过门保持算法AL/DX、回应基base+7。出口39CE：`AL=[bp+2]、DX=[bp+0A]`，DI/BX/AH恢复。

**TALK文本（实锤）**：type3基360：问360-362、选项363、军师364-366、犹豫367-369、采纳370-372；type2基373同构（373-385）。3C3D通知：`CX=0x2B`→TALK[43/44/45]停战结果、`CX=0x2F`→TALK[47/48/49]合作结果（AL取min(al,2)）。

**3C3D/3DC9（实锤，字节pin）**：3C3D显示通知行后`cmp al,3`：al==3→`al=30、cx=0x1A5、call 3DC9`。3DC9真身（0x3DC9-3E10，0x48字节pin）：`sub cs:[0d00],al`信赖-30；借位→`mov byte cs:[d00],0`夹0且`cx=0x19E`；CX≠FFFF时8810显示君主行（AL=君主名字节、AH=`[bx+425E]`信赖）；**信赖==0→`al=1; call 1CB1`**（ss=cs:[9903]/sp=cs:[9901]换栈长跳，GAME OVER，无普通RET）。callers(3DC9)=3516/389A/3BDA/3C90。075B选择器：0x19E→470+talk_idx。

**35ED fee来源（实锤）**：35F4 `mov ax,dx`——fee=DX寄存器，玩家路径=输入额；仅AL==1转账（5609接收方+=、563B提出方-=，上下封655000/-655000）。

**358C（实锤，补充）**：玩家为进攻方时（CFD==aggressor）不写自身target_faction——玩家命令优先。

**Web接线**：新增`originalplayerdecision.js`（strict：`resolveOriginalPlayerDecisionChoice` honor/accept→0、pay>0→1、**pay0→0**、refuse→2；`resolveOriginalPlayerDecision` 3902门：rngByte≤trust采纳、输入额>算法fee→3、fee=输入额；`PLAYER_DECISION_FEE_CAP=30000`、`PLAYER_DECISION_TALK_BASE`）；`scenarionegotiation.js`增`applyScenarioPlayerTrustPenalty`（信赖-30借位夹0、selector 0x19e/0x1a5、归零gameOver）、`readScenarioPlayerTrust`、`readScenarioPlayerMonarchPersonality`（87FF strict读法）、`playerDecisionTalkVariant`；`ai.js`：`enqueueNativePlayerDecision`（continuation+incoming模态入队，`nativeDecision{kind,personality,keypadDefault:0,resolveChoice}`）、`resumeNativePlayerDecision`（3902门+3C3D/3DC9罚则+`checkTrustGameOver`，无RNG时fail-closed抛错，返回responseTalk=base+7/10+变体、advisorTalk=base+4+choice、notifyTalk=0x2b/0x2f+min(al,2)、praiseTalk=470+talk_idx）、`commitNativePlayerDecision`（outcome≥2返回；type3→commitScenarioTruceEvent；type2→settleScenarioAssistanceEvent+复用type1 8810消息尾的`runNativeAssistanceWarTail`）；dispatchNativeTruceEvent/dispatchNativeAssistanceEvent的player-decision分支不再抛错（无gamebar模态能力时仍fail-closed抛错并hold）。`gamebar.js`：native分支提问=`base+变体`单行、键盘默认0、pay-0不被吞、result步依次显示response+notify+praise（`\4`=君主名）+军师评论。v1旧路径未动。

回归：`tools/verify_native_player_decision.mjs`19/19（字节pin覆盖38C7/38E6/3902帧/394B/394F/396B/397D/398A/399E/39A8/39CE/3C99/3CDC/3C3D/3C60/3C75/3C8B/3DC9/3D09/3D45/87FF/3D91；门边界rng==trust生效、超额→3、pay-0→0、罚则-30/借位夹0/归零gameOver、selector 0x19e、集成dispatch+resume+commit）；`verify_native_negotiation_consumer.mjs`16/16（两处旧断言改为无gamebar模态时/player decision UI/ fail-closed抛错）；war_consumer/deficit_trust/generic_talk 18/18无回归。超额破裂因type3 fee=35000>键盘cap 30000不可达，以type2（fee 20000）fixture覆盖。

## 37. P28：type4–7消费者闭合与接线（Web实现）

**分发表（实锤，字节pin扩到全表）**：0x31F2起12项word=`0C32 2032 6232 A932 E932 2733 8833 EA33 8534 9634 A634 B134`（type1..12→320C/3220/3262/32A9/32E9/3327/3388/33EA/3485/3496/34A6/34B1）。

**351A势力门（实锤字节`32c0 d1e8 d1e8 8bf0 803c80 c3`）**：AX=AH<<6=索引*40h→SI=势力记录；CF=([SI]<80h)=非活动；AL=0。type6/7的`jb`在CF=1时静默RET（事件消费，无消息无写入）。

**32A9 type4 内政官月度预算（实锤64B pin）**：AX=arg0*20h+840h据点记录；[BX+19]=内政官将号==FF→RET；SI=4240h+将号*20h；CDE蜂鸣→8810 TALK56（CX=38h，AL=93h显示模式，DI=栈上[武将指针,据点指针]供\1/\2替换）→2078开窗→AX=DX金额字、CX=116h(278)→39E8→20D6关窗。

**32E9 type5 外交官月度维持费（实锤62B pin）**：AX=arg0*40h势力记录；[BX+2A]==FF→RET；SI=外交官武将记录；CDE→8810 TALK57（CX=39h）→2078→CX=13Fh(319)→39E8→20D6。**type5无势力活动门**，只查外交官在任。

**39E8共享对话体（实锤全窗pin）**：入口保存全部寄存器；39F1..39FA仅把入口建议额1..499钳500（0与≥500不动）；12B局部帧[bp]=CX基、[bp+2]结果类、[bp+3]菜单row、[bp+4]=BX、[bp+6]=SI、[bp+8]=grant、[bp+0A]=建议额副本。建议额0→3A31零请求路径：3C99(base+0x1E个性池)→3CDC(base+0x23军师单行)→3C99(base+0x24个性池)，跳过菜单且**[bp+2]从未初始化（原栈垃圾）**；正常域内此时武将+1A已为0且扣款额为0，两分支无可见规则差异（推断），Web取不提交。建议额>0：3C99(base+个性)请求行→[bp]+=5→3B7E(al=3)菜单（**菜单文本=TALK[base+5]单条目的3行**，type4=283「答應/提示金額/拒絕」、type5=324同文，非283..285三项）→row1进7C6E键盘→分类（3A88..3AA6实锤）：0→2、==建议→0、<建议→1（保持）、>建议→3（多给）→[bp]++→3CDC军师base+6+outcome（type4 284..287、type5 325..328；TALK284文本「由你提出的…准許撥款」证实284..287为军师行而非菜单项）→[bp]+=4→3C99武将回应base+10+菜单row*5+个性（type4 288..307、type5 329..348）→3AD0关闭等待。**提交3AD9..3AF5（实锤顺序）**：outcome==2跳过；否则`AX=grant; shl ax,1; [SI+1A]=AH`（=floor(grant/128)）**先于**`shr ax,1; DL=0; SI=cs:[CFD]; CALL 563B`一次性扣玩家国库（下封-655000）；`AL=4; CALL 5E80`纯显示门。**39E8全程0 RNG**（窗内无ECE0）。

**7C6E键盘默认值勘误（实锤）**：`7CA2 xor si,si`——键盘内部自清零，**默认输入恒0**，与调用方SI无关（type4/5调用前SI=武将记录指针，3902亦然）。v1预算键盘默认建议额是v1近似，native路径默认0。

**3327 type6 玩家停战使者结果（实锤97B pin）**：351A(arg0=目标)→CF返回；[SI+2A]外交官==FF→返回；CDE+8810 TALK57（AH=FF，DI=栈上[外交官|FF00h,势力指针]）；**TALK57关闭后**DI=cs:[CFD]→36C4(SI=目标=接收方，DI=玩家=提出方)——3771政治相等RNG在此点消费；CF=1（3771资格失败）→8810 TALK58（CX=3Ah「敵方的君主已不在了。」，AL=[外交官将*20h+4241h]=君主号字节）→RET无写入；否则3C3D(CX=2Bh)TALK[43+min(AL,2)]→AL>=2拒绝RET。**3371..3384提交**：35ED（SI=目标收款、DI=玩家付款、互俘双向、玩家恢复将命中5101中段停止合同）→45F8（AX=3374..337E构造：AX=SI*4取AH=目标索引、AL=cs:[CFF]字节——与3297的包内提出方不同来源，CFF独立读取）→4236（城主∈{CFF,目标}归一旧主）→3669（双方!=18h双向min(raw)|80h）。

**3388 type7 玩家请援使者结果（实锤98B pin）**：门序实锤——351A(arg0=协助)→CF返回；BX=SI保存；AH=DL(arg1=目标)再351A→CF返回；xchg后SI=协助、BX=目标；[SI+2A]协助方外交官==FF→返回；CDE+TALK57；关闭后DI=cs:[CFD]→3712(SI=协助=R、BX=目标=A、DI=玩家=T)；CF→TALK58→RET；3C3D(CX=2Fh)TALK[47+min(AL,2)]；AL>=2拒绝。**33DD..33E6提交**：35ED（SI=协助收款、DI=玩家付款）→BX=目标shl×2取DL=目标索引→**直接CALL 3526**（SI=协助、DL=目标，与3258同形，352A忙碌门生效，付款不回滚）。

**3C1E信赖分级器归属勘误**：callers(3C1E)仅3836——属进言/战争提案域（re-war-proposal），不在3902/39E8链；3C99变体=[SI+1E]≥3减3一次的P27结论不变。3B08 callers=6983/69FC、3B5A caller=3889（5选项菜单+3DC9信赖-20）同属进言域。

**Web接线**：新增`originalbudgetconsumer.js`（32A9/32E9门、`originalBudgetEntryClamp39F1`、`classifyOriginalBudgetOutcome39E8`、`originalCommitBudget39E8`先+1A后563B）；新增`originalenvoyresultconsumer.js`（3327/3388门、`originalTruceEnvoyOutcome3346`/`originalAssistanceEnvoyOutcome33B2`（TALK57关闭后计算，`readPlayerFactionPointer()>>>6`=CFD玩家）、`originalCommitTruceEnvoyResult3371`（45F8用CFF字节）、`originalCommitAssistanceEnvoyResult33DD`复用3258）；`originaltruceconsumer.js`抽出共享`originalTruceOutcome36C4`、`originalassistanceconsumer.js`抽出`originalAssistanceOutcome3712`（3262/3220行为不变）；`scenarionegotiation.js`增io（readCityGovernor=C19、general +1A读写=assignment_budget）与8个场景桥+`describeEnvoyResultMessageState`（\1/\3从固定势力表/固定武将槽解析，不用公开factions）；`ai.js`接type4/5（gamebar预算接见流+nativeBudget{keypadDefault:0,commit闭包}，39E8 0 RNG故不设RNG挂起）与type6/7（`_nativeEnvoyResultContinuation`+`_strategicEventPostMessageRngPending`合同：TALK57→outcome为advance不清挂起，TALK58/拒绝/type6提交为finish清挂起补拍，type7提交先交挂起再走3526战争尾段防误清）；`gamebar.js` native分支（武将槽固定不重查city.governor/envoy投影、键盘默认0、提交闭包替换v1写字段）。v1旧路径未动。

回归：`tools/verify_native_budget_consumer.mjs`18/18（字节pin：31F2全表/351A/32A9/32E9/3327/3388/39F1/3A64/7CA2/3A88/3AD9；门、分类、提交顺序（setter间谍证+1A先于扣款）、type6付费35000和平写回、TALK58失败无写入、type7付费19000+3526宣战、两型拒绝、dispatch集成、无UI fail-closed+hold）；negotiation16/player_decision19/war9/monthly_budgets等49无回归。

## §38 type8 玩家分支 341F→5E60 与 075B 选择器展开、98A6 界面更新门（P29）

**范围**：闭合 §21/§22 遗留的 type8 玩家指针分支。341F 之前的前缀（351A势力门→6A3D候选→3408 `mov [F+3],新首都` xchg提交→3417 CALL 4502军团前缘）在两分支共享且已接，玩家分支不得重做或滚回。

**341A/341F 门（实锤 pin `341a: 2e3b36fd0c`、`341f: 7528`）**：`cmp si,cs:[CFD]; jne 3449`——独立 word 比较，**不查 CFF**。341F 为假（SI!=玩家）走外交官径 3449（[SI+2A]外交官门→CDE→8810 TALK57→8810 CX=0x1A4 外交官个性行→RET），即 §22 已接路径。

**玩家径 3421–3448（实锤 pin）**：`3421` AL=[SI+3] 新首都压栈（8810 的  参数）；`3429`（11B pin）BX=[SI+1]君主号>>3 得君主记录；`3434`（9B pin）AH=[BX+425E]个性、AL=[BX+4241]名字节；`343C` CX=0x1A4；`3442` CALL 8810；ADD SP,2；`3446` CALL 5E60；RET。8810 显示一条君主个性行后 5E60，无任何规则写入。

**075B 选择器展开（实锤，P27 0x19E 同式推广）**：CX>=0x196 → TALK[0x196+(CX-0x196)*8+AH]（AH=武将 talk_idx 个性）；CX<0x196 → 直接 TALK[CX]。故 0x1A4→**518+talk_idx**、0x19E→**470+talk_idx**、0x1A5→526+talk_idx（§36 注 421 为空串之说不实，526+ 为本组变体）。

**TALK[518..525]（实锤 _talk_utf8）**：迁都宣言/报告 8 变体，占位 =新首都名、=说话者（君主）名。8810 DI 栈帧无武将/势力槽，/ 在本链不出现（推断，未见引用）。

**5E60 界面更新门（实锤）**：`TEST CS:[98A6],2; JZ ret`——位清则纯 RET；置位则 0x337 开窗→5E80(AL=0x0F) 四子面板（5EB7/5F27/5F5D/5F7F 读玩家势力君主名/资金/城数等展示）。cs:[98A6] 全部写方：1AAA（mov 初始化）、5A3F/5E2F/614F（or 置位）、5AB2/5E4E/61B8（and 清位）——纯 UI 状态。按 P20 §21 与 §36 既定约定，98A6/5E80 面板属纯显示：规则 no-op、0 RNG（窗内与 337/5E80/8810/075B 全线无 ECE0 调用，P20/P27 已扫描）。Web 以原版 App 常驻面板覆盖该显示义务，不复制面板逻辑。

**RNG**：type8 玩家分支全程 0 RNG（实锤，3421..3448 与 5E60 窗内无 ECE0；type8 早前前缀 RNG 点不受本分支影响）。

**Web 接线**：`originalcapitalrelocation.js` 玩家指针分支返回 `{status:'player-message',faction,oldCapital,newCapital,monarchSelector:0x1a4}`（前缀已提交不滚回；新旧相同仍 340B ret）；`scenariocapitalrelocation.js` 共享解析君主记录，`reply={selector,talkStyle:monarch.talk_idx,advisorName:君主名,cityName:新首都}`；`ai.js dispatchNativeCapitalRelocation` player-message 分支入队单条 `native-capital-relocation-player` 消息（talkIndex=518+talkStyle，=君主名、=新首都名），onClose→`finishNativeCapitalRelocation` 复用既有合同；不设 RNG 挂起（0 RNG）。v1 路径未动。

回归：`tools/verify_native_capital_relocation.mjs` 7/7（玩家消息流重写+341A/341F/3421/3429/3434/343C/3442/5E60字节pin）、war_consumer 9/9、budget_consumer 18/18。

### §38.1 33FD 迁都提交体接线（P38，C07 残件）

**范围**：进言迁都（6909）对白成功后的 `call 33FD` 提交体。实锤（capstone 现刷 pin）：`33FD..340E` = `2d4008 d1e0 d1e0 d1e0 8ac4 866403 3ac4 7439`——输入 AX=城记录地址（0x840+idx*0x20），算术变换得 AL=城索引；**3408 xchg 先写 F+3，340B 新旧相同才 ret**；340F..3417 bx=势力号（si>>6）→call 4502；341A 起与 type8 消费者共享同一玩家/外交官分支（341A pin/341F/3421../3449 门字节同上节）。**与 33EA 的差异实锤**：无 351A attr 门、无 6A3D 自选首都（新首都是进言玩家显式选的）、无 CFF 忽略玩家早退——33FD 是通用提交体，6909 调用时 SI 恒=玩家（CFD），故只可达 340D unchanged 与玩家径；外交官径 3449..3484 仍按同一合同实现（防御）。进言链全链 0 RNG 已由 P35 活扫描覆盖，33FD/4502 窗内亦无 ECE0。

**Web 接线**：`originalcapitalrelocation.js` 新增 `originalRelocationCommit33FD`（显式 newCapital；unchanged/player-message/message/relocated 四态复用 type8 状态合同）；`scenariocapitalrelocation.js` 抽出共享 `nativeCapitalIo`/`resolveScenarioCapitalResult` 并新增 `performScenarioRelocationCommit`；`gamebar.js` 迁都提交定时器 native 分支（原 fail-closed throw 移除）：提交后 player-message→显示君主宣言行 TALK[518+talk_idx]（\2=新城、\4=君主）→定时收尾（关接见+镜头+城卡）；unchanged→直接收尾；其它状态 fail-closed。信赖+10 保留 v1 位置（对白成功路径 3D91 合同，净效果一致）。0x6E8F 出陣提交体仍 fail-closed，归 C08 轮。

回归：`verify_native_capital_relocation.mjs` 11/11（新增 33FD 字节 pin+玩家提交/unchanged/NPC 外交官三径）、war_proposal 8/8、war_consumer 9/9 等族 34/34。

## 39. P30：35AB 旧目标 22..35 原状态别名

**权威反汇编（本轮 capstone 亲核，字节 pin 见 verify_native_war_consumer.mjs）**：`35AB..35EC`——35AC/35B3 先排玩家与 18h；`35B8..35BE` BH=DL 后两次 SHR 得 B×40h；`35C0` 读 B.F19=T；`35C3 80 FC 24` + `jae 35E2`：T≥24h=36 不写任何读直接 B.F19=A；否则 `35C8..35CE` DI=T×40h，`35D3` 先算 P(A)（BX=SI）存 CX，`35DA` 再算 P(T)（BX=DI），`35DE cmp ax,cx / jae 35EB`：P(T)≥P(A) 保留旧目标，严格小于才 `35E8` 写 B.F19=A（AH=A 由 SI×4 得）。`3091..30CA`：`[BX+4]/[BX+6]/[BX+8]` 三 word 各 >>2 累加（DX 压栈保全）；`30AF cmp ah,[BX+23]`：highByte(S)≥该字节则 S=07D0h=2000；S>2000 再夹 2000；`30BF cmp word[BX+21],13h`：≤19 则 AX=0。3091 纯索引算术，无任何编号范围门。

**别名区域（实锤，固定表位置见 re-notes-custom-data.md）**：势力表实为 **24 槽×40h=0000..05FF**（轮转只用 0..21，0x580 回绕）；0600..083F=24×24 外交矩阵；0840..203F=192 城×20h。旧目标 T∈22..35 时 3091 读取落在：

| T | 记录基址 | 区域 |
| --- | --- | --- |
| 22/23 (16h/17h) | 0580/05C0 | 势力槽 22/23 |
| 24..32 (18h..20h) | 0600..0800 | 外交矩阵字节 |
| 33..35 (21h..23h) | 0840/0880/08C0 | 城记录 0..5 |

**势力槽 22/23 内容**：四章 SINARIO.DAT 两个槽全部 64 字节为零（逐章 dump 实锤）；且四章 22 个真势力 F19 全 FF、槽 22/23 F19=00 但整槽零不活动。已知写方（势力轮转 0..21 回绕、3593 事件 A、2F71 清 F19）均不越 22 槽——运行期不变性为**推断**（静态无法排除未映射写方）；Web 按构造保持零（表仅 22 槽，对 22/23 的写入仍 fail-closed），与四章初态一致。

**矩阵/城别名读字段**：T∈24..32 读矩阵扁平字节 T×40h+{4,6,8,21h(word),23h}，全部在 0600..083F 内（最大 0823），取 Web `nativeDiplomacyMatrix.rows` 活值（3639 等写回即反映）。T∈33..35 读城记录：偶数城（0/2/4）+4..+9（名字节 4..7 与地图横坐标 word，静态），相邻奇数城（1/3/5）的 +1（**活所属字节**，原版 4CF3 易主即写；Web 取 `city.faction`，null→18h 与 compile_chapter 约定一致）、+2/+3（名首两字节，静态）。静态字节来自章数据 `compatibility.cities` 192×32B 原始记录；运行态经新状态字段 `sc.nativeCityRecordRaw`（192×64hex，strict 校验，缺失即 fail-closed）提供。生产 v2 内容挂载（nativeFactionSlotRaw 等同链）未闭合，属既有初始化链缺口，不由本轮补造。

**四章初态 P(T) 实算**：T=22/23 → 0（资源 word=0≤19）；T=24..35 → 2000（0xFF/名字节构成的高位使 highByte(S)≥[+23h] 触发重置或超 2000 夹顶，资源 word 均 >19）。即官方剧本初态下旧目标 24..35 恒保留、22/23 恒改换（若 P(A)>0）；运行态矩阵/城字节变化后按活值计算，不是常量。

**3094 域外读不动**：§7 `producer-empty` 的 DS:8003 状态外读与 38003 前史仍是独立未闭合项，本别名不覆盖、不猜测。

**Web 接线**：`scenariowarconsumer.js` 新增 `aliasStateByte/aliasStateWord`（0580..08FF 界内 strict）并在 `warEventIo` 的 `readFactionReserve/readFactionCityCount/readFactionResourceWord` 三个 3091 读者上按 index≥0x16 分流；其余读者（351A attr、352A/35C0 F19、3639 关系）仍限 22 真势力不变。`originalwarconsumer.js` 规则层零改动（3091 本就索引无关）。

回归：`verify_native_war_consumer.mjs` 13/13——新增 35AB 全窗字节 pin、22/23 零槽改换、24..32 矩阵保留（0xFF→2000）与资源 word 置零改换（`rows[4][1]=rows[4][2]=0` 令 P(25)=0）、33..35 城别名（活 owner=5 → word 5≤19 → P=0 改换；owner=null→18h 且零兵力 → 重置 2000 保留）、城记录缺失 fail-closed（A 前缀已提交+B 保留+hold）、0x24 直接写不读别名；删除旧「22 别名抛 /faction slot/」测试（行为已被原证取代）。§15 的 18h/23h 采样别名地址（0604../08C4..）与本区域映射一致。
