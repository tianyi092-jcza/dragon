# E-03-VIEWPORT-1：编辑器视口导航

用户“继续完成剩下的所有任务”后，完成当前profile的独立桌面编辑器切片。属于Web显示工程，不是KI缩放/容量规则；完整任务一和goal仍未完成，逐项剩余见[工作表](editor-goal-completion.md)。原件844e…/compiler0.6/current39/switch保持不变。

## 实际产物及几何合同

- `web/src/editor/viewport.js`：camera保存世界pixel左上与zoom，source格仍16px。`screen=(world-cam)*zoom`与逆变换共用，拾取/拖放/框选/道路/全footprint预览均由同camera转换；DOM border与CSS canvas尺寸另按真实矩形/offset/client比例换算，不假定屏幕1px就是backing1px。
- `studio.js`及HTML：游标滚轮缩放、放大/缩小、100%、整图置中；显示支持1/16–4倍。缩放锚点在未触及真实边界时不漂移，边界夹取优先，不伪造外部区域。整图留边不拾取，camera上限由真实地图和当前canvas/zoom算，不再写死5184/3496。
- 平移用pointer capture和屏幕位移/zoom；素材HTML5拖动、框选或已选整实例待移目标靠32px视口边缘自动平移（最大640屏幕px/s）。编辑RAF预算每次最多50ms，无后台补跑；这些均为纯显示参数，未使用游戏clock/Scenario/规则RNG，也不推进路线。实际边界不扩图；全图已完整显示时不能平移出图。
- 自动平移只在当前明确输入活动/新鲜指针下进行，素材离开/拖动结束、Esc、pointer cancel/lost capture、窗口blur、隐藏及resize清理。隐藏恢复不会自动重放旧指针。移动工具仍是选实例→点目标，不把预览移动写入源；ghost与真实落点同坐标。启动未就绪不接受drag/drop。
- 隐藏层合成只在内容或显隐变化时失效，不每次平移重合成98,304格；大图绘制只遍当前可见范围。素材/组合/地图源、mini像素、保存修订均不因导航改变。未提供完整性能SLA、大图扩容、多格子实例拆分或批量变换。

## 本轮验证（2026-10-01）

先审入口/I/O并登记[本地库存](editor-local-validation.md)，再串行执行。

- [完整53门机器收据](../.dragon-analysis/map-migration-2/viewport-machine-r1/receipt.json)：17:42:52.104Z–18:03:57.449Z全部exit0；98源码/current39资源前后SHA同。原51门全部执行，加pure viewport及actual viewport browser两门。相对旧95仅HTML/studio/runner三差、三新增，游戏规则/RNG/App/保存/编译/源资料未改。5退休road skip不作通过；固定RNG不作CPU或完整战役证书。
- [视口实际浏览器收据](../.dragon-analysis/editor-phase/viewport-machine-r1-viewport/receipt.json)：全新owned context/loopback/temp副本，真实滚轮锚点与原子拾取、按钮zoom/fit、CSS缩放逆变换/留边不拾取、捕获平移、真实HTML5素材边缘drag及Escape取消、待移动ghost、blur清理、1024resize。draft全文/服务草稿/mini像素不变，dirty=false，IDB open0、errors/forbidden0，current39/switch同SHA。[截图](../.dragon-analysis/editor-phase/viewport-machine-r1-viewport/viewport-workspace.png)是owned副本导航，不是原件新美术认可。
- pure门31几何检查/6非法参数负控（以实际unit日志计数为准），输入不变，Math.random/Date.now禁止；同一view正逆、游标锚点、动态bounds、fit留边、有限时间预算与屏幕速度一致。这里没有原规则预期值。
- 浏览器blur明确为注入事件，只证明该生命周期处理器，不冒称真实账户撤销/网络暂停/认证Trial。窗口后台冻结、移动设备、全部DOM变形与完整性能验收未覆盖。
- 主动6代码/HTML检查：querySelector及三正确await括号hint；2有finding、4inconclusive（1timeout/3push-only）、0confirmed-clean。既有常量`window.open("/trial-wait")`误报保留原裁决（无新增ignore/规则禁用），不改正确同源等待页行为。Markdown/session最终覆盖及语法/链接/diff由[本轮静态记录](../.dragon-analysis/editor-phase/viewport-session-r1/static-receipt.json)核签，不声称全LSP清洁。
- Jev审过2467B人工工程摘要/preview0redactions后固定1.13.0发送，结果advisoryOnly；不含资源/代码/真实profile/凭据，不作验收、原证或命令来源。

## 不完成项与接续

本批未动账户/可靠后台、单章依赖、实体初始化、发布/多游戏存档或任何G门。只读wrangler.jsonc确认仓库当前无后台绑定接线，但不宣称线上没有能力，也不读取部署缓存/凭据或新增平台服务。下一独立切片为素材实例拆成子实例/批量平移及素材管理；原证不足的角色/空章/扩容不补默认值。本轮无再次commit/push/fetch/deploy/真实SAVE/profile/DOS写入或全局配置改变。

## 后继互联网编辑器窗口像素流（尚未接画布）

上述是本地studio的历史验收，不是互联网后台完整画布的完成证明。当前完整目标以[全量清单](editor-completion-audit.md)为准。本批先补可复用的只读窗口像素能力，不新增HTTP端口或框架中的可写地图源。

`web/src/content/authoring/tilepixels.js` 新增 `createFixedTileWindowRows(plane, atlasRGBA, {x,y,width,height})`：矩形是6144×4096固定世界的**像素**坐标，不是格坐标；必须完整显式、整数且在界内，越界拒绝，不裁切或扩图。沿原16px图块／256×256不透明图集映射，仅分配并生成窗口范围的RGBA行，不先生成整张大图再裁剪。输入地形平面／图集在调用时立即复制，矩形捕获为值，调用者后续修改及返回行修改不会改变后续重读。矩形访问器、缺字段、未知字段和负零拒绝。

新格式标识为 `fixed-tile-window-1-rows`；既有 `createFixedTileRows` 实现及 `fixed-tile-pixels-1-rows` 标识未改。这个函数只接受已明确的byte平面，不处理未知底层补值、workspace显隐、缩放/DPR、鉴权、资源来源证明或运行准入；后续服务须绑定确切修订及受信图集，画布必须明确处理未知格，不能把本函数输出冒充完整规则地图。

证据前缀 `.dragon-analysis/editor-completion/tile-window-`：

- `before.log` 保存函数尚不存在时的明确断言失败；`after-r2.log` 5组通过，固定manifest SHA及地形／四季图集长度、SHA先核验。四季共364行与既有整图行裁剪逐byte一致，覆盖非图格对齐、跨图块、257px奇宽、全宽窄条、末像素边界；另实际修改一格地形并验证新像素不是原静态图。输入前后SHA不变、立即捕获及重复迭代无别名、访问器执行0、坏矩形／共享或可变缓冲／类型长度／透明图集均拒绝。r1是修改样本断言加入前的通过记录，不替代r2。
- 原生束235文件重建后复建unchanged，摘要 `de5220b90afa7e7dc8787fbb5ad9fbc5fbcc6b718a65ff0a3145a7ee83d1cde0`，两入口壳SHA保持；shell65、两JS语法及diff通过。没有新增固定库登记或部署。
- 两代码主动LSP均push-only未确认，不称clean；两文档warning视图clean，mode=all缓存71文件仍25项既有warning（根AGENTS格式23、两旧测试各1），未屏蔽。未跑旧冻结437输入的完整Node/workerd/Pillow fallback长入口，不将此次裁剪等价测试冒充其重验；也未跑尚未接线的HTTP／画布浏览器、规则／Trial／发布链。没有Vue／DDL更改，不重建展示壳。

该像素能力批次尚需确切草稿修订和资源绑定的窗口读取、未知格显示、原生Canvas绘制与交互；图格读取后继进展见下。长期goal保持active，局部像素测试不代表完整地图编辑完成。

## 后继确切修订合成图格窗口API

新增 `GET /api/games/:gameId/draft/map-window?revision=…&x=…&y=…&width=…&height=…`，复用实际草稿capture／两profile顺序历史／所有权、epoch和固定来源校验。这里x/y/width/height是**图格**，与上一节像素矩形明确分开；尺寸1至32格、整窗必须位于384×256域，参数完整且为规范非负整数文本，重复／额外／缺项／越界拒绝。32格是展示请求预算，不是扩容或规则参数。

只读DTO `dragon-draft-map-window-1` 绑定gameId／精确draftRevision／sourceDigest，带世界格尺寸、tileSize16、原矩形及逐行 `tiles`。数据来自共同 `composeMapLayers(...,{draft:true})` 的完整四层合成，不是基础层DTO或原图截图；露出未知底层保留null，不转成0。未知格诊断可显示，其它不支持recipe／visual诊断拒绝整次预览，不静默漏画。该接口不返回PNG、图集、可写源或运行资格；没有绕过既有资源目录权限，也没有把 `captureForCompile` 的名字当作编译通过。

每个await后及返回前重核所属身份／来源；接口不取latest、不创建预览对象或修改内容。POST没有写入口。后续客户端仍需受信图集绑定、null显示、原生Canvas绘制和输入状态机，不能用该DTO推导已完成画布编辑或Trial／发布。

证据前缀 `.dragon-analysis/editor-completion/map-window-api-`：

- `before.stderr` 新正控实际404 `NOT_FOUND`；接线后 `after-r2.log` 的 `verify_editor_template_root.mjs --map-window-only` 12组通过，stderr空。实际common Request／自有文件SQLite／FileBucket／41固定Web输入，认证为种子夹具，不冒登录浏览器或生产HTTP。默认及原聚焦入口仍保留，未重复无影响长链。
- 中立／完整副本各验证32格内窗口和末格、逐值等于共同合成；通过真实保存移除有明确unknown覆盖记录的装饰，后继窗口首格确为null、其余切片一致、整源等于共同移除writer、旧修订窗口不变。读取后续仍绑定原revision，不偷偷展示新值。
- 非法矩形／重复query／缺项／revision0拒绝，匿名401、异作者及管理员越权404，POST404；对象读取await期间实际禁用账户后仅一次对象读取即401，不返回部分图格。恢复测试账户／重建服务实例后精确结果保持，无新增草稿对象／Trial／Release。
- 另有明确的受信capture端口故障注入：只在测试返回副本上放入不支持的visual绑定，GET必须422 `DRAFT_MAP_PREVIEW_UNSUPPORTED`；不是声称这种源已被保存门接纳。r1是新增这些拒绝项前的通过记录，最终覆盖以r2为准。
- schema仍23源／50表／49索引／343列／4FK，shell65、三JS语法及diff通过。三代码主动LSP均push-only未确认，不称clean；两文档warning视图clean，mode=all缓存72文件仍26项既有warning（根AGENTS格式23、三处旧代码），未屏蔽。本批无web/src／Vue／DDL改动，不重建两束；未跑未接线的Atlas／Canvas浏览器、规则／Trial／发布链。

## 后继精确窗口只读控制器

`draft.txt` 新增 `actions.mapWindow(x,y,width,height)`，参数是格；完整矩形校验通过后仅请求当前已读source的gameId／revision，不使用手改修订输入或latest。共享已读摘要／保存待确认门；没有独立保存journal。响应必须精确匹配format、身份／摘要、原矩形、固定世界尺寸、tileSize和display-only标记，逐格只允许byte或null，数量完整且非稀疏。未知null不转零，窗口值独立克隆投影，没有完整源或Atlas。

读取开始撤下旧窗口，坏回应不能继续展示旧结果；await后核ticket／身份版本／原loaded对象。已安装窗口绑定身份、用户ID、版本及loaded对象，换人或原地身份变化不能显示；同修订的独立清单刷新不使已安装窗口消失。保存结果未确认时禁读且隐藏预览，保存成功仍要求精确重读。不存在新的写入、运行资格或画布接线。

