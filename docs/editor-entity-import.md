# E-04-ENTITY-READONLY-AUDIT-1：跨章人物来源与只读索引

后续[来源检查UI](editor-entity-inspection.md)已接；下文分阶段来源/复制证据保留历史范围，不将后续UI误称可编辑人物权威或G-INIT认证。

当前goal655“继续完成剩下的所有任务”的原证/工程盘点切片，不是完整人物编辑器、初始化或G-SLOTS证书。**原件/current39、既有98生产/回归源、草稿与运行状态均未修改。** 后台依赖仍只局部阻塞，[目标工作表](editor-goal-completion.md)仍开放。

## 1. 实際核对，不按同槽合人

[原证盘点](../.dragon-analysis/editor-phase/entities-audit-r1/receipt.json)由`tools/audit_editor_entities.mjs`产生；原数据offset/字段置信度依据[实体32B](re-notes-entity-fields.md)及[日期/全槽](re-notes-custom-data.md)，不让现代码成为原规则证据。

- 五个固定非存档SINARIO、20章、2560个原人物32B完整读出；固定KI完整SHA及52E7/55D3/4F95/52DB四指令签名再核。当前已批准包39角色由受信reader逐SHA/长度/sourceDigest/20章/native4复编验证。输入45项（39包＋5原剧本＋KI）前后SHA同。下库88830B，只认证所读表完整，不补或认证末尾缺2B。
- G0..126共**127个物理槽**在不同章存在不相同的头像+姓名/字号原13B。此数只证明外观记录非恒等，不把外观改变全部断言为不同人；但原槽0配Web标签明确呈张梁/蹇碩/孫策等不同来源人物，证明不能按idx无条件跨章合并。名称/头像甚至全部外观相同也不是自动归并依据。
- 已安装`game.generals`只有128个“第一次遇到该槽的姓名”条目，`fixedgameimport/copyBuiltinGame`代码对应此事实；它不是最终全游戏人物库。章节原数组当前仍各自保留正确具名对象，所以盘点不会为修字典改写当前游戏。
- 20章的逐武将Web对象均不带完整原32B；G14/G15/G1B等未知必须保留，不能由显示值反造。完整原记录已在本轮**审计输出/只读原型**保留，尚未形成服务可写源/发布资产。不能把盘点保留冒充已修正式创作源。
- 10个city物理槽的原name6B在五库中也有变化（0/5/12/21/51/52/90/120/163/184）；固定XY/节点绑定可以相同而名称不同，共用city基础资料仍须继承/覆盖合同，不按名字决定身份。
- 本次检查G能力/attr/portrait、F资金以及年/day的原值与当前显示：只有后库idx14、15两项年差异，Web8/10而原u16为264/266。原指令word及文件+06..07见日期原证；**没有本轮暗修包/原件/日期**。能力全byte虽当前2560样本与旧低nibble显示相同，也不能因此把原字段编辑上限定15；任意高值消费者/显示另须审域。
- 22正常势力完整raw逐章核同；24物理表/特殊G127、FF/18h等字段语境分开，非公开前缀不自动视为损坏。任何保存索引/目标不得拿FF充G255，G127不作为新增普通将。所列引用是序列化线索，不证明inactive槽的所有消费者会执行。

## 2. 原证辅助复核

完整审过416行`verify_entity_fields.py`后，以显式`python -X utf8 -B`执行；只读固定九项非存档白名单，未运行KI/DOS I/O、save流程或写Webmain。[本轮输出](../.dragon-analysis/editor-phase/entities-audit-session-r1/native-fields-r1.json)PASS：85个正指令签名、官方512人物/768城、512零军团槽、原192/254/5526图与官方4处F23差异。只能证明工具所列命题；不是unused/穷尽间接消费者/整个战役证明。

## 3. 实现的只读source-record模型

`web/src/editor/entityindex.js#createImportedEntityIndex`是纯函数：显式gameId/sourceRevision、chapter.id与完整128×32原记录、独立ID分配器；无FS/网络/RNG/时间。重复章/混来源/不完整raw/slot不合/原能力与显示不合/无效或复用ID直接拒绝。输出模式明确`READONLY_SOURCE_RECORD_INDEX`。

- 每章0..126各产生独立来源实例，带游戏/来源修订/章/原槽/完整raw及显示字段；不按名字/slot/外观或先前128字典合人。当前20章为2540条，不声称2540个不同历史人物。
- 每章127完整保存为保留兼容记录，不分配普通人物ID。每章slotMap与全部原128记录同存，不改变原数组/地址顺序；原低位及未知字节完整保留，未造能力/状态/预算/初态。
- [实际20章原型结果](../.dragon-analysis/editor-phase/entities-audit-session-r1/index-prototype-r1.log)：2540独立普通来源记录＋20个G127、全部raw/具名映射、JSON往返及9个精确负控、caller全文不变。
- 此处封存原型**当时尚未写入已保存草稿/正式源，随后§4.3已保存只读来源索引；仍不是可编辑GeneralDefinition、初始included/归属/override合同，不提供新将/归并/删除/任免操作**。输入中的显示文字来自受信已校验源，不据此猜Big5编码转换或做Unicode截断。后续编译必须真正耦合author实体与章节运行数据，不能增加“无效果的人物表单”。

