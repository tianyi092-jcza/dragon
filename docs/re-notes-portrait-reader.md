# E-05-PORTRAIT-READER-1：075B / 四缓存 / KAOGRF 读取边界

本轮只读原证，**未实现FF无图规则、补图、缺依赖策略或Q69运行绑定**。详细维护源在本页；[库存](editor-trial-asset-inventory.md)只引用摘要。既有64门、离线398库或单次App成功不构成原版可达性证明。

## 原始输入与复核

- `E:/Dragon/Dragon/KI.EXE`完整SHA `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`；CS→文件偏移加0200。
- 同目录固定`KAOGRF.DAT`实读307200B，SHA `b9c7745e3ed9b32f0c12003fe81f82756136f738427dc421ec96f6c4ed5c4ac8`；本次没有打开由数据指定的任意路径、执行DOS或提取器main、读取SAVE/profile。150个完整2048B记录且无尾，仅是该已签文件事实，不是硬编码容量或扩容批准。
- `python -X utf8 -B tools/audit_editor_portrait_reader.py <round>`固定窗口和指令签名；[最终r3 receipt](../.dragon-analysis/editor-phase/trial-portrait-reader-r3/receipt.json)、[原指令窗](../.dragon-analysis/editor-phase/trial-portrait-reader-r3/windows.txt)。正常与`-O`[r4](../.dragon-analysis/editor-phase/trial-portrait-reader-r4/receipt.json)所有输出byte同；[复现/四拒收](../.dragon-analysis/editor-phase/trial-portrait-reader-session-r1/repro-receipt.json)验证越界round、既有round、缺/多参数在优化模式仍拒，既有输出不改。r1/r2较早少BCD窗口的输出保留，不冒最终源码。

## 局部实锤（正常局部返回的前提明确）

| 原指令 | 可复核结论 |
| --- | --- |
| C31F..C34D / C350 `mov al,[bx+1]` | C315先由D2E/D30军团**槽位**派生G记录，DL=1时交换侧，然后取G01到AL、G1E到AH；不是军团+2主将回退。C315是否由某具体G127场景进入另待审。 |
| C39C..C3B7 | AX入栈，D9D1字体步骤前再存AX，C3AF恢复后C3B0调用075B；E8 near按16位IP回绕，目标075B而非线性1075B。这里不宣称D9D1完整返回/字体与整帧等价。 |
| 075D / 0785→0BCD / 0C12 | 075B保存原AX；BCD自己在0BCD保存AX并于0C12恢复。**正常返回**后到079D不改AL，再调用07D2；不能把075D那份直到07C1才恢复的AX误当079D前的恢复。 |
| 07D2..07EA | 以AL顺序比较四个CS:0846..0849标签，命中直接0828；没有FF专用早退。静态0845..0849为`00 FF FF FF FF`，只证明初始标签/游标，不证明初始像素缓冲内容。 |
| 07EC..07FE | miss按CS:0845选标签并**先写新AL**，游标`(index+1)&3`；不是读取成功后才填标签。原移位把该cache索引换成目标SI=`index*0800h`。 |
| 0802..0824 | DX=0D79，指向原`KAOGRF.DAT\0`；BX=CS:D40目的段，AX起始`AL输入<<8`，CX=0，三轮SHL AX/RCL CX生成32位offset=`portraitByte*0800h`，DI=0800h。0824 near目标E38C。全256个byte演算只验证这组指令算式，非CPU/原运行轨迹。 |
| E38C..E3A5→F4DF | wrapper保寄存器，正常reader返回CF清才通过E39D；CF置位经int50后重试路径。不能把设备错误当正常消息回调。 |
| F4DF..F527 | DOS `3D00`打开、`4200`按CX:AX绝对seek，`3F`以DS:SI/DI请求字节；F510返回后没有AX与DI的长度比较。LAHF/SAHF保存CF，关闭后AX被写FFFF，原读数不作为外层short-read门。此处没实测DOS EOF的AX/CF，不据此断言某个版本DOS一定短读成功。F505 seek失败还跳过F512 POP DS，原失败栈不按成功返回理解。 |