`.dragon-analysis/editor-completion/map-window-controller-r2.log`：两控制器116项通过（新3组），覆盖明确末格矩形、null、返回值／模型无别名、脏输入及修订输入不捎带、非法矩形无请求、坏身份／摘要／矩形／数量／稀疏／byte拒收、迟到退出及原地用户／版本变化、待确认保存禁读、缺来源摘要禁读。r1亦通过，r2补同修订刷新保留与已安装后版本变更隐藏。shell65通过。此为控制器运输夹具，不冒真实API或浏览器联合验证；服务未改，不重复上一节Root长入口。无web/src／Vue／DDL变化，不重建两束，该批次Atlas及Canvas尚未接；后继Atlas API见下。JS／TXT模块语法（pipefail）及diff检查通过；测试主动LSP为push-only未确认、TXT无服务，两文档warning视图clean。mode=all缓存73文件仍26项既有warning（根AGENTS格式23、三处旧代码），未屏蔽、不称全仓clean。

## 后继所属草稿四季Atlas只读API

新增 `GET /api/games/:gameId/draft/map-atlas?revision=…&season=…`；query只能包含各一次的revision与season，四季名称必须明确为spring／summer／autumn／winter，没有默认季节或客户端资源路径。先经PrivateDrafts所有权／删除栅栏、精确快照及完整历史校验，再通过当前身份对应的固定来源目录读取41个已登记角色；未开放管理员素材库权限，也未修改仅当前完整副本可用的OwnedRuntimeAssets运行资产门。

服务构造端口只从policy的固定路径选Atlas，复用InstalledSourceCatalog的固定manifest、注册根、逐块长度／SHA及逐await认证检查；返回PrivateDrafts后再重核同一origin／所有权／epoch，并比对registryId／definitionDigest／catalog root。PNG原字节SHA及256×256／RGBA／全不透明约束通过后，返回 `dragon-draft-map-atlas-1`：gameId、精确draftRevision及sourceDigest、season、尺寸／tileSize16、rgba8像素hex、PNG assetSha256及pixelsSha256、display-only。像素最大262144字节，不返回全源、任意图像或可玩资格。

读取不取latest、不写桶或SQL；旧修订仍绑定旧sourceDigest，即使固定图集像素相同也不能当新修订。当前实现每次重验整份41角色目录，未引入跨账户缓存或新索引；该成本明确保留，不以未经绑定的静态URL替代安全边界。

证据前缀 `.dragon-analysis/editor-completion/map-atlas-api-`：

- `r2.log`：`verify_editor_template_root.mjs --map-window-only` 16组通过，stderr空。实际common Request／自有SQLite／FileBucket／41固定输入、种子认证；保留原图格窗口12组，两profile各新增四季PNG／解码像素逐值比较、精确旧／新修订摘要，以及权限／完整性负控。r1也是通过记录，r2追加来源读取期间origin改变的拒绝。
- 无季节、未知／路径式季节、重复query、额外path、非法revision均422；匿名401、跨作者与管理员越权404、POST404。只在桶返回流中翻转自有Atlas字节，必须503 `SOURCE_OBJECT_CORRUPT`；来源读取await期间禁用账户后仅一个installed对象读取即401；同一阶段改自有origin的baseline_digest后409 `DRAFT_SOURCE_CHANGED`。恢复夹具后旧修订结果保持，无新增草稿对象、Trial或Release。
- schema仍23源／50表／49索引／343列／4FK，shell65、三JS语法及diff通过；三代码主动LSP均push-only未确认；两文档warning视图clean，mode=all缓存73文件27项既有warning（根AGENTS23、drafts既有flag参数两分析器及两处旧测试），未屏蔽、不称全仓clean。无web/src／Vue／DDL改动，不重建两束；未跑尚未接线的Atlas客户端、Canvas浏览器或无关Trial／发布链。这里不是完整画布编辑、原生初始化或部署成功证明。

## 后继Atlas只读控制器与真实API读取

`draft.txt` 新增 `actions.mapAtlas(season)`，明确四季枚举，仅使用已读gameId／revision／sourceDigest，手改修订输入及未保存元资料不捎带。精确校验响应字段、尺寸256×256、tileSize16、rgba8／display-only、PNG摘要格式及像素hex；解码后核全不透明与SHA-256。HTTP与像素摘要两个await后均复核ticket／身份／版本／原loaded对象；读取开始清旧图集，坏回应不会保留旧图集为新结果。

RGBA像素只留在原生控制器，不进入Vue响应式模型；`mapAtlas`展示投影只含锁定、就绪及身份／季节／摘要信息。图集和图格窗口按同一loaded对象共存，同修订的清单刷新不使已装结果失效。切换身份及启动保存关联时，图集与窗口都清掉；退出后即使恢复同一身份对象也不能复活旧预览。保存回应未明仍禁读，成功仍需精确重读。该批次尚未接Canvas（后继绘制端口见下），未建立第二份可写源或保存journal。

证据前缀 `.dragon-analysis/editor-completion/map-atlas-controller-`：

- `r2.log` 两控制器119项通过（原116＋新3），四季／精确已读修订／独立投影、无像素响应式数据、脏输入保留、独立窗口及清单共存；非法季节无请求，坏身份／字段／长度／透明度／SHA拒绝，迟到HTTP及摘要返回不跨身份／版本，保存待确认与缺摘要禁读。r1亦通过，r2包含身份／保存清理后的最终代码。
- `root-r2.log`：`verify_editor_template_root.mjs --map-window-only` 18组通过，实际common Request／自有SQLite／FileBucket／41固定来源、种子认证；保留原16组，两profile各增加真实草稿GET→窗口GET→AtlasGET经原生控制器校验与摘要计算，精确结果及显示投影无别名、无像素泄漏，手改revision不捎带，身份退出／恢复清预览。该新增集成禁止POST及journal写入，不冒真实登录／浏览器Canvas证据；stderr空。
- `root-r1.stderr` 为测试夹具错误：控制器身份用了角色标签而非实际账户ID，被游戏清单ownerId校验拒绝。只改为同一已种子认证账户ID后重新建立自有数据跑r2，产品校验未放宽，失败日志保留。
- shell65、两JS及TXT模块语法（pipefail）通过；两测试主动LSP均push-only未确认，TXT无服务，不称clean。两文档warning视图clean，mode=all缓存73文件仍27项既有warning（根AGENTS23、drafts flag两分析器及两处旧测试），未屏蔽。无web/src／Vue／服务／DDL更改，不重建两束；未跑当时尚未接线的Canvas浏览器、完整Root入口及无关规则／Trial／发布链。

## 后继原生窗口Canvas绘制端口

`installDraftEditor` 增加可选 `getMapWindowCanvas` 与只读 `actions.redrawMapWindow`。窗口和Atlas均须属于同一个已验证loaded修订／身份，缺任一项就清空画布；私有RGBA只在原生控制器消费，不进入Vue或第二份可写源。每个已知byte按16×16图块在256×256图集内取行，窗口只分配最多512×512输出。绘制不发请求、不改源、不写journal，也不消费RNG。

未知null格用不透明灰色8px棋盘显示，是明确的编辑器占位而非地形替值；窗口投影仍为null。读取新窗口或图集时先清旧画面，坏摘要、身份退出／恢复以及保存进入未确认关联都不能留下或复活旧画面。挂载后可显式重绘；该端口批次未挂到Vue页面；后继页面接线见下，仍非完整工作区交互。

证据前缀 `.dragon-analysis/editor-completion/map-window-canvas-`：

- `controller-r1.log` 两控制器122项通过（原119＋新3），覆盖全部256个图块与共同 `createFixedTileWindowRows` 的逐byte对照、未知占位、画布输出无私有像素别名、迟挂载、重绘无请求／journal、读取清屏、坏SHA及保存待确认清屏；shell65通过。
- `browser-r4.log` 新Chromium6组通过，收据 `.dragon-analysis/editor-map-window/run-NlMtpu/receipt.json`。实际共同静态gateway的 `/draft.js` 原生模块（逐byte SHA核对）、实际Canvas2D与WebCrypto；全部图块输出SHA等于共同像素流，未知／已知边界像素、坏SHA清透明、挂载重绘及身份退役均实测。控制器API为显式内存夹具，禁止POST／journal写入；无IDB／外连／console或page错误／失败请求，不冒真实登录、SQLite后端或Vue接线证明。
- 首轮r1在写收据时漏导入 `node:path` 的join而失败，未计通过；补测试导入后r2成功，r3增加console错误收集后通过；缓存随后报三条新测试冗余slice／spread提示，改为Array.from(subarray)后fresh运行r4通过，为最终收据。产品没有因测试失败放宽。三个源码SHA在浏览器前后保持，stderr空。
- 两JS和TXT模块语法（pipefail）通过。两测试主动LSP首探一份warning视图clean、一份push-only未确认；浏览器工具修改后复探仍push-only未确认，TXT无服务。两文档warning视图clean，mode=all缓存74文件仍27项既有warning（根AGENTS23及四项代码告警），未屏蔽，不称全仓clean。无web/src／Vue／服务／DDL改动，不重建两束，不重复无影响Root、规则或Trial／发布长链。该端口批次待接的Vue／真实后端浏览器由下一节补证，完整画布编辑仍未完成。

## 后继地图页窗口与四季真实像素

`MapWindowPanel.vue` 挂入地图页，`client.txt` 提供只读Canvas引用给原生控制器。窗口X／Y／宽／高与季节全部空白起始，参数输入不自动请求，单边1至32格且不裁边；分别明确读取窗口／图集，只消费已加载精确修订，不使用手改的修订输入冒充已读状态。Vue仅持表单、投影和Canvas元素，RGBA仍在原生控制器；当前显示的窗口坐标／来源修订与已核季节明确列出，未全部就绪时画布空白。

该窗口接线批次不增加拖拽／刷图／拾取／地图写入口（后继只读图格检查见下）；未知格仍为明确棋盘而非替值。保存待确认或显式重新读取时由既有原生端口清屏，不能显示旧修订像素。窗口画布与据点道路几何示意分别标注，截图不作为规则机制证据。

证据前缀 `.dragon-analysis/editor-completion/map-window-ui-`：

- `browser-r1.log` 工作台新Chromium104项通过，`.dragon-analysis/editor-workbench/run-yUyKAV/result.json`。真实gateway／Vue／CSP，API明确夹具；验证缺sourceDigest及空参数禁读、越界禁用、手改修订999不捎带、窗口无Atlas先空白、2格边界已知像素与未知棋盘、切换选择不暗中请求、明确读夏图才换图、其它脏输入保留及重新读源清屏。截图 `map-window.png`。
- `real-r38.log` 新显式 `verify_editor_template_browser.mjs r38 --map-window-only` 7组通过：实际Node共同服务／自有文件SQLite与FileBucket／41输入／HTTPS／真实作者管理员登录／新Chromium。前4组创建与资料保存复用；随后一格真实窗口在四季分别与各固定PNG（来源SHA核对）和共同行流逐byte相等，读取始终绑定修订2而非输入999，没有预览写入。
- 通过既有实际UI移除该格的完整遮盖装饰，2→3仅一次保存，另一表脏名称不捎带。保存后Canvas清空，精确读取3的合成窗口为null，重新读取同修订Atlas后画未知棋盘；基础层DTO未补值，原修订2窗口／源保持。管理员越权读窗口和Atlas均404，无正式IDB、外连或非预期页面错误。不是整图／20章／完整副本窗口编辑或运行准入验证。
- 收据／截图 `.dragon-analysis/editor-phase/template-browser-r38/receipt.json`／`template.png`；38源码SHA事后复核一致、四季像素摘要、一次装饰保存、stderr空。旧 `--materials-only`／`--base-fill-only`／默认入口保持；本轮只跑新聚焦，不冒其完整长链已重跑。
- Vue build／check逐byte一致（JS436064B、CSS34121B、8包notice），shell65、两JS和client模块语法（pipefail）通过。测试首轮通过；四代码主动LSP均push-only未确认，TXT无服务，不称clean；两文档warning视图clean，mode=all缓存76文件仍27项既有warning（根AGENTS23及四项代码告警），未屏蔽。本批未改根AGENTS。无web/src／服务／DDL变更，不重建原生束或重复无影响Root、规则／Trial／发布链。

## 后继窗口只读图格检查

地图窗口左键显示已绘制合成格的世界坐标、格索引、精确修订及byte／未知值。不是基础层值、实例选择、填色目标或运行机制；点击不发请求、不写journal、不改变未保存输入。Vue只保存该次检查的少量显示字段，不保留可写源或RGBA。

