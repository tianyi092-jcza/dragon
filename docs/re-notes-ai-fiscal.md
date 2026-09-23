# 原始月度财政、征兵、武将与预算：P08/P09

**状态：指定输入下5358整调用及本体条件已复核；5358..538B财政与5695城市生产核心已按固定槽接线，后续585F/55A6/2BD9/预算/灾害/消息与全AI专项仍未全部完成。** 本页维护月结接缝的详细原始证据；[AI全链总纲](re-notes-ai-chain.md)维护最终验收，不将本体边覆盖等同于全部战役决策闭合。

## 1. 来源、完整输入与方法

原始白名单仅`E:/Dragon/Dragon/KI.EXE`（67099B，SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`）和官方`E:/Dragon/原版/SINARIO.DAT`（88832B，SHA256 `4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87`）。VA加200h，near目标按16位回绕；不读写SAVE。

每例私有1MiB RAM，CS1000/状态DS3000/SS1FC0/SP0400，官方首章`[80h:56C0h]`与头部显式载入；5358入口DS1000，5359真实改为状态段。候选段8000、事件段8900、占格基址5000、玩家17/CFD0440、显示门98A6=0、旧灾区D22=FFF0、事件页空；没有构造导航或行军。EC82从RTC00:00:00真实播种一次，后续仅原ECE0消费，同一调用不断流。

完整初态RAM、寄存器、所有字段edits、初始RNG与全部IP/写回/调用游标均保留。19个普通月结例从5358到53C5真实RET；另2个竞争例先真实6E8F编旧军，伤兵/库存作为明确外部输入，再完整5358和真实消费者。**没有模拟KI callee返回，消息/设备/白名单外指令即停止**；本次实际均未进入CDE/CE7/5E89/8810，不表示这些消息分支不存在。

有界执行器：每根500000、每机器5000000指令，EC82最多10000、REP最多1000h word。新运算支持CF/OF/AF/SF/ZF/PF定义性，MUL/IMUL仅CF/OF有效，DIV后条件位无效；未定义位被使用立即失败。不是通用DOS/硬件认证。静态CFG将显示/消息标为外部边界后枚举返回后继，不伪称已经执行边界。

## 2. 5358精确顺序

| 阶段/原地址 | 读取与写回边界 | 官方基准RNG游标 |
| --- | --- | --- |
| 5362..5389，22势力 | attr>=80者先563B扣旧24位费用，再53C6收入/兵源、5609加收入，5378/537B清费用，最后537E→5828赤字流失 | 基准保持0 |
| 53C6→54FC/5538/5547 | 扫192城按owner匹配，使用**更新前**生产word与首都距离/纬度；不先更新5695 | 0 |
| 5417→5456（NPC） | 收入24位右移1；用半记录扫描和**尚未清除**的F+1B费用高word决定并兵 | 0 |
| 541E→548F（玩家） | 本月税率D08低byte、三征兵上限word；D02..04显示收入，D05..07显示旧费用 | 0 |
| 5421..5442→55EC | 三池分别并入；加法carry或结果>FFDC均封65500 | 0 |
| 544B/5373 | 写实际城市数F+23；收入进入已经扣费的国库，单独上封655000 | 0 |
| 537E→5828 | 读加税后的资金高word；负值才逐骑/弓/步各一次RNG，扣预备池且借位封0 | 基准非负0 |
| 538B→5695 | 192城生产/增长更新，各一次RNG；收入已结完 | 0→192 |
| 538E→585F | 127活动将月倒数/归属处理，可能消息/事件；本基准未进入那些分支 | 192 |
| 5391→55A6 | 127将派生评分G+1F刷新，inactive/127保留；位于全部5828之后 | 192 |
| 5394→2BD9 | 完整候选与两轮外交，消费本例实际钱/池/目标，排事件，不代表已消费宣战 | 192→218 |
| 5397/539A→5715/578F | 实扫内政/外交预算；基准无官所以未排预算 | 218 |
| 539D→22DB | 旧灾区/随机地理分支 | 218→219 |
| 53A0→2286 | 全城逐条件火灾/暴动与入槽 | 219→645 |
| 53A3→57FE | 玩家负钱/信赖门；本基准不耗RNG | 645 |
| 53AF..53B9 | 最后复制D10..17到D08..0F，才使下月政策生效 | 645 |
| 53BD→5E80、53C5 | 原显示门直接RET，恢复DS=CS和根调用栈 | 645 |

不能将费用先清再参与5456、把加减合为净额后一次钳制，或仅在结尾补几个随机字节。负钱例会让后续城/外交/灾害消费整个不同的连续流。

## 3. 征兵门实际是127个半记录

`5466 MOV CX,7Fh；5469 BX=2240h；5478 ADD BX,20h`：偶数项读军团槽0..63首半页；奇数项读槽0..62的+20半页。每项先比较byte `[BX]>=80`、再比较`[BX+1]`是否等于当前势力，命中才把word`[BX+4]`加入DX，逐次u16回绕。**不是完整128军团、也不是按实际军团总兵数组求和**；后半页是目标等字段的别名，不能为了合理性删掉。

令S为上述原扫描u16总和，E为尚未清除的word`F+1B`，I为减半后的24位收入：

```text
burden = u16(2 * u16((S >> 8) + E))
仅 burden < word(I的第1/2字节) 才并入本月兵源
等号、较大：STC，541A跳过三池并入；收入仍照常结算
```

官方13方原始收入17556，NPC减半8778，高word34，新兵源骑65/弓65/步415。无军旧费4096→E16、burden32，准征；旧费4352→E17、burden34，等号拒征。

专门计数对照：相同四条status80/owner13/总兵512、相同旧费2304，置槽0..3得到burden34拒征；仅移到64..67得到burden18准征。钱同为38474，前者池400/500/600，后者465/565/1015，RNG序列相同。**这是计数记录边界输入，不是已经证明由6E8F创建的战役前史。**

## 4. 距离、三兵源与赤字

54FC取首都/城市X、Y差的无符号绝对值，选较大值；高byte非0时AL置FF。5532表阈值为80/200/255，5535除数为2/3/4，最后255覆盖byte全域，不访问第四除数。城市生产先除该数；收入累加24位，兵源base再右移5。5547逐次移位而非浮点比例：

- y<80：步=`(base>>2)+((base>>2)>>1)`，弓=`((base>>2)>>1)>>2`，骑=`base-步-弓`。
- 80<=y<150：骑=弓=`base>>3`，步=`base-骑-弓`。
- y>=150：骑=`base>>5`，弓=`base>>1`，步=`弓-骑`，不补被移位截掉的余数。

钱为signed24 F+20..22；5609只上封655000，563B只下封−655000，高byte用signed比较、低word用unsigned。预备池55EC封65500，不是65535。

5828仅看**税后**F+21高word是否负；令Q为其word的二补数负值，DX=`u16((-Q)<<4)`；每池损失=`u16(DX+(rng&31))`，word减法借位则置0。测试钱−8779/费0，收入8778后仍−1：先准征至465/565/1015，再以233/218/100扣25/42/20，得到440/523/995。不能把负1钳为0而绕过随机消耗。

## 5. 全部受控输入与实际结果

| 输入（13方，特别注明除外） | 已观察输出 |
| --- | --- |
| 官方钱32000/费0/池400,500,600 | 钱40778，池465,565,1015；98554指令/645RNG |
| 槽0..3或64..67四军512、费2304 | 上节严格拒/准；98698/98554指令，均645RNG |
| 费用256、512 | burden2、4，均准征 |
| 费用4096、4352 | burden32、34，准/拒；钱36682/36426 |
| 钱−650000、费10000 | 扣后−655000，税后−646222；拒征、三池流失为0；652RNG |
| 钱−8779、费0 | 税后−1、池440/523/995；652RNG |
| 三池65499 | 加65/65/415发生carry，均封65500 |
| 三池65450 | 至少加65无carry但和65515>65500，仍封顶 |
| 钱650000、646222、600000 | 分别封655000、恰655000、608778；三例均650RNG |
| 钱−650000、费5000或1000 | 扣后恰−655000或−651000；再加税，均652RNG |
| 方21 attr7F | 跳其财政，其它扫描仍按各自条件；95700指令/645RNG |
| 玩家三征兵word FFFF | 覆盖548F不向较小政策钳制的分支；是外部政策边界，不是UI合法上限声明 |
| 城37 X改0、首都79 X271 | 高距离byte转FF、分母4；13收入8349、钱40349、池462/562/994 |

合计19个整月例，非全部输入空间。基准新事件为offset28 `{1,0,13,FF}`、32 `{12,2,A0,15}`、40 `{8,5,FF,FF}`、108 `{1,1,10,FF}`、112 `{1,11,14,FF}`；只证明排队，未执行事件消费/战争提交。

## 6. 月后新编与补员竞争

真实6E8F建立旧军81；六队各降30是**显式伤兵**，非战斗结果，真实6FD2重算180。池设100/100/100后执行完整5358，月后池165/165/515，总845，加旧军180总量1025。随后只交换两个真实callee：新83经6E8F，旧81经461D/6FD2。

| 顺序 | 中间结果 | 两次后 |
| --- | --- | --- |
| 新编83→补员81 | 新军530，六队83/82/100/100/83/82；池0/0/315 | 旧军320，新军530，池0/0/175 |
| 补员81→新编83 | 旧军600；池25/25/375 | 新军因6EC9资格检查改选六队全步，65/62/62/62/62/62总375；池25/25/0 |

两条军团总兵加三池均1025，后两调用0RNG，整例645RNG。6EC9先按六行兵种候选、临时池每队预扣50；461D则先4717归还旧队，再4698逐兵种以**剩余队数**作除数，将商+余数给当前队、封100并减少剩余队数。简单“总池够就全满”或一次均分会丢掉这种竞争。

这里的调用顺序由测试明确提供，未经过45C1选新将或4325态9到期。不能据此声称AI自由选择两种优先级；真实城市/军团相位的上游还需接入。

## 7. 分支账本、复跑与剩余义务

原本体范围5358..55F8、5609..5662、5828..585E（5532..5537为表数据）有35个条件/循环、70条边，19例均有见证。全部VA/原字节/真假去向/观察次数在`branch-denominator.md`；按月度根展开的CFG为1474指令节点、181条件、91直接CALL、无已展开间接CALL/JMP，仍有149条未观察边。未观察不等于不可达，消息边界也不因CFG列出返回后继就自动闭合。

原证据目录`C:/Users/fczll/AppData/Local/Temp/dragon-a02-month-3dra1h7t/`；父冻结/独立复跑目录`C:/Users/fczll/AppData/Local/Temp/dragon-ai-month-parent-5dtx9zj0/`。父核120项manifest、审源/依赖并亲核本体原窗；重跑19月结、2竞争和CFG/validator后，65个结果/初末RAM/CFG/分支文件逐byte相同，见`parent-exact-replay.json`。父比较器第一次因shell反斜杠转义语法错误失败，发生于全部21例和validator结束之后；记录于`parent-comparison-failure-01.json`，修比较器重新核对，不改输入或原结果。

另父扫描1357个实际IP，发现解释器8个negative-immediate CMP的CF按Python负数比较，不能当正确的一般unsigned CF。父在22E3/2C9C/2D24/2DBC/2DF8/2EAA/2F77/56FC之后将CF标为未知，再跑全部21例：没有后继读取该CF，所有JSON字段/IP/RNG及普通月结38份初末RAM仍一致。`negative-cf-audit.py`及其validation保存见证；**这只排除了本组轨迹受影响，后续扩域须先修正立即数位宽并验证，不能沿用错误CF**。

| 核验文件 | SHA256 |
| --- | --- |
| 父冻结diplomacy-economy.md | 0b2023da5446c38048dee70c2bea5fccb864a7cf22a11c753d03530011b18e72 |
| month_probe.py | 69d3c589aaf67b2920f53d580fafaa3165bbcf1952c66cc8bd94069b2f454928 |
| competition_probe.py | 4e01b40fe2932acdb7acdb797d15c326fce03454666b70d697b904c24be19faa |
| cfg.json | 553abff7766fa986a176930023a14dea2832500b7f68e900becd31ca37b04959 |
| official-result.json | 2eb83f2d14794e9b07b4f1f297ce2018da8e77be76d584491e9d3851f238f417 |
| validation.json | 11f8d00ca48b9cc0ac91daf9058d266ac20527da1a2c6feb362fe18e114c9aae |

复跑须禁PYTHONOPTIMIZE，`PYTHONDONTWRITEBYTECODE=1`、UTF8，执行私有副本`month_probe.py <case>`、`competition_probe.py`、`cfg.py`、`validate.py`；父另`negative-cf-audit.py`。历史零费低/高槽均准征的结果保存在initial-pass，后续用共同费2304才构成有效反例，没有删除不合预期的结果。

P08当时剩余入口：585F归属/倒数及591A/5990消息、5715/578F有官/预算与成功/满页、22DB其它灾害、实际消费者时相及日历/31AE。P09接前两项如下，未指定财政为全军返都唯一根因。

## 8. P09：月度武将与预算接缝

**父已复核15个完整5358和4个真实CDE暂停；消息返回仍未包含。** 字段语义/原伪码仍以[实体字典](re-notes-entity-fields.md)武将§3为维护源；本节记录整月顺序与覆盖证书，不再复制完整字段表。

同P08固定原始文件/环境，新增明确入口D20=100h（第一页已走完的接口，不是本例执行31AE所得）。任命、俘虏、自由将、计数均逐项列入edits与1MiB初态；无原任命UI或捕获前史。普通玩家17，四个free-npc对照**另设玩家20**；不得以换玩家完成当原玩家17消息场景通过。旧/free组身份最终0，owned组40h，早期身份40h版本另存。40个原CMP单步证书验证P08发现的目的宽度立即数CF/ZF修正，所有算术先按目的宽度掩码；未扩大为通用x86认证。

| 原入口 | 已复核参数化事实及提交边界 |
| --- | --- |
| 585F→586D..5892 | 扫0..126；inactive跳过；倒数非0仅DEC，1→0也本月不再归属；原已0才按current/old选5899或5940 |
| 5899，remembered!=FF | 恰1 RNG；<40h先清remembered，旧号指向活动方才入属；失效且attr bit5置才清attr，未置保留无属；失败不会同月再自由选择 |
| 58C2一般招募 | 按22方活动/将数取最少者，同值后者覆盖。一次RNG给k=(R&3F)+1；k<48时24..47夹1，再从所选方循环数活动方；k>=48走玩家倾向，严格 `(玩家城数>>2)+1 > 玩家将数` 才尝试 |
| 591A | 非玩家5934写current、2AD2增将数；玩家先CDE/TALK41，正常返回后才提交。原仅过滤remembered=FF，无额外<22检查；全无活动方的排行无成功出口，不编造兜底 |
| 5940 | 候选各1 RNG：>=40h不变；20h..3Fh且current==remembered才先清old/身份、增current方计数，再TALK66；<20h先按低4+8排type9，再TALK65，正常返回后才current=18h |
| 5391→55A6 | 归属/清active之后刷新评分；被清active者跳过，不能在招募前预刷新 |
| 5715 | 扫192城，玩家所属/有官/budget0；金额按城+10/+11/+12/+13三个正差求和、右移1、乘50；使用已5695更新字段，**金额0仍排type4** |
| 578F | 扫22方、跳玩家/无外交官/budget非0；关系取**已2BD9后**两向raw较小者；字节减法及乘200见§10 |
| 2FBF，BL=FF | type4/5入槽先耗1 RNG，起点D20+(R&7C)，只向后查当前256B页；满页也耗这一次，无重试 |
| 301C / 2BD9 | type9先于2BD9且使用D20，跨页前移必须真实执行；本身不另耗RNG，失败后调用者仍继续消息分支 |

5899及2AD2的FF以外异常势力byte会按原乘40h访问别名，没有补合法势力门；事实是指令参数化行为，不意味着每个byte都有原战役产生前缀。

## 9. P09执行见证、页时相与暂停现场

- `owned-match/mismatch`各32将、585F耗192..223号RNG：G5/23/27分别28/30/25排type9，NPC无消息后写current24；R为46/58/41的G26/28/31仅match清旧属/身份。两例完整99756/99687条、682 RNG。
- `old-active/inactive`各32无属/remembered13：六个R<64者先清记忆；旧方活动则入属13，旧方inactive时仅attr A0的四人清0，其余仍无属。完整99756/95978条、均682 RNG，但外交阶段末游标257/255不同，不能用总数相同隐藏次序差异。
- `countdown`覆盖inactive、1→0、FF→FE、oldFF跳过；585F无RNG，月末645。
- `free-npc4/inactive/skip/wrap`另以玩家20测试。四将R240/194/97/251分别走倾向拒绝、rank3、rank34夹1、倾向拒绝。G1/G2分别入17/15、17/15、18/15、1/21；完整RNG654/654/652/654。inactive跳过和从方21回绕0均有见证。
- `budget-peace/war/reverse/floor/maintained/full`六例：type4城69通常5350，floor为0仍入offset44；type5方13分别9400/17200/21000。maintained两官预算1不排；full三未来页占满，经2BD9前移后当前页仍满，两次失败。成功/满页5397→539A→539D均218→219→220；maintained为218→218→218。**这是预算生产，不包括预算对话或扣款。**

真实`owned-match`中D20=100h时type9写offset324/336/344，到5394仍在下一页；2BD9前移后位于68/80/88。预算在2BD9之后使用已清零D20排当前页。入口D20不同不能套同地址或默认队列仍存活。3007采样CF是STC执行前的位，不能把采样false当成功。

四个原CDE停点均在第一条CDE执行前；没有伪造消息返回：

| case | 真返回地址/SP，已耗RNG | 消息前后分界 |
| --- | --- | --- |
| free-no-player（仍玩家17） | 5927/03E8，194 | 普通排行选到玩家；current/计数尚未写，CDE后装CX=41/AL=93再8810 |
| free-player-prefer | 5927/03E8，193 | 玩家倾向通过；同样消息返回后才提交 |
| owned-player-event | 599F/03E6，198 | type9已经入offset336，current仍17；CX=65须跨CDE保存，8810后才改18h |
| owned-player-release | 599F/03E6，219 | old/身份已清、玩家将数已增；CX=66须跨CDE保存，返回后不重复这些提交 |

TALK索引为十进制41/65/66。四份完整最终RAM、栈顶12word及末20IP在`message-stops.json`。继续任务是CDE→EB11、8810真实显示/输入/计时/可能非局部退出，再同一5358余将→评分→外交，不重排type9、不重复加将数。

## 10. type5金额的字节下溢：父补全输入域

原`57CB CMP AL,DL`取无符号minRaw；57D3以80h区分基数100/125；**57DB `SUB AH,AL`是byte**，57DF `MUL AH`才得word金额。因此：

```text
r = min(u8(rawAB), u8(rawBA))
amount = u8((r >= 0x80 ? 100 : 125) - (r & 0x7F)) * 200
```

禁止把减法写成无截断负整数、零钳制或统一最大25000。r=125/126/127得到0/51000/50800；r=228/229/255得到0/51000/45800。父`budget-byte-domain.py`从真实57CB执行到57E1之前，对全部65536个byte对执行671616条原指令，逐项核此公式；131072B结果SHA `360ebe7ac8dba88f87272a9ddc81c8a50904f21bdda82ec789e30c3fac61c25e`。这闭合算术域，不等于这些关系byte都已从合法战役生产或51k申请已通过UI；全5358六预算例与局部域证书分层。

## 11. P09父复跑、来源恢复与未完项

原包`dragon-a02-people-budget-vid_z5k6/`，父目录`C:/Users/fczll/AppData/Local/Temp/dragon-ai-month-events-parent-hwnk3rbi/`。父冻结1540行报告SHA `101ecfc1037d29a334aee09f1a1220718a4aac052879cf2b4ca08924c4fd1eeb`，核105项manifest、4份继承CPU字节及外部P08 CFG/21结果hash，审新源并亲核5715..57FE/585F..59A6/2FBF..304D/2AD2..2AF3。

父独立重跑当前源的19例、40CMP与validator：**49文件逐byte一致，包括全部38初末RAM；13个JSON仅sourceSHA/traceback路径或行号不同，其余执行字段/IP/RNG均相同**。不声称62输出全byte相同。新19例sourceSHA均指向最终`people_budget_probe.py`（560862112ca45662d383af1cdf9eaea07a9f48bc43f70c07cea9571e88dbe0c3），父复跑作为当前来源完整证书。9个原完整例仍指1e4c6b...历史源，两owned暂停指已留59e9bf...；其它2暂停只路径不同。

最初没找到1e4c版本，导致严格比较失败，完整差异保留`parent-replay-failure-01.json`。后来父亲自把已保存`initial-people_budget_probe.py`的CRLF仅转换为LF，恢复**逐byte散列完全匹配**1e4c6bc77b54e48f33f7fb4d05f6f498cf5f0de7758c7c73c2e0c103508f3e00。转换/原散列见`parent-source-recovery.json`；读审恢复版与最终版差异，旧9例配置未受free家族修改影响。没有改原报告/结果，不能以恢复旧源冒称它们已由最终源重生。另一早期依赖检查猜测新包有cfg.py而失败，实际validator引用原P08路径，已按真实引用核hash并保留`parent-setup-failure-01.json`。

本体585F/5715/578F共36条件72边，69边有完整月结RET见证，3边仅消息暂停前缀；原149未观察callee边新增62完整/3暂停，剩84未观察，详见`scoped-branches.md`/`validation.json`。未观察不能视为不可达，四消息后半仍为后续明确工作；未把参数化状态/页时相、字段计数或任命输入当原战役前史。后续[P10](re-notes-strategic-message-abi.md)已从这四现场在明示端口合同下执行CDE真实RET，但只到8810更深显示边界，未完成整消息/5358后半。

## 12. P24：固定槽5358财政与5695生产接线

生产实现拆为纯原规则核`web/src/game/navigation/originalmonthlyfiscal.js`与严格Scenario桥`scenariomonthlyfiscal.js`。`economy.monthlySettlement`仅在存在`nativeFactionSlots`时进入新核；v1旧路径不改。月末App调用经`processMonthlyFiscalSettlement`，任何固定槽缺字段/RNG失败都由既有战略失败拥有者暂停并禁存，不回滚已发生的原顺序前缀。

接线范围严格保持§2顺序：固定22槽只处理`attr>=80h`财政，先563B扣原`F+1A..1C`、再53C6扫描固定192城；NPC收入右移1后执行5456，玩家按显式CFD读取D08/D0A..D0F；三池55EC后5609加钱、写F23、清旧费，再5828按税后负值逐池消费RNG。全部活动势力完成后才5695固定192城各消费一次RNG并写生产/增长。CFD必须来自`nativePlayerFactionPointer`，CFF仍独立来自`player_faction`；二者不互推。

5456按地址别名实现127个20h半记录：偶数半项读固定完整槽0..63的`status/faction/troops`，奇数半项读完整槽0..62的`targetCity(+20)/contactAnimationByte21(+21)/monthlyAliasWord24(+24)`。为保存原+24别名，固定军团槽schema新增显式u16 `monthlyAliasWord24`；仅新章零表可由已证8192B全零初始化，JSON缺失不补。扫描逐项u16回绕，旧费仍取未清的F+1B；不能改成公开活动军团列表或128槽全扫。

资金桥只接受signed24 `money`并按原raw24写回，同时同步既有显示别名`gold`；563B只下封`F60168h`，5609只上封`09FE98h`，不以普通JS整数净额一次钳制。城市5695按16位IMUL低word、SAR及word回绕执行；玩家税率对growth的byte加减与生产改变量分开，不使用旧Web浮点近似。

本批另从固定KI原字节实际执行`5358..5715 / 5828..585F / ECE0..ECFE`，10例覆盖NPC、玩家、费用等号拒征、税后−1三次RNG、首/后半别名，以及5695正负乘积、玩家高税和max封顶；生产逐字段与这10例一致。证据根为`C:/Users/fczll/.pi/agent/sessions/--E--Dragon--/fiscal-core-01a0a5cb/`，其中`oracle/result.json`和`compare.mjs`是本批差分，不取代§1–7的19个完整5358证书。仓库回归`tools/verify_native_monthly_fiscal.mjs`冻结官方原版首章13方8778/65/65/415、费用4352等号拒征、失败前缀与CFD/CFF分离。

此接线只替换5358财政/城市生产核心；后继585F、55A6、2BD9、5715/578F与57FE的新增接线见下节。天气生产虽已有独立严格模块，53A6政策8B复制、四类消息返回及完整连续月结仍未闭合，不能因局部通过宣称整月或全AI完成。

## 13. P24：55A6、2BD9与预算生产连续接线

月结现按真实顺序执行`585F→55A6→2BD9→5715→578F→22DB/2286→57FE`。`originalgeneralrating.js`固定只扫G0..126；`attr>=80h`才以三个专长高nibble、两个全byte能力各乘2并按byte回绕写G1F，G127永不读取。仓库测试以既有256个实际55A6原指令向量逐项比对，并锁定官方曹操54、典韦40及失败保留已写前缀。

`nativeDiplomacyRaw`现从每章`+680h`保留完整24×24有向矩阵，运行时`nativeDiplomacyMatrix.rows`为固定权威；公开`diplomacy`只别名声明行，不扩公开势力。`nativeStrategicEventRaw`保留`+52C0..56BF`的256×4B事件轮（20章源字节均为零），fresh从原字节初始化，JSON恢复拒绝矩阵分歧、槽洞或非法byte。v1与正常App的v2拒绝门不变。

`originalmonthlydiplomacy.js`与严格Scenario桥接回完整同步`2BD9`生产者：先写D20=0/分频7，按word顺序将未来三页前移并清第四页；逐活跃固定22槽构建地理工作表、执行`2D3A`，全部建表后再执行关系变化、type2/type3/type1、`2F71`及目标尾段。候选排序按`2C8A..2CDB`“遇严格更小立即交换”，不是旧Web每轮只交换一次；玩家势力仍执行2EFB。官方原版第一章、玩家曹操、RTC 00:00:00结果为30次RNG、曹操→吕布`A9→A1`、吕布→曹操`AA→A7`并排入曹操type1，与P17完整2BD9证书一致。无普通候选且通过关系门后到`3094`的状态外读仍按原证暂停，不补FFFF保护。

`originalmonthlybudgets.js`接回`5715/578F/57FE`：5715固定192城，读取一次CFF，按城主/内政官/G1A门计算三项正差、右移1再乘50，金额0仍调用2FBF；事件4B为`{4,city,amountLo,amountHi}`。578F固定22槽，以显式CFD pointer跳玩家且不增active门，驻外将G1A为0才按两向raw较小值和byte下溢公式申请，事件为`{5,faction,amountLo,amountHi}`。57FE按CFD所指`word[F+21]`的signed高byte、word NEG门槛39、低4位RNG与F28门排`{13,0,96h,01h}`。所有成功/页满都保2FBF的单次随机起点消费，失败不回滚先前5715写入。

仓库回归`verify_native_monthly_diplomacy.mjs`与`verify_native_monthly_budgets.mjs`覆盖固定源、声明外势力、页前移、立即交换排序、官方30次RNG/关系结果、金额0、51000下溢、满页消费、57FE边界、JSON恢复及失败hold。这里仍只闭合生产与存储接缝；后续政策切换与type10/type13消费见§14，其余type1–8消息/玩家返回和后续月末命令链仍须继续。

## 14. P24：53A6政策切换与type10/type13消息返回

章节头`CS:D08..D17`现以`nativeMonthlyPolicyRaw`完整保留16字节，不再只保存具名的征兵、税率和三项政策值。fresh只能从章节原字节初始化；v2 JSON恢复逐byte核对`nativeMonthlyPolicyState.bytes`及具名视图，缺字节、数组长度错误或别名分歧均拒绝。D08/D0A等兵力字段继续保存原十人单位，UI显示人数是派生视图；未知`D09/D11`也必须原样留存。

月末`53A6..53BD`由`originalmonthlypolicy.js`按四个word顺序将`D10..D17`复制到`D08..D0F`，每个word写完即提交，不能改成字段级赋值或漏掉未知byte。复制完成后以`AL=0Eh`进入`5E80`；本次只把已证的mask更新/返回建模为无规则状态和无RNG的有界表现边界，不借此宣称完整显示实现。复制途中或表现边界失败保留已写word前缀并进入战略hold。财政5358改从这张raw权威表读取当前政策，不再让具名Web字段反向决定原字节。

事件消费新增两个有限真实返回：type10跳表`3496`把`arg1|arg2<<8`作TALK索引，把`FF00h|arg0`压栈后以通用NPC selector `93h`调用8810；Web仅在实际通用TALK弹窗关闭时恢复同一`3E11`尾段，不消费RNG，越出当前1023条TALK资源或缺少消息返回就保事件游标前缀并停。运行时生产者仍未知，未据此新造type10事件。

Type13跳表`3507`先以通用NPC显示TALK51；第一次真实返回后才进入`3DC9`，将玩家势力信赖减50。正常减法精确到0仍使用原selector `0196h`，借位下溢则钳0并改为`019Eh`；selector为`FFFFh`时跳过君主对白及信赖0终局检查。其它selector经`87FF`取得玩家君主，按其`talk_idx`选择个性对白；只有第二段真实关闭后且信赖为0才调用既有终局检查。缺CFD映射/君主/消息边界在已经发生的扣信赖之后fail-closed，不回滚或伪造返回。专项`verify_native_monthly_policy.mjs`、`verify_native_generic_talk.mjs`和`verify_native_deficit_trust.mjs`分别锁定固定KI字节、复制/恢复、事件游标、两段返回、下溢/精确零/FFFF及失败前缀。

到此月结生产前缀及政策切换已接至`53BD`，事件消费者另放行type1 NPC/已战无消息路径、type8迁都以及既有type9、type10、type11、type12、type13的有限实锤域。type1–8全类消息流（含type2/3玩家决定38C7/38E6、type8玩家分支341F→5E60）、8810/5E80规则闭包与月末后续命令链已分别由P25–P33闭合（type1–8见[外交笔记§35–38](re-notes-ai-diplomacy.md)，8810/5E80见[消息ABI§17](re-notes-strategic-message-abi.md#17-p3288105e80传递树写集审计与规则闭包)，月末后续命令链见下节§15）；默认v1及正常App拒v2保持。

## 15. P33：月末后续命令链（1D8E续段、585F玩家消息、兵源对账）

本节为月末后续命令链的唯一详细维护源；`585F`玩家登场/俘虏归宿消息接线的机制细节维护于[去向§18](re-notes-legion-fate.md#18-玩家登场与俘虏归宿消息接线p33-monthly-fate-1)，本节只维护月末骨架与兵源对账。

- 权威窗复核（`tools/disasm.py`现刷）：`5358`本体依次`538B→5695`（192城生产/增长，各1 RNG）、`538E→585F`、`5391→55A6`、`5394→2BD9`、`5397/539A→5715/578F`、`539D/53A0→22DB/2286`、`53A3→57FE`，随后`53A6`政策4word复制（**无独立caller，是5358内联fall-through**），再以`AL=0Eh`调`5E80`→`53C0 RET`。`5358`唯一caller是`1DD4`（在`1D8E`日历层内）；`1D8E`后续=1DD7 day0→1、1DDB hour=0、1DE0 hour=1、1DE9→9377换季视觉（hour==1且day≤16且月∈{3,6,9,12}→调色板0A65+93D7）、1DEC→3E11（先31AE事件泵再轮转单势力tick，游标cs:[D1C]，si+=0x40回绕0x580）、1DEF→1E17日期显示（VGA纯表现但须保栈效应）、1DF8速度等待尾（cfa门+d2c/d2d）→ret 1D1F。`1D0B`主更新=3EFD+25A3+2459+1D8E；`cs:[D2A]==1`→1D20 GAME OVER分支（CDE+8810(cx=0x4B,al=0x93)+君主行8810(cx=0x197→TALK[414+talk_idx])+al=2→1CB1）。Web `clock.js`已精确镜像1D8E刻度（sub 0..8、hour 0..23、换日hour1、998夹顶、5358先于day=1）。
- **兵源实锤（5547 in 53C6）**：原版士兵=每月自动兵源（5695生产力/税率）+玩家財政政策配额：`67CD..6845`四项跳表`cs:[67C5]={67CD税byte→D10, 67E6/6806/6826三个word÷10→D12/D14/D16}`，7C6E键盘（cap税100/配额10000），次月经53A6转正、5358玩家财政541E→548F读取。**v1 `recruit()`命令（花200金次月+500，commands.js，pendingRecruits队列）与`develop()`无原版对应，属未批准差异候选**；P33起native场景`recruit()`返err禁用、`pendingRecruits`入账与清空跳过、`monthlyAppear`跳过（585F逐月减G18=appear_months与v1按elapsed阈值直改faction的双机制冲突消除），v1路径全部保留。该裁决项待用户确认。
- Web月结结构：`main.js onMonthEnd`在5358序列后建nativeBlocked守卫（`scenarioNativeRoadContext||hasNativeLegionSlots`）与`runRemainingMonthEndSteps`闭包（ratings/diplomacy/budgets/disaster/deficit/policy/monthlyAI/cmd.monthEnd/monthlyAppear，仅非native部分受守卫）；`processMonthlyGeneralFates(this,tail)`返回'suspended'时尾巴挂入`_nativeMonthlyFateContinuation.deferredTail`，消息关闭后续跑。v1支路不挂起、立即顺序执行，行为不变。monthlyAI清死军团是既有已记产品决定，保留。
- 回归：`verify_native_legion_fate.mjs` 40项（含deferred全合同与续扫链）、monthly族/war/negotiation/player_decision/budget/capital/city_request 99项、scenario_assembly 5项、save族 8项全绿；savegame禁存门覆盖挂起中状态。
- 仍未闭合：35ED外围（callers 3516/389A）、1D8E事件泵整链、C01/C02/C03/C07/C08外围、生产native内容挂载（nativeFactionSlotRaw/nativeCityRecordRaw等）、保存恢复整链、准入重评估；默认v1及正常App拒v2保持。
