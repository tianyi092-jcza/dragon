# 原始音频与接战标记证据

本文件是音效、音乐与接战标记的详细原始证据维护源；观察用于提出假设，不证明机制。

## 音频勘误与交付边界

- **撤销**“SB Pro双OPL2/左右两颗YM3812”“所有接战固定五声、82.5ms、2倍速、可叠播”和“听感确认等于音色认证”。端口布局及用户观察都不能推翻下列原始指令。
- **原版实锤（Web接战节拍差异见下文）**：驱动写OPL3 NEW和六组4-op。音乐是六个4-op声部；ID3用bank0未配对的2-op channel6，波形7/6。两种接触均请求ID3；首次不发声，只在道路轮询到期且倒数>1时重触发。
- **设置勘误**：撤销把用户原意解释成“独立音效/音乐两行”和“四种SFX音色”的实现。现按原菜单仅保留「音效」TYPE1/2/3/4/關閉，连接CF9音量，不手动换曲或切换音色。标题0、四季2–5、交涉6、战术7–10、失败OVERBGM使用`web/grf/music/playback.json`与`loops/*.flac`；不恢复OPEN动画或已取消的END。原四季试听WAV及14曲MIDI/VGM仍保留，但**不拿首次主循环截断的试听文件当循环资产**。
- **合成边界**：49700Hz软件OPL3、固定增益8、同IRQ内忽略总线延迟；FLAC无损压缩这个合成PCM，不是实机录音。控制状态/寄存器周期已经闭合，**PCM振荡器/包络相位首尾仍不相等**，未加猜测crossfade，不声称无接缝或真实硬件逐样本等价。
- SFX产品使用单记录`ynsound-record3/record13.wav`，按共享音频时基排后继；原完整`ynsound-id3.wav`保留为证据/试听。AH7取消未发出的后继但保留当前记录自然衰减。PCM重触发仍重置软件核初相；浏览器音频时钟不是实机PIT相位。MIDI只保留音符/细调，不保留FM音色。

## 音频原始来源

路径均为 `E:/Dragon/Dragon/`，不访问 `SAVE.DAT`。KI地址=加载模块偏移，文件偏移+200h；COM地址=文件偏移+100h。

|资源|字节数|SHA-256|
|---|---:|---|
|KI.EXE|67099|`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`|
|YNSOUND.COM|3463|`e2c6a6a8576c4f2a96b7e3f156d7f48c9570ae03539fe9367adb78aebb364fa1`|
|SOUND.DAT|304|`b5624388d1bc8f6bb32aeff1d19b1da4c010d7b5a9682a249f1b807c27f2cdba`|
|BGM.DAT|20826|`7a51c8b9a349b9e088f3796b70c268181c60bcebead70942f00e1621523dedc9`|
|OPENBGM.DAT|3424|`efd1975074e0269924c9910c060c080a029d0dbbf931de7d929caa88775c6e9b`|
|ENDBGM.DAT|2218|`1b01917f5bb83cb3946cf4e0aa758bed61a181f7bbb8557fea4e0264f3aa6983`|
|OVERBGM.DAT|684|`702154f9d104a865b9c45a17469b10cb7aea89e08ed1e1270dde85735e38a681`|

## 接敌音效与道路轮询（实锤）

`25A3`每战略主更新处理16槽，128槽循环。每活跃槽先`25C1 dec byte[SI+0B]`，仅归零时重装`+1E`、清status bit5、调用`2662`；无论是否轮询，随后都执行`2600`每日费/士气及`264A`接触倒数。

`6FD2`依次读取六队`+28+i*4+2`兵种（不按该队兵力过滤），任一非1便置CH=1；扫描后CH++，BX>012C再CH++，写`+1E`。此处BX是军团指针扫描末址，对有效军团恒大于012C，**不是总兵阈值**。所以全六队type1周期2，其余周期3。

`2662→道路下一点→2831`检查野战占用，城前候选tile `CE..DD`由`2708→2880`检查攻城。`2866/28AE`首次只写+3=12，同槽`264A`降至11；`286C/28B4`后续倒数>1时AL=3调用`02F5`；倒数==1直接进入战果分流，不再发ID3。