无边框／padding的Canvas实际DOM矩形先换算到backing像素，再调用共同 `viewport.screenToWorld`（窗口左上世界像素、zoom=1），不假定CSS像素等于图像像素。右／下边界外不拾取；繁忙、未完整就绪、换窗口身份／矩形／已核季节、读取或保存时清掉旧检查。表单里尚未读取的新参数不取代当前画布坐标。

本批证据前缀 `.dragon-analysis/editor-completion/map-window-pick-`：

- `browser-r2.log` 工作台新Chromium105项通过，`.dragon-analysis/editor-workbench/run-8MusIe/result.json`：真实Vue／Canvas、API明确夹具。32×16 backing在64×48 CSS下，最后两格准确对应98302／98303和未知／7；越界拒、未就绪禁检查、切季与重读清除，点击不增窗口／图集请求，修订输入999和其它脏输入保持。
- 首轮 `browser-r1.log` 一个边界负控失败：测试将小数DOM边界直接传给MouseEvent构造器，其clientX/Y被截为整数，实际事件仍在图内。独立新Chromium收据 `coordinate-rounding.json` 确认12.75／34.75得到12／34；仅将负控改为ceil右／下及floor左的真正外点，产品几何未放宽。
- `real-r39.log` 的 `--map-window-only` 8组通过，`.dragon-analysis/editor-phase/template-browser-r39/receipt.json`：实际登录／Node SQLite／FileBucket／HTTPS／新Chromium、四季真实像素及移除遮盖后的未知窗口链保留。新增48×32 CSS的一格检查，四季均显示精确修订2的已知值；实际保存后旧检查撤下，读取3后同格显示未知。点击前后浏览器请求数不变，仍只一次既有装饰保存；不是画布编辑／完整副本或发布验证。
- 共用纯几何31检查／6负控、shell65通过；Vue build/check逐byte一致（JS438592B、CSS34140B、8包notice），两测试语法通过。三代码主动LSP均push-only未确认，不称clean；两文档warning视图clean，mode=all缓存76文件仍27项既有warning（根AGENTS23及四项旧代码告警），未屏蔽。39源码SHA事后复核一致，r39 stderr空，diff检查通过。无web/src／服务／DDL变化，未重建原生束，也未重跑无影响Root、规则／Trial／发布链。

## 后继已读窗口相邻导航

原生草稿控制器新增 `mapWindowStep(dx,dy)`，只接受上下左右一个方向，从私有已读窗口推导相邻矩形；每次移动一窗宽／高，边缘把完整矩形限制在384×256内，可能部分重叠。已在边界时不发请求，不缩小／裁切图格数据；缺窗口、未确认保存或失效身份不得导航。继续复用精确修订读取、开始清屏、迟到回应拒绝，保留同源已核Atlas而不重复读取。表单输入不是导航依据，也不改变源或保存状态。

`MapWindowPanel.vue` 的四向按钮只显示当前边界可用状态，动作交原生控制器；不通过Vue重排／修改图格。新窗口读取会清掉旧图格检查，重新点击按新世界矩形定位。这里是显式窗口GET导航，不是拖曳相机、边缘连续平移或编辑选择；那些完整工作区出口仍未完成。

证据前缀 `.dragon-analysis/editor-completion/map-window-navigation-`：

- `controller-r1.log` 两控制器124项通过（新增2组），核私有已读矩形不受显示DTO篡改、修订999／其它脏表单影响，四方向、非整步边缘限制、四边no-op、非法方向、无窗口、繁忙抑制重入、身份／版本／游戏切换迟到回应和坏DTO清屏；导航不写journal或POST，不重新请求Atlas。
- `browser-r1.log` 工作台新Chromium106项通过，`.dragon-analysis/editor-workbench/run-YM7RBr/result.json`。真实Vue／Canvas、API明确夹具；四方向从地图末角按已读2×1窗口导航，不采用新输入的0／0／1，边界按钮禁用，检查索引随窗口变化且每读先清旧检查；图集请求仍2次，未存名称和修订999保持。
- `real-r40.log` 的 `--map-window-only` 9组通过，`.dragon-analysis/editor-phase/template-browser-r40/receipt.json`。实际Node SQLite／FileBucket／41来源／自有HTTPS／真实登录／新Chromium；四季像素、未知暴露及原权限链保留，新增实际已读1×1窗口右移再返回。即使表单改为32×32、修订999，只有两次精确修订2的窗口GET，未重新请求冬季Atlas，像素逐byte等于固定Atlas／共同窗口行流；图格检查随新坐标，不再增请求。收据保留两窗像素摘要；仍只原有一次移除装饰保存，无正式IDB／外连／非预期错误，stderr空，39源码SHA事后逐项复核一致。
- Vue build／check逐byte一致（JS440951B、CSS34140B、8包notice），shell65；本批上述测试首轮通过。四代码主动LSP warning视图1clean、3push-only未确认，TXT无服务，不以无诊断称全部clean；两文档warning视图clean，mode=all缓存76文件仍27项既有warning（根AGENTS23及四项代码告警），未屏蔽。三JS及TXT模块语法（pipefail）、末次shell65与diff检查通过。无web/src／服务／DDL变更，不重建原生束或重复无影响Root、规则／Trial／发布长链。

## 后继窗口显示缩放

