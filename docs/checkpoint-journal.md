# 检查点日志（checkpoint journal）

> 长期事实、架构、命令、约定维护在 [AGENTS.md](../AGENTS.md)，模块细则与原证维护在对应文档／SKILL；本页只留当前交接、批次进展、调试、失败、验证边界及决策背景。历史成绩不代表当前通过，旧待办不自动授权实施。已提交明细用 `git log -p -- docs/checkpoint-journal.md` 追溯；旧链接兼容入口见文末。

## 当前主线与状态

| 工作线 | 交接状态 |
| --- | --- |
| copy 收敛 | 元数据、章节、据点、武将库、发布审核已接 copy；地图／部分定义面板、旧 draft 控制器及表清理未整体收尾，见[任务清单](copy-simplification-tasks.md) |
| 编辑器展示 | 默认 Element Plus 迁移及分页基础已提交；武将加载／相册、固定列宽、头像资源和轻量目录见 §47–50，归入 §52 统一提交批次 |
| 共享头像 | 本地文件／资产 ID 已统一0..620，PNG字节不变；真实持久化 copy／publish／formal、旧冻结包及生产未检查／迁移，不承诺旧p引用兼容 |
| 验证缺口 | 合成API浏览器通过不等于真实源全流程；近期失败／超时见 §49–50。独立 Vue 检查可用，但宿主 push-only／timeout 仍有未确认 |
| 提交／生产 | 基础提交 `34bf1c1`／`df8b35a`（§46）；用户授权 §52 完整提交并推送 `github/main`，最终回执以 Git 为准。未部署或线上复核，现行运维见[存储布局 §18](game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产) |

## 52. 全量工作区审查与统一提交批次

- **授权／范围**：用户明确要求审查所有改动及未跟踪文件，保留产品代码、测试、迁移和必要文档，排除本地代理／运行产物，再commit并push。纳入§47–51；仓外 `E:/Dragon/AGENTS.md` 不属于本仓库提交。未授权部署、真实持久化迁移或改信任／权限。
- **文件审查**：985个原始路径为40份已修改文本、3份新增源码及471对画像重命名；逐份审查非生成diff及新源码，生成资源另核构建一致性／SHA，471对PNG与HEAD逐字节相同。核7份变更文档的606个本地链接／锚点，修复完成审计中一条既有失效锚点。保留产品所需壳及trial束，不误删既有运维代码／迁移工具。忽略的 `.pi/`、`.codegraph/`、运行目录、代理缓存、依赖、日志／截图均不入提交；未发现额外非忽略本地产物或tracked-but-ignored文件。
- **本批通过**：清单check／621张画像核验；trial束重建结果unchanged，UI build check同字节；30份JS/MJS／控制器与生成模块语法、diff检查通过。分页、轻量目录、武将／据点／副本页／章节控制器、加载、章节缺口及静态prepare合并75／75；runtime contract104、general definitions10组、general library12组、chapter people13组。首个日志包装器因Windows GBK无法打印测试勾号退出，测试本身75／75；改UTF-8读取收据后其余lane完整执行通过。
- **浏览器／Vue**：两份实际构建壳＋全新隔离Chromium回归通过；武将API为内存夹具、画像为真实PNG，覆盖目录缓存、25张分页、255／620保存重读、局部加载／真进度、尺寸／列宽／隐藏输入；另验11模块显隐及192据点，错误／意外请求0。独立Vue LS协议正控／纠正及30 SFC通过，仅ChaptersPanel既有TS6133 hint；宿主主动检查仍有push-only未确认、TXT不支持及生成文件超限，不称全仓clean。
- **保留缺口**：本批重跑 `verify_vps_publish_pack.mjs` 仍43过1失败（`stale draft visual capture refused`），255与缺失画像断言通过；不把失败改成通过。§49旧Trial超时／玩家harness缺检验票和§50两份旧入口失败未在本批重跑，真实源发布／玩家存档／生产未验收，不放宽门或重开410接口。
- **Git边界**：推送目标为 `github/main`，不用Gitea `origin`，不force；已核远端无本地缺失提交。本段随统一提交保存，提交SHA／远端回执以Git核对为准；不把push当部署、服务刷新或真实数据迁移。