```text
每活跃槽：
  delay = u8(delay - 1)
  if delay == 0:
    delay = period
    bit5 = 0
    重新检查当前道路接触
    if 接触:
      bit5 = 1
      if countdown == 0: countdown = 12  // 无声
      else if countdown > 1: request(3)
      else: 进入战斗处理               // 无声
    else: 本次道路动作可继续
  调用2600
  if bit5: countdown = u8(countdown - 1); if countdown == 0: countdown = 1
  else: countdown = 0; animationGroup = 0
```

持续不变的接触输入，首次写11为visit0：周期2在visit2/4/6/8/10发5次，周期3在visit3/6/9发3次；都在visit12进入战果分流。声音间隔分别16/24个战略主更新，**不是固定毫秒**。非轮询槽即使对象已经移走仍保留缓存并继续倒数；到期重检才清状态或换接触目标。

Web边界：本次修复`startEngagement/advanceEngagement`接触等待区域的`moveDelay/+0B`与`movePeriod/+1E`；正常非接触道路动作仍有既存调度差异，未宣称整个`25A3`已经逐指令等价。新接触保存重装相位；原始导入直接读取两字段，新IndexedDB快照保留它们。缺少字段但有64B raw的旧解析数据从raw读取；既无字段又无raw的旧Web接触只能保留“下一槽重检”的旧兼容入口，不虚构丢失相位。相位不能从countdown猜出。

`02F5`优先级门：**旧ID>=新ID直接通过；新ID更大才经INT61/AH0A查busy mask04（bit2）**。旧笔记把比较方向写反，已撤销。原字节`2E38060F02/730A`比较CS:020F against AL。相同ID3可重触发。AH5经COM `01DC→07E6`读取SOUND的16B记录，`0828..088D`先写B6=0、53=3F、50=3F，再依次写：
`30,33,50,53,70,73,90,93,F0,F3,C6,A6,B6`。

ID3记录+0D=13、+0E=3；ID13后继0、计数7。`07CF`由INT1C递减后继计数，到零调用07E6。记录0只关音/衰减并清099E bit2；原记录0后继和计数均0（**不是写FF哨兵**）。每次新请求重置同一通道/后继，不叠加多路声音。SFX的3/7 BIOS tick换算基准为65536/1193182秒；实时请求到首次后继有0..1 tick相位差。

COM `0154..0164`向bank1写`05=01,04=3F`，故为OPL3兼容程序，bank不等于左右；具体实机声卡型号未认证。AH8 `0269`在music active(mask02)时清099A起23 words，ID3活动态099E从6变0，**保留09EE=13/09EF=3，且不写channel6**。AH7 `01F6→0318`清0998..09F5，使099E=2、next/count=0，**同样不写channel6**。后续07CF计数由0回绕255，直到第256 BIOS tick才执行record0的B6=0/53=3F/50=3F。因此音乐关停不能立即切断当前SFX，开始音乐则取消未来后继。`verify_music_driver.py`直接执行原COM验证这两个边界。

单记录3/13的30/33=08（EGT bit5清）、90/93=6F/7F，不靠人为fade也自然衰减；固定软件核最后非零约0.16515/0.16519秒。产品为每段保留0.60012秒，首次ID3立即起播，record13在`(floor(now/T)+3)*T`起播，record0边界`(floor(now/T)+10)*T`停止，其中T=65536/1193182。同ID重触发先清当前/待排程的旧请求；音乐AH7只清未起播后继，已起播记录自然衰减。原CF9关闭不取消这些SFX请求/后继。`speaker.toggleMute`仅为独立诊断接口，可取消PC音、延后警告音和FM；已从系统菜单删除旧SFX profile/关闭控件，不把诊断静音当原CF9。

## 接战固定音画节拍（用户批准的Web产品决定）

来源：用户明确要求接战音画解除战略速度绑定、同步起止，并进一步强调要“比较急促”；允许此处不与原版时序一致。此前提议的640ms/帧未采用。现固定**100ms/帧、200ms一次ID3**，四相按3→2→1→0循环；这些数值是Web表现选择，不是原版测速或“同档恰好两倍”的认证。

