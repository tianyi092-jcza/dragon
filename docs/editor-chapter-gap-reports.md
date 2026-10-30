# 章节校验定位展示（限定）

本页维护 A18／A20 的校验展示及后继Q40、能力表示、公开势力槽身份检查和限定Trial资源诊断。初轮只投影既有诊断；后继空势力、单章范围和已证字宽拒绝门分别列于下，不以Web校验反证原版机制。

## 实现

- `server/chaptergapreport.js` 直接调用现有 `chapterSaveGaps`／`chapterActiveGaps`。保持原保存缺项及扣除保存缺项后的 active 数量；核验前缀一致性，不以另一套规则推算数量。
- 每类展示前100项，同时返回明确的省略数量。各项含原 `code`／`subject`、繁体说明及是否识别该诊断；未知类型显示待核查，不猜测通过条件。位置编号来自现有校验器的数组位置，不是跨章业务人物身份。
- `PrivateDrafts.read` 在原有权限、固定来源及精确修订验证之后附加 `gaps.details`，不写草稿或改变计数／准入。
- 资料控制器拒绝非法条目、数量不一致、负省略数及超长列表，保留原快照；投影和原回应不共享可变明细。旧回应没有明细时明确未知，不显示“无缺项”。
- `DraftPanel.vue` 展开“查看章節校驗定位”只显示已读取数据，不再发请求。Vue文字插值显示作者内容，不能作为HTML执行。页面明确：这里只是章字段校验；零缺项不代表资源、道路、原证或Trial／发布准入已经闭合。

## 本轮证据

- `node tools/verify_editor_chapter_gap_reports.mjs`：4组通过。包含空章、必填及引用定位、完整数量与省略数量、20个实际固定来源章节与旧计数函数完全一致；不是新机制证明或完整可玩初始化。
- `node tools/verify_editor_draft_controller.mjs`：36组通过；新增旧回应未知、投影／回应别名隔离、非法明细原子拒绝及身份清理。
- `npm --prefix editor-ui run build`／`run check`：通过，生成后台JS 311971字节；CSS33707字节、8个依赖声明保持一致。没有构建玩家／Trial程序。
- `node tools/verify_editor_workbench_browser.mjs`：70项通过；全新隔离Chromium、真实静态gateway／Vue、显式API夹具，展开无请求、原始位置文本转义、缺省明细未知、省略提示和准入警示有证。产物 `.dragon-analysis/editor-workbench/run-pLM8HF`。
- shell初次检查因旧字面接线断言仍要求 `chapterGapCounts` 而失败；定点更新为实际报告调用及原校验器接线后65项通过。实际计数等价由上面的20章测试验证，不以字符串检查代替。
- 日志：`.dragon-analysis/editor-completion/chapter-gap-{report,controller,build,workbench}.log`。语法及 `git diff --check` 通过。

主动LSP检查10个文件：2项确认clean、5项push-only未确认、1项TXT无服务；另有`drafts.js`既有布尔参数／嵌套三元warning及审计文档SHA片段词典提示。末次session全量缓存为8项既有warning、23项hint/info（78个会话覆盖文件），不称全仓无诊断。

上述初轮没有重新执行完整真实HTTP认证／后台保存重型链；工作台浏览器API为显式夹具。未提交、推送、部署、读取用户存档，未解除任何生产或运行准入门。完整 E-04／E-05／E-06 仍未完成。

## 后继Q40空势力与单章校验范围

