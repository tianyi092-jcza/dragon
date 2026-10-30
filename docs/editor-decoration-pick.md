# E-03-DECORATION-PICK-1：装饰拾取显示索引

限定桌面工作台优化，先测量再实现；不是规则地图索引、完整语义库、扩容或整体性能验收。原线性`hitDecoration`保留，新增只读`createDecorationPicker`与studio的三个装饰拾取入口（单点检视、移动、删除；矩形框选不使用此索引），无composer/compiler/引擎/默认资产改变。

## 行为与失效边界

- 遍历现有数组顺序及`componentCells`的实际footprint/anchor，按二维坐标保留最后匹配的装饰**数组索引**。不以包围框填空洞，不按地理/外观/透明度/水类别筛选，原工作区显隐/锁门与unknown删除后补底保持。
- 私有Map只存坐标和索引，返回冻结pick接口，不暴露缓存或改写源。NaN跳过与原严格相等无法命中相同；字符串不与数字混同。极端数字仅纯JS等价测试，不是合法运行数据认证。
- 只有共同composer草稿重建成功后建立新快照；每次现有`changed()`/启动/保存重载的rebuild同时更换它，包含放置/移动/删除/拆分/平移/调序/定义及组操作。一次构建仍线性耗时及额外内存，不能宣称免费缓存。任意外部debug直接改draft而不重建不属该快照合同。
- 后续拾取不重扫九万实例；不推进RNG/规则、改变源/配方/mini、修改AI或存档，不修改旧线性helper的其它调用。实际源码复核发现CodeGraph只列selectCell，pointer handler还有move和del；本次三个入口都接，未用不完整调用表作全覆盖证据。

## 测量与验证