## 51. project memory 与会话日志整理

- **范围**：用户要求精简 project memory／journal，只改仓库 `AGENTS.md` 和本页；保留既有UI、资源、服务、测试与仓外 `E:/Dragon/AGENTS.md`，不扩实现、迁移或部署。
- **整理**：核两级AGENTS、布局规范、轻量头像目录合同、画像资源维护源、copy清单、Vue工具说明及Git提交。memory保留长期边界／命令与当前主线；日志重点保留§47–50的根因、失败、文件及验证限制。删除重复构建字节／模块数、临时PID／截图路径、已撤销UI方案和过期生产快照，旧批次压为索引，不冒充新测试收据。
- **纠正状态**：Vue standalone工具已接入，不再沿用“所有Vue检查等待工具可用”的旧阻塞；宿主未确认仍保留。§48改名待确认已由§49批准实施取代。§38七失败是当时收据，不直接当当前结论；完整对应lane未在本轮重跑。
- **检查／失败修正**：首轮52个本地链接及仓内22个journal引用锚点通过；额外逐项比较旧兼容ID，发现手工压缩时漏抄一个连字符，已修复，不以“当前无人引用”删除入口。非本次两文档的tracked diff及未跟踪路径清单与整理前一致。两文档主动LSP均push-only未确认，不能称clean；session all仅既有ChaptersPanel TS6133 hint，并提示前轮4个源码路径未完整，不冒全仓通过。纯文档不跑无关构建、游戏／浏览器回归，不提交、推送或部署。

## 50. copy头像目录跳过无用旧草稿使用统计