- `EngagementPresentation`只在主RAF中推进，绘图仅调用`frameOf`。大地图四相、小地图方块和单声道音效共用一个经过暂停扣除的墙钟；不读取战略/战术速度、规则倒数奇偶或道路轮询相位来计时。
- 第一次可播放/可见的接触立即显示首相并请求声音。其它同时接触加入公共节拍，不因军团数量增加声音频率或叠加音量；规则轮询替换`_engagement`对象或目标不重置节拍。没有接触时不播放；最后接触解除、委任gate/战术/标题/换局边界清理音画，不追加尾动画或等待音频。
- 仍只在真实`_engagement`有效期内显示；原`11→1`倒数、`moveDelay/movePeriod`、第12次自身槽的战斗入口、胜负与RNG完全不由此类推进。**独立的是换帧/声音间隔，不是整个接敌等待长度**：战略速度仍会改变等待窗口的现实持续时间。
- `ai.advanceEngagement`不再直接调用`engageSfx`。上节原版首次无声、每16/24主更新请求、5/3次的结论仍是原始事实，但不再是Web音频策略；原道路规则门控和内存保存续态测试继续保留。
- 菜单/鼠标hold冻结相位并停止当前与未来SFX；恢复不补播暂停期间声音，接着走剩余相位。后台隐藏先清墙钟基准；延迟RAF至多播放一次当前节拍，不积压音频队列。音频未就绪/被拒绝则丢弃请求，不能反向阻塞规则。
- PCM仍为原速、同一channel6单记录3/13，**不升调、不修改音频资产**。200ms重触发可能截断前次record13剩余尾音，这是明确的急促Web表现，不再声称每次必定完整播完原3/7 BIOS tick链。CF9和音乐AH7/AH8的既有处理不改；表现停止显式调用`stopEngageSfx`取消当前及未来节点。
- 测试：`verify_engagement_presentation.mjs`验证五档相同100/200ms事件序列、无状态写入、暂停/后台、多接触和丢弃积压；`verify_engagement_browser.mjs`以fresh Chromium的真实RAF/Canvas/WebAudio验证节拍和起止；`verify_engagement_poll.mjs`继续认证原字节、道路周期、快照续态和战斗入口，并禁止第二路规则驱动声音。

## 单一「音效」设置（本轮勘误）

原`KI:1756`保存CP950 `AD B5 A1 40 A1 40 AE C4 00`，即「音　　效」；设置描述符`5FF6`、分派`6056→60A1→02D0`对应CF9，操作语义见下节。截图只提供核查线索，原字节与指令才是证据。用户已明确要求恢复该单一控件，旧“用户要求保留两行/四种音色”的归因撤销。当前六行是既有Web保存、读取、音效、战略速度、战术速度、退出；本轮不改变保存/读取入口或补回原16色画面模式。

PC确认/警告调用`0CDE/0CE7`无条件以AX=0101/0202进入`EB11`。完整`EB11..EB6B`链仅以AL作重复次数、AH作重复间隔计数，port61 bit0/1门控、port3DA bit3垂直回扫等待，**不读CF9**，也不选择四种音色。旧speaker注释的“AH控制每次脉宽”“约18Hz回扫节拍”撤销。原音高编程不在这条门控链内；保留既有Web默认950Hz方波/gain0.12及确认50ms、警告70ms/间隔140ms的表现近似，不宣称这些参数是原PIT/声压/逐采样认证。TYPE2–4不改变它们；CF9关闭只停止背景音乐，PC确认及原ID3仍能发声。TYPE1的AH7会清未来SFX后继，是已证共享驱动边界，不是音色切换。

`verify_music_driver.py`固定KI全hash并验证菜单字节及完整PC门控链；`verify_sound_profiles.mjs`现用于反回归：不存在profile选择器，单一CF9改变音量/OFF而不改变曲号、PC波形或FM记录。`verify_music_browser.mjs`实际点击唯一音效行，核对四档GainNode值、关闭、无第七行/音乐文字及两速度、保存/读取、时钟/RNG保持。

## 音乐目录、选曲与驱动（实锤）

`KI:9321→0241`由月份-1索引9309十二字节：
`05 05 02 02 02 03 03 03 04 04 04 05`。

|目录|原档offset/length|月份角色|有界展开秒数|
|---|---|---|---:|
|02|093A/0342|3/4/5（春）|68.209|
|03|0C7C/044C|6/7/8（夏）|102.317|
|04|10C8/0340|9/10/11（秋）|34.263|
|05|1408/0762|12/1/2（冬）|54.861|