## 4. 下一依赖与证据纪律

原记录Web作者来源包已有两次**独立直接原源staging**及纯reader，§4.1是封存未安装阶段；随后已在§4.2安装可信Web作者输入及读取器、§4.3接本地full copy保存来源索引，尚无人物编辑/UI权威。下一独立实现为只读实体/来源/引用检查UI，再有证的可编辑实体权威，然后逐字段有证读写与原子引用更新；不得让编辑服务依赖ignored审计round或生产运行时读取DOS文件。原日期截断须另以独立原数据纠错/产物差异受控修正，不借来源盘点暗改当前批准包。空章、计数/任免联动、占城初始化、G127/脚本槽别名及扩容仍按原证门处理。

原记录缺失与无条件同槽归并已直接定位下一步，本轮不请求Jev解释字宽/数值/人物身份；按集成4.2确定性步骤直接执行，不向外发原资源。本批三个代码文件独立语法/LSP和本轮SHA核签；既有53门/98源旧收据只证明未漂移的已有实现，本盘点/原型不冒充新增54/55门完整回归。主动3JS均push-only inconclusive/0confirmed-clean；7Markdown均unavailable。session全137文件仍列既有名称控制码正则1W，上一批已标意图安全检查false-positive，本批不清缓存/禁用规则，不称0W。最终[静态记录](../.dragon-analysis/editor-phase/entities-audit-session-r1/static-receipt.json)另签SHA/语法/输入保全。本批不要求无关浏览器冒烟，未改生产路径/UI。

### 4.1 E-04-ENTITY-SOURCE-STAGE-1（封存staging，安装前）

`tools/stage_editor_entity_source.mjs`不依赖上节ignored审计raw，直接重新读取受信current39和固定五SINARIO SHA白名单；每章header128、128×General32、192×City32、24×Faction64（包括原非公共prefix）完整转换为hex，保原顺序、未知字节/字宽。独立[stage-r1](../.dragon-analysis/editor-phase/entity-source-r1/receipt.json)/[stage-r2](../.dragon-analysis/editor-phase/entity-source-r2/receipt.json)整个包及收据byte相同：20章2560将/3840城/480物理F。`entity-source.json`503775B、SHA`5f65f15123622c916e9ea8ee37800b01e5a74909197d06051a5855a7b60e6c9c`；manifest单列runtimeDataSHA，资源不能被别的数据集/新槽序假借。

- `web/src/editor/entitysource.js#decodeEntitySource`纯reader只接受显式trusted SHA/长度/currentdataSHA/章序/原源SHA描述符，先2MiB以内字节/SHA，再fatal UTF8/JSON、严格20章/128将/192城/24F/原record宽度；无fetch/FS，provenance.path只作文字数据，不可拿来打开原DOS路径。2MiB是Web作者输入预算，不是原引擎容量声明。
- [整包验证](../.dragon-analysis/editor-phase/entity-source-session-r1/source-verify-r2.log)：最终verifier独立读currentdata的SHA和每一原文件SHA，不从manifest自证；两stage复现、每一raw与五原文件逐byte同、纯reader20章再生成2540来源记录模型、8负控（坏SHA/记录长/城raw/章身份/原源指纹或路径/currentdataSHA/资产路径）、输入前后hash同。故意自洽重绑fixture hash只覆盖schema拒绝，不作可信批准/身份认证。
- 包profile`ki-fixed-entity-source-1`/mode`READONLY_IMPORT_INPUT`不是RuntimeManifest、新将/空章初始化器或可发布游戏；**没有安装正式Web作者资产、修改current39、保存草稿、连接服务/UI**。事件轮/军团/外交等其它表不在这次包认证域；下库缺尾2B仍不补。
- 三个新增stage/reader/验证JS各语法/主动LSP，均0诊断但push-only inconclusive/0confirmed-clean；最终只读静态[本次收据](../.dragon-analysis/editor-phase/entity-source-session-r1/static-receipt.json)另签新tool、两包/日志、文档/原98源/current39SHA。上一readonly审计收据的旧文档SHA不冒充这次更新，未跑/拼接新54/55全套机器成绩。无再次commit/push/fetch/deploy、真实SAVE/profile/DOS写入或全局配置/缓存更改。

### 4.2 E-04-ENTITY-SOURCE-INSTALL-1（本地作者输入，不是正式游戏安装）