有界伪代码：

```text
loadPortrait(AL, destination):
  if AL equals any of four labels: use that cached buffer
  else:
    i = nextCache; labels[i] = AL; nextCache = (i+1)&3
    request KAOGRF.DAT offset=u8(AL)*2048, length=2048 into cache[i]
    # actual success/failure/short-read behavior and pixel state not certified here
  project cache buffer through FA37
```

**条件反例，不是原运行记录：** 若07D2按正常miss返回依次输入0/1/2/3，四标签成为0/1/2/3；下一次AL=FF不能命中。这撤销“缓存初值FF所以任何FF永不读文件”的推断。FF miss请求offset=522240、length=2048，已签KAOGRF文件没有该记录。不能因此造blank PNG、套别人头像、推断缓存像素为0或把FF正式解释为无图。

## 随后caller窗口：只在明确语境跳过FF

[caller补充原窗口](../.dragon-analysis/editor-phase/trial-portrait-reader-session-r1/caller-window-r1.log)同KI完整SHA，仍只解码不执行；可复核字节：

- `8EA0`函数先取势力`+1`君主编号并从G01在8EB8画头像；随后取势力`+2`军师编号，8ED8取其G01，**8EDC `3CFF` /8EDE `7406`**直接跳过8EE3→07D2至8EE6。这是此选将/军师显示caller的明确FF检查，不是07D2全局哨兵；名字步骤仍继续，不能将它扩大为所有头像调用不读/空图。
- `8FC9`自定入口在8FF8比较DS:5221（G127+1）与FF，8FFD非FF跳过，FF则**8FFF写91h**，900A→915B后9162调用07D2。91h是本入口原写入，不是本轮补图或一般fallback；未把这段DOS加载/完整交互回调当已仿真，亦未改Web custom初始化。
- 固定CS首64KiB字节扫描的E8近调075B候选为3CB4/3CD0/3CFD/882D/887C/8899/C3B0；07D2候选为079D/5ED0/6E2C/80AD/8EB8/8EE3/9162。**只是字面E8候选**，未证每个指令边界/完整调用图，更不排除间接入口。该小库存用于下一步逐caller审查，不能把余项叫死路径或闭包。

局部caller确实检查FF与通用缓存函数无FF专用早退同时成立，没有冲突。完整G127可达结论仍为未知。

## E-05-PORTRAIT-CALLERS-1：其余直接候选的有界前缀

随后新增`tools/audit_editor_portrait_callers.py`只固定同KI（不再读KAO或任意数据文件）。[最终r3](../.dragon-analysis/editor-phase/trial-portrait-callers-r3/receipt.json)/[r4 -O](../.dragon-analysis/editor-phase/trial-portrait-callers-r4/receipt.json)10窗口与receipt全byte同，[原窗口](../.dragon-analysis/editor-phase/trial-portrait-callers-r3/windows.txt)及[四优化模式拒收/复现](../.dragon-analysis/editor-phase/trial-portrait-callers-session-r1/repro-receipt-r2.json)。原较早r1/r2少两个wrapper的包保留，不能替最终源码。新增12个075B/07D2站点均在这些有界解码前缀边界；079D/C3B0另由前节原reader证书覆盖。这仍是14个E8字面候选及有界正命题，不排除间接调用/别名、不能作全调用图认证。