春夏秋冬是月份角色，不是猜测的官方曲名。归档共11条非空8B目录（u32 offset/u32 length，但KI仅读length低word）：
`0:0100/058E,1:068E/02AC,2:093A/0342,3:0C7C/044C,4:10C8/0340,5:1408/0762,6:1B6A/01FA,7:1D64/1840,8:35A4/05E8,9:3B8C/0D1A,10:48A6/08B4`。

- `1A74→0241`选0；1用途未知。`384C/3940/3A26/3B24`交涉工作流选6，返回9321恢复季节。
- `9A5E..9A6F`地图目录<C0得mode0、C0..D0得1、D1+得2；`99D4..99EA`mode0按D35 bit6选7/8，mode1选9，mode2选10。10不是不可达占位。
- `1DE9→9377`换季只在3/6/9/12月，**CF3=hour=1**时处理；AH保留**CF0=day**：day1经02C2淡出，day2经0241加载。不是hour1淡出/hour2加载。原版1DD7..1DE0换日重置hour0后立即加至1；Web现有Clock换到hour0。本批仅在onHour最前端读取字面day/hour，不更改日历/RNG；相对换日边界的这一小时差异仍存在。
- `0241`同索引短路；先AH8停止，读取80h归档目录，再`E38C→F4DF`按offset/length读曲目。`029B mov AX,0606;02A3 mov AL,5`只是改AL，AH始终6；AH6装曲，CF9非零再AH7开始。
- AH0/2/3分别初始化、注册SOUND指针、安装timer。`5FF6`菜单描述符指6010、count5，原文为全角OFF及TYPE1–4；CF9默认1。`02D0`：0→AH8；**只有1→AH7重启**，再AH0B设衰减0；2/3/4仅AH0B设衰减4/8/12，不重启。故直接OFF→TYPE2也不能启动停止的驱动。旧“非零都重启”结论撤销。CF9虽在原菜单名为「音效」，实际控制音乐衰减；没有四种beep音色选择。COM AH0B=`02DE`写0996后只即时重算声部0–2（02F3比较AH,3），其余声部在后续音量/patch处理时应用；0318不清0996。统一GainNode不会复原这个逐声部更新时序。

COM `0103`按AH索引0115函数表，AH6=`01E2`固定A4C=6（忽略AL5/6）。AH7=`01F6`读取歌曲+10/+12/…/+1A六个入口，+2音色表、+4第二表。+1C..20额外三个指针未被AH7读取；+4表被保存到099C但播放链未见读取，均不补用途。

每条歌曲以自身起点为相对地址。+22h共享空声部循环到+30h；02/03三有声部、04四有声部、05六有声部。所有声部仍参与轮询。

### 双字节事件与时间

`03DE→03ED..045A`按声部0..5先递减word计数，signed>0跳过；到期读取AL操作码/AH参数，命令连读直到音符/休止。

- AL<80：参数bit7清先06BF key-off并设本次重触发标志；时长取AB0+(AH&7F)。note低半字节0为休止；否则069E缓存音高，只有重触发标志置才06BF写芯片。bit7置的不同音符不一定立即改频/重触发。
- 时长表AB0..ACF：`C0 60 30 18 0C 06 03 00 00 90 48 24 12 09 00 00 80 40 20 10 08 04 02 01 C0 60 30 18 0C 06 03 00`。零时值也要下次处理才读下一条。
- AL>=80用`(AL&70)>>3`分组：80音量；90渐强弱；A0音色；B0全局IRQ除数；C0控制跳转；D0记录标记；E0 no-op；F0写0999。
- D0记main；D1记repeat并写count；D2记sub且ret=0。C0跳main；C1先u8减count，非零跳repeat；C2保存ret并跳sub；C3 ret非零则跳ret但不清ret。只有单层返回字段，不能当通用栈；02/03实际使用子段调用。
- `04D4→0959`令B68=`floor((255-AH)*11/8)&FF`。IRQ处理先重装B69再解码，故本次B0新除数从下次重装才生效；0代表256IRQ。
- `08D7`PIT mode3/divisor0100，IRQ频率1193182/256；每16IRQ游戏回调，每256IRQ BIOS链（独立于B68）。INT1C `071D..073D`做六轮声部fade更新，解释器实际执行075E。
- 初始化B68/B69=1；四季在IRQ4改46/46/52/49；05还在197524改52、227473改49，不能套固定BPM。