`MapWindowPanel.vue` 沿用共同视口 `ZOOM_MIN=1/16`／`ZOOM_MAX=4`，提供6.25%至400%的七档显示倍率，初始100%，换游戏／读取修订上下文重置。只用Canvas的CSS zoom改变布局显示尺寸，不重采样私有RGBA、不改backing尺寸／源数据或请求身份，不额外读取窗口／Atlas。点击检查与拖框继续按真实DOM矩形映射到原图格；切倍率立即取消未完成拖曳及旧检查，不清除已确认的同修订累计框选或素材工具勾选。该批未含鼠标锚点缩放，后继窗口内接线见[Ctrl滚轮缩放](#后继窗口内ctrl滚轮锚点缩放)；完整相机、边缘平移与完整地图编辑仍是独立未完出口，不以局部窗口缩放冒充完成。

证据前缀 `.dragon-analysis/editor-completion/map-window-zoom-`：

- `browser-r3.log` 工作台114项通过（真实gateway／Vue／Canvas，API明确夹具）。七档DOM尺寸准确、backing仍32×16且逐byte相同，400%检查命中正确世界格；拖曳期间改倍率取消且无GET，累计集合、修订999及其它脏输入保持。r1在后继旧框选测试失败：新增工具栏后，测试点击导航按钮即用原始鼠标坐标，目标Canvas未滚入可见区域；仅测试在取boundingBox前显式scrollIntoViewIfNeeded，产品事件／选择语义未改。r2已通过，r3补累计集合与脏字段保持，为最终工作台源码。
- `real-r45.log` 的 `verify_editor_template_browser.mjs r45 --map-window-only` 12组通过，实际Node SQLite／FileBucket／41来源／自有HTTPS／真实登录／新Chromium。四季各核6.25%、50%、200%、400%的DOM尺寸和相同原始像素SHA，400%检查世界格准确，倍率变化不产生请求。原导航、Shift追加、显式选择转移、独立移除确认、旧修订／未知格与权限链继续覆盖；仅1次既有装饰移除保存，无正式IDB／外网／非预期错误。
- 收据／截图 `.dragon-analysis/editor-phase/template-browser-r45/receipt.json`／`template.png`，逐季记录 `displayZooms`；39源码SHA复核，stderr空。Vue build/check逐byte一致（JS449064B、CSS34499B、8包notice）；纯几何31检查／6负控及shell65通过。没有web/src／原生控制器／API／DDL变化，不重建原生束、不重复无影响Root／规则／Trial发布长链。两测试语法与diff通过；三代码主动LSP均push-only未确认，两文档warning视图clean，mode=all缓存77文件仍25项既有warning（根AGENTS23及两处旧测试提示），未屏蔽。

## 后继已读窗口图格位移控制器

`draft.txt` 新增 `actions.mapWindowPan(dx,dy)`，明确接受图格整数位移，不是像素或装饰移动。它和原四向整窗导航复用 `moveMapWindow`：依据私有已读矩形／世界尺寸钳位完整窗口，允许对角位移；零位移和已到边界的原位结果不GET。旧四向动作仍只接受一个单位方向，再乘已读窗口宽高，不受此新增自由位移语义影响。

只有已读窗口／精确修订有效且没有未确认保存时可执行。读取沿原 `readMapWindow` 的身份／版本／source／ticket验证，开始清旧窗口、忙时不重入，坏DTO与迟到回应不安装；不取可编辑表单或被篡改的展示投影。仍只GET该修订图格，不重读同source Atlas、不改累计框选、不写journal／地图。该控制器批次尚未接画布手势，后继见下。

证据前缀 `.dragon-analysis/editor-completion/map-window-pan-`：

- `before.log` 原131项通过、新2项因动作未接失败；`after-r2.log` 两控制器133项通过。覆盖任意整数／对角位移、固定边界钳位、零／边界no-op、非法数值及无窗口、展示投影篡改和修订999／其它脏输入不捎、Atlas与同修订累计框选保持、忙时重入／迟到用户身份或版本／切游戏、坏矩形DTO与待确认保存锁。r1亦通过，r2补累计选择及未知保存journal保持。
- shell65、测试JS与TXT模块语法通过；测试JS主动LSP为push-only未确认，TXT无服务，不称clean。没有Vue／web/src／服务／DDL变化，不重建两束或重跑无影响Root／规则／Trial发布长链；未将旧r45浏览器源码收据当作此新控制器的浏览器证明。
- 两文档主动warning视图clean；mode=all缓存77文件29项warning，包含此前Canvas测试4处slice／spread提示、根AGENTS23项格式提示及两处旧测试提示。本批未改这些旧测试表达式或根约定，不屏蔽诊断、不称全仓clean。

## 后继窗口拖动手势与真实浏览器

`MapWindowPanel.vue` 增加明确的“拖动已读窗口”模式，和检查／框选区分。主指针左键按下时捕获当前DOM尺寸与窗口图格比例；移动只显示位移提示，不读取、不移动装饰、不更改Canvas像素。向右／下拖动相应请求窗口向左／上，位移按完整图格截断、负零规范为0；不足一格不请求。松手调用一次 `mapWindowPan`，边界仍由私有已读矩形钳位。提示区域预留高度，不在拖动中推移Canvas布局。

Esc、失焦、pointercancel／lostcapture、模式／倍率／窗口变化取消手势；busy、缺图集或窗口时不能开始。不改变累计框选或素材勾选，不使用未读表单。此处是**松手后读取窗口**，不是连续相机拖动、边缘自动平移、整图工作区或写入编辑完成。

证据前缀 `.dragon-analysis/editor-completion/map-window-pan-ui-`：

- `browser-r1.log` 工作台117项首轮通过，产物 `.dragon-analysis/editor-workbench/run-IhmK5h/result.json`。真实gateway／Vue／Canvas、API明确夹具；200%及非等比CSS尺寸下正反对角拖动仅松手各一次GET，过程中无查询／框选框，保留Atlas、素材勾选及修订999；六类取消及不足一格均无请求。
- `real-r46.log` 的 `verify_editor_template_browser.mjs r46 --map-window-only` 13组首轮通过，实际Node SQLite／FileBucket／41来源／自有HTTPS／真实作者与管理员登录／新Chromium。200%显示下一格对角导航再返回，仍按已读1×1窗口与修订2，而非表单32×32／999；过程中零请求，松手精确GET一次，无Atlas重读或新POST。两个新窗口的原生Canvas像素逐byte等于固定冬季PNG／共同窗口行流；原四季、框选转移、实际装饰移除、旧修订／未知格及越权边界保持。
- 收据／截图 `.dragon-analysis/editor-phase/template-browser-r46/receipt.json`／`template.png`，新增两条 `panned` 窗口及像素摘要；39源码SHA逐项复核一致，仍仅1次既有装饰移除保存，stderr空，无正式IDB、外网或非预期页面错误。不是完整副本新场景、连续拖动或Trial／发布认证。
- Vue build/check逐byte一致（JS450856B、CSS34712B、8包notice），shell65、两测试语法通过。三UI代码主动LSP均push-only未确认；此UI批次无web/src／服务／DDL变化，不重建原生束、不重复无影响Root／规则长链。两文档warning视图clean，mode=all缓存77文件仍29项既有warning（含前述Canvas测试4处），未屏蔽；最终diff检查通过。

## 后继四层只读显示投影（尚未接窗口API）

新增 `web/src/editor/mapdisplay.js:composeMapDisplayLayers(source,visible)`，显式接收base／decor／roads／cities四个布尔工作区状态，不写入GameSource。先用原共同composer验证**全层合成**，未知底层允许保留null，其它不支持配方诊断拒绝；隐藏层不能用来掩盖坏配方、水组引用或越界实例。这不是完整GameSource身份／权限／运行准入验证，后续仍须从所属精确草稿出口调用。

全部可见时复用完整合成图块；否则仅在临时只读投影中去掉隐藏实例，基础层隐藏时使用null而非0。完整水组先前已经核验；临时显示投影不带水组，避免隐藏层后产生悬空成员，其地理／小地图计算结果不输出。返回只有 `admission:display-only`、宽高与独立tiles数组，没有规则地理、地图源或保存资格。源水组显隐、规则合成、道路类型、未知底层记录及其它状态完全不变。隐藏上层时只露出当前下层，不能恢复原图旧内容。

证据前缀 `.dragon-analysis/editor-completion/map-display-layers-`：

- `r2.log` 新6组通过：16种显隐组合独立期待值、四层覆盖顺序、当前下层修改与null／0区别、水域小地图开关不改变图块、隐藏坏配方／坏组／越界仍拒、输出无别名、四布尔／访问器边界；另从41固定Web输入取得实际地图，全部可见逐格等于原composer，仅基础层逐格等于当前base，全部隐藏全null，源和正式完整合成结果不变。r1亦通过，r2是在注释明确“全层合成而非全源认证”后的最终源码。
- 既有窗口像素5组与shell65通过；原生束增至236文件，重建及复建unchanged，最终SHA `c8929491b86afe4c8a3ac44db20d3811dc358e24c65d6da00abb59cb5e3b9168`，两入口壳SHA保持。没有Vue／服务／DDL变化，不重建展示壳。
- 两代码主动LSP均push-only未确认，后续编辑器即时探测亦未确认，不能称clean。该内容批次尚未接窗口API（后继见下）、显隐控制器／按钮或浏览器；未重跑不受影响的Root、规则、Trial／发布长链，不把此纯显示函数当四层工作区全部完成。此实现有完整合成及可见合成的成本，无缓存／FPS承诺。两文档warning视图clean，mode=all缓存79文件仍29项既有warning（根AGENTS23、旧Canvas测试4及另外两处测试），未屏蔽；本批测试首轮通过，最终两JS语法及diff检查通过。

## 后继精确修订四层窗口API

新增只读 `GET /api/games/<id>/draft/map-layer-window?revision=…&x=…&y=…&width=…&height=…&layers=1111`。四位严格二进制依次为base／decor／roads／cities，必须显式提供；查询项精确且不得重复。沿既有所属、固定来源／历史、确切不可变修订、每await鉴权与1至32格窗口边界，调用共同显示投影。新DTO格式 `dragon-draft-map-layer-window-1`，增加实际 `visibleLayers` 四布尔，仍是display-only；sourceDigest始终指完整草稿，不因显隐产生新source或发布身份。null可能是隐藏后的空白或原有未知，不能把过滤后的显示面当源缺口、默认地形或可玩规则。

原 `/map-window` 的五项查询及旧DTO保持，给旧入口额外传layers仍拒绝；新入口POST也不开放。没有写草稿、对象桶、工作区配置或创建预览缓存，不返回地理／规则数据；该API批次尚未接客户端显隐控制器／按钮，后继控制器见下。

证据前缀 `.dragon-analysis/editor-completion/map-layer-window-api-`：

- `before.stderr` 正控实际404 `NOT_FOUND`；接线后 `r1.log` 的 `--map-window-only` 26组通过，实际common Request／自有文件SQLite／FileBucket／41输入，认证为种子夹具。两profile各新增显隐与拒绝组：七种mask（全显、全隐、仅底层及逐层隐藏）逐值等于共同投影；全显与原窗口相等、全隐null、草稿全文与对象数不变。真实装饰移除后的新窗口仍匹配新sourceDigest，旧修订显示不变。
- 新入口缺／重复／非法mask、额外查询、旧入口夹带layers、越界／超窗口／修订0、POST、匿名及异作者／管理员越权拒绝；隐藏所有层也不能掩盖受信port故障注入的坏配方；读取await中账户禁用401且仅一次读取，恢复服务实例后相同修订DTO不变。坏配方注入不是坏源实际保存证明。保留原窗口、四季Atlas、框选和控制器只读集成覆盖，不冒浏览器登录／Canvas或生产结果。
- schema仍23个DDL源／50表／49索引／343列／4FK，shell65、三JS语法和diff通过。只有服务／测试／文档更改，无web/src／Vue／DDL变化，不重建两束；未跑尚未接的新显隐浏览器、完整Root或无关规则／Trial／发布链。三代码主动LSP中2项push-only未确认，drafts仍有既有flag参数warning；两文档warning视图clean，mode=all缓存79文件30项既有warning，未屏蔽，不称全仓clean。

## 后继四层窗口只读控制器

`draft.txt` 新增 `mapWindowLayers(mask)`：仅已读有效窗口接受明确四位二进制，沿私有已读矩形／修订调用新只读入口，不取未保存表单。返回必须为新格式且四个 `visibleLayers` 布尔逐项与请求一致，原窗口字段、摘要、坐标、像素值域及每await身份守卫照旧。开始请求即撤旧窗口；坏回包或迟到身份不恢复旧图。显示空格不用于断言底层未知或规则地形。

私有mask与已核窗口一起保存，箭头／松手拖动导航沿用它；公开投影的flags及tiles均独立复制，不能反写导航状态。普通 `mapWindow` 显式读取仍走原入口、恢复全层旧格式；同修订Atlas与累计框选不改变，不产生保存、journal或新程序资源。

证据前缀 `.dragon-analysis/editor-completion/map-layer-controller-`：

- `r2.log` 两控制器135项通过（r1亦通过，r2补Atlas共存／仅一次Atlas读取）。新增16种mask、私有flags不受响应及投影篡改、窗口／图格导航保持显隐、显式普通读取恢复旧格式、revision999与脏名字不捎；缺窗口／非法模式无请求、错格式／旗标／摘要、忙时重入及迟到版本拒绝且不留旧图。无POST／journal。
- `root-r1.log` 的 `--map-window-only` 实际Request／自有文件SQLite／FileBucket／41输入26组通过、stderr空。两profile原生控制器实际读取全隐／仅底层窗口，逐值等于该已保存源的共同投影，每次仅一个窗口GET，Atlas及全域累计框选保留；身份退休全部清除。新增集成禁止POST及journal写，认证为种子夹具，不冒真实登录／显隐按钮或Canvas浏览器证书。
- shell65通过；本批测试首轮通过，无Vue／web/src／服务／DDL更改，不重建两束，不重复无影响完整Root、规则或Trial／发布链。两测试JS主动LSP均push-only未确认，TXT无服务；两文档warning视图clean，mode=all缓存79文件26项既有warning，未屏蔽，不将缓存减少当作旧提示已修复。两JS及TXT模块语法、diff通过；该控制器批次未接四层按钮（后继见下），workspace锁及完整地图编辑仍未完成。

## 后继四层窗口按钮与真实像素

`MapWindowPanel.vue` 增加基本地图／装饰／道路／据点四个显示按钮，只从已确认窗口的flags构造下一次mask；未就绪或忙时禁用，按钮不乐观改源或保存配置。切换撤销拖动及图格检查，导航沿用私有mask；普通“读取图格窗口”恢复全层。显隐窗口的null检查明确显示“空白／未知（显示投影）”，灰棋盘不再一律宣称未知底层。

这仍是只读显示开关而非workspace锁定；界面明确完整装饰框选查询完整源，包含显示已隐藏的装饰，不自动清除累计集合或工具勾选。没有增加运行地形、道路规则、工作区持久化或任意地图准入。

证据前缀 `.dragon-analysis/editor-completion/map-layer-ui-`：

- `browser-r1.log` 工作台119项通过，产物 `.dragon-analysis/editor-workbench/run-rzO1ez/result.json`。实际gateway／Vue／CSP，API显式夹具；四层逐次隐藏／恢复、全隐棋盘及图格文字、隐藏窗口导航mask保持、累计框选保留、未读revision999不捎且Atlas不重读；原框选／缩放／拖动／取消矩阵保持。
- `real-r47.log` 的 `verify_editor_template_browser.mjs r47 --map-window-only` 14组通过，实际Node／文件SQLite／FileBucket／41固定输入／自有HTTPS／真实管理员与作者登录／全新Chromium。新增8种按键mask和全隐两次导航，共10帧逐byte等于完整源的共同显示投影＋固定winter PNG／共同像素流（null按明确棋盘对照）；每次仅精确修订2的窗口GET，不重新读Atlas、不取表单revision999、不新增保存。原四季、缩放、拖动、Shift追加、显式转工具及实际装饰移除后未知格链保持。
- 收据／截图 `.dragon-analysis/editor-phase/template-browser-r47/receipt.json`／`template.png`，`layeredFrames`保存10帧mask／位置／tile／像素SHA。总1次既有装饰移除保存；40源码SHA事后匹配、stderr空，无正式IDB／外连／非预期错误。不是完整副本显隐浏览器、workspace锁／持久化、Trial或发布证书。
- Vue build/check逐byte一致（JS453515B、CSS34712B、8包notice），shell65及两测试语法通过；本批测试首轮均通过。三代码主动LSP均push-only未确认，不能称clean；两文档warning视图clean，mode=all缓存79文件仍26项既有warning，未屏蔽。没有web/src／原生控制器／服务／DDL变化，不重建原生束或重复无影响Root／规则／Trial发布长链。

## 后继装饰层防误编辑锁控制器

`draft.txt` 增加本地 `decorLock(boolean)` 与只读 `materials.decorationLocked`，沿当前装饰工具默认未锁定的行为；基础层仍沿既有明确解锁合同。锁只保护装饰实例的放置、平移、调序、拆分、移除五类命令，进入确认之前及确认之后均核验，直接调用动作同门。锁定可立即执行，忙时不能解锁，因而确认期间重新锁定不能偷偷发起写入。同游戏重读保持装饰锁，切换游戏／身份按工作区生命周期重置；不写草稿、摘要、journal或发布内容，不是服务端权限。

素材库擷取／更名／无引用定义移除不改装饰实例，不套这把锁；水组元资料、只读像素与完整源框选也未混成装饰实例写入。锁后未知保存关联保持原键／正文，允许查询，但禁止原键POST重试直到明确解锁；已经发出的请求不能被这把锁伪装为取消，实际收据仍正常接收并要求精确重读。

证据前缀 `.dragon-analysis/editor-completion/decoration-lock-controller-`：

- `before.log` 原135项通过，新3项因未接锁动作／投影失败。修后测试执行前另修两个夹具回调，使用无参数封装以免API路径被误当修订；产品权限没有放宽。
- `after-r2.log` 两控制器139项通过（r1为138项，r2增加在途请求锁定后真实收据不可丢弃）。覆盖两profile五动作锁前零dialog／POST、确认内锁定＋忙时解锁拒绝、投影无别名、同游戏重读保锁、库改名仍可保存、未知关联原键重试受锁而GET可查、解锁后原body／key不变、在途成功后仍须精确读及切身份重置。全部是隔离控制器端口，不冒后端权限或真实浏览器锁按钮证据。
- shell65、JS及TXT模块语法通过；测试JS主动LSP为push-only未确认，TXT无服务。无Vue／web/src／服务／DDL更改，不重建两束；该控制器批次的装饰锁按钮与浏览器进展见下；当前层选择、其它层完整锁／工作区持久化仍待接，不重复无影响Root／规则／Trial发布长链。
- 两文档主动LSP warning视图clean；mode=all缓存79文件仍26项既有warning（根AGENTS23及drafts、章节测试、原证测试各1），未屏蔽，不把缓存或局部测试当全仓clean。

## 后继装饰锁按钮与真实浏览器

`MaterialsPanel.vue` 接入明确的锁定／解锁按钮与状态；未读或忙时按钮禁用。只将装饰实例放置、平移、调序、拆分、移除按钮纳入锁，筛选、勾选、素材库操作及原键查询不受此锁限制。锁不改显示图层、Canvas、累计框选、已选集合或输入值；解锁不自动保存，仍经原确认与精确修订。已经发出的请求不会因此取消，原键实例写重试仍由控制器检查锁。

证据前缀 `.dragon-analysis/editor-completion/decoration-lock-ui-`：

- `browser-r1.log` 工作台122项通过，产物 `.dragon-analysis/editor-workbench/run-QAQSkT/result.json`。实际gateway／Vue／CSP、API显式夹具；新增已填合法放置的锁门、多格候选拆分锁门，以及有页外选取时移除／有效位移／上下调序锁门。锁定前可执行、锁定后禁用、解锁恢复，素材擷取／筛选及输入／选择保留，全程不发请求。
- `verify_editor_template_browser.mjs r48 --map-window-only` 15组通过，实际Node／文件SQLite／FileBucket／41来源／自有HTTPS／真实作者管理员登录／全新Chromium。使用实际累计框选转移后的勾选及有效位移，锁定／解锁不发GET或POST，实例按钮受锁、素材擷取可用，筛选外选择、累计ID和Canvas像素不变。随后移除仍须独立确认，取消无写；保留原实际装饰移除、旧修订、四季／导航／四层像素、身份隔离与未知格验证。
- 收据／截图 `.dragon-analysis/editor-phase/template-browser-r48/receipt.json`／`template.png`；40源码SHA事后逐项一致，stderr空，无正式IDB、外网或非预期错误。只包含既有的一次实际移除保存；不冒新物理删除、完整副本锁浏览器或持久化工作区认证。两浏览器首轮通过。
- Vue build/check逐byte一致（JS454963B／CSS34712B／8包notice），shell65及两测试语法通过。三代码主动LSP未确认（2超时、1push-only）；两文档warning视图clean，mode=all缓存79文件仍26项既有warning，未屏蔽。没有web/src／原生控制器／服务／DDL变化，不重建原生束或重跑无影响Root／规则／Trial发布长链。

## 后继画布选格接入素材放置

`MapWindowPanel` 新增“將檢查格用作素材落點”，由 `MapPanel` 转给既有 `MaterialsPanel` 放置表单。必须先明确选择素材、变体、水域类别并解锁装饰层；点击画布仍只检查，按取用按钮才替换X／Y。只传同一已读游戏／修订／来源的整数落点，不复制合成图块或推断水陆，不改其它输入、不发请求。随后仍由原 `actions.place` 独立确认、单journal保存及收据精确重读。该批次只接落点选择；后继占用格预览见下，拖放及当前层工作区仍未完成。

本批复用两个既有浏览器入口，没有增加独立探针。证据前缀 `.dragon-analysis/editor-completion/map-placement-ui-`：

- `browser.log` 工作台126项通过（实际gateway／Vue，API明确夹具），新增非等比显示下选未知合成格→显式取用，保留选定river而不从未知值猜类别；未选素材／类别、装饰锁定时禁用；只取坐标、取消后无请求、其它脏资料保持。
- `real-r50.log` 实际HTTPS／Node／文件SQLite／FileBucket／41来源／真实作者与管理员登录／新Chromium16组通过。在原素材保存链中改用实际1×1图格窗口选格而非手填坐标，核锁门、类别／变体及脏metadata保持，然后真实放置9→10、丢响应、刷新原键查询及精确重读；后续拆分／移除既有链保持。收据 `.dragon-analysis/editor-phase/template-browser-r50/receipt.json`，40项源码SHA复核一致、12次既有保存、stderr空；不是完整画布工具或运行准入证书。
- `real-r49.stderr` 首次因指定了不存在的Playwright模块路径失败，0组，不计通过；查现有安装后使用 `@playwright/cli/node_modules/playwright/index.mjs` 重跑，未安装依赖或改产品。
- Vue build/check逐byte一致、shell65、两测试语法及diff通过。未改web/src、原生控制器、服务或DDL，不重建原生束、不重复无影响Root／规则／Trial发布长链。
- 主动LSP先30秒有超时，延至60秒、并发降至2后五代码均为push-only未确认；两文档warning视图clean。mode=all缓存95文件显示9项未用声明、34项warning及1hint：九项均是MaterialsPanel实际模板引用（ElButton、validPlace、validShift、canTakeSelection、takeSelection、splitLabel、layerPositions、materialRows、hiddenSelected），已逐项核对并标false-positive，未加ignore或关闭规则；三条该组件block-style提示中一条对应本次新guard，其余既有提示保留，不宣称全仓clean。

## 后继素材占用格预览

草稿GET的 `materialPlacement.materials` 增加只读 `offsets`，直接调用共同 `componentCells(source,{definitionRef,x:0,y:0})`，因此包含真实footprint减anchor的偏移，不按cellCount猜矩形，不从贴图推断规则。各variant仍共用定义的footprint，与现有放置writer一致。控制器在响应边界核数量与素材cellCount一致、二维规范安全整数、唯一／无洞并复制；旧DTO缺offsets保持原行为、仅预览未知，已提供而损坏则整次读取拒绝。

素材／变体／水域类别明确且装饰解锁后，检查格上叠加SVG占用格预览；它跟随检查格，不是已保存图块，也不写保存画布、规则或草稿。该批次只画轮廓，后继已加入[独立实际贴图预览](editor-material-picker.md#后继素材落点实际贴图预览)，不改变此处占用范围及保存门。偏移含负值，按已读窗口坐标显示；非等比CSS及缩放使用同一显示矩形，窗口外部分明确计数但不画。超出固定地图以红色及格数提示，禁止取用该落点，不裁切或扩图；手填X／Y的保存按钮也按已知完整占用范围禁用，最终仍由服务共同writer核验。锁定／修订失效清预览，仍须独立确认和原键保存／精确重读。

复用既有控制器、工作台和真实保存入口，无新增探针。证据前缀 `.dragon-analysis/editor-completion/placement-footprint-`：

- `controller.log` 两控制器145项通过；在原DTO测试中补正常offsets、响应／显示副本无别名、缺失兼容及空／稀疏／非数／重复／错数量拒绝，不新建平行保存机制。
- `workbench-r2.log` 126项通过，产物 `.dragon-analysis/editor-workbench/run-NHHgjS`；首轮 `workbench.log` 亦通过，r2补手填越界禁存／改回恢复的断言。现有API夹具提供三个含负偏移的格；非等比64×48画布下逐格位置与overlay尺寸准确，边缘越界拒取且不改表单，回到合法格后原取用／锁定／取消流程保持，全程不自动写。
- `real-r51.log` 16组通过：实际HTTPS／Node／文件SQLite／FileBucket／41来源／真实作者管理员登录／新Chromium。在已有材料保存链核真实offsets逐格显示及未越界，继续真实放置、丢响应原键恢复、精确重读和拆分／移除；12次保存，40源码SHA事后匹配，stderr空，无非预期错误／外网／正式IDB。收据／截图 `.dragon-analysis/editor-phase/template-browser-r51/receipt.json`／`template.png`。这是中立材料放置链，不冒完整副本新增投影的HTTP重验或任意形状／整个工作区认证。
- Vue build/check逐byte一致（JS465213B／CSS34976B）、shell65、五JS及TXT模块语法、diff通过。`verify_editor_template_root --placement-only` 的共同形状期望同步，但本批未执行该较长入口；不把旧Root成绩冒当前验证。无web/src／DDL改动，不重建原生束，不重复无影响规则／Trial／发布长链。上述已执行测试首轮通过。
- 八代码主动LSP按60秒／并发2检查：一份有既有flag warning，七份未确认（3超时、4push-only），TXT无服务；不称clean；两文档warning视图clean。mode=all缓存95文件为31项既有warning及1hint，没有通过清缓存或抑制规则取得结果；先前Vue缓存项不再显示不代表本批修复了它们。

## 后继素材落点拖动定位

窗口增加明确的“拖动素材落点（只填表单）”模式。只在已读窗口／图集就绪、素材／variant／水域类别明确、装饰解锁且实际占用偏移已知时可开始；继续复用共同坐标逆变换、已有footprint叠层及素材表单接收入口，不新增可写source或保存通道。

主指针左键拖动时按图格更新占用格预览，尚不改变表单；窗口内合法松手才填X／Y。越出固定地图的footprint不裁切，拖出窗口松手不钳到最后一格，也不修改表单。Esc、失焦、pointercancel／lostcapture、窗口／倍率／模式或放置资格／形状变化取消未完成定位。拖动模式为检查与提示区域保留固定高度，避免文字出现／消失推移正在定位的Canvas。仍需独立按“确认放置”走原journal、收据和精确重读；该批次尚非素材库HTML拖放（后继接线见下），也不是连续相机、边缘自动平移或运行准入。

复用已有两条浏览器验证，没有新探针。证据前缀 `.dragon-analysis/editor-completion/placement-drag-`：

- `workbench-r1.log` 首轮127项通过，产物 `.dragon-analysis/editor-workbench/run-6QhMEt`。API明确夹具，非等比64×48显示／三格负偏移下，窗口外松手、Esc、地图边缘越界均保原X；合法拖动期间不改表单，松手正确填382／255，类别、其它脏输入和请求数保持，反馈不推移Canvas。
- `real-r52.log` 首轮17组通过，实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实作者管理员登录／新Chromium。真实已读offsets随拖动显示，Esc保空表单；合法松手填坐标但不POST，随后沿原独立确认实际放置9→10及丢响应原键查询／精确读回，原拆分／移除链保持。12次保存、40源码SHA，stderr空、无非预期错误／外网／正式IDB。收据／截图 `.dragon-analysis/editor-phase/template-browser-r52/receipt.json`／`template.png`；本轮实际拖动在已有1×1窗口定位，不冒整图或任意形状浏览器认证。
- Vue build／check逐byte一致、shell65、两测试语法及diff通过。三代码主动LSP按60秒／并发2仍未确认（2超时／1push-only），不称clean；两文档warning视图clean，mode=all缓存95文件仍31项既有warning及1hint，未屏蔽。无控制器／服务／web/src／DDL变化，不重建原生束或重复无影响Root、规则、Trial／发布长链。

## 后继素材库拖放到图块窗口

已读素材行增加原生HTML拖放入口，仅当前明确选择的素材／variant／水域类别、已知实际offsets、已读窗口／图集及装饰解锁时可用。不自动选变体或水陆。MaterialsPanel在dragstart提供本次选择及窗口身份的临时字符串，MapPanel只转交此显示状态；窗口只接受本地仍有效的拖动及完全相同的DataTransfer值，不解析外来内容，不把字符串当服务权限或可写源。

拖动经过窗口复用实际占用格预览及坐标逆变换；合法drop只填原表单X／Y，不改其它输入、不POST，随后仍独立确认保存、原键恢复和精确重读。窗口／选择／资格变化、取消及dragend清临时状态；越界footprint不裁切或改表单。检查模式也能接收库拖放，不要求切到指针定位模式。为避免原生dragstart改变源／目标位置，素材放置资格就绪时即预留检查与反馈区域高度，而不是开始拖动才改变布局。

继续复用两条既有浏览器入口，未增加独立探针。证据前缀 `.dragon-analysis/editor-completion/library-drag-`：

- `workbench-r7.log` 最终128项通过，实际gateway／Vue但API明确夹具。非等比64×48／三格负偏移在检查模式下，完整越界拒取、合法drop填382／255、外来drop不改输入、锁定禁拖，类别／脏metadata与请求数保持。
- `real-r55.log` 最终18组通过，实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实作者管理员登录／全新Chromium。原材料链新增检查模式下真实库dragstart→窗口drop，仅填原选择的坐标，然后独立确认放置9→10、丢响应原键查询／精确读取及原拆分／移除；12次保存，40源码SHA，stderr空，无非预期错误／外网／正式IDB。收据／截图 `.dragon-analysis/editor-phase/template-browser-r55/receipt.json`／`template.png`。实际落点在已读1×1窗口，不冒整图工作区、任意语义变换或运行准入。
- `workbench-r1/r2/r3.log` 失败保留：直接dragTo在长页跨屏滚动时未产生原生drag事件（临时观察只见pointer），修为先在源位置移动启动原生拖动、再滚动目标，r4/r5通过；临时事件观察已从最终测试移除。r53也曾通过，但仅是当时源码及定位模式的中间证据。改测检查模式后r6在2400秒组合命令中超时且日志为空，后续r54未启动，均不计通过；修正上述布局变化后r7／r55通过。超时后只读检查该测试node进程数0，未杀未知进程。
- Vue build／check逐byte一致，shell65及测试语法／diff按变更检查；五代码主动LSP先60秒，再延至120秒／并发2，最终仍未确认（4超时／1push-only），不称clean。两文档warning视图clean，mode=all缓存95文件仍31项既有warning及1hint，未屏蔽；最终40项浏览器源码SHA事后复核一致。无控制器／服务／web/src／DDL变化，不重建原生束，也不重复无影响Root、规则、Trial／发布长链。

## 后继当前编辑层

依据产品Q60，互联网工作台新增四层选择，初始装饰层与既有本地studio一致。`draft.txt` 私有 `mapLayer` 是工作区状态，Vue只取得投影；不写source、修订、请求正文或journal，不改变显示mask和独立锁状态。换游戏清上下文／刷新后恢复默认；同游戏读取不自动换层。

基础格补底只允许基础层；装饰放置、平移、调序、拆分、移除只允许装饰层，同时遵守既有锁。控制器在进入、确认后及原键发送／重试处核验，不只是禁用按钮；错层可查询原结果，不能改键或重造正文。完整装饰框选及取用也须在装饰层，已有只读结果和表单输入不因换层被保存或改写。素材库和水域组资料管理保持原独立入口。道路／据点明确标为唯读，选择它们不新增编辑权或运行准入。

MaterialsPanel的既有放置资格同时受当前层控制，因此占用预览、画布取格、指针定位及库拖放共用此门；换回装饰层保留显式素材、变体、类别和坐标。基础格列表仍可跨层只读分页，只有补底输入／提交受当前层限制。没有引入第二份可写源或保存机制。

复用现有入口，证据前缀 `.dragon-analysis/editor-completion/current-layer-`：

- `controller-r3.log` 两控制器合146项通过；新增两profile错层五种实例写及补底零请求、投影改写不影响私有层、非法层值拒绝、锁／脏输入保持、错层原键重试拒绝及切回后精确原请求重试。r1旧覆盖145项通过；r2新增测试失败因完整副本夹具未按协议将人物定义／引用置null，修正夹具后通过，未放宽产品校验。
- `workbench-r2.log` 128项通过，产物 `.dragon-analysis/editor-workbench/run-m4g0Rr`，实际Vue但API明确夹具。覆盖独立解锁不等选择基础层、换层禁补底但保值／锁且无新请求，既有定位和拖放保持。r1失败因后续装饰框选场景仍停在基础层，测试明确切回装饰层后通过，产品不自动换层。
- `real-r56.log` 的 `--materials-only` 实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实登录／新Chromium19组、12保存通过：基础／道路／据点层禁装饰放置、库拖放及画布取用，坐标和锁保持；切回装饰后原实际放置、丢响应原键恢复、精确读回／拆分／移除链通过。
- `real-r57.log` 的 `--base-fill-only` 同设施9组、3保存通过：独立解锁仍须选基础层，切据点层禁提交且保输入，明确切回后补底保存；丢响应刷新恢复仅原键，重读后默认装饰层，须再次选择基础层才进行第二次补底，既有水组创建链保持。两轮stderr空、无非预期错误／外网／正式IDB。收据分别为 `.dragon-analysis/editor-phase/template-browser-r56/receipt.json`、`template-browser-r57/receipt.json`。
- `recheck.json`：r57的40项源码SHA均匹配；r56的39项匹配，唯一后改文件是同一测试脚本在基础分支添加“刷新后明确切基础层”的两行，产品及素材分支未变，不冒称r56脚本40项仍全同，也不为此重复无影响素材长链。
- Vue build／check逐byte一致，shell65、四测试JS及TXT模块语法、diff通过。六代码主动LSP先60秒再120秒／并发2，最终1份clean、5份未确认（2超时／3push-only），TXT无服务，不称全clean；两文档warning视图clean，mode=all缓存95文件仍31项既有warning及1hint，未屏蔽。仅控制器／Vue与相关测试变更，无服务、web/src或DDL更改，不重建原生束；Root基础只读集成测试已适配显式选层但未执行其长入口，未跑无影响规则、Trial／发布链。完整工作区和全功能目标仍未完成。

## 后继A09四层操作准入复核

本批核读当前 `MapPanel`／`MapWindowPanel`／`MaterialsPanel`／`BaseTerrainPanel` 和原生 `draft.txt`，没有新增平行工作区状态或猜测道路／据点写入。当前边界如下；“只读”不等于已经交付未来可编辑层的锁功能。

| 项目 | 当前出口 | 尚不能据此关闭的范围 |
| --- | --- | --- |
| 当前层 | 四选一；基础补底、五种装饰实例写入及原键重试均核所属层 | 道路／据点只读，不具备任意写入与解锁能力 |
| 基础锁 | 新编辑须显式解锁；保存后重新锁定 | 已确认原命令的原键重试按既有合同不再解锁，不能误当新编辑漏门 |
| 装饰锁 | 五种实例操作在确认前／后受门控；锁定后仍可查询原结果，重试须解锁 | 锁定不撤销已发请求，不锁独立素材库资料编辑 |
| 四层显隐 | 已保存修订的显示投影；不写源、不改变发布内容 | 显隐不是可玩地图校验，不得代替道路拓扑／据点迁移准入 |
| 画布操作 | 取格、放置及位移准备共用当前层／锁资格；须另行确认保存 | 任意语义组件、道路重连、据点移动和完整工作区仍未闭合 |

复用 `node tools/verify_editor_definition_controller.mjs`，当前完整入口80组通过，包含两profile的错层五写入、补底、投影不可反写、锁与脏输入独立、原键恢复等既有检查；未新增重复测试。I/O仅读取并data URL导入 `draft.txt`，API／确认／存储均为显式内存夹具，无网络、真实存档或数据库。证据 `.dragon-analysis/editor-completion/map-layer-contract-20261029/{tests-r1.log,before.json,after.json}`，6项选定源码SHA前后相同；本批无产品修改、无新浏览器／后端权限／像素证书。既有浏览器收据仅作定位，未冒充本轮执行。A09仍未完成；后续应推进语义工具或道路／据点原证门，而非重复建设已存在的层选择与装饰锁。

## 后继画布检查格接入补底选择

MapWindowPanel新增显式“追加检查格至补底选取并定位列表”入口，仅精确已读窗口／图集、基础层当前选中且已解锁时可用。MapPanel转交格索引与游戏／修订／sourceDigest，BaseTerrainPanel再核当前上下文，追加到原本地选择并切换已有列表页；重复取格不重复追加，原页外选择保持。只传索引，不传合成图块或地理值，未知合成格也不猜底层；原数值输入、其它脏表单及source均不改。保存仍须作者明确填值、独立确认，沿原控制器、单journal和精确重读执行。该批次尚未接矩形选取（后继见下），仍不是画笔或新的运行准入。

复用原工作台与基础保存浏览器入口，无新探针。证据前缀 `.dragon-analysis/editor-completion/base-canvas-`：

- `workbench-r1.log` 首轮129项通过，产物 `.dragon-analysis/editor-workbench/run-zLXZWw`，API明确夹具。既有缩放画布的未知合成格对应夹具基础值20；错层／锁定禁用，显式取格跳到末页并保页外选择，重复取格去重，不自动填数值，之后手填255／3再取格也保持，metadata与请求数不变。
- `real-r58.log` 的 `--base-fill-only` 首轮10组、3保存通过。实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实登录／新Chromium，新增精确修订1×1窗口与春图集取格、锁及当前层门、追加／去重／定位原页且数值仍空；随后既有实际两格补底、提交丢响应／刷新仅原键查询与精确读回、第二次补底和水组创建链通过。无非预期错误／外网／正式IDB，stderr空；收据 `.dragon-analysis/editor-phase/template-browser-r58/receipt.json`，`recheck.json` 40项源码SHA事后均匹配。
- Vue build／check逐byte一致，shell65、两测试语法及diff通过。五代码主动LSP先60秒，再120秒／并发2，最终均push-only未确认，不称clean；两文档warning视图clean，mode=all缓存95文件仍31项既有warning及1hint，未屏蔽。CodeGraph导航曾超时，转读明确文件，未解锁或重建索引。没有控制器、服务、web/src或DDL改动，不重建原生束、不重复无影响Root／规则／Trial／发布或素材保存长链。

## 后继基础格矩形选择

新增基础层框选模式，仅基础层当前选中、已解锁且精确窗口／图集就绪时可开始。复用既有指针捕获、屏幕至图格换算及窗口内限制；反向拖曳同样按完整格包含端点。拖动及松手只预览范围，不调用装饰框选API、不改变补底表单。显式追加后按行序合并到原选择，保页外格并去重、定位范围首格列表页；单格取用也复用同一接线，不填图块／地理值，不自动保存。

Esc清除进行中拖曳或未取用范围，不撤销原表单选择；失焦取消进行中拖曳。换窗口、修订、身份、模式、倍率或基础层资格失效清除临时范围。锁回基础层后重新解锁不复活旧框选。显隐不改基础格数据；仍非画笔、跨窗口连续拖框、边缘自动平移或运行准入。

证据前缀 `.dragon-analysis/editor-completion/base-rectangle-`，仍复用现有入口：

- `workbench-r2.log` 130项通过，产物 `.dragon-analysis/editor-workbench/run-vIwYCT`，API明确夹具。4倍显示下反向拖取两格，Esc无取用，松手仅显示范围；显式追加与重复去重、保页外格／手填255与3／metadata，锁定清范围且解锁不恢复，无新请求。r1在后续装饰框选检查未出现框线而失败；测试在操作基础表单后显式将画布滚入视口再发送指针，r2通过，未放宽产品守卫。
- 最终 `real-r60.log` 的 `--base-fill-only` 11组、3保存通过。实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实登录／新Chromium，使用固定源未入水组的未知基础格作2×2窗口反向框选；先保原单格选取，显式追加后按行序去重成四格，再追加另一页未知格。五格20／0补底真实提交丢响应、刷新原键查询／精确读3、旧2不变；第二次单格255／3及水组创建仍通过。无非预期错误／外网／正式IDB，stderr空；收据 `.dragon-analysis/editor-phase/template-browser-r60/receipt.json`，`recheck-r60.json` 的40项源码SHA全部匹配。此前r59的2×1／三格版本亦通过，最终只扩既有场景为二维完整矩形核跨行索引，不冒旧脚本SHA为新证据，产品未再改动。
- Vue build／check逐byte一致、shell65、两测试语法及diff通过。五代码主动LSP120秒／并发2均push-only未确认，最终脚本再查仍未确认；两文档warning视图clean，mode=all缓存95文件仍31项既有warning及1hint，未屏蔽。审查图未包含工作台测试文件，不宣称其自动依赖级联覆盖。一次编辑调用的多余no-op因匹配不唯一被拒，其余有效变更已应用并核对，未重放已应用编辑。没有控制器、服务、web/src或DDL改动，不重建原生束或扩独立测试；未重复无影响Root、规则、Trial／发布、素材保存长链。

## 后继固定域整图显示与本地窗口导航

新增只读 `GET /api/games/:id/draft/map-scene?revision=…&layers=四位掩码`。`readMapScene` 固定384×256，与原32格窗口入口共用私有投影核心、精确快照／顺序历史核验和共同显示合成器；原窗口限额不变，整图入口不接受坐标或任意尺寸。全部98304格保留null及显隐结果，始终display-only，不生成第二份可写source，不放宽道路、初始化、扩边或Trial／发布准入。

界面增加“读取整图供本地导航”，初始窗口仍取作者明确输入的合法矩形。原生控制器校验完整范围、格值、四层及身份后私有保存整图，仅向Vue投影当前不超过32×32的窗口。一步导航／松手拖动在该准确修订内切片，不重请求、不重合成或读取新revision；改变显隐才重新读整图。显式重读普通窗口退出此模式；保存、重读、身份及上下文切换清理缓存。图集继续独立精确绑定；不是完整相机、连续拖动或边缘自动平移。

复用既有入口，证据前缀 `.dragon-analysis/editor-completion/map-workspace-`：

- `controller-r1.log` 两控制器149项通过（新增2项），核明确已读1不跟输入999、完整数据／当前窗口无别名、本地跨行和边界导航零请求、null保持、显隐重取、普通窗口与身份失效清缓存，以及残缺／非法格值／错误源／掩码拒绝而不安装部分缓存。
- `workbench-r1.log` 136项通过，产物 `.dragon-analysis/editor-workbench/run-f0pbQk`，原工作台API夹具回归；新功能的实际按钮及HTTP在下一项验证，不冒此轮夹具新增整图场景。
- 最终 `real-r65.log` 的 `--map-window-only` 16组通过：实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实作者登录／新Chromium，整图98304格与固定源共同显示投影逐值一致；同修订左右导航无新请求，冬季Canvas与既有图块行流逐像素一致，显隐仅重取整图，管理员跨作者404、缺参／附加坐标及扩大旧窗口均422。保留原四季、框选、一次实际移除保存及精确重读链，无正式IDB／非预期错误／外网，stderr空。收据 `.dragon-analysis/editor-phase/template-browser-r65/receipt.json`，`recheck-r65.json` 40源码SHA全部匹配。此轮是中立模板，不冒新增完整副本浏览器证据。
- r63在新负控中误用无会话的辅助call，实际401而非预期422，保留失败；改用已登录浏览器请求后r64通过。初版布尔模式参数新增lint警告，已拆分窗口／整图公开入口并复用投影核心，未抑制；r65为最终服务源码复验，r64不冒最终SHA。
- Vue build／check逐byte一致，shell65、四JS及TXT模块语法通过。支持文件主动LSP等待120秒，最终五代码均push-only未确认，TXT无服务；不称clean。两文档主动warning视图clean；mode=all缓存102文件当前显示32项warning（上一轮37项／1hint），未抑制，不把缓存数下降当成既有问题修复。CodeGraph本批导航超时，转读明确文件，未解锁或重建。无web/src／DDL修改，不重建原生束；未重跑无影响Root、规则、Trial／发布或素材保存长链。

## 后继装饰实例锚点定位

完整实例列表新增“定位锚点”。原生控制器按私有已读实例身份查锚点，复用窗口导航将其置于窗口中部，靠边时仍让整个窗口留在固定域内；成功后仅滚动画布。必须已有同修订窗口，不从未读坐标／修订输入取目标；整图已读时只本地切片，否则沿原精确窗口GET。保留季节和显隐，不自动读图集、不改实例位置、勾选、筛选、其它表单或source。装饰锁和当前编辑层不限制此只读导航，保存／身份未确认仍不能定位。

证据前缀 `.dragon-analysis/editor-completion/instance-locate-`，未新增独立测试入口：

- `controller-r2.log` 两控制器150项通过（新增1项）：私有实例不受外部DTO／投影改写影响、靠边与原点定位、装饰锁／据点当前层不拦只读导航、已读1不跟输入999、本地零请求／无确认／无journal、无窗口或未知ID拒绝、原HTTP导航及身份失效后的迟到结果不滚动画布。r1真实复现新代码缺陷：定位外层ticket被内部窗口读取推进generation，自身失效，HTTP成功却未滚动；已去掉重复票据，复用读取本身的身份／代次门，并在返回后核原loaded对象与当前合法窗口，r2通过。
- `workbench-r1.log` 原136项通过，产物 `.dragon-analysis/editor-workbench/run-pOgCYb`，API夹具回归；新增按钮真实链在下一项，不冒夹具权限证书。
- `real-r66.log` 的 `--map-window-only` 17组通过：实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实登录／新Chromium；读取整图、隐藏基础层后，从已读实例行定位并滚入视口，当前层为据点且装饰锁定仍可定位。冬季／隐藏基础层的Canvas与固定源共同显示及图块行流逐像素一致，定位零GET／POST，勾选、筛选、位移、metadata及输入999保留。原四季、整图、装饰框选及一次实际移除保存／精确读回保持；无正式IDB／非预期错误／外网，stderr空。收据 `.dragon-analysis/editor-phase/template-browser-r66/receipt.json`，`recheck-r66.json` 40项源码SHA全部匹配；不冒新增完整副本浏览器证据。
- Vue build／check逐byte一致，shell65、两测试及TXT模块语法／diff通过。三代码主动LSP120秒／并发2均push-only未确认，TXT无服务，不称clean。两文档主动warning视图clean；mode=all缓存102文件仍32项既有warning，未屏蔽。无服务、web/src或DDL改动，不重建原生束；未跑无影响Root、规则、Trial／发布或素材保存长链。完整相机、连续边缘平移、实体和运行准入仍未完成。

## 后继小地图定位已读窗口

`WaterGroupsPanel.vue` 将既有静态小地图用于只读定位，直接复用共同 `minimapTransform`：固定384×256、16px格在250×167框中等比完整显示，原生Canvas仍保留原250×167像素，CSS只按实际地图矩形呈现；留边不能导航。视口框是独立SVG，不烘焙进背景。左键按浏览器实际坐标转换到格，右键无导航；无同修订小地图／窗口、保存待确认或身份失效时不可用。不用缩图颜色推回地图规则。

`draft.txt` 新增 `locateMinimapCell`，从私有已读小地图与窗口核对资格、验证固定域整数落点；与实例定位共用只读窗口定位函数。整图已读则本地切片，否则复用原精确窗口GET，返回后仍核原loaded对象及当前窗口，再滚动画布。保季节／显隐、当前编辑层、装饰锁、选择和脏表单；不自动读图集、不保存、不改journal、source或运行准入。小地图显示的是已保存静态摘要，不随工作区隐藏层改写。

证据前缀 `.dragon-analysis/editor-completion/minimap-navigation-`，只扩既有入口：

- `controller-r1.log` 两控制器151项通过（新增1项），核缺预览／窗口拒绝、同修订本地定位零请求、靠边窗口不越界、非法坐标拒绝、已读1不跟输入999、锁／当前层／脏输入保持、无确认／journal、原HTTP路径及身份失效晚返回不滚动画布。原实例定位测试保持。
- `workbench-r1.log` 原138项通过，产物 `.dragon-analysis/editor-workbench/run-zUvkPt`；这是原工作台API夹具回归，新导航实际链见下一项。
- `real-r69.log` 的 `--map-window-only` 18组通过：实际HTTPS／Node／自有SQLite／FileBucket／41固定来源／真实登录／新Chromium。明确读修订2小地图后，留边／右键不定位，左键在已读整图上定位且无新增GET／POST；当前据点层和装饰锁不阻只读导航，原选择／位移／metadata／输入999保留。冬季／隐藏基础层窗口与固定源图块行流逐像素相同，SVG范围与共同投影一致，小地图原生Canvas编码字节保持。原四季、整图、装饰框选及一次实际移除保存／精确重读链继续通过；无正式IDB／非预期错误／外网，stderr空。
- 收据 `.dragon-analysis/editor-phase/template-browser-r69/receipt.json`、截图 `template.png`；`recheck-r69.json` 列明40源码SHA事后全部匹配。r68保留失败：测试把请求的CSS点击偏移写死成图格153,153，实际浏览器报告坐标映射为153,152；r69在测试侧捕获真实click坐标，独立按等比矩形算期望，再核实际图块和视口框。没有放宽产品坐标门或改成模糊邻格断言。
- Vue build／check逐byte一致、shell65、两测试及TXT模块语法／diff通过。三代码主动LSP120秒未确认，延长180秒后仍1超时／2push-only；TXT无服务，不称clean。三文档主动warning视图clean；mode=all缓存102文件仍32项既有warning，未屏蔽。无服务／web/src／DDL改动，不重建原生束；未跑无影响Root、规则、Trial／发布或素材保存长链。此批未新增完整副本浏览器证明，不关闭完整工作区或编辑器目标。

## 后继整图缓存的连续拖动预览

前述窗口拖动／整图缓存批次仅在松手时切换窗口；本次为**已经明确读入整图和同修订图集**的模式补连续像素预览。沿原图格位移换算与边界钳位，每动画帧至多重绘一次当前窗口大小的像素。原生控制器复用同一绘制函数，未知格仍为棋盘；只读取私有scene／atlas，不GET、不重新合成地图，也不逐帧发布整份素材／实体表单模型。没有新增缓存框架或性能探针，不据此宣称帧率认证。

拖动期间确认窗口的上下文、小地图框、选择与表单保持原值；提示另列正在预览的位置。松手仍只调用原 `mapWindowPan` 确定位置，再按原模型投影更新；Esc／失焦／取消手势恢复已确定窗口的像素并撤销待执行帧。身份／修订／图集资格失效仍走原取消和清理。尚未读整图时保留原松手GET流程，不偷偷下载整图。该功能不是边缘自动平移、跨窗口连续框选、地图写入或运行准入。

证据前缀 `.dragon-analysis/editor-completion/continuous-pan-`，只扩原有入口：

- `controllers.log` 两控制器153项通过（新1组）：私有缓存预览、未知棋盘／原位恢复／边界、非法位移、完整模型对象及值保持、零请求／journal、显式确定位置保修订999和脏名称、普通窗口不预览、身份退出清理。原256图块逐像素与共同图块行流对照继续通过。
- `workbench-r1.log` 新Chromium143项通过，产物 `.dragon-analysis/editor-workbench/run-YQyVj1/`。明确API夹具提供整图和两种颜色图块；200%显示下按住拖动即出现目标RGBA，确认坐标未变；Esc／失焦恢复原RGBA，松手确定新坐标。请求数、原框选、输入999保持；原未缓存导航及取消链保留。是真实gateway／Vue／Canvas，非新实际后端或完整副本认证。
- Vue build/check逐byte一致、shell65、两JS及TXT模块语法、diff通过。本批执行测试首轮通过；无服务／web/src／DDL变化，不重建原生束，不重复无影响的Root、实际编辑保存、规则／Trial／发布长链。三代码主动LSP180秒为2超时／1push-only，延长240秒后均push-only未确认；TXT无服务，不称clean。两文档主动warning视图clean；mode=all缓存106文件仍31项既有warning，未屏蔽。

## 后继窗口内Ctrl滚轮锚点缩放

`MapWindowPanel.vue` 在已有七档显示倍率上接Ctrl＋滚轮，一次向相邻档调整并保持1/16至4倍界限；普通滚轮保留浏览器默认滚动。只在窗口／图集已就绪时操作，沿原倍率切换取消临时拖曳、检查和未取用基础矩形，不清已确认集合或表单。

以事件发生时的实际Canvas DOM矩形记录鼠标相对位置，CSS倍率生效后调整本滚动容器的scrollLeft／scrollTop；浏览器按真实可滚动范围夹取。锚点受当前窗口显示边界和滚动取整限制，不是扩图、改变已读矩形或读取其它地图。等待布局返回后仍核原Canvas、窗口身份和目标倍率，失效不操作新画面。backing Canvas、RGBA、来源、保存修订与所有业务请求保持；没有新增相机缓存、计时器或自动边缘平移。

复用既有工作台验证，证据前缀 `.dragon-analysis/editor-completion/anchored-zoom-`：

- `workbench-r1.log` 新Chromium144项通过（原143＋1），产物 `.dragon-analysis/editor-workbench/run-qCclkX/`。在明确API夹具的同修订窗口中设置有滚动余量的容器，实际Ctrl滚轮从200%到400%，按真实DOM矩形核鼠标所指backing位置误差不超过一CSS像素；到上界不再改变，反向返回200%，普通滚轮不改变倍率。原Canvas编码字节、框选结果、输入999与请求计数保持；旧拖动／取消／保存交互回归仍过。是真实gateway／Vue／浏览器输入，不冒实际后端权限或完整相机认证。
- Vue build/check逐byte一致、shell65、测试语法及diff通过。本批执行测试首轮通过；两代码主动LSP240秒均push-only未确认，不称clean；两文档主动warning视图clean，mode=all缓存106文件仍31项既有warning，未屏蔽。
- 只有Vue组件、既有浏览器测试及生成壳变化，无原生控制器／服务／web/src／DDL改动；不重建原生束，不重复无影响控制器、Root、实际保存、规则／Trial／发布长链。完整边缘拖动、工作区与完整编辑器仍未完成。

## 后继窗口尺寸与页面隐藏取消手势

推进边缘平移前核对现有取消合同，发现互联网 `MapWindowPanel.vue` 的resize／visibilitychange只关闭工具菜单，未取消正在进行的拖曳。实际浏览器负控复现：整图缓存从已确定窗口(382,255)预览到(380,255)，改变视口尺寸后松手仍提交旧手势，像素为101／112／123而非已确定窗口的44／55／66。

现将这两个生命周期事件接到既有 `cancelDrag`，与失焦共用撤销待执行RAF、恢复已确定窗口像素、清理临时拖曳／素材库拖放状态和释放所属pointer capture；卸载时对称解绑。没有新增计时器、全局输入状态或来源写入；已确认窗口、累计选取、素材参数及未读修订输入不变。恢复可见不会重放旧手势，须重新开始输入。

复用 `verify_editor_workbench_browser.mjs` 原本地连续拖动用例，增加真实 `setViewportSize` 取消及显式注入的hidden／visibilitychange取消；后者不是原生后台标签行为证明。`.dragon-analysis/editor-completion/map-lifecycle-before.log` 保留上述resize负控失败；修后 `map-lifecycle-after.log` 148组通过（原组内增两个生命周期分支），产物 `.dragon-analysis/editor-workbench/run-1v8dPY/`。取消后松手仍保持原窗口及像素；正常提交、原Esc／blur取消、未读999、完整装饰累计集合与窗口／Atlas／scene／选择／全部请求计数保持。使用全新profile与现有gateway／Vue，API为明确夹具，不冒真实后台保存／权限证据。

Vue build/check逐byte一致（JS505044B、CSS36725B、8包许可）、shell65通过；两代码主动LSP等待300秒仍一项timeout、一项push-only未确认。仅组件、既有测试和生成后台壳变化，不重建未变原生束，不重跑无关规则／实际保存／Trial／发布长链。此修复只关闭取消缺口，该批尚未实现互联网素材拖放／框选的边缘自动平移；后继素材落点指针拖曳见下节。均不解除G-CAP或任何运行门。

## 后继素材落点拖曳边缘平移

互联网 `MapWindowPanel.vue` 的“拖动素材落点”模式接通已读整图缓存的边缘自动平移。仅在同修订窗口／Atlas、明确素材／变体／水域选项、占用格资料和装饰层解锁均满足时工作；未读整图不自动下载，不变更HTTP窗口模式的松手行为。复用共同 `edgePanDelta` 的32屏幕像素边缘带（小视口至多四分之一）、最大640屏幕像素／秒及单帧最多50ms预算，按实际Canvas比例换算图格；不消费规则clock／RNG。

相机偏移只在本次手势内累积，以整数图格调用原 `previewMapWindowPan`；不逐帧修改已确定窗口或投影整份素材模型。边缘按Canvas、滚动容器内容框及浏览器视口的可见交集计算，离开可见区域停止平移；固定384×256域限制整个窗口，四边都不扩图。画布反变换、SVG占用轮廓和素材贴图用同一临时窗口原点；贴图只向既有私有绘制入口传显示偏移，不改素材真实落点或配方。临时切片不伪装成已确认图格检查。

合法松手只将真实世界坐标填入原放置表单，再由原本地 `mapWindowPan` 确定窗口位置，仍须另按确认放置才保存。越界footprint、在可见区外松手、Esc、失焦、resize、隐藏、窗口／身份／资格改变等取消沿原入口撤销RAF并还原已确定窗口；不补读、不改journal、其它表单或源。返回中心不继续自动平移；重新进入边缘可继续本次定位。

证据前缀 `.dragon-analysis/editor-completion/material-edge-`：

- `browser-r4.log` 156组通过（原148＋8），新Chromium产物 `.dragon-analysis/editor-workbench/run-6ZBK9x/`。真实指针同时向左／上平移后回中心，核对轮廓与贴图像素、临时窗口不提前提交、合法松手的X／Y与窗口一致；Esc、实际resize、注入hidden提示、窗口外松手不改表单。两角边界不越域、不裁切footprint；额外64px滚动容器中向右平移后，在“Canvas矩形内但滚动容器外”松手还原原像素并拒绝取用。所有新增手势各自核零新增API请求、水域选项与未读999保持。API明确夹具，不冒真实保存／权限／Trial证据，hidden仍是合成生命周期提示。
- 首轮 `browser-r1.log` 等待预览超时，保留为失败；`browser-r2.log` 加临时DOM观察后153组通过，不能因此忽略首轮。代码审查发现pointer事件的 `performance.now()` 可能晚于当帧RAF时间戳，使首步预算归零后停止；改为首次RAF内部建立时间基准，撤去临时观察。未记录失败帧时间戳，故不将该时序解释冒称已捕获的唯一根因。后继r3和最终r4通过，旧轮不替代最终源码证据。
- Vue build/check逐byte一致（JS508989B、CSS36725B、8包许可），shell65、测试语法与diff检查通过。两代码主动LSP300秒仍一timeout／一push-only未确认，不称clean。

仅组件、既有浏览器测试和生成后台壳变化，无原生控制器／服务／web/src／DDL变更；不重建不变原生束，不重复无影响实际保存／规则／Trial／发布长链。该批尚未接素材库HTML拖放、跨窗口框选及移动实例的边缘平移；后继HTML拖放见下节。本节只交付素材落点指针手势，不将A09、Q39扩边或完整编辑器标为完成。

## 后继素材库HTML拖放边缘平移

素材库现有拖放按钮接入同一临时窗口原点、`edgePanDelta`、原生像素预览和合法落点取用流程；不新增导航／保存API，也不自动读取整图。HTML手势只持有本次素材拖放令牌与窗口身份，不申请pointer capture；逐帧回核当前令牌、窗口及放置资格。占用轮廓、贴图和实际提交的世界坐标使用同一偏移，完整footprint仍决定能否取用，不裁切保存。

Canvas的dragleave撤销临时帧并恢复已确定窗口，但保留仍在进行的原生拖放令牌；重入后从已确定窗口重新预览，不能沿用离开前的偏移。原生dragend令牌清理、Esc、resize／隐藏／失焦及身份或资格改变仍完整取消。合法drop必须匹配原令牌，先核取用落点，再还原临时状态并按原本地导航确定新窗口；错令牌drop既不写表单，也不提交预览。这些手势只改本地落点参数；地图源仍只有原显式保存入口能写。

复用既有工作台浏览器入口与原生HTML拖动起手，证据前缀 `.dragon-analysis/editor-completion/library-edge-`：

- `browser-r1.log` 首轮161组通过（原156＋5），全新Chromium产物 `.dragon-analysis/editor-workbench/run-g0Ml1k/`。新增实际鼠标HTML拖动到左上边缘再回中心，核世界坐标、轮廓与贴图像素；Esc、实际resize还原，合法drop取用新X／Y及窗口。拖出恢复原像素／表单，再实际重入后可正常drop。另在原生手势中注入错令牌drop，表单不变，再取消仍恢复原像素；这是显式负控，不冒另一真实登录会话。每组手势核零新增API请求、水域选项和未读999保持。
- 原未读整图HTML拖放、指针边缘平移、框选、锁定、取消及原键保存等现有用例仍过；API为明确夹具，不是当前真实后端保存／权限或Trial验收。
- build/check逐byte一致（JS510185B、CSS36725B、8包许可）、shell65、测试语法及diff通过。两代码主动LSP300秒仍一timeout／一push-only未确认，不能当clean。

只有Vue组件、既有测试和生成壳改变；无控制器、服务、web/src、规则或DDL变化，不重建不变原生束，不跑无影响真实保存／Trial／发布长链。该批跨窗口连续框选尚未接，后继见下节；移动实例边缘平移、完整工作区与扩边仍未完成，A09及完整goal状态不变。

## 后继跨窗口框选边缘平移

复核原控制器 `readDecorationSelection` 与服务 `PrivateDrafts.readDecorationSelection`：只读矩形允许整个384×256固定域，并非map-window的32×32显示限制；响应仍要求同修订身份、完整源实例及原绘制顺序。此批不改API、预算、权限或源，只将既有临时边缘预览接到装饰／基础格两种指针框选。

按下时记录世界起点和Shift模式，边缘导航后以同一临时原点换算终点及矩形显示。轮廓裁在Canvas表面，不因跨窗口矩形扩大页面可滚动区域；裁的是显示，不是选取集合。松手恢复原已确定窗口及像素：装饰只发送一次完整世界矩形查询（原Shift追加语义不变）；基础格保留完整待取用矩形，须再按追加按钮才加入原集合。该保守流程不将临时预览导航当成已确定窗口，也不串联第二个异步导航动作。Esc撤销整次预览，不改旧集合。仍仅已读整图支持连续边缘平移，不自动下载、不扩图、不填地形、不保存。

复用 `verify_editor_workbench_browser.mjs`，证据前缀 `.dragon-analysis/editor-completion/selection-edge-`：

- `browser-r2.log` 164组通过（161＋3），新Chromium产物 `.dragon-analysis/editor-workbench/run-KAnTZR/`。实际从(383,255)起框，自动向左跨过32格后回中心，核临时原点与轮廓一致；松手恢复原(382,255)窗口及像素。装饰仅一次查询、完整矩形和返回绘制序一致；Esc无查询并保原集合。基础格松手未改集合，显式取用才合并，重复取用不重计，保原页外格及255／3输入、未读999。帧间没有查询或写入。
- 首轮 `browser-r1.log` 的矩形／返回ID已通过，随后错误期望通用`calls`计数增加而失败；既有专属窗口夹具将GET记在`selectionReads`，修正该观察断言，产品代码未因失败改动。负控日志保留，不冒首轮通过。
- build/check逐byte一致（JS510930B、CSS36741B、8包许可）、shell65、语法／diff检查通过。两代码LSP300秒一timeout／一push-only未确认。API为明确夹具，真实服务仅本轮只读核对现有范围，不冒新的HTTP权限／保存证书。

只有Vue、既有工作台测试与生成壳变化，不重建未变原生束，不跑无影响控制器、实际保存／Trial／发布／规则长链。该批当时未含移动实例边缘平移，后继接线见[整批位移目标拖曳](editor-instance-library.md#后继整批位移目标拖曳)；完整地图工作区、扩边及完整编辑器仍未完成。

## 后继基础格已选页导航

`BaseTerrainPanel.vue` 增加“上一已選頁／下一已選頁”，从本地选格集合推导当前页前后最近含选格的页，不循环，也不改变原集合顺序。沿当前固定域每页24行的已读投影及既有 `basePage` 动作，只改变列表页；不复制完整源到Vue、不GET／POST、不改变图块／地理输入、手填页码或其它脏表单。基础层锁定仍允许只读定位，与原分页一致；原保存未确认或读权限失效时禁用。没有选格、相应方向无其它已选页、清空选取或成功重读后，相应按钮禁用。

复用工作台既有基础格场景，增加首格0及末格98303分散选择：从手填2048页定位到第一页和4096页，在锁定基础层时仍可检视并保选中；图块7／地理1、手填2048及其它脏名称保持。取消末页选格后不再跳往它，清空后两方向禁用；仍沿旧用例验证收据未确认时禁用、原补底保存正文与显式重读。新增流程的请求计数、基础读取与写入计数均不增加。

证据前缀 `.dragon-analysis/editor-completion/base-selected-navigation-`：build/check逐byte一致（JS563001B、CSS37664B、8包许可），shell65通过。`browser-r1.log` 在后续既有素材库原生拖放边缘平移等待处超时（工具1887行），失败产物 `run-IcUfYg/failure.json` 保留，原因未确认；未改代码、断言或屏蔽错误，原样复跑 `browser-r2.log` **216组通过**（215＋1），产物 `.dragon-analysis/editor-workbench/run-5aGcmM/result.json`，errors／unexpected／failed为空。新导航用例在全新Chromium／实际gateway／Vue中执行，业务API为明确夹具，不冒真实保存或性能全域认证。

语法、diff、链接及7个测试前后输入摘要核同；主动诊断与当前指纹见 `base-selected-navigation-final-hashes.json`。仅组件、既有测试、文档与后台生成壳变化；无原生控制器、服务、web/src、DDL或资源改动，不重建原生束，不跑无影响真实保存／Trial／发布／规则长链。A09与完整目标仍未完成。