| 站点 | 原局部操作（正常前缀/返回前提） | 未闭合域 |
| --- | --- | --- |
| 3CB4 / 3CD0 | 两入口3C99/3CC0直接`AL=[SI+1]`，前者另按G1E归一个性池；无局部FF跳过 | 上游SI指向哪条G/角色、完整调用及消息返回 |
| 3CFD | 3CDC取CFD势力`+2`，三次SHR索引G，读取G01，军师对话 | CFD/军师初始化及上游调用场景完整生命周期 |
| 5ED0 | 5E60/5E80受CS98A6 **mask02h**门，5E80读D52和CFD；5EB7取势力`+1`君主G01 | 固定槽/指针实际合法域与显示注册前史 |
| 6E2C | 6DFD以传入军团地址`(SI-2240h)>>1`派生G01，**不是军团+2主将回退** | 哪些军团槽会被此UI选中、临时127完整去向 |
| 80AD | **旧“势力+2军师”标签撤销**：后继domain原窗证实这里是军团`+2`主将索引的G01，非6DFD同槽映射、亦非3CDC军师；没有8EDC的局部FF检查 | 选中军团、主将值／外部helper返回域仍须核；不同caller不能套同一个FF门 |
| 882D | 8810入AX存后8823恢复；01B4在01B5存AX、01D2恢复，正常平衡far返回下AL仍为传入头像byte | 所有上游传参、far/设备完整返回/栈与副作用 |
| 887C | 8853常量`AL=93h`，经存AX/8870恢复；CX=FFFF跳过075B | 不是所有NPC/所有入口都是93h；完整89A4显示仍未仿真 |
| 8899 | 8883经过9796；该wrapper在9797存AX/97C0恢复，正常平衡FAC2返回下AL仍为传入byte | 完整FAC2/像素/所有传参，不按设备停止视为正常 |

256个byte移位索引得到`index*20h`、128个规范军团槽地址得到同号G偏移，只验证原表达式；index=255数学可算不代表G255是合法人物，不能用零填越界或把地址别名当独立人物。无新规则、过滤来源、头像代替品或runtime绑定。

首轮负控harness只传极小OS env，Python用户site中的既有capstone未解析而提前`ModuleNotFoundError`，未观测到guard，失败保在[记录](../.dragon-analysis/editor-phase/trial-portrait-callers-session-r1/repro-env-failure-r1.json)。随后仅明确正常OS路径/home变量复跑确认现有capstone5.0.7及四个ValueError拒收；没有安装依赖/改全局env/传provider密钥。该修复是测试环境，不猜产品原因或隐藏失败。

[本批静态](../.dragon-analysis/editor-phase/trial-portrait-callers-session-r1/static-receipt.json)独立核原144源/82资源不变＋新Python（145语法），不是再跑或拼旧64门；主动LSP不确认/MD unavailable与旧warnings须保。没有CPU/DOS/像素/browser执行，不把当前Web不调用、原字段inactive或临时战斗分派局部门当所有G127无图证明。

## E-05-PORTRAIT-DOMAINS-1：军团显示语境更正与候选表边界

本轮从[固定季节UI封存](../.dragon-analysis/editor-phase/backend-fallback-ui-session-r1/static-receipt-r1.json)的445声明源继续，原游戏／资源／后台／UI均不改。唯一原始输入仍是上述固定KI；不读KAO、SAVE或任意数据指定文件，不执行CPU／DOS／设备。新`tools/audit_editor_portrait_domains.py`保存10个完整解码窗、40处签名／解码边界、真实near16目标；[优化r2](../.dragon-analysis/editor-phase/portrait-domains-session-r1/r2/receipt.json)与[正常r3](../.dragon-analysis/editor-phase/portrait-domains-session-r1/r3/receipt.json)的报告和[窗口](../.dragon-analysis/editor-phase/portrait-domains-session-r1/r3/windows.txt)逐byte相同，四优化CLI错误／已存在目录拒绝另封存。512组仅地址算式对照，**不是指令执行或真实可达轨迹**。

### 局部实锤：此前同一+2被误贴语境

- `1EED/1EF1→1EF6`与`62E0/62E2→62E9`在调用7F90前都把军团指针减2240；`7F96`载D52，`7F9B`加2240，`7F9F`调用807B。807B先`DI=SI`，`8099`读取该记录`+2`为主将编号，三SHR得`编号*20h`，`80A6`读G01，`80AD→07D2`。因此旧“传入势力+2军师”注释错误，已修正旧审计工具说明及journal；旧原始窗口／签名仍有效，旧receipt的角色标签明确作废，不改或追认其byte。
- `6C5E`调用7663，在正常返回且CF清的路径进入6C92；`6CB5..6CBD`从BX所指G记录计算同号军团SI。`6CD2→6DFD`用`(SI-2240)>>1`回到同槽G，**与807B读取军团+2不同**。`6D35/6D39→6D3D/8810`确认编成后的消息同样取同槽个性／头像。BX确为正确候选、helper／设备正常返回等完整前提仍未模拟。
- `3CDC/3CE1/3CE6`仍是CFD势力`+2`军师；`87FF/8804`却是CFD势力`+1`君主。这里不能只看位移+2或G表索引就合并角色／调用规则。