[I/O先登记](editor-local-validation.md#e-03-decoration-pick-1拾取性能先审io)。owned `decoration-pick-index-session-r1/probe-r1.json`记录当前92586装饰、98明确点（三轮89命中），原线性一轮约400ms；它是审计，不是性能通过门。

同源r2三轮98点逐项线性/索引等值，结果摘要相同：线性390–403ms、构建13–24ms、单次索引整轮0.04–0.18ms；另三轮9800次索引查询含assert约0.93–1.28ms。**仅Node本机计时，不推算浏览器FPS、用户机器或整体UX**，没有猜测阈值或性能通过断言。源及281声明JS/82Web资产按允许delta前后核，不输出资源正文。

最终白名单env `run-focused-r2.mjs`实际六项串行exit0：component pure/browser、viewport pure/browser、unified workspace、navigation browser。80入口/281声明库存不变，未全80跑。

- 纯门115检查/36原拒收，加5850 indexed/linear等值：多格非零anchor及空洞、最上遮挡、源独立、不隐式追踪原数组、重新构建后的调序/删除/平移/拆分及作者定义、更名/JSON、无命中/字符串/NaN等。全部源不变。
- 真实current地图240格矩形拖选集合与原线性helper计算结果同，map/dirty不变；**归因更正**：原fixture为逐格原子，此检查是回归覆盖，不证明框选使用索引；原日志`indexed240cell rectangle`措辞撤销，封存byte保留。矩形原来是全实例footprint扫描且只末尾一次draw，后继[矩形选择切片](editor-rectangle-selection.md)保全部遮挡/顺序并减少临时数组，不改成最上拾取；接续原两格捕获、图卡/分页、实际HTML5放置、组拆合、作者管理/引用、拆分/平移/调序/锁门、unknown删除补底、保存重开及20章fresh/JSON。viewport亦覆盖实际移动/删除/左键、菜单、留边与明确重载，统一工作台20章及导航六组按各自原合同重验。
- 所有browser为own loopback/temp/fresh Chromium；IDB hook拒0、外网/SAVE/用户profile禁，自己listener/browser关闭。导航预期503按其原合同，不作picker错误。纯/测量无nativeIDB或网络。每门当前日志/收据/图、四源内存逆delta/277旧源、82资产、文档与诊断由`static-receipt-r1.json`关联。
- 编辑期间首个多段替换最后一段不唯一，立即重读发现三个旧调用而不是两个；补三入口后才运行。纯测试初写漏一个对象括号，检查即修，未运行中间字节；没有把这些编辑问题称产品回归失败，也未调整正确机制/等待URL来迎合诊断。

r1六项通过后把纯fixture的显式原数组reverse改为赋值toReversed，保原快照及新的顺序/清空断言，消除新增mutation警告而不忽略规则；r2全部六项再次执行。主动10路径3clean/2findings仅九hint/3MD unavailable/2inconclusive，矛盾“6confirmed-clean”文字不采信；session223files七既有warning，无新blocking。既有selector、动态Scenario.cities及正确(await).prop不改成错误API/语义；固定等待URL沿既有误报裁决。Jev只3395B人工工程摘要/preview0redactions/fixed1.13/advisory，无资源/图片/正文/完整日志外发，不作机制/性能/权限门。

完整流程、语义工具栏/其它变换/性能验收与后台/初始化/容量仍按[差距索引](editor-requirements-matrix.md)开放。goal active，无commit/push/deploy。

## 后继互联网单格最上装饰拾取

互联网窗口新增第七工具“讀取最上完整裝飾”。左键按实际Canvas矩形换算已读窗口内单格，复用原精确修订 `decoration-selection` GET（width=height=1）；服务仍按共同完整footprint查交集，返回全部交叠实例的源绘制顺序，没有新增端点或像素／包围框猜测。`draft.txt` 验证既有DTO身份、矩形及已读清单严格顺序后，仅将最后一项纳入本次累计选取；保留原单格完整响应，不能把它改成伪造的单项响应。空集合清本次结果，不带入旧框选或素材勾选。

单格读取限当前装饰层、显示且解锁的已读窗口，不开放任意窗口外坐标；读回还检查原window对象、身份、修订、清单、当前层和锁。图集／可读性门继续由窗口界面承担，不从图像透明度或道路遮挡猜装饰层内部的最上实例。完整矩形框选的全实例／追加语义不变。

结果不直接改素材勾选、锚点、位移输入或草稿。作者仍通过既有“以窗口選取取代勾選”确认，将结果取代包含页外的全部勾选；取消保持旧集合。其后移动／调序／删除继续原独立确认、锁、CAS及journal门，不以拾取授予写入或运行准入。没有实现原位抓取拖动，仍使用明确位移锚点／目标工作流。

本批复用两个现有入口，证据前缀 `.dragon-analysis/editor-completion/decoration-pick-`：

- `controller.log` **103项通过**（原101＋2）：完整交叠响应a/c只选c、精确已读1不取输入999、确认取消／转移、空格清结果、无窗口／窗口外／非单格／锁定零GET、逆序DTO拒收、读回前锁定丢弃；无POST/journal，不改其它输入。既有框选／追加／迟到身份和保存守卫同时回归。
- `browser-r6.log` **197组通过**（原195＋2），新profile产物 `.dragon-analysis/editor-workbench/run-U7sGDc/`。七项右键菜单沿原行为；明确API夹具交叠under/overlap只取后者、未确认及取消不改勾选、确认后单项取代、另一格空结果不清素材勾选、锁定／隐藏装饰禁用且点击零选择请求，输入999保留。实际gateway／Vue和真实浏览器输入，不冒真实后端权限／保存、任意几何或性能证书。
- r1误用固定屏幕偏移，当前缩放下仍点到同格；改按实际DOM矩形，并明确断言两次查询坐标。r2/r3的Playwright `isDisabled()` 对option返回false，而r3已等待并确认原生 `.disabled===true`；改核实际option属性，未改产品门。r4隐藏整图触及只支持1111的scene夹具；改显式切到既有masked-window路径。r5新显式窗口GET超出旧九步夹具；补第十个精确382/255预期，不用泛化成功回包。失败日志均保留，r6才是完整通过。
- Vue build/check逐字节一致、shell65通过；MJS语法、TXT实际测试导入、diff及本地链接另核。四代码主动LSP300秒push-only未确认，TXT无服务，不称clean。文档及最终指纹见 `decoration-pick-final-hashes.json`。

仅互联网控制器／两Vue组件、既有测试及生成后台壳变化，无服务／web/src／DDL改动，不重建未变原生束，不重复无影响角色HTTP／规则／Trial／发布长链。完整地图工作区和全部编辑器目标仍未完成。

## 后继拾取至位移真实HTTPS链

复用 `verify_editor_template_browser.mjs r77 --translation-point-only`，不新增入口。自有Node／SQLite／FileBucket、41固定源登记、HTTPS、真实作者登录和全新Chromium；没有API成功回包夹具。原正向位移前的列表手工勾选改为画布单格拾取，独立确认取用后再明确选锚点，原拖动目标、保存、丢回应恢复和反向位移链保持。

`decoration-pick-http-r77.log` 首轮 **10组通过**，收据 `.dragon-analysis/editor-phase/template-browser-r77/receipt.json` 绑定40个当前源码SHA。已读2的窗口／spring图集／单格(0,0)三个GET全部用修订2，不取输入999；拾取 `import-atom-0`／tile-20／original 只展示结果，取用取消保持空勾选，确认后才勾选该完整实例，位移输入仍空。其后明确锚点，目标拖动Esc不填输入，合法松手只填1／0且不改源像素，独立保存才POST2→3。

真实提交后在浏览器丢弃保存响应，reload只查询原键并显式读3，不重复POST；反向仍按列表明确选择同一实例，用检查格取用−1／0，第二个不同键保存3→4。最终坐标回到原0／0，旧修订2／3、其它实例、章节／地图摘要／据点／素材定义保持。整个两次位移阶段只有2个保存POST；定位读取合计5个GET（正向3、反向2），没有自动保存。管理员读作者草稿404，IDB访问0，errors／outside为空。

这是当前自有真实服务的单实例拾取→确认取用→明确目标→保存恢复出口；反向没有重新拾取，不将它冒充重叠最上选择、多格空洞、整批操作、完整副本、Trial或发布证明。交叠、空格及显隐／锁定的当前浏览器API夹具覆盖仍见上节。

仅既有HTTPS工具和本页／完成审计变化；产品源码与两束均未变，不重建或重复无影响控制器／工作台／规则长链。语法、diff、链接、主动LSP／session及新收据与旧未变源码核验记录于 `decoration-pick-http-final-hashes.json`，完整A09及目标仍未完成。

## 后继真实重叠最上拾取

继续复用同一HTTPS入口 `r78 --translation-point-only`，保留正向画布拾取、2→3保存丢回应／原键恢复及反向3→4；不新增独立探针或修改产品。反向准备窗口包含原实例与目标两格，在修订3的(1,0)再实际左键拾取。预期集合由该次精确已读实例的源顺序和服务提供的完整offsets计算，不按图块颜色、锚点或当前勾选猜；缺几何则测试拒绝，不能当默认单格。

实际相交顺序是 `[import-atom-0, import-atom-1]`，后者为最上；画布结果只显示 `import-atom-1`，而此前明确勾选的下层 `import-atom-0` 保持。取用对话取消后仍只勾选下层、位移两轴仍空，随后通过它的明确锚点和目标执行原反向还原。这样验证最上选择不受旧勾选影响，也不会因查询或取消而误移上层实例。

`decoration-overlap-http-r78.log` 首轮 **11组通过**，收据 `.dragon-analysis/editor-phase/template-browser-r78/receipt.json` 绑定40个当前源码SHA，并记录 `overlapPick` 的坐标、完整命中顺序、top及retained ID。两次定位均为窗口／Atlas／单格选择各一个GET（共6个），每次绑定已读修订而非999；两次独立确认保存共2个POST／2个键，旧2／3与其它源投影保持。原丢回应恢复、真实管理员404、IDB0和errors／outside空也通过。服务、账号、存储与浏览器仍为前述自有隔离资源，无API成功夹具。

此轮覆盖真实两个原子实例的重叠，不外推多格空洞、未知几何、真实整批移动、原位抓取、完整副本、Trial或发布。仅既有测试和两份文档改变，产品及两束保持；不重复无影响控制器／UI构建／工作台／规则长链。语法、diff、链接、诊断与当前指纹见 `decoration-overlap-http-final-hashes.json`，A09及完整目标仍未完成。

## 后继单一选取占格轮廓

`MapWindowPanel.vue` 在拾取模式显示单一已读选取的蓝色占格轮廓，区别于紫色位移目的地。沿已读实例锚点和服务提供的offsets逐格投影，仅画当前窗口内部分，并同时列完整格数与窗口内格数；不按cellCount、包围框或图像猜形状。旧摘要没有offsets时明确“占用形狀未知，不畫輪廓”，不补单格或虚构覆盖。作者文本沿Vue文本插值，不插HTML。

轮廓只在已读单项结果、装饰显示／解锁、窗口／Atlas就绪且无其它拖曳时出现；空结果、换模式、读新修订或资格失效不留旧轮廓。固定高度状态区避免查询结果改变画布布局，SVG与缩放后的画布同范围、pointer-events:none；不写原Canvas像素、来源、素材勾选、位移输入或journal。仍须原独立取用／保存，轮廓不模拟未知下层、遮挡或可运行性，也不是原位抓取拖动。

复用 `verify_editor_workbench_browser.mjs`，`pick-outline-browser-r2.log` **198组通过**，新profile产物 `.dragon-analysis/editor-workbench/run-BsHUgF/`；首轮 `pick-outline-browser.log` 同198组亦通过（`run-UMpeAp`），r2补底图像素和模式切换断言。明确API夹具的三格负偏移实例，窗口内正好两格且标总数3；模式切走隐藏、切回恢复不发请求，查询前后底图编码字节保持，SVG不截输入，作者`<img>`文本不生成元素。空结果和精确重读清轮廓；随后以缺offsets／visualVariants的合法旧DTO重读并实际拾取，结果仍可读但显示未知且零轮廓，不拿已有cellCount=3补形状。该后继只核展示，未将旧r78实际HTTP收据冒充新轮廓验证。

Vue build/check逐字节一致、shell65、测试语法及diff通过。两代码主动LSP300秒仍一项timeout、一项push-only未确认；文档与指纹见 `pick-outline-final-hashes.json`。仅组件、既有测试、两文档及生成后台壳变化，无控制器／服务／web/src／DDL改动，不重建原生束，不重复无影响真实保存／角色／Trial／发布／规则长链。多格空洞／未知几何真实HTTP、原位抓取与完整A09仍缺。

## 后继轮廓真实HTTPS验证

复用同一 `verify_editor_template_browser.mjs r79 --translation-point-only`，未改产品或新增测试入口。新修订明确读取后旧轮廓不存在；实际单格查询和取用／取消后，按本次服务返回的实例与offsets独立计算完整格数及窗口内坐标，核对SVG rect、实例ID、状态计数、pointer-events:none及查询前后底图Canvas编码字节。离开拾取模式进入目标拖曳／检查时轮廓消失，不影响原选择和位移流程。

`pick-outline-http-r79.log` 首轮 **13组通过**，产物 `.dragon-analysis/editor-phase/template-browser-r79/receipt.json`。修订2为 `import-atom-0` 的一格轮廓(0,0)；修订3实际交叠后为上层 `import-atom-1` 的一格轮廓(1,0)，而保留勾选和反向移动仍是下层 `import-atom-0`。收据新增 `outlinePreview` 保存实例ID、完整格数和相对窗口坐标，并绑定含生成CSS的41个测试源码／资源SHA；这与初始化时固定41源输入的计数是两件事。

仍为自有Node服务／SQLite／FileBucket／HTTPS、真实作者登录与全新profile，无API成功夹具。两次定位各3个精确修订GET（总6）、两次确认保存共2POST／2键；正向2→3丢回应后原键恢复，反向3→4还原，旧2／3与其它源保持；管理员404、IDB0、errors／outside为空。只证明这些真实原子实例及重叠，不替代多格空洞／缺几何真实链或完整工作区。

只改既有测试与两文档，产品／两束不变，不重复无影响控制器、工作台、规则／Trial／发布。语法、diff、链接、主动诊断及源码／收据指纹由 `pick-outline-http-final-hashes.json` 维护；A09和完整目标仍未完成。

## 后继完整框选占格联集

`MapWindowPanel.vue` 将单项 `pickOutline` 扩为 `selectionOutline`，在拾取或完整框选模式显示已读累计选取。沿同一实例目录／offsets计算；已知完整占格按实例相加计“格次”，窗口内以坐标Set去重后画联集（最多当前窗口面积），不把重叠两实例说成两倍的窗口面积。包含被遮的完整实例，仍不推断视觉最上层、未选实例遮挡或下层合成。

多项状态分别列实例数、已知格次、形状未知实例数及窗口内已知联集；缺offsets的实例不贡献猜测的格子。全部未知时明确计未知且不画，部分未知时仅表示已知子集，不能称完整覆盖。单项继续原ID／完整格数或未知提示，既有DOM入口保留。拖曳或查询中、模式／资格失效仍不留陈旧轮廓；结果是读取集合，不是素材勾选或位移目标，不改变任何表单或保存流程。没有新增HTTP、定时器、全图绘制缓存或规则状态。

复用既有工作台入口，`selection-outline-browser.log` 首轮 **199组通过**，全新profile产物 `.dragon-analysis/editor-workbench/run-JbUEhS/`。明确API夹具中两项各3格，统计6格次而窗口内仅2格；同修订跨窗追加第三项统计9格次、当前窗联集1格。空结果移除轮廓；原单项／像素不变／取消／保存流程回归保持；合法legacy DTO无offsets时再查询两项，显示0已知格次／2未知／0联集，不取cellCount补形状。未新增独立辅助入口，也未冒真实多格／缺几何HTTP或性能证明。

Vue build/check逐字节一致、shell65、MJS语法及diff通过；两代码主动LSP300秒push-only未确认，不称LSP clean。文档及最终指纹见 `selection-outline-final-hashes.json`。只改Vue组件、既有测试、文档及生成后台壳；无控制器／服务／web/src／DDL，不重建原生束或重复无影响角色／Trial／发布／规则长链。r79是上一单项UI版本的真实HTTPS证据，不冒本批联合验证；当前批量版本的后继真实链见下节。完整A09与目标仍未完成。

## 后继批量轮廓真实HTTPS验证

复用 `verify_editor_template_browser.mjs r80 --translation-point-only`，在原正向保存后修订3的交叠处，先以完整框选模式读取同一单格，再切最上拾取。实际服务返回 `import-atom-0`／`import-atom-1` 两个完整实例，二者原子offsets均为`[[0,0]]`；UI统计2实例／2格次／0未知，仅绘制窗口内(1,0)这一个联集格。查询不改变下层实例的素材勾选、底图Canvas编码字节或保存次数；之后最上拾取及取消转移仍保下层，反向移动还原原坐标。

`selection-outline-http-r80.log` 首轮 **14组通过**，产物 `.dragon-analysis/editor-phase/template-browser-r80/receipt.json`，新增 `batchOutline` 记录完整实例顺序、格次、相对窗口联集及保留勾选。定位查询总7GET（修订2为3、修订3为4），每次绑定实际已读2／3而非输入999；仍只有2POST／2独立键，正向2→3丢回应后原键恢复、反向3→4，旧2／3与其它源保持。真实自有HTTPS／Node／SQLite／FileBucket／作者登录／全新profile，无API成功夹具，管理员404、IDB0、errors／outside为空。

本批只改既有测试和两文档，不改产品或重建两束，不重复无影响控制器／工作台／规则／Trial／发布；41个测试源码／资源SHA及当前产品指纹核对见 `selection-outline-http-final-hashes.json`。仅认证两个真实重叠原子实例的批量轮廓和原保存恢复链，不外推多格空洞、混合未知几何、原位抓取、完整工作区或运行准入。A09与完整目标仍未完成。
