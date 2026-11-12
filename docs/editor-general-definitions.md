# 中立草稿人物基础定义、API与表单

## copy头像目录轻量读取（现行）

当前 copy 武将页的头像弹窗请求 `GET /api/games/:gameId/portraits?usage=0`，返回 `{gameId, portraits:[{assetId,sha256,byteLength,mime}]}`。它仅列共享资源描述，不调用 `#portraitUsedKeys`、`games.listOwn` 或 `privateDrafts.read`，不为未显示的“正在使用”标记加载／校验整份旧草稿。响应不含 `inUse`，不是把未知使用情况伪装成false。完整目录一次读取并缓存；PNG仍只挂当前页25张、原生懒加载，翻页不重新读取目录。

无查询的旧 `/portraits` 保持原合同：返回boolean `inUse`，使用标记读取失败仍拒绝，await后仍复核会话和删除栅栏；旧 `general.txt` 与草稿画像选择入口不改用轻量模式。仅目录接受精确的单个 `usage=0`；错误值、重复／多余参数、单项描述上的此参数仍返回422 `PORTRAIT_QUERY`。认证、强制改密、epoch／删除栅栏及图片字节SHA校验不放宽；单项描述与PNG入口不变。下文关于使用标记await的历史原证和收据，适用于仍执行该读取的旧模式。

回归入口：`verify_editor_portrait_catalog.mjs` 用实际Request／会话／临时SQLite、显式旧草稿适配器验证轻量零读取及旧模式；`verify_copy_generals_manage.mjs` 验控制器请求；`verify_editor_generals_browser.mjs` 验实际构建壳、真实共享PNG及目录缓存／分页，API仍为隔离内存夹具。首次线上耗时占比未经测量，本地绕过无用链路不等于生产延迟SLA。

## 已批准的模型边界

工程合同§1.2／§3的 `generals { generalId: GeneralDefinition }` 是全游戏人物基础资料；`generalId` 是人物身份，不是章节槽、来源记录ID、姓名或头像。不同人物可以同名、同画像。章节 `people[generalId]` 的加入／归属／覆盖和原生槽分配是另一层，不能用创建基础资料冒充完成新将初始化。

本实现仅作用于独立中立模板，字段暂限 `name/hao/portraitRef`。缺少的能力、登场等规则值保持未配置，不合成0／FF／50，不写章 `state.generals` 或compatibility槽绑定。管理员原20章导入数据仍由原profile保护，不在此归并或迁移。

## 内容操作与保护

`web/src/content/authoring/generaldefinitions.js` 提供纯内容 `applyGeneralDefinitionEdit`：