### 局部实锤：不同候选表不是同一槽边界

- 716D把`AX=71A8`、71D3把`AX=7217`送820E；两候选builder的SI从2240开始、每次加40，达到41C0就停止，故实际列举 **军团槽0..125（126项）**，不是127或128项。71A8要求status≥80h及所属=CFF；7217要求status≥80h、+10/+12匹配两自修改坐标字。7217读取CFF不等于按所属过滤，窗内没有该比较。这只证明两builder，不推广到全军团扫描、全部选单或证明820E只返回这些指针。
- 7663把`AX=76A0`送820E；该builder从4240到5240之前、步20，遍历 **G0..127（128项）**。条件为attr≥80h、G1C=CFF、G17=0、G指针不等87FF所取**君主**；不是军师排除。受控谓词算式证明：若人为给G127满足这些条件且不是君主，则它会进入该builder候选；当前源attr0不入，但不能以固定“只扫127”或某次源初值证明它永远不入。此例只是条件反例，不是原运行记录／完整G127初始化写者结论。

首轮审计在任何输出目录创建前失败：1E49..1F08窗口截在1F07的CALL中途。受控解码探针明确190/191消费，显示1F07 CALL20D6及1F0D RET；只延完整窗口至1F0E，保持完整解码期待、所有签名和原程序不变，失败源码／meta／日志及定位记录保留。随后r2/r3通过，不以改期待或延timeout遮掩。445旧源仅旧caller说明字符串定点更正；其余444含375玩家原字节全保，新工具使声明446。适用诊断、语法、精确逆差和链接另签；未做无关游戏／浏览器／后台回归，确定性字节定位不需Jev裁决。

**仍未知**：3C99/3CC0/3CDC全部上游SI域、完整820E选择／回调返回、外部mouse/font/device的SI保存、G127所有初始化／间接写者与跨场景缓存像素。因此20个255引用不补图／不删／不标dead，未授Q69、RuntimeManifest、Trial或发布资格。下一证据边界是820E候选表生产／选中回传及这些入口的G127前史，而非再次重扫已确认的07D2缓存叶。

## E-05-PORTRAIT-SELECTION-1：820E候选池、排序交换及条件返回

后继[正常r1](../.dragon-analysis/editor-phase/portrait-selection-session-r1/r1/receipt.json)与[优化r2](../.dragon-analysis/editor-phase/portrait-selection-session-r1/r2/receipt.json)／[实际窗](../.dragon-analysis/editor-phase/portrait-selection-session-r1/r1/windows.txt)由新`tools/audit_editor_portrait_selection.py`核同固定KI，7完整解码窗／37签名；两轮报告／窗口全byte同，四优化CLI拒收另签。保护前446全部源含375玩家；仅新增原证工具，原产品／UI／资源不动，447声明。以下是原指令正命题及**有条件的地址／指针代数**，未执行CPU／DOS／mouse／显示／实际点击，不授Q69。

