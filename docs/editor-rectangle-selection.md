# E-03-RECTANGLE-AUDIT-1：完整实例框选与临时分配

限定工作台显示侧切片，不改源、规则、容量或正式权限。先核真实路径再测量；完整语义库/性能验收仍开放。

## 更正旧描述

`studio.js`的pointerup原本扫描**全部装饰实例**，实际footprint任一格与矩形相交即选入；包括被另一实例遮挡的下层实例，按数组顺序加进Set。它不是逐格调用selectCell，原本就只在末尾draw一次。上一阶段“检视/框选共用最上拾取索引”及browser marker `indexed240cell rectangle`的归因错误：索引只接单点检视/移动/删除，原地图240格框选检查只能证明回归集合相同，不能证明使用索引。已更正[原维护源](editor-decoration-pick.md)及工程摘要，旧封存收据/日志不覆写，不把它们冒成新证明。

## 实际改动

`componenttools.js#decorationIdsInRect`仍按数组遍历，直接以原footprint/anchor坐标执行相同矩形谓词，返回按原顺序的全部匹配ID；省去每个候选的临时componentCells坐标数组，不用最上单点picker、不以包围框填空洞、不丢下层。不增加持久缓存。studio只有装饰框选分支接它；反向拖拽钳位、Shift追加、其它层/锁、selectedIds、groupId/sel及原末尾draw保持。源和mini不因选择改变。

## 测量与验证