依据[产品设计§4.5](game-editor-design.md#45-章节编辑)：章节须有有效势力才可开局；不完整草稿可以保存。`chapterActiveGaps` 现在对空势力数组给出 `chapter-factions`，`chapterSaveGaps` 不变；现有实体字段／引用校验继续执行。报告提供繁体说明。这只补最低空列表条件，不声称完整势力初始化、所有可选势力或资源准入已验证。

重跑本地单章服务时另发现 `projectTrialChapter` 在裁选前严格检查全部章节，使无关坏章阻止好章。现先对完整已保存源执行draft结构／保存门，再严格验证保留完整共享资料的所选投影；共享地图坏、非所选章保存门坏、所选章无势力仍拒绝。没有剪未活动槽、重写原生记录、补默认势力或绕开后续资源检查。全源发布校验仍严格覆盖全部章节。

- `chapter-factions-before.log` 先复现无势力缺口未报告；修后 `verify_editor_chapter_gap_reports.mjs` 5组通过（`chapter-factions-after-r2.log`），含固定20章、不改变保存门、无势力严格拒绝、好章投影／共享及保存门负控、源和所选state不变。
- 原固定来源profile整套通过（`chapter-factions-profile.log`）；shell65项通过。
- 首次 `verify_editor_chapter_trial_api.mjs` 在无关坏章场景返回400而失败（`chapter-factions-api.stderr`）；修复投影范围后 `chapter-factions-api-r2.log` 通过，保留原缓存／身份／资源对照并达到21项拒收。新增空势力章全源／单章均拒，另一个好章仍编译且六资产SHA等于原基线；完整草稿bytes不变。此为自有临时目录／loopback本地服务，无互联网认证或实际引擎浏览器证明。
- `verify_vps_trial.mjs` 原20项服务检查通过（`chapter-factions-vps-trial-r2.log`）。首次误用不存在的复数文件名未执行测试，失败日志保留，不记通过。
- 本地原生束重建231文件，第二次逐byte不变，SHA `57407941e01685f880235dc0e3fb40ef1c882d3d197aa9ace2ac9d685dd934f3`（`chapter-factions-bundle.log`）；没有改固定资源库身份、部署或解除运行门。

以上日志均在 `.dragon-analysis/editor-completion/`。没有重跑本节之前的r95浏览器重型链，不把其旧收据作为此次准入改动的验证。语法和diff检查通过；主动LSP八文件为两项clean、五项push-only未确认及审计文档SHA片段词典信息。末次session全量缓存81文件仍有8项既有warning、23项hint/info，未屏蔽或称全仓clean。

## 后继能力表示拒绝门

先行 `ability-gate-before.log` 复现：章节active门仅验有限数，攻城专长-1、武力256没有能力诊断。现按[原始字段字宽](editor-ability-import.md#可复核原证与边界)只拒绝不可能的表示：siege／field／naval须整数0..15，force／lead／politics须整数0..255。不截断／钳位，不把全byte误限为15或99；范围内数值不等于可玩域或作者写入授权。其它数值字段不顺带猜范围。`chapterSaveGaps`不变，安全且语义不完整的草稿仍走既有保存合同；新active缺口给出相同entity-field代码和明确繁体表示域／非准入提示。

`verify_editor_chapter_gap_reports.mjs` 7组通过（`ability-gate-after.log`）：六字段各8种非法值、上下界、诊断可识别／无修改；实际固定源武力256使全源／所选章严格校验拒绝，但不阻断另一个完整章投影；真实20章原计数保持。这里NaN／Infinity仅作内存校验负控，不声称可持久化这种JSON。原单章本地API21拒收及固定四范围编译检查通过（`ability-gate-trial-api.log`），完整副本20章固定输入profile回归通过（`ability-gate-profile.log`）。没有新增表单／API数值写入、初始化、G127或规则代码。

原生程序束重建并第二次逐byte不变，核全文件正文／长度／SHA及两壳不变；仅gamesource.js源条目变化。不改固定库登记、生产维护门或默认内容。不重复无关UI浏览器／完整Root矩阵，不把旧浏览器收据作新能力输入证明。语法及diff检查通过；全部日志在 `.dragon-analysis/editor-completion/`。主动LSP五路径在warning级4项clean、1项超时未确认；session全量116文件仍19项既有warning、23项hint/info，未屏蔽或称全部clean。

## 后继能力表示本地接口负控

`verify_editor_chapter_trial_api.mjs` 在自有临时目录／loopback服务中加入四个JSON可表示负控：武力-1／0.5／256、攻城专长16；每个均从完整原章克隆，仅改变一项能力和测试修订号。原空势力fixture改为克隆，避免破坏后续原章基线而让负控先因无势力误拒。不是新增作者任意源写入接口。

`ability-api-negative-r1.log` 通过29项拒收（旧21＋新8）：四个坏源分别使全源及所选坏章HTTP400，错误指向确切字段表示域，原稿bytes不变、没有钳位／修复；另一个完整章仍HTTP200，其六资产SHA等于原全章编译结果、pack章内容不变、捕获整个已保存源摘要。修订5..8的这些编译／读取不替换旧修订2的不可变pack，共8个scope身份。仅测试／文档变化，不重建束、不重跑未受影响的UI／Root重型矩阵；本地harness没有互联网鉴权或真实引擎浏览器证明，完整能力编辑／初始化／资源准入仍未完成。语法及diff通过；主动LSP两份文档在warning级clean、脚本push-only未确认，session全量116文件仍19项既有warning和23项hint/info，未屏蔽或称全部clean。

## 后继公开势力槽身份拒绝门

`chapterActiveGaps` 先前虽收集 `fids`，却不拒绝公开势力 `idx` 重复／缺失／非整数／越界。现按[固定槽合同§3.2](game-editor-technical-design.md#32-稳定身份不等于原运行槽)要求公开列表身份为唯一整数0..21，产生 `entity-count` 及繁体说明；不要求列表按槽排序或连续，不把隐藏22／23槽加入公开列表。唯一身份是Web结构合同，不是原版AI公式。`chapterSaveGaps`保持原样；这不授权现有保存API修改受保护槽，不补记录／默认值，不钳位、重排或删隐藏原生块。

可复核原证：固定 `KI.EXE` SHA `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`、MZ头0x200。`3E14` 从CS变量D1C取SI，`3E18` 以CS:D52切DS，`3E1D` 读该记录attr；`3E46/3E49` 调两例程后，`3E4C..3E55` 的字节 `83c64081fe8005720233f6` 为 `SI+=0x40; if(SI>=0x580) SI=0`，`3E57..3E5B` 恢复CS数据段并写D1C。该固定游标步进／回绕窗口实锤为22个40h槽的既有域，不推导被调例程新行为或空白势力初始化。`verify_entity_fields.py` 增加这一个精确签名，本轮86签名及原官方四章字段验证通过；未读取真实SAVE。

证据位于 `.dragon-analysis/editor-completion/faction-slot-gaps-*`：

- `before.log` 新负控先复现漏检；`after.log` 9组通过：11种非法槽值、重复ID、0／21／乱序合法身份，诊断可识别、保存缺项不变；20章固定输入没有新增此类缺口。实际副本重复槽使全源及所选章严格校验拒绝，另一个完整章仍可投影，原生槽raw及输入不改。NaN／Infinity只是内存负控，不宣称可保存这种JSON。
- `scope.log` 既有单章测试因旧期待“city/node mismatch”失败：当前编译器早已先执行共同active门，空state首先触发128将数量缺口，与新增势力循环无关。仅更新测试到确切现行拒绝，不改产品顺序；`scope-r2.log` 全20章／所选章编译等价、8项负控通过（新增重复／隐藏22公开槽）。
- `trial-api.log`／`.stderr` 自有临时目录＋loopback真实本地接口通过33项拒收（原29＋4）：修订9／10的隐藏22槽或重复槽分别使全源及坏章HTTP400，错误指向确切身份门；另一个完整章HTTP200，六资产SHA保持、章源和旧修订2的不可变pack不改。10个scope身份完整保留。无互联网鉴权／实际引擎浏览器／生产发布证明；stderr含预期请求状态及自有服务关闭日志。
- 原生束234文件重建并复建unchanged（SHA `7869e1b5c7f5bc861c22541ac891cde4d72bddff94ce4d39a91849036f41a5ff`），两入口壳不变；shell65通过。没有Vue／DDL／服务权限变更，未重跑无关Root、浏览器登录或规则长链，未登记新程序／固定库或解除生产门。
- 八路径主动LSP：2份文档warning视图clean、5份JS push-only未确认，原证工具既有数值解析warning。mode=all的43文件缓存共3项warning（drafts布尔参数、原证数值解析、既有能力测试endsWith建议），未屏蔽、不称全仓clean。

## 后继真实后台限定链 r95

`verify_editor_backend_draft_ui.mjs .../ui-r95.png --copied-entity-only` 在实际Node SQLite／FileBucket、独立临时HTTPS服务及全新Chromium中正常结束，6个范围组通过。没有伪造成功API回应。

- 真实登录／首次改密、固定来源完整复制后，读取明确修订2的全部21章，逐章核对保存／active完整数量与明细加省略数量一致。
- 实际Vue展开原章明细，文字与该修订的认证读取结果一致，无额外API请求、无HTML图片元素；明确保留“零缺口不代表准入”的提示。
- 保留已有复制章据点保存3、武将姓名／字号保存4、复制编辑后章5、删除源章6、删除后代章7的实际链；最终20个原章完整DTO保持不变。
- 正式IDB访问0、外部请求0、意外页面／控制台错误0；仅初始未登录session401单列。报告记录全部相关源码SHA，新增包含 `server/chaptergapreport.js`。

证据：`.dragon-analysis/editor-completion/chapter-gap-backend-r95.log`／`.stderr`；截图 `.dragon-analysis/editor-phase/backend-draft-ui-session-r1/ui-r95.png`，SHA `7750b5698ceff2e156cfeb24a2d079bf4441068f5ba67489b31869b9b1009b76`。这是限定实际后端补证，不是完整认证／CAS矩阵、空白可玩初始化、Trial、发布或生产放行证书。默认combined分支本次未重跑。测试语法及diff检查通过；主动LSP中测试文件超时未确认，1份文档clean，审计文档仅SHA词典提示。session全量缓存仍有8项既有warning／23项hint/info，不称全仓clean。

## 后继Trial肖像与据点图缺口展示

章节报告新增 `gaps.assets`，直接复用实际 `TrialSessions` 启动门的 `trialChapterAssetGaps`，不建立第二套资源规则。保留 `kao`／`kyo`、原槽号、值及logicalURL；统计全部缺口，只展示前100条并给省略数量。不下载图片、不填默认图、不改变保存、编译、启动或发布门。

state没有generals／cities数组时报告为null，不能按空库处理；数组为空时只表示没有已声明的这两类引用，原保存／active缺口继续显示。当前启动门已有G127／255的Web产品排除，本报告完全沿用而不扩大它；零缺口不证明255原版语义、全消费者闭包或可玩初始化，结构库登记的二十条未知引用也没有因此消失。

`PrivateDrafts.read` 仍通过原报告调用附加只读投影，无新HTTP路由或写入。控制器接受旧回应缺字段为未知，核完整计数／省略数、最多100条及每条类型后再安装整次读取；坏报告保留原loaded修订，回应与展示副本均不能改写内部快照。章节新增独立“查看Trial肖像／据点图检查”，只展开已读报告，显示槽／值／路径、未知及省略提示，路径仅文字，不作为链接或图片请求；现有字段校验计数不混入资源计数。

复用现有验证，日志前缀 `.dragon-analysis/editor-completion/chapter-asset-report-`：

- `model-r2.log` 10组通过；二十固定来源章的资源报告逐项等同原启动门，原保存／active计数保持。明确内存坏引用夹具覆盖普通槽255、既有哨兵排除、缺槽／非整数值、未知数组、空列表及128缺口截为100＋28；源保持不变。不是新的原机制证明。
- `controller.log` 74组通过；新增旧DTO未知、两级副本隔离、八类坏计数／明细原子拒绝、保原修订、零POST与身份清理。
- `browser.log` 全新Chromium142项通过，产物 `.dragon-analysis/editor-workbench/run-dPRywi/`。真实gateway／Vue、API明确夹具；核3项含省略1项、确切槽／值与未知、路径恶意文字转义、展开零请求、旧章未知提示及完整资源警示。不是实际HTTP鉴权／Trial启动或真实缺图修复证明。
- Vue build/check逐字节一致、shell65、四JS和TXT模块语法／diff通过。本批执行测试首轮均通过；r2只是补二十章资源报告对照。五代码主动LSP180秒均push-only未确认，TXT无服务，不能称clean。两文档主动warning视图clean；mode=all缓存106文件列35项warning／1项hint（含重新显示的既有草稿测试spread提示），未屏蔽。
- 没有web/src、Trial门、DDL变更，不重建原生束；不重复无影响的完整Root、实际编辑保存、Trial启动／发布长链。没有新增独立探针，该展示批当时未新增本字段实际Request收据，后继见下节；完整A20／资源闭包仍开放。

## 后继共同Request资源报告读取

复用 `verify_editor_template_root.mjs --role-slots-only` 的既有完整副本读取，不新增入口／夹具框架或产品代码。实际common Request／自有文件SQLite与FileBucket／41固定来源，认证仍为明确的种子会话，不冒真实登录、TCP／TLS或浏览器链。

控制器经实际草稿GET读取修订1／2的二十章，各章 `gaps.assets` 与相应已保存源经原Trial检查器所得报告逐项一致。当前为修订2仍可明确读取旧1；将输入修订改为999及改写展示数组后，报告仍来自原已读快照、没有新请求或资源下载。身份失效时隐藏报告。既有角色拒绝／原键记录／对象不写、正常清军师、坏历史拒绝、服务重建与Trial／release零记录保持；这里没有构造持久化非零缺图状态，非零／截断的证据仍是上一批明确夹具。

日志 `.dragon-analysis/editor-completion/chapter-asset-http-root-r2.log`：13组通过，stderr为空。首轮 `root.log`／`root.stderr` 在新增的末尾身份断言失败：把同一用户恢复身份后的保留表单误期望成空。核读 `draft.txt:setIdentity` 的既有“失效隐藏而不虚假确认或重送输入”合同后，只将隐藏断言移到identity=null时；恢复同用户仍沿原行为，没有修改产品或放宽权限。首轮不计整轮通过。

测试语法及diff通过，主动LSP180秒push-only未确认；两文档warning视图clean，mode=all缓存106文件仍35项warning／1项hint，未屏蔽。仅测试／文档变更，不重建Vue或原生束，不重跑无影响工作台、规则或发布长链；本次并未取得完整资源闭包或Trial可玩认证。

## 后继Trial失败反馈绑定原章与修订

原 `draft.txt:startTrial` 在请求失败时只把异常抛给外壳，草稿面板可能继续显示先前的载入提示。现在沿请求自身的身份／代次票据，在仍属本次上下文时记录“试运行未确认”、原已保存修订和所选章，并继续抛出原异常；不让迟到失败覆盖新身份。原流程仍关闭自己创建的窗口，不关闭其它页面。

既有 `TRIAL_CHAPTER_ASSET_MISSING` 引向本章肖像／据点图诊断，`TRIAL_CHAPTER_NOT_ACTIVE` 引向字段定位，`TRIAL_CHAPTER_UNSUPPORTED` 明确共同编译支持域未通过。没有新增客户端准入判断或第二套校验器，也不把零缺口当可玩；错误码与原错误文字保留。未知网络回应只写“未确认”，不能推定服务端没有建立Trial。表单、原修订及草稿保存journal不改，不自动保存、重读、补默认值或重试。

证据前缀 `.dragon-analysis/editor-completion/chapter-trial-entry-`，只扩现有入口：

- `controller.log` 76项通过（新增1组）：三种既有码／网络失败各核修订输入999仍POST已读1、原章／脏名称保持、只一次请求、原异常上抛及自己窗口关闭、无草稿journal；身份失效后的迟到失败不改当前面板提示。原成功／取消／弹窗拦截／回执核验测试保持。
- `workbench-r2.log` 新Chromium145项通过，产物 `.dragon-analysis/editor-workbench/run-tmhiKH/`。实际gateway／原生控制器／Vue，等待页及API明确夹具：用户同意使用已保存5，本次Trial POST返回明确422，原生新窗口关闭，草稿状态显示原章／5及资源诊断指引，未保存名称保持，没有草稿保存、重新读取或重试。只将准确Trial URL的422控制台记录单列为expectedTrialErrors，不泛化忽略其它422。
- 首轮 `workbench-r1.log` 失败：新测试只预算一条POST，却漏掉原有 `/api/trial/wait` 等待页GET，且未提供该页夹具。补显式只读等待页，并仅允许该GET及唯一Trial POST；产品未改变。编辑时新增测试Promise的未用参数已改为明确的 `_resolve`，未屏蔽检查。
- shell65、两测试及TXT模块语法、diff通过。两代码主动LSP240秒均push-only未确认，TXT无服务，不称clean。两文档主动warning视图clean，mode=all缓存106文件仍31项既有warning，未屏蔽。无Vue组件／服务／web/src／DDL变更，不重建两束，不重复无影响的Root、真实Trial启动或发布长链。本批不证明完整资源闭包或原生初始化完成。

## 后继从章节行选择并测试

章节诊断旁增加“选择并测试本章”，复用唯一 `actions.trial(chapterId)` 和原启动流程。只接受当前已读清单中的章ID；未明确传ID时仍使用顶部选择器。点击先更新本地章节选择，取消未保存确认仍保留该选择，便于继续查看该章；不改资料／资源输入或草稿源。确认文字以及成功提示都注明实际已保存修订与章ID，不取修订输入框中的新值。未知ID、busy、未确认保存或身份不符不打开窗口，也不产生请求。

没有新增准入规则、第二份source、API或独立启动通道；所选章、共享依赖、权限及初始化继续交给原服务校验。即使本章有报告缺口，也不通过UI另造规则或宣称零缺口即可运行。

证据前缀 `.dragon-analysis/editor-completion/chapter-row-trial-`：新增接口断言在旧函数忽略参数时失败（`before.log`，实际打开了原选章窗口）；实施后 `controller.log` 77项通过，新增1组核未知ID无动作、行选择取消无窗口／请求、明确同意后只POST已读1及目标章、输入999／脏名称／另一章资源输入保持、无草稿保存journal，成功提示注明目标。`workbench.log` 新Chromium146项通过（`.dragon-analysis/editor-workbench/run-sFE0oK/`），从另一章行取消后核顶部选择同步、无请求／新页；再从同一行确认后保留前批单次Trial POST、准确5／目标章、明确422后的窗口关闭与本地失败提示。等待页和API为显式夹具，不冒真实服务器或引擎启动证明。

Vue build/check逐字节一致、shell65、两测试与TXT模块语法、diff通过；三代码主动LSP240秒均push-only未确认，TXT无服务；两文档主动warning视图clean，mode=all缓存106文件仍31项既有warning，未屏蔽。修后执行测试首轮通过。无服务／web/src／DDL改动，不重建原生束，不重复无影响的Root、实际运行／发布长链；完整Trial及编辑器目标仍未完成。