受控`install_editor_entity_source.mjs`核两包/已封存最终verifier的独立输入及toolSHA/currentdata原byteSHA，新增content-addressed `web/content/builtin/authoring/entities-5f65f15123622c916e9ea8ee37800b01e5a74909197d06051a5855a7b60e6c9c/`两JSON，最后写`builtinentitysource.generated.js`只读深冻结描述符。已存在只可同byte，未知或漂移拒绝；没有替换当前游戏switch/39资产或草稿。repo-local binary/-text属性保SHA，不调整全局Git。实际[安装日志](../.dragon-analysis/editor-phase/entity-source-installed-session-r1/install.log)PASS；bodySHA/503775B同两stage，manifestSHA`9a0ca1041aca47fa285d69c1728c6b3a2bc2c5d8d339c45549c1984fd83250fe`。

`tools/editor_entity_source.mjs#readInstalledEntitySource`实际只读取currentdataURL＋两个新Web作者URI；先独立currentdataSHA、manifest SHA/长度，再纯body reader；原源path只作数据，**不用DOS文件或ignored证据来提供运行时服务**，也没有任何旧源fallback。[实际默认reader/严格三URI边界](../.dragon-analysis/editor-phase/entity-source-installed-session-r1/reader.log)20章2560将/3840城/480F＋5拒收（各资产损坏、body缺失/非byte）/输入不变/嵌套描述符冻结通过。

这解决Web作者源的可信读取，不等于服务复制已完整保raw、可编辑GeneralDefinition、身份归并、初始化、账户、发布或任意容量；**本封存安装阶段当时尚未改server/API/草稿/UI或运行模板**，当时old53/98源/current39独立核无漂移；后续§4.3另新机器轮绑定变化。当前目标保持active，不再次提交/推送/部署。主动4JS为3个push-only inconclusive及helper的3个await hints（注入reader实际支持async，不能错误删await）；5Markdown unavailable、2作者JSON push-only inconclusive，0confirmed-clean。session全144文件仍1个既有名称控制码正则warning/已裁决意图检查，不清缓存或禁规则。最终[本批核签](../.dragon-analysis/editor-phase/entity-source-installed-session-r1/static-receipt.json)另覆盖新增代码/描述符/作者2资产、日志和文档；stage静态收据的旧文档SHA只代表当时。

### 4.3 E-04-ENTITY-COPY-1（本地full copy保存来源索引，不是人物编辑库）

`entitycopy.js#copyEntitySourceRecords`核source修订/完整复制/原→目标章唯一映射，创建每game独立source-record ID；index中origin.sourceChapterId保原章，bindings按复制目标chapterId索引且显式含两ID。完整原General32/低位/未知及20个G127分别保留，不把G127当普通新增将。纯DTO不改变input/source/原具名state/旧128general字典，也不把相同名字/外观合人。两game2540×2来源ID不相交，JSON往返及7精确负控，见[本轮pure](../.dragon-analysis/editor-phase/entity-copy-dto-session-r1/unit.log)。

本地server full-copy实际await固定Web作者reader后保存`game.sourceRecords`；来源URI/SHA/长度/currentdataSHA固定，UUID只作身份熵、不消费游戏RNG。minimal完全不导入人物来源索引。await后在同步写尾再次核已存在gameId和占位owner-local重名，避免新异步边界让旧检查失效，**仍非耐故障/多进程CAS或真实权限**。实际自有temp/loopback[API结果](../.dragon-analysis/editor-phase/entity-copy-dto-session-r1/api.log)完整20章/2540普通来源记录/20保留G127、保存重开、metadata写后ID不变、两个game不共享ID；同时同gameId和同本地owner同名各一200一400，minimal无sourceRecords。旧草稿不自动补，旧编译快照不热改。

新库存完整串行[entity-copy-machine-r1](../.dragon-analysis/map-migration-2/entity-copy-machine-r1/receipt.json)：2026-10-01 21:56:12.015Z–22:19:10.899Z，**55门全部exit0/111源/39原资源/作者2输入前后SHA同**，不是旧53＋散测拼装。原5退休skip仍不算通过，固定RNG只属局部Web确定性；20章/shared compile/fresh/生产JSON、实际工作台/试运行与正式存档拒绝沿既有测试范围。独立[最终静态](../.dragon-analysis/editor-phase/entity-copy-dto-session-r1/static-receipt-r2.json)另绑定源码/入口log/文档/所有资源。

本地完整复制已保来源raw和稳定source-record索引，不宣称2540个不同历史人物或完整可编辑GeneralDefinition。旧`game.generals`首遇槽名兼容字典仍未替换为正式全游戏人物库；readonly index不是included/出场/任免/新将/空章初始化或历史归并合同。Actor writable表单、完整身份归并、所有跨实体引用与网络后台仍未完成，当前原件/已有运行对局/存档不热改。

Jev仅发送人工审阅2262B最小工程摘要、先preview再固定1.13.0；结果advisoryOnly，主风险分流为persistence/state，无原数据/个人值/凭据外发、不作规则证据/oracle/放行门。5JS主动4push-only inconclusive、1现有正确(await).member保括号hint/0confirmed-clean；6Markdown unavailable，session全146文件仍1个既有控制码正则warning/上批已裁决意图安全检查；不清缓存/禁规则，不称全工作区clean或为数字改语义。没有再次commit/push/deploy或真实SAVE/profile访问。