- create/update/delete只接收明确字段；人物ID必须属于当前 `gameId#general-<64位小写hex>` 命名空间，非原始数值槽。纯内容函数接受受信调用方给定的ID；下述草稿API在服务端分配创建ID，客户端不能通过create传入ID。ID本身不构成跨游戏访问权限。
- 姓名必填、trim/NFC；字号可空、NFC但不额外trim。控制字符／孤立代理项拒绝，合法补充平面字符保留；不添加原版姓名编码或长度规则。
- `portraitRef` 为null表示尚未选择；否则必须是当前共享 `KAO_MANIFEST` 中精确的 `assetId/sha256`，无URL／上传／原byte值。这里只核固定清单元数据，不证明PNG正文、Trial资源闭包或运行时显示。
- 输入、原source、其它人物和章节不被修改；已有定义必须规范，额外字段、原生idx/force等不能藏入定义。复制显示数据不沿用调用方的可变画像对象。
- 原首段仅允许无人物引用的空章；后继共同内容层支持下述明确的 `people` 结构，原生 `factions/generals/cities` 仍必须全空。未知章字段、非空槽、数组自定义属性均拒绝，不把未理解的引用误报无引用。后继HTTP已支持下述限定people结构与精确继承影响确认；首段交付时表单尚未提供人物配置和影响清单展示；现已分别接入[章节加入／移除](#后继章节加入移除界面)与[基表影响确认](#后继基表影响清单确认)，不能借旧批次状态重复列为未实施。不是完整任职／归属／延迟出场及兼容记录删除闭包。
- descriptor校验在读字段前执行，拒绝getter、隐藏属性、symbol和非普通原型；测试确认不执行输入getter。

早期 `FixedCopyProfile.verify` 的独立第四参数用于受信人物定义历史，仍保留兼容：模板下由基线重放并比较人物字典；完整副本拒绝非空定义历史。它不授权people结构。后继中立草稿服务已转为下述逐请求顺序重放，完整副本的原章／资源校验路径不变。两条路径都保护未记录的地图／槽绑定等差异；已创建人物ID删除后也不能重分配。

**草稿API／DTO及限定字段表单已接线**，但不能称完整人物编辑器已交付。章原生数组仍为空，保存门允许而active仍有两项固定实体数缺口及Q40无势力；没有放开Trial、发布或容量。

## 草稿API与持久历史

`POST /api/games/:gameId/draft/save` 保留既有metadata、resourceEdits、chapterEdits及原键／If-Match合同，可另传 `generalEdits`，最多16项（仍受整请求16KiB预算）：

- 创建：`{op:'create',values:{name,hao,portraitRef}}`；不能传generalId。
- 更新：`{op:'update',generalId,values:{name,hao,portraitRef}}`，明确替换三项基础资料，不接受原生能力或章节字段。会改变被继承字段时另须下述 `confirmedImpacts` 精确确认；无实际影响的旧请求保持兼容。
- 删除：`{op:'delete',generalId}`，仍受上述“所有章节明确无引用”的限定门。

创建ID后缀为 `SHA256(JSON.stringify(['dragon-general-definition-1',gameId,actorId,operationKey,index]))`。actor来自当前认证，index是generalEdits中的位置；相同请求重试／进程重建产生同一身份，不按姓名或头像去重。这个公开可计算的标识不是授权凭据，权限、epoch、原件保护、profile、源摘要和CAS仍分别核验。

`generalEdits` 缺失时不补空数组进已捕获request_json，旧请求原body／原键重放保持可用。已提交历史从原actor/op_key及原body重建ID；按结果修订、预期修订排序，保证“曾提前失败的未来修订请求，稍后作为无变化保存重试”不会因更早rowid排在创建该修订的操作之前。保存、读取和captureForCompile共用同一历史校验：中立模板保留逐请求顺序，完整副本沿原profile路径；不把派生steps回填进旧request_json。无变化操作可以确认原修订，不虚增修订；来源和已提交旧快照不被重写。

精确修订的draft DTO新增 `generalDefinitions`：模板返回独立 `{generalId,name,hao,portraitRef}` 数组，完整导入副本返回null，不能把原章节槽资料伪装成已迁移定义。保存收据仍是原元数据收据；调用方须明确重读该收据修订取得定义及服务生成的ID，不从当前最新列表猜测。

## 后继武将页基础定义表单

`GeneralDefinitionsPanel.vue` 装配在武将页，明确分开全游戏人物定义与下方原章槽位记录。它复用 `server/public/draft.txt` 的精确草稿、身份代际、串行work和唯一保存操作追踪，没有另建一份可写source或把运行状态放入Vue。先载入资料模块选定的明确修订；只有模板profile且定义DTO已提供才启用。旧回包缺字段／完整副本null显示不支持，不当成空人物库；身份重复、跨游戏ID、坏文字／画像或额外字段的回包整次拒绝，保留旧投影。显示副本与内部表单不共用可变画像对象。

- 创建／选择后修改／确认删除，均走同一draft/save。姓名／字按已批准NFC规则验证；画像显式读取既有621共享清单，选择ID时捕获其SHA，无上传或可编辑SHA。null是未指定，不代表原生默认画像或继承。
- 人物命令的metadata来自已保存快照，resourceEdits为空；不顺带保存其它表的未提交名称／简介／资源。确认人物保存后保留那些其它输入，并撤销verifiedRead；必须明确读取收据修订，不能用旧行继续编辑／Trial，也不改读latest。读取如会丢弃未保存输入，仍需明确同意。
- 人物输入参与既有导航／卸载／Trial脏检查；普通资料保存不捎带人物输入。切换人物／删除确认后重核身份、当前source及表单对象；旧确认和迟到回包不能在新上下文续办。
- 原键关联仍只存`{gameId,revision,key}`，原body只在内存。结果不明先查原键；在同页确认可重试后才重发原body／原键／原修订。重载后只有查询，没有重造body或重试创建。确认收据时同时恢复其gameId与修订到读取字段，修复原先重载查询成功却缺少读取gameId的缺口。
- 人物创建／修改／删除在分配操作前核16KiB既有请求预算，不截断姓名；初次人物保存若无法持久记录操作键，不发送POST并保留表单，重试也先确认关联可保存。关联记录损坏／读失败时整个草稿控制器拒绝新保存或覆盖记录；仅实际改密已确认、所有旧会话撤销的既有回调可清除此本地障碍，然后重新明确读取。它不是对旧操作成败的推断，也不是新增后台取消接口。

## 后继章节人物内容层（尚未接API）

此标题保留首段交付的历史锚点；API与表单均已有后继接线，见下文逐批记录。本节只描述最初内容层范围。这部分仅实现产品合同的基础资料引用／覆盖语义，不声称DOS已有同样结构。仍只接受中立模板与空原生章表；不新增能力数值、势力、登场、初始据点、军团或G127槽。

- `applyChapterPersonEdit(game,{op:'set',chapterId,generalId,values:{included,factionId:null,overrides}})` 设置本章人物配置；`remove` 只移除该章配置。人物必须已存在于当前游戏的定义字典，chapterId必须是已存在且与章序一致的ID。布尔included是作者配置，不是死亡／活动字节；false仍是引用，不能据此删除基础人物。
- overrides只接收name／hao／portraitRef的子集，沿用基础定义的文字与共享画像验证。缺键表示继承，恢复继承删除该键；只有portraitRef可用null明确清空。name／hao的null不表示继承。set明确替换整条配置，不暗中合并遗漏的旧覆盖。
- `effectiveChapterPerson` 只读计算当前基础定义与明确覆盖，返回独立显示值及继承／覆盖字段列表；不把继承值复制存入overrides。基础资料改变后，未覆盖字段跟随当前基础资料，覆盖值保持。未加入人物也能保留配置，但不会因此生成任何原生记录。
- `generalDefinitionReferences` 按完整章序报告此限定schema中每一条people引用及继承字段；基础定义delete在任何一章仍有引用时拒绝，包括included=false。未加入配置须显式remove后才能解除引用；同名另一个ID不受影响。复制章保留相同人物身份和独立覆盖对象，删除章不删除全游戏定义。
- 章序缺项／重复／洞、章ID分歧、未知章字段、错误元资料类型、未知人物、非规范已保存覆盖以及非空原生表均拒绝；不返回不完整“无引用”结论。输入访问器／隐藏属性／symbol／非普通原型拒绝，诊断与显示值不与source共享可变画像对象。该报告不对未接入的兼容／任职／事件引用作清理证明。

**首段交付仅为内容层；后继HTTP、DTO、服务端影响确认及人物配置表单均见下文，不能把此历史批次的缺项当作当前未实施项。** 旧 `verify` 仍不授权people，实际HTTP历史拒绝未记录／不合法people，不能靠在generalEdits中夹入配置命令绕过；实际空章active三缺口保持。内容／顺序校验和API都不代替完整用户流程。

## 后继逐请求顺序校验

`FixedCopyProfile.verifyOrderedTemplate(capability,candidate,steps)` 是模板专用的受信内容校验端口，不是HTTP输入或持久授权。由冻结基线克隆后逐步执行，每步严格为 `{chapterEdits,generalEdits,peopleEdits}`，各列表最多16项：先章新建／复制／删除／改名，再基础定义，最后本章人物配置。全量比较最终候选，只沿用既有元资料规范化例外；不忽略people、地图、compatibility或原生表。完整副本不能调用此端口。

复制章捕获复制当时的覆盖；以后改基础资料仍按未覆盖字段继承。不得把三类操作各自扁平重放：相同的扁平操作清单，如果配置修改发生在复制前／后，复制结果不同。任何中间时点尚有引用（包括included=false）都不能删基础定义；同一步“先删定义、最后移除引用”拒绝，先完成前一步移除才允许删除。人物ID的已使用集合贯穿全部历史，临时创建／删除也不能抹去身份占用。章ID仍按既有章writer分配；删除后重用或保留后代都按各次真实复制内容核验，不能从候选sourceChapterId反推授权。

`PrivateDrafts` 从实际已提交请求派生steps，保留结果修订／预期修订排序；save的前后核验、精确read与captureForCompile均选用该端口，选择依据是受信捕获基线kind，不取客户端字段。基础批次接口没有peopleEdits字段，派生步中该列表明确为空，彼时客户端即使传空列表也拒绝。后继API已接可选列表并保留缺失语义；原请求JSON、幂等摘要、DDL、原键／CAS／epoch保护不变，未重写历史请求。完整副本仍走原四参数verify，未改其角色／资源反向校验。

顺序端口在读取操作类型前拒绝非记录值。对象访问器、函数对象上的op访问器、洞／隐藏字段／symbol等均在执行前拒绝；测试中的getter计数最终为0。这是内容边界防护，不声称HTTP JSON能携带JavaScript函数。

## 后继章节人物API与继承影响确认

原draft/save新增可选 `peopleEdits`，最多16项，仍共用整个请求16KiB预算。set／remove结构与共同内容writer一致；仅模板profile和空原生章表可用，factionId暂只接受null，overrides只接受name／hao／portraitRef。缺字段的旧请求不补peopleEdits进捕获JSON；显式空列表可作为无变化保存。操作仍在章操作、基础定义之后执行，所有中间引用与最终整源均按真实请求历史验证。完整副本不能写people，也不能把非空people历史悄悄忽略。

精确草稿DTO保留原 `generalDefinitions` 行结构，另给模板两项只读投影（完整副本为null）：

- `chapterPeople: [{chapterId,people:[{generalId,included,factionId,overrides,values,inheritedFields,overriddenFields}]}]`：章序完整，values是当前基础值＋覆盖的显示结果，overrides仍只存显式覆盖。
- `generalReferences: [{generalId,chapters:[{chapterId,included,inheritedFields,overriddenFields}]}]`：含所有定义及所有明确引用，included=false不会消失。空数组不是未支持；其它未知引用仍由profile及共同scope拒绝，非完整未来规则字段的删除证书。

共同 `chapterPeopleProjection` 一次验证整个限定scope生成投影，不对每个人物重复完整扫描；各行、values／overrides及画像对象均独立，不与源或其它显示行共用可变对象。`generalDefinitionChangeImpact` 先沿同一writer规则规范化新文字／画像，只列实际变化且未被覆盖的字段；返回 `{changedFields,affectedChapters:[{chapterId,fields}]}`，按章序及name／hao／portraitRef字段序。未加入的配置仍被继承，必须列入。

更新基础定义时，API在该操作实际执行时点计算影响。若非空，update须带 `confirmedImpacts:[{chapterId,fields}]` 且精确等于上述affectedChapters；缺失返回409 `DRAFT_GENERAL_IMPACT_REQUIRED`，过期／遗漏／多报／乱序返回409 `DRAFT_GENERAL_IMPACT_CHANGED`，坏结构或重复章拒绝422。无实际变化（包括NFC后等值）的旧请求无需额外确认；若明确提供清单，即使实际影响为空也须精确匹配。全程仍先核If-Match，不使用latest替换原修订；失败在任何对象写入前拒绝，原键／原body不可改造后重发。

这是作者客户端对影响列表的明确回传，**不是新的授权凭据，也不能单靠它证明用户真的看过弹窗**。该API批次当时尚未接前端展示和确认；旧表单不发送该字段，因此遇到实际继承影响会被拒绝，不会静默传播。后继已接[基表影响清单确认](#后继基表影响清单确认)。确认数据只留原请求，派生内容历史移除该传输字段再重放实际定义命令；内容核验不冒充历史点击审计。save/read/captureForCompile共用有序people历史，收据仍要求明确读取精确修订；没有新持久表、运行槽、默认规则值或Trial／发布许可。

## 后继原章武将改名共用journal动作

接续据点写入口迁移，核对发现 `server/public/general.txt` 的 `saveEdits` 仍先独立GET草稿、每次生成新键直接POST并自动inspect；改名／字、画像和四种任免提示框共用此路径。`client.txt` 仍安装该独立适配器。其needsRead只锁本面板，不等于共用draft未确认操作及原键恢复。这里是代码接线事实，不宣称发生了真实数据损坏，也不把已有任免按钮误记为“没有表单”。

`server/public/draft.txt` 新增 `actions.renameNativeGeneral(request)`，只接受已明确读取的完整副本身份／修订／章及0..127原槽，values仅为明确name／hao字符串；名称范围、规范化及写集仍由既有服务／共同writer核验，不新建人物、能力或角色规则。使用已保存metadata、空resourceEdits和单条既有rename-general命令，不夹带其它脏表单。确认后再核身份／generation／loaded对象及request原值，成功保留唯一journal键后才POST。未知回应沿原query／retry；刷新只保键，不能重建正文。成功收据保其它metadata／资源输入，并要求显式读回，不自动GET。

复用 `verify_editor_draft_controller.mjs` 新增三组，`general-rename-journal-controller.log` 86组通过（原83＋3）；shell65、MJS语法／TXT实际加载执行及diff通过。覆盖取消零写、姓名／空字或单字字段、typed999与其它脏name／money101不入正文也不被收据清除、收据非已读、未知操作阻止其它保存、重载仅原键查询、原realm失败后原键原body重试、错身份／章／槽／字段拒绝、确认期间改请求或身份及保键失败不POST。测试是控制器API夹具，非新HTTP权限／保存证明。

上述动作批未改 `general.txt`、`client.txt` 或 `GeneralsPanel.vue`，当时旧按钮尚未切换；后继按钮接线见[共用改名入口](#后继原章武将共用改名入口)，仍非全部武将journal迁移。该批画像和任免仍待分别接入；画像后继见[共用画像保存](#后继原章画像共用journal与真实https)。任职／初始化／原生引用闭包不因现有按钮而完成；不删除已有功能来冒充迁移。无Vue／web/src／服务／DDL改动，不重建束，也不重复无影响浏览器／Trial／发布长链。详细诊断与指纹见 `.dragon-analysis/editor-completion/general-rename-journal-final-hashes.json`；A15／A17／A19仍部分。

## 后继原章武将共用改名入口

`GeneralsPanel.vue` 的原章“改名／字”按钮改调 `draftActions.renameNativeGeneral`，不再调用独立适配器的rename保存。`general.txt` 只增加已读 `draftRevision` 标量投影，身份失效隐藏；视图修改投影不能反写私有来源。按钮要求共用草稿已验证、无未确认操作、当前武将表与共用gameId／revision严格相同。两次输入框返回后再核原模型／共用上下文，随后仍由共用动作确认并复核；不把中立人物定义与原章槽合并。

面板提供共用明确修订读取、查询原操作及原键重试。武将表仍是独立只读投影：共用读回后还须“读取游戏清单／武将表”得到同修订，不能把收据当成新表或自动追最新。保存与查询不自动GET；其它脏表单由原共用守卫保留／确认放弃。该批画像与任免按钮暂保原独立流程（画像后继见[共用画像保存](#后继原章画像共用journal与真实https)）；该批旧适配器rename action尚未退役，后继已[移除旧改名入口](#后继旧改名动作退役)，仍不声称所有写入口已统一。

`general-rename-ui-browser.log` 新Chromium／实际Vue与gateway、明确API夹具183组通过（原182＋1），产物 `.dragon-analysis/editor-workbench/run-jysf2v/`。新增输入取消、最终确认取消零请求；typed999仍提交已读修订1的saved metadata与单条rename-general，清空字准确传空字符串。故意外游戏收据使共用状态未确认、按钮和未查询重试禁用、无自动读表；查询failed后仅原键可重试，明确读回1恢复资格。这不是该UI批次的真实HTTPS保存成功证明；后继已迁移并验证[真实HTTPS改名入口](#后继原章改名真实https与冲突验证)。

草稿控制器86、独立武将适配器19组回归及shell65通过；后者保留旧动作兼容测试，新增修订投影不可反写／身份失效隐藏断言。首个组合命令误写不存在的 `verify_general_ui_model.mjs`，仅取得86组草稿结果，不冒第二入口已跑；随后显式执行正确的 `verify_generals_conflict_model.mjs`，收据为 `general-rename-ui-adapter.log`。build/check逐byte一致（JS538115B、CSS37287B、8包许可），语法／diff通过。未改共用writer、后台、web/src或DDL，不重建原生束或重复无影响Trial／发布／规则。主动诊断与当前源码指纹见 `general-rename-ui-final-hashes.json`；A15／A17／A19仍未完成。

## 后继原章改名真实HTTPS与冲突验证

复用 `verify_editor_backend_stage_ui.mjs 95 --generals-only`，`EDITOR_TEST_NODE=1` 使用既有Node共同服务、临时文件SQLite／FileBucket、41固定来源与固定资源库、自有loopback HTTPS、真实管理员登录及完整20章副本、全新Chromium。没有API成功回包夹具或生产数据；跳过无关六资源作业及地图长链。只迁移原有武将测试段，画像仍核旧独立绑定／清除流程，不宣称画像及任免已改用共用journal。

`general-rename-ui-http-r1.log` 首轮完整 **4组通过**，scope为generals-only、structuralGetChecked=false、无stage作业POST或下载，errors／outside为空，正式IDB访问断言0。截图 `backend-stage-ui-session-r1/ui-r95.png`，JSON收据含34个源码SHA及四条浏览器generalWrites：

- 原章128槽读出后，输入框取消及最终确认取消均无写。typed999不改If-Match1；单条rename-general携带原saved metadata、空resourceEdits和准确章／槽／姓名／字，提交1→2。收据后独立表仍1且改名禁用，不自动读表；共用明确读2仍因表旧而禁用，再读武将表2才恢复并显示新名。实际GET旧1的完整DTO保持。
- 原画像绑定2→3、清除3→4保持既有入口。共用草稿仍2，因此新改名禁用；明确读4后才允许，不让旧画像自动读表冒充共用已读修订。
- 自有另一HTTP请求提交metadata4→5，浏览器仍用已读4改名，真实返回412。旧表仍4，未查询前禁止重试；原键查询failed后允许原键重试，但本次选择明确读5，再重读武将表5恢复。浏览器仍仅四次POST，没有自动重试；外部竞争写入另计，不混入browser计数。
- 另一作者看不到管理员私有武将／画像；真实改密撤权后的GET401清私有投影并回登录页。

本批只改既有工具和本文／审计，产品与构建产物未改。未模拟改名已提交后丢回应，也没有重新认证旧任免规则、完整stage组合或生产TLS；这部分范围不得借已有city-native丢回应证明冒充。语法／diff、链接及34源码／截图指纹核对通过；主动LSP等待300秒仍未确认，详细见 `general-rename-ui-http-final-hashes.json`。不重建未变程序束，不重跑无影响控制器／工作台／Trial／发布／规则；A15／A17／A19及完整目标仍未完成。

## 后继旧改名动作退役

在共用改名按钮及其真实HTTPS接线取得上述限定证据后，从 `server/public/general.txt` 删除旧 `rename` 函数及 `actions.rename`，不再保留原章文字的平行新键保存／自动inspect入口。`GeneralsPanel.vue` 已经调用共用 `renameNativeGeneral`，本批不改其交互或构建产物。旧适配器仍负责只读表／引用、画像和任免；这些剩余写入的 `saveEdits`、权限／身份守卫及原行为不变。服务端rename-general协议和旧请求历史不改，已加载旧页面也不会被本地代码修改远程撤销，不把此退役称为新的服务端权限门。

`verify_generals_conflict_model.mjs` 移除两个已退役旧rename函数的行为用例，增加action不存在断言；仍需共用的收据修订／坏收据／读回失败／身份迟到／冲突与未知回应覆盖改用实际保留的portrait动作。same-revision收据用例明确只是响应夹具，不宣称画像清除的真实no-op。旧改名正确性改由共用草稿控制器与现行Vue入口验证，不为凑旧数量保留第二套写入。

四个既有控制器入口合计 **121项通过**：武将适配器18、草稿86、共享上下文10及刷新7；shell65通过。新Chromium实际Vue／gateway的工作台183组通过，产物 `.dragon-analysis/editor-workbench/run-8WpauO/`，errors／unexpected／failed为空；API为明确夹具，非新的真实HTTP保存证明。日志 `general-rename-retired-{controller,shell,browser}.log`。测试语法、TXT实际加载执行、diff及文档链接通过；主动诊断和当前指纹见 `general-rename-retired-final-hashes.json`。

仅旧适配器、既有测试及文档变化，无Vue／web/src／服务／DDL改动，不重建两束，不重复无影响真实HTTPS／Trial／发布／规则长链。该批之后仍缺新改名丢回应的真实浏览器验证、画像／任免journal迁移及A15／A17／A19完整出口；画像的后继进展见下节，不以本历史收据冒当前证据。

## 后继原章画像共用journal与真实HTTPS

`draft.txt` 将原章改名的身份／确认／原键提交部分复用为私有 `submitNativeGeneral`，公开动作新增 `portraitNativeGeneral(request)`；原改名action及既有rename-general／portrait协议不变。画像键必须是明确null（删除覆盖绑定、保留原图）或1..32位英数字；缺值、数组、网址、路径、换行等拒绝。该检查只是ID格式，不证明任意合法字串均存在。`GeneralsPanel.vue` 只从已读共享库的匹配选项绑定，已有绑定可明确清除，无上传或新画像字节。

画像按钮与改名共用身份／已读修订门：武将表和共用gameId／revision必须相同；未确认操作锁两种写入。使用saved metadata、空resourceEdits和单portrait命令，确认后复核原请求／身份／loaded；保键失败零POST。未知回应只能原键查询／原正文重试，重载不能重造正文。成功或查得收据不自动GET，不清其它脏metadata／资源输入；须明确读共用修订及武将表后继续。该接线批旧 `general.txt.actions.portrait` 尚未退役，但现行Vue按钮已不调用它；后继已[移除旧画像动作](#后继旧画像动作退役)，任免仍使用旧独立写入。

本批验证（日志位于 `.dragon-analysis/editor-completion/`）：

- `general-portrait-journal-controller-r1.log` **89组通过**（86＋3），绑定／清除、取消、准确saved revision／body、其它脏name／money保留、未知时拦其它保存、重载只query、原realm原key／body重试、错误身份／槽／ID、确认期间请求／身份变化及存储失败。TXT由测试真实导入执行；API为明确夹具。
- `general-portrait-ui-browser-r2.log` **185组通过**（183＋2），`.dragon-analysis/editor-workbench/run-aRGF5g/` errors／unexpected／failed为空。新Chromium实际Vue／gateway，两个预先独立的章夹具分别无绑定与已有p3绑定；未读库禁绑定、显式选p3、确认取消零写、绑定／清除只发一命令。故意异游戏收据锁画像与改名、无自动读，原键queryfailed后才可retry，明确read1恢复。首轮r1失败为响应夹具遗漏portrait分支、误按add-blank断言；仅补夹具，失败日志保留，不冒产品故障修复。
- 复用 `verify_editor_backend_stage_ui.mjs 96 --generals-only`，`EDITOR_TEST_NODE=1`：`general-portrait-ui-http-r1.log` 首轮 **4组通过**。真实Node／文件SQLite／FileBucket／41固定来源及固定库、自有HTTPS、真实管理员完整20章复制／登录与全新profile，不替换成功API。改名1→2后，画像绑定2→3及清除3→4都先确认取消零POST，再typed999下按实际2／3提交saved metadata＋单portrait；收据锁两按钮，共用读回但武将表未刷新仍锁，明确同修订表才解锁。实际GET旧2／3完整DTO不变。原外部metadata4→5竞争、浏览器改名4实际412／原键查询／明确读5恢复、另一作者隔离、真实改密后401清投影及IDB隔离仍通过。四条浏览器写入（rename／portrait／portrait／失败rename），无自动retry；外部竞争写另计。scope仍generals-only，未做六资源stage作业／下载／完整stage组合，errors／outside为空。34源码SHA与截图 `backend-stage-ui-session-r1/ui-r96.png` 绑定本批。

build/check逐byte一致（JS538544B、CSS37287B、8包许可）、shell65、三MJS语法／diff／链接通过。仅控制器、Vue、三个既有测试、后台壳及文档变化，无web/src、服务、DDL或原生规则变化，不重建原生束或跑无影响Trial／发布／规则长链。主动诊断及最终指纹由 `general-portrait-ui-final-hashes.json` 记录。该接线批尚未认证新画像／改名的真实丢回应恢复、旧portrait action退役、任免journal迁移及完整实体初始化；旧动作退役后继见下，A15／A17／A19仍部分。

## 后继旧画像动作退役

在共用画像按钮及其真实HTTPS绑定／清除取得上述限定证据后，从 `server/public/general.txt` 删除旧 `portrait` 函数及 `actions.portrait`，不再保留画像的平行新键保存／自动inspect路径。现行Vue仍使用共用 `portraitNativeGeneral`，共享画像清单读取／选择、只读武将表及引用继续保留；任免旧写入暂不变。服务端portrait协议及旧请求历史不改，不宣称已加载旧页面被远程撤销或新增服务端权限门。

`verify_generals_conflict_model.mjs` 明确断言旧rename／portrait动作均不存在。原画像绑定／清除的适配器用例改为只读清单、有效选择、坏ID不更换及投影不可反写；画像保存由共用89组控制器及现行Vue验证。收据精确修订、坏收据锁定、同修订响应、读回失败、身份迟到、冲突及未知回应等仍需覆盖的 `saveEdits` 守卫，改用保留的军师清空动作；仅是控制器响应夹具，不认证任免原生写集或真实no-op。AST替换后一次后续edit因readcoverage拒绝，重读后成功；未在改动未齐时运行测试。

四个既有控制器入口合计 **124项通过**（适配器18＋共用草稿89＋上下文10＋刷新7），shell65通过；工作台新Chromium实际Vue／gateway **185组通过**，`.dragon-analysis/editor-workbench/run-D95rp8/` errors／unexpected／failed为空，API为明确夹具。日志 `general-portrait-retired-{controller,shell,browser}.log`。语法、TXT测试实际导入、diff与链接通过；主动诊断和指纹见 `general-portrait-retired-final-hashes.json`。

只改旧适配器、既有测试及文档，无Vue／web/src／服务／DDL变化，不重建两束或重复无影响实际HTTPS／Trial／发布／规则长链。当时任免迁移、新画像／改名真实丢回应验证及A15／A17／A19完整出口仍未完成；丢回应后继见[真实原键恢复](#后继原章改名画像真实丢回应恢复)。

## 后继原章改名画像真实丢回应恢复

复用 `verify_editor_backend_stage_ui.mjs 97 --generals-only`，保持 `EDITOR_TEST_NODE=1` 的实际Node共同服务、临时文件SQLite／FileBucket、41固定来源及固定库、自有loopback HTTPS、真实管理员完整20章副本／登录和全新Chromium。只在此聚焦模式对改名、画像绑定、画像清除分别安装一次性浏览器响应控制：先真实送达保存服务，核200、正确gameId及expected＋1修订后才abort浏览器回应，不伪造成功收据，不修改存储或服务。

`general-lost-response-http-r1.log` 首轮 **5组通过**，scope generals-only，structuralGetChecked=false，无六资源stage作业／下载，errors／outside为空、正式IDB访问断言0。三次恢复均在原页面先核未确认状态／重试禁用，再刷新页面，保留实际浏览器操作关联。重新进入武将页没有原章表；点击查询所用GET路径必须带最初POST的原键，实际返回committed及修订2／3／4。查询前后均未发生草稿正文GET，也没有新POST；共用修订输入变为精确收据修订，retry仍禁用。随后才分别明确读取共用草稿与武将表，恢复资格并显示准确改名／绑定／清除结果，旧1／2／3完整DTO保持。

收据新增 `generalRecoveries` 三条，记录op、原key／If-Match、服务提交修订、查询修订、恢复后的累计POST数1／2／3及显式读取前sourceReads=0；三键不同。浏览器全部generalWrites仍四条：rename If-Match1、portrait2、portrait3、后续真实412的rename4。外部metadata4→5竞争另计，原412查询failed后明确读5、跨作者私有内容隔离及真实改密撤权GET401清投影仍通过。截图 `backend-stage-ui-session-r1/ui-r97.png` 与34个源码SHA绑定本轮。

本批同时修正工具generals-only的limits说明：r96已经使用共用画像journal，但收据limits误沿用r95的“legacy portrait”文字；保留旧原始收据，不改写历史日志，r96实际覆盖按其测试正文及上一节记录解释。r97新限制文本准确区分已测三种丢回应与仍未迁移的任免、未跑的stage作业／运行／Trial／发布／生产TLS。这里是有受控丢包的真实本地HTTP链，不证明所有网络故障或任意并发组合。

仅既有浏览器工具和两份文档改变，产品／后台壳／原生束不变，不重复构建、控制器、工作台夹具及无影响规则／Trial／发布长链。语法／diff／链接和源码／截图指纹复核见 `general-lost-response-final-hashes.json`；主动LSP及未确认项亦在该收据维护。任免journal、原生实体初始化及完整A15／A17／A19仍未完成。

## 后继共享扩展画像ID真实保存与恢复

> 历史HTTP收据：下文p编号是当时身份，不是当前目录。用户后来批准文件／资产ID续编150..620，现行0..620与255处理见[画像资源决定](re-notes-portrait-reader.md#现行web准入与原证边界)；本次没有重跑本节HTTP长链，也未迁移旧持久化引用。

核对当时621项manifest：扩展画像使用 `p0001` 至 `p0471`，不是大于255的数字ID；原生 `portrait` 和共享 `portraitKey` 不能据数量混用。本轮未复现扩展数字绕入原生字段的路径，不因此新增数值校验或改准入。原 `r97` 的实际绑定ID为数字字符串0，不能代替扩展ID证据。

复用 `verify_editor_backend_stage_ui.mjs --generals-only`，明确从真实资源库选 `p0001`，核返回ID／SHA／长度与当前manifest同项一致，并将manifest、画像收集器及共同画像写者纳入源码指纹。绑定2→3、清除3→4后分别读准确修订，全20章投影只允许目标将的 `portraitKey` 改为p0001／null，其它章字段与引用不变；旧2／3完整DTO保持。该HTTP投影不暴露原生portrait／raw，不能将此比较夸大为原生字节全写集证明。既有共同写者仅设置／删除portraitKey的代码边界不变。

`portrait-shared-id-http-r104.log`／同名JSON收据 **5组通过**，37项源码SHA、`backend-stage-ui-session-r1/ui-r104.png`及武将页截图保留。实际Node／文件SQLite／FileBucket、固定41来源和固定库、自有HTTPS、真实管理员自有完整20章副本与全新Chromium；非普通作者创建或成功API替身。改名1→2、扩展画像绑定2→3、清除3→4均先真实提交200再丢浏览器响应，刷新只查询三个原键，显式读取前正文GET=0，累计POST1／2／3不重复；typed999不入请求。后续外部metadata4→5与浏览器旧4真实412、精确查询、另作者隔离、改密后401和正式IDB零访问保持。四条浏览器保存包括最后失败的rename，外部竞争另计；没有stage作业、Trial或发布。

失败未销账：r100完成三次写入恢复后，因仍按旧“解散勢力”文字找按钮而失败，已只改为现行 `data-native-faction-disband` 标识；r101／r102各1200秒超时无最终收据（分别记录至绑定读回／清除读回），不认定通过或唯一原因。r103尝试复用浏览器刷新GET正文以免额外完整读取，遇CDP `Request content was evicted from inspector cache`，未屏蔽该异常；已恢复独立HTTPS读回，无新增拦截或成功响应伪造。r104在1800秒有界预算内完整结束，不沿失败轮成绩。日志只增加无秘密阶段标识。

测试语法、diff及链接检查通过，主动诊断与范围见 `portrait-shared-id-final-hashes.json`。仅既有工具与文档变更，不重建不变的Vue／原生束，不重复无影响控制器、规则或完整Trial／发布长链。实际图片解码／所有显示消费者、原生画像语义和A15／A16／A19／A32完整出口仍未完成。

## 后继画像目录异步读取后的会话复核

预览入口核对发现现行 `/api/games/:id/portraits/:assetId` 只返回固定库描述，并不提供PNG字节；不能直接作为img地址使用。本批未接图片预览或新增图片来源，预览仍待受控字节入口闭合。

另复现画像目录返回边界缺口：`#getPortraits` 等待 `#portraitUsedKeys` 读取使用标记后直接返回，后者会将读取异常降为无使用记录。在这段await中撤销会话，读取成功或异常降级后均可能继续返回目录。现在在await之后、组装响应之前调用既有 `principal(tokenHash)`，重新核实际session／用户epoch、禁用及有效期。该批没有新增认证实现或改变画像选择、保存、单项同步描述、权限政策；非鉴权读取失败降级随后由下节收紧。其余画像权限与使用标记完整性并未因此获得证书。

复用 `verify_editor_template_root.mjs --portrait-epoch-only`：真实共同Request分发、文件SQLite与种子用户／会话，游戏元数据及privateDrafts.read异步返回是明确夹具，不装41来源、不执行真实blob读取、登录、HTTPS或浏览器。两名不同作者各自先取得621项目录及p0001使用标记，单项描述不触发使用读取；在读取返回／抛错之前分别于SQLite增加用户epoch，须返回401 SESSION_INVALID、不得携带portraits。后续旧会话请求同样401且不再进入读取。`portrait-epoch-after-r2.log` **4组通过**，shell65通过。

失败日志保留：`before.log`为SQL夹具next_ordinal误设null的准备失败，修正后`before-r2.log`才真正复现旧200≠401；`after.log`显示仅再次调用touch仍失败，因为touch只更新idle_until，并非认证校验，已替换为principal。未将这些失败列为通过。语法／diff／链接、主动诊断与指纹见 `portrait-epoch-final-hashes.json`。仅共同服务一行、既有聚焦入口及文档改变；不重建未变两束，不跑无关规则／完整复制／Trial／发布或重复30分钟画像UI链。A29及完整目标保持未完成。

## 后继画像使用标记读取失败拒收

共同服务不再把已有自有草稿的使用标记读取异常转换为成功目录及全部 `inUse:false`。`#portraitUsedKeys` 的异常出口先复核principal，当前会话有效时重抛原错误；已撤销时仍以401拒绝，不因本次改动退回500或成功目录。成功出口保持上一节的await后校验。正常使用标记、单项共享描述、画像保存与ID／SHA政策不变；未配置草稿或未找到自有游戏的既有行为没有在此改动，不冒完整权限／使用情况证书。

仍复用 `verify_editor_template_root.mjs --portrait-epoch-only`，新增有效会话下普通异常及明确HttpError503两条：分别经实际Request错误出口返回500 INTERNAL_ERROR／503原错误码，均不带portraits，不伪造“未使用”。错误码OWNED_USAGE_UNAVAILABLE仅为测试夹具，不是新增产品码。原成功目录／单项及resolve／reject撤销路径继续通过，`portrait-usage-error-after.log` **6组通过**，shell65通过；`portrait-usage-error-before.log` 保留旧200≠500负控。鉴权和SQLite真实，使用读取仍是明确适配器夹具，不冒实际blob／HTTPS验证。

两代码语法、diff与链接通过；诊断、当前指纹及未跑范围见 `portrait-usage-error-final-hashes.json`。没有Vue、原生束、DDL或资源改动，不重复无影响构建／规则／完整复制／Trial／发布／长浏览器链。图片预览与完整编辑器仍未完成。

## 后继原章画像库ID筛选

`GeneralsPanel.vue` 为已读取的共享库增加本地ID子串筛选与清除按钮，忽略筛选文字前后空白及大小写，但不改变任何资源ID。下拉框与展开清单显示相同结果和符合／总数；若当前已选ID不在结果内，以禁用的“已选／筛选外”选项继续明确显示。无结果时不能从下拉框另选，原合法已选仍可经既有独立确认绑定，不因显示筛选而清空或自动改选。换游戏清筛选；不把此显示状态写入journal、草稿或请求，不改既有图片来源与ID／SHA保存合同。中立基础定义表和图片预览不在本批范围。

复用工作台已有画像绑定路径，`portrait-filter-browser.log` **201组通过**（200＋1），产物 `.dragon-analysis/editor-workbench/run-8oYwTb/result.json`：明确两项API夹具下，输入“ P3 ”只列p3而原0保持并标筛选外，手动选p3后输入不匹配的 `<img>` 仍保p3及绑定资格，结果为空且无img元素；清除恢复两项、保p3，未读999及请求计数均不变。随后的真实DOM绑定／清除确认与原精确body断言继续通过。新profile／gateway／Vue是真实，API为夹具，不冒真实621项读取、认证HTTP保存或图片解码证明。

Vue build/check逐byte一致（JS550117B、CSS37526B、8包许可）、shell65通过；两代码主动LSP等待300秒均timeout未确认。语法、diff／链接、源码及浏览器收据指纹和缓存诊断见 `portrait-filter-final-hashes.json`。无共同控制器、服务、web/src或DDL变化，不重建原生束，不重复无影响30分钟画像HTTPS／规则／Trial／发布长链；A16限定政策不扩大为资源全闭包，完整目标未完成。

## 后继中立人物与章节画像ID筛选

`GeneralDefinitionsPanel.vue` 在基础表单和章节配置旁提供同一局部筛选的两个输入／清除入口，使用已读共享目录、trim及不区分大小写的ID子串匹配。基础表单保留筛选外的当前引用（含未保存选择），不会自动切成首项或未指定；“未指定”仍是作者可明确选择的独立选项。章节选择是即时命令而非待保存字段，无匹配项时禁用；选取后仍复用原确认及取消清空命令选项，不改变继承／覆盖规则。换游戏清筛选，筛选本身不写journal、不取数据或保存；两个筛选输入置于基础form外，不以输入筛选触发表单提交。图片预览仍未实现。

在既有 `verify_editor_workbench_browser.mjs` 增加独立新context的中立DTO夹具，避免把原章副本切换profile伪装成真实迁移。三项明确画像元数据0／p0001／p0002下，大小写及空白筛选只列p0001，基表原0保持；手选p0001后由章节输入无匹配文字，基表仍保该引用、章节选项禁用；章节清除恢复完整目录，两输入同步。取消章节p0002确认后命令选择回空、有效画像仍0；姓名、字和未读999保留，全段零额外请求，基础“未指定”仍能明确取用。API全部为夹具，不证明真实621读取／保存／原生初始化；实际Vue／gateway／DOM在新profile执行，正式IDB禁用。

首轮203组通过（201＋2），产物run-CrWR30；r2补此新context的console／requestfailed监听后再次 **203组通过**，最终 `.dragon-analysis/editor-workbench/run-XHmS8r/result.json` 的errors／unexpected／failed均空。日志 `definition-portrait-filter-browser{-r2}.log`。Vue build/check逐byte一致、shell65、MJS语法／diff／链接通过；主动诊断及源码／收据指纹见 `definition-portrait-filter-final-hashes.json`。仅组件、既有浏览器入口及生成后台壳变化，不重建未改原生束，不重复无影响控制器／真实画像长链／规则／Trial／发布。完整A15／资源闭包及总目标仍未完成。

## 后继中立人物画像作者引用标记

`#portraitUsedKeys` 原本只收集原章 `portraitKey`，漏掉中立人物引用。现从同一次已授权草稿读取合并原章覆盖ID、`generalDefinitions[].portraitRef.assetId` 与 `chapterPeople[].people[].values.portraitRef.assetId`，忽略空引用并去重。章节投影由共同 `chapterPeopleProjection` 提供完整基表＋覆盖有效值，未加入配置仍保留引用，不能据included=false漏计；不另读源或新增请求，不改定义／配置／画像绑定、保存或初始化。

这是**作者设置引用**统计：草稿公开DTO不含原章默认portrait字节，故不是所有运行／历史资源的未使用证明。武将库标签同步改为“作者引用中／未见作者引用”，不以false授予删除或变更共享资源的权限。既有读取失败返回错误及await后会话复核保持。

复用 `--portrait-epoch-only` 的两类已读投影夹具：完整副本nullable中立字段下仍只标p0001；中立空原生人物、基础p0002、未加入章0、重复p0002和null下只标0／p0002，输入投影不变。`portrait-neutral-usage-before.log` 复现旧实现错误返回空集合；修后 `portrait-neutral-usage-after.log` **6组通过**（扩充原正控，不增加组数），500／503及resolve／reject会话撤销回归仍过。Request／SQLite真实，读取投影为明确夹具，非真实blob保存、HTTPS、原生默认画像或完整权限证书。

既有新浏览器工作台 **203组通过**，产物 `.dragon-analysis/editor-workbench/run-aNv5qi/result.json`，增加库标签精确断言，errors／unexpected／failed为空；API为夹具。Vue build/check逐byte一致、shell65与代码语法／diff／链接通过；诊断及当前指纹见 `portrait-neutral-usage-final-hashes.json`。无web/src／DDL／画像字节改动，不重建原生束，不重复无影响实际保存／规则／Trial／发布长链。完整A15／A16／A29及资源闭包不据此升级。

## 后继共享画像已核字节出口

为后续预览增加只读 `GET /api/games/:gameId/portraits/:assetId/bytes?sha256=:expected`。旧清单／单项描述接口不变；新入口沿现有共享画像与游戏删除栅栏，不授予草稿编辑或跨作者私有内容权限。唯一sha256参数必须是64位小写十六进制；未知ID404、格式／重复／额外参数422、与固定清单不一致409，均不调用字节读取器。

共同应用工厂只接受受信启动代码传入的 `readSharedPortrait` 函数，不允许HTTP／环境输入任意路径或URL。未配置时503；得到字节后再次核会话及删除栅栏，必须是Uint8Array且长度／SHA与清单完全一致，否则503。读取抛错时先核会话，已撤销优先401。成功为PNG／no-store／nosniff，附长度与摘要；不增加图片上传、变换、文件写入、草稿操作或画像资源身份。VPS适配器按固定manifest构建ID→随程序发布的 `web/kao` 文件URL映射，普通和冻结发布装配都注入同一读口；现有publication Dockerfile已包含web目录。未配置该端口的平台仍拒绝，不假设它有本地文件或另寻远端兜底。

复用 `verify_editor_template_root.mjs --portrait-epoch-only`，`portrait-bytes-root.log` **10组通过**（原6＋字节2＋撤销2）：共同Request／临时SQLite，实际Node适配器读取原0与扩展p0001 PNG并核签名／长度／SHA／响应头，匿名401；无配置拒收、坏查询与摘要零读取、等长坏字节503；两个新种子会话分别在读取成功／抛错前撤销epoch，均401。原使用标记及500／503／撤销回归仍过。种子会话与故障读取器是明确夹具，没有真实登录、TCP／HTTPS、浏览器解码或全部621图消费证明。

shell首次因旧静态路由字符串断言失败，保留 `portrait-bytes-shell.log`；仅改为新准确正则后 `portrait-bytes-shell-r2.log` **65项通过**，未删除禁上传／删除断言。代码语法／diff／链接通过；当前指纹及主动诊断见 `portrait-bytes-final-hashes.json`。没有Vue、web/src、DDL、固定图片或生成束改动，不重建两束或重跑无影响保存／规则／Trial／发布长链。此批只是预览字节前置出口，界面预览及其生命周期／实际HTTPS验证尚未接入；完整目标仍未完成。

## 后继原章及中立基表画像显式预览

共享 `editor-ui/src/PortraitPreview.vue` 接到原章画像选择和中立人物基表当前画像引用。仅显式点击预览才读取上述同源、固定ID／期望SHA字节出口；不改引用、不提交表单或草稿。清除只移除图像；切换游戏／画像／SHA或资格失效立即清除旧图。每次请求对应独立img节点，load／error还核当前节点与绑定，旧节点回调不更新新状态。加载或失败时不显示旧图，失败可重试；128×128展示框用contain保纵横比，不进行上传、改图或资源转换。不保证撤销已经发出的GET，也不将标签页／网络生命周期当作已全覆盖。

`general.txt` 保留已读共享清单的可选SHA，并在边界核对存在时必须为64位小写十六进制。旧DTO不带SHA仍可继续原选择／绑定，但不能预览；坏SHA原子拒绝，不替换先前清单。中立基表沿已有ID＋SHA引用，不另找图片来源。该批尚未增加章节配置行预览，后继见[当前有效画像预览](#后继章节人物有效画像预览)。

- `portrait-preview-controller.log` 只读武将适配器 **9组通过**（原8＋1），核SHA保留、投影隔离、legacy缺字段、null／数字／空／大写／长度／换行拒收及旧清单保持；原权限／迟到读取回归保留。
- `portrait-preview-browser.log` 首轮205组通过，补回调负控后 `portrait-preview-browser-r2.log` **205组通过**，产物 `.dragon-analysis/editor-workbench/run-U1iJ3K/result.json`。实际gateway／CSP／Vue、新profile，API为明确夹具；两个入口点击前无img，点击各只有一个绑定SHA的GET，浏览器实际解码仓库0.png；清除或换到无SHA选择不再读、不改引用，原保存／筛选流程保持。error及旧节点load为明确注入事件，核错误隐藏／可重试与不复活旧图，不冒真实HTTP失败或迟到响应证明。errors／unexpected／failed为空。
- Vue build/check逐byte一致、shell65、两测试语法、TXT实际导入、diff／链接通过；诊断与当前指纹见 `portrait-preview-final-hashes.json`。没有服务、web/src、DDL、固定画像变更，不重建原生束，不重复无影响实际保存／规则／Trial／发布长链。

该UI批没有实际登录HTTPS联合预览，后继限定验证见[真实HTTPS与退出清理](#后继画像预览真实https与退出清理)；全部621图及资源／权限完整闭包仍未完成。

## 后继章节人物有效画像预览

章节人物表在“目前有效值”内复用 `PortraitPreview`，只读取已核投影 `row.values.portraitRef`，不拿基表覆盖章值；明确null保持未指定并禁用预览。未加入配置仍可查看其有效引用。预览与“选择后确认保存”是独立按钮，查看／清除不设置画像、不恢复继承、不保存。组件以当前章ID重新挂载：即使两个章节同一人物、同一画像，换章也清图，不复活之前的预览。

复用工作台中立投影夹具增加同人同图的未加入章及明确null覆盖章；新增一组核初始无img、显式读取／解码、URL绑定ID／SHA、命令选择仍为空、换章清图、未加入可预览、null不回退基表0、返回原章不自动读。fixture路由只允许GET；原基表选择、三字段输入、筛选与取消保存回归保持。首轮 `chapter-portrait-preview-browser.log` 因假定同一图片每次必增GET而失败（实际5而非6），保留；浏览器可复用刚显示的同ID／SHA已解码图片，因此改为每次点击允许0或1个只读请求，换章零请求、正确绑定及实际解码断言不变，不加随机参数破坏缓存。

修后 `chapter-portrait-preview-browser-r2.log` **206组通过**（205＋1），产物 `.dragon-analysis/editor-workbench/run-KSTupI/result.json`，errors／unexpected／failed为空。实际gateway／Vue／CSP及新profile，API仍为明确夹具，不冒真实保存、HTTPS联合或全部图片覆盖。Vue build/check逐byte一致、shell65、测试语法／diff／链接通过；当前指纹和主动诊断见 `chapter-portrait-preview-final-hashes.json`。仅Vue、既有浏览器测试、文档与生成壳变化，未改共同预览组件、控制器、服务、web/src、DDL或固定图片，不重复无影响适配器／真实保存／规则／Trial／发布长链或原生构建。完整目标仍未完成。

## 后继画像预览真实HTTPS与退出清理

复用 `verify_editor_template_browser.mjs --portrait-preview-only`，自有Node／文件SQLite／FileBucket、固定41项安装源、隔离HTTPS与全新Chromium。经过真实作者登录／强制改密、中立创建的原键恢复、metadata保存及明确读2，再操作现行基表和原章共享画像选择器；没有成功API夹具或替换图片响应。原章选择器在中立游戏中只读取共享库，不冒完整原章副本的角色绑定证明。

真实清单两处分别显示621项（基表另有未指定）；明确选择0与p0001并点击预览，核响应200、PNG／no-store／SHA，以及浏览器natural尺寸与固定PNG IHDR一致：0为1573B／128×128，p0001为27060B／120×120。匿名同URL均401。两种选择器各解码两张图，清除仍保持选择值；同ID／SHA允许浏览器复用已解码图片，不要求每个显示动作产生新的HTTP请求。预览阶段只有GET，精确源1／2完整投影均保持。

显示p0001期间实际退出登录，随后登录页出现，全部预览img清除；退出阶段POST清单严格只有 `/api/auth/logout`，没有自动保存。相同浏览器cookie容器再读图片为401；IDB访问0、errors／outside为空。上下文仅对自有自签HTTPS例外，不改变全局信任，不作为生产TLS／部署证据。

`portrait-preview-http-r82.log` 首轮7组通过；加入退出清理的r83为8组；补退出POST白名单后 **r84 8组通过**，最终产物 `.dragon-analysis/editor-phase/template-browser-r84/receipt.json`，包含47项当前测试源／资源SHA、图片HTTP元数据、实际尺寸、预览只读请求及退出POST记录。47是测试文件数，非安装源数量。没有读取CDP响应正文来冒充字节认证，固定文件SHA与长度在测试内核验，服务按同清单核实际返回字节。早期收据分别保留，不替换成当前版本。

仅既有测试和文档变化；测试语法／diff／链接及当前指纹、主动诊断见 `portrait-preview-http-final-hashes.json`。不重建未变Vue／原生束，不重复无影响控制器／规则／Trial／发布长链。该r84批尚未联合验证章节人物预览，后继见下节；全部621图、晚到网络回调或全权限矩阵仍未闭合，完整A15／A16／A32及总目标不据此销账。

## 后继章节画像真实HTTPS继承与清空

继续复用上述 `--portrait-preview-only`，不另建服务或辅助浏览器入口。首次两选择器只读验证后，明确分离三次真实准备写入：新增带p0001画像的人物2→3；保留未加入的章节配置3→4（继承基表）；显式null章画像覆盖4→5。三次均独立操作键、准确CAS，仅相应generalEdits／peopleEdits、已保存metadata与空resourceEdits，不夹带其它编辑。

读回4后核未加入状态和画像继承，章节行显式预览正确ID／SHA、浏览器解码120×120；查看／清除后画像命令选择仍为空，源3／4精确投影不变。独立确认清空并读回5后，有效值与覆盖均null，基表人物保持p0001，界面显示未指定且预览禁用，不回退基表。旧4仍保持。随后原退出清图、仅POST logout、同浏览器401回归通过。没有把这三次准备保存混称为“全部只读”，没有创建原生人物槽或授予运行准入。

`chapter-preview-http-r85.log` 首轮 **9组通过**，最终 `.dragon-analysis/editor-phase/template-browser-r85/receipt.json` 记录3个准备写入、9个预览阶段GET、4个实际图片200响应及47项测试源／资源SHA。收据后审计进一步逐字段核三个正文键集、统一已保存metadata、空资源、未加入／factionId:null及唯一portraitRef:null覆盖；详细结果与当前指纹见 `chapter-preview-http-final-hashes.json`。真实Node／文件SQLite／FileBucket／自有HTTPS／作者登录、新Chromium、无成功API夹具；errors／outside为空、IDB访问0。不是跨章切换真实HTTPS、全部621图、完整权限／原生初始化、Trial或发布证书。

仅现有工具与文档改变，测试语法／diff／链接通过，主动诊断见上述记录；不重建未变产品／Vue／原生束，不重复无影响工作台／控制器／规则／Trial／发布长链。完整编辑器目标保持进行中。

## 后继画像目录异步读取后的删除栅栏复核

`server/editorapp.js` 的画像目录成功出口，在使用标记读取await后、principal复核后，再调用既有 `games.assertNotDeleting(gameId)`。此前仅入口检查栅栏，使用标记返回期间若栅栏已落地仍可能成功返回目录；共享字节出口已有对应后置门。此次补一处相同守卫，不改变画像来源、使用标记、错误出口或保存规则，也不是物理删除实现。

复用 `verify_editor_template_root.mjs --portrait-epoch-only`，在两个作者各自的新临时游戏上，通过明确的usage-read替身往自有SQLite插入栅栏，再返回原DTO。`portrait-fence-before.log` 复现200而非409；补守卫后 `portrait-fence-after.log` **12组通过**（原10＋两个栅栏用例）。在途目录返回409 GAME_DELETING且无portraits；后续目录、单项描述及字节请求都在读前拒绝，替身总调用一次。游戏元数据与输入DTO保持，栅栏行仍在；没有删除操作、清理或复活游戏。原会话epoch成功／异常撤销、读取失败500／503、固定0／p0001字节及摘要校验回归保持。

真实共同Request／认证／临时文件SQLite，但会话种子和使用标记／栅栏落地时机是显式夹具；不冒真实删除事务、网络并发、完整A29矩阵或A30物理删除。shell65、两JS语法／diff／链接通过，主动诊断和指纹见 `portrait-fence-final-hashes.json`。仅服务、既有工具及文档变化，无Vue／web/src／DDL／固定画像改动，不重建两束或重复无影响浏览器保存、Trial／发布／规则长链。

## 后继画像字节迟到栅栏与共享资源隔离

在上述目录门之后，复核现有字节出口已有同样的await后栅栏检查，未新增产品守卫。既有 `verify_editor_template_root.mjs --portrait-epoch-only` 新增一组：已认证请求进入共享PNG读取时，在自有SQLite为该游戏插入明确栅栏，返回合法原PNG；该在途预览409 `GAME_DELETING`，后续目录／描述／字节三请求亦409，读取次数仍1。随后另一未栅栏游戏及已认证Trial公共字节路径各返回相同PNG／SHA／no-store，累计读取3次，游戏元数据保持且栅栏未移除。

此正反组合区分“禁止该游戏专属入口”与“删除共享资源”：单游戏栅栏不能使其它游戏或认证共享库读取失效。但它不证明被栅栏游戏的私有Trial仍有效，不涉及私有pack授权；也不把编辑限制一概解释为读取禁令。本批没有物理删除、受限状态策略或错误路径语义变更。

当前入口 **47组**通过，原32个会话变化迟到／重请求负控保持。证据 `.dragon-analysis/editor-completion/portrait-byte-fence-20261029/` 的 `tests-r1.log`／`result.json` 与前后128项选定输入SHA；真实共同Request／文件SQLite和原PNG，种子会话与栅栏时机／字节适配器为明确夹具，无真实登录、HTTP传输／浏览器、固定源安装、blob读取或全部权限认证。只改测试／文档，不重建束或重复无影响长链。

## 后继原章武将行有效画像预览

`server/drafts.js` 在精确修订的原章武将DTO中增加只读 `portrait`（原字节，缺失为null），不修改原记录、覆盖或历史正文。`general.txt` 在安装投影前核可选u8；非法值原子拒绝并保旧表。已知值转为 `originalPortraitId` 字符串，0不丢失，255仍只是原值；旧DTO缺字段／null保持未知，不从槽号或raw补图。

`GeneralsPanel.vue` 每行增加折叠的已读画像预览，复用 `PortraitPreview` 及原同源已核字节出口。优先按该行 `portraitKey` 查已读共享目录，只有未绑定时才按明确的原图ID查目录；无目录、无匹配ID或缺SHA禁用，不回退其它图。资源库选择器／筛选中的未保存选择不影响该行。展开不发请求，仍须显式预览；切章销毁原行预览，换已读修订以新key重建，忙／身份失效沿既有组件清图。没有新增自动读取、保存、画像来源或运行准入；G127／255无可用目录项时保持不能预览。

复用既有入口，日志前缀 `.dragon-analysis/editor-completion/native-row-portrait-`：

- `model.log` **10组通过**（9＋1）：0／149／255／null／旧缺字段、独立覆盖和投影隔离，负零／越界／小数／字符串／布尔／非有限数／对象拒绝并保旧值。
- `browser.log` **218组通过**（217＋1），产物 `.dragon-analysis/editor-workbench/run-yf6kxW/result.json`。真实gateway／Vue和新Chromium，API为明确夹具：选择器改p3不改变该行原图0；显式解码0为128×128，允许浏览器复用已读同一图片，新增请求只能是该图片GET；切章覆盖p3无SHA时不回退有效原图0，未知及255均无图，切回不复活，零额外保存／章读取。原筛选、绑定／清除及地图工作台回归保持。该批不是实际HTTPS新字段联合证据，后继限定联合见[原章行真实预览](#后继原章行画像真实https保存与恢复)。
- `ports.log` **23项通过**（22＋1）：既有临时文件SQLite／FileBucket、41来源装配与真实草稿服务读回，全部20章2560武将的原画像及覆盖逐项等于已保存源；原3840城只读字段、保存CAS／原键、旧修订及无新增对象检查保持。principal／来源登记为端口夹具，不冒登录／HTTP。
- Vue build／check逐字节一致、shell65、四JS语法及TXT实际导入通过。三个代码主动LSP等待300秒仍push-only未确认，TXT无配置服务；另两文件报告四项既有辅助warning（drafts布尔参数、VPS工具日志），不批量改格式或屏蔽。源码／诊断和最终核对见 `native-row-portrait-final-hashes.json`。

仅DTO、只读适配器、Vue及受影响测试／文档／后台壳变化，无Web引擎、DDL或固定图片变化，不重建原生束，不重复无影响Trial／发布／规则长链。完整实体、所有图片及消费者／权限闭包仍未完成。

## 后继原章行画像真实HTTPS保存与恢复

复用 `verify_editor_backend_stage_ui.mjs --generals-only`，不另建探针或服务。自有Node／文件SQLite／FileBucket、41固定来源及共享库安装、真实管理员登录并完整复制20章、新Chromium隔离上下文；不替换成功API或图片。沿既有改名1→2、绑定p0001 2→3、清除覆盖3→4，每次真实提交后仅丢浏览器回应，刷新查询原键且在明确读取前零源GET／重复POST，再双读同修订恢复操作。

新增行内预览只在明确读回后进行：修订2槽0的原 `portrait=5`、无覆盖，实际显示图5（128×128、1455B）；修订3保原byte5而覆盖p0001，实际显示p0001（120×120、27060B）；修订4清覆盖后恢复图5，原byte仍5。不按武将槽号猜画像。每次核固定PNG长度／SHA／IHDR、真实200响应的image/png、no-store与X-Content-SHA256、实际浏览器解码尺寸及精确URL；未另外从CDP重复取响应正文，不把响应头核对冒充浏览器正文独立重算SHA。折叠展开不自动请求；显式预览及清除不保存，也不改变未保存的画像选择器和修订输入。目录缺失时显式读库是独立准备步骤，不能混称整段零请求。

`native-row-portrait-http-r105.log` 首轮 **8组通过**（原5＋3）。提取收据 `native-row-portrait-http-r105-receipt.json` 记录39项执行前源码／资源SHA、三次预览及3个实际图片GET／200，四次浏览器保存请求（改名、绑定、清除、最后故意旧CAS改名失败）和三个独立恢复键；各恢复后累计POST1／2／3、明确读取前源GET0。原完整章投影仅portraitKey变化、旧修订2／3保持、外部竞争后的真实412及查询／重读、另一作者隔离、改密401清私有表／IDB0、errors／outside为空均继续通过。外部竞争保存另计，图片显示不是改变原生portrait或raw的证明。

只改既有工具及本页／审计文档，没有产品或束变化。语法、diff、链接、39项收据源码SHA及截图摘要复核见 `native-row-portrait-http-final-hashes.json`；主动诊断未确认项据实记录。未重建未变Vue／原生束，未重复无影响控制器／地图／规则／Trial／发布链。未覆盖全部621图、全权限、完整实体初始化或整个A15／A16／A32出口；自有自签TLS只在隔离上下文放行，不是生产TLS认证。

## 后继所选人物的跨章引用只读清单

`GeneralDefinitionsPanel.vue` 在选择基础人物后，复用控制器已校验的完整 `chapterPeople` 投影，按章序列出该稳定ID的全部配置、章节名称／ID、加入状态及继承／覆盖字段。不按当前章过滤，不漏 `included=false`，不从同名／同槽推定人物身份；新建模式隐藏清单，缺少投影明确显示“引用未知”，不显示零引用。它只是已读修订的中立创作配置，原生任职／事件引用仍未闭合，不授予删除许可；原删除动作及服务端引用检查不变。没有新增请求、写入、源模型或协议。

既有 `verify_editor_workbench_browser.mjs` 完整入口 **228组通过**，新加两组核三章引用、未加入与明确画像覆盖、切章不缩减清单、新建隐藏／重新选择恢复且零额外请求，以及另页缺失投影不报零。实际Vue／gateway／CSP与全新隔离Chromium，API是明确夹具，正式IDB被禁止，不冒真实认证HTTP／服务删除闭包。证据目录 `.dragon-analysis/editor-completion/general-reference-view-20261029/`：`browser-r1.log`，详细结果 `.dragon-analysis/editor-workbench/run-eknZoD/result.json`；129项选定源码／资源SHA前后相同（不是全传递依赖证书）。build与逐字节check、测试语法、shell65通过；首次误用不存在的 `verify_editor_ui_shell.mjs` 未运行测试，失败保留 `shell.log`，准确入口结果为 `shell-r2.log`。编辑时同作用域测试变量重名已由诊断发现并改名，语法与完整浏览器运行均在修正后。

后台生成壳随Vue重建，无玩家／Trial束或产品规则变更，不跑无影响的规则／发布／物理删除长链。两个代码主动LSP均未确认（一超时、一push-only），不声称诊断全清；完整A15和编辑器仍未完成。

## 验证证据

- `node tools/verify_editor_general_definitions.mjs`：10组，`.dragon-analysis/editor-completion/general-definitions-after-r2.log`。含纯内容create/update/delete、同名不同ID、NFC／补充字符、共享画像ID＋SHA、外游戏ID／原生字段／未知引用／getter拒绝、无别名和输入不变；实际41固定输入的模板profile＋真实source codec往返，缺历史／保护字段篡改／ID重用拒绝，实际完整20章profile不能使用定义历史。
- 先行用例在未接profile时返回 `COPY_PROTECTED_DELTA`，记录 `general-definitions-before.log`；这是新增能力原本被保护门阻止，不是运行规则错误。
- 原模板9组、完整20章profile和shell65回归通过，日志 `general-definitions-template.log`、`general-definitions-full-profile.log`、`general-definitions-shell.log`。语法／diff检查通过。
- 上述内容层批次没有API／数据库证明；后继API证据如下，不能用它倒改早期收据范围。各批次均未访问正式存档、生产库或解除维护门。

### 后继真实草稿API验证

- `node tools/verify_editor_template_root.mjs`：22组通过，`.dragon-analysis/editor-completion/general-definitions-root-r3.log`（r1为19组，r2补历史损坏及异步撤销为21组，r3再核普通metadata／复制章保存不传generalEdits仍保留完整定义与旧修订）。实际common Request派发、文件SQLite／FileBucket及41固定来源，种子会话为明确夹具，不冒真实登录、TCP/HTTPS或云端证明。保留此前10组中立创建／旧复制兼容；新增CRUD、同名独立ID、画像清单ID＋SHA、原键重放、确切旧修订与重启、跨作者／管理员越权、完整副本拒收、坏字段／错画像／外游戏ID、CAS冲突、前置失败请求重试成no-op的历史顺序、旧body缺字段原样重放。篡改仍存在定义的历史姓名导致保护比较拒绝，缺失旧chapterEdits拒绝；首个对象读取后撤销epoch立即401且源／修订不变。
- 空章加定义后Trial仍409 `TRIAL_SNAPSHOT_CHANGED`、发布仍拒 `PUBLISH_NOT_COMPILED`，trial_sessions／content_releases无新增；这不是可玩初始化证书。原地图／192据点定义、空章和旧源保持不变。
- `verify_vps_city_save.mjs` 原完整副本保存／角色／复制／资源／恢复72项全部通过，`general-definitions-legacy-save.log`；纯定义10组重跑通过，`general-definitions-content-r3.log`。shell65、23份DDL来源／50表49索引343列4外键schema检查通过（`general-definitions-shell-r3.log`、`general-definitions-schema.log`）。没有DDL变更或数据迁移。

API批次主动LSP两JS为push-only未确认，人物定义文档clean，审计文档仅SHA词典信息；当时session全量缓存96文件19项既有warning、23项hint/info。语法及diff检查通过，未屏蔽诊断或称全仓clean。

### 后继表单与真实HTTPS验证

- `verify_editor_definition_controller.mjs` 9组通过（`general-definition-controller-r4.log`）：定义DTO及投影隔离、无关表单输入保留、原键／原body精确重试、重载只能查询／精确重读、稳定ID更新删除、取消／换身份／迟到回包、画像ID＋SHA、无效文字／超过请求预算不发请求、损坏关联不静默丢弃、存储失败不创建。明确service ports／撤销回调夹具，不冒真实权限证明。r1暴露收据确认未恢复gameId的问题，已修复；r3是后补防护的一处缺逗号语法失败，已修复并经语法及r4全量重跑，不记通过。
- 既有草稿控制器37组、共享上下文10组、shell65项通过，日志 `general-definition-{draft-controller,context,shell}-r4.log`；真实gateway＋Vue、显式API夹具的工作台71项通过（`general-definition-workbench-r4.log`／`run-wfSv3C`）。后台壳build／check通过，只更新`server/public/shell-ui.txt`，无玩家／Trial程序束或生产部署。
- `verify_editor_template_browser.mjs r6` **8个范围组通过**，包含原5组中立创建及新增人物CRUD／恢复链；实际Node Root、文件SQLite／FileBucket、自有HTTPS、全新Chromium、真实作者登录及改密，非成功API替身。先载入实际621画像清单并选ID＋SHA；创建真实提交修订3后仅在浏览器传输处丢回应，再重载、原键查询、明确读3，仍只有一条人物和一次创建POST。`<img>`作为文字显示，无img节点。修改到4保持同ID并明确清画像；同名新建到5分配另一个ID；原生确认取消不写，确认删除到6只去掉目标人物，旧修订5仍完整；全部空章、地图及192公共据点DTO不变。作者浏览器无管理员请求、正式IDB访问、域外请求或非预期页面错误。
- r6日志：`.dragon-analysis/editor-completion/general-definition-browser-r6.{log,stderr}`（stderr为空）；收据、当前16文件SHA与截图：`.dragon-analysis/editor-phase/template-browser-r6/receipt.json`／`template.png`。r5亦8组通过，但在损坏关联／存储失败后补防护前，不用它冒当前源码证明。新保护负控为控制器夹具；r6验证保护加入后的实际正向全链，不声称真实浏览器配额故障或真实坏关联改密全链已测。

最终后台build/check逐byte一致：JS326494B、CSS33707B、8包notice；语法和diff检查通过。主动LSP六路径：1份clean、1份有正确await括号／querySelector建议、3份push-only未确认，draft.txt无服务；四文档2份clean、另2份仅SHA词典信息。session全量缓存98文件仍19项既有warning、23项hint/info，未屏蔽或称全仓clean。未改变后端／原生规则，本表单批次不重跑未受影响的完整原章编译／发布／物理删除重型链，先前API22组／恢复72项不冒成本轮新运行。

### 后继章节人物内容层验证

`verify_editor_chapter_people.mjs` 10组通过（`.dragon-analysis/editor-completion/chapter-people-after-r2.log`）：稳定ID加入／移除、同名人物隔离、included=false仍阻止删除、三字段继承／覆盖／恢复继承、画像null与缺键区分、基础修改对各章的影响、复制／删除章、source codec真实JSON往返、输入／输出无画像别名，以及未知结构／坏ID／坏画像／坏文字拒绝。访问器计数为0。实际41固定输入模板验证地图、192据点定义、compatibility及空原生章表不变；strict active门仍拒绝，未授权people候选与夹带历史命令仍被profile拒绝。先行 `chapter-people-before.log` 因新内容端口不存在而失败，是能力未实现的负控，不是运行规则错误。

既有定义10组、真实Root／文件SQLite／FileBucket 22组及shell65项回归通过（`chapter-people-general-regression-r2.log`、`chapter-people-root-regression-r2.log`、`chapter-people-shell-r2.log`）。Root测试仍是原定义API／持久历史回归与明确种子认证，不是本次人物配置HTTP接线或浏览器证明。语法检查通过。未改界面，本批不重跑原r6 HTTPS表单或无关完整战役／分发／物理删除重型链。

按web/src改动约定重建程序束：232文件，SHA `a819dc919292be29941c971740ec6eaf75516cdd11773f19caa9f70017e1ff8d`，重复构建unchanged=true；两壳SHA不变。相对本批开始只新增／更新`src/content/authoring/generaldefinitions.js`一项（`chapter-people-bundle-{before.json,delta.log}`及`chapter-people-bundle-check-r2.log`）。它不是运行入口新增调用、固定库新身份登记或生产程序兼容证书；没有部署、修改固定库身份或维护门。

本批主动LSP四路径：人物文档clean、两JS均push-only未确认，审计文档仅摘要词典提示；session全量缓存99文件仍19项既有warning、23项hint/info，未屏蔽或称全部clean。生成txt无适用LSP；以构建逐byte／源摘要核对，不能代替运行验证。语法及最终diff检查通过。

### 后继顺序校验验证

- `verify_editor_people_history.mjs` 10组通过（`.dragon-analysis/editor-completion/people-history-after-r3.log`）：实际41固定输入、复制前后相同扁平清单却不同结果、未加入引用阻删、中间时点／同一步错误顺序、章与人物出生顺序、已删除人物ID禁复用、章ID重用与后代独立、保护字段篡改、真实source codec往返及完整副本拒收。最终源仍空原生表、active三缺口，未得到运行许可。先行 `people-history-before.log` 因端口尚不存在失败；后补函数对象负控 `people-history-getters-before.log` 暴露4次getter读取，已在读op前加记录检查，r2／最终r3计数0；r3仅将负控中克隆章序的原地reverse换成等价toReversed赋值，消除新增风格告警。
- `verify_editor_template_root.mjs` 由22扩至25组，最终 `people-history-root-r2.log` 通过；实际common Request、文件SQLite／FileBucket和固定源，仍为明确种子认证，不冒HTTPS／浏览器／云。新增HTTP空／非空peopleEdits都422且无新请求记录；将更新插入人物创建前的坏历史在read、captureForCompile及save前核验全部拒绝，修订不变、无新对象；旧请求凭空增加people字段拒绝，恢复自有fixture后原no-op／旧修订／重启保持。保留旧原键／CAS／撤销及管理员完整复制覆盖。
- 既有章节人物内容10组、定义10组、shell65及schema23来源／50表49索引343列4FK通过（`people-history-content-r3.log`、`people-history-{definitions,shell,schema}-r2.log`；内容测试r3仅明确输出为旧扁平端口拒收，断言不变）。完整副本保存／资源／复制／恢复72项通过 `people-history-legacy-r2.log`。此前组合命令1800秒超时，Root r1已25组完成但legacy r1仅16项，不能当整组通过；拆开后legacy r2完整通过。其后两处新增检查仅在模板顺序端口，未改完整副本路径，不重跑未受影响的72项；最终模板／Root r2已包含该检查。

本批未改web/src／Vue／公共协议字段，无需重建两个程序束；未重跑此前HTTPS表单、完整Trial／发布／物理删除重型链，不能引用旧浏览器收据证明新people用户流程。五JS语法及最终diff检查通过。主动LSP覆盖五代码／两文档，保留drafts布尔参数warning及Root正确的await括号hint，部分push-only未确认；后续三路径复探均push-only，不能称clean。session全量缓存100文件18项既有warning、23项hint/info，未屏蔽诊断。新reverse告警已按上述等价测试改写并复跑10组。

### 后继人物配置API验证

- `verify_editor_chapter_people.mjs` 扩至13组，`chapter-people-projection-after-r1.log`：新增规范化后的精确影响、未加入继承、显式覆盖保护、一次完整投影及每行／画像独立、非法结构／getter拒绝（getter为0）；原10组保留。先行 `chapter-people-projection-before.log` 因新投影端口尚不存在失败，不是原版规则错误。
- `verify_editor_template_root.mjs` 扩至34组，`chapter-people-api-root-r1.log`：实际common Request／文件SQLite／FileBucket／41来源，保留原创建、定义、旧body、CAS、撤销与顺序历史负控；将已被新能力取代的“空／非空people一律拒绝”改为坏列表／超16项拒绝，旧历史负控改为非法null而非合法空列表。新增真实保存7→8、原键查询／重放、有效值／覆盖／完整引用DTO；外作者／管理员／完整副本及坏ID／未知规则字段／错画像拒绝。未确认、遗漏未加入章、乱序、错误字段、重复章均拒绝且无draft对象写入；精确确认8→9保留覆盖，规范化等值no-op仍9。复制在同批people修改之前捕获，删除不得跳过中间引用，included=false单独存留仍阻删；显式移除后才可删定义，最终13及旧8重启保持。坏people历史在read／captureForCompile／save前核验全部拒绝。地图、192据点、compatibility、空原生表与三个active缺口不变，Trial仍拒、release／trial无新增。认证是明确种子夹具，不冒真实登录／HTTPS／浏览器或云证明。
- 既有顺序10、基础定义10、定义控制器9、草稿控制器37、共享上下文10、shell65及schema检查通过，日志 `chapter-people-api-{history,definitions,definition-controller,draft-controller,context,shell,schema}-r1.log`。完整副本保存／复制／资源／隔离恢复72项重新通过 `chapter-people-api-legacy-r1.log`。没有DDL变更。
- 重建原生程序束232文件，SHA `6720912547cebc9bb1cd1693da5ce5eea5add55443b55c482195d68a90a28aaf`，重复构建unchanged=true；两壳摘要不变，未登记新固定库身份或改变维护门。构建只收录当前共同helper，不代表运行入口启用人物配置；API验证和内容验证不冒同引擎可玩初始化。首个构建组合命令因前置文档搜索无匹配退出而未执行构建，随后独立执行并复核成功。

四JS语法及diff检查通过。末次独立摘要核签首尝试的临时正则把边界转义变成退格而误拒已通过的控制器日志，未生成收据；改用逐行精确匹配后复核，不改产品或测试期望。首次主动LSP四JS均push-only未确认；最终六路径3份clean、3份有诊断：drafts既有布尔参数warning、Root测试正确await括号hint、审计文档摘要词典信息。session全量缓存100文件18项既有warning、23项hint/info，未屏蔽或称全仓clean。额外开发期Jev只发送已人工核对的1389B无源码／凭据／用户资料摘要；preview保留，实时请求返回HTTP451地区不可用，未绕过，也不将其当验证通过或放行条件（`chapter-people-api-advisory*`）。

上述API批次未改Vue或draft控制器，未重跑旧r6浏览器，也不以其证明人物配置用户流程。当时基表影响确认与人物配置表单尚未接界面，后继进展见下文；这两项不再作为当前未实施项。能力、真实原生初始化、任职／兼容引用的完整删除检查、导入记录转定义以及资源正文／Trial／发布闭包仍开放。没有提交、推送、部署或改变运行门。

### 后继原章武将能力只读展示

原章武将表新增独立「能力（唯讀）」列，展开后显示已读章修订的武術／統率／政治、攻城／野戰／水戰高四位及专长低位字符串。取数仍走既有精确修订草稿GET，不新建端点，不读最新源或原文件。`PrivateDrafts.read`从已核来源提供独立ability投影及`specialtyLowBits`；不改保存命令、profile、历史、身份或运行准入。

控制器在响应边界核六个整数表示值（前三项0..255，三专长0..15）与显式低位三字符小写hex；这只是已读DTO格式，不是可编辑／可玩域。缺能力或低位的旧DTO分别显示未知，不补零／000，不根据高位推原byte；坏回应原子拒绝并保留旧表。发布给Vue的能力对象独立复制，改展示模型不能污染已读快照；身份清除沿原路径清私有行。界面无能力输入／保存按钮，切章重建展开项；原改名／画像／任官及G127说明保持。

证据目录 `.dragon-analysis/editor-completion/general-ability-view-20261029/`：

- `controller.log`：只读控制器11项通过，含0／255／128与低位216、展示对象隔离、坏数值／坏低位原子拒绝及旧字段缺失保持。
- `service.log`：既有`verify_vps_city_save.mjs --native-only`完整24项通过，新增逐条对照20章2560将的保存源能力与低位（当前固定源低位缺失即null）；原3840城、修订2／3、旧历史及对象数保持检查继续通过。真实自有文件SQLite／FileBucket与草稿服务，身份／来源端口为明确夹具，不冒HTTP登录或浏览器服务全链。
- `browser.log`及最终`browser-r2.log`：工作台229组通过，真实Vue／gateway／新隔离profile但API为明确夹具。展开显示完整数值，切到缺字段章不显示上一章值、显示未知，切回无额外GET／POST且无能力写控件。末轮只将能力放到独立列，重新build／check／工作台与shell65通过；非真实后端HTTP能力表联测。
- 582项选定源码／输入固定前后SHA；首轮与最终轮分开保留，不拼接构建前后成绩。四JS语法通过。没有改玩家／Trial源码，不重建原生束；仅后台壳随Vue重建。完整能力编辑、低位来源迁移、新将初始化及原生引用闭包仍未完成。

主动LSP五份代码未确认（超时／push-only），两文档仅既有词典信息；TXT由实际加载执行与后台构建校验，不能拿无服务当clean。限定mode=all为4条既有风格warning（测试日志与服务布尔参数）及31条hint（含夹具条件展开、正确await括号与词典项），未屏蔽，不称诊断全清。没有因只读展示扩大既有原始字段的合法运行域。

### 后继能力只读表真实HTTPS验证

复用 `verify_editor_backend_stage_ui.mjs 107 --generals-only`（`EDITOR_TEST_NODE=1`），不新增服务／路由或能力写入。真实管理员登录／改密、固定来源完整20章副本、自有文件SQLite／FileBucket和HTTPS、新Chromium profile，成功API无替身。既有改名、共享画像绑定／清除、提交后丢回应的原键恢复、真实412、另一作者隔离及改密401清私有投影继续执行。

最终**12个范围组通过**（原8＋4）：分别在明确读取修订1／2／3／4后，对照真实HTTP DTO核首章全部128行六项能力与低位未知文本；能力详情无写控件，展开／折叠零API请求。原4次浏览器保存仅改名、绑定、清除及故意冲突，无能力写入；既有全章投影比较和旧修订保持仍通过。没有测试合法低位新来源或高值真实发行，不开放原生能力编辑，也不冒完整20章界面遍历／全部Trial／发布验收。

证据 `.dragon-analysis/editor-completion/general-ability-https-20261029/`：`tests-r2.log`／`result.json`、584项选定输入前后SHA保持，39项入口源码指纹及 `backend-stage-ui-session-r1/ui-r107.png` 绑定收据；errors／outside为空、正式IDB访问0。首轮r106在服务启动时因HUD消费者指纹不符失败，保留`tests-r1.log`；原因是前批纯注释改动未迁移库身份，已仅撤回那一行自有修改，不覆盖其它HUD改动、不放宽指纹门。旧注释的“原版复刻”声明在[详细维护源](editor-ability-import.md#后继专长对白调用入口核对)明确标废。原生束随撤回重建两次一致，237条源码内容／长度／SHA复核，固定库20个消费者全部匹配，两壳与库未改。后台壳无需重建。

两JS语法及限定diff／新增链接检查通过。主动LSP两代码push-only未确认，三文档仅3条既有词典提示；mode=all另有测试既有布尔参数1条warning及13条风格hint，不称诊断全清。无提交／推送／部署。

### 后继中立引用与删除顺序当前复核

当前内容入口 `verify_editor_chapter_people.mjs` **13组**、受信顺序入口 `verify_editor_people_history.mjs` **12组**完整通过，两者各绑定41项固定来源，getter执行数均0。证据 `.dragon-analysis/editor-completion/neutral-reference-history-20261029/` 的 `people-r1.log`／`history-r1.log` 及前后清单记录524项选定源码／内容输入SHA保持；未改产品或测试。

复核重点：最后仅剩included=false引用仍拒删；显式移除全部引用后才能删定义，同名不同ID及其引用保持。复制章保留复制时覆盖，后续基表继承与覆盖独立；相同扁平操作列表但不同顺序不能互相授权。先删定义、后移除引用不能被最终结果掩盖；删除章与删除定义按各步写入顺序校验，人物ID已使用历史不能随删除消失。真实JSON往返后受信摘要保持，中立原生空表和未可玩缺口仍保留。

同时核读现行Vue、`draft.txt`的`submitDefinition`和共同`generaldefinitions.js`：界面跨章清单只是展示；删除使用同次已读`generalReferences`，未知拒绝、任一引用先于确认／POST拒绝，确认后复核身份／载入及表单对象，按已读修订提交。该源码核对不是新的控制器／浏览器／服务端CAS执行证书；已有真实接口与浏览器证据仍各守上述历史范围。本批只执行固定来源只读／内存内容检查，不读真实存档或使用数据库、网络，未扩展到原生任职／事件引用或可玩初始化。

### 后继基表影响清单确认

`draft.txt` 在同一次精确修订读取中核对 `generalReferences`：每个定义恰有一行、引用章存在且按章序唯一、included为boolean、继承／覆盖字段为三字段的互斥完整分区。校验失败不替换先前上下文；旧DTO缺少清单属于未知，不允许更新／删除已有定义，不当成无引用。所有含未加入配置的引用都阻止删除，错误列出章节而不自动清理。

保存基础定义时，先规范化输入，再按实际变化字段与继承字段求交集。原生确认框逐章展示名称、稳定章ID和受影响字段，明确包含未加入配置及显式覆盖不变；取消不建journal、不POST。确认后再核对身份、generation、载入对象与表单对象，才把精确 `confirmedImpacts` 纳入既有原键／原body保存；未知回应后的查询与重试不能重算清单。后端仍独立核验权限、CAS和影响，浏览器确认不是权限凭据。

- `verify_editor_definition_controller.mjs` 12组通过（`general-impact-controller-r2.log`），保留旧9组并新增逐章字段、未加入／覆盖、取消、原body含确认重试、未知／坏清单及身份／上下文重入拒绝。草稿37、共享上下文10、shell65通过（`general-impact-{draft,context,shell}-r1.log`）。控制器为明确端口夹具，不冒真实鉴权。
- `verify_editor_template_browser.mjs r7` 10个范围组通过，实际Node Root、文件SQLite／FileBucket、自有HTTPS、真实作者登录和全新Chromium；保留原8组。用明确的真实API设置一条未加入章节配置至修订7（不是章节表单），随后由已有Vue基表触发原生确认：取消无POST，接受带精确章／字段清单提交8，有效继承值同步而included仍false；引用删除在POST前拒绝，地图／192据点／原生空槽表不变。无正式IDB／域外／非预期页面错误。日志 `general-impact-browser-r7.{log,stderr}`，收据／16份源码SHA及截图在 `.dragon-analysis/editor-phase/template-browser-r7/`。首次启动命令使用错误data-URL loader基址，在测试模块运行前失败，保留 `general-impact-browser-loader.stderr`；改用绝对file URL后运行通过，不记首次为通过。

本次只改控制器与隔离测试，Vue编译产物、原生程序束、后台规则未变，未重跑未受影响的72项存储恢复或34组Root旧矩阵。语法与diff检查通过；该批次章节配置表单尚未接入，后继见下节，以上不构成可玩初始化或完整编辑器验收。主动LSP五路径1份clean、1份push-only未确认、draft.txt不支持，浏览器测试保留正确await括号／querySelector建议，审计文档保留SHA词典信息；session全量100文件仍18项既有warning、23项hint/info，未屏蔽或称全仓clean。最终独立核对r7全部16份源码SHA、截图SHA、10组收据与空stderr／错误／域外清单通过（`general-impact-static.log`）。

### 后继章节加入／移除界面

`GeneralDefinitionsPanel.vue` 新增章选择、稳定人物ID选择、明确加入／保留未加入配置／移除此章配置。显示当前有效姓名、字、画像以及继承／覆盖字段；该批次覆盖暂为只读；后继已接[恢复继承](#后继逐字段恢复继承)、[姓名／字覆盖](#后继姓名字覆盖输入)及[头像覆盖](#后继章头像覆盖选择)，不以此历史描述撤销已交付功能。切换included时从已校验配置保留原overrides；新配置显式空overrides、factionId=null。移除只去掉选中章配置，保留基础定义，不代表死亡。以上为创作配置，不构造原生槽、势力、能力或初始化默认值。

`draft.txt` 原子校验chapterPeople与基础定义、generalReferences及章序：完整章集合、唯一人物、无未知字段／势力、规范化覆盖、有效值等于基表＋覆盖、继承分区及全部引用对应；坏投影不能替换旧上下文，缺字段为未知并禁止配置操作。原生确认后重核身份、generation、章选择、loaded及基表输入对象。命令沿用唯一草稿journal、精确修订／原键／原body，创建及重试前都要求成功保留关联；提交后须明确重读收据修订。配置保存不会提交或清除另一表的脏metadata／基表输入。所有投影均复制，不将Vue作为源权威。

- 定义控制器扩至15组，草稿37、共享上下文10、shell65通过（`.dragon-analysis/editor-completion/people-ui-{controller,draft,context,shell}-r1.log`）；新增保留非空覆盖／其它脏输入、原键重试、投影别名、未知／错误有效值／漏引用、取消／换身份／换游戏／存储失败无写。明确端口夹具不冒真实权限证明。
- `verify_editor_template_browser.mjs r8` **13组通过**，实际Root／文件SQLite／FileBucket／自有HTTPS／真实登录／新Chromium，原r7范围保留；原API设置配置被真正Vue操作取代。取消不POST；未加入配置实际提交7后丢传输回应，重载查原键／读7只有一次配置POST。影响确认提交8、含未加入引用阻删仍通过；加入9→未加入10→移除11均由界面保存和精确重读，最终基础定义、旧7、共享地图及原生空表保持。覆盖非空保留仅控制器夹具验证，本轮浏览器配置为空覆盖，不夸大为覆盖编辑验证。无正式IDB／域外／非预期页面错误。产物 `.dragon-analysis/editor-phase/template-browser-r8/{receipt.json,template.png}`、日志 `people-ui-browser-r8.{log,stderr}`。
- 既有gateway＋Vue、显式API夹具工作台71项通过 `people-ui-workbench-r1.log`。后台build／check逐byte一致，JS334704B、CSS33707B、8包notice；首次用了不存在的tools构建脚本，未运行构建，保留 `people-ui-build-r1.log`；按editor-ui/package.json改用 `node build.mjs`／`--check` 后通过 `people-ui-build-r2.log`、`people-ui-build-check.log`。

仅更新控制器、Vue、隔离测试及其壳产物；无后台／原生程序束变化，不重复未受影响的72项存储恢复或34组Root矩阵。该批次覆盖／恢复继承表单尚未完成（恢复继承后继见下节）；能力、角色／初始化、全删除引用及资源／Trial／发布等闭包仍开放。没有提交、推送或部署。主动LSP六路径1份clean、3份push-only未确认、draft.txt不支持，审计文档仅SHA词典信息；session全量100文件18项既有warning、23项hint/info，未屏蔽或称全部clean。语法及diff检查通过，r8收据／16源码SHA／截图SHA与无非预期错误独立复核记录在 `people-ui-static.log`。

### 后继逐字段恢复继承

章人物配置表为每个已覆盖字段提供「恢复继承」按钮。`draft.txt` 仅接受姓名／字／画像且必须存在覆盖，确认后删除选定覆盖键，不把基表值复制成新的覆盖，不清除其它覆盖或改变included／factionId。画像恢复继承与写入null不同。沿用已核验修订、确认返回上下文检查、唯一journal／原键原body及精确重读；服务收到的仍是既有people set命令，没有新增API或运行规则。此批设置新覆盖的输入表单尚未完成；后继姓名／字及头像覆盖入口见下文。

- 控制器17组通过（`people-inherit-controller-r1.log`）：三个字段分别恢复，保持未加入和其它覆盖，取消无写、原body重试、无覆盖／未知字段及确认期间身份变化拒绝；原15组保留。草稿37、上下文10、shell65、gateway＋Vue夹具工作台71通过 `people-inherit-{draft,context,shell,workbench}-r1.log`。
- 实际HTTPS `verify_editor_template_browser.mjs r10` 14个范围组通过，原13组保留。通过真实API准备修订12的三字段覆盖（不是新覆盖表单证明），随后每个恢复按钮先原生取消再确认，修订13／14／15逐项删除覆盖并继承当前基表，未加入状态、其它覆盖、基础定义及旧12保持；画像最后继承当前null，字继承之前已改的「新字」而非最初值。无正式IDB／域外／非预期页面错误。产物 `.dragon-analysis/editor-phase/template-browser-r10/{receipt.json,template.png}`，日志 `people-inherit-browser-r10.{log,stderr}`。
- r9恢复流程已走过，但最终权限检查用的初始化管理员会话过期而返回401，不是预期404，整组失败记录保留 `people-inherit-browser-r9.stderr`。测试改为末尾真实重新登录管理员再核owner隔离，未延长会话或修改认证规则；r10完整重跑通过。

后台build／check逐byte通过（`people-inherit-build-r1.log`、`people-inherit-build-check.log`）；没有原生程序束、后端、数据库或维护门变化，不重复未受影响的存储恢复／原章编译重型链。语法与diff检查通过；完整编辑器目标仍未完成，无提交、推送或部署。主动LSP六路径1份clean、3份push-only未确认、draft.txt不支持，审计文档仅摘要词典信息；session全量100文件仍18项既有warning、23项hint/info，未屏蔽或称全仓clean。独立核对14组收据、7次人物配置POST、17组控制器、16源码SHA及截图／空stderr通过（`people-inherit-static.log`）。

### 后继姓名／字覆盖输入

章人物表提供「設定本章姓名／字」按钮：原生输入框以当前有效值起填，取消不写；通过既有文字校验与NFC规范化后，再确认仅改本章所选字段。字允许明确空字符串，与删除覆盖键恢复继承不同；姓名不能空白。输入框和确认框返回后均复核身份、已载入对象、章选择及表单对象。其它覆盖、included、基表和未保存的其它输入不变；仍使用原people set协议、16KiB预算、唯一journal／原键原body及确认后的精确重读。头像覆盖输入不在此批。

- 控制器20组通过 `people-text-controller-r2.log`：两字段规范化／空字、保留未加入与其它覆盖、未知回应原body重试、取消、坏字元、身份／上下文变化无journal。先行缺能力负控 `people-text-before.log` 保留；r1有一个测试误以为busy期间setField能切章，实际既有守卫已拒绝，改用真实adoptGame上下文端口后通过，没有放宽产品守卫。
- 草稿37、上下文10、shell65及gateway＋Vue工作台71通过 `people-text-{draft,context,shell,workbench}-r2.log`；后台build／check逐byte通过，无原生程序束／后端／schema改动。
- 实际HTTPS／NodeRoot／文件SQLite／FileBucket／新浏览器 `r11` 15组通过，原14组保留。新增两字段原生输入取消、二次确认取消均无POST；确认姓名修订16为NFC「章é」，字修订17明确空字符串，恢复字继承18得到当前基表「新字」。其它覆盖、未加入、基表及旧15不变，共10次人物配置POST；无正式IDB／域外／非预期页面错误。收据与截图 `.dragon-analysis/editor-phase/template-browser-r11/`，日志 `people-text-browser-r11.{log,stderr}`。不是头像覆盖输入、可玩初始化或完整Trial／发布证明。

语法与diff检查通过；不重跑未受影响的72项存储恢复／34组Root矩阵，不将旧成绩冒新范围。完整目标仍未完成，无提交／推送／部署。

### 后继章头像覆盖选择

章人物表的独立命令选择器只列已读取的共享头像ID；控制器从私有清单捕获ID＋SHA，不接受作者输入SHA、任意ID、图片URL或上传。每次选择立即回到占位项，再原生确认保存，取消不会显示未保存选择。明确清空保存 `portraitRef:null`，恢复继承删除该覆盖键；两者不同。保留其它覆盖、未加入状态及基表，复用既有people set、16KiB预算和唯一journal／原键原body，不引入运行槽或初始化规则。

- `people-portrait-before.log` 记录入口尚未实现的负控；控制器22组通过 `people-portrait-controller-r2.log`：捕获清单而非可变显示对象、原body重试、null清空、未读清单／未知ID／对象伪装拒绝、取消及确认期间身份／上下文变化无写。
- 草稿37、上下文10、shell65、gateway＋Vue工作台71通过 `people-portrait-{draft,context,shell,workbench}-r1.log`；后台build/check逐byte通过。没有后端、原生束或schema改动，不重复无关72项恢复／34组Root矩阵。
- 实际HTTPS／NodeRoot／文件SQLite／FileBucket／全新浏览器 `r12` 16组通过，原15组保留。清单621项；取消选择无POST且选择器回到占位项；确认ID＋SHA写修订19，明确清空20保留null覆盖，恢复继承21删除覆盖键。姓名覆盖、未加入、基表及旧18不变，共13次人物配置POST；无正式IDB／域外／非预期页面错误。收据／截图 `.dragon-analysis/editor-phase/template-browser-r12/`，日志 `people-portrait-browser-r12.{log,stderr}`。

这仅闭合已开放三字段的章配置输入，不是完整人物全字段、势力／出场／初始化、资源闭包或Trial／发布验收。语法与diff通过，无提交／推送／部署。

### 后继重复章节身份拒收

`draft.txt` 在采纳草稿DTO之前检查章节ID唯一性；即使章节人物列表全空或旧DTO未带投影，也不能接受重复ID。拒绝整次读取，保留之前的章节、人物、基础定义及修订上下文，不写journal。它是编辑源身份校验，不是运行槽或原版机制更改。

负控 `chapter-identity-before.log` 复现此前无错误的接受；加门后 `chapter-identity-after.log` 控制器18组通过，覆盖有空投影／无投影两种回包和原状态不变。草稿37、共同上下文10、shell65、gateway＋Vue工作台71通过（`chapter-identity-{draft,context,shell,workbench}.log`）；语法／diff通过。仅校验分支及控制器测试变化，没有Vue或程序束变更；未重复真实后端重型r10链，r10仍只证明其记录源码。完整目标未完成，无提交／推送／部署。

### 后继章节复制隔离与操作键写入失败

普通资料／资源保存及章节命令现与人物保存一致：首次操作必须先成功持久化原键关联，否则不POST、不保留一个从未发送的pending，原输入仍在。所有原请求重试也须成功保留关联；失败保留原RAM body／key及已查得状态，不另起键。这里不扩展存储内容，仍只保存gameId／revision／key，不保存作者正文，也不改变后端CAS、权限或历史收据。

- `chapter-copy-journal-before.log` 两项新增测试先失败，证明原资料初发／重试在存储故障后仍调用API。修复后草稿控制器39组通过 `chapter-copy-journal-after.log`，分别覆盖资料及章节的初发拒绝、重试拒绝、恢复存储后仍用原键／body／修订；人物控制器22、共享上下文10、shell65、gateway＋Vue工作台71通过 `chapter-copy-{definitions,context,shell,workbench}.log`。存储配额故障为注入控制器端口，不冒充浏览器原生配额耗尽测试。
- 实际HTTPS／NodeRoot／文件SQLite／FileBucket／全新浏览器 `r15` 共17组通过；此前16组保留。实际章节面板复制21→22，服务提交后仅浏览器响应被丢弃，查询原键／明确读22恢复，复制仅一次POST。副本保留同一人物ID、未加入及姓名覆盖；界面只改副本姓名23，父章／基表不变；删除先取消无写，再确认24，只删子章及其配置。共享人物、父章引用、192据点、地图及旧21／22精确读取不变，章节POST共2、人物配置POST共14。没有用成功API夹具代替这些界面动作。
- `r13` 在切换章节面板时超时，`r14` 确认实际被复制模块保留输入的离开提示拦住，但测试只认识另一类提示而失败；均保留stderr，不算通过。测试后继显式接受这类原生离开确认（r15共3次），不修改产品导航、自动保存或取消操作策略。新导航断言错误在测试主流程抛出以便finally关闭自有浏览器／服务。

产物为 `.dragon-analysis/editor-phase/template-browser-r15/{receipt.json,template.png}`；`chapter-copy-static.log/json` 独立复核17份当前源码SHA、截图SHA、17组／2次章POST／14次people POST及空stderr。语法／diff通过。此批只改原生控制器与测试，无Vue源码、后端或原生束变化，不需要重建壳或重复未受影响的Root／存储恢复矩阵。仍不证明空章初始化、完整地图编辑、Trial／发布或整个目标完成；未提交／推送／部署。

## 后继共享画像读取期间的停用与到期拒收

复核既有 `EditorRoot.principal`：每次重新查询会话及账户，并检查disabled、epoch、absolute_until、idle_until。编辑器预览字节出口和Trial的共享画像相对路径，在读取成功或抛错后均重新调用此权限门；本批不改变产品代码或权限政策。

复用 `verify_editor_template_root.mjs --portrait-epoch-only`，将原四个字节读取epoch用例扩为 **4种边界×2条路径×成功／失败读取＝16例**：epoch递增、账户disabled置1、会话绝对期限置0、空闲期限置0。每例创建独立测试账户／会话，读取回调在返回或抛错之前写入对应SQL状态；不同边界独立，不靠同时增加epoch掩盖其它检查。两条路径为 `/api/games/:id/portraits/:id/bytes?sha256=…` 和 `/api/trial/web/kao/:id.png`。

每例迟到响应及随后的同会话请求均须401 `SESSION_INVALID`，读取次数保持1（第二请求不再进入reader）；读取回调留下的账户／会话行全文保持，不恢复期限、停用或epoch，全部游戏元数据不变。它验证现有门的拒收优先级，不测试真实管理员停用操作，也不使用墙钟等待模拟8小时到期。

`.dragon-analysis/editor-completion/portrait-authority-root.log` 首轮 **28组通过**（原16＋12），记录完整 `byteDenials` 16例；原实际Node适配器0／p0001字节、SHA／长度／头、坏参数／坏字节、画像使用读取失败、删除栅栏及使用读取epoch回归仍保。共同Request及文件SQLite是真实，账户／会话、reader结果及权限变更时机是明确夹具；没有安装源、实际登录、HTTPS、浏览器、物理删除或完整权限矩阵证明。

10项执行前输入摘要及最终复核见 `portrait-authority-input-hashes.json`／`portrait-authority-final-hashes.json`。仅既有测试与文档变化，不重建不变的两束或重复无影响保存／Trial启动／发布／规则长链；主动LSP未确认项保留，A16／A29／A32仍按各自完整验收范围处理。

## 后继原章武将表本地查找

`GeneralsPanel.vue` 新增当前已读章的姓名／字／槽号／来源记录ID子串筛选，trim且不分大小写，保留原行序和原槽号。筛选不参与保存正文、角色资格或跨章人物身份判断，不自动选择结果。切章保留查找文字并重新筛选该章，换游戏或身份退出清除文字；未读或忙时禁用。显示符合／总数和无匹配提示，独立清除恢复全部行。势力表、画像选择器及共用草稿输入不被筛选改变。

复用 `verify_editor_workbench_browser.mjs`：加入一组来源ID大小写／空白、姓名、字、槽127、切章无匹配及返回、清除恢复原序、特殊文字无HTML注入、其它表单保留和零额外请求检查；后继既有换游戏步骤再核查找文字清除／未读禁用。G127即使符合查找仍显示保留槽说明，不获得普通任官资格。fixture给保留槽增加测试用字号，不是原数据变更。

`general-filter-browser.log` 首轮225组通过；补换游戏断言并固定7输入后，`general-filter-browser-r2.log` 仍 **225组通过**，产物 `.dragon-analysis/editor-workbench/run-OXfuBO/result.json`，errors／unexpected／failed为空；既有expectedTrialErrors夹具单独记录。实际Vue／gateway、新Chromium和明确API夹具，不冒真实认证HTTP或规则验证。Vue build／check字节一致、shell65、MJS语法、diff及链接通过；支持文件主动诊断与输入指纹见 `general-filter-final-hashes.json`，代码push-only未确认不称clean。

仅Vue、既有工作台测试、生成壳和文档改变，没有新增控制器／服务／原生规则或图片；不重建原生束、不重复无影响保存HTTPS／Trial／发布／规则长链。完整字段编辑、原生初始化及A15／整个编辑器仍未完成。
