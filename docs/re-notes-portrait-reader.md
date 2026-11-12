# E-05-PORTRAIT-READER-1：075B / 四缓存 / KAOGRF 读取边界

本文各原证批只读核查，**未据此实现FF无图规则、补图、缺依赖策略或Q69运行绑定**。详细原证维护源在本页；[库存](editor-trial-asset-inventory.md)只引用摘要。既有64门、离线398库或单次App成功不构成原版可达性证明。

## 现行Web准入与原证边界

**Web 产品决定（非原版机制；用户在 journal §48 的兼容风险说明后明确批准，实施收据见 [§49](checkpoint-journal.md#49-共享头像文件及资产id数字重编号)）**：新增画像的文件名与资产 ID 一起续编，`p0001..p0471 → 150..620`（新编号＝旧数字部分＋149）。原生 `0..149` 不变；621 张均为原 PNG 字节、128×128，无增图、重采样或上传。`255` 是普通共享资源 ID，不能再拒收或从依赖清单省略。该决定替代下节旧发布门及 Trial 批次8c的资源特判，**不说明 DOS FF 是无图、有效人物或任何原版规则**。

- `web/kao/manifest.js` 按数字 `0..620` 升序，ID、数字文件名、SHA 和长度一对一；`tools/build_kao_manifest.mjs --check` 只比较，`verify_kao_library.mjs` 双向核磁盘、连续编号与固定重编号摘要。画像字节未变，引用身份（ID＋SHA／URL）改变，不能把它当纯显示排序。
- `server/portraits.js::collectPortraitIds` 仍同时收集原 `portrait` 与可选 `portraitKey`，包括255；`GamePortraits.forPublish` 查真实清单、按ID去重并保留255。错误类型、负值、负零和不存在的 ID 仍拒绝；不存在的621不是新图，也没有缺图兜底。`PublishedPacks.#freezePortraits` 沿共同入口冻结精确SHA，prepare不是公开提交证明。
- `generaldefinitions.js::syncChapterSlot` 显式写 `portraitKey`。共享 ID 与原生byte分开：0..255可进入既有byte；大于255依靠已有覆盖绑定，已有槽保留原byte，新槽沿既有空槽0，不截断／取模。`buildPortraitOverrides`／`bindPortraitOverrides`→`portraitURL` 消费共享覆盖，JSON往返保该键；不改变其它字段的FF、字宽或规则。
- `server/trials.js` 保留引擎的画像缺口报告改按共享清单，不再对slot127/255豁免；据点图仍查固定库。**编辑器 `/api/trial/*` 仍退役410**，不因资源调整重开。历史固定源与staged manifest的20条G127/255引用、398库存身份及原证全部保留；那些历史清单不能代替当前共享目录，也不能据新255图片关闭原始可达性未知。
- 本地测试覆盖真实清单0／150／255／256／620的父表→空白章出场→依赖→覆盖→URL与JSON往返，以及实际壳／真实PNG的排序、分页、255／620选择及保存重读（API为隔离内存夹具）。真实持久化 copy／publish／formal、旧冻结包及生产桶**未检查、未迁移**；不重算旧pin、静默改旧引用或承诺旧p路径可用。实际迁移／部署须另获授权。

历史文档复核收据 `.dragon-analysis/editor-completion/portrait-admission-review-test.log` 只证明当时的窄判据，不是本次成绩；原始FF与显示caller的未闭合项仍见下方原证。

## 后继发布画像255依赖拒收

> **已被上节 Web 资源决定替代的历史工程门**：本节所有“现／保留／拒收／省略255”均指当时实现与收据，不再是现行规则。原日志与原始FF证据保留，不将旧负控成绩冒充新资源测试。

工程链核对：`EditorRoot.#publishPin` 先执行 `validateGameSource`／全量 `compileTrialSource`，再 `PublishedPacks.prepare`→`#freezePortraits`→`collectPortraitIds`→`GamePortraits.forPublish`。实体／地图编译不检查画像文件存在；此前普通槽的255可以通过编译，在最后无槽位helper中被静默省略。现只在拥有原记录上下文的共同收集边界拒绝 `portrait===255 && idx!==127`，并拒绝显式 `portraitKey==='255'`（该共享ID不存在）；沿既有坏依赖错误 `PLAY_PORTRAIT_CORRUPT`，不悄悄丢依赖。普通槽原byte255即使另有合法override也拒，不能用覆盖掩盖原依赖。

保留现有idx127／原byte255的收集与后续省略，以及合法画像覆盖，不新增默认值、不修改草稿保存门、历史请求、源文件或共享库。该保留不是新增发布豁免、FF空图或全资源闭包证书；缺idx及字符串idx127不得借用此形态。Trial启动窄门没有改动，共同收集器的正常127路径保持。

复用现有入口，前缀 `.dragon-analysis/editor-completion/portrait-publish-gate-`：

- `before.log` 新普通槽255负控复现Missing expected exception；修后 `contract.log` runtime contract **104项通过**，增加六个拒收和一组127＋合法覆盖／输入不变正控，无新辅助脚本。
- `vps.log` **37项通过**：自有临时SQLite／FileBucket、真实固定源安装及全量编译，首章普通255、显式覆盖255、末章普通255三例都仍通过结构编译，但实际PublishedPacks准备在画像边界拒绝，三张发布包表保持零行；正常20章冻结、pin、读包／资产、重发及陈旧／损坏拒绝旧用例继续通过。坏例是在prepare端口注入的内存候选，不是经HTTP保存／发布协调器成功构造的坏草稿；principal为端口夹具，不冒真实登录、完整发布事务或生产放行。
- `trial-report.log` 仅既有“asset report reuses the existing Trial gate”一项通过，不称整个文件或新实际Trial issue。未运行需预置独立fixture的旧sentinel HTTPS长入口。
- 三代码语法／diff通过；主动LSP300秒一项返回clean、两项push-only未确认，返回另提示两处已有disposition／规则过滤，不将其当全文件无问题。最终文档检查、指纹、缓存诊断与未跑范围见 `portrait-publish-gate-final-hashes.json`。

只有服务端共同画像依赖收集器、既有测试及文档变化，无web/src／Vue／DDL或资产变化，不重建两束，不重复无影响浏览器／规则／Trial／发布长链。20条原始未闭合引用及实际显示消费者审计仍保留；A20／A32及完整编辑器目标不因此完成。

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
| F4DF..F527 | DOS `3D00`打开、`4200`按CX:AX绝对seek，`3F`以DS:SI/DI请求字节；F510返回后没有AX与DI的长度比较。F513的LAHF随后被F514 `MOV AH,3E`覆盖，F51B SAHF从关闭返回AH的bit0重建CF；F521/F526才保留该重建标志。关闭后AX被写FFFF，原读数不作为外层short-read门。详细维护于[共享读取器勘误](editor-neutral-initialization-evidence.md)。此处没实测DOS EOF的AX/CF或关闭返回AH，不据此断言某个版本DOS一定短读成功。F505 seek失败还跳过F512 POP DS，原失败栈不按成功返回理解。 |

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

## 共享F4DF读取器CF解释勘误

此前画像审计工具及本页旧表曾写“CF经LAHF/SAHF保留”，未将[章节读取原证](editor-neutral-initialization-evidence.md)的AH覆盖勘误回流。该旧解释现明确作废；早期reader r3/r4等收据与窗口保留，不修改历史文件，也不再用其中旧CF说明作机制证据。没有新增或改变读取器原始指令结论，详细F4DF解释以章节读取维护源为准。

`audit_editor_portrait_reader.py` 同步更正报告说明，并将F512签名延至F527，明确覆盖关闭返回、第二组LAHF/SAHF及栈清理。新[正常收据](../.dragon-analysis/editor-phase/portrait-reader-flags-r1/receipt.json)／[优化收据](../.dragon-analysis/editor-phase/portrait-reader-flags-r2/receipt.json)与七个原窗口逐byte相同；[复核记录](../.dragon-analysis/editor-completion/portrait-reader-flags-repro.json)核两固定输入SHA、与重新执行章节审计的两个共享窗口SHA相等、六个flags指令起点及五CLI拒收／旧输出不变。固定KAO仍150个完整2048B记录、无尾；FF miss偏移522240无对应完整记录的条件结论不变。

实际DOS关闭返回AH、短读及像素缓冲前史仍未知；不能把重建CF当成读取CF或关闭操作自身的CF，也不能据此补空白画像、删255依赖或放开Trial／发布。只更正审计与证据说明，没有产品、资源或程序束改动。Python AST语法、正常／优化运行及diff通过；主动LSP两文档warning视图clean、Python push-only未确认，mode=all缓存85文件仍30项既有warning，未屏蔽。未跑无关游戏／浏览器或重建束。初始定位检索误含不存在的`re-notes-portrait-custom.md`，已改查本维护源；该检索错误不计验证通过。

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

## E-05-PORTRAIT-MOUSE-1：MZ第二段与选择返回的SI保留

本轮新增 `tools/audit_editor_portrait_mouse.py`，固定同一KI文件和完整SHA，**没有运行DOS、读取SAVE或安装模拟器**。[正常r1](../.dragon-analysis/editor-completion/portrait-mouse-r1/receipt.json)和[优化r2](../.dragon-analysis/editor-completion/portrait-mouse-r2/receipt.json)的receipt及[六原窗口](../.dragon-analysis/editor-completion/portrait-mouse-r1/windows.txt)逐byte一致；[复现记录](../.dragon-analysis/editor-completion/portrait-mouse-repro.json)保留五个优化模式CLI拒收和既有输出不变校验。这里补的是原指令／MZ重定位链，不是输入设备运行态证明。

**局部实锤：**

- MZ头大小0200、初始CS=0。`21EF/21FD/2209/84B2` 的 `9A 0000 0010` 段字分别在MZ重定位表；加载基址L下目标为 `(L+1000):0000`，对应文件 `10200`。因此它不是KI之外的未知代码起点；原先仅截首64KiB的审查遗漏了可直接核对的第二段。新窗用加载模块偏移 `10000+offset` 标注，不能把它当主CS的16位IP。
- 第二段 `0000 CLI;0001 PUSH SI;0002 MOV SI,AX;0004 SHL SI,1;0006 CALL CS:[SI+000E];000B POP SI;000C STI;000D RETF`。在helper正常平衡返回、保存的栈未被破坏前提下，**入口SI有显式恢复**。`000E..002E` 是16个word分发表，不按线性指令解释。
- `21E7`使用AX=5、AX=3，表项均为第二段`00BD INT33;00BF RET`；`84B2`用AX=1，表项`0070`可调用INT33 AX=3，并保存／恢复BX/CX/DX。外层仍执行上述SI恢复。因此前批“21E7自身没有SI保存”保持为局部事实，但不能继续据此称整个1000:0缺少SI保存；**SI这一个条件已缩小**。
- 第二段`0059..0066`把本段`0101`注册为INT33 callback。`0101`保存flags，条件分支`0119 SUB SP,8;011C MOV BP,SP`，没有本地入口BP保存；退出调整SP并POPF/RETF。这不能证明原驱动破坏BP：驱动是否在调用callback外侧保存／恢复寄存器仍未知。AX3/5的00BD同样无本地BP保留，所以不以标准鼠标API惯例替代实际驱动证据。

**仍未知／不放行：** 实际INT33驱动、异步callback ABI、SS/BP及候选表内容保留、其它显示renderer与G127所有写者／肖像参数域。即使SI恢复成立，也不足以把820E全流程、G127不可达或FF无图判为实锤；20个255缺资源和所有Trial／发布门保持原状。没有补图、删依赖或改运行规则。此前selection工具的局部窗口／原receipt不改写；本节明确补充它尚未审到的第二段边界。

## E-05-PORTRAIT-CUSTOM-1：自定入口、重置与画像切换写者

新增 `tools/audit_editor_portrait_custom.py` 只读取同一已签KI，不读SAVE、鼠标驱动或运行DOS。[正常r1](../.dragon-analysis/editor-completion/portrait-custom-r1/receipt.json)与[优化r2](../.dragon-analysis/editor-completion/portrait-custom-r2/receipt.json)的四窗口及receipt逐byte一致；[原窗口](../.dragon-analysis/editor-completion/portrait-custom-r1/windows.txt)、[五CLI拒收／既有证据保全](../.dragon-analysis/editor-completion/portrait-custom-repro.json)可复核。这里缩小的是G127写者范围，不是所有调用者或资源准入。

**局部实锤（进入相关handler且DS为场景段、外部helper正常返回的前提）**：

- `8FF3`显式载DS=CS:D52；`8FF8..9004`仅当`[5221]==FF`才写91h。随后显示入口915B读取该byte，9162的near16目标为07D2。不能把91h扩为所有缺图的默认值。
- `8F7C..8F96`重置helper先把`[SI+3F]`还原到`[SI+2]`，**8F82明确写`[5221]=FF`**，并填六个名字word。自定窗口取消分支9041调用此helper；确认分支9046恢复入口BX并写`[BX+2]=7F`。SI／BX的全部上游对象域及外部调用保留仍须另审，不能单凭+2断言整个任官生命周期闭合。FF不只是文件初值，也有这个明确的局部写入点。
- `912D..9143`向前切换：AL逐byte减1，若结果≥93h则置92h；`9144..915A`向后切换：逐byte加1，若结果≥93h则置0。两者调用92F5，CF置位则继续，清位才分别在913D／9154写回`[5221]`并调用915B显示。两handler均将候选限制为**0..146**，不是共享Web库621项域。
- `92F5..9309`用CX=007E、BX=4240，逐记录只比较`[BX+1]`，每步加20h。因此扫描**G0..125共126项**，不含G126／G127，且没有attr活动过滤。匹配返回STC，否则126项后CLC。不能把这个特定画像冲突检查当普通武将容量或所有UI候选范围。
- `8F97..8FA7`为八word分发表DATA，末两项912D／9144；工具不把它按指令解释。16位near回绕另核六站点，包括9162→07D2。探索时92F5后9309开始的字节只作数据／未知区，未纳入正式解码窗。

**推导，不是CPU轨迹**：候选环147值而比较表至多126个不同值；在上述固定局部循环及有效内存前提下，至多127次候选检查可找到空缺。工具1536组算式对照（所有256初值×两方向×三组占用集合，最长127）核边界，不冒所有占用组合的穷举或实际点击观测。没有调用RNG、写Web规则或把画像选择域扩大为可玩认证。

**仍未知**：所有自定入口／重置caller及DS／SI／BX生命周期、其它G127间接写者、所有通用画像caller、缓存像素与设备返回。20个255缺依赖仍保留，不补图、不跳过G127、不放开Trial／发布；本轮未更改固定库或程序资源身份。

## E-05-PORTRAIT-CUSTOM-ENTRY-1：选择确认、重置及开局回接

同一审计工具新增两个窗口 `1AE0..1B2C`／`8E5A..8EA0`，保留前四窗口。固定KI的[正常r3收据](../.dragon-analysis/editor-completion/portrait-custom-r3/receipt.json)、[六原窗口](../.dragon-analysis/editor-completion/portrait-custom-r3/windows.txt)与[优化r4](../.dragon-analysis/editor-completion/portrait-custom-r4/receipt.json)逐byte相同；[五CLI拒收复现](../.dragon-analysis/editor-completion/portrait-custom-entry-repro.json)验证旧输出不变。新增入口／near16签名与前批算式案例分开，不把1536个画像环算式算作这些新入口的CPU测试。旧r1/r2四窗口证据仍保留，不冒充本版工具输出。

**局部实锤，仍以有效入口对象及外部helper正常平衡返回为条件：**

- `1AEA→8E5A`后，CF置位回到`1AE5→7B3C`选择步骤；CF清且AL=0才进入`1AF8`，非零AL在`1AF3→8FC9`后重新进入`1AEA`。因此自定编辑返回不是直接进入开局字段写入，还有一次选择确认。
- `8E5A`先保存DS／BX／SI，`8E5D`令DS=D52、`8E62`令SI=入口BX。显示之后轮询`21E7`；CF置位走`8E91→8F7C`重置，再置CF。`8E95..8E9F`保存AX／flags绕过收尾显示后恢复入口SI／BX／DS。这里证明显式保存／恢复，不宣称被调用显示和设备函数均不破坏SI或栈。
- `8E75→E453`后AL减20h；小于20h重试，大于20h以非零值返回。恰20h时，若`[SI+2]==7F`且`[5222]`首名字word为D0A1，则在`8E8C`强制AL=1，再CF清返回。它是这段输入／记录条件下重进自定编辑的门，不把D0A1扩大成全部姓名合法性校验，也不据此断言所有G127+FF路径不可达。
- `1AF8`重新载DS=D52；`1AFD`读`[BX+2]`到AH，只有AH=7F跳过`1B05 DEC byte [BX+18]`。随后清AL并三次右移，`1B12`清所选G记录attr；普通军师与G127两分支都经过该写入。`1B17`存BX到CFD，再将BX左移两次、BH存CFF。这与已有[开局军师原证](re-notes-entity-fields.md#g1f-advisor-initialization)交叉吻合，不新增规则、不把正常军师缓存扣减施加到G127。

**随后缩小7B3C候选域，仍非完整选择回传证明：** 工具再补 `7B3C..7B90`，形成[正常r5七窗口](../.dragon-analysis/editor-completion/portrait-custom-r5/windows.txt)／[收据](../.dragon-analysis/editor-completion/portrait-custom-r5/receipt.json)，与[优化r6](../.dragon-analysis/editor-completion/portrait-custom-r6/receipt.json)逐byte相同，[五拒收复现](../.dragon-analysis/editor-completion/portrait-custom-factions-repro.json)保旧输出。`1AE5→7B3C`中先存DS/ES/AX/CX/DX/SI/DI/BP，`7B50`载DS=D52、注册AX=7B6F的builder，`7B63→820E`；返回后只有POP与RET，BX未保存且作为选择输出保留，CF不被这段收尾改写。builder `7B72..7B8F`从SI=0、DI=0、AH=0开始，逐记录仅检查attr≥80h，合格就把SI写SS:[BP+DI]、AH加1、DI加2；SI步40h直到580h，故只检查**22个势力槽0..21**，不是全部24物理槽，也不按声明势力数截断。这个扫描及注册实锤不消除820E内renderer／排序／鼠标返回对栈与候选表保留的缺口；不能直接宣布最终BX一定是这些候选之一。

**仍未知：** 完整820E回传／renderer、E453输入域、所有外部helper对DS／SI／栈的保留及其它进入／写入路径；本次E8字面扫描只定位到`1AF3`与两个reset站点，不能作为不存在间接caller的证明。未执行DOS或读取SAVE；未改Web custom初始化、原NPC／G127、画像库、255准入或运行公式。20个255缺引用仍未解除。

## E-05-PORTRAIT-UPSTREAM-1：3C3D至8810的两个画像参数分支

同一 `audit_editor_portrait_callers.py` 补入完整 `3C3D..3C99` 窗口，并对全部签名增加解码指令边界检查。[正常收据](../.dragon-analysis/editor-phase/portrait-callers-upstream-r1/receipt.json)／[十一原窗口](../.dragon-analysis/editor-phase/portrait-callers-upstream-r1/windows.txt)与[优化收据](../.dragon-analysis/editor-phase/portrait-callers-upstream-r2/receipt.json)逐byte一致；[五CLI拒收与旧输出保全](../.dragon-analysis/editor-completion/portrait-upstream-repro.json)。仍只读取固定SHA的KI，不执行DOS、读取SAVE或改变资源准入。原256／128个地址算式检查沿用旧项，不冒充新增路径的CPU测试。

**局部实锤，限入口DS／SI有效且helper正常平衡返回：**

- `3C42`先置BL=93h，`3C44`比较SI与CS:CFD，相等则直接走`3C5C`。不相等时，`3C4B`取`DS:[SI+2A]`，清BL并三次SHR BX，`3C56`读取对应G01到BL。`3C6C`令AL=BL，`3C6E`实际near16调用8810。因此这个caller有“常量93h”及“入口记录+2A索引的G01”两条参数路径，**不能概括所有8810调用都使用固定NPC画像**。此窗口没有针对画像FF的检查。
- `3C5C..3C5F`保存AX/CX/DX/DI，调用后`3C71..3C74`恢复。恢复的AL=3走另一处理分支；否则AH=0或AL=2跳过第二次消息；其余分支在`3C84`明确置AL=93h，`3C86`再次调用8810。与已证8810保存／恢复传入AX的条件链相接，但不新增任何运行规则或画像替代品。
- 此处只以原偏移描述入口对象；尚未核实所有上游SI对象域、+2A合法值及间接写者，**不据此断言G127实际进入该路径或永不进入**。探索性E8／word候选扫描不纳入完整调用图证明，也不把无直接候选的3CC0判为死代码。

20个255缺引用、缓存／像素与设备返回仍未闭合；所有运行／Trial／发布准入保持不变。

## E-05-PORTRAIT-FACTION-RENDER-1：7B90登记renderer的局部读取

在已核7B3C登记 `BX=7B90` 的基础上，`audit_editor_portrait_custom.py` 新增完整 `7B90..7C6E` 窗口、11个指令边界签名及8个near16调用目标。原件仍是上述固定KI SHA，未读取SAVE或运行DOS。正常[r7窗口](../.dragon-analysis/editor-completion/portrait-custom-r7/windows.txt)／[收据](../.dragon-analysis/editor-completion/portrait-custom-r7/receipt.json)与优化[r8收据](../.dragon-analysis/editor-completion/portrait-custom-r8/receipt.json)逐byte一致；[五项CLI拒收与旧输出保全](../.dragon-analysis/editor-completion/portrait-custom-renderer-repro.json)。共8窗口，1536算式案例仍为旧画像循环算式，不冒充renderer执行测试。

- **局部指令实锤**：7B90保存AX/BX/DX/SI，先调用8607。7BA7在该调用返回后的AL上清AH、乘2到SI；AX=10，循环7BB0调用7BC0十次，每次SI+=2。当批未核准8607输入输出；后继[显示调用子链](re-notes-custom-data.md#势力-44-8607显示调用不重建默认军师)在正常返回条件下证实其AX保留，且明确不推定CX不变，不再将8607本地返回列作未查。
- 7BC0保存AX/BX/CX/DX/SI/DI/BP；7BC7先读默认SS的 `[BP+SI]`，FFFF走显式空文字分支（CS:7AEB→F6DC），其它值在7BE0载入DI。两支汇合7C66..7C6D逐一POP并RET；正常平衡helper返回且保存栈未被改写时，row返回恢复入口BP等寄存器。
- 窗内非空路径依次出现 `[DI+1]`、`[DI+2]` 经byte×20h＋4242h，以及 `[DI+3]` 经byte×20h＋0842h，调用0701；之后 `[SI+18]`／`[SI+23]` 调062F显示。**将所有这些读取解释为同一势力的君主／军师／首都及F18/F23，仍以DS、DI、SI在嵌套调用中正确保留为条件**；当批没有闭合0701／062F／8607及设备行为；8607及其直接调用后继见上述显示子链，0701后继见下，062F已有[能力显示专项](re-notes-entity-fields.md)的限定窗口核对，两者都不闭合设备返回。局部没有索引值域拒绝、计数重算或直接CALL07D2，不等于嵌套调用没有画像、写入或副作用。

本轮先核读的820E／8412候选池与选择返回窗口已在SELECTION-1覆盖，未作为新成果重复计数。新增范围只缩小登记renderer本地未知；所有helper／候选表内容保留、G127完整前史、FF缓存像素及20个255缺依赖仍未知。没有修改规则、资源、固定库身份或放开任何准入。

## E-05-PORTRAIT-TEXT-1

0701固定名字读取与字体包装返回：

`audit_editor_portrait_custom.py` 在同一固定KI原件上新增三个完整窗口 `0701..075B`、`F75E..F7A1`、`F878..F888`，12个签名／起始指令边界及7个near16调用目标。`F7A1..F7A4`为被读写数据，本批不连续误解码为指令。原来源仍为长度67099、上述KI SHA及MZ偏移0200；未读SAVE或运行DOS。

- **局部指令实锤**：0701保存AX/CX/DI/BP，0705／0709／070D将入口AX写入CS:071F／0736／074D的三个MOV立即数字段。0711保存DX到DI、BX到BP；分别读DS:[SI]、[SI+2]、[SI+4]，交换高低字节，再调用F878和F75E。后三站点near16回绕分别为0721／0738／074F→F75E，三个字的位置为入口DX、DX+10h、DX+20h。不是按Unicode长度处理，也不是遇零提前结束的字符串扫描。
- F878无嵌套调用，只改AX／flags：AH≥80h时AX不改、CF=0；AH<80h时AL=原AH、AH=0、CF=1；统一F887 RET。DS／SI／DI／BP未被本地指令改写。这里只记录转换指令，不把它独立当完整字符编码合同。
- F75E保存DS/ES/SI/DI/BP，分配20h栈字节并以SS设DS/ES；DX无符号大于0270h或BX大于0180h直接到F798恢复。正常绘制分支有F789／F790两个far调用（磁盘操作数均0000:0000；装配写者后继见FONT-BINDING-1，实际服务目标仍未追闭），随后F795→F7A4。F798统一释放20h、恢复所存寄存器并RET。**所有嵌套调用正常平衡返回且保存栈完整是保留成立的前提**，未证明字体载入缓冲区或中断一定满足此前提。
- 在上述前提下，0701从DI/BP还原DX/BX并POP其余保存值；F878不动SI／DS，F75E恢复SI／DS，因此三个固定名字读取及返回可保持调用者的这些寄存器。没有由此证明完整820E、8607、字体调用、F7A4绘制体／设备、候选栈或G127／FF画像可达链。也不据六字节名字读取给编辑器Unicode文本新增截断或长度上限。

两个正常 `python -X utf8 -B` 运行[r9窗口／收据](../.dragon-analysis/editor-completion/portrait-custom-r9/receipt.json)、[r10收据](../.dragon-analysis/editor-completion/portrait-custom-r10/receipt.json)逐byte一致；[复核记录](../.dragon-analysis/editor-completion/portrait-text-repro.json)含11窗口、5项CLI拒收／旧输出不变及AST语法通过。1536画像循环算式仍是旧范围，不冒充本次字体CPU执行。没有补图、删依赖、修改代码规则／固定库／程序束或放开任何运行、Trial、发布门。主动LSP在warning阈值两份文档clean、Python push-only未确认；session全量116文件仍19项既有warning、23项hint/info，未屏蔽或称全仓clean。语法及diff检查通过，不跑未改动的游戏／浏览器回归。

## E-05-PORTRAIT-FONT-BINDING-1

字体far调用操作数的局部装配边界（不是字体服务实现证明）：

- **原始指令实锤**：固定KI的MZ头为0200h字节、入口CS:IP=0:0；完整窗口0000..0082内003A→006B，006B路径007A→F720。此前helper正常返回是达到这些调用的前提，不以字面E8扫描证明没有其它caller。F720返回后为007D `MOV AL,0`、007F `CALL 09AF`，中间没有条件分支；09AF是否使用CF及完整启动失败处理未在本批闭合。
- F720..F75E保存ES/AX/BX/DX/BP。第一次 `INT 15h` 输入AX=5000h、BX=0000h、DX=0810h、BP=0；CF=1跳F758直接恢复返回，不写本窗的任一调用指针。CF=0则F734／F739把返回BX／ES分别写CS:F791／F793，即F790 far调用的offset／segment。
- 第二次中断输入AX=5000h、BX=0100h、DX=1010h、BP=0；CF=1仍直接到F758，**不撤销第一次已经写入的指针**。CF=0才在F74D／F752写CS:F78A／F78C（F789 far调用），F757显式CLC后恢复返回。MOV／POP／RET不改这里的CF；没有本地零指针或代码域校验。失败不意味着清零旧指针，也不保证之前未曾初始化。
- **当批未知**：实际INT15服务提供者、返回指针落点／代码、未显式保存寄存器的中断ABI、字体载入对32B缓冲及外层栈的影响、完整启动helper和后续失败处理。后继STR安装候选及返回帧区别见FONT-PROVIDER-1，仍不是实际运行环境证明。不得仅凭接口号或惯例认定某个DOS中文系统，也不把指针装配等同于字体／画像缓存生命周期闭合。

审计工具新增0000..0082与F720..F75E两完整窗口、MZ入口断言、11个边界签名及3个near16目标；正常 `-B` 的[r13收据](../.dragon-analysis/editor-completion/portrait-custom-r13/receipt.json)／[r14收据](../.dragon-analysis/editor-completion/portrait-custom-r14/receipt.json)共13窗口逐byte一致，[复核记录](../.dragon-analysis/editor-completion/font-binding-repro.json)验证5项CLI拒收／旧输出保持和AST语法。中间r11/r12仅12窗口，不冒作最终源码证明。旧1536画像算式未新增CPU覆盖；没有访问SAVE、执行原DOS、补图或改变任何程序束／固定库／Trial／发布准入。

## E-05-PORTRAIT-FONT-PROVIDER-1

新增只读原证：`STR.EXE` 916B／SHA256 `6d7d709c173ae530faa86f2474f2b312c76597fb15623e82a3c93072fa6379fb`、`YNVSHELL.COM` 979B／`629d5c71c96b2502cd9d256b2fabd74e7275b7014f0a0743cd0dd07a8204a6b8`、`PLAY.BAT` 25B／`fc48ce984d193ecc1c8579e73bcfb7b129cf2eb636e0fe682cae39347e622e7e`，以及原固定KI。`audit_editor_font_provider.py` 逐次读前后核SHA；只核静态指令，不执行这些程序。

- **启动候选链实锤**：PLAY调用YNVSHELL。COM以0100为地址基准，011C传AX=033B给01AC脚本解释器；每条8B，opcode4经表01F9调用0223，使用AX文件名、CX命令尾配置DOS `INT21 AX=4B00`。数据033B开始前三条依次为LOGO、STR、YNFONT。这里证明声明的调用次序，不证明当前机器实际安装成功或所有返回／后续脚本。发现YNFONT文件名本身不构成它提供INT15的证明。
- **STR安装路径实锤**：MZ入口0000:011E，重定位项为011F／0161的段word。安装代码先 `INT21 AX=3515`，检查旧vector段ES:0的DOSV标记；不匹配才保存原ES:BX到CS:4／6，以重定位后的DS和DX=002C执行 `AX=2515`，随后 `AX=3100` 留驻。匹配标记则走016A的还原vector／释放内存分支，不能将重复运行STR当成总是安装新handler。数据0000..002C不是指令。
- **处理入口实锤**：002C比较AH=50h；其它值0058 far-jump旧vector。匹配时先PUSHF／far-call旧vector，再STI；只有返回AL=0且BH≤1才将ES设为本CS，并选择BH=0→BX=00DF、BH=1→BX=005D。故这两个地址是满足上述前提时的字体函数候选，不是任意DOS环境固定的绝对地址。
- **CF与返回帧必须分开**：0054清AH、0056 CLC，拒绝分支也有STC，但0057是IRET，窗内没有改外层中断FLAGS槽。若嵌套旧handler没有越界改写外层帧，最终CF来自外层进入时FLAGS，不来自这些live CLC/STC。KI两次INT15前的XOR BP,BP均令CF=0；不能用STR内部STC证明KI会收到CF=1。此结论不假设旧handler或真实DOS中断ABI已闭合。
- **字体文件读取局部实锤**：005D函数以DS:0014的 `END_S10.DAT` 打开／计算偏移／seek，向ES:SI请求30B，再显式写 `[ES:SI+1E]=0` word；00DF以DS:0020的 `END_S11.DAT` 请求15B，再写 `[ES:SI+0F]=0` byte。两者保存并恢复DS/DX/BX/CX，末尾AX清零、RETF；本地不写SI/DI/BP/ES，但仍经过DOS INT21，不能以此替代中断寄存器保留证明。打开／seek／read之后没有本地CF或返回字节数拒绝；尾零不代表短读时整个缓冲已初始化。ASCII偏移路径00F1只MOV AL,CL，不清AH，不能脱离此前打开返回的AX直接宣称始终为字符号×15。

两个正常 `-B` 运行[font-provider-r2](../.dragon-analysis/editor-completion/font-provider-r2/receipt.json)／[r3](../.dragon-analysis/editor-completion/font-provider-r3/receipt.json)的7个完整窗口逐byte一致；[复核](../.dragon-analysis/editor-completion/font-provider-repro.json)含4个固定输入、5项CLI拒收／旧输出保持和AST语法。r1未包含PLAY的输入钉，不冒最终源码证明。字体文件正文、旧INT15服务／实际安装状态、DOS短读与寄存器ABI、完整启动以及画像缓存／G127链仍未知；本批未读字体正文或SAVE，不补图、不改规则／程序束／库身份或准入。主动LSP两份文档clean、Python push-only未确认；session全量117文件保留19项既有warning／23项hint/info，无屏蔽。语法与diff检查通过，未跑无关游戏或浏览器回归。

## E-05-PORTRAIT-FONT-RANGES-1

这里的STR及启动文件是 `E:/Dragon/Dragon` 随包候选，固定SHA证明本次读到的字节，不证明这些辅助文件的原厂年代／出处或真实运行时仍为当前INT15服务。不能由存在YNFONT／STR就跳过中断链、后续安装及实际DOS返回核验。

新增固定输入为STR代码中实际写明的两个文件：`END_S10.DAT` 40806B／SHA256 `19d565b225482cc255decd78cbbbbabf03df5a38d05e14dd7eb566ebdaae4643`，`END_S11.DAT` 10637B／`c0f68f59d4449fce077984a14e5c4b0396df51b50b1a8dd89bb8929ece9dd401`。本批只核全文SHA、长度及条件读取区间，不将文件名或头字节当成已解码的字体格式／有效字形证明。

工具按已钉STR窗口作**非CPU算式枚举**：

- 对006F处显式给定的全部65536个post-open CX，按CH的A4／C9／FA无符号分支、byte减法、word加法和末尾×30计算seek位置；完整30B区间3786个、仅剩6B的区间1个、已过文件末尾61749个。例A140→0、A440→12240、C940→174270、FAFF→2580；AA4A→40800只剩6B。它们是寄存器模式，不是65536个合法字符，更不是这些值均可到达的证明。
- 对00F1处给定的post-open AH和CL的65536种组合，MOV AL,CL后按word×15计算；完整15B区间709个、只剩2B的区间1个、已过末尾64826个。例AH=02／CL=C5→10635只剩2B。没有擅自把AH清零或假定所有DOS句柄小于256。
- 两文件长度分别余6B／2B，不能因此补齐整条字形、合成空白或裁剪作者输入。区间有足够字节也不保证open／seek／read成功、字符有意义或调用者寄存器保持；“pastEnd／partial”仅描述这次固定文件的静态可用区间，不是实际DOS短读观测。

最终[r4收据](../.dragon-analysis/editor-completion/font-provider-r4/receipt.json)／[r5收据](../.dragon-analysis/editor-completion/font-provider-r5/receipt.json)逐byte一致；[复核记录](../.dragon-analysis/editor-completion/font-ranges-repro.json)含6输入钉、131072条件算式、5CLI拒收／旧输出保持及AST语法。前节r2/r3未覆盖文件正文，不拿旧收据冒充新源码。仍未解释字形、执行DOS、访问SAVE或关闭画像缓存／G127／255资源缺口；没有任何游戏规则／资产／程序束或准入变更。

## 未知与下一边界

20章G127的G01=FF/attr0只是源记录事实。尚未闭合所有075B/07D2入口参数域、间接缓存写者、缓存/像素初始化和跨场景生命周期，亦未闭合临时城防与自定军师语境的完整消息可达链；普通临时无真实守军速算的已证战斗分派，不足以证明全部G127头像路径不存在。须继续审这些入口，或按批准的产品合同明确缺依赖阻断范围，不把本页局部实锤升格为运行闭包。

此轮没有CPU执行（当前Python无unicorn；不安装/修改环境），也无真实DOS短读、FA37像素/设备仿真、完整规则/浏览器回归。无生产/资源/草稿/live/save改动，未提交、推送或部署。前一reader批次新增Python及当时文档的语法、LSP与独立保全签在[当批静态记录](../.dragon-analysis/editor-phase/trial-portrait-reader-session-r1/static-receipt-r2.json)：当时原143源/82资源SHA不变，144源码语法（134Node/6PythonAST/4HTML）、新证据/链接/HEAD/diff检查，不拼旧64门。新Python0诊断但push-only inconclusive，6MD unavailable；session-all保留7个既有warning，缓存空/不确认不能写全部clean；本页后续caller更新由上节145静态另签，旧文档SHA不冒当前。
