# 据点基础名称：中立保存接口与投影

这是[工程合同§3](game-editor-technical-design.md#3-人物据点章节与固定槽映射)的Web创作资料切片，不是DOS规则或完整据点编辑证书。当前已实现共同内容写入器、受信中立顺序历史校验、现有草稿API接线与只读DTO；后继据点页已接名称操作，并已取得下述真实后端浏览器联合保存限定证据。章节中立引用已进一步接保存API／DTO、据点页配置／移除与更名影响确认，并取得后继真实后端浏览器限定证据；下述各批历史的关闭入口不代表最新状态。

## 固定来源与不自动选名

实际41个已钉Web输入生成的中立模板包含192条 `cities[cityId]={cityId,runtimeSlot,x,y}`，没有基础名称。完整副本的20章具名城市记录，在192个槽中有10个槽出现不同名称，例如槽0为“北平”／“北京”。这只是当前固定输入的导入事实，不是原版机制或历史身份结论。不能取第一章名称默认为所有章的唯一基础名称，也不能把缺名称显示为已配置。

本切片保留新模板未配置的状态，不重导入或改动已有模板／完整副本。作者显式填写名称后才新增 `CityDefinition.name`；尚无姓名来源归并、原章继承／覆盖迁移或Big5编码合同。

## 后继名称编辑接线与剩余范围核对

当前源码核对确认，这不是“已有共同写入器但漏了完整副本按钮”的缺口：`setCityDefinitionName`通过`chapterPeopleProjection`要求中立模板及空原生章表；完整副本不在该writer的接受域。中立模板的受信历史、草稿API、`CityDefinitionsPanel`操作、章节引用和影响确认已经接入，后文均有各自限定收据，不再重复建设。

完整副本名称编辑的剩余出口是**导入模型转换与保存合同**：必须保留每章原有名称差异、稳定城市身份、旧快照及历史请求；不能把首章名称复制到基础定义后宣布无损，也不能只让Vue显示输入、放宽`DRAFT_CITY_PROFILE`或复用中立空章writer。上节十个异名槽是既有固定输入测试结果，本次仅核读既有测试，不冒本轮重新编译或原始DOS机制证明。

本次不新增名称覆盖政策、不自动归并、不改变绑定／原字节，不运行无变更的历史重型链。完整副本基础／章节模型的转换仍未实现；这只限制对应编辑路径，既有中立名称编辑和独立已授权工作继续有效。

## 后继据点类型代号只读展示

现有完整副本的`state.cities[].type`通过同一精确修订DTO投影为`typeCode`，据点共用表增加“類型代碼（唯讀）”。只显示保存源中的代号，不从图形、名称或第一章推定类型，也不新增中文分类映射。旧DTO缺失／null保持未知，不补零；这不是类型写入、变更城关形态、容量或运行准入。

控制器只在DTO边界校验显式代号为0..15整数且拒负零，对应既有离线parser低nibble表示；不是宣称这16个值都有已认证的规则语义。坏响应不替换旧上下文，展示模型不能反写源；现有保存动作只接受troops／prod，调用类型输入动作也不产生请求。

证据 `.dragon-analysis/editor-completion/city-type-view-20261029/`：草稿控制器108项通过，新增0／4／15及未知、八种坏值、模型隔离与零写；工作台230组通过，在既有只读段补零值／未知／换章／无控件与零请求断言，未冒增加组数。工作台为真实Vue／gateway／新隔离浏览器及API夹具，结果`editor-workbench/run-E8mGKC/result.json`错误清单为空。独立`verify_vps_city_save.mjs --native-only`26项通过，20章3840条城市类型逐项等于真实保存源，旧修订／新旧city历史回归保持；此端口使用自有文件SQLite／FileBucket与明确principal／来源夹具，非真实HTTPS证书。

583项选定源码／输入SHA前后保持，四JS语法、后台Vue build／check逐字节一致、shell65通过。只重建后台壳，不改Web规则、原生程序束、固定资源库、DDL或权限；该批真实HTTP类型展示联合链尚未验证；后继已补下节限定收据，类型编辑仍未完成，不以只读交付关闭A14。

主动LSP四份代码未确认（超时／push-only），控制器只有既有await类型提示；文档五条旧摘要／标识词典提示。mode=all限定八路径仍有1条测试console警告及26条风格／词典提示，不屏蔽或称全部clean。TXT通过实际控制器加载与后台构建验证，不冒LSP已确认。

## 后继类型只读真实HTTPS复制保存验证

复用 `verify_editor_backend_draft_ui.mjs --city-native-only --node-service`，新增两组类型断言，完整聚焦入口共**6组通过**。自有Node／文件SQLite／FileBucket、固定20章来源、自有HTTPS及全新Chromium，真实管理员登录／改密／完整复制，不替换成功API响应。

- 在复制章保存修订2后，用独立认证精确DTO核对原章与复制章各192行类型代号，切章与只读查看零API请求，类型列无编辑控件；复制章类型序列与原章相同。
- 既有兵力修改仍只提交单条`city-native`／`troops`和已读修订2，不夹带typeCode或输入框999；取消零请求，收据3之后旧表锁定，明确读取3才更新。全部21章类型序列保持，复制章192行再次与精确修订3一致；旧修订2完整DTO仍相同。
- 日期、章缺口及原有保存断言继续通过。两次浏览器保存分别为复制章与兵力修改，无响应丢弃；errors／outside为空，正式IDB访问0。此次不冒默认组合链、workerd、未知类型显示、全部章界面或类型写入证明。

证据 `.dragon-analysis/editor-completion/city-type-https-20261029/` 含测试日志、独立提取收据和602项选定输入前后SHA（全部保持），收据25项源码／截图SHA已逐项复核；截图为 `editor-phase/backend-draft-ui-session-r1/ui-r107.png`。只改既有测试与文档，无产品／束／固定库变化；测试关闭自身浏览器和服务，原工具临时资料保留，不称清理了全部临时目录。

## 后继据点归属与太守只读展示

共用据点表显示同一次明确载入修订的归属／太守槽号，不再要求作者切到其它列表猜引用。`PrivateDrafts.read`保留既有faction并新增governor投影；`draft.txt`在DTO边界接受0..255整数表示值、拒绝负零及非整数，旧缺失／null显示“未提供／無”，不补0、不授任职或运行资格。保留24等非正常势力表示值，不能把显示槽号等同于正常势力列表成员；太守也不据同名武将推定身份。该表示检查不是新增规则值域，原有内容准入仍生效。

`StrongholdPanel.vue`新增独立只读列，无选择、任免或归属写命令；既有city-native仍只保存明确troops／prod。显示模型复制已读值，坏DTO原子拒绝并保旧上下文。没有修改原始源、规则、DDL、固定库或玩家／Trial程序束；仅后台壳重建。

验证目录 `.dragon-analysis/editor-completion/city-ownership-view-20261029/`：

- 控制器109组通过：新增0／24／127／255、null／缺失，模型隔离、两字段各8个非法值原子拒绝及试图提交只读字段零请求。此处为API夹具，不是后台准入新值测试。
- 工作台230组通过，`editor-workbench/run-MggzRM/result.json`错误／意外请求／失败均空；新隔离浏览器、实际Vue／gateway与明确API夹具。首章归属0／太守0、切章旧DTO太守未知、切回还原与零额外请求，无编辑控件。
- 实际草稿服务`verify_vps_city_save.mjs --native-only`27项通过，20章3840城逐项等于精确已保存源的faction／governor；原旧历史、修订1→3、读回及拒绝不新增对象检查保持。使用自有文件SQLite／FileBucket与种子principal／来源配置，不是HTTP登录或浏览器后端联合证明。
- 583项选定输入SHA前后保持，四JS语法、后台build／check逐字节一致、shell65与限定diff检查通过。TXT经实际加载执行／构建验证，不当作LSP支持。当时完整字段编辑、归属／太守写回及当前表真实HTTPS联合未闭合；只读表HTTPS后继已取得下节限定收据，写入仍未开放。

主动LSP四份代码未确认（1超时／3push-only），控制器有既有await类型提示；两文档五条既有词典提示。mode=all仍有旧测试console警告1条及26条提示，不称全部clean，不为消除测试提示改动产品行为。

## 后继归属太守只读真实HTTPS验证

复用 `verify_editor_backend_draft_ui.mjs --city-native-only --node-service`，沿原复制章／city-native兵力保存流程核只读归属和太守：修订2的原章与复制章各192行精确等于独立认证读取的同修订DTO，槽号／空值呈现无编辑控件，切章零新增浏览器请求。保存只提交明确troops与已读修订2（不是输入999），收据3后仍须显式读回；全部21章归属／太守值保持，复制章显示等于3，旧2完整DTO不变。原日期／类型、取消零写、收据锁表检查继续执行。

本轮8组通过、2次浏览器保存、0次丢回应，errors／outside为空、正式IDB访问0。实际Node自有文件SQLite／FileBucket、固定20章来源、真实管理员登录／改密／复制、自签本地HTTPS和全新Chromium，没有成功API回包替身。证据 `.dragon-analysis/editor-completion/city-ownership-https-20261029/` 含 `tests-r1.log`、`result.json`、前后清单及交付核签；602项选定输入SHA保持，25项入口指纹与 `backend-draft-ui-session-r1/ui-r108.png` 截图SHA复核。finally只关闭自有浏览器／服务，临时测试资料保留，不操作真实内容。

只修改既有测试与文档，无产品／构建产物变化。该收据不是归属或任免写入、全部字节样本／未知DTO、workerd、默认组合链、Trial或发布证明；不取代上一节独立控制器未知值检查。语法、限定diff与链接检查通过，主动LSP测试push-only仍未确认，保留诊断记录，不称全仓clean。

## 写入边界

`web/src/content/authoring/citydefinitions.js` 导出 `setCityDefinitionName(game, cityId, name)`：

- 复用既有中立章节结构校验。仅允许builtin-template、空原生章表及已理解的人物配置；后继内容层另支持下述显式中立城市引用。完整导入章、城市章节覆盖／角色或其它未知章引用拒绝，而非当成没有影响。
- 只能修改当前游戏已有城市map中的身份，不新增／删除城市，不分配槽位；保留全部ID、runtimeSlot、坐标、placement、道路、章节和compatibility。
- 仅理解城市四项绑定字段和可选name；拒绝未知字段、重复／越界槽、越界坐标、存量非规范名称。固定范围是当前源合同，不是扩容结论。
- name必须为非空文字，trim＋NFC；拒绝C0/C1/DEL和孤立代理项，不截断Unicode、不转换为问号、不设未经批准的字数／Big5宽度上限。同名允许，名称不是身份。
- copy-on-write复制全部城市记录，输入不变；描述符检查拒绝访问器、隐藏键、symbol和非plain对象，不触发getter。返回值其它源分支仍为未修改共享引用，不是整个游戏的独立深克隆或授权能力。

旧 `FixedCopyProfile.verify` 与没有改名历史的 `verifyOrderedTemplate` 仍拒绝新增此名称的候选；后继只有记录明确cityEdits的受信顺序入口可核验，不能把纯函数调用当成可绕过服务器的保存权限。该初始批次章节城市尚未配置，因而没有继承传播或原生名称写回；后继内容层、顺序历史及API的分批出口见下。

## 验证

日志位于 `.dragon-analysis/editor-completion/city-definitions-*`。

- `verify_editor_city_definitions.mjs` 4组（`content-r2.log`）：规范化／非BMP／同名／no-op、source codec真实JSON往返、所有城市记录无输入别名、无隐式名称；坏文字／ID／绑定／章范围拒绝且输入不变；访问器0次、隐藏键／symbol拒绝、已有特殊键不写对象原型。
- 实际41输入、192条城市、地图／章节／compatibility未改，active缺口未消失；原源在两种profile入口通过，而仅增加作者名称的候选均明确 `COPY_PROTECTED_DELTA`。同时核20章的10个名称分歧槽，不据此实施自动归并。
- 共用中立人物范围回归13组通过（`people.log`）；没有重跑或声称已通过尚未接线的HTTP／浏览器保存流程。
- 因新增web/src模块，按现行工具重建原生程序束233文件，重复构建unchanged；trialapp／playapp壳SHA不变。仅本地生成物，不登记新程序／固定库身份，不放宽Trial或发布准入。

语法和diff检查通过。主动LSP四路径3份clean、1份push-only未确认；session全量120文件仍19项既有warning、23项hint/info，无屏蔽或全仓clean声明。独立核对当前束的233项正文／长度／SHA及两入口壳身份，证据见 `city-definitions-static.log/json`。本批没有提交、推送或部署。

## 后继：受信逐请求城市名称历史

`replayTemplateHistory` 接受可选 `cityEdits`，缺省为空但不改写旧步骤；每步最多16项，每项严格为 `{op:'rename',cityId,name}`。按章节、人物定义、人物配置、地图、城市的顺序调用共同写入器，最终仍比较整个候选源，仅明确元数据按原合同处理。缺记录、反序改名、夹带坐标／槽／其它字段不能借改名获得通过；完整副本仍不能调用中立历史入口。没有修改HTTP capture或持久请求格式，不接受客户端自报历史。

`city-history-content-r2.log` 4组通过，扩充实际41输入中的具名／无记录对照、规范JSON候选、顺序／反序、空缺省历史、超16项／稀疏数组／坏指令／未知ID／访问器及函数getter零调用；原城市源不变。既有顺序人物历史、水域两profile和shell回归分别见 `city-history-people.log`、`city-history-water.log`、`city-history-shell.log`。编辑工具曾部分应用import／可选字段处理后因重复文本拒绝最后一块，立即定点补齐后才运行测试；没有留下未使用import或半实现作为交付。没有改web/src或Vue，本批不重建程序束、不冒新的HTTP／浏览器保存证明。主动LSP两份文档clean、两份JS push-only未确认；全量缓存曾报测试中的两条重复嵌套三元提示，已改为if/else并重跑内容测试，既有诊断不屏蔽。语法／diff通过。

## 后继：草稿保存与精确修订读取

现有草稿保存body增加可选 `cityEdits:[{op:'rename',cityId,name}]`，最多16项，仍受整请求16KiB预算约束。缺字段保持缺字段，不向旧request_json追加空数组。服务端从已提交请求重建顺序历史；当前保存先按原顺序处理章节／人物／地图，最后调用城市名称写入器，仍由整源profile核验、所有权／epoch、精确CAS、不可变对象和原操作收据控制。非中立profile非空cityEdits拒绝 `DRAFT_CITY_PROFILE`；不允许客户端上传历史、坐标或槽绑定。

精确修订DTO新增独立 `cityDefinitions:[{cityId,name}]`；未配置名称为null，完整副本为null表示尚不支持转换，不把它伪装为空库。原strongholds／章cities形状不变，也不拿章名给基础定义补名。读取和编译捕获同样核已提交城市历史；这不消除原生初始化／Trial／发布门。

验证与失败记录：

- 首次完整Root入口超过5400秒，`city-definitions-api-root.log` 为空，未取得结果，不记通过。查询确认没有遗留本工具Node进程。原完整入口仍保留，新增显式 `--city-names-only` 聚焦入口只跑共同来源／创建／章复制／完整副本基础与城市名称场景，不把此前人物／水域长链算作本次通过。
- 聚焦首轮 `city-definitions-api-focused.log` 在历史负控失败：测试只改早期名称，但后续合法no-op再次写回该名称，最终源仍相同。改为不存在的城市身份，要求在该历史步骤立即拒绝；没有削弱产品核验，也不声称顺序源重建等于每条历史请求的独立认证。
- `node tools/verify_editor_template_root.mjs --city-names-only` 最终12组通过（`city-definitions-api-focused-r2.log`）：实际common Request／文件SQLite／FileBucket／41固定来源，种子认证不是浏览器登录。192缺名null、中立修订2→3、原键查询／重放、NFC／非BMP、只改目标名称、同名另一ID3→4、no-op不增修订、旧2／3不可变及重启保持；缺字段旧body逐byte不变。坏指令／字段／文字／身份／17项／超预算、异作者／管理员／完整副本、CAS和同键不同body均拒绝，负控无draft对象写入。坏历史在read／captureForCompile／save前核验拒绝，恢复测试夹具后原投影保持，trial／release仍零新增。
- 内容／顺序历史4组、shell65及schema核验通过（`city-definitions-api-content/shell/schema.log`）；schema仍23源／50表／49索引／343列／4FK。语法／diff通过。没有重跑72项无关旧完整副本链或浏览器，没有Vue／原生程序束、程序登记、生产维护门变更。

## 后继据点页名称操作

`CityDefinitionsPanel.vue`装在据点页、与原章数值表分开，复用`draft.txt`唯一loaded／generation／attempt及sessionStorage关联。仅中立profile且已提供cityDefinitions才启用；缺字段／null为未知，重复ID、额外字段或非规范名称整次拒绝，不半安装回包。未配置name显示“未配置”，prompt为空，不取任何章名称。名称经trim＋NFC；无新增字数上限，整body仍16KiB。

操作用稳定cityId、已保存metadata及空resourceEdits，只提交一项cityEdits。prompt／confirm后重核身份、generation和原loaded对象；取消不写，未知响应不能另起键。同页显式查询后可重试原键／body／修订，刷新只恢复关联，不重造body。收据确认撤销verifiedRead，保留其它表单脏输入，须显式读收据修订才可继续编辑。Vue只持显示副本，没有第二可写source或原生规则权限。

本批验证（`.dragon-analysis/editor-completion/city-ui-*`）：

- `node --test tools/verify_editor_definition_controller.mjs tools/verify_editor_draft_controller.mjs`：84组通过；新增3组覆盖名称规范化／DTO隔离、未知结果锁定／原键原body重试、重载仅查询、精确重读、其它脏输入保留、坏DTO／文字／预算及确认期间身份变化。均为显式端口夹具，不冒服务器权限证明。
- `node tools/verify_editor_workbench_browser.mjs`：76项通过，实际gateway／生成Vue／CSP、新Chromium上下文，API明确夹具；新增据点页缺名、取消、规范化保存body／If-Match、其它输入保留、成功后锁定／明确重读、作者文字不执行HTML。报告`.dragon-analysis/editor-workbench/run-6RzfgO/result.json`。没有正式IDB／域外请求／非预期页面错误；不是实际SQLite保存或浏览器登录联合证明。
- 后台build/check逐byte一致（JS369982B、CSS33898B、8包notice）；shell65、两测试语法及draft模块语法、diff检查通过。没有web/src变化，不重建原生束；不重跑未受影响的后端长链或游戏规则回归。
- 主动LSP六路径：4项超时／push-only未确认、draft.txt无服务、浏览器工具两项既有辅助提示；不称clean。文档主动LSP一份clean、审计仅既有SHA词典信息；本会话mode=all warning视图8文件无warning，不替代上述未确认项，也不覆盖此前会话120文件缓存。CodeGraph读过的Vue被编辑工具read门拒绝一次，随后显式read再定点编辑，无覆盖现有改动。

## 后继真实后端浏览器联合保存

`node tools/verify_editor_template_browser.mjs r19 --city-names-only`：7个范围组通过，日志`.dragon-analysis/editor-completion/city-ui-real-r19.log`，stderr为空；源码SHA、请求摘要和截图见`.dragon-analysis/editor-phase/template-browser-r19/receipt.json`／`template.png`。

此显式聚焦入口使用实际Node `createEditorService`、自有文件SQLite／FileBucket、原HTTPS运输和新Chromium上下文；41来源暂存后经真实管理员登录／改密／登记及作者登录／改密，没有成功API替身。保留创建及元资料1→2流程，不运行无关人物／水域长链。默认无聚焦参数仍走原完整入口及其既有backend，不将本次结果扩称默认workerd全链通过。

- 实际192基础名称全为null；取消prompt无保存请求。作者保留另一表的未保存名称后，将城市名称设为`<img>é𠀀`（输入为带空白的分解字符），请求只含已保存metadata、空resourceEdits及一项cityEdits，精确If-Match为2。
- 服务真实提交修订3后仅在浏览器运输处丢回应，原操作锁定且其它脏输入保留。刷新仅恢复键关联、重试禁用；原键查询后明确读取3，只有一次名称POST。读回NFC／非BMP文字，Vue无img节点；章、地图、人物、据点绑定DTO均与2相同。
- 另一城市保存相同名称到4，保持不同ID／新操作键；确切旧2／3不变。管理员读作者修订4实际404；作者浏览器无管理员请求、正式IDB访问、域外请求或非预期错误。初始401及刻意丢响应单列，不泛化忽略错误。
- r18在来源暂存阶段失败，0组完成：R2暂存helper给对象式`etagDoesNotMatch`，FileBucket要求Headers条件。仅测试端口显式验证原条件后转为`If-None-Match:*`，仍用实际不可变文件写／读回；产品FileBucket及来源安全门未改。失败stderr保留。重新建立全部临时数据库／对象桶／浏览器后r19通过，没有重用失败数据。

27项源码SHA复核保持，实际城市保存POST共2次，stderr为空。语法／diff检查通过；测试主动LSP为push-only未确认。两文档主动LSP一份clean、审计仅既有SHA词典提示；session mode=all共9文件24项hint/info（含await括号正确性提醒），未屏蔽，不称全仓clean。仅测试与文档改动，本批不重建Vue／原生束，不重复未受影响的API或规则长链。不是全部原键重试／权限竞态、重启、Trial、发布、云端或完整编辑器证明；这些既有／剩余范围分别记录，历史证据不冒本轮运行。

## 后继显式章节中立引用内容层（尚未接保存接口）

按工程合同§3.1，名称为全游戏基础字段，**没有新增章节名称覆盖**。新增 `applyChapterCityEdit` 的set／remove只处理已有稳定cityId：set必须显式提供 `{factionId:null,overrides:{}}`，remove仅移除该章配置，保留城市定义／地图／其它章。没有把192城自动加入新章、没有构造原生城市表，缺名称不取首章或补文字。

`chapterCitiesProjection` 返回按章序排列的已配置引用和当前基础名称（缺失为null），结果各行独立；`cityDefinitionChangeImpact` 归一化后列出实际变化及明确引用的章节，无变化为空。它不是地图、原生事件或完整删除引用扫描；接口接线前须按精确修订把此清单用于确认，不能将本函数当服务权限。名称仍无本章覆盖，`inheritedFields:['name']`仅描述全局来源。

共用 `cityrecords.js` 验证已有四绑定／可选名称与新增章引用。人物scope现在识别这唯一明确的中立形状，人物编辑不丢城市引用；城市改名同样保留章配置。任何其它归属、太守、数值／名称覆盖、未知ID、非空原生表及访问器仍拒绝。旧无cities字段的章不补空字段。该内容层批次尚无HTTP／受信历史章节城市命令；后继历史入口见下。没有对应章节城市操作的历史，即使已有合法改名操作，夹带本章城市配置仍 `COPY_PROTECTED_DELTA`。

本批隔离验证日志前缀 `.dragon-analysis/editor-completion/chapter-city-`：

- 新内容5组（`content-r2.log`）：显式配置／缺名／影响清单／恢复缺配置、无输入修改／投影无别名、source codec往返、章复制独立、人物共存、未知字段／其它章损坏／访问器0次；active缺口保持。合成两城夹具不冒192城初始化。
- 实际41输入城市4组（`definitions.log`）另核夹带配置的profile拒绝；既有人物13组、基础定义10组、顺序历史12组、shell65分别通过。初轮新测试4通过1失败（`content-r1.log`）：测试错误期望保留特殊键`__proto__`能通过codec；既有codec明确拒绝该键，改验拒绝而不放宽产品。安全对象构造与持久化资格分开。
- 五JS语法／diff通过；原生束234文件重建、复建unchanged，两入口壳SHA保持，并逐文件正文／长度／SHA核对；未登记新程序或固定库。没有Vue／服务／DDL／运行规则变更，未跑未接入口的HTTP或浏览器流程，不冒此前r19为新源码证明。
- 五代码路径主动LSP四份clean、一份超时未确认；后补新测试与本文clean，审计仅既有SHA词典info，不将未明确覆盖的超时项改称clean。末次session缓存14文件24项hint/info（主要为旧浏览器工具建议），无屏蔽，不代表全仓无诊断。

## 后继章节城市受信顺序历史（HTTP仍关闭）

`server/copyprofile.js` 的中立 `verifyOrderedTemplate` 接受内部可选 `chapterCityEdits`，每步最多16项；严格按章节结构→人物定义→人物引用→地图→基础城名→章节城市顺序调用共同内容写入器，最后整源比较。缺字段仍保持旧历史形状，不补写旧请求。set／remove仅允许已证的中立引用，完整副本及原生初始化权限没有扩大；复制捕获当时配置，之后移除父章配置或删除父章不改副本。

本批日志位于 `.dragon-analysis/editor-completion/chapter-city-history-*.log`：

- `before.log` 保留新正控在未接线时的实际422 `COPY_TEMPLATE_HISTORY`；接线后 `after.log` 7组通过，读取41固定Web输入／192城。覆盖改名与配置同请求／跨请求、JSON codec往返、复制后独立移除及父章删除、移除再配置、旧缺字段不变、无授权夹带／篡改复制时间点拒绝、未知ID／角色／覆盖／原生表／超限／稀疏数组及访问器零执行。没有运行空章。
- `root.log`：`node tools/verify_editor_template_root.mjs --city-names-only` 13组通过，实际common Request／文件SQLite／FileBucket／41输入，认证为种子夹具。保留基础名称原键／旧修订／CAS／重启／历史损坏负控，并新增HTTP传入空或非空 `chapterCityEdits` 都422 `REQUEST_FIELDS`、对象数不变。它只证明新内部历史没有意外开放HTTP，不是章节城市持久化功能已完成。
- `names.log` 城市4组、`people.log` 既有顺序历史12组、`content.log` 内容5组、`shell.log` 65项通过；三JS语法、diff检查通过，保留既有换行提示不批量归一化。
- 三代码主动LSP均未确认（1超时、2 push-only），不以无诊断称clean。两文档一份clean、审计仅既有SHA词典info；mode=all缓存17文件133项hint/info（主要为Root／旧浏览器工具的await括号提示），未屏蔽、不冒全仓clean。没有web/src／Vue改动，不重建两束；未跑完整Root长入口、浏览器、Trial／发布及无关运行规则回归。完整HTTP／DTO／确认／持久化接线仍是后续工作。

## 后继章节城市保存API与名称影响校验

`server/drafts.js` 现接受可选 `chapterCityEdits`（每请求最多16项，整body仍16KiB）：set必须明确给出既有chapterId／cityId与`values:{factionId:null,overrides:{}}`，remove只给两个ID。严格使用同一内容写入器和整源顺序历史；非中立副本的非空命令拒绝。没有补原生记录、占格、归属、角色或覆盖权限，也不删除基础城市或地图。

- 缺字段的旧request_json仍不补空数组；只有已提交请求可参与按修订排序的重放。保存、精确读取和编译捕获都核同一历史，沿用原键／body、所有权／epoch、精确CAS、不可变对象及事务，不新增写入通道或数据库表。
- 读取新增 `chapterCities:[{chapterId,cities:[{cityId,factionId,values,overrides,inheritedFields,overriddenFields}]}]`，仅列显式配置，基础名称缺失为null；完整副本为null。旧章城市数组／缺口及其它DTO不改，不把此显示投影当可玩源。
- 基础`cityEdits`可带 `confirmedImpacts:[{chapterId,fields:['name']}]`；服务按该操作前的精确候选源重新计算影响。存在受影响章而缺确认返回409 `DRAFT_CITY_IMPACT_REQUIRED`；提供的清单不精确匹配则409 `DRAFT_CITY_IMPACT_CHANGED`。同一请求先章结构／人物／地图，再基础改名，最后章城市配置；客户端须按此顺序展示确认，不能用最新清单替代原请求。确认仅是用户意向记录，不是权限或原生初始化证明。历史重放剥离确认字段后仍调用共同名称写入器，保持旧无确认记录可读。
- **此API批次界面未接**：当时的名称界面没有章影响确认，服务仍拒绝缺确认的更名；后继配置及确认界面见下一节，不将历史状态当现状。

限定验证（`.dragon-analysis/editor-completion/chapter-city-api-*`）：

- `node tools/verify_editor_template_root.mjs --city-names-only` r1、补充非法确认与null命令负控后的r2均17组通过；交付以`r2.log`为准。实际common Request／自有文件SQLite／FileBucket／41固定输入，认证为种子夹具，不是浏览器登录。覆盖配置／移除、独立精确DTO、原键重放／查询、旧修订／旧body不变、重启、CAS、不同body同键、异作者／管理员与完整副本拒绝、17项／预算／未知ID／角色／覆盖／未配置移除负控。
- 更名缺确认／错误清单409、非法清单422且没有新draft对象，准确清单保存后章显示全局新名但原生章记录不变。损坏早期配置历史使read／compile capture／save拒绝；恢复测试历史后正常移除，基础名／地图及旧修订保持；trial／release表仍零。本批没有发生失败测试；编码审查发现新增可选确认读取须先拒绝null项，已加类型门及负控并重跑r2，没有放宽验证。
- `history.log` 固定来源顺序7组、`controller.log` 既有控制器44组、`shell.log` 65项通过；`schema.log`仍23源／50表／49索引／343列／4FK。没有UI／web/src变更，不重建Vue／原生束，未跑无关完整Root长链、浏览器、Trial、发布或生产操作；控制器通过不证明未实现的章城市界面。
- 主动代码LSP一项超时未确认，另一项有108条await括号辅助hint；不称clean，未抑制提示。两文档一clean、审计仅既有SHA词典info；末次mode=all warning视图18文件仍有drafts.js既有布尔参数warning。两JS语法与diff检查通过（保留既有换行提示，不批量归一化）。

## 后继章节据点表单与真实浏览器联合保存

`draft.txt`严格读取完整`chapterCities`：按章顺序、已知cityId、无重复、null归属／空overrides／仅name继承、有效名与基础定义一致。缺字段／null为未知，不能推断零影响；名称与配置操作都锁定，非法回包不半安装。Vue仅获得显示副本，章节选择复用原chapterId，不建立可写source。

`CityDefinitionsPanel.vue`增加逐章中立引用配置／移除；保存只有一项`chapterCityEdits`、已保存metadata、空resourceEdits，不捎带其它表单。名称确认列出该精确修订的全部显式引用章和name字段，存在引用时提交准确`confirmedImpacts`。两类操作均在确认后重核身份／generation／原loaded对象，复用唯一attempt／sessionStorage键关联；未知响应不能另起保存，刷新不重建正文，确认收据后撤销verifiedRead并须显式读收据修订。移除不删基础据点／地图，不加章名称覆盖或原生初始化。

限定验证日志 `.dragon-analysis/editor-completion/chapter-city-ui-*`：

- `controller-r2.log` 87组通过（两个控制器入口）：新增配置／移除原键原body重试、刷新仅恢复关联、保留其它脏输入、确认取消／身份与游戏切换／存储配额、未知DTO锁定、坏引用／值／类型原子拒绝、显示副本隔离及准确改名影响清单。均为协议端口测试。
- `browser-r3.log` 工作台80项通过（`.dragon-analysis/editor-workbench/run-eMMSxU/result.json`）：真实gateway／Vue／CSP、新Chromium，API显式夹具；实际章选择、配置／移除、改名影响确认、收据后锁定和明确重读、缺DTO锁定及HTML文字不执行。前r1/r2也通过，r3是在消除新测试嵌套三元warning后重跑，不隐藏诊断。
- `build-r2.log`／`build-check-r2.log`：JS372547B、CSS33898B及8包notice逐byte一致；shell65通过。没有web/src／服务／DDL变更，不重建原生束、不冒历史API17组为本轮重跑；未跑无关完整Root、Trial、发布或生产链。
- `node tools/verify_editor_template_browser.mjs r22 --city-names-only`：实际Node共同服务、自有SQLite／FileBucket／HTTPS／41来源、真实管理员及作者登录改密、新浏览器10范围组通过。保留原名称7组，新增配置4→5真正提交后丢回应、其它脏输入不捎带、刷新原键查询／明确读取且只有一次配置POST；完整独立DTO与原生章缺口不变。更名取消不写，接受准确章ID／name影响后5→6，显示传播但旧5不变；取消／确认移除6→7，只去章配置，基础名／地图／旧6保持。管理员读作者7仍404，无正式IDB／外连／非预期错误，实际城市POST共5次且键各异。收据及截图在`.dragon-analysis/editor-phase/template-browser-r22/`，28项源码SHA运行前后复核一致，stderr为空。
- r20／r21均在原7组后测试导航失败：r20未处理副本输入离开确认，r21只处理一项而漏掉其它脏表单与副本的第二个确认，浏览器默认取消后等待隐藏控件超时。失败日志／stderr保留；仅测试在导航动作内处理并记录已有confirm，未修改产品离开守卫、未吞服务错误。r22收据记录三条导航确认后全新数据与浏览器重跑通过。
- 主动LSP四代码路径push-only未确认、draft.txt无服务；语法／diff检查通过。新workbench嵌套三元两条重复warning已改if并复跑；既有drafts.js布尔参数warning未屏蔽，末次mode=all warning视图18文件仍1项。两文档主动LSP一clean、审计仅既有SHA词典info；不是全仓LSP clean或完整编辑器验收。

## 后继中立章节引用诊断补齐

`gamesource.cityReferences` 原先只扫描原生 `state.cities`，会漏掉已保存的中立 `chapter.cities` 配置。现复用 `captureChapterCities` 验证显式配置：目标章加入 `chapters`，另给出 `CITY_AUTHORING_REF`；同章同时存在原生记录时章ID仅列一次，已有归属／太守／首都诊断保持。无cities字段不自动生成配置；未知ID、非中立归属、覆盖字段、坏形状及访问器拒绝，而不是报告无引用。`checkCityDeletable` 和既有草稿 `strongholds` DTO直接共用这条只读路径，192基础城市删除锁仍恒拒。

这仅补齐当前具名创作引用，不宣称完整事件／原始字节／战场引用闭包，不是新删除接口或规则原证。没有改变章源、运行槽、原生初始化或保存权限。

本批证据前缀 `.dragon-analysis/editor-completion/city-reference-neutral-`：

- `before.log` 三个新负控先失败；实现后 `focused.log` 24通过1失败为测试将共享 `chapterOrder` 直接传给既有原地复制writer，错误要求源不变。仅在测试复制前clone输入，未改writer合同；`focused-r2.log` 25项通过（引用6、章节城市5、据点控制器14），覆盖配置→复制→移除、章ID去重、未知配置拒绝和访问器零执行。
- `root.log` 聚焦实际Request／文件SQLite／FileBucket／41输入17组通过；新增精确GET证明配置的章节引用／诊断出现，移除恢复原报告、其它城市不变，旧修订不受影响。认证仍为种子夹具，不冒真实登录。
- `browser-r23.log`：`verify_editor_template_browser.mjs r23 --city-names-only` 新Chromium／自有HTTPS／真实登录及实际后端10组通过，收据 `editor-phase/template-browser-r23/receipt.json`。配置5读回新引用，更名6保留，移除7撤掉；原回包丢失／原键／影响确认／旧修订／隔离边界继续覆盖。29源码SHA包含本次gamesource；没有正式IDB、外连或非预期错误，stderr空。它不是完整默认workerd、Trial或发布链。
- 原生束234文件重建并复建unchanged，SHA `ffdb7e9356f23f0b9e0499be3e8d2c5ee6f8923448e8efc2bc592948c1749801`，两入口壳SHA保持；shell65通过。无Vue改动，不重建展示壳；未跑无关规则回归和完整Root长入口。
- 四代码主动LSP：1clean、2有辅助提示、1超时未确认；两大测试133项主要为既有await括号提醒。两文档主动warning视图无问题，mode=all的20文件缓存仍含drafts.js既有flag参数warning；未屏蔽、不称全仓clean。四JS语法及diff检查通过，原有CRLF提示保留；浏览器29源码SHA逐项复核一致。

## 后继章节复制与移除的实际保存组合

`verify_editor_template_root.mjs --city-names-only` 后继19组通过，日志 `.dragon-analysis/editor-completion/chapter-city-copy-api-r1.log`。除原17组外，实际共同Request／文件SQLite／FileBucket／41来源新增两个组合范围：

- 先保存原章中立城市配置，再在同一精确修订请求中复制该章并移除原章配置；复制按既定章节操作先于城市操作的次序捕获当时配置。原键重放返回同收据，新章ID唯一，副本保留引用、原章移除，基础名／地图不变，旧修订不变。
- 旧原章影响确认清单不再适用于副本，409且对象数不增；改用副本精确清单后，同请求删除原章并更改全局城名，副本配置／原生空state保留且读到新名。重建服务实例后最新／历史读回相同，Trial和release表仍空。

后继实际浏览器 `verify_editor_template_browser.mjs r25 --city-names-only` 12组通过（`chapter-city-copy-browser-r25.log`／`editor-phase/template-browser-r25/receipt.json`），真实登录／自有HTTPS／文件SQLite和桶／新Chromium，无成功API替身。界面配置8→复制9→移除原章配置10→取消删除无POST→确认删除原章11，副本配置独立保留、基础名／地图／旧9不变；9次保存键不同，无正式IDB、外连或非预期错误，stderr为空。它补足实际UI分步复制／移除／删除，不把API的同请求组合冒为UI单请求。

r24仅完成原10组后失败：测试误以为复制按钮会弹确认，实际既有复制为直接操作（仅删除确认），第一次点击已经保存9，故7次POST不等于错误期望6次。只修测试以匹配既有合同，未给产品增加确认或放宽门；全新r25重新跑完。两测试语法与diff检查通过，浏览器29源码SHA逐项复核一致；两JS主动LSP为超时／push-only未确认，两文档warning视图clean。末次mode=all的36文件缓存仍有drafts.js既有flag参数warning，不代表全仓clean，未屏蔽。

本次只扩验证器和文档，未改变产品接口、写入顺序或准入；不是全部人物／角色／数值组合、可玩空章或发布证书。未重建无变更两束、未跑完整Root或无关规则长链。

## 后继中立据点跨章配置只读清单

`CityDefinitionsPanel.vue` 直接从既有已验证 `model.cities.chapters` 投影推导每城引用，以可展开清单展示章名和稳定章ID；所选章改变不影响全部引用。没有第二份可写source、缓存引用或新API。无明确信息时显示未知，不将缺DTO视为零引用；零配置明确不代表道路／事件等没有引用。清单限定已读修订，不冒最新服务状态或完整删除检查，仍无基础据点删除操作。

本批日志前缀 `.dragon-analysis/editor-completion/city-reference-ui-`：

- `browser.log` 工作台新Chromium85项通过（`editor-workbench/run-kmr7KZ/result.json`）：真实gateway／Vue、显式API夹具。新增零配置说明、其它章引用独立于所选章、含HTML章名按文字转义、展开／切章无POST或额外请求、缺DTO显示未知且不保留旧清单。不是此夹具证明后端权限。
- `real-r26.log` 实际Node共同服务／文件SQLite／FileBucket／自有HTTPS／真实登录／新Chromium13组通过，收据 `editor-phase/template-browser-r26/receipt.json`。沿真实配置／复制流程，修订9展示父章与副本，移除父章配置10及删除父章11后只列副本；检查清单不增加保存，总9次原操作写入。保留原键丢响应、影响确认、旧修订及权限隔离检查，无正式IDB／外连／非预期错误，stderr空。29项记录源码SHA前后保持；不冒完整workerd、Trial或发布链。
- build/check逐byte一致：JS374325B／CSS33898B／8包notice，shell65通过；仅展示组件与两浏览器验证器变更，无控制器／服务／web/src改动，不重建原生束或跑无影响Root／规则长链。本轮无失败测试。
- 三代码主动LSP未确认（1超时、2 push-only），两文档warning视图clean；mode=all缓存50文件仍有drafts布尔参数、能力测试字符串建议、原证数值解析3项既有warning，未屏蔽、不以无warning称全仓clean。两验证器语法及diff检查通过，保留原有换行提示；完整实体与删除闭包仍未完成。

## 后继数值写入与静态城市来源复核

这是A14／A19当前代码和固定来源的只读复核，不是新字段实现。原`editChapterCity`及HTTP `chapterEdits` 的`city`操作仍只允许troops／prod；growth／defence解析已保完整byte，但[工程合同§3.1](game-editor-technical-design.md#31-创作字段目录)明确表示域不等于可编辑域。原治理恢复常量200、五库防災样本最大100和u8上界255不能互相替代；本轮原字节及数据重核回流[已有原证维护源](re-notes-entity-fields.md#city-condition-domain-review)，没有重复创建规则或消费者测试工具。

**实测代码事实**：复用`createPinnedCopyLoader`的固定41输入，仅内存调用既有writer。上库第一章槽0的prod=20714（0x50EA），改为20458（0x4FEA）后，具名prod和`city.raw`均改变，但同槽`state.nativeCityRecordRaw`仍为原0x50EA。`aliasStateByte(state,0x84F,...)`实际返回80，修改后的生产力高字节则为79；原源不变。收据为`.dragon-analysis/editor-completion/city-condition-source-review-r2.json`。初次记录`city-condition-source-review.json`只减100，没有跨高字节，不能用它声称别名返回已发生数值差异。

`scenariomonthlydiplomacy.readNoCandidateRelationAliasByte`已有代码按`0x600+24*actor+0xFF`读取，actor14对应0x84F；这里先核直接别名读取器，**没有执行完整fresh／月结、实际HTTP保存、Trial或证明某场战局结果已经改变**。该地址来源与FFFF候选门的原证／工程边界仍由[外交原证](re-notes-ai-diplomacy.md)维护，不修改运行期静态／活动字段政策。当前Python `compile_chapter`会从回写后的城raw派生整张静态表并拒绝已有表分叉，而互联网JS编辑不能据此被宣称已执行该Python步骤。

这揭示新增字段之前必须处理的来源绑定缺口；旧N3“decoded＋raw同步”只覆盖具名值与单城raw，不能扩大成全部原生来源同步。`copyprofile.js`用同一个旧writer重建复制时点及校验raw，不能直接改变旧`city`语义、重编码历史正文或更新原键结果。后续应先明确兼容的新增操作／版本和精确写集，核初态静态表、复制捕获、原键恢复、历史可读及实际运行读取；不能只加表单、任意改另一表全部字节或用全源放行豁免消除分叉。该只读复核时未选择或实施新版本；后继独立共同写入器见下，HTTP／历史版本仍未接。没有放开growth／defence、角色、城市放置或容量门。

本批仅文档和隔离只读记录，不新增正式回归断言锁定错误行为，不重建两束、不重复未变产品的浏览器／规则长链。CodeGraph本轮会话超时、符号索引构建中，改用已知符号体／明确路径读取；未解锁工具或改变信任设置。

## 后继显式静态城市字段共同写入器

新增 `gamesource.editChapterCityNative(game, chapterId, cityIdx, values)`，不修改旧`editChapterCity`、旧`city`命令或历史重放。复用原troops／prod的来源、数值、cap及单城raw校验／编码，再仅同步本次明确请求字段的静态城市字节：troops为+13，prod为+0E／0F。不重算其它字段，不补缺表，不从地图或运行结果重建初态。192笔32B静态表必须完整有效；目标记录除这三个已有编辑字节外须与单城raw一致，受保护字段分歧明确拒绝。

已有旧操作导致的troops／prod静态差异可以分别处理，但必须在请求里明确给出该字段。仅给prod时不顺带修复troops；同一具名值若静态来源不同仍产生新副本，全部请求字段已一致才是真no-op。未改字节保原表示，大小写等价不强行重编码。旧源、其它章、其它城市槽和未知字段保持。此函数为新增操作的共同核心，**该批尚无受信历史／HTTP／表单调用**；后继内容profile接线见[独立历史](#后继city-native内容历史)。不能据本节称互联网已有存量草稿自动修复或所有据点保存已改为新行为。

复用 `tools/verify_editor_city_fields.mjs`，`city-native-writer-content.log` 首轮43项通过（原17＋26）：生产力20714→20458，具名值／单城raw／静态raw一致，直接别名读取0x84F返回79；原旧操作的静态表保持不变以保历史语义。另核两个旧字段分叉时仅修请求prod、随后显式troops完成绑定、no-op、零值宽度、cap／未开放字段拒绝、缺／短／坏／稀疏静态表、五种受保护字节分歧、其它191槽／其它章／输入不变。这里只调用真实内容writer与别名读取器，不是fresh／整月规则执行。

旧 `verify_vps_city_save.mjs` 在300秒整串命令预算内输出16条阶段成功（到第二次旧city保存及raw保留），随后超时，`city-native-writer-legacy-save.log` 无最终收据，**整链未确认**。查询没有本工具残留Node进程；未杀其它进程，也不把阶段输出当新接口已保存。超时后单独完成原生束两次构建，第二次unchanged：236文件，SHA `2a137e6320fb48ace7d1dd68f30567f2a34880a82551c87ca903a1bbcac8a97d`；trialapp／playapp两壳不变，固定库及20程序指纹核同，无新注册／部署。shell65、两JS语法及diff通过。

源代码主动LSP等待300秒仍push-only未确认；测试有6条原有console辅助警告（只是随文件纳入缓存，不抑制）。无服务、DDL、Vue或规则改动，不重建后台壳或重复无影响浏览器／Trial／发布长链。下一出口是显式新命令的精确历史校验／保存接线及兼容验证；旧命令正文、键和重放结果必须保持。

## 后继city-native内容历史

`server/copyprofile.js` 的完整副本内容能力新增独立 `city-native` 章节指令，沿共同 `editChapterCityNative` 重放；旧 `city` 仍调用旧writer，不改旧正文、历史值或幂等键。该批没有修改 `server/drafts.js` 请求允许项／执行分派，当时HTTP仍拒绝新指令；后继保存服务接线见[草稿保存服务](#后继city-native草稿保存服务)。中立逐请求历史及表单未在该批开放。

受信lineage按原顺序重放新指令后才捕获章节复制时点；删除或复用生成ID时清理该生命周期的新指令标记。对仍存活且被新指令修改的章，先逐项比较候选完整静态城市表与受信重放结果，并核受影响城的troops／prod／raw（包括后续旧指令造成的合法差异），再仅在比较副本中恢复原始或复制时点静态表，走既有窄字段逆向核验。不是从候选表取得授权，也不以覆盖原表掩盖其它槽／受保护字节改写；被删除源的后代仍保留复制时点独立快照。

复用 `tools/verify_editor_copy_profile.mjs --city-native-only`，与默认全入口调用同一个聚焦函数，仍真实读取41个固定Web来源、20章及2540条来源记录。聚焦通过：纯旧city保原静态表；新旧操作名不能互换；新操作实际JSON往返；当前城受保护字节／两个编辑字节及其它城市槽篡改拒绝；具名值和单城raw一同改写但缺对应历史仍拒绝；新→旧→新混合历史与具名no-op的静态修复；复制后再次新写、复制后代再删除两个来源、生成ID复用；删除不能隐藏无效负值历史。固定源输入与原capability摘要保持。最终日志 `city-native-profile-focused-r4.log` 及其中源码／41输入SHA限定此内容能力证据，不冒持久请求历史、认证、HTTP、运行或完整profile认证。

默认完整入口首轮900秒无输出超时，`city-native-profile-r1.log`为空且无收据，该轮未确认（后继[完整复验](#后继完整副本内容历史复验)已单独取得收据）；未据此归因或放宽校验。测试拆分期间的临时语法问题已在运行前修复；聚焦r1／r2／r3通过，r3后diff发现本轮新增EOF空行，删除后重跑最终r4。未杀其它进程，查询无该工具残留Node。未改web/src／Vue／DDL，不重建两束或跑无影响浏览器／Trial／发布／规则长链。两JS语法与最终diff通过；两代码主动LSP300秒均push-only未确认，两文档warning视图clean；mode=all为135文件、53条既有警告及2条此前JSON往返误报，未抑制。该批待办为持久历史、两profile兼容、精确保存／原键恢复和界面；后继保存服务分范围证据见下，A14未完成。

## 后继完整副本内容历史复验

此前900秒超时的默认 `node tools/verify_editor_copy_profile.mjs` 本轮以1800秒命令预算完整执行，通过 `PASS-PINNED-COPY-CONTENT-DELTA`，用时约1158秒。仅给既有测试添加stderr阶段计时，不拆分默认流程、不跳过断言、不改变产品或原规则。阶段日志显示约925秒才完成复制角色删除组合；这说明本次完整执行确实超过旧预算，但不能反推此前每次超时的唯一原因。

本次覆盖固定20章／2540条来源记录、元数据与四资源变化、章结构历史、旧city与city-native混合、复制时点的文字／画像／角色、删除后代与生成ID复用，以及对应JSON往返和受保护字段负控。收据`rejects:78`只计数既有`rejected`及显式增量分支，不是全部断言／用例总数；getterHits为0。默认入口完整通过不等于中立模板、全字段编辑、原生初始化或运行机制认证。

证据目录 `.dragon-analysis/editor-completion/copy-profile-full-20261029/`：`tests-r1.log`保存阶段与最终收据；`before.json`／`after.json`的524项选定server、web/src、固定Web资源及四工具SHA保持，收据内41个实际输入与3个源码SHA逐项吻合。I/O仅固定Web源读取、内存内容克隆／校验及隔离日志，不访问DOS存档、数据库、网络或浏览器。未改服务、Vue、DDL或程序束，不重跑无影响发布链。

语法与diff检查通过。测试主动LSP超时未确认；mode=all另报两处既有JSON往返建议，测试需要检验实际JSON表示，不能替换成structuredClone。两文档主动检查一clean、一有三条既有词典提示（历史DELET／库hash片段），无error；缓存不是全仓clean证书。当时旧VPS保存长链与workerd／Node复制实体浏览器长链的超时仍未补齐，不以本次内容验证代替；VPS默认入口后继收据见下节，浏览器长链仍未确认。A14／A18／A19仍为部分。

## 后继VPS完整保存与独立目录恢复复验

默认 `node tools/verify_vps_city_save.mjs` 本轮完整通过72项，退出码0；没有修改测试、产品或断言。实际文件SQLite／FileBucket与PrivateDrafts服务覆盖旧city连续保存、章复制及后代独立、关闭数据库后的完整目录复制、恢复服务的投影／快照绑定／原收据一致、继续CAS保存与第二次服务构造，以及角色／画像／章名历史、删除来源保后代、ID复用和资源修改后解散再复制，最终到修订17。原目录的SQL和对象树摘要保持，只有数据库而缺对象的恢复明确拒绝。

证据目录 `.dragon-analysis/editor-completion/vps-city-full-20261029/`：首轮`tests-r1.log`到修订15后无最终收据，查询已无该测试进程，终止原因未确认，不计通过；独立执行记录的`tests-r2.log`末行为`passed 72 checks`，`exit-r2.txt`为0。`before-r2.json`／`after-r2.json`的552项选定源码、固定Web内容及工具SHA相同。语法检查通过。测试只读固定Web源，写入自有临时目录和证据日志，成功路径关闭服务并清理临时目录；不读取DOS存档、生产备份或用户浏览器数据。

此默认入口保留旧city历史；新city-native服务范围仍以其独立模式收据为准，不将默认入口冒充全部混合模式。principal、安装源和operationGuard为显式端口夹具，不证明HTTP登录、浏览器、完整50表应用恢复、远端分发、删除排除或原生角色机制；workerd／Node复制实体浏览器长链及完整编辑器仍未完成。本批仅回流验证文档，不重建程序束或重复无影响发布／浏览器测试。两文档主动LSP与mode=all仅四条既有词典提示（历史DELET／库hash片段），无error／warning；不称全仓诊断清零。

## 后继city-native草稿保存服务

`server/drafts.js` 请求捕获接受独立 `city-native`，沿旧city相同的精确四键、troops／prod整数及16项／16KiB预算，不增加字段。保存分派调用共同native writer；旧 `city` 分派和正文不变。新操作名原样进入 `draft_requests.request_json`，精确修订读回继续由原持久历史捕获与完整副本profile核验；未修改CAS／权限／异步复核／对象账本／原键恢复。中立空章没有原生城市表，本批不增加初始化或中立数值能力。

复用 `tools/verify_vps_city_save.mjs --native-only`，沿现有真实文件SQLite、FileBucket、PrivateWriteJournal、快照／元数据与PrivateDrafts服务，来源仍为固定20章副本。principal及安装源记录为明确端口夹具，不是实际HTTP／登录或浏览器。新增模式只跳过无关的长篇复制／备份恢复组合；默认模式保留原流程。

`city-native-save-r2.log`最终20项通过，末行收据绑定10个源码SHA：旧city保存1→2，具名troops／prod改变但静态表保持；新city-native保存2→3仅请求prod从20714降至20458，生产力具名值／单城raw／静态raw一致，旧troops静态差异不顺带修复。完整源与按明确字节写集构造的期望一致，其它字节、191槽及其它章保持。两种原操作名按各自正文持久化；新键查询返回committed修订3，完全相同的原键／原expected2重放返回同收据且对象数不增加；同键改回旧city、旧CAS新键及未开放defence分别拒绝，未产生草稿对象。最后重新捕获旧修订2，完整源与此前一致。

首轮 `city-native-save-r1.log` 仅查询断言失败：测试误读顶层draftRevision，实际既有查询合同为 `{state,result}`；改取result后重跑通过，未为此修改产品。持久JSON读取异常在测试中保留cause并抛出，未吞错或屏蔽诊断。两JS语法及diff通过，两代码主动LSP300秒仍push-only未确认。此前完整profile900秒、旧VPS整链300秒超时在本批仍未确认；本批不是它们的全量替代。完整profile后来已有[独立全入口收据](#后继完整副本内容历史复验)，旧VPS默认整链后来也有[72项完整收据](#后继vps完整保存与独立目录恢复复验)。无web/src／Vue／DDL变化，不重建两束或重跑无影响浏览器／Trial／发布／规则。仍须补实际Request／HTTPS、作者表单的新命令选择及跨profile／更多历史组合，不宣称A14完成。

## 后继city-native共用保存journal动作

核对实际按钮前发现 `server/public/stronghold.txt` 的旧 `saveCity` 直接POST旧city、每次生成新UUID，成功后还会自行重读；它没有使用共用草稿journal。因此不能仅替换操作名就宣称原键恢复闭合。该动作批未改旧适配器或按钮（旧写入口随后[退役](#后继旧据点适配器只读化)），先在 `server/public/draft.txt` 增加 `actions.cityNative(request)`；后继实际界面接线见[共用据点数值表](#后继共用据点数值表)。

动作要求完整副本已验证读取、无其它未确认操作，request的gameId／draftRevision／chapterId／cityIdx对应当前已读上下文；只收明确troops／prod非负安全整数，不猜未知上限，实际值域仍由共同writer及服务核验。确认后再次核身份、代次、原loaded对象及请求输入；用**已保存metadata**和空resourceEdits构造独立city-native正文，不带其它脏表单或未读999。复用唯一attempt／persist／sendAttempt，留不住原键就不发送；确认收据后只更新精确修订并要求显式重读，不自动GET。该类隔离保存的accept保留其它未保存名称及资源输入。

复用 `verify_editor_draft_controller.mjs`：`city-native-journal-r1.log`和最终r2均81组通过（原78＋3，r2补存储拒绝分支）。覆盖取消零请求、成功唯一POST／保存metadata／revision1而非999、保其它dirty、收据不等于已读；未知回应阻断新city及普通保存，查询失败后重试原key／body，调用者后来改值也不重造；刷新只恢复key、不能retry重建body，只query原结果；错误身份／章／槽／字段／负零／小数、确认期间改输入或身份及存储失败均不发请求。传输为明确控制器夹具，不冒实际HTTP或已改按钮。

shell65、测试与TXT加载语法、diff通过；测试主动LSP300秒仍未确认，TXT无配置服务，两者不称clean。未改Vue／web/src／后端或DDL，不重建两束、不重复无影响浏览器／VPS保存／Trial／发布／规则。该批剩余的界面接线已在下节推进；旧独立save路径不作为新功能完成出口。A14／A19仍未完成。

## 后继共用据点数值表

`StrongholdPanel.vue`新增共用草稿数值表，显示当前游戏明确读入的完整副本／章／城市槽及原记录上限；保存只走 `draftActions.saveNativeCityInputs`→既有cityNative journal。原独立据点表移除数值输入和保存按钮，只保留只读引用、定义ID及删除阻止项检查；历史适配器代码未改，不把它当新保存入口。两表分别标明来源修订／只读用途，不能拿独立引用表的读取替代共用草稿加载。

原生控制器在成功精确读取的最后阶段才安装私有 `nativeCities` 投影与清除行输入；旧回包缺城市数组则未知，不补值，中立profile不提供此数值能力。非数组、重复／越域槽号、坏名称／数值拒绝整次读取，保旧代次与输入。所有章的局部输入由共用控制器持有，纳入离开／重读／Trial的脏输入提示；切章不隐式丢输入，单城取消只清该行，无GET／POST。保存前核已读上限、非负安全整数及非空，仅发送该行实际变化字段；`10.0`等与原值相等的输入只恢复显示，不耗修订。

保存确认仍沿精确loaded身份与唯一原键，不带未读999或其它名称／资源／其它城市输入。未知回应时整表锁定，须查询原操作后才有条件重试原正文；成功收据不自动读新修订。旧数值仍明确标为旧已读修订并禁写，保存行的准备输入清除，其它行及其它面板脏输入保留；明确重读成功才全体换成新值。界面提供原键查询、原内容重试及精确修订读取，初始模型尚未安装时不读取缺少的投影。

本轮复用既有入口，日志前缀 `.dragon-analysis/editor-completion/city-native-ui-`：

- 控制器r1／最终r2均83组通过（81＋2）；新组覆盖单行保存与其它行保留、取消／超上限／数值等价零请求、私有已读revision1而非999、旧DTO未知、坏DTO原子拒绝及成功重读才清输入、身份失效隐藏。r2补等值文本场景；原journal未知结果／原键／存储拒绝等回归保持。
- 工作台r1／r2均182组通过（181＋1），最终 `.dragon-analysis/editor-workbench/run-9M2YqC/`。全新Chromium、实际Vue／gateway、明确API夹具；核旧引用表无输入，新表脏离开可取消、单城取消零请求，确认取消零POST，保存只发city-native及明确troops。刻意错身份收据导致保输入／锁表，无自动GET；查询返回夹具失败状态后重试解锁，再明确读原修订恢复可编辑。不是新的实际后端HTTP保存证书。
- Vue build/check逐byte一致、shell65、两MJS与通过加载执行的TXT语法、diff通过。三个代码主动LSP300秒push-only未确认，TXT无服务；不冒clean。无web/src／后台／DDL变化，不重建原生束或重复无影响VPS／Trial／发布／规则长链。

该UI批尚未补实际完整副本HTTPS联测。随后 `verify_editor_backend_draft_ui.mjs` 已迁移共用表并取得下节限定证据；stage入口在该批仍待迁移；后继[冲突与未知回应聚焦](#后继stage入口据点冲突与未知回应)已接共用表，不沿用旧据点控件成绩。服务端20项及内容历史聚焦成绩保持各自原范围，不拼成完整界面认证；A14／A19及整个编辑器仍未完成。

## 后继共用数值表真实HTTPS保存

复用 `verify_editor_backend_draft_ui.mjs`，据点步骤改为共用 `native-city-table`、明确确认及显式读回；旧引用表断言无输入。保留默认长链及 `--copied-entity-only`，新增 `--node-service` 复用项目已有Node共同服务／文件SQLite／FileBucket与自有HTTPS，另以 `--city-native-only` 在复制章据点保存后结束，不重复无关的武将改名／后代复制删除。没有API成功回包夹具，也没有修改产品／服务或放宽profile。

证据前缀 `.dragon-analysis/editor-completion/city-native-ui-http-`：

- r1的workerd复制实体链900秒超时，只有setup与复制章阶段日志；r2的Node复制实体链同样900秒超时，已进入后续实体副本删除阶段，但无最终收据，均未确认。r1后检查未见该工具存活Node，未终止其它会话。日志不足以判定两个超时的唯一根因，不能算通过或凭此归因产品失败。
- r3以 `--city-native-only --node-service` 完成；随后仅将测试scope输出的嵌套三元改为明确if分支，最终r4同样通过。最终收据在r4日志内，`scope=city-native-only`、两个范围组、22个源码SHA；截图 `.dragon-analysis/editor-phase/backend-draft-ui-session-r1/ui-r99.png`（r3的ui-r98亦保留）。真实管理员登录／改密、完整20章副本、复制首章至修订2，共用表选择独立复制章；改兵力并把未读修订输入设999。确认取消零请求且保输入，确认保存只发 `city-native`／明确troops与已读修订2，不带999。收据3之后没有自动GET，旧行数值仍显示原值且禁写；明确读取3才显示新兵力并解锁，选择章ID保持。独立精确GET核原章及旧修订2整个DTO不变。
- 两次浏览器保存请求分别是复制章与单城修改；意外错误／外连为空，正式IDB访问断言0。章缺口展开与真实DTO计数一致且不新增请求。没有在此聚焦模式测试丢回应／重试、生产力输入、全部城市字段、后代复制删除或中立初始化；那些已有端口／控制器成绩仍各守原范围。

测试语法、diff、链接及22个收据源码指纹复核通过；主动LSP等待300秒，工具仍push-only未确认，两文档warning视图clean。mode=all缓存137文件，51项既有warning及此前已标记的两项JSON往返误报仍列，未屏蔽。此批只改既有浏览器工具与文档，不重建不变的后台／原生束，不重复无影响规则、Trial或发布长链。该批较长的两个模式尚无完整收据；Node与workerd复制实体模式后来分别取得[七组完整复验](#后继复制实体https长链复验)。stage入口后继迁移见下节，A14／A19及完整目标未完成。

## 后继复制实体HTTPS长链复验

本轮不改产品或测试，以 `node tools/verify_editor_backend_draft_ui.mjs <新截图路径> --copied-entity-only --node-service` 补齐此前Node模式900秒无最终收据的范围。实际本地HTTPS、独立文件SQLite／FileBucket及全新Chromium，真实管理员登录／改密、固定来源完整复制；没有成功API回包夹具。七组完整通过，六次浏览器保存、一次已提交回应丢失，退出码0：

- 复制章修订2，共用据点表取消零请求；city-native以已读2而非输入999保存3，旧表锁住至显式读取，原章／旧修订保持。
- 共用武将改名／字以已读3保存4，取消不写；精确读取与独立表刷新后才解锁。
- 复制已改实体章保存5后丢回应，刷新只保gameId／revision／key；原键查询不重发POST、不自动读源、不开放Trial，显式读取5才安装唯一后代。
- 删除来源保存6，后代全文保持；再删后代保存7，全部20原章DTO恢复为原先内容。这里删除的是草稿章节，不是A30物理删除。

证据：`.dragon-analysis/editor-completion/copied-entity-https-20261029/{before.json,after.json,tests-r1.log,exit-r1.txt}`；602项选定源码／资源SHA前后保持，收据25项源码及截图SHA复核一致，截图 `editor-phase/backend-draft-ui-session-r1/ui-r103.png`。意外错误／外连均空，正式IndexedDB访问0；仅预期首次会话401及主动丢回应网络错误。测试创建的自有临时资料保留，浏览器／监听和SQLite已关闭；未访问真实存档或生产内容。

语法、diff及链接检查通过；两文档主动LSP与mode=all只有五处既有收据标识／摘要的词典hint，无error／warning，不冒全仓clean。本批只补当前Node模式收据，不冒workerd重跑、默认combined完整链、全部字段／任职规则、中立初始化或可玩准入。此前超时记录保留；A14／A18／A19及完整目标仍未闭合。

### 后继workerd模式完整复验

同一入口去掉 `--node-service`，以新临时配置／本地workerd SQLite／R2及新Chromium独立运行 `--copied-entity-only`，七组亦完整通过，六次保存至修订7、一次已提交回应丢失、退出码0。同样核city-native／武将共用journal、4→5原键查询后显式读回、删来源保后代及全部20原章保持；不是复用Node的数据库或成功回包。测试未修改，不运行默认combined模式。

证据目录 `.dragon-analysis/editor-completion/copied-entity-workerd-20261029/` 含 `before.json`、`after.json`、`tests-r1.log`、`exit-r1.txt`；603项选定输入SHA前后保持，收据25源码SHA及截图 `editor-phase/backend-draft-ui-session-r1/ui-r104.png` 摘要复核通过。意外错误／外连空、正式IDB访问0；仅预期初次401与主动丢回应错误。独立本地临时资料保留，浏览器、HTTPS及Miniflare已正常关闭，无部署／云桶访问／真实存档操作。

两个旧900秒超时记录仍是当时未确认结果；本次分别取得两运行时收据，不倒改旧成绩。语法、diff及锚点检查通过；两文档主动LSP和mode=all仅五处既有标识／摘要词典hint，无error／warning，不冒全仓clean；仍不证明完整字段、中立可玩初始化、Trial／发布或A30物理清理。

## 后继stage入口据点冲突与未知回应

`verify_editor_backend_stage_ui.mjs` 的据点步骤改为共用数值表、明确确认、`city-native`、原操作查询和显式读取；原 `stronghold-cities` 只查引用及删除限制，不再操作输入。共用修订由1依次读到2／3／4，后续地图／武将步骤不再错误期待共用上下文停在1；它们自身的独立读取语义不变。新增同入口 `--city-native-only` 跳过六种资源阶段任务、结构GET及地图／武将长链，复用既有 `EDITOR_TEST_NODE=1` 自有HTTPS、文件SQLite／FileBucket、固定源及资源库安装、真实管理员完整副本和两个隔离浏览器context。主浏览器仅继承必要环境变量并禁用service worker，未改变用户profile或全局TLS信任。

证据前缀 `.dragon-analysis/editor-completion/city-native-stage-`：

- r1在越上限负控失败：测试误从 `native-city-message` 查异常提示；共用动作实际在全局 `#status` 展示抛出的范围错误，且未发保存。只更正测试定位，产品不改。失败日志及 `backend-stage-ui-session-r1/failure-r93.json` 保留。
- r2（round94）完成五组，`PASS-REAL-ROOT-STAGE-UI-SCOPED`／`scope=city-native-only`，截图 `backend-stage-ui-session-r1/ui-r94.png`。越上限零POST、脏离开取消保输入；首次city-native以修订1保存2，收据后行禁写，明确读取2才解锁。独立删除检查不写数据。另一个真实服务请求保存3后，仍持修订2的浏览器写入收到412，输入保留且锁定；查询原失败操作，再确认放弃并明确读取3，不追随latest或默默重造正文。
- 最后city-native以修订3提交4，浏览器仅丢弃该已提交成功回应；输入保留且锁定。查询原键确认4后仍须明确读4才恢复编辑，没有自动重试。`cityPosts`记录三次浏览器保存（成功2、412、已提交但回应丢失4），不是三次成功提交；竞争保存3另由真实服务请求完成。
- 另一作者看不到管理员副本或据点输入；实际改密撤销旧会话，后续GET401返回登录并清除共用据点及其它私有投影。errors／outside为空，正式IDB访问断言0。收据固定34个源码SHA，未使用成功API回包夹具。

工具语法、diff、链接及收据指纹复核通过；工具主动LSP等待300秒仍未确认。此批只修改测试与文档，不重建不变的两束或重跑无影响控制器、工作台、规则／Trial／发布。该批完整stage组合及六种资源阶段未重跑，不能据五组聚焦宣布整条工具通过；后继[Node默认stage完整17组](editor-backend-stage-ui.md#后继默认组合链完整复验)已单独补齐，仍非workerd默认组合。此前完整复制／profile／VPS超时的各自后继收据见本页相应章节，不以本次stage测试代替。仅关闭现有数值表的冲突与未知回应接线证据，不是全城市字段、跨profile创作或完整A14／A19验收。

## 后继旧据点适配器只读化

共用数值表接线后，`server/public/stronghold.txt`仍曾暴露旧 `actions.edit/save`，能独立生成UUID并直接POST旧city，绕过共用journal。现移除这些动作、对应写函数及独立数值输入／脏状态，只保留refresh／inspect／selectGame／selectChapter／blockers五个只读动作。投影仍提供字符串数值、cap、稳定ID与引用；`saveDisabled=true`、`dirty=false`保兼容，`canLeave`只代表此只读参与者无需确认，不代替共用draft对真实数值输入的离开守卫。异步身份／generation与全局上下文回调检查保持。

没有移除服务端旧city操作、持久正文或历史重放，也不改变city-native、数据库、源或运行规则。旧页面已加载的旧模块不是本次修改能远程撤销的会话；不把删除本地适配器动作说成服务端新增权限边界。

复用验证（证据前缀 `.dragon-analysis/editor-completion/stronghold-readonly-`）：

- `verify_stronghold_ui_model.mjs`改为八组只读合同，API夹具拒绝任何正文／写选项；核动作白名单、数值投影不可反写、上下文回调失效、坏读原子保留、引用未知／坏格式、槽身份及迟到身份切换。旧独立写入／收据／脏表单测试随已退役入口删除；对应在用写合同由既有共用draft控制器验证，而非保留第二套保存测试。
- `verify_editor_authoring_context.mjs`把数值脏输入转入draft的nativeCityInputs：与名称共用一次确认，外部工作流否决前不清任何输入，只读据点投影保持原值。与refresh上下文及draft控制器四入口合计108项通过，包含原83项共用draft检查。
- 既有全新Chromium工作台182组通过，产物 `.dragon-analysis/editor-workbench/run-Qlh2Kv/`；实际Vue／gateway但API明确夹具，不冒本次真实HTTPS保存。shell65、两MJS语法、TXT执行加载及diff通过。

一次精确编辑因投影与已删除函数中有同名片段而部分应用；已按工具回报只补唯一投影位置，未运行未修齐状态。两测试主动LSP等待300秒，一项warning视图clean、一项push-only未确认；两文档warning视图clean，TXT无LSP服务。未改Vue或web/src，不重建两束；未重复无影响真实保存、规则／Trial／发布长链。此批关闭遗留客户端旁路，A14／A19及完整编辑器仍未完成。

## 后继发布据点图片依赖拒收

工程核查发现：全量结构编译不检查 `city.view` 对应图片，发布包准备此前也未调用Trial已有的据点图资源门；后续静态预检验证登记文件与八季节引用，不能据此证明任意章节据点图片引用存在。复用 `verify_vps_publish_pack.mjs` 将首章及末章一城view改为255，均通过结构编译且旧prepare不拒绝；`city-view-publish-before.log` 保留两条FAIL及整体退出1，未安装这些坏候选或公开发布。

`trials.js` 仅导出原 `cityViewGaps`，算法／缺口DTO不变；`PublishedPacks.prepare` 在逐章复制和任何异步图像读取前校验cities数组，并调用同一函数。该函数由固定 `FIXED_TRIAL_ASSET_PATHS` 的实际kyo路径建立集合，不另猜数值范围；缺路径返回422 `PLAY_CITY_VIEW_MISSING`，坏数组沿422 `PLAY_SNAPSHOT`。不改草稿保存、城图字段、source或原生机制，不补图片或默认值。这只确认声明路径域，不替代资源字节／SHA及全部显示消费者闭包。

证据前缀 `.dragon-analysis/editor-completion/city-view-publish-`：

- `after.log` 真实临时SQLite／FileBucket、固定源安装和全量编译端口 **43项通过**；首末坏章在准备阶段拒绝，三张发布包表无新增行，正常20章、画像拒收、重发及陈旧／损坏负控保持。坏章为prepare端口内存候选、principal为夹具，不冒真实HTTP草稿保存／发布协调器证书。
- `report.log` 既有章节缺口报告 **10项通过**，保持Trial原报告合同。
- `atomicity.log` **15组通过**：合成compiled输入的真实SQLite事务接缝。原最小夹具显式补入合法据点图片0；坏数组和缺图两例在visual capture前拒绝，现存发布包及全部九表快照保持；异步读取期间把调用方view改255，准备包仍持有检查过的0。原逐表故障回滚、ordinal不耗号及迟到身份检查继续通过，非完整编译或HTTP证据。
- `bounds.log` 原地图门 **9项通过**；四代码语法及diff通过。主动诊断、源码指纹和范围见 `city-view-publish-final-hashes.json`，未确认项不记clean。

无web/src／Vue／DDL或资源改变，不重建两束，不重复无影响浏览器／规则／实际Trial及完整HTTP发布长链。A20／A32及完整据点创作仍未完成。

## 后继已读上昇率与防災只读展示

共用草稿据点表增加上昇率／防災两列，读取同一明确修订而不新增请求。`server/drafts.js` 从已核源的城市命名字段投影 `growth/defence`，缺失投影null；`draft.txt` 在安装新投影之前核可选u8值，旧DTO缺字段／null保持未知，非法字段原子拒收并保旧已读表和未保存输入。表示域0..255只是读取边界，不是编辑或运行准入。

`StrongholdPanel.vue` 显示growth原值及相对100的差值，defence显示为「防災」，不称城壁；不从raw补值，不新增输入、dirty状态或写入命令。保存仍仅已有troops／prod及city-native原语义。成功收据不会使旧值冒充新修订；换章只切换已读投影，取消／未知操作仍沿共用journal。

显示依据复核固定 `KI.EXE` SHA `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，`7EB2..7EDB` 窗口SHA `f49eaf615906adb1b78b3058dda6ff8456564df776302048a3a54e7e519c808e`：C10零扩展减100，99按16位CWD，C11零扩展直接送显示；记录 `city-condition-display-review.txt`。复用[字段域原证](re-notes-entity-fields.md#city-condition-domain-review)，未取得新编辑上限证书，不把恢复阈值200、样本最大值或u8容量用作写入许可；没有改规则或初始化。

证据前缀 `.dragon-analysis/editor-completion/city-condition-`：

- `controller.log` 105组通过（103＋2）：0／100／255及null／旧DTO缺字段、投影隔离；两字段不能通过setNativeCityInput形成保存，16个坏值组合保旧readGeneration及prod脏输入。原保存／原键流程保持。
- `browser.log` 新Chromium实际Vue／gateway **213组通过**，产物 `.dragon-analysis/editor-workbench/run-Sp3Zcg/result.json`；明确API夹具的0显示为原值0／差值−100，防災0不是未知；换章缺字段显示未知，切回恢复且无额外GET／POST，两列无输入，原troops保存正文仍不带这两项。不是实际HTTPS保存／权限证明。
- `ports.log` 既有 `verify_vps_city_save.mjs --native-only` **22项通过**：真实临时文件SQLite／FileBucket、41固定源装配，读回20章3840城两字段逐项等于已保存源；growth与defence写入仍拒，读取／拒绝不新增对象，旧历史／CAS／原键重放／修订2原样可读保持。principal与来源登记为端口夹具，不冒登录或网络证据。
- Vue build/check逐byte一致、shell65；代码语法／TXT实际导入、diff／链接及主动诊断见 `city-condition-final-hashes.json`。无web/src、规则、DDL或画像资源改变，不重建原生束，不重复无影响Trial／发布／规则长链；完整字段编辑及A14仍未完成。

## 尚未完成

据点名称的真实后端浏览器联合保存限定证据已补；不是完整据点／章节编辑、初始化或发布验收。继续保持旧body缺省与旧基线可读、精确CAS／原键恢复、DTO未知／已配置区分。章节城市受信历史、HTTP／DTO、影响确认与配置表单及真实浏览器已有上述限定验证，仍不构成完整实体创作／全字段／跨模块组合验证；数值继承／覆盖尚未实施。城型／图片、数值、移动、道路、容量、原生初始化与完整发布依然分别受各自证据门限制。