### 四算子音色与音高

逻辑声部0..2用bank0的(0,3)/(1,4)/(2,5)四算子对；3..5用bank1同三对，立体声由C0 bit4/5决定，不由bank决定。32B音色实际用：+0..3→20组、+4..7→40组、+8..B→60组、+C..F→80组、+10..13→E0组、+14/15→两通道C0。算子offset=channel+{0,3,8,11}。

`053E`先key-off/预静音carrier再编程，`060F`算衰减=min(63,4*(15-volume)+globalAttenuation)。根据patch连接位索引A4E的`08 0A 09 0D`carrier mask，仅指定算子TL加衰减并饱和63，保留KSL高两位。

`069E`高字节取AD0[note]，低字节取B50[note&15]：
`00 55 6B 81 98 B0 CA E5 02 20 41 63 87 00 00 00`。
F-number/block原字节实锤；晶振标准值14318180Hz不是具体机器测量。MIDI用标准OPL频率换算保留每声部±2半音pitch bend范围内的细调（相对A440平均律约低8.88..19.57cent），不猜GM program，velocity固定96仅为转写表现。

## 可复现导出与验证

仓库命令（仅离线工具，已有Python/capstone，不新增产品运行依赖）：

```sh
python -B tools/audio_recovery/recover_music.py
python -B tools/audio_recovery/validate_music.py
python -B tools/audio_recovery/recover_sfx.py
node tools/verify_engagement_poll.mjs
node tools/verify_engage_sfx_asset.mjs
```

解释器私有RAM加载原COM，执行013E/01E2/01F6以及音乐03DE/075E；没有替换053E/060F/069E/06BF/0890。SFX执行原AH2/5与07CF，再由独立寄存器映射核对37次写入。IN返回0仅用于延迟循环；无DOS文件系统、CPU周期、IRQ抢占模拟。14首独立结构化decoder逐条匹配音符/休止PC、时间、参数、首循环回跳和变速；VGM往返66192次写入，MIDI10671个note-on通过SMF解析。

`.events.json` 的writes条目为 `[IRQ, register0..511, value]`，时间=IRQ*256/1193182秒。同IRQ顺序保留。VGM为1.71/YMF262/5E和5F命令，按绝对IRQ换算44100Hz等待量化（误差≤半采样）。软件核原生输出49700Hz stereo16bit，`.wav.json`记录输入/核/WAV SHA256、样本数、峰值/RMS和固定增益。四首峰值1896/3496/4136/5832，SFX5752，均非静音且无削波；这不等于听辨/真实硬件差分通过。

WAV再生需要**离线临时环境**的 `opl3@0.4.3/lib/opl3.js` 及其 `extend@3.0.2`；不将这些包或第三方核复制到产品。npm包metadata宣告MIT，README指向Robson Cozendey OPL3原实现；本次仅外部工具使用，不据此声称完成第三方源码再分发许可审计。

```sh
# 在临时目录从registry下载并解包固定版本，勿运行安装生命周期：
# https://registry.npmjs.org/opl3/-/opl3-0.4.3.tgz
# https://registry.npmjs.org/extend/-/extend-3.0.2.tgz
# 将extend包放在opl3 package/node_modules/extend；然后：
export OPL3_CORE_MODULE='<absolute temp path>/package/lib/opl3.js'
node tools/render_opl3_vgm.mjs web/grf/sfx/ynsound-id3.vgm web/grf/sfx/ynsound-id3.wav
for n in 02 03 04 05; do
  node tools/render_opl3_vgm.mjs web/grf/music/BGM_${n}.vgm web/grf/music/BGM_${n}.wav
done
```

核文件hash=`74dee027c6e2ba248d06e88a60b6756316280ee3a7563b6c7b42d088e26e8ada`；extend入口hash=`b4879ec38a11a2458846788b91be630e6b1d06eb07f9515adc1ff9030af0b00b`，渲染器强制核对。核的rhythm noise分支有非确定性，本链未启用BD bit5；渲染器遇到启用便拒绝，绝不把它带入规则RNG。先前ffmpeg/libgme实验产生全零PCM，已明确作废，未交付。