- **局部实锤：候选表在SS而非scenario DS。** `820E/820F`保存BP并预留200h字节，`8213`BP=SP；`823D..8249`ES=SS、DI=BP，用REP STOSW写256个FFFF。`8215/8219`记录builder／renderer，`824E`实际调用builder，`8253`把AH候选数存CS81BD。前批注册71A8／7217／76A0与820E的CALL逐一复核；这些builder的`[BP+DI]`在默认SS段，不能把它当DS源表写回。
- **局部实锤：排序是指针交换，不直接生成人物。** `857F`存排序key，key0在85A9再调用builder；否则从self-modified header描述读SI／AX和81BD计数，85B2按AH修改8A/8B、3A/3B操作字，按AL改跳转字节。`85E3/85EC`读SS候选指针，`85F5`交换当前指针与DX，`85FF`写回本轮最值指针；不把排序字段当人物编号重造身份。18组控制流代数（never／always／alternating比较选择，count=0/1/2/126/127/128）仅核指针多重集／尾区与表容量，不实际读取DS排序字段，不称原排序值或顺序测试。
- **零计数不能被描述成排序早退。** `85DA DEC CH`后才检查零：CH=1立即退，CH=0变FF，按字节循环相当于排序256个预留word（32640比较），不是无限循环或必然越界栈。这是算式边界，零表原为FFFF；会读`DS:[FFFF+SI]`的具体值／是否合法仍未知，不猜清零、补字段或画面。零计数时后述unsigned索引门没有可接受index。
- **局部实锤：选中值由表取回，但门与最终读取之间有调用。** `8463..847B`计算行／scroll，比较DL<81BD，否则RET留在轮询；有效行走到84A6 SI=DX，84A8调用21E7，正常确认后84B7 POP AX丢弃handler的返回地址，84B8 AX=SI／84BA CLC返回820E。`826D..8275`只用AL、明确清BH、加`2*AL`到BP，从SS:[BP]读BX。1536个count/index对照只是uint8比较／偏移（最大254）的数学复核，不是选中运行迹。
- **局部实锤：退出flags／BP有显式保留。** 8412取消在8457 STC；8279先PUSHF再828F cleanup，828F保存／恢复BX，8286 POPF后LAHF、调整SP、SAHF、恢复旧BP。因此在正常平衡helper返回前提下，BX和CF不会仅因cleanup／ADD SP被错解释；还原BP与任意“恢复所有输入寄存器”是不同命题。
- `8450`的CALL CS:[8459+BX]实际引用 **五word DATA** `[8458,8463,84DD,851A,8546]`，不是五段连续指令。早期探索性线性输出把这10B当指令（含无意义x87解码），只作已废弃探索文本，正式窗明确跳过DATA并从实际handler8463解码，目标均在边界。没有故障producer／产品重试，也没放宽完整解码。

**完整条件仍缺，不能称820E全入口闭合。** `21E7`本地只显式存AX／BX，调用far1000:0后没有本地SI／BP保留；其正常分支CLC／STC并不证明设备handler保存这些寄存器。索引DL的比较早于21E7及后续far1000调用，最终读取没有再比较AL。所有graphics／registered renderer的SS/BP/SI／候选存储保留、E453输入命中和sort描述合法域、自修改后的代码完整路径尚未核。前述成员保真需要这些前提；不能拿临时品牌或数学排列提升为实际权限／可达证明。G127完整初始化／写者、其它人物消息、FF缓存／像素与255缺资产继续未知。下一步优先实际影响这些返回的helper／输入域或独立已授权后台工作，不再重复07D2叶及本地builder扫描。

## 未知与下一边界

20章G127的G01=FF/attr0只是源记录事实。尚未闭合所有075B/07D2入口参数域、间接缓存写者、缓存/像素初始化和跨场景生命周期，亦未闭合临时城防与自定军师语境的完整消息可达链；普通临时无真实守军速算的已证战斗分派，不足以证明全部G127头像路径不存在。须继续审这些入口，或按批准的产品合同明确缺依赖阻断范围，不把本页局部实锤升格为运行闭包。

此轮没有CPU执行（当前Python无unicorn；不安装/修改环境），也无真实DOS短读、FA37像素/设备仿真、完整规则/浏览器回归。无生产/资源/草稿/live/save改动，未提交、推送或部署。前一reader批次新增Python及当时文档的语法、LSP与独立保全签在[当批静态记录](../.dragon-analysis/editor-phase/trial-portrait-reader-session-r1/static-receipt-r2.json)：当时原143源/82资源SHA不变，144源码语法（134Node/6PythonAST/4HTML）、新证据/链接/HEAD/diff检查，不拼旧64门。新Python0诊断但push-only inconclusive，6MD unavailable；session-all保留7个既有warning，缓存空/不确认不能写全部clean；本页后续caller更新由上节145静态另签，旧文档SHA不冒当前。
