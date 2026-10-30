# E-04-ABILITY-DECODE-1：离线能力全byte保真

最初批次（历史，后继低位保留见下文）仅纠正`tools/parse_sinario.py#parse_scenario`：武术`+11`、统率`+12`、政治`+13`直接取byte，不再`&0F`。专长`+0E..10`仍只解高四位；不增加原记录字段、补低位/未知、修改公式、任官/新章初始化或运行准入。**默认包、作者来源、旧副本、App、规则、存档均未重导入或热换。** 这不是可写人物库、完整G-INIT或“255能力都安全”。

## 可复核原证与边界

唯一详细原字段维护源[实体§3.4](re-notes-entity-fields.md#武将-34-全字节能力读与高半字节unused的冲突)。固定KI SHA `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`、MZ512：`45D9/45DE`比较/取全武力byte，`3811/3816`政治byte，`52E7`word DL/DH映射11/12，`5304`再读统率byte；`9C29/9C2C`战术读取11/12；`41C2/41C6`政治/武力byte；`3EAC/3EC4`政治byte；`77B6/77C6/77D6`三能力显示全byte。新门直接核上述15签名及五原SINARIO固定SHA；General32文件`42C0+32*slot`与载入DS`4240`（文件状态从80起）的偏移一致。此为**实锤的保存原字节宽度依据**，不是所有结果/随机消费/高值除法安全证明；既有字节回绕及未知合法域继续拒未经确认的扩值机制。

owned `ability-decode-session-r1/audit-r2.py/log`只解指令，未执行KI。r1两个展示窗口起点误落前一条指令中段，仅audit，未作签名/机制结论；r2从已知41BE/77B6边界开始。Capstone近call可能显示32位符号扩展，不能将其文字当16位IP目标；本批签名只取字节读取指令，不认证新增调用图。两个audit原字节和脚本均保留。

## 后继专长原字节保留缺口

[A15能力对白原证](re-notes-entity-fields.md#specialty-dialogue-byte)新核`6366..63BD`：对白使用三专长完整byte比较，不只取高四位；`+1D`决定另一分支，`+1E`不取模。固定五库20章实际有五条低位非零记录，不能把官方四章全零推广到全部来源。该原证批次的parser仅保专长`>>4`，仍丢失低位；后继离线保留实现见下一节；本页旧三能力全byte修复只针对+11..13，不代表专长完整保真，也不授权补零。默认来源、旧副本与运行规则未在本次重导入或修改。下一步须先闭合三原byte的保留／编辑写回、继承与profile历史兼容，才可推进专长写入口；完整能力及新将初始化仍待独立核验。

## 后继专长低位离线保留

`parse_sinario.parse_scenario`现在为每条已解析武将输出`specialty_low_bits`：恰好三个小写十六进制字符，按G+0E／0F／10顺序记录各自低nibble；高位仍只由原`ability.siege/field/naval`持有，不增加另一份完整byte权威。它是无独立属性命名的导入保真数据，不是可编辑新能力或初始化默认值。例如原82／81／06变为高位8／8／0及低位`216`，两者可无损还原原三byte。

既有`source_chapter`深复制保留该字段，真实JSON往返后由`compile_chapter`继续保留。离线编译边界在字段存在时校验字符串、长度及小写hex；缺失继续缺失，显式null／坏值拒绝，不把旧来源或新将的未知低位补000。没有更改互联网写操作、profile、JS编译器或对白消费者；默认包／固定注册来源／旧副本仍缺该字段，未重导入、注册新库或热换。能力编辑、运行消费者及完整General32保真仍未完成，本次只关闭离线三byte信息损失。

复用`tools/verify_editor_ability_import.py`，输入仍为固定KI及五个固定SHA的SINARIO，无解码器main、SAVE、网络或产品输出。`specialty-low-before.log`保留缺字段负控失败。`specialty-low-after.log`和`specialty-low-optimized.log`普通／-O均通过：20章2560条低位逐原byte核对，原1536单byte／256联合／768专长byte输入检查保持并扩展低位；另12项覆盖内存82／81／06→创作源→真实JSON→离线编译无损重建、源不被修改、旧字段缺失不补及8种非法输入拒绝。source／compile案例基于首个完整原章的内存副本，不冒20章完整编译、实际互联网保存、规则或可玩初始化证据；下库短尾未补。测试输出不再将新增保真字段后的解析结果称为与历史全部字段相同，原具名能力不变。

本批另复跑既有signed24解析验证，通过20章／440原生势力槽及1536单byte、30边界、256联合输入，确认同一解析器资金路径未受影响；没有重复独立解码探针。三Python语法和限定diff检查通过。七路径主动LSP等待300秒：5项clean、2项超时未确认，不概称全部通过；测试中对本地`json.dumps`产物的`json.loads`被通用“必须捕获异常”规则误报，已标false-positive，未加ignore或吞掉测试失败。session全量132文件46项warning，包括本次新进入缓存的原有parser／pipeline未修改I/O位置5项提示，未屏蔽。无web/src、后台壳、DDL或安装数据变化，不重建束或重跑无影响浏览器／Trial／发布／规则长链。

## 后继固定20章离线编译逐章覆盖

复用 `verify_editor_ability_import.py`，把先前单章内存示例扩展为五个固定SHA原文件的20章逐章尝试。每章从实际未补尾的解析结果构造 `source_chapter`，真实JSON往返后调用 `compile_chapter`；世界城市坐标只取该章已解析位置。这是现有离线入口的迁移前置检查，不生成／安装新来源或修改运行包。

- **19章成功、2432条武将**：编译后三高位能力与低位逐条重建G0E／0F／10，精确等于原文件三byte；六项具名能力保持。五条非零低位记录全部保留，其章／槽／原byte与[原证清单](re-notes-entity-fields.md#specialty-dialogue-byte)一致。
- 对各成功章另删去可选低位字段，以旧形状再编译；新结果仅删该字段后与旧形状的完整编译结果相等。此对照证明该可选保真字段不附带其它输出差异，不是拿当前编译器自证原版规则正确。
- **下库第4章拒绝**：源文件少2字节，原始事件尾保持1022字节；编译仍以 `native strategic event wheel must contain 0x400 bytes` 拒绝。不能将20章都已解析写成20章可编译，不能补零以取得通过。源转换和成功／拒绝编译均不改变输入。

证据 `.dragon-analysis/editor-completion/ability-full-source-compile-20261029/`：首轮 `tests-r1.json` 通过；独立预固定9项原始输入／脚本后，`tests-r2.json` 与 `tests-optimized.json` 结果完全一致，`before-r2.json`／`after-r2.json` SHA保持。原20章2560条解码、1536单byte／256联合／768专长byte及12项格式／缺失验证保持。测试全内存、原文件只读、无SAVE／网络／用户profile或产品输出；实际执行及AST语法检查通过。

本批仅扩测试，不改parser、compiler、默认包、固定注册库、旧副本或规则。19章成功不意味着整包来源迁移完成：短尾处理仍无原始字节依据，运行对白消费者及在线写回历史尚未闭合，能力编辑仍不开放。

## 后继共同创作源低位格式边界

`gamesource.chapterSaveGaps`现在对显式提供的`specialty_low_bits`校验恰好三位小写hex，与Python离线合同一致；坏格式归`entity-save`，草稿和严格校验均拒绝，不只在运行时报告缺口。旧源没有该字段仍保持缺失，显式undefined／null不是缺失。校验一次置于共同保存边界，`chapterActiveGaps`复用，不在每个消费者重复检查。高位能力字段与原值不改，未新增写入操作或放宽profile，也未从sourceRecords或原文件为旧副本补值。

复用`verify_editor_entity_copy.mjs`原安装输入／两独立副本／20章来源记录验证，另在内存副本显式加入未来来源字段：11种非法值（含尾随LF／CRLF）在保存缺口报告及draft／strict两模式均拒；000／216／abc／fff四种合法值通过草稿门，章复制与真实JSON往返保留216，删除字段后仍不补零。原安装来源全将仍无该字段；原source及两原副本、2540普通来源记录／20保留记录和原7负控保持。它是共同函数／明确内存夹具证据，不冒新来源注册、真实HTTP权限、能力写入、人物合并或初始化证明。

`.dragon-analysis/editor-completion/specialty-source-before.log`保留null尚无保存缺口的负控失败；`specialty-source-after.log`先过9非法值，`specialty-source-after-r2.log`补两种行尾输入后11种通过。尾随换行专项只是加强覆盖；JS正则本来拒绝，并非另一个产品修复。既有`verify_editor_role_slots.mjs`6组、shell65、两JS语法通过。角色测试仍限定原有同属／自由候选／G127拒绝及原profile历史，不冒全部权限矩阵。两代码主动LSP等待300秒仍push-only未确认，两文档warning视图clean；mode=all为133文件、46项既有warning，另两项JSON.parse未捕获误报在刷新后仍列出：这里输入是内部JSON.stringify的测试夹具，解析失败必须让测试失败，已标false-positive且未加ignore或吞错。JSON往返不能用structuredClone替代。

因共同模块属于web/src，原生束已构建两次，第二次unchanged：236文件，SHA `d67b5c149c02c30dc4c67c0d568c41ea6ac38ccf29f7310663340fc292df544d`；Trial／玩家两壳SHA仍a456d356／515019f2前缀。无Vue变化，不构建后台壳；无规则、默认数据或发布策略变化，不重跑无影响浏览器、实际保存、Trial／发布长链。A15仍部分，既有安装源和运行对白消费者未迁移。

## 后继互联网传递接缝只读核对

本次只读核对`specialty_low_bits`进入共同源之后的传递位置；以下是当前代码事实，不是新字段实际发行／运行／存档往返的验收：

| 接缝 | 当前处理与范围 |
| --- | --- |
| `projectTrialChapter` | 先验证完整草稿，再structuredClone完整game并只缩小章节集合；保留所选章的完整state，不逐将挑选字段。严格准入仍执行。 |
| `compileGameSource` | 校验源并编译地图／道路和兼容资产，返回源摘要；不是将章节人物重新编码成固定字段列表的函数。不能因返回对象无generals而认定人物字段丢失。 |
| `TrialSessions.issue`／`#checkChapterState` | 引用projection中的章state，检查现行资源与active缺口后，以JSON.stringify章state生成chapter对象；未另建低位投影或补值。 |
| `PublishedPacks.prepare` | 在异步读取目录之前逐章structuredClone完整state，之后逐章JSON.stringify封存；地图编译产物与章state分别传递。 |
| `trialruntime.js`／`createNewGameScenario` | 原pack.chapter交给新局工厂，工厂先克隆完整输入，再清理列明的运行态污染／准备原有初态；没有专长低位字段删除或高位重建。 |
| `snapshotState`／`restoreSnapshotState`入口 | 快照克隆包含generals的完整scenario；恢复先克隆saved.state再应用sidecar及现行准入。这是入口形状核对，不是规则运行中全部写者或正式IDB端到端保真证明。 |

上述接缝未发现需要新增专长低位转抄代码的位置，因此不增加重复字段白名单、默认000、平行sidecar或新的编译器版本；也不借此修改发布／Trial准入。此前复制／JSON测试只证明其各自范围，本轮未重复或扩大其结论。

剩余工作仍是有来源身份的导入／注册迁移、旧副本与新来源隔离、运行消费者的完整原字节输入以及相应端到端验证。现有注册源没有该字段，`talk.js`仍是已记录的旧高位／status／模运算路径；保真字段可通过这些接缝，不等于对白已按原程序运行，也不开放任意能力编辑或未知初始化。

本轮仅本页及完成清单变化；源码指纹与范围见`.dragon-analysis/editor-completion/specialty-runtime-review.json`。不运行无改动的编译、浏览器、保存或规则重链，不访问正式存档。

## 后继已安装只读原始包的迁移输入核验

复用 `verify_editor_entity_inspection.mjs`，实际读取当前已安装的默认描述符、绑定runtimeDataSHA的作者manifest／body及完整副本来源索引；不是直接把本轮离线parser结果代入安装源。当前来源存在两个必须区分的层次：

- 20章2560条**具名运行模板**都缺少 `specialty_low_bits`，仍未迁移，不能从高位补000。
- 同章同槽绑定的**只读原始人物包**均保存完整32B，其中G0E／0F／10全部可取；三个高位逐槽与具名模板一致，用这些原低位重建的三byte精确相同。五条非零记录与[原始清单](re-notes-entity-fields.md#specialty-dialogue-byte)一致：全局零基章2／5／5／6／10，槽30／27／108／108／29；其余低位000是原始包实际字节，不是本轮默认填充。

因此迁移缺口不是这份已绑定作者原始包丢了低位，而是**尚未把有来源身份的值纳入新具名源及其发行合同**。该只读证据不授权运行时临时读取原始包补字段、不把缺来源的旧草稿变成有来源、不重贴旧副本身份，也不能把原始记录当成当前编辑后的数值。新来源身份、旧／新隔离、在线历史以及对白消费者仍须分别闭合。下库事件缺尾2B不在General32区域，本批不补尾、不认证完整剧本重导入。

完整既有入口通过20章／2560条与8项身份拒收，新增2560组三专长高位／原byte核验及五条非零清单；game和原始bundle全文保持。首轮测试将原证的零基章号误减一，最终清单断言失败；核原证表明确“章／槽从0计”后只纠正测试索引，未修改产品或放宽匹配。失败保留在 `.dragon-analysis/editor-completion/specialty-installed-source-20261029/tests-r1.log`；最终 `tests-r2.log`、`before-r2.json`／`after-r2.json` 的428项选定输入SHA保持。I/O仅固定Web资产读取及自有日志，无DOS／SINARIO／SAVE、数据库、网络或安装写入；原文件血缘依赖已固定作者包的来源合同，本轮不是重新从五个原文件提取。

仅测试及文档变化，不重建程序／后台束，不跑无影响浏览器或发行长链。JS语法与限定diff检查通过；主动LSP脚本仍push-only未确认，两文档一clean／一仅三条既有摘要词典hint，mode=all同三条hint，不把缓存无代码发现当clean，也不将通过该工具当成全部能力编辑或完整来源迁移完成。

## 后继专长低位独立源候选

新增 `tools/stage_editor_specialty_candidate.mjs <round>`，只在新的 `.dragon-analysis/editor-phase/<round>/` 生成 `candidate.json` 与收据；参数限定单段名称，已有目录拒绝，不覆盖／续写不明产物。沿既有受信读取器核当前固定资源、作者manifest／原始body及runtimeDataSHA，逐章／槽核绑定、完整General32与三项高位相同；只有具名低位**原本缺失**时，才从该记录G0E／0F／10提取三低nibble。已含该字段或高位不符即拒绝，不适用于任意已编辑副本。

候选只给20章2560条记录新增 `specialty_low_bits`。逐条记录章ID、槽、原三byte及完整原记录SHA；删除新增字段后，候选整个GameSource与旧源deepEqual。共同 `compileGameSource` 接受该候选并产生不同sourceDigest；地形、道路图、cost与offset产物仍与原资产一致。五条非零值保留，其余值也来自实际原记录，不用默认000。整个旧章节事件区、G127记录其它字段、元数据及其它源内容保持；不据此认证旧事件尾的原字节完整性。

**仅源候选，不是新固定来源发行**：外层明确 `PENDING-NOT-INSTALLED`，所附旧作者描述符仅证明输入身份，不能充当新runtimeData描述符。该默认源模式不生成RuntimeManifest、data.json／分章资源／新作者包，不建立新map修订、不继承APPROVED或显示认可、不切默认、不注册来源、不修改旧副本／存档／对白消费者，也不新增能力编辑。其内部保留的旧源元数据不能作为新公开版本身份；后续仍需完整资产绑定、新旧隔离和运行消费验证。

实际两次独立命令输出 `specialty-candidate-20261029-r1`／`r2`，candidate与receipt逐byte相同。独立Python核验全部2560条原记录SHA、低位与变更清单、五条非零位置及删除新增字段后的完整旧源相等；428项选定源码／资产SHA前后保持。四种坏低位在共同编译入口拒绝；路径越界参数在读取前拒绝，复用已有目录以EEXIST拒绝且原产物保持。证据在 `.dragon-analysis/editor-completion/specialty-source-candidate-20261029/` 的stage-r1／r2.log、verify.json、negative-format.log、invalid-round.log、existing-output.log及before／after.json。

I/O仅固定Web资产／代码读取及上述新自有目录写入，无DOS／原SINARIO／SAVE、网络、数据库或安装。JS语法／限定diff及新文件空白检查通过；主动LSP脚本push-only未确认，两文档一clean／一仅三条既有词典hint，mode=all同三条hint，不称全clean。没有程序或后台源码变化，不重建束，不把共同编译通过冒成App／浏览器／发行或完整编辑器通过。

## 后继待审核完整资源候选包

同一stager新增显式 `--runtime-package`，默认源模式保持：其 `candidate.json` 与前批逐byte相同，仍不生成资源包。新模式在独立自有目录生成完整候选的38资源＋manifest、resources描述符及新作者包／描述符，不执行安装或注册。两次命令分别生成 `specialty-runtime-20261029-r1`／`r2`，输出及收据全部一致，候选修订 `map-2-28805fc52a1c79910a949fb32b242323777c1741245724b8c346fd8e7a567bfe`。

绑定链为：低位源摘要→新修订与20个章节文件／data.json→新runtimeDataSHA→作者body／manifest／descriptor。作者原始记录及血缘只改变runtimeData绑定，全部General32／City32／Faction64／header仍相同；新描述符不能由旧描述符替代。地形、道路、cost／offset、八季节资源、两小地图共14角色逐byte保持；其余24角色为20章及source／data／world／catalog，world与catalog仅有修订／URL重绑定及各自应有内容，非地图规则变化。低位之外的整个源及data、所有原始记录分别有完整相等断言。

**不继承旧认可**：新manifest显式构造字段，geography／visual／authorDisplayData均为 `PENDING-SPECIALTY-DELTA`，没有 `displayAcceptance` 或日期专用 `displayAcceptanceInheritance`。只保旧manifest摘要作为来源证据，不把日期采纳或原显示认可重贴到新sourceDigest。现行 `readInstalledEditorSource` 对该候选以PENDING≠APPROVED拒绝；未修改这一门，也未修改默认switch、注册库或旧副本。这里的“完整资源候选”不是已批准发行，更不是原事件缺尾已修复／能力编辑／运行对白完成。

新增持久验证入口：

```sh
node tools/stage_editor_specialty_candidate.mjs <新目录名> --runtime-package
node tools/verify_editor_specialty_candidate.mjs <候选目录一> <候选目录二>
```

验证器仅允许两个不同的单段自有目录名，核产物SHA／两轮字节一致、2560条原低位、五条非零记录、所有章文件与data／source相等、14资源保持、world／catalog限定变化、新作者包的真实decode及旧描述符拒绝、批准入口真实拒收。不会为了测试把PENDING临时改成APPROVED。两工具只读固定Web资产与自有候选，输出仅stager的新分析目录；无DOS／SINARIO／SAVE、网络、数据库、浏览器或安装写入。

证据 `.dragon-analysis/editor-completion/specialty-runtime-candidate-20261029/`：stage-r1／r2.log、source-mode.log、verify-r1.log；生成阶段428项、独立验证阶段429项输入SHA前后保持。非法选项拒绝，默认模式与旧candidate正文一致。两JS语法、限定diff及新文件空白检查通过；主动LSP两代码未确认（一timeout、一push-only），两文档一clean／一仅三条既有词典hint，mode=all同三条hint，不称全clean。未重建无变化的两束／后台壳。该批仅核包结构；后继共同装配／JSON恢复与新旧身份隔离见下节。实际App、完整运行消费者及来源采纳合同仍待闭合，不能直接开放编辑或切换默认。

## 后继候选共同装配与JSON恢复

在既有 `verify_editor_specialty_candidate.mjs` 增加实际共同核心验证，不生成另一套Scenario或改候选的审核标记。旧／新目录分别创建 `createContentCatalog` 与 `createWorldResources`，20章各由 `createNewGameScenario` 接 `prepareScenario(mode='fresh')`；候选运行对象的2560条低位与候选章模板相同，删去该新增字段后，整个fresh Scenario与同章旧源结果相等。

对每章使用 `snapshotScenarioAssembly`，将 `{state,webMeta}` **真实JSON往返**后通过 `readSavedAssembly`／`prepareScenario(mode='restore')` 恢复，完整Scenario与装配sidecar相等。旧身份→新世界和新身份→旧世界各20次均以mismatch拒绝，共40项；没有重贴旧存档身份或回退到旧图。候选data／source／manifest／resources在验证后全文仍等于原文件。

资源fetch被显式替换为只允许已核旧／新资产URL的内存映射，并在finally恢复；8次请求恰为两世界各自terrain／cost／offset／roads，不访问网络或用户存档。待审核manifest保持 `PENDING-SPECIALTY-DELTA`，前段的真实批准入口拒收仍执行；这里只直接调用共享底层装配，**不是走已批准来源入口放行候选**。

证据 `.dragon-analysis/editor-completion/specialty-candidate-assembly-20261029/`：r1通过后补模板／审核描述符不变断言，最终 `tests-r2.log` 为20章fresh＋JSON恢复、40次错身份拒绝、8次内存资源请求；519项源码／固定资产／两份候选文件在 `before-r2.json`／`after-r2.json` 保持。未修改stager、候选包、默认源、程序束或运行规则。本轮不是App初始化军师／外交、Clock推进、真实IndexedDB、浏览器、Trial／公开发行或对白消费者认证；下库原事件缺尾仍未由此还原，完整能力编辑和来源采纳仍未完成。JS语法、限定diff与链接检查通过；主动LSP脚本push-only未确认，两文档一clean／一仅三条既有词典hint，mode=all同三条hint，不称全clean。

## 后继候选真实App与隔离IndexedDB恢复

既有候选验证器新增显式 `--app-browser`，默认仍只执行前节共同核心验证。浏览器模式先完成两份候选一致性、原字节重建和待审核来源拒收检查，再启动自有回环静态服务及全新Chromium context；只在该测试App注入候选catalog／data／world，候选资源由已核SHA的内存资产提供。不修改默认模块、注册库、候选文件或审核标记，也不把此注入称为通过正式来源准入。

对包含全部五条非零低位记录的四章（全局零基2／5／6／10），实际执行 `App.beginNewGame`、`saveGame`，经原生IndexedDB落盘，再读取存档正文、`returnToTitle`、`beginSavedGame`。每章128条低位在新局与恢复后均等于候选模板；RNG恢复相等、已存正文不被恢复改写、候选模板全文保持。新局走现行App装配，包括其军师／外交入口，而不是只调用 `prepareScenario`；这不是这些规则的新增原版等价证书。标题 `show` 在测试中临时替换为空等待，实际回标题清scenario仍执行，不冒真实菜单点击；恢复使用同一隔离页面，不冒新页面冷启动。

运行命令：`node tools/verify_editor_specialty_candidate.mjs specialty-runtime-20261029-r1 specialty-runtime-20261029-r2 --app-browser`。证据 `.dragon-analysis/editor-completion/specialty-candidate-app-20261029/` 的首轮及最终 `tests-r2.log` 同时包含原20章共同装配／JSON恢复、40次错身份拒收及新增四章App恢复结果；移除新测试两处风格警告后重跑，`before-r2.json`／`after-r2.json` 的1608项Web／工具／两候选文件SHA全部保持。原生IDB仅允许新context的 `wolong-web`，不访问用户profile；域外／SAVE请求拒绝，页面错误、console error、失败请求及未授权请求断言均为空。公开目录／公告为空是明确内置测试夹具，不作网络发布证据。自有browser和静态服务在finally关闭。

本轮只改验证器与文档，未重建程序束、未安装或批准候选；没有验证Clock推进、全20章App、旧副本迁移、专长对白修复、Trial或正式发布。完整来源采纳和在线编辑写回仍未完成。JS语法、限定diff与链接检查通过；主动LSP脚本push-only未确认，文档一clean／一仅三条既有词典hint。缓存两条await括号风格提示保留，不按提示误写成读取未完成Promise属性，不宣称全clean。

## 后继候选采纳与固定注册的独立边界

本轮核读日期采纳合同、`install_editor_date_adoption.mjs`、`editor_builtin_source.mjs`、`editor_trusted_copy.mjs` 和 `sourcecatalogpolicy.js`。**日期合同不能直接套用**：它限定844e父源、两个year变化、六个变化角色及32个不变角色；本候选从现行47e父源新增2560项低位，变化角色24／不变14。不能复用日期证书、旧人类认可记录或仅改APPROVED字符串。这里列出后续审阅条件，不构成新的采纳授权。

| 独立边界 | 现状与采纳前仍需的工作 |
| --- | --- |
| 源字段与地图显示继承 | 两候选及原byte保真已有证据；须单独固定本批允许差异、父来源／认可身份、地图不变范围和验证产物，不能继承日期专用证书。低位补全不等于对白已修复。 |
| 本地默认二元组 | 日期安装器只接受固定日期目录／证明；底层原子切换器的通用能力不授予新源准入。未来仍须绑定resources与entitySource为同一release，并保留旧immutable目录和历史身份，不修改既有副本或存档。 |
| 服务固定来源注册 | `installedSourcePolicy`固定现行47e／entities086的两个manifest及41角色；`createPinnedCopyLoader`也独立核当前revision、sourceDigest与作者tuple。因此切换Web默认模块不等于新作者来源已登记，不能随latest自动重绑已捕获副本。 |
| 端到端升级出口 | 候选App注入验证不代替真实新默认、新完整副本、旧副本继续精确读原来源及新旧保存历史兼容。来源采纳后仍须分别验证Trial／发布资源绑定，不能把本地候选测试拼成服务升级收据。 |

既有候选验证器增加服务**纯策略端口**正负对照：当前两个实际manifest仍得到现行41角色policy；仅换候选world、仅换候选author、两者都换三种组合，实际 `installedSourcePolicy` 均拒 `503 SOURCE_MANIFEST_NOT_PINNED`，输入字节保持，随后当前policy全文保持。未改批准标记、白名单、sourcecatalog数据库或注册ID，不启动HTTP／数据库，也未尝试运行安装器。该测试证明当前明确拒收，不将拒收当成需要绕过的缺陷。

证据 `.dragon-analysis/editor-completion/specialty-registration-boundary-20261029/`：`tests-r1.log` 通过三项注册边界拒收，原20章共同装配与40项错身份拒收保持；本轮未启用 `--app-browser`，不冒重新执行前节浏览器成绩。1681项选定输入在 `before.json`／`after.json` 全部相同。JS语法、限定diff及链接检查通过；主动LSP脚本push-only未确认，两文档一clean／一仅三条既有词典hint，mode=all另有两条既有await括号风格提示，不称全clean。完整目标仍未完成，候选保持待审核／未安装。

## 后继采纳审批范围与旧副本服务阻碍（已批准，不做兼容分派）

本节是**已批准的本地采纳范围**，不是日期合同的追加授权。可执行差异合同与正式证书见[专长采纳合同](editor-specialty-adoption-contract.md)。本轮只核对候选身份及当前服务连接，不运行安装器、不改PENDING／默认源／注册表；安装与旧副本清理按本合同逐项闭合后另行收据验收。

### 固定提案对象

- 父修订：`map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23`；父sourceDigest为`87742af76b54a13711541eefbb2dd2066ba06d30602027b9bfcf9ae43bf9f2b1`，父manifest SHA为`bde6dfc8a82da5597ef22786e46681c87f2fe21cd55dd23921b32e346efa95e9`。
- 待采纳内容：本页既有两份`specialty-runtime-20261029-r1/r2`候选，修订`map-2-28805fc52a1c79910a949fb32b242323777c1741245724b8c346fd8e7a567bfe`、sourceDigest `19ef2ce35a92d4fad10d75610818f8113ff9b711480e45d7a009cd582c7b4d6b`。只给2560将增加经绑定原记录提取的三低nibble，五条非零；其它源字段与全部原始记录保持，24角色限定变化／14地图资源保持。
- 已批准建立**只覆盖原地图不变部分**的新工程继承证书，并实现有前置验证的本地采纳；不把原视觉认可直接改名重用，不声称对白已经修复。候选当前审核字段均PENDING，最终批准证书会使manifest／作者绑定等产物重新冻结，不能沿用当前候选manifest SHA作最终发行摘要。
- 不包含：能力编辑、未知事件尾补全、其它默认值、旧副本／旧档重贴身份、生产来源登记／上传／部署、commit或push。这些不因批准本节自动获得授权。旧副本不保留、不迁移、不再使用，直接删除（先核归属与引用，共享不删）；不再为旧副本建设新旧来源兼容分派。

### 新发现的实际兼容性阻碍

“旧目录仍在”不足以证明在线旧副本继续可用。当前`editorapp.js`为PrivateDrafts注入的是无registry参数的`definition: () => this.installedSources.definition()`；`PrivateDrafts.#origin`要求旧副本的`copy_origins.registry_id`与该**单一**definition相同。`InstalledRuntimeAssets`也在构造时捕获一个policy，按它读取installed_sources，并要求副本origin等于该行。因此仅把默认服务换成新policy，即使保留全部旧文件／旧SQL行，旧副本仍会在这些明确条件处被拒绝。此为当前代码合同，不是本轮实际执行升级后的故障收据。

按最新批准，旧副本不保留、不迁移、不再使用，直接删除；**撤销旧副本兼容的前置要求，不再建设按持久 origin 的多来源分派，不按 latest 回退，不增加新的来源准入**。清理前必须按归属与引用逐项核对（gameId 归属、跨游戏 payload、publisher checkHead、前代收据、跨游戏资源引用、未知 legacy），共享资源（14 地图资源分键、kao 共享画像、程序资源、其它游戏历史事实）不得误删。历史来源的权限、删除栅栏、profile、完整摘要与当前资源核验在删除前仍有效，不能为删除放宽门。

### 批准后仍须逐项完成，不能以候选测试替代

1. 固定本批允许差异与继承范围的可执行合同，生成新证书／最终包，两次独立产物一致；候选错配、非低位变更和地图变化必须拒绝。合同与证书见[专长采纳合同](editor-specialty-adoption-contract.md)，由 `tools/install_editor_specialty_adoption.mjs` 强制执行。
2. （已撤销，不再建设兼容分派）旧副本不保留、不迁移、不再使用，直接删除；清理前按归属与引用逐项核对，共享不删。未知registry、来源缺失／撤权仍拒绝，不回退；尤其覆盖上述PrivateDrafts与InstalledRuntimeAssets单来源边界的拒绝语义，而不只测浏览器候选注入。
3. 同一冻结release原子切换resources与entitySource；前置验证或中断失败保持旧默认／明确拒绝。旧immutable目录按新批准在归属与引用核对后清理，不再为保留旧副本而保留旧目录；版本性旧存档处理仍按现行合同，不能为本次来源采纳偷偷迁移数据或清用户存档。
4. 在实际采纳后核新默认、新完整副本、精确保存历史与两端资源绑定；程序束／固定消费者身份按实际变更核验。候选20章核心／四章App历史证据只作前置，不冒真实升级成绩。

本轮身份核对：两候选44项产物逐byte相同且SHA等收据，父manifest仍等上述固定SHA；当前候选审核字段仍PENDING。首次只读核对误取收据键`inputHashes`而报KeyError，读实际字段`inputs`后重新完整核对通过，未改变候选或测试期待。本轮没有重跑装配、App或服务升级测试。批准采纳范围也不等于这些出口已完成；完整目标与来源准入保持开放。

## 后继专长对白调用入口核对

当前代码调用关系核对（不是原版机制证明）：

| 入口 | 现行取句路径／边界 |
| --- | --- |
| `GameBar.showGeneralCard` | 直接await `quoteFor(gen)`；随后加载画像并安装卡片。 |
| `HUD.showFactionCard` 默认路径 | 从当前Scenario取君主，再调用同一`quoteFor`；不是另一个已修复的能力选择器。 |
| HUD注入资源路径 | `_showPrivateFactionCard`调用注入`loadQuote(monarch)`；具备资源／代次守卫不证明取句算法正确。当前`main.js`用`new HUD(this)`，未在这里安装该端口；端口测试的返回文字也不是原始TALK选择证据。 |

`quoteFor`仍以`status===4`选553起点／模5，否则只比较三个高位能力并按模8取句；缺talk_idx又从idx补值。原6366链则检查G1D、比较三完整byte并传完整G1E给075B，两者不能等同。离线parser虽已保留`specialty_low_bits`与`captive_flag`，旧安装源未迁移；不能只替换高位比较后宣称修复，也不能从岗位状态推回原G1D或为缺失低位补000。`quoteForFormation`等其它对白有独立入口，本次不据6366推广更改它们。

该批发现HUD注释仍称“复刻原版能力确认流”，曾替换一行注释以撤销该断言，不改调用、结果、异步行为或规则。后继真实HTTPS能力表验证发现该注释属于固定库消费者字节，修改导致库安装指纹拒绝；已定点撤回这一行源码修改并重建原生束，未调整库身份或放宽校验。**原HUD这行注释明确作废，不是机制证据**；本节及原证维护源保留更正，不为纯注释单独迁移固定库。首次构建结果只属当批历史，不作为后继程序摘要。`.dragon-analysis/editor-completion/specialty-callers-20261029/`保存替换前源与9项选定指纹，逐byte核验该单行替换且其余8项（含两壳与固定库）保持。首次指纹命令误写固定库路径，在任何修改前失败；按实际`server/available-library.txt`重取后才编辑。该批原生束重建两次，第二次unchanged，237条文件字节／长度／SHA与当批源对应；后继撤回注释后的构建与20消费者指纹复核记录见[能力表HTTPS验证](editor-general-definitions.md#后继能力只读表真实https验证)。语法通过；这是注释及文档维护，不运行无行为变化的浏览器／游戏回归，不把重建算作对白机制验证。

## 后继显示消费者边界

[ABILITY-DISPLAY-1](re-notes-entity-fields.md#后继能力列表两列数值绘制ability-display-1)复核了三项全byte能力到两列数值绘制的完整直连窗口：100..255可留下被列宽截去的商，不能把两列显示当成字段值域。三窗口／12签名／7调用及256项局部算术已有可重复工具；没有认证实际字体像素或新增可编辑数值域。唯一详细结论及条件维护于上述原证章节。

## 后继治理消费者边界

[全byte治理叶核验](re-notes-entity-fields.md#ability-governance-domain-audit)直接复核4194完整窗口与随机叶，补充全部武力／政治byte组合在6个明确城／RNG边界向量下的生产算术对照（393,216次，非CPU执行）。预算、byte回绕及RNG消费前缀有限定验证；其它消费者、完整记录与初始化仍未由此关闭，默认源、表单和准入均不变。新测试语法与diff检查通过；主动LSP三份文档在warning级clean、JS为push-only未确认，session全量116文件仍19项既有warning、23项hint/info，没有屏蔽或宣称全部clean。此批只改测试／文档，不重跑无关浏览器、不重建程序束。

## 后继专长对白原窗的持续核验

既有 `tools/verify_entity_fields.py` 新增六个已审原窗的完整SHA核验及收据字段，不新增运行公式、输入路径或第三方解码依赖。首次运行发现详细原证表中222B..2286摘要漏抄两个字符；原KI与原始r2收据相互一致，更正记录见[原证维护源](re-notes-entity-fields.md#specialty-dialogue-byte)。不是修改固定KI摘要或按当前Web行为重写规则。

`.dragon-analysis/editor-completion/specialty-window-certificate-20261029/` 保留失败日志、修正后普通／`-O`两份一致收据和10项输入前后SHA。最终86条原签名、6个完整窗口及原有官方四章512将／768城等检查通过；输入仅既有九项固定非存档原文件和测试脚本，原文件只读，无网络、原程序执行或产品数据输出。Python语法通过实际执行核验。没有把官方四章低位全零推广到其余来源，也未新增CPU或字体／输入驱动证书。

下一实施缺口不变：旧安装源低位仍缺，不能从高位补000；完整能力编辑还须闭合来源身份迁移、在线写回历史及运行消费者。本批仅强化原证的可重复核查，不修改parser、共同源、规则、后台表单或程序束。

## 最初实际验证（历史范围）

[I/O先登记](editor-local-validation.md#e-04-ability-decode-1离线全byte先审io)，新`verify_editor_ability_import.py`normal及`-O`均通过：20章/2560记录逐原byte，原样本能力均≤15，结合唯一三字段有界差异证明这些章原解析输出未改变。内存夹具1536单byte（槽0与127、三字段各0..255）、256联合不同byte、768专长高nibble检查，**其它完整解析输出与原章baseline相等**；旧mask只是明确投影参照，不执行旧源码。输入高值不进入正式游戏，G127只作原槽字节保真，不开放新增普通将。

下库88830B末章少2B保持原短尾，全部general完整；仅调用parse_scenario，未调用会补尾的read_scenarios或覆写Web的main。当轮原资金unsigned、城200上界/空名break/其它raw遗漏保持，不借该批暗修；后继[资金专项](editor-money-import.md)另修离线signed24，默认/编译域仍不改。

六focused白名单环境串行全部exit0：新normal/-O、原实体9固定输入85签名/官方512将768城、date-only独立输出（20章120header/7日期签名）、copy-drift3840城、installed实体三Web资源20章及5坏缺拒。后一日期门仅owned overlay，不安装。无浏览器/UI/游戏规则变更，故不跑无关浏览器或全81。284声明源码是库存（270Node/10Python/4HTML），不是81全轮；两既有Python补声明不是新产品。

静态`ability-decode-session-r1/static-receipt-r1.json`绑定281旧源中279不变、parser/runner内存逆delta、82默认/归档Web资产、六实际日志/新date产物、原只读输入、文档/技能、当前producer/HEAD与诊断。首次新测试拟用exec重建旧decoder，主动诊断发现动态执行/类型问题后，在运行前移除，保exact草稿；改投影与完整baseline比较，不禁规则。原证确定字宽与受控输入保真直接闭合，无公式/runtime/UI变更，本批未调用Jev推断机制。主动12路径全部未确认（9MD unavailable/3inconclusive），零诊断不是clean；session229文件13既有warning保留，不禁规则或清缓存。完整目标仍active，原可写实体/初始化/安全域/后台缺口继续开放，无commit/push/deploy。