### 音乐生命周期与Web接入边界

- `02C2`先把缓存曲号020E写FF，再AH9/F2。F2是reload8/count15/delta−1；INT1C每tick六轮fade sweep，在BIOS ticks `2,3,4,6,7,8,10,11,12,14,15,16,18,19,20`递减，tick22执行AH8。请求相位导致约1.153–1.208秒。不是随意的线性gain ramp。
- 标题`1A74→0241(0)`；新局/读档返回`1A96→02C2`，`1AB1→9321`选当前季节，`1AB4→60A1`应用设置。Web装配后选loaded month；音频加载不进入必要Promise/all，不等待ready或持有规则hold。
- 战术`99AC→02C2`，资源就绪`99D4..99EA→0241`按权威`session.registers.mode/battleSideFlag`选7/8/9/10；战术返回`9A1C→02C2`，外层`2CC9/2D73→9321`恢复季节。委任速算不进入战术音乐。Web覆盖BattleView两个加载失败出口，场景owner阻止旧回调覆盖失败/标题。
- 交涉`3B24`君主出阵/迁都、`3940/3A26`玩家提案、`384C`来使/预算，进入选6、返回9321；普通军师报告不切6。预算先保留普通report原音乐，进入request/zero_worker阶段才切6。Web来使合并展示report/request，按进入该合并视图切6；这是既有UI粒度，不声称复原了两个原始子边界。
- `YNVSHELL:0383`表先D7OPEN→KI；KI exit1分派D7OVER再回KI（不重播OPEN），exit2分派D7END。D7OPEN `001B→07C1`、D7OVER `0010→0201`均AH0/3→载入独立DAT→AH6/7无条件开始；退出分别`003B→07EB`、`0016→022B`用AH8/4，无AH9音乐淡出。OVER持续到结束画面退出。
- 追加来源SHA256：YNVSHELL.COM=`629d5c71c96b2502cd9d256b2fabd74e7275b7014f0a0743cd0dd07a8204a6b8`；D7OPEN.EXE=`e96d8a7bbc1aeab2a039945c64c350f557d64890049f49b186b6f77d85eb80b6`；D7OVER.EXE=`e99c8bb66782a3892ddd388f654b95225aa21f3245fe7024d98c69da0941e340`；D7END.EXE=`73d97e19edf83538c7fb51d5ceda9cf498d8f5521b45a32d855b15603d313896`。这里只认证shell END分派，未扩展为整个END表现时序。

**Web表现/既存接入边界（不是原版机制）**：按用户最新纠正，已删除额外音乐行及独立SFX音色设置；不能继续把旧两行布局写成已批准要求。既存Web背景音乐关闭仍抑制OVER，原独立D7程序不读CF9的差异保留标注，本轮不改失败场景生命周期。无新增关闭按钮；菜单仍右键退出并保持原hold规则。PCM的TYPE每档按3dB master gain近似原4 TL单位，fade按上述tick逐档减3dB；不等于原逐carrier饱和/逐声部音量处理。切曲按入口/返回顺序提交，不人为补DOS磁盘/绘图耗时，不为淡出暂停规则。缺音频、被浏览器拒绝或旧请求失效时静默，后续手势可重试当前意图；只缓存一首解码PCM，旧网络结果不进入decode/替换新场景。声音设置保持当前Web应用生命周期，不伪称已认证DOS磁盘设置持久化。

### 可复核循环资产

`tools/audio_recovery/extend_music.py`执行原CPU，记录六声部RAM、倒数、fade、tempo、寄存器像及BIOS余相位，以**实际状态字节**寻找复现，并核对第二完整周期的状态及有序寄存器写入。只投影永远静音的声部：原流严格`D0 00; (00 00)×5; C0 00`，仅休止/本地无条件跳转，没有全局命令；06BF只写自身A0/B0=0且从不key-on，A4A在每声部前由03E8重置。静音声部不占SFX channel6。没有按听感忽略声部。