- **授权／根因**：用户在首次加载路径说明后批准实施。静态链为 `#getPortraits → #portraitUsedKeys → games.listOwn → privateDrafts.read`，为copy弹窗未消费的 `inUse` 加载／校验整份旧草稿；生产耗时占比未测量，不宣称线上性能定位或SLA。
- **修改**：copy改用 `GET /api/games/:gameId/portraits?usage=0`，只返回完整资源描述、不带 `inUse`，不读旧草稿或PNG；精确参数白名单。无查询旧接口仍保留真实使用统计、失败传播、await后会话／删除栅栏复核，认证／强制改密／epoch与图片SHA门不变。目录缓存、25张分页、懒图、局部加载和保存流程不变；[合同维护源](editor-general-definitions.md#copy头像目录轻量读取现行)。
- **相关文件**：`server/editorapp.js`、`server/public/draft.txt`；新增 `tools/verify_editor_portrait_catalog.mjs`，调整 `verify_copy_generals_manage.mjs`／`verify_editor_generals_browser.mjs`；目录合同与布局规范。无Vue／web/src变更，不重复重建未变产物。
- **回归34／34通过**：`node --test --test-concurrency=1 tools/verify_editor_portrait_catalog.mjs tools/verify_copy_generals_manage.mjs tools/verify_copy_controller_generals.mjs tools/verify_editor_loading.mjs`。新入口用实际Request／会话／临时SQLite，旧草稿和图片端口为显式夹具；轻量621描述、两端口零读取，旧使用标记／503传播，以及坏查询、未登录、强制改密、epoch撤销、删除栅栏均覆盖。不是完整登录／TCP或真实源blob验证。
- **浏览器通过**：实际构建壳＋全新隔离Chromium＋真实621张PNG，API为内存夹具；断言精确 `?usage=0`、目录缓存、分页排序／未访问页不取图、错误重试、255／620保存重读及既有武将全流程。console／pageerror／requestfailed／意外请求均0。
- **额外失败未修**：`verify_editor_template_root.mjs --portrait-epoch-only` 在旧Trial路径期望422、实际410退出，后续长链未完成；不重开已退役接口。`verify_generals_conflict_model.mjs` 10过1失败，动作名清单漏既有 `adoptFor`；脚本及 `general.txt` 与HEAD相同、不依赖轻量路径，不删动作来改绿。
- **检查／交接**：构建check同字节、4份JS/MJS与控制器TXT语法、diff检查通过；主动LSP为push-only未确认，TXT无服务，session all另有既有提示／未完整项，不称clean。未访问真实SAVE／profile／生产，未重启他人实例；运行实例需由持有者重启加载服务／控制器新字节。

## 49. 共享头像文件及资产ID数字重编号

- **批准边界**：用户明确批准文件名与资产ID一起续编，并取消资源255特判；这是Web资源决定，不是DOS规则修改。不含真实持久化／生产迁移或部署。前会话AST写入范围被拒后停止相关收尾，以临时交接转仓库根会话完成；未改权限／信任，交接内容已回流并删临时文件。[资源决定／原证维护源](re-notes-portrait-reader.md#现行web准入与原证边界)。
- **资源／逻辑**：`p0001..p0471 → 150..620`（旧数字＋149），0..149不动；621张PNG逐项核SHA／长度／128×128及字节不变，清单数字升序、双向磁盘核验。收集／发布目录保留255并查真实SHA，坏类型／不存在ID仍拒。父表同步显式写 `portraitKey`；ID>255已有槽保留原byte、新槽沿既定空槽0，不截断／取模。保留引擎缺口报告用共享目录，Trial HTTP仍410；不改其它FF字段、固定源或历史冻结身份。
- **相关文件**：`web/kao/*.png`／`manifest.js`，新增 `tools/build_kao_manifest.mjs`；`server/{portraits,trials}.js`、`web/src/content/authoring/generaldefinitions.js`、画像库／runtime／人物／发布测试与 `fixtures/publish-runtime-stage.mjs`；两级AGENTS、布局规范、画像原证维护源。生成清单／库核验固定重编号摘要，不重算旧pin。
- **调试修正**：临时比对正则过贪导致JSON解析失败，改逐对象匹配后全量通过；纠正不存在的测试命令。真实资源测试用150／151替旧p引用，合成夹具／冻结reader语法不盲改。静态发布夹具从当前manifest枚举画像，避免Git index尚留旧名导致ENOENT；其它tracked字节仍严格读取，不泛化忽略缺文件。旧定义夹具同步已批准的能力0..15、字／自杀默认值与姓名唯一，不新增规则。
- **实际通过**：清单check／621画像核验、runtime contract104、general library12组、general definitions10组、chapter people13组、reader77；copy武将／检验票／静态prepare合并23／23。覆盖真实0／150／255／256／620的父表→出场→byte／override→依赖→URL／JSON。章节缺口报告前段11／11，六文件补跑超时不能计整轮通过，后续人物及23项各自完整复跑通过。
- **浏览器通过**：实际壳＋真实PNG，API为隔离内存夹具；字符序目录→数字排序、25张分页／末页21、跨页选择／搜索、255／620确认保存重读、SHA及128px解码、相册尺寸／对齐／resize和原武将流程；错误／意外请求0。不是实际后端保存验收。
- **失败／未覆盖**：`verify_vps_publish_pack.mjs` 43过1失败（`stale draft visual capture refused`）；三类255实际prepare成功且保SHA／发布表零写，缺621仍拒。`verify_vps_trial.mjs` preflight13项通过，长链180秒超时。`verify_player_pack_compiled --environment --saves --portrait` 因旧harness缺现行检验票报409 `PUBLISH_VALIDATION_REQUIRED`，未到玩家装配／存档段；不放宽门来跑通。模板／旧Trial浏览器长链未重跑。
- **检查／阻塞**：trial束重建241文件、SHA `a8f61bbbfb56d8540a5c61fdc77e04fcbc4d62dc92441a5016d8b53d6a4dc01e`；UI check同字节，源码／TXT语法与diff通过。主动LSP有既有提示、CSS上游告警及大量push-only未确认，JSON往返误报已说明、不改成深克隆消警；session all仍有未完整项，不称clean。真实copy／publish／formal、旧p引用及生产桶未检查／迁移，后续需明确授权和实际验收。

## 48. 头像弹窗等尺寸加载、分页／按钮右对齐与数字排序

- `GeneralsPanel.vue` 预留宽 `min(900px,94vw)`、高 `min(800px,90vh)`；加载／错误／成功／筛选／末页不改变外框，仅网格内部滚动，分页与确定／取消整组右对齐，支持原生resize。目录完整数值排序后分页；细则只在[布局规范 §6](editor-ui-layout-spec.md#6-头像选择弹窗)维护。
- 当时调查发现仅改p文件名会破坏ID＋SHA／URL引用，且目标255撞旧资源特判、槽同步误把共享ID等同byte；先说明风险、暂停迁移。**此项已由§49用户批准与实际实施取代，不再待确认**。
- 实际构建壳／新Chromium／内存API：同尺寸、右边缘、三视口resize、数字排序及既有武将流程通过；build→check、语法／diff及独立30 SFC检查通过，仅既有ChaptersPanel TS6133 hint。宿主LSP超时／push-only未确认；未重复§47的50项控制器测试。未部署。

## 47. 武将管理加载性能、真实进度、固定列宽与局部头像加载

- **授权／根因**：用户批准四项优化及全编辑器列宽原则，后追加七列各增20px；不授权其它模块集中迁移。20章、每章128将／192城／22势力合成负载下，隐藏Draft／Chapters表单随busy／copy重读渲染，47867 DOM、重复加载约3904.6ms；按钮处理仅8.3ms。内部重型内容按active挂载、保留组件／控制器输入后，2499 DOM、完整回归约84.3ms；本机夹具观察，不是生产SLA。
- **反馈／布局**：动作及API增加global（默认）／local／progress；导入按64+64+2真批次进度，含最终重读，失败保留成功数；头像立即开窗、共用四圆点局部Loading、错误交所属面板，不叠全局。固定列读编辑同宽、控件限宽、数字框默认右控件；后续七列增宽后固定合计1420px、操作min180吸收余宽，表头文字与排序符同行。详规在[布局规范](editor-ui-layout-spec.md)。
- **相关文件**：`editor-ui/src/{DraftPanel,ChaptersPanel,GeneralsPanel,Workbench}.vue`、`main.js`，新增 `loading.js`；`server/public/{client,draft}.txt`、三份壳产物；共同加载／copy武将／武将浏览器回归及两级AGENTS／布局规范。
- **回归50／50通过**：分页、加载、据点／武将／副本页／章节控制器与内存SQLite；新增local／progress不污染全局计数、失败清理、完整批次和第二批失败保留64。实际壳／新Chromium／内存API：重复加载、局部居中／错误重试、真实导入进度、隐藏输入往返无丢失／无隐式保存、四视口列宽、1920宽屏无横滚／窄屏表内横滚及原保存／分页／相册通过；另跑11模块显隐＋192据点，错误／意外请求0。
- **检查／续调**：独立Vue LS30 SFC及TS2322正控／修正通过，只既有ChaptersPanel TS6133 hint；宿主LSP多超时／push-only、TXT无服务、生成JS超行数限制，不称clean。build→check、语法／diff通过。七列续调重跑完整武将浏览器／独立Vue检查／构建与语法，不冒领再次跑过50项控制器；无真实SAVE／profile／生产访问，未提交／部署。

## 已提交批次摘要

以下只保留交接原因与外部引用入口；详细测试数字／临时环境不重复搬入当前状态。§36–38归入 `34bf1c1`，§39–45归入 `df8b35a`；批次历史不代替当前验证。

## 46. 编辑器展示修补与 Vue 检查工具本地提交

- 用户授权本地commit，结果 `df8b35a`，含§39–45、共用分页／操作按钮、构建产物、测试、长期文档和项目Vue工具，未push／部署。提交前33／33、两份隔离浏览器及独立30 SFC检查通过；宿主LSP未确认仍保留。仓外 `E:/Dragon/AGENTS.md` 不在此仓库提交中。

## 45. 项目级 Vue LSP standalone 兼容工具（2026-11-12）

- 默认Vue LS3.3.14初始化后等 `tsserver/request` 的 `_vue:projectInfo`；本机pi-lens4.4.12未接对应桥，不能凭初始化成功或空缓存称检查通过。固定私有Vue LS2.2.12＋TS5.9.3、`vue.hybridMode:false` 走内部TS，不是把Vue3降到Vue2；Bundler解析消除深路径声明提示，不加any／关闭诊断。
- 文件为 `editor-ui/lsp/`、`.pi-lens.json`、`jsconfig.json`，安装／协议正控／完整30 SFC检查／回退见[工具说明](../editor-ui/lsp/README.md)。故意TS2322能报、修正能清，符号／标准push可用、桥请求0，仅ChaptersPanel既有TS6133 hint。
- 失败边界：仓库根新会话虽显示嵌套配置，实际仍default launcher、符号超时；从editor-ui启动新进程才实测override生效。宿主主动诊断仍有timeout／push-only，独立检查不冒领宿主全通过；未改全局配置／信任／权限，工具不进运行时产物。

## 44. 武将／据点统一分页与操作列、头像每页 25 张（2026-11-12）

- 新 `ListPagination.vue`／`ListRowActions.vue`／`pagination.js`，武将／据点固定表头、25／50／100与jumper、普通保存取消、非fixed操作列；头像25张／页，只挂当前页，支持resize。Teleport不继承父scoped属性曾使resize失效，改专用弹窗global布局选择器后真实拖动通过。两份永久实际壳浏览器回归覆盖分页／保存重读／显隐；加载分流以后继§47为准，不恢复全局遮罩旧合同。

## 43. 武将管理固定表头、行编辑与懒加载核查（2026-11-12）

- 给ElTable限定高度以实际内部滚动；修“空武将库不能导入”和空能力被ElInputNumber挂载补0，改用null且不发送未改字段。新增 `verify_editor_generals_browser.mjs`。当时fixed操作列／蓝色保存／一次挂621张已被§44撤销，不再保留旧验收数字。

## 42. 据点面板跨模块残留回归修复（2026-11-12）

- 局部 `display:flex` 在打包顺序中覆盖 `[hidden]`，导致据点占其它模块空间；改 `#stronghold-editor:not([hidden])`，不加important。新增 `verify_editor_panel_visibility_browser.mjs`：空态及192据点后遍历11模块，旧选择器负控失败、修复通过。早期单面板“隐藏再显示”未覆盖此缺陷，不能冒全模块通过。

## 41. 编辑器统一页中央四圆点加载动画（2026-11-12）

- Workbench唯一Loading入口＋共同API正文消费完毕后finally计数；新增 `verify_editor_loading.mjs` 覆盖并发／网络／HTTP／超时／坏JSON清理。统一四圆点保留，但头像／导入一律全局遮罩的旧设计被§47局部／真实进度取代。

## 40. 城池据点加载按钮旋转动画（2026-11-12）

- 历史按钮转圈／等待文字已被§41统一四圆点撤销，无现行实现待办。

## 39. 城池据点列表固定表头（2026-11-12）

- StrongholdPanel使用有高度约束的默认ElTable／局部flex，不造sticky皮肤。此批引入的跨模块残留已由§42修复，单面板测试不足的教训以§42为准。

## 38. 完整本地提交前审查：copy／发布审核／默认展示层与回归

- 本地提交 `34bf1c1`：copy发布审核、删除／purge、共享武将、默认展示及回归。审查修复 `approveSlot` 名称登记误用管理员而非作者、copy map漏存素材命令的componentDefinitions；新增8项先3红、修后全过。同步schema source／重复删除栅栏旧测试合同，退役lane原文保留 `tools/retired/`，未执行迁移／清库工具。
- 当时最终显式串行30文件为302项、295过7失败（definition-controller六个城池DTO及general-library库级删除／级联）。这是历史失败，不宣称全绿，也不直接断言今天仍同样失败；后续§49改了部分旧夹具。语法／build／check／链接／diff通过，主动LSP含大量未确认；真实源浏览器全链未完成。完整命令和输出查该提交日志，不在本轮重跑。

## 37. 前端架构决策：编辑器采用 Element Plus 默认主题与组件

- **tag**：`architecture`；**状态**：accepted，用户明确批准的长期Web产品决定，非原版机制。规则源为[全局约定 §2.3](../../AGENTS.md#23-渲染与状态原则)、[project memory §3](../AGENTS.md#3-展示交互与文档职责)，细则在[布局规范](editor-ui-layout-spec.md)。
- **背景／备选**：原来深绿自造主题、原生列表／弹窗、部分EP及玩家样式混用，反复修高度、表单与Teleport。保留全自造方案或“EP组件＋自定义皮肤”都继续承担覆盖维护、违背用户要求，未选。
- **选择／代价**：编辑器全部现有／新增页面统一EP默认主题／组件／控件／size，CSS只负责布局与资源内容；接受默认外观及组件DOM／事件适配成本，换取一致性和减少重复实现。不另加UI／图标依赖，不永久冻结依赖版本。
- **边界**：仅editor-ui展示层及其三份预构建资源，不改玩家／Trial Canvas、共同核心、业务／规则／二进制／存档，不为编辑器改玩家style.css。保留中文／选择器／状态机，阻塞流程不是一律可关；旧34px／原生table皮肤已撤销。选择获批不等于真实业务全链已验收。

## 36. Element Plus 默认主题与默认组件迁移（本轮）

- 27个Vue文件迁默认组件、main补组件CSS、theme仅布局、编辑器卸载玩家style link；保留文案／id／data-*／回调和业务。详细文件清单／原输出见[迁移交付记录](../editor-ui/element-plus-migration.md)，不复制整表。
- 调试：缺CSS致裸组件；check不写产物＋进程import／ESM缓存导致旧包；原生fieldset／reset不适配组件、事件传值非原生event、有效空字符串须排除empty-values、数组须CheckboxGroup；修展示合同，不加规则clamp。旧端口属他人，另起隔离实例，不停他人服务。
- 当时指定控制器114项108过6失败（城池DTO，改前baseline同红），武将15／15、章节／单槽／检验门12／12；build／check／语法／diff通过。真实服务验登录／资料保存重读；27面板合成预览只验展示／回调，不冒后端验收。Vue当时未确认，后续standalone进展见§45。
- 真实库曾报消费者指纹／登记错误；`--no-library`只能验空壳，复制报403 `SOURCE_NOT_REGISTERED`，未改身份／门来通过。真实已登记源的完整复制→编辑→发布／审核／删除仍缺验收，不假定该历史环境报错代表今日线上状态。

## 14. 批次 J：同意上架 422 SOURCE_RUNTIME_BINDING＋审核页重复提示（2026-11-11）

- copy批准引用无旧rootKey却走capture，实际包准备422；`runtimeassets.readShared`／`playpacks`改共享读取，保SHA／来源／新鲜度门。ReviewPanel移除重复提示。真实prepare链验证补足旧approve注入桩盲区；旧review浏览器mock不匹配copy接口，不算新链证据。

## 15. 批次 J-2：同意成功却无反馈＋上架管理仍待审核（2026-11-11）

- `review.txt`透传成功反馈；`gamecopy.approveSlot`同事务写 `listed=1`、受限拒绝，修复formal已写但玩家目录不可见。已提交；不把旧批未上线／待提交说法当当前待办。

## 34. 编辑副本简化收尾：删除重试打通＋冻结基线对齐＋上架章门恢复（2026-11-11）

- purge单事务兼容旧库、栅栏零写重试、如实残留回执；review结构化单弹窗、publish先查章引用，冻结声明／inventory同步。裸拷WAL、只check未build、回执只认修订+1曾造成误判，长期坑点已回流memory。[详情／相关文件](copy-simplification-tasks.md#7-2026-11-11-补记删除失败冻结基线对齐上架章门恢复)；真实清库未因此获授权。

## 35. 游戏级武将管理重写：父表库行编辑＋自杀旗＋头像相册（2026-11-11）

- 姓名唯一、只发变化字段、六能力0..15（旧1..15撤销）、自杀旗仅同步bit4；zi只存，原生称呼不导成字／号。首次466条导入约68KB触HTTPS16KiB／413，改64条／批、保成功前缀。精确DTO键集、合法portraitRef:null、await后才开相册曾致错误；现合同已回流memory／维护源，自造皮肤补丁不再留作修法。

## 归档索引与兼容锚点

已提交旧批查Git与维护源；无法恢复的旧收据见[缺口索引](historical-receipts.md)，不将索引当原证。以下保留旧链接，不复活旧合同／部署状态。旧文档中§4.x、§45–§47.4等裸数字可能属于更早日志编号，不能映射为本页同号批次。旧LRU性能原型因跳过blob／epoch校验造成回归已回退，不是已交付优化。

<!-- markdownlint-disable MD033 -->
<a id="5-当前时钟系统逆向与重构本地完成"></a>
<a id="8-用户指定五档提速"></a>
时钟／提速：[战略时序](re-notes-strategic-time.md)。

<a id="6-发布主线阻塞与下一步"></a>
旧发布阻塞已被后续批次替代，见本文「当前主线与状态」。

<a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a>
<a id="9-battle-text-reflow-1战术双方对白自动折行"></a>
<a id="10-014发布整理"></a>
<a id="10-录像反馈后的战略性能修复"></a>
<a id="10-录像反馈后的战略性能修复--10-014-发布整理"></a>
表现／对白／性能：[表现合同](presentation-modernization.md)、[战术生命周期](re-notes-tactical-lifecycle.md)。

<a id="11-015发布整理"></a>
<a id="11-编辑器vps部署前只读盘点"></a>
<a id="11-编辑器vps部署前只读盘点--11-015-发布整理"></a>
<a id="12-受限编辑器容器部署"></a>
<a id="13-固定库刷新与私有trial接续"></a>
<a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署／固定库／Trial：[VPS就绪历史](vps-editor-readiness.md)、[库身份／私有字节合同](editor-backend-private-byte-context.md)；生产以存储布局§18为入口，Trial已退役。

<a id="19-后台框架壳editor-ui-1"></a>
<a id="20-账户管理组件化editor-ui-2"></a>
<a id="21-草稿与章节组件化editor-ui-3"></a>
<a id="22-阶段任务与结构展示editor-ui-4"></a>
<a id="23-只读素材库组件化editor-ui-5"></a>
<a id="19–23-后台框架壳--账户管理--阶段任务--只读素材库--草稿与章节组件化"></a>
<a id="30-上架限制与删除追踪组件化editor-ui-12"></a>
<a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a>
<a id="33-后台迁移提交推送与受限上线"></a>
<a id="30-上架限制与删除追踪组件化--32-固定库身份合同授权修复--33-后台迁移提交推送与受限上线"></a>
早期Vue壳／上线：[框架壳合同](editor-framework-shell.md)、[迁移清单](editor-ui-migration-checklist.md)、[早期审计](editor-ui-final-audit.md)；默认组件后继见§36–37。
<!-- markdownlint-enable MD033 -->