[I/O先登记](editor-local-validation.md#e-03-rectangle-audit-1真实路径复核先审io)。owned `rectangle-audit-session-r1/probe-r1.json`测实施前92586实例，六固定矩形×三轮，包括240格/2格/整图/1905实例/空与越界；候选和原路径**完整有序ID**逐同，保护281源码/82资产。实施后r2同18个结果摘要再逐同；240格三轮原12.34/9.19/8.15ms，产品8.94/5.96/5.94ms。仍O(实例footprint)并分配结果数组，仅Node本机观察、不设性能通过阈值/不推FPS或整体UX。

最终白名单env `run-focused-r1.mjs`六项全部实际exit0：component pure/browser、viewport pure/browser、unified workspace、navigation。80/281仅库存不变，没有全80新成绩。

- 原115检查/36拒、5850单点等值保持；新增3891矩形等值/拒收，12候选×324边界组合、多格非零anchor/空洞/所有遮挡/源数组顺序、空矩形、缺定义拒，不修改任何候选源。
- current240格实际拖框对原完整footprint扫描集合相同，事件内只一次canvas清屏/一次layer刷新；临时测量wrapper仅owned页，pointerup后恢复。不声称此次修复了重复绘制。
- 实际放置作者2格实例覆盖两个原子，框选三个实例全部入选且顺序保持；反向Shift再框仍保union，source/mini/dirty/sel/groupId逐同。随后inspect仍只选最上实例，原捕获/图卡/组/拆合/平移/调序/unknown补底/保存重开与20章fresh/JSON接续；另统一工作台20章、视口及导航按原合同重验。
- own OS temp/loopback/fresh Chromium，IDB hook抛拒/计0、外网/DOS SAVE/用户profile禁，自己listener/browser关闭；导航503明确预期按原合同，其它错误/forbidden0。四既有源有界改动/277旧源/82Web资产/当轮日志/收据/图/语法/诊断另由`static-receipt-r1.json`关联；无新入口或产品模块。

主动11路径0clean/2findings仅八hint/7MD unavailable/2inconclusive；工具“7confirmed-clean”把unavailable误算，不采；session222files六既有warning，无新blocking、不清cache/禁规则。Jev只3432B人工工程摘要/preview/fixed1.13/advisory（初preview把当前单格测量与后续多格测试混述，已在send前纠正并保旧preview），不发源数据/图/快照/完整日志，不作性能/机制/授权门。主动LSP unavailable/inconclusive不算clean；既有selector、Scenario.cities与正确(await).prop不改成错误API。goal active，无commit/push/deploy。

## 后继互联网草稿精确修订框选API

`GET /api/games/:gameId/draft/decoration-selection?revision=…&x=…&y=…&width=…&height=…` 只接受各一次的五个参数；矩形以世界图格计，正整数宽高，严格在384×256内，不裁切。支持完整固定域，不受显示像素窗口32格单边限制。它不是最上图块拾取或地图写入口。

`PrivateDrafts.readDecorationSelection` 经原所属草稿／不可变快照／顺序历史捕获，对await前后的actor及来源身份再核；使用共同 `decorationIdsInRect` 返回按装饰数组顺序的所有footprint相交实例ID。被遮挡层仍列入，不用包围框填空洞，不混入道路或据点，不截断集合。响应绑定gameId／draftRevision／sourceDigest／矩形与固定尺寸，标记 `dragon-draft-decoration-selection-1`、`admission:display-only`，不给第二份可写source或写入权限；返回数组独立，不落桶／SQL预览对象。缺定义等不能返回空集合冒成功。

本批证据前缀 `.dragon-analysis/editor-completion/decoration-selection-api-`：

- `before.stderr` 在未接入口时实际404 `NOT_FOUND`；接线后的 `after-r1.log` 通过，最终以补来源失效／坏源／DTO隔离负控的 `after-r2.log` 为准：`verify_editor_template_root.mjs --map-window-only` 22组通过，stderr空。实际common Request／文件SQLite／FileBucket／41固定来源，认证为种子夹具，不是浏览器登录。
- 两profile均核全域完整有序ID和精确单格原修订；实际保存移除装饰后新集合撤销、旧修订不变，再实际同位置放置两个遮挡实例，框选仍包含二者且保底至顶顺序。独立旧 `componentCells` 扫描作为逐结果对照，返回数组修改不影响后续读取。
- 负控覆盖坏坐标／长度／缺重复多余参数／revision0、异作者／管理员越权404、匿名401、POST404；存储await内禁用本人立即401且只有一次读取，恢复并重建服务后原结果保持。显式受信捕获端口注入缺定义拒422、捕获之后改自有来源身份拒409；这些是自有故障注入，不冒坏source能被真实保存。纯读取和拒绝不增加草稿对象，trial／release仍0。
- 保留原窗口未知格、四季Atlas、完整性及权限测试；组件回归123项／36拒绝／5850索引和3891矩形等值通过（空洞／anchor等共同函数覆盖不冒本次真实保存了全部拓扑）。schema23源／50表／49索引／343列／4FK、shell65、三JS语法及diff通过。三代码主动LSP均push-only未确认，不以零诊断称clean；两文档warning视图clean，mode=all缓存77文件仍25项既有warning（根AGENTS格式23项、两处既有测试提示），未屏蔽，不把其它缓存提示消失当产品修复。

本批没有web/src／Vue／DDL变化，不重建两束或跑无影响游戏规则／完整Root／Trial发布长链。该API批次尚未接只读控制器（后继见下）、画布拖框／追加选择、与实例工具的显式选择衔接及真实浏览器；此前本地studio收据不替代这些互联网功能验收。完整编辑器目标仍active，未提交／推送／部署。

## 后继框选只读控制器

`draft.txt` 新增 `actions.decorationSelection(x,y,width,height)`，必须已有来源摘要及完整装饰清单，矩形完整位于固定域。GET绑定私有已读game／revision／sourceDigest，不取表单里尚未读取的修订；返回必须精确匹配格式、矩形、固定尺寸和display-only标识。ID逐一对照同修订装饰清单，拒陌生、重复、稀疏或逆绘制序集合，空集合合法。

结果为独立只读投影，不写journal、不发POST、不改变其它脏输入或列表选择；不乐观解释源。请求开始先撤旧集合，失败不沿用；await后复核ticket／身份id与版本／原loaded和清单对象。身份退休、来源重读替换、保存未确认清理结果，已观察到的失效状态即使原地恢复旧身份字段也不复活；同修订窗口与已核Atlas可以共存，不为框选重复读取像素。

证据前缀 `.dragon-analysis/editor-completion/decoration-selection-controller-`：

- `before.log` 原124项通过、新3项因动作未接失败；`r2.log` 两控制器127项通过（r1亦通过，r2补窗口共存）。覆盖精确已读修订、脏字段不捎、投影／响应无别名、合法空集合、缺清单／错误矩形／坏身份／错误顺序集合拒绝、迟到HTTP与忙时重入、原地身份版本变更、ABA退役及未确认保存锁。
- `root-r1.log` 的 `--map-window-only` 实际common Request／文件SQLite／FileBucket／41输入22组通过、stderr空；两profile新增原生控制器实际GET整修订→窗口／Atlas→全域框选，逐ID等于该修订全装饰数组、表单修订999不捎、投影修改后render恢复且不增请求、身份退休三种投影清空。此集成禁止POST及journal写，是种子认证下的真实API读取，不冒浏览器登录或画布拖框验证。
- shell65、两JS及TXT模块语法（pipefail）／diff通过；两JS主动LSP均push-only未确认，TXT无服务；两文档warning视图clean，mode=all缓存77文件仍25项既有warning，未屏蔽。没有web/src／Vue／服务／DDL变化，不重建两束或重复无影响规则／完整Root／Trial发布链。

该控制器批次尚未接画布／真实浏览器；Shift追加及与实例操作选择的显式衔接后继见下，不是完整地图工作区验收。

## 后继窗口指针框选与真实浏览器

`MapWindowPanel.vue` 默认仍是无请求的图格检查，另有明确的完整装饰框选模式。仅已读窗口、已核Atlas及完整实例清单就绪时可用；主指针左键按下捕获pointer，按共同屏幕到世界转换得到图格，反向拖曳取包含端点的整数矩形，拖出当前窗口钳位到窗口边缘。临时边框只是显示状态，不进游戏源；松开后仅调用既有只读控制器一次。Esc、窗口失焦、pointercancel／lostcapture、模式或已读窗口变化撤销拖曳；绘制／移动过程不请求。

返回集合按服务器绘制序以转义文本显示，包含下层完整实例，空集合明确为0；结果标明修订与矩形。不改变素材面板勾选、不保存或乐观修改地图、不混入道路据点。此次只在当前已读窗口拖框，**不宣称Shift追加、边缘自动平移、跨窗口合并选择、工具写入衔接已完成**。

证据前缀 `.dragon-analysis/editor-completion/decoration-selection-ui-`：

- `browser-r2.log` 工作台109项通过，产物 `.dragon-analysis/editor-workbench/run-1v1Cng/result.json`。实际gateway／Vue／CSP、API显式夹具；非等比CSS缩放下反向两格拖框、先只绘边框松开才GET、所有遮挡ID显示且HTML不执行、拖出边界钳位／合法空集合、五类取消无请求、原输入revision999和脏名称不捎、来源重读撤旧集合。r1亦通过，r2为检查模式说明更明确后的最终源码。
- `verify_editor_template_browser.mjs r42 --map-window-only` 10组通过，实际Node／文件SQLite／FileBucket／41输入／自有HTTPS／真实作者与管理员登录／全新Chromium。真实反向拖框只GET精确修订2的2×1矩形，所有有序ID逐个等于独立 `componentCells` 完整footprint扫描，无保存／Atlas重读，不取输入revision999；保留四季像素、相邻导航、实际移除装饰后的未知格与旧修订验证，保存后撤框选结果，管理员跨作者框选404。真实浏览器不冒本批新增了多格／空洞／遮挡源，其共同函数与API覆盖见前述记录。
- 收据／截图 `.dragon-analysis/editor-phase/template-browser-r42/receipt.json`／`template.png`，仅1次既有装饰移除保存，框选不POST；stderr空，无正式IDB、外网和非预期页面错误。r41在说明文字调整前已通过，保留为历史；最终以r42源码摘要及收据为准；39项源码SHA事后逐项匹配，实际框选返回2个实例。
- Vue build/check逐byte一致（JS446335B／CSS34499B／8包notice），shell65通过，三代码主动LSP均push-only未确认，不称clean；两文档warning视图clean，mode=all缓存77文件仍25项既有warning（根AGENTS格式23及两处旧测试提示），未屏蔽。两测试语法及diff通过。没有web/src／服务／DDL变化，不重建原生束，不重复无影响Root／规则／Trial／发布长链；完整编辑器目标继续active。

## 后继同修订追加框选控制器

`draft.txt` 的 `decorationSelection(x,y,width,height,mode)` 增加明确 `replace`／`append`，省略保持原取代行为。只有当前同loaded对象、身份及版本仍有效的已读集合可以追加；新请求先撤旧展示，HTTP／DTO验证及迟到回应守卫保持，失败不回填旧集合。窗口导航只读同修订时可保留集合，重新读源、身份退休或未确认保存仍清除。

新增只读投影 `selectedIds` 为按该修订完整绘制序去重的累计集合，未知／未就绪为null；原 `value` 始终是最后一次矩形查询的原始精确结果，不能把跨矩形并集伪装成最后矩形内实例。追加空结果保留集合，取代空结果清空；两种数组都与内部状态隔离。不改变素材面板勾选、不发POST、不写journal、没有新API或准入权限。

证据前缀 `.dragon-analysis/editor-completion/selection-append-controller-`：

- `before.log` 原127项通过、新2项缺累计投影失败；`after-r2.log` 两控制器129项通过（r1亦通过，r2补同修订窗口共存和网络失败）。覆盖反序跨矩形结果按绘制序合并、重复去重、合法空结果、普通取代、投影无别名、非法模式零请求、坏DTO／网络失败／迟到身份版本／重读后不复活旧集合，全部无POST或journal。
- shell65通过；本批只改控制器与测试，不改Vue／web/src／服务／DDL，不重建两束。该控制器批次的Shift手势与累计展示尚未接，后继见下；不以此前r42浏览器源码证据代替本次验证；未重跑不受影响的实际Root、规则或Trial发布长链。
- 测试JS主动LSP为push-only未确认，TXT无服务；两文档warning视图clean，mode=all缓存77文件仍25项既有warning，未屏蔽。JS及TXT模块语法通过；首次diff因新增文档EOF空行失败，已定点去掉，不批量规范化换行。

## 后继Shift追加手势与累计清单

`MapWindowPanel.vue` 在pointerdown固定本次replace／append模式：普通拖框取代，按下时已有Shift才追加；途中松开或再按Shift不改变本次选择。复用原pointer捕获／取消／窗口身份守卫，仍仅松开时发一次精确修订GET。同修订相邻窗口导航保留累计集合，读新源或保存时仍清理；不自动勾选素材列表或写地图。

结果清单显示控制器私有累计集合的只读投影，最后矩形及其命中数量单列，明确累计集合可能来自此前矩形。不将跨窗累计身份伪装成当前窗口内的结果。该批次尚未接写入工具的显式衔接，后继见下；边缘自动平移与完整地图工作区仍未完成。

证据前缀 `.dragon-analysis/editor-completion/selection-append-ui-`：

- `browser-r1.log` 工作台111项通过，`.dragon-analysis/editor-workbench/run-DUOO00/result.json`；实际gateway／Vue／CSP、API明确夹具。覆盖跨窗保留及追加、累计3项与最后矩形命中1项分离、Shift在按下后改变不改本次模式、取代空集合、原取消矩阵不发请求、读源撤累计清单及文字转义。
- `real-r43.log` 的 `verify_editor_template_browser.mjs r43 --map-window-only` 11组通过，实际Node／文件SQLite／FileBucket／41来源／自有HTTPS／真实登录／全新Chromium。邻窗新增2个不同完整实例，实际累计2→4，重复Shift追加仍4，普通拖框改为当前2；按下时的Shift状态生效，松开前改变状态不覆盖模式。每次仅有预期的精确修订2 GET，无Atlas重读／保存，不取输入999。集合逐ID对照独立完整footprint扫描与原绘制序；随后既有装饰保存流程撤清单，旧修订、未知像素及越权验证保持。
- 收据 `.dragon-analysis/editor-phase/template-browser-r43/receipt.json` 记录原矩形、追加矩形、单次命中及累计ID；39源码SHA事后逐项匹配，只有1次既有装饰移除POST，stderr空，无正式IDB／外网／非预期页面错误。两浏览器入口首轮通过；不冒完整副本、多格新场景、自动平移、Trial或发布认证。
- Vue build/check一致（JS446691B／CSS34499B／8包notice），shell65及两测试语法通过。三代码主动LSP均push-only未确认，不称clean；两文档warning视图clean，mode=all缓存77文件仍25项既有warning（根AGENTS格式23及两处旧测试提示），未屏蔽。没有web/src／服务／DDL修改，不重建原生束，不重复无影响Root／规则／Trial发布长链；完整编辑器目标保持active。

## 后继框选显式转移至素材工具

素材面板新增“以窗口框选取代勾选”，不自动跟随窗口选择。原生控制器 `takeDecorationSelection()` 是同步只读端口：要求当前所属／已读source／完整清单／有效累计集合及非忙状态，确认列明游戏、已读修订、数量和替换页外勾选；确认后再次核ticket、身份id／版本、loaded、清单及原selection对象。取消、空集合、忙时或失效均返回null；成功只返回独立ID数组，Vue同步替换本地勾选，不跨await、不写journal、不发请求或命令。仍须另外确认擷取、平移、调序或移除。筛选不变，后续窗口取代为空也不暗中撤掉已经明确转移的工具勾选。

证据前缀 `.dragon-analysis/editor-completion/selection-transfer-`：

- `controller-r1.log` 两控制器131项首轮通过，新增转移副本／已读修订不取输入999、取消／空集合不转移、确认中logout／版本／用户ID／强制改密／换游戏／ABA／忙态／另起框选均拒转移；返回值及模型数组修改不影响内部集合，全部只读无POST／journal。
- `ui-browser-r1.log` 工作台112项首轮通过，产物 `.dragon-analysis/editor-workbench/run-OZ0fpS/result.json`。真实gateway／Vue，API为明确夹具；原勾选1项，取消保1，接受后3项含页外2项，筛选不变；另点移除仍须确认且取消无请求。窗口集合随后被取代为空，转移按钮禁用而工具3项勾选保持，不自动联动。
- `ui-real-r44.log` 的 `verify_editor_template_browser.mjs r44 --map-window-only` 12组首轮通过，实际Node／文件SQLite／FileBucket／41来源／自有HTTPS／真实登录／全新Chromium。当前框选2项显式转移可取消，接受后连筛选外项一起转移；移除另行取消，无网络请求。随后重新框选实际单格完整实例，以转移按钮勾选而非手动checkbox，再单独确认移除：真实2→3保存只含该实例，另表脏名称不捎带，窗口清屏、旧2保持、3的未知格与所有既有权限／像素检查通过。
- 收据 `.dragon-analysis/editor-phase/template-browser-r44/receipt.json`／截图 `template.png`，仍只有1次实际装饰保存，39源码SHA事后逐项一致，stderr空，无正式IDB／外网／非预期错误。不是自动拖放、边缘平移、完整副本新场景或Trial／发布认证。
- Vue build/check逐byte一致（JS447814B／CSS34499B／8包notice），shell65、三测试与TXT模块语法通过。四代码主动LSP均push-only未确认，TXT无服务，不称clean；两文档warning视图clean，mode=all缓存77文件仍25项既有warning（根AGENTS格式23及两处旧测试提示），未屏蔽。无web/src／服务／DDL修改，不重建原生束或重复无影响Root／规则长链。