|曲目|投影loop起/止IRQ|49700Hz PCM起/止sample|
|---|---|---|
|02|306871 / 624823|3272243 / 6662645|
|03|220759 / 697687|2354009 / 7439612|
|04|5 / 159749|53 / 1703444|
|05|9364 / 265108|99851 / 2826913|
|OVER|3013 / 199621|32128 / 2128609|

所有11首完整数据见`web/grf/music/loops/*.proof.json`、边界状态hex、events与PCM证书。标题0仍需约415.046秒（4个乐谱周期）才能闭合，不能拿一次主循环代替；静音投影不适用的曲目仍保留完整状态。直接`round(IRQ*256*49700/1193182)`，不能混用经VGM的44100Hz双舍入端点。FLAC往返解码逐字节SHA核对；约47MB网络资源、按当前曲目加载，**不减少解码PCM内存**，标题约165MB float stereo。浏览器可能再重采样至设备采样率。

寄存器循环**不证明PCM首尾无缝**：软件核phaseEqual=false；四季末/起样本分别`0→352, -384→16, -1552→384, -392→584`。未添加crossfade，也未认证实机模拟滤波、剩余音色相位或逐样本等价。

```sh
# 已有capstone/node/ffmpeg与上述临时OPL核；中间WAV仅写OS temp。
python -B tools/audio_recovery/build_playback.py
# --reuse-rendered仅复用已生成的CPU/PCM证书，仍验证哈希及FLAC无损往返。
python -B tools/verify_music_driver.py
node tools/verify_music_loops.mjs
node tools/verify_music_runtime.mjs
node tools/verify_music_browser.mjs
```

运行时维护源：`web/src/core/music.js`（播放/缓存/音量）、`web/src/core/score.js`（场景所有权）、`web/src/core/speaker.js`（SFX及共享驱动后继）。规则层不依赖音频ready、不改RNG/时钟。

## 接战小地图标记（实锤 / Web 样式决定）

认证源：`KI.EXE` 67099B，SHA-256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，下列地址为加载模块偏移（文件偏移加 `0x200`）。

- `0x2AF4` 按军团槽扫描接触状态 bit5；`0x2B3C` 置 bit4 并按军团 `+0x21` 与 `+3&3` 选取 `MMAP.MCH` 四相大地图图案。在攻击军团当前 `+0x10/+0x12` 坐标居中绘制，之后另绘普通 16×16 军团标识。原始 48×48 爆炸图不是需要删掉的 Web 十字。
- `0x2B80` 仅在小地图可见时继续；`0x2B88` 将攻击方坐标各除以2，加 `0x1B6/0x26`。`0x2B99..2BA4` 以 `+3` 偶数选 `AH=0x3F`、奇数选 `AH=0xFA`，调用 `0x5D19` 方形标记绘制。没有额外 250ms 墙钟、1500ms 尾闪或十字绘制。
- `0x5D19` 先用 `AH` 低色位和 `0x60` 掩码绘制中间两行，再用高半字节和 `0xF0` 掩码绘制方框。普通据点 `0x5CE0` 配色为中立 `0x0F`、玩家 `0xAC`、所查看势力 `0xF3`、其它 `0x83`。**原始接战 `3F/FA` 不等于普通所选/其它 `F3/83`**，不能把用户描述直接写为这些原始色码。
- `0x2BA8` 清 bit4，随后 `0x9656/0x96ED` 恢复小地图底图。暂停时不推进 `+3`，故方块不独立换相；不应在解除接战后靠独立定时队列继续闪光。

**Web 产品决定（本次用户要求）**：接战时复用现有“查看势力/其它势力”的两种 5×5 外框、3×3 蓝底方块，奇/偶相位分别为白框/深蓝框；据点战标于对应据点、野战标于接触目标坐标。现按上节用户批准的独立固定音画时钟读取同一个`EngagementPresentation.frameOf`，不再读取`_engagement.countdown`奇偶；与大地图四相同源，不改胜负、RNG、输入hold或军团路线。普通行军目标不闪动，结束不残留十字。

实现：`web/src/render/minimapmarkers.js`、`GameBar.drawMini`。验证：`tools/verify_minimap_battle_markers.mjs`（原始字节认证、两种方块、暂停相位、立即清除、无副作用）；`tools/verify_advisor_delegation_ui.mjs`（普通行军和接战分离）。
